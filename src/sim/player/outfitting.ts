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
 * Lasers (Phase 13, CBT-05) are the one amendment, and they have their own
 * door: `checkLaserFit` and `applyLaserFit` accept only the `LASER_FIT_KEYS` x
 * `FACINGS` allow-list. `checkFit` and `applyFit` still refuse every laser, and
 * every other record stays `notOffered` on both paths.
 *
 * F3 lists an item only when it could be fitted here and now, as Oolite's
 * `equipmentAllowed` does (`isListedForPurchase`): an item above the system's
 * tech level, already fitted or with no room to add it is not shown. Only an
 * item the commander cannot afford stays listed, refused with
 * `insufficientCredits`. The listing rule is presentation; the checks below
 * stay the boundary.
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
import {
  LASER_KEYS,
  NO_LASER,
  isFacing,
  isMountKey,
} from "../combat/mounts.js";
import type { Facing, MountKey } from "../combat/mounts.js";
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

/**
 * The Cobra's missile pylons: Oolite's `PLAYER_STARTING_MAX_MISSILES`
 * (`PlayerEntity.h:285`) and the compiled Cobra record's `max_missiles`. A new
 * commander starts with three (`NEW_GAME_MISSILES`) and can buy the fourth.
 */
export const MAX_MISSILES = 4;

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
  | "noLaser"
  | "insufficientCredits"
  | "fullFuel"
  | "invalidPrice"
  | "invalidCondition";

export type FitCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: FitRefusal };

/**
 * Which refusals still leave an item on the F3 list. Only a shortfall of
 * credits does; every other refusal hides the row. The `Record` type forces a
 * future refusal to be classified here before the module compiles.
 */
const LISTED_REFUSALS: Readonly<Record<FitRefusal, boolean>> = Object.freeze({
  notOffered: false,
  techLevel: false,
  owned: false,
  maxInstances: false,
  cargoSpace: false,
  pylonsFull: false,
  nothingToRemove: false,
  noLaser: false,
  insufficientCredits: true,
  fullFuel: false,
  invalidPrice: false,
  invalidCondition: false,
});

/**
 * Whether F3 lists an item whose check came out as `check`.
 *
 * This is Oolite's `equipmentAllowed` (`PlayerEntity.m:8293-8302`): an item
 * the station offers is listed only when the system's tech level allows it,
 * `canAddEquipment:inContext:@"purchase"` accepts it (not already fitted, a free
 * pylon, cargo space, a non-full tank, something to remove), and, for a primary
 * weapon, the ship has a facing. Oolite's list never consults credits: they
 * are checked only when the purchase is tried (`tryBuyingItem`,
 * `PlayerEntity.m:9134` and `:9188`), so an unaffordable item stays listed.
 *
 * The predicate relies on affordability being the **last** gate of
 * `checkFit`, `checkLaserFit` and `canPurchase`: `insufficientCredits` is only
 * ever reported for an item that passes every other rule. Wegolite's
 * fail-closed integrity refusals (`invalidPrice`, `invalidCondition`) hide the
 * row too, because a row that can never be bought must never be advertised.
 *
 * It is presentation only. `checkFit`/`applyFit` and
 * `checkLaserFit`/`applyLaserFit` stay the money-path boundary.
 */
export function isListedForPurchase(check: FitCheck): boolean {
  return check.ok || LISTED_REFUSALS[check.reason];
}

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

/**
 * The laser keys F3 can fit, in Oolite's `equipment.plist` order: Remove Laser
 * (`EQ_WEAPON_NONE`, line 109), then pulse, beam, mining and military
 * (lines 126-185). The Thargoid laser is `available_to_player false` and is
 * not offered. This list and `FACINGS` are the laser money path's allow-lists.
 */
export const LASER_FIT_KEYS = Object.freeze([NO_LASER, ...LASER_KEYS] as const);

export type LaserFitKey = (typeof LASER_FIT_KEYS)[number];

/** Whether `value` is a member of the laser allow-list (by membership, never `in`). */
export function isLaserFitKey(value: unknown): value is LaserFitKey {
  return LASER_FIT_KEYS.some((key) => key === value);
}

/** The separator of a composite F3 row key (`EQ_WEAPON_BEAM_LASER@aft`). */
const LASER_FIT_SEPARATOR = "@";

/** One F3 row key for a laser on a facing. */
export function laserFitKey(key: LaserFitKey, facing: Facing): string {
  return `${key}${LASER_FIT_SEPARATOR}${facing}`;
}

export interface ParsedLaserFitKey {
  readonly key: LaserFitKey;
  readonly facing: Facing;
}

/**
 * Parse a composite F3 row key through both allow-lists, or `null`.
 *
 * `T-13-18`: a row key is a plain string, so a forged one (`EQ_ECM@fore`,
 * `EQ_WEAPON_PULSE_LASER@up`, a bare laser key, a Thargoid laser) must not reach
 * the money path. Anything but exactly `<LASER_FIT_KEYS member>@<FACINGS
 * member>` is refused.
 */
export function parseLaserFitKey(value: string): ParsedLaserFitKey | null {
  const parts = value.split(LASER_FIT_SEPARATOR);
  if (parts.length !== 2) return null;
  const [key, facing] = parts;
  if (!isLaserFitKey(key) || !isFacing(facing)) return null;
  return { key, facing };
}

/**
 * What the laser path needs beyond `FitContext`: the catalogue price of every
 * allow-listed laser, so a replaced laser can be refunded at its own price
 * (`doTradeIn`, `PlayerEntity.m:9431-9438`).
 */
export interface LaserFitContext extends FitContext {
  readonly laserPrices: ReadonlyMap<string, number>;
}

function isLaserPrice(price: number): boolean {
  return (
    Number.isSafeInteger(price) && price >= 0 && price <= MAX_EQUIPMENT_PRICE
  );
}

/** The catalogue price of each allow-listed laser, validated; bad rows are left out. */
export function laserPriceMap(
  catalogue: readonly Equipment[],
): ReadonlyMap<string, number> {
  const prices = new Map<string, number>();
  for (const record of catalogue) {
    if (isLaserFitKey(record.key) && isLaserPrice(record.price)) {
      prices.set(record.key, record.price);
    }
  }
  return prices;
}

/**
 * The price of fitting `item` in integer decicredits. Remove Laser costs 0
 * whatever the record says; an invalid price returns `0` and `checkLaserFit`
 * refuses before a caller can act on that zero.
 */
export function laserFitPrice(item: Equipment): number {
  if (item.key === NO_LASER) return 0;
  return isValidPrice(item.price) ? item.price : 0;
}

/**
 * Whether `item` may be fitted on `facing` right now, and if not, the reason.
 *
 * Oolite's rules (`PlayerEntity.m:9139-9217`): the full price is compared with
 * the credits **before** any trade-in (`price > credits` returns NO), so the
 * refund for the laser being replaced never counts as available money. The
 * station price factor is 1 at the Coriolis. The tech gate is the raw level,
 * the same rule `checkFit` applies. Removing a laser from an empty facing has
 * nothing to remove.
 */
export function checkLaserFit(
  profile: PlayerProfile,
  item: Equipment,
  facing: Facing,
  ctx: LaserFitContext,
): FitCheck {
  // 1. The laser allow-lists are the money-path boundary (T-13-18).
  if (!isLaserFitKey(item.key) || !isFacing(facing)) {
    return { ok: false, reason: "notOffered" };
  }

  // 2. Key and catalogue price, before any arithmetic can use them.
  if (
    !isValidKey(item.key) ||
    (item.key !== NO_LASER && !isValidPrice(item.price))
  ) {
    return { ok: false, reason: "invalidPrice" };
  }

  // 3. Raw tech level gates; equality is allowed.
  if (
    !Number.isSafeInteger(item.techLevel) ||
    !Number.isSafeInteger(ctx.techLevelRaw) ||
    ctx.techLevelRaw < item.techLevel
  ) {
    return { ok: false, reason: "techLevel" };
  }

  // 4. The occupant of the facing must be a mount, and a laser being replaced
  //    needs a trusted catalogue price for its refund (T-13-19).
  const current: unknown = profile.laserMounts[facing];
  if (!isMountKey(current)) return { ok: false, reason: "invalidCondition" };
  if (item.key === NO_LASER && current === NO_LASER) {
    return { ok: false, reason: "noLaser" };
  }
  if (current !== NO_LASER) {
    const refund = ctx.laserPrices.get(current);
    if (refund === undefined || !isLaserPrice(refund)) {
      return { ok: false, reason: "invalidPrice" };
    }
  }

  // 5. Affordability against the credits before any refund (`price > credits`).
  const cost = laserFitPrice(item);
  if (!isSafeCredits(profile.credits) || profile.credits < cost) {
    return { ok: false, reason: "insufficientCredits" };
  }

  return { ok: true };
}

/**
 * Fit (or remove) a laser on one facing.
 *
 * `checkLaserFit` is re-run first, so an out-of-set key, a stale context or a
 * forged price is refused here too. A refusal returns the **same** profile
 * object. A success pays the price and refunds the laser it replaces at its
 * full catalogue price (`doTradeIn`, `PlayerEntity.m:9431-9438`); Remove Laser
 * costs 0 and refunds the removed laser. It returns a new profile even when the
 * net is zero (a pulse over a pulse), so a caller can compare identity.
 */
export function applyLaserFit(
  profile: PlayerProfile,
  item: Equipment,
  facing: Facing,
  ctx: LaserFitContext,
): PlayerProfile {
  const check = checkLaserFit(profile, item, facing, ctx);
  if (!check.ok) return profile;
  if (!isMountKey(item.key)) return profile;

  const current = profile.laserMounts[facing];
  const tradeIn = current === NO_LASER ? 0 : ctx.laserPrices.get(current);
  if (tradeIn === undefined) return profile;

  const credits = profile.credits - laserFitPrice(item) + tradeIn;
  if (!isSafeCredits(credits)) return profile;

  const laserMounts: Record<Facing, MountKey> = { ...profile.laserMounts };
  laserMounts[facing] = item.key;
  return { ...profile, credits, laserMounts };
}
