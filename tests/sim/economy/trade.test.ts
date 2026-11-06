// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The trusted buy and sell path (ECON-02, ECON-03, T-05-06, T-05-17, T-05-20,
 * T-05-21).
 *
 * `planBuy`/`planSell` are pure and validate before dividing; `applyBuy`/
 * `applySell` re-run the plan and refuse on any mismatch. Credits never go
 * negative or leave the safe-integer domain, the price never moves, and only
 * the traded good's stock changes.
 *
 * The pod cases are exact Oolite boundaries, not approximations:
 * `podsFor("t", 20) === 20`, 499/500 kg, 1,499/1,500 kg, 499,999/500,000 g,
 * 19 t + 600 kg in a full 20 t hold (899 kg more), 1,499 kg with free pods
 * (19,000 kg more), an empty 20-pod hold (20,499 kg) and a hold full of other
 * cargo (499 kg).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  emptyCargo,
  podsFor,
  setCargo,
} from "../../../src/sim/economy/cargo.js";
import {
  MARKET_LIMIT,
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import type { Market } from "../../../src/sim/economy/market.js";
import {
  applyBuy,
  applySell,
  planBuy,
  planSell,
} from "../../../src/sim/economy/trade.js";
import type {
  BuyRequest,
  SellRequest,
} from "../../../src/sim/economy/trade.js";
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

function sellRequest(
  market: Market,
  profile: PlayerProfile,
  key: string,
  amount: number,
): SellRequest {
  return { market, profile, commodity: commodity(key), amount };
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
    // Anything that is not a positive safe integer is `zeroAmount`: nothing may
    // reach the arithmetic as a fraction, NaN or Infinity.
    for (const amount of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        planBuy(buyRequest(market, profileWith(1000), "food", amount)),
      ).toMatchObject({ ok: false, amount: 0, cost: 0, refusal: "zeroAmount" });
    }
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
      refusal: "holdFull",
    });
  });

  it("reports the LAST limit that strictly reduced the request", () => {
    // Stock 100, affordable 5, hold room 2: the hold is the last reduction.
    const market = marketWith([{ key: "food", price: 10, stock: 100 }]);
    const profile = profileWith(50, { textiles: 18 });
    const plan = planBuy(buyRequest(market, profile, "food", 100));
    expect(plan).toMatchObject({ ok: true, amount: 2, clamp: "holdFull" });

    // Stock 3, affordable 1000, hold room 1: stock is a strict reduction but
    // the hold reduces the running amount again, so `holdFull` is reported.
    const tight = marketWith([{ key: "food", price: 1, stock: 3 }]);
    const held = profileWith(1000, { textiles: 19 });
    expect(planBuy(buyRequest(tight, held, "food", 10))).toMatchObject({
      ok: true,
      amount: 1,
      clamp: "holdFull",
    });

    // Affordability is the last reduction when the hold is roomy.
    const roomy = marketWith([{ key: "food", price: 38, stock: 100 }]);
    const poor = profileWith(380, {});
    expect(planBuy(buyRequest(roomy, poor, "food", 100))).toMatchObject({
      ok: true,
      amount: 10,
      clamp: "insufficientCredits",
    });
  });
});

describe("pod capacity boundaries in a buy", () => {
  it("counts a bulk tonne as one pod and keeps 20 t of Food exact", () => {
    expect(podsFor("t", 20)).toBe(20);
    const market = marketWith([{ key: "food", price: 1, stock: 100 }]);
    const plan = planBuy(buyRequest(market, profileWith(1000), "food", 20));
    expect(plan).toMatchObject({ ok: true, amount: 20 });
    expect(plan.clamp).toBeUndefined();
  });

  it("keeps 499/500 kg and 1,499/1,500 kg within the exact pod count", () => {
    const market = marketWith([{ key: "gold", price: 1, stock: 100_000 }]);
    const empty = profileWith(1_000_000);

    const under = planBuy(buyRequest(market, empty, "gold", 499));
    expect(under).toMatchObject({ ok: true, amount: 499 });
    expect(under.clamp).toBeUndefined();

    const atPod = planBuy(buyRequest(market, empty, "gold", 500));
    expect(atPod).toMatchObject({ ok: true, amount: 500 });
    expect(atPod.clamp).toBeUndefined();

    // 20 pods hold 20 * 1,000 + 499 kg; one more is clamped to that total.
    const full = planBuy(buyRequest(market, empty, "gold", 20_500));
    expect(full).toMatchObject({ ok: true, amount: 20_499, clamp: "holdFull" });

    const twoPods = profileWith(1_000_000, { gold: 1_500 });
    const more = planBuy(buyRequest(market, twoPods, "gold", 100_000));
    expect(more).toMatchObject({ ok: true, amount: 18_999 });
  });

  it("keeps 499,999/500,000 g within the exact pod count", () => {
    const market = marketWith([
      { key: "gem_stones", price: 1, stock: 100_000_000 },
    ]);
    const empty = profileWith(100_000_000);

    const under = planBuy(buyRequest(market, empty, "gem_stones", 499_999));
    expect(under).toMatchObject({ ok: true, amount: 499_999 });

    const atPod = planBuy(buyRequest(market, empty, "gem_stones", 500_000));
    expect(atPod).toMatchObject({ ok: true, amount: 500_000 });

    const full = planBuy(buyRequest(market, empty, "gem_stones", 20_500_000));
    expect(full).toMatchObject({
      ok: true,
      amount: 20_499_999,
      clamp: "holdFull",
    });
  });

  it("lets a 20-pod hold full of other cargo still buy 499 kg of gold", () => {
    const market = marketWith([{ key: "gold", price: 369, stock: 1000 }]);
    // 20 t of food fills every pod; the gold rides in the kg safe.
    const profile = profileWith(1_000_000, { food: 20 });
    const plan = planBuy(buyRequest(market, profile, "gold", 1000));
    expect(plan).toMatchObject({ ok: true, amount: 499, clamp: "holdFull" });
  });

  it("accepts 20,499 kg in an empty 20-pod hold", () => {
    const market = marketWith([{ key: "gold", price: 1, stock: 100_000 }]);
    const plan = planBuy(
      buyRequest(market, profileWith(100_000), "gold", 100_000),
    );
    expect(plan).toMatchObject({ ok: true, amount: 20_499 });
  });

  it("accepts 899 more kg after 19 t of bulk goods and 600 kg of gold", () => {
    const market = marketWith([{ key: "gold", price: 1, stock: 100_000 }]);
    const profile = profileWith(100_000, { textiles: 19, gold: 600 });
    const plan = planBuy(buyRequest(market, profile, "gold", 5_000));
    expect(plan).toMatchObject({ ok: true, amount: 899, clamp: "holdFull" });
  });

  it("accepts 19,000 more kg after 1,499 kg with free pods", () => {
    const market = marketWith([{ key: "gold", price: 1, stock: 100_000 }]);
    const profile = profileWith(100_000, { gold: 1_499 });
    const plan = planBuy(buyRequest(market, profile, "gold", 100_000));
    expect(plan).toMatchObject({ ok: true, amount: 19_000 });
  });
});

describe("planSell", () => {
  it("sells at the same price and is limited by the hold", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 0 }]);
    const profile = profileWith(1000, { food: 10 });
    const plan = planSell(sellRequest(market, profile, "food", 5));
    expect(plan).toEqual({
      ok: true,
      side: "sell",
      key: "food",
      amount: 5,
      cost: 190,
    });

    const tooMany = planSell(sellRequest(market, profile, "food", 20));
    expect(tooMany).toMatchObject({
      ok: true,
      amount: 10,
      cost: 380,
      clamp: "nothingToSell",
    });
  });

  it("refuses an empty hold with nothingToSell", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 0 }]);
    expect(
      planSell(sellRequest(market, profileWith(1000), "food", 1)),
    ).toMatchObject({ ok: false, amount: 0, refusal: "nothingToSell" });
  });

  it("refuses a market already at the 127 cap with marketFull", () => {
    const market = marketWith([
      { key: "food", price: 38, stock: MARKET_LIMIT },
    ]);
    const profile = profileWith(1000, { food: 10 });
    expect(planSell(sellRequest(market, profile, "food", 10))).toMatchObject({
      ok: false,
      amount: 0,
      cost: 0,
      refusal: "marketFull",
    });
  });

  it("refuses a kg/g sell at stock 127 with marketFull", () => {
    const market = marketWith([
      { key: "gold", price: 369, stock: MARKET_LIMIT },
    ]);
    const profile = profileWith(1000, { gold: 499 });
    expect(planSell(sellRequest(market, profile, "gold", 499))).toMatchObject({
      ok: false,
      refusal: "marketFull",
    });
  });

  it("clamps to the market's remaining room", () => {
    const market = marketWith([
      { key: "food", price: 38, stock: MARKET_LIMIT - 4 },
    ]);
    const profile = profileWith(1000, { food: 10 });
    expect(planSell(sellRequest(market, profile, "food", 10))).toMatchObject({
      ok: true,
      amount: 4,
      clamp: "marketFull",
    });
  });

  it("refuses invalid prices and amounts before dividing", () => {
    for (const price of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const market = marketWith([{ key: "food", price, stock: 0 }]);
      expect(
        planSell(
          sellRequest(market, profileWith(1000, { food: 5 }), "food", 1),
        ),
      ).toMatchObject({ ok: false, refusal: "invalidPrice" });
    }

    const market = marketWith([{ key: "food", price: 38, stock: 0 }]);
    for (const amount of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        planSell(
          sellRequest(market, profileWith(1000, { food: 5 }), "food", amount),
        ),
      ).toMatchObject({ ok: false, amount: 0, cost: 0, refusal: "zeroAmount" });
    }
  });

  it("refuses an untradeable good and an unknown row", () => {
    const alien = marketWith([{ key: "alien_items", price: 522, stock: 10 }]);
    expect(
      planSell(sellRequest(alien, profileWith(1000), "alien_items", 1)),
    ).toMatchObject({ ok: false, refusal: "notTradeable" });

    const missing = marketWith([]);
    expect(
      planSell(sellRequest(missing, profileWith(1000, { food: 1 }), "food", 1)),
    ).toMatchObject({ ok: false, refusal: "unknownCommodity" });
  });

  it("refuses proceeds that would leave the safe-integer domain", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 0 }]);
    const tooRich = profileWith(Number.MAX_SAFE_INTEGER - 10, { food: 1 });
    expect(planSell(sellRequest(market, tooRich, "food", 1))).toMatchObject({
      ok: false,
      refusal: "overflow",
    });

    // Exactly at the boundary succeeds: credits + 38 === MAX_SAFE_INTEGER.
    const exact = profileWith(Number.MAX_SAFE_INTEGER - 38, { food: 1 });
    const plan = planSell(sellRequest(market, exact, "food", 1));
    expect(plan).toMatchObject({ ok: true, amount: 1, cost: 38 });
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

describe("applySell", () => {
  it("adds proceeds, removes cargo and changes only that stock and price", () => {
    const market = marketWith([
      { key: "computers", price: 902, stock: 0 },
      { key: "food", price: 38, stock: 16 },
    ]);
    const profile = profileWith(1000, { computers: 2 });
    const before = profile;
    const request = sellRequest(market, profile, "computers", 2);
    const plan = planSell(request);
    const applied = applySell(request, plan);

    expect(applied).toBeDefined();
    if (applied === undefined) return;
    expect(applied.profile.credits).toBe(1000 + 2 * 902);
    expect(applied.profile.cargo).toEqual({});
    expect(applied.market.goods).toEqual([
      { key: "computers", price: 902, stock: 2 },
      { key: "food", price: 38, stock: 16 },
    ]);
    // Buying and selling read the same price; a sale never moves it.
    expect(applied.market.goods[0]?.price).toBe(902);
    expect(before.cargo).toEqual({ computers: 2 });
  });

  it("removes the entry when the last unit is sold", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 0 }]);
    const profile = profileWith(1000, { food: 1 });
    const request = sellRequest(market, profile, "food", 1);
    const applied = applySell(request, planSell(request));
    expect(applied).toBeDefined();
    if (applied === undefined) return;
    expect(applied.profile.cargo).toEqual({});
    expect(Object.getPrototypeOf(applied.profile.cargo)).toBeNull();
  });

  it("refuses a stale or forged plan without touching anything", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 0 }]);
    const profile = profileWith(1000, { food: 5 });
    const plan = planSell(sellRequest(market, profile, "food", 2));

    // A different amount is no longer the approved plan.
    expect(
      applySell(sellRequest(market, profile, "food", 3), plan),
    ).toBeUndefined();
    // A different profile changes the feasible amount.
    expect(
      applySell(
        sellRequest(market, profileWith(1000, { food: 1 }), "food", 2),
        plan,
      ),
    ).toBeUndefined();
    expect(
      applySell(sellRequest(market, profile, "food", 2), {
        ...plan,
        ok: true,
        amount: 2,
        cost: 0,
      }),
    ).toBeUndefined();
  });

  it("refuses an overflow plan", () => {
    const market = marketWith([{ key: "food", price: 38, stock: 0 }]);
    const profile = profileWith(Number.MAX_SAFE_INTEGER - 10, { food: 1 });
    const plan = planSell(sellRequest(market, profile, "food", 1));
    expect(plan).toMatchObject({ ok: false, refusal: "overflow" });
    expect(
      applySell(sellRequest(market, profile, "food", 1), plan),
    ).toBeUndefined();
  });

  it("is exact at stock 1 on the buy side and stock 127 on the sell side", () => {
    const buyMarket = marketWith([{ key: "food", price: 38, stock: 1 }]);
    const buyer = profileWith(1000);
    const buy = planBuy(buyRequest(buyMarket, buyer, "food", 1));
    expect(buy).toMatchObject({ ok: true, amount: 1 });
    expect(buy.clamp).toBeUndefined();

    const sellMarket = marketWith([
      { key: "food", price: 38, stock: MARKET_LIMIT },
    ]);
    const seller = profileWith(1000, { food: 1 });
    const sell = planSell(sellRequest(sellMarket, seller, "food", 1));
    expect(sell).toMatchObject({ ok: false, refusal: "marketFull" });
  });
});

describe("money safety (property)", () => {
  const priceArb = fc.oneof(
    fc.integer({ min: 1, max: 5000 }),
    fc.constant(0),
    fc.constant(-1),
    fc.constant(1.5),
    fc.constant(Number.NaN),
    fc.constant(Number.POSITIVE_INFINITY),
  );
  const creditsArb = fc.oneof(
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.constant(Number.MAX_SAFE_INTEGER),
  );
  const stockArb = fc.integer({ min: 0, max: MARKET_LIMIT });
  const amountArb = fc.integer({ min: 0, max: 25_000 });

  it("keeps buy credits, cargo, stock and price inside their domains", () => {
    fc.assert(
      fc.property(
        priceArb,
        creditsArb,
        stockArb,
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 2_000 }),
        amountArb,
        (price, credits, stock, foodTonnes, goldKg, amount) => {
          const market = marketWith([{ key: "food", price, stock }]);
          const cargo: Record<string, number> = {};
          if (foodTonnes > 0) cargo.food = foodTonnes;
          if (goldKg > 0) cargo.gold = goldKg;
          const profile = profileWith(credits, cargo);
          const request = buyRequest(market, profile, "food", amount);
          const plan = planBuy(request);

          if (!plan.ok) {
            expect(plan.amount).toBe(0);
            expect(plan.cost).toBe(0);
            expect(plan.refusal).toBeDefined();
            return;
          }
          expect(Number.isSafeInteger(plan.cost)).toBe(true);
          expect(plan.cost).toBeGreaterThanOrEqual(0);
          expect(plan.amount).toBeGreaterThan(0);
          expect(plan.amount).toBeLessThanOrEqual(amount);

          const applied = applyBuy(request, plan);
          expect(applied).toBeDefined();
          if (applied === undefined) return;
          expect(Number.isSafeInteger(applied.profile.credits)).toBe(true);
          expect(applied.profile.credits).toBeGreaterThanOrEqual(0);
          expect(applied.profile.credits).toBe(credits - plan.cost);
          for (const quantity of Object.values(applied.profile.cargo)) {
            expect(Number.isSafeInteger(quantity)).toBe(true);
            expect(quantity).toBeGreaterThanOrEqual(0);
          }
          const row = applied.market.goods[0];
          expect(row?.price).toBe(price);
          expect(row?.stock).toBe(stock - plan.amount);
          expect(row?.stock).toBeGreaterThanOrEqual(0);
          expect(row?.stock).toBeLessThanOrEqual(MARKET_LIMIT);
        },
      ),
    );
  });

  it("keeps sell credits, cargo, stock and price inside their domains", () => {
    fc.assert(
      fc.property(
        priceArb,
        creditsArb,
        stockArb,
        fc.integer({ min: 0, max: 25_000 }),
        amountArb,
        (price, credits, stock, held, amount) => {
          const market = marketWith([{ key: "gold", price, stock }]);
          const cargo: Record<string, number> = held > 0 ? { gold: held } : {};
          const profile = profileWith(credits, cargo);
          const request = sellRequest(market, profile, "gold", amount);
          const plan = planSell(request);

          if (!plan.ok) {
            expect(plan.amount).toBe(0);
            expect(plan.cost).toBe(0);
            expect(plan.refusal).toBeDefined();
            return;
          }
          expect(Number.isSafeInteger(plan.cost)).toBe(true);
          expect(plan.cost).toBeGreaterThanOrEqual(0);
          expect(plan.amount).toBeLessThanOrEqual(amount);
          expect(plan.amount).toBeLessThanOrEqual(held);
          expect(stock + plan.amount).toBeLessThanOrEqual(MARKET_LIMIT);

          const applied = applySell(request, plan);
          expect(applied).toBeDefined();
          if (applied === undefined) return;
          expect(Number.isSafeInteger(applied.profile.credits)).toBe(true);
          expect(applied.profile.credits).toBeGreaterThanOrEqual(0);
          expect(applied.profile.credits).toBe(credits + plan.cost);
          for (const quantity of Object.values(applied.profile.cargo)) {
            expect(Number.isSafeInteger(quantity)).toBe(true);
            expect(quantity).toBeGreaterThanOrEqual(0);
          }
          const row = applied.market.goods[0];
          expect(row?.price).toBe(price);
          expect(row?.stock).toBe(stock + plan.amount);
          expect(row?.stock).toBeLessThanOrEqual(MARKET_LIMIT);
        },
      ),
    );
  });
});
