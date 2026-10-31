# Spike: echtes Lua 5.0 als WASM · real Lua 5.0 as WASM

## Inhalt · Contents
1. [Deutsch](#deutsch)
2. [English](#english)

## Deutsch
**Ergebnis: funktioniert.** Lua 5.0 (Tag `v5.0` aus `github.com/lua/lua`; 5.0.3 ist dort nicht getaggt) lässt sich mit clang und selbst gebauter wasi-libc nach WASM (~200 KB) übersetzen und läuft in Node (`node run.mjs`). Getestet: `print`, `table.getn`, `math.mod`, `string.gfind`, `string.format`, `error`/`pcall`-Pfade, und `#"x"` ist wie in echtem 5.0 ein Syntaxfehler.
Stolpersteine: (1) `compiler-rt` fehlt, daher `rt_shim.c` mit `__multi3`; (2) `setjmp` wird mit den Hilfen `saveSetjmp`/`testSetjmp`/`getTempRet0` gebunden, die `run.mjs` im Host bereitstellt; (3) 5.0 statt 5.0.3 (Fehlerkorrekturen fehlen).
**Wichtigster Fund:** Die echte 5.0-Fehlermeldung lautet ``attempt to index local `t' (a nil value)``, unser Interpreter meldet bisher 5.1-Stil `(local 't')`.
Bauen: `./build.sh` (braucht Netz für GitHub), Test: `node run.mjs`. Die Datei `lua50.wasm` wird nicht eingecheckt.
Nächster Schritt (offen): als `RuntimeFactory` hinter dem bestehenden Interface einhängen, Host-API (WoW-Funktionen) per C-Callbacks anbinden.

## English
**Result: works.** Lua 5.0 (tag `v5.0` from `github.com/lua/lua`; 5.0.3 is not tagged there) compiles with clang and a self-built wasi-libc to WASM (~200 KB) and runs in Node (`node run.mjs`). Tested: `print`, `table.getn`, `math.mod`, `string.gfind`, `string.format`, `error`/`pcall` paths, and `#"x"` is a syntax error exactly like real 5.0.
Pitfalls: (1) `compiler-rt` is missing, hence `rt_shim.c` with `__multi3`; (2) `setjmp` links against `saveSetjmp`/`testSetjmp`/`getTempRet0`, which `run.mjs` provides on the host; (3) 5.0 instead of 5.0.3 (bug fixes missing).
**Key finding:** the real 5.0 error message is ``attempt to index local `t' (a nil value)``, while our interpreter currently uses 5.1 style `(local 't')`.
Build: `./build.sh` (needs GitHub access), test: `node run.mjs`. `lua50.wasm` is not checked in.
Next step (open): plug in as a `RuntimeFactory` behind the existing interface and bind the host API (WoW functions) via C callbacks.
