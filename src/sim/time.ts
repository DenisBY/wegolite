// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one fixed-timestep contract (FOUND-07).
 *
 * Phase 1 declared these constants in `src/sim/step.ts` and its golden and
 * cadence tests pin them. Phase 3 adds a second consumer (the app loop and the
 * flight step), so the values are re-exported from this module rather than
 * copied: `step.ts` stays the single owner and no second 1/120 can drift.
 */

export { DT, MAX_FRAME_DELTA, MAX_STEPS_PER_FRAME } from "./step.js";
