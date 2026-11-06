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
 * This module deliberately knows nothing about `FlightState`: the start gate is
 * testable before the step loop is wired, and the step loop consumes it.
 *
 * Ordering of the guards is load-bearing (T-06-01): a malformed coordinate is
 * reported as `too far` and a malformed tank as `insufficient fuel`, and the
 * caller can never be handed a `NaN` distance or a negative tank.
 */

import { chartDistance, MAX_JUMP_DIST } from "./jump.js";

/** Exactly 15.0 s at the fixed 1/120 s step. */
export const HYPERSPACE_COUNTDOWN_STEPS = 1800;

/** The one reason a jump request was refused (never a UI string). */
export type HyperspaceRefusal = "no target" | "too far" | "insufficient fuel";

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
export function canStartJump(
  input: HyperspaceStartInput,
): JumpStartResult {
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
