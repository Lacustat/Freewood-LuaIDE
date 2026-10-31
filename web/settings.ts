/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Einstellungen · settings ... Typ, Vorgaben, Laden und Speichern, Prüfung
 *   [S2] Anwenden · apply ............ setzt CSS-Variablen und Theme
 *   [S3] Dialog ...................... Einstellungsfenster
 *
 * DE: Alles, was der Nutzer einstellen kann, steht hier an einer Stelle. Neue Einstellung:
 *     in SETTING_DEFS ergänzen (Feld, Grenzen, Sprachschlüssel `settings.<key>`), mehr nicht.
 * EN: everything the user can adjust lives here. A new setting only needs an entry in
 *     SETTING_DEFS (field, bounds, language key `settings.<key>`).
 */

import { h, select } from "./dom.js";

// ===== [S1] Einstellungen · settings =====

export interface Settings {
  theme: "dark" | "light";
  codeFontSize: number;
  tabWidth: number;
  autosave: boolean;
  /** DE: Syntax zusätzlich mit der echten Lua-5.0-VM prüfen. EN: also check syntax with the real Lua 5.0 VM. */
  realLua: boolean;
  /** 0 = einpassen · fit, sonst Prozent · otherwise percent */
  formsZoom: number;
  stageWidth: number;
  stageHeight: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  codeFontSize: 13,
  tabWidth: 2,
  autosave: true,
  realLua: true,
  formsZoom: 0,
  stageWidth: 1024,
  stageHeight: 768,
};

type Def =
  | { key: keyof Settings; kind: "number"; min: number; max: number; step: number }
  | { key: keyof Settings; kind: "bool" }
  | { key: keyof Settings; kind: "choice"; options: string[] };

export const SETTING_DEFS: Def[] = [
  { key: "theme", kind: "choice", options: ["dark", "light"] },
  { key: "codeFontSize", kind: "number", min: 9, max: 28, step: 1 },
  { key: "tabWidth", kind: "number", min: 1, max: 8, step: 1 },
  { key: "autosave", kind: "bool" },
  { key: "realLua", kind: "bool" },
  { key: "formsZoom", kind: "number", min: 0, max: 400, step: 5 },
  { key: "stageWidth", kind: "number", min: 320, max: 3840, step: 1 },
  { key: "stageHeight", kind: "number", min: 240, max: 2160, step: 1 },
];

const STORE = "freewood.settings.v1";

/** DE: Prüft und ergänzt unbekannte oder ungültige Werte mit Vorgaben. EN: validates, falling back to defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const d of SETTING_DEFS) {
    const v = src[d.key];
    if (d.kind === "number" && typeof v === "number" && Number.isFinite(v)) {
      (out[d.key] as number) = Math.min(d.max, Math.max(d.min, Math.round(v)));
    } else if (d.kind === "bool" && typeof v === "boolean") {
      (out[d.key] as boolean) = v;
    } else if (d.kind === "choice" && typeof v === "string" && d.options.includes(v)) {
      (out[d.key] as string) = v;
    }
  }
  return out;
}

export function loadSettings(): Settings {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(STORE) ?? "null"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* ohne Speicher weiterarbeiten · keep working without storage */
  }
}

// ===== [S2] Anwenden · apply =====

export function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.dataset["theme"] = s.theme;
  root.style.setProperty("--code-size", `${s.codeFontSize}px`);
  root.style.setProperty("--code-line", `${Math.round(s.codeFontSize * 1.55)}px`);
  root.style.setProperty("--tab-size", String(s.tabWidth));
}

// ===== [S3] Dialog =====

export function openSettingsDialog(
  t: (key: string) => string,
  current: Settings,
  onChange: (next: Settings) => void,
): void {
  const state: Settings = { ...current };
  const overlay = h("div", { class: "overlay", role: "dialog", "aria-modal": "true" });
  const close = (): void => overlay.remove();
  const body = h("div", { class: "dialog" }, h("h3", { text: t("settings.title") }));
  for (const d of SETTING_DEFS) {
    const label = t(`settings.${d.key}`);
    let input: HTMLElement;
    if (d.kind === "number") {
      const el = h("input", { type: "number", min: String(d.min), max: String(d.max), step: String(d.step), value: String(state[d.key]) }) as HTMLInputElement;
      el.addEventListener("change", () => {
        (state[d.key] as number) = Number(el.value);
        const clean = sanitizeSettings(state);
        Object.assign(state, clean);
        el.value = String(state[d.key]);
        onChange({ ...state });
      });
      input = el;
    } else if (d.kind === "bool") {
      const el = h("input", { type: "checkbox" }) as HTMLInputElement;
      el.checked = Boolean(state[d.key]);
      el.addEventListener("change", () => { (state[d.key] as boolean) = el.checked; onChange({ ...state }); });
      input = el;
    } else {
      input = select(d.options.map((o) => ({ value: o, label: t(`settings.${d.key}.${o}`) })), String(state[d.key]), (v) => { (state[d.key] as string) = v; onChange({ ...state }); });
    }
    const hint = d.key === "formsZoom" ? h("span", { class: "muted small", text: t("settings.formsZoom.hint") }) : null;
    body.append(h("label", { class: "field" }, h("span", { text: label }), input, ...(hint ? [hint] : [])));
  }
  body.append(
    h("div", { class: "row" },
      h("button", { class: "btn", onclick: () => { Object.assign(state, DEFAULT_SETTINGS); onChange({ ...state }); close(); openSettingsDialog(t, { ...state }, onChange); } }, t("settings.reset")),
      h("span", { class: "spacer" }),
      h("button", { class: "btn primary", onclick: close }, t("settings.close"))),
  );
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Escape") close(); });
  overlay.append(body);
  document.body.append(overlay);
  (overlay.querySelector("input,select") as HTMLElement | null)?.focus();
}
