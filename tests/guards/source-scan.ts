// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared source scanner of the source-text guards: strip comments, report a
 * line number, list files under a repository directory and list the `.ts`
 * files under `src`. One home, so a fix to the
 * comment lexer is one edit (the review of Phase 17, Sonnet WR-01).
 *
 * Known limit (Sonnet WR-03): a quote inside a regex literal opens a "string",
 * so the scan can desynchronise for the rest of that file. Fixing it here fixes
 * every guard that imports this module.
 */

import { type Dirent, existsSync, readdirSync } from "node:fs";
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

/**
 * The basename prefix of the purity guards' transient probes. `sim-probe.ts`
 * (`withSimProbe`) normalises every probe basename to it and
 * `content-boundary.test.ts` uses it literally; the probes exist for a few
 * milliseconds under `src/`, so a scanner must never read one.
 */
const PROBE_PREFIX = "__purity_";

/**
 * List a directory, or nothing when it vanished after its parent listed it.
 * A parallel guard can remove a transient probe directory (src/sim/ai/nested/,
 * src/sim/ai/pilots/roles/) between its parent's listing and its own. Every
 * other failure, including ENOENT on a directory that still exists, is thrown.
 */
export function readdirIfPresent(directory: string): Dirent[] {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" &&
      !existsSync(directory)
    ) {
      return [];
    }
    throw error;
  }
}

/**
 * Every regular file under `relativeDir` (relative to `root`), recursively, as
 * repo-relative posix paths in code-unit order. Entries named `__purity_*`,
 * files and directories alike, are skipped; a subdirectory that vanishes
 * mid-walk contributes nothing; a missing `relativeDir` throws, so a mistyped
 * scan root cannot pass vacuously.
 */
export function listFilesUnder(
  relativeDir: string,
  root: string = process.cwd(),
): string[] {
  const found: string[] = [];
  const walk = (
    entries: Dirent[],
    directory: string,
    relative: string,
  ): void => {
    for (const entry of entries) {
      if (entry.name.startsWith(PROBE_PREFIX)) continue;
      const rel = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        const sub = join(directory, entry.name);
        walk(readdirIfPresent(sub), sub, rel);
      } else if (entry.isFile()) {
        found.push(rel);
      }
    }
  };
  const top = join(root, relativeDir);
  walk(readdirSync(top, { withFileTypes: true }), top, relativeDir);
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Every `.ts` file under `src`, repo-relative posix, code-unit ordered. Skips
 * `__purity_*` probes and tolerates a vanished subdirectory.
 */
export function listSrcFiles(): string[] {
  return listFilesUnder("src").filter((path) => path.endsWith(".ts"));
}
