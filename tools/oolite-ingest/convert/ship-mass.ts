// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's ship mass, composed at build time (DATA-11, D-01, D-02). Never
 * imported by `src/`: the content build keeps only the resulting numbers.
 *
 * The hull term is `density * 20 * octree volume` (`ShipEntity.m:417-419`), with
 * the octree and its volume from `octree.ts`.
 */

import { contentError } from "../content-error.js";
import { buildOctree, octreeVolume } from "./octree.js";
import type { OctreeMesh } from "./octree.js";

/** The `20.0f` in `mass = density * 20.0f * [octree volume]` (`ShipEntity.m:419`). */
export const MASS_FACTOR = 20;

/** `oo_floatForKey:@"density" defaultValue:1.0f` (`ShipEntity.m:417`). */
export const DEFAULT_DENSITY = 1;

const fround = Math.fround;

/**
 * The hull mass as a float32, in Oolite's evaluation order: `density * 20.0f`
 * first, then the product with the volume. Throws `SCHEMA` when the result is not
 * finite and above zero, so a bad density or mesh is never recorded silently.
 */
export function hullMass(
  mesh: OctreeMesh,
  density: number,
  file: string,
): number {
  const volume = octreeVolume(buildOctree(mesh, file));
  const mass = fround(fround(fround(density) * MASS_FACTOR) * volume);
  if (!Number.isFinite(mass) || mass <= 0) {
    throw contentError("SCHEMA", file, "mass", {
      excerpt: `the hull mass ${String(mass)} (density ${String(density)}, volume ${String(volume)}) is not finite and above zero`,
    });
  }
  return mass;
}
