/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Hilfen · helpers .......... Tokens, GUIDs, Ressourcen
 *   [S2] UNIT_API .................. ClassicAPI-Einheitenfunktionen (nach docs/API.md)
 *
 * DE: Einheiten-Funktionen der ClassicAPI auf Basis der Szenario-Einheiten (`UnitData`). Alles sind
 *     Beispielwerte aus dem Szenario; fehlende Felder haben Standardwerte.
 * EN: ClassicAPI unit functions on top of the scenario units (`UnitData`). Everything is sample data
 *     from the scenario; missing fields have defaults.
 */

import type { UnitData } from "./scenario.js";

/** DE: Was die Funktionen vom Host brauchen. EN: what the functions need from the host. */
export interface UnitHost {
  unit(id: unknown): UnitData | undefined;
  scenario: { player: UnitData };
}

// ===== [S1] Hilfen · helpers =====

const CLASS_ID: Record<string, number> = { WARRIOR: 1, PALADIN: 2, HUNTER: 3, ROGUE: 4, PRIEST: 5, SHAMAN: 7, MAGE: 8, WARLOCK: 9, DRUID: 11 };
const RACE_TOKEN: Record<string, [string, number]> = {
  Human: ["Human", 1], Orc: ["Orc", 2], Dwarf: ["Dwarf", 3], "Night Elf": ["NightElf", 4], Undead: ["Scourge", 5], Tauren: ["Tauren", 6], Gnome: ["Gnome", 7], Troll: ["Troll", 8],
};

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function unitGuid(u: UnitData): string {
  if (u.guid) return u.guid;
  const low = hash32(u.name).toString(16).padStart(8, "0");
  return u.isPlayer ? `0x00000000${low}` : `0xF130${(u.creatureID ?? 1).toString(16).padStart(6, "0")}${low.slice(-6)}`;
}

export function primaryPower(u: UnitData): number {
  if (u.powerType !== undefined) return u.powerType;
  return u.classToken === "WARRIOR" ? 1 : u.classToken === "ROGUE" ? 3 : 0;
}

export function powerOf(u: UnitData, type: unknown, max: boolean): number {
  const t = typeof type === "number" && type >= 0 && type <= 4 ? type : primaryPower(u);
  if (t !== primaryPower(u)) return 0;
  const cap = u.powerMax ?? (t === 1 || t === 3 ? 100 : 0);
  return max ? cap : Math.min(u.power ?? cap, cap);
}

const TOKEN_ROOT = /^(player|target|pet|focus|mouseover|npc|none|vehicle|party[1-4]|partypet[1-4]|raid([1-9]|[1-3][0-9]|40)|raidpet([1-9]|[1-3][0-9]|40)|nameplate\d+|mark[1-8]|0x[0-9a-fA-F]{16})$/;

export function isUnitToken(v: unknown): boolean {
  if (typeof v !== "string") return false;
  let s = v;
  for (;;) {
    if (TOKEN_ROOT.test(s)) return true;
    const m = /^(.+?)(target|pet)$/.exec(s);
    if (!m || !m[1]) return false;
    s = m[1];
  }
}

function tokenList(h: UnitHost): string[] {
  const out = ["player", "target", "pet"];
  for (let i = 1; i <= 4; i++) out.push(`party${i}`);
  return out;
}

// ===== [S2] UNIT_API =====

type Impl = (h: UnitHost, a: unknown[]) => unknown;

export const UNIT_API: Record<string, Impl> = {
  UnitClassBase: (h, a) => { const u = h.unit(a[0]); return u ? [u.classToken, CLASS_ID[u.classToken]] : undefined; },
  UnitRaceBase: (h, a) => { const u = h.unit(a[0]); const r = u?.isPlayer ? RACE_TOKEN[u.race] : undefined; return r ? [r[0], r[1]] : undefined; },
  UnitGUID: (h, a) => { const u = h.unit(a[0]); return u ? unitGuid(u) : undefined; },
  UnitPower: (h, a) => { const u = h.unit(a[0]); return u ? powerOf(u, a[1], false) : 0; },
  UnitPowerMax: (h, a) => { const u = h.unit(a[0]); return u ? powerOf(u, a[1], true) : 0; },
  UnitPowerMissing: (h, a) => { const u = h.unit(a[0]); return u ? Math.max(0, powerOf(u, a[1], true) - powerOf(u, a[1], false)) : 0; },
  UnitIsAFK: (h, a) => h.unit(a[0])?.afk === true,
  UnitIsDND: (h, a) => h.unit(a[0])?.dnd === true,
  UnitIsFeignDeath: (h, a) => h.unit(a[0])?.feignDeath === true,
  UnitIsMinion: (h, a) => { const u = h.unit(a[0]); return u !== undefined && (u.minion === true || u.pet === true || a[0] === "pet"); },
  UnitIsPet: (h, a) => { const u = h.unit(a[0]); return u !== undefined && (u.pet === true || a[0] === "pet"); },
  UnitOwnerGUID: (h, a) => {
    const u = h.unit(a[0]);
    if (!u || !(u.pet || u.minion || a[0] === "pet")) return undefined;
    return unitGuid(u.owner === "target" ? h.unit("target") ?? h.scenario.player : h.scenario.player);
  },
  UnitStandState: (h, a) => h.unit(a[0])?.standState ?? 0,
  UnitSubName: (h, a) => h.unit(a[0])?.subName,
  UnitCreatureID: (h, a) => { const u = h.unit(a[0]); return u && !u.isPlayer ? u.creatureID : undefined; },
  IsUnitToken: (_h, a) => isUnitToken(a[0]),
  UnitTokenFromName: (h, a) => {
    if (typeof a[0] !== "string") return undefined;
    const want = a[0].toLowerCase();
    for (const t of tokenList(h)) {
      const u = h.unit(t);
      if (!u) continue;
      const n = u.name.toLowerCase();
      if (a[1] ? n === want : n.startsWith(want)) return t;
    }
    return undefined;
  },
  GetUnitSpeed: (h, a) => { const u = h.unit(a[0]); return u ? [u.speed ?? 0, u.runSpeed ?? 7, 0, 4.722] : [0, 0, 0, 0]; },
  UnitPosition: (h, a) => { const u = h.unit(a[0]); return u && u.x !== undefined && u.y !== undefined ? [u.y, u.x, u.z ?? 0, 0] : undefined; },
  UnitDistanceSquared: (h, a) => {
    const u = h.unit(a[0]); const p = h.scenario.player;
    if (!u || u.x === undefined || u.y === undefined || p.x === undefined || p.y === undefined) return [0, false];
    const dx = u.x - p.x, dy = u.y - p.y, dz = (u.z ?? 0) - (p.z ?? 0);
    return [dx * dx + dy * dy + dz * dz, true];
  },
  UnitInRange: (h, a) => {
    if (a[0] === "player") return [false, false];
    const r = UNIT_API.UnitDistanceSquared!(h, a) as [number, boolean];
    return r[1] ? [r[0] <= 1600, true] : [false, false];
  },
  CanBeRaidTarget: (h, a) => { const u = h.unit(a[0]); return u !== undefined && (!u.isPlayer || u.friendly === true); },
};
