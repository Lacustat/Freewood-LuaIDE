/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Helfer · helpers
 *  [S2] Sprache · language
 *  [S3] Bibliothek · library
 *  [S4] 5.0 vs 5.1
 *  [S5] Fehler · errors
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { InterpRuntime, fromLua } from "../src/index.js";

// ===== [S1] Helfer · helpers =====
function run(src: string, v: "5.0" | "5.1" = "5.1"): { out: string[]; ok: boolean; err?: string; values: unknown[] } {
  const rt = new InterpRuntime(v);
  const r = rt.executeSync(src);
  return { out: rt.output, ok: r.ok, err: r.error?.message, values: r.values.map((x) => fromLua(x as never)) };
}
function out(src: string, v: "5.0" | "5.1" = "5.1"): string {
  const r = run(src, v);
  assert.ok(r.ok, String(r.err));
  return r.out.join("\n");
}

// ===== [S2] Sprache · language =====
test("arithmetic, precedence, concat", () => {
  assert.equal(out("print(1+2*3, 2^3^2, -2^2, 7%3, 'a'..'b'..1)"), "7\t512\t-4\t1\tab1");
  assert.equal(out("print(10/4, 1e3, 0x10, 5 % -3, -5 % 3)"), "2.5\t1000\t16\t-1\t1");
});

test("closures capture per-iteration locals", () => {
  assert.equal(out("local t={} for i=1,3 do t[i]=function() return i end end print(t[1](),t[2](),t[3]())"), "1\t2\t3");
  assert.equal(out("local function c() local n=0 return function() n=n+1 return n end end local f=c() f() print(f())"), "2");
});

test("varargs, multiple returns, select", () => {
  assert.equal(out("local function f(...) return select('#',...), ... end print(f(1,nil,3))"), "3\t1\tnil\t3");
  assert.equal(out("local function g() return 1,2,3 end local a,b,c,d=g() print(a,b,c,d) print((g()))"), "1\t2\t3\tnil\n1");
  assert.equal(out("local t={g=function() return 1,2 end} print(#{t.g(),t.g()})"), "3");
});

test("control flow: while, repeat, break, nested if", () => {
  assert.equal(out("local i=0 while true do i=i+1 if i>=5 then break end end print(i)"), "5");
  assert.equal(out("local n=0 repeat local k=n n=n+1 until k>=2 print(n)"), "3");
  assert.equal(out("for i=10,1,-3 do io=(io or '')..i..',' end print(io)"), "10,7,4,1,");
});

test("metatables and OOP", () => {
  const src = `
    local A = {} A.__index = A
    function A.new(x) return setmetatable({x=x}, A) end
    function A:get() return self.x end
    local B = setmetatable({}, {__index = A}) B.__index = B
    function B.new(x) local o = A.new(x) return setmetatable(o, B) end
    function B:twice() return self:get()*2 end
    print(B.new(21):twice())
    local v = setmetatable({}, {__add=function(a,b) return 42 end, __tostring=function() return "V" end, __call=function(s, a) return a+1 end})
    print(v+1, tostring(v), v(1))
    local ro = setmetatable({}, {__newindex=function(t,k,v) rawset(t,k,v*2) end}) ro.a=4 print(ro.a)
  `;
  assert.equal(out(src), "42\n42\tV\t2\n8");
});

test("pcall / error with values and positions", () => {
  assert.equal(out("print(pcall(error, {code=1}))").startsWith("false\ttable"), true);
  assert.equal(out("local ok,e=pcall(function() error('boom') end) print(ok,e)"), "false\tchunk:1: boom");
  assert.equal(out("local ok,e=pcall(function() error('boom',0) end) print(e)"), "boom");
  assert.equal(out("print(select(2, pcall(function() local x=nil; return x.y end)))"), "chunk:1: attempt to index a nil value (local 'x')");
  assert.equal(out("print(select(2, pcall(function() foo() end)))"), "chunk:1: attempt to call a nil value (global 'foo')");
  assert.equal(out("print(select(2, pcall(function() return 1+{} end)))"), "chunk:1: attempt to perform arithmetic on a table value");
});

test("endless loop and recursion are stopped", () => {
  const r = run("while true do end");
  assert.equal(r.ok, false);
  assert.match(r.err!, /instruction limit/);
  const r2 = run("local function f() return f() + 1 end f()");
  assert.equal(r2.ok, false);
  assert.match(r2.err!, /stack overflow/);
});

// ===== [S3] Bibliothek · library =====
test("string patterns", () => {
  assert.equal(out("print(string.find('hello world','o w'))"), "5\t7");
  assert.equal(out("print(string.find('hello','l+'))"), "3\t4");
  assert.equal(out("print(string.match('key=value','(%w+)=(%w+)'))"), "key\tvalue");
  assert.equal(out("print(string.match('  trim  ','^%s*(.-)%s*$'))"), "trim");
  assert.equal(out("print(('abc'):upper(), ('x'):rep(3), ('hello'):sub(2,-2))"), "ABC\txxx\tell");
  assert.equal(out("print(string.gsub('hello world','o','0'))"), "hell0 w0rld\t2");
  assert.equal(out("print(string.gsub('abc','%w','%0%0'))"), "aabbcc\t3");
  assert.equal(out("print(string.gsub('$name is $age','%$(%w+)',{name='Bob',age=3}))"), "Bob is 3\t2");
  assert.equal(out("print(string.gsub('abc','b',function(c) return c:upper() end))"), "aBc\t1");
  assert.equal(out("print(string.match('f(a(b)c)d','%b()'))"), "(a(b)c)");
  assert.equal(out("print(string.find('abc','b',1,true))"), "2\t2");
  assert.equal(out("print(string.match('2026-10-31','(%d+)-(%d+)-(%d+)'))"), "2026\t10\t31");
  assert.equal(out("local t={} for k,v in string.gmatch('a=1, b=2','(%w+)=(%w+)') do t[#t+1]=k..v end print(table.concat(t,';'))"), "a1;b2");
});

test("string.format", () => {
  assert.equal(out("print(string.format('%d %5.2f %s %x %05d %-4s| %q', 42, 3.14159, 'hi', 255, 42, 'ab', 'a\"b'))"), '42  3.14 hi ff 00042 ab  | "a\\"b"');
  assert.equal(out("print(string.format('%g %g %g', 1, 0.5, 1e20))"), "1 0.5 1e+20");
  assert.equal(out("print(string.format('%3d|%-3d|%%', 5, 5))"), "  5|5  |%");
});

test("table library", () => {
  assert.equal(out("local t={3,1,2} table.sort(t) print(table.concat(t,','))"), "1,2,3");
  assert.equal(out("local t={3,1,2} table.sort(t,function(a,b) return a>b end) print(table.concat(t,','))"), "3,2,1");
  assert.equal(out("local t={} table.insert(t,'a') table.insert(t,1,'b') print(table.concat(t,','), table.remove(t,1), #t)"), "b,a\tb\t1");
  assert.equal(out("print(unpack({1,2,3}))"), "1\t2\t3");
  assert.equal(out("local t={a=1} local n=0 for k,v in pairs({1,2,x=3}) do n=n+1 end print(n)"), "3");
  assert.equal(out("for i,v in ipairs({'a','b',nil,'d'}) do io=(io or '')..v end print(io)"), "ab");
});

test("math library", () => {
  assert.equal(out("print(math.floor(-1.5), math.ceil(1.2), math.max(1,5,3), math.min(2,0), math.abs(-3), math.sqrt(16))"), "-2\t2\t5\t0\t3\t4");
  assert.equal(out("print(tonumber('0x1f'), tonumber('10',2), tonumber('abc'), tonumber(' 5 '))"), "31\t2\tnil\t5");
  assert.equal(out("math.randomseed(1) local a=math.random(1,6) print(a>=1 and a<=6)"), "true");
});

// ===== [S4] 5.0 vs 5.1 =====
test("Lua 5.0: no #, no %, arg table, gfind, getn, math.mod", () => {
  assert.equal(run("print(#'abc')", "5.0").ok, false);
  assert.equal(run("print(5 % 2)", "5.0").ok, false);
  assert.equal(out("local function f(...) return arg.n, arg[1] end print(f(7,8))", "5.0"), "2\t7");
  assert.equal(out("local n=0 for w in string.gfind('a b c','%a') do n=n+1 end print(n, table.getn({1,2}), math.mod(7,3))", "5.0"), "3\t2\t1");
  assert.equal(run("print(select('#',1))", "5.0").ok, false);
  assert.equal(run("local x = string.gmatch", "5.0").values.length, 0);
});

test("Lua 5.1: # and %, select, gmatch; no gfind or math.mod", () => {
  assert.equal(out("print(#'abc', 5%2, select('#',1,2))"), "3\t1\t2");
  assert.equal(out("print(string.gfind, math.mod, table.setn)"), "nil\tnil\tnil");
  assert.equal(out("print(#{1,2,3}, [==[a]]b]==])"), '3\ta]]b');
});

// ===== [S5] Fehler · errors =====
test("syntax errors carry chunk and line", () => {
  const r = run("local x = \nif then end");
  assert.equal(r.ok, false);
  assert.match(r.err!, /^chunk:2:/);
  const r2 = run("x = = 1");
  assert.match(r2.err!, /unexpected symbol/);
  assert.match(run("for i=1 do end").err!, /expected/);
});

test("runtime registerFunction bridge", () => {
  const rt = new InterpRuntime("5.1");
  rt.registerFunction("GetTime", () => 12.5);
  rt.registerFunction("C_Test.Add", (a, b) => (a as number) + (b as number));
  const r = rt.executeSync("return GetTime(), C_Test.Add(2,3)");
  assert.deepEqual(r.values, [12.5, 5]);
});
