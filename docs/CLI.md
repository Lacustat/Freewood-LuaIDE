# Kommandozeile · Command line (fw)

<!-- Freewood LUA IDE – SPDX-License-Identifier: GPL-3.0-or-later – Copyright (C) 2026 Lacustat -->

**Inhalt · Contents:** [Einrichten · Setup](#einrichten--setup) · [Befehle · Commands](#befehle--commands) · [Beispiele · Examples](#beispiele--examples) · [Für andere Chats · For other chats](#für-andere-chats--for-other-chats)

## Einrichten · Setup
**DE:** Node.js 20+ nötig. Im Repo-Ordner: `npm install` und `npm run build` (unter Windows PowerShell `npm.cmd` verwenden, falls Skripte gesperrt sind). Danach: `node scripts/fw.mjs <Befehl>` (oder `npm run fw -- <Befehl>`).
**EN:** Node.js 20+ required. In the repo folder: `npm install`, `npm run build` (on Windows PowerShell use `npm.cmd` if scripts are blocked). Then: `node scripts/fw.mjs <command>` (or `npm run fw -- <command>`).

## Befehle · Commands
| Befehl · Command | DE | EN |
|---|---|---|
| `fw check <Addon-Ordner\|Datei.lua> [--target classicapi\|vanilla\|retail]` | Syntax + API-Prüfung (unbekannte Funktionen, Versionsfallen). Exit 1 bei Fehlern. | Syntax + API check (unknown functions, version traps). Exit 1 on errors. |
| `fw run <Addon> [--open mail,merchant] [--event NAME:arg;NAME2] [--cmd "/slash"] [--eval "lua"] [--advance s] [--frames] [--verbose] [--max N] [--engine wasm\|interp] [--json]` | Lädt die `.toc` (nur `.lua`), meldet sich an, öffnet Fenster, löst Ereignisse/Befehle aus, gibt Log + Frames kurz aus. Exit 1 bei Skriptfehlern. | Loads the `.toc` (`.lua` only), logs in, opens windows, fires events/commands, prints log + frames compactly. Exit 1 on script errors. |
| `fw targets` | Zielplattformen. | Target platforms. |
| `fw windows` | Fenstername für `--open`. | Window names for `--open`. |

**DE:** `--target` Standard ist `classicapi` (OctoWoW/TurtleWoW). XML-Dateien aus der `.toc` werden gemeldet, aber nicht ausgeführt. Mit `--json` kommt maschinenlesbare Ausgabe.
**EN:** `--target` defaults to `classicapi` (OctoWoW/TurtleWoW). XML files from the `.toc` are reported but not run. `--json` gives machine-readable output.

## Beispiele · Examples
```
node scripts/fw.mjs check examples/FreewoodProbeWin
node scripts/fw.mjs run MeinAddon --open mail --cmd "/mein" --advance 10
node scripts/fw.mjs run MeinAddon --event "PLAYER_REGEN_DISABLED;UNIT_HEALTH:player" --frames
node scripts/fw.mjs run MeinAddon --target vanilla --eval "return GetNumFrames()"
```

## Für andere Chats · For other chats
**DE:** Repo holen (`Lacustat/Freewood-LuaIDE`), `npm install && npm run build`, dann `fw check` / `fw run`. Die Simulation nutzt nur erfundene Beispieldaten; echte Spielwerte stehen in `tests/fixtures/octowoow-*`.
**EN:** Get the repo (`Lacustat/Freewood-LuaIDE`), `npm install && npm run build`, then `fw check` / `fw run`. The simulation uses invented sample data only; real game values are in `tests/fixtures/octowoow-*`.
