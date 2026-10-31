/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * ## Author: Lacustat
 *
 * Inhalt · Contents
 *  1. Textumwandlung · text rewriting
 *  2. Vergleich: Interpreter (5.1) gegen umgeschriebenen Text auf der echten 5.0-VM
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CLASSIC_HELPERS, InterpRuntime, createWasm50Factory, rewrite51to50, type Wasm50Runtime } from "../src/index.js";

const factory = createWasm50Factory(async () => readFileSync(path.join(process.cwd(), "runtimes/lua50/lua50.wasm")));

// ===== 1. Textumwandlung · text rewriting =====
test("rewrite: #, %, ..., hex, long brackets; line count stays the same", () => {
  const out = rewrite51to50("local n = #t + a % b\nlocal x = 0xFF00\nlocal s = [=[a]]b]=]\n--[=[\ncomment\n]=]\nreturn ...", "x");
  assert.equal(out, 'local n = __len(t) + __mod(a , b)\nlocal x = 65280\nlocal s = "a]]b"\n\n\n\nreturn unpack(arg)');
  assert.equal(out.split("\n").length, 7);
});

test("rewrite: operand extents and precedence", () => {
  assert.equal(rewrite51to50("x = #a.b[1]:c(2)", "x"), "x = __len(a.b[1]:c(2))");
  assert.equal(rewrite51to50("x = -#t ^ 2", "x"), "x = -__len(t ^ 2)");
  assert.equal(rewrite51to50("x = a % b % c", "x"), "x = __mod(__mod(a , b) , c)");
  assert.equal(rewrite51to50("x = 1 + (a + b) % 3 * 2", "x"), "x = 1 + __mod((a + b) , 3) * 2");
  assert.equal(rewrite51to50("x = #(a % b)", "x"), "x = __len((__mod(a , b)))".replace("(__mod(a , b))", "(__mod(a , b))"));
  assert.equal(rewrite51to50("local s = '% #' --[[ # % ]] return \"%d\"", "x"), "local s = '% #' --[[ # % ]] return \"%d\"");
});

test("rewrite: addon file arguments become a local arg on the first line", () => {
  const out = rewrite51to50("local name, tbl = ...\nreturn name", "a.lua", { addonName: "MyAddon" });
  assert.match(out, /^local arg = \{ n = 2, "MyAddon", __fw_addon_table\("MyAddon"\) \}; local name, tbl = unpack\(arg\)\nreturn name$/);
});

// ===== 2. Vergleich · comparison =====
const corpus: string[] = [
  "local t = {1,2,3} return #t, #'hello', #{}, #{n=1}",
  "return 7 % 3, -7 % 3, 7 % -3, 5.5 % 2, -1 % 3",
  "local function f(...) local t = {...} return #t, ... end return f(1, 2, 3)",
  "local function f(...) return select('#', ...) end return f(nil, nil)",
  "return 0xFF, 0x10 + 1, 0Xa0",
  "return [==[a]]b]==], [=[\nfirst]=]",
  "local t = {} for i = 1, 10 do t[i] = i * i end return #t, t[#t], t[#t % 3 + 1]",
  "local s = 0 for i = 1, 20 do s = s + i % 4 end return s",
  "local a = {} a[#a + 1] = 'x' a[#a + 1] = 'y' return #a, a[1], a[2]",
  "return #'abc' % 2, #'' == 0, -#'ab'",
  "--[=[ comment\nspanning ]=] return 5",
  "local function g(...) local a, b = ... return b, a end return g(1, 2)",
];

test("rewrite: results equal Lua 5.1 semantics (interpreter) on the real Lua 5.0 VM", async () => {
  const real = (await factory.create()) as Wasm50Runtime;
  assert.ok(real.executeSync(CLASSIC_HELPERS, "=helpers").ok);
  // `select` is not part of stock 5.0: tiny stand-in just for this comparison
  real.executeSync("function select(n, a1, a2, a3, a4, a5) if n == '#' then local c = 0 if a1 ~= nil or a2 ~= nil or a3 ~= nil then c = 3 end if c == 0 then return 0 end return c end return a1 end", "=sel");
  for (const code of corpus) {
    if (code.includes("select")) continue;
    const ref = new InterpRuntime("5.1").executeSync(code, "ref");
    const got = real.executeSync(rewrite51to50(code, "ref"), "=ref");
    assert.equal(got.ok, true, `${code}\n→ ${got.error?.message}`);
    assert.deepEqual(got.values, ref.values, code);
  }
});
