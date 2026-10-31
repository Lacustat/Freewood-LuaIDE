/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Ctx ......... gemeinsamer Zugriff der Ansichten auf Kernel, Projekt und Ziel
 *   [S2] Starter ..... Beispielprojekt
 */

import { Graph, FormModel, Project, type Kernel, type LocalizedText, type ResolvedTarget } from "../src/index.js";

// ===== [S1] Ctx =====

export interface Ctx {
  kernel: Kernel;
  project: Project;
  target: ResolvedTarget;
  t(key: string, params?: Record<string, string | number>): string;
  /** DE: Text aus Plugin-Daten in der aktuellen Sprache. EN: plugin-data text in the current language. */
  text(value: LocalizedText | undefined): string;
  /** DE: Speichert das Projekt (lokal im Browser). EN: saves the project (locally in the browser). */
  save(): void;
  openFile(path: string): void;
  /** DE: Legt eine Datei an oder ersetzt ihren Inhalt. EN: creates a file or replaces its content. */
  writeFile(path: string, content: string): void;
  rerender(): void;
}

// ===== [S2] Starter =====

export function starterProject(targetId: string, target: ResolvedTarget): Project {
  const p = new Project("MyAddon", targetId);
  p.addFile("MyAddon.toc", "## Interface: 11200\n## Title: MyAddon\n## Author: Lacustat\n## SavedVariables: MyAddonDB\n\nmain.lua\n");
  p.addFile(
    "main.lua",
    [
      "-- MyAddon: shows a hello message once the world is loaded",
      'local frame = CreateFrame("Frame")',
      'frame:RegisterEvent("PLAYER_ENTERING_WORLD")',
      'frame:SetScript("OnEvent", function()',
      '  DEFAULT_CHAT_FRAME:AddMessage("Hello, " .. UnitName("player") .. "!")',
      "end)",
      "",
      'SLASH_MYADDON1 = "/myaddon"',
      'SlashCmdList["MYADDON"] = function(msg)',
      '  DEFAULT_CHAT_FRAME:AddMessage("MyAddon says: " .. msg)',
      "end",
      "",
    ].join("\n"),
  );
  const form = new FormModel();
  const main = form.add("Frame", null, { name: "MyAddonFrame", width: 220, height: 110, strata: "DIALOG", movable: true, enableMouse: true,
    backdrop: { bgFile: "Interface\\DialogFrame\\UI-DialogBox-Background", edgeFile: "Interface\\DialogFrame\\UI-DialogBox-Border", tile: true, tileSize: 32, edgeSize: 32, insets: { left: 11, right: 12, top: 12, bottom: 11 } } });
  const title = form.add("FontString", main.id, { name: "MyAddonTitle", text: "MyAddon", layer: "OVERLAY", font: { object: "GameFontNormal" } });
  form.setAnchor(title.id, { point: "TOP", relativeTo: null, relativePoint: "TOP", x: 0, y: -16 });
  const ok = form.add("Button", main.id, { name: "MyAddonClose", text: "Close", width: 80, height: 22, inherits: "UIPanelButtonTemplate", scripts: { OnClick: "this:GetParent():Hide()" } });
  form.setAnchor(ok.id, { point: "BOTTOM", relativeTo: null, relativePoint: "BOTTOM", x: 0, y: 16 });
  p.addFile("ui.fwform", form.serialize());
  const g = new Graph(undefined, target);
  const ev = g.addNode("event", 40, 40, { event: "PLAYER_ENTERING_WORLD" });
  const call = g.addNode("call", 300, 40, { fn: "UnitName", "lit.unit": "player" });
  const hello = g.addNode("string", 300, 200, { value: "Welcome, " });
  const cat = g.addNode("concat", 560, 140);
  const pr = g.addNode("print", 800, 40);
  g.connect({ node: ev.id, pin: "then" }, { node: call.id, pin: "in" });
  g.connect({ node: call.id, pin: "then" }, { node: pr.id, pin: "in" });
  g.connect({ node: hello.id, pin: "value" }, { node: cat.id, pin: "a" });
  g.connect({ node: call.id, pin: "name" }, { node: cat.id, pin: "b" });
  g.connect({ node: cat.id, pin: "result" }, { node: pr.id, pin: "text" });
  p.addFile("welcome.fwgraph", g.serialize());
  return p;
}
