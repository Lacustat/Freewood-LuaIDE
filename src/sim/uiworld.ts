/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Zustand · state ......... Aktionsleiste, Tasten, Ton, Taxi, Talente, Status
 *   [S2] WORLD_API ............... Zonen, Zeit, Client, Status des Spielers
 *   [S3] INPUT_API ............... Tasten, Maus, Klick-Modifikatoren, Belegungen
 *   [S4] SOUND_API ............... PlaySound*, C_Sound
 *   [S5] TARGET_API .............. Zielwahl, Fokus, Angriff, Folgen
 *   [S6] BAR_API ................. Aktionsleiste
 *   [S7] QUEST_API ............... Questlog-Aktionen und Beobachtung
 *   [S8] TAXI_API ................ Flugmeister (Vanilla) und C_TaxiMap-Rest
 *   [S9] TALENT_API .............. Talente, Fertigkeiten, Verfolgung
 *
 * DE: Beispieldaten und vereinfachte Regeln; was nicht aus dem Spiel stammt, ist als Beispiel markiert und
 *     die Rückgabeformate sind bis zum Test im Spiel `unverified`.
 * EN: sample data and simplified rules; what does not come from the game is marked as a sample and the
 *     return formats are `unverified` until tested in game.
 */
import type { UnitData } from "./scenario.js";
import { type Impl, type SimHost, num, str } from "./host.js";
import { AREA_NAMES, TAXI_NODES, TAXI_PATHS, zoneOf } from "./map.js";
import { castSpell, cooldownOf, resolveSpell } from "./spells.js";
import { allUnits, factionOf } from "./unitinfo.js";

// ===== [S1] Zustand · state =====

type Slot = { type: "spell"; id: number } | { type: "item"; id: number } | { type: "macro"; index: number };
interface Ui {
  bar: Record<number, Slot>; page: number; toggles: [boolean, boolean, boolean, boolean];
  recent: string[]; muted: Set<string>; playing: Map<number, number>; nextHandle: number; music?: string;
  lastTarget?: string; attacking: boolean; combo: number;
  taxiOpen: boolean; onTaxi: boolean; currentNode?: number; taxiMap?: number;
  mounted: boolean; resting: boolean; swimming: boolean; indoors: boolean; falling: boolean; sheath: number; loggingOut: boolean;
  selQuest: number; watch: number[]; abandon?: number;
  talents: number[][]; tracking: number; rng: number;
  modClick: Record<string, string>; lastButton: string;
  skillSel: number;
  known: UnitData[];
}
const ui = (h: SimHost): Ui => h.store("ui", (): Ui => ({
  bar: { 1: { type: "spell", id: 6603 }, 2: { type: "spell", id: 78 }, 3: { type: "spell", id: 6673 }, 12: { type: "item", id: 6125 } },
  page: 1, toggles: [false, false, false, false],
  recent: [], muted: new Set(), playing: new Map(), nextHandle: 1,
  attacking: false, combo: 0, taxiOpen: false, onTaxi: false,
  mounted: false, resting: false, swimming: false, indoors: false, falling: false, sheath: 1, loggingOut: false,
  selQuest: 0, watch: [], talents: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], tracking: 0, rng: 12345,
  modClick: { CHATLINK: "SHIFT", DRESSUP: "CTRL", SPLITSTACK: "SHIFT", SELFCAST: "ALT", PICKUPACTION: "SHIFT", AUTOLOOTTOGGLE: "NONE", QUESTWATCHTOGGLE: "SHIFT", TOKENWATCHTOGGLE: "SHIFT", COMPAREITEMS: "SHIFT", OPENALLBAGS: "SHIFT", FOCUSCAST: "NONE" },
  lastButton: "LeftButton", skillSel: 0, known: h.scenario.target ? [h.scenario.target] : [],
}));
const keys = (h: SimHost): Record<string, boolean> => h.store("keys", () => ({} as Record<string, boolean>));
const rnd = (u: Ui): number => { u.rng = (Math.imul(u.rng, 1103515245) + 12345) >>> 0; return u.rng / 4294967296; };

// ===== [S2] WORLD_API =====

const here = (h: SimHost) => { const p = h.scenario.player; return p.x !== undefined && p.y !== undefined ? zoneOf(0, p.x, p.y) ?? zoneOf(1, p.x, p.y) : undefined; };
const zoneName = (h: SimHost): string => h.scenario.player.zone ?? here(h)?.name ?? "";
const SUB: Record<string, string> = { "Elwynn Forest": "Goldshire" };
const subZone = (h: SimHost): string => (h.scenario.player as { subZone?: string }).subZone ?? "";
const CITIES = new Set(["Stormwind City", "Ironforge", "Orgrimmar", "Undercity", "Thunder Bluff"]);
const clock = (h: SimHost) => { const d = new Date(h.serverEpoch() * 1000); return [d.getUTCHours(), d.getUTCMinutes()]; };

// DE: Format nach Probe: "1 Hr 2 Mins " (Sekunden entfallen ab einer Stunde, Leerzeichen am Ende); `unverified` für Tage.
// EN: format per probe: "1 Hr 2 Mins " (seconds dropped from one hour on, trailing space); `unverified` for days.
function secondsToTime(sec: number, noSeconds: boolean): string {
  const s = Math.floor(sec); const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  let out = "";
  if (d) out += `${d} ${d > 1 ? "Days" : "Day"} `;
  if (hr) out += `${hr} Hr `;
  if (m) out += `${m} ${m > 1 ? "Mins" : "Min"} `;
  if (r && !noSeconds && !hr && !d) out += `${r} Sec `;
  return out;
}

// DE: Kalimdor-Liste aus der OctoWoW-Probe; Östliche Königreiche aus dem Gedächtnis (`unverified`).
// EN: Kalimdor list from the OctoWoW probe; Eastern Kingdoms from memory (`unverified`).
const CONTINENTS = ["Kalimdor", "Eastern Kingdoms"];
const ZONES: string[][] = [
  ["Ashenvale", "Azshara", "Blackstone Island", "Caverns of Time", "Darkshore", "Darnassus", "Desolace", "Dire Maul", "Durotar", "Dustwallow Marsh", "Felwood", "Feralas", "GM Island", "Gates of Ahn'Qiraj", "Hyjal", "Icepoint Rock", "Maraudon", "Moonglade", "Moonwhisper Coast", "Mulgore", "Orgrimmar", "Silithus", "Stonetalon Mountains", "Tanaris", "Tel'Abim", "Teldrassil", "The Barrens", "Thousand Needles", "Thunder Bluff", "Timbermaw Hold"],
  ["Alterac Mountains", "Arathi Highlands", "Badlands", "Blasted Lands", "Burning Steppes", "Deadwind Pass", "Dun Morogh", "Duskwood", "Eastern Plaguelands", "Elwynn Forest", "Hillsbrad Foothills", "Ironforge", "Loch Modan", "Redridge Mountains", "Searing Gorge", "Silverpine Forest", "Stormwind City", "Stranglethorn Vale", "Swamp of Sorrows", "The Hinterlands", "Tirisfal Glades", "Undercity", "Western Plaguelands", "Westfall", "Wetlands"],
];
const contOf = (h: SimHost): number => ((here(h)?.continent ?? 0) === 1 ? 1 : 2);
const zoneIdx = (h: SimHost): number => ZONES[contOf(h) - 1]!.indexOf(zoneName(h)) + 1;

export const WORLD_API: Record<string, Impl> = {
  GetMapContinents: () => CONTINENTS,
  GetMapZones: (_h, a) => ZONES[(num(a[0]) ?? 0) - 1] ?? [],
  GetCurrentMapContinent: (h) => contOf(h),
  GetCurrentMapZone: (h) => zoneIdx(h),
  SetMapToCurrentZone: () => undefined,
  SetMapZoom: () => undefined,
  GetMapInfo: (h) => [zoneName(h).replace(/ /g, ""), 668, 768],
  GetZoneText: (h) => zoneName(h),
  GetRealZoneText: (h) => zoneName(h),
  GetSubZoneText: (h) => subZone(h) || (SUB[zoneName(h)] ?? ""),
  GetMinimapZoneText: (h) => subZone(h) || zoneName(h),
  GetZonePVPInfo: (h) => (CITIES.has(zoneName(h)) ? ["friendly", factionOf(h.scenario.player)] : ["friendly", factionOf(h.scenario.player)]), // probe: Durotar = friendly, Horde
  GetBindLocation: () => "Stormwind City",
  GetGameTime: (h) => clock(h),
  GetFramerate: () => 60,
  GetNetStats: () => [0.5, 0.2, 45],
  GetBuildInfo: (h) => (h.target.luaVersion === "5.0" ? ["1.12.1", "5875", "Sep 19 2006", 11200] : ["1.12.1", "5875", "Sep 19 2006", 11200]),
  GetScreenWidth: () => 1024,
  GetScreenHeight: () => 768,
  GetPhysicalScreenSize: () => [1024, 768],
  GetTickTime: () => 0.016,
  GetText: (_h, a) => (typeof a[0] === "string" ? a[0] : undefined),
  SecondsToTime: (_h, a) => secondsToTime(num(a[0]) ?? 0, a[1] === true || a[1] === 1),
  RequestTimePlayed: (h) => { h.later(0.2, () => { h.fireIf("TIME_PLAYED_MSG", Math.floor(h.now) + 86400, Math.floor(h.now) + 3600); h.fire("CHAT_MSG_SYSTEM", "Death counter: 0 | Quests completed: 0", "", "", ""); }); }, // probe: OctoWoW adds a system line
  IsLinuxClient: () => false, IsMacClient: () => false, IsWindowsClient: () => true,
  IsLoggedIn: () => true, IsPlayerInWorld: () => true, InCinematic: () => false, OpeningCinematic: () => undefined, StopCinematic: () => undefined,
  IsLoggingOut: (h) => ui(h).loggingOut,
  Logout: (h) => { ui(h).loggingOut = true; h.note("info", "Logout started (20 seconds in the game; here you can cancel with CancelLogout)."); },
  CancelLogout: (h) => { ui(h).loggingOut = false; },
  Quit: (h) => { h.note("info", "Quit() called; the simulation keeps running."); },
  ForceQuit: (h) => { h.note("info", "ForceQuit() called; the simulation keeps running."); },
  ReloadUI: (h) => { h.note("warn", "ReloadUI() is not performed in the simulation; use the reload button of the IDE."); },
  message: (h, a) => { h.note("warn", `Message box: ${String(a[0])}`); },
  IsMounted: (h) => ui(h).mounted,
  Dismount: (h) => { const u = ui(h); if (u.mounted) { u.mounted = false; h.fireIf("PLAYER_AURAS_CHANGED"); h.fireIf("UNIT_AURA", "player"); } },
  IsResting: (h) => ui(h).resting,
  GetRestState: (h) => (ui(h).resting ? 1 : 2),
  IsSwimming: (h) => ui(h).swimming,
  IsIndoors: (h) => ui(h).indoors,
  IsOutdoors: (h) => !ui(h).indoors,
  IsFalling: (h) => ui(h).falling,
  IsStealthed: (h) => h.scenario.player.auras?.some((x) => x.helpful && [1784, 5215, 1787].includes(x.spellId)) === true,
  IsAssistingRitual: () => false,
  GetPlayerFacing: () => 0,
  GetSheathState: (h) => ui(h).sheath,
  ToggleSheath: (h) => { const u = ui(h); u.sheath = u.sheath === 1 ? 2 : 1; },
  SitOrStand: (h) => { const p = h.scenario.player; p.standState = p.standState === 1 ? 0 : 1; h.fireIf("PLAYER_AURAS_CHANGED"); },
  GetComboPoints: (h) => ui(h).combo,
  HasFullControl: (h) => !ui(h).onTaxi,
  GetMirrorTimerInfo: () => ["UNKNOWN", 0, 0, 0, 0, undefined],
  GetMirrorTimerProgress: () => 0,
  RandomRoll: (h, a) => {
    const lo = num(a[0]) ?? 1, hi = num(a[1]) ?? 100; const r = lo + Math.floor(rnd(ui(h)) * (hi - lo + 1));
    h.fireIf("CHAT_MSG_SYSTEM", `${h.scenario.player.name} rolls ${r} (${lo}-${hi})`);
  },
  DoEmote: (h, a) => { h.note("info", `Emote: ${String(a[0])}`); h.fireIf("CHAT_MSG_TEXT_EMOTE", `${h.scenario.player.name} ${String(a[0]).toLowerCase()}s.`, h.scenario.player.name); },
  GetDefaultLanguage: (h) => (factionOf(h.scenario.player) === "Horde" ? "Orcish" : "Common"),
  GetLanguageByIndex: (h, a) => (num(a[0]) === 1 ? (factionOf(h.scenario.player) === "Horde" ? "Orcish" : "Common") : undefined),
  GetNumLanguages: () => 1,
  IsInInstance: () => [false, "none"],
  GetInstanceInfo: (h) => [zoneName(h), "none", 0, "", 0, 0, false, undefined],
  ToggleCharacter: () => undefined, ToggleGameMenu: () => undefined, ToggleHelpFrame: () => undefined, ToggleTalentFrame: () => undefined, ToggleKeyRing: () => undefined,
  ToggleFramerate: () => undefined, TogglePerformanceDisplay: () => undefined, ToggleMinimap: () => undefined, ToggleWorldMap: () => undefined,
  ShowHelm: () => undefined, ShowCloak: () => undefined, ShowingHelm: () => true, ShowingCloak: () => true,
  GetAreaText: (_h, a) => AREA_NAMES[num(a[0]) ?? 0],
};

// ===== [S3] INPUT_API =====

const mod = (h: SimHost, n: string): boolean => keys(h)["L" + n] === true || keys(h)["R" + n] === true;

export const INPUT_API: Record<string, Impl> = {
  IsShiftKeyDown: (h) => mod(h, "SHIFT"), IsControlKeyDown: (h) => mod(h, "CTRL"), IsAltKeyDown: (h) => mod(h, "ALT"),
  IsLeftShiftKeyDown: (h) => keys(h).LSHIFT === true, IsRightShiftKeyDown: (h) => keys(h).RSHIFT === true,
  IsLeftControlKeyDown: (h) => keys(h).LCTRL === true, IsRightControlKeyDown: (h) => keys(h).RCTRL === true,
  IsLeftAltKeyDown: (h) => keys(h).LALT === true, IsRightAltKeyDown: (h) => keys(h).RALT === true,
  IsModifierKeyDown: (h) => mod(h, "SHIFT") || mod(h, "CTRL") || mod(h, "ALT"),
  IsMouseButtonDown: (h, a) => keys(h)[String(a[0] ?? "LeftButton")] === true,
  GetMouseButtonClicked: (h) => ui(h).lastButton,
  GetMouseButtonName: (_h, a) => (typeof a[0] === "string" ? a[0] : ["LeftButton", "RightButton", "MiddleButton", "Button4", "Button5"][(num(a[0]) ?? 1) - 1]),
  GetModifiedClick: (h, a) => ui(h).modClick[String(a[0])] ?? "NONE",
  SetModifiedClick: (h, a) => { ui(h).modClick[String(a[0])] = str(a[1]) ?? "NONE"; },
  GetNumModifiedClickActions: (h) => Object.keys(ui(h).modClick).length,
  GetModifiedClickAction: (h, a) => Object.keys(ui(h).modClick)[(num(a[0]) ?? 0) - 1],
  IsModifiedClick: (h, a) => {
    const m = ui(h).modClick[String(a[0])]; if (!m || m === "NONE") return false;
    const want = { SHIFT: mod(h, "SHIFT"), CTRL: mod(h, "CTRL"), ALT: mod(h, "ALT") };
    const parts = m.split("-");
    return (["SHIFT", "CTRL", "ALT"] as const).every((k) => want[k] === parts.includes(k)) && parts.some((p) => p in want);
  },
  GetMouseFocus: () => undefined,
  MouseIsOver: () => false,
  SetBinding: (h, a) => { const c = h.character(); c.bindings ??= {}; const k = String(a[0]).toUpperCase(); if (a[1] === undefined) delete c.bindings[k]; else c.bindings[k] = String(a[1]); h.fireIf("UPDATE_BINDINGS"); return true; },
  SetBindingClick: (h, a) => INPUT_API.SetBinding!(h, [a[0], `CLICK ${String(a[1])}:${String(a[2] ?? "LeftButton")}`]),
  SetBindingSpell: (h, a) => INPUT_API.SetBinding!(h, [a[0], `SPELL ${String(a[1])}`]),
  SetBindingItem: (h, a) => INPUT_API.SetBinding!(h, [a[0], `ITEM ${String(a[1])}`]),
  SetBindingMacro: (h, a) => INPUT_API.SetBinding!(h, [a[0], `MACRO ${String(a[1])}`]),
  SaveBindings: () => undefined, LoadBindings: () => undefined,
  GetCurrentBindingSet: () => 1,
  GetBindingText: (_h, a) => { const k = String(a[0] ?? ""); return a[2] ? k.replace("SHIFT-", "S-").replace("CTRL-", "C-").replace("ALT-", "A-") : k; },
  SetOverrideBinding: () => undefined, SetOverrideBindingClick: () => undefined, SetOverrideBindingSpell: () => undefined, SetOverrideBindingItem: () => undefined, SetOverrideBindingMacro: () => undefined, ClearOverrideBindings: () => undefined,
  RunBinding: (h, a) => { h.note("info", `RunBinding(${String(a[0])}): the bound command is not executed in the simulation.`); },
};

// ===== [S4] SOUND_API =====

function play(h: SimHost, what: string): number {
  const u = ui(h); u.recent.unshift(what); if (u.recent.length > 20) u.recent.pop();
  const hd = u.nextHandle++; u.playing.set(hd, h.now + 1);
  if (u.muted.has(what.toLowerCase())) return 0;
  h.note("info", `Sound: ${what}`); return hd;
}

export const SOUND_API: Record<string, Impl> = {
  PlaySound: (h, a) => { play(h, String(a[0])); },
  PlaySoundFile: (h, a) => { const hd = play(h, String(a[0])); return hd ? [true, hd] : [false, undefined]; },
  PlayMusic: (h, a) => { ui(h).music = String(a[0]); h.note("info", `Music: ${String(a[0])}`); },
  StopMusic: (h) => { ui(h).music = undefined; },
  MuteSoundFile: (h, a) => { ui(h).muted.add(String(a[0]).toLowerCase()); },
  UnmuteSoundFile: (h, a) => { ui(h).muted.delete(String(a[0]).toLowerCase()); },
  StopSound: (h, a) => { ui(h).playing.delete(num(a[0]) ?? -1); },
  "C_Sound.PlaySound": (h, a) => { const hd = play(h, `kit ${String(a[0])}`); return [hd > 0, hd > 0 ? hd : undefined]; },
  "C_Sound.PlaySoundWithOptions": (h, a) => { const p = a[0] as { soundKitID?: number; file?: string } | undefined; const hd = play(h, p?.file ?? `kit ${String(p?.soundKitID)}`); return [hd > 0, hd > 0 ? hd : undefined]; },
  "C_Sound.PlayItemSound": (h, a) => { play(h, `item ${String(a[0])} ${String(a[1])}`); },
  "C_Sound.PlayVocalErrorSound": (h, a) => { play(h, `vocal error ${String(a[0])}`); },
  "C_Sound.IsPlaying": (h, a) => { const t = ui(h).playing.get(num(a[0]) ?? -1); return t !== undefined && t > h.now; },
  "C_Sound.GetSoundScaledVolume": (h, a) => (ui(h).playing.has(num(a[0]) ?? -1) ? 1 : 0),
  "C_Sound.GetRecentSoundFiles": (h) => [ui(h).recent.slice()],
};

// ===== [S5] TARGET_API =====

const hostile = (h: SimHost, u: { friendly?: boolean; health: number; dead?: boolean }): boolean => u.friendly === false && u.health > 0 && u.dead !== true;
function setTarget(h: SimHost, u: ReturnType<SimHost["unit"]>): void {
  const cur = h.scenario.target; if (cur) ui(h).lastTarget = cur.name;
  if (u && !ui(h).known.includes(u)) ui(h).known.push(u);
  if (cur === u) return;
  h.setTarget(u);
}
function worldUnits(h: SimHost): [string, UnitData][] {
  const out = allUnits(h); const seen = new Set(out.map(([, u]) => u));
  for (const u of [...ui(h).known, ...(h.scenario.nearby ?? [])]) if (!seen.has(u)) { seen.add(u); out.push(["npc", u]); }
  return out;
}
function byName(h: SimHost, name: string, exact: boolean) {
  const n = name.toLowerCase();
  return worldUnits(h).find(([t, u]) => t !== "mouseover" && t !== "focus" && (exact ? u.name.toLowerCase() === n : u.name.toLowerCase().startsWith(n)));
}
function dist(h: SimHost, u: { x?: number; y?: number; z?: number }): number | undefined {
  const p = h.scenario.player; if (u.x === undefined || u.y === undefined || p.x === undefined || p.y === undefined) return undefined;
  return Math.hypot(u.x - p.x, u.y - p.y, (u.z ?? 0) - (p.z ?? 0));
}

export const TARGET_API: Record<string, Impl> = {
  TargetUnit: (h, a) => { const u = h.unit(a[0]); if (u) setTarget(h, u); else h.fire("UI_ERROR_MESSAGE", "No target"); },
  TargetByName: (h, a) => { const r = byName(h, String(a[0]), a[1] === true || a[1] === 1); if (r) setTarget(h, r[1]); else h.fire("UI_ERROR_MESSAGE", "No target"); },
  ClearTarget: (h) => { if (h.scenario.target) { ui(h).lastTarget = h.scenario.target.name; h.setTarget(undefined); } },
  TargetLastTarget: (h) => { const n = ui(h).lastTarget; const r = n ? byName(h, n, true) : undefined; if (r) setTarget(h, r[1]); },
  TargetLastEnemy: (h) => TARGET_API.TargetLastTarget!(h, []),
  TargetNearestEnemy: (h) => { const t = worldUnits(h).map(([, u]) => u).filter((u) => u !== h.scenario.player && hostile(h, u)).sort((x, y) => (dist(h, x) ?? 1e9) - (dist(h, y) ?? 1e9))[0]; if (t) setTarget(h, t); },
  TargetNearestEnemyPlayer: (h) => { const t = worldUnits(h).map(([, u]) => u).find((u) => u.isPlayer && hostile(h, u)); if (t) setTarget(h, t); },
  TargetNearestFriend: (h) => { const t = worldUnits(h).map(([, u]) => u).filter((u) => u !== h.scenario.player && u.friendly !== false && u.health > 0).sort((x, y) => (dist(h, x) ?? 1e9) - (dist(h, y) ?? 1e9))[0]; if (t) setTarget(h, t); },
  TargetNearestFriendPlayer: (h) => TARGET_API.TargetNearestFriend!(h, []),
  TargetNearestPartyMember: (h) => { const t = h.scenario.party[0]; if (t) setTarget(h, t); },
  TargetNearestRaidMember: (h) => TARGET_API.TargetNearestPartyMember!(h, []),
  TargetNearest: (h) => TARGET_API.TargetNearestEnemy!(h, []),
  AssistUnit: (h, a) => { const u = h.unit(a[0]); if (u && u === h.scenario.party[0]) h.note("info", `AssistUnit(${String(a[0])}): units have no targets of their own in the simulation.`); },
  AssistByName: (h, a) => { h.note("info", `AssistByName(${String(a[0])}): units have no targets of their own in the simulation.`); },
  FocusUnit: (h, a) => { const u = h.unit(a[0]); if (u) { h.scenario.focus = u; h.fireIf("PLAYER_FOCUS_CHANGED"); } },
  ClearFocus: (h) => { if (h.scenario.focus) { h.scenario.focus = undefined; h.fireIf("PLAYER_FOCUS_CHANGED"); } },
  StartAttack: (h) => { const u = ui(h); const t = h.scenario.target; if (!t || !hostile(h, t)) { h.fire("UI_ERROR_MESSAGE", "You have no target"); return; } if (!u.attacking) { u.attacking = true; h.scenario.inCombat = true; h.fireIf("PLAYER_ENTER_COMBAT"); h.fireIf("PLAYER_REGEN_DISABLED"); } },
  AttackTarget: (h, a) => TARGET_API.StartAttack!(h, a),
  StopAttack: (h) => { const u = ui(h); if (u.attacking) { u.attacking = false; h.fireIf("PLAYER_LEAVE_COMBAT"); } },
  PetAttack: (h) => { h.note("info", "PetAttack(): the pet's attack is not simulated."); },
  PetStopAttack: () => undefined, PetFollow: () => undefined, PetWait: () => undefined, PetPassiveMode: () => undefined, PetDefensiveMode: () => undefined, PetAggressiveMode: () => undefined,
  FollowUnit: (h, a) => { if (h.unit(a[0])) h.fireIf("AUTOFOLLOW_BEGIN", h.unit(a[0])!.name); },
  FollowByName: (h, a) => { const r = byName(h, String(a[0]), a[1] === true); if (r) h.fireIf("AUTOFOLLOW_BEGIN", r[1].name); },
  InteractUnit: (h, a) => { h.note("info", `InteractUnit(${String(a[0])}): interaction windows are opened by the host (see Interaction in the IDE).`); },
  CheckInteractDistance: (h, a) => { const u = h.unit(a[0]); const d = u ? dist(h, u) : undefined; if (d === undefined) return false; const lim = { 1: 28, 2: 11.11, 3: 9.9, 4: 28 }[num(a[1]) ?? 4] ?? 28; return d <= lim; },
  IsTargetLoose: () => false,
  ClosestUnitPosition: () => undefined,
  ClosestGameObjectPosition: () => undefined,
};

// ===== [S6] BAR_API =====

const slotOf = (h: SimHost, n: unknown): Slot | undefined => { const k = num(n); return k === undefined ? undefined : ui(h).bar[k]; };
const spellOf = (h: SimHost, s: Slot | undefined) => (s?.type === "spell" ? resolveSpell(h, s.id) : undefined);

export const BAR_API: Record<string, Impl> = {
  HasAction: (h, a) => slotOf(h, a[0]) !== undefined,
  GetActionTexture: (h, a) => { const s = slotOf(h, a[0]); if (!s) return undefined; if (s.type === "spell") return spellOf(h, s)?.sp.icon; if (s.type === "item") return h.inventory().items[String(s.id)]?.icon; return h.character().macros?.[s.index - 1]?.icon; },
  GetActionText: (h, a) => { const s = slotOf(h, a[0]); if (!s) return undefined; return [s.type === "macro" ? h.character().macros?.[s.index - 1]?.name : undefined, s.type.toUpperCase(), s.type === "macro" ? s.index : s.id]; }, // probe: OctoWoW also returns type and id
  GetActionCount: (h, a) => { const s = slotOf(h, a[0]); if (s?.type !== "item") return 0; let n = 0; for (const b of Object.values(h.inventory().bags)) for (const sl of Object.values(b.slots)) if (sl && sl.id === s.id) n += sl.count; return n; },
  GetActionCooldown: (h, a) => { const r = spellOf(h, slotOf(h, a[0])); if (!r) return [0, 0, 1]; const c = cooldownOf(h, r.id, r.sp); return [c.start, c.duration, 1]; },
  IsUsableAction: (h, a) => { const s = slotOf(h, a[0]); if (!s) return [false, false]; const r = spellOf(h, s); return r ? [cooldownOf(h, r.id, r.sp).duration === 0, false] : [true, false]; },
  IsCurrentAction: (h, a) => { const s = slotOf(h, a[0]); return s?.type === "spell" && s.id === 6603 && ui(h).attacking; },
  IsAttackAction: (h, a) => { const s = slotOf(h, a[0]); return s?.type === "spell" && s.id === 6603; },
  IsAutoRepeatAction: () => false,
  IsConsumableAction: (h, a) => { const s = slotOf(h, a[0]); return s?.type === "item"; },
  IsEquippedAction: () => false,
  IsItemAction: (h, a) => slotOf(h, a[0])?.type === "item",
  ActionHasRange: (h, a) => spellOf(h, slotOf(h, a[0])) !== undefined,
  IsActionInRange: (h, a) => { const r = spellOf(h, slotOf(h, a[0])); if (!r) return undefined; const t = h.scenario.target; const d = t ? dist(h, t) : undefined; return d === undefined ? undefined : d <= (r.sp.maxRange ?? 5) ? 1 : 0; },
  GetActionInfo: (h, a) => { const s = slotOf(h, a[0]); return s ? (s.type === "macro" ? ["macro", s.index, ""] : [s.type, s.id, ""]) : undefined; },
  UseAction: (h, a) => {
    const s = slotOf(h, a[0]); if (!s) return;
    if (s.type === "spell") { const r = resolveSpell(h, s.id, true); if (r) castSpell(h, r); }
    else if (s.type === "item") { h.note("info", `UseAction: item ${s.id} (use it from the bag with UseContainerItem to apply its effect).`); }
    else h.note("info", `UseAction: macro ${s.index} is not run by the simulation.`);
  },
  PickupAction: (h, a) => { h.note("info", `PickupAction(${String(a[0])}): the cursor is only simulated for items.`); },
  PlaceAction: (h, a) => { h.note("info", `PlaceAction(${String(a[0])}): the cursor is only simulated for items.`); },
  PickupPetAction: () => undefined, PetHasActionBar: () => false, HasPetUI: () => false, HasPetSpells: () => undefined,
  ChangeActionBarPage: (h, a) => { ui(h).page = num(a[0]) ?? 1; h.fireIf("ACTIONBAR_PAGE_CHANGED"); },
  GetBonusBarOffset: (h) => { const f = h.store("spells", () => ({ form: 0 })) as { form: number }; return f.form ?? 0; },
  HasBonusActionBar: (h) => BAR_API.GetBonusBarOffset!(h, []) !== 0,
  GetActionBarToggles: (h) => ui(h).toggles,
  SetActionBarToggles: (h, a) => { const t = ui(h); t.toggles = [a[0] === true || a[0] === 1, a[1] === true || a[1] === 1, a[2] === true || a[2] === 1, a[3] === true || a[3] === 1]; h.fireIf("ACTIONBAR_SHOWGRID"); },
  ActionButtonDown: () => undefined, ActionButtonUp: () => undefined, BonusActionButtonDown: () => undefined, BonusActionButtonUp: () => undefined,
  "C_ActionBar.ShouldShowKeyring": () => true,
};

// ===== [S7] QUEST_API =====

const logQuests = (h: SimHost) => h.character().quests.filter((q) => q.header === undefined);
const qAt = (h: SimHost, i: unknown) => { const q = h.character().quests[(num(i) ?? 0) - 1]; return q && q.header === undefined ? q : undefined; };

export const QUEST_API: Record<string, Impl> = {
  SelectQuestLogEntry: (h, a) => { ui(h).selQuest = num(a[0]) ?? 0; h.fireIf("QUEST_LOG_UPDATE"); },
  GetQuestLogSelection: (h) => ui(h).selQuest,
  SetAbandonQuest: (h) => { ui(h).abandon = ui(h).selQuest; },
  GetAbandonQuestName: (h) => qAt(h, ui(h).abandon ?? ui(h).selQuest)?.title,
  AbandonQuest: (h) => {
    const u = ui(h); const q = qAt(h, u.abandon ?? u.selQuest); if (!q) return;
    const c = h.character(); const k = c.quests.indexOf(q); c.quests.splice(k, 1);
    const nextIsHeaderOrEnd = (i: number) => !c.quests[i] || c.quests[i]!.header !== undefined;
    if (k > 0 && c.quests[k - 1]!.header !== undefined && nextIsHeaderOrEnd(k)) c.quests.splice(k - 1, 1);
    u.watch = u.watch.filter((x) => x !== q.questID); u.abandon = undefined; u.selQuest = 0;
    h.fireIf("QUEST_LOG_UPDATE"); h.fireIf("UNIT_QUEST_LOG_CHANGED", "player");
  },
  GetQuestLogQuestText: (h) => { const q = qAt(h, ui(h).selQuest); return q ? [`Sample description of "${q.title}".`, `Sample objective of "${q.title}".`] : [undefined, undefined]; },
  GetNumQuestLeaderBoards: (h, a) => qAt(h, a[0] ?? ui(h).selQuest)?.objectives ?? 0,
  GetQuestLogLeaderBoard: (h, a) => { const q = qAt(h, ui(h).selQuest); const i = num(a[0]) ?? 0; return q && i >= 1 && i <= (q.objectives ?? 0) ? [`Sample objective ${i}: ${q.complete ? 1 : 0}/1`, "monster", q.complete === true] : undefined; },
  GetQuestLogTimeLeft: () => undefined,
  GetQuestIndexForTimer: () => undefined,
  GetQuestTimers: () => undefined,
  GetQuestLogPushable: (h) => qAt(h, ui(h).selQuest) !== undefined && h.scenario.party.length > 0,
  IsCurrentQuestFailed: () => false,
  GetNumQuestLogChoices: () => 0, GetNumQuestLogRewards: () => 0, GetQuestLogRequiredMoney: () => 0, GetQuestLogRewardMoney: () => 0,
  GetQuestGreenRange: (h) => { const l = h.scenario.player.level; return l <= 7 ? 4 : l <= 39 ? Math.floor(l / 10) + 5 : Math.floor(l / 5) + 1; },
  AddQuestWatch: (h, a) => { const q = qAt(h, a[0]); if (!q || q.questID === undefined) return; const u = ui(h); if (!u.watch.includes(q.questID)) { if (u.watch.length >= 5) { h.fire("UI_ERROR_MESSAGE", "You may only track 5 quests."); return; } u.watch.push(q.questID); h.fireIf("QUEST_WATCH_UPDATE", num(a[0]) ?? 0); } },
  RemoveQuestWatch: (h, a) => { const q = qAt(h, a[0]); if (!q) return; const u = ui(h); u.watch = u.watch.filter((x) => x !== q.questID); h.fireIf("QUEST_LOG_UPDATE"); },
  IsQuestWatched: (h, a) => { const q = qAt(h, a[0]); return q !== undefined && q.questID !== undefined && ui(h).watch.includes(q.questID) ? 1 : undefined; },
  GetNumQuestWatches: (h) => ui(h).watch.length,
  GetQuestIndexForWatch: (h, a) => { const id = ui(h).watch[(num(a[0]) ?? 0) - 1]; const k = id === undefined ? -1 : h.character().quests.findIndex((q) => q.questID === id); return k < 0 ? undefined : k + 1; },
  "C_QuestLog.IsUnitOnQuest": () => false,
  "C_QuestLog.IsQuestDataCachedByID": (h, a) => logQuests(h).some((q) => q.questID === a[0]),
  "C_QuestLog.RequestLoadQuestByID": (h, a) => { h.later(0.2, () => h.fireIf("QUEST_DATA_LOAD_RESULT", num(a[0]) ?? 0, logQuests(h).some((q) => q.questID === a[0]))); return true; },
  "C_QuestLog.GetQuestDetails": (h, a) => { const q = logQuests(h).find((x) => x.questID === a[0]); return q ? { questID: q.questID, title: q.title, level: q.level, description: `Sample description of "${q.title}".`, objectives: `Sample objective of "${q.title}".` } : undefined; },
};

// ===== [S8] TAXI_API =====

/** DE: Öffnet die Flugkarte (Ereignis TAXIMAP_OPENED). Geschlossen liefern die Flugfunktionen wie im Spiel nichts (Probe). EN: opens the taxi map; closed, the taxi functions return nothing like in the game (probe). */
export function openTaxi(h: SimHost): void { ui(h).taxiOpen = true; h.fireIf("TAXIMAP_OPENED"); }
const nodesHere = (h: SimHost) => {
  if (!ui(h).taxiOpen) return []; const m = h.scenario.player.x === undefined ? 0 : (here(h) ? (here(h)!.continent ?? 0) : 0); return TAXI_NODES.filter((n) => n.map === m && (n.faction === "Neutral" || n.faction === factionOf(h.scenario.player))); };
const current = (h: SimHost) => { const p = h.scenario.player; return nodesHere(h).find((n) => p.x !== undefined && p.y !== undefined && Math.hypot(n.x - p.x, n.y - p.y) < 300); };
const costTo = (h: SimHost, to: number): number => { const c = current(h); return TAXI_PATHS.find((p) => p.fromNodeID === c?.nodeID && p.toNodeID === to)?.cost ?? 0; };

export const TAXI_API: Record<string, Impl> = {
  NumTaxiNodes: (h) => nodesHere(h).length,
  TaxiNodeName: (h, a) => nodesHere(h)[(num(a[0]) ?? 0) - 1]?.name ?? "INVALID",
  TaxiNodeGetType: (h, a) => { const n = nodesHere(h)[(num(a[0]) ?? 0) - 1]; if (!n) return "NONE"; const c = current(h); return c?.nodeID === n.nodeID ? "CURRENT" : TAXI_PATHS.some((p) => p.fromNodeID === c?.nodeID && p.toNodeID === n.nodeID) ? "REACHABLE" : "DISTANT"; },
  TaxiNodeCost: (h, a) => { const n = nodesHere(h)[(num(a[0]) ?? 0) - 1]; if (!n) throw new Error("Invalid taxi node slot"); return costTo(h, n.nodeID); },
  TaxiNodePosition: (h, a) => { const n = nodesHere(h)[(num(a[0]) ?? 0) - 1]; return n ? [Math.round((0.5 - n.y / 40000) * 1e4) / 1e4, Math.round((0.5 - n.x / 40000) * 1e4) / 1e4] : [0, 0]; },
  TaxiNodeSetCurrent: () => undefined,
  GetNumRoutes: (h, a) => { const n = nodesHere(h)[(num(a[0]) ?? 0) - 1]; return n && costTo(h, n.nodeID) > 0 ? 1 : 0; },
  SetTaxiMap: () => undefined, DrawRouteLine: () => undefined,
  TaxiGetSrcX: () => 0, TaxiGetSrcY: () => 0, TaxiGetDestX: () => 0, TaxiGetDestY: () => 0,
  CloseTaxiMap: (h) => { const u = ui(h); if (u.taxiOpen) { u.taxiOpen = false; h.fireIf("TAXIMAP_CLOSED"); } },
  UnitOnTaxi: (h, a) => a[0] === "player" && ui(h).onTaxi,
  TakeTaxiNode: (h, a) => {
    const n = nodesHere(h)[(num(a[0]) ?? 0) - 1]; const u = ui(h); if (!n) return;
    const cost = costTo(h, n.nodeID); if (cost === 0) { h.fire("UI_ERROR_MESSAGE", "There is no direct path to that location."); return; }
    const inv = h.inventory(); if ((inv.money ?? 0) < cost) { h.fire("UI_ERROR_MESSAGE", "Not enough money"); return; }
    inv.money = (inv.money ?? 0) - cost; u.onTaxi = true; h.fireIf("PLAYER_CONTROL_LOST"); h.fireIf("PLAYER_MONEY"); h.fireIf("TAXIMAP_CLOSED");
    h.later(30, () => { u.onTaxi = false; h.scenario.player.x = n.x; h.scenario.player.y = n.y; h.scenario.player.z = n.z; h.fireIf("PLAYER_CONTROL_GAINED"); h.fireIf("ZONE_CHANGED_NEW_AREA"); });
  },
  "C_TaxiMap.GetAllTaxiNodes": (_h, a) => [TAXI_NODES.filter((n) => typeof a[0] !== "number" || n.map === a[0]).map((n) => ({ nodeID: n.nodeID, name: n.name, faction: n.faction === "Alliance" ? 2 : n.faction === "Horde" ? 1 : 0, mapID: n.map, areaID: n.areaID }))],
  "C_TaxiMap.GetTaxiRoute": (h, a) => { const c = current(h); const p = TAXI_PATHS.find((x) => x.fromNodeID === (c?.nodeID ?? -1) && x.toNodeID === a[0]); return p ? [[c!.nodeID, p.toNodeID]] : [[]]; },
};

// ===== [S9] TALENT_API =====

const TABS: Record<string, string[]> = { WARRIOR: ["Arms", "Fury", "Protection"], PALADIN: ["Holy", "Protection", "Retribution"], HUNTER: ["Beast Mastery", "Marksmanship", "Survival"], ROGUE: ["Assassination", "Combat", "Subtlety"], PRIEST: ["Discipline", "Holy", "Shadow"], SHAMAN: ["Elemental", "Enhancement", "Restoration"], MAGE: ["Arcane", "Fire", "Frost"], WARLOCK: ["Affliction", "Demonology", "Destruction"], DRUID: ["Balance", "Feral Combat", "Restoration"] };
const points = (h: SimHost): number => Math.max(0, h.scenario.player.level - 9) - ui(h).talents.flat().reduce((x, y) => x + y, 0);
const SKILLS: [string, boolean][] = [["Class Skills", true], ["Defense", false], ["Weapon Skills", true], ["Swords", false], ["Professions", true], ["Mining", false]];

export const TALENT_API: Record<string, Impl> = {
  GetNumTalentTabs: () => 3,
  GetTalentTabInfo: (h, a) => { const t = (num(a[0]) ?? 0) - 1; const n = TABS[h.scenario.player.classToken]?.[t]; return n ? [n, "Interface\\Icons\\INV_Misc_QuestionMark", ui(h).talents[t]!.reduce((x, y) => x + y, 0), n.replace(/ /g, "")] : undefined; },
  GetNumTalents: () => 4,
  GetTalentInfo: (h, a) => { const t = (num(a[0]) ?? 0) - 1, i = (num(a[1]) ?? 0) - 1; if (t < 0 || t > 2 || i < 0 || i > 3) return undefined; return [`Sample Talent ${t + 1}.${i + 1}`, "Interface\\Icons\\INV_Misc_QuestionMark", i + 1, 1, ui(h).talents[t]![i], 5, undefined, undefined]; },
  GetTalentPrereqs: () => undefined,
  LearnTalent: (h, a) => {
    const t = (num(a[0]) ?? 0) - 1, i = (num(a[1]) ?? 0) - 1; if (t < 0 || t > 2 || i < 0 || i > 3) return;
    if (points(h) <= 0) { h.fire("UI_ERROR_MESSAGE", "You have no talent points"); return; }
    const r = ui(h).talents[t]!; if (r[i]! >= 5) return; r[i] = r[i]! + 1; h.fireIf("CHARACTER_POINTS_CHANGED", -1); h.fireIf("SPELLS_CHANGED");
  },
  UnitCharacterPoints: (h, a) => (a[0] === "player" ? [points(h), 0] : [0, 0]),
  CheckTalentMasterDist: () => true, IsTalentTrainer: () => false, ConfirmTalentWipe: () => undefined,
  GetTalentIDByIndex: (_h, a) => 1000 + (num(a[0]) ?? 0) * 10 + (num(a[1]) ?? 0),
  GetNumSkillLines: () => SKILLS.length,
  GetSkillLineInfo: (h, a) => { const s = SKILLS[(num(a[0]) ?? 0) - 1]; return s ? [s[0], s[1], true, s[1] ? 0 : 300, 0, 0, s[1] ? 0 : 300, false, 0, 0, 0, 0, ""] : undefined; },
  GetSelectedSkill: (h) => ui(h).skillSel,
  SetSelectedSkill: (h, a) => { ui(h).skillSel = num(a[0]) ?? 0; },
  CollapseSkillHeader: () => undefined, ExpandSkillHeader: () => undefined,
  GetNumTrackingTypes: () => 2,
  GetTrackingInfo: (h, a) => { const i = num(a[0]) ?? 0; const n = ["Find Minerals", "Find Herbs"][i - 1]; return n ? [n, "Interface\\Icons\\Spell_Nature_Earthquake", ui(h).tracking === i, "spell"] : undefined; },
  SetTracking: (h, a) => { ui(h).tracking = num(a[0]) ?? 0; h.fireIf("MINIMAP_UPDATE_TRACKING"); },
  GetTrackingTexture: (h) => (ui(h).tracking ? "Interface\\Icons\\Spell_Nature_Earthquake" : undefined),
};
void AREA_NAMES;
