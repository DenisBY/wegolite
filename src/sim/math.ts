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

/* ------------------------------------------------------------------------- *
 * Vector helpers
 *
 * Phase 3 derives every body position from content values, so the sim needs a
 * small, total vector vocabulary. All helpers are pure and return new objects;
 * `normalize` above stays the *quaternion* normaliser, so the vector version is
 * named `normalizeVec` rather than overloading it.
 * ------------------------------------------------------------------------- */

export function add(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function scale(v: Vec3, factor: number): Vec3 {
  return vec(v.x * factor, v.y * factor, v.z * factor);
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

export function lengthSquared(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function length(v: Vec3): number {
  return Math.sqrt(lengthSquared(v));
}

/**
 * Unit vector. A zero-length input returns the zero vector rather than a NaN
 * triple: the layout asserts finiteness, so a degenerate content record fails
 * loudly instead of poisoning every derived position.
 */
export function normalizeVec(v: Vec3): Vec3 {
  const magnitude = length(v);
  if (magnitude === 0) return vec(0, 0, 0);
  return vec(v.x / magnitude, v.y / magnitude, v.z / magnitude);
}

/** The quaternion rotating unit vector `from` onto unit vector `to`. */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const d = dot(from, to);
  if (d < -0.999999) {
    // Antiparallel: the cross product degenerates, so pick any perpendicular
    // axis and rotate a half turn about it.
    const axis = Math.abs(from.x) < 0.9 ? vec(1, 0, 0) : vec(0, 1, 0);
    const perpendicular = cross(from, axis);
    return normalize(
      quat(0, perpendicular.x, perpendicular.y, perpendicular.z),
    );
  }
  const axis = cross(from, to);
  return normalize(quat(1 + d, axis.x, axis.y, axis.z));
}

export function conjugate(q: Quat): Quat {
  return quat(q.w, -q.x, -q.y, -q.z);
}

/** Rotate `v` by the inverse of the unit quaternion `q`. */
export function rotateInverse(q: Quat, v: Vec3): Vec3 {
  return rotate(conjugate(q), v);
}

/** Normalised linear interpolation on the shortest arc. */
export function nlerp(a: Quat, b: Quat, t: number): Quat {
  const sign = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z < 0 ? -1 : 1;
  return normalize(
    quat(
      a.w + (b.w * sign - a.w) * t,
      a.x + (b.x * sign - a.x) * t,
      a.y + (b.y * sign - a.y) * t,
      a.z + (b.z * sign - a.z) * t,
    ),
  );
}

/** Spherical linear interpolation on the shortest arc. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  const sign = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z < 0 ? -1 : 1;
  const w = b.w * sign;
  const x = b.x * sign;
  const y = b.y * sign;
  const z = b.z * sign;
  const cos = a.w * w + a.x * x + a.y * y + a.z * z;
  if (cos > 0.9995) {
    return nlerp(a, b, t);
  }
  const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
  const sin = Math.sin(angle);
  const startWeight = Math.sin((1 - t) * angle) / sin;
  const endWeight = Math.sin(t * angle) / sin;
  return normalize(
    quat(
      a.w * startWeight + w * endWeight,
      a.x * startWeight + x * endWeight,
      a.y * startWeight + y * endWeight,
      a.z * startWeight + z * endWeight,
    ),
  );
}

export function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** Move `current` toward `target` by at most `maxDelta`, never overshooting. */
export function moveToward(
  current: number,
  target: number,
  maxDelta: number,
): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** -1, 0 or 1; deliberately not `Math.sign` so the contract is explicit. */
export function sign(value: number): number {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/**
 * Seeded PRNG (mulberry32). The ESLint zone already promises "the seeded PRNG
 * in sim/math", so the promise lives here: render code that needs a stable
 * starfield/dust layout takes a seed from content and never calls Math.random.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
