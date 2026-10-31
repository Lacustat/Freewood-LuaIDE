/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Helfer · helpers
 *   [S2] Basis-Bibliothek · base library
 *   [S3] string
 *   [S4] table
 *   [S5] math
 *   [S6] os
 *   [S7] installStdlib
 *
 * DE: Standardbibliothek für Lua 5.0/5.1. Version-abhängig: 5.0 hat gfind, getn, math.mod,
 *     table.setn/foreach; 5.1 hat gmatch, select, unpack in table-Form usw.
 * EN: standard library for Lua 5.0/5.1. Version dependent: 5.0 has gfind, getn, math.mod,
 *     table.setn/foreach; 5.1 has gmatch, select, etc.
 */

import type { Interpreter } from "./interp.js";
import { MatchState, SPECIALS } from "./pattern.js";
import { LuaError, LuaFunction, LuaTable, fmtNumber, luaType, nativeFn, tonum, tostr, type LuaValue } from "./value.js";

// ===== [S1] Helfer · helpers =====

type Args = LuaValue[];

function argErr(fname: string, n: number, msg: string): LuaError {
  return new LuaError(`bad argument #${n} to '${fname}' (${msg})`);
}
function checkTable(f: string, a: Args, n: number): LuaTable {
  const v = a[n - 1];
  if (!(v instanceof LuaTable)) throw argErr(f, n, `table expected, got ${a.length < n ? "no value" : luaType(v)}`);
  return v;
}
function checkNum(f: string, a: Args, n: number, def?: number): number {
  const v = a[n - 1];
  if (v === undefined && def !== undefined) return def;
  const x = tonum(v);
  if (x === undefined) throw argErr(f, n, `number expected, got ${a.length < n ? "no value" : luaType(v)}`);
  return x;
}
function checkInt(f: string, a: Args, n: number, def?: number): number {
  const x = checkNum(f, a, n, def);
  return x < 0 ? Math.ceil(x) : Math.floor(x);
}
function checkStr(f: string, a: Args, n: number, def?: string): string {
  const v = a[n - 1];
  if (v === undefined && def !== undefined) return def;
  if (typeof v === "string") return v;
  if (typeof v === "number") return fmtNumber(v);
  throw argErr(f, n, `string expected, got ${a.length < n ? "no value" : luaType(v)}`);
}
function checkFn(f: string, a: Args, n: number): LuaFunction {
  const v = a[n - 1];
  if (!(v instanceof LuaFunction)) throw argErr(f, n, `function expected, got ${a.length < n ? "no value" : luaType(v)}`);
  return v;
}

function reg(t: LuaTable, name: string, impl: (a: Args) => LuaValue[] | LuaValue | void): void {
  t.set(name, nativeFn(name, impl));
}

// ===== [S2] Basis-Bibliothek · base library =====

function installBase(it: Interpreter, out: (s: string) => void): void {
  const G = it.globals;
  G.set("_G", G);
  G.set("_VERSION", it.version === "5.0" ? "Lua 5.0" : "Lua 5.1");
  reg(G, "print", (a) => out(a.map(tostr).join("\t")));
  reg(G, "type", (a) => {
    if (a.length === 0) throw argErr("type", 1, "value expected");
    return luaType(a[0]);
  });
  reg(G, "tostring", (a) => {
    if (a.length === 0) throw argErr("tostring", 1, "value expected");
    const mm = it.metamethod(a[0], "__tostring");
    if (mm !== undefined) return it.call(mm, [a[0]])[0];
    return tostr(a[0]);
  });
  reg(G, "tonumber", (a) => {
    const base = a[1] === undefined ? 10 : checkInt("tonumber", a, 2);
    if (base === 10) return tonum(a[0]);
    const s = checkStr("tonumber", a, 1).trim().toLowerCase();
    if (!/^[0-9a-z]+$/.test(s)) return undefined;
    let n = 0;
    for (const ch of s) {
      const d = ch >= "a" ? ch.charCodeAt(0) - 87 : ch.charCodeAt(0) - 48;
      if (d >= base) return undefined;
      n = n * base + d;
    }
    return n;
  });
  reg(G, "ipairs", (a) => {
    const t = checkTable("ipairs", a, 1);
    const iter = nativeFn("ipairs_iter", (b) => {
      const i = (b[1] as number) + 1;
      const v = it.index(t, i);
      return v === undefined ? [undefined] : [i, v];
    });
    return [iter, t, 0];
  });
  const nextFn = nativeFn("next", (a) => {
    const t = checkTable("next", a, 1);
    const r = t.next(a[1]);
    return r ? [r[0], r[1]] : [undefined];
  });
  G.set("next", nextFn);
  reg(G, "pairs", (a) => {
    const t = checkTable("pairs", a, 1);
    const mm = it.metamethod(t, "__pairs");
    if (mm !== undefined && it.version === "5.1") return it.call(mm, [t]).slice(0, 3);
    return [nextFn, t, undefined];
  });
  reg(G, "rawget", (a) => checkTable("rawget", a, 1).get(a[1]));
  reg(G, "rawset", (a) => {
    checkTable("rawset", a, 1).set(a[1], a[2]);
    return a[0];
  });
  reg(G, "rawequal", (a) => a[0] === a[1]);
  reg(G, "setmetatable", (a) => {
    const t = checkTable("setmetatable", a, 1);
    if (a[1] !== undefined && !(a[1] instanceof LuaTable)) throw argErr("setmetatable", 2, "nil or table expected");
    if (t.meta?.get("__metatable") !== undefined) throw new LuaError("cannot change a protected metatable");
    t.meta = a[1] as LuaTable | undefined;
    return t;
  });
  reg(G, "getmetatable", (a) => {
    const m = it.metatable(a[0]);
    const prot = m?.get("__metatable");
    return prot !== undefined ? prot : m;
  });
  reg(G, "assert", (a) => {
    if (a[0] === undefined || a[0] === false) {
      const msg = a.length > 1 ? a[1] : "assertion failed!";
      const err = new LuaError(msg);
      err.raw = true;
      throw err;
    }
    return a;
  });
  reg(G, "error", (a) => {
    const level = a[1] === undefined ? 1 : checkInt("error", a, 2);
    const v = a[0];
    if (typeof v === "string" && level > 0) {
      const line = level === 1 ? it.line : it.callLines[it.callLines.length - (level - 1)];
      if (line !== undefined && line > 0) throw new LuaError(`${it.chunk}:${line}: ${v}`, line, it.chunk);
    }
    const err = new LuaError(v);
    err.raw = true;
    throw err;
  });
  const protect = (fn: LuaValue, args: Args, handler?: LuaValue): LuaValue[] => {
    const savedDepth = it.depth;
    const savedLines = it.callLines.length;
    const savedChunk = it.chunk;
    try {
      return [true, ...it.call(fn, args)];
    } catch (e) {
      it.depth = savedDepth;
      it.callLines.length = savedLines;
      it.chunk = savedChunk;
      let value: LuaValue;
      if (e instanceof LuaError) value = e.value;
      else if (e instanceof RangeError) value = "stack overflow";
      else if (e instanceof Error) value = e.message;
      else throw e;
      if (handler !== undefined) return [false, ...it.call(handler, [value])];
      return [false, value];
    }
  };
  reg(G, "pcall", (a) => protect(a[0], a.slice(1)));
  reg(G, "xpcall", (a) => protect(a[0], it.version === "5.0" ? [] : a.slice(2), a[1]));
  reg(G, "unpack", (a) => {
    const t = checkTable("unpack", a, 1);
    const i = checkInt("unpack", a, 2, 1);
    const j = a[2] === undefined ? t.length() : checkInt("unpack", a, 3);
    const r: LuaValue[] = [];
    for (let k = i; k <= j; k++) r.push(t.get(k));
    return r;
  });
  if (it.version === "5.1") {
    reg(G, "select", (a) => {
      if (a[0] === "#") return a.length - 1;
      const n = checkInt("select", a, 1);
      if (n < 0) {
        const idx = a.length - 1 + n;
        if (idx < 0) throw argErr("select", 1, "index out of range");
        return a.slice(idx + 1);
      }
      if (n === 0) throw argErr("select", 1, "index out of range");
      return a.slice(n);
    });
  }
  reg(G, "collectgarbage", (a) => (a[0] === "count" ? 100 : 0));
  reg(G, "loadstring", (a) => {
    const src = checkStr("loadstring", a, 1);
    const name = typeof a[1] === "string" ? a[1] : src;
    try {
      return it.load(src, `[string "${name.split("\n")[0]!.slice(0, 40)}"]`);
    } catch (e) {
      return [undefined, (e as Error).message];
    }
  });
  reg(G, "dofile", () => {
    throw new LuaError("dofile is not available in the simulation");
  });
  reg(G, "getfenv", () => G);
  reg(G, "setfenv", (a) => a[0]);
}

// ===== [S3] string =====

function strIndex(i: number, len: number): number {
  if (i < 0) return Math.max(len + i + 1, 0);
  return i;
}

function formatString(it: Interpreter, a: Args): string {
  const fmt = checkStr("format", a, 1);
  let argi = 1;
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i]!;
    if (c !== "%") {
      out += c;
      continue;
    }
    i++;
    if (fmt[i] === "%") {
      out += "%";
      continue;
    }
    const m = /^([-+ #0]*)(\d*)(?:\.(\d*))?([a-zA-Z])/.exec(fmt.slice(i));
    if (!m) throw new LuaError("invalid option '%" + (fmt[i] ?? "") + "' to 'format'");
    i += m[0].length - 1;
    const flags = m[1]!;
    const width = m[2] ? Number(m[2]) : 0;
    const prec = m[3] !== undefined ? Number(m[3] || "0") : undefined;
    const conv = m[4]!;
    argi++;
    const arg = a[argi - 1];
    let s: string;
    const num = (): number => {
      const x = tonum(arg);
      if (x === undefined) throw argErr("format", argi, `number expected, got ${a.length < argi ? "no value" : luaType(arg)}`);
      return x;
    };
    switch (conv) {
      case "d":
      case "i": {
        const x = num();
        const n = x < 0 ? Math.ceil(x) : Math.floor(x);
        s = String(Math.abs(n));
        if (prec !== undefined) s = s.padStart(prec, "0");
        s = (n < 0 ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "") + s;
        break;
      }
      case "u": s = String(Math.abs(Math.floor(num()))); break;
      case "c": s = String.fromCharCode(num()); break;
      case "x": s = (Math.floor(num()) >>> 0).toString(16); if (flags.includes("#")) s = "0x" + s; break;
      case "X": s = (Math.floor(num()) >>> 0).toString(16).toUpperCase(); if (flags.includes("#")) s = "0X" + s; break;
      case "o": s = (Math.floor(num()) >>> 0).toString(8); break;
      case "e":
      case "E": {
        s = num().toExponential(prec ?? 6).replace(/e([+-])(\d)$/, "e$10$2");
        if (conv === "E") s = s.toUpperCase();
        if (flags.includes("+") && !s.startsWith("-")) s = "+" + s;
        break;
      }
      case "f": {
        const x = num();
        s = Number.isFinite(x) ? x.toFixed(prec ?? 6) : x === Infinity ? "inf" : x === -Infinity ? "-inf" : "nan";
        if (flags.includes("+") && x >= 0) s = "+" + s;
        else if (flags.includes(" ") && x >= 0) s = " " + s;
        break;
      }
      case "g":
      case "G": {
        const x = num();
        const p = prec === undefined ? 6 : prec === 0 ? 1 : prec;
        if (x === 0) s = "0";
        else {
          const exp = Math.floor(Math.log10(Math.abs(x)));
          if (exp < -4 || exp >= p) {
            s = x.toExponential(p - 1).replace(/\.?0+e/, "e").replace(/e([+-])(\d)$/, "e$10$2");
          } else s = String(Number(x.toPrecision(p)));
        }
        if (conv === "G") s = s.toUpperCase();
        break;
      }
      case "q": s = '"' + tostr(arg).replace(/[\\"\n\r\0]/g, (ch) => (ch === "\n" ? "\\\n" : ch === "\r" ? "\\r" : ch === "\0" ? "\\000" : "\\" + ch)) + '"'; break;
      case "s": {
        const mm = it.metamethod(arg, "__tostring");
        s = mm !== undefined ? tostr(it.call(mm, [arg])[0]) : tostr(a.length < argi ? (() => { throw argErr("format", argi, "string expected, got no value"); })() : arg);
        if (prec !== undefined) s = s.slice(0, prec);
        break;
      }
      default: throw new LuaError("invalid option '%" + conv + "' to 'format'");
    }
    if (s.length < width) {
      if (flags.includes("-")) s = s.padEnd(width);
      else if (flags.includes("0") && "dieEfgGxXou".includes(conv)) {
        const sign = /^[+-]/.test(s) ? s[0]! : "";
        s = sign + s.slice(sign.length).padStart(width - sign.length, "0");
      } else s = s.padStart(width);
    }
    out += s;
  }
  return out;
}

function installString(it: Interpreter): LuaTable {
  const S = new LuaTable();
  reg(S, "len", (a) => checkStr("len", a, 1).length);
  reg(S, "sub", (a) => {
    const s = checkStr("sub", a, 1);
    let i = strIndex(checkInt("sub", a, 2, 1), s.length);
    let j = strIndex(checkInt("sub", a, 3, -1), s.length);
    if (i < 1) i = 1;
    if (j > s.length) j = s.length;
    return i > j ? "" : s.slice(i - 1, j);
  });
  reg(S, "upper", (a) => checkStr("upper", a, 1).toUpperCase());
  reg(S, "lower", (a) => checkStr("lower", a, 1).toLowerCase());
  reg(S, "rep", (a) => {
    const str = checkStr("rep", a, 1);
    const n = checkInt("rep", a, 2);
    return n > 0 ? str.repeat(n) : "";
  });
  reg(S, "reverse", (a) => [...checkStr("reverse", a, 1)].reverse().join(""));
  reg(S, "byte", (a) => {
    const s = checkStr("byte", a, 1);
    const i = strIndex(checkInt("byte", a, 2, 1), s.length);
    const j = a[2] === undefined ? i : strIndex(checkInt("byte", a, 3), s.length);
    const r: LuaValue[] = [];
    for (let k = Math.max(i, 1); k <= Math.min(j, s.length); k++) r.push(s.charCodeAt(k - 1));
    return r;
  });
  reg(S, "char", (a) => a.map((_, k) => String.fromCharCode(checkInt("char", a, k + 1))).join(""));
  reg(S, "format", (a) => formatString(it, a));

  const doFind = (fname: string, a: Args, find: boolean): LuaValue[] => {
    const s = checkStr(fname, a, 1);
    const p = checkStr(fname, a, 2);
    let init = strIndex(checkInt(fname, a, 3, 1), s.length) - 1;
    if (init < 0) init = 0;
    if (init > s.length) return [undefined];
    if (find && (it.truthy(a[3]) || !SPECIALS.test(p))) {
      const idx = s.indexOf(p, init);
      return idx < 0 ? [undefined] : [idx + 1, idx + p.length];
    }
    const anchor = p[0] === "^";
    const ms = new MatchState(s, p);
    let si = init;
    do {
      ms.reset();
      const e = ms.match(si, anchor ? 1 : 0);
      if (e !== -1) {
        if (find) return [si + 1, e, ...ms.captures(si, e, false)];
        return ms.captures(si, e, true);
      }
      si++;
    } while (si <= s.length && !anchor);
    return [undefined];
  };
  reg(S, "find", (a) => doFind("find", a, true));
  reg(S, "match", (a) => doFind("match", a, false));

  const gmatch = (a: Args, name: string): LuaValue => {
    const s = checkStr(name, a, 1);
    const p = checkStr(name, a, 2);
    let pos = 0;
    return nativeFn("gmatch_iter", () => {
      const ms = new MatchState(s, p);
      for (let si = pos; si <= s.length; si++) {
        ms.reset();
        const e = ms.match(si, 0);
        if (e !== -1) {
          pos = e === si ? e + 1 : e;
          return ms.captures(si, e, true);
        }
      }
      pos = s.length + 1;
      return [undefined];
    });
  };
  if (it.version === "5.0") reg(S, "gfind", (a) => gmatch(a, "gfind"));
  else reg(S, "gmatch", (a) => gmatch(a, "gmatch"));

  reg(S, "gsub", (a) => {
    const s = checkStr("gsub", a, 1);
    const p = checkStr("gsub", a, 2);
    const repl = a[2];
    if (!(typeof repl === "string" || typeof repl === "number" || repl instanceof LuaTable || repl instanceof LuaFunction)) {
      throw argErr("gsub", 3, "string/function/table expected");
    }
    const maxN = a[3] === undefined ? Infinity : checkInt("gsub", a, 4);
    const anchor = p[0] === "^";
    const ms = new MatchState(s, p);
    let si = 0;
    let n = 0;
    let out = "";
    while (n < maxN) {
      ms.reset();
      const e = ms.match(si, anchor ? 1 : 0);
      if (e !== -1) {
        n++;
        const whole = s.slice(si, e);
        let value: LuaValue;
        if (typeof repl === "string" || typeof repl === "number") {
          const r = tostr(repl);
          value = r.replace(/%(.)/g, (_m, ch: string) => {
            if (ch === "%") return "%";
            if (ch >= "0" && ch <= "9") return ch === "0" ? whole : tostr(ms.getCapture(Number(ch) - 1, si, e));
            throw new LuaError("invalid use of '%' in replacement string");
          });
        } else if (repl instanceof LuaTable) {
          value = it.index(repl, ms.getCapture(0, si, e));
        } else {
          value = it.call(repl, ms.captures(si, e, true))[0];
        }
        if (value === undefined || value === false) out += whole;
        else if (typeof value === "string" || typeof value === "number") out += tostr(value);
        else throw new LuaError("invalid replacement value (a " + luaType(value) + ")");
      }
      if (e !== -1 && e > si) si = e;
      else if (si < s.length) out += s[si++];
      else break;
      if (anchor) break;
    }
    if (si < s.length) out += s.slice(si);
    return [out, n];
  });
  return S;
}

// ===== [S4] table =====

function installTable(it: Interpreter): LuaTable {
  const T = new LuaTable();
  reg(T, "insert", (a) => {
    const t = checkTable("insert", a, 1);
    const n = t.length();
    if (a.length === 2) t.set(n + 1, a[1]);
    else if (a.length === 3) {
      const pos = checkInt("insert", a, 2);
      for (let i = n; i >= pos; i--) t.set(i + 1, t.get(i));
      t.set(pos, a[2]);
    } else throw new LuaError("wrong number of arguments to 'insert'");
  });
  reg(T, "remove", (a) => {
    const t = checkTable("remove", a, 1);
    const n = t.length();
    const pos = a[1] === undefined ? n : checkInt("remove", a, 2);
    if (n === 0) return undefined;
    const v = t.get(pos);
    for (let i = pos; i < n; i++) t.set(i, t.get(i + 1));
    if (pos <= n) t.set(n, undefined);
    return v;
  });
  reg(T, "concat", (a) => {
    const t = checkTable("concat", a, 1);
    const sep = checkStr("concat", a, 2, "");
    const i = checkInt("concat", a, 3, 1);
    const j = a[3] === undefined ? t.length() : checkInt("concat", a, 4);
    const parts: string[] = [];
    for (let k = i; k <= j; k++) {
      const v = t.get(k);
      if (typeof v !== "string" && typeof v !== "number") throw new LuaError(`invalid value (at index ${k}) in table for 'concat'`);
      parts.push(tostr(v));
    }
    return parts.join(sep);
  });
  reg(T, "getn", (a) => {
    const t = checkTable("getn", a, 1);
    const n = t.get("n");
    return typeof n === "number" && it.version === "5.0" ? n : t.length();
  });
  reg(T, "maxn", (a) => {
    const t = checkTable("maxn", a, 1);
    let m = t.length();
    for (const k of t.hash.keys()) if (typeof k === "number" && k > m) m = k;
    return m;
  });
  reg(T, "sort", (a) => {
    const t = checkTable("sort", a, 1);
    const cmp = a[1];
    const n = t.length();
    const items: LuaValue[] = [];
    for (let i = 1; i <= n; i++) items.push(t.get(i));
    const lt = (x: LuaValue, y: LuaValue): boolean => (cmp === undefined ? it.lessThan(x, y, it.line) : it.truthy(it.call(cmp, [x, y])[0]));
    items.sort((x, y) => (lt(x, y) ? -1 : lt(y, x) ? 1 : 0));
    items.forEach((v, i) => t.set(i + 1, v));
  });
  if (it.version === "5.0") {
    reg(T, "setn", (a) => {
      checkTable("setn", a, 1).set("n", checkNum("setn", a, 2));
    });
    reg(T, "foreach", (a) => {
      const t = checkTable("foreach", a, 1);
      const f = checkFn("foreach", a, 2);
      for (const k of [...t.arr.keys()].map((i) => i + 1)) {
        const r = it.call(f, [k, t.get(k)])[0];
        if (r !== undefined) return r;
      }
      for (const [k, v] of [...t.hash]) {
        const r = it.call(f, [k, v])[0];
        if (r !== undefined) return r;
      }
    });
    reg(T, "foreachi", (a) => {
      const t = checkTable("foreachi", a, 1);
      const f = checkFn("foreachi", a, 2);
      for (let i = 1; i <= t.length(); i++) {
        const r = it.call(f, [i, t.get(i)])[0];
        if (r !== undefined) return r;
      }
    });
  }
  return T;
}

// ===== [S5] math =====

function installMath(it: Interpreter): LuaTable {
  const M = new LuaTable();
  M.set("pi", Math.PI);
  M.set("huge", Infinity);
  const one: [string, (x: number) => number][] = [
    ["abs", Math.abs], ["ceil", Math.ceil], ["floor", Math.floor], ["sqrt", Math.sqrt], ["sin", Math.sin],
    ["cos", Math.cos], ["tan", Math.tan], ["asin", Math.asin], ["acos", Math.acos], ["atan", Math.atan],
    ["exp", Math.exp], ["deg", (x) => (x * 180) / Math.PI], ["rad", (x) => (x * Math.PI) / 180],
    ["log10", Math.log10], ["sinh", Math.sinh], ["cosh", Math.cosh], ["tanh", Math.tanh],
  ];
  for (const [name, fn] of one) reg(M, name, (a) => fn(checkNum(name, a, 1)));
  reg(M, "log", (a) => Math.log(checkNum("log", a, 1)));
  reg(M, "atan2", (a) => Math.atan2(checkNum("atan2", a, 1), checkNum("atan2", a, 2)));
  reg(M, "pow", (a) => Math.pow(checkNum("pow", a, 1), checkNum("pow", a, 2)));
  reg(M, "fmod", (a) => checkNum("fmod", a, 1) % checkNum("fmod", a, 2));
  if (it.version === "5.0") reg(M, "mod", (a) => checkNum("mod", a, 1) % checkNum("mod", a, 2));
  reg(M, "modf", (a) => {
    const x = checkNum("modf", a, 1);
    const i = x < 0 ? Math.ceil(x) : Math.floor(x);
    return [i, x - i];
  });
  reg(M, "frexp", (a) => {
    const x = checkNum("frexp", a, 1);
    if (x === 0 || !Number.isFinite(x)) return [x, 0];
    const e = Math.max(-1023, Math.floor(Math.log2(Math.abs(x))) + 1);
    return [x * Math.pow(2, -e), e];
  });
  reg(M, "ldexp", (a) => checkNum("ldexp", a, 1) * Math.pow(2, checkNum("ldexp", a, 2)));
  reg(M, "max", (a) => {
    let m = checkNum("max", a, 1);
    for (let i = 2; i <= a.length; i++) m = Math.max(m, checkNum("max", a, i));
    return m;
  });
  reg(M, "min", (a) => {
    let m = checkNum("min", a, 1);
    for (let i = 2; i <= a.length; i++) m = Math.min(m, checkNum("min", a, i));
    return m;
  });
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
  reg(M, "randomseed", (a) => {
    seed = checkInt("randomseed", a, 1) & 0x7fffffff;
  });
  reg(M, "random", (a) => {
    if (a.length === 0) return rnd();
    const lo = a.length === 1 ? 1 : checkInt("random", a, 1);
    const hi = a.length === 1 ? checkInt("random", a, 1) : checkInt("random", a, 2);
    if (lo > hi) throw argErr("random", a.length === 1 ? 1 : 2, "interval is empty");
    return lo + Math.floor(rnd() * (hi - lo + 1));
  });
  return M;
}

// ===== [S6] os =====

function installOs(now: () => number): LuaTable {
  const O = new LuaTable();
  reg(O, "time", (a) => {
    const t = a[0];
    if (t instanceof LuaTable) {
      const g = (k: string, d?: number): number => {
        const v = tonum(t.get(k));
        if (v === undefined) {
          if (d === undefined) throw new LuaError(`field '${k}' missing in date table`);
          return d;
        }
        return v;
      };
      return Math.floor(new Date(g("year"), g("month") - 1, g("day"), g("hour", 12), g("min", 0), g("sec", 0)).getTime() / 1000);
    }
    return Math.floor(now() / 1000);
  });
  reg(O, "clock", () => now() / 1000);
  reg(O, "difftime", (a) => checkNum("difftime", a, 1) - checkNum("difftime", a, 2, 0));
  reg(O, "date", (a) => {
    const fmt = checkStr("date", a, 1, "%c");
    const d = new Date(a[1] === undefined ? now() : checkNum("date", a, 2) * 1000);
    const utc = fmt.startsWith("!");
    const f = utc ? fmt.slice(1) : fmt;
    const get = {
      Y: utc ? d.getUTCFullYear() : d.getFullYear(), m: (utc ? d.getUTCMonth() : d.getMonth()) + 1,
      d: utc ? d.getUTCDate() : d.getDate(), H: utc ? d.getUTCHours() : d.getHours(),
      M: utc ? d.getUTCMinutes() : d.getMinutes(), S: utc ? d.getUTCSeconds() : d.getSeconds(),
      w: utc ? d.getUTCDay() : d.getDay(),
    };
    if (f.startsWith("*t")) {
      const t = new LuaTable();
      t.set("year", get.Y); t.set("month", get.m); t.set("day", get.d);
      t.set("hour", get.H); t.set("min", get.M); t.set("sec", get.S); t.set("wday", get.w + 1);
      return t;
    }
    const p2 = (n: number) => String(n).padStart(2, "0");
    return f.replace(/%([a-zA-Z%])/g, (_m, c: string) => {
      switch (c) {
        case "Y": return String(get.Y);
        case "y": return p2(get.Y % 100);
        case "m": return p2(get.m);
        case "d": return p2(get.d);
        case "H": return p2(get.H);
        case "M": return p2(get.M);
        case "S": return p2(get.S);
        case "c": return `${get.Y}-${p2(get.m)}-${p2(get.d)} ${p2(get.H)}:${p2(get.M)}:${p2(get.S)}`;
        case "x": return `${p2(get.m)}/${p2(get.d)}/${p2(get.Y % 100)}`;
        case "X": return `${p2(get.H)}:${p2(get.M)}:${p2(get.S)}`;
        case "%": return "%";
        default: return "%" + c;
      }
    });
  });
  reg(O, "getenv", () => undefined);
  return O;
}

// ===== [S7] installStdlib =====

export interface StdlibOptions {
  print?: (line: string) => void;
  /** DE: Zeitquelle in ms (Simulation darf eigene Uhr liefern). EN: time source in ms. */
  now?: () => number;
  /**
   * DE: Lua-5.1-Syntax auf der 5.0-VM (ClassicAPI): zusätzlich gfind, math.mod, table.foreach usw.
   * EN: Lua 5.1 syntax on the 5.0 VM (ClassicAPI): additionally gfind, math.mod, table.foreach etc.
   */
  compat50?: boolean;
}

export function installStdlib(it: Interpreter, opts: StdlibOptions = {}): void {
  const out = opts.print ?? ((s: string) => console.log(s));
  installBase(it, out);
  const G = it.globals;
  const S = installString(it);
  G.set("string", S);
  if (it.version !== "5.0") it.stringMeta.set("__index", S); // DE: Lua 5.0 hat keine String-Methoden (s:upper()). EN: Lua 5.0 has no string methods.
  G.set("table", installTable(it));
  G.set("math", installMath(it));
  G.set("os", installOs(opts.now ?? (() => Date.now())));
  if (opts.compat50 && it.version === "5.1") {
    const ref50 = new Interpreter50Shim(it);
    ref50.install();
  }
}

/** DE: Ergänzt die 5.0-only-Funktionen auf einer 5.1-Umgebung. EN: adds the 5.0-only functions to a 5.1 environment. */
class Interpreter50Shim {
  constructor(private it: Interpreter) {}
  install(): void {
    const G = this.it.globals;
    const S = G.get("string") as LuaTable;
    const T = G.get("table") as LuaTable;
    const M = G.get("math") as LuaTable;
    S.set("gfind", S.get("gmatch"));
    M.set("mod", M.get("fmod"));
    reg(T, "setn", (a) => {
      checkTable("setn", a, 1).set("n", checkNum("setn", a, 2));
    });
    const it = this.it;
    reg(T, "foreach", (a) => {
      const t = checkTable("foreach", a, 1);
      const f = checkFn("foreach", a, 2);
      for (const k of [...t.arr.keys()].map((i) => i + 1)) {
        const r = it.call(f, [k, t.get(k)])[0];
        if (r !== undefined) return r;
      }
      for (const [k, v] of [...t.hash]) {
        const r = it.call(f, [k, v])[0];
        if (r !== undefined) return r;
      }
    });
    reg(T, "foreachi", (a) => {
      const t = checkTable("foreachi", a, 1);
      const f = checkFn("foreachi", a, 2);
      for (let i = 1; i <= t.length(); i++) {
        const r = it.call(f, [i, t.get(i)])[0];
        if (r !== undefined) return r;
      }
    });
  }
}
