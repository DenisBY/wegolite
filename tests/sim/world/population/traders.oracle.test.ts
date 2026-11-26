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
  PlannedPopShip,
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
  loadEdgeDraws,
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

/** Every recorded freighter group with its fixture. */
const ALL: readonly {
  readonly loaded: Loaded;
  readonly group: PopulationGroup;
}[] = FIXTURES.flatMap((loaded) =>
  freighterGroups(loaded).map((group) => ({ loaded, group })),
);

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

describe("freighter builder: every recorded group", () => {
  it("takes freighter ordinals 5 and 6 from the table", () => {
    expect(FREIGHTER_ORDINALS).toEqual([5, 6]);
  });

  it.each(FIXTURES.map((loaded) => [loaded.id, loaded] as const))(
    "%s: every freighter and docking-freighter group is reproduced, escorts included",
    (_id, loaded) => {
      for (const group of freighterGroups(loaded)) {
        const at = `${loaded.id} ${String(group.entry)}/${String(group.index)}`;
        const { plan, taken } = replay(loaded, group);
        expect({ at, ships: describeShips(plan) }).toEqual({
          at,
          ships: recordedShips(group),
        });
        for (const tag of COMPARED_TAGS) {
          expect(taken.get(tag) ?? 0, `${at} ${tag}`).toBe(
            group.draws[tag]?.length ?? 0,
          );
        }
      }
    },
  );

  it("covers the cases the port has to get right (the replay is not vacuous)", () => {
    const ships = ALL.flatMap(({ group }) => group.ships);
    const leaders = ALL.map(({ group }) => group.ships[0]);
    expect(ALL.length).toBeGreaterThanOrEqual(400);
    expect(ALL.some(({ group }) => group.entry === 6)).toBe(true);
    expect(ships.filter((ship) => ship.owner !== null).length).toBeGreaterThan(
      100,
    );
    for (const kind of ["scarce", "medical", "pirate"]) {
      expect(
        leaders.some((ship) => ship?.cargoKind === kind),
        kind,
      ).toBe(true);
    }
    expect(leaders.some((ship) => (ship?.bounty ?? 0) > 0)).toBe(true);
    // Every kind of escort set-up outcome: removed, kept, and an offender's.
    expect(
      ALL.some(
        ({ group }) =>
          group.ships.length > 1 && (group.ships[0]?.bounty ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it("gives no trader an escort where the government is 7 (the removal always passes)", () => {
    const government7 = ALL.filter(
      ({ loaded }) => loaded.fixture.inputs.government === 7,
    );
    expect(government7.length).toBeGreaterThan(30);
    for (const { loaded, group } of government7) {
      const { plan } = replay(loaded, group);
      expect(plan.ships, `${loaded.id} ${String(group.index)}`).toHaveLength(1);
    }
  });

  it("keeps the escorts of a trader in an anarchy system", () => {
    const anarchy = ALL.filter(
      ({ loaded }) => loaded.fixture.inputs.government === 0,
    );
    const escorted = anarchy.filter(({ group }) => group.ships.length > 1);
    expect(escorted.length).toBeGreaterThan(0);
    for (const { loaded, group } of escorted) {
      const { plan } = replay(loaded, group);
      expect(plan.ships.length, loaded.id).toBe(group.ships.length);
      expect(plan.ships[0]?.groupRecord).toBe(true);
    }
  });

  it("gives every escort its mother, a slot and the escort role (D-08)", () => {
    for (const { loaded, group } of ALL) {
      const { plan } = replay(loaded, group);
      const leader = plan.ships[0];
      plan.ships.slice(1).forEach((escort, at) => {
        expect(escort.ownerIndex).toBe(0);
        expect(escort.leaderIndex).toBe(0);
        expect(escort.primaryRole).toBe("escort");
        expect(escort.groupRecord).toBe(true);
        expect(escort.cargoKind).toBe("unset");
        expect(escort.escortSlot).toBe(at);
        // A clean mother gets clean escorts; an offender's carry its bounty.
        if ((leader?.bounty ?? 0) === 0) {
          expect(escort.bounty).toBe(0);
        } else {
          expect(escort.bounty).toBeGreaterThanOrEqual(3);
        }
      });
    }
  });
});

describe("freighter builder: the script's own branches", () => {
  it("takes the station-launch branch: plentiful goods, fuel 7, home here", () => {
    const loaded = FIXTURES[0];
    const group = loaded === undefined ? undefined : freighterGroups(loaded)[0];
    const entry = POPULATOR_ENTRIES[5];
    if (loaded === undefined || group === undefined || entry === undefined) {
      throw new Error("no freighter group");
    }
    const facts = factsFromFixture(loaded.fixture);
    const plan = buildGroup(entry, facts, RECORDS, recordedDraws(group), {
      groupIndex: group.index,
      arriving: false,
    });
    const mother = plan.ships[0];
    expect(mother?.homeSystem).toBe(facts.systemIndex);
    expect(mother?.fuel).toBe(70);
    expect(["plentiful", "medical", "pirate"]).toContain(mother?.cargoKind);
  });

  it("plans an empty group and takes no further draw when no record carries the role", () => {
    const loaded = FIXTURES[0];
    const entry = POPULATOR_ENTRIES[5];
    if (loaded === undefined || entry === undefined) {
      throw new Error("no fixture");
    }
    const noTraders = RECORDS.filter(
      (record) => !record.roles.some((token) => token.startsWith("trader")),
    );
    const refuse: PopulationDraws = {
      next: (tag) => {
        throw new Error(`unexpected draw on ${tag}`);
      },
      nextU32: (tag) => {
        throw new Error(`unexpected draw on ${tag}`);
      },
    };
    const plan = buildGroup(
      entry,
      factsFromFixture(loaded.fixture),
      noTraders,
      refuse,
      { groupIndex: 0 },
    );
    expect(plan.ships).toEqual([]);
    expect(
      buildGroup(entry, factsFromFixture(loaded.fixture), [], refuse, {
        groupIndex: 0,
      }).ships,
    ).toEqual([]);
  });

  it("never reads a record's missile counts (T-22-12, FIDELITY E-194)", () => {
    const sentinel = (record: PopulationRecord): PopulationRecord =>
      new Proxy(record, {
        get(target, key, receiver) {
          if (key === "missiles" || key === "maxMissiles") {
            throw new Error(`a builder read ${String(key)}`);
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      });
    const guarded = RECORDS.map(sentinel);
    for (const { loaded, group } of ALL) {
      expect(() => replay(loaded, group, guarded)).not.toThrow();
    }
  });
});

describe("freighter builder: edge draws (edge-draws.json)", () => {
  const EDGES = loadEdgeDraws();

  /** Crafted draws: every site takes `fixed`, except the listed `body` draws. */
  function crafted(
    fixed: number,
    body: ReadonlyMap<number, number>,
  ): PopulationDraws {
    const taken = new Map<string, number>();
    const draw = (tag: PopulationTag): number => {
      const at = taken.get(tag) ?? 0;
      taken.set(tag, at + 1);
      return (tag === "body" ? body.get(at) : undefined) ?? fixed;
    };
    return {
      next: (tag) => draw(tag),
      nextU32: (tag) => Math.floor(draw(tag) * 4_294_967_296),
    };
  }

  /** The first ship of group 0 of the case's entry, for each probe's draws. */
  function probe(
    id: string,
    bodyIndexOfLine: ReadonlyMap<number, number>,
  ): readonly {
    readonly expected: number | string;
    readonly ship: PlannedPopShip;
  }[] {
    const edge = EDGES.cases.find((candidate) => candidate.id === id);
    const entry = POPULATOR_ENTRIES.find(
      (candidate) => candidate.name === edge?.entry,
    );
    const loaded = FIXTURES.find(
      (candidate) =>
        edge !== undefined &&
        candidate.id === `${edge.system}-seed${String(edge.seed)}`,
    );
    if (edge === undefined || entry === undefined || loaded === undefined) {
      throw new Error(`edge case ${id} is not in the committed oracle`);
    }
    return edge.probes.map((one) => {
      const overrides = new Map<number, number>();
      edge.slots.forEach((slot, at) => {
        const bodyIndex = bodyIndexOfLine.get(slot.line);
        const value = one.draws[at];
        expect(slot.occurrence, `${id} slot ${slot.label}`).toBe(0);
        if (bodyIndex === undefined || value === undefined) {
          throw new Error(`edge case ${id}: unmapped slot ${slot.label}`);
        }
        overrides.set(bodyIndex, value);
      });
      const plan = buildGroup(
        entry,
        factsFromFixture(loaded.fixture),
        RECORDS,
        crafted(edge.fixedDraw, overrides),
        { groupIndex: 0 },
      );
      const ship = plan.ships[0];
      if (
        ship === undefined ||
        (typeof one.result !== "number" && typeof one.result !== "string")
      ) {
        throw new Error(`edge case ${id}: no ship or an unexpected result`);
      }
      return { expected: one.result, ship };
    });
  }

  // The `body` draws of a non-medical arriving freighter, in order:
  // 0 `Math.random() * 8 > government` (:1402), 1 the offender test (:1418),
  // 2 `ceil(Math.random() * 20)` (:1420), 3 the opportunist test (:1423).
  it("gives Oolite's bounty at the offender boundary 0.05 (strict <)", () => {
    const results = probe("freighter-offender-test", new Map([[1418, 1]]));
    expect(results.length).toBeGreaterThanOrEqual(4);
    for (const { expected, ship } of results) {
      expect(ship.bounty).toBe(expected);
    }
  });

  it("gives Oolite's cargo kind at the opportunist boundary 0.5 (strict <)", () => {
    const results = probe(
      "freighter-opportunist-test",
      new Map([
        [1418, 1],
        [1423, 3],
      ]),
    );
    expect(results.length).toBeGreaterThanOrEqual(4);
    for (const { expected, ship } of results) {
      expect(ship.cargoKind).toBe(expected);
    }
  });
});
