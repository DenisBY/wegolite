// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The trade group replay of the initial populator (Phase 22, plans 22-07 and
 * 22-08, WORLD-08): freighters (plan 22-07), couriers and smugglers (plan
 * 22-08).
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
import {
  POPULATOR_CUTS,
  POPULATOR_ENTRIES,
} from "../../../../src/sim/world/population/table.js";
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

// --- Couriers (plan 22-08) ---------------------------------------------------

/** The courier entries: `oolite-couriers-route1` and `oolite-couriers-route3`. */
const COURIER_ORDINALS: readonly number[] = POPULATOR_ENTRIES.filter(
  (entry) =>
    entry.builder === "courierShort" || entry.builder === "courierLong",
).map((entry) => entry.ordinal);

/** The recorded groups of a fixture that belong to the given entries. */
function groupsOf(
  loaded: Loaded,
  ordinals: readonly number[],
): readonly PopulationGroup[] {
  return loaded.fixture.groups.filter((group) =>
    ordinals.includes(group.entry),
  );
}

/** Every recorded group of the given entries with its fixture. */
function allGroupsOf(ordinals: readonly number[]): readonly {
  readonly loaded: Loaded;
  readonly group: PopulationGroup;
}[] {
  return FIXTURES.flatMap((loaded) =>
    groupsOf(loaded, ordinals).map((group) => ({ loaded, group })),
  );
}

/** Replay a group and compare the ships and the draws taken per site. */
function expectReplayed(loaded: Loaded, group: PopulationGroup): void {
  const at = `${loaded.id} ${String(group.entry)}/${String(group.index)}`;
  const { plan, taken } = replay(loaded, group);
  expect({ at, ships: describeShips(plan) }).toEqual({
    at,
    ships: recordedShips(group),
  });
  expect(plan.ordinal).toBe(group.entry);
  expect(plan.groupIndex).toBe(group.index);
  for (const tag of COMPARED_TAGS) {
    expect(taken.get(tag) ?? 0, `${at} ${tag}`).toBe(
      group.draws[tag]?.length ?? 0,
    );
  }
}

const COURIERS = allGroupsOf(COURIER_ORDINALS);

describe("courier builder: tracer (one recorded short-courier group)", () => {
  const first = allGroupsOf(
    POPULATOR_ENTRIES.filter((entry) => entry.builder === "courierShort").map(
      (entry) => entry.ordinal,
    ),
  )[0];

  it("has a recorded short-courier group", () => {
    expect(first).toBeDefined();
  });

  it("reproduces it ship for ship and draw for draw", () => {
    if (first === undefined) {
      throw new Error("no short-courier group");
    }
    expectReplayed(first.loaded, first.group);
    const leader = replay(first.loaded, first.group).plan.ships[0];
    expect(leader?.role).toBe("trader-courier");
    expect(leader?.bounty).toBe(0);
    expect(leader?.cargoKind).toBe("scarce");
  });
});

describe("courier builder: every recorded group", () => {
  it("takes the courier ordinals 7 and 8 from the table", () => {
    expect(COURIER_ORDINALS).toEqual([7, 8]);
  });

  it.each(FIXTURES.map((loaded) => [loaded.id, loaded] as const))(
    "%s: every courier group (routes 1 and 3) is reproduced",
    (_id, loaded) => {
      for (const group of groupsOf(loaded, COURIER_ORDINALS)) {
        expectReplayed(loaded, group);
      }
    },
  );

  it("covers both routes and the bottleneck systems (the replay is not vacuous)", () => {
    expect(
      COURIERS.filter(({ group }) => group.entry === 7).length,
    ).toBeGreaterThan(50);
    expect(
      COURIERS.filter(({ group }) => group.entry === 8).length,
    ).toBeGreaterThan(50);
  });

  it("gives every courier Oolite's data: role, bounty 0, scarce goods, home within 7 LY", () => {
    for (const { loaded, group } of COURIERS) {
      const facts = factsFromFixture(loaded.fixture);
      const { plan } = replay(loaded, group);
      const leader = plan.ships[0];
      const at = `${loaded.id} ${String(group.entry)}/${String(group.index)}`;
      expect(leader?.role, at).toBe("trader-courier");
      expect(leader?.primaryRole, at).toBe("trader-courier");
      expect(leader?.bounty, at).toBe(0);
      expect(leader?.cargoKind, at).toBe("scarce");
      // The short courier arrives for this system; the long one for a system
      // within 25 LY (or this one when none is in range).
      expect(leader?.destinationSystem, at).toSatisfy((id: number) =>
        group.entry === 7
          ? id === facts.systemIndex
          : id === facts.systemIndex ||
            facts.neighbourhood.inRange(25).includes(id),
      );
      expect(leader?.homeSystem, at).toSatisfy(
        (id: number) =>
          id === facts.systemIndex ||
          facts.neighbourhood.inRange(7).includes(id),
      );
    }
  });

  it("draws the long courier's destination from the 25 LY list, not the 7 LY one", () => {
    const longGroups = COURIERS.filter(({ group }) => group.entry === 8);
    const beyond = longGroups.filter(({ loaded, group }) => {
      const facts = factsFromFixture(loaded.fixture);
      const destination = replay(loaded, group).plan.ships[0]
        ?.destinationSystem;
      return (
        destination !== undefined &&
        destination !== facts.systemIndex &&
        !facts.neighbourhood.inRange(7).includes(destination)
      );
    });
    expect(beyond.length).toBeGreaterThan(0);
  });

  it("keeps heat insulation a cut: recorded as a cut write, in no planned field", () => {
    expect(
      POPULATOR_CUTS.some(
        (cut) => cut.kind === "write" && cut.name === "heatInsulation",
      ),
    ).toBe(true);
    for (const { loaded, group } of COURIERS) {
      const leader = group.ships[0];
      expect(
        leader?.writes.some(
          (write) => write.member === "heatInsulation" && write.cut === true,
        ),
        `${loaded.id} ${String(group.index)}`,
      ).toBe(true);
      const planned = replay(loaded, group).plan.ships[0];
      expect(Object.keys(planned ?? {})).not.toContain("heatInsulation");
    }
  });
});

describe("courier builder: the script's own branches", () => {
  const route1 = POPULATOR_ENTRIES.find(
    (entry) => entry.builder === "courierShort",
  );
  const route3 = POPULATOR_ENTRIES.find(
    (entry) => entry.builder === "courierLong",
  );

  it("takes the station-launch branch: plentiful goods, home here, destination in range", () => {
    for (const entry of [route1, route3]) {
      const first = COURIERS.find(
        ({ group }) => group.entry === entry?.ordinal,
      );
      if (entry === undefined || first === undefined) {
        throw new Error("no courier group");
      }
      const facts = factsFromFixture(first.loaded.fixture);
      const plan = buildGroup(
        entry,
        facts,
        RECORDS,
        recordedDraws(first.group),
        { groupIndex: first.group.index, arriving: false },
      );
      const leader = plan.ships[0];
      expect(leader?.cargoKind).toBe("plentiful");
      expect(leader?.homeSystem).toBe(facts.systemIndex);
      expect(leader?.bounty).toBe(0);
    }
  });

  it("asks for a trader when the catalogue has no trader-courier (_roleExists)", () => {
    const withoutCourier = RECORDS.filter(
      (record) =>
        !record.roles.some((token) => token.startsWith("trader-courier")),
    );
    expect(withoutCourier.length).toBeLessThan(RECORDS.length);
    const first = COURIERS[0];
    if (route1 === undefined || first === undefined) {
      throw new Error("no courier group");
    }
    const half: PopulationDraws = {
      next: () => 0.5,
      nextU32: () => 0x7fffffff,
    };
    const plan = buildGroup(
      route1,
      factsFromFixture(first.loaded.fixture),
      withoutCourier,
      half,
      { groupIndex: 0 },
    );
    const leader = plan.ships[0];
    expect(leader?.role).toBe("trader");
    expect(leader?.primaryRole).toBe("trader");
    expect(leader?.bounty).toBe(0);
    expect(leader?.cargoKind).toBe("scarce");
  });

  it("forces bounty 0 on a courier whose record authors a bounty (`t[0].bounty = 0`, :1466)", () => {
    const first = COURIERS[0];
    if (route1 === undefined || first === undefined) {
      throw new Error("no courier group");
    }
    // The shipped courier records author no bounty, so the write is only
    // visible against a record that does.
    const wanted = RECORDS.map((record) =>
      record.roles.some((token) => token.startsWith("trader-courier"))
        ? { ...record, bounty: 9 }
        : record,
    );
    const plan = buildGroup(
      route1,
      factsFromFixture(first.loaded.fixture),
      wanted,
      recordedDraws(first.group),
      { groupIndex: first.group.index },
    );
    expect(plan.ships[0]?.bounty).toBe(0);
  });

  it("plans nothing and takes no draw when no record carries trader-courier or trader", () => {
    const first = COURIERS[0];
    if (route1 === undefined || route3 === undefined || first === undefined) {
      throw new Error("no courier group");
    }
    const refuse: PopulationDraws = {
      next: (tag) => {
        throw new Error(`unexpected draw on ${tag}`);
      },
      nextU32: (tag) => {
        throw new Error(`unexpected draw on ${tag}`);
      },
    };
    const facts = factsFromFixture(first.loaded.fixture);
    for (const entry of [route1, route3]) {
      expect(
        buildGroup(entry, facts, [], refuse, { groupIndex: 0 }).ships,
      ).toEqual([]);
    }
  });

  it("never reads a record's missile counts on a courier path (T-22-12)", () => {
    const guarded = RECORDS.map(
      (record): PopulationRecord =>
        new Proxy(record, {
          get(target, key, receiver) {
            if (key === "missiles" || key === "maxMissiles") {
              throw new Error(`a builder read ${String(key)}`);
            }
            return Reflect.get(target, key, receiver) as unknown;
          },
        }),
    );
    for (const { loaded, group } of COURIERS) {
      expect(() => replay(loaded, group, guarded)).not.toThrow();
    }
  });
});

// --- Smugglers and every trade entry (plan 22-08) ----------------------------

/** The smuggler entry: `oolite-smugglers`. */
const SMUGGLER_ORDINALS: readonly number[] = POPULATOR_ENTRIES.filter(
  (entry) => entry.builder === "smuggler",
).map((entry) => entry.ordinal);

const SMUGGLERS = allGroupsOf(SMUGGLER_ORDINALS);

/** Every trade entry: freighters, docking freighters, couriers, smugglers. */
const TRADE_ORDINALS: readonly number[] = [
  ...FREIGHTER_ORDINALS,
  ...COURIER_ORDINALS,
  ...SMUGGLER_ORDINALS,
];

describe("smuggler builder: every recorded group", () => {
  it("takes the smuggler ordinal 9 from the table", () => {
    expect(SMUGGLER_ORDINALS).toEqual([9]);
  });

  it.each(FIXTURES.map((loaded) => [loaded.id, loaded] as const))(
    "%s: every smuggler group is reproduced, escorts included",
    (_id, loaded) => {
      for (const group of groupsOf(loaded, SMUGGLER_ORDINALS)) {
        expectReplayed(loaded, group);
      }
    },
  );

  it("covers the cases the port has to get right (the replay is not vacuous)", () => {
    const leaders = SMUGGLERS.map(({ group }) => group.ships[0]);
    expect(SMUGGLERS.length).toBeGreaterThanOrEqual(30);
    expect(leaders.some((ship) => (ship?.bounty ?? 0) > 0)).toBe(true);
    expect(leaders.some((ship) => ship?.injector === true)).toBe(true);
  });

  it("ORs 3 + floor(r * 12) into the bounty of a smuggler's escorts (:1564-1572; no recorded smuggler has one)", () => {
    // The shipped smuggler hulls author no `escort_roles`, so the oracle has no
    // escorted smuggler: the branch is checked against a record that has one.
    const first = SMUGGLERS[0];
    const entry = POPULATOR_ENTRIES.find(
      (candidate) => candidate.builder === "smuggler",
    );
    if (first === undefined || entry === undefined) {
      throw new Error("no smuggler group");
    }
    expect(SMUGGLERS.every(({ group }) => group.ships.length === 1)).toBe(true);
    const escorted = RECORDS.map((record) =>
      record.roles.some((token) => token.startsWith("trader-smuggler"))
        ? {
            ...record,
            escortRoles: [{ min: 1, max: 1, role: "escort" }],
          }
        : record,
    );
    const half: PopulationDraws = {
      next: () => 0.5,
      nextU32: () => 0x7fffffff,
    };
    const plan = buildGroup(
      entry,
      factsFromFixture(first.loaded.fixture),
      escorted,
      half,
      { groupIndex: 0 },
    );
    expect(plan.ships).toHaveLength(2);
    expect(plan.ships[0]?.bounty).toBe(10);
    expect(plan.ships[1]?.ownerIndex).toBe(0);
    // 3 + floor(0.5 * 12) = 9, OR-ed into the clean escort's bounty 0.
    expect(plan.ships[1]?.bounty).toBe(9);
  });

  it("gives every smuggler Oolite's data: contraband, a bounded bounty, the injector, escorts' bounty", () => {
    for (const { loaded, group } of SMUGGLERS) {
      const at = `${loaded.id} ${String(group.index)}`;
      const { plan } = replay(loaded, group);
      const leader = plan.ships[0];
      const record = RECORDS.find((one) => one.key === leader?.recordKey);
      expect(leader?.cargoKind, at).toBe("contraband");
      expect(leader?.bounty, at).toBeGreaterThanOrEqual(1);
      expect(leader?.bounty, at).toBeLessThanOrEqual(
        Math.min(20, 2 * (record?.maxCargo ?? 0)),
      );
      if ((record?.autoWeapons ?? 0) > 0) {
        expect(leader?.injector, at).toBe(true);
      }
      for (const escort of plan.ships.slice(1)) {
        // `bounty |= 3 + floor(r * 12)`: at least one of the bits 0 and 1 is set.
        expect(escort.bounty & 3, at).not.toBe(0);
      }
    }
  });

  it("caps the bounty at twice the cargo space (the :1542 clamp), not at 20", () => {
    const first = SMUGGLERS[0];
    const entry = POPULATOR_ENTRIES.find(
      (candidate) => candidate.builder === "smuggler",
    );
    if (first === undefined || entry === undefined) {
      throw new Error("no smuggler group");
    }
    const tight = RECORDS.map((record) =>
      record.roles.some((token) => token.startsWith("trader-smuggler"))
        ? { ...record, maxCargo: 2 }
        : record,
    );
    const high: PopulationDraws = {
      next: () => 0.99,
      nextU32: () => 0x7fffffff,
    };
    const plan = buildGroup(
      entry,
      factsFromFixture(first.loaded.fixture),
      tight,
      high,
      { groupIndex: 0 },
    );
    // ceil(0.99 * 20) = 20 > 2 * 2, so the clamp gives 4.
    expect(plan.ships[0]?.bounty).toBe(4);
  });

  it("takes the station-launch branch: contraband, home here, destination within 7 LY", () => {
    const first = SMUGGLERS[0];
    const entry = POPULATOR_ENTRIES.find(
      (candidate) => candidate.builder === "smuggler",
    );
    if (first === undefined || entry === undefined) {
      throw new Error("no smuggler group");
    }
    const facts = factsFromFixture(first.loaded.fixture);
    const plan = buildGroup(entry, facts, RECORDS, recordedDraws(first.group), {
      groupIndex: first.group.index,
      arriving: false,
    });
    const leader = plan.ships[0];
    expect(leader?.cargoKind).toBe("contraband");
    expect(leader?.homeSystem).toBe(facts.systemIndex);
  });

  it("asks for a trader when the catalogue has no trader-smuggler (_roleExists)", () => {
    const first = SMUGGLERS[0];
    const entry = POPULATOR_ENTRIES.find(
      (candidate) => candidate.builder === "smuggler",
    );
    if (first === undefined || entry === undefined) {
      throw new Error("no smuggler group");
    }
    const without = RECORDS.filter(
      (record) =>
        !record.roles.some((token) => token.startsWith("trader-smuggler")),
    );
    expect(without.length).toBeLessThan(RECORDS.length);
    const half: PopulationDraws = {
      next: () => 0.5,
      nextU32: () => 0x7fffffff,
    };
    const plan = buildGroup(
      entry,
      factsFromFixture(first.loaded.fixture),
      without,
      half,
      { groupIndex: 0 },
    );
    expect(plan.ships[0]?.role).toBe("trader");
    expect(plan.ships[0]?.cargoKind).toBe("contraband");
  });

  it("plans nothing and takes no draw when no record carries trader-smuggler or trader", () => {
    const first = SMUGGLERS[0];
    const entry = POPULATOR_ENTRIES.find(
      (candidate) => candidate.builder === "smuggler",
    );
    if (first === undefined || entry === undefined) {
      throw new Error("no smuggler group");
    }
    const refuse: PopulationDraws = {
      next: (tag) => {
        throw new Error(`unexpected draw on ${tag}`);
      },
      nextU32: (tag) => {
        throw new Error(`unexpected draw on ${tag}`);
      },
    };
    expect(
      buildGroup(entry, factsFromFixture(first.loaded.fixture), [], refuse, {
        groupIndex: 0,
      }).ships,
    ).toEqual([]);
  });
});

describe("trade builders: every group of every trade entry", () => {
  const EVERY = allGroupsOf(TRADE_ORDINALS);

  it("names the five trade entries of the table", () => {
    expect(TRADE_ORDINALS).toEqual([5, 6, 7, 8, 9]);
  });

  it("replays every freighter, docking freighter, courier and smuggler group of every fixture", () => {
    expect(EVERY.length).toBe(ALL.length + COURIERS.length + SMUGGLERS.length);
    for (const { loaded, group } of EVERY) {
      expectReplayed(loaded, group);
    }
  });

  it("never reads a record's missile counts, whatever the trade entry (T-22-12)", () => {
    const guarded = RECORDS.map(
      (record): PopulationRecord =>
        new Proxy(record, {
          get(target, key, receiver) {
            if (key === "missiles" || key === "maxMissiles") {
              throw new Error(`a builder read ${String(key)}`);
            }
            return Reflect.get(target, key, receiver) as unknown;
          },
        }),
    );
    for (const { loaded, group } of EVERY) {
      expect(() => replay(loaded, group, guarded)).not.toThrow();
    }
  });

  it("plans a total result for every trade entry on non-finite and prototype-named facts", () => {
    const hostile = {
      galaxy: 0,
      systemIndex: Number.NaN,
      government: Number.POSITIVE_INFINITY,
      economy: "constructor",
      techlevel: undefined,
      neighbourhood: { inRange: "toString", locals: "__proto__" },
      laneLengths: { l1: 0, l2: 0, l3: 0 },
    } as unknown as ReturnType<typeof factsFromFixture>;
    const half: PopulationDraws = {
      next: () => 0.5,
      nextU32: () => 0x7fffffff,
    };
    for (const ordinal of TRADE_ORDINALS) {
      const entry = POPULATOR_ENTRIES[ordinal];
      if (entry === undefined) {
        throw new Error(`no entry ${String(ordinal)}`);
      }
      expect(() =>
        buildGroup(entry, hostile, RECORDS, half, { groupIndex: 0 }),
      ).not.toThrow();
    }
  });
});
