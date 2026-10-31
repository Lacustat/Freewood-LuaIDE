/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] MatchState ... Lua-Muster-Engine (Port der Logik aus lstrlib.c)
 *   [S2] find / gsub-Helfer
 *
 * DE: Lua-Muster (%a, %d, Sets, Captures, %b, %f in 5.1, Positions-Captures).
 * EN: Lua patterns (%a, %d, sets, captures, %b, %f in 5.1, position captures).
 */

import { LuaError, type LuaValue } from "./value.js";

// ===== [S1] MatchState =====

const CAP_UNFINISHED = -1;
const CAP_POSITION = -2;
const MAXCCALLS = 200;

interface Capture {
  init: number;
  len: number;
}

function classMatch(c: number, cl: string): boolean {
  const lower = cl.toLowerCase();
  let res: boolean;
  const ch = String.fromCharCode(c);
  switch (lower) {
    case "a": res = /[A-Za-z]/.test(ch); break;
    case "c": res = c < 32 || c === 127; break;
    case "d": res = c >= 48 && c <= 57; break;
    case "l": res = c >= 97 && c <= 122; break;
    case "p": res = (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126); break;
    case "s": res = c === 32 || (c >= 9 && c <= 13); break;
    case "u": res = c >= 65 && c <= 90; break;
    case "w": res = /[A-Za-z0-9]/.test(ch); break;
    case "x": res = /[A-Fa-f0-9]/.test(ch); break;
    default: return cl.charCodeAt(0) === c;
  }
  return cl >= "A" && cl <= "Z" ? !res : res;
}

export class MatchState {
  level = 0;
  capture: Capture[] = [];
  matchdepth = 0;
  constructor(public src: string, public pat: string) {}

  reset(): void {
    this.level = 0;
    this.capture = [];
    this.matchdepth = 0;
  }

  private classEnd(p: number): number {
    const pat = this.pat;
    if (p >= pat.length) throw new LuaError("malformed pattern (ends with '%')");
    const c = pat[p++];
    if (c === "%") {
      if (p >= pat.length) throw new LuaError("malformed pattern (ends with '%')");
      return p + 1;
    }
    if (c === "[") {
      if (pat[p] === "^") p++;
      do {
        if (p >= pat.length) throw new LuaError("malformed pattern (missing ']')");
        const cc = pat[p++];
        if (cc === "%") p++;
      } while (pat[p] !== "]" || p >= pat.length);
      return p + 1;
    }
    return p;
  }

  private matchBracketClass(c: number, p: number, ec: number): boolean {
    const pat = this.pat;
    let sig = true;
    if (pat[p + 1] === "^") {
      sig = false;
      p++;
    }
    while (++p < ec) {
      if (pat[p] === "%") {
        p++;
        if (classMatch(c, pat[p]!)) return sig;
      } else if (pat[p + 1] === "-" && p + 2 < ec) {
        p += 2;
        if (pat.charCodeAt(p - 2) <= c && c <= pat.charCodeAt(p)) return sig;
      } else if (pat.charCodeAt(p) === c) return sig;
    }
    return !sig;
  }

  private singleMatch(s: number, p: number, ep: number): boolean {
    if (s >= this.src.length) return false;
    const c = this.src.charCodeAt(s);
    switch (this.pat[p]) {
      case ".": return true;
      case "%": return classMatch(c, this.pat[p + 1]!);
      case "[": return this.matchBracketClass(c, p, ep - 1);
      default: return this.pat.charCodeAt(p) === c;
    }
  }

  private matchBalance(s: number, p: number): number {
    if (p + 1 >= this.pat.length) throw new LuaError("unbalanced pattern");
    if (s >= this.src.length || this.src[s] !== this.pat[p]) return -1;
    const b = this.pat[p]!;
    const e = this.pat[p + 1]!;
    let cont = 1;
    while (++s < this.src.length) {
      const c = this.src[s];
      if (c === e) {
        if (--cont === 0) return s + 1;
      } else if (c === b) cont++;
    }
    return -1;
  }

  private maxExpand(s: number, p: number, ep: number): number {
    let i = 0;
    while (this.singleMatch(s + i, p, ep)) i++;
    while (i >= 0) {
      const res = this.match(s + i, ep + 1);
      if (res !== -1) return res;
      i--;
    }
    return -1;
  }

  private minExpand(s: number, p: number, ep: number): number {
    for (;;) {
      const res = this.match(s, ep + 1);
      if (res !== -1) return res;
      if (this.singleMatch(s, p, ep)) s++;
      else return -1;
    }
  }

  private startCapture(s: number, p: number, what: number): number {
    this.capture[this.level] = { init: s, len: what };
    this.level++;
    const res = this.match(s, p);
    if (res === -1) this.level--;
    return res;
  }

  private endCapture(s: number, p: number): number {
    let l = -1;
    for (let i = this.level - 1; i >= 0; i--) {
      if (this.capture[i]!.len === CAP_UNFINISHED) {
        l = i;
        break;
      }
    }
    if (l < 0) throw new LuaError("invalid pattern capture");
    this.capture[l]!.len = s - this.capture[l]!.init;
    const res = this.match(s, p);
    if (res === -1) this.capture[l]!.len = CAP_UNFINISHED;
    return res;
  }

  private matchCapture(s: number, l: string): number {
    const i = l.charCodeAt(0) - 49;
    if (i < 0 || i >= this.level || this.capture[i]!.len === CAP_UNFINISHED) throw new LuaError("invalid capture index");
    const cap = this.src.substr(this.capture[i]!.init, this.capture[i]!.len);
    if (this.src.length - s >= cap.length && this.src.substr(s, cap.length) === cap) return s + cap.length;
    return -1;
  }

  match(s: number, p: number): number {
    if (++this.matchdepth > MAXCCALLS) throw new LuaError("pattern too complex");
    try {
      const pat = this.pat;
      for (;;) {
        if (p >= pat.length) return s;
        const pc = pat[p];
        if (pc === "(") {
          return pat[p + 1] === ")" ? this.startCapture(s, p + 2, CAP_POSITION) : this.startCapture(s, p + 1, CAP_UNFINISHED);
        }
        if (pc === ")") return this.endCapture(s, p + 1);
        if (pc === "$" && p + 1 === pat.length) return s === this.src.length ? s : -1;
        if (pc === "%") {
          const nx = pat[p + 1];
          if (nx === "b") {
            s = this.matchBalance(s, p + 2);
            if (s !== -1) {
              p += 4;
              continue;
            }
            return -1;
          }
          if (nx === "f") {
            p += 2;
            if (pat[p] !== "[") throw new LuaError("missing '[' after '%f' in pattern");
            const ep = this.classEnd(p);
            const prev = s === 0 ? 0 : this.src.charCodeAt(s - 1);
            const cur = s < this.src.length ? this.src.charCodeAt(s) : 0;
            if (!this.matchBracketClass(prev, p, ep - 1) && this.matchBracketClass(cur, p, ep - 1)) {
              p = ep;
              continue;
            }
            return -1;
          }
          if (nx !== undefined && nx >= "0" && nx <= "9") {
            s = this.matchCapture(s, nx);
            if (s !== -1) {
              p += 2;
              continue;
            }
            return -1;
          }
        }
        const ep = this.classEnd(p);
        const epc = pat[ep];
        if (!this.singleMatch(s, p, ep)) {
          if (epc === "*" || epc === "?" || epc === "-") {
            p = ep + 1;
            continue;
          }
          return -1;
        }
        switch (epc) {
          case "?": {
            const res = this.match(s + 1, ep + 1);
            if (res !== -1) return res;
            p = ep + 1;
            continue;
          }
          case "+": return this.maxExpand(s + 1, p, ep);
          case "*": return this.maxExpand(s, p, ep);
          case "-": return this.minExpand(s, p, ep);
          default:
            s++;
            p = ep;
        }
      }
    } finally {
      this.matchdepth--;
    }
  }

  getCapture(i: number, s: number, e: number): LuaValue {
    if (i >= this.level) {
      if (i === 0) return this.src.slice(s, e);
      throw new LuaError("invalid capture index");
    }
    const c = this.capture[i]!;
    if (c.len === CAP_UNFINISHED) throw new LuaError("unfinished capture");
    if (c.len === CAP_POSITION) return c.init + 1;
    return this.src.substr(c.init, c.len);
  }

  captures(s: number, e: number, wholeIfNone: boolean): LuaValue[] {
    const n = this.level === 0 && wholeIfNone ? 1 : this.level;
    const out: LuaValue[] = [];
    for (let i = 0; i < n; i++) out.push(this.getCapture(i, s, e));
    return out;
  }
}

// ===== [S2] find / gsub-Helfer =====

export const SPECIALS = /[\^$*+?.()[\]%-]/;
