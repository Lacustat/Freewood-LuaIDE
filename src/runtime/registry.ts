/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] RuntimeRegistry ............. register, get, list, forLuaVersion
 *
 * DE: Verzeichnis der verfügbaren Lua-Laufzeiten. Die IDE fragt nach der Lua-Version des Ziels
 *     und bekommt die passende Laufzeit; so lässt sich 5.0.3 später ohne Umbau ergänzen.
 * EN: Registry of available Lua runtimes. The IDE asks for the target's Lua version and gets the
 *     matching runtime; this way 5.0.3 can be added later without rework.
 */

import { FreewoodError } from "../core/errors.js";
import type { EventBus, KernelEvents } from "../core/events.js";
import type { LuaVersion } from "../plugin-api/types.js";
import type { RuntimeFactory } from "./types.js";

// ===== [S1] RuntimeRegistry =====

export class RuntimeRegistry {
  private readonly factories = new Map<string, RuntimeFactory>();
  private readonly bus: EventBus<KernelEvents> | undefined;

  constructor(bus?: EventBus<KernelEvents>) {
    this.bus = bus;
  }

  register(factory: RuntimeFactory): void {
    if (this.factories.has(factory.id)) throw new FreewoodError("RUNTIME_DUPLICATE", `Runtime already registered: ${factory.id}`);
    this.factories.set(factory.id, factory);
    this.bus?.emit("runtime:registered", { id: factory.id });
  }

  get(id: string): RuntimeFactory | undefined {
    return this.factories.get(id);
  }

  list(): RuntimeFactory[] {
    return [...this.factories.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** DE: Alle Laufzeiten für eine Lua-Version (die zuerst registrierte ist die Standardwahl). EN: all runtimes for a Lua version (the first registered is the default choice). */
  forLuaVersion(version: LuaVersion): RuntimeFactory[] {
    return [...this.factories.values()].filter((f) => f.luaVersion === version);
  }
}
