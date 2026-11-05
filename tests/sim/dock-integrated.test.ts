// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The integrated manual-docking phase gate (DOCK-03, DOCK-04, DOCK-06, D-07,
 * D-09, T-04-54).
 *
 * One test drives the real `stepFlight` through the whole chain the cross-AI
 * review asked for: launch, a response-free straight departure, an off-axis
 * contact, a retry, and the dock. It fails if the nose gate is removed (the
 * wings-across departure would straddle as soon as the latch arms) or if the
 * latch arms at `box.min.z >= 0` instead of `> contactPort.zMax` (the arming
 * tick would still overlap the proxy and the hull SAT would fire).
 *
 * The second scenario is the Space-skipped launch, whose handover has no
 * `STATUS_LAUNCHING` status: every tick through and past the arming tick must
 * stay response-free.
 */

import { describe, expect, it } from "vitest";

import { dockSnapshot } from "../../src/sim/dock/corridor.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { vec } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
} from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const geometry = laveDockGeometry();

function step(state: FlightState): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, ZERO_INTENT, [], DT, {
    dock: geometry,
  });
}

function containsBounce(events: ReturnType<typeof stepFlight>): boolean {
  return events.some((event) => event.kind === "bounce");
}

function launchNaturally(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT, {
    dock: geometry,
  });
  let sawBounce = false;
  for (let tick = 0; tick < 400 && state.mode === "launching"; tick += 1) {
    sawBounce ||= containsBounce(step(state));
  }
  expect(state.mode).toBe("inFlight");
  expect(sawBounce).toBe(false);
  return state;
}

describe("integrated manual docking chain", () => {
  it("launches, departs cleanly, bounces once off-axis, retries and docks", () => {
    const state = launchNaturally();

    // A further two seconds of straight departure must stay response-free and
    // the latch must flip only once the box is past the proxy's outward face.
    let armedAtTick = -1;
    for (let tick = 0; tick < 240; tick += 1) {
      const events = step(state);
      expect(containsBounce(events)).toBe(false);
      expect(state.bounceCount).toBe(0);
      expect(state.mode).toBe("inFlight");
      if (armedAtTick < 0 && state.dockArmed) {
        armedAtTick = tick;
        const snapshot = dockSnapshot(
          layout,
          state,
          geometry,
          state.stationAngle,
        );
        expect(snapshot.box.min.z).toBeGreaterThan(geometry.contactPort.zMax);
      }
    }
    expect(armedAtTick).toBeGreaterThanOrEqual(0);

    // Wings across, nose 10 m past the plane: the opposite-edge straddle.
    const offAxis = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: 10,
      rollFromMatched: Math.PI / 2,
      forwardSpeed: 60,
      stationAngle: state.stationAngle,
    });
    state.position = offAxis.position;
    state.orientation = offAxis.orientation;
    state.speed = offAxis.speed;
    state.impulse = vec(0, 0, 0);

    const bounceEvents: ReturnType<typeof stepFlight> = [];
    for (let tick = 0; tick < 10 && state.bounceCount === 0; tick += 1) {
      bounceEvents.push(...step(state));
    }

    expect(
      bounceEvents.filter((event) => event.kind === "bounce"),
    ).toHaveLength(1);
    expect(state.bounceCount).toBe(1);
    expect(state.mode).toBe("inFlight");
    expect(state.dockCount).toBe(0);

    // Retry immediately from an aligned, centred pose. The retreat is skipped
    // deliberately: it may legitimately contact the 34 m-deep proxy again.
    const retry = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: 90,
      rollFromMatched: 0,
      stationAngle: state.stationAngle,
    });
    state.position = retry.position;
    state.orientation = retry.orientation;
    state.speed = 0;

    for (let tick = 0; tick < 10 && state.mode === "inFlight"; tick += 1) {
      step(state);
    }

    expect(state.dockCount).toBe(1);
    expect(state.bounceCount).toBe(1);
    expect(state.mode).toBe("docked");
  });
});

describe("integrated skipped-launch chain", () => {
  it("hands over at the mouth and never emits a contact response", () => {
    const state = initFlightState(layout);
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT, {
      dock: geometry,
    });
    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "skipLaunch" }],
      DT,
      { dock: geometry },
    );
    expect(state.mode).toBe("inFlight");
    expect(state.dockArmed).toBe(false);

    let armed = false;
    for (let tick = 0; tick < 600 && !armed; tick += 1) {
      const events = step(state);
      expect(containsBounce(events)).toBe(false);
      expect(state.bounceCount).toBe(0);
      if (state.dockArmed) {
        armed = true;
        const snapshot = dockSnapshot(
          layout,
          state,
          geometry,
          state.stationAngle,
        );
        expect(snapshot.box.min.z).toBeGreaterThan(geometry.contactPort.zMax);
      }
    }
    expect(armed).toBe(true);

    // At least 0.5 s past the arming tick (the latch is about 0.41 s out).
    for (let tick = 0; tick < 60; tick += 1) {
      const events = step(state);
      expect(containsBounce(events)).toBe(false);
      expect(state.bounceCount).toBe(0);
    }
    expect(state.mode).toBe("inFlight");
  });
});
