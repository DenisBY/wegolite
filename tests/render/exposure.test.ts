// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The exposure contract, calibrated against Oolite (WORLD-03, G-03-1).
 *
 * The tests discriminate three claims a screenshot cannot:
 *
 * 1. the derived sun intensity makes a mean Coriolis face display 190/255,
 *    while the shipped 2.5 displays ~64 — the control is >100 levels darker;
 * 2. Oolite's own HDR path (3.75 radiance, 2.484 pre-exposure, ACES, gamma)
 *    lands in the same band, so the LDR contract is calibrated to the user's
 *    reported target rather than invented;
 * 3. the scene-wide clipping bound is a derived function (bytes 101/119/139 at
 *    `NdotL` 1.0/0.7/0.5), so the Cobra is bounded by the same contract as the
 *    station instead of being assumed safe.
 */

import { readFileSync } from "node:fs";

import { ACESFilmicToneMapping, NoToneMapping, SRGBColorSpace } from "three";
import { describe, expect, it } from "vitest";

import { srgbByteToLinear } from "../../src/render/color.js";
import {
  DISPLAY_SUN_INTENSITY,
  OOLITE_LIGHT_RADIANCE,
  OOLITE_PREEXPOSURE,
  OOLITE_REFERENCE_ALBEDO_BYTE,
  OOLITE_REFERENCE_LIT_BYTE,
  OOLITE_REFERENCE_NDOTL,
  acesReference,
  ambientIntensityFor,
  applyOutputContract,
  clippingAlbedoByteFor,
  displayedByteFor,
  ooliteReferenceByte,
} from "../../src/render/exposure.js";

const exposureSource = readFileSync(
  new URL("../../src/render/exposure.ts", import.meta.url),
  "utf8",
);

describe("the Oolite constants are pinned to their source lines", () => {
  it("uses the shader's radiance and pre-exposure multipliers", () => {
    expect(OOLITE_LIGHT_RADIANCE).toBe(3.75);
    expect(OOLITE_PREEXPOSURE).toBe(2.484);
  });

  it("targets the UAT's measured lit byte and mean albedo", () => {
    expect(OOLITE_REFERENCE_LIT_BYTE).toBe(190);
    expect(OOLITE_REFERENCE_ALBEDO_BYTE).toBe(87);
    expect(OOLITE_REFERENCE_NDOTL).toBe(0.7);
  });
});

describe("the reference model and the display model agree on a band", () => {
  it("computes Oolite's HDR path to within 20 levels of the reported target", () => {
    const reference = ooliteReferenceByte();

    expect(reference).toBeGreaterThanOrEqual(185);
    expect(reference).toBeLessThanOrEqual(220);
    expect(Math.abs(reference - OOLITE_REFERENCE_LIT_BYTE)).toBeLessThanOrEqual(
      20,
    );
  });

  it("displays the reference face at 190 +/- 3 under the derived intensity", () => {
    const reference = displayedByteFor(
      srgbByteToLinear(OOLITE_REFERENCE_ALBEDO_BYTE),
      OOLITE_REFERENCE_NDOTL,
    );

    expect(Math.abs(reference - OOLITE_REFERENCE_LIT_BYTE)).toBeLessThanOrEqual(
      3,
    );
  });

  it("derives a sun intensity of 24.25, not a magic 2.5", () => {
    expect(DISPLAY_SUN_INTENSITY).toBeGreaterThanOrEqual(24.1);
    expect(DISPLAY_SUN_INTENSITY).toBeLessThanOrEqual(24.4);
  });

  it("keeps the pre-fix intensity at least 100 levels darker (the control)", () => {
    const preFix = displayedByteFor(
      srgbByteToLinear(OOLITE_REFERENCE_ALBEDO_BYTE),
      OOLITE_REFERENCE_NDOTL,
      2.5,
    );
    const calibrated = displayedByteFor(
      srgbByteToLinear(OOLITE_REFERENCE_ALBEDO_BYTE),
      OOLITE_REFERENCE_NDOTL,
    );

    expect(preFix).toBeLessThan(90);
    expect(calibrated - preFix).toBeGreaterThanOrEqual(100);
  });
});

describe("the ambient term matches Oolite's additive ambient", () => {
  it("turns Lave's 0.1 into pi * 0.1", () => {
    expect(ambientIntensityFor(0.1)).toBeCloseTo(0.3141592653589793, 12);
    expect(ambientIntensityFor(0.1)).toBeCloseTo(Math.PI * 0.1, 12);
  });

  it("clamps an out-of-range or non-finite level instead of emitting NaN", () => {
    expect(ambientIntensityFor(0)).toBe(0);
    expect(ambientIntensityFor(-1)).toBe(0);
    expect(ambientIntensityFor(2)).toBeCloseTo(Math.PI, 12);
    expect(ambientIntensityFor(Number.NaN)).toBe(0);
    expect(ambientIntensityFor(Number.POSITIVE_INFINITY)).toBe(Math.PI);
  });
});

describe("the scene-wide clipping bound is derived and pinned", () => {
  it("pins the authored albedo bytes at NdotL 1.0, 0.7 and 0.5", () => {
    expect(clippingAlbedoByteFor(1)).toBe(101);
    expect(clippingAlbedoByteFor(0.7)).toBe(119);
    expect(clippingAlbedoByteFor(0.5)).toBe(139);
  });

  it("is monotone decreasing in NdotL (a brighter face clips at a darker albedo)", () => {
    const samples = [1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4];

    for (let index = 1; index < samples.length; index += 1) {
      const brighter = clippingAlbedoByteFor(samples[index - 1] ?? 1);
      const dimmer = clippingAlbedoByteFor(samples[index] ?? 1);
      // Halving the incidence cosine only raises the clip byte: a face turned
      // away from the sun tolerates a brighter albedo before saturating.
      expect(dimmer, `NdotL ${String(samples[index])}`).toBeGreaterThan(
        brighter,
      );
    }
  });

  it("places the bound where saturation starts, not below it", () => {
    // The byte at the bound is the last one that still fits in [0, 1].
    expect(
      displayedByteFor(srgbByteToLinear(clippingAlbedoByteFor(1)), 1),
    ).toBeGreaterThanOrEqual(254);
  });

  it("returns 255 for an unlit face, where nothing can saturate", () => {
    expect(clippingAlbedoByteFor(0)).toBe(255);
    expect(clippingAlbedoByteFor(-1)).toBe(255);
    expect(clippingAlbedoByteFor(Number.NaN)).toBe(255);
  });
});

describe("the ACES reference is Three's operator", () => {
  it("maps zero to zero", () => {
    expect(acesReference(0)).toBe(0);
  });

  it("is monotone increasing", () => {
    const samples = [0, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 4];

    for (let index = 1; index < samples.length; index += 1) {
      const previous = acesReference(samples[index - 1] ?? 0);
      const current = acesReference(samples[index] ?? 0);
      expect(current, `x ${String(samples[index])}`).toBeGreaterThan(previous);
    }
  });

  it("stays inside the display range", () => {
    for (const value of [0, 0.1, 0.5, 1, 10, 1_000]) {
      expect(acesReference(value)).toBeGreaterThanOrEqual(0);
      expect(acesReference(value)).toBeLessThanOrEqual(1);
    }
  });
});

describe("applyOutputContract owns the renderer output state", () => {
  it("sets sRGB, no tone map and exposure 1 on a plain object", () => {
    const target = {
      outputColorSpace: "linear-srgb",
      toneMapping: ACESFilmicToneMapping,
      toneMappingExposure: 2.5,
    };

    applyOutputContract(target);

    expect(target.outputColorSpace).toBe(SRGBColorSpace);
    expect(target.toneMapping).toBe(NoToneMapping);
    expect(target.toneMappingExposure).toBe(1);
  });

  it("never assigns a filmic tone map anywhere in the module", () => {
    // The contract is explicitly no-tone-map; a stray assignment would be the
    // second exposure contract this module exists to prevent.
    expect(exposureSource).not.toMatch(/ACESFilmicToneMapping\s*=/);
  });
});
