/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Rezepte · recipes ......... RECIPES, Zustand · state
 *   [S2] Handwerk · tradeskill ..... TRADESKILL_API
 *   [S3] Verzauberkunst · craft .... CRAFT_API
 *   [S4] Ausbilder · trainer ....... TRAINER_API
 *   [S5] OPENERS_2 ................. öffnet die Fenster · opens the windows
 *
 * DE: Handwerks-, Verzauberungs- und Ausbilderfenster. Alle Namen, Rezepte und Preise sind erfunden.
 *     Fenster sind zu Anfang geschlossen (Abfragen liefern 0/nil wie auf OctoWoW, Probe).
 * EN: tradeskill, craft and trainer windows. All names, recipes and prices are invented. Windows start
 *     closed (queries return 0/nil as on OctoWoW, probe).
 */

import { type Impl, type SimHost, num } from "./host.js";
import { addItem } from "./inventory.js";
import { im } from "./windows1.js";

// ===== [S1] Rezepte · recipes =====

interface Recipe { name: string; icon: string; result: number; made: [number, number]; reagents: { id: number; count: number }[]; level: number; header?: string }
const RECIPES: Recipe[] = [
  { name: "Linen Bandage", icon: "Interface\\Icons\\INV_Misc_Bandage_15", result: 1251, made: [1, 1], reagents: [{ id: 2589, count: 1 }], level: 1 },
  { name: "Heavy Linen Bandage", icon: "Interface\\Icons\\INV_Misc_Bandage_18", result: 2581, made: [1, 1], reagents: [{ id: 2589, count: 2 }], level: 40 },
  { name: "Sample Cloth Bag", icon: "Interface\\Icons\\INV_Misc_Bag_09", result: 4496, made: [1, 1], reagents: [{ id: 2589, count: 6 }], level: 70 },
];
const ensureItems = (h: SimHost): void => {
  const it = h.inventory().items;
  it["1251"] ??= { name: "Linen Bandage", quality: 1, level: 1, type: "Consumable", subType: "Bandage", stack: 20, icon: "Interface\\Icons\\INV_Misc_Bandage_15", sellPrice: 10 };
  it["2581"] ??= { name: "Heavy Linen Bandage", quality: 1, level: 1, type: "Consumable", subType: "Bandage", stack: 20, icon: "Interface\\Icons\\INV_Misc_Bandage_18", sellPrice: 20 };
};
const have = (h: SimHost, id: number): number => { let n = 0; for (const b of Object.values(h.inventory().bags)) for (const s of Object.values(b.slots)) if (s.id === id) n += s.count; return n; };
function take(h: SimHost, id: number, count: number): void {
  let left = count;
  for (const b of Object.values(h.inventory().bags)) for (const [k, s] of Object.entries(b.slots)) { if (s.id !== id || left <= 0) continue; const t = Math.min(left, s.count); s.count -= t; left -= t; if (s.count <= 0) delete b.slots[k]; }
}
const kind = (r: Recipe, skill: number): string => (skill >= r.level + 30 ? "trivial" : skill >= r.level + 15 ? "easy" : skill >= r.level ? "medium" : "optimal");
const avail = (h: SimHost, r: Recipe): number => Math.min(...r.reagents.map((x) => Math.floor(have(h, x.id) / x.count)));

interface Skill { open: boolean; sel: number; rank: number; max: number; name: string }
interface W2 { ts: Skill; craft: Skill; trainer?: { sel: number; services: Service[]; filter: Record<string, boolean>; greeting: string; skillLine: boolean }; }
interface Service { spell: number; name: string; icon: string; cost: number; level: number; state: "available" | "unavailable" | "used"; desc: string }
const w2 = (h: SimHost): W2 => h.store("windows2", (): W2 => ({ ts: { open: false, sel: 0, rank: 1, max: 75, name: "Sample Tailoring" }, craft: { open: false, sel: 0, rank: 1, max: 75, name: "Sample Enchanting" } }));
const rec = (i: unknown): Recipe | undefined => RECIPES[(num(i) ?? 0) - 1];

// ===== [S2] Handwerk · tradeskill =====

export const TRADESKILL_API: Record<string, Impl> = {
  GetNumTradeSkills: (h) => (w2(h).ts.open ? RECIPES.length : 0),
  GetFirstTradeSkill: (h) => (w2(h).ts.open ? 1 : 0),
  GetTradeSkillLine: (h) => { const s = w2(h).ts; return s.open ? [s.name, s.rank, s.max] : ["UNKNOWN", 0, 0]; },
  GetTradeSkillInfo: (h, a) => { const r = rec(a[0]); return r && w2(h).ts.open ? [r.name, kind(r, w2(h).ts.rank), avail(h, r), true] : undefined; },
  GetTradeSkillIcon: (_h, a) => rec(a[0])?.icon,
  GetTradeSkillItemLink: (h, a) => { const r = rec(a[0]); if (!r) return undefined; ensureItems(h); return im(h, r.result).link; },
  GetTradeSkillNumMade: (_h, a) => { const r = rec(a[0]); return r ? r.made : [0, 0]; },
  GetTradeSkillNumReagents: (_h, a) => rec(a[0])?.reagents.length ?? 0,
  GetTradeSkillReagentInfo: (h, a) => { const x = rec(a[0])?.reagents[(num(a[1]) ?? 0) - 1]; if (!x) return undefined; const m = im(h, x.id); return [m.name, m.icon, x.count, have(h, x.id)]; },
  GetTradeSkillReagentItemLink: (h, a) => { const x = rec(a[0])?.reagents[(num(a[1]) ?? 0) - 1]; return x ? im(h, x.id).link : undefined; },
  GetTradeSkillTools: () => undefined,
  GetTradeSkillCooldown: () => undefined,
  GetTradeSkillItemStats: () => [],
  GetTradeSkillSelectionIndex: (h) => w2(h).ts.sel,
  SelectTradeSkill: (h, a) => { const s = w2(h).ts; if (s.open && rec(a[0])) { s.sel = num(a[0]) ?? 0; h.fireIf("TRADE_SKILL_UPDATE"); } },
  GetTradeskillRepeatCount: () => 1,
  GetTradeSkillSubClasses: () => [], GetTradeSkillSubClassFilter: () => false, SetTradeSkillSubClassFilter: () => undefined,
  GetTradeSkillInvSlots: () => [], GetTradeSkillInvSlotFilter: () => false, SetTradeSkillInvSlotFilter: () => undefined,
  CollapseTradeSkillSubClass: () => undefined, ExpandTradeSkillSubClass: () => undefined,
  DoTradeSkill: (h, a) => {
    const s = w2(h).ts; const r = rec(a[0]); if (!s.open || !r) return;
    let n = Math.max(1, num(a[1]) ?? 1); ensureItems(h);
    const step = (): void => {
      if (n <= 0 || avail(h, r) <= 0) { h.fireIf("UNIT_SPELLCAST_STOP", "player"); return; }
      h.fireIf("UNIT_SPELLCAST_START", "player", `Cast-3-0-0-0-0-0000666459`, 0, r.name);
      h.later(2, () => {
        for (const x of r.reagents) take(h, x.id, x.count);
        addItem(h.inventory(), r.result, r.made[0]);
        h.fireIf("BAG_UPDATE", 0); h.fireIf("TRADE_SKILL_UPDATE"); h.fireIf("UNIT_SPELLCAST_SUCCEEDED", "player", `Cast-3-0-0-0-0-0000666459`, 0, r.name);
        n--; step();
      });
    };
    step();
  },
  CloseTradeSkill: (h) => { const s = w2(h).ts; if (s.open) { s.open = false; s.sel = 0; h.fireIf("TRADE_SKILL_CLOSE"); } },
  IsTradeskillTrainer: (h) => w2(h).trainer !== undefined && w2(h).trainer!.skillLine,
  IsTrainerServiceTradeSkill: (h) => w2(h).trainer !== undefined && w2(h).trainer!.skillLine,
};

// ===== [S3] Verzauberkunst · craft =====

export const CRAFT_API: Record<string, Impl> = {
  GetNumCrafts: (h) => (w2(h).craft.open ? RECIPES.length : 0),
  GetCraftDisplaySkillLine: (h) => { const s = w2(h).craft; return s.open ? [s.name, s.rank, s.max] : undefined; },
  GetCraftSkillLine: (h, a) => { void a; const s = w2(h).craft; return s.open ? s.name : undefined; },
  GetCraftInfo: (h, a) => { const r = rec(a[0]); return r && w2(h).craft.open ? [r.name, "", kind(r, w2(h).craft.rank), avail(h, r), true, 0, r.level] : undefined; },
  GetCraftName: (_h, a) => rec(a[0])?.name,
  GetCraftIcon: (_h, a) => rec(a[0])?.icon,
  GetCraftDescription: (_h, a) => { const r = rec(a[0]); return r ? `Creates ${r.name}.` : undefined; },
  GetCraftItemLink: (h, a) => { const r = rec(a[0]); if (!r) return undefined; ensureItems(h); return im(h, r.result).link; },
  GetCraftNumReagents: (_h, a) => rec(a[0])?.reagents.length ?? 0,
  GetCraftReagentInfo: (h, a) => TRADESKILL_API.GetTradeSkillReagentInfo!(h, a),
  GetCraftReagentItemLink: (h, a) => TRADESKILL_API.GetTradeSkillReagentItemLink!(h, a),
  GetCraftSpellFocus: () => undefined,
  GetCraftButtonToken: () => undefined,
  GetCraftSelectionIndex: (h) => w2(h).craft.sel,
  SelectCraft: (h, a) => { const s = w2(h).craft; if (s.open && rec(a[0])) { s.sel = num(a[0]) ?? 0; h.fireIf("CRAFT_UPDATE"); } },
  CollapseCraftSkillLine: () => undefined, ExpandCraftSkillLine: () => undefined,
  DoCraft: (h, a) => {
    const s = w2(h).craft; const r = rec(a[0]); if (!s.open || !r || avail(h, r) <= 0) return; ensureItems(h);
    h.later(2, () => { for (const x of r.reagents) take(h, x.id, x.count); addItem(h.inventory(), r.result, r.made[0]); h.fireIf("BAG_UPDATE", 0); h.fireIf("CRAFT_UPDATE"); });
  },
  CloseCraft: (h) => { const s = w2(h).craft; if (s.open) { s.open = false; s.sel = 0; h.fireIf("CRAFT_CLOSE"); } },
};

// ===== [S4] Ausbilder · trainer =====

const SERVICES: Service[] = [
  { spell: 772, name: "Rend", icon: "Interface\\Icons\\Ability_Gouge", cost: 100, level: 4, state: "available", desc: "Wounds the target, causing it to bleed." },
  { spell: 100, name: "Charge", icon: "Interface\\Icons\\Ability_Warrior_Charge", cost: 100, level: 4, state: "available", desc: "Charges an enemy." },
  { spell: 72, name: "Shield Bash", icon: "Interface\\Icons\\Ability_Warrior_ShieldBash", cost: 3000, level: 12, state: "unavailable", desc: "Bashes the target with a shield." },
  { spell: 78, name: "Heroic Strike", icon: "Interface\\Icons\\Ability_Rogue_Ambush", cost: 10, level: 1, state: "used", desc: "A strong attack that increases melee damage." },
];
const svc = (h: SimHost, i: unknown): Service | undefined => w2(h).trainer?.services[(num(i) ?? 0) - 1];
const visible = (h: SimHost): Service[] => { const t = w2(h).trainer; return t ? t.services.filter((s) => t.filter[s.state] !== false) : []; };

export const TRAINER_API: Record<string, Impl> = {
  GetNumTrainerServices: (h) => visible(h).length,
  GetTrainerGreetingText: (h) => w2(h).trainer?.greeting,
  GetTrainerServiceInfo: (h, a) => { const s = visible(h)[(num(a[0]) ?? 0) - 1]; return s ? [s.name, "", s.state, true] : undefined; },
  GetTrainerServiceCost: (h, a) => { const s = visible(h)[(num(a[0]) ?? 0) - 1]; return s ? [s.cost, 0] : undefined; },
  GetTrainerServiceIcon: (h, a) => visible(h)[(num(a[0]) ?? 0) - 1]?.icon,
  GetTrainerServiceDescription: (h, a) => visible(h)[(num(a[0]) ?? 0) - 1]?.desc,
  GetTrainerServiceLevelReq: (h, a) => visible(h)[(num(a[0]) ?? 0) - 1]?.level,
  GetTrainerServiceSkillLine: () => undefined,
  GetTrainerServiceSkillReq: () => undefined,
  GetTrainerServiceNumAbilityReq: () => 0,
  GetTrainerServiceAbilityReq: () => undefined,
  GetTrainerServiceStepIncrease: () => undefined,
  GetTrainerServiceStepReq: () => undefined,
  IsTrainerServiceSkillStep: () => false,
  GetTrainerServiceTypeFilter: (h, a) => { const t = w2(h).trainer; return t ? t.filter[String(a[0])] !== false : false; },
  SetTrainerServiceTypeFilter: (h, a) => { const t = w2(h).trainer; if (t) { t.filter[String(a[0])] = a[1] === 1 || a[1] === true; h.fireIf("TRAINER_UPDATE"); } },
  GetTrainerSkillLines: () => [],
  GetTrainerSkillLineFilter: () => false,
  SetTrainerSkillLineFilter: () => undefined,
  CollapseTrainerSkillLine: () => undefined, ExpandTrainerSkillLine: () => undefined,
  GetTrainerSelectionIndex: (h) => w2(h).trainer?.sel ?? 0,
  SelectTrainerService: (h, a) => { const t = w2(h).trainer; if (t && visible(h)[(num(a[0]) ?? 0) - 1]) { t.sel = num(a[0]) ?? 0; h.fireIf("TRAINER_UPDATE"); } },
  BuyTrainerService: (h, a) => {
    const s = visible(h)[(num(a[0]) ?? 0) - 1]; if (!s) return;
    const inv = h.inventory(); const lvl = h.scenario.player.level ?? 1;
    if (s.state !== "available") { h.fireIf("UI_ERROR_MESSAGE", "You cannot learn that yet"); return; }
    if ((inv.money ?? 0) < s.cost || lvl < s.level) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    inv.money = (inv.money ?? 0) - s.cost;
    inv.spells[String(s.spell)] ??= { name: s.name, rank: "Rank 1", icon: s.icon, castTime: 0, cost: 0, powerType: 1, harmful: true, level: s.level, description: s.desc };
    if (!inv.known.includes(s.spell)) inv.known.push(s.spell);
    s.state = "used";
    h.fireIf("PLAYER_MONEY"); h.fireIf("SPELLS_CHANGED"); h.fireIf("LEARNED_SPELL_IN_TAB"); h.fireIf("TRAINER_UPDATE");
  },
  CloseTrainer: (h) => { const w = w2(h); if (w.trainer) { delete w.trainer; h.fireIf("TRAINER_CLOSED"); } },
};

// ===== [S5] OPENERS_2 =====

export const OPENERS_2: Record<string, (h: SimHost) => void> = {
  tradeskill: (h) => { ensureItems(h); const s = w2(h).ts; s.open = true; s.sel = 1; h.fireIf("TRADE_SKILL_SHOW"); h.fireIf("TRADE_SKILL_UPDATE"); },
  craft: (h) => { ensureItems(h); const s = w2(h).craft; s.open = true; s.sel = 1; h.fireIf("CRAFT_SHOW"); h.fireIf("CRAFT_UPDATE"); },
  trainer: (h) => {
    w2(h).trainer = { sel: 0, services: SERVICES.map((s) => ({ ...s, state: h.inventory().known.includes(s.spell) ? "used" : s.state })), filter: { available: true, unavailable: true, used: true }, greeting: "Greetings. Are you ready to learn?", skillLine: false };
    h.fireIf("TRAINER_SHOW"); h.fireIf("TRAINER_UPDATE");
  },
};
