/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Karte, Waypoints, Flugpunkte · map, waypoints, taxi
 */
import assert from "node:assert/strict";
import { engines, run, targets } from "./harness.js";

// ===== [S1] Karte · map =====

engines("C_Map: zones, positions, conversion, waypoint and hyperlink", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local id = C_Map.GetBestMapForUnit("player")
    local info = C_Map.GetMapInfo(id)
    local pos = C_Map.GetPlayerMapPosition(id, "player")
    local x, y = pos:GetXY()
    local cid, world = C_Map.GetWorldPosFromMapPos(id, pos)
    local back, pos2 = C_Map.GetMapPosFromWorldPos(cid, world)
    local kids = C_Map.GetMapChildrenInfo(-14)
    local ok = C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(id, 0.5, 0.25))
    local hl = C_Map.GetUserWaypointHyperlink()
    local wp = C_Map.GetUserWaypoint()
    local px, py = C_Map.GetUserWaypointPositionForMap(-14):GetXY()
    local before = C_Map.HasUserWaypoint()
    C_Map.ClearUserWaypoint()
    local w, h = C_Map.GetMapWorldSize(id)
    return id, info.name, info.mapType, x > 0 and x < 1, cid, back, pos2.x == x, table.getn(kids) > 0, ok, hl, wp.position.x, px > 0 and px < 1, before, C_Map.HasUserWaypoint(), w > h, C_Map.GetAreaInfo(87), C_Map.GetBestMapForUnit("target")
  `);
  assert.deepEqual(v.slice(0, 2), [12, "Elwynn Forest"]);
  assert.equal(v[2], 3);
  assert.equal(v[3], true);
  assert.equal(v[4], 0);
  assert.equal(v[5], 12);
  assert.equal(v[6], true);
  assert.equal(v[7], true);
  assert.equal(v[8], true);
  assert.match(String(v[9]), /^\|cffffff00\|Hworldmap:12:5000:2500\|h\[Map Pin Location\]\|h\|r$/);
  assert.equal(v[10], 0.5);
  assert.deepEqual(v.slice(11), [true, true, false, true, "Goldshire"]);
});

engines("C_Map: overlays, exploration, areas and taxi nodes", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local ov = C_Map.GetMapOverlays(12)
    local ex = C_MapExplorationInfo.GetExploredMapTextures(12)
    local un = C_MapExplorationInfo.GetUnexploredMapTextures(12)
    local areas = C_Map.GetAreas()
    local nodes = C_TaxiMap.GetTaxiNodesForMap(0)
    local paths = C_TaxiMap.GetTaxiPaths()
    local wp = C_TaxiMap.GetTaxiPathWaypoints(paths[1].pathID)
    local trig = C_Map.GetAreaTriggerInfo(1)
    local a, b, c, d = C_Map.GetMapRectOnMap(12, -14)
    return table.getn(ov), table.getn(ex), table.getn(un), areas[12], table.getn(nodes), nodes[1].faction == Enum.FlightPathFaction.Alliance, table.getn(wp), trig.areaID, a < b and c < d, C_Map.CanSetUserWaypointOnMap(-694), C_Map.MapHasArt(12)
  `);
  assert.deepEqual(v, [2, 2, 0, "Elwynn Forest", 3, true, 2, 12, true, false, true]);
});

// ===== [S2] Kleine Namespaces · small namespaces =====

engines("small namespaces: addons, coin text, colors, JSON, encoding, atlas, macros", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local loaded1, loaded2 = C_AddOns.IsAddOnLoaded("Blizzard_AuctionUI")
    local ok, why = C_AddOns.LoadAddOn("Blizzard_AuctionUI")
    local a1 = C_AddOns.IsAddOnLoaded(2)
    local c = C_ClassColor.GetClassColor("MAGE")
    local json = C_EncodingUtil.SerializeJSON({ a = 1, list = { 1, 2, 3 }, s = "x\\"y" })
    local back = C_EncodingUtil.DeserializeJSON(json)
    C_Texture.RegisterAtlas("MyAtlas", "Interface\\\\MyAddon\\\\Sheet", 64, 32, 0, 0.5, 0, 1)
    local info = C_Texture.GetAtlasInfo("MyAtlas")
    local idx = C_Macro.CreateMacro("Fb", "INV_Misc_Bone_01", "/cast Fireball", false)
    local mi = C_Macro.GetMacroIcon(idx)
    return loaded1, ok, a1, c:GenerateHexColor(), back.a, back.list[3], back.s, C_EncodingUtil.EncodeBase64("Hello"), C_EncodingUtil.DecodeBase64("SGVsbG8="), C_EncodingUtil.EncodeHex("AB"), C_EncodingUtil.DecompressString(C_EncodingUtil.CompressString("zip me")), GetCoinText(123456), info.width, info.rightTexCoord, C_Texture.GetAtlasID("MyAtlas") < 0, mi, C_EventUtils.IsEventValid("PLAYER_LOGIN"), C_EventUtils.IsEventValid("NOPE_EVENT")
  `);
  assert.deepEqual(v, [false, 1, true, "ff69ccf0", 1, 3, 'x"y', "SGVsbG8=", "Hello", "4142", "zip me", "12 Gold, 34 Silver, 56 Copper", 64, 0.5, true, "Interface\\Icons\\INV_Misc_Bone_01", true, false]);
});

// ===== [S3] Ausrüstung, Cursor, Sets · equipment, cursor, sets =====

engines("equipment, cursor, bag moves and equipment sets", async (mk) => {
  const t = await targets();
  for (const target of [t.v!, t.c!]) {
    const sim = await mk(target);
    const v = run(sim, `
      local slot, tex = GetInventorySlotInfo("MainHandSlot")
      local link = GetInventoryItemLink("player", 16)
      local before = GetInventoryItemTexture("player", 4)
      PickupInventoryItem(16)
      local holds = CursorHasItem()
      PickupContainerItem(0, 5)
      local back = GetContainerItemInfo(0, 5)
      PickupContainerItem(0, 2)
      ClearCursor()
      local stillThere = GetContainerItemInfo(0, 2)
      return slot, string.find(link, "Worn Shortsword") ~= nil, before ~= nil, holds, back ~= nil, stillThere ~= nil, CursorHasItem(), GetBagName(0), ContainerIDToInventoryID(1)
    `);
    assert.deepEqual(v, [16, true, true, 1, true, true, undefined, "Backpack", 20]);
  }
  const sim = await mk(t.c!);
  const v = run(sim, `
    local dur, max = GetInventoryItemDurability(7)
    local id = C_EquipmentSet.CreateEquipmentSet("Starter", "INV_Misc_Bone_01")
    local name, icon, sid, isEq, numItems, numEq = C_EquipmentSet.GetEquipmentSetInfo(id)
    PickupInventoryItem(16)
    PickupContainerItem(0, 6)
    local _, _, _, eq2 = C_EquipmentSet.GetEquipmentSetInfo(id)
    local used = C_EquipmentSet.UseEquipmentSet(id)
    local _, _, _, eq3 = C_EquipmentSet.GetEquipmentSetInfo(id)
    local ids = C_EquipmentSet.GetItemIDs(id)
    local tbl = GetInventoryItemsForSlot(16, {})
    local n = 0
    for _ in pairs(tbl) do n = n + 1 end
    local moved = C_Container.MoveItem(0, 2, 0, 9, 3)
    local a = C_Container.GetContainerItemInfo(0, 9)
    return dur, max, name, isEq, numItems, numEq, eq2, used, eq3, ids[16], ids[1], n > 0, moved, a and a.stackCount, C_Container.SwapItems(0, 9, 0, 10), IsDualWielding(), GetAverageItemLevel() >= 0
  `);
  assert.deepEqual(v, [20, 20, "Starter", true, 4, 4, false, true, true, 25, 0, true, true, 3, true, false, true]);
});

// ===== [S4] Gegenstände · items =====

engines("C_Item: locations, base data, stats, equip and use", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local loc = ItemLocation:CreateFromBagAndSlot(0, 2)
    local id = C_Item.GetItemID(loc)
    local guid = C_Item.GetItemGUID(loc)
    local back = C_Item.GetItemLocation(guid)
    local cls, sub = C_Item.GetItemClassInfo(2), C_Item.GetItemSubClassInfo(2, 7)
    local stats = C_Item.GetItemStats(6124)
    local d = C_Item.GetItemStatDelta(6124, 25)
    local instant1, instant2, instant3, equipLoc = C_Item.GetItemInfoInstant(25)
    C_Item.EquipItemByName(2092)
    local eq = C_Item.IsEquippedItem(2092)
    local r, g, b, hex = GetItemQualityColor(3)
    local data = C_Item.GetItemDataByID(6948)
    return id, back.bagID, back.slotIndex, cls, sub, stats.RESISTANCE0_NAME, d.RESISTANCE0_NAME, instant1, equipLoc, C_Item.GetStackCount(loc), C_Item.IsEquippableItem(25), C_Item.IsEquippedItem(25), hex, data.name, C_Item.GetItemInventorySlotKey(1), C_Item.IsConsumableItem(5742), IsEquippedItemType("Weapon")
  `);
  assert.deepEqual(v, [2589, 0, 2, "Weapon", "One-Handed Swords", 5, 5, 25, "INVTYPE_WEAPON", 7, true, true, "|cff0070dd", "Hearthstone", "INVTYPE_HEAD", true, true]);
});

// ===== [S5] Zauber · spells =====

engines("spells: cast time, cooldown, power, aura, interrupt and info functions", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  run(sim, `
    seen = {}
    local f = CreateFrame("Frame")
    f:RegisterEvent("SPELLCAST_START") f:RegisterEvent("SPELLCAST_STOP") f:RegisterEvent("SPELLCAST_INTERRUPTED") f:RegisterEvent("SPELLCAST_FAILED")
    f:SetScript("OnEvent", function() table.insert(seen, event .. ":" .. tostring(arg1)) end)
  `);
  run(sim, `local p = C_Spell.GetSpellPowerCost(6673) pcost = p[1].cost ptype = p[1].name`);
  run(sim, `CastSpellByName("Fireball")`);
  const mid = run(sim, `local n, _, _, s, e = C_Spell.UnitCastingInfo("player") return n, e > s, IsCurrentCast("Fireball")`);
  assert.deepEqual(mid, ["Fireball", true, 1]);
  sim.advance(1.6);
  const after = run(sim, `
    CastSpellByName("Battle Shout")
    local cd = C_Spell.GetSpellCooldown(133)
    local hasAura = C_UnitAuras and 1 or 0
    local usable, noMana = IsUsableSpell("Fireball")
    return C_Spell.UnitCastingInfo("player"), cd.duration > 0, cd.duration, UnitMana and 1 or 0, usable, GetSpellCooldown("Heroic Strike"), table.concat(seen, ",")
  `);
  assert.equal(after[0], undefined);
  assert.equal(after[1], true);
  assert.equal(String(after[6]).includes("SPELLCAST_START:Fireball"), true);
  assert.equal(String(after[6]).includes("SPELLCAST_STOP:Fireball"), true);
  sim.advance(2);
  const v = run(sim, `
    local nm, ic, cnt = UnitBuff("player", 1)
    local s1 = C_Spell.IsSpellHarmful(133)
    local school = C_Spell.GetSchoolString(4)
    CastSpellByName("Hearthstone")
    SpellStopCasting()
    return s1, school, GetSpellInfo(133), C_Spell.GetSpellDescription(133) ~= nil, C_Spell.IsAutoAttackSpell(6603), C_Spell.GetSpellLevelInfo(133), C_Spell.GetSpellCooldown(8690).duration
  `);
  assert.deepEqual(v.slice(0, 5), [true, "Fire", "Fireball", true, true]);
  assert.match(sim.log.map((l) => l.text).join("\n"), /Cast of Hearthstone stopped/);
});

engines("C_UnitAuras: positional, slots, instance ids, player buffs", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local slots = { C_UnitAuras.GetAuraSlots("player", "HELPFUL") }
    local n1 = C_UnitAuras.UnitAura("player", 1, "HELPFUL")
    local d = C_UnitAuras.GetAuraDataBySlot("player", 1)
    local byId = d and C_UnitAuras.GetAuraDataByAuraInstanceID("player", d.auraInstanceID)
    local c = C_UnitAuras.GetAuraDispelTypeColor("Magic")
    local id, perm = GetPlayerBuff(1, "HELPFUL")
    return type(slots), (d and d.auraInstanceID ~= nil) and 1 or 0, (byId and byId.name == d.name) and 1 or 0, c.b, type(id), C_UnitAuras.UnitDebuff("player", 99)
  `);
  assert.equal(v[0], "table");
  assert.equal(v[3], 1);
  assert.equal(v[4], "number");
  assert.equal(v[5], undefined);
});

engines("world: zones, time, keys, sound, targeting, bar, quests, talents, taxi", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  sim.setKey("LSHIFT", true);
  const v = run(sim, `
    local z, rz = GetZoneText(), GetRealZoneText()
    local h, m = GetGameTime()
    TargetUnit("party1")
    local name1 = UnitName("target")
    ClearTarget()
    local none = UnitExists("target") and 1 or 0
    TargetLastTarget()
    local back = UnitName("target")
    TargetNearestEnemy()
    PlaySound("igMainMenuOpen")
    local recent = C_Sound.GetRecentSoundFiles()
    return z, rz, (h >= 0 and h < 24) and 1 or 0, IsShiftKeyDown() and 1 or 0, IsControlKeyDown() and 1 or 0, IsModifiedClick("CHATLINK") and 1 or 0,
      name1, none, back, UnitName("target"), type(recent), HasAction(1) and 1 or 0, UnitIsDead("target") and 1 or 0, UnitReaction("target", "player"), UnitCanAttack("player", "target") and 1 or 0
  `);
  assert.equal(v[0], "Elwynn Forest");
  assert.equal(v[1], "Elwynn Forest");
  assert.deepEqual(v.slice(2, 9), [1, 1, 0, 1, "Helper", 0, "Helper"]);
  assert.equal(v[9], "Defias Pillager");
  assert.deepEqual(v.slice(10), ["table", 1, 0, 2, 1]);
  const w = run(sim, `
    AddFriend("Newbie")
    local nf = GetNumFriends()
    local n1 = GetFriendInfo(1)
    local fi = C_FriendList.GetFriendInfo("aldenbrook")
    InviteByName("Zed")
    local np = GetNumPartyMembers()
    PromoteByName("Zed")
    local lead = GetPartyLeaderIndex()
    SetLootMethod("master")
    local lm = GetLootMethod()
    SetRaidTarget("party1", 3)
    ConvertToRaid()
    local raid = IsInRaid() and 1 or 0
    SendWho("mage")
    return nf, n1, fi.className, np, lead, lm, GetRaidTargetIndex("party1"), raid, GetNumIgnores(), GetIgnoreName(1), C_PlayerInfo.GUIDIsPlayer(UnitGUID("player")) and 1 or 0
  `);
  assert.deepEqual(w.slice(0, 4), [4, "Aldenbrook", "Mage", 2]);
  assert.deepEqual(w.slice(4), [2, "master", 3, 1, 1, "Spammerson", 1]);
  sim.advance(1);
  sim.openTaxi();
  const x = run(sim, `
    local n = GetNumWhoResults()
    local q = GetNumQuestLogEntries()
    SelectQuestLogEntry(2)
    AddQuestWatch(2)
    local w = GetNumQuestWatches()
    AbandonQuest()
    SetAbandonQuest()
    local pts = UnitCharacterPoints("player")
    LearnTalent(1, 1)
    local pts2 = UnitCharacterPoints("player")
    local nm, ic, spent = GetTalentTabInfo(1)
    local c = NumTaxiNodes()
    return n, w, pts, pts2, nm, spent, c, GetNumFriends(), (GetFramerate() > 0) and 1 or 0, SecondsToTime(3725)
  `);
  assert.equal(x[0], 1);
  assert.deepEqual(x.slice(2, 7), [51, 50, "Arms", 1, 2]);
  assert.equal(x[9], "1 Hr 2 Mins ");
});

engines("retail on the real Lua 5.1 VM: prelude, API, table length, string methods", async (mk) => {
  const t = await targets();
  const sim = await mk(t.r!);
  const v = run(sim, `
    local s = "abc"
    local tbl = { 1, 2, 3 }
    local id = C_Map.GetBestMapForUnit("player")
    return s:upper(), #tbl, select("#", 1, 2, 3), type(id), UnitName("player"), string.format("%d-%s", 7, "x"), math.floor(2.7)
  `);
  assert.deepEqual(v, ["ABC", 3, 3, "number", "Testhero", "7-x", 2]);
  assert.equal(sim.engine.luaVersion, "5.1");
});

engines("FreewoodProbe example addon runs through in the simulation", async (mk) => {
  const { readFileSync } = await import("node:fs");
  const code = readFileSync("examples/FreewoodProbe/FreewoodProbe.lua", "utf8");
  for (const id of ["v", "c"] as const) {
    const t = await targets();
    const sim = await mk(t[id]!);
    sim.loadSource(code, "FreewoodProbe.lua");
    sim.login("FreewoodProbe");
    sim.advance(5);
    sim.advance(160);
    const v = run(sim, `
      local db = FreewoodProbeDB
      local bad = ""
      for i = 1, table.getn(db.results) do
        local r = db.results[i]
        if not r.ok and (string.find(r.err, "syntax", 1, true)) then bad = bad .. r.name .. " => " .. r.err .. "\\n" end
      end
      return db.finished ~= nil and 1 or 0, table.getn(db.results), table.getn(db.events), bad
    `);
    assert.equal(v[0], 1, `${id}: probe did not finish`);
    assert.ok((v[1] as number) > 250, `${id}: expected many results, got ${String(v[1])}`);
    assert.equal(v[3], "", `${id}: syntax errors in the probe list:\n${String(v[3])}`);
  }
});

engines("FreewoodProbeWin addon: detects simulated windows and records their sessions", async (mk) => {
  const { readFileSync } = await import("node:fs");
  const code = readFileSync("examples/FreewoodProbeWin/FreewoodProbeWin.lua", "utf8");
  const t = await targets();
  const sim = await mk(t.c!);
  sim.loadSource(code, "FreewoodProbeWin.lua");
  sim.login("FreewoodProbeWin");
  sim.advance(30);
  for (const w of ["mail", "auction", "merchant", "trainer", "tradeskill", "craft", "bank", "questgiver", "stable", "battlefield", "charter", "trade", "itemtext", "lootroll"]) {
    if (w === "merchant") sim.openMerchant(); else sim.openWindow(w);
    sim.advance(3);
  }
  sim.advance(200);
  const v = run(sim, `
    local db = FreewoodProbeWinDB
    local seen, bad = {}, ""
    for i = 1, db.sessionCount do
      local s = db.sessions[i]
      seen[s.window] = table.getn(s.results)
      for j = 1, table.getn(s.results) do
        local r = s.results[j]
        if not r.ok and string.find(r.err, "syntax", 1, true) then bad = bad .. r.name .. " => " .. r.err .. "\\n" end
      end
    end
    local names = ""
    for k in pairs(seen) do names = names .. k .. "," end
    FW_NAMES = names
    return db.sessionCount, seen.general, seen.mail, seen.auction, seen.merchant, seen.trainer, seen.stable, seen.lootroll, bad
  `);
  assert.ok((v[0] as number) >= 12, `sessions: ${String(v[0])} ${String(run(sim, 'return FW_NAMES')[0])}`);
  for (const k of [1, 2, 3, 4, 5, 6, 7]) assert.ok((v[k] as number) >= 3, `group ${k} too small: ${String(v[k])}`);
  assert.equal(v[8], "", `syntax errors:\n${String(v[8])}`);
});

// ===== [S2] Addon-Nachrichten · addon messages (Forever_Failure F-20 bis F-23) =====

engines("C_ChatInfo.SendAddonMessage: result codes, self whisper, channel drop", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local got = {}
    local f = CreateFrame("Frame")
    f:RegisterEvent("CHAT_MSG_ADDON")
    f:RegisterEvent("CHAT_MSG_SYSTEM")
    f:SetScript("OnEvent", function(self, event, a1, a2, a3, a4) table.insert(got, event .. ":" .. tostring(a1)) end)
    local E = Enum.SendAddonMessageResult
    local reg = C_ChatInfo.RegisterAddonMessagePrefix("FWTEST")
    local self_ = C_ChatInfo.SendAddonMessage("FWTEST", "hi", "WHISPER", UnitName("player"))
    local other = C_ChatInfo.SendAddonMessage("FWTEST", "hi", "WHISPER", "Nobody Here")
    local say = C_ChatInfo.SendAddonMessage("FWTEST", "hi", "SAY")
    local guild = C_ChatInfo.SendAddonMessage("FWTEST", "hi", "OFFICER")
    local chan = C_ChatInfo.SendAddonMessage("FWTEST", "hi", "CHANNEL", 5)
    local nowhisper = C_ChatInfo.SendAddonMessage("FWTEST", "hi", "WHISPER")
    return reg, self_, other, say, guild, chan, nowhisper, E.InvalidChatType, E.NotInGuild
  `);
  assert.deepEqual(v, [true, 0, 0, 4, 10, 0, 4, 4, 10]);
});
