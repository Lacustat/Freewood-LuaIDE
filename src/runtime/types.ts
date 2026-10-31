/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Ergebnis · Result ........... ExecResult, ExecError
 *   [S2] LuaRuntime .................. austauschbare Laufzeit (z. B. Lua 5.1 jetzt, Lua 5.0.3 später)
 *   [S3] RuntimeFactory .............. erzeugt Laufzeiten, beschreibt sie
 *
 * DE: Schnittstelle zwischen IDE und Lua-Ausführung (Simulation, Prüfung). Phase 1 enthält nur
 *     die Schnittstelle; Adapter (z. B. wasmoon-lua5.1, später eigene Lua-5.0.3-WASM-Laufzeit) folgen.
 * EN: Interface between the IDE and Lua execution (simulation, checking). Phase 1 contains only
 *     the interface; adapters (e.g. wasmoon-lua5.1, later an own Lua 5.0.3 WASM runtime) follow.
 */

import type { LocalizedText, LuaVersion } from "../plugin-api/types.js";

// ===== [S1] Ergebnis · Result =====

export interface ExecError {
  message: string;
  chunk?: string;
  line?: number;
}

export interface ExecResult {
  ok: boolean;
  /** DE: Rückgabewerte des Chunks. EN: return values of the chunk. */
  values: unknown[];
  error?: ExecError;
}

// ===== [S2] LuaRuntime =====

export interface LuaRuntime {
  readonly luaVersion: LuaVersion;
  /** DE: Führt Lua-Quelltext aus. Fehler im Skript kommen als `ok: false`, nicht als Ausnahme. EN: runs Lua source. Script errors come back as `ok: false`, not as exceptions. */
  execute(source: string, chunkName?: string): Promise<ExecResult>;
  setGlobal(name: string, value: unknown): void;
  getGlobal(name: string): unknown;
  /** DE: Stellt eine JS-Funktion als globale Lua-Funktion bereit (so entsteht die simulierte WoW-API). EN: exposes a JS function as a global Lua function (this is how the simulated WoW API is built). */
  registerFunction(name: string, fn: (...args: unknown[]) => unknown): void;
  dispose(): void;
}

// ===== [S3] RuntimeFactory =====

export interface RuntimeFactory {
  /** DE: Eindeutige ID, z. B. "wasmoon-lua51". EN: unique id. */
  readonly id: string;
  readonly luaVersion: LuaVersion;
  readonly name: LocalizedText;
  create(): Promise<LuaRuntime>;
}
