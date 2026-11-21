// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The profile operations the app commits when the simulation reports internal
 * damage (Phase 19, CBT-08, CBT-12, SAVE-09; decisions D-03, D-04, D-11).
 *
 * Oolite damages an item by removing its equipment key and adding the same key
 * with a damaged suffix (`PlayerEntity.m:6155-6161`). Wegolite keeps the
 * damaged item in its own list instead, `PlayerProfile.damagedEquipment`, so
 * `equipment` keeps its exact meaning (installed and working) for every
 * consumer: a damaged item does not count as installed because it is simply
 * not there.
 *
 * Every operation returns a new profile and never mutates its input. A refusal
 * returns the same object, as `purchase` does, so a caller can compare
 * identity.
 */

import { setCargo } from "../economy/cargo.js";
import { isDamageableKey } from "./outfitting.js";
import type { PlayerProfile } from "./profile.js";

/**
 * Move an installed damageable key from `equipment` to the end of
 * `damagedEquipment` (damage order).
 *
 * Refuses (same object) a key that is outside the damageable set, not
 * installed or already damaged, so `damagedEquipment` only ever holds keys the
 * repair door can repair.
 */
export function applyEquipmentDamaged(
  profile: PlayerProfile,
  key: string,
): PlayerProfile {
  if (!isDamageableKey(key)) return profile;
  if (!profile.equipment.includes(key)) return profile;
  if (profile.damagedEquipment.includes(key)) return profile;
  return {
    ...profile,
    equipment: profile.equipment.filter((held) => held !== key),
    damagedEquipment: [...profile.damagedEquipment, key],
  };
}

/**
 * Lower the held quantity of `commodity` by `amount` (a destroyed pod, D-04),
 * dropping an entry that reaches zero.
 *
 * The commodity is read as an own property of the cargo map, so an inherited
 * name (`toString`, `__proto__`) is never "held". Refuses (same object) an
 * unknown commodity, an amount that is not a positive safe integer, or one
 * larger than the held quantity.
 */
export function applyCargoDestroyed(
  profile: PlayerProfile,
  commodity: string,
  amount: number,
): PlayerProfile {
  if (!Number.isSafeInteger(amount) || amount <= 0) return profile;
  if (!Object.prototype.hasOwnProperty.call(profile.cargo, commodity)) {
    return profile;
  }
  const held = profile.cargo[commodity];
  if (held === undefined || amount > held) return profile;
  return {
    ...profile,
    cargo: setCargo(profile.cargo, commodity, held - amount),
  };
}
