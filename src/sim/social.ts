/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Zustand · state ......... Freunde, Ignorierliste, Who, Gruppe, Raid, Gilde, Kanäle
 *   [S2] FRIENDS_API ............. Freunde, Ignorieren, Who (Vanilla + C_FriendList, C_PlayerCache)
 *   [S3] GROUP_API ............... Gruppe, Raid, Beute, Bereitschaftsabfrage
 *   [S4] GUILD_API ............... Gilde und Kanäle
 *
 * DE: Beispieldaten; alle Namen sind erfunden. Ereignisse feuern nur, wenn das Ziel sie kennt.
 *     Reihenfolge und Rückgabeformate sind bis zum Test im Spiel `unverified`.
 * EN: sample data; all names are invented. Events fire only if the target knows them.
 *     Order and return formats are `unverified` until tested in game.
 */
import { type Impl, type SimHost, num, str } from "./host.js";
import type { UnitData } from "./scenario.js";
import { unitGuid } from "./units.js";

// ===== [S1] Zustand · state =====

interface Friend { name: string; level: number; class: string; area: string; connected: boolean; notes?: string }
interface WhoRow { name: string; guild: string; level: number; race: string; class: string; classToken: string; zone: string }
interface Social {
  friends: Friend[]; ignore: string[]; selFriend: number; selIgnore: number;
  who: WhoRow[]; whoPending: boolean; whoTotal: number;
  leader: string; assistants: string[]; subgroup: Record<string, number>; marks: Record<string, number>;
  lootMethod: string; lootThreshold: number; masterLooter?: string; readyCheck?: { by: string; ends: number };
  rosterShowOffline: boolean; guildSel: number; motd: string; guildInfo: string;
  channels: string[]; cache: boolean; remembered: Record<string, { guid: string; classToken: string }>;
}

const social = (h: SimHost): Social => h.store("social", (): Social => ({
  friends: [
    { name: "Aldenbrook", level: 60, class: "Mage", area: "Ironforge", connected: true },
    { name: "Mirelle", level: 34, class: "Priest", area: "Stormwind City", connected: true },
    { name: "Gorzak", level: 52, class: "Warrior", area: "Offline", connected: false },
  ],
  ignore: ["Spammerson"], selFriend: 0, selIgnore: 0,
  who: [], whoPending: false, whoTotal: 0,
  leader: "", assistants: [], subgroup: {}, marks: {},
  lootMethod: "group", lootThreshold: 2, rosterShowOffline: true, guildSel: 0,
  motd: "Welcome to the sample guild.", guildInfo: "Sample guild information.",
  channels: ["General", "Trade"], cache: true, remembered: {},
}));

const WHO_POOL: WhoRow[] = [
  { name: "Aldenbrook", guild: "Sample Guild", level: 60, race: "Gnome", class: "Mage", classToken: "MAGE", zone: "Ironforge" },
  { name: "Mirelle", guild: "", level: 34, race: "Human", class: "Priest", classToken: "PRIEST", zone: "Stormwind City" },
  { name: "Torvik", guild: "Sample Guild", level: 58, race: "Dwarf", class: "Hunter", classToken: "HUNTER", zone: "Winterspring" },
  { name: "Nessa", guild: "", level: 12, race: "Night Elf", class: "Druid", classToken: "DRUID", zone: "Teldrassil" },
];

const cap = (n: string): string => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();

function members(h: SimHost): UnitData[] { return [h.scenario.player, ...h.scenario.party]; }
function leaderName(h: SimHost, s: Social): string { return s.leader || h.scenario.player.name; }
function inRaid(h: SimHost): boolean { return (h.scenario.raidCount ?? 0) > 0; }

function addMember(h: SimHost, name: string): void {
  const sc = h.scenario;
  if (sc.party.length >= (inRaid(h) ? 39 : 4)) { h.fire("UI_ERROR_MESSAGE", "Your party is full."); return; }
  sc.party.push({ name: cap(name), class: "Warrior", classToken: "WARRIOR", race: "Human", level: 60, health: 3000, healthMax: 3000, isPlayer: true, friendly: true, power: 40, powerMax: 100 });
  if (inRaid(h)) sc.raidCount = sc.party.length + 1;
  h.fireIf("PARTY_MEMBERS_CHANGED"); if (inRaid(h)) h.fireIf("RAID_ROSTER_UPDATE");
}

function removeMember(h: SimHost, name: string): void {
  const sc = h.scenario; const k = sc.party.findIndex((u) => u.name.toLowerCase() === name.toLowerCase());
  if (k < 0) return;
  sc.party.splice(k, 1);
  if (inRaid(h)) sc.raidCount = sc.party.length > 0 ? sc.party.length + 1 : 0;
  h.fireIf("PARTY_MEMBERS_CHANGED"); if (inRaid(h) || (h.scenario.raidCount ?? 0) === 0) h.fireIf("RAID_ROSTER_UPDATE");
}

// ===== [S2] FRIENDS_API =====

const friendTable = (f: Friend, i?: number) => ({ name: f.name, connected: f.connected, level: f.connected ? f.level : 0, className: f.class, area: f.area, notes: f.notes, afk: false, dnd: false, guid: `0x00000000${(i ?? 0).toString(16).padStart(8, "0")}` });
const who = (w: WhoRow) => ({ fullName: w.name, fullGuildName: w.guild, level: w.level, raceStr: w.race, classStr: w.class, filename: w.classToken, area: w.zone, sex: 2 });

function runWho(h: SimHost, q: string): void {
  const s = social(h); s.whoPending = true;
  h.later(0.5, () => {
    const t = q.trim().toLowerCase().replace(/^[nzgcr]-/, "").replace(/"/g, "");
    s.who = t ? WHO_POOL.filter((w) => [w.name, w.guild, w.zone, w.class, w.race, String(w.level)].some((x) => x.toLowerCase().includes(t))) : [...WHO_POOL];
    s.whoTotal = s.who.length; s.whoPending = false;
    h.fireIf("WHO_LIST_UPDATE");
  });
}

function addIgnore(h: SimHost, name: string): void {
  const s = social(h); const n = cap(name);
  if (!s.ignore.some((x) => x.toLowerCase() === n.toLowerCase())) { s.ignore.push(n); h.fireIf("IGNORELIST_UPDATE"); }
}
function delIgnore(h: SimHost, who2: unknown): void {
  const s = social(h); const k = typeof who2 === "number" ? who2 - 1 : s.ignore.findIndex((x) => x.toLowerCase() === String(who2).toLowerCase());
  if (k >= 0 && k < s.ignore.length) { s.ignore.splice(k, 1); h.fireIf("IGNORELIST_UPDATE"); }
}
function addFriend(h: SimHost, name: string): void {
  const s = social(h); const n = cap(name);
  if (s.friends.some((f) => f.name.toLowerCase() === n.toLowerCase())) { h.fire("UI_ERROR_MESSAGE", `${n} is already your friend.`); return; }
  s.friends.push({ name: n, level: 1, class: "Unknown", area: "Unknown", connected: false });
  h.fireIf("FRIENDLIST_UPDATE");
}
function delFriend(h: SimHost, who2: unknown): void {
  const s = social(h); const k = typeof who2 === "number" ? who2 - 1 : s.friends.findIndex((f) => f.name.toLowerCase() === String(who2).toLowerCase());
  if (k >= 0 && k < s.friends.length) { s.friends.splice(k, 1); h.fireIf("FRIENDLIST_UPDATE"); }
}

export const FRIENDS_API: Record<string, Impl> = {
  GetNumFriends: (h) => social(h).friends.length,
  GetFriendInfo: (h, a) => { const f = social(h).friends[(num(a[0]) ?? 0) - 1]; return f ? [f.name, f.level, f.class, f.area, f.connected, ""] : undefined; },
  AddFriend: (h, a) => { if (str(a[0])) addFriend(h, str(a[0])!); },
  RemoveFriend: (h, a) => delFriend(h, a[0]),
  AddOrRemoveFriend: (h, a) => { const n = str(a[0]); if (!n) return; if (social(h).friends.some((f) => f.name.toLowerCase() === n.toLowerCase())) delFriend(h, n); else addFriend(h, n); },
  SetSelectedFriend: (h, a) => { social(h).selFriend = num(a[0]) ?? 0; },
  GetSelectedFriend: (h) => social(h).selFriend,
  ShowFriends: (h) => { h.fireIf("FRIENDLIST_UPDATE"); },
  ToggleFriendsFrame: () => undefined,
  AddIgnore: (h, a) => { if (str(a[0])) addIgnore(h, str(a[0])!); },
  DelIgnore: (h, a) => delIgnore(h, a[0]),
  AddOrDelIgnore: (h, a) => { const n = str(a[0]); if (!n) return; if (social(h).ignore.some((x) => x.toLowerCase() === n.toLowerCase())) delIgnore(h, n); else addIgnore(h, n); },
  GetNumIgnores: (h) => social(h).ignore.length,
  GetIgnoreName: (h, a) => social(h).ignore[(num(a[0]) ?? 0) - 1],
  SetSelectedIgnore: (h, a) => { social(h).selIgnore = num(a[0]) ?? 0; },
  GetSelectedIgnore: (h) => social(h).selIgnore,
  SendWho: (h, a) => runWho(h, str(a[0]) ?? ""),
  SetWhoToUI: () => undefined,
  SortWho: () => undefined,
  GetNumWhoResults: (h) => { const s = social(h); return [s.who.length, s.whoTotal]; },
  GetWhoInfo: (h, a) => { const w = social(h).who[(num(a[0]) ?? 0) - 1]; return w ? [w.name, w.guild, w.level, w.race, w.class, w.zone, w.classToken] : undefined; },
  "C_FriendList.GetNumFriends": (h) => social(h).friends.length,
  "C_FriendList.GetNumOnlineFriends": (h) => social(h).friends.filter((f) => f.connected).length,
  "C_FriendList.GetFriendInfo": (h, a) => { const s = social(h); const k = s.friends.findIndex((f) => f.name.toLowerCase() === String(a[0]).toLowerCase()); return k < 0 ? undefined : friendTable(s.friends[k]!, k + 1); },
  "C_FriendList.GetFriendInfoByIndex": (h, a) => { const k = (num(a[0]) ?? 0) - 1; const f = social(h).friends[k]; return f ? friendTable(f, k + 1) : undefined; },
  "C_FriendList.IsFriend": (h, a) => social(h).friends.some((f, i) => friendTable(f, i + 1).guid === a[0]),
  "C_FriendList.IsIgnored": (h, a) => { const s = social(h); return typeof a[0] === "string" ? s.ignore.some((x) => x.toLowerCase() === (a[0] as string).toLowerCase()) : false; },
  "C_FriendList.IsIgnoredByGuid": () => false,
  "C_FriendList.SendWhoQueryByName": (h, a) => runWho(h, str(a[0]) ?? ""),
  "C_FriendList.IsWhoQueryPending": (h) => social(h).whoPending,
  "C_FriendList.GetNumWhoResults": (h) => { const s = social(h); return [s.who.length, s.whoTotal]; },
  "C_FriendList.GetWhoInfo": (h, a) => { const w = social(h).who[(num(a[0]) ?? 0) - 1]; return w ? who(w) : undefined; },
  "C_FriendList.SetFriendNotes": (h, a) => { const f = social(h).friends.find((x) => x.name.toLowerCase() === String(a[0]).toLowerCase()); if (!f) return false; f.notes = str(a[1]) ?? ""; h.fireIf("FRIENDLIST_UPDATE"); return true; },
  "C_FriendList.SetFriendNotesByIndex": (h, a) => { const f = social(h).friends[(num(a[0]) ?? 0) - 1]; if (!f) return false; f.notes = str(a[1]) ?? ""; h.fireIf("FRIENDLIST_UPDATE"); return true; },
  "C_PlayerCache.IsEnabled": (h) => social(h).cache,
  "C_PlayerCache.SetEnabled": (h, a) => { social(h).cache = a[0] !== false; },
  "C_PlayerCache.RememberPlayer": (h, a) => { if (str(a[1])) social(h).remembered[str(a[1])!.toLowerCase()] = { guid: str(a[0]) ?? "", classToken: str(a[2]) ?? "" }; },
  "C_PlayerCache.GetPlayerInfoByName": (h, a) => {
    const n = String(a[0]).toLowerCase();
    const u = members(h).find((x) => x.name.toLowerCase() === n);
    if (u) return [undefined, u.classToken, undefined, u.race, undefined, undefined, undefined, unitGuid(u)];
    const r = social(h).remembered[n];
    return r ? [undefined, r.classToken, undefined, undefined, undefined, undefined, undefined, r.guid] : undefined;
  },
};

// ===== [S3] GROUP_API =====

export const GROUP_API: Record<string, Impl> = {
  GetPartyMember: (h, a) => (num(a[0]) ?? 0) >= 1 && (num(a[0]) ?? 0) <= h.scenario.party.length && !inRaid(h),
  GetPartyLeaderIndex: (h) => { const s = social(h); if (!h.scenario.party.length || !s.leader) return 0; return h.scenario.party.findIndex((u) => u.name === s.leader) + 1; },
  IsPartyLeader: (h) => h.scenario.party.length > 0 && leaderName(h, social(h)) === h.scenario.player.name,
  PromoteToPartyLeader: (h, a) => { const u = h.unit(a[0]); if (u) { social(h).leader = u.name; h.fireIf("PARTY_LEADER_CHANGED"); h.fireIf("PARTY_MEMBERS_CHANGED"); } },
  PromoteToLeader: (h, a) => GROUP_API.PromoteToPartyLeader!(h, a),
  PromoteByName: (h, a) => { const n = str(a[0]); if (n && members(h).some((u) => u.name.toLowerCase() === n.toLowerCase())) { social(h).leader = cap(n); h.fireIf("PARTY_LEADER_CHANGED"); h.fireIf("PARTY_MEMBERS_CHANGED"); } },
  InviteByName: (h, a) => { if (str(a[0])) addMember(h, str(a[0])!); },
  InviteToParty: (h, a) => { if (str(a[0])) addMember(h, str(a[0])!); },
  InviteUnit: (h, a) => { const u = h.unit(a[0]); addMember(h, u ? u.name : str(a[0]) ?? "Unknown"); },
  UninviteByName: (h, a) => { if (str(a[0])) removeMember(h, str(a[0])!); },
  UninviteUnit: (h, a) => { const u = h.unit(a[0]); if (u) removeMember(h, u.name); },
  UninviteFromParty: (h, a) => { const u = h.unit(a[0]); if (u) removeMember(h, u.name); },
  UninviteFromRaid: (h, a) => { const u = h.unit(a[0]); if (u) removeMember(h, u.name); },
  LeaveParty: (h) => { h.scenario.party.length = 0; h.scenario.raidCount = 0; social(h).leader = ""; h.fireIf("PARTY_MEMBERS_CHANGED"); h.fireIf("RAID_ROSTER_UPDATE"); },
  AcceptGroup: () => undefined,
  DeclineGroup: () => undefined,
  UnitInParty: (h, a) => { const u = h.unit(a[0]); return u !== undefined && h.scenario.party.includes(u); },
  IsInGroup: (h) => h.scenario.party.length > 0,
  IsInRaid: (h) => inRaid(h),
  ConvertToRaid: (h) => { if (h.scenario.party.length > 0 && !inRaid(h)) { h.scenario.raidCount = h.scenario.party.length + 1; h.fireIf("RAID_ROSTER_UPDATE"); } },
  IsRaidLeader: (h) => inRaid(h) && leaderName(h, social(h)) === h.scenario.player.name,
  IsRaidOfficer: (h) => inRaid(h) && social(h).assistants.includes(h.scenario.player.name),
  PromoteToAssistant: (h, a) => { const u = h.unit(a[0]) ?? members(h).find((x) => x.name.toLowerCase() === String(a[0]).toLowerCase()); if (u && !social(h).assistants.includes(u.name)) { social(h).assistants.push(u.name); h.fireIf("RAID_ROSTER_UPDATE"); } },
  DemoteAssistant: (h, a) => { const u = h.unit(a[0]) ?? members(h).find((x) => x.name.toLowerCase() === String(a[0]).toLowerCase()); if (u) { const s = social(h); s.assistants = s.assistants.filter((x) => x !== u.name); h.fireIf("RAID_ROSTER_UPDATE"); } },
  GetRaidRosterInfo: (h, a) => {
    if (!inRaid(h)) return undefined;
    const u = members(h)[(num(a[0]) ?? 0) - 1]; if (!u) return undefined; const s = social(h);
    const rank = leaderName(h, s) === u.name ? 2 : s.assistants.includes(u.name) ? 1 : 0;
    return [u.name, rank, s.subgroup[u.name] ?? 1, u.level, u.class, u.classToken, h.scenario.player.zone ?? "Elwynn Forest", u.connected !== false, u.dead === true || u.health <= 0, rank === 1 ? "ASSISTANT" : undefined];
  },
  SetRaidSubgroup: (h, a) => { const u = members(h)[(num(a[0]) ?? 0) - 1]; if (u) { social(h).subgroup[u.name] = num(a[1]) ?? 1; h.fireIf("RAID_ROSTER_UPDATE"); } },
  SwapRaidSubgroup: (h, a) => { const x = members(h)[(num(a[0]) ?? 0) - 1], y = members(h)[(num(a[1]) ?? 0) - 1]; if (x && y) { const s = social(h); const t = s.subgroup[x.name] ?? 1; s.subgroup[x.name] = s.subgroup[y.name] ?? 1; s.subgroup[y.name] = t; h.fireIf("RAID_ROSTER_UPDATE"); } },
  SetRaidRosterSelection: () => undefined,
  GetRaidRosterSelection: () => 0,
  RequestRaidInfo: (h) => { h.later(0.2, () => h.fireIf("UPDATE_INSTANCE_INFO")); },
  GetRaidTargetIndex: (h, a) => { const u = h.unit(a[0]); return u ? social(h).marks[u.name] : undefined; },
  SetRaidTarget: (h, a) => { const u = h.unit(a[0]); if (!u) return; const s = social(h); const i = num(a[1]) ?? 0; if (i === 0) delete s.marks[u.name]; else s.marks[u.name] = i; h.fireIf("RAID_TARGET_UPDATE"); },
  GetLootMethod: (h) => { const s = social(h); return [s.lootMethod, s.lootMethod === "master" ? 0 : undefined, undefined]; },
  SetLootMethod: (h, a) => { const s = social(h); s.lootMethod = str(a[0]) ?? "group"; s.masterLooter = str(a[1]); h.fireIf("PARTY_LOOT_METHOD_CHANGED"); },
  GetLootThreshold: (h) => social(h).lootThreshold,
  SetLootThreshold: (h, a) => { social(h).lootThreshold = num(a[0]) ?? 2; h.fireIf("PARTY_LOOT_METHOD_CHANGED"); },
  GetMasterLootCandidate: (h, a) => members(h)[(num(a[0]) ?? 0) - 1]?.name,
  GiveMasterLoot: () => undefined,
  DoReadyCheck: (h) => { const s = social(h); s.readyCheck = { by: h.scenario.player.name, ends: h.now + 30 }; h.fireIf("READY_CHECK", h.scenario.player.name); h.later(30, () => { if (s.readyCheck) { s.readyCheck = undefined; h.fireIf("READY_CHECK_FINISHED"); } }); },
  CheckReadyCheckTime: (h) => { const r = social(h).readyCheck; return r ? Math.max(0, r.ends - h.now) : 0; },
  ConfirmReadyCheck: (h, a) => { const s = social(h); if (s.readyCheck) h.fireIf("READY_CHECK_CONFIRM", h.scenario.player.name, a[0] === true || a[0] === 1); },
  GetLookingForGroup: () => [0, 0, 0, 0, 0, 0],
  SetLookingForGroup: () => undefined,
};

// ===== [S4] GUILD_API =====

const roster = (h: SimHost): UnitData[] => members(h).filter((u) => u.guild !== undefined && u.guild === h.scenario.player.guild);

export const GUILD_API: Record<string, Impl> = {
  IsInGuild: (h) => h.scenario.player.guild !== undefined,
  GetGuildInfo: (h, a) => { const u = h.unit(a[0]); return u?.guild ? [u.guild, u.guildRank ?? "Member", u.guildRankIndex ?? 4] : undefined; },
  GetNumGuildMembers: (h) => { const n = roster(h).length; return [n, n]; },
  GetGuildRosterInfo: (h, a) => { const u = roster(h)[(num(a[0]) ?? 0) - 1]; return u ? [u.name, u.guildRank ?? "Member", u.guildRankIndex ?? 4, u.level, u.class, h.scenario.player.zone ?? "Elwynn Forest", "", "", true, 0, u.classToken] : undefined; },
  GetGuildRosterLastOnline: () => undefined,
  GetGuildRosterMOTD: (h) => (h.scenario.player.guild ? social(h).motd : ""),
  GuildSetMOTD: (h, a) => { social(h).motd = str(a[0]) ?? ""; h.fireIf("GUILD_MOTD", social(h).motd); },
  GetGuildInfoText: (h) => social(h).guildInfo,
  SetGuildInfoText: (h, a) => { social(h).guildInfo = str(a[0]) ?? ""; },
  GuildRoster: (h) => { h.later(0.3, () => h.fireIf("GUILD_ROSTER_UPDATE")); },
  GetGuildRosterShowOffline: (h) => social(h).rosterShowOffline,
  SetGuildRosterShowOffline: (h, a) => { social(h).rosterShowOffline = a[0] === true || a[0] === 1; },
  GetGuildRosterSelection: (h) => social(h).guildSel,
  SetGuildRosterSelection: (h, a) => { social(h).guildSel = num(a[0]) ?? 0; },
  SortGuildRoster: () => undefined,
  IsGuildLeader: (h) => h.scenario.player.guildRankIndex === 0,
  CanEditMOTD: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 1,
  CanEditPublicNote: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 2,
  CanEditOfficerNote: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 1,
  CanViewOfficerNote: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 1,
  CanEditGuildInfo: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 1,
  CanGuildInvite: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 2,
  CanGuildPromote: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 1,
  CanGuildDemote: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 1,
  CanGuildRemove: (h) => (h.scenario.player.guildRankIndex ?? 4) <= 1,
  GuildControlGetNumRanks: () => 5,
  GuildControlGetRankName: (_h, a) => ["Guild Master", "Officer", "Veteran", "Member", "Initiate"][(num(a[0]) ?? 0) - 1],
  JoinChannelByName: (h, a) => { const n = str(a[0]); if (!n) return; const s = social(h); if (!s.channels.includes(n)) s.channels.push(n); h.fireIf("CHAT_MSG_CHANNEL_NOTICE", "YOU_JOINED", "", "", `${s.channels.indexOf(n) + 1}. ${n}`, "", "", 0, s.channels.indexOf(n) + 1, n); },
  LeaveChannelByName: (h, a) => { const s = social(h); const k = s.channels.indexOf(String(a[0])); if (k >= 0) { s.channels.splice(k, 1); h.fireIf("CHAT_MSG_CHANNEL_NOTICE", "YOU_LEFT", "", "", `${k + 1}. ${String(a[0])}`, "", "", 0, k + 1, String(a[0])); } },
  GetChannelName: (h, a) => {
    const s = social(h); const k = typeof a[0] === "number" ? a[0] - 1 : s.channels.findIndex((c) => c.toLowerCase() === String(a[0]).toLowerCase());
    const n = s.channels[k]; return n ? [k + 1, n, 0] : [0, undefined, 0];
  },
  GetChannelList: (h) => social(h).channels.flatMap((c, i) => [i + 1, c]),
  EnumerateServerChannels: () => ["General", "Trade", "LocalDefense", "LookingForGroup"],
};
