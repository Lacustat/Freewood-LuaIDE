/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Aufruf · usage ...... node scripts/sim-coverage.mjs [vanilla-1.12|classicapi-1.12|retail] [--names]
 *
 * DE: Ruft jede API-Funktion der Plugin-Daten einmal ohne Argumente (geschützt) auf und zählt,
 *     welche die Warnung "nicht simuliert" auslösen. Nach `npm run build` ausführen.
 * EN: calls every API function from the plugin data once without arguments (protected) and counts
 *     those that raise the "not simulated" warning. Run after `npm run build`.
 */
import { join } from "node:path";
import { Kernel, WowSim } from "../dist/src/index.js";
import { loadPluginsFromRoot } from "../dist/src/node/fs-loaders.js";

const id = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "classicapi-1.12";
const k = new Kernel();
const { plugins } = await loadPluginsFromRoot(join(process.cwd(), "plugins"));
plugins.forEach((p) => k.plugins.register(p));
const target = k.plugins.resolve(id);
const names = [...target.functions.keys()].filter((n) => !/^(coroutine|math|string|table)\./.test(n) && n !== "C_Timer.After");
const missing = [];
for (const n of names) {
  const sim = new WowSim(target);
  const path = n.split(".").map((p) => `[${JSON.stringify(p)}]`).join("");
  sim.exec(n.includes(".") ? `local f=_G${path.replace(/^\[("[^"]+")\]/, "[$1]")}; if f then pcall(f) end` : `if ${n} then pcall(${n}) end`);
  if (process.env.DBG && n==process.env.DBG) console.log(sim.log);
  if (sim.log.some((l) => l.kind === "warn" && l.text.includes("not simulated"))) missing.push(n);
}
const groups = {};
for (const n of missing) (groups[n.includes(".") ? n.split(".")[0] : "_global"] ||= []).push(n);
console.log(`${id}: ${missing.length} of ${names.length} not simulated`);
for (const [g, v] of Object.entries(groups).sort()) console.log(`${g} (${v.length})${process.argv.includes("--names") ? ": " + v.join(" ") : ""}`);
