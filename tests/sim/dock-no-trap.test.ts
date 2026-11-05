// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The no-trap oracle (DOCK-03, DOCK-06, D-07, D-09, T-04-39, T-04-40).
 *
 * The property is deliberately stronger than "mode is inFlight and the
 * position is finite": it also asserts non-penetration after a hull response,
 * one response per tick, outward separation from a standing start, and that the
 * ship can still move afterwards. The deterministic seeds at the bottom are the
 * adversarial cases the property generator is unlikely to reach; every seed is
 * recorded here for replay.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { classifyCorridor, dockSnapshot } from "../../src/sim/dock/corridor.js";
import { obbsIntersect } from "../../src/sim/dock/hull.js";
import { stepDocking } from "../../src/sim/dock/step.js";
import type { ControlIntent } from "../../src/sim/flight/controller.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  add,
  dot,
  length,
  normalize,
  quat,
  sub,
  vec,
} from "../../src/sim/math.js";
import type { Quat, Vec3 } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
  type PortPose,
} from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const geometry = laveDockGeometry();

function inFlightAt(pose: PortPose): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.dockArmed = true;
  state.position = pose.position;
  state.orientation = pose.orientation;
  state.speed = pose.speed;
  return state;
}

function step(
  state: FlightState,
  intent: ControlIntent = ZERO_INTENT,
): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, intent, [], DT, { dock: geometry });
}

function assertFiniteState(state: FlightState): void {
  for (const value of [
    state.position.x,
    state.position.y,
    state.position.z,
    state.orientation.w,
    state.orientation.x,
    state.orientation.y,
    state.orientation.z,
    state.speed,
    state.impulse.x,
    state.impulse.y,
    state.impulse.z,
    state.stationAngle,
  ]) {
    expect(Number.isFinite(value)).toBe(true);
  }
}

function randomQuatArbitrary(): fc.Arbitrary<Quat> {
  return fc
    .tuple(
      fc.double({ min: -1, max: 1, noNaN: true }),
      fc.double({ min: -1, max: 1, noNaN: true }),
      fc.double({ min: -1, max: 1, noNaN: true }),
      fc.double({ min: -1, max: 1, noNaN: true }),
    )
    .map(([w, x, y, z]) => normalize(quat(w, x, y, z)));
}

function offsetArbitrary(): fc.Arbitrary<Vec3> {
  return fc
    .tuple(
      fc.double({ min: -1500, max: 1500, noNaN: true }),
      fc.double({ min: -1500, max: 1500, noNaN: true }),
      fc.double({ min: -1500, max: 1500, noNaN: true }),
    )
    .map(([x, y, z]) => vec(x, y, z));
}

const intentArbitrary: fc.Arbitrary<ControlIntent> = fc
  .tuple(
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
  )
  .map(([pitch, roll, speed]) => ({
    ...ZERO_INTENT,
    pitch,
    roll,
    speed,
  }));

describe("the no-trap property", () => {
  it("never leaves the mode, finiteness, one-response or separation invariants", () => {
    fc.assert(
      fc.property(
        offsetArbitrary(),
        randomQuatArbitrary(),
        intentArbitrary,
        (offset, orientation, intent) => {
          const state = initFlightState(layout);
          state.mode = "inFlight";
          state.dockArmed = true;
          state.position = add(layout.station.position, offset);
          state.orientation = orientation;

          let previousBounces = state.bounceCount;
          for (let tick = 0; tick < 2000; tick += 1) {
            if (state.mode !== "inFlight") break;
            const events = step(state, intent);

            expect(state.mode === "inFlight" || state.mode === "docked").toBe(
              true,
            );
            assertFiniteState(state);

            const bounces = events.filter((event) => event.kind === "bounce");
            expect(bounces.length).toBeLessThanOrEqual(1);
            expect(state.bounceCount - previousBounces).toBe(bounces.length);

            const hullBounce = bounces.find(
              (event) => event.kind === "bounce" && event.cause === "hull",
            );
            if (hullBounce !== undefined) {
              // A hull response resolves the overlap by construction.
              expect(
                obbsIntersect(
                  dockSnapshot(layout, state, geometry, state.stationAngle),
                  geometry.contactPort,
                ),
              ).toBe(false);
            }
            previousBounces = state.bounceCount;
          }

          // The ship can still move after any resolution: an away-direction
          // intent changes the position within 30 ticks.
          if (state.mode === "inFlight") {
            const before = state.position;
            const away = { ...ZERO_INTENT, speed: 1 };
            for (let tick = 0; tick < 30 && state.mode === "inFlight"; tick += 1) {
              step(state, away);
            }
            expect(length(sub(state.position, before))).toBeGreaterThan(0);
          }
        },
      ),
      // Every seed is recorded for replay. 30 runs of up to 2000 ticks keeps
      // the file well inside the 60 s bound.
      { seed: 20261105, numRuns: 30 },
    );
  }, 60_000);
});

describe("adversarial seeds", () => {
  // seed 20261105 is the property seed; the cases below are the ones it is
  // unlikely to generate but that must never trap.

  it("seed: a zero-speed straddle still separates outward", () => {
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: 10,
        rollFromMatched: Math.PI / 2,
      }),
    );
    state.speed = 0;

    const before = dockSnapshot(layout, state, geometry, state.stationAngle);
    expect(classifyCorridor(before, geometry).outcome).toBe("straddle");

    const events = stepDocking(state, layout, geometry, DT);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "bounce", cause: "straddle" });
    expect(state.mode).toBe("inFlight");
    expect(state.bounceCount).toBe(1);
    expect(dot(state.impulse, before.frame.k)).toBeGreaterThanOrEqual(8 - 1e-9);
    const after = dockSnapshot(layout, state, geometry, state.stationAngle);
    expect(after.box.min.z).toBeGreaterThanOrEqual(-1e-6);
  });

  it("seed: a straddle-plus-hull pose produces exactly one response", () => {
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: 10,
        rollFromMatched: Math.PI / 2,
        forwardSpeed: 100,
      }),
    );
    const before = dockSnapshot(layout, state, geometry, state.stationAngle);
    expect(classifyCorridor(before, geometry).outcome).toBe("straddle");
    expect(obbsIntersect(before, geometry.contactPort)).toBe(true);

    const events = stepDocking(state, layout, geometry, DT);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "bounce", cause: "straddle" });
    expect(state.bounceCount).toBe(1);
    // The reflection of 100 m/s inward at e = 0.5 is 50 m/s outward.
    expect(dot(state.impulse, before.frame.k)).toBeCloseTo(50, 6);
    expect(state.speed).toBe(0);
  });

  it("seed: a deep centre outside the corridor is pushed out in one tick", () => {
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: 300,
        lateral: 300,
        rollFromMatched: 0,
      }),
    );
    const before = dockSnapshot(layout, state, geometry, state.stationAngle);
    expect(obbsIntersect(before, geometry.contactPort)).toBe(true);

    const events = step(state);

    expect(events.filter((event) => event.kind === "bounce")).toHaveLength(1);
    expect(state.mode).toBe("inFlight");
    expect(state.bounceCount).toBe(1);
    expect(
      obbsIntersect(
        dockSnapshot(layout, state, geometry, state.stationAngle),
        geometry.contactPort,
      ),
    ).toBe(false);
  });
});

describe("scrape accounting", () => {
  it("increments scrapeTicks exactly once per emitted scrape event", () => {
    const state = inFlightAt(
      placeShipInPortFrame(layout, geometry, {
        nosePastPlane: 10,
        rollFromMatched: 0,
        lateral: 35,
        forwardSpeed: 20,
      }),
    );

    let scrapeEvents = 0;
    for (let tick = 0; tick < 400 && state.mode === "inFlight"; tick += 1) {
      const events = step(state);
      scrapeEvents += events.filter((event) => event.kind === "scrape").length;
    }

    expect(scrapeEvents).toBeGreaterThan(0);
    expect(state.scrapeTicks).toBe(scrapeEvents);
    expect(state.mode).toBe("docked");
  });
});
