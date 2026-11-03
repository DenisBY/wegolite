// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The deterministic system starfield (WORLD-03, D-03, T-3-05).
 *
 * `sky_n_stars` is the exact authored star count (8,887 for Lave) and is capped
 * at 20,000 so a tampered record cannot allocate an unbounded GPU buffer. Every
 * star sits on one shell at 1.5e6 m — inside the 2.5e6 m far plane and outside
 * the sun at 1.14e6 m — and the object itself stays at the camera origin, so the
 * camera's rotation changes the view and its translation never moves the sky.
 *
 * The golden-angle spiral is deterministic by construction; the small per-star
 * jitter and brightness variation come from `createSeededRandom(fnv1a32(seed))`,
 * never `Math.random`. `sky_n_blurs` is a nebula/blur count and is deliberately
 * ignored here.
 */

import * as THREE from "three";
import { fnv1a32 } from "../../sim/hash.js";
import { createSeededRandom } from "../../sim/math.js";

/** The star shell radius in metres. */
export const STARFIELD_SHELL_RADIUS = 1.5e6;

/** The performance cap; `sky_n_stars` above this is clamped. */
export const STARFIELD_MAX_STARS = 20_000;

/** Golden angle, so the spiral is deterministic and needs no randomness. */
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

/** Fraction of stars tinted by `sun_color`; the rest stay white. */
const TINTED_STAR_FRACTION = 0.2;

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.min(Math.max(Math.trunc(count), 0), STARFIELD_MAX_STARS);
}

/**
 * Build a `Points` starfield of `count` stars on the 1.5e6 m shell.
 *
 * `seed` is the authored `random_seed` string; `tint` is the system's
 * `sun_color` (white for Lave). The geometry is preallocated once and drawn in
 * a single call.
 */
export function createSystemStarfield(
  count: number,
  seed: string,
  tint: readonly [number, number, number],
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const stars = clampCount(count);
  const positions = new Float32Array(stars * 3);
  const colors = new Float32Array(stars * 3);
  const random = createSeededRandom(Number.parseInt(fnv1a32(seed), 16) >>> 0);

  for (let i = 0; i < stars; i += 1) {
    // Evenly spaced latitudes, one point per longitude step, plus a small
    // seeded jitter so the spiral does not read as a regular grid.
    const y = 1 - (2 * (i + 0.5)) / stars;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE_RAD + random() * 0.4;
    const offset = i * 3;

    positions[offset] = Math.cos(theta) * ring * STARFIELD_SHELL_RADIUS;
    positions[offset + 1] = y * STARFIELD_SHELL_RADIUS;
    positions[offset + 2] = Math.sin(theta) * ring * STARFIELD_SHELL_RADIUS;

    // ~80% white, 20% tinted by the sun's colour; brightness varies a little so
    // the field has depth without a per-star texture.
    const tinted = random() < TINTED_STAR_FRACTION;
    const brightness = 0.6 + random() * 0.4;
    colors[offset] = (tinted ? tint[0] : 1) * brightness;
    colors[offset + 1] = (tinted ? tint[1] : 1) * brightness;
    colors[offset + 2] = (tinted ? tint[2] : 1) * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    depthWrite: false,
    depthTest: true,
    vertexColors: true,
  });

  const starfield = new THREE.Points(geometry, material);
  starfield.name = "starfield";
  return starfield;
}
