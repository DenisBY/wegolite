// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Independent transliteration of Oolite's octree-against-octree test and its
 * composition over subentities (Phase 18, plan 18-02): `isHitByOctree`
 * (`Octree.m:473-595`, called through `isHitByOctree:withOrigin:andIJK:` at
 * `Octree.m:597-607`) and `doOctreesCollide` (`ShipEntity.m:1878-1942`).
 *
 * Independence: this module imports nothing outside `tests/oracles` (types of
 * this tree's `dat.ts` only). Its sole input is the pinned Oolite source
 * (commit `7437f22`), cited line by line below.
 *
 * Node shape (`Octree.m:537-551` and `:568-590` read children as `&buffer[offset + oct]`;
 * the builder writes them in this order, `OOMeshToOctreeConverter.m:
 * 391-402`): `0` empty, `-1` solid, or an array of eight children in index
 * order `oct = x * 4 + y * 2 + z`, where a set bit is the positive half.
 * `offsetForOctant(oct, r)` (`Octree.m:158-161`) is `(0.5 - bit) r` per axis,
 * the negative of the child's centre relative to its parent.
 *
 * Roles. The first tree is always the axial tree: the caller's prime
 * (`ShipEntity.m:1897`, `[prime_octree isHitByOctree:other_octree ...]`). The
 * radius compare at `Octree.m:497` only picks which crude prune runs: the
 * other's inscribed-sphere box against the axial cube (`:497-503`) when the
 * other is the smaller, else the axial's inscribed-sphere box against the
 * other's cube in the other's frame (`:504-512`). Decomposition then depends
 * on solidity alone: a solid axial decomposes the other (`:519-559`), any
 * other axial decomposes itself (`:560-594`).
 *
 * Frames. `origin` is the other's centre in the axial tree's frame and `ijk`
 * holds the other's three axes in the axial tree's frame
 * (`relative_ijk_of_other`, `ShipEntity.m:1889-1894`); as a matrix `B` with
 * those axes as columns, `B` maps the other's frame into the axial frame.
 * `resolveVectorInIJK(v, ijk)` (`OOTriangle.h:58-65`) dots `v` with each axis,
 * which is `B^T v`. The C uses it at `:507` to put the axial centre into the
 * other's frame (`B^T`, correct) and at `:552` to place the other's children
 * in the axial frame, where the geometric map is `B` but the call computes
 * `B^T`. This transliteration keeps the C as written; for a symmetric `B`
 * (identity, any half turn) the two agree, and `bruteForceOverlap` uses the
 * geometric `B`.
 *
 * Arithmetic is float64 throughout (the C computes in `GLfloat`); fixtures
 * that sit on a compare boundary use float32-exact coordinates so both widths
 * decide alike.
 */

import type { Vec3 } from "./dat.js";

/** An octree node: `0` empty, `-1` solid, or eight children. */
export type OctNode = 0 | -1 | readonly OctNode[];

export interface OctreeData {
  /** Half-width of the root cube (`Octree_details.radius`). */
  readonly radius: number;
  readonly root: OctNode;
}

/** A `Triangle` of three axis vectors (`ijk.v[0..2]`). */
export type Ijk = readonly [Vec3, Vec3, Vec3];

export const IDENTITY_IJK: Ijk = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** `change_oct` (`Octree.m:70`): nearest to furthest octant. */
export const CHANGE_OCT = [0, 1, 2, 4, 3, 5, 6, 7] as const;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** `resolveVectorInIJK` (`OOTriangle.h:58-65`). */
export function resolveVectorInIJK(v: Vec3, ijk: Ijk): Vec3 {
  return [dot(v, ijk[0]), dot(v, ijk[1]), dot(v, ijk[2])];
}

/** `offsetForOctant` (`Octree.m:158-161`). */
export function offsetForOctant(oct: number, r: number): Vec3 {
  return [
    (0.5 - ((oct >> 2) & 1)) * r,
    (0.5 - ((oct >> 1) & 1)) * r,
    (0.5 - (oct & 1)) * r,
  ];
}

function childOf(node: OctNode, oct: number): OctNode {
  if (typeof node === "number") throw new Error("a leaf has no children");
  const child = node[oct];
  if (child === undefined) throw new Error("an inner node has eight children");
  return child;
}

interface Details {
  readonly node: OctNode;
  readonly radius: number;
}

/** One line per visited call when a trace is requested (authoring aid). */
export type OctreeTrace = string[];

function fmt(v: Vec3): string {
  return `(${v.map((c) => Number(c.toFixed(6))).join(", ")})`;
}

/** `isHitByOctree` (`Octree.m:473-595`), literally. */
function isHitByOctree(
  axial: Details,
  other: Details,
  otherPosition: Vec3,
  otherIjk: Ijk,
  trace: OctreeTrace | undefined,
  depth: number,
): boolean {
  const pad = "  ".repeat(depth);
  // :479-493 empty or undefined octrees
  if (axial.node === 0) {
    trace?.push(`${pad}axial empty -> NO`);
    return false;
  }
  if (other.node === 0) {
    trace?.push(`${pad}other empty -> NO`);
    return false;
  }
  const axialRadius = axial.radius;
  const otherRadius = other.radius;
  const p = otherPosition;

  if (otherRadius < axialRadius) {
    // :497-503 the other's sphere box against the axial cube
    const rejected =
      p[0] + otherRadius < -axialRadius ||
      p[0] - otherRadius > axialRadius ||
      p[1] + otherRadius < -axialRadius ||
      p[1] - otherRadius > axialRadius ||
      p[2] + otherRadius < -axialRadius ||
      p[2] - otherRadius > axialRadius;
    trace?.push(
      `${pad}pair aR=${axialRadius} oR=${otherRadius} other at ${fmt(p)}: prune :497-503 (other sphere box vs axial cube) ${rejected ? "rejects -> NO" : "passes"}`,
    );
    if (rejected) return false;
  } else {
    // :504-512 the axial sphere box against the other cube, in the other's frame
    const d2: Vec3 = [-p[0], -p[1], -p[2]];
    const a = resolveVectorInIJK(d2, otherIjk);
    const rejected =
      a[0] + axialRadius < -otherRadius ||
      a[0] - axialRadius > otherRadius ||
      a[1] + axialRadius < -otherRadius ||
      a[1] - axialRadius > otherRadius ||
      a[2] + axialRadius < -otherRadius ||
      a[2] - axialRadius > otherRadius;
    trace?.push(
      `${pad}pair aR=${axialRadius} oR=${otherRadius} other at ${fmt(p)}: prune :504-512 (axial sphere box at ${fmt(a)} vs other cube) ${rejected ? "rejects -> NO" : "passes"}`,
    );
    if (rejected) return false;
  }

  if (axial.node === -1) {
    // :517-559 we are solid
    if (other.node === -1) {
      trace?.push(`${pad}both solid -> YES (:518-525)`);
      return true;
    }
    const nearest =
      (p[0] > 0 ? 0 : 4) | (p[1] > 0 ? 0 : 2) | (p[2] > 0 ? 0 : 1);
    trace?.push(
      `${pad}axial solid: decompose other (:533-559), nearest ${nearest}`,
    );
    const nextRadius = 0.5 * otherRadius;
    for (let i = 0; i < 8; i += 1) {
      const oct = nearest ^ (CHANGE_OCT[i] ?? 0);
      const child = childOf(other.node, oct);
      if (child === 0) continue;
      const voff = resolveVectorInIJK(
        offsetForOctant(oct, otherRadius),
        otherIjk,
      );
      const next: Vec3 = [p[0] - voff[0], p[1] - voff[1], p[2] - voff[2]];
      trace?.push(`${pad}- other octant ${oct}`);
      if (
        isHitByOctree(
          axial,
          { node: child, radius: nextRadius },
          next,
          otherIjk,
          trace,
          depth + 1,
        )
      ) {
        return true;
      }
    }
    trace?.push(`${pad}no other octant hits -> NO`);
    return false;
  }

  // :560-594 we are not solid: decompose the axial tree
  const nearest = (p[0] > 0 ? 4 : 0) | (p[1] > 0 ? 2 : 0) | (p[2] > 0 ? 1 : 0);
  trace?.push(
    `${pad}axial inner: decompose axial (:568-594), nearest ${nearest}`,
  );
  const nextRadius = 0.5 * axialRadius;
  for (let i = 0; i < 8; i += 1) {
    const oct = nearest ^ (CHANGE_OCT[i] ?? 0);
    const child = childOf(axial.node, oct);
    if (child === 0) continue;
    const off = offsetForOctant(oct, axialRadius);
    const next: Vec3 = [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
    trace?.push(`${pad}- axial octant ${oct}`);
    if (
      isHitByOctree(
        { node: child, radius: nextRadius },
        other,
        next,
        otherIjk,
        trace,
        depth + 1,
      )
    ) {
      return true;
    }
  }
  trace?.push(`${pad}no axial octant hits -> NO`);
  return false;
}

/**
 * `[prime isHitByOctree:other withOrigin:origin andIJK:ijk]`
 * (`Octree.m:597-607`): the prime is always the axial tree.
 */
export function isHitByOctreeReference(
  prime: OctreeData,
  other: OctreeData,
  origin: Vec3,
  ijk: Ijk,
  trace?: OctreeTrace,
): boolean {
  return isHitByOctree(
    { node: prime.root, radius: prime.radius },
    { node: other.root, radius: other.radius },
    origin,
    ijk,
    trace,
    0,
  );
}

// ---------------------------------------------------------------------------
// doOctreesCollide

/** A subentity: an octree at an authored offset, identity orientation. */
export interface SubentityHull {
  readonly octree: OctreeData;
  readonly offset: Vec3;
  readonly subentities?: readonly SubentityHull[];
}

/** A top-level hull: world position and axes (`ijk.v[a]` = axis a in world). */
export interface HullPose {
  readonly octree: OctreeData;
  readonly position: Vec3;
  readonly ijk: Ijk;
  readonly subentities: readonly SubentityHull[];
}

interface Resolved {
  readonly octree: OctreeData;
  readonly position: Vec3;
  readonly ijk: Ijk;
  readonly subentities: readonly Resolved[];
}

/**
 * `absolutePositionForSubentity` (`Entity.m:632-646`: the offset times the
 * parent's rotation, plus the parent's position; a row vector times a matrix
 * whose rows are the parent's axes) and `absoluteIJKForSubentity`
 * (`ShipEntity.m:2008-2025`: identity orientation keeps the parent's axes).
 */
function resolveSub(parent: Resolved, sub: SubentityHull): Resolved {
  const o = sub.offset;
  const [i, j, k] = parent.ijk;
  const position: Vec3 = [
    parent.position[0] + o[0] * i[0] + o[1] * j[0] + o[2] * k[0],
    parent.position[1] + o[0] * i[1] + o[1] * j[1] + o[2] * k[1],
    parent.position[2] + o[0] * i[2] + o[1] * j[2] + o[2] * k[2],
  ];
  const resolved: Resolved = {
    octree: sub.octree,
    position,
    ijk: parent.ijk,
    subentities: [],
  };
  return {
    ...resolved,
    subentities: (sub.subentities ?? []).map((child) =>
      resolveSub(resolved, child),
    ),
  };
}

function resolveHull(hull: HullPose): Resolved {
  const top: Resolved = {
    octree: hull.octree,
    position: hull.position,
    ijk: hull.ijk,
    subentities: [],
  };
  return {
    ...top,
    subentities: hull.subentities.map((sub) => resolveSub(top, sub)),
  };
}

/** The other hull, or `otherSubentity` with its index in the other's list. */
export type CollideResult =
  "none" | "other" | { readonly otherSubentity: number };

/** `doOctreesCollide` (`ShipEntity.m:1878-1942`): non-nil result as a tag. */
function doOctreesCollide(
  prime: Resolved,
  other: Resolved,
): "nil" | "other" | number {
  // :1884-1894 relative position and ijk of the other in prime's frame
  const between: Vec3 = [
    other.position[0] - prime.position[0],
    other.position[1] - prime.position[1],
    other.position[2] - prime.position[2],
  ];
  const origin = resolveVectorInIJK(between, prime.ijk);
  const ijk: Ijk = [
    resolveVectorInIJK(other.ijk[0], prime.ijk),
    resolveVectorInIJK(other.ijk[1], prime.ijk),
    resolveVectorInIJK(other.ijk[2], prime.ijk),
  ];
  // :1896-1901 hull against hull
  if (isHitByOctreeReference(prime.octree, other.octree, origin, ijk))
    return "other";
  // :1903-1912 prime subentities against the whole other, by recursion
  for (const sub of prime.subentities) {
    if (doOctreesCollide(sub, other) !== "nil") return "other";
  }
  // :1914-1923 prime against the other's subentities
  for (const [index, sub] of other.subentities.entries()) {
    if (doOctreesCollide(prime, sub) !== "nil") return index;
  }
  // :1925-1938 prime subentities against the other's subentities
  if (prime.subentities.length > 0 && other.subentities.length > 0) {
    for (const [index, oe] of other.subentities.entries()) {
      for (const pe of prime.subentities) {
        if (doOctreesCollide(pe, oe) !== "nil") return index;
      }
    }
  }
  return "nil";
}

/**
 * `doOctreesCollide(prime, other)` for two top-level hulls. Every subentity
 * is a ship that `canCollide` (`ShipEntity.m:1858-1876`); the fixtures author
 * no flasher, dead or wreck subentity.
 */
export function doOctreesCollideReference(
  prime: HullPose,
  other: HullPose,
): CollideResult {
  const result = doOctreesCollide(resolveHull(prime), resolveHull(other));
  if (result === "nil") return "none";
  if (result === "other") return "other";
  return { otherSubentity: result };
}

// ---------------------------------------------------------------------------
// brute force (soundness and completeness only)

interface Leaf {
  readonly centre: Vec3;
  readonly half: number;
}

/** Every solid node of a tree as a cube in the tree's own frame. */
export function solidLeaves(tree: OctreeData): Leaf[] {
  const leaves: Leaf[] = [];
  const walk = (node: OctNode, centre: Vec3, half: number): void => {
    if (node === 0) return;
    if (node === -1) {
      leaves.push({ centre, half });
      return;
    }
    const q = half / 2;
    for (let oct = 0; oct < 8; oct += 1) {
      walk(
        childOf(node, oct),
        [
          centre[0] + ((oct >> 2) & 1 ? q : -q),
          centre[1] + ((oct >> 1) & 1 ? q : -q),
          centre[2] + (oct & 1 ? q : -q),
        ],
        q,
      );
    }
  };
  walk(tree.root, [0, 0, 0], tree.radius);
  return leaves;
}

/**
 * The separating-axis depth of two cubes: positive is the overlap along the
 * axis of least overlap, zero touching, negative a gap (a lower bound of the
 * distance). `a` is axis-aligned; `b` has axes `axes` and centre `c`.
 */
function satDepth(a: Leaf, b: Leaf, c: Vec3, axes: Ijk): number {
  const t: Vec3 = [c[0] - a.centre[0], c[1] - a.centre[1], c[2] - a.centre[2]];
  const units: Ijk = IDENTITY_IJK;
  const candidates: Vec3[] = [...units, ...axes];
  for (const u of units) {
    for (const v of axes) {
      candidates.push([
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ]);
    }
  }
  let depth = Infinity;
  for (const raw of candidates) {
    const n = Math.sqrt(dot(raw, raw));
    if (n < 1e-9) continue;
    const l: Vec3 = [raw[0] / n, raw[1] / n, raw[2] / n];
    const ra = a.half * (Math.abs(l[0]) + Math.abs(l[1]) + Math.abs(l[2]));
    const rb =
      b.half *
      (Math.abs(dot(l, axes[0])) +
        Math.abs(dot(l, axes[1])) +
        Math.abs(dot(l, axes[2])));
    depth = Math.min(depth, ra + rb - Math.abs(dot(t, l)));
  }
  return depth;
}

export interface BruteForce {
  /** Some pair of solid cells overlaps or touches. */
  readonly overlap: boolean;
  /** The deepest pair's separating-axis depth (negative: every pair apart). */
  readonly depth: number;
}

/**
 * Every solid cell of `prime` against every solid cell of `other` as oriented
 * cubes, with the other placed geometrically: centre `origin + B c`, axes the
 * columns of `B` (`ijk`).
 */
export function bruteForceOverlap(
  prime: OctreeData,
  other: OctreeData,
  origin: Vec3,
  ijk: Ijk,
): BruteForce {
  const a = solidLeaves(prime);
  const b = solidLeaves(other);
  let best = -Infinity;
  for (const leafB of b) {
    const c = leafB.centre;
    const centre: Vec3 = [
      origin[0] + c[0] * ijk[0][0] + c[1] * ijk[1][0] + c[2] * ijk[2][0],
      origin[1] + c[0] * ijk[0][1] + c[1] * ijk[1][1] + c[2] * ijk[2][1],
      origin[2] + c[0] * ijk[0][2] + c[1] * ijk[1][2] + c[2] * ijk[2][2],
    ];
    for (const leafA of a)
      best = Math.max(best, satDepth(leafA, leafB, centre, ijk));
  }
  return { overlap: best >= 0, depth: best };
}
