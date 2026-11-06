// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The economy-only market generator (ECON-01, ECON-02, D-18).
 *
 * The Lave anchors are research-computed cross-checks, not repo output: they
 * are the strongest available proof that the formula, the float32 grouping,
 * the four-draw order and the system-economy indexing are all correct. Every
 * row is additionally checked as a finite safe integer in its documented range
 * so a malformed coefficient cannot pass on one lucky anchor.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Commodity, System } from "../../../src/content/types.js";
import {
  MARKET_LIMIT,
  economicBias,
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import type { Market } from "../../../src/sim/economy/market.js";
import { createRanrot } from "../../../src/sim/economy/ranrot.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";

const commodities = commoditiesFixture();
const lave = laveFixture().system;

function readSystems(): System[] {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/systems/g0.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as System[];
}

const systems = readSystems();

function system(id: string): System {
  const record = systems.find((candidate) => candidate.id === id);
  if (record === undefined) throw new Error(`no system "${id}"`);
  return record;
}

function marketFor(target: System): Market {
  return generateMarket(target, commodities, marketSeedForSystem(target.id));
}

function good(market: Market, key: string): { price: number; stock: number } {
  const row = market.goods.find((candidate) => candidate.key === key);
  if (row === undefined) throw new Error(`no market good "${key}"`);
  return row;
}

function commodity(key: string): Commodity {
  const record = commodities.find((candidate) => candidate.key === key);
  if (record === undefined) throw new Error(`no commodity "${key}"`);
  return record;
}

describe("Lave anchors", () => {
  it("generates Food 38/16 and Computers 902/0 from the persisted seed", () => {
    const market = marketFor(lave);
    expect(market.seed).toBe(0xd3515f15);
    expect(good(market, "food")).toEqual({ key: "food", price: 38, stock: 16 });
    expect(good(market, "computers")).toEqual({
      key: "computers",
      price: 902,
      stock: 0,
    });
  });

  it("orders the 17 rows by commodity sortOrder", () => {
    const market = marketFor(lave);
    expect(market.goods.map((row) => row.key)).toEqual(
      commodities.map((record) => record.key),
    );
  });

  it("keeps every row a finite safe integer in its documented range", () => {
    for (const target of [lave, system("g0-s129"), system("g0-s55")]) {
      const market = marketFor(target);
      expect(market.goods).toHaveLength(17);
      for (const row of market.goods) {
        expect(Number.isSafeInteger(row.price)).toBe(true);
        expect(Number.isFinite(row.price)).toBe(true);
        expect(row.price).toBeGreaterThanOrEqual(0);
        expect(Number.isSafeInteger(row.stock)).toBe(true);
        expect(row.stock).toBeGreaterThanOrEqual(0);
        expect(row.stock).toBeLessThanOrEqual(MARKET_LIMIT);
      }
    }
  });
});

describe("equal peaks (Narcotics)", () => {
  it("returns exactly 0 before any division when the peaks are equal", () => {
    // Removing the `exDiff === imDiff` early return makes the unguarded branch
    // compute 1 - 0/0 and return NaN.
    expect(economicBias(0, 0, 0)).toBe(0);
    expect(Number.isFinite(economicBias(0, 0, 0))).toBe(true);
  });

  it("generates a finite narcotics price at every golden system", () => {
    for (const id of ["g0-s7", "g0-s129", "g0-s55"]) {
      const market = marketFor(system(id));
      const row = good(market, "narcotics");
      expect(row.price).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(row.price)).toBe(true);
      expect(row.stock).toBeGreaterThanOrEqual(0);
      expect(row.stock).toBeLessThanOrEqual(MARKET_LIMIT);
    }
  });

  it("stays finite at economy 0, the only zero-distance case", () => {
    const synthetic: System = {
      ...lave,
      id: "g0-synthetic-0",
      economy: 0,
    };
    const market = generateMarket(
      synthetic,
      commodities,
      marketSeedForSystem("g0-s7"),
    );
    expect(market.goods).toHaveLength(17);
    for (const row of market.goods) {
      expect(Number.isSafeInteger(row.price)).toBe(true);
      expect(row.price).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(row.stock)).toBe(true);
      expect(row.stock).toBeGreaterThanOrEqual(0);
      expect(row.stock).toBeLessThanOrEqual(MARKET_LIMIT);
    }
    // Narcotics' peaks are 0/0, so economy 0 is the exact exDiff === imDiff
    // zero-distance case the early return exists for.
    expect(
      economicBias(
        0,
        commodity("narcotics").peakExport,
        commodity("narcotics").peakImport,
      ),
    ).toBe(0);
  });
});

describe("RANROT", () => {
  it("pins the first four randf values for seed 0x12345678", () => {
    // Derived independently from legacy_random.c:87-145; a mismatch is an
    // implementation bug, never a reason to edit this vector.
    const random = createRanrot(0x12345678);
    const first = [0, 1, 2, 3].map(() => Math.round(random.randf() * 65536));
    expect(first).toEqual([11060, 14835, 46555, 54929]);
  });

  it("rejects a seed outside the uint32 domain", () => {
    expect(() => createRanrot(-1)).toThrow();
    expect(() => createRanrot(0x1_0000_0000)).toThrow();
    expect(() => createRanrot(1.5)).toThrow();
  });

  it("consumes four draws per commodity, in catalogue order", () => {
    // Inserting one extra four-draw commodity before textiles must shift
    // every later good: quantity is drawn before price and Alien Items is not
    // skipped.
    const baseline = marketFor(lave);
    const extra: Commodity = {
      ...commodity("food"),
      key: "food-inserted",
      sortOrder: 150,
      tradeable: false,
    };
    const shifted = generateMarket(
      lave,
      [...commodities, extra],
      marketSeedForSystem(lave.id),
    );
    expect(shifted.goods).toHaveLength(18);
    expect(good(shifted, "textiles")).not.toEqual(good(baseline, "textiles"));
  });
});
