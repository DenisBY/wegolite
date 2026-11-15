// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The recorded frame-rate rule, checked against the oracle's 1/60 versus 1/120
 * grid (Phase 14, plan 14-10; ROADMAP criterion 1, RESEARCH Pitfall 2).
 *
 * Two parts:
 *  1. every `rate-` fixture runs through the same `steerShip` at its own step
 *     size (the runner honours the fixture's dt), so the rule holds for
 *     `trackDestination` at both 1/60 s and 1/120 s;
 *  2. every row of `tests/oracles/npc/frame-rate-rule.json` whose cited Oolite
 *     lines fall inside a function ported by plan 14-09 or 14-10 either is
 *     `out-of-scope` or names `confirmedBy` fixtures that the STATIC manifest
 *     (`oracle-groups.ts`) assigns to an oracle test file that exists on disk
 *     and asserts it runs its whole manifest entry. The check never reads a
 *     record of what another Vitest file ran: each test file has its own module
 *     registry, so no such record can cross files.
 *
 * Later plans widen `PORTED` as they port more functions.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FrameRateRuleSchema } from "../../oracles/npc/schema.js";
import { ORACLE_GROUPS, fixtureFilesFor } from "./oracle-groups.js";
import {
  emptyHooks,
  fixturesIn,
  loadOracleFiles,
  runFixture,
} from "./oracle-runner.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const THIS_FILE = "tests/sim/npc/rate-rule.oracle.test.ts";
const FILES = fixtureFilesFor(THIS_FILE);

const ran: string[] = [];

for (const file of FILES) {
  describe(file, () => {
    for (const fixture of fixturesIn(file)) {
      it(`${fixture.id} (dt ${String(fixture.dt)})`, () => {
        ran.push(fixture.id);
        const result = runFixture(fixture, emptyHooks());
        expect(result.failures).toEqual([]);
        expect(result.checks).toBe(fixture.checks.length);
      });
    }
  });
}

describe("the manifest entry", () => {
  it("runs exactly the fixtures of its files", () => {
    const expected: string[] = [];
    for (const file of FILES) {
      for (const fixture of fixturesIn(file)) expected.push(fixture.id);
    }
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual(expected.sort());
  });

  it("holds both step sizes of the grid, each pose at 1/60 and at 1/120", () => {
    const dts = new Set<number>();
    const names = new Map<string, Set<string>>();
    for (const file of FILES) {
      for (const fixture of fixturesIn(file)) {
        dts.add(fixture.dt);
        const match = /^(rate-.*)-dt(60|120)$/.exec(fixture.id);
        expect(match, fixture.id).not.toBeNull();
        const pose = match?.[1] ?? "";
        const width = match?.[2] ?? "";
        names.set(pose, (names.get(pose) ?? new Set<string>()).add(width));
      }
    }
    expect([...dts].sort()).toEqual([1 / 120, 1 / 60].sort());
    expect(names.size).toBeGreaterThan(0);
    for (const [pose, widths] of names) {
      expect([...widths].sort(), pose).toEqual(["120", "60"]);
    }
  });
});

/* ---------------------------------------------------------------------------
 * The frame-rate rule rows
 * ------------------------------------------------------------------------- */

/**
 * The functions ported so far, as Oolite line ranges. A rule row whose cited
 * range lies inside one of them is checked here. Plans 14-12 to 14-15 add the
 * functions they port.
 */
const PORTED: readonly { file: string; from: number; to: number }[] = [
  // plan 14-09: the flight model, idle, stop-still and tumble
  { file: "src/Core/Entities/ShipEntity.m", from: 7018, to: 7065 }, // applySticks
  { file: "src/Core/Entities/ShipEntity.m", from: 5881, to: 5902 }, // applyRoll / applyAttitudeChanges
  { file: "src/Core/Entities/ShipEntity.m", from: 5808, to: 5854 }, // applyThrust
  { file: "src/Core/Entities/ShipEntityAI.m", from: 466, to: 479 }, // performStop, performTumble
  // plan 14-10: navigation
  { file: "src/Core/Entities/ShipEntity.m", from: 9450, to: 9591 }, // trackDestination
  { file: "src/Core/Entities/ShipEntity.m", from: 4903, to: 4965 }, // fly range from, face
  { file: "src/Core/Entities/ShipEntity.m", from: 5049, to: 5153 }, // fly to, fly from
  { file: "src/Core/Entities/ShipEntityAI.m", from: 373, to: 377 }, // performFaceDestination
  { file: "src/Core/Entities/ShipEntityAI.m", from: 394, to: 398 }, // performFlyToRangeFromDestination
  // plan 14-12, task 1: target sensing, trackPrimaryTarget and intercept
  { file: "src/Core/Entities/ShipEntity.m", from: 9034, to: 9244 }, // trackPrimaryTarget
  { file: "src/Core/Entities/ShipEntity.m", from: 9718, to: 9810 }, // range, aspect, currentAimTolerance
  { file: "src/Core/Entities/ShipEntity.m", from: 8638, to: 8830 }, // isValidTarget, addTarget, canStillTrack, noteLostTarget
  { file: "src/Core/Entities/ShipEntity.m", from: 3817, to: 3826 }, // behaviour_intercept_target (INTERCEPT half)
  { file: "src/Core/Entities/ShipEntityAI.m", from: 413, to: 417 }, // performIntercept
  // plan 14-12, task 2: the reaction-time tracking curve
  { file: "src/Core/Entities/ShipEntity.m", from: 5412, to: 5489 }, // calculateTargetPosition .. calculateTrackingCurve
  // plan 14-13, task 1: the avoid-collision entry and exit
  { file: "src/Core/Entities/ShipEntity.m", from: 5904, to: 5958 }, // avoidCollision, resumePostProximityAlert
  { file: "src/Core/Entities/ShipEntity.m", from: 9751, to: 9758 }, // hasProximityAlertIgnoringTarget
  // plan 14-13, task 2: flee and setEvasiveJink
  { file: "src/Core/Entities/ShipEntity.m", from: 4840, to: 4901 }, // behaviour_flee_target
  { file: "src/Core/Entities/ShipEntity.m", from: 8980, to: 9001 }, // setEvasiveJink
  { file: "src/Core/Entities/ShipEntityAI.m", from: 379, to: 392 }, // performFlee
  // plan 14-13, task 3: evasive action
  { file: "src/Core/Entities/ShipEntity.m", from: 3996, to: 4036 }, // behaviour_evasive_action
  { file: "src/Core/Entities/ShipEntity.m", from: 9003, to: 9032 }, // evasiveAction
  // plan 14-14: attack
  { file: "src/Core/Entities/ShipEntity.m", from: 4038, to: 4185 }, // behaviour_attack_target
  { file: "src/Core/Entities/ShipEntity.m", from: 4611, to: 4731 }, // behaviour_attack_fly_to_target
  { file: "src/Core/Entities/ShipEntity.m", from: 4733, to: 4799 }, // behaviour_attack_fly_from_target
  { file: "src/Core/Entities/ShipEntityAI.m", from: 350, to: 357 }, // performAttack
];

/**
 * Fixture files that later plans add to the manifest (flee, attack and the
 * escort and avoid-collision groups). A rule row of a function ported earlier
 * may name a fixture of one of them as an extra confirmation; until that plan
 * adds its manifest row such a fixture only has to exist. Each plan removes its
 * files from this set when it adds the row (the test below fails if a file is
 * both here and in the manifest).
 */
const PENDING_FIXTURE_FILES: ReadonlySet<string> = new Set([
  "tests/oracles/npc/pursuit/fixtures/attack-evade.json",
  "tests/oracles/npc/fixtures/avoid-collision.json",
  "tests/oracles/npc/fixtures/escort.json",
]);

function parseCitation(
  citation: string,
): { file: string; from: number; to: number } | undefined {
  const match = /^(.+):(\d+)-(\d+)$/.exec(citation);
  if (match === null) return undefined;
  return {
    file: match[1] ?? "",
    from: Number(match[2]),
    to: Number(match[3]),
  };
}

function isPorted(citation: string): boolean {
  const cited = parseCitation(citation);
  if (cited === undefined) return false;
  return PORTED.some(
    (range) =>
      range.file === cited.file &&
      cited.from >= range.from &&
      cited.to <= range.to,
  );
}

const rule = FrameRateRuleSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../../oracles/npc/frame-rate-rule.json", import.meta.url),
      ),
      "utf8",
    ),
  ) as unknown,
);

describe("the frame-rate rule rows of the functions ported so far", () => {
  const rows = rule.rows.filter((row) => isPorted(row.oolite));

  it("finds the rows of the ported functions (the check is not vacuous)", () => {
    // applySticks (3 rows), applyAttitudeChanges, applyThrust, the two
    // trackDestination rows, the fly-to and face accumulators, the face
    // damping and performTumble's draws.
    expect(rows.length).toBeGreaterThanOrEqual(11);
  });

  it("every row is out-of-scope or confirmed by a fixture some existing oracle test file runs in full", () => {
    const fixtureFileOf = new Map<string, string>();
    for (const [path, fixtures] of loadOracleFiles()) {
      for (const fixture of fixtures) fixtureFileOf.set(fixture.id, path);
    }
    const testFileOf = new Map<string, string>();
    for (const group of ORACLE_GROUPS) {
      testFileOf.set(group.fixtureFile, group.testFile);
    }
    for (const row of rows) {
      if (row.kind === "out-of-scope") continue;
      expect(row.confirmedBy.length, row.site).toBeGreaterThan(0);
      for (const id of row.confirmedBy) {
        const fixtureFile = fixtureFileOf.get(id);
        expect(fixtureFile, `${row.site}: fixture ${id}`).toBeDefined();
        const testFile = testFileOf.get(fixtureFile ?? "");
        if (
          testFile === undefined &&
          PENDING_FIXTURE_FILES.has(fixtureFile ?? "")
        ) {
          continue; // a later plan's fixture: it must exist, which it does
        }
        expect(
          testFile,
          `${row.site}: ${id} is in no manifest row`,
        ).toBeDefined();
        const absolute = `${REPO_ROOT}${testFile ?? ""}`;
        expect(existsSync(absolute), `${testFile ?? ""} exists`).toBe(true);
        const source = readFileSync(absolute, "utf8");
        // The test file runs its whole manifest entry and asserts so.
        expect(source, `${testFile ?? ""} reads the manifest`).toContain(
          "fixtureFilesFor(",
        );
        expect(
          source,
          `${testFile ?? ""} asserts it runs its whole entry`,
        ).toContain("runs exactly the fixtures of its files");
      }
    }
  });

  it("a pending fixture file is in no manifest row and still exists", () => {
    const assigned = new Set(ORACLE_GROUPS.map((group) => group.fixtureFile));
    for (const file of PENDING_FIXTURE_FILES) {
      expect(assigned.has(file), `${file} has a manifest row`).toBe(false);
      expect(loadOracleFiles().has(file), `${file} exists`).toBe(true);
    }
  });

  it("a row that records a measured divergence states the difference", () => {
    for (const row of rows) {
      if (/\bDIVERGENCE\b/.test(row.treatment)) {
        // The only recorded divergences so far (tracking-curve gate) belong to
        // plan 14-12; none of the rows above may be one without a number.
        expect(row.measuredDifference, row.site).toBeDefined();
      }
    }
  });

  it("the cross-step tolerance is the one written before the grid was replayed", () => {
    expect(rule.crossDtTolerance).toBe(0.01);
  });
});
