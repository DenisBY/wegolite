// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F8 market view model (ECON-04, D-06..D-09).
 *
 * Pins the generated Lave market exactly: 17 rows in `sortOrder`, the fixed
 * columns, `—` for zero stock/hold, Oolite's Legal value, each commodity's own unit and
 * one-decimal prices. The confirmation uses the approved TOTAL cost, a clamp
 * shows BOTH the notice and the confirmation, a zero-feasible refusal returns
 * `confirmText: null`, and a step back to zero is silent — never `zeroAmount`
 * copy.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  MARKET_COLUMNS,
  MARKET_NO_COMMENT_TEXT,
  MARKET_SORT_COLUMNS,
  buildMarketModel,
  legalityText,
  legalityTitle,
  nextMarketSort,
  sortMarketGoods,
  tradeNoticeText,
} from "../../src/ui/station-model.js";
import type { MarketSort } from "../../src/ui/station-model.js";
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
    expect(food.priceText).toBe("3.8 ₢");
    expect(food.stockText).toBe("16");
    expect(food.heldText).toBe("—");
    expect(food.legalText).toBe("—");
    expect(food.dimmed).toBe(false);
    expect(food.selectable).toBe(true);
  });

  it("dims a zero-stock row with nothing held and refuses selection", () => {
    const computers = row(build(), "computers");

    expect(computers.stockText).toBe("—");
    expect(computers.priceText).toBe("90.2 ₢");
    expect(computers.dimmed).toBe(true);
    expect(computers.selectable).toBe(false);
  });

  it("keeps a zero-stock row selectable when the hold carries it", () => {
    const computers = row(
      build({ ...newProfile(), cargo: { computers: 1 } }),
      "computers",
    );

    expect(computers.dimmed).toBe(true);
    expect(computers.selectable).toBe(true);
  });

  it("makes Alien Items dimmed and non-selectable", () => {
    const alien = row(build(), "alien_items");

    expect(alien.dimmed).toBe(true);
    expect(alien.selectable).toBe(false);
    expect(alien.stockText).toBe("—");
  });

  it("prints No export (Oolite's Im) for the goods legal to import only", () => {
    // PlayerEntity.m:9675-9691: import 0 and export non-zero is Oolite's "Im",
    // printed "No export" (FIDELITY E-190)
    // (descriptions.plist:1633, "legal to import").
    const model = build();

    expect(MARKET_COLUMNS.at(-1)).toEqual({
      key: "legal",
      label: "Restricted",
    });
    expect(row(model, "slaves").legalText).toBe("No export");
    expect(row(model, "narcotics").legalText).toBe("No export");
    expect(row(model, "firearms").legalText).toBe("No export");
    expect(row(model, "food").legalText).toBe("—");
  });

  it("maps both legality fields as Oolite does", () => {
    expect(legalityText(0, 0)).toBe("—");
    expect(legalityText(0, 1)).toBe("No export");
    expect(legalityText(1, 0)).toBe("No import");
    expect(legalityText(1, 2)).toBe("No trade");
  });

  it("explains every Restricted value and its penalty on hover (FIDELITY E-190)", () => {
    expect(legalityTitle("—")).toBe("Legal to import and export.");
    expect(legalityTitle("No export")).toMatch(
      /^Legal to import, illegal to export\. Launching from the main station .* offender\.$/,
    );
    expect(legalityTitle("No import")).toMatch(
      /^Legal to export, illegal to import\. Docking at the main station .* offender\.$/,
    );
    expect(legalityTitle("No trade")).toMatch(
      /^Illegal to import and export\. Docking at or launching from .* offender\.$/,
    );
    expect(legalityTitle("??")).toBe("");
  });

  it("prints Ex and Re for synthetic commodities with an import restriction", () => {
    const food = commodity("food");
    const withImport = (legalityImport: number, legalityExport: number) =>
      buildMarketModel(
        market,
        newProfile(),
        commodities.map((entry) =>
          entry.key === "food"
            ? { ...food, legalityImport, legalityExport }
            : entry,
        ),
        "food",
        { pending: null, notice: "" },
      );

    expect(row(withImport(1, 0), "food").legalText).toBe("No import");
    expect(row(withImport(1, 1), "food").legalText).toBe("No trade");
  });

  it("uses each commodity's own unit", () => {
    const model = build();

    expect(row(model, "gold").unit).toBe("kg");
    expect(row(model, "platinum").unit).toBe("kg");
    expect(row(model, "gem_stones").unit).toBe("g");
  });
});

describe("cash and load", () => {
  // Oolite's market-cash-and-load (descriptions.plist:1635,
  // PlayerEntity.m:9979-9986): one sentence under the table.
  it("writes Oolite's one cash-and-load sentence", () => {
    expect(build().cashLoadText).toBe("Cash: 100.0 ₢. Load 0 of 20 t.");
  });

  it("updates after a 2 t Food purchase without doubling a period", () => {
    const profile = {
      ...newProfile(),
      credits: 924,
      cargo: { food: 2 },
    };
    const model = build(profile);

    expect(model.cashLoadText).toBe("Cash: 92.4 ₢. Load 2 of 20 t.");
    expect(model.cashLoadText).not.toContain("..");
  });

  it("groups a large balance as Oolite does", () => {
    const model = build({ ...newProfile(), credits: 1_234_567 });
    expect(model.cashLoadText).toBe("Cash: 123\u00a0456.7 ₢. Load 0 of 20 t.");
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

    expect(model.confirmText).toBe("Buy 1 t Food for 3.8 ₢? [Y/N]");
    expect(model.noticeText).toBe("");
  });

  it("shows the approved TOTAL, never the unit price, for 12 t", () => {
    const model = build(newProfile(), "food", request("buy", "food", 12));

    expect(model.confirmText).toBe("Buy 12 t Food for 45.6 ₢? [Y/N]");
    expect(model.confirmText).not.toContain("3.8");
  });

  it("shows both the clamp notice and the clamped total", () => {
    const plan = request("buy", "food", 100);
    expect(plan.ok).toBe(true);
    expect(plan.amount).toBe(16);
    expect(plan.clamp).toBe("noStock");

    const model = build(newProfile(), "food", plan);

    expect(model.noticeText).toBe("Only 16 t available");
    expect(model.confirmText).toBe("Buy 16 t Food for 60.8 ₢? [Y/N]");
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

    expect(model.confirmText).toBe("Sell 2 t Food for 7.6 ₢? [Y/N]");
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

/**
 * The F8 sort (quick task 261118-cyo, owner decision 2026-11-18): Oolite's
 * comparators are all ascending (`PlayerEntity.m:11868-11911` at the pin
 * 7437f22); a heading click cycles ascending, descending, default.
 */
describe("market sort", () => {
  const catalogueOrder = [...commodities]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((entry) => entry.key);
  const keys = (sort: MarketSort, cargo: Record<string, number> = {}) =>
    sortMarketGoods(market.goods, sort, commodities, cargo).map(
      (good) => good.key,
    );

  it("cycles ascending, descending and default on one heading", () => {
    const ascending = nextMarketSort(null, "price");
    expect(ascending).toEqual({ column: "price", direction: "ascending" });
    const descending = nextMarketSort(ascending, "price");
    expect(descending).toEqual({ column: "price", direction: "descending" });
    expect(nextMarketSort(descending, "price")).toBeNull();
    expect(nextMarketSort(ascending, "name")).toEqual({
      column: "name",
      direction: "ascending",
    });
    expect(nextMarketSort(descending, "unit")).toEqual({
      column: "unit",
      direction: "ascending",
    });
  });

  it("offers five sortable columns and never Legal", () => {
    expect(MARKET_SORT_COLUMNS).toEqual([
      "name",
      "unit",
      "price",
      "stock",
      "held",
    ]);
  });

  it("returns the catalogue order unchanged without a sort", () => {
    expect(keys(null)).toEqual(catalogueOrder);
  });

  it("orders by a code-unit compare of the names", () => {
    const names = sortMarketGoods(
      market.goods,
      { column: "name", direction: "ascending" },
      commodities,
      {},
    ).map((good) => commodity(good.key).name);
    expect(names).toEqual([
      "Alien Items",
      "Alloys",
      "Computers",
      "Firearms",
      "Food",
      "Furs",
      "Gem-Stones",
      "Gold",
      "Liquor/Wines",
      "Luxuries",
      "Machinery",
      "Minerals",
      "Narcotics",
      "Platinum",
      "Radioactives",
      "Slaves",
      "Textiles",
    ]);
    expect(
      keys({ column: "name", direction: "descending" }).map(
        (key) => commodity(key).name,
      ),
    ).toEqual([...names].reverse());
  });

  it("orders the units t, kg, g with ties in catalogue order", () => {
    const tonnes = catalogueOrder.filter((key) => commodity(key).unit === "t");
    expect(keys({ column: "unit", direction: "ascending" })).toEqual([
      ...tonnes,
      "gold",
      "platinum",
      "gem_stones",
    ]);
    // Descending negates the comparator; ties stay in catalogue order.
    expect(keys({ column: "unit", direction: "descending" })).toEqual([
      "gem_stones",
      "gold",
      "platinum",
      ...tonnes,
    ]);
  });

  it("orders by price and by market stock, stable on ties", () => {
    const indexOf = (key: string) => catalogueOrder.indexOf(key);
    const good = (key: string) => {
      const found = market.goods.find((entry) => entry.key === key);
      if (found === undefined) throw new Error(`no good "${key}"`);
      return found;
    };
    const expected = (value: (key: string) => number, sign: 1 | -1): string[] =>
      [...catalogueOrder].sort(
        (left, right) =>
          sign * (value(left) - value(right)) || indexOf(left) - indexOf(right),
      );
    expect(keys({ column: "price", direction: "ascending" })).toEqual(
      expected((key) => good(key).price, 1),
    );
    expect(keys({ column: "price", direction: "descending" })).toEqual(
      expected((key) => good(key).price, -1),
    );
    expect(keys({ column: "stock", direction: "ascending" })).toEqual(
      expected((key) => good(key).stock, 1),
    );
    expect(keys({ column: "stock", direction: "descending" })).toEqual(
      expected((key) => good(key).stock, -1),
    );
  });

  it("orders by the amount in the hold, 0 when absent", () => {
    const cargo = { gold: 3, food: 5, furs: 3 };
    const ascending = keys({ column: "held", direction: "ascending" }, cargo);
    expect(ascending.slice(-3)).toEqual(["furs", "gold", "food"]);
    expect(ascending.slice(0, 14)).toEqual(
      catalogueOrder.filter((key) => !(key in cargo)),
    );
    const descending = keys({ column: "held", direction: "descending" }, cargo);
    expect(descending.slice(0, 3)).toEqual(["food", "furs", "gold"]);
  });

  it("does not mutate the market goods", () => {
    const before = market.goods.map((good) => good.key);
    keys({ column: "price", direction: "descending" });
    expect(market.goods.map((good) => good.key)).toEqual(before);
  });

  it("builds the rows in the sorted order and marks the active column", () => {
    const sort: MarketSort = { column: "price", direction: "descending" };
    const model = buildMarketModel(
      market,
      newProfile(),
      commodities,
      "food",
      { pending: null, notice: "" },
      sort,
    );
    expect(model.rows.map((entry) => entry.key)).toEqual(keys(sort));
    expect(
      model.columns.map((column) => [column.key, column.sortable, column.sort]),
    ).toEqual([
      ["name", true, null],
      ["unit", true, null],
      ["price", true, "descending"],
      ["stock", true, null],
      ["held", true, null],
      ["legal", false, null],
    ]);
    // Without a sort argument the catalogue order and unmarked columns hold.
    const plain = build();
    expect(plain.rows.map((entry) => entry.key)).toEqual(catalogueOrder);
    expect(plain.columns.every((column) => column.sort === null)).toBe(true);
  });
});

describe("comment line under the list (quick 261124-ou6)", () => {
  function buildSelected(selection: string) {
    return buildMarketModel(market, newProfile(), commodities, selection, {
      pending: null,
      notice: "",
    });
  }

  it.each(["slaves", "narcotics", "firearms"])(
    "shows the compiled comment of %s",
    (key) => {
      const model = buildSelected(key);

      expect(model.commentText).toBe(
        "It is illegal to export this good from Cooperative stations.",
      );
      expect(model.commentText).toBe(commodity(key).comment);
    },
  );

  it("is empty for Oolite's default no-comment text", () => {
    expect(commodity("food").comment).toBe(MARKET_NO_COMMENT_TEXT);
    expect(buildSelected("food").commentText).toBe("");
  });

  it.each([
    ["no selection", ""],
    ["a key outside the market", "not_a_good"],
  ])("is empty for %s", (_label, selection) => {
    expect(buildSelected(selection).commentText).toBe("");
  });

  it("is empty or the record's own comment for every market key, never the default text", () => {
    const marketKeys = build().rows.map((entry) => entry.key);
    expect(marketKeys).toHaveLength(17);
    for (const key of marketKeys) {
      const text = buildSelected(key).commentText;
      expect(text === "" || text === commodity(key).comment).toBe(true);
      expect(text).not.toBe(MARKET_NO_COMMENT_TEXT);
    }
  });

  it("leaves the rest of the model as before", () => {
    const model = buildSelected("slaves");

    expect(model.rows).toHaveLength(17);
    expect(model.cashLoadText).toBe(build().cashLoadText);
    expect({ ...model, commentText: "" }).toEqual({
      ...build(undefined, "slaves"),
      commentText: "",
    });
  });

  it("pins the no-comment text to the vendored descriptions.plist", () => {
    const plist = readFileSync(
      join(process.cwd(), "third_party/oolite/Config/descriptions.plist"),
      "utf8",
    );
    let oolite: string | undefined;
    for (const line of plist.split("\n")) {
      const match = /^\s*"([^"]+)"\s*=\s*"(.*)";/.exec(line);
      if (match?.[1] === "oolite-commodity-no-comment") oolite = match[2];
    }
    expect(oolite).toBe("No additional information available");
    expect(MARKET_NO_COMMENT_TEXT).toBe(oolite);
  });
});
