// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Absolute simulation coordinates are float64 metres. GPU upload is float32,
 * where a coordinate at 1.4e6 m has a unit-in-the-last-place of 0.125 m — far
 * too coarse to hold a ship steady. This module is the one place where absolute
 * world coordinates become render coordinates: the subtraction happens in JS
 * doubles *before* any float32 upload, so the small difference keeps its
 * precision.
 *
 * Nothing else may turn world coordinates into render coordinates.
 */

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Point3Delta {
  x: number;
  y: number;
  z: number;
}

/** Component-wise float64 difference. Deliberately does not call Math.fround. */
export function cameraRelative(world: Point3, camera: Point3): Point3Delta {
  return {
    x: world.x - camera.x,
    y: world.y - camera.y,
    z: world.z - camera.z,
  };
}

/**
 * float32 unit-in-the-last-place at magnitude x: 2^(floor(log2|x|) - 23).
 * The zero case returns the smallest subnormal float32 (2^-149).
 */
export function f32Ulp(x: number): number {
  const magnitude = Math.abs(x);
  if (magnitude === 0) return Math.pow(2, -149);
  return Math.pow(2, Math.floor(Math.log2(magnitude)) - 23);
}

/** How far a float64 value moves when rounded to float32. Measures, never applies. */
export function f32Error(x: number): number {
  return Math.abs(Math.fround(x) - x);
}
