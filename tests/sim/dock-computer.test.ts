// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docking computer (DOCK-05, D-11, D-12).
 *
 * The two contracts a plausible implementation gets wrong are pinned here:
 *
 * 1. the clock delta is **exactly** 1,200 s — the tick increments, but
 *    `flightTime` and `stationAngle` do not advance, because a command-phase
 *    terminal transition suppresses step 5;
 * 2. a mode-changing command is gated on the mode at the start of the tick, so
 *    a dock and a launch drained together cannot both take effect.
 *
 * The aegis boundary is Oolite's inclusive `<=` (the same predicate the HUD
 * reads), so exactly 51,200 m docks and one metre beyond denies.
 */

import { describe, expect, it } from "vitest";

import {
  DOCK_COMPUTER_KEY,
  dockWithComputer,
} from "../../src/sim/dock/computer.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import {
  dockMouthPosition,
  initFlightState,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import type { Command } from "../../src/sim/commands.js";
import { add, scale } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;

const EQUIPPED: StepOptions = {
  equipment: new Set([DOCK_COMPUTER_KEY]),
};
const UNEQUIPPED: StepOptions = { equipment: new Set<string>() };

function inFlight(): FlightState {
  const state = initFlightState(layout);
  // The dock-mouth pose starts `inFlight` for the computer tests: it is the
  // position a skipped launch hands over at, and it is inside the aegis.
  state.mode = "inFlight";
  return state;
}

function fromStation(distance: number): Vec3 {
  return add(layout.station.position, scale(layout.stationToPlanet, -distance));
}

function step(
  state: FlightState,
  commands: readonly Command[],
  options: StepOptions = EQUIPPED,
): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, ZERO_INTENT, commands, DT, options);
}

describe("dockWithComputer", () => {
  it("ignores a request unless the ship is in flight", () => {
    const state = initFlightState(layout);
    const events = dockWithComputer(state, layout, true);

    expect(events).toEqual([]);
    expect(state.mode).toBe("docked");
    expect(state.dockCount).toBe(0);
  });

  it("refuses without the computer and outside the station aegis", () => {
    const state = inFlight();

    expect(dockWithComputer(state, layout, false)).toEqual([
      { kind: "dockDenied", reason: "notInstalled" },
    ]);
    expect(state.mode).toBe("inFlight");

    state.position = fromStation(layout.stationAegisRange + 1);
    expect(dockWithComputer(state, layout, true)).toEqual([
      { kind: "dockDenied", reason: "outsideAegis" },
    ]);
    expect(state.mode).toBe("inFlight");
  });
});

describe("Shift+C through stepFlight", () => {
  it("docks on the same tick with exactly +1200 s and no flight-time advance", () => {
    const state = inFlight();
    // A docked ship never carries an engaged drive.
    state.torus = {
      engaged: true,
      factor: 32,
      massLocked: false,
      lastFactor: 32,
    };
    state.speed = 120;

    const before = {
      tick: state.tick,
      clockSeconds: state.clockSeconds,
      flightTime: state.flightTime,
      stationAngle: state.stationAngle,
      dockCount: state.dockCount,
    };

    const events = step(state, [{ kind: "dockingComputer" }]);

    expect(state.mode).toBe("docked");
    expect(state.tick).toBe(before.tick + 1);
    expect(state.clockSeconds - before.clockSeconds).toBe(1200);
    expect(state.flightTime).toBe(before.flightTime);
    expect(state.stationAngle).toBe(before.stationAngle);
    expect(state.speed).toBe(0);
    expect(state.pitchRate).toBe(0);
    expect(state.rollRate).toBe(0);
    expect(state.impulse).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.torus.engaged).toBe(false);
    expect(state.torus.factor).toBe(1);
    expect(state.torus.massLocked).toBe(false);
    expect(state.torus.lastFactor).toBe(1);
    expect(state.position).toEqual(dockMouthPosition(layout));
    expect(state.orientation).toEqual(layout.stationBaseQuat);
    expect(state.dockArmed).toBe(false);
    expect(state.dockCount).toBe(before.dockCount + 1);
    expect(events).toEqual([
      { kind: "docked", via: "computer", clockDelta: 1200 },
    ]);
  });

  it("refuses when the computer is not fitted, without docking or a clock jump", () => {
    const state = inFlight();
    const before = state.clockSeconds;

    const events = step(state, [{ kind: "dockingComputer" }], UNEQUIPPED);

    expect(state.mode).toBe("inFlight");
    expect(state.clockSeconds - before).toBeLessThan(1);
    // The refusal is the dock event under test; the normal mass-lock feedback
    // of a step that stayed in flight is allowed alongside it.
    expect(events).toContainEqual({
      kind: "dockDenied",
      reason: "notInstalled",
    });
    expect(events.map((event) => event.kind)).not.toContain("docked");
  });

  it("docks exactly at the aegis boundary and denies one unit beyond it", () => {
    const atRange = inFlight();
    atRange.position = fromStation(layout.stationAegisRange);
    const docked = step(atRange, [{ kind: "dockingComputer" }]);
    expect(atRange.mode).toBe("docked");
    expect(docked).toEqual([
      { kind: "docked", via: "computer", clockDelta: 1200 },
    ]);

    const beyond = inFlight();
    beyond.position = fromStation(layout.stationAegisRange + 1);
    const denied = step(beyond, [{ kind: "dockingComputer" }]);
    expect(beyond.mode).toBe("inFlight");
    expect(denied).toContainEqual({
      kind: "dockDenied",
      reason: "outsideAegis",
    });
    expect(denied.map((event) => event.kind)).not.toContain("docked");
  });

  it("ignores the command while docked or while launching", () => {
    const docked = initFlightState(layout);
    const dockedBefore = docked.clockSeconds;
    const dockEvents = step(docked, [{ kind: "dockingComputer" }]);
    expect(docked.mode).toBe("docked");
    expect(docked.clockSeconds).toBe(dockedBefore);
    expect(dockEvents).toEqual([]);

    const launching = initFlightState(layout);
    step(launching, [{ kind: "launch" }]);
    const launchBefore = launching.clockSeconds;
    const launchEvents = step(launching, [{ kind: "dockingComputer" }]);
    expect(launching.mode).toBe("launching");
    expect(launchEvents).toEqual([]);
    // Only the normal +dt launch step, never a +1200 dock.
    expect(launching.clockSeconds - launchBefore).toBeLessThan(1);
  });

  it("docks once when Shift+C and launch are drained on the same tick", () => {
    const state = inFlight();
    const before = state.clockSeconds;
    const launchCountBefore = state.launchCount;

    const events = step(state, [
      { kind: "dockingComputer" },
      { kind: "launch" },
    ]);

    // `launch` is gated on the mode at the start of the tick (`inFlight`), so
    // the same-tick relaunch is ignored: one transition, +1200 s only.
    expect(state.mode).toBe("docked");
    expect(state.launchCount).toBe(launchCountBefore);
    expect(state.clockSeconds - before).toBe(1200);
    expect(events).toEqual([
      { kind: "docked", via: "computer", clockDelta: 1200 },
    ]);
  });

  it("is a no-op on a command list with a launch already taken this tick", () => {
    const state = initFlightState(layout);
    const before = state.clockSeconds;

    const events = step(
      state,
      [{ kind: "launch" }, { kind: "dockingComputer" }],
      EQUIPPED,
    );

    expect(state.mode).toBe("launching");
    expect(state.launchCount).toBe(1);
    expect(state.clockSeconds - before).toBe(600);
    expect(events.map((event) => event.kind)).toEqual(["launched"]);
  });
});
