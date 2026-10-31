/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Plätze und Zustand · slots and state ... SLOT_NAMES, SLOTS_FOR, GearState (Cursor, Sets)
 *   [S2] Bewegen · moving ....................... equip, place, pick up, return, useBagItem
 *   [S3] GEAR_API ............................... Ausrüstung, Cursor, Taschen-Verschiebungen, C_EquipmentSet
 *
 * DE: Angelegte Ausrüstung (`inventory.equipped`), der Cursor (Gegenstand/Geld/Zauber in der Hand), das
 *     Verschieben zwischen Taschen und Ausrüstung und die Ausrüstungssets. Sets werden je Simulation
 *     gespeichert. Einen Tausch erledigt die Simulation sofort (der Server braucht in echt einen Moment).
 * EN: worn equipment, the cursor, moving between bags and equipment, and equipment sets. Sets live per
 *     simulation. A swap finishes at once here (the real server needs a moment).
 */

import { type SimHost, num, str, type Impl } from "./host.js";
import { addItem, itemLink, resolveItemID, takeSlot, type InventoryState } from "./inventory.js";

// ===== [S1] Plätze und Zustand · slots and state =====

export const SLOT_NAMES = ["HeadSlot", "NeckSlot", "ShoulderSlot", "ShirtSlot", "ChestSlot", "WaistSlot", "LegsSlot", "FeetSlot", "WristSlot", "HandsSlot", "Finger0Slot", "Finger1Slot", "Trinket0Slot", "Trinket1Slot", "BackSlot", "MainHandSlot", "SecondaryHandSlot", "RangedSlot", "TabardSlot"];
const SLOT_ART = ["Head", "Neck", "Shoulder", "Shirt", "Chest", "Waist", "Legs", "Feet", "Wrist", "Hands", "Finger", "Finger", "Trinket", "Trinket", "Back", "MainHand", "SecondaryHand", "Ranged", "Tabard"];

/** DE: Welche Plätze nimmt ein Ausrüstungstyp? EN: which slots does an equip type take? */
export const SLOTS_FOR: Record<string, number[]> = {
  INVTYPE_HEAD: [1], INVTYPE_NECK: [2], INVTYPE_SHOULDER: [3], INVTYPE_BODY: [4], INVTYPE_CHEST: [5], INVTYPE_ROBE: [5], INVTYPE_WAIST: [6],
  INVTYPE_LEGS: [7], INVTYPE_FEET: [8], INVTYPE_WRIST: [9], INVTYPE_HAND: [10], INVTYPE_FINGER: [11, 12], INVTYPE_TRINKET: [13, 14],
  INVTYPE_CLOAK: [15], INVTYPE_WEAPON: [16, 17], INVTYPE_2HWEAPON: [16], INVTYPE_WEAPONMAINHAND: [16], INVTYPE_WEAPONOFFHAND: [17],
  INVTYPE_SHIELD: [17], INVTYPE_HOLDABLE: [17], INVTYPE_RANGED: [18], INVTYPE_RANGEDRIGHT: [18], INVTYPE_THROWN: [18], INVTYPE_RELIC: [18], INVTYPE_TABARD: [19],
};

export type Cursor =
  | { kind: "item"; id: number; count: number; from?: { bag: number; slot: number } | { inv: number } }
  | { kind: "money"; amount: number }
  | { kind: "spell"; spellID: number };

export interface EquipmentSet { setID: number; name: string; icon: string; items: Record<string, number>; ignored: number[] }
export interface GearState {
  cursor?: Cursor;
  sets: EquipmentSet[];
  nextSetID: number;
  ignoreForSave: Set<number>;
  durability: Record<string, number>;
}
export const gear = (h: SimHost): GearState => h.store("gear", () => ({ sets: [], nextSetID: 0, ignoreForSave: new Set<number>(), durability: {} }));

const equippedID = (inv: InventoryState, slot: number): number | undefined => inv.equipped?.[String(slot)];
const isPlayer = (u: unknown): boolean => u === "player" || u === undefined || (typeof u === "string" && /^player$/i.test(u));

// ===== [S2] Bewegen · moving =====

function setEquipped(inv: InventoryState, slot: number, id: number | undefined): void {
  inv.equipped ??= {};
  if (id === undefined) delete inv.equipped[String(slot)]; else inv.equipped[String(slot)] = id;
}

function bagSlot(inv: InventoryState, bag: number, slot: number): { id: number; count: number } | undefined {
  const b = inv.bags[String(bag)];
  return b && slot >= 1 && slot <= b.size ? b.slots[String(slot)] : undefined;
}
function putSlot(inv: InventoryState, bag: number, slot: number, v: { id: number; count: number } | undefined): void {
  const b = inv.bags[String(bag)]; if (!b) return;
  if (v) b.slots[String(slot)] = v; else delete b.slots[String(slot)];
}

/** DE: Gibt den Cursor-Gegenstand zurück an seinen Platz (oder in die Taschen). EN: returns the cursor item to its place (or the bags). */
export function returnCursor(h: SimHost): void {
  const g = gear(h); const c = g.cursor; delete g.cursor;
  if (c?.kind === "money") { const inv = h.inventory(); inv.money = (inv.money ?? 0) + c.amount; h.fire("PLAYER_MONEY"); return; }
  if (c?.kind !== "item") return;
  const inv = h.inventory();
  if (c.from && "inv" in c.from && !equippedID(inv, c.from.inv)) { setEquipped(inv, c.from.inv, c.id); h.fire("UNIT_INVENTORY_CHANGED", "player"); return; }
  if (c.from && "bag" in c.from && !bagSlot(inv, c.from.bag, c.from.slot)) { putSlot(inv, c.from.bag, c.from.slot, { id: c.id, count: c.count }); h.fire("BAG_UPDATE", c.from.bag); return; }
  addItem(inv, c.id, c.count);
  h.fire("BAG_UPDATE", 0);
}

function fits(inv: InventoryState, id: number, slot: number): boolean {
  const loc = inv.items[String(id)]?.equipLoc;
  return !!loc && (SLOTS_FOR[loc]?.includes(slot) ?? false);
}

/** DE: Legt einen Gegenstand an; liefert den verdrängten zurück. EN: wears an item; returns the displaced one. */
function wear(h: SimHost, id: number, slot?: number): { ok: boolean; displaced?: number } {
  const inv = h.inventory(); const loc = inv.items[String(id)]?.equipLoc;
  const cands = loc ? SLOTS_FOR[loc] : undefined;
  if (!cands) return { ok: false };
  const target = slot !== undefined ? (cands.includes(slot) ? slot : undefined) : cands.find((s) => !equippedID(inv, s)) ?? cands[0];
  if (target === undefined) return { ok: false };
  const displaced = equippedID(inv, target);
  setEquipped(inv, target, id);
  if (loc === "INVTYPE_2HWEAPON") { const off = equippedID(inv, 17); if (off !== undefined) { setEquipped(inv, 17, undefined); addItem(inv, off, 1); } }
  return { ok: true, displaced };
}

/** DE: Benutzt/legt an, was in einem Taschenplatz liegt (Rechtsklick). EN: right-click use/equip of a bag slot. */
export function useBagItem(h: SimHost, bag: number, slot: number): void {
  const inv = h.inventory(); const s = bagSlot(inv, bag, slot);
  if (!s) return;
  const it = inv.items[String(s.id)];
  if (it?.equipLoc && SLOTS_FOR[it.equipLoc]) {
    const r = wear(h, s.id);
    if (!r.ok) return;
    takeSlot(inv, bag, slot);
    if (r.displaced !== undefined) putSlot(inv, bag, slot, { id: r.displaced, count: 1 });
    h.fire("UNIT_INVENTORY_CHANGED", "player"); h.fire("BAG_UPDATE", bag);
    return;
  }
  if (it?.usable) {
    s.count -= 1; if (s.count <= 0) takeSlot(inv, bag, slot);
    h.note("info", `Used ${it.name} (the effect is not simulated).`);
    h.fire("BAG_UPDATE", bag);
    return;
  }
  h.note("warn", "UseContainerItem: this item has no simulated use.");
}

function pickBag(h: SimHost, bag: number, slot: number, count?: number): void {
  const g = gear(h); const inv = h.inventory();
  const s = bagSlot(inv, bag, slot);
  if (!g.cursor) {
    if (!s) return;
    const n = count !== undefined && count > 0 && count < s.count ? count : s.count;
    if (n < s.count) s.count -= n; else takeSlot(inv, bag, slot);
    g.cursor = { kind: "item", id: s.id, count: n, from: { bag, slot } };
    return;
  }
  const c = g.cursor;
  if (c.kind !== "item") return;
  const max = inv.items[String(c.id)]?.stack ?? 1;
  if (s && s.id === c.id && s.count < max) {
    const add = Math.min(max - s.count, c.count); s.count += add; c.count -= add;
    if (c.count <= 0) delete g.cursor;
  } else if (!s) { putSlot(inv, bag, slot, { id: c.id, count: c.count }); delete g.cursor; }
  else { putSlot(inv, bag, slot, { id: c.id, count: c.count }); g.cursor = { kind: "item", id: s.id, count: s.count, from: { bag, slot } }; }
  h.fire("BAG_UPDATE", bag);
}

const eqLink = (inv: InventoryState, id: number): string | undefined => { const it = inv.items[String(id)]; return it ? itemLink(id, it) : undefined; };
const durOf = (h: SimHost, inv: InventoryState, slot: number): [number, number] | undefined => {
  const id = equippedID(inv, slot); const d = id !== undefined ? inv.items[String(id)]?.durability : undefined;
  if (!d) return undefined;
  const cur = gear(h).durability[String(slot)];
  return [cur ?? d[0], d[1]];
};
const repairCost = (h: SimHost, inv: InventoryState, slot: number): number => { const d = durOf(h, inv, slot); return d ? Math.max(0, d[1] - d[0]) * 12 : 0; };

// ===== [S3] GEAR_API =====

function equipmentSetInfo(h: SimHost, s: EquipmentSet): [string, string, number, boolean, number, number, number, number, number] {
  const inv = h.inventory();
  let eq = 0, bag = 0, miss = 0, ign = 0, all = true;
  const inBags = (id: number): boolean => Object.values(inv.bags).some((b) => Object.values(b.slots).some((x) => x.id === id));
  for (let slot = 1; slot <= 19; slot++) {
    if (s.ignored.includes(slot)) { ign++; continue; }
    const want = s.items[String(slot)];
    const have = equippedID(inv, slot);
    if (want === undefined) { if (have !== undefined) all = false; continue; }
    if (have === want) eq++; else { all = false; if (inBags(want)) bag++; else miss++; }
  }
  return [s.name, s.icon, s.setID, all, eq + bag + miss, eq, bag, miss, ign];
}
const setOf = (h: SimHost, id: unknown): EquipmentSet | undefined => gear(h).sets.find((s) => s.setID === id);

function snapshot(h: SimHost): { items: Record<string, number>; ignored: number[] } {
  const g = gear(h); const inv = h.inventory();
  const items: Record<string, number> = {}; const ignored = [...g.ignoreForSave].sort((a, b) => a - b);
  for (let slot = 1; slot <= 19; slot++) { const id = equippedID(inv, slot); if (id !== undefined && !g.ignoreForSave.has(slot)) items[String(slot)] = id; }
  return { items, ignored };
}
function validName(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const n = v.replace(/\|/g, "");
  if (/[\r\n]/.test(n) || n.length >= 32) throw new Error("Invalid string for setName");
  return n;
}

export const GEAR_API: Record<string, Impl> = {
  // ----- Ausrüstung lesen · reading equipment -----
  GetInventoryItemLink: (h, a) => { if (!isPlayer(a[0])) return undefined; const inv = h.inventory(); const id = equippedID(inv, num(a[1]) ?? 0); return id !== undefined ? eqLink(inv, id) : undefined; },
  GetInventoryItemID: (h, a) => (isPlayer(a[0]) ? equippedID(h.inventory(), num(a[1]) ?? 0) : undefined),
  GetInventoryItemTexture: (h, a) => { if (!isPlayer(a[0])) return undefined; const inv = h.inventory(); const id = equippedID(inv, num(a[1]) ?? 0); return id !== undefined ? inv.items[String(id)]?.icon : undefined; },
  GetInventoryItemCount: (h, a) => (isPlayer(a[0]) && equippedID(h.inventory(), num(a[1]) ?? 0) !== undefined ? 1 : 0),
  GetInventoryItemQuality: (h, a) => { if (!isPlayer(a[0])) return undefined; const inv = h.inventory(); const id = equippedID(inv, num(a[1]) ?? 0); return id !== undefined ? inv.items[String(id)]?.quality : undefined; },
  GetInventoryItemBroken: (h, a) => { const d = durOf(h, h.inventory(), num(a[1]) ?? 0); return d ? d[0] <= 0 : false; },
  GetInventoryItemCooldown: () => [0, 0, 1],
  IsInventoryItemLocked: (h) => { const c = gear(h).cursor; return c?.kind === "item" && c.from !== undefined && "inv" in c.from; },
  GetInventoryItemDurability: (h, a) => durOf(h, h.inventory(), num(a[0]) ?? 0),
  GetInventoryItemRepairCost: (h, a) => repairCost(h, h.inventory(), num(a[0]) ?? 0),
  GetInventorySlotInfo: (_h, a) => {
    const n = str(a[0]);
    if (n === "AmmoSlot") return [0, "Interface\\PaperDoll\\UI-PaperDoll-Slot-Ammo", false];
    const i = n ? SLOT_NAMES.indexOf(n) : -1;
    if (i < 0) throw new Error(`Usage: GetInventorySlotInfo("slotName")`);
    return [i + 1, `Interface\\PaperDoll\\UI-PaperDoll-Slot-${SLOT_ART[i]}`, i === 17];
  },
  ContainerIDToInventoryID: (_h, a) => 19 + (num(a[0]) ?? 0),
  BankButtonIDToInvSlotID: (_h, a) => 39 + (num(a[0]) ?? 0),
  KeyRingButtonIDToInvSlotID: (_h, a) => 83 + (num(a[0]) ?? 0),
  HasWandEquipped: (h) => { const id = equippedID(h.inventory(), 18); return id !== undefined && h.inventory().items[String(id)]?.subType === "Wands"; },
  OffhandHasWeapon: (h) => { const inv = h.inventory(); const id = equippedID(inv, 17); return id !== undefined && inv.items[String(id)]?.type === "Weapon"; },
  IsDualWielding: (h) => { const inv = h.inventory(); const id = equippedID(inv, 17); return id !== undefined && inv.items[String(id)]?.type === "Weapon"; },
  GetAverageItemLevel: (h) => {
    const inv = h.inventory(); const levels = Object.values(inv.equipped ?? {}).map((id) => inv.items[String(id)]?.level ?? 0);
    const avg = levels.length ? Math.floor(levels.reduce((x, y) => x + y, 0) / 16) : 0;
    return [avg, avg];
  },
  __inventory_for_slot: (h, a) => {
    const inv = h.inventory(); const slot = num(a[0]) ?? 0; const out: (string | number)[] = [];
    const cur = equippedID(inv, slot); if (cur !== undefined) out.push(0x100000 + slot, eqLink(inv, cur) ?? "");
    for (const [b, bag] of Object.entries(inv.bags)) for (const [s, v] of Object.entries(bag.slots)) if (fits(inv, v.id, slot)) out.push(0x300000 + (Number(b) << 8) + Number(s), eqLink(inv, v.id) ?? "");
    return out;
  },
  // ----- Bagnamen und Verwandtes · bag names and related -----
  GetBagName: (h, a) => { const b = h.inventory().bags[String(a[0])]; if (!b) return undefined; return a[0] === 0 ? "Backpack" : b.itemID !== undefined ? h.inventory().items[String(b.itemID)]?.name : undefined; },
  GetContainerItemCooldown: () => [0, 0, 1],
  HasKey: () => false,
  OpenAllBags: () => undefined, ToggleBackpack: () => undefined, ToggleBag: () => undefined,
  // ----- Cursor -----
  ClearCursor: (h) => { returnCursor(h); },
  ResetCursor: () => undefined, SetCursor: () => undefined, HideRepairCursor: () => undefined,
  ShowContainerSellCursor: () => undefined, ShowInspectCursor: () => undefined, ShowInventorySellCursor: () => undefined, ShowMerchantSellCursor: () => undefined, ShowRepairCursor: () => undefined,
  InRepairMode: () => false,
  CursorHasItem: (h) => gear(h).cursor?.kind === "item",
  CursorHasMoney: (h) => gear(h).cursor?.kind === "money",
  CursorHasSpell: (h) => gear(h).cursor?.kind === "spell",
  CursorHasMacro: () => false,
  GetCursorMoney: (h) => { const c = gear(h).cursor; return c?.kind === "money" ? c.amount : 0; },
  GetCursorInfo: (h) => {
    const c = gear(h).cursor; const inv = h.inventory();
    if (c?.kind === "item") return ["item", c.id, eqLink(inv, c.id)];
    if (c?.kind === "spell") return ["spell", 0, "spell"];
    if (c?.kind === "money") return ["money", c.amount];
    return undefined;
  },
  GetCursorPosition: () => [512, 384],
  PickupPlayerMoney: (h, a) => {
    const inv = h.inventory(); const g = gear(h); const n = Math.min(num(a[0]) ?? 0, inv.money ?? 0);
    if (n <= 0 || g.cursor) return;
    inv.money = (inv.money ?? 0) - n; g.cursor = { kind: "money", amount: n }; h.fire("PLAYER_MONEY");
  },
  DropCursorMoney: (h) => { const g = gear(h); if (g.cursor?.kind === "money") returnCursor(h); },
  PickupSpell: (h, a) => { const g = gear(h); if (!g.cursor && typeof a[0] === "number") g.cursor = { kind: "spell", spellID: a[0] }; },
  PickupContainerItem: (h, a) => { if (typeof a[0] === "number" && typeof a[1] === "number") pickBag(h, a[0], a[1]); },
  "C_Container.PickupContainerItem": (h, a) => GEAR_API.PickupContainerItem!(h, a),
  SplitContainerItem: (h, a) => { if (typeof a[0] === "number" && typeof a[1] === "number") pickBag(h, a[0], a[1], num(a[2])); },
  PickupInventoryItem: (h, a) => {
    const slot = num(a[0]); if (slot === undefined) return;
    const g = gear(h); const inv = h.inventory(); const cur = equippedID(inv, slot);
    if (!g.cursor) { if (cur === undefined) return; setEquipped(inv, slot, undefined); g.cursor = { kind: "item", id: cur, count: 1, from: { inv: slot } }; h.fire("UNIT_INVENTORY_CHANGED", "player"); return; }
    if (g.cursor.kind === "item" && fits(inv, g.cursor.id, slot)) {
      const id = g.cursor.id; setEquipped(inv, slot, id); delete g.cursor;
      if (cur !== undefined) g.cursor = { kind: "item", id: cur, count: 1, from: { inv: slot } };
      h.fire("UNIT_INVENTORY_CHANGED", "player");
    }
  },
  CursorCanGoInSlot: (h, a) => { const c = gear(h).cursor; return c?.kind === "item" && fits(h.inventory(), c.id, num(a[0]) ?? 0); },
  EquipCursorItem: (h, a) => {
    const g = gear(h); const c = g.cursor; if (c?.kind !== "item") return;
    const r = wear(h, c.id, num(a[0])); if (!r.ok) return;
    delete g.cursor; if (r.displaced !== undefined) g.cursor = { kind: "item", id: r.displaced, count: 1 };
    h.fire("UNIT_INVENTORY_CHANGED", "player");
  },
  AutoEquipCursorItem: (h) => { GEAR_API.EquipCursorItem!(h, [undefined]); },
  PutItemInBackpack: (h) => { const g = gear(h); const c = g.cursor; if (c?.kind === "item" && addItem(h.inventory(), c.id, c.count)) { delete g.cursor; h.fire("BAG_UPDATE", 0); } },
  PutItemInBag: (h) => GEAR_API.PutItemInBackpack!(h, []),
  DeleteCursorItem: (h) => { const g = gear(h); if (g.cursor?.kind === "item") delete g.cursor; },
  PickupBagFromSlot: () => undefined,
  UseInventoryItem: (h, a) => {
    const inv = h.inventory(); const id = equippedID(inv, num(a[0]) ?? 0); const it = id !== undefined ? inv.items[String(id)] : undefined;
    if (!it) return;
    h.note("info", it.usable ? `Used ${it.name} (the effect is not simulated).` : `UseInventoryItem: ${it.name} has no simulated use.`);
  },
  // ----- C_Container: Verschieben · moving -----
  "C_Container.SwapItems": (h, a) => {
    const [sb, ss, db, ds] = a.map(num);
    if (sb === undefined || ss === undefined || db === undefined || ds === undefined) return false;
    const inv = h.inventory(); const s = bagSlot(inv, sb, ss);
    if (!s || !inv.bags[String(db)] || ds < 1 || ds > inv.bags[String(db)]!.size) return false;
    const d = bagSlot(inv, db, ds);
    putSlot(inv, db, ds, s); putSlot(inv, sb, ss, d);
    h.fire("BAG_UPDATE", sb); if (db !== sb) h.fire("BAG_UPDATE", db);
    return true;
  },
  "C_Container.MoveItem": (h, a) => {
    const [sb, ss, db, ds, n] = a.map(num);
    if (sb === undefined || ss === undefined || db === undefined || ds === undefined || n === undefined || n < 1 || n > 255) return false;
    const inv = h.inventory(); const s = bagSlot(inv, sb, ss);
    if (!s || !inv.bags[String(db)] || ds < 1 || ds > inv.bags[String(db)]!.size) return false;
    const d = bagSlot(inv, db, ds); const max = inv.items[String(s.id)]?.stack ?? 1;
    const take = Math.min(n, s.count);
    if (d && d.id !== s.id) return false;
    if (d && d.count + take > max) return false;
    if (d) d.count += take; else putSlot(inv, db, ds, { id: s.id, count: take });
    s.count -= take; if (s.count <= 0) takeSlot(inv, sb, ss);
    h.fire("BAG_UPDATE", sb); if (db !== sb) h.fire("BAG_UPDATE", db);
    return true;
  },
  "C_Container.AutoStoreItem": (h, a) => {
    const sb = num(a[0]); const ss = num(a[1]); if (sb === undefined || ss === undefined) return false;
    const inv = h.inventory(); const s = takeSlot(inv, sb, ss); if (!s) return false;
    if (!addItem(inv, s.id, s.count)) { putSlot(inv, sb, ss, s); return false; }
    h.fire("BAG_UPDATE", sb); return true;
  },
  "C_Container.SortBags": (h) => {
    const inv = h.inventory(); const all: { id: number; count: number }[] = [];
    for (const k of Object.keys(inv.bags)) { const b = inv.bags[k]!; if ((b.family ?? 0) === 0) { for (const v of Object.values(b.slots)) all.push(v); b.slots = {}; } }
    all.sort((x, y) => (inv.items[String(y.id)]?.quality ?? 0) - (inv.items[String(x.id)]?.quality ?? 0) || x.id - y.id);
    for (const v of all) addItem(inv, v.id, v.count);
    h.fire("BAG_UPDATE", 0);
  },
  "C_Container.SortBankBags": () => undefined,
  "C_Container.UseContainerItem": (h, a) => { if (typeof a[0] === "number" && typeof a[1] === "number") useBagItem(h, a[0], a[1]); },
  "C_Container.GetContainerNumSlots": (h, a) => h.inventory().bags[String(a[0])]?.size ?? 0,
  "C_Container.PlayerHasHearthstone": (h) => (Object.values(h.inventory().bags).some((b) => Object.values(b.slots).some((s) => s.id === 6948)) ? 6948 : undefined),
  "C_Container.UseHearthstone": (h) => { const has = GEAR_API["C_Container.PlayerHasHearthstone"]!(h, []) !== undefined; if (has) h.note("info", "Hearthstone used (the cast is not simulated)."); return has; },
  "C_Container.GetContainerItemDurability": (h, a) => { const s = bagSlot(h.inventory(), num(a[0]) ?? -1, num(a[1]) ?? 0); const d = s ? h.inventory().items[String(s.id)]?.durability : undefined; return d ? [d[0], d[1]] : undefined; },
  "C_Container.GetContainerItemRepairCost": () => 0,
  "C_Container.GetContainerItemCharges": (h, a) => { const s = bagSlot(h.inventory(), num(a[0]) ?? -1, num(a[1]) ?? 0); return s ? s.count : 0; },
  "C_Container.GetContainerItemQuestInfo": (h, a) => { const s = bagSlot(h.inventory(), num(a[0]) ?? -1, num(a[1]) ?? 0); return s ? [{ isQuestItem: false, isActive: false }] : undefined; },
  "C_Container.GetContainerItemEquipmentSetInfo": (h, a) => {
    const s = bagSlot(h.inventory(), num(a[0]) ?? -1, num(a[1]) ?? 0); if (!s) return [false, ""];
    const names = gear(h).sets.filter((x) => Object.values(x.items).includes(s.id)).map((x) => x.name);
    return [names.length > 0, names.join(", ")];
  },
  "C_Container.IsContainerItemOpenable": () => [false, false],
  "C_Container.IsContainerFiltered": () => false,
  "C_Container.SetItemSearch": () => undefined,
  "C_Container.GetItemCooldown": () => [0, 0, 1],
  GetItemCooldown: () => [0, 0, 1],
  "C_Container.GetBackpackAutosortDisabled": () => false, "C_Container.GetBankAutosortDisabled": () => false, "C_Container.GetSortBagsRightToLeft": () => false,
  "C_Container.SetBackpackAutosortDisabled": () => undefined, "C_Container.SetBankAutosortDisabled": () => undefined, "C_Container.SetSortBagsRightToLeft": () => undefined,
  "C_Container.SetBagPortraitTexture": () => undefined, SetBagPortraitTexture: () => undefined, SetInventoryPortaitTexture: () => undefined, SetInventoryPortraitTexture: () => undefined,
  // ----- Ausrüstungssets · equipment sets -----
  "C_EquipmentSet.CanUseEquipmentSets": () => true,
  "C_EquipmentSet.GetNumEquipmentSets": (h) => gear(h).sets.length,
  "C_EquipmentSet.GetEquipmentSetIDs": (h) => [gear(h).sets.map((s) => s.setID)],
  "C_EquipmentSet.GetEquipmentSetID": (h, a) => gear(h).sets.find((s) => s.name === a[0])?.setID,
  "C_EquipmentSet.GetEquipmentSetInfo": (h, a) => { const s = setOf(h, a[0]); return s ? equipmentSetInfo(h, s) : undefined; },
  "C_EquipmentSet.GetIgnoredSlots": (h, a) => { const s = setOf(h, a[0]); return [s ? s.ignored : []]; },
  "C_EquipmentSet.GetItemIDs": (h, a) => {
    const s = setOf(h, a[0]); if (!s) return undefined;
    const o: Record<number, number> = {};
    for (let i = 1; i <= 19; i++) o[i] = s.ignored.includes(i) ? 1 : s.items[String(i)] ?? 0;
    return [o];
  },
  "C_EquipmentSet.GetItemLocations": (h, a) => {
    const s = setOf(h, a[0]); if (!s) return undefined;
    const inv = h.inventory(); const o: Record<number, number> = {};
    for (let i = 1; i <= 19; i++) {
      const want = s.items[String(i)]; let code = 0;
      if (want !== undefined) {
        if (equippedID(inv, i) === want) code = 0x100000 + i;
        else for (const [b, bag] of Object.entries(inv.bags)) for (const [sl, v] of Object.entries(bag.slots)) if (!code && v.id === want) code = 0x300000 + (Number(b) << 8) + Number(sl);
      }
      o[i] = code;
    }
    return [o];
  },
  "C_EquipmentSet.CreateEquipmentSet": (h, a) => {
    const g = gear(h); const name = validName(a[0]);
    if (!name || g.sets.some((s) => s.name === name)) return undefined;
    const snap = snapshot(h);
    const s: EquipmentSet = { setID: g.nextSetID++, name, icon: str(a[1]) ?? "INV_Misc_QuestionMark", ...snap };
    g.sets.push(s); h.fire("EQUIPMENT_SETS_CHANGED");
    return s.setID;
  },
  "C_EquipmentSet.SaveEquipmentSet": (h, a) => {
    const s = setOf(h, a[0]); if (!s) return;
    Object.assign(s, snapshot(h)); if (typeof a[1] === "string") s.icon = a[1];
    h.fire("EQUIPMENT_SETS_CHANGED");
  },
  "C_EquipmentSet.ModifyEquipmentSet": (h, a) => {
    const s = setOf(h, a[0]); const name = validName(a[1]); const g = gear(h);
    if (!s || !name || g.sets.some((x) => x !== s && x.name === name)) return;
    s.name = name; h.fire("EQUIPMENT_SETS_CHANGED");
  },
  "C_EquipmentSet.DeleteEquipmentSet": (h, a) => { const g = gear(h); const i = g.sets.findIndex((s) => s.setID === a[0]); if (i >= 0) { g.sets.splice(i, 1); h.fire("EQUIPMENT_SETS_CHANGED"); } },
  "C_EquipmentSet.IgnoreSlotForSave": (h, a) => { const n = num(a[0]); if (n && n >= 1 && n <= 19) gear(h).ignoreForSave.add(n); },
  "C_EquipmentSet.UnignoreSlotForSave": (h, a) => { const n = num(a[0]); if (n) gear(h).ignoreForSave.delete(n); },
  "C_EquipmentSet.IsSlotIgnoredForSave": (h, a) => gear(h).ignoreForSave.has(num(a[0]) ?? 0),
  "C_EquipmentSet.ClearIgnoredSlotsForSave": (h) => { gear(h).ignoreForSave.clear(); },
  "C_EquipmentSet.EquipmentSetContainsLockedItems": () => false,
  "C_EquipmentSet.UseEquipmentSet": (h, a) => {
    const s = setOf(h, a[0]); const g = gear(h); if (!s) return false;
    if (g.cursor) { h.note("warn", "UseEquipmentSet: the cursor holds an item (ERR_CLIENT_LOCKED_OUT)."); return false; }
    const inv = h.inventory();
    for (let slot = 1; slot <= 19; slot++) {
      if (s.ignored.includes(slot)) continue;
      const want = s.items[String(slot)]; const have = equippedID(inv, slot);
      if (want === have) continue;
      if (want === undefined) { if (have !== undefined && addItem(inv, have, 1)) setEquipped(inv, slot, undefined); continue; }
      let found: [string, string] | undefined;
      for (const [b, bag] of Object.entries(inv.bags)) for (const [sl, v] of Object.entries(bag.slots)) if (!found && v.id === want) found = [b, sl];
      if (!found) { h.note("warn", `UseEquipmentSet: ${inv.items[String(want)]?.name ?? want} is missing.`); continue; }
      takeSlot(inv, Number(found[0]), Number(found[1]));
      setEquipped(inv, slot, want);
      if (have !== undefined) putSlot(inv, Number(found[0]), Number(found[1]), { id: have, count: 1 });
    }
    h.fire("UNIT_INVENTORY_CHANGED", "player"); h.fire("BAG_UPDATE", 0); h.fire("EQUIPMENT_SWAP_FINISHED", true, s.setID);
    return true;
  },
  "C_EquipmentSet.PickupEquipmentSet": () => undefined,
};
void resolveItemID;
