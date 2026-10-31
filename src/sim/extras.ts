/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] EXTRA_API ... fasst die API-Tabellen der neueren Sim-Module zusammen · merges the API tables of the newer sim modules
 */

import type { Impl } from "./host.js";
import { MAP_API } from "./map.js";
import { MISC_API } from "./misc.js";
import { GEAR_API } from "./gear.js";
import { ITEMS_API } from "./items.js";

// ===== [S1] EXTRA_API =====

export const EXTRA_API: Record<string, Impl> = { ...MAP_API, ...MISC_API, ...GEAR_API, ...ITEMS_API };
