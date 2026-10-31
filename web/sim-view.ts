/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] collectSources ..... welche Dateien die Simulation lädt (toc-Reihenfolge)
 *   [S2] renderSimView ...... Steuerung, Vorschau, Protokoll, Frame-Liste
 *   [S3] orderSnapshot ...... Zeichenreihenfolge der Vorschau
 */

import { DEFAULT_SCENARIO, FormModel, Graph, WowSim, generateFormLua, generateLua, importFormXml, type Project, type ResolvedTarget, type Scenario, type SnapshotNode } from "../src/index.js";
import { clear, h, select } from "./dom.js";
import type { Ctx } from "./ctx.js";

// ===== [S1] collectSources =====

export interface SourceUnit {
  name: string;
  code: string;
}

export function collectSources(project: Project, target: ResolvedTarget, warn: (m: string) => void): SourceUnit[] {
  const files = project.listFiles();
  const lower = new Map(files.map((f) => [f.path.toLowerCase(), f]));
  const toc = files.find((f) => f.kind === "toc");
  const listed: string[] = [];
  if (toc) {
    for (const line of toc.content.split(/\r?\n/)) {
      const l = line.trim();
      if (!l || l.startsWith("#")) continue;
      const f = lower.get(l.replace(/\\/g, "/").toLowerCase());
      if (f && (f.kind === "lua" || f.kind === "xml")) listed.push(f.path);
      else warn(`.toc: '${l}' ${f ? "is not a Lua or XML file" : "was not found in the project"}`);
    }
  }
  const order = listed.length ? listed : files.filter((f) => f.kind === "lua" || f.kind === "xml").map((f) => f.path).sort();
  const included = new Set(order.map((p) => p.toLowerCase()));
  const units: SourceUnit[] = [];
  const visual = (f: { path: string }, ext: string): boolean => included.has(f.path.replace(/\.[^.]+$/, "").toLowerCase() + ".generated." + ext);
  // visual sources that have no generated file in the load list are generated on the fly
  for (const f of files.filter((x) => x.kind === "form")) {
    if (visual(f, "lua") || visual(f, "xml")) continue;
    try {
      units.push({ name: f.path, code: generateFormLua(FormModel.parse(f.content), target).code });
    } catch (e) {
      warn(`${f.path}: ${(e as Error).message}`);
    }
  }
  for (const f of files.filter((x) => x.kind === "graph")) {
    if (visual(f, "lua")) continue;
    try {
      units.push({ name: f.path, code: generateLua(Graph.parse(f.content, target), target).code });
    } catch (e) {
      warn(`${f.path}: ${(e as Error).message}`);
    }
  }
  for (const p of order) {
    const f = lower.get(p.toLowerCase())!;
    if (f.kind === "lua") units.push({ name: f.path, code: f.content });
    else {
      try {
        units.push({ name: f.path, code: generateFormLua(importFormXml(f.content, target).model, target).code });
      } catch (e) {
        warn(`${f.path}: ${(e as Error).message}`);
      }
    }
  }
  return units;
}

// ===== [S2] renderSimView =====

let persistedScenario: Scenario = structuredClone(DEFAULT_SCENARIO);
let sim: WowSim | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

export function renderSimView(root: HTMLElement, ctx: Ctx): void {
  clear(root);
  if (timer) clearInterval(timer);
  timer = undefined;

  const controls = h("div", { class: "sim-controls" });
  const screen = h("div", { class: "form-screen sim-screen", style: { width: "1024px", height: "768px" } });
  const viewport = h("div", { class: "form-viewport" }, screen);
  const log = h("div", { class: "sim-log", role: "log", "aria-live": "polite" });
  const frames = h("ul", { class: "sim-frames" });
  const right = h("div", { class: "sim-right" }, h("h4", { text: ctx.t("sim.log") }), log, h("h4", { text: ctx.t("sim.frames") }), frames);
  root.append(h("div", { class: "sim-main" }, controls, viewport, right));

  let scale = 1;
  const fit = (): void => {
    scale = Math.min(1, Math.max(0.3, ((viewport.clientWidth || 1024) - 8) / 1024));
    screen.style.transform = `scale(${scale})`;
    viewport.style.height = `${768 * scale + 8}px`;
  };
  new ResizeObserver(fit).observe(viewport);

  let shownLog = 0;
  function refresh(): void {
    if (!sim) {
      clear(screen);
      return;
    }
    const snap = sim.snapshot();
    clear(screen);
    const byId = new Map(snap.map((n) => [n.id, n]));
    const order = orderSnapshot(snap);
    order.forEach((n, i) => {
      if (!n.visible || !n.rect) return;
      const el = h("div", { class: `fw fw-${n.kind.toLowerCase()}${n.kind === "Button" ? " clickable" : ""}`, title: `${n.name || n.kind} (${n.kind})`, "data-sim": String(n.id),
        style: { left: `${n.rect.left}px`, top: `${768 - n.rect.bottom - n.rect.height}px`, width: `${n.rect.width}px`, height: `${n.rect.height}px`, zIndex: String(i + 1), opacity: String(n.alpha) } });
      if (n.kind === "Texture" && n.color) el.style.background = `rgba(${Math.round(n.color[0] * 255)},${Math.round(n.color[1] * 255)},${Math.round(n.color[2] * 255)},${n.color[3]})`;
      if (n.kind === "FontString") {
        const c = n.color ?? [1, 0.82, 0, 1];
        el.style.color = `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
      }
      if (n.text) el.append(h("span", { class: "fw-text", text: n.text }));
      if (n.kind === "Frame" && n.parent === null && n.name && n.name !== "DEFAULT_CHAT_FRAME" && n.name !== "WorldFrame") el.classList.add("has-backdrop");
      screen.append(el);
    });
    // log
    for (; shownLog < sim.log.length; shownLog++) {
      const l = sim.log[shownLog]!;
      log.append(h("div", { class: `log-line ${l.kind}` }, h("span", { class: "t", text: l.t.toFixed(2) }), h("span", { class: "k", text: l.kind }), h("span", { class: "msg", text: l.text })));
    }
    log.scrollTop = log.scrollHeight;
    clear(frames);
    for (const n of snap) {
      if (n.name === "DEFAULT_CHAT_FRAME" || n.name === "WorldFrame") continue;
      const par = n.parent ? byId.get(n.parent) : undefined;
      frames.append(h("li", { class: n.visible ? "" : "off" }, h("strong", { text: n.name || `#${n.id}` }), ` ${n.kind}`, par ? ` ↳ ${par.name || "#" + par.id}` : "", n.events.length ? ` · ${n.events.join(", ")}` : ""));
    }
  }

  screen.addEventListener("click", (ev) => {
    const id = (ev.target as HTMLElement).closest("[data-sim]")?.getAttribute("data-sim");
    if (!id || !sim) return;
    const f = sim.frames.find((x) => String(x.id) === id);
    if (f && (f.kind === "Button" || f.kind === "CheckButton")) {
      sim.click(f);
      refresh();
    }
  });

  function start(): void {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    shownLog = 0;
    clear(log);
    sim = new WowSim(ctx.target, persistedScenario);
    const s = sim;
    const units = collectSources(ctx.project, ctx.target, (m) => s.addLog("warn", m));
    if (units.length === 0) s.addLog("info", ctx.t("sim.nothing"));
    for (const u of units) {
      s.addLog("info", `${ctx.t("sim.loading")} ${u.name}`);
      s.loadSource(u.code, u.name);
    }
    s.login(ctx.project.name);
    fit();
    renderControls();
    refresh();
  }

  function renderControls(): void {
    clear(controls);
    const s = sim;
    controls.append(
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: start }, "▶ " + (s ? ctx.t("sim.restart") : ctx.t("sim.run")))),
    );
    if (!s) {
      controls.append(h("p", { class: "muted", text: ctx.t("sim.intro") }));
      return;
    }
    const step = (sec: number) => h("button", { class: "btn", onclick: () => { s.advance(sec); refresh(); } }, `+${sec}s`);
    const play = h("button", { class: "btn", "aria-pressed": "false" }, "⏵ " + ctx.t("sim.play"));
    play.addEventListener("click", () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
        play.textContent = "⏵ " + ctx.t("sim.play");
        play.setAttribute("aria-pressed", "false");
      } else {
        timer = setInterval(() => { s.advance(0.1); refresh(); }, 100);
        play.textContent = "⏸ " + ctx.t("sim.pause");
        play.setAttribute("aria-pressed", "true");
      }
    });
    controls.append(h("h4", { text: ctx.t("sim.time") }), h("div", { class: "btn-row" }, step(0.1), step(1), step(10), play), h("div", { class: "muted", text: `t = ${s.now.toFixed(2)}s` }));

    // Befehle · commands
    const slash = h("input", { type: "text", placeholder: "/command", "aria-label": ctx.t("sim.slash") });
    slash.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      s.addLog("info", slash.value);
      s.runSlash(slash.value);
      slash.value = "";
      refresh();
    });
    controls.append(h("h4", { text: ctx.t("sim.slash") }), slash);

    // Events
    const events = [...ctx.target.events.keys()].sort();
    const evSel = select(events.map((v) => ({ value: v, label: v })), events.includes("PLAYER_ENTERING_WORLD") ? "PLAYER_ENTERING_WORLD" : events[0] ?? "", () => undefined, { "aria-label": ctx.t("sim.event") });
    const args = h("input", { type: "text", placeholder: ctx.t("sim.eventArgs") });
    controls.append(h("h4", { text: ctx.t("sim.fireEvent") }), evSel, args, h("button", { class: "btn", onclick: () => {
      const list = args.value.trim() === "" ? [] : args.value.split(",").map((x) => x.trim()).map((x) => (x !== "" && !Number.isNaN(Number(x)) ? Number(x) : x));
      s.fireEvent(evSel.value, ...list);
      refresh();
    } }, ctx.t("sim.fire")));

    // Welt · world
    controls.append(h("h4", { text: ctx.t("sim.world") }));
    const combat = h("input", { type: "checkbox", checked: s.scenario.inCombat });
    combat.addEventListener("change", () => { s.setCombat(combat.checked); persistedScenario.inCombat = combat.checked; refresh(); });
    controls.append(h("label", { class: "field inline" }, combat, h("span", { text: ctx.t("sim.combat") })));
    const hasTarget = h("input", { type: "checkbox", checked: !!s.scenario.target });
    hasTarget.addEventListener("change", () => { s.setTarget(hasTarget.checked ? structuredClone(DEFAULT_SCENARIO.target) : undefined); renderControls(); refresh(); });
    controls.append(h("label", { class: "field inline" }, hasTarget, h("span", { text: ctx.t("sim.target") })));
    for (const unit of ["player", "target"]) {
      const u = s.unit(unit);
      if (!u) continue;
      const range = h("input", { type: "range", min: "0", max: String(u.healthMax), value: String(u.health), "aria-label": `${unit} health` });
      range.addEventListener("input", () => { s.setHealth(unit, Number(range.value)); refresh(); });
      controls.append(h("label", { class: "field" }, h("span", { text: `${unit}: ${u.name}` }), range));
    }
  }

  fit();
  renderControls();
  refresh();
  if (!sim) start();
}

// ===== [S3] orderSnapshot =====

export function orderSnapshot(nodes: SnapshotNode[]): SnapshotNode[] {
  const strata = ["BACKGROUND", "LOW", "MEDIUM", "HIGH", "DIALOG", "FULLSCREEN", "FULLSCREEN_DIALOG", "TOOLTIP"];
  const layers = ["BACKGROUND", "BORDER", "ARTWORK", "OVERLAY", "HIGHLIGHT"];
  const kids = new Map<number | null, SnapshotNode[]>();
  for (const n of nodes) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  const out: SnapshotNode[] = [];
  const visit = (parent: number | null, baseStrata: number, baseLevel: number): void => {
    const list = kids.get(parent) ?? [];
    const regions = list.filter((n) => n.kind === "Texture" || n.kind === "FontString").sort((a, b) => layers.indexOf(a.layer) - layers.indexOf(b.layer) || a.id - b.id);
    out.push(...regions);
    const frames = list
      .filter((n) => n.kind !== "Texture" && n.kind !== "FontString")
      .map((n) => ({ n, s: n.strata ? Math.max(0, strata.indexOf(n.strata)) : baseStrata, l: baseLevel + n.level + (parent === null ? 0 : 1) }))
      .sort((a, b) => a.s - b.s || a.l - b.l || a.n.id - b.n.id);
    for (const f of frames) {
      out.push(f.n);
      visit(f.n.id, f.s, f.l);
    }
  };
  visit(null, strata.indexOf("MEDIUM"), 0);
  return out;
}
