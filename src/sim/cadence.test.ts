// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { describe, expect, it } from "vitest";

import { runToSteps } from "./loop.js";
import { hashState, initState } from "./state.js";
import type { InputFrame } from "./state.js";

const TARGET_STEPS = 1200; // 10 s of simulated time at 1/120 s

/** One per-tick input log, replayed identically at every frame cadence. */
const SCRIPT: readonly InputFrame[] = [
  { pitch: 0, roll: 1, speed: 0, precision: false, thrust: 1 },
  { pitch: 0.5, roll: 0, speed: 0, precision: false, thrust: 1 },
  { pitch: -0.25, roll: -1, speed: 0, precision: false, thrust: 0 },
];

/**
 * Indexed by TICK, not by frame. A frame-indexed log is chunked differently at
 * every cadence and produced four distinct hashes in the research probe.
 */
const inputAtTick = (tick: number): InputFrame =>
  SCRIPT[tick % SCRIPT.length] as InputFrame;

function replay(hz: number): string {
  const state = initState();
  const frames = Array.from({ length: Math.ceil(10 * hz) + 10 }, () => 1 / hz);
  const result = runToSteps(state, frames, inputAtTick, TARGET_STEPS);
  if (result.steps !== TARGET_STEPS) {
    throw new Error(`cadence ${hz} ran ${result.steps} steps`);
  }
  return hashState(state);
}

/**
 * Steps produced by exactly one second of frames at `hz`.
 * At 144 Hz the frame list runs out before the 120th step, so the exhaustion
 * error from `runToSteps` is expected and swallowed (see the test below).
 */
function oneSecondAt(hz: number): number {
  const state = initState();
  const frames = Array.from({ length: hz }, () => 1 / hz);
  try {
    runToSteps(state, frames, inputAtTick, 120);
  } catch {
    // Expected only at 144 Hz; the assertion below documents why.
  }
  return state.tick;
}

describe("fixed-step determinism", () => {
  it("hashes identically at 30, 60, 120 and 144 Hz when driven by step count", () => {
    const hashes = new Set([30, 60, 120, 144].map(replay));
    expect(hashes.size).toBe(1);
  });

  it("documents the measured counter-example: 1 s at 144 Hz yields 119 steps", () => {
    // This is the harness's limit, not the loop's: 1/144 does not divide 1/120,
    // so one second of 144 Hz frames cannot complete the 120th tick. The loop
    // stops on a step count for exactly this reason — do not "fix" this value.
    expect(oneSecondAt(30)).toBe(120);
    expect(oneSecondAt(60)).toBe(120);
    expect(oneSecondAt(144)).toBe(119);
  });

  it("rejects a non-finite state instead of hashing it", () => {
    const state = initState();
    state.position = { x: Number.NaN, y: 0, z: 0 };
    expect(() => hashState(state)).toThrow(/non-finite/);
  });
});
