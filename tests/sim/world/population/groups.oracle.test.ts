// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The whole-system replay of the initial populator (Phase 22, plan 22-09,
 * WORLD-08 success criterion 1).
 *
 * The oracle is Oolite's own `oolite-populator.js` (pin 7437f22) run against a
 * stub host that models the engine pieces the script relies on. Every fixture
 * under `tests/oracles/population/fixtures/` records, for each group of each
 * kept entry, the draws it took per site and the ships it left behind. The port
 * is fed the recorded facts and the recorded draws (the entries' `count` draws
 * and every group's draws, through the interfaces it draws from) and
 * `planSystemGroups` must return, in engine order, exactly the recorded groups,
 * ship for ship, taking exactly the recorded number of draws at each compared
 * site. A mismatch is fixed in the port, never in a fixture.
 *
 * One recorded difference is a decision, not a mismatch (D-11, FIDELITY): the
 * police station patrol joins the main station's group in Oolite, and
 * Wegolite's station is a static with no entity id, so the port plans it with
 * no group record.
 */

import { describe, expect, it } from "vitest";

import { planSystemGroups } from "../../../../src/sim/world/population/groups.js";
import type {
  GroupPlan,
  PopulationRecord,
  SystemDraws,
} from "../../../../src/sim/world/population/groups.js";
import type {
  PopulationDraws,
  PopulationTag,
} from "../../../../src/sim/world/population/streams.js";
import {
  POPULATOR_ENTRIES,
  entriesInEngineOrder,
} from "../../../../src/sim/world/population/table.js";
import type { PopulatorBuilderId } from "../../../../src/sim/world/population/table.js";
import { POPULATION_EXACT_DRAW_TAGS } from "../../../oracles/population/schema.js";
import type { PopulationGroup } from "../../../oracles/population/schema.js";
import {
  committedPopulationRecords,
  countDrawsFromFixture,
  describeShips,
  factsFromFixture,
  loadPopulationFixtures,
  recordedDraws,
  recordedShips,
} from "../../../helpers/population-fixtures.js";
import type { ShipProjection } from "../../../helpers/population-fixtures.js";

type Loaded = ReturnType<typeof loadPopulationFixtures>[number];

const RECORDS = committedPopulationRecords();
const FIXTURES = loadPopulationFixtures();

/** The tags whose draw count is compared: the exact sites, minus the counts. */
const COMPARED_TAGS = POPULATION_EXACT_DRAW_TAGS.filter(
  (tag) => tag !== "count",
);

/**
 * The builders this plan has not written yet. Task 1 (the tracer) implements
 * the light hunters; Task 2 empties the pirate builders, Task 3 the police
 * ones. A group of a pending builder is planned empty and is not compared.
 */
const PENDING_BUILDERS: ReadonlySet<PopulatorBuilderId> = new Set([
  "independentPirate",
  "lightPirateLocal",
  "lightPirateRemote",
  "mediumPirateLocal",
  "mediumPirateRemote",
  "heavyPirateLocal",
  "heavyPirateRemote",
  "policePatrol",
  "stationPatrol",
  "interceptors",
]);

function builderOf(ordinal: number): PopulatorBuilderId | null {
  return POPULATOR_ENTRIES[ordinal]?.builder ?? null;
}

function isPending(ordinal: number): boolean {
  const builder = builderOf(ordinal);
  return builder !== null && PENDING_BUILDERS.has(builder);
}

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

interface Replayed {
  readonly plans: readonly GroupPlan[];
  readonly taken: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/**
 * `drawsFromFixture`: the entries' count draws and each group's draws, as the
 * recording holds them.
 */
function drawsFromFixture(
  loaded: Loaded,
  taken: Map<string, ReadonlyMap<string, number>>,
): SystemDraws {
  const byKey = new Map<string, PopulationGroup>();
  for (const group of loaded.fixture.groups) {
    byKey.set(`${String(group.entry)}/${String(group.index)}`, group);
  }
  return {
    counts: countDrawsFromFixture(loaded.fixture),
    group: (ordinal, groupIndex) => {
      const key = `${String(ordinal)}/${String(groupIndex)}`;
      const group = byKey.get(key);
      if (group === undefined) {
        throw new RangeError(`${loaded.id}: the recording has no group ${key}`);
      }
      const counting = countingDraws(group);
      taken.set(key, counting.taken);
      return counting.draws;
    },
  };
}

/** Plan one whole recorded system through `planSystemGroups`. */
function replaySystem(
  loaded: Loaded,
  records: readonly PopulationRecord[] = RECORDS,
): Replayed {
  const taken = new Map<string, ReadonlyMap<string, number>>();
  const plans = planSystemGroups(
    factsFromFixture(loaded.fixture),
    records,
    drawsFromFixture(loaded, taken),
  );
  return { plans, taken };
}

/**
 * The recorded groups in engine order: `groups` of a fixture already follow it
 * (`engineOrder`, assumption A5), and the port must produce the same sequence.
 */
function recordedOrder(loaded: Loaded): readonly string[] {
  return loaded.fixture.groups.map(
    (group) => `${String(group.entry)}/${String(group.index)}`,
  );
}

function plannedOrder(plans: readonly GroupPlan[]): readonly string[] {
  return plans.map(
    (plan) => `${String(plan.ordinal)}/${String(plan.groupIndex)}`,
  );
}

/**
 * The recorded ships of a group as the port projects them. The one decision:
 * a ship in the main station's group (the police station patrol, D-11) has no
 * group record in the port.
 */
function expectedShips(group: PopulationGroup): ShipProjection[] {
  return recordedShips(group).map((ship, at) =>
    group.ships[at]?.group === "station" ? { ...ship, inGroup: false } : ship,
  );
}

describe("planSystemGroups: tracer (light hunters, one whole system)", () => {
  const loaded = FIXTURES.find((candidate) => candidate.id === "g0-s7-seed1");

  it("has the Lave recording", () => {
    expect(loaded).toBeDefined();
  });

  it("plans the recorded groups of a whole system in engine order", () => {
    if (loaded === undefined) {
      throw new Error("no g0-s7-seed1 fixture");
    }
    const { plans } = replaySystem(loaded);
    expect(plannedOrder(plans)).toEqual(recordedOrder(loaded));
    // The engine order is the stable priority sort of the kept entries.
    const engine = entriesInEngineOrder(POPULATOR_ENTRIES)
      .filter((entry) => entry.status === "kept")
      .map((entry) => entry.ordinal);
    const ordinals = plans.map((plan) => plan.ordinal);
    expect(
      [...ordinals].sort((a, b) => engine.indexOf(a) - engine.indexOf(b)),
    ).toEqual(ordinals);
  });

  it("reproduces every light-hunter group of the system ship for ship", () => {
    if (loaded === undefined) {
      throw new Error("no g0-s7-seed1 fixture");
    }
    const { plans, taken } = replaySystem(loaded);
    const hunters = loaded.fixture.groups.filter(
      (group) => builderOf(group.entry) === "lightHunter",
    );
    expect(hunters.length).toBeGreaterThan(0);
    for (const group of hunters) {
      const key = `${String(group.entry)}/${String(group.index)}`;
      const plan = plans.find(
        (candidate) =>
          candidate.ordinal === group.entry &&
          candidate.groupIndex === group.index,
      );
      expect(plan, key).toBeDefined();
      if (plan === undefined) {
        continue;
      }
      expect({ key, ships: describeShips(plan) }).toEqual({
        key,
        ships: expectedShips(group),
      });
      for (const tag of COMPARED_TAGS) {
        expect(taken.get(key)?.get(tag) ?? 0, `${key} ${tag}`).toBe(
          group.draws[tag]?.length ?? 0,
        );
      }
    }
  });
});

describe("planSystemGroups: every recorded system", () => {
  it("plans the recorded groups of every fixture, in engine order", () => {
    for (const loaded of FIXTURES) {
      const { plans } = replaySystem(loaded);
      expect(plannedOrder(plans), loaded.id).toEqual(recordedOrder(loaded));
    }
  });

  it("reproduces every group of every implemented builder, draws included", () => {
    let compared = 0;
    for (const loaded of FIXTURES) {
      const { plans, taken } = replaySystem(loaded);
      for (const group of loaded.fixture.groups) {
        if (isPending(group.entry)) {
          continue;
        }
        const key = `${String(group.entry)}/${String(group.index)}`;
        const at = `${loaded.id} ${key}`;
        const plan = plans.find(
          (candidate) =>
            candidate.ordinal === group.entry &&
            candidate.groupIndex === group.index,
        );
        if (plan === undefined) {
          throw new Error(`${at}: no planned group`);
        }
        expect({ at, ships: describeShips(plan) }).toEqual({
          at,
          ships: expectedShips(group),
        });
        for (const tag of COMPARED_TAGS) {
          expect(taken.get(key)?.get(tag) ?? 0, `${at} ${tag}`).toBe(
            group.draws[tag]?.length ?? 0,
          );
        }
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(800);
  });

  it("lists the builders that are still pending (Tasks 2 and 3 empty this list)", () => {
    const pending = [...PENDING_BUILDERS].sort();
    expect(pending).toEqual([
      "heavyPirateLocal",
      "heavyPirateRemote",
      "independentPirate",
      "interceptors",
      "lightPirateLocal",
      "lightPirateRemote",
      "mediumPirateLocal",
      "mediumPirateRemote",
      "policePatrol",
      "stationPatrol",
    ]);
  });
});

describe("planSystemGroups: g7-s162 (the empty system)", () => {
  it("plans exactly one group, the station patrol (its builder is pending until Task 3)", () => {
    for (const id of ["g7-s162-seed1", "g7-s162-seed2"]) {
      const loaded = FIXTURES.find((candidate) => candidate.id === id);
      if (loaded === undefined) {
        throw new Error(`no ${id} fixture`);
      }
      const { plans } = replaySystem(loaded);
      expect(plans, id).toHaveLength(1);
      expect(POPULATOR_ENTRIES[plans[0]?.ordinal ?? -1]?.builder, id).toBe(
        "stationPatrol",
      );
    }
  });
});
