/* SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 * INHALT / CONTENTS: Testlauf der Lua-5.0-WASM-Laufzeit · test run of the Lua 5.0 WASM runtime
 * Setjmp-Hilfen (saveSetjmp/testSetjmp/getTempRet0) siehe unten · setjmp helpers see below */
import { readFileSync } from "node:fs";
import { WASI } from "node:wasi";
const wasi = new WASI({ version: "preview1" });
const mod = await WebAssembly.compile(readFileSync(new URL("./lua50.wasm", import.meta.url)));
let ex, setjmpId = 0, tempRet0 = 0;
const env = {
  getTempRet0: () => tempRet0,
  saveSetjmp(envp, label, table, size) {
    const H = new Int32Array(ex.memory.buffer);
    setjmpId++; H[envp >> 2] = setjmpId;
    for (let i = 0; i < size; i++) {
      const o = (table >> 2) + (i << 1);
      if (H[o] === 0) { H[o] = setjmpId; H[o + 1] = label; H[o + 2] = 0; tempRet0 = size; return table; }
    }
    const nsize = size * 2; const nt = ex.realloc(table, 8 * (nsize + 1));
    const r = env.saveSetjmp(envp, label, nt, nsize); tempRet0 = nsize; return r;
  },
  testSetjmp(id, table, size) {
    const H = new Int32Array(ex.memory.buffer);
    for (let i = 0; i < size; i++) { const o = (table >> 2) + (i << 1); const cur = H[o]; if (cur === 0) break; if (cur === id) return H[o + 1]; }
    return 0;
  },
};
const inst = await WebAssembly.instantiate(mod, { ...wasi.getImportObject(), env });
ex = inst.exports;
wasi.initialize(inst); // reactor
const x = inst.exports;
function run(code) {
  const bytes = new TextEncoder().encode(code + "\0");
  const p = x.fw_alloc(bytes.length);
  new Uint8Array(x.memory.buffer, p, bytes.length).set(bytes);
  const st = x.fw_run(p);
  const o = x.fw_out(); const m = new Uint8Array(x.memory.buffer);
  let e = o; while (m[e]) e++;
  return { st, out: new TextDecoder().decode(m.subarray(o, e)) };
}
x.fw_open();
for (const c of [
  'print("hello", 1+2, 10/4)',
  'print(table.getn({1,2,3}), math.mod(7,3), string.gsub("abc","b","X"))',
  'for w in string.gfind("a b c","%a") do print(w) end',
  'print(#"x")',
  'local t = nil; print(t.x)',
  'error("boom")',
  'print(string.format("%5.2f|%d|%s", 3.14159, 42, "z"))',
]) console.log(JSON.stringify(c) + " => " + JSON.stringify(run(c)));
