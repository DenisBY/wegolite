// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one source of the browser budgets (plan 21-19; D-05, DATA-18).
 *
 * Every spec that compares a rendered frame or the cold-start transfer with a
 * budget imports its limit from here, so a budget cannot drift between specs
 * (`budget.spec.ts`, `traffic.spec.ts`, `npc-flight.spec.ts`, `combat.spec.ts`
 * and `anarchy.spec.ts` once declared their own copies).
 *
 * The comparison is the one `docs/PERFORMANCE.md` "Budget" states: inclusive
 * (a count equal to the budget passes, one above it fails), and a count of zero
 * fails, so a blank frame or a scene never drawn cannot pass.
 *
 * `DRAW_CALL_BUDGET` stays 50 after the D-05 full-anarchy spike: fix (1)
 * (plan 21-17, per-hull primitive merge) put the anarchy at 39 calls and 42
 * after a kill, so no raise was needed; fix (2) (plan 21-18) is deferred, and no
 * raise is allowed while it is (21-CONTEXT.md D-05 note, PROJECT.md Key
 * Decisions).
 */

/** Draw calls per rendered frame (STACK.md lines 442-443; D-05 kept it at 50). */
export const DRAW_CALL_BUDGET = 50;

/** Triangles per rendered frame (STACK.md lines 442-443, research target). */
export const TRIANGLE_BUDGET = 250_000;

/** One MiB, the rounding unit of the first-load ceiling. */
const MIB = 1_048_576;

/**
 * Regression ceiling for the cold-start transfer to the first in-flight frame
 * (T-07-14, D-14): 9 MiB, 9,437,184 bytes. The measured baseline was
 * 8,814,224 bytes (8.41 MiB) on 2026-11-11, rounded up to the next MiB. It was
 * 7,490,424 bytes before the navigation buoy model and its textures were
 * added, and 20,996,848 bytes before the textures were re-encoded to WebP and
 * the client ship catalogue was trimmed. The owner decision of 2026-11-14
 * (option A) kept the same ceiling with traffic on, which measures
 * 8,933,196 bytes after plan 21-17. Background NPC model prefetch (D-07) stays
 * outside it.
 */
export const FIRST_LOAD_BYTES_CEILING = 9 * MIB;

/**
 * True when `count` is a finite number with `0 < count <= budget`: the
 * inclusive comparison of `docs/PERFORMANCE.md`, where zero (a blank frame)
 * and anything non-finite (a probe that never reported) fail.
 */
export function withinBudget(count: number, budget: number): boolean {
  return Number.isFinite(count) && count > 0 && count <= budget;
}
