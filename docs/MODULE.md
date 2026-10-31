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
  - Aufbau: Der Host (`world.ts`) kennt nur primitive Werte. Frames, Skript-Handler, Timer-Handles und die API-Funktionen entstehen in der VM durch ein erzeugtes Lua-Prelude (`prelude.ts`); Frames sind Tabellen `{[0]=id}` mit Metatable, Funktionen/Frames gehen als Kennungen über die Grenze. `engine.ts` stellt zwei Motoren bereit: eigener Interpreter und echte Lua-5.0-VM (WASM). Vanilla läuft standardmäßig auf der echten VM (Einstellung „Laufzeit der Simulation“), ClassicAPI/Retail auf dem Interpreter (ClassicAPI braucht dafür noch den 5.1→5.0-Umschreiber).
  - Bekannte Abweichung zum Spiel: Skripte, die während eines API-Aufrufs ausgelöst werden (z. B. `OnShow` durch `Show()`), laufen erst nach dem laufenden Aufruf, nicht mitten darin.
- **Web-Oberfläche (`web`)**: Editor, Graph, Forms und Simulation in einem Fenster; Projekt wird im Browser (localStorage) gespeichert. Starten mit `node scripts/serve.mjs 8123`.
- **Einstellungen (`web/settings.ts`)**: Farbschema, Code-Schriftgröße, Tab-Breite, Auto-Speichern, Forms-Zoom (0 = einpassen) und Bühnengröße; gespeichert im Browser. Neue Einstellung = ein Eintrag in `SETTING_DEFS` plus Sprachschlüssel `settings.<key>`.
- **Fehlermeldungen wie das Original**: Der Interpreter meldet im 5.0-Modus wie die echte 5.0-VM (``attempt to index local `x' (a nil value)``); abgesichert durch `tests/fixtures/lua50-oracle.json`, das aus echtem Lua 5.0 (WASM) erzeugt wurde.
- **`runtimes/lua50` + `src/lua/wasm50.ts`**: echtes Lua 5.0 als WASM (`LuaRuntime`), Referenz für den Interpreter und echte Syntaxprüfung im Editor (Einstellung „realLua“). Für ClassicAPI wird die VM per `runtimes/lua50/patches/classicapi.patch` angepasst (String-Methoden, 60 Upvalues, Schleifenvariable je Durchlauf; Schalter `fw_classic`, Standard aus).
- **Plugin-Daten**: Vanilla ca. 1060 Funktionen (ca. 640 mit Signatur; die ca. 330 zuletzt ergänzten stammen aus dem Gedächtnis und tragen Tag `unverified`; Rest nur Name mit Tag `signature-unknown`), 160 Events, ClassicAPI ca. 735 Funktionen (ca. 640 mit Signatur; Parameter-/Rückgabenamen und Beschreibung aus der ClassicAPI-`docs/API.md`, Typen noch unbekannt = Tag `types-unknown`; Skript `scripts/import-classicapi-docs.py`) und zusätzliche Widget-Methoden. Quellen stehen in den Manifesten.
- **Tests**: `npm test` (Einheitstests), `node scripts/ui-smoke.mjs` (UI-Rauchtest, braucht Playwright und laufenden Server).

## English

- **Lua interpreter (`src/lua`)**: own tree-walking interpreter for Lua 5.0 and 5.1 (lexer, parser, values, stdlib, patterns). The `LuaRuntime`/`RuntimeFactory` interface stays swappable so WASM runtimes can follow. 5.1 syntax (`#`, `%`, `[=[`) is only valid in 5.1 mode; the ClassicAPI target runs on the 5.0 VM and therefore knows names from both standard libraries.
- **Analysis (`src/analysis`)**: `checkSource` reports syntax errors, unknown functions and version traps (e.g. `#` in Lua 5.0).
- **Editor (`src/editor`)**: Lua and XML highlighting, completion and signature line from plugin data.
- **Node graph (`src/graph`)**: nodes with exec and data pins; rules: exec to exec only, data to data only, one incoming edge per input pin, no self-connection. `generateLua` emits target-specific code (`table.getn` vs `#`, `math.mod` vs `%`, delay only with `C_Timer.After`).
- **Forms (`src/forms`)**: frames with strata/level and draw layers, anchor layout in WoW coordinates, Lua and XML generation and XML import (Vanilla `<AbsDimension>`, Retail `<Size x y/>`).
- **Simulation (`src/sim`)**: runs scripts against a simulated world. Only what the target's plugin data lists exists; e.g. a Vanilla frame has no `SetSize`. Assumption: `UnitHealth` returns percent for non-group units (open question).
  - Structure: the host (`world.ts`) only knows primitive values. Frames, script handlers, timer handles and API functions are created inside the VM by a generated Lua prelude (`prelude.ts`); frames are tables `{[0]=id}` with a metatable, functions/frames cross the boundary as refs. `engine.ts` provides two engines: the own interpreter and the real Lua 5.0 VM (WASM). Vanilla runs on the real VM by default (setting "Simulation runtime"), ClassicAPI/Retail on the interpreter (ClassicAPI still needs the 5.1→5.0 rewriter for that).
  - Known difference to the game: scripts triggered during an API call (e.g. `OnShow` from `Show()`) run after the current call finishes, not in the middle of it.
- **Web UI (`web`)**: editor, graph, forms and simulation in one window; the project is stored in the browser (localStorage). Start with `node scripts/serve.mjs 8123`.
- **Settings (`web/settings.ts`)**: theme, code font size, tab width, autosave, forms zoom (0 = fit) and stage size; stored in the browser. A new setting is one entry in `SETTING_DEFS` plus a language key `settings.<key>`.
- **Error messages like the original**: in 5.0 mode the interpreter reports like the real 5.0 VM (``attempt to index local `x' (a nil value)``); backed by `tests/fixtures/lua50-oracle.json`, generated from real Lua 5.0 (WASM).
- **`runtimes/lua50` + `src/lua/wasm50.ts`**: real Lua 5.0 as WASM (`LuaRuntime`), reference for the interpreter and real syntax check in the editor (setting "realLua"). For ClassicAPI the VM is patched by `runtimes/lua50/patches/classicapi.patch` (string methods, 60 upvalues, fresh loop variable per pass; switch `fw_classic`, off by default).
- **Plugin data**: Vanilla about 1060 functions (about 640 with signature; the roughly 330 added last are from memory and carry tag `unverified`; the rest are names only with tag `signature-unknown`), 160 events, ClassicAPI about 735 functions (about 640 with signature; parameter/return names and description from ClassicAPI `docs/API.md`, types still unknown = tag `types-unknown`; script `scripts/import-classicapi-docs.py`) plus extra widget methods. Sources are listed in the manifests.
- **Tests**: `npm test` (unit tests), `node scripts/ui-smoke.mjs` (UI smoke test, needs Playwright and a running server).
