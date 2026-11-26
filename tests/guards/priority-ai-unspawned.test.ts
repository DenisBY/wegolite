// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Nothing spawns a priority AI before Phase 23 (FOUND-20, AI-02; plan 21-07,
 * threat T-21-14).
 *
 * The `"priority"` AI key is registered with an inert module so the v5 snapshot
 * already accepts Phase 23's state. Until the hand-ported AI exists, a spawn
 * with `aiKey: "priority"` would put an inert ship into play that never
 * decides anything. The scan is comment-stripped `src/**`: the literal
 * `"priority"` may appear only in the three files that define the key, its
 * registry entry and its module. Any other use, a populator or a probe or a
 * spawn hook included, fails. It is a tripwire, not a proof: it cannot see a
 * key assembled at run time. The first consumer (Phase 23) updates the
 * allow-list in the same commit that spawns the AI.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lineOf, listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

/** The definition, the registry entry and the module: the only files naming it. */
const PRIORITY_FILES: readonly string[] = [
  "src/sim/ai/types.ts",
  "src/sim/ai/registry.ts",
  "src/sim/ai/priority.ts",
];

const PRIORITY_RULE =
  'something spawns or names a "priority" AI before Phase 23 (AI-02): the first consumer updates PRIORITY_FILES in tests/guards/priority-ai-unspawned.test.ts in the same commit';

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** Violations over `files`: `<path>:<line>: <rule>`; comments never count. */
function priorityViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    if (PRIORITY_FILES.includes(path)) continue;
    const cleaned = withoutComments(source);
    for (const match of cleaned.matchAll(/["'`]priority["'`]/g)) {
      found.push(`${path}:${lineOf(cleaned, match.index)}: ${PRIORITY_RULE}`);
    }
  }
  return found;
}

describe("no priority AI is spawned before Phase 23", () => {
  const violationsOf = (path: string, source: string): string[] =>
    priorityViolations([{ path, source }]);

  it("finds no spawn or mention of the priority key in src today", () => {
    const files = listSrcFiles();

    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(100);
    for (const path of [
      ...PRIORITY_FILES,
      "src/sim/world/populate.ts",
      "src/sim/world/world.ts",
    ]) {
      expect(files).toContain(path);
    }

    const found = priorityViolations(
      files.map((path) => ({
        path,
        source: readFileSync(join(REPO_ROOT, path), "utf8"),
      })),
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("matches the real key in its definition file, so the scan is not vacuous", () => {
    const types = withoutComments(
      readFileSync(join(REPO_ROOT, "src/sim/ai/types.ts"), "utf8"),
    );
    expect(types).toMatch(/["'`]priority["'`]/);
  });

  it("reports a populator that spawns aiKey priority", () => {
    const path = "src/sim/world/populate.ts";
    const source = [
      "const ai = {",
      '  aiKey: "priority",',
      "  params: {},",
      "};",
      "",
    ].join("\n");

    expect(violationsOf(path, source)).toEqual([`${path}:2: ${PRIORITY_RULE}`]);
  });

  it("reports the literal in the app probe", () => {
    const path = "src/app/probe.ts";
    const source = 'export const KEY = "priority";\n';

    expect(violationsOf(path, source)).toEqual([`${path}:1: ${PRIORITY_RULE}`]);
  });

  it("reports single-quoted and template literals too", () => {
    const path = "src/sim/world/test-spawn.ts";
    const source = ["const a = 'priority';", "const b = `priority`;", ""].join(
      "\n",
    );

    expect(violationsOf(path, source)).toEqual([
      `${path}:1: ${PRIORITY_RULE}`,
      `${path}:2: ${PRIORITY_RULE}`,
    ]);
  });

  it("allows the three defining files", () => {
    const source = 'export const AI_KEYS = ["test-pilot", "priority"];\n';

    for (const path of PRIORITY_FILES) {
      expect(violationsOf(path, source)).toEqual([]);
    }
  });

  it("ignores the word in comments and in other identifiers", () => {
    const text = [
      '// aiKey: "priority" is Phase 23, not here',
      '/* spawn { aiKey: "priority" } later */',
      'const FOOTER_STATUS_PRIORITY = ["a"];',
      'const note = "priority queue";',
      "",
    ].join("\n");

    expect(violationsOf("src/ui/station-footer.ts", text)).toEqual([]);
  });
});
