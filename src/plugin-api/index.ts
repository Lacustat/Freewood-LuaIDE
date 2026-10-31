/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Ausgaben · Exports .......... types, validate, assemble
 */

// ===== [S1] Ausgaben · Exports =====
export type * from "./types.js";
export { PluginError, hasErrors, isRecord, validateData, validateManifest, validatePlugin } from "./validate.js";
export { assemblePlugin } from "./assemble.js";
