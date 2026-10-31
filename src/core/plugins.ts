/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] ResolvedTarget .............. fertig zusammengeführte Zielplattform
 *   [S2] PluginRegistry .............. register, unregister, get, list, resolve, validateAll
 *   [S3] Zusammenführen · Merging .... linearize (Reihenfolge der Basen), mergeWidget
 *
 * DE: Verwaltet Plugins und löst `extends` auf: Basis-Plugins zuerst, dann das eigene Plugin
 *     (entfernt zuerst `removes`, fügt dann hinzu). Gleichnamige Funktionen/Events werden ersetzt,
 *     gleichnamige Widgets vereinigt (Methoden und Scripts).
 * EN: Manages plugins and resolves `extends`: base plugins first, then the plugin itself
 *     (applies `removes` first, then adds). Same-named functions/events are replaced,
 *     same-named widgets are merged (methods and scripts).
 */

import type {
  ApiEvent,
  ApiFunction,
  LayerData,
  LoadedPlugin,
  LuaVersion,
  PluginManifest,
  ScriptArgsStyle,
  SyntaxLevel,
  ValidationIssue,
  WidgetType,
} from "../plugin-api/types.js";
import { PluginError, hasErrors, validatePlugin } from "../plugin-api/validate.js";
import type { EventBus, KernelEvents } from "./events.js";

// ===== [S1] ResolvedTarget =====

export interface ResolvedTarget {
  id: string;
  /** DE: Plugin-IDs, Basis zuerst, das Ziel selbst zuletzt. EN: plugin ids, bases first, the target itself last. */
  chain: string[];
  luaVersion: LuaVersion;
  syntax: SyntaxLevel;
  scriptArgs: ScriptArgsStyle;
  clientBuild?: string;
  interfaceVersion?: number;
  functions: ReadonlyMap<string, ApiFunction>;
  events: ReadonlyMap<string, ApiEvent>;
  widgets: ReadonlyMap<string, WidgetType>;
  layers: LayerData;
}

// ===== [S3] Zusammenführen · Merging =====

function mergeUnique(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

function mergeWidget(base: WidgetType | undefined, next: WidgetType): WidgetType {
  if (!base) return { ...next, scripts: [...next.scripts], methods: [...next.methods] };
  return {
    name: next.name,
    inherits: next.inherits ?? base.inherits,
    scripts: mergeUnique(base.scripts, next.scripts),
    methods: mergeUnique(base.methods, next.methods),
    description: next.description ?? base.description,
  };
}

// ===== [S2] PluginRegistry =====

export class PluginRegistry {
  private readonly plugins = new Map<string, LoadedPlugin>();
  private readonly cache = new Map<string, ResolvedTarget>();
  private readonly bus: EventBus<KernelEvents> | undefined;

  constructor(bus?: EventBus<KernelEvents>) {
    this.bus = bus;
  }

  /** DE: Registriert ein Plugin (wird erneut geprüft). Doppelte ID -> Fehler, außer `replace`. EN: registers a plugin (validated again). Duplicate id -> error unless `replace`. */
  register(plugin: LoadedPlugin, options: { replace?: boolean } = {}): void {
    const issues = validatePlugin(plugin);
    if (hasErrors(issues)) throw new PluginError("PLG_INVALID", `Invalid plugin: ${plugin.manifest?.id ?? "?"}`, issues);
    const id = plugin.manifest.id;
    if (this.plugins.has(id) && !options.replace) {
      throw new PluginError("PLG_DUPLICATE_ID", `Plugin already registered: ${id}`);
    }
    this.plugins.set(id, plugin);
    this.cache.clear();
    this.bus?.emit("plugin:registered", { id });
  }

  /** DE: Entfernt ein Plugin; verweigert, wenn ein anderes es erweitert. EN: removes a plugin; refuses if another one extends it. */
  unregister(id: string): void {
    if (!this.plugins.has(id)) throw new PluginError("PLG_UNKNOWN", `Unknown plugin: ${id}`);
    for (const other of this.plugins.values()) {
      if (other.manifest.id !== id && other.manifest.extends?.includes(id)) {
        throw new PluginError("PLG_IN_USE", `Plugin ${id} is extended by ${other.manifest.id}`);
      }
    }
    this.plugins.delete(id);
    this.cache.clear();
    this.bus?.emit("plugin:unregistered", { id });
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  get(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): PluginManifest[] {
    return [...this.plugins.values()].map((p) => p.manifest).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** DE: Reihenfolge Basis -> Ziel, ohne Doppelte; erkennt Zyklen und fehlende Basen. EN: order base -> target without duplicates; detects cycles and missing bases. */
  private linearize(id: string, visiting: string[] = [], done: string[] = []): string[] {
    if (visiting.includes(id)) {
      throw new PluginError("PLG_CYCLE", `Plugin cycle: ${[...visiting, id].join(" -> ")}`);
    }
    const plugin = this.plugins.get(id);
    if (!plugin) {
      const from = visiting[visiting.length - 1];
      throw new PluginError("PLG_MISSING_BASE", from ? `Plugin ${from} needs missing plugin ${id}` : `Unknown plugin: ${id}`);
    }
    for (const base of plugin.manifest.extends ?? []) this.linearize(base, [...visiting, id], done);
    if (!done.includes(id)) done.push(id);
    return done;
  }

  /** DE: Führt ein Plugin mit allen Basen zusammen (zwischengespeichert). EN: merges a plugin with all its bases (cached). */
  resolve(id: string): ResolvedTarget {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const chain = this.linearize(id);
    const functions = new Map<string, ApiFunction>();
    const events = new Map<string, ApiEvent>();
    const widgets = new Map<string, WidgetType>();
    let layers: LayerData = { frameStrata: [], drawLayers: [] };

    for (const pluginId of chain) {
      const plugin = this.plugins.get(pluginId) as LoadedPlugin;
      const removes = plugin.manifest.removes;
      for (const name of removes?.functions ?? []) functions.delete(name);
      for (const name of removes?.events ?? []) events.delete(name);
      for (const name of removes?.widgets ?? []) widgets.delete(name);
      for (const fn of plugin.data.functions) functions.set(fn.name, fn);
      for (const ev of plugin.data.events) events.set(ev.name, ev);
      for (const w of plugin.data.widgets) widgets.set(w.name, mergeWidget(widgets.get(w.name), w));
      if (plugin.data.layers) layers = plugin.data.layers;
    }

    this.checkWidgetInheritance(id, widgets);

    const own = (this.plugins.get(id) as LoadedPlugin).manifest;
    const resolved: ResolvedTarget = {
      id,
      chain,
      luaVersion: own.luaVersion,
      syntax: own.syntax,
      scriptArgs: own.scriptArgs,
      ...(own.clientBuild !== undefined ? { clientBuild: own.clientBuild } : {}),
      ...(own.interfaceVersion !== undefined ? { interfaceVersion: own.interfaceVersion } : {}),
      functions,
      events,
      widgets,
      layers,
    };
    this.cache.set(id, resolved);
    return resolved;
  }

  private checkWidgetInheritance(targetId: string, widgets: ReadonlyMap<string, WidgetType>): void {
    for (const widget of widgets.values()) {
      const seen = new Set<string>([widget.name]);
      let parent = widget.inherits;
      while (parent !== undefined) {
        const next = widgets.get(parent);
        if (!next) {
          throw new PluginError("PLG_WIDGET_INHERIT", `${targetId}: widget ${widget.name} inherits unknown widget ${parent}`);
        }
        if (seen.has(next.name)) {
          throw new PluginError("PLG_WIDGET_CYCLE", `${targetId}: widget inheritance cycle at ${next.name}`);
        }
        seen.add(next.name);
        parent = next.inherits;
      }
    }
  }

  /** DE: Löst jedes Plugin auf und sammelt alle Fehler (für die Oberfläche). EN: resolves every plugin and collects all errors (for the UI). */
  validateAll(): ValidationIssue[] {
    const out: ValidationIssue[] = [];
    for (const manifest of this.list()) {
      try {
        this.resolve(manifest.id);
      } catch (error) {
        if (error instanceof PluginError) {
          out.push({
            severity: "error",
            code: error.code,
            path: manifest.id,
            message: { en: error.message, de: error.message },
          });
        } else {
          throw error;
        }
      }
    }
    return out;
  }

  /** DE: Sucht eine Funktion im aufgelösten Ziel. EN: looks up a function in the resolved target. */
  findFunction(targetId: string, name: string): ApiFunction | undefined {
    return this.resolve(targetId).functions.get(name);
  }
}
