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

import { classifyCorridor, dockSnapshot } from "../../src/sim/dock/corridor.js";
import { dockWithComputer } from "../../src/sim/dock/computer.js";
import { obbsIntersect } from "../../src/sim/dock/hull.js";
import { portFrame } from "../../src/sim/dock/port-frame.js";
import { stepDocking } from "../../src/sim/dock/step.js";
import { deriveFlightConfig } from "../../src/sim/flight/config.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import {
  brakePlayerDrift,
  VELOCITY_CLEANUP_FULL,
  VELOCITY_CLEANUP_MIN,
  VELOCITY_CLEANUP_RATE,
} from "../../src/sim/flight/drift.js";
import { beginLaunch } from "../../src/sim/flight/launch.js";
import { sanitizeFlightState } from "../../src/sim/flight/sanitize.js";
import {
  dockMouthPosition,
  hashFlight,
  initFlightState,
  serializeFlight,
} from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  applyWitchpointArrival,
  drawWitchpointExit,
} from "../../src/sim/hyperspace/arrival.js";
import { clampFrameDelta } from "../../src/sim/loop.js";
import { add, dot, length, scale, sub, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../src/sim/time.js";
import { MAX_ENTITY_VELOCITY } from "../../src/sim/world/limits.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
} from "../helpers/dock-pose.js";
import type { PlaceShipOptions } from "../helpers/dock-pose.js";
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
    state.torus = {
      engaged: true,
      factor: 32,
      massLocked: false,
      lastFactor: 32,
    };
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
    expect(serializeFlight(state)).toBe(
      `${base}\ndrift=1.500000,0.000000,-2.000000`,
    );
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

// ---------------------------------------------------------------------------
// Task 2: the resets, the station contact and the cadence.

const geometry = laveDockGeometry();
const DRIFTING = vec(40, -25, 60);

function dockStep(state: FlightState): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, ZERO_INTENT, [], DT, {
    dock: geometry,
  });
}

/** An in-flight state at a port-frame pose, at rest, with the latch armed. */
function atPort(options: PlaceShipOptions): FlightState {
  const pose = placeShipInPortFrame(layout, geometry, options);
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.position = pose.position;
  state.orientation = pose.orientation;
  state.speed = pose.speed;
  state.dockArmed = true;
  return state;
}

function outcomeOf(state: FlightState): string {
  return classifyCorridor(
    dockSnapshot(layout, state, geometry, state.stationAngle),
    geometry,
  ).outcome;
}

/** The port-frame `k` (outward from the station face) at angle 0. */
const K = portFrame(layout, 0).k;

describe("every pose change zeroes the drift", () => {
  it("beginLaunch", () => {
    const state = initFlightState(layout);
    state.drift = DRIFTING;
    expect(beginLaunch(state, layout, config, geometry)).toBe(true);
    expect(state.drift).toEqual(vec(0, 0, 0));
  });

  it("applyWitchpointArrival", () => {
    const state = restingInFlight();
    state.drift = DRIFTING;
    applyWitchpointArrival(state, layout, config, drawWitchpointExit(7));
    expect(state.drift).toEqual(vec(0, 0, 0));
  });

  it("dockWithComputer", () => {
    const state = restingInFlight();
    state.position = add(
      layout.station.position,
      scale(layout.stationToPlanet, layout.stationAegisRange / 2),
    );
    state.drift = DRIFTING;
    dockWithComputer(state, layout, true);
    expect(state.mode).toBe("docked");
    expect(state.drift).toEqual(vec(0, 0, 0));
  });

  it("the manual capture", () => {
    // The aligned capture-plane pose of dock-capture.test.ts.
    const state = atPort({ nosePastPlane: 90, rollFromMatched: 0, lateral: 0 });
    state.drift = DRIFTING;
    const events = stepDocking(state, layout, geometry);
    expect(state.mode).toBe("docked");
    expect(events.map((event) => event.kind)).toContain("docked");
    expect(state.drift).toEqual(vec(0, 0, 0));
  });

  it("a drifting approach the corridor captures docks at rest", () => {
    const state = atPort({ nosePastPlane: 45, rollFromMatched: 0, lateral: 0 });
    // Straight in along the slot axis at 120 m/s, engine off.
    state.drift = scale(K, -120);
    let docked = false;
    for (let tick = 0; tick < 120 && !docked; tick += 1) {
      const events = dockStep(state);
      expect(events.map((event) => event.kind)).not.toContain("bounce");
      docked = events.some((event) => event.kind === "docked");
    }
    expect(docked).toBe(true);
    expect(state.position).toEqual(dockMouthPosition(layout));
    expect(state.drift).toEqual(vec(0, 0, 0));
  });
});

describe("only an in-flight drift is integrated", () => {
  it("a docked ship neither moves nor brakes", () => {
    const state = initFlightState(layout);
    state.drift = DRIFTING;
    const position = state.position;
    step(state);
    expect(state.position).toEqual(position);
    expect(state.drift).toEqual(DRIFTING);
  });

  it("a launching ship moves only by the launch, never by the drift", () => {
    const twin = initFlightState(layout);
    const state = initFlightState(layout);
    for (const s of [twin, state]) {
      stepFlight(s, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    }
    state.drift = DRIFTING;
    for (let tick = 0; tick < 10; tick += 1) {
      step(twin);
      step(state);
    }
    expect(state.mode).toBe("launching");
    expect(state.position).toEqual(twin.position);
    expect(state.drift).toEqual(DRIFTING);
  });

  it("a drifting flight hashes equal at 30, 60 and 144 Hz", () => {
    const TARGET = 600;
    function replay(hz: number): string {
      const state = restingInFlight();
      state.speed = 120;
      state.drift = vec(250, -80, 2600);
      let accumulator = 0;
      let steps = 0;
      while (steps < TARGET) {
        accumulator += clampFrameDelta(1 / hz);
        let stepsThisFrame = 0;
        while (
          accumulator >= DT &&
          stepsThisFrame < MAX_STEPS_PER_FRAME &&
          steps < TARGET
        ) {
          step(state);
          accumulator -= DT;
          steps += 1;
          stepsThisFrame += 1;
        }
        if (stepsThisFrame === MAX_STEPS_PER_FRAME) accumulator = 0;
      }
      expect(serializeFlight(state)).toContain("drift=");
      return hashFlight(state);
    }
    expect(new Set([30, 60, 144].map(replay)).size).toBe(1);
  });
});

describe("the station contact sees the drift (review L173, L426, L424)", () => {
  /** Engine off, nose toward the station, 1 m in front of the outward face. */
  function frontFace(): FlightState {
    const state = atPort({
      nosePastPlane: -(geometry.contactPort.zMax + 1),
      rollFromMatched: 0,
      lateral: 300,
    });
    expect(outcomeOf(state)).toBe("outside");
    return state;
  }

  function boxClear(state: FlightState): boolean {
    return !obbsIntersect(
      dockSnapshot(layout, state, geometry, state.stationAngle),
      geometry.contactPort,
    );
  }

  it("a 68 m/s drift into the hull bounces once, with the drift's normal part halved", () => {
    const state = frontFace();
    state.drift = scale(K, -68);
    let bounces = 0;
    let checkedContact = false;
    for (let tick = 0; tick < 600; tick += 1) {
      // The contact tick brakes the drift before the docking step reflects it.
      const braked = brakePlayerDrift(state.drift, DT, COBRA_THRUST, 1);
      const events = dockStep(state);
      const hits = events.filter((event) => event.kind === "bounce");
      bounces += hits.length;
      if (hits.length > 0 && !checkedContact) {
        checkedContact = true;
        const inward = -dot(braked, K);
        expect(inward).toBeGreaterThan(67);
        // Restitution 0.5 on the drift's inward part: +34 m/s outward.
        expect(dot(state.drift, K)).toBeCloseTo(0.5 * inward, 9);
        expect(dot(state.drift, K)).toBeCloseTo(34, 0);
        // The engine-and-impulse part leaves at the 8 m/s floor.
        expect(state.speed).toBe(0);
        expect(dot(state.impulse, K)).toBeCloseTo(8, 9);
        expect(dot(add(state.drift, state.impulse), K)).toBeCloseTo(42, 0);
        // The reported impact includes the drift.
        expect(hits[0]).toMatchObject({ kind: "bounce", cause: "hull" });
        expect((hits[0] as { speed: number }).speed).toBeCloseTo(inward, 9);
      }
    }
    expect(checkedContact).toBe(true);
    expect(bounces).toBe(1);
    expect(state.bounceCount).toBe(1);
    expect(boxClear(state)).toBe(true);
  });

  it("a 350 m/s drift does not tunnel into the station", () => {
    const state = frontFace();
    const start = dot(state.position, K);
    state.drift = scale(K, -350);
    let bounces = 0;
    for (let tick = 0; tick < 600; tick += 1) {
      bounces += dockStep(state).filter((e) => e.kind === "bounce").length;
      // The centre never gets more than one tick's travel past the start.
      expect(dot(state.position, K)).toBeGreaterThan(start - 350 * DT * 2);
    }
    expect(bounces).toBe(1);
    expect(dot(state.position, K)).toBeGreaterThan(start);
    expect(boxClear(state)).toBe(true);
  });

  it("a drifting straddle resolves once", () => {
    const state = atPort({
      nosePastPlane: 10,
      rollFromMatched: Math.PI / 2,
      lateral: 0,
    });
    expect(outcomeOf(state)).toBe("straddle");
    state.drift = scale(K, -68);
    const bounces: unknown[] = [];
    for (let tick = 0; tick < 600; tick += 1) {
      bounces.push(...dockStep(state).filter((e) => e.kind === "bounce"));
    }
    expect(bounces).toHaveLength(1);
    expect(bounces[0]).toMatchObject({ cause: "straddle" });
    expect(dot(state.drift, K)).toBeGreaterThanOrEqual(0);
  });

  it("keeps an outward or tangential drift through a contact", () => {
    const state = frontFace();
    // Already overlapping by 0.5 m, drifting sideways and slightly outward.
    state.position = sub(state.position, scale(K, 1.5));
    const tangent = portFrame(layout, 0).i;
    state.drift = add(scale(tangent, 20), scale(K, 3));
    const events = stepDocking(state, layout, geometry);
    expect(events.map((event) => event.kind)).toEqual(["bounce"]);
    expect(state.drift).toEqual(add(scale(tangent, 20), scale(K, 3)));
  });

  it("a zero-drift contact leaves the drift untouched and prints no drift line", () => {
    const state = frontFace();
    state.position = sub(state.position, scale(K, 1.5));
    const events = stepDocking(state, layout, geometry);
    expect(events.map((event) => event.kind)).toEqual(["bounce"]);
    expect(state.drift).toEqual(vec(0, 0, 0));
    expect(serializeFlight(state)).not.toContain("drift");
  });
});
