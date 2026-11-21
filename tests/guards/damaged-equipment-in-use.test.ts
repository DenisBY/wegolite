// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: the in-use clauses of damaged equipment that Wegolite cannot
 * exercise yet (Phase 19, decision D-06, plan 19-15).
 *
 * Oolite's behaviour for damaged items has three in-use clauses that need an
 * in-use state Wegolite does not have: the autopilot disengages when the
 * docking computer is damaged (`ShipEntity.m:3327-3330`), a galactic jump
 * aborts with a damaged drive (`PlayerEntity.m:3432-3440`) and a damaged ANA
 * provides nothing (`ShipEntity.m:2803-2818`). They are recorded as not
 * applicable today in
 * `.planning/todos/pending/2026-11-21-damaged-equipment-in-use.md`, and this
 * guard makes the deferral mechanical (the deferred-work rule: a deferred fix
 * is a todo plus a guard that fails on its first consumer). It fails, naming
 * the todo and Oolite's clause, on any of
 *
 * - (a) a non-comment `autopilot` token (case-insensitive) in any
 *   `src/**\/*.ts` file.
 *
 * It keys on spelling, so it is green on the current tree and each trigger has
 * a synthetic input that fails. It is a limited tripwire, not a proof: a
 * consumer that never spells the key or the word autopilot (for example one
 * that reads a key from an existing list by position, or that calls its
 * feature `autoDock`) is not seen, which is why the todo also asks the first
 * consumer for a damaged-item test at its own simulation boundary.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const TODO = ".planning/todos/pending/2026-11-21-damaged-equipment-in-use.md";

const AUTOPILOT_RULE = `an autopilot consumer appeared: disengage the autopilot with "Autopilot disengaged." when the docking computer is damaged while it is engaged (Oolite ShipEntity.m:3327-3330) and add a damaged-item test at its own simulation boundary (see ${TODO})`;

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/**
 * The violations over `files` (repo-relative posix paths and their text):
 * `<path>:<line>: <rule>`, in file then line order.
 */
function inUseViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    const lines = withoutComments(source).split("\n");
    lines.forEach((line, index) => {
      const where = `${path}:${String(index + 1)}`;
      // (a) A non-comment `autopilot` token, any case.
      if (/autopilot/i.test(line)) found.push(`${where}: ${AUTOPILOT_RULE}`);
    });
  }
  return found;
}

/** Every `.ts` file under `src`, read from the working tree. */
function srcTree(): SourceFile[] {
  return listSrcFiles().map((path) => ({
    path,
    source: readFileSync(join(REPO_ROOT, path), "utf8"),
  }));
}

describe("damaged equipment's in-use clauses wait for their consumers (tripwire)", () => {
  const tree = srcTree();

  it("passes on the current tree", () => {
    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(tree.length).toBeGreaterThanOrEqual(100);
    const found = inUseViolations(tree);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("(a) fails on a non-comment autopilot token, naming the todo and the clause", () => {
    const found = inUseViolations([
      ...tree,
      {
        path: "src/sim/flight/auto.ts",
        source: "export interface Hud {\n  autopilotEngaged: boolean;\n}\n",
      },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^src\/sim\/flight\/auto\.ts:2: /);
    expect(found[0]).toContain(TODO);
    expect(found[0]).toContain("Autopilot disengaged.");
    expect(found[0]).toContain("ShipEntity.m:3327-3330");
  });

  it("(a) is case-insensitive and sees a string literal", () => {
    const found = inUseViolations([
      {
        path: "src/ui/messages.ts",
        source: 'export const OFF = "Autopilot disengaged.";\n',
      },
    ]);
    expect(found).toHaveLength(1);
  });

  it("(a) passes on the same word inside a line or block comment", () => {
    const found = inUseViolations([
      {
        path: "src/sim/dock/note.ts",
        source: [
          "// Shift+C is Oolite's fast autopilot.",
          "/** The ordinary autopilot is not modelled. */",
          "/*",
          " * autopilotEngaged is not a field.",
          " */",
          "export const DOCKED = true;",
          "",
        ].join("\n"),
      },
    ]);
    expect(found).toEqual([]);
  });
});
