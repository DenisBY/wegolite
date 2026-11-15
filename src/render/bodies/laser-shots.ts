// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drawn laser shots (CBT-05, success criterion 3, RESEARCH A4).
 *
 * Every `laserFired` event adds one segment, from the mount to the hit point or
 * the laser's full reach, drawn for `LASER_SHOT_DURATION` (0.09 s,
 * `kLaserDuration`, `OOLaserShotEntity.m:36`) of flight time in the laser's
 * Oolite colour. The whole layer is one `THREE.LineSegments` over a fixed
 * pool of 32 shots with preallocated position and colour buffers: one draw call
 * while any shot is live, none otherwise (the object is hidden when empty), and
 * nothing is allocated per shot after creation. A 33rd simultaneous shot
 * overwrites the oldest.
 *
 * Camera-relative like every body (`sync.ts`, `npc-ships.ts`): the shot's world
 * endpoints are kept in float64 and the camera is subtracted in float64 before
 * the float32 buffer write, so a shot far from the origin keeps its precision.
 *
 * A shot is a thin line (A4 allows it; Oolite's quad widths are
 * `OOLaserShotEntity.m:49-51`). Seen from the cockpit the fore shot runs away
 * along the view axis, so it reads as a short streak toward the vanishing point.
 *
 * The layer stores positions, a start time and a colour only. It never holds an
 * entity id (the shooter is not stored), so a jump or a Load cannot leave a
 * stale reference; the scene owns and disposes it like the NPC layer.
 */

import * as THREE from "three";
import { LASER_SHOT_DURATION } from "../../sim/combat/constants.js";
import type { LaserKind } from "../../sim/events.js";
import type { Vec3 } from "../../sim/math.js";

/** Shots drawn at once; a further shot overwrites the oldest. */
export const LASER_SHOT_POOL = 32;

/**
 * Oolite's colour for each laser kind: `weapon_info` `color` of
 * `EQ_WEAPON_PULSE_LASER` (`redColor`), `_BEAM_` (`yellowColor`), `_MINING_`
 * (`blueColor`), `_MILITARY_` (`magentaColor`) and `_THARGOID_` (`greenColor`),
 * all in `equipment.plist`. Linear RGB, each channel 0 or 1.
 */
export const LASER_SHOT_COLORS: Readonly<
  Record<LaserKind, readonly [number, number, number]>
> = Object.freeze({
  pulse: Object.freeze([1, 0, 0] as const),
  beam: Object.freeze([1, 1, 0] as const),
  mining: Object.freeze([0, 0, 1] as const),
  military: Object.freeze([1, 0, 1] as const),
  thargoid: Object.freeze([0, 1, 0] as const),
});

/** The shot layer of one system scene. */
export interface LaserShotLayer {
  /** The one draw object; hidden whenever no shot is live. */
  readonly root: THREE.LineSegments;
  /**
   * Add a shot from `from` to `to` (world space), starting at `flightTime`. A
   * segment with a non-finite coordinate or time is skipped.
   */
  add(from: Vec3, to: Vec3, laserKind: LaserKind, flightTime: number): void;
  /**
   * Rewrite the live shots camera-relative and retire the expired ones.
   * `flightTime` is the simulation clock the shots were added with.
   */
  update(cameraWorld: Vec3, flightTime: number): void;
  /** Free the geometry and the material. */
  dispose(): void;
}

/** Floats per segment: two endpoints of three components. */
const SEGMENT_FLOATS = 6;

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function createLaserShotLayer(): LaserShotLayer {
  // Float64 world endpoints per slot; the float32 buffers below are what is
  // drawn and are rewritten each update, compacted to the live shots.
  const world = new Float64Array(LASER_SHOT_POOL * SEGMENT_FLOATS);
  const slotColor = new Float32Array(LASER_SHOT_POOL * 3);
  // NaN marks an empty slot.
  const startTime = new Float64Array(LASER_SHOT_POOL).fill(Number.NaN);
  let head = 0;
  let disposed = false;

  const positions = new THREE.BufferAttribute(
    new Float32Array(LASER_SHOT_POOL * SEGMENT_FLOATS),
    3,
  );
  positions.setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.BufferAttribute(
    new Float32Array(LASER_SHOT_POOL * SEGMENT_FLOATS),
    3,
  );
  colors.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positions);
  geometry.setAttribute("color", colors);
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    depthWrite: false,
    fog: false,
  });
  const root = new THREE.LineSegments(geometry, material);
  root.name = "laserShots";
  // The bounding sphere is never computed for a buffer that moves each frame.
  root.frustumCulled = false;
  root.visible = false;

  function hide(): void {
    geometry.setDrawRange(0, 0);
    root.visible = false;
  }

  return {
    root,
    add(from, to, laserKind, flightTime): void {
      if (disposed) return;
      if (!finiteVec(from) || !finiteVec(to) || !Number.isFinite(flightTime)) {
        return;
      }
      const base = head * SEGMENT_FLOATS;
      world[base] = from.x;
      world[base + 1] = from.y;
      world[base + 2] = from.z;
      world[base + 3] = to.x;
      world[base + 4] = to.y;
      world[base + 5] = to.z;
      const color = LASER_SHOT_COLORS[laserKind];
      slotColor[head * 3] = color[0];
      slotColor[head * 3 + 1] = color[1];
      slotColor[head * 3 + 2] = color[2];
      startTime[head] = flightTime;
      head = (head + 1) % LASER_SHOT_POOL;
    },
    update(cameraWorld, flightTime): void {
      if (disposed) return;
      if (!finiteVec(cameraWorld) || !Number.isFinite(flightTime)) {
        hide();
        return;
      }
      const out = positions.array as Float32Array;
      const outColor = colors.array as Float32Array;
      let live = 0;
      for (let slot = 0; slot < LASER_SHOT_POOL; slot += 1) {
        const start = startTime[slot] ?? Number.NaN;
        if (Number.isNaN(start)) continue;
        const elapsed = flightTime - start;
        // Expired, or started in the future (a Load rewound the clock): the
        // slot is freed and never comes back.
        if (elapsed < 0 || elapsed >= LASER_SHOT_DURATION) {
          startTime[slot] = Number.NaN;
          continue;
        }
        const from = slot * SEGMENT_FLOATS;
        const to = live * SEGMENT_FLOATS;
        // The float64 subtraction happens here, before any float32 write.
        out[to] = (world[from] ?? 0) - cameraWorld.x;
        out[to + 1] = (world[from + 1] ?? 0) - cameraWorld.y;
        out[to + 2] = (world[from + 2] ?? 0) - cameraWorld.z;
        out[to + 3] = (world[from + 3] ?? 0) - cameraWorld.x;
        out[to + 4] = (world[from + 4] ?? 0) - cameraWorld.y;
        out[to + 5] = (world[from + 5] ?? 0) - cameraWorld.z;
        const red = slotColor[slot * 3] ?? 0;
        const green = slotColor[slot * 3 + 1] ?? 0;
        const blue = slotColor[slot * 3 + 2] ?? 0;
        outColor[to] = red;
        outColor[to + 1] = green;
        outColor[to + 2] = blue;
        outColor[to + 3] = red;
        outColor[to + 4] = green;
        outColor[to + 5] = blue;
        live += 1;
      }
      if (live === 0) {
        hide();
        return;
      }
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      geometry.setDrawRange(0, live * 2);
      root.visible = true;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      hide();
      geometry.dispose();
      material.dispose();
    },
  };
}
