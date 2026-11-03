// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Goldens for the equipment projection (DATA-07, D-10, D-25, T-02-07).
 *
 * `equipment.plist` is an array of six-element positional arrays
 * `(techLevel, price, name, key, description, conditions)`. This suite pins the
 * 41 keys, the four decicredit/TL anchors, the short-tuple failure, and the
 * open condition record: a key outside the 21 measured keys must survive a
 * bump rather than fail the build.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EquipmentSchema } from "../../../src/content/schemas/equipment.js";
import type { Equipment } from "../../../src/content/schemas/equipment.js";
import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import { compileEquipment } from "./equipment.js";

const PLIST = "third_party/oolite/Config/equipment.plist";

/** The complete authored key set, in the research's catalogue order. */
const EQUIPMENT_KEYS = [
  "EQ_FUEL",
  "EQ_MISSILE",
  "EQ_CARGO_BAY",
  "EQ_ECM",
  "EQ_FUEL_SCOOPS",
  "EQ_ESCAPE_POD",
  "EQ_ENERGY_UNIT",
  "EQ_NAVAL_ENERGY_UNIT",
  "EQ_DOCK_COMP",
  "EQ_GAL_DRIVE",
  "EQ_WEAPON_NONE",
  "EQ_WEAPON_PULSE_LASER",
  "EQ_WEAPON_BEAM_LASER",
  "EQ_WEAPON_MINING_LASER",
  "EQ_WEAPON_MILITARY_LASER",
  "EQ_CLOAKING_DEVICE",
  "thargon",
  "EQ_THARGON",
  "EQ_TRUMBLE",
  "EQ_PASSENGER_BERTH",
  "EQ_PASSENGER_BERTH_REMOVAL",
  "EQ_MISSILE_REMOVAL",
  "EQ_HARDENED_MISSILE",
  "EQ_FUEL_INJECTION",
  "EQ_SCANNER_SHOW_MISSILE_TARGET",
  "EQ_MULTI_TARGET",
  "EQ_ADVANCED_COMPASS",
  "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
  "EQ_TARGET_MEMORY",
  "EQ_INTEGRATED_TARGETING_SYSTEM",
  "EQ_WEAPON_THARGOID_LASER",
  "EQ_QC_MINE",
  "EQ_SHIELD_BOOSTER",
  "EQ_NAVAL_SHIELD_BOOSTER",
  "EQ_HEAT_SHIELD",
  "EQ_WORMHOLE_SCANNER",
  "EQ_RENOVATION",
  "EQ_MILITARY_JAMMER",
  "EQ_MILITARY_SCANNER_FILTER",
  "EQ_SHIELD_ENHANCER",
  "EQ_OOLITE_TUTORIAL_CONTROLS",
] as const;

const source = readFileSync(
  new URL(
    "../../../third_party/oolite/Config/equipment.plist",
    import.meta.url,
  ),
  "utf8",
);

const equipment = compileEquipment(parseOpenStep(source, PLIST));

/** The 41 TL/price pairs, generated from the committed `equipment.json`. */
interface EquipmentFixtureEntry {
  readonly techLevel: number;
  readonly price: number;
}

interface EquipmentFixture {
  readonly version: number;
  readonly entries: Record<string, EquipmentFixtureEntry>;
}

const equipmentFixture = JSON.parse(
  readFileSync(
    new URL("../../../tests/golden/content/equipment.json", import.meta.url),
    "utf8",
  ),
) as EquipmentFixture;

function require(key: string): Equipment {
  const record = equipment.find((item) => item.key === key);
  if (record === undefined) throw new Error(`equipment "${key}" is missing`);
  return record;
}

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a ContentError, but no error was thrown");
}

describe("equipment catalogue", () => {
  it("emits all 41 positional tuples with integer tech level and decicredit price", () => {
    expect(equipment).toHaveLength(41);
    expect(equipment.map((record) => record.key).sort()).toEqual(
      [...EQUIPMENT_KEYS].sort(),
    );
    for (const record of equipment) {
      expect(Number.isInteger(record.techLevel)).toBe(true);
      expect(Number.isInteger(record.price)).toBe(true);
      expect(record.priceUnit).toBe("decicredits");
      expect(typeof record.name).toBe("string");
      expect(typeof record.description).toBe("string");
    }
  });

  it("pins the four decicredit anchors", () => {
    expect(require("EQ_DOCK_COMP").techLevel).toBe(9);
    expect(require("EQ_DOCK_COMP").price).toBe(15000);
    expect(require("EQ_CARGO_BAY").techLevel).toBe(1);
    expect(require("EQ_CARGO_BAY").price).toBe(4000);
    expect(require("EQ_FUEL").techLevel).toBe(0);
    expect(require("EQ_FUEL").price).toBe(2);
    expect(require("EQ_MISSILE").techLevel).toBe(1);
    expect(require("EQ_MISSILE").price).toBe(300);
  });

  it("rejects a five-element tuple with SCHEMA naming the file and key", () => {
    const synthetic = parseOpenStep(
      `(
        ( 1, 2, "Fuel", "EQ_FUEL", "Fuel for the witchspace engines." )
      )`,
      "synthetic.plist",
    );

    const error = capture(() => compileEquipment(synthetic));
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(PLIST);
    expect(error.construct).toContain("EQ_FUEL");
    expect(error.message).toMatch(/EQ_FUEL/);
  });

  it("keeps conditions an open record that preserves an unknown key", () => {
    const synthetic = parseOpenStep(
      `(
        (
          1, 2, "Fuel", "EQ_FUEL", "Fuel for the witchspace engines.",
          {
            available_to_all = yes;
            brand_new_condition = 42;
          }
        )
      )`,
      "synthetic.plist",
    );

    const [record] = compileEquipment(synthetic);
    if (record === undefined) throw new Error("no equipment emitted");
    expect(record.conditions.available_to_all).toBe(true);
    expect(record.conditions.brand_new_condition).toBe(42);

    // The real catalogue keeps its authored condition metadata verbatim. Note
    // `available_to_all = true;` is a bare atom, so it stays the string
    // "true" — coercion is Oolite's job at runtime, not the compiler's.
    expect(require("EQ_FUEL").conditions.available_to_all).toBe("true");
    expect(require("EQ_DOCK_COMP").conditions.condition_script).toBe(
      "oolite-conditions.js",
    );
  });

  it("validates every record with the strict equipment schema", () => {
    for (const record of equipment) {
      expect(EquipmentSchema.safeParse(record).success).toBe(true);
    }
    const first = equipment[0];
    if (first === undefined) throw new Error("no equipment emitted");
    expect(EquipmentSchema.safeParse({ ...first, extra: true }).success).toBe(
      false,
    );
  });
});

describe("equipment golden fixture", () => {
  it("pins all 41 tech-level and price pairs", () => {
    expect(equipmentFixture.version).toBe(1);
    const fixtureKeys = Object.keys(equipmentFixture.entries).sort();
    expect(fixtureKeys).toHaveLength(41);
    expect(equipment.map((record) => record.key).sort()).toEqual(fixtureKeys);

    for (const key of fixtureKeys) {
      const expected = equipmentFixture.entries[key];
      if (expected === undefined)
        throw new Error(`fixture entry ${key} missing`);
      const record = require(key);
      expect(record.techLevel).toBe(expected.techLevel);
      expect(record.price).toBe(expected.price);
      expect(record.priceUnit).toBe("decicredits");
    }

    expect(
      equipment.filter((record) => record.priceUnit === "decicredits"),
    ).toHaveLength(41);
  });
});
