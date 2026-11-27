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

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_ENTITIES } from "../../../../src/sim/world/ids.js";
import {
  entryRates,
  planCounts,
  randomise,
  systemFactsFrom,
  type CountDraws,
  type SystemFacts,
} from "../../../../src/sim/world/population/plan.js";
import {
  POPULATION_TAG_CODES,
  countDrawSource,
  countDraws,
  populationDraws,
  type PopulationTag,
} from "../../../../src/sim/world/population/streams.js";
import {
  POPULATOR_CUTS,
  POPULATOR_ENTRIES,
  entriesInEngineOrder,
} from "../../../../src/sim/world/population/table.js";
import { deriveSystemLayout } from "../../../../src/sim/world/layout.js";
import { buildNeighbourhood } from "../../../../src/sim/world/neighbourhood.js";
import { stationSpecOf } from "../../../helpers/stations.js";
import {
  countDrawsFromFixture,
  factsFromFixture,
  galaxySystems,
  loadEdgeDraws,
  loadPopulationFixture,
  loadPopulationFixtures,
  recordedDraws,
} from "../../../helpers/population-fixtures.js";

type Fixture = ReturnType<typeof loadPopulationFixture>;

const FIXTURES = loadPopulationFixtures();

/** The recorded `{ ordinal, count }` of every kept entry, in engine order. */
function recordedCounts(
  fixture: Fixture,
): readonly { ordinal: number; count: number }[] {
  return entriesInEngineOrder(POPULATOR_ENTRIES)
    .filter((entry) => entry.status === "kept")
    .map((entry) => {
      const recorded = fixture.entries[entry.ordinal];
      if (recorded === undefined) {
        throw new Error(`the fixture has no entry ${String(entry.ordinal)}`);
      }
      return { ordinal: entry.ordinal, count: recorded.count };
    });
}

function nameOf(ordinal: number): string {
  return POPULATOR_ENTRIES[ordinal]?.name ?? `#${String(ordinal)}`;
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

  it("replays every randomise boundary case of edge-draws.json to the last bit", () => {
    const cases = loadEdgeDraws().cases.filter((edge) =>
      edge.site.endsWith("oolite-populator.js:648"),
    );
    expect(cases.map((edge) => edge.id)).toEqual(["randomise-third-draw"]);
    for (const edge of cases) {
      const count = edge.inputs["count"];
      expect(typeof count).toBe("number");
      for (const probe of edge.probes) {
        // The case pins the first two draws at 0.5, so the scale factor is 1.
        expect(
          randomise(Number(count), 0.5, 0.5, probe.draws[0] ?? Number.NaN),
          `${edge.id} draw ${String(probe.draws[0])}`,
        ).toBe(probe.result);
      }
    }
  });

  it("adds one for the largest double below the fraction and not for the fraction itself", () => {
    const edge = loadEdgeDraws().cases.find(
      (candidate) => candidate.id === "randomise-third-draw",
    );
    const count = Number(edge?.inputs["count"]);
    const fraction = count - Math.floor(count);
    const below = new Float64Array([fraction]);
    const bits = new BigUint64Array(below.buffer);
    bits[0] = (bits[0] ?? 0n) - 1n;
    expect(randomise(count, 0.5, 0.5, fraction)).toBe(Math.floor(count));
    expect(randomise(count, 0.5, 0.5, below[0] ?? Number.NaN)).toBe(
      Math.floor(count) + 1,
    );
  });
});

describe("the entry table equals the script's registrations", () => {
  const registered = POPULATOR_ENTRIES.map((entry) => ({
    ordinal: entry.ordinal,
    name: entry.name,
    priority: entry.priority,
    location: entry.location,
    counted: entry.counted,
    cut: entry.status === "cut",
  }));

  it("lists every registered name in registration order, in every fixture", () => {
    for (const { id, fixture } of FIXTURES) {
      const recorded = fixture.entries.map((entry) => ({
        ordinal: entry.ordinal,
        name: entry.name,
        priority: entry.priority,
        location: entry.location,
        counted: entry.counted,
        cut: entry.cut,
      }));
      expect(registered, id).toEqual(recorded);
    }
  });

  it("runs the entries in the recorded engine order", () => {
    const order = entriesInEngineOrder(POPULATOR_ENTRIES).map(
      (entry) => entry.ordinal,
    );
    for (const { id, fixture } of FIXTURES) {
      expect(order, id).toEqual(fixture.engineOrder);
    }
  });

  it("numbers the ordinals by position and never lists a name twice", () => {
    expect(POPULATOR_ENTRIES.map((entry) => entry.ordinal)).toEqual(
      POPULATOR_ENTRIES.map((_, at) => at),
    );
    expect(new Set(POPULATOR_ENTRIES.map((entry) => entry.name)).size).toBe(
      POPULATOR_ENTRIES.length,
    );
    expect(Object.isFrozen(POPULATOR_ENTRIES)).toBe(true);
    expect(Object.isFrozen(POPULATOR_CUTS)).toBe(true);
  });

  it("keeps an entry with a builder or cuts it with a reason, never neither", () => {
    for (const entry of POPULATOR_ENTRIES) {
      if (entry.status === "kept") {
        expect(entry.builder, entry.name).not.toBeNull();
        expect(entry.cutReason, entry.name).toBeNull();
      } else {
        expect(entry.builder, entry.name).toBeNull();
        const record = POPULATOR_CUTS.find(
          (cutRecord) =>
            cutRecord.kind === "entry" && cutRecord.name === entry.name,
        );
        expect(record?.reason.length ?? 0, entry.name).toBeGreaterThan(0);
        expect(record?.reason, entry.name).toBe(entry.cutReason);
      }
    }
  });

  it("records the cut entries, cut writes and non-entries the plan names", () => {
    const named = (kind: string): readonly string[] =>
      POPULATOR_CUTS.filter((record) => record.kind === kind).map(
        (record) => record.name,
      );
    expect(named("entry")).toEqual([
      "oolite-nav-buoy",
      "oolite-witch-buoy",
      "oolite-route1-asteroids",
      "oolite-route2-asteroids",
      "oolite-offlane-hermit",
      "oolite-hunters-medium-route1",
      "oolite-hunters-medium-route3",
      "oolite-hunters-heavy-route1",
      "oolite-hunters-heavy-route3",
      "oolite-assassins",
      "oolite-thargoid-scouts",
      "oolite-thargoid-strike",
    ]);
    expect(named("write")).toEqual([
      "switchAI",
      "_setMissiles",
      "EQ_ECM",
      "EQ_SHIELD_BOOSTER",
      "heatInsulation",
      "maxEscorts",
    ]);
    expect(named("not-an-initial-entry")).toEqual(["scavengers", "shuttles"]);
    for (const record of POPULATOR_CUTS) {
      expect(record.reason.length, record.name).toBeGreaterThan(0);
    }
  });
});

describe("every fixture: the recorded counts are reproduced (WORLD-08 criterion 1)", () => {
  it("covers the whole committed sample", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(66);
  });

  it.each(FIXTURES.map(({ id, fixture }) => [id, fixture] as const))(
    "%s",
    (id, fixture) => {
      const planned = planCounts(
        factsFromFixture(fixture),
        countDrawsFromFixture(fixture),
      );
      const expected = recordedCounts(fixture);
      const mismatches = expected.flatMap((recorded) => {
        const got = planned.find((p) => p.ordinal === recorded.ordinal);
        return got?.count === recorded.count
          ? []
          : [
              `${id} ${nameOf(recorded.ordinal)}: planned ${String(got?.count)}, recorded ${String(recorded.count)}`,
            ];
      });
      expect(mismatches).toEqual([]);
      expect(planned).toEqual(expected);
    },
  );

  it("counts the station patrol 1 in every fixture", () => {
    const patrol = POPULATOR_ENTRIES.find(
      (entry) => entry.name === "oolite-police-stationpatrol",
    );
    for (const { id, fixture } of FIXTURES) {
      expect(fixture.entries[patrol?.ordinal ?? -1]?.count, id).toBe(1);
    }
  });
});

describe("the facts the planner is given are the recorded ones (systemFactsFrom)", () => {
  it("derives the recorded government, economy, tech level and lane lengths from the content", () => {
    for (const { id, fixture } of FIXTURES) {
      const { galaxy, systemIndex } = fixture.header;
      const system = galaxySystems(galaxy).find(
        (candidate) => candidate.systemIndex === systemIndex,
      );
      if (system === undefined) {
        throw new Error(`no content system for ${id}`);
      }
      const layout = deriveSystemLayout(system, stationSpecOf(system.station));
      const facts = systemFactsFrom(
        system,
        buildNeighbourhood(galaxySystems(galaxy), systemIndex),
        layout,
      );
      const recorded = fixture.inputs;
      expect([id, facts.government]).toEqual([id, recorded.government]);
      expect([id, facts.economy]).toEqual([id, recorded.economy]);
      expect([id, facts.techlevel]).toEqual([id, recorded.techLevel]);
      for (const lane of ["l1", "l2", "l3"] as const) {
        expect(
          Math.abs(facts.laneLengths[lane] - recorded.laneLengths[lane]),
          `${id} ${lane}`,
        ).toBeLessThanOrEqual(1e-6 * Math.max(1, recorded.laneLengths[lane]));
      }
    }
  });

  it("plans the recorded counts from facts derived from the content as well", () => {
    for (const { id, fixture } of FIXTURES) {
      const { galaxy, systemIndex } = fixture.header;
      const system = galaxySystems(galaxy).find(
        (candidate) => candidate.systemIndex === systemIndex,
      );
      if (system === undefined) {
        throw new Error(`no content system for ${id}`);
      }
      const facts = systemFactsFrom(
        system,
        buildNeighbourhood(galaxySystems(galaxy), systemIndex),
        deriveSystemLayout(system, stationSpecOf(system.station)),
      );
      expect(planCounts(facts, countDrawsFromFixture(fixture)), id).toEqual(
        recordedCounts(fixture),
      );
    }
  });
});

describe("upstream quirks are ported as written", () => {
  const bottlenecks = FIXTURES.filter(
    ({ fixture }) =>
      fixture.inputs.bottleneck && fixture.inputs.locals.length >= 2,
  );

  it("has the recorded bottleneck systems Arazaes and Timabi in the sample", () => {
    const ids = bottlenecks.map(({ id }) => id);
    expect(ids).toContain("g0-s92-seed1");
    expect(ids).toContain("g3-s239-seed1");
  });

  it("multiplies the running courier sum by 1.5 in a bottleneck system, which the recorded counts need", () => {
    let differing = 0;
    for (const { id, fixture } of bottlenecks) {
      const facts = factsFromFixture(fixture);
      const asWritten = entryRates(facts).couriers;
      const withoutQuirk = entryRates({
        ...facts,
        neighbourhood: { ...facts.neighbourhood, bottleneck: false },
      }).couriers;
      expect(asWritten, id).toBeGreaterThan(withoutQuirk);
      const plainCounts = planCounts(
        {
          ...facts,
          neighbourhood: { ...facts.neighbourhood, bottleneck: false },
        },
        countDrawsFromFixture(fixture),
      );
      if (
        JSON.stringify(plainCounts) !== JSON.stringify(recordedCounts(fixture))
      ) {
        differing += 1;
      }
    }
    // With the quirk removed at least one recorded count would be wrong.
    expect(differing).toBeGreaterThan(0);
  });

  it("takes the third randomise draw even when the rate is 0 (three draws per counted entry)", () => {
    const fixture = loadPopulationFixture("g7-s162-seed1");
    const calls = new Map<number, number>();
    const source = countDrawsFromFixture(fixture);
    const counting: CountDraws = (ordinal) => {
      calls.set(ordinal, (calls.get(ordinal) ?? 0) + 1);
      return source(ordinal);
    };
    planCounts(factsFromFixture(fixture), counting);
    for (const entry of POPULATOR_ENTRIES) {
      const expected = entry.status === "kept" && entry.counted ? 3 : 0;
      expect(calls.get(entry.ordinal) ?? 0, entry.name).toBe(expected);
    }
  });

  it("folds the police rate into the light hunters for government <= 1 and zeroes it", () => {
    const feudal = FIXTURES.filter(
      ({ fixture }) => fixture.inputs.government <= 1,
    );
    expect(feudal.length).toBeGreaterThan(0);
    for (const { id, fixture } of feudal) {
      const rates = entryRates(factsFromFixture(fixture));
      expect(rates.police, id).toBe(0);
      const policeEntries = POPULATOR_ENTRIES.filter(
        (entry) => entry.builder === "policePatrol",
      );
      for (const entry of policeEntries) {
        expect(rates.initial[entry.ordinal], `${id} ${entry.name}`).toBe(0);
      }
    }
  });
});

describe("g7-s162 (zero locals): only the station patrol plans a group", () => {
  const fixture = loadPopulationFixture("g7-s162-seed1");

  it("has no local, a rate of 0 for every counted entry, and the recorded counts", () => {
    const facts = factsFromFixture(fixture);
    expect(facts.neighbourhood.locals).toEqual([]);
    const rates = entryRates(facts);
    for (const entry of POPULATOR_ENTRIES) {
      expect(rates.initial[entry.ordinal], entry.name).toBe(0);
    }
    const planned = planCounts(facts, countDrawsFromFixture(fixture));
    for (const { ordinal, count } of planned) {
      const entry = POPULATOR_ENTRIES[ordinal];
      expect(count, entry?.name).toBe(entry?.counted === false ? 1 : 0);
    }
    expect(
      planned.filter((p) => p.count > 0).map((p) => nameOf(p.ordinal)),
    ).toEqual(["oolite-police-stationpatrol"]);
  });
});

describe("totality (T-22-09): malformed facts never throw", () => {
  const junk = fc.oneof(
    fc.double(),
    fc.integer({ min: -3, max: 20 }),
    fc.constant(undefined),
    fc.constant(null),
    fc.string({ maxLength: 4 }),
  );
  const neighbour = fc.oneof(
    fc.record({
      systemIndex: fc.integer(),
      government: junk,
      economy: junk,
      techLevelRaw: junk,
    }),
    fc.constant(undefined),
    fc.constant(null),
    fc.integer(),
  );
  const neighbours = fc.oneof(
    fc.array(neighbour, { maxLength: 8 }),
    fc.constant(undefined),
    fc.constant(null),
    fc.string({ maxLength: 4 }),
  );
  const neighbourhood = fc.oneof(
    fc.record({
      locals: neighbours,
      seconds: fc.oneof(fc.array(neighbours, { maxLength: 8 }), junk),
      verylocals: neighbours,
      veryseconds: fc.oneof(fc.array(neighbours, { maxLength: 8 }), junk),
      bottleneck: fc.oneof(fc.boolean(), junk),
    }),
    fc.constant(undefined),
    fc.constant(null),
    fc.integer(),
  );
  const lanes = fc.oneof(
    fc.record({ l1: junk, l2: junk, l3: junk }),
    fc.constant(undefined),
    fc.constant(null),
  );
  const facts = fc.record({
    galaxy: junk,
    systemIndex: junk,
    government: junk,
    economy: junk,
    techlevel: junk,
    neighbourhood,
    laneLengths: lanes,
  });

  it("returns an integer in 0..MAX_ENTITIES for every kept entry and finite rates", () => {
    fc.assert(
      fc.property(facts, fc.double(), (malformed, draw) => {
        const asFacts = malformed as unknown as SystemFacts;
        const planned = planCounts(asFacts, () => draw);
        const rates = entryRates(asFacts);
        expect(planned.length).toBe(
          POPULATOR_ENTRIES.filter((entry) => entry.status === "kept").length,
        );
        for (const { count } of planned) {
          expect(Number.isInteger(count)).toBe(true);
          expect(count).toBeGreaterThanOrEqual(0);
          expect(count).toBeLessThanOrEqual(MAX_ENTITIES);
        }
        for (const rate of rates.initial) {
          expect(Number.isFinite(rate)).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("counts an infinite or NaN fact as 0 groups, not a loop", () => {
    const lave = factsFromFixture(loadPopulationFixture("g0-s7-seed1"));
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const planned = planCounts(
        { ...lave, laneLengths: { l1: bad, l2: bad, l3: bad } },
        () => 0.5,
      );
      const laneBuilders = [
        "freighter",
        "courierShort",
        "courierLong",
        "smuggler",
        "lightHunter",
        "independentPirate",
        "policePatrol",
      ];
      for (const { ordinal, count } of planned) {
        const entry = POPULATOR_ENTRIES[ordinal];
        if (entry?.builder != null && laneBuilders.includes(entry.builder)) {
          expect(count, nameOf(ordinal)).toBe(0);
        }
      }
    }
  });
});

describe("pop streams (pitfall C4)", () => {
  const seed = 0x2b4e037c;
  const tags = Object.keys(POPULATION_TAG_CODES) as PopulationTag[];

  it("pins the tag codes (append-only)", () => {
    expect(POPULATION_TAG_CODES).toEqual({
      body: 1,
      system: 2,
      weapons: 3,
      skill: 4,
      pick: 5,
      escort: 6,
      accuracy: 7,
      injector: 8,
      location: 9,
      scatter: 10,
      orient: 11,
      cargo: 12,
    });
    expect(Object.isFrozen(POPULATION_TAG_CODES)).toBe(true);
  });

  it("pins the first draws of one group stream and one count stream", () => {
    expect(populationDraws(seed, 5, 0).nextU32("body")).toBe(3866995023);
    const group = populationDraws(seed, 5, 0);
    group.nextU32("body");
    expect(group.nextU32("body")).toBe(517508503);
    const count = countDraws(seed, 5);
    expect([count(), count(), count()].map((draw) => draw * 2 ** 32)).toEqual([
      60061277, 2578710448, 1443956848,
    ]);
  });

  it("gives the same sequence per tag on every call", () => {
    for (const tag of tags) {
      const first = populationDraws(seed, 7, 3);
      const second = populationDraws(seed, 7, 3);
      const a = [first.next(tag), first.next(tag), first.next(tag)];
      const b = [second.next(tag), second.next(tag), second.next(tag)];
      expect(a, tag).toEqual(b);
      for (const draw of a) {
        expect(draw).toBeGreaterThanOrEqual(0);
        expect(draw).toBeLessThan(1);
      }
    }
  });

  it("separates entries, groups and tags: different (ordinal, group, tag) give different first draws", () => {
    const firsts = new Set<number>();
    let total = 0;
    for (const ordinal of [5, 6, 19]) {
      for (const group of [0, 1, 2]) {
        for (const tag of tags) {
          firsts.add(populationDraws(seed, ordinal, group).nextU32(tag));
          total += 1;
        }
      }
    }
    expect(firsts.size).toBe(total);
  });

  it("keeps one tag's stream independent of the draws taken at another tag", () => {
    const busy = populationDraws(seed, 9, 0);
    for (let at = 0; at < 20; at += 1) {
      busy.next("body");
      busy.next("pick");
    }
    expect(busy.nextU32("skill")).toBe(
      populationDraws(seed, 9, 0).nextU32("skill"),
    );
  });

  it("keeps an entry's count stream independent of every other entry's draws", () => {
    const source = countDrawSource(seed);
    const alone = countDrawSource(seed);
    for (let at = 0; at < 9; at += 1) {
      source(5);
    }
    expect(source(6)).toBe(alone(6));
    // The source continues each entry's own stream.
    const reference = countDraws(seed, 6);
    reference();
    expect(source(6)).toBe(reference());
  });

  it("does not let the count stream equal a group stream of the same entry", () => {
    const count = countDraws(seed, 5)();
    for (const tag of tags) {
      expect(populationDraws(seed, 5, 0).next(tag)).not.toBe(count);
    }
  });

  it("throws a RangeError for an unknown or inherited tag", () => {
    const draws = populationDraws(seed, 5, 0);
    for (const bad of ["constructor", "__proto__", "toString", "nope", ""]) {
      expect(() => draws.next(bad as PopulationTag), bad).toThrow(RangeError);
    }
  });

  it("throws a RangeError for a bad group index, ordinal or seed", () => {
    expect(() => populationDraws(seed, 5, -1)).toThrow(RangeError);
    expect(() => populationDraws(seed, 5, 1.5)).toThrow(RangeError);
    expect(() => populationDraws(seed, -1, 0)).toThrow(RangeError);
    expect(() => populationDraws(Number.NaN, 5, 0)).toThrow(RangeError);
  });

  it("hands the recorded draws through the same interface", () => {
    const fixture = loadPopulationFixture("g0-s7-seed1");
    const group = fixture.groups.find(
      (candidate) => (candidate.draws.body?.length ?? 0) > 1,
    );
    expect(group).toBeDefined();
    if (group === undefined) {
      return;
    }
    const recorded = group.draws.body ?? [];
    const draws = recordedDraws(group);
    expect(draws.nextU32("body")).toBe(recorded[0]);
    expect(draws.next("body")).toBe((recorded[1] ?? 0) / 2 ** 32);
    expect(() => recordedDraws(group).next("location")).toThrow(/location/);
    const used = recordedDraws(group);
    for (let at = 0; at < recorded.length; at += 1) {
      used.next("body");
    }
    expect(() => used.next("body")).toThrow(/body/);
  });
});
