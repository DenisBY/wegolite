// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The tripwire for the next flight mode (Phase 20, RESEARCH Inventory 1).
 *
 * Adding `"dead"` to `FlightMode` was a fail-open hazard: every place that
 * decides what a ship does by comparing the mode with a literal had to be
 * reviewed for the new member, and a negative comparison (`mode !== "docked"`)
 * quietly includes any mode added later. This guard makes the next addition as
 * visible as this one was. It scans comment-stripped `src/**` for a comparison
 * of any expression with a `FlightMode` literal (`===`, `!==`, `==` or `!=`
 * against `"docked"`, `"launching"`, `"inFlight"` or `"dead"`, on either side)
 * and pins two things:
 *
 * 1. the set of files that make such a comparison, and
 * 2. per file, the number of NEGATIVE comparisons (`!==` and `!=`), the
 *    fail-open shape the research inventory found in the clock block and the
 *    save mapping. The file set alone would have caught none of this phase's
 *    fix sites, which all sit in files that already compared a mode.
 *
 * A file that starts or stops comparing a mode literal, or whose count of
 * negative comparisons changes, fails the guard with a message to review that
 * file's gates for every mode, `"dead"` included. A legitimate new gate is
 * reviewed and then re-pinned in the same commit, by the plan that adds it.
 * Later plans write positive comparisons in files already on the list.
 *
 * It is a tripwire, not a proof. It cannot see a mode decided through a
 * `switch`, an `includes` call, a lookup table or a function that hides the
 * comparison, and it counts a comparison of any other string with the same
 * literals (a save mode, an event field) as a comparison too. Both errors fail
 * toward a review, never toward silence.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

/** The `FlightMode` members. */
const MODE = "docked|launching|inFlight|dead";

/** `x === "mode"` and `"mode" === x`, with the operator captured. */
const COMPARISON = new RegExp(
  `(===|!==|==|!=)\\s*"(?:${MODE})"|"(?:${MODE})"\\s*(===|!==|==|!=)`,
  "g",
);

interface Counts {
  readonly total: number;
  readonly negative: number;
}

/** The comparison counts of one file's source, comments never counted. */
function countComparisons(source: string): Counts {
  let total = 0;
  let negative = 0;
  for (const match of withoutComments(source).matchAll(COMPARISON)) {
    total += 1;
    const operator = match[1] ?? match[2];
    if (operator === "!==" || operator === "!=") negative += 1;
  }
  return { total, negative };
}

/**
 * The files that compare a mode literal, each with its count of negative
 * comparisons, as reviewed for the `"dead"` mode of Phase 20. Sorted by path.
 */
const PINNED: Readonly<Record<string, number>> = Object.freeze({
  "src/app/hints.ts": 3,
  "src/app/hud-model.ts": 0,
  "src/app/mode.ts": 0,
  "src/app/session/chart-controller.ts": 0,
  "src/app/session/event-router.ts": 0,
  "src/app/session/frame-loop.ts": 0,
  // The four `?test=1` spawn hooks (shooter, attacker, flyers, anarchy) each
  // refuse unless the mode is "inFlight", so "dead" and "launching" fail closed
  // (the anarchy hook, plan 21-16, reviewed 2026-11-26).
  "src/app/session/probe-publisher.ts": 4,
  "src/app/session/render-driver.ts": 0,
  "src/app/session/save-controller.ts": 2,
  "src/app/session/sim-driver.ts": 2,
  "src/app/session/start-session.ts": 3,
  // docked-f-keys: navigateByKey opens nothing unless docked, so "dead",
  // "launching" and "inFlight" all fail closed (reviewed 2026-11-24).
  "src/app/session/station-controller.ts": 5,
  "src/persistence/autosave.ts": 0,
  "src/persistence/save.ts": 0,
  "src/sim/combat/collide.ts": 0,
  "src/sim/combat/death.ts": 1,
  "src/sim/combat/ident.ts": 1,
  "src/sim/combat/ledger.ts": 0,
  "src/sim/combat/step.ts": 0,
  "src/sim/dock/computer.ts": 1,
  "src/sim/dock/step.ts": 1,
  "src/sim/flight/controller.ts": 1,
  "src/sim/flight/launch.ts": 1,
  "src/sim/flight/step.ts": 4,
  "src/sim/hyperspace/arrival.ts": 0,
  "src/sim/npc/proximity.ts": 1,
  "src/sim/sim.ts": 0,
  "src/ui/station-nav.ts": 1,
  "src/ui/station-tabs.ts": 1,
});

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

const REVIEW =
  'review that file\'s gates for every flight mode, "dead" included, then re-pin it here';

/** Violations of `pinned` over `files`, one message per file. */
function gateViolations(
  files: readonly SourceFile[],
  pinned: Readonly<Record<string, number>>,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const { path, source } of files) {
    const { total, negative } = countComparisons(source);
    if (total === 0) continue;
    seen.add(path);
    const expected = pinned[path];
    if (expected === undefined) {
      found.push(
        `${path}: compares a FlightMode literal and is not on the pinned list (${String(negative)} negative); ${REVIEW}`,
      );
    } else if (expected !== negative) {
      found.push(
        `${path}: the count of negative mode comparisons changed from ${String(expected)} to ${String(negative)}; ${REVIEW}`,
      );
    }
  }
  for (const path of Object.keys(pinned)) {
    if (!seen.has(path)) {
      found.push(
        `${path}: no longer compares a FlightMode literal (or is gone); ${REVIEW}`,
      );
    }
  }
  return found.sort();
}

describe("the flight-mode gates are pinned (the tripwire for the next mode)", () => {
  const PINNED_PATH = "src/sim/x.ts";
  const synthetic = (source: string, path = PINNED_PATH): string[] =>
    gateViolations([{ path, source }], { [PINNED_PATH]: 1 });

  it("holds on the tree: the comparing files and their negative counts are the pinned ones", () => {
    const files = listSrcFiles();

    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(100);
    const sources = files.map((path) => ({
      path,
      source: readFileSync(join(REPO_ROOT, path), "utf8"),
    }));
    const found = gateViolations(sources, PINNED);
    expect(found, found.join("\n")).toEqual([]);
    // The files of this phase's own gates are on the list.
    for (const path of [
      "src/sim/combat/ledger.ts",
      "src/sim/combat/death.ts",
      "src/sim/hyperspace/arrival.ts",
    ]) {
      expect(Object.keys(PINNED), path).toContain(path);
    }
  });

  it("fails a new comparing file, naming it", () => {
    const found = synthetic(
      'if (state.mode === "dead") return;\n',
      "src/new.ts",
    );

    expect(found).toHaveLength(2);
    expect(found[0]).toContain("src/new.ts");
    expect(found[0]).toContain("not on the pinned list");
    expect(found[0]).toContain('"dead" included');
  });

  it("fails an extra negative comparison in a pinned file, naming it", () => {
    const found = synthetic(
      [
        'if (a.mode !== "docked") return;',
        'if (b.mode !== "inFlight") return;',
      ].join("\n"),
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(PINNED_PATH);
    expect(found[0]).toContain("from 1 to 2");
    expect(found[0]).toContain('"dead" included');
  });

  it("counts a loose inequality and a literal on the left as negative comparisons", () => {
    expect(countComparisons('if (a.mode != "docked") return;\n').negative).toBe(
      1,
    );
    expect(
      countComparisons('if ("docked" !== a.mode) return;\n').negative,
    ).toBe(1);
    expect(
      countComparisons('if ("docked" === a.mode) return;\n').negative,
    ).toBe(0);
  });

  it("passes a comment holding a comparison, and a new positive comparison in a pinned file", () => {
    expect(
      synthetic(
        [
          'if (a.mode !== "docked") return;',
          '// if (b.mode !== "inFlight") return;',
          '/* c.mode !== "launching" */',
          'if (d.mode === "dead") return;',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("fails a pinned file that stops comparing a mode literal", () => {
    const found = synthetic("export const x = 1;\n");

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(PINNED_PATH);
    expect(found[0]).toContain("no longer compares");
  });
});
