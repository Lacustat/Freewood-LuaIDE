/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Datentypen · data types ... QuestEntry, FactionEntry, CharacterState
 *   [S2] Beispieldaten · sample .... DEFAULT_CHARACTER
 *   [S3] CHARACTER_API ............. Quests, Ruf, Zauberbuch (Rückgaben als primitive Werte)
 *
 * DE: Quest-Log, Ruf und Zauberbuch des simulierten Charakters; Beispieldaten, frei änderbar. Das
 *     Zauberbuch besteht aus den bekannten Zaubern des Inventar-Zustands (ein Reiter „General“).
 * EN: quest log, reputation and spellbook of the simulated character; sample data, freely editable.
 *     The spellbook is made of the known spells of the inventory state (one tab "General").
 */

import type { InventoryState } from "./inventory.js";

// ===== [S1] Datentypen · data types =====

export interface QuestEntry {
  /** DE: Überschrift (Zone) statt Quest. EN: header (zone) instead of a quest. */
  header?: string;
  questID?: number;
  title?: string;
  level?: number;
  complete?: boolean;
  collapsed?: boolean;
  objectives?: number;
}

export interface FactionEntry {
  factionID: number;
  name: string;
  description?: string;
  /** DE: Absoluter Rufwert. EN: absolute standing value. */
  standing?: number;
  atWar?: boolean;
  header?: boolean;
  parent?: number;
  inactive?: boolean;
  collapsed?: boolean;
}

export interface MacroEntry {
  name: string;
  icon?: string;
  body: string;
  /** DE: Charaktermakro (sonst allgemein). EN: character macro (else general). */
  character?: boolean;
}

export interface CharacterState {
  quests: QuestEntry[];
  /** DE: Abgeschlossene Quest-IDs. EN: completed quest IDs. */
  completed: number[];
  factions: FactionEntry[];
  watchedFaction?: number;
  macros?: MacroEntry[];
  /** DE: Taste → Befehl, z. B. "CTRL-1": "ACTIONBUTTON1". EN: key → command. */
  bindings?: Record<string, string>;
}

// ===== [S2] Beispieldaten · sample data =====

export const DEFAULT_CHARACTER: CharacterState = {
  quests: [
    { header: "Elwynn Forest" },
    { questID: 7, title: "Kobold Camp Cleanup", level: 2, objectives: 1 },
    { questID: 783, title: "A Threat Within", level: 1, complete: true, objectives: 0 },
  ],
  completed: [5, 6, 54],
  factions: [
    { factionID: 469, name: "Alliance", header: true },
    { factionID: 72, name: "Stormwind", description: "The human capital city.", standing: 9500, parent: 469 },
    { factionID: 47, name: "Ironforge", description: "The dwarven capital city.", standing: 1200, parent: 469 },
    { factionID: 0, name: "Other", header: true },
    { factionID: 21, name: "Booty Bay", description: "The neutral port.", standing: -1500, atWar: false },
  ],
  watchedFaction: 72,
  macros: [
    { name: "Shout", icon: "Interface\\Icons\\Ability_Warrior_BattleShout", body: "#showtooltip\n/cast Battle Shout" },
    { name: "Hi", body: "/script DEFAULT_CHAT_FRAME:AddMessage(\"hi\")", character: true },
  ],
  bindings: { "1": "ACTIONBUTTON1", "2": "ACTIONBUTTON2", "CTRL-1": "MULTIACTIONBAR1BUTTON1", "W": "MOVEFORWARD", "UP": "MOVEFORWARD" },
};

// ===== [S3] CHARACTER_API =====

const BANDS: [number, number][] = [[-42000, -6000], [-6000, -3000], [-3000, 0], [0, 3000], [3000, 9000], [9000, 21000], [21000, 42000], [42000, 43000]];

export function reaction(standing: number): { id: number; min: number; max: number } {
  for (let i = BANDS.length - 1; i >= 0; i--) if (standing >= BANDS[i]![0]) return { id: i + 1, min: BANDS[i]![0], max: BANDS[i]![1] };
  return { id: 1, min: BANDS[0]![0], max: BANDS[0]![1] };
}

type Impl = (c: CharacterState, inv: InventoryState, a: unknown[]) => unknown;

function questAt(c: CharacterState, i: unknown): QuestEntry | undefined {
  return typeof i === "number" ? c.quests[i - 1] : undefined;
}

/** DE: Zeilen des sichtbaren Logs (eingeklappte Überschriften verbergen ihre Quests). EN: visible log rows. */
function visibleRows(c: CharacterState): QuestEntry[] {
  const out: QuestEntry[] = [];
  let hidden = false;
  for (const q of c.quests) {
    if (q.header !== undefined) { hidden = q.collapsed === true; out.push(q); } else if (!hidden) out.push(q);
  }
  return out;
}

function factionRow(c: CharacterState, i: unknown): FactionEntry | undefined {
  return typeof i === "number" ? c.factions[i - 1] : undefined;
}

function factionById(c: CharacterState, id: unknown): FactionEntry | undefined {
  return c.factions.find((f) => f.factionID === id && !f.header);
}

/** DE: Die 11 Werte von GetFactionInfo. EN: the 11 values of GetFactionInfo. */
function factionInfo(f: FactionEntry): unknown[] {
  if (f.header) return [f.name, f.description ?? "", 1, 0, 0, 0, false, false, true, f.collapsed === true, false];
  const r = reaction((f.standing ?? 0));
  return [f.name, f.description ?? "", r.id, r.min, r.max, (f.standing ?? 0), f.atWar === true, (f.standing ?? 0) >= -3000, false, undefined, true];
}

function bookSpells(inv: InventoryState): number[] {
  return inv.known.filter((id) => inv.spells[String(id)] !== undefined);
}

export const CHARACTER_API: Record<string, Impl> = {
  // ----- Quests (Vanilla) -----
  GetNumQuestLogEntries: (c) => [visibleRows(c).length, c.quests.filter((q) => q.header === undefined).length],
  GetQuestLogTitle: (c, _i, a) => {
    const q = visibleRows(c)[typeof a[0] === "number" ? a[0] - 1 : -1];
    if (!q) return [undefined, 0, undefined, undefined, undefined, undefined]; // probe: invalid index = defaults
    if (q.header !== undefined) return [q.header, 0, undefined, true, q.collapsed === true, undefined];
    return [q.title, q.level ?? 1, undefined, undefined, undefined, q.complete ? 1 : undefined];
  },
  // ----- Quests (ClassicAPI) -----
  "C_QuestLog.GetQuestIDForLogIndex": (c, _i, a) => { const q = questAt(c, a[0]); return q ? (q.header !== undefined ? 0 : q.questID) : undefined; },
  "C_QuestLog.GetLogIndexForQuestID": (c, _i, a) => { const k = c.quests.findIndex((q) => q.header === undefined && q.questID === a[0]); return k < 0 ? undefined : k + 1; },
  "C_QuestLog.GetHeaderIndexForQuest": (c, _i, a) => {
    const k = c.quests.findIndex((q) => q.header === undefined && q.questID === a[0]);
    if (k < 0) return undefined;
    for (let j = k; j >= 0; j--) if (c.quests[j]!.header !== undefined) return j + 1;
    return undefined;
  },
  "C_QuestLog.GetTitleForQuestID": (c, _i, a) => c.quests.find((q) => q.header === undefined && q.questID === a[0])?.title,
  "C_QuestLog.IsOnQuest": (c, _i, a) => typeof a[0] === "number" && a[0] > 0 && c.quests.some((q) => q.header === undefined && q.questID === a[0]),
  "C_QuestLog.GetNumQuestObjectives": (c, _i, a) => c.quests.find((q) => q.header === undefined && q.questID === a[0])?.objectives,
  "C_QuestLog.IsQuestFlaggedCompleted": (c, _i, a) => typeof a[0] === "number" && c.completed.includes(a[0]),
  __completed_list: (c) => [...c.completed].sort((x, y) => x - y),
  __quest_info: (c, _i, a) => {
    const q = questAt(c, a[0]);
    if (!q) return undefined;
    const header = q.header !== undefined;
    return [header ? q.header : q.title, header ? 0 : q.questID, q.level ?? 0, header, q.collapsed === true, q.complete === true];
  },
  // ----- Ruf · reputation -----
  GetNumFactions: (c) => c.factions.length,
  GetFactionInfo: (c, _i, a) => { const f = factionRow(c, a[0]); return f ? factionInfo(f) : undefined; },
  GetFactionInfoByID: (c, _i, a) => { const f = factionById(c, a[0]); return f ? factionInfo(f) : undefined; },
  GetFactionIDByIndex: (c, _i, a) => { const f = factionRow(c, a[0]); return f ? (f.header ? 0 : f.factionID) : undefined; },
  GetFactionParentID: (c, _i, a) => { const f = c.factions.find((x) => x.factionID === a[0] && x.factionID !== 0); return f ? f.parent ?? 0 : undefined; },
  "C_Reputation.IsFactionActiveByID": (c, _i, a) => { const f = factionById(c, a[0]); return f !== undefined && f.inactive !== true; },
  "C_Reputation.SetFactionInactiveByID": (c, _i, a) => { const f = factionById(c, a[0]); if (f) f.inactive = true; },
  "C_Reputation.SetFactionActiveByID": (c, _i, a) => { const f = factionById(c, a[0]); if (f) f.inactive = false; },
  "C_Reputation.ToggleFactionAtWarByID": (c, _i, a) => { const f = factionById(c, a[0]); if (f && (f.standing ?? 0) >= -3000) f.atWar = !f.atWar; },
  "C_Reputation.SetWatchedFactionByID": (c, _i, a) => { c.watchedFaction = typeof a[0] === "number" && a[0] > 0 ? a[0] : undefined; },
  __faction_data: (c, _i, a) => {
    // a[0] = "id" | "index" | "watched", a[1] = Schlüssel · key
    const f = a[0] === "index" ? factionRow(c, a[1]) : a[0] === "watched" ? factionById(c, c.watchedFaction) : factionById(c, a[1]);
    if (!f) return undefined;
    const r = reaction((f.standing ?? 0));
    return [f.factionID, f.name, f.description ?? "", f.header ? 1 : r.id, f.header ? 0 : r.min, f.header ? 0 : r.max, f.header ? 0 : (f.standing ?? 0),
      f.atWar === true, !f.header && (f.standing ?? 0) >= -3000, f.header === true, f.collapsed === true, f.factionID === c.watchedFaction, !f.header];
  },
  __standings_list: (c) => c.factions.filter((f) => !f.header).flatMap((f) => [f.factionID, (f.standing ?? 0)]),
  // ----- Makros · macros -----
  GetNumMacros: (c) => { const m = c.macros ?? []; return [m.filter((x) => !x.character).length, m.filter((x) => x.character).length]; },
  GetMacroInfo: (c, _i, a) => { const m = typeof a[0] === "number" ? c.macros?.[a[0] - 1] : undefined; return m ? [m.name, m.icon ?? "Interface\\Icons\\INV_Misc_QuestionMark", m.body, m.character === true] : undefined; },
  GetMacroIndexByName: (c, _i, a) => { const k = (c.macros ?? []).findIndex((m) => m.name === a[0]); return k < 0 ? 0 : k + 1; },
  GetMacroBody: (c, _i, a) => {
    const m = typeof a[0] === "number" ? c.macros?.[a[0] - 1] : (c.macros ?? []).find((x) => x.name === a[0]);
    return m?.body;
  },
  GetMacroSpell: (c, inv, a) => {
    const m = typeof a[0] === "number" ? c.macros?.[a[0] - 1] : undefined;
    if (!m) return undefined;
    const line = m.body.split("\n").find((l) => /^\/(cast|castsequence)\s/i.test(l.trim()));
    const mm = line ? /^\/cast(?:sequence)?\s+(?:\[[^\]]*\]\s*)?([^;(]+?)\s*(?:\(Rank (\d+)\))?\s*(?:;.*)?$/i.exec(line.trim()) : null;
    if (!mm) return undefined;
    const name = mm[1]!.toLowerCase();
    let best: { id: number; rank: string; n: number } | undefined;
    for (const id of inv.known) {
      const s = inv.spells[String(id)];
      if (!s || s.name.toLowerCase() !== name) continue;
      const n = Number(/(\d+)/.exec(s.rank ?? "")?.[1] ?? 0);
      if (mm[2] !== undefined ? n === Number(mm[2]) : !best || n > best.n) best = { id, rank: s.rank ?? "", n };
    }
    return best ? [inv.spells[String(best.id)]!.name, best.rank, best.id] : undefined;
  },
  GetRunningMacro: () => undefined,
  GetRunningMacroButton: () => undefined,
  // ----- Tastenbelegung · key bindings -----
  GetBindingByKey: (c, _i, a) => (typeof a[0] === "string" ? c.bindings?.[a[0].toUpperCase()] : undefined),
  GetBindingAction: (c, _i, a) => (typeof a[0] === "string" ? c.bindings?.[a[0].toUpperCase()] ?? "" : ""),
  GetBindingKey: (c, _i, a) => Object.entries(c.bindings ?? {}).filter(([, cmd]) => cmd === a[0]).map(([k]) => k).slice(0, 2),
  GetNumBindings: (c) => new Set(Object.values(c.bindings ?? {})).size,
  GetBinding: (c, _i, a) => {
    const cmds = [...new Set(Object.values(c.bindings ?? {}))];
    const cmd = typeof a[0] === "number" ? cmds[a[0] - 1] : undefined;
    return cmd === undefined ? undefined : [cmd, ...Object.entries(c.bindings ?? {}).filter(([, v]) => v === cmd).map(([k]) => k).slice(0, 2)];
  },
  // ----- Zauberbuch · spellbook -----
  GetNumSpellTabs: (_c, inv) => (bookSpells(inv).length > 0 ? 1 : 0),
  GetSpellTabInfo: (_c, inv, a) => (a[0] === 1 ? ["General", "Interface\\Icons\\INV_Misc_QuestionMark", 0, bookSpells(inv).length] : undefined),
  GetSpellName: (_c, inv, a) => {
    const id = typeof a[0] === "number" && a[1] === "spell" ? bookSpells(inv)[a[0] - 1] : undefined;
    const s = id === undefined ? undefined : inv.spells[String(id)];
    return s ? [s.name, s.rank ?? ""] : undefined;
  },
  GetSpellTexture: (_c, inv, a) => {
    const id = typeof a[0] === "number" && a[1] === "spell" ? bookSpells(inv)[a[0] - 1] : undefined;
    return id === undefined ? undefined : inv.spells[String(id)]?.icon;
  },
  FindSpellBookSlotByID: (_c, inv, a) => { const k = bookSpells(inv).indexOf(a[0] as number); return k < 0 ? undefined : [k + 1, "spell"]; },
  IsPlayerSpell: (_c, inv, a) => typeof a[0] === "number" && inv.known.includes(a[0]),
  "C_SpellBook.GetNumSpellBookSkillLines": (_c, inv) => (bookSpells(inv).length > 0 ? 1 : 0),
  "C_SpellBook.GetSpellLevelLearned": (_c, inv, a) => inv.spells[String(a[0])]?.level ?? 0,
  __book_item: (_c, inv, a) => {
    const id = typeof a[0] === "number" && a[1] === 0 ? bookSpells(inv)[a[0] - 1] : undefined;
    const s = id === undefined ? undefined : inv.spells[String(id)];
    return s && id !== undefined ? [id, s.name, s.rank ?? "", s.icon, s.passive === true] : undefined;
  },
  __book_tab: (_c, inv, a) => (a[0] === 1 ? ["General", "Interface\\Icons\\INV_Misc_QuestionMark", 0, bookSpells(inv).length] : undefined),
};
