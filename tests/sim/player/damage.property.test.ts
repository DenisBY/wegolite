// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The assumption-delta companion (Phase 19, plan 19-03): `equipment` and
 * `damagedEquipment` are two lists that must stay disjoint, duplicate-free and
 * within one combined bound. For any sequence of purchases and damage
 * operations that holds, every damaged key is in the damageable set, and every
 * refused operation returns the same object. Plan 19-05 adds the repair to the
 * operation set (with random raw tech levels and credits) and proves that the
 * repair door's parser and check are total over arbitrary input.
 */

import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseEquipment } from "../../../src/content/equipment.js";
import type { Equipment } from "../../../src/content/types.js";
import { emptyCargo, setCargo } from "../../../src/sim/economy/cargo.js";
import {
  applyCargoDestroyed,
  applyEquipmentDamaged,
} from "../../../src/sim/player/damage.js";
import {
  DAMAGEABLE_EQUIPMENT_KEYS,
  FUEL_CAPACITY,
  MAX_MISSILES,
  applyRepair,
  checkRepair,
  parseRepairFitKey,
  repairPrice,
} from "../../../src/sim/player/outfitting.js";
import type { FitContext } from "../../../src/sim/player/outfitting.js";
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

const catalogue = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);

function catalogueItem(key: string): Equipment {
  const found = catalogue.find((record) => record.key === key);
  if (found === undefined) throw new Error(`no equipment "${key}"`);
  return found;
}

function contextAt(techLevelRaw: number): FitContext {
  return {
    techLevelRaw,
    fuelCapacity: FUEL_CAPACITY,
    missileCapacity: MAX_MISSILES,
    availablePods: 20,
    missilePrice: 0,
  };
}

type Operation =
  | { readonly kind: "buy"; readonly key: string; readonly filler: number }
  | { readonly kind: "damage"; readonly key: string }
  | {
      readonly kind: "repair";
      readonly key: string;
      readonly techLevelRaw: number;
      readonly credits: number;
    }
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
    kind: fc.constant("repair" as const),
    key: fc.constantFrom<string>(...DAMAGE_TARGETS),
    techLevelRaw: fc.integer({ min: 0, max: 15 }),
    // Credits straddle the four repair prices (3250 to 25000).
    credits: fc.integer({ min: 0, max: 30_000 }),
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

type RepairOperation = Extract<Operation, { readonly kind: "repair" }>;

function fundedFor(profile: PlayerProfile, op: RepairOperation): PlayerProfile {
  return { ...profile, credits: op.credits };
}

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
    case "repair": {
      // The credits are set before the call; a refusal keeps the unfunded
      // profile, so the loop's identity check on the funded copy stays exact.
      const funded = fundedFor(profile, op);
      const next = applyRepair(
        funded,
        catalogueItem(op.key),
        contextAt(op.techLevelRaw),
      );
      return next === funded ? profile : next;
    }
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

/** What a repair operation must have done, from the door's own rules. */
function assertRepair(
  before: PlayerProfile,
  op: RepairOperation,
  after: PlayerProfile,
): void {
  const record = catalogueItem(op.key);
  const funded = fundedFor(before, op);
  const ctx = contextAt(op.techLevelRaw);
  const check = checkRepair(funded, record, ctx);
  const expected =
    DAMAGEABLE_EQUIPMENT_KEYS.some((key) => key === op.key) &&
    before.damagedEquipment.includes(op.key) &&
    !before.equipment.includes(op.key) &&
    op.techLevelRaw >= Math.max(record.techLevel - 1, 0) &&
    op.credits >= Math.ceil(record.price / 2);
  expect(check.ok).toBe(expected);
  if (!check.ok) {
    // A refused repair leaves the session's profile untouched.
    expect(after).toBe(before);
    expect(applyRepair(funded, record, ctx)).toBe(funded);
    return;
  }
  expect(after).not.toBe(before);
  expect(after.credits).toBe(op.credits - repairPrice(record));
  expect(Number.isSafeInteger(after.credits) && after.credits >= 0).toBe(true);
  expect(after.equipment.at(-1)).toBe(op.key);
  expect(after.equipment).toHaveLength(before.equipment.length + 1);
  expect(after.damagedEquipment).toEqual(
    before.damagedEquipment.filter((key) => key !== op.key),
  );
}

describe("equipment and damagedEquipment stay disjoint and bounded (fast-check)", () => {
  it("holds across any sequence of purchases, damage, repair and cargo loss", () => {
    let repairs = 0;
    fc.assert(
      fc.property(
        fc.array(operation, { minLength: 1, maxLength: 40 }),
        (operations) => {
          let profile = start();
          for (const op of operations) {
            const next = apply(profile, op);
            if (op.kind === "repair") {
              assertRepair(profile, op, next);
              if (next !== profile) repairs += 1;
            }
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
    // Not vacuous: the generator reaches accepted repairs.
    expect(repairs).toBeGreaterThan(0);
  });

  it("the repair door is total over arbitrary keys and record fields", () => {
    const number = fc.oneof(
      fc.double({ noNaN: false }),
      fc.integer({ min: -5, max: 2e9 }),
      fc.constantFrom(
        Number.NaN,
        Infinity,
        -Infinity,
        0,
        -0,
        1.5,
        Number.MAX_SAFE_INTEGER,
        1e9,
        1e9 + 1,
      ),
    );
    const key = fc.oneof(
      fc.string(),
      fc.constantFrom<string>(
        ...DAMAGE_TARGETS,
        "__proto__",
        "constructor",
        "toString",
      ),
    );
    fc.assert(
      fc.property(
        key,
        key,
        number,
        number,
        number,
        number,
        (rowKey, itemKey, price, techLevel, credits, techLevelRaw) => {
          const parsed = parseRepairFitKey(rowKey);
          if (parsed !== null) {
            expect(rowKey).toBe(`${parsed}@repair`);
            expect(DAMAGEABLE_EQUIPMENT_KEYS).toContain(parsed);
          }
          const profile = {
            ...newProfile(),
            credits,
            damagedEquipment: [itemKey, ...DAMAGEABLE_EQUIPMENT_KEYS],
          };
          const record: Equipment = {
            ...catalogueItem("EQ_DOCK_COMP"),
            key: itemKey,
            price,
            techLevel,
          };
          const ctx = contextAt(techLevelRaw);
          const check = checkRepair(profile, record, ctx);
          const next = applyRepair(profile, record, ctx);
          if (check.ok) {
            expect(next).not.toBe(profile);
            expect(
              Number.isSafeInteger(next.credits) && next.credits >= 0,
            ).toBe(true);
            expect(next.equipment).toContain(itemKey);
          } else {
            expect(next).toBe(profile);
          }
        },
      ),
      { numRuns: 500 },
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
