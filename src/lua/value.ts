/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] LuaValue ........ Werte-Modell (nil=undefined)
 *   [S2] LuaTable ........ Tabelle mit Array- und Hash-Teil, Metatable
 *   [S3] LuaFunction ..... Lua- und native Funktionen
 *   [S4] LuaError ........ Laufzeitfehler
 *   [S5] Helfer · helpers  type, tostring, tonumber
 */

// ===== [S1] LuaValue =====

export type LuaValue = undefined | boolean | number | string | LuaTable | LuaFunction;

// ===== [S2] LuaTable =====

export class LuaTable {
  arr: LuaValue[] = [];
  hash = new Map<LuaValue, LuaValue>();
  meta: LuaTable | undefined;
  /** DE: Frei nutzbar für Host-Objekte (z. B. simulierte Frames). EN: free slot for host objects. */
  host: unknown;

  get(key: LuaValue): LuaValue {
    if (typeof key === "number") {
      if (Number.isInteger(key) && key >= 1 && key <= this.arr.length) return this.arr[key - 1];
    }
    return this.hash.get(key);
  }

  set(key: LuaValue, value: LuaValue): void {
    if (typeof key === "number") {
      if (Number.isNaN(key)) throw new LuaError("table index is NaN");
      if (Number.isInteger(key) && key >= 1) {
        const n = this.arr.length;
        if (key <= n) {
          this.arr[key - 1] = value;
          if (value === undefined && key === n) {
            while (this.arr.length > 0 && this.arr[this.arr.length - 1] === undefined) this.arr.pop();
          }
          return;
        }
        if (key === n + 1) {
          if (value === undefined) {
            this.hash.delete(key);
            return;
          }
          this.arr.push(value);
          this.hash.delete(key);
          // migrate following keys from the hash part
          let next = this.arr.length + 1;
          while (this.hash.has(next)) {
            this.arr.push(this.hash.get(next));
            this.hash.delete(next);
            next++;
          }
          return;
        }
      }
    }
    if (key === undefined) throw new LuaError("table index is nil");
    if (value === undefined) this.hash.delete(key);
    else this.hash.set(key, value);
  }

  length(): number {
    return this.arr.length;
  }

  /** DE: Nächster Schlüssel nach `key` (für next/pairs). EN: next key after `key`. */
  next(key: LuaValue): [LuaValue, LuaValue] | undefined {
    let i: number;
    if (key === undefined) i = 0;
    else if (typeof key === "number" && Number.isInteger(key) && key >= 1 && key <= this.arr.length) i = key;
    else i = -1;
    if (i >= 0) {
      for (; i < this.arr.length; i++) if (this.arr[i] !== undefined) return [i + 1, this.arr[i]];
      for (const [k, v] of this.hash) return [k, v];
      return undefined;
    }
    let found = false;
    for (const [k, v] of this.hash) {
      if (found) return [k, v];
      if (k === key) found = true;
    }
    if (!found) throw new LuaError("invalid key to 'next'");
    return undefined;
  }
}

// ===== [S3] LuaFunction =====

export type NativeImpl = (args: LuaValue[]) => LuaValue[] | LuaValue | void;

export class LuaFunction {
  constructor(public name: string, public native?: NativeImpl, public closure?: unknown) {}
}

export function nativeFn(name: string, impl: (args: LuaValue[]) => LuaValue[] | LuaValue | void): LuaFunction {
  return new LuaFunction(name, impl);
}

// ===== [S4] LuaError =====

export class LuaError extends Error {
  /** DE: Der Lua-Fehlerwert (meist ein String). EN: the Lua error value (usually a string). */
  value: LuaValue;
  traceback?: string;
  /** DE: true = Fehlerwert unverändert weitergeben (kein Positionspräfix). EN: true = pass the value unchanged (no position prefix). */
  raw = false;
  constructor(value: LuaValue | string, public line?: number, public chunk?: string) {
    super(typeof value === "string" ? value : "error object");
    this.value = value as LuaValue;
  }
}

// ===== [S5] Helfer · helpers =====

export function luaType(v: LuaValue): string {
  if (v === undefined) return "nil";
  switch (typeof v) {
    case "boolean": return "boolean";
    case "number": return "number";
    case "string": return "string";
    default: return v instanceof LuaTable ? "table" : "function";
  }
}

export function fmtNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  if (Number.isNaN(n)) return "nan";
  // %.14g
  let s = n.toPrecision(14);
  if (s.includes("e")) {
    const [m, e] = s.split("e") as [string, string];
    const mant = m.includes(".") ? m.replace(/\.?0+$/, "") : m;
    const exp = Number(e);
    return `${mant}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s;
}

let idCounter = 0;
const ids = new WeakMap<object, number>();
export function addressOf(o: object): string {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = ++idCounter));
  return "0x" + (0x1000 + id * 8).toString(16).padStart(8, "0");
}

export function tostr(v: LuaValue): string {
  if (v === undefined) return "nil";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return fmtNumber(v);
  if (typeof v === "string") return v;
  if (v instanceof LuaTable) return "table: " + addressOf(v);
  return (v.native ? "function: builtin: " : "function: ") + addressOf(v);
}

export function tonum(v: LuaValue): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return undefined;
    if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(s)) return s.startsWith("-") ? -Number(s.slice(1)) : Number(s.replace("+", ""));
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s);
  }
  return undefined;
}
