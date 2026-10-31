/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Kennungen · refs ....... Format der Werte zwischen Lua und Host (+ CLASSIC_HELPERS)
 *   [S2] buildPrelude ........... erzeugt das Lua-Programm, das die simulierte WoW-Welt in der VM aufbaut
 *
 * DE: Das Prelude läuft IN der Lua-VM (eigener Interpreter oder echte Lua-5.0-VM) und baut Frames,
 *     Skript-Verwaltung, Timer-Handles und die API-Funktionen auf. Der Host (world.ts) sieht nur
 *     primitive Werte; Frames/Funktionen/Tabellen werden als Kennung übergeben:
 *       "\1F<id>:<Typ>:<Name>" Frame · "\1H<n>" Funktion · "\1T" andere Tabelle.
 *     Das Prelude ist in Lua geschrieben, das in 5.0 UND 5.1 läuft (nur die Varargs-Stellen
 *     unterscheiden sich und werden je Version erzeugt).
 * EN: the prelude runs INSIDE the Lua VM (own interpreter or real Lua 5.0 VM) and builds frames,
 *     script management, timer handles and API functions. The host (world.ts) only sees primitive
 *     values; frames/functions/tables are passed as refs (see above). The prelude is written in Lua
 *     that runs in 5.0 AND 5.1 (only the vararg spots differ and are generated per version).
 */

import type { ResolvedTarget } from "../core/plugins.js";

// ===== [S1] Kennungen · refs =====

export const REF_MARK = "\u0001";

export const LIB_ALIASES: Record<string, string> = {
  strlen: "string.len", strsub: "string.sub", strfind: "string.find", strlower: "string.lower", strupper: "string.upper",
  strrep: "string.rep", strbyte: "string.byte", strchar: "string.char", format: "string.format", gsub: "string.gsub",
  tinsert: "table.insert", tremove: "table.remove", getn: "table.getn", foreach: "table.foreach", foreachi: "table.foreachi",
  floor: "math.floor", ceil: "math.ceil", abs: "math.abs", max: "math.max", min: "math.min", mod: "math.mod", sqrt: "math.sqrt",
  random: "math.random",
};

/**
 * DE: Hilfsfunktionen des Umschreibers (`#` → __len, `%` → __mod), wie bei ClassicAPI.
 * EN: helper functions of the rewriter (`#` → __len, `%` → __mod), like ClassicAPI.
 */
export const CLASSIC_HELPERS = `
function __mod(a, b) return a - math.floor(a / b) * b end
function __len(x)
  local t = type(x)
  if t == "string" then return string.len(x) end
  if t ~= "table" then error("attempt to get length of a " .. t .. " value", 2) end
  local i, j = 0, 1
  while rawget(x, j) ~= nil do i = j; j = j * 2 end
  while j - i > 1 do
    local m = math.floor((i + j) / 2)
    if rawget(x, m) == nil then j = m else i = m end
  end
  return i
end
`;

// ===== [S2] buildPrelude =====

const luaList = (xs: string[]): string => "{" + xs.map((x) => JSON.stringify(x)).join(",") + "}";

function methodNames(target: ResolvedTarget, kind: string): string[] {
  const names = new Set<string>();
  for (let w = target.widgets.get(kind); w; w = w.inherits ? target.widgets.get(w.inherits) : undefined) w.methods.forEach((m) => names.add(m));
  return [...names];
}

export function buildPrelude(target: ResolvedTarget): string {
  const v50 = target.luaVersion === "5.0";
  const kinds = [...target.widgets.keys()].map((k) => `[${JSON.stringify(k)}]=${luaList(methodNames(target, k))}`).join(",\n");
  const aliases = Object.entries(LIB_ALIASES).map(([k, v]) => `[${JSON.stringify(k)}]=${JSON.stringify(v)}`).join(",");
  const names = [...target.functions.keys()];
  const pack = v50 ? "local function pack(...) return arg end" : 'local function pack(...) return { n = select("#", ...), ... } end';
  const unp = v50 ? "local unp = unpack" : "local function unp(t) return unpack(t, 1, t.n) end";
  const printBody = v50 ? "local a = arg" : "local a = pack(...)";
  const nativeStrip = v50
    ? `
G.time = function(t)
  if type(t) == "table" then
    if t.year == nil then error("field 'year' missing in date table", 2) end
    if t.month == nil then error("field 'month' missing in date table", 2) end
    if t.day == nil then error("field 'day' missing in date table", 2) end
    return hostMktime(t.year, t.month, t.day, t.hour, t.min, t.sec)
  end
  return hostTime()
end
G.date = function(f, t)
  f = f or "%c"
  local year, month, day, hour, min, sec, wday = hostDate(f, t)
  if ssub(f, 1, 2) == "*t" or ssub(f, 1, 3) == "!*t" then
    return { year = year, month = month, day = day, hour = hour, min = min, sec = sec, wday = wday }
  end
  return year
end
G.difftime = function(a, b) return a - (b or 0) end
G.os, G.io, G.debug, G.loadlib, G.dofile, G.loadfile, G.require, G._TRACEBACK = nil, nil, nil, nil, nil, nil, nil, nil`
    : "";

  return `-- Freewood simulation prelude (generated)
${target.syntax === "lua51-transpiled" ? CLASSIC_HELPERS : ""}
local G = _G
local type, tostring, tonumber, pairs, ipairs, error, pcall, setmetatable = type, tostring, tonumber, pairs, ipairs, error, pcall, setmetatable
local sfind, ssub, slower, sgsub = string.find, string.sub, string.lower, string.gsub
local tconcat = table.concat
local unpack = unpack
local hostApi, hostM, hostLog, hostTime, hostDate, hostMktime = __fw_api, __fw_m, __fw_log, __fw_time, __fw_date, __fw_mktime
G.__fw_api, G.__fw_m, G.__fw_log, G.__fw_time, G.__fw_date, G.__fw_mktime = nil, nil, nil, nil, nil, nil
local STYLE = ${JSON.stringify(target.scriptArgs)}
${pack}
${unp}
${nativeStrip}

local MK = string.char(1)
local PF, PH, PT = MK .. "F", MK .. "H", MK .. "T"
local FR, ID, HD, HI, SC, HK, TM = {}, {}, {}, {}, {}, {}, {}
local nh = 0
local KINDS = {
${kinds}
}
local ALIAS = {${aliases}}
local NAMES = ${luaList(names)}
local META, MC, LM, API = {}, {}, {}, {}
local mm

-- ---- references ----
local function frame(id, kind, name)
  local f = FR[id]
  if f then return f end
  f = {}
  f[0] = id
  FR[id] = f
  ID[f] = id
  setmetatable(f, META[kind] or (function()
    local methods = {}
    local list = KINDS[kind]
    if list then for _, n in ipairs(list) do methods[n] = mm(n) end end
    local m = { __index = methods }
    META[kind] = m
    return m
  end)())
  if name ~= "" then G[name] = f end
  return f
end

local function un1(v)
  if type(v) == "string" and ssub(v, 1, 2) == PF then
    local _, _, id, kind, name = sfind(v, "^" .. PF .. "(%d+):([^:]*):(.*)$")
    return frame(tonumber(id), kind, name)
  end
  return v
end

local function w(v)
  local t = type(v)
  if t == "table" then
    local id = ID[v]
    if id then return PF .. id end
    return PT
  elseif t == "function" then
    local id = HI[v]
    if not id then
      nh = nh + 1
      id = nh
      HD[id] = v
      HI[v] = id
    end
    return PH .. id
  end
  return v
end

local function out(r)
  local n = r.n
  if n <= 1 then return end
  if n == 2 then return un1(r[2]) end
  local o = { n = n - 1 }
  for i = 2, n do o[i - 1] = un1(r[i]) end
  return unp(o)
end

-- ---- methods of frames ----
mm = function(name)
  local f = MC[name]
  if f then return f end
  f = LM[name]
  if not f then
    f = function(self, a1, a2, a3, a4, a5, a6, a7, a8)
      local id = ID[self]
      if not id then error("bad self for " .. name .. ": use ':' to call methods", 2) end
      local r = pack(hostM(id, name, w(a1), w(a2), w(a3), w(a4), w(a5), w(a6), w(a7), w(a8)))
      if r[1] ~= true then error(r[2], 2) end
      return out(r)
    end
  end
  MC[name] = f
  return f
end

local function selfId(self, name)
  local id = ID[self]
  if not id then error("bad self for " .. name .. ": use ':' to call methods", 3) end
  return id
end

LM.SetScript = function(self, name, fn)
  local id = selfId(self, "SetScript")
  local has = type(fn) == "function"
  local r = pack(hostM(id, "SetScript", name, has))
  if r[1] ~= true then error(r[2], 2) end
  local t = SC[id]
  if not t then t = {}; SC[id] = t end
  if has then t[name] = fn else t[name] = nil end
end
LM.GetScript = function(self, name)
  local t = SC[selfId(self, "GetScript")]
  if t then return t[name] end
end
LM.HasScript = function(self, name)
  local t = SC[selfId(self, "HasScript")]
  if t and t[name] then return true end
  return false
end
LM.HookScript = function(self, name, fn)
  local id = selfId(self, "HookScript")
  if type(fn) ~= "function" then return end
  hostM(id, "HookScript", name, true)
  local t = HK[id]
  if not t then t = {}; HK[id] = t end
  local list = t[name]
  if not list then list = {}; t[name] = list end
  list.n = (list.n or 0) + 1
  list[list.n] = fn
end

-- ---- API ----
local function apiw(name)
  return function(a1, a2, a3, a4, a5, a6, a7, a8)
    local r = pack(hostApi(name, w(a1), w(a2), w(a3), w(a4), w(a5), w(a6), w(a7), w(a8)))
    if r[1] ~= true then error(r[2], 2) end
    return out(r)
  end
end

API.getglobal = function(n) return G[n] end
API.setglobal = function(n, v) G[n] = v end

API.CreateFrame = function(kind, name, parent, template)
  if type(name) == "string" and name ~= "" and G[name] ~= nil then
    hostLog("warn", "CreateFrame: a global named '" .. name .. "' already exists and is replaced.")
  end
  local r = pack(hostApi("CreateFrame", w(kind), w(name), w(parent), w(template)))
  if r[1] ~= true then error(r[2], 2) end
  local f = un1(r[2])
  if type(template) == "string" then
    local pos = 1
    while true do
      local s, e, tok = sfind(template, "([^,]+)", pos)
      if not s then break end
      if (sgsub(tok, "^%s*(.-)%s*$", "%1")) == "BackdropTemplate" then
        f.SetBackdrop, f.SetBackdropColor, f.SetBackdropBorderColor = mm("SetBackdrop"), mm("SetBackdropColor"), mm("SetBackdropBorderColor")
      end
      pos = e + 1
    end
  end
  return f
end

local function timer(apiName, a1, a2, a3)
  local r = pack(hostApi(apiName, w(a1), w(a2), w(a3)))
  if r[1] ~= true then error(r[2], 3) end
  local tid = r[2]
  local h = {}
  h.Cancel = function() hostApi("__timer_cancel", tid) end
  h.IsCancelled = function() return (pack(hostApi("__timer_cancelled", tid)))[2] end
  TM[tid] = h
  return h
end
API["C_Timer.NewTimer"] = function(sec, fn) return timer("C_Timer.NewTimer", sec, fn) end
API["C_Timer.NewTicker"] = function(sec, fn, n) return timer("C_Timer.NewTicker", sec, fn, n) end

API.hooksecurefunc = function(name, hook)
  local orig = G[name]
  if type(orig) ~= "function" then error("hooksecurefunc: '" .. tostring(name) .. "' is not a function", 2) end
  G[name] = function(a1, a2, a3, a4, a5, a6, a7, a8)
    local r = pack(orig(a1, a2, a3, a4, a5, a6, a7, a8))
    hook(a1, a2, a3, a4, a5, a6, a7, a8)
    return unp(r)
  end
end

local function getp(path)
  local t = G
  local pos = 1
  while true do
    local s = sfind(path, ".", pos, true)
    local key = s and ssub(path, pos, s - 1) or ssub(path, pos)
    if s == nil then return t, key end
    local n = t[key]
    if type(n) ~= "table" then return nil, key end
    t = n
    pos = s + 1
  end
end
local function setp(path, v)
  local t = G
  local pos = 1
  while true do
    local s = sfind(path, ".", pos, true)
    local key = s and ssub(path, pos, s - 1) or ssub(path, pos)
    if s == nil then t[key] = v; return end
    local n = t[key]
    if type(n) ~= "table" then n = {}; t[key] = n end
    t = n
    pos = s + 1
  end
end

for _, name in ipairs(NAMES) do
  local impl = API[name]
  if not impl then
    local al = ALIAS[name]
    local done = false
    if al then
      local c, k = getp(al)
      if c and c[k] ~= nil then setp(name, c[k]); done = true end
    end
    if not done then
      local c, k = getp(name)
      if not (c and c[k] ~= nil and ssub(name, 1, 2) ~= "C_") then setp(name, apiw(name)) end
    end
  else
    setp(name, impl)
  end
end

G.print = function(...)
  ${printBody}
  local parts = {}
  for i = 1, a.n do parts[i] = tostring(a[i]) end
  hostLog("print", tconcat(parts, string.char(9)))
end
G.SlashCmdList = {}

-- ---- called by the host ----
function __fw_fire(id, name, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10)
  local list, n = {}, 0
  local s = SC[id]
  if s and s[name] then n = n + 1; list[n] = s[name] end
  local hk = HK[id] and HK[id][name]
  if hk then for _, fn in ipairs(hk) do n = n + 1; list[n] = fn end end
  if n == 0 then return end
  local f = FR[id]
  a1, a2, a3, a4, a5, a6, a7, a8, a9, a10 = un1(a1), un1(a2), un1(a3), un1(a4), un1(a5), un1(a6), un1(a7), un1(a8), un1(a9), un1(a10)
  local saved
  if STYLE ~= "arguments" then
    saved = { G.this, G.event, G.arg1, G.arg2, G.arg3, G.arg4, G.arg5, G.arg6, G.arg7, G.arg8, G.arg9 }
    G.this = f
    if name == "OnEvent" then
      G.event = a1
      G.arg1, G.arg2, G.arg3, G.arg4, G.arg5, G.arg6, G.arg7, G.arg8, G.arg9 = a2, a3, a4, a5, a6, a7, a8, a9, a10
    else
      G.arg1, G.arg2, G.arg3, G.arg4, G.arg5, G.arg6, G.arg7, G.arg8, G.arg9 = a1, a2, a3, a4, a5, a6, a7, a8, a9
    end
  end
  for i = 1, n do
    local ok, err
    if STYLE == "globals" then ok, err = pcall(list[i])
    else ok, err = pcall(list[i], f, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) end
    if not ok then hostLog("error", tostring(err)) end
  end
  if saved then
    G.this, G.event, G.arg1, G.arg2, G.arg3, G.arg4, G.arg5, G.arg6, G.arg7, G.arg8, G.arg9 = saved[1], saved[2], saved[3], saved[4], saved[5], saved[6], saved[7], saved[8], saved[9], saved[10], saved[11]
  end
end

function __fw_timer(hid, tid, pass)
  local fn = HD[hid]
  local ok, err
  if pass then ok, err = pcall(fn, TM[tid]) else ok, err = pcall(fn) end
  if not ok then hostLog("error", tostring(err)) end
end

function __fw_slash(cmd, rest)
  local list = G.SlashCmdList
  if type(list) ~= "table" then return false end
  for key, fn in pairs(list) do
    if type(key) == "string" and type(fn) == "function" then
      local i = 1
      while true do
        local alias = G["SLASH_" .. key .. i]
        if type(alias) ~= "string" then break end
        if slower(alias) == "/" .. cmd then
          local ok, err = pcall(fn, rest)
          if not ok then hostLog("error", tostring(err)) end
          return true
        end
        i = i + 1
      end
    end
  end
  return false
end

-- ---- boot: UIParent, WorldFrame, chat frame ----
do
  local r = pack(hostApi("__boot"))
  local chat = un1(r[4])
  un1(r[2]); un1(r[3])
  chat.AddMessage = function(self, msg) hostLog("chat", tostring(msg)) end
end
`;
}
