// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Pods, hold accounting and the safe half-unit (ECON-03, D-07).
 *
 * Oolite measures hold usage in pods, not mass. The 499/500 kg and 499,999/
 * 500,000 g boundaries are the whole rule; a full 20-pod hold can still accept
 * 499 kg of gold without consuming a pod.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Commodity } from "../../../src/content/types.js";
import type { InternalDamageFacts } from "../../../src/sim/combat/internal-damage.js";
import {
  BASE_CAPACITY_PODS,
  CARGO_BAY_PODS,
  capacityPodsFor,
  emptyCargo,
  holdPods,
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

/**
 * Oolite's in-flight pod list (CBT-08, D-04, plan 19-04): `holdPods` follows
 * `loadCargoPodsForType:fromManifest:` (`PlayerEntity.m:299-357`).
 */
describe("holdPods", () => {
  it("lists tonnes first by sortOrder, with full pods before the dregs pod", () => {
    expect(
      holdPods({ food: 2, gold: 2700, gem_stones: 1_200_000 }, commodities),
    ).toEqual([
      { commodity: "food", amount: 1 },
      { commodity: "food", amount: 1 },
      { commodity: "gold", amount: 1000 },
      { commodity: "gold", amount: 1000 },
      { commodity: "gold", amount: 201 },
      { commodity: "gem_stones", amount: 700_001 },
    ]);
  });

  it("keeps the safe in the manifest and makes no empty pod (kg)", () => {
    expect(holdPods({ gold: 499 }, commodities)).toEqual([]);
    expect(holdPods({ gold: 500 }, commodities)).toEqual([
      { commodity: "gold", amount: 1 },
    ]);
    expect(holdPods({ gold: 1499 }, commodities)).toEqual([
      { commodity: "gold", amount: 1000 },
    ]);
    expect(holdPods({ gold: 1500 }, commodities)).toEqual([
      { commodity: "gold", amount: 1000 },
      { commodity: "gold", amount: 1 },
    ]);
  });

  it("keeps the safe in the manifest and makes no empty pod (g)", () => {
    expect(holdPods({ gem_stones: 499_999 }, commodities)).toEqual([]);
    expect(holdPods({ gem_stones: 500_000 }, commodities)).toEqual([
      { commodity: "gem_stones", amount: 1 },
    ]);
    expect(holdPods({ gem_stones: 1_499_999 }, commodities)).toEqual([
      { commodity: "gem_stones", amount: 1_000_000 },
    ]);
    expect(holdPods({ gem_stones: 1_500_000 }, commodities)).toEqual([
      { commodity: "gem_stones", amount: 1_000_000 },
      { commodity: "gem_stones", amount: 1 },
    ]);
  });

  it("does not depend on the input order of the commodity list", () => {
    const hold = { gem_stones: 600_000, food: 1, gold: 700, furs: 2 };
    const expected = holdPods(hold, commodities);
    expect(holdPods(hold, [...commodities].reverse())).toEqual(expected);
    expect(expected.map((pod) => pod.commodity)).toEqual([
      "food",
      "furs",
      "furs",
      "gold",
      "gem_stones",
    ]);
  });

  it("counts an unknown key as tonnes after the known ones, and skips invalid quantities", () => {
    const hold = { zzz: 2, food: 1, aaa: 1, furs: -3, gold: 1.5, slaves: NaN };
    expect(holdPods(hold, commodities)).toEqual([
      { commodity: "food", amount: 1 },
      { commodity: "aaa", amount: 1 },
      { commodity: "zzz", amount: 1 },
      { commodity: "zzz", amount: 1 },
    ]);
  });

  it("does not mutate its inputs and is assignable to the roll's pods", () => {
    const hold = Object.freeze({ food: 3, gold: 2000 });
    const list = Object.freeze([...commodities]);
    const pods: InternalDamageFacts["pods"] = holdPods(hold, list);
    expect(pods).toHaveLength(holdPodsUsed(hold, units));
    expect(hold).toEqual({ food: 3, gold: 2000 });
  });

  const holdArb = fc.record({
    food: fc.integer({ min: 0, max: 12 }),
    furs: fc.integer({ min: 0, max: 12 }),
    gold: fc.integer({ min: 0, max: 4000 }),
    platinum: fc.integer({ min: 0, max: 4000 }),
    gem_stones: fc.integer({ min: 0, max: 3_000_000 }),
  });

  function multiset(
    pods: readonly { commodity: string; amount: number }[],
  ): string[] {
    return pods.map((pod) => `${pod.commodity}:${pod.amount}`).sort();
  }

  it("is as long as holdPodsUsed for any valid hold", () => {
    fc.assert(
      fc.property(holdArb, (hold) => {
        expect(holdPods(hold, commodities)).toHaveLength(
          holdPodsUsed(hold, units),
        );
      }),
      { seed: 20261931, numRuns: 300 },
    );
  });

  it("matches the re-derived list when one pod leaves the hold", () => {
    fc.assert(
      fc.property(holdArb, fc.nat(), (hold, pick) => {
        const pods = holdPods(hold, commodities);
        if (pods.length === 0) return;
        const index = pick % pods.length;
        const pod = pods[index];
        if (pod === undefined) return;
        const held: Record<string, number> = { ...hold };
        held[pod.commodity] = (held[pod.commodity] ?? 0) - pod.amount;
        const rest = pods.filter((_, i) => i !== index);
        expect(multiset(holdPods(held, commodities))).toEqual(multiset(rest));
      }),
      { seed: 20261932, numRuns: 300 },
    );
  });
});
