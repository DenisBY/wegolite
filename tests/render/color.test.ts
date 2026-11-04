// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The sRGB transfer contract (WORLD-03, G-03-1).
 *
 * The planet palette is authored sRGB texture data, so this module must decode
 * it exactly once before the shader's `<colorspace_fragment>` encodes it once.
 * A drift back to `pow(x, 2.2)` or to the truncated `0.0031308` encode cut is
 * invisible in a screenshot but changes every authored byte; the seam and the
 * Lave decodes below make it a suite failure instead.
 */

import { describe, expect, it } from "vitest";

import {
  decodeColor3,
  linearToSrgb,
  srgbByteToLinear,
  srgbToLinear,
} from "../../src/render/color.js";

const ROUND_TRIP_SAMPLES = [
  0, 0.04045, 0.2, 0.36, 0.5, 0.589844, 0.934, 1,
] as const;

describe("sRGB transfer", () => {
  it("round-trips every sample within 1e-12", () => {
    for (const sample of ROUND_TRIP_SAMPLES) {
      expect(linearToSrgb(srgbToLinear(sample))).toBeCloseTo(sample, 12);
      expect(srgbToLinear(linearToSrgb(sample))).toBeCloseTo(sample, 12);
    }
  });

  it("cuts the decode at 0.04045 and the encode at its exact image", () => {
    // The published 0.0031308 is *below* this value, so using it would send the
    // seam sample down the power branch and break invertibility.
    const seam = 0.04045 / 12.92;

    expect(srgbToLinear(0.04045)).toBe(seam);
    expect(seam).toBeGreaterThan(0.0031308);
    expect(linearToSrgb(seam)).toBeCloseTo(0.04045, 12);
    // Just above the decode cut the power branch is already continuous.
    expect(linearToSrgb(srgbToLinear(0.04046))).toBeCloseTo(0.04046, 12);
  });

  it("decodes authored bytes to the linear value Oolite lights", () => {
    // 92/255 = 0.361; the sRGB decode is 0.107023, a factor of 3.4 lower. A
    // 4-dp assertion would pass on 0.1073 and hide a curve change, so pin the
    // computed value to six places.
    expect(srgbByteToLinear(92)).toBeCloseTo(0.107023, 6);
    expect(srgbByteToLinear(92)).toBeLessThan(92 / 255 / 3);
    expect(linearToSrgb(srgbByteToLinear(92)) * 255).toBeCloseTo(92, 0);

    // The endpoints are exact, not approximate.
    expect(srgbByteToLinear(0)).toBe(0);
    expect(srgbByteToLinear(255)).toBe(1);
  });

  it("decodes Lave's land triple to linear light, not pow(x, 2.2)", () => {
    const decoded = decodeColor3([0.36, 0.58882, 0.120234, 1]);

    expect(decoded[0]).toBeCloseTo(0.106539, 6);
    expect(decoded[1]).toBeCloseTo(0.305653, 6);
    expect(decoded[2]).toBeCloseTo(0.013455, 6);

    // A bare 2.2 approximation is visibly different on the red channel.
    expect(decoded[0]).not.toBeCloseTo(Math.pow(0.36, 2.2), 6);
  });

  it("clamps out-of-range inputs instead of extrapolating", () => {
    expect(srgbToLinear(-1)).toBe(0);
    expect(srgbToLinear(2)).toBe(1);
    expect(linearToSrgb(-1)).toBe(0);
    expect(linearToSrgb(2)).toBeCloseTo(1, 12);
  });
});
