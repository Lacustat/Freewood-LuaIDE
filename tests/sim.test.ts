/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Helfer · helpers
 *  [S2] Frames und Skripte · frames and scripts
 *  [S3] Zeit · time
 *  [S4] Welt und Einheiten · world and units
 *  [S5] Ende-zu-Ende · end to end (Graph, Formular)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { FormModel, Graph, Kernel, WowSim, generateFormLua, generateLua, type ResolvedTarget } from "../src/index.js";
import { loadPluginsFromRoot } from "../src/node/fs-loaders.js";

// ===== [S1] Helfer · helpers =====
async function targets(): Promise<Record<string, ResolvedTarget>> {
  const k = new Kernel();
  const { plugins } = await loadPluginsFromRoot(join(process.cwd(), "plugins"));
  plugins.forEach((p) => k.plugins.register(p));
  return { v: k.plugins.resolve("vanilla-1.12"), c: k.plugins.resolve("classicapi-1.12"), r: k.plugins.resolve("retail") };
}
const texts = (s: WowSim, kind: string) => s.log.filter((l) => l.kind === kind).map((l) => l.text);

// ===== [S2] Frames und Skripte · frames and scripts =====
test("vanilla: global script args (this, event, arg1) and chat output", async () => {
  const t = await targets();
  const sim = new WowSim(t.v!);
  const r = sim.loadSource(`
    local f = CreateFrame("Frame", "MyFrame")
    f:RegisterEvent("ADDON_LOADED")
    f:SetScript("OnEvent", function()
      DEFAULT_CHAT_FRAME:AddMessage(event .. ":" .. tostring(arg1) .. ":" .. this:GetName())
    end)
  `);
  assert.ok(r.ok);
  sim.fireEvent("ADDON_LOADED", "MyAddon");
  assert.deepEqual(texts(sim, "chat"), ["ADDON_LOADED:MyAddon:MyFrame"]);
  assert.equal(sim.rt.interp.globals.get("event"), undefined, "globals are restored after the script");
});

test("retail: parameters (self, event, ...) and no globals", async () => {
  const t = await targets();
  const sim = new WowSim(t.r!);
  sim.loadSource(`
    local f = CreateFrame("Frame")
    f:RegisterEvent("ADDON_LOADED")
    f:SetScript("OnEvent", function(self, event, name)
      print(event, name, type(this), type(arg1))
    end)
  `);
  sim.fireEvent("ADDON_LOADED", "X");
  assert.deepEqual(texts(sim, "print"), ["ADDON_LOADED\tX\tnil\tnil"]);
});

test("methods exist only where the target data says so", async () => {
  const t = await targets();
  const code = `local f = CreateFrame("Frame") f:SetSize(10, 20) DEFAULT_CHAT_FRAME:AddMessage(f:GetWidth())`;
  const v = new WowSim(t.v!);
  const rv = v.loadSource(code);
  assert.equal(rv.ok, false);
  assert.match(rv.error!.message, /attempt to call method `SetSize' \(a nil value\)/);
  const c = new WowSim(t.c!);
  assert.ok(c.loadSource(code).ok);
  assert.deepEqual(texts(c, "chat"), ["10"]);
  const bad = new WowSim(t.v!);
  assert.match(bad.loadSource(`CreateFrame("Banana")`).error!.message, /unknown frame type 'Banana'/);
});

test("hierarchy: parent, show/hide scripts, visibility, click", async () => {
  const t = await targets();
  const sim = new WowSim(t.v!);
  sim.loadSource(`
    local p = CreateFrame("Frame", "P", UIParent)
    local b = CreateFrame("Button", "B", p)
    clicks = 0
    b:SetScript("OnClick", function() clicks = clicks + 1 this:GetParent():Hide() end)
    p:SetScript("OnHide", function() hidden = true end)
    c = CreateFrame("CheckButton", "C", p)
  `);
  const b = sim.byName("B")!;
  assert.equal(sim.visible(b), true);
  sim.click("B");
  assert.equal(sim.rt.interp.globals.get("clicks"), 1);
  assert.equal(sim.rt.interp.globals.get("hidden"), true);
  assert.equal(sim.visible(b), false);
  sim.click("C");
  assert.equal(sim.byName("C")!.checked, true);
  sim.click("B"); // still works, hidden parents do not block scripted clicks
  assert.equal(sim.rt.interp.globals.get("clicks"), 2);
});

test("script errors are logged, not thrown, and later handlers still run", async () => {
  const t = await targets();
  const sim = new WowSim(t.v!);
  sim.loadSource(`
    local a = CreateFrame("Frame") a:RegisterEvent("PLAYER_LOGIN") a:SetScript("OnEvent", function() error("boom") end)
    local b = CreateFrame("Frame") b:RegisterEvent("PLAYER_LOGIN") b:SetScript("OnEvent", function() ok = true end)
  `);
  sim.fireEvent("PLAYER_LOGIN");
  assert.match(texts(sim, "error")[0]!, /boom/);
  assert.equal(sim.rt.interp.globals.get("ok"), true);
});

test("unknown events and unsimulated API produce warnings", async () => {
  const t = await targets();
  const sim = new WowSim(t.v!);
  sim.loadSource(`local f = CreateFrame("Frame") f:RegisterEvent("NOT_REAL") local x = f.nothing`);
  sim.fireEvent("ALSO_NOT_REAL");
  const w = texts(sim, "warn");
  assert.ok(w.some((x) => x.includes("NOT_REAL") && x.includes("RegisterEvent")));
  assert.ok(w.some((x) => x.includes("ALSO_NOT_REAL")));
});

// ===== [S3] Zeit · time =====
test("OnUpdate, C_Timer.After, tickers and cancel", async () => {
  const t = await targets();
  const sim = new WowSim(t.c!);
  sim.loadSource(`
    updates, ticks, after = 0, 0, nil
    local f = CreateFrame("Frame")
    f:SetScript("OnUpdate", function() updates = updates + 1 end)
    C_Timer.After(1, function() after = GetTime() end)
    ticker = C_Timer.NewTicker(0.5, function(tk) ticks = ticks + 1 end)
  `);
  sim.advance(0.99);
  assert.equal(sim.rt.interp.globals.get("after"), undefined);
  sim.advance(0.02);
  assert.equal(sim.rt.interp.globals.get("after") !== undefined, true);
  assert.equal(sim.rt.interp.globals.get("ticks"), 2);
  sim.loadSource(`ticker:Cancel()`);
  sim.advance(5);
  assert.equal(sim.rt.interp.globals.get("ticks"), 2);
  assert.ok((sim.rt.interp.globals.get("updates") as number) > 100);
  const v = new WowSim(t.v!);
  assert.match(v.loadSource(`C_Timer.After(1, function() end)`).error!.message, /global `C_Timer'/);
});

test("slash commands", async () => {
  const t = await targets();
  const sim = new WowSim(t.v!);
  sim.loadSource(`
    SLASH_HELLO1 = "/hello"
    SLASH_HELLO2 = "/hi"
    SlashCmdList["HELLO"] = function(msg) DEFAULT_CHAT_FRAME:AddMessage("hello " .. msg) end
  `);
  assert.ok(sim.runSlash("/hi world"));
  assert.ok(sim.runSlash("/HELLO there"));
  assert.equal(sim.runSlash("/nope"), false);
  assert.deepEqual(texts(sim, "chat"), ["hello world", "hello there"]);
});

// ===== [S4] Welt und Einheiten · world and units =====
test("unit API: vanilla reports foreign health as percent, retail as numbers", async () => {
  const t = await targets();
  const code = `return UnitName("target"), UnitHealth("target"), UnitHealthMax("target"), UnitHealth("player"), UnitName("party1"), UnitExists("pet")`;
  const v = new WowSim(t.v!);
  assert.deepEqual(v.rt.executeSync(code).values, ["Defias Pillager", 100, 100, 3200, "Helper", false]);
  v.setHealth("target", 210);
  assert.deepEqual(v.rt.executeSync(`return UnitHealth("target")`).values, [50]);
  const r = new WowSim(t.r!);
  r.setHealth("target", 210);
  assert.deepEqual(r.rt.executeSync(`return UnitHealth("target"), UnitHealthMax("target")`).values, [210, 420]);
});

test("world changes fire events; chat message events", async () => {
  const t = await targets();
  const sim = new WowSim(t.v!);
  sim.loadSource(`
    local f = CreateFrame("Frame")
    for _, e in ipairs({"PLAYER_REGEN_DISABLED","PLAYER_TARGET_CHANGED","UNIT_HEALTH","CHAT_MSG_SAY"}) do f:RegisterEvent(e) end
    f:SetScript("OnEvent", function() seen = (seen or "") .. event .. "(" .. tostring(arg1) .. ");" end)
    SendChatMessage("hi", "SAY")
  `);
  sim.setCombat(true);
  sim.setTarget(undefined);
  sim.setHealth("player", 100);
  assert.equal(sim.rt.interp.globals.get("seen"), "CHAT_MSG_SAY(hi);PLAYER_REGEN_DISABLED(nil);PLAYER_TARGET_CHANGED(nil);UNIT_HEALTH(player);");
});

test("ClassicAPI target keeps Lua 5.0 library functions next to 5.1 syntax", async () => {
  const t = await targets();
  const sim = new WowSim(t.c!);
  const r = sim.rt.executeSync(`
    local n = 0
    for w in string.gfind("a b c", "%a") do n = n + 1 end
    return n, #"abc", math.mod(7, 3), 7 % 3, getn({1,2}), strlen("xy"), (strsplit(",", "a,b"))
  `);
  assert.deepEqual(r.values, [3, 3, 1, 1, 2, 2, "a"]);
});

// ===== [S5] Ende-zu-Ende · end to end =====
test("graph output runs in the simulation (vanilla and retail)", async () => {
  const t = await targets();
  for (const [name, target] of [["vanilla", t.v!], ["retail", t.r!]] as const) {
    const g = new Graph(undefined, target);
    const ev = g.addNode("event", 0, 0, { event: "PLAYER_ENTERING_WORLD" });
    const call = g.addNode("call", 0, 0, { fn: "UnitName", "lit.unit": "player" });
    const cat = g.addNode("concat");
    const hello = g.addNode("string", 0, 0, { value: "Hello, " });
    const pr = g.addNode("print");
    g.connect({ node: ev.id, pin: "then" }, { node: call.id, pin: "in" });
    g.connect({ node: call.id, pin: "then" }, { node: pr.id, pin: "in" });
    g.connect({ node: hello.id, pin: "value" }, { node: cat.id, pin: "a" });
    g.connect({ node: call.id, pin: "name" }, { node: cat.id, pin: "b" });
    g.connect({ node: cat.id, pin: "result" }, { node: pr.id, pin: "text" });
    const gen = generateLua(g, target);
    assert.deepEqual(gen.warnings, [], name);
    const sim = new WowSim(target);
    assert.ok(sim.loadSource(gen.code, "graph.lua").ok, name);
    sim.login();
    assert.deepEqual(texts(sim, "chat"), ["Hello, Testhero"], name);
  }
});

test("graph with loop, variables and slash runs", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.c);
  const sl = g.addNode("slash", 0, 0, { command: "sum" });
  const setv = g.addNode("set_var", 0, 0, { name: "total", "lit.value": 0 });
  const lp = g.addNode("for", 0, 0, { "lit.from": 1, "lit.to": 4 });
  const add = g.addNode("math", 0, 0, { op: "+" });
  const get = g.addNode("get_var", 0, 0, { name: "total" });
  const acc = g.addNode("set_var", 0, 0, { name: "total" });
  const pr = g.addNode("print");
  const link = (a: string, ap: string, b: string, bp: string) => g.connect({ node: a, pin: ap }, { node: b, pin: bp });
  link(sl.id, "then", setv.id, "in");
  link(setv.id, "then", lp.id, "in");
  link(lp.id, "body", acc.id, "in");
  link(get.id, "value", add.id, "a");
  link(lp.id, "index", add.id, "b");
  link(add.id, "result", acc.id, "value");
  link(lp.id, "done", pr.id, "in");
  link(get.id, "value", pr.id, "text");
  const gen = generateLua(g, t.c!);
  assert.deepEqual(gen.warnings, []);
  const sim = new WowSim(t.c!);
  assert.ok(sim.loadSource(gen.code).ok);
  assert.ok(sim.runSlash("/sum"));
  assert.deepEqual(texts(sim, "chat"), ["10"]);
});

test("form output builds the same UI in the simulation", async () => {
  const t = await targets();
  const m = new FormModel();
  const main = m.add("Frame", null, { name: "Main", width: 200, height: 100, strata: "DIALOG" });
  m.setAnchor(main.id, { point: "CENTER", relativeTo: null, relativePoint: "CENTER", x: 0, y: 0 });
  const title = m.add("FontString", main.id, { name: "MainTitle", text: "Title" });
  m.setAnchor(title.id, { point: "TOP", relativeTo: null, relativePoint: "TOP", x: 0, y: -10 });
  const btn = m.add("Button", main.id, { name: "MainOK", width: 80, height: 22, text: "OK", scripts: { OnClick: "this:GetParent():Hide()" } });
  m.setAnchor(btn.id, { point: "BOTTOM", relativeTo: null, relativePoint: "BOTTOM", x: 0, y: 10 });
  const gen = generateFormLua(m, t.v!);
  assert.deepEqual(gen.warnings, []);
  const sim = new WowSim(t.v!);
  assert.ok(sim.loadSource(gen.code, "form.lua").ok, JSON.stringify(sim.log));
  const snap = sim.snapshot();
  const get = (n: string) => snap.find((x) => x.name === n)!;
  assert.deepEqual(get("Main").rect, { left: 412, bottom: 334, width: 200, height: 100 });
  assert.equal(get("MainTitle").text, "Title");
  assert.deepEqual(get("MainOK").rect, { left: 472, bottom: 344, width: 80, height: 22 });
  assert.equal(get("Main").strata, "DIALOG");
  sim.click("MainOK");
  assert.equal(sim.byName("Main")!.shown, false);
  // retail output uses (self, button, down) and runs too
  const r = new WowSim(t.r!);
  const rgen = generateFormLua(m, t.r!);
  const rr = r.loadSource(rgen.code.replace("this:GetParent()", "self:GetParent()"), "form.lua");
  assert.ok(rr.ok, JSON.stringify(r.log));
});

test("retail backdrop needs the BackdropTemplate", async () => {
  const t = await targets();
  const sim = new WowSim(t.r!);
  assert.match(sim.loadSource(`local f = CreateFrame("Frame") f:SetBackdrop({})`).error!.message, /attempt to call method 'SetBackdrop'/);
  assert.ok(sim.loadSource(`local f = CreateFrame("Frame", nil, UIParent, "BackdropTemplate") f:SetBackdrop({}) f:SetBackdropColor(0,0,0,1)`).ok);
});
