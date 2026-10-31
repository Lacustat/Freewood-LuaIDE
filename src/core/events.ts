/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] EventBus .................... on, once, off, emit (Fehler einzelner Handler brechen nichts ab)
 *   [S2] KernelEvents ................ Ereignisse des Kerns · events of the core
 */

// ===== [S1] EventBus =====

type AnyHandler = (payload: unknown) => void;

/**
 * DE: Kleiner typisierter Ereignisverteiler. Ein Handler, der einen Fehler wirft, stoppt die anderen nicht;
 *     der Fehler geht an `onError` (Standard: console.error).
 * EN: Small typed event dispatcher. A handler that throws does not stop the others;
 *     the error goes to `onError` (default: console.error).
 */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<AnyHandler>>();
  private readonly onError: (event: keyof E, error: unknown) => void;

  constructor(onError?: (event: keyof E, error: unknown) => void) {
    this.onError = onError ?? ((event, error) => console.error(`[EventBus] handler for "${String(event)}" failed`, error));
  }

  /** DE: Registriert einen Handler, gibt die Abmelde-Funktion zurück. EN: registers a handler, returns the unsubscribe function. */
  on<K extends keyof E>(event: K, handler: (payload: E[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as AnyHandler);
    return () => this.off(event, handler);
  }

  /** DE: Wie `on`, aber nur einmal. EN: like `on`, but only once. */
  once<K extends keyof E>(event: K, handler: (payload: E[K]) => void): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof E>(event: K, handler: (payload: E[K]) => void): void {
    this.handlers.get(event)?.delete(handler as AnyHandler);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        this.onError(event, error);
      }
    }
  }

  /** DE: Anzahl der Handler (für Tests/Diagnose). EN: number of handlers (tests/diagnostics). */
  listenerCount(event: keyof E): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

// ===== [S2] KernelEvents =====

export interface KernelEvents {
  "plugin:registered": { id: string };
  "plugin:unregistered": { id: string };
  "runtime:registered": { id: string };
  "language:changed": { lang: string };
}
