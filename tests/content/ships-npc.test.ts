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
  MAX_ESCORT_ROLE_ENTRIES,
  MAX_ESCORT_ROLE_LENGTH,
  MAX_FLIGHT_MAGNITUDE_BOUND,
  MAX_FLIGHT_RATE_BOUND,
  MAX_RECORD_BOUNTY,
  NpcShipCatalogueSchema,
} from "../../src/content/schemas/ship-npc.js";
import {
  MAX_BOUNTY,
  MAX_ENTITY_MAGNITUDE,
  MAX_STEER_RATE,
} from "../../src/sim/world/limits.js";
import { NPC_SHIP_KEYS } from "../../tools/oolite-ingest/convert/npc-ships.js";
import { MODEL_BOUNDS } from "../../tools/oolite-ingest/convert/dat.js";

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
    // Skip the guard probes tests/guards/ writes into src/sim while it runs
    // (they import content on purpose; tests/compliance.test.ts does the same).
    if (entry.name.startsWith("__purity_")) continue;
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
  it("resolves every record, equal to the parsed generated file", async () => {
    const catalogue = await loadNpcCatalogue();
    expect(catalogue.map((record) => record.key)).toEqual([...NPC_SHIP_KEYS]);
    expect(catalogue).toHaveLength(NPC_SHIP_KEYS.length);
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
    expect(() => findNpcShip(catalogue, "nosuchship")).toThrow(/nosuchship/);
  });
});

/** The six hulls that author an aft weapon (plan 21-08) and its equipment key. */
const AFT_ARMED: Readonly<Record<string, string>> = {
  anaconda: "EQ_WEAPON_PULSE_LASER",
  "anaconda-pirate": "EQ_WEAPON_BEAM_LASER",
  boa: "EQ_WEAPON_BEAM_LASER",
  "boa-mk2": "EQ_WEAPON_BEAM_LASER",
  "boa-mk2-pirate": "EQ_WEAPON_BEAM_LASER",
  "boa-pirate": "EQ_WEAPON_BEAM_LASER",
};

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
    for (const field of ["accuracy", "maxFlightYaw", "hasEscapePod"]) {
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

  it("carries likelyCargo and maxCargo on every record", () => {
    for (const record of generated as Record<string, unknown>[]) {
      for (const field of ["likelyCargo", "maxCargo"]) {
        expect(Number.isInteger(record[field])).toBe(true);
        expect(record[field] as number).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rejects a record missing a cargo field or carrying a bad one", () => {
    for (const field of ["likelyCargo", "maxCargo"]) {
      const record = { ...firstRecord() };
      delete record[field];
      expect(accepts([record])).toBe(false);
      for (const value of [
        -1,
        1.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        "1",
      ]) {
        expect(accepts([{ ...firstRecord(), [field]: value }])).toBe(false);
      }
    }
  });

  it("carries the DATA-14 fields on every record", () => {
    for (const record of generated as Record<string, unknown>[]) {
      // Plan 21-08: six hulls author an aft weapon; port and starboard stay refused.
      expect(record["aftWeapon"], String(record["key"])).toBe(
        AFT_ARMED[String(record["key"])] ?? "EQ_WEAPON_NONE",
      );
      for (const field of ["portWeapon", "starboardWeapon"]) {
        expect(record[field]).toBe("EQ_WEAPON_NONE");
      }
      for (const field of [
        "aftWeaponPosition",
        "portWeaponPosition",
        "starboardWeaponPosition",
      ]) {
        expect(record[field]).toHaveLength(3);
      }
      expect(record["fragmentChance"]).toBe(Math.fround(0.9));
      expect(record["explosionType"]).toBeNull();
    }
  });

  it("rejects a record missing a DATA-14 field", () => {
    for (const field of [
      "aftWeapon",
      "portWeapon",
      "starboardWeapon",
      "aftWeaponPosition",
      "portWeaponPosition",
      "starboardWeaponPosition",
      "fragmentChance",
      "explosionType",
    ]) {
      const record = { ...firstRecord() };
      delete record[field];
      expect(accepts([record])).toBe(false);
    }
  });

  it("rejects an unknown aft, port or starboard weapon", () => {
    for (const field of ["aftWeapon", "portWeapon", "starboardWeapon"]) {
      for (const value of ["WEAPON_PULSE_LASER", "EQ_WEAPON_THARGOID", "", 7]) {
        expect(accepts([{ ...firstRecord(), [field]: value }])).toBe(false);
      }
      expect(
        accepts([{ ...firstRecord(), [field]: "EQ_WEAPON_BEAM_LASER" }]),
      ).toBe(true);
    }
  });

  it("rejects a facing position that is not three finite numbers", () => {
    for (const field of [
      "aftWeaponPosition",
      "portWeaponPosition",
      "starboardWeaponPosition",
    ]) {
      for (const value of [[0, 0], [0, Number.NaN, 0], "0 0 0"]) {
        expect(accepts([{ ...firstRecord(), [field]: value }])).toBe(false);
      }
    }
  });

  it("rejects a fragmentChance outside 0..1 or not a number", () => {
    for (const value of [-0.1, 1.1, Number.NaN, "0.9", true]) {
      expect(accepts([{ ...firstRecord(), fragmentChance: value }])).toBe(
        false,
      );
    }
    for (const value of [0, 1, 0.5]) {
      expect(accepts([{ ...firstRecord(), fragmentChance: value }])).toBe(true);
    }
  });

  it("rejects an explosionType that is neither null nor an array of strings", () => {
    for (const value of ["slowcloud", 1, {}, [1], [""], undefined]) {
      expect(accepts([{ ...firstRecord(), explosionType: value }])).toBe(false);
    }
    for (const value of [null, [], ["oolite-builtin-slowcloud"]]) {
      expect(accepts([{ ...firstRecord(), explosionType: value }])).toBe(true);
    }
  });

  it("carries laserColor on every record: [1, 0, 1] for the three Viper variants, null for the rest (quick 261119-i9g)", () => {
    const records = generated as Record<string, unknown>[];
    expect(records).toHaveLength(NPC_SHIP_KEYS.length);
    for (const record of records) {
      expect(record["laserColor"]).toEqual(
        ["viper", "viper-interceptor", "viper-pursuit"].includes(
          String(record["key"]),
        )
          ? [1, 0, 1]
          : null,
      );
    }
  });

  it("accepts a laserColor of null or three channels in [0, 1]", () => {
    for (const value of [null, [1, 0, 1], [0, 0, 0], [0.5, 0.25, 1]]) {
      expect(accepts([{ ...firstRecord(), laserColor: value }])).toBe(true);
    }
  });

  it("rejects a record without laserColor and a laserColor that is not a bounded triple or null", () => {
    const record = { ...firstRecord() };
    delete record["laserColor"];
    expect(accepts([record])).toBe(false);
    for (const value of [
      [1.5, 0, 0],
      [-0.1, 0, 0],
      [1, 0],
      [1, 0, 1, 1],
      "magentaColor",
      [Number.NaN, 0, 0],
      undefined,
    ]) {
      expect(accepts([{ ...firstRecord(), laserColor: value }])).toBe(false);
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

  it("rejects a mass above the flight magnitude bound (T-16-31)", () => {
    expect(accepts([{ ...firstRecord(), mass: 1e12 }])).toBe(true);
    for (const mass of [1e12 + 1e6, 1e24, 1e300]) {
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

describe("the hull bounding box (D16-23)", () => {
  const accepts = (records: unknown): boolean =>
    NpcShipCatalogueSchema.safeParse(records).success;
  const box = (): { min: number[]; max: number[] } => {
    const value = firstRecord()["boundingBox"] as {
      min: number[];
      max: number[];
    };
    return { min: [...value.min], max: [...value.max] };
  };
  const withBox = (value: unknown): unknown[] => [
    { ...firstRecord(), boundingBox: value },
  ];

  it("spans each hull's recorded MODEL_BOUNDS within 1e-3 relative", () => {
    for (const record of generated as Record<string, unknown>[]) {
      const value = record["boundingBox"] as { min: number[]; max: number[] };
      const recorded = MODEL_BOUNDS[record["model"] as string];
      expect(recorded, String(record["key"])).toBeDefined();
      if (recorded === undefined) continue;
      const spans = [recorded.x, recorded.y, recorded.z];
      for (let axis = 0; axis < 3; axis++) {
        const min = value.min[axis] ?? Number.NaN;
        const max = value.max[axis] ?? Number.NaN;
        const want = spans[axis] ?? Number.NaN;
        expect(min, `${String(record["key"])} ${axis}`).toBeLessThanOrEqual(
          max,
        );
        expect(
          Math.abs(max - min - want),
          `${String(record["key"])} axis ${axis}`,
        ).toBeLessThanOrEqual(1e-3 * Math.max(1, Math.abs(want)));
      }
    }
  });

  it("accepts the generated box and a flat one (min equal to max)", () => {
    expect(accepts(withBox(box()))).toBe(true);
    const flat = box();
    flat.max[1] = flat.min[1] ?? 0;
    expect(accepts(withBox(flat))).toBe(true);
  });

  it("rejects a record without a boundingBox", () => {
    const record = { ...firstRecord() };
    delete record["boundingBox"];
    expect(accepts([record])).toBe(false);
  });

  it("rejects a non-finite or malformed corner", () => {
    for (const corner of ["min", "max"] as const) {
      for (const value of [
        [0, Number.NaN, 0],
        [0, 0, Number.POSITIVE_INFINITY],
        [0, 0],
        [0, 0, 0, 0],
        "0 0 0",
      ]) {
        expect(accepts(withBox({ ...box(), [corner]: value }))).toBe(false);
      }
    }
  });

  it("rejects an extra key inside the box", () => {
    expect(accepts(withBox({ ...box(), centre: [0, 0, 0] }))).toBe(false);
  });

  it("rejects min above max on any axis", () => {
    for (let axis = 0; axis < 3; axis++) {
      const swapped = box();
      swapped.min[axis] = (swapped.max[axis] ?? 0) + 1;
      expect(accepts(withBox(swapped)), `axis ${axis}`).toBe(false);
    }
  });
});

describe("NpcShipSchema role fields (DATA-17, plan 21-05)", () => {
  const accepts = (records: unknown): boolean =>
    NpcShipCatalogueSchema.safeParse(records).success;
  const withField = (field: string, value: unknown): unknown[] => [
    { ...firstRecord(), [field]: value },
  ];

  it("carries every new field on every generated record", () => {
    const fields = [
      "bounty",
      "autoAi",
      "autoWeapons",
      "hasScoop",
      "hasFuelInjection",
      "fuel",
      "scoopPosition",
      "countsAsKill",
      "escorts",
      "escortRoles",
      "missiles",
      "maxMissiles",
    ];
    for (const record of generated as Record<string, unknown>[]) {
      for (const field of fields) expect(record).toHaveProperty(field);
    }
  });

  it("bounds the fuzzy probabilities to 0..1", () => {
    for (const field of [
      "autoAi",
      "autoWeapons",
      "hasScoop",
      "hasFuelInjection",
    ]) {
      expect(accepts(withField(field, 0))).toBe(true);
      expect(accepts(withField(field, 1))).toBe(true);
      expect(accepts(withField(field, 0.5))).toBe(true);
      expect(accepts(withField(field, 1.1))).toBe(false);
      expect(accepts(withField(field, -0.1))).toBe(false);
      expect(accepts(withField(field, Number.NaN))).toBe(false);
      expect(accepts(withField(field, true))).toBe(false);
    }
  });

  it("bounds bounty, fuel, escorts and the missile counts", () => {
    expect(accepts(withField("bounty", 65535))).toBe(true);
    expect(accepts(withField("bounty", 65536))).toBe(false);
    expect(MAX_RECORD_BOUNTY).toBe(MAX_BOUNTY);
    expect(accepts(withField("bounty", -1))).toBe(false);
    expect(accepts(withField("bounty", 1.5))).toBe(false);
    expect(accepts(withField("fuel", 65535))).toBe(true);
    expect(accepts(withField("fuel", 65536))).toBe(false);
    expect(accepts(withField("escorts", 16))).toBe(true);
    expect(accepts(withField("escorts", 17))).toBe(false);
    expect(accepts(withField("escorts", -1))).toBe(false);
    for (const field of ["missiles", "maxMissiles"]) {
      expect(accepts(withField(field, 32))).toBe(true);
      expect(accepts(withField(field, 33))).toBe(false);
      expect(accepts(withField(field, -1))).toBe(false);
    }
  });

  it("accepts escortRoles as null or authored entries, an empty-string role included", () => {
    expect(accepts(withField("escortRoles", null))).toBe(true);
    expect(
      accepts(
        withField("escortRoles", [
          { min: -2, max: 2, role: "escort" },
          { min: 0, max: 2, role: "" },
        ]),
      ),
    ).toBe(true);
    expect(accepts(withField("escortRoles", [{ min: 0, max: 2 }]))).toBe(false);
    expect(
      accepts(withField("escortRoles", [{ min: 0, max: 2, role: 3 }])),
    ).toBe(false);
    expect(
      accepts(
        withField("escortRoles", [{ min: 0, max: 2, role: "a", extra: 1 }]),
      ),
    ).toBe(false);
  });

  it("bounds escortRoles at MAX_ESCORTS entries and each role's length and shape (review APP-WR-02)", () => {
    expect(MAX_ESCORT_ROLE_ENTRIES).toBe(16);
    const entries = (count: number): unknown[] =>
      Array.from({ length: count }, () => ({ min: 0, max: 2, role: "escort" }));
    expect(
      accepts(withField("escortRoles", entries(MAX_ESCORT_ROLE_ENTRIES))),
    ).toBe(true);
    expect(
      accepts(withField("escortRoles", entries(MAX_ESCORT_ROLE_ENTRIES + 1))),
    ).toBe(false);
    const role = (name: string): boolean =>
      accepts(withField("escortRoles", [{ min: 0, max: 2, role: name }]));
    for (const ok of [
      "",
      "escort",
      "escort-heavy",
      "pirate-light-fighter",
      "Escort_2+",
      "a".repeat(MAX_ESCORT_ROLE_LENGTH),
    ]) {
      expect(role(ok), JSON.stringify(ok)).toBe(true);
    }
    for (const bad of [
      "a".repeat(MAX_ESCORT_ROLE_LENGTH + 1),
      "-escort",
      "escort role",
      "escort++",
      "escort(0.5)",
      "[viper]",
    ]) {
      expect(role(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("refuses a record that leaves a new field out or carries an unknown one", () => {
    const without = { ...firstRecord() };
    delete without["countsAsKill"];
    expect(accepts([without])).toBe(false);
    expect(accepts(withField("hasEscapePod", 1))).toBe(false);
    expect(accepts(withField("heatInsulation", 1))).toBe(false);
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
