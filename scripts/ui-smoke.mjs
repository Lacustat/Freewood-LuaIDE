/*
 * SPDX-License-Identifier: GPL-3.0-only
 * ## Author: Lacustat
 *
 * Inhalt · Contents
 *  1. Zweck · Purpose
 *  2. Ablauf · Flow
 *
 * 1. Zweck · Purpose
 *   DE: UI-Rauchtest mit Playwright/Chromium. Bedient die echte Oberfläche und
 *       bricht mit Exit-Code 1 ab, wenn eine Prüfung oder die Konsole Fehler zeigt.
 *       Voraussetzung: `npm run build`, `node scripts/serve.mjs 8123`, Playwright.
 *   EN: UI smoke test with Playwright/Chromium. Drives the real UI and exits with
 *       code 1 on any failed check or console error.
 *       Needs: `npm run build`, `node scripts/serve.mjs 8123`, Playwright.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const url = process.argv[2] ?? "http://127.0.0.1:8123/";
const errors = [];
const fails = [];
const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) fails.push(msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".topbar");

// Editor: typing + problems
await page.click(".code-input, textarea");
await page.keyboard.press("Control+A");
await page.keyboard.type("local x = \nprint(");
await page.waitForTimeout(300);
check((await page.locator(".problems").innerText()).length > 0, "editor shows problems for broken code");
await page.keyboard.press("Control+A");
await page.keyboard.type("local t = {}\ntable.in");
await page.waitForTimeout(300);
check(await page.locator(".completion, .complete-list, .popup").count() > 0, "completion popup appears");
await page.keyboard.press("Escape");

// Language switch
await page.selectOption(".topbar select >> nth=1", "de");
await page.waitForTimeout(200);
check((await page.locator(".topbar").innerText()).includes("Sprache"), "language switch to German");
await page.selectOption(".topbar select >> nth=1", "en");

// Target switch
const opts = await page.$$eval(".topbar select >> nth=0 >> option", (o) => o.map((x) => x.value)).catch(() => []);
for (const id of ["classicapi-1.12", "retail", "vanilla-1.12"]) {
  await page.selectOption(".topbar select >> nth=0", id);
  await page.waitForTimeout(150);
}
check(true, "target switch without error (" + opts.length + " targets)");

// Files
await page.fill(".sidebar input[placeholder]", "extra.lua");
await page.click(".sidebar button:has-text('+')");
check(await page.locator("text=extra.lua").count() > 0, "new file appears");

// Forms
await page.click("text=ui.fwform");
await page.waitForSelector(".form-screen");
check(await page.locator(".forms-props").count() > 0, "forms editor opens");

// Graph
await page.click("text=welcome.fwgraph");
await page.waitForSelector(".graph-board");
check(await page.locator("svg.graph-board").count() > 0, "graph board opens");

// Simulation
await page.click("#tab-sim");
await page.waitForSelector(".sim-log .log-line");
check(await page.locator(".sim-log .log-line").count() > 3, "simulation logs lines");

check(errors.length === 0, "no console errors " + JSON.stringify(errors));
await browser.close();
process.exit(fails.length ? 1 : 0);
