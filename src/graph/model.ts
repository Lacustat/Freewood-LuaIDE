/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Datentypen · data types .... GraphDoc, GNode, GEdge, PinDef, NodeDef
 *   [S2] Knoten-Katalog · catalog ... eingebaute Knotentypen
 *   [S3] nodeDefFor ................. Knotentyp → Pins (auch aus Plugin-Daten)
 *   [S4] Graph ...................... Bearbeitungsmodell mit Prüfungen
 *   [S5] Serialisierung ............. freewood-graph v1
 *
 * DE: Datenmodell für das visuelle Scripting. Ausführungs-Pins ("exec") bilden den Ablauf,
 *     Daten-Pins ("data") tragen Werte. Knoten für Events und Funktionen entstehen aus den
 *     Plugin-Daten des Ziels.
 * EN: data model for visual scripting. Exec pins form the flow, data pins carry values.
 *     Event and function nodes are derived from the target's plugin data.
 */

import type { ResolvedTarget } from "../core/plugins.js";
import type { LocalizedText } from "../plugin-api/types.js";
import { FreewoodError } from "../core/errors.js";

// ===== [S1] Datentypen · data types =====

export type PropValue = string | number | boolean;

export interface GNode {
  id: string;
  type: string;
  x: number;
  y: number;
  props: Record<string, PropValue>;
}

export interface PinRef {
  node: string;
  pin: string;
}

export interface GEdge {
  from: PinRef;
  to: PinRef;
}

export interface GraphDoc {
  format: "freewood-graph";
  version: 1;
  nodes: GNode[];
  edges: GEdge[];
}

export interface PinDef {
  name: string;
  kind: "exec" | "data";
  label?: LocalizedText;
  /** DE: Hinweis auf den Datentyp (nur Anzeige). EN: data type hint (display only). */
  dataType?: string;
}

export interface NodeDef {
  type: string;
  title: LocalizedText;
  category: "event" | "flow" | "variable" | "value" | "math" | "logic" | "wow" | "text";
  inputs: PinDef[];
  outputs: PinDef[];
  /** DE: Reiner Ausdruck ohne Ablaufpins. EN: pure expression without exec pins. */
  pure: boolean;
}

// ===== [S2] Knoten-Katalog · catalog =====

const T = (en: string, de: string): LocalizedText => ({ en, de });
const exec = (name: string, label?: LocalizedText): PinDef => ({ name, kind: "exec", label });
const data = (name: string, dataType = "any"): PinDef => ({ name, kind: "data", dataType });

export const MATH_OPS = ["+", "-", "*", "/", "%", "^"] as const;
export const COMPARE_OPS = ["==", "~=", "<", ">", "<=", ">="] as const;

export const BUILTIN_NODES: Record<string, NodeDef> = {
  if: { type: "if", title: T("If", "Wenn"), category: "flow", pure: false, inputs: [exec("in"), data("cond", "boolean")], outputs: [exec("then", T("true", "wahr")), exec("else", T("false", "falsch")), exec("done", T("after", "danach"))] },
  for: { type: "for", title: T("For loop", "Zählschleife"), category: "flow", pure: false, inputs: [exec("in"), data("from", "number"), data("to", "number"), data("step", "number")], outputs: [exec("body"), exec("done", T("after", "danach")), data("index", "number")] },
  while: { type: "while", title: T("While loop", "Solange-Schleife"), category: "flow", pure: false, inputs: [exec("in"), data("cond", "boolean")], outputs: [exec("body"), exec("done", T("after", "danach"))] },
  sequence: { type: "sequence", title: T("Sequence", "Reihenfolge"), category: "flow", pure: false, inputs: [exec("in")], outputs: [exec("then1"), exec("then2"), exec("then3")] },
  delay: { type: "delay", title: T("Delay (seconds)", "Verzögerung (Sekunden)"), category: "flow", pure: false, inputs: [exec("in"), data("seconds", "number")], outputs: [exec("then")] },
  set_var: { type: "set_var", title: T("Set variable", "Variable setzen"), category: "variable", pure: false, inputs: [exec("in"), data("value")], outputs: [exec("then")] },
  get_var: { type: "get_var", title: T("Get variable", "Variable lesen"), category: "variable", pure: true, inputs: [], outputs: [data("value")] },
  number: { type: "number", title: T("Number", "Zahl"), category: "value", pure: true, inputs: [], outputs: [data("value", "number")] },
  string: { type: "string", title: T("Text", "Text"), category: "value", pure: true, inputs: [], outputs: [data("value", "string")] },
  boolean: { type: "boolean", title: T("Boolean", "Wahrheitswert"), category: "value", pure: true, inputs: [], outputs: [data("value", "boolean")] },
  nil: { type: "nil", title: T("Nil", "Nil"), category: "value", pure: true, inputs: [], outputs: [data("value")] },
  math: { type: "math", title: T("Math", "Rechnen"), category: "math", pure: true, inputs: [data("a", "number"), data("b", "number")], outputs: [data("result", "number")] },
  compare: { type: "compare", title: T("Compare", "Vergleichen"), category: "logic", pure: true, inputs: [data("a"), data("b")], outputs: [data("result", "boolean")] },
  logic: { type: "logic", title: T("And / Or", "Und / Oder"), category: "logic", pure: true, inputs: [data("a"), data("b")], outputs: [data("result")] },
  not: { type: "not", title: T("Not", "Nicht"), category: "logic", pure: true, inputs: [data("a")], outputs: [data("result", "boolean")] },
  concat: { type: "concat", title: T("Join text", "Text verbinden"), category: "text", pure: true, inputs: [data("a"), data("b")], outputs: [data("result", "string")] },
  length: { type: "length", title: T("Table length", "Tabellenlänge"), category: "math", pure: true, inputs: [data("table", "table")], outputs: [data("result", "number")] },
  print: { type: "print", title: T("Print to chat", "In den Chat ausgeben"), category: "wow", pure: false, inputs: [exec("in"), data("text")], outputs: [exec("then")] },
  slash: { type: "slash", title: T("Slash command", "Chat-Befehl"), category: "event", pure: false, inputs: [], outputs: [exec("then"), data("msg", "string")] },
  onupdate: { type: "onupdate", title: T("Every frame (OnUpdate)", "Jedes Bild (OnUpdate)"), category: "event", pure: false, inputs: [], outputs: [exec("then"), data("elapsed", "number")] },
  raw: { type: "raw", title: T("Lua code", "Lua-Code"), category: "flow", pure: false, inputs: [exec("in")], outputs: [exec("then")] },
};

// ===== [S3] nodeDefFor =====

export function nodeDefFor(node: Pick<GNode, "type" | "props">, target?: ResolvedTarget): NodeDef | undefined {
  if (node.type === "event") {
    const name = String(node.props["event"] ?? "");
    const ev = target?.events.get(name);
    return {
      type: "event", title: T(`Event ${name}`, `Ereignis ${name}`), category: "event", pure: false, inputs: [],
      outputs: [exec("then"), ...(ev?.payload ?? []).map((p) => data(p.name, p.type))],
    };
  }
  if (node.type === "call") {
    const name = String(node.props["fn"] ?? "");
    const f = target?.functions.get(name);
    return {
      type: "call", title: T(name, name), category: "wow", pure: false,
      inputs: [exec("in"), ...(f?.params ?? []).map((p) => data(p.name, p.type))],
      outputs: [exec("then"), ...(f?.returns ?? []).map((p) => data(p.name, p.type))],
    };
  }
  return BUILTIN_NODES[node.type];
}

// ===== [S4] Graph =====

let seq = 0;

export class Graph {
  doc: GraphDoc;
  constructor(doc?: GraphDoc, private target?: ResolvedTarget) {
    this.doc = doc ?? { format: "freewood-graph", version: 1, nodes: [], edges: [] };
  }

  setTarget(t: ResolvedTarget | undefined): void {
    this.target = t;
  }

  getNode(id: string): GNode | undefined {
    return this.doc.nodes.find((n) => n.id === id);
  }

  defOf(id: string): NodeDef | undefined {
    const n = this.getNode(id);
    return n ? nodeDefFor(n, this.target) : undefined;
  }

  addNode(type: string, x = 0, y = 0, props: Record<string, PropValue> = {}): GNode {
    if (type !== "event" && type !== "call" && !BUILTIN_NODES[type]) throw new FreewoodError("GRAPH_NODE_TYPE", `Unknown node type '${type}'`);
    let id: string;
    do id = `n${++seq}`; while (this.getNode(id));
    const defaults: Record<string, PropValue> = type === "math" ? { op: "+" } : type === "compare" ? { op: "==" } : type === "logic" ? { op: "and" } : type === "number" ? { value: 0 } : type === "boolean" ? { value: true } : {};
    const node: GNode = { id, type, x, y, props: { ...defaults, ...props } };
    this.doc.nodes.push(node);
    return node;
  }

  removeNode(id: string): void {
    this.doc.nodes = this.doc.nodes.filter((n) => n.id !== id);
    this.doc.edges = this.doc.edges.filter((e) => e.from.node !== id && e.to.node !== id);
  }

  moveNode(id: string, x: number, y: number): void {
    const n = this.getNode(id);
    if (!n) throw new FreewoodError("GRAPH_NODE_MISSING", `No node '${id}'`);
    n.x = x;
    n.y = y;
  }

  setProp(id: string, key: string, value: PropValue): void {
    const n = this.getNode(id);
    if (!n) throw new FreewoodError("GRAPH_NODE_MISSING", `No node '${id}'`);
    n.props[key] = value;
  }

  /**
   * DE: Verbindet einen Ausgangs- mit einem Eingangs-Pin. Regeln: exec↔exec, data↔data;
   *     ein Eingang hat höchstens eine Verbindung; ein Ablauf-Ausgang führt zu höchstens
   *     einem Knoten; keine Verbindung eines Knotens mit sich selbst.
   * EN: connects an output pin to an input pin. Rules: exec↔exec, data↔data; an input has at
   *     most one connection; an exec output leads to at most one node; no self-connection.
   */
  connect(from: PinRef, to: PinRef): GEdge {
    const fd = this.defOf(from.node);
    const td = this.defOf(to.node);
    if (!fd || !td) throw new FreewoodError("GRAPH_NODE_MISSING", "Unknown node in connection");
    if (from.node === to.node) throw new FreewoodError("GRAPH_SELF", "A node cannot connect to itself");
    const out = fd.outputs.find((p) => p.name === from.pin);
    const inp = td.inputs.find((p) => p.name === to.pin);
    if (!out) throw new FreewoodError("GRAPH_PIN", `No output pin '${from.pin}' on '${from.node}'`);
    if (!inp) throw new FreewoodError("GRAPH_PIN", `No input pin '${to.pin}' on '${to.node}'`);
    if (out.kind !== inp.kind) throw new FreewoodError("GRAPH_KIND", `Cannot connect ${out.kind} pin to ${inp.kind} pin`);
    this.doc.edges = this.doc.edges.filter((e) => !(e.to.node === to.node && e.to.pin === to.pin));
    if (out.kind === "exec") this.doc.edges = this.doc.edges.filter((e) => !(e.from.node === from.node && e.from.pin === from.pin));
    const edge: GEdge = { from: { ...from }, to: { ...to } };
    this.doc.edges.push(edge);
    return edge;
  }

  disconnect(to: PinRef): void {
    this.doc.edges = this.doc.edges.filter((e) => !(e.to.node === to.node && e.to.pin === to.pin));
  }

  edgeInto(node: string, pin: string): GEdge | undefined {
    return this.doc.edges.find((e) => e.to.node === node && e.to.pin === pin);
  }

  edgeFrom(node: string, pin: string): GEdge | undefined {
    return this.doc.edges.find((e) => e.from.node === node && e.from.pin === pin);
  }

  // ===== [S5] Serialisierung =====

  serialize(): string {
    return JSON.stringify(this.doc, null, 2);
  }

  static parse(json: string, target?: ResolvedTarget): Graph {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new FreewoodError("GRAPH_PARSE", "Graph file is not valid JSON");
    }
    const d = raw as Partial<GraphDoc>;
    if (!d || d.format !== "freewood-graph" || d.version !== 1 || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) {
      throw new FreewoodError("GRAPH_PARSE", "Not a freewood-graph v1 file");
    }
    const ids = new Set<string>();
    for (const n of d.nodes) {
      if (!n || typeof n.id !== "string" || typeof n.type !== "string" || ids.has(n.id)) throw new FreewoodError("GRAPH_PARSE", "Invalid or duplicate node");
      ids.add(n.id);
      n.props = n.props ?? {};
      n.x = Number(n.x) || 0;
      n.y = Number(n.y) || 0;
    }
    for (const e of d.edges) {
      if (!e?.from || !e?.to || !ids.has(e.from.node) || !ids.has(e.to.node)) throw new FreewoodError("GRAPH_PARSE", "Edge refers to a missing node");
    }
    // keep generated ids unique
    for (const id of ids) {
      const m = /^n(\d+)$/.exec(id);
      if (m) seq = Math.max(seq, Number(m[1]));
    }
    return new Graph(d as GraphDoc, target);
  }
}
