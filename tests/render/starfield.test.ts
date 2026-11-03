// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The deterministic starfield contract (WORLD-03, D-03, T-3-05).
 *
 * Lave's authored `sky_n_stars` is 8,887; every star sits on the 1.5e6 m shell;
 * the same seed produces byte-identical positions and a different seed does
 * not; the 20,000 cap is enforced in both directions. The radius tolerance is
 * 0.5 m, not 1e-6: a `Float32Array` has a 0.125 m ULP at 1.5e6 m, so an exact
 * radius assertion would be asserting float64 semantics the GPU buffer does not
 * have. A wrong shell (or a wrong scale) still fails by kilometres.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STARFIELD_MAX_STARS,
  STARFIELD_SHELL_RADIUS,
  createSystemStarfield,
} from "../../src/render/bodies/starfield.js";
import { laveFixture } from "../helpers/lave.js";

const { system } = laveFixture();
const source = readFileSync(
  new URL("../../src/render/bodies/starfield.ts", import.meta.url),
  "utf8",
);
// Comments may name the banned API; only executable source must not call it.
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function positions(starfield: ReturnType<typeof createSystemStarfield>) {
  const attribute = starfield.geometry.getAttribute("position");
  return attribute.array as Float32Array;
}

describe("system starfield", () => {
  it("uses exactly Lave's authored sky_n_stars", () => {
    const starfield = createSystemStarfield(
      system.sky_n_stars,
      system.random_seed,
      [1, 1, 1],
    );

    expect(system.sky_n_stars).toBe(8_887);
    expect(starfield.name).toBe("starfield");
    expect(starfield.geometry.getAttribute("position").count).toBe(8_887);
  });

  it("places every star on the 1.5e6 m shell", () => {
    const array = positions(
      createSystemStarfield(system.sky_n_stars, system.random_seed, [1, 1, 1]),
    );

    for (let i = 0; i < array.length; i += 3) {
      const x = array[i] ?? 0;
      const y = array[i + 1] ?? 0;
      const z = array[i + 2] ?? 0;
      const radius = Math.hypot(x, y, z);
      // 0.5 m is four float32 ULPs at this radius; see the file header.
      expect(Math.abs(radius - STARFIELD_SHELL_RADIUS)).toBeLessThan(0.5);
    }
  });

  it("is byte-identical for the same seed and differs for another", () => {
    const first = positions(
      createSystemStarfield(64, "56 173 156 20 29 21", [1, 1, 1]),
    );
    const second = positions(
      createSystemStarfield(64, "56 173 156 20 29 21", [1, 1, 1]),
    );
    const other = positions(
      createSystemStarfield(64, "1 2 3 4 5 6", [1, 1, 1]),
    );

    expect(first).toEqual(second);
    expect(first).not.toEqual(other);
  });

  it("clamps the count at both ends without allocating unbounded memory", () => {
    const none = createSystemStarfield(-1, "lave", [1, 1, 1]);
    const capped = createSystemStarfield(50_000, "lave", [1, 1, 1]);

    expect(none.geometry.getAttribute("position").count).toBe(0);
    expect(capped.geometry.getAttribute("position").count).toBe(
      STARFIELD_MAX_STARS,
    );
    expect(STARFIELD_MAX_STARS).toBe(20_000);
  });

  it("is a camera-locked point cloud with no random source", () => {
    const starfield = createSystemStarfield(
      system.sky_n_stars,
      system.random_seed,
      [1, 1, 1],
    );

    expect(starfield.material.sizeAttenuation).toBe(false);
    expect(starfield.material.depthWrite).toBe(false);
    expect(starfield.material.depthTest).toBe(true);
    expect(starfield.material.vertexColors).toBe(true);
    expect(code).not.toContain("Math.random");
  });

  it("tints about a fifth of the stars with sun_color", () => {
    // Lave's sun is white, so use a red tint to make the mix observable.
    const starfield = createSystemStarfield(2_000, "lave", [1, 0, 0]);
    const colors = starfield.geometry.getAttribute("color")
      .array as Float32Array;

    let tinted = 0;
    for (let i = 0; i < colors.length; i += 3) {
      if ((colors[i + 1] ?? 0) === 0) tinted += 1;
    }

    expect(tinted).toBeGreaterThan(250);
    expect(tinted).toBeLessThan(550);
  });
});
