// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The economy-only market generator (ECON-01, ECON-02, D-17/D-18).
 *
 * This is Oolite's `OOCommodities.m:261-278,383-452` ported exactly: quantity
 * is drawn before price, every commodity (including Alien Items) consumes four
 * `randf()` draws, and every intermediate is a 32-bit float. A double-only port
 * differs by one decicredit at truncation, which is a fixture divergence rather
 * than a rounding preference.
 *
 * The market is generated once per system seed. A `docked` event never
 * regenerates or re-seeds it; the seed is persisted so a reload replays the
 * same prices. `marketSeedForSystem` is the only seed derivation and it uses
 * the repository's FNV-1a hash, never a clock or the global random source.
 */

import type { Commodity, System } from "../../content/types.js";
import { fnv1a32 } from "../hash.js";
import { createRanrot } from "./ranrot.js";

/** `MAIN_SYSTEM_MARKET_LIMIT` (`OOCommodities.h:29`). */
export const MARKET_LIMIT = 127;

export interface MarketGood {
  readonly key: string;
  /** Integer decicredits per unit (t, kg or g). */
  readonly price: number;
  /** Units on the station's shelf, 0..127. */
  readonly stock: number;
}

export interface Market {
  readonly systemId: string;
  readonly seed: number;
  readonly goods: readonly MarketGood[];
}

/** The stable uint32 seed for a system's first generation (D-18). */
export function marketSeedForSystem(systemId: string): number {
  return Number.parseInt(fnv1a32(`${systemId}:0`), 16) >>> 0;
}

/**
 * The stable uint32 seed for the market generated on hyperspace arrival
 * (NAV-05, D-10).
 *
 * The destination id is chained with the seed of the market that was actually
 * installed in the origin system, so a repeat visit produces a new market while
 * the same route from the same chain always produces the same one. Never a
 * clock and never global randomness.
 */
export function arrivalMarketSeed(
  targetId: string,
  previousSeed: number,
): number {
  return (
    Number.parseInt(fnv1a32(`${targetId}:${String(previousSeed)}:arrival`), 16) >>>
    0
  );
}

/**
 * Oolite's `economicBiasForGood` (`OOCommodities.m:431-452`).
 *
 * The equal-peaks early return is load-bearing: Narcotics has
 * `peak_export = peak_import = 0`, so at economy 0 the distance is zero and the
 * unguarded branches would divide `0/0` and return `NaN`. Returning exactly
 * `0` before any division keeps every price a finite integer.
 */
export function economicBias(
  economy: number,
  peakExport: number,
  peakImport: number,
): number {
  const exDiff = Math.abs(economy - peakExport) * 2;
  const imDiff = Math.abs(economy - peakImport) * 2;
  const distance = (exDiff + imDiff) / 2;

  if (exDiff === imDiff) return 0;

  if (exDiff > imDiff) {
    const quotient = Math.fround(Math.fround(imDiff) / Math.fround(distance));
    return Math.fround(-Math.fround(1 - quotient));
  }

  const quotient = Math.fround(Math.fround(exDiff) / Math.fround(distance));
  return Math.fround(1 - quotient);
}

/** The 32-bit-float triangular term `base * coefficient * (r1 - r2)`. */
function randomTerm(
  randf: () => number,
  base: number,
  coefficient: number,
): number {
  // The left randf() is evaluated first, matching the documented C order.
  const first = randf();
  const second = randf();
  return Math.fround(
    Math.fround(base * Math.fround(coefficient)) * Math.fround(first - second),
  );
}

function generateQuantity(
  randf: () => number,
  commodity: Commodity,
  bias: number,
): number {
  const base = Math.fround(commodity.quantityAverage);
  const economic = Math.fround(
    Math.fround(base * Math.fround(commodity.quantityEconomic)) * bias,
  );
  const random = randomTerm(randf, base, commodity.quantityRandom);
  const total = Math.fround(base + Math.fround(economic + random));
  if (total < 0) return 0;
  return Math.trunc(total);
}

function generatePrice(
  randf: () => number,
  commodity: Commodity,
  bias: number,
): number {
  const base = Math.fround(commodity.priceAverage);
  const economic = Math.fround(
    Math.fround(base * Math.fround(commodity.priceEconomic)) *
      Math.fround(-bias),
  );
  const random = randomTerm(randf, base, commodity.priceRandom);
  const total = Math.fround(base + Math.fround(economic + random));
  if (total < 0) return 0;
  return Math.trunc(total);
}

/**
 * Generate a system's market from the persisted seed.
 *
 * Goods are sorted by `sortOrder`, which is the stable iteration order Oolite's
 * dictionary does not provide. Stock is capped at `MARKET_LIMIT`; price is
 * never capped.
 */
export function generateMarket(
  system: Pick<System, "id" | "economy">,
  commodities: readonly Commodity[],
  seed: number,
): Market {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(
      `Wegolite: market seed must be a uint32, received ${String(seed)}.`,
    );
  }
  if (!Number.isSafeInteger(system.economy)) {
    throw new Error(
      `Wegolite: system economy must be an integer, received ${String(
        system.economy,
      )}.`,
    );
  }

  const randf = (() => {
    const stream = createRanrot(seed);
    return () => stream.randf();
  })();

  const sorted = [...commodities].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  const goods: MarketGood[] = [];
  for (const commodity of sorted) {
    const bias = economicBias(
      system.economy,
      commodity.peakExport,
      commodity.peakImport,
    );
    const quantity = generateQuantity(randf, commodity, bias);
    const stock = Math.min(MARKET_LIMIT, quantity);
    const price = generatePrice(randf, commodity, bias);
    goods.push({ key: commodity.key, price, stock });
  }

  return { systemId: system.id, seed, goods };
}
