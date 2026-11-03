// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The attitude model (FLGT-02, T-3-08).
 *
 * Pins Oolite's player keyboard path exactly: 4 rad/s^2 roll and 2 rad/s^2
 * pitch ramps, 2 and 1 rad/s caps, 1.0 rad/s^2 damping, a reversal that zeroes
 * before ramping, the 0.5 precision modifier, and roll-then-pitch composition
 * with no yaw axis. The roll sign is a probe, not a comment: a positive roll
 * must put the starboard (+X) wing down.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { identity, rotate, vec } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;

function flyingState(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  return state;
}

function intent(overrides: Partial<ControlIntent>): ControlIntent {
  return { ...ZERO_INTENT, ...overrides };
}

function step(state: FlightState, control: ControlIntent): void {
  stepFlight(state, layout, config, control, [], DT);
}

function steps(
  state: FlightState,
  control: ControlIntent,
  count: number,
): void {
  for (let index = 0; index < count; index += 1) step(state, control);
}

/** Source text with comments removed, so a doc sentence cannot satisfy a scan. */
function executableSource(relativePath: string): string {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("roll and pitch ramps", () => {
  it("ramps roll at 4 rad/s^2: 0.1 s -> 0.4 rad/s", () => {
    const state = flyingState();
    steps(state, intent({ roll: 1 }), 12);
    expect(state.rollRate).toBeCloseTo(0.4, 12);
  });

  it("clamps roll at 2 rad/s after one second", () => {
    const state = flyingState();
    steps(state, intent({ roll: 1 }), 120);
    expect(state.rollRate).toBe(2);
  });

  it("ramps pitch at 2 rad/s^2 and clamps at 1 rad/s", () => {
    const state = flyingState();
    steps(state, intent({ pitch: 1 }), 12);
    expect(state.pitchRate).toBeCloseTo(0.2, 12);
    steps(state, intent({ pitch: 1 }), 108);
    expect(state.pitchRate).toBe(1);
  });

  it("damps a released rate at 1.0 rad/s^2 to exactly zero", () => {
    const state = flyingState();
    steps(state, intent({ roll: 1 }), 120);
    expect(state.rollRate).toBe(2);

    steps(state, ZERO_INTENT, 120);
    expect(state.rollRate).toBeCloseTo(1, 12);

    steps(state, ZERO_INTENT, 120);
    // Float64 accumulation leaves a ~5e-15 residual after exactly 2 s; the
    // damping rate (not the residual) is what a wrong implementation changes.
    expect(Math.abs(state.rollRate)).toBeLessThan(1e-12);
  });

  it("zeroes the rate before ramping on a reversal", () => {
    const state = flyingState();
    steps(state, intent({ roll: 1 }), 12);
    expect(state.rollRate).toBeCloseTo(0.4, 12);

    step(state, intent({ roll: -1 }));
    // Not 0.4 - 4 * DT: the keyboard path zeroes first, then ramps one step.
    expect(state.rollRate).toBeCloseTo(-config.rollAccel * DT, 12);

    step(state, intent({ roll: -1 }));
    expect(state.rollRate).toBeCloseTo(-2 * config.rollAccel * DT, 12);
  });

  it("never lets a rate exceed its cap, even after releasing precision", () => {
    const state = flyingState();
    steps(state, intent({ roll: 1 }), 120);
    expect(state.rollRate).toBe(2);

    // Precision halves the target, but the existing rate is only allowed to
    // decay at the ramp rate: it is never above the hard cap.
    step(state, intent({ roll: 1, precision: true }));
    expect(state.rollRate).toBeLessThanOrEqual(config.maxRoll);
    expect(state.rollRate).toBeGreaterThan(
      config.maxRoll * config.precisionFactor,
    );
  });
});

describe("precision modifier", () => {
  it("halves both targets", () => {
    const rollState = flyingState();
    steps(rollState, intent({ roll: 1, precision: true }), 120);
    expect(rollState.rollRate).toBe(1);

    const pitchState = flyingState();
    steps(pitchState, intent({ pitch: 1, precision: true }), 120);
    expect(pitchState.pitchRate).toBe(0.5);
  });
});

describe("orientation", () => {
  it("puts the starboard wing down for a positive roll", () => {
    const state = flyingState();
    state.orientation = identity();
    state.rollRate = 0;

    steps(state, intent({ roll: 1 }), 12);

    expect(rotate(state.orientation, vec(1, 0, 0)).y).toBeLessThan(0);
  });

  it("composes roll then pitch and stays unit length after 10,000 steps", () => {
    const state = flyingState();
    state.orientation = identity();

    for (let index = 0; index < 10_000; index += 1) {
      step(
        state,
        intent({
          pitch: index % 3 === 0 ? 1 : -0.5,
          roll: index % 2 === 0 ? 1 : -1,
        }),
      );
    }

    const { w, x, y, z } = state.orientation;
    expect(Math.hypot(w, x, y, z)).toBeCloseTo(1, 12);
  });

  it("has no yaw field and no yaw axis in the module source", () => {
    const state = flyingState();
    expect("yaw" in state).toBe(false);
    expect("yawRate" in state).toBe(false);

    const source = executableSource("../../src/sim/flight/attitude.ts");
    expect(source.length).toBeGreaterThan(500);
    expect(source).not.toMatch(/yaw/i);
    expect(source).not.toMatch(/axisAngle\(\s*0\s*,\s*1\s*,\s*0/);
  });
});
