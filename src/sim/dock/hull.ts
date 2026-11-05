// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Hull contact detection (DOCK-03, D-05, D-09, T-04-39, T-04-42, T-04-55).
 *
 * A separating-axis test between the ship OBB and the emitted contact proxy,
 * performed entirely in the docking-port frame. 04-02's `dockSnapshot` already
 * supplies the OBB centre and its three unit axes on `i`/`j`/`k`, and
 * `geometry.contactPort` is the emitted station-local proxy converted once by
 * `createDockGeometry`; nothing here re-projects or re-derives either.
 *
 * Fifteen axes are tested in a fixed order: the three box axes, the three ship
 * axes, then the nine cross products `cross(boxAxis_i, shipAxis_j)` in
 * lexicographic order. A cross-product axis whose squared length is below
 * `1e-12` is mathematically degenerate and skipped. On separation the result is
 * `null`; otherwise the minimum-overlap axis is the minimum translation vector,
 * with an exact tie resolved toward the earliest axis in that order so the
 * response is deterministic. This replaces corner-inside testing: an edge or
 * face intersection is found even when no ship corner is inside the box.
 *
 * `obbsIntersect` shares exactly the same inputs and predicate, so the no-trap
 * oracle cannot disagree with the code that resolves the contact.
 */

import { add, cross, dot, lengthSquared, scale, sub, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import type { DockSnapshot } from "./corridor.js";
import type { DockBox } from "./geometry.js";

/** The box axis a contact normal is most aligned with, in port coordinates. */
export type ContactAxis = "x" | "y" | "z";

export interface HullContact {
  /** Unit normal in world space, pointing from the box toward the ship. */
  readonly normalWorld: Vec3;
  /** Penetration depth along the normal, in metres. */
  readonly depth: number;
  /** The port-frame axis the normal is most aligned with. */
  readonly axis: ContactAxis;
}

/** The three contact-box axes in the port frame. */
const BOX_AXES: readonly [Vec3, Vec3, Vec3] = [
  vec(1, 0, 0),
  vec(0, 1, 0),
  vec(0, 0, 1),
];

/** Below this squared length a cross product is degenerate and skipped. */
const DEGENERATE_AXIS = 1e-12;

interface MinimumTranslation {
  readonly axis: Vec3;
  readonly depth: number;
}

function finiteVec(value: Vec3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function boxCentre(box: DockBox): Vec3 {
  return vec(0, 0, (box.zMin + box.zMax) / 2);
}

function boxHalfExtents(box: DockBox): Vec3 {
  return vec(box.halfX, box.halfY, (box.zMax - box.zMin) / 2);
}

/**
 * The OBB half extents on its own three axes.
 *
 * `DockSnapshot` deliberately carries the world corners and the port-frame
 * centre/axes rather than a second copy of the ship's box, so the extents are
 * recovered by projecting the corners onto the ship axes. For the eight corners
 * of an AABB rotated by the ship orientation this is exact, and it keeps the
 * SAT and the snapshot on one source of truth.
 */
function obbHalfExtents(snapshot: DockSnapshot): Vec3 {
  const { frame, corners, centre, axes } = snapshot;
  let halfX = 0;
  let halfY = 0;
  let halfZ = 0;
  for (const corner of corners) {
    const relative = sub(corner, frame.origin);
    const port = vec(
      dot(relative, frame.i),
      dot(relative, frame.j),
      dot(relative, frame.k),
    );
    const offset = sub(port, centre);
    halfX = Math.max(halfX, Math.abs(dot(offset, axes[0])));
    halfY = Math.max(halfY, Math.abs(dot(offset, axes[1])));
    halfZ = Math.max(halfZ, Math.abs(dot(offset, axes[2])));
  }
  return vec(halfX, halfY, halfZ);
}

/** The projection radius of an axis-aligned box on an arbitrary axis. */
function radiusOfHalfExtents(
  half: Vec3,
  axes: readonly [Vec3, Vec3, Vec3],
  axis: Vec3,
): number {
  return (
    half.x * Math.abs(dot(axes[0], axis)) +
    half.y * Math.abs(dot(axes[1], axis)) +
    half.z * Math.abs(dot(axes[2], axis))
  );
}

/** The fixed 15-axis order from the plan, without the degenerate cross axes. */
function separatingAxes(snapshot: DockSnapshot): Vec3[] {
  const ship = snapshot.axes;
  const axes: Vec3[] = [
    BOX_AXES[0],
    BOX_AXES[1],
    BOX_AXES[2],
    ship[0],
    ship[1],
    ship[2],
  ];
  for (let boxAxis = 0; boxAxis < 3; boxAxis += 1) {
    for (let shipAxis = 0; shipAxis < 3; shipAxis += 1) {
      const a = BOX_AXES[boxAxis];
      const b = ship[shipAxis];
      if (a !== undefined && b !== undefined) axes.push(cross(a, b));
    }
  }
  return axes;
}

function snapshotIsFinite(snapshot: DockSnapshot): boolean {
  if (!finiteVec(snapshot.centre)) return false;
  for (const axis of snapshot.axes) {
    if (!finiteVec(axis)) return false;
  }
  for (const corner of snapshot.corners) {
    if (!finiteVec(corner)) return false;
  }
  return true;
}

/**
 * The minimum-overlap axis, or `null` when any axis separates the two boxes.
 *
 * `depth` is normalised by the axis length, so the cross-product axes compare
 * with the face normals in metres. Ties go to the earliest axis because the
 * comparison is strict `<`.
 */
function minimumTranslation(
  snapshot: DockSnapshot,
  contactBox: DockBox,
): MinimumTranslation | null {
  if (!snapshotIsFinite(snapshot)) return null;

  const centreDelta = sub(snapshot.centre, boxCentre(contactBox));
  const halfBox = boxHalfExtents(contactBox);
  const halfShip = obbHalfExtents(snapshot);
  let best: MinimumTranslation | null = null;

  for (const axis of separatingAxes(snapshot)) {
    const axisLengthSquared = lengthSquared(axis);
    if (!(axisLengthSquared >= DEGENERATE_AXIS)) continue;

    const distance = Math.abs(dot(centreDelta, axis));
    const overlap =
      radiusOfHalfExtents(halfBox, BOX_AXES, axis) +
      radiusOfHalfExtents(halfShip, snapshot.axes, axis) -
      distance;
    if (!Number.isFinite(overlap) || overlap <= 0) return null;

    const depth = overlap / Math.sqrt(axisLengthSquared);
    if (best === null || depth < best.depth) best = { axis, depth };
  }

  return best;
}

/** The port-frame component a normal is most aligned with (earliest ties). */
function dominantAxis(normal: Vec3): ContactAxis {
  const x = Math.abs(normal.x);
  const y = Math.abs(normal.y);
  const z = Math.abs(normal.z);
  if (x >= y && x >= z) return "x";
  if (y >= z) return "y";
  return "z";
}

/**
 * The contact between the ship OBB and the contact proxy, if any.
 *
 * @returns `null` when the boxes are separated (or the snapshot is not finite).
 */
export function hullContact(
  snapshot: DockSnapshot,
  contactBox: DockBox,
): HullContact | null {
  const translation = minimumTranslation(snapshot, contactBox);
  if (translation === null) return null;

  const { axis, depth } = translation;
  const length = Math.sqrt(lengthSquared(axis));
  if (!Number.isFinite(length) || length === 0) return null;

  // Orient from the box centre toward the OBB centre; a zero resolves to +1.
  const centreDelta = sub(snapshot.centre, boxCentre(contactBox));
  const direction = dot(centreDelta, axis) >= 0 ? 1 : -1;
  const normal = scale(axis, direction / length);

  const { frame } = snapshot;
  const normalWorld = add(
    add(scale(frame.i, normal.x), scale(frame.j, normal.y)),
    scale(frame.k, normal.z),
  );

  return { normalWorld, depth, axis: dominantAxis(normal) };
}

/** Whether the ship OBB currently overlaps the contact proxy. */
export function obbsIntersect(
  snapshot: DockSnapshot,
  contactBox: DockBox,
): boolean {
  return minimumTranslation(snapshot, contactBox) !== null;
}
