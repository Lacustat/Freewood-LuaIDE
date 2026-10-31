/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Karte, Waypoints, Flugpunkte · map, waypoints, taxi
 */
import assert from "node:assert/strict";
import { engines, run, targets } from "./harness.js";

// ===== [S1] Karte · map =====

engines("C_Map: zones, positions, conversion, waypoint and hyperlink", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local id = C_Map.GetBestMapForUnit("player")
    local info = C_Map.GetMapInfo(id)
    local pos = C_Map.GetPlayerMapPosition(id, "player")
    local x, y = pos:GetXY()
    local cid, world = C_Map.GetWorldPosFromMapPos(id, pos)
    local back, pos2 = C_Map.GetMapPosFromWorldPos(cid, world)
    local kids = C_Map.GetMapChildrenInfo(-14)
    local ok = C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(id, 0.5, 0.25))
    local hl = C_Map.GetUserWaypointHyperlink()
    local wp = C_Map.GetUserWaypoint()
    local px, py = C_Map.GetUserWaypointPositionForMap(-14):GetXY()
    local before = C_Map.HasUserWaypoint()
    C_Map.ClearUserWaypoint()
    local w, h = C_Map.GetMapWorldSize(id)
    return id, info.name, info.mapType, x > 0 and x < 1, cid, back, pos2.x == x, table.getn(kids) > 0, ok, hl, wp.position.x, px > 0 and px < 1, before, C_Map.HasUserWaypoint(), w > h, C_Map.GetAreaInfo(87), C_Map.GetBestMapForUnit("target")
  `);
  assert.deepEqual(v.slice(0, 2), [12, "Elwynn Forest"]);
  assert.equal(v[2], 3);
  assert.equal(v[3], true);
  assert.equal(v[4], 0);
  assert.equal(v[5], 12);
  assert.equal(v[6], true);
  assert.equal(v[7], true);
  assert.equal(v[8], true);
  assert.match(String(v[9]), /^\|cffffff00\|Hworldmap:12:5000:2500\|h\[Map Pin Location\]\|h\|r$/);
  assert.equal(v[10], 0.5);
  assert.deepEqual(v.slice(11), [true, true, false, true, "Goldshire"]);
});

engines("C_Map: overlays, exploration, areas and taxi nodes", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local ov = C_Map.GetMapOverlays(12)
    local ex = C_MapExplorationInfo.GetExploredMapTextures(12)
    local un = C_MapExplorationInfo.GetUnexploredMapTextures(12)
    local areas = C_Map.GetAreas()
    local nodes = C_TaxiMap.GetTaxiNodesForMap(0)
    local paths = C_TaxiMap.GetTaxiPaths()
    local wp = C_TaxiMap.GetTaxiPathWaypoints(paths[1].pathID)
    local trig = C_Map.GetAreaTriggerInfo(1)
    local a, b, c, d = C_Map.GetMapRectOnMap(12, -14)
    return table.getn(ov), table.getn(ex), table.getn(un), areas[12], table.getn(nodes), nodes[1].faction == Enum.FlightPathFaction.Alliance, table.getn(wp), trig.areaID, a < b and c < d, C_Map.CanSetUserWaypointOnMap(-694), C_Map.MapHasArt(12)
  `);
  assert.deepEqual(v, [2, 2, 0, "Elwynn Forest", 3, true, 2, 12, true, false, true]);
});

// ===== [S2] Kleine Namespaces · small namespaces =====

engines("small namespaces: addons, coin text, colors, JSON, encoding, atlas, macros", async (mk) => {
  const t = await targets();
  const sim = await mk(t.c!);
  const v = run(sim, `
    local loaded1, loaded2 = C_AddOns.IsAddOnLoaded("Blizzard_AuctionUI")
    local ok, why = C_AddOns.LoadAddOn("Blizzard_AuctionUI")
    local a1 = C_AddOns.IsAddOnLoaded(2)
    local c = C_ClassColor.GetClassColor("MAGE")
    local json = C_EncodingUtil.SerializeJSON({ a = 1, list = { 1, 2, 3 }, s = "x\\"y" })
    local back = C_EncodingUtil.DeserializeJSON(json)
    C_Texture.RegisterAtlas("MyAtlas", "Interface\\\\MyAddon\\\\Sheet", 64, 32, 0, 0.5, 0, 1)
    local info = C_Texture.GetAtlasInfo("MyAtlas")
    local idx = C_Macro.CreateMacro("Fb", "INV_Misc_Bone_01", "/cast Fireball", false)
    local mi = C_Macro.GetMacroIcon(idx)
    return loaded1, ok, a1, c:GenerateHexColor(), back.a, back.list[3], back.s, C_EncodingUtil.EncodeBase64("Hello"), C_EncodingUtil.DecodeBase64("SGVsbG8="), C_EncodingUtil.EncodeHex("AB"), C_EncodingUtil.DecompressString(C_EncodingUtil.CompressString("zip me")), GetCoinText(123456), info.width, info.rightTexCoord, C_Texture.GetAtlasID("MyAtlas") < 0, mi, C_EventUtils.IsEventValid("PLAYER_LOGIN"), C_EventUtils.IsEventValid("NOPE_EVENT")
  `);
  assert.deepEqual(v, [false, 1, true, "ff69ccf0", 1, 3, 'x"y', "SGVsbG8=", "Hello", "4142", "zip me", "12 Gold, 34 Silver, 56 Copper", 64, 0.5, true, "Interface\\Icons\\INV_Misc_Bone_01", true, false]);
});
