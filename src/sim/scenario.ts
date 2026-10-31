/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
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
}

export interface Scenario {
  realm: string;
  locale: string;
  player: UnitData;
  target?: UnitData;
  pet?: UnitData;
  party: UnitData[];
  raidCount?: number;
  inCombat: boolean;
}

// ===== [S2] DEFAULT_SCENARIO =====

export const DEFAULT_SCENARIO: Scenario = {
  realm: "Sandbox",
  locale: "enUS",
  player: { name: "Testhero", class: "Warrior", classToken: "WARRIOR", race: "Human", level: 60, health: 3200, healthMax: 3200, isPlayer: true, friendly: true },
  target: { name: "Defias Pillager", class: "Warrior", classToken: "WARRIOR", race: "Human", level: 18, health: 420, healthMax: 420, friendly: false },
  party: [{ name: "Helper", class: "Priest", classToken: "PRIEST", race: "Dwarf", level: 60, health: 2400, healthMax: 2400, isPlayer: true, friendly: true }],
  inCombat: false,
};

// ===== [S3] LogEntry =====

export interface LogEntry {
  /** DE: Simulierte Zeit in Sekunden. EN: simulated time in seconds. */
  t: number;
  kind: "print" | "chat" | "error" | "warn" | "event" | "info";
  text: string;
}
