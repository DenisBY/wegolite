// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docking corridor (DOCK-01, DOCK-02, D-01, D-02, T-04-37, T-04-53).
 *
 * This module is the single producer of the port-frame ship geometry. It builds
 * the rotating frame, the eight rotated Cobra AABB corners, the projected
 * min/max box and the OBB centre/axes **once per tick**; the classifier and
 * plan 04-03's SAT both consume that one snapshot, so they cannot disagree on
 * the frame or the corner set.
 *
 * The classification order is Oolite's `DockEntity.m:691-773`:
 *
 * 1. past the 250 m tunnel end (`max.z < -depth`) -> outside;
 * 2. strictly in lane -> lane, and capture when `0.9*max.z + 0.1*min.z < 0`
 *    (this branch has **no** nose gate: Oolite returns YES at :715);
 * 3. the 1.5x safety footprint **and** `min.z < 0` -> straddle or band;
 * 4. everything else -> outside.
 *
 * Plan 04-02 Task 1 implements steps 1, 2 and 4; Task 2 fills step 3. Keeping
 * the order explicit is what stops the wings-across launch pose from being a
 * straddle at any distance (`T-04-53`).
 */

import { add, dot, rotate, sub, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import type { FlightState } from "../flight/state.js";
import type { SystemLayout } from "../world/layout.js";
import { DockGeometryError } from "./geometry.js";
import type { DockGeometry } from "./geometry.js";
import { portFrame } from "./port-frame.js";
import type { PortFrame } from "./port-frame.js";

/** Oolite's x1.25 expansion is bounded so a degenerate aperture cannot hang. */
export const MAX_APERTURE_EXPANSIONS = 64;

/** Oolite's safety band (`1.0 + 50.0/100.0`). */
export const SAFETY_FACTOR = 1.5;

/** Oolite's capture weight, `0.90 * max.z + 0.10 * min.z`. */
export const CAPTURE_MAX_WEIGHT = 0.9;
export const CAPTURE_MIN_WEIGHT = 0.1;

export type CorridorOutcome =
  "outside" | "lane" | "band" | "straddle" | "capture";

export interface CorridorClassification {
  readonly outcome: CorridorOutcome;
  readonly capture: boolean;
  /** Auto-centre shift along -i, in metres. */
  readonly deltaX: number;
  /** Auto-centre shift along -j, in metres. */
  readonly deltaY: number;
}

export interface ShipExtents {
  readonly width: number;
  readonly height: number;
}

export interface PortAxisBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

/**
 * The one per-tick port-frame snapshot. Every field is already expressed in the
 * port frame relative to `frame.origin`, except `corners`, which are the world
 * positions (so the renderer/debug path can inspect them without re-projecting).
 */
export interface DockSnapshot {
  readonly frame: PortFrame;
  readonly corners: readonly Vec3[];
  readonly box: PortAxisBox;
  /** The ship OBB centre, on i/j/k relative to the port origin. */
  readonly centre: Vec3;
  /** Ship local X/Y/Z rotated by the orientation, expressed on i/j/k. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
}

function assertExtent(label: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DockGeometryError(
      `Wegolite: apertureHalfExtents requires a positive finite ${label} (${String(value)}).`,
    );
  }
  return value;
}

/**
 * Grow one aperture axis by Oolite's x1.25 rule until the ship fits within 90 %
 * of it.
 *
 * @throws {DockGeometryError} when the multiplication cannot make progress
 * (subnormals) or the 64-iteration cap is reached (`T-04-38`).
 */
function expandAperture(
  label: string,
  dimension: number,
  shipExtent: number,
): number {
  assertExtent(`${label} dimension`, dimension);
  assertExtent(`${label} ship extent`, shipExtent);

  let value = dimension;
  for (let iteration = 0; iteration < MAX_APERTURE_EXPANSIONS; iteration += 1) {
    if (!(shipExtent > value * 0.9)) return value;
    const next = value * 1.25;
    if (!Number.isFinite(next) || !(next > value)) {
      throw new DockGeometryError(
        `Wegolite: apertureHalfExtents made no progress on ${label} at ${String(value)}.`,
      );
    }
    value = next;
  }
  if (shipExtent > value * 0.9) {
    throw new DockGeometryError(
      `Wegolite: apertureHalfExtents did not converge for ${label} after ${String(MAX_APERTURE_EXPANSIONS)} iterations.`,
    );
  }
  return value;
}

/**
 * Oolite's `DockEntity.m:632-654` aperture derivation: compare the ship's bbox
 * to the dock mesh aperture, expand in x1.25 steps until it fits 90 %, then
 * halve. The rotation comparison is the authored one: a tall port and a wide
 * ship compare the ship's short axis against the port's narrow axis.
 */
export function apertureHalfExtents(
  port: { readonly width: number; readonly height: number },
  shipLocalExtents: ShipExtents,
): { readonly ww: number; readonly hh: number } {
  const rotatedPort = port.width < port.height;
  const rotatedShip = shipLocalExtents.width < shipLocalExtents.height;
  const rotationsMatch = rotatedPort === rotatedShip;

  const widthShipExtent = rotationsMatch
    ? shipLocalExtents.width
    : shipLocalExtents.height;
  const heightShipExtent = rotationsMatch
    ? shipLocalExtents.height
    : shipLocalExtents.width;

  const ww = expandAperture("ww", port.width, widthShipExtent);
  const hh = expandAperture("hh", port.height, heightShipExtent);
  return { ww: ww * 0.5, hh: hh * 0.5 };
}

function projectToPort(point: Vec3, frame: PortFrame): Vec3 {
  const relative = sub(point, frame.origin);
  return vec(
    dot(relative, frame.i),
    dot(relative, frame.j),
    dot(relative, frame.k),
  );
}

/** Express a world-space direction on the port axes (no origin subtraction). */
function directionToPort(direction: Vec3, frame: PortFrame): Vec3 {
  return vec(
    dot(direction, frame.i),
    dot(direction, frame.j),
    dot(direction, frame.k),
  );
}

function finiteVec(value: Vec3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

/** Whether a snapshot's projected box is usable by the classifier. */
export function isFiniteBox(box: PortAxisBox): boolean {
  return finiteVec(box.min) && finiteVec(box.max);
}

/**
 * Build the port frame, the eight rotated corners, the projected box and the
 * OBB centre/axes for the current ship pose.
 *
 * Allocation bound: one frame, eight corners, one box and four vectors per
 * tick (O(8) corners). No zero-allocation claim is made.
 */
export function dockSnapshot(
  layout: SystemLayout,
  state: FlightState,
  geometry: DockGeometry,
  stationAngle: number,
): DockSnapshot {
  const frame = portFrame(layout, stationAngle);
  const { min, max } = geometry.ship;

  const corners: Vec3[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const xs = [min.x, max.x] as const;
  const ys = [min.y, max.y] as const;
  const zs = [min.z, max.z] as const;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const world = add(
          state.position,
          rotate(state.orientation, vec(x, y, z)),
        );
        corners.push(world);
        const projected = projectToPort(world, frame);
        minX = Math.min(minX, projected.x);
        minY = Math.min(minY, projected.y);
        minZ = Math.min(minZ, projected.z);
        maxX = Math.max(maxX, projected.x);
        maxY = Math.max(maxY, projected.y);
        maxZ = Math.max(maxZ, projected.z);
      }
    }
  }

  const localCentre = vec(
    (min.x + max.x) / 2,
    (min.y + max.y) / 2,
    (min.z + max.z) / 2,
  );
  const centreWorld = add(
    state.position,
    rotate(state.orientation, localCentre),
  );
  const centre = projectToPort(centreWorld, frame);

  const axes: [Vec3, Vec3, Vec3] = [
    directionToPort(rotate(state.orientation, vec(1, 0, 0)), frame),
    directionToPort(rotate(state.orientation, vec(0, 1, 0)), frame),
    directionToPort(rotate(state.orientation, vec(0, 0, 1)), frame),
  ];

  return {
    frame,
    corners,
    box: {
      min: vec(minX, minY, minZ),
      max: vec(maxX, maxY, maxZ),
    },
    centre,
    axes,
  };
}

function result(
  outcome: CorridorOutcome,
  capture = false,
  deltaX = 0,
  deltaY = 0,
): CorridorClassification {
  return { outcome, capture, deltaX, deltaY };
}

/** Oolite's weighted capture plane (`DockEntity.m:711`, `:766`). */
export function captureWeight(box: PortAxisBox): number {
  return CAPTURE_MAX_WEIGHT * box.max.z + CAPTURE_MIN_WEIGHT * box.min.z;
}

/**
 * Classify one snapshot with Oolite's strict inequalities. No epsilon is used;
 * the classifier is pure and never mutates state.
 *
 * Task 1 implements the past-end reject, the lane branch and the outside
 * fallback. Task 2 fills the safety-band/straddle branch.
 */
export function classifyCorridor(
  snapshot: DockSnapshot,
  geometry: DockGeometry,
): CorridorClassification {
  const { box } = snapshot;
  if (!isFiniteBox(box)) return result("outside");

  const { ww, hh } = geometry.corridor;

  // 1. Past-end reject: the whole ship is beyond the 250 m tunnel.
  if (box.max.z < -geometry.port.depth) return result("outside");

  // 2. Strictly in lane (no nose gate — Oolite returns YES at :715).
  const inLane =
    box.max.x < ww && box.min.x > -ww && box.max.y < hh && box.min.y > -hh;
  if (inLane) {
    return captureWeight(box) < 0 ? result("capture", true) : result("lane");
  }

  // 3. The 1.5x safety footprint, gated by the nose being inside the station
  // (`DockEntity.m:727`). This gate is what keeps a wings-across launch pose at
  // any distance `outside` rather than a straddle (`T-04-53`).
  const inBand =
    box.min.x > -SAFETY_FACTOR * ww &&
    box.max.x < SAFETY_FACTOR * ww &&
    box.min.y > -SAFETY_FACTOR * hh &&
    box.max.y < SAFETY_FACTOR * hh;

  if (inBand && box.min.z < 0) {
    // Opposite edges outside the lane at once is the fatal straddle. It is
    // classification-only here; plan 04-03 owns the single bounce response.
    const straddles =
      (box.min.x < -ww && box.max.x > ww) ||
      (box.min.y < -hh && box.max.y > hh);
    if (straddles) return result("straddle");

    const span = box.max.z - box.min.z;
    let deltaX = 0;
    let deltaY = 0;
    if (Number.isFinite(span) && span > 0) {
      const factor = -box.min.z / span;
      if (Number.isFinite(factor)) {
        deltaX = 0.5 * (box.max.x + box.min.x) * factor;
        deltaY = 0.5 * (box.max.y + box.min.y) * factor;

        // x is inside the lane: no correction.
        if (box.max.x < ww && box.min.x > -ww) deltaX = 0;
        // Symmetric y guard. Oolite's `DockEntity.m:752` uses `max.y > hh`,
        // which disables correction exactly when the ship protrudes above the
        // top edge; Wegolite deliberately mirrors the x guard instead. The
        // deviation is recorded in PROJECT.md's Key Decisions.
        if (box.max.y < hh && box.min.y > -hh) deltaY = 0;

        if (!Number.isFinite(deltaX)) deltaX = 0;
        if (!Number.isFinite(deltaY)) deltaY = 0;
      }
    }

    if (captureWeight(box) < 0) {
      return result("capture", true, deltaX, deltaY);
    }
    return result("band", false, deltaX, deltaY);
  }

  // 4. Everything else.
  return result("outside");
}
