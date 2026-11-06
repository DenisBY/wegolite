// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Outfitting availability and transactions (ECON-05, ECON-08, D-10..D-16).
 *
 * The F3 screen may only ever offer the peaceful D-11 set. That set is a
 * **money-path invariant**, not a display filter: `checkFit` and `applyFit`
 * both refuse any key outside `VISIBLE_EQUIPMENT_KEYS` with `notOffered`, so a
 * forged caller cannot install an ECM, a laser or any other catalogue record.
 *
 * Everything the module reads comes from the validated equipment record and
 * the session's **raw** `System.techLevelRaw`. The displayed tech level (raw +
 * 1) belongs to the view model and must never gate an item: Oolite compares the
 * raw value (`PlayerEntity.m:8226-8295`).
 *
 * There is no condition-script evaluator. Only the five v1 rules are read from
 * the catalogue conditions, and their values fail closed: a flag is `true` or
 * `"true"` and nothing else, and `requires_cargo_space` is a finite integer in
 * 0..35. A malformed value is `invalidCondition`, never "no requirement".
 *
 * A purchase or removal applies immediately, at the catalogue price, with no
 * install delay and no clock advance (D-12). Credits, fuel, missiles and berths
 * stay inside their save-schema bounds. Every function is pure and never
 * mutates or throws.
 */

import type { Equipment } from "../../content/types.js";
import { PASSENGER_BERTH_PODS } from "../economy/cargo.js";
import {
  MAX_EQUIPMENT_KEY_LENGTH,
  MAX_EQUIPMENT_PRICE,
  canPurchase,
  isValidPrice,
  purchase,
} from "./profile.js";
import type { PlayerProfile } from "./profile.js";

/** Oolite's `PLAYER_MAX_FUEL`, in tenths of a light year. */
export const FUEL_CAPACITY = 70;

/** D-14's deliberate cap (Oolite's starting maximum is four). */
export const MAX_MISSILES = 3;

/** Seven berths consume a fully extended 35 t hold. */
export const MAX_PASSENGER_BERTHS = 7;

/**
 * The exact F3 set, in D-11's display order. Anything else is `notOffered`.
 */
export const VISIBLE_EQUIPMENT_KEYS = [
  "EQ_FUEL",
  "EQ_CARGO_BAY",
  "EQ_DOCK_COMP",
  "EQ_GAL_DRIVE",
  "EQ_ADVANCED_COMPASS",
  "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
  "EQ_MISSILE",
  "EQ_PASSENGER_BERTH",
  "EQ_PASSENGER_BERTH_REMOVAL",
  "EQ_MISSILE_REMOVAL",
] as const;

export type VisibleEquipmentKey = (typeof VISIBLE_EQUIPMENT_KEYS)[number];

/**
 * The five keys that live in `profile.equipment` and are bought exactly once.
 * Missiles and berths are integer counts, never duplicate keys.
 */
const SINGLE_INSTANCE_KEYS: ReadonlySet<string> = new Set([
  "EQ_CARGO_BAY",
  "EQ_DOCK_COMP",
  "EQ_GAL_DRIVE",
  "EQ_ADVANCED_COMPASS",
  "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
]);

/** Player-facing copy that overrides the catalogue description in the F3 detail. */
export const REMOVAL_DESCRIPTIONS: ReadonlyMap<string, string> = new Map([
  [
    "EQ_MISSILE_REMOVAL",
    "Removes all missiles from the pylons and re-sells them at full catalogue value.",
  ],
  [
    "EQ_PASSENGER_BERTH_REMOVAL",
    "Removes one passenger berth and frees 5 t of cargo space. No refund is paid.",
  ],
]);

/**
 * Everything `checkFit`/`applyFit` needs from the session.
 *
 * `availablePods` is trusted derived input: the session computes it from the
 * loaded commodity units and the profile (`availablePods` in `cargo.ts`). The
 * module documents it instead of re-deriving it, so capacity stays the one
 * cargo rule.
 */
export interface FitContext {
  /** The session's raw `System.techLevelRaw`; never the displayed +1. */
  readonly techLevelRaw: number;
  /** The ship's fuel tank in tenths of a light year (70 for the Cobra). */
  readonly fuelCapacity: number;
  /** The ship's pylon count (3 for the Cobra in v1). */
  readonly missileCapacity: number;
  /** Free pods in the hold, from `availablePods`. */
  readonly availablePods: number;
  /** The catalogue `EQ_MISSILE.price`, used for the removal trade-in. */
  readonly missilePrice: number;
}

/** Every refusal reason F3 can render copy for. */
export type FitRefusal =
  | "notOffered"
  | "techLevel"
  | "owned"
  | "maxInstances"
  | "cargoSpace"
  | "pylonsFull"
  | "nothingToRemove"
  | "insufficientCredits"
  | "fullFuel"
  | "invalidPrice"
  | "invalidCondition";

export type FitCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: FitRefusal };

/** The five condition values this v1 set understands. */
interface ParsedConditions {
  readonly requiresEmptyPylon: boolean;
  readonly requiresMountedPylon: boolean;
  readonly requiresFreePassengerBerth: boolean;
  readonly requiresNonFullFuel: boolean;
  readonly requiresCargoSpace: number;
}

type FlagResult =
  { readonly ok: true; readonly value: boolean } | { readonly ok: false };

function readFlag(
  conditions: Equipment["conditions"],
  key: string,
): FlagResult {
  if (!Object.prototype.hasOwnProperty.call(conditions, key)) {
    return { ok: true, value: false };
  }
  const value = conditions[key];
  if (value === true || value === "true") return { ok: true, value: true };
  return { ok: false };
}

/**
 * Read the five v1 conditions fail-closed.
 *
 * Returns `undefined` for any malformed value; the caller refuses with
 * `invalidCondition`. Other catalogue condition keys (`condition_script`,
 * `available_to_all`, `weapon_info`, …) are carried metadata and are
 * deliberately ignored.
 */
function parseConditions(
  conditions: Equipment["conditions"],
): ParsedConditions | undefined {
  const emptyPylon = readFlag(conditions, "requires_empty_pylon");
  const mountedPylon = readFlag(conditions, "requires_mounted_pylon");
  const freeBerth = readFlag(conditions, "requires_free_passenger_berth");
  const nonFullFuel = readFlag(conditions, "requires_non_full_fuel");
  if (!emptyPylon.ok || !mountedPylon.ok || !freeBerth.ok || !nonFullFuel.ok) {
    return undefined;
  }

  let requiresCargoSpace = 0;
  if (
    Object.prototype.hasOwnProperty.call(conditions, "requires_cargo_space")
  ) {
    const value = conditions.requires_cargo_space;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 35
    ) {
      return undefined;
    }
    requiresCargoSpace = value;
  }

  return {
    requiresEmptyPylon: emptyPylon.value,
    requiresMountedPylon: mountedPylon.value,
    requiresFreePassengerBerth: freeBerth.value,
    requiresNonFullFuel: nonFullFuel.value,
    requiresCargoSpace,
  };
}

function isValidKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_EQUIPMENT_KEY_LENGTH;
}

function isSafeCredits(credits: number): boolean {
  return Number.isSafeInteger(credits) && credits >= 0;
}

function isBoundedMissilePrice(price: number): boolean {
  return (
    Number.isSafeInteger(price) && price >= 0 && price <= MAX_EQUIPMENT_PRICE
  );
}

/** The pylons available to a purchase, bounded by both the save schema and D-14. */
function pylonCapacity(ctx: FitContext): number {
  const capacity = Number.isSafeInteger(ctx.missileCapacity)
    ? ctx.missileCapacity
    : MAX_MISSILES;
  return Math.min(Math.max(capacity, 0), MAX_MISSILES);
}

/**
 * The price of one F3 row in integer decicredits.
 *
 * Fuel is the classic bug: the row shows the **fill cost**
 * `(capacity - fuel) * 2`, never the 2 dc unit price (D-12). A non-fuel row is
 * its catalogue price. An invalid cost returns `0`; `checkFit` refuses before
 * a caller can act on that zero.
 */
export function fitPrice(
  profile: PlayerProfile,
  item: Equipment,
  ctx: FitContext,
): number {
  if (item.key === "EQ_FUEL") {
    // Fractional fuel must never reach the view model as a fractional-looking
    // fill cost, let alone fractional credits. Fail closed like `checkFit`.
    if (
      !Number.isSafeInteger(profile.fuel) ||
      !Number.isSafeInteger(ctx.fuelCapacity)
    ) {
      return 0;
    }
    const cost = (ctx.fuelCapacity - profile.fuel) * item.price;
    return isValidPrice(cost) ? cost : 0;
  }
  return isValidPrice(item.price) ? item.price : 0;
}

/**
 * Whether `item` may be bought right now, and if not, the one fixed reason.
 *
 * The order is deliberate and differs from `canPurchase`: price is validated
 * before the tech gate, so a corrupt catalogue row can never reach arithmetic
 * (T-05-09). The five single-instance keys delegate tech, ownership and
 * affordability to `canPurchase`, keeping Phase 4's tested predicate on the
 * production path. Price and fuel are already valid by then, so its own
 * `invalidPrice` branch is unreachable here on purpose — do not drop the early
 * price check if this call order is refactored.
 */
export function checkFit(
  profile: PlayerProfile,
  item: Equipment,
  ctx: FitContext,
): FitCheck {
  // 1. The visible set is the money-path boundary.
  if (!(VISIBLE_EQUIPMENT_KEYS as readonly string[]).includes(item.key)) {
    return { ok: false, reason: "notOffered" };
  }

  // 2. Key and catalogue price, before any arithmetic can use them.
  if (!isValidKey(item.key) || !isValidPrice(item.price)) {
    return { ok: false, reason: "invalidPrice" };
  }

  // 3. Fuel integrity. The full-tank refusal comes before the zero fill cost
  //    so a full tank is `fullFuel`, never `invalidPrice`.
  if (item.key === "EQ_FUEL") {
    if (
      !Number.isSafeInteger(profile.fuel) ||
      !Number.isSafeInteger(ctx.fuelCapacity) ||
      ctx.fuelCapacity < 0 ||
      ctx.fuelCapacity > FUEL_CAPACITY ||
      profile.fuel < 0 ||
      profile.fuel > ctx.fuelCapacity
    ) {
      return { ok: false, reason: "invalidPrice" };
    }
    if (profile.fuel >= ctx.fuelCapacity) {
      return { ok: false, reason: "fullFuel" };
    }
    if (!isValidPrice(fitPrice(profile, item, ctx))) {
      return { ok: false, reason: "invalidPrice" };
    }
  }

  // 4-5-8. Single-instance keys: one tested predicate, one production path.
  if (SINGLE_INSTANCE_KEYS.has(item.key)) {
    const check = canPurchase(profile, item, ctx.techLevelRaw);
    return check.ok ? { ok: true } : { ok: false, reason: check.reason };
  }

  // 4. Raw tech level gates; equality is allowed.
  if (
    !Number.isSafeInteger(item.techLevel) ||
    !Number.isSafeInteger(ctx.techLevelRaw) ||
    ctx.techLevelRaw < item.techLevel
  ) {
    return { ok: false, reason: "techLevel" };
  }

  // 7. The five explicit condition rules, values fail-closed.
  const conditions = parseConditions(item.conditions);
  if (conditions === undefined) {
    return { ok: false, reason: "invalidCondition" };
  }

  // 6. Multiplicity. Missiles and berths are counts, never duplicate keys.
  if (item.key === "EQ_MISSILE" && profile.missiles >= pylonCapacity(ctx)) {
    return { ok: false, reason: "pylonsFull" };
  }
  if (
    item.key === "EQ_PASSENGER_BERTH" &&
    profile.passengerBerths >= MAX_PASSENGER_BERTHS
  ) {
    return { ok: false, reason: "maxInstances" };
  }

  // 7. Condition refusals.
  if (
    item.key === "EQ_MISSILE_REMOVAL" &&
    conditions.requiresMountedPylon &&
    profile.missiles === 0
  ) {
    return { ok: false, reason: "nothingToRemove" };
  }
  if (
    item.key === "EQ_PASSENGER_BERTH_REMOVAL" &&
    conditions.requiresFreePassengerBerth &&
    profile.passengerBerths === 0
  ) {
    return { ok: false, reason: "nothingToRemove" };
  }

  const requiredCargoSpace =
    item.key === "EQ_PASSENGER_BERTH"
      ? Math.max(conditions.requiresCargoSpace, PASSENGER_BERTH_PODS)
      : conditions.requiresCargoSpace;
  if (
    requiredCargoSpace > 0 &&
    (!Number.isSafeInteger(ctx.availablePods) ||
      ctx.availablePods < requiredCargoSpace)
  ) {
    return { ok: false, reason: "cargoSpace" };
  }

  // A forged/malformed trade-in price must surface as a reason, not a silent
  // apply-time no-op (T-05-31).
  if (
    item.key === "EQ_MISSILE_REMOVAL" &&
    !isBoundedMissilePrice(ctx.missilePrice)
  ) {
    return { ok: false, reason: "invalidPrice" };
  }

  // 8. Affordability. For a removal this is the fee only; the trade-in is
  //    never counted as available money (Oolite's `price > credits` gate).
  const cost = fitPrice(profile, item, ctx);
  if (!isSafeCredits(profile.credits) || profile.credits < cost) {
    return { ok: false, reason: "insufficientCredits" };
  }

  return { ok: true };
}

/**
 * Buy or remove `item`, applying its effect immediately.
 *
 * `checkFit` is re-run first, so an out-of-set key, a stale context or a
 * forged price is refused here too. A refusal returns the **same** profile
 * object; the caller can compare identity instead of re-reading every field.
 * The five single-instance keys delegate their append-and-charge to
 * `purchase`, keeping exactly one implementation on the production path.
 *
 * Fuel fills to capacity, missiles and berths increment their counts, and the
 * removal entries follow Oolite: `EQ_MISSILE_REMOVAL` charges 200 dc and then
 * refunds the full catalogue value of every mounted missile
 * (`PlayerEntity.m:9326-9330`, `:9410-9427`, `:9431-9438`); a passenger berth
 * removal charges 1000 dc with no refund. Nothing advances the clock (D-12).
 */
export function applyFit(
  profile: PlayerProfile,
  item: Equipment,
  ctx: FitContext,
): PlayerProfile {
  const check = checkFit(profile, item, ctx);
  if (!check.ok) return profile;
  if (SINGLE_INSTANCE_KEYS.has(item.key)) return purchase(profile, item);

  const cost = fitPrice(profile, item, ctx);
  if (!isValidPrice(cost)) return profile;

  if (item.key === "EQ_FUEL") {
    if (!Number.isSafeInteger(ctx.fuelCapacity)) return profile;
    const credits = profile.credits - cost;
    if (!isSafeCredits(credits)) return profile;
    return { ...profile, credits, fuel: ctx.fuelCapacity };
  }

  if (item.key === "EQ_MISSILE") {
    const missiles = profile.missiles + 1;
    if (!Number.isSafeInteger(missiles) || missiles > MAX_MISSILES) {
      return profile;
    }
    const credits = profile.credits - cost;
    if (!isSafeCredits(credits)) return profile;
    return { ...profile, credits, missiles };
  }

  if (item.key === "EQ_PASSENGER_BERTH") {
    const passengerBerths = profile.passengerBerths + 1;
    if (
      !Number.isSafeInteger(passengerBerths) ||
      passengerBerths > MAX_PASSENGER_BERTHS
    ) {
      return profile;
    }
    const credits = profile.credits - cost;
    if (!isSafeCredits(credits)) return profile;
    return { ...profile, credits, passengerBerths };
  }

  if (item.key === "EQ_PASSENGER_BERTH_REMOVAL") {
    const passengerBerths = profile.passengerBerths - 1;
    if (!Number.isSafeInteger(passengerBerths) || passengerBerths < 0) {
      return profile;
    }
    const credits = profile.credits - cost;
    if (!isSafeCredits(credits)) return profile;
    return { ...profile, credits, passengerBerths };
  }

  if (item.key === "EQ_MISSILE_REMOVAL") {
    // Compute the trade-in before zeroing the count: Oolite charges the fee,
    // collects the full catalogue value of every mounted missile, then adds it
    // back. The refund is never counted toward affordability.
    const tradeIn = profile.missiles * ctx.missilePrice;
    if (!Number.isSafeInteger(tradeIn)) return profile;
    const credits = profile.credits - cost + tradeIn;
    if (!isSafeCredits(credits)) return profile;
    return { ...profile, credits, missiles: 0 };
  }

  return profile;
}
