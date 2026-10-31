/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] renderCodeView ... Editor mit Einfärbung, Zeilennummern, Vorschlägen, Parameterhilfe, Problemen
 *
 * DE: Abhängigkeitsfreier Editor: eine transparente textarea liegt über einer eingefärbten
 *     Kopie des Textes. (Monaco kann später als Adapter ergänzt werden.)
 * EN: dependency-free editor: a transparent textarea sits on top of a colored copy of the text.
 *     (Monaco can be added later as an adapter.)
 */

import { realLua50Syntax } from "./real-lua.js";
import { checkSource, completeAt, highlightLua, highlightXml, parseXml, signatureAt, toHtml, type Completion, type Diagnostic } from "../src/index.js";
import { clear, h } from "./dom.js";
import type { Ctx } from "./ctx.js";

// ===== [S1] renderCodeView =====

export function renderCodeView(root: HTMLElement, ctx: Ctx, path: string): void {
  clear(root);
  const file = ctx.project.getFile(path);
  if (!file) return;
  const kind = file.kind;

  const hl = h("pre", { class: "code-hl", "aria-hidden": "true" });
  const ta = h("textarea", { class: "code-ta", spellcheck: false, autocapitalize: "off", autocomplete: "off", wrap: "off", "aria-label": path });
  ta.value = file.content;
  const scroller = h("div", { class: "code-scroll" }, hl, ta);
  const gutter = h("div", { class: "code-gutter", "aria-hidden": "true" });
  const popup = h("div", { class: "completion", role: "listbox", hidden: true });
  const sig = h("div", { class: "sigbar" });
  const problems = h("ul", { class: "problems", "aria-label": ctx.t("editor.problems") });
  const body = h("div", { class: "code-body" }, gutter, scroller, popup);
  root.append(body, sig, problems);

  let diags: Diagnostic[] = [];
  let items: Completion[] = [];
  let sel = 0;
  let from = 0;

  const lineHeight = (): number => parseFloat(getComputedStyle(ta).lineHeight) || 20;
  const charWidth = (): number => {
    const probe = h("span", { style: { visibility: "hidden", position: "absolute", whiteSpace: "pre" }, text: "0000000000" });
    scroller.append(probe);
    const w = probe.getBoundingClientRect().width / 10;
    probe.remove();
    return w || 8;
  };

  function paint(): void {
    const text = ta.value;
    const spans = kind === "lua" ? highlightLua(text) : kind === "xml" ? highlightXml(text) : [{ cls: "txt" as const, text }];
    hl.innerHTML = toHtml(spans) + "\n";
    const n = text.split("\n").length;
    const marks = new Map<number, Diagnostic>();
    for (const d of diags) if (!marks.has(d.line) || d.severity === "error") marks.set(d.line, d);
    clear(gutter);
    for (let i = 1; i <= n; i++) {
      const d = marks.get(i);
      gutter.append(h("div", { class: `ln${d ? " " + d.severity : ""}`, title: d ? ctx.text(d.message) : undefined, text: String(i) }));
    }
    ta.style.height = `${hl.offsetHeight}px`;
    ta.style.width = `${Math.max(scroller.clientWidth, hl.scrollWidth)}px`;
  }

  function renderProblems(): void {
    clear(problems);
    if (diags.length === 0) problems.append(h("li", { class: "ok", text: ctx.t("editor.noProblems") }));
    for (const d of diags) {
      problems.append(h("li", { class: d.severity, onclick: () => gotoLine(d.line) }, h("span", { class: "sev", text: d.severity === "error" ? "✖" : d.severity === "warning" ? "⚠" : "ℹ" }), ` ${ctx.t("editor.line")} ${d.line}: ${ctx.text(d.message)}`));
    }
  }

  function analyze(): void {
    const text = ta.value;
    if (kind === "lua") diags = checkSource(text, ctx.target, path);
    else if (kind === "xml") {
      diags = [];
      try {
        parseXml(text);
      } catch (e) {
        const msg = (e as Error).message;
        const line = Number(/line (\d+)/.exec(msg)?.[1] ?? 1);
        diags.push({ severity: "error", line, code: "LUA_SYNTAX", message: { en: msg, de: msg } });
      }
    } else diags = [];
    renderProblems();
    if (kind === "lua" && ctx.settings.realLua && ctx.target.luaVersion === "5.0" && ctx.target.syntax === "lua50") {
      const snapshot = text;
      void realLua50Syntax(text, path).then((real) => {
        if (!real || ta.value !== snapshot || diags.some((d) => d.code === "LUA_SYNTAX" && d.line === real.line)) return;
        diags.push({ severity: "error", line: real.line, code: "LUA_SYNTAX", message: { en: `Lua 5.0 VM: ${real.message}`, de: `Lua-5.0-VM: ${real.message}` } });
        renderProblems();
        paint();
      });
    }
    paint();
  }

  function gotoLine(line: number): void {
    const lines = ta.value.split("\n");
    let pos = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i]!.length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    scroller.scrollTop = Math.max(0, (line - 3) * lineHeight());
  }

  function closePopup(): void {
    popup.hidden = true;
    items = [];
  }

  function showPopup(force = false): void {
    if (kind !== "lua") return closePopup();
    const cur = ta.selectionStart;
    const r = completeAt(ta.value, cur, ctx.target);
    const typed = ta.value.slice(r.from, cur);
    if (r.items.length === 0 || (!force && typed === "" && !/[.:"']$/.test(ta.value.slice(0, cur)))) return closePopup();
    if (!force && r.items.length === 1 && r.items[0]!.label === typed) return closePopup();
    items = r.items.slice(0, 40);
    from = r.from;
    sel = 0;
    renderPopup();
    const before = ta.value.slice(0, cur).split("\n");
    const row = before.length - 1;
    const col = before[before.length - 1]!.length;
    popup.style.left = `${gutter.offsetWidth + 8 + col * charWidth() - scroller.scrollLeft}px`;
    popup.style.top = `${(row + 1) * lineHeight() + 6 - scroller.scrollTop}px`;
    popup.hidden = false;
  }

  function renderPopup(): void {
    clear(popup);
    items.forEach((it, i) => {
      const row = h("div", { class: `item${i === sel ? " sel" : ""}`, role: "option", onmousedown: (e: Event) => { e.preventDefault(); sel = i; accept(); } },
        h("span", { class: `k k-${it.kind}`, text: it.kind[0]!.toUpperCase() }), h("span", { class: "label", text: it.label }), it.detail ? h("span", { class: "detail", text: it.detail }) : null);
      popup.append(row);
      if (i === sel) row.scrollIntoView({ block: "nearest" });
    });
    const d = items[sel]?.doc;
    if (d) popup.append(h("div", { class: "doc", text: ctx.text(d) }));
  }

  function accept(): void {
    const it = items[sel];
    if (!it) return;
    const cur = ta.selectionStart;
    ta.setRangeText(it.insert, from, cur, "end");
    closePopup();
    onInput();
  }

  function updateSignature(): void {
    clear(sig);
    if (kind !== "lua") return;
    const s = signatureAt(ta.value, ta.selectionStart, ctx.target);
    if (!s) return;
    const m = /^(.*?\()(.*)(\))$/.exec(s.label);
    if (!m) {
      sig.append(s.label);
      return;
    }
    const parts = m[2]!.split(", ");
    sig.append(m[1]!);
    parts.forEach((p, i) => {
      sig.append(h("span", { class: i === s.activeParam ? "active" : "", text: p }));
      if (i < parts.length - 1) sig.append(", ");
    });
    sig.append(m[3]!);
    if (s.doc) sig.append(h("span", { class: "sigdoc", text: "  —  " + ctx.text(s.doc) }));
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  function onInput(): void {
    ctx.project.updateFile(path, ta.value);
    ctx.save();
    paint();
    if (timer) clearTimeout(timer);
    timer = setTimeout(analyze, 250);
    updateSignature();
  }

  ta.addEventListener("input", () => {
    onInput();
    showPopup();
  });
  ta.addEventListener("click", () => {
    closePopup();
    updateSignature();
  });
  ta.addEventListener("keyup", (e) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      closePopup();
      updateSignature();
    }
  });
  ta.addEventListener("blur", () => setTimeout(closePopup, 120));
  ta.addEventListener("keydown", (e) => {
    if (!popup.hidden) {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % items.length; renderPopup(); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; renderPopup(); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); accept(); return; }
      if (e.key === "Escape") { e.preventDefault(); closePopup(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "Space") { e.preventDefault(); showPopup(true); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); ctx.saveNow(); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      ta.setRangeText(" ".repeat(ctx.settings.tabWidth), ta.selectionStart, ta.selectionEnd, "end");
      onInput();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pos = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
      const line = ta.value.slice(lineStart, pos);
      const indent = /^\s*/.exec(line)![0];
      const more = /(\bthen|\bdo|\)|\belse|\brepeat|\{)\s*$/.test(line) && /(\bthen|\bdo|\belse|\brepeat|\{|\bfunction\b.*\))\s*$/.test(line) ? " ".repeat(ctx.settings.tabWidth) : "";
      ta.setRangeText("\n" + indent + more, pos, ta.selectionEnd, "end");
      onInput();
    }
  });
  scroller.addEventListener("scroll", () => {
    gutter.scrollTop = scroller.scrollTop;
    closePopup();
  });

  analyze();
  updateSignature();
}
