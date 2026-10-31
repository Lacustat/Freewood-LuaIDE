/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Hilfen · helpers .......... im, WindowState, win
 *   [S2] Post · mail ............... MAIL_API
 *   [S3] Auktionshaus · auction .... AUCTION_API
 *   [S4] Bank, Handel · bank, trade  BANK_API, TRADE_API
 *   [S5] Sonstige Fenster · other .. ITEMTEXT_API, LOOTROLL_API, MERCHANT2_API, GM_API
 *   [S6] OPENERS_1 ................. öffnet die Fenster · opens the windows
 *
 * DE: Fenster-Funktionen, die ein NPC oder Briefkasten öffnet. Alle Fenster sind zu Anfang geschlossen
 *     (die Abfragen liefern dann 0/nil wie auf OctoWoW, Probe). `WowSim.openWindow("mail"|"auction"|...)`
 *     öffnet sie mit erfundenen Beispieldaten und löst die Ereignisse aus. Was ein Server dazu
 *     entscheiden würde (Preise, Annahme beim Handel) ist vereinfacht.
 * EN: window functions opened by an NPC or mailbox. All windows start closed (queries then return
 *     0/nil as on OctoWoW, probe). `WowSim.openWindow(...)` opens them with invented sample data and
 *     fires the events. What a server would decide (prices, trade acceptance) is simplified.
 */

import { type Impl, type SimHost, num, str } from "./host.js";
import { addItem, itemLink, takeSlot } from "./inventory.js";
import { gear } from "./gear.js";

// ===== [S1] Hilfen · helpers =====

export function im(h: SimHost, id: number): { name: string; icon: string; quality: number; link: string } {
  const it = h.inventory().items[String(id)];
  return it ? { name: it.name, icon: it.icon ?? "", quality: it.quality, link: itemLink(id, it) } : { name: `item:${id}`, icon: "", quality: 1, link: `item:${id}` };
}

interface Mail { sender: string; subject: string; body: string; money: number; cod: number; days: number; item?: { id: number; count: number }; read: boolean; returned?: boolean; gm?: boolean }
interface Auction { id: number; count: number; minBid: number; inc: number; buyout: number; bid: number; high: boolean; owner: string; left: number; level: number }
interface Trade { partner: string; money: [number, number]; items: [Record<number, { id: number; count: number }>, Record<number, { id: number; count: number }>]; accepted: [boolean, boolean] }
interface Ticket { category: number; text: string }

export interface WindowState {
  mail?: { inbox: Mail[]; send: { item?: { id: number; count: number }; money: number; cod: number }; stationery: number; pkg: number };
  auction?: { list: Auction[]; owned: Auction[]; bidder: Auction[]; sell?: { id: number; count: number }; selected: Record<string, number>; reversed: boolean };
  bank?: { slots: number };
  trade?: Trade;
  itemText?: { pages: string[]; page: number; creator: string; item: string; material: string };
  rolls: { id: number; item: number; ends: number }[];
  ticket?: Ticket;
  gmStatus: boolean;
}
export const win = (h: SimHost): WindowState => h.store("windows1", (): WindowState => ({ rolls: [], gmStatus: false }));
const money = (h: SimHost): number => h.inventory().money ?? 0;
const pay = (h: SimHost, n: number): void => { h.inventory().money = money(h) - n; h.fireIf("PLAYER_MONEY"); };

// ===== [S2] Post · mail =====

const mailOf = (h: SimHost, i: unknown): Mail | undefined => win(h).mail?.inbox[(num(i) ?? 0) - 1];
const STATIONERY = [["Default Stationery", "Interface\\Icons\\INV_Misc_Note_01", 0]] as const;

export const MAIL_API: Record<string, Impl> = {
  CheckInbox: (h) => { if (win(h).mail) h.fireIf("MAIL_INBOX_UPDATE"); },
  GetInboxNumItems: (h) => { const m = win(h).mail; return m ? [m.inbox.length, m.inbox.length] : 0; },
  GetInboxHeaderInfo: (h, a) => {
    const m = mailOf(h, a[0]); if (!m) return undefined;
    return [m.item ? im(h, m.item.id).icon : "Interface\\Icons\\INV_Letter_15", "Interface\\Icons\\INV_Letter_15", m.sender, m.subject, m.money, m.cod, m.days, !!m.item, m.read, !!m.returned, m.body.length > 0, !m.gm && !m.returned, !!m.gm];
  },
  GetInboxText: (h, a) => { const m = mailOf(h, a[0]); if (!m) return undefined; m.read = true; return [m.body, "Interface\\Icons\\INV_Letter_15", false, false]; },
  GetInboxItem: (h, a) => { const m = mailOf(h, a[0]); if (!m?.item) return undefined; const x = im(h, m.item.id); return [x.name, x.icon, m.item.count, x.quality, true]; },
  GetInboxInvoiceInfo: () => undefined,
  InboxItemCanDelete: (h, a) => { const m = mailOf(h, a[0]); return !!m && !m.item && m.money === 0; },
  TakeInboxItem: (h, a) => {
    const w = win(h).mail; const m = mailOf(h, a[0]); if (!w || !m?.item) return;
    if (m.cod > 0 && money(h) < m.cod) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    if (!addItem(h.inventory(), m.item.id, m.item.count)) { h.fireIf("UI_ERROR_MESSAGE", "Inventory is full"); return; }
    if (m.cod > 0) { pay(h, m.cod); m.cod = 0; }
    delete m.item; h.fireIf("BAG_UPDATE", 0); h.fireIf("MAIL_INBOX_UPDATE");
  },
  TakeInboxMoney: (h, a) => { const m = mailOf(h, a[0]); if (!m || m.money <= 0) return; h.inventory().money = money(h) + m.money; m.money = 0; h.fireIf("PLAYER_MONEY"); h.fireIf("MAIL_INBOX_UPDATE"); },
  TakeInboxTextItem: (h, a) => MAIL_API.TakeInboxItem!(h, a),
  DeleteInboxItem: (h, a) => { const w = win(h).mail; const k = (num(a[0]) ?? 0) - 1; if (w && w.inbox[k]) { w.inbox.splice(k, 1); h.fireIf("MAIL_INBOX_UPDATE"); } },
  ReturnInboxItem: (h, a) => { const w = win(h).mail; const k = (num(a[0]) ?? 0) - 1; if (w && w.inbox[k]) { w.inbox.splice(k, 1); h.fireIf("MAIL_INBOX_UPDATE"); h.note("info", "ReturnInboxItem: the mail was returned to its sender."); } },
  HasNewMail: (h) => !!win(h).mail?.inbox.some((m) => !m.read),
  CloseMail: (h) => { const w = win(h); if (w.mail) { delete w.mail; h.fireIf("MAIL_CLOSED"); } },
  ClearSendMail: (h) => { const m = win(h).mail; if (m) m.send = { money: 0, cod: 0 }; },
  ClickSendMailItemButton: (h) => {
    const m = win(h).mail; if (!m) return;
    const g = gear(h);
    if (g.cursor?.kind === "item") { m.send.item = { id: g.cursor.id, count: g.cursor.count }; delete g.cursor; h.fireIf("MAIL_SEND_INFO_UPDATE"); }
    else if (m.send.item) { addItem(h.inventory(), m.send.item.id, m.send.item.count); delete m.send.item; h.fireIf("MAIL_SEND_INFO_UPDATE"); }
  },
  GetSendMailItem: (h) => { const it = win(h).mail?.send.item; if (!it) return [undefined, undefined, 0, 0]; const x = im(h, it.id); return [x.name, x.icon, it.count, x.quality]; },
  SetSendMailMoney: (h, a) => { const m = win(h).mail; if (m) { m.send.money = Math.max(0, num(a[0]) ?? 0); m.send.cod = 0; h.fireIf("MAIL_SEND_INFO_UPDATE"); } },
  SetSendMailCOD: (h, a) => { const m = win(h).mail; if (m) { m.send.cod = Math.max(0, num(a[0]) ?? 0); m.send.money = 0; h.fireIf("MAIL_SEND_INFO_UPDATE"); } },
  GetSendMailMoney: (h) => win(h).mail?.send.money ?? 0,
  GetSendMailCOD: (h) => win(h).mail?.send.cod ?? 0,
  GetSendMailPrice: (h) => 30 + (STATIONERY[win(h).mail?.stationery ?? 0]?.[2] ?? 0),
  SendMail: (h, a) => {
    const m = win(h).mail; const to = str(a[0]); if (!m || !to) return;
    const cost = MAIL_API.GetSendMailPrice!(h, []) as number + m.send.money;
    if (money(h) < cost) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); h.fireIf("MAIL_FAILED"); return; }
    pay(h, cost);
    h.note("info", `Mail to ${to} sent ("${str(a[1]) ?? ""}"); the recipient is not simulated.`);
    m.send = { money: 0, cod: 0 }; h.later(0.2, () => { h.fireIf("MAIL_SEND_SUCCESS"); h.fireIf("MAIL_SEND_INFO_UPDATE"); });
  },
  GetNumStationeries: () => STATIONERY.length,
  GetStationeryInfo: (_h, a) => { const s = STATIONERY[(num(a[0]) ?? 0) - 1]; return s ? [s[0], s[1], s[2]] : [undefined, undefined, undefined]; },
  SelectStationery: (h, a) => { const m = win(h).mail; if (m) m.stationery = Math.max(0, (num(a[0]) ?? 1) - 1); },
  GetSelectedStationeryTexture: (h) => STATIONERY[win(h).mail?.stationery ?? 0]?.[1],
  GetNumPackages: () => 1,
  GetPackageInfo: (_h, a) => (a[0] === 1 ? ["Default", "Interface\\Icons\\INV_Misc_Bag_09", 0] : undefined),
  SelectPackage: (h, a) => { const m = win(h).mail; if (m) m.pkg = num(a[0]) ?? 1; },
};

// ===== [S3] Auktionshaus · auction =====

const AH_CLASSES = ["Weapon", "Armor", "Container", "Consumable", "Trade Goods", "Projectile", "Quiver", "Recipe", "Reagent", "Miscellaneous"];
const AH_SUB: Record<number, string[]> = { 1: ["One-Handed Axes", "Two-Handed Axes", "Bows", "Daggers", "One-Handed Swords", "Staves"], 2: ["Miscellaneous", "Cloth", "Leather", "Mail", "Plate", "Shields"], 4: ["Food & Drink", "Potion", "Elixir", "Flask"], 5: ["Cloth", "Leather", "Metal & Stone", "Herb"] };
const AH_TYPES = ["INVTYPE_HEAD", "INVTYPE_NECK", "INVTYPE_SHOULDER", "INVTYPE_CHEST", "INVTYPE_WAIST", "INVTYPE_LEGS", "INVTYPE_FEET", "INVTYPE_WRIST", "INVTYPE_HAND", "INVTYPE_FINGER", "INVTYPE_TRINKET", "INVTYPE_CLOAK"];
type Kind = "list" | "owner" | "bidder";
const ahList = (h: SimHost, k: unknown): Auction[] => { const a = win(h).auction; return !a ? [] : k === "owner" ? a.owned : k === "bidder" ? a.bidder : a.list; };
const ahItem = (h: SimHost, k: unknown, i: unknown): Auction | undefined => ahList(h, k)[(num(i) ?? 0) - 1];

export const AUCTION_API: Record<string, Impl> = {
  CanSendAuctionQuery: (h) => !!win(h).auction,
  QueryAuctionItems: (h, a) => {
    const w = win(h).auction; if (!w) return;
    h.later(0.3, () => h.fireIf("AUCTION_ITEM_LIST_UPDATE"));
    void a;
  },
  GetNumAuctionItems: (h, a) => { const l = ahList(h, a[0]); return [l.length, l.length]; },
  GetAuctionItemInfo: (h, a) => {
    const x = ahItem(h, a[0], a[1]); if (!x) return [undefined, undefined, 1, -1, undefined, 0, 0, 0, 0, 0, undefined, undefined];
    const m = im(h, x.id); const lvl = h.inventory().items[String(x.id)]?.level ?? x.level;
    return [m.name, m.icon, x.count, m.quality, true, lvl, x.minBid, x.inc, x.buyout, x.bid, x.high, x.owner];
  },
  GetAuctionItemLink: (h, a) => { const x = ahItem(h, a[0], a[1]); return x ? im(h, x.id).link : undefined; },
  GetAuctionItemTimeLeft: (h, a) => ahItem(h, a[0], a[1])?.left,
  SetSelectedAuctionItem: (h, a) => { const w = win(h).auction; if (w) w.selected[String(a[0])] = num(a[1]) ?? 0; },
  GetSelectedAuctionItem: (h, a) => win(h).auction?.selected[String(a[0])] ?? 0,
  SortAuctionItems: (h, a) => { const w = win(h).auction; if (!w) return; const l = ahList(h, a[0]); const key = str(a[1]) ?? "name"; l.sort((x, y) => (key === "buyout" ? x.buyout - y.buyout : key === "bid" ? x.bid - y.bid : im(h, x.id).name.localeCompare(im(h, y.id).name))); w.reversed = !w.reversed; h.fireIf("AUCTION_ITEM_LIST_UPDATE"); },
  IsAuctionSortReversed: (h) => win(h).auction?.reversed === true,
  PlaceAuctionBid: (h, a) => {
    const x = ahItem(h, a[0], a[1]); const bid = num(a[2]) ?? 0; if (!x) return;
    if (money(h) < bid) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    if (bid < x.minBid) { h.fireIf("UI_ERROR_MESSAGE", "Your bid is too low"); return; }
    pay(h, bid);
    if (x.buyout > 0 && bid >= x.buyout) { addItem(h.inventory(), x.id, x.count); const l = ahList(h, a[0]); l.splice(l.indexOf(x), 1); h.fireIf("BAG_UPDATE", 0); }
    else { x.bid = bid; x.high = true; x.minBid = bid + x.inc; }
    h.fireIf("AUCTION_ITEM_LIST_UPDATE"); h.fireIf("AUCTION_BIDDER_LIST_UPDATE");
  },
  ClickAuctionSellItemButton: (h) => {
    const w = win(h).auction; if (!w) return;
    const g = gear(h);
    if (g.cursor?.kind === "item") { w.sell = { id: g.cursor.id, count: g.cursor.count }; delete g.cursor; h.fireIf("NEW_AUCTION_UPDATE"); }
    else if (w.sell) { addItem(h.inventory(), w.sell.id, w.sell.count); delete w.sell; h.fireIf("NEW_AUCTION_UPDATE"); }
  },
  GetAuctionSellItemInfo: (h) => { const s = win(h).auction?.sell; if (!s) return undefined; const m = im(h, s.id); return [m.name, m.icon, s.count, m.quality, true, h.inventory().items[String(s.id)]?.sellPrice ?? 0]; },
  GetAuctionHouseDepositRate: () => 5,
  CalculateAuctionDeposit: (h, a) => { const s = win(h).auction?.sell; if (!s) return 0; const price = (h.inventory().items[String(s.id)]?.sellPrice ?? 0) * s.count; return Math.max(1, Math.floor(price * 0.05 * (num(a[0]) ?? 12) / 2)); },
  StartAuction: (h, a) => {
    const w = win(h).auction; if (!w?.sell) return;
    const dep = AUCTION_API.CalculateAuctionDeposit!(h, [a[2]]) as number;
    if (money(h) < dep) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    pay(h, dep);
    w.owned.push({ id: w.sell.id, count: w.sell.count, minBid: num(a[0]) ?? 1, inc: 1, buyout: num(a[1]) ?? 0, bid: 0, high: false, owner: "Player", left: 4, level: 1 });
    delete w.sell; h.fireIf("NEW_AUCTION_UPDATE"); h.fireIf("AUCTION_OWNED_LIST_UPDATE");
  },
  CancelAuction: (h, a) => {
    const w = win(h).auction; const k = (num(a[0]) ?? 0) - 1; if (!w || !w.owned[k]) return;
    const x = w.owned.splice(k, 1)[0]!; addItem(h.inventory(), x.id, x.count); h.fireIf("BAG_UPDATE", 0); h.fireIf("AUCTION_OWNED_LIST_UPDATE");
  },
  GetOwnerAuctionItems: (h) => { if (win(h).auction) h.later(0.2, () => h.fireIf("AUCTION_OWNED_LIST_UPDATE")); },
  GetBidderAuctionItems: (h) => { if (win(h).auction) h.later(0.2, () => h.fireIf("AUCTION_BIDDER_LIST_UPDATE")); },
  GetAuctionItemClasses: () => AH_CLASSES,
  GetAuctionItemSubClasses: (_h, a) => AH_SUB[num(a[0]) ?? 0] ?? [],
  GetAuctionInvTypes: (_h, a) => ((num(a[0]) ?? 0) === 2 ? AH_TYPES : []),
  CloseAuctionHouse: (h) => { const w = win(h); if (w.auction) { delete w.auction; h.fireIf("AUCTION_HOUSE_CLOSED"); } },
};

// ===== [S4] Bank, Handel · bank, trade =====

const BANK_COSTS = [10000, 100000, 250000, 500000, 1000000, 2500000];
export const BANK_API: Record<string, Impl> = {
  GetNumBankSlots: (h) => { const b = win(h).bank; return b ? [b.slots, b.slots >= 6] : [0, false]; },
  GetBankSlotCost: (_h, a) => BANK_COSTS[Math.max(0, (num(a[0]) ?? 1) - 1)] ?? BANK_COSTS[BANK_COSTS.length - 1],
  PurchaseSlot: (h) => {
    const b = win(h).bank; if (!b || b.slots >= 6) return;
    const c = BANK_COSTS[b.slots]!; if (money(h) < c) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    pay(h, c); b.slots += 1; h.fireIf("PLAYERBANKBAGSLOTS_CHANGED");
  },
  CloseBankFrame: (h) => { const w = win(h); if (w.bank) { delete w.bank; h.fireIf("BANKFRAME_CLOSED"); } },
};

const side = (n: unknown): number => (num(n) ?? 0) - 1;
function tradeDone(h: SimHost): void {
  const t = win(h).trade; if (!t) return;
  const inv = h.inventory();
  inv.money = money(h) - t.money[0] + t.money[1];
  for (const it of Object.values(t.items[1])) addItem(inv, it.id, it.count);
  delete win(h).trade;
  h.fireIf("PLAYER_MONEY"); h.fireIf("BAG_UPDATE", 0); h.fireIf("TRADE_CLOSED");
}
export const TRADE_API: Record<string, Impl> = {
  InitiateTrade: (h, a) => {
    const u = h.unit(a[0]); const w = win(h); if (!u || w.trade) return;
    w.trade = { partner: u.name, money: [0, 0], items: [{}, {}], accepted: [false, false] };
    h.later(0.3, () => h.fireIf("TRADE_SHOW"));
  },
  BeginTrade: () => undefined,
  GetPlayerTradeMoney: (h) => win(h).trade?.money[0] ?? 0,
  GetTargetTradeMoney: (h) => win(h).trade?.money[1] ?? 0,
  SetTradeMoney: (h, a) => { const t = win(h).trade; if (!t) return; t.money[0] = Math.min(money(h), Math.max(0, num(a[0]) ?? 0)); t.accepted = [false, false]; h.fireIf("TRADE_MONEY_CHANGED"); h.fireIf("TRADE_ACCEPT_UPDATE", 0, 0); },
  AddTradeMoney: (h, a) => { const g = gear(h); const t = win(h).trade; if (t && g.cursor?.kind === "money") { t.money[0] += g.cursor.amount; delete g.cursor; h.fireIf("TRADE_MONEY_CHANGED"); } void a; },
  ClickTradeButton: (h, a) => {
    const t = win(h).trade; if (!t) return;
    const g = gear(h);
    const k = side(a[0]); if (k < 0 || k > 5) return;
    if (g.cursor?.kind === "item") { t.items[0][k] = { id: g.cursor.id, count: g.cursor.count }; delete g.cursor; }
    else if (t.items[0][k]) { addItem(h.inventory(), t.items[0][k]!.id, t.items[0][k]!.count); delete t.items[0][k]; }
    else return;
    t.accepted = [false, false]; h.fireIf("TRADE_PLAYER_ITEM_CHANGED", k + 1); h.fireIf("TRADE_ACCEPT_UPDATE", 0, 0);
  },
  ClickTargetTradeButton: () => undefined,
  GetTradePlayerItemInfo: (h, a) => { const x = win(h).trade?.items[0][side(a[0])]; if (!x) return undefined; const m = im(h, x.id); return [m.name, m.icon, x.count, m.quality, undefined, true]; },
  GetTradeTargetItemInfo: (h, a) => { const x = win(h).trade?.items[1][side(a[0])]; if (!x) return undefined; const m = im(h, x.id); return [m.name, m.icon, x.count, m.quality, undefined, undefined, true]; },
  GetTradePlayerItemLink: (h, a) => { const x = win(h).trade?.items[0][side(a[0])]; return x ? im(h, x.id).link : undefined; },
  GetTradeTargetItemLink: (h, a) => { const x = win(h).trade?.items[1][side(a[0])]; return x ? im(h, x.id).link : undefined; },
  AcceptTrade: (h) => {
    const t = win(h).trade; if (!t) return;
    t.accepted[0] = true; h.fireIf("TRADE_ACCEPT_UPDATE", 1, t.accepted[1] ? 1 : 0);
    h.later(1, () => { const c = win(h).trade; if (!c || !c.accepted[0]) return; c.accepted[1] = true; h.fireIf("TRADE_ACCEPT_UPDATE", 1, 1); h.later(0.2, () => tradeDone(h)); });
  },
  CancelTradeAccept: (h) => { const t = win(h).trade; if (t) { t.accepted = [false, false]; h.fireIf("TRADE_ACCEPT_UPDATE", 0, 0); } },
  CancelTrade: (h) => { const t = win(h).trade; if (!t) return; for (const x of Object.values(t.items[0])) addItem(h.inventory(), x.id, x.count); delete win(h).trade; h.fireIf("TRADE_REQUEST_CANCEL"); h.fireIf("TRADE_CLOSED"); },
  CloseTrade: (h) => TRADE_API.CancelTrade!(h, []),
  ReplaceTradeEnchant: () => undefined,
};

// ===== [S5] Sonstige Fenster · other windows =====

export const ITEMTEXT_API: Record<string, Impl> = {
  ItemTextGetItem: (h) => win(h).itemText?.item,
  ItemTextGetCreator: (h) => win(h).itemText?.creator,
  ItemTextGetMaterial: (h) => win(h).itemText?.material,
  ItemTextGetPage: (h) => (win(h).itemText ? win(h).itemText!.page + 1 : 0),
  ItemTextGetText: (h) => { const t = win(h).itemText; return t?.pages[t.page]; },
  ItemTextHasNextPage: (h) => { const t = win(h).itemText; return !!t && t.page + 1 < t.pages.length; },
  ItemTextNextPage: (h) => { const t = win(h).itemText; if (t && t.page + 1 < t.pages.length) { t.page++; h.fireIf("ITEM_TEXT_READY"); } },
  ItemTextPrevPage: (h) => { const t = win(h).itemText; if (t && t.page > 0) { t.page--; h.fireIf("ITEM_TEXT_READY"); } },
  CloseItemText: (h) => { const w = win(h); if (w.itemText) { delete w.itemText; h.fireIf("ITEM_TEXT_CLOSED"); } },
};

export const LOOTROLL_API: Record<string, Impl> = {
  GetLootRollItemInfo: (h, a) => { const r = win(h).rolls.find((x) => x.id === a[0]); if (!r) return undefined; const m = im(h, r.item); return [m.icon, m.name, 1, m.quality, true, true, false]; },
  GetLootRollItemLink: (h, a) => { const r = win(h).rolls.find((x) => x.id === a[0]); return r ? im(h, r.item).link : undefined; },
  GetLootRollTimeLeft: (h, a) => { const r = win(h).rolls.find((x) => x.id === a[0]); return r ? Math.max(0, Math.round((r.ends - h.now) * 1000)) : 0; },
  RollOnLoot: (h, a) => { const w = win(h); const k = w.rolls.findIndex((x) => x.id === a[0]); if (k >= 0) { w.rolls.splice(k, 1); h.fireIf("CANCEL_LOOT_ROLL", a[0] as number); h.note("info", `RollOnLoot: roll type ${String(a[1])} chosen (the result is not simulated).`); } },
  ConfirmLootRoll: () => undefined,
  IsFishingLoot: () => false,
  SetLootPortrait: () => undefined,
};

export const MERCHANT2_API: Record<string, Impl> = {
  CanMerchantRepair: (h) => h.interaction().merchant !== undefined,
  GetRepairAllCost: (h) => {
    let cost = 0; const inv = h.inventory();
    for (const id of Object.values(inv.equipped ?? {})) { const d = inv.items[String(id)]?.durability; if (d) cost += (d[1] - d[0]) * 10; }
    return [cost, cost > 0];
  },
  RepairAllItems: (h) => {
    const inv = h.inventory(); const [cost] = MERCHANT2_API.GetRepairAllCost!(h, []) as [number];
    if (cost <= 0) return; if (money(h) < cost) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    for (const id of Object.values(inv.equipped ?? {})) { const d = inv.items[String(id)]?.durability; if (d) d[0] = d[1]; }
    pay(h, cost); h.fireIf("UPDATE_INVENTORY_DURABILITY");
  },
  GetMerchantItemMaxStack: (h, a) => h.interaction().merchant?.items[(num(a[0]) ?? 0) - 1]?.stack ?? 1,
  BuybackItem: (h, a) => {
    const st = h.interaction(); const k = (num(a[0]) ?? 0) - 1; const b = st.buyback[k]; if (!b) return;
    if (money(h) < b.price) { h.fireIf("UI_ERROR_MESSAGE", "Not enough money"); return; }
    if (!addItem(h.inventory(), b.id, b.count)) return;
    pay(h, b.price); st.buyback.splice(k, 1); h.fireIf("BAG_UPDATE", 0);
  },
  PickupMerchantItem: (h, a) => { const g = gear(h); const it = h.interaction().merchant?.items[(num(a[0]) ?? 0) - 1]; if (it && !g.cursor) g.cursor = { kind: "item", id: it.id, count: it.stack ?? 1 }; },
  GetQuestItemLink: (h, a) => { void a; void h; return undefined; },
};

export const GM_API: Record<string, Impl> = {
  GetGMTicket: (h) => { const t = win(h).ticket; return t ? [1, t.text, t.category] : []; }, // probe: no values without a ticket
  NewGMTicket: (h, a) => { win(h).ticket = { category: num(a[0]) ?? 0, text: str(a[1]) ?? "" }; h.later(0.3, () => h.fireIf("UPDATE_TICKET", 1, str(a[1]) ?? "", num(a[0]) ?? 0)); },
  UpdateGMTicket: (h, a) => { const t = win(h).ticket; if (t) { t.text = str(a[1]) ?? t.text; h.fireIf("UPDATE_TICKET", 1, t.text, t.category); } },
  DeleteGMTicket: (h) => { delete win(h).ticket; h.fireIf("UPDATE_TICKET"); },
  GetGMTicketCategories: () => [1, "I want to report someone's behavior", 2, "I have an issue with my character"], // probe: id/name pairs
  GetGMStatus: (h) => (win(h).gmStatus ? [true] : []), // probe: no values for non-GMs
  GMRequestPlayerInfo: () => undefined, GMSurveyAnswerSubmit: () => undefined, GMSurveyCommentSubmit: () => undefined, GMSurveyQuestion: () => undefined, GMSurveySubmit: () => undefined,
  Stuck: (h) => { h.note("info", "Stuck(): the unstuck request is not simulated."); },
};

// ===== [S6] OPENERS_1 =====

export const OPENERS_1: Record<string, (h: SimHost) => void> = {
  mail: (h) => {
    win(h).mail = {
      inbox: [
        { sender: "Auction House", subject: "Auction successful: Linen Cloth", body: "", money: 1200, cod: 0, days: 29, read: false },
        { sender: "Sample Friend", subject: "Gift for you", body: "Hello! Here is a small gift.\n\n- Sample Friend", money: 0, cod: 0, days: 25, item: { id: 117, count: 4 }, read: false },
      ],
      send: { money: 0, cod: 0 }, stationery: 0, pkg: 1,
    };
    h.fireIf("MAIL_SHOW"); h.fireIf("MAIL_INBOX_UPDATE"); h.fireIf("UPDATE_PENDING_MAIL");
  },
  auction: (h) => {
    const mk = (id: number, n: number, bid: number, buy: number, owner: string, left: number): Auction => ({ id, count: n, minBid: bid, inc: Math.max(1, Math.floor(bid / 20)), buyout: buy, bid: 0, high: false, owner, left, level: 1 });
    win(h).auction = { list: [mk(2589, 20, 400, 800, "Sampleseller", 3), mk(117, 5, 150, 300, "Sampletrader", 2), mk(159, 10, 200, 0, "Sampleseller", 4), mk(6948, 1, 5000, 9000, "Sampletrader", 1)], owned: [], bidder: [], selected: {}, reversed: false };
    h.fireIf("AUCTION_HOUSE_SHOW"); h.fireIf("AUCTION_ITEM_LIST_UPDATE");
  },
  bank: (h) => { win(h).bank = { slots: 1 }; h.fireIf("BANKFRAME_OPENED"); },
  trade: (h) => { const u = h.unit("target") ?? h.unit("party1"); if (u) { win(h).trade = { partner: u.name, money: [0, 0], items: [{}, { 0: { id: 5742, count: 1 } }], accepted: [false, false] }; h.fireIf("TRADE_SHOW"); h.fireIf("TRADE_TARGET_ITEM_CHANGED", 1); } else h.note("warn", "openWindow(trade): select a target first."); },
  itemtext: (h) => { win(h).itemText = { pages: ["Page one of a sample letter.", "Page two of the sample letter."], page: 0, creator: "Sample Author", item: "Sample Letter", material: "Parchment" }; h.fireIf("ITEM_TEXT_BEGIN"); h.fireIf("ITEM_TEXT_READY"); },
  lootroll: (h) => { win(h).rolls.push({ id: 1, item: 4496, ends: h.now + 60 }); h.fireIf("START_LOOT_ROLL", 1, 60000); },
};

export { takeSlot };
