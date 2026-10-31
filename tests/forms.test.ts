/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Helfer · helpers
 *  [S2] Modell und Ebenen · model and layers
 *  [S3] Layout
 *  [S4] Lua-Generator · Lua generator
 *  [S5] XML
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { FormModel, Kernel, generateFormLua, generateFormXml, importFormXml, parse, parseXml, type ResolvedTarget } from "../src/index.js";
import { loadPluginsFromRoot } from "../src/node/fs-loaders.js";

// ===== [S1] Helfer · helpers =====
async function targets(): Promise<Record<string, ResolvedTarget>> {
  const k = new Kernel();
  const { plugins } = await loadPluginsFromRoot(join(process.cwd(), "plugins"));
  plugins.forEach((p) => k.plugins.register(p));
  return { v: k.plugins.resolve("vanilla-1.12"), c: k.plugins.resolve("classicapi-1.12"), r: k.plugins.resolve("retail") };
}

function build(): FormModel {
  const m = new FormModel();
  const main = m.add("Frame", null, {
    name: "MyAddonFrame", width: 220, height: 120, strata: "DIALOG", movable: true, enableMouse: true,
    backdrop: { bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background", edgeFile: "Interface\\DialogFrame\\UI-DialogBox-Border", tile: true, tileSize: 32, edgeSize: 32, insets: { left: 11, right: 12, top: 12, bottom: 11 } },
  });
  m.setAnchor(main.id, { point: "CENTER", relativeTo: null, relativePoint: "CENTER", x: 0, y: 20 });
  const title = m.add("FontString", main.id, { name: "MyAddonTitle", text: "Hello \"WoW\"", layer: "OVERLAY", font: { object: "GameFontNormal" } });
  m.setAnchor(title.id, { point: "TOP", relativeTo: null, relativePoint: "TOP", x: 0, y: -14 });
  const bg = m.add("Texture", main.id, { layer: "BACKGROUND", width: 50, height: 50, color: { r: 1, g: 0, b: 0, a: 0.5 } });
  m.setAnchor(bg.id, { point: "BOTTOMLEFT", relativeTo: null, relativePoint: "BOTTOMLEFT", x: 10, y: 10 });
  const btn = m.add("Button", main.id, { name: "MyAddonOK", text: "OK", width: 80, height: 22, inherits: "UIPanelButtonTemplate", scripts: { OnClick: "this:GetParent():Hide()" } });
  m.setAnchor(btn.id, { point: "BOTTOMRIGHT", relativeTo: null, relativePoint: "BOTTOMRIGHT", x: -14, y: 14 });
  return m;
}

// ===== [S2] Modell und Ebenen · model and layers =====
test("hierarchy rules", () => {
  const m = new FormModel();
  const f = m.add("Frame", null, { name: "A" });
  const t = m.add("Texture", f.id);
  assert.throws(() => m.add("Texture", null), (e: any) => e.code === "FORM_PARENT");
  assert.throws(() => m.add("Frame", t.id), (e: any) => e.code === "FORM_PARENT");
  assert.throws(() => m.add("Frame", null, { name: "a" }), (e: any) => e.code === "FORM_NAME_DUP");
  assert.throws(() => m.add("Frame", null, { name: "1x" }), (e: any) => e.code === "FORM_NAME");
  const g = m.add("Frame", f.id);
  assert.throws(() => m.reparent(f.id, g.id), (e: any) => e.code === "FORM_CYCLE");
  m.reparent(g.id, null);
  assert.equal(g.parent, null);
  m.setAnchor(g.id, { point: "TOP", relativeTo: f.id, relativePoint: "BOTTOM", x: 0, y: 0 });
  assert.throws(() => m.setAnchor(f.id, { point: "TOP", relativeTo: g.id, relativePoint: "BOTTOM", x: 0, y: 0 }), (e: any) => e.code === "FORM_ANCHOR");
  assert.throws(() => m.setAnchor(f.id, { point: "TOP", relativeTo: f.id, relativePoint: "BOTTOM", x: 0, y: 0 }), (e: any) => e.code === "FORM_ANCHOR");
  m.remove(f.id);
  assert.equal(m.doc.widgets.length, 1);
  assert.equal(g.anchors[0]!.relativeTo, null);
});

test("render order: strata, level, draw layers", () => {
  const m = new FormModel();
  const low = m.add("Frame", null, { name: "Low", strata: "LOW" });
  const high = m.add("Frame", null, { name: "High", strata: "HIGH" });
  const mid2 = m.add("Frame", null, { name: "Mid2", level: 2 });
  const mid1 = m.add("Frame", null, { name: "Mid1", level: 1 });
  const art = m.add("Texture", mid1.id, { layer: "ARTWORK" });
  const bgt = m.add("Texture", mid1.id, { layer: "BACKGROUND" });
  const kid = m.add("Frame", mid1.id, { name: "Kid" });
  const names = m.renderOrder().map((w) => w.name || w.id);
  assert.deepEqual(names, ["Low", "Mid1", bgt.id, art.id, "Kid", "Mid2", "High"]);
  m.shiftLayer(low.id, 1);
  m.shiftLayer(low.id, 1);
  assert.equal(m.effectiveStrata(low.id), "HIGH");
  assert.equal(m.effectiveStrata(kid.id), "MEDIUM");
  m.update(mid1.id, { strata: "TOOLTIP" });
  assert.equal(m.effectiveStrata(kid.id), "TOOLTIP");
  assert.equal(m.renderOrder().at(-1)!.name, "Kid");
  m.shiftLayer(bgt.id, 1);
  assert.equal(bgt.layer, "BORDER");
  m.raise(art.id, 1);
  assert.equal(art.sublevel, 1);
  void high; void mid2;
});

// ===== [S3] Layout =====
test("layout from anchors", () => {
  const m = new FormModel();
  const a = m.add("Frame", null, { name: "A", width: 200, height: 100 });
  m.setAnchor(a.id, { point: "BOTTOMLEFT", relativeTo: null, relativePoint: "BOTTOMLEFT", x: 50, y: 60 });
  const b = m.add("Frame", a.id, { name: "B", width: 40, height: 20 });
  m.setAnchor(b.id, { point: "TOPRIGHT", relativeTo: null, relativePoint: "TOPRIGHT", x: -10, y: -5 });
  const c = m.add("Frame", null, { name: "C", width: 10, height: 10 });
  m.setAnchor(c.id, { point: "LEFT", relativeTo: b.id, relativePoint: "RIGHT", x: 3, y: 0 });
  const s = m.add("Frame", a.id, { name: "S" });
  m.update(s.id, { width: undefined, height: undefined });
  s.anchors = [
    { point: "TOPLEFT", relativeTo: null, relativePoint: "TOPLEFT", x: 5, y: -5 },
    { point: "BOTTOMRIGHT", relativeTo: null, relativePoint: "BOTTOMRIGHT", x: -5, y: 5 },
  ];
  const r = m.layoutRects();
  assert.deepEqual(r.get(a.id), { left: 50, bottom: 60, width: 200, height: 100 });
  assert.deepEqual(r.get(b.id), { left: 200, bottom: 135, width: 40, height: 20 });
  assert.deepEqual(r.get(c.id), { left: 243, bottom: 140, width: 10, height: 10 });
  assert.deepEqual(r.get(s.id), { left: 55, bottom: 65, width: 190, height: 90 });
  const centered = new FormModel();
  const z = centered.add("Frame", null, { width: 100, height: 50 });
  assert.deepEqual(centered.layoutRects({ width: 1024, height: 768 }).get(z.id), { left: 462, bottom: 359, width: 100, height: 50 });
});

// ===== [S4] Lua-Generator · Lua generator =====
test("Lua generation per target", async () => {
  const t = await targets();
  const m = build();
  const v = generateFormLua(m, t.v!);
  assert.deepEqual(v.warnings, []);
  assert.match(v.code, /local MyAddonFrame = CreateFrame\("Frame", "MyAddonFrame", UIParent\)/);
  assert.match(v.code, /MyAddonFrame:SetWidth\(220\)/);
  assert.match(v.code, /MyAddonFrame:SetFrameStrata\("DIALOG"\)/);
  assert.match(v.code, /MyAddonFrame:SetBackdrop\(\{ bgFile = "Interface\\\\DialogFrame\\\\UI-DialogBox-Background"/);
  assert.match(v.code, /local MyAddonTitle = MyAddonFrame:CreateFontString\("MyAddonTitle", "OVERLAY", "GameFontNormal"\)/);
  assert.match(v.code, /MyAddonTitle:SetText\("Hello \\"WoW\\""\)/);
  assert.match(v.code, /local texture1 = MyAddonFrame:CreateTexture\(nil, "BACKGROUND"\)/);
  assert.match(v.code, /texture1:SetTexture\(1, 0, 0, 0\.5\)/);
  assert.match(v.code, /MyAddonOK:SetScript\("OnClick", function\(\)\n  this:GetParent\(\):Hide\(\)/);
  parse(v.code, "gen", "5.0");

  const r = generateFormLua(m, t.r!);
  assert.match(r.code, /CreateFrame\("Frame", "MyAddonFrame", UIParent, "BackdropTemplate"\)/);
  assert.match(r.code, /MyAddonFrame:SetSize\(220, 120\)/);
  assert.match(r.code, /texture1:SetColorTexture\(1, 0, 0, 0\.5\)/);
  assert.match(r.code, /SetScript\("OnClick", function\(self, button, down\)/);
  assert.ok(r.warnings.some((w) => w.code === "FORM_BACKDROP_TEMPLATE"));
  parse(r.code, "gen", "5.1");

  const bad = new FormModel();
  bad.add("Cooldown", null);
  bad.add("Frame", null, { scripts: { OnBogus: "x=1" } });
  const codes = generateFormLua(bad, t.v!).warnings.map((w) => w.code);
  assert.deepEqual(codes.sort(), ["FORM_SCRIPT_UNKNOWN", "FORM_UNKNOWN_KIND"]);
});

test("anchors to other widgets are created after their targets", async () => {
  const t = await targets();
  const m = new FormModel();
  const late = m.add("Frame", null, { name: "Late" });
  const early = m.add("Frame", null, { name: "Early" });
  m.setAnchor(early.id, { point: "TOP", relativeTo: late.id, relativePoint: "BOTTOM", x: 0, y: -5 });
  // move 'Early' first in the list
  m.doc.widgets.reverse();
  const code = generateFormLua(m, t.v!).code;
  assert.ok(code.indexOf("local Late =") < code.indexOf("local Early ="));
  assert.match(code, /Early:SetPoint\("TOP", Late, "BOTTOM", 0, -5\)/);
});

// ===== [S5] XML =====
test("mini XML parser", () => {
  const n = parseXml(`<?xml version="1.0"?><!-- c --><A x="1 &amp; 2"><B/><C>t&lt;1<![CDATA[ <raw> ]]></C></A>`);
  assert.equal(n.attrs["x"], "1 & 2");
  assert.equal(n.children.length, 2);
  assert.equal(n.children[1]!.text, "t<1 <raw>");
  assert.throws(() => parseXml("<A><B></A>"), (e: any) => e.code === "XML_PARSE");
  assert.throws(() => parseXml("<A"), (e: any) => e.code === "XML_PARSE");
  assert.throws(() => parseXml("<A/><B/>"), (e: any) => e.code === "XML_PARSE");
});

test("XML export, import and roundtrip", async () => {
  const t = await targets();
  const m = build();
  const x = generateFormXml(m, t.v!);
  assert.deepEqual(x.warnings, []);
  assert.match(x.xml, /<Frame name="MyAddonFrame" parent="UIParent" frameStrata="DIALOG" movable="true" enableMouse="true">/);
  assert.match(x.xml, /<Size>\n\s+<AbsDimension x="220" y="120"\/>/);
  assert.match(x.xml, /<Layer level="BACKGROUND">/);
  assert.ok(x.xml.indexOf('level="BACKGROUND"') < x.xml.indexOf('level="OVERLAY"'));
  assert.match(x.xml, /<OnClick>this:GetParent\(\):Hide\(\)<\/OnClick>/);
  parseXml(x.xml);

  const back = importFormXml(x.xml, t.v!);
  assert.deepEqual(back.warnings, []);
  assert.equal(back.model.doc.widgets.length, m.doc.widgets.length);
  const again = generateFormXml(back.model, t.v!);
  assert.equal(again.xml, x.xml);
  // XML groups regions by draw layer, so the creation order may differ: compare the set of lines
  const lineSet = (c: string) => c.split("\n").filter((l) => l && !l.startsWith("--")).sort();
  assert.deepEqual(lineSet(generateFormLua(back.model, t.v!).code), lineSet(generateFormLua(m, t.v!).code));

  const modern = generateFormXml(m, t.r!);
  assert.match(modern.xml, /<Size x="220" y="120"\/>/);
  const back2 = importFormXml(modern.xml, t.r!);
  assert.equal(generateFormXml(back2.model, t.r!).xml, modern.xml);

  assert.throws(() => importFormXml("<Foo/>", t.v!), (e: any) => e.code === "XML_FORMAT");
  const unnamed = new FormModel();
  const a = unnamed.add("Frame", null);
  const b = unnamed.add("Frame", null, { name: "B" });
  unnamed.setAnchor(b.id, { point: "TOP", relativeTo: a.id, relativePoint: "BOTTOM", x: 0, y: 0 });
  assert.equal(generateFormXml(unnamed, t.v!).warnings[0]?.code, "FORM_UNNAMED_ANCHOR");
});

test("form file roundtrip and validation", () => {
  const m = build();
  assert.deepEqual(FormModel.parse(m.serialize()).doc, JSON.parse(JSON.stringify(m.doc)));
  assert.throws(() => FormModel.parse("x"), (e: any) => e.code === "FORM_PARSE");
  assert.throws(() => FormModel.parse('{"format":"freewood-form","version":1,"widgets":[{"id":"a","kind":"Frame","parent":"zz"}]}'), (e: any) => e.code === "FORM_PARSE");
});
