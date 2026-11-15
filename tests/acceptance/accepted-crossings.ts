// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The accepted hull-crossing episodes of the Phase 14 acceptance run.
 *
 * One entry per accepted crossing episode (a maximal run of consecutive
 * crossing ticks of one flyer through one body with one class, see
 * `MAX_HULL_CROSSINGS` in `./thresholds.ts`). An entry excuses exactly the
 * episode with its epoch, flyer, crossed body, first tick and class (every
 * tick of it), never a single tick and never another episode. `crossingClass`
 * is `own-target`, `other-alert-ignored` or `other`: the owner may accept any
 * class. `decision` gives the owner's reason and the date of the answer.
 *
 * This list is empty and stays empty unless plan 14-17 fills it on the
 * owner's recorded option (a) answer at its checkpoint. It lies outside the
 * frozen set, so accepting an episode never needs a second commit of
 * `thresholds.ts`. A run is green when every count meets its threshold with
 * this list applied; an entry that matches no episode is reported as stale,
 * not failed.
 */

/** One accepted crossing episode. */
export interface AcceptedHullCrossing {
  readonly epoch: number;
  /** The id of the crossing flyer. */
  readonly flyerId: number;
  /** The id of the crossed body (a ship or the player). */
  readonly crossedId: number;
  /** The first tick of the episode, counted from t0 = 0. */
  readonly firstTick: number;
  readonly crossingClass: "own-target" | "other-alert-ignored" | "other";
  /** The owner's reason and the date of the answer. */
  readonly decision: string;
}

export const ACCEPTED_HULL_CROSSINGS: readonly AcceptedHullCrossing[] =
  Object.freeze([]);
