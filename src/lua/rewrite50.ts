/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Optionen · options
 *   [S2] rewrite51to50 ..... Lua-5.1-Quelltext → Lua-5.0-Quelltext (wie ClassicAPI)
 *   [S3] Besucher · walker .. findet #, %, ... im Syntaxbaum
 *
 * DE: Die 1.12-VM kann fünf Dinge aus Lua 5.1 nicht übersetzen: `#`, `%`, `...` als Ausdruck,
 *     `0x`-Zahlen und `[=[ ]=]`. ClassicAPI schreibt den Quelltext vor dem Übersetzen um
 *     (docs/API.md, „Lua 5.1 syntax“). Dieses Modul macht dasselbe:
 *       #x        → __len(x)          a % b      → __mod(a, b)
 *       ...       → unpack(arg)       0xFF00     → 65280
 *       [=[ x ]=] → [[ x ]] oder "x"  --[=[ x ]=] → nur Zeilenumbrüche
 *     Es werden nur Zeichen eingefügt oder ersetzt, aber KEINE Zeilen: Fehlerzeilen bleiben
 *     richtig. `__len`/`__mod` liefert das Prelude der Simulation.
 * EN: the 1.12 VM cannot compile five Lua 5.1 things: `#`, `%`, `...` as an expression, `0x`
 *     numbers and `[=[ ]=]`. ClassicAPI rewrites the source before compiling (docs/API.md,
 *     "Lua 5.1 syntax"). This module does the same (see table above). Characters are inserted or
 *     replaced but never lines, so error lines stay correct. The simulation prelude supplies
 *     `__len`/`__mod`.
 */

import type { LexInfo } from "./lexer.js";
import { parseWithTokens, type Expr, type FuncBody, type Stat } from "./parser.js";

// ===== [S1] Optionen · options =====

export interface Rewrite50Options {
  /**
   * DE: Name des Addons: `...` auf Datei-Ebene liefert dann (Name, Tabelle) wie bei ClassicAPI.
   * EN: addon name: `...` at file level then yields (name, table) like ClassicAPI.
   */
  addonName?: string;
  /** DE: Einzelne Umschreibungen abschalten (wie `_classicapi_SetTranspileOption`). EN: switch single rewrites off. */
  off?: Partial<Record<"Length" | "Modulo" | "VarargExpansion" | "HexLiterals" | "LongBrackets", boolean>>;
}

interface Edit {
  pos: number;
  del: number;
  text: string;
  /** 0 = Einfügung, 1 = Ersetzung (bei gleicher Position zuerst einfügen) */
  order: 0 | 1;
}

// ===== [S2] rewrite51to50 =====

export function rewrite51to50(src: string, chunk: string, opts: Rewrite50Options = {}): string {
  const info: LexInfo = { leveledComments: [] };
  const { ast, tokens } = parseWithTokens(src, chunk, "5.1", info);
  const on = (k: keyof NonNullable<Rewrite50Options["off"]>): boolean => !opts.off?.[k];
  const edits: Edit[] = [];
  const mainVararg = { used: false };

  walkBody(ast, 0, (e, depth) => {
    if (e.t === "Un" && e.op === "#" && on("Length") && e.lo !== undefined && e.hi !== undefined) {
      const op = tokens[e.lo]!;
      edits.push({ pos: op.start, del: op.end - op.start, text: "__len(", order: 1 });
      edits.push({ pos: tokens[e.hi]!.end, del: 0, text: ")", order: 0 });
    } else if (e.t === "Bin" && e.op === "%" && on("Modulo") && e.a.lo !== undefined && e.a.hi !== undefined && e.b.hi !== undefined) {
      const op = tokens[e.a.hi + 1]!;
      edits.push({ pos: tokens[e.a.lo]!.start, del: 0, text: "__mod(", order: 0 });
      edits.push({ pos: op.start, del: op.end - op.start, text: ",", order: 1 });
      edits.push({ pos: tokens[e.b.hi]!.end, del: 0, text: ")", order: 0 });
    } else if (e.t === "Vararg" && on("VarargExpansion") && e.lo !== undefined) {
      const t = tokens[e.lo]!;
      edits.push({ pos: t.start, del: t.end - t.start, text: "unpack(arg)", order: 1 });
      if (depth === 0) mainVararg.used = true;
    }
  });

  if (on("HexLiterals")) {
    for (const t of tokens) {
      if (t.type === "number" && /^0[xX]/.test(src.slice(t.start, t.end))) edits.push({ pos: t.start, del: t.end - t.start, text: String(t.value), order: 1 });
    }
  }

  if (on("LongBrackets")) {
    for (const t of tokens) {
      if (t.type !== "string" || src[t.start] !== "[") continue;
      const m = /^\[(=+)\[/.exec(src.slice(t.start, t.end));
      if (!m) continue;
      const level = m[1]!.length;
      const body = src.slice(t.start + level + 2, t.end - level - 2);
      let text: string;
      if (!body.includes("[[") && !body.includes("]]") && !body.endsWith("]")) text = `[[${body}]]`;
      else text = '"' + body.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\\n") + '"';
      edits.push({ pos: t.start, del: t.end - t.start, text, order: 1 });
    }
    for (const c of info.leveledComments) {
      const newlines = src.slice(c.start, c.end).split("\n").length - 1;
      edits.push({ pos: c.start, del: c.end - c.start, text: "\n".repeat(newlines), order: 1 });
    }
  }

  let out = src;
  edits.sort((a, b) => b.pos - a.pos || b.order - a.order);
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos + e.del);

  if (mainVararg.used && opts.addonName !== undefined) {
    // DE: Datei-Argumente (Name, Tabelle) als lokales `arg`, in derselben ersten Zeile.
    // EN: file arguments (name, table) as a local `arg`, on the same first line.
    out = `local arg = { n = 2, ${JSON.stringify(opts.addonName)}, __fw_addon_table(${JSON.stringify(opts.addonName)}) }; ` + out;
  }
  return out;
}

// ===== [S3] Besucher · walker =====

type Visit = (e: Expr, funcDepth: number) => void;

function walkBody(f: FuncBody, depth: number, v: Visit): void {
  for (const s of f.body) walkStat(s, depth, v);
}

function walkStat(s: Stat, d: number, v: Visit): void {
  const ex = (e: Expr | null | undefined): void => {
    if (e) walkExpr(e, d, v);
  };
  const block = (b: Stat[]): void => b.forEach((x) => walkStat(x, d, v));
  switch (s.t) {
    case "Local": s.exprs.forEach(ex); break;
    case "Assign": s.targets.forEach(ex); s.exprs.forEach(ex); break;
    case "CallStat": ex(s.call); break;
    case "Do": block(s.body); break;
    case "While": ex(s.cond); block(s.body); break;
    case "Repeat": block(s.body); ex(s.cond); break;
    case "If": s.conds.forEach(ex); s.blocks.forEach(block); if (s.orelse) block(s.orelse); break;
    case "NumFor": ex(s.a); ex(s.b); ex(s.c); block(s.body); break;
    case "GenFor": s.exprs.forEach(ex); block(s.body); break;
    case "LocalFunc": walkBody(s.f, d + 1, v); break;
    case "Return": s.exprs.forEach(ex); break;
    case "Break": break;
  }
}

function walkExpr(e: Expr, d: number, v: Visit): void {
  v(e, d);
  switch (e.t) {
    case "Func": walkBody(e.f, d + 1, v); break;
    case "Index": walkExpr(e.obj, d, v); walkExpr(e.key, d, v); break;
    case "Call": walkExpr(e.fn, d, v); e.args.forEach((a) => walkExpr(a, d, v)); break;
    case "Method": walkExpr(e.obj, d, v); e.args.forEach((a) => walkExpr(a, d, v)); break;
    case "Bin": walkExpr(e.a, d, v); walkExpr(e.b, d, v); break;
    case "Un": walkExpr(e.a, d, v); break;
    case "Table": e.arr.forEach((a) => walkExpr(a, d, v)); e.hash.forEach(([k, x]) => { walkExpr(k, d, v); walkExpr(x, d, v); }); break;
    case "Paren": walkExpr(e.e, d, v); break;
    default:
  }
}
