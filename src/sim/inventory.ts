/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Datentypen · data types ..... ItemData, BagData, SpellData, InventoryState
 *   [S2] Beispieldaten · sample data . DEFAULT_INVENTORY (Sandbox, keine echten Serverdaten)
 *   [S3] Abfragen · queries .......... Gegenstand/Tasche/Zauber nachschlagen
 *   [S4] API-Funktionen · API impls .. Rückgaben als primitive Werte (Tabellen baut das Lua-Prelude)
 *
 * DE: Zustand für Gegenstände, Taschen und Zauber im Szenario. Die Werte sind erfundene Beispieldaten
 *     und frei änderbar; die Rückgabeformen folgen der Vanilla-API und der ClassicAPI-Dokumentation.
 * EN: item, bag and spell state of the scenario. Values are made-up sample data and freely editable;
 *     return shapes follow the Vanilla API and the ClassicAPI docs.
 */

// ===== [S1] Datentypen · data types =====

export interface ItemData {
  name: string;
  quality: number;
  level?: number;
  minLevel?: number;
  type?: string;
  subType?: string;
  classID?: number;
  subclassID?: number;
  stack?: number;
  equipLoc?: string;
  icon?: string;
  sellPrice?: number;
  bindType?: number;
  /** DE: Werte wie "ITEM_MOD_STAMINA_SHORT". EN: stats like "ITEM_MOD_STAMINA_SHORT". */
  stats?: Record<string, number>;
  /** DE: Haltbarkeit (aktuell/maximal) beim Anlegen. EN: durability (current/max) when equipped. */
  durability?: [number, number];
  spellID?: number;
  /** DE: 1 = einzigartig, n = höchstens n. EN: 1 = unique, n = at most n. */
  unique?: number;
  setID?: number;
  /** DE: Zeichen ("Use:"-Gegenstände) oder nutzbar. EN: usable on its own (potions, food). */
  usable?: boolean;
}

export interface BagSlot { id: number; count: number }

export interface BagData {
  /** DE: Anzahl Plätze. EN: number of slots. */
  size: number;
  /** DE: Gegenstand der Tasche selbst (nicht beim Rucksack). EN: the bag item itself (not for the backpack). */
  itemID?: number;
  /** DE: Taschenfamilie (0 = allgemein). EN: bag family (0 = general). */
  family?: number;
  /** DE: Belegte Plätze, 1-basiert. EN: filled slots, 1-based. */
  slots: Record<string, BagSlot>;
}

export interface SpellData {
  name: string;
  rank?: string;
  icon?: string;
  castTime?: number;
  minRange?: number;
  maxRange?: number;
  cost?: number;
  powerType?: number;
  passive?: boolean;
  /** DE: Stufe, ab der man den Zauber lernt. EN: level at which the spell is learned. */
  level?: number;
  /** DE: Schule 0 Körperlich, 1 Heilig, 2 Feuer, 3 Natur, 4 Frost, 5 Schatten, 6 Arkan. EN: school 0 physical … 6 arcane. */
  school?: number;
  harmful?: boolean;
  helpful?: boolean;
  /** DE: 1 Magie, 2 Fluch, 3 Krankheit, 4 Gift. EN: dispel type. */
  dispel?: number;
  mechanic?: number;
  /** DE: Abklingzeit in Millisekunden. EN: cooldown in milliseconds. */
  cooldown?: number;
  /** DE: Kein globaler Cooldown. EN: no global cooldown. */
  noGcd?: boolean;
  /** DE: Kanalisierungsdauer (ms). EN: channel duration (ms). */
  channel?: number;
  reagents?: { itemID: number; count: number }[];
  description?: string;
  radius?: number;
  nextMelee?: boolean;
  resetsSwing?: boolean;
  autoAttack?: boolean;
  autoShot?: boolean;
  skillLine?: number;
  /** DE: Ergebnis beim Wirken: Aura auf Ziel (target) oder sich selbst (self). EN: aura applied on a successful cast. */
  aura?: { duration: number; helpful: boolean; onSelf?: boolean; dispelName?: "Magic" | "Curse" | "Disease" | "Poison" };
}

export interface InventoryState {
  items: Record<string, ItemData>;
  /** DE: Taschen 0 (Rucksack) bis 4. EN: bags 0 (backpack) to 4. */
  bags: Record<string, BagData>;
  spells: Record<string, SpellData>;
  /** DE: Bekannte Zauber-IDs. EN: known spell IDs. */
  known: number[];
  /** DE: Geld in Kupfer. EN: money in copper. */
  money?: number;
  /** DE: Angelegte Ausrüstung: Platz 1..19 → Gegenstand. EN: worn equipment: slot 1..19 → item. */
  equipped?: Record<string, number>;
}

// ===== [S2] Beispieldaten · sample data =====

export const DEFAULT_INVENTORY: InventoryState = {
  items: {
    "6948": { name: "Hearthstone", quality: 1, level: 1, type: "Miscellaneous", subType: "Junk", classID: 15, subclassID: 0, stack: 1, icon: "Interface\\Icons\\INV_Misc_Rune_01", sellPrice: 0, bindType: 1 },
    "2589": { name: "Linen Cloth", quality: 1, level: 5, type: "Trade Goods", subType: "Cloth", classID: 7, subclassID: 5, stack: 20, icon: "Interface\\Icons\\INV_Fabric_Linen_01", sellPrice: 25, bindType: 0 },
    "4496": { name: "Small Brown Pouch", quality: 1, level: 1, type: "Container", subType: "Bag", classID: 1, subclassID: 0, stack: 1, icon: "Interface\\Icons\\INV_Misc_Bag_09", sellPrice: 25, bindType: 0 },
  },
  bags: {
    "0": { size: 16, slots: { "1": { id: 6948, count: 1 }, "2": { id: 2589, count: 7 } } },
    "1": { size: 6, itemID: 4496, family: 0, slots: {} },
  },
  spells: {
    "78": { name: "Heroic Strike", rank: "Rank 1", icon: "Interface\\Icons\\Ability_Rogue_Ambush", castTime: 0, cost: 15, powerType: 1, harmful: true, nextMelee: true, cooldown: 0, skillLine: 26, level: 1, description: "A strong attack that increases melee damage by 11 and causes a high amount of threat." },
    "6673": { name: "Battle Shout", rank: "Rank 1", icon: "Interface\\Icons\\Ability_Warrior_BattleShout", castTime: 0, cost: 10, powerType: 1, helpful: true, aura: { duration: 120, helpful: true, onSelf: true }, skillLine: 26, level: 1, description: "The warrior shouts, increasing attack power of all party members within 20 yards by 15." },
    "133": { name: "Fireball", rank: "Rank 1", icon: "Interface\\Icons\\Spell_Fire_FlameBolt", castTime: 1500, maxRange: 35, cost: 30, powerType: 0, school: 2, harmful: true, resetsSwing: true, skillLine: 8, level: 1, description: "Hurls a fiery ball that causes 14 to 22 Fire damage." },
    "6603": { name: "Auto Attack", rank: "", icon: "Interface\\Icons\\Ability_MeleeDamage", castTime: 0, cost: 0, powerType: 1, harmful: true, autoAttack: true, noGcd: true, level: 1, description: "Attacks with your weapon." },
    "8690": { name: "Hearthstone", rank: "", icon: "Interface\\Icons\\INV_Misc_Rune_01", castTime: 10000, cost: 0, powerType: 0, helpful: true, cooldown: 3600000, level: 1, description: "Returns you to your home location." },
    "439": { name: "Healing Potion", rank: "", icon: "Interface\\Icons\\INV_Potion_54", castTime: 0, cost: 0, powerType: 0, helpful: true, noGcd: true, cooldown: 60000, level: 1, description: "Restores 70 health." },
  },
  known: [78, 6673, 6603, 133, 8690],
  money: 25000,
  equipped: { "4": 6125, "7": 6124, "8": 6126, "16": 25 },
};

// Ausrüstung (Beispiele, IDs nur Beispielwerte) · equipment (samples, IDs are sample values)
DEFAULT_INVENTORY.items["25"] = { name: "Worn Shortsword", quality: 1, level: 1, type: "Weapon", subType: "One-Handed Swords", classID: 2, subclassID: 7, stack: 1, equipLoc: "INVTYPE_WEAPON", icon: "Interface\\Icons\\INV_Sword_04", sellPrice: 7, bindType: 0, durability: [30, 30] };
DEFAULT_INVENTORY.items["6125"] = { name: "Brawler's Harness", quality: 1, level: 1, type: "Armor", subType: "Miscellaneous", classID: 4, subclassID: 0, stack: 1, equipLoc: "INVTYPE_BODY", icon: "Interface\\Icons\\INV_Shirt_01", sellPrice: 1, bindType: 0 };
DEFAULT_INVENTORY.items["6124"] = { name: "Recruit's Pants", quality: 1, level: 1, type: "Armor", subType: "Cloth", classID: 4, subclassID: 1, stack: 1, equipLoc: "INVTYPE_LEGS", icon: "Interface\\Icons\\INV_Pants_01", sellPrice: 1, bindType: 0, durability: [20, 20], stats: { RESISTANCE0_NAME: 5 } };
DEFAULT_INVENTORY.items["6126"] = { name: "Recruit's Boots", quality: 1, level: 1, type: "Armor", subType: "Cloth", classID: 4, subclassID: 1, stack: 1, equipLoc: "INVTYPE_FEET", icon: "Interface\\Icons\\INV_Boots_Cloth_01", sellPrice: 1, bindType: 0, durability: [20, 20] };
DEFAULT_INVENTORY.items["2092"] = { name: "Worn Dagger", quality: 1, level: 1, type: "Weapon", subType: "Daggers", classID: 2, subclassID: 15, stack: 1, equipLoc: "INVTYPE_WEAPONOFFHAND", icon: "Interface\\Icons\\INV_Weapon_ShortBlade_01", sellPrice: 6, bindType: 0, durability: [25, 25] };
DEFAULT_INVENTORY.items["5742"] = { name: "Sample Potion", quality: 1, level: 1, type: "Consumable", subType: "Potion", classID: 0, subclassID: 1, stack: 5, icon: "Interface\\Icons\\INV_Potion_54", sellPrice: 5, bindType: 0, usable: true, spellID: 439 };

// Zusätzliche Beispielgegenstände für Beute, Händler und Müll · extra sample items for loot, vendor and junk
DEFAULT_INVENTORY.items["117"] = { name: "Tough Jerky", quality: 1, level: 1, type: "Consumable", subType: "Food & Drink", classID: 0, subclassID: 5, stack: 20, icon: "Interface\\Icons\\INV_Misc_Food_54", sellPrice: 1, bindType: 0 };
DEFAULT_INVENTORY.items["159"] = { name: "Refreshing Spring Water", quality: 1, level: 1, type: "Consumable", subType: "Food & Drink", classID: 0, subclassID: 5, stack: 20, icon: "Interface\\Icons\\INV_Drink_07", sellPrice: 1, bindType: 0 };
DEFAULT_INVENTORY.items["99001"] = { name: "Worn Fang (sample junk)", quality: 0, level: 1, type: "Miscellaneous", subType: "Junk", classID: 15, subclassID: 0, stack: 1, icon: "Interface\\Icons\\INV_Misc_Bone_01", sellPrice: 12, bindType: 0 };

// ===== [S3] Abfragen · queries =====

const QUALITY_COLOR = ["9d9d9d", "ffffff", "1eff00", "0070dd", "a335ee", "ff8000"];

export function resolveItemID(inv: InventoryState, item: unknown): number | undefined {
  if (typeof item === "number") return item > 0 ? Math.floor(item) : undefined;
  if (typeof item !== "string") return undefined;
  const m = /item:(\d+)/.exec(item);
  if (m) return Number(m[1]);
  const t = item.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const lower = t.toLowerCase();
  for (const [id, it] of Object.entries(inv.items)) if (it.name.toLowerCase() === lower) return Number(id);
  return undefined;
}

export function itemLink(id: number, it: ItemData): string {
  return `|cff${QUALITY_COLOR[it.quality] ?? "ffffff"}|Hitem:${id}:0:0:0|h[${it.name}]|h|r`;
}

function slotAt(inv: InventoryState, bag: unknown, slot: unknown): BagSlot | undefined {
  if (typeof bag !== "number" || typeof slot !== "number") return undefined;
  const b = inv.bags[String(bag)];
  if (!b || slot < 1 || slot > b.size) return undefined;
  return b.slots[String(slot)];
}

function freeSlots(inv: InventoryState, bag: unknown): number[] | undefined {
  if (typeof bag !== "number") return undefined;
  const b = inv.bags[String(bag)];
  if (!b) return undefined;
  const out: number[] = [];
  for (let i = 1; i <= b.size; i++) if (!b.slots[String(i)]) out.push(i);
  return out;
}

/** DE: Legt Gegenstände in die Taschen (erst Stapel auffüllen, dann freie Plätze). EN: puts items into the bags. */
export function addItem(inv: InventoryState, id: number, count: number): boolean {
  const max = inv.items[String(id)]?.stack ?? 1;
  let left = count;
  const order = Object.keys(inv.bags).sort((a, b) => Number(a) - Number(b));
  for (const b of order) for (const s of Object.values(inv.bags[b]!.slots)) {
    if (left > 0 && s.id === id && s.count < max) { const add = Math.min(max - s.count, left); s.count += add; left -= add; }
  }
  for (const b of order) {
    const bag = inv.bags[b]!;
    for (let i = 1; i <= bag.size && left > 0; i++) {
      if (!bag.slots[String(i)]) { const add = Math.min(max, left); bag.slots[String(i)] = { id, count: add }; left -= add; }
    }
  }
  return left === 0;
}

/** DE: Liest und leert einen Taschenplatz. EN: reads and clears a bag slot. */
export function takeSlot(inv: InventoryState, bag: number, slot: number): BagSlot | undefined {
  const b = inv.bags[String(bag)];
  const s = b?.slots[String(slot)];
  if (b && s) delete b.slots[String(slot)];
  return s;
}

// ===== [S4] API-Funktionen · API impls =====

type Impl = (inv: InventoryState, a: unknown[]) => unknown;

export const INVENTORY_API: Record<string, Impl> = {
  // Vanilla
  GetMoney: (inv) => inv.money ?? 0,
  GetContainerNumSlots: (inv, a) => inv.bags[String(a[0])]?.size ?? 0,
  GetContainerItemInfo: (inv, a) => {
    const s = slotAt(inv, a[0], a[1]);
    if (!s) return undefined;
    const it = inv.items[String(s.id)];
    return [it?.icon, s.count, false, it?.quality, false];
  },
  GetContainerItemLink: (inv, a) => {
    const s = slotAt(inv, a[0], a[1]);
    const it = s ? inv.items[String(s.id)] : undefined;
    return s && it ? itemLink(s.id, it) : undefined;
  },
  GetItemInfo: (inv, a) => {
    const id = resolveItemID(inv, a[0]);
    const it = id === undefined ? undefined : inv.items[String(id)];
    if (id === undefined || !it) return undefined;
    return [it.name, itemLink(id, it), it.quality, it.level ?? 1, it.minLevel ?? 0, it.type ?? "", it.subType ?? "", it.stack ?? 1, it.equipLoc ?? "", it.icon ?? ""];
  },
  GetItemCount: (inv, a) => {
    const id = resolveItemID(inv, a[0]);
    if (id === undefined) return 0;
    let n = 0;
    for (const b of Object.values(inv.bags)) for (const s of Object.values(b.slots)) if (s.id === id) n += s.count;
    return n;
  },
  // ClassicAPI (primitive Rückgaben · primitive returns)
  "C_Item.GetItemCount": (inv, a) => INVENTORY_API.GetItemCount!(inv, a),
  "C_Item.GetItemInfo": (inv, a) => {
    const id = resolveItemID(inv, a[0]);
    const it = id === undefined ? undefined : inv.items[String(id)];
    if (id === undefined || !it) return undefined;
    return [it.name, itemLink(id, it), it.quality, it.level ?? 1, it.minLevel ?? 0, it.type ?? "", it.subType ?? "", it.stack ?? 1, it.equipLoc ?? "",
      it.icon ?? "", it.sellPrice ?? 0, it.classID ?? 0, it.subclassID ?? 0, it.bindType ?? 0, 0, undefined, false, ""];
  },
  "C_Item.GetItemNameByID": (inv, a) => inv.items[String(resolveItemID(inv, a[0]))]?.name,
  "C_Item.GetItemIconByID": (inv, a) => inv.items[String(resolveItemID(inv, a[0]))]?.icon,
  "C_Item.GetItemQualityByID": (inv, a) => inv.items[String(resolveItemID(inv, a[0]))]?.quality,
  "C_Item.GetItemMaxStackSizeByID": (inv, a) => { const it = inv.items[String(resolveItemID(inv, a[0]))]; return it ? it.stack ?? 1 : undefined; },
  "C_Item.GetItemSellPriceByID": (inv, a) => { const it = inv.items[String(resolveItemID(inv, a[0]))]; return it ? it.sellPrice ?? 0 : undefined; },
  "C_Item.DoesItemExistByID": (inv, a) => { const id = resolveItemID(inv, a[0]); return id !== undefined && id > 0; },
  GetItemIcon: (inv, a) => inv.items[String(resolveItemID(inv, a[0]))]?.icon,
  "C_Container.GetContainerItemID": (inv, a) => slotAt(inv, a[0], a[1])?.id,
  "C_Container.HasContainerItem": (inv, a) => slotAt(inv, a[0], a[1]) !== undefined,
  "C_Container.GetContainerNumFreeSlots": (inv, a) => {
    const f = freeSlots(inv, a[0]);
    return [f ? f.length : 0, inv.bags[String(a[0])]?.family ?? 0];
  },
  "C_Container.CalculateTotalNumberOfFreeBagSlots": (inv) => {
    let n = 0;
    for (let b = 0; b <= 4; b++) if ((inv.bags[String(b)]?.family ?? 0) === 0) n += freeSlots(inv, b)?.length ?? 0;
    return n;
  },
  // Hilfen für Prelude-Tabellen · helpers for prelude-built tables
  __bag_item: (inv, a) => {
    const s = slotAt(inv, a[0], a[1]);
    if (!s) return undefined;
    const it = inv.items[String(s.id)];
    return [s.id, s.count, it?.icon, it?.quality, it ? itemLink(s.id, it) : undefined, it?.name, it ? (it.sellPrice ?? 0) === 0 : undefined];
  },
  __bag_free_list: (inv, a) => { const f = freeSlots(inv, a[0]); return f ? [true, ...f] : [false]; },
  // Zauber · spells
  "C_Spell.DoesSpellExist": (inv, a) => inv.spells[String(a[0])] !== undefined,
  "C_Spell.GetSpellName": (inv, a) => inv.spells[String(a[0])]?.name,
  "C_Spell.GetSpellTexture": (inv, a) => inv.spells[String(a[0])]?.icon,
  "C_Spell.GetSpellLink": (inv, a) => { const s = inv.spells[String(a[0])]; return s ? `|cff71d5ff|Hspell:${a[0]}:0|h[${s.name}]|h|r` : undefined; },
  IsSpellKnown: (inv, a) => typeof a[0] === "number" && a[1] !== true && inv.known.includes(a[0]),
  __spell_info: (inv, a) => {
    const s = inv.spells[String(a[0])];
    if (!s) return undefined;
    return [s.name, s.icon, s.castTime ?? 0, s.minRange ?? 0, s.maxRange ?? 0, a[0], s.rank ?? "", s.cost ?? 0, false, s.powerType ?? 0];
  },
};
