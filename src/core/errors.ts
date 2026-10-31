/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] FreewoodError ............... Basisfehler mit stabilem Code · base error with stable code
 */

// ===== [S1] FreewoodError =====

/** DE: Basisfehler des Kerns. `code` ist stabil und für Übersetzungen gedacht. EN: base error of the core; `code` is stable and meant for translations. */
export class FreewoodError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "FreewoodError";
    this.code = code;
  }
}
