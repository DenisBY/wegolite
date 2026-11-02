// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { describe, expect, it } from "vitest";

import { cameraRelative, f32Error, f32Ulp } from "./camera-relative.js";

/**
 * FOUND-08's numeric half. Every case pins one measured number and uses `toBe`
 * where an exact float64 result is claimed: a tolerance here would hide the
 * float32 precision loss this file exists to rule out.
 */
describe("camera-relative precision", () => {
  it("keeps a 100 m separation exact at 1e6 m by subtracting in float64", () => {
    // Pins 100 m: a float32 round-trip inside the transform would round both
    // coordinates to the 0.0625 m ULP at 1e6 m and lose the exact difference.
    const cam = { x: 1e6 + 0.1, y: -2e5, z: 3e5 };
    const a = cameraRelative({ x: cam.x + 100, y: cam.y, z: cam.z }, cam);
    const b = cameraRelative({ x: cam.x + 200, y: cam.y, z: cam.z }, cam);

    expect(b.x - a.x).toBe(100);
  });

  it("pins the float32 ULP at the 1.4e6 m worst case to exactly 0.125", () => {
    // Pins 0.125 m: 2^(floor(log2 1.4e6) - 23) = 2^-3. This is the number the
    // far marker's placement error is measured against.
    expect(f32Ulp(1.4e6)).toBe(0.125);
  });

  it("bounds float64 to float32 rounding error by half a ULP at 1e6 + 0.1", () => {
    // Pins the half-ULP bound at a magnitude float32 cannot represent:
    // measured error 0.025000000023283064 against the bound 0.03125. The `> 0`
    // half proves the transform does not itself call Math.fround, which would
    // make the error identically zero. 1e6 + 0.1 (not 1.4e6) is required:
    // Math.fround(1.4e6) is exact, so the strict lower bound would be vacuous.
    const x = 1e6 + 0.1;

    expect(f32Error(x)).toBeGreaterThan(0);
    expect(f32Error(x)).toBeLessThanOrEqual(f32Ulp(x) / 2);
  });
});
