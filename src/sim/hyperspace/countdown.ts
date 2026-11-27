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
 * docked parameter. The blockers are checked in a fixed order: the system's
 * main station, the witchpoint buoy, the nav buoy (since Phase 18, D-09;
 * PROJECT.md Key Decisions row "Buoys block a completing jump"), then an NPC
 * ship inside its own blockage radius (`src/sim/world/ship-field.ts`). The
 * station's mass is the system's own station record (Phase 22.1, WORLD-20): the
 * app supplies it as `options.hyperspace.stationMass`, read from the live
 * layout's `stationMass`, so every station kind blocks. The 2026-11-07 owner
 * decision that left the dodecahedron and icosahedron stations non-blocking for
 * lack of a recorded mass (option (a)) is superseded by the measured masses.
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
 * Oolite's runtime mass of a whole navigation buoy (D-09, PD-01): the hull
 * `oolite_buoy.dat` plus its frangible subentity `oolite_buoy_subents.dat`,
 * each density 1.0 x 20 x its octree volume, summed as GLfloats (ShipEntity.m
 * lines 417-419 and 2034-2041). Both buoys share the model, so both have this
 * mass; the blockage radius is `sqrt(0.1 x mass)`, about 264.33 m. The content
 * build compiles it into the `buoy` record of
 * src/content/generated/ships-client.json; it is a literal here because
 * src/sim may not import the catalogue, and
 * tests/sim/hyperspace-blockage.test.ts pins the two equal. The app supplies
 * it as `StepOptions.hyperspace.buoyMass`.
 */
export const NAV_BUOY_MASS = 698_691.1875;

/**
 * The mass of the buoy's frangible subentity, `oolite_buoy_subents.dat`, as
 * the content build's static hull artifact compiles it (the `buoy` hull's
 * one subentity); tests/sim/hyperspace-blockage.test.ts pins the two equal.
 */
export const BUOY_SUBENTITY_MASS = 7_646.7861328125;

/**
 * A buoy's mass once its subentity has died (PD-01). Oolite subtracts the dead
 * subentity's mass from the parent (`mass -= [sub mass]`, ShipEntity.m line
 * 8194) and `mass` is a GLfloat, so the result is the float32
 * `Math.fround(NAV_BUOY_MASS - BUOY_SUBENTITY_MASS)`, which equals the compiled
 * hull-only mass of `oolite_buoy.dat`. The blockage radius shrinks to about
 * 262.88 m.
 */
export const NAV_BUOY_HULL_MASS = 691_044.375;

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

/**
 * What blocked a completing jump: the system's main station, the witchpoint
 * buoy, the nav buoy or an NPC ship. A payload-free kind (no entity id, no
 * distance): the app owns the wording, which names the blocker as Oolite's
 * witch-blocked message does (PlayerEntity.m lines 6550-6553), so the buoy
 * kinds carry the buoys' Oolite names. Oolite's own loop reports only the
 * first blocker in its sorted order.
 */
export type WitchspaceBlocker =
  "station" | "ship" | "witchpointBeacon" | "navBuoy";

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
