// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The two-stage laser hit rule (CBT-07, D-01, D-02): a port of
 * `-[Universe firstShipHitByLaserFromShip:inDirection:offset:gettingRangeFound:]`
 * (`Universe.m:5549-5640`). Stage A is a cheap bounding-sphere test in the
 * shooter's laser frame; only a target that passes it gets the octree descent
 * of stage B (`./octree.ts`). A shot inside a bounding sphere but outside the
 * hull therefore misses (ROADMAP success criterion 3).
 *
 * The caller supplies the targets (ascending id, as the world iterates them),
 * the laser frame and the hull data. Hull data arrives as a lazily loaded
 * artifact (D-01): a target whose spec key has no entry, or a call with no
 * table at all, is in the "not loaded" state and cannot be hit. Never throws.
 *
 * Subentity data arrives (plan 18-13); the hit rule ignores it until plan 18-04.
 * The table now also holds the static hulls (the Coriolis station, the buoy, the
 * barrel and the alloy plate), with their solid subentities and frangibility,
 * but the subentity branch (`:5560-5568`, `:5623-5636`) is not ported yet: a
 * target is tested against its own hull octree only. The caller builds the
 * laser frame (facing rotation and mount offset, `:5585-5605`) and passes it as
 * `ray`.
 */

import { dot, sub } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { EntityId } from "../world/ids.js";
import { isHitByLine, toOoliteModelSegment } from "./octree.js";
import type { HullOctree } from "./octree.js";

/**
 * One solid subentity of a hull (a station's faceplate, a buoy's ring): its
 * own octree at its authored position. `position` is in Oolite model axes, as
 * the `.dat` and `shipdata.plist` author it (x right, y up, z toward the nose),
 * not converted to Wegolite's axes; `mass` is the compiled Oolite mass in
 * kilograms.
 */
export interface SubentityHull {
  readonly key: string;
  readonly position: Vec3;
  readonly mass: number;
  readonly octree: HullOctree;
}

/** What the hit rule needs to know about one hull (RESEARCH Pattern 3). */
export interface HullData {
  /** Oolite `collision_radius` of the hull: the stage A bounding sphere. */
  readonly collisionRadius: number;
  readonly octree: HullOctree;
  /**
   * The solid subentities, in the authored order. Only the static hulls carry
   * the key; the ten ship hulls have none.
   */
  readonly subentities?: readonly SubentityHull[];
  /**
   * Oolite's `isFrangible`: whether a subentity can be destroyed separately.
   * Only the static hulls carry the key.
   */
  readonly frangible?: boolean;
}

/** The loaded hull data, keyed by ship spec key. */
export type HullTable = ReadonlyMap<string, HullData>;

/** One ship a laser may hit. */
export interface HitTarget {
  readonly id: EntityId;
  /** The spec key the hull table is keyed by. */
  readonly specKey: string;
  readonly position: Vec3;
  readonly orientation: Quat;
}

/**
 * The laser as the shooter's frame sees it (`Universe.m:5556-5606`): `origin`
 * is `p0` (position plus the rotated mount offset), `forward` the unit beam
 * direction (`f1`), and `right` / `up` the frame's other two axes (`r1`,
 * `u1`). `range` is the weapon range, the initial `nearest`.
 */
export interface LaserRay {
  readonly origin: Vec3;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly range: number;
}

function finite(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/**
 * The first ship a laser hits, or `null`. `distance` is Oolite's octree
 * distance (to the centre of the first solid leaf it reached), which is what
 * the nearest-ship rule compares; it is the value Oolite stores as the beam
 * length (`nearest`).
 */
export function firstShipHit(
  ray: LaserRay,
  targets: readonly HitTarget[],
  hulls: HullTable | undefined,
): { readonly id: EntityId; readonly distance: number } | null {
  if (
    !finite(ray.origin) ||
    !finite(ray.forward) ||
    !finite(ray.right) ||
    !finite(ray.up) ||
    !Number.isFinite(ray.range) ||
    ray.range <= 0
  ) {
    return null;
  }

  // `Universe.m:5570`: `nearest` starts at the weapon range.
  let nearest = ray.range;
  // `:5606`: the beam endpoint, shrunk to each accepted hit.
  let endpoint = endpointAt(ray, nearest);
  let hitId: EntityId | null = null;

  for (const target of targets) {
    // D-01 "not loaded": a target without hull data cannot be hit.
    const hull = hulls?.get(target.specKey);
    if (hull === undefined) continue;
    const cr = hull.collisionRadius;
    if (!Number.isFinite(cr) || !finite(target.position)) continue;

    // `:5611-5619` stage A: the outermost bounding sphere, in the laser frame.
    const rpos = sub(target.position, ray.origin);
    const vx = dot(rpos, ray.right);
    const vy = dot(rpos, ray.up);
    const vz = dot(rpos, ray.forward);
    const inSphere =
      vz > 0 && // ahead
      vz < nearest + cr && // within range
      vx < cr &&
      vx > -cr &&
      vy < cr &&
      vy > -cr && // not off to one side or another
      vx * vx + vy * vy < cr * cr; // not off to both sides
    if (!inSphere) continue;

    // `:5620` stage B: the octree descent, in the target's model frame
    // (`ShipEntity.m:1314-1321`).
    const { w0, w1 } = toOoliteModelSegment(
      target.position,
      target.orientation,
      ray.origin,
      endpoint,
    );
    const hit = isHitByLine(hull.octree, w0, w1);

    // `:5622-5629`: accept a hit nearer than the best so far and shrink the
    // beam to it.
    if (hit > 0 && hit < nearest) {
      hitId = target.id;
      nearest = hit;
      endpoint = endpointAt(ray, nearest);
    }
  }

  return hitId === null ? null : { id: hitId, distance: nearest };
}

/** `p0 + f1 * length` (`Universe.m:5606`, `:5628`). */
function endpointAt(ray: LaserRay, length: number): Vec3 {
  return {
    x: ray.origin.x + ray.forward.x * length,
    y: ray.origin.y + ray.forward.y * length,
    z: ray.origin.z + ray.forward.z * length,
  };
}
