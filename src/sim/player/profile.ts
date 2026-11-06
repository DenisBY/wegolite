// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player profile (DOCK-05, D-10).
 *
 * Credits are integer decicredits (1 Cr = 10 decicredits), exactly as Oolite
 * stores and prices them. The profile is deliberately **not** part of
 * `FlightState`: economy state must not churn the replay hash, and a save
 * restores it beside the flight state (plan 04-05).
 *
 * The unit of trust is the equipment record the caller passes in. The app
 * loads and validates the generated catalogue, then hands one record here; a
 * command, a panel label or a test hook can never supply a price. `canPurchase`
 * also takes the session's loaded **raw** `System.techLevelRaw`, never a
 * derived or displayed tech level: Oolite's purchase rule compares the raw
 * value (`PlayerEntity.m:8226-8295`), so Lave (raw 4) refuses a TL 9 item.
 *
 * Every operation returns a new profile; none mutates its input or throws.
 */

import { emptyCargo } from "../economy/cargo.js";
import type { Cargo } from "../economy/cargo.js";

/** A price must be a positive safe integer no larger than this. */
export const MAX_EQUIPMENT_PRICE = 1e9;

/** The number of equipment keys a profile may carry (a resource bound). */
export const MAX_EQUIPMENT_KEYS = 64;

/** The longest equipment key accepted (matches the save schema in 04-05). */
export const MAX_EQUIPMENT_KEY_LENGTH = 64;

/** Oolite's new-game balance: 1,000 decicredits = 100.0 Cr. */
export const NEW_GAME_CREDITS = 1000;

/** A fresh ship's fuel tank, in tenths of a light year. */
export const NEW_GAME_FUEL = 70;

/** A fresh Cobra's missile pylons. */
export const NEW_GAME_MISSILES = 3;

/** The minimal catalogue shape the purchase rule reads. */
export interface EquipmentRecord {
  readonly key: string;
  readonly price: number;
  readonly techLevel: number;
}

/** The economy state that travels beside the flight state. */
export interface PlayerProfile {
  readonly credits: number;
  readonly equipment: readonly string[];
  /** Commodity key → units held; a null-prototype map in practice. */
  readonly cargo: Cargo;
  /** Fuel in tenths of a light year (0..70). */
  readonly fuel: number;
  /** Mounted missiles (0..3). */
  readonly missiles: number;
  /** Passenger berths (0..7); each consumes five tonnes of capacity. */
  readonly passengerBerths: number;
}

/** Why a purchase would be refused; the app maps each to fixed copy. */
export type PurchaseRefusal =
  "techLevel" | "owned" | "invalidPrice" | "insufficientCredits";

export type PurchaseCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PurchaseRefusal };

/** A fresh new-game profile; every call owns its own equipment array and cargo. */
export function newProfile(): PlayerProfile {
  return {
    credits: NEW_GAME_CREDITS,
    equipment: [],
    cargo: emptyCargo(),
    fuel: NEW_GAME_FUEL,
    missiles: NEW_GAME_MISSILES,
    passengerBerths: 0,
  };
}

/**
 * Format decicredits exactly: integer quotient and remainder, one decimal.
 *
 * `toFixed` is deliberately not used for money: it rounds through a binary
 * fraction and is not an exact formatter over the safe-integer domain. The
 * integer split keeps every balance the game can represent exact.
 */
export function formatDecicredits(decicredits: number): string {
  const sign = decicredits < 0 ? "-" : "";
  const absolute = Math.abs(decicredits);
  const whole = Math.trunc(absolute / 10);
  const tenth = absolute % 10;
  return `${sign}${String(whole)}.${String(tenth)} Cr`;
}

/** Format decicredits for the panel: one decimal place, never `toLocaleString`. */
export function formatCredits(decicredits: number): string {
  return formatDecicredits(decicredits);
}

/**
 * The one price predicate: a positive safe integer within
 * `MAX_EQUIPMENT_PRICE`. Exported so outfitting validates fuel fill costs with
 * the same bound instead of re-implementing it.
 */
export function isValidPrice(price: number): boolean {
  return (
    Number.isSafeInteger(price) && price > 0 && price <= MAX_EQUIPMENT_PRICE
  );
}

function isValidKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_EQUIPMENT_KEY_LENGTH;
}

function isValidTechLevel(techLevel: number): boolean {
  return Number.isSafeInteger(techLevel) && techLevel >= 0;
}

function isSafeCredits(credits: number): boolean {
  return Number.isSafeInteger(credits) && credits >= 0;
}

/**
 * Whether `profile` may buy `item` at a system whose **raw** tech level is
 * `techLevelRaw`.
 *
 * Check order matters: the tech-level gate is reported before affordability,
 * because that is the reason a player at Lave must see even when they are also
 * short of credits (T-04-43). The price is validated before any arithmetic, so
 * a `NaN` price cannot slip through a `credits < price` comparison
 * (T-04-45).
 */
export function canPurchase(
  profile: PlayerProfile,
  item: EquipmentRecord,
  techLevelRaw: number,
): PurchaseCheck {
  if (
    !isValidTechLevel(item.techLevel) ||
    !Number.isSafeInteger(techLevelRaw) ||
    techLevelRaw < item.techLevel
  ) {
    return { ok: false, reason: "techLevel" };
  }
  if (profile.equipment.includes(item.key)) {
    return { ok: false, reason: "owned" };
  }
  if (!isValidKey(item.key) || !isValidPrice(item.price)) {
    return { ok: false, reason: "invalidPrice" };
  }
  if (!isSafeCredits(profile.credits) || profile.credits < item.price) {
    return { ok: false, reason: "insufficientCredits" };
  }
  return { ok: true };
}

/**
 * Buy `item` at its catalogue price.
 *
 * The caller must have run `canPurchase` first: the tech-level gate is a
 * system fact and purchase has no system argument. A refusal returns the same
 * profile object unchanged, so a caller can compare identity instead of
 * re-reading every field. Credits stay safe, non-negative integers and the key
 * is appended once.
 */
export function purchase(
  profile: PlayerProfile,
  item: EquipmentRecord,
): PlayerProfile {
  if (!isValidKey(item.key) || !isValidPrice(item.price)) return profile;
  if (profile.equipment.includes(item.key)) return profile;
  if (profile.equipment.length >= MAX_EQUIPMENT_KEYS) return profile;
  if (!isSafeCredits(profile.credits) || profile.credits < item.price) {
    return profile;
  }

  const credits = profile.credits - item.price;
  if (!isSafeCredits(credits)) return profile;
  return { ...profile, credits, equipment: [...profile.equipment, item.key] };
}

/**
 * Replace the credit balance; rejects anything that is not a safe non-negative
 * integer. Used by the dev seam and by plan 04-05's restore path.
 */
export function setCredits(
  profile: PlayerProfile,
  credits: number,
): PlayerProfile {
  if (!isSafeCredits(credits)) return profile;
  return { ...profile, credits };
}

/**
 * Grant a non-negative amount, refusing a non-integer, non-finite or
 * overflowing credit balance. A refused grant returns the same object.
 */
export function grantCredits(
  profile: PlayerProfile,
  amount: number,
): PlayerProfile {
  if (!Number.isSafeInteger(amount) || amount < 0) return profile;
  return setCredits(profile, profile.credits + amount);
}
