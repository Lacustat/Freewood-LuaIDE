/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Werte-Austausch · value exchange ....... Bytes <-> JS-Werte (Format siehe runtimes/lua50/fw_host.c)
 *   [S2] Wasm50Runtime .......................... echtes Lua 5.0 als LuaRuntime
 *   [S3] Fabrik · factory ....................... createWasm50Factory(loader)
 *
 * DE: Bindet das echte Lua 5.0 (WASM, siehe runtimes/lua50) hinter die Schnittstelle `LuaRuntime`.
 *     Läuft in Node und im Browser (kein node:wasi nötig). Werte: nil, boolean, number, string;
 *     Tabellen und Funktionen werden nicht kopiert (als `{ luaType }` gemeldet).
 * EN: plugs real Lua 5.0 (WASM, see runtimes/lua50) behind the `LuaRuntime` interface. Runs in Node
 *     and in the browser (no node:wasi needed). Values: nil, boolean, number, string; tables and
 *     functions are not copied (reported as `{ luaType }`).
 */

import type { LuaVersion } from "../plugin-api/types.js";
import type { ExecResult, LuaRuntime, RuntimeFactory } from "../runtime/types.js";

// ===== [S1] Werte-Austausch · value exchange =====

/** DE: Mehrere Rückgabewerte einer Host-Funktion. EN: several return values of a host function. */
export class LuaMulti {
  constructor(readonly values: unknown[]) {}
}

/** DE: Platzhalter für nicht kopierbare Lua-Werte. EN: placeholder for Lua values that cannot be copied. */
export interface LuaOpaque {
  luaType: string;
}

const IOSIZE = 65536;
const enc = new TextEncoder();
const dec = new TextDecoder();

function writeValue(io: Uint8Array, view: DataView, pos: number, v: unknown): number {
  if (v === undefined || v === null) {
    io[pos++] = 0;
  } else if (typeof v === "boolean") {
    io[pos++] = 1;
    io[pos++] = v ? 1 : 0;
  } else if (typeof v === "number") {
    io[pos++] = 2;
    view.setFloat64(pos, v, true);
    pos += 8;
  } else {
    const bytes = enc.encode(typeof v === "string" ? v : String(v));
    if (pos + 5 + bytes.length > IOSIZE) throw new Error("value too large for the host exchange buffer (64 KB)");
    io[pos++] = 3;
    view.setUint32(pos, bytes.length, true);
    pos += 4;
    io.set(bytes, pos);
    pos += bytes.length;
  }
  return pos;
}

function readValue(io: Uint8Array, view: DataView, pos: number): [unknown, number] {
  const tag = io[pos++]!;
  switch (tag) {
    case 0: return [undefined, pos];
    case 1: return [io[pos]! !== 0, pos + 1];
    case 2: return [view.getFloat64(pos, true), pos + 8];
    default: {
      const n = view.getUint32(pos, true);
      const s = dec.decode(io.subarray(pos + 4, pos + 4 + n));
      return [tag === 4 ? ({ luaType: s } satisfies LuaOpaque) : s, pos + 4 + n];
    }
  }
}

// ===== [S2] Wasm50Runtime =====

type HostFn = (...args: unknown[]) => unknown;

interface Exports {
  memory: WebAssembly.Memory;
  realloc(p: number, n: number): number;
  fw_io(): number;
  fw_out(): number;
  fw_out_len(): number;
  fw_out_clear(): void;
  fw_alloc(n: number): number;
  fw_set_limit(n: number): void;
  fw_open(): void;
  fw_register(name: number): void;
  fw_run(code: number, chunk: number): number;
  fw_set(name: number): void;
  fw_get(name: number): number;
}

export class Wasm50Runtime implements LuaRuntime {
  readonly luaVersion: LuaVersion = "5.0";
  /** DE: Zeilen, die `print` ausgegeben hat. EN: lines printed by `print`. */
  readonly output: string[] = [];
  private x!: Exports;
  private hosts = new Map<string, HostFn>();
  private setjmpId = 0;
  private tempRet0 = 0;

  private constructor() {}

  static async create(module: WebAssembly.Module, instructionLimit = 20_000_000): Promise<Wasm50Runtime> {
    const rt = new Wasm50Runtime();
    const wasi = {
      environ_get: () => 0,
      environ_sizes_get: (countPtr: number, sizePtr: number) => {
        const v = new DataView(rt.x.memory.buffer);
        v.setUint32(countPtr, 0, true);
        v.setUint32(sizePtr, 0, true);
        return 0;
      },
      clock_time_get: (_id: number, _prec: bigint, outPtr: number) => {
        new DataView(rt.x.memory.buffer).setBigUint64(outPtr, BigInt(Date.now()) * 1_000_000n, true);
        return 0;
      },
      proc_exit: (code: number) => { throw new Error(`lua runtime exited (${code})`); },
    };
    const ebadf = () => 8;
    const imports = {
      env: {
        getTempRet0: () => rt.tempRet0,
        saveSetjmp: (envp: number, label: number, table: number, size: number): number => rt.saveSetjmp(envp, label, table, size),
        testSetjmp: (id: number, table: number, size: number): number => rt.testSetjmp(id, table, size),
        host_call: (namePtr: number, len: number): number => rt.hostCall(namePtr, len),
      },
      wasi_snapshot_preview1: new Proxy(wasi, { get: (t, k: string) => (k in t ? (t as Record<string, unknown>)[k] : ebadf) }),
    };
    const inst = await WebAssembly.instantiate(module, imports as unknown as WebAssembly.Imports);
    rt.x = inst.exports as unknown as Exports;
    rt.x.fw_open();
    rt.x.fw_set_limit(instructionLimit);
    return rt;
  }

  // --- setjmp-Hilfen der Übersetzung · setjmp helpers of the build ---
  private saveSetjmp(envp: number, label: number, table: number, size: number): number {
    const H = new Int32Array(this.x.memory.buffer);
    this.setjmpId++;
    H[envp >> 2] = this.setjmpId;
    for (let i = 0; i < size; i++) {
      const o = (table >> 2) + (i << 1);
      if (H[o] === 0) {
        H[o] = this.setjmpId;
        H[o + 1] = label;
        H[o + 2] = 0;
        this.tempRet0 = size;
        return table;
      }
    }
    const nsize = size * 2;
    const nt = this.x.realloc(table, 8 * (nsize + 1));
    const r = this.saveSetjmp(envp, label, nt, nsize);
    this.tempRet0 = nsize;
    return r;
  }

  private testSetjmp(id: number, table: number, size: number): number {
    const H = new Int32Array(this.x.memory.buffer);
    for (let i = 0; i < size; i++) {
      const o = (table >> 2) + (i << 1);
      const cur = H[o]!;
      if (cur === 0) break;
      if (cur === id) return H[o + 1]!;
    }
    return 0;
  }

  // --- Aufrufe von Lua nach JS · calls from Lua to JS ---
  private hostCall(namePtr: number, len: number): number {
    const mem = new Uint8Array(this.x.memory.buffer);
    let e = namePtr;
    while (mem[e]) e++;
    const name = dec.decode(mem.subarray(namePtr, e));
    const ioPtr = this.x.fw_io();
    const io = mem.subarray(ioPtr, ioPtr + IOSIZE);
    const view = new DataView(this.x.memory.buffer, ioPtr, IOSIZE);
    try {
      const n = io[0]!;
      const args: unknown[] = [];
      let pos = 1;
      for (let i = 0; i < n; i++) {
        const [v, p] = readValue(io, view, pos);
        args.push(v);
        pos = p;
      }
      void len;
      const fn = this.hosts.get(name);
      if (!fn) throw new Error(`host function '${name}' is not registered`);
      const r = fn(...args);
      const list = r === undefined ? [] : r instanceof LuaMulti ? r.values : [r];
      io[0] = list.length;
      pos = 1;
      for (const v of list) pos = writeValue(io, view, pos, v);
      return 0;
    } catch (err) {
      const bytes = enc.encode(err instanceof Error ? err.message : String(err)).subarray(0, 2000);
      io.set(bytes, 0);
      return -Math.max(1, bytes.length);
    }
  }

  // --- LuaRuntime ---
  private cstr(text: string): number {
    const bytes = enc.encode(text + "\0");
    const p = this.x.fw_alloc(bytes.length);
    new Uint8Array(this.x.memory.buffer, p, bytes.length).set(bytes);
    return p;
  }

  private drainOutput(): void {
    const len = this.x.fw_out_len();
    if (len === 0) return;
    const text = dec.decode(new Uint8Array(this.x.memory.buffer, this.x.fw_out(), len));
    this.x.fw_out_clear();
    for (const line of text.split("\n")) if (line !== "") this.output.push(line);
  }

  executeSync(source: string, chunkName = "=chunk"): ExecResult {
    const code = this.cstr(source);
    const chunk = this.cstr(chunkName);
    const status = this.x.fw_run(code, chunk);
    this.drainOutput();
    const ioPtr = this.x.fw_io();
    const io = new Uint8Array(this.x.memory.buffer, ioPtr, IOSIZE);
    if (status !== 0) {
      let e = 0;
      while (io[e]) e++;
      const text = dec.decode(io.subarray(0, e));
      const m = /^(.*?):(\d+): ([\s\S]*)$/.exec(text);
      return { ok: false, values: [], error: m ? { message: text, chunk: m[1]!, line: Number(m[2]) } : { message: text } };
    }
    const view = new DataView(this.x.memory.buffer, ioPtr, IOSIZE);
    const values: unknown[] = [];
    let pos = 1;
    for (let i = 0; i < io[0]!; i++) {
      const [v, p] = readValue(io, view, pos);
      values.push(v);
      pos = p;
    }
    return { ok: true, values };
  }

  async execute(source: string, chunkName = "=chunk"): Promise<ExecResult> {
    return this.executeSync(source, chunkName);
  }

  setGlobal(name: string, value: unknown): void {
    const ioPtr = this.x.fw_io();
    const io = new Uint8Array(this.x.memory.buffer, ioPtr, IOSIZE);
    writeValue(io, new DataView(this.x.memory.buffer, ioPtr, IOSIZE), 0, value);
    this.x.fw_set(this.cstr(name));
  }

  getGlobal(name: string): unknown {
    const n = this.x.fw_get(this.cstr(name));
    if (n < 0) return undefined;
    const ioPtr = this.x.fw_io();
    return readValue(new Uint8Array(this.x.memory.buffer, ioPtr, IOSIZE), new DataView(this.x.memory.buffer, ioPtr, IOSIZE), 0)[0];
  }

  registerFunction(name: string, fn: (...args: unknown[]) => unknown): void {
    this.hosts.set(name, fn);
    this.x.fw_register(this.cstr(name));
  }

  /** DE: Obergrenze an VM-Befehlen je Aufruf (0 = keine). EN: VM instruction limit per call (0 = none). */
  setInstructionLimit(n: number): void {
    this.x.fw_set_limit(n);
  }

  dispose(): void {
    this.hosts.clear();
  }
}

// ===== [S3] Fabrik · factory =====

/** DE: `load` liefert die Bytes von lua50.wasm (Node: Datei lesen, Browser: fetch). EN: `load` returns the bytes of lua50.wasm. */
export function createWasm50Factory(load: () => Promise<BufferSource>): RuntimeFactory {
  let compiled: Promise<WebAssembly.Module> | undefined;
  return {
    id: "lua50-wasm",
    luaVersion: "5.0",
    name: { en: "Lua 5.0 (real VM, WASM)", de: "Lua 5.0 (echte VM, WASM)" },
    async create(): Promise<LuaRuntime> {
      compiled ??= load().then((b) => WebAssembly.compile(b));
      return Wasm50Runtime.create(await compiled);
    },
  };
}
