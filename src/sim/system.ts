/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] CVars ......... CvarStore (Werte, Standardwerte, nur lesbar, temporär)
 *   [S2] Zeit .......... Kalenderzeit aus Unix-Sekunden
 *   [S3] SYSTEM_API .... GetCVar/SetCVar, C_CVar.*, C_DateAndTime.* (primitive Rückgaben)
 *
 * DE: Spiel-Einstellungen (CVars) und Serverzeit der Simulation nach Vanilla und ClassicAPI-Doku.
 *     Beispielwerte; die Serverzeit ist UTC und läuft mit der simulierten Zeit.
 * EN: game settings (CVars) and server time of the simulation, per Vanilla and the ClassicAPI docs.
 *     Sample values; server time is UTC and advances with the simulated time.
 */

// ===== [S1] CVars =====

interface Cvar { value: string; def: string; readOnly: boolean; temp?: string; hadTemp?: boolean }

export class CvarStore {
  private readonly map = new Map<string, Cvar>();

  constructor() {
    const add = (n: string, v: string, ro = false): void => { this.map.set(n, { value: v, def: v, readOnly: ro }); };
    add("realmList", "logon.example.invalid", true);
    add("realmName", "Sandbox", true);
    add("scriptMemory", "0", true);
    add("gxResolution", "1920x1080");
    add("gxMaximize", "1");
    add("gxVSync", "1");
    add("CombatDamage", "1");
    add("cameraDistanceMax", "15");
    add("SoftTargetFriend", "0");
    add("Sound_EnableAllSound", "1");
  }

  has(n: unknown): boolean { return typeof n === "string" && this.map.has(n); }
  get(n: unknown): Cvar | undefined { return typeof n === "string" ? this.map.get(n) : undefined; }
  register(n: string, def: string): void { if (!this.map.has(n)) this.map.set(n, { value: def, def, readOnly: false }); }
}

function cvarText(v: unknown): string {
  return typeof v === "number" ? String(v) : typeof v === "string" ? v : "0";
}

// ===== [S2] Zeit · time =====

export function calendar(epoch: number): number[] {
  const d = new Date(epoch * 1000);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCDay() + 1, d.getUTCHours(), d.getUTCMinutes()];
}

// ===== [S3] SYSTEM_API =====

export interface SystemHost { readonly cvars: CvarStore; serverEpoch(): number; now: number }

type Impl = (h: SystemHost, a: unknown[]) => unknown;

function setCvar(h: SystemHost, a: unknown[]): boolean | undefined {
  const c = h.cvars.get(a[0]);
  if (!c) return undefined;
  if (c.readOnly) return false;
  c.value = cvarText(a[1]);
  c.hadTemp = false;
  return true;
}

export const SYSTEM_API: Record<string, Impl> = {
  GetCVar: (h, a) => h.cvars.get(a[0])?.value,
  GetCVarDefault: (h, a) => h.cvars.get(a[0])?.def,
  RegisterCVar: (h, a) => { if (typeof a[0] === "string") h.cvars.register(a[0], cvarText(a[1])); },
  SetCVar: (h, a) => { setCvar(h, a); },
  "C_CVar.SetCVar": (h, a) => setCvar(h, a),
  "C_CVar.GetCVarInfo": (h, a) => { const c = h.cvars.get(a[0]); return c ? [c.value, c.def, false, false, false, false, c.readOnly] : undefined; },
  "C_CVar.DoesCVarExist": (h, a) => h.cvars.has(a[0]),
  "C_CVar.AreCVarsLoaded": () => true,
  "C_CVar.GetCVarBool": (h, a) => {
    const c = h.cvars.get(a[0]);
    if (!c) return undefined;
    const n = Number(c.value);
    return c.value.toLowerCase() === "true" || (c.value.trim() !== "" && !Number.isNaN(n) && n !== 0);
  },
  "C_CVar.GetCVarBitfield": (h, a) => {
    const c = h.cvars.get(a[0]);
    if (!c || typeof a[1] !== "number" || a[1] < 1 || a[1] > 64) return undefined;
    try { return ((BigInt(Math.trunc(Number(c.value))) >> BigInt(a[1] - 1)) & 1n) === 1n; } catch { return false; }
  },
  "C_CVar.SetCVarBitfield": (h, a) => {
    const c = h.cvars.get(a[0]);
    if (!c || c.readOnly || typeof a[1] !== "number" || a[1] < 1 || a[1] > 64) return false;
    let v: bigint;
    try { v = BigInt(Math.trunc(Number(c.value))); } catch { v = 0n; }
    const bit = 1n << BigInt(a[1] - 1);
    c.value = String(a[2] === undefined || a[2] === false ? v & ~bit : v | bit);
    return true;
  },
  "C_CVar.SetTempCVar": (h, a) => {
    const c = h.cvars.get(a[0]);
    if (!c || c.readOnly) return;
    if (!c.hadTemp) { c.temp = c.value; c.hadTemp = true; }
    c.value = cvarText(a[1]);
  },
  "C_CVar.RemoveTempCVar": (h, a) => {
    const c = h.cvars.get(a[0]);
    if (c && c.hadTemp && c.temp !== undefined) { c.value = c.temp; c.hadTemp = false; }
  },
  GetServerTime: (h) => Math.floor(h.serverEpoch()),
  GetTimeCached: (h) => 1000 + h.now,
  "C_DateAndTime.GetServerTimeLocal": (h) => Math.floor(h.serverEpoch()),
  "C_DateAndTime.GetSecondsUntilDailyReset": (h) => 86400 - (Math.floor(h.serverEpoch()) % 86400),
  __calendar: (_h, a) => (typeof a[0] === "number" ? calendar(a[0]) : undefined),
  __calendar_now: (h) => calendar(Math.floor(h.serverEpoch())),
  __calendar_epoch: (_h, a) => Math.floor(Date.UTC(Number(a[0]), Number(a[1]) - 1, Number(a[2]), Number(a[3] ?? 0), Number(a[4] ?? 0)) / 1000),
};
