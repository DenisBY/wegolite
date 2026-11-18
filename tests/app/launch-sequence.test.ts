// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch skip gate and its exactly-once clock (D-10, FLGT-01).
 *
 * The skip gate is driven by fixed steps, never wall time. The clock proof
 * runs the real simulation step, because the +600 s adjustment belongs to
 * `beginLaunch` — the app must never add a second one.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createLaunchSequence } from "../../src/app/launch-sequence.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { LAUNCH_DURATION } from "../../src/sim/flight/launch.js";
import {
  NEW_GAME_CLOCK_SECONDS,
  initFlightState,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { DT } from "../../src/sim/time.js";
import type { Command } from "../../src/sim/commands.js";
import { laveFixture } from "../helpers/lave.js";

const { layout, config } = laveFixture();

const launchSequenceSource = readFileSync(
  new URL("../../src/app/launch-sequence.ts", import.meta.url),
  "utf8",
);

/** Drop comment-only lines so documentation cannot satisfy an assertion. */
function stripComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

function step(state: FlightState, commands: readonly Command[] = []): void {
  stepFlight(state, layout, config, ZERO_INTENT, commands, DT);
}

function launchedState(): FlightState {
  const state = initFlightState(layout);
  step(state, [{ kind: "launch" }]);
  return state;
}

function playToHandover(state: FlightState): number {
  let steps = 0;
  while (state.mode === "launching" && steps < 1_000) {
    step(state);
    steps += 1;
  }
  return steps;
}

describe("launch skip gate", () => {
  it("runs for two seconds of fixed steps", () => {
    const sequence = createLaunchSequence();
    let steps = 0;
    while (!sequence.complete && steps < 1_000) {
      sequence.advance(DT, false);
      steps += 1;
    }
    expect(sequence.complete).toBe(true);
    // 240 steps of 1/120 s; the tolerance is the float64 sum, not a fudge.
    expect(steps).toBe(Math.round(LAUNCH_DURATION / DT));
    expect(sequence.elapsed).toBeCloseTo(LAUNCH_DURATION, 9);
  });

  it("ignores a skip before the first viewing", () => {
    const sequence = createLaunchSequence();
    expect(sequence.canSkip(false)).toBe(false);
    sequence.advance(DT, true);
    expect(sequence.complete).toBe(false);
    expect(sequence.elapsed).toBeCloseTo(DT, 12);
  });

  it("skips at t=0 after the first viewing", () => {
    const sequence = createLaunchSequence();
    sequence.markSeen();
    expect(sequence.canSkip(true)).toBe(true);
    sequence.advance(0, true);
    expect(sequence.complete).toBe(true);
    expect(sequence.elapsed).toBe(LAUNCH_DURATION);
  });

  it("marks seen only when markSeen is called, never on completion", () => {
    const sequence = createLaunchSequence();
    while (!sequence.complete) sequence.advance(DT, false);
    expect(sequence.seen).toBe(false);
    sequence.markSeen();
    expect(sequence.seen).toBe(true);
  });

  it("keeps `seen` across a reset", () => {
    const sequence = createLaunchSequence();
    sequence.markSeen();
    sequence.advance(0, true);
    sequence.reset();
    expect(sequence.elapsed).toBe(0);
    expect(sequence.complete).toBe(false);
    expect(sequence.seen).toBe(true);
  });
});

describe("launch clock", () => {
  it("adds exactly 600 s on the launch step and not on the next one", () => {
    const state = launchedState();
    expect(state.mode).toBe("launching");
    expect(state.launchCount).toBe(1);
    expect(state.clockSeconds).toBe(NEW_GAME_CLOCK_SECONDS + 600);

    step(state);
    // Flight time still advances while launching; the *adjustment* is once.
    expect(state.clockSeconds).toBeCloseTo(
      NEW_GAME_CLOCK_SECONDS + 600 + DT,
      9,
    );
  });

  it("does not add a second 600 s when the launch is skipped", () => {
    const state = launchedState();
    step(state, [{ kind: "skipLaunch" }]);
    expect(state.mode).toBe("inFlight");
    expect(state.clockSeconds).toBeCloseTo(
      NEW_GAME_CLOCK_SECONDS + 600 + DT,
      9,
    );
  });

  it("does not add a second 600 s when the launch plays out", () => {
    const state = launchedState();
    const steps = playToHandover(state);
    expect(state.mode).toBe("inFlight");
    expect(steps).toBe(Math.round(LAUNCH_DURATION / DT));
    // Only the two seconds of launching are added on top of the +600. The
    // accumulated sum is rounded against a 1.8e11 clock (ULP ~3e-5), so the
    // bound is on the adjustment, not a bit-exact sum.
    const adjustment = state.clockSeconds - (NEW_GAME_CLOCK_SECONDS + 600);
    expect(adjustment).toBeGreaterThan(LAUNCH_DURATION - 0.01);
    expect(adjustment).toBeLessThan(LAUNCH_DURATION + 0.01);
  });

  it("ignores a second launch while launching and in flight", () => {
    const state = launchedState();
    step(state, [{ kind: "launch" }]);
    expect(state.launchCount).toBe(1);
    step(state, [{ kind: "skipLaunch" }]);
    step(state, [{ kind: "launch" }]);
    expect(state.mode).toBe("inFlight");
    expect(state.launchCount).toBe(1);
    expect(state.clockSeconds).toBeCloseTo(
      NEW_GAME_CLOCK_SECONDS + 600 + 3 * DT,
      9,
    );
  });
});

describe("launch-sequence determinism", () => {
  it("contains no wall clock", () => {
    const code = stripComments(launchSequenceSource);
    expect(code.length).toBeGreaterThan(1_000);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bperformance\b/);
    expect(code).not.toMatch(/\bDate\.now\b|\bnew Date\b/);
  });
});
