// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The deterministic witchpoint arrival (NAV-05, D-08).
 *
 * Three properties are load-bearing and none can pass by accident:
 *
 * 1. the same route produces a deep-equal pose, and the reversed route does
 *    not — so the pose is a function of the two ids, not of ambient state;
 * 2. the offset magnitude is clamped to the witchpoint safety distance and
 *    scanner range **by construction**, for every destination in galaxy 0;
 * 3. the source contains no global random source and no wall clock, which is
 *    what makes a replay reproducable across reloads.
 *
 * The source scan strips comments first, so prose about "no random source"
 * cannot satisfy or falsify it.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { System } from "../../src/content/types.js";
import { stepDocking } from "../../src/sim/dock/step.js";
import {
  ARRIVAL_SPEED,
  applyWitchpointArrival,
  arrivalWord,
  OOLITE_ORIENTATION_EPSILON,
} from "../../src/sim/hyperspace/arrival.js";
import { chartDistance, MAX_JUMP_DIST } from "../../src/sim/hyperspace/jump.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { vec } from "../../src/sim/math.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { laveDockGeometry } from "../helpers/dock-pose.js";
import { LAVE_SYSTEM_ID, laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const LAVE = LAVE_SYSTEM_ID;
const LEESTI = "g0-s55";
const SAFE_DISTANCE = layout.witchpoint.radius + 750;
const SCANNER_HALF = layout.scannerRange * 0.5;

/** One galaxy-0 system with the layout the shipped build derives for it. */
interface RouteSystem {
  readonly system: System;
  readonly layout: SystemLayout;
}

/** A directed route between two distinct galaxy-0 systems. */
interface DirectedRoute {
  readonly origin: RouteSystem;
  readonly destination: RouteSystem;
}

/**
 * The 256 galaxy-0 systems, read with `readFileSync` as `lave.ts` does, each
 * with its layout derived once from the fixture's station and reused.
 */
const ROUTE_SYSTEMS: readonly RouteSystem[] = (
  JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/systems/g0.json", import.meta.url),
      "utf8",
    ),
  ) as System[]
).map((system) => ({
  system,
  layout: deriveSystemLayout(system, fixture.stationDef),
}));

/** Every ordered pair of distinct systems whose chart distance is in range. */
function directedInRangeRoutes(): DirectedRoute[] {
  const routes: DirectedRoute[] = [];
  for (const origin of ROUTE_SYSTEMS) {
    for (const destination of ROUTE_SYSTEMS) {
      if (origin.system.id === destination.system.id) continue;
      const dist = chartDistance(
        { x: origin.system.chartX, y: origin.system.chartY },
        { x: destination.system.chartX, y: destination.system.chartY },
      );
      if (dist <= MAX_JUMP_DIST) routes.push({ origin, destination });
    }
  }
  return routes;
}

function freshState(): FlightState {
  // A docked state is the harshest input: arrival must overwrite every field
  // that would otherwise keep it at the dock mouth.
  return initFlightState(layout);
}

function arrive(
  originId: string,
  destinationId: string,
  flightConfig = config,
): FlightState {
  const state = freshState();
  applyWitchpointArrival(state, layout, flightConfig, originId, destinationId);
  return state;
}

/** Remove block comments and whole-line `//` comments before scanning. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

describe("arrival pose determinism", () => {
  it("is deep-equal for the same origin and destination", () => {
    const first = arrive(LAVE, LEESTI);
    const second = arrive(LAVE, LEESTI);
    expect(first.position).toEqual(second.position);
    expect(first.orientation).toEqual(second.orientation);
  });

  it("differs for the reversed route", () => {
    const forward = arrive(LAVE, LEESTI);
    const reverse = arrive(LEESTI, LAVE);
    expect(reverse.position).not.toEqual(forward.position);
    expect(reverse.orientation).not.toEqual(forward.orientation);
  });

  it("derives the word from the route, stably and as a uint32", () => {
    const word = arrivalWord(LAVE, LEESTI);
    expect(arrivalWord(LAVE, LEESTI)).toBe(word);
    expect(arrivalWord(LEESTI, LAVE)).not.toBe(word);
    expect(Number.isSafeInteger(word)).toBe(true);
    expect(word).toBeGreaterThanOrEqual(0);
    expect(word).toBeLessThanOrEqual(0xff_ff_ff_ff);
  });
});

describe("arrival offset clamp", () => {
  it("keeps every galaxy-0 destination inside the safety and scanner bounds", () => {
    for (let index = 0; index < 256; index += 1) {
      const destination = `g0-s${String(index)}`;
      if (destination === LAVE) continue;
      const state = arrive(LAVE, destination);

      // The offset is horizontal: y is the witchpoint's y, so the distance is
      // measured on X/Z (the planet lies on -Z).
      expect(state.position.y).toBe(layout.witchpoint.position.y);
      const dx = state.position.x - layout.witchpoint.position.x;
      const dz = state.position.z - layout.witchpoint.position.z;
      const horizontal = Math.sqrt(dx * dx + dz * dz);

      expect(horizontal, destination).toBeGreaterThanOrEqual(SAFE_DISTANCE);
      expect(horizontal, destination).toBeLessThanOrEqual(SCANNER_HALF);
    }
  });

  it("places the Lave arrival on the witchpoint's horizontal plane", () => {
    const state = arrive(LAVE, LEESTI);
    // The offset is on X/Z only; y stays exactly the witchpoint's y.
    expect(state.position.y).toBe(layout.witchpoint.position.y);

    const dx = state.position.x - layout.witchpoint.position.x;
    const dz = state.position.z - layout.witchpoint.position.z;
    expect(Math.sqrt(dx * dx + dz * dz)).toBeGreaterThan(0);
  });
});

describe("arrival pose checklist", () => {
  it("normalises the near-identity orientation to unit length", () => {
    const state = arrive(LAVE, LEESTI);
    const { w, x, y, z } = state.orientation;
    expect(Math.sqrt(w * w + x * x + y * y + z * z)).toBeCloseTo(1, 12);
    // Near identity: it faces the planet down -Z with only the Oolite tilt.
    expect(state.orientation.w).toBeGreaterThan(0.95);
    for (const component of [
      state.orientation.x,
      state.orientation.y,
      state.orientation.z,
    ]) {
      expect(Math.abs(component)).toBeLessThan(0.15);
    }
  });

  it("takes exactly min(maxSpeed, 50) and zeroes the rates", () => {
    const state = arrive(LAVE, LEESTI);
    expect(state.speed).toBe(Math.min(config.maxSpeed, ARRIVAL_SPEED));
    if (config.maxSpeed >= ARRIVAL_SPEED) {
      expect(state.speed).toBe(50);
    }
    expect(state.pitchRate).toBe(0);
    expect(state.rollRate).toBe(0);
  });

  it("caps the speed on a slower ship", () => {
    const state = arrive(LAVE, LEESTI, { ...config, maxSpeed: 30 });
    expect(state.speed).toBe(30);
    expect(ARRIVAL_SPEED).toBe(50);
    expect(OOLITE_ORIENTATION_EPSILON).toBe(1 / 1024);
  });

  it("installs a complete in-flight pose with the dock latch armed", () => {
    const state = arrive(LAVE, LEESTI);
    expect(state.mode).toBe("inFlight");
    expect(state.dockArmed).toBe(true);
    expect(state.launchElapsed).toBe(0);
    expect(state.stationAngle).toBe(0);
    expect(state.impulse).toEqual(vec(0, 0, 0));
    expect(state.compassMode).toBe("auto");
    expect(state.torus).toEqual({
      engaged: false,
      factor: 1,
      massLocked: false,
      lastFactor: 1,
    });
  });
});

describe("arrival determinism source scan", () => {
  it("contains no global random source and no wall clock", () => {
    const source = withoutComments(
      readFileSync(
        new URL("../../src/sim/hyperspace/arrival.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/performance\.now/);
    expect(source).not.toMatch(/new\s+Date/);
  });
});

describe("arrival is stationary on every directed route", () => {
  it("leaves every in-range galaxy-0 route undisplaced by one stepped docking tick", () => {
    const routes = directedInRangeRoutes();
    // Exactly 1,750 directed pairs (875 unordered edges, both ways). A content
    // or distance-rule drift must not shrink the population silently.
    expect(routes).toHaveLength(1750);
    // The Lave -> Diso route is the measured 240.4 km snap; it stays in the set.
    expect(
      routes.some(
        (route) =>
          route.origin.system.id === LAVE &&
          route.destination.system.name === "Diso",
      ),
    ).toBe(true);

    const geometry = laveDockGeometry();
    for (const { origin, destination } of routes) {
      const label = `${origin.system.id}>${destination.system.id}`;
      const state = initFlightState(destination.layout);
      applyWitchpointArrival(
        state,
        destination.layout,
        config,
        origin.system.id,
        destination.system.id,
      );
      const position = { ...state.position };
      const orientation = { ...state.orientation };

      const events = stepDocking(state, destination.layout, geometry, 0);

      expect(events, label).toEqual([]);
      expect(state.position, label).toEqual(position);
      expect(state.orientation, label).toEqual(orientation);
      expect(state.dockArmed, label).toBe(true);
    }
  });
});
