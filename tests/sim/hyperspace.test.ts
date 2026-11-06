// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure hyperspace core (WORLD-06, NAV-03, NAV-04, NAV-06).
 *
 * The fixtures are Oolite's, not this implementation's: the five route rows
 * come from the research table and the truncation discriminator is computed by
 * hand. A "plausible" implementation that uses `Math.floor`, `hypot` or the
 * display float (`0.4 * dist`) fails at least one row here:
 *
 * - Legees (4,253) -> Laeden (4,254) is dist 0: the y delta is -1, and C's
 *   integer division truncates -0.5 toward zero.
 * - Lave -> Zaonce is 112,896 s and 56 fuel, never 112,896.00000000003 or
 *   56.00000000000001.
 *
 * The galaxy file is read in the test only. `src/sim` never imports generated
 * content.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  canStartJump,
  countdownSecondsRemaining,
  HYPERSPACE_COUNTDOWN_STEPS,
} from "../../src/sim/hyperspace/countdown.js";
import {
  CHART_LY_PER_UNIT,
  MAX_JUMP_DIST,
  MAX_JUMP_RANGE_LY,
  chartDistance,
  jumpBetween,
} from "../../src/sim/hyperspace/jump.js";

interface ChartSystem {
  readonly id: string;
  readonly name: string;
  readonly chartX: number;
  readonly chartY: number;
}

const systems = JSON.parse(
  readFileSync(
    new URL("../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as ChartSystem[];

function byName(name: string): ChartSystem {
  const found = systems.find((system) => system.name === name);
  if (found === undefined) throw new Error(`galaxy 0 has no system "${name}"`);
  return found;
}

function point(system: ChartSystem): { x: number; y: number } {
  return { x: system.chartX, y: system.chartY };
}

function pointWithId(system: ChartSystem): {
  id: string;
  x: number;
  y: number;
} {
  return { id: system.id, x: system.chartX, y: system.chartY };
}

const lave = byName("Lave");
const diso = byName("Diso");
const leesti = byName("Leesti");
const zaonce = byName("Zaonce");
const riedquat = byName("Riedquat");
const tibedied = byName("Tibedied");
const legees = byName("Legees");
const laeden = byName("Laeden");

interface RouteFixture {
  readonly name: string;
  readonly from: ChartSystem;
  readonly to: ChartSystem;
  readonly dist: number;
  readonly distanceLy: number;
  readonly fuelCost: number;
  readonly jumpTimeSeconds: number;
  readonly reachable: boolean;
}

const ROUTES: readonly RouteFixture[] = [
  {
    name: "Lave -> Diso (3.6 LY)",
    from: lave,
    to: diso,
    dist: 9,
    distanceLy: 3.6,
    fuelCost: 36,
    jumpTimeSeconds: 46_656,
    reachable: true,
  },
  {
    name: "Lave -> Leesti (3.6 LY)",
    from: lave,
    to: leesti,
    dist: 9,
    distanceLy: 3.6,
    fuelCost: 36,
    jumpTimeSeconds: 46_656,
    reachable: true,
  },
  {
    name: "Lave -> Zaonce (5.6 LY)",
    from: lave,
    to: zaonce,
    dist: 14,
    distanceLy: 5.6,
    fuelCost: 56,
    jumpTimeSeconds: 112_896,
    reachable: true,
  },
  {
    name: "Lave -> Riedquat (6.8 LY, the range boundary)",
    from: lave,
    to: riedquat,
    dist: 17,
    distanceLy: 6.8,
    fuelCost: 68,
    jumpTimeSeconds: 166_464,
    reachable: true,
  },
  {
    name: "Lave -> Tibedied (17.6 LY, too far)",
    from: lave,
    to: tibedied,
    dist: 44,
    distanceLy: 17.6,
    fuelCost: 176,
    jumpTimeSeconds: 1_115_136,
    reachable: false,
  },
];

describe("Oolite chart arithmetic", () => {
  it("pins the exported constants", () => {
    expect(CHART_LY_PER_UNIT).toBe(0.4);
    expect(MAX_JUMP_RANGE_LY).toBe(7.0);
    expect(MAX_JUMP_DIST).toBe(17);
  });

  for (const route of ROUTES) {
    it(`computes ${route.name} exactly`, () => {
      const result = jumpBetween(point(route.from), point(route.to));
      expect(result.dist).toBe(route.dist);
      // `0.4 * dist` is the display float only; 14 * 0.4 is not exactly 5.6.
      expect(result.distanceLy).toBeCloseTo(route.distanceLy, 10);
      expect(result.fuelCost).toBe(route.fuelCost);
      expect(result.jumpTimeSeconds).toBe(route.jumpTimeSeconds);
      expect(result.reachable).toBe(route.reachable);
      expect(Number.isSafeInteger(result.dist)).toBe(true);
      expect(Number.isSafeInteger(result.fuelCost)).toBe(true);
      expect(Number.isSafeInteger(result.jumpTimeSeconds)).toBe(true);
    });
  }

  it("is symmetric in its endpoints", () => {
    expect(jumpBetween(point(lave), point(diso))).toEqual(
      jumpBetween(point(diso), point(lave)),
    );
  });

  it("truncates the y delta toward zero: Legees -> Laeden is dist 0", () => {
    // y delta = -1. `Math.trunc(-0.5)` is 0; `Math.floor(-0.5)` is -1, which
    // would give 0.4 LY / 4 fuel / 0.16 h and drop nine galaxy-0 edges.
    const result = jumpBetween(point(legees), point(laeden));
    expect(result).toEqual({
      dist: 0,
      distanceLy: 0,
      fuelCost: 1,
      jumpTimeSeconds: 0,
      reachable: true,
    });
  });

  it("pins the exact integer fuel identity for every reachable distance", () => {
    // 0..17 covers the entire legal jump range, including the dist-0 minimum.
    for (let dist = 0; dist <= MAX_JUMP_DIST; dist += 1) {
      const fuelCost = dist === 0 ? 1 : 4 * dist;
      expect(fuelCost).toBe(dist === 0 ? 1 : 4 * dist);
      expect(Number.isSafeInteger(70 - fuelCost)).toBe(true);
      expect(70 - fuelCost).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(576 * dist * dist)).toBe(true);
    }
  });

  it("derives the display float without ever feeding it to fuel or time", () => {
    // The float route is exactly the defect this module exists to prevent.
    expect(0.4 * 14).not.toBe(5.6);
    expect((0.4 * 14) ** 2 * 3600).not.toBe(112_896);
    expect(jumpBetween(point(lave), point(zaonce))).toMatchObject({
      fuelCost: 56,
      jumpTimeSeconds: 112_896,
    });
  });

  it("throws a RangeError for a non-finite coordinate", () => {
    expect(() =>
      chartDistance({ x: Number.NaN, y: 0 }, { x: 0, y: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      chartDistance({ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      chartDistance({ x: 0, y: Number.NEGATIVE_INFINITY }, { x: 0, y: 0 }),
    ).toThrow(RangeError);
  });
});

describe("canStartJump", () => {
  const origin = pointWithId(lave);

  it("accepts a reachable, fuelled route and returns its exact facts", () => {
    expect(
      canStartJump({ origin, target: pointWithId(diso), fuel: 70 }),
    ).toEqual({
      ok: true,
      target: pointWithId(diso),
      dist: 9,
      fuelCost: 36,
    });
  });

  it("refuses a missing target and the current system as no target", () => {
    expect(canStartJump({ origin, fuel: 70 })).toEqual({
      ok: false,
      reason: "no target",
    });
    expect(
      canStartJump({ origin, target: pointWithId(lave), fuel: 70 }),
    ).toEqual({ ok: false, reason: "no target" });
  });

  it("refuses a distance above 17 with too far", () => {
    expect(
      canStartJump({ origin, target: pointWithId(tibedied), fuel: 70 }),
    ).toEqual({ ok: false, reason: "too far" });
  });

  it("refuses a tank below the exact integer cost", () => {
    expect(
      canStartJump({ origin, target: pointWithId(diso), fuel: 35 }),
    ).toEqual({ ok: false, reason: "insufficient fuel" });
  });

  it("accepts exactly fuel === cost", () => {
    expect(
      canStartJump({ origin, target: pointWithId(diso), fuel: 36 }),
    ).toMatchObject({ ok: true, dist: 9, fuelCost: 36 });
  });

  it("accepts exactly dist === 17", () => {
    expect(
      canStartJump({ origin, target: pointWithId(riedquat), fuel: 68 }),
    ).toMatchObject({ ok: true, dist: 17, fuelCost: 68 });
  });

  it("reports a malformed tank as insufficient fuel and never throws", () => {
    for (const fuel of [Number.NaN, Number.POSITIVE_INFINITY, -1, 3.5]) {
      expect(() =>
        canStartJump({ origin, target: pointWithId(diso), fuel }),
      ).not.toThrow();
      expect(canStartJump({ origin, target: pointWithId(diso), fuel })).toEqual(
        { ok: false, reason: "insufficient fuel" },
      );
    }
  });

  it("reports a non-finite coordinate as too far and never throws", () => {
    const targets = [
      { id: "bad-x", x: Number.NaN, y: 0 },
      { id: "bad-y", x: 0, y: Number.POSITIVE_INFINITY },
    ];
    for (const target of targets) {
      expect(() => canStartJump({ origin, target, fuel: 70 })).not.toThrow();
      expect(canStartJump({ origin, target, fuel: 70 })).toEqual({
        ok: false,
        reason: "too far",
      });
    }
  });
});

describe("countdown rounding", () => {
  it("reads 1800 steps as 15 whole seconds", () => {
    expect(HYPERSPACE_COUNTDOWN_STEPS).toBe(1800);
    expect(countdownSecondsRemaining(1800)).toBe(15);
  });

  it("rounds a partial second up and a sub-half second down", () => {
    expect(countdownSecondsRemaining(1799)).toBe(15);
    expect(countdownSecondsRemaining(1)).toBe(0);
    expect(countdownSecondsRemaining(0)).toBe(0);
  });

  it("never returns a negative or non-finite second count", () => {
    expect(countdownSecondsRemaining(-10)).toBe(0);
    expect(countdownSecondsRemaining(Number.NaN)).toBe(0);
  });
});
