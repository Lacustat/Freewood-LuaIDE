/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] MISC2_API ... Vanilla-AddOn-Funktionen, Makros, Ruf-Auswahl, Duell/Beschwörung/Wiederbelebung, Inspektion, Zeitmessung
 *
 * DE: Ergänzt die Vanilla-Namen zu bereits vorhandener Logik (`misc.ts`, `character.ts`). Rückgabeformate
 *     sind bis zum Test im Spiel `unverified`.
 * EN: adds the vanilla names to logic that already exists (`misc.ts`, `character.ts`). Return formats are
 *     `unverified` until tested in game.
 */
import { type Impl, type SimHost, num, str } from "./host.js";
import { MISC_API, addon, st } from "./misc.js";

// ===== [S1] MISC2_API =====

interface Pending { duel?: { by: string }; summon?: { by: string; area: string; ends: number }; res?: { by: string; ends: number; sickness: boolean }; prof: number; selFaction: number; inspect?: string }
const pend = (h: SimHost): Pending => h.store("misc2", (): Pending => ({ prof: 0, selFaction: 0 }));
const real = (): number => performance.now();

export const MISC2_API: Record<string, Impl> = {
  GetNumAddOns: (h) => st(h).addons.length,
  GetAddOnInfo: (h, a) => { const x = addon(h, a[0]); return x ? [x.name, x.title, x.notes, true, x.loaded || x.loadOnDemand ? "LOAD_ON_DEMAND" : undefined, "INSECURE", x.loadOnDemand] : [undefined, undefined, undefined, false, undefined, "MISSING", false]; },
  GetAddOnDependencies: (h, a) => addon(h, a[0])?.deps,
  GetAddOnMetadata: (h, a) => { const x = addon(h, a[0]); const k = String(a[1]).toLowerCase(); return !x ? undefined : k === "title" ? x.title : k === "notes" ? x.notes : k === "interface" ? String(x.interface) : k === "version" ? "1.0" : undefined; },
  IsAddOnLoaded: (h, a) => (addon(h, a[0])?.loaded ? 1 : undefined),
  IsAddOnLoadOnDemand: (h, a) => (addon(h, a[0])?.loadOnDemand ? 1 : undefined),
  LoadAddOn: (h, a) => MISC_API["C_AddOns.LoadAddOn"]!(h, a),
  EnableAddOn: () => undefined, DisableAddOn: () => undefined, EnableAllAddOns: () => undefined, DisableAllAddOns: () => undefined, ResetDisabledAddOns: () => undefined,
  CreateMacro: (h, a) => { const r = MISC_API["C_Macro.CreateMacro"]!(h, [a[0], a[1], a[2], a[4] === 1 || a[4] === true]); if (r !== undefined) h.fireIf("UPDATE_MACROS"); return r; },
  EditMacro: (h, a) => { const r = MISC_API["C_Macro.EditMacro"]!(h, a); return r; },
  DeleteMacro: (h, a) => { const l = h.character().macros; const k = (num(a[0]) ?? 0) - 1; if (l && k >= 0 && k < l.length) l.splice(k, 1); },
  GetNumMacroIcons: () => 8,
  GetMacroIconInfo: (_h, a) => { const n = ["INV_Misc_QuestionMark", "Ability_Warrior_Charge", "Spell_Fire_FlameBolt", "Spell_Holy_HolyBolt", "INV_Sword_04", "INV_Potion_54", "Spell_Nature_Lightning", "Ability_Stealth"][(num(a[0]) ?? 0) - 1]; return n ? `Interface\\Icons\\${n}` : undefined; },
  GetMacroIcons: () => [["INV_Misc_QuestionMark", "Ability_Warrior_Charge", "Spell_Fire_FlameBolt"]],
  debugprofilestart: (h) => { pend(h).prof = real(); },
  debugprofilestop: (h) => real() - pend(h).prof,
  debugstack: () => "[C]: ?",
  GetDebugStats: () => [0, 0, 0],
  StartDuel: (h, a) => { const u = h.unit(a[0]); if (u) h.note("info", `Duel challenge sent to ${u.name}.`); },
  StartDuelUnit: (h, a) => MISC2_API.StartDuel!(h, a),
  AcceptDuel: (h) => { const p = pend(h); if (p.duel) { p.duel = undefined; h.fireIf("DUEL_REQUESTED"); } },
  CancelDuel: (h) => { pend(h).duel = undefined; },
  GetSummonConfirmSummoner: (h) => pend(h).summon?.by,
  GetSummonConfirmAreaName: (h) => pend(h).summon?.area,
  GetSummonConfirmTimeLeft: (h) => { const s = pend(h).summon; return s ? Math.max(0, s.ends - h.now) : 0; },
  ConfirmSummon: (h) => { const p = pend(h); if (p.summon) { p.summon = undefined; h.fireIf("CONFIRM_SUMMON"); } },
  ResurrectHasSickness: (h) => pend(h).res?.sickness === true,
  ResurrectHasTimer: (h) => pend(h).res !== undefined,
  AcceptResurrect: (h) => { const p = pend(h); if (p.res) { h.scenario.player.dead = false; h.scenario.player.ghost = false; h.scenario.player.health = Math.max(1, Math.floor(h.scenario.player.healthMax * 0.5)); p.res = undefined; h.fireIf("PLAYER_ALIVE"); h.fireIf("PLAYER_UNGHOST"); } },
  DeclineResurrect: (h) => { pend(h).res = undefined; },
  RepopMe: (h) => { const p = h.scenario.player; if (p.dead === true || p.health <= 0) { p.dead = false; p.ghost = true; p.health = 1; h.fireIf("PLAYER_DEAD"); } },
  RetrieveCorpse: (h) => { const p = h.scenario.player; if (p.ghost) { p.ghost = false; p.health = Math.floor(p.healthMax * 0.5); h.fireIf("PLAYER_ALIVE"); h.fireIf("PLAYER_UNGHOST"); } },
  GetCorpseRecoveryDelay: () => 0,
  GetReleaseTimeRemaining: () => 0,
  HasSoulstone: () => undefined,
  NotifyInspect: (h, a) => { const u = h.unit(a[0]); if (u) { pend(h).inspect = u.name; h.later(0.4, () => h.fireIf("INSPECT_TALENT_READY")); } },
  ClearInspectPlayer: (h) => { pend(h).inspect = undefined; },
  InspectUnit: (h, a) => MISC2_API.NotifyInspect!(h, a),
  GetXPExhaustion: () => undefined,
  GetSelectedFaction: (h) => pend(h).selFaction,
  SetSelectedFaction: (h, a) => { pend(h).selFaction = num(a[0]) ?? 0; },
  SetWatchedFactionIndex: (h, a) => { const c = h.character(); const f = c.factions[(num(a[0]) ?? 0) - 1]; c.watchedFaction = f && !f.header ? f.factionID : undefined; h.fireIf("UPDATE_FACTION"); },
  GetWatchedFactionInfo: (h) => {
    const c = h.character(); const f = c.factions.find((x) => x.factionID === c.watchedFaction && !x.header); if (!f) return undefined;
    const s = f.standing ?? 0; const steps = [-42000, -6000, -3000, 0, 3000, 9000, 21000, 42000]; const k = steps.findIndex((v, i) => s < (steps[i + 1] ?? 1e9));
    return [f.name, k + 1, steps[k], steps[k + 1] ?? 42000, s];
  },
  IsFactionInactive: (h, a) => h.character().factions[(num(a[0]) ?? 0) - 1]?.inactive === true,
  SetFactionInactive: (h, a) => { const f = h.character().factions[(num(a[0]) ?? 0) - 1]; if (f) f.inactive = true; },
  SetFactionActive: (h, a) => { const f = h.character().factions[(num(a[0]) ?? 0) - 1]; if (f) f.inactive = false; },
  FactionToggleAtWar: (h, a) => { const f = h.character().factions[(num(a[0]) ?? 0) - 1]; if (f && !f.header) f.atWar = !f.atWar; },
  CollapseFactionHeader: (h, a) => { const f = h.character().factions[(num(a[0]) ?? 0) - 1]; if (f?.header) f.collapsed = true; },
  ExpandFactionHeader: (h, a) => { const f = h.character().factions[(num(a[0]) ?? 0) - 1]; if (f?.header) f.collapsed = false; },
  CollapseAllFactionHeaders: (h) => { for (const f of h.character().factions) if (f.header) f.collapsed = true; },
  ExpandAllFactionHeaders: (h) => { for (const f of h.character().factions) if (f.header) f.collapsed = false; },
  LoggingCombat: (h, a) => { const p = h.store("combatlog", () => ({ on: false })); if (a[0] !== undefined) p.on = a[0] === true || a[0] === 1; return p.on ? 1 : undefined; },
  LoggingChat: (h, a) => { const p = h.store("chatlog", () => ({ on: false })); if (a[0] !== undefined) p.on = a[0] === true || a[0] === 1; return p.on ? 1 : undefined; },
  // Auf Forever gemessen (7.11.2026, Forever_Failure F-20 bis F-23): Ergebniscodes, WHISPER nur zustellbar an sich selbst (andere Spieler
  // sind in der Simulation nicht da: Systemzeile "kein Spieler mit dem Namen ... online"), CHANNEL wird angenommen, aber verworfen.
  "C_ChatInfo.RegisterAddonMessagePrefix": (h, a) => { const p = h.store("addonprefix", () => new Set<string>()); const ok = typeof a[0] === "string" && a[0].length > 0 && a[0].length <= 16; if (ok) p.add(a[0] as string); return ok; },
  "C_ChatInfo.SendAddonMessage": (h, a) => {
    const prefix = String(a[0]), text = String(a[1] ?? ""), ch = String(a[2] ?? "").toUpperCase(), target = str(a[3]);
    if (prefix.length > 16 || text.length > 255) return text.length > 255 ? 2 : 1;
    const registered = h.store("addonprefix", () => new Set<string>());
    const me = h.scenario.player.name;
    if (ch === "WHISPER") {
      if (!target) return 4;
      if (target.toLowerCase() === me.toLowerCase()) {
        if (registered.has(prefix)) h.later(0, () => h.fireIf("CHAT_MSG_ADDON", prefix, text, "WHISPER", me));
        return 0;
      }
      h.note("info", `Addon whisper to ${target}: other players are not simulated`);
      h.later(0, () => h.fireIf("CHAT_MSG_SYSTEM", `Momentan ist kein Spieler mit dem Namen '${target}' online.`));
      return 0;
    }
    if (ch === "PARTY" || ch === "RAID" || ch === "INSTANCE_CHAT") return h.scenario.party.length > 0 ? 0 : 5;
    if (ch === "GUILD" || ch === "OFFICER") return h.scenario.player.guild ? 0 : 10;
    if (ch === "CHANNEL") { h.note("info", "Addon message to a custom channel: accepted but dropped (measured on Forever)"); return 0; }
    return 4; // SAY, YELL, CLUB, COMMUNITY und alles Unbekannte
  },
  SendAddonMessage: (h, a) => { const ch = str(a[2]) ?? "PARTY"; h.note("info", `Addon message [${String(a[0])}] on ${ch}: ${String(a[1])}`); h.later(0, () => h.fireIf("CHAT_MSG_ADDON", String(a[0]), String(a[1]), ch, h.scenario.player.name)); },
};
void str;
