--[[
 Freewood LUA IDE – Freewood Probe
 SPDX-License-Identifier: GPL-3.0-or-later   Copyright (C) 2026 Lacustat

 INHALT / CONTENTS
   [S1] Werkzeuge · helpers ........ pack, ser (Wert als Text), Aufzeichnung
   [S2] Testliste · test list ...... SPEC (eine Zeile = ein Test, # = Gruppe, ! = nur mit /fwprobe risky)
   [S3] Ablauf · runner ............ alle 0,3 s ein Test, Ereignisse mit Zeitstempel und laufendem Test
   [S4] Befehle · commands ......... /fwprobe

 DE: Läuft auf Lua 5.0 (Vanilla 1.12 / OctoWoW) und 5.1. Jeder Test ist ein Ausdruck; Fehler werden
     aufgezeichnet (z. B. "attempt to call global 'X' (a nil value)" zeigt, dass eine Funktion fehlt).
     Ergebnis: Datei WTF\Account\<KONTO>\SavedVariables\FreewoodProbe.lua (wird beim /reload oder Abmelden
     geschrieben). Diese Datei an Claude geben.
 EN: runs on Lua 5.0 (Vanilla 1.12 / OctoWoW) and 5.1. Every test is an expression; errors are recorded
     (e.g. "attempt to call global 'X' (a nil value)" shows that a function is missing). Result: the file
     WTF\Account\<ACCOUNT>\SavedVariables\FreewoodProbe.lua (written on /reload or logout). Give that file to Claude.
]]

-- ===== [S1] Werkzeuge · helpers =====

FreewoodProbeDB = FreewoodProbeDB or {}

local pack
do
  -- DE: 5.1-Form versuchen und prüfen, sonst 5.0-Form (`arg`). EN: try the 5.1 form and verify it, else the 5.0 form (`arg`).
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

-- DE: Wert als Text (Tabellen bis Tiefe 2, höchstens 40 Einträge). EN: value as text (tables to depth 2, at most 40 entries).
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

local db = FreewoodProbeDB
local queue, pos, current, elapsed, running = {}, 0, "-", 0, false
local risky = false
local startedAt = 0

local function say(msg) DEFAULT_CHAT_FRAME:AddMessage("|cff55ccffFreewoodProbe|r " .. msg) end

local function record(name, code)
  local fn, err = loadstring("return " .. code)
  if not fn then fn, err = loadstring(code) end
  local r = { name = name }
  if not fn then
    r.ok = false
    r.err = "syntax: " .. tostring(err)
  else
    local t0 = GetTime()
    local res = pack(pcall(fn))
    r.ok = res[1]
    if res[1] then
      local out = {}
      local n = (res.n or 1) - 1
      if n > 30 then n = 30 end
      for i = 1, n do out[i] = ser(res[i + 1]) end
      r.n = n
      r.ret = out
    else
      r.err = tostring(res[2])
    end
    r.ms = math.floor((GetTime() - t0) * 1000)
  end
  return r
end

-- ===== [S2] Testliste · test list =====
-- DE: Eine Zeile = ein Test. "#" = Gruppenüberschrift, "!" vorn = verändert den Zustand (nur mit /fwprobe risky).
-- EN: one line = one test. "#" = group heading, leading "!" = changes state (only with /fwprobe risky).

local SPEC = [[
# Basis · basics
GetTime()
GetBuildInfo()
GetLocale()
GetRealmName()
GetGameTime()
GetFramerate()
GetNetStats()
GetScreenWidth()
GetScreenHeight()
GetCVar("realmName")
UnitName("player")
UnitHealth("player")
UnitHealthMax("player")
UnitHealth("target")
UnitHealthMax("target")
UnitLevel("player")
UnitClass("player")
UnitRace("player")
UnitSex("player")
UnitMana("player")
UnitManaMax("player")
UnitPowerType("player")
UnitFactionGroup("player")
UnitGUID and UnitGUID("player")
UnitExists("target")
UnitIsDead("player")
UnitIsDeadOrGhost("player")
UnitIsPlayer("player")
UnitIsUnit("player", "player")
UnitIsFriend("player", "player")
UnitIsEnemy("player", "player")
UnitReaction("player", "player")
UnitCanAttack("player", "player")
UnitAffectingCombat("player")
UnitIsPVP("player")
UnitClassification("player")
UnitCreatureType("player")
UnitXP("player")
UnitXPMax("player")
UnitStat("player", 1)
UnitArmor("player")
UnitResistance("player", 2)
UnitDefense("player")
UnitAttackPower("player")
UnitAttackSpeed("player")
UnitDamage("player")
UnitCharacterPoints("player")
UnitOnTaxi("player")
UnitInParty("player")
UnitInRaid("player")
UnitIsPartyLeader("player")
UnitPlayerControlled("player")
UnitIsConnected("player")
UnitIsVisible("player")
UnitOnTaxi("player")
GetPlayerInfoByGUID and GetPlayerInfoByGUID(UnitGUID("player"))
UnitNameFromGUID and UnitNameFromGUID(UnitGUID("player"))
UnitTokenFromGUID and UnitTokenFromGUID(UnitGUID("player"))
# Zonen und Position · zones and position
GetZoneText()
GetRealZoneText()
GetSubZoneText()
GetMinimapZoneText()
GetZonePVPInfo()
GetBindLocation()
GetPlayerMapPosition("player")
GetCurrentMapContinent()
GetCurrentMapZone()
GetMapContinents()
GetMapZones(1)
GetMapInfo()
GetNumMapLandmarks()
UnitPosition and UnitPosition("player")
C_Map and C_Map.GetBestMapForUnit("player")
C_Map and C_Map.GetPlayerMapPosition(C_Map.GetBestMapForUnit("player"), "player")
C_Map and C_Map.GetMapInfo(C_Map.GetBestMapForUnit("player"))
C_Map and C_Map.GetWorldPosFromMapPos(C_Map.GetBestMapForUnit("player"), CreateVector2D(0.5, 0.5))
C_Map and C_Map.GetMapChildrenInfo(-14)
C_Map and C_Map.GetAreaInfo(12)
C_Map and C_Map.HasUserWaypoint()
IsInInstance()
IsIndoors()
IsOutdoors()
IsResting()
IsMounted and IsMounted()
IsSwimming and IsSwimming()
IsFalling and IsFalling()
IsStealthed and IsStealthed()
GetPlayerFacing and GetPlayerFacing()
# Zeit und Eingabe · time and input
IsShiftKeyDown()
IsControlKeyDown()
IsAltKeyDown()
IsMouseButtonDown and IsMouseButtonDown("LeftButton")
IsModifiedClick and IsModifiedClick("CHATLINK")
GetModifiedClick and GetModifiedClick("CHATLINK")
SecondsToTime(3725)
date("%H:%M:%S", 3600)
time()
GetText and GetText("TEST", nil, nil)
# Aktionsleiste · action bar
HasAction(1)
GetActionTexture(1)
GetActionText(1)
GetActionCount(1)
GetActionCooldown(1)
IsUsableAction(1)
IsCurrentAction(1)
IsAttackAction(1)
IsAutoRepeatAction(1)
IsConsumableAction(1)
ActionHasRange(1)
IsActionInRange(1)
GetBonusBarOffset()
GetActionBarToggles()
# Zauber · spells
GetNumSpellTabs()
GetSpellTabInfo(1)
GetSpellName(1, "spell")
GetSpellTexture(1, "spell")
GetSpellCooldown(1, "spell")
IsSpellKnown and IsSpellKnown(78)
GetSpellInfo and GetSpellInfo(133)
GetSpellLink and GetSpellLink(133)
C_Spell and C_Spell.GetSpellInfo(133)
C_Spell and C_Spell.GetSpellCooldown(133)
C_Spell and C_Spell.IsSpellUsable(133)
C_Spell and C_Spell.UnitCastingInfo("player")
C_SpellBook and C_SpellBook.IsSpellKnown(133)
IsUsableSpell(1, "spell")
GetNumShapeshiftForms()
GetShapeshiftForm()
GetShapeshiftFormInfo(1)
# Auren · auras
UnitBuff("player", 1)
UnitBuff("player", 2)
UnitDebuff("player", 1)
UnitBuff("target", 1)
GetPlayerBuff(0, "HELPFUL")
GetPlayerBuffTexture(0)
GetPlayerBuffApplications(0)
GetPlayerBuffTimeLeft(0)
C_UnitAuras and C_UnitAuras.GetAuraDataByIndex("player", 1, "HELPFUL")
C_UnitAuras and C_UnitAuras.GetBuffDataByIndex("player", 1)
C_UnitAuras and C_UnitAuras.GetDebuffDataByIndex("player", 1)
C_UnitAuras and C_UnitAuras.GetUnitAuras("player", "HELPFUL")
C_UnitAuras and C_UnitAuras.UnitAura("player", 1, "HELPFUL")
C_UnitAuras and C_UnitAuras.GetAuraSlots("player", "HELPFUL")
C_UnitAuras and C_UnitAuras.GetAuraDataBySlot("player", 1)
# Inventar und Ausrüstung · inventory and equipment
GetContainerNumSlots(0)
GetContainerNumFreeSlots and GetContainerNumFreeSlots(0)
GetContainerItemInfo(0, 1)
GetContainerItemLink(0, 1)
GetContainerItemCooldown(0, 1)
GetInventoryItemLink("player", 16)
GetInventoryItemTexture("player", 16)
GetInventoryItemCount("player", 16)
GetInventoryItemCooldown("player", 16)
GetInventoryItemQuality("player", 16)
GetInventorySlotInfo("MainHandSlot")
GetInventoryAlertStatus(1)
GetItemInfo(6948)
GetItemInfo(25)
GetItemQualityColor(2)
GetItemCount(6948)
IsEquippedItem and IsEquippedItem(25)
IsEquippableItem and IsEquippableItem(25)
GetMoney()
GetCoinText and GetCoinText(123456)
GetCoinTextureString and GetCoinTextureString(123456)
GetNumBankSlots()
GetRepairAllCost()
GetInventoryItemsForSlot and GetInventoryItemsForSlot(16)
C_Container and C_Container.GetContainerItemInfo(0, 1)
C_Item and C_Item.GetItemInfo(6948)
C_Item and C_Item.GetItemNameByID(6948)
C_Item and C_Item.GetItemIconByID(6948)
C_Item and C_Item.GetItemCount(6948)
C_Item and C_Item.IsItemDataCachedByID(6948)
C_EquipmentSet and C_EquipmentSet.GetNumEquipmentSets()
C_EquipmentSet and C_EquipmentSet.GetEquipmentSetIDs()
C_PaperDollInfo and C_PaperDollInfo.GetInventorySlotInfoForInvSlot(16)
# Quests und Ruf · quests and reputation
GetNumQuestLogEntries()
GetQuestLogTitle(1)
GetQuestLogTitle(2)
GetQuestLogSelection()
GetQuestLogQuestText()
GetNumQuestLeaderBoards(2)
GetQuestLogLeaderBoard(1, 2)
GetNumQuestWatches()
GetQuestGreenRange()
GetNumFactions()
GetFactionInfo(1)
GetFactionInfo(2)
GetWatchedFactionInfo()
C_QuestLog and C_QuestLog.GetNumQuestLogEntries()
C_QuestLog and C_QuestLog.GetInfo(1)
C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted(5)
GetQuestsCompleted and GetQuestsCompleted()
C_Reputation and C_Reputation.GetFactionDataByIndex(2)
C_Reputation and C_Reputation.GetWatchedFactionData()
# Gruppe, Raid, Gilde · party, raid, guild
GetNumPartyMembers()
GetNumRaidMembers()
GetPartyMember(1)
GetPartyLeaderIndex()
IsPartyLeader()
IsRaidLeader()
IsRaidOfficer()
GetRaidRosterInfo(1)
GetLootMethod()
GetLootThreshold()
IsInGroup and IsInGroup()
IsInRaid and IsInRaid()
GetRaidTargetIndex("player")
IsInGuild()
GetGuildInfo("player")
GetNumGuildMembers()
GetGuildRosterInfo(1)
GetGuildRosterMOTD()
CanEditMOTD()
GuildControlGetNumRanks()
# Freunde, Who, Kanäle · friends, who, channels
GetNumFriends()
GetFriendInfo(1)
GetNumIgnores()
GetIgnoreName(1)
GetNumWhoResults()
GetWhoInfo(1)
GetChannelList()
GetChannelName(1)
EnumerateServerChannels()
C_FriendList and C_FriendList.GetNumFriends()
C_FriendList and C_FriendList.GetFriendInfoByIndex(1)
C_FriendList and C_FriendList.GetNumWhoResults()
C_FriendList and C_FriendList.IsWhoQueryPending()
C_PlayerInfo and C_PlayerInfo.GUIDIsPlayer(UnitGUID("player"))
C_PlayerInfo and C_PlayerInfo.GetName(UnitGUID("player"))
C_CreatureInfo and C_CreatureInfo.GetClassInfo(1)
C_CreatureInfo and C_CreatureInfo.GetRaceInfo(1)
C_CreatureInfo and C_CreatureInfo.GetCreatureTypeInfo(7)
C_CreatureInfo and C_CreatureInfo.GetFactionInfo(1)
C_CreatureInfo and C_CreatureInfo.GetCreatureFamilyIDs()
C_CreatureInfo and C_CreatureInfo.GetCreatureTypeIDs()
# Talente, Fertigkeiten, Verfolgung · talents, skills, tracking
GetNumTalentTabs()
GetTalentTabInfo(1)
GetNumTalents(1)
GetTalentInfo(1, 1)
GetNumSkillLines()
GetSkillLineInfo(1)
GetNumTrackingTypes()
GetTrackingInfo(1)
GetTrackingTexture()
GetXPExhaustion()
GetRestState()
GetComboPoints()
GetBlockChance()
GetDodgeChance()
GetParryChance()
GetCombatRating and GetCombatRating(1)
# Taxi, Händler, Gespräch · taxi, merchant, gossip
NumTaxiNodes()
TaxiNodeName(1)
TaxiNodeGetType(1)
TaxiNodeCost(1)
GetMerchantNumItems()
GetMerchantItemInfo(1)
GetMerchantItemLink(1)
CanMerchantRepair()
GetNumGossipOptions()
GetGossipText()
GetNumGossipAvailableQuests()
GetNumLootItems()
GetLootSlotInfo(1)
GetLootRollItemInfo(1)
GetNumTradeSkills()
GetNumCrafts()
GetInboxNumItems()
HasNewMail()
GetNumAuctionItems("list")
GetTrainerServiceInfo and GetNumTrainerServices()
IsTradeskillTrainer and IsTradeskillTrainer()
C_TaxiMap and C_TaxiMap.GetTaxiNodesForMap(0)
C_TaxiMap and C_TaxiMap.GetAllTaxiNodes(0)
# Sound, Makros, Bindungen, AddOns · sound, macros, bindings, addons
GetNumMacros()
GetMacroInfo(1)
GetMacroBody(1)
GetMacroIndexByName("x")
GetNumBindings()
GetBinding(1)
GetBindingKey("MOVEFORWARD")
GetBindingAction("W")
GetCurrentBindingSet()
GetNumAddOns()
GetAddOnInfo(1)
GetAddOnInfo("FreewoodProbe")
IsAddOnLoaded("FreewoodProbe")
IsAddOnLoaded("Blizzard_AuctionUI")
GetAddOnMetadata("FreewoodProbe", "Title")
C_AddOns and C_AddOns.GetNumAddOns()
C_Sound and C_Sound.GetRecentSoundFiles()
C_Sound and C_Sound.IsPlaying(1)
PlaySound("igMainMenuOpen")
C_Sound and C_Sound.PlaySound(567)
# Hilfen der ClassicAPI · ClassicAPI helpers
strsplit(",", "a,b,c")
strtrim("  x  ")
strlenutf8 and strlenutf8("äöü")
CreateColor and CreateColor(1, 0.5, 0.25, 1):GenerateHexColor()
CreateVector2D and CreateVector2D(3, 4):GetXY()
Mixin and Mixin({}, { a = 1 }).a
C_EncodingUtil and C_EncodingUtil.EncodeBase64("Hello")
C_EncodingUtil and C_EncodingUtil.SerializeJSON({ a = 1 })
C_Timer and C_Timer.After
C_Texture and C_Texture.GetAtlasInfo("sample")
C_ClassColor and C_ClassColor.GetClassColor("MAGE")
RAID_CLASS_COLORS and RAID_CLASS_COLORS["MAGE"]
C_DeathInfo and C_DeathInfo.GetCorpseMapPosition and 1
C_Loot and C_Loot.IsLegacyLootModeEnabled and C_Loot.IsLegacyLootModeEnabled()
C_NewItems and C_NewItems.IsNewItem(0, 1)
# Zustandsändernd, rückgängig gemacht · state changing, reverted
!TargetUnit("player"); return UnitName("target")
!ClearTarget(); return UnitExists("target")
!AddFriend("Fwprobetest"); return GetNumFriends()
!RemoveFriend("Fwprobetest"); return GetNumFriends()
!AddIgnore("Fwprobetest"); return GetNumIgnores()
!DelIgnore("Fwprobetest"); return GetNumIgnores()
!JoinChannelByName("FwProbe"); return GetChannelName("FwProbe")
!LeaveChannelByName("FwProbe"); return GetChannelName("FwProbe")
!CreateMacro("FwProbe", 1, "/script x=1", nil, 1); return GetMacroIndexByName("FwProbe")
!DeleteMacro(GetMacroIndexByName("FwProbe")); return GetMacroIndexByName("FwProbe")
!SetModifiedClick and SetModifiedClick("FWPROBE", "SHIFT"); return GetModifiedClick("FWPROBE")
!RequestTimePlayed(); return 1
!SendWho("n-FwProbeNobody"); return 1
!GuildRoster(); return 1
!RequestRaidInfo(); return 1
!TargetNearestEnemy(); return UnitName("target")
!ClearTarget(); return 1
!CastSpellByName("Attack"); return 1
!SpellStopCasting(); return 1
!StopAttack(); return 1
]]

-- ===== [S3] Ablauf · runner =====

local EVENTS = {
  "PLAYER_ENTERING_WORLD", "PLAYER_TARGET_CHANGED", "PLAYER_FOCUS_CHANGED", "PLAYER_LOGIN", "VARIABLES_LOADED",
  "UNIT_HEALTH", "UNIT_MANA", "UNIT_RAGE", "UNIT_ENERGY", "UNIT_AURA", "PLAYER_AURAS_CHANGED", "UNIT_INVENTORY_CHANGED",
  "BAG_UPDATE", "BAG_UPDATE_COOLDOWN", "ACTIONBAR_UPDATE_COOLDOWN", "ACTIONBAR_UPDATE_STATE", "ACTIONBAR_PAGE_CHANGED",
  "SPELLCAST_START", "SPELLCAST_STOP", "SPELLCAST_FAILED", "SPELLCAST_INTERRUPTED", "SPELLCAST_DELAYED",
  "SPELLCAST_CHANNEL_START", "SPELLCAST_CHANNEL_STOP", "SPELLCAST_CHANNEL_UPDATE", "UNIT_SPELLCAST_START", "UNIT_SPELLCAST_STOP",
  "UNIT_SPELLCAST_SUCCEEDED", "UNIT_SPELLCAST_FAILED", "UNIT_SPELLCAST_INTERRUPTED", "SPELLS_CHANGED", "LEARNED_SPELL_IN_TAB",
  "PLAYER_ENTER_COMBAT", "PLAYER_LEAVE_COMBAT", "PLAYER_REGEN_DISABLED", "PLAYER_REGEN_ENABLED", "PLAYER_DEAD", "PLAYER_ALIVE", "PLAYER_UNGHOST",
  "PLAYER_MONEY", "PLAYER_XP_UPDATE", "PLAYER_LEVEL_UP", "PLAYER_CONTROL_LOST", "PLAYER_CONTROL_GAINED",
  "PARTY_MEMBERS_CHANGED", "PARTY_LEADER_CHANGED", "PARTY_LOOT_METHOD_CHANGED", "RAID_ROSTER_UPDATE", "RAID_TARGET_UPDATE",
  "READY_CHECK", "READY_CHECK_CONFIRM", "READY_CHECK_FINISHED", "PARTY_INVITE_REQUEST", "WHO_LIST_UPDATE",
  "FRIENDLIST_UPDATE", "IGNORELIST_UPDATE", "GUILD_ROSTER_UPDATE", "GUILD_MOTD", "TIME_PLAYED_MSG", "UPDATE_INSTANCE_INFO",
  "CHAT_MSG_SYSTEM", "CHAT_MSG_CHANNEL_NOTICE", "CHAT_MSG_ADDON", "CHAT_MSG_SAY", "CHAT_MSG_TEXT_EMOTE", "UI_ERROR_MESSAGE", "UI_INFO_MESSAGE",
  "ZONE_CHANGED", "ZONE_CHANGED_INDOORS", "ZONE_CHANGED_NEW_AREA", "MINIMAP_ZONE_CHANGED", "MINIMAP_UPDATE_TRACKING",
  "QUEST_LOG_UPDATE", "QUEST_WATCH_UPDATE", "QUEST_ACCEPTED", "UNIT_QUEST_LOG_CHANGED", "UPDATE_FACTION",
  "CHARACTER_POINTS_CHANGED", "SKILL_LINES_CHANGED", "UPDATE_BINDINGS", "UPDATE_MACROS", "ACTIONBAR_SHOWGRID",
  "MERCHANT_SHOW", "MERCHANT_UPDATE", "MERCHANT_CLOSED", "GOSSIP_SHOW", "GOSSIP_CLOSED", "LOOT_OPENED", "LOOT_CLOSED", "LOOT_SLOT_CLEARED",
  "TAXIMAP_OPENED", "TAXIMAP_CLOSED", "AUTOFOLLOW_BEGIN", "AUTOFOLLOW_END", "UPDATE_SHAPESHIFT_FORMS", "UPDATE_SHAPESHIFT_FORM",
  "CURSOR_UPDATE", "PLAYERBANKSLOTS_CHANGED", "UNIT_PET", "PET_BAR_UPDATE", "UNIT_FACTION", "UNIT_LEVEL", "UNIT_NAME_UPDATE",
  "INSPECT_TALENT_READY", "DUEL_REQUESTED", "CONFIRM_SUMMON", "CREATURE_DATA_LOAD_RESULT", "GAMEOBJECT_DATA_LOAD_RESULT", "QUEST_DATA_LOAD_RESULT",
  "ITEM_DATA_LOAD_RESULT", "PLAYER_LOGOUT", "PLAYER_QUITING", "PLAYER_LOGIN", "UPDATE_MOUSEOVER_UNIT", "UNIT_COMBAT", "UNIT_DISPLAYPOWER",
}

local frame = CreateFrame("Frame", "FreewoodProbeFrame")
local evCount = 0

local function onEvent()
  evCount = evCount + 1
  if evCount > 1500 then return end
  local e = db.events
  if not e then return end
  e[table.getn(e) + 1] = string.format("%.2f", GetTime() - startedAt) .. " [" .. current .. "] " .. tostring(event) .. "(" ..
    ser(arg1) .. ", " .. ser(arg2) .. ", " .. ser(arg3) .. ", " .. ser(arg4) .. ")"
end

local function build()
  queue = {}
  local group = ""
  for line in (string.gfind or string.gmatch)(SPEC, "[^\n]+") do
    if string.sub(line, 1, 1) == "#" then
      group = string.sub(line, 3)
    else
      local isRisky = string.sub(line, 1, 1) == "!"
      if isRisky then line = string.sub(line, 2) end
      if (not isRisky) or risky then
        queue[table.getn(queue) + 1] = { group = group, code = line, name = line }
      end
    end
  end
end

local function finish()
  running = false
  frame:SetScript("OnUpdate", nil)
  db.finished = date("%Y-%m-%d %H:%M:%S")
  db.count = table.getn(queue)
  db.eventCount = evCount
  say("fertig / done: " .. table.getn(queue) .. " tests, " .. evCount .. " events. /reload oder Abmelden schreibt die Datei / /reload or logout writes the file.")
end

local function step()
  pos = pos + 1
  local q = queue[pos]
  if not q then finish() return end
  current = q.code
  local r = record(q.name, q.code)
  r.group = q.group
  r.t = string.format("%.2f", GetTime() - startedAt)
  db.results[pos] = r
  if (math.mod or math.fmod)(pos, 40) == 0 then say(pos .. " / " .. table.getn(queue)) end
  current = "-"
end

local function onUpdate()
  elapsed = elapsed + arg1
  if elapsed >= 0.3 then
    elapsed = 0
    step()
  end
end

local function start()
  if running then say("läuft bereits / already running") return end
  local okS, hasS = pcall(function() return ("x").upper ~= nil end)
  db = { results = {}, events = {} }
  FreewoodProbeDB = db
  db.meta = {
    started = date("%Y-%m-%d %H:%M:%S"), build = tostring((GetBuildInfo())), buildInfo = ser(pack(GetBuildInfo())),
    locale = GetLocale(), realm = GetRealmName(), player = UnitName("player"), risky = risky,
    lua = tostring(_VERSION), hasSelect = tostring(select ~= nil), hasStringMethods = tostring(okS and hasS),
    interface = "1.12", clientIsClassicAPI = tostring(C_Timer ~= nil),
  }
  startedAt = GetTime()
  evCount = 0
  build()
  pos, elapsed = 0, 0
  running = true
  frame:SetScript("OnUpdate", onUpdate)
  say("Start: " .. table.getn(queue) .. " Tests, alle 0,3 s einer / one test every 0.3 s.")
end

-- DE: Ereignisse bleiben immer registriert, damit auch Ereignisse zwischen den Tests erfasst werden.
-- EN: events stay registered so events between tests are captured as well.
for i = 1, table.getn(EVENTS) do
  frame:RegisterEvent(EVENTS[i])
end
frame:SetScript("OnEvent", onEvent)

local boot = CreateFrame("Frame")
local bootT = 0
boot:RegisterEvent("PLAYER_ENTERING_WORLD")
boot:SetScript("OnEvent", function()
  bootT = 0
  boot:SetScript("OnUpdate", function()
    bootT = bootT + arg1
    if bootT >= 4 then
      boot:SetScript("OnUpdate", nil)
      if not FreewoodProbeDB or not FreewoodProbeDB.finished or FreewoodProbeDB.forceAuto then start() end
    end
  end)
end)

-- ===== [S4] Befehle · commands =====

SLASH_FWPROBE1 = "/fwprobe"
SlashCmdList["FWPROBE"] = function(msg)
  msg = string.lower(msg or "")
  if msg == "risky" then risky = true; running = false; start()
  elseif msg == "stop" then
    if running then finish() end
  elseif msg == "status" then
    say((running and "läuft / running " or "gestoppt / stopped ") .. pos .. " / " .. table.getn(queue) .. ", events " .. evCount)
  else
    risky = false; running = false; start()
  end
end
