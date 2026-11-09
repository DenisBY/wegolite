// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The High-quality atmosphere shell mesh (PROJECT.md Key Decisions).
 *
 * One alpha-blended, depth-tested, non-depth-writing sphere just above the
 * planet surface. It is built only at `high` quality and is parented to the
 * planet mesh, so it follows the planet's camera-relative placement without a
 * second sync step. The planet's spin reaches it too, which is harmless: the
 * shader works from world-space normals and a world-space sun direction, and a
 * sphere is symmetric under rotation.
 *
 * Depth: the shell is transparent, so Three draws it after every opaque body.
 * It tests against the depth buffer and never writes to it, so the station
 * hides the haze behind it and nothing is hidden by the haze.
 */

import * as THREE from "three";
import type { System } from "../../content/types.js";
import type { Vec3 } from "../../sim/math.js";
import { LayoutError } from "../../sim/world/layout.js";
import { decodeColor3 } from "../color.js";
import {
  ATMOSPHERE_FRAGMENT_SHADER,
  ATMOSPHERE_VERTEX_SHADER,
} from "../shaders/atmosphere.glsl.js";

/**
 * How far the shell sits above the surface, in metres.
 *
 * Oolite's `ATMOSPHERE_DEPTH` (`OOStellarBody.h:48`); its shader atmosphere is
 * always `collision_radius + ATMOSPHERE_DEPTH` (`OOPlanetEntity.m:155`).
 */
export const ATMOSPHERE_DEPTH = 500;

/**
 * Colour gain, replacing Oolite's sqrt(3). Presentation tuning.
 *
 * Oolite multiplies the haze by `dot(normalize(fresnel), vec3(NdotL))`, a gain
 * of 1.732, and relies on its tone mapping. Wegolite renders without tone
 * mapping, where that gain clips the lit limb to white.
 */
export const ATMOSPHERE_BRIGHTNESS = 1.0;

const SHELL_SEGMENTS = 128;
const SHELL_RINGS = 64;

/** The mesh name, read by the probe and the tests. */
export const ATMOSPHERE_NAME = "atmosphere";

/**
 * Oolite's rim threshold: the cosine of the view angle past which the shell is
 * the thin coloured rim rather than the haze (0.17 for a small planet, 0.13
 * for a large one). Clamped so an out-of-range radius cannot make it zero or
 * negative, which would divide by zero in the shader.
 */
export function atmosphereCosThreshold(shellRadius: number): number {
  return Math.min(Math.max(-1.333333e-6 * shellRadius + 0.21333333, 0.05), 0.3);
}

/**
 * Build the atmosphere shell for one planet.
 *
 * @param sunDir The world-space unit vector from the planet toward the sun.
 * @throws {LayoutError} when `planetRadius` is not a positive finite number.
 */
export function createAtmosphere(
  system: System,
  planetRadius: number,
  sunDir: Vec3,
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  if (!Number.isFinite(planetRadius) || planetRadius <= 0) {
    throw new LayoutError(
      `Wegolite: the atmosphere needs a positive finite planet radius (received ${String(planetRadius)}).`,
    );
  }

  const shellRadius = planetRadius + ATMOSPHERE_DEPTH;
  const [red, green, blue] = decodeColor3(system.air_color);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAirColor: { value: new THREE.Vector3(red, green, blue) },
      uSunDir: { value: new THREE.Vector3(sunDir.x, sunDir.y, sunDir.z) },
      uAirColorMixRatio: { value: system.air_color_mix_ratio },
      uAirDensity: { value: system.air_density },
      uAmbient: { value: system.ambient_level },
      uShellRadius: { value: shellRadius },
      uCosThreshold: { value: atmosphereCosThreshold(shellRadius) },
      // Oolite: a sharper rim on a small planet.
      uRimExponent: { value: shellRadius > 40_000 ? 3 : 5 },
      uBrightness: { value: ATMOSPHERE_BRIGHTNESS },
    },
    vertexShader: ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(shellRadius, SHELL_SEGMENTS, SHELL_RINGS),
    material,
  );
  mesh.name = ATMOSPHERE_NAME;
  return mesh;
}
