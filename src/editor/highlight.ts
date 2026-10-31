/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Span ............. Farbbereich
 *   [S2] highlightLua ..... fehlertolerante Lua-Einfärbung (zeilenweise Zustände für lange Strings)
 *   [S3] highlightXml ..... einfache XML-Einfärbung
 *   [S4] toHtml ........... Spans → HTML (escaped)
 *
 * DE: Fehlertolerant (der Lexer der Sprache bricht bei Fehlern ab, ein Editor darf das nicht).
 * EN: error tolerant (the language lexer aborts on errors, an editor must not).
 */

// ===== [S1] Span =====

export type SpanClass = "kw" | "str" | "num" | "com" | "fn" | "op" | "txt" | "tag" | "attr";
export interface Span {
  cls: SpanClass;
  text: string;
}

const KW = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in", "local", "nil",
  "not", "or", "repeat", "return", "then", "true", "until", "while",
]);

// ===== [S2] highlightLua =====

export function highlightLua(src: string): Span[] {
  const out: Span[] = [];
  let i = 0;
  const push = (cls: SpanClass, text: string) => {
    if (text) out.push({ cls, text });
  };
  const longEnd = (from: number, level: number): number => {
    const close = "]" + "=".repeat(level) + "]";
    const e = src.indexOf(close, from);
    return e < 0 ? src.length : e + close.length;
  };
  const longOpen = (at: number): number => {
    const m = /^\[(=*)\[/.exec(src.slice(at, at + 40));
    return m ? m[1]!.length : -1;
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === "-" && src[i + 1] === "-") {
      const lvl = longOpen(i + 2);
      const end = lvl >= 0 ? longEnd(i + 2 + lvl + 2, lvl) : (src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i));
      push("com", src.slice(i, end));
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      if (src[j] === c) j++;
      push("str", src.slice(i, Math.min(j, src.length)));
      i = Math.min(j, src.length);
    } else if (c === "[" && longOpen(i) >= 0) {
      const lvl = longOpen(i);
      const end = longEnd(i + lvl + 2, lvl);
      push("str", src.slice(i, end));
      i = end;
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?|\d+\.)/.exec(src.slice(i))!;
      push("num", m[0]);
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const w = m[0];
      const after = src.slice(i + w.length).match(/^\s*[("'{]/);
      push(KW.has(w) ? "kw" : after ? "fn" : "txt", w);
      i += w.length;
    } else if (/[+\-*/%^#<>=~.:,;(){}\[\]]/.test(c)) {
      push("op", c);
      i++;
    } else {
      push("txt", c);
      i++;
    }
  }
  return merge(out);
}

// ===== [S3] highlightXml =====

export function highlightXml(src: string): Span[] {
  const out: Span[] = [];
  const re = /<!--[\s\S]*?(?:-->|$)|<\/?[A-Za-z_][\w:.-]*|\/?>|"[^"]*"|'[^']*'|[A-Za-z_][\w:.-]*(?==)|\s+|[^<>"'\s]+/g;
  let m: RegExpExecArray | null;
  let inTag = false;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (t.startsWith("<!--")) out.push({ cls: "com", text: t });
    else if (t.startsWith("<")) {
      inTag = true;
      out.push({ cls: "tag", text: t });
    } else if (t === ">" || t === "/>") {
      inTag = false;
      out.push({ cls: "tag", text: t });
    } else if (inTag && (t.startsWith('"') || t.startsWith("'"))) out.push({ cls: "str", text: t });
    else if (inTag && /^[A-Za-z_]/.test(t) && src[m.index + t.length] === "=") out.push({ cls: "attr", text: t });
    else out.push({ cls: "txt", text: t });
  }
  return merge(out);
}

function merge(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.cls === s.cls && (s.cls === "txt" || s.cls === "op")) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

// ===== [S4] toHtml =====

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toHtml(spans: Span[]): string {
  return spans.map((s) => (s.cls === "txt" ? escapeHtml(s.text) : `<span class="t-${s.cls}">${escapeHtml(s.text)}</span>`)).join("");
}
