/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Helfer · helpers
 *  [S2] Modell · model
 *  [S3] Codegenerator · code generator
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Graph, Kernel, generateLua, parse, type ResolvedTarget } from "../src/index.js";
import { loadPluginsFromRoot } from "../src/node/fs-loaders.js";

// ===== [S1] Helfer · helpers =====
async function targets(): Promise<Record<string, ResolvedTarget>> {
  const k = new Kernel();
  const { plugins } = await loadPluginsFromRoot(join(process.cwd(), "plugins"));
  plugins.forEach((p) => k.plugins.register(p));
  return { v: k.plugins.resolve("vanilla-1.12"), c: k.plugins.resolve("classicapi-1.12"), r: k.plugins.resolve("retail") };
}

function sample(g: Graph): void {
  const ev = g.addNode("event", 0, 0, { event: "PLAYER_ENTERING_WORLD" });
  const call = g.addNode("call", 200, 0, { fn: "UnitName", "lit.unit": "player" });
  const cat = g.addNode("concat", 400, 0);
  const hello = g.addNode("string", 300, 100, { value: "Hello, " });
  const pr = g.addNode("print", 600, 0);
  g.connect({ node: ev.id, pin: "then" }, { node: call.id, pin: "in" });
  g.connect({ node: call.id, pin: "then" }, { node: pr.id, pin: "in" });
  g.connect({ node: hello.id, pin: "value" }, { node: cat.id, pin: "a" });
  g.connect({ node: call.id, pin: "name" }, { node: cat.id, pin: "b" });
  g.connect({ node: cat.id, pin: "result" }, { node: pr.id, pin: "text" });
}

// ===== [S2] Modell · model =====
test("connect rules", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.v);
  const a = g.addNode("event", 0, 0, { event: "PLAYER_ENTERING_WORLD" });
  const b = g.addNode("print");
  const c = g.addNode("number");
  const d = g.addNode("print");
  assert.throws(() => g.connect({ node: a.id, pin: "then" }, { node: a.id, pin: "in" }), (e: any) => e.code === "GRAPH_SELF");
  assert.throws(() => g.connect({ node: a.id, pin: "then" }, { node: b.id, pin: "text" }), (e: any) => e.code === "GRAPH_KIND");
  assert.throws(() => g.connect({ node: a.id, pin: "nope" }, { node: b.id, pin: "in" }), (e: any) => e.code === "GRAPH_PIN");
  g.connect({ node: a.id, pin: "then" }, { node: b.id, pin: "in" });
  g.connect({ node: a.id, pin: "then" }, { node: d.id, pin: "in" }); // exec output has one target: replaces
  assert.equal(g.doc.edges.length, 1);
  g.connect({ node: c.id, pin: "value" }, { node: b.id, pin: "text" });
  const c2 = g.addNode("number");
  g.connect({ node: c2.id, pin: "value" }, { node: b.id, pin: "text" }); // input has one source: replaces
  assert.equal(g.doc.edges.filter((e) => e.to.pin === "text").length, 1);
  g.removeNode(c2.id);
  assert.equal(g.doc.edges.filter((e) => e.to.pin === "text").length, 0);
  assert.throws(() => g.addNode("bogus"), (e: any) => e.code === "GRAPH_NODE_TYPE");
});

test("serialize / parse roundtrip and validation", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.v);
  sample(g);
  const copy = Graph.parse(g.serialize(), t.v);
  assert.deepEqual(copy.doc, g.doc);
  assert.throws(() => Graph.parse("nope"), (e: any) => e.code === "GRAPH_PARSE");
  assert.throws(() => Graph.parse('{"format":"x"}'), (e: any) => e.code === "GRAPH_PARSE");
  const bad = JSON.parse(g.serialize());
  bad.edges[0].to.node = "ghost";
  assert.throws(() => Graph.parse(JSON.stringify(bad)), (e: any) => e.code === "GRAPH_PARSE");
});

// ===== [S3] Codegenerator · code generator =====
test("vanilla output uses globals style and parses as Lua 5.0", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.v);
  sample(g);
  const r = generateLua(g, t.v!);
  assert.deepEqual(r.warnings, []);
  assert.match(r.code, /fwFrame:RegisterEvent\("PLAYER_ENTERING_WORLD"\)/);
  assert.match(r.code, /SetScript\("OnEvent", function\(\)/);
  assert.match(r.code, /local l_n\d+_name = UnitName\("player"\)/);
  assert.match(r.code, /DEFAULT_CHAT_FRAME:AddMessage\(tostring\(\("Hello, " \.\. l_n\d+_name\)\)\)/);
  parse(r.code, "gen", "5.0");
});

test("retail output uses argument style", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.r);
  const ev = g.addNode("event", 0, 0, { event: "ADDON_LOADED" });
  const pr = g.addNode("print");
  g.connect({ node: ev.id, pin: "then" }, { node: pr.id, pin: "in" });
  g.connect({ node: ev.id, pin: "addOnName" }, { node: pr.id, pin: "text" });
  const r = generateLua(g, t.r!);
  assert.match(r.code, /function\(self, event, \.\.\.\)/);
  assert.match(r.code, /local ev_addOnName = \.\.\./);
  assert.match(r.code, /tostring\(ev_addOnName\)/);
  parse(r.code, "gen", "5.1");
});

test("control flow: if / for / sequence / vars", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.c);
  const sl = g.addNode("slash", 0, 0, { command: "/count" });
  const setv = g.addNode("set_var", 0, 0, { name: "total", "lit.value": 0 });
  const lp = g.addNode("for", 0, 0, { "lit.from": 1, "lit.to": 3 });
  const add = g.addNode("math", 0, 0, { op: "+" });
  const get = g.addNode("get_var", 0, 0, { name: "total" });
  const acc = g.addNode("set_var", 0, 0, { name: "total" });
  const cmp = g.addNode("compare", 0, 0, { op: ">", "lit.b": 3 });
  const iff = g.addNode("if");
  const p1 = g.addNode("print", 0, 0, { "lit.text": "big" });
  const p2 = g.addNode("print", 0, 0, { "lit.text": "small" });
  const len = g.addNode("length", 0, 0, { "lit.table": "=arg" });
  const link = (a: string, ap: string, b: string, bp: string) => g.connect({ node: a, pin: ap }, { node: b, pin: bp });
  link(sl.id, "then", setv.id, "in");
  link(setv.id, "then", lp.id, "in");
  link(lp.id, "body", acc.id, "in");
  link(get.id, "value", add.id, "a");
  link(lp.id, "index", add.id, "b");
  link(add.id, "result", acc.id, "value");
  link(lp.id, "done", iff.id, "in");
  link(get.id, "value", cmp.id, "a");
  link(cmp.id, "result", iff.id, "cond");
  link(iff.id, "then", p1.id, "in");
  link(iff.id, "else", p2.id, "in");
  const r = generateLua(g, t.c!);
  assert.deepEqual(r.warnings, []);
  assert.match(r.code, /local total\n/);
  assert.match(r.code, /SLASH_FW1_\w+1 = "\/count"/);
  assert.match(r.code, /for l_\w+_index = 1, 3 do/);
  assert.match(r.code, /total = \(total \+ l_\w+_index\)/);
  assert.match(r.code, /if \(total > 3\) then/);
  assert.match(r.code, /else\n/);
  parse(r.code, "gen", "5.1");
  void len;
});

test("target differences: # vs table.getn, % vs math.mod, delay needs timer", async () => {
  const t = await targets();
  const build = (target: ResolvedTarget) => {
    const g = new Graph(undefined, target);
    const up = g.addNode("onupdate");
    const pr = g.addNode("print");
    const m = g.addNode("math", 0, 0, { op: "%", "lit.a": 7, "lit.b": 3 });
    const l = g.addNode("length", 0, 0, { "lit.table": "=t" });
    const cat = g.addNode("concat");
    g.connect({ node: up.id, pin: "then" }, { node: pr.id, pin: "in" });
    g.connect({ node: m.id, pin: "result" }, { node: cat.id, pin: "a" });
    g.connect({ node: l.id, pin: "result" }, { node: cat.id, pin: "b" });
    g.connect({ node: cat.id, pin: "result" }, { node: pr.id, pin: "text" });
    return generateLua(g, target);
  };
  const v = build(t.v!);
  assert.match(v.code, /math\.mod\(7, 3\)/);
  assert.match(v.code, /table\.getn\(t\)/);
  parse(v.code, "gen", "5.0");
  const c = build(t.c!);
  assert.match(c.code, /\(7 % 3\)/);
  assert.match(c.code, /\(#t\)/);
  parse(c.code, "gen", "5.1");

  const g = new Graph(undefined, t.v);
  const ev = g.addNode("event", 0, 0, { event: "PLAYER_ENTERING_WORLD" });
  const d = g.addNode("delay", 0, 0, { "lit.seconds": 2 });
  g.connect({ node: ev.id, pin: "then" }, { node: d.id, pin: "in" });
  assert.equal(generateLua(g, t.v!).warnings[0]?.code, "GEN_NO_TIMER");
  const g2 = new Graph(undefined, t.c);
  const ev2 = g2.addNode("event", 0, 0, { event: "PLAYER_ENTERING_WORLD" });
  const d2 = g2.addNode("delay", 0, 0, { "lit.seconds": 2 });
  const p2 = g2.addNode("print", 0, 0, { "lit.text": "later" });
  g2.connect({ node: ev2.id, pin: "then" }, { node: d2.id, pin: "in" });
  g2.connect({ node: d2.id, pin: "then" }, { node: p2.id, pin: "in" });
  const r2 = generateLua(g2, t.c!);
  assert.match(r2.code, /C_Timer\.After\(2, function\(\)/);
  parse(r2.code, "gen", "5.1");
});

test("warnings: missing input, unknown function/event, unreachable, flow loop, bad names", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.v);
  const ev = g.addNode("event", 0, 0, { event: "NOT_AN_EVENT" });
  const c1 = g.addNode("call", 0, 0, { fn: "SendChatMessage" });
  const c2 = g.addNode("call", 0, 0, { fn: "Nope" });
  const seq = g.addNode("sequence");
  g.addNode("print"); // unreachable
  const bad = g.addNode("set_var", 0, 0, { name: "1bad", "lit.value": 1 });
  g.connect({ node: ev.id, pin: "then" }, { node: c1.id, pin: "in" });
  g.connect({ node: c1.id, pin: "then" }, { node: c2.id, pin: "in" });
  g.connect({ node: c2.id, pin: "then" }, { node: seq.id, pin: "in" });
  g.connect({ node: seq.id, pin: "then1" }, { node: bad.id, pin: "in" });
  // the editor allows one incoming exec edge per node, a hand-edited file may still loop back
  g.doc.edges.push({ from: { node: bad.id, pin: "then" }, to: { node: seq.id, pin: "in" } });
  const codes = generateLua(g, t.v!).warnings.map((w) => w.code);
  for (const c of ["GEN_EVENT_MISSING", "GEN_MISSING_INPUT", "GEN_FN_MISSING", "GEN_UNREACHABLE", "GEN_CYCLE", "GEN_BAD_NAME"]) {
    assert.ok(codes.includes(c as never), c);
  }
});

test("literals and quoting produce valid Lua", async () => {
  const t = await targets();
  const g = new Graph(undefined, t.v);
  const ev = g.addNode("event", 0, 0, { event: "PLAYER_ENTERING_WORLD" });
  const p = g.addNode("print", 0, 0, { "lit.text": 'say "hi"\n\\ ü' });
  const raw = g.addNode("raw", 0, 0, { code: "local x = 1\nprint(x)" });
  g.connect({ node: ev.id, pin: "then" }, { node: p.id, pin: "in" });
  g.connect({ node: p.id, pin: "then" }, { node: raw.id, pin: "in" });
  const r = generateLua(g, t.v!);
  assert.match(r.code, /tostring\("say \\"hi\\"\\n\\\\ ü"\)/);
  parse(r.code, "gen", "5.0");
});
