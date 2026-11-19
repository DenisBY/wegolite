// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared source scanner of the source-text guards: strip comments, report a
 * line number and list the `.ts` files under `src`. One home, so a fix to the
 * comment lexer is one edit (the review of Phase 17, Sonnet WR-01).
 *
 * Known limit (Sonnet WR-03): a quote inside a regex literal opens a "string",
 * so the scan can desynchronise for the rest of that file. Fixing it here fixes
 * every guard that imports this module.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Drop `//` line comments and block comments while keeping string and template
 * literals intact and preserving every newline, so prose cannot satisfy or
 * falsify a source scan and line numbers stay meaningful.
 */
export function withoutComments(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
    } else if (char === "/" && next === "*") {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        if (source[index] === "\n") out += "\n";
        index += 1;
      }
      index += 2;
      out += " ";
    } else if (char === '"' || char === "'" || char === "`") {
      out += char;
      index += 1;
      while (index < source.length && source[index] !== char) {
        if (source[index] === "\\") {
          out += source[index] as string;
          index += 1;
        }
        out += source[index] ?? "";
        index += 1;
      }
      out += char;
      index += 1;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

/** The 1-based line of character offset `offset` in `text`. */
export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") line += 1;
  }
  return line;
}

/** Every `.ts` file under `src`, repo-relative posix, code-unit ordered. */
export function listSrcFiles(): string[] {
  const found: string[] = [];
  const walk = (directory: string, relative: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith("__purity_")) continue;
      const rel = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), rel);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        found.push(rel);
      }
    }
  };
  walk(join(process.cwd(), "src"), "src");
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
