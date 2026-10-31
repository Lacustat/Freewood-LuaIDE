# Lua 5.0 runtime (WASM) · Lua-5.0-Laufzeit (WASM)

## Inhalt · Contents
1. Zweck · Purpose
2. Dateien · Files
3. Bauen · Build
4. Host-Protokoll · Host protocol

## 1. Zweck · Purpose
DE: Echte Lua-5.0-VM (Tag `v5.0` von lua/lua), als WebAssembly gebaut. Sie dient als Referenz ("Orakel") für den eigenen Interpreter und prüft im Editor die Syntax so wie das Spiel. `lua50.wasm` (~206 KB) ist eingecheckt.
EN: Real Lua 5.0 VM (tag `v5.0` of lua/lua) built as WebAssembly. It is the reference ("oracle") for our own interpreter and checks syntax in the editor like the game does. `lua50.wasm` (~206 KB) is checked in.

## 2. Dateien · Files
- `fw_host.c` – Host-Wrapper (Ein-/Ausgabepuffer, Aufrufbrücke, Befehlslimit) · host wrapper
- `rt_shim.c` – `__multi3` (kein compiler-rt) · `__multi3` (no compiler-rt)
- `build.sh` – Build-Skript · build script
- `lua50.wasm` – Ergebnis · result
- Lua is MIT-licensed (© Tecgraf, PUC-Rio), see NOTICE.md.

## 3. Bauen · Build
`./build.sh [workdir]` — clang ≥ 18 (wasm32-wasi), wasi-libc, cmake, ninja; lädt Lua 5.0 von GitHub.

## 4. Host-Protokoll · Host protocol
DE: 64-KB-Puffer; Werte-Tags 0 nil, 1 bool, 2 double, 3 string (u32 Länge), 4 anderer Typ; `host_call(name,len)`; negative Rückgabe = Fehlertext. Befehlslimit über `lua_sethook` (Standard 20 Mio.).
EN: 64 KB buffer; value tags 0 nil, 1 bool, 2 double, 3 string (u32 length), 4 other type; `host_call(name,len)`; negative return = error text. Instruction limit via `lua_sethook` (default 20M).
