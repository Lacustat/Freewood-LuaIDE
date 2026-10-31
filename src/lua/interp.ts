/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Scope und Closure
 *   [S2] Interpreter ........ Kern: Aufrufe, Ausdrücke, Anweisungen
 *   [S3] Metamethoden ....... index, arith, compare, concat, len
 *
 * DE: Baum-Interpreter für Lua 5.0/5.1. Unterschiede nach `version`: in 5.0 erzeugt `...`
 *     eine lokale Tabelle `arg` (mit Feld n), in 5.1 gilt `...` als Ausdruck.
 * EN: tree-walking interpreter for Lua 5.0/5.1. Version differences: in 5.0 `...` creates a
 *     local table `arg` (with field n); in 5.1 `...` is an expression.
 */

import type { LuaVersion } from "../plugin-api/types.js";
import type { Expr, FuncBody, Stat } from "./parser.js";
import { parse } from "./parser.js";
import { LuaError, LuaFunction, LuaTable, luaType, tonum, tostr, type LuaValue } from "./value.js";

// ===== [S1] Scope und Closure =====

interface Ref {
  v: LuaValue;
}

class Scope {
  vars = new Map<string, Ref>();
  varargs?: LuaValue[];
  constructor(public parent?: Scope) {}
  find(name: string): Ref | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) {
      const r = s.vars.get(name);
      if (r) return r;
    }
    return undefined;
  }
  findVarargs(): LuaValue[] | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) if (s.varargs) return s.varargs;
    return undefined;
  }
}

export interface Closure {
  body: FuncBody;
  scope: Scope;
  chunk: string;
  env: LuaTable;
}

type Signal = undefined | "break" | { ret: LuaValue[] };
const BREAK = "break" as const;

// ===== [S2] Interpreter =====

export class Interpreter {
  globals = new LuaTable();
  stringMeta = new LuaTable();
  line = 0;
  chunk = "?";
  steps = 0;
  stepLimit = 20_000_000;
  depth = 0;
  maxDepth = 120;
  callLines: number[] = [];
  /** DE: Wird bei jedem Aufruf einer Lua-Funktion gemeldet (für Profiling/Tests). EN: hook per call. */
  constructor(public version: LuaVersion) {}

  // ----- Laden · loading -----
  load(src: string, chunk: string, env: LuaTable = this.globals): LuaFunction {
    const body = parse(src, chunk, this.version);
    const closure: Closure = { body, scope: new Scope(), chunk, env };
    return new LuaFunction(chunk, undefined, closure);
  }

  // ----- Aufrufe · calls -----
  call(fn: LuaValue, args: LuaValue[], line = this.line): LuaValue[] {
    if (fn instanceof LuaFunction) {
      if (fn.native) {
        const savedLine = this.line;
        this.line = line;
        let r: ReturnType<NonNullable<LuaFunction["native"]>>;
        try {
          r = fn.native(args);
        } catch (e) {
          // errors raised by library code get the position of the call, like luaL_error
          if (e instanceof LuaError) {
            if (e.line === undefined && !e.raw && typeof e.value === "string") throw this.rt(e.value, line);
            throw e;
          }
          if (e instanceof RangeError) throw e;
          if (e instanceof Error) throw this.rt(e.message, line);
          throw e;
        }
        this.line = savedLine;
        if (r === undefined) return [];
        return Array.isArray(r) ? r : [r];
      }
      return this.callClosure(fn.closure as Closure, args, line);
    }
    const mm = this.metamethod(fn, "__call");
    if (mm !== undefined) return this.call(mm, [fn, ...args], line);
    throw this.rt(`attempt to call a ${luaType(fn)} value`, line);
  }

  private callClosure(c: Closure, args: LuaValue[], line: number): LuaValue[] {
    if (++this.depth > this.maxDepth) {
      this.depth--;
      throw this.rt("stack overflow", line);
    }
    if (++this.steps > this.stepLimit) {
      this.depth--;
      throw this.rt("script exceeded the instruction limit (endless loop?)", line);
    }
    const savedChunk = this.chunk;
    const savedLine = this.line;
    this.callLines.push(line);
    this.chunk = c.chunk;
    const scope = new Scope(c.scope);
    const { params, vararg } = c.body;
    for (let i = 0; i < params.length; i++) scope.vars.set(params[i]!, { v: args[i] });
    if (vararg) {
      const extra = args.slice(params.length);
      if (this.version === "5.0") {
        const t = new LuaTable();
        extra.forEach((v, i) => t.set(i + 1, v));
        t.set("n", extra.length);
        scope.vars.set("arg", { v: t });
      } else scope.varargs = extra;
    }
    try {
      const sig = this.execBlock(c.body.body, scope, c.env);
      return sig && sig !== BREAK ? sig.ret : [];
    } catch (e) {
      if (e instanceof RangeError) throw this.rt("stack overflow", this.line);
      throw e;
    } finally {
      this.callLines.pop();
      this.depth--;
      this.chunk = savedChunk;
      this.line = savedLine;
    }
  }

  rt(msg: string, line = this.line): LuaError {
    return new LuaError(`${this.chunk}:${line}: ${msg}`, line, this.chunk);
  }

  // ----- Anweisungen · statements -----
  private execBlock(stats: Stat[], parent: Scope, env: LuaTable, newScope = false): Signal {
    const scope = newScope ? new Scope(parent) : parent;
    for (const s of stats) {
      const sig = this.exec(s, scope, env);
      if (sig) return sig;
    }
    return undefined;
  }

  private exec(s: Stat, scope: Scope, env: LuaTable): Signal {
    this.line = s.line;
    if (++this.steps > this.stepLimit) throw this.rt("script exceeded the instruction limit (endless loop?)");
    switch (s.t) {
      case "Local": {
        const vals = this.evalList(s.exprs, scope, env);
        s.names.forEach((n, i) => scope.vars.set(n, { v: vals[i] }));
        return;
      }
      case "Assign": {
        if (s.targets.length === 1 && s.exprs.length === 1) {
          const v = this.eval(s.exprs[0]!, scope, env);
          this.assign(s.targets[0]!, v, scope, env);
          return;
        }
        // evaluate target sub-expressions first, then values, then assign
        const prepared = s.targets.map((t) =>
          t.t === "Index" ? ({ obj: this.eval(t.obj, scope, env), key: this.eval(t.key, scope, env), line: t.line } as const) : undefined,
        );
        const vals = this.evalList(s.exprs, scope, env);
        s.targets.forEach((t, i) => {
          const p = prepared[i];
          if (p) this.setIndex(p.obj, p.key, vals[i], p.line);
          else this.assign(t, vals[i], scope, env);
        });
        return;
      }
      case "CallStat":
        this.evalMulti(s.call, scope, env);
        return;
      case "Do":
        return this.execBlock(s.body, scope, env, true);
      case "While": {
        while (this.truthy(this.eval(s.cond, scope, env))) {
          if (++this.steps > this.stepLimit) throw this.rt("script exceeded the instruction limit (endless loop?)", s.line);
          const sig = this.execBlock(s.body, scope, env, true);
          if (sig === BREAK) break;
          if (sig) return sig;
        }
        return;
      }
      case "Repeat": {
        for (;;) {
          if (++this.steps > this.stepLimit) throw this.rt("script exceeded the instruction limit (endless loop?)", s.line);
          const inner = new Scope(scope);
          const sig = this.execBlock(s.body, inner, env);
          if (sig === BREAK) break;
          if (sig) return sig;
          if (this.truthy(this.eval(s.cond, inner, env))) break;
        }
        return;
      }
      case "If": {
        for (let i = 0; i < s.conds.length; i++) {
          if (this.truthy(this.eval(s.conds[i]!, scope, env))) return this.execBlock(s.blocks[i]!, scope, env, true);
        }
        return s.orelse ? this.execBlock(s.orelse, scope, env, true) : undefined;
      }
      case "NumFor": {
        const a = this.forNum(this.eval(s.a, scope, env), "initial", s.line);
        const b = this.forNum(this.eval(s.b, scope, env), "limit", s.line);
        const c = s.c ? this.forNum(this.eval(s.c, scope, env), "step", s.line) : 1;
        if (c === 0) throw this.rt("'for' step is zero", s.line);
        for (let i = a; c > 0 ? i <= b : i >= b; i += c) {
          if (++this.steps > this.stepLimit) throw this.rt("script exceeded the instruction limit (endless loop?)", s.line);
          const inner = new Scope(scope);
          inner.vars.set(s.v, { v: i });
          const sig = this.execBlock(s.body, inner, env);
          if (sig === BREAK) break;
          if (sig) return sig;
        }
        return;
      }
      case "GenFor": {
        const vals = this.evalList(s.exprs, scope, env);
        const [f, st, ctl0] = vals;
        let ctl = ctl0;
        for (;;) {
          if (++this.steps > this.stepLimit) throw this.rt("script exceeded the instruction limit (endless loop?)", s.line);
          const rs = this.call(f, [st, ctl], s.line);
          if (rs[0] === undefined) break;
          ctl = rs[0];
          const inner = new Scope(scope);
          s.names.forEach((n, i) => inner.vars.set(n, { v: rs[i] }));
          const sig = this.execBlock(s.body, inner, env);
          if (sig === BREAK) break;
          if (sig) return sig;
        }
        return;
      }
      case "LocalFunc": {
        const ref: Ref = { v: undefined };
        scope.vars.set(s.name, ref);
        ref.v = this.makeFunction(s.f, scope, env);
        return;
      }
      case "Return": {
        if (s.exprs.length === 1 && (s.exprs[0]!.t === "Call" || s.exprs[0]!.t === "Method")) {
          return { ret: this.evalMulti(s.exprs[0]!, scope, env) };
        }
        return { ret: this.evalList(s.exprs, scope, env) };
      }
      case "Break":
        return BREAK;
    }
  }

  private forNum(v: LuaValue, what: string, line: number): number {
    const n = tonum(v);
    if (n === undefined) throw this.rt(`'for' ${what} value must be a number`, line);
    return n;
  }

  private makeFunction(f: FuncBody, scope: Scope, env: LuaTable): LuaFunction {
    return new LuaFunction(f.name, undefined, { body: f, scope, chunk: this.chunk, env } satisfies Closure);
  }

  private assign(t: Expr, v: LuaValue, scope: Scope, env: LuaTable): void {
    if (t.t === "Name") {
      const ref = scope.find(t.name);
      if (ref) ref.v = v;
      else this.setIndex(env, t.name, v, t.line);
    } else if (t.t === "Index") {
      this.setIndex(this.eval(t.obj, scope, env), this.eval(t.key, scope, env), v, t.line);
    }
  }

  // ----- Ausdrücke · expressions -----
  truthy(v: LuaValue): boolean {
    return v !== undefined && v !== false;
  }

  private evalList(exprs: Expr[], scope: Scope, env: LuaTable): LuaValue[] {
    const out: LuaValue[] = [];
    for (let i = 0; i < exprs.length; i++) {
      const e = exprs[i]!;
      if (i === exprs.length - 1 && (e.t === "Call" || e.t === "Method" || e.t === "Vararg")) out.push(...this.evalMulti(e, scope, env));
      else out.push(this.eval(e, scope, env));
    }
    return out;
  }

  private describe(e: Expr, scope: Scope): string {
    if (e.t === "Name") return scope.find(e.name) ? ` (local '${e.name}')` : ` (global '${e.name}')`;
    if (e.t === "Index" && e.key.t === "Str") return ` (field '${e.key.v}')`;
    if (e.t === "Method") return ` (method '${e.name}')`;
    return "";
  }

  private evalMulti(e: Expr, scope: Scope, env: LuaTable): LuaValue[] {
    switch (e.t) {
      case "Call": {
        const fn = this.eval(e.fn, scope, env);
        const args = this.evalList(e.args, scope, env);
        this.line = e.line;
        if (!(fn instanceof LuaFunction) && this.metamethod(fn, "__call") === undefined) {
          throw this.rt(`attempt to call a ${luaType(fn)} value${this.describe(e.fn, scope)}`, e.line);
        }
        return this.call(fn, args, e.line);
      }
      case "Method": {
        const obj = this.eval(e.obj, scope, env);
        const fn = this.index(obj, e.name, e.line);
        const args = [obj, ...this.evalList(e.args, scope, env)];
        this.line = e.line;
        if (!(fn instanceof LuaFunction) && this.metamethod(fn, "__call") === undefined) {
          throw this.rt(`attempt to call method '${e.name}' (a ${luaType(fn)} value)`, e.line);
        }
        return this.call(fn, args, e.line);
      }
      case "Vararg": {
        const va = scope.findVarargs();
        return va ? [...va] : [];
      }
      default:
        return [this.eval(e, scope, env)];
    }
  }

  eval(e: Expr, scope: Scope, env: LuaTable): LuaValue {
    switch (e.t) {
      case "Nil": return undefined;
      case "True": return true;
      case "False": return false;
      case "Num": return e.v;
      case "Str": return e.v;
      case "Vararg": return this.evalMulti(e, scope, env)[0];
      case "Func": return this.makeFunction(e.f, scope, env);
      case "Name": {
        const r = scope.find(e.name);
        if (r) return r.v;
        return this.index(env, e.name, e.line);
      }
      case "Index": return this.index(this.eval(e.obj, scope, env), this.eval(e.key, scope, env), e.line, e.obj, scope);
      case "Call":
      case "Method": return this.evalMulti(e, scope, env)[0];
      case "Paren": return this.eval(e.e, scope, env);
      case "Table": {
        const t = new LuaTable();
        let ai = 0;
        for (const o of e.order) {
          if (o.k === "a") {
            const ex = e.arr[o.i]!;
            if (o.i === e.arr.length - 1 && (ex.t === "Call" || ex.t === "Method" || ex.t === "Vararg")) {
              for (const v of this.evalMulti(ex, scope, env)) t.set(++ai, v);
            } else t.set(++ai, this.eval(ex, scope, env));
          } else {
            const [k, v] = e.hash[o.i]!;
            const kv = this.eval(k, scope, env);
            if (kv === undefined) throw this.rt("table index is nil", e.line);
            t.set(kv, this.eval(v, scope, env));
          }
        }
        return t;
      }
      case "Un": {
        const v = this.eval(e.a, scope, env);
        if (e.op === "not") return !this.truthy(v);
        if (e.op === "-") {
          const n = tonum(v);
          if (n !== undefined) return -n;
          const mm = this.metamethod(v, "__unm");
          if (mm !== undefined) return this.call(mm, [v, v], e.line)[0];
          throw this.rt(`attempt to perform arithmetic on a ${luaType(v)} value${this.describe(e.a, scope)}`, e.line);
        }
        return this.len(v, e.line, e.a, scope);
      }
      case "Bin": return this.binary(e, scope, env);
    }
  }

  private binary(e: Extract<Expr, { t: "Bin" }>, scope: Scope, env: LuaTable): LuaValue {
    if (e.op === "and") {
      const a = this.eval(e.a, scope, env);
      return this.truthy(a) ? this.eval(e.b, scope, env) : a;
    }
    if (e.op === "or") {
      const a = this.eval(e.a, scope, env);
      return this.truthy(a) ? a : this.eval(e.b, scope, env);
    }
    const a = this.eval(e.a, scope, env);
    const b = this.eval(e.b, scope, env);
    switch (e.op) {
      case "==": return this.equals(a, b);
      case "~=": return !this.equals(a, b);
      case "<": return this.lessThan(a, b, e.line);
      case ">": return this.lessThan(b, a, e.line);
      case "<=": return this.lessEq(a, b, e.line);
      case ">=": return this.lessEq(b, a, e.line);
      case "..": return this.concat(a, b, e.line, e, scope);
      default: return this.arith(e.op, a, b, e.line, e, scope);
    }
  }

  // ===== [S3] Metamethoden · metamethods =====

  metatable(v: LuaValue): LuaTable | undefined {
    if (v instanceof LuaTable) return v.meta;
    if (typeof v === "string") return this.stringMeta;
    return undefined;
  }

  metamethod(v: LuaValue, name: string): LuaValue {
    return this.metatable(v)?.get(name);
  }

  index(obj: LuaValue, key: LuaValue, line = this.line, objExpr?: Expr, scope?: Scope): LuaValue {
    for (let loop = 0; loop < 100; loop++) {
      if (obj instanceof LuaTable) {
        const v = obj.get(key);
        if (v !== undefined) return v;
        const h = obj.meta?.get("__index");
        if (h === undefined) return undefined;
        if (h instanceof LuaFunction) return this.call(h, [obj, key], line)[0];
        obj = h;
      } else {
        const h = this.metamethod(obj, "__index");
        if (h === undefined) {
          const what = objExpr && scope ? this.describe(objExpr, scope) : "";
          throw this.rt(`attempt to index a ${luaType(obj)} value${what}`, line);
        }
        if (h instanceof LuaFunction) return this.call(h, [obj, key], line)[0];
        obj = h;
      }
    }
    throw this.rt("loop in gettable", line);
  }

  setIndex(obj: LuaValue, key: LuaValue, value: LuaValue, line = this.line): void {
    for (let loop = 0; loop < 100; loop++) {
      if (obj instanceof LuaTable) {
        const h = obj.meta?.get("__newindex");
        if (h === undefined || obj.get(key) !== undefined) {
          try {
            obj.set(key, value);
          } catch (e) {
            if (e instanceof LuaError && e.line === undefined) throw this.rt(e.message, line);
            throw e;
          }
          return;
        }
        if (h instanceof LuaFunction) {
          this.call(h, [obj, key, value], line);
          return;
        }
        obj = h;
      } else {
        throw this.rt(`attempt to index a ${luaType(obj)} value`, line);
      }
    }
    throw this.rt("loop in settable", line);
  }

  equals(a: LuaValue, b: LuaValue): boolean {
    if (a === b) return true;
    if (a instanceof LuaTable && b instanceof LuaTable) {
      const m1 = a.meta?.get("__eq");
      if (m1 !== undefined && m1 === b.meta?.get("__eq")) return this.truthy(this.call(m1, [a, b])[0]);
    }
    return false;
  }

  lessThan(a: LuaValue, b: LuaValue, line: number): boolean {
    if (typeof a === "number" && typeof b === "number") return a < b;
    if (typeof a === "string" && typeof b === "string") return a < b;
    const mm = this.metamethod(a, "__lt") ?? this.metamethod(b, "__lt");
    if (mm !== undefined) return this.truthy(this.call(mm, [a, b], line)[0]);
    throw this.compareError(a, b, line);
  }

  lessEq(a: LuaValue, b: LuaValue, line: number): boolean {
    if (typeof a === "number" && typeof b === "number") return a <= b;
    if (typeof a === "string" && typeof b === "string") return a <= b;
    const mm = this.metamethod(a, "__le") ?? this.metamethod(b, "__le");
    if (mm !== undefined) return this.truthy(this.call(mm, [a, b], line)[0]);
    const lt = this.metamethod(a, "__lt") ?? this.metamethod(b, "__lt");
    if (lt !== undefined) return !this.truthy(this.call(lt, [b, a], line)[0]);
    throw this.compareError(a, b, line);
  }

  private compareError(a: LuaValue, b: LuaValue, line: number): LuaError {
    const ta = luaType(a);
    const tb = luaType(b);
    return this.rt(ta === tb ? `attempt to compare two ${ta} values` : `attempt to compare ${ta} with ${tb}`, line);
  }

  arith(op: string, a: LuaValue, b: LuaValue, line: number, e?: Expr, scope?: Scope): LuaValue {
    const x = tonum(a);
    const y = tonum(b);
    if (x !== undefined && y !== undefined) {
      switch (op) {
        case "+": return x + y;
        case "-": return x - y;
        case "*": return x * y;
        case "/": return x / y;
        case "%": return y === 0 ? NaN : x - Math.floor(x / y) * y;
        case "^": return Math.pow(x, y);
      }
    }
    const names: Record<string, string> = { "+": "__add", "-": "__sub", "*": "__mul", "/": "__div", "%": "__mod", "^": "__pow" };
    const mm = this.metamethod(a, names[op]!) ?? this.metamethod(b, names[op]!);
    if (mm !== undefined) return this.call(mm, [a, b], line)[0];
    const bad = x === undefined ? a : b;
    let what = "";
    if (e && e.t === "Bin" && scope) what = this.describe(x === undefined ? e.a : e.b, scope);
    throw this.rt(`attempt to perform arithmetic on a ${luaType(bad)} value${what}`, line);
  }

  concat(a: LuaValue, b: LuaValue, line: number, e?: Expr, scope?: Scope): LuaValue {
    const okA = typeof a === "string" || typeof a === "number";
    const okB = typeof b === "string" || typeof b === "number";
    if (okA && okB) return tostr(a) + tostr(b);
    const mm = this.metamethod(a, "__concat") ?? this.metamethod(b, "__concat");
    if (mm !== undefined) return this.call(mm, [a, b], line)[0];
    const bad = okA ? b : a;
    let what = "";
    if (e && e.t === "Bin" && scope) what = this.describe(okA ? e.b : e.a, scope);
    throw this.rt(`attempt to concatenate a ${luaType(bad)} value${what}`, line);
  }

  len(v: LuaValue, line: number, e?: Expr, scope?: Scope): LuaValue {
    if (typeof v === "string") return v.length;
    if (v instanceof LuaTable) return v.length();
    throw this.rt(`attempt to get length of a ${luaType(v)} value${e && scope ? this.describe(e, scope) : ""}`, line);
  }
}
