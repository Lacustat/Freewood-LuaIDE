/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Datentypen · data types ... LootState, MerchantState, GossipState, InteractionState
 *   [S2] Beispieldaten · samples ... SAMPLE_LOOT, SAMPLE_MERCHANT, SAMPLE_GOSSIP
 *   [S3] INTERACTION_API ........... Beute-Fenster, Händler, Gossip (primitive Rückgaben, Ereignisse)
 *
 * DE: Fenster, die ein NPC oder eine Leiche öffnet: Beute, Händler, Gossip. Sie sind zu Anfang
 *     geschlossen; `WowSim.openLoot/openMerchant/openGossip` (oder die Schaltflächen der Seitenleiste)
 *     öffnen sie und lösen die Ereignisse aus. Was ein gewählter Gossip-Eintrag bewirkt, kennt die
 *     Simulation nicht (nur Protokoll + Schließen).
 * EN: windows opened by an NPC or a corpse: loot, merchant, gossip. They start closed; the
 *     `WowSim.openLoot/openMerchant/openGossip` methods (or the sidebar buttons) open them and fire
 *     the events. What a chosen gossip entry does is unknown to the simulation (log + close only).
 */

import { addItem, itemLink, takeSlot, type InventoryState } from "./inventory.js";

// ===== [S1] Datentypen · data types =====

export interface LootState { items: { id: number; count: number }[]; money: number }
export interface MerchantItem { id: number; price: number; stack?: number; available?: number }
export interface MerchantState { items: MerchantItem[] }
export interface GossipOption { id: number; name: string; icon?: number; flags?: number }
export interface GossipQuest { questID: number; title: string; level: number; complete?: boolean }
export interface GossipState { text: string; options: GossipOption[]; available: GossipQuest[]; active: GossipQuest[] }

export interface InteractionState {
  loot?: LootState;
  merchant?: MerchantState;
  gossip?: GossipState;
  buyback: { id: number; count: number; price: number }[];
}

// ===== [S2] Beispieldaten · samples =====

export const SAMPLE_LOOT: LootState = { items: [{ id: 2589, count: 2 }, { id: 99001, count: 1 }], money: 134 };
export const SAMPLE_MERCHANT: MerchantState = { items: [{ id: 117, price: 25, stack: 1 }, { id: 159, price: 25, stack: 5 }, { id: 4496, price: 100, stack: 1, available: 3 }] };
export const SAMPLE_GOSSIP: GossipState = {
  text: "Greetings, adventurer. Can I help you?",
  options: [{ id: 1, name: "I want to browse your goods.", icon: 1 }, { id: 2, name: "Make this inn your home.", icon: 5 }],
  available: [{ questID: 7, title: "Kobold Camp Cleanup", level: 2 }],
  active: [{ questID: 783, title: "A Threat Within", level: 1, complete: true }],
};

// ===== [S3] INTERACTION_API =====

export interface InteractionHost {
  inventory(): InventoryState;
  interaction(): InteractionState;
  fire(event: string, ...args: (string | number | boolean)[]): void;
  note(kind: "info" | "warn", text: string): void;
}

type Impl = (h: InteractionHost, a: unknown[]) => unknown;

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

function meta(h: InteractionHost, id: number): { name: string; icon: string; quality: number; link: string; sell: number } {
  const it = h.inventory().items[String(id)];
  return it ? { name: it.name, icon: it.icon ?? "", quality: it.quality, link: itemLink(id, it), sell: it.sellPrice ?? 0 } : { name: `item:${id}`, icon: "", quality: 1, link: `item:${id}`, sell: 0 };
}

function junkSlots(h: InteractionHost): [number, number][] {
  const inv = h.inventory();
  const out: [number, number][] = [];
  for (const [b, bag] of Object.entries(inv.bags)) for (const [s, slot] of Object.entries(bag.slots)) if (inv.items[String(slot.id)]?.quality === 0) out.push([Number(b), Number(s)]);
  return out;
}

function sellSlot(h: InteractionHost, bag: number, slot: number): boolean {
  const inv = h.inventory();
  const st = h.interaction();
  const s = takeSlot(inv, bag, slot);
  if (!s) return false;
  const price = meta(h, s.id).sell * s.count;
  inv.money = (inv.money ?? 0) + price;
  st.buyback.unshift({ id: s.id, count: s.count, price });
  if (st.buyback.length > 12) st.buyback.pop();
  h.fire("BAG_UPDATE", bag);
  h.fire("PLAYER_MONEY");
  return true;
}

export const INTERACTION_API: Record<string, Impl> = {
  // ----- Beute · loot -----
  GetNumLootItems: (h) => h.interaction().loot?.items.length ?? 0,
  GetLootSlotInfo: (h, a) => {
    const l = h.interaction().loot; const i = num(a[0]);
    if (!l || i === undefined) return undefined;
    const it = l.items[i - 1];
    if (!it) return undefined;
    const m = meta(h, it.id);
    return [m.icon, m.name, it.count, m.quality];
  },
  GetLootSlotLink: (h, a) => { const it = h.interaction().loot?.items[(num(a[0]) ?? 0) - 1]; return it ? meta(h, it.id).link : undefined; },
  LootSlotIsItem: (h, a) => h.interaction().loot?.items[(num(a[0]) ?? 0) - 1] !== undefined,
  LootSlotIsCoin: () => false,
  LootSlot: (h, a) => {
    const l = h.interaction().loot; const i = num(a[0]);
    const it = l && i !== undefined ? l.items[i - 1] : undefined;
    if (!l || !it || i === undefined) return;
    if (!addItem(h.inventory(), it.id, it.count)) { h.note("warn", "LootSlot: the bags are full."); return; }
    l.items.splice(i - 1, 1);
    h.fire("LOOT_SLOT_CLEARED", i);
    h.fire("BAG_UPDATE", 0);
  },
  CloseLoot: (h) => {
    const st = h.interaction();
    if (!st.loot) return;
    delete st.loot;
    h.fire("LOOT_CLOSED");
  },
  // ----- Händler · merchant -----
  GetMerchantNumItems: (h) => h.interaction().merchant?.items.length ?? 0,
  GetMerchantItemInfo: (h, a) => {
    const it = h.interaction().merchant?.items[(num(a[0]) ?? 0) - 1];
    if (!it) return undefined;
    const m = meta(h, it.id);
    return [m.name, m.icon, it.price, it.stack ?? 1, it.available ?? -1, true];
  },
  GetMerchantItemLink: (h, a) => { const it = h.interaction().merchant?.items[(num(a[0]) ?? 0) - 1]; return it ? meta(h, it.id).link : undefined; },
  BuyMerchantItem: (h, a) => {
    const m = h.interaction().merchant; const it = m?.items[(num(a[0]) ?? 0) - 1];
    if (!m || !it) return;
    const inv = h.inventory();
    const stack = it.stack ?? 1;
    const qty = num(a[1]) ?? stack;
    const cost = it.price * Math.ceil(qty / stack);
    if ((inv.money ?? 0) < cost) { h.note("warn", "BuyMerchantItem: not enough money."); return; }
    if (it.available !== undefined && it.available <= 0) return;
    if (!addItem(inv, it.id, qty)) { h.note("warn", "BuyMerchantItem: the bags are full."); return; }
    inv.money = (inv.money ?? 0) - cost;
    if (it.available !== undefined) it.available -= 1;
    h.fire("BAG_UPDATE", 0);
    h.fire("PLAYER_MONEY");
  },
  UseContainerItem: (h, a) => {
    if (!h.interaction().merchant) { h.note("warn", "UseContainerItem: using items is not simulated (only selling at a vendor)."); return; }
    if (typeof a[0] === "number" && typeof a[1] === "number") sellSlot(h, a[0], a[1]);
  },
  CloseMerchant: (h) => {
    const st = h.interaction();
    if (!st.merchant) return;
    delete st.merchant;
    h.fire("MERCHANT_CLOSED");
  },
  GetNumBuybackItems: (h) => h.interaction().buyback.length,
  GetBuybackItemInfo: (h, a) => {
    const b = h.interaction().buyback[(num(a[0]) ?? 0) - 1];
    if (!b) return undefined;
    const m = meta(h, b.id);
    return [m.name, m.icon, b.price, b.count];
  },
  GetBuybackItemLink: (h, a) => { const b = h.interaction().buyback[(num(a[0]) ?? 0) - 1]; return b ? meta(h, b.id).link : undefined; },
  "C_MerchantFrame.GetBuybackItemID": (h, a) => h.interaction().buyback[(num(a[0]) ?? 0) - 1]?.id,
  "C_MerchantFrame.GetNumJunkItems": (h) => (h.interaction().merchant ? junkSlots(h).length : 0),
  "C_MerchantFrame.SellAllJunkItems": (h) => { if (h.interaction().merchant) for (const [b, s] of junkSlots(h)) sellSlot(h, b, s); },
  "C_MerchantFrame.IsMerchantItemRefundable": () => false,
  "C_MerchantFrame.IsSellAllJunkEnabled": () => true,
  __merchant_item: (h, a) => {
    const it = h.interaction().merchant?.items[(num(a[0]) ?? 0) - 1];
    return it ? [it.id, it.price, it.stack ?? 1, it.available ?? -1, true, false, false] : undefined;
  },
  // ----- Gossip -----
  GetGossipText: (h) => h.interaction().gossip?.text,
  GetNumGossipOptions: (h) => h.interaction().gossip?.options.length ?? 0,
  GetNumGossipAvailableQuests: (h) => h.interaction().gossip?.available.length ?? 0,
  GetNumGossipActiveQuests: (h) => h.interaction().gossip?.active.length ?? 0,
  GetGossipOptions: (h) => (h.interaction().gossip?.options ?? []).flatMap((o) => [o.name, ["gossip", "vendor", "taxi", "trainer", "healer", "binder", "banker", "petition", "tabard", "battlemaster", "auctioneer"][o.icon ?? 0] ?? "gossip"]),
  GetGossipAvailableQuests: (h) => (h.interaction().gossip?.available ?? []).flatMap((q) => [q.title, q.level, false, false, false]),
  GetGossipActiveQuests: (h) => (h.interaction().gossip?.active ?? []).flatMap((q) => [q.title, q.level, false, q.complete === true]),
  SelectGossipOption: (h, a) => {
    const g = h.interaction().gossip; const o = g?.options[(num(a[0]) ?? 0) - 1];
    if (!g || !o) return;
    h.note("info", `Gossip option selected: "${o.name}" (the result is not simulated).`);
    delete h.interaction().gossip;
    h.fire("GOSSIP_CLOSED");
  },
  SelectGossipAvailableQuest: (h, a) => { const q = h.interaction().gossip?.available[(num(a[0]) ?? 0) - 1]; if (q) h.note("info", `Gossip: available quest "${q.title}" selected (not simulated).`); },
  SelectGossipActiveQuest: (h, a) => { const q = h.interaction().gossip?.active[(num(a[0]) ?? 0) - 1]; if (q) h.note("info", `Gossip: active quest "${q.title}" selected (not simulated).`); },
  CloseGossip: (h) => {
    const st = h.interaction();
    if (!st.gossip) return;
    delete st.gossip;
    h.fire("GOSSIP_CLOSED");
  },
  "C_GossipInfo.GetText": (h) => h.interaction().gossip?.text,
  "C_GossipInfo.GetNumOptions": (h) => h.interaction().gossip?.options.length ?? 0,
  "C_GossipInfo.GetNumAvailableQuests": (h) => h.interaction().gossip?.available.length ?? 0,
  "C_GossipInfo.GetNumActiveQuests": (h) => h.interaction().gossip?.active.length ?? 0,
  "C_GossipInfo.CloseGossip": (h) => INTERACTION_API.CloseGossip!(h, []),
  "C_GossipInfo.SelectOptionByIndex": (h, a) => INTERACTION_API.SelectGossipOption!(h, a),
  "C_GossipInfo.SelectOption": (h, a) => {
    const k = h.interaction().gossip?.options.findIndex((o) => o.id === a[0]) ?? -1;
    if (k >= 0) INTERACTION_API.SelectGossipOption!(h, [k + 1]);
  },
  "C_GossipInfo.SelectAvailableQuest": (h, a) => { const k = h.interaction().gossip?.available.findIndex((q) => q.questID === a[0]) ?? -1; if (k >= 0) INTERACTION_API.SelectGossipAvailableQuest!(h, [k + 1]); },
  "C_GossipInfo.SelectActiveQuest": (h, a) => { const k = h.interaction().gossip?.active.findIndex((q) => q.questID === a[0]) ?? -1; if (k >= 0) INTERACTION_API.SelectGossipActiveQuest!(h, [k + 1]); },
  __gossip_options: (h) => (h.interaction().gossip?.options ?? []).flatMap((o, i) => [o.id, o.name, o.icon ?? 0, o.flags ?? 0, i + 1]),
  __gossip_quests: (h, a) => ((a[0] === "active" ? h.interaction().gossip?.active : h.interaction().gossip?.available) ?? []).flatMap((q) => [q.questID, q.title, q.level, q.complete === true]),
};
