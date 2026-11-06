// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Independent reference vectors for the economy formula (ECON-01, T-05-18).
 *
 * These are the correctness oracle: every expected value below is hand-derived
 * from `/home/opencode/git/oolite/src/Core/OOCommodities.m:261-278,383-452` and
 * `05-RESEARCH.md` §Economy Formula, never read back from `generateMarket`.
 * The committed fixtures under `tests/golden/market/` are REGRESSION snapshots
 * written by the implementation; they detect drift but cannot prove the formula.
 *
 * Provenance rule: never regenerate this file from `generateMarket` or
 * `createRanrot`, and never derive an oracle value by calling either. The
 * RANROT vector for seed `0x12345678` lives in `market.test.ts` and is cited,
 * not re-derived, here.
 *
 * Each synthetic case replaces exactly one record in the full 17-record array
 * with a spread of an existing generated record — no schema bypass — and sets
 * its random coefficients to 0. Its output then depends only on its averages,
 * its economic coefficient and the bias, whatever RANROT draws precede it.
 */

import { describe, expect, it } from "vitest";

import type { Commodity } from "../../../src/content/types.js";
import {
  economicBias,
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import type { MarketGood } from "../../../src/sim/economy/market.js";
import { commoditiesFixture } from "../../helpers/commodities.js";

const commodities = commoditiesFixture();

/** The four random draws cannot move a synthetic row. */
const NO_RANDOM = { priceRandom: 0, quantityRandom: 0 } as const;

/** Replace one record in the full catalogue with a spread of itself. */
function withRecord(key: string, overrides: Partial<Commodity>) {
  return commodities.map((record) =>
    record.key === key ? { ...record, ...overrides } : record,
  );
}

/** Generate the synthetic market and return one row. */
function rowOf(
  records: readonly Commodity[],
  economy: number,
  key: string,
): MarketGood {
  const market = generateMarket(
    { id: "g0-synthetic", economy },
    records,
    marketSeedForSystem("g0-synthetic"),
  );
  const row = market.goods.find((candidate) => candidate.key === key);
  if (row === undefined) throw new Error(`no synthetic row "${key}"`);
  return row;
}

/**
 * The bias for economy 5 with `peak_export = 7` and `peak_import = 0`, derived
 * by hand from `OOCommodities.m:431-452`:
 *
 *   exDiff = |5 - 7| * 2 = 4, imDiff = |5 - 0| * 2 = 10, distance = 7
 *   exDiff < imDiff, so bias = 1 - (float)(4 / 7)
 *   4 / 7 is rounded to float32 first (0.5714285969734192),
 *   1 - 0.5714285969734192 = 0.4285714030265808
 */
const ECONOMY_5_BIAS = 0.4285714030265808;

describe("reference vectors: quantity and price boundaries", () => {
  it("caps the generated quantity at 127 (OOCommodities.m:264-270)", () => {
    // The cap applies to the generated quantity before it is stored, so 128
    // becomes exactly 127 while 126 and 127 are untouched.
    for (const [average, expected] of [
      [126, 126],
      [127, 127],
      [128, 127],
    ] as const) {
      const records = withRecord("food", {
        ...NO_RANDOM,
        quantityAverage: average,
        quantityEconomic: 0,
        priceEconomic: 0,
      });
      expect(rowOf(records, 5, "food").stock).toBe(expected);
    }
  });

  it("never caps a price above 127 (OOCommodities.m:403-406)", () => {
    // priceAverage 100, priceEconomic -1000, bias 7/0 at economy 5:
    // econ = 100 * -1000 * -0.4285714030265808 = 42857.140625 (float32)
    // base = 100 + 42857.140625 = 42957.140625, truncated toward zero.
    const records = withRecord("food", {
      ...NO_RANDOM,
      priceAverage: 100,
      priceEconomic: -1000,
    });
    expect(rowOf(records, 5, "food").price).toBe(42957);
  });

  it("floors a negative price at zero", () => {
    // priceAverage 100, priceEconomic +1000: econ = -42857.14, total < 0.
    const records = withRecord("food", {
      ...NO_RANDOM,
      priceAverage: 100,
      priceEconomic: 1000,
    });
    expect(rowOf(records, 5, "food").price).toBe(0);
  });

  it("floors a negative quantity at zero", () => {
    // quantityAverage 100, quantityEconomic -1000: total < 0 before truncation.
    const records = withRecord("food", {
      ...NO_RANDOM,
      quantityAverage: 100,
      quantityEconomic: -1000,
      priceEconomic: 0,
    });
    expect(rowOf(records, 5, "food").stock).toBe(0);
  });

  it("groups the float32 chain so 4 + (4 * -1.75 * -bias) truncates to 7", () => {
    // b = fround(1 - fround(4/7)) = 0.4285714030265808 (OOCommodities.m:442-452)
    // econ = fround(4 * -1.75) * fround(-b) = 2.999999761581421 (float32)
    // total = fround(4 + 2.999999761581421) = 7.0 (half-ulp tie, ties-to-even)
    // trunc(7.0) = 7. An all-double chain keeps 6.9999998211860656 -> 6.
    expect(ECONOMY_5_BIAS).toBe(Math.fround(1 - Math.fround(4 / 7)));
    expect(economicBias(5, 7, 0)).toBe(ECONOMY_5_BIAS);

    const records = withRecord("food", {
      ...NO_RANDOM,
      priceAverage: 4,
      priceEconomic: -1.75,
    });
    expect(rowOf(records, 5, "food").price).toBe(7);
  });
});

describe("reference vectors: equal peaks (Narcotics)", () => {
  it("returns exactly 0 before any division at economy 0", () => {
    // OOCommodities.m:442-445: Narcotics has peak_export = peak_import = 0, so
    // at economy 0 exDiff === imDiff === 0 and the early return runs before
    // `imDiff / distance` could divide 0 by 0.
    expect(
      commodities.find((record) => record.key === "narcotics"),
    ).toMatchObject({
      peakExport: 0,
      peakImport: 0,
      priceAverage: 512,
      quantityAverage: 32,
    });
    expect(economicBias(0, 0, 0)).toBe(0);
    expect(Math.fround(1 - Math.fround(0 / 0))).toBeNaN();
  });

  it("generates price 512 and stock 32 from the averages at economy 0", () => {
    // With the random coefficients at 0, Narcotics' zero economic coefficients
    // leave base + 0 + 0: price 512, quantity 32. Removing the early return
    // would make the bias NaN and both values NaN.
    const records = withRecord("narcotics", NO_RANDOM);
    const row = rowOf(records, 0, "narcotics");
    expect(row.price).toBe(512);
    expect(row.stock).toBe(32);
    expect(Number.isSafeInteger(row.price)).toBe(true);
    expect(Number.isSafeInteger(row.stock)).toBe(true);
    expect(row.stock).toBeLessThanOrEqual(127);
  });
});
