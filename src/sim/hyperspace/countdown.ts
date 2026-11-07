// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hyperspace start predicate and the fixed-step countdown constants
 * (NAV-03, NAV-04, NAV-06, D-06, D-07).
 *
 * The countdown is simulation state, not an app timer: it lasts exactly
 * `15.0 s / (1/120 s) = 1800` fixed steps (`DEFAULT_HYPERSPACE_SPIN_TIME`,
 * `ShipEntity.h:72`). Progress is kept as integer steps remaining, so no float
 * accumulator can drift.
 *
 * This module also holds the mass-blockage predicate (NAV-04, plan 06-16). It is
 * checked at countdown completion only, never at the H press and never during
 * the countdown: Oolite's checklist guards the clause on the countdown status
 * (PlayerEntity.m line 6547), and enterWitchspace calls the checklist at the
 * countdown's end (PlayerEntity.m lines 6772-6775). A docked ship never reaches
 * completion, because a dock cancels the countdown, so the predicate takes no
 * docked parameter. The blocker is the Coriolis station. The navigation buoy is
 * a data gap, not a design choice: it is non-blocking for lack of recorded data.
 * Its template has no density key, so Oolite's default density of 1.0 applies,
 * and the missing input is the model's octree volume, which needs the unvendored
 * model oolite_buoy.dat. It stays non-blocking until that model is vendored and
 * its octree volume computed (ShipEntity.m lines 417-419 and 1075-1077).
 *
 * This module deliberately knows nothing about `FlightState`: the start gate is
 * testable before the step loop is wired, and the step loop consumes it.
 *
 * Ordering of the guards is load-bearing (T-06-01): a malformed coordinate is
 * reported as `too far` and a malformed tank as `insufficient fuel`, and the
 * caller can never be handed a `NaN` distance or a negative tank.
 */

import type { Vec3 } from "../math.js";
import { chartDistance, MAX_JUMP_DIST } from "./jump.js";

/** Exactly 15.0 s at the fixed 1/120 s step. */
export const HYPERSPACE_COUNTDOWN_STEPS = 1800;

/**
 * Oolite's blockage coefficient: a completing jump is blocked when
 * `WITCH_BLOCK_K * mass > distanceSquared` (ShipEntity.m line 12511, a float in
 * Oolite; a double here, and the difference is below one square metre at this
 * radius).
 */
export const WITCH_BLOCK_K = 0.1;

/**
 * The Coriolis station mass recorded in the Oolite source comment in
 * `checkShipsInVicinityForWitchJumpExit` (ShipEntity.m line 12504). Oolite
 * computes a ship's mass at runtime from its density and model octree volume
 * (ShipEntity.m lines 419 and 1077), so this is a recorded figure and not a
 * vendored config value (shipdata.plist has no mass key).
 */
export const CORIOLIS_STATION_MASS = 455_223_200;

/**
 * The mass of the origin system's station kind, or `undefined` when the kind has
 * no recorded mass. Only the Coriolis station blocks. The dodecahedron and
 * icosahedron stations have no recorded mass and stay non-blocking by owner
 * decision 2026-11-07, option (a).
 */
export function witchspaceStationMass(stationKind: string): number | undefined {
  return stationKind === "coriolis" ? CORIOLIS_STATION_MASS : undefined;
}

/**
 * Whether a blocker of `stationMass` at `distanceSquared` blocks a completing
 * jump. Both comparisons are strict (ShipEntity.m line 12528), and the blocker
 * must also lie inside the scanner range: a blocker at exactly the squared
 * range does not block, and one at the squared range minus one does.
 */
export function isWitchspaceBlocked(
  distanceSquared: number,
  stationMass: number,
  scannerRange: number,
): boolean {
  return (
    WITCH_BLOCK_K * stationMass > distanceSquared &&
    distanceSquared < scannerRange * scannerRange
  );
}

/** The blockage predicate evaluated on the ship and station positions. */
export function witchspaceBlockedAt(
  shipPosition: Vec3,
  stationPosition: Vec3,
  stationMass: number,
  scannerRange: number,
): boolean {
  const dx = shipPosition.x - stationPosition.x;
  const dy = shipPosition.y - stationPosition.y;
  const dz = shipPosition.z - stationPosition.z;
  const distanceSquared = dx * dx + dy * dy + dz * dz;
  return isWitchspaceBlocked(distanceSquared, stationMass, scannerRange);
}

/**
 * The one reason a jump request was refused (never a UI string). `blocked` is
 * Oolite's blocked jump failure (PlayerEntity.m line 6557), raised only at
 * countdown completion.
 */
export type HyperspaceRefusal =
  "no target" | "too far" | "insufficient fuel" | "blocked";

/** The read-only facts the app supplies for one start request (D-07). */
export interface HyperspaceStartInput {
  readonly origin: {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  };
  readonly target?: {
    readonly id: string;
    readonly x: number;
    readonly y: number;
  };
  /** Integer tenths of a light year, read from the profile. */
  readonly fuel: number;
}

export type JumpStartResult =
  | {
      readonly ok: true;
      readonly target: {
        readonly id: string;
        readonly x: number;
        readonly y: number;
      };
      readonly dist: number;
      readonly fuelCost: number;
    }
  | { readonly ok: false; readonly reason: HyperspaceRefusal };

function isFinitePoint(point: {
  readonly x: number;
  readonly y: number;
}): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/**
 * Decide whether a jump may start, and snapshot the target's distance and fuel
 * cost when it may.
 *
 * A missing target, or the current system as the target, is `no target`; a
 * distance above 17 integer units is `too far`; fuel below the exact integer
 * cost is `insufficient fuel`. Exactly `fuel === cost` and exactly `dist === 17`
 * are accepted.
 *
 * Never throws: grossly malformed input is reported as a refusal so the fixed
 * step loop cannot die on a forged or buggy step option.
 */
export function canStartJump(input: HyperspaceStartInput): JumpStartResult {
  const { origin, target, fuel } = input;

  if (target === undefined || target.id === origin.id) {
    return { ok: false, reason: "no target" };
  }

  if (!isFinitePoint(origin) || !isFinitePoint(target)) {
    return { ok: false, reason: "too far" };
  }

  if (!Number.isSafeInteger(fuel) || fuel < 0) {
    return { ok: false, reason: "insufficient fuel" };
  }

  let dist: number;
  try {
    dist = chartDistance(origin, target);
  } catch {
    // A finite pair whose squared delta overflows is still "too far".
    return { ok: false, reason: "too far" };
  }

  if (dist > MAX_JUMP_DIST) {
    return { ok: false, reason: "too far" };
  }

  const fuelCost = dist === 0 ? 1 : 4 * dist;
  if (fuel < fuelCost) {
    return { ok: false, reason: "insufficient fuel" };
  }

  return { ok: true, target, dist, fuelCost };
}

/**
 * Whole seconds left, rounded the way Oolite's countdown display reads
 * (`int seconds = round(witchspaceCountdown)`).
 *
 * Never negative and never `NaN`: idle or malformed input is `0`.
 */
export function countdownSecondsRemaining(steps: number): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  return Math.max(0, Math.round(steps * (1 / 120)));
}
