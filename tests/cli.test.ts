/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Kommandozeile · command line ... fw check, fw run
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const fw = (...args: string[]): { code: number | null; out: string } => {
  const r = spawnSync(process.execPath, [join(process.cwd(), "scripts/fw.mjs"), ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
};

test("fw check: finds a syntax error and exits 1; clean file exits 0", () => {
  const d = mkdtempSync(join(tmpdir(), "fw-"));
  writeFileSync(join(d, "bad.lua"), "local a =\nprint(");
  writeFileSync(join(d, "ok.lua"), "print('hi')");
  const bad = fw("check", join(d, "bad.lua"));
  assert.equal(bad.code, 1);
  assert.match(bad.out, /LUA_SYNTAX/);
  assert.equal(fw("check", join(d, "ok.lua")).code, 0);
});

test("fw run: runs an addon with a toc, opens a window, reports errors", () => {
  const d = mkdtempSync(join(tmpdir(), "fw-"));
  writeFileSync(join(d, "T.toc"), "## Interface: 11200\nmain.lua\n");
  writeFileSync(join(d, "main.lua"), 'local f = CreateFrame("Frame"); f:RegisterEvent("MAIL_SHOW"); f:SetScript("OnEvent", function() print("mail open " .. GetInboxNumItems()) end)');
  const r = fw("run", d, "--open", "mail", "--engine", "interp");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /mail open/);
  writeFileSync(join(d, "main.lua"), "NoSuchFunction()");
  const e = fw("run", d, "--engine", "interp");
  assert.equal(e.code, 1);
  assert.match(e.out, /RESULT: errors/);
});
