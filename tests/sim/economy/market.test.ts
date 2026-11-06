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
 *
 * The committed `tests/golden/market/*.json` files are REGRESSION snapshots:
 * the writer and this test both call `generateMarket`, so they are not
 * correctness proof; `reference-vectors.test.ts` is the independent oracle.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Commodity, System } from "../../../src/content/types.js";
import {
  MARKET_LIMIT,
  arrivalMarketSeed,
  economicBias,
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import { fnv1a32 } from "../../../src/sim/hash.js";
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

interface MarketSnapshot {
  readonly version: number;
  readonly systemId: string;
  readonly marketSeed: number;
  readonly goods: ReadonlyArray<{
    readonly key: string;
    readonly price: number;
    readonly stock: number;
  }>;
}

/** Lave agricultural, Zaonce industrial, Leesti high-tech, all D-20 fixtures. */
const GOLDENS = [
  { systemId: "g0-s7", file: "lave.json" },
  { systemId: "g0-s129", file: "zaonce.json" },
  { systemId: "g0-s55", file: "leesti.json" },
] as const;

function readGolden(file: string): MarketSnapshot {
  return JSON.parse(
    readFileSync(
      new URL(`../../golden/market/${file}`, import.meta.url),
      "utf8",
    ),
  ) as MarketSnapshot;
}

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

  it("matches the research cross-checks at Zaonce and Leesti", () => {
    // CROSS-CHECKS, not absolute truth: the expected values are the research
    // table's, computed independently of this implementation. A one-decicredit
    // or one-unit difference means the float32 grouping or the draw order is
    // wrong — reconcile those first, never edit the anchor.
    const zaonce = marketFor(system("g0-s129"));
    expect(good(zaonce, "food")).toEqual({ key: "food", price: 70, stock: 8 });
    expect(good(zaonce, "computers")).toEqual({
      key: "computers",
      price: 682,
      stock: 43,
    });

    const leesti = marketFor(system("g0-s55"));
    expect(good(leesti, "food")).toEqual({ key: "food", price: 62, stock: 10 });
    expect(good(leesti, "computers")).toEqual({
      key: "computers",
      price: 731,
      stock: 30,
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

describe("regression goldens (REGRESSION snapshots, not correctness proof)", () => {
  // Both this test and `tests/helpers/write-market-goldens.ts` call
  // `generateMarket`, so these fixtures detect drift only. The independent
  // oracle is `reference-vectors.test.ts`.
  for (const golden of GOLDENS) {
    it(`matches tests/golden/market/${golden.file} exactly`, () => {
      const target = system(golden.systemId);
      const fixture = readGolden(golden.file);

      expect(fixture.version).toBe(1);
      expect(fixture.systemId).toBe(target.id);
      expect(fixture.marketSeed).toBe(marketSeedForSystem(target.id));
      expect(fixture.goods).toHaveLength(17);

      // Row order is the catalogue's sortOrder, not the fixture's file order.
      expect(fixture.goods.map((row) => row.key)).toEqual(
        commodities.map((record) => record.key),
      );
      expect(fixture.goods.map((row) => commodity(row.key).sortOrder)).toEqual(
        commodities.map((record) => record.sortOrder),
      );

      const market = marketFor(target);
      expect(market.seed).toBe(fixture.marketSeed);
      expect(market.goods).toEqual(fixture.goods);
    });
  }
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

describe("arrival market seed", () => {
  const previousSeed = marketSeedForSystem(lave.id);

  it("matches the exact FNV word for the route chain", () => {
    const expected =
      Number.parseInt(
        fnv1a32(`${"g0-s147"}:${String(previousSeed)}:arrival`),
        16,
      ) >>> 0;
    expect(arrivalMarketSeed("g0-s147", previousSeed)).toBe(expected);
  });

  it("is stable for the same destination and previous seed", () => {
    expect(arrivalMarketSeed("g0-s129", previousSeed)).toBe(
      arrivalMarketSeed("g0-s129", previousSeed),
    );
  });

  it("differs for a different destination or a different previous seed", () => {
    expect(arrivalMarketSeed("g0-s129", previousSeed)).not.toBe(
      arrivalMarketSeed("g0-s147", previousSeed),
    );
    expect(arrivalMarketSeed("g0-s129", previousSeed)).not.toBe(
      arrivalMarketSeed("g0-s129", previousSeed + 1),
    );
  });

  it("always returns a uint32 safe integer", () => {
    for (const target of ["g0-s7", "g0-s129", "g0-s147"]) {
      const seed = arrivalMarketSeed(target, previousSeed);
      expect(Number.isSafeInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xff_ff_ff_ff);
    }
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
