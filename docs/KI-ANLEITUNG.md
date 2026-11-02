# Anleitung für KI-Assistenten · Guide for AI assistants

<!-- Freewood LUA IDE – SPDX-License-Identifier: GPL-3.0-or-later – Copyright (C) 2026 Lacustat -->

**Inhalt · Contents:** [Wofür · Purpose](#wofür--purpose) · [Einrichten · Setup](#einrichten--setup) · [Arbeitsablauf · Workflow](#arbeitsablauf--workflow) · [Befehle · Commands](#befehle--commands) · [Ziele · Targets](#ziele--targets) · [Grenzen · Limits](#grenzen--limits) · [Regeln für Änderungen · Rules for changes](#regeln-für-änderungen--rules-for-changes)

## Wofür · Purpose
**DE:** Diese Datei richtet sich an KI-Assistenten (Claude, ChatGPT, Copilot, lokale Modelle …) und an Menschen, die mit ihnen arbeiten. Die Freewood LUA IDE kann ein WoW-Addon **ohne Spiel und ohne Browser** prüfen und ausführen: auf echten Lua-5.0/5.1-Laufzeiten, mit einer Simulation der WoW-API. So findet ein Assistent Syntaxfehler, nicht vorhandene Funktionen und Laufzeitfehler, bevor jemand das Addon im Spiel testet.
**EN:** This file is for AI assistants (Claude, ChatGPT, Copilot, local models …) and the people working with them. The Freewood LUA IDE can check and run a WoW addon **without the game and without a browser**: on real Lua 5.0/5.1 runtimes with a simulation of the WoW API. An assistant finds syntax errors, missing functions and runtime errors before anyone tests the addon in game.

## Einrichten · Setup
**DE:** Voraussetzung: Node.js 20 oder neuer. Dann:
**EN:** Requirement: Node.js 20 or newer. Then:
```
git clone https://github.com/Lacustat/Freewood-LuaIDE
cd Freewood-LuaIDE
npm install
npm run build
npm test            # optional: alle Tests müssen grün sein · all tests must pass
```
**DE:** Windows-PowerShell sperrt manchmal `npm.ps1`: dann `npm.cmd` statt `npm` verwenden.
**EN:** Windows PowerShell sometimes blocks `npm.ps1`: use `npm.cmd` instead of `npm`.

## Arbeitsablauf · Workflow
**DE:**
1. Addon-Ordner (mit `.toc` und `.lua`-Dateien) schreiben oder erhalten.
2. `node scripts/fw.mjs check <ordner>`: Syntax und unbekannte API-Funktionen. Exit-Code 1 = Fehler gefunden.
3. `node scripts/fw.mjs run <ordner>`: Addon laden, anmelden, Log lesen. Exit-Code 1 = Skriptfehler.
4. Verhalten testen: Ereignisse auslösen (`--event`), Slash-Befehle (`--cmd`), NPC-Fenster öffnen (`--open mail,merchant`), Lua-Ausdrücke auswerten (`--eval`).
5. Fehler beheben und wiederholen, bis `check` und `run` sauber durchlaufen.
6. Dem Menschen sagen, **was geprüft wurde und was nicht** (siehe Grenzen): ein grüner Lauf heißt nicht, dass das Addon im Spiel funktioniert.

**EN:**
1. Write or receive an addon folder (with `.toc` and `.lua` files).
2. `node scripts/fw.mjs check <folder>`: syntax and unknown API functions. Exit code 1 = findings.
3. `node scripts/fw.mjs run <folder>`: load the addon, log in, read the log. Exit code 1 = script error.
4. Test behaviour: fire events (`--event`), slash commands (`--cmd`), open NPC windows (`--open mail,merchant`), evaluate Lua (`--eval`).
5. Fix and repeat until `check` and `run` pass cleanly.
6. Tell the human **what was checked and what was not** (see Limits): a green run does not mean the addon works in game.

## Befehle · Commands
```
node scripts/fw.mjs check <addon-ordner|datei.lua> [--target classicapi|vanilla|retail] [--json]
node scripts/fw.mjs run <addon-ordner> [--target ..] [--engine wasm|interp] [--open mail,merchant]
                        [--event "NAME:arg1,arg2;NAME2"] [--cmd "/slash"] [--eval "lua"]
                        [--advance sekunden] [--frames] [--verbose] [--max N] [--json]
node scripts/fw.mjs targets      # Zielplattformen · target platforms
node scripts/fw.mjs windows      # Fenster für --open · windows for --open
```
**DE:** `--json` liefert maschinenlesbare Ausgabe. Exit-Codes: 0 = in Ordnung, 1 = Befunde oder Fehler, 2 = falsche Benutzung. XML-Dateien aus der `.toc` werden gemeldet, aber nicht ausgeführt. Vollständig: [CLI.md](CLI.md).
**EN:** `--json` gives machine-readable output. Exit codes: 0 = ok, 1 = findings or errors, 2 = usage error. XML files from the `.toc` are reported but not run. Full reference: [CLI.md](CLI.md).

Beispiele · Examples:
```
node scripts/fw.mjs check MyAddon --target vanilla
node scripts/fw.mjs run MyAddon --open mail --cmd "/myaddon" --advance 10
node scripts/fw.mjs run MyAddon --event "PLAYER_REGEN_DISABLED;UNIT_HEALTH:player" --frames
node scripts/fw.mjs run MyAddon --eval "return GetNumFrames()" --json
```

## Ziele · Targets
| `--target` | DE | EN |
|---|---|---|
| `vanilla` | WoW 1.12, Lua 5.0 (kein `#`, kein `%`, kein `string.match`; `getn`, `gfind`, `strfind`) | WoW 1.12, Lua 5.0 (no `#`, no `%`, no `string.match`; use `getn`, `gfind`, `strfind`) |
| `classicapi` (Standard · default) | 1.12 + ClassicAPI (z. B. OctoWoW/TurtleWoW): Lua-5.1-Syntax auf der 5.0-VM, zusätzliche API-Funktionen | 1.12 + ClassicAPI (e.g. OctoWoW/TurtleWoW): Lua 5.1 syntax on the 5.0 VM, additional API functions |
| `retail` | Lua 5.1 mit Retail-API (Datenbasis kleiner) | Lua 5.1 with the retail API (smaller data set) |

## Grenzen · Limits
**DE:**
- Die Simulation nutzt **erfundene Beispieldaten**. Sie prüft, ob Code läuft und ob Funktionen existieren und in der richtigen Form antworten, nicht ob die Spielwerte stimmen.
- Rückgabeformate wurden an echten Client-Läufen geprüft (Fixtures in `tests/fixtures/`), aber nicht jede Funktion. Funktionen ohne eigene Logik liefern typisierte Standardwerte und schreiben einen Hinweis ins Log: solche Hinweise ernst nehmen.
- Nicht simuliert: andere Spieler, Server, Grafik, echte Zeit- und Kampfabläufe. Fenster (Post, Auktion, Händler …) sind zu Beginn geschlossen und werden mit `--open` mit Beispieldaten geöffnet.
- Wenn die Simulation und die Wirklichkeit abweichen, gilt die Wirklichkeit: Befunde aus dem Spiel gehören in die Fixtures und die Simulation wird angepasst.

**EN:**
- The simulation uses **invented sample data**. It checks that code runs and that functions exist and answer in the right shape, not that game values are right.
- Return formats were verified against real client runs (fixtures in `tests/fixtures/`), but not every function. Functions without own logic return typed defaults and write a note to the log: take such notes seriously.
- Not simulated: other players, servers, graphics, real timing and combat. Windows (mail, auction, vendor …) start closed and are opened with sample data via `--open`.
- When simulation and reality differ, reality wins: findings from the game belong into the fixtures and the simulation is adjusted.

## Regeln für Änderungen · Rules for changes
**DE:** Wer die IDE selbst ändert: Tests ergänzen und `npm test` grün halten; jede Quelldatei beginnt mit Lizenzkopf und Inhaltsverzeichnis; Dokumentation zweisprachig (Deutsch und Englisch); Lizenz GPL-3.0-or-later. Keine privaten Daten committen (Namen, Mails, Zugangsdaten, Spieler-, Charakter- und Servernamen in Testdaten): das Repo ist öffentlich.
**EN:** If you change the IDE itself: add tests and keep `npm test` green; every source file starts with a licence header and a table of contents; documentation is bilingual (German and English); licence GPL-3.0-or-later. Do not commit private data (names, mails, credentials, player, character or realm names in test data): the repo is public.
