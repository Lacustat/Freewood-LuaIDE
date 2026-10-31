# Architektur · Architecture

## Inhalt · Contents
1. [Deutsch](#deutsch)
2. [English](#english)

## Deutsch

**Kernel** (`src/core/kernel.ts`) bündelt: `EventBus`, `I18n`, `PluginRegistry`, `RuntimeRegistry`.

- **Plugins** liefern nur Daten (Zielplattform + API: Funktionen, Events, Widgets, Ebenen). `PluginRegistry.resolve(id)` fügt die Vererbungskette zusammen (Basen zuerst; `removes` wird vor dem Hinzufügen angewendet; Funktionen/Events werden nach Namen ersetzt, Widgets als Vereinigung der Methoden und Skripte). Zyklen und fehlende Basen werden gemeldet.
- **Projekt** (`src/core/project.ts`): Dateien mit normalisierten, groß-/kleinschreibungsunabhängig eindeutigen Pfaden (WoW/Windows), Events bei Änderungen, Serialisierung `freewood-project` v1.
- **Laufzeit** (`src/runtime`): Schnittstelle `LuaRuntime`/`RuntimeFactory`. Die Simulation startet mit Lua 5.1; Lua 5.0.3 kann später als weitere Laufzeit registriert werden, ohne den Rest zu ändern.
- **Mehrsprachigkeit**: JSON-Dateien je Sprache in `src/locales`; Fallback-Kette `de-at` → `de` → `en`.
- **Umgebung**: `src/index.ts` ist umgebungsunabhängig; Dateizugriff nur in `src/node`.

## English

The **kernel** (`src/core/kernel.ts`) bundles `EventBus`, `I18n`, `PluginRegistry`, `RuntimeRegistry`.

- **Plugins** carry data only (target platform + API: functions, events, widgets, layers). `PluginRegistry.resolve(id)` assembles the inheritance chain (bases first; `removes` is applied before adding; functions/events are replaced by name, widgets merged as the union of methods and scripts). Cycles and missing bases are reported.
- **Project** (`src/core/project.ts`): files with normalized, case-insensitively unique paths (WoW/Windows), change events, `freewood-project` v1 serialization.
- **Runtime** (`src/runtime`): `LuaRuntime`/`RuntimeFactory` interface. The simulation starts with Lua 5.1; Lua 5.0.3 can be registered later as another runtime without touching the rest.
- **Multilingual UI**: one JSON file per language in `src/locales`; fallback chain `de-at` → `de` → `en`.
- **Environment**: `src/index.ts` is environment-independent; file access lives only in `src/node`.
