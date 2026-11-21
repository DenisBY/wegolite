// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Damaged equipment and destroyed cargo, the two pure profile operations
 * (Phase 19, CBT-08, CBT-12, SAVE-09; decisions D-03, D-04, D-11).
 *
 * A damaged item leaves `equipment` and joins `damagedEquipment`, so every
 * consumer that reads the installed list already treats it as not installed.
 * Every refusal returns the same object, the profile family's convention.
 */

import { describe, expect, it } from "vitest";

import { emptyCargo, setCargo } from "../../../src/sim/economy/cargo.js";
import {
  applyCargoDestroyed,
  applyEquipmentDamaged,
} from "../../../src/sim/player/damage.js";
import {
  DAMAGEABLE_EQUIPMENT_KEYS,
  isDamageableKey,
} from "../../../src/sim/player/outfitting.js";
import {
  MAX_EQUIPMENT_KEYS,
  newProfile,
  purchase,
} from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";

function profileWith(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...newProfile(), ...overrides };
}

describe("PlayerProfile.damagedEquipment", () => {
  it("starts empty, as a fresh array per call", () => {
    const first = newProfile();
    expect(first.damagedEquipment).toEqual([]);
    expect(newProfile().damagedEquipment).not.toBe(first.damagedEquipment);
  });
});

describe("DAMAGEABLE_EQUIPMENT_KEYS (D-03, the one damageable set)", () => {
  it("is frozen and holds the four F3 damageable keys in visible order", () => {
    expect(Object.isFrozen(DAMAGEABLE_EQUIPMENT_KEYS)).toBe(true);
    expect([...DAMAGEABLE_EQUIPMENT_KEYS]).toEqual([
      "EQ_DOCK_COMP",
      "EQ_GAL_DRIVE",
      "EQ_ADVANCED_COMPASS",
      "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
    ]);
  });

  it("isDamageableKey accepts each member", () => {
    for (const key of DAMAGEABLE_EQUIPMENT_KEYS) {
      expect(isDamageableKey(key), key).toBe(true);
    }
  });

  it("isDamageableKey rejects inherited names, junk and every laser key", () => {
    for (const value of [
      "__proto__",
      "toString",
      "constructor",
      "",
      undefined,
      null,
      42,
      {},
      "EQ_CARGO_BAY",
      "EQ_ECM",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_BEAM_LASER",
      "EQ_WEAPON_MINING_LASER",
      "EQ_WEAPON_MILITARY_LASER",
      "EQ_WEAPON_NONE",
    ]) {
      expect(isDamageableKey(value), String(value)).toBe(false);
    }
  });
});

describe("applyEquipmentDamaged", () => {
  it("moves an installed damageable key from equipment to damagedEquipment", () => {
    const profile = profileWith({
      equipment: ["EQ_CARGO_BAY", "EQ_DOCK_COMP"],
    });

    const next = applyEquipmentDamaged(profile, "EQ_DOCK_COMP");

    expect(next).not.toBe(profile);
    expect(next.equipment).toEqual(["EQ_CARGO_BAY"]);
    expect(next.damagedEquipment).toEqual(["EQ_DOCK_COMP"]);
    // The input is unchanged.
    expect(profile.equipment).toEqual(["EQ_CARGO_BAY", "EQ_DOCK_COMP"]);
    expect(profile.damagedEquipment).toEqual([]);
  });

  it("appends in damage order", () => {
    const profile = profileWith({
      equipment: ["EQ_DOCK_COMP", "EQ_ADVANCED_COMPASS"],
    });

    const next = applyEquipmentDamaged(
      applyEquipmentDamaged(profile, "EQ_ADVANCED_COMPASS"),
      "EQ_DOCK_COMP",
    );

    expect(next.equipment).toEqual([]);
    expect(next.damagedEquipment).toEqual([
      "EQ_ADVANCED_COMPASS",
      "EQ_DOCK_COMP",
    ]);
  });

  it("leaves every other field alone", () => {
    const profile = profileWith({
      credits: 777,
      equipment: ["EQ_DOCK_COMP"],
      cargo: setCargo(emptyCargo(), "food", 3),
      fuel: 33,
      missiles: 2,
      passengerBerths: 1,
    });

    const next = applyEquipmentDamaged(profile, "EQ_DOCK_COMP");

    expect(next.credits).toBe(777);
    expect(next.cargo).toBe(profile.cargo);
    expect(next.fuel).toBe(33);
    expect(next.missiles).toBe(2);
    expect(next.passengerBerths).toBe(1);
    expect(next.laserMounts).toBe(profile.laserMounts);
  });

  it("returns the same object for a key that is not installed", () => {
    const profile = profileWith({ equipment: ["EQ_CARGO_BAY"] });
    expect(applyEquipmentDamaged(profile, "EQ_DOCK_COMP")).toBe(profile);
  });

  it("returns the same object for a key already damaged", () => {
    const profile = profileWith({
      equipment: ["EQ_CARGO_BAY"],
      damagedEquipment: ["EQ_DOCK_COMP"],
    });
    expect(applyEquipmentDamaged(profile, "EQ_DOCK_COMP")).toBe(profile);
  });

  it("returns the same object for an installed key outside the damageable set", () => {
    for (const key of ["EQ_CARGO_BAY", "EQ_ECM", "EQ_WEAPON_PULSE_LASER"]) {
      const profile = profileWith({ equipment: [key] });
      expect(applyEquipmentDamaged(profile, key), key).toBe(profile);
    }
  });

  it("returns the same object for a prototype name or a non-damageable junk key", () => {
    const profile = profileWith({ equipment: ["EQ_DOCK_COMP"] });
    for (const key of ["__proto__", "toString", ""]) {
      expect(applyEquipmentDamaged(profile, key), key).toBe(profile);
    }
  });
});
describe("applyCargoDestroyed (D-04)", () => {
  const cargo = setCargo(setCargo(emptyCargo(), "food", 3), "gold", 2700);
  const held = profileWith({ cargo });

  it("lowers the held quantity", () => {
    expect(applyCargoDestroyed(held, "food", 1).cargo).toEqual({
      food: 2,
      gold: 2700,
    });
    expect(applyCargoDestroyed(held, "gold", 1000).cargo).toEqual({
      food: 3,
      gold: 1700,
    });
  });

  it("drops an entry that reaches zero", () => {
    const next = applyCargoDestroyed(held, "food", 3);
    expect(next.cargo).toEqual({ gold: 2700 });
    expect(Object.keys(next.cargo)).toEqual(["gold"]);
  });

  it("never mutates its input", () => {
    applyCargoDestroyed(held, "food", 3);
    expect(held.cargo).toEqual({ food: 3, gold: 2700 });
  });

  it("returns the same object for a bad commodity or amount", () => {
    const refusals: [string, number][] = [
      ["gold", 2701],
      ["food", 0],
      ["food", -1],
      ["food", 1.5],
      ["food", Number.NaN],
      ["food", Number.POSITIVE_INFINITY],
      ["food", Number.MAX_SAFE_INTEGER + 2],
      ["alien_items", 1],
      ["__proto__", 1],
      ["toString", 1],
    ];
    for (const [commodity, amount] of refusals) {
      expect(
        applyCargoDestroyed(held, commodity, amount),
        `${commodity} ${String(amount)}`,
      ).toBe(held);
    }
  });
});

describe("purchase counts both lists against the 64-key bound (T-19-05)", () => {
  const item = { key: "EQ_DOCK_COMP", price: 100, techLevel: 1 };
  const keys = (count: number, prefix: string): string[] =>
    Array.from({ length: count }, (_, index) => `${prefix}${String(index)}`);

  it("refuses a fifth item with 60 installed and 4 damaged keys", () => {
    const profile = profileWith({
      credits: 10_000,
      equipment: keys(60, "K"),
      damagedEquipment: keys(4, "D"),
    });
    expect(MAX_EQUIPMENT_KEYS).toBe(64);
    expect(purchase(profile, item)).toBe(profile);
  });

  it("refuses to buy a key that is damaged, so the lists stay disjoint", () => {
    const profile = profileWith({
      credits: 10_000,
      damagedEquipment: ["EQ_DOCK_COMP"],
    });
    expect(purchase(profile, item)).toBe(profile);
  });

  it("buys with 59 installed and 4 damaged keys", () => {
    const profile = profileWith({
      credits: 10_000,
      equipment: keys(59, "K"),
      damagedEquipment: keys(4, "D"),
    });
    const next = purchase(profile, item);
    expect(next).not.toBe(profile);
    expect(next.equipment).toHaveLength(60);
  });
});
