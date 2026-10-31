/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Kernel ...................... verbindet Ereignisse, Sprachen, Plugins, Laufzeiten, Projekte
 *
 * DE: Der Kernel ist der einzige Einstiegspunkt der Oberfläche in den Kern. Er hat keine Oberfläche
 *     und keine Abhängigkeit von Browser oder Node.
 * EN: The kernel is the single entry point from the UI into the core. It has no UI and
 *     no dependency on browser or Node.
 */

import { RuntimeRegistry } from "../runtime/registry.js";
import { FreewoodError } from "./errors.js";
import { EventBus, type KernelEvents } from "./events.js";
import { I18n } from "./i18n.js";
import { PluginRegistry } from "./plugins.js";
import { Project } from "./project.js";

// ===== [S1] Kernel =====

export class Kernel {
  readonly events = new EventBus<KernelEvents>();
  readonly i18n = new I18n("en");
  readonly plugins = new PluginRegistry(this.events);
  readonly runtimes = new RuntimeRegistry(this.events);

  constructor() {
    this.i18n.onChange((lang) => this.events.emit("language:changed", { lang }));
  }

  /** DE: Legt ein Projekt für ein registriertes Ziel-Plugin an. EN: creates a project for a registered target plugin. */
  createProject(name: string, targetId: string): Project {
    if (!this.plugins.has(targetId)) throw new FreewoodError("TARGET_UNKNOWN", `Unknown target plugin: ${targetId}`);
    return new Project(name, targetId);
  }
}
