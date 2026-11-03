// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted launch (FLGT-01, T-3-25).
 *
 * Three things are pinned that a "looks plausible" implementation can get
 * wrong:
 *
 * 1. The +600 s clock advance happens exactly once, on the step that begins the
 *    launch, and a second launch is ignored.
 * 2. The ship leaves from the dock mouth (station centre + `dockOffset` along
 *    `stationToPlanet`) at half its top speed, not from the station centre.
 * 3. The launch-roll **sign**. The ship must roll with the slot in the same
 *    world sense as `stationAngle`, so the station-relative angle stays ~0.
 *    A steady slot and a ship counter-rotating at the station rate are both
 *    computed from the same helper and asserted to violate the bound; neither
 *    can pass by accident.
 *
 * `launchSeen` is a settings concern (D-10), not sim state: the sim applies
 * `skipLaunch` when told to and the caller owns the "after the first viewing"
 * gate. The test records that the sim has no such field.
 */

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import type { FlightConfig } from "../../src/sim/flight/config.js";
import {
  dockMouthPosition,
  initFlightState,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  axisAngle,
  length,
  mul,
  normalizeVec,
  rotate,
  sub,
  vec,
} from "../../src/sim/math.js";
import type { Quat, Vec3 } from "../../src/sim/math.js";
import { DT } from "../../src/sim/step.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";

const LAUNCH_STEPS = 240; // exactly 2 s at 1/120 s

/** The station's world pose after `angle` radians about its local +Z. */
function stationQuatAt(base: Quat, angle: number): Quat {
  return mul(base, axisAngle(0, 0, 1, angle));
}

/** The shortest-arc rotation angle between two unit quaternions, in radians. */
function relativeAngle(a: Quat, b: Quat): number {
  const dot = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z);
  return 2 * Math.acos(Math.min(1, dot));
}

function launch(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
): void {
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
}

function expectVecClose(actual: Vec3, expected: Vec3, digits: number): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

describe("scripted launch", () => {
  const fixture = laveFixture();

  it("advances the clock by exactly 600 seconds and increments launchCount once", () => {
    const state = initFlightState(fixture.layout);
    const clockBefore = state.clockSeconds;

    const events = stepFlight(
      state,
      fixture.layout,
      fixture.config,
      ZERO_INTENT,
      [{ kind: "launch" }],
      DT,
    );

    expect(state.mode).toBe("launching");
    expect(state.launchCount).toBe(1);
    expect(state.clockSeconds - clockBefore).toBe(600);
    expect(events.map((event) => event.kind)).toContain("launched");
  });

  it("leaves the ship exactly at the dock mouth at the launch speed", () => {
    const state = initFlightState(fixture.layout);
    launch(state, fixture.layout, fixture.config);

    expect(state.position).toEqual(dockMouthPosition(fixture.layout));
    expect(
      length(sub(state.position, fixture.layout.station.position)),
    ).toBeCloseTo(fixture.layout.dockOffset, 9);
    expectVecClose(
      normalizeVec(sub(state.position, fixture.layout.station.position)),
      fixture.layout.stationToPlanet,
      9,
    );
    expect(state.speed).toBe(fixture.config.launchSpeed);
    expect(state.orientation).toEqual(fixture.layout.stationBaseQuat);
    expect(state.pitchRate).toBe(0);
    expect(state.rollRate).toBe(fixture.layout.stationRollRadPerSec);
  });

  it("ignores a second launch while launching and while in flight", () => {
    const state = initFlightState(fixture.layout);
    launch(state, fixture.layout, fixture.config);

    const clockBefore = state.clockSeconds;
    const events = stepFlight(
      state,
      fixture.layout,
      fixture.config,
      ZERO_INTENT,
      [{ kind: "launch" }],
      DT,
    );
    expect(state.launchCount).toBe(1);
    expect(state.mode).toBe("launching");
    expect(events.map((event) => event.kind)).not.toContain("launched");
    // Only the normal clock advance for a launching step, never a second +600.
    // The clock is ~1.8e11 s, so one ULP is ~3e-5 s and the delta is not
    // exactly DT; the point is that it is a step, not ten minutes.
    const clockAdvance = state.clockSeconds - clockBefore;
    expect(clockAdvance).toBeGreaterThan(0);
    expect(clockAdvance).toBeLessThan(1);

    for (let step = 0; step < LAUNCH_STEPS; step += 1) {
      stepFlight(state, fixture.layout, fixture.config, ZERO_INTENT, [], DT);
    }
    expect(state.mode).toBe("inFlight");

    stepFlight(
      state,
      fixture.layout,
      fixture.config,
      ZERO_INTENT,
      [{ kind: "launch" }],
      DT,
    );
    expect(state.launchCount).toBe(1);
    expect(state.mode).toBe("inFlight");
  });

  it("hands over to flight after exactly two seconds", () => {
    const state = initFlightState(fixture.layout);
    launch(state, fixture.layout, fixture.config);
    expect(state.mode).toBe("launching");

    for (let step = 0; step < LAUNCH_STEPS; step += 1) {
      stepFlight(state, fixture.layout, fixture.config, ZERO_INTENT, [], DT);
    }

    expect(state.mode).toBe("inFlight");
    expect(state.launchElapsed).toBe(2);
    expect(state.rollRate).toBe(0);
    expect(state.pitchRate).toBe(0);
  });

  it("applies skipLaunch immediately; the caller owns the launchSeen gate", () => {
    const state = initFlightState(fixture.layout);
    launch(state, fixture.layout, fixture.config);

    // The sim does not persist the "first viewing" flag; the app session does.
    expect(Object.hasOwn(state, "launchSeen")).toBe(false);

    const events = stepFlight(
      state,
      fixture.layout,
      fixture.config,
      ZERO_INTENT,
      [{ kind: "skipLaunch" }],
      DT,
    );

    expect(state.mode).toBe("inFlight");
    expect(state.launchElapsed).toBe(2);
    expect(state.rollRate).toBe(0);
    expect(events.map((event) => event.kind)).toContain("launchComplete");
  });

  it("rolls with the slot: the world-sense sign is the only one that passes", () => {
    const state = initFlightState(fixture.layout);
    const rate = fixture.layout.stationRollRadPerSec;
    launch(state, fixture.layout, fixture.config);
    expect(state.rollRate).toBe(rate);

    for (let step = 0; step < LAUNCH_STEPS; step += 1) {
      // The rate the ship actually applied during this step. The handover step
      // zeroes `rollRate` at its end, so it must be captured before stepping.
      const rollRateDuringStep = state.rollRate;
      const angleBefore = state.stationAngle;

      stepFlight(state, fixture.layout, fixture.config, ZERO_INTENT, [], DT);

      const stationAngleRate = (state.stationAngle - angleBefore) / DT;
      expect(
        Math.abs(rollRateDuringStep - stationAngleRate),
        `step ${String(step)}: the ship roll rate must equal the station world roll rate`,
      ).toBeLessThan(1e-9);

      const stationQuat = stationQuatAt(
        fixture.layout.stationBaseQuat,
        state.stationAngle,
      );
      expect(
        relativeAngle(state.orientation, stationQuat),
        `step ${String(step)}: the ship must stay aligned with the slot`,
      ).toBeLessThan(1e-6);

      // The world sense: both roll about the same local +Z axis, so the axis
      // vector is invariant under the roll in either pose.
      const shipAxis = rotate(state.orientation, vec(0, 0, 1));
      const stationAxis = rotate(stationQuat, vec(0, 0, 1));
      expect(length(sub(shipAxis, stationAxis))).toBeLessThan(1e-9);
    }

    expect(state.mode).toBe("inFlight");

    // Wrong case 1: a ship that does not roll. The slot turns under it, so the
    // 2 s relative angle is one station quarter-turn (0.2513 rad).
    const noRollRelative = relativeAngle(
      fixture.layout.stationBaseQuat,
      stationQuatAt(fixture.layout.stationBaseQuat, rate * 2),
    );
    expect(noRollRelative).toBeCloseTo(0.251_327_412_287_183_47, 9);
    expect(noRollRelative).toBeGreaterThan(1e-6);

    // Wrong case 2: a ship counter-rotating at the station rate. The relative
    // motion is doubled, so the 2 s relative angle is 0.5027 rad. (The plan's
    // "doubled counter-rotation" names this doubled *relative* rate, not a ship
    // rolling at 2x in the same direction, which would also fail.)
    const counterRotation = mul(
      fixture.layout.stationBaseQuat,
      axisAngle(0, 0, 1, -rate * 2),
    );
    const counterRelative = relativeAngle(
      counterRotation,
      stationQuatAt(fixture.layout.stationBaseQuat, rate * 2),
    );
    expect(counterRelative).toBeCloseTo(0.502_654_824_574_366_9, 9);
    expect(counterRelative).toBeGreaterThan(1e-6);
  });
});
