/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Typen · types ............... BindingFinding, ParsedBinding
 *   [S2] parseBindingsXml ............ <Binding>-Einträge mit Zeile lesen · read <Binding> entries with line
 *   [S3] stringGlobals ............... Text-Globals aus den Lua-Dateien · string globals from the Lua files
 *   [S4] checkBindings ............... Prüfung · check
 *
 * DE: Prüft die Bindings.xml eines Addons (Forever_Failure F-12, F-29):
 *     - fehlende Namen BINDING_NAME_<name> (Warnung) und Kopfzeilen BINDING_HEADER_<header> (Hinweis);
 *     - in welchem Bereich von Optionen > Tastaturbelegung die Einträge landen. Das Spiel nennt einen Bereich
 *       nach _G[category], wenn das ein Text ist, sonst nach dem Namen selbst
 *       (Blizzard_SettingsDefinitions_Frame/Keybindings.lua, GetBindingCategoryName). "ADDONS" = "AddOns".
 *       Eigener Bereich: category="BINDING_CATEGORY_<X>" und in Lua BINDING_CATEGORY_<X> = "Text".
 *       Ohne Text-Global zeigt das Menü den rohen Namen (Warnung);
 *     - Hinweis: Bindings.xml wird nur beim Spielstart gelesen, /reload reicht nicht.
 * EN: Checks an addon's Bindings.xml: missing BINDING_NAME_/BINDING_HEADER_ globals, the section in
 *     Options > Key Bindings (the game uses _G[category] if it is a string, else the raw name), restart hint.
 */

import type { LocalizedText } from "../plugin-api/types.js";

// ===== [S1] Typen · types =====

export interface BindingFinding {
  severity: "error" | "warning" | "info";
  line: number;
  code: "BINDINGS_NAME_MISSING" | "BINDINGS_HEADER_MISSING" | "BINDINGS_CATEGORY" | "BINDINGS_CATEGORY_RAW" | "BINDINGS_RESTART";
  message: LocalizedText;
}

export interface ParsedBinding { name: string; header?: string; category?: string; line: number }

// Texte der Spiel-Globals, die das Menü für bekannte Bereiche nutzt
const GAME_CATEGORIES: Record<string, { de: string; en: string }> = {
  ADDONS: { de: "AddOns", en: "AddOns" },
};

// ===== [S2] parseBindingsXml =====

export function parseBindingsXml(xml: string): ParsedBinding[] {
  const out: ParsedBinding[] = [];
  const re = /<Binding\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? "";
    const get = (k: string): string | undefined => {
      const a = new RegExp(`\\b${k}\\s*=\\s*"([^"]*)"`).exec(attrs) ?? new RegExp(`\\b${k}\\s*=\\s*'([^']*)'`).exec(attrs);
      return a ? a[1] : undefined;
    };
    const name = get("name");
    if (!name) continue;
    const line = xml.slice(0, m.index).split("\n").length;
    out.push({ name, header: get("header"), category: get("category"), line });
  }
  return out;
}

// ===== [S3] stringGlobals =====

// Globale Zuweisungen GROSS_NAME = ... mit einem Text (auch "de and "x" or "y""); Rückgabe Name -> erster Text
export function stringGlobals(sources: { file: string; code: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^[ \t]*(?:_G\.)?([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*([^\n]*)/gm;
  for (const s of sources) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s.code))) {
      const name = m[1]!;
      const rhs = m[2] ?? "";
      const str = /"([^"]*)"|'([^']*)'/.exec(rhs);
      if (str && !out.has(name)) out.set(name, str[1] ?? str[2] ?? "");
    }
  }
  return out;
}

// ===== [S4] checkBindings =====

export function checkBindings(xml: string, sources: { file: string; code: string }[]): BindingFinding[] {
  const list = parseBindingsXml(xml);
  const globals = stringGlobals(sources);
  const out: BindingFinding[] = [];
  if (list.length === 0) return out;
  for (const b of list) {
    if (!globals.has(`BINDING_NAME_${b.name}`)) {
      out.push({ severity: "warning", line: b.line, code: "BINDINGS_NAME_MISSING",
        message: { de: `Kein Text BINDING_NAME_${b.name}: das Menü zeigt den rohen Namen ${b.name}.`, en: `No text BINDING_NAME_${b.name}: the menu shows the raw name ${b.name}.` } });
    }
    if (b.header && !globals.has(`BINDING_HEADER_${b.header}`)) {
      out.push({ severity: "info", line: b.line, code: "BINDINGS_HEADER_MISSING",
        message: { de: `Kein Text BINDING_HEADER_${b.header} (das heutige Menü zeigt Kopfzeilen nur als Abstand).`, en: `No text BINDING_HEADER_${b.header} (today's menu shows headers only as a spacer).` } });
    }
  }
  // Bereiche: je Kategorie einmal melden
  const seen = new Set<string>();
  for (const b of list) {
    const cat = b.category ?? "";
    if (seen.has(cat)) continue;
    seen.add(cat);
    if (!b.category) {
      out.push({ severity: "info", line: b.line, code: "BINDINGS_CATEGORY",
        message: { de: "Ohne category: die Einträge landen im Bereich „Sonstiges“.", en: "No category: the entries land in the section \"Other\"." } });
      continue;
    }
    const game = GAME_CATEGORIES[b.category];
    const own = globals.get(b.category);
    if (game) {
      out.push({ severity: "info", line: b.line, code: "BINDINGS_CATEGORY",
        message: { de: `Bereich im Menü: „${game.de}“. Eigener Bereich: category="BINDING_CATEGORY_<NAME>" und in Lua BINDING_CATEGORY_<NAME> = "Text".`,
          en: `Section in the menu: "${game.en}". Own section: category="BINDING_CATEGORY_<NAME>" and in Lua BINDING_CATEGORY_<NAME> = "text".` } });
    } else if (own !== undefined) {
      out.push({ severity: "info", line: b.line, code: "BINDINGS_CATEGORY",
        message: { de: `Bereich im Menü: „${own}“ (aus ${b.category}).`, en: `Section in the menu: "${own}" (from ${b.category}).` } });
    } else {
      out.push({ severity: "warning", line: b.line, code: "BINDINGS_CATEGORY_RAW",
        message: { de: `Kein Text für category "${b.category}": das Menü zeigt den rohen Namen. In Lua ${b.category} = "Text" setzen (am besten mit Vorsilbe BINDING_CATEGORY_).`,
          en: `No text for category "${b.category}": the menu shows the raw name. Set ${b.category} = "text" in Lua (best with the prefix BINDING_CATEGORY_).` } });
    }
  }
  out.push({ severity: "info", line: 1, code: "BINDINGS_RESTART",
    message: { de: "Bindings.xml liest das Spiel nur beim Start: nach Änderungen das Spiel neu starten, /reload reicht nicht (F-12).",
      en: "The game reads Bindings.xml only at start-up: restart the game after changes, /reload is not enough (F-12)." } });
  return out;
}
