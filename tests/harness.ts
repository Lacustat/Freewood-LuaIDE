/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Gemeinsame Test-Hilfen · shared test helpers ... targets(), engines(), run()
 *
 * DE: Jeder Test läuft auf dem eigenen Interpreter UND auf der echten Lua-5.0-VM (wenn das Ziel sie unterstützt).
 * EN: every test runs on the own interpreter AND on the real Lua 5.0 VM (when the target supports it).
 */
import { test as nodeTest } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Kernel, WowSim, createWasmEngine, supportsRealVm, type ResolvedTarget } from "../src/index.js";
import { loadPluginsFromRoot } from "../src/node/fs-loaders.js";

export async function targets(): Promise<Record<string, ResolvedTarget>> {
  const k = new Kernel();
  const { plugins } = await loadPluginsFromRoot(join(process.cwd(), "plugins"));
  plugins.forEach((p) => k.plugins.register(p));
  return { v: k.plugins.resolve("vanilla-1.12"), c: k.plugins.resolve("classicapi-1.12"), r: k.plugins.resolve("retail") };
}

const wasmBytes = (): Promise<BufferSource> => Promise.resolve(readFileSync(join(process.cwd(), "runtimes/lua50/lua50.wasm")));

/** DE: Registriert den Test für beide Engines. EN: registers the test for both engines. */
export function engines(name: string, fn: (mk: (t: ResolvedTarget, scenario?: ConstructorParameters<typeof WowSim>[1]) => Promise<WowSim>) => Promise<void>): void {
  for (const eng of ["interp", "wasm"] as const) {
    const mk = async (target: ResolvedTarget, scenario?: ConstructorParameters<typeof WowSim>[1]): Promise<WowSim> => {
      if (eng === "interp" || !supportsRealVm(target)) return new WowSim(target, scenario);
      return new WowSim(target, scenario, await createWasmEngine(wasmBytes, target.syntax === "lua51-transpiled"));
    };
    nodeTest(`[${eng}] ${name}`, () => fn(mk));
  }
}

/** DE: Führt Lua aus, wirft bei Fehler, liefert die Werte. EN: runs Lua, throws on error, returns the values. */
export function run(sim: WowSim, code: string): unknown[] {
  const r = sim.exec(code);
  if (!r.ok) throw new Error(`Lua error: ${r.error?.message}\n${sim.log.map((l) => l.kind + ": " + l.text).join("\n")}`);
  return r.values ?? [];
}
