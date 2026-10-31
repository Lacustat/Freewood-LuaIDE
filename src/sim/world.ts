/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] FrameState ............ Zustand eines simulierten Frames/Region
 *   [S2] WowSim ................ Welt: Uhr, Timer, Events, Skripte, Protokoll
 *   [S3] Frame-Methoden ........ nur was die Plugin-Daten des Ziels erlauben
 *   [S4] API-Funktionen ........ Einheiten, Chat, Timer, Misc (nur wenn in den Plugin-Daten)
 *   [S5] snapshot .............. Zustand für die Oberfläche
 *
 * DE: Die Simulation führt Addon-Code im eigenen Interpreter aus. Wichtiger Grundsatz: Es
 *     existiert nur, was in den Plugin-Daten des Ziels steht. Ruft ein Addon z. B. `SetSize` in
 *     einem Vanilla-Ziel auf, kommt – wie im echten Client – „attempt to call method … (a nil
 *     value)“. Stehen Funktionen in den Daten, aber ohne Simulation, wird beim Aufruf gewarnt.
 * EN: the simulation runs addon code in the own interpreter. Core principle: only what is in
 *     the target's plugin data exists. If an addon calls e.g. `SetSize` on a vanilla target, you
 *     get "attempt to call method … (a nil value)" like in the real client. Functions listed in
 *     the data but not simulated produce a warning when called.
 */

import type { ResolvedTarget } from "../core/plugins.js";
import { InterpRuntime } from "../lua/runtime.js";
import { LuaFunction, LuaTable, nativeFn, tonum, tostr, type LuaValue } from "../lua/value.js";
import type { ExecResult } from "../runtime/types.js";
import { DEFAULT_SCENARIO, type LogEntry, type Scenario, type UnitData } from "./scenario.js";
import { FormModel, type AnchorPoint } from "../forms/model.js";

// ===== [S1] FrameState =====

export interface PointState {
  point: string;
  relativeTo: FrameState | null;
  relativePoint: string;
  x: number;
  y: number;
}

export class FrameState {
  table = new LuaTable();
  parent: FrameState | null = null;
  children: FrameState[] = [];
  regions: FrameState[] = [];
  shown = true;
  scripts = new Map<string, LuaFunction>();
  hooks = new Map<string, LuaFunction[]>();
  events = new Set<string>();
  points: PointState[] = [];
  width = 0;
  height = 0;
  alpha = 1;
  scale = 1;
  strata: string | undefined;
  level = 0;
  text = "";
  texture = "";
  color: [number, number, number, number] | undefined;
  enabled = true;
  checked = false;
  value = 0;
  min = 0;
  max = 1;
  backdrop: LuaTable | undefined;
  mouse = false;
  movable = false;
  layer = "ARTWORK";
  constructor(public id: number, public kind: string, public name: string) {}
  get isRegion(): boolean {
    return this.kind === "Texture" || this.kind === "FontString";
  }
}

// ===== [S2] WowSim =====

interface Timer {
  due: number;
  fn: LuaValue;
  interval?: number;
  left: number;
  cancelled: boolean;
  handle: LuaTable;
}

export class WowSim {
  readonly rt: InterpRuntime;
  readonly log: LogEntry[] = [];
  readonly frames: FrameState[] = [];
  scenario: Scenario;
  now = 0;
  readonly baseTime = 1000;
  private timers: Timer[] = [];
  private nextId = 1;
  private methodTables = new Map<string, LuaTable>();
  readonly uiParent: FrameState;
  private tick = 0;

  constructor(readonly target: ResolvedTarget, scenario: Scenario = DEFAULT_SCENARIO) {
    this.scenario = structuredClone(scenario);
    this.rt = new InterpRuntime(target.luaVersion, {
      now: () => (this.baseTime + this.now) * 1000,
      print: (s) => this.addLog("print", s),
      compat50: target.syntax === "lua51-transpiled",
    });
    this.rt.interp.stepLimit = 2_000_000;
    this.installAliases();
    this.uiParent = this.makeFrame("Frame", "UIParent", null);
    this.uiParent.width = 1024;
    this.uiParent.height = 768;
    this.rt.interp.globals.set("UIParent", this.uiParent.table);
    const world = this.makeFrame("Frame", "WorldFrame", null);
    world.width = 1024;
    world.height = 768;
    this.rt.interp.globals.set("WorldFrame", world.table);
    this.installApi();
    const chat = this.makeFrame("Frame", "DEFAULT_CHAT_FRAME", this.uiParent);
    this.rt.interp.globals.set("DEFAULT_CHAT_FRAME", chat.table);
    chat.table.set("AddMessage", nativeFn("AddMessage", (a) => {
      this.addLog("chat", tostr(a[1]));
    }));
    this.rt.interp.globals.set("SlashCmdList", new LuaTable());
  }

  addLog(kind: LogEntry["kind"], text: string): void {
    this.log.push({ t: Math.round(this.now * 1000) / 1000, kind, text });
    if (this.log.length > 5000) this.log.splice(0, 1000);
  }

  // ----- Laden und Ausführen · loading and running -----
  loadSource(code: string, chunk = "addon.lua"): ExecResult {
    this.rt.output.length = 0;
    const r = this.rt.executeSync(code, chunk);
    if (!r.ok && r.error) this.addLog("error", r.error.message);
    return r;
  }

  private runLua(fn: LuaValue, args: LuaValue[]): void {
    const r = this.rt.callFunction(fn, args);
    if (!r.ok && r.error) this.addLog("error", r.error.message);
  }

  /** DE: Loginablauf eines Addons. EN: login sequence of an addon. */
  login(addonName = "MyAddon"): void {
    this.fireEvent("ADDON_LOADED", addonName);
    if (this.target.events.has("VARIABLES_LOADED")) this.fireEvent("VARIABLES_LOADED");
    if (this.target.events.has("PLAYER_LOGIN")) this.fireEvent("PLAYER_LOGIN");
    this.fireEvent("PLAYER_ENTERING_WORLD", ...(this.target.scriptArgs === "arguments" ? [true, false] : []));
  }

  // ----- Events und Skripte · events and scripts -----
  private callScript(f: FrameState, name: string, args: LuaValue[]): void {
    const fn = f.scripts.get(name);
    const hooks = f.hooks.get(name) ?? [];
    if (!fn && hooks.length === 0) return;
    const G = this.rt.interp.globals;
    const style = this.target.scriptArgs;
    const saved = new Map<string, LuaValue>();
    const setG = (k: string, v: LuaValue) => {
      if (!saved.has(k)) saved.set(k, G.get(k));
      G.set(k, v);
    };
    if (style !== "arguments") {
      setG("this", f.table);
      const payload = name === "OnEvent" ? args.slice(1) : args;
      if (name === "OnEvent") setG("event", args[0]);
      for (let i = 0; i < 9; i++) setG(`arg${i + 1}`, payload[i]);
    }
    try {
      for (const h of [...(fn ? [fn] : []), ...hooks]) this.runLua(h, style === "globals" ? [] : [f.table, ...args]);
    } finally {
      for (const [k, v] of saved) G.set(k, v);
    }
  }

  fireScript(f: FrameState, name: string, ...args: LuaValue[]): void {
    this.callScript(f, name, args);
  }

  fireEvent(event: string, ...args: LuaValue[]): void {
    if (!this.target.events.has(event)) this.addLog("warn", `Event '${event}' does not exist in target '${this.target.id}'.`);
    this.addLog("event", `${event}${args.length ? "(" + args.map(tostr).join(", ") + ")" : ""}`);
    for (const f of [...this.frames]) if (f.events.has(event)) this.callScript(f, "OnEvent", [event, ...args]);
  }

  click(frame: FrameState | string, button = "LeftButton"): void {
    const f = typeof frame === "string" ? this.byName(frame) : frame;
    if (!f) {
      this.addLog("warn", `No frame '${String(frame)}'.`);
      return;
    }
    if (!f.enabled) return;
    if (f.kind === "CheckButton") f.checked = !f.checked;
    this.callScript(f, "OnClick", this.target.scriptArgs === "arguments" ? [button, false] : [button]);
  }

  byName(name: string): FrameState | undefined {
    return this.frames.find((f) => f.name === name);
  }

  runSlash(line: string): boolean {
    const m = /^\/(\S+)\s*(.*)$/.exec(line.trim());
    if (!m) return false;
    const cmd = m[1]!.toLowerCase();
    const G = this.rt.interp.globals;
    const list = G.get("SlashCmdList");
    if (list instanceof LuaTable) {
      // like the client: for every SlashCmdList key look for SLASH_<KEY>1, SLASH_<KEY>2, ...
      for (const [key, fn] of [...list.hash]) {
        if (typeof key !== "string" || !(fn instanceof LuaFunction)) continue;
        for (let i = 1; ; i++) {
          const alias = G.get(`SLASH_${key}${i}`);
          if (typeof alias !== "string") break;
          if (alias.toLowerCase() === "/" + cmd) {
            this.runLua(fn, [m[2]]);
            return true;
          }
        }
      }
    }
    this.addLog("warn", `Unknown command /${cmd}`);
    return false;
  }

  // ----- Zeit · time -----
  advance(seconds: number, step = 0.05): void {
    let left = seconds;
    while (left > 1e-9) {
      const dt = Math.min(step, left);
      left -= dt;
      this.now += dt;
      this.tick++;
      // timers in order of their due time
      for (;;) {
        const due = this.timers.filter((t) => !t.cancelled && t.due <= this.now + 1e-9).sort((a, b) => a.due - b.due)[0];
        if (!due) break;
        if (due.interval !== undefined) {
          due.due += due.interval;
          due.left--;
          if (due.left === 0) due.cancelled = true;
        } else due.cancelled = true;
        this.runLua(due.fn, due.interval !== undefined ? [due.handle] : []);
      }
      this.timers = this.timers.filter((t) => !t.cancelled);
      for (const f of [...this.frames]) if (this.visible(f) && (f.scripts.has("OnUpdate") || f.hooks.has("OnUpdate"))) this.callScript(f, "OnUpdate", [dt]);
    }
  }

  visible(f: FrameState): boolean {
    for (let x: FrameState | null = f; x; x = x.parent) if (!x.shown) return false;
    return true;
  }

  // ----- Welt-Änderungen · world changes -----
  setCombat(on: boolean): void {
    this.scenario.inCombat = on;
    this.fireEvent(on ? "PLAYER_REGEN_DISABLED" : "PLAYER_REGEN_ENABLED");
  }

  setTarget(t: UnitData | undefined): void {
    this.scenario.target = t;
    this.fireEvent("PLAYER_TARGET_CHANGED");
  }

  setHealth(unit: string, health: number): void {
    const u = this.unit(unit);
    if (!u) return;
    u.health = Math.max(0, Math.min(u.healthMax, health));
    this.fireEvent("UNIT_HEALTH", unit);
  }

  unit(id: LuaValue): UnitData | undefined {
    if (typeof id !== "string") return undefined;
    const s = this.scenario;
    if (id === "player") return s.player;
    if (id === "target") return s.target;
    if (id === "pet") return s.pet;
    const m = /^party(\d)$/.exec(id);
    if (m) return s.party[Number(m[1]) - 1];
    return undefined;
  }

  // ----- Frames -----
  makeFrame(kind: string, name: string, parent: FrameState | null): FrameState {
    const f = new FrameState(this.nextId++, kind, name);
    f.parent = parent;
    f.table.host = f;
    f.table.meta = this.methodsFor(kind);
    if (kind === "Frame" || kind === "Button" || !f.isRegion) f.shown = true;
    if (parent) (f.isRegion ? parent.regions : parent.children).push(f);
    this.frames.push(f);
    if (name) this.rt.interp.globals.set(name, f.table);
    return f;
  }

  private methodsFor(kind: string): LuaTable {
    let meta = this.methodTables.get(kind);
    if (meta) return meta;
    const methods = new LuaTable();
    const names = new Set<string>();
    for (let w = this.target.widgets.get(kind); w; w = w.inherits ? this.target.widgets.get(w.inherits) : undefined) w.methods.forEach((m) => names.add(m));
    for (const n of names) {
      const impl = FRAME_METHODS[n];
      methods.set(n, nativeFn(n, (args) => {
        const self = args[0];
        if (!(self instanceof LuaTable) || !(self.host instanceof FrameState)) throw new Error(`bad self for ${n}: use ':' to call methods`);
        if (!impl) {
          this.addLog("warn", `Method ${kind}:${n} exists in the API data but is not simulated.`);
          return;
        }
        return impl(this, self.host, args.slice(1));
      }));
    }
    meta = new LuaTable();
    meta.set("__index", methods);
    this.methodTables.set(kind, meta);
    return meta;
  }

  // ----- Aliase und API · aliases and API -----
  private installAliases(): void {
    // intentionally empty: aliases are API functions and come from the plugin data (see [S4])
  }

  private installApi(): void {
    const G = this.rt.interp.globals;
    const setPath = (name: string, fn: LuaFunction) => {
      const parts = name.split(".");
      let t = G;
      for (const p of parts.slice(0, -1)) {
        let n = t.get(p);
        if (!(n instanceof LuaTable)) {
          n = new LuaTable();
          t.set(p, n);
        }
        t = n;
      }
      t.set(parts[parts.length - 1]!, fn);
    };
    for (const f of this.target.functions.values()) {
      const lib = LIB_ALIASES[f.name];
      if (lib) {
        const [ns, member] = lib.split(".") as [string, string];
        const src = (G.get(ns) as LuaTable | undefined)?.get(member);
        if (src) {
          G.set(f.name, src);
          continue;
        }
      }
      // keep the interpreter's own library functions (string.*, table.*, math.*)
      if (f.name.includes(".") && G.get(f.name.split(".")[0]!) instanceof LuaTable && (G.get(f.name.split(".")[0]!) as LuaTable).get(f.name.split(".")[1]!) !== undefined && !f.name.startsWith("C_")) continue;
      if (G.get(f.name) !== undefined && !f.name.includes(".")) continue;
      const impl = API[f.name];
      setPath(f.name, nativeFn(f.name, (args) => {
        if (!impl) {
          this.addLog("warn", `${f.name}() exists in the API data but is not simulated; it returned nothing.`);
          return;
        }
        return impl(this, args);
      }));
    }
  }

  addTimer(seconds: number, fn: LuaValue, interval?: number, iterations?: number): LuaTable {
    const handle = new LuaTable();
    const timer: Timer = { due: this.now + Math.max(0, seconds), fn, interval, left: iterations ?? -1, cancelled: false, handle };
    handle.set("Cancel", nativeFn("Cancel", () => {
      timer.cancelled = true;
    }));
    handle.set("IsCancelled", nativeFn("IsCancelled", () => timer.cancelled));
    this.timers.push(timer);
    return handle;
  }

  // ===== [S5] snapshot =====
  snapshot(): SnapshotNode[] {
    const model = new FormModel();
    const idOf = new Map<FrameState, string>();
    const frames = this.frames.filter((f) => f !== this.uiParent);
    const isUi = (f: FrameState | null) => f === null || f === this.uiParent;
    const sorted = [...frames].sort((a, b) => depth(a) - depth(b));
    for (const f of sorted) {
      const w = model.add(f.kind === "Texture" || f.kind === "FontString" ? f.kind : "Frame", isUi(f.parent) ? null : idOf.get(f.parent!) ?? null, {
        width: f.width || undefined, height: f.height || undefined,
        anchors: f.points.filter((p) => isUi(p.relativeTo) || idOf.has(p.relativeTo!)).map((p) => ({
          point: p.point as AnchorPoint, relativeTo: isUi(p.relativeTo) ? null : idOf.get(p.relativeTo!) ?? null, relativePoint: p.relativePoint as AnchorPoint, x: p.x, y: p.y,
        })),
      });
      // regions without parent frame (e.g. orphan textures) are skipped by model.add throwing; keep simple
      idOf.set(f, w.id);
    }
    const rects = model.layoutRects();
    return frames.map((f) => {
      const r = rects.get(idOf.get(f)!);
      return {
        id: f.id, name: f.name, kind: f.kind, parent: isUi(f.parent) ? null : f.parent!.id, shown: f.shown, visible: this.visible(f),
        text: f.text, texture: f.texture, color: f.color, alpha: f.alpha, strata: f.strata, level: f.level, layer: f.layer, events: [...f.events],
        rect: r ? { ...r } : undefined,
      };
    });
  }
}

function depth(f: FrameState): number {
  let d = 0;
  for (let x = f.parent; x; x = x.parent) d++;
  return d;
}

export interface SnapshotNode {
  id: number;
  name: string;
  kind: string;
  parent: number | null;
  shown: boolean;
  visible: boolean;
  text: string;
  texture: string;
  color: [number, number, number, number] | undefined;
  alpha: number;
  strata: string | undefined;
  level: number;
  layer: string;
  events: string[];
  rect: { left: number; bottom: number; width: number; height: number } | undefined;
}

// ===== [S3] Frame-Methoden =====

type Impl = (sim: WowSim, f: FrameState, a: LuaValue[]) => LuaValue[] | LuaValue | void;
const n = (v: LuaValue, d = 0): number => tonum(v) ?? d;

const LIB_ALIASES: Record<string, string> = {
  strlen: "string.len", strsub: "string.sub", strfind: "string.find", strlower: "string.lower", strupper: "string.upper",
  strrep: "string.rep", strbyte: "string.byte", strchar: "string.char", format: "string.format", gsub: "string.gsub",
  tinsert: "table.insert", tremove: "table.remove", getn: "table.getn", foreach: "table.foreach", foreachi: "table.foreachi",
  floor: "math.floor", ceil: "math.ceil", abs: "math.abs", max: "math.max", min: "math.min", mod: "math.mod", sqrt: "math.sqrt",
  random: "math.random",
};

function framesOf(sim: WowSim, v: LuaValue): FrameState | null {
  if (v instanceof LuaTable && v.host instanceof FrameState) return v.host;
  if (typeof v === "string") return sim.byName(v) ?? null;
  return null;
}

function addRegion(sim: WowSim, f: FrameState, kind: string, a: LuaValue[]): LuaValue {
  const name = typeof a[0] === "string" ? a[0] : "";
  const r = sim.makeFrame(kind, name, f);
  r.layer = typeof a[1] === "string" ? a[1] : "ARTWORK";
  if (kind === "FontString" && typeof a[2] === "string") r.text = "";
  return r.table;
}

const FRAME_METHODS: Record<string, Impl> = {
  SetPoint: (sim, f, a) => {
    const point = tostr(a[0]);
    let rel: FrameState | null = f.parent ?? sim.uiParent;
    let relPoint = point;
    let x = 0;
    let y = 0;
    if (typeof a[1] === "number") {
      x = n(a[1]);
      y = n(a[2]);
    } else {
      if (a[1] !== undefined) rel = framesOf(sim, a[1]) ?? rel;
      relPoint = a[2] !== undefined ? tostr(a[2]) : point;
      x = n(a[3]);
      y = n(a[4]);
    }
    f.points = f.points.filter((p) => p.point !== point);
    f.points.push({ point, relativeTo: rel, relativePoint: relPoint, x, y });
  },
  ClearAllPoints: (_s, f) => {
    f.points = [];
  },
  GetPoint: (_s, f, a) => {
    const p = f.points[n(a[0], 1) - 1];
    return p ? [p.point, p.relativeTo?.table, p.relativePoint, p.x, p.y] : undefined;
  },
  GetNumPoints: (_s, f) => f.points.length,
  SetWidth: (_s, f, a) => { f.width = n(a[0]); },
  SetHeight: (_s, f, a) => { f.height = n(a[0]); },
  SetSize: (_s, f, a) => { f.width = n(a[0]); f.height = n(a[1]); },
  GetWidth: (_s, f) => f.width,
  GetHeight: (_s, f) => f.height,
  SetAlpha: (_s, f, a) => { f.alpha = n(a[0], 1); },
  GetAlpha: (_s, f) => f.alpha,
  SetScale: (_s, f, a) => { f.scale = n(a[0], 1); },
  GetScale: (_s, f) => f.scale,
  Show: (sim, f) => {
    if (f.shown) return;
    f.shown = true;
    if (!f.isRegion) sim.fireScript(f, "OnShow");
  },
  Hide: (sim, f) => {
    if (!f.shown) return;
    f.shown = false;
    if (!f.isRegion) sim.fireScript(f, "OnHide");
  },
  SetShown: (sim, f, a) => FRAME_METHODS[a[0] === undefined || a[0] === false ? "Hide" : "Show"]!(sim, f, []),
  IsShown: (_s, f) => f.shown,
  IsVisible: (sim, f) => sim.visible(f),
  SetParent: (sim, f, a) => {
    const p = framesOf(sim, a[0]);
    if (f.parent) {
      f.parent.children = f.parent.children.filter((c) => c !== f);
      f.parent.regions = f.parent.regions.filter((c) => c !== f);
    }
    f.parent = p;
    if (p) (f.isRegion ? p.regions : p.children).push(f);
  },
  GetParent: (_s, f) => f.parent?.table,
  GetName: (_s, f) => (f.name ? f.name : undefined),
  GetObjectType: (_s, f) => f.kind,
  GetChildren: (_s, f) => f.children.map((c) => c.table),
  GetRegions: (_s, f) => f.regions.map((c) => c.table),
  SetFrameLevel: (_s, f, a) => { f.level = n(a[0]); },
  GetFrameLevel: (_s, f) => f.level,
  SetFrameStrata: (_s, f, a) => { f.strata = tostr(a[0]); },
  GetFrameStrata: (_s, f) => f.strata ?? f.parent?.strata ?? "MEDIUM",
  SetToplevel: () => undefined,
  Raise: (_s, f) => { f.level += 1; },
  Lower: (_s, f) => { f.level = Math.max(0, f.level - 1); },
  EnableMouse: (_s, f, a) => { f.mouse = a[0] !== undefined && a[0] !== false; },
  IsMouseEnabled: (_s, f) => f.mouse,
  SetMovable: (_s, f, a) => { f.movable = a[0] !== undefined && a[0] !== false; },
  IsMovable: (_s, f) => f.movable,
  RegisterForDrag: () => undefined,
  RegisterForClicks: () => undefined,
  StartMoving: () => undefined,
  StopMovingOrSizing: () => undefined,
  SetClampedToScreen: () => undefined,
  SetClipsChildren: () => undefined,
  SetBackdrop: (_s, f, a) => { f.backdrop = a[0] instanceof LuaTable ? a[0] : undefined; },
  SetBackdropColor: () => undefined,
  SetBackdropBorderColor: () => undefined,
  RegisterEvent: (sim, f, a) => {
    const e = tostr(a[0]);
    if (!sim.target.events.has(e)) sim.addLog("warn", `RegisterEvent: '${e}' is not an event of target '${sim.target.id}'.`);
    f.events.add(e);
  },
  UnregisterEvent: (_s, f, a) => { f.events.delete(tostr(a[0])); },
  UnregisterAllEvents: (_s, f) => { f.events.clear(); },
  IsEventRegistered: (_s, f, a) => f.events.has(tostr(a[0])),
  SetScript: (sim, f, a) => {
    const name = tostr(a[0]);
    const allowed = new Set<string>();
    for (let w = sim.target.widgets.get(f.kind); w; w = w.inherits ? sim.target.widgets.get(w.inherits) : undefined) w.scripts.forEach((s) => allowed.add(s));
    if (!allowed.has(name)) sim.addLog("warn", `SetScript: '${name}' is not a script of ${f.kind} in target '${sim.target.id}'.`);
    if (a[1] instanceof LuaFunction) f.scripts.set(name, a[1]);
    else f.scripts.delete(name);
  },
  GetScript: (_s, f, a) => f.scripts.get(tostr(a[0])),
  HasScript: (_s, f, a) => f.scripts.has(tostr(a[0])),
  HookScript: (_s, f, a) => {
    if (a[1] instanceof LuaFunction) {
      const name = tostr(a[0]);
      f.hooks.set(name, [...(f.hooks.get(name) ?? []), a[1]]);
    }
  },
  SetID: () => undefined,
  GetID: () => 0,
  CreateTexture: (sim, f, a) => addRegion(sim, f, "Texture", a),
  CreateFontString: (sim, f, a) => addRegion(sim, f, "FontString", a),
  SetText: (_s, f, a) => { f.text = tostr(a[0]); },
  GetText: (_s, f) => f.text,
  SetFont: () => undefined,
  SetTextColor: (_s, f, a) => { f.color = [n(a[0]), n(a[1]), n(a[2]), n(a[3], 1)]; },
  SetTextHeight: () => undefined,
  SetJustifyH: () => undefined,
  SetJustifyV: () => undefined,
  GetStringWidth: (_s, f) => f.text.length * 6,
  GetStringHeight: () => 12,
  SetTexture: (_s, f, a) => {
    if (typeof a[0] === "string") f.texture = a[0];
    else if (typeof a[0] === "number") f.color = [n(a[0]), n(a[1]), n(a[2]), n(a[3], 1)];
  },
  SetColorTexture: (_s, f, a) => { f.color = [n(a[0]), n(a[1]), n(a[2]), n(a[3], 1)]; },
  GetTexture: (_s, f) => f.texture,
  SetTexCoord: () => undefined,
  SetVertexColor: (_s, f, a) => { f.color = [n(a[0]), n(a[1]), n(a[2]), n(a[3], 1)]; },
  SetGradient: () => undefined,
  SetDrawLayer: (_s, f, a) => { f.layer = tostr(a[0]); },
  SetNormalTexture: (_s, f, a) => { f.texture = tostr(a[0]); },
  GetNormalTexture: () => undefined,
  Enable: (_s, f) => { f.enabled = true; },
  Disable: (_s, f) => { f.enabled = false; },
  IsEnabled: (_s, f) => f.enabled,
  Click: (sim, f) => sim.click(f),
  SetChecked: (_s, f, a) => { f.checked = a[0] !== undefined && a[0] !== false; },
  GetChecked: (_s, f) => f.checked,
  SetFocus: () => undefined,
  ClearFocus: () => undefined,
  SetMaxLetters: () => undefined,
  SetAutoFocus: () => undefined,
  SetMultiLine: () => undefined,
  SetNumeric: () => undefined,
  GetNumber: (_s, f) => tonum(f.text) ?? 0,
  HighlightText: () => undefined,
  SetMinMaxValues: (_s, f, a) => { f.min = n(a[0]); f.max = n(a[1], 1); },
  SetValue: (sim, f, a) => {
    f.value = n(a[0]);
    sim.fireScript(f, "OnValueChanged", f.value);
  },
  GetValue: (_s, f) => f.value,
  SetStatusBarTexture: () => undefined,
  SetStatusBarColor: () => undefined,
  SetCooldown: () => undefined,
  Clear: () => undefined,
  GetCenter: (sim, f) => {
    const r = sim.snapshot().find((x) => x.id === f.id)?.rect;
    return r ? [r.left + r.width / 2, r.bottom + r.height / 2] : undefined;
  },
  GetLeft: (sim, f) => sim.snapshot().find((x) => x.id === f.id)?.rect?.left,
  GetBottom: (sim, f) => sim.snapshot().find((x) => x.id === f.id)?.rect?.bottom,
  GetRight: (sim, f) => { const r = sim.snapshot().find((x) => x.id === f.id)?.rect; return r ? r.left + r.width : undefined; },
  GetTop: (sim, f) => { const r = sim.snapshot().find((x) => x.id === f.id)?.rect; return r ? r.bottom + r.height : undefined; },
};

// ===== [S4] API-Funktionen =====

type ApiImpl = (sim: WowSim, a: LuaValue[]) => LuaValue[] | LuaValue | void;

function healthShown(sim: WowSim, unitId: LuaValue, u: UnitData, max: boolean): number {
  // Vanilla 1.12: health of units outside your group is reported as a percentage
  const own = typeof unitId === "string" && (unitId === "player" || unitId === "pet" || /^party\d$/.test(unitId));
  if (sim.target.scriptArgs !== "arguments" && !own) return max ? 100 : Math.round((u.health / u.healthMax) * 100);
  return max ? u.healthMax : u.health;
}

const API: Record<string, ApiImpl> = {
  GetTime: (sim) => sim.baseTime + sim.now,
  UnitName: (sim, a) => sim.unit(a[0])?.name,
  UnitExists: (sim, a) => sim.unit(a[0]) !== undefined,
  UnitHealth: (sim, a) => { const u = sim.unit(a[0]); return u ? healthShown(sim, a[0], u, false) : 0; },
  UnitHealthMax: (sim, a) => { const u = sim.unit(a[0]); return u ? healthShown(sim, a[0], u, true) : 0; },
  UnitLevel: (sim, a) => sim.unit(a[0])?.level ?? -1,
  UnitClass: (sim, a) => { const u = sim.unit(a[0]); return u ? [u.class, u.classToken] : undefined; },
  UnitRace: (sim, a) => sim.unit(a[0])?.race,
  GetRealmName: (sim) => sim.scenario.realm,
  GetLocale: (sim) => sim.scenario.locale,
  GetNumPartyMembers: (sim) => sim.scenario.party.length,
  GetNumRaidMembers: (sim) => sim.scenario.raidCount ?? 0,
  InCombatLockdown: (sim) => sim.scenario.inCombat,
  SendChatMessage: (sim, a) => {
    const type = tostr(a[1] ?? "SAY").toUpperCase();
    sim.addLog("chat", `[${type}] ${tostr(a[0])}`);
    const ev = `CHAT_MSG_${type}`;
    if (sim.target.events.has(ev)) sim.fireEvent(ev, a[0], sim.scenario.player.name, tostr(a[2] ?? "Common"));
  },
  CreateFrame: (sim, a) => {
    const kind = tostr(a[0]);
    if (!sim.target.widgets.has(kind)) throw new Error(`CreateFrame: unknown frame type '${kind}' in target '${sim.target.id}'`);
    const name = typeof a[1] === "string" ? a[1] : "";
    if (name && sim.rt.interp.globals.get(name) !== undefined) sim.addLog("warn", `CreateFrame: a global named '${name}' already exists and is replaced.`);
    const parent = a[2] === undefined ? sim.uiParent : framesOf(sim, a[2]) ?? sim.uiParent;
    const frame = sim.makeFrame(kind, name, parent);
    if (typeof a[3] === "string" && a[3].split(",").some((t) => t.trim() === "BackdropTemplate")) {
      // retail: the template mixes the backdrop methods into the frame
      for (const m of ["SetBackdrop", "SetBackdropColor", "SetBackdropBorderColor"]) {
        const impl = FRAME_METHODS[m]!;
        frame.table.set(m, nativeFn(m, (args) => impl(sim, frame, args.slice(1))));
      }
    }
    return frame.table;
  },
  getglobal: (sim, a) => sim.rt.interp.globals.get(a[0]),
  setglobal: (sim, a) => { sim.rt.interp.globals.set(a[0], a[1]); },
  "C_Timer.After": (sim, a) => { sim.addTimer(n(a[0]), a[1]); },
  "C_Timer.NewTimer": (sim, a) => sim.addTimer(n(a[0]), a[1]),
  "C_Timer.NewTicker": (sim, a) => sim.addTimer(n(a[0]), a[1], Math.max(0.001, n(a[0])), a[2] === undefined ? undefined : n(a[2])),
  hooksecurefunc: (sim, a) => {
    const G = sim.rt.interp.globals;
    const name = tostr(a[0]);
    const orig = G.get(name);
    const hook = a[1];
    if (!(orig instanceof LuaFunction)) throw new Error(`hooksecurefunc: '${name}' is not a function`);
    G.set(name, nativeFn(name, (args) => {
      const r = sim.rt.interp.call(orig, args);
      sim.rt.interp.call(hook, args);
      return r;
    }));
  },
  strsplit: (_sim, a) => {
    const d = tostr(a[0]);
    return tostr(a[1]).split(d === "" ? /(?:)/ : d).map((x) => x);
  },
  strtrim: (_sim, a) => tostr(a[0]).trim(),
};
