// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Phase 3 tracer proof, without a browser.
 *
 * One playable path: new game at Lave -> docked -> launch (+600 s exactly once)
 * -> fly. It uses the real committed content through `laveFixture()` and the
 * real `stepFlight`, so the numbers below are the shipped ones, not test
 * placeholders.
 */

import { describe, expect, it } from "vitest";

import {
  PlayerController,
  flightView,
} from "../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../src/sim/flight/controller.js";
import {
  dockMouthPosition,
  initFlightState,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  dot,
  identity,
  length,
  normalizeVec,
  rotate,
  sub,
  vec,
} from "../../src/sim/math.js";
import type { InputFrame } from "../../src/sim/state.js";
import { DT } from "../../src/sim/time.js";
import type { Command } from "../../src/sim/commands.js";
import { laveFixture, scriptedFrame } from "../helpers/lave.js";

const { layout, config } = laveFixture();
const player = new PlayerController();

function step(
  state: FlightState,
  frame: InputFrame,
  commands: readonly Command[] = [],
): void {
  const intent: ControlIntent = player.update(flightView(state), frame);
  stepFlight(state, layout, config, intent, commands, DT);
}

/** Launch and skip straight into `inFlight` for the flight-model tests. */
function flyingState(): FlightState {
  const state = initFlightState(layout);
  step(state, scriptedFrame(0, 0, 0), [{ kind: "launch" }]);
  step(state, scriptedFrame(0, 0, 0), [{ kind: "skipLaunch" }]);
  return state;
}

describe("Lave layout", () => {
  it("places the planet, station and sun at the authored positions", () => {
    expect(layout.planet.position).toEqual(vec(0, 0, -452_760));
    expect(layout.planet.radius).toBe(41_160);

    expect(layout.station.position.x).toBeCloseTo(-49_474.32, 6);
    expect(layout.station.position.y).toBeCloseTo(60_752.16, 6);
    expect(layout.station.position.z).toBeCloseTo(-427_652.4, 6);

    expect(layout.sun.position.x).toBeCloseTo(-783_274.8, 3);
    expect(layout.sun.position.y).toBeCloseTo(-340_475.52, 3);
    expect(layout.sun.position.z).toBeCloseTo(-755_203.68, 3);
    expect(layout.sun.radius).toBeCloseTo(84_449.095_459, 6);
  });

  it("uses the authored, non-unit vectors for positions", () => {
    // Not 82,320: the authored station vector is 0.99943484 long.
    expect(
      length(sub(layout.planet.position, layout.station.position)),
    ).toBeCloseTo(82_273.476_053_270_03, 6);
    expect(
      length(sub(layout.sun.position, layout.planet.position)),
    ).toBeCloseTo(906_043.691_885_911_6, 6);
  });

  it("derives the station roll in rad/s from right-angles per second", () => {
    expect(layout.stationRollRadPerSec).toBeCloseTo(
      0.125_663_706_143_591_74,
      12,
    );
    expect(layout.dockOffset).toBe(500.256_1);
  });

  it("puts the nav buoy 10 km from the station along stationToPlanet", () => {
    const offset = sub(layout.navBuoy.position, layout.station.position);
    expect(length(offset)).toBeCloseTo(10_000, 6);
    expect(dot(normalizeVec(offset), layout.stationToPlanet)).toBeCloseTo(
      1,
      12,
    );
    expect(layout.witchpoint.position).toEqual(vec(0, 0, 0));
  });
});

describe("launch", () => {
  it("transitions docked -> launching with exactly +600 s", () => {
    const state = initFlightState(layout);
    const startClock = state.clockSeconds;
    expect(state.mode).toBe("docked");

    step(state, scriptedFrame(0, 0, 0), [{ kind: "launch" }]);

    expect(state.mode).toBe("launching");
    expect(state.clockSeconds).toBe(startClock + 600);
    expect(state.launchCount).toBe(1);
    expect(state.speed).toBe(175);
    expect(state.position).toEqual(dockMouthPosition(layout));
    expect(state.orientation).toEqual(layout.stationBaseQuat);
  });

  it("ignores a second launch and ignores pilot input while launching", () => {
    const state = initFlightState(layout);
    const startClock = state.clockSeconds;
    step(state, scriptedFrame(0, 0, 0), [{ kind: "launch" }]);

    step(state, scriptedFrame(1, 1, 1), [{ kind: "launch" }]);

    expect(state.launchCount).toBe(1);
    // One more fixed step of clock, and no second +600.
    expect(state.clockSeconds).toBe(startClock + 600 + DT);
    expect(state.pitchRate).toBe(0);
    expect(state.rollRate).toBe(layout.stationRollRadPerSec);
  });

  it("hands over to flight after two seconds", () => {
    const state = initFlightState(layout);
    step(state, scriptedFrame(0, 0, 0), [{ kind: "launch" }]);
    for (let index = 0; index < 240; index += 1) {
      step(state, scriptedFrame(0, 0, 0));
    }
    expect(state.mode).toBe("inFlight");
    expect(state.launchElapsed).toBeGreaterThanOrEqual(2);
    expect(state.rollRate).toBe(0);
  });
});

describe("flight", () => {
  it("moves along the dock direction with a finite, capped speed", () => {
    const state = initFlightState(layout);
    step(state, scriptedFrame(0, 0, 0), [{ kind: "launch" }]);
    for (let index = 0; index < 240; index += 1) {
      step(state, scriptedFrame(0, 0, 0));
    }

    expect(state.mode).toBe("inFlight");
    expect(Number.isFinite(state.speed)).toBe(true);
    expect(state.speed).toBeLessThanOrEqual(350);

    const travelled = sub(state.position, dockMouthPosition(layout));
    expect(length(travelled)).toBeGreaterThan(0);
    expect(dot(normalizeVec(travelled), layout.stationToPlanet)).toBeCloseTo(
      1,
      6,
    );
  });

  it("accelerates at 160 u/s^2 and clamps at 350", () => {
    const state = flyingState();
    expect(state.speed).toBe(175);

    for (let index = 0; index < 120; index += 1) {
      step(state, scriptedFrame(0, 0, 1));
    }
    expect(state.speed).toBeCloseTo(335, 6);

    for (let index = 0; index < 240; index += 1) {
      step(state, scriptedFrame(0, 0, 1));
    }
    expect(state.speed).toBe(350);

    for (let index = 0; index < 300; index += 1) {
      step(state, scriptedFrame(0, 0, -1));
    }
    expect(state.speed).toBe(0);
  });

  it("rolls starboard-wing-down and keeps a unit quaternion", () => {
    const state = flyingState();
    // A known starting attitude isolates the roll sign from the dock heading.
    state.orientation = identity();
    state.rollRate = 0;

    for (let index = 0; index < 12; index += 1) {
      step(state, scriptedFrame(0, 1, 0));
    }

    const { w, x, y, z } = state.orientation;
    expect(Math.hypot(w, x, y, z)).toBeCloseTo(1, 12);
    expect(rotate(state.orientation, vec(1, 0, 0)).y).toBeLessThan(0);
  });

  it("has no yaw field or yaw axis", () => {
    const state = flyingState();
    expect("yaw" in state).toBe(false);
    expect("yawRate" in state).toBe(false);
  });

  it("turns the direction of travel immediately (no drift)", () => {
    const state = flyingState();
    // Pitch up for a second, then coast: travel must follow the new forward.
    for (let index = 0; index < 120; index += 1) {
      step(state, scriptedFrame(1, 0, 0));
    }
    const before = state.position;
    step(state, scriptedFrame(0, 0, 0));
    const travel = sub(state.position, before);
    const forward = rotate(state.orientation, vec(0, 0, -1));
    expect(dot(normalizeVec(travel), forward)).toBeCloseTo(1, 6);
  });
});
