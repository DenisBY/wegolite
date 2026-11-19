// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hull octree line test (CBT-07, D-02): a line-by-line port of Oolite's
 * `isHitByLine`/`isHitByLineSub` (`Octree.m:336-471`) with the `OOVoxel.m:29-260`
 * helpers it calls (`checkFace`, `checkBevel`, `checkCorner`,
 * `lineIntersectionWithFace`, `checkPoint`, `checkLine`, `lineCubeIntersection`).
 *
 * Two properties are kept on purpose and must not be "cleaned up" (RESEARCH F8,
 * Pitfall 4):
 *
 * - the descent visits the octants in Oolite's fixed order (the octant the line
 *   enters, its three face neighbours, the three back neighbours, then the
 *   diagonal), and the first solid leaf it reaches ends the search;
 * - the returned distance is the length of the start point displaced by the
 *   current cell offset at that leaf, that is the distance from the line start
 *   to the CENTRE of the first solid leaf, not the distance to the nearest
 *   surface. `firstShipHitByLaserFromShip` compares exactly these numbers
 *   between ships.
 *
 * Differences from the C code, all defensive and none on a valid input: the
 * maths is float64 where Oolite uses float32 (RESEARCH A2: a different hit/miss
 * only on rays that graze a cell boundary); the static `hit_dist` and
 * `hasCollided` of the C file are locals of one call; a non-finite endpoint, a
 * non-finite face intersection, an over-deep tree or a malformed node is a
 * miss, never a throw (T-13-04, T-13-05). The debug collision buffer
 * (`collbuffer`) only feeds Oolite's wireframe drawing and is dropped.
 *
 * The octree-against-octree contact test `isHitByOctree` (`Octree.m:473-607`,
 * CBT-18, D-01, plan 18-09) lives at the end of this file, beside the node
 * layout and `offsetForOctant` it shares with the line test.
 *
 * The octree arrives from the build artifact (plan 13-04) through step
 * options. Pure TypeScript: no Three.js, no DOM, no `src/content` import.
 */

import { dot, rotate, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";

/**
 * A node of the hull octree. Mirrors the build-time octree module of the
 * content build (`convert/octree.ts`; the sim must not import the build
 * tooling): `0` is empty, `-1` is solid, anything
 * else is exactly eight children in index order `x * 4 + y * 2 + z`, the plus
 * side of an axis being 1 (`Octree.m:640-645`, `offsetForOctant`, line 158).
 */
export type OctreeNode = 0 | -1 | readonly OctreeNode[];

/** A hull octree: a cube centred on the model origin with half-width `radius`. */
export interface HullOctree {
  /** The root half-width (`Octree.m` `_radius`). */
  readonly radius: number;
  /** The depth the tree was built to. */
  readonly depth: number;
  readonly root: OctreeNode;
}

/**
 * The deepest tree the traversal accepts. Mirrors the build-time
 * `OCTREE_MAX_DEPTH` (`convert/octree.ts` of the content build); a tree built to
 * depth 7 nests seven levels of child arrays. Deeper input is a miss
 * (T-13-05), so a tampered artifact cannot exhaust the stack.
 */
export const MAX_OCTREE_DEPTH = 7;

/* `OOVoxel.h:29-34`: the six cube faces. */
const CUBE_FACE_RIGHT = 0x01;
const CUBE_FACE_LEFT = 0x02;
const CUBE_FACE_TOP = 0x04;
const CUBE_FACE_BOTTOM = 0x08;
const CUBE_FACE_FRONT = 0x10;
const CUBE_FACE_BACK = 0x20;
/** `0x3f`: all six faces, the base of the `checkPoint` masks in `checkLine`. */
const ALL_FACES = 0x3f;

/** The octree's own coordinates, kept as plain numbers to avoid allocation. */
interface Pt {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * `OOVoxel.m:29-45` `checkFace`: which face planes of the cube of half-width
 * `rd` the point is outside.
 */
function checkFace(p: Pt, rd: number): number {
  let faces = 0;
  if (p.x > rd) faces |= CUBE_FACE_RIGHT;
  if (p.x < -rd) faces |= CUBE_FACE_LEFT;
  if (p.y > rd) faces |= CUBE_FACE_TOP;
  if (p.y < -rd) faces |= CUBE_FACE_BOTTOM;
  if (p.z > rd) faces |= CUBE_FACE_FRONT;
  if (p.z < -rd) faces |= CUBE_FACE_BACK;
  return faces;
}

/** `OOVoxel.m:47-76` `checkBevel`: the twelve edge planes. */
function checkBevel(p: Pt, rd: number): number {
  const r2 = rd * 2;
  let bevels = 0;
  if (p.x + p.y > r2) bevels |= 0x001;
  if (p.x - p.y > r2) bevels |= 0x002;
  if (-p.x + p.y > r2) bevels |= 0x004;
  if (-p.x - p.y > r2) bevels |= 0x008;
  if (p.x + p.z > r2) bevels |= 0x010;
  if (p.x - p.z > r2) bevels |= 0x020;
  if (-p.x + p.z > r2) bevels |= 0x040;
  if (-p.x - p.z > r2) bevels |= 0x080;
  if (p.y + p.z > r2) bevels |= 0x100;
  if (p.y - p.z > r2) bevels |= 0x200;
  if (-p.y + p.z > r2) bevels |= 0x400;
  if (-p.y - p.z > r2) bevels |= 0x800;
  return bevels;
}

/** `OOVoxel.m:78-99` `checkCorner`: the eight corner planes. */
function checkCorner(p: Pt, rd: number): number {
  const r3 = rd * 3;
  let corners = 0;
  if (p.x + p.y + p.z > r3) corners |= 0x01;
  if (p.x + p.y - p.z > r3) corners |= 0x02;
  if (p.x - p.y + p.z > r3) corners |= 0x04;
  if (p.x - p.y - p.z > r3) corners |= 0x08;
  if (-p.x + p.y + p.z > r3) corners |= 0x10;
  if (-p.x + p.y - p.z > r3) corners |= 0x20;
  if (-p.x - p.y + p.z > r3) corners |= 0x40;
  if (-p.x - p.y - p.z > r3) corners |= 0x80;
  return corners;
}

/**
 * `OOVoxel.m:101-133` `lineIntersectionWithFace`: where the line `p1 -> p2`
 * crosses the first face named by `mask`, in the C priority order right, left,
 * top, bottom, front, back. A division by zero cannot happen on a valid call
 * (`checkLine` only names a face whose axis differs), but the caller still
 * finite-checks the result (Pitfall 4).
 */
function lineIntersectionWithFace(
  p1: Pt,
  p2: Pt,
  mask: number,
  rd: number,
): Pt {
  if ((CUBE_FACE_RIGHT & mask) !== 0) {
    const t = (rd - p1.x) / (p2.x - p1.x);
    return vec(rd, p1.y + (p2.y - p1.y) * t, p1.z + (p2.z - p1.z) * t);
  }
  if ((CUBE_FACE_LEFT & mask) !== 0) {
    const t = (-rd - p1.x) / (p2.x - p1.x);
    return vec(-rd, p1.y + (p2.y - p1.y) * t, p1.z + (p2.z - p1.z) * t);
  }
  if ((CUBE_FACE_TOP & mask) !== 0) {
    const t = (rd - p1.y) / (p2.y - p1.y);
    return vec(p1.x + (p2.x - p1.x) * t, rd, p1.z + (p2.z - p1.z) * t);
  }
  if ((CUBE_FACE_BOTTOM & mask) !== 0) {
    const t = (-rd - p1.y) / (p2.y - p1.y);
    return vec(p1.x + (p2.x - p1.x) * t, -rd, p1.z + (p2.z - p1.z) * t);
  }
  if ((CUBE_FACE_FRONT & mask) !== 0) {
    const t = (rd - p1.z) / (p2.z - p1.z);
    return vec(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, rd);
  }
  if ((CUBE_FACE_BACK & mask) !== 0) {
    const t = (-rd - p1.z) / (p2.z - p1.z);
    return vec(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t, -rd);
  }
  return p1;
}

/** `OOVoxel.m:135-142` `checkPoint`: the point at `alpha` along the line. */
function checkPoint(
  p1: Pt,
  p2: Pt,
  alpha: number,
  mask: number,
  rd: number,
): number {
  const pp = vec(
    p1.x + alpha * (p2.x - p1.x),
    p1.y + alpha * (p2.y - p1.y),
    p1.z + alpha * (p2.z - p1.z),
  );
  return checkFace(pp, rd) & mask;
}

/**
 * `OOVoxel.m:144-160` `checkLine`: which of the faces in `mask` the line
 * really crosses (the crossing point lies inside the other five face planes).
 */
function checkLine(p1: Pt, p2: Pt, mask: number, rd: number): number {
  let result = 0;
  if (
    (CUBE_FACE_RIGHT & mask) !== 0 &&
    p1.x > p2.x &&
    checkPoint(
      p1,
      p2,
      (rd - p1.x) / (p2.x - p1.x),
      ALL_FACES - CUBE_FACE_RIGHT,
      rd,
    ) === 0
  ) {
    result |= CUBE_FACE_RIGHT;
  }
  if (
    (CUBE_FACE_LEFT & mask) !== 0 &&
    p1.x < p2.x &&
    checkPoint(
      p1,
      p2,
      (-rd - p1.x) / (p2.x - p1.x),
      ALL_FACES - CUBE_FACE_LEFT,
      rd,
    ) === 0
  ) {
    result |= CUBE_FACE_LEFT;
  }
  if (
    (CUBE_FACE_TOP & mask) !== 0 &&
    p1.y > p2.y &&
    checkPoint(
      p1,
      p2,
      (rd - p1.y) / (p2.y - p1.y),
      ALL_FACES - CUBE_FACE_TOP,
      rd,
    ) === 0
  ) {
    result |= CUBE_FACE_TOP;
  }
  if (
    (CUBE_FACE_BOTTOM & mask) !== 0 &&
    p1.y < p2.y &&
    checkPoint(
      p1,
      p2,
      (-rd - p1.y) / (p2.y - p1.y),
      ALL_FACES - CUBE_FACE_BOTTOM,
      rd,
    ) === 0
  ) {
    result |= CUBE_FACE_BOTTOM;
  }
  if (
    (CUBE_FACE_FRONT & mask) !== 0 &&
    p1.z > p2.z &&
    checkPoint(
      p1,
      p2,
      (rd - p1.z) / (p2.z - p1.z),
      ALL_FACES - CUBE_FACE_FRONT,
      rd,
    ) === 0
  ) {
    result |= CUBE_FACE_FRONT;
  }
  if (
    (CUBE_FACE_BACK & mask) !== 0 &&
    p1.z < p2.z &&
    checkPoint(
      p1,
      p2,
      (-rd - p1.z) / (p2.z - p1.z),
      ALL_FACES - CUBE_FACE_BACK,
      rd,
    ) === 0
  ) {
    result |= CUBE_FACE_BACK;
  }
  return result;
}

/**
 * `OOVoxel.m:162-197` `lineCubeIntersection`: the line `v0 -> v1` against the
 * cube of half-width `rd` centred on the origin. `-1` when an endpoint is
 * inside, `0` on a miss, otherwise the mask of faces the line crosses.
 */
function lineCubeIntersection(v0: Pt, v1: Pt, rd: number): number {
  let v0Test = checkFace(v0, rd);
  if (v0Test === 0) return -1; // v0 is inside the cube
  let v1Test = checkFace(v1, rd);
  if (v1Test === 0) return -1; // v1 is inside the cube

  // Both outside one face plane.
  if ((v0Test & v1Test) !== 0) return 0;

  // The same test for the 12 edge planes.
  v0Test |= checkBevel(v0, rd) << 8;
  v1Test |= checkBevel(v1, rd) << 8;
  if ((v0Test & v1Test) !== 0) return 0;

  // The same test for the 8 corner planes.
  v0Test |= checkCorner(v0, rd) << 24;
  v1Test |= checkCorner(v1, rd) << 24;
  if ((v0Test & v1Test) !== 0) return 0;

  return checkLine(v0, v1, v0Test | v1Test, rd);
}

/** `Octree.m:158-161` `offsetForOctant`: the child-cell centre, negated. */
function offsetForOctant(oct: number, r: number): Pt {
  return vec(
    (0.5 - ((oct >> 2) & 1)) * r,
    (0.5 - ((oct >> 1) & 1)) * r,
    (0.5 - (oct & 1)) * r,
  );
}

function finitePt(p: Pt): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/**
 * `Octree.m:345-346` static `hit_dist`, as one call's state: `distance` is set
 * at the first solid leaf. A mutable box so the recursion stays a port.
 */
interface HitState {
  distance: number;
}

/**
 * `Octree.m:336-343` `isHitByLineSub`: descend into child `octantMask` of
 * `node` when it is not empty, with the line shifted by that child's offset.
 * `level` is the nesting depth of `node`'s children (the over-deep guard).
 */
function isHitByLineSub(
  node: readonly OctreeNode[],
  level: number,
  rad: number,
  rd2: number,
  v0: Pt,
  v1: Pt,
  octantMask: number,
  state: HitState,
): boolean {
  const child = node[octantMask];
  if (child === undefined || child === 0) return false;
  const moveLine = offsetForOctant(octantMask, rad);
  return isHitByLineNode(child, level, rd2, v0, v1, moveLine, state);
}

/**
 * `Octree.m:347-455` `isHitByLine`. `face_hit` is always 0 in the C callers, so
 * it is not a parameter here. `level` counts the nested arrays above `node`.
 */
function isHitByLineNode(
  node: OctreeNode,
  level: number,
  rad: number,
  v0: Pt,
  v1: Pt,
  off: Pt,
  state: HitState,
): boolean {
  // Displace the line by the offset.
  const u0 = vec(v0.x + off.x, v0.y + off.y, v0.z + off.z);
  const u1 = vec(v1.x + off.x, v1.y + off.y, v1.z + off.z);

  if (node === 0) return false; // an empty octant

  if (node === -1) {
    // A solid octant: the distance to the centre of this leaf (`:364`).
    state.distance = Math.sqrt(u0.x * u0.x + u0.y * u0.y + u0.z * u0.z);
    return true;
  }

  // Anything else must be a node of eight children no deeper than the cap.
  if (!Array.isArray(node) || node.length !== 8 || level >= MAX_OCTREE_DEPTH) {
    return false;
  }

  const faces = lineCubeIntersection(u0, u1, rad);
  if (faces === 0) return false; // the line misses this octant

  let octantIntersected = 0;
  if (faces > 0) {
    const vi = lineIntersectionWithFace(u0, u1, faces, rad);
    if (!finitePt(vi)) return false; // Pitfall 4: never let NaN pick an octant

    if ((CUBE_FACE_FRONT & faces) !== 0) {
      octantIntersected = (vi.x < 0 ? 1 : 5) + (vi.y < 0 ? 0 : 2);
    }
    if ((CUBE_FACE_BACK & faces) !== 0) {
      octantIntersected = (vi.x < 0 ? 0 : 4) + (vi.y < 0 ? 0 : 2);
    }
    if ((CUBE_FACE_RIGHT & faces) !== 0) {
      octantIntersected = (vi.y < 0 ? 4 : 6) + (vi.z < 0 ? 0 : 1);
    }
    if ((CUBE_FACE_LEFT & faces) !== 0) {
      octantIntersected = (vi.y < 0 ? 0 : 2) + (vi.z < 0 ? 0 : 1);
    }
    if ((CUBE_FACE_TOP & faces) !== 0) {
      octantIntersected = (vi.x < 0 ? 2 : 6) + (vi.z < 0 ? 0 : 1);
    }
    if ((CUBE_FACE_BOTTOM & faces) !== 0) {
      octantIntersected = (vi.x < 0 ? 0 : 4) + (vi.z < 0 ? 0 : 1);
    }
  }
  // else: the line starts or ends inside the cube, octant 0 first (`:400`).

  const rd2 = 0.5 * rad;
  const next = level + 1;

  // First the intersected octant, then the three adjacent, then the next three
  // adjacent, finally the diagonal octant (`:413-452`).
  let oct0 = octantIntersected;
  let oct1 = oct0 ^ 0x01; // adjacent x
  let oct2 = oct0 ^ 0x02; // adjacent y
  let oct3 = oct0 ^ 0x04; // adjacent z

  if (isHitByLineSub(node, next, rad, rd2, u0, u1, oct0, state)) return true;
  if (isHitByLineSub(node, next, rad, rd2, u0, u1, oct1, state)) return true;
  if (isHitByLineSub(node, next, rad, rd2, u0, u1, oct2, state)) return true;
  if (isHitByLineSub(node, next, rad, rd2, u0, u1, oct3, state)) return true;

  // The next four octants.
  oct0 ^= 0x07;
  oct1 ^= 0x07;
  oct2 ^= 0x07;
  oct3 ^= 0x07;

  if (isHitByLineSub(node, next, rad, rd2, u0, u1, oct1, state)) return true;
  if (isHitByLineSub(node, next, rad, rd2, u0, u1, oct2, state)) return true;
  if (isHitByLineSub(node, next, rad, rd2, u0, u1, oct3, state)) return true;

  // And the last octant.
  return isHitByLineSub(node, next, rad, rd2, u0, u1, oct0, state);
}

/**
 * `Octree.m:457-471` `-isHitByLine:v1:`. `w0` and `w1` are the line endpoints in
 * the hull's own model frame (see {@link toOoliteModelSegment}). Returns the
 * distance from `w0` to the centre of the first solid leaf reached in Oolite's
 * visiting order, or `0` on a miss. A non-finite endpoint or radius is a miss.
 */
export function isHitByLine(octree: HullOctree, w0: Vec3, w1: Vec3): number {
  if (!finitePt(w0) || !finitePt(w1) || !Number.isFinite(octree.radius)) {
    return 0;
  }
  if (octree.radius <= 0) return 0;
  const state: HitState = { distance: 0 };
  const zero = vec(0, 0, 0);
  if (isHitByLineNode(octree.root, 0, octree.radius, w0, w1, zero, state)) {
    return state.distance;
  }
  return 0;
}

/**
 * `Octree.m:683-714` `randomFullNodeFrom` (through `-randomPoint`, `:716-719`):
 * a random point of the hull, used to place a wreck (`ShipEntity.m:8060`).
 *
 * The walk starts at the root with offset zero and the root half-width. A node
 * that is `0` or `-1` ends it and returns the offset reached. At an array node
 * of eight children it takes the next octant `oct` from `octants`, visits the
 * children `oct ^ 0` to `oct ^ 7` and descends into the first one that is not
 * empty, adding `offsetForOctant(octant, radius)` and halving the radius.
 *
 * The draw budget is fixed by the caller (D16-17): Oolite draws `Ranrot() & 7`
 * once per level descended, and here the caller always draws
 * `MAX_OCTREE_DEPTH` octants and this walk consumes them one per level, so the
 * stream position never depends on the tree's shape or on whether the table is
 * loaded. When the octants run out, at a node that is not an array of exactly
 * eight children, or at an array whose eight children are all empty (the C's
 * fall-through, `:712`), the walk stops and returns the offset reached; it
 * never recurses and never throws (T-16-12). A non-finite root half-width
 * returns the origin. The point is in Oolite's model axes (convert with
 * `toWegoliteLocal`).
 */
export function randomOctreePoint(
  octree: HullOctree,
  octants: readonly number[],
): Vec3 {
  let node: OctreeNode = octree.root;
  let radius = octree.radius;
  // A non-finite half-width would put NaN into a hashed position: the origin.
  if (!Number.isFinite(radius)) return vec(0, 0, 0);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const drawn of octants) {
    if (!Array.isArray(node) || node.length !== 8) break;
    const children: readonly OctreeNode[] = node;
    const oct = drawn & 7;
    let next: OctreeNode | undefined;
    for (let i = 0; i < 8; i += 1) {
      const octant = oct ^ i;
      const child = children[octant];
      if (child === undefined || child === 0) continue;
      const offset = offsetForOctant(octant, radius);
      x += offset.x;
      y += offset.y;
      z += offset.z;
      next = child;
      break;
    }
    if (next === undefined) break;
    node = next;
    radius *= 0.5;
  }
  return vec(x, y, z);
}

/**
 * `ShipEntity.m:1314-1321` `doesHitLine`: the segment `p0 -> p1` relative to
 * the target's position, taken into the ship's `(right, up, forward)` frame.
 *
 * Wegolite's local forward is -Z (the content build maps Oolite to glTF by
 * negating z, `convert/glb.ts:247` of the content build), so Oolite's model
 * z is the dot with `rotate(q, -Z)`; x and y are the dots with `rotate(q, +X)`
 * and `rotate(q, +Y)`. Equivalent to taking the local point and negating z.
 */
export function toOoliteModelSegment(
  targetPosition: Vec3,
  targetOrientation: Quat,
  p0: Vec3,
  p1: Vec3,
): { readonly w0: Vec3; readonly w1: Vec3 } {
  const right = rotate(targetOrientation, vec(1, 0, 0));
  const up = rotate(targetOrientation, vec(0, 1, 0));
  const forward = rotate(targetOrientation, vec(0, 0, -1));
  const u0 = vec(
    p0.x - targetPosition.x,
    p0.y - targetPosition.y,
    p0.z - targetPosition.z,
  );
  const u1 = vec(
    p1.x - targetPosition.x,
    p1.y - targetPosition.y,
    p1.z - targetPosition.z,
  );
  return {
    w0: vec(dot(u0, right), dot(u0, up), dot(u0, forward)),
    w1: vec(dot(u1, right), dot(u1, up), dot(u1, forward)),
  };
}

/**
 * `Octree.m:70` `change_oct`: the visiting order from the nearest octant to the
 * furthest, applied as `nearest ^ CHANGE_OCT[i]`.
 */
const CHANGE_OCT: readonly number[] = [0, 1, 2, 4, 3, 5, 6, 7];

/**
 * A basis row further than this from unit squared length is not a rotation:
 * the call is no hit. Keeps a huge row (1e308) from turning the crude prunes
 * into overflow arithmetic; a rotation built in float64 is within 1e-15.
 */
const IJK_UNIT_TOLERANCE = 1e-6;

/**
 * `OOTriangle.h:58-65` `resolveVectorInIJK`: the components of `v` along the
 * three rows of `ijk`, that is `B^T v` for `B` with the rows as columns.
 */
function resolveVectorInIJK(v: Pt, ijk: readonly [Vec3, Vec3, Vec3]): Pt {
  return vec(dot(v, ijk[0]), dot(v, ijk[1]), dot(v, ijk[2]));
}

/**
 * A node the descent may enter at `level`: solid, or an array of exactly eight
 * children no deeper than the cap (the same rule as `isHitByLineNode`). An
 * empty node is handled by the caller (`Octree.m:479-491`).
 */
function isEnterable(node: OctreeNode, level: number): boolean {
  if (node === -1) return true;
  return Array.isArray(node) && node.length === 8 && level < MAX_OCTREE_DEPTH;
}

/**
 * `Octree.m:473-595` static `isHitByOctree`, one call per pair of nodes.
 * `axialLevel` and `otherLevel` count the nested arrays above each node, so
 * the recursion is bounded by both trees' depth and `MAX_OCTREE_DEPTH`
 * (T-18-20). `p` is the other node's centre in the axial frame; `ijk` stays the
 * other's axes in that frame for the whole descent, as in the C.
 */
function isHitByOctreeNode(
  axial: OctreeNode,
  axialLevel: number,
  axialRadius: number,
  other: OctreeNode,
  otherLevel: number,
  otherRadius: number,
  p: Pt,
  ijk: readonly [Vec3, Vec3, Vec3],
): boolean {
  // `:479-491`: an empty node on either side is no hit.
  if (axial === 0 || other === 0) return false;
  // Defensive (not in the C): a malformed or over-deep node, or a centre that
  // overflowed, is no hit.
  if (!isEnterable(axial, axialLevel) || !isEnterable(other, otherLevel)) {
    return false;
  }
  if (!finitePt(p)) return false;

  // `:497-512`: the crude prune. The radius compare only picks which test
  // runs; the axial tree stays the axial tree (review L78@b45e113).
  if (otherRadius < axialRadius) {
    // `:497-503`: the other's sphere, as a box, against the axial cube.
    if (
      p.x + otherRadius < -axialRadius ||
      p.x - otherRadius > axialRadius ||
      p.y + otherRadius < -axialRadius ||
      p.y - otherRadius > axialRadius ||
      p.z + otherRadius < -axialRadius ||
      p.z - otherRadius > axialRadius
    ) {
      return false;
    }
  } else {
    // `:504-512`: the axial sphere, as a box, against the other's cube, in
    // the other's frame.
    const axialPosition = resolveVectorInIJK(vec(-p.x, -p.y, -p.z), ijk);
    if (!finitePt(axialPosition)) return false;
    if (
      axialPosition.x + axialRadius < -otherRadius ||
      axialPosition.x - axialRadius > otherRadius ||
      axialPosition.y + axialRadius < -otherRadius ||
      axialPosition.y - axialRadius > otherRadius ||
      axialPosition.z + axialRadius < -otherRadius ||
      axialPosition.z - axialRadius > otherRadius
    ) {
      return false;
    }
  }

  if (axial === -1) {
    // `:517-525`: both solid, the octrees collide.
    if (other === -1) return true;
    // `:526-560`: decompose the other, nearest octant to the axial node first.
    const children = other;
    const nearestOct =
      (p.x > 0 ? 0 : 4) | (p.y > 0 ? 0 : 2) | (p.z > 0 ? 0 : 1);
    const nextRadius = 0.5 * otherRadius;
    for (let i = 0; i < 8; i += 1) {
      const oct = nearestOct ^ (CHANGE_OCT[i] ?? 0);
      const child = children[oct];
      if (child === undefined || child === 0) continue; // empty octant
      // `:550-554`: the child offset through `resolveVectorInIJK`, the
      // transpose of the other-to-axial map, kept as the C has it (18-02
      // `octree-rotated-decomposition-transposed`): do not correct it.
      const voff = resolveVectorInIJK(offsetForOctant(oct, otherRadius), ijk);
      const next = vec(p.x - voff.x, p.y - voff.y, p.z - voff.z);
      if (
        isHitByOctreeNode(
          axial,
          axialLevel,
          axialRadius,
          child,
          otherLevel + 1,
          nextRadius,
          next,
          ijk,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  // `:561-594`: decompose the axial node, nearest octant to the other first.
  const children = axial;
  const nearestOct = (p.x > 0 ? 4 : 0) | (p.y > 0 ? 2 : 0) | (p.z > 0 ? 1 : 0);
  const nextRadius = 0.5 * axialRadius;
  for (let i = 0; i < 8; i += 1) {
    const oct = nearestOct ^ (CHANGE_OCT[i] ?? 0);
    const child = children[oct];
    if (child === undefined || child === 0) continue; // empty octant
    const off = offsetForOctant(oct, axialRadius);
    const next = vec(p.x + off.x, p.y + off.y, p.z + off.z);
    if (
      isHitByOctreeNode(
        child,
        axialLevel + 1,
        nextRadius,
        other,
        otherLevel,
        otherRadius,
        next,
        ijk,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * `Octree.m:597-607` `-isHitByOctree:withOrigin:andIJK:` over `:473-595`:
 * whether `other`, centred at `origin` and turned to `ijk` in `prime`'s
 * Oolite model frame, touches `prime`. `prime` is always the axial tree, the
 * caller's own (`ShipEntity.m:1897`), whatever the two radii (review
 * L78@b45e113). `ijk[a]` is the other's axis `a` in the prime's frame
 * (`ShipEntity.m:1889-1894`).
 *
 * The test is Oolite's own heuristic, not exact geometry (D-01): a box around
 * the smaller node's sphere against the larger node's cube, so a rotated pair
 * can touch up to `(sqrt(3) - 1)` times the larger half-width apart and miss a
 * shallow overlap; the decomposition of a rotated other uses the transposed
 * basis (`:552`). Both are kept. Float64 where Oolite has float32.
 *
 * Total (T-18-20): a non-finite or non-positive radius, a non-finite origin, a
 * basis row that is not of unit length, a malformed or over-deep node, or a
 * centre that overflows is no hit, never a throw. The C's collision-mark
 * buffers only feed debug drawing and are dropped.
 */
export function isHitByOctree(
  prime: HullOctree,
  other: HullOctree,
  origin: Vec3,
  ijk: readonly [Vec3, Vec3, Vec3],
): boolean {
  const axialRadius = prime.radius;
  const otherRadius = other.radius;
  if (
    !Number.isFinite(axialRadius) ||
    !Number.isFinite(otherRadius) ||
    axialRadius <= 0 ||
    otherRadius <= 0 ||
    !finitePt(origin)
  ) {
    return false;
  }
  for (const row of ijk) {
    if (!finitePt(row)) return false;
    const lengthSq = dot(row, row);
    if (!(Math.abs(lengthSq - 1) <= IJK_UNIT_TOLERANCE)) return false;
  }
  return isHitByOctreeNode(
    prime.root,
    0,
    axialRadius,
    other.root,
    0,
    otherRadius,
    origin,
    ijk,
  );
}
