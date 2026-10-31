/*
 * Freewood LUA IDE
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Lacustat
 *
 * INHALT / CONTENTS
 *   [S1] AST-Typen · AST types
 *   [S2] Parser ...... rekursiver Abstieg, Operator-Präzedenz wie Lua
 *   [S3] parse ....... Einstiegsfunktion
 *
 * DE: Parser für Lua 5.0/5.1 (ohne goto, ohne Integer-Division). EN: parser for Lua 5.0/5.1.
 */

import type { LuaVersion } from "../plugin-api/types.js";
import { LuaSyntaxError, tokenize, type Token } from "./lexer.js";

// ===== [S1] AST-Typen · AST types =====

export type Expr =
  | { t: "Nil"; line: number }
  | { t: "True"; line: number }
  | { t: "False"; line: number }
  | { t: "Num"; v: number; line: number }
  | { t: "Str"; v: string; line: number }
  | { t: "Vararg"; line: number }
  | { t: "Func"; f: FuncBody; line: number }
  | { t: "Name"; name: string; line: number }
  | { t: "Index"; obj: Expr; key: Expr; line: number }
  | { t: "Call"; fn: Expr; args: Expr[]; line: number }
  | { t: "Method"; obj: Expr; name: string; args: Expr[]; line: number }
  | { t: "Bin"; op: string; a: Expr; b: Expr; line: number }
  | { t: "Un"; op: string; a: Expr; line: number }
  | { t: "Table"; arr: Expr[]; hash: [Expr, Expr][]; order: ({ k: "a"; i: number } | { k: "h"; i: number })[]; line: number }
  | { t: "Paren"; e: Expr; line: number };

export interface FuncBody {
  params: string[];
  vararg: boolean;
  body: Stat[];
  name: string;
  line: number;
}

export type Stat =
  | { t: "Local"; names: string[]; exprs: Expr[]; line: number }
  | { t: "Assign"; targets: Expr[]; exprs: Expr[]; line: number }
  | { t: "CallStat"; call: Expr; line: number }
  | { t: "Do"; body: Stat[]; line: number }
  | { t: "While"; cond: Expr; body: Stat[]; line: number }
  | { t: "Repeat"; body: Stat[]; cond: Expr; line: number }
  | { t: "If"; conds: Expr[]; blocks: Stat[][]; orelse: Stat[] | null; line: number }
  | { t: "NumFor"; v: string; a: Expr; b: Expr; c: Expr | null; body: Stat[]; line: number }
  | { t: "GenFor"; names: string[]; exprs: Expr[]; body: Stat[]; line: number }
  | { t: "LocalFunc"; name: string; f: FuncBody; line: number }
  | { t: "Return"; exprs: Expr[]; line: number }
  | { t: "Break"; line: number };

// ===== [S2] Parser =====

const BIN_PRI: Record<string, [number, number]> = {
  or: [1, 1], and: [2, 2],
  "<": [3, 3], ">": [3, 3], "<=": [3, 3], ">=": [3, 3], "~=": [3, 3], "==": [3, 3],
  "..": [5, 4], "+": [6, 6], "-": [6, 6], "*": [7, 7], "/": [7, 7], "%": [7, 7], "^": [10, 9],
};
const UNARY_PRI = 8;

class Parser {
  private p = 0;
  private funcDepthVararg: boolean[] = [];
  constructor(private toks: Token[], private chunk: string, private version: LuaVersion) {}

  private get tok(): Token {
    return this.toks[this.p]!;
  }
  private err(msg: string, tok = this.tok): never {
    throw new LuaSyntaxError(this.chunk, tok.line, `${msg} near '${tok.type === "eof" ? "<eof>" : String(tok.value)}'`);
  }
  private check(v: string): boolean {
    const t = this.tok;
    return (t.type === "op" || t.type === "keyword") && t.value === v;
  }
  private accept(v: string): boolean {
    if (this.check(v)) {
      this.p++;
      return true;
    }
    return false;
  }
  private expect(v: string, opener?: string, line?: number): void {
    if (!this.accept(v)) {
      if (opener && line !== undefined && line !== this.tok.line) this.err(`'${v}' expected (to close '${opener}' at line ${line})`);
      this.err(`'${v}' expected`);
    }
  }
  private name(): string {
    if (this.tok.type !== "name") this.err("<name> expected");
    return this.toks[this.p++]!.value as string;
  }

  chunkBody(): FuncBody {
    this.funcDepthVararg.push(true);
    const body = this.block();
    if (this.tok.type !== "eof") this.err("'<eof>' expected");
    this.funcDepthVararg.pop();
    return { params: [], vararg: true, body, name: "main chunk", line: 0 };
  }

  private blockEnd(): boolean {
    const t = this.tok;
    return t.type === "eof" || (t.type === "keyword" && ["end", "else", "elseif", "until"].includes(t.value as string));
  }

  private block(): Stat[] {
    const stats: Stat[] = [];
    while (!this.blockEnd()) {
      if (this.check("return")) {
        const line = this.tok.line;
        this.p++;
        const exprs = this.blockEnd() || this.check(";") ? [] : this.exprList();
        this.accept(";");
        stats.push({ t: "Return", exprs, line });
        if (!this.blockEnd()) this.err("'<eof>' expected");
        break;
      }
      if (this.check("break")) {
        stats.push({ t: "Break", line: this.tok.line });
        this.p++;
        this.accept(";");
        if (this.version === "5.0" && !this.blockEnd()) this.err("'end' expected");
        continue;
      }
      stats.push(this.statement());
      this.accept(";");
    }
    return stats;
  }

  private statement(): Stat {
    const line = this.tok.line;
    if (this.accept("if")) {
      const conds: Expr[] = [];
      const blocks: Stat[][] = [];
      let orelse: Stat[] | null = null;
      conds.push(this.expr());
      this.expect("then");
      blocks.push(this.block());
      for (;;) {
        if (this.accept("elseif")) {
          conds.push(this.expr());
          this.expect("then");
          blocks.push(this.block());
        } else if (this.accept("else")) {
          orelse = this.block();
          this.expect("end", "if", line);
          break;
        } else {
          this.expect("end", "if", line);
          break;
        }
      }
      return { t: "If", conds, blocks, orelse, line };
    }
    if (this.accept("while")) {
      const cond = this.expr();
      this.expect("do");
      const body = this.block();
      this.expect("end", "while", line);
      return { t: "While", cond, body, line };
    }
    if (this.accept("do")) {
      const body = this.block();
      this.expect("end", "do", line);
      return { t: "Do", body, line };
    }
    if (this.accept("for")) {
      const n1 = this.name();
      if (this.accept("=")) {
        const a = this.expr();
        this.expect(",");
        const b = this.expr();
        const c = this.accept(",") ? this.expr() : null;
        this.expect("do");
        const body = this.block();
        this.expect("end", "for", line);
        return { t: "NumFor", v: n1, a, b, c, body, line };
      }
      const names = [n1];
      while (this.accept(",")) names.push(this.name());
      this.expect("in");
      const exprs = this.exprList();
      this.expect("do");
      const body = this.block();
      this.expect("end", "for", line);
      return { t: "GenFor", names, exprs, body, line };
    }
    if (this.accept("repeat")) {
      const body = this.block();
      this.expect("until", "repeat", line);
      return { t: "Repeat", body, cond: this.expr(), line };
    }
    if (this.accept("function")) {
      let nameStr = this.name();
      let target: Expr = { t: "Name", name: nameStr, line };
      let isMethod = false;
      while (this.check(".") || this.check(":")) {
        const colon = this.check(":");
        this.p++;
        const key = this.name();
        nameStr += (colon ? ":" : ".") + key;
        target = { t: "Index", obj: target, key: { t: "Str", v: key, line }, line };
        if (colon) {
          isMethod = true;
          break;
        }
      }
      const f = this.funcBody(isMethod, nameStr, line);
      return { t: "Assign", targets: [target], exprs: [{ t: "Func", f, line }], line };
    }
    if (this.accept("local")) {
      if (this.accept("function")) {
        const n = this.name();
        return { t: "LocalFunc", name: n, f: this.funcBody(false, n, line), line };
      }
      const names = [this.name()];
      while (this.accept(",")) names.push(this.name());
      const exprs = this.accept("=") ? this.exprList() : [];
      return { t: "Local", names, exprs, line };
    }
    const e = this.suffixedExpr();
    if (this.check("=") || this.check(",")) {
      const targets = [e];
      while (this.accept(",")) targets.push(this.suffixedExpr());
      this.expect("=");
      const exprs = this.exprList();
      for (const t of targets) if (t.t !== "Name" && t.t !== "Index") this.err("syntax error");
      return { t: "Assign", targets, exprs, line };
    }
    if (e.t !== "Call" && e.t !== "Method") this.err("syntax error");
    return { t: "CallStat", call: e, line };
  }

  private funcBody(isMethod: boolean, name: string, line: number): FuncBody {
    const params: string[] = isMethod ? ["self"] : [];
    let vararg = false;
    this.expect("(");
    if (!this.check(")")) {
      do {
        if (this.check("...")) {
          this.p++;
          vararg = true;
          break;
        }
        params.push(this.name());
      } while (this.accept(","));
    }
    this.expect(")");
    this.funcDepthVararg.push(vararg);
    const body = this.block();
    this.funcDepthVararg.pop();
    this.expect("end", "function", line);
    return { params, vararg, body, name, line };
  }

  private exprList(): Expr[] {
    const list = [this.expr()];
    while (this.accept(",")) list.push(this.expr());
    return list;
  }

  private primaryExpr(): Expr {
    const t = this.tok;
    if (t.type === "name") {
      this.p++;
      return { t: "Name", name: t.value as string, line: t.line };
    }
    if (this.accept("(")) {
      const e = this.expr();
      this.expect(")", "(", t.line);
      return { t: "Paren", e, line: t.line };
    }
    return this.err("unexpected symbol");
  }

  private suffixedExpr(): Expr {
    let e = this.primaryExpr();
    for (;;) {
      const line = this.tok.line;
      if (this.accept(".")) {
        e = { t: "Index", obj: e, key: { t: "Str", v: this.name(), line }, line };
      } else if (this.accept("[")) {
        const key = this.expr();
        this.expect("]");
        e = { t: "Index", obj: e, key, line };
      } else if (this.accept(":")) {
        const name = this.name();
        e = { t: "Method", obj: e, name, args: this.callArgs(), line };
      } else if (this.check("(") || this.check("{") || this.tok.type === "string") {
        e = { t: "Call", fn: e, args: this.callArgs(), line };
      } else return e;
    }
  }

  private callArgs(): Expr[] {
    const t = this.tok;
    if (t.type === "string") {
      this.p++;
      return [{ t: "Str", v: t.value as string, line: t.line }];
    }
    if (this.check("{")) return [this.tableCons()];
    this.expect("(");
    if (this.accept(")")) return [];
    const args = this.exprList();
    this.expect(")", "(", t.line);
    return args;
  }

  private tableCons(): Expr {
    const line = this.tok.line;
    this.expect("{");
    const arr: Expr[] = [];
    const hash: [Expr, Expr][] = [];
    const order: ({ k: "a"; i: number } | { k: "h"; i: number })[] = [];
    while (!this.check("}")) {
      if (this.check("[")) {
        this.p++;
        const k = this.expr();
        this.expect("]");
        this.expect("=");
        hash.push([k, this.expr()]);
        order.push({ k: "h", i: hash.length - 1 });
      } else if (this.tok.type === "name" && this.toks[this.p + 1]?.type === "op" && this.toks[this.p + 1]?.value === "=") {
        const k = this.name();
        this.p++;
        hash.push([{ t: "Str", v: k, line }, this.expr()]);
        order.push({ k: "h", i: hash.length - 1 });
      } else {
        arr.push(this.expr());
        order.push({ k: "a", i: arr.length - 1 });
      }
      if (!this.accept(",") && !this.accept(";")) break;
    }
    this.expect("}", "{", line);
    return { t: "Table", arr, hash, order, line };
  }

  private simpleExpr(): Expr {
    const t = this.tok;
    const line = t.line;
    switch (t.type) {
      case "number":
        this.p++;
        return { t: "Num", v: t.value as number, line };
      case "string":
        this.p++;
        return { t: "Str", v: t.value as string, line };
      case "keyword":
        if (t.value === "nil") return this.p++, { t: "Nil", line };
        if (t.value === "true") return this.p++, { t: "True", line };
        if (t.value === "false") return this.p++, { t: "False", line };
        if (t.value === "function") {
          this.p++;
          return { t: "Func", f: this.funcBody(false, "anonymous", line), line };
        }
        break;
      case "op":
        if (t.value === "...") {
          if (!this.funcDepthVararg[this.funcDepthVararg.length - 1]) this.err("cannot use '...' outside a vararg function");
          this.p++;
          return { t: "Vararg", line };
        }
        if (t.value === "{") return this.tableCons();
        break;
      default:
    }
    return this.suffixedExpr();
  }

  expr(limit = 0): Expr {
    let left: Expr;
    const t = this.tok;
    if ((t.type === "keyword" && t.value === "not") || (t.type === "op" && (t.value === "-" || t.value === "#"))) {
      this.p++;
      const a = this.expr(UNARY_PRI);
      left = { t: "Un", op: t.value as string, a, line: t.line };
    } else left = this.simpleExpr();
    for (;;) {
      const o = this.tok;
      const op = o.type === "op" || o.type === "keyword" ? (o.value as string) : "";
      const pri = BIN_PRI[op];
      if (!pri || pri[0] <= limit) return left;
      this.p++;
      const right = this.expr(pri[1]);
      left = { t: "Bin", op, a: left, b: right, line: o.line };
    }
  }
}

// ===== [S3] parse =====

export function parse(src: string, chunk: string, version: LuaVersion): FuncBody {
  const toks = tokenize(src, chunk, version);
  return new Parser(toks, chunk, version).chunkBody();
}
