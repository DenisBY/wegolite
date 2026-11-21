// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Guard for the one damageable set (Phase 19, CONTEXT D-03, plan 19-05).
 *
 * Oolite's `canBeDamaged` is `damage_probability` above 0, never a missile or a
 * mine (`OOEquipmentType.m:247, 504-520`). In Wegolite a profile can hold in
 * `profile.equipment` only the `SINGLE_INSTANCE_KEYS` (lasers live in
 * `laserMounts`), so the damageable set is those keys whose compiled
 * `damageProbability` is above 0. The roll, the commit (`applyEquipmentDamaged`),
 * the save allow-list and the repair door all read one array,
 * `DAMAGEABLE_EQUIPMENT_KEYS`. This guard fails when the real compiled
 * catalogue and that array drift apart, when the repair door grows a second
 * literal, or when a laser record enters the set.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseEquipment } from "../../src/content/equipment.js";
import { LASER_KEYS, NO_LASER } from "../../src/sim/combat/mounts.js";
import {
  DAMAGEABLE_EQUIPMENT_KEYS,
  REPAIRABLE_EQUIPMENT_KEYS,
  SINGLE_INSTANCE_KEYS,
  isRepairableKey,
  parseRepairFitKey,
  repairFitKey,
} from "../../src/sim/player/outfitting.js";

const catalogue = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);

const D03 =
  "CONTEXT D-03: the roll, the commit, the save and the repair door share one damageable set";

/** Sorted copy, so set equality reads as one `toEqual`. */
function sorted(keys: Iterable<string>): string[] {
  return [...keys].sort();
}

describe("the one damageable set (D-03)", () => {
  it(`the repair allow-list is the damageable array itself (${D03})`, () => {
    expect(REPAIRABLE_EQUIPMENT_KEYS, D03).toBe(DAMAGEABLE_EQUIPMENT_KEYS);
  });

  it(`every damageable key is repairable and round-trips its row key (${D03})`, () => {
    for (const key of DAMAGEABLE_EQUIPMENT_KEYS) {
      expect(isRepairableKey(key), `${key} must be repairable: ${D03}`).toBe(
        true,
      );
      expect(
        parseRepairFitKey(repairFitKey(key)),
        `${key} must round-trip: ${D03}`,
      ).toBe(key);
    }
  });

  it(`equals the single-instance keys whose compiled damageProbability is above 0 (${D03})`, () => {
    const compiled = catalogue
      .filter(
        (record) =>
          SINGLE_INSTANCE_KEYS.has(record.key) && record.damageProbability > 0,
      )
      .map((record) => record.key);

    // Every single-instance key must exist in the catalogue, else the
    // comparison could shrink silently with a missing record.
    for (const key of SINGLE_INSTANCE_KEYS) {
      expect(
        catalogue.some((record) => record.key === key),
        `${key} is missing from the compiled catalogue: ${D03}`,
      ).toBe(true);
    }
    expect(sorted(DAMAGEABLE_EQUIPMENT_KEYS), D03).toEqual(sorted(compiled));
  });

  it(`holds no laser record while the catalogue still compiles one above 0 (${D03})`, () => {
    const lasers = catalogue.filter(
      (record) =>
        record.key.startsWith("EQ_WEAPON_") && record.damageProbability > 0,
    );
    // Not vacuous: at least one laser record is damageable in Oolite's terms.
    expect(
      lasers.map((record) => record.key),
      `the exclusion would be vacuous without a laser above 0: ${D03}`,
    ).toContain("EQ_WEAPON_PULSE_LASER");
    // None of them can be installed through `equipment`.
    for (const record of lasers) {
      expect(
        SINGLE_INSTANCE_KEYS.has(record.key),
        `${record.key} must not be single-instance: ${D03}`,
      ).toBe(false);
    }

    const forbidden = new Set<string>([
      ...LASER_KEYS,
      NO_LASER,
      "EQ_WEAPON_THARGOID_LASER",
    ]);
    for (const key of DAMAGEABLE_EQUIPMENT_KEYS) {
      expect(forbidden.has(key), `${key} is a laser key: ${D03}`).toBe(false);
      expect(key.startsWith("EQ_WEAPON_"), `${key}: ${D03}`).toBe(false);
    }
  });
});
