/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Diagnostic ......... Meldungstyp
 *   [S2] stdlibNames ........ bekannte Namen der Lua-Standardbibliothek je Version
 *   [S3] checkSource ........ Syntax + Prüfung gegen die API-Daten des Ziels
 *
 * DE: Findet Syntaxfehler (mit Zeile) und Aufrufe von Funktionen, die im Ziel nicht bekannt
 *     sind (Hinweis, kein Fehler: die Beispieldaten sind nicht vollständig). Erkennt auch
 *     Versionsfallen, z. B. `table.getn` oder `string.gfind` im falschen Ziel.
 * EN: Finds syntax errors (with line) and calls to functions unknown in the target (a hint,
 *     not an error: sample data is incomplete). Also catches version traps.
 */

import type { LocalizedText } from "../plugin-api/types.js";
import type { ResolvedTarget } from "../core/plugins.js";
import { LuaSyntaxError } from "../lua/lexer.js";
import { parse, type Expr, type FuncBody, type Stat } from "../lua/parser.js";
import { InterpRuntime } from "../lua/runtime.js";
import { LuaTable } from "../lua/value.js";

// ===== [S1] Diagnostic =====

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  line: number;
  code: "LUA_SYNTAX" | "API_UNKNOWN_FUNCTION" | "API_VERSION_TRAP";
  message: LocalizedText;
  name?: string;
}

// ===== [S2] stdlibNames =====

const stdCache = new Map<string, Set<string>>();

export function stdlibNames(version: "5.0" | "5.1"): Set<string> {
  let s = stdCache.get(version);
  if (s) return s;
  s = new Set<string>();
  const rt = new InterpRuntime(version);
  for (const [k, v] of rt.interp.globals.hash) {
    if (typeof k !== "string") continue;
    s.add(k);
    if (v instanceof LuaTable && k !== "_G") for (const k2 of v.hash.keys()) if (typeof k2 === "string") s.add(`${k}.${k2}`);
  }
  stdCache.set(version, s);
  return s;
}

/**
 * DE: Namen der Standardbibliothek eines Ziels. Bei `lua51-transpiled` (ClassicAPI) läuft in
 *     Wahrheit die Lua-5.0-VM: Namen aus 5.0 UND 5.1 gelten.
 * EN: stdlib names of a target. For `lua51-transpiled` (ClassicAPI) the VM is really Lua 5.0:
 *     names from 5.0 AND 5.1 are valid.
 */
export function targetStdlib(target: ResolvedTarget): Set<string> {
  if (target.syntax === "lua51-transpiled") return new Set([...stdlibNames("5.0"), ...stdlibNames("5.1")]);
  return stdlibNames(target.luaVersion);
}

// ===== [S3] checkSource =====

const OTHER_VERSION_HINTS: Record<string, { en: string; de: string }> = {
  "string.gfind": { en: "string.gfind only exists in Lua 5.0; use string.gmatch in Lua 5.1.", de: "string.gfind gibt es nur in Lua 5.0; in Lua 5.1 heißt es string.gmatch." },
  "string.gmatch": { en: "string.gmatch is Lua 5.1; use string.gfind in Lua 5.0.", de: "string.gmatch ist Lua 5.1; in Lua 5.0 heißt es string.gfind." },
  "math.mod": { en: "math.mod only exists in Lua 5.0; use math.fmod or % in Lua 5.1.", de: "math.mod gibt es nur in Lua 5.0; in Lua 5.1 nutze math.fmod oder %." },
  "table.setn": { en: "table.setn only exists in Lua 5.0.", de: "table.setn gibt es nur in Lua 5.0." },
  select: { en: "select() does not exist in Lua 5.0; use the arg table.", de: "select() gibt es in Lua 5.0 nicht; nutze die Tabelle arg." },
};

export function checkSource(source: string, target: ResolvedTarget, chunk = "chunk"): Diagnostic[] {
  const diags: Diagnostic[] = [];
  let ast: FuncBody;
  const parseVersion = target.syntax === "lua50" ? "5.0" : "5.1";
  try {
    ast = parse(source, chunk, parseVersion);
  } catch (e) {
    if (e instanceof LuaSyntaxError) {
      const msg = e.message.replace(/^[^:]*:\d+:\s*/, "");
      diags.push({ severity: "error", line: e.line, code: "LUA_SYNTAX", message: { en: msg, de: msg } });
      return diags;
    }
    throw e;
  }
  const std = targetStdlib(target);
  const other = target.syntax === "lua51-transpiled" ? new Set<string>() : stdlibNames(target.luaVersion === "5.0" ? "5.1" : "5.0");

  // script-defined globals (first pass)
  const defined = new Set<string>();
  const scopes: Set<string>[] = [new Set()];
  const isLocal = (n: string) => scopes.some((s) => s.has(n));
  const collect = (stats: Stat[]): void => {
    for (const s of stats) {
      if (s.t === "Assign") for (const t of s.targets) if (t.t === "Name") defined.add(t.name);
      if (s.t === "Assign") for (const t of s.targets) if (t.t === "Index") { const p = dotted(t); if (p) defined.add(p); }
      for (const sub of subBlocks(s)) collect(sub);
    }
  };
  collect(ast.body);

  const known = (name: string): boolean => std.has(name) || target.functions.has(name) || defined.has(name) || target.widgets.has(name);

  const report = (name: string, line: number): void => {
    if (known(name)) return;
    const root = name.split(".")[0]!;
    if (defined.has(root) && !std.has(root) && !target.functions.has(root)) return; // user tables
    if (name.includes(".") && !root.startsWith("C_") && !std.has(root) && ![...target.functions.keys()].some((f) => f.startsWith(root + "."))) return; // unknown namespace: stay quiet
    if (other.has(name)) {
      const h = OTHER_VERSION_HINTS[name];
      diags.push({
        severity: "warning", line, code: "API_VERSION_TRAP", name,
        message: h ? { en: h.en, de: h.de } : { en: `${name} does not exist in Lua ${target.luaVersion}.`, de: `${name} gibt es in Lua ${target.luaVersion} nicht.` },
      });
      return;
    }
    diags.push({
      severity: "info", line, code: "API_UNKNOWN_FUNCTION", name,
      message: { en: `'${name}' is not in the API data of target '${target.id}'.`, de: `'${name}' steht nicht in den API-Daten des Ziels '${target.id}'.` },
    });
  };

  const visitExpr = (e: Expr): void => {
    switch (e.t) {
      case "Call": {
        const name = dotted(e.fn);
        if (name) {
          const root = name.split(".")[0]!;
          if (!isLocal(root)) report(name, e.line);
        }
        visitExpr(e.fn);
        e.args.forEach(visitExpr);
        return;
      }
      case "Method": visitExpr(e.obj); e.args.forEach(visitExpr); return;
      case "Index": visitExpr(e.obj); visitExpr(e.key); return;
      case "Bin": visitExpr(e.a); visitExpr(e.b); return;
      case "Un": visitExpr(e.a); return;
      case "Paren": visitExpr(e.e); return;
      case "Func": visitFunc(e.f); return;
      case "Table": e.arr.forEach(visitExpr); e.hash.forEach(([k, v]) => { visitExpr(k); visitExpr(v); }); return;
      case "Name": {
        if (!isLocal(e.name) && other.has(e.name) && !std.has(e.name) && !defined.has(e.name) && !target.functions.has(e.name)) report(e.name, e.line);
        return;
      }
      default:
    }
  };
  const visitBlock = (stats: Stat[], newScope = true): void => {
    if (newScope) scopes.push(new Set());
    for (const s of stats) visitStat(s);
    if (newScope) scopes.pop();
  };
  const declare = (n: string) => scopes[scopes.length - 1]!.add(n);
  const visitFunc = (f: FuncBody): void => {
    scopes.push(new Set(f.params));
    if (f.vararg && target.luaVersion === "5.0") declare("arg");
    visitBlock(f.body, false);
    scopes.pop();
  };
  const visitStat = (s: Stat): void => {
    switch (s.t) {
      case "Local": s.exprs.forEach(visitExpr); s.names.forEach(declare); return;
      case "LocalFunc": declare(s.name); visitFunc(s.f); return;
      case "Assign": s.exprs.forEach(visitExpr); s.targets.forEach((t) => t.t === "Index" && (visitExpr(t.obj), visitExpr(t.key))); return;
      case "CallStat": visitExpr(s.call); return;
      case "Do": visitBlock(s.body); return;
      case "While": visitExpr(s.cond); visitBlock(s.body); return;
      case "Repeat": scopes.push(new Set()); visitBlock(s.body, false); visitExpr(s.cond); scopes.pop(); return;
      case "If": s.conds.forEach(visitExpr); s.blocks.forEach((b) => visitBlock(b)); if (s.orelse) visitBlock(s.orelse); return;
      case "NumFor": visitExpr(s.a); visitExpr(s.b); if (s.c) visitExpr(s.c); scopes.push(new Set([s.v])); visitBlock(s.body, false); scopes.pop(); return;
      case "GenFor": s.exprs.forEach(visitExpr); scopes.push(new Set(s.names)); visitBlock(s.body, false); scopes.pop(); return;
      case "Return": s.exprs.forEach(visitExpr); return;
      default:
    }
  };
  visitBlock(ast.body, false);
  diags.sort((a, b) => a.line - b.line);
  return diags;
}

function dotted(e: Expr): string | undefined {
  if (e.t === "Name") return e.name;
  if (e.t === "Index" && e.key.t === "Str") {
    const base = dotted(e.obj);
    return base ? `${base}.${e.key.v}` : undefined;
  }
  return undefined;
}

function subBlocks(s: Stat): Stat[][] {
  switch (s.t) {
    case "Do": case "While": case "Repeat": case "NumFor": case "GenFor": return [s.body];
    case "If": return s.orelse ? [...s.blocks, s.orelse] : s.blocks;
    default: return [];
  }
}
