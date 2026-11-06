// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The trusted buy/sell transaction path (ECON-02, ECON-03, T-05-06, T-05-17).
 *
 * A plan is pure: it validates the price and amount before any division,
 * computes the feasible quantity and returns the amount, cost and any limiting
 * reason. The caller shows it; `applyBuy`/`applySell` re-run the same plan and
 * refuse on any mismatch before touching credits or cargo. Nothing is
 * subtracted before approval and no path can return negative or
 * non-safe-integer credits.
 *
 * The price is per unit and identical in both directions — these functions
 * never introduce a spread and never move a price. Only the traded good's
 * stock changes.
 */

import type { Commodity, CommodityUnit } from "../../content/types.js";
import {
  capacityPodsFor,
  maxAdditional,
  otherPodsFor,
  setCargo,
} from "./cargo.js";
import type { Cargo } from "./cargo.js";
import { MARKET_LIMIT } from "./market.js";
import type { Market, MarketGood } from "./market.js";
import type { PlayerProfile } from "../player/profile.js";

export type TradeSide = "buy" | "sell";

/**
 * Why a trade is refused or clamped; the UI maps each to fixed copy.
 *
 * `unknownCommodity` is retained from the wave-1 buy path: a market row that the
 * catalogue does not describe is a different fault from an untradeable good,
 * and the caller must be able to say so.
 */
export type TradeRefusal =
  | "invalidPrice"
  | "zeroAmount"
  | "unknownCommodity"
  | "notTradeable"
  | "nothingToSell"
  | "marketFull"
  | "noStock"
  | "insufficientCredits"
  | "holdFull"
  | "overflow";

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

/** Everything a pure buy plan reads; all plain data, no loaders. */
export interface BuyRequest {
  readonly market: Market;
  readonly profile: PlayerProfile;
  readonly commodity: Commodity;
  readonly units: ReadonlyMap<string, CommodityUnit>;
  readonly amount: number;
}

/** Everything a pure sell plan reads. Selling never touches the hold's pods. */
export interface SellRequest {
  readonly market: Market;
  readonly profile: PlayerProfile;
  readonly commodity: Commodity;
  readonly amount: number;
}

/** The result of applying an approved trade: two new values, no mutation. */
export interface TradeApply {
  readonly market: Market;
  readonly profile: PlayerProfile;
}

export type BuyApply = TradeApply;
export type SellApply = TradeApply;

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** The same predicate the profile's credit paths use (`isSafeCredits`). */
function isSafeCredits(credits: number): boolean {
  return Number.isSafeInteger(credits) && credits >= 0;
}

/** A market row's shelf count must be a non-negative safe integer. */
function isSafeStock(stock: number): boolean {
  return Number.isSafeInteger(stock) && stock >= 0;
}

function refusalPlan(
  side: TradeSide,
  key: string,
  reason: TradeRefusal,
): TradePlan {
  return { ok: false, side, key, amount: 0, cost: 0, refusal: reason };
}

function marketGood(market: Market, key: string): MarketGood | undefined {
  return market.goods.find((good) => good.key === key);
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

/** Whether an applied plan is still the plan a request produces right now. */
function planStillValid(plan: TradePlan, next: TradePlan): boolean {
  return (
    plan.ok &&
    next.ok &&
    next.side === plan.side &&
    next.key === plan.key &&
    next.amount === plan.amount &&
    next.cost === plan.cost
  );
}

/**
 * Plan a buy of at most `request.amount` units.
 *
 * The limits are applied sequentially — stock, then affordability, then hold —
 * and `clamp` reports the **last** step that strictly reduced the request, so
 * the player is told the binding constraint rather than the first one noticed.
 * A zero feasible quantity is a refusal; a non-positive, fractional or
 * non-finite request is `zeroAmount` and a non-positive, fractional or
 * non-finite price is `invalidPrice`, both before any arithmetic.
 */
export function planBuy(request: BuyRequest): TradePlan {
  const { market, profile, commodity, units, amount } = request;
  const key = commodity.key;

  const good = marketGood(market, key);
  if (good === undefined) return refusalPlan("buy", key, "unknownCommodity");
  if (!commodity.tradeable) return refusalPlan("buy", key, "notTradeable");
  if (!isPositiveSafeInteger(good.price)) {
    return refusalPlan("buy", key, "invalidPrice");
  }
  if (!isPositiveSafeInteger(amount))
    return refusalPlan("buy", key, "zeroAmount");
  if (!isSafeCredits(profile.credits)) {
    return refusalPlan("buy", key, "insufficientCredits");
  }

  const held = profile.cargo[key] ?? 0;
  if (!Number.isSafeInteger(held) || held < 0) {
    return refusalPlan("buy", key, "zeroAmount");
  }

  const capacityPods = capacityPodsFor(
    profile.equipment,
    profile.passengerBerths,
  );
  const otherPods = otherPodsFor(profile.cargo, units, key);
  if (!Number.isSafeInteger(otherPods) || otherPods < 0) {
    return refusalPlan("buy", key, "holdFull");
  }

  // Bulk goods take one pod per unit; kg/g goods may still ride in the safe of
  // the pod the held good occupies, which `maxAdditional` counts explicitly.
  const spaceLimit =
    commodity.unit === "t"
      ? Math.max(0, capacityPods - otherPods)
      : maxAdditional(commodity.unit, held, otherPods, capacityPods);

  const stockLimit = isSafeStock(good.stock) ? good.stock : 0;
  const affordable = Math.floor(profile.credits / good.price);

  let amountLeft = amount;
  let clamp: TradeRefusal | undefined;
  if (amountLeft > stockLimit) {
    amountLeft = stockLimit;
    clamp = "noStock";
  }
  if (amountLeft > affordable) {
    amountLeft = affordable;
    clamp = "insufficientCredits";
  }
  if (amountLeft > spaceLimit) {
    amountLeft = spaceLimit;
    clamp = "holdFull";
  }

  if (amountLeft <= 0) {
    if (stockLimit <= 0) return refusalPlan("buy", key, "noStock");
    if (affordable <= 0) return refusalPlan("buy", key, "insufficientCredits");
    return refusalPlan("buy", key, "holdFull");
  }

  const cost = amountLeft * good.price;
  if (!Number.isSafeInteger(cost) || cost < 0) {
    return refusalPlan("buy", key, "invalidPrice");
  }

  return {
    ok: true,
    side: "buy",
    key,
    amount: amountLeft,
    cost,
    ...(clamp === undefined ? {} : { clamp }),
  };
}

/**
 * Plan a sell of at most `request.amount` units.
 *
 * Oolite's sell rule (`PlayerEntity.m:10074-10124`): the amount is limited by
 * what the hold carries and by the station's remaining shelf room
 * (`MARKET_LIMIT - stock`). Selling raises stock and never changes the price.
 * A sale whose proceeds would leave the balance outside the safe-integer domain
 * is refused `overflow` before anything is added.
 */
export function planSell(request: SellRequest): TradePlan {
  const { market, profile, commodity, amount } = request;
  const key = commodity.key;

  const good = marketGood(market, key);
  if (good === undefined) return refusalPlan("sell", key, "unknownCommodity");
  if (!commodity.tradeable) return refusalPlan("sell", key, "notTradeable");
  if (!isPositiveSafeInteger(good.price)) {
    return refusalPlan("sell", key, "invalidPrice");
  }
  if (!isPositiveSafeInteger(amount))
    return refusalPlan("sell", key, "zeroAmount");
  if (!isSafeCredits(profile.credits))
    return refusalPlan("sell", key, "overflow");

  const held = profile.cargo[key] ?? 0;
  if (!Number.isSafeInteger(held) || held < 0) {
    return refusalPlan("sell", key, "zeroAmount");
  }

  const heldLimit = Math.max(0, held);
  const marketRoom = isSafeStock(good.stock)
    ? Math.max(0, MARKET_LIMIT - good.stock)
    : 0;

  let amountLeft = amount;
  let clamp: TradeRefusal | undefined;
  if (amountLeft > heldLimit) {
    amountLeft = heldLimit;
    clamp = "nothingToSell";
  }
  if (amountLeft > marketRoom) {
    amountLeft = marketRoom;
    clamp = "marketFull";
  }

  if (amountLeft <= 0) {
    if (heldLimit <= 0) return refusalPlan("sell", key, "nothingToSell");
    return refusalPlan("sell", key, "marketFull");
  }

  const cost = amountLeft * good.price;
  if (!Number.isSafeInteger(cost) || cost < 0) {
    return refusalPlan("sell", key, "invalidPrice");
  }
  if (!isSafeCredits(profile.credits + cost)) {
    return refusalPlan("sell", key, "overflow");
  }

  return {
    ok: true,
    side: "sell",
    key,
    amount: amountLeft,
    cost,
    ...(clamp === undefined ? {} : { clamp }),
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
  if (!planStillValid(plan, next)) return undefined;

  const good = marketGood(request.market, next.key);
  if (good === undefined) return undefined;

  const credits = request.profile.credits - next.cost;
  if (!isSafeCredits(credits)) return undefined;

  const stock = good.stock - next.amount;
  if (!isSafeStock(stock)) return undefined;

  const held = request.profile.cargo[next.key] ?? 0;
  const cargo: Cargo = setCargo(
    request.profile.cargo,
    next.key,
    held + next.amount,
  );

  return {
    market: withStock(request.market, next.key, stock),
    profile: { ...request.profile, credits, cargo },
  };
}

/**
 * Apply an approved sell.
 *
 * The mirror of `applyBuy`: re-plan, refuse any mismatch, add the proceeds only
 * after approval, decrement the cargo (removing a zero entry) and raise the
 * station's stock. The price is copied through untouched.
 */
export function applySell(
  request: SellRequest,
  plan: TradePlan,
): SellApply | undefined {
  const next = planSell(request);
  if (!planStillValid(plan, next)) return undefined;

  const good = marketGood(request.market, next.key);
  if (good === undefined) return undefined;

  const credits = request.profile.credits + next.cost;
  if (!isSafeCredits(credits)) return undefined;

  const stock = good.stock + next.amount;
  if (!isSafeStock(stock) || stock > MARKET_LIMIT) return undefined;

  const held = request.profile.cargo[next.key] ?? 0;
  const remainingHeld = held - next.amount;
  if (!Number.isSafeInteger(remainingHeld) || remainingHeld < 0) {
    return undefined;
  }

  return {
    market: withStock(request.market, next.key, stock),
    profile: {
      ...request.profile,
      credits,
      cargo: setCargo(request.profile.cargo, next.key, remainingHeld),
    },
  };
}
