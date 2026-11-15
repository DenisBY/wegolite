// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `check:dist` — the post-build proof that the dev-only AI harness (and the
 * Oolite AILib code it runs) is absent from the shipped bundle (ROADMAP Phase
 * 14 criterion 4; threat T-14-10).
 *
 * It cannot live in the Vitest `test` step: that step precedes the build in
 * the `verify` chain and has no `dist/` to read. It runs right after
 * `npm run build:e2e` in `verify` and `verify-full`, and after
 * `npm run build` in the Pages workflow.
 *
 * Exit codes: 0 clean, 1 a marker was found (the file and marker are printed),
 * 2 the directory is missing or holds no shipped file, so a skipped build can
 * never pass.
 *
 * Why exactly three markers (`DIST_MARKERS`): each is a string that only the
 * harness or the AILib code itself contains, and each survives minification
 * (one as a property or constant value, one as a string literal). No bare
 * Oolite script file name is a marker: the shuttle's AI file name is shipped
 * content (`aiType` in `src/content/generated/ships-npc.json`), and a comment
 * that names a script file reaches `dist/**` through the source maps
 * (`sourcemap: true` in `vite.config.ts`). A marker that also occurs in
 * shipped content would fail every `verify`, `verify-full` and CI run on a
 * clean tree. A later phase that ports the controller under one of these
 * names must revise this list deliberately, in the same change.
 *
 * Source maps (`*.map`) are skipped: they are not executed and they carry the
 * text of every source file, comments included. A harness that was bundled
 * would also appear in the `.js` chunk, which is scanned.
 *
 * Rule enforced on every default `test` run by `dist-check.test.ts`: no
 * tracked file under `src/` or `public/` may contain one of the three
 * markers, not even in a comment. Prose that needs to name them says "the
 * priority-AI controller" or "the AILib world-script key" instead.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AI_HARNESS_SENTINEL } from "./host.js";

/**
 * The three strings that only the harness or the AILib code contains: the
 * harness sentinel, the AILib controller class name and the world-script key
 * the library registers under.
 */
export const DIST_MARKERS: readonly string[] = Object.freeze([
  AI_HARNESS_SENTINEL,
  "PriorityAIController",
  "oolite-libPriorityAI",
]);

export interface DistFinding {
  /** Path of the file, relative to the checked directory. */
  readonly file: string;
  readonly marker: string;
}

export interface DistCheckResult {
  /** 0 clean, 1 marker found, 2 directory missing or no shipped file. */
  readonly exitCode: 0 | 1 | 2;
  /** Files scanned (source maps excluded). */
  readonly filesScanned: number;
  readonly findings: readonly DistFinding[];
}

/** Every file under `dir`, depth first, in a stable (sorted) order. */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walkFiles(path));
    } else {
      out.push(path);
    }
  }
  return out;
}

/** True when `path` exists and is a directory. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Scan `dir` (a build output) for the markers; skips files ending in `.map`. */
export function checkDist(dir: string): DistCheckResult {
  if (!isDirectory(dir)) {
    return { exitCode: 2, filesScanned: 0, findings: [] };
  }

  const root = resolve(dir);
  const findings: DistFinding[] = [];
  let filesScanned = 0;
  for (const path of walkFiles(root)) {
    if (path.endsWith(".map")) {
      continue;
    }
    filesScanned += 1;
    const bytes = readFileSync(path);
    for (const marker of DIST_MARKERS) {
      if (bytes.includes(marker)) {
        findings.push({ file: path.slice(root.length + 1), marker });
      }
    }
  }

  if (filesScanned === 0) {
    return { exitCode: 2, filesScanned, findings };
  }
  return { exitCode: findings.length > 0 ? 1 : 0, filesScanned, findings };
}

/** The CLI body: prints the outcome and returns the process exit code. */
export function runCheckDist(dir: string): 0 | 1 | 2 {
  const result = checkDist(dir);
  if (result.exitCode === 2) {
    console.error(
      `check:dist: ${dir} is missing or holds no shipped file; run the build first`,
    );
  } else if (result.exitCode === 1) {
    for (const finding of result.findings) {
      console.error(`check:dist: ${finding.file} contains ${finding.marker}`);
    }
    console.error(
      `check:dist: ${result.findings.length} marker hit(s) in ${dir}; the dev-only AI harness must not ship`,
    );
  } else {
    console.log(
      `check:dist: ${result.filesScanned} files scanned in ${dir}, no AI harness marker`,
    );
  }
  return result.exitCode;
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  import.meta.url === pathToFileURL(resolve(entry)).href
) {
  process.exitCode = runCheckDist(process.argv[2] ?? "dist");
}
