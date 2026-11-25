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

import type {
  Commodity,
  CommodityUnit,
  Equipment,
  Labels,
  System,
} from "../content/types.js";
import {
  capacityPodsFor,
  holdPodsUsed,
  availablePods,
} from "../sim/economy/cargo.js";
import type { Market, MarketGood } from "../sim/economy/market.js";
import type { TradePlan } from "../sim/economy/trade.js";
import { FACINGS, NO_LASER } from "../sim/combat/mounts.js";
import type { Facing } from "../sim/combat/mounts.js";
import { jumpBetween } from "../sim/hyperspace/jump.js";
import {
  FUEL_CAPACITY,
  LASER_FIT_KEYS,
  MAX_MISSILES,
  REMOVAL_DESCRIPTIONS,
  VISIBLE_EQUIPMENT_KEYS,
  checkFit,
  checkLaserFit,
  checkRepair,
  fitPrice,
  isLaserFitKey,
  isListedForPurchase,
  isRepairableKey,
  laserFitKey,
  laserFitPrice,
  laserPriceMap,
  parseRepairFitKey,
  repairFitKey,
  repairPrice,
} from "../sim/player/outfitting.js";
import type {
  FitContext,
  FitRefusal,
  LaserFitContext,
} from "../sim/player/outfitting.js";
import {
  formatDecicredits,
  groupIntegerDigits,
} from "../sim/player/profile.js";
import type { PlayerProfile } from "../sim/player/profile.js";

export { formatDecicredits };

/** A pure view model was asked to read a record it cannot describe. */
export class StationModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StationModelError";
  }
}

/** Read one `sysdata-*` template, refusing a key the build did not emit. */
function template(labels: Labels, key: string): string {
  const value = labels.formatTemplates[key];
  if (value === undefined) {
    throw new StationModelError(
      `Wegolite: labels.json has no "${key}" template.`,
    );
  }
  return value;
}

/**
 * Whole-credit formatting for the D-15 removal row labels (`20 ₢`), in
 * Oolite's credits unit (`descriptions.plist:476` `credits-format`
 * "[value] ₢"), grouped as Oolite's `formatCredits` groups whole credits
 * (`oolite-locale-functions.js:60-92` at the pin 7437f22).
 */
export function formatWholeCredits(decicredits: number): string {
  const whole = Math.trunc(decicredits / 10);
  const sign = whole < 0 ? "-" : "";
  return `${sign}${groupIntegerDigits(Math.abs(whole))} ₢`;
}

/**
 * The market's Legal labels. Oolite prints `—`, `Im` (legal to import only),
 * `Ex` (legal to export only) and `Re` (neither) (`descriptions.plist`
 * `oolite-legality-*`); `Im` reads like "illegal", so Wegolite names what is
 * forbidden instead, under the heading Restricted (owner decision 2026-11-25, FIDELITY E-190). `—` stays.
 */
export const LEGALITY_CLEAR = "—";
export const LEGALITY_IMPORT = "No export";
export const LEGALITY_EXPORT = "No import";
export const LEGALITY_NEITHER = "No trade";

/**
 * The market's Legal value from both legality fields, chosen exactly as
 * Oolite's market screen chooses it (`PlayerEntity.m:9675-9691`): a commodity
 * with an import restriction of 0 is legal to import, one with an export
 * restriction of 0 is legal to export. Oolite's `Im` case (legal to import,
 * illegal to export: slaves, narcotics, firearms) prints "No export".
 */
export function legalityText(
  legalityImport: number,
  legalityExport: number,
): string {
  if (legalityImport === 0) {
    return legalityExport === 0 ? LEGALITY_CLEAR : LEGALITY_IMPORT;
  }
  return legalityExport === 0 ? LEGALITY_EXPORT : LEGALITY_NEITHER;
}

/**
 * The hover text of each Restricted value: the rule in full words and Oolite's
 * penalty for breaking it (FIDELITY E-190). A main station checks the hold on
 * docking against the import rule and on launch against the export rule, and
 * adds the restricted tonnage to the commander's bounty
 * (`PlayerEntity.m:6340-6342`, `:6410-6413`). Wegolite does not apply the
 * penalty yet (.planning/todos/pending/2026-11-25-cargo-legality-penalties.md).
 */
export const LEGALITY_TITLES: Readonly<Record<string, string>> = {
  [LEGALITY_CLEAR]: "Legal to import and export.",
  [LEGALITY_IMPORT]:
    "Legal to import, illegal to export. Launching from the main station with it in the hold adds to your bounty and marks you as an offender.",
  [LEGALITY_EXPORT]:
    "Legal to export, illegal to import. Docking at the main station with it in the hold adds to your bounty and marks you as an offender.",
  [LEGALITY_NEITHER]:
    "Illegal to import and export. Docking at or launching from the main station with it in the hold adds to your bounty and marks you as an offender.",
};

/** The hover text for one Legal value; empty for an unknown value. */
export function legalityTitle(legalText: string): string {
  return LEGALITY_TITLES[legalText] ?? "";
}

/**
 * The penalty sentence after the selected restricted good's comment, on the
 * same line under the market list (it fits one line at 1280x720)
 * (owner decision 2026-11-25, FIDELITY E-190): Oolite's bounty on docking
 * with goods the main station may not import and on launch with goods it may
 * not export (`PlayerEntity.m:6340-6342`, `:6410-6413`). Empty for "—".
 */
export const LEGALITY_PENALTIES: Readonly<Record<string, string>> = {
  [LEGALITY_CLEAR]: "",
  [LEGALITY_IMPORT]: "Launching with it aboard makes you an offender.",
  [LEGALITY_EXPORT]: "Docking with it aboard makes you an offender.",
  [LEGALITY_NEITHER]:
    "Docking or launching with it aboard makes you an offender.",
};

/**
 * The F5 mark of a damaged item (Phase 19, D-07): ` (damaged)` where Oolite
 * writes ` (N/A)`. A recorded divergence; `tests/ui/station-status.test.ts`
 * pins it against `descriptions.plist` `equipment-@-not-available`.
 */
export const DAMAGED_STATUS_SUFFIX = " (damaged)";

function equipmentName(
  byKey: ReadonlyMap<string, Equipment>,
  key: string,
): string {
  const record = byKey.get(key);
  if (record === undefined) {
    throw new StationModelError(
      `Wegolite: the equipment catalogue has no entry with key "${key}".`,
    );
  }
  return record.name;
}

/** One fixed market column: its key and its heading. */
export interface MarketColumnSpec {
  readonly key: "name" | "unit" | "price" | "stock" | "held" | "legal";
  readonly label: string;
}

/** A market column as the screen draws it: sortable or not, and its direction. */
export interface MarketColumn extends MarketColumnSpec {
  readonly sortable: boolean;
  /** The active sort direction on this column, or null. */
  readonly sort: MarketSortDirection | null;
}

/**
 * The F8 columns a heading click sorts by. Oolite's market sorters
 * (`PlayerEntity.m:9612-9628` at the pin 7437f22) are name, price, quantity in
 * the market, quantity in the hold and mass unit; it has no legality sorter,
 * so Legal is not sortable.
 */
export type MarketSortColumn = "name" | "unit" | "price" | "stock" | "held";
export type MarketSortDirection = "ascending" | "descending";

/** The active market sort, or null for the catalogue order. Session state only. */
export type MarketSort = {
  readonly column: MarketSortColumn;
  readonly direction: MarketSortDirection;
} | null;

/** The allow-list of sortable columns; the shell and the controller accept nothing else. */
export const MARKET_SORT_COLUMNS: readonly MarketSortColumn[] = Object.freeze([
  "name",
  "unit",
  "price",
  "stock",
  "held",
]);

/** Whether a value is one of the five sortable column keys. */
export function isMarketSortColumn(value: unknown): value is MarketSortColumn {
  return (
    typeof value === "string" &&
    (MARKET_SORT_COLUMNS as readonly string[]).includes(value)
  );
}

/**
 * The heading-click cycle (owner decision 2026-11-18): a new column starts
 * ascending, the same column then turns descending, then back to the
 * catalogue order.
 */
export function nextMarketSort(
  current: MarketSort,
  column: MarketSortColumn,
): MarketSort {
  if (current === null || current.column !== column) {
    return { column, direction: "ascending" };
  }
  return current.direction === "ascending"
    ? { column, direction: "descending" }
    : null;
}

/**
 * Oolite's `OOMassUnit` order (`OOTypes.h`: UNITS_TONS, UNITS_KILOGRAMS,
 * UNITS_GRAMS), which `marketSorterByMassUnit` compares.
 */
const MASS_UNIT_ORDER: Readonly<Record<CommodityUnit, number>> = Object.freeze({
  t: 0,
  kg: 1,
  g: 2,
});

/** A literal code-unit compare, as `NSString compare:` without options. */
function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Order the market goods by one of Oolite's comparators
 * (`PlayerEntity.m:11868-11911` at the pin: name, price, quantity, mass unit,
 * all ascending). Descending negates the comparator; ties keep the catalogue
 * order in both directions. Returns a new array and never mutates `goods`.
 */
export function sortMarketGoods<G extends MarketGood>(
  goods: readonly G[],
  sort: MarketSort,
  commodities: readonly Commodity[],
  cargo: Readonly<Record<string, number>>,
): G[] {
  const indexed = goods.map((good, index) => ({ good, index }));
  if (sort === null) return indexed.map((entry) => entry.good);
  const byKey = new Map(
    commodities.map((commodity) => [commodity.key, commodity]),
  );
  const compare = (left: G, right: G): number => {
    switch (sort.column) {
      case "name":
        return compareCodeUnits(
          byKey.get(left.key)?.name ?? left.key,
          byKey.get(right.key)?.name ?? right.key,
        );
      case "unit":
        return (
          MASS_UNIT_ORDER[byKey.get(left.key)?.unit ?? "t"] -
          MASS_UNIT_ORDER[byKey.get(right.key)?.unit ?? "t"]
        );
      case "price":
        return left.price - right.price;
      case "stock":
        return left.stock - right.stock;
      case "held":
        return (cargo[left.key] ?? 0) - (cargo[right.key] ?? 0);
    }
  };
  const sign = sort.direction === "ascending" ? 1 : -1;
  indexed.sort(
    (left, right) =>
      sign * compare(left.good, right.good) || left.index - right.index,
  );
  return indexed.map((entry) => entry.good);
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
  /** The Restricted value: "—", "No export", "No import" or "No trade" (`legalityText`). */
  readonly legalText: string;
  readonly selectable: boolean;
  readonly dimmed: boolean;
}

export interface MarketFeedback {
  readonly pending: TradePlan | null;
  readonly notice: string;
}

/**
 * The one definition of a reachable market row: the catalogue must trade it,
 * and the hold must be able to buy it or already carry some of it.
 */
export function isMarketRowSelectable(
  tradeable: boolean,
  stock: number,
  held: number,
): boolean {
  return tradeable && (stock > 0 || held > 0);
}

/**
 * Oolite's `oolite-commodity-no-comment` (`descriptions.plist:1657`): the
 * comment text of a commodity without a note of its own. The market list shows
 * no line for it (see `MarketModel.commentText`).
 */
export const MARKET_NO_COMMENT_TEXT = "No additional information available";

export interface MarketModel {
  readonly columns: readonly MarketColumn[];
  readonly rows: readonly MarketRow[];
  readonly selectedKey: string;
  /**
   * The selected commodity's compiled comment, for the line under the table;
   * empty for no selection, a key that is not a market row, or Oolite's
   * default no-comment text (owner decision 2026-11-24, quick 261124-ou6:
   * Wegolite has no Market Info screen, `setGuiToMarketInfoScreen` at
   * `PlayerEntity.m:9895`, so the comment lives on the list and the default
   * text is left out).
   */
  readonly commentText: string;
  /**
   * The selected commodity's penalty sentence, shown after the comment on the
   * same line (`LEGALITY_PENALTIES`); empty when nothing restricted is selected.
   */
  readonly penaltyText: string;
  /**
   * Oolite's `market-cash-and-load` line under the table
   * (`descriptions.plist:1635`, `PlayerEntity.m:9979-9986`):
   * "Cash: 100.0 ₢. Load 0 of 20 t."
   */
  readonly cashLoadText: string;
  readonly confirmText: string | null;
  readonly noticeText: string;
}

/** The fixed column order (D-08). */
export const MARKET_COLUMNS: readonly MarketColumnSpec[] = Object.freeze([
  { key: "name", label: "Commodity" },
  { key: "unit", label: "Unit" },
  { key: "price", label: "Price" },
  { key: "stock", label: "Stock" },
  { key: "held", label: "Hold" },
  // Oolite's `oolite-legality-column-title` is "Legal:"; Wegolite heads the
  // column Restricted, so "—" reads as "none" and each value as a ban
  // (FIDELITY E-190). The market headings drop Oolite's trailing colons.
  { key: "legal", label: "Restricted" },
]);

function confirmationText(
  pending: TradePlan | null,
  commodities: ReadonlyMap<string, Commodity>,
): string | null {
  if (pending === null || !pending.ok) return null;
  const commodity = commodities.get(pending.key);
  if (commodity === undefined) return null;
  const verb = pending.side === "buy" ? "Buy" : "Sell";
  return `${verb} ${String(pending.amount)} ${commodity.unit} ${commodity.name} for ${formatDecicredits(pending.cost)}? [Y/N]`;
}

/**
 * The exact clamp/refusal copy (D-06, RESEARCH §Trading).
 *
 * A clamped plan names the feasible amount and the binding limit; a refusal is
 * blunt because nothing can be bought. `zeroAmount` is never player-facing — it
 * is a pure-plan guard for forged/direct callers and returns no copy.
 */
export function tradeNoticeText(
  plan: TradePlan | null,
  commodity: Commodity | undefined,
): string {
  if (plan === null) return "";
  const unit = commodity?.unit ?? "t";

  if (!plan.ok) {
    switch (plan.refusal) {
      case "noStock":
        return `Only 0 ${unit} available`;
      case "insufficientCredits":
        return "Not enough credits";
      case "holdFull":
        return "Hold full";
      case "marketFull":
        return `Station can only take 0 ${unit}`;
      case "nothingToSell":
        return "Nothing to sell";
      case "notTradeable":
        return "Not traded here";
      case "unknownCommodity":
        return "Not traded here";
      case "invalidPrice":
        return "Price unavailable";
      case "overflow":
        return "Amount too large";
      case "zeroAmount":
        return "";
    }
  }

  switch (plan.clamp) {
    case "noStock":
      return `Only ${String(plan.amount)} ${unit} available`;
    case "insufficientCredits":
      return "Not enough credits";
    case "holdFull":
      return `Only ${String(plan.amount)} ${unit} of hold space`;
    case "marketFull":
      return `Station can only take ${String(plan.amount)} ${unit}`;
    case "nothingToSell":
      return "Nothing to sell";
    case "notTradeable":
      return "Not traded here";
    case "unknownCommodity":
      return "Not traded here";
    case "invalidPrice":
      return "Price unavailable";
    case "overflow":
      return "Amount too large";
    case "zeroAmount":
    case undefined:
      return "";
  }
}

/**
 * Build the F8 market screen model.
 *
 * `selection` is the selected commodity key; `feedback.pending` is the plan the
 * footer is confirming and `feedback.notice` is an independent refusal/clamp
 * line. The row order is the catalogue's `sortOrder`, already stable in the
 * generated content, unless `sort` names a heading-click sort
 * (`sortMarketGoods`).
 */
export function buildMarketModel(
  market: Market,
  profile: PlayerProfile,
  commodities: readonly Commodity[],
  selection: string,
  feedback: MarketFeedback,
  sort: MarketSort = null,
): MarketModel {
  const byKey = new Map(
    commodities.map((commodity) => [commodity.key, commodity]),
  );
  const units = new Map(
    commodities.map((commodity) => [commodity.key, commodity.unit]),
  );

  const ordered = sortMarketGoods(
    market.goods,
    sort,
    commodities,
    profile.cargo,
  );
  const rows: MarketRow[] = ordered.map((good) => {
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
      heldText: held === 0 ? "—" : String(held),
      legalText: legalityText(
        commodity?.legalityImport ?? 0,
        commodity?.legalityExport ?? 0,
      ),
      selectable: isMarketRowSelectable(tradeable, good.stock, held),
      dimmed: !tradeable || good.stock <= 0,
    };
  });

  const usedPods = holdPodsUsed(profile.cargo, units);
  const capacityPods = capacityPodsFor(
    profile.equipment,
    profile.passengerBerths,
  );
  const pendingCommodity =
    feedback.pending === null ? undefined : byKey.get(feedback.pending.key);
  const clampNotice = tradeNoticeText(feedback.pending, pendingCommodity);

  const columns: MarketColumn[] = MARKET_COLUMNS.map((column) => ({
    ...column,
    sortable: isMarketSortColumn(column.key),
    sort: sort !== null && sort.column === column.key ? sort.direction : null,
  }));

  // The comment line follows the selection when it names a market row with a
  // catalogue record (Oolite's `indexOfObject` test, `PlayerEntity.m:9928-9937`).
  const selectedComment =
    selection !== "" && rows.some((row) => row.key === selection)
      ? byKey.get(selection)?.comment
      : undefined;

  return {
    columns,
    rows,
    selectedKey: selection,
    commentText:
      selectedComment === undefined ||
      selectedComment === MARKET_NO_COMMENT_TEXT
        ? ""
        : selectedComment,
    penaltyText:
      selectedComment === undefined
        ? ""
        : (LEGALITY_PENALTIES[
            rows.find((row) => row.key === selection)?.legalText ?? ""
          ] ?? ""),
    cashLoadText: `Cash: ${formatDecicredits(profile.credits)}. Load ${String(usedPods)} of ${String(capacityPods)} t.`,
    confirmText: confirmationText(feedback.pending, byKey),
    noticeText: clampNotice === "" ? feedback.notice : clampNotice,
  };
}

/** One labeled field on the F5 status page or a system information card. */
export interface LabelledField {
  readonly label: string;
  readonly value: string;
}

/**
 * One line of the F5 manifest, Oolite's `manifest-cargo-quantity`
 * " [quantity] [units] × [commodityName]" (`descriptions.plist:1587`) without
 * its leading space; the unit is the commodity's own (t/kg/g).
 */
export interface ManifestRow {
  readonly key: string;
  readonly text: string;
}

/** The F5 two-page model. Both pages are materialized; `page` names the active one. */
export interface StatusModel {
  readonly page: 1 | 2;
  readonly pageText: string;
  readonly fields: readonly LabelledField[];
  readonly equipment: readonly string[];
  /** Oolite's `oolite-manifest-cargo` "Cargo [current] t ([max] t)". */
  readonly cargoText: string;
  /** Oolite's `oolite-manifest-cabins` "Passenger Cabins [current] / [max]". */
  readonly cabinsText: string;
  /** Only the goods carried, in market order. */
  readonly manifest: readonly ManifestRow[];
  /** Oolite's `manifest-none` "No cargo carried." when nothing is carried, else "". */
  readonly emptyText: string;
}

/** Oolite's `manifest-none` without its leading space (`descriptions.plist:1916`). */
export const MANIFEST_NONE_TEXT = "No cargo carried.";

/**
 * Oolite's trimmed facing strings (`descriptions.plist:1895-1898`, the
 * `forward-facing-string` family, which carry padding spaces in the plist).
 */
const FACING_LABELS: Readonly<Record<Facing, string>> = Object.freeze({
  fore: "Forward",
  aft: "Aft",
  port: "Port",
  starboard: "Starboard",
});

const COMMANDER_NAME = "Jameson";
/**
 * The standard scenario's `ship_name` and `ship_class_name`
 * (`Resources/Scenarios/oolite-standard.oolite-save`).
 */
const SHIP_NAME = "Cobra Mark III";
const UNKNOWN_HYPERSPACE_SYSTEM = "(Unknown)";

/**
 * Oolite's rating with its kill count, `KillCountToRatingAndKillString`
 * (`OOConstToString.m:401`): `"%@   (%u)"`, the rating, three spaces and the
 * count in parentheses.
 */
export function formatRating(rating: string, kills: number): string {
  const count = Number.isSafeInteger(kills) && kills > 0 ? kills : 0;
  return `${rating}   (${String(count)})`;
}
const DOCKED_CONDITION = "Docked";

function clampPage(page: number): 1 | 2 {
  const normalized = Number.isFinite(page) ? Math.trunc(page) : 1;
  return normalized <= 1 ? 1 : 2;
}

/**
 * Build the F5 status and manifest model (ECON-06, D-04).
 *
 * Page 1's field labels are fixed app literals — the compiled label record
 * deliberately carries no `status-*` keys — while the legal-status and rating
 * values come from `labels.json`. The equipment list is omitted only when the
 * profile has no equipment key, no missiles, no berths and no fitted laser, so
 * a new game still lists its three missiles and "Forward Pulse Laser".
 *
 * Page 2 is Oolite's manifest (`PlayerEntityContracts.m:1058-1082` at the pin
 * 7437f22): the cargo line (pods used of the capacity, as the hold counts
 * them), the cabins line (Wegolite carries no passengers, so the current
 * count is 0 and the maximum is the berths), then one line per tradeable good
 * carried in `sortOrder` (`PlayerEntity.m:7390-7425` lists the hold in market
 * order), or "No cargo carried.".
 */
export function buildStatusModel(
  profile: PlayerProfile,
  system: System,
  labels: Labels,
  equipmentCatalogue: readonly Equipment[],
  commodities: readonly Commodity[],
  page: number,
  targetSystemName?: string,
): StatusModel {
  const equipmentByKey = new Map(
    equipmentCatalogue.map((record) => [record.key, record]),
  );

  const fields: LabelledField[] = [
    { label: "Commander", value: COMMANDER_NAME },
    { label: "Ship", value: SHIP_NAME },
    { label: "Present System", value: system.name },
    {
      label: "Hyperspace System",
      value: targetSystemName ?? UNKNOWN_HYPERSPACE_SYSTEM,
    },
    { label: "Condition", value: DOCKED_CONDITION },
    { label: "Fuel", value: `${(profile.fuel / 10).toFixed(1)} Light Years` },
    { label: "Cash", value: formatDecicredits(profile.credits) },
    { label: "Legal Status", value: labels.legalStatus[0] ?? "" },
    // The profile keeps no kill count yet: the combat rating is in the LAW
    // backlog (REQUIREMENTS.md LAW-01..LAW-07), and a new commander's
    // `ship_kills` is 0.
    { label: "Rating", value: formatRating(labels.rating[0] ?? "", 0) },
  ];

  // Damaged items come first, as in Oolite (`PlayerEntity.m:7238-7240`, its
  // `prioritiseDamaged` setting, default on, is not ported). Two recorded F5
  // divergences (Phase 19, D-07, D-12; FIDELITY E-165 and E-169, quoting the
  // F5 Key Decisions row): Oolite writes `%@ (N/A)` (`descriptions.plist`
  // 1584), which the owner found reads as "not for sale", so Wegolite writes
  // `<name> (damaged)`; and Oolite orders the damaged group by
  // `reverseEquipmentEnumerator` (reverse catalogue order, `:7156, 7200-7212`),
  // where Wegolite lists it in damage order, like the installed list.
  const equipment: string[] = [
    ...profile.damagedEquipment.map(
      (key) =>
        `${equipmentByKey.get(key)?.name ?? key}${DAMAGED_STATUS_SUFFIX}`,
    ),
    ...profile.equipment.map((key) => equipmentName(equipmentByKey, key)),
  ];
  if (profile.missiles > 0) equipment.push(`Missile ×${profile.missiles}`);
  if (profile.passengerBerths > 0) {
    equipment.push(`Passenger Berth ×${profile.passengerBerths}`);
  }
  // Oolite lists each fitted laser after the other equipment, forward, aft,
  // port, starboard ("Forward Pulse Laser"; descriptions.plist:1589-1592,
  // PlayerEntity.m:7221-7237).
  for (const facing of FACINGS) {
    const mount = profile.laserMounts[facing];
    if (mount === NO_LASER) continue;
    equipment.push(
      `${FACING_LABELS[facing]} ${equipmentName(equipmentByKey, mount)}`,
    );
  }

  const units = new Map(
    commodities.map((commodity) => [commodity.key, commodity.unit]),
  );
  const manifest: ManifestRow[] = [...commodities]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter(
      (commodity) =>
        commodity.tradeable && (profile.cargo[commodity.key] ?? 0) > 0,
    )
    .map((commodity) => ({
      key: commodity.key,
      text: `${String(profile.cargo[commodity.key] ?? 0)} ${commodity.unit} × ${commodity.name}`,
    }));

  const usedPods = holdPodsUsed(profile.cargo, units);
  const capacityPods = capacityPodsFor(
    profile.equipment,
    profile.passengerBerths,
  );
  const active = clampPage(page);

  return {
    page: active,
    pageText: `Page ${active}/2`,
    fields,
    equipment,
    cargoText: `Cargo ${String(usedPods)} t (${String(capacityPods)} t)`,
    cabinsText: `Passenger Cabins 0 / ${String(profile.passengerBerths)}`,
    manifest,
    emptyText: manifest.length === 0 ? MANIFEST_NONE_TEXT : "",
  };
}

/** The system information model: a title, seven sysdata rows and the description. */
export interface SystemDataModel {
  readonly title: string;
  readonly fields: readonly LabelledField[];
  readonly description: string;
}

/**
 * The four documented value tokens. The regex is literal and closed: no
 * general template language and no pattern built from `labels.json`.
 */
const VALUE_TOKEN_PATTERN =
  /\[(?:techLevel|productivity|radius|population\|multiply:0\.1\|precision:1)\]/g;

/**
 * Expand one value template in a single pass with a replacer function.
 *
 * A replacer function is deliberate: `String.replace` with a replacement string
 * interprets `$&`, `$'` and `$1` in the value, which would corrupt a system name
 * or a template value. A leftover `[` means an undocumented token reached the
 * model, so it throws instead of rendering as prose.
 */
function expandValueTemplate(
  source: string,
  values: ReadonlyMap<string, string>,
  key: string,
): string {
  const expanded = source.replace(VALUE_TOKEN_PATTERN, (token) => {
    const value = values.get(token);
    return value === undefined ? token : value;
  });
  if (expanded.includes("[")) {
    throw new StationModelError(
      `Wegolite: the "${key}" template has an unknown token.`,
    );
  }
  return expanded;
}

function expandTitle(labels: Labels, system: System): string {
  const source = template(labels, "sysdata-data-on-system");
  const title = source.split("[system]").join(system.name);
  if (title.includes("[")) {
    throw new StationModelError(
      'Wegolite: the "sysdata-data-on-system" template has an unknown token.',
    );
  }
  return title;
}

/**
 * The distance from the current system to the displayed system.
 *
 * Oolite measures `info_system_id` from `galaxy_coordinates`
 * (`PlayerEntity.m:7579-7584`). A different system that shares the current
 * chart position is forced to 0.1 ly rather than 0.0 ly.
 */
function distanceText(current: System, info: System): string {
  if (info.id === current.id) return "0.0 ly";
  const { dist, distanceLy } = jumpBetween(
    { x: current.chartX, y: current.chartY },
    { x: info.chartX, y: info.chartY },
  );
  return `${(dist === 0 ? 0.1 : distanceLy).toFixed(1)} ly`;
}

/**
 * Build the system information model used by the chart hover card.
 *
 * `info` is the chart system under the pointer, not necessarily the docked
 * system: the card describes `info_system_id` and measures the distance from
 * the current system (`PlayerEntity.m:7506`).
 * The title and the seven field labels come from `labels.json`; the four value
 * templates are expanded once, and the description is the compiled
 * `System.description` verbatim. Nothing here generates prose.
 */
export function buildSystemDataModel(
  info: System,
  current: System,
  labels: Labels,
): SystemDataModel {
  const values = new Map<string, string>([
    ["[techLevel]", String(info.techLevelRaw + 1)],
    ["[productivity]", String(info.productivity)],
    ["[radius]", String(info.radiusKm)],
    [
      "[population|multiply:0.1|precision:1]",
      (info.population * 0.1).toFixed(1),
    ],
  ]);

  const field = (labelKey: string, valueKey: string | null, value: string) => {
    const label = template(labels, labelKey);
    return {
      label,
      value:
        valueKey === null
          ? value
          : expandValueTemplate(template(labels, valueKey), values, valueKey),
    };
  };

  const fields: LabelledField[] = [
    {
      label: template(labels, "sysdata-eco"),
      value: labels.economy[info.economy] ?? "",
    },
    {
      label: template(labels, "sysdata-govt"),
      value: labels.government[info.government] ?? "",
    },
    field("sysdata-tl", "sysdata-tl-value", ""),
    field("sysdata-pop", "sysdata-pop-value", ""),
    // Oolite's sysdata-line-8 "\t([inhabitants])" (`descriptions.plist:1693`
    // at the pin 7437f22): the inhabitants sit in the value column under the
    // population, with no label.
    { label: "", value: `(${info.inhabitants})` },
    field("sysdata-prod", "sysdata-prod-value", ""),
    field("sysdata-radius", "sysdata-radius-value", ""),
    {
      label: template(labels, "sysdata-distance"),
      value: distanceText(current, info),
    },
  ];

  return {
    title: expandTitle(labels, info),
    fields,
    description: info.description,
  };
}

/** One F3 row; `dimmed`/`confirmable` are model flags so the shell never re-derives them. */
export interface OutfittingRow {
  readonly key: string;
  /** The display string (may carry a count or the whole-credit removal price). */
  readonly label: string;
  /** The short confirmation name without the appended price. */
  readonly name: string;
  /** Integer decicredits: the catalogue price or the fuel fill cost. */
  readonly cost: number;
  readonly priceText: string;
  readonly enabled: boolean;
  readonly dimmed: boolean;
  /** Empty when enabled; otherwise the exact short refusal copy. */
  readonly reason: string;
  readonly owned: boolean;
  /** The current count for a multi-instance row, otherwise null. */
  readonly multiCount: number | null;
  readonly confirmable: boolean;
  /**
   * The verb of the `[Y/N]` prompt: `Buy` on every purchase, removal and
   * facing row, `Repair` on a damaged item's repair row (Phase 19, D-08).
   */
  readonly verb: "Buy" | "Repair";
}

export interface OutfittingDetail {
  readonly title: string;
  readonly description: string;
  readonly priceText: string;
}

export interface OutfittingModel {
  readonly rows: readonly OutfittingRow[];
  readonly detail: OutfittingDetail | null;
  readonly fuelVisible: boolean;
  readonly selectedKey: string;
  /**
   * The laser key whose facing selection is open, or null on the main list.
   * While set, `rows` are the four facing rows keyed by `laserFitKey`.
   */
  readonly facingFor: string | null;
  /**
   * `OUTFITTING_EMPTY_TEXT` when the main list has no rows, otherwise empty.
   * The facing selection always lists the ship's facings, so it is always "".
   */
  readonly emptyText: string;
}

/**
 * The F3 empty state: Oolite's `setGuiToEquipShipScreen` shows
 * `DESC(@"equip-no-equipment-available-for-purchase")` when no item passes
 * `equipmentAllowed` (`PlayerEntity.m:8511`). The key lives in
 * `descriptions.plist` (vendored copy at
 * `third_party/oolite/Config/descriptions.plist`). The content build does not
 * compile it, so the text is a literal here and
 * `tests/ui/station-outfitting.test.ts` pins it to the vendored plist.
 */
export const OUTFITTING_EMPTY_TEXT = "No equipment available for purchase.";

/**
 * The F3 repair row (Phase 19, D-07). `descriptions.plist` `equip-repair-@`
 * (vendored copy, line 1846) applied to the item name Oolite wraps as
 * `" %@ "` (`PlayerEntity.m:8377`) renders `" Repair: Docking Computers "`;
 * the label is that rendered text trimmed, which is Oolite's own row, not a
 * divergence. `tests/ui/station-outfitting.test.ts` pins both to the plist.
 */
export const REPAIR_LABEL_TEMPLATE = " Repair:%@";

/**
 * The F3 detail of a repair row: `descriptions.plist`
 * `upgradeinfo-@-price-is-for-repairing` (line 1847) applied to the item's
 * description.
 */
export const REPAIR_DETAIL_TEMPLATE =
  "%@ (Price is for repairing the existing system).";

/** Fill one `%@` slot of an Oolite template (a function replacer: no `$` patterns). */
function fillTemplate(templateText: string, value: string): string {
  return templateText.replace("%@", () => value);
}

/** `Repair: <name>`: the template applied to Oolite's wrapped name, trimmed. */
function repairLabel(name: string): string {
  return fillTemplate(REPAIR_LABEL_TEMPLATE, ` ${name} `).trim();
}

const REMOVAL_KEYS: ReadonlySet<string> = new Set([
  "EQ_PASSENGER_BERTH_REMOVAL",
  "EQ_MISSILE_REMOVAL",
]);

/** The exact short F3 refusal copy, never a sentence. */
function fitReason(reason: FitRefusal, item: Equipment): string {
  switch (reason) {
    case "notOffered":
      return "Not offered";
    case "techLevel":
      return `Requires TL ${String(item.techLevel)}`;
    case "owned":
      return "Already installed";
    case "insufficientCredits":
      return "Not enough credits";
    case "pylonsFull":
      return "Pylons full";
    case "cargoSpace":
      return "No cargo space";
    case "fullFuel":
      return "Full tank";
    case "nothingToRemove":
      return "Nothing to remove";
    case "noLaser":
      return "No laser fitted";
    case "invalidPrice":
      return "Price unavailable";
    case "invalidCondition":
      return "Not available";
    case "maxInstances":
      return "Maximum reached";
    case "damaged":
      return "Needs repair";
    case "notDamaged":
      return "Not damaged";
  }
}

function outfittingLabel(item: Equipment, profile: PlayerProfile): string {
  switch (item.key) {
    case "EQ_MISSILE":
      return `Missile (${String(profile.missiles)}/${String(MAX_MISSILES)})`;
    case "EQ_PASSENGER_BERTH":
      return `Passenger Berth (${String(profile.passengerBerths)})`;
    case "EQ_PASSENGER_BERTH_REMOVAL":
      return `Remove Passenger Berth — ${formatWholeCredits(item.price)}`;
    case "EQ_MISSILE_REMOVAL":
      return `Remove Missile — ${formatWholeCredits(item.price)}`;
    default:
      return item.name;
  }
}

function outfittingName(item: Equipment): string {
  switch (item.key) {
    case "EQ_MISSILE":
      return "Missile";
    case "EQ_PASSENGER_BERTH":
      return "Passenger Berth";
    case "EQ_PASSENGER_BERTH_REMOVAL":
      return "Remove Passenger Berth";
    case "EQ_MISSILE_REMOVAL":
      return "Remove Missile";
    default:
      return item.name;
  }
}

function isOwned(item: Equipment, profile: PlayerProfile): boolean {
  if (item.key === "EQ_MISSILE") return profile.missiles > 0;
  if (item.key === "EQ_PASSENGER_BERTH") return profile.passengerBerths > 0;
  if (REMOVAL_KEYS.has(item.key)) return false;
  return profile.equipment.includes(item.key);
}

function multiCount(item: Equipment, profile: PlayerProfile): number | null {
  if (item.key === "EQ_MISSILE") return profile.missiles;
  if (item.key === "EQ_PASSENGER_BERTH") return profile.passengerBerths;
  return null;
}

/**
 * Build the F3 outfitting row model (ECON-05, ECON-08, D-11..D-16).
 *
 * Rows follow `VISIBLE_EQUIPMENT_KEYS` order, then the lasers in
 * `LASER_FIT_KEYS` order, but only listed rows appear: as in Oolite's
 * `equipmentAllowed` (`PlayerEntity.m:8293-8302`), an item above the system's
 * tech level, already fitted or with no room to add it is left out
 * (`isListedForPurchase`). The only disabled main-list row is therefore an
 * unaffordable one; it stays selectable so its detail and "Not enough credits"
 * can be read, but `confirmable` is false. With no row listed, `emptyText` is
 * Oolite's `OUTFITTING_EMPTY_TEXT` and `detail` is null. Removal rows use
 * D-15's whole-credit label while the detail and the confirmation keep the
 * exact decimal price. Removal detail copy is the truthful per-entry
 * `REMOVAL_DESCRIPTIONS` override, never the generated description: the missile
 * entry states the full catalogue value re-sale and the berth entry states that
 * No refund is paid.
 */
export function buildOutfittingModel(
  catalogue: readonly Equipment[],
  profile: PlayerProfile,
  systemTechLevelRaw: number,
  selectedKey: string,
  unitByKey: ReadonlyMap<string, CommodityUnit>,
  facingFor: string | null = null,
): OutfittingModel {
  const byKey = new Map(catalogue.map((record) => [record.key, record]));
  const missile = byKey.get("EQ_MISSILE");
  if (missile === undefined) {
    throw new StationModelError(
      'Wegolite: the equipment catalogue has no "EQ_MISSILE" entry.',
    );
  }

  const ctx: LaserFitContext = {
    techLevelRaw: systemTechLevelRaw,
    fuelCapacity: FUEL_CAPACITY,
    missileCapacity: MAX_MISSILES,
    availablePods: availablePods(profile, unitByKey),
    missilePrice: missile.price,
    laserPrices: laserPriceMap(catalogue),
  };
  const fuelVisible = profile.fuel < FUEL_CAPACITY;

  // An open facing selection for a key outside the laser allow-list (stale or
  // forged state) falls back to the main list.
  if (facingFor !== null && isLaserFitKey(facingFor)) {
    return buildFacingModel(byKey, profile, ctx, facingFor, selectedKey);
  }

  const rows: OutfittingRow[] = [];
  for (const key of VISIBLE_EQUIPMENT_KEYS) {
    if (key === "EQ_FUEL" && !fuelVisible) continue;
    if (key === "EQ_PASSENGER_BERTH_REMOVAL" && profile.passengerBerths === 0) {
      continue;
    }
    if (key === "EQ_MISSILE_REMOVAL" && profile.missiles === 0) continue;

    const item = byKey.get(key);
    if (item === undefined) {
      throw new StationModelError(
        `Wegolite: the equipment catalogue has no entry with key "${key}".`,
      );
    }

    // A damaged repairable item replaces its purchase row with the repair row,
    // at the same position (`PlayerEntity.m:8403-8411`). Below the repair tech
    // level, or with the item not damaged, `checkRepair` hides it as usual.
    if (isRepairableKey(key) && profile.damagedEquipment.includes(key)) {
      const repair = checkRepair(profile, item, ctx);
      if (!isListedForPurchase(repair)) continue;
      const repairCost = repairPrice(item);
      rows.push({
        key: repairFitKey(key),
        label: repairLabel(item.name),
        name: item.name,
        cost: repairCost,
        priceText: formatDecicredits(repairCost),
        enabled: repair.ok,
        dimmed: !repair.ok,
        reason: repair.ok ? "" : fitReason(repair.reason, item),
        owned: false,
        multiCount: null,
        confirmable: repair.ok,
        verb: "Repair",
      });
      continue;
    }

    const check = checkFit(profile, item, ctx);
    if (!isListedForPurchase(check)) continue;
    const cost = fitPrice(profile, item, ctx);
    const removal = REMOVAL_KEYS.has(key);
    const enabled = check.ok;
    rows.push({
      key,
      label: outfittingLabel(item, profile),
      name: outfittingName(item),
      cost,
      priceText: removal ? formatWholeCredits(cost) : formatDecicredits(cost),
      enabled,
      dimmed: !enabled,
      reason: check.ok ? "" : fitReason(check.reason, item),
      owned: isOwned(item, profile),
      multiCount: multiCount(item, profile),
      confirmable: enabled,
      verb: "Buy",
    });
  }

  // Lasers follow the visible rows, in `LASER_FIT_KEYS` order. Remove Laser is
  // listed only while some facing has a laser to remove. A laser is listed when
  // at least one facing passes every rule but affordability; a listed laser no
  // facing can afford reads "Not enough credits", never another facing's refusal.
  const anyLaser = FACINGS.some(
    (facing) => profile.laserMounts[facing] !== NO_LASER,
  );
  for (const key of LASER_FIT_KEYS) {
    if (key === NO_LASER && !anyLaser) continue;
    const item = byKey.get(key);
    if (item === undefined) {
      throw new StationModelError(
        `Wegolite: the equipment catalogue has no entry with key "${key}".`,
      );
    }
    const checks = FACINGS.map((facing) =>
      checkLaserFit(profile, item, facing, ctx),
    );
    if (!checks.some(isListedForPurchase)) continue;
    const firstOk = checks.some((check) => check.ok);
    const refusal = checks.find(
      (check) => !check.ok && isListedForPurchase(check),
    );
    const cost = laserFitPrice(item);
    rows.push({
      key,
      label: item.name,
      name: item.name,
      cost,
      priceText: formatDecicredits(cost),
      enabled: firstOk,
      dimmed: !firstOk,
      reason:
        firstOk || refusal === undefined || refusal.ok
          ? ""
          : fitReason(refusal.reason, item),
      owned: false,
      multiCount: null,
      confirmable: firstOk,
      verb: "Buy",
    });
  }

  const selected = rows.find((row) => row.key === selectedKey);
  let detail: OutfittingDetail | null = null;
  if (selected !== undefined) {
    // A repair row's key is `<key>@repair`: parse it back to the item.
    const repairKey = parseRepairFitKey(selected.key);
    const item = byKey.get(repairKey ?? selected.key);
    if (item === undefined) {
      throw new StationModelError(
        `Wegolite: the equipment catalogue has no entry with key "${selectedKey}".`,
      );
    }
    const override = REMOVAL_KEYS.has(selected.key)
      ? REMOVAL_DESCRIPTIONS.get(selected.key)
      : undefined;
    detail = {
      title: item.name,
      description:
        repairKey === null
          ? (override ?? item.description)
          : fillTemplate(REPAIR_DETAIL_TEMPLATE, item.description),
      priceText: selected.priceText,
    };
  }

  return {
    rows,
    detail,
    fuelVisible,
    selectedKey,
    facingFor: null,
    emptyText: rows.length === 0 ? OUTFITTING_EMPTY_TEXT : "",
  };
}

/**
 * The facing selection of Oolite's `setGuiToEquipShipScreen:selectingFacingFor:`
 * (`PlayerEntity.m:8204-8540`): the four facings, each showing the laser fitted
 * there, and the "select where to install" prompt for the chosen weapon.
 */
function buildFacingModel(
  byKey: ReadonlyMap<string, Equipment>,
  profile: PlayerProfile,
  ctx: LaserFitContext,
  laserKey: (typeof LASER_FIT_KEYS)[number],
  selectedKey: string,
): OutfittingModel {
  const item = byKey.get(laserKey);
  if (item === undefined) {
    throw new StationModelError(
      `Wegolite: the equipment catalogue has no entry with key "${laserKey}".`,
    );
  }
  const cost = laserFitPrice(item);
  const rows: OutfittingRow[] = FACINGS.map((facing) => {
    const check = checkLaserFit(profile, item, facing, ctx);
    const fitted = profile.laserMounts[facing];
    const fittedName =
      fitted === NO_LASER ? "None" : equipmentName(byKey, fitted);
    return {
      key: laserFitKey(laserKey, facing),
      label: `${FACING_LABELS[facing]} (${fittedName})`,
      name: `${item.name} (${FACING_LABELS[facing]})`,
      cost,
      priceText: formatDecicredits(cost),
      enabled: check.ok,
      dimmed: !check.ok,
      reason: check.ok ? "" : fitReason(check.reason, item),
      owned: false,
      multiCount: null,
      confirmable: check.ok,
      verb: "Buy",
    };
  });
  const selected = rows.find((row) => row.key === selectedKey) ?? rows[0];
  return {
    rows,
    detail: {
      title: item.name,
      description: `${item.name}\nPlease select where to install this weapon.`,
      priceText: selected?.priceText ?? formatDecicredits(cost),
    },
    fuelVisible: false,
    selectedKey,
    facingFor: laserKey,
    emptyText: "",
  };
}

/**
 * The F4 Interfaces screen (a live screen with Oolite's empty state).
 *
 * Source: Oolite `PlayerEntity.m` `setGuiToInterfacesScreen`, which titles the
 * screen with `DESC(@"interfaces-title")` and, when no interface entry exists,
 * shows `DESC(@"interfaces-no-interfaces-available-for-use")`. Both keys live in
 * `descriptions.plist` (vendored copy at
 * `third_party/oolite/Config/descriptions.plist`). The content build does not
 * compile these keys and the labels schema is strict, so the text is a literal
 * here and `tests/ui/station-interfaces.test.ts` pins both strings to the
 * vendored plist.
 */
export const INTERFACES_TITLE = "Ship and System Interfaces";
export const INTERFACES_EMPTY_TEXT =
  "No interfaces are installed on your ship or enabled at this station";

export interface InterfacesModel {
  readonly title: string;
  readonly emptyText: string;
}

/** The Interfaces screen model: Oolite's title and empty-state line. */
export function buildInterfacesModel(): InterfacesModel {
  return { title: INTERFACES_TITLE, emptyText: INTERFACES_EMPTY_TEXT };
}

export interface HomeCargoSummaryItem {
  readonly name: string;
  readonly quantityText: string;
  readonly diffText: string;
  readonly diffKind: "pos" | "neg" | "neutral";
}

export interface HomeMarketHighlight {
  readonly key: string;
  readonly name: string;
  readonly priceText: string;
  readonly stockText: string;
  readonly badgeText: string;
  readonly badgeKind: "surplus" | "demand";
}

export interface HomeModel {
  readonly systemName: string;
  readonly stationSubtitle: string;
  readonly economy: string;
  readonly government: string;
  readonly techLevel: string;
  readonly population: string;
  readonly productivity: string;
  readonly radius: string;
  readonly description: string;
  readonly fuelText: string;
  readonly fuelPercent: number;
  readonly fuelFull: boolean;
  readonly refuelButtonText: string;
  readonly refuelCostText: string;
  readonly canRefuel: boolean;
  readonly jumpTargetName: string;
  readonly jumpDistanceText: string;
  readonly jumpRequiredPercent: number;
  readonly jumpStatusText: string;
  readonly jumpStatusKind: "ready" | "warn" | "none";
  readonly cargoSummaryText: string;
  readonly cargoPercent: number;
  readonly cargoItems: readonly HomeCargoSummaryItem[];
  readonly marketHighlights: readonly HomeMarketHighlight[];
}

export interface BuildHomeModelInput {
  readonly profile: PlayerProfile;
  readonly system: System;
  readonly targetSystem: System | undefined;
  readonly labels: Labels;
  readonly equipment: readonly Equipment[];
  readonly commodities: readonly Commodity[];
  readonly market: Market;
}

/**
 * Build the Variant 1B docked home screen model (Arrival Report & Ship Berth).
 *
 * Combines live ship berth status (fuel gauge, top-up cost, hyperspace beacon
 * readiness, cargo hold summary) with the current system's GalCop registry
 * report and top local market surplus/demand highlights.
 */
export function buildHomeModel(input: BuildHomeModelInput): HomeModel {
  const {
    profile,
    system,
    targetSystem,
    labels,
    equipment,
    commodities,
    market,
  } = input;

  const sysData = buildSystemDataModel(system, system, labels);

  const fuelTenths = Math.max(0, Math.min(FUEL_CAPACITY, profile.fuel));
  const fuelPercent = Math.round((fuelTenths / FUEL_CAPACITY) * 100);
  const fuelFull = fuelTenths >= FUEL_CAPACITY;
  const neededTenths = Math.max(0, FUEL_CAPACITY - fuelTenths);
  const fuelItem = equipment.find((entry) => entry.key === "EQ_FUEL");
  const missileItem = equipment.find((entry) => entry.key === "EQ_MISSILE");
  const unitByKey = new Map<string, CommodityUnit>(
    commodities.map((entry) => [entry.key, entry.unit]),
  );

  let refuelCost = neededTenths * 2;
  let canRefuel = false;
  if (!fuelFull && fuelItem !== undefined && missileItem !== undefined) {
    const ctx: FitContext = {
      techLevelRaw: system.techLevelRaw,
      fuelCapacity: FUEL_CAPACITY,
      missileCapacity: MAX_MISSILES,
      availablePods: availablePods(profile, unitByKey),
      missilePrice: missileItem.price,
    };
    refuelCost = fitPrice(profile, fuelItem, ctx);
    canRefuel = checkFit(profile, fuelItem, ctx).ok;
  }

  const refuelButtonText = fuelFull
    ? "✓ Quirium Fuel Tank Full (7.0 LY)"
    : `⚡ Refuel to 7.0 LY (+${(neededTenths / 10).toFixed(1)} LY)`;
  const refuelCostText = fuelFull ? "FULL" : formatDecicredits(refuelCost);

  let jumpTargetName = "None";
  let jumpDistanceText = "0.0 LY";
  let jumpRequiredPercent = 0;
  let jumpStatusText = "NO BEACON";
  let jumpStatusKind: "ready" | "warn" | "none" = "none";

  if (targetSystem !== undefined && targetSystem.id !== system.id) {
    const jump = jumpBetween(
      { x: system.chartX, y: system.chartY },
      { x: targetSystem.chartX, y: targetSystem.chartY },
    );
    jumpTargetName = targetSystem.name;
    jumpDistanceText = `${(jump.dist === 0 ? 0.1 : jump.distanceLy).toFixed(1)} LY`;
    jumpRequiredPercent = Math.min(
      100,
      Math.round((jump.fuelCost / FUEL_CAPACITY) * 100),
    );
    if (jump.fuelCost > FUEL_CAPACITY) {
      jumpStatusText = "OUT OF RANGE";
      jumpStatusKind = "warn";
    } else if (profile.fuel >= jump.fuelCost) {
      jumpStatusText = "JUMP READY";
      jumpStatusKind = "ready";
    } else {
      jumpStatusText = "LOW FUEL";
      jumpStatusKind = "warn";
    }
  }

  const capacity = capacityPodsFor(profile.equipment, profile.passengerBerths);
  const used = holdPodsUsed(profile.cargo, unitByKey);
  const cargoPercent =
    capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
  const cargoSummaryText = `${String(used)} / ${String(capacity)} TC`;

  const quoteByKey = new Map(market.goods.map((good) => [good.key, good]));
  const cargoItems: HomeCargoSummaryItem[] = [];
  for (const commodity of [...commodities].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )) {
    const held = profile.cargo[commodity.key] ?? 0;
    if (held <= 0) continue;
    const quote = quoteByKey.get(commodity.key);
    let diffText = "—";
    let diffKind: "pos" | "neg" | "neutral" = "neutral";
    if (quote !== undefined && commodity.priceAverage > 0) {
      const diffDeci = quote.price - commodity.priceAverage;
      if (diffDeci > 0) {
        diffText = `+${(diffDeci / 10).toFixed(1)} ₢ vs avg`;
        diffKind = "pos";
      } else if (diffDeci < 0) {
        diffText = `${(diffDeci / 10).toFixed(1)} ₢ vs avg`;
        diffKind = "neg";
      } else {
        diffText = "±0.0 ₢ vs avg";
        diffKind = "neutral";
      }
    }
    cargoItems.push({
      name: commodity.name,
      quantityText: `${String(held)} ${commodity.unit}`,
      diffText,
      diffKind,
    });
  }

  const scoredHighlights: Array<{
    readonly score: number;
    readonly item: HomeMarketHighlight;
  }> = [];

  for (const commodity of commodities) {
    if (!commodity.tradeable || commodity.unit !== "t") continue;
    const quote = quoteByKey.get(commodity.key);
    if (quote === undefined || commodity.priceAverage <= 0) continue;
    const ratio =
      (quote.price - commodity.priceAverage) / commodity.priceAverage;
    if (ratio <= -0.08 && quote.stock > 0) {
      scoredHighlights.push({
        score: Math.abs(ratio) + (quote.stock >= 15 ? 0.15 : 0),
        item: {
          key: commodity.key,
          name: commodity.name,
          priceText: formatDecicredits(quote.price),
          stockText: `${String(quote.stock)} t`,
          badgeText: "EXPORT SURPLUS",
          badgeKind: "surplus",
        },
      });
    } else if (ratio >= 0.08) {
      scoredHighlights.push({
        score: Math.abs(ratio),
        item: {
          key: commodity.key,
          name: commodity.name,
          priceText: formatDecicredits(quote.price),
          stockText: `${String(quote.stock)} t`,
          badgeText: "HIGH DEMAND",
          badgeKind: "demand",
        },
      });
    }
  }

  scoredHighlights.sort((a, b) => b.score - a.score);
  const marketHighlights = scoredHighlights
    .slice(0, 4)
    .map((entry) => entry.item);

  return {
    systemName: system.name,
    stationSubtitle: "Coriolis Station · Docked",
    economy: sysData.fields[0]?.value ?? "",
    government: sysData.fields[1]?.value ?? "",
    techLevel: sysData.fields[2]?.value ?? "",
    population: sysData.fields[3]?.value ?? "",
    productivity: sysData.fields[5]?.value ?? "",
    radius: sysData.fields[6]?.value ?? "",
    description: sysData.description,
    fuelText: `${(fuelTenths / 10).toFixed(1)} LY`,
    fuelPercent,
    fuelFull,
    refuelButtonText,
    refuelCostText,
    canRefuel,
    jumpTargetName,
    jumpDistanceText,
    jumpRequiredPercent,
    jumpStatusText,
    jumpStatusKind,
    cargoSummaryText,
    cargoPercent,
    cargoItems,
    marketHighlights,
  };
}
