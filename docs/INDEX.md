# Code-Index · Code index

## Inhalt · Contents
1. [Deutsch / English](#quellcode--source)

## Quellcode · Source

| Datei · File | Inhalt · Purpose |
|---|---|
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
| `src/locales/*.json` | Sprachdateien · language files |
| `plugins/*` | Beispiel-Plugins · sample plugins |
| `tests/core.test.ts` | Tests inkl. Hygiene · tests incl. hygiene |

Jede Quelldatei hat oben ein Inhaltsverzeichnis mit Abschnitten `// ===== [Sn] Name =====`. · Every source file has a table of contents at the top referring to `// ===== [Sn] Name =====` sections.
