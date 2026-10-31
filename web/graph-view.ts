/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Konstanten · constants
 *   [S2] renderGraphView ..... Palette, Zeichenfläche (SVG), Eigenschaften, erzeugter Code
 *   [S3] Zeichnen · drawing .... Knoten, Pins, Kanten
 *   [S4] Bedienung · interaction  Ziehen, Verbinden, Schwenken, Zoomen, Löschen
 *   [S5] Eigenschaften · properties
 */

import { BUILTIN_NODES, COMPARE_OPS, Graph, MATH_OPS, generateLua, highlightLua, nodeDefFor, toHtml, type GNode, type PinDef } from "../src/index.js";
import { clear, h, select, svg, toast } from "./dom.js";
import type { Ctx } from "./ctx.js";

// ===== [S1] Konstanten · constants =====

const W = 210;
const HEAD = 28;
const ROW = 22;
const R = 6;

const CATEGORY_COLORS: Record<string, string> = {
  event: "#c2410c", flow: "#475569", variable: "#7c3aed", value: "#0f766e", math: "#1d4ed8", logic: "#a21caf", wow: "#b45309", text: "#be185d",
};

// ===== [S2] renderGraphView =====

export function renderGraphView(root: HTMLElement, ctx: Ctx, path: string): void {
  clear(root);
  const file = ctx.project.getFile(path);
  if (!file) return;
  let graph: Graph;
  try {
    graph = Graph.parse(file.content, ctx.target);
  } catch (e) {
    root.append(h("p", { class: "error-box", text: `${ctx.t("graph.invalid")}: ${(e as Error).message}` }));
    return;
  }
  graph.setTarget(ctx.target);

  let selectedNode: string | undefined;
  let selectedEdge: number | undefined;
  let pan = { x: 20, y: 20 };
  let zoom = 1;
  let drag: { kind: "node"; id: string; dx: number; dy: number } | { kind: "pan"; sx: number; sy: number; ox: number; oy: number } | { kind: "wire"; from: { node: string; pin: string }; x: number; y: number } | undefined;

  const board = svg("svg", { class: "graph-board", tabindex: "0", "aria-label": ctx.t("graph.board") });
  const side = h("div", { class: "graph-side" });
  const palette = h("div", { class: "graph-palette" });
  const outBox = h("div", { class: "graph-out" });
  root.append(h("div", { class: "graph-main" }, palette, board, side), outBox);

  const commit = (): void => {
    file.content = graph.serialize();
    ctx.project.updateFile(path, file.content);
    ctx.save();
  };

  // ----- Ausgabe · output -----
  function renderOutput(): void {
    clear(outBox);
    const gen = generateLua(graph, ctx.target);
    const name = path.replace(/\.fwgraph$/i, "") + ".generated.lua";
    const code = h("pre", { class: "code-preview" });
    code.innerHTML = toHtml(highlightLua(gen.code));
    const warns = h("ul", { class: "problems" });
    if (gen.warnings.length === 0) warns.append(h("li", { class: "ok", text: ctx.t("graph.noWarnings") }));
    for (const w of gen.warnings) warns.append(h("li", { class: "warning", onclick: () => { if (w.node) select_(w.node); } }, "⚠ ", ctx.text(w.message)));
    outBox.append(
      h("div", { class: "out-head" }, h("strong", { text: ctx.t("graph.generated") }), h("button", { class: "btn", onclick: () => { ctx.writeFile(name, gen.code); toast(ctx.t("graph.written", { file: name })); } }, ctx.t("graph.write", { file: name }))),
      h("div", { class: "out-body" }, code, warns),
    );
  }

  // ===== [S3] Zeichnen · drawing =====
  const nodeHeight = (n: GNode): number => {
    const d = nodeDefFor(n, ctx.target);
    return HEAD + Math.max(d?.inputs.length ?? 0, d?.outputs.length ?? 0, 1) * ROW + 8;
  };
  const pinPos = (id: string, pin: string, side: "in" | "out"): { x: number; y: number } | undefined => {
    const n = graph.getNode(id);
    const d = n && nodeDefFor(n, ctx.target);
    if (!n || !d) return undefined;
    const list = side === "in" ? d.inputs : d.outputs;
    const i = list.findIndex((p) => p.name === pin);
    if (i < 0) return undefined;
    return { x: n.x + (side === "in" ? 0 : W), y: n.y + HEAD + i * ROW + ROW / 2 };
  };
  const pinColor = (p: PinDef): string => (p.kind === "exec" ? "#e5e7eb" : "#38bdf8");

  function redraw(): void {
    clear(board);
    const vp = svg("g", { transform: `translate(${pan.x},${pan.y}) scale(${zoom})` });
    const edges = svg("g", { class: "edges" });
    graph.doc.edges.forEach((e, i) => {
      const a = pinPos(e.from.node, e.from.pin, "out");
      const b = pinPos(e.to.node, e.to.pin, "in");
      if (!a || !b) return;
      const def = graph.defOf(e.from.node)?.outputs.find((p) => p.name === e.from.pin);
      const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
      const d = `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
      edges.append(
        svg("path", { d, class: `edge ${def?.kind === "exec" ? "exec" : "data"}${selectedEdge === i ? " sel" : ""}` }),
        svg("path", { d, class: "edge-hit", "data-edge": String(i) }),
      );
    });
    if (drag?.kind === "wire") {
      const a = pinPos(drag.from.node, drag.from.pin, "out");
      if (a) edges.append(svg("path", { d: `M${a.x},${a.y} L${drag.x},${drag.y}`, class: "edge wire" }));
    }
    vp.append(edges);
    for (const n of graph.doc.nodes) {
      const d = nodeDefFor(n, ctx.target);
      if (!d) continue;
      const g = svg("g", { class: `node${selectedNode === n.id ? " sel" : ""}`, transform: `translate(${n.x},${n.y})`, "data-node": n.id });
      g.append(svg("rect", { class: "node-body", width: W, height: nodeHeight(n), rx: 6 }));
      g.append(svg("rect", { class: "node-head", width: W, height: HEAD, rx: 6, fill: CATEGORY_COLORS[d.category] ?? "#475569", "data-head": n.id }));
      g.append(svg("text", { class: "node-title", x: 10, y: 18, text: ctx.text(d.title) }));
      const sub = nodeSubtitle(n);
      if (sub) g.append(svg("text", { class: "node-sub", x: W - 8, y: 18, "text-anchor": "end", text: sub }));
      d.inputs.forEach((p, i) => {
        const y = HEAD + i * ROW + ROW / 2;
        const connected = graph.edgeInto(n.id, p.name);
        g.append(svg("circle", { class: `pin ${p.kind}${connected ? " on" : ""}`, cx: 0, cy: y, r: R, fill: pinColor(p), "data-pin": `${n.id}|${p.name}|in`, "data-kind": p.kind }));
        g.append(svg("text", { class: "pin-label", x: 12, y: y + 4, text: p.label ? ctx.text(p.label) : p.name }));
        const lit = n.props[`lit.${p.name}`];
        if (p.kind === "data" && !connected && lit !== undefined) g.append(svg("text", { class: "pin-lit", x: 12 + 8 * (p.name.length + 1), y: y + 4, text: `= ${String(lit)}` }));
      });
      d.outputs.forEach((p, i) => {
        const y = HEAD + i * ROW + ROW / 2;
        g.append(svg("circle", { class: `pin ${p.kind}`, cx: W, cy: y, r: R, fill: pinColor(p), "data-pin": `${n.id}|${p.name}|out`, "data-kind": p.kind }));
        g.append(svg("text", { class: "pin-label out", x: W - 12, y: y + 4, "text-anchor": "end", text: p.label ? ctx.text(p.label) : p.name }));
      });
      vp.append(g);
    }
    board.append(vp);
  }

  function nodeSubtitle(n: GNode): string {
    switch (n.type) {
      case "number": case "string": case "boolean": return String(n.props["value"] ?? "").slice(0, 16);
      case "get_var": case "set_var": return String(n.props["name"] ?? "");
      case "math": case "compare": return String(n.props["op"] ?? "");
      case "logic": return String(n.props["op"] ?? "and");
      case "slash": return "/" + String(n.props["command"] ?? "").replace(/^\//, "");
      default: return "";
    }
  }

  // ===== [S4] Bedienung · interaction =====
  const toGraph = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const r = board.getBoundingClientRect();
    return { x: (e.clientX - r.left - pan.x) / zoom, y: (e.clientY - r.top - pan.y) / zoom };
  };

  function select_(id: string | undefined): void {
    selectedNode = id;
    selectedEdge = undefined;
    redraw();
    renderSide();
  }

  board.addEventListener("pointerdown", (ev) => {
    const e = ev as PointerEvent;
    const target = e.target as Element;
    board.focus();
    const pin = target.getAttribute("data-pin");
    if (pin) {
      const [node, name, side] = pin.split("|") as [string, string, string];
      if (side === "out") {
        const p = toGraph(e);
        drag = { kind: "wire", from: { node, pin: name }, x: p.x, y: p.y };
        board.setPointerCapture(e.pointerId);
      } else {
        // pulling on a connected input detaches the wire and continues it from the source
        const edge = graph.edgeInto(node, name);
        if (edge) {
          graph.disconnect({ node, pin: name });
          const p = toGraph(e);
          drag = { kind: "wire", from: edge.from, x: p.x, y: p.y };
          board.setPointerCapture(e.pointerId);
          commit();
          redraw();
        }
      }
      return;
    }
    const edgeIdx = target.getAttribute("data-edge");
    if (edgeIdx !== null) {
      selectedEdge = Number(edgeIdx);
      selectedNode = undefined;
      redraw();
      renderSide();
      return;
    }
    const nodeEl = target.closest("[data-node]");
    if (nodeEl) {
      const id = nodeEl.getAttribute("data-node")!;
      const n = graph.getNode(id)!;
      const p = toGraph(e);
      drag = { kind: "node", id, dx: p.x - n.x, dy: p.y - n.y };
      board.setPointerCapture(e.pointerId);
      select_(id);
      return;
    }
    drag = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y };
    board.setPointerCapture(e.pointerId);
    select_(undefined);
  });

  board.addEventListener("pointermove", (ev) => {
    const e = ev as PointerEvent;
    if (!drag) return;
    if (drag.kind === "node") {
      const p = toGraph(e);
      graph.moveNode(drag.id, Math.round(p.x - drag.dx), Math.round(p.y - drag.dy));
    } else if (drag.kind === "pan") {
      pan = { x: drag.ox + e.clientX - drag.sx, y: drag.oy + e.clientY - drag.sy };
    } else {
      const p = toGraph(e);
      drag.x = p.x;
      drag.y = p.y;
    }
    redraw();
  });

  board.addEventListener("pointerup", (ev) => {
    const e = ev as PointerEvent;
    if (!drag) return;
    const d = drag;
    drag = undefined;
    if (d.kind === "wire") {
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute("data-pin");
      if (hit) {
        const [node, name, side] = hit.split("|") as [string, string, string];
        if (side === "in") {
          try {
            graph.connect(d.from, { node, pin: name });
          } catch (err) {
            toast(ctx.t("graph.cannotConnect") + ": " + (err as Error).message, "error");
          }
        }
      }
    }
    commit();
    redraw();
    renderSide();
    renderOutput();
  });

  board.addEventListener("wheel", (ev) => {
    const e = ev as WheelEvent;
    e.preventDefault();
    const before = toGraph(e);
    zoom = Math.max(0.4, Math.min(2, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    const r = board.getBoundingClientRect();
    pan = { x: e.clientX - r.left - before.x * zoom, y: e.clientY - r.top - before.y * zoom };
    redraw();
  }, { passive: false });

  board.addEventListener("keydown", (ev) => {
    const e = ev as KeyboardEvent;
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (selectedNode) {
      graph.removeNode(selectedNode);
      selectedNode = undefined;
    } else if (selectedEdge !== undefined) {
      graph.doc.edges.splice(selectedEdge, 1);
      selectedEdge = undefined;
    } else return;
    commit();
    redraw();
    renderSide();
    renderOutput();
  });

  // ----- Palette -----
  function addNode(type: string, props: Record<string, string | number | boolean> = {}): void {
    const r = board.getBoundingClientRect();
    const x = Math.round((r.width / 2 - pan.x) / zoom - W / 2 + (graph.doc.nodes.length % 5) * 24);
    const y = Math.round((r.height / 2 - pan.y) / zoom - 40 + (graph.doc.nodes.length % 5) * 24);
    const n = graph.addNode(type, x, y, props);
    commit();
    select_(n.id);
    renderOutput();
  }

  function renderPalette(filter = ""): void {
    clear(palette);
    const input = h("input", { class: "filter", type: "search", placeholder: ctx.t("graph.filter"), value: filter, "aria-label": ctx.t("graph.filter") });
    input.addEventListener("input", () => {
      const pos = input.selectionStart;
      renderPalette(input.value);
      const again = palette.querySelector("input")!;
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    palette.append(input);
    const f = filter.toLowerCase();
    const group = (title: string, entries: { label: string; run: () => void }[]): void => {
      const shown = entries.filter((x) => x.label.toLowerCase().includes(f));
      if (!shown.length) return;
      palette.append(h("div", { class: "pal-title", text: title }));
      for (const x of shown.slice(0, 60)) palette.append(h("button", { class: "pal-item", onclick: x.run, text: x.label }));
    };
    group(ctx.t("graph.events"), [...ctx.target.events.keys()].map((name) => ({ label: name, run: () => addNode("event", { event: name }) })));
    group(ctx.t("graph.functions"), [...ctx.target.functions.keys()].map((name) => ({ label: name, run: () => addNode("call", { fn: name }) })));
    const builtins = Object.values(BUILTIN_NODES).map((d) => ({ label: ctx.text(d.title), run: () => addNode(d.type) }));
    group(ctx.t("graph.builtins"), builtins);
  }

  // ===== [S5] Eigenschaften · properties =====
  function pruneEdges(): void {
    graph.doc.edges = graph.doc.edges.filter((e) => {
      const a = graph.defOf(e.from.node)?.outputs.some((p) => p.name === e.from.pin);
      const b = graph.defOf(e.to.node)?.inputs.some((p) => p.name === e.to.pin);
      return a && b;
    });
  }

  function renderSide(): void {
    clear(side);
    if (selectedEdge !== undefined) {
      side.append(h("p", { text: ctx.t("graph.edgeSelected") }), h("button", { class: "btn danger", onclick: () => { graph.doc.edges.splice(selectedEdge!, 1); selectedEdge = undefined; commit(); redraw(); renderSide(); renderOutput(); } }, ctx.t("common.delete")));
      return;
    }
    const n = selectedNode ? graph.getNode(selectedNode) : undefined;
    if (!n) {
      side.append(h("p", { class: "muted", text: ctx.t("graph.hint") }));
      return;
    }
    const d = nodeDefFor(n, ctx.target)!;
    const change = (key: string, value: string | number | boolean, structural = false): void => {
      graph.setProp(n.id, key, value);
      if (structural) pruneEdges();
      commit();
      redraw();
      renderOutput();
      if (structural) renderSide();
    };
    const field = (label: string, control: HTMLElement): HTMLElement => h("label", { class: "field" }, h("span", { text: label }), control);
    const text = (key: string, label: string, textarea = false): HTMLElement => {
      const el = textarea ? h("textarea", { rows: 6 }) : h("input", { type: "text" });
      (el as HTMLInputElement).value = String(n.props[key] ?? "");
      el.addEventListener("input", () => change(key, (el as HTMLInputElement).value));
      return field(label, el);
    };
    side.append(h("h3", { text: ctx.text(d.title) }), h("div", { class: "muted", text: `${n.type} · ${n.id}` }));
    switch (n.type) {
      case "event":
        side.append(field(ctx.t("graph.event"), select([...ctx.target.events.keys()].map((v) => ({ value: v, label: v })), String(n.props["event"] ?? ""), (v) => change("event", v, true))));
        break;
      case "call":
        side.append(field(ctx.t("graph.function"), select([...ctx.target.functions.keys()].map((v) => ({ value: v, label: v })), String(n.props["fn"] ?? ""), (v) => change("fn", v, true))));
        break;
      case "get_var": case "set_var": side.append(text("name", ctx.t("graph.varName"))); break;
      case "number": {
        const el = h("input", { type: "number", step: "any", value: String(n.props["value"] ?? 0) });
        el.addEventListener("input", () => change("value", Number(el.value)));
        side.append(field(ctx.t("graph.value"), el));
        break;
      }
      case "string": side.append(text("value", ctx.t("graph.value"), true)); break;
      case "boolean": side.append(field(ctx.t("graph.value"), select([{ value: "true", label: "true" }, { value: "false", label: "false" }], String(n.props["value"] ?? true), (v) => change("value", v === "true")))); break;
      case "math": side.append(field(ctx.t("graph.operator"), select(MATH_OPS.map((v) => ({ value: v, label: v })), String(n.props["op"] ?? "+"), (v) => change("op", v)))); break;
      case "compare": side.append(field(ctx.t("graph.operator"), select(COMPARE_OPS.map((v) => ({ value: v, label: v })), String(n.props["op"] ?? "=="), (v) => change("op", v)))); break;
      case "logic": side.append(field(ctx.t("graph.operator"), select([{ value: "and", label: "and" }, { value: "or", label: "or" }], String(n.props["op"] ?? "and"), (v) => change("op", v)))); break;
      case "slash": side.append(text("command", ctx.t("graph.command"))); break;
      case "raw": side.append(text("code", ctx.t("graph.code"), true)); break;
      default:
    }
    const open = d.inputs.filter((p) => p.kind === "data" && !graph.edgeInto(n.id, p.name));
    if (open.length) {
      side.append(h("h4", { text: ctx.t("graph.inputs") }), h("p", { class: "muted", text: ctx.t("graph.literalHint") }));
      for (const p of open) {
        const el = h("input", { type: "text", placeholder: p.dataType ?? "" });
        el.value = String(n.props[`lit.${p.name}`] ?? "");
        el.addEventListener("input", () => {
          if (el.value === "") delete n.props[`lit.${p.name}`];
          else n.props[`lit.${p.name}`] = el.value;
          commit();
          redraw();
          renderOutput();
        });
        side.append(field(p.name, el));
      }
    }
    side.append(h("button", { class: "btn danger", onclick: () => { graph.removeNode(n.id); selectedNode = undefined; commit(); redraw(); renderSide(); renderOutput(); } }, ctx.t("common.delete")));
  }

  renderPalette();
  redraw();
  renderSide();
  renderOutput();
}
