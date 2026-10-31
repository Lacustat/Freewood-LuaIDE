/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] EXTRA_API ... fasst die API-Tabellen der neueren Sim-Module zusammen · merges the API tables of the newer sim modules
 *   [S2] openWindow ... öffnet NPC-Fenster (Post, Auktion, Handel, Ausbilder …) · opens NPC windows
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
import { AUCTION_API, BANK_API, GM_API, ITEMTEXT_API, LOOTROLL_API, MAIL_API, MERCHANT2_API, OPENERS_1, TRADE_API } from "./windows1.js";
import { CRAFT_API, OPENERS_2, TRADESKILL_API, TRAINER_API } from "./windows2.js";
import { BATTLEFIELD_API, GUILDADMIN_API, INSTANCE_API, OPENERS_3, PET_API, PETITION_API, PVP_API, STABLE_API } from "./windows3.js";
import { CAMERA_API, CHATWIN_API, OPENERS_M3, QUESTDLG_API, REST_API, STATS_API, VIDEO_API } from "./misc3.js";
import type { SimHost } from "./host.js";
import { BAR_API, INPUT_API, QUEST_API, SOUND_API, TALENT_API, TARGET_API, TAXI_API, WORLD_API } from "./uiworld.js";

// ===== [S1] EXTRA_API =====

export const EXTRA_API: Record<string, Impl> = { ...MAP_API, ...MISC_API, ...GEAR_API, ...ITEMS_API, ...SPELLS_API, ...PLAYERBUFF_API, ...UNITINFO_API, ...CREATURE_API, ...FRIENDS_API, ...GROUP_API, ...GUILD_API, ...WORLD_API, ...INPUT_API, ...SOUND_API, ...TARGET_API, ...BAR_API, ...QUEST_API, ...TAXI_API, ...TALENT_API, ...MISC2_API,
  ...MAIL_API, ...AUCTION_API, ...BANK_API, ...TRADE_API, ...ITEMTEXT_API, ...LOOTROLL_API, ...MERCHANT2_API, ...GM_API,
  ...TRADESKILL_API, ...CRAFT_API, ...TRAINER_API, ...PET_API, ...STABLE_API, ...BATTLEFIELD_API, ...PVP_API, ...PETITION_API, ...GUILDADMIN_API, ...INSTANCE_API,
  ...QUESTDLG_API, ...CAMERA_API, ...VIDEO_API, ...CHATWIN_API, ...STATS_API, ...REST_API };

// ===== [S2] Fenster öffnen · open windows =====

const OPENERS: Record<string, (h: SimHost) => void> = { ...OPENERS_1, ...OPENERS_2, ...OPENERS_3, ...OPENERS_M3 };
/** DE: Namen der öffnenbaren Fenster. EN: names of the windows that can be opened. */
export const WINDOW_NAMES = Object.keys(OPENERS);
/** DE: Öffnet ein Fenster mit Beispieldaten und löst die Ereignisse aus. EN: opens a window with sample data and fires the events. */
export function openWindow(h: SimHost, name: string): boolean {
  const f = OPENERS[name];
  if (!f) { h.note("warn", `openWindow: unknown window "${name}". Known: ${WINDOW_NAMES.join(", ")}.`); return false; }
  f(h);
  return true;
}
