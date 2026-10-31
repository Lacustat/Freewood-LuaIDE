# Code-Index · Code index

## Inhalt · Contents
1. [Deutsch / English](#quellcode--source)

## Quellcode · Source

| Datei · File | Inhalt · Purpose |
|---|---|
| `docs/MODULE.md` | Modulübersicht · module overview |
| `src/plugin-api/types.ts` | Typen für Manifest und API-Daten · types for manifest and API data |
| `src/plugin-api/validate.ts` | Validierung, Fehlercodes `PLG_*` · validation, error codes |
| `src/plugin-api/assemble.ts` | Plugin aus Manifest + Dateien bauen · assemble a plugin |
| `src/core/errors.ts` | `FreewoodError` |
| `src/core/events.ts` | `EventBus`, `KernelEvents` |
| `src/core/i18n.ts` | Mehrsprachigkeit · multilingual UI |
| `src/core/plugins.ts` | `PluginRegistry`, Vererbung · inheritance |
| `src/core/project.ts` | Projektmodell · project model |
| `src/core/kernel.ts` | `Kernel` |
| `src/runtime/types.ts`, `registry.ts` | Austauschbare Lua-Laufzeit · swappable Lua runtime |
| `src/node/fs-loaders.ts` | Nur Node: Plugins und Sprachen laden · Node only: load plugins and locales |
| `src/lua/*.ts` | Lua-5.0/5.1-Interpreter: Lexer, Parser, Werte, Stdlib, Muster, Laufzeit · Lua interpreter |
| `src/analysis/api-check.ts` | Prüfung gegen das Ziel (`LUA_SYNTAX`, `API_*`) · checks against the target |
| `src/editor/*.ts` | Hervorhebung, Vervollständigung · highlighting, completion |
| `src/graph/*.ts` | Node-Graph-Modell und Lua-Erzeugung · graph model and Lua generation |
| `src/forms/*.ts` | Forms-Modell, Layout, Lua/XML · forms model, layout, Lua/XML |
| `src/sim/*.ts` | Simulation: Welt (`world.ts`), Motoren (`engine.ts`), Lua-Prelude (`prelude.ts`), Szenario, Gegenstände/Taschen/Zauber (`inventory.ts`), Einheiten (`units.ts`), Charakter (`character.ts`), CVars/Zeit (`system.ts`) · simulation: world, engines, Lua prelude, scenario, items/bags/spells (`inventory.ts`), units (`units.ts`), character (`character.ts`), CVars/time (`system.ts`) |
| `web/*.ts`, `web/index.html`, `web/style.css` | Web-Oberfläche · web UI |
| `runtimes/lua50/*`, `src/lua/wasm50.ts`, `web/real-lua.ts` | Echtes Lua 5.0 als WASM · real Lua 5.0 as WASM |
| `scripts/serve.mjs`, `scripts/ui-smoke.mjs` | Server, UI-Rauchtest · static server, UI smoke test |
| `src/locales/*.json` | Sprachdateien · language files |
| `plugins/*` | Beispiel-Plugins · sample plugins |
| `tests/core.test.ts` | Tests inkl. Hygiene · tests incl. hygiene |

Jede Quelldatei hat oben ein Inhaltsverzeichnis mit Abschnitten `// ===== [Sn] Name =====`. · Every source file has a table of contents at the top referring to `// ===== [Sn] Name =====` sections.
