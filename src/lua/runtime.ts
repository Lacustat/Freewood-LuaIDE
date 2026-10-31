/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] InterpRuntime ........ LuaRuntime-Adapter für den eigenen Interpreter
 *   [S2] Fabriken · factories . Lua 5.0 und Lua 5.1
 *   [S3] Wert-Brücke · bridge .. toLua / fromLua
 *
 * DE: Der eigene Interpreter ersetzt vorerst die WASM-Laufzeiten: er ist ohne Abhängigkeiten
 *     im Browser lauffähig und kennt Lua 5.0 UND 5.1. Eine WASM-Laufzeit kann später zusätzlich
 *     registriert werden (gleiche Schnittstelle).
 * EN: The own interpreter replaces WASM runtimes for now: dependency-free in the browser and
 *     it knows Lua 5.0 AND 5.1. A WASM runtime can be registered later (same interface).
 */

import type { LuaVersion } from "../plugin-api/types.js";
import type { ExecResult, LuaRuntime, RuntimeFactory } from "../runtime/types.js";
import { Interpreter } from "./interp.js";
import { LuaSyntaxError } from "./lexer.js";
import { installStdlib, type StdlibOptions } from "./stdlib.js";
import { LuaError, LuaFunction, LuaTable, nativeFn, type LuaValue } from "./value.js";

// ===== [S1] InterpRuntime =====

export class InterpRuntime implements LuaRuntime {
  readonly interp: Interpreter;
  readonly output: string[] = [];

  constructor(readonly luaVersion: LuaVersion, opts: StdlibOptions = {}) {
    this.interp = new Interpreter(luaVersion);
    installStdlib(this.interp, {
      ...opts,
      print: (s) => {
        this.output.push(s);
        opts.print?.(s);
      },
    });
  }

  async execute(source: string, chunkName = "=chunk"): Promise<ExecResult> {
    return this.executeSync(source, chunkName);
  }

  executeSync(source: string, chunkName = "chunk"): ExecResult {
    this.interp.steps = 0;
    try {
      const fn = this.interp.load(source, chunkName);
      const values = this.interp.call(fn, []);
      return { ok: true, values };
    } catch (e) {
      if (e instanceof LuaSyntaxError) return { ok: false, values: [], error: { message: e.message, chunk: e.chunk, line: e.line } };
      if (e instanceof LuaError) {
        const msg = typeof e.value === "string" ? e.value : "(error object)";
        return { ok: false, values: [], error: { message: msg, chunk: e.chunk, line: e.line } };
      }
      if (e instanceof RangeError) return { ok: false, values: [], error: { message: "stack overflow" } };
      throw e;
    }
  }

  /** DE: Ruft eine Lua-Funktion (z. B. einen Event-Handler) auf; Fehler kommen als Ergebnis. EN: calls a Lua function; errors come back as result. */
  callFunction(fn: LuaValue, args: LuaValue[]): ExecResult {
    try {
      return { ok: true, values: this.interp.call(fn, args) };
    } catch (e) {
      if (e instanceof LuaError) {
        return { ok: false, values: [], error: { message: typeof e.value === "string" ? e.value : "(error object)", chunk: e.chunk, line: e.line } };
      }
      if (e instanceof RangeError) return { ok: false, values: [], error: { message: "stack overflow" } };
      throw e;
    }
  }

  setGlobal(name: string, value: unknown): void {
    this.interp.globals.set(name, toLua(value));
  }

  getGlobal(name: string): unknown {
    return this.interp.globals.get(name);
  }

  registerFunction(name: string, fn: (...args: unknown[]) => unknown): void {
    const parts = name.split(".");
    let t = this.interp.globals;
    for (const p of parts.slice(0, -1)) {
      let next = t.get(p);
      if (!(next instanceof LuaTable)) {
        next = new LuaTable();
        t.set(p, next);
      }
      t = next;
    }
    const last = parts[parts.length - 1]!;
    t.set(last, nativeFn(name, (args) => {
      const r = fn(...args);
      if (Array.isArray(r)) return r.map(toLua);
      return toLua(r);
    }));
  }

  dispose(): void {
    this.output.length = 0;
  }
}

// ===== [S2] Fabriken · factories =====

export const lua50Factory: RuntimeFactory = {
  id: "freewood-lua50",
  luaVersion: "5.0",
  name: { en: "Freewood interpreter (Lua 5.0)", de: "Freewood-Interpreter (Lua 5.0)" },
  create: async () => new InterpRuntime("5.0"),
};

export const lua51Factory: RuntimeFactory = {
  id: "freewood-lua51",
  luaVersion: "5.1",
  name: { en: "Freewood interpreter (Lua 5.1)", de: "Freewood-Interpreter (Lua 5.1)" },
  create: async () => new InterpRuntime("5.1"),
};

// ===== [S3] Wert-Brücke · bridge =====

export function toLua(v: unknown): LuaValue {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
  if (v instanceof LuaTable || v instanceof LuaFunction) return v;
  if (Array.isArray(v)) {
    const t = new LuaTable();
    v.forEach((x, i) => t.set(i + 1, toLua(x)));
    return t;
  }
  if (typeof v === "object") {
    const t = new LuaTable();
    for (const [k, x] of Object.entries(v)) t.set(k, toLua(x));
    return t;
  }
  return undefined;
}

export function fromLua(v: LuaValue): unknown {
  if (v instanceof LuaTable) {
    if (v.hash.size === 0) return v.arr.map(fromLua);
    const o: Record<string, unknown> = {};
    v.arr.forEach((x, i) => (o[String(i + 1)] = fromLua(x)));
    for (const [k, x] of v.hash) o[String(k)] = fromLua(x);
    return o;
  }
  return v;
}
