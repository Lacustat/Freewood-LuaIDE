# Plugin-Format · Plugin format

## Inhalt · Contents
1. [Deutsch](#deutsch)
2. [English](#english)

## Deutsch

Ein Plugin ist ein Ordner mit `manifest.json` und Datendateien (nur Dateinamen, keine Pfade).

Pflichtfelder im Manifest: `schema` (1), `id` (`a-z0-9.-`), `version` (X.Y.Z), `name`, `description` (`LocalizedText`, `en` ist Pflicht, `de` wird empfohlen), `author`, `license`, `luaVersion` (`5.0`|`5.1`), `syntax` (`lua50`|`lua51-transpiled`|`lua51`), `scriptArgs` (`globals`|`arguments`|`both`), `files`.
Optional: `clientBuild`, `interfaceVersion`, `extends` (Liste von Plugin-IDs), `removes` (`functions`, `events`, `widgets`), `sources` (Titel, URL, Lizenz).

Dateien: `functions.json` (Name, system, params, returns, description), `events.json` (Name in GROSSBUCHSTABEN_MIT_UNTERSTRICH, payload), `widgets.json` (Name, inherits, scripts, methods), `layers.json` (`frameStrata`, `drawLayers`).

Beispiele: `plugins/vanilla-1.12`, `plugins/classicapi-1.12`, `plugins/retail`.

## English

A plugin is a folder with `manifest.json` and data files (file names only, no paths).

Required manifest fields: `schema` (1), `id` (`a-z0-9.-`), `version` (X.Y.Z), `name`, `description` (`LocalizedText`, `en` required, `de` recommended), `author`, `license`, `luaVersion` (`5.0`|`5.1`), `syntax` (`lua50`|`lua51-transpiled`|`lua51`), `scriptArgs` (`globals`|`arguments`|`both`), `files`.
Optional: `clientBuild`, `interfaceVersion`, `extends` (list of plugin ids), `removes` (`functions`, `events`, `widgets`), `sources` (title, URL, license).

Files: `functions.json` (name, system, params, returns, description), `events.json` (UPPER_SNAKE_CASE name, payload), `widgets.json` (name, inherits, scripts, methods), `layers.json` (`frameStrata`, `drawLayers`).

Examples: `plugins/vanilla-1.12`, `plugins/classicapi-1.12`, `plugins/retail`.
