/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Typen · types
 *   [S2] Helfer · helpers ......... luaQuote, literal, identifier
 *   [S3] generateLua .............. Graph → Lua-Quelltext für das gewählte Ziel
 *
 * DE: Der Generator kennt die Unterschiede der Ziele: Script-Argumente (Globals wie `event`,
 *     `arg1` in 1.12 gegenüber `self, event, ...` in Retail), `#` gegenüber table.getn, `%`
 *     gegenüber math.mod, C_Timer nur mit ClassicAPI/Retail. Reine Ausdrücke werden an jeder
 *     Stelle eingesetzt, Funktionsaufrufe liefern lokale Variablen.
 * EN: the generator knows the target differences: script args (globals like `event`, `arg1` in
 *     1.12 vs `self, event, ...` in retail), `#` vs table.getn, `%` vs math.mod, C_Timer only
 *     with ClassicAPI/Retail. Pure expressions are inlined; function calls produce locals.
 */

import type { ResolvedTarget } from "../core/plugins.js";
import type { LocalizedText } from "../plugin-api/types.js";
import { Graph, nodeDefFor, type GNode, type GraphDoc, type PropValue } from "./model.js";

// ===== [S1] Typen · types =====

export interface GenWarning {
  node?: string;
  code: "GEN_MISSING_INPUT" | "GEN_FN_MISSING" | "GEN_EVENT_MISSING" | "GEN_NO_TIMER" | "GEN_CYCLE" | "GEN_UNREACHABLE" | "GEN_BAD_NAME" | "GEN_UNUSED_OUTPUT" | "GEN_PURE_CYCLE";
  message: LocalizedText;
}

export interface GenResult {
  code: string;
  warnings: GenWarning[];
}

// ===== [S2] Helfer · helpers =====

const LUA_KEYWORDS = new Set(["and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while"]);

export function luaQuote(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\0") out += "\\000";
    else out += ch;
  }
  return out + '"';
}

export function isIdentifier(s: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !LUA_KEYWORDS.has(s);
}

/** DE: Eingabe-Literal: "=ausdruck" roh, Zahlen, true/false/nil, sonst Text. EN: literal input rule. */
export function literal(v: PropValue | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? (v < 0 ? `(${v})` : String(v)) : "0";
  if (v.startsWith("=")) return v.slice(1).trim() || "nil";
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v.trim())) return v.trim().startsWith("-") ? `(${v.trim()})` : v.trim();
  if (v === "true" || v === "false" || v === "nil") return v;
  return luaQuote(v);
}

const id = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, "_");

// ===== [S3] generateLua =====

export function generateLua(source: Graph | GraphDoc, target: ResolvedTarget): GenResult {
  const graph = source instanceof Graph ? source : new Graph(source);
  graph.setTarget(target);
  const doc = graph.doc;
  const warnings: GenWarning[] = [];
  const warn = (w: GenWarning) => warnings.push(w);
  const globalsStyle = target.scriptArgs !== "arguments";
  const lua50 = target.syntax === "lua50";
  const lines: string[] = [];
  const emitted = new Set<string>(); // impure nodes whose locals exist in the current handler
  const reached = new Set<string>();

  const byId = new Map<string, GNode>(doc.nodes.map((n) => [n.id, n]));

  // ----- Variablen · variables -----
  const varNames: string[] = [];
  const varName = (n: GNode): string => {
    const raw = String(n.props["name"] ?? "");
    if (!isIdentifier(raw)) {
      warn({ node: n.id, code: "GEN_BAD_NAME", message: { en: `'${raw}' is not a valid variable name.`, de: `'${raw}' ist kein gültiger Variablenname.` } });
      return "fw_invalid_name";
    }
    if (!varNames.includes(raw)) varNames.push(raw);
    return raw;
  };

  // ----- Ausdrücke · expressions -----
  const pureStack: string[] = [];
  const dataExpr = (nodeId: string, pin: string): string => {
    const e = graph.edgeInto(nodeId, pin);
    if (e) return outputExpr(e.from.node, e.from.pin);
    const lit = literal(byId.get(nodeId)?.props[`lit.${pin}`]);
    if (lit !== undefined) return lit;
    return "nil";
  };
  const requireInput = (nodeId: string, pin: string): string => {
    const hasValue = graph.edgeInto(nodeId, pin) || byId.get(nodeId)?.props[`lit.${pin}`] !== undefined;
    if (!hasValue) warn({ node: nodeId, code: "GEN_MISSING_INPUT", message: { en: `Input '${pin}' of node ${nodeId} is empty.`, de: `Eingang '${pin}' von Knoten ${nodeId} ist leer.` } });
    return dataExpr(nodeId, pin);
  };

  const outputExpr = (nodeId: string, pin: string): string => {
    const n = byId.get(nodeId);
    if (!n) return "nil";
    const def = nodeDefFor(n, target);
    if (!def) return "nil";
    if (!def.pure) {
      if (n.type === "event") {
        const ev = target.events.get(String(n.props["event"]));
        const idx = ev ? ev.payload.findIndex((p) => p.name === pin) : -1;
        if (idx < 0) return "nil";
        return globalsStyle ? `arg${idx + 1}` : `ev_${id(pin)}`;
      }
      if (n.type === "slash") return "msg";
      if (n.type === "onupdate") return globalsStyle ? "arg1" : "elapsed";
      if (!emitted.has(nodeId)) {
        warn({ node: nodeId, code: "GEN_UNREACHABLE", message: { en: `Output '${pin}' of node ${nodeId} is used before the node runs.`, de: `Ausgang '${pin}' von Knoten ${nodeId} wird verwendet, bevor der Knoten läuft.` } });
        return "nil";
      }
      return `l_${id(nodeId)}_${id(pin)}`;
    }
    if (pureStack.includes(nodeId)) {
      warn({ node: nodeId, code: "GEN_PURE_CYCLE", message: { en: `Node ${nodeId} depends on itself.`, de: `Knoten ${nodeId} hängt von sich selbst ab.` } });
      return "nil";
    }
    pureStack.push(nodeId);
    try {
      switch (n.type) {
        case "number": return literal(Number(n.props["value"] ?? 0)) ?? "0";
        case "string": return luaQuote(String(n.props["value"] ?? ""));
        case "boolean": return n.props["value"] === false || n.props["value"] === "false" ? "false" : "true";
        case "nil": return "nil";
        case "get_var": return varName(n);
        case "math": {
          const op = String(n.props["op"] ?? "+");
          const a = requireInput(n.id, "a");
          const b = requireInput(n.id, "b");
          if (op === "%" && lua50) return `math.mod(${a}, ${b})`;
          return `(${a} ${op} ${b})`;
        }
        case "compare": return `(${requireInput(n.id, "a")} ${String(n.props["op"] ?? "==")} ${requireInput(n.id, "b")})`;
        case "logic": return `(${requireInput(n.id, "a")} ${n.props["op"] === "or" ? "or" : "and"} ${requireInput(n.id, "b")})`;
        case "not": return `(not ${requireInput(n.id, "a")})`;
        case "concat": return `(${requireInput(n.id, "a")} .. ${requireInput(n.id, "b")})`;
        case "length": {
          const t = requireInput(n.id, "table");
          return lua50 ? `table.getn(${t})` : `(#${t})`;
        }
        default: return "nil";
      }
    } finally {
      pureStack.pop();
    }
  };

  // ----- Ablauf · flow -----
  const stack: string[] = [];
  const emitChain = (fromNode: string, pin: string, indent: string): void => {
    const e = graph.edgeFrom(fromNode, pin);
    if (e) emitNode(e.to.node, indent);
  };

  const emitNode = (nodeId: string, indent: string): void => {
    const n = byId.get(nodeId);
    if (!n) return;
    if (stack.includes(nodeId)) {
      warn({ node: nodeId, code: "GEN_CYCLE", message: { en: `Flow loops back to node ${nodeId}; use a loop node instead.`, de: `Der Ablauf kehrt zu Knoten ${nodeId} zurück; nutze stattdessen einen Schleifenknoten.` } });
      lines.push(`${indent}-- (flow loop at ${nodeId} not generated)`);
      return;
    }
    stack.push(nodeId);
    reached.add(nodeId);
    const p = (s: string) => lines.push(indent + s);
    const inner = indent + "  ";
    switch (n.type) {
      case "call": {
        const name = String(n.props["fn"] ?? "");
        const f = target.functions.get(name);
        if (!f) {
          warn({ node: n.id, code: "GEN_FN_MISSING", message: { en: `'${name}' does not exist in target '${target.id}'.`, de: `'${name}' gibt es im Ziel '${target.id}' nicht.` } });
        }
        const params = f?.params ?? [];
        const args = params.map((prm) => {
          const has = graph.edgeInto(n.id, prm.name) || n.props[`lit.${prm.name}`] !== undefined;
          if (!has && !prm.optional) warn({ node: n.id, code: "GEN_MISSING_INPUT", message: { en: `Required parameter '${prm.name}' of ${name} is empty.`, de: `Pflichtparameter '${prm.name}' von ${name} ist leer.` } });
          return dataExpr(n.id, prm.name);
        });
        while (args.length > 0 && args[args.length - 1] === "nil") args.pop();
        const used = (f?.returns ?? []).filter((r) => graph.doc.edges.some((ed) => ed.from.node === n.id && ed.from.pin === r.name));
        const rets = (f?.returns ?? []).map((r) => (used.includes(r) ? `l_${id(n.id)}_${id(r.name)}` : "_"));
        while (rets.length > 0 && rets[rets.length - 1] === "_") rets.pop();
        p(rets.length ? `local ${rets.join(", ")} = ${name}(${args.join(", ")})` : `${name}(${args.join(", ")})`);
        emitted.add(n.id);
        emitChain(n.id, "then", indent);
        break;
      }
      case "if": {
        p(`if ${requireInput(n.id, "cond")} then`);
        emitChain(n.id, "then", inner);
        if (graph.edgeFrom(n.id, "else")) {
          p("else");
          emitChain(n.id, "else", inner);
        }
        p("end");
        emitChain(n.id, "done", indent);
        break;
      }
      case "for": {
        const v = `l_${id(n.id)}_index`;
        const step = graph.edgeInto(n.id, "step") || n.props["lit.step"] !== undefined ? `, ${dataExpr(n.id, "step")}` : "";
        p(`for ${v} = ${requireInput(n.id, "from")}, ${requireInput(n.id, "to")}${step} do`);
        emitted.add(n.id);
        emitChain(n.id, "body", inner);
        p("end");
        emitted.delete(n.id);
        emitChain(n.id, "done", indent);
        break;
      }
      case "while": {
        p(`while ${requireInput(n.id, "cond")} do`);
        emitChain(n.id, "body", inner);
        p("end");
        emitChain(n.id, "done", indent);
        break;
      }
      case "sequence": {
        for (const pin of ["then1", "then2", "then3"]) {
          if (graph.edgeFrom(n.id, pin)) {
            p("do");
            emitChain(n.id, pin, inner);
            p("end");
          }
        }
        break;
      }
      case "delay": {
        if (!target.functions.has("C_Timer.After")) {
          warn({ node: n.id, code: "GEN_NO_TIMER", message: { en: "Delay needs C_Timer.After (ClassicAPI or Retail). The rest of this chain was not generated.", de: "Verzögerung braucht C_Timer.After (ClassicAPI oder Retail). Der Rest dieser Kette wurde nicht erzeugt." } });
          p("-- delay is not available in this target");
          break;
        }
        p(`C_Timer.After(${requireInput(n.id, "seconds")}, function()`);
        emitChain(n.id, "then", inner);
        p("end)");
        break;
      }
      case "set_var": {
        p(`${varName({ ...n, props: { name: n.props["name"] ?? "" } })} = ${requireInput(n.id, "value")}`);
        emitChain(n.id, "then", indent);
        break;
      }
      case "print": {
        p(`DEFAULT_CHAT_FRAME:AddMessage(tostring(${requireInput(n.id, "text")}))`);
        emitChain(n.id, "then", indent);
        break;
      }
      case "raw": {
        for (const l of String(n.props["code"] ?? "").split("\n")) p(l);
        emitChain(n.id, "then", indent);
        break;
      }
      default:
        // pure nodes and event roots are never statements
        break;
    }
    stack.pop();
  };

  // ----- Wurzeln · roots -----
  const eventNodes = doc.nodes.filter((n) => n.type === "event");
  const slashNodes = doc.nodes.filter((n) => n.type === "slash");
  const updateNodes = doc.nodes.filter((n) => n.type === "onupdate");

  const body: string[] = [];
  const flush = (): string[] => lines.splice(0, lines.length);

  // events grouped by name, in document order
  const eventNames: string[] = [];
  for (const n of eventNodes) {
    const name = String(n.props["event"] ?? "");
    if (!target.events.has(name)) warn({ node: n.id, code: "GEN_EVENT_MISSING", message: { en: `Event '${name}' does not exist in target '${target.id}'.`, de: `Ereignis '${name}' gibt es im Ziel '${target.id}' nicht.` } });
    if (!eventNames.includes(name)) eventNames.push(name);
  }

  if (eventNames.length > 0) {
    body.push("");
    body.push('local fwFrame = CreateFrame("Frame")');
    for (const name of eventNames) body.push(`fwFrame:RegisterEvent(${luaQuote(name)})`);
    body.push(globalsStyle ? 'fwFrame:SetScript("OnEvent", function()' : 'fwFrame:SetScript("OnEvent", function(self, event, ...)');
    eventNames.forEach((name, i) => {
      body.push(`  ${i === 0 ? "if" : "elseif"} event == ${luaQuote(name)} then`);
      for (const n of eventNodes.filter((x) => String(x.props["event"]) === name)) {
        emitted.clear();
        body.push("    do");
        if (!globalsStyle) {
          const payload = target.events.get(name)?.payload ?? [];
          if (payload.length) body.push(`      local ${payload.map((pl) => `ev_${id(pl.name)}`).join(", ")} = ...`);
        }
        emitChain(n.id, "then", "      ");
        body.push(...flush());
        body.push("    end");
      }
    });
    body.push("  end");
    body.push("end)");
  }

  slashNodes.forEach((n, i) => {
    const cmd = String(n.props["command"] ?? "").replace(/^\//, "").trim();
    if (!/^[A-Za-z0-9_]+$/.test(cmd)) {
      warn({ node: n.id, code: "GEN_BAD_NAME", message: { en: `Slash command '${cmd}' is not valid (letters, digits, _).`, de: `Chat-Befehl '${cmd}' ist ungültig (Buchstaben, Ziffern, _).` } });
      return;
    }
    const key = `FW${i + 1}_${id(n.id).toUpperCase()}`;
    emitted.clear();
    body.push("");
    body.push(`SLASH_${key}1 = ${luaQuote("/" + cmd)}`);
    body.push(`SlashCmdList[${luaQuote(key)}] = function(msg)`);
    emitChain(n.id, "then", "  ");
    body.push(...flush());
    body.push("end");
  });

  if (updateNodes.length > 0) {
    body.push("");
    body.push('local fwUpdate = CreateFrame("Frame")');
    body.push(globalsStyle ? 'fwUpdate:SetScript("OnUpdate", function()' : 'fwUpdate:SetScript("OnUpdate", function(self, elapsed)');
    for (const n of updateNodes) {
      emitted.clear();
      body.push("  do");
      emitChain(n.id, "then", "    ");
      body.push(...flush());
      body.push("  end");
    }
    body.push("end)");
  }

  for (const n of doc.nodes) {
    const def = nodeDefFor(n, target);
    if (!def || def.pure || reached.has(n.id)) continue;
    if (["event", "slash", "onupdate"].includes(n.type)) continue;
    warn({ node: n.id, code: "GEN_UNREACHABLE", message: { en: `Node ${n.id} (${n.type}) is not connected to any event.`, de: `Knoten ${n.id} (${n.type}) ist mit keinem Ereignis verbunden.` } });
  }
  // variables referenced by pure get_var nodes must be declared as well
  for (const n of doc.nodes) if (n.type === "get_var" || n.type === "set_var") {
    const raw = String(n.props["name"] ?? "");
    if (isIdentifier(raw) && !varNames.includes(raw)) varNames.push(raw);
  }

  const head = [
    "-- Generated by Freewood LUA IDE (visual script) / Erzeugt von der Freewood LUA IDE (visuelles Skript)",
    `-- Target / Ziel: ${target.id}`,
  ];
  if (varNames.length > 0) head.push("", `local ${varNames.join(", ")}`);
  return { code: [...head, ...body, ""].join("\n"), warnings };
}
