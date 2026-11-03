// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The sun disc, baseline (WORLD-03).
 *
 * An unlit, tone-mapping-exempt sphere at the authored radius. The additive
 * corona billboard driven by `corona_flare`/`corona_hues`/`corona_shimmer` is
 * plan 03's; the built-in `MeshBasicMaterial` already handles log depth, so no
 * custom shader chunks are needed here.
 */

import * as THREE from "three";
import type { SystemLayout } from "../../sim/world/layout.js";

export function createSun(layout: SystemLayout): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(layout.sun.radius, 64, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });
  const sun = new THREE.Mesh(geometry, material);
  sun.name = "sun";
  return sun;
}
