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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { System } from "../../../src/content/types.js";
import {
  LONG_COURIER_RANGE_LY,
  NEIGHBOUR_RANGE_LY,
  VERY_NEAR_RANGE_LY,
  buildNeighbourhood,
  systemsInRange,
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
