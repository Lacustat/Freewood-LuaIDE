/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] I18n ........................ Kataloge, Sprache wählen, übersetzen (t), LocalizedText wählen (text)
 *   [S2] Hilfen · Helpers ............ normalizeLang, interpolate
 *
 * DE: Mehrsprachigkeit. Sprachen sind JSON-Kataloge (flache Schlüssel -> Text) und lassen sich
 *     jederzeit zur Laufzeit ergänzen (addCatalog / addCatalogJson). Rückfall: "de-at" -> "de" -> Ausweichsprache.
 * EN: Multi-language support. Languages are JSON catalogs (flat key -> text) and can be added
 *     at any time at runtime. Fallback: "de-at" -> "de" -> fallback language.
 */

import type { LocalizedText } from "../plugin-api/types.js";
import { FreewoodError } from "./errors.js";

// ===== [S2] Hilfen · Helpers =====

export function normalizeLang(lang: string): string {
  return lang.trim().toLowerCase().replace(/_/g, "-");
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

// ===== [S1] I18n =====

export class I18n {
  private readonly catalogs = new Map<string, Map<string, string>>();
  private readonly listeners = new Set<(lang: string) => void>();
  private readonly fallback: string;
  private current: string;

  constructor(fallbackLang = "en") {
    this.fallback = normalizeLang(fallbackLang);
    this.current = this.fallback;
  }

  /** DE: Fügt Texte einer Sprache hinzu (bestehende Schlüssel werden überschrieben). EN: adds texts for a language (existing keys are overwritten). */
  addCatalog(lang: string, messages: Record<string, string>): void {
    const code = normalizeLang(lang);
    let catalog = this.catalogs.get(code);
    if (!catalog) {
      catalog = new Map();
      this.catalogs.set(code, catalog);
    }
    for (const [key, value] of Object.entries(messages)) catalog.set(key, value);
  }

  /** DE: Wie addCatalog, aber aus JSON-Text (flaches Objekt aus Zeichenketten). EN: like addCatalog, but from JSON text (flat object of strings). */
  addCatalogJson(lang: string, json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new FreewoodError("I18N_JSON", `Invalid JSON for language "${lang}"`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new FreewoodError("I18N_SHAPE", `Catalog for "${lang}" must be a flat object`);
    }
    const messages: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") throw new FreewoodError("I18N_SHAPE", `Catalog "${lang}": value of "${key}" is not a string`);
      messages[key] = value;
    }
    this.addCatalog(lang, messages);
  }

  languages(): string[] {
    return [...this.catalogs.keys()].sort();
  }

  hasLanguage(lang: string): boolean {
    return this.catalogs.has(normalizeLang(lang));
  }

  get language(): string {
    return this.current;
  }

  setLanguage(lang: string): void {
    const code = normalizeLang(lang);
    if (!this.catalogs.has(code)) throw new FreewoodError("I18N_UNKNOWN_LANG", `Unknown language: ${lang}`);
    if (code === this.current) return;
    this.current = code;
    for (const listener of [...this.listeners]) listener(code);
  }

  onChange(listener: (lang: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** DE: Reihenfolge der Suche: Sprache, Basissprache, Ausweichsprache. EN: lookup order: language, base language, fallback. */
  private chain(lang: string): string[] {
    const code = normalizeLang(lang);
    const result = [code];
    const dash = code.indexOf("-");
    if (dash > 0) result.push(code.slice(0, dash));
    if (!result.includes(this.fallback)) result.push(this.fallback);
    return result;
  }

  /** DE: Übersetzt einen Schlüssel; fehlt er überall, kommt der Schlüssel selbst zurück. EN: translates a key; if missing everywhere, the key itself is returned. */
  t(key: string, params?: Record<string, string | number>, lang?: string): string {
    for (const code of this.chain(lang ?? this.current)) {
      const value = this.catalogs.get(code)?.get(key);
      if (value !== undefined) return interpolate(value, params);
    }
    return key;
  }

  /** DE: Wählt aus einem mehrsprachigen Text die beste Sprache. EN: picks the best language from a multi-language text. */
  text(value: LocalizedText | undefined, lang?: string): string {
    if (!value) return "";
    for (const code of this.chain(lang ?? this.current)) {
      const hit = value[code];
      if (hit !== undefined && hit !== "") return hit;
    }
    const first = Object.values(value).find((v) => v !== "");
    return first ?? "";
  }
}
