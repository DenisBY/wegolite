// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The planet field mirror and its calibration (WORLD-03, G-03-1).
 *
 * Every number below is a *measurement* on the deterministic 4,096-direction
 * Fibonacci sphere for the pinned system `g0-s7` (Lave), whose authored
 * `random_seed` is `"56 173 156 20 29 21"` (`seedToUniform = 49.192859`).
 * None is a taste value: the mirror exists so `land_fraction`,
 * `cloud_fraction` and `percent_ice` can be asserted instead of eyeballed.
 *
 * The tolerances are distribution-level by construction. The GLSL field is
 * float32 and this mirror is float64; the six-octave loop pushes the hash
 * product to ~2.5e5, where a float32 ULP is ~0.016. A per-sample equality
 * would be meaningless, so every assertion is a quantile, a share or a band
 * fraction.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { seedToUniform } from "../../src/render/bodies/planet.js";
import {
  calibrateClouds,
  calibrateSurface,
  classifySurface,
  fbm,
  fibonacciDirections,
  hash31,
  measuredIceFraction,
  measuredIceLatitudeRange,
  measuredLandFraction,
  measuredQRange,
  sampleCloud,
  sampleSurface,
  valueNoise,
} from "../../src/render/planet-noise.js";
import type {
  SurfaceCalibration,
  TerrainClass,
} from "../../src/render/planet-noise.js";
import { laveFixture } from "../helpers/lave.js";

const { system } = laveFixture();
const SEED = seedToUniform(system.random_seed);
const LAND_FRACTION = system.land_fraction;
const CLOUD_FRACTION = system.cloud_fraction;
const POLAR_FRACTION = 0.05;

const DIRECTIONS = fibonacciDirections();

function classShares(
  calibration: SurfaceCalibration,
): Map<TerrainClass, number> {
  const counts = new Map<TerrainClass, number>();
  for (const direction of DIRECTIONS) {
    const { class: terrain } = classifySurface(direction, SEED, calibration);
    counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
  }
  const shares = new Map<TerrainClass, number>();
  for (const [terrain, count] of counts) {
    shares.set(terrain, count / DIRECTIONS.length);
  }
  return shares;
}

const CALIBRATION = calibrateSurface(SEED, LAND_FRACTION, POLAR_FRACTION);

describe("noise mirror", () => {
  it("is the same field on the lattice: valueNoise at an integer is hash31", () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: -2, z: 5 },
      { x: -7, y: 11, z: -13 },
    ];
    for (const point of points) {
      expect(valueNoise(point)).toBe(hash31(point));
    }
  });

  it("keeps valueNoise in [0, 1] and fbm deterministic", () => {
    const points = [
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 12.25, y: -3.75, z: 8.125 },
      { x: -41.5, y: 2.5, z: 0.125 },
    ];
    for (const point of points) {
      const noise = valueNoise(point);
      expect(noise).toBeGreaterThanOrEqual(0);
      expect(noise).toBeLessThanOrEqual(1);

      const first = fbm(point, 6);
      const second = fbm(point, 6);
      expect(first).toBe(second);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic and free of randomness, clocks and Three", () => {
    const source = readFileSync(
      new URL("../../src/render/planet-noise.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/Math\s*\.\s*random\s*\(/);
    expect(source).not.toMatch(/new\s+Date\s*\(/);
    expect(source).not.toMatch(/Date\s*\.\s*now/);
    expect(source).not.toContain('from "three"');
    expect(source).not.toContain("from 'three'");
  });
});

describe("Fibonacci sphere sampler", () => {
  it("fills equal-y (equal sin-latitude) bins evenly", () => {
    // Equal-y bins, not equal-degree bins: |y| is uniformly distributed by
    // construction, so each of 18 bins should hold 1/18 of the samples.
    const bins = new Array<number>(18).fill(0);
    for (const direction of DIRECTIONS) {
      const index = Math.min(17, Math.floor(((direction.y + 1) / 2) * 18));
      bins[index] = (bins[index] as number) + 1;
    }

    const expected = 1 / 18;
    for (const count of bins) {
      expect(Math.abs(count / DIRECTIONS.length - expected)).toBeLessThan(0.02);
    }

    expect(DIRECTIONS).toHaveLength(4096);
    for (const direction of DIRECTIONS) {
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(
        1,
        12,
      );
    }
  });
});

describe("calibrated surface (pinned system g0-s7, seed 49.192859)", () => {
  it("matches the pinned seed", () => {
    expect(SEED).toBeCloseTo(49.192859, 6);
    expect(LAND_FRACTION).toBe(0.65);
    expect(CLOUD_FRACTION).toBe(0.26);
  });

  it("turns land_fraction into the measured land share ±2 points", () => {
    for (const [fraction, expected] of [
      [0.65, 0.6499],
      [0.3, 0.2996],
      [0.85, 0.8496],
    ] as const) {
      const calibration = calibrateSurface(SEED, fraction, POLAR_FRACTION);
      const measured = measuredLandFraction(calibration, SEED);

      expect(measured).toBeGreaterThan(fraction - 0.02);
      expect(measured).toBeLessThan(fraction + 0.02);
      expect(measured).toBeCloseTo(expected, 2);
    }
  });

  it("beats the uncalibrated threshold by a wide margin", () => {
    // Negative control: the raw field cut at `1 - land_fraction`, exactly what
    // the pre-fix threshold did to the normalised field, is 88.8% land.
    const rawLand =
      DIRECTIONS.filter(
        (direction) => sampleSurface(direction, SEED) > 1 - LAND_FRACTION,
      ).length / DIRECTIONS.length;

    expect(rawLand).toBeCloseTo(0.8879, 3);
    expect(rawLand).toBeGreaterThan(0.8);
    expect(Math.abs(rawLand - LAND_FRACTION)).toBeGreaterThan(0.02);

    // The same naive cut on the *normalised* field is a different (and only
    // slightly less wrong) number; it must not be confused with the control.
    let normalisedLand = 0;
    for (const direction of DIRECTIONS) {
      const raw = sampleSurface(direction, SEED);
      const u = Math.min(
        1,
        Math.max(0, (raw - CALIBRATION.noiseLo) * CALIBRATION.noiseScale),
      );
      if (u > 1 - LAND_FRACTION) normalisedLand++;
    }
    expect(normalisedLand / DIRECTIONS.length).toBeCloseTo(0.7466, 3);
  });

  it("puts the snowline strictly below the reachable top", () => {
    const { min, max } = measuredQRange(CALIBRATION, SEED);

    expect(CALIBRATION.mixHi).toBeCloseTo(0.2858, 2);
    expect(CALIBRATION.mixHi).toBe(0.66667 * (1 + CALIBRATION.seaBias));
    expect(max).toBeCloseTo(0.42871, 4);
    expect(min).toBeCloseTo(-0.49191, 4);
    expect(CALIBRATION.mixHi).toBeLessThan(max);

    const shares = classShares(CALIBRATION);
    const highland = shares.get("highland") ?? 0;
    expect(highland).toBeGreaterThanOrEqual(0.011);
    expect(highland).toBeLessThanOrEqual(0.018);
    expect(highland).toBeCloseTo(0.0142, 3);

    // Regression guards: the literal Oolite formula on the calibrated field
    // sits above its top, and the pre-fix seed bias overshoots the band.
    const literalRule = { ...CALIBRATION, mixHi: 0.66667 * LAND_FRACTION };
    expect(literalRule.mixHi).toBeGreaterThan(max);
    expect(classShares(literalRule).get("highland") ?? 0).toBe(0);

    const oldBias = {
      ...CALIBRATION,
      seaBias: 0.26978,
      mixHi: 0.66667 * (1 + 0.26978),
    };
    // The pre-fix positive bias lifts q above every band edge and the ice
    // override then swallows the highland class; either way the share leaves
    // the accepted band, which is the point of the guard.
    const oldHighland = classShares(oldBias).get("highland") ?? 0;
    expect(oldHighland < 0.011 || oldHighland > 0.018).toBe(true);
  });

  it("proves the q > 1 peak branch unreachable for a base system", () => {
    const shares = classShares(CALIBRATION);

    expect(measuredQRange(CALIBRATION, SEED).max).toBeLessThan(1);
    expect(shares.get("snow") ?? 0).toBe(0);
  });

  it("covers all seven reachable PlanetMix classes", () => {
    const shares = classShares(CALIBRATION);
    const expected: ReadonlyArray<readonly [TerrainClass, number]> = [
      ["deep", 0.0566],
      ["sea", 0.2788],
      ["shelf", 0.0146],
      ["coast", 0.011],
      ["land", 0.4321],
      ["highland", 0.0142],
      ["ice", 0.1926],
    ];

    for (const [terrain, share] of expected) {
      const measured = shares.get(terrain) ?? 0;
      expect(measured, `${terrain} share`).toBeGreaterThan(0.001);
      expect(measured, `${terrain} share`).toBeCloseTo(share, 3);
    }
    expect(shares.get("snow") ?? 0).toBe(0);
  });

  it("does not render the sea as one flat colour", () => {
    const sea = classShares(CALIBRATION);
    const seaShare =
      (sea.get("sea") ?? 0) + (sea.get("shelf") ?? 0) + (sea.get("deep") ?? 0);

    expect(seaShare).toBeGreaterThanOrEqual(0.3);
    expect(seaShare).toBeCloseTo(0.3501, 3);
    // The deep branch alone is below 0.1; assert it at its own measurement.
    expect(sea.get("deep") ?? 0).toBeGreaterThanOrEqual(0.05);
    expect(sea.get("deep") ?? 0).toBeCloseTo(0.0566, 3);
  });
});

describe("calibrated polar cap (pinned system g0-s7)", () => {
  it("derives the cap from percent_ice and covers the pole", () => {
    expect(CALIBRATION.polarCap).toBeCloseTo(0.4142, 4);

    expect(measuredIceFraction(CALIBRATION, SEED, 60, 90)).toBeGreaterThan(
      0.95,
    );
    expect(measuredIceFraction(CALIBRATION, SEED, 0, 5)).toBeLessThan(0.02);
    expect(measuredIceFraction(CALIBRATION, SEED, 35, 45)).toBeLessThan(0.01);
    expect(
      measuredIceFraction(CALIBRATION, SEED, 45, 55),
    ).toBeGreaterThanOrEqual(0.1);
    expect(measuredIceFraction(CALIBRATION, SEED, 45, 55)).toBeLessThanOrEqual(
      0.25,
    );

    const range = measuredIceLatitudeRange(CALIBRATION, SEED);
    expect(range.minAbsLatitude).toBeGreaterThanOrEqual(46);
    expect(range.minAbsLatitude).toBeLessThanOrEqual(53);
    expect(range.minAbsLatitude).toBeCloseTo(49.59, 1);
    expect(range.maxAbsLatitude).toBeCloseTo(88.73, 1);

    // Band semantics: the denominator is the band, so a whole-sphere reading is
    // a different number and is not what any band assertion above measured.
    expect(measuredIceFraction(CALIBRATION, SEED, 0)).toBeCloseTo(0.1926, 3);
  });

  it("grows the cap when the authored ice fraction grows", () => {
    const warmer = calibrateSurface(SEED, LAND_FRACTION, POLAR_FRACTION);
    const colder = calibrateSurface(SEED, LAND_FRACTION, 0.5);

    expect(colder.polarCap).toBeLessThan(warmer.polarCap);
    expect(measuredIceFraction(colder, SEED, 0)).toBeGreaterThan(
      measuredIceFraction(warmer, SEED, 0),
    );
    expect(measuredIceFraction(colder, SEED, 0)).toBeCloseTo(0.4065, 2);
  });
});

describe("calibrated clouds (pinned system g0-s7)", () => {
  it("matches cloud_fraction within ±3 points", () => {
    const clouds = calibrateClouds(SEED, CLOUD_FRACTION);
    const coverage =
      DIRECTIONS.filter((direction) => {
        const raw = sampleCloud(direction, SEED);
        const u = Math.min(
          1,
          Math.max(0, (raw - clouds.noiseLo) * clouds.noiseScale),
        );
        return u > clouds.threshold;
      }).length / DIRECTIONS.length;

    expect(Math.abs(coverage - CLOUD_FRACTION)).toBeLessThan(0.03);
    expect(coverage).toBeCloseTo(0.2595, 2);
    expect(clouds.noiseScale).toBeGreaterThan(0);
  });
});
