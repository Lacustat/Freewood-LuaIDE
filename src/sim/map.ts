/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Beispielwelt · sample world ... MAPS, AREA_NAMES, TAXI_NODES, TAXI_PATHS, OVERLAYS, TRIGGERS
 *   [S2] Umrechnung · conversion ....... zoneOf, toMap, toWorld
 *   [S3] MAP_API ....................... C_Map.*, C_MapExplorationInfo.*, C_TaxiMap.*, Taxi-Funktionen, GossipInfo-POI
 *
 * DE: Karten der Simulation. ACHTUNG: Die Zonenrechtecke, Flugpunkte und Overlays sind ERFUNDENE Beispielwerte
 *     (nur so gewählt, dass die Spielerposition des Standard-Szenarios in Elwynn Forest liegt); sie stammen nicht
 *     aus dem Spiel. Format und Verhalten folgen der ClassicAPI-Doku. Zonen heißen wie dort nach ihrer
 *     AreaTable-ID (positiv), Kontinente und Welt negativ (-13 Kalimdor, -14 Östliche Königreiche, -694 Welt).
 *     Weltkoordinaten: x = Nord, y = West (wie UnitPosition: y, x).
 * EN: maps of the simulation. NOTE: the zone rectangles, flight points and overlays are INVENTED sample values
 *     (chosen so that the default scenario's player stands in Elwynn Forest); they are not game data. Format
 *     and behaviour follow the ClassicAPI docs. Zones use their AreaTable ID (positive), continents and the
 *     world are negative (-13 Kalimdor, -14 Eastern Kingdoms, -694 world). World coordinates: x = north, y = west.
 */

import { num, round, str, type Impl, type SimHost } from "./host.js";

// ===== [S1] Beispielwelt · sample world =====

interface Rect { top: number; bottom: number; left: number; right: number }
interface MapDef { id: number; name: string; type: 1 | 2 | 3; parent: number; continent?: number; rect?: Rect; dir?: string }

const zone = (id: number, name: string, parent: number, continent: number, cx: number, cy: number, w: number, dir: string): MapDef => ({
  id, name, type: 3, parent, continent, dir, rect: { top: cx + (w / 3), bottom: cx - (w / 3), left: cy + w / 2, right: cy - w / 2 },
});

export const MAPS: MapDef[] = [
  { id: -694, name: "Azeroth", type: 1, parent: 0 },
  { id: -13, name: "Kalimdor", type: 2, parent: -694, continent: 1, rect: { top: 9000, bottom: -13000, left: 9000, right: -24000 }, dir: "Kalimdor" },
  { id: -14, name: "Eastern Kingdoms", type: 2, parent: -694, continent: 0, rect: { top: 5000, bottom: -17000, left: 16500, right: -16500 }, dir: "Azeroth" },
  // x(north), y(west), width = east-west span (invented)
  zone(12, "Elwynn Forest", -14, 0, -8800, 0, 3333, "Elwynn"),
  zone(1519, "Stormwind City", -14, 0, -8550, 600, 1200, "StormwindCity"),
  zone(1, "Dun Morogh", -14, 0, -5600, 800, 4000, "DunMorogh"),
  zone(85, "Tirisfal Glades", -14, 0, 2000, 1500, 4000, "Tirisfal"),
  zone(14, "Durotar", -13, 1, 0, -4600, 4500, "Durotar"),
  zone(1637, "Orgrimmar", -13, 1, 1629, -4373, 1200, "Ogrimmar"),
  zone(215, "Mulgore", -13, 1, -1300, -100, 4200, "Mulgore"),
];
const byId = new Map(MAPS.map((m) => [m.id, m]));

export const AREA_NAMES: Record<number, string> = {
  1: "Dun Morogh", 9: "Northshire Valley", 12: "Elwynn Forest", 14: "Durotar", 17: "The Barrens", 38: "Loch Modan", 40: "Westfall", 44: "Redridge Mountains",
  85: "Tirisfal Glades", 87: "Goldshire", 215: "Mulgore", 1519: "Stormwind City", 1537: "Ironforge", 1637: "Orgrimmar", 1638: "Thunder Bluff", 1497: "Undercity",
};

interface TaxiNode { nodeID: number; name: string; faction: "Alliance" | "Horde" | "Neutral"; map: number; x: number; y: number; z: number; areaID: number }
export const TAXI_NODES: TaxiNode[] = [
  { nodeID: 2, name: "Stormwind, Elwynn Forest", faction: "Alliance", map: 0, x: -8835, y: 490, z: 109, areaID: 12 },
  { nodeID: 6, name: "Ironforge, Dun Morogh", faction: "Alliance", map: 0, x: -4821, y: -1155, z: 502, areaID: 1 },
  { nodeID: 11, name: "Undercity, Tirisfal", faction: "Horde", map: 0, x: 1566, y: 267, z: -43, areaID: 85 },
  { nodeID: 23, name: "Orgrimmar, Durotar", faction: "Horde", map: 1, x: 1676, y: -4315, z: 62, areaID: 14 },
  { nodeID: 22, name: "Thunder Bluff, Mulgore", faction: "Horde", map: 1, x: -1197, y: 29, z: 176, areaID: 215 },
];
export const TAXI_PATHS = [
  { pathID: 1, fromNodeID: 2, toNodeID: 6, cost: 110 },
  { pathID: 2, fromNodeID: 6, toNodeID: 2, cost: 110 },
  { pathID: 3, fromNodeID: 23, toNodeID: 22, cost: 150 },
  { pathID: 4, fromNodeID: 22, toNodeID: 23, cost: 150 },
];

const OVERLAYS: Record<number, { name: string; area: number; l: number; t: number; w: number; h: number }[]> = {
  12: [{ name: "GOLDSHIRE", area: 87, l: 300, t: 250, w: 200, h: 150 }, { name: "NORTHSHIREVALLEY", area: 9, l: 400, t: 120, w: 256, h: 190 }],
};
const TRIGGERS = [
  { id: 1, mapID: 0, x: -8913, y: -133, z: 82, radius: 20, isBox: false, boxLength: 0, boxWidth: 0, boxHeight: 0, boxYaw: 0 },
  { id: 2, mapID: 1, x: 1629, y: -4373, z: 34, radius: 30, isBox: false, boxLength: 0, boxWidth: 0, boxHeight: 0, boxYaw: 0 },
];

// ===== [S2] Umrechnung · conversion =====

const area = (r: Rect): number => (r.top - r.bottom) * (r.left - r.right);

/** DE: Kleinste Zone, deren Rechteck den Punkt enthält. EN: smallest zone whose rect contains the point. */
export function zoneOf(continent: number, x: number, y: number): MapDef | undefined {
  let best: MapDef | undefined;
  for (const m of MAPS) {
    if (m.type !== 3 || m.continent !== continent || !m.rect) continue;
    const r = m.rect;
    if (x <= r.top && x >= r.bottom && y <= r.left && y >= r.right && (!best || area(r) < area(best.rect!))) best = m;
  }
  return best;
}
const rectOf = (m: MapDef | undefined): Rect | undefined => m?.rect;
const contOf = (m: MapDef): number | undefined => (m.type === 2 ? m.continent : m.continent);
export function toMap(m: MapDef, x: number, y: number): { x: number; y: number } | undefined {
  const r = rectOf(m);
  if (!r) return undefined;
  const px = (r.left - y) / (r.left - r.right);
  const py = (r.top - x) / (r.top - r.bottom);
  return px >= 0 && px <= 1 && py >= 0 && py <= 1 ? { x: round(px), y: round(py) } : undefined;
}
export function toWorld(m: MapDef, px: number, py: number): { x: number; y: number } | undefined {
  const r = rectOf(m);
  return r ? { x: round(r.top - py * (r.top - r.bottom), 2), y: round(r.left - px * (r.left - r.right), 2) } : undefined;
}
const cont = (id: number): MapDef | undefined => MAPS.find((m) => m.type === 2 && m.continent === id);
const info = (m: MapDef) => ({ mapID: m.id, name: m.name, mapType: m.type, parentMapID: m.parent, flags: 0 });
const vec = (v: unknown): { x: number; y: number } | undefined => {
  const o = v as { x?: unknown; y?: unknown } | undefined;
  return o && typeof o.x === "number" && typeof o.y === "number" ? { x: o.x, y: o.y } : undefined;
};

interface MapState { waypoint?: { uiMapID: number; x: number; y: number; z?: number }; explored: number[] }
const st = (h: SimHost): MapState => h.store("map", () => ({ explored: [87, 9] }));

function unitMap(h: SimHost, token: unknown): { map: MapDef; continent: number; x: number; y: number } | undefined {
  const u = h.unit(token);
  if (!u || u.x === undefined || u.y === undefined) return undefined;
  const t = typeof token === "string" ? token : "";
  if (!(t === "player" || /^(party|raid)\d+$/.test(t) || u.isPlayer)) return undefined;
  const m = zoneOf(0, u.x, u.y) ?? zoneOf(1, u.x, u.y);
  return m ? { map: m, continent: m.continent ?? 0, x: u.x, y: u.y } : undefined;
}

const link = (w: NonNullable<MapState["waypoint"]>): string => `|cffffff00|Hworldmap:${w.uiMapID}:${Math.round(w.x * 10000)}:${Math.round(w.y * 10000)}|h[Map Pin Location]|h|r`;

// ===== [S3] MAP_API =====

export const MAP_API: Record<string, Impl> = {
  "C_Map.GetAreaInfo": (_h, a) => (typeof a[0] === "number" && a[0] > 0 ? AREA_NAMES[a[0]] : undefined),
  "C_Map.GetAreas": () => [AREA_NAMES],
  "C_Map.GetMapAreaIDs": () => [Object.fromEntries(MAPS.filter((m) => m.type === 3).map((m) => [m.dir ?? m.name, m.id]))],
  "C_Map.GetBestMapForUnit": (h, a) => unitMap(h, a[0])?.map.id,
  "C_Map.GetMapInfo": (_h, a) => { const m = byId.get(num(a[0]) ?? NaN); return m ? [info(m)] : undefined; },
  "C_Map.GetMapChildrenInfo": (_h, a) => [MAPS.filter((m) => m.parent === a[0] && m.id !== a[0]).map(info)],
  "C_Map.GetMapInfoAtPosition": (_h, a) => {
    const m = byId.get(num(a[0]) ?? NaN); const px = num(a[1]); const py = num(a[2]);
    const r = rectOf(m);
    if (!m || !r || px === undefined || py === undefined || m.type !== 2) return undefined;
    const w = toWorld(m, px, py)!;
    const z = zoneOf(m.continent ?? 0, w.x, w.y);
    return z ? [info(z)] : undefined;
  },
  "C_Map.GetFallbackWorldMapID": () => -694,
  "C_Map.MapHasArt": (_h, a) => { const m = byId.get(num(a[0]) ?? NaN); return m !== undefined && m.dir !== undefined; },
  "C_Map.GetMapArtLayers": (_h, a) => { const m = byId.get(num(a[0]) ?? NaN); return [m?.dir ? [{ layerWidth: 1002, layerHeight: 668, tileWidth: 256, tileHeight: 256, minScale: 1, maxScale: 1, additionalZoomSteps: 0 }] : []]; },
  "C_Map.GetMapArtLayerTextures": (_h, a) => { const m = byId.get(num(a[0]) ?? NaN); return [m?.dir && a[1] === 1 ? Array.from({ length: 12 }, (_, i) => `Interface\\WorldMap\\${m.dir}\\${m.dir}${i + 1}`) : []]; },
  "C_Map.GetMapWorldSize": (_h, a) => { const r = rectOf(byId.get(num(a[0]) ?? NaN)); return r ? [round(r.left - r.right, 1), round(r.top - r.bottom, 1)] : [undefined, undefined]; },
  "C_Map.GetPlayerMapPosition": (h, a) => {
    const u = h.unit(a[1]); const m = byId.get(num(a[0]) ?? NaN);
    if (!u || u.x === undefined || u.y === undefined) return undefined;
    const t = typeof a[1] === "string" ? a[1] : "";
    if (!(t === "player" || /^(party|raid)\d+$/.test(t) || u.isPlayer) || !m) return undefined;
    const p = toMap(m, u.x, u.y);
    return p ? [p] : undefined;
  },
  "C_Map.GetWorldPosFromMapPos": (_h, a) => {
    const m = byId.get(num(a[0]) ?? NaN); const p = vec(a[1]);
    if (!m || !p || !m.rect) return undefined;
    return [m.continent ?? 0, toWorld(m, p.x, p.y)];
  },
  "C_Map.GetMapPosFromWorldPos": (_h, a) => {
    const c = num(a[0]); const w = vec(a[1]);
    if (c === undefined || !w) return undefined;
    const o = byId.get(num(a[2]) ?? NaN);
    const m = o ?? zoneOf(c, w.x, w.y);
    if (!m) return undefined;
    const p = toMap(m, w.x, w.y);
    return p ? [m.id, p] : undefined;
  },
  "C_Map.GetMapRectOnMap": (_h, a) => {
    const z = byId.get(num(a[0]) ?? NaN); if (!z?.rect) return undefined;
    const top = byId.get(num(a[1]) ?? NaN); const c = top?.rect ? top : cont(z.continent ?? 0);
    if (!c?.rect) return undefined;
    const r = c.rect; const zr = z.rect;
    const nx = (y: number): number => (r.left - y) / (r.left - r.right);
    const ny = (x: number): number => (r.top - x) / (r.top - r.bottom);
    return [round(nx(zr.left)), round(nx(zr.right)), round(ny(zr.top)), round(ny(zr.bottom))];
  },
  "C_Map.CanSetUserWaypointOnMap": (_h, a) => byId.get(num(a[0]) ?? NaN)?.rect !== undefined,
  "C_Map.SetUserWaypoint": (h, a) => {
    const p = a[0] as { uiMapID?: unknown; position?: unknown; z?: unknown } | undefined;
    const v = vec(p?.position);
    const m = byId.get(num(p?.uiMapID) ?? NaN);
    if (!p || !v || !m?.rect || v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1) return false;
    st(h).waypoint = { uiMapID: m.id, x: v.x, y: v.y, z: num(p.z) };
    h.fire("USER_WAYPOINT_UPDATED");
    return true;
  },
  "C_Map.GetUserWaypoint": (h) => { const w = st(h).waypoint; return w ? [{ uiMapID: w.uiMapID, position: { x: w.x, y: w.y }, ...(w.z !== undefined ? { z: w.z } : {}) }] : undefined; },
  "C_Map.HasUserWaypoint": (h) => st(h).waypoint !== undefined,
  "C_Map.ClearUserWaypoint": (h) => { if (st(h).waypoint) { delete st(h).waypoint; h.fire("USER_WAYPOINT_UPDATED"); } },
  "C_Map.GetUserWaypointHyperlink": (h) => { const w = st(h).waypoint; return w ? link(w) : undefined; },
  "C_Map.GetUserWaypointFromHyperlink": (_h, a) => {
    const m = /worldmap:(-?\d+):(\d+):(\d+)/.exec(str(a[0]) ?? "");
    return m ? [{ uiMapID: Number(m[1]), position: { x: Number(m[2]) / 10000, y: Number(m[3]) / 10000 } }] : undefined;
  },
  "C_Map.GetUserWaypointPositionForMap": (h, a) => {
    const w = st(h).waypoint; const target = byId.get(num(a[0]) ?? NaN); const src = w ? byId.get(w.uiMapID) : undefined;
    if (!w || !src || !target?.rect) return undefined;
    const world = toWorld(src, w.x, w.y);
    const p = world ? toMap(target, world.x, world.y) : undefined;
    return p ? [p] : undefined;
  },
  "C_Map.GetMapOverlays": (_h, a) => [(OVERLAYS[num(a[0]) ?? 12] ?? []).map((o) => overlay(o))],
  "C_Map.GetAreaTriggerInfo": (_h, a) => { const t = TRIGGERS.find((x) => x.id === a[0]); return t ? [withZone(t)] : undefined; },
  "C_Map.GetAreaTriggers": (_h, a) => [TRIGGERS.filter((t) => a[0] === undefined || t.mapID === a[0]).map(withZone)],
  "C_MapExplorationInfo.GetExploredMapTextures": (h, a) => [(OVERLAYS[num(a[0]) ?? 12] ?? []).filter((o) => st(h).explored.includes(o.area)).map(overlay)],
  "C_MapExplorationInfo.GetUnexploredMapTextures": (h, a) => [(OVERLAYS[num(a[0]) ?? 12] ?? []).filter((o) => !st(h).explored.includes(o.area)).map(overlay)],
  "C_MapExplorationInfo.GetExploredAreaIDsAtPosition": (h, a) => {
    const p = vec(a[1]); if (!p) return undefined;
    const ids = (OVERLAYS[num(a[0]) ?? NaN] ?? []).filter((o) => st(h).explored.includes(o.area) && p.x * 1002 >= o.l && p.x * 1002 <= o.l + o.w && p.y * 668 >= o.t && p.y * 668 <= o.t + o.h).map((o) => o.area);
    return ids.length ? [ids] : undefined;
  },
  // ----- Flugpunkte · taxi -----
  "C_TaxiMap.GetTaxiNodesForMap": (_h, a) => [TAXI_NODES.filter((n) => typeof a[0] !== "number" || n.map === a[0]).map((n) => {
    const z = byId.get(n.areaID); const p = z ? toMap(z, n.x, n.y) : undefined;
    const c = cont(n.map); const cp = c ? toMap(c, n.x, n.y) : undefined;
    return { nodeID: n.nodeID, name: n.name, faction: n.faction === "Alliance" ? 2 : n.faction === "Horde" ? 1 : 0, reachable: TAXI_PATHS.some((p2) => p2.toNodeID === n.nodeID), position: cp ?? { x: 0, y: 0 }, mapID: n.map, x: n.x, y: n.y, z: n.z, areaID: n.areaID, ...(p ? { mapX: round(p.x * 100, 2), mapY: round(p.y * 100, 2) } : {}) };
  })],
  "C_TaxiMap.GetTaxiPaths": () => [TAXI_PATHS],
  "C_TaxiMap.GetTaxiPathWaypoints": (_h, a) => {
    const p = TAXI_PATHS.find((x) => x.pathID === a[0]);
    const f = TAXI_NODES.find((n) => n.nodeID === p?.fromNodeID); const t = TAXI_NODES.find((n) => n.nodeID === p?.toNodeID);
    return p && f && t ? [[{ x: f.x, y: f.y, z: f.z, mapID: f.map }, { x: t.x, y: t.y, z: t.z, mapID: t.map }]] : undefined;
  },
  "C_GossipInfo.GetPoiForUiMapID": () => undefined,
  "C_GossipInfo.GetPoiInfo": () => undefined,
};

function overlay(o: { name: string; area: number; l: number; t: number; w: number; h: number }) {
  return {
    textureName: o.name, texturePath: `Interface\\WorldMap\\Elwynn\\${o.name}`, areaID: o.area, areaIDs: [o.area],
    textureWidth: o.w, textureHeight: o.h, offsetX: o.l, offsetY: o.t, mapPointX: 0, mapPointY: 0,
    hitRectTop: o.t, hitRectLeft: o.l, hitRectBottom: o.t + o.h, hitRectRight: o.l + o.w, tileCols: 1, tileRows: 1, upscaled: false,
    tiles: [{ file: `Interface\\WorldMap\\Elwynn\\${o.name}1`, width: o.w, height: o.h, texCoordX: 1, texCoordY: 1, offsetX: o.l, offsetY: o.t }],
    fileDataIDs: [`Interface\\WorldMap\\Elwynn\\${o.name}1`],
  };
}
function withZone(t: (typeof TRIGGERS)[number]) {
  const z = zoneOf(t.mapID, t.x, t.y); const p = z ? toMap(z, t.x, t.y) : undefined;
  return { ...t, ...(z && p ? { areaID: z.id, mapX: round(p.x * 100, 2), mapY: round(p.y * 100, 2) } : {}) };
}
void contOf;
