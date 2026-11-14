// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Hull octree construction and volume (DATA-11, D-01, D-05, T-10-01 to T-10-03).
 *
 * A build-time port of the construction and volume parts only of Oolite's
 * `OOMeshToOctreeConverter.m`, `Octree.m` and the depth rule of `OOMesh.m`.
 * Runtime ray and hull queries (DATA-16) are not built. No module under `src/`
 * imports this file, and no octree is ever serialised: the only thing the
 * content build keeps is the mass computed from the volume.
 *
 * Every arithmetic result is rounded with `Math.fround`, because Oolite computes
 * in float32 (`OOScalar` and `GLfloat`). Octree occupancy depends on zero-area
 * slivers that the plane-split tables produce, so a different clipper, or float64
 * arithmetic, would change which cells are non-empty and so change the mass by
 * whole cells. The plane-split tables are therefore ported line by line,
 * including the y-plane quirk (`OOMeshToOctreeConverter.m:577-584`).
 *
 * The input meshes are only read: `generate.ts` shares one parsed mesh with
 * `glb.ts`, whose `repairWinding` mutates faces in place, so this module never
 * writes into a mesh or its faces.
 */

import { contentError } from "../content-error.js";
import type { Vec3 } from "./dat.js";

/** `kBaseOctreeDepth` (`OOMesh.m:65`): the depth of a mid-sized hull. */
export const OCTREE_BASE_DEPTH = 5;

/** `kSmallOctreeDepth` (`OOMesh.m:66`): the depth below the small threshold. */
export const OCTREE_SMALL_DEPTH = 4;

/** `kOctreeSizeThreshold` (`OOMesh.m:69`): the first size that earns a deeper tree. */
export const OCTREE_SIZE_THRESHOLD = 900;

/** `kOctreeSmallSizeThreshold` (`OOMesh.m:70`): below this size the depth is small. */
export const OCTREE_SMALL_SIZE_THRESHOLD = 20;

/** `kMaxOctreeDepth` (`Octree.h:81-83`): the adaptive depth never exceeds this. */
export const OCTREE_MAX_DEPTH = 7;

/** `OCTREE_MIN_HALF_WIDTH` (`Octree.h:31`): a node this small is a solid leaf. */
export const OCTREE_MIN_HALF_WIDTH = 1;

/**
 * The half metre the root cube is padded out from the geometry
 * (`OOMeshToOctreeConverter.m:263`).
 */
export const OCTREE_ROOT_PADDING = 0.5;

/**
 * The volume is summed to five levels whatever depth the tree was built to
 * (`Octree.m:669-681`). The source comment gives the reason: "For backwards
 * compatibility, limit octree iteration for volume calculation to five levels.
 * Raising the limit means lower calculated volumes for large ships."
 */
export const VOLUME_DEPTH_LIMIT = 5;

const fround = Math.fround;

/**
 * The structural subset of `ParsedMesh` the octree reads, so a parsed mesh is
 * accepted directly and tests can build synthetic meshes.
 */
export interface OctreeMesh {
  readonly vertices: readonly Vec3[];
  readonly faces: readonly {
    readonly vertices: readonly [number, number, number];
  }[];
}

/**
 * The node encoding of `Octree.m:640-645`: `0` is empty, `-1` is solid, and
 * anything else is exactly eight children in index order `x * 4 + y * 2 + z`
 * (the plus side of an axis being 1).
 */
export type OctreeNode = 0 | -1 | readonly OctreeNode[];

export interface Octree {
  /** The root half-width: the cube is centred on the model origin. */
  readonly radius: number;
  /** The depth the tree was built to (the adaptive rule), not the volume limit. */
  readonly depth: number;
  readonly root: OctreeNode;
}

/** One triangle: nine float32 values, v0 xyz then v1 xyz then v2 xyz. */
type Tri = number[];

/** A triangle corner: three float32 values. */
type Corner = readonly [number, number, number];

/** The three axes in the order the split passes use them. */
type Axis = 0 | 1 | 2;

function meshFailure(file: string, construct: string, detail: string): Error {
  return contentError("DAT_MESH", file, construct, { excerpt: detail });
}

/**
 * The triangles the converter keeps: one per face, vertices rounded to float32
 * (`OOMesh.m:1225`), degenerate triangles dropped (`OOTriangle.h:67-70`,
 * `OOMeshToOctreeConverter.m:253-258`). Each result is a fresh array.
 */
function extractTriangles(mesh: OctreeMesh, file: string): Tri[] {
  const triangles: Tri[] = [];
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex++) {
    const face = mesh.faces[faceIndex];
    if (face === undefined) continue;
    const tri: Tri = [];
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = face.vertices[corner];
      const vertex =
        vertexIndex === undefined ? undefined : mesh.vertices[vertexIndex];
      if (vertex === undefined) {
        throw meshFailure(
          file,
          "octree",
          `face ${String(faceIndex)} corner ${String(corner)} names vertex ${String(vertexIndex)}, which the mesh does not have`,
        );
      }
      const x = fround(vertex.x);
      const y = fround(vertex.y);
      const z = fround(vertex.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw meshFailure(
          file,
          "octree",
          `face ${String(faceIndex)} uses vertex ${String(vertexIndex)} with a coordinate that is not a finite float32`,
        );
      }
      tri.push(x, y, z);
    }
    if (!isDegenerate(tri)) triangles.push(tri);
  }
  if (triangles.length === 0) {
    throw meshFailure(
      file,
      "octree",
      `the mesh has no non-degenerate triangle (${String(mesh.faces.length)} faces)`,
    );
  }
  return triangles;
}

function sameCorner(tri: Tri, a: number, b: number): boolean {
  return (
    tri[a * 3] === tri[b * 3] &&
    tri[a * 3 + 1] === tri[b * 3 + 1] &&
    tri[a * 3 + 2] === tri[b * 3 + 2]
  );
}

/** `OOTriangleIsDegenerate`: any two of the three corners exactly equal. */
function isDegenerate(tri: Tri): boolean {
  return (
    sameCorner(tri, 0, 1) || sameCorner(tri, 1, 2) || sameCorner(tri, 2, 0)
  );
}

/**
 * The adaptive octree depth (`OOMesh.m:591-623`): the mean of the two largest
 * bounding-box spans over **every** vertex, referenced or not, picks the depth.
 * A size under {@link OCTREE_SMALL_SIZE_THRESHOLD} is the small depth; otherwise
 * the depth starts at {@link OCTREE_BASE_DEPTH} and rises by one for each
 * doubling of {@link OCTREE_SIZE_THRESHOLD}, up to {@link OCTREE_MAX_DEPTH}.
 *
 * `file` only names the mesh in a `DAT_MESH` failure (an empty or non-finite
 * vertex list), which Oolite itself would turn into a NaN depth.
 */
export function octreeDepthFor(mesh: OctreeMesh, file = "mesh"): number {
  const first = mesh.vertices[0];
  if (first === undefined) {
    throw meshFailure(file, "octree", "the mesh has no vertices");
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < mesh.vertices.length; index++) {
    const vertex = mesh.vertices[index];
    if (vertex === undefined) continue;
    const x = fround(vertex.x);
    const y = fround(vertex.y);
    const z = fround(vertex.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw meshFailure(
        file,
        "octree",
        `vertex ${String(index)} has a coordinate that is not a finite float32`,
      );
    }
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  let xs = fround(maxX - minX);
  let ys = fround(maxY - minY);
  let zs = fround(maxZ - minZ);
  // Shuffle the spans so zs is the smallest (OOMesh.m:597-608). Only xs and ys
  // are read afterwards, so the last swap keeps just the value that lands in ys.
  if (xs < zs) {
    const t = zs;
    zs = xs;
    xs = t;
  }
  if (ys < zs) ys = zs;
  const size = fround(fround(xs + ys) / 2);
  if (!Number.isFinite(size)) {
    throw meshFailure(file, "octree", "the mesh size is not a finite float32");
  }
  if (size < OCTREE_SMALL_SIZE_THRESHOLD) return OCTREE_SMALL_DEPTH;
  let threshold = OCTREE_SIZE_THRESHOLD;
  let result = OCTREE_BASE_DEPTH;
  while (result < OCTREE_MAX_DEPTH) {
    if (size < threshold) break;
    threshold = fround(threshold * 2);
    result++;
  }
  return result;
}

/** A fresh triangle from three corners (pieces never share their storage). */
function make(a: Corner, b: Corner, c: Corner): Tri {
  return [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]];
}

function corner(tri: Tri, index: number): Corner {
  return [
    tri[index * 3] ?? 0,
    tri[index * 3 + 1] ?? 0,
    tri[index * 3 + 2] ?? 0,
  ];
}

/**
 * The point on the plane where the edge a to b crosses it:
 * `i * (b - a) + a` on each other axis and 0 on the split axis
 * (`OOMeshToOctreeConverter.m:491-493`, `602-604`, `712-714`).
 */
function crossing(axis: Axis, i: number, a: Corner, b: Corner): Corner {
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    if (k === axis) continue;
    out[k] = fround(
      fround(i * fround(b[k as Axis] - a[k as Axis])) + a[k as Axis],
    );
  }
  return out;
}

/** The intersection ratio of one edge, or -1 for an edge parallel to the plane. */
function ratio(s0: number, s1: number): number {
  return s0 === s1 ? -1 : fround(s0 / fround(s0 - s1));
}

/**
 * `SplitGeometryX` / `Y` / `Z` (`OOMeshToOctreeConverter.m:456-563`, `565-674`,
 * `676-784`): cut a triangle set by the plane at zero on one axis, then move the
 * plus pieces by `-sub` and the minus pieces by `+sub` on that axis
 * (`TranslateGeometry*`, lines 414-454). Returns `[plus, minus]`.
 *
 * Only the y pass tests "all non-positive" with a second, independent `if`
 * (lines 577-584), so a triangle lying in y = 0 goes into both halves; x and z
 * use `else if` (lines 468-474, 688-694). Pieces are not filtered for
 * degeneracy.
 */
function split(
  triangles: readonly Tri[],
  axis: Axis,
  sub: number,
): [Tri[], Tri[]] {
  const plus: Tri[] = [];
  const minus: Tri[] = [];
  const addPlus = (a: Corner, b: Corner, c: Corner): void => {
    plus.push(make(a, b, c));
  };
  const addMinus = (a: Corner, b: Corner, c: Corner): void => {
    minus.push(make(a, b, c));
  };
  for (const tri of triangles) {
    const v0 = corner(tri, 0);
    const v1 = corner(tri, 1);
    const v2 = corner(tri, 2);
    const s0 = v0[axis];
    const s1 = v1[axis];
    const s2 = v2[axis];
    let done = false;
    if (s0 >= 0 && s1 >= 0 && s2 >= 0) {
      plus.push(tri.slice());
      done = true;
      if (axis === 1 && s0 <= 0 && s1 <= 0 && s2 <= 0) {
        minus.push(tri.slice());
      }
    } else if (s0 <= 0 && s1 <= 0 && s2 <= 0) {
      minus.push(tri.slice());
      done = true;
    }
    if (done) continue;

    // The triangle must cross the plane.
    const i01 = ratio(s0, s1);
    const i12 = ratio(s1, s2);
    const i20 = ratio(s2, s0);
    const v01 = crossing(axis, i01, v0, v1);
    const v12 = crossing(axis, i12, v1, v2);
    const v20 = crossing(axis, i20, v2, v0);

    // Cases where a vertex is on the split.
    if (s0 === 0) {
      if (s1 > 0) {
        addPlus(v0, v1, v12);
        addMinus(v0, v12, v2);
      } else {
        addMinus(v0, v1, v12);
        addPlus(v0, v12, v2);
      }
    }
    if (s1 === 0) {
      if (s2 > 0) {
        addPlus(v1, v2, v20);
        addMinus(v1, v20, v0);
      } else {
        addMinus(v1, v2, v20);
        addPlus(v1, v20, v0);
      }
    }
    if (s2 === 0) {
      if (s0 > 0) {
        addPlus(v2, v0, v01);
        addMinus(v2, v01, v1);
      } else {
        addMinus(v2, v0, v01);
        addPlus(v2, v01, v1);
      }
    }

    // The six strict-sign cases.
    if (s0 > 0 && s1 > 0 && s2 < 0) {
      addPlus(v0, v12, v20);
      addPlus(v0, v1, v12);
      addMinus(v20, v12, v2);
    }
    if (s0 > 0 && s1 < 0 && s2 > 0) {
      addPlus(v2, v01, v12);
      addPlus(v2, v0, v01);
      addMinus(v12, v01, v1);
    }
    if (s0 > 0 && s1 < 0 && s2 < 0) {
      addPlus(v20, v0, v01);
      addMinus(v2, v20, v1);
      addMinus(v20, v01, v1);
    }
    if (s0 < 0 && s1 > 0 && s2 > 0) {
      addMinus(v01, v20, v0);
      addPlus(v1, v20, v01);
      addPlus(v1, v2, v20);
    }
    if (s0 < 0 && s1 > 0 && s2 < 0) {
      addPlus(v01, v1, v12);
      addMinus(v0, v01, v2);
      addMinus(v01, v12, v2);
    }
    if (s0 < 0 && s1 < 0 && s2 > 0) {
      addPlus(v12, v2, v20);
      addMinus(v1, v12, v0);
      addMinus(v12, v20, v0);
    }
  }
  const down = fround(-sub);
  for (const tri of plus) {
    for (let k = 0; k < 3; k++) {
      tri[k * 3 + axis] = fround((tri[k * 3 + axis] ?? 0) + down);
    }
  }
  for (const tri of minus) {
    for (let k = 0; k < 3; k++) {
      tri[k * 3 + axis] = fround((tri[k * 3 + axis] ?? 0) + sub);
    }
  }
  return [plus, minus];
}

/**
 * `BuildSubOctree` (`OOMeshToOctreeConverter.m:289-412`) with the fold of
 * `endInnerNode` (`Octree.m:851-878`).
 */
function buildNode(
  triangles: readonly Tri[],
  halfWidth: number,
  depth: number,
): OctreeNode {
  if (triangles.length === 0) return 0;
  if (halfWidth <= OCTREE_MIN_HALF_WIDTH || depth <= 0) return -1;

  const sub = fround(0.5 * halfWidth);
  // Children by index x * 4 + y * 2 + z; the plus side of an axis is 1. The
  // split order is z, then y, then x, skipping a split whose input is empty.
  const groups: Tri[][] = [[], [], [], [], [], [], [], []];
  const [xx1, xx0] = split(triangles, 2, sub);
  if (xx0.length !== 0) {
    const [x10, x00] = split(xx0, 1, sub);
    if (x00.length !== 0) {
      const [g100, g000] = split(x00, 0, sub);
      groups[4] = g100;
      groups[0] = g000;
    }
    if (x10.length !== 0) {
      const [g110, g010] = split(x10, 0, sub);
      groups[6] = g110;
      groups[2] = g010;
    }
  }
  if (xx1.length !== 0) {
    const [x11, x01] = split(xx1, 1, sub);
    if (x01.length !== 0) {
      const [g101, g001] = split(x01, 0, sub);
      groups[5] = g101;
      groups[1] = g001;
    }
    if (x11.length !== 0) {
      const [g111, g011] = split(x11, 0, sub);
      groups[7] = g111;
      groups[3] = g011;
    }
  }

  const children = groups.map((group) => buildNode(group, sub, depth - 1));
  if (children.every((child) => child === -1)) return -1;
  return children;
}

/**
 * Build the hull octree the way `OOMesh.m:630-660` and
 * `OOMeshToOctreeConverter.m:260-268` do. The root is a cube centred on the
 * model origin (not the bounding-box centre) whose half-width is
 * {@link OCTREE_ROOT_PADDING} plus the largest absolute coordinate of the kept
 * triangles (`MaxDimensionFromOrigin`, lines 272-287).
 *
 * Throws `DAT_MESH` for a non-finite used coordinate, an out-of-range face
 * index, or a mesh with no non-degenerate triangle.
 */
export function buildOctree(mesh: OctreeMesh, file: string): Octree {
  const triangles = extractTriangles(mesh, file);
  const depth = octreeDepthFor(mesh, file);
  let largest = 0;
  for (const tri of triangles) {
    for (const value of tri) {
      largest = Math.max(largest, Math.abs(value));
    }
  }
  const radius = fround(OCTREE_ROOT_PADDING + largest);
  return { radius, depth, root: buildNode(triangles, radius, depth) };
}

function volumeOf(node: OctreeNode, radius: number, limit: number): number {
  if (node === 0) return 0;
  if (node === -1 || limit === 0) {
    // A solid or limit-reached node is a full cube of half-width `radius`.
    return fround(fround(radius * radius) * radius);
  }
  const next = fround(0.5 * radius);
  let sum = 0;
  for (const child of node) {
    if (child !== 0) sum = fround(sum + volumeOf(child, next, limit - 1));
  }
  return sum;
}

/**
 * `volumeOfOctree` (`Octree.m:634-667`): the float32 sum of the volumes of the
 * terminal nodes. A solid node, or a non-empty node at the depth limit, counts as
 * a full cube of half-width `r`, contributing `r * r * r`. The limit defaults to
 * {@link VOLUME_DEPTH_LIMIT}, which is not the build depth.
 */
export function octreeVolume(
  octree: Octree,
  depthLimit = VOLUME_DEPTH_LIMIT,
): number {
  return volumeOf(octree.root, octree.radius, depthLimit);
}
