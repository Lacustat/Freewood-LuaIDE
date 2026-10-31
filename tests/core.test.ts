/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *  [S1] Plugins laden · loading plugins
 *  [S2] Vererbung · inheritance
 *  [S3] i18n
 *  [S4] Projekt · project
 *  [S5] Kernel
 *  [S6] Hygiene
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Kernel, I18n, Project, normalizePath } from "../src/index.js";
import { loadPluginsFromRoot, loadLocalesFromDir } from "../src/node/fs-loaders.js";

const ROOT = process.cwd();

async function kernelWithPlugins(): Promise<Kernel> {
  const k = new Kernel();
  const { plugins, errors } = await loadPluginsFromRoot(join(ROOT, "plugins"));
  assert.deepEqual(errors, []);
  for (const p of plugins) k.plugins.register(p);
  return k;
}

// ===== [S1] Plugins laden · loading plugins =====
test("three sample plugins load and validate without issues", async () => {
  const k = await kernelWithPlugins();
  assert.deepEqual(k.plugins.list().map((m) => m.id).sort(), ["classicapi-1.12", "retail", "vanilla-1.12"]);
  assert.deepEqual(k.plugins.validateAll().filter((i) => i.severity === "error"), []);
});

// ===== [S2] Vererbung · inheritance =====
test("classicapi inherits vanilla and adds functions", async () => {
  const k = await kernelWithPlugins();
  const t = k.plugins.resolve("classicapi-1.12");
  assert.deepEqual(t.chain, ["vanilla-1.12", "classicapi-1.12"]);
  assert.ok(t.functions.has("GetTime"));
  assert.ok(t.functions.has("C_Timer.After"));
  assert.ok(!k.plugins.resolve("vanilla-1.12").functions.has("C_Timer.After"));
  assert.ok(k.plugins.findFunction("classicapi-1.12", "strsplit"));
});

test("widgets merge by union of methods", async () => {
  const k = await kernelWithPlugins();
  const frame = k.plugins.resolve("classicapi-1.12").widgets.get("Frame")!;
  assert.ok(frame.methods.includes("SetPoint"));
  assert.ok(frame.methods.includes("HookScript"));
  assert.ok(k.plugins.resolve("classicapi-1.12").widgets.has("Cooldown"));
});

test("unregister of a base plugin is blocked", async () => {
  const k = await kernelWithPlugins();
  assert.throws(() => k.plugins.unregister("vanilla-1.12"), (e: any) => e.code === "PLG_IN_USE");
});

test("missing base is reported", async () => {
  const k = new Kernel();
  const { plugins } = await loadPluginsFromRoot(join(ROOT, "plugins"));
  const c = plugins.find((p) => p.manifest.id === "classicapi-1.12")!;
  k.plugins.register(c);
  assert.throws(() => k.plugins.resolve("classicapi-1.12"), (e: any) => e.code === "PLG_MISSING_BASE");
});

// ===== [S3] i18n =====
test("i18n locales, fallback and interpolation", async () => {
  const i = new I18n("en");
  const langs = await loadLocalesFromDir(i, join(ROOT, "src", "locales"));
  assert.deepEqual(langs, ["de", "en"]);
  i.setLanguage("de");
  assert.equal(i.t("plugin.loaded", { name: "X" }), "Plugin X geladen");
  i.addCatalog("de-at", { "only.at": "Servus" });
  i.setLanguage("de-at");
  assert.equal(i.t("app.title"), "Freewood LUA IDE");
  assert.throws(() => i.setLanguage("xx"), (e: any) => e.code === "I18N_UNKNOWN_LANG");
});

// ===== [S4] Projekt · project =====
test("project paths, duplicates and roundtrip", () => {
  assert.throws(() => normalizePath("../x.lua"));
  assert.throws(() => normalizePath("/abs.lua"));
  assert.throws(() => normalizePath("C:/x.lua"));
  const p = new Project("Demo", "vanilla-1.12");
  const seen: string[] = [];
  p.events.on("file:added", () => seen.push("added"));
  p.addFile("Core.lua", "print(1)");
  assert.throws(() => p.addFile("core.LUA"), (e: any) => e.code === "FILE_EXISTS");
  p.renameFile("Core.lua", "src/Main.lua");
  assert.ok(p.hasFile("SRC/main.lua"));
  assert.equal(seen.length, 1);
  const copy = Project.parse(p.serialize());
  assert.equal(copy.getFile("src/Main.lua")?.content, "print(1)");
  assert.equal(copy.targetId, "vanilla-1.12");
});

// ===== [S5] Kernel =====
test("kernel creates projects only for known targets", async () => {
  const k = await kernelWithPlugins();
  assert.equal(k.createProject("A", "retail").targetId, "retail");
  assert.throws(() => k.createProject("A", "nope"), (e: any) => e.code === "TARGET_UNKNOWN");
});

// ===== [S6] Hygiene =====
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

test("every source file has SPDX header and contents index", async () => {
  for (const f of (await walk(join(ROOT, "src"))).filter((x) => x.endsWith(".ts"))) {
    const text = await readFile(f, "utf8");
    assert.match(text, /SPDX-License-Identifier: GPL-3\.0-or-later/, f);
    assert.match(text, /INHALT \/ CONTENTS/, f);
    assert.match(text, /Copyright \(C\) 2026 Lacustat/, f);
  }
});

test("author is Lacustat everywhere and no private email appears", async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.author, "Lacustat");
  for (const f of (await walk(join(ROOT, "plugins"))).filter((x) => x.endsWith("manifest.json"))) {
    assert.equal(JSON.parse(await readFile(f, "utf8")).author, "Lacustat", f);
  }
  const files = [...(await walk(join(ROOT, "src"))), ...(await walk(join(ROOT, "plugins"))), ...(await walk(join(ROOT, "tests")))];
  for (const f of files.filter((x) => /\.(ts|json|md)$/.test(x))) {
    const emails = (await readFile(f, "utf8")).match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
    for (const m of emails) assert.equal(m, "Lacustat@users.noreply.github.com", f);
  }
});
