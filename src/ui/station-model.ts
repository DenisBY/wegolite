// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pure market view model (ECON-04, D-06, D-08, D-09).
 *
 * One function projects a `Market`, the profile and the catalogue into the
 * fixed Oolite-style columns and the footer copy. It returns strings, numbers,
 * booleans and readonly rows only; the shell writes every one with
 * `textContent`. No DOM and no loader runs here.
 *
 * The confirmation and the notice are separate strings: a save notice or a
 * clamp reason can never overwrite the pending `[Y/N]` line (D-02).
 */

import type { Commodity, CommodityUnit } from "../content/types.js";
import { capacityPodsFor, holdPodsUsed } from "../sim/economy/cargo.js";
import type { Market } from "../sim/economy/market.js";
import type { TradePlan } from "../sim/economy/trade.js";
import { formatDecicredits } from "../sim/player/profile.js";
import type { PlayerProfile } from "../sim/player/profile.js";

export interface MarketColumn {
  readonly key: "name" | "unit" | "price" | "stock" | "held" | "ex";
  readonly label: string;
}

export interface MarketRow {
  readonly key: string;
  readonly name: string;
  readonly unit: CommodityUnit;
  /** Integer decicredits per unit. */
  readonly price: number;
  readonly priceText: string;
  readonly stockText: string;
  readonly heldText: string;
  readonly exText: string;
  readonly selectable: boolean;
  readonly dimmed: boolean;
}

export interface MarketFeedback {
  readonly pending: TradePlan | null;
  readonly notice: string;
}

export interface MarketModel {
  readonly columns: readonly MarketColumn[];
  readonly rows: readonly MarketRow[];
  readonly selectedKey: string;
  readonly cashText: string;
  readonly loadText: string;
  readonly confirmText: string;
  readonly noticeText: string;
}

/** The fixed column order (D-08). */
export const MARKET_COLUMNS: readonly MarketColumn[] = Object.freeze([
  { key: "name", label: "Commodity" },
  { key: "unit", label: "Unit" },
  { key: "price", label: "Price" },
  { key: "stock", label: "Stock" },
  { key: "held", label: "Hold" },
  { key: "ex", label: "Ex" },
]);

function confirmationText(
  pending: TradePlan | null,
  commodities: ReadonlyMap<string, Commodity>,
): string {
  if (pending === null || !pending.ok) return "";
  const commodity = commodities.get(pending.key);
  if (commodity === undefined) return "";
  const verb = pending.side === "buy" ? "Buy" : "Sell";
  return `${verb} ${String(pending.amount)} ${commodity.unit} ${commodity.name} for ${formatDecicredits(pending.cost)}? [Y/N]`;
}

/**
 * Build the F8 market screen model.
 *
 * `selection` is the selected commodity key; `feedback.pending` is the plan the
 * footer is confirming and `feedback.notice` is an independent refusal/clamp
 * line. The row order is the catalogue's `sortOrder`, already stable in the
 * generated content.
 */
export function buildMarketModel(
  market: Market,
  profile: PlayerProfile,
  commodities: readonly Commodity[],
  selection: string,
  feedback: MarketFeedback,
): MarketModel {
  const byKey = new Map(
    commodities.map((commodity) => [commodity.key, commodity]),
  );
  const units = new Map(
    commodities.map((commodity) => [commodity.key, commodity.unit]),
  );

  const rows: MarketRow[] = market.goods.map((good) => {
    const commodity = byKey.get(good.key);
    const unit: CommodityUnit = commodity?.unit ?? "t";
    const tradeable = commodity?.tradeable === true;
    const stockText = tradeable && good.stock > 0 ? String(good.stock) : "—";
    const held = profile.cargo[good.key] ?? 0;
    return {
      key: good.key,
      name: commodity?.name ?? good.key,
      unit,
      price: good.price,
      priceText: formatDecicredits(good.price),
      stockText,
      heldText: String(held),
      exText: (commodity?.legalityExport ?? 0) > 0 ? "Ex" : "",
      selectable: tradeable && (good.stock > 0 || held > 0),
      dimmed: !tradeable || good.stock <= 0,
    };
  });

  const usedPods = holdPodsUsed(profile.cargo, units);
  const capacityPods = capacityPodsFor(
    profile.equipment,
    profile.passengerBerths,
  );

  return {
    columns: MARKET_COLUMNS,
    rows,
    selectedKey: selection,
    cashText: formatDecicredits(profile.credits),
    loadText: `Load ${String(usedPods)} / ${String(capacityPods)} t`,
    confirmText: confirmationText(feedback.pending, byKey),
    noticeText: feedback.notice,
  };
}
