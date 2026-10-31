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
import { SPELLS_API } from "./spells.js";
import { MISC2_API } from "./misc2.js";
import { PLAYERBUFF_API } from "./playerbuffs.js";
import { CREATURE_API, UNITINFO_API } from "./unitinfo.js";
import { FRIENDS_API, GROUP_API, GUILD_API } from "./social.js";
import { BAR_API, INPUT_API, QUEST_API, SOUND_API, TALENT_API, TARGET_API, TAXI_API, WORLD_API } from "./uiworld.js";

// ===== [S1] EXTRA_API =====

export const EXTRA_API: Record<string, Impl> = { ...MAP_API, ...MISC_API, ...GEAR_API, ...ITEMS_API, ...SPELLS_API, ...PLAYERBUFF_API, ...UNITINFO_API, ...CREATURE_API, ...FRIENDS_API, ...GROUP_API, ...GUILD_API, ...WORLD_API, ...INPUT_API, ...SOUND_API, ...TARGET_API, ...BAR_API, ...QUEST_API, ...TAXI_API, ...TALENT_API, ...MISC2_API };
