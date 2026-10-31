/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] PLAYERBUFF_API ... GetPlayerBuff*, CancelTrackingBuff (Vanilla-Aurenabfragen des Spielers)
 *
 * DE: Die Vanilla-Funktionen `GetPlayerBuff(index, filter)` und Verwandte arbeiten mit einer Kennung (0-basiert)
 *     statt mit Indizes; die Simulation nutzt dafür die Reihenfolge der Aura-Liste (Segen, dann Schaden).
 * EN: the vanilla `GetPlayerBuff(index, filter)` family works with an ID (0-based) instead of an index; the
 *     simulation uses the order of the aura list (buffs, then debuffs).
 */
import { list, parseFilter } from "./auras.js";
import { type Impl, type SimHost } from "./host.js";

// ===== [S1] PLAYERBUFF_API =====

const all = (h: SimHost, helpfulOnly?: boolean) => list(h as never, "player", parseFilter(helpfulOnly === undefined ? "HELPFUL|HARMFUL" : helpfulOnly ? "HELPFUL" : "HARMFUL", true));

export const PLAYERBUFF_API: Record<string, Impl> = {
  GetPlayerBuff: (h, a) => {
    const idx = typeof a[0] === "number" ? a[0] : 0; const helpful = !(typeof a[1] === "string" && /HARMFUL/i.test(a[1]));
    const e = all(h, helpful)[idx - 1]; if (!e) return [0, 0];
    return [(helpful ? 0 : 16) + idx - 1, e.duration ? 0 : 1];
  },
  GetPlayerBuffTexture: (h, a) => { const e = all(h)[typeof a[0] === "number" ? a[0] : -1]; return e ? h.inventory().spells[String(e.spellId)]?.icon : undefined; },
  GetPlayerBuffApplications: (h, a) => { const e = all(h)[typeof a[0] === "number" ? a[0] : -1]; return e?.stacks ?? 0; },
  GetPlayerBuffDispelType: (h, a) => all(h)[typeof a[0] === "number" ? a[0] : -1]?.dispelName,
  GetPlayerBuffTimeLeft: (h, a) => { const e = all(h)[typeof a[0] === "number" ? a[0] : -1]; return e?.duration ? Math.max(0, (e.remaining ?? e.duration) - h.now) : 0; },
  CancelTrackingBuff: () => undefined,
};
