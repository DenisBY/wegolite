// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The count replay of the initial populator (Phase 22, plan 22-06, WORLD-08).
 *
 * The oracle is Oolite's own `oolite-populator.js` (pin 7437f22): every fixture
 * under `tests/oracles/population/fixtures/` holds what the script read for one
 * system and seed (the neighbours, the lane lengths) and what it registered
 * (each entry's `groupCount`, with the three draws its `randomise` took). The
 * port is fed the recorded facts and the recorded draws and must return the
 * recorded counts. A mismatch is fixed in the port, never in a fixture.
 */

import { describe, expect, it } from "vitest";

import {
  planCounts,
  randomise,
} from "../../../../src/sim/world/population/plan.js";
import { POPULATOR_ENTRIES } from "../../../../src/sim/world/population/table.js";
import {
  countDrawsFromFixture,
  factsFromFixture,
  loadPopulationFixture,
} from "../../../helpers/population-fixtures.js";

/** The recorded `{ ordinal, count }` of every kept entry, in engine order. */
function recordedCounts(
  fixture: ReturnType<typeof loadPopulationFixture>,
): readonly { ordinal: number; count: number }[] {
  return POPULATOR_ENTRIES.filter((entry) => entry.status === "kept").map(
    (entry) => {
      const recorded = fixture.entries[entry.ordinal];
      if (recorded === undefined) {
        throw new Error(`the fixture has no entry ${String(entry.ordinal)}`);
      }
      return { ordinal: entry.ordinal, count: recorded.count };
    },
  );
}

describe("tracer: Lave seed 1 counts end to end", () => {
  const lave = loadPopulationFixture("g0-s7-seed1");

  it("reproduces the recorded group count of every kept entry from the recorded facts and draws", () => {
    const planned = planCounts(
      factsFromFixture(lave),
      countDrawsFromFixture(lave),
    );
    expect(planned).toEqual(recordedCounts(lave));
  });

  it("counts the station patrol as one group with no draw", () => {
    const planned = planCounts(
      factsFromFixture(lave),
      countDrawsFromFixture(lave),
    );
    const patrol = POPULATOR_ENTRIES.find(
      (entry) => entry.name === "oolite-police-stationpatrol",
    );
    expect(planned.find((p) => p.ordinal === patrol?.ordinal)?.count).toBe(1);
  });
});

describe("randomise (oolite-populator.js:644-653)", () => {
  it("is 0 for a count of 0, whatever the draws", () => {
    for (const [d1, d2, d3] of [
      [0, 0, 0],
      [0.5, 0.5, 0.5],
      [0.999, 0.999, 0],
    ] as const) {
      expect(randomise(0, d1, d2, d3)).toBe(0);
    }
  });

  it("rounds the fraction up on a third draw below it, strictly", () => {
    // count 2.5 * (0.25 + 0.75 * (0.5 + 0.5)) = 2.5 exactly
    expect(randomise(2.5, 0.5, 0.5, 0.49)).toBe(3);
    expect(randomise(2.5, 0.5, 0.5, 0.5)).toBe(2);
  });
});
