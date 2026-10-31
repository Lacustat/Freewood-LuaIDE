/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Mini-XML ........... parseXml, XmlNode, escape
 *   [S2] generateFormXml .... FormModel → WoW-UI-XML
 *   [S3] importFormXml ...... WoW-UI-XML → FormModel (Teilmenge, die der Editor erzeugt)
 *
 * DE: Vanilla/ClassicAPI schreiben Größen als <Size><AbsDimension x y/></Size>, Retail kennt
 *     die Kurzform <Size x y/>. Skripte stehen als Elementtext in <Scripts>.
 * EN: Vanilla/ClassicAPI write sizes as <Size><AbsDimension x y/></Size>, retail also has the
 *     short form <Size x y/>. Scripts are element text inside <Scripts>.
 */

import { FreewoodError } from "../core/errors.js";
import type { ResolvedTarget } from "../core/plugins.js";
import { FormModel, isRegion, type Anchor, type AnchorPoint, type FormWidget } from "./model.js";
import { orderForCreation, type FormWarning } from "./codegen.js";

// ===== [S1] Mini-XML =====

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}

export function parseXml(src: string): XmlNode {
  let i = 0;
  const line = () => src.slice(0, i).split("\n").length;
  const fail = (m: string): never => {
    throw new FreewoodError("XML_PARSE", `XML error in line ${line()}: ${m}`);
  };
  const skipWs = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const skipMisc = () => {
    for (;;) {
      skipWs();
      if (src.startsWith("<?", i)) {
        const e = src.indexOf("?>", i);
        if (e < 0) fail("unterminated <?");
        i = e + 2;
      } else if (src.startsWith("<!--", i)) {
        const e = src.indexOf("-->", i);
        if (e < 0) fail("unterminated comment");
        i = e + 3;
      } else return;
    }
  };
  const element = (): XmlNode => {
    if (src[i] !== "<") fail("'<' expected");
    i++;
    const m = /^[A-Za-z_][\w:.-]*/.exec(src.slice(i));
    if (!m) return fail("tag name expected");
    const node: XmlNode = { tag: m[0], attrs: {}, children: [], text: "" };
    i += m[0].length;
    for (;;) {
      skipWs();
      if (src.startsWith("/>", i)) {
        i += 2;
        return node;
      }
      if (src[i] === ">") {
        i++;
        break;
      }
      const a = /^([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(src.slice(i));
      if (!a) return fail(`bad attribute in <${node.tag}>`);
      node.attrs[a[1]!] = unescapeXml(a[3] ?? a[4] ?? "");
      i += a[0].length;
    }
    for (;;) {
      if (i >= src.length) fail(`<${node.tag}> is not closed`);
      if (src.startsWith("</", i)) {
        const e = src.indexOf(">", i);
        const name = src.slice(i + 2, e).trim();
        if (name !== node.tag) fail(`</${name}> does not match <${node.tag}>`);
        i = e + 1;
        node.text = node.text.trim();
        return node;
      }
      if (src.startsWith("<!--", i)) {
        const e = src.indexOf("-->", i);
        if (e < 0) fail("unterminated comment");
        i = e + 3;
      } else if (src.startsWith("<![CDATA[", i)) {
        const e = src.indexOf("]]>", i);
        if (e < 0) fail("unterminated CDATA");
        node.text += src.slice(i + 9, e);
        i = e + 3;
      } else if (src[i] === "<") node.children.push(element());
      else {
        const e = src.indexOf("<", i);
        const end = e < 0 ? src.length : e;
        node.text += unescapeXml(src.slice(i, end));
        i = end;
      }
    }
  };
  skipMisc();
  const root = element();
  skipMisc();
  if (i < src.length) fail("unexpected content after the root element");
  return root;
}

// ===== [S2] generateFormXml =====

export function generateFormXml(source: FormModel, target: ResolvedTarget): { xml: string; warnings: FormWarning[] } {
  const model = source;
  const warnings: FormWarning[] = [];
  const modern = target.scriptArgs === "arguments";
  const out: string[] = [];
  const nameOf = (id: string | null): string | undefined => (id ? model.get(id)?.name || undefined : undefined);
  const dim = (tag: string, x: number, y: number, ind: string): string[] =>
    modern ? [`${ind}<${tag} x="${x}" y="${y}"/>`] : [`${ind}<${tag}>`, `${ind}  <AbsDimension x="${x}" y="${y}"/>`, `${ind}</${tag}>`];

  const emit = (w: FormWidget, ind: string): void => {
    const attrs: string[] = [];
    if (w.name) attrs.push(`name="${escapeXml(w.name)}"`);
    if (w.inherits) attrs.push(`inherits="${escapeXml(w.inherits)}"`);
    if (!w.parent) attrs.push('parent="UIParent"');
    if (w.strata) attrs.push(`frameStrata="${w.strata}"`);
    if (w.hidden) attrs.push('hidden="true"');
    if (w.movable) attrs.push('movable="true"');
    if (w.enableMouse) attrs.push('enableMouse="true"');
    if (w.alpha !== undefined && w.alpha !== 1 && !isRegion(w.kind)) attrs.push(`alpha="${w.alpha}"`);
    if (w.level && !isRegion(w.kind)) attrs.push(`frameLevel="${w.level}"`);
    if (w.text !== undefined) attrs.push(`text="${escapeXml(w.text)}"`);
    if (w.texture) attrs.push(`file="${escapeXml(w.texture)}"`);
    if (w.font?.object) attrs.push(`inherits="${escapeXml(w.font.object)}"`);
    const kids = model.childrenOf(w.id);
    const frames = kids.filter((k) => !isRegion(k.kind));
    const regions = kids.filter((k) => isRegion(k.kind));
    const body: string[] = [];
    const i1 = ind + "  ";
    if (w.width !== undefined && w.height !== undefined) body.push(...dim("Size", w.width, w.height, i1));
    if (w.anchors.length) {
      body.push(`${i1}<Anchors>`);
      for (const a of w.anchors) {
        const rel = a.relativeTo ? nameOf(a.relativeTo) : undefined;
        if (a.relativeTo && !rel) warnings.push({ widget: w.id, code: "FORM_UNNAMED_ANCHOR", message: { en: "An anchor refers to a widget without a name; XML needs a name.", de: "Ein Anker verweist auf ein Widget ohne Namen; XML braucht einen Namen." } });
        const relAttr = rel ? ` relativeTo="${escapeXml(rel)}"` : "";
        const relPoint = ` relativePoint="${a.relativePoint}"`;
        const offs = a.x || a.y ? dim("Offset", a.x, a.y, i1 + "    ") : [];
        if (offs.length) body.push(`${i1}  <Anchor point="${a.point}"${relAttr}${relPoint}>`, ...offs, `${i1}  </Anchor>`);
        else body.push(`${i1}  <Anchor point="${a.point}"${relAttr}${relPoint}/>`);
      }
      body.push(`${i1}</Anchors>`);
    }
    if (w.backdrop) {
      const b = w.backdrop;
      const ba: string[] = [];
      if (b.bgFile) ba.push(`bgFile="${escapeXml(b.bgFile)}"`);
      if (b.edgeFile) ba.push(`edgeFile="${escapeXml(b.edgeFile)}"`);
      if (b.tile !== undefined) ba.push(`tile="${b.tile}"`);
      body.push(`${i1}<Backdrop ${ba.join(" ")}>`);
      if (b.insets) body.push(`${i1}  <BackgroundInsets>`, `${i1}    <AbsInset left="${b.insets.left}" right="${b.insets.right}" top="${b.insets.top}" bottom="${b.insets.bottom}"/>`, `${i1}  </BackgroundInsets>`);
      if (b.tileSize !== undefined) body.push(`${i1}  <TileSize>`, `${i1}    <AbsValue val="${b.tileSize}"/>`, `${i1}  </TileSize>`);
      if (b.edgeSize !== undefined) body.push(`${i1}  <EdgeSize>`, `${i1}    <AbsValue val="${b.edgeSize}"/>`, `${i1}  </EdgeSize>`);
      if (b.color) body.push(`${i1}  <Color r="${b.color.r}" g="${b.color.g}" b="${b.color.b}" a="${b.color.a}"/>`);
      if (b.borderColor) body.push(`${i1}  <BorderColor r="${b.borderColor.r}" g="${b.borderColor.g}" b="${b.borderColor.b}" a="${b.borderColor.a}"/>`);
      body.push(`${i1}</Backdrop>`);
    }
    if (regions.length) {
      body.push(`${i1}<Layers>`);
      const layers = new Map<string, FormWidget[]>();
      for (const r of regions) layers.set(r.layer ?? "ARTWORK", [...(layers.get(r.layer ?? "ARTWORK") ?? []), r]);
      for (const layer of model.drawLayers.filter((l) => layers.has(l))) {
        body.push(`${i1}  <Layer level="${layer}">`);
        for (const r of layers.get(layer)!) emitRegion(r, i1 + "    ", body);
        body.push(`${i1}  </Layer>`);
      }
      body.push(`${i1}</Layers>`);
    }
    if (frames.length) {
      body.push(`${i1}<Frames>`);
      for (const f of frames) {
        const sub: string[] = [];
        emitInto(f, i1 + "  ", sub);
        body.push(...sub);
      }
      body.push(`${i1}</Frames>`);
    }
    const scripts = Object.entries(w.scripts).filter(([, b]) => b.trim());
    if (scripts.length) {
      body.push(`${i1}<Scripts>`);
      for (const [s, code] of scripts) body.push(`${i1}  <${s}>${escapeXml(code).replace(/&quot;/g, '"')}</${s}>`);
      body.push(`${i1}</Scripts>`);
    }
    out.push(`${ind}<${w.kind}${attrs.length ? " " + attrs.join(" ") : ""}${body.length ? ">" : "/>"}`);
    if (body.length) {
      out.push(...body, `${ind}</${w.kind}>`);
    }
  };

  const emitInto = (w: FormWidget, ind: string, into: string[]): void => {
    const save = out.splice(0, out.length);
    emit(w, ind);
    into.push(...out.splice(0, out.length));
    out.push(...save);
  };

  const emitRegion = (r: FormWidget, ind: string, into: string[]): void => {
    const a: string[] = [];
    if (r.name) a.push(`name="${escapeXml(r.name)}"`);
    if (r.font?.object ?? r.inherits) a.push(`inherits="${escapeXml((r.font?.object ?? r.inherits)!)}"`);
    if (r.text !== undefined) a.push(`text="${escapeXml(r.text)}"`);
    if (r.texture) a.push(`file="${escapeXml(r.texture)}"`);
    const inner: string[] = [];
    const i2 = ind + "  ";
    if (r.width !== undefined && r.height !== undefined) inner.push(...dim("Size", r.width, r.height, i2));
    if (r.anchors.length) {
      inner.push(`${i2}<Anchors>`);
      for (const an of r.anchors) {
        const rel = an.relativeTo ? nameOf(an.relativeTo) : undefined;
        const relAttr = rel ? ` relativeTo="${escapeXml(rel)}"` : "";
        const offs = an.x || an.y ? dim("Offset", an.x, an.y, i2 + "    ") : [];
        if (offs.length) inner.push(`${i2}  <Anchor point="${an.point}"${relAttr} relativePoint="${an.relativePoint}">`, ...offs, `${i2}  </Anchor>`);
        else inner.push(`${i2}  <Anchor point="${an.point}"${relAttr} relativePoint="${an.relativePoint}"/>`);
      }
      inner.push(`${i2}</Anchors>`);
    }
    if (r.color) inner.push(`${i2}<Color r="${r.color.r}" g="${r.color.g}" b="${r.color.b}" a="${r.color.a}"/>`);
    into.push(`${ind}<${r.kind}${a.length ? " " + a.join(" ") : ""}${inner.length ? ">" : "/>"}`);
    if (inner.length) into.push(...inner, `${ind}</${r.kind}>`);
  };

  const head = ['<Ui xmlns="http://www.blizzard.com/wow/ui/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.blizzard.com/wow/ui/ ..\\FrameXML\\UI.xsd">'];
  const tops = model.childrenOf(null);
  // regions need a frame; top level order follows creation order so anchors resolve
  const topIds = new Set(tops.map((t) => t.id));
  for (const w of orderForCreation(model).filter((x) => topIds.has(x.id))) emit(w, "  ");
  return { xml: [...head, ...out, "</Ui>", ""].join("\n"), warnings };
}

// ===== [S3] importFormXml =====

const num = (v: string | undefined): number | undefined => (v === undefined || v === "" ? undefined : Number(v));

export function importFormXml(xml: string, target: ResolvedTarget): { model: FormModel; warnings: string[] } {
  const root = parseXml(xml);
  if (root.tag !== "Ui") throw new FreewoodError("XML_FORMAT", "The root element must be <Ui>");
  const model = new FormModel();
  const warnings: string[] = [];
  const pendingAnchors: { w: FormWidget; a: { point: AnchorPoint; relName?: string; relPoint: AnchorPoint; x: number; y: number } }[] = [];
  const pair = (n: XmlNode | undefined): { x: number; y: number } | undefined => {
    if (!n) return undefined;
    const abs = n.children.find((c) => c.tag === "AbsDimension");
    const a = abs?.attrs ?? n.attrs;
    return a["x"] !== undefined || a["y"] !== undefined ? { x: Number(a["x"] ?? 0), y: Number(a["y"] ?? 0) } : undefined;
  };
  const common = (w: FormWidget, n: XmlNode): void => {
    const size = pair(n.children.find((c) => c.tag === "Size"));
    if (size) {
      w.width = size.x;
      w.height = size.y;
    } else if (!isRegion(w.kind)) {
      w.width = num(n.attrs["width"]);
      w.height = num(n.attrs["height"]);
    }
    w.anchors = [];
    for (const an of n.children.find((c) => c.tag === "Anchors")?.children ?? []) {
      const off = pair(an.children.find((c) => c.tag === "Offset"));
      pendingAnchors.push({ w, a: { point: (an.attrs["point"] ?? "CENTER") as AnchorPoint, relName: an.attrs["relativeTo"], relPoint: (an.attrs["relativePoint"] ?? an.attrs["point"] ?? "CENTER") as AnchorPoint, x: off?.x ?? 0, y: off?.y ?? 0 } });
    }
    if (n.attrs["text"] !== undefined) w.text = n.attrs["text"];
    if (n.attrs["file"]) w.texture = n.attrs["file"];
    if (n.attrs["inherits"]) {
      if (w.kind === "FontString") w.font = { ...w.font, object: n.attrs["inherits"] };
      else w.inherits = n.attrs["inherits"];
    }
    const color = n.children.find((c) => c.tag === "Color");
    if (color) w.color = { r: Number(color.attrs["r"] ?? 1), g: Number(color.attrs["g"] ?? 1), b: Number(color.attrs["b"] ?? 1), a: Number(color.attrs["a"] ?? 1) };
  };
  const frame = (n: XmlNode, parent: string | null): void => {
    const w = model.add(n.tag, parent, { name: n.attrs["name"] ?? "" });
    if (!target.widgets.has(n.tag)) warnings.push(`Widget type '${n.tag}' does not exist in target '${target.id}'.`);
    if (n.attrs["frameStrata"]) w.strata = n.attrs["frameStrata"];
    if (n.attrs["frameLevel"]) w.level = Number(n.attrs["frameLevel"]);
    if (n.attrs["hidden"] === "true") w.hidden = true;
    if (n.attrs["movable"] === "true") w.movable = true;
    if (n.attrs["enableMouse"] === "true") w.enableMouse = true;
    if (n.attrs["alpha"]) w.alpha = Number(n.attrs["alpha"]);
    common(w, n);
    const bd = n.children.find((c) => c.tag === "Backdrop");
    if (bd) {
      w.backdrop = {
        bgFile: bd.attrs["bgFile"], edgeFile: bd.attrs["edgeFile"], tile: bd.attrs["tile"] === undefined ? undefined : bd.attrs["tile"] === "true",
      };
      const ins = bd.children.find((c) => c.tag === "BackgroundInsets")?.children.find((c) => c.tag === "AbsInset");
      if (ins) w.backdrop.insets = { left: Number(ins.attrs["left"] ?? 0), right: Number(ins.attrs["right"] ?? 0), top: Number(ins.attrs["top"] ?? 0), bottom: Number(ins.attrs["bottom"] ?? 0) };
      const ts = bd.children.find((c) => c.tag === "TileSize")?.children[0]?.attrs["val"];
      const es = bd.children.find((c) => c.tag === "EdgeSize")?.children[0]?.attrs["val"];
      if (ts) w.backdrop.tileSize = Number(ts);
      if (es) w.backdrop.edgeSize = Number(es);
      const c = bd.children.find((x) => x.tag === "Color");
      if (c) w.backdrop.color = { r: Number(c.attrs["r"] ?? 1), g: Number(c.attrs["g"] ?? 1), b: Number(c.attrs["b"] ?? 1), a: Number(c.attrs["a"] ?? 1) };
      const bc = bd.children.find((x) => x.tag === "BorderColor");
      if (bc) w.backdrop.borderColor = { r: Number(bc.attrs["r"] ?? 1), g: Number(bc.attrs["g"] ?? 1), b: Number(bc.attrs["b"] ?? 1), a: Number(bc.attrs["a"] ?? 1) };
      for (const k of Object.keys(w.backdrop) as (keyof typeof w.backdrop)[]) if (w.backdrop[k] === undefined) delete w.backdrop[k];
      delete w.color;
    }
    for (const layer of n.children.find((c) => c.tag === "Layers")?.children ?? []) {
      for (const r of layer.children) {
        const rw = model.add(r.tag, w.id, { name: r.attrs["name"] ?? "", layer: layer.attrs["level"] ?? "ARTWORK" });
        common(rw, r);
      }
    }
    for (const f of n.children.find((c) => c.tag === "Frames")?.children ?? []) frame(f, w.id);
    for (const s of n.children.find((c) => c.tag === "Scripts")?.children ?? []) w.scripts[s.tag] = s.text;
  };
  for (const c of root.children) frame(c, null);
  const byName = new Map(model.doc.widgets.filter((x) => x.name).map((x) => [x.name, x.id]));
  for (const { w, a } of pendingAnchors) {
    let relativeTo: string | null = null;
    if (a.relName && a.relName !== "UIParent") {
      relativeTo = byName.get(a.relName) ?? null;
      if (!relativeTo) warnings.push(`Anchor target '${a.relName}' was not found.`);
    }
    const anchor: Anchor = { point: a.point, relativeTo, relativePoint: a.relPoint, x: a.x, y: a.y };
    try {
      model.setAnchor(w.id, anchor, w.anchors.length);
    } catch {
      warnings.push(`An anchor of '${w.name || w.id}' was ignored (circular).`);
    }
  }
  return { model, warnings };
}
