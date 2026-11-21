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
