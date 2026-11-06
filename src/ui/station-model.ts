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
import type { Market } from "../sim/economy/market.js";
import type { TradePlan } from "../sim/economy/trade.js";
import {
  FUEL_CAPACITY,
  MAX_MISSILES,
  REMOVAL_DESCRIPTIONS,
  VISIBLE_EQUIPMENT_KEYS,
  checkFit,
  fitPrice,
} from "../sim/player/outfitting.js";
import type { FitContext, FitRefusal } from "../sim/player/outfitting.js";
import { formatDecicredits } from "../sim/player/profile.js";
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

/** Whole-credit formatting for the D-15 removal row labels (`20 Cr`). */
export function formatWholeCredits(decicredits: number): string {
  return `${String(Math.trunc(decicredits / 10))} Cr`;
}

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
  readonly confirmText: string | null;
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
      heldText: held === 0 ? "—" : String(held),
      exText: (commodity?.legalityExport ?? 0) > 0 ? "Ex" : "—",
      selectable: tradeable,
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

  return {
    columns: MARKET_COLUMNS,
    rows,
    selectedKey: selection,
    cashText: `Cash: ${formatDecicredits(profile.credits)}.`,
    loadText: `Load ${String(usedPods)} / ${String(capacityPods)} t`,
    confirmText: confirmationText(feedback.pending, byKey),
    noticeText: clampNotice === "" ? feedback.notice : clampNotice,
  };
}

/** One labeled field on the F5 status page or the F7 system-data page. */
export interface LabelledField {
  readonly label: string;
  readonly value: string;
}

/** One row of the F5 manifest; the unit is the commodity's own (t/kg/g). */
export interface ManifestRow {
  readonly key: string;
  readonly name: string;
  readonly unit: CommodityUnit;
  readonly heldText: string;
}

/** The F5 two-page model. Both pages are materialized; `page` names the active one. */
export interface StatusModel {
  readonly page: 1 | 2;
  readonly pageText: string;
  readonly fields: readonly LabelledField[];
  readonly equipment: readonly string[];
  readonly manifest: readonly ManifestRow[];
  readonly loadText: string;
}

const COMMANDER_NAME = "Jameson";
const SHIP_NAME = "Cobra Mk III";
const UNKNOWN_HYPERSPACE_SYSTEM = "(Unknown)";
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
 * profile has no equipment key, no missiles and no berths, so a new game still
 * lists its three missiles. Page 2 filters to the 16 `tradeable` commodities in
 * `sortOrder` and never includes Alien Items.
 */
export function buildStatusModel(
  profile: PlayerProfile,
  system: System,
  labels: Labels,
  equipmentCatalogue: readonly Equipment[],
  commodities: readonly Commodity[],
  page: number,
): StatusModel {
  const equipmentByKey = new Map(
    equipmentCatalogue.map((record) => [record.key, record]),
  );

  const fields: LabelledField[] = [
    { label: "Commander", value: COMMANDER_NAME },
    { label: "Ship", value: SHIP_NAME },
    { label: "Present System", value: system.name },
    { label: "Hyperspace System", value: UNKNOWN_HYPERSPACE_SYSTEM },
    { label: "Condition", value: DOCKED_CONDITION },
    { label: "Fuel", value: `${(profile.fuel / 10).toFixed(1)} Light Years` },
    { label: "Cash", value: formatDecicredits(profile.credits) },
    { label: "Legal Status", value: labels.legalStatus[0] ?? "" },
    { label: "Rating", value: labels.rating[0] ?? "" },
  ];

  const equipment: string[] = profile.equipment.map((key) =>
    equipmentName(equipmentByKey, key),
  );
  if (profile.missiles > 0) equipment.push(`Missile ×${profile.missiles}`);
  if (profile.passengerBerths > 0) {
    equipment.push(`Passenger Berth ×${profile.passengerBerths}`);
  }

  const units = new Map(
    commodities.map((commodity) => [commodity.key, commodity.unit]),
  );
  const manifest: ManifestRow[] = [...commodities]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter((commodity) => commodity.tradeable)
    .map((commodity) => {
      const held = profile.cargo[commodity.key] ?? 0;
      return {
        key: commodity.key,
        name: commodity.name,
        unit: commodity.unit,
        heldText: held === 0 ? "—" : String(held),
      };
    });

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
    manifest,
    loadText: `Load ${String(usedPods)} of ${String(capacityPods)} t`,
  };
}

/** The F7 system-data model: a separate title, seven sysdata rows and the description. */
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
 * Build the F7 system-data model (ECON-07, D-05).
 *
 * The title and the seven field labels come from `labels.json`; the four value
 * templates are expanded once, and the description is the compiled
 * `System.description` verbatim. Nothing here generates prose.
 */
export function buildSystemDataModel(
  system: System,
  labels: Labels,
): SystemDataModel {
  const values = new Map<string, string>([
    ["[techLevel]", String(system.techLevelRaw + 1)],
    ["[productivity]", String(system.productivity)],
    ["[radius]", String(system.radiusKm)],
    [
      "[population|multiply:0.1|precision:1]",
      (system.population * 0.1).toFixed(1),
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
      value: labels.economy[system.economy] ?? "",
    },
    {
      label: template(labels, "sysdata-govt"),
      value: labels.government[system.government] ?? "",
    },
    field("sysdata-tl", "sysdata-tl-value", ""),
    field("sysdata-pop", "sysdata-pop-value", ""),
    { label: "Inhabitants", value: `(${system.inhabitants})` },
    field("sysdata-prod", "sysdata-prod-value", ""),
    field("sysdata-radius", "sysdata-radius-value", ""),
    { label: template(labels, "sysdata-distance"), value: "0.0 ly" },
  ];

  return {
    title: expandTitle(labels, system),
    fields,
    description: system.description,
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
    case "invalidPrice":
      return "Price unavailable";
    case "invalidCondition":
      return "Not available";
    case "maxInstances":
      return "Maximum reached";
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
 * Rows follow `VISIBLE_EQUIPMENT_KEYS` exactly, omit Fuel at a full tank and
 * each removal row at a zero count. A disabled row stays selectable so its
 * detail and reason can be read, but `confirmable` is false. Removal rows use
 * D-15's whole-credit label while the detail and the confirmation keep the
 * exact decimal price. Removal detail copy is the truthful per-entry
 * `REMOVAL_DESCRIPTIONS` override, never the generated description.
 */
export function buildOutfittingModel(
  catalogue: readonly Equipment[],
  profile: PlayerProfile,
  systemTechLevelRaw: number,
  selectedKey: string,
  unitByKey: ReadonlyMap<string, CommodityUnit>,
): OutfittingModel {
  const byKey = new Map(catalogue.map((record) => [record.key, record]));
  const missile = byKey.get("EQ_MISSILE");
  if (missile === undefined) {
    throw new StationModelError(
      'Wegolite: the equipment catalogue has no "EQ_MISSILE" entry.',
    );
  }

  const ctx: FitContext = {
    techLevelRaw: systemTechLevelRaw,
    fuelCapacity: FUEL_CAPACITY,
    missileCapacity: MAX_MISSILES,
    availablePods: availablePods(profile, unitByKey),
    missilePrice: missile.price,
  };
  const fuelVisible = profile.fuel < FUEL_CAPACITY;

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

    const check = checkFit(profile, item, ctx);
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
    });
  }

  const selected = rows.find((row) => row.key === selectedKey);
  let detail: OutfittingDetail | null = null;
  if (selected !== undefined) {
    const item = byKey.get(selected.key);
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
      description: override ?? item.description,
      priceText: selected.priceText,
    };
  }

  return { rows, detail, fuelVisible, selectedKey };
}
