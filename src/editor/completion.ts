/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Completion ......... Vorschlagstyp
 *   [S2] completeAt ......... Vorschläge an der Cursorposition
 *   [S3] signatureAt ........ Parameterhilfe innerhalb eines Funktionsaufrufs
 *
 * DE: Vorschläge kommen ausschließlich aus den Plugin-Daten des Ziels plus der Lua-Standard-
 *     bibliothek der Ziel-Version. Kontexte: Name, `Namespace.`, `obj:` (Widget-Methoden),
 *     Event-Namen in RegisterEvent("…"), Script-Namen in SetScript("…").
 * EN: Suggestions come only from the target's plugin data plus the Lua stdlib of the target
 *     version. Contexts: name, `Namespace.`, `obj:` (widget methods), event names in
 *     RegisterEvent("…"), script names in SetScript("…").
 */

import type { ResolvedTarget } from "../core/plugins.js";
import type { LocalizedText } from "../plugin-api/types.js";
import { targetStdlib } from "../analysis/api-check.js";

// ===== [S1] Completion =====

export interface Completion {
  label: string;
  kind: "function" | "event" | "method" | "script" | "keyword" | "variable" | "namespace";
  detail?: string;
  doc?: LocalizedText;
  /** Text, der eingefügt wird (ohne bereits getipptes Präfix). EN: text to insert, replacing the typed prefix. */
  insert: string;
}

const KEYWORDS = ["and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while"];

// ===== [S2] completeAt =====

export function completeAt(source: string, cursor: number, target: ResolvedTarget): { from: number; items: Completion[] } {
  const before = source.slice(0, cursor);

  // event names inside RegisterEvent("…")
  let m = /:?\s*(?:RegisterEvent|UnregisterEvent)\s*\(\s*(["'])([A-Z0-9_]*)$/.exec(before);
  if (m) {
    const prefix = m[2]!;
    const items = [...target.events.values()]
      .filter((e) => e.name.startsWith(prefix.toUpperCase()))
      .map<Completion>((e) => ({ label: e.name, kind: "event", doc: e.description, insert: e.name }));
    return { from: cursor - prefix.length, items };
  }
  // script names inside SetScript("…") / HookScript
  m = /:\s*(?:SetScript|HookScript|GetScript)\s*\(\s*(["'])(\w*)$/.exec(before);
  if (m) {
    const prefix = m[2]!;
    const names = new Set<string>();
    for (const w of target.widgets.values()) w.scripts.forEach((s) => names.add(s));
    const items = [...names].filter((n) => n.toLowerCase().startsWith(prefix.toLowerCase())).sort().map<Completion>((n) => ({ label: n, kind: "script", insert: n }));
    return { from: cursor - prefix.length, items };
  }
  // obj:method
  m = /:(\w*)$/.exec(before);
  if (m && !/::$/.test(before)) {
    const prefix = m[1]!;
    const methods = new Map<string, string>();
    for (const w of target.widgets.values()) for (const meth of w.methods) if (!methods.has(meth)) methods.set(meth, w.name);
    const items = [...methods]
      .filter(([n]) => n.toLowerCase().startsWith(prefix.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b))
      .map<Completion>(([n, w]) => ({ label: n, kind: "method", detail: w, insert: n }));
    return { from: cursor - prefix.length, items };
  }
  // Namespace.member
  m = /([A-Za-z_][\w]*)\.(\w*)$/.exec(before);
  if (m) {
    const ns = m[1]!;
    const prefix = m[2]!;
    const names = new Map<string, Completion>();
    for (const n of targetStdlib(target)) {
      if (n.startsWith(ns + ".")) {
        const member = n.slice(ns.length + 1);
        if (!member.includes(".")) names.set(member, { label: member, kind: "function", detail: "Lua", insert: member });
      }
    }
    for (const f of target.functions.values()) {
      if (f.name.startsWith(ns + ".")) {
        const member = f.name.slice(ns.length + 1);
        if (!member.includes(".")) names.set(member, { label: member, kind: "function", detail: signatureText(f.name, f.params), doc: f.description, insert: member });
      }
    }
    const items = [...names.values()].filter((c) => c.label.toLowerCase().startsWith(prefix.toLowerCase())).sort((a, b) => a.label.localeCompare(b.label));
    return { from: cursor - prefix.length, items };
  }
  // plain name
  m = /([A-Za-z_]\w*)$/.exec(before);
  const prefix = m ? m[1]! : "";
  if (!m) return { from: cursor, items: [] };
  const lower = prefix.toLowerCase();
  const items = new Map<string, Completion>();
  for (const k of KEYWORDS) if (k.startsWith(prefix)) items.set(k, { label: k, kind: "keyword", insert: k });
  for (const n of targetStdlib(target)) {
    const top = n.split(".")[0]!;
    if (top.toLowerCase().startsWith(lower) && !items.has(top)) items.set(top, { label: top, kind: n.includes(".") ? "namespace" : "function", detail: "Lua", insert: top });
  }
  for (const f of target.functions.values()) {
    const top = f.name.split(".")[0]!;
    if (!top.toLowerCase().startsWith(lower)) continue;
    if (f.name.includes(".")) {
      if (!items.has(top)) items.set(top, { label: top, kind: "namespace", insert: top });
    } else items.set(top, { label: top, kind: "function", detail: signatureText(f.name, f.params), doc: f.description, insert: top });
  }
  // identifiers already used in the document
  for (const w of source.match(/[A-Za-z_]\w*/g) ?? []) {
    if (w !== prefix && w.toLowerCase().startsWith(lower) && !items.has(w)) items.set(w, { label: w, kind: "variable", insert: w });
  }
  return { from: cursor - prefix.length, items: [...items.values()].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label)) };
}

function rank(c: Completion): number {
  return { function: 0, namespace: 1, keyword: 2, variable: 3, method: 4, event: 4, script: 4 }[c.kind];
}

function signatureText(name: string, params: { name: string; optional?: boolean }[]): string {
  return `${name}(${params.map((p) => (p.optional ? `[${p.name}]` : p.name)).join(", ")})`;
}

// ===== [S3] signatureAt =====

export interface SignatureHelp {
  name: string;
  label: string;
  activeParam: number;
  doc?: LocalizedText;
}

export function signatureAt(source: string, cursor: number, target: ResolvedTarget): SignatureHelp | undefined {
  const before = source.slice(0, cursor);
  let depth = 0;
  let commas = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const c = before[i]!;
    if (c === ")" || c === "}" || c === "]") depth++;
    else if (c === "{" || c === "[") {
      if (depth === 0) return undefined;
      depth--;
    } else if (c === "(") {
      if (depth === 0) {
        const m = /([A-Za-z_][\w.:]*)\s*$/.exec(before.slice(0, i));
        if (!m) return undefined;
        const name = m[1]!.replace(/^.*:/, "");
        const f = target.functions.get(m[1]!) ?? target.functions.get(name);
        if (!f) return undefined;
        return { name: f.name, label: signatureText(f.name, f.params), activeParam: commas, doc: f.description };
      }
      depth--;
    } else if (c === "," && depth === 0) commas++;
  }
  return undefined;
}
