/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Helfer · helpers
 *  [S2] Frames und Skripte · frames and scripts
 *  [S3] Zeit · time
 *  [S4] Welt und Einheiten · world and units
 *  [S5] Ende-zu-Ende · end to end (Graph, Formular)
 */
import { test as nodeTest } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FormModel, Graph, Kernel, WowSim, createWasmEngine, supportsRealVm, generateFormLua, generateLua, type ResolvedTarget } from "../src/index.js";
import { loadPluginsFromRoot } from "../src/node/fs-loaders.js";

// ===== [S1] Helfer · helpers =====
async function targets(): Promise<Record<string, ResolvedTarget>> {
  const k = new Kernel();
  const { plugins } = await loadPluginsFromRoot(join(process.cwd(), "plugins"));
  plugins.forEach((p) => k.plugins.register(p));
  return { v: k.plugins.resolve("vanilla-1.12"), c: k.plugins.resolve("classicapi-1.12"), r: k.plugins.resolve("retail") };
}
const texts = (s: WowSim, kind: string) => s.log.filter((l) => l.kind === kind).map((l) => l.text);

const wasmBytes = (): Promise<BufferSource> => Promise.resolve(readFileSync(join(process.cwd(), "runtimes/lua50/lua50.wasm")));

// DE: Alle Tests laufen auf dem eigenen Interpreter UND auf der echten Lua-5.0-VM.
// EN: all tests run on the own interpreter AND on the real Lua 5.0 VM.
for (const eng of ["interp", "wasm"] as const) {
const test = (name: string, fn: () => Promise<void>): void => { nodeTest(`[${eng}] ${name}`, fn); };
const mk = async (target: ResolvedTarget, scenario?: ConstructorParameters<typeof WowSim>[1]): Promise<WowSim> => {
  if (eng === "interp" || !supportsRealVm(target)) return new WowSim(target, scenario);
  return new WowSim(target, scenario, await createWasmEngine(wasmBytes, target.syntax === "lua51-transpiled"));
};

// ===== [S2] Frames und Skripte · frames and scripts =====
test("vanilla: global script args (this, event, arg1) and chat output", async () => {
  const t = await targets();
  const sim = await mk(t.v!);
  const r = sim.loadSource(`
    local f = CreateFrame("Frame", "MyFrame")
    f:RegisterEvent("ADDON_LOADED")
    f:SetScript("OnEvent", function()
      DEFAULT_CHAT_FRAME:AddMessage(event .. ":" .. tostring(arg1) .. ":" .. this:GetName())
    end)
  `);
  assert.ok(r.ok);
  sim.fireEvent("ADDON_LOADED", "MyAddon");
  assert.deepEqual(texts(sim, "chat"), ["ADDON_LOADED:MyAddon:MyFrame"]);
  assert.equal(sim.getGlobal("event"), undefined, "globals are restored after the script");
});

test("retail: parameters (self, event, ...) and no globals", async () => {
  const t = await targets();
  const sim = await mk(t.r!);
  sim.loadSource(`
    local f = CreateFrame("Frame")
    f:RegisterEvent("ADDON_LOADED")
    f:SetScript("OnEvent", function(self, event, name)
      print(event, name, type(this), type(arg1))
    end)
  `);
  sim.fireEvent("ADDON_LOADED", "X");
  assert.deepEqual(texts(sim, "print"), ["ADDON_LOADED\tX\tnil\tnil"]);
});

test("methods exist only where the target data says so", async () => {
  const t = await targets();
  const code = `local f = CreateFrame("Frame") f:SetSize(10, 20) DEFAULT_CHAT_FRAME:AddMessage(f:GetWidth())`;
  const v = await mk(t.v!);
  const rv = v.loadSource(code);
  assert.equal(rv.ok, false);
  assert.match(rv.error!.message, /attempt to call method `SetSize' \(a nil value\)/);
  const c = await mk(t.c!);
  assert.ok(c.loadSource(code).ok);
  assert.deepEqual(texts(c, "chat"), ["10"]);
  const bad = await mk(t.v!);
  assert.match(bad.loadSource(`CreateFrame("Banana")`).error!.message, /unknown frame type 'Banana'/);
});

test("hierarchy: parent, show/hide scripts, visibility, click", async () => {
  const t = await targets();
  const sim = await mk(t.v!);
  sim.loadSource(`
    local p = CreateFrame("Frame", "P", UIParent)
    local b = CreateFrame("Button", "B", p)
    clicks = 0
    b:SetScript("OnClick", function() clicks = clicks + 1 this:GetParent():Hide() end)
    p:SetScript("OnHide", function() hidden = true end)
    c = CreateFrame("CheckButton", "C", p)
  `);
  const b = sim.byName("B")!;
  assert.equal(sim.visible(b), true);
  sim.click("B");
  assert.equal(sim.getGlobal("clicks"), 1);
  assert.equal(sim.getGlobal("hidden"), true);
  assert.equal(sim.visible(b), false);
  sim.click("C");
  assert.equal(sim.byName("C")!.checked, true);
  sim.click("B"); // still works, hidden parents do not block scripted clicks
  assert.equal(sim.getGlobal("clicks"), 2);
});

test("script errors are logged, not thrown, and later handlers still run", async () => {
  const t = await targets();
  const sim = await mk(t.v!);
  sim.loadSource(`
    local a = CreateFrame("Frame") a:RegisterEvent("PLAYER_LOGIN") a:SetScript("OnEvent", function() error("boom") end)
    local b = CreateFrame("Frame") b:RegisterEvent("PLAYER_LOGIN") b:SetScript("OnEvent", function() ok = true end)
  `);
  sim.fireEvent("PLAYER_LOGIN");
  assert.match(texts(sim, "error")[0]!, /boom/);
  assert.equal(sim.getGlobal("ok"), true);
});

test("unknown events and unsimulated API produce warnings", async () => {
  const t = await targets();
  const sim = await mk(t.v!);
  sim.loadSource(`local f = CreateFrame("Frame") f:RegisterEvent("NOT_REAL") local x = f.nothing`);
  sim.fireEvent("ALSO_NOT_REAL");
  const w = texts(sim, "warn");
  assert.ok(w.some((x) => x.includes("NOT_REAL") && x.includes("RegisterEvent")));
  assert.ok(w.some((x) => x.includes("ALSO_NOT_REAL")));
});

// ===== [S3] Zeit · time =====
test("OnUpdate, C_Timer.After, tickers and cancel", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  sim.loadSource(`
    updates, ticks, after = 0, 0, nil
    local f = CreateFrame("Frame")
    f:SetScript("OnUpdate", function() updates = updates + 1 end)
    C_Timer.After(1, function() after = GetTime() end)
    ticker = C_Timer.NewTicker(0.5, function(tk) ticks = ticks + 1 end)
  `);
  sim.advance(0.99);
  assert.equal(sim.getGlobal("after"), undefined);
  sim.advance(0.02);
  assert.equal(sim.getGlobal("after") !== undefined, true);
  assert.equal(sim.getGlobal("ticks"), 2);
  sim.loadSource(`ticker:Cancel()`);
  sim.advance(5);
  assert.equal(sim.getGlobal("ticks"), 2);
  assert.ok((sim.getGlobal("updates") as number) > 100);
  const v = await mk(t.v!);
  assert.match(v.loadSource(`C_Timer.After(1, function() end)`).error!.message, /global `C_Timer'/);
});

test("slash commands", async () => {
  const t = await targets();
  const sim = await mk(t.v!);
  sim.loadSource(`
    SLASH_HELLO1 = "/hello"
    SLASH_HELLO2 = "/hi"
    SlashCmdList["HELLO"] = function(msg) DEFAULT_CHAT_FRAME:AddMessage("hello " .. msg) end
  `);
  assert.ok(sim.runSlash("/hi world"));
  assert.ok(sim.runSlash("/HELLO there"));
  assert.equal(sim.runSlash("/nope"), false);
  assert.deepEqual(texts(sim, "chat"), ["hello world", "hello there"]);
});

// ===== [S4] Welt und Einheiten · world and units =====
test("unit API: vanilla reports foreign health as percent, retail as numbers", async () => {
  const t = await targets();
  const code = `return UnitName("target"), UnitHealth("target"), UnitHealthMax("target"), UnitHealth("player"), UnitName("party1"), UnitExists("pet")`;
  const v = await mk(t.v!);
  assert.deepEqual(v.exec(code).values, ["Defias Pillager", 100, 100, 3200, "Helper", false]);
  v.setHealth("target", 210);
  assert.deepEqual(v.exec(`return UnitHealth("target")`).values, [50]);
  const r = await mk(t.r!);
  r.setHealth("target", 210);
  assert.deepEqual(r.exec(`return UnitHealth("target"), UnitHealthMax("target")`).values, [210, 420]);
});

test("world changes fire events; chat message events", async () => {
  const t = await targets();
  const sim = await mk(t.v!);
  sim.loadSource(`
    local f = CreateFrame("Frame")
    for _, e in ipairs({"PLAYER_REGEN_DISABLED","PLAYER_TARGET_CHANGED","UNIT_HEALTH","CHAT_MSG_SAY"}) do f:RegisterEvent(e) end
    f:SetScript("OnEvent", function() seen = (seen or "") .. event .. "(" .. tostring(arg1) .. ");" end)
    SendChatMessage("hi", "SAY")
  `);
  sim.setCombat(true);
  sim.setTarget(undefined);
  sim.setHealth("player", 100);
  assert.equal(sim.getGlobal("seen"), "CHAT_MSG_SAY(hi);PLAYER_REGEN_DISABLED(nil);PLAYER_TARGET_CHANGED(nil);UNIT_HEALTH(player);");
});

test("ClassicAPI target keeps Lua 5.0 library functions next to 5.1 syntax", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.exec(`
    local n = 0
    for w in string.gfind("a b c", "%a") do n = n + 1 end
    return n, #"abc", math.mod(7, 3), 7 % 3, getn({1,2}), strlen("xy"), (strsplit(",", "a,b"))
  `);
  assert.deepEqual(r.values, [3, 3, 1, 1, 2, 2, "a"]);
});

test("ClassicAPI: Lua 5.1 library backports (select, unpack range, xpcall args, table.*, string.*)", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.exec(`
    local out = {}
    local function add(...) out[table.getn(out) + 1] = tostring((select('#', ...))) .. ":" .. strjoin(",", ...) end
    add(select(2, "a", "b", "c"))
    add(select(-1, "a", "b", "c"))
    add(unpack({10, 20, 30}, 2))
    add(unpack({10, 20, 30}, 2, 2))
    add(xpcall(function(a, b) return a + b end, function(e) return e end, 2, 3))
    local w = {1, 2, 3, x = 1}
    local n1, n2, n3 = table.count(w)
    add(n1, n2, n3, table.maxn({[1] = "x", [9] = "y"}))
    add(table.getn(table.wipe(w)))
    add(math.modf(-3.7))
    add(string.match("2024-01-15", "(%d+)-(%d+)-(%d+)"))
    add(string.match("no digits", "%d+"))
    add(strmatch("hello", "l+"))
    add((string.gsub("$name the $class", "%$(%w+)", { name = "Bob", class = "Druid" })))
    add(strsplit(",", "a,b,c,d", 2))
    add(strsplit(" -", "a b-c"))
    add(strtrim("xxhelloxx", "x"))
    add(strconcat("a", "b", 1))
    add(math.huge == 1 / 0, collectgarbage("step"), type(collectgarbage("count")))
    return table.concat(out, ";")
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.equal(r.values[0], [
    "2:b,c", "1:c", "2:20,30", "1:20", "2:,5", "4:4,3,3,9", "1:0", "2:-3,-0.7",
    "3:2024,01,15", "1:", "1:ll", "1:Bob the Druid", "2:a,b,c,d", "3:a,b,c", "1:hello", "1:ab1", "3:,,number",
  ].join(";"));
});

test("ClassicAPI: 5.1 syntax in addon files, hex, long brackets, negative modulo", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.loadSource(`
    local name, tbl = ...
    tbl.x = 1
    result = name .. ":" .. tostring(tbl == select(2, ...)) .. ":" .. 0xFF .. ":" .. (-1 % 3) .. ":" .. [=[a]]b]=] .. ":" .. #tbl
  `, "main.lua", "TestAddon");
  assert.ok(r.ok, String(r.error?.message));
  assert.equal(sim.getGlobal("result"), "TestAddon:true:255:2:a]]b:0");
});

test("ClassicAPI: string methods, 60 upvalues and a fresh for-loop variable per pass", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const fns: string[] = [];
  const decl = Array.from({ length: 45 }, (_, i) => `local v${i} = ${i}`).join("\n");
  const sum = Array.from({ length: 45 }, (_, i) => `v${i}`).join(" + ");
  fns.push(decl, `function many() return ${sum} end`);
  const r = sim.exec(`
    ${fns.join("\n")}
    local show = {}
    for i, name in ipairs({ "a", "b" }) do show[i] = function() return name .. i end end
    return ("abc"):upper(), ("%d gold"):format(5), many(), show[1](), show[2]()
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.deepEqual(r.values, ["ABC", "5 gold", 990, "a1", "b2"]);
});

test("ClassicAPI: colour, text, number and expansion helpers follow the docs", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.exec(`
    local C = C_ColorUtil
    local h, s, v = C.ConvertRGBToHSV(0, 1, 0)
    local gh = C.ConvertRGBToHSV(0.5, 0.5, 0.5)
    local r, g, b = C.ConvertHSVToRGB(120, 1, 1)
    return h, s, v, gh, r, g, b,
      C.WrapTextInColor("Hi", { r = 1, g = 0, b = 0 }),
      C.GenerateTextColorCode({ r = 1, g = 0, b = 0 }),
      CalculateStringEditDistance("kitten", "sitting"), CalculateStringEditDistance("help", "hepl"),
      AbbreviateNumbers(1234), AbbreviateNumbers(12345), AbbreviateNumbers(1999999), AbbreviateNumbers(-12345), AbbreviateNumbers(1.5e10),
      BreakUpLargeNumbers(1234567), BreakUpLargeNumbers(123.456), BreakUpLargeNumbers(-1234567), BreakUpLargeNumbers(5),
      GetMaxPlayerLevel(), ClassicExpansionAtLeast(1), ClassicExpansionAtMost(0), InCombatLockdown()
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.deepEqual(r.values, [120, 1, 1, -1, 0, 1, 0, "|cffff0000Hi|r", "ffff0000", 3, 2,
    "1.2K", "12K", "1.9M", "-12345", "15", "1,234,567", "123.5", "-1,234,567", "5", 60, false, true, false]);
});

test("ClassicAPI: bags, items and spells answer from the scenario", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.exec(`
    local info = C_Container.GetContainerItemInfo(0, 2)
    local free = C_Container.GetContainerFreeSlots(0)
    local empty = C_Container.GetContainerItemInfo(0, 9)
    local sp = C_Spell.GetSpellInfo(78)
    local n, bt = C_Container.GetContainerNumFreeSlots(0)
    local nm, link, q = C_Item.GetItemInfo("Linen Cloth")
    local tex, cnt = GetContainerItemInfo(0, 2)
    return info.itemID, info.stackCount, info.hasNoValue, info.itemName, table.getn(free), free[1], empty,
      sp.name, sp.rank, sp.powerType, n, bt, C_Container.CalculateTotalNumberOfFreeBagSlots(),
      nm, link, q, C_Item.GetItemCount(2589), C_Item.GetItemMaxStackSizeByID(2589), C_Spell.DoesSpellExist(133),
      IsSpellKnown(78), IsSpellKnown(133), C_Spell.GetSpellLink(133), cnt, GetContainerNumSlots(1)
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.deepEqual(r.values, [2589, 7, false, "Linen Cloth", 14, 3, undefined, "Heroic Strike", "Rank 1", 1, 14, 0, 20,
    "Linen Cloth", "|cffffffff|Hitem:2589:0:0:0|h[Linen Cloth]|h|r", 1, 7, 20, true, true, false, "|cff71d5ff|Hspell:133:0|h[Fireball]|h|r", 7, 6]);
});

test("ClassicAPI: unit helpers answer from the scenario units", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.exec(`
    local g = UnitGUID("target")
    local cls, cid = UnitClassBase("player")
    local race, rid = UnitRaceBase("player")
    local inr, chk = UnitInRange("target")
    local d2 = UnitDistanceSquared("target")
    return cls, cid, race, rid, UnitPower("player"), UnitPowerMax("player"), UnitPowerMissing("player"), UnitPower("player", 0),
      string.len(g), string.sub(g, 1, 6), UnitCreatureID("target"), UnitCreatureID("player"), IsUnitToken("targettarget"), IsUnitToken("Bob"),
      UnitTokenFromName("help"), inr, chk, d2, UnitStandState("player"), UnitIsPet("pet"), UnitIsAFK("player"), UnitHealthMissing("player")
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.deepEqual(r.values, ["WARRIOR", 1, "Human", 1, 20, 100, 80, 0, 18, "0xF130", 589, undefined, true, false, "party1", true, true, 100, 0, false, false, 0]);
});

test("ClassicAPI: quest log, reputation and spellbook answer from the scenario", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.exec(`
    local n, q = GetNumQuestLogEntries()
    local info = C_QuestLog.GetInfo(2)
    local title, lvl, tag, hdr, coll, done = GetQuestLogTitle(3)
    local _, _, _, _, _, d2 = C_QuestLog.GetQuestLogTitle(3)
    local all = C_QuestLog.GetAllCompletedQuestIDs()
    local name, desc, standing, bmin, bmax, bval = GetFactionInfo(2)
    local fd = C_Reputation.GetFactionDataByID(72)
    local watched = C_Reputation.GetWatchedFactionData()
    local st = C_Reputation.GetFactionStandings()
    local item = C_SpellBook.GetSpellBookItemInfo(2, 0)
    local tab = C_SpellBook.GetSpellBookSkillLineInfo(1)
    local slot, book = FindSpellBookSlotByID(6673)
    C_Reputation.SetFactionInactiveByID(72)
    return n, q, info.title, info.questID, info.isHeader, title, done, d2, C_QuestLog.IsOnQuest(7), C_QuestLog.GetHeaderIndexForQuest(783),
      table.getn(all), all[1], name, standing, bmin, bmax, bval, fd.reaction, fd.isWatched, watched.name, st[47], item.name, item.subName, tab.numSpellBookItems,
      slot, book, GetSpellName(1, "spell"), IsPlayerSpell(78), C_Reputation.IsFactionActiveByID(72), GetFactionParentID(72), C_QuestLog.IsQuestFlaggedCompleted(6)
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.deepEqual(r.values, [3, 2, "Kobold Camp Cleanup", 7, false, "A Threat Within", 1, 1, true, 1, 3, 5, "Stormwind", 6, 9000, 21000, 9500, 6, true, "Stormwind", 1200,
    "Battle Shout", "Rank 1", 2, 2, "spell", "Heroic Strike", true, false, 469, true]);
});

test("ClassicAPI: CVars and calendar time follow the docs", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.exec(`
    local ok1 = C_CVar.SetCVar("SoftTargetFriend", 2)
    local v1 = GetCVar("SoftTargetFriend")
    local ro = C_CVar.SetCVar("realmList", "x")
    local none = C_CVar.SetCVar("doesNotExist", 1)
    RegisterCVar("myAddonFlags", "0")
    C_CVar.SetCVarBitfield("myAddonFlags", 1, true)
    C_CVar.SetCVarBitfield("myAddonFlags", 5, true)
    local flags = GetCVar("myAddonFlags")
    C_CVar.SetTempCVar("cameraDistanceMax", "40")
    local tmp = GetCVar("cameraDistanceMax")
    C_CVar.RemoveTempCVar("cameraDistanceMax")
    local value, def, _, _, _, _, readOnly = C_CVar.GetCVarInfo("realmList")
    local c = C_DateAndTime.GetCalendarTimeFromEpoch(0)
    local t1 = C_DateAndTime.AdjustTimeByDays({ year = 2026, month = 1, monthDay = 31, hour = 10, minute = 0 }, 1)
    return ok1, v1, ro, none, flags, tmp, GetCVar("cameraDistanceMax"), readOnly, C_CVar.GetCVarBool("gxMaximize"), C_CVar.GetCVarBitfield("myAddonFlags", 5),
      c.year, c.weekday, t1.month, t1.monthDay, C_DateAndTime.CompareCalendarTime(c, t1), GetServerTime() > 1700000000
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.deepEqual(r.values, [true, "2", false, undefined, "17", "40", "15", true, true, true, 1970, 5, 2, 1, -1, true]);
});

test("ClassicAPI: auras, macros and key bindings answer from the scenario", async () => {
  const t = await targets();
  const sim = await mk(t.c!);
  const r = sim.exec(`
    local d = C_UnitAuras.GetAuraDataByIndex("player", 1, "HELPFUL")
    local d2 = C_UnitAuras.GetAuraDataByIndex("player", 2, "HELPFUL")
    local all = C_UnitAuras.GetUnitAuras("player")
    local byName = C_UnitAuras.GetAuraDataBySpellName("player", "battle shout")
    local bySpell = C_UnitAuras.GetPlayerAuraBySpellID(21562)
    local tex, apps = UnitBuff("player", 1)
    local ran
    SlashCmdList["TESTM"] = function(msg) ran = msg end
    SLASH_TESTM1 = "/testm"
    RunMacroText("#show\\n/testm hello world\\n/stopmacro\\n/testm no")
    local n, spellRank, spellId = GetMacroSpell(1)
    return d.name, d.spellId, d.isHelpful, d.sourceUnit, d.duration, d2.spellId, table.getn(all), byName.spellId, bySpell.sourceUnit, tex, apps,
      GetMacroBody(1), GetMacroBody("Hi"), GetMacroIndexByName("Hi"), n, spellRank, spellId, ran,
      GetBindingByKey("ctrl-1"), GetBindingAction("W"), C_UnitAuras.GetAuraDataByIndex("player", 1, "HARMFUL")
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.deepEqual(r.values, ["Battle Shout", 6673, true, "player", 120, 21562, 2, 6673, "party1", "Interface\\Icons\\Ability_Warrior_BattleShout", 1,
    "#showtooltip\n/cast Battle Shout", "/script DEFAULT_CHAT_FRAME:AddMessage(\"hi\")", 2, "Battle Shout", "Rank 1", 6673, "hello world",
    "MULTIACTIONBAR1BUTTON1", "MOVEFORWARD", undefined]);
});

test("loot, merchant and gossip windows open, answer and change the bags", async () => {
  const t = await targets();
  for (const target of [t.v!, t.c!]) {
    const sim = await mk(target);
    sim.exec(`
      seen = {}
      local f = CreateFrame("Frame")
      f:RegisterEvent("LOOT_OPENED") f:RegisterEvent("MERCHANT_SHOW") f:RegisterEvent("GOSSIP_SHOW") f:RegisterEvent("PLAYER_MONEY")
      f:SetScript("OnEvent", function() table.insert(seen, event) end)
    `);
    sim.openLoot();
    sim.openMerchant();
    sim.openGossip();
    const r = sim.exec(`
      local _, lname, lcount = GetLootSlotInfo(1)
      local n0 = GetNumLootItems()
      LootSlot(1)
      local n1 = GetNumLootItems()
      local _, linen = GetContainerItemInfo(0, 2)
      local m1 = GetMerchantItemInfo(2)
      local money0 = GetMoney()
      BuyMerchantItem(1, 1)
      local money1 = GetMoney()
      UseContainerItem(0, 2)
      local sold = GetBuybackItemInfo(1) and 1 or 0
      local gtext = GetGossipText()
      local o1 = GetGossipOptions()
      return lname, lcount, n0, n1, linen, m1, money0 - money1, sold, GetMoney() > money1, gtext, o1, (GetGossipAvailableQuests()), table.getn(seen)
    `);
    assert.equal(r.ok, true, String(r.error?.message));
    assert.deepEqual(r.values, ["Linen Cloth", 2, 2, 1, 9, "Refreshing Spring Water", 25, 1, true, "Greetings, adventurer. Can I help you?", "I want to browse your goods.", "Kobold Camp Cleanup", 3]);
  }
  const sim = await mk((await targets()).c!);
  sim.openMerchant();
  const r = sim.exec(`
    local info = C_MerchantFrame.GetItemInfo(3)
    local junk = C_MerchantFrame.GetNumJunkItems()
    local g = C_GossipInfo.GetOptions()
    local q = C_GossipInfo.GetActiveQuests()
    return info.itemID, info.numAvailable, junk, C_MerchantFrame.IsSellAllJunkEnabled()
  `);
  assert.equal(r.ok, true, String(r.error?.message));
  assert.deepEqual(r.values, [4496, 3, 0, true]);
});

// ===== [S5] Ende-zu-Ende · end to end =====
test("graph output runs in the simulation (vanilla and retail)", async () => {
  const t = await targets();
  for (const [name, target] of [["vanilla", t.v!], ["retail", t.r!]] as const) {
    const g = new Graph(undefined, target);
    const ev = g.addNode("event", 0, 0, { event: "PLAYER_ENTERING_WORLD" });
    const call = g.addNode("call", 0, 0, { fn: "UnitName", "lit.unit": "player" });
    const cat = g.addNode("concat");
    const hello = g.addNode("string", 0, 0, { value: "Hello, " });
    const pr = g.addNode("print");
    g.connect({ node: ev.id, pin: "then" }, { node: call.id, pin: "in" });
    g.connect({ node: call.id, pin: "then" }, { node: pr.id, pin: "in" });
    g.connect({ node: hello.id, pin: "value" }, { node: cat.id, pin: "a" });
    g.connect({ node: call.id, pin: "name" }, { node: cat.id, pin: "b" });
    g.connect({ node: cat.id, pin: "result" }, { node: pr.id, pin: "text" });
    const gen = generateLua(g, target);
    assert.deepEqual(gen.warnings, [], name);
    const sim = await mk(target);
    assert.ok(sim.loadSource(gen.code, "graph.lua").ok, name);
    sim.login();
    assert.deepEqual(texts(sim, "chat"), ["Hello, Testhero"], name);
  }
});

test("graph with loop, variables and slash runs", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.c);
  const sl = g.addNode("slash", 0, 0, { command: "sum" });
  const setv = g.addNode("set_var", 0, 0, { name: "total", "lit.value": 0 });
  const lp = g.addNode("for", 0, 0, { "lit.from": 1, "lit.to": 4 });
  const add = g.addNode("math", 0, 0, { op: "+" });
  const get = g.addNode("get_var", 0, 0, { name: "total" });
  const acc = g.addNode("set_var", 0, 0, { name: "total" });
  const pr = g.addNode("print");
  const link = (a: string, ap: string, b: string, bp: string) => g.connect({ node: a, pin: ap }, { node: b, pin: bp });
  link(sl.id, "then", setv.id, "in");
  link(setv.id, "then", lp.id, "in");
  link(lp.id, "body", acc.id, "in");
  link(get.id, "value", add.id, "a");
  link(lp.id, "index", add.id, "b");
  link(add.id, "result", acc.id, "value");
  link(lp.id, "done", pr.id, "in");
  link(get.id, "value", pr.id, "text");
  const gen = generateLua(g, t.c!);
  assert.deepEqual(gen.warnings, []);
  const sim = await mk(t.c!);
  assert.ok(sim.loadSource(gen.code).ok);
  assert.ok(sim.runSlash("/sum"));
  assert.deepEqual(texts(sim, "chat"), ["10"]);
});

test("form output builds the same UI in the simulation", async () => {
  const t = await targets();
  const m = new FormModel();
  const main = m.add("Frame", null, { name: "Main", width: 200, height: 100, strata: "DIALOG" });
  m.setAnchor(main.id, { point: "CENTER", relativeTo: null, relativePoint: "CENTER", x: 0, y: 0 });
  const title = m.add("FontString", main.id, { name: "MainTitle", text: "Title" });
  m.setAnchor(title.id, { point: "TOP", relativeTo: null, relativePoint: "TOP", x: 0, y: -10 });
  const btn = m.add("Button", main.id, { name: "MainOK", width: 80, height: 22, text: "OK", scripts: { OnClick: "this:GetParent():Hide()" } });
  m.setAnchor(btn.id, { point: "BOTTOM", relativeTo: null, relativePoint: "BOTTOM", x: 0, y: 10 });
  const gen = generateFormLua(m, t.v!);
  assert.deepEqual(gen.warnings, []);
  const sim = await mk(t.v!);
  assert.ok(sim.loadSource(gen.code, "form.lua").ok, JSON.stringify(sim.log));
  const snap = sim.snapshot();
  const get = (n: string) => snap.find((x) => x.name === n)!;
  assert.deepEqual(get("Main").rect, { left: 412, bottom: 334, width: 200, height: 100 });
  assert.equal(get("MainTitle").text, "Title");
  assert.deepEqual(get("MainOK").rect, { left: 472, bottom: 344, width: 80, height: 22 });
  assert.equal(get("Main").strata, "DIALOG");
  sim.click("MainOK");
  assert.equal(sim.byName("Main")!.shown, false);
  // retail output uses (self, button, down) and runs too
  const r = await mk(t.r!);
  const rgen = generateFormLua(m, t.r!);
  const rr = r.loadSource(rgen.code.replace("this:GetParent()", "self:GetParent()"), "form.lua");
  assert.ok(rr.ok, JSON.stringify(r.log));
});

test("retail backdrop needs the BackdropTemplate", async () => {
  const t = await targets();
  const sim = await mk(t.r!);
  assert.match(sim.loadSource(`local f = CreateFrame("Frame") f:SetBackdrop({})`).error!.message, /attempt to call method 'SetBackdrop'/);
  assert.ok(sim.loadSource(`local f = CreateFrame("Frame", nil, UIParent, "BackdropTemplate") f:SetBackdrop({}) f:SetBackdropColor(0,0,0,1)`).ok);
});

test("vanilla environment: no io/os/debug, WoW-style time globals, 5.0 behaviour", async () => {
  const t = await targets();
  const sim = await mk(t.v!);
  const r = sim.exec(`return type(io), type(os), type(debug), type(date), type(time), type(print), type(table.getn), type(string.gfind), type(getglobal), type(select)`);
  assert.deepEqual(r.values, ["nil", "nil", "nil", "function", "function", "function", "function", "function", "function", "nil"]);
  assert.equal(sim.exec(`return time() == GetTime()`).values[0], true);
  const bad = sim.loadSource(`local s = "x"\nreturn s:upper()`);
  assert.equal(bad.ok, false, "string methods do not exist in Lua 5.0");
  assert.match(bad.error!.message, /attempt to index local `s' \(a string value\)/);
});

test("scripts: hooks run after the main handler, GetScript/HasScript, deferred nested scripts", async () => {
  const t = await targets();
  const sim = await mk(t.r!);
  sim.loadSource(`
    order = ""
    local f = CreateFrame("Frame", "HookMe")
    f:SetScript("OnShow", function() order = order .. "main;" end)
    f:HookScript("OnShow", function() order = order .. "hook;" end)
    f:Hide()
    f:Show()
    order = order .. "after-show;"
    has = f:HasScript("OnShow")
    got = type(f:GetScript("OnShow"))
  `);
  assert.equal(sim.getGlobal("order"), "after-show;main;hook;", "scripts triggered inside a call run after it (documented)");
  assert.equal(sim.getGlobal("has"), true);
  assert.equal(sim.getGlobal("got"), "function");
});

test("runaway scripts are stopped and logged; the simulation keeps working", async () => {
  const t = await targets();
  const sim = await mk(t.v!);
  const r = sim.loadSource(`while true do end`);
  assert.equal(r.ok, false);
  assert.ok(sim.log.some((l) => l.kind === "error"));
  assert.ok(sim.exec(`return 1 + 1`).ok, "VM is usable afterwards");
  assert.deepEqual(sim.exec(`return 1 + 1`).values, [2]);
});

}
