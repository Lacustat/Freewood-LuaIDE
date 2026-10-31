/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-only
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Ausgaben · Exports .......... errors, events, i18n, plugins, project, kernel
 */

// ===== [S1] Ausgaben · Exports =====
export { FreewoodError } from "./errors.js";
export { EventBus, type KernelEvents } from "./events.js";
export { I18n, normalizeLang } from "./i18n.js";
export { PluginRegistry, type ResolvedTarget } from "./plugins.js";
export {
  Project,
  kindFromPath,
  normalizePath,
  type ProjectEvents,
  type ProjectFile,
  type ProjectFileKind,
  type SerializedProject,
} from "./project.js";
export { Kernel } from "./kernel.js";
