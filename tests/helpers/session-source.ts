// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The session source set (Phase 8, D-12 step 0, FOUND-10).
 *
 * Two tests read the session as text because it has no unit harness
 * (tests/app/redraw-gate.test.ts and tests/guards/economy-purity.test.ts). The
 * split moves code from `src/app/game-session.ts` into `src/app/session/**`, so
 * those scans must read every session file, in an order that does not depend on
 * where a function lives. This helper is that single reader.
 *
 * - The set is the facade plus every `.ts` file under `src/app/session`,
 *   recursively, sorted by code unit (never by locale).
 * - A missing facade or an empty set throws: a scan over nothing would pass
 *   every "does not contain" assertion vacuously.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

export const SESSION_FACADE = "src/app/game-session.ts";
export const SESSION_DIR = "src/app/session";

function codeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Repo-relative, "/"-separated `.ts` paths under `directory`, recursively. */
function tsFilesUnder(root: string, directory: string): string[] {
  const absolute = path.join(root, directory);
  if (!existsSync(absolute)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...tsFilesUnder(root, relative));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(relative);
    }
  }
  return found;
}

/** The facade plus every session module, in code-unit path order. */
export function sessionSourceFiles(root: string = process.cwd()): string[] {
  if (!existsSync(path.join(root, SESSION_FACADE))) {
    throw new Error(
      `Wegolite: the session facade ${SESSION_FACADE} is missing under ${root}.`,
    );
  }
  const files = [SESSION_FACADE, ...tsFilesUnder(root, SESSION_DIR)].sort(
    codeUnit,
  );
  if (files.length === 0) {
    throw new Error(`Wegolite: no session source found under ${root}.`);
  }
  return files;
}

/** The path and text of every session source, in `sessionSourceFiles` order. */
export function sessionSources(
  root: string = process.cwd(),
): { path: string; text: string }[] {
  return sessionSourceFiles(root).map((file) => ({
    path: file,
    text: readFileSync(path.join(root, file), "utf8"),
  }));
}

/** Every session source in one string, each preceded by its own marker line. */
export function sessionSource(root: string = process.cwd()): string {
  return sessionSources(root)
    .map((entry) => `// ---- ${entry.path} ----\n${entry.text}`)
    .join("\n");
}
