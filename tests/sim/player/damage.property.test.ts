// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The assumption-delta companion (Phase 19, plan 19-03): `equipment` and
 * `damagedEquipment` are two lists that must stay disjoint, duplicate-free and
 * within one combined bound. For any sequence of purchases and damage
 * operations that holds, every damaged key is in the damageable set, and every
 * refused operation returns the same object. Plan 19-05 extends the operation
 * set with the repair.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { emptyCargo, setCargo } from "../../../src/sim/economy/cargo.js";
import {
  applyCargoDestroyed,
  applyEquipmentDamaged,
} from "../../../src/sim/player/damage.js";
import { DAMAGEABLE_EQUIPMENT_KEYS } from "../../../src/sim/player/outfitting.js";
import {
  MAX_EQUIPMENT_KEYS,
  newProfile,
  purchase,
} from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";

/** The four damageable keys plus EQ_CARGO_BAY: what a profile can buy. */
const BUYABLE = [...DAMAGEABLE_EQUIPMENT_KEYS, "EQ_CARGO_BAY"] as const;
/** The damage targets, with two keys the roll can never record. */
const DAMAGE_TARGETS = [...BUYABLE, "EQ_ECM", "EQ_WEAPON_PULSE_LASER"] as const;
const COMMODITIES = ["food", "gold", "alien_items"] as const;

type Operation =
  | { readonly kind: "buy"; readonly key: string; readonly filler: number }
  | { readonly kind: "damage"; readonly key: string }
  | {
      readonly kind: "cargo";
      readonly commodity: string;
      readonly amount: number;
    };

const operation: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    kind: fc.constant("buy" as const),
    key: fc.constantFrom<string>(...BUYABLE),
    // How many filler keys to buy first, to reach the combined bound.
    filler: fc.integer({ min: 0, max: 30 }),
  }),
  fc.record({
    kind: fc.constant("damage" as const),
    key: fc.constantFrom<string>(...DAMAGE_TARGETS),
  }),
  fc.record({
    kind: fc.constant("cargo" as const),
    commodity: fc.constantFrom<string>(...COMMODITIES),
    amount: fc.oneof(fc.integer({ min: -2, max: 5000 }), fc.double()),
  }),
);

function start(): PlayerProfile {
  const cargo = setCargo(setCargo(emptyCargo(), "food", 4), "gold", 2700);
  return { ...newProfile(), credits: 1e9, cargo };
}

const record = (key: string) => ({ key, price: 10, techLevel: 1 });

function apply(profile: PlayerProfile, op: Operation): PlayerProfile {
  switch (op.kind) {
    case "buy": {
      let next = profile;
      for (let index = 0; index < op.filler; index += 1) {
        next = purchase(next, record(`FILLER_${String(index)}`));
      }
      return purchase(next, record(op.key));
    }
    case "damage":
      return applyEquipmentDamaged(profile, op.key);
    case "cargo":
      return applyCargoDestroyed(profile, op.commodity, op.amount);
  }
}

function assertInvariant(profile: PlayerProfile): void {
  const { equipment, damagedEquipment } = profile;
  expect(new Set(equipment).size).toBe(equipment.length);
  expect(new Set(damagedEquipment).size).toBe(damagedEquipment.length);
  for (const key of damagedEquipment) {
    expect(equipment).not.toContain(key);
    expect(DAMAGEABLE_EQUIPMENT_KEYS as readonly string[]).toContain(key);
  }
  expect(equipment.length + damagedEquipment.length).toBeLessThanOrEqual(
    MAX_EQUIPMENT_KEYS,
  );
  for (const quantity of Object.values(profile.cargo)) {
    expect(Number.isSafeInteger(quantity) && quantity > 0).toBe(true);
  }
}

describe("equipment and damagedEquipment stay disjoint and bounded (fast-check)", () => {
  it("holds across any sequence of purchases, damage and cargo loss", () => {
    fc.assert(
      fc.property(
        fc.array(operation, { minLength: 1, maxLength: 40 }),
        (operations) => {
          let profile = start();
          for (const op of operations) {
            const next = apply(profile, op);
            // A refusal is the same object; an accepted operation is new.
            if (op.kind === "damage") {
              const damageable = DAMAGEABLE_EQUIPMENT_KEYS.some(
                (key) => key === op.key,
              );
              const installed = profile.equipment.includes(op.key);
              if (!damageable || !installed) expect(next).toBe(profile);
              else expect(next).not.toBe(profile);
            }
            profile = next;
            assertInvariant(profile);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("reaches the combined bound and refuses past it", () => {
    let profile = start();
    for (let index = 0; index < MAX_EQUIPMENT_KEYS + 10; index += 1) {
      profile = purchase(profile, record(`FILLER_${String(index)}`));
    }
    expect(profile.equipment).toHaveLength(MAX_EQUIPMENT_KEYS);
    const full = purchase(profile, record("EQ_DOCK_COMP"));
    expect(full).toBe(profile);
  });
});
