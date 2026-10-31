# Module · Modules

## Inhalt · Contents
1. [Deutsch](#deutsch)
2. [English](#english)

## Deutsch

- **Lua-Interpreter (`src/lua`)**: eigener Tree-Walking-Interpreter für Lua 5.0 und 5.1 (Lexer, Parser, Werte, Standardbibliothek, Muster). Die Schnittstelle `LuaRuntime`/`RuntimeFactory` bleibt austauschbar, später können WASM-Laufzeiten folgen. 5.1-Syntax (`#`, `%`, `[=[`) ist nur im 5.1-Modus erlaubt; das ClassicAPI-Ziel läuft auf der 5.0-VM und kennt daher die Namen beider Standardbibliotheken.
- **Analyse (`src/analysis`)**: `checkSource` meldet Syntaxfehler, unbekannte Funktionen und Versionsfallen (z. B. `#` in Lua 5.0).
- **Editor (`src/editor`)**: Hervorhebung für Lua und XML, Vervollständigung und Signaturzeile aus den Plugin-Daten.
- **Node-Graph (`src/graph`)**: Knoten mit Exec- und Datenpins; Regeln: Exec nur zu Exec, Daten nur zu Daten, ein Eingang pro Pin, keine Selbstverbindung. `generateLua` erzeugt zielabhängigen Code (`table.getn` vs `#`, `math.mod` vs `%`, Verzögerung nur mit `C_Timer.After`).
- **Forms (`src/forms`)**: Frames mit Strata/Level und Draw-Layern, Anker-Layout in WoW-Koordinaten, Lua- und XML-Erzeugung sowie XML-Import (Vanilla `<AbsDimension>`, Retail `<Size x y/>`).
- **Simulation (`src/sim`)**: führt Skripte gegen eine simulierte Welt aus. Es existiert nur, was die Plugin-Daten des Ziels listen; z. B. hat ein Vanilla-Frame kein `SetSize`. Annahme: `UnitHealth` liefert für Nicht-Gruppen-Einheiten Prozent (offen, siehe Fragen).
- **Web-Oberfläche (`web`)**: Editor, Graph, Forms und Simulation in einem Fenster; Projekt wird im Browser (localStorage) gespeichert. Starten mit `node scripts/serve.mjs 8123`.
- **Tests**: `npm test` (Einheitstests), `node scripts/ui-smoke.mjs` (UI-Rauchtest, braucht Playwright und laufenden Server).

## English

- **Lua interpreter (`src/lua`)**: own tree-walking interpreter for Lua 5.0 and 5.1 (lexer, parser, values, stdlib, patterns). The `LuaRuntime`/`RuntimeFactory` interface stays swappable so WASM runtimes can follow. 5.1 syntax (`#`, `%`, `[=[`) is only valid in 5.1 mode; the ClassicAPI target runs on the 5.0 VM and therefore knows names from both standard libraries.
- **Analysis (`src/analysis`)**: `checkSource` reports syntax errors, unknown functions and version traps (e.g. `#` in Lua 5.0).
- **Editor (`src/editor`)**: Lua and XML highlighting, completion and signature line from plugin data.
- **Node graph (`src/graph`)**: nodes with exec and data pins; rules: exec to exec only, data to data only, one incoming edge per input pin, no self-connection. `generateLua` emits target-specific code (`table.getn` vs `#`, `math.mod` vs `%`, delay only with `C_Timer.After`).
- **Forms (`src/forms`)**: frames with strata/level and draw layers, anchor layout in WoW coordinates, Lua and XML generation and XML import (Vanilla `<AbsDimension>`, Retail `<Size x y/>`).
- **Simulation (`src/sim`)**: runs scripts against a simulated world. Only what the target's plugin data lists exists; e.g. a Vanilla frame has no `SetSize`. Assumption: `UnitHealth` returns percent for non-group units (open question).
- **Web UI (`web`)**: editor, graph, forms and simulation in one window; the project is stored in the browser (localStorage). Start with `node scripts/serve.mjs 8123`.
- **Tests**: `npm test` (unit tests), `node scripts/ui-smoke.mjs` (UI smoke test, needs Playwright and a running server).
