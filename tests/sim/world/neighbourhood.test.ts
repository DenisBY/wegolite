// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The neighbourhood facts of the initial populator (Phase 22, WORLD-08). The
 * oracle is Oolite's own script: `tests/oracles/population/fixtures/` holds
 * what `oolite-populator.js` read for each recorded system (the locals, the
 * very locals, the 25 LY count and its own `_systemIsBottleneck` value) and
 * `neighbourhood-all.json` holds the same facts for all 2,048 systems, recorded
 * from a separate transliteration of `legacy_random.h:154-160`. The port is
 * compared with those files; the files are never edited to match the port.
 */

import { readFileSync, readdirSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { System } from "../../../src/content/types.js";
import {
  LONG_COURIER_RANGE_LY,
  NEIGHBOUR_RANGE_LY,
  VERY_NEAR_RANGE_LY,
  buildNeighbourhood,
  systemsInRange,
  type Neighbour,
  type NeighbourSystem,
} from "../../../src/sim/world/neighbourhood.js";
import { decodePopulationFixture } from "../../oracles/population/codec.js";
import { NeighbourhoodTableSchema } from "../../oracles/population/schema.js";

const FIXTURE_DIR = "../../oracles/population/fixtures/";

function readJson(url: string): unknown {
  return JSON.parse(readFileSync(new URL(url, import.meta.url), "utf8"));
}

function loadGalaxy(galaxy: number): readonly System[] {
  return readJson(
    `../../../src/content/generated/systems/g${String(galaxy)}.json`,
  ) as System[];
}

function loadFixture(name: string) {
  return decodePopulationFixture(readJson(`${FIXTURE_DIR}${name}.json`));
}

const TABLE = NeighbourhoodTableSchema.parse(
  readJson(`${FIXTURE_DIR}neighbourhood-all.json`),
);

/** A synthetic system on the chart; only the geometry matters here. */
function at(systemIndex: number, chartX: number, chartY = 0): NeighbourSystem {
  return {
    systemIndex,
    chartX,
    chartY,
    government: 0,
    economy: 0,
    techLevelRaw: 0,
  };
}

describe("neighbourhood ranges (oolite-global-prefix.js:80-91, legacy_random.h:154-160)", () => {
  it("names the three ranges the populator asks for", () => {
    expect([
      NEIGHBOUR_RANGE_LY,
      VERY_NEAR_RANGE_LY,
      LONG_COURIER_RANGE_LY,
    ]).toEqual([7, 3.5, 25]);
  });

  it.each([
    [NEIGHBOUR_RANGE_LY, 17, 18],
    [VERY_NEAR_RANGE_LY, 8, 9],
    [LONG_COURIER_RANGE_LY, 62, 63],
  ])(
    "is inclusive at %s LY: chart distance %i is in, %i is out",
    (rangeLy, within, beyond) => {
      expect(systemsInRange([at(0, 0), at(1, within)], 0, rangeLy)).toEqual([
        1,
      ]);
      expect(systemsInRange([at(0, 0), at(1, beyond)], 0, rangeLy)).toEqual([]);
    },
  );

  it("reads the vertical chart axis at half weight with C truncation", () => {
    // dy = trunc(34 / 2) = 17: in range at 7 LY, 36 / 2 = 18 is not.
    expect(systemsInRange([at(0, 0, 0), at(1, 0, 34)], 0, 7)).toEqual([1]);
    expect(systemsInRange([at(0, 0, 0), at(1, 0, 36)], 0, 7)).toEqual([]);
  });

  it("answers distanceTo as 0.4 times the chart distance, undefined for an unknown index", () => {
    const hood = buildNeighbourhood([at(0, 0), at(1, 17), at(2, 60)], 0);
    expect(hood.distanceTo(1)).toBe(0.4 * 17);
    expect(hood.distanceTo(2)).toBe(0.4 * 60);
    expect(hood.distanceTo(0)).toBe(0);
    expect(hood.distanceTo(99)).toBeUndefined();
  });
});

describe("tracer: Lave (g0-s7) reproduces the recorded populator inputs", () => {
  const fixture = loadFixture("g0-s7-seed1");
  const galaxy = loadGalaxy(fixture.header.galaxy);
  const hood = buildNeighbourhood(galaxy, fixture.header.systemIndex);
  const row = TABLE.galaxies[fixture.header.galaxy];

  it("has the recorded locals with government, economy and tech level", () => {
    expect(
      hood.locals.map((n) => ({
        id: n.systemIndex,
        government: n.government,
        economy: n.economy,
        techLevel: n.techLevelRaw,
      })),
    ).toEqual(fixture.inputs.locals);
  });

  it("has the recorded very locals", () => {
    expect(
      hood.verylocals.map((n) => ({
        id: n.systemIndex,
        government: n.government,
        economy: n.economy,
        techLevel: n.techLevelRaw,
      })),
    ).toEqual(fixture.inputs.verylocals);
  });

  it("has each local's own neighbours as the recorded table row lists them", () => {
    hood.locals.forEach((local, i) => {
      expect(hood.seconds[i]?.map((n) => n.systemIndex)).toEqual(
        row?.locals[local.systemIndex],
      );
    });
    hood.verylocals.forEach((local, i) => {
      expect(hood.veryseconds[i]?.map((n) => n.systemIndex)).toEqual(
        row?.verylocals[local.systemIndex],
      );
    });
  });

  it("has the recorded 25 LY count and bottleneck", () => {
    expect(hood.inRange(LONG_COURIER_RANGE_LY)).toHaveLength(
      fixture.inputs.within25Count,
    );
    expect(hood.bottleneck).toBe(fixture.inputs.bottleneck);
  });
});

describe("all 2,048 systems equal Oolite's recorded table", () => {
  it("returns the 7 LY ids, 3.5 LY ids, 25 LY count and bottleneck of every system", () => {
    const mismatches: string[] = [];
    let systems = 0;
    for (const row of TABLE.galaxies) {
      const galaxy = loadGalaxy(row.galaxy);
      expect(galaxy).toHaveLength(256);
      for (const system of galaxy) {
        systems += 1;
        const id = `g${String(row.galaxy)}-s${String(system.systemIndex)}`;
        const hood = buildNeighbourhood(galaxy, system.systemIndex);
        const ids = (list: readonly Neighbour[]) =>
          list.map((n) => n.systemIndex);
        const checks: readonly (readonly [string, unknown, unknown])[] = [
          ["locals", ids(hood.locals), row.locals[system.systemIndex]],
          [
            "verylocals",
            ids(hood.verylocals),
            row.verylocals[system.systemIndex],
          ],
          [
            "within25",
            hood.inRange(LONG_COURIER_RANGE_LY).length,
            row.within25[system.systemIndex],
          ],
          [
            "bottleneck",
            hood.bottleneck,
            row.bottleneck.includes(system.systemIndex),
          ],
          [
            "seconds",
            hood.seconds.map(ids),
            hood.locals.map((n) => row.locals[n.systemIndex]),
          ],
          [
            "veryseconds",
            hood.veryseconds.map(ids),
            hood.verylocals.map((n) => row.verylocals[n.systemIndex]),
          ],
        ];
        for (const [field, got, want] of checks) {
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            mismatches.push(
              `${id} ${field}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`,
            );
          }
        }
      }
    }
    expect(systems).toBe(2048);
    expect(mismatches).toEqual([]);
  });
});

describe("every recorded population fixture's inputs are reproduced", () => {
  const names = readdirSync(new URL(FIXTURE_DIR, import.meta.url))
    .filter((name) => /^g\d-s\d+-seed\d+\.json$/.test(name))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();

  it("finds the recorded fixtures", () => {
    expect(names.length).toBeGreaterThanOrEqual(60);
  });

  it.each(names)("%s", (name) => {
    const { header, inputs } = loadFixture(name);
    const hood = buildNeighbourhood(
      loadGalaxy(header.galaxy),
      header.systemIndex,
    );
    const row = TABLE.galaxies[header.galaxy];
    const facts = (list: readonly Neighbour[]) =>
      list.map((n) => ({
        id: n.systemIndex,
        government: n.government,
        economy: n.economy,
        techLevel: n.techLevelRaw,
      }));
    expect(facts(hood.locals)).toEqual(inputs.locals);
    expect(facts(hood.verylocals)).toEqual(inputs.verylocals);
    expect(hood.inRange(LONG_COURIER_RANGE_LY)).toHaveLength(
      inputs.within25Count,
    );
    expect(hood.bottleneck).toBe(inputs.bottleneck);
    // The script's `seconds` of each neighbour: the table row of that neighbour.
    expect(hood.seconds.map((s) => s.map((n) => n.systemIndex))).toEqual(
      hood.locals.map((n) => row?.locals[n.systemIndex]),
    );
    expect(hood.veryseconds.map((s) => s.map((n) => n.systemIndex))).toEqual(
      hood.verylocals.map((n) => row?.verylocals[n.systemIndex]),
    );
  });
});

describe("empty and ordering edges", () => {
  it("g7-s162 Oresrati has no system within 7 LY and is not a bottleneck", () => {
    const hood = buildNeighbourhood(loadGalaxy(7), 162);
    expect(hood.locals).toEqual([]);
    expect(hood.seconds).toEqual([]);
    expect(hood.verylocals).toEqual([]);
    expect(hood.bottleneck).toBe(false);
    expect(hood.inRange(NEIGHBOUR_RANGE_LY)).toEqual([]);
  });

  it("a galaxy holding only the current system gives empty lists", () => {
    const hood = buildNeighbourhood([at(5, 10, 10)], 5);
    expect(hood.locals).toEqual([]);
    expect(hood.verylocals).toEqual([]);
    expect(hood.bottleneck).toBe(false);
    expect(hood.inRange(LONG_COURIER_RANGE_LY)).toEqual([]);
    expect(hood.distanceTo(5)).toBe(0);
  });

  it("an empty galaxy or an unknown current system gives empty lists", () => {
    for (const hood of [
      buildNeighbourhood([], 0),
      buildNeighbourhood([at(1, 0)], 2),
    ]) {
      expect(hood.locals).toEqual([]);
      expect(hood.bottleneck).toBe(false);
      expect(hood.inRange(7)).toEqual([]);
      expect(hood.distanceTo(0)).toBeUndefined();
    }
  });

  it("returns ascending lists for a shuffled galaxy, without the current system", () => {
    const galaxy = loadGalaxy(0);
    const shuffled = [...galaxy].sort(
      (a, b) => ((a.systemIndex * 7919) % 257) - ((b.systemIndex * 7919) % 257),
    );
    expect(shuffled.map((s) => s.systemIndex)).not.toEqual(
      galaxy.map((s) => s.systemIndex),
    );
    for (const index of [7, 92, 219]) {
      const sorted = buildNeighbourhood(galaxy, index);
      const hood = buildNeighbourhood(shuffled, index);
      expect(hood.locals).toEqual(sorted.locals);
      expect(hood.seconds).toEqual(sorted.seconds);
      expect(hood.bottleneck).toBe(sorted.bottleneck);
      const ids = hood.inRange(LONG_COURIER_RANGE_LY);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(ids).not.toContain(index);
      expect(hood.locals.map((n) => n.systemIndex)).not.toContain(index);
    }
  });

  it("is a bottleneck when the locals split without the current system", () => {
    // 1 and 2 are 32 apart, so they connect only through 0; 3 is out of range.
    const galaxy = [at(0, 16), at(1, 0), at(2, 32), at(3, 48)];
    const hood = buildNeighbourhood(galaxy, 0);
    expect(hood.locals.map((n) => n.systemIndex)).toEqual([1, 2]);
    expect(hood.bottleneck).toBe(true);
    // 1 and 2 are 16 apart: within 7 LY of each other, so one component.
    const joined = buildNeighbourhood([at(0, 8), at(1, 0), at(2, 16)], 0);
    expect(joined.bottleneck).toBe(false);
  });
});

describe("malformed galaxies (T-22-04, totality)", () => {
  const good = [at(0, 0), at(1, 10), at(2, 20), at(3, 30)];

  it("drops a record with a non-finite or non-integer chart coordinate before any distance", () => {
    const bad: unknown[] = [
      { ...at(9, 5), chartX: Number.NaN },
      { ...at(10, 5), chartY: Infinity },
      { ...at(11, 5), chartX: 5.5 },
      { ...at(12, 5), chartY: "5" },
    ];
    const hood = buildNeighbourhood([...bad, ...good], 0);
    expect(hood.locals.map((n) => n.systemIndex)).toEqual([1]);
    expect(hood.inRange(25)).toEqual([1, 2, 3]);
    expect(hood.distanceTo(9)).toBeUndefined();
  });

  it("drops a record whose chart coordinate is outside the byte range, so chartDistance cannot overflow", () => {
    const extreme = [9e15, -9e15, 1e300, -1e300, 256, -1, Number.MAX_VALUE];
    const bad: unknown[] = extreme.flatMap((value, k) => [
      { ...at(20 + k, 5), chartX: value },
      { ...at(40 + k, 5), chartY: value },
    ]);
    const hood = buildNeighbourhood([...bad, ...good], 0);
    expect(hood.locals.map((n) => n.systemIndex)).toEqual([1]);
    expect(hood.inRange(25)).toEqual([1, 2, 3]);
    expect(hood.distanceTo(20)).toBeUndefined();
  });

  it("never throws for any numeric chart coordinate of any magnitude", () => {
    const coordinate = fc.oneof(
      fc.constantFrom(
        9e15,
        -9e15,
        2 ** 53,
        -(2 ** 53),
        1e300,
        -1e300,
        Number.NaN,
        Infinity,
        -Infinity,
      ),
      fc.integer({ min: -(2 ** 53), max: 2 ** 53 }),
      fc.double({ noNaN: false }),
    );
    fc.assert(
      fc.property(
        fc.array(fc.tuple(coordinate, coordinate), { maxLength: 8 }),
        (coordinates) => {
          const galaxy = [
            ...coordinates.map(([x, y], k) => at(k + 1, x, y)),
            // Two valid records pair with the extreme ones.
            at(100, 0, 0),
            at(101, 255, 255),
          ];
          for (const current of [0, 1, 100, 101]) {
            const hood = buildNeighbourhood(galaxy, current);
            expect(hood.inRange(25)).toBeDefined();
            expect(systemsInRange(galaxy, current, 25)).toBeDefined();
            expect(Number.isNaN(hood.distanceTo(100) ?? 0)).toBe(false);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("drops non-objects, bad indices and later duplicates", () => {
    const junk: unknown[] = [
      null,
      7,
      "x",
      undefined,
      at(-1, 1),
      at(256, 1),
      at(1.5, 1),
      { ...at(4, 1), systemIndex: Number.NaN },
      at(1, 2000),
    ];
    const hood = buildNeighbourhood([...good, ...junk], 0);
    expect(hood.locals.map((n) => n.systemIndex)).toEqual([1]);
    expect(hood.distanceTo(1)).toBe(0.4 * 10);
  });

  it("answers any current system index without throwing", () => {
    for (const index of [-1, 256, 1.5, Number.NaN, Infinity]) {
      expect(buildNeighbourhood(good, index).locals).toEqual([]);
      expect(systemsInRange(good, index, 7)).toEqual([]);
    }
    for (const range of [Number.NaN, -1, Infinity]) {
      expect(() => systemsInRange(good, 0, range)).not.toThrow();
    }
  });

  const weirdNumber = fc.oneof(
    fc.integer({ min: -20, max: 300 }),
    fc.double({ noNaN: false }),
    fc.constantFrom(Number.NaN, Infinity, -Infinity),
  );
  const weirdRecord = fc.oneof(
    fc.record(
      {
        systemIndex: weirdNumber,
        chartX: fc.oneof(weirdNumber, fc.string()),
        chartY: weirdNumber,
        government: weirdNumber,
        economy: weirdNumber,
        techLevelRaw: weirdNumber,
      },
      { requiredKeys: [] },
    ),
    fc.record({
      systemIndex: fc.integer({ min: 0, max: 255 }),
      chartX: fc.integer({ min: 0, max: 255 }),
      chartY: fc.integer({ min: 0, max: 255 }),
      government: fc.integer({ min: 0, max: 7 }),
      economy: fc.integer({ min: 0, max: 7 }),
      techLevelRaw: fc.integer({ min: 0, max: 14 }),
    }),
    fc.constantFrom(null, undefined, 3, "g0-s7"),
  );

  it("never throws and returns only in-range, ascending ids over arbitrary galaxies", () => {
    fc.assert(
      fc.property(
        fc.array(weirdRecord, { maxLength: 60 }),
        weirdNumber,
        weirdNumber,
        (galaxy, from, range) => {
          const hood = buildNeighbourhood(galaxy, from);
          const lists = [
            hood.locals,
            hood.verylocals,
            ...hood.seconds,
            ...hood.veryseconds,
          ].map((list) => list.map((n) => n.systemIndex));
          for (const list of [
            ...lists,
            hood.inRange(range),
            systemsInRange(galaxy, from, range),
          ]) {
            for (const [position, id] of list.entries()) {
              expect(Number.isInteger(id)).toBe(true);
              expect(id).toBeGreaterThanOrEqual(0);
              expect(id).toBeLessThanOrEqual(255);
              if (position > 0) {
                expect(id).toBeGreaterThan(list[position - 1] ?? Infinity);
              }
            }
          }
          expect(hood.seconds).toHaveLength(hood.locals.length);
          expect(hood.veryseconds).toHaveLength(hood.verylocals.length);
          expect(typeof hood.bottleneck).toBe("boolean");
          expect(Number.isNaN(hood.distanceTo(from) ?? 0)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
});
