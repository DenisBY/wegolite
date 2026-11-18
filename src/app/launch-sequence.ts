// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch skip gate and the launch pre-roll timer (D-10, FLGT-01; quick
 * 261118-os8).
 *
 * The simulation owns the authoritative launch: `src/sim/flight/launch.ts`
 * advances `launchElapsed` in fixed steps, applies the +600 s clock exactly once
 * and completes the exit. The renderer draws the launch view from the sim's own
 * `launchElapsed` (`src/render/launch-camera.ts`), not from this module. What
 * remains here is the gate for "any key skips": it follows the same fixed-step
 * cadence as the simulation and knows whether this launch has been seen.
 *
 * The pre-roll (owner decision 2026-11-18, quick 261118-os8, design decision
 * 1) is app-side presentation before the simulated launch: the sim driver turns
 * a launch press into `startPreRoll()`, advances the timer once per fixed step
 * while the sim keeps taking ordinary docked steps, and sends the launch
 * command on the step `advancePreRoll` reports the end. Its length is read
 * through a getter at `startPreRoll` time, because the session parses its test
 * flags after this module is built; a length of zero (the manual test clock,
 * D-09) means no pre-roll, and `startPreRoll()` returns false.
 *
 * It never reads a wall clock. `advance` and `advancePreRoll` are called once
 * per fixed step with the same `DT` the simulation used, so pause freezes them
 * exactly when the simulation freezes.
 *
 * `markSeen` is called at handover, never at launch start (D-10): the first
 * viewing always plays in full, the pre-roll included.
 */

import { LAUNCH_PRE_ROLL_DURATION } from "../render/launch-camera.js";
import { LAUNCH_DURATION } from "../sim/flight/launch.js";

/**
 * The completion tolerance: a float64 accumulator summing 1/120 cannot land
 * exactly on 2.0 or 1.5, exactly as in the simulation.
 */
const EPSILON = 1e-9;

export interface LaunchSequence {
  /**
   * Advance the gate by one fixed step.
   *
   * `skipped` completes the launch only after the first viewing; before
   * `markSeen()` it is ignored and the full two seconds still play.
   */
  advance(dt: number, skipped: boolean): void;
  /** Whether any key may skip the current launch. */
  canSkip(launchSeen: boolean): boolean;
  /** Record the first handover; the next launch becomes skippable. */
  markSeen(): void;
  /** Start a new launch and end any pre-roll; `seen` is deliberately preserved. */
  reset(): void;
  /**
   * Start the pre-roll for a launch press. Returns false, and changes nothing,
   * when the length getter gives no positive finite length; returns true when
   * a pre-roll runs after the call. A pre-roll that is already running is not
   * restarted. A new pre-roll clears `complete`, so `canSkip` reads a fresh
   * launch.
   */
  startPreRoll(): boolean;
  /**
   * Advance the pre-roll by one fixed step. Returns true exactly once, on the
   * step that ends it (its length reached, or a skip after the first viewing);
   * the caller then sends the launch. A non-finite or non-positive `dt` adds
   * nothing.
   */
  advancePreRoll(dt: number): boolean;
  /** End the pre-roll on the next `advancePreRoll`; ignored before `markSeen()`. */
  skipPreRoll(): void;
  /** End the pre-roll without a launch (the state left the docked home screen). */
  cancelPreRoll(): void;
  readonly elapsed: number;
  readonly seen: boolean;
  readonly complete: boolean;
  readonly preRolling: boolean;
  /** Seconds into the running pre-roll; 0 when none runs. */
  readonly preRollElapsed: number;
  /** Whether the last pre-roll was ended by a skip; read when it ends. */
  readonly preRollSkipped: boolean;
}

export function createLaunchSequence(
  preRollLength: () => number = () => LAUNCH_PRE_ROLL_DURATION,
): LaunchSequence {
  let elapsed = 0;
  let seen = false;
  let complete = false;
  let preRolling = false;
  let preRollElapsed = 0;
  let preRollSkipRequested = false;
  let preRollSkipped = false;
  let preRollTarget = 0;

  function endPreRoll(): void {
    preRolling = false;
    preRollElapsed = 0;
    preRollSkipRequested = false;
  }

  return {
    advance(dt, skipped) {
      if (complete) return;
      if (skipped && seen) {
        elapsed = LAUNCH_DURATION;
        complete = true;
        return;
      }
      if (Number.isFinite(dt) && dt > 0) {
        elapsed = Math.min(elapsed + dt, LAUNCH_DURATION);
      }
      // 240 steps of 1/120 sum to 1.9999999999999953, so completion is a
      // tolerance comparison, exactly as in the simulation.
      if (elapsed >= LAUNCH_DURATION - EPSILON) complete = true;
    },
    canSkip(launchSeen) {
      return launchSeen && !complete;
    },
    markSeen() {
      seen = true;
    },
    reset() {
      elapsed = 0;
      complete = false;
      endPreRoll();
    },
    startPreRoll() {
      if (preRolling) return true;
      const length = preRollLength();
      if (!Number.isFinite(length) || length <= 0) return false;
      preRolling = true;
      preRollElapsed = 0;
      preRollSkipRequested = false;
      preRollSkipped = false;
      preRollTarget = length;
      elapsed = 0;
      complete = false;
      return true;
    },
    advancePreRoll(dt) {
      if (!preRolling) return false;
      if (preRollSkipRequested) {
        endPreRoll();
        preRollSkipped = true;
        return true;
      }
      if (Number.isFinite(dt) && dt > 0) {
        preRollElapsed = Math.min(preRollElapsed + dt, preRollTarget);
      }
      // 180 steps of 1/120 do not sum exactly to 1.5 either.
      if (preRollElapsed >= preRollTarget - EPSILON) {
        endPreRoll();
        preRollSkipped = false;
        return true;
      }
      return false;
    },
    skipPreRoll() {
      if (preRolling && seen) preRollSkipRequested = true;
    },
    cancelPreRoll() {
      endPreRoll();
    },
    get elapsed() {
      return elapsed;
    },
    get seen() {
      return seen;
    },
    get complete() {
      return complete;
    },
    get preRolling() {
      return preRolling;
    },
    get preRollElapsed() {
      return preRollElapsed;
    },
    get preRollSkipped() {
      return preRollSkipped;
    },
  };
}
