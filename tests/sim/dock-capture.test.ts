// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Corridor capture and the arming latch (DOCK-01, DOCK-02, DOCK-04, D-03, D-04).
 *
 * These tests pin the two failure modes a "looks plausible" implementation
 * misses:
 *
 * 1. a perfectly aligned, centred, correctly rolled approach must dock on the
 *    weighted-plane tick and land on the exact docked pose;
 * 2. the latch must be reachable after a launch — both the natural two-second
 *    exit and the Space-skipped handover — without either departure producing a
 *    scrape or a dock.
 *
 * Speed is deliberately absent: the same capture-plane pose docks at rest, at
 * the normal cap and at the torus cap (D-04).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { DockPort } from "../../src/content/schemas/dock-port.js";
import { classifyCorridor, dockSnapshot } from "../../src/sim/dock/corridor.js";
import {
  createDockGeometry,
  DockGeometryError,
  type DockGeometry,
} from "../../src/sim/dock/geometry.js";
import { stepDocking } from "../../src/sim/dock/step.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import {
  dockMouthPosition,
  initFlightState,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { DT } from "../../src/sim/time.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
  type PortPose,
} from "../helpers/dock-pose.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const geometry = laveDockGeometry();

const raw = JSON.parse(
  readFileSync(
    new URL("../../src/content/generated/dock-port.json", import.meta.url),
    "utf8",
  ),
) as DockPort;

function inFlightAt(pose: PortPose): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.position = pose.position;
  state.orientation = pose.orientation;
  state.speed = pose.speed;
  return state;
}

function step(
  state: FlightState,
  commands: readonly { kind: "launch" | "skipLaunch" }[] = [],
): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, ZERO_INTENT, commands, DT, {
    dock: geometry,
  });
}

function alignedPose(nosePastPlane: number): PortPose {
  return placeShipInPortFrame(layout, geometry, {
    nosePastPlane,
    rollFromMatched: 0,
    lateral: 0,
    forwardSpeed: 0,
  });
}

function outcomeAt(
  state: FlightState,
  stationAngle: number,
  dockGeometry: DockGeometry = geometry,
  systemLayout: SystemLayout = layout,
): string {
  return classifyCorridor(
    dockSnapshot(systemLayout, state, dockGeometry, stationAngle),
    dockGeometry,
  ).outcome;
}

describe("manual docking capture", () => {
  it("docks an aligned centred approach on the weighted-plane tick with exact pose equality", () => {
    const state = inFlightAt(alignedPose(90));

    // One tick before the plane: weighted 0.9*36.37 + 0.1*(-45) > 0, so lane.
    const early = inFlightAt(alignedPose(45));
    const earlyEvents = step(early);
    expect(early.mode).toBe("inFlight");
    expect(earlyEvents.map((event) => event.kind)).not.toContain("docked");
    expect(earlyEvents.map((event) => event.kind)).not.toContain("scrape");
    expect(outcomeAt(early, early.stationAngle)).toBe("lane");

    const events = step(state);
    expect(state.mode).toBe("docked");
    expect(state.dockCount).toBe(1);
    expect(state.position).toEqual(dockMouthPosition(layout));
    expect(state.orientation).toEqual(layout.stationBaseQuat);
    expect(events).toContainEqual({
      kind: "docked",
      via: "manual",
      clockDelta: 0,
    });
  });

  it("advances the capture tick by exactly one step on every clock", () => {
    const state = inFlightAt(alignedPose(90));
    const before = {
      tick: state.tick,
      clockSeconds: state.clockSeconds,
      flightTime: state.flightTime,
      stationAngle: state.stationAngle,
    };
    const rollRate = layout.stationRollRadPerSec;

    step(state);

    expect(state.tick).toBe(before.tick + 1);
    // The state update is `+=`, so the post-state is exactly the pre-state plus
    // the same float64 expression (the absorbed ULP is the same on both sides).
    expect(state.clockSeconds).toBe(before.clockSeconds + DT);
    expect(state.flightTime).toBe(before.flightTime + DT);
    expect(state.stationAngle).toBe(before.stationAngle + rollRate * DT);
    expect(state.mode).toBe("docked");
  });

  it("does not self-dock a natural launch and arms after the whole box clears the proxy", () => {
    const state = initFlightState(layout);
    step(state, [{ kind: "launch" }]);
    expect(state.mode).toBe("launching");
    expect(state.dockArmed).toBe(false);

    for (let tick = 0; tick < 240; tick += 1) {
      step(state);
    }

    expect(state.mode).toBe("inFlight");
    expect(state.dockArmed).toBe(true);
    expect(state.dockCount).toBe(0);
    expect(state.scrapeTicks).toBe(0);

    // The wings-across launch pose at ~350 m out is outside, never a straddle.
    for (let tick = 0; tick < 5; tick += 1) {
      const outcome = outcomeAt(state, state.stationAngle);
      expect(outcome).toBe("outside");
      step(state);
    }
    expect(state.dockCount).toBe(0);
  });

  it("keeps a skipped launch disarmed until box.min.z > contactPort.zMax, then docks only on the return", () => {
    const state = initFlightState(layout);
    step(state, [{ kind: "launch" }]);
    const skipEvents = step(state, [{ kind: "skipLaunch" }]);
    expect(state.mode).toBe("inFlight");
    expect(state.dockArmed).toBe(false);
    expect(skipEvents.map((event) => event.kind)).not.toContain("docked");
    expect(skipEvents.map((event) => event.kind)).not.toContain("scrape");

    let armedAtTick = -1;
    let sawResponse = false;

    for (let tick = 0; tick < 600 && armedAtTick < 0; tick += 1) {
      const snapshot = dockSnapshot(
        layout,
        state,
        geometry,
        state.stationAngle,
      );
      expect(state.dockArmed).toBe(false);
      // While disarmed the box must still overlap (or sit behind) the proxy's
      // outward face; that is exactly why the latch may not be set.
      expect(snapshot.box.min.z).toBeLessThanOrEqual(geometry.contactPort.zMax);

      const events = step(state);
      for (const event of events) {
        if (event.kind === "scrape" || event.kind === "docked") {
          sawResponse = true;
        }
      }
      if (state.dockArmed) {
        armedAtTick = tick;
        const armedSnapshot = dockSnapshot(
          layout,
          state,
          geometry,
          state.stationAngle,
        );
        expect(armedSnapshot.box.min.z).toBeGreaterThan(
          geometry.contactPort.zMax,
        );
      }
    }

    expect(armedAtTick).toBeGreaterThanOrEqual(0);
    expect(sawResponse).toBe(false);
    expect(state.dockCount).toBe(0);
    expect(state.scrapeTicks).toBe(0);

    // Continue outbound past the arming tick: still no response.
    for (let tick = 0; tick < 20; tick += 1) {
      const events = step(state);
      expect(events.map((event) => event.kind)).not.toContain("scrape");
      expect(events.map((event) => event.kind)).not.toContain("docked");
    }
    expect(state.dockArmed).toBe(true);
    expect(state.dockCount).toBe(0);

    // Deliberate aligned return approach docks exactly once, in the current
    // station phase (the port frame has rolled since the handover).
    const returnPose = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: 90,
      rollFromMatched: 0,
      lateral: 0,
      forwardSpeed: 0,
      stationAngle: state.stationAngle,
    });
    state.position = returnPose.position;
    state.orientation = returnPose.orientation;
    state.speed = 0;
    const dockEvents = step(state);
    expect(state.mode).toBe("docked");
    expect(state.dockCount).toBe(1);
    expect(dockEvents).toContainEqual({
      kind: "docked",
      via: "manual",
      clockDelta: 0,
    });
  });

  it("clears the latch immediately on beginLaunch", () => {
    const state = initFlightState(layout);
    expect(state.dockArmed).toBe(true);
    step(state, [{ kind: "launch" }]);
    expect(state.dockArmed).toBe(false);
    expect(state.dockCount).toBe(0);
  });

  it("converts the contact proxy into the port frame once and pins its z bounds", () => {
    const built = createDockGeometry(raw, 500.2561);
    expect(built.contactPort.zMin).toBeCloseTo(-1000.2561, 3);
    expect(built.contactPort.zMax).toBeCloseTo(34.0419, 3);
    expect(built.contactPort.halfX).toBe(raw.contact.halfX);
    expect(built.contactPort.halfY).toBe(raw.contact.halfY);

    expect(() => createDockGeometry(raw, 0)).toThrow(DockGeometryError);
    expect(() => createDockGeometry(raw, -1)).toThrow(DockGeometryError);
    expect(() => createDockGeometry(raw, Number.NaN)).toThrow(
      DockGeometryError,
    );
    expect(() => createDockGeometry(raw, Number.POSITIVE_INFINITY)).toThrow(
      DockGeometryError,
    );
  });

  it("has no speed term: the same capture-plane pose docks at rest, at max speed and at the torus cap", () => {
    const base = alignedPose(90);
    const speeds = [0, config.maxSpeed, config.maxSpeed * config.torusMax];

    const results = speeds.map((speed) => {
      const state = inFlightAt({ ...base, speed });
      const events = stepDocking(state, layout, geometry);
      return {
        mode: state.mode,
        position: state.position,
        orientation: state.orientation,
        dockCount: state.dockCount,
        events,
      };
    });

    expect(results[0]?.mode).toBe("docked");
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });
});
