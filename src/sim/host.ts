/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] SimHost ... die Schnittstelle, die alle Sim-Module vom WowSim nutzen · what all sim modules use from WowSim
 *   [S2] Hilfen · helpers ... num, str, bool, Impl
 *
 * DE: Gemeinsame Basis der Module `map.ts`, `social.ts`, `spells.ts` usw. Jedes Modul hält seinen
 *     Zustand mit `h.store(schluessel, start)` (je Simulation, nicht im Szenario).
 * EN: shared base of the modules `map.ts`, `social.ts`, `spells.ts` etc. Each module keeps its state with
 *     `h.store(key, init)` (per simulation, not in the scenario).
 */

import type { InventoryState } from "./inventory.js";
import type { CharacterState } from "./character.js";
import type { InteractionState } from "./interaction.js";
import type { CvarStore } from "./system.js";
import type { UnitData } from "./scenario.js";
import type { ResolvedTarget } from "../core/plugins.js";

// ===== [S1] SimHost =====

export interface SimHost {
  inventory(): InventoryState;
  character(): CharacterState;
  interaction(): InteractionState;
  unit(id: unknown): UnitData | undefined;
  fire(event: string, ...args: (string | number | boolean)[]): void;
  note(kind: "info" | "warn", text: string): void;
  readonly cvars: CvarStore;
  readonly target: ResolvedTarget;
  addonName: string;
  serverEpoch(): number;
  now: number;
  readonly baseTime: number;
  /** DE: Ruft `fn` nach `seconds` Spielzeit auf (Host-Zeitgeber). EN: calls `fn` after `seconds` of sim time (host timer). */
  later(seconds: number, fn: () => void): { cancel(): void };
  /** DE: Löst das Ereignis nur aus, wenn das Ziel es kennt. EN: fires the event only if the target knows it. */
  fireIf(event: string, ...args: (string | number | boolean)[]): void;
  /** DE: Zustand je Simulation. EN: state per simulation. */
  store<T>(key: string, init: () => T): T;
}

// ===== [S2] Hilfen · helpers =====

export type Impl = (h: SimHost, a: unknown[]) => unknown;
export const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
export const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
export const round = (v: number, d = 4): number => Math.round(v * 10 ** d) / 10 ** d;
