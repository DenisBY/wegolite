// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Pure vector/quaternion helpers for the simulation core. No imports, no DOM,
 * no clock, no randomness.
 *
 * Determinism scope: `axisAngle` uses `Math.sin`/`Math.cos` of the half angle,
 * so replay is bit-identical *within one JS engine only*. The golden fixture is
 * generated and replayed inside the same container; no cross-engine bit-identity
 * is claimed. (ARCHITECTURE.md's "keep transcendentals out of sim/" is a
 * performance note, not a correctness claim about this probe.)
 *
 * `axisAngle` stays general over three axes even though Phase 1 input is pitch
 * and roll only, so v2 can add yaw without re-deriving the integration.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Quat {
  readonly w: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function quat(w: number, x: number, y: number, z: number): Quat {
  return { w, x, y, z };
}

export function identity(): Quat {
  return quat(1, 0, 0, 0);
}

/** Hamilton product `a * b`. */
export function mul(a: Quat, b: Quat): Quat {
  return quat(
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  );
}

export function normalize(q: Quat): Quat {
  const length = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  if (length === 0) return identity();
  return quat(q.w / length, q.x / length, q.y / length, q.z / length);
}

/** Rotate `v` by the unit quaternion `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return vec(
    v.x + q.w * tx + (q.y * tz - q.z * ty),
    v.y + q.w * ty + (q.z * tx - q.x * tz),
    v.z + q.w * tz + (q.x * ty - q.y * tx),
  );
}

/** Unit quaternion for `angle` radians about the axis `(ax, ay, az)`. */
export function axisAngle(
  ax: number,
  ay: number,
  az: number,
  angle: number,
): Quat {
  const half = angle / 2;
  const s = Math.sin(half);
  return quat(Math.cos(half), ax * s, ay * s, az * s);
}
