// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Lave planet, baseline (WORLD-03).
 *
 * One sphere and one built-in material for the tracer. Plan 03 replaces the
 * material with the procedural `ShaderMaterial` driven by the planetinfo
 * palette, so this module deliberately carries no palette uniforms yet; the
 * colour is a green/mauve blend that reads as Lave rather than as a blue
 * marble. Tessellation only affects the silhouette.
 */

import * as THREE from "three";
import type { SystemLayout } from "../../sim/world/layout.js";

/** A land-green / sea-mauve blend standing in for the procedural surface. */
const LAVE_SURFACE_COLOR = 0x7a8a5f;

export function createPlanet(layout: SystemLayout): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(layout.planet.radius, 96, 48);
  const material = new THREE.MeshStandardMaterial({
    color: LAVE_SURFACE_COLOR,
    roughness: 1,
    metalness: 0,
  });
  const planet = new THREE.Mesh(geometry, material);
  planet.name = "planet";
  return planet;
}
