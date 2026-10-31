/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * ## Author: Lacustat
 *
 * Inhalt · Contents
 *  1. Plugin-Index · plugin index
 *  2. UI-Schlüssel · UI keys
 *  3. Dateikopf · file headers
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

test("plugins/index.json lists exactly the plugin directories", () => {
  const idx: string[] = JSON.parse(read("plugins/index.json"));
  const dirs = readdirSync(path.join(root, "plugins"), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual([...idx].sort(), dirs.sort());
  for (const id of idx) assert.ok(existsSync(path.join(root, "plugins", id, "manifest.json")), id);
});

test("every t(\"…\") key used in web/*.ts exists in all locales", () => {
  const locales = JSON.parse(read("src/locales/index.json")) as string[];
  const files = readdirSync(path.join(root, "web")).filter((f) => f.endsWith(".ts"));
  const keys = new Set<string>();
  for (const f of files) {
    for (const m of read("web/" + f).matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) keys.add(m[1]!);
  }
  assert.ok(keys.size > 20);
  for (const loc of locales) {
    const dict = JSON.parse(read(`src/locales/${loc}.json`)) as Record<string, string>;
    const missing = [...keys].filter((k) => !(k in dict));
    assert.deepEqual(missing, [], `missing in ${loc}`);
  }
});

test("web/*.ts have SPDX header, Lacustat author and a contents index", () => {
  for (const f of readdirSync(path.join(root, "web")).filter((x) => x.endsWith(".ts"))) {
    const head = read("web/" + f).slice(0, 1200);
    assert.match(head, /SPDX-License-Identifier: GPL-3\.0-or-later/, f);
    assert.match(head, /Lacustat/, f);
    assert.match(head, /INHALT \/ CONTENTS|Inhalt · Contents/, f);
  }
});
