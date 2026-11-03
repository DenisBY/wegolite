// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence flight determinism (FLGT-03, FLGT-08, FOUND-07).
 *
 * The same tick-indexed intent log must hash identically when the frames that
 * drive the accumulator arrive at 30, 60 or 144 Hz. The log is indexed by
 * TICK, not by frame: a frame-indexed log is chunked differently at each
 * cadence and is the classic false failure. `runToSteps` is left untouched; the
 * flight replay helper lives here, in the test.
 */

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  DT,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
} from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;

const TARGET_STEPS = 1200; // 10 s of simulated time at 1/120 s

/** One per-tick intent log, replayed identically at every frame cadence. */
const SCRIPT: readonly ControlIntent[] = [
  { ...ZERO_INTENT, roll: 1, speed: 1 },
  { ...ZERO_INTENT, pitch: 0.5, speed: 1 },
  { ...ZERO_INTENT, pitch: -0.25, roll: -1 },
  { ...ZERO_INTENT, speed: -1 },
];

const intentAtTick = (tick: number): ControlIntent =>
  SCRIPT[tick % SCRIPT.length] as ControlIntent;

/** Launch, skip the cinematic, and land in `inFlight`. */
function flyingState(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  return state;
}

/**
 * The flight twin of `runToSteps`: clamp the frame delta, run whole 1/120 s
 * steps, cap catch-up at five steps, and drop the backlog after a stall.
 */
function runFlightToSteps(
  state: FlightState,
  frames: readonly number[],
  targetSteps: number,
): { steps: number } {
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
      stepFlight(state, layout, config, intentAtTick(state.tick), [], DT);
      accumulator -= DT;
      steps += 1;
      stepsThisFrame += 1;
    }
    if (stepsThisFrame === MAX_STEPS_PER_FRAME) accumulator = 0;
  }

  return { steps };
}

function replay(hz: number): string {
  const state = flyingState();
  const frames = Array.from({ length: Math.ceil(10 * hz) + 10 }, () => 1 / hz);
  const result = runFlightToSteps(state, frames, TARGET_STEPS);
  if (result.steps !== TARGET_STEPS) {
    throw new Error(`cadence ${hz} ran ${result.steps} steps`);
  }
  return hashFlight(state);
}

describe("flight cross-cadence determinism", () => {
  it("hashes identically at 30, 60 and 144 Hz from one tick-indexed log", () => {
    const hashes = new Set([30, 60, 144].map(replay));
    expect(hashes.size).toBe(1);
  });

  it("reaches the same tick count at every cadence", () => {
    for (const hz of [30, 60, 144]) {
      const state = flyingState();
      const frames = Array.from(
        { length: Math.ceil(10 * hz) + 10 },
        () => 1 / hz,
      );
      expect(runFlightToSteps(state, frames, TARGET_STEPS).steps).toBe(
        TARGET_STEPS,
      );
      expect(state.tick).toBe(TARGET_STEPS + 2);
    }
  });
});
