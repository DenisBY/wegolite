// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The seeded witchpoint arrival (NAV-05).
 *
 * Four properties are load-bearing and none can pass by accident:
 *
 * 1. the same seed produces a deep-equal draw and pose, and a different seed
 *    produces a different one, so the pose is a function of the seed alone;
 * 2. the offset is clamped to the witchpoint safety distance and the 12,800 m
 *    half-range in three dimensions **by construction**, for a seed sweep;
 * 3. the offset spreads over all three axes, with a unit direction, so the
 *    placement is three-dimensional as Oolite's is;
 * 4. the source contains no global random source and no wall clock, which is
 *    what makes a replay reproducible across reloads.
 *
 * The source scan strips comments first, so prose about "no random source"
 * cannot satisfy or falsify it.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { System } from "../../src/content/types.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { stepDocking } from "../../src/sim/dock/step.js";
import {
  ARRIVAL_SPEED,
  applyWitchpointArrival,
  drawWitchpointExit,
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
const LAVE_SEED = marketSeedForSystem(LAVE);
const LEESTI_SEED = marketSeedForSystem(LEESTI);
const SAFE_DISTANCE = layout.witchpoint.radius + 750;
const MAX_OFFSET = 12_800;
const SEED_SWEEP = 2000;
const TOLERANCE = 1e-9;

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

function arrive(seed: number, flightConfig = config): FlightState {
  const state = freshState();
  applyWitchpointArrival(state, layout, flightConfig, drawWitchpointExit(seed));
  return state;
}

/** The signed offset of an arrival from the witchpoint, on each axis. */
function offsetOf(state: FlightState): [number, number, number] {
  return [
    state.position.x - layout.witchpoint.position.x,
    state.position.y - layout.witchpoint.position.y,
    state.position.z - layout.witchpoint.position.z,
  ];
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
  it("draws the same offset for the same seed", () => {
    expect(drawWitchpointExit(LAVE_SEED)).toEqual(
      drawWitchpointExit(LAVE_SEED),
    );
  });

  it("is deep-equal for the same seed", () => {
    const first = arrive(LAVE_SEED);
    const second = arrive(LAVE_SEED);
    expect(first.position).toEqual(second.position);
    expect(first.orientation).toEqual(second.orientation);
  });

  it("differs for a different seed", () => {
    const first = drawWitchpointExit(LAVE_SEED);
    const second = drawWitchpointExit(LEESTI_SEED);
    expect(second).not.toEqual(first);
    expect(arrive(LEESTI_SEED).position).not.toEqual(
      arrive(LAVE_SEED).position,
    );
  });

  it("draws values inside Oolite's ranges for every seed in the sweep", () => {
    for (let seed = 1; seed <= SEED_SWEEP; seed += 1) {
      const draw = drawWitchpointExit(seed);
      // (Ranrot() & 255) / 256 - 0.5 is a multiple of 1/256 in [-0.5, 0.5).
      expect(draw.radial, `seed ${seed}`).toBeGreaterThanOrEqual(-0.5);
      expect(draw.radial, `seed ${seed}`).toBeLessThan(0.5);
      expect(Math.abs(draw.radial * 256 - Math.round(draw.radial * 256))).toBe(
        0,
      );

      const [dx, dy, dz] = draw.direction;
      expect(
        Math.sqrt(dx * dx + dy * dy + dz * dz),
        `seed ${seed}`,
      ).toBeCloseTo(1, 9);

      for (const tilt of draw.tilt) {
        expect(tilt, `seed ${seed}`).toBeGreaterThanOrEqual(-0.125);
        expect(tilt, `seed ${seed}`).toBeLessThan(0.125);
      }
    }
  });
});

describe("arrival offset clamp", () => {
  it("keeps every seed in the sweep inside the safety and half-range bounds in three dimensions", () => {
    for (let seed = 1; seed <= SEED_SWEEP; seed += 1) {
      const state = arrive(seed);
      const [dx, dy, dz] = offsetOf(state);
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      expect(distance, `seed ${seed}`).toBeGreaterThanOrEqual(
        SAFE_DISTANCE - TOLERANCE,
      );
      expect(distance, `seed ${seed}`).toBeLessThanOrEqual(
        MAX_OFFSET + TOLERANCE,
      );
    }
  });

  it("places the arrival at the draw's direction times the clamped distance", () => {
    for (let seed = 1; seed <= SEED_SWEEP; seed += 1) {
      const draw = drawWitchpointExit(seed);
      const [dx, dy, dz] = offsetOf(arrive(seed));
      const [ux, uy, uz] = draw.direction;
      // The signed distance is the projection onto the unit direction.
      const distance = dx * ux + dy * uy + dz * uz;
      expect(Math.abs(distance), `seed ${seed}`).toBeGreaterThanOrEqual(
        SAFE_DISTANCE - TOLERANCE,
      );
      expect(dx, `seed ${seed}`).toBeCloseTo(ux * distance, 6);
      expect(dy, `seed ${seed}`).toBeCloseTo(uy * distance, 6);
      expect(dz, `seed ${seed}`).toBeCloseTo(uz * distance, 6);
    }
  });

  it("spreads the Lave arrival over all three axes", () => {
    const signs = {
      x: new Set<number>(),
      y: new Set<number>(),
      z: new Set<number>(),
    };
    for (let seed = 1; seed <= SEED_SWEEP; seed += 1) {
      const [dx, dy, dz] = offsetOf(arrive(seed));
      signs.x.add(Math.sign(dx));
      signs.y.add(Math.sign(dy));
      signs.z.add(Math.sign(dz));
    }
    // The offset is three-dimensional: Y takes both signs, as X and Z do.
    expect(signs.x).toEqual(new Set([-1, 1]));
    expect(signs.y).toEqual(new Set([-1, 1]));
    expect(signs.z).toEqual(new Set([-1, 1]));
  });
});

describe("arrival pose checklist", () => {
  it("normalises the near-identity orientation to unit length", () => {
    const state = arrive(LAVE_SEED);
    const { w, x, y, z } = state.orientation;
    expect(Math.sqrt(w * w + x * x + y * y + z * z)).toBeCloseTo(1, 12);
    // Near identity: the Oolite tilt is small, so the ship keeps its attitude.
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
    const state = arrive(LAVE_SEED);
    expect(state.speed).toBe(Math.min(config.maxSpeed, ARRIVAL_SPEED));
    if (config.maxSpeed >= ARRIVAL_SPEED) {
      expect(state.speed).toBe(50);
    }
    expect(state.pitchRate).toBe(0);
    expect(state.rollRate).toBe(0);
  });

  it("caps the speed on a slower ship", () => {
    const state = arrive(LAVE_SEED, { ...config, maxSpeed: 30 });
    expect(state.speed).toBe(30);
    expect(ARRIVAL_SPEED).toBe(50);
    expect(OOLITE_ORIENTATION_EPSILON).toBe(1 / 1024);
  });

  it("installs a complete in-flight pose with the dock latch armed", () => {
    const state = arrive(LAVE_SEED);
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
        drawWitchpointExit(marketSeedForSystem(origin.system.id)),
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
