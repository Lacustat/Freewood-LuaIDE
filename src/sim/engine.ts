/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Prim, SimEngine ....... schmale Schnittstelle zwischen Simulation und Lua-VM
 *   [S2] InterpEngine .......... eigener Interpreter
 *   [S3] WasmEngine ............ echte Lua-5.0-VM (WASM)
 *
 * DE: Die Simulation kennt nur primitive Werte (nil, boolean, number, string). Frames, Funktionen
 *     und Tabellen bleiben in der VM (siehe prelude.ts) und werden über Kennungen angesprochen.
 *     Dadurch läuft dieselbe Simulation auf dem eigenen Interpreter UND auf der echten VM.
 * EN: the simulation only knows primitive values (nil, boolean, number, string). Frames, functions
 *     and tables stay inside the VM (see prelude.ts) and are addressed by ids. The same simulation
 *     therefore runs on the own interpreter AND on the real VM.
 */

import type { LuaVersion } from "../plugin-api/types.js";
import { InterpRuntime } from "../lua/runtime.js";
import { LuaMulti, Wasm50Runtime } from "../lua/wasm50.js";
import type { ExecResult } from "../runtime/types.js";
import type { LuaValue } from "../lua/value.js";

// ===== [S1] Prim, SimEngine =====

export type Prim = undefined | boolean | number | string;
export type HostFn = (...args: unknown[]) => Prim | Prim[] | void;

export interface SimEngine {
  readonly id: string;
  readonly luaVersion: LuaVersion;
  /** DE: Globale Host-Funktion für Lua. EN: global host function for Lua. */
  host(name: string, fn: HostFn): void;
  /** DE: Führt Quelltext aus. EN: runs source. */
  run(code: string, chunk: string): ExecResult;
  /** DE: Ruft eine globale Lua-Funktion mit primitiven Argumenten. EN: calls a global Lua function with primitive arguments. */
  call(name: string, args: Prim[]): ExecResult;
  getGlobal(name: string): unknown;
  setGlobal(name: string, value: Prim): void;
  dispose(): void;
}

// ===== [S2] InterpEngine =====

export interface InterpEngineOptions {
  now?: () => number;
  compat50?: boolean;
  stepLimit?: number;
}

export class InterpEngine implements SimEngine {
  readonly id = "freewood-interp";
  private readonly rt: InterpRuntime;

  constructor(readonly luaVersion: LuaVersion, opts: InterpEngineOptions = {}) {
    this.rt = new InterpRuntime(luaVersion, { now: opts.now, compat50: opts.compat50 });
    this.rt.interp.stepLimit = opts.stepLimit ?? 2_000_000;
  }

  host(name: string, fn: HostFn): void {
    this.rt.registerFunction(name, fn as (...a: unknown[]) => unknown);
  }

  run(code: string, chunk: string): ExecResult {
    return this.rt.executeSync(code, chunk);
  }

  call(name: string, args: Prim[]): ExecResult {
    this.rt.interp.steps = 0;
    return this.rt.callFunction(this.rt.interp.globals.get(name) as LuaValue, args);
  }

  getGlobal(name: string): unknown {
    return this.rt.getGlobal(name);
  }

  setGlobal(name: string, value: Prim): void {
    this.rt.setGlobal(name, value);
  }

  dispose(): void {
    this.rt.dispose();
  }
}

// ===== [S3] WasmEngine =====

export class WasmEngine implements SimEngine {
  readonly id: string;
  readonly luaVersion: LuaVersion;
  private readonly chunks = new Map<string, string>();

  constructor(private readonly rt: Wasm50Runtime) { this.luaVersion = rt.luaVersion; this.id = rt.luaVersion === "5.1" ? "lua51-wasm" : "lua50-wasm"; }

  host(name: string, fn: HostFn): void {
    this.rt.registerFunction(name, (...a: unknown[]) => {
      const r = fn(...a);
      return Array.isArray(r) ? new LuaMulti(r) : r;
    });
  }

  run(code: string, chunk: string): ExecResult {
    return this.rt.executeSync(code, chunk.startsWith("=") || chunk.startsWith("@") ? chunk : `=${chunk}`);
  }

  call(name: string, args: Prim[]): ExecResult {
    const key = `${name}/${args.length}`;
    let src = this.chunks.get(key);
    if (src === undefined) {
      src = `return ${name}(${args.map((_, i) => `__fw_a${i + 1}`).join(",")})`;
      this.chunks.set(key, src);
    }
    args.forEach((v, i) => this.rt.setGlobal(`__fw_a${i + 1}`, v));
    return this.rt.executeSync(src, "=call");
  }

  getGlobal(name: string): unknown {
    return this.rt.getGlobal(name);
  }

  setGlobal(name: string, value: Prim): void {
    this.rt.setGlobal(name, value);
  }

  dispose(): void {
    this.rt.dispose();
  }
}

/** DE: Gibt es für das Ziel eine echte VM? Vanilla und ClassicAPI: Lua 5.0, Retail: Lua 5.1. EN: is there a real VM for the target? Vanilla and ClassicAPI: Lua 5.0, Retail: Lua 5.1. */
export function supportsRealVm(target: { luaVersion: LuaVersion; syntax: string }): boolean {
  return target.luaVersion === "5.0" || target.luaVersion === "5.1";
}

/** DE: Welche Lua-VM braucht das Ziel? EN: which Lua VM does the target need? */
export function realVmVersion(target: { luaVersion: LuaVersion; syntax: string }): LuaVersion {
  return target.syntax === "lua51-transpiled" ? "5.0" : target.luaVersion;
}

/** DE: Erzeugt eine Engine auf der echten Lua-5.0-VM. EN: creates an engine on the real Lua 5.0 VM. */
/** DE: `classic` = ClassicAPI-Verhalten der VM (String-Methoden, 60 Upvalues, Schleifenvariable je Durchlauf). EN: `classic` = ClassicAPI VM behaviour. */
export async function createWasmEngine(load: () => Promise<BufferSource>, classic = false, version: LuaVersion = "5.0"): Promise<SimEngine> {
  const module = await WebAssembly.compile(await load());
  const rt = await Wasm50Runtime.create(module, undefined, classic, version);
  return new WasmEngine(rt);
}
