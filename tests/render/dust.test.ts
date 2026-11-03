// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The camera-local dust field (D-04, FLGT-04, Pitfall 18, T-3-17).
 *
 * Pure numeric assertions in Node: the field wraps inside its box, a camera
 * delta shifts it, a large teleport reseeds deterministically, and the typed
 * arrays are reused rather than reallocated. The perceptual "reads as speed"
 * check is the manual torus/dust row in `03-VALIDATION.md`.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDust,
  DUST_DEFAULT_BOX,
  DUST_MAX_COUNT,
  wrapDustCoordinate,
} from "../../src/render/bodies/dust.js";
import { vec } from "../../src/sim/math.js";

const dustSource = readFileSync(
  new URL("../../src/render/bodies/dust.ts", import.meta.url),
  "utf8",
);

/** Drop comment-only lines so documentation cannot satisfy an assertion. */
const dustCode = dustSource
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

describe("dust wrap", () => {
  it("keeps every coordinate inside the half-open box", () => {
    const box = 500;
    expect(wrapDustCoordinate(0, box)).toBe(0);
    expect(wrapDustCoordinate(249.9, box)).toBeCloseTo(249.9, 9);
    expect(wrapDustCoordinate(260, box)).toBeCloseTo(-240, 9);
    expect(wrapDustCoordinate(-260, box)).toBeCloseTo(240, 9);
    expect(wrapDustCoordinate(1_000, box)).toBeCloseTo(0, 9);
    // A value exactly on the upper edge wraps to the lower edge.
    expect(wrapDustCoordinate(250, box)).toBe(-250);

    for (const value of [-10_000, -501, -250, 250, 501, 10_000]) {
      const wrapped = wrapDustCoordinate(value, box);
      expect(wrapped).toBeGreaterThanOrEqual(-box / 2);
      expect(wrapped).toBeLessThan(box / 2);
    }
  });

  it("falls back to the default box for an invalid size", () => {
    expect(wrapDustCoordinate(10, 0)).toBe(10);
    expect(wrapDustCoordinate(10, Number.NaN)).toBe(10);
    expect(DUST_DEFAULT_BOX).toBe(500);
  });
});

describe("dust field", () => {
  it("preallocates the motes and keeps them inside the box", () => {
    const dust = createDust(600, 500);
    expect(dust.count).toBe(600);
    expect(dust.positions).toHaveLength(600 * 3);
    for (const value of dust.positions) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThanOrEqual(250);
    }
    expect(dust.active).toBe(true);
  });

  it("subtracts the camera delta and wraps each axis", () => {
    const box = 500;
    const dust = createDust(64, box);
    const before = Float32Array.from(dust.positions);
    dust.update(vec(10, -4, 3), 350, 1);

    for (let index = 0; index < dust.count; index += 1) {
      const offset = index * 3;
      expect(dust.positions[offset]).toBeCloseTo(
        wrapDustCoordinate((before[offset] ?? 0) - 10, box),
        4,
      );
      expect(dust.positions[offset + 1]).toBeCloseTo(
        wrapDustCoordinate((before[offset + 1] ?? 0) + 4, box),
        4,
      );
      expect(dust.positions[offset + 2]).toBeCloseTo(
        wrapDustCoordinate((before[offset + 2] ?? 0) - 3, box),
        4,
      );
    }
  });

  it("reuses the typed arrays across updates", () => {
    const dust = createDust(300, 500);
    const positionsLength = dust.positions.length;
    const attribute = dust.object.geometry.getAttribute("position");
    const attributeCount = attribute.count;

    for (let step = 0; step < 20; step += 1) {
      dust.update(vec(1.5, 0.25, -0.5), 350, 1);
    }

    expect(dust.positions.length).toBe(positionsLength);
    expect(dust.object.geometry.getAttribute("position").count).toBe(
      attributeCount,
    );
  });

  it("reseeds deterministically after a large teleport", () => {
    const first = createDust(200, 500);
    const second = createDust(200, 500);
    first.update(vec(10_000, 0, 0), 350, 1);
    second.update(vec(10_000, 0, 0), 350, 1);

    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    for (const value of first.positions) {
      expect(Math.abs(value)).toBeLessThanOrEqual(250);
    }
  });

  it("caps the particle count", () => {
    const dust = createDust(5_000, 500);
    expect(dust.count).toBe(DUST_MAX_COUNT);
    dust.dispose();
  });

  it("uses no unseeded randomness", () => {
    expect(dustCode.length).toBeGreaterThan(1_000);
    expect(dustCode).not.toMatch(/Math\.random/);
    expect(dustCode).not.toMatch(/\bDate\.now\b|\bnew Date\b/);
  });
});
