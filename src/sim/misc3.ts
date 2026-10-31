/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Quest-Dialog · quest dialog  QUESTDLG_API
 *   [S2] Kamera, Bewegung · camera .... CAMERA_API
 *   [S3] Grafik · video ............... VIDEO_API
 *   [S4] Chatfenster, Kanäle · chat ... CHATWIN_API
 *   [S5] Werte, Rest · stats, rest .... STATS_API
 *   [S6] OPENERS_M3 ................... öffnet den Quest-Dialog · opens the quest dialog
 *   [S7] REST_API ..................... Karte, IDs, Totems, Konsole, TTS … · map, IDs, totems, console, TTS …
 *
 * DE: Rest der Vanilla-Funktionen ohne eigene Logik: Quest-Dialog beim NPC (erfundene Quests),
 *     Kamera/Bewegung (nur Zustandsmerker), Grafik-Einstellungen (Werte werden gemerkt),
 *     Chatfenster-Einstellungen, Kampfwerte, kleine Hilfen. Der Server entscheidet vieles
 *     (Kanal-Verwaltung, Abmelden, Bildschirmfotos) – die Simulation protokolliert nur.
 * EN: rest of the vanilla functions without own logic: quest dialog at the NPC (invented quests),
 *     camera/movement (state flags only), video settings (values are remembered), chat window
 *     settings, combat stats, small helpers. The server decides much (channel admin, logout,
 *     screenshots) – the simulation only logs.
 */

import { type Impl, type SimHost, num, str } from "./host.js";
import { addItem } from "./inventory.js";
import { AUCTION_API, TRADE_API, im, win } from "./windows1.js";
import { CRAFT_API, TRADESKILL_API } from "./windows2.js";
import { MISC_API } from "./misc.js";

// ===== [S1] Quest-Dialog · quest dialog =====

interface QDef { id: number; title: string; level: number; detail: string; objective: string; progress: string; complete: string; choices: number[]; rewards: number[]; money: number; need: { id: number; count: number }[]; xp: number }
const QUESTS: QDef[] = [
  { id: 5001, title: "Boar Trouble", level: 1, detail: "Wild boars are trampling the farm. Thin them out.", objective: "Kill 5 sample boars.", progress: "How are the boars?", complete: "The farm is safe again.", choices: [117], rewards: [], money: 40, need: [], xp: 80 },
  { id: 7, title: "Kobold Camp Cleanup", level: 2, detail: "The kobolds are digging in the mine again. Clear them out.", objective: "Kill 10 sample kobolds.", progress: "Have you cleared the camp yet?", complete: "Well done! Here is your reward.", choices: [117, 159], rewards: [2589], money: 90, need: [], xp: 250 },
  { id: 783, title: "A Threat Within", level: 1, detail: "Speak with the marshal about the threat.", objective: "Report to the marshal.", progress: "Do you have the report?", complete: "Thank you for the report.", choices: [], rewards: [4496], money: 50, need: [{ id: 2589, count: 2 }], xp: 100 },
];
interface QD { stage?: "greeting" | "detail" | "progress" | "complete"; quest?: QDef; confirm?: boolean }
const qd = (h: SimHost): QD => h.store("questdlg", (): QD => ({}));
const have = (h: SimHost, id: number): number => { let n = 0; for (const b of Object.values(h.inventory().bags)) for (const s of Object.values(b.slots)) if (s.id === id) n += s.count; return n; };
const done = (h: SimHost, q: QDef): boolean => q.need.every((x) => have(h, x.id) >= x.count);
const avail = (h: SimHost): QDef[] => QUESTS.filter((q) => !h.character().completed.includes(q.id) && !h.character().quests.some((e) => e.questID === q.id));
const active = (h: SimHost): QDef[] => QUESTS.filter((q) => h.character().quests.some((e) => e.questID === q.id));
const rewardAt = (q: QDef | undefined, type: unknown, i: unknown): number | undefined => (type === "choice" ? q?.choices : q?.rewards)?.[(num(i) ?? 0) - 1];
const finish = (h: SimHost): void => { const d = qd(h); if (d.stage) { d.stage = undefined; d.quest = undefined; h.fireIf("QUEST_FINISHED"); } };

export const QUESTDLG_API: Record<string, Impl> = {
  GetGreetingText: (h) => (qd(h).stage === "greeting" ? "Greetings. Do you have time for a task?" : undefined),
  GetNumAvailableQuests: (h) => (qd(h).stage === "greeting" ? avail(h).length : 0),
  GetNumActiveQuests: (h) => (qd(h).stage === "greeting" ? active(h).length : 0),
  GetAvailableTitle: (h, a) => avail(h)[(num(a[0]) ?? 0) - 1]?.title,
  GetAvailableLevel: (h, a) => avail(h)[(num(a[0]) ?? 0) - 1]?.level,
  GetActiveTitle: (h, a) => active(h)[(num(a[0]) ?? 0) - 1]?.title,
  GetActiveLevel: (h, a) => active(h)[(num(a[0]) ?? 0) - 1]?.level,
  SelectAvailableQuest: (h, a) => { const q = avail(h)[(num(a[0]) ?? 0) - 1]; if (q) { Object.assign(qd(h), { stage: "detail", quest: q }); h.fireIf("QUEST_DETAIL"); } },
  SelectActiveQuest: (h, a) => { const q = active(h)[(num(a[0]) ?? 0) - 1]; if (q) { Object.assign(qd(h), { stage: "progress", quest: q }); h.fireIf("QUEST_PROGRESS"); } },
  GetTitleText: (h) => qd(h).quest?.title,
  GetQuestText: (h) => (qd(h).stage === "detail" ? qd(h).quest?.detail : undefined),
  GetObjectiveText: (h) => qd(h).quest?.objective,
  GetProgressText: (h) => (qd(h).stage === "progress" ? qd(h).quest?.progress : undefined),
  GetRewardText: (h) => (qd(h).stage === "complete" ? qd(h).quest?.complete : undefined),
  GetQuestBackgroundMaterial: () => "Parchment",
  GetRewardMoney: (h) => qd(h).quest?.money ?? 0,
  GetQuestMoneyToGet: () => 0,
  GetRewardSpell: () => [undefined, undefined, undefined], // probe: 3 values
  GetNumQuestChoices: (h) => qd(h).quest?.choices.length ?? 0,
  GetNumQuestRewards: (h) => qd(h).quest?.rewards.length ?? 0,
  GetNumQuestItems: (h) => qd(h).quest?.need.length ?? 0,
  GetQuestItemInfo: (h, a) => {
    // DE: Probe: ungültiger Index = ["", Fragezeichen, 1 (required: 0), 0, 1]. EN: probe: invalid index = default tuple.
    const dflt = ["", "Interface\\Icons\\INV_Misc_QuestionMark", a[0] === "required" ? 0 : 1, 0, 1];
    const q = qd(h).quest; if (!q) return dflt;
    const i = (num(a[1]) ?? 0) - 1;
    if (a[0] === "required") { const x = q.need[i]; if (!x) return dflt; const m = im(h, x.id); return [m.name, m.icon, x.count, -1, true]; }
    const id = rewardAt(q, a[0], a[1]); if (id === undefined) return dflt; const m = im(h, id); return [m.name, m.icon, 1, m.quality, a[0] === "choice" && i === q.choices.length - 1 ? true : undefined];
  },
  IsQuestCompletable: (h) => { const q = qd(h).quest; return !!q && done(h, q); },
  IsUnitOnQuest: (h, a) => { void a; return active(h).length > 0 && h.unit("target") !== undefined; },
  AcceptQuest: (h) => {
    const d = qd(h); const q = d.quest; if (d.stage !== "detail" || !q) return;
    const c = h.character();
    if (!c.quests.some((e) => e.questID === q.id)) c.quests.push({ questID: q.id, title: q.title, level: q.level, complete: q.need.length === 0, objectives: q.need.length || 1 });
    // DE: Probe-Reihenfolge: QUEST_FINISHED, QUEST_LOG_UPDATE, Systemzeile. EN: probe order.
    finish(h); h.fireIf("QUEST_LOG_UPDATE"); h.fire("CHAT_MSG_SYSTEM", `Quest accepted: ${q.title}`, "", "", ""); h.fireIf("UNIT_QUEST_LOG_CHANGED", "player");
  },
  ConfirmAcceptQuest: (h) => { qd(h).confirm = false; },
  DeclineQuest: (h) => finish(h),
  CloseQuest: (h) => finish(h),
  CompleteQuest: (h) => {
    const d = qd(h); const q = d.quest; if (!q || d.stage !== "progress") return;
    if (!done(h, q)) { h.fireIf("UI_ERROR_MESSAGE", "You do not have the required items"); return; }
    d.stage = "complete"; h.fireIf("QUEST_FINISHED"); h.fireIf("QUEST_COMPLETE"); // probe: QUEST_FINISHED comes first
  },
  QuestChooseRewardError: (h) => { h.fireIf("UI_ERROR_MESSAGE", "You must choose a reward"); },
  GetQuestReward: (h, a) => {
    const d = qd(h); const q = d.quest; if (!q || d.stage !== "complete") return;
    if (q.choices.length > 0 && rewardAt(q, "choice", a[0]) === undefined) { QUESTDLG_API.QuestChooseRewardError!(h, []); return; }
    const inv = h.inventory();
    for (const id of [...q.rewards, ...(q.choices.length ? [rewardAt(q, "choice", a[0])!] : [])]) addItem(inv, id, 1);
    inv.money = (inv.money ?? 0) + q.money;
    const c = h.character(); c.quests = c.quests.filter((e) => e.questID !== q.id); c.completed.push(q.id);
    // DE: Probe: QUEST_LOG_UPDATE, Systemzeilen, QUEST_FINISHED, PLAYER_MONEY. EN: probe order.
    h.fireIf("QUEST_LOG_UPDATE"); h.fire("CHAT_MSG_SYSTEM", `Experience gained: ${q.xp}.`, "", "", ""); if (q.money > 0) h.fire("CHAT_MSG_SYSTEM", `Received ${q.money} Copper.`, "", "", "");
    finish(h); h.fireIf("PLAYER_MONEY"); h.fireIf("BAG_UPDATE", 0);
  },
  QuestLogPushQuest: (h) => { if (h.unit("party1")) h.note("info", "QuestLogPushQuest: shared with the group (not simulated)."); },
  ToggleQuestLog: (h) => { h.note("info", "ToggleQuestLog: the quest log frame is not part of the simulation."); },
  CollapseQuestHeader: (h, a) => { const e = h.character().quests[(num(a[0]) ?? 0) - 1]; if (e?.header !== undefined) { e.collapsed = true; h.fireIf("QUEST_LOG_UPDATE"); } },
  ExpandQuestHeader: (h, a) => { const e = h.character().quests[(num(a[0]) ?? 0) - 1]; if (e?.header !== undefined) { e.collapsed = false; h.fireIf("QUEST_LOG_UPDATE"); } },
  GetQuestLogRewardInfo: () => undefined, GetQuestLogChoiceInfo: () => undefined, GetQuestLogRewardSpell: () => undefined, GetQuestLogItemLink: () => undefined,
};

// ===== [S2] Kamera, Bewegung · camera =====

interface Cam { mouselook: boolean; zoom: number; view: number; moving: Record<string, boolean>; autorun: boolean; walk: boolean }
const cam = (h: SimHost): Cam => h.store("camera", (): Cam => ({ mouselook: false, zoom: 15, view: 5, moving: {}, autorun: false, walk: false }));
const flag = (key: string, on: boolean): Impl => (h) => { cam(h).moving[key] = on; };
const names = (list: string[], f: (k: string, on: boolean) => Impl): Record<string, Impl> => { const o: Record<string, Impl> = {}; for (const n of list) { o[`${n}Start`] = f(n, true); o[`${n}Stop`] = f(n, false); } return o; };

export const CAMERA_API: Record<string, Impl> = {
  ...names(["MoveForward", "MoveBackward", "StrafeLeft", "StrafeRight", "TurnLeft", "TurnRight", "PitchUp", "PitchDown", "MoveViewIn", "MoveViewOut", "MoveViewLeft", "MoveViewRight", "MoveViewUp", "MoveViewDown", "CameraOrSelectOrMove", "TurnOrAction"], flag),
  Jump: (h) => { h.fireIf("PLAYER_STARTED_MOVING"); },
  ToggleAutoRun: (h) => { cam(h).autorun = !cam(h).autorun; },
  ToggleRun: (h) => { cam(h).walk = !cam(h).walk; },
  ToggleMouseMove: () => undefined,
  MouselookStart: (h) => { cam(h).mouselook = true; },
  MouselookStop: (h) => { cam(h).mouselook = false; },
  IsMouselooking: (h) => cam(h).mouselook,
  CameraZoomIn: (h, a) => { cam(h).zoom = Math.max(0, cam(h).zoom - (num(a[0]) ?? 1)); },
  CameraZoomOut: (h, a) => { cam(h).zoom = Math.min(30, cam(h).zoom + (num(a[0]) ?? 1)); },
  FlipCameraYaw: () => undefined,
  SetView: (h, a) => { cam(h).view = num(a[0]) ?? 5; }, SaveView: () => undefined,
  ResetView: (h) => { cam(h).view = 5; }, NextView: (h) => { cam(h).view = cam(h).view % 5 + 1; }, PrevView: (h) => { cam(h).view = (cam(h).view + 3) % 5 + 1; },
};

// ===== [S3] Grafik · video =====

// DE: Werte aus der Probe (OctoWoW). EN: values from the probe (OctoWoW).
const VIDEO_DEFAULTS: Record<string, number> = { Gamma: 0, Farclip: 2200, BaseMip: 1, TerrainMip: 1, TexLodBias: 0, WaterDetail: 0, WorldDetail: 2, DoodadAnim: 1, CurrentMultisampleFormat: 7, CurrentResolution: 6 };
const video = (h: SimHost): Record<string, number> => h.store("video", () => ({ ...VIDEO_DEFAULTS }));
const videoApi = (): Record<string, Impl> => {
  const o: Record<string, Impl> = {};
  for (const k of ["Gamma", "Farclip", "BaseMip", "TerrainMip", "TexLodBias", "WaterDetail", "WorldDetail", "DoodadAnim"]) { o[`Get${k}`] = (h) => video(h)[k]; o[`Set${k}`] = (h, a) => { video(h)[k] = num(a[0]) ?? VIDEO_DEFAULTS[k]!; }; }
  return o;
};
export const VIDEO_API: Record<string, Impl> = {
  ...videoApi(),
  GetCurrentMultisampleFormat: (h) => video(h).CurrentMultisampleFormat,
  SetMultisampleFormat: (h, a) => { video(h).CurrentMultisampleFormat = num(a[0]) ?? 1; },
  GetMultisampleFormats: () => [24, 16, 1, 24, 16, 2, 24, 16, 4, 24, 16, 8, 24, 24, 1, 24, 24, 2, 24, 24, 4, 24, 24, 8],
  GetCurrentResolution: (h) => video(h).CurrentResolution,
  GetScreenResolutions: () => ["1680x720", "1920x820", "2310x990", "2560x1080", "3024x1296", "3440x1440"],
  SetScreenResolution: (h, a) => { video(h).CurrentResolution = num(a[0]) ?? 1; },
  GetRefreshRates: () => [60, 100, 120, 144, 165],
  GetVideoCaps: () => [1, 1, 1, 1, 1, 16, 1],
  SetLayoutMode: () => undefined, RestartGx: () => undefined, SetupFullscreenScale: () => undefined,
  ShowNameplates: () => undefined, HideNameplates: () => undefined, ShowFriendNameplates: () => undefined, HideFriendNameplates: () => undefined,
  ToggleCollision: () => undefined, ToggleCollisionDisplay: () => undefined, TogglePerformanceValues: () => undefined, TogglePlayerBounds: () => undefined,
  TogglePortals: () => undefined, ToggleTris: () => undefined, ResetPerformanceValues: () => undefined,
  SetEuropeanNumbers: () => undefined,
};

// ===== [S4] Chatfenster, Kanäle · chat =====

interface ChatWin { name: string; size: number; r: number; g: number; b: number; a: number; shown: boolean; locked: boolean; docked: boolean; messages: string[]; channels: string[] }
const chat = (h: SimHost): ChatWin[] => h.store("chatwin", (): ChatWin[] => Array.from({ length: 7 }, (_, i) => ({ name: ["General", "Combat Log", "", "", "", "", ""][i]!, size: 14, r: 0, g: 0, b: 0, a: 0.25, shown: i < 2, locked: false, docked: i < 2, messages: i === 0 ? ["SAY", "YELL", "GUILD", "PARTY", "WHISPER", "SYSTEM"] : [], channels: i === 0 ? ["General", "Trade"] : [] })));
const cw = (h: SimHost, i: unknown): ChatWin | undefined => chat(h)[(num(i) ?? 0) - 1];
const CHAT_TYPES = ["SAY", "PARTY", "RAID", "GUILD", "OFFICER", "YELL", "WHISPER", "EMOTE", "TEXT_EMOTE"]; // probe: SAY = 1, PARTY = 2
const cnote = (what: string): Impl => (h, a) => { h.note("info", `${what}(${a.filter((x) => x !== undefined).map(String).join(", ")}): sent to the server (not simulated).`); };

export const CHATWIN_API: Record<string, Impl> = {
  GetChatWindowInfo: (h, a) => { const w = cw(h, a[0]); return w ? [w.name, w.size, w.r, w.g, w.b, w.a, w.shown, w.locked, w.docked] : undefined; },
  SetChatWindowName: (h, a) => { const w = cw(h, a[0]); if (w) w.name = str(a[1]) ?? ""; },
  SetChatWindowSize: (h, a) => { const w = cw(h, a[0]); if (w) w.size = num(a[1]) ?? 14; },
  SetChatWindowColor: (h, a) => { const w = cw(h, a[0]); if (w) { w.r = num(a[1]) ?? 0; w.g = num(a[2]) ?? 0; w.b = num(a[3]) ?? 0; } },
  SetChatWindowAlpha: (h, a) => { const w = cw(h, a[0]); if (w) w.a = num(a[1]) ?? 0.25; },
  SetChatWindowShown: (h, a) => { const w = cw(h, a[0]); if (w) w.shown = a[1] === 1 || a[1] === true; },
  SetChatWindowLocked: (h, a) => { const w = cw(h, a[0]); if (w) w.locked = a[1] === 1 || a[1] === true; },
  SetChatWindowDocked: (h, a) => { const w = cw(h, a[0]); if (w) w.docked = a[1] === 1 || a[1] === true; },
  GetChatWindowMessages: (h, a) => cw(h, a[0])?.messages ?? [],
  AddChatWindowMessages: (h, a) => { const w = cw(h, a[0]); const t = str(a[1]); if (w && t && !w.messages.includes(t)) w.messages.push(t); },
  RemoveChatWindowMessages: (h, a) => { const w = cw(h, a[0]); if (w) w.messages = w.messages.filter((x) => x !== a[1]); },
  GetChatWindowChannels: (h, a) => (cw(h, a[0])?.channels ?? []).flatMap((n, i) => [n, i + 1]), // probe: name/id pairs
  AddChatWindowChannel: (h, a) => { const w = cw(h, a[0]); const t = str(a[1]); if (w && t && !w.channels.includes(t)) w.channels.push(t); },
  RemoveChatWindowChannel: (h, a) => { const w = cw(h, a[0]); if (w) w.channels = w.channels.filter((x) => x !== a[1]); },
  GetChatTypeIndex: (_h, a) => Math.max(0, CHAT_TYPES.indexOf(String(a[0]).toUpperCase())) + 1,
  ChangeChatColor: (h, a) => { h.fireIf("UPDATE_CHAT_COLOR", String(a[0]), num(a[1]) ?? 0, num(a[2]) ?? 0, num(a[3]) ?? 0); },
  ListChannels: (h) => { h.fire("CHAT_MSG_SYSTEM", "Channels: General, Trade", "", "", ""); },
  ListChannelByName: (h, a) => { h.fire("CHAT_MSG_SYSTEM", `Channel ${String(a[0])}: (members not simulated)`, "", "", ""); },
  DisplayChannelOwner: (h, a) => { h.fire("CHAT_MSG_SYSTEM", `Owner of ${String(a[0])}: Sampleowner`, "", "", ""); },
  ChannelBan: cnote("ChannelBan"), ChannelUnban: cnote("ChannelUnban"), ChannelInvite: cnote("ChannelInvite"), ChannelKick: cnote("ChannelKick"),
  ChannelModerate: cnote("ChannelModerate"), ChannelModerator: cnote("ChannelModerator"), ChannelUnmoderator: cnote("ChannelUnmoderator"),
  ChannelMute: cnote("ChannelMute"), ChannelUnmute: cnote("ChannelUnmute"), ChannelToggleAnnouncements: cnote("ChannelToggleAnnouncements"),
  SetChannelOwner: cnote("SetChannelOwner"), SetChannelPassword: cnote("SetChannelPassword"),
};

// ===== [S5] Werte, Rest · stats, rest =====

const cls = (h: SimHost): string => h.scenario.player.classToken;
export const STATS_API: Record<string, Impl> = {
  GetBlockChance: (h) => (["WARRIOR", "PALADIN", "SHAMAN"].includes(cls(h)) ? 4.88 : 0),
  GetParryChance: (h) => (["WARRIOR", "PALADIN", "ROGUE", "HUNTER"].includes(cls(h)) ? 4.88 : 0),
  GetDodgeChance: () => 3.8638,
  GetCombatRating: () => undefined,
  GetCombatRatingBonus: () => undefined,
  GetDamageBonusStat: () => 1,
  GetResSicknessDuration: () => undefined,
  GetTimeToWellRested: () => undefined,
  GetAdjustedSkillPoints: () => 0,
  GetInventoryAlertStatus: () => 0,
  UpdateInventoryAlertStatus: (h) => { h.fireIf("UPDATE_INVENTORY_ALERTS"); },
  NotWhileDeadError: (h) => { h.fireIf("UI_ERROR_MESSAGE", "You are dead"); },
  UnitIsCorpse: (h, a) => h.unit(a[0])?.dead === true,
  CheckBinderDist: () => false, ConfirmBinder: () => undefined,
  AbandonSkill: () => undefined, AcceptSkillUps: () => undefined, AcceptXPLoss: (h) => { h.fireIf("PLAYER_ALIVE"); }, AddSkillUp: () => undefined, BuySkillTier: () => undefined, CancelSkillUps: () => undefined, RemoveSkillUp: () => undefined,
  CancelMeetingStoneRequest: () => undefined, UseSoulstone: (h) => { h.note("info", "UseSoulstone: resurrection is not simulated."); },
  ClearTutorials: () => undefined, FlagTutorial: () => undefined, ResetTutorials: () => undefined, TutorialsEnabled: () => true,
  TogglePVP: (h) => { const p = h.scenario.player; p.pvp = !p.pvp; h.fireIf("PLAYER_FLAGS_CHANGED", "player"); },
  ForceLogout: (h) => { h.fireIf("PLAYER_LOGOUT"); h.note("info", "ForceLogout: the simulation keeps running."); },
  DressUpItem: (h, a) => { h.note("info", `DressUpItem(${String(a[0])}): the dressing room is not simulated.`); },
  DressUpItemLink: (h, a) => { h.note("info", `DressUpItemLink(${String(a[0])}): the dressing room is not simulated.`); },
  SetDressUpBackground: () => undefined,
  ReplaceEnchant: () => undefined, BindEnchant: () => undefined, ConfirmBindOnUse: () => undefined, EquipPendingItem: () => undefined, CancelPendingEquip: () => undefined,
  SetItemRef: (h, a) => { h.note("info", `SetItemRef(${String(a[0])}): link handling is not simulated.`); },
  DropItemOnUnit: (h) => { h.note("info", "DropItemOnUnit: giving items to units is not simulated."); },
  PickupMacro: (h, a) => { h.note("info", `PickupMacro(${String(a[0])}): the cursor is only simulated for items.`); },
  Screenshot: (h) => { h.fireIf("SCREENSHOT_SUCCEEDED"); }, TakeScreenshot: (h) => { h.fireIf("SCREENSHOT_SUCCEEDED"); },
  SetConsoleKey: () => undefined,
  ToggleCombatLog: () => undefined,
  UIParentLoadAddOn: (h, a) => MISC_API["C_AddOns.LoadAddOn"]!(h, a),
  SetPortraitTexture: () => undefined, SetPortraitToTexture: () => undefined,
  ConsoleExec: (h, a) => { const m = /^\s*set\s+(\S+)\s+"?([^"]*)"?\s*$/i.exec(String(a[0] ?? "")); const c = m ? h.cvars.get(m[1]) : undefined; if (c && !c.readOnly) c.value = m![2]!; else h.note("info", `ConsoleExec(${String(a[0])}): unknown command (only "set <cvar> <value>" is simulated).`); },
};

// ===== [S6] OPENERS_M3 =====

export const OPENERS_M3: Record<string, (h: SimHost) => void> = {
  questgiver: (h) => { qd(h).stage = "greeting"; h.fireIf("QUEST_GREETING"); },
  questdetail: (h) => { const q = avail(h)[0]; if (q) { Object.assign(qd(h), { stage: "detail", quest: q }); h.fireIf("QUEST_DETAIL"); } else h.note("warn", "openWindow(questdetail): no quest is available."); },
  questturnin: (h) => { const q = active(h)[0]; if (q) { Object.assign(qd(h), { stage: "progress", quest: q }); h.fireIf("QUEST_PROGRESS"); } else h.note("warn", "openWindow(questturnin): no active sample quest."); },
};

// ===== [S7] Rest: Karte, IDs, Totems, Konsole, TTS … · remainder: map, IDs, totems, console, TTS … =====


const idOf = (link: unknown): number | undefined => { const m = /item:(\d+)/.exec(typeof link === "string" ? link : ""); return m ? Number(m[1]) : undefined; };
const viaLink = (src: Record<string, Impl>, fn: string): Impl => (h, a) => idOf(src[fn]!(h, a));
interface Tts { rate: number; volume: number; voice: number }
const tts = (h: SimHost): Tts => h.store("tts", (): Tts => ({ rate: 0, volume: 100, voice: 1 }));
const faction = (h: SimHost, i: unknown) => h.character().factions[(num(i) ?? 0) - 1];

export const REST_API: Record<string, Impl> = {
  // ----- Karte · map -----
  GetNumMapLandmarks: () => 0, GetMapLandmarkInfo: () => undefined, GetNumMapOverlays: () => 0, GetMapOverlayInfo: () => [undefined, 0, 0, 0, 0, 0, 0], // probe: default tuple
  GetCorpseMapPosition: () => [0, 0],
  GetWorldLocMapPosition: (h, a) => { void h; void a; return [0, 0]; },
  ProcessMapClick: () => undefined, UpdateMapHighlight: () => undefined,
  PickupTradeMoney: (h, a) => { const g = h.store("gear", () => ({} as { cursor?: unknown })); const n = Math.min(num(a[0]) ?? 0, h.inventory().money ?? 0); if (n > 0 && !g.cursor) { g.cursor = { kind: "money", amount: n }; } },
  CloseGuildRoster: () => undefined,
  OpenTrainer: (h) => { h.note("info", "OpenTrainer: use WowSim.openWindow(\"trainer\")."); },
  // ----- Gegenstands-IDs · item IDs -----
  GetInboxItemID: (h, a) => { const m = win(h).mail?.inbox[(num(a[0]) ?? 0) - 1]; return m?.item?.id; },
  GetInboxItemLink: (h, a) => { const id = REST_API.GetInboxItemID!(h, a) as number | undefined; return id === undefined ? undefined : im(h, id).link; },
  GetSendMailItemLink: (h) => { const it = win(h).mail?.send.item; return it ? im(h, it.id).link : undefined; },
  GetAuctionItemID: viaLink(AUCTION_API, "GetAuctionItemLink"),
  GetAuctionSellItemID: (h) => win(h).auction?.sell?.id,
  GetCraftReagentItemID: viaLink(CRAFT_API, "GetCraftReagentItemLink"),
  GetCraftSpellID: () => undefined,
  GetTradePlayerItemID: viaLink(TRADE_API, "GetTradePlayerItemLink"),
  GetTradeTargetItemID: viaLink(TRADE_API, "GetTradeTargetItemLink"),
  GetTradeSkillItemID: viaLink(TRADESKILL_API, "GetTradeSkillItemLink"),
  GetTradeSkillReagentItemID: viaLink(TRADESKILL_API, "GetTradeSkillReagentItemLink"),
  GetLootRollItemID: (h, a) => win(h).rolls.find((x) => x.id === a[0])?.item,
  GetLootSlotItemID: (h, a) => h.interaction().loot?.items[(num(a[0]) ?? 0) - 1]?.id,
  GetMerchantItemID: (h, a) => h.interaction().merchant?.items[(num(a[0]) ?? 0) - 1]?.id,
  GetQuestItemID: () => undefined, GetQuestLogItemID: () => undefined,
  GetTradeSkillDescription: () => undefined, GetTradeSkillRecipeLink: () => undefined, IsTradeSkillLinked: () => false, IsCraftLinked: () => false,
  GetTradeSkillListLink: () => undefined, GetCraftListLink: () => undefined, GetTrainerServiceItemLink: () => undefined, GetTalentSpellID: () => undefined,
  "C_TradeSkillUI.GetTradeSkillListLink": () => undefined, "C_TradeSkillUI.GetCraftListLink": () => undefined, "C_TradeSkillUI.GetTradeSkillListRecipes": () => [[]],
  "C_AuctionHouse.PostItem": (h, a) => AUCTION_API.StartAuction!(h, [a[1], a[2], a[0]]),
  "C_AuctionHouse.CanCancelAuction": (h) => win(h).auction !== undefined,
  CanCancelAuction: (h) => win(h).auction !== undefined,
  // ----- Totems, PvP · totems, PvP -----
  GetTotemInfo: () => [false, "", 0, 0, ""], GetTotemTimeLeft: () => 0, GetTotemDuration: () => 0, TargetTotem: () => undefined,
  GetPVPDesired: (h) => h.scenario.player.pvp === true,
  SetPVP: (h, a) => { h.scenario.player.pvp = a[0] === 1 || a[0] === true; h.fireIf("PLAYER_FLAGS_CHANGED", "player"); },
  "C_PvP.SetPVP": (h, a) => REST_API.SetPVP!(h, a),
  IsPVPTimerRunning: () => false, GetPVPTimer: () => 0, IsActiveBattlefieldArena: () => false,
  // ----- Konsole, Chat, Leistung · console, chat, profiling -----
  ConsoleAddMessage: (h, a) => { h.note("info", String(a[0])); }, ConsoleEcho: (h, a) => { h.note("info", String(a[0])); },
  ConsoleGetAllCommands: () => [[]], ConsoleGetColorFromType: () => [1, 1, 1], ConsoleGetFontHeight: () => 12, ConsoleIsActive: () => false, ConsolePrintAllMatchingCommands: () => undefined,
  GetCurrentChatEvent: () => undefined, GetCurrentChatGUID: () => undefined, IsChatAFK: () => false, IsChatDND: () => false,
  SendSystemMessage: (h, a) => { h.fire("CHAT_MSG_SYSTEM", String(a[0] ?? ""), "", "", ""); },
  CombatLogGetCurrentEventInfo: () => undefined, CombatLogAddFilter: () => undefined, CombatLogResetFilter: () => undefined, "CombatLog_Object_IsA": () => false,
  GetAddOnCPUUsage: () => 0, GetAddOnMemoryUsage: () => 0, UpdateAddOnCPUUsage: () => undefined, UpdateAddOnMemoryUsage: () => undefined,
  GetEventCPUUsage: () => 0, GetFrameCPUUsage: () => 0, GetFunctionCPUUsage: () => 0, GetScriptCPUUsage: () => 0, ResetCPUUsage: () => undefined,
  GetMouseFoci: () => [[]], GetCurrentKeyBoardFocus: () => undefined,
  // ----- Makros, Quests · macros, quests -----
  GetLooseMacroIcons: () => undefined, GetLooseMacroItemIcons: () => undefined, GetMacroItem: () => undefined, GetMacroItemIcons: () => undefined,
  SetMacroItem: () => undefined, SetMacroSpell: () => undefined, StopMacro: () => undefined,
  GetQuestLogCompletionText: () => "", GetQuestLogLeaderBoardID: () => undefined,
  GetQuestsCompleted: (h) => [Object.fromEntries(h.character().completed.map((id) => [String(id), true]))],
  QueryQuestsCompleted: (h) => { h.later(0.2, () => h.fireIf("QUEST_QUERY_COMPLETE")); },
  // ----- Verschiedenes · misc -----
  CopyToClipboard: () => undefined, FlashClientIcon: () => undefined, SetUnitCursorTexture: () => undefined, IsDesaturateSupported: () => true,
  SetMaxAnimFramerate: (h, a) => { h.store("fps", () => ({ v: 60 })).v = num(a[0]) ?? 60; }, GetMaxAnimFramerate: (h) => h.store("fps", () => ({ v: 60 })).v,
  TargetDirectionEnemy: (h) => { h.note("info", "TargetDirectionEnemy: directional targeting is not simulated."); }, TargetDirectionFriend: (h) => { h.note("info", "TargetDirectionFriend: directional targeting is not simulated."); }, TargetDirectionFinished: () => undefined,
  IsAtStableMaster: (h) => h.store("windows3", () => ({ stable: undefined as { open: boolean } | undefined })).stable?.open === true,
  IsPetAttackAction: (_h, a) => a[0] === 1,
  ContainerFrame_GetContainerNumSlots: (h, a) => h.inventory().bags[String(a[0])]?.size ?? 0,
  AbbreviateLargeNumbers: (_h, a) => { const n = num(a[0]) ?? 0; return n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : String(n); },
  AdjustTimeByMinutes: (_h, a) => { const hh = num(a[0]) ?? 0; return [Math.floor(hh / 60) % 24, hh % 60]; },
  AddSourceLocationExclude: () => undefined, SetModernScriptArgs: (h, a) => { h.store("modernargs", () => ({ v: false })).v = a[0] === true || a[0] === 1; }, GetModernScriptArgs: (h) => h.store("modernargs", () => ({ v: false })).v,
  _classicapi_UndocumentedAPI: () => undefined, _classicapi_LuaHeapAudit: () => 0, _classicapi_GcTagOf: () => undefined,
  "C_Glue.IsFirstLoadThisSession": () => false,
  SecureCmdOptionParse: (_h, a) => { const s = String(a[0] ?? ""); if (!s.includes("[")) return s; for (const seg of s.split(";")) { const m = /^\s*\[([^\]]*)\]\s*(.*)$/.exec(seg); if (!m) return seg.trim(); if (m[1]!.trim() === "") return m[2]!.trim(); } return undefined; },
  // ----- Namensplaketten, Ruf · nameplates, reputation -----
  "C_NamePlate.GetNamePlates": () => [[]], "C_NamePlate.GetNamePlateGUIDs": () => [[]], "C_NamePlate.GetNamePlateForUnit": () => undefined, "C_NamePlate.GetNamePlateForGUID": () => undefined,
  "C_Reputation.IsFactionActive": (h, a) => { const f = faction(h, a[0]); return f !== undefined && f.inactive !== true; },
  "C_Reputation.IsFactionInactive": (h, a) => faction(h, a[0])?.inactive === true,
  "C_Reputation.SetFactionActive": (h, a) => { const f = faction(h, a[0]); if (f) { f.inactive = false; h.fireIf("UPDATE_FACTION"); } },
  "C_Reputation.SetFactionInactive": (h, a) => { const f = faction(h, a[0]); if (f) { f.inactive = true; h.fireIf("UPDATE_FACTION"); } },
  "C_Reputation.ToggleFactionAtWar": (h, a) => { const f = faction(h, a[0]); if (f && (f.standing ?? 0) >= -3000) { f.atWar = !f.atWar; h.fireIf("UPDATE_FACTION"); } },
  "C_Reputation.SetSelectedFaction": (h, a) => { h.store("repsel", () => ({ v: 0 })).v = num(a[0]) ?? 0; },
  "C_Reputation.SetSelectedFactionByID": (h, a) => { h.store("repsel", () => ({ v: 0 })).v = num(a[0]) ?? 0; },
  "C_Reputation.GetLastStandingChange": () => undefined,
  // ----- Sprache · speech -----
  "C_TTSSettings.GetSpeechRate": (h) => tts(h).rate, "C_TTSSettings.SetSpeechRate": (h, a) => { tts(h).rate = num(a[0]) ?? 0; },
  "C_TTSSettings.GetSpeechVolume": (h) => tts(h).volume, "C_TTSSettings.SetSpeechVolume": (h, a) => { tts(h).volume = num(a[0]) ?? 100; },
  "C_TTSSettings.GetSpeechVoiceID": (h) => tts(h).voice, "C_TTSSettings.SetVoiceOption": (h, a) => { tts(h).voice = num(a[1]) ?? 1; },
  "C_TTSSettings.GetVoiceOptionName": () => "Sample Voice", "C_TTSSettings.SetVoiceOptionByName": () => undefined,
  "C_TTSSettings.SetDefaultSettings": (h) => { Object.assign(tts(h), { rate: 0, volume: 100, voice: 1 }); }, "C_TTSSettings.RefreshVoices": () => undefined,
  "C_VoiceChat.GetTtsVoices": () => [[{ voiceID: 1, name: "Sample Voice" }]], "C_VoiceChat.GetRemoteTtsVoices": () => [[]],
  "C_VoiceChat.SpeakText": (h, a) => { h.note("info", `SpeakText: "${String(a[1] ?? a[0])}" (no audio in the simulation).`); }, "C_VoiceChat.StopSpeakingText": () => undefined,
};
