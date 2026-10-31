/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Datentypen · data types ... FormDoc, FormWidget, Anchor
 *   [S2] Ebenen · layers ........... Strata, Level, Draw-Layer, Sublevel
 *   [S3] FormModel ................. Bearbeiten mit Prüfungen (Eltern, Zyklen, Reihenfolge)
 *   [S4] layoutRects ............... Anker → absolute Rechtecke (WoW-Koordinaten, y nach oben)
 *   [S5] renderOrder ............... Zeichenreihenfolge nach Ebenen
 *   [S6] Serialisierung ............ freewood-form v1
 *
 * DE: Datenmodell des Forms-Editors. Frames haben Frame-Strata und Frame-Level; Regionen
 *     (Texture, FontString) haben Draw-Layer und Sublevel innerhalb ihres Frames.
 * EN: data model of the forms editor. Frames have frame strata and frame level; regions
 *     (Texture, FontString) have a draw layer and sublevel inside their frame.
 */

import { FreewoodError } from "../core/errors.js";

// ===== [S1] Datentypen · data types =====

export type AnchorPoint = "TOPLEFT" | "TOP" | "TOPRIGHT" | "LEFT" | "CENTER" | "RIGHT" | "BOTTOMLEFT" | "BOTTOM" | "BOTTOMRIGHT";
export const ANCHOR_POINTS: AnchorPoint[] = ["TOPLEFT", "TOP", "TOPRIGHT", "LEFT", "CENTER", "RIGHT", "BOTTOMLEFT", "BOTTOM", "BOTTOMRIGHT"];

export interface Anchor {
  point: AnchorPoint;
  /** DE: Widget-ID; null = Elternelement (bei Wurzeln: Bildschirm "UIParent"). EN: widget id; null = parent. */
  relativeTo: string | null;
  relativePoint: AnchorPoint;
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Backdrop {
  bgFile?: string;
  edgeFile?: string;
  tile?: boolean;
  tileSize?: number;
  edgeSize?: number;
  insets?: { left: number; right: number; top: number; bottom: number };
  color?: Color;
  borderColor?: Color;
}

export const REGION_KINDS = ["Texture", "FontString"];

export interface FormWidget {
  id: string;
  /** DE: Globaler Name (leer = anonym). EN: global name (empty = anonymous). */
  name: string;
  kind: string;
  parent: string | null;
  anchors: Anchor[];
  width?: number;
  height?: number;
  // Frames
  strata?: string;
  level?: number;
  hidden?: boolean;
  movable?: boolean;
  enableMouse?: boolean;
  alpha?: number;
  backdrop?: Backdrop;
  // Regionen
  layer?: string;
  sublevel?: number;
  // Inhalt
  text?: string;
  font?: { path?: string; size?: number; flags?: string; object?: string };
  color?: Color;
  texture?: string;
  inherits?: string;
  scripts: Record<string, string>;
}

export interface FormDoc {
  format: "freewood-form";
  version: 1;
  widgets: FormWidget[];
}

// ===== [S2] Ebenen · layers =====

export const DEFAULT_STRATA = ["BACKGROUND", "LOW", "MEDIUM", "HIGH", "DIALOG", "FULLSCREEN", "FULLSCREEN_DIALOG", "TOOLTIP"];
export const DEFAULT_DRAW_LAYERS = ["BACKGROUND", "BORDER", "ARTWORK", "OVERLAY", "HIGHLIGHT"];

export function isRegion(kind: string): boolean {
  return REGION_KINDS.includes(kind);
}

// ===== [S3] FormModel =====

let seq = 0;

export class FormModel {
  doc: FormDoc;
  constructor(doc?: FormDoc, public strata: string[] = DEFAULT_STRATA, public drawLayers: string[] = DEFAULT_DRAW_LAYERS) {
    this.doc = doc ?? { format: "freewood-form", version: 1, widgets: [] };
  }

  get(id: string): FormWidget | undefined {
    return this.doc.widgets.find((w) => w.id === id);
  }

  childrenOf(id: string | null): FormWidget[] {
    return this.doc.widgets.filter((w) => w.parent === id);
  }

  descendantsOf(id: string): FormWidget[] {
    const out: FormWidget[] = [];
    const walk = (p: string) => {
      for (const c of this.childrenOf(p)) {
        out.push(c);
        walk(c.id);
      }
    };
    walk(id);
    return out;
  }

  add(kind: string, parent: string | null, props: Partial<FormWidget> = {}): FormWidget {
    if (parent !== null) {
      const p = this.get(parent);
      if (!p) throw new FreewoodError("FORM_PARENT", `No widget '${parent}'`);
      if (isRegion(p.kind)) throw new FreewoodError("FORM_PARENT", "A texture or font string cannot have children");
    } else if (isRegion(kind)) {
      throw new FreewoodError("FORM_PARENT", "A texture or font string needs a parent frame");
    }
    if (props.name) this.assertName(props.name);
    let id: string;
    do id = `w${++seq}`; while (this.get(id));
    const region = isRegion(kind);
    const w: FormWidget = {
      id, name: "", kind, parent, anchors: [{ point: "CENTER", relativeTo: null, relativePoint: "CENTER", x: 0, y: 0 }],
      width: region ? undefined : 100, height: region ? undefined : 30,
      ...(region ? { layer: "ARTWORK", sublevel: 0 } : { level: 0 }),
      scripts: {}, ...props,
    };
    this.doc.widgets.push(w);
    return w;
  }

  private assertName(name: string, except?: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new FreewoodError("FORM_NAME", `'${name}' is not a valid global name`);
    const dup = this.doc.widgets.find((w) => w.name.toLowerCase() === name.toLowerCase() && w.id !== except);
    if (dup) throw new FreewoodError("FORM_NAME_DUP", `The name '${name}' is already used`);
  }

  rename(id: string, name: string): void {
    const w = this.require(id);
    if (name) this.assertName(name, id);
    w.name = name;
  }

  private require(id: string): FormWidget {
    const w = this.get(id);
    if (!w) throw new FreewoodError("FORM_MISSING", `No widget '${id}'`);
    return w;
  }

  update(id: string, props: Partial<Omit<FormWidget, "id" | "parent" | "name">>): void {
    Object.assign(this.require(id), props);
  }

  remove(id: string): void {
    const ids = new Set([id, ...this.descendantsOf(id).map((d) => d.id)]);
    this.doc.widgets = this.doc.widgets.filter((w) => !ids.has(w.id));
    // anchors pointing at removed widgets fall back to the parent
    for (const w of this.doc.widgets) for (const a of w.anchors) if (a.relativeTo && ids.has(a.relativeTo)) a.relativeTo = null;
  }

  reparent(id: string, parent: string | null): void {
    const w = this.require(id);
    if (parent !== null) {
      const p = this.require(parent);
      if (isRegion(p.kind)) throw new FreewoodError("FORM_PARENT", "A texture or font string cannot have children");
      if (parent === id || this.descendantsOf(id).some((d) => d.id === parent)) throw new FreewoodError("FORM_CYCLE", "A widget cannot become a child of itself");
    } else if (isRegion(w.kind)) throw new FreewoodError("FORM_PARENT", "A texture or font string needs a parent frame");
    w.parent = parent;
  }

  setAnchor(id: string, anchor: Anchor, index = 0): void {
    const w = this.require(id);
    if (anchor.relativeTo) {
      this.require(anchor.relativeTo);
      if (anchor.relativeTo === id) throw new FreewoodError("FORM_ANCHOR", "A widget cannot be anchored to itself");
      if (this.anchorDepends(anchor.relativeTo, id)) throw new FreewoodError("FORM_ANCHOR", "Anchors would form a circle");
    }
    w.anchors[index] = anchor;
  }

  private anchorDepends(from: string, on: string, seen = new Set<string>()): boolean {
    if (from === on) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const w = this.get(from);
    if (!w) return false;
    return w.anchors.some((a) => a.relativeTo && this.anchorDepends(a.relativeTo, on, seen));
  }

  move(id: string, dx: number, dy: number): void {
    const w = this.require(id);
    for (const a of w.anchors) {
      a.x += dx;
      a.y += dy;
    }
  }

  /** DE: Eine Stufe nach vorn/hinten (Frame-Level bzw. Sublevel). EN: one step forward/back. */
  raise(id: string, delta: 1 | -1): void {
    const w = this.require(id);
    if (isRegion(w.kind)) w.sublevel = Math.max(-8, Math.min(7, (w.sublevel ?? 0) + delta));
    else w.level = Math.max(0, (w.level ?? 0) + delta);
  }

  /** DE: Wechselt die Ebene (Strata bzw. Draw-Layer) um eine Stufe. EN: moves to the next/previous layer. */
  shiftLayer(id: string, delta: 1 | -1): void {
    const w = this.require(id);
    if (isRegion(w.kind)) {
      const i = Math.max(0, this.drawLayers.indexOf(w.layer ?? "ARTWORK"));
      w.layer = this.drawLayers[Math.max(0, Math.min(this.drawLayers.length - 1, i + delta))];
    } else {
      const i = Math.max(0, this.strata.indexOf(this.effectiveStrata(id)));
      w.strata = this.strata[Math.max(0, Math.min(this.strata.length - 1, i + delta))];
    }
  }

  effectiveStrata(id: string): string {
    for (let w = this.get(id); w; w = w.parent ? this.get(w.parent) : undefined) {
      if (w.strata) return w.strata;
      if (!w.parent) break;
    }
    return "MEDIUM";
  }

  // ===== [S4] layoutRects =====

  layoutRects(screen = { width: 1024, height: 768 }): Map<string, Rect> {
    const rects = new Map<string, Rect>();
    const root: Rect = { left: 0, bottom: 0, width: screen.width, height: screen.height };
    const visiting = new Set<string>();
    const solve = (w: FormWidget): Rect => {
      const done = rects.get(w.id);
      if (done) return done;
      if (visiting.has(w.id)) return root;
      visiting.add(w.id);
      const parentRect = w.parent ? solve(this.require(w.parent)) : root;
      let width = w.width;
      let height = w.height;
      const resolved = w.anchors.map((a) => {
        const rel = a.relativeTo ? solve(this.require(a.relativeTo)) : parentRect;
        const p = pointOf(rel, a.relativePoint);
        return { a, x: p.x + a.x, y: p.y + a.y };
      });
      // two anchors define size on an axis when width/height are missing
      const xs = resolved.filter((r) => ["LEFT", "RIGHT"].some((s) => r.a.point.includes(s)));
      const left = xs.find((r) => r.a.point.includes("LEFT"));
      const right = xs.find((r) => r.a.point.includes("RIGHT"));
      if (width === undefined && left && right) width = right.x - left.x;
      const bottom = resolved.find((r) => r.a.point.includes("BOTTOM"));
      const top = resolved.find((r) => r.a.point.includes("TOP"));
      if (height === undefined && bottom && top) height = top.y - bottom.y;
      width = Math.max(0, width ?? parentRect.width);
      height = Math.max(0, height ?? parentRect.height);
      const first = resolved[0];
      let L = parentRect.left + (parentRect.width - width) / 2;
      let B = parentRect.bottom + (parentRect.height - height) / 2;
      if (first) {
        const off = pointOf({ left: 0, bottom: 0, width, height }, first.a.point);
        L = first.x - off.x;
        B = first.y - off.y;
        if (left && right && w.width === undefined) L = left.x;
        if (bottom && top && w.height === undefined) B = bottom.y;
      }
      visiting.delete(w.id);
      const r = { left: L, bottom: B, width, height };
      rects.set(w.id, r);
      return r;
    };
    for (const w of this.doc.widgets) solve(w);
    return rects;
  }

  // ===== [S5] renderOrder =====

  /** DE: Zeichenreihenfolge (hinten zuerst). EN: paint order, back first. */
  renderOrder(): FormWidget[] {
    const out: FormWidget[] = [];
    const strataIdx = (s: string) => Math.max(0, this.strata.indexOf(s));
    const layerIdx = (l: string | undefined) => Math.max(0, this.drawLayers.indexOf(l ?? "ARTWORK"));
    const order = new Map(this.doc.widgets.map((w, i) => [w.id, i]));
    const visit = (parent: string | null, baseStrata: number, baseLevel: number): void => {
      const kids = this.childrenOf(parent);
      const frames = kids.filter((k) => !isRegion(k.kind));
      const regions = kids.filter((k) => isRegion(k.kind));
      // regions of a frame are drawn with that frame, ordered by draw layer
      regions.sort((a, b) => layerIdx(a.layer) - layerIdx(b.layer) || (a.sublevel ?? 0) - (b.sublevel ?? 0) || order.get(a.id)! - order.get(b.id)!);
      out.push(...regions);
      const ranked = frames.map((f) => ({ f, s: f.strata ? strataIdx(f.strata) : baseStrata, l: baseLevel + 1 + (f.level ?? 0) }));
      ranked.sort((a, b) => a.s - b.s || a.l - b.l || order.get(a.f.id)! - order.get(b.f.id)!);
      for (const { f, s, l } of ranked) {
        out.push(f);
        visit(f.id, s, l);
      }
    };
    // top level frames are ranked among each other first, children inherit
    const tops = this.childrenOf(null);
    const ranked = tops.map((f) => ({ f, s: f.strata ? strataIdx(f.strata) : strataIdx("MEDIUM"), l: f.level ?? 0 }));
    ranked.sort((a, b) => a.s - b.s || a.l - b.l || order.get(a.f.id)! - order.get(b.f.id)!);
    for (const { f, s, l } of ranked) {
      out.push(f);
      visit(f.id, s, l);
    }
    return out;
  }

  // ===== [S6] Serialisierung =====

  serialize(): string {
    return JSON.stringify(this.doc, null, 2);
  }

  static parse(json: string): FormModel {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new FreewoodError("FORM_PARSE", "Form file is not valid JSON");
    }
    const d = raw as Partial<FormDoc>;
    if (!d || d.format !== "freewood-form" || d.version !== 1 || !Array.isArray(d.widgets)) throw new FreewoodError("FORM_PARSE", "Not a freewood-form v1 file");
    const ids = new Set<string>();
    for (const w of d.widgets) {
      if (!w || typeof w.id !== "string" || ids.has(w.id) || typeof w.kind !== "string") throw new FreewoodError("FORM_PARSE", "Invalid or duplicate widget");
      ids.add(w.id);
      w.scripts = w.scripts ?? {};
      w.anchors = w.anchors ?? [];
      w.name = w.name ?? "";
      w.parent = w.parent ?? null;
    }
    for (const w of d.widgets) if (w.parent && !ids.has(w.parent)) throw new FreewoodError("FORM_PARSE", "Widget refers to a missing parent");
    for (const id of ids) {
      const m = /^w(\d+)$/.exec(id);
      if (m) seq = Math.max(seq, Number(m[1]));
    }
    return new FormModel(d as FormDoc);
  }
}

export interface Rect {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

function pointOf(r: Rect, p: AnchorPoint): { x: number; y: number } {
  const x = p.includes("LEFT") ? r.left : p.includes("RIGHT") ? r.left + r.width : r.left + r.width / 2;
  const y = p.includes("BOTTOM") ? r.bottom : p.includes("TOP") ? r.bottom + r.height : r.bottom + r.height / 2;
  return { x, y };
}
