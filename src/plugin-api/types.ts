/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Sprachen · Languages ........ LangCode, LocalizedText
 *   [S2] Manifest .................... LuaVersion, SyntaxLevel, ScriptArgsStyle, PluginManifest
 *   [S3] API-Daten · API data ........ ApiParam, ApiFunction, ApiEvent, WidgetType, LayerData, PluginData
 *   [S4] Geladenes Plugin ............ LoadedPlugin
 *   [S5] Prüfmeldungen · Issues ...... ValidationIssue
 *
 * DE: Reine Typen des Plugin-Formats (keine Logik). Beschreibung: docs/PLUGIN-FORMAT.md
 * EN: Pure types of the plugin format (no logic). Description: docs/PLUGIN-FORMAT.md
 */

// ===== [S1] Sprachen · Languages =====

/** DE: Sprachcode, klein geschrieben, z. B. "de", "en", "de-at". EN: language code, lower case. */
export type LangCode = string;

/** DE: Text in mehreren Sprachen, z. B. { en: "Hello", de: "Hallo" }. `en` ist Pflicht. EN: multi-language text, `en` is required. */
export type LocalizedText = Record<LangCode, string>;

// ===== [S2] Manifest =====

/** DE: Lua-Sprachstufe des Ziels. EN: Lua language level of the target. */
export type LuaVersion = "5.0" | "5.1";

/**
 * DE: Wie 5.1-Syntax ausgeführt wird.
 *  - lua50: reines Lua 5.0 (Vanilla-Client ohne DLL)
 *  - lua51-transpiled: 5.1-Syntax, die eine DLL (ClassicAPI) vor dem Kompilieren umschreibt; die VM bleibt 5.0
 *  - lua51: echtes Lua 5.1 (Retail)
 * EN: How 5.1 syntax is executed. lua50 = plain Lua 5.0; lua51-transpiled = 5.1 syntax rewritten by a DLL
 *     (ClassicAPI) before compiling, the VM stays 5.0; lua51 = real Lua 5.1 (retail).
 */
export type SyntaxLevel = "lua50" | "lua51-transpiled" | "lua51";

/**
 * DE: Wie Event- und Script-Handler ihre Werte bekommen.
 *  - globals: über die Globals `this`, `event`, `arg1`…`arg9` (Vanilla)
 *  - arguments: als Funktionsargumente `(self, ...)` (Retail)
 *  - both: beides (ClassicAPI mit modernen Script-Argumenten)
 * EN: How event and script handlers receive their values: via globals (vanilla), via arguments (retail), or both (ClassicAPI).
 */
export type ScriptArgsStyle = "globals" | "arguments" | "both";

/** DE: Quellenangabe für Namen/Strukturen. EN: source credit for names/structures. */
export interface PluginSource {
  title: string;
  url: string;
  license: string;
}

/** DE: Dateinamen der Datendateien im Plugin-Ordner (nur Dateinamen, keine Pfade). EN: data file names inside the plugin folder (names only, no paths). */
export interface PluginDataFiles {
  functions?: string;
  events?: string;
  widgets?: string;
  layers?: string;
}

/** DE: Einträge, die ein Plugin aus seinen Basis-Plugins entfernt. EN: entries a plugin removes from its base plugins. */
export interface PluginRemovals {
  functions?: string[];
  events?: string[];
  widgets?: string[];
}

export interface PluginManifest {
  /** DE: Version des Manifest-Formats, derzeit 1. EN: manifest format version, currently 1. */
  schema: 1;
  /** DE: Eindeutige Kennung, z. B. "vanilla-1.12". EN: unique id. */
  id: string;
  /** DE: Plugin-Version "X.Y.Z". EN: plugin version. */
  version: string;
  name: LocalizedText;
  description: LocalizedText;
  author: string;
  license: string;
  luaVersion: LuaVersion;
  syntax: SyntaxLevel;
  scriptArgs: ScriptArgsStyle;
  /** DE: Client-Build, z. B. "1.12.1". EN: client build. */
  clientBuild?: string;
  /** DE: Wert für `## Interface:` in der .toc, z. B. 11200. EN: value for `## Interface:` in the .toc. */
  interfaceVersion?: number;
  /** DE: Basis-Plugins; ihre Daten werden zuerst geladen. EN: base plugins; their data is loaded first. */
  extends?: string[];
  removes?: PluginRemovals;
  files: PluginDataFiles;
  sources?: PluginSource[];
}

// ===== [S3] API-Daten · API data =====

export interface ApiParam {
  name: string;
  /** DE: freier Typname, z. B. "string", "number", "UnitToken". EN: free-form type name. */
  type: string;
  optional?: boolean;
  description?: LocalizedText;
}

export interface ApiFunction {
  /** DE: Name, auch mit Punkten (z. B. "C_Timer.After"). EN: name, dotted names allowed. */
  name: string;
  /** DE: Gruppe/System für die Anzeige. EN: group/system for display. */
  system?: string;
  params: ApiParam[];
  returns: ApiParam[];
  description?: LocalizedText;
  /** DE: Hinweis, ab wann es das gibt (frei). EN: free-form note on availability. */
  since?: string;
  tags?: string[];
}

export interface ApiEvent {
  /** DE: GROSSBUCHSTABEN_MIT_UNTERSTRICH. EN: UPPER_SNAKE_CASE. */
  name: string;
  /** DE: Nutzdaten in der Reihenfolge arg1, arg2, … bzw. der Funktionsargumente. EN: payload in order (arg1, arg2, … or function arguments). */
  payload: ApiParam[];
  description?: LocalizedText;
}

export interface WidgetType {
  name: string;
  inherits?: string;
  /** DE: Script-Handler, z. B. "OnEvent". EN: script handlers. */
  scripts: string[];
  /** DE: Methodennamen. EN: method names. */
  methods: string[];
  description?: LocalizedText;
}

/** DE: Ebenen für den Forms-Editor. EN: layers for the forms editor. */
export interface LayerData {
  /** DE: Frame-Strata von unten nach oben. EN: frame strata, bottom to top. */
  frameStrata: string[];
  /** DE: Zeichenebenen von hinten nach vorne. EN: draw layers, back to front. */
  drawLayers: string[];
}

export interface PluginData {
  functions: ApiFunction[];
  events: ApiEvent[];
  widgets: WidgetType[];
  layers?: LayerData;
}

// ===== [S4] Geladenes Plugin =====

export interface LoadedPlugin {
  manifest: PluginManifest;
  data: PluginData;
}

// ===== [S5] Prüfmeldungen · Issues =====

export interface ValidationIssue {
  severity: "error" | "warning";
  /** DE: Stabiler Code, z. B. "PLG_ID". EN: stable code. */
  code: string;
  /** DE: Ort der Meldung, z. B. "functions[3].name". EN: location. */
  path: string;
  message: LocalizedText;
}
