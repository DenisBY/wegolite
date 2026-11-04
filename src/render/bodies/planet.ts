// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Lave's planet: one sphere, one procedural `ShaderMaterial` (D-01, D-02).
 *
 * Every uniform comes from the compiled `g0-s7` record — palette, polar
 * colours, land/cloud fractions, air density and the ambient floor — and the
 * noise seed is the authored six-byte `random_seed` string hashed with
 * `fnv1a32`. Nothing is hardcoded except the tessellation, which only affects
 * the silhouette.
 *
 * The spin is presentation-only but must come from the simulation clock:
 * `update(elapsedSeconds)` composes `axisAngle(0, 1, 0, rotationSpeed * t)` on
 * the mesh and rotates the sun direction into object space, so the terminator
 * stays fixed in space while the surface turns. No wall clock is read anywhere.
 */

import * as THREE from "three";
import type { System } from "../../content/types.js";
import { fnv1a32 } from "../../sim/hash.js";
import { axisAngle, clamp, rotateInverse } from "../../sim/math.js";
import type { Vec3 } from "../../sim/math.js";
import { LayoutError } from "../../sim/world/layout.js";
import { decodeColor3 } from "../color.js";
import {
  PLANET_FRAGMENT_SHADER,
  PLANET_VERTEX_SHADER,
} from "../shaders/planet.glsl.js";

/** The GPU-facing planet: the mesh, its material, and the spin step. */
export interface PlanetBody {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** Spin the surface and rotate the sun direction into object space. */
  update(elapsedSeconds: number): void;
}

const SURFACE_SEGMENTS = 192;
const RING_SEGMENTS = 96;

/**
 * Hash the authored seed string to a GLSL-friendly float in `[0, 64)`.
 *
 * The integer hash is divided by 2^32 before scaling so the uniform stays a
 * smooth, bounded offset for the noise lattice; the shader never sees the raw
 * 32-bit value (which a GLSL float cannot represent exactly).
 */
export function seedToUniform(seed: string): number {
  const hashed = Number.parseInt(fnv1a32(seed), 16) >>> 0;
  return (hashed / 0x1_0000_0000) * 64;
}

/**
 * Calibrate the land/sea threshold from `land_fraction`, never from a
 * hardcoded 0.5.
 *
 * The octave sum is normalised to `[0, 1]` and is symmetric about 0.5, so the
 * land share is the upper tail: `threshold = 1 - land_fraction`. For Lave that
 * is 0.35 (65% land), where a midpoint threshold would render roughly half
 * land. The seed contributes a sub-percent offset so two systems with the same
 * fraction do not share an identical coastline; the offset is much smaller than
 * the smoothstep band, so it can never invert land and sea.
 */
export function landThresholdFor(landFraction: number, seed: number): number {
  const base = 1 - clamp(landFraction, 0.02, 0.98);
  const jitter = (seed * 1000) % 1;
  return clamp(base + (jitter - 0.5) * 0.02, 0.02, 0.98);
}

/**
 * Decode an authored `planetinfo` colour to linear light and upload it.
 *
 * The palette is sRGB texture data (Oolite writes `255 * color` bytes and
 * decodes them before lighting), so the raw triple must never reach the
 * shader: the fragment stage ends with `<colorspace_fragment>`, which encodes
 * once on output. `color.ts` stays Three-free; the `Vector3` wrap happens here.
 */
function color3(
  value: readonly [number, number, number, number],
): THREE.Vector3 {
  const [red, green, blue] = decodeColor3(value);
  return new THREE.Vector3(red, green, blue);
}

/**
 * The authored terminator vector is not a colour: its x component widens the
 * day/night band, clamped so the terminator can never vanish or swallow the
 * planet.
 */
function terminatorSoftness(system: System): number {
  return clamp(0.08 + system.terminatorThresholdVector[0], 0.02, 0.4);
}

/**
 * Build the planet body.
 *
 * @throws {LayoutError} when `planetRadius` is not a positive finite number — a
 * zero-radius sphere would silently render nothing (V5 input validation).
 */
export function createPlanet(
  system: System,
  planetRadius: number,
  sunDir: Vec3,
  rotationSpeed: number,
): PlanetBody {
  if (!Number.isFinite(planetRadius) || planetRadius <= 0) {
    throw new LayoutError(
      `Wegolite: the planet radius must be positive and finite (received ${String(planetRadius)}).`,
    );
  }

  const seed = seedToUniform(system.random_seed);
  const sunDirUniform = {
    value: new THREE.Vector3(sunDir.x, sunDir.y, sunDir.z),
  };
  const timeUniform = { value: 0 };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSeed: { value: seed },
      uLandColor: { value: color3(system.land_color) },
      uSeaColor: { value: color3(system.sea_color) },
      uPolarLandColor: { value: color3(system.polar_land_color) },
      uPolarSeaColor: { value: color3(system.polar_sea_color) },
      uPolarCloudColor: { value: color3(system.polar_cloud_color) },
      uCloudColor: { value: color3(system.cloud_color) },
      uAirColor: { value: color3(system.air_color) },
      uLandThreshold: {
        value: landThresholdFor(system.land_fraction, seed),
      },
      uLandFraction: { value: system.land_fraction },
      uCloudFraction: { value: system.cloud_fraction },
      uCloudAlpha: { value: system.cloud_alpha },
      uAirDensity: { value: system.air_density },
      uAmbient: { value: system.ambient_level },
      uTerminatorSoftness: { value: terminatorSoftness(system) },
      uSunDir: sunDirUniform,
      uTime: timeUniform,
    },
    vertexShader: PLANET_VERTEX_SHADER,
    fragmentShader: PLANET_FRAGMENT_SHADER,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(planetRadius, SURFACE_SEGMENTS, RING_SEGMENTS),
    material,
  );
  mesh.name = "planet";

  return {
    mesh,
    material,
    update(elapsedSeconds: number): void {
      const planetQuat = axisAngle(0, 1, 0, rotationSpeed * elapsedSeconds);
      mesh.quaternion.set(
        planetQuat.x,
        planetQuat.y,
        planetQuat.z,
        planetQuat.w,
      );

      // The sun direction is a world vector; the shader compares it against
      // object-space normals, so it must be inverse-rotated by the same spin.
      const objectSunDir = rotateInverse(planetQuat, sunDir);
      sunDirUniform.value.set(objectSunDir.x, objectSunDir.y, objectSunDir.z);
      timeUniform.value = elapsedSeconds;
    },
  };
}
