// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Exact ray-against-mesh geometry for the dock-mouth oracle (Phase 18, plan
 * 18-02): Moller-Trumbore in float64 over every triangle of a mesh shifted by
 * its part's authored position, plus the line-to-triangle clearance the
 * fixtures use to prove a ray misses a part by a margin.
 *
 * Independence: imports only this tree's `dat.ts` types.
 */

import type { Triangle, Vec3 } from "./dat.js";

export interface Ray {
  /** Start point, Oolite model axes, metres. */
  readonly start: Vec3;
  /** Unit direction. */
  readonly direction: Vec3;
}

export interface RayMeshHit {
  /** Distance from the ray start to the nearest surface point hit. */
  readonly distance: number;
  /** Index of the struck triangle in the mesh. */
  readonly triangle: number;
  /** Angle between the ray and the struck triangle's plane, degrees. */
  readonly incidenceDeg: number;
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

/**
 * Moller-Trumbore: the distance along `ray` to `triangle` (shifted by
 * `offset`), or null on a miss. Both faces count (the octree converter keeps
 * every triangle whatever its winding); a hit exactly at the start (t = 0) or
 * behind it does not count.
 */
export function rayTriangleDistance(
  ray: Ray,
  triangle: Triangle,
  offset: Vec3,
): number | null {
  const v0 = add(triangle[0], offset);
  const e1 = sub(add(triangle[1], offset), v0);
  const e2 = sub(add(triangle[2], offset), v0);
  const p = cross(ray.direction, e2);
  const det = dot(e1, p);
  if (det === 0) return null;
  const inv = 1 / det;
  const s = sub(ray.start, v0);
  const u = dot(s, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1);
  const v = dot(ray.direction, q) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, q) * inv;
  return t > 0 ? t : null;
}

/** The angle between `direction` and the plane of `triangle`, degrees. */
export function incidenceDeg(direction: Vec3, triangle: Triangle): number {
  const normal = cross(
    sub(triangle[1], triangle[0]),
    sub(triangle[2], triangle[0]),
  );
  const n = length(normal);
  const sine = Math.abs(dot(direction, normal)) / (n * length(direction));
  return (Math.asin(Math.min(1, sine)) * 180) / Math.PI;
}

/** The nearest hit of `ray` on the mesh shifted by `offset`, or null. */
export function rayMeshHit(
  ray: Ray,
  triangles: readonly Triangle[],
  offset: Vec3,
): RayMeshHit | null {
  let best: RayMeshHit | null = null;
  triangles.forEach((triangle, index) => {
    const t = rayTriangleDistance(ray, triangle, offset);
    if (t !== null && (best === null || t < best.distance)) {
      best = {
        distance: t,
        triangle: index,
        incidenceDeg: incidenceDeg(ray.direction, triangle),
      };
    }
  });
  return best;
}

/** The exact distance to the nearest hit, Infinity on a miss. */
export function rayMeshDistance(
  ray: Ray,
  triangles: readonly Triangle[],
  offset: Vec3,
): number {
  return rayMeshHit(ray, triangles, offset)?.distance ?? Infinity;
}

function pointSegment2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

/**
 * The distance from the infinite line through `ray` to `triangle` (shifted by
 * `offset`). Projecting along the line direction onto the plane through the
 * start reduces it to a 2D point-to-triangle distance, which is exact for the
 * line and a lower bound for the ray, so it is the conservative figure for a
 * clearance. Zero when the line crosses the triangle.
 */
export function lineTriangleClearance(
  ray: Ray,
  triangle: Triangle,
  offset: Vec3,
): number {
  const d = ray.direction;
  // An orthonormal basis (a, b) of the plane perpendicular to d.
  const helper: Vec3 = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a0 = cross(d, helper);
  const a = scale(a0, 1 / length(a0));
  const b = cross(d, a);
  const pts = triangle.map((corner) => {
    const rel = sub(add(corner, offset), ray.start);
    return [dot(rel, a), dot(rel, b)] as const;
  });
  const [p0, p1, p2] = pts as unknown as readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  // Inside test by signed areas (the origin is the projected line).
  const area = (
    u: readonly [number, number],
    v: readonly [number, number],
  ): number => u[0] * v[1] - u[1] * v[0];
  const s0 = area(p0, p1);
  const s1 = area(p1, p2);
  const s2 = area(p2, p0);
  const hasNeg = s0 < 0 || s1 < 0 || s2 < 0;
  const hasPos = s0 > 0 || s1 > 0 || s2 > 0;
  if (!(hasNeg && hasPos)) return 0;
  return Math.min(
    pointSegment2(0, 0, p0[0], p0[1], p1[0], p1[1]),
    pointSegment2(0, 0, p1[0], p1[1], p2[0], p2[1]),
    pointSegment2(0, 0, p2[0], p2[1], p0[0], p0[1]),
  );
}

/** The smallest line clearance over a whole mesh shifted by `offset`. */
export function lineMeshClearance(
  ray: Ray,
  triangles: readonly Triangle[],
  offset: Vec3,
): number {
  let best = Infinity;
  for (const triangle of triangles) {
    best = Math.min(best, lineTriangleClearance(ray, triangle, offset));
    if (best === 0) break;
  }
  return best;
}
