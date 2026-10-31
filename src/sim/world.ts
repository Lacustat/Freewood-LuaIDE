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
 * DE: Die Simulation führt Addon-Code in einer Lua-VM aus (eigener Interpreter oder echte
 *     Lua-5.0-VM, siehe engine.ts/prelude.ts). Wichtiger Grundsatz: Es
 *     existiert nur, was in den Plugin-Daten des Ziels steht. Ruft ein Addon z. B. `SetSize` in
 *     einem Vanilla-Ziel auf, kommt – wie im echten Client – „attempt to call method … (a nil
 *     value)“. Stehen Funktionen in den Daten, aber ohne Simulation, wird beim Aufruf gewarnt.
 * EN: the simulation runs addon code in a Lua VM (own interpreter or real Lua 5.0 VM, see
 *     engine.ts/prelude.ts). Core principle: only what is in
 *     the target's plugin data exists. If an addon calls e.g. `SetSize` on a vanilla target, you
 *     get "attempt to call method … (a nil value)" like in the real client. Functions listed in
 *     the data but not simulated produce a warning when called.
 */

import type { ResolvedTarget } from "../core/plugins.js";
import { installOs } from "../lua/stdlib.js";
import { LuaTable, tonum, tostr, type LuaFunction, type LuaValue } from "../lua/value.js";
import type { ExecResult } from "../runtime/types.js";
import { InterpEngine, type Prim, type SimEngine } from "./engine.js";
import { buildPrelude, REF_MARK } from "./prelude.js";
import { EXTRA_API } from "./extras.js";
import { CHARACTER_API, DEFAULT_CHARACTER, type CharacterState } from "./character.js";
import { INTERACTION_API, SAMPLE_GOSSIP, SAMPLE_LOOT, SAMPLE_MERCHANT, type GossipState, type InteractionState, type LootState, type MerchantState } from "./interaction.js";
import { AURA_API } from "./auras.js";
import { CvarStore, SYSTEM_API } from "./system.js";
import { UNIT_API } from "./units.js";
import { DEFAULT_INVENTORY, INVENTORY_API, type InventoryState } from "./inventory.js";
import { rewrite51to50 } from "../lua/rewrite50.js";
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
  parent: FrameState | null = null;
  children: FrameState[] = [];
  regions: FrameState[] = [];
  shown = true;
  /** DE: Namen der Skripte mit Handler bzw. Hook (die Funktionen liegen in der VM). EN: script names with handler / hook (the functions live in the VM). */
  scripts = new Set<string>();
  hooks = new Set<string>();
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
  backdrop = false;
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
  id: number;
  due: number;
  hid: number;
  interval?: number;
  left: number;
  cancelled: boolean;
}

/** DE: Verweise auf Dinge, die in der VM liegen. EN: references to things living in the VM. */
class HandlerRef {
  constructor(readonly id: number) {}
}
class TableRef {}

function encodeRef(v: unknown): unknown {
  if (v instanceof FrameState) return `${REF_MARK}F${v.id}:${v.kind}:${v.name}`;
  if (typeof v === "object" && v !== null) return `${REF_MARK}J${JSON.stringify(v)}`; // DE/EN: nested value -> JSON, the VM builds a table
  return v;
}

export class WowSim {
  readonly engine: SimEngine;
  readonly log: LogEntry[] = [];
  readonly frames: FrameState[] = [];
  scenario: Scenario;
  now = 0;
  readonly baseTime = 1000;
  private timers: Timer[] = [];
  private nextId = 1;
  private nextTimer = 1;
  private byId = new Map<number, FrameState>();
  private timerIndex = new Map<number, Timer>();
  private handlers = new Map<number, HandlerRef>();
  readonly uiParent: FrameState;
  readonly worldFrame: FrameState;
  readonly chatFrame: FrameState;
  private tick = 0;
  /** DE: Tiefe verschachtelter VM-Aufrufe; Skripte, die währenddessen ausgelöst werden, laufen danach. EN: depth of nested VM calls; scripts triggered meanwhile run afterwards. */
  private depth = 0;
  private queue: Array<() => void> = [];
  /** DE: 5.1-Quelltext vor dem Ausführen nach 5.0 umschreiben (ClassicAPI auf der echten VM). EN: rewrite 5.1 source to 5.0 before running (ClassicAPI on the real VM). */
  readonly rewrite: boolean;
  addonName = "MyAddon";

  constructor(readonly target: ResolvedTarget, scenario: Scenario = DEFAULT_SCENARIO, engine?: SimEngine) {
    this.scenario = structuredClone(scenario);
    this.engine = engine ?? new InterpEngine(target.luaVersion, {
      now: () => (this.baseTime + this.now) * 1000,
      compat50: target.syntax === "lua51-transpiled",
      stepLimit: 2_000_000,
    });
    this.rewrite = target.syntax === "lua51-transpiled" && this.engine.id !== "freewood-interp";
    this.uiParent = this.makeFrame("Frame", "UIParent", null);
    this.uiParent.width = 1024;
    this.uiParent.height = 768;
    this.worldFrame = this.makeFrame("Frame", "WorldFrame", null);
    this.worldFrame.width = 1024;
    this.worldFrame.height = 768;
    this.chatFrame = this.makeFrame("Frame", "DEFAULT_CHAT_FRAME", this.uiParent);
    this.installHost();
    const r = this.guard(() => this.engine.run(buildPrelude(target, { rewrite: this.rewrite, vm: this.engine.luaVersion }), "=prelude"));
    if (!r.ok) throw new Error(`simulation prelude failed: ${r.error?.message}`);
  }

  addLog(kind: LogEntry["kind"], text: string): void {
    this.log.push({ t: Math.round(this.now * 1000) / 1000, kind, text });
    if (this.log.length > 5000) this.log.splice(0, 1000);
  }

  // ----- VM-Aufrufe · VM calls -----
  /** DE: Führt `fn` als VM-Aufruf aus; danach laufen aufgeschobene Skripte. EN: runs `fn` as a VM call; deferred scripts run afterwards. */
  private guard<T>(fn: () => T): T {
    this.depth++;
    try {
      return fn();
    } finally {
      this.depth--;
      if (this.depth === 0) this.flush();
    }
  }

  private flush(): void {
    while (this.depth === 0 && this.queue.length > 0) this.queue.shift()!();
  }

  private callLua(name: string, args: Prim[]): ExecResult {
    const r = this.guard(() => this.engine.call(name, args));
    if (!r.ok && r.error) this.addLog("error", r.error.message);
    return r;
  }

  /** DE: Führt Quelltext aus, ohne Fehler zu protokollieren (Tests, Konsole). EN: runs source without logging errors (tests, console). */
  exec(code: string, chunk = "=console"): ExecResult {
    return this.guard(() => this.engine.run(this.prepare(code, chunk), chunk));
  }

  /** DE: Wendet bei Bedarf den 5.1→5.0-Umschreiber an; bei Syntaxfehlern meldet die VM selbst. EN: applies the 5.1→5.0 rewriter if needed; on syntax errors the VM reports itself. */
  private prepare(code: string, chunk: string): string {
    if (this.target.syntax !== "lua51-transpiled") return code;
    if (!this.rewrite) {
      // own interpreter: speaks 5.1 syntax itself; only the addon file arguments (name, table) are added
      return code.includes("...") ? `return (function(...) ${code}\nend)(${JSON.stringify(this.addonName)}, __fw_addon_table(${JSON.stringify(this.addonName)}))` : code;
    }
    try {
      return rewrite51to50(code, chunk.replace(/^[=@]/, ""), { addonName: this.addonName });
    } catch {
      return code;
    }
  }

  getGlobal(name: string): unknown {
    return this.engine.getGlobal(name);
  }

  // ----- Laden und Ausführen · loading and running -----
  loadSource(code: string, chunk = "addon.lua", addonName?: string): ExecResult {
    if (addonName !== undefined) this.addonName = addonName;
    const r = this.exec(code, `=${chunk}`);
    if (!r.ok && r.error) this.addLog("error", r.error.message);
    return r;
  }

  /** DE: Loginablauf eines Addons. EN: login sequence of an addon. */
  login(addonName = "MyAddon"): void {
    this.fireEvent("ADDON_LOADED", addonName);
    if (this.target.events.has("VARIABLES_LOADED")) this.fireEvent("VARIABLES_LOADED");
    if (this.target.events.has("PLAYER_LOGIN")) this.fireEvent("PLAYER_LOGIN");
    this.fireEvent("PLAYER_ENTERING_WORLD", ...(this.target.scriptArgs === "arguments" ? [true, false] : []));
  }

  // ----- Events und Skripte · events and scripts -----
  private callScript(f: FrameState, name: string, args: Prim[]): void {
    if (!f.scripts.has(name) && !f.hooks.has(name)) return;
    if (this.depth > 0) {
      this.queue.push(() => this.callScript(f, name, args));
      return;
    }
    this.callLua("__fw_fire", [f.id, name, ...args.map((a) => encodeRef(a) as Prim)]);
  }

  fireScript(f: FrameState, name: string, ...args: Prim[]): void {
    this.callScript(f, name, args);
  }

  fireEvent(event: string, ...args: Prim[]): void {
    if (!this.target.events.has(event)) this.addLog("warn", `Event '${event}' does not exist in target '${this.target.id}'.`);
    this.addLog("event", `${event}${args.length ? "(" + args.map((a) => tostr(a)).join(", ") + ")" : ""}`);
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
    const r = this.callLua("__fw_slash", [cmd, m[2]]);
    if (r.ok && r.values[0] === true) return true;
    if (r.ok) this.addLog("warn", `Unknown command /${cmd}`);
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
      // host timers (casts, cooldown ends) in order of their due time
      for (;;) {
        this.hostTimers = this.hostTimers.filter((t) => !t.dead);
        const next = this.hostTimers.filter((t) => t.due <= this.now + 1e-9).sort((a, b) => a.due - b.due)[0];
        if (!next) break;
        next.dead = true;
        next.fn();
      }
      // timers in order of their due time
      for (;;) {
        const due = this.timers.filter((t) => !t.cancelled && t.due <= this.now + 1e-9).sort((a, b) => a.due - b.due)[0];
        if (!due) break;
        if (due.interval !== undefined) {
          due.due += due.interval;
          due.left--;
          if (due.left === 0) due.cancelled = true;
        } else due.cancelled = true;
        this.callLua("__fw_timer", [due.hid, due.id, due.interval !== undefined]);
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

  /** DE: Taste oder Maustaste drücken/loslassen (LSHIFT, RCTRL, LALT, LeftButton ...). EN: press/release a key or mouse button. */
  setKey(name: string, down: boolean): void { this.store("keys", () => ({} as Record<string, boolean>))[name] = down; }

  setHealth(unit: string, health: number): void {
    const u = this.unit(unit);
    if (!u) return;
    u.health = Math.max(0, Math.min(u.healthMax, health));
    this.fireEvent("UNIT_HEALTH", unit);
  }

  readonly cvars = new CvarStore();
  /** DE: Serverzeit (UTC) in Unix-Sekunden. EN: server time (UTC) in Unix seconds. */
  serverEpoch(): number { return 1_778_260_148 + this.now; }

  private char: CharacterState | undefined;

  character(): CharacterState {
    return (this.char ??= structuredClone(this.scenario.character ?? DEFAULT_CHARACTER));
  }

  private inter: InteractionState = { buyback: [] };

  private stores = new Map<string, unknown>();
  /** DE: Zustand je Simulation für die Sim-Module (`host.ts`). EN: per-simulation state for the sim modules. */
  store<T>(key: string, init: () => T): T {
    if (!this.stores.has(key)) this.stores.set(key, init());
    return this.stores.get(key) as T;
  }

  interaction(): InteractionState { return this.inter; }
  fire(event: string, ...args: (string | number | boolean)[]): void { this.fireEvent(event, ...args); }
  fireIf(event: string, ...args: (string | number | boolean)[]): void { if (this.target.events.has(event)) this.fireEvent(event, ...args); }

  private hostTimers: { due: number; fn: () => void; dead: boolean }[] = [];
  later(seconds: number, fn: () => void): { cancel(): void } {
    const t = { due: this.now + Math.max(0, seconds), fn, dead: false };
    this.hostTimers.push(t);
    return { cancel: () => { t.dead = true; } };
  }
  note(kind: "info" | "warn", text: string): void { this.addLog(kind, text); }

  /** DE: Öffnet das Beutefenster (Beispieldaten, wenn nichts übergeben wird). EN: opens the loot window. */
  openLoot(loot: LootState = structuredClone(SAMPLE_LOOT)): void { this.inter.loot = loot; this.fireEvent("LOOT_OPENED"); }
  /** DE: Öffnet ein Händlerfenster. EN: opens a merchant window. */
  openMerchant(m: MerchantState = structuredClone(SAMPLE_MERCHANT)): void { this.inter.merchant = m; this.fireEvent("MERCHANT_SHOW"); }
  /** DE: Öffnet ein Gossip-Fenster. EN: opens a gossip window. */
  openGossip(g: GossipState = structuredClone(SAMPLE_GOSSIP)): void { this.inter.gossip = g; this.fireEvent("GOSSIP_SHOW"); }

  private inv: InventoryState | undefined;

  inventory(): InventoryState {
    return (this.inv ??= structuredClone(this.scenario.inventory ?? DEFAULT_INVENTORY));
  }

  unit(id: unknown): UnitData | undefined {
    if (typeof id !== "string") return undefined;
    const s = this.scenario;
    if (id === "player") return s.player;
    if (id === "target") return s.target;
    if (id === "pet") return s.pet;
    if (id === "focus") return s.focus;
    if (id === "mouseover") return s.mouseover;
    if (id === "targettarget") return s.target ? s.player : undefined;
    const m = /^party(\d)$/.exec(id);
    if (m) return s.party[Number(m[1]) - 1];
    return undefined;
  }

  // ----- Frames -----
  makeFrame(kind: string, name: string, parent: FrameState | null): FrameState {
    const f = new FrameState(this.nextId++, kind, name);
    f.parent = parent;
    if (kind === "Frame" || kind === "Button" || !f.isRegion) f.shown = true;
    if (parent) (f.isRegion ? parent.regions : parent.children).push(f);
    this.frames.push(f);
    this.byId.set(f.id, f);
    return f;
  }

  // ----- Brücke zur VM · bridge to the VM -----
  private decode(v: unknown): unknown {
    if (typeof v !== "string" || v.charCodeAt(0) !== 1) return v;
    if (v.charAt(1) === "J") { try { return JSON.parse(v.slice(2)); } catch { return new TableRef(); } }
    const m = /^\u0001([FHT])(\d*)/.exec(v);
    if (!m) return v;
    if (m[1] === "F") return this.byId.get(Number(m[2])) ?? undefined;
    if (m[1] === "H") return new HandlerRef(Number(m[2]));
    return new TableRef();
  }

  private installHost(): void {
    const e = this.engine;
    e.host("__fw_log", (kind, text) => {
      this.addLog(kind as LogEntry["kind"], String(text));
    });
    e.host("__fw_rewrite", (src, chunk) => {
      if (!this.rewrite) return [false];
      try {
        return [true, rewrite51to50(String(src), String(chunk).replace(/^[=@]/, ""))];
      } catch {
        return [false];
      }
    });
    e.host("__fw_time", () => Math.floor(this.baseTime + this.now));
    const osLib = installOs(() => (this.baseTime + this.now) * 1000);
    e.host("__fw_date", (fmt, t) => {
      const r = (osLib.get("date") as LuaFunction).native!([fmt as LuaValue, t as LuaValue]);
      const v = Array.isArray(r) ? r[0] : r;
      if (v instanceof LuaTable) return ["year", "month", "day", "hour", "min", "sec", "wday"].map((k) => v.get(k) as Prim);
      return v as Prim;
    });
    e.host("__fw_mktime", (y, m, d, h, mi, s) => Math.floor(new Date(Number(y), Number(m) - 1, Number(d), h === undefined ? 12 : Number(h), mi === undefined ? 0 : Number(mi), s === undefined ? 0 : Number(s)).getTime() / 1000));
    // all results: (true, ...values) or (false, message)
    const reply = (fn: () => unknown): Prim[] => {
      try {
        const r = fn();
        const list = Array.isArray(r) ? r : r === undefined ? [] : [r]; // DE/EN: an array = several return values; a plain object = one table
        return [true, ...list.map((x) => encodeRef(x) as Prim)];
      } catch (err) {
        return [false, (err as Error).message];
      }
    };
    e.host("__fw_m", (id, name, ...args) => {
      const f = this.byId.get(Number(id));
      const n = String(name);
      return reply(() => {
        if (!f) throw new Error(`unknown frame ${String(id)}`);
        const impl = FRAME_METHODS[n];
        if (!impl) {
          this.addLog("warn", `Method ${f.kind}:${n} exists in the API data but is not simulated.`);
          return undefined;
        }
        return impl(this, f, args.map((a) => this.decode(a)));
      });
    });
    e.host("__fw_api", (name, ...args) => {
      const n = String(name);
      return reply(() => {
        const impl = API[n];
        if (!impl) {
          // DE: Keine eigene Logik: typisierte Standardwerte aus der Signatur, mit klarem Hinweis im Log.
          // EN: no own logic: typed default values from the signature, with a clear note in the log.
          const def = this.target.functions.get(n);
          const rets = def && !def.tags?.includes("signature-unknown") ? def.returns ?? [] : [];
          const vals = rets.map((r) => (r.type === "number" ? 0 : r.type === "string" ? "" : r.type === "boolean" ? false : r.type === "table" ? {} : undefined));
          while (vals.length && vals[vals.length - 1] === undefined) vals.pop();
          this.addLog("warn", `${n}() has no simulated behaviour yet; it returned the type default${vals.length === 1 ? "" : "s"}${vals.length ? ` (${vals.map((v) => JSON.stringify(v ?? null)).join(", ")})` : " (nothing)"}.`);
          return vals as never;
        }
        return impl(this, args.map((a) => this.decode(a)));
      });
    });
  }

  addTimer(seconds: number, fn: unknown, interval?: number, iterations?: number): number {
    if (!(fn instanceof HandlerRef)) throw new Error("timer callback must be a function");
    const timer: Timer = { id: this.nextTimer++, due: this.now + Math.max(0, seconds), hid: fn.id, interval, left: iterations ?? -1, cancelled: false };
    this.timers.push(timer);
    this.timerIndex.set(timer.id, timer);
    return timer.id;
  }

  timerById(id: unknown): Timer | undefined {
    return typeof id === "number" ? this.timerIndex.get(id) : undefined;
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

type Impl = (sim: WowSim, f: FrameState, a: unknown[]) => unknown;
const n = (v: unknown, d = 0): number => tonum(v as LuaValue) ?? d;
const str = (v: unknown): string => tostr(v as LuaValue);

function framesOf(sim: WowSim, v: unknown): FrameState | null {
  if (v instanceof FrameState) return v;
  if (typeof v === "string") return sim.byName(v) ?? null;
  return null;
}

function addRegion(sim: WowSim, f: FrameState, kind: string, a: unknown[]): FrameState {
  const name = typeof a[0] === "string" ? a[0] : "";
  const r = sim.makeFrame(kind, name, f);
  r.layer = typeof a[1] === "string" ? a[1] : "ARTWORK";
  if (kind === "FontString" && typeof a[2] === "string") r.text = "";
  return r;
}

const FRAME_METHODS: Record<string, Impl> = {
  SetPoint: (sim, f, a) => {
    const point = str(a[0]);
    let rel: FrameState | null = f.parent ?? sim.uiParent;
    let relPoint = point;
    let x = 0;
    let y = 0;
    if (typeof a[1] === "number") {
      x = n(a[1]);
      y = n(a[2]);
    } else {
      if (a[1] !== undefined) rel = framesOf(sim, a[1]) ?? rel;
      relPoint = a[2] !== undefined ? str(a[2]) : point;
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
    return p ? [p.point, p.relativeTo ?? undefined, p.relativePoint, p.x, p.y] : undefined;
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
  GetParent: (_s, f) => f.parent ?? undefined,
  GetName: (_s, f) => (f.name ? f.name : undefined),
  GetObjectType: (_s, f) => f.kind,
  GetChildren: (_s, f) => f.children,
  GetRegions: (_s, f) => f.regions,
  SetFrameLevel: (_s, f, a) => { f.level = n(a[0]); },
  GetFrameLevel: (_s, f) => f.level,
  SetFrameStrata: (_s, f, a) => { f.strata = str(a[0]); },
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
  SetBackdrop: (_s, f, a) => { f.backdrop = a[0] instanceof TableRef || (typeof a[0] === "object" && a[0] !== null); },
  SetBackdropColor: () => undefined,
  SetBackdropBorderColor: () => undefined,
  RegisterEvent: (sim, f, a) => {
    const e = str(a[0]);
    if (!sim.target.events.has(e)) sim.addLog("warn", `RegisterEvent: '${e}' is not an event of target '${sim.target.id}'.`);
    f.events.add(e);
  },
  UnregisterEvent: (_s, f, a) => { f.events.delete(str(a[0])); },
  UnregisterAllEvents: (_s, f) => { f.events.clear(); },
  IsEventRegistered: (_s, f, a) => f.events.has(str(a[0])),
  SetScript: (sim, f, a) => {
    const name = str(a[0]);
    const allowed = new Set<string>();
    for (let w = sim.target.widgets.get(f.kind); w; w = w.inherits ? sim.target.widgets.get(w.inherits) : undefined) w.scripts.forEach((s) => allowed.add(s));
    if (!allowed.has(name)) sim.addLog("warn", `SetScript: '${name}' is not a script of ${f.kind} in target '${sim.target.id}'.`);
    if (a[1] === true) f.scripts.add(name);
    else f.scripts.delete(name);
  },
  HookScript: (_s, f, a) => {
    f.hooks.add(str(a[0]));
  },
  SetID: () => undefined,
  GetID: () => 0,
  CreateTexture: (sim, f, a) => addRegion(sim, f, "Texture", a),
  CreateFontString: (sim, f, a) => addRegion(sim, f, "FontString", a),
  SetText: (_s, f, a) => { f.text = str(a[0]); },
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
  SetDrawLayer: (_s, f, a) => { f.layer = str(a[0]); },
  SetNormalTexture: (_s, f, a) => { f.texture = str(a[0]); },
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

type ApiImpl = (sim: WowSim, a: unknown[]) => unknown;

function healthShown(sim: WowSim, unitId: unknown, u: UnitData, max: boolean): number {
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
    const type = str(a[1] ?? "SAY").toUpperCase();
    sim.addLog("chat", `[${type}] ${str(a[0])}`);
    const ev = `CHAT_MSG_${type}`;
    if (sim.target.events.has(ev)) sim.fireEvent(ev, a[0] as string, sim.scenario.player.name, str(a[2] ?? "Common"));
  },
  CreateFrame: (sim, a) => {
    const kind = str(a[0]);
    if (!sim.target.widgets.has(kind)) throw new Error(`CreateFrame: unknown frame type '${kind}' in target '${sim.target.id}'`);
    const name = typeof a[1] === "string" ? a[1] : "";
    const parent = a[2] === undefined ? sim.uiParent : framesOf(sim, a[2]) ?? sim.uiParent;
    return sim.makeFrame(kind, name, parent);
  },
  "C_Timer.After": (sim, a) => { sim.addTimer(n(a[0]), a[1]); },
  "C_Timer.NewTimer": (sim, a) => sim.addTimer(n(a[0]), a[1]),
  "C_Timer.NewTicker": (sim, a) => sim.addTimer(n(a[0]), a[1], Math.max(0.001, n(a[0])), a[2] === undefined ? undefined : n(a[2])),
  __timer_cancel: (sim, a) => { const t = sim.timerById(a[0]); if (t) t.cancelled = true; },
  __timer_cancelled: (sim, a) => sim.timerById(a[0])?.cancelled ?? true,
  __boot: (sim) => [sim.uiParent, sim.worldFrame, sim.chatFrame],
  strsplit: (_sim, a) => {
    // delimiters are a SET of characters; `pieces` caps the number of results (docs/API.md)
    const set = str(a[0]);
    const text = str(a[1]);
    const max = a[2] === undefined ? 0 : Math.floor(n(a[2]));
    const out: string[] = [];
    let cur = "";
    for (const ch of text) {
      if (set.includes(ch) && (max <= 0 || out.length < max - 1)) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  },
  strtrim: (_sim, a) => {
    const chars = a[1] === undefined ? " \t\n\v\f\r" : str(a[1]);
    const s = [...str(a[0])];
    let i = 0;
    let j = s.length;
    while (i < j && chars.includes(s[i]!)) i++;
    while (j > i && chars.includes(s[j - 1]!)) j--;
    return s.slice(i, j).join("");
  },
  strlenutf8: (_sim, a) => [...str(a[0])].length,
  strcmputf8i: (_sim, a) => {
    const x = str(a[0]).toLowerCase();
    const y = str(a[1]).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  },
};
for (const [k, f] of Object.entries(UNIT_API)) API[k] = (sim, a) => f(sim, a);
API.UnitHealthMissing = (sim, a) => { const u = sim.unit(a[0]); return u ? Math.max(0, healthShown(sim, a[0], u, true) - healthShown(sim, a[0], u, false)) : 0; };
for (const [k, f] of Object.entries(INTERACTION_API)) API[k] = (sim, a) => f(sim, a);
for (const [k, f] of Object.entries(EXTRA_API)) API[k] = (sim, a) => f(sim, a);
for (const [k, f] of Object.entries(AURA_API)) API[k] = (sim, a) => f(sim, a);
for (const [k, f] of Object.entries(SYSTEM_API)) API[k] = (sim, a) => f(sim, a);
for (const [k, f] of Object.entries(CHARACTER_API)) API[k] = (sim, a) => f(sim.character(), sim.inventory(), a);
for (const [k, f] of Object.entries(INVENTORY_API)) API[k] = (sim, a) => f(sim.inventory(), a);
