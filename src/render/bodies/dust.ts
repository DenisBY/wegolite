// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Camera-local speed dust (D-04, FLGT-04, research step 8, Pitfall 18).
 *
 * The field lives in a box around the camera, never at absolute world
 * coordinates. Each frame the camera's world delta is subtracted from every
 * mote and each axis is wrapped modulo the box, so the cloud follows the ship
 * however far it travels. Streak length grows with speed (which already carries
 * the torus factor); the opacity lifts under torus, so the drive reads as
 * motion even at 1024x.
 *
 * Resource bound (T-3-17): one preallocated `Float32Array` per purpose, a count
 * capped at 1,200, and no per-frame allocation. A large teleport (the `?test`
 * hook) reseeds deterministically instead of stretching the box.
 */

import * as THREE from "three";
import {
  clamp,
  createSeededRandom,
  normalizeVec,
  vec,
} from "../../sim/math.js";
import type { Vec3 } from "../../sim/math.js";

/** The default mote count (research: 600-1,200). */
export const DUST_DEFAULT_COUNT = 800;
/** The hard cap: a tampered count cannot allocate an unbounded buffer. */
export const DUST_MAX_COUNT = 1_200;
/** The default box edge in metres (research: 400-600). */
export const DUST_DEFAULT_BOX = 500;
/** A fixed seed: dust is presentation only and must be replayable. */
export const DUST_SEED = 0x9e37_79b9;

/** Shortest streak in metres, so a stationary camera still shows motes. */
const MIN_STREAK = 0.5;
/** Longest streak in metres; a large value reads as a wall, not motion. */
const MAX_STREAK = 40;
/** Metres of streak per metre/second of speed. */
const STREAK_PER_SPEED = 0.02;

function sanitizeBox(box: number): number {
  return Number.isFinite(box) && box > 0 ? box : DUST_DEFAULT_BOX;
}

function sanitizeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.min(Math.max(Math.trunc(count), 0), DUST_MAX_COUNT);
}

/**
 * Wrap one camera-local coordinate into `[-box/2, box/2)`.
 *
 * The double modulo handles negative values; the `+ half` shift makes the box
 * centred on the camera rather than on the origin.
 */
export function wrapDustCoordinate(value: number, box: number): number {
  const size = sanitizeBox(box);
  const half = size / 2;
  const wrapped = ((((value + half) % size) + size) % size) - half;
  // A value exactly on the upper edge wraps to the lower edge, so the interval
  // is half-open and a repeated wrap never drifts out of range.
  return wrapped === half ? -half : wrapped;
}

export interface Dust {
  readonly object: THREE.LineSegments;
  /** Camera-local mote heads, `count * 3` floats. Reused, never reallocated. */
  readonly positions: Float32Array;
  readonly count: number;
  readonly box: number;
  readonly active: boolean;
  /**
   * Advance the field: subtract the camera world delta, wrap, and rebuild the
   * streak segments for the current speed/torus state.
   */
  update(cameraDelta: Vec3, speed: number, torusFactor: number): void;
  /** Deterministically re-scatter the field (initial build and large teleport). */
  reseed(seed?: number): void;
  dispose(): void;
}

export function createDust(
  count = DUST_DEFAULT_COUNT,
  box = DUST_DEFAULT_BOX,
): Dust {
  const size = sanitizeBox(box);
  const motes = sanitizeCount(count);
  const heads = new Float32Array(motes * 3);
  const directions = new Float32Array(motes * 3);
  const segmentPositions = new Float32Array(motes * 2 * 3);
  let seed = DUST_SEED;

  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(segmentPositions, 3);
  geometry.setAttribute("position", attribute);
  const material = new THREE.LineBasicMaterial({
    color: 0xbfe3ff,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.name = "dust";
  // Positions are camera-local, so the geometry's bounding sphere is not the
  // world-space one; culling it would drop the field on a turn.
  object.frustumCulled = false;

  function reseed(next: number = seed): void {
    seed = next >>> 0;
    const random = createSeededRandom(seed);
    for (let index = 0; index < motes; index += 1) {
      const offset = index * 3;
      heads[offset] = (random() - 0.5) * size;
      heads[offset + 1] = (random() - 0.5) * size;
      heads[offset + 2] = (random() - 0.5) * size;
      // A per-mote direction is the fallback streak axis when the camera is
      // stationary; a zero direction would collapse the segment to a point.
      const dx = random() * 2 - 1;
      const dy = random() * 2 - 1;
      const dz = random() * 2 - 1;
      const unit = normalizeVec(vec(dx, dy, dz));
      directions[offset] =
        unit.x === 0 && unit.y === 0 && unit.z === 0 ? 1 : unit.x;
      directions[offset + 1] = unit.y;
      directions[offset + 2] = unit.z;
    }
  }

  function writeSegments(axis: Vec3, streak: number): void {
    for (let index = 0; index < motes; index += 1) {
      const head = index * 3;
      const target = index * 6;
      const x = heads[head] ?? 0;
      const y = heads[head + 1] ?? 0;
      const z = heads[head + 2] ?? 0;
      segmentPositions[target] = x;
      segmentPositions[target + 1] = y;
      segmentPositions[target + 2] = z;
      segmentPositions[target + 3] = x - axis.x * streak;
      segmentPositions[target + 4] = y - axis.y * streak;
      segmentPositions[target + 5] = z - axis.z * streak;
    }
    attribute.needsUpdate = true;
  }

  function update(cameraDelta: Vec3, speed: number, torusFactor: number): void {
    const teleported =
      Math.abs(cameraDelta.x) > size ||
      Math.abs(cameraDelta.y) > size ||
      Math.abs(cameraDelta.z) > size;

    if (teleported) {
      reseed(seed);
    } else {
      for (let index = 0; index < motes; index += 1) {
        const offset = index * 3;
        heads[offset] = wrapDustCoordinate(
          (heads[offset] ?? 0) - cameraDelta.x,
          size,
        );
        heads[offset + 1] = wrapDustCoordinate(
          (heads[offset + 1] ?? 0) - cameraDelta.y,
          size,
        );
        heads[offset + 2] = wrapDustCoordinate(
          (heads[offset + 2] ?? 0) - cameraDelta.z,
          size,
        );
      }
    }

    const streak = clamp(speed * STREAK_PER_SPEED, MIN_STREAK, MAX_STREAK);
    const deltaDirection = normalizeVec(cameraDelta);
    const moving =
      deltaDirection.x !== 0 ||
      deltaDirection.y !== 0 ||
      deltaDirection.z !== 0;

    if (moving) {
      writeSegments(deltaDirection, streak);
    } else {
      // Stationary camera: keep each mote's own axis so the field still reads
      // as dust rather than a single wall of parallel lines.
      for (let index = 0; index < motes; index += 1) {
        const head = index * 3;
        const target = index * 6;
        const x = heads[head] ?? 0;
        const y = heads[head + 1] ?? 0;
        const z = heads[head + 2] ?? 0;
        const dx = directions[head] ?? 1;
        const dy = directions[head + 1] ?? 0;
        const dz = directions[head + 2] ?? 0;
        segmentPositions[target] = x;
        segmentPositions[target + 1] = y;
        segmentPositions[target + 2] = z;
        segmentPositions[target + 3] = x - dx * streak;
        segmentPositions[target + 4] = y - dy * streak;
        segmentPositions[target + 5] = z - dz * streak;
      }
      attribute.needsUpdate = true;
    }

    // Torus brightens the field; the factor is presentation, never physics.
    const torusLift = Math.min(Math.max(torusFactor, 1) / 32, 1);
    material.opacity = 0.35 + torusLift * 0.35;
  }

  reseed(DUST_SEED);
  update(vec(0, 0, 0), 0, 1);

  return {
    object,
    positions: heads,
    count: motes,
    box: size,
    get active(): boolean {
      return object.visible && motes > 0;
    },
    update,
    reseed,
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
