# Freewood LUA IDE

## Inhalt · Contents
1. [Deutsch](#deutsch)
2. [English](#english)
3. [Lizenz · License](#lizenz--license)

## Deutsch

Eine modulare Web-IDE (läuft im Browser, auf allen Plattformen) zum Entwickeln von World-of-Warcraft-Addons.

**Geplante Bausteine:** Code-Editor, Node-Graph (visuelles Scripting), Forms-Editor für Lua/XML mit Ebenen (Frame-Strata und Draw-Layer), Simulation der WoW-API und der Server-Antworten, Plugin-System.

**Stand Phase 1:** Kern und Plugin-Gerüst (TypeScript, ohne Laufzeit-Abhängigkeiten): Plugin-Format mit Validierung und Vererbung, Event-Bus, Mehrsprachigkeit (JSON-Sprachdateien), Projektmodell, austauschbare Lua-Laufzeit-Schnittstelle. Drei Beispiel-Plugins: Vanilla 1.12 (Lua 5.0), 1.12 + ClassicAPI (Lua-5.1-Syntax), Retail (Lua 5.1). Die Beispieldaten sind bewusst klein.

**Bauen und testen:**
```
npm install
npm test
```

**Weitere Dokumentation:** [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), [docs/PLUGIN-FORMAT.md](docs/PLUGIN-FORMAT.md), [docs/INDEX.md](docs/INDEX.md).

**Regeln:** Jede Quelldatei beginnt mit Kopf und Inhaltsverzeichnis; Dokumentation immer Deutsch und Englisch.

## English

A modular web IDE (runs in the browser, on all platforms) for developing World of Warcraft addons.

**Planned parts:** code editor, node graph (visual scripting), forms editor for Lua/XML with layers (frame strata and draw layers), simulation of the WoW API and server answers, plugin system.

**Phase 1 status:** core and plugin skeleton (TypeScript, no runtime dependencies): plugin format with validation and inheritance, event bus, multilingual UI (JSON language files), project model, swappable Lua runtime interface. Three sample plugins: Vanilla 1.12 (Lua 5.0), 1.12 + ClassicAPI (Lua 5.1 syntax), Retail (Lua 5.1). The sample data is intentionally small.

**Build and test:**
```
npm install
npm test
```

**More documentation:** [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md), [docs/PLUGIN-FORMAT.md](docs/PLUGIN-FORMAT.md), [docs/INDEX.md](docs/INDEX.md).

**Rules:** every source file starts with a header and a table of contents; documentation is always German and English.

## Lizenz · License

GPL-3.0-only, Copyright (C) 2026 Lacustat. Siehe/See [LICENSE](LICENSE), [NOTICE.md](NOTICE.md).
