/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] realLua50Syntax ... (+ loadLuaWasm, createRealEngine) prüft Quelltext mit der echten Lua-5.0-VM (WASM)
 *
 * DE: Lädt `runtimes/lua50/lua50.wasm` bei Bedarf einmal und nutzt `loadstring` der echten VM, um
 *     Syntaxfehler zu melden, die genau so im Spiel auftreten. Fehlt die Datei, wird still übersprungen.
 * EN: loads `runtimes/lua50/lua50.wasm` once on demand and uses the real VM's `loadstring` to report
 *     syntax errors exactly as the game would. If the file is missing the check is silently skipped.
 */

import { createWasm50Factory, createWasmEngine, type SimEngine, type Wasm50Runtime } from "../src/index.js";

// ===== [S1] realLua50Syntax =====

/** DE: Lädt die WASM-Datei der echten Lua-5.0-VM. EN: loads the WASM file of the real Lua 5.0 VM. */
export async function loadLuaWasm(): Promise<ArrayBuffer> {
  const r = await fetch("../runtimes/lua50/lua50.wasm");
  if (!r.ok) throw new Error(String(r.status));
  return r.arrayBuffer();
}

/** DE: Neue Engine für die Simulation auf der echten VM; null, wenn nicht ladbar. EN: new engine for the simulation on the real VM; null if it cannot be loaded. */
export async function createRealEngine(classic = false, version: "5.0" | "5.1" = "5.0"): Promise<SimEngine | null> {
  try {
    const file = version === "5.1" ? "lua51/lua51.wasm" : "lua50/lua50.wasm";
    return await createWasmEngine(async () => { const r = await fetch(`../runtimes/${file}`); if (!r.ok) throw new Error(`cannot load ${file}`); return r.arrayBuffer(); }, classic, version);
  } catch {
    return null;
  }
}

let runtime: Promise<Wasm50Runtime | null> | undefined;

function getRuntime(): Promise<Wasm50Runtime | null> {
  runtime ??= (async () => {
    try {
      const factory = createWasm50Factory(loadLuaWasm);
      return (await factory.create()) as Wasm50Runtime;
    } catch {
      return null;
    }
  })();
  return runtime;
}

/** DE: Liefert Zeile und Meldung des ersten Syntaxfehlers oder null. EN: line and message of the first syntax error, or null. */
export async function realLua50Syntax(source: string, chunk: string): Promise<{ line: number; message: string } | null> {
  const rt = await getRuntime();
  if (!rt) return null;
  rt.setGlobal("__fw_src", source);
  rt.setGlobal("__fw_chunk", `=${chunk}`);
  const r = rt.executeSync("local f, e = loadstring(__fw_src, __fw_chunk) return e", "=check");
  const msg = r.ok ? r.values[0] : undefined;
  if (typeof msg !== "string") return null;
  const m = /:(\d+): ([\s\S]*)$/.exec(msg);
  return { line: m ? Number(m[1]) : 1, message: m ? m[2]! : msg };
}
