/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Ausgaben · Exports .......... plugin-api, core, runtime (ohne Node-Teil · without the Node part)
 *
 * DE: Gemeinsamer Einstieg für die Oberfläche. Der Node-Teil (src/node) wird bewusst nicht hier
 *     exportiert, damit der Browser-Build ihn nicht mitzieht.
 * EN: Shared entry for the UI. The Node part (src/node) is deliberately not exported here,
 *     so the browser build does not pull it in.
 */

// ===== [S1] Ausgaben · Exports =====
export * from "./plugin-api/index.js";
export * from "./core/index.js";
export * from "./runtime/index.js";
export * from "./lua/index.js";
export * from "./analysis/api-check.js";
export * from "./editor/index.js";
export * from "./graph/index.js";
export * from "./forms/index.js";
export * from "./sim/index.js";
