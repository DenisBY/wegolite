// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The torus drive and mass lock (FLGT-04, T-3-07, Pitfall 8).
 *
 * Every case is a boundary: the factor at its `32`/`1024` caps, mass lock at
 * the station/planet/sun thresholds, the 1024x per-step displacement, and the
 * deceleration multiplier after an input vs a mass-lock disengage. The teleport
 * point used by the browser proof is pinned here first, including the wrong-sign
 * counter-value, so a sign error fails before Chromium starts.
 */

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  SCANNER_MAX_RANGE,
  TORUS_MAX_FACTOR,
  TORUS_MIN_FACTOR,
  engageTorus,
  massLocked,
  nearestSurfaceDistance,
  torusFactor,
} from "../../src/sim/flight/torus.js";
import { add, identity, length, scale, sub, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import type { Command } from "../../src/sim/commands.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;

/** 120 km from the station, away from the planet: outside every lock sphere. */
const TORUS_TEST_POINT: Vec3 = sub(
  layout.station.position,
  scale(layout.stationToPlanet, 120_000),
);

/** The sign-error counter-value: 120 km *toward* the planet. */
const WRONG_SIGN_POINT: Vec3 = add(
  layout.station.position,
  scale(layout.stationToPlanet, 120_000),
);

const ENGAGED_FACTOR = torusFactor(
  nearestSurfaceDistance(TORUS_TEST_POINT, layout),
);

function flightStep(
  state: FlightState,
  intent: ControlIntent = ZERO_INTENT,
  commands: readonly Command[] = [],
): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, intent, commands, DT);
}

/** Launch, skip the cinematic, and land in `inFlight`. */
function flyingState(): FlightState {
  const state = initFlightState(layout);
  flightStep(state, ZERO_INTENT, [{ kind: "launch" }]);
  flightStep(state, ZERO_INTENT, [{ kind: "skipLaunch" }]);
  return state;
}

/** Teleport to the mass-lock-free point and engage with `j`. */
function engagedState(): FlightState {
  const state = flyingState();
  state.position = TORUS_TEST_POINT;
  state.speed = config.maxSpeed;
  flightStep(state, ZERO_INTENT, [{ kind: "toggleTorus" }]);
  expect(state.torus.engaged).toBe(true);
  return state;
}

function distanceTo(position: Vec3, body: Vec3): number {
  return length(sub(position, body));
}

describe("torus factor", () => {
  it("pins the boundary table: 0/102400/409600/104857600 -> 32/32/64/1024", () => {
    const table: readonly (readonly [number, number])[] = [
      [0, 32],
      [102_400, 32],
      [409_600, 64],
      [104_857_600, 1024],
    ];
    for (const [distance, expected] of table) {
      expect(torusFactor(distance), `factor at ${String(distance)} m`).toBe(
        expected,
      );
    }
  });

  it("is monotonic non-decreasing and stays inside [32, 1024]", () => {
    let previous = TORUS_MIN_FACTOR;
    for (let distance = 0; distance <= 1_200_000; distance += 10_000) {
      const factor = torusFactor(distance);
      expect(Number.isFinite(factor)).toBe(true);
      expect(factor).toBeGreaterThanOrEqual(TORUS_MIN_FACTOR);
      expect(factor).toBeLessThanOrEqual(TORUS_MAX_FACTOR);
      expect(factor).toBeGreaterThanOrEqual(previous);
      previous = factor;
    }
  });

  it("uses the scanner range constant the config derives (25,600)", () => {
    expect(SCANNER_MAX_RANGE).toBe(25_600);
    expect(config.scannerRange).toBe(SCANNER_MAX_RANGE);
  });
});

describe("mass lock boundaries", () => {
  it("locks the station at 25,599 and 25,600 m and clears at 25,601 m", () => {
    for (const [distance, expected] of [
      [25_599, true],
      [25_600, true],
      [25_601, false],
    ] as const) {
      const point = sub(
        layout.station.position,
        scale(layout.stationToPlanet, distance),
      );
      expect(
        massLocked(point, layout),
        `station distance ${String(distance)} m`,
      ).toBe(expected);
    }
  });

  it("locks the planet strictly inside 2r and clears at and beyond 2r", () => {
    const radius = layout.planet.radius;
    for (const [distance, expected] of [
      [2 * radius - 1, true],
      [2 * radius, false],
      [2 * radius + 1, false],
    ] as const) {
      const point = add(layout.planet.position, vec(distance, 0, 0));
      expect(
        massLocked(point, layout),
        `planet distance ${String(distance)} m`,
      ).toBe(expected);
    }
  });

  it("locks the sun strictly inside sqrt(2)r and clears at and beyond it", () => {
    const radius = layout.sun.radius;
    const threshold = Math.sqrt(2) * radius;
    for (const [distance, expected] of [
      [threshold - 1, true],
      [threshold + 1, false],
    ] as const) {
      const point = add(layout.sun.position, vec(distance, 0, 0));
      expect(
        massLocked(point, layout),
        `sun distance ${String(distance)} m`,
      ).toBe(expected);
    }
  });

  it("keeps the 25 km surface rule in the squared comparison", () => {
    // Lave's planet is large enough that 2r dominates the 25 km rule
    // (r + 25 km = 66,160 m < 2r = 82,320 m), so these points are locked by
    // both branches. The assertions still pin the surface rule's radius, which
    // a typo in the squared form would move.
    const planetRadius = layout.planet.radius;
    for (const offset of [-1, 0, 1]) {
      const point = add(
        layout.planet.position,
        vec(planetRadius + 25_000 + offset, 0, 0),
      );
      expect(massLocked(point, layout)).toBe(true);
    }
    const sunRadius = layout.sun.radius;
    for (const offset of [-1, 0, 1]) {
      const point = add(
        layout.sun.position,
        vec(sunRadius + 25_000 + offset, 0, 0),
      );
      expect(massLocked(point, layout)).toBe(true);
    }
  });

  it("never locks on a buoy, even when it is the nearest body", () => {
    // With Lave's real geometry every point within 25,600 m of the buoy is also
    // inside the planet/station lock, so a synthetic layout is required to
    // prove the buoy branch is a no-op. The real buoy still counts for the
    // torus factor (see the next assertion).
    const far = vec(1e9, 0, 0);
    const buoyOnly = {
      ...layout,
      planet: { position: far, radius: 1 },
      sun: { position: far, radius: 1 },
      station: { position: far, radius: 1 },
      witchpoint: { position: far, radius: 1 },
      navBuoy: { position: vec(0, 0, 0), radius: 10 },
    };
    expect(massLocked(vec(0, 0, 0), buoyOnly)).toBe(false);
    expect(nearestSurfaceDistance(vec(0, 0, 0), buoyOnly)).toBe(0);

    // The real buoy is a nearest-surface candidate for the factor.
    expect(nearestSurfaceDistance(layout.navBuoy.position, layout)).toBe(0);
  });

  it("does not lock at the witchpoint or at the torus teleport point", () => {
    expect(massLocked(layout.witchpoint.position, layout)).toBe(false);
    expect(massLocked(TORUS_TEST_POINT, layout)).toBe(false);
  });
});

describe("torus teleport point", () => {
  it("is 120 km from the station away from the planet", () => {
    expect(TORUS_TEST_POINT.x).toBeCloseTo(-121_635.102_366_311_97, 6);
    expect(TORUS_TEST_POINT.y).toBeCloseTo(149_362.238_845_820_7, 6);
    expect(TORUS_TEST_POINT.z).toBeCloseTo(-391_031.703_458_028_1, 6);
  });

  it("is outside every mass-lock sphere with the researched distances", () => {
    expect(massLocked(TORUS_TEST_POINT, layout)).toBe(false);

    expect(distanceTo(TORUS_TEST_POINT, layout.station.position)).toBeCloseTo(
      120_000,
      6,
    );
    expect(distanceTo(TORUS_TEST_POINT, layout.planet.position)).toBeCloseTo(
      202_273.476_053_270_05,
      6,
    );
    expect(
      distanceTo(TORUS_TEST_POINT, layout.planet.position) -
        layout.planet.radius,
    ).toBeCloseTo(161_113.476_053_270_05, 6);
    expect(distanceTo(TORUS_TEST_POINT, layout.sun.position)).toBeCloseTo(
      900_182.952_501_535_2,
      6,
    );
    expect(
      distanceTo(TORUS_TEST_POINT, layout.sun.position) - layout.sun.radius,
    ).toBeCloseTo(815_733.857_042_535_2, 6);
    expect(distanceTo(TORUS_TEST_POINT, layout.navBuoy.position)).toBeCloseTo(
      130_000,
      6,
    );
    expect(length(TORUS_TEST_POINT)).toBeCloseTo(435_901.330_153_954_04, 6);
  });

  it("rejects the sign error that puts the ship 3,433 m inside the planet", () => {
    expect(massLocked(WRONG_SIGN_POINT, layout)).toBe(true);
    const planetDistance = distanceTo(WRONG_SIGN_POINT, layout.planet.position);
    expect(planetDistance).toBeLessThan(layout.planet.radius);
    expect(layout.planet.radius - planetDistance).toBeCloseTo(3_433.476, 2);
  });

  it("has the researched torus factor at that point", () => {
    expect(ENGAGED_FACTOR).toBeCloseTo(34.568_772_034_887_2, 9);
    expect(torusFactor(nearestSurfaceDistance(TORUS_TEST_POINT, layout))).toBe(
      ENGAGED_FACTOR,
    );
  });
});

describe("engaging and disengaging", () => {
  it("engages only when clear and reports the factor", () => {
    const state = flyingState();
    state.position = TORUS_TEST_POINT;
    state.speed = config.maxSpeed;

    const events = flightStep(state, ZERO_INTENT, [{ kind: "toggleTorus" }]);

    expect(state.torus.engaged).toBe(true);
    expect(state.torus.massLocked).toBe(false);
    expect(state.torus.factor).toBeCloseTo(ENGAGED_FACTOR, 9);
    expect(state.torus.lastFactor).toBeCloseTo(ENGAGED_FACTOR, 9);
    expect(events).toContainEqual({
      kind: "torusEngaged",
      factor: ENGAGED_FACTOR,
    });
    // The speed step ran after the torus step: the target is above 350.
    expect(state.speed).toBeGreaterThan(config.maxSpeed);
  });

  it("refuses `j` while mass-locked and never sets engaged", () => {
    // The dock mouth is 500.2561 m from the station centre: locked.
    const state = flyingState();
    const events = flightStep(state, ZERO_INTENT, [{ kind: "toggleTorus" }]);

    expect(state.torus.engaged).toBe(false);
    expect(state.torus.massLocked).toBe(true);
    expect(events).toContainEqual({
      kind: "torusDisengaged",
      reason: "massLock",
    });
  });

  it("recomputes the factor every tick as the ship leaves a body", () => {
    const state = engagedState();
    const firstFactor = state.torus.factor;

    // Move 400 km away from the station, still clear of every lock.
    state.position = sub(
      layout.station.position,
      scale(layout.stationToPlanet, 400_000),
    );
    flightStep(state);

    expect(state.torus.engaged).toBe(true);
    expect(state.torus.factor).toBeCloseTo(63.206_012_372_241_93, 6);
    expect(state.torus.factor).toBeGreaterThan(firstFactor);
  });

  it("disengages on any pitch/roll/speed input with a finite deceleration", () => {
    const state = engagedState();
    state.speed = 5_000;

    const events = flightStep(state, { ...ZERO_INTENT, pitch: 1 });

    expect(state.torus.engaged).toBe(false);
    expect(state.torus.lastFactor).toBeCloseTo(ENGAGED_FACTOR, 9);
    expect(events).toContainEqual({ kind: "torusDisengaged", reason: "input" });
    // No snap to 350: one input-deceleration step only.
    expect(state.speed).toBeGreaterThan(config.maxSpeed);
    expect(state.speed).toBeLessThan(5_000);

    const before = state.speed;
    flightStep(state);
    const deceleration = before - state.speed;
    expect(deceleration).toBeCloseTo(
      config.thrustAccel * ENGAGED_FACTOR * DT,
      6,
    );
  });

  it("decelerates three times faster after a mass-lock disengage", () => {
    const state = engagedState();
    state.speed = 20_000;
    state.position = layout.station.position;

    const events = flightStep(state);

    expect(state.torus.engaged).toBe(false);
    expect(state.torus.massLocked).toBe(true);
    expect(state.torus.lastFactor).toBeCloseTo(ENGAGED_FACTOR, 9);
    expect(events.map((event) => event.kind)).toEqual([
      "massLockChanged",
      "torusDisengaged",
    ]);
    expect(events[1]).toEqual({
      kind: "torusDisengaged",
      reason: "massLock",
    });

    const deceleration = 20_000 - state.speed;
    expect(deceleration).toBeCloseTo(
      config.thrustAccel * ENGAGED_FACTOR * 3 * DT,
      6,
    );
    expect(state.speed).toBeGreaterThan(config.maxSpeed);
  });

  it("disengages on a `j` toggle and preserves lastFactor", () => {
    const state = engagedState();
    state.speed = 5_000;

    const events = flightStep(state, ZERO_INTENT, [{ kind: "toggleTorus" }]);

    expect(state.torus.engaged).toBe(false);
    expect(state.torus.factor).toBe(1);
    expect(state.torus.lastFactor).toBeCloseTo(ENGAGED_FACTOR, 9);
    expect(events).toContainEqual({
      kind: "torusDisengaged",
      reason: "toggle",
    });
  });

  it("disengages before integrating when a lock is discovered mid-tick", () => {
    const state = engagedState();
    state.speed = 12_000;
    state.position = layout.station.position;

    flightStep(state);

    // The disengage happened in the torus step, before the position update:
    // the ship moved at the *decelerated* speed, not at the 12,000 u/s target.
    const moved = length(sub(state.position, layout.station.position));
    expect(moved).toBeCloseTo(state.speed * DT, 6);
    expect(state.speed).toBeLessThan(12_000);
    expect(moved).toBeLessThan(12_000 * DT);
    expect(state.torus.engaged).toBe(false);
    expect(state.torus.lastFactor).toBeCloseTo(ENGAGED_FACTOR, 9);
  });
});

describe("torus integration safety", () => {
  it("moves 350 * 1024 / 120 = 2986.666... m in one step at the cap", () => {
    const state = flyingState();
    state.position = vec(2e9, 0, 0);
    state.orientation = identity();
    state.torus.engaged = true;
    state.torus.factor = TORUS_MAX_FACTOR;
    state.torus.lastFactor = TORUS_MAX_FACTOR;
    state.speed = config.maxSpeed * TORUS_MAX_FACTOR;

    flightStep(state);

    expect(state.torus.factor).toBe(TORUS_MAX_FACTOR);
    expect(state.speed).toBe(config.maxSpeed * TORUS_MAX_FACTOR);
    expect(state.position.x).toBe(2e9);
    expect(state.position.y).toBe(0);
    expect(state.position.z).toBeCloseTo(-2_986.666_666_666_666_5, 6);
    expect(Number.isFinite(state.position.z)).toBe(true);
  });

  it("keeps speed, factor and position finite at every reachable Lave distance", () => {
    for (let distance = 0; distance <= 1_200_000; distance += 50_000) {
      const factor = torusFactor(distance);
      expect(Number.isFinite(factor)).toBe(true);
      expect(Number.isFinite(config.maxSpeed * factor)).toBe(true);
      expect(Number.isFinite((config.maxSpeed * factor) / 120)).toBe(true);
    }
  });

  it("rejects a zero, negative or non-finite dt without advancing the tick", () => {
    const state = flyingState();
    const tick = state.tick;
    const position = state.position;

    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        stepFlight(state, layout, config, ZERO_INTENT, [], dt),
      ).toThrow(/positive finite dt/);
    }

    expect(state.tick).toBe(tick);
    expect(state.position).toEqual(position);
  });

  it("clamps a non-finite speed to zero instead of poisoning the position", () => {
    const state = flyingState();
    state.speed = Number.NaN;

    flightStep(state);

    expect(state.speed).toBe(0);
    expect(Number.isFinite(state.position.x)).toBe(true);
    expect(Number.isFinite(state.position.y)).toBe(true);
    expect(Number.isFinite(state.position.z)).toBe(true);
  });

  it("exposes engageTorus as the same decision the step uses", () => {
    const state = flyingState();
    state.position = TORUS_TEST_POINT;
    const result = engageTorus(state, layout);
    expect(result).toEqual({
      engaged: true,
      factor: ENGAGED_FACTOR,
      massLocked: false,
    });
  });
});
