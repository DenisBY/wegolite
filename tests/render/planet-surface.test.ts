// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The contract between the planet shader and its CPU calibration (WORLD-03).
 *
 * `planet-noise.test.ts` proves the mirror measures what it claims;
 * `planet-shader.test.ts` pins the uniform values. This file proves the two
 * halves agree: every uniform the fragment shader declares is supplied by
 * `planet.ts` (including `uReliefScale`, whose absence would silently flatten
 * the terrain with every other test green), every material uniform is actually
 * declared, and the shader's PlanetMix band constants are the mirror's.
 *
 * It also re-measures the surface through the *uploaded* uniform values rather
 * than through a freshly computed calibration, so a wiring mistake cannot hide
 * behind a correct mirror.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createPlanet, seedToUniform } from "../../src/render/bodies/planet.js";
import { linearToSrgb } from "../../src/render/color.js";
import {
  calibrateSurface,
  classifySurface,
  CLOUD_OCTAVES,
  COASTLINE_PORTION,
  DEEPS,
  fibonacciDirections,
  measuredIceFraction,
  measuredLandFraction,
  measuredQRange,
  RELIEF_OCTAVES,
  SHALLOWS,
  SURFACE_OCTAVES,
} from "../../src/render/planet-noise.js";
import type {
  SurfaceCalibration,
  TerrainClass,
} from "../../src/render/planet-noise.js";
import { PLANET_FRAGMENT_SHADER } from "../../src/render/shaders/planet.glsl.js";
import { laveFixture } from "../helpers/lave.js";

const { system, layout } = laveFixture();
const SEED = seedToUniform(system.random_seed);
const DIRECTIONS = fibonacciDirections();

const body = createPlanet(
  system,
  layout.planet.radius,
  layout.sunDir,
  layout.rotationSpeed,
);

function uniformValue<T>(name: string): T {
  const entry = body.material.uniforms[name];
  if (entry === undefined) {
    throw new Error(`the planet material has no uniform "${name}"`);
  }
  return entry.value as T;
}

/** Every `uniform <type> <name>;` in the fragment source, declaration order. */
function declaredUniforms(fragmentSource: string): string[] {
  const names: string[] = [];
  for (const match of fragmentSource.matchAll(
    /^\s*uniform\s+\w+\s+(\w+)\s*;/gm,
  )) {
    names.push(match[1] as string);
  }
  return names;
}

/** A numeric `#define NAME value` from the source. */
function defineValue(fragmentSource: string, name: string): number {
  const match = new RegExp(`#define\\s+${name}\\s+([0-9.]+)`).exec(
    fragmentSource,
  );
  if (match === null) {
    throw new Error(`the fragment shader has no #define ${name}`);
  }
  return Number(match[1]);
}

/** The calibration as the GPU receives it, not as a fresh computation. */
function calibrationFromUniforms(): SurfaceCalibration {
  return {
    noiseLo: uniformValue<number>("uNoiseLo"),
    noiseScale: uniformValue<number>("uNoiseScale"),
    seaBias: uniformValue<number>("uSeaBias"),
    poleValue: uniformValue<number>("uPoleValue"),
    polarCap: uniformValue<number>("uPolarCap"),
    mixHi: uniformValue<number>("uMixHi"),
  };
}

function classifyShares(
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

describe("planet surface contract", () => {
  it("declares exactly the uniforms the material supplies, both ways", () => {
    const declared = declaredUniforms(PLANET_FRAGMENT_SHADER).sort();
    const supplied = Object.keys(body.material.uniforms).sort();

    // Declared-but-unwired (e.g. a forgotten uReliefScale) and
    // supplied-but-declared-nowhere (dead wiring) both fail here.
    expect(declared).toEqual(supplied);
    expect(declared).toContain("uReliefScale");
    expect(declared).toContain("uNoiseLo");
    expect(declared).toContain("uSeaBias");
    expect(declared).toContain("uMixHi");
    expect(declared).not.toContain("uLandThreshold");
  });

  it("keeps the shader's band constants equal to the mirror's", () => {
    expect(defineValue(PLANET_FRAGMENT_SHADER, "COASTLINE_PORTION")).toBe(
      COASTLINE_PORTION,
    );
    expect(defineValue(PLANET_FRAGMENT_SHADER, "SHALLOWS")).toBe(SHALLOWS);
    expect(defineValue(PLANET_FRAGMENT_SHADER, "DEEPS")).toBe(DEEPS);
  });

  it("keeps the shader's octave counts equal to the mirror's", () => {
    expect(defineValue(PLANET_FRAGMENT_SHADER, "SURFACE_OCTAVES")).toBe(
      SURFACE_OCTAVES,
    );
    expect(defineValue(PLANET_FRAGMENT_SHADER, "RELIEF_OCTAVES")).toBe(
      RELIEF_OCTAVES,
    );
    expect(defineValue(PLANET_FRAGMENT_SHADER, "CLOUD_OCTAVES")).toBe(
      CLOUD_OCTAVES,
    );
  });

  it("re-measures the uploaded calibration, not a fresh one", () => {
    const calibration = calibrationFromUniforms();
    const fresh = calibrateSurface(
      seedToUniform(system.random_seed),
      0.65,
      0.05,
    );

    expect(calibration.seaBias).toBe(fresh.seaBias);
    expect(calibration.mixHi).toBe(fresh.mixHi);
    expect(calibration.polarCap).toBe(fresh.polarCap);

    const land = measuredLandFraction(calibration, SEED);
    expect(land).toBeGreaterThan(0.63);
    expect(land).toBeLessThan(0.67);
    expect(land).toBeCloseTo(0.6499, 2);

    const { max } = measuredQRange(calibration, SEED);
    expect(max).toBeLessThan(1);
    expect(calibration.mixHi).toBeLessThan(max);
    expect(calibration.mixHi).toBeCloseTo(0.2858, 2);

    // Ice through the uploaded cap: the cap term is driven by percent_ice.
    expect(calibration.polarCap).toBeCloseTo(0.4142, 4);
    expect(measuredIceFraction(calibration, SEED, 60, 90)).toBeGreaterThan(
      0.95,
    );
    expect(measuredIceFraction(calibration, SEED, 0, 5)).toBeLessThan(0.02);
  });

  it("keeps the sea layered and the snowline non-empty", () => {
    const shares = classifyShares(calibrationFromUniforms());
    const sea =
      (shares.get("sea") ?? 0) +
      (shares.get("shelf") ?? 0) +
      (shares.get("deep") ?? 0);

    // The whole sea region (q <= 0) is 0.3501 of the sphere and the deep
    // branch alone is 0.0566; the deep branch must not be asserted at 0.1.
    expect(sea).toBeGreaterThanOrEqual(0.3);
    expect(shares.get("deep") ?? 0).toBeGreaterThanOrEqual(0.05);
    expect(shares.get("deep") ?? 0).toBeCloseTo(0.0566, 3);

    // Snowline and highland are reachable; q > 1 is not.
    expect(shares.get("highland") ?? 0).toBeCloseTo(0.0142, 3);
    expect(shares.get("highland") ?? 0).toBeGreaterThan(0);
    expect(shares.get("snow") ?? 0).toBe(0);

    // Every class the shader can paint on a base system occurs.
    for (const terrain of [
      "deep",
      "sea",
      "shelf",
      "coast",
      "land",
      "highland",
      "ice",
    ] as const) {
      expect(shares.get(terrain) ?? 0).toBeGreaterThan(0.001);
    }
  });

  it("paints the ice with polar_sea_color and the pale land with polar_land_color", () => {
    const ice = uniformValue<THREE.Vector3>("uPolarSeaColor");
    expect([
      Math.round(linearToSrgb(ice.x) * 255),
      Math.round(linearToSrgb(ice.y) * 255),
      Math.round(linearToSrgb(ice.z) * 255),
    ]).toEqual([253, 253, 253]);

    expect(PLANET_FRAGMENT_SHADER).toContain(
      "ground = mix(ground, uPolarSeaColor, ice)",
    );
    expect(PLANET_FRAGMENT_SHADER).toContain("uPolarLandColor");
  });
});
