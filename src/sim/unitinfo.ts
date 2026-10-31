/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Hilfen · helpers ........ Einheiten finden, Fraktion, Beziehung
 *   [S2] UNITINFO_API ............ Status-, Kampf-, Wert- und Namensfunktionen für Einheiten
 *   [S3] CREATURE_API ............ C_CreatureInfo, C_GameObjectInfo, C_PlayerInfo, GUID-Funktionen
 *
 * DE: Alle Werte stammen aus den Szenario-Einheiten oder sind Beispielwerte (Kampfwerte werden aus der
 *     Stufe abgeleitet). Rückgabeformate sind bis zum Test im Spiel `unverified`.
 * EN: all values come from the scenario units or are sample values (combat stats are derived from the level).
 *     Return formats are `unverified` until tested in game.
 */
import { type Impl, type SimHost, num, str } from "./host.js";
import type { UnitData } from "./scenario.js";
import { primaryPower, powerOf, unitGuid } from "./units.js";

// ===== [S1] Hilfen · helpers =====

const ALLIANCE = new Set(["Human", "Dwarf", "Night Elf", "Gnome"]);
const POWER_TOKEN = ["MANA", "RAGE", "FOCUS", "ENERGY", "HAPPINESS"];
const TYPES = ["Beast", "Dragonkin", "Demon", "Elemental", "Giant", "Undead", "Humanoid", "Critter", "Mechanical", "Not specified", "Totem"];
const FAMILIES: [number, string, string][] = [[1, "Wolf", "Ability_Hunter_Pet_Wolf"], [2, "Cat", "Ability_Hunter_Pet_Cat"], [3, "Spider", "Ability_Hunter_Pet_Spider"], [4, "Bear", "Ability_Hunter_Pet_Bear"], [5, "Boar", "Ability_Hunter_Pet_Boar"], [6, "Crocolisk", "Ability_Hunter_Pet_Crocolisk"], [7, "Carrion Bird", "Ability_Hunter_Pet_Vulture"], [8, "Crab", "Ability_Hunter_Pet_Crab"], [9, "Gorilla", "Ability_Hunter_Pet_Gorilla"], [11, "Raptor", "Ability_Hunter_Pet_Raptor"], [12, "Tallstrider", "Ability_Hunter_Pet_TallStrider"], [15, "Felhunter", ""], [16, "Voidwalker", ""], [17, "Succubus", ""], [19, "Doomguard", ""], [20, "Scorpid", "Ability_Hunter_Pet_Scorpid"], [21, "Turtle", "Ability_Hunter_Pet_Turtle"], [23, "Imp", ""], [24, "Bat", "Ability_Hunter_Pet_Bat"], [25, "Hyena", "Ability_Hunter_Pet_Hyena"], [26, "Owl", "Ability_Hunter_Pet_Owl"], [27, "Wind Serpent", "Ability_Hunter_Pet_WindSerpent"]];
const RACES: Record<number, [string, string]> = { 1: ["Human", "Human"], 2: ["Orc", "Orc"], 3: ["Dwarf", "Dwarf"], 4: ["Night Elf", "NightElf"], 5: ["Undead", "Scourge"], 6: ["Tauren", "Tauren"], 7: ["Gnome", "Gnome"], 8: ["Troll", "Troll"] };
const CLASSES: Record<number, [string, string]> = { 1: ["Warrior", "WARRIOR"], 2: ["Paladin", "PALADIN"], 3: ["Hunter", "HUNTER"], 4: ["Rogue", "ROGUE"], 5: ["Priest", "PRIEST"], 7: ["Shaman", "SHAMAN"], 8: ["Mage", "MAGE"], 9: ["Warlock", "WARLOCK"], 11: ["Druid", "DRUID"] };

const TOKENS = ["player", "target", "pet", "focus", "mouseover", "party1", "party2", "party3", "party4"];

export function allUnits(h: SimHost): [string, UnitData][] {
  const out: [string, UnitData][] = [];
  for (const t of TOKENS) { const u = h.unit(t); if (u) out.push([t, u]); }
  return out;
}

function same(h: SimHost, a: unknown, b: unknown): boolean {
  const x = h.unit(a), y = h.unit(b);
  return x !== undefined && x === y;
}

export function factionOf(u: UnitData): string | undefined {
  if (u.factionGroup) return u.factionGroup;
  if (u.isPlayer) return ALLIANCE.has(u.race) ? "Alliance" : "Horde";
  return undefined;
}

/** DE: Stufe der Beziehung 1 (verhasst) .. 8. EN: reaction 1 (hated) .. 8. */
export function reaction(h: SimHost, u: UnitData, to: UnitData): number {
  if (u === to) return 5;
  if (u.reaction !== undefined) return u.reaction;
  return u.friendly === false ? 2 : 5;
}

const alive = (u: UnitData): boolean => u.dead !== true && u.ghost !== true && u.health > 0;
const unitArg = (h: SimHost, v: unknown): UnitData | undefined => h.unit(v);

// ===== [S2] UNITINFO_API =====

export const UNITINFO_API: Record<string, Impl> = {
  UnitIsDead: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && (u.dead === true || (u.health <= 0 && u.ghost !== true)); },
  UnitIsGhost: (h, a) => unitArg(h, a[0])?.ghost === true,
  UnitIsDeadOrGhost: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && !alive(u); },
  UnitIsPlayer: (h, a) => unitArg(h, a[0])?.isPlayer === true,
  UnitIsConnected: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && u.connected !== false; },
  UnitIsVisible: (h, a) => unitArg(h, a[0]) !== undefined,
  UnitIsUnit: (h, a) => same(h, a[0], a[1]),
  UnitIsEnemy: (h, a) => { const u = unitArg(h, a[0]), o = unitArg(h, a[1]); return u !== undefined && o !== undefined && u !== o && (reaction(h, o, u) <= 2 || reaction(h, u, o) <= 2); },
  UnitIsFriend: (h, a) => { const u = unitArg(h, a[0]), o = unitArg(h, a[1]); return u !== undefined && o !== undefined && reaction(h, o, u) >= 5 && reaction(h, u, o) >= 5; },
  UnitReaction: (h, a) => { const u = unitArg(h, a[0]), o = unitArg(h, a[1]); return u && o ? reaction(h, u, o) : undefined; },
  UnitCanAttack: (h, a) => { const u = unitArg(h, a[0]), o = unitArg(h, a[1]); return u !== undefined && o !== undefined && u !== o && alive(u) && reaction(h, o, u) <= 4; },
  UnitCanAssist: (h, a) => { const u = unitArg(h, a[0]), o = unitArg(h, a[1]); return u !== undefined && o !== undefined && alive(u) && reaction(h, o, u) >= 5; },
  UnitCanCooperate: (h, a) => { const u = unitArg(h, a[0]), o = unitArg(h, a[1]); return u !== undefined && o !== undefined && u.isPlayer === true && o.isPlayer === true && reaction(h, o, u) >= 5; },
  UnitAffectingCombat: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && (u.inCombat ?? (u === h.scenario.player && h.scenario.inCombat)); },
  UnitIsPVP: (h, a) => unitArg(h, a[0])?.pvp === true,
  UnitIsPVPFreeForAll: (h, a) => unitArg(h, a[0])?.ffa === true,
  UnitIsCivilian: () => false,
  UnitIsTapped: (h, a) => unitArg(h, a[0])?.tapped === true,
  UnitIsTappedByPlayer: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && u.tapped === true; },
  UnitIsTrivial: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && h.scenario.player.level - u.level >= 10 && !u.isPlayer; },
  UnitIsPlusMob: (h, a) => { const c = unitArg(h, a[0])?.classification; return c === "elite" || c === "rareelite" || c === "worldboss"; },
  UnitIsCharmed: () => false,
  UnitIsPossessed: () => false,
  UnitIsOtherPlayersPet: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && u.pet === true && u !== h.scenario.pet; },
  UnitIsInMyGuild: (h, a) => { const u = unitArg(h, a[0]); const g = h.scenario.player.guild; return u !== undefined && g !== undefined && u.guild === g; },
  UnitPlayerControlled: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && (u.isPlayer === true || u.pet === true || a[0] === "pet"); },
  UnitInLineOfSight: (h, a) => unitArg(h, a[0]) !== undefined,
  UnitHasIncomingResurrection: () => false,
  UnitInParty: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && h.scenario.party.includes(u); },
  UnitInRaid: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && (h.scenario.raidCount ?? 0) > 0 && (u === h.scenario.player || h.scenario.party.includes(u)) ? 1 : undefined; },
  UnitPlayerOrPetInParty: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && (h.scenario.party.includes(u) || u === h.scenario.pet); },
  UnitPlayerOrPetInRaid: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && (h.scenario.raidCount ?? 0) > 0 && (u === h.scenario.player || h.scenario.party.includes(u) || u === h.scenario.pet); },
  UnitIsPartyLeader: (h, a) => { const u = unitArg(h, a[0]); return u !== undefined && u === h.scenario.player && h.scenario.party.length > 0; },
  UnitFactionGroup: (h, a) => { const f = (() => { const u = unitArg(h, a[0]); return u ? factionOf(u) : undefined; })(); return f ? [f, f] : undefined; },
  UnitSex: (h, a) => unitArg(h, a[0])?.sex ?? (unitArg(h, a[0]) ? 2 : undefined),
  UnitClassification: (h, a) => unitArg(h, a[0])?.classification ?? "normal",
  UnitCreatureType: (h, a) => { const u = unitArg(h, a[0]); return u ? u.creatureType ?? (u.isPlayer ? "Humanoid" : "Humanoid") : undefined; },
  UnitCreatureTypeID: (h, a) => { const u = unitArg(h, a[0]); if (!u) return undefined; if (u.creatureTypeID) return u.creatureTypeID; const k = TYPES.indexOf(u.creatureType ?? "Humanoid"); return k < 0 ? 10 : k + 1; },
  UnitCreatureFamily: (h, a) => unitArg(h, a[0])?.creatureFamily,
  UnitCreatureFamilyID: (h, a) => { const f = unitArg(h, a[0])?.creatureFamily; return f ? FAMILIES.find((x) => x[1] === f)?.[0] : undefined; },
  UnitMana: (h, a) => { const u = unitArg(h, a[0]); return u ? powerOf(u, undefined, false) : 0; },
  UnitManaMax: (h, a) => { const u = unitArg(h, a[0]); return u ? powerOf(u, undefined, true) : 0; },
  UnitPowerType: (h, a) => { const u = unitArg(h, a[0]); if (!u) return [0, "MANA"]; const t = primaryPower(u); return [t, POWER_TOKEN[t] ?? "MANA"]; },
  UnitXP: (h, a) => { const u = unitArg(h, a[0]); return u ? u.xp ?? Math.floor((u.xpMax ?? 1000 + u.level * 500) * 0.4) : 0; },
  UnitXPMax: (h, a) => { const u = unitArg(h, a[0]); return u ? u.xpMax ?? 1000 + u.level * 500 : 0; },
  UnitStat: (h, a) => { const u = unitArg(h, a[0]); const i = num(a[1]) ?? 1; const b = u ? 20 + u.level * 2 + i : 0; return [b, b, 0, 0]; },
  UnitArmor: (h, a) => { const u = unitArg(h, a[0]); const b = u ? u.level * 25 : 0; return [b, b, 0, 0]; },
  UnitResistance: (h, a) => { const u = unitArg(h, a[0]); const s = num(a[1]) ?? 0; const b = u && s > 0 ? Math.floor(u.level / 4) : 0; return [b, b, 0, 0]; },
  UnitDefense: (h, a) => { const u = unitArg(h, a[0]); const b = u ? u.level * 5 : 0; return [b, 0]; },
  UnitAttackBothHands: (h, a) => { const u = unitArg(h, a[0]); const b = u ? u.level * 5 : 0; return [b, 0, b, 0]; },
  UnitAttackPower: (h, a) => { const u = unitArg(h, a[0]); return [u ? u.level * 3 : 0, 0, 0]; },
  UnitRangedAttackPower: (h, a) => { const u = unitArg(h, a[0]); return [u ? u.level * 2 : 0, 0, 0]; },
  UnitRangedAttack: (h, a) => { const u = unitArg(h, a[0]); return [u ? u.level * 5 : 0, 0]; },
  UnitAttackSpeed: (h, a) => (unitArg(h, a[0]) ? [2.6, 0] : [0, 0]),
  UnitDamage: (h, a) => { const u = unitArg(h, a[0]); const lv = u?.level ?? 0; return [lv * 2, lv * 3, 0, 0, 0, 0, 1]; },
  UnitRangedDamage: (h, a) => { const u = unitArg(h, a[0]); const lv = u?.level ?? 0; return [2.8, lv * 2, lv * 3, 0, 1]; },
  UnitSelectionType: (h, a) => { const u = unitArg(h, a[0]); if (!u) return undefined; return reaction(h, u, h.scenario.player) <= 2 ? 0 : reaction(h, u, h.scenario.player) === 4 ? 1 : 3; },
  UnitSelectionColor: (h, a) => { const u = unitArg(h, a[0]); const r = u ? reaction(h, u, h.scenario.player) : 4; return r <= 2 ? [1, 0, 0, 1] : r === 4 ? [1, 1, 0, 1] : [0, 1, 0, 1]; },
  UnitPVPName: (h, a) => unitArg(h, a[0])?.name,
  UnitPVPRank: () => 0,
  GetPlayerInfoByGUID: (h, a) => {
    for (const [, u] of allUnits(h)) if (u.isPlayer && unitGuid(u) === a[0]) return [u.class, u.classToken, u.race, u.race.replace(" ", ""), u.sex === 3 ? 3 : 2, u.name, ""];
    return undefined;
  },
  UnitNameFromGUID: (h, a) => allUnits(h).find(([, u]) => unitGuid(u) === a[0])?.[1].name,
  UnitTokenFromGUID: (h, a) => allUnits(h).find(([, u]) => unitGuid(u) === a[0])?.[0],
};

// ===== [S3] CREATURE_API =====

const guidKind = (g: unknown): "player" | "creature" | "pet" | "object" | undefined => {
  if (typeof g !== "string" || !/^0x[0-9a-fA-F]{16}$/.test(g)) return undefined;
  const hi = g.slice(2, 6).toUpperCase();
  return hi === "0000" ? "player" : hi === "F130" ? "creature" : hi === "F140" ? "pet" : hi === "F110" ? "object" : undefined;
};

export const CREATURE_API: Record<string, Impl> = {
  "C_CreatureInfo.GetCreatureID": (_h, a) => (guidKind(a[0]) === "creature" ? parseInt(String(a[0]).slice(6, 12), 16) : undefined),
  "C_CreatureInfo.GetCreatureInfoByID": (h, a) => {
    const id = num(a[0]); if (id === undefined) return undefined;
    const u = allUnits(h).map(([, x]) => x).find((x) => x.creatureID === id);
    if (!u) return undefined;
    return { creatureID: id, name: u.name, subName: u.subName, creatureType: u.creatureType ?? "Humanoid", creatureTypeID: 7, rank: u.classification === "elite" ? 1 : 0, family: u.creatureFamily };
  },
  "C_CreatureInfo.RequestLoadCreatureByID": (h, a) => {
    const id = num(a[0]); if (id === undefined) return false;
    const ok = allUnits(h).some(([, x]) => x.creatureID === id);
    h.later(0.2, () => h.fireIf("CREATURE_DATA_LOAD_RESULT", id, ok));
    return true;
  },
  "C_CreatureInfo.GetRaceInfo": (_h, a) => { const r = RACES[num(a[0]) ?? 0]; return r ? { raceName: r[0], clientFileString: r[1], raceID: a[0] } : undefined; },
  "C_CreatureInfo.GetClassInfo": (_h, a) => { const r = CLASSES[num(a[0]) ?? 0]; return r ? { className: r[0], classFile: r[1], classID: a[0] } : undefined; },
  "C_CreatureInfo.GetCreatureFamilyInfo": (_h, a) => { const f = FAMILIES.find((x) => x[0] === a[0]); return f ? { id: f[0], name: f[1], iconFile: f[2] ? `Interface\\Icons\\${f[2]}` : "" } : undefined; },
  "C_CreatureInfo.GetCreatureFamilyIDs": () => [FAMILIES.map((f) => f[0])],
  "C_CreatureInfo.GetFactionInfo": (_h, a) => { const r = RACES[num(a[0]) ?? 0]; if (!r) return undefined; const g = ALLIANCE.has(r[0]) ? "Alliance" : "Horde"; return { name: g, groupTag: g }; },
  "C_CreatureInfo.GetCreatureTypeInfo": (_h, a) => { const n = TYPES[(num(a[0]) ?? 0) - 1]; return n ? { id: a[0], name: n } : undefined; },
  "C_CreatureInfo.GetCreatureTypeIDs": () => [TYPES.map((_, i) => i + 1)],
  "C_GameObjectInfo.GetGameObjectInfoByID": (_h, a) => (a[0] === 61 ? { gameObjectID: 61, name: "Sample Chest", type: 3 } : undefined),
  "C_GameObjectInfo.RequestLoadGameObjectByID": (h, a) => { h.later(0.2, () => h.fireIf("GAMEOBJECT_DATA_LOAD_RESULT", num(a[0]) ?? 0, a[0] === 61)); return true; },
  "C_PlayerInfo.GUIDIsPlayer": (_h, a) => guidKind(a[0]) === "player",
  "C_PlayerInfo.GUIDIsCreature": (_h, a) => guidKind(a[0]) === "creature",
  "C_PlayerInfo.GUIDIsPet": (_h, a) => guidKind(a[0]) === "pet",
  "C_PlayerInfo.GUIDIsGameObject": (_h, a) => guidKind(a[0]) === "object",
  "C_PlayerInfo.GetName": (h, a) => allUnits(h).find(([, u]) => unitGuid(u) === a[0])?.[1].name ?? (a[0] === undefined ? h.scenario.player.name : undefined),
  "C_PlayerInfo.GetClass": (h, a) => { const u = a[0] === undefined ? h.scenario.player : allUnits(h).find(([, x]) => unitGuid(x) === a[0])?.[1]; return u ? [u.class, u.classToken] : undefined; },
  "C_PlayerInfo.GetRace": (h, a) => { const u = a[0] === undefined ? h.scenario.player : allUnits(h).find(([, x]) => unitGuid(x) === a[0])?.[1]; return u ? [u.race, u.race.replace(" ", "")] : undefined; },
  "C_PlayerInfo.GetSex": (h, a) => (a[0] === undefined ? h.scenario.player : allUnits(h).find(([, x]) => unitGuid(x) === a[0])?.[1])?.sex ?? 2,
  "C_PlayerInfo.IsConnected": (h, a) => { const u = allUnits(h).find(([, x]) => unitGuid(x) === a[0])?.[1]; return u !== undefined && u.connected !== false; },
  "C_PlayerInfo.CanUseItem": (h, a) => { const it = h.inventory().items[String(a[0])]; return it !== undefined && (it.minLevel ?? 0) <= h.scenario.player.level; },
};
void str;
