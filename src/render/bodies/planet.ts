// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Lave's planet: one sphere, one procedural `ShaderMaterial` (D-01, D-02).
 *
 * Every uniform comes from the compiled `g0-s7` record — palette, polar
 * colours, land/cloud fractions, air density, the ambient level and the
 * per-channel terminator thresholds — and the noise seed is the authored
 * six-byte `random_seed` string hashed with `fnv1a32`. Nothing is hardcoded
 * except the tessellation (which only affects the silhouette), Oolite's
 * `percent_ice` default and the relief scale (presentation tuning documented
 * where it is declared).
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
import { calibrateClouds, calibrateSurface } from "../planet-noise.js";
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
 * Oolite's authored `percent_ice` default: `OOPlanetEntity.m:133-134` maps the
 * plist key to `polar_fraction = percent_ice / 100`, and a system without the
 * key gets 5%. The compiler does not project the key for the pinned snapshot,
 * so every pinned system currently takes this engine default; it is an Oolite
 * constant, not a rendering knob.
 */
const DEFAULT_PERCENT_ICE = 5;

/**
 * Oolite's presentation tuning for the Lambert relief, not a calibration output.
 *
 * Confirmed by measurement on the one-octave field (03-14): the mean `|dU|`
 * over the shaded land set is 0.00447 at one octave versus 0.00486 at three, so
 * the scale that held the approved 0.85 mean shade is unchanged. At 80,
 * `measuredReliefShade` reports mean 0.8519 / min 0.4636 / landShare 0.6499.
 */
export const RELIEF_SCALE = 80;

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
 * The authored terminator vector is not a colour: each component is the cosine
 * of the angle at which that channel reaches full light (`0.105, 0.18, 0.28`
 * for Lave), so it is uploaded unchanged and the shader saturates red first.
 * `ambient_level` is the night-side floor, applied through Oolite's
 * `(0.8, 0.8, 1.0)` tint outside the day factor.
 */

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
  const polarFraction = clamp(
    (system.percent_ice ?? DEFAULT_PERCENT_ICE) / 100,
    0,
    1,
  );
  // The calibration is the level set: it is measured from the same field the
  // shader draws, so `land_fraction`, `cloud_fraction` and `percent_ice` are
  // true shares rather than threshold guesses (debug report 00:25).
  const surface = calibrateSurface(seed, system.land_fraction, polarFraction);
  const clouds = calibrateClouds(seed, system.cloud_fraction);
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
      // Calibration: the shader normalises the raw field with (raw - lo) *
      // scale, then compares `q` against thresholds derived here. None of these
      // is hand-tuned; all come from the compiled record.
      uNoiseLo: { value: surface.noiseLo },
      uNoiseScale: { value: surface.noiseScale },
      uSeaBias: { value: surface.seaBias },
      uPoleValue: { value: surface.poleValue },
      uPolarCap: { value: surface.polarCap },
      // Two-thirds of the calibrated land-range top (`1 + uSeaBias`), Oolite's
      // snowline rule applied to this field; 0.28581 for Lave. The literal
      // `0.66667 * land_fraction` (0.43334) sits above the reachable top
      // (0.42871) and leaves the band empty.
      uMixHi: { value: surface.mixHi },
      uCloudNoiseLo: { value: clouds.noiseLo },
      uCloudNoiseScale: { value: clouds.noiseScale },
      uCloudThreshold: { value: clouds.threshold },
      // Presentation tuning, not a calibration output: the measured one-octave
      // height difference over the 0.006 rad relief step averages 0.00447
      // (0.00486 at three octaves), so 80 maps the mean slope to a 0.852 shade
      // and the steepest to 0.464. The plan's 4.0 was measured at under 0.1%
      // modulation (invisible).
      uReliefScale: { value: RELIEF_SCALE },
      uLandFraction: { value: system.land_fraction },
      uCloudFraction: { value: system.cloud_fraction },
      uCloudAlpha: { value: system.cloud_alpha },
      uAirDensity: { value: system.air_density },
      // Night side: Oolite adds `AMBIENT_LIGHT * ambientColor` with
      // `ambientColor *= vec3(0.8, 0.8, 1.0)`, outside the day factor.
      uAmbient: { value: system.ambient_level },
      uAmbientTint: { value: new THREE.Vector3(0.8, 0.8, 1.0) },
      // Authored per system (`terminator_threshold_vector`); the shader applies
      // it per channel, so red saturates before green and blue.
      uTerminatorThreshold: {
        value: new THREE.Vector3(...system.terminatorThresholdVector),
      },
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
