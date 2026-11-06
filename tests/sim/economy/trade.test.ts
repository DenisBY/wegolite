// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The trusted buy path (ECON-02, ECON-04, T-05-06, T-05-19).
 *
 * `planBuy` is pure and validates before dividing; `applyBuy` re-runs it and
 * refuses on any mismatch. Credits never go negative, the price never moves,
 * and only the traded good's stock changes.
 */

import { describe, expect, it } from "vitest";

import { emptyCargo, setCargo } from "../../../src/sim/economy/cargo.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import type { Market } from "../../../src/sim/economy/market.js";
import { applyBuy, planBuy } from "../../../src/sim/economy/trade.js";
import type { BuyRequest } from "../../../src/sim/economy/trade.js";
import { newProfile, setCredits } from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";
import {
  commoditiesFixture,
  commodityUnits,
} from "../../helpers/commodities.js";

const commodities = commoditiesFixture();
const units = commodityUnits(commodities);

function commodity(key: string) {
  const record = commodities.find((candidate) => candidate.key === key);
  if (record === undefined) throw new Error(`no commodity "${key}"`);
  return record;
}

function profileWith(
  credits: number,
  cargo: Record<string, number> = {},
  equipment: string[] = [],
  passengerBerths = 0,
): PlayerProfile {
  const next = setCredits(newProfile(), credits);
  let held = emptyCargo();
  for (const [key, quantity] of Object.entries(cargo)) {
    held = setCargo(held, key, quantity);
  }
  return { ...next, cargo: held, equipment, passengerBerths };
}

function marketWith(
  rows: ReadonlyArray<{ key: string; price: number; stock: number }>,
): Market {
  return {
    systemId: "g0-s7",
    seed: 1,
    goods: rows,
  };
}

function buyRequest(
  market: Market,
  profile: PlayerProfile,
  key: string,
  amount: number,
): BuyRequest {
  return { market, profile, commodity: commodity(key), units, amount };
}

describe("planBuy", () => {
  it("buys exactly floor(credits / price) and clamps one more", () => {
    const price = 38;
    const market = marketWith([{ key: "food", price, stock: 50 }]);
    const profile = profileWith(price * 10);

    const exact = planBuy(buyRequest(market, profile, "food", 10));
    expect(exact).toEqual({
      ok: true,
      side: "buy",
      key: "food",
      amount: 10,
      cost: price * 10,
    });

    const oneMore = planBuy(buyRequest(market, profile, "food", 11));
    expect(oneMore.ok).toBe(true);
    expect(oneMore.amount).toBe(10);
    expect(oneMore.cost).toBe(price * 10);
    expect(oneMore.clamp).toBe("insufficientCredits");
  });

  it("clamps to stock first and explains it", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 3 }]);
    const plan = planBuy(buyRequest(market, profileWith(100_000), "food", 20));
    expect(plan.ok).toBe(true);
    expect(plan.amount).toBe(3);
    expect(plan.clamp).toBe("noStock");
  });

  it("refuses invalid prices and amounts before dividing", () => {
    for (const price of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const market = marketWith([{ key: "food", price, stock: 10 }]);
      expect(
        planBuy(buyRequest(market, profileWith(1000), "food", 1)),
      ).toMatchObject({ ok: false, refusal: "invalidPrice" });
    }

    const market = marketWith([{ key: "food", price: 38, stock: 10 }]);
    for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        planBuy(buyRequest(market, profileWith(1000), "food", amount)),
      ).toMatchObject({ ok: false, refusal: "invalidAmount" });
    }
    expect(
      planBuy(buyRequest(market, profileWith(1000), "food", 0)),
    ).toMatchObject({ ok: false, refusal: "zeroAmount" });
  });

  it("refuses zero stock, an untradeable good and an unknown row", () => {
    const zero = marketWith([{ key: "food", price: 38, stock: 0 }]);
    expect(
      planBuy(buyRequest(zero, profileWith(1000), "food", 1)),
    ).toMatchObject({ ok: false, refusal: "noStock" });

    const alien = marketWith([{ key: "alien_items", price: 522, stock: 10 }]);
    expect(
      planBuy(buyRequest(alien, profileWith(100_000), "alien_items", 1)),
    ).toMatchObject({ ok: false, refusal: "notTradeable" });

    const missing = marketWith([]);
    expect(
      planBuy(buyRequest(missing, profileWith(1000), "food", 1)),
    ).toMatchObject({ ok: false, refusal: "unknownCommodity" });
  });

  it("refuses a full bulk hold", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 50 }]);
    const profile = profileWith(100_000, { textiles: 20 });
    expect(planBuy(buyRequest(market, profile, "food", 1))).toMatchObject({
      ok: false,
      refusal: "noSpace",
    });
  });

  it("lets a 20-pod hold full of other cargo still buy 499 kg of gold", () => {
    const market = marketWith([{ key: "gold", price: 369, stock: 1000 }]);
    // 20 t of food fills every pod; the gold rides in the kg safe.
    const profile = profileWith(1_000_000, { food: 20 });
    const plan = planBuy(buyRequest(market, profile, "gold", 1000));
    expect(plan.ok).toBe(true);
    expect(plan.amount).toBe(499);
    expect(plan.clamp).toBe("noSpace");
  });

  it("accepts 20,499 kg in an empty 20-pod hold", () => {
    const market = marketWith([{ key: "gold", price: 1, stock: 100_000 }]);
    const plan = planBuy(
      buyRequest(market, profileWith(100_000), "gold", 100_000),
    );
    expect(plan.ok).toBe(true);
    expect(plan.amount).toBe(20_499);
  });
});

describe("applyBuy", () => {
  it("reduces credits, adds cargo and changes only that stock", () => {
    const market = marketWith([
      { key: "food", price: 38, stock: 16 },
      { key: "computers", price: 902, stock: 5 },
    ]);
    const profile = profileWith(1000);
    const request = buyRequest(market, profile, "food", 1);
    const plan = planBuy(request);
    const applied = applyBuy(request, plan);

    expect(applied).toBeDefined();
    if (applied === undefined) return;
    expect(applied.profile.credits).toBe(1000 - 38);
    expect(applied.profile.cargo).toEqual({ food: 1 });
    expect(applied.market.goods).toEqual([
      { key: "food", price: 38, stock: 15 },
      { key: "computers", price: 902, stock: 5 },
    ]);
    // Price never moves and the input profile is never mutated.
    expect(applied.market.goods[0]?.price).toBe(38);
    expect(profile.cargo).toEqual({});
  });

  it("refuses a stale plan without touching anything", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 16 }]);
    const profile = profileWith(1000);
    const plan = planBuy(buyRequest(market, profile, "food", 1));

    const richer = profileWith(2000);
    expect(
      applyBuy(buyRequest(market, richer, "food", 2), plan),
    ).toBeUndefined();
  });

  it("never returns negative credits", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 16 }]);
    const profile = profileWith(0);
    const plan = planBuy(buyRequest(market, profile, "food", 1));
    expect(plan.ok).toBe(false);
    expect(
      applyBuy(buyRequest(market, profile, "food", 1), plan),
    ).toBeUndefined();
  });

  it("keeps the generated Lave row's price identical both ways", () => {
    const market = generateMarket(
      { id: "g0-s7", economy: 5 },
      commodities,
      marketSeedForSystem("g0-s7"),
    );
    const row = market.goods.find((good) => good.key === "food");
    expect(row).toEqual({ key: "food", price: 38, stock: 16 });
    const profile = profileWith(1000);
    const request = buyRequest(market, profile, "food", 1);
    const applied = applyBuy(request, planBuy(request));
    expect(
      applied?.market.goods.find((good) => good.key === "food")?.price,
    ).toBe(38);
  });
});
