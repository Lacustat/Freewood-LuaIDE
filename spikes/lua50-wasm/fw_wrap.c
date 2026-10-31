/* SPDX-License-Identifier: GPL-3.0-or-later  Copyright (C) 2026 Lacustat
 * INHALT / CONTENTS: Host-Schnittstelle fw_open/fw_run/fw_out/fw_alloc um Lua 5.0 · host interface around Lua 5.0 */
#include <string.h>
#include <stdlib.h>
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"
static char buf[65536]; static int len = 0; static lua_State *L = 0;
static int fw_print(lua_State *S) {
  int n = lua_gettop(S), i;
  for (i = 1; i <= n; i++) {
    size_t l; const char *s = luaL_checklstring(S, i, &l);
    if (i > 1 && len < (int)sizeof buf) buf[len++] = '\t';
    if (len + (int)l < (int)sizeof buf) { memcpy(buf + len, s, l); len += (int)l; }
  }
  if (len < (int)sizeof buf) buf[len++] = '\n';
  return 0;
}
__attribute__((export_name("fw_open"))) void fw_open(void) {
  if (L) lua_close(L);
  L = lua_open(); len = 0;
  lua_baselibopen(L); lua_tablibopen(L); lua_strlibopen(L); lua_mathlibopen(L);
  lua_register(L, "print", fw_print);
}
__attribute__((export_name("fw_run"))) int fw_run(const char *code) {
  len = 0;
  int st = luaL_loadbuffer(L, code, strlen(code), "=input") || lua_pcall(L, 0, 0, 0);
  if (st) { size_t l; const char *m = lua_tostring(L, -1); l = m ? strlen(m) : 0; if (l > 4000) l = 4000; memcpy(buf, m, l); len = (int)l; lua_pop(L, 1); }
  return st;
}
__attribute__((export_name("fw_out"))) const char *fw_out(void) { buf[len < (int)sizeof buf ? len : (int)sizeof buf - 1] = 0; return buf; }
__attribute__((export_name("fw_alloc"))) char *fw_alloc(int n) { return malloc(n); }
