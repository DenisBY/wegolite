// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's internal-damage facts and their place in the step options
 * (Phase 19, plan 19-11, CBT-08, D-01, D-03).
 *
 * Node only, with the real compiled catalogues: `internalDamageFactsFor` is pure
 * and the roll's damageable set must be the one the F3 repair door repairs.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildStepOptions,
  internalDamageFactsFor,
} from "../../../src/app/session/step-options.js";
import type { StepOptionsInput } from "../../../src/app/session/step-options.js";
import { parseEquipment } from "../../../src/content/equipment.js";
import { holdPods } from "../../../src/sim/economy/cargo.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import type { InternalDamageFacts } from "../../../src/sim/combat/internal-damage.js";
import { DAMAGEABLE_EQUIPMENT_KEYS } from "../../../src/sim/player/outfitting.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";

const catalogue = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);
const commodities = commoditiesFixture();
const lave = laveFixture();

/** Every key F3 can install in `equipment` (`SINGLE_INSTANCE_KEYS`). */
const F3_KEYS = [
  "EQ_CARGO_BAY",
  "EQ_DOCK_COMP",
  "EQ_GAL_DRIVE",
  "EQ_ADVANCED_COMPASS",
  "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
];

function holding(
  equipment: readonly string[],
  extra: { passengerBerths?: number; cargo?: Record<string, number> } = {},
) {
  return { ...newProfile(), equipment, ...extra };
}

describe("internalDamageFactsFor", () => {
  it("lists the items in profile.equipment order with their compiled probability", () => {
    const facts = internalDamageFactsFor(
      holding(["EQ_DOCK_COMP", "EQ_CARGO_BAY", "EQ_GAL_DRIVE"]),
      catalogue,
      commodities,
    );
    expect(facts.items).toEqual([
      { key: "EQ_DOCK_COMP", damageProbability: 1 },
      { key: "EQ_CARGO_BAY", damageProbability: 0 },
      { key: "EQ_GAL_DRIVE", damageProbability: 1 },
    ]);
  });

  it("gives a key the catalogue lacks probability 0 and keeps zero-probability keys listed", () => {
    const facts = internalDamageFactsFor(
      holding(["EQ_NOT_IN_THE_CATALOGUE", "EQ_CARGO_BAY"]),
      catalogue,
      commodities,
    );
    expect(facts.items).toEqual([
      { key: "EQ_NOT_IN_THE_CATALOGUE", damageProbability: 0 },
      { key: "EQ_CARGO_BAY", damageProbability: 0 },
    ]);
  });

  it("reports the hold's capacity, not its free space", () => {
    const capacity = (
      equipment: readonly string[],
      passengerBerths: number,
      cargo: Record<string, number> = {},
    ): number =>
      internalDamageFactsFor(
        holding(equipment, { passengerBerths, cargo }),
        catalogue,
        commodities,
      ).capacityPods;
    expect(capacity([], 0)).toBe(20);
    expect(capacity(["EQ_CARGO_BAY"], 0)).toBe(35);
    expect(capacity([], 1)).toBe(15);
    // A full hold does not change the capacity.
    expect(capacity([], 0, { gold: 2700 })).toBe(20);
  });

  it("builds the pods exactly as holdPods does for the same hold", () => {
    const cargo = { gold: 2700, food: 3 };
    const facts = internalDamageFactsFor(
      holding([], { cargo }),
      catalogue,
      commodities,
    );
    expect(facts.pods).toEqual(holdPods(cargo, commodities));
    expect(facts.pods.length).toBeGreaterThan(0);
  });

  it("never mutates the profile or the catalogues", () => {
    const profile = holding(["EQ_DOCK_COMP"], { cargo: { gold: 2700 } });
    const profileBefore = JSON.stringify(profile);
    const catalogueBefore = JSON.stringify(catalogue);
    const commoditiesBefore = JSON.stringify(commodities);
    internalDamageFactsFor(profile, catalogue, commodities);
    expect(JSON.stringify(profile)).toBe(profileBefore);
    expect(JSON.stringify(catalogue)).toBe(catalogueBefore);
    expect(JSON.stringify(commodities)).toBe(commoditiesBefore);
  });

  it("D-03: the items above probability 0 are exactly the keys the repair door repairs", () => {
    const facts = internalDamageFactsFor(
      holding(F3_KEYS),
      catalogue,
      commodities,
    );
    const damageable = facts.items
      .filter((item) => item.damageProbability > 0)
      .map((item) => item.key);
    // The profile order is EQ_CARGO_BAY, EQ_DOCK_COMP, EQ_GAL_DRIVE, ...
    const expected = F3_KEYS.filter((key) =>
      (DAMAGEABLE_EQUIPMENT_KEYS as readonly string[]).includes(key),
    );
    expect(damageable).toEqual(expected);
    expect([...damageable].sort()).toEqual(
      [...DAMAGEABLE_EQUIPMENT_KEYS].sort(),
    );
  });
});

describe("buildStepOptions and the internal-damage facts", () => {
  const input: StepOptionsInput = {
    fuel: 70,
    system: lave.system,
    target: undefined,
    equipment: new Set<string>(),
    dock: undefined,
    laserMounts: DEFAULT_LASER_MOUNTS,
  };

  it("leaves the key out of combat when no facts are given", () => {
    const options = buildStepOptions(input);
    expect(options.combat).not.toHaveProperty("internalDamage");
  });

  it("places the given facts under combat, by identity", () => {
    const facts: InternalDamageFacts = {
      items: [{ key: "EQ_DOCK_COMP", damageProbability: 1 }],
      capacityPods: 20,
      pods: [],
    };
    const options = buildStepOptions({ ...input, internalDamage: facts });
    expect(options.combat?.internalDamage).toBe(facts);
  });
});
