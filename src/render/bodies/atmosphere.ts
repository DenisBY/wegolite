// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The High-quality atmosphere shell mesh (PROJECT.md Key Decisions).
 *
 * One additive, depth-tested, non-depth-writing sphere a little larger than the
 * planet. It is built only at `high` quality and is parented to the planet
 * mesh, so it follows the planet's camera-relative placement without a second
 * sync step. The planet's spin reaches it too, which is harmless: the shader
 * works from world positions and a world-space sun direction, and a sphere is
 * symmetric under rotation.
 *
 * Depth: the shell is transparent, so Three draws it after every opaque body.
 * It tests against the depth buffer and never writes to it, so the station
 * hides the part of the halo behind it and nothing is hidden by the halo.
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
 * The shell radius as a multiple of the planet radius.
 *
 * Presentation tuning. Oolite's own shell is `ATMOSPHERE_DEPTH` (500 m,
 * `OOStellarBody.h:48`) above the surface, about 1.2% of Lave's radius, and its
 * shader treats ten times that as the mesosphere (`OOPlanetEntity.m:82`). 4%
 * sits between the two and is wide enough to read as a halo from the station.
 */
export const ATMOSPHERE_SHELL_SCALE = 1.04;

/**
 * How much of the authored air colour is replaced by white.
 *
 * Presentation tuning. Lave's `air_color` is pure blue `(0, 0, 1)`; a fully
 * saturated additive halo reads as a neon ring, so a small white share stands
 * in for the broadband part of scattered light.
 */
export const ATMOSPHERE_WHITE_MIX = 0.2;

/** Glow strength per unit of authored `air_density`. Presentation tuning. */
export const ATMOSPHERE_STRENGTH = 0.6;

const SHELL_SEGMENTS = 96;
const SHELL_RINGS = 48;

/** The mesh name, read by the probe and the tests. */
export const ATMOSPHERE_NAME = "atmosphere";

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

  const shellRadius = planetRadius * ATMOSPHERE_SHELL_SCALE;
  const [red, green, blue] = decodeColor3(system.air_color);
  const air = new THREE.Vector3(red, green, blue).lerp(
    new THREE.Vector3(1, 1, 1),
    ATMOSPHERE_WHITE_MIX,
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAirColor: { value: air },
      uSunDir: { value: new THREE.Vector3(sunDir.x, sunDir.y, sunDir.z) },
      uTerminatorThreshold: {
        value: new THREE.Vector3(...system.terminatorThresholdVector),
      },
      uPlanetRadius: { value: planetRadius },
      uShellRadius: { value: shellRadius },
      uStrength: { value: system.air_density * ATMOSPHERE_STRENGTH },
    },
    vertexShader: ATMOSPHERE_VERTEX_SHADER,
    fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
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
