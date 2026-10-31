/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Start · boot ........ Sprachen und Plugins laden, Projekt wiederherstellen
 *   [S2] App ................. Kopfzeile, Dateiliste, Ansichten
 *   [S3] Dateien · files ..... anlegen, löschen, Vorlagen
 */

import { FormModel, Graph, I18n, Kernel, Project, assemblePlugin, kindFromPath, type LocalizedText, type PluginManifest } from "../src/index.js";
import { starterProject, type Ctx } from "./ctx.js";
import { clear, download, h, pickFile, select, toast } from "./dom.js";
import { renderCodeView } from "./editor-view.js";
import { renderFormsView } from "./forms-view.js";
import { renderGraphView } from "./graph-view.js";
import { renderSimView } from "./sim-view.js";

const STORE_PROJECT = "freewood.project.v1";
const STORE_LANG = "freewood.lang";

const safeGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode or blocked storage: the app works without it */
  }
};

// ===== [S1] Start · boot =====

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function boot(): Promise<void> {
  const app = document.getElementById("app")!;
  const kernel = new Kernel();
  const langs = (await fetchJson("../src/locales/index.json")) as string[];
  for (const l of langs) kernel.i18n.addCatalogJson(l, JSON.stringify(await fetchJson(`../src/locales/${l}.json`)));
  const pluginIds = (await fetchJson("../plugins/index.json")) as string[];
  const failed: string[] = [];
  for (const id of pluginIds) {
    try {
      const manifest = await fetchJson(`../plugins/${id}/manifest.json`);
      kernel.plugins.register(await assemblePlugin(manifest, (f) => fetchJson(`../plugins/${id}/${f}`)));
    } catch (e) {
      failed.push(`${id}: ${(e as Error).message}`);
    }
  }
  const saved = safeGet(STORE_LANG);
  const wanted = saved ?? (navigator.language || "en");
  kernel.i18n.setLanguage(kernel.i18n.hasLanguage(wanted) ? wanted : kernel.i18n.hasLanguage(wanted.slice(0, 2)) ? wanted.slice(0, 2) : "en");

  let project: Project;
  const stored = safeGet(STORE_PROJECT);
  try {
    project = stored ? Project.parse(stored) : starterProject("vanilla-1.12", kernel.plugins.resolve("vanilla-1.12"));
  } catch {
    project = starterProject("vanilla-1.12", kernel.plugins.resolve("vanilla-1.12"));
  }
  if (!kernel.plugins.has(project.targetId)) project.targetId = kernel.plugins.list()[0]?.id ?? project.targetId;
  new App(app, kernel, project, failed).render();
}

// ===== [S2] App =====

class App {
  private view: "files" | "sim" = "files";
  private current: string | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private root: HTMLElement, private kernel: Kernel, private project: Project, private failed: string[]) {
    this.current = project.listFiles().find((f) => f.kind === "lua")?.path ?? project.listFiles()[0]?.path;
  }

  private ctx(): Ctx {
    const i18n: I18n = this.kernel.i18n;
    const app = this;
    return {
      kernel: this.kernel,
      project: this.project,
      get target() {
        return app.kernel.plugins.resolve(app.project.targetId);
      },
      t: (k, p) => i18n.t(k, p),
      text: (v) => (v ? i18n.text(v) : ""),
      save: () => this.save(),
      openFile: (p) => {
        this.current = p;
        this.view = "files";
        this.render();
      },
      writeFile: (path, content) => {
        if (this.project.hasFile(path)) this.project.updateFile(path, content);
        else this.project.addFile(path, content);
        this.save();
        this.renderSidebarOnly();
      },
      rerender: () => this.render(),
    };
  }

  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => safeSet(STORE_PROJECT, this.project.serialize()), 300);
  }

  private sidebar?: HTMLElement;

  render(): void {
    const ctx = this.ctx();
    const t = ctx.t;
    clear(this.root);
    document.documentElement.lang = this.kernel.i18n.language;
    document.title = t("app.title");

    const targets = this.kernel.plugins.list().map((m) => ({ value: m.id, label: ctx.text(m.name as LocalizedText) }));
    const header = h("header", { class: "topbar" },
      h("h1", { text: t("app.title") }),
      h("label", { class: "inline-field" }, h("span", { text: t("app.target") }), select(targets, this.project.targetId, (v) => { this.project.targetId = v; this.save(); this.render(); }, { id: "target-select" })),
      h("label", { class: "inline-field" }, h("span", { text: t("app.language") }), select(this.kernel.i18n.languages().map((l) => ({ value: l, label: l.toUpperCase() })), this.kernel.i18n.language, (v) => { this.kernel.i18n.setLanguage(v); safeSet(STORE_LANG, v); this.render(); }, { id: "lang-select" })),
      h("span", { class: "spacer" }),
      h("button", { class: "btn", onclick: () => this.newProject() }, t("app.new")),
      h("button", { class: "btn", onclick: () => this.open() }, t("app.open")),
      h("button", { class: "btn", onclick: () => download(`${this.project.name}.fwproj.json`, this.project.serialize()) }, t("app.saveFile")),
    );

    const tabs = h("nav", { class: "tabs", role: "tablist" },
      h("button", { class: `tab${this.view === "files" ? " active" : ""}`, role: "tab", id: "tab-files", onclick: () => { this.view = "files"; this.render(); } }, t("app.tab.editor")),
      h("button", { class: `tab${this.view === "sim" ? " active" : ""}`, role: "tab", id: "tab-sim", onclick: () => { this.view = "sim"; this.render(); } }, t("app.tab.sim")),
    );

    this.sidebar = h("aside", { class: "sidebar" });
    const main = h("main", { class: "main", id: "main" });
    const errors = this.failed.length ? h("div", { class: "error-box", text: `${t("app.pluginErrors")}: ${this.failed.join("; ")}` }) : null;
    this.root.append(header, ...(errors ? [errors] : []), h("div", { class: "layout" }, this.sidebar, h("div", { class: "content" }, tabs, main)));
    this.renderSidebar(ctx);
    this.renderMain(ctx, main);
  }

  private renderSidebarOnly(): void {
    if (this.sidebar) this.renderSidebar(this.ctx());
  }

  private renderMain(ctx: Ctx, main: HTMLElement): void {
    if (this.view === "sim") return renderSimView(main, ctx);
    const f = this.current ? this.project.getFile(this.current) : undefined;
    if (!f) {
      main.append(h("p", { class: "muted pad", text: ctx.t("app.noFile") }));
      return;
    }
    const body = h("div", { class: "view-body" });
    main.append(h("div", { class: "file-title", text: f.path }), body);
    if (f.kind === "graph") renderGraphView(body, ctx, f.path);
    else if (f.kind === "form") renderFormsView(body, ctx, f.path);
    else renderCodeView(body, ctx, f.path);
  }

  // ===== [S3] Dateien · files =====
  private renderSidebar(ctx: Ctx): void {
    const sb = this.sidebar!;
    clear(sb);
    const name = h("input", { type: "text", value: this.project.name, "aria-label": ctx.t("app.projectName") });
    name.addEventListener("change", () => { this.project.name = name.value.trim() || "MyAddon"; this.save(); });
    sb.append(h("label", { class: "field" }, h("span", { text: ctx.t("app.projectName") }), name));
    const list = h("ul", { class: "files", role: "listbox" });
    const icons: Record<string, string> = { lua: "🌙", xml: "🧩", toc: "📋", graph: "🔀", form: "🪟", text: "📄" };
    for (const f of this.project.listFiles()) {
      list.append(h("li", { class: `file${f.path === this.current ? " active" : ""}`, role: "option", "aria-selected": String(f.path === this.current) },
        h("button", { class: "file-open", onclick: () => { this.current = f.path; this.view = "files"; this.render(); } }, `${icons[f.kind] ?? "📄"} ${f.path}`),
        h("button", { class: "file-act", title: ctx.t("common.rename"), "aria-label": `${ctx.t("common.rename")} ${f.path}`, onclick: () => {
          const to = window.prompt(ctx.t("app.renamePrompt"), f.path);
          if (!to || to === f.path) return;
          try {
            this.project.renameFile(f.path, to);
            if (this.current === f.path) this.current = to;
            this.save();
            this.render();
          } catch (e) {
            toast((e as Error).message, "error");
          }
        } }, "✎"),
        h("button", { class: "file-act", title: ctx.t("common.delete"), "aria-label": `${ctx.t("common.delete")} ${f.path}`, onclick: () => {
          if (!window.confirm(ctx.t("app.deleteConfirm", { file: f.path }))) return;
          this.project.removeFile(f.path);
          if (this.current === f.path) this.current = this.project.listFiles()[0]?.path;
          this.save();
          this.render();
        } }, "🗑")));
    }
    sb.append(list);
    const input = h("input", { type: "text", placeholder: "file.lua", "aria-label": ctx.t("app.newFile"), list: "ext-list" });
    const add = (): void => {
      let p = input.value.trim();
      if (!p) return;
      if (!/\.[A-Za-z0-9]+$/.test(p)) p += ".lua";
      try {
        this.project.addFile(p, this.template(p));
        this.current = p;
        this.view = "files";
        this.save();
        this.render();
      } catch (e) {
        toast((e as Error).message, "error");
      }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    sb.append(h("div", { class: "newfile" }, input, h("button", { class: "btn", onclick: add }, "+")));
    sb.append(h("datalist", { id: "ext-list" }, ...["main.lua", "ui.xml", "logic.fwgraph", "window.fwform", "MyAddon.toc"].map((v) => h("option", { value: v }))));
    sb.append(h("p", { class: "muted small", text: ctx.t("app.fileHint") }));
  }

  private template(path: string): string {
    switch (kindFromPath(path)) {
      case "lua": return `-- ${path}\n`;
      case "graph": return new Graph().serialize();
      case "form": return new FormModel().serialize();
      case "toc": return `## Interface: 11200\n## Title: ${this.project.name}\n## Author: Lacustat\n\n`;
      case "xml": return '<Ui xmlns="http://www.blizzard.com/wow/ui/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.blizzard.com/wow/ui/ ..\\FrameXML\\UI.xsd">\n</Ui>\n';
      default: return "";
    }
  }

  private newProject(): void {
    if (!window.confirm(this.kernel.i18n.t("app.newConfirm"))) return;
    this.project = starterProject(this.project.targetId, this.kernel.plugins.resolve(this.project.targetId));
    this.current = this.project.listFiles().find((f) => f.kind === "lua")?.path;
    this.view = "files";
    this.save();
    this.render();
  }

  private async open(): Promise<void> {
    const f = await pickFile(".json,.fwproj");
    if (!f) return;
    try {
      const p = Project.parse(f.text);
      if (!this.kernel.plugins.has(p.targetId)) throw new Error(`Unknown target '${p.targetId}'`);
      this.project = p;
      this.current = p.listFiles()[0]?.path;
      this.save();
      this.render();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }
}

boot().catch((e) => {
  const app = document.getElementById("app");
  if (app) app.textContent = `Freewood LUA IDE: ${(e as Error).message}`;
  console.error(e);
});

export type { PluginManifest };
