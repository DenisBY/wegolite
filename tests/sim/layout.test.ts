// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The exact Lave layout (WORLD-01, T-3-26).
 *
 * Plan 01 built the derivation; this file makes its numbers load-bearing. Every
 * value below is a researched constant from `03-RESEARCH.md` § Data & Constants,
 * not a snapshot of whatever the implementation happened to produce: a change
 * that "looks plausible" (a renormalised vector, a 0.08 rad/s roll, a buoy on
 * the wrong side) must fail here rather than survive to a playtest.
 *
 * Two assertions carry the most weight:
 *
 * 1. The station–planet distance is the *raw-vector* value (82,273.476 m). The
 *    same test states the counter-value a normalised implementation would
 *    produce (82,320 m), so a future "cleanup" that normalises `station_vector`
 *    fails with a message that explains itself.
 * 2. The nav buoy is exactly 10,000 m from the station *along*
 *    `stationToPlanet`. Checking only that the buoy exists would accept a buoy
 *    placed behind or beside the station.
 */

import { describe, expect, it } from "vitest";

import type { System } from "../../src/content/types.js";
import {
  length,
  normalizeVec,
  rotate,
  scale,
  sub,
  vec,
} from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";

function expectVecClose(
  actual: Vec3,
  expected: readonly [number, number, number],
  digits: number,
): void {
  expect(actual.x).toBeCloseTo(expected[0], digits);
  expect(actual.y).toBeCloseTo(expected[1], digits);
  expect(actual.z).toBeCloseTo(expected[2], digits);
}

function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

describe("Lave system layout", () => {
  const fixture = laveFixture();
  const { layout } = fixture;

  it("places the planet at the witchpoint-relative distance with the 1:100 radius", () => {
    expect(layout.planet.position.x).toBe(0);
    expect(layout.planet.position.y).toBe(0);
    expect(layout.planet.position.z).toBe(-452_760);
    expect(layout.planet.radius).toBe(41_160);
  });

  it("places the station with the authored (non-normalised) station vector", () => {
    // The authored vector has magnitude 0.99943484; Oolite multiplies it as
    // written. The y/z components differ from the decimal literals by a few
    // ULPs because of the subtraction order, hence the documented 9-digit
    // tolerance. The *distance* assertion below is the load-bearing one.
    expectVecClose(
      layout.station.position,
      [-49_474.32, 60_752.16, -427_652.4],
      9,
    );

    const stationPlanetDistance = distance(
      layout.planet.position,
      layout.station.position,
    );
    expect(stationPlanetDistance).toBeCloseTo(82_273.476_053_270_03, 6);
    expect(
      Math.abs(stationPlanetDistance - 82_320),
      "a normalised station_vector would put the station 82,320 m from the planet; the authored vector gives 82,273.476 m",
    ).toBeGreaterThan(1);
  });

  it("places the sun with the authored sun vector and the safe-distance loop", () => {
    expectVecClose(
      layout.sun.position,
      [-783_274.8, -340_475.52, -755_203.68],
      9,
    );
    expect(layout.sun.radius).toBe(84_449.095_459);
    expect(distance(layout.sun.position, layout.planet.position)).toBeCloseTo(
      906_043.691_885_911_6,
      6,
    );
  });

  it("pins the station roll in radians per second and its 50 s period", () => {
    // `station_roll 0.08` is authored in right-angles/s; Oolite multiplies by
    // pi/2. 0.08 rad/s would be a 78.5 s period and is the plausible mistake.
    expect(layout.stationRollRadPerSec).toBe(0.125_663_706_143_591_74);
    expect((2 * Math.PI) / layout.stationRollRadPerSec).toBeCloseTo(50, 9);
    expect(layout.rotationSpeed).toBe(0.004_504);
  });

  it("pins the dock offset and the base orientation's local -Z direction", () => {
    expect(layout.dockOffset).toBe(500.2561);

    const dockDirection = rotate(layout.stationBaseQuat, vec(0, 0, -1));
    expectVecClose(
      dockDirection,
      [
        layout.stationToPlanet.x,
        layout.stationToPlanet.y,
        layout.stationToPlanet.z,
      ],
      9,
    );
    expect(distance(dockDirection, layout.stationToPlanet)).toBeLessThan(1e-12);
  });

  it("pins the nav buoy on the station→planet axis and the witchpoint at the origin", () => {
    expect(layout.navBuoy.radius).toBe(10);
    expect(layout.witchpoint.radius).toBe(10);

    expect(
      distance(layout.navBuoy.position, layout.station.position),
    ).toBeCloseTo(10_000, 6);
    expectVecClose(
      normalizeVec(sub(layout.navBuoy.position, layout.station.position)),
      [
        layout.stationToPlanet.x,
        layout.stationToPlanet.y,
        layout.stationToPlanet.z,
      ],
      9,
    );
    expect(layout.witchpoint.position).toEqual(vec(0, 0, 0));

    // The research table rounds at ~4e5 m, so this triple gets 1e-3 per
    // component; the two invariants above are the discriminating assertions.
    expectVecClose(
      layout.navBuoy.position,
      [-43_460.921_469_474, 53_367.986_762_848_275, -430_704.124_711_831_04],
      3,
    );
  });

  it("runs the sun safe-distance loop when the authored distance is too small", () => {
    const synthetic: System = { ...fixture.system, sunDistance: 1 };
    const syntheticLayout = deriveSystemLayout(synthetic, fixture.stationDef);

    const sunVector = vec(
      fixture.system.sunVector[0],
      fixture.system.sunVector[1],
      -fixture.system.sunVector[2],
    );
    const naiveSun = sub(
      syntheticLayout.planet.position,
      scale(sunVector, synthetic.sunDistance),
    );

    // The naive placement is inside the six-radius exclusion zone, so the loop
    // must have doubled the distance at least once to reach a valid position.
    expect(length(naiveSun)).toBeLessThan(6 * synthetic.sunRadius);
    expect(length(syntheticLayout.sun.position)).toBeGreaterThanOrEqual(
      6 * synthetic.sunRadius,
    );
  });

  it("derives only finite positions, radii and rates", () => {
    const vectors: readonly Vec3[] = [
      layout.planet.position,
      layout.sun.position,
      layout.station.position,
      layout.navBuoy.position,
      layout.witchpoint.position,
      layout.stationToPlanet,
      layout.sunDir,
    ];
    for (const vector of vectors) {
      expect(Number.isFinite(vector.x)).toBe(true);
      expect(Number.isFinite(vector.y)).toBe(true);
      expect(Number.isFinite(vector.z)).toBe(true);
    }

    const numbers: readonly number[] = [
      layout.planet.radius,
      layout.sun.radius,
      layout.station.radius,
      layout.navBuoy.radius,
      layout.witchpoint.radius,
      layout.stationRollRadPerSec,
      layout.dockOffset,
      layout.rotationSpeed,
      layout.scannerRange,
      layout.stationAegisRange,
      layout.planetAegisRange,
    ];
    for (const value of numbers) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
