// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The trusted buy/sell transaction path (ECON-02, ECON-04, T-05-06).
 *
 * A plan is pure: it validates the price and amount before any division,
 * computes the feasible quantity and returns the amount, cost and any limiting
 * reason. The caller shows it; `applyBuy` re-runs the same plan and refuses on
 * any mismatch before touching credits or cargo. Nothing is subtracted before
 * approval and no path can return negative or non-safe-integer credits.
 *
 * The price is per unit and identical in both directions — these functions
 * never introduce a spread and never move a price. Only the traded good's
 * stock changes.
 */

import type { Commodity, CommodityUnit } from "../../content/types.js";
import {
  capacityPodsFor,
  holdPodsUsed,
  maxAdditional,
  podsFor,
  setCargo,
} from "./cargo.js";
import type { Cargo } from "./cargo.js";
import type { Market, MarketGood } from "./market.js";
import type { PlayerProfile } from "../player/profile.js";

/** Wave 1 implements the buy half; plan 05-02 adds sell. */
export type TradeSide = "buy" | "sell";

/** Why a trade is refused or clamped; the UI maps each to fixed copy. */
export type TradeRefusal =
  | "invalidPrice"
  | "invalidAmount"
  | "zeroAmount"
  | "unknownCommodity"
  | "notTradeable"
  | "noStock"
  | "insufficientCredits"
  | "noSpace";

/** The exact plan shape every later screen and plan references unchanged. */
export interface TradePlan {
  readonly ok: boolean;
  readonly side: TradeSide;
  readonly key: string;
  readonly amount: number;
  readonly cost: number;
  readonly refusal?: TradeRefusal | undefined;
  readonly clamp?: TradeRefusal | undefined;
}

/** Everything a pure plan reads; all plain data, no loaders. */
export interface BuyRequest {
  readonly market: Market;
  readonly profile: PlayerProfile;
  readonly commodity: Commodity;
  readonly units: ReadonlyMap<string, CommodityUnit>;
  readonly amount: number;
}

/** The result of applying an approved buy: two new values, no mutation. */
export interface BuyApply {
  readonly market: Market;
  readonly profile: PlayerProfile;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function refusalPlan(
  side: TradeSide,
  key: string,
  reason: TradeRefusal,
  amount = 0,
  cost = 0,
  clamp?: TradeRefusal,
): TradePlan {
  return {
    ok: false,
    side,
    key,
    amount,
    cost,
    refusal: reason,
    ...(clamp === undefined ? {} : { clamp }),
  };
}

function marketGood(market: Market, key: string): MarketGood | undefined {
  return market.goods.find((good) => good.key === key);
}

/**
 * Plan a buy of at most `request.amount` units.
 *
 * The amount is clamped to the feasible quantity and the limiting reason is
 * reported in `clamp`; a zero feasible quantity is a refusal. A non-positive,
 * fractional or non-finite request is `invalidAmount` (zero is `zeroAmount`),
 * and a non-positive, fractional or non-finite price is `invalidPrice`.
 */
export function planBuy(request: BuyRequest): TradePlan {
  const { market, profile, commodity, units, amount } = request;
  const key = commodity.key;

  const good = marketGood(market, key);
  if (good === undefined) {
    return refusalPlan("buy", key, "unknownCommodity");
  }
  if (!commodity.tradeable) {
    return refusalPlan("buy", key, "notTradeable");
  }
  if (!isPositiveSafeInteger(good.price)) {
    return refusalPlan("buy", key, "invalidPrice");
  }
  if (!Number.isSafeInteger(amount)) {
    return refusalPlan("buy", key, "invalidAmount");
  }
  if (amount === 0) {
    return refusalPlan("buy", key, "zeroAmount");
  }
  if (amount < 0) {
    return refusalPlan("buy", key, "invalidAmount");
  }
  if (!Number.isSafeInteger(profile.credits) || profile.credits < 0) {
    return refusalPlan("buy", key, "insufficientCredits");
  }

  const held = profile.cargo[key] ?? 0;
  if (!Number.isSafeInteger(held) || held < 0) {
    return refusalPlan("buy", key, "invalidAmount");
  }

  const capacityPods = capacityPodsFor(
    profile.equipment,
    profile.passengerBerths,
  );
  const otherPods =
    holdPodsUsed(profile.cargo, units) - podsFor(commodity.unit, held);

  let spaceLimit: number;
  if (commodity.unit === "t") {
    spaceLimit = Math.max(0, capacityPods - otherPods);
  } else {
    spaceLimit = maxAdditional(commodity.unit, held, otherPods, capacityPods);
  }

  const affordable = Math.floor(profile.credits / good.price);
  const stockLimit = Math.max(0, good.stock);
  const feasible = Math.min(stockLimit, affordable, spaceLimit);

  if (feasible <= 0) {
    if (stockLimit <= 0) return refusalPlan("buy", key, "noStock");
    if (affordable <= 0) {
      return refusalPlan("buy", key, "insufficientCredits");
    }
    return refusalPlan("buy", key, "noSpace");
  }

  let clamp: TradeRefusal | undefined;
  if (amount > feasible) {
    if (feasible === stockLimit) clamp = "noStock";
    else if (feasible === affordable) clamp = "insufficientCredits";
    else clamp = "noSpace";
  }
  const approved = Math.min(amount, feasible);
  const cost = approved * good.price;
  if (!Number.isSafeInteger(cost) || cost < 0) {
    return refusalPlan("buy", key, "invalidPrice");
  }

  return {
    ok: true,
    side: "buy",
    key,
    amount: approved,
    cost,
    ...(clamp === undefined ? {} : { clamp }),
  };
}

/** Return a new market with only one good's stock replaced. */
function withStock(market: Market, key: string, stock: number): Market {
  return {
    ...market,
    goods: market.goods.map((good) =>
      good.key === key ? { ...good, stock } : good,
    ),
  };
}

/**
 * Apply an approved buy.
 *
 * The plan is recomputed from the live market and profile; if it no longer
 * matches the supplied plan, nothing is returned and nothing changes. On
 * success the profile is a new value with the reduced balance and updated
 * cargo, and the market is a new value with only that good's stock reduced.
 */
export function applyBuy(
  request: BuyRequest,
  plan: TradePlan,
): BuyApply | undefined {
  const next = planBuy(request);
  if (
    !plan.ok ||
    !next.ok ||
    next.side !== plan.side ||
    next.key !== plan.key ||
    next.amount !== plan.amount ||
    next.cost !== plan.cost
  ) {
    return undefined;
  }

  const good = marketGood(request.market, next.key);
  if (good === undefined) return undefined;

  const credits = request.profile.credits - next.cost;
  if (!Number.isSafeInteger(credits) || credits < 0) return undefined;

  const held = request.profile.cargo[next.key] ?? 0;
  const cargo: Cargo = setCargo(
    request.profile.cargo,
    next.key,
    held + next.amount,
  );

  return {
    market: withStock(request.market, next.key, good.stock - next.amount),
    profile: { ...request.profile, credits, cargo },
  };
}
