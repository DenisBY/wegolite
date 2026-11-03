// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Goldens for the system projection (DATA-05, D-22, D-25, T-02-05, T-02-14).
 *
 * The pinned `planetinfo.plist` carries 2,050 top-level keys: 2,048 systems
 * plus `universal` and `interstellar space`. This suite pins the parts a
 * regenerated chunk could otherwise hide: exact chunk sizes, the stable
 * `g{galaxy}-s{index}` identity, numeric ascending order, the one-system
 * `percent_cloud` present-vs-absent case, the explicit rejection of a third
 * non-system key, and the two tuple shapes (colours are 4 components, vectors
 * are 3 — grouping them would reject every record).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SystemColorSchema,
  SystemSchema,
  SystemVectorSchema,
} from "../../../src/content/schemas/system.js";
import type { System } from "../../../src/content/schemas/system.js";
import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import { compileSystems } from "./systems.js";

const PLIST = "third_party/oolite/Config/planetinfo.plist";

const COLOUR_KEYS = [
  "air_color",
  "cloud_color",
  "land_color",
  "polar_cloud_color",
  "polar_land_color",
  "polar_sea_color",
  "sea_color",
  "sun_color",
] as const;

const VECTOR_KEYS = [
  "stationVector",
  "sunVector",
  "terminatorThresholdVector",
] as const;

const source = readFileSync(
  new URL(
    "../../../third_party/oolite/Config/planetinfo.plist",
    import.meta.url,
  ),
  "utf8",
);

/** The researched Lave values, generated from the committed `g0.json`. */
interface LaveFixture {
  readonly version: number;
  readonly id: string;
  readonly galaxy: number;
  readonly systemIndex: number;
  readonly name: string;
  readonly chartX: number;
  readonly chartY: number;
  readonly economy: number;
  readonly government: number;
  readonly techLevelRaw: number;
  readonly population: number;
  readonly productivity: number;
  readonly radiusKm: number;
  readonly planetDistance: number;
  readonly sunDistance: number;
  readonly sunRadius: number;
  readonly station: string;
  readonly stationVector: readonly number[];
  readonly sunVector: readonly number[];
  readonly terminatorThresholdVector: readonly number[];
  readonly description: string;
  readonly random_seed: string;
  readonly percentCloud: number;
}

const laveFixture = JSON.parse(
  readFileSync(
    new URL("../../../tests/golden/content/lave.json", import.meta.url),
    "utf8",
  ),
) as LaveFixture;

const galaxies = compileSystems(parseOpenStep(source, PLIST));
const allSystems = galaxies.flat();

function find(id: string): System {
  const record = allSystems.find((system) => system.id === id);
  if (record === undefined) throw new Error(`system "${id}" is missing`);
  return record;
}

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a ContentError, but no error was thrown");
}

describe("system chunks", () => {
  it("emits 2,048 systems in eight chunks of exactly 256", () => {
    expect(galaxies).toHaveLength(8);
    for (const [galaxy, chunk] of galaxies.entries()) {
      expect(chunk, `galaxy ${String(galaxy)}`).toHaveLength(256);
    }
    expect(allSystems).toHaveLength(2048);
  });

  it("derives unique g{galaxy}-s{index} ids that agree with galaxy and systemIndex", () => {
    const ids = new Set<string>();
    for (const system of allSystems) {
      expect(system.id).toMatch(/^g[0-7]-s(?:25[0-5]|2[0-4]\d|1?\d?\d)$/);
      expect(system.id).toBe(
        `g${String(system.galaxy)}-s${String(system.systemIndex)}`,
      );
      expect(ids.has(system.id)).toBe(false);
      ids.add(system.id);
    }
    expect(ids.size).toBe(2048);
  });

  it("orders each chunk by ascending numeric systemIndex", () => {
    for (const chunk of galaxies) {
      for (let index = 1; index < chunk.length; index++) {
        const previous = chunk[index - 1];
        const current = chunk[index];
        if (previous === undefined || current === undefined) {
          throw new Error("unexpected sparse chunk");
        }
        expect(current.systemIndex).toBe(previous.systemIndex + 1);
      }
    }
  });

  it("keeps percent_cloud present on Lave and absent on g0-s8", () => {
    const lave = find("g0-s7");
    expect(lave.name).toBe("Lave");
    expect(lave.percentCloud).toBe(85);
    expect("percentCloud" in lave).toBe(true);

    const neighbour = find("g0-s8");
    expect("percentCloud" in neighbour).toBe(false);
    // The plain array is sorted in code-unit order and lists the authored key.
    expect(lave.presentFields).toContain("percent_cloud");
    expect(neighbour.presentFields).not.toContain("percent_cloud");
  });

  it("rejects a third non-system top-level key instead of skipping it", () => {
    const synthetic = parseOpenStep(
      `{
        universal = { sky_n_stars = 1; };
        "interstellar space" = { sky_n_stars = 1; };
        "weird key" = { name = "Nope"; };
      }`,
      "synthetic.plist",
    );

    const error = capture(() => compileSystems(synthetic));
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(PLIST);
    expect(error.construct).toBe("weird key");
    expect(error.message).toMatch(/weird key/);
  });

  it("validates every record and keeps 4-component colours distinct from 3-component vectors", () => {
    for (const system of allSystems) {
      expect(SystemSchema.safeParse(system).success).toBe(true);
      for (const key of COLOUR_KEYS) {
        expect(system[key]).toHaveLength(4);
      }
      for (const key of VECTOR_KEYS) {
        expect(system[key]).toHaveLength(3);
      }
    }

    const lave = find("g0-s7");
    expect(SystemColorSchema.safeParse([1, 0, 0, 1]).success).toBe(true);
    expect(SystemVectorSchema.safeParse([1, 0, 0]).success).toBe(true);
    // A 3-component colour and a 4-component vector are each rejected, so the
    // two tuple schemas are not interchangeable.
    expect(
      SystemSchema.safeParse({ ...lave, air_color: [1, 0, 0] }).success,
    ).toBe(false);
    expect(
      SystemSchema.safeParse({ ...lave, sunVector: [1, 0, 0, 1] }).success,
    ).toBe(false);
  });
});

describe("Lave golden fixture", () => {
  it("pins every researched field with exact equality", () => {
    expect(laveFixture.version).toBe(1);
    const lave = find(laveFixture.id);
    expect(lave.id).toBe("g0-s7");
    expect(lave.galaxy).toBe(laveFixture.galaxy);
    expect(lave.systemIndex).toBe(laveFixture.systemIndex);
    expect(lave.name).toBe(laveFixture.name);
    expect(lave.chartX).toBe(laveFixture.chartX);
    expect(lave.chartY).toBe(laveFixture.chartY);
    expect(lave.economy).toBe(laveFixture.economy);
    expect(lave.government).toBe(laveFixture.government);
    expect(lave.techLevelRaw).toBe(laveFixture.techLevelRaw);
    expect(lave.population).toBe(laveFixture.population);
    expect(lave.productivity).toBe(laveFixture.productivity);
    expect(lave.radiusKm).toBe(laveFixture.radiusKm);
    expect(lave.planetDistance).toBe(laveFixture.planetDistance);
    expect(lave.sunDistance).toBe(laveFixture.sunDistance);
    expect(lave.sunRadius).toBe(laveFixture.sunRadius);
    expect(lave.station).toBe(laveFixture.station);
    expect(lave.stationVector[0]).toBe(laveFixture.stationVector[0]);
    expect(lave.stationVector[1]).toBe(laveFixture.stationVector[1]);
    expect(lave.stationVector[2]).toBe(laveFixture.stationVector[2]);
    expect(lave.sunVector[0]).toBe(laveFixture.sunVector[0]);
    expect(lave.sunVector[1]).toBe(laveFixture.sunVector[1]);
    expect(lave.sunVector[2]).toBe(laveFixture.sunVector[2]);
    expect(lave.terminatorThresholdVector[0]).toBe(
      laveFixture.terminatorThresholdVector[0],
    );
    expect(lave.terminatorThresholdVector[1]).toBe(
      laveFixture.terminatorThresholdVector[1],
    );
    expect(lave.terminatorThresholdVector[2]).toBe(
      laveFixture.terminatorThresholdVector[2],
    );
    expect(lave.description).toBe(laveFixture.description);
    expect(lave.random_seed).toBe(laveFixture.random_seed);
    expect(lave.percentCloud).toBe(laveFixture.percentCloud);
  });

  it("stores the raw tech level and no display-adjusted field", () => {
    const lave = find("g0-s7");
    expect(lave.techLevelRaw).toBe(4);
    expect("techLevelDisplay" in lave).toBe(false);
    expect("techLevel" in lave).toBe(false);
    // radiusKm is the authored kilometres, not Oolite's ×10 game units.
    expect(lave.radiusKm).toBe(4116);
    // `station` stays the role fragment, not the resolved shipdata key.
    expect(lave.station).toBe("coriolis");
  });
});
