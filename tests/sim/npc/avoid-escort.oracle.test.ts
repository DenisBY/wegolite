// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Avoid collision, the proximity rule and escort formation against the
 * independent oracle (Phase 14, plan 14-15; ROADMAP criterion 1).
 *
 * Each fixture goes through the runner's synthetic WorldView and
 * `ShipControl.perform` into `steerShip`, with the contract's in-tick order: the
 * leader refresh before self's update (the `beforeUpdate` hook, through
 * `escortCoordinates`) and the proximity rule after it (the `afterUpdate` hook,
 * through the same `pairTriggers` and `proximityAlertFor` as the world's pass).
 * Expected values live in `tests/oracles/npc/fixtures/*.json` and nothing here
 * copies Wegolite output into them. This file runs exactly its manifest entry
 * (`tests/sim/npc/oracle-groups.ts`) and asserts that the ids it ran equal the
 * ids of that entry.
 */

import { describe, expect, it } from "vitest";

import { fixtureFilesFor } from "./oracle-groups.js";
import { emptyHooks, fixturesIn, runFixture } from "./oracle-runner.js";

const THIS_FILE = "tests/sim/npc/avoid-escort.oracle.test.ts";
const FILES = fixtureFilesFor(THIS_FILE);

const ran: string[] = [];

for (const file of FILES) {
  describe(file, () => {
    for (const fixture of fixturesIn(file)) {
      it(fixture.id, () => {
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
});
