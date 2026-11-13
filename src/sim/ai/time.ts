// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The AI time base (FOUND-13, D-11). Every AI timer is an integer tick, and
 * seconds convert to ticks in exactly one place, `ticks()`.
 *
 * Timers are absolute player ticks bounded to `0..0xffffffff` by sanitize and
 * the snapshot parser, which at 120 Hz spans about 414 days of cumulative ticks.
 *
 * This module does not import `src/sim/time.ts` (outside the AI lint zone's
 * allow-list); tests/sim/ai/time.test.ts pins `TICKS_PER_SECOND * DT === 1`
 * against the real `DT`.
 */

/** Simulation ticks per second: the fixed step is 1/120 s. */
export const TICKS_PER_SECOND = 120;

/**
 * Ticks between two AI thinks: Oolite's `AI_THINK_INTERVAL` of 0.125 s
 * (src/Core/AI.h, used by src/Core/AI.m) at 1/120 s per tick.
 */
export const THINK_INTERVAL_TICKS = 15;

/**
 * Whole ticks for `seconds`, at least 1. Throws `RangeError` for a negative or
 * non-finite argument.
 */
export function ticks(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(
      `ticks() needs a finite, non-negative number of seconds`,
    );
  }
  return Math.max(1, Math.round(seconds * TICKS_PER_SECOND));
}
