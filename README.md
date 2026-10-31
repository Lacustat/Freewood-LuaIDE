# Freewood LUA IDE

## Inhalt · Contents
1. [Deutsch](#deutsch)
2. [English](#english)
3. [Lizenz · License](#lizenz--license)

## Deutsch

Eine modulare Web-IDE (läuft im Browser, auf allen Plattformen) zum Entwickeln von World-of-Warcraft-Addons.

**Bausteine:** Code-Editor, Node-Graph (visuelles Scripting), Forms-Editor für Lua/XML mit Ebenen (Frame-Strata und Draw-Layer), Simulation der WoW-API und der Server-Antworten, Plugin-System.

**Stand:** Kern, Lua-5.0/5.1-Interpreter (eigener, austauschbar), API-Prüfung, Editor-Logik, Node-Graph mit Lua-Erzeugung, Forms-Editor mit Ebenen (Lua/XML erzeugen und importieren), Simulation und Web-Oberfläche. Alles in TypeScript ohne Laufzeit-Abhängigkeiten, Plugin-Format mit Validierung und Vererbung, Mehrsprachigkeit (JSON-Sprachdateien). Drei Beispiel-Plugins: Vanilla 1.12 (Lua 5.0), 1.12 + ClassicAPI (Lua-5.1-Syntax), Retail (Lua 5.1). Die Beispieldaten sind bewusst klein.

**Bauen, testen, starten:**
```
npm install
npm test
node scripts/serve.mjs 8123   # dann http://127.0.0.1:8123/
```

**Weitere Dokumentation:** [docs/MODULE.md](docs/MODULE.md), [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), [docs/PLUGIN-FORMAT.md](docs/PLUGIN-FORMAT.md), [docs/INDEX.md](docs/INDEX.md).

**Regeln:** Jede Quelldatei beginnt mit Kopf und Inhaltsverzeichnis; Dokumentation immer Deutsch und Englisch.

## English

A modular web IDE (runs in the browser, on all platforms) for developing World of Warcraft addons.

**Parts:** code editor, node graph (visual scripting), forms editor for Lua/XML with layers (frame strata and draw layers), simulation of the WoW API and server answers, plugin system.

**Status:** core, own swappable Lua 5.0/5.1 interpreter, API checks, editor logic, node graph with Lua generation, forms editor with layers (generate and import Lua/XML), simulation and web UI. All TypeScript without runtime dependencies, plugin format with validation and inheritance, multilingual UI (JSON language files). Three sample plugins: Vanilla 1.12 (Lua 5.0), 1.12 + ClassicAPI (Lua 5.1 syntax), Retail (Lua 5.1). The sample data is intentionally small.

**Build, test, run:**
```
npm install
npm test
node scripts/serve.mjs 8123   # then http://127.0.0.1:8123/
```

**More documentation:** [docs/MODULE.md](docs/MODULE.md), [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), [docs/PLUGIN-FORMAT.md](docs/PLUGIN-FORMAT.md), [docs/INDEX.md](docs/INDEX.md).

**Rules:** every source file starts with a header and a table of contents; documentation is always German and English.

## Lizenz · License

GPL-3.0-or-later, Copyright (C) 2026 Lacustat. Siehe/See [LICENSE](LICENSE), [NOTICE.md](NOTICE.md).
