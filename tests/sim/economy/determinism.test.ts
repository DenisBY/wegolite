// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Determinism and the economy-only proof (ECON-01, D-17/D-18).
 *
 * The market is generated once from a persisted uint32 seed. The same
 * `(systemId, marketSeed)` must replay byte-identically, a different seed must
 * move at least one good, and every non-economy system field — name, tech
 * level, government, population, productivity, radius — must leave the result
 * byte-identical. That last case is the proof that the formula is economy-only:
 * Oolite reads nothing else, so neither may this port.
 */

import { describe, expect, it } from "vitest";

import type { System } from "../../../src/content/types.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";

const commodities = commoditiesFixture();
const lave = laveFixture().system;
const laveSeed = marketSeedForSystem(lave.id);

function variety(target: System = lave): System {
  return {
    ...target,
    name: "Not Lave",
    government: 7,
    techLevelRaw: 15,
    population: 99,
    productivity: 1,
    radiusKm: 1234,
    description: "A different system with the same economy.",
    inhabitants: "Nobody",
  };
}

describe("market determinism", () => {
  it("produces a deep-equal market twice from the same system and seed", () => {
    const first = generateMarket(lave, commodities, laveSeed);
    const second = generateMarket(lave, commodities, laveSeed);
    expect(second).toEqual(first);
    // Nothing in the returned value is shared mutable state either.
    expect(second.goods).not.toBe(first.goods);
  });

  it("changes at least one good when the seed changes", () => {
    const baseline = generateMarket(lave, commodities, laveSeed);
    const reseeded = generateMarket(lave, commodities, (laveSeed ^ 1) >>> 0);
    expect(reseeded.seed).toBe((laveSeed ^ 1) >>> 0);
    expect(reseeded).not.toEqual(baseline);
    expect(reseeded.goods).toHaveLength(baseline.goods.length);
  });

  it("ignores every non-economy system field", () => {
    const baseline = generateMarket(lave, commodities, laveSeed);
    const variant = generateMarket(variety(), commodities, laveSeed);
    // Byte-for-byte identical: tech level, government, population,
    // productivity and radius never enter the formula.
    expect(JSON.stringify(variant)).toBe(JSON.stringify(baseline));
  });

  it("keeps the seed inside the uint32 domain", () => {
    expect(Number.isSafeInteger(laveSeed)).toBe(true);
    expect(laveSeed).toBeGreaterThanOrEqual(0);
    expect(laveSeed).toBeLessThanOrEqual(0xffffffff);
  });
});
