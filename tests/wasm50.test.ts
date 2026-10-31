/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * ## Author: Lacustat
 *
 * Inhalt · Contents
 *  1. Grundfunktionen · basics
 *  2. Host-Funktionen · host functions
 *  3. Vergleich mit dem Interpreter · comparison with the interpreter
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { InterpRuntime, LuaMulti, createWasm50Factory, fromLua, type Wasm50Runtime } from "../src/index.js";

const factory = createWasm50Factory(async () => readFileSync(path.join(process.cwd(), "runtimes/lua50/lua50.wasm")));
const make = async (): Promise<Wasm50Runtime> => (await factory.create()) as Wasm50Runtime;

// ===== 1. Grundfunktionen · basics =====
test("wasm50: runs Lua 5.0 code, print output and return values", async () => {
  const rt = await make();
  const r = await rt.execute("print('hi', 1+2) return 7, 'x', true, nil");
  assert.equal(r.ok, true);
  assert.deepEqual(r.values.slice(0, 3), [7, "x", true]);
  assert.deepEqual(rt.output, ["hi\t3"]);
});

test("wasm50: errors report chunk and line; 5.1 syntax is rejected", async () => {
  const rt = await make();
  const bad = await rt.execute("local t = nil\nreturn t.x", "=addon.lua");
  assert.equal(bad.ok, false);
  assert.equal(bad.error?.message, "addon.lua:2: attempt to index local `t' (a nil value)");
  assert.equal(bad.error?.line, 2);
  assert.equal((await rt.execute("return #'abc'")).ok, false);
  assert.equal((await rt.execute("return table.getn({1,2,3})")).values[0], 3);
});

test("wasm50: instruction limit stops endless loops", async () => {
  const rt = await make();
  rt.setInstructionLimit(200_000);
  const r = await rt.execute("while true do end");
  assert.equal(r.ok, false);
  assert.match(r.error!.message, /instruction limit/);
  assert.equal((await rt.execute("return 1")).ok, true); // runtime stays usable
});

// ===== 2. Host-Funktionen · host functions =====
test("wasm50: host functions, globals, multiple returns, host errors", async () => {
  const rt = await make();
  rt.registerFunction("Add", (a, b) => (a as number) + (b as number));
  rt.registerFunction("UnitInfo", (u) => new LuaMulti([`name:${u}`, 60, true]));
  rt.registerFunction("Boom", () => { throw new Error("host failed"); });
  rt.setGlobal("answer", 42);
  rt.setGlobal("label", "hello");
  assert.equal((await rt.execute("return Add(2, 3)")).values[0], 5);
  assert.deepEqual((await rt.execute("return UnitInfo('player')")).values, ["name:player", 60, true]);
  assert.deepEqual((await rt.execute("return answer, label")).values, [42, "hello"]);
  const e = await rt.execute("Boom()");
  assert.equal(e.ok, false);
  assert.match(e.error!.message, /host failed/);
  assert.equal((await rt.execute("local ok, err = pcall(Boom) return ok, err")).values[0], false);
  await rt.execute("result = Add(10, 5) * 2");
  assert.equal(rt.getGlobal("result"), 30);
  assert.deepEqual(rt.getGlobal("print") && typeof rt.getGlobal("print"), "object");
});

// ===== 3. Vergleich mit dem Interpreter · comparison with the interpreter =====
test("wasm50 and the interpreter agree on a corpus of Lua 5.0 programs", async () => {
  const programs = [
    "return 1+2*3, 2^10, 7%3, 10/4",
    "return string.format('%5.2f|%d|%s|%x', 3.14159, 42, 'z', 255)",
    "local t = {} for i=1,5 do tinsert(t, i*i) end return getn(t), t[3]",
    "local s = '' for w in string.gfind('a1 b2 c3', '%a%d') do s = s .. w end return s",
    "return string.gsub('hello world', 'o', '0')",
    "return string.find('abc', 'b', 1, true)",
    "local t = {3,1,2} table.sort(t) return t[1], t[2], t[3]",
    "return math.floor(-3.5), math.ceil(3.2), math.max(1,5,3), math.mod(7,3)",
    "local function f(...) return arg.n, arg[1] end return f(4,5,6)",
    "return tostring(1e15), tostring(0.1), tostring(-0), 2^53",
    "return type(nil), type(print), type({}), type('x')",
    "local t = setmetatable({}, {__index=function(t,k) return k..'!' end}) return t.abc",
    "return string.rep('ab', 3), string.sub('hello', 2, -2), string.upper('x'), string.len('abc')",
    "local a = {} a[1.5] = 'x' return a[1.5], a[3/2]",
    "return tonumber('0x10'), tonumber('  12  '), tonumber('1e2'), tonumber('abc')",
    "local co = {} for k,v in pairs({a=1}) do co[k]=v end return co.a",
    "return select == nil, unpack == nil",
  ];
  const diffs: string[] = [];
  for (const p of programs) {
    const w = await (await make()).execute(p);
    const it = new InterpRuntime("5.0");
    const r = it.executeSync(p);
    const mine = r.ok ? r.values.map((v) => fromLua(v as never)) : ["ERR"];
    const theirs = w.ok ? w.values : ["ERR"];
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) diffs.push(`${p}\n  wasm: ${JSON.stringify(theirs)}\n  interp: ${JSON.stringify(mine)}`);
  }
  assert.deepEqual(diffs, []);
});

test("wasm50 and the interpreter agree on the number of results of library functions", async () => {
  const exprs = ["tonumber('abc')", "string.find('a','b')", "next({})", "getmetatable({})", "rawget({},1)", "string.byte('',1)", "string.sub('a',5)", "table.remove({})", "string.gsub('a','b','c')", "type(nil)", "math.min(1)", "string.char()", "rawequal(1,1)", "tostring(nil)", "gcinfo()", "table.getn({})", "loadstring('x=')", "pcall(error)", "unpack({})", "string.format('%s','a')", "string.rep('a',0)", "tinsert({},1)", "table.sort({})", "rawset({},1,2)", "setmetatable({},nil)", "table.concat({})", "assert(1)", "print()", "type(os)", "type(date)"];
  const diffs: string[] = [];
  for (const e of exprs) {
    const prog = `local function c(...) return arg.n end return c(${e})`;
    const w = await (await make()).execute(prog);
    const i = new InterpRuntime("5.0").executeSync(prog);
    const a = w.ok ? w.values[0] : `ERR ${w.error?.message}`;
    const b = i.ok ? i.values[0] : `ERR ${i.error?.message}`;
    if (a !== b) diffs.push(`${e}: wasm=${a} interp=${b}`);
  }
  assert.deepEqual(diffs, []);
});
