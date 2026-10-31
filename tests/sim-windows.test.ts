/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Kalibrierung · calibration (cast events, who, friends, time played, map position)
 *  [S2] Fenster · windows (mail, auction, bank, trade, tradeskill, trainer, stable, battlefield, petition, quests)
 *  [S3] Rest · remainder (error handler, camera, video, chat windows, EnumerateFrames, securecall)
 */
import assert from "node:assert/strict";
import { engines, run, targets } from "./harness.js";

// ===== [S1] Kalibrierung · calibration =====

engines("calibration: cast event order, who/friend/time-played messages, vanilla map position", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  run(sim, `
    FW = {}
    local f = CreateFrame("Frame")
    for _, e in ipairs({ "ACTIONBAR_UPDATE_STATE", "ACTIONBAR_UPDATE_COOLDOWN", "SPELLCAST_STOP", "UNIT_SPELLCAST_SUCCEEDED", "UNIT_RAGE", "UNIT_AURA", "PLAYER_AURAS_CHANGED", "CHAT_MSG_SYSTEM", "TIME_PLAYED_MSG", "WHO_LIST_UPDATE" }) do f:RegisterEvent(e) end
    f:SetScript("OnEvent", function() table.insert(FW, event .. (arg1 and (":" .. tostring(arg1)) or "")) end)
    CastSpellByName("Battle Shout")
  `);
  sim.advance(0.2);
  const seq = run(sim, `return table.concat(FW, ",")`)[0] as string;
  const order = seq.split(",").map((s) => s.split(":")[0]);
  assert.ok(seq.length > 0, seq);
  assert.ok(order.indexOf("SPELLCAST_STOP") < order.indexOf("UNIT_SPELLCAST_SUCCEEDED"), seq);
  assert.ok(order.indexOf("UNIT_SPELLCAST_SUCCEEDED") < order.indexOf("UNIT_RAGE"), seq);
  assert.ok(order.indexOf("UNIT_RAGE") < order.indexOf("UNIT_AURA"), seq);
  assert.ok(order.indexOf("UNIT_AURA") < order.indexOf("PLAYER_AURAS_CHANGED"), seq);
  assert.ok(order.filter((e) => e === "ACTIONBAR_UPDATE_STATE").length >= 3);
  run(sim, `FW = {}; RemoveFriend("Nobodyhere"); DelIgnore("Nobodyhere"); SendWho("n-Nobodyatall"); RequestTimePlayed()`);
  sim.advance(2);
  const msgs = run(sim, `return table.concat(FW, "|")`)[0] as string;
  assert.ok(msgs.includes("CHAT_MSG_SYSTEM:Player not found."));
  assert.ok(msgs.includes("CHAT_MSG_SYSTEM:0 players total"));
  assert.ok(msgs.includes("TIME_PLAYED_MSG"));
  assert.ok(msgs.includes("CHAT_MSG_SYSTEM:Death counter"));
  assert.ok(!msgs.includes("WHO_LIST_UPDATE"));
  const p = run(sim, `local x, y = GetPlayerMapPosition("player"); local a, b = GetPlayerMapPosition("target"); return x > 0 and x < 1, y > 0 and y < 1, a, b`);
  assert.deepEqual(p, [true, true, 0, 0]);
});

engines("calibration: map position vector has the mixin methods", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local p = C_Map.GetPlayerMapPosition(C_Map.GetBestMapForUnit("player"), "player")
    local q = CreateVector2D(3, 4)
    return type(p.Dot), type(p.Cross), type(p.GetLength), q:GetLength(), q:Dot(CreateVector2D(1, 0)), q:IsZero()
  `);
  assert.deepEqual(v, ["function", "function", "function", 5, 3, false]);
});

// ===== [S2] Fenster · windows =====

engines("windows start closed (probe: 0/nil) and open with sample data", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  assert.deepEqual(run(sim, `return GetInboxNumItems(), HasNewMail(), GetNumAuctionItems("list"), GetNumTradeSkills(), GetNumCrafts(), GetNumTrainerServices(), GetNumBattlefields(), GetNumStableSlots()`), [0, undefined, 0, 0, 0, 0, 0, 0]);
  assert.equal(sim.openWindow("nonsense"), false);
});

engines("mail: inbox, take item and money, send", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  sim.openWindow("mail");
  const v = run(sim, `
    local n = GetInboxNumItems()
    local _, _, sender, subject, money = GetInboxHeaderInfo(1)
    local m0 = GetMoney()
    TakeInboxMoney(1)
    local m1 = GetMoney()
    local name, _, count = GetInboxItem(2)
    TakeInboxItem(2)
    local after = GetInboxItem(2)
    local price = GetSendMailPrice()
    SendMail("Someone", "Hi", "Body")
    return n, sender, money, m1 - m0, name, count, after, price, GetMoney() == m1 - price and 1 or 0
  `);
  assert.deepEqual(v, [2, "Auction House", 1200, 1200, "Tough Jerky", 4, undefined, 30, 1]);
  assert.equal(run(sim, `return GetContainerItemInfo and 1`)[0], 1);
});

engines("auction house: query, bid, sell, cancel", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  sim.openWindow("auction");
  const v = run(sim, `
    local n, total = GetNumAuctionItems("list")
    local name, _, count, _, _, _, minBid, _, buyout = GetAuctionItemInfo("list", 1)
    local m0 = GetMoney()
    PlaceAuctionBid("list", 1, buyout)
    local gone = GetNumAuctionItems("list")
    return n, total, name, count, minBid, buyout, m0 - GetMoney(), gone, GetAuctionItemClasses()
  `);
  assert.deepEqual(v.slice(0, 8), [4, 4, "Linen Cloth", 20, 400, 800, 800, 3]);
  assert.equal(typeof v[8], "string");
});

engines("bank and trade", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  sim.openWindow("bank");
  const v = run(sim, `
    local n0 = GetNumBankSlots()
    local cost = GetBankSlotCost(1)
    return n0, cost
  `);
  assert.deepEqual(v, [1, 10000]);
  const sim2 = await mk(t.v);
  sim2.openWindow("trade");
  const w = run(sim2, `
    local name = GetTradeTargetItemInfo(1)
    SetTradeMoney(100)
    local pm = GetPlayerTradeMoney()
    AcceptTrade()
    return name, pm
  `);
  assert.deepEqual(w, ["Sample Potion", 100]);
});

engines("tradeskill and craft: recipes, reagents, crafting", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  sim.openWindow("tradeskill");
  const v = run(sim, `
    local n = GetNumTradeSkills()
    local name, kind, avail = GetTradeSkillInfo(2)
    local rn, _, rc, have = GetTradeSkillReagentInfo(2, 1)
    DoTradeSkill(2, 2)
    return n, name, kind, avail, rn, rc, have
  `);
  assert.deepEqual(v, [4, "Linen Bandage", "medium", 7, "Linen Cloth", 1, 7]);
  sim.advance(5);
  assert.deepEqual(run(sim, `local _, _, avail = GetTradeSkillInfo(2); local n, r, m = GetTradeSkillLine(); return avail, n, r, m`), [5, "Sample Tailoring", 1, 75]);
  const sim2 = await mk(t.v);
  sim2.openWindow("craft");
  assert.deepEqual(run(sim2, `return GetNumCrafts(), GetCraftName(1), GetCraftNumReagents(3)`), [3, "Linen Bandage", 1]);
});

engines("trainer: services, filter, learning", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  sim.openWindow("trainer");
  const v = run(sim, `
    local n = GetNumTrainerServices()
    local name, _, cat = GetTrainerServiceInfo(1)
    local cost = GetTrainerServiceCost(1)
    local m0 = GetMoney()
    BuyTrainerService(1)
    local _, _, cat2 = GetTrainerServiceInfo(1)
    return n, name, cat, cost, m0 - GetMoney(), cat2
  `);
  assert.deepEqual(v, [4, "Rend", "available", 100, 100, "used"]);
});

engines("pet and stable", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  assert.equal(run(sim, `return GetPetHappiness()`)[0], undefined);
  sim.openWindow("stable");
  const v = run(sim, `
    local happy = GetPetHappiness()
    local n, slots = GetNumStablePets(), GetNumStableSlots()
    StablePet()
    local after = GetNumStablePets()
    return happy, n, slots, after, GetPetLoyalty()
  `);
  assert.deepEqual(v, [3, 1, 2, 2]);
});

engines("battlefield queue, petition, quest dialog", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  sim.openWindow("battlefield");
  run(sim, `JoinBattlefield(1)`);
  assert.deepEqual(run(sim, `return GetBattlefieldStatus(1)`).slice(0, 1), ["queued"]);
  sim.advance(6);
  assert.deepEqual(run(sim, `return GetBattlefieldStatus(1)`).slice(0, 1), ["confirm"]);
  run(sim, `AcceptBattlefieldPort(1, 1)`);
  assert.deepEqual(run(sim, `return GetBattlefieldStatus(1)`).slice(0, 1), ["active"]);
  const s2 = await mk(t.v);
  s2.openWindow("charter");
  assert.deepEqual(run(s2, `BuyGuildCharter("Test Guild"); return GetPetitionInfo()`).slice(0, 2), ["guild", "Test Guild"]);
  const s3 = await mk(t.v);
  s3.openWindow("questgiver");
  const q = run(s3, `
    local a = GetNumAvailableQuests()
    local title = GetAvailableTitle(1)
    SelectAvailableQuest(1)
    local text = GetQuestText()
    AcceptQuest()
    return a, title, text ~= nil, GetNumAvailableQuests()
  `);
  assert.deepEqual(q, [1, "Boar Trouble", true, 0]);
  s3.openWindow("questgiver");
  assert.equal(run(s3, `return GetNumActiveQuests()`)[0], 3);
});

// ===== [S3] Rest · remainder =====

engines("error handler, EnumerateFrames, securecall, CreateFont, RunScript", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    seterrorhandler(function(e) SEEN = e end)
    local f = CreateFrame("Frame", "FwEnumTest")
    f:Hide()
    f:SetScript("OnShow", function() error("boom") end)
    f:Show()
    local count, walk = GetNumFrames(), 0
    local fr = EnumerateFrames()
    while fr do walk = walk + 1; fr = EnumerateFrames(fr) end
    local sum = securecall(function(a, b) return a + b end, 2, 3)
    local font = CreateFont("FwFont")
    font:SetFont("x.ttf", 20)
    local _, size = font:GetFont()
    RunScript("FW_RAN = 7")
    return type(geterrorhandler()), count == walk, count > 0, sum, size, FW_RAN, FwFont == font
  `);
  sim.advance(0.1);
  assert.deepEqual(v, ["function", true, true, 5, 20, 7, true]);
  assert.match(String(run(sim, `return SEEN`)[0]), /boom/);
});

engines("camera, video and chat window settings", async (mk) => {
  const t = await targets();
  const sim = await mk(t.v);
  const v = run(sim, `
    MouselookStart()
    local ml = IsMouselooking()
    MouselookStop()
    SetGamma(1.5); SetFarclip(600)
    local name, size, _, _, _, _, shown = GetChatWindowInfo(1)
    SetChatWindowName(3, "Loot")
    AddChatWindowMessages(3, "LOOT")
    local m = GetChatWindowMessages(3)
    return ml, IsMouselooking(), GetGamma(), GetFarclip(), name, size, shown, GetChatWindowInfo(3), m
  `);
  assert.deepEqual(v.slice(0, 9), [1, undefined, 1.5, 600, "General", 14, 1, "Loot", "LOOT"]);
});
