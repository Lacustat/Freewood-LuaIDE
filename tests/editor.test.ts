/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Helfer · helpers
 *  [S2] Highlight
 *  [S3] Completion
 *  [S4] Diagnose · diagnostics
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { Kernel, highlightLua, highlightXml, toHtml, completeAt, signatureAt, checkSource, type ResolvedTarget } from "../src/index.js";
import { loadPluginsFromRoot } from "../src/node/fs-loaders.js";

// ===== [S1] Helfer · helpers =====
async function targets(): Promise<Record<string, ResolvedTarget>> {
  const k = new Kernel();
  const { plugins } = await loadPluginsFromRoot(join(process.cwd(), "plugins"));
  plugins.forEach((p) => k.plugins.register(p));
  return { v: k.plugins.resolve("vanilla-1.12"), c: k.plugins.resolve("classicapi-1.12"), r: k.plugins.resolve("retail") };
}
const at = (src: string) => src.indexOf("|");
const strip = (src: string) => src.replace("|", "");

// ===== [S2] Highlight =====
test("highlightLua classifies and never loses text", () => {
  const src = `-- c\nlocal s = "a\\"b" -- x\nfunction f(a) return a + 0x1F end [[long\nstr]] --[[ block ]] x = 'unterminated`;
  const spans = highlightLua(src);
  assert.equal(spans.map((s) => s.text).join(""), src);
  const cls = (t: string) => spans.find((s) => s.text === t)?.cls;
  assert.equal(cls("local"), "kw");
  assert.equal(cls("0x1F"), "num");
  assert.equal(cls("-- c"), "com");
  assert.equal(cls('"a\\"b"'), "str");
  assert.equal(cls("f"), "fn");
});

test("highlightXml and html escaping", () => {
  const src = `<Ui><Frame name="A" /><!-- c --></Ui>`;
  const spans = highlightXml(src);
  assert.equal(spans.map((s) => s.text).join(""), src);
  assert.ok(spans.some((s) => s.cls === "attr" && s.text === "name"));
  assert.ok(spans.some((s) => s.cls === "str" && s.text === '"A"'));
  assert.equal(toHtml([{ cls: "txt", text: "<a&b>" }]), "&lt;a&amp;b&gt;");
});

// ===== [S3] Completion =====
test("completion contexts", async () => {
  const t = await targets();
  let s = 'local f = CreateFrame("Frame")\nf:RegisterEvent("PLAYER_E|';
  let r = completeAt(strip(s), at(s), t.v!);
  assert.deepEqual(r.items.map((i) => i.label), ["PLAYER_ENTERING_WORLD"]);
  assert.equal(strip(s).slice(r.from, at(s)), "PLAYER_E");

  s = "f:Set|";
  r = completeAt(strip(s), at(s), t.v!);
  assert.ok(r.items.some((i) => i.label === "SetPoint" && i.kind === "method"));
  assert.ok(!r.items.some((i) => i.label === "Show"));

  s = 'f:SetScript("OnE|';
  r = completeAt(strip(s), at(s), t.v!);
  assert.ok(r.items.some((i) => i.label === "OnEvent"));

  s = "C_Timer.|";
  r = completeAt(strip(s), at(s), t.c!);
  assert.deepEqual(r.items.map((i) => i.label).sort(), ["After", "NewTicker", "NewTimer"]);
  assert.equal(completeAt(strip(s), at(s), t.v!).items.length, 0);

  s = "string.|";
  assert.ok(completeAt(strip(s), at(s), t.v!).items.some((i) => i.label === "gfind"));
  assert.ok(!completeAt(strip(s), at(s), t.r!).items.some((i) => i.label === "gfind"));
  // ClassicAPI keeps the Lua 5.0 VM: both gfind and gmatch are valid there
  assert.ok(completeAt(strip(s), at(s), t.c!).items.some((i) => i.label === "gfind"));
  assert.ok(completeAt(strip(s), at(s), t.c!).items.some((i) => i.label === "gmatch"));

  s = "local myCounter = 1\nmyC|";
  r = completeAt(strip(s), at(s), t.v!);
  assert.ok(r.items.some((i) => i.label === "myCounter" && i.kind === "variable"));
  s = "Unit|";
  assert.ok(completeAt(strip(s), at(s), t.v!).items.some((i) => i.label === "UnitName" && i.detail === "UnitName(unit)"));
});

test("signature help", async () => {
  const t = await targets();
  let s = "SendChatMessage(\"hi\", |";
  let h = signatureAt(strip(s), at(s), t.v!);
  assert.equal(h?.name, "SendChatMessage");
  assert.equal(h?.activeParam, 1);
  assert.equal(h?.label, "SendChatMessage(msg, [chatType], [language], [channel])");
  s = "SendChatMessage(foo(1,2), |";
  assert.equal(signatureAt(strip(s), at(s), t.v!)?.activeParam, 1);
  s = "unknownFn(|";
  assert.equal(signatureAt(strip(s), at(s), t.v!), undefined);
});

// ===== [S4] Diagnose · diagnostics =====
test("diagnostics: syntax, unknown functions, version traps", async () => {
  const t = await targets();
  let d = checkSource("local x = \nif then end", t.v!);
  assert.equal(d[0]?.code, "LUA_SYNTAX");
  assert.equal(d[0]?.line, 2);

  d = checkSource("local n = #t", t.v!); // 5.0 target: '#' is not valid
  assert.equal(d[0]?.code, "LUA_SYNTAX");
  assert.equal(checkSource("local n = #t", t.c!).length, 0);

  d = checkSource("DoesNotExist(1)\nUnitName('player')\nmyfn() function myfn() end", t.v!);
  assert.deepEqual(d.map((x) => [x.code, x.name, x.line]), [["API_UNKNOWN_FUNCTION", "DoesNotExist", 1]]);

  d = checkSource("for w in string.gmatch('a','a') do end", t.v!);
  assert.equal(d[0]?.code, "API_VERSION_TRAP");
  d = checkSource("for w in string.gfind('a','a') do end", t.r!);
  assert.equal(d[0]?.code, "API_VERSION_TRAP");
  assert.equal(checkSource("for w in string.gfind('a','a') do end", t.c!).length, 0);
  assert.equal(checkSource("local x = math.mod(7,3)", t.v!).length, 0);

  // locals shadow, user tables are quiet, C_Timer only exists with ClassicAPI
  assert.equal(checkSource("local function foo() end foo()\nMyAddon = {} function MyAddon.Run() end MyAddon.Run()", t.v!).length, 0);
  assert.equal(checkSource("C_Timer.After(1, function() end)", t.c!).length, 0);
  // C_ namespaces are reported when the target lacks them (ClassicAPI needed)
  assert.equal(checkSource("C_Timer.After(1, function() end)", t.v!).length, 1);
});
