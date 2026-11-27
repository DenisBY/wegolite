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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STATION_KINDS } from "../../src/content/stations.js";
import type { StationKind } from "../../src/content/stations.js";
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
import { LayoutError, deriveSystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";
import { clientCatalogue, stationSpecOf } from "../helpers/stations.js";

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
    expect(layout.navBuoy.radius).toBe(59.13554763793945);
    expect(layout.witchpoint.radius).toBe(59.13554763793945);

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

  it("pins the station and buoy radii to the compiled collisionRadius and to the radii measured in Oolite", () => {
    const catalogue = JSON.parse(
      readFileSync(
        new URL(
          "../../src/content/generated/ships-client.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { key: string; collisionRadius?: number }[];
    const radius = (key: string): number => {
      const value = catalogue.find(
        (entry) => entry.key === key,
      )?.collisionRadius;
      if (value === undefined) throw new Error(`no ${key} collisionRadius`);
      return value;
    };
    expect(layout.station.radius).toBe(radius("coriolis-station"));
    expect(layout.navBuoy.radius).toBe(radius("buoy"));
    expect(layout.witchpoint.radius).toBe(radius("buoy"));
    // The float32 values read from a running Oolite in quick task 261117-jji.
    expect(layout.station.radius).toBe(779.3702392578125);
    expect(layout.navBuoy.radius).toBe(59.13554763793945);
    expect(layout.witchpoint.radius).toBe(59.13554763793945);
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

/** One real system of each station kind (Lave, Biarge, Zaonce). */
const KIND_SYSTEMS: readonly (readonly [StationKind, string])[] = [
  ["coriolis", "g0-s7"],
  ["dodecahedron", "g0-s3"],
  ["icosahedron", "g0-s129"],
];

describe("the per-kind station layout (Phase 22.1, WORLD-20)", () => {
  const galaxy = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/systems/g0.json", import.meta.url),
      "utf8",
    ),
  ) as System[];
  function systemOf(id: string): System {
    const system = galaxy.find((candidate) => candidate.id === id);
    if (system === undefined) throw new Error(`no system ${id}`);
    return system;
  }

  it.each(KIND_SYSTEMS)(
    "builds the %s station of %s from its compiled record",
    (kind, id) => {
      const system = systemOf(id);
      expect(system.station).toBe(kind);
      const entry = clientCatalogue().find(
        (candidate) => candidate.key === `${kind}-station`,
      );
      const dock = entry?.shipDef.subentities.find((sub) => sub.isDock);
      if (entry === undefined || dock?.position === undefined) {
        throw new Error(`no compiled ${kind} station with a dock`);
      }

      const layout = deriveSystemLayout(system, stationSpecOf(kind));

      expect(layout.station.radius).toBe(entry.collisionRadius);
      expect(layout.dockOffset).toBe(Math.abs(dock.position[2]));
      expect(layout.stationRollRadPerSec).toBe((0.08 * Math.PI) / 2);
      expect(layout.stationKind).toBe(kind);
      expect(layout.stationKey).toBe(`${kind}-station`);
      expect(layout.stationMass).toBe(entry.mass);
    },
  );

  it("pins the compiled numbers of the three stations", () => {
    const radii = KIND_SYSTEMS.map(([kind, id]) => {
      const layout = deriveSystemLayout(systemOf(id), stationSpecOf(kind));
      return [kind, layout.station.radius, layout.dockOffset];
    });
    expect(radii).toEqual([
      ["coriolis", 779.3702392578125, 500.2561],
      ["dodecahedron", 832.2093505859375, 560.3216],
      ["icosahedron", 940.79278564453125, 642.8881],
    ]);
  });

  it.each(KIND_SYSTEMS)(
    "puts the %s station of %s where the Coriolis would stand: the kind does not move the station",
    (kind, id) => {
      const system = systemOf(id);
      const own = deriveSystemLayout(system, stationSpecOf(kind));
      const asCoriolis = deriveSystemLayout(
        { ...system, station: "coriolis" },
        stationSpecOf("coriolis"),
      );
      expect(own.station.position).toEqual(asCoriolis.station.position);
      expect(own.stationToPlanet).toEqual(asCoriolis.stationToPlanet);
      expect(own.navBuoy).toEqual(asCoriolis.navBuoy);
    },
  );

  it("refuses a spec of another kind than the system's station, naming both kinds (Pitfall P2)", () => {
    const zaonce = systemOf("g0-s129");
    expect(() => deriveSystemLayout(zaonce, stationSpecOf("coriolis"))).toThrow(
      LayoutError,
    );
    expect(() => deriveSystemLayout(zaonce, stationSpecOf("coriolis"))).toThrow(
      /icosahedron.*coriolis/,
    );
    expect(() =>
      deriveSystemLayout(zaonce, stationSpecOf("icosahedron")),
    ).not.toThrow();
  });

  it.each(KIND_SYSTEMS)(
    "refuses every other kind's spec at the %s system %s and accepts its own",
    (kind, id) => {
      const system = systemOf(id);
      for (const other of STATION_KINDS) {
        const attempt = () => deriveSystemLayout(system, stationSpecOf(other));
        if (other === kind) expect(attempt).not.toThrow();
        else expect(attempt).toThrow(LayoutError);
      }
    },
  );

  it("keeps the Lave fixture layout on the Coriolis doubles it had before the spec", () => {
    const { layout } = laveFixture();
    expect(layout.station.radius).toBe(779.3702392578125);
    expect(layout.dockOffset).toBe(500.2561);
    expect(layout.stationRollRadPerSec).toBe((0.08 * Math.PI) / 2);
  });
});
