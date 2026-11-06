// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F8 market view model (ECON-04, D-06..D-09).
 *
 * Pins the generated Lave market exactly: 17 rows in `sortOrder`, the fixed
 * columns, `—` for zero stock/hold, the `Ex` flag, each commodity's own unit and
 * one-decimal prices. The confirmation uses the approved TOTAL cost, a clamp
 * shows BOTH the notice and the confirmation, a zero-feasible refusal returns
 * `confirmText: null`, and a step back to zero is silent — never `zeroAmount`
 * copy.
 */

import { describe, expect, it } from "vitest";

import type { Commodity } from "../../src/content/types.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../src/sim/economy/market.js";
import type { Market } from "../../src/sim/economy/market.js";
import { planBuy, planSell } from "../../src/sim/economy/trade.js";
import { newProfile } from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import {
  buildMarketModel,
  tradeNoticeText,
} from "../../src/ui/station-model.js";
import { commodityUnits, commoditiesFixture } from "../helpers/commodities.js";
import { laveFixture } from "../helpers/lave.js";

const commodities = commoditiesFixture();
const units = commodityUnits(commodities);
const system = laveFixture().system;
const market: Market = generateMarket(
  system,
  commodities,
  marketSeedForSystem(system.id),
);

function commodity(key: string): Commodity {
  const found = commodities.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`no commodity "${key}"`);
  return found;
}

function build(
  profile: PlayerProfile = newProfile(),
  selection = "food",
  pending: ReturnType<typeof planBuy> | null = null,
  notice = "",
) {
  return buildMarketModel(market, profile, commodities, selection, {
    pending,
    notice,
  });
}

type Model = ReturnType<typeof build>;

function row(model: Model, key: string) {
  const found = model.rows.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`no row "${key}"`);
  return found;
}

describe("F8 rows", () => {
  it("emits 17 rows in sortOrder with food first and Alien Items last", () => {
    const model = build();

    expect(model.rows).toHaveLength(17);
    expect(model.rows.map((entry) => entry.key)).toEqual(
      [...commodities]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((entry) => entry.key),
    );
    expect(model.rows[0]?.key).toBe("food");
    expect(model.rows.at(-1)?.key).toBe("alien_items");
  });

  it("pins the exact Lave food row", () => {
    const food = row(build(), "food");

    expect(food.name).toBe("Food");
    expect(food.unit).toBe("t");
    expect(food.price).toBe(38);
    expect(food.priceText).toBe("3.8 Cr");
    expect(food.stockText).toBe("16");
    expect(food.heldText).toBe("—");
    expect(food.exText).toBe("—");
    expect(food.dimmed).toBe(false);
    expect(food.selectable).toBe(true);
  });

  it("dims a zero-stock row but keeps it selectable", () => {
    const computers = row(build(), "computers");

    expect(computers.stockText).toBe("—");
    expect(computers.priceText).toBe("90.2 Cr");
    expect(computers.dimmed).toBe(true);
    expect(computers.selectable).toBe(true);
  });

  it("makes Alien Items dimmed and non-selectable", () => {
    const alien = row(build(), "alien_items");

    expect(alien.dimmed).toBe(true);
    expect(alien.selectable).toBe(false);
    expect(alien.stockText).toBe("—");
  });

  it("marks the export-illegal goods with Ex", () => {
    const model = build();

    expect(row(model, "slaves").exText).toBe("Ex");
    expect(row(model, "narcotics").exText).toBe("Ex");
    expect(row(model, "firearms").exText).toBe("Ex");
    expect(row(model, "food").exText).toBe("—");
  });

  it("uses each commodity's own unit", () => {
    const model = build();

    expect(row(model, "gold").unit).toBe("kg");
    expect(row(model, "platinum").unit).toBe("kg");
    expect(row(model, "gem_stones").unit).toBe("g");
  });
});

describe("cash and load", () => {
  it("writes one line each with exactly one period", () => {
    const empty = build();

    expect(empty.cashText).toBe("Cash: 100.0 Cr.");
    expect(empty.loadText).toBe("Load 0 / 20 t");
  });

  it("updates after a 2 t Food purchase without doubling a period", () => {
    const profile = {
      ...newProfile(),
      credits: 924,
      cargo: { food: 2 },
    };
    const model = build(profile);

    expect(model.cashText).toBe("Cash: 92.4 Cr.");
    expect(model.loadText).toBe("Load 2 / 20 t");
    expect(model.cashText).not.toContain("..");
  });

  it("shows a held amount for a cargo row", () => {
    const model = build({ ...newProfile(), cargo: { food: 2 } });

    expect(row(model, "food").heldText).toBe("2");
  });
});

describe("confirmation and notice", () => {
  const request = (side: "buy" | "sell", key: string, amount: number) => {
    const commodityRecord = commodity(key);
    const base = {
      market,
      profile: newProfile(),
      commodity: commodityRecord,
      amount,
    };
    return side === "buy" ? planBuy({ ...base, units }) : planSell(base);
  };

  it("shows the total for a 1 t buy", () => {
    const model = build(newProfile(), "food", request("buy", "food", 1));

    expect(model.confirmText).toBe("Buy 1 t Food for 3.8 Cr? [Y/N]");
    expect(model.noticeText).toBe("");
  });

  it("shows the approved TOTAL, never the unit price, for 12 t", () => {
    const model = build(newProfile(), "food", request("buy", "food", 12));

    expect(model.confirmText).toBe("Buy 12 t Food for 45.6 Cr? [Y/N]");
    expect(model.confirmText).not.toContain("3.8");
  });

  it("shows both the clamp notice and the clamped total", () => {
    const plan = request("buy", "food", 100);
    expect(plan.ok).toBe(true);
    expect(plan.amount).toBe(16);
    expect(plan.clamp).toBe("noStock");

    const model = build(newProfile(), "food", plan);

    expect(model.noticeText).toBe("Only 16 t available");
    expect(model.confirmText).toBe("Buy 16 t Food for 60.8 Cr? [Y/N]");
  });

  it("uses the commodity unit in a clamp notice", () => {
    const rich = { ...newProfile(), credits: 1_000_000 };
    const plan = planBuy({
      market,
      profile: rich,
      commodity: commodity("gold"),
      units,
      amount: 100,
    });
    const model = build(rich, "gold", plan);

    expect(plan.ok).toBe(true);
    expect(plan.clamp).toBe("noStock");
    expect(model.noticeText).toBe(`Only ${plan.amount} kg available`);
  });

  it("returns confirmText null for a zero-feasible refusal", () => {
    const plan = request("buy", "computers", 1);
    expect(plan.ok).toBe(false);
    expect(plan.refusal).toBe("noStock");

    const notice = tradeNoticeText(plan, commodity("computers"));
    const model = build(newProfile(), "computers", null, notice);

    expect(notice).toBe("Only 0 t available");
    expect(model.confirmText).toBeNull();
    expect(model.noticeText).toBe("Only 0 t available");
  });

  it("is silent when a step reaches zero", () => {
    const model = build(newProfile(), "food", null, "");

    expect(model.confirmText).toBeNull();
    expect(model.noticeText).toBe("");
  });

  it("uses the total proceeds for a sell confirmation", () => {
    const plan = planSell({
      market,
      profile: { ...newProfile(), cargo: { food: 2 } },
      commodity: commodity("food"),
      amount: 2,
    });
    const model = build({ ...newProfile(), cargo: { food: 2 } }, "food", plan);

    expect(model.confirmText).toBe("Sell 2 t Food for 7.6 Cr? [Y/N]");
  });
});

describe("tradeNoticeText", () => {
  it("names every player-facing refusal without zeroAmount copy", () => {
    const base = {
      ok: false as const,
      side: "buy" as const,
      key: "food",
      amount: 0,
      cost: 0,
    };
    const food = commodity("food");

    expect(tradeNoticeText(null, food)).toBe("");
    expect(tradeNoticeText({ ...base, refusal: "zeroAmount" }, food)).toBe("");
    expect(
      tradeNoticeText({ ...base, refusal: "insufficientCredits" }, food),
    ).toBe("Not enough credits");
    expect(tradeNoticeText({ ...base, refusal: "holdFull" }, food)).toBe(
      "Hold full",
    );
    expect(tradeNoticeText({ ...base, refusal: "nothingToSell" }, food)).toBe(
      "Nothing to sell",
    );
    expect(tradeNoticeText({ ...base, refusal: "notTradeable" }, food)).toBe(
      "Not traded here",
    );
    expect(tradeNoticeText({ ...base, refusal: "invalidPrice" }, food)).toBe(
      "Price unavailable",
    );
    expect(tradeNoticeText({ ...base, refusal: "overflow" }, food)).toBe(
      "Amount too large",
    );
  });

  it("names the sell-capacity clamp with the commodity unit", () => {
    expect(
      tradeNoticeText(
        {
          ok: true,
          side: "sell",
          key: "food",
          amount: 25,
          cost: 950,
          clamp: "marketFull",
        },
        commodity("food"),
      ),
    ).toBe("Station can only take 25 t");
  });
});
