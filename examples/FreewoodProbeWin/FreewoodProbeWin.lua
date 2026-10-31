--[[
 Freewood LUA IDE – Freewood Probe Windows
 SPDX-License-Identifier: GPL-3.0-or-later   Copyright (C) 2026 Lacustat

 INHALT / CONTENTS
   [S1] Werkzeuge · helpers ........ pack, ser, record, FWP_each
   [S2] Gruppen · groups ........... GROUPS (ein Fenster = eine Gruppe, Auslöser-Ereignisse, Tests)
   [S3] Ablauf · runner ............ wartet auf Fenster-Ereignisse, führt die Tests aus, protokolliert Ereignisse
   [S4] Befehle · commands ......... /fwwin

 DE: Zweite Probe: Du öffnest echte NPC-Fenster (Briefkasten, Auktionshaus, Händler, Ausbilder ...), das Addon
     erkennt das Ereignis und liest danach nur lesend die zugehörigen Funktionen aus (keine Käufe, kein Senden,
     kein Annehmen). Alle Ergebnisse und alle Fenster-Ereignisse mit Zeitstempel landen in
     WTF\Account\<KONTO>\SavedVariables\FreewoodProbeWin.lua (wird beim /reload oder Abmelden geschrieben).
     Hinweis: GetInboxText markiert einen Brief als gelesen; QueryAuctionItems fragt die Auktionsliste ab.
 EN: second probe: you open real NPC windows (mailbox, auction house, merchant, trainer ...), the addon detects
     the event and then only reads the related functions (no buying, sending or accepting). All results and
     all window events with timestamps go to WTF\Account\<ACCOUNT>\SavedVariables\FreewoodProbeWin.lua
     (written on /reload or logout). Note: GetInboxText marks a mail as read; QueryAuctionItems queries the auction list.
     Lua 5.0 and 5.1 compatible.
]]

-- ===== [S1] Werkzeuge · helpers =====

FreewoodProbeWinDB = FreewoodProbeWinDB or {}

local pack
do
  local f = loadstring('return function(...) return {n = select("#", ...), ...} end')
  if f then
    local ok, g = pcall(f)
    if ok and g then
      local ok2, t = pcall(g, 1, nil)
      if ok2 and type(t) == "table" and t.n == 2 then pack = g end
    end
  end
  if not pack then pack = loadstring("return function(...) return arg end")() end
end

local function sortedKeys(t)
  local keys, n = {}, 0
  for k in pairs(t) do n = n + 1; keys[n] = k end
  table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
  return keys, n
end

local function ser(v, depth)
  depth = depth or 0
  local t = type(v)
  if t == "string" then return "'" .. v .. "'" end
  if t == "number" or t == "boolean" or t == "nil" then return tostring(v) end
  if t == "table" then
    if type(v.GetObjectType) == "function" and type(v.GetName) == "function" then
      local ok, ot = pcall(v.GetObjectType, v)
      local ok2, nm = pcall(v.GetName, v)
      return "<" .. tostring(ot) .. " " .. tostring(nm) .. ">"
    end
    if depth >= 2 then return "{...}" end
    local keys, n = sortedKeys(v)
    local parts = {}
    for i = 1, n do
      if i > 40 then parts[table.getn(parts) + 1] = "..."; break end
      local k = keys[i]
      parts[table.getn(parts) + 1] = tostring(k) .. "=" .. ser(v[k], depth + 1)
    end
    return "{" .. table.concat(parts, ", ") .. "}"
  end
  return "<" .. t .. ">"
end

local function serList(res, first)
  local out = {}
  local n = (res.n or 0)
  if n > 30 then n = 30 end
  for i = first, n do out[table.getn(out) + 1] = ser(res[i]) end
  return table.concat(out, " | ")
end

-- DE: Ruft f(i) für i = 1..n auf und fasst die Rückgaben als Text zusammen. EN: calls f(i) for i = 1..n and joins the returns as text.
function FWP_each(n, f)
  local lines = {}
  for i = 1, n do
    local res = pack(pcall(f, i))
    if res[1] then lines[table.getn(lines) + 1] = i .. ": " .. serList(res, 2)
    else lines[table.getn(lines) + 1] = i .. ": ERR " .. tostring(res[2]) end
  end
  return table.concat(lines, "  ;;  ")
end

local function say(msg) DEFAULT_CHAT_FRAME:AddMessage("|cff55ccffFreewoodProbeWin|r " .. msg) end

local function record(code)
  local fn, err = loadstring("return " .. code)
  if not fn then fn, err = loadstring(code) end
  local r = { name = code }
  if not fn then
    r.ok = false
    r.err = "syntax: " .. tostring(err)
  else
    local res = pack(pcall(fn))
    r.ok = res[1]
    if res[1] then
      r.n = (res.n or 1) - 1
      r.ret = {}
      local n = r.n
      if n > 30 then n = 30 end
      for i = 1, n do r.ret[i] = ser(res[i + 1]) end
    else
      r.err = tostring(res[2])
    end
  end
  return r
end

-- ===== [S2] Gruppen · groups =====
-- DE: "== name | EREIGNIS ..." beginnt eine Gruppe; die Ereignisse lösen sie aus. "@wait n" wartet n Sekunden.
-- EN: "== name | EVENT ..." starts a group; the events trigger it. "@wait n" waits n seconds.

local SPEC = [[
== mail | MAIL_SHOW
GetInboxNumItems()
HasNewMail()
FWP_each(6, function(i) return GetInboxHeaderInfo(i) end)
FWP_each(3, function(i) return GetInboxText(i) end)
FWP_each(3, function(i) return GetInboxItem(i) end)
FWP_each(3, function(i) return GetInboxInvoiceInfo(i) end)
FWP_each(3, function(i) return InboxItemCanDelete(i) end)
GetSendMailPrice()
GetSendMailMoney()
GetSendMailCOD()
GetSendMailItem()
GetNumStationeries()
FWP_each(3, function(i) return GetStationeryInfo(i) end)
GetSelectedStationeryTexture()
GetNumPackages()
FWP_each(3, function(i) return GetPackageInfo(i) end)
GetInboxItemID and GetInboxItemID(1)
== auction | AUCTION_HOUSE_SHOW
CanSendAuctionQuery()
GetNumAuctionItems("list")
GetNumAuctionItems("owner")
GetNumAuctionItems("bidder")
GetAuctionItemClasses()
FWP_each(4, function(i) return GetAuctionItemSubClasses(i) end)
GetAuctionInvTypes(2, 1)
GetAuctionHouseDepositRate()
FWP_each(5, function(i) return GetAuctionItemInfo("owner", i) end)
FWP_each(5, function(i) return GetAuctionItemInfo("bidder", i) end)
GetAuctionSellItemInfo()
GetSelectedAuctionItem("list")
IsAuctionSortReversed("list", "name")
QueryAuctionItems("", nil, nil, 0, 0, 0, 0, 0, 0)
@wait 4
CanSendAuctionQuery()
GetNumAuctionItems("list")
FWP_each(5, function(i) return GetAuctionItemInfo("list", i) end)
FWP_each(3, function(i) return GetAuctionItemLink("list", i) end)
FWP_each(3, function(i) return GetAuctionItemTimeLeft("list", i) end)
GetAuctionItemID and GetAuctionItemID("list", 1)
== merchant | MERCHANT_SHOW
GetMerchantNumItems()
FWP_each(8, function(i) return GetMerchantItemInfo(i) end)
FWP_each(4, function(i) return GetMerchantItemLink(i) end)
FWP_each(3, function(i) return GetMerchantItemMaxStack(i) end)
CanMerchantRepair()
GetRepairAllCost()
GetNumBuybackItems()
FWP_each(3, function(i) return GetBuybackItemInfo(i) end)
FWP_each(3, function(i) return GetBuybackItemLink(i) end)
GetMerchantItemID and GetMerchantItemID(1)
== gossip | GOSSIP_SHOW
GetGossipText()
GetNumGossipOptions and GetNumGossipOptions()
GetGossipOptions()
GetGossipAvailableQuests()
GetGossipActiveQuests()
GetNumGossipAvailableQuests and GetNumGossipAvailableQuests()
GetNumGossipActiveQuests and GetNumGossipActiveQuests()
== trainer | TRAINER_SHOW
GetNumTrainerServices()
GetTrainerGreetingText()
FWP_each(8, function(i) return GetTrainerServiceInfo(i) end)
FWP_each(8, function(i) return GetTrainerServiceCost(i) end)
FWP_each(4, function(i) return GetTrainerServiceIcon(i) end)
FWP_each(4, function(i) return GetTrainerServiceDescription(i) end)
FWP_each(4, function(i) return GetTrainerServiceLevelReq(i) end)
FWP_each(4, function(i) return GetTrainerServiceSkillReq(i) end)
FWP_each(4, function(i) return GetTrainerServiceSkillLine(i) end)
FWP_each(4, function(i) return GetTrainerServiceNumAbilityReq(i) end)
FWP_each(4, function(i) return GetTrainerServiceAbilityReq(i, 1) end)
FWP_each(4, function(i) return IsTrainerServiceSkillStep(i) end)
GetTrainerServiceTypeFilter("available")
GetTrainerServiceTypeFilter("unavailable")
GetTrainerServiceTypeFilter("used")
GetTrainerSelectionIndex()
IsTradeskillTrainer()
GetTrainerSkillLines()
GetTrainerSkillLineFilter(1)
== tradeskill | TRADE_SKILL_SHOW
GetNumTradeSkills()
GetTradeSkillLine()
GetFirstTradeSkill()
FWP_each(8, function(i) return GetTradeSkillInfo(i) end)
FWP_each(4, function(i) return GetTradeSkillIcon(i) end)
FWP_each(4, function(i) return GetTradeSkillItemLink(i) end)
FWP_each(4, function(i) return GetTradeSkillNumMade(i) end)
FWP_each(4, function(i) return GetTradeSkillNumReagents(i) end)
FWP_each(4, function(i) return GetTradeSkillReagentInfo(2, i) end)
FWP_each(4, function(i) return GetTradeSkillReagentItemLink(2, i) end)
FWP_each(4, function(i) return GetTradeSkillTools(i) end)
FWP_each(4, function(i) return GetTradeSkillCooldown(i) end)
GetTradeSkillSelectionIndex()
GetTradeSkillSubClasses()
GetTradeSkillInvSlots()
GetTradeskillRepeatCount()
GetTradeSkillItemStats(2)
== craft | CRAFT_SHOW
GetNumCrafts()
GetCraftDisplaySkillLine()
FWP_each(8, function(i) return GetCraftInfo(i) end)
FWP_each(4, function(i) return GetCraftName(i) end)
FWP_each(4, function(i) return GetCraftIcon(i) end)
FWP_each(4, function(i) return GetCraftDescription(i) end)
FWP_each(4, function(i) return GetCraftItemLink(i) end)
FWP_each(4, function(i) return GetCraftNumReagents(i) end)
FWP_each(4, function(i) return GetCraftReagentInfo(2, i) end)
FWP_each(4, function(i) return GetCraftSpellFocus(i) end)
GetCraftSelectionIndex()
GetCraftSkillLine(1)
== bank | BANKFRAME_OPENED
GetNumBankSlots()
FWP_each(4, function(i) return GetBankSlotCost(i) end)
GetContainerNumSlots(-1)
FWP_each(4, function(i) return GetContainerItemInfo(-1, i) end)
FWP_each(3, function(i) return GetInventoryItemLink("player", 67 + i) end)
== questgreeting | QUEST_GREETING
GetGreetingText()
GetNumAvailableQuests()
GetNumActiveQuests()
FWP_each(4, function(i) return GetAvailableTitle(i) end)
FWP_each(4, function(i) return GetAvailableLevel(i) end)
FWP_each(4, function(i) return GetActiveTitle(i) end)
FWP_each(4, function(i) return GetActiveLevel(i) end)
GetQuestBackgroundMaterial()
== questdetail | QUEST_DETAIL
GetTitleText()
GetQuestText()
GetObjectiveText()
GetRewardMoney()
GetNumQuestRewards()
GetNumQuestChoices()
GetNumQuestItems()
FWP_each(4, function(i) return GetQuestItemInfo("choice", i) end)
FWP_each(4, function(i) return GetQuestItemInfo("reward", i) end)
FWP_each(4, function(i) return GetQuestItemInfo("required", i) end)
GetRewardSpell()
GetQuestBackgroundMaterial()
IsQuestCompletable()
== questprogress | QUEST_PROGRESS
GetTitleText()
GetProgressText()
IsQuestCompletable()
GetNumQuestItems()
FWP_each(4, function(i) return GetQuestItemInfo("required", i) end)
GetQuestMoneyToGet()
== questcomplete | QUEST_COMPLETE
GetTitleText()
GetRewardText()
GetRewardMoney()
GetNumQuestRewards()
GetNumQuestChoices()
FWP_each(5, function(i) return GetQuestItemInfo("choice", i) end)
FWP_each(5, function(i) return GetQuestItemInfo("reward", i) end)
FWP_each(5, function(i) return GetQuestItemLink and GetQuestItemLink("choice", i) end)
GetRewardSpell()
== stable | PET_STABLE_SHOW
GetNumStableSlots()
GetNumStablePets()
FWP_each(3, function(i) return GetStablePetInfo(i - 1) end)
FWP_each(3, function(i) return GetStablePetFoodTypes(i - 1) end)
GetSelectedStablePet()
GetNextStableSlotCost()
GetPetHappiness()
GetPetLoyalty()
GetPetExperience()
GetPetFoodTypes()
GetPetTrainingPoints()
== battlefield | BATTLEFIELDS_SHOW
GetNumBattlefields()
GetBattlefieldInfo()
GetBattlefieldInstanceInfo(1)
GetSelectedBattlefield()
CanJoinBattlefieldAsGroup()
FWP_each(3, function(i) return GetBattlefieldStatus(i) end)
FWP_each(3, function(i) return GetBattlefieldEstimatedWaitTime(i) end)
== petition | PETITION_SHOW
GetPetitionInfo()
GetNumPetitionNames()
FWP_each(3, function(i) return GetPetitionNameInfo(i) end)
CanSignPetition()
GetGuildCharterCost()
== registrar | GUILD_REGISTRAR_SHOW
GetGuildCharterCost()
GetPetitionInfo()
GetNumPetitionNames()
CanSignPetition()
== tabard | OPEN_TABARD_FRAME
GetTabardCreationCost()
GetTabardInfo()
== taxi | TAXIMAP_OPENED
NumTaxiNodes()
FWP_each(6, function(i) return TaxiNodeName(i) end)
FWP_each(6, function(i) return TaxiNodeGetType(i) end)
FWP_each(6, function(i) return TaxiNodeCost(i) end)
FWP_each(6, function(i) return TaxiNodePosition(i) end)
== loot | LOOT_OPENED
GetNumLootItems()
FWP_each(5, function(i) return GetLootSlotInfo(i) end)
FWP_each(5, function(i) return GetLootSlotLink(i) end)
FWP_each(5, function(i) return LootSlotIsItem(i) end)
FWP_each(5, function(i) return LootSlotIsCoin(i) end)
GetLootMethod()
IsFishingLoot()
== lootroll | START_LOOT_ROLL
GetLootRollItemInfo(FWP_ARG1)
GetLootRollItemLink(FWP_ARG1)
GetLootRollTimeLeft(FWP_ARG1)
== trade | TRADE_SHOW
GetPlayerTradeMoney()
GetTargetTradeMoney()
FWP_each(7, function(i) return GetTradePlayerItemInfo(i) end)
FWP_each(7, function(i) return GetTradeTargetItemInfo(i) end)
FWP_each(7, function(i) return GetTradePlayerItemLink(i) end)
FWP_each(7, function(i) return GetTradeTargetItemLink(i) end)
UnitName("npc")
== itemtext | ITEM_TEXT_READY
ItemTextGetItem()
ItemTextGetCreator()
ItemTextGetMaterial()
ItemTextGetPage()
ItemTextGetText()
ItemTextHasNextPage()
== general | -
GetNumSavedInstances()
FWP_each(3, function(i) return GetSavedInstanceInfo(i) end)
GetInstanceBootTimeRemaining()
CanShowResetInstances()
GetPVPLifetimeStats()
GetPVPSessionStats()
GetPVPThisWeekStats()
GetPVPLastWeekStats()
GetPVPYesterdayStats()
GetPVPRankProgress()
FWP_each(4, function(i) return GetPVPRankInfo(i + 4) end)
FWP_each(7, function(i) return GetChatWindowInfo(i) end)
FWP_each(3, function(i) return GetChatWindowMessages(i) end)
FWP_each(3, function(i) return GetChatWindowChannels(i) end)
GetChatTypeIndex("SAY")
GetChatTypeIndex("PARTY")
GetCurrentResolution()
GetScreenResolutions()
GetRefreshRates()
GetGamma()
GetFarclip()
GetBaseMip()
GetTerrainMip()
GetTexLodBias()
GetWaterDetail()
GetWorldDetail()
GetDoodadAnim()
GetCurrentMultisampleFormat()
GetMultisampleFormats()
GetVideoCaps()
IsMouselooking()
GetNumFrames()
geterrorhandler()
GetGMStatus()
GetGMTicket()
GetGMTicketCategories()
GetBlockChance()
GetParryChance()
GetDodgeChance()
GetCombatRating(1)
GetDamageBonusStat()
GetResSicknessDuration()
GetTimeToWellRested()
HasPetUI()
PetHasActionBar()
FWP_each(10, function(i) return GetPetActionInfo(i) end)
GetPetActionsUsable()
IsPetAttackActive()
PetCanBeAbandoned()
PetCanBeRenamed()
GetPetIcon()
GetPetTimeRemaining()
GetTotemInfo and GetTotemInfo(1)
UnitIsCorpse("player")
GetCorpseMapPosition()
GetNumMapLandmarks()
FWP_each(3, function(i) return GetMapLandmarkInfo(i) end)
GetNumMapOverlays()
FWP_each(3, function(i) return GetMapOverlayInfo(i) end)
GetWorldLocMapPosition and GetWorldLocMapPosition(0, 0)
GetInventoryAlertStatus(1)
GetNumBattlefieldScores()
GetNumBattlefieldPositions()
GetWorldStateUIInfo(1)
TutorialsEnabled()
GetPVPDesired and GetPVPDesired()
IsPVPTimerRunning and IsPVPTimerRunning()
GetPVPTimer and GetPVPTimer()
]]

local GROUPS, ORDER, TRIGGER = {}, {}, {}
do
  local cur
  for line in (string.gfind or string.gmatch)(SPEC, "[^\n]+") do
    if string.sub(line, 1, 3) == "== " then
      local _, _, name, evs = string.find(line, "^== (%S+) | (.*)$")
      cur = { name = name, lines = {}, events = {} }
      GROUPS[name] = cur
      ORDER[table.getn(ORDER) + 1] = name
      for e in (string.gfind or string.gmatch)(evs, "%S+") do
        if e ~= "-" then
          cur.events[table.getn(cur.events) + 1] = e
          TRIGGER[e] = name
        end
      end
    elseif cur then
      cur.lines[table.getn(cur.lines) + 1] = line
    end
  end
end

-- ===== [S3] Ablauf · runner =====

-- DE: Gruppen, die sofort im Ereignis laufen (Fenster schließt sich von selbst, z. B. Auto-Loot). EN: groups that run right inside the event (the window closes by itself, e.g. auto loot).
local SYNC = { loot = true, lootroll = true, itemtext = true }
-- DE: Fallback: Fenster per Abfrage erkennen, falls ihr Ereignis auf diesem Client nicht kommt. EN: fallback: detect windows by query in case their event does not fire on this client.
local POLL = {
  tradeskill = "GetNumTradeSkills() > 0", craft = "GetNumCrafts() > 0", trainer = "GetNumTrainerServices() > 0",
  merchant = "GetMerchantNumItems() > 0", itemtext = "ItemTextGetText() ~= nil and ItemTextGetText() ~= ''", auction = "CanSendAuctionQuery() and AuctionFrame and AuctionFrame:IsVisible()",
}
local GUESS = {
  { "^TRADE_SKILL.*SHOW", "tradeskill" }, { "^TRADE_SKILL.*OPEN", "tradeskill" }, { "^CRAFT.*SHOW", "craft" }, { "^TRAINER.*SHOW", "trainer" },
  { "^MERCHANT.*SHOW", "merchant" }, { "^AUCTION.*SHOW", "auction" }, { "^MAIL.*SHOW", "mail" }, { "^BANK.*OPEN", "bank" }, { "^ITEM_TEXT.*READY", "itemtext" },
}
local SKIP = { "^UNIT_", "^COMBAT_", "^CHAT_MSG_", "^ACTIONBAR", "^BAG_", "^PLAYER_TARGET", "^SPELL_UPDATE", "^UPDATE_MOUSEOVER", "^CURSOR", "^PLAYER_REGEN", "^UPDATE_SHAPESHIFT", "^PARTY_", "^RAID_", "^PLAYER_AURAS", "^UPDATE_BONUS", "^SKILL_LINES", "^MINIMAP", "^WORLD_MAP", "^ADDON_LOADED", "^PLAYER_LOGIN", "^VARIABLES", "^UPDATE_FACTION", "^PLAYER_XP", "^PLAYER_ENTERING", "^UPDATE_INVENTORY", "^SPELLS_CHANGED", "^LEARNED_SPELL", "^PLAYER_LEAVING", "^UPDATE_BATTLEFIELD", "^PLAYER_UPDATE", "^PLAYER_FLAGS" }
local WINDOWISH = { "SHOW$", "CLOSE$", "CLOSED$", "OPENED$", "OPEN$", "BEGIN$", "READY$", "_LIST_UPDATE$", "FINISHED$", "COMPLETE$", "PROGRESS$", "DETAIL$", "GREETING$", "_UPDATE$" }

local EXTRA_EVENTS = {
  "MAIL_CLOSED", "MAIL_INBOX_UPDATE", "MAIL_SEND_INFO_UPDATE", "MAIL_SEND_SUCCESS", "MAIL_FAILED", "UPDATE_PENDING_MAIL",
  "AUCTION_HOUSE_CLOSED", "AUCTION_ITEM_LIST_UPDATE", "AUCTION_OWNED_LIST_UPDATE", "AUCTION_BIDDER_LIST_UPDATE", "NEW_AUCTION_UPDATE",
  "MERCHANT_CLOSED", "MERCHANT_UPDATE", "MERCHANT_FILTER_ITEM_UPDATE", "GOSSIP_CLOSED", "TRAINER_CLOSED", "TRAINER_UPDATE",
  "TRADE_SKILL_CLOSE", "TRADE_SKILL_UPDATE", "CRAFT_CLOSE", "CRAFT_UPDATE", "BANKFRAME_CLOSED", "PLAYERBANKSLOTS_CHANGED", "PLAYERBANKBAGSLOTS_CHANGED",
  "QUEST_FINISHED", "QUEST_ITEM_UPDATE", "QUEST_LOG_UPDATE", "QUEST_ACCEPT_CONFIRM", "PET_STABLE_CLOSED", "PET_STABLE_UPDATE", "PET_STABLE_UPDATE_PAPERDOLL",
  "BATTLEFIELDS_CLOSED", "UPDATE_BATTLEFIELD_STATUS", "UPDATE_BATTLEFIELD_SCORE", "PETITION_CLOSED", "CLOSE_GUILD_REGISTRAR", "CLOSE_TABARD_FRAME", "TAXIMAP_CLOSED",
  "LOOT_CLOSED", "LOOT_SLOT_CLEARED", "CANCEL_LOOT_ROLL", "TRADE_CLOSED", "TRADE_ACCEPT_UPDATE", "TRADE_MONEY_CHANGED", "TRADE_PLAYER_ITEM_CHANGED",
  "TRADE_TARGET_ITEM_CHANGED", "TRADE_REQUEST_CANCEL", "ITEM_TEXT_BEGIN", "ITEM_TEXT_CLOSED", "PLAYER_MONEY", "UI_ERROR_MESSAGE", "CHAT_MSG_SYSTEM",
  "UPDATE_INSTANCE_INFO", "UNIT_PET", "PET_BAR_UPDATE", "SPELLS_CHANGED", "CRAFT_SHOW", "UPDATE_TICKET", "UPDATE_CHAT_COLOR", "PLAYER_FLAGS_CHANGED",
}

local db = FreewoodProbeWinDB
local frame = CreateFrame("Frame")
local pending, active, evCount, startedAt, perGroup = {}, nil, 0, 0, {}
local ptail, phead = 0, 1 -- DE: Warteschlange ohne table.remove (5.0-getn-Eigenheit). EN: queue without table.remove (5.0 getn quirk).
local function push(item) ptail = ptail + 1; pending[ptail] = item end
local elapsed = 0

local function currentId() return active and active.id or 0 end

local evSeen, lastTrigger = {}, {}
local runNow
local function onEvent()
  evSeen[event] = (evSeen[event] or 0) + 1
  if evCount < 1500 and (evSeen[event] <= 8 or TRIGGER[event]) then
    evCount = evCount + 1
    db.events[table.getn(db.events) + 1] = string.format("%.2f", GetTime() - startedAt) .. " [s" .. currentId() .. "] " .. tostring(event) .. "(" ..
      ser(arg1) .. ", " .. ser(arg2) .. ", " .. ser(arg3) .. ", " .. ser(arg4) .. ")"
  end
  local g = TRIGGER[event]
  if g then
    perGroup[g] = (perGroup[g] or 0) + 1
    lastTrigger[g] = GetTime()
    if perGroup[g] <= 4 and SYNC[g] then
      runNow({ group = g, trigger = event, args = ser(arg1) .. ", " .. ser(arg2) .. ", " .. ser(arg3) .. ", " .. ser(arg4), a1 = arg1, a2 = arg2 })
    elseif perGroup[g] <= 4 then
      push({ group = g, trigger = event, args = ser(arg1) .. ", " .. ser(arg2) .. ", " .. ser(arg3) .. ", " .. ser(arg4), a1 = arg1, a2 = arg2 })
    end
  end
end

local function launch(item)
  db.sessionCount = (db.sessionCount or 0) + 1
  local s = { id = db.sessionCount, window = item.group, trigger = item.trigger, args = item.args, t = string.format("%.2f", GetTime() - startedAt), results = {} }
  db.sessions[s.id] = s
  FWP_ARG1, FWP_ARG2 = item.a1, item.a2
  active = { id = s.id, session = s, lines = GROUPS[item.group].lines, pos = 0, wait = 0.6 }
  say(item.group .. ": " .. table.getn(active.lines) .. " tests")
end

local poll
local function onUpdate()
  elapsed = elapsed + arg1
  if elapsed < 0.3 then return end
  local dt = elapsed
  elapsed = 0
  if poll then poll(dt) end
  if not active then
    if phead <= ptail then
      local item = pending[phead]
      pending[phead] = nil
      phead = phead + 1
      launch(item)
    end
    return
  end
  if active.wait > 0 then active.wait = active.wait - dt; return end
  active.pos = active.pos + 1
  local line = active.lines[active.pos]
  if not line then
    say(active.session.window .. " fertig / done (" .. table.getn(active.session.results) .. ")")
    active = nil
    return
  end
  if string.sub(line, 1, 6) == "@wait " then
    active.wait = tonumber(string.sub(line, 7)) or 1
    return
  end
  local r = record(line)
  r.t = string.format("%.2f", GetTime() - startedAt)
  active.session.results[table.getn(active.session.results) + 1] = r
end

-- DE: Führt alle Zeilen der Gruppe sofort aus (ohne Wartezeiten). EN: runs all lines of the group right away (no waits).
function runNow(item)
  db.sessionCount = (db.sessionCount or 0) + 1
  local s = { id = db.sessionCount, window = item.group, trigger = item.trigger, args = item.args, t = string.format("%.2f", GetTime() - startedAt), results = {}, sync = true }
  db.sessions[s.id] = s
  FWP_ARG1, FWP_ARG2 = item.a1, item.a2
  local lines = GROUPS[item.group].lines
  for i = 1, table.getn(lines) do
    if string.sub(lines[i], 1, 6) ~= "@wait " then
      local r = record(lines[i])
      r.t = string.format("%.2f", GetTime() - startedAt)
      s.results[table.getn(s.results) + 1] = r
    end
  end
end

local pollFn, pollState, pollT = {}, {}, 0
local function pollInit()
  for g, code in pairs(POLL) do
    local f = loadstring("return " .. code)
    if f then pollFn[g] = f end
  end
end
poll = function(dt)
  pollT = pollT + dt
  if pollT < 0.5 then return end
  pollT = 0
  for g, f in pairs(pollFn) do
    local ok, v = pcall(f)
    local open = ok and v and true or false
    if open and not pollState[g] and (not lastTrigger[g] or GetTime() - lastTrigger[g] > 6) and (perGroup[g] or 0) < 4 then
      perGroup[g] = (perGroup[g] or 0) + 1
      lastTrigger[g] = GetTime()
      local item = { group = g, trigger = "poll", args = "" }
      if SYNC[g] then runNow(item) else push(item) end
      db.polled = (db.polled or "") .. g .. ","
    end
    pollState[g] = open
  end
end

-- DE: Merkt, welche Ereignisse welche Fenster-Rahmen registrieren, und registriert fensterartige Ereignisse mit. EN: remembers which events which window frames register, and registers window-like events too.
local regLog = {}
local regSeen = {}
local function matchAny(list, e)
  for i = 1, table.getn(list) do if string.find(e, list[i]) then return true end end
  return false
end
do
  local okm, mt = pcall(function() return getmetatable(CreateFrame("Frame")) end)
  local idx = okm and mt and mt.__index
  if type(idx) == "table" and type(idx.RegisterEvent) == "function" then
    local orig = idx.RegisterEvent
    idx.RegisterEvent = function(self, e, ...)
      pcall(function()
        if type(e) == "string" and table.getn(regLog) < 600 then
          local nm = (self.GetName and self:GetName()) or "?"
          regLog[table.getn(regLog) + 1] = tostring(nm) .. ": " .. e
        end
        if type(e) == "string" and not regSeen[e] and not TRIGGER[e] and not matchAny(SKIP, e) and matchAny(WINDOWISH, e) then
          regSeen[e] = true
          orig(frame, e)
          for i = 1, table.getn(GUESS) do
            if string.find(e, GUESS[i][1]) then TRIGGER[e] = GUESS[i][2] end
          end
        end
      end)
      return orig(self, e, ...)
    end
  end
end

local function init()
  db = { sessions = {}, events = {}, sessionCount = 0 }
  FreewoodProbeWinDB = db
  db.meta = {
    started = date("%Y-%m-%d %H:%M:%S"), build = tostring((GetBuildInfo())), locale = GetLocale(), realm = GetRealmName(),
    player = UnitName("player"), lua = tostring(_VERSION), hasSelect = tostring(select ~= nil),
  }
  db.registered = regLog
  startedAt = GetTime()
  evCount = 0
  pending, active, perGroup = {}, nil, {}
  ptail, phead = 0, 1
end

local function showChecklist()
  say("Öffne nacheinander / open one after another ([x] = erledigt / done):")
  for i = 1, table.getn(ORDER) do
    local g = ORDER[i]
    if g ~= "general" then
      say("  " .. ((perGroup[g] or 0) > 0 and "[x] " or "[ ] ") .. g .. "  (" .. table.concat(GROUPS[g].events, ", ") .. ")")
    end
  end
  say("Danach / then: /reload (schreibt die Datei / writes the file)")
end

local boot = CreateFrame("Frame")
boot:RegisterEvent("PLAYER_ENTERING_WORLD")
boot:SetScript("OnEvent", function()
  boot:UnregisterEvent("PLAYER_ENTERING_WORLD")
  init()
  pollInit()
  for e in pairs(TRIGGER) do frame:RegisterEvent(e) end
  for i = 1, table.getn(EXTRA_EVENTS) do frame:RegisterEvent(EXTRA_EVENTS[i]) end
  frame:SetScript("OnEvent", onEvent)
  frame:SetScript("OnUpdate", onUpdate)
  push({ group = "general", trigger = "-", args = "" })
  say("bereit / ready. /fwwin zeigt die Liste / shows the list.")
end)

-- ===== [S4] Befehle · commands =====

SLASH_FWWIN1 = "/fwwin"
SlashCmdList["FWWIN"] = function(msg)
  msg = string.lower(msg or "")
  if msg == "clear" then
    init()
    push({ group = "general", trigger = "-", args = "" })
    say("zurückgesetzt / cleared")
  elseif msg == "status" then
    say("sessions " .. (db.sessionCount or 0) .. ", events " .. evCount .. ", pending " .. (ptail - phead + 1) .. (active and (", läuft / running " .. active.session.window) or ""))
  elseif string.sub(msg, 1, 4) == "run " then
    local g = string.sub(msg, 5)
    if GROUPS[g] then push({ group = g, trigger = "manual", args = "" }) else say("unbekannt / unknown: " .. g) end
  else
    showChecklist()
  end
end
