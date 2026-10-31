/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Token-Typen · token types
 *   [S2] LuaSyntaxError
 *   [S3] tokenize ..... Lua 5.0 / 5.1 Lexer
 *
 * DE: Lexer für Lua 5.0 und 5.1. Unterschiede: in 5.0 gibt es kein `#`, kein `%`, und lange
 *     Klammern ([=[ ]=]) nur in 5.1. EN: lexer for Lua 5.0 and 5.1. Differences: 5.0 has no `#`,
 *     no `%`, and level long brackets ([=[ ]=]) only in 5.1.
 */

import type { LuaVersion } from "../plugin-api/types.js";

// ===== [S1] Token-Typen · token types =====

export type TokenType = "name" | "number" | "string" | "keyword" | "op" | "eof";

export interface Token {
  type: TokenType;
  value: string | number;
  line: number;
}

const KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in",
  "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
]);

// ===== [S2] LuaSyntaxError =====

export class LuaSyntaxError extends Error {
  constructor(public chunk: string, public line: number, message: string) {
    super(`${chunk}:${line}: ${message}`);
  }
}

// ===== [S3] tokenize =====

const isDigit = (c: string) => c >= "0" && c <= "9";
const isHex = (c: string) => /[0-9a-fA-F]/.test(c);
const isAlpha = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";

export function tokenize(src: string, chunk: string, version: LuaVersion): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  const err = (msg: string): never => {
    throw new LuaSyntaxError(chunk, line, msg);
  };
  if (src.startsWith("#")) while (i < src.length && src[i] !== "\n") i++; // shebang

  function longBracketLevel(at: number): number {
    // returns level if src[at..] starts a long bracket "[=*[", else -1
    if (src[at] !== "[") return -1;
    let j = at + 1;
    let level = 0;
    while (src[j] === "=") {
      level++;
      j++;
    }
    if (src[j] !== "[") return -1;
    if (level > 0 && version === "5.0") return -1;
    return level;
  }

  function readLong(level: number): string {
    // i points at first "["
    i += level + 2;
    if (src[i] === "\r") i++;
    if (src[i] === "\n") {
      line++;
      i++;
    }
    const close = "]" + "=".repeat(level) + "]";
    const start = i;
    const end = src.indexOf(close, i);
    if (end < 0) err("unfinished long string");
    const text = src.slice(start, end);
    for (const ch of text) if (ch === "\n") line++;
    i = end + close.length;
    return text;
  }

  while (i < src.length) {
    const c = src[i]!;
    if (c === "\n") {
      line++;
      i++;
    } else if (c === " " || c === "\t" || c === "\r") {
      i++;
    } else if (c === "-" && src[i + 1] === "-") {
      i += 2;
      const lvl = longBracketLevel(i);
      if (lvl >= 0) readLong(lvl);
      else while (i < src.length && src[i] !== "\n") i++;
    } else if (isAlpha(c)) {
      let j = i + 1;
      while (j < src.length && (isAlpha(src[j]!) || isDigit(src[j]!))) j++;
      const word = src.slice(i, j);
      out.push({ type: KEYWORDS.has(word) ? "keyword" : "name", value: word, line });
      i = j;
    } else if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      let j = i;
      if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        j += 2;
        while (j < src.length && isHex(src[j]!)) j++;
        const n = Number(src.slice(i, j));
        if (Number.isNaN(n)) err("malformed number near '" + src.slice(i, j) + "'");
        out.push({ type: "number", value: n, line });
      } else {
        while (j < src.length && (isDigit(src[j]!) || src[j] === ".")) j++;
        if (src[j] === "e" || src[j] === "E") {
          j++;
          if (src[j] === "+" || src[j] === "-") j++;
          while (j < src.length && isDigit(src[j]!)) j++;
        }
        const text = src.slice(i, j);
        const n = Number(text);
        if (Number.isNaN(n) || /\.\..*/.test(text)) err("malformed number near '" + text + "'");
        out.push({ type: "number", value: n, line });
      }
      i = j;
    } else if (c === '"' || c === "'") {
      const q = c;
      i++;
      let s = "";
      for (;;) {
        if (i >= src.length) err("unfinished string");
        const d = src[i]!;
        if (d === q) {
          i++;
          break;
        }
        if (d === "\n") err("unfinished string");
        if (d === "\\") {
          i++;
          const e = src[i]!;
          const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v", "\\": "\\", '"': '"', "'": "'" };
          if (e === "\n") {
            s += "\n";
            line++;
            i++;
          } else if (e in map) {
            s += map[e];
            i++;
          } else if (isDigit(e)) {
            let k = i;
            while (k < i + 3 && isDigit(src[k] ?? "")) k++;
            const code = Number(src.slice(i, k));
            if (code > 255) err("escape sequence too large");
            s += String.fromCharCode(code);
            i = k;
          } else {
            s += e;
            i++;
          }
        } else {
          s += d;
          i++;
        }
      }
      out.push({ type: "string", value: s, line });
    } else if (c === "[" && longBracketLevel(i) >= 0) {
      const startLine = line;
      const text = readLong(longBracketLevel(i));
      out.push({ type: "string", value: text, line: startLine });
    } else {
      const three = src.slice(i, i + 3);
      const two = src.slice(i, i + 2);
      let op: string;
      if (three === "...") op = three;
      else if (["==", "~=", "<=", ">=", ".."].includes(two)) op = two;
      else if ("+-*/^<>=(){}[];:,.".includes(c)) op = c;
      else if (c === "%" && version === "5.1") op = c;
      else if (c === "#" && version === "5.1") op = c;
      else return err(`unexpected symbol near '${c}'`);
      out.push({ type: "op", value: op, line });
      i += op.length;
    }
  }
  out.push({ type: "eof", value: "<eof>", line });
  return out;
}
