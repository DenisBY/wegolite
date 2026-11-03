// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The mass-lock boundary table (FLGT-04, T-3-07).
 *
 * Oolite's predicate is a set of exact squared comparisons, so every case is
 * one metre either side of a threshold:
 *
 * - station: `d^2 <= 25,600^2` (the boundary itself locks);
 * - planet: `d^2 < 4r^2`, or within 25 km of the surface;
 * - sun: `d^2 < 2r^2`, or within 25 km of the surface;
 * - buoys: never, even when they are the nearest body.
 *
 * Lave's planet and sun are large enough that `2r`/`sqrt(2)r` dominate the
 * 25 km rule, so the surface rule is also proven on a synthetic small body: a
 * typo in its squared form would otherwise be invisible.
 */

import { describe, expect, it } from "vitest";

import {
  massLocked,
  nearestSurfaceDistance,
} from "../../src/sim/flight/torus.js";
import { add, length, scale, sub, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout } = fixture;

const TORUS_TEST_POINT: Vec3 = sub(
  layout.station.position,
  scale(layout.stationToPlanet, 120_000),
);

const FAR = vec(1e9, 0, 0);

function distanceTo(position: Vec3, body: Vec3): number {
  return length(sub(position, body));
}

/** A layout where only one body is near the origin. */
function isolated(overrides: Partial<SystemLayout>): SystemLayout {
  return {
    ...layout,
    planet: { position: FAR, radius: 1 },
    sun: { position: FAR, radius: 1 },
    station: { position: FAR, radius: 1 },
    navBuoy: { position: FAR, radius: 1 },
    witchpoint: { position: FAR, radius: 1 },
    ...overrides,
  };
}

describe("station boundary", () => {
  it("locks at 25,599 and 25,600 m, clears at 25,601 m", () => {
    // Move away from the planet so the planet's 2r sphere cannot mask the
    // station result.
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
});

describe("planet boundary", () => {
  it("uses the strict d^2 < 4r^2 comparison at 2r", () => {
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

  it("locks within 25 km of the surface (dominated by 2r at Lave's size)", () => {
    const radius = layout.planet.radius;
    // r + 25,000 = 66,160 m is inside 2r = 82,320 m, so these are locked by
    // both branches; the exact surface-rule boundary is proven synthetically
    // below.
    for (const offset of [-1, 0, 1]) {
      const point = add(
        layout.planet.position,
        vec(radius + 25_000 + offset, 0, 0),
      );
      expect(massLocked(point, layout)).toBe(true);
    }
  });
});

describe("sun boundary", () => {
  it("uses the strict d^2 < 2r^2 comparison at sqrt(2)r", () => {
    const threshold = Math.sqrt(2) * layout.sun.radius;
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

  it("locks within 25 km of the surface (dominated by sqrt(2)r at Lave's size)", () => {
    const radius = layout.sun.radius;
    for (const offset of [-1, 0, 1]) {
      const point = add(
        layout.sun.position,
        vec(radius + 25_000 + offset, 0, 0),
      );
      expect(massLocked(point, layout)).toBe(true);
    }
  });
});

describe("the 25 km surface rule in isolation", () => {
  it("locks a small planet strictly inside r + 25 km and clears at it", () => {
    const radius = 1_000;
    const smallPlanet = isolated({
      planet: { position: vec(0, 0, 0), radius },
    });
    for (const [distance, expected] of [
      [radius + 25_000 - 1, true],
      [radius + 25_000, false],
      [radius + 25_000 + 1, false],
    ] as const) {
      const point = vec(distance, 0, 0);
      expect(
        massLocked(point, smallPlanet),
        `small planet distance ${String(distance)} m`,
      ).toBe(expected);
    }
  });

  it("locks a small sun strictly inside r + 25 km and clears at it", () => {
    const radius = 1_000;
    const smallSun = isolated({ sun: { position: vec(0, 0, 0), radius } });
    for (const [distance, expected] of [
      [radius + 25_000 - 1, true],
      [radius + 25_000, false],
      [radius + 25_000 + 1, false],
    ] as const) {
      const point = vec(distance, 0, 0);
      expect(
        massLocked(point, smallSun),
        `small sun distance ${String(distance)} m`,
      ).toBe(expected);
    }
  });
});

describe("buoys and empty space", () => {
  it("never mass-locks on a buoy, even when it is the nearest body", () => {
    const buoyOnly = isolated({
      navBuoy: { position: vec(0, 0, 0), radius: 10 },
    });
    expect(massLocked(vec(0, 0, 0), buoyOnly)).toBe(false);
    expect(nearestSurfaceDistance(vec(0, 0, 0), buoyOnly)).toBe(0);
  });

  it("does not lock a point far from every body", () => {
    expect(massLocked(FAR, layout)).toBe(false);
    expect(massLocked(layout.witchpoint.position, layout)).toBe(false);
  });

  it("keeps the torus teleport point clear of every boundary", () => {
    expect(massLocked(TORUS_TEST_POINT, layout)).toBe(false);

    expect(distanceTo(TORUS_TEST_POINT, layout.station.position)).toBeCloseTo(
      120_000,
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
    expect(distanceTo(TORUS_TEST_POINT, layout.navBuoy.position)).toBeCloseTo(
      130_000,
      6,
    );
  });
});
