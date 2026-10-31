/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] loadPluginDir ............... ein Plugin-Ordner -> LoadedPlugin
 *   [S2] loadPluginsFromRoot ......... alle Unterordner laden, Fehler einsammeln
 *   [S3] loadLocalesFromDir .......... Sprachdateien (de.json, en.json, …) in I18n laden
 *
 * DE: NUR für Node (Tests, Werkzeuge). Der Browser lädt dieselben Dateien per fetch und
 *     nutzt `assemblePlugin` / `I18n.addCatalogJson` direkt.
 * EN: Node ONLY (tests, tools). The browser loads the same files via fetch and
 *     uses `assemblePlugin` / `I18n.addCatalogJson` directly.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { I18n } from "../core/i18n.js";
import { assemblePlugin } from "../plugin-api/assemble.js";
import type { LoadedPlugin } from "../plugin-api/types.js";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

// ===== [S1] loadPluginDir =====

export async function loadPluginDir(dir: string): Promise<LoadedPlugin> {
  const manifest = await readJson(join(dir, "manifest.json"));
  return assemblePlugin(manifest, (fileName) => readJson(join(dir, fileName)));
}

// ===== [S2] loadPluginsFromRoot =====

export async function loadPluginsFromRoot(
  root: string,
): Promise<{ plugins: LoadedPlugin[]; errors: { dir: string; error: unknown }[] }> {
  const plugins: LoadedPlugin[] = [];
  const errors: { dir: string; error: unknown }[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(root, entry.name);
    try {
      plugins.push(await loadPluginDir(dir));
    } catch (error) {
      errors.push({ dir, error });
    }
  }
  return { plugins, errors };
}

// ===== [S3] loadLocalesFromDir =====

export async function loadLocalesFromDir(i18n: I18n, dir: string): Promise<string[]> {
  const loaded: string[] = [];
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".json") && n !== "index.json").sort()) {
    const lang = name.slice(0, -".json".length);
    i18n.addCatalogJson(lang, await readFile(join(dir, name), "utf8"));
    loaded.push(lang);
  }
  return loaded;
}
