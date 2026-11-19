// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Octree-against-octree contact over hulls and their subentities (CBT-18,
 * D-01, PD-01): a literal recursive port of Oolite's `doOctreesCollide`
 * (`ShipEntity.m:1878-1942`). It decides contact only; it applies nothing
 * (no damage, no push, no record), and nothing calls it yet (plans 18-11 and
 * 18-18 build the collision stage on it).
 *
 * D-01: contact is decided octree against octree with Oolite's own crude
 * prunes (`isHitByOctree`, `./octree.ts`), never by bounding spheres alone and
 * never by exact geometry. The caller does the sphere test first, as Oolite's
 * collision pass does; this function looks at the octrees only.
 *
 * The C, in order:
 *
 * 1. hull against hull (`:1895-1900`): the other's hull is hit, return it;
 * 2. each of the prime's subentities against the whole other, by calling
 *    itself with that subentity as prime (`:1902-1911`); any contact returns
 *    the other's hull;
 * 3. the prime against each of the other's subentities, again by calling
 *    itself (`:1913-1922`); a contact returns that subentity;
 * 4. the prime's subentities against the other's subentities
 *    (`:1924-1938`). Never reached with a result: stage 2's recursion already
 *    runs the prime's subentity against the other's subentities, so a
 *    subentity-against-subentity contact returns the other's hull there
 *    (18-02 fixture `octree-sub-sub-returns-other`; review L723@2e0bfb3). The
 *    stage is not ported.
 *
 * Detached subentities (PD-01) stand in for the C's `canCollide` check on a
 * subentity (`ShipEntity.m:1858-1876`): an index in `otherDetached` or
 * `primeDetached` takes no part. Stage 2 passes `otherDetached` through, so a
 * detached subentity of the other stays out of the recursion too.
 *
 * The frames (`ShipEntity.m:1884-1894`, `Entity.m:632-646`,
 * `ShipEntity.m:2008-2025`): the other's centre and axes are resolved into the
 * prime's Oolite model frame, x right, y up, z toward the nose. Wegolite's
 * local forward is -Z, so the model axes of a pose are `rotate(q, +X)`,
 * `rotate(q, +Y)` and `rotate(q, -Z)`, as `toOoliteModelSegment` has it. A
 * subentity's authored offset is in Oolite model axes; its absolute position
 * is the parent's position plus the parent's rotation of `(x, y, -z)`, and its
 * orientation is the parent's (every solid subentity Wegolite carries is
 * authored with the identity orientation).
 *
 * Total: a non-finite position or a non-unit orientation is no contact; the
 * octree test refuses everything else it cannot use. Pure TypeScript: no
 * Three.js, no DOM.
 */

import { dot, rotate, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import { QUAT_UNIT_TOLERANCE } from "../world/limits.js";
import type { HullData } from "./hit.js";
import { isHitByOctree } from "./octree.js";

/** Where a hull is and how it is turned, in Wegolite world axes. */
export interface HullPose {
  readonly position: Vec3;
  readonly orientation: Quat;
}

/**
 * The part of the other that was touched: its hull, or one of its
 * subentities by index into `HullData.subentities`.
 */
export type ContactPart =
  | { readonly kind: "hull" }
  | { readonly kind: "subentity"; readonly index: number };

/**
 * What the contact test reads of a hull. A `HullData` is one; so is a
 * `SubentityHull`, which has no subentities of its own, so stage 2 calls the
 * same function with a subentity as prime.
 */
export type ContactHull = Pick<HullData, "octree" | "subentities">;

const HULL: ContactPart = { kind: "hull" };

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isUsablePose(pose: HullPose): boolean {
  const q = pose.orientation;
  if (
    !finiteVec(pose.position) ||
    !Number.isFinite(q.w) ||
    !Number.isFinite(q.x) ||
    !Number.isFinite(q.y) ||
    !Number.isFinite(q.z)
  ) {
    return false;
  }
  const normSq = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;
  return Math.abs(normSq - 1) <= QUAT_UNIT_TOLERANCE;
}

/**
 * `-absolutePositionForSubentity` for a subentity of `parent`
 * (`Entity.m:632-646`): the authored Oolite-axis offset taken to Wegolite
 * local `(x, y, -z)`, turned by the parent and added to its position.
 */
function subentityPose(parent: HullPose, offset: Vec3): HullPose {
  const turned = rotate(parent.orientation, vec(offset.x, offset.y, -offset.z));
  return {
    position: vec(
      parent.position.x + turned.x,
      parent.position.y + turned.y,
      parent.position.z + turned.z,
    ),
    orientation: parent.orientation,
  };
}

/**
 * `ShipEntity.m:1878-1942` `doOctreesCollide(prime, other)`: the other's part
 * the prime touches, or `null`. See the file header for the stages, the frames
 * and why the C's fourth stage is not ported.
 */
export function doOctreesCollide(
  prime: ContactHull,
  primePose: HullPose,
  other: ContactHull,
  otherPose: HullPose,
  otherDetached?: ReadonlySet<number>,
  primeDetached?: ReadonlySet<number>,
): ContactPart | null {
  if (!isUsablePose(primePose) || !isUsablePose(otherPose)) return null;

  // `:1884-1894`: the other's centre and axes in the prime's model frame.
  const q = primePose.orientation;
  const right = rotate(q, vec(1, 0, 0));
  const up = rotate(q, vec(0, 1, 0));
  const forward = rotate(q, vec(0, 0, -1));
  const toPrime = (v: Vec3): Vec3 =>
    vec(dot(v, right), dot(v, up), dot(v, forward));
  const origin = toPrime(
    vec(
      otherPose.position.x - primePose.position.x,
      otherPose.position.y - primePose.position.y,
      otherPose.position.z - primePose.position.z,
    ),
  );
  const o = otherPose.orientation;
  const ijk: readonly [Vec3, Vec3, Vec3] = [
    toPrime(rotate(o, vec(1, 0, 0))),
    toPrime(rotate(o, vec(0, 1, 0))),
    toPrime(rotate(o, vec(0, 0, -1))),
  ];

  // `:1895-1900`: hull against hull, the prime's tree axial.
  if (isHitByOctree(prime.octree, other.octree, origin, ijk)) return HULL;

  // `:1902-1911`: each of the prime's subentities against the whole other.
  const primeSubs = prime.subentities ?? [];
  for (let i = 0; i < primeSubs.length; i += 1) {
    const sub = primeSubs[i];
    if (sub === undefined || primeDetached?.has(i) === true) continue;
    const contact = doOctreesCollide(
      sub,
      subentityPose(primePose, sub.position),
      other,
      otherPose,
      otherDetached,
    );
    if (contact !== null) return HULL;
  }

  // `:1913-1922`: the prime against each of the other's subentities.
  const otherSubs = other.subentities ?? [];
  for (let i = 0; i < otherSubs.length; i += 1) {
    const sub = otherSubs[i];
    if (sub === undefined || otherDetached?.has(i) === true) continue;
    const contact = doOctreesCollide(
      prime,
      primePose,
      sub,
      subentityPose(otherPose, sub.position),
      undefined,
      primeDetached,
    );
    if (contact !== null) return { kind: "subentity", index: i };
  }

  // `:1924-1938` is not ported (see the header); `:1940-1941` no collision.
  return null;
}
