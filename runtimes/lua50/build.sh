#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later  Copyright (C) 2026 Lacustat
# INHALT / CONTENTS
#  1. wasi-libc bauen · build wasi-libc   2. Lua 5.0 holen · fetch Lua 5.0   3. nach WASM kompilieren · compile to WASM
# Braucht · needs: clang (wasm32 target), wasm-ld, llvm-ar, cmake, ninja, git
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; work="${1:-$here/.build}"; mkdir -p "$work"; cd "$work"
[ -d wasi-libc ] || git clone -q --depth 1 https://github.com/WebAssembly/wasi-libc
[ -d lua50 ] || git clone -q --depth 1 --branch v5.0 https://github.com/lua/lua lua50
if [ ! -f wasi-libc/build/sysroot/lib/wasm32-wasi/libc.a ]; then
  mkdir -p wasi-libc/build && (cd wasi-libc/build && cmake .. -G Ninja -DCMAKE_C_COMPILER=clang -DCMAKE_AR=/usr/bin/llvm-ar \
    -DCMAKE_C_COMPILER_TARGET=wasm32-wasi -DCMAKE_SYSTEM_NAME=WASI -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY -DTARGET_TRIPLE=wasm32-wasi >/dev/null && ninja >/dev/null)
fi
# ClassicAPI-Patch (Strings-Methoden, 60 Upvalues, Schleifenvariable je Durchlauf) idempotent anwenden · apply idempotently
if ! git -C lua50 apply --check -R "$here/patches/classicapi.patch" >/dev/null 2>&1; then git -C lua50 apply "$here/patches/classicapi.patch"; fi
SR="$work/wasi-libc/build/sysroot"; files=""
for s in lapi lcode ldebug ldo ldump lfunc lgc llex lmem lobject lopcodes lparser lstate lstring ltable ltm lundump lvm lzio lauxlib lbaselib lmathlib lstrlib ltablib; do files="$files lua50/$s.c"; done
clang --target=wasm32-wasi --sysroot="$SR" -O2 -Ilua50 -mexception-handling -mllvm -wasm-enable-sjlj -D_WASI_EMULATED_SIGNAL \
  -nostartfiles -nodefaultlibs -Wl,--no-entry -Wl,--export=realloc $files "$here/fw_host.c" "$here/rt_shim.c" -o "$here/lua50.wasm" -lc -lsetjmp
echo "built $here/lua50.wasm"
