/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Zustand · state ........... W3, w3
 *   [S2] Begleiter, Stall · pet .... PET_API, STABLE_API
 *   [S3] Schlachtfeld · battlefield  BATTLEFIELD_API, PVP_API
 *   [S4] Petition, Gilde · petition  PETITION_API, GUILDADMIN_API
 *   [S5] Instanzen · instances ..... INSTANCE_API
 *   [S6] OPENERS_3 ................. öffnet die Fenster · opens the windows
 *
 * DE: Fenster und Zustände rund um Begleiter (Jäger), Schlachtfelder, Petitionen und gespeicherte
 *     Instanzen. Namen und Zahlen sind erfunden; ohne Begleiter/Warteschlange liefern die Abfragen
 *     0/nil. Was der Server entscheidet (Warteschlangenzeit, Ergebnis) ist vereinfacht.
 * EN: windows and states around pets (hunter), battlefields, petitions and saved instances. Names and
 *     numbers are invented; without a pet/queue the queries return 0/nil. What the server decides
 *     (queue time, outcome) is simplified.
 */

import { type Impl, type SimHost, num, str } from "./host.js";

// ===== [S1] Zustand · state =====

interface Pet { name: string; level: number; family: string; icon: string; happiness: number; loyalty: number; xp: number; xpMax: number; points: [number, number]; food: string[]; autocast: Record<string, boolean>; stabled?: boolean }
interface Bf { name: string; min: number; max: number }
interface Queue { status: "queued" | "confirm" | "active"; map: string; id: number; started: number; ends?: number }
interface Petition { type: string; title: string; body: string; max: number; min: number; origin: string; isOrigin: boolean; names: string[] }
interface W3 {
  pet?: Pet; stable?: { pets: Pet[]; slots: number; sel: number; open: boolean };
  bf: { open: boolean; sel: number; list: Bf[]; queues: (Queue | undefined)[]; score: { name: string; kb: number; hk: number; deaths: number; honor: number; faction: number; rank: number; race: string; class: string }[]; winner?: number; scoreFaction: number };
  petition?: Petition; charterOpen: boolean; tabard: boolean; invited?: string;
  saved: { name: string; id: number; remaining: number }[]; spirit?: { ends: number };
}
const w3 = (h: SimHost): W3 => h.store("windows3", (): W3 => ({ bf: { open: false, sel: 0, list: [], queues: [], score: [], scoreFaction: -1 }, charterOpen: false, tabard: false, saved: [] }));
const money = (h: SimHost): number => h.inventory().money ?? 0;

// ===== [S2] Begleiter, Stall · pet =====

const HAPPY = ["Unhappy", "Content", "Happy"];
const LOYAL = ["Rebellious", "Unruly", "Submissive", "Dependable", "Faithful", "Best Friend"];
const petActions = (): [string, string, string][] => [["Attack", "", "Interface\\Icons\\Ability_GhoulFrenzy"], ["Follow", "", "Interface\\Icons\\Ability_Tracking"], ["Stay", "", "Interface\\Icons\\Spell_Nature_TimeStop"], ["Aggressive", "", "Interface\\Icons\\Ability_Racial_BloodRage"], ["Defensive", "", "Interface\\Icons\\Ability_Defend"], ["Passive", "", "Interface\\Icons\\Ability_Seal"]];

export const PET_API: Record<string, Impl> = {
  HasPetUI: (h) => [w3(h).pet !== undefined, w3(h).pet !== undefined], // probe: 2 values
  PetHasActionBar: (h) => w3(h).pet !== undefined,
  GetPetHappiness: (h) => { const p = w3(h).pet; return p ? [p.happiness, [0.75, 1, 1.25][p.happiness - 1] ?? 1, Math.min(1, p.loyalty / 6)] : undefined; },
  GetPetLoyalty: (h) => { const p = w3(h).pet; return p ? LOYAL[p.loyalty - 1] : undefined; },
  GetPetExperience: (h) => { const p = w3(h).pet; return p ? [p.xp, p.xpMax] : [0, 0]; },
  GetPetFoodTypes: (h) => w3(h).pet?.food,
  GetPetTrainingPoints: (h) => { const p = w3(h).pet; return p ? [p.points[0], p.points[1], p.points[0] - p.points[1]] : [0, 0, 0]; },
  GetPetIcon: (h) => w3(h).pet?.icon,
  GetPetTimeRemaining: () => undefined,
  GetPetActionInfo: (h, a) => { if (!w3(h).pet) return [undefined, undefined, undefined, undefined, undefined, undefined, undefined]; const x = petActions()[(num(a[0]) ?? 0) - 1]; return x ? [x[0], x[1], x[2], true, false, false, false] : undefined; },
  GetPetActionCooldown: (h) => (w3(h).pet ? [0, 0, 1] : undefined),
  GetPetActionsUsable: (h) => w3(h).pet !== undefined,
  CastPetAction: (h, a) => { const x = petActions()[(num(a[0]) ?? 0) - 1]; if (w3(h).pet && x) h.fireIf("PET_BAR_UPDATE"); },
  TogglePetAutocast: (h, a) => { const p = w3(h).pet; const k = String(a[0]); if (p) { p.autocast[k] = !p.autocast[k]; h.fireIf("PET_BAR_UPDATE"); } },
  ToggleSpellAutocast: (h, a) => { const p = w3(h).pet; const k = String(a[0]); if (p) { p.autocast[k] = !p.autocast[k]; h.fireIf("PET_BAR_UPDATE"); } },
  GetSpellAutocast: (h, a) => { const p = w3(h).pet; return p ? [true, !!p.autocast[String(a[0])]] : [undefined, undefined]; },
  IsPetAttackActive: () => false,
  PetCanBeAbandoned: (h) => w3(h).pet !== undefined,
  PetCanBeRenamed: (h) => w3(h).pet !== undefined,
  PetRename: (h, a) => { const p = w3(h).pet; if (p && str(a[0])) { p.name = str(a[0])!; h.fireIf("UNIT_NAME_UPDATE", "pet"); } },
  PetAbandon: (h) => { const w = w3(h); if (w.pet) { delete w.pet; h.fireIf("UNIT_PET", "player"); h.fireIf("PET_BAR_HIDEGRID"); } },
  PetDismiss: (h) => PET_API.PetAbandon!(h, []),
  CheckPetUntrainerDist: (h) => w3(h).pet !== undefined,
  ConfirmPetUnlearn: (h) => { const p = w3(h).pet; if (p) { p.points[1] = 0; h.fireIf("UNIT_PET_TRAINING_POINTS", "pet"); } },
  SetPetStablePaperdoll: () => undefined,
};

const sp = (h: SimHost, i: unknown): Pet | undefined => w3(h).stable?.pets[(num(i) ?? 0) - 1];
const STABLE_COSTS = [50000, 100000, 200000, 400000];
export const STABLE_API: Record<string, Impl> = {
  GetNumStableSlots: (h) => w3(h).stable?.slots ?? 0,
  GetNumStablePets: (h) => w3(h).stable?.pets.length ?? 0,
  GetStablePetInfo: (h, a) => { const p = sp(h, a[0]); return p ? [p.icon, p.name, p.level, p.family, LOYAL[p.loyalty - 1]] : undefined; },
  GetStablePetFoodTypes: (h, a) => sp(h, a[0])?.food,
  GetSelectedStablePet: (h) => w3(h).stable?.sel ?? -1,
  ClickStablePet: (h, a) => { const s = w3(h).stable; if (s) { s.sel = num(a[0]) ?? -1; h.fireIf("PET_STABLE_UPDATE"); } },
  PickupStablePet: (h, a) => { const s = w3(h).stable; if (s && sp(h, a[0])) s.sel = num(a[0]) ?? -1; },
  StablePet: (h) => {
    const w = w3(h); const s = w.stable; if (!s || !w.pet) return;
    if (s.pets.length >= s.slots) { h.fireIf("UI_ERROR_MESSAGE", "Your stable is full"); return; }
    s.pets.push({ ...w.pet, stabled: true }); delete w.pet; h.fireIf("UNIT_PET", "player"); h.fireIf("PET_STABLE_UPDATE");
  },
  UnstablePet: (h, a) => {
    const w = w3(h); const s = w.stable; const k = (num(a[0]) ?? 0) - 1; if (!s || !s.pets[k]) return;
    if (w.pet) { const cur = w.pet; w.pet = { ...s.pets[k]!, stabled: false }; s.pets[k] = { ...cur, stabled: true }; } else { w.pet = { ...s.pets[k]!, stabled: false }; s.pets.splice(k, 1); }
    h.fireIf("UNIT_PET", "player"); h.fireIf("PET_STABLE_UPDATE");
  },
  GetNextStableSlotCost: (h) => { const s = w3(h).stable; return s ? STABLE_COSTS[Math.max(0, s.slots - 1)] : 0; },
  BuyStableSlot: (h) => {
    const s = w3(h).stable; if (!s) return; const c = STABLE_COSTS[Math.max(0, s.slots - 1)]; if (c === undefined || money(h) < c) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    h.inventory().money = money(h) - c; s.slots++; h.fireIf("PLAYER_MONEY"); h.fireIf("PET_STABLE_UPDATE");
  },
  ClosePetStables: (h) => { const w = w3(h); if (w.stable?.open) { w.stable.open = false; h.fireIf("PET_STABLE_CLOSED"); } },
};

// ===== [S3] Schlachtfeld · battlefield =====

const BG: Bf[] = [{ name: "Sample Gulch", min: 10, max: 19 }, { name: "Sample Basin", min: 20, max: 29 }, { name: "Sample Valley", min: 51, max: 60 }];
const q = (h: SimHost, i: unknown): Queue | undefined => w3(h).bf.queues[(num(i) ?? 0) - 1];
const fireStatus = (h: SimHost): void => { h.fireIf("UPDATE_BATTLEFIELD_STATUS"); };

export const BATTLEFIELD_API: Record<string, Impl> = {
  GetNumBattlefields: (h) => (w3(h).bf.open ? 1 : 0),
  GetBattlefieldInfo: (h) => { const b = w3(h).bf; const s = b.list[b.sel]; return b.open && s ? [s.name, `Battleground for levels ${s.min}-${s.max}.`, s.min, s.max, -1, 0, 0, 20, 29] : undefined; },
  GetBattlefieldInstanceInfo: (h, a) => (w3(h).bf.open && num(a[0]) === 1 ? 1 : undefined),
  GetSelectedBattlefield: (h) => w3(h).bf.sel + 1,
  SetSelectedBattlefield: (h, a) => { const b = w3(h).bf; b.sel = Math.max(0, (num(a[0]) ?? 1) - 1); },
  CanJoinBattlefieldAsGroup: (h) => h.unit("party1") !== undefined,
  ShowBattlefieldList: (h) => OPENERS_3.battlefield!(h),
  CloseBattlefield: (h) => { const b = w3(h).bf; if (b.open) { b.open = false; h.fireIf("BATTLEFIELDS_CLOSED"); } },
  JoinBattlefield: (h, a) => {
    const b = w3(h).bf; const s = b.list[(num(a[0]) ?? 1) - 1] ?? b.list[b.sel]; if (!s) return;
    const slot = b.queues.length; const item: Queue = { status: "queued", map: s.name, id: slot + 1, started: h.now };
    b.queues.push(item); fireStatus(h);
    h.later(5, () => { if (b.queues[slot] === item && item.status === "queued") { item.status = "confirm"; item.ends = h.now + 120; fireStatus(h); } });
  },
  LeaveBattlefield: (h) => { const b = w3(h).bf; for (const x of b.queues) if (x?.status === "active") { b.queues[b.queues.indexOf(x)] = undefined; fireStatus(h); } },
  AcceptBattlefieldPort: (h, a) => {
    const b = w3(h).bf; const x = q(h, a[0]); const k = (num(a[0]) ?? 0) - 1; if (!x) return;
    if (a[1] === true || a[1] === 1) { x.status = "active"; b.score = [{ name: h.scenario.player.name, kb: 0, hk: 0, deaths: 0, honor: 0, faction: 0, rank: 0, race: h.scenario.player.race, class: h.scenario.player.class }]; h.fireIf("UPDATE_BATTLEFIELD_SCORE"); }
    else b.queues[k] = undefined;
    fireStatus(h);
  },
  GetBattlefieldStatus: (h, a) => { const x = q(h, a[0]); return x ? [x.status, x.map, x.id, 1, 60, 0, false] : ["none", "Eastern Kingdoms", 0, 0, 0]; },
  GetBattlefieldEstimatedWaitTime: (h, a) => (q(h, a[0]) ? 60000 : 0),
  GetBattlefieldTimeWaited: (h, a) => { const x = q(h, a[0]); return x ? Math.round((h.now - x.started) * 1000) : 0; },
  GetBattlefieldPortExpiration: (h, a) => { const x = q(h, a[0]); return x?.ends ? Math.max(0, Math.round((x.ends - h.now) * 1000)) : 0; },
  GetBattlefieldInstanceRunTime: (h) => (w3(h).bf.queues.some((x) => x?.status === "active") ? Math.round(h.now * 1000) : 0),
  GetBattlefieldInstanceExpiration: () => 0,
  GetNumBattlefieldScores: (h) => w3(h).bf.score.length,
  GetBattlefieldScore: (h, a) => { const s = w3(h).bf.score[(num(a[0]) ?? 0) - 1]; return s ? [s.name, s.kb, s.hk, s.deaths, s.honor, s.faction, s.rank, s.race, s.class] : undefined; },
  RequestBattlefieldScoreData: (h) => { if (w3(h).bf.score.length) h.later(0.2, () => h.fireIf("UPDATE_BATTLEFIELD_SCORE")); },
  SetBattlefieldScoreFaction: (h, a) => { w3(h).bf.scoreFaction = num(a[0]) ?? -1; h.fireIf("UPDATE_BATTLEFIELD_SCORE"); },
  GetBattlefieldWinner: (h) => w3(h).bf.winner,
  GetNumBattlefieldStats: () => 0, GetBattlefieldStatInfo: () => undefined, GetBattlefieldStatData: () => undefined,
  GetNumBattlefieldPositions: () => 0, GetBattlefieldPosition: () => undefined, RequestBattlefieldPositions: () => undefined,
  GetNumBattlefieldFlagPositions: () => 0, GetBattlefieldFlagPosition: () => undefined,
  ToggleBattlefieldMinimap: () => undefined,
  GetWorldStateUIInfo: (h, a) => (w3(h).bf.queues.some((x) => x?.status === "active") && a[0] === 1 ? [1, 1, "Alliance: 0/5  Horde: 0/5", 1, 1, 0, 0, 0, 0] : a[0] === 1 ? [0, "Progress: 0", "", "", "", "", "CAPTUREPOINT", 0, 0, 0] : undefined), // probe: outside battlegrounds
  CheckSpiritHealerDist: (h) => w3(h).spirit !== undefined,
  GetAreaSpiritHealerTime: (h) => { const s = w3(h).spirit; return s ? Math.max(0, Math.round(s.ends - h.now)) : 0; },
  AcceptAreaSpiritHeal: () => undefined, CancelAreaSpiritHeal: (h) => { delete w3(h).spirit; },
};

export const PVP_API: Record<string, Impl> = {
  GetPVPLifetimeStats: () => [0, 0, 0], // probe: 3 values
  GetPVPSessionStats: () => [0, 0],
  GetPVPThisWeekStats: () => [0, 0],
  GetPVPLastWeekStats: () => [0, 0, 0, 0],
  GetPVPYesterdayStats: () => [0, 0, 0],
  // DE: Probe (Horde): GetPVPRankInfo(5) = "Scout " (mit Leerzeichen), 1. EN: probe (Horde): name with trailing space, rank number = input - 4.
  GetPVPRankInfo: (h, a) => {
    const r = (num(a[0]) ?? 0) - 4; if (r < 1 || r > 14) return undefined;
    const horde = ["Orc", "Troll", "Tauren", "Undead", "Scourge"].some((x) => h.scenario.player.race.includes(x));
    const names = horde
      ? ["Scout", "Grunt", "Sergeant", "Senior Sergeant", "First Sergeant", "Stone Guard", "Blood Guard", "Legionnaire", "Centurion", "Champion", "Lieutenant General", "General", "Warlord", "High Warlord"]
      : ["Private", "Corporal", "Sergeant", "Master Sergeant", "Sergeant Major", "Knight", "Knight-Lieutenant", "Knight-Captain", "Knight-Champion", "Lieutenant Commander", "Commander", "Marshal", "Field Marshal", "Grand Marshal"];
    return [`${names[r - 1]} `, r];
  },
  GetPVPRankProgress: () => 0,
  HasInspectHonorData: (h) => h.unit("target") !== undefined,
  RequestInspectHonorData: (h) => { if (h.unit("target")) h.later(0.3, () => h.fireIf("INSPECT_HONOR_UPDATE")); },
  GetInspectHonorData: () => [0, 0, 0, 0, 0, 0, 0, 0, 0],
  GetInspectPVPRankProgress: () => 0,
};

// ===== [S4] Petition, Gilde · petition =====

export const PETITION_API: Record<string, Impl> = {
  CanSignPetition: (h) => { const p = w3(h).petition; return !p || (!p.isOrigin && !p.names.includes(h.scenario.player.name)); },
  GetPetitionInfo: (h) => { const p = w3(h).petition; return p ? [p.type, p.title, p.body, p.max, p.origin, p.isOrigin, p.min] : [undefined, undefined, undefined, 0, undefined, undefined]; },
  GetNumPetitionNames: (h) => w3(h).petition?.names.length ?? 0,
  GetPetitionNameInfo: (h, a) => w3(h).petition?.names[(num(a[0]) ?? 0) - 1],
  OfferPetition: (h) => { if (w3(h).petition && h.unit("target")) h.note("info", `OfferPetition: offered to ${h.unit("target")!.name} (the answer is not simulated).`); },
  RenamePetition: (h, a) => { const p = w3(h).petition; if (p && str(a[0])) { p.title = str(a[0])!; h.fireIf("PETITION_SHOW"); } },
  SignPetition: (h) => { const p = w3(h).petition; if (p && !p.names.includes(h.scenario.player.name)) { p.names.push(h.scenario.player.name); h.fireIf("PETITION_CLOSED"); delete w3(h).petition; } },
  ClosePetition: (h) => { const w = w3(h); if (w.petition) { delete w.petition; h.fireIf("PETITION_CLOSED"); } },
  GetGuildCharterCost: () => 1000,
  BuyGuildCharter: (h, a) => {
    const w = w3(h); if (money(h) < 1000) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    h.inventory().money = money(h) - 1000; w.petition = { type: "guild", title: str(a[0]) ?? "Sample Guild", body: "", max: 9, min: 9, origin: h.scenario.player.name, isOrigin: true, names: [] };
    h.fireIf("PLAYER_MONEY"); h.fireIf("PETITION_SHOW");
  },
  TurnInGuildCharter: (h) => { const p = w3(h).petition; if (p && p.names.length >= p.min) { h.note("info", `TurnInGuildCharter: guild "${p.title}" would be created (not simulated).`); delete w3(h).petition; } else h.fireIf("UI_ERROR_MESSAGE", "You need more signatures"); },
  CloseGuildRegistrar: (h) => { const w = w3(h); if (w.charterOpen) { w.charterOpen = false; h.fireIf("CLOSE_GUILD_REGISTRAR"); } },
  AcceptGuild: (h) => { const w = w3(h); if (w.invited) { h.note("info", `AcceptGuild: joined "${w.invited}" (not simulated).`); delete w.invited; } },
  DeclineGuild: (h) => { delete w3(h).invited; },
  GetTabardCreationCost: () => 100000,
  GetTabardInfo: () => [],
  CloseTabardCreation: (h) => { const w = w3(h); if (w.tabard) { w.tabard = false; h.fireIf("CLOSE_TABARD_FRAME"); } },
};

const gnote = (what: string): Impl => (h, a) => { h.note("info", `${what}(${a.filter((x) => x !== undefined).map(String).join(", ")}): sent to the server (not simulated).`); h.fireIf("GUILD_ROSTER_UPDATE"); };
export const GUILDADMIN_API: Record<string, Impl> = {
  GuildInviteByName: (h, a) => { h.note("info", `GuildInviteByName(${String(a[0])}): sent to the server (not simulated).`); h.fire("CHAT_MSG_SYSTEM", `${String(a[0])} has been invited to the guild.`, "", "", ""); },
  GuildUninviteByName: gnote("GuildUninviteByName"), GuildPromoteByName: gnote("GuildPromoteByName"), GuildDemoteByName: gnote("GuildDemoteByName"),
  GuildSetLeaderByName: gnote("GuildSetLeaderByName"), GuildLeave: gnote("GuildLeave"), GuildDisband: gnote("GuildDisband"),
  GuildRosterSetPublicNote: gnote("GuildRosterSetPublicNote"), GuildRosterSetOfficerNote: gnote("GuildRosterSetOfficerNote"),
  GuildControlAddRank: gnote("GuildControlAddRank"), GuildControlDelRank: gnote("GuildControlDelRank"), GuildControlSaveRank: gnote("GuildControlSaveRank"),
  GuildControlSetRank: gnote("GuildControlSetRank"), GuildControlSetRankFlag: gnote("GuildControlSetRankFlag"),
  GuildControlGetRankFlags: () => [false, false, false, false, false, false, false, false, false, false, false, false],
  GuildInfo: (h) => { h.fire("CHAT_MSG_SYSTEM", "You are not in a guild.", "", "", ""); },
};

// ===== [S5] Instanzen · instances =====

export const INSTANCE_API: Record<string, Impl> = {
  GetNumSavedInstances: (h) => w3(h).saved.length,
  GetSavedInstanceInfo: (h, a) => { const s = w3(h).saved[(num(a[0]) ?? 0) - 1]; return s ? [s.name, s.id, s.remaining] : [undefined, 0, undefined]; }, // probe
  GetInstanceBootTimeRemaining: () => 0,
  CanShowResetInstances: (h) => h.unit("party1") === undefined && w3(h).saved.length > 0,
  ResetInstances: (h) => { const w = w3(h); if (w.saved.length) { w.saved = []; h.fire("CHAT_MSG_SYSTEM", "All instances have been reset.", "", "", ""); h.fireIf("UPDATE_INSTANCE_INFO"); } },
};

// ===== [S6] OPENERS_3 =====

export const OPENERS_3: Record<string, (h: SimHost) => void> = {
  stable: (h) => {
    const w = w3(h);
    w.pet ??= { name: "Samplewolf", level: 5, family: "Wolf", icon: "Interface\\Icons\\Ability_Hunter_Pet_Wolf", happiness: 3, loyalty: 3, xp: 120, xpMax: 400, points: [4, 1], food: ["Meat", "Fish"], autocast: {} };
    w.stable = { pets: [{ name: "Samplecat", level: 3, family: "Cat", icon: "Interface\\Icons\\Ability_Hunter_Pet_Cat", happiness: 2, loyalty: 2, xp: 10, xpMax: 200, points: [2, 0], food: ["Meat", "Fish"], autocast: {}, stabled: true }], slots: 2, sel: -1, open: true };
    h.fireIf("PET_STABLE_SHOW"); h.fireIf("PET_STABLE_UPDATE");
  },
  pet: (h) => { w3(h).pet ??= { name: "Samplewolf", level: 5, family: "Wolf", icon: "Interface\\Icons\\Ability_Hunter_Pet_Wolf", happiness: 3, loyalty: 3, xp: 120, xpMax: 400, points: [4, 1], food: ["Meat", "Fish"], autocast: {} }; h.fireIf("UNIT_PET", "player"); h.fireIf("PET_BAR_UPDATE"); },
  battlefield: (h) => { const b = w3(h).bf; b.open = true; b.list = BG; h.fireIf("BATTLEFIELDS_SHOW"); },
  charter: (h) => { w3(h).charterOpen = true; h.fireIf("PETITION_SHOW"); },
  petition: (h) => { w3(h).petition = { type: "guild", title: "Sample Guild", body: "", max: 9, min: 9, origin: "Sampleleader", isOrigin: false, names: ["Sampleleader"] }; h.fireIf("PETITION_SHOW"); },
  tabard: (h) => { w3(h).tabard = true; h.fireIf("OPEN_TABARD_FRAME"); },
  guildinvite: (h) => { w3(h).invited = "Sample Guild"; h.fireIf("GUILD_INVITE_REQUEST", "Sampleleader", "Sample Guild"); },
  spirit: (h) => { w3(h).spirit = { ends: h.now + 30 }; },
};
