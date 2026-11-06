// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Pods, hold accounting and the safe half-unit (ECON-03, D-07).
 *
 * Oolite measures hold usage in pods, not mass. The 499/500 kg and 499,999/
 * 500,000 g boundaries are the whole rule; a full 20-pod hold can still accept
 * 499 kg of gold without consuming a pod.
 */

import { describe, expect, it } from "vitest";

import type { Commodity } from "../../../src/content/types.js";
import {
  BASE_CAPACITY_PODS,
  CARGO_BAY_PODS,
  capacityPodsFor,
  emptyCargo,
  holdPodsUsed,
  maxAdditional,
  podsFor,
  setCargo,
} from "../../../src/sim/economy/cargo.js";
import {
  commoditiesFixture,
  commodityUnits,
} from "../../helpers/commodities.js";

const commodities: readonly Commodity[] = commoditiesFixture();
const units = commodityUnits(commodities);

describe("podsFor", () => {
  it("counts a bulk tonne as one pod", () => {
    expect(podsFor("t", 20)).toBe(20);
    expect(holdPodsUsed({ food: 20 }, units)).toBe(20);
  });

  it("keeps 0..499 kg in the safe", () => {
    expect(podsFor("kg", 0)).toBe(0);
    expect(podsFor("kg", 499)).toBe(0);
    expect(podsFor("kg", 500)).toBe(1);
    expect(podsFor("kg", 1499)).toBe(1);
    expect(podsFor("kg", 1500)).toBe(2);
  });

  it("keeps 0..499,999 g in the safe", () => {
    expect(podsFor("g", 499_999)).toBe(0);
    expect(podsFor("g", 500_000)).toBe(1);
    expect(podsFor("g", 1_499_999)).toBe(1);
    expect(podsFor("g", 1_500_000)).toBe(2);
  });
});

describe("capacity", () => {
  it("is 20 t, plus 15 t for a cargo bay, minus 5 t per berth", () => {
    expect(capacityPodsFor([], 0)).toBe(BASE_CAPACITY_PODS);
    expect(capacityPodsFor(["EQ_CARGO_BAY"], 0)).toBe(
      BASE_CAPACITY_PODS + CARGO_BAY_PODS,
    );
    expect(capacityPodsFor(["EQ_CARGO_BAY"], 2)).toBe(35 - 10);
    expect(capacityPodsFor([], 1)).toBe(15);
  });

  it("is deliberately unclamped so corrupt state stays visible", () => {
    expect(capacityPodsFor([], 8)).toBe(-20);
  });
});

describe("maxAdditional", () => {
  it("offers 499 kg in a hold already full of other cargo", () => {
    expect(maxAdditional("kg", 0, 20, 20)).toBe(499);
    expect(maxAdditional("g", 0, 20, 20)).toBe(499_999);
  });

  it("offers 20,499 kg in an empty 20-pod hold", () => {
    expect(maxAdditional("kg", 0, 0, 20)).toBe(20_499);
  });

  it("subtracts goods of the same commodity already held", () => {
    expect(maxAdditional("kg", 499, 19, 20)).toBe(1000);
    expect(maxAdditional("kg", 100, 19, 20)).toBe(1399);
  });

  it("never returns a negative amount", () => {
    expect(maxAdditional("kg", 5000, 20, 20)).toBe(0);
  });
});

describe("emptyCargo and setCargo", () => {
  it("creates a null-prototype map and never mutates its input", () => {
    const empty = emptyCargo();
    expect(Object.getPrototypeOf(empty)).toBeNull();

    const next = setCargo(empty, "food", 3);
    expect(next).toEqual({ food: 3 });
    expect(empty).toEqual({});
    expect(Object.getPrototypeOf(next)).toBeNull();
  });

  it("omits a zero entry instead of keeping a ghost row", () => {
    const cargo = setCargo(emptyCargo(), "food", 2);
    expect(setCargo(cargo, "food", 0)).toEqual({});
  });
});
