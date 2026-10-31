/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] Typen · Types ............... ProjectFile, ProjectFileKind, SerializedProject, ProjectEvents
 *   [S2] Pfade · Paths ............... normalizePath, kindFromPath
 *   [S3] Project ..................... Dateien verwalten, speichern (serialize) und laden (parse)
 *
 * DE: Ein Projekt ist eine Sammlung virtueller Dateien (Lua, XML, .toc, Graph, Form) für ein Ziel-Plugin.
 *     Pfade verhalten sich wie unter Windows (WoW): Groß-/Kleinschreibung zählt nicht für die Eindeutigkeit.
 * EN: A project is a set of virtual files (Lua, XML, .toc, graph, form) for a target plugin.
 *     Paths behave like on Windows (WoW): case does not count for uniqueness.
 */

import { EventBus } from "./events.js";
import { FreewoodError } from "./errors.js";

// ===== [S1] Typen · Types =====

export type ProjectFileKind = "lua" | "xml" | "toc" | "graph" | "form" | "text";

export interface ProjectFile {
  path: string;
  kind: ProjectFileKind;
  content: string;
}

export interface SerializedProject {
  format: "freewood-project";
  version: 1;
  name: string;
  targetId: string;
  files: ProjectFile[];
}

export interface ProjectEvents {
  "file:added": { path: string };
  "file:changed": { path: string };
  "file:removed": { path: string };
  "file:renamed": { from: string; to: string };
}

// ===== [S2] Pfade · Paths =====

const KINDS: ReadonlySet<string> = new Set(["lua", "xml", "toc", "graph", "form", "text"]);

/** DE: Prüft und vereinheitlicht einen Pfad ("/" als Trenner). Wirft bei `..`, absoluten Pfaden, Laufwerken, Sonderzeichen. EN: validates and normalizes a path. Throws on `..`, absolute paths, drive letters, special characters. */
export function normalizePath(input: string): string {
  const path = input.trim().replace(/\\/g, "/");
  if (path === "") throw new FreewoodError("PATH_EMPTY", "Empty path");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) throw new FreewoodError("PATH_ABSOLUTE", `Absolute path not allowed: ${input}`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f<>:"|?*]/.test(path)) throw new FreewoodError("PATH_CHARS", `Invalid characters in path: ${input}`);
  const parts = path.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") throw new FreewoodError("PATH_SEGMENT", `Invalid path segment in: ${input}`);
  }
  return parts.join("/");
}

export function kindFromPath(path: string): ProjectFileKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".lua")) return "lua";
  if (lower.endsWith(".xml")) return "xml";
  if (lower.endsWith(".toc")) return "toc";
  if (lower.endsWith(".fwgraph")) return "graph";
  if (lower.endsWith(".fwform")) return "form";
  return "text";
}

// ===== [S3] Project =====

export class Project {
  name: string;
  targetId: string;
  readonly events = new EventBus<ProjectEvents>();
  /** DE: Schlüssel = Pfad in Kleinbuchstaben. EN: key = lower-case path. */
  private readonly files = new Map<string, ProjectFile>();

  constructor(name: string, targetId: string) {
    this.name = name;
    this.targetId = targetId;
  }

  addFile(path: string, content = "", kind?: ProjectFileKind): ProjectFile {
    const clean = normalizePath(path);
    const key = clean.toLowerCase();
    if (this.files.has(key)) throw new FreewoodError("FILE_EXISTS", `File already exists: ${clean}`);
    const file: ProjectFile = { path: clean, kind: kind ?? kindFromPath(clean), content };
    this.files.set(key, file);
    this.events.emit("file:added", { path: clean });
    return file;
  }

  hasFile(path: string): boolean {
    return this.files.has(normalizePath(path).toLowerCase());
  }

  getFile(path: string): ProjectFile | undefined {
    return this.files.get(normalizePath(path).toLowerCase());
  }

  updateFile(path: string, content: string): void {
    const file = this.getFile(path);
    if (!file) throw new FreewoodError("FILE_MISSING", `File not found: ${path}`);
    if (file.content === content) return;
    file.content = content;
    this.events.emit("file:changed", { path: file.path });
  }

  removeFile(path: string): void {
    const file = this.getFile(path);
    if (!file) throw new FreewoodError("FILE_MISSING", `File not found: ${path}`);
    this.files.delete(file.path.toLowerCase());
    this.events.emit("file:removed", { path: file.path });
  }

  renameFile(from: string, to: string): void {
    const file = this.getFile(from);
    if (!file) throw new FreewoodError("FILE_MISSING", `File not found: ${from}`);
    const newPath = normalizePath(to);
    const newKey = newPath.toLowerCase();
    const oldKey = file.path.toLowerCase();
    if (newKey !== oldKey && this.files.has(newKey)) throw new FreewoodError("FILE_EXISTS", `File already exists: ${newPath}`);
    const oldPath = file.path;
    this.files.delete(oldKey);
    file.path = newPath;
    file.kind = kindFromPath(newPath);
    this.files.set(newKey, file);
    this.events.emit("file:renamed", { from: oldPath, to: newPath });
  }

  /** DE: Alle Dateien, nach Pfad sortiert. EN: all files, sorted by path. */
  listFiles(): ProjectFile[] {
    return [...this.files.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  serialize(): string {
    const data: SerializedProject = {
      format: "freewood-project",
      version: 1,
      name: this.name,
      targetId: this.targetId,
      files: this.listFiles().map((f) => ({ path: f.path, kind: f.kind, content: f.content })),
    };
    return JSON.stringify(data, null, 2);
  }

  static parse(json: string): Project {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new FreewoodError("PROJECT_JSON", "Project file is not valid JSON");
    }
    const data = raw as Partial<SerializedProject> | null;
    if (!data || data.format !== "freewood-project" || data.version !== 1) {
      throw new FreewoodError("PROJECT_FORMAT", "Not a Freewood project (format/version)");
    }
    if (typeof data.name !== "string" || typeof data.targetId !== "string" || !Array.isArray(data.files)) {
      throw new FreewoodError("PROJECT_SHAPE", "Project file is incomplete");
    }
    const project = new Project(data.name, data.targetId);
    for (const file of data.files) {
      if (typeof file?.path !== "string" || typeof file.content !== "string") {
        throw new FreewoodError("PROJECT_SHAPE", "Project file entry is invalid");
      }
      const kind = typeof file.kind === "string" && KINDS.has(file.kind) ? file.kind : undefined;
      project.addFile(file.path, file.content, kind);
    }
    return project;
  }
}
