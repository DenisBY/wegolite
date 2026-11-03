// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Aristotelian speed (FLGT-03, T-3-07).
 *
 * 160 u/s^2, the 350 cap, the 0 floor, and the defining property: the position
 * advances along the ship's *current* forward vector, so a turn changes the
 * direction of travel on the next step and no lateral velocity persists.
 */

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  axisAngle,
  dot,
  identity,
  normalizeVec,
  rotate,
  sub,
  vec,
} from "../../src/sim/math.js";
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

describe("speed curve", () => {
  it("derives 160 u/s^2 and a 350 cap from the player catalogue", () => {
    expect(config.thrustAccel).toBe(160);
    expect(config.maxSpeed).toBe(350);
  });

  it("reaches 160 u/s after one second and 350 after 2.1875 s", () => {
    const state = flyingState();
    state.speed = 0;

    steps(state, intent({ speed: 1 }), 120);
    expect(state.speed).toBeCloseTo(160, 6);

    // 350 / 160 = 2.1875 s = 262.5 fixed steps. After 262 steps the speed is
    // 349.333..., and the 263rd clamps at 350.
    steps(state, intent({ speed: 1 }), 142);
    expect(state.speed).toBeCloseTo(349.333_333_333_333_3, 6);
    step(state, intent({ speed: 1 }));
    expect(state.speed).toBe(350);
  });

  it("holds 350 while accelerating and floors at 0 while decelerating", () => {
    const state = flyingState();
    state.speed = 350;
    steps(state, intent({ speed: 1 }), 300);
    expect(state.speed).toBe(350);

    steps(state, intent({ speed: -1 }), 300);
    expect(state.speed).toBe(0);
  });

  it("advances exactly forward * speed * dt each step", () => {
    const state = flyingState();
    state.orientation = identity();
    state.speed = 100;
    // Measure at the origin: at Lave's 4.3e5 m station coordinate one float64
    // ULP is ~6e-11 m, which would mask the exact per-step delta.
    state.position = vec(0, 0, 0);

    const before = state.position;
    step(state, ZERO_INTENT);
    const delta = sub(state.position, before);

    expect(delta.x).toBeCloseTo(0, 12);
    expect(delta.y).toBeCloseTo(0, 12);
    expect(delta.z).toBeCloseTo(-100 * DT, 12);
  });
});

describe("no lateral velocity", () => {
  it("changes the direction of travel on the next step after a 90 degree pitch", () => {
    const state = flyingState();
    state.speed = 100;
    // +90 degrees about local +X maps forward (0,0,-1) to +Y.
    state.orientation = axisAngle(1, 0, 0, Math.PI / 2);

    const before = state.position;
    step(state, ZERO_INTENT);
    const delta = sub(state.position, before);
    const forward = rotate(state.orientation, vec(0, 0, -1));

    expect(dot(normalizeVec(delta), forward)).toBeCloseTo(1, 9);
    expect(delta.x).toBeCloseTo(0, 9);
    expect(delta.y).toBeGreaterThan(0);
    expect(delta.z).toBeCloseTo(0, 9);
    expect("velocity" in state).toBe(false);
  });

  it("keeps speed, position and orientation finite after 100,000 steps", () => {
    const state = flyingState();

    for (let index = 0; index < 100_000; index += 1) {
      step(
        state,
        intent({
          pitch: index % 7 === 0 ? 1 : -0.25,
          roll: index % 5 === 0 ? 1 : -1,
          speed: index % 11 === 0 ? -1 : 1,
        }),
      );
    }

    expect(Number.isFinite(state.speed)).toBe(true);
    expect(state.speed).toBeGreaterThanOrEqual(0);
    expect(state.speed).toBeLessThanOrEqual(config.maxSpeed);
    expect(Number.isFinite(state.position.x)).toBe(true);
    expect(Number.isFinite(state.position.y)).toBe(true);
    expect(Number.isFinite(state.position.z)).toBe(true);
    const { w, x, y, z } = state.orientation;
    expect(Math.hypot(w, x, y, z)).toBeCloseTo(1, 12);
  });
});
