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
  // ClassicAPI: globals and string/math namespaces point at the same function
  strmatch: "string.match", strrev: "string.reverse",
  "string.split": "strsplit", "string.trim": "strtrim", "string.join": "strjoin", "string.concat": "strconcat",
  "math.fmod": "math.mod", "string.gmatch": "string.gfind",
};

/**
 * DE: JSON zwischen Host und VM: der Host liefert verschachtelte Werte als Text, die VM baut Tabellen daraus
 *     (und umgekehrt für Tabellen als Argumente). Gültiges Lua 5.0, ohne `%`-Operator und `#`.
 * EN: JSON between host and VM: the host hands nested values over as text, the VM builds tables from it
 *     (and vice versa for table arguments). Valid Lua 5.0, no `%` operator, no `#`.
 */
const JSON_LUA = String.raw`
local JESC = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
local function jesc(c) return JESC[c] or string.format("\\u%04x", string.byte(c)) end
local jenc
jenc = function(v, d)
  local t = type(v)
  if t == "string" then return '"' .. (sgsub(v, '[%c"\\]', jesc)) .. '"' end
  if t == "number" then
    if v ~= v or v == 1 / 0 or v == -1 / 0 then return "null" end
    return tostring(v)
  end
  if t == "boolean" then if v then return "true" end return "false" end
  if t ~= "table" or d > 6 then return "null" end
  local n = 0
  for _ in pairs(v) do n = n + 1 end
  if n > 0 and table.getn(v) == n then
    local parts = {}
    for i = 1, n do parts[i] = jenc(v[i], d + 1) end
    return "[" .. tconcat(parts, ",") .. "]"
  end
  local parts, k = {}, 0
  for key, val in pairs(v) do
    local tv = type(val)
    if tv ~= "function" and tv ~= "userdata" and tv ~= "thread" then
      k = k + 1
      parts[k] = jenc(tostring(key), d + 1) .. ":" .. jenc(val, d + 1)
    end
  end
  return "{" .. tconcat(parts, ",") .. "}"
end
local function jutf8(c)
  if c < 128 then return string.char(c) end
  if c < 2048 then return string.char(192 + math.floor(c / 64), 128 + (c - math.floor(c / 64) * 64)) end
  local a = math.floor(c / 4096)
  local b = math.floor((c - a * 4096) / 64)
  return string.char(224 + a, 128 + b, 128 + (c - a * 4096 - b * 64))
end
local JUNESC = { n = "\n", r = "\r", t = "\t", b = "\b", f = "\f" }
local jdec, jhook
jdec = function(s, i)
  local c = ssub(s, i, i)
  if c == "{" then
    local t = {}
    i = i + 1
    if ssub(s, i, i) == "}" then return t, i + 1 end
    while true do
      local key, val
      key, i = jdec(s, i)
      i = i + 1
      val, i = jdec(s, i)
      if type(key) == "string" and sfind(key, "^%d+$") then key = tonumber(key) end
      t[key] = val
      c = ssub(s, i, i)
      i = i + 1
      if c ~= "," then
        if jhook then jhook(t) end
        return t, i
      end
    end
  elseif c == "[" then
    local t, n = {}, 0
    i = i + 1
    if ssub(s, i, i) == "]" then return t, i + 1 end
    while true do
      local val
      val, i = jdec(s, i)
      n = n + 1
      t[n] = val
      c = ssub(s, i, i)
      i = i + 1
      if c ~= "," then return t, i end
    end
  elseif c == '"' then
    local parts, np, pos = {}, 0, i + 1
    while true do
      local a = sfind(s, '["\\]', pos)
      if not a then return tconcat(parts), string.len(s) + 1 end
      np = np + 1
      parts[np] = ssub(s, pos, a - 1)
      if ssub(s, a, a) == '"' then return tconcat(parts), a + 1 end
      local e = ssub(s, a + 1, a + 1)
      np = np + 1
      if e == "u" then
        parts[np] = jutf8(tonumber(ssub(s, a + 2, a + 5), 16) or 63)
        pos = a + 6
      else
        parts[np] = JUNESC[e] or e
        pos = a + 2
      end
    end
  elseif c == "t" then return true, i + 4
  elseif c == "f" then return false, i + 5
  elseif c == "n" then return nil, i + 4
  end
  local _, e = sfind(s, "^-?[%d%.eE+-]+", i)
  if not e then return nil, i + 1 end
  return tonumber(ssub(s, i, e)), e + 1
end
`;

/**
 * DE: Hilfsfunktionen des Umschreibers (`#` → __len, `%` → __mod), wie bei ClassicAPI.
 * EN: helper functions of the rewriter (`#` → __len, `%` → __mod), like ClassicAPI.
 */
const CLASSIC_API = String.raw`
-- ---- Lua 5.1 backports (ClassicAPI, docs/API.md "Lua") ----
local pre = {}
for k in pairs(API) do pre[k] = true end
local rawunpack, rawxpcall, rawgsub, rawgc = unpack, xpcall, string.gsub, collectgarbage
local function slice(t, i, j)
  local c = { n = j - i + 1 }
  for k = i, j do c[k - i + 1] = t[k] end
  if c.n < 0 then c.n = 0 end
  return rawunpack(c, 1, c.n)
end
local function badarg(n, fname, msg) error("bad argument #" .. n .. " to \`" .. fname .. "' (" .. msg .. ")", 3) end
local function typeName(v) if v == nil then return "no value" end return type(v) end
if math.huge == nil then math.huge = 1 / 0 end
API.unpack = function(t, i, j)
  if type(t) ~= "table" then badarg(1, "unpack", "table expected, got " .. typeName(t)) end
  i = i or 1
  if j == nil then j = table.getn(t) end
  return slice(t, i, j)
end
API.select = function(n, ...)
  local a = @ARGS@
  if n == "#" then return a.n end
  local num = tonumber(n)
  if not num then badarg(1, "select", "number expected, got " .. typeName(n)) end
  if num < 0 then num = a.n + num + 1 end
  if num < 1 then badarg(1, "select", "index out of range") end
  return slice(a, num, a.n)
end
API.xpcall = function(f, msgh, ...)
  local a = @ARGS@
  if a.n == 0 then return rawxpcall(f, msgh) end
  return rawxpcall(function() return f(rawunpack(a)) end, msgh)
end
API.collectgarbage = function(opt, v)
  if type(opt) == "string" then
    if opt == "count" then return gcinfo() end
    if opt == "collect" then rawgc() return 0 end
    if opt == "step" then return true end
    if opt == "stop" or opt == "restart" or opt == "setpause" or opt == "setstepmul" then return 0 end
    badarg(1, "collectgarbage", "invalid option '" .. opt .. "'")
  end
  return rawgc(opt)
end
API["table.wipe"] = function(t)
  if type(t) ~= "table" then badarg(1, "wipe", "table expected, got " .. typeName(t)) end
  for k in pairs(t) do t[k] = nil end
  table.setn(t, 0)
  return t
end
API["table.count"] = function(t)
  if type(t) ~= "table" then badarg(1, "count", "table expected, got " .. typeName(t)) end
  local total, maxi = 0, 0
  for k in pairs(t) do
    total = total + 1
    if type(k) == "number" and k >= 1 and k == math.floor(k) and k > maxi then maxi = k end
  end
  local arr = 0
  for k in pairs(t) do
    if type(k) == "number" and k >= 1 and k <= total and k == math.floor(k) then arr = arr + 1 end
  end
  return total, arr, maxi
end
API["table.maxn"] = function(t)
  if type(t) ~= "table" then badarg(1, "maxn", "table expected, got " .. typeName(t)) end
  local m = 0
  for k in pairs(t) do if type(k) == "number" and k > m then m = k end end
  return m
end
API["math.modf"] = function(x)
  x = tonumber(x)
  if not x then badarg(1, "modf", "number expected, got " .. typeName(x)) end
  local i
  if x >= 0 then i = math.floor(x) else i = math.ceil(x) end
  return i, x - i
end
API["string.match"] = function(s, pattern, init)
  local r = pack(sfind(s, pattern, init))
  if r[1] == nil then return nil end
  if r.n <= 2 then return ssub(s, r[1], r[2]) end
  return slice(r, 3, r.n)
end
API["string.gsub"] = function(s, pat, repl, n)
  if type(repl) == "table" then
    local map = repl
    repl = function(k) return map[k] end
  end
  return rawgsub(s, pat, repl, n)
end
API.strjoin = function(delim, ...)
  local a = @ARGS@
  local parts = {}
  for i = 1, a.n do
    local v = a[i]
    if type(v) == "string" or type(v) == "number" then parts[i] = tostring(v) else parts[i] = "" end
  end
  return tconcat(parts, delim)
end
API.strconcat = function(...)
  local a = @ARGS@
  local parts = {}
  for i = 1, a.n do
    local v = a[i]
    if type(v) ~= "string" and type(v) ~= "number" then badarg(i, "strconcat", "string expected, got " .. typeName(v)) end
    parts[i] = tostring(v)
  end
  return tconcat(parts)
end
API.strreplace = function(s, find, replace)
  s, find, replace = tostring(s), tostring(find), tostring(replace)
  if find == "" then return s, 0 end
  local out, pos, count = {}, 1, 0
  while true do
    local a, b = sfind(s, find, pos, true)
    if not a then break end
    out[table.getn(out) + 1] = ssub(s, pos, a - 1)
    out[table.getn(out) + 1] = replace
    pos = b + 1
    count = count + 1
  end
  out[table.getn(out) + 1] = ssub(s, pos)
  return tconcat(out), count
end
API.strsplittable = function(sep, s, pieces) return { G.strsplit(sep, s, pieces) } end
-- ---- Reine Rechenfunktionen (ClassicAPI docs/API.md) · pure calculation functions ----
local function num(v, i, f) v = tonumber(v); if not v then badarg(i, f, "number expected, got " .. typeName(v)) end return v end
local function hsv(r, g, b)
  local mx, mn = math.max(r, g, b), math.min(r, g, b)
  local d = mx - mn
  local h = -1
  if d > 0 then
    if mx == r then h = 60 * math.mod((g - b) / d, 6)
    elseif mx == g then h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4) end
    if h < 0 then h = h + 360 end
  end
  local s = 0
  if mx > 0 then s = d / mx end
  return h, s, mx
end
local function rgbFromHsv(h, s, v)
  if h < 0 or s == 0 then return v, v, v end
  h = math.mod(h, 360) / 60
  local i = math.floor(h)
  local f = h - i
  local p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
  if i == 0 then return v, t, p elseif i == 1 then return q, v, p elseif i == 2 then return p, v, t
  elseif i == 3 then return p, q, v elseif i == 4 then return t, p, v end
  return v, p, q
end
local function hsvToHsl(h, s, v)
  local l = v * (1 - s / 2)
  local sl = 0
  if l > 0 and l < 1 then sl = (v - l) / math.min(l, 1 - l) end
  return h, sl, l
end
local function hslToHsv(h, s, l)
  local v = l + s * math.min(l, 1 - l)
  local sv = 0
  if v > 0 then sv = 2 * (1 - l / v) end
  return h, sv, v
end
API["C_ColorUtil.ConvertRGBToHSV"] = function(r, g, b) return hsv(num(r, 1, "ConvertRGBToHSV"), num(g, 2, "ConvertRGBToHSV"), num(b, 3, "ConvertRGBToHSV")) end
API["C_ColorUtil.ConvertHSVToRGB"] = function(h, s, v) return rgbFromHsv(num(h, 1, "ConvertHSVToRGB"), num(s, 2, "ConvertHSVToRGB"), num(v, 3, "ConvertHSVToRGB")) end
API["C_ColorUtil.ConvertHSVToHSL"] = function(h, s, v) return hsvToHsl(num(h, 1, "ConvertHSVToHSL"), num(s, 2, "ConvertHSVToHSL"), num(v, 3, "ConvertHSVToHSL")) end
API["C_ColorUtil.ConvertHSLToHSV"] = function(h, s, l) return hslToHsv(num(h, 1, "ConvertHSLToHSV"), num(s, 2, "ConvertHSLToHSV"), num(l, 3, "ConvertHSLToHSV")) end
API["C_ColorUtil.ConvertHSLToRGB"] = function(h, s, l)
  h, s, l = num(h, 1, "ConvertHSLToRGB"), num(s, 2, "ConvertHSLToRGB"), num(l, 3, "ConvertHSLToRGB")
  if h < 0 or s == 0 then return l, l, l end
  return rgbFromHsv(hslToHsv(h, s, l))
end
local function byte255(x) x = x or 0; if x < 0 then x = 0 elseif x > 1 then x = 1 end return math.floor(x * 255 + 0.5) end
API["C_ColorUtil.GenerateTextColorCode"] = function(c)
  if type(c) ~= "table" then badarg(1, "GenerateTextColorCode", "table expected, got " .. typeName(c)) end
  local a = c.a; if a == nil then a = 1 end
  return string.format("%02x%02x%02x%02x", byte255(a), byte255(c.r), byte255(c.g), byte255(c.b))
end
API["C_ColorUtil.WrapTextInColorCode"] = function(text, code) return "|c" .. tostring(code) .. tostring(text) .. "|r" end
API["C_ColorUtil.WrapTextInColor"] = function(text, c) return "|c" .. API["C_ColorUtil.GenerateTextColorCode"](c) .. tostring(text) .. "|r" end
API.CalculateStringEditDistance = function(a, b)
  if type(a) ~= "string" then badarg(1, "CalculateStringEditDistance", "string expected, got " .. typeName(a)) end
  if type(b) ~= "string" then badarg(2, "CalculateStringEditDistance", "string expected, got " .. typeName(b)) end
  local la, lb = string.len(a), string.len(b)
  if math.min(la, lb) >= 256 then return nil end
  local prev, cur = {}, {}
  for j = 0, lb do prev[j] = j end
  for i = 1, la do
    cur[0] = i
    for j = 1, lb do
      local cost = 1
      if string.byte(a, i) == string.byte(b, j) then cost = 0 end
      cur[j] = math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    end
    prev, cur = cur, prev
  end
  return prev[lb]
end
API.GetClassicExpansionLevel = function() return 0 end
API.GetExpansionLevel = function() return 0 end
API.GetAccountExpansionLevel = function() return 0 end
API.GetMaxPlayerLevel = function() return 60 end
API.InCombatLockdown = function() return false end
API.ClassicExpansionAtLeast = function(l) return num(l, 1, "ClassicExpansionAtLeast") <= 0 end
API.ClassicExpansionAtMost = function(l) return num(l, 1, "ClassicExpansionAtMost") >= 0 end
local ABBR = {
  { 1e12, "", 1e11, 10 }, { 1e13, "", 1e12, 1 }, { 1e9, "", 1e8, 10 }, { 1e10, "", 1e9, 1 },
  { 1e6, "M", 1e5, 10 }, { 1e7, "M", 1e6, 1 }, { 1e3, "K", 1e2, 10 }, { 1e4, "K", 1e3, 1 },
}
table.sort(ABBR, function(x, y) return x[1] > y[1] end)
API.AbbreviateNumbers = function(n, opts)
  n = num(n, 1, "AbbreviateNumbers")
  local list = ABBR
  if type(opts) == "table" and type(opts.breakpointData) == "table" then
    list = {}
    for i = 1, table.getn(opts.breakpointData) do
      local b = opts.breakpointData[i]
      list[i] = { b.breakpoint, b.abbreviation or "", b.significandDivisor, b.fractionDivisor }
    end
    table.sort(list, function(x, y) return x[1] > y[1] end)
  end
  for i = 1, table.getn(list) do
    local b = list[i]
    if n >= b[1] then return tostring(math.floor(n / b[3]) / b[4]) .. b[2] end
  end
  return tostring(n)
end
local function groups(s)
  local out = s
  while true do
    local r, k = string.gsub(out, "^(-?%d+)(%d%d%d)", "%1,%2")
    out = r
    if k == 0 then break end
  end
  return out
end
API.BreakUpLargeNumbers = function(n)
  n = num(n, 1, "BreakUpLargeNumbers")
  local a = math.abs(n)
  local sign = ""
  if n < 0 then sign = "-" end
  if a == math.floor(a) or a >= 1000 then return sign .. groups(string.format("%d", math.floor(a))) end
  return sign .. string.format("%.1f", math.floor(a * 10 + 0.5) / 10)
end
-- ---- Taschen und Zauber als Tabellen (Hilfen liefern primitive Werte) · bags and spells as tables ----
local hBagItem, hSpellInfo, hFreeList = apiw("__bag_item"), apiw("__spell_info"), apiw("__bag_free_list")
API["C_Container.GetContainerItemInfo"] = function(bag, slot, buf)
  local id, count, icon, quality, link, name, noValue = hBagItem(bag, slot)
  if id == nil then return nil end
  local t = buf
  if type(t) ~= "table" then t = {} else for k in pairs(t) do t[k] = nil end end
  t.iconFileID, t.stackCount, t.isLocked, t.quality = icon, count, false, quality
  t.isReadable, t.hasLoot, t.hyperlink, t.isFiltered = false, false, link, false
  t.hasNoValue, t.itemID, t.isBound, t.itemName = noValue, id, false, name
  return t
end
API["C_Container.GetContainerFreeSlots"] = function(bag)
  local r = pack(hFreeList(bag))
  if r[1] ~= true then return nil end
  local t = {}
  for i = 2, r.n do t[i - 1] = r[i] end
  return t
end
API["C_Spell.GetSpellInfo"] = function(id)
  local name, icon, cast, minR, maxR, sid, rank, cost, funnel, power = hSpellInfo(id)
  if name == nil then return nil end
  return { name = name, iconID = icon, castTime = cast, minRange = minR, maxRange = maxR, spellID = sid, rank = rank, cost = cost, isFunnel = funnel, powerType = power }
end
-- ---- Quests, Ruf, Zauberbuch als Tabellen · quests, reputation, spellbook as tables ----
local hQuest, hList, hFaction, hStand = apiw("__quest_info"), apiw("__completed_list"), apiw("__faction_data"), apiw("__standings_list")
local hBook, hTab = apiw("__book_item"), apiw("__book_tab")
API["C_QuestLog.GetInfo"] = function(i)
  local title, id, level, header, collapsed = hQuest(i)
  if title == nil then return nil end
  return { title = title, questLogIndex = i, questID = id, level = level, difficultyLevel = level, suggestedGroup = 0, frequency = 0,
    isHeader = header, isCollapsed = collapsed, questClassification = 0, readyForTranslation = true, isOnMap = false, hasLocalPOI = false,
    isTask = false, isBounty = false, isStory = false, isHidden = false, isScaling = false }
end
API["C_QuestLog.GetQuestLogTitle"] = function(i)
  local title, id, level, header, collapsed, complete = hQuest(i)
  if title == nil then return end
  local c
  if complete then c = 1 end
  return title, level, 0, header, collapsed, c, 0, id, false, false, false, false, false, false, false, false, false
end
API["C_QuestLog.GetAllCompletedQuestIDs"] = function()
  local r = pack(hList())
  local t = {}
  for i = 1, r.n do t[i] = r[i] end
  return t
end
local function factionTable(id, name, desc, reaction, cmin, cmax, cur, war, canWar, header, collapsed, watched, canInactive)
  if id == nil then return nil end
  return { factionID = id, name = name, description = desc, reaction = reaction, currentReactionThreshold = cmin, nextReactionThreshold = cmax,
    currentStanding = cur, atWarWith = war, canToggleAtWar = canWar, isHeader = header, isHeaderWithRep = false, isCollapsed = collapsed,
    isWatched = watched, canSetInactive = canInactive, isChild = false, hasBonusRepGain = false, isAccountWide = false }
end
API["C_Reputation.GetFactionDataByID"] = function(id) return factionTable(hFaction("id", id)) end
API["C_Reputation.GetFactionDataByIndex"] = function(i) return factionTable(hFaction("index", i)) end
API["C_Reputation.GetWatchedFactionData"] = function() return factionTable(hFaction("watched", 0)) end
API["C_Reputation.GetFactionStandings"] = function()
  local r = pack(hStand())
  local t = {}
  for i = 1, r.n, 2 do t[r[i]] = r[i + 1] end
  return t
end
API["C_SpellBook.GetSpellBookItemInfo"] = function(slot, bank)
  local id, name, rank, icon, passive = hBook(slot, bank)
  if id == nil then return nil end
  return { itemType = 1, actionID = id, spellID = id, name = name, subName = rank, iconID = icon, isPassive = passive, isOffSpec = false }
end
API["C_SpellBook.GetSpellBookSkillLineInfo"] = function(i)
  local name, icon, offset, num = hTab(i)
  if name == nil then return nil end
  return { name = name, iconID = icon, itemIndexOffset = offset, numSpellBookItems = num, isGuild = false, shouldHide = false }
end
-- ---- Kalenderzeit (Server-UTC) · calendar time ----
local hCal, hCalNow, hCalEpoch = apiw("__calendar"), apiw("__calendar_now"), apiw("__calendar_epoch")
local function calTable(y, m, d, wd, h, mi) return { year = y, month = m, monthDay = d, weekday = wd, hour = h, minute = mi } end
local function calEpoch(t) return hCalEpoch(t.year, t.month, t.monthDay, t.hour or 0, t.minute or 0) end
API["C_DateAndTime.GetCurrentCalendarTime"] = function() return calTable(hCalNow()) end
API["C_DateAndTime.GetCalendarTimeFromEpoch"] = function(e)
  e = num(e, 1, "GetCalendarTimeFromEpoch")
  return calTable(hCal(e))
end
API["C_DateAndTime.AdjustTimeByDays"] = function(t, n) return calTable(hCal(calEpoch(t) + num(n, 2, "AdjustTimeByDays") * 86400)) end
API["C_DateAndTime.AdjustTimeByMinutes"] = function(t, n) return calTable(hCal(calEpoch(t) + num(n, 2, "AdjustTimeByMinutes") * 60)) end
API["C_DateAndTime.CompareCalendarTime"] = function(a, b)
  local x, y = calEpoch(a), calEpoch(b)
  if x < y then return -1 elseif x > y then return 1 end
  return 0
end
-- ---- Auren als Tabellen · auras as tables ----
local hAuraAt, hAuraFind = apiw("__aura_at"), apiw("__aura_find")
local function auraTable(name, icon, apps, id, dispel, helpful, duration, expires, source, guid, mine)
  if name == nil then return nil end
  return { name = name, icon = icon, applications = apps, spellId = id, dispelName = dispel, isHelpful = helpful, isHarmful = not helpful,
    duration = duration, expirationTime = expires, sourceUnit = source, sourceGUID = guid, charges = 0, maxCharges = 0, timeMod = 1,
    isFromPlayerOrPlayerPet = mine, canApplyAura = false, isRaid = false, isStealable = false, nameplateShowPersonal = false, nameplateShowAll = false,
    auraInstanceID = 100000 + (id or 0) }
end
local function auraList(unit, filter)
  local t, i = {}, 1
  while true do
    local d = auraTable(hAuraAt(unit, i, filter))
    if d == nil then break end
    d.slot = i
    t[i] = d
    i = i + 1
  end
  return t
end
local function auraPositional(d)
  if d == nil then return nil end
  return d.name, d.icon, d.applications, d.dispelName, d.duration, d.expirationTime, d.sourceUnit, d.isStealable, d.nameplateShowPersonal, d.spellId, d.canApplyAura, false, d.isFromPlayerOrPlayerPet, d.nameplateShowAll, d.timeMod
end
API["C_UnitAuras.UnitAura"] = function(unit, index, filter) return auraPositional(auraTable(hAuraAt(unit, index, filter or "HELPFUL"))) end
API["C_UnitAuras.UnitBuff"] = function(unit, index, filter) return auraPositional(auraTable(hAuraAt(unit, index, "HELPFUL" .. (filter and ("|" .. filter) or "")))) end
API["C_UnitAuras.UnitDebuff"] = function(unit, index, filter) return auraPositional(auraTable(hAuraAt(unit, index, "HARMFUL" .. (filter and ("|" .. filter) or "")))) end
API["C_UnitAuras.GetAuraSlots"] = function(unit, filter, maxSlots)
  local all = auraList(unit, "HELPFUL|HARMFUL")
  local want = auraList(unit, filter or "HELPFUL")
  local out, n = {}, 0
  for i = 1, table.getn(want) do
    for j = 1, table.getn(all) do
      if all[j].spellId == want[i].spellId and all[j].isHelpful == want[i].isHelpful then
        n = n + 1
        out[n] = j
        break
      end
    end
    if maxSlots and n >= maxSlots then break end
  end
  return nil, unpack(out)
end
API["C_UnitAuras.GetAuraDataBySlot"] = function(unit, slot) return auraTable(hAuraAt(unit, slot, "HELPFUL|HARMFUL")) end
API["C_UnitAuras.UnitAuraBySlot"] = function(unit, slot) return auraPositional(auraTable(hAuraAt(unit, slot, "HELPFUL|HARMFUL"))) end
API["C_UnitAuras.GetAuraDataByAuraInstanceID"] = function(unit, id, buf)
  local all = auraList(unit, "HELPFUL|HARMFUL")
  for i = 1, table.getn(all) do
    if all[i].auraInstanceID == id then
      if type(buf) == "table" then
        for k in pairs(buf) do buf[k] = nil end
        for k, v in pairs(all[i]) do buf[k] = v end
        return buf
      end
      return all[i]
    end
  end
end
API["C_UnitAuras.RegisterComboDuration"] = function() return true end
API["C_UnitAuras.RegisterAuraDurationModifierByTrigger"] = function() return true end
API["C_UnitAuras.GetAuraDispelTypeColor"] = function(name)
  local c = { Magic = { 0.2, 0.6, 1 }, Curse = { 0.6, 0, 1 }, Disease = { 0.6, 0.4, 0 }, Poison = { 0, 0.6, 0 } }
  local v = c[name] or { 0.8, 0, 0 }
  return { r = v[1], g = v[2], b = v[3], a = 1 }
end
API["C_UnitAuras.GetAuraDataByIndex"] = function(unit, index, filter) return auraTable(hAuraAt(unit, index, filter)) end
API["C_UnitAuras.GetBuffDataByIndex"] = function(unit, index) return auraTable(hAuraAt(unit, index, "HELPFUL")) end
API["C_UnitAuras.GetDebuffDataByIndex"] = function(unit, index) return auraTable(hAuraAt(unit, index, "HARMFUL")) end
API["C_UnitAuras.GetAuraDataBySpellName"] = function(unit, name, filter) return auraTable(hAuraFind(unit, "name", name, filter)) end
API["C_UnitAuras.GetUnitAuraBySpellID"] = function(unit, id, filter) return auraTable(hAuraFind(unit, "id", id, filter)) end
API["C_UnitAuras.GetPlayerAuraBySpellID"] = function(id) return auraTable(hAuraFind("player", "id", id)) end
API["C_UnitAuras.GetUnitAuras"] = function(unit, filter)
  local t, i = {}, 1
  if filter == nil or filter == "" then filter = "HELPFUL|HARMFUL" end
  while true do
    local d = auraTable(hAuraAt(unit, i, filter))
    if d == nil then break end
    t[i] = d
    i = i + 1
  end
  return t
end
-- ---- RunMacroText (Zeilen wie ein gespeichertes Makro) · RunMacroText ----
API.RunMacroText = function(text, button)
  if type(text) ~= "string" and type(text) ~= "number" then error('Usage: RunMacroText("text" [, "button"])', 2) end
  text = string.sub(tostring(text), 1, 1023)
  for line in string.gfind(text .. "\n", "([^\n]*)\n") do
    if string.sub(line, 1, 1) == "#" then
      -- Kommentar/Direktive übersprungen · directive skipped
    elseif string.sub(line, 1, 1) == "/" then
      local cmd, rest = (function(l) local a, b, c, d = string.find(l, "^/(%S+)%s*(.*)$"); return c, d end)(line)
      if cmd == "stopmacro" then return end
      if not G.__fw_slash(cmd, rest) then hostLog("warn", "RunMacroText: unknown slash command /" .. tostring(cmd)) end
    elseif line ~= "" then
      if G.SendChatMessage then G.SendChatMessage(line) end
    end
  end
end
-- ---- Händler und Gossip als Tabellen · merchant and gossip as tables ----
local hMerch, hGOpt, hGQuest = apiw("__merchant_item"), apiw("__gossip_options"), apiw("__gossip_quests")
API["C_MerchantFrame.GetItemInfo"] = function(slot)
  local id, price, stack, avail, purchasable, throttled, extended = hMerch(slot)
  if id == nil then return nil end
  return { itemID = id, price = price, stackCount = stack, numAvailable = avail, isPurchasable = purchasable, isThrottled = throttled, hasExtendedCost = extended }
end
API["C_GossipInfo.GetOptions"] = function()
  local r, t = pack(hGOpt()), {}
  for i = 1, r.n, 5 do
    t[table.getn(t) + 1] = { gossipOptionID = r[i], name = r[i + 1], icon = r[i + 2], flags = r[i + 3], orderIndex = r[i + 4] }
  end
  return t
end
local function gossipQuests(kind)
  local r, t = pack(hGQuest(kind)), {}
  for i = 1, r.n, 4 do
    local q = { questID = r[i], title = r[i + 1], questLevel = r[i + 2] }
    if kind == "active" then q.isComplete = r[i + 3] end
    t[table.getn(t) + 1] = q
  end
  return t
end
API["C_GossipInfo.GetAvailableQuests"] = function() return gossipQuests("available") end
API["C_GossipInfo.GetActiveQuests"] = function() return gossipQuests("active") end
-- ---- Mixin, Vektoren, Enums · mixins, vectors, enums ----
API.Mixin = function(obj, ...)
  local a = @ARGS@
  for i = 1, a.n do
    local m = a[i]
    if type(m) == "table" then for k, v in pairs(m) do obj[k] = v end end
  end
  return obj
end
API.CreateFromMixins = function(...)
  local a = @ARGS@
  local obj = {}
  for i = 1, a.n do
    local m = a[i]
    if type(m) == "table" then for k, v in pairs(m) do obj[k] = v end end
  end
  return obj
end
local Vector2DMixin = {}
Vector2DMixin.GetXY = function(self) return self.x, self.y end
Vector2DMixin.SetXY = function(self, x, y) self.x, self.y = x, y end
Vector2DMixin.IsEqualTo = function(self, o) return self.x == o.x and self.y == o.y end
Vector2DMixin.Clone = function(self) return G.CreateVector2D(self.x, self.y) end
Vector2DMixin.ScaleBy = function(self, f) self.x, self.y = self.x * f, self.y * f end
Vector2DMixin.Add = function(self, dx, dy) self.x, self.y = self.x + dx, self.y + dy end
Vector2DMixin.Subtract = function(self, dx, dy) self.x, self.y = self.x - dx, self.y - dy end
Vector2DMixin.DivideBy = function(self, f) self.x, self.y = self.x / f, self.y / f end
Vector2DMixin.Dot = function(self, o) return self.x * o.x + self.y * o.y end
Vector2DMixin.Cross = function(self, o) return self.x * o.y - self.y * o.x end
Vector2DMixin.GetLengthSquared = function(self) return self.x * self.x + self.y * self.y end
Vector2DMixin.GetLength = function(self) return math.sqrt(self.x * self.x + self.y * self.y) end
Vector2DMixin.IsZero = function(self) return self.x == 0 and self.y == 0 end
Vector2DMixin.Normalize = function(self)
  local l = math.sqrt(self.x * self.x + self.y * self.y)
  if l > 0 then self.x, self.y = self.x / l, self.y / l end
end
Vector2DMixin.RotateDirection = function(self, a)
  local c, sn = math.cos(a), math.sin(a)
  self.x, self.y = self.x * c - self.y * sn, self.x * sn + self.y * c
end
Vector2DMixin.OnLoad = function(self) end
local VEC_META = { __index = Vector2DMixin }
G.Vector2DMixin = Vector2DMixin
G.CreateVector2D = function(x, y) return setmetatable({ x = x, y = y }, VEC_META) end
jhook = function(t)
  if type(t.x) == "number" and type(t.y) == "number" then
    local n = 0
    for _ in pairs(t) do n = n + 1 end
    if n == 2 then setmetatable(t, VEC_META) end
  end
end
G.UiMapPoint = {
  CreateFromCoordinates = function(id, x, y, z) return { uiMapID = id, position = G.CreateVector2D(x, y), z = z } end,
  CreateFromVector2D = function(id, pos, z) return { uiMapID = id, position = G.CreateVector2D(pos.x, pos.y), z = z } end,
}
G.Enum = G.Enum or {}
G.Enum.UIMapType = { Cosmic = 0, World = 1, Continent = 2, Zone = 3, Dungeon = 4, Micro = 5, Orphan = 6 }
G.Enum.FlightPathFaction = { Neutral = 0, Horde = 1, Alliance = 2 }
G.Enum.FlightPathState = { Reachable = 0, Current = 1, Unreachable = 2 }
-- ---- Farben, JSON, kleine Tabellen · colors, JSON, small tables ----
local ColorMixin = {}
ColorMixin.GetRGB = function(self) return self.r, self.g, self.b end
ColorMixin.GetRGBA = function(self) return self.r, self.g, self.b, self.a end
ColorMixin.SetRGBA = function(self, r, g, b, a) self.r, self.g, self.b, self.a = r, g, b, a end
ColorMixin.SetRGB = function(self, r, g, b) self.r, self.g, self.b = r, g, b end
ColorMixin.IsEqualTo = function(self, o) return self.r == o.r and self.g == o.g and self.b == o.b and (self.a or 1) == (o.a or 1) end
ColorMixin.GenerateHexColor = function(self)
  return string.format("ff%02x%02x%02x", math.floor(self.r * 255 + 0.5), math.floor(self.g * 255 + 0.5), math.floor(self.b * 255 + 0.5))
end
ColorMixin.GenerateHexColorMarkup = function(self) return "|c" .. self:GenerateHexColor() end
ColorMixin.WrapTextInColorCode = function(self, text) return self:GenerateHexColorMarkup() .. text .. "|r" end
ColorMixin.Clone = function(self) return G.CreateColor(self.r, self.g, self.b, self.a) end
local COLOR_META = { __index = ColorMixin }
G.ColorMixin = ColorMixin
G.CreateColor = function(r, g, b, a) return setmetatable({ r = r, g = g, b = b, a = a or 1 }, COLOR_META) end
G.CreateColorFromBytes = function(r, g, b, a) return G.CreateColor(r / 255, g / 255, b / 255, (a or 255) / 255) end
G.RAID_CLASS_COLORS = {
  WARRIOR = G.CreateColor(0.78, 0.61, 0.43), PALADIN = G.CreateColor(0.96, 0.55, 0.73), HUNTER = G.CreateColor(0.67, 0.83, 0.45),
  ROGUE = G.CreateColor(1, 0.96, 0.41), PRIEST = G.CreateColor(1, 1, 1), SHAMAN = G.CreateColor(0.96, 0.55, 0.73),
  MAGE = G.CreateColor(0.41, 0.8, 0.94), WARLOCK = G.CreateColor(0.58, 0.51, 0.79), DRUID = G.CreateColor(1, 0.49, 0.04),
}
API["C_ClassColor.GetClassColor"] = function(token)
  local c = G.RAID_CLASS_COLORS[token]
  if c then return c end
end
API["C_UIColor.GetColors"] = function()
  return {
    { baseTag = "NORMAL_FONT_COLOR", color = G.CreateColor(1, 0.82, 0) },
    { baseTag = "HIGHLIGHT_FONT_COLOR", color = G.CreateColor(1, 1, 1) },
    { baseTag = "RED_FONT_COLOR", color = G.CreateColor(1, 0.1, 0.1) },
    { baseTag = "GREEN_FONT_COLOR", color = G.CreateColor(0.1, 1, 0.1) },
    { baseTag = "GRAY_FONT_COLOR", color = G.CreateColor(0.5, 0.5, 0.5) },
  }
end
API["C_StringUtil.GetDefaultAbbreviationBreakpoints"] = function()
  local out = {}
  for i = table.getn(ABBR), 1, -1 do
    local b = ABBR[i]
    out[table.getn(out) + 1] = { breakpoint = b[1], abbreviation = b[2], significandDivisor = b[3], fractionDivisor = b[4] }
  end
  return out
end
API["C_EncodingUtil.SerializeJSON"] = function(v)
  if type(v) == "function" then error("Usage: C_EncodingUtil.SerializeJSON(value): functions cannot be serialized", 2) end
  return jenc(v, 0)
end
API["C_EncodingUtil.DeserializeJSON"] = function(s)
  if type(s) ~= "string" then error("Usage: C_EncodingUtil.DeserializeJSON(json)", 2) end
  return (jdec(s, 1))
end
API["C_EncodingUtil.SerializeCBOR"] = function(v) return "FWCBOR:" .. jenc(v, 0) end
API["C_EncodingUtil.DeserializeCBOR"] = function(s)
  if type(s) == "string" and ssub(s, 1, 7) == "FWCBOR:" then return (jdec(ssub(s, 8), 1)) end
end
-- ---- Ausrüstung: Tabelle füllen · equipment: fill a table ----
local hInvSlot = apiw("__inventory_for_slot")
API.GetInventoryItemsForSlot = function(slot, t)
  if type(t) ~= "table" then t = {} end
  local r = pack(hInvSlot(slot))
  local i = 1
  while i < r.n do
    t[r[i]] = r[i + 1]
    i = i + 2
  end
  return t
end
-- ---- ItemLocation ----
local ItemLocationMixin = {}
ItemLocationMixin.GetBagAndSlot = function(self) return self.bagID, self.slotIndex end
ItemLocationMixin.GetEquipmentSlot = function(self) return self.equipmentSlotIndex end
ItemLocationMixin.IsBagAndSlot = function(self) return self.bagID ~= nil end
ItemLocationMixin.IsEquipmentSlot = function(self) return self.equipmentSlotIndex ~= nil end
ItemLocationMixin.HasAnyLocation = function(self) return self.bagID ~= nil or self.equipmentSlotIndex ~= nil end
ItemLocationMixin.Clear = function(self) self.bagID, self.slotIndex, self.equipmentSlotIndex = nil, nil, nil end
local LOC_META = { __index = ItemLocationMixin }
G.ItemLocationMixin = ItemLocationMixin
G.ItemLocation = {
  CreateEmpty = function() return setmetatable({}, LOC_META) end,
  CreateFromBagAndSlot = function(_, bag, slot) return setmetatable({ bagID = bag, slotIndex = slot }, LOC_META) end,
  CreateFromEquipmentSlot = function(_, slot) return setmetatable({ equipmentSlotIndex = slot }, LOC_META) end,
}
-- DE: Was die VM schon kann (eigener Interpreter), bleibt unberührt. EN: what the VM already has (own interpreter) stays untouched.
if @NATIVE@ then
  for k in pairs(API) do
    if not pre[k] then
      local c, kk = getp(k)
      if c and c[kk] ~= nil then API[k] = nil end
    end
  end
end
`;

const REWRITE_LUA = String.raw`
do
  local origLoad = loadstring
  G.loadstring = function(src, name)
    if type(src) == "string" then
      local r = pack(hostRewrite(src, name or src))
      if r[1] == true and type(r[2]) == "string" then src = r[2] end
    end
    return origLoad(src, name)
  end
end
`;

/** DE: Datei-Argumente eines Addons: eine Tabelle je Addon (ClassicAPI). EN: file arguments of an addon: one table per addon (ClassicAPI). */
const ADDON_TABLES = `
local __addonTables = {}
function __fw_addon_table(name)
  local t = __addonTables[name]
  if not t then t = {}; __addonTables[name] = t end
  return t
end
`;

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

// DE: `time`/`date`/`difftime` wie im Spiel (auf jeder VM). EN: `time`/`date`/`difftime` as in the game (on every VM).
const TIME_LUA = String.raw`G.time = function(t)
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
G.difftime = function(a, b) return a - (b or 0) end`;

export function buildPrelude(target: ResolvedTarget, opts: { rewrite?: boolean; vm?: "5.0" | "5.1" } = {}): string {
  // DE: Maßgeblich ist die Version der VM, nicht des Ziels (ClassicAPI = 5.1-Syntax auf der 5.0-VM).
  // EN: the VM version counts, not the target's (ClassicAPI = 5.1 syntax on the 5.0 VM).
  const v50 = (opts.vm ?? target.luaVersion) === "5.0";
  const classic = target.syntax === "lua51-transpiled" && v50;
  const classicApi = target.syntax === "lua51-transpiled";
  const kinds = [...target.widgets.keys()].map((k) => `[${JSON.stringify(k)}]=${luaList(methodNames(target, k))}`).join(",\n");
  const aliases = Object.entries(LIB_ALIASES).map(([k, v]) => `[${JSON.stringify(k)}]=${JSON.stringify(v)}`).join(",");
  const names = [...target.functions.keys()];
  const pack = v50 ? "local function pack(...) return arg end" : 'local function pack(...) return { n = select("#", ...), ... } end';
  const unp = v50 ? "local unp = unpack" : "local function unp(t) return unpack(t, 1, t.n) end";
  const printBody = v50 ? "local a = arg" : "local a = pack(...)";
  const nativeStrip = v50
    ? `
${TIME_LUA}
G.os, G.io, G.debug, G.loadlib, G.dofile, G.loadfile, G.require, G._TRACEBACK = nil, nil, nil, nil, nil, nil, nil, nil
${classic ? "" : "G.coroutine = nil"}`
    : `${TIME_LUA}
`;

  return `-- Freewood simulation prelude (generated)
${classic ? CLASSIC_HELPERS : ""}
${target.syntax === "lua51-transpiled" ? ADDON_TABLES : ""}
local G = _G
local type, tostring, tonumber, pairs, ipairs, error, pcall, setmetatable = type, tostring, tonumber, pairs, ipairs, error, pcall, setmetatable
local sfind, ssub, slower, sgsub = string.find, string.sub, string.lower, string.gsub
local tconcat = table.concat
local unpack = unpack
local hostApi, hostM, hostLog, hostTime, hostDate, hostMktime, hostRewrite = __fw_api, __fw_m, __fw_log, __fw_time, __fw_date, __fw_mktime, __fw_rewrite
G.__fw_api, G.__fw_m, G.__fw_log, G.__fw_time, G.__fw_date, G.__fw_mktime, G.__fw_rewrite = nil, nil, nil, nil, nil, nil, nil
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
local EH
local function reportErr(err)
  hostLog("error", tostring(err))
  if EH then pcall(EH, err) end
end

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

${JSON_LUA}
local PJ = MK .. "J"
local function un1(v)
  if type(v) == "string" and ssub(v, 1, 2) == PJ then
    return (jdec(ssub(v, 3), 1))
  end
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
    return PJ .. jenc(v, 0)
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

API.seterrorhandler = function(f) EH = f end
API.geterrorhandler = function() return EH or function(e) hostLog("error", tostring(e)) end end
API.GetNumFrames = function()
  local n = 0
  for _ in pairs(FR) do n = n + 1 end
  return n
end
API.EnumerateFrames = function(prev)
  local pid = -1
  if prev and ID[prev] then pid = ID[prev] end
  local best
  for id in pairs(FR) do
    if type(id) == "number" and id > pid and (not best or id < best) then best = id end
  end
  if best then return FR[best] end
  return nil
end
API.RunScript = function(text)
  local f, err = (G.loadstring or loadstring)(text)
  if not f then error(err, 2) end
  f()
end
API.CreateFont = function(name)
  local f = { _font = "Fonts\\\\FRIZQT__.TTF", _size = 12, _flags = "", _c = { 1, 1, 1, 1 } }
  f.SetFont = function(self, p, sz, fl) self._font, self._size, self._flags = p, sz, fl or "" end
  f.GetFont = function(self) return self._font, self._size, self._flags end
  f.SetTextColor = function(self, r, g, b, a) self._c = { r, g, b, a or 1 } end
  f.GetTextColor = function(self) return self._c[1], self._c[2], self._c[3], self._c[4] end
  f.SetFontObject = function(self, o) if o then self._font, self._size, self._flags = o:GetFont() end end
  f.GetName = function(self) return name end
  f.SetShadowColor = function() end
  f.SetShadowOffset = function() end
  f.SetSpacing = function() end
  f.SetJustifyH = function() end
  f.SetJustifyV = function() end
  if name then G[name] = f end
  return f
end
API.securecall = function(f, ...)
  local a = ${v50 ? "arg" : "pack(...)"}
  if type(f) == "string" then f = G[f] end
  return f(unp(a))
end
API.securecallfunction = API.securecall
API.securecallmethod = function(obj, method, ...)
  local a = ${v50 ? "arg" : "pack(...)"}
  return obj[method](obj, unp(a))
end
API.secureexecuterange = function(t, fn, ...)
  local a = ${v50 ? "arg" : "pack(...)"}
  for k, v in pairs(t) do fn(k, v, unp(a)) end
end
API.GetClickFrame = function(n) return G[n] end
API.FillLocalizedClassList = function(t, female)
  t = t or {}
  t.WARRIOR, t.PALADIN, t.HUNTER, t.ROGUE, t.PRIEST = "Warrior", "Paladin", "Hunter", "Rogue", "Priest"
  t.SHAMAN, t.MAGE, t.WARLOCK, t.DRUID = "Shaman", "Mage", "Warlock", "Druid"
  return t
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

${classicApi ? CLASSIC_API.split("@ARGS@").join(v50 ? "arg" : "pack(...)").split("@NATIVE@").join(v50 ? "false" : "true") : ""}

local function install(name, aliasPass)
  local impl = API[name]
  if impl then
    if not aliasPass then setp(name, impl) end
    return
  end
  local al = ALIAS[name]
  if al then
    if not aliasPass then return end
    local c, k = getp(al)
    if c and c[k] ~= nil then setp(name, c[k]); return end
  elseif aliasPass then
    return
  end
  local c, k = getp(name)
  if not (c and c[k] ~= nil and ssub(name, 1, 2) ~= "C_") then setp(name, apiw(name)) end
end
for _, name in ipairs(NAMES) do install(name, false) end
for _, name in ipairs(NAMES) do install(name, true) end

${classic && opts.rewrite ? REWRITE_LUA : ""}
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
    if not ok then reportErr(err) end
  end
  if saved then
    G.this, G.event, G.arg1, G.arg2, G.arg3, G.arg4, G.arg5, G.arg6, G.arg7, G.arg8, G.arg9 = saved[1], saved[2], saved[3], saved[4], saved[5], saved[6], saved[7], saved[8], saved[9], saved[10], saved[11]
  end
end

function __fw_timer(hid, tid, pass)
  local fn = HD[hid]
  local ok, err
  if pass then ok, err = pcall(fn, TM[tid]) else ok, err = pcall(fn) end
  if not ok then reportErr(err) end
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
          if not ok then reportErr(err) end
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
