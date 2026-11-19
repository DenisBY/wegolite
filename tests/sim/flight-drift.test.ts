// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's drift (CBT-18, D-02).
 *
 * Oolite's player has a Newtonian `velocity` beside the scalar `flightSpeed`:
 * every in-flight update moves the position by it (`applyVelocity:`,
 * `Entity.m:878-881`) and then power-brakes it by the raw catalogue `thrust`
 * times the torus factor, with an extra cleanup term above 2,000 m/s
 * (`PlayerEntity.m:3346-3348, 3374-3405`). These hand cases are written from
 * the C; `player-braking.oracle.test.ts` holds the port to the 18-03 fixtures.
 */

import { describe, expect, it } from "vitest";

import { deriveFlightConfig } from "../../src/sim/flight/config.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import {
  brakePlayerDrift,
  VELOCITY_CLEANUP_FULL,
  VELOCITY_CLEANUP_MIN,
  VELOCITY_CLEANUP_RATE,
} from "../../src/sim/flight/drift.js";
import { sanitizeFlightState } from "../../src/sim/flight/sanitize.js";
import {
  initFlightState,
  serializeFlight,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { add, length, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { MAX_ENTITY_VELOCITY } from "../../src/sim/world/limits.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;

/** The Cobra's raw `thrust` (shipdata.plist), not `thrustAccel` (5 x thrust). */
const COBRA_THRUST = 32;

/** An in-flight state at rest (engine speed 0) at the dock mouth. */
function restingInFlight(): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  // Well clear of the station, so no dock geometry is involved.
  state.position = add(state.position, vec(0, 50_000, 0));
  return state;
}

function step(state: FlightState): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, ZERO_INTENT, [], DT);
}

describe("brakePlayerDrift (PlayerEntity.m:3385-3404)", () => {
  it("exports Oolite's cleanup constants", () => {
    expect(VELOCITY_CLEANUP_MIN).toBe(2000);
    expect(VELOCITY_CLEANUP_FULL).toBe(5000);
    expect(VELOCITY_CLEANUP_RATE).toBe(0.001);
  });

  it("removes dt x thrust per tick at factor 1", () => {
    const next = brakePlayerDrift(vec(100, 0, 0), DT, COBRA_THRUST, 1);
    expect(next.x).toBeCloseTo(100 - 32 / 120, 4);
    expect(next.y).toBe(0);
    expect(next.z).toBe(0);
  });

  it("multiplies the brake by the torus factor (32 x 32 / 120 per tick)", () => {
    const next = brakePlayerDrift(vec(0, 0, -200), DT, COBRA_THRUST, 32);
    expect(-next.z).toBeCloseTo(200 - (32 * 32) / 120, 3);
  });

  it("adds the scaled cleanup term between 2,000 and 5,000 m/s", () => {
    const next = brakePlayerDrift(vec(3000, 0, 0), DT, COBRA_THRUST, 1);
    const loss = 32 / 120 + 3000 * (1000 / 3000) * 0.001;
    expect(3000 - next.x).toBeCloseTo(loss, 3);
  });

  it("adds the full cleanup rate above 5,000 m/s", () => {
    const next = brakePlayerDrift(vec(0, 6000, 0), DT, COBRA_THRUST, 1);
    const loss = 32 / 120 + 6000 * 0.001;
    expect(6000 - next.y).toBeCloseTo(loss, 2);
  });

  it("keeps the direction of an oblique drift", () => {
    const drift = vec(30, -40, 0);
    const next = brakePlayerDrift(drift, DT, COBRA_THRUST, 1);
    expect(length(next)).toBeCloseTo(50 - 32 / 120, 4);
    expect(next.x / next.y).toBeCloseTo(-0.75, 6);
  });

  it("returns exactly zero when the brake exceeds the speed", () => {
    expect(brakePlayerDrift(vec(0.1, 0, 0), DT, COBRA_THRUST, 1)).toEqual(
      vec(0, 0, 0),
    );
  });

  it("zeroes a drift whose float32 magnitude is 0 (review L174)", () => {
    // 1e-30 is a float32 value, but its square underflows the float32 range,
    // so Oolite's magnitude reads 0 and would never brake it.
    const next = brakePlayerDrift(vec(1e-30, 0, 0), DT, COBRA_THRUST, 1);
    expect(next).toEqual(vec(0, 0, 0));
  });
});

describe("the drift in the flight step", () => {
  it("moves the position by drift x dt, then brakes it", () => {
    const state = restingInFlight();
    const start = state.position;
    state.drift = vec(100, 0, 0);

    step(state);

    expect(state.speed).toBe(0);
    expect(state.position.x - start.x).toBeCloseTo(100 / 120, 9);
    expect(state.position.y).toBe(start.y);
    expect(state.drift.x).toBeCloseTo(100 - 32 / 120, 4);
  });

  it("brings a 100 m/s drift to rest within a tick of the exact 375 and keeps it there", () => {
    const state = restingInFlight();
    state.drift = vec(100, 0, 0);

    let stopTick: number | null = null;
    for (let tick = 1; tick <= 400; tick += 1) {
      step(state);
      if (stopTick === null && state.drift.x === 0) stopTick = tick;
    }

    expect(stopTick).not.toBeNull();
    expect(Math.abs((stopTick ?? 0) - 375)).toBeLessThanOrEqual(1);
    expect(state.drift).toEqual(vec(0, 0, 0));
    expect(serializeFlight(state)).not.toContain("drift=");
  });

  it("brakes by the torus factor while the speed is above maxSpeed", () => {
    const state = restingInFlight();
    // Far from every body: the drive engages and no mass lock interferes.
    state.position = vec(4e8, 4e8, 4e8);
    state.speed = config.maxSpeed * 32;
    state.torus = { engaged: true, factor: 32, massLocked: false, lastFactor: 32 };
    const drift = vec(0, 0, 500);
    state.drift = drift;

    step(state);

    expect(state.speed).toBeGreaterThan(config.maxSpeed);
    expect(state.torus.engaged).toBe(true);
    expect(state.torus.factor).toBeGreaterThanOrEqual(32);
    expect(state.drift).toEqual(
      brakePlayerDrift(drift, DT, COBRA_THRUST, state.torus.factor),
    );
    expect(500 - state.drift.z).toBeGreaterThan((32 * 32) / 120 - 1e-3);
  });

  it("leaves a zero drift at zero and moves nothing", () => {
    const a = restingInFlight();
    const b = restingInFlight();
    step(a);
    step(b);
    expect(a.drift).toEqual(vec(0, 0, 0));
    expect(serializeFlight(a)).toBe(serializeFlight(b));
  });

  it("clears a float32-underflow drift so no drift line lingers", () => {
    const state = restingInFlight();
    state.drift = vec(0, 0, 1e-30);
    step(state);
    expect(state.drift).toEqual(vec(0, 0, 0));
    expect(serializeFlight(state)).not.toContain("drift=");
  });
});

describe("drift in the serialized flight (criterion 5)", () => {
  it("prints no drift line for a zero drift", () => {
    const state = initFlightState(layout);
    expect(state.drift).toEqual(vec(0, 0, 0));
    expect(serializeFlight(state)).not.toContain("drift");
    expect(serializeFlight(state).split("\n").at(-1)).toMatch(/^repairCount=/);
  });

  it("appends exactly one drift line, last, for a non-zero drift", () => {
    const state = initFlightState(layout);
    const base = serializeFlight(state);
    state.drift = vec(1.5, 0, -2);
    expect(serializeFlight(state)).toBe(`${base}\ndrift=1.5,0,-2`);
  });
});

describe("drift repair (T-18-23)", () => {
  function sanitized(drift: Vec3): FlightState {
    const state = restingInFlight();
    state.drift = drift;
    sanitizeFlightState(state, layout, config);
    return state;
  }

  it("turns a non-finite drift into zero, as a repair", () => {
    const state = sanitized(vec(Number.NaN, 1, 2));
    expect(state.drift).toEqual(vec(0, 0, 0));
    expect(state.repairCount).toBe(1);
    expect(sanitized(vec(0, Number.POSITIVE_INFINITY, 0)).drift).toEqual(
      vec(0, 0, 0),
    );
  });

  it("clamps each component at MAX_ENTITY_VELOCITY", () => {
    const state = sanitized(vec(1e9, -1e9, 3));
    expect(MAX_ENTITY_VELOCITY).toBe(1e4);
    expect(state.drift).toEqual(vec(1e4, -1e4, 3));
    expect(state.repairCount).toBe(1);
  });

  it("leaves a legitimate drift alone", () => {
    const state = sanitized(vec(68, 0, -12));
    expect(state.drift).toEqual(vec(68, 0, -12));
    expect(state.repairCount).toBe(0);
  });
});

describe("the flight config", () => {
  it("exposes the raw thrust beside thrustAccel", () => {
    const derived = deriveFlightConfig(fixture.playerDef);
    expect(derived.thrust).toBe(COBRA_THRUST);
    expect(derived.thrustAccel).toBe(160);
  });
});
