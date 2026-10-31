/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] UnitData, Scenario ... Server-Antworten als Daten
 *   [S2] DEFAULT_SCENARIO ..... Startwerte
 *   [S3] LogEntry
 *
 * DE: Ein Szenario beschreibt, was der „Server“ der Simulation antwortet (Einheiten, Gruppe,
 *     Realm, Sprache). Es ist reines JSON und kann gespeichert werden.
 * EN: a scenario describes what the simulated "server" answers (units, group, realm, locale).
 *     It is plain JSON and can be saved.
 */

import type { AuraEntry } from "./auras.js";
import type { CharacterState } from "./character.js";
import type { InventoryState } from "./inventory.js";

// ===== [S1] UnitData, Scenario =====

export interface UnitData {
  name: string;
  class: string;
  classToken: string;
  race: string;
  level: number;
  health: number;
  healthMax: number;
  isPlayer?: boolean;
  friendly?: boolean;
  /** DE: Optionale Zusatzwerte (Beispieldaten). EN: optional extra values (sample data). */
  guid?: string;
  power?: number;
  powerMax?: number;
  /** DE: 0 Mana, 1 Wut, 2 Fokus, 3 Energie, 4 Zufriedenheit. EN: 0 mana, 1 rage, 2 focus, 3 energy, 4 happiness. */
  powerType?: number;
  afk?: boolean;
  dnd?: boolean;
  feignDeath?: boolean;
  pet?: boolean;
  minion?: boolean;
  owner?: "player" | "target";
  standState?: number;
  subName?: string;
  creatureID?: number;
  speed?: number;
  runSpeed?: number;
  x?: number;
  y?: number;
  z?: number;
  auras?: AuraEntry[];
  /** DE: Weitere optionale Werte (Beispieldaten). EN: more optional values (sample data). */
  sex?: number; // 1 unknown, 2 male, 3 female
  dead?: boolean;
  ghost?: boolean;
  connected?: boolean;
  pvp?: boolean;
  ffa?: boolean;
  inCombat?: boolean;
  reaction?: number; // 1 hated .. 4 neutral .. 7 exalted
  classification?: string; // normal, elite, rare, rareelite, worldboss
  creatureType?: string;
  creatureTypeID?: number;
  creatureFamily?: string;
  factionGroup?: string;
  xp?: number;
  xpMax?: number;
  guild?: string;
  guildRank?: string;
  guildRankIndex?: number;
  tapped?: boolean;
  zone?: string;
}

export interface Scenario {
  realm: string;
  locale: string;
  player: UnitData;
  target?: UnitData;
  pet?: UnitData;
  focus?: UnitData;
  /** DE: Weitere Einheiten in der Nähe (für Zielwahl). EN: more nearby units (for targeting). */
  nearby?: UnitData[];
  mouseover?: UnitData;
  party: UnitData[];
  raidCount?: number;
  inCombat: boolean;
  /** DE: Gegenstände, Taschen, Zauber (optional, sonst Beispieldaten). EN: items, bags, spells (optional, else sample data). */
  inventory?: InventoryState;
  /** DE: Quest-Log, Ruf (optional, sonst Beispieldaten). EN: quest log, reputation (optional, else sample data). */
  character?: CharacterState;
}

// ===== [S2] DEFAULT_SCENARIO =====

export const DEFAULT_SCENARIO: Scenario = {
  realm: "Sandbox",
  locale: "enUS",
  player: { name: "Testhero", class: "Warrior", classToken: "WARRIOR", race: "Human", level: 60, health: 3200, healthMax: 3200, isPlayer: true, friendly: true, power: 20, powerMax: 100, x: -8913, y: -133, z: 82,
    auras: [{ spellId: 6673, helpful: true, duration: 120, remaining: 80, source: "player" }, { spellId: 21562, helpful: true, stacks: 1, source: "party1" }] },
  target: { name: "Defias Pillager", class: "Warrior", classToken: "WARRIOR", race: "Human", level: 18, health: 420, healthMax: 420, friendly: false, creatureID: 589, x: -8903, y: -133, z: 82 },
  party: [{ name: "Helper", class: "Priest", classToken: "PRIEST", race: "Dwarf", level: 60, health: 2400, healthMax: 2400, isPlayer: true, friendly: true, power: 1500, powerMax: 1800, x: -8920, y: -125, z: 82 }],
  inCombat: false,
};

// ===== [S3] LogEntry =====

export interface LogEntry {
  /** DE: Simulierte Zeit in Sekunden. EN: simulated time in seconds. */
  t: number;
  kind: "print" | "chat" | "error" | "warn" | "event" | "info";
  text: string;
}
