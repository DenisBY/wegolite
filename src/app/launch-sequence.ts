// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch skip gate (D-10, FLGT-01).
 *
 * The simulation owns the authoritative launch: `src/sim/flight/launch.ts`
 * advances `launchElapsed` in fixed steps, applies the +600 s clock exactly once
 * and completes the exit. The renderer draws the launch view from the sim's own
 * `launchElapsed` (`src/render/launch-camera.ts`), not from this module. What
 * remains here is the gate for "any key skips": it follows the same fixed-step
 * cadence as the simulation and knows whether this launch has been seen.
 *
 * It never reads a wall clock. `advance` is called once per fixed step with the
 * same `DT` the simulation used, so pause freezes it exactly when the
 * simulation freezes.
 *
 * `markSeen` is called at handover, never at launch start (D-10): the first
 * viewing always plays in full.
 */

import { LAUNCH_DURATION } from "../sim/flight/launch.js";

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
  /** Start a new launch; `seen` is deliberately preserved. */
  reset(): void;
  readonly elapsed: number;
  readonly seen: boolean;
  readonly complete: boolean;
}

export function createLaunchSequence(): LaunchSequence {
  let elapsed = 0;
  let seen = false;
  let complete = false;

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
      if (elapsed >= LAUNCH_DURATION - 1e-9) complete = true;
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
  };
}
