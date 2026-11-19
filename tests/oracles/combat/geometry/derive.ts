// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Independent derivation of the dock-mouth and buoy beam answers (Phase 18,
 * plan 18-02): which part of a station or buoy a laser beam stops on, and at
 * what distance.
 *
 * Independence: this module imports only `node:url` and this tree's own
 * files. Its inputs are the vendored meshes (`third_party/oolite/Models/`) and
 * the pinned Oolite source (commit `7437f22`), cited line by line.
 *
 * The rule (`ShipEntity.m:1323-1357`, `doesHitLine:v1:hitEntity:`): the hull's
 * octree is asked first; then each ship subentity in list order
 * (`shipSubEntityEnumerator`, `ShipEntity.m:1219-1222`: ships only, flashers
 * excluded), with the beam moved into the subentity's frame
 * (`absolutePositionForSubentity`, `Entity.m:627-645`;
 * `absoluteIJKForSubentity`, `ShipEntity.m:2008-2025`). A subentity replaces
 * the current answer when `hitSub && (hit_distance == 0 || hit_distance >
 * hitSub)` (`ShipEntity.m:1350`): the nearest non-zero distance wins and an
 * exact tie keeps the earlier answer (the hull, or the earlier subentity).
 * `firstShipHitByLaserFromShip` keeps `hit > 0.0 && hit < nearest`
 * (`Universe.m:5620-5627`). Every subentity of the Coriolis and the buoy has
 * the identity orientation (`shipdata.plist`), so the frame change is a shift
 * by the authored position.
 *
 * Exact answers. `deriveDockMouth` evaluates every part with exact float64
 * ray-triangle geometry (`ray-mesh.ts`) and applies that rule to the exact
 * distances. The octree does not return the exact surface distance: it
 * returns the distance from the line start to the centre of the first solid
 * node it visits (`Octree.m:347-366`, `hit_dist = sqrt(u0 . u0)` with `u0`
 * the line start relative to the node centre). Each fixture therefore carries
 * a tolerance derived up front from the leaf size and the incidence angle
 * ({@link dockTolerance}).
 *
 * Octree size (the depth each tolerance assumes), from the C:
 *
 * - root half-width `0.5 + MaxDimensionFromOrigin` (largest |x|, |y| or |z| of
 *   any non-degenerate triangle vertex; `OOMeshToOctreeConverter.m:260-286`);
 * - depth by `octreeDepth` (`OOMesh.m:590-623`, constants `OOMesh.m:65-71`,
 *   `kMaxOctreeDepth = 7` at `Octree.h:82`): `size` is the mean of the two
 *   largest bounding-box dimensions; under 20 m depth 4; else depth 5, plus
 *   one for each doubling of `size` from 900 m, at most 7;
 * - a node with geometry becomes a solid leaf when its half-width is at most
 *   `OCTREE_MIN_HALF_WIDTH` 1.0 or the depth is spent
 *   (`OOMeshToOctreeConverter.m:289-305`, `Octree.h:31`); the leaf half-width
 *   `h` is the root half-width halved `depth` times unless the 1.0 floor
 *   stops it first;
 * - eight solid children fold into one solid node (`Octree.m:851-877`).
 *
 * The octree model below ({@link octreeLineDistance}) rebuilds that octree
 * lazily from the mesh (a node holds geometry when a triangle touches its
 * closed cube, the converter's clip-and-split, `OOMeshToOctreeConverter.m:
 * 289-412`) and runs a float64 transliteration of `isHitByLine`
 * (`Octree.m:336-471`, `OOVoxel.m:29-197`). It exists only to screen the
 * fixtures: a candidate whose octree answer falls outside its tolerance, or
 * whose octree winner differs from the exact winner, is dropped.
 */

import type { Triangle, Vec3 } from "./dat.js";
import { readDat } from "./dat.js";
import {
  add,
  incidenceDeg,
  lineMeshClearance,
  rayMeshHit,
  scale,
  sub,
  type Ray,
} from "./ray-mesh.js";

// ---------------------------------------------------------------------------
// meshes

/** The six vendored models this oracle reads. */
export const DOCK_MESH_FILES = [
  "oolite_coriolis.dat",
  "oolite_coriolis_faceplate.dat",
  "oolite_coriolis_tris.dat",
  "oolite_coriolis_dock.dat",
  "oolite_buoy.dat",
  "oolite_buoy_subents.dat",
] as const;
export type DockMesh = (typeof DOCK_MESH_FILES)[number];

const MODEL_DIR = new URL(
  "../../../../third_party/oolite/Models/",
  import.meta.url,
);

const meshCache = new Map<DockMesh, readonly Triangle[]>();

/** The triangles of one vendored model (cached). */
export function modelTriangles(model: DockMesh): readonly Triangle[] {
  const cached = meshCache.get(model);
  if (cached !== undefined) return cached;
  const triangles = readDat(new URL(model, MODEL_DIR)).triangles;
  meshCache.set(model, triangles);
  return triangles;
}

// ---------------------------------------------------------------------------
// octree size (the C's rules)

/** `OCTREE_MIN_HALF_WIDTH` (`Octree.h:31`). */
export const OCTREE_MIN_HALF_WIDTH = 1.0;

export interface OctreeSize {
  /** Root half-width: `0.5 + MaxDimensionFromOrigin`. */
  readonly rootHalfWidth: number;
  /** `octreeDepth` of the mesh. */
  readonly depth: number;
  /** The half-width of a leaf: where `BuildSubOctree` writes a solid. */
  readonly leafHalfWidth: number;
  /** Levels actually descended (depth, or fewer if the 1.0 floor stops it). */
  readonly levels: number;
}

/** `octreeDepth` (`OOMesh.m:590-623`) from the bounding-box dimensions. */
export function octreeDepthForSize(dims: Vec3): number {
  const sorted = [...dims].sort((a, b) => b - a);
  const size = ((sorted[0] ?? 0) + (sorted[1] ?? 0)) / 2;
  if (size < 20) return 4; // kOctreeSmallSizeThreshold, kSmallOctreeDepth
  let result = 5; // kBaseOctreeDepth
  let threshold = 900; // kOctreeSizeThreshold
  while (result < 7) {
    // kMaxOctreeDepth
    if (size < threshold) break;
    threshold *= 2;
    result += 1;
  }
  return result;
}

/** The octree size the C builds for a mesh. */
export function octreeSize(triangles: readonly Triangle[]): OctreeSize {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let maxAbs = 0;
  for (const triangle of triangles) {
    for (const v of triangle) {
      for (let axis = 0; axis < 3; axis += 1) {
        const c = v[axis] ?? 0;
        lo[axis] = Math.min(lo[axis] ?? 0, c);
        hi[axis] = Math.max(hi[axis] ?? 0, c);
        maxAbs = Math.max(maxAbs, Math.abs(c));
      }
    }
  }
  const depth = octreeDepthForSize([
    hi[0] - lo[0],
    hi[1] - lo[1],
    hi[2] - lo[2],
  ]);
  const rootHalfWidth = 0.5 + maxAbs;
  let half = rootHalfWidth;
  let levels = 0;
  while (half > OCTREE_MIN_HALF_WIDTH && levels < depth) {
    half *= 0.5;
    levels += 1;
  }
  return { rootHalfWidth, depth, leafHalfWidth: half, levels };
}

const sizeCache = new Map<DockMesh, OctreeSize>();

export function modelOctreeSize(model: DockMesh): OctreeSize {
  const cached = sizeCache.get(model);
  if (cached !== undefined) return cached;
  const size = octreeSize(modelTriangles(model));
  sizeCache.set(model, size);
  return size;
}

// ---------------------------------------------------------------------------
// the tolerance

/** The steepest-grazing incidence a fixture may use, degrees. */
export const MIN_INCIDENCE_DEG = 30;

/**
 * The distance tolerance of one octree hit, fixed before any port exists:
 * `sqrt(3) h + 2 h / sin(alpha)`. The octree reports the distance to the
 * centre of the first solid leaf it visits; that centre is within `sqrt(3) h`
 * of any point of the leaf, and a leaf is solid when any triangle touches it,
 * so the ray can meet a solid leaf of the struck plane up to `2 h / sin(alpha)`
 * before the exact hit (alpha: the angle between ray and plane).
 */
export function dockTolerance(
  leafHalfWidth: number,
  incidence: number,
): number {
  const alpha = (incidence * Math.PI) / 180;
  return Math.sqrt(3) * leafHalfWidth + (2 * leafHalfWidth) / Math.sin(alpha);
}

/** The clearance a part a ray must miss needs: one leaf diagonal. */
export function dockClearance(leafHalfWidth: number): number {
  return 2 * Math.sqrt(3) * leafHalfWidth;
}

// ---------------------------------------------------------------------------
// the rule

export interface DockPartInput {
  readonly name: string;
  readonly mesh: DockMesh;
  /** The authored position in the parent's model axes (identity orientation). */
  readonly position: Vec3;
}

export interface DockInput {
  /** Hull first, then the ship subentities in shipdata list order. */
  readonly parts: readonly DockPartInput[];
  readonly ray: Ray;
}

export interface PartAnswer {
  readonly name: string;
  /** Exact distance, Infinity on a miss. */
  readonly distance: number;
  /** Incidence of the struck triangle, null on a miss. */
  readonly incidenceDeg: number | null;
  /** The line clearance to every triangle (0 when the line crosses one). */
  readonly clearance: number;
  readonly leafHalfWidth: number;
  readonly depth: number;
  readonly rootHalfWidth: number;
}

export interface DockAnswer {
  /** The winning part's name, or "none". */
  readonly winner: string;
  readonly distance: number | null;
  readonly incidenceDeg: number | null;
  /** The nearest other part with a hit, or null. */
  readonly runnerUp: string | null;
  readonly runnerUpDistance: number | null;
  readonly runnerUpIncidenceDeg: number | null;
  readonly parts: readonly PartAnswer[];
}

/**
 * `doesHitLine:v1:hitEntity:` (`ShipEntity.m:1323-1357`) on distances `d`
 * (0 = miss): the index of the winning part, or -1.
 */
export function oolitePartRule(distances: readonly number[]): number {
  let hitDistance = distances[0] ?? 0;
  let winner = hitDistance !== 0 ? 0 : -1;
  for (let i = 1; i < distances.length; i += 1) {
    const hitSub = distances[i] ?? 0;
    if (hitSub !== 0 && (hitDistance === 0 || hitDistance > hitSub)) {
      hitDistance = hitSub;
      winner = i;
    }
  }
  return winner;
}

/** The exact answer for one beam. */
export function deriveDockMouth(input: DockInput): DockAnswer {
  const parts: PartAnswer[] = input.parts.map((part) => {
    const triangles = modelTriangles(part.mesh);
    const size = modelOctreeSize(part.mesh);
    const hit = rayMeshHit(input.ray, triangles, part.position);
    return {
      name: part.name,
      distance: hit?.distance ?? Infinity,
      incidenceDeg: hit?.incidenceDeg ?? null,
      clearance:
        hit === null
          ? lineMeshClearance(input.ray, triangles, part.position)
          : 0,
      leafHalfWidth: size.leafHalfWidth,
      depth: size.depth,
      rootHalfWidth: size.rootHalfWidth,
    };
  });
  const winnerIndex = oolitePartRule(
    parts.map((part) => (Number.isFinite(part.distance) ? part.distance : 0)),
  );
  const winner = winnerIndex >= 0 ? parts[winnerIndex] : undefined;
  let runnerUp: PartAnswer | undefined;
  for (const [index, part] of parts.entries()) {
    if (index === winnerIndex || !Number.isFinite(part.distance)) continue;
    if (runnerUp === undefined || part.distance < runnerUp.distance) {
      runnerUp = part;
    }
  }
  return {
    winner: winner?.name ?? "none",
    distance: winner?.distance ?? null,
    incidenceDeg: winner?.incidenceDeg ?? null,
    runnerUp: runnerUp?.name ?? null,
    runnerUpDistance: runnerUp?.distance ?? null,
    runnerUpIncidenceDeg: runnerUp?.incidenceDeg ?? null,
    parts,
  };
}

// ---------------------------------------------------------------------------
// the octree model (screening only)

/** Akenine-Moller triangle-box overlap on a closed axis-aligned cube. */
export function triangleTouchesCube(
  triangle: Triangle,
  centre: Vec3,
  half: number,
): boolean {
  const v0 = sub(triangle[0], centre);
  const v1 = sub(triangle[1], centre);
  const v2 = sub(triangle[2], centre);
  for (let axis = 0; axis < 3; axis += 1) {
    const a = v0[axis] ?? 0;
    const b = v1[axis] ?? 0;
    const c = v2[axis] ?? 0;
    if (Math.min(a, b, c) > half || Math.max(a, b, c) < -half) return false;
  }
  const edges: Vec3[] = [sub(v1, v0), sub(v2, v1), sub(v0, v2)];
  const normal: Vec3 = [
    (edges[0]?.[1] ?? 0) * (edges[1]?.[2] ?? 0) -
      (edges[0]?.[2] ?? 0) * (edges[1]?.[1] ?? 0),
    (edges[0]?.[2] ?? 0) * (edges[1]?.[0] ?? 0) -
      (edges[0]?.[0] ?? 0) * (edges[1]?.[2] ?? 0),
    (edges[0]?.[0] ?? 0) * (edges[1]?.[1] ?? 0) -
      (edges[0]?.[1] ?? 0) * (edges[1]?.[0] ?? 0),
  ];
  const separated = (axis: Vec3): boolean => {
    const p0 = v0[0] * axis[0] + v0[1] * axis[1] + v0[2] * axis[2];
    const p1 = v1[0] * axis[0] + v1[1] * axis[1] + v1[2] * axis[2];
    const p2 = v2[0] * axis[0] + v2[1] * axis[1] + v2[2] * axis[2];
    const r =
      half * (Math.abs(axis[0]) + Math.abs(axis[1]) + Math.abs(axis[2]));
    return Math.min(p0, p1, p2) > r || Math.max(p0, p1, p2) < -r;
  };
  if (separated(normal)) return false;
  const units: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (const unit of units) {
    for (const edge of edges) {
      const axis: Vec3 = [
        unit[1] * edge[2] - unit[2] * edge[1],
        unit[2] * edge[0] - unit[0] * edge[2],
        unit[0] * edge[1] - unit[1] * edge[0],
      ];
      if (axis[0] === 0 && axis[1] === 0 && axis[2] === 0) continue;
      if (separated(axis)) return false;
    }
  }
  return true;
}

const EMPTY = 0;
const SOLID = -1;
const INNER = 1;
type NodeKind = typeof EMPTY | typeof SOLID | typeof INNER;

interface LazyNode {
  readonly centre: Vec3;
  readonly half: number;
  readonly depthLeft: number;
  readonly triangles: readonly Triangle[];
  kind?: NodeKind;
  children?: LazyNode[];
}

/** Child `oct` (`x * 4 + y * 2 + z`, 1 = positive half) of a node. */
function childCentre(centre: Vec3, half: number, oct: number): Vec3 {
  const q = half / 2;
  return [
    centre[0] + ((oct >> 2) & 1 ? q : -q),
    centre[1] + ((oct >> 1) & 1 ? q : -q),
    centre[2] + (oct & 1 ? q : -q),
  ];
}

function makeNode(
  centre: Vec3,
  half: number,
  depthLeft: number,
  parent: readonly Triangle[],
): LazyNode {
  const triangles = parent.filter((t) => triangleTouchesCube(t, centre, half));
  return { centre, half, depthLeft, triangles };
}

function childrenOf(node: LazyNode): LazyNode[] {
  if (node.children === undefined) {
    node.children = [];
    for (let oct = 0; oct < 8; oct += 1) {
      node.children.push(
        makeNode(
          childCentre(node.centre, node.half, oct),
          node.half / 2,
          node.depthLeft - 1,
          node.triangles,
        ),
      );
    }
  }
  return node.children;
}

/** `BuildSubOctree` plus the builder's fold, lazily. */
function kindOf(node: LazyNode): NodeKind {
  if (node.kind !== undefined) return node.kind;
  let kind: NodeKind;
  if (node.triangles.length === 0) kind = EMPTY;
  else if (node.half <= OCTREE_MIN_HALF_WIDTH || node.depthLeft <= 0)
    kind = SOLID;
  else
    kind = childrenOf(node).every((child) => kindOf(child) === SOLID)
      ? SOLID
      : INNER;
  node.kind = kind;
  return kind;
}

const rootCache = new Map<DockMesh, LazyNode>();

function modelRoot(model: DockMesh): LazyNode {
  const cached = rootCache.get(model);
  if (cached !== undefined) return cached;
  const size = modelOctreeSize(model);
  const root = makeNode(
    [0, 0, 0],
    size.rootHalfWidth,
    size.depth,
    modelTriangles(model),
  );
  rootCache.set(model, root);
  return root;
}

// OOVoxel.m:29-196, transliterated in float64.
const FACE_RIGHT = 0x01;
const FACE_LEFT = 0x02;
const FACE_TOP = 0x04;
const FACE_BOTTOM = 0x08;
const FACE_FRONT = 0x10;
const FACE_BACK = 0x20;

function checkFace(p: Vec3, rd: number): number {
  let faces = 0;
  if (p[0] > rd) faces |= FACE_RIGHT;
  if (p[0] < -rd) faces |= FACE_LEFT;
  if (p[1] > rd) faces |= FACE_TOP;
  if (p[1] < -rd) faces |= FACE_BOTTOM;
  if (p[2] > rd) faces |= FACE_FRONT;
  if (p[2] < -rd) faces |= FACE_BACK;
  return faces;
}

function checkBevel(p: Vec3, rd: number): number {
  const r2 = rd * 2;
  const [x, y, z] = p;
  let b = 0;
  if (x + y > r2) b |= 0x001;
  if (x - y > r2) b |= 0x002;
  if (-x + y > r2) b |= 0x004;
  if (-x - y > r2) b |= 0x008;
  if (x + z > r2) b |= 0x010;
  if (x - z > r2) b |= 0x020;
  if (-x + z > r2) b |= 0x040;
  if (-x - z > r2) b |= 0x080;
  if (y + z > r2) b |= 0x100;
  if (y - z > r2) b |= 0x200;
  if (-y + z > r2) b |= 0x400;
  if (-y - z > r2) b |= 0x800;
  return b;
}

function checkCorner(p: Vec3, rd: number): number {
  const r3 = rd * 3;
  const [x, y, z] = p;
  let c = 0;
  if (x + y + z > r3) c |= 0x01;
  if (x + y - z > r3) c |= 0x02;
  if (x - y + z > r3) c |= 0x04;
  if (x - y - z > r3) c |= 0x08;
  if (-x + y + z > r3) c |= 0x10;
  if (-x + y - z > r3) c |= 0x20;
  if (-x - y + z > r3) c |= 0x40;
  if (-x - y - z > r3) c |= 0x80;
  return c;
}

function lineIntersectionWithFace(
  p1: Vec3,
  p2: Vec3,
  mask: number,
  rd: number,
): Vec3 {
  const [x1, y1, z1] = p1;
  const [x2, y2, z2] = p2;
  if (mask & FACE_RIGHT) {
    const t = (rd - x1) / (x2 - x1);
    return [rd, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t];
  }
  if (mask & FACE_LEFT) {
    const t = (-rd - x1) / (x2 - x1);
    return [-rd, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t];
  }
  if (mask & FACE_TOP) {
    const t = (rd - y1) / (y2 - y1);
    return [x1 + (x2 - x1) * t, rd, z1 + (z2 - z1) * t];
  }
  if (mask & FACE_BOTTOM) {
    const t = (-rd - y1) / (y2 - y1);
    return [x1 + (x2 - x1) * t, -rd, z1 + (z2 - z1) * t];
  }
  if (mask & FACE_FRONT) {
    const t = (rd - z1) / (z2 - z1);
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, rd];
  }
  if (mask & FACE_BACK) {
    const t = (-rd - z1) / (z2 - z1);
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, -rd];
  }
  return p1;
}

function checkPoint(
  p1: Vec3,
  p2: Vec3,
  alpha: number,
  mask: number,
  rd: number,
): number {
  return checkFace(add(p1, scale(sub(p2, p1), alpha)), rd) & mask;
}

function checkLine(p1: Vec3, p2: Vec3, mask: number, rd: number): number {
  let result = 0;
  const [x1, y1, z1] = p1;
  const [x2, y2, z2] = p2;
  if (
    mask & FACE_RIGHT &&
    x1 > x2 &&
    checkPoint(p1, p2, (rd - x1) / (x2 - x1), 0x3f - FACE_RIGHT, rd) === 0
  )
    result |= FACE_RIGHT;
  if (
    mask & FACE_LEFT &&
    x1 < x2 &&
    checkPoint(p1, p2, (-rd - x1) / (x2 - x1), 0x3f - FACE_LEFT, rd) === 0
  )
    result |= FACE_LEFT;
  if (
    mask & FACE_TOP &&
    y1 > y2 &&
    checkPoint(p1, p2, (rd - y1) / (y2 - y1), 0x3f - FACE_TOP, rd) === 0
  )
    result |= FACE_TOP;
  if (
    mask & FACE_BOTTOM &&
    y1 < y2 &&
    checkPoint(p1, p2, (-rd - y1) / (y2 - y1), 0x3f - FACE_BOTTOM, rd) === 0
  )
    result |= FACE_BOTTOM;
  if (
    mask & FACE_FRONT &&
    z1 > z2 &&
    checkPoint(p1, p2, (rd - z1) / (z2 - z1), 0x3f - FACE_FRONT, rd) === 0
  )
    result |= FACE_FRONT;
  if (
    mask & FACE_BACK &&
    z1 < z2 &&
    checkPoint(p1, p2, (-rd - z1) / (z2 - z1), 0x3f - FACE_BACK, rd) === 0
  )
    result |= FACE_BACK;
  return result;
}

/** `lineCubeIntersection` (`OOVoxel.m:164-197`): -1 inside, 0 miss, else faces. */
function lineCubeIntersection(v0: Vec3, v1: Vec3, rd: number): number {
  let t0 = checkFace(v0, rd);
  if (t0 === 0) return -1;
  let t1 = checkFace(v1, rd);
  if (t1 === 0) return -1;
  if ((t0 & t1) !== 0) return 0;
  t0 |= checkBevel(v0, rd) << 8;
  t1 |= checkBevel(v1, rd) << 8;
  if ((t0 & t1) !== 0) return 0;
  t0 |= checkCorner(v0, rd) << 24;
  t1 |= checkCorner(v1, rd) << 24;
  if ((t0 & t1) !== 0) return 0;
  return checkLine(v0, v1, t0 | t1, rd);
}

/** `offsetForOctant` (`Octree.m:158-161`). */
function offsetForOctant(oct: number, r: number): Vec3 {
  return [
    (0.5 - ((oct >> 2) & 1)) * r,
    (0.5 - ((oct >> 1) & 1)) * r,
    (0.5 - (oct & 1)) * r,
  ];
}

/** `isHitByLine` (`Octree.m:336-455`); returns the hit distance or null. */
function isHitByLine(
  node: LazyNode,
  rad: number,
  v0: Vec3,
  v1: Vec3,
  off: Vec3,
): number | null {
  const u0 = add(v0, off);
  const u1 = add(v1, off);
  const kind = kindOf(node);
  if (kind === EMPTY) return null;
  if (kind === SOLID)
    return Math.sqrt(u0[0] * u0[0] + u0[1] * u0[1] + u0[2] * u0[2]);
  const faces = lineCubeIntersection(u0, u1, rad);
  if (faces === 0) return null;
  let oct0 = 0;
  if (faces > 0) {
    const vi = lineIntersectionWithFace(u0, u1, faces, rad);
    if (faces & FACE_FRONT) oct0 = (vi[0] < 0 ? 1 : 5) + (vi[1] < 0 ? 0 : 2);
    if (faces & FACE_BACK) oct0 = (vi[0] < 0 ? 0 : 4) + (vi[1] < 0 ? 0 : 2);
    if (faces & FACE_RIGHT) oct0 = (vi[1] < 0 ? 4 : 6) + (vi[2] < 0 ? 0 : 1);
    if (faces & FACE_LEFT) oct0 = (vi[1] < 0 ? 0 : 2) + (vi[2] < 0 ? 0 : 1);
    if (faces & FACE_TOP) oct0 = (vi[0] < 0 ? 2 : 6) + (vi[2] < 0 ? 0 : 1);
    if (faces & FACE_BOTTOM) oct0 = (vi[0] < 0 ? 0 : 4) + (vi[2] < 0 ? 0 : 1);
  }
  const children = childrenOf(node);
  const order = [
    oct0,
    oct0 ^ 1,
    oct0 ^ 2,
    oct0 ^ 4,
    oct0 ^ 1 ^ 7,
    oct0 ^ 2 ^ 7,
    oct0 ^ 4 ^ 7,
    oct0 ^ 7,
  ];
  for (const oct of order) {
    const child = children[oct] as LazyNode;
    if (kindOf(child) === EMPTY) continue;
    const hit = isHitByLine(
      child,
      0.5 * rad,
      u0,
      u1,
      offsetForOctant(oct, rad),
    );
    if (hit !== null) return hit;
  }
  return null;
}

/** The segment length the model casts (any end outside every cube works). */
export const MODEL_SEGMENT = 20000;

/**
 * The octree model's distance for one part: the ray as the segment
 * `start .. start + 20000 direction`, moved into the part's frame.
 */
export function octreeLineDistance(
  ray: Ray,
  part: DockPartInput,
): number | null {
  const root = modelRoot(part.mesh);
  const v0 = sub(ray.start, part.position);
  const v1 = add(v0, scale(ray.direction, MODEL_SEGMENT));
  return isHitByLine(root, root.half, v0, v1, [0, 0, 0]);
}

export interface ModelAnswer {
  readonly winner: string;
  readonly distance: number | null;
  readonly distances: readonly (number | null)[];
}

/** The octree model's answer for one beam, by the same rule. */
export function octreeModelAnswer(input: DockInput): ModelAnswer {
  const distances = input.parts.map((part) =>
    octreeLineDistance(input.ray, part),
  );
  const index = oolitePartRule(distances.map((d) => d ?? 0));
  return {
    winner: index >= 0 ? (input.parts[index]?.name ?? "none") : "none",
    distance: index >= 0 ? (distances[index] ?? null) : null,
    distances,
  };
}

export { incidenceDeg };
