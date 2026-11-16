// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy NPC ship catalogue (DATA-13).
 *
 * The loader reads `generated/ships-npc.json` as a non-eager `?raw` chunk and
 * validates it with the strict schema. Nothing on the boot path may import it
 * in this phase: Phase 12's populator is its first consumer, and this guard is
 * relaxed in the same commit that adds that consumer.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findNpcShip, loadNpcCatalogue } from "../../src/content/ships-npc.js";
import {
  MAX_FLIGHT_MAGNITUDE_BOUND,
  MAX_FLIGHT_RATE_BOUND,
  NpcShipCatalogueSchema,
} from "../../src/content/schemas/ship-npc.js";
import {
  MAX_ENTITY_MAGNITUDE,
  MAX_STEER_RATE,
} from "../../src/sim/world/limits.js";
import { NPC_SHIP_KEYS } from "../../tools/oolite-ingest/convert/npc-ships.js";

const REPO_ROOT = process.cwd();
const LOADER = "src/content/ships-npc.ts";
const GENERATED = "src/content/generated/ships-npc.json";

const generated: unknown = JSON.parse(
  readFileSync(join(REPO_ROOT, GENERATED), "utf8"),
);

function firstRecord(): Record<string, unknown> {
  const records = generated as Record<string, unknown>[];
  const record = records[0];
  if (record === undefined) throw new Error("generated file has no record");
  return record;
}

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, directory), {
    withFileTypes: true,
  })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (relative === "src/content/generated") continue;
      sourceFiles(relative, found);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      found.push(relative);
    }
  }
  return found;
}

describe("loadNpcCatalogue", () => {
  it("resolves the nine records, equal to the parsed generated file", async () => {
    const catalogue = await loadNpcCatalogue();
    expect(catalogue.map((record) => record.key)).toEqual([...NPC_SHIP_KEYS]);
    expect(catalogue).toHaveLength(9);
    expect(catalogue).toEqual(generated);
  });

  it("returns the same promise on every call", () => {
    expect(loadNpcCatalogue()).toBe(loadNpcCatalogue());
  });
});

describe("findNpcShip", () => {
  it("finds the Viper, whose scan class is authored", async () => {
    const catalogue = await loadNpcCatalogue();
    expect(findNpcShip(catalogue, "viper").scanClass).toBe("CLASS_POLICE");
  });

  it("throws an error naming a key that is not in the catalogue", async () => {
    const catalogue = await loadNpcCatalogue();
    expect(() => findNpcShip(catalogue, "python")).toThrow(/python/);
  });
});

describe("NpcShipCatalogueSchema", () => {
  const accepts = (records: unknown): boolean =>
    NpcShipCatalogueSchema.safeParse(records).success;

  it("accepts the generated file", () => {
    expect(accepts(generated)).toBe(true);
  });

  it("bounds the flight constants by the sim's domains and refuses a value the run time would replace (WR-04)", () => {
    expect(MAX_FLIGHT_RATE_BOUND).toBe(MAX_STEER_RATE);
    expect(MAX_FLIGHT_MAGNITUDE_BOUND).toBe(MAX_ENTITY_MAGNITUDE);
    const withField = (field: string, value: number): unknown[] => [
      { ...firstRecord(), [field]: value },
    ];
    expect(accepts(withField("maxFlightRoll", MAX_STEER_RATE))).toBe(true);
    expect(accepts(withField("maxFlightRoll", MAX_STEER_RATE + 1))).toBe(false);
    expect(accepts(withField("maxFlightPitch", MAX_STEER_RATE + 1))).toBe(
      false,
    );
    expect(accepts(withField("maxFlightSpeed", MAX_ENTITY_MAGNITUDE + 1))).toBe(
      false,
    );
    expect(accepts(withField("thrust", MAX_ENTITY_MAGNITUDE + 1))).toBe(false);
    // Oolite authors speed-0 hulls (buoys): zero stays legal.
    expect(accepts(withField("maxFlightSpeed", 0))).toBe(true);
  });

  it("carries the Adder's name, energy and forward weapon", () => {
    const adder = (generated as Record<string, unknown>[]).find(
      (record) => record["key"] === "adder",
    );
    expect(adder).toMatchObject({
      name: "Adder",
      maxEnergy: 85,
      energyRechargeRate: 2,
      forwardWeapon: "EQ_WEAPON_PULSE_LASER",
    });
    expect(adder?.["forwardWeaponPosition"]).toHaveLength(3);
  });

  it("carries the five combat fields on every record", () => {
    for (const record of generated as Record<string, unknown>[]) {
      expect(typeof record["name"]).toBe("string");
      expect(record["maxEnergy"] as number).toBeGreaterThanOrEqual(0);
      expect(record["energyRechargeRate"] as number).toBeGreaterThanOrEqual(0);
      expect(typeof record["forwardWeapon"]).toBe("string");
      expect(record["forwardWeaponPosition"]).toHaveLength(3);
    }
  });

  it("rejects a record missing any combat field", () => {
    for (const field of [
      "name",
      "maxEnergy",
      "energyRechargeRate",
      "forwardWeapon",
      "forwardWeaponPosition",
    ]) {
      const record = { ...firstRecord() };
      delete record[field];
      expect(accepts([record])).toBe(false);
    }
  });

  it("rejects an unknown forward weapon", () => {
    for (const forwardWeapon of [
      "WEAPON_PULSE_LASER",
      "EQ_WEAPON_THARGOID",
      "",
      7,
    ]) {
      expect(accepts([{ ...firstRecord(), forwardWeapon }])).toBe(false);
    }
  });

  it("rejects a negative or non-finite energy field", () => {
    for (const field of ["maxEnergy", "energyRechargeRate"]) {
      for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, "85"]) {
        expect(accepts([{ ...firstRecord(), [field]: value }])).toBe(false);
      }
    }
  });

  it("rejects a position that is not three finite numbers", () => {
    for (const forwardWeaponPosition of [
      [0, 0],
      [0, 0, 0, 0],
      [0, Number.NaN, 0],
      [0, 0, Number.POSITIVE_INFINITY],
      "0 0 0",
    ]) {
      expect(accepts([{ ...firstRecord(), forwardWeaponPosition }])).toBe(
        false,
      );
    }
  });

  it("rejects an extra field, so no stat can be compiled in", () => {
    for (const field of ["accuracy", "maxFlightYaw", "hasFuelInjection"]) {
      expect(accepts([{ ...firstRecord(), [field]: 1 }])).toBe(false);
    }
  });

  it("carries the four flight fields on every record", () => {
    for (const record of generated as Record<string, unknown>[]) {
      for (const field of [
        "maxFlightSpeed",
        "maxFlightRoll",
        "maxFlightPitch",
        "thrust",
      ]) {
        expect(Number.isFinite(record[field])).toBe(true);
        expect(record[field] as number).toBeGreaterThanOrEqual(0);
        expect(Math.fround(record[field] as number)).toBe(record[field]);
      }
    }
  });

  it("carries the Viper's and the Shuttle's flight limits", () => {
    const find = (key: string): unknown =>
      (generated as Record<string, unknown>[]).find(
        (record) => record["key"] === key,
      );
    expect(find("viper")).toMatchObject({
      maxFlightSpeed: 320,
      maxFlightRoll: Math.fround(2.8),
      maxFlightPitch: Math.fround(1.8),
      thrust: 32,
    });
    expect(find("shuttle")).toMatchObject({
      maxFlightSpeed: 80,
      maxFlightRoll: 2,
      maxFlightPitch: Math.fround(0.9),
      thrust: 16,
    });
  });

  it("rejects a record missing a flight field or carrying a bad one", () => {
    for (const field of [
      "maxFlightSpeed",
      "maxFlightRoll",
      "maxFlightPitch",
      "thrust",
    ]) {
      const record = { ...firstRecord() };
      delete record[field];
      expect(accepts([record])).toBe(false);
      for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, "1"]) {
        expect(accepts([{ ...firstRecord(), [field]: value }])).toBe(false);
      }
    }
  });

  it("rejects a missing, zero, negative or non-finite mass", () => {
    const { mass: _mass, ...withoutMass } = firstRecord();
    void _mass;
    expect(accepts([withoutMass])).toBe(false);
    for (const mass of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(accepts([{ ...firstRecord(), mass }])).toBe(false);
    }
  });

  it("carries a positive mass on every record", () => {
    for (const record of generated as Record<string, unknown>[]) {
      expect(typeof record["mass"]).toBe("number");
      expect(record["mass"] as number).toBeGreaterThan(0);
    }
  });

  it("rejects a missing, zero, negative or non-finite radius", () => {
    const { radius: _radius, ...withoutRadius } = firstRecord();
    void _radius;
    expect(accepts([withoutRadius])).toBe(false);
    for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(accepts([{ ...firstRecord(), radius }])).toBe(false);
    }
  });

  it("carries a positive finite radius on every record", () => {
    for (const record of generated as Record<string, unknown>[]) {
      expect(typeof record["radius"]).toBe("number");
      expect(Number.isFinite(record["radius"])).toBe(true);
      expect(record["radius"] as number).toBeGreaterThan(0);
    }
  });

  it("rejects a glb that climbs out of models/ or names another origin", () => {
    expect(accepts([{ ...firstRecord(), glb: "../models/viper.glb" }])).toBe(
      false,
    );
    expect(
      accepts([{ ...firstRecord(), glb: "https://example.invalid/viper.glb" }]),
    ).toBe(false);
  });

  it("rejects empty roles and an empty catalogue", () => {
    expect(accepts([{ ...firstRecord(), roles: [] }])).toBe(false);
    expect(accepts([])).toBe(false);
  });
});

describe("boot-path isolation", () => {
  it("names the generated file and no other ship catalogue", () => {
    const source = readFileSync(join(REPO_ROOT, LOADER), "utf8");
    expect(source).toContain("./generated/ships-npc.json");
    expect(source).not.toMatch(/generated\/ships\.json/);
    expect(source).not.toMatch(/generated\/ships-client\.json/);
  });

  it("is named by no non-test source file other than the loader and the start-up that loads it", () => {
    // Start-up imports the loader and calls it only when traffic is on, so a
    // traffic-off session (every plain browser spec, plan 12-03) never fetches
    // the chunk. No other source file may name the catalogue.
    const named = sourceFiles("src").filter((file) =>
      readFileSync(join(REPO_ROOT, file), "utf8").includes("ships-npc"),
    );
    expect([...named].sort()).toEqual(
      ["src/app/session/start-session.ts", LOADER].sort(),
    );
  });
});
