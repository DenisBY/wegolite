// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { DT, MAX_FRAME_DELTA, MAX_STEPS_PER_FRAME, step } from "./step.js";
import type { InputFrame, SimState } from "./state.js";

export interface LoopResult {
  frames: number;
  steps: number;
  accumulator: number;
}

/**
 * Drive the accumulator with explicit frame deltas.
 *
 * The input log is indexed by TICK, not by frame: a determinism harness must
 * replay a per-tick log, otherwise the same log is chunked differently at each
 * cadence. (The interactive game may instead sample devices once per frame;
 * that is a different contract and it feeds a tick-indexed log like this one.)
 *
 * The loop stops on a step count, never on elapsed time: 1/144 does not divide
 * 1/120, so one second of 144 Hz frames completes only 119 steps. A time-based
 * stopping condition would fail a correct loop (Pitfall 5).
 *
 * Throws when the frame list runs out before the target, because a silently
 * short replay hashes a different state and looks like a simulation bug.
 */
export function runToSteps(
  state: SimState,
  frames: readonly number[],
  inputAtTick: (tick: number) => InputFrame,
  targetSteps: number,
): LoopResult {
  let accumulator = 0;
  let steps = 0;
  let frameIndex = 0;

  while (steps < targetSteps) {
    if (frameIndex >= frames.length) {
      throw new Error("frame list exhausted before target step count");
    }
    accumulator += Math.min(frames[frameIndex++] ?? 0, MAX_FRAME_DELTA);

    let stepsThisFrame = 0;
    while (
      accumulator >= DT &&
      stepsThisFrame < MAX_STEPS_PER_FRAME &&
      steps < targetSteps
    ) {
      step(state, inputAtTick(state.tick), DT);
      accumulator -= DT;
      steps++;
      stepsThisFrame++;
    }
    // Drop the backlog after a stall; resume with a zero accumulator so hidden
    // time is never replayed.
    if (stepsThisFrame === MAX_STEPS_PER_FRAME) accumulator = 0;
  }

  return { frames: frameIndex, steps, accumulator };
}
