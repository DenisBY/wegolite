// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence docking determinism (DOCK-02, DOCK-04, FLGT-03, FOUND-07).
 *
 * The same tick-indexed replay must hash identically when frames arrive at 60,
 * 120 or 144 Hz. The replay is deliberately non-vacuous: it starts in the
 * safety band with the nose past the plane, is pulled toward the centre with at
 * least one scrape event, and docks. `dockCount === 1` and `scrapeTicks > 0`
 * are what stop an all-docked or never-docked replay from passing on hash
 * equality alone.
 */

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  DT,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
} from "../../src/sim/time.js";
import { laveDockGeometry, placeShipInPortFrame } from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const geometry = laveDockGeometry();

const TARGET_STEPS = 1200; // 10 s at 1/120 s

/** Start in the band: offset +x, nose 10 m past the plane, moving inward. */
function bandApproach(): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.dockArmed = true;
  const pose = placeShipInPortFrame(layout, geometry, {
    nosePastPlane: 10,
    rollFromMatched: 0,
    lateral: 35,
    forwardSpeed: 20,
  });
  state.position = pose.position;
  state.orientation = pose.orientation;
  state.speed = pose.speed;
  return state;
}

function runToSteps(state: FlightState, frames: readonly number[]): number {
  let accumulator = 0;
  let steps = 0;
  let frameIndex = 0;

  while (steps < TARGET_STEPS) {
    if (frameIndex >= frames.length) {
      throw new Error("frame list exhausted before target step count");
    }
    accumulator += Math.min(frames[frameIndex++] ?? 0, MAX_FRAME_DELTA);

    let stepsThisFrame = 0;
    while (
      accumulator >= DT &&
      stepsThisFrame < MAX_STEPS_PER_FRAME &&
      steps < TARGET_STEPS
    ) {
      stepFlight(
        state,
        layout,
        config,
        ZERO_INTENT,
        [],
        DT,
        { dock: geometry },
      );
      accumulator -= DT;
      steps += 1;
      stepsThisFrame += 1;
    }
    if (stepsThisFrame === MAX_STEPS_PER_FRAME) accumulator = 0;
  }

  return steps;
}

function replay(hz: number): FlightState {
  const state = bandApproach();
  const frames = Array.from(
    { length: Math.ceil((TARGET_STEPS / 120) * hz) + 10 },
    () => 1 / hz,
  );
  const steps = runToSteps(state, frames);
  if (steps !== TARGET_STEPS) {
    throw new Error(`cadence ${hz} ran ${steps} steps`);
  }
  return state;
}

describe("docking cross-cadence determinism", () => {
  it("hashes identically at 60, 120 and 144 Hz and actually docks after scraping", () => {
    const states = [60, 120, 144].map(replay);
    const hashes = new Set(states.map((state) => hashFlight(state)));
    expect(hashes.size).toBe(1);

    for (const state of states) {
      expect(state.dockCount).toBe(1);
      expect(state.scrapeTicks).toBeGreaterThan(0);
      expect(state.mode).toBe("docked");
    }
  });
});
