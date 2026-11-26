// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The freighter group replay of the initial populator (Phase 22, plan 22-07,
 * WORLD-08).
 *
 * The oracle is Oolite's own `oolite-populator.js` (pin 7437f22) run against a
 * stub host that models the engine pieces the script relies on (the weighted
 * record pick, the initial accuracy and injector roll, the trader escort
 * removal and `setUpMixedEscorts`). Every fixture under
 * `tests/oracles/population/fixtures/` records, for each group a callback
 * produced, the draws it took per site and the ships it left behind. The port
 * is fed the recorded facts and the group's recorded draws through the same
 * interface it draws from, and must return the recorded ships field by field,
 * with the same number of draws taken per site. A mismatch is fixed in the
 * port, never in a fixture.
 */

import { describe, expect, it } from "vitest";

import { buildGroup } from "../../../../src/sim/world/population/groups.js";
import type {
  GroupPlan,
  PopulationRecord,
} from "../../../../src/sim/world/population/groups.js";
import type {
  PopulationDraws,
  PopulationTag,
} from "../../../../src/sim/world/population/streams.js";
import { POPULATOR_ENTRIES } from "../../../../src/sim/world/population/table.js";
import { POPULATION_EXACT_DRAW_TAGS } from "../../../oracles/population/schema.js";
import type { PopulationGroup } from "../../../oracles/population/schema.js";
import {
  committedPopulationRecords,
  describeShips,
  factsFromFixture,
  loadPopulationFixtures,
  recordedDraws,
  recordedShips,
} from "../../../helpers/population-fixtures.js";

type Loaded = ReturnType<typeof loadPopulationFixtures>[number];

const RECORDS = committedPopulationRecords();
const FIXTURES = loadPopulationFixtures();

/** The freighter entries: `oolite-freighters` and `oolite-freighters-docking`. */
const FREIGHTER_ORDINALS: readonly number[] = POPULATOR_ENTRIES.filter(
  (entry) => entry.builder === "freighter",
).map((entry) => entry.ordinal);

/** The tags whose draw count is compared: the exact sites, minus the counts. */
const COMPARED_TAGS = POPULATION_EXACT_DRAW_TAGS.filter(
  (tag) => tag !== "count",
);

/** Recorded draws that remember how many each tag took. */
function countingDraws(group: PopulationGroup): {
  readonly draws: PopulationDraws;
  readonly taken: ReadonlyMap<string, number>;
} {
  const inner = recordedDraws(group);
  const taken = new Map<string, number>();
  const note = (tag: PopulationTag): void => {
    taken.set(tag, (taken.get(tag) ?? 0) + 1);
  };
  return {
    taken,
    draws: {
      next: (tag) => {
        note(tag);
        return inner.next(tag);
      },
      nextU32: (tag) => {
        note(tag);
        return inner.nextU32(tag);
      },
    },
  };
}

/** The freighter groups of a fixture, in recorded order. */
function freighterGroups(loaded: Loaded): readonly PopulationGroup[] {
  return loaded.fixture.groups.filter((group) =>
    FREIGHTER_ORDINALS.includes(group.entry),
  );
}

/** Port one recorded group: the plan and the draws it took per tag. */
function replay(
  loaded: Loaded,
  group: PopulationGroup,
  records: readonly PopulationRecord[] = RECORDS,
): { readonly plan: GroupPlan; readonly taken: ReadonlyMap<string, number> } {
  const entry = POPULATOR_ENTRIES[group.entry];
  if (entry === undefined) {
    throw new Error(`no table entry ${String(group.entry)}`);
  }
  const { draws, taken } = countingDraws(group);
  const plan = buildGroup(
    entry,
    factsFromFixture(loaded.fixture),
    records,
    draws,
    { groupIndex: group.index },
  );
  return { plan, taken };
}

describe("freighter builder: tracer (one recorded escort-free group)", () => {
  const loaded = FIXTURES.find(
    (candidate) =>
      candidate.fixture.inputs.government === 7 &&
      freighterGroups(candidate).length > 0,
  );

  it("has a government 7 fixture with freighter groups", () => {
    expect(loaded).toBeDefined();
  });

  it("reproduces the first freighter group of a government 7 system ship for ship", () => {
    if (loaded === undefined) {
      throw new Error("no government 7 fixture with a freighter group");
    }
    const group = freighterGroups(loaded)[0];
    if (group === undefined) {
      throw new Error("no freighter group");
    }
    const { plan } = replay(loaded, group);
    expect(group.ships).toHaveLength(1);
    expect(describeShips(plan)).toEqual(recordedShips(group));
    expect(plan.ordinal).toBe(group.entry);
    expect(plan.groupIndex).toBe(group.index);
  });

  it("takes exactly the draws the script and the engine took, site by site", () => {
    if (loaded === undefined) {
      throw new Error("no government 7 fixture with a freighter group");
    }
    const group = freighterGroups(loaded)[0];
    if (group === undefined) {
      throw new Error("no freighter group");
    }
    const { taken } = replay(loaded, group);
    for (const tag of COMPARED_TAGS) {
      expect(taken.get(tag) ?? 0, tag).toBe(group.draws[tag]?.length ?? 0);
    }
  });
});

describe("freighter builder: replay helpers", () => {
  it("takes freighter ordinals 5 and 6 from the table", () => {
    expect(FREIGHTER_ORDINALS).toEqual([5, 6]);
  });
});
