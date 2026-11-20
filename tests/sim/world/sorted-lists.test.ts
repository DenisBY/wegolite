// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's sorted-list order (`Entity.m:247`, 462-467): the lower edge,
 * position minus one collision radius, ascending; Oolite's z is Wegolite's
 * `-z`; ties by ascending id. The z order picks the collision stage's prime
 * (owner decision 2026-11-20).
 */

import { describe, expect, it } from "vitest";

import { vec } from "../../../src/sim/math.js";
import {
  OOLITE_X,
  compareOnAxis,
  compareZOrder,
} from "../../../src/sim/world/sorted-lists.js";

const body = (id: number, x: number, z: number, radius: number) => ({
  id,
  position: vec(x, 0, z),
  radius,
});

describe("Oolite's sorted-list order", () => {
  it("the z list sorts on Oolite's z, Wegolite's -z", () => {
    // Wegolite z 100 is Oolite z -100: first.
    expect(compareZOrder(body(2, 0, 100, 10), body(1, 0, 0, 10))).toBeLessThan(
      0,
    );
    expect(
      compareZOrder(body(1, 0, 0, 10), body(2, 0, 100, 10)),
    ).toBeGreaterThan(0);
  });

  it("by the lower edge: at one z the larger radius comes first", () => {
    // The Cobra (72.7 m) before the nav buoy (59.1 m) at the same z.
    expect(
      compareZOrder(body(1, 0, 0, 72.7), body(6, 0, 0, 59.1)),
    ).toBeLessThan(0);
    // The buoy first once the Cobra's Oolite z is 13.6 m above the buoy's.
    expect(
      compareZOrder(body(1, 0, -13.7, 72.7), body(6, 0, 0, 59.1)),
    ).toBeGreaterThan(0);
  });

  it("ties by ascending id", () => {
    expect(compareZOrder(body(3, 0, 5, 20), body(4, 0, 5, 20))).toBeLessThan(0);
    expect(compareZOrder(body(4, 0, 5, 20), body(3, 0, 5, 20))).toBeGreaterThan(
      0,
    );
  });

  it("x keeps its sign", () => {
    expect(
      compareOnAxis(OOLITE_X, body(1, -50, 0, 10), body(2, 50, 0, 10)),
    ).toBeLessThan(0);
  });
});
