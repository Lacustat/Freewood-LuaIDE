/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] renderFormsView ...... Baum, Zeichenfläche mit Ebenen, Eigenschaften, Ausgabe (Lua/XML)
 *   [S2] Zeichenfläche · canvas  Zeichnen nach Ebenen, Ziehen, Größe ändern
 *   [S3] Baum · tree
 *   [S4] Eigenschaften · properties
 *   [S5] Ausgabe · output
 */

import { ANCHOR_POINTS, FormModel, generateFormLua, generateFormXml, highlightLua, highlightXml, importFormXml, isRegion, toHtml, type AnchorPoint, type FormWidget } from "../src/index.js";
import { clear, h, pickFile, select, toast } from "./dom.js";
import type { Ctx } from "./ctx.js";

const SCREEN = { width: 1024, height: 768 };

// ===== [S1] renderFormsView =====

export function renderFormsView(root: HTMLElement, ctx: Ctx, path: string): void {
  clear(root);
  const file = ctx.project.getFile(path);
  if (!file) return;
  let model: FormModel;
  try {
    model = FormModel.parse(file.content);
  } catch (e) {
    root.append(h("p", { class: "error-box", text: `${ctx.t("forms.invalid")}: ${(e as Error).message}` }));
    return;
  }
  const strataList = [...ctx.target.layers.frameStrata];
  const layerList = [...ctx.target.layers.drawLayers];
  model.strata = strataList.length ? strataList : model.strata;
  model.drawLayers = layerList.length ? layerList : model.drawLayers;

  let selected: string | undefined = model.doc.widgets[0]?.id;
  let outTab: "lua" | "xml" = "lua";

  const treeBox = h("div", { class: "forms-tree" });
  const screen = h("div", { class: "form-screen", style: { width: `${SCREEN.width}px`, height: `${SCREEN.height}px` } });
  const viewport = h("div", { class: "form-viewport" }, screen);
  const props = h("div", { class: "forms-props" });
  const outBox = h("div", { class: "forms-out" });
  root.append(h("div", { class: "forms-main" }, treeBox, viewport, props), outBox);

  const commit = (): void => {
    file.content = model.serialize();
    ctx.project.updateFile(path, file.content);
    ctx.save();
  };
  const refresh = (opts: { tree?: boolean; props?: boolean } = { tree: true, props: true }): void => {
    drawCanvas();
    if (opts.tree) renderTree();
    if (opts.props) renderProps();
    renderOutput();
  };

  // ===== [S2] Zeichenfläche · canvas =====
  let scale = 1;
  function fit(): void {
    const w = viewport.clientWidth || SCREEN.width;
    scale = Math.min(1, Math.max(0.3, (w - 8) / SCREEN.width));
    screen.style.transform = `scale(${scale})`;
    viewport.style.height = `${SCREEN.height * scale + 8}px`;
  }

  function drawCanvas(): void {
    clear(screen);
    const rects = model.layoutRects(SCREEN);
    const order = model.renderOrder();
    order.forEach((w, i) => {
      const r = rects.get(w.id);
      if (!r) return;
      const el = h("div", {
        class: `fw fw-${w.kind.toLowerCase()}${selected === w.id ? " sel" : ""}${w.hidden ? " hidden-w" : ""}`,
        "data-id": w.id,
        title: `${w.name || w.kind} (${w.kind})`,
        style: { left: `${r.left}px`, top: `${SCREEN.height - r.bottom - r.height}px`, width: `${r.width}px`, height: `${r.height}px`, zIndex: String(i + 1), opacity: String(w.alpha ?? 1) },
      });
      if (w.kind === "Texture") {
        if (w.color) el.style.background = `rgba(${Math.round(w.color.r * 255)},${Math.round(w.color.g * 255)},${Math.round(w.color.b * 255)},${w.color.a})`;
        if (w.texture) el.append(h("span", { class: "fw-label", text: w.texture.split("\\").pop() ?? w.texture }));
      } else if (w.kind === "FontString") {
        const c = w.color ?? { r: 1, g: 0.82, b: 0, a: 1 };
        el.style.color = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${c.a})`;
        el.append(h("span", { class: "fw-text", text: w.text ?? "" }));
      } else {
        if (w.backdrop) el.classList.add("has-backdrop");
        if (w.text) el.append(h("span", { class: "fw-text", text: w.text }));
        if (w.id === selected) el.append(h("div", { class: "handle", "data-handle": w.id }));
      }
      screen.append(el);
    });
  }

  type DragState = { id: string; x: number; y: number; mode: "move" | "size" } | undefined;
  let drag: DragState;
  screen.addEventListener("pointerdown", (ev) => {
    const e = ev as PointerEvent;
    const t = e.target as HTMLElement;
    const handle = t.getAttribute("data-handle");
    const id = handle ?? t.closest("[data-id]")?.getAttribute("data-id");
    if (!id) return;
    selected = id;
    drag = { id, x: e.clientX, y: e.clientY, mode: handle ? "size" : "move" };
    screen.setPointerCapture(e.pointerId);
    refresh();
  });
  screen.addEventListener("pointermove", (ev) => {
    const e = ev as PointerEvent;
    if (!drag) return;
    const dx = Math.round((e.clientX - drag.x) / scale);
    const dy = Math.round((e.clientY - drag.y) / scale);
    if (dx === 0 && dy === 0) return;
    drag.x += dx * scale;
    drag.y += dy * scale;
    const w = model.get(drag.id)!;
    if (drag.mode === "move") model.move(w.id, dx, -dy);
    else {
      const rect = model.layoutRects(SCREEN).get(w.id)!;
      const nw = Math.max(1, rect.width + dx);
      const nh = Math.max(1, rect.height + dy);
      const a = w.anchors[0];
      if (a) {
        const fx = a.point.includes("LEFT") ? 0 : a.point.includes("RIGHT") ? 1 : 0.5;
        const fy = a.point.includes("TOP") ? 0 : a.point.includes("BOTTOM") ? 1 : 0.5;
        a.x += (nw - rect.width) * fx;
        a.y -= (nh - rect.height) * fy;
      }
      w.width = nw;
      w.height = nh;
    }
    drawCanvas();
  });
  screen.addEventListener("pointerup", () => {
    if (drag) {
      drag = undefined;
      commit();
      refresh();
    }
  });
  viewport.addEventListener("keydown", (ev) => {
    const e = ev as KeyboardEvent;
    if (!selected) return;
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      model.move(selected, mv[0], mv[1]);
    } else if (e.key === "Delete") {
      model.remove(selected);
      selected = undefined;
    } else return;
    commit();
    refresh();
  });
  viewport.tabIndex = 0;
  new ResizeObserver(fit).observe(viewport);

  // ===== [S3] Baum · tree =====
  function addWidget(kind: string): void {
    const sel = selected ? model.get(selected) : undefined;
    let parent: string | null = sel ? (isRegion(sel.kind) ? sel.parent : sel.id) : null;
    if (isRegion(kind) && !parent) parent = model.doc.widgets.find((w) => !isRegion(w.kind))?.id ?? null;
    if (isRegion(kind) && !parent) {
      toast(ctx.t("forms.needFrame"), "error");
      return;
    }
    const base = kind.toLowerCase();
    const extra: Partial<FormWidget> = kind === "Button" || kind === "CheckButton" ? { text: "Button", width: 90, height: 24 } : kind === "FontString" ? { text: "Text" } : kind === "Texture" ? { width: 40, height: 40, color: { r: 0.2, g: 0.5, b: 0.9, a: 1 } } : {};
    const w = model.add(kind, parent, { ...extra, ...(parent === null ? { width: 200, height: 120 } : {}) });
    selected = w.id;
    commit();
    refresh();
  }

  function renderTree(): void {
    clear(treeBox);
    const kinds = [...ctx.target.widgets.keys()].filter((k) => !["Cooldown"].includes(k));
    const kindSel = select(kinds.map((k) => ({ value: k, label: k })), kinds.includes("Frame") ? "Frame" : kinds[0] ?? "Frame", () => undefined, { "aria-label": ctx.t("forms.kind") });
    treeBox.append(h("div", { class: "tree-tools" }, kindSel, h("button", { class: "btn", onclick: () => addWidget(kindSel.value) }, "+ " + ctx.t("forms.add"))));
    const list = h("ul", { class: "tree", role: "tree" });
    const walk = (parent: string | null, depth: number): void => {
      const kids = model.childrenOf(parent);
      for (const w of kids) {
        list.append(h("li", { class: `tree-item${selected === w.id ? " sel" : ""}`, role: "treeitem", style: { paddingLeft: `${6 + depth * 14}px` }, onclick: () => { selected = w.id; refresh(); } },
          h("span", { class: `tag tag-${isRegion(w.kind) ? "region" : "frame"}`, text: w.kind }), ` ${w.name || w.id}`));
        walk(w.id, depth + 1);
      }
    };
    walk(null, 0);
    if (!model.doc.widgets.length) list.append(h("li", { class: "muted", text: ctx.t("forms.empty") }));
    treeBox.append(list);
    treeBox.append(h("button", { class: "btn", onclick: async () => {
      const f = await pickFile(".xml");
      if (!f) return;
      try {
        const r = importFormXml(f.text, ctx.target);
        model = r.model;
        model.strata = strataList.length ? strataList : model.strata;
        model.drawLayers = layerList.length ? layerList : model.drawLayers;
        selected = model.doc.widgets[0]?.id;
        commit();
        refresh();
        toast(r.warnings.length ? r.warnings[0]! : ctx.t("forms.imported"), r.warnings.length ? "error" : "info");
      } catch (e) {
        toast((e as Error).message, "error");
      }
    } }, ctx.t("forms.importXml")));
  }

  // ===== [S4] Eigenschaften · properties =====
  function renderProps(): void {
    clear(props);
    const w = selected ? model.get(selected) : undefined;
    if (!w) {
      props.append(h("p", { class: "muted", text: ctx.t("forms.hint") }));
      return;
    }
    const region = isRegion(w.kind);
    const set = (patch: Partial<FormWidget>, redrawProps = false): void => {
      model.update(w.id, patch);
      commit();
      refresh({ tree: false, props: redrawProps });
    };
    const field = (label: string, control: HTMLElement): HTMLElement => h("label", { class: "field" }, h("span", { text: label }), control);
    const num = (label: string, value: number | undefined, on: (v: number | undefined) => void): HTMLElement => {
      const el = h("input", { type: "number", step: "any", value: value === undefined ? "" : String(value) });
      el.addEventListener("input", () => on(el.value === "" ? undefined : Number(el.value)));
      return field(label, el);
    };
    const txt = (label: string, value: string | undefined, on: (v: string) => void, area = false): HTMLElement => {
      const el = area ? h("textarea", { rows: 4 }) : h("input", { type: "text" });
      (el as HTMLInputElement).value = value ?? "";
      el.addEventListener("input", () => on((el as HTMLInputElement).value));
      return field(label, el);
    };
    const check = (label: string, value: boolean | undefined, on: (v: boolean) => void): HTMLElement => {
      const el = h("input", { type: "checkbox", checked: !!value });
      el.addEventListener("change", () => on(el.checked));
      return h("label", { class: "field inline" }, el, h("span", { text: label }));
    };

    props.append(h("h3", { text: `${w.kind} ${w.name || w.id}` }));
    const nameEl = h("input", { type: "text", value: w.name });
    const nameErr = h("div", { class: "field-error" });
    nameEl.addEventListener("change", () => {
      try {
        model.rename(w.id, nameEl.value);
        nameErr.textContent = "";
        commit();
        refresh();
      } catch (e) {
        nameErr.textContent = (e as Error).message;
      }
    });
    props.append(field(ctx.t("forms.name"), nameEl), nameErr);

    const parents = model.doc.widgets.filter((p) => !isRegion(p.kind) && p.id !== w.id && !model.descendantsOf(w.id).some((d) => d.id === p.id));
    props.append(field(ctx.t("forms.parent"), select([...(region ? [] : [{ value: "", label: "UIParent" }]), ...parents.map((p) => ({ value: p.id, label: p.name || p.id }))], w.parent ?? "", (v) => {
      try {
        model.reparent(w.id, v || null);
        commit();
        refresh();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    })));
    props.append(num(ctx.t("forms.width"), w.width, (v) => set({ width: v })), num(ctx.t("forms.height"), w.height, (v) => set({ height: v })));

    // Ebenen · layers
    props.append(h("h4", { text: ctx.t("forms.layers") }));
    if (region) {
      props.append(
        field(ctx.t("forms.drawLayer"), select(layerList.map((l) => ({ value: l, label: l })), w.layer ?? "ARTWORK", (v) => set({ layer: v }, true))),
        num(ctx.t("forms.sublevel"), w.sublevel ?? 0, (v) => set({ sublevel: v ?? 0 })),
      );
    } else {
      props.append(
        field(ctx.t("forms.strata"), select([{ value: "", label: `(${ctx.t("forms.inherit")}: ${model.effectiveStrata(w.id)})` }, ...strataList.map((l) => ({ value: l, label: l }))], w.strata ?? "", (v) => set({ strata: v || undefined }, true))),
        num(ctx.t("forms.level"), w.level ?? 0, (v) => set({ level: Math.max(0, v ?? 0) })),
      );
    }
    props.append(h("div", { class: "btn-row" },
      h("button", { class: "btn", title: ctx.t("forms.layerBack"), onclick: () => { model.shiftLayer(w.id, -1); commit(); refresh(); } }, "◀ " + ctx.t("forms.layerBack")),
      h("button", { class: "btn", title: ctx.t("forms.layerFront"), onclick: () => { model.shiftLayer(w.id, 1); commit(); refresh(); } }, ctx.t("forms.layerFront") + " ▶"),
      h("button", { class: "btn", onclick: () => { model.raise(w.id, -1); commit(); refresh(); } }, "−"),
      h("button", { class: "btn", onclick: () => { model.raise(w.id, 1); commit(); refresh(); } }, "+")));

    // Anker · anchors
    props.append(h("h4", { text: ctx.t("forms.anchors") }));
    const points = ANCHOR_POINTS.map((p) => ({ value: p, label: p }));
    const targets = [{ value: "", label: w.parent ? ctx.t("forms.parentFrame") : "UIParent" }, ...model.doc.widgets.filter((o) => o.id !== w.id && !isRegion(o.kind) || (o.id !== w.id && isRegion(o.kind))).map((o) => ({ value: o.id, label: o.name || o.id }))];
    w.anchors.forEach((a, i) => {
      const upd = (patch: Partial<typeof a>): void => {
        try {
          model.setAnchor(w.id, { ...a, ...patch }, i);
          commit();
          refresh({ tree: false, props: false });
        } catch (e) {
          toast((e as Error).message, "error");
          renderProps();
        }
      };
      props.append(h("div", { class: "anchor" },
        select(points, a.point, (v) => upd({ point: v as AnchorPoint })),
        select(targets, a.relativeTo ?? "", (v) => upd({ relativeTo: v || null })),
        select(points, a.relativePoint, (v) => upd({ relativePoint: v as AnchorPoint })),
        (() => { const x = h("input", { type: "number", value: String(a.x), "aria-label": "x" }); x.addEventListener("input", () => upd({ x: Number(x.value) })); return x; })(),
        (() => { const y = h("input", { type: "number", value: String(a.y), "aria-label": "y" }); y.addEventListener("input", () => upd({ y: Number(y.value) })); return y; })(),
        h("button", { class: "btn small", title: ctx.t("common.delete"), onclick: () => { w.anchors.splice(i, 1); commit(); refresh(); } }, "✕")));
    });
    props.append(h("button", { class: "btn", onclick: () => { w.anchors.push({ point: "TOPLEFT", relativeTo: null, relativePoint: "TOPLEFT", x: 0, y: 0 }); commit(); refresh(); } }, "+ " + ctx.t("forms.addAnchor")));

    // Inhalt · content
    props.append(h("h4", { text: ctx.t("forms.content") }));
    if (w.kind !== "Texture") props.append(txt(ctx.t("forms.text"), w.text, (v) => set({ text: v })));
    if (w.kind === "Texture") props.append(txt(ctx.t("forms.texture"), w.texture, (v) => set({ texture: v || undefined })));
    if (w.kind === "Texture" || w.kind === "FontString") {
      const c = w.color ?? { r: 1, g: 1, b: 1, a: 1 };
      const hex = "#" + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
      const color = h("input", { type: "color", value: hex });
      const alpha = h("input", { type: "number", min: "0", max: "1", step: "0.1", value: String(c.a) });
      const apply = (): void => {
        const v = color.value;
        set({ color: { r: parseInt(v.slice(1, 3), 16) / 255, g: parseInt(v.slice(3, 5), 16) / 255, b: parseInt(v.slice(5, 7), 16) / 255, a: Number(alpha.value) } });
      };
      color.addEventListener("input", apply);
      alpha.addEventListener("input", apply);
      props.append(field(ctx.t("forms.color"), color), field(ctx.t("forms.alpha"), alpha));
    }
    if (w.kind === "FontString") props.append(txt(ctx.t("forms.fontObject"), w.font?.object, (v) => set({ font: { ...w.font, object: v || undefined } })));
    if (!region) {
      props.append(txt(ctx.t("forms.template"), w.inherits, (v) => set({ inherits: v || undefined })));
      props.append(check(ctx.t("forms.hidden"), w.hidden, (v) => set({ hidden: v })), check(ctx.t("forms.movable"), w.movable, (v) => set({ movable: v })), check(ctx.t("forms.mouse"), w.enableMouse, (v) => set({ enableMouse: v })));
      props.append(num(ctx.t("forms.alpha"), w.alpha ?? 1, (v) => set({ alpha: v })));
      props.append(check(ctx.t("forms.backdrop"), !!w.backdrop, (v) => set({ backdrop: v ? { bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background", edgeFile: "Interface\\DialogFrame\\UI-DialogBox-Border", tile: true, tileSize: 32, edgeSize: 32, insets: { left: 11, right: 12, top: 12, bottom: 11 } } : undefined }, true)));
      if (w.backdrop) {
        props.append(txt("bgFile", w.backdrop.bgFile, (v) => set({ backdrop: { ...w.backdrop, bgFile: v || undefined } })), txt("edgeFile", w.backdrop.edgeFile, (v) => set({ backdrop: { ...w.backdrop, edgeFile: v || undefined } })));
      }
      // Skripte · scripts
      props.append(h("h4", { text: ctx.t("forms.scripts") }));
      const known = new Set<string>();
      for (let d = ctx.target.widgets.get(w.kind); d; d = d.inherits ? ctx.target.widgets.get(d.inherits) : undefined) d.scripts.forEach((s) => known.add(s));
      for (const [name, body] of Object.entries(w.scripts)) {
        props.append(h("div", { class: "script-head" }, h("strong", { text: name }), h("button", { class: "btn small", onclick: () => { delete w.scripts[name]; commit(); refresh(); } }, "✕")),
          txt("", body, (v) => { w.scripts[name] = v; commit(); renderOutput(); }, true));
      }
      const free = [...known].filter((s) => !(s in w.scripts));
      if (free.length) {
        const sel = select(free.map((s) => ({ value: s, label: s })), free[0]!, () => undefined);
        props.append(h("div", { class: "btn-row" }, sel, h("button", { class: "btn", onclick: () => { w.scripts[sel.value] = ""; commit(); renderProps(); } }, "+ " + ctx.t("forms.addScript"))));
      }
    }
    props.append(h("button", { class: "btn danger", onclick: () => { model.remove(w.id); selected = undefined; commit(); refresh(); } }, ctx.t("common.delete")));
  }

  // ===== [S5] Ausgabe · output =====
  function renderOutput(): void {
    clear(outBox);
    const lua = generateFormLua(model, ctx.target);
    const xml = generateFormXml(model, ctx.target);
    const base = path.replace(/\.fwform$/i, "");
    const warnings = [...lua.warnings, ...(outTab === "xml" ? xml.warnings : [])];
    const code = h("pre", { class: "code-preview" });
    code.innerHTML = toHtml(outTab === "lua" ? highlightLua(lua.code) : highlightXml(xml.xml));
    const warns = h("ul", { class: "problems" });
    if (warnings.length === 0) warns.append(h("li", { class: "ok", text: ctx.t("forms.noWarnings") }));
    for (const w of warnings) warns.append(h("li", { class: "warning" }, "⚠ ", ctx.text(w.message)));
    const tab = (id: "lua" | "xml", label: string): HTMLElement => h("button", { class: `tab${outTab === id ? " active" : ""}`, onclick: () => { outTab = id; renderOutput(); } }, label);
    const name = `${base}.generated.${outTab}`;
    outBox.append(
      h("div", { class: "out-head" }, tab("lua", "Lua"), tab("xml", "XML"), h("span", { class: "spacer" }),
        h("button", { class: "btn", onclick: () => { ctx.writeFile(name, outTab === "lua" ? lua.code : xml.xml); toast(ctx.t("graph.written", { file: name })); } }, ctx.t("graph.write", { file: name }))),
      h("div", { class: "out-body" }, code, warns),
    );
  }

  fit();
  refresh();
}
