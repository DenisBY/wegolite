// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The order of Oolite's position-sorted linked lists (`x_list`, `y_list`,
 * `z_list`; `Entity.m:207-256` adds a body, 405-470 keeps it sorted as it
 * moves): by the lower edge, position minus ONE collision radius
 * (`Entity.m:247`, 462-467). The C moves a body past another only on a strict
 * `<` or `>`, so ties keep insertion order; here ties sort by ascending id.
 *
 * Oolite's coordinates are Wegolite's with z negated (`./layout.ts`), so the
 * z list sorts on `-z`.
 *
 * Two consumers share this one key: the collision-chain prefilter
 * (`../npc/collision-chain.ts`, Oolite's `filterSortedLists`) and the
 * collision stage's choice of the octree test's prime
 * (`../combat/collide.ts`, owner decision 2026-11-20).
 */

import type { Vec3 } from "../math.js";
import type { EntityId } from "./ids.js";

/** What a sorted list orders a body by. */
export interface ListBody {
  readonly id: EntityId;
  readonly position: Vec3;
  /** The collision radius, metres. */
  readonly radius: number;
}

/** Oolite's coordinate on one axis of a Wegolite position. */
export type ListAxis = (p: Vec3) => number;
export const OOLITE_X: ListAxis = (p) => p.x;
export const OOLITE_Y: ListAxis = (p) => p.y;
/** Oolite's z is Wegolite's `-z`. */
export const OOLITE_Z: ListAxis = (p) => -p.z;

/**
 * Oolite's order of two bodies on `axis`: negative when `a` comes first,
 * the lower edge (`axis(position) - radius`) ascending, ties by ascending id.
 */
export function compareOnAxis(
  axis: ListAxis,
  a: ListBody,
  b: ListBody,
): number {
  const pa = axis(a.position) - a.radius;
  const pb = axis(b.position) - b.radius;
  return pa < pb ? -1 : pa > pb ? 1 : a.id - b.id;
}

/**
 * Oolite's z-list order of two bodies: negative when `a` comes first. The
 * last walk of `filterSortedLists` links each body of a run to the next one
 * up the z list (`Universe.m:7044-7073`), and the collision region tests a
 * body against the later bodies of its chain (`CollisionRegion.m:284-287`),
 * so of any tested pair the body that comes first is `e1`, the prime of the
 * octree test (`[e1 checkCloseCollisionWith:e2]`, `CollisionRegion.m:341-343`;
 * `doOctreesCollide(self, other)`, `ShipEntity.m:1993`).
 */
export function compareZOrder(a: ListBody, b: ListBody): number {
  return compareOnAxis(OOLITE_Z, a, b);
}
