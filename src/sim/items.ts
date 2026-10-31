/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Gegenstandsbezug · item reference ... refItem (ID, Link, Name, Ort, GUID)
 *   [S2] Namen und Farben · names and colors .. ITEM_CLASSES, QUALITY_RGB
 *   [S3] ITEMS_API ............................ C_Item.* (Rest), GetItemQualityColor, Is*Item, Item-Klassen
 *
 * DE: Ergänzt `C_Item` und die Vanilla-Gegenstandsfunktionen. Ein „Gegenstand“ wird wie in der ClassicAPI
 *     angegeben: ID, `item:N`, Link, Name oder Ort (`{bagID=,slotIndex=}`, `{equipmentSlotIndex=}`, GUID-Text).
 *     Alle Werte kommen aus den Beispielgegenständen des Inventars; was dort fehlt, ist nil.
 * EN: completes `C_Item` and the vanilla item functions. An "item" is given as in ClassicAPI: ID, `item:N`,
 *     link, name or location (`{bagID=,slotIndex=}`, `{equipmentSlotIndex=}`, GUID text). All values come
 *     from the sample items of the inventory; what is missing there is nil.
 */

import { num, type Impl, type SimHost } from "./host.js";
import { itemLink, resolveItemID, type ItemData } from "./inventory.js";
import { SLOTS_FOR, SLOT_NAMES, gear } from "./gear.js";

// ===== [S1] Gegenstandsbezug · item reference =====

export interface ItemRef { id: number; it: ItemData | undefined; loc?: { bag: number; slot: number } | { eq: number }; count?: number }

const guidFor = (bag: number, slot: number): string => `0x40000000${((bag & 255) << 8 | slot).toString(16).padStart(8, "0")}`;

export function refItem(h: SimHost, v: unknown): ItemRef | undefined {
  const inv = h.inventory();
  let loc: ItemRef["loc"];
  if (typeof v === "object" && v !== null) {
    const o = v as { bagID?: unknown; slotIndex?: unknown; equipmentSlotIndex?: unknown };
    if (typeof o.equipmentSlotIndex === "number") loc = { eq: o.equipmentSlotIndex };
    else if (typeof o.bagID === "number" && typeof o.slotIndex === "number") loc = { bag: o.bagID, slot: o.slotIndex };
    else return undefined;
  } else if (typeof v === "string" && /^0x4000[0-9a-fA-F]{12}$/.test(v)) {
    const n = parseInt(v.slice(-8), 16);
    loc = (n >> 8) === 255 ? { eq: n & 255 } : { bag: n >> 8, slot: n & 255 };
  }
  if (loc) {
    if ("eq" in loc) { const id = inv.equipped?.[String(loc.eq)]; return id === undefined ? undefined : { id, it: inv.items[String(id)], loc, count: 1 }; }
    const s = inv.bags[String(loc.bag)]?.slots[String(loc.slot)];
    return s ? { id: s.id, it: inv.items[String(s.id)], loc, count: s.count } : undefined;
  }
  const id = resolveItemID(inv, v);
  return id === undefined ? undefined : { id, it: inv.items[String(id)] };
}

// ===== [S2] Namen und Farben · names and colors =====

const ITEM_CLASSES = ["Consumable", "Container", "Weapon", "Jewelry(OBSOLETE)", "Armor", "Reagent", "Projectile", "Trade Goods", "Generic(OBSOLETE)", "Recipe", "Money(OBSOLETE)", "Quiver", "Quest", "Key", "Permanent(OBSOLETE)", "Miscellaneous"];
const SUBCLASSES: Record<number, string[]> = {
  0: ["Consumable", "Potion", "Elixir", "Flask", "Scroll", "Food & Drink", "Item Enhancement", "Bandage", "Other"],
  2: ["One-Handed Axes", "Two-Handed Axes", "Bows", "Guns", "One-Handed Maces", "Two-Handed Maces", "Polearms", "One-Handed Swords", "Two-Handed Swords", "Obsolete", "Staves", "One-Handed Exotics", "Two-Handed Exotics", "Fist Weapons", "Miscellaneous", "Daggers", "Thrown", "Spears", "Crossbows", "Wands", "Fishing Poles"],
  4: ["Miscellaneous", "Cloth", "Leather", "Mail", "Plate", "Cosmetic", "Shields", "Librams", "Idols", "Totems"],
  7: ["Trade Goods", "Parts", "Explosives", "Devices", "Jewelcrafting", "Cloth", "Leather", "Metal & Stone", "Meat", "Herb", "Elemental", "Other", "Enchanting"],
  15: ["Junk", "Reagent", "Pet", "Holiday", "Other", "Mount"],
};
const QUALITY_RGB: [number, number, number][] = [[0.616, 0.616, 0.616], [1, 1, 1], [0.118, 1, 0], [0, 0.439, 0.867], [0.639, 0.208, 0.933], [1, 0.502, 0], [0.9, 0.8, 0.5], [0.9, 0.8, 0.5]];
const INV_KEYS = ["", "INVTYPE_HEAD", "INVTYPE_NECK", "INVTYPE_SHOULDER", "INVTYPE_BODY", "INVTYPE_CHEST", "INVTYPE_WAIST", "INVTYPE_LEGS", "INVTYPE_FEET", "INVTYPE_WRIST", "INVTYPE_HAND", "INVTYPE_FINGER", "INVTYPE_TRINKET", "INVTYPE_WEAPON", "INVTYPE_SHIELD", "INVTYPE_RANGED", "INVTYPE_CLOAK", "INVTYPE_2HWEAPON", "INVTYPE_BAG", "INVTYPE_TABARD", "INVTYPE_ROBE", "INVTYPE_WEAPONMAINHAND", "INVTYPE_WEAPONOFFHAND", "INVTYPE_HOLDABLE", "INVTYPE_AMMO", "INVTYPE_THROWN", "INVTYPE_RANGEDRIGHT", "INVTYPE_QUIVER", "INVTYPE_RELIC"];
const INV_NAMES = ["", "Head", "Neck", "Shoulder", "Shirt", "Chest", "Waist", "Legs", "Feet", "Wrist", "Hands", "Finger", "Trinket", "One-Hand", "Off Hand", "Ranged", "Back", "Two-Hand", "Bag", "Tabard", "Chest", "Main Hand", "Off Hand", "Held In Off-hand", "Ammo", "Thrown", "Ranged", "Quiver", "Relic"];

const q = (r: ItemRef | undefined): ItemData | undefined => r?.it;
const slotsFor = (it: ItemData | undefined): number[] => (it?.equipLoc ? SLOTS_FOR[it.equipLoc] ?? [] : []);
const isEquipped = (h: SimHost, id: number): boolean => Object.values(h.inventory().equipped ?? {}).includes(id);
const countOf = (h: SimHost, id: number): number => { let n = 0; for (const b of Object.values(h.inventory().bags)) for (const s of Object.values(b.slots)) if (s.id === id) n += s.count; return n; };
const isBagKind = (it: ItemData | undefined): boolean => it?.classID === 1;

// ===== [S3] ITEMS_API =====

const byRef = (f: (h: SimHost, r: ItemRef) => unknown): Impl => (h, a) => { const r = refItem(h, a[0]); return r ? f(h, r) : undefined; };

export const ITEMS_API: Record<string, Impl> = {
  // ----- Orte, GUID, Vorhandensein · locations, GUIDs, existence -----
  "C_Item.DoesItemExist": (h, a) => refItem(h, a[0]) !== undefined,
  "C_Item.GetItemID": byRef((_h, r) => r.id),
  "C_Item.GetItemIDForItemInfo": (h, a) => { if (typeof a[0] === "string" && !/item:\d+|^\d+$/.test(a[0])) return undefined; return typeof a[0] === "object" ? undefined : resolveItemID(h.inventory(), a[0]); },
  "C_Item.GetItemGUID": byRef((_h, r) => (r.loc ? ("eq" in r.loc ? guidFor(255, r.loc.eq) : guidFor(r.loc.bag, r.loc.slot)) : undefined)),
  "C_Item.GetItemLocation": (h, a) => {
    const r = refItem(h, a[0]); if (!r?.loc) return undefined;
    return [("eq" in r.loc ? { equipmentSlotIndex: r.loc.eq } : { bagID: r.loc.bag, slotIndex: r.loc.slot })];
  },
  "C_Item.IsItemGUIDInInventory": (h, a) => { const r = refItem(h, a[0]); return r?.loc !== undefined; },
  "C_Item.GetStackCount": byRef((_h, r) => r.count),
  "C_Item.GetItemLink": byRef((_h, r) => (r.it ? itemLink(r.id, r.it) : undefined)),
  "C_Item.IsBound": byRef((_h, r) => r.loc !== undefined && (r.it?.bindType ?? 0) > 0 && ("eq" in r.loc || r.it?.bindType === 1)),
  "C_Item.IsLocked": (h, a) => {
    const r = refItem(h, a[0]); const c = gear(h).cursor;
    return !!r?.loc && c?.kind === "item" && c.id === r.id && c.from !== undefined && ("eq" in r.loc ? "inv" in c.from && c.from.inv === r.loc.eq : "bag" in c.from && c.from.bag === r.loc.bag && c.from.slot === r.loc.slot);
  },
  "C_Item.LockItem": (h, a) => { if (refItem(h, a[0])) h.fire("ITEM_LOCK_CHANGED"); },
  "C_Item.LockItemByGUID": (h, a) => { if (refItem(h, a[0])) h.fire("ITEM_LOCK_CHANGED"); },
  "C_Item.UnlockItem": (h, a) => { if (refItem(h, a[0])) h.fire("ITEM_LOCK_CHANGED"); },
  "C_Item.UnlockAllItems": (h) => { h.fire("ITEM_LOCK_CHANGED"); },
  "C_Item.IsItemDataCached": (h, a) => refItem(h, a[0]) !== undefined,
  "C_Item.IsItemDataCachedByID": (h, a) => q(refItem(h, a[0])) !== undefined,
  "C_Item.RequestLoadItemData": (h, a) => { const r = refItem(h, a[0]); if (r) h.fire("ITEM_DATA_LOAD_RESULT", r.id, r.it !== undefined); return r !== undefined; },
  "C_Item.RequestLoadItemDataByID": (h, a) => { const r = refItem(h, a[0]); if (r) h.fire("ITEM_DATA_LOAD_RESULT", r.id, r.it !== undefined); return r !== undefined; },
  // ----- Stammdaten · base data -----
  "C_Item.GetItemName": byRef((_h, r) => r.it?.name),
  "C_Item.GetItemQuality": byRef((_h, r) => r.it?.quality),
  "C_Item.GetItemIcon": byRef((_h, r) => r.it?.icon),
  "C_Item.GetItemMaxStackSize": byRef((_h, r) => (r.it ? r.it.stack ?? 1 : undefined)),
  "C_Item.GetItemSellPrice": byRef((_h, r) => (r.it ? r.it.sellPrice ?? 0 : undefined)),
  "C_Item.GetCurrentItemLevel": byRef((_h, r) => r.it?.level),
  "C_Item.GetDetailedItemLevelInfo": byRef((_h, r) => (r.it ? [r.it.level ?? 1, false, r.it.level ?? 1] : undefined)),
  "C_Item.GetItemFamily": byRef((_h, r) => (r.it ? 0 : undefined)),
  "C_Item.GetItemInfoInstant": byRef((_h, r) => (r.it ? [r.id, r.it.type ?? "", r.it.subType ?? "", r.it.equipLoc ?? "", r.it.icon ?? "", r.it.classID ?? 0, r.it.subclassID ?? 0] : undefined)),
  "C_Item.GetItemInventoryType": byRef((_h, r) => (r.it ? Math.max(0, INV_KEYS.indexOf(r.it.equipLoc ?? "")) : undefined)),
  "C_Item.GetItemInventoryTypeByID": byRef((_h, r) => (r.it ? Math.max(0, INV_KEYS.indexOf(r.it.equipLoc ?? "")) : undefined)),
  "C_Item.GetItemInventorySlotInfo": (_h, a) => (typeof a[0] === "number" && a[0] >= 1 ? INV_NAMES[a[0]] : undefined),
  "C_Item.GetItemInventorySlotKey": (_h, a) => (typeof a[0] === "number" && a[0] >= 1 ? INV_KEYS[a[0]] : undefined),
  "C_Item.GetItemSetID": byRef((_h, r) => r.it?.setID), "C_Item.GetItemSetIDByID": byRef((_h, r) => r.it?.setID),
  "C_Item.GetItemSetInfo": () => undefined,
  "C_Item.GetItemSpell": byRef((h, r) => { const sp = r.it?.spellID; return sp !== undefined ? [h.inventory().spells[String(sp)]?.name ?? `spell:${sp}`, sp] : undefined; }),
  "C_Item.GetItemStats": byRef((_h, r) => (r.it ? [r.it.stats ?? {}] : undefined)),
  "C_Item.GetItemStatDelta": (h, a) => {
    const x = refItem(h, a[0])?.it; const y = refItem(h, a[1])?.it; if (!x || !y) return undefined;
    const d: Record<string, number> = {};
    for (const k of new Set([...Object.keys(x.stats ?? {}), ...Object.keys(y.stats ?? {})])) { const v = (x.stats?.[k] ?? 0) - (y.stats?.[k] ?? 0); if (v !== 0) d[k] = v; }
    return [d];
  },
  "C_Item.GetItemUniqueness": byRef((_h, r) => [r.it?.unique ? 1 : 0, r.it?.unique ?? 0]),
  "C_Item.GetItemUniquenessByID": byRef((_h, r) => [r.it?.unique ? 1 : 0, r.it?.unique ?? 0]),
  "C_Item.GetItemClassInfo": (_h, a) => (typeof a[0] === "number" ? ITEM_CLASSES[a[0]] : undefined),
  GetItemClassInfo: (_h, a) => (typeof a[0] === "number" ? ITEM_CLASSES[a[0]] : undefined),
  "C_Item.GetItemSubClassInfo": (_h, a) => { const n = typeof a[0] === "number" && typeof a[1] === "number" ? SUBCLASSES[a[0]]?.[a[1]] : undefined; return n === undefined ? undefined : [n, a[0] === 4 || a[0] === 2]; },
  GetItemSubClassInfo: (_h, a) => { const n = typeof a[0] === "number" && typeof a[1] === "number" ? SUBCLASSES[a[0]]?.[a[1]] : undefined; return n === undefined ? undefined : [n, a[0] === 4 || a[0] === 2]; },
  "C_Item.GetItemData": byRef((_h, r) => (r.it ? [itemData(r)] : undefined)),
  "C_Item.GetItemDataByID": byRef((_h, r) => (r.it ? [itemData(r)] : undefined)),
  "C_Item.GetItemTempEnchantInfo": () => undefined,
  "C_Item.GetEnchantInfo": () => undefined,
  "C_Item.GetWeaponEnchantInfo": () => [false, 0, 0, 0, false, 0, 0, 0, false, 0, 0, 0],
  GetWeaponEnchantInfo: () => [false, 0, 0, false, 0, 0],
  // ----- Eigenschaften, Verwendbarkeit · properties, usability -----
  "C_Item.IsEquippableItem": byRef((_h, r) => slotsFor(r.it).length > 0 || isBagKind(r.it)),
  IsEquippableItem: byRef((_h, r) => slotsFor(r.it).length > 0 || isBagKind(r.it)),
  "C_Item.IsEquippedItem": byRef((h, r) => isEquipped(h, r.id)),
  IsEquippedItem: byRef((h, r) => isEquipped(h, r.id)),
  IsEquippedItemType: (h, a) => { const inv = h.inventory(); return Object.values(inv.equipped ?? {}).some((id) => inv.items[String(id)]?.type === a[0] || inv.items[String(id)]?.subType === a[0] || inv.items[String(id)]?.equipLoc === a[0]); },
  "C_Item.IsConsumableItem": byRef((_h, r) => r.it?.usable === true || r.it?.classID === 0),
  IsConsumableItem: byRef((_h, r) => r.it?.usable === true || r.it?.classID === 0),
  "C_Item.IsUsableItem": byRef((h, r) => [r.it?.usable === true && countOf(h, r.id) > 0, false]),
  IsUsableItem: byRef((h, r) => [r.it?.usable === true && countOf(h, r.id) > 0, false]),
  IsCurrentItem: () => false,
  IsDressableItem: byRef((_h, r) => slotsFor(r.it).some((s) => s !== 18) && r.it?.equipLoc !== "INVTYPE_BAG"),
  IsHarmfulItem: () => false,
  IsHelpfulItem: byRef((_h, r) => r.it?.usable === true),
  "C_Item.IsItemOpenable": () => [false, false],
  "C_Item.ItemHasRange": () => false, ItemHasRange: () => false,
  "C_Item.IsItemInRange": () => undefined,
  GetItemQualityColor: (_h, a) => {
    const n = num(a[0]) ?? 1; const c = QUALITY_RGB[n] ?? QUALITY_RGB[1]!;
    const hex = c.map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
    return [c[0], c[1], c[2], `|cff${hex}`];
  },
  // ----- Aktionen · actions -----
  "C_Item.EquipItemByName": (h, a) => {
    const r = refItem(h, a[0]); if (!r?.it) return;
    const inv = h.inventory(); const dst = num(a[1]);
    let from: { bag: number; slot: number } | undefined = r.loc && "bag" in r.loc ? r.loc : undefined;
    if (!from) for (const [b, bag] of Object.entries(inv.bags)) for (const [s, v] of Object.entries(bag.slots)) if (!from && v.id === r.id) from = { bag: Number(b), slot: Number(s) };
    if (!from || slotsFor(r.it).length === 0) return;
    const cands = slotsFor(r.it); const slot = dst !== undefined && cands.includes(dst) ? dst : cands[0]!;
    const prev = inv.equipped?.[String(slot)];
    inv.equipped = { ...(inv.equipped ?? {}), [String(slot)]: r.id };
    const bag = inv.bags[String(from.bag)]!;
    if (prev !== undefined) bag.slots[String(from.slot)] = { id: prev, count: 1 }; else delete bag.slots[String(from.slot)];
    h.fire("UNIT_INVENTORY_CHANGED", "player"); h.fire("BAG_UPDATE", from.bag);
  },
  "C_Item.PickupItem": (h, a) => {
    const r = refItem(h, a[0]); if (!r) return;
    const inv = h.inventory();
    for (const [b, bag] of Object.entries(inv.bags)) for (const [s, v] of Object.entries(bag.slots)) if (v.id === r.id) { h.note("info", `C_Item.PickupItem: picked ${r.it?.name ?? r.id}`); gear(h).cursor = { kind: "item", id: r.id, count: v.count, from: { bag: Number(b), slot: Number(s) } }; delete bag.slots[s]; return; }
  },
  "C_Item.UseAtCursor": (h) => { h.note("info", "C_Item.UseAtCursor: the ground target is not simulated."); },
  "C_Item.UseAtUnit": (h, a) => { h.note("info", `C_Item.UseAtUnit(${String(a[1])}): the effect is not simulated.`); },
  "C_Item.UseItemByName": (h, a) => {
    const r = refItem(h, a[0]); if (!r?.it) return;
    const inv = h.inventory();
    for (const [b, bag] of Object.entries(inv.bags)) for (const [s, v] of Object.entries(bag.slots)) if (v.id === r.id) { useThrough(h, Number(b), Number(s)); return; }
  },
};
void SLOT_NAMES;

import { useBagItem } from "./gear.js";
function useThrough(h: SimHost, bag: number, slot: number): void { useBagItem(h, bag, slot); }

function itemData(r: ItemRef): Record<string, unknown> {
  const it = r.it!;
  return { itemID: r.id, name: it.name, quality: it.quality, itemLevel: it.level ?? 1, requiredLevel: it.minLevel ?? 0, classID: it.classID ?? 0, subclassID: it.subclassID ?? 0,
    maxStack: it.stack ?? 1, equipLoc: it.equipLoc ?? "", icon: it.icon ?? "", sellPrice: it.sellPrice ?? 0, bindType: it.bindType ?? 0, stats: it.stats ?? {} };
}
