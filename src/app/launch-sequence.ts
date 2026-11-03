// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch presentation timeline (D-10, research step 8).
 *
 * The simulation owns the authoritative launch: `src/sim/flight/launch.ts`
 * advances `launchElapsed` in fixed steps, applies the +600 s clock exactly once
 * and completes the exit. This module is the *view* of that same fixed-step
 * cadence: it tells the renderer which break-pattern phase to draw and gates
 * "any key skips" on `launchSeen`.
 *
 * It never reads a wall clock. `advance` is called once per fixed step with the
 * same `DT` the simulation used, so pause freezes the timeline exactly when the
 * simulation freezes.
 *
 * `markSeen` is called at handover, never at launch start (D-10): the first
 * viewing always plays in full.
 */

import { LAUNCH_DURATION } from "../sim/flight/launch.js";

/** End of the white flash / radial streak phase. */
export const LAUNCH_FLASH_END = 0.2;
/** End of the tunnel phase; the rest fades out. */
export const LAUNCH_TUNNEL_END = 1.6;

export type LaunchPhase = "flash" | "tunnel" | "fade" | "complete";

/** The break-pattern phase for an elapsed time in seconds. */
export function launchPhaseAt(elapsed: number): LaunchPhase {
  if (!Number.isFinite(elapsed) || elapsed < LAUNCH_FLASH_END) return "flash";
  if (elapsed < LAUNCH_TUNNEL_END) return "tunnel";
  // The same tolerance the fixed-step sum needs: 240 steps of 1/120 reach
  // 1.9999999999999953, not exactly 2.
  if (elapsed < LAUNCH_DURATION - 1e-9) return "fade";
  return "complete";
}

export interface LaunchSequence {
  /**
   * Advance the view timeline by one fixed step.
   *
   * `skipped` completes the timeline only after the first viewing; before
   * `markSeen()` it is ignored and the full two seconds still play.
   */
  advance(dt: number, skipped: boolean): LaunchPhase;
  /** Whether any key may skip the current launch. */
  canSkip(launchSeen: boolean): boolean;
  /** Record the first handover; the next launch becomes skippable. */
  markSeen(): void;
  /** Start a new launch timeline; `seen` is deliberately preserved. */
  reset(): void;
  readonly elapsed: number;
  readonly phase: LaunchPhase;
  readonly seen: boolean;
  readonly complete: boolean;
}

export function createLaunchSequence(): LaunchSequence {
  let elapsed = 0;
  let seen = false;
  let complete = false;

  function phase(): LaunchPhase {
    return launchPhaseAt(elapsed);
  }

  return {
    advance(dt, skipped) {
      if (complete) return "complete";
      if (skipped && seen) {
        elapsed = LAUNCH_DURATION;
        complete = true;
        return "complete";
      }
      if (Number.isFinite(dt) && dt > 0) {
        elapsed = Math.min(elapsed + dt, LAUNCH_DURATION);
      }
      // 240 steps of 1/120 sum to 1.9999999999999953, so completion is a
      // tolerance comparison, exactly as in the simulation.
      if (elapsed >= LAUNCH_DURATION - 1e-9) complete = true;
      return phase();
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
    get phase() {
      return phase();
    },
    get seen() {
      return seen;
    },
    get complete() {
      return complete;
    },
  };
}
