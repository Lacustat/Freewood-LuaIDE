/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Hilfen · helpers ........... Argumente, Ziel, Laden · args, target, loading
 *   [S2] fw check ................... Syntax und API-Prüfung · syntax and API check
 *   [S3] fw run ..................... Addon in der Simulation ausführen · run an addon in the simulation
 *   [S4] fw targets / windows ....... Listen · lists
 *   [S5] main ....................... Einstieg · entry
 *
 * DE: Kommandozeile für Menschen und andere Chats: kurze, feste Ausgabe (oder --json). Gleiche Engines wie die Web-IDE.
 * EN: command line for people and other chats: short, stable output (or --json). Same engines as the web IDE.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { Kernel, WowSim, createWasmEngine, realVmVersion, supportsRealVm, checkSource, type ResolvedTarget } from "../index.js";
import { WINDOW_NAMES } from "../sim/extras.js";
import { loadPluginsFromRoot } from "./fs-loaders.js";

// ===== [S1] Hilfen · helpers =====

const ROOT = resolve(new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
interface Args { cmd: string; pos: string[]; opt: Record<string, string | true> }
function parseArgs(argv: string[]): Args {
  const pos: string[] = []; const opt: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) { const k = a.slice(2); const n = argv[i + 1]; if (n !== undefined && !n.startsWith("--")) { opt[k] = n; i++; } else opt[k] = true; }
    else pos.push(a);
  }
  return { cmd: pos.shift() ?? "help", pos, opt };
}
const TARGET_ALIAS: Record<string, string> = { vanilla: "vanilla-1.12", classic: "classicapi-1.12", classicapi: "classicapi-1.12", octowow: "classicapi-1.12", turtle: "classicapi-1.12", retail: "retail" };

async function loadTarget(name: string): Promise<ResolvedTarget> {
  const k = new Kernel();
  const { plugins } = await loadPluginsFromRoot(join(ROOT, "plugins"));
  plugins.forEach((p) => k.plugins.register(p));
  return k.plugins.resolve(TARGET_ALIAS[name] ?? name);
}

interface AddonFiles { name: string; dir: string; lua: { file: string; code: string }[]; skipped: string[] }
function loadAddon(path: string): AddonFiles {
  const dir = statSync(path).isDirectory() ? resolve(path) : resolve(path, "..");
  const tocs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".toc"));
  const name = tocs[0] ? basename(tocs[0], ".toc") : basename(dir);
  const lua: AddonFiles["lua"] = []; const skipped: string[] = [];
  if (statSync(path).isFile()) return { name, dir, lua: [{ file: basename(path), code: readFileSync(path, "utf8") }], skipped };
  if (tocs[0]) {
    for (const raw of readFileSync(join(dir, tocs[0]), "utf8").split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith("#")) continue;
      const f = l.replace(/\\/g, "/");
      if (f.toLowerCase().endsWith(".lua") && existsSync(join(dir, f))) lua.push({ file: f, code: readFileSync(join(dir, f), "utf8") });
      else if (f.toLowerCase().endsWith(".xml")) skipped.push(f);
    }
  } else for (const f of readdirSync(dir).filter((x) => x.endsWith(".lua")).sort()) lua.push({ file: f, code: readFileSync(join(dir, f), "utf8") });
  return { name, dir, lua, skipped };
}
const L = (t: unknown): string => (typeof t === "string" ? t : ((t as { en?: string })?.en ?? JSON.stringify(t)));
const out = (a: Args, human: string[], data: unknown): void => { console.log(a.opt.json ? JSON.stringify(data, null, 1) : human.join("\n")); };

// ===== [S2] fw check =====

async function cmdCheck(a: Args): Promise<number> {
  const path = a.pos[0]; if (!path) { console.error("usage: fw check <addon-dir|file.lua> [--target classicapi|vanilla|retail]"); return 2; }
  const target = await loadTarget(String(a.opt.target ?? "classicapi"));
  const addon = loadAddon(path);
  const rows: { file: string; line: number; sev: string; code: string; msg: string }[] = [];
  for (const f of addon.lua) for (const d of checkSource(f.code, target, f.file)) rows.push({ file: f.file, line: d.line, sev: d.severity, code: d.code, msg: L(d.message) });
  const errs = rows.filter((r) => r.sev === "error").length;
  const human = [`check ${addon.name} · target ${target.id} · ${addon.lua.length} lua file(s)${addon.skipped.length ? ` · xml not run: ${addon.skipped.join(", ")}` : ""}`,
    ...rows.map((r) => `${r.sev.toUpperCase().padEnd(7)} ${r.file}:${r.line} ${r.code} ${r.msg}`), rows.length ? `${errs} error(s), ${rows.length - errs} other` : "OK: no findings"];
  out(a, human, { addon: addon.name, target: target.id, findings: rows });
  return errs ? 1 : 0;
}

// ===== [S3] fw run =====

async function cmdRun(a: Args): Promise<number> {
  const path = a.pos[0]; if (!path) { console.error("usage: fw run <addon-dir|file.lua> [--target ..] [--engine wasm|interp] [--open mail,auction] [--event NAME[:arg,..]] [--cmd \"/slash\"] [--advance 5] [--eval \"lua\"] [--frames] [--json]"); return 2; }
  const target = await loadTarget(String(a.opt.target ?? "classicapi"));
  const addon = loadAddon(path);
  let sim: WowSim;
  if (a.opt.engine === "interp" || !supportsRealVm(target)) sim = new WowSim(target);
  else {
    const v = realVmVersion(target) === "5.1" ? "5.1" : "5.0";
    const bytes = readFileSync(join(ROOT, v === "5.1" ? "runtimes/lua51/lua51.wasm" : "runtimes/lua50/lua50.wasm"));
    sim = new WowSim(target, undefined, await createWasmEngine(() => Promise.resolve(bytes), target.syntax === "lua51-transpiled", realVmVersion(target)));
  }
  for (const f of addon.lua) sim.loadSource(f.code, f.file, addon.name);
  sim.login(addon.name);
  sim.advance(Number(a.opt["advance-login"] ?? 1));
  const steps: string[] = [];
  for (const w of String(a.opt.open ?? "").split(",").filter(Boolean)) { const ok = w === "merchant" ? (sim.openMerchant(), true) : sim.openWindow(w); steps.push(`open ${w}: ${ok ? "ok" : "unknown window"}`); sim.advance(1); }
  for (const e of [].concat(a.opt.event ? (String(a.opt.event).split(";") as never[]) : [])) { const [n, args] = String(e).split(":"); sim.fireEvent(n!, ...(args ? args.split(",").map((x) => (x !== "" && !isNaN(Number(x)) ? Number(x) : x)) : [])); steps.push(`event ${n}`); sim.advance(0.5); }
  if (a.opt.cmd) for (const c of String(a.opt.cmd).split(";")) { steps.push(`slash ${c.trim()}: ${sim.runSlash(c.trim()) ? "handled" : "no handler"}`); sim.advance(0.5); }
  let evalOut: unknown;
  if (a.opt.eval) { const r = sim.exec(String(a.opt.eval)); evalOut = r.ok ? r.values : `ERROR ${r.error?.message}`; steps.push(`eval: ${JSON.stringify(evalOut)}`); }
  sim.advance(Number(a.opt.advance ?? 2));
  const log = sim.log.filter((l) => a.opt.verbose || l.kind !== "event");
  const errors = log.filter((l) => l.kind === "error").length;
  const notes = log.filter((l) => l.kind === "info" || l.kind === "warn");
  const snap = sim.snapshot();
  const human = [`run ${addon.name} · target ${target.id} · engine ${a.opt.engine === "interp" || !supportsRealVm(target) ? "interpreter" : "real Lua VM"} · ${addon.lua.length} lua file(s)${addon.skipped.length ? ` · xml not run: ${addon.skipped.join(", ")}` : ""}`,
    ...steps,
    `-- log (${log.length} lines, ${errors} error(s), ${notes.length} note(s)) --`,
    ...log.slice(0, Number(a.opt.max ?? 80)).map((l) => `[${l.t.toFixed(2)}] ${l.kind.toUpperCase()} ${l.text}`),
    log.length > Number(a.opt.max ?? 80) ? `... ${log.length - Number(a.opt.max ?? 80)} more (use --max N)` : "",
    `-- frames: ${snap.length} total, ${snap.filter((n) => n.visible).length} visible --`,
    ...(a.opt.frames ? snap.filter((n) => n.name).map((n) => `${n.kind} ${n.name}${n.visible ? "" : " (hidden)"}${n.text ? ` "${n.text}"` : ""}`) : []),
    errors ? "RESULT: errors" : "RESULT: ok"].filter((x) => x !== "");
  out(a, human, { addon: addon.name, target: target.id, steps, log, frames: a.opt.frames ? snap : snap.length, errors });
  return errors ? 1 : 0;
}

// ===== [S4] fw targets / windows =====

async function cmdTargets(a: Args): Promise<number> {
  out(a, ["vanilla    WoW 1.12 (Lua 5.0)", "classicapi WoW 1.12 + ClassicAPI = OctoWoW/TurtleWoW (Lua 5.1 syntax on 5.0 VM)", "retail     Retail (Lua 5.1)"], Object.values(TARGET_ALIAS));
  return 0;
}
async function cmdWindows(a: Args): Promise<number> { out(a, [[...WINDOW_NAMES, "merchant"].join(", ")], [...WINDOW_NAMES, "merchant"]); return 0; }

// ===== [S5] main =====

async function main(): Promise<number> {
  const a = parseArgs(process.argv.slice(2));
  switch (a.cmd) {
    case "check": return cmdCheck(a);
    case "run": return cmdRun(a);
    case "targets": return cmdTargets(a);
    case "windows": return cmdWindows(a);
    default:
      console.log(["Freewood LUA IDE command line / Kommandozeile", "  fw check <addon> [--target classicapi|vanilla|retail] [--json]", "  fw run <addon> [--target ..] [--engine wasm|interp] [--open mail,merchant] [--event NAME:arg;NAME2] [--cmd \"/slash\"] [--eval \"lua\"] [--advance s] [--frames] [--verbose] [--max N] [--json]", "  fw targets | fw windows", "exit code: 0 ok, 1 findings/errors, 2 usage"].join("\n"));
      return a.cmd === "help" ? 0 : 2;
  }
}
main().then((c) => { process.exitCode = c; }, (e) => { console.error(String((e as Error)?.stack ?? e)); process.exitCode = 3; });
