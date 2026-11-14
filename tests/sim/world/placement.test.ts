// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Oolite location samplers (WORLD-15, T-12-16). Expected values come from
 * the Oolite rules the samplers port (region membership, the lane-length
 * weighting, the component formula of the quaternion), never from running the
 * code under test: each check recomputes the rule with plain arithmetic.
 * Forced rejection uses geometry no point can satisfy (an exclusion sphere that
 * covers the whole region), so the cap and the fallback are proven with a real
 * seeded stream.
 */

import { describe, expect, it } from "vitest";

import { length, lengthSquared, sub, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import type { RngState } from "../../../src/sim/rng.js";
import {
  LANE_WIDTH,
  MAX_PLACEMENT_TRIES,
  locationByCode,
  positionInCylinder,
  positionInShell,
  randomQuaternion,
  randomSpatial,
} from "../../../src/sim/world/placement.js";
import type { LocationCode } from "../../../src/sim/world/placement.js";
import type { SystemLayout } from "../../../src/sim/world/layout.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();
const ORIGIN = vec(0, 0, 0);

function dist(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Distance from `p` to the segment `a`-`b`. */
function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const t = Math.min(
    1,
    Math.max(0, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared(ab)),
  );
  return dist(p, vec(a.x + ab.x * t, a.y + ab.y * t, a.z + ab.z * t));
}

function copy(rng: RngState): RngState {
  return { s: rng.s };
}

describe("randomSpatial", () => {
  it("returns the origin for maxLength 0 and consumes the same draws as any other length", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const zero = createRngState(seed);
      const other = createRngState(seed);
      const result = randomSpatial(zero, 0);
      randomSpatial(other, 1000);
      expect(Math.abs(result.position.x)).toBe(0);
      expect(Math.abs(result.position.y)).toBe(0);
      expect(Math.abs(result.position.z)).toBe(0);
      expect(zero.s).toBe(other.s);
      expect(zero.s).not.toBe(createRngState(seed).s);
    }
  });

  it("stays within maxLength of the origin", () => {
    const rng = createRngState(11);
    for (let i = 0; i < 500; i++) {
      const sample = randomSpatial(rng, 1000);
      expect(length(sample.position)).toBeLessThanOrEqual(1000 + 1e-9);
      expect(sample.fallback).toBe(false);
    }
  });

  it("reproduces the rule: three draws u - 0.5 per candidate scaled by 2 x maxLength", () => {
    const probe = createRngState(5);
    const x = rngNext(probe) - 0.5;
    const y = rngNext(probe) - 0.5;
    const z = rngNext(probe) - 0.5;
    // Seed 5 is accepted on its first candidate (norm^2 within 0.25).
    expect(x * x + y * y + z * z).toBeLessThanOrEqual(0.25);
    const sample = randomSpatial(createRngState(5), 10);
    expect(sample.position.x).toBeCloseTo(x * 20, 9);
    expect(sample.position.y).toBeCloseTo(y * 20, 9);
    expect(sample.position.z).toBeCloseTo(z * 20, 9);
  });

  it("accepts the last candidate after the cap and reports a fallback", () => {
    // Find a seed whose first candidate lies outside the 0.5-radius ball.
    let seed = 1;
    for (; seed < 1000; seed++) {
      const probe = createRngState(seed);
      const x = rngNext(probe) - 0.5;
      const y = rngNext(probe) - 0.5;
      const z = rngNext(probe) - 0.5;
      if (x * x + y * y + z * z > 0.25) break;
    }
    const capped = randomSpatial(createRngState(seed), 100, 1);
    expect(capped.fallback).toBe(true);
    expect(randomSpatial(createRngState(5), 100, 1).fallback).toBe(false);
  });
});

describe("positionInShell", () => {
  it("returns a point at distance in [inner, outer] from the centre", () => {
    const rng = createRngState(21);
    const centre = vec(100, -200, 300);
    for (let i = 0; i < 300; i++) {
      const sample = positionInShell(rng, centre, 600, 51_200);
      const d = dist(sample.position, centre);
      expect(d).toBeGreaterThanOrEqual(600);
      expect(d).toBeLessThanOrEqual(51_200 + 1e-6);
      expect(sample.fallback).toBe(false);
    }
  });

  it("is bounded: an unsatisfiable inner radius tries MAX_PLACEMENT_TRIES candidates and falls back", () => {
    const centre = vec(1, 2, 3);
    const rng = createRngState(33);
    const replay = createRngState(33);
    const sample = positionInShell(rng, centre, 1e9, 100);
    expect(sample.fallback).toBe(true);
    expect(dist(sample.position, centre)).toBeLessThanOrEqual(100 + 1e-9);
    for (let i = 0; i < MAX_PLACEMENT_TRIES; i++) randomSpatial(replay, 100);
    expect(rng.s).toBe(replay.s);
  });
});

describe("positionInCylinder", () => {
  const c1 = vec(0, 0, 0);
  const c2 = vec(0, 0, -400_000);

  it("returns a point outside both exclusion spheres within the radius of the segment", () => {
    const rng = createRngState(44);
    for (let i = 0; i < 300; i++) {
      const sample = positionInCylinder(
        rng,
        c1,
        25_600,
        c2,
        123_480,
        LANE_WIDTH,
      );
      expect(dist(sample.position, c1)).toBeGreaterThanOrEqual(25_600);
      expect(dist(sample.position, c2)).toBeGreaterThanOrEqual(123_480);
      expect(distanceToSegment(sample.position, c1, c2)).toBeLessThanOrEqual(
        LANE_WIDTH + 1e-6,
      );
      expect(sample.fallback).toBe(false);
    }
  });

  it("is bounded: an exclusion sphere covering the lane tries MAX_PLACEMENT_TRIES candidates and falls back", () => {
    const rng = createRngState(55);
    const sample = positionInCylinder(rng, c1, 1e9, c2, 10, 1000);
    expect(sample.fallback).toBe(true);
    const replay = createRngState(55);
    for (let i = 0; i < MAX_PLACEMENT_TRIES; i++) {
      rngNext(replay);
      randomSpatial(replay, 1000);
    }
    expect(rng.s).toBe(replay.s);
  });

  it("reports the second exclusion sphere too", () => {
    const rng = createRngState(56);
    expect(positionInCylinder(rng, c1, 10, c2, 1e9, 1000, 4).fallback).toBe(
      true,
    );
  });
});

describe("locationByCode", () => {
  const planet = layout.planet;
  const sun = layout.sun;

  function inLane(
    p: Vec3,
    a: Vec3,
    exclusionA: number,
    b: Vec3,
    exclusionB: number,
  ): boolean {
    return (
      dist(p, a) >= exclusionA &&
      dist(p, b) >= exclusionB &&
      distanceToSegment(p, a, b) <= LANE_WIDTH + 1e-6
    );
  }

  const lanes: Record<string, (p: Vec3) => boolean> = {
    LANE_WP: (p) =>
      inLane(
        p,
        ORIGIN,
        layout.scannerRange,
        planet.position,
        planet.radius * 3,
      ),
    LANE_WS: (p) =>
      inLane(p, ORIGIN, layout.scannerRange, sun.position, sun.radius * 3),
    LANE_PS: (p) =>
      inLane(
        p,
        planet.position,
        planet.radius * 3,
        sun.position,
        sun.radius * 3,
      ),
  };

  function inAegisShell(p: Vec3, aegisLayout: SystemLayout): boolean {
    const d = dist(p, aegisLayout.station.position);
    return (
      d >= aegisLayout.station.radius * 1.2 &&
      d <= aegisLayout.scannerRange * 2 + 1e-6 &&
      lengthSquared(sub(p, aegisLayout.planet.position)) >=
        aegisLayout.planet.radius * aegisLayout.planet.radius * 1.5
    );
  }

  it("places each single lane code inside its Oolite region", () => {
    for (const code of ["LANE_WP", "LANE_WS", "LANE_PS"] as const) {
      const rng = createRngState(100);
      for (let i = 0; i < 100; i++) {
        const sample = locationByCode(rng, code, layout);
        expect(lanes[code]?.(sample.position)).toBe(true);
        expect(sample.fallback).toBe(false);
      }
    }
  });

  it("LANE_WPS picks one lane by one draw weighted by the lane lengths", () => {
    const l1 = dist(planet.position, ORIGIN);
    const l2 = dist(sun.position, planet.position);
    const l3 = dist(sun.position, ORIGIN);
    const total = l1 + l2 + l3;
    const seen = new Set<string>();
    const rng = createRngState(7);
    for (let i = 0; i < 200; i++) {
      const before = copy(rng);
      const choice = rngNext(copy(before));
      const lane: LocationCode =
        choice < l1 / total
          ? "LANE_WP"
          : choice < (l1 + l2) / total
            ? "LANE_PS"
            : "LANE_WS";
      seen.add(lane);
      // The one draw, then the chosen lane from the next state.
      const after = copy(before);
      rngNext(after);
      const expected = locationByCode(after, lane, layout);
      const actual = locationByCode(rng, "LANE_WPS", layout);
      expect(actual.position).toEqual(expected.position);
      expect(rng.s).toBe(after.s);
    }
    expect(seen.size).toBe(3);
  });

  it("STATION_AEGIS stays in the shell and outside sqrt(1.5) planet radii", () => {
    const rng = createRngState(200);
    for (let i = 0; i < 200; i++) {
      const sample = locationByCode(rng, "STATION_AEGIS", layout);
      expect(inAegisShell(sample.position, layout)).toBe(true);
      expect(sample.fallback).toBe(false);
    }
  });

  it("STATION_AEGIS repeats the shell sample while the point is near the planet", () => {
    // A planet that covers most of the shell forces many repeats.
    const crowded: SystemLayout = {
      ...layout,
      planet: {
        position: vec(
          layout.station.position.x + 60_000,
          layout.station.position.y,
          layout.station.position.z,
        ),
        radius: 40_000,
      },
    };
    const rng = createRngState(201);
    for (let i = 0; i < 50; i++) {
      const sample = locationByCode(rng, "STATION_AEGIS", crowded);
      expect(inAegisShell(sample.position, crowded)).toBe(true);
      expect(sample.fallback).toBe(false);
    }
  });

  it("STATION_AEGIS is bounded: a planet that covers the whole shell falls back after the cap", () => {
    const swallowed: SystemLayout = {
      ...layout,
      planet: { position: layout.station.position, radius: 1e6 },
    };
    const rng = createRngState(202);
    const sample = locationByCode(rng, "STATION_AEGIS", swallowed);
    expect(sample.fallback).toBe(true);
    expect(dist(sample.position, layout.station.position)).toBeLessThanOrEqual(
      layout.scannerRange * 2 + 1e-6,
    );
  });

  it("is deterministic for one stream state", () => {
    const a = locationByCode(createRngState(9), "LANE_WPS", layout);
    const b = locationByCode(createRngState(9), "LANE_WPS", layout);
    expect(a).toEqual(b);
  });
});

describe("randomQuaternion", () => {
  it("is a unit quaternion of four components floor(u * 1024) - 511.5, normalised", () => {
    const rng = createRngState(77);
    for (let i = 0; i < 200; i++) {
      const probe = copy(rng);
      const c = [0, 1, 2, 3].map(
        (): number => Math.floor(rngNext(probe) * 1024) - 511.5,
      );
      const norm = Math.sqrt(c.reduce((sum, v) => sum + v * v, 0));
      const q = randomQuaternion(rng);
      expect(q.w).toBeCloseTo((c[0] ?? 0) / norm, 12);
      expect(q.x).toBeCloseTo((c[1] ?? 0) / norm, 12);
      expect(q.y).toBeCloseTo((c[2] ?? 0) / norm, 12);
      expect(q.z).toBeCloseTo((c[3] ?? 0) / norm, 12);
      expect(
        Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1),
      ).toBeLessThan(1e-9);
      expect(rng.s).toBe(probe.s);
    }
  });
});
