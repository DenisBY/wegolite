// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Vector and quaternion maths in Oolite's own conventions, for the oracle's
 * reference flight model. Self-contained: nothing here imports Wegolite code.
 *
 * Oolite stores ship vectors and the orientation quaternion as `GLfloat`
 * (`OOMaths.h:49`, `OOScalar`), and its positions as double `HPVector`
 * (`OOMaths.h:51`). Every operation below takes a `Mode`: in the `f32` mode
 * each stored intermediate is rounded with `Math.fround`, which emulates the
 * C float arithmetic of the original; in the `f64` mode nothing is rounded.
 * The port runs in float64, so the oracle states each tolerance from the
 * measured difference between the two modes (contract item 6).
 *
 * The orientation convention is Oolite's (`OOQuaternion.m`): the three basis
 * vectors are the rows of the standard rotation matrix of the quaternion, so
 * the quaternion built from a right, up and forward triple is the one whose
 * `vector_*_from_quaternion` returns that triple.
 */

/** A float-emulation mode: `r` rounds a stored float intermediate. */
export interface Mode {
  readonly name: "f32" | "f64";
  readonly r: (value: number) => number;
}

export const F32: Mode = { name: "f32", r: Math.fround };
export const F64: Mode = { name: "f64", r: (value) => value };

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export function vec(x: number, y: number, z: number): Vec {
  return { x, y, z };
}

export function vecFromTuple(
  tuple: readonly [number, number, number],
  mode: Mode,
): Vec {
  return { x: mode.r(tuple[0]), y: mode.r(tuple[1]), z: mode.r(tuple[2]) };
}

export const IDENTITY: Readonly<Quat> = { w: 1, x: 0, y: 0, z: 0 };

/** `magnitude2` (`OOVector.h:237`): float adds and multiplies. */
export function magnitude2(mode: Mode, v: Vec): number {
  const r = mode.r;
  return r(r(r(v.x * v.x) + r(v.y * v.y)) + r(v.z * v.z));
}

/** `magnitude` (`OOVector.h:242`): `sqrt` of a float, returned as a float. */
export function magnitude(mode: Mode, v: Vec): number {
  return mode.r(Math.sqrt(magnitude2(mode, v)));
}

/** `vector_normal` (`OOVector.h:247-253, 270`): the zero vector stays zero. */
export function vectorNormal(mode: Mode, v: Vec): Vec {
  const r = mode.r;
  const mag2 = magnitude2(mode, v);
  if (mag2 === 0) return { x: 0, y: 0, z: 0 };
  const scale = r(1 / Math.sqrt(mag2));
  return { x: r(v.x * scale), y: r(v.y * scale), z: r(v.z * scale) };
}

/** `dot_product` (`OOVector.h:299`). */
export function dot(mode: Mode, a: Vec, b: Vec): number {
  const r = mode.r;
  return r(r(r(a.x * b.x) + r(a.y * b.y)) + r(a.z * b.z));
}

/** `quaternion_multiply` (`OOQuaternion.m:30-38`). */
export function quatMultiply(mode: Mode, q1: Quat, q2: Quat): Quat {
  const r = mode.r;
  return {
    w: r(
      r(r(r(q1.w * q2.w) - r(q1.x * q2.x)) - r(q1.y * q2.y)) - r(q1.z * q2.z),
    ),
    x: r(
      r(r(r(q1.w * q2.x) + r(q1.x * q2.w)) + r(q1.y * q2.z)) - r(q1.z * q2.y),
    ),
    y: r(
      r(r(r(q1.w * q2.y) + r(q1.y * q2.w)) + r(q1.z * q2.x)) - r(q1.x * q2.z),
    ),
    z: r(
      r(r(r(q1.w * q2.z) + r(q1.z * q2.w)) + r(q1.x * q2.y)) - r(q1.y * q2.x),
    ),
  };
}

/** `quaternion_rotate_about_x` (`OOQuaternion.m:291-307`). */
export function quatRotateAboutX(mode: Mode, q: Quat, angle: number): Quat {
  const r = mode.r;
  const a = r(angle * 0.5);
  const w = r(Math.cos(a));
  const scale = r(Math.sin(a));
  return {
    w: r(r(q.w * w) - r(q.x * scale)),
    x: r(r(q.w * scale) + r(q.x * w)),
    y: r(r(q.y * w) + r(q.z * scale)),
    z: r(r(q.z * w) - r(q.y * scale)),
  };
}

/** `quaternion_rotate_about_y` (`OOQuaternion.m:309-325`). */
export function quatRotateAboutY(mode: Mode, q: Quat, angle: number): Quat {
  const r = mode.r;
  const a = r(angle * 0.5);
  const w = r(Math.cos(a));
  const scale = r(Math.sin(a));
  return {
    w: r(r(q.w * w) - r(q.y * scale)),
    x: r(r(q.x * w) - r(q.z * scale)),
    y: r(r(q.w * scale) + r(q.y * w)),
    z: r(r(q.z * w) + r(q.x * scale)),
  };
}

/** `quaternion_rotate_about_z` (`OOQuaternion.m:327-343`). */
export function quatRotateAboutZ(mode: Mode, q: Quat, angle: number): Quat {
  const r = mode.r;
  const a = r(angle * 0.5);
  const w = r(Math.cos(a));
  const scale = r(Math.sin(a));
  return {
    w: r(r(q.w * w) - r(q.z * scale)),
    x: r(r(q.x * w) + r(q.y * scale)),
    y: r(r(q.y * w) - r(q.x * scale)),
    z: r(r(q.w * scale) + r(q.z * w)),
  };
}

/** `quaternion_normalize` (`OOQuaternion.h:137-150`). */
export function quatNormalize(mode: Mode, q: Quat): Quat {
  const r = mode.r;
  const sum = r(
    r(r(r(q.w * q.w) + r(q.x * q.x)) + r(q.y * q.y)) + r(q.z * q.z),
  );
  const lv = r(1 / Math.sqrt(sum));
  return { w: r(lv * q.w), x: r(lv * q.x), y: r(lv * q.y), z: r(lv * q.z) };
}

export function quatEqual(a: Quat, b: Quat): boolean {
  return a.w === b.w && a.x === b.x && a.y === b.y && a.z === b.z;
}

/** `vector_forward_from_quaternion` (`OOQuaternion.m:50-81`). */
export function forwardFromQuat(mode: Mode, q: Quat): Vec {
  const r = mode.r;
  const xx2 = r(2 * q.x);
  const yy2 = r(2 * q.y);
  const zz2 = r(2 * q.z);
  const wx = r(q.w * xx2);
  const wy = r(q.w * yy2);
  const xx = r(q.x * xx2);
  const xz = r(q.x * zz2);
  const yy = r(q.y * yy2);
  const yz = r(q.y * zz2);
  const res = { x: r(xz - wy), y: r(yz + wx), z: r(r(1 - xx) - yy) };
  if (res.x !== 0 || res.y !== 0 || res.z !== 0) return vectorNormal(mode, res);
  return { x: 0, y: 0, z: 1 };
}

/** `vector_up_from_quaternion` (`OOQuaternion.m:89-120`). */
export function upFromQuat(mode: Mode, q: Quat): Vec {
  const r = mode.r;
  const xx2 = r(2 * q.x);
  const yy2 = r(2 * q.y);
  const zz2 = r(2 * q.z);
  const wx = r(q.w * xx2);
  const wz = r(q.w * zz2);
  const xx = r(q.x * xx2);
  const xy = r(q.x * yy2);
  const yz = r(q.y * zz2);
  const zz = r(q.z * zz2);
  const res = { x: r(xy + wz), y: r(r(1 - xx) - zz), z: r(yz - wx) };
  if (res.x !== 0 || res.y !== 0 || res.z !== 0) return vectorNormal(mode, res);
  return { x: 0, y: 1, z: 0 };
}

/** `vector_right_from_quaternion` (`OOQuaternion.m:122-152`). */
export function rightFromQuat(mode: Mode, q: Quat): Vec {
  const r = mode.r;
  const yy2 = r(2 * q.y);
  const zz2 = r(2 * q.z);
  const wy = r(q.w * yy2);
  const wz = r(q.w * zz2);
  const xy = r(q.x * yy2);
  const xz = r(q.x * zz2);
  const yy = r(q.y * yy2);
  const zz = r(q.z * zz2);
  const res = { x: r(r(1 - yy) - zz), y: r(xy - wz), z: r(xz + wy) };
  if (res.x !== 0 || res.y !== 0 || res.z !== 0) return vectorNormal(mode, res);
  return { x: 1, y: 0, z: 0 };
}

/**
 * The quaternion whose Oolite basis vectors are `right`, `up` and `forward`.
 * Oolite's `vector_*_from_quaternion` formulas return the rows of the
 * standard rotation matrix of the quaternion, so this is the textbook
 * matrix-to-quaternion conversion on the matrix with rows right, up, forward.
 * Float64; the caller rounds when it needs the float emulation.
 */
export function quatFromBasis(right: Vec, up: Vec, forward: Vec): Quat {
  const m00 = right.x;
  const m01 = right.y;
  const m02 = right.z;
  const m10 = up.x;
  const m11 = up.y;
  const m12 = up.z;
  const m20 = forward.x;
  const m21 = forward.y;
  const m22 = forward.z;
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = Math.sqrt(1 + trace) * 2;
    q = {
      w: s / 4,
      x: (m21 - m12) / s,
      y: (m02 - m20) / s,
      z: (m10 - m01) / s,
    };
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = {
      w: (m21 - m12) / s,
      x: s / 4,
      y: (m01 + m10) / s,
      z: (m02 + m20) / s,
    };
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = {
      w: (m02 - m20) / s,
      x: (m01 + m10) / s,
      y: s / 4,
      z: (m12 + m21) / s,
    };
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = {
      w: (m10 - m01) / s,
      x: (m02 + m20) / s,
      y: (m12 + m21) / s,
      z: s / 4,
    };
  }
  const length = Math.hypot(q.w, q.x, q.y, q.z);
  return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
}
