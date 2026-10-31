# Lua 5.1 runtime (WASM) · Lua-5.1-Laufzeit (WASM)

## Inhalt · Contents
1. Zweck · Purpose
2. Bauen · Build

## 1. Zweck · Purpose
DE: Echte Lua-5.1-VM (Tag `v5.1` von lua/lua) als WebAssembly, für das Ziel Retail. Gleiche Schnittstelle wie `runtimes/lua50` (`fw_host.c` ist dort abgeleitet; ClassicAPI-Anpassungen entfallen). `lua51.wasm` (~210 KB) ist eingecheckt.
EN: Real Lua 5.1 VM (tag `v5.1` of lua/lua) as WebAssembly, for the Retail target. Same interface as `runtimes/lua50` (`fw_host.c` is derived from it; the ClassicAPI tweaks are dropped). `lua51.wasm` (~210 KB) is checked in.

## 2. Bauen · Build
`./build.sh [workdir]` — clang ≥ 18 (wasm32-wasi), cmake, ninja; lädt Lua 5.1 von GitHub. Lua is MIT-licensed (© Tecgraf, PUC-Rio).
