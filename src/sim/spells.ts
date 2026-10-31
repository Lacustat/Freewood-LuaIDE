/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Zustand · state ......... SpellState (Abklingzeiten, laufender Zauber, Zielauswahl)
 *   [S2] Auflösen · resolving .... resolveSpell, bookSlot, school names
 *   [S3] Wirken · casting ........ cast, finishCast, interrupt, applyAura
 *   [S4] SPELLS_API .............. C_Spell.*, C_SpellBook.*, CastSpell*, GetSpellCooldown, Formen, Auren-Aufrufe
 *
 * DE: Zauber-Simulation mit echter Zeit: Zauberzeit, Kanalisierung, globale Abklingzeit (1,5 s), eigene
 *     Abklingzeit, Ressourcenkosten, Reichweite und Aura beim Gelingen. Die Zeit läuft über `later` (Host-Zeitgeber),
 *     d. h. `sim.advance(...)` lässt Zauber ablaufen. Was ein Zauber sonst bewirkt (Schaden, Heilung), bleibt
 *     unsimuliert. Die Ereignisreihenfolge (SPELLCAST_START/STOP …) folgt dem Wissen über 1.12 und ist im Spiel
 *     zu bestätigen („unverified“).
 * EN: spell simulation with real time: cast time, channels, global cooldown (1.5 s), own cooldown, power cost, range
 *     and an aura on success. Time runs on `later` (host timer), so `sim.advance(...)` lets casts finish. Other
 *     effects (damage, healing) are not simulated. The event order (SPELLCAST_START/STOP …) follows 1.12 knowledge
 *     and is to be confirmed in game ("unverified").
 */

import { num, round, str, type Impl, type SimHost } from "./host.js";
import type { SpellData } from "./inventory.js";
import type { AuraEntry } from "./auras.js";
import { primaryPower } from "./units.js";

// ===== [S1] Zustand · state =====

interface CastInfo { spellID: number; name: string; unit: string; target?: string; start: number; end: number; channel: boolean; timer: { cancel(): void }; }
interface SpellState {
  cooldowns: Map<number, { start: number; duration: number }>;
  gcd?: { start: number; duration: number };
  cast?: CastInfo;
  targeting?: number;
  forms: { name: string; icon: string; spellID: number }[];
  form: number;
  autoRepeat?: number;
  fallback: boolean;
}
const st = (h: SimHost): SpellState => h.store("spells", () => ({ cooldowns: new Map(), forms: [], form: 0, fallback: false }));

// ===== [S2] Auflösen · resolving =====

const SCHOOLS = ["Physical", "Holy", "Fire", "Nature", "Frost", "Shadow", "Arcane"];
const MECHANICS = ["", "Charmed", "Disoriented", "Disarmed", "Distracted", "Fleeing", "Gripped", "Rooted", "Pacified", "Silenced", "Asleep", "Snared", "Stunned", "Frozen", "Incapacitated", "Bleeding", "Healing", "Polymorphed", "Banished", "Shielded", "Shackled", "Mounted", "Seduced", "Turned", "Horrified", "Invulnerable", "Interrupted", "Dazed", "Discovery", "Invulnerable", "Sapped", "Enraged"];
const POWER_TOKENS = ["MANA", "RAGE", "FOCUS", "ENERGY", "HAPPINESS"];
const POWER_EVENT = ["UNIT_MANA", "UNIT_RAGE", "UNIT_FOCUS", "UNIT_ENERGY", "UNIT_HAPPINESS"];

export interface SpellRef { id: number; sp: SpellData }

/** DE: Zauber aus ID, Link, Name („Fireball“, „Fireball(Rank 1)“). EN: spell from ID, link or name. */
export function resolveSpell(h: SimHost, v: unknown, knownOnly = false): SpellRef | undefined {
  const inv = h.inventory();
  const ok = (id: number): boolean => !knownOnly || inv.known.includes(id);
  if (typeof v === "number") { const sp = inv.spells[String(Math.floor(v))]; return sp && ok(v) ? { id: Math.floor(v), sp } : undefined; }
  if (typeof v !== "string") return undefined;
  const link = /spell:(\d+)/.exec(v);
  if (link) { const id = Number(link[1]); const sp = inv.spells[String(id)]; return sp && ok(id) ? { id, sp } : undefined; }
  const m = /^\s*(.*?)\s*(?:\(\s*(.+?)\s*\))?\s*$/.exec(v);
  const name = (m?.[1] ?? v).toLowerCase(); const rank = m?.[2]?.toLowerCase();
  let best: SpellRef | undefined;
  for (const [k, sp] of Object.entries(inv.spells)) {
    const id = Number(k);
    if (sp.name.toLowerCase() !== name || !ok(id)) continue;
    if (rank !== undefined && (sp.rank ?? "").toLowerCase() !== rank) continue;
    if (!best || (sp.level ?? 0) >= (best.sp.level ?? 0)) best = { id, sp };
  }
  return best;
}

const bookIds = (h: SimHost): number[] => h.inventory().known.filter((id) => h.inventory().spells[String(id)] !== undefined);
export const bookSpell = (h: SimHost, slot: unknown): SpellRef | undefined => { const id = typeof slot === "number" ? bookIds(h)[slot - 1] : undefined; return id === undefined ? undefined : { id, sp: h.inventory().spells[String(id)]! }; };
/** DE: Zauber aus (Zauber|Platz, Buchtyp). EN: spell from (spell|slot, bookType). */
const spellArg = (h: SimHost, a: unknown[]): SpellRef | undefined => (typeof a[1] === "string" && /^(spell|pet)$/i.test(a[1]) ? bookSpell(h, a[0]) : resolveSpell(h, a[0]));
const player = (h: SimHost) => h.unit("player");
const gt = (h: SimHost): number => h.baseTime + h.now;
const harmful = (sp: SpellData): boolean => sp.harmful === true;

// ===== [S3] Wirken · casting =====

function cooldownOf(h: SimHost, id: number, sp: SpellData): { start: number; duration: number; gcd: boolean } {
  const s = st(h); const c = s.cooldowns.get(id);
  if (c && c.start + c.duration > h.now + 1e-9) return { start: h.baseTime + c.start, duration: c.duration, gcd: false };
  if (!sp.noGcd && s.gcd && s.gcd.start + s.gcd.duration > h.now + 1e-9) return { start: h.baseTime + s.gcd.start, duration: s.gcd.duration, gcd: true };
  return { start: 0, duration: 0, gcd: false };
}

function usable(h: SimHost, sp: SpellData): [boolean, boolean] {
  const u = player(h); const cost = sp.cost ?? 0;
  const noMana = !!u && cost > 0 && (u.power ?? 0) < cost && (sp.powerType ?? primaryPower(u)) === primaryPower(u);
  return [!noMana && (sp.level ?? 1) <= (u?.level ?? 1), noMana];
}

function distance(h: SimHost, unit: string): number | undefined {
  const a = player(h); const b = h.unit(unit);
  if (!a || !b || a.x === undefined || b.x === undefined) return undefined;
  return Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), (a.z ?? 0) - (b.z ?? 0));
}

export function applyAura(h: SimHost, id: number, sp: SpellData, target: string): void {
  if (!sp.aura) return;
  const u = h.unit(sp.aura.onSelf ? "player" : target); if (!u) return;
  const list = (u.auras ??= []);
  const prev = list.findIndex((a) => a.spellId === id);
  const entry: AuraEntry = { spellId: id, helpful: sp.aura.helpful, duration: sp.aura.duration, remaining: h.now + sp.aura.duration, source: "player", ...(sp.aura.dispelName ? { dispelName: sp.aura.dispelName } : {}) };
  if (prev >= 0) list[prev] = entry; else list.push(entry);
  const tok = sp.aura.onSelf ? "player" : target;
  h.fireIf("PLAYER_AURAS_CHANGED"); h.fireIf("UNIT_AURA", tok);
}

function fail(h: SimHost, spellName: string, why: string): void {
  h.fireIf("UI_ERROR_MESSAGE", why);
  h.fireIf("SPELLCAST_FAILED", spellName);
  h.note("info", `Cast of ${spellName} failed: ${why}`);
}

function finish(h: SimHost, info: CastInfo): void {
  const s = st(h); const sp = h.inventory().spells[String(info.spellID)]; if (!sp) return;
  delete s.cast;
  const u = player(h);
  if (u && (sp.cost ?? 0) > 0 && !info.channel && (sp.powerType ?? primaryPower(u)) === primaryPower(u)) {
    u.power = Math.max(0, (u.power ?? 0) - (sp.cost ?? 0));
    h.fireIf(POWER_EVENT[sp.powerType ?? primaryPower(u)] ?? "UNIT_MANA", "player");
  }
  if (sp.cooldown && sp.cooldown > 0) s.cooldowns.set(info.spellID, { start: h.now, duration: sp.cooldown / 1000 });
  if (!sp.noGcd) s.gcd = { start: info.start - h.baseTime, duration: 1.5 };
  if (sp.nextMelee) h.note("info", `${sp.name} queued for the next melee swing (the damage is not simulated).`);
  applyAura(h, info.spellID, sp, info.target ?? "target");
  h.fireIf(info.channel ? "SPELLCAST_CHANNEL_STOP" : "SPELLCAST_STOP", sp.name);
  h.fireIf("UNIT_SPELLCAST_SUCCEEDED", "player", sp.name);
  h.note("info", `Cast of ${sp.name} finished (the effect is not simulated).`);
}

export function interruptCast(h: SimHost, why = "Interrupted"): boolean {
  const s = st(h); const c = s.cast; if (!c) return false;
  c.timer.cancel(); delete s.cast;
  h.fireIf(c.channel ? "SPELLCAST_CHANNEL_STOP" : "SPELLCAST_INTERRUPTED", c.name);
  h.fireIf("UNIT_SPELLCAST_INTERRUPTED", "player", c.name);
  h.note("info", `Cast of ${c.name} stopped: ${why}`);
  return true;
}

export function castSpell(h: SimHost, ref: SpellRef, target?: string): boolean {
  const s = st(h); const { id, sp } = ref;
  if (!h.inventory().known.includes(id)) { fail(h, sp.name, "Spell not learned"); return false; }
  if (sp.passive) { fail(h, sp.name, "Passive spell"); return false; }
  if (s.cast) { fail(h, sp.name, "Another action is in progress"); return false; }
  const cd = cooldownOf(h, id, sp);
  if (cd.duration > 0) { fail(h, sp.name, cd.gcd ? "Not ready yet" : "Spell is not ready yet"); return false; }
  const [okUse, noMana] = usable(h, sp);
  if (!okUse) { fail(h, sp.name, noMana ? "Not enough power" : "Cannot cast that yet"); return false; }
  const tok = target ?? (sp.helpful === true && !harmful(sp) ? "player" : "target");
  if (harmful(sp) && !sp.autoAttack && (sp.maxRange ?? 0) > 0) {
    const t = h.unit(tok);
    if (!t) { fail(h, sp.name, "You have no target"); return false; }
    const d = distance(h, tok);
    if (d !== undefined && d > (sp.maxRange ?? 0)) { fail(h, sp.name, "Out of range"); return false; }
  }
  const castMs = sp.castTime ?? 0; const channelMs = sp.channel ?? 0; const start = gt(h);
  if (sp.autoAttack) { s.autoRepeat = id; h.fireIf("PLAYER_ENTER_COMBAT"); return true; }
  if (castMs <= 0 && channelMs <= 0) {
    const info: CastInfo = { spellID: id, name: sp.name, unit: "player", target: tok, start, end: start, channel: false, timer: { cancel: () => undefined } };
    h.fireIf("SPELLCAST_START", sp.name, 0);
    finish(h, info);
    return true;
  }
  const dur = (channelMs > 0 ? channelMs : castMs) / 1000;
  const info: CastInfo = { spellID: id, name: sp.name, unit: "player", target: tok, start, end: start + dur, channel: channelMs > 0, timer: { cancel: () => undefined } };
  info.timer = h.later(dur, () => finish(h, info));
  s.cast = info;
  if (info.channel) h.fireIf("SPELLCAST_CHANNEL_START", channelMs, sp.name); else h.fireIf("SPELLCAST_START", sp.name, castMs);
  h.fireIf("UNIT_SPELLCAST_START", "player", sp.name);
  return true;
}

// ===== [S4] SPELLS_API =====

const sp1 = (f: (h: SimHost, r: SpellRef) => unknown): Impl => (h, a) => { const r = resolveSpell(h, a[0]); return r ? f(h, r) : undefined; };
const lootCount = (h: SimHost, id: number): number => { let n = 0; for (const b of Object.values(h.inventory().bags)) for (const x of Object.values(b.slots)) if (x.id === id) n += x.count; return n; };
const learnedSkillLines: Record<number, string> = { 26: "Arms", 8: "Fire", 6: "Frost", 134: "General" };

export const SPELLS_API: Record<string, Impl> = {
  // ----- Wirken · casting -----
  CastSpell: (h, a) => { const r = bookSpell(h, a[0]); if (r) castSpell(h, r); },
  CastSpellByName: (h, a) => { const r = resolveSpell(h, a[0], true); if (!r) { h.fireIf("UI_ERROR_MESSAGE", "Spell not learned"); h.note("info", `CastSpellByName: ${String(a[0])} is not a known spell.`); return; } castSpell(h, r, a[1] === true ? "player" : typeof a[1] === "string" ? a[1] : undefined); },
  CastSpellByID: (h, a) => { const r = resolveSpell(h, a[0]); if (r) castSpell(h, r, typeof a[1] === "string" ? a[1] : undefined); },
  CastSpellNoToggle: (h, a) => { const r = resolveSpell(h, a[0], true); if (!r || st(h).autoRepeat === r.id) return; castSpell(h, r, typeof a[1] === "string" ? a[1] : undefined); },
  "C_Spell.CastAtUnit": (h, a) => { const r = resolveSpell(h, a[0], true); if (r && typeof a[1] === "string") castSpell(h, r, a[1]); },
  "C_Spell.CastAtCursor": (h, a) => { const r = resolveSpell(h, a[0], true); if (r) castSpell(h, r, "player"); },
  SpellStopCasting: (h) => { interruptCast(h, "stopped by SpellStopCasting"); },
  SpellStopTargeting: (h) => { delete st(h).targeting; },
  SpellIsTargeting: (h) => st(h).targeting !== undefined,
  SpellTargetUnit: (h, a) => { const s = st(h); if (s.targeting !== undefined) { const r = resolveSpell(h, s.targeting); delete s.targeting; if (r && typeof a[0] === "string") castSpell(h, r, a[0]); } },
  SpellCanTargetUnit: (h, a) => { const s = st(h); const r = s.targeting !== undefined ? resolveSpell(h, s.targeting) : undefined; const u = h.unit(a[0]); return !!u && (!r || !harmful(r.sp) || !u.friendly); },
  IsCurrentCast: (h, a) => { const c = st(h).cast; return !!c && (a[0] === undefined || resolveSpell(h, a[0])?.id === c.spellID); },
  "C_Spell.IsCurrentSpell": (h, a) => { const r = resolveSpell(h, a[0]); const s = st(h); return !!r && (s.cast?.spellID === r.id || s.autoRepeat === r.id); },
  IsAutoRepeatSpell: (h, a) => { const r = spellArg(h, a); return !!r && st(h).autoRepeat === r.id; },
  IsAttackSpell: (h, a) => spellArg(h, a)?.id === 6603,
  "C_Spell.CancelSpellByID": (h, a) => { const r = resolveSpell(h, a[0]); const u = player(h); if (!r || !u?.auras) return; const k = u.auras.findIndex((x) => x.spellId === r.id); if (k >= 0) { u.auras.splice(k, 1); h.fireIf("PLAYER_AURAS_CHANGED"); } },
  CancelSpellByName: (h, a) => { const r = resolveSpell(h, a[0]); if (r) SPELLS_API["C_Spell.CancelSpellByID"]!(h, [r.id]); },
  "C_Spell.CancelSpellByName": (h, a) => SPELLS_API.CancelSpellByName!(h, a),
  CancelUnitBuff: (h, a) => {
    if (a[0] !== "player" || typeof a[1] !== "number") return;
    const u = player(h); const buffs = (u?.auras ?? []).filter((x) => x.helpful); const x = buffs[a[1] - 1];
    if (u?.auras && x) { u.auras.splice(u.auras.indexOf(x), 1); h.fireIf("PLAYER_AURAS_CHANGED"); }
  },
  CancelPlayerBuff: (h, a) => { if (typeof a[0] === "number") SPELLS_API.CancelUnitBuff!(h, ["player", a[0] + 1]); },
  UpdateSpells: () => undefined, ToggleSpellBook: () => undefined,
  // ----- Zeit, Kosten, Zustand · time, cost, state -----
  GetSpellCooldown: (h, a) => {
    const r = spellArg(h, a); if (!r) return undefined;
    const c = cooldownOf(h, r.id, r.sp); return [c.start, c.duration, 1];
  },
  "C_Spell.GetSpellCooldown": sp1((h, r) => { const c = cooldownOf(h, r.id, r.sp); return [{ startTime: c.start, duration: c.duration, isEnabled: true, modRate: 1, isOnGCD: c.gcd }]; }),
  GetSpellInfo: (h, a) => { const r = spellArg(h, a) ?? (typeof a[0] === "string" ? resolveSpell(h, a[0], true) : undefined); return r ? [r.sp.name, r.sp.rank ?? "", r.sp.icon, r.sp.cost ?? 0, false, r.sp.powerType ?? 0, r.sp.castTime ?? 0, r.sp.minRange ?? 0, r.sp.maxRange ?? 0, r.id] : undefined; },
  GetSpellLink: (h, a) => { const r = spellArg(h, a); return r ? [`|cff71d5ff|Hspell:${r.id}:0|h[${r.sp.name}]|h|r`, r.id] : undefined; },
  GetSpellBaseCooldown: sp1((_h, r) => r.sp.cooldown ?? 0),
  "C_Spell.GetSpellLossOfControlCooldown": sp1(() => [0, 0]),
  "C_Spell.GetSpellPowerCost": sp1((h, r) => {
    const cost = r.sp.cost ?? 0; if (cost <= 0) return undefined;
    const type = r.sp.powerType ?? 0; void h;
    return [[{ type, name: POWER_TOKENS[type] ?? "MANA", cost, minCost: cost, costPercent: 0, costPerSec: 0, requiredAuraID: 0, hasRequiredAura: false }]];
  }),
  "C_Spell.GetSpellCastCount": sp1((h, r) => (r.sp.reagents?.length ? Math.min(...r.sp.reagents.map((g) => Math.floor(lootCount(h, g.itemID) / g.count))) : 0)),
  "C_Spell.GetSpellReagents": sp1((_h, r) => [r.sp.reagents ?? []]),
  "C_Spell.IsSpellUsable": sp1((h, r) => { const [u, nm] = usable(h, r.sp); return [u, nm]; }),
  IsUsableSpell: (h, a) => { const r = spellArg(h, a); if (!r) return undefined; const [u, nm] = usable(h, r.sp); return [u ? 1 : undefined, nm ? 1 : undefined]; },
  "C_Spell.IsSpellInRange": (h, a) => {
    const r = resolveSpell(h, a[0]); if (!r || (r.sp.maxRange ?? 0) <= 0 || typeof a[1] !== "string") return undefined;
    const d = distance(h, a[1]); return d === undefined ? undefined : d <= (r.sp.maxRange ?? 0);
  },
  "C_Spell.SpellHasRange": sp1((_h, r) => (r.sp.minRange ?? 0) > 0 || (r.sp.maxRange ?? 0) > 0),
  SpellHasRange: (h, a) => { const r = spellArg(h, a); return !!r && ((r.sp.minRange ?? 0) > 0 || (r.sp.maxRange ?? 0) > 0); },
  // ----- Eigenschaften · properties -----
  "C_Spell.IsSpellDataCached": (h, a) => resolveSpell(h, a[0]) !== undefined,
  "C_Spell.RequestLoadSpellData": (h, a) => { const r = resolveSpell(h, a[0]); const id = r?.id ?? (typeof a[0] === "number" ? a[0] : 0); h.fireIf("SPELL_DATA_LOAD_RESULT", id, r ? 1 : 0); },
  "C_Spell.GetSchoolString": (_h, a) => { const m = num(a[0]); if (m === undefined || m <= 0) return undefined; const i = Math.round(Math.log2(m)); return Number.isInteger(Math.log2(m)) ? SCHOOLS[i] : undefined; },
  GetSpellSchool: sp1((_h, r) => [(r.sp.school ?? 0) + 1, SCHOOLS[r.sp.school ?? 0]]),
  "C_Spell.GetSpellDescription": sp1((_h, r) => r.sp.description ?? ""),
  "C_Spell.GetSpellDescriptionForItemLocation": (h, a) => { if (typeof a[1] !== "object" && typeof a[1] !== "string") throw new Error("Usage: C_Spell.GetSpellDescriptionForItemLocation(spellIdentifier, itemLocation)"); return SPELLS_API["C_Spell.GetSpellDescription"]!(h, [a[0]]); },
  "C_Spell.GetSpellSubtext": sp1((_h, r) => r.sp.passive ? "Passive" : r.sp.rank ?? ""),
  "C_Spell.GetSpellMechanicByID": sp1((_h, r) => (r.sp.mechanic ? [r.sp.mechanic, MECHANICS[r.sp.mechanic]] : undefined)),
  "C_Spell.GetSpellEffectMechanics": sp1((_h, r) => [[r.sp.mechanic ?? 0, 0, 0]]),
  "C_Spell.GetSpellDispelType": (h, a) => resolveSpell(h, a[0])?.sp.dispel ?? 0,
  "C_Spell.GetSpellRadius": sp1((_h, r) => (r.sp.radius ? [r.sp.radius, r.sp.radius] : undefined)),
  GetSpellRadius: (h, a) => { const r = spellArg(h, a); return r?.sp.radius ? [r.sp.radius, r.sp.radius] : undefined; },
  "C_Spell.GetSpellEffectInfo": sp1((_h, r) => [[{ effect: r.sp.aura ? 6 : 2, auraName: r.sp.aura ? 29 : 0, basePoints: 0, baseDice: 1, dieSides: 1, pointsPerLevel: 0, dicePerLevel: 0, miscValue: 0 }, { effect: 0, auraName: 0, basePoints: 0, baseDice: 0, dieSides: 0, pointsPerLevel: 0, dicePerLevel: 0, miscValue: 0 }, { effect: 0, auraName: 0, basePoints: 0, baseDice: 0, dieSides: 0, pointsPerLevel: 0, dicePerLevel: 0, miscValue: 0 }]]),
  "C_Spell.GetSpellLevelInfo": sp1((_h, r) => [r.sp.level ?? 1, r.sp.level ?? 1, 0]),
  "C_Spell.GetSpellRequiredTargetLevel": sp1((_h, r) => Math.max(0, (r.sp.level ?? 1) - 4)),
  GetSpellRequiredTargetLevel: sp1((_h, r) => Math.max(0, (r.sp.level ?? 1) - 4)),
  "C_Spell.IsAutoAttackSpell": (_h, a) => a[0] === 6603,
  "C_Spell.IsRangedAutoAttackSpell": (_h, a) => a[0] === 75 || a[0] === 5019,
  "C_Spell.IsNextMeleeSpell": sp1((_h, r) => r.sp.nextMelee === true),
  "C_Spell.ResetsMeleeSwing": sp1((_h, r) => r.sp.resetsSwing === true),
  "C_Spell.IsSelfBuff": sp1((_h, r) => r.sp.aura?.onSelf === true || (r.sp.helpful === true && (r.sp.maxRange ?? 0) === 0)),
  "C_Spell.IsSpellHarmful": sp1((_h, r) => harmful(r.sp)),
  "C_Spell.IsSpellHelpful": sp1((_h, r) => r.sp.helpful === true),
  "C_Spell.IsSpellPassive": sp1((_h, r) => r.sp.passive === true),
  IsHarmfulSpell: (h, a) => { const r = spellArg(h, a); return r ? harmful(r.sp) : undefined; },
  IsHelpfulSpell: (h, a) => { const r = spellArg(h, a); return r ? r.sp.helpful === true : undefined; },
  IsPassiveSpell: (h, a) => { const r = spellArg(h, a); return r ? r.sp.passive === true : undefined; },
  IsSpellPassive: (h, a) => { const r = spellArg(h, a); return r ? r.sp.passive === true : undefined; },
  IsConsumableSpell: (h, a) => { const r = spellArg(h, a); return r ? (r.sp.reagents?.length ?? 0) > 0 : undefined; },
  "C_Spell.CastingInfo": (h) => SPELLS_API["C_Spell.UnitCastingInfo"]!(h, ["player"]),
  "C_Spell.ChannelInfo": (h) => SPELLS_API["C_Spell.UnitChannelInfo"]!(h, ["player"]),
  "C_Spell.UnitCastingInfo": (h, a) => { const c = a[0] === "player" ? st(h).cast : undefined; if (!c || c.channel) return undefined; const sp = h.inventory().spells[String(c.spellID)]; return [c.name, c.name, sp?.icon, round(c.start * 1000, 0), round(c.end * 1000, 0), false, undefined, false, c.spellID, undefined, 0]; },
  "C_Spell.UnitChannelInfo": (h, a) => { const c = a[0] === "player" ? st(h).cast : undefined; if (!c || !c.channel) return undefined; const sp = h.inventory().spells[String(c.spellID)]; return [c.name, c.name, sp?.icon, round(c.start * 1000, 0), round(c.end * 1000, 0), false, false, c.spellID, 0]; },
  GetSpellBonusDamage: (_h, a) => { const n = num(a[0]); if (n === undefined || n < 1 || n > 7) throw new Error("Usage: GetSpellBonusDamage(school)"); return 0; },
  GetSpellBonusHealing: () => 0,
  GetCritChance: () => 5.0, GetRangedCritChance: () => 5.0,
  UnitSpellHaste: (h, a) => (h.unit(a[0]) ? 0 : undefined),
  UnitSpellTargetName: (h, a) => { const c = a[0] === "player" ? st(h).cast : undefined; return c?.target ? h.unit(c.target)?.name : undefined; },
  UnitCreatedBySpell: () => undefined,
  CanDualWield: (h) => player(h)?.classToken === "WARRIOR" || player(h)?.classToken === "ROGUE",
  PlayerHasSpells: (h) => h.inventory().known.length > 0,
  IsTrainerServiceLearnSpell: () => false,
  // ----- Gestaltwechsel · shapeshift forms -----
  GetNumShapeshiftForms: (h) => st(h).forms.length,
  GetShapeshiftFormInfo: (h, a) => { const f = st(h).forms[(num(a[0]) ?? 0) - 1]; return f ? [f.icon, f.name, st(h).form === (num(a[0]) ?? 0), true] : undefined; },
  GetShapeshiftFormCooldown: () => [0, 0, 1],
  GetShapeshiftForm: (h) => st(h).form,
  GetShapeshiftFormID: (h) => (st(h).form > 0 ? st(h).form : undefined),
  CastShapeshiftForm: (h, a) => { const s = st(h); const i = num(a[0]) ?? 0; if (!s.forms[i - 1]) return; s.form = s.form === i ? 0 : i; h.fireIf("UPDATE_SHAPESHIFT_FORM"); },
  CancelShapeshiftForm: (h) => { const s = st(h); if (s.form) { s.form = 0; h.fireIf("UPDATE_SHAPESHIFT_FORM"); } },
  // ----- Zauberbuch (ClassicAPI) · spellbook -----
  "C_SpellBook.GetSpellLevelLearned": (h, a) => h.inventory().spells[String(a[0])]?.level ?? 0,
  "C_SpellBook.GetCurrentLevelSpells": (h, a) => { const lvl = num(a[0]) ?? player(h)?.level ?? 1; return [Object.entries(h.inventory().spells).filter(([, s]) => (s.level ?? 1) === lvl).map(([k]) => Number(k))]; },
  "C_SpellBook.GetPlayerSpellsByAura": (h, a) => [bookIds(h).filter((id) => a[0] === 29 && h.inventory().spells[String(id)]?.aura !== undefined).sort((x, y) => x - y)],
  "C_SpellBook.ContainsAnyDisenchantSpell": (h) => bookIds(h).some((id) => /disenchant/i.test(h.inventory().spells[String(id)]?.name ?? "")),
  "C_SpellBook.GetNumSpellBookSkillLines": () => 1,
  "C_SpellBook.GetSkillLineIndexByID": () => undefined,
  "C_SpellBook.GetSkillLineName": (_h, a) => (typeof a[0] === "number" ? learnedSkillLines[a[0]] : undefined),
  "C_SpellBook.GetSkillLineRank": (_h, a) => (a[0] === 134 ? [300, 300, 0] : undefined),
  "C_SpellBook.GetSpellSkillLine": (_h, a) => { const id = typeof a[0] === "number" ? a[0] : 0; void id; return undefined; },
  "C_SpellBook.GetSpellBookItemSkillLineIndex": (h, a) => (bookSpell(h, a[0]) ? 1 : undefined),
  "C_SpellBook.GetSpellBookItemCastCount": (h, a) => { const r = bookSpell(h, a[0]); return r ? SPELLS_API["C_Spell.GetSpellCastCount"]!(h, [r.id]) : 0; },
  "C_SpellBook.GetSpellBookItemLossOfControlCooldownInfo": (h, a) => (bookSpell(h, a[0]) ? [{ startTime: 0, duration: 0, modRate: 1, isEnabled: true }] : undefined),
  "C_SpellBook.GetSpellBookItemLossOfControlCooldownDuration": (h, a) => (bookSpell(h, a[0]) ? 0 : undefined),
  "C_SpellBook.IsAutoAttackSpellBookItem": (h, a) => bookSpell(h, a[0])?.id === 6603,
  "C_SpellBook.IsRangedAutoAttackSpellBookItem": (h, a) => { const r = bookSpell(h, a[0]); return r?.id === 75 || r?.id === 5019; },
  "C_SpellBook.IsClassTalentSpellBookItem": () => false,
};
void str;
