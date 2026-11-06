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
  otherPodsFor,
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

describe("otherPodsFor", () => {
  it("sums every entry except the excluded commodity", () => {
    const cargo = setCargo(setCargo(emptyCargo(), "food", 19), "gold", 600);
    expect(otherPodsFor(cargo, units, "gold")).toBe(19);
    expect(otherPodsFor(cargo, units, "food")).toBe(podsFor("kg", 600));
    expect(otherPodsFor(cargo, units, "furs")).toBe(19 + podsFor("kg", 600));
  });

  it("returns 0 for an empty hold and for the only entry", () => {
    expect(otherPodsFor(emptyCargo(), units, "gold")).toBe(0);
    const gold = setCargo(emptyCargo(), "gold", 1_499);
    expect(otherPodsFor(gold, units, "gold")).toBe(0);
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
    expect(maxAdditional("g", 0, 0, 20)).toBe(20_499_999);
  });

  it("subtracts goods of the same commodity already held", () => {
    expect(maxAdditional("kg", 499, 19, 20)).toBe(1000);
    expect(maxAdditional("kg", 100, 19, 20)).toBe(1399);
  });

  it("counts the pod the held good already occupies (1,499 kg + free pods)", () => {
    // 20 pods hold 20,499 kg, so 1,499 kg already aboard leave 19,000 more.
    expect(maxAdditional("kg", 1_499, 0, 20)).toBe(19_000);
    // 19 t of bulk goods + 600 kg of gold still leave 899 kg in the gold pod.
    expect(maxAdditional("kg", 600, 19, 20)).toBe(899);
    // The gram analog: 500,000 g aboard already uses one pod, so a 19-pod
    // occupied hold leaves 1,499,999 g total, i.e. 999,999 g more.
    expect(maxAdditional("g", 500_000, 19, 20)).toBe(999_999);
  });

  it("never returns a negative amount", () => {
    expect(maxAdditional("kg", 5000, 20, 20)).toBe(0);
    expect(maxAdditional("g", 25_000_000, 20, 20)).toBe(0);
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
