/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Hilfen · Helpers ............ isRecord, issue, hasErrors, PluginError
 *   [S2] Texte und Parameter ......... checkText, checkParams
 *   [S3] Manifest prüfen ............. validateManifest
 *   [S4] Daten prüfen ................ validateData
 *   [S5] Gesamtprüfung ............... validatePlugin
 *
 * DE: Prüft Plugin-Manifeste und -Daten, ohne etwas zu werfen. Eingaben sind `unknown`
 *     (kommen aus JSON); jede Meldung hat einen stabilen Code und Text in de und en.
 * EN: Validates plugin manifests and data without throwing. Inputs are `unknown`
 *     (they come from JSON); every issue has a stable code and text in de and en.
 */

import type { LoadedPlugin, ValidationIssue } from "./types.js";

// ===== [S1] Hilfen · Helpers =====

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  path: string,
  de: string,
  en: string,
): ValidationIssue {
  return { severity, code, path, message: { de, en } };
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** DE: Fehler beim Laden/Registrieren/Auflösen eines Plugins. EN: error while loading/registering/resolving a plugin. */
export class PluginError extends Error {
  readonly code: string;
  readonly issues: ValidationIssue[];
  constructor(code: string, message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "PluginError";
    this.code = code;
    this.issues = issues;
  }
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DOTTED = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const EVENT_NAME = /^[A-Z][A-Z0-9_]*$/;
const PLUGIN_ID = /^[a-z0-9][a-z0-9.-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const DATA_FILE = /^[A-Za-z0-9_.-]+\.json$/;

// ===== [S2] Texte und Parameter =====

/** DE: Mehrsprachiger Text: `en` Pflicht (Fehler), `de` fehlt = Warnung. EN: `en` required (error), missing `de` = warning. */
function checkText(v: unknown, path: string, required: boolean, out: ValidationIssue[]): void {
  if (v === undefined) {
    if (required) out.push(issue("error", "PLG_TEXT_EN", path, "Text fehlt", "Text is missing"));
    return;
  }
  if (!isRecord(v)) {
    out.push(
      issue("error", "PLG_TEXT_TYPE", path, "Text muss ein Objekt { en, de, … } sein", "Text must be an object { en, de, … }"),
    );
    return;
  }
  for (const [lang, val] of Object.entries(v)) {
    if (typeof val !== "string") {
      out.push(issue("error", "PLG_TEXT_TYPE", `${path}.${lang}`, "Textwert muss eine Zeichenkette sein", "Text value must be a string"));
    }
  }
  if (typeof v.en !== "string" || v.en.trim() === "") {
    out.push(issue("error", "PLG_TEXT_EN", path, "Englischer Text (en) fehlt", "English text (en) is missing"));
  }
  if (typeof v.de !== "string" || v.de.trim() === "") {
    out.push(issue("warning", "PLG_TEXT_DE", path, "Deutscher Text (de) fehlt", "German text (de) is missing"));
  }
}

function checkParams(v: unknown, path: string, out: ValidationIssue[], checkOrder: boolean): void {
  if (!Array.isArray(v)) {
    out.push(issue("error", "PLG_PARAMS_TYPE", path, "Muss eine Liste sein", "Must be a list"));
    return;
  }
  let seenOptional = false;
  v.forEach((p: unknown, i: number) => {
    const here = `${path}[${i}]`;
    if (!isRecord(p)) {
      out.push(issue("error", "PLG_PARAM_TYPE", here, "Eintrag muss ein Objekt sein", "Entry must be an object"));
      return;
    }
    if (typeof p.name !== "string" || !(p.name === "..." || IDENT.test(p.name))) {
      out.push(issue("error", "PLG_PARAM_NAME", `${here}.name`, "Ungültiger Parametername", "Invalid parameter name"));
    }
    if (typeof p.type !== "string" || p.type.trim() === "") {
      out.push(issue("error", "PLG_PARAM_TYPE", `${here}.type`, "Typ fehlt", "Type is missing"));
    }
    if (p.optional !== undefined && typeof p.optional !== "boolean") {
      out.push(issue("error", "PLG_PARAM_OPTIONAL", `${here}.optional`, "optional muss true/false sein", "optional must be true/false"));
    }
    if (checkOrder) {
      if (p.optional === true) seenOptional = true;
      else if (seenOptional) {
        out.push(
          issue("warning", "PLG_PARAM_ORDER", here, "Pflichtparameter nach optionalem Parameter", "Required parameter after an optional one"),
        );
      }
    }
    if (p.description !== undefined) checkText(p.description, `${here}.description`, false, out);
  });
}

// ===== [S3] Manifest prüfen =====

export function validateManifest(raw: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!isRecord(raw)) {
    out.push(issue("error", "PLG_MANIFEST_TYPE", "", "Manifest muss ein Objekt sein", "Manifest must be an object"));
    return out;
  }
  if (raw.schema !== 1) {
    out.push(issue("error", "PLG_SCHEMA", "schema", "schema muss 1 sein", "schema must be 1"));
  }
  if (typeof raw.id !== "string" || !PLUGIN_ID.test(raw.id)) {
    out.push(
      issue("error", "PLG_ID", "id", "id: nur a-z, 0-9, Punkt und Bindestrich, beginnt mit Buchstabe/Ziffer", "id: only a-z, 0-9, dot and hyphen, starts with a letter/digit"),
    );
  }
  if (typeof raw.version !== "string" || !SEMVER.test(raw.version)) {
    out.push(issue("error", "PLG_VERSION", "version", "version muss X.Y.Z sein", "version must be X.Y.Z"));
  }
  checkText(raw.name, "name", true, out);
  checkText(raw.description, "description", true, out);
  for (const key of ["author", "license"] as const) {
    if (typeof raw[key] !== "string" || (raw[key] as string).trim() === "") {
      out.push(issue("error", "PLG_FIELD", key, `${key} fehlt`, `${key} is missing`));
    }
  }
  if (raw.luaVersion !== "5.0" && raw.luaVersion !== "5.1") {
    out.push(issue("error", "PLG_LUA", "luaVersion", 'luaVersion muss "5.0" oder "5.1" sein', 'luaVersion must be "5.0" or "5.1"'));
  }
  if (raw.syntax !== "lua50" && raw.syntax !== "lua51-transpiled" && raw.syntax !== "lua51") {
    out.push(issue("error", "PLG_SYNTAX", "syntax", "Unbekannte Syntaxstufe", "Unknown syntax level"));
  }
  if (raw.scriptArgs !== "globals" && raw.scriptArgs !== "arguments" && raw.scriptArgs !== "both") {
    out.push(issue("error", "PLG_SCRIPT_ARGS", "scriptArgs", 'scriptArgs: "globals", "arguments" oder "both"', 'scriptArgs: "globals", "arguments" or "both"'));
  }
  if ((raw.luaVersion === "5.0" && raw.syntax !== "lua50") || (raw.luaVersion === "5.1" && raw.syntax === "lua50")) {
    out.push(issue("error", "PLG_SYNTAX_MISMATCH", "syntax", "luaVersion und syntax passen nicht zusammen", "luaVersion and syntax do not match"));
  }
  if (raw.interfaceVersion !== undefined && !Number.isInteger(raw.interfaceVersion)) {
    out.push(issue("error", "PLG_INTERFACE", "interfaceVersion", "interfaceVersion muss eine ganze Zahl sein", "interfaceVersion must be an integer"));
  }
  if (raw.extends !== undefined) {
    if (!Array.isArray(raw.extends) || raw.extends.some((e: unknown) => typeof e !== "string")) {
      out.push(issue("error", "PLG_EXTENDS", "extends", "extends muss eine Liste von Plugin-IDs sein", "extends must be a list of plugin ids"));
    } else if (raw.extends.includes(raw.id as string)) {
      out.push(issue("error", "PLG_EXTENDS_SELF", "extends", "Ein Plugin darf sich nicht selbst erweitern", "A plugin must not extend itself"));
    }
  }
  if (!isRecord(raw.files)) {
    out.push(issue("error", "PLG_FILES", "files", "files muss ein Objekt sein", "files must be an object"));
  } else {
    for (const [key, name] of Object.entries(raw.files)) {
      if (!["functions", "events", "widgets", "layers"].includes(key)) {
        out.push(issue("warning", "PLG_FILES_KEY", `files.${key}`, "Unbekannter Schlüssel", "Unknown key"));
      }
      if (typeof name !== "string" || !DATA_FILE.test(name)) {
        out.push(
          issue("error", "PLG_FILES_NAME", `files.${key}`, "Nur Dateinamen auf .json erlaubt, keine Pfade", "Only .json file names allowed, no paths"),
        );
      }
    }
  }
  if (raw.removes !== undefined) {
    if (!isRecord(raw.removes)) {
      out.push(issue("error", "PLG_REMOVES", "removes", "removes muss ein Objekt sein", "removes must be an object"));
    } else {
      for (const key of ["functions", "events", "widgets"]) {
        const list = raw.removes[key];
        if (list !== undefined && (!Array.isArray(list) || list.some((e: unknown) => typeof e !== "string"))) {
          out.push(issue("error", "PLG_REMOVES", `removes.${key}`, "Muss eine Liste von Namen sein", "Must be a list of names"));
        }
      }
    }
  }
  if (raw.sources !== undefined) {
    if (!Array.isArray(raw.sources)) {
      out.push(issue("error", "PLG_SOURCES", "sources", "sources muss eine Liste sein", "sources must be a list"));
    } else {
      raw.sources.forEach((s: unknown, i: number) => {
        if (!isRecord(s) || typeof s.title !== "string" || typeof s.url !== "string" || typeof s.license !== "string") {
          out.push(issue("error", "PLG_SOURCES", `sources[${i}]`, "Quelle braucht title, url und license", "Source needs title, url and license"));
        }
      });
    }
  }
  return out;
}

// ===== [S4] Daten prüfen =====

function checkNamedList(
  raw: unknown,
  key: string,
  out: ValidationIssue[],
  checkEntry: (entry: Record<string, unknown>, path: string) => void,
  namePattern: RegExp,
  nameCode: string,
): void {
  if (!Array.isArray(raw)) {
    out.push(issue("error", "PLG_LIST", key, "Muss eine Liste sein", "Must be a list"));
    return;
  }
  const seen = new Set<string>();
  raw.forEach((entry: unknown, i: number) => {
    const path = `${key}[${i}]`;
    if (!isRecord(entry)) {
      out.push(issue("error", "PLG_ENTRY", path, "Eintrag muss ein Objekt sein", "Entry must be an object"));
      return;
    }
    const name = entry.name;
    if (typeof name !== "string" || !namePattern.test(name)) {
      out.push(issue("error", nameCode, `${path}.name`, "Ungültiger Name", "Invalid name"));
    } else if (seen.has(name)) {
      out.push(issue("error", "PLG_DUPLICATE", `${path}.name`, `Doppelter Name: ${name}`, `Duplicate name: ${name}`));
    } else {
      seen.add(name);
    }
    if (entry.description !== undefined) checkText(entry.description, `${path}.description`, false, out);
    checkEntry(entry, path);
  });
}

function checkStringList(v: unknown, path: string, out: ValidationIssue[]): void {
  if (!Array.isArray(v) || v.some((s: unknown) => typeof s !== "string" || s === "")) {
    out.push(issue("error", "PLG_STRING_LIST", path, "Muss eine Liste nicht leerer Zeichenketten sein", "Must be a list of non-empty strings"));
  }
}

export function validateData(raw: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!isRecord(raw)) {
    out.push(issue("error", "PLG_DATA_TYPE", "", "Daten müssen ein Objekt sein", "Data must be an object"));
    return out;
  }
  checkNamedList(
    raw.functions,
    "functions",
    out,
    (e, path) => {
      checkParams(e.params, `${path}.params`, out, true);
      checkParams(e.returns, `${path}.returns`, out, false);
      if (e.tags !== undefined) checkStringList(e.tags, `${path}.tags`, out);
    },
    DOTTED,
    "PLG_FUNC_NAME",
  );
  checkNamedList(
    raw.events,
    "events",
    out,
    (e, path) => checkParams(e.payload, `${path}.payload`, out, false),
    EVENT_NAME,
    "PLG_EVENT_NAME",
  );
  checkNamedList(
    raw.widgets,
    "widgets",
    out,
    (e, path) => {
      checkStringList(e.scripts, `${path}.scripts`, out);
      checkStringList(e.methods, `${path}.methods`, out);
      if (e.inherits !== undefined && (typeof e.inherits !== "string" || !IDENT.test(e.inherits))) {
        out.push(issue("error", "PLG_WIDGET_INHERITS", `${path}.inherits`, "Ungültiger Name", "Invalid name"));
      }
    },
    IDENT,
    "PLG_WIDGET_NAME",
  );
  if (raw.layers !== undefined) {
    if (!isRecord(raw.layers)) {
      out.push(issue("error", "PLG_LAYERS", "layers", "layers muss ein Objekt sein", "layers must be an object"));
    } else {
      checkStringList(raw.layers.frameStrata, "layers.frameStrata", out);
      checkStringList(raw.layers.drawLayers, "layers.drawLayers", out);
    }
  }
  return out;
}

// ===== [S5] Gesamtprüfung =====

export function validatePlugin(plugin: LoadedPlugin): ValidationIssue[] {
  return [...validateManifest(plugin.manifest), ...validateData(plugin.data)];
}
