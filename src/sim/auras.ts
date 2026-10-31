/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] AuraEntry ........ Beispiel-Aura einer Einheit
 *   [S2] AURA_API ......... UnitBuff/UnitDebuff (Vanilla) und Hilfen für C_UnitAuras (ClassicAPI)
 *
 * DE: Auren stehen als Liste in den Szenario-Einheiten (`UnitData.auras`). Reihenfolge wie in der
 *     ClassicAPI-Doku: eigene Auren zuerst, dann der Rest in Listenreihenfolge. Unterstützte Filter:
 *     HELPFUL, HARMFUL, PLAYER, !PLAYER (weitere Tokens werden ignoriert).
 * EN: auras are a list on the scenario units (`UnitData.auras`). Order as in the ClassicAPI docs: own
 *     auras first, then the rest in list order. Supported filters: HELPFUL, HARMFUL, PLAYER, !PLAYER.
 */

import type { InventoryState } from "./inventory.js";
import type { UnitData } from "./scenario.js";
import { unitGuid } from "./units.js";

// ===== [S1] AuraEntry =====

export interface AuraEntry {
  spellId: number;
  /** DE: true = Segen, false = Schaden. EN: true = buff, false = debuff. */
  helpful: boolean;
  stacks?: number;
  /** DE: Dauer in Sekunden, 0 = unbegrenzt. EN: duration in seconds, 0 = infinite. */
  duration?: number;
  /** DE: Restzeit beim Start in Sekunden. EN: remaining time at start in seconds. */
  remaining?: number;
  dispelName?: "Magic" | "Curse" | "Disease" | "Poison";
  /** DE: Wirker als Einheit („player“, „target“ …). EN: caster unit. */
  source?: string;
}

// ===== [S2] AURA_API =====

export interface AuraHost {
  unit(id: unknown): UnitData | undefined;
  inventory(): InventoryState;
  now: number;
}

export interface Filter { helpful: boolean; harmful: boolean; player?: boolean }

export function parseFilter(f: unknown, defaultHelpful: boolean): Filter {
  const tokens = typeof f === "string" ? f.toUpperCase().split(/[|\s]+/).filter(Boolean) : [];
  const out: Filter = { helpful: tokens.includes("HELPFUL"), harmful: tokens.includes("HARMFUL") };
  if (tokens.includes("PLAYER")) out.player = true;
  if (tokens.includes("!PLAYER")) out.player = false;
  if (!out.helpful && !out.harmful) {
    if (typeof f === "string" && f !== "") { out.helpful = true; out.harmful = true; } else { out.helpful = defaultHelpful; out.harmful = !defaultHelpful; }
  }
  return out;
}

/** DE: Passende Auren in Doku-Reihenfolge (eigene zuerst, Segen vor Schaden ohne Filter). EN: matching auras in docs order. */
export function list(h: AuraHost, unit: unknown, filter: Filter): AuraEntry[] {
  const all = (h.unit(unit)?.auras ?? []).filter((a) => a.duration === undefined || a.duration === 0 || (a.remaining ?? a.duration) > h.now);
  const pick = (helpful: boolean): AuraEntry[] => {
    const m = all.filter((a) => a.helpful === helpful && (filter.player === undefined || (a.source === "player") === filter.player));
    return [...m.filter((a) => a.source === "player"), ...m.filter((a) => a.source !== "player")];
  };
  return [...(filter.helpful ? pick(true) : []), ...(filter.harmful ? pick(false) : [])];
}

export function row(h: AuraHost, unit: unknown, a: AuraEntry): unknown[] {
  const sp = h.inventory().spells[String(a.spellId)];
  const src = a.source !== undefined ? h.unit(a.source) : undefined;
  const exp = a.duration ? 1000 + (a.remaining ?? a.duration) : 0;
  return [sp?.name ?? `Spell ${a.spellId}`, sp?.icon ?? "Interface\\Icons\\INV_Misc_QuestionMark", a.stacks ?? 1, a.spellId, a.dispelName ?? "", a.helpful,
    a.duration ?? 0, exp, a.source, src ? unitGuid(src) : undefined, a.source === "player"];
}

type Impl = (h: AuraHost, a: unknown[]) => unknown;

export const AURA_API: Record<string, Impl> = {
  // Vanilla: texture, applications (debuff: + dispel type)
  UnitBuff: (h, a) => {
    const e = typeof a[1] === "number" ? list(h, a[0], parseFilter("HELPFUL", true))[a[1] - 1] : undefined;
    if (!e) return undefined;
    const r = row(h, a[0], e);
    return [r[1], r[2]];
  },
  UnitDebuff: (h, a) => {
    const e = typeof a[1] === "number" ? list(h, a[0], parseFilter("HARMFUL", false))[a[1] - 1] : undefined;
    if (!e) return undefined;
    const r = row(h, a[0], e);
    return [r[1], r[2], r[4] === "" ? undefined : r[4]];
  },
  // Hilfen für die Lua-Tabellen · helpers for the Lua tables
  __aura_at: (h, a) => {
    const e = typeof a[1] === "number" ? list(h, a[0], parseFilter(a[2], true))[a[1] - 1] : undefined;
    return e ? row(h, a[0], e) : undefined;
  },
  __aura_find: (h, a) => {
    // a[1] = "name" | "id"
    const want = typeof a[2] === "string" ? a[2].toLowerCase() : a[2];
    for (const e of list(h, a[0], parseFilter(a[3], false) && (typeof a[3] === "string" && a[3] !== "" ? parseFilter(a[3], true) : { helpful: true, harmful: true }))) {
      const r = row(h, a[0], e);
      if (a[1] === "name" ? String(r[0]).toLowerCase() === want : r[3] === want) return r;
    }
    return undefined;
  },
};
