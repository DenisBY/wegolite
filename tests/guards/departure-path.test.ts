// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Departure-path tripwire (Phase 21, pitfall C11).
 *
 * A ship leaves the world by one of two paths that must stay apart: `killShip`
 * when it dies (it explodes, drops debris, credits a kill and pays the bounty)
 * and `retireShip` when it departs (docking, a jump, a landing, expiry: none of
 * those). A departure routed through `killShip` would credit a kill and drop
 * cargo for a trader that merely docked; a death routed through `retireShip`
 * would vanish without its explosion.
 *
 * The scan is comment-stripped `src/**`:
 *
 * - a `killShip(` call may appear only at its definition (`src/sim/world/kill.ts`)
 *   and at its two production callers: `src/sim/world/step.ts` (energy at 0) and
 *   `src/sim/combat/step.ts` (the kill loop), and
 * - a `retireShip(` call may appear only at its definition
 *   (`src/sim/world/retire.ts`). Its first caller is Phase 23's departure
 *   stand-in, which updates the allow-list below in its own commit.
 *
 * It is a tripwire, not a proof: it cannot see a call through an alias.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lineOf, listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

/** The files that may contain a `killShip(` token: the definition and the two callers. */
const KILL_SHIP_FILES: readonly string[] = [
  "src/sim/world/kill.ts",
  "src/sim/world/step.ts",
  "src/sim/combat/step.ts",
];

/** The files that may contain a `retireShip(` token: the definition only. */
const RETIRE_SHIP_FILES: readonly string[] = ["src/sim/world/retire.ts"];

const DEPARTURE_RULE =
  "a ship leaves the world through killShip when it dies and through retireShip when it departs (pitfall C11): a new caller of either updates the allow-list in tests/guards/departure-path.test.ts in its own commit (Phase 23's departure stand-in is the first retireShip caller)";

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** Violations over `files`: `<path>:<line>: <rule>`; comments never count. */
function departureViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    const cleaned = withoutComments(source);
    if (!KILL_SHIP_FILES.includes(path)) {
      for (const match of cleaned.matchAll(/\bkillShip\s*\(/g)) {
        found.push(
          `${path}:${lineOf(cleaned, match.index)}: ${DEPARTURE_RULE}`,
        );
      }
    }
    if (!RETIRE_SHIP_FILES.includes(path)) {
      for (const match of cleaned.matchAll(/\bretireShip\s*\(/g)) {
        found.push(
          `${path}:${lineOf(cleaned, match.index)}: ${DEPARTURE_RULE}`,
        );
      }
    }
  }
  return found;
}

describe("departures and kills stay on separate paths", () => {
  const APP = "src/app/session/x.ts";
  const violationsOf = (source: string, path = APP): string[] =>
    departureViolations([{ path, source }]);

  it("finds no stray killShip or retireShip call in src today", () => {
    const files = listSrcFiles();

    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(100);
    for (const path of [...KILL_SHIP_FILES, ...RETIRE_SHIP_FILES]) {
      expect(files).toContain(path);
    }

    const sources = files.map((path) => ({
      path,
      source: readFileSync(join(REPO_ROOT, path), "utf8"),
    }));
    const found = departureViolations(sources);
    expect(found, found.join("\n")).toEqual([]);

    // The allow-lists are not vacuous: each file names its function.
    for (const path of KILL_SHIP_FILES) {
      const source = sources.find((file) => file.path === path)?.source ?? "";
      expect(withoutComments(source), path).toMatch(/\bkillShip\s*\(/);
    }
    for (const path of RETIRE_SHIP_FILES) {
      const source = sources.find((file) => file.path === path)?.source ?? "";
      expect(withoutComments(source), path).toMatch(/\bretireShip\s*\(/);
    }
  });

  it("fails a killShip call in the departure file, with file and line", () => {
    const text = ["const a = 1;", "killShip(world, id, 0, events);", ""].join(
      "\n",
    );

    expect(violationsOf(text, "src/sim/world/retire.ts")).toEqual([
      `src/sim/world/retire.ts:2: ${DEPARTURE_RULE}`,
    ]);
  });

  it("fails a retireShip call in the stepper, with file and line", () => {
    const text = ["", "  retireShip(world, id, 'docked');", ""].join("\n");

    expect(violationsOf(text, "src/sim/world/step.ts")).toEqual([
      `src/sim/world/step.ts:2: ${DEPARTURE_RULE}`,
    ]);
  });

  it("fails a killShip call anywhere outside its three files", () => {
    expect(violationsOf("killShip (w, i, 0, e);\n")).toHaveLength(1);
    expect(
      violationsOf("killShip(w, i, 0, e);\n", "src/sim/combat/step.ts"),
    ).toEqual([]);
    expect(
      violationsOf("killShip(w, i, 0, e);\n", "src/sim/world/step.ts"),
    ).toEqual([]);
  });

  it("allows retireShip at its definition and names the rule on failure", () => {
    expect(
      violationsOf(
        "export function retireShip(w, i, r) {}\n",
        "src/sim/world/retire.ts",
      ),
    ).toEqual([]);
    const found = violationsOf("retireShip(w, i, 'jumped');\n");
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("pitfall C11");
    expect(found[0]).toContain("Phase 23");
  });

  it("ignores either name in comments", () => {
    const text = [
      "// killShip(world) and retireShip(world) are named here",
      "/* killShip(a); retireShip(b); */",
      "/**",
      " * calls killShip( or retireShip(",
      " */",
      "export const ok = 1;",
      "",
    ].join("\n");

    expect(violationsOf(text)).toEqual([]);
  });

  it("does not flag an unrelated identifier that contains the name", () => {
    expect(
      violationsOf("const x = mykillShip(1); const y = retireShips(2);\n"),
    ).toEqual([]);
  });
});
