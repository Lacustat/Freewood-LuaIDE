/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] assemblePlugin .............. Manifest + Datendateien -> LoadedPlugin (geprüft)
 *
 * DE: Umgebungsunabhängig: Die Datendateien werden über die Funktion `read` geholt
 *     (Node: Datei lesen, Browser: fetch). So nutzen beide dieselbe Prüfung.
 * EN: Environment independent: data files are fetched through the `read` function
 *     (Node: read file, browser: fetch). Both share the same validation.
 */

import type { LoadedPlugin, PluginData, PluginManifest } from "./types.js";
import { PluginError, hasErrors, validateData, validateManifest } from "./validate.js";

// ===== [S1] assemblePlugin =====

/**
 * DE: Baut ein geprüftes Plugin. Wirft `PluginError` mit allen Fehlern, wenn etwas nicht stimmt.
 * EN: Builds a validated plugin. Throws `PluginError` with all errors if something is wrong.
 */
export async function assemblePlugin(
  rawManifest: unknown,
  read: (fileName: string) => Promise<unknown>,
): Promise<LoadedPlugin> {
  const manifestIssues = validateManifest(rawManifest);
  if (hasErrors(manifestIssues)) {
    throw new PluginError("PLG_MANIFEST", "Invalid plugin manifest", manifestIssues);
  }
  const manifest = rawManifest as PluginManifest;

  const raw: Record<string, unknown> = { functions: [], events: [], widgets: [] };
  for (const key of ["functions", "events", "widgets", "layers"] as const) {
    const fileName = manifest.files[key];
    if (fileName !== undefined) raw[key] = await read(fileName);
  }

  const issues = [...manifestIssues, ...validateData(raw)];
  if (hasErrors(issues)) {
    throw new PluginError("PLG_DATA", `Invalid plugin data: ${manifest.id}`, issues);
  }
  return { manifest, data: raw as unknown as PluginData };
}
