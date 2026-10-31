/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Zustand · state ..... AddonInfo, MiscState
 *   [S2] Kodierung · coding .. base64, hex, Pseudo-Kompression · pseudo compression
 *   [S3] MISC_API ............ C_AddOns, C_EventUtils, C_Glue, C_DeathInfo, C_ChatBubbles, C_LossOfControl,
 *                              C_NewItems, C_Loot, C_LootHistory, C_SwingTimer, C_PlayerInteractionManager,
 *                              C_Texture, C_XMLUtil, C_EncodingUtil, C_Macro, C_APIDocumentation, Münztext
 *
 * DE: Kleine ClassicAPI-Namespaces ohne eigenes großes Modell. Tabellen entstehen über die JSON-Brücke
 *     (der Host liefert verschachtelte Werte, die VM baut Tabellen). `C_EncodingUtil.CompressString` ist hier
 *     eine Pseudo-Kompression (nur die Rückumwandlung stimmt, nicht das echte Format).
 * EN: small ClassicAPI namespaces without a big model of their own. Tables are built through the JSON bridge.
 *     `C_EncodingUtil.CompressString` is a pseudo compression here (only the round trip is right).
 */

import { num, str, type Impl, type SimHost } from "./host.js";

// ===== [S1] Zustand · state =====

interface AddonInfo { name: string; title: string; notes: string; loaded: boolean; loadOnDemand: boolean; interface: number; deps: string[]; optional: string[]; security: 0 | 1 | 2 }
interface LootScanItem { guid: string; items: { itemID: number; count: number; link: string }[] }
interface MiscState {
  addons: AddonInfo[];
  newItems: Set<string>;
  textures: Record<string, { elementName: string; file: string; width: number; height: number; left: number; right: number; top: number; bottom: number; id: number; elementID: number }>;
  swing: Record<number, boolean>;
  lootHistory: { rollID: number; link: string; players: { name: string; class: string; rollType: number; roll?: number; isWinner: boolean; isMe: boolean }[]; done: boolean }[];
  scan: { running: boolean; results: LootScanItem[] };
  nextAtlas: number;
}

export const st = (h: SimHost): MiscState => h.store("misc", () => ({
  addons: [
    { name: h.addonName, title: h.addonName, notes: "The addon under test.", loaded: true, loadOnDemand: false, interface: 11200, deps: [], optional: [], security: 1 },
    { name: "Blizzard_AuctionUI", title: "Blizzard Auction UI", notes: "", loaded: false, loadOnDemand: true, interface: 11200, deps: [], optional: [], security: 0 },
    { name: "Blizzard_CraftUI", title: "Blizzard Craft UI", notes: "", loaded: false, loadOnDemand: true, interface: 11200, deps: [], optional: [], security: 0 },
  ],
  newItems: new Set<string>(),
  textures: { "Interface\\Icons\\sample": { elementName: "sample", file: "Interface\\Icons\\INV_Misc_QuestionMark", width: 64, height: 64, left: 0, right: 1, top: 0, bottom: 1, id: 1, elementID: 1 } },
  swing: {},
  lootHistory: [],
  scan: { running: false, results: [] },
  nextAtlas: -1,
}));

// ===== [S2] Kodierung · coding =====

function bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 256) out.push(c);
    else for (const b of new TextEncoder().encode(ch)) out.push(b);
  }
  return out;
}
const fromBytes = (b: number[]): string => b.map((x) => String.fromCharCode(x)).join("");
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64enc(s: string): string {
  const b = bytes(s); let o = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = ((b[i] ?? 0) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    o += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < b.length ? B64[(n >> 6) & 63]! : "=") + (i + 2 < b.length ? B64[n & 63]! : "=");
  }
  return o;
}
function b64dec(s: string): string | undefined {
  const clean = s.replace(/=+$/, "");
  if (/[^A-Za-z0-9+/]/.test(clean)) return undefined;
  const out: number[] = []; let acc = 0; let bits = 0;
  for (const c of clean) { acc = (acc << 6) | B64.indexOf(c); bits += 6; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); } }
  return fromBytes(out);
}
const hexenc = (s: string): string => bytes(s).map((x) => x.toString(16).padStart(2, "0")).join("");
function hexdec(s: string): string | undefined {
  if (s.length % 2 || /[^0-9a-fA-F]/.test(s)) return undefined;
  return fromBytes((s.match(/../g) ?? []).map((x) => parseInt(x, 16)));
}

// ===== [S3] MISC_API =====

export const addon = (h: SimHost, v: unknown): AddonInfo | undefined => {
  const l = st(h).addons;
  return typeof v === "number" ? l[v - 1] : typeof v === "string" ? l.find((a) => a.name.toLowerCase() === v.toLowerCase()) : undefined;
};
const itemName = (h: SimHost, id: number): string => h.inventory().items[String(id)]?.name ?? `item:${id}`;
const copper = (n: number): [number, number, number] => [Math.floor(n / 10000), Math.floor((n % 10000) / 100), n % 100];

export const MISC_API: Record<string, Impl> = {
  // ----- AddOns -----
  "C_AddOns.DoesAddOnExist": (h, a) => addon(h, a[0]) !== undefined,
  "C_AddOns.GetAddOnName": (h, a) => addon(h, a[0])?.name,
  "C_AddOns.GetAddOnTitle": (h, a) => addon(h, a[0])?.title,
  "C_AddOns.GetAddOnNotes": (h, a) => addon(h, a[0])?.notes,
  "C_AddOns.IsAddOnLoadable": (h, a) => { const x = addon(h, a[0]); return x ? [true, undefined] : [false, "MISSING"]; },
  "C_AddOns.IsAddOnLoaded": (h, a) => { const x = addon(h, a[0]); return [x?.loaded === true, x?.loaded === true]; },
  "C_AddOns.LoadAddOn": (h, a) => {
    const x = addon(h, a[0]);
    if (!x) return [undefined, "MISSING"];
    if (!x.loaded && !x.loadOnDemand) return [undefined, "NOT_DEMAND_LOADED"];
    x.loaded = true;
    return [1, undefined];
  },
  "C_AddOns.GetAddOnSecurity": (h, a) => { const x = addon(h, a[0]); return x ? x.security : 3; },
  "C_AddOns.GetAddOnOptionalDependencies": (h, a) => addon(h, a[0])?.optional,
  "C_AddOns.GetAddOnInterfaceVersion": (h, a) => addon(h, a[0])?.interface,
  "C_AddOns.GetAddOnLocalTable": () => undefined,
  // ----- Ereignisse, Glue, Tod, Sprechblasen · events, glue, death, bubbles -----
  "C_EventUtils.IsEventValid": (h, a) => typeof a[0] === "string" && h.target.events.has(a[0]),
  "C_Glue.IsOnGlueScreen": () => false,
  "C_DeathInfo.GetSelfResurrectOptions": () => [[]],
  "C_DeathInfo.UseSelfResurrectOption": () => undefined,
  "C_ChatBubbles.GetAllChatBubbles": () => [[]],
  "C_LossOfControl.GetActiveLossOfControlDataCount": () => 0,
  "C_LossOfControl.GetActiveLossOfControlData": () => undefined,
  "C_LossOfControl.GetSchoolLockout": () => [0, undefined],
  // ----- Neue Gegenstände · new items -----
  "C_NewItems.IsNewItem": (h, a) => st(h).newItems.has(`${a[0]}:${a[1]}`),
  "C_NewItems.RemoveNewItem": (h, a) => { if (st(h).newItems.delete(`${a[0]}:${a[1]}`)) h.fire("BAG_NEW_ITEMS_UPDATED"); },
  "C_NewItems.ClearAll": (h) => { const s = st(h); if (s.newItems.size) { s.newItems.clear(); h.fire("BAG_NEW_ITEMS_UPDATED"); } },
  // ----- Beute-Suche und Würfelverlauf · loot scan and roll history -----
  "C_Loot.GetNearbyLootableUnits": (h) => [st(h).scan.results.map((r) => ({ guid: r.guid }))],
  "C_Loot.IsScanInProgress": (h) => st(h).scan.running,
  "C_Loot.GetLastScanResults": (h) => [st(h).scan.results.flatMap((r) => r.items.map((i) => ({ guid: r.guid, itemID: i.itemID, count: i.count, link: i.link })))],
  "C_Loot.ScanNearbyLoot": (h) => { const s = st(h); if (s.scan.running) return false; h.fire("LOOT_SCAN_COMPLETED"); return true; },
  "C_Loot.LootAllCorpses": (h) => !st(h).scan.running && (h.note("info", "C_Loot.LootAllCorpses: there are no lootable corpses in the sample world."), true),
  "C_Loot.LootUnit": (h, a) => { h.note("info", `C_Loot.LootUnit(${String(a[0])}): no such corpse in the sample world.`); },
  "C_Loot.LootUnitItem": () => false,
  "C_LootHistory.GetNumItems": (h) => st(h).lootHistory.length,
  "C_LootHistory.GetItem": (h, a) => { const r = st(h).lootHistory[(num(a[0]) ?? 0) - 1]; return r ? [r.rollID, r.link, r.players.length, r.done, r.players.findIndex((p) => p.isWinner) + 1 || undefined, false, false] : undefined; },
  "C_LootHistory.GetPlayerInfo": (h, a) => { const p = st(h).lootHistory[(num(a[0]) ?? 0) - 1]?.players[(num(a[1]) ?? 0) - 1]; return p ? [p.name, p.class, p.rollType, p.roll, p.isWinner, p.isMe] : undefined; },
  "C_LootHistory.Clear": (h) => { st(h).lootHistory = []; h.fire("LOOT_HISTORY_FULL_UPDATE"); },
  // ----- Schlag-Timer, Interaktion · swing timer, interaction -----
  "C_SwingTimer.EnableRangeCheck": (h, a) => { if (typeof a[0] === "number") st(h).swing[a[0]] = a[1] === true; },
  "C_SwingTimer.IsTargetWithinSwingRange": (h) => { const t = h.unit("target"); const p = h.unit("player"); if (!t || t.friendly || !p || t.x === undefined || p.x === undefined) return undefined; return Math.hypot(t.x - p.x, (t.y ?? 0) - (p.y ?? 0)) <= 5; },
  "C_PlayerInteractionManager.InteractUnit": (h, a) => { const ok = typeof a[0] === "string" && h.unit(a[0]) !== undefined; if (ok) h.note("info", `Interact with ${String(a[0])} (the result is not simulated).`); return ok; },
  // ----- Texturen, XML · textures, XML -----
  "C_Texture.GetAtlasInfo": (h, a) => { const t = st(h).textures[String(a[0])]; return t ? [{ elementName: t.elementName, file: t.file, width: t.width, height: t.height, leftTexCoord: t.left, rightTexCoord: t.right, topTexCoord: t.top, bottomTexCoord: t.bottom, tilesHorizontally: false, tilesVertically: false }] : undefined; },
  "C_Texture.GetAtlasExists": (h, a) => st(h).textures[String(a[0])] !== undefined,
  "C_Texture.GetAtlasID": (h, a) => st(h).textures[String(a[0])]?.id,
  "C_Texture.GetAtlasElementID": (h, a) => st(h).textures[String(a[0])]?.elementID,
  "C_Texture.GetAtlasElements": (h) => [Object.keys(st(h).textures).sort()],
  "C_Texture.RegisterAtlas": (h, a) => {
    const s = st(h); const name = str(a[0]);
    if (!name || typeof a[1] !== "string") return false;
    const old = s.textures[name];
    const id = old?.id ?? s.nextAtlas--;
    s.textures[name] = { elementName: name, file: a[1], width: num(a[2]) ?? 0, height: num(a[3]) ?? 0, left: num(a[4]) ?? 0, right: num(a[5]) ?? 1, top: num(a[6]) ?? 0, bottom: num(a[7]) ?? 1, id, elementID: old?.elementID ?? id };
    return true;
  },
  "C_XMLUtil.GetTemplates": () => [[]],
  "C_XMLUtil.GetTemplateInfo": () => undefined,
  "C_XMLUtil.DoesTemplateExist": () => false,
  // ----- Kodierung · encoding -----
  "C_EncodingUtil.EncodeBase64": (_h, a) => (typeof a[0] === "string" ? b64enc(a[0]) : undefined),
  "C_EncodingUtil.DecodeBase64": (_h, a) => (typeof a[0] === "string" ? b64dec(a[0]) : undefined),
  "C_EncodingUtil.EncodeHex": (_h, a) => (typeof a[0] === "string" ? hexenc(a[0]) : undefined),
  "C_EncodingUtil.DecodeHex": (_h, a) => (typeof a[0] === "string" ? hexdec(a[0]) : undefined),
  "C_EncodingUtil.CompressString": (_h, a) => (typeof a[0] === "string" ? `FWZ1:${b64enc(a[0])}` : undefined),
  "C_EncodingUtil.DecompressString": (_h, a) => (typeof a[0] === "string" && a[0].startsWith("FWZ1:") ? b64dec(a[0].slice(5)) : undefined),
  // ----- Makros (Symbol als Text) · macros (icon as text) -----
  "C_Macro.CreateMacro": (h, a) => {
    const c = h.character(); const name = str(a[0]); if (!name) return undefined;
    const list = (c.macros ??= []);
    const per = a[3] === true;
    if (list.filter((m) => !!m.character === per).length >= (per ? 18 : 36)) return undefined;
    list.push({ name, icon: iconPath(a[1]), body: str(a[2]) ?? "", character: per });
    return list.length;
  },
  "C_Macro.EditMacro": (h, a) => {
    const m = h.character().macros?.[(num(a[0]) ?? 0) - 1]; if (!m) return undefined;
    if (typeof a[1] === "string") m.name = a[1];
    if (a[2] !== undefined) m.icon = iconPath(a[2]);
    if (typeof a[3] === "string") m.body = a[3];
    return (h.character().macros ?? []).indexOf(m) + 1;
  },
  "C_Macro.GetMacroIcon": (h, a) => { const m = h.character().macros?.[(num(a[0]) ?? 0) - 1]; return m ? m.icon ?? "Interface\\Icons\\INV_Misc_QuestionMark" : undefined; },
  "C_Macro.SetMacroDisplay": () => undefined,
  // ----- API-Dokumentation · API documentation -----
  "C_APIDocumentation.GetSystems": (h) => [[...new Set([...h.target.functions.values()].map((f) => f.system).filter((x): x is string => !!x))].sort()],
  "C_APIDocumentation.GetSystem": (h, a) => {
    const fns = [...h.target.functions.values()].filter((f) => f.system === a[0]);
    return fns.length ? [{ name: a[0], functions: fns.map((f) => f.name).sort() }] : undefined;
  },
  // ----- Münztext · coin text -----
  "C_CurrencyInfo.GetCoinText": (_h, a) => coinText(num(a[0]) ?? 0, str(a[1]) ?? ", "),
  GetCoinText: (_h, a) => coinText(num(a[0]) ?? 0, str(a[1]) ?? ", "),
  "C_CurrencyInfo.GetCoinTextureString": (_h, a) => coinTex(num(a[0]) ?? 0, num(a[1])),
  GetCoinTextureString: (_h, a) => coinTex(num(a[0]) ?? 0, num(a[1])),
  GetCoinIcon: (_h, a) => { const n = num(a[0]) ?? 0; return n >= 10000 ? "Interface\\Icons\\INV_Misc_Coin_01" : n >= 100 ? "Interface\\Icons\\INV_Misc_Coin_03" : "Interface\\Icons\\INV_Misc_Coin_05"; },
};
void itemName;

function iconPath(v: unknown): string {
  if (typeof v !== "string" || v === "") return "Interface\\Icons\\INV_Misc_QuestionMark";
  return /^interface\\icons\\/i.test(v) ? v : `Interface\\Icons\\${v}`;
}
function coinText(n: number, sep: string): string {
  if (n < 0) n = 0;
  const [g, s, c] = copper(Math.floor(n));
  const parts = [g ? `${g} Gold` : "", s ? `${s} Silver` : "", c ? `${c} Copper` : ""].filter(Boolean);
  return parts.length ? parts.join(sep) : "0 Copper";
}
// DE: Format nach Probe auf OctoWoW (UI-MoneyIcons, ohne Leerzeichen). EN: format per the OctoWoW probe (UI-MoneyIcons, no spaces).
function coinTex(n: number, _size?: number): string {
  if (n < 0) n = 0;
  const [g, s, c] = copper(Math.floor(n));
  const tex = (k: number): string => `|TInterface\\MoneyFrame\\UI-MoneyIcons:0:0:0:0:4:1:${k}:${k + 1}:0:1|t`;
  return (g ? `${g}${tex(0)}` : "") + (s ? `${s}${tex(1)}` : "") + (c || (!g && !s) ? `${c}${tex(2)}` : "");
}
