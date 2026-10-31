/* SPDX-License-Identifier: GPL-3.0-or-later  Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Austausch-Puffer · I/O buffer     (Werte als Bytes zwischen Lua und JS · values as bytes between Lua and JS)
 *   [S2] Host-Funktionen · host functions   (registrierte JS-Funktionen als Lua-Globals · registered JS functions as Lua globals)
 *   [S3] Exporte · exports                  (fw_open, fw_run, fw_set, fw_get, fw_set_limit, ...)
 *
 * DE: Hülle um Lua 5.0. Format der Werte im Puffer: 1 Byte Tag (0 nil, 1 bool, 2 Zahl als double,
 *     3 Text mit u32-Länge, 4 sonstiger Typ als Typname). Eine Liste = u8 Anzahl + Werte.
 * EN: wrapper around Lua 5.0. Value format in the buffer: 1 tag byte (0 nil, 1 bool, 2 number as
 *     double, 3 string with u32 length, 4 other type as type name). A list = u8 count + values.
 */
#include <string.h>
#include <stdlib.h>
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

#define IOSIZE 65536
static unsigned char io[IOSIZE];
static lua_State *L = 0;
static long step_limit = 0, steps = 0;
static char out[IOSIZE]; static int outlen = 0;

__attribute__((import_module("env"), import_name("host_call"))) extern int host_call(const char *name, int len);

// ===== [S1] Austausch-Puffer · I/O buffer =====

static int put_value(lua_State *S, int idx, int pos) {
  int t = lua_type(S, idx);
  if (pos + 16 > IOSIZE) return -1;
  switch (t) {
    case LUA_TNIL: io[pos++] = 0; break;
    case LUA_TBOOLEAN: io[pos++] = 1; io[pos++] = (unsigned char)lua_toboolean(S, idx); break;
    case LUA_TNUMBER: { double d = lua_tonumber(S, idx); io[pos++] = 2; memcpy(io + pos, &d, 8); pos += 8; break; }
    case LUA_TSTRING: {
      size_t l = lua_strlen(S, idx); const char *s = lua_tostring(S, idx);
      if (pos + 5 + (int)l > IOSIZE) return -1;
      io[pos++] = 3; unsigned int n = (unsigned int)l; memcpy(io + pos, &n, 4); pos += 4; memcpy(io + pos, s, l); pos += (int)l; break;
    }
    default: {
      const char *s = lua_typename(S, t); size_t l = strlen(s);
      io[pos++] = 4; unsigned int n = (unsigned int)l; memcpy(io + pos, &n, 4); pos += 4; memcpy(io + pos, s, l); pos += (int)l;
    }
  }
  return pos;
}
static int get_value(lua_State *S, int pos) {
  int tag = io[pos++];
  switch (tag) {
    case 0: lua_pushnil(S); break;
    case 1: lua_pushboolean(S, io[pos++]); break;
    case 2: { double d; memcpy(&d, io + pos, 8); pos += 8; lua_pushnumber(S, d); break; }
    default: { unsigned int n; memcpy(&n, io + pos, 4); pos += 4; lua_pushlstring(S, (const char *)io + pos, n); pos += (int)n; }
  }
  return pos;
}

// ===== [S2] Host-Funktionen · host functions =====

static int trampoline(lua_State *S) {
  const char *name = lua_tostring(S, lua_upvalueindex(1));
  int n = lua_gettop(S), i, pos = 1;
  io[0] = (unsigned char)n;
  for (i = 1; i <= n; i++) { pos = put_value(S, i, pos); if (pos < 0) return luaL_error(S, "argument too large for host call"); }
  int r = host_call(name, pos);
  if (r < 0) { int el = -r < IOSIZE ? -r : IOSIZE - 1; io[el] = 0; return luaL_error(S, "%s", (const char *)io); }
  int cnt = io[0]; pos = 1;
  for (i = 0; i < cnt; i++) pos = get_value(S, pos);
  return cnt;
}
static int fw_print(lua_State *S) {
  int n = lua_gettop(S), i;
  for (i = 1; i <= n; i++) {
    size_t l; const char *s = luaL_checklstring(S, i, &l);
    if (i > 1 && outlen < IOSIZE - 1) out[outlen++] = '\t';
    if (outlen + (int)l < IOSIZE - 1) { memcpy(out + outlen, s, l); outlen += (int)l; }
  }
  if (outlen < IOSIZE - 1) out[outlen++] = '\n';
  return 0;
}
static void count_hook(lua_State *S, lua_Debug *ar) {
  (void)ar; steps += 1000; /* hook fires every 1000 VM instructions */
  if (step_limit > 0 && steps > step_limit) { lua_sethook(S, 0, 0, 0); luaL_error(S, "script exceeded the instruction limit"); }
}

// ===== [S3] Exporte · exports =====

__attribute__((export_name("fw_io"))) unsigned char *fw_io(void) { return io; }
__attribute__((export_name("fw_out"))) const char *fw_out(void) { out[outlen] = 0; return out; }
__attribute__((export_name("fw_out_len"))) int fw_out_len(void) { return outlen; }
__attribute__((export_name("fw_out_clear"))) void fw_out_clear(void) { outlen = 0; }
__attribute__((export_name("fw_alloc"))) char *fw_alloc(int n) { return malloc(n); }
__attribute__((export_name("fw_set_limit"))) void fw_set_limit(int n) { step_limit = n; }

extern int fw_maxups, fw_loopclose;
extern void fw_setstringmeta(lua_State *L, int idx);
/* ClassicAPI-Verhalten ein/aus: String-Methoden, 60 Upvalues, Schleifenvariable je Durchlauf.
   Nach fw_open aufrufen. · ClassicAPI behaviour on/off; call after fw_open. */
__attribute__((export_name("fw_classic"))) void fw_classic(int on) {
  fw_maxups = on ? 60 : 32; fw_loopclose = on ? 1 : 0;
  if (on) {
    lua_pushstring(L, "__fw_strmt"); lua_newtable(L);
    lua_pushstring(L, "__index"); lua_getglobal(L, "string"); lua_rawset(L, -3);
    lua_pushvalue(L, -1); lua_insert(L, -3);          /* tbl key tbl -> keep copy */
    lua_rawset(L, LUA_REGISTRYINDEX);                  /* registry[key] = tbl */
    fw_setstringmeta(L, -1); lua_pop(L, 1);
  } else fw_setstringmeta(L, 0);
}

__attribute__((export_name("fw_open"))) void fw_open(void) {
  if (L) lua_close(L);
  fw_setstringmeta(NULL, 0); fw_maxups = 32; fw_loopclose = 0;
  L = lua_open(); outlen = 0;
  lua_baselibopen(L); lua_tablibopen(L); lua_strlibopen(L); lua_mathlibopen(L);
  lua_register(L, "print", fw_print);
}
__attribute__((export_name("fw_register"))) void fw_register(const char *name) {
  lua_pushstring(L, name); lua_pushcclosure(L, trampoline, 1); lua_setglobal(L, name);
}
/* Führt Quelltext aus. Rückgabe 0 = ok (Ergebnisse im Puffer), sonst Fehlermeldung als Text im Puffer. */
__attribute__((export_name("fw_run"))) int fw_run(const char *code, const char *chunk) {
  int base = lua_gettop(L), st, n, i, pos = 1;
  steps = 0;
  st = luaL_loadbuffer(L, code, strlen(code), chunk);
  if (!st) { if (step_limit > 0) lua_sethook(L, count_hook, LUA_MASKCOUNT, 1000); st = lua_pcall(L, 0, LUA_MULTRET, 0); lua_sethook(L, 0, 0, 0); }
  if (st) {
    size_t l; const char *m = lua_tostring(L, -1); l = m ? strlen(m) : 0; if (l > IOSIZE - 2) l = IOSIZE - 2;
    if (m) memcpy(io, m, l); io[l] = 0; lua_settop(L, base); return st;
  }
  n = lua_gettop(L) - base; if (n > 200) n = 200;
  for (i = 1; i <= n; i++) { pos = put_value(L, base + i, pos); if (pos < 0) { pos = 1; n = 0; break; } }
  io[0] = (unsigned char)n; lua_settop(L, base); return 0;
}
__attribute__((export_name("fw_set"))) void fw_set(const char *name) { get_value(L, 0); lua_setglobal(L, name); }
__attribute__((export_name("fw_get"))) int fw_get(const char *name) { int r; lua_getglobal(L, name); r = put_value(L, -1, 0); lua_pop(L, 1); return r; }
