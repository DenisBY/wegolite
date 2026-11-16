// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC ship records (DATA-10, DATA-11 stage 1, DATA-13, D-02, D-05, D-06).
 *
 * The expected values live in `tests/golden/content/ships-npc.json`, which was
 * written by hand from `shipdata.plist` and is never generated. The compiled
 * records (twenty-seven fields: the Phase 9 six, the Phase 10 `mass`, the Phase 12
 * `radius`, the five Phase 13 combat fields, the four Phase 14 flight fields and
 * the ten Phase 15 DATA-14 fields)
 * are compared with it, with the resolved template parents, and with the committed generated
 * file, so a drift in any one of the four fails.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  NpcShipSchema,
  type NpcShip,
} from "../../../src/content/schemas/ship-npc.js";
import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import type { PlistValue } from "../openstep/plist-value.js";
import { getEntry } from "../openstep/plist-value.js";
import { parseDat } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import { MODEL_SOURCE_FILES, NPC_SHIP_GLBS, shipGlbFile } from "./glb.js";
import {
  DEFAULT_AI_TYPE,
  DEFAULT_ENERGY_RECHARGE_RATE,
  DEFAULT_EXPLOSION_TYPE,
  DEFAULT_FACING_WEAPON,
  DEFAULT_FORWARD_WEAPON,
  DEFAULT_FRAGMENT_CHANCE,
  DEFAULT_LIKELY_CARGO,
  DEFAULT_MAX_CARGO,
  DEFAULT_MAX_ENERGY,
  DEFAULT_MAX_FLIGHT_PITCH,
  DEFAULT_MAX_FLIGHT_ROLL,
  DEFAULT_MAX_FLIGHT_SPEED,
  DEFAULT_SCAN_CLASS,
  DEFAULT_THRUST,
  DEFAULT_WEAPON_FACINGS,
  FORWARD_WEAPON_KEYS,
  NPC_SHIP_KEYS,
  NPC_SHIPS_PATH,
  compileNpcShips,
  emitNpcShips,
  facingWeapon,
} from "./npc-ships.js";
import { computeShipMasses, shipMass } from "./ship-mass.js";
import { computeShipRadii } from "./ship-radius.js";
import { compileShips } from "./ships.js";
import type { ShipCatalogue } from "./ships.js";

const REPO = new URL("../../../", import.meta.url);
const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";

function readText(relative: string): string {
  return readFileSync(new URL(relative, REPO), "utf8");
}

function load(relative: string): PlistValue {
  return parseOpenStep(readText(relative), relative);
}

const shipdata = load(SHIPDATA);
const catalogue: ShipCatalogue = compileShips(shipdata, load(OVERRIDES));

/** Every vendored mesh a GLB is built from, parsed once. */
function loadMeshes(): Record<string, ParsedMesh> {
  const names = new Set<string>();
  for (const files of Object.values(MODEL_SOURCE_FILES)) {
    for (const file of files) names.add(file);
  }
  const meshes: Record<string, ParsedMesh> = {};
  for (const name of [...names].sort()) {
    const file = `third_party/oolite/Models/${name}`;
    meshes[name] = parseDat(readText(file), file);
  }
  return meshes;
}

const meshes = loadMeshes();
const masses = computeShipMasses(NPC_SHIP_KEYS, catalogue, meshes);
const radii = computeShipRadii(NPC_SHIP_KEYS, catalogue, meshes);
const records = compileNpcShips(catalogue, masses, radii);

interface Golden {
  readonly version: number;
  readonly keys: string[];
  readonly fields: string[];
  readonly defaults: {
    readonly aiType: string;
    readonly scanClass: string;
    readonly maxEnergy: number;
    readonly energyRechargeRate: number;
    readonly forwardWeapon: string;
    readonly forwardWeaponPosition: number[];
    readonly maxFlightSpeed: number;
    readonly maxFlightRoll: number;
    readonly maxFlightPitch: number;
    readonly thrust: number;
    readonly likelyCargo: number;
    readonly maxCargo: number;
    readonly weaponFacings: number;
    readonly aftWeapon: string;
    readonly portWeapon: string;
    readonly starboardWeapon: string;
    readonly aftWeaponPosition: number[];
    readonly portWeaponPosition: number[];
    readonly starboardWeaponPosition: number[];
    readonly fragmentChance: number;
    readonly explosionType: string[] | null;
  };
  readonly examples: NpcShip[];
  readonly sources: string[];
}

const golden = JSON.parse(
  readText("tests/golden/content/ships-npc.json"),
) as Golden;

function requireEntry(key: string): ShipCatalogue["entries"][number] {
  const match = catalogue.entries.find((item) => item.key === key);
  if (match === undefined) throw new Error(`catalogue entry "${key}" missing`);
  return match;
}

function requireRecord(key: string): NpcShip {
  const match = records.find((item) => item.key === key);
  if (match === undefined) throw new Error(`NPC record "${key}" missing`);
  return match;
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

function walk(directory: URL, found: string[] = []): string[] {
  for (const name of readdirSync(directory).sort()) {
    const child = new URL(`${name}`, directory);
    if (statSync(child).isDirectory()) {
      walk(new URL(`${name}/`, directory), found);
    } else {
      found.push(name);
    }
  }
  return found;
}

describe("NPC ship records", () => {
  it("holds one record per key, in code-unit order, equal to the golden keys", () => {
    expect(records.map((record) => record.key)).toEqual([...NPC_SHIP_KEYS]);
    expect([...NPC_SHIP_KEYS]).toEqual(golden.keys);
    expect([...NPC_SHIP_KEYS]).toEqual(
      [...NPC_SHIP_KEYS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(records).toHaveLength(9);
  });

  it("carries exactly the twenty-seven fields and passes the strict schema", () => {
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual(golden.fields);
      expect(NpcShipSchema.safeParse(record).success).toBe(true);
    }
  });

  it("pins the compiled defaults to the golden", () => {
    expect(DEFAULT_AI_TYPE).toBe(golden.defaults.aiType);
    expect(DEFAULT_SCAN_CLASS).toBe(golden.defaults.scanClass);
    expect(DEFAULT_MAX_ENERGY).toBe(golden.defaults.maxEnergy);
    expect(DEFAULT_ENERGY_RECHARGE_RATE).toBe(
      golden.defaults.energyRechargeRate,
    );
    expect(DEFAULT_FORWARD_WEAPON).toBe(golden.defaults.forwardWeapon);
    expect(DEFAULT_MAX_FLIGHT_SPEED).toBe(golden.defaults.maxFlightSpeed);
    expect(DEFAULT_MAX_FLIGHT_ROLL).toBe(golden.defaults.maxFlightRoll);
    expect(DEFAULT_MAX_FLIGHT_PITCH).toBe(golden.defaults.maxFlightPitch);
    expect(DEFAULT_THRUST).toBe(golden.defaults.thrust);
    expect(DEFAULT_LIKELY_CARGO).toBe(golden.defaults.likelyCargo);
    expect(DEFAULT_MAX_CARGO).toBe(golden.defaults.maxCargo);
    expect(DEFAULT_WEAPON_FACINGS).toBe(golden.defaults.weaponFacings);
    expect(DEFAULT_FACING_WEAPON).toBe(golden.defaults.aftWeapon);
    expect(DEFAULT_FACING_WEAPON).toBe(golden.defaults.portWeapon);
    expect(DEFAULT_FACING_WEAPON).toBe(golden.defaults.starboardWeapon);
    expect(DEFAULT_FRAGMENT_CHANCE).toBe(golden.defaults.fragmentChance);
    expect(DEFAULT_FRAGMENT_CHANCE).toBe(Math.fround(0.9));
    expect(DEFAULT_EXPLOSION_TYPE).toBe(golden.defaults.explosionType);
  });

  it.each(golden.examples.map((example) => [example.key, example] as const))(
    "compiles %s to the hand-written worked example",
    (key, example) => {
      expect(requireRecord(key)).toEqual(example);
    },
  );

  it("resolves like_ship: each record equals its template parent", () => {
    const root = shipdata;
    if (root.kind !== "dict") throw new Error("shipdata root is not a dict");
    for (const key of NPC_SHIP_KEYS) {
      const raw = getEntry(root, key);
      if (raw === undefined || raw.value.kind !== "dict") {
        throw new Error(`raw shipdata entry "${key}" is not a dictionary`);
      }
      expect(raw.value.entries.map((field) => field.key)).toEqual([
        "like_ship",
      ]);
      const like = getEntry(raw.value, "like_ship");
      expect(like?.value).toMatchObject({
        kind: "string",
        value: `oolite_template_${key}`,
      });

      const template = requireEntry(`oolite_template_${key}`);
      const record = requireRecord(key);
      expect(record.roles).toEqual(template.roles);
      expect(record.model).toBe(template.model);
      expect(record.aiType).toBe(template.extras["ai_type"]);
    }
  });

  it("authors the Viper's scan class and defaults the other eight", () => {
    expect(requireEntry("oolite_template_viper").extras["scan_class"]).toBe(
      "CLASS_POLICE",
    );
    expect(requireRecord("viper").scanClass).toBe("CLASS_POLICE");
    for (const key of NPC_SHIP_KEYS) {
      if (key === "viper") continue;
      expect(requireEntry(`oolite_template_${key}`).extras).not.toHaveProperty(
        "scan_class",
      );
      expect(requireRecord(key).scanClass).toBe(DEFAULT_SCAN_CLASS);
    }
  });

  it("derives each glb from the model and finds the file under public/", () => {
    for (const record of records) {
      expect(record.glb).toBe(`models/${shipGlbFile(record.model)}`);
      expect(existsSync(new URL(`public/${record.glb}`, REPO))).toBe(true);
      expect(NPC_SHIP_GLBS).toContain(record.glb.slice("models/".length));
    }
    expect(
      records.map((record) => record.glb.slice("models/".length)).sort(),
    ).toEqual([...NPC_SHIP_GLBS]);
  });

  it("regenerates the committed file byte for byte", () => {
    const emitted = emitNpcShips(catalogue, masses, radii);
    expect(emitted.path).toBe(NPC_SHIPS_PATH);
    expect(
      Buffer.from(emitted.bytes).equals(
        readFileSync(new URL(NPC_SHIPS_PATH, REPO)),
      ),
    ).toBe(true);
  });

  it("compiles no cargo, rock, wreckage or missile role and ships no audio", () => {
    const forbidden = new Set([
      "1t-cargopod",
      "alloy",
      "asteroid",
      "boulder",
      "cargopod",
      "escape-capsule",
      "missile",
      "oolite-template-cargopod",
      "oolite-wreckage-chunk",
      "rockhermit",
      "rockhermit-chaotic",
      "rockhermit-pirate",
      "splinter",
      "tutorial-asteroid",
      "wreckage",
    ]);
    for (const record of records) {
      for (const role of record.roles) {
        expect(forbidden.has(role.split("(")[0] ?? "")).toBe(false);
      }
    }

    const audio = /\.(ogg|wav|mp3|flac|oga|m4a)$/i;
    for (const root of ["public/", "third_party/oolite/"]) {
      const files = walk(new URL(root, REPO));
      expect(files.filter((name) => audio.test(name))).toEqual([]);
    }
  });

  it("fails naming the key when the catalogue has no viper entry", () => {
    const without: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.filter((entry) => entry.key !== "viper"),
    };
    const error = capture(() => compileNpcShips(without, masses, radii));
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(NPC_SHIPS_PATH);
    expect(error.construct).toBe("viper");
  });

  it("fails when a record's model is a GLB row owned by another key", () => {
    const swapped: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) =>
        entry.key === "viper" ? { ...entry, model: "oolite_adder.dat" } : entry,
      ),
    };
    const error = capture(() => compileNpcShips(swapped, masses, radii));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("viper");
  });

  it("falls back to the Oolite defaults when ai_type and scan_class are absent", () => {
    const bare: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) => {
        if (entry.key !== "viper") return entry;
        const { ai_type: _ai, scan_class: _scan, ...extras } = entry.extras;
        void _ai;
        void _scan;
        return { ...entry, extras };
      }),
    };
    const viper = compileNpcShips(bare, masses, radii).find(
      (item) => item.key === "viper",
    );
    expect(viper?.aiType).toBe(DEFAULT_AI_TYPE);
    expect(viper?.scanClass).toBe(DEFAULT_SCAN_CLASS);
  });

  it("fails when an entry has no roles", () => {
    const noRoles: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) =>
        entry.key === "viper" ? { ...entry, roles: null } : entry,
      ),
    };
    expect(
      capture(() => compileNpcShips(noRoles, masses, radii)).construct,
    ).toBe("viper");
  });

  it("fails naming the mass when a record has none", () => {
    const error = capture(() => compileNpcShips(catalogue, new Map(), radii));
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(NPC_SHIPS_PATH);
    expect(error.construct).toBe("adder.mass");
  });

  it("fails naming the radius when a record has none", () => {
    const error = capture(() => compileNpcShips(catalogue, masses, new Map()));
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(NPC_SHIPS_PATH);
    expect(error.construct).toBe("adder.radius");
  });

  it("fails naming the radius when one is zero", () => {
    const error = capture(() =>
      compileNpcShips(catalogue, masses, new Map([["adder", 0]])),
    );
    expect(error.construct).toBe("adder.radius");
  });

  it("records the radius computeShipRadii computes for each key", () => {
    for (const record of records) {
      expect(record.radius).toBe(radii.get(record.key));
    }
  });

  it("records the mass shipMass computes for each key", () => {
    for (const record of records) {
      expect(record.mass).toBe(shipMass(record.key, catalogue, meshes));
    }
  });

  it("fails naming the field when a value breaks the schema", () => {
    const badScan: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) =>
        entry.key === "viper"
          ? { ...entry, extras: { ...entry.extras, scan_class: "police" } }
          : entry,
      ),
    };
    expect(
      capture(() => compileNpcShips(badScan, masses, radii)).construct,
    ).toBe("viper.scanClass");
  });
});

/** The catalogue with `extras` of one key rewritten. */
function withExtras(
  key: string,
  edit: (extras: Record<string, unknown>) => Record<string, unknown>,
): ShipCatalogue {
  return {
    ...catalogue,
    entries: catalogue.entries.map((entry) =>
      entry.key === key
        ? { ...entry, extras: edit({ ...entry.extras }) }
        : entry,
    ),
  };
}

function compiled(source: ShipCatalogue, key: string): NpcShip {
  const match = compileNpcShips(source, masses, radii).find(
    (item) => item.key === key,
  );
  if (match === undefined) throw new Error(`NPC record "${key}" missing`);
  return match;
}

describe("NPC combat fields (CBT-07, minimum of DATA-15)", () => {
  const EXPECTED: Record<string, readonly [string, number, number, string]> = {
    adder: ["Adder", 85, 2, "EQ_WEAPON_PULSE_LASER"],
    cobramk1: ["Cobra Mark I", 150, 2.5, "EQ_WEAPON_PULSE_LASER"],
    gecko: ["Gecko", 250, 4, "EQ_WEAPON_BEAM_LASER"],
    krait: ["Krait", 250, 2.5, "EQ_WEAPON_BEAM_LASER"],
    mamba: ["Mamba", 240, 3, "EQ_WEAPON_PULSE_LASER"],
    moray: ["Moray Star Boat", 240, 3, "EQ_WEAPON_PULSE_LASER"],
    shuttle: ["Orbital Shuttle", 120, 1, "EQ_WEAPON_NONE"],
    sidewinder: ["Sidewinder Scout Ship", 240, 2, "EQ_WEAPON_PULSE_LASER"],
    viper: ["GalCop Viper", 180, 4, "EQ_WEAPON_BEAM_LASER"],
  };

  it("pins the name, energy and forward weapon of all nine records", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...NPC_SHIP_KEYS]);
    for (const [key, [name, maxEnergy, recharge, weapon]] of Object.entries(
      EXPECTED,
    )) {
      const record = requireRecord(key);
      expect(record.name).toBe(name);
      expect(record.maxEnergy).toBe(maxEnergy);
      expect(record.energyRechargeRate).toBe(recharge);
      expect(record.forwardWeapon).toBe(weapon);
    }
  });

  it("takes the authored name when no display_name is authored", () => {
    for (const key of NPC_SHIP_KEYS) {
      expect(requireEntry(key).extras).not.toHaveProperty("display_name");
      expect(requireRecord(key).name).toBe(requireEntry(key).extras["name"]);
    }
  });

  it("takes display_name over name when it is authored", () => {
    const named = withExtras("viper", (extras) => ({
      ...extras,
      display_name: "Patrol Viper",
    }));
    expect(compiled(named, "viper").name).toBe("Patrol Viper");
  });

  it("records weapon_position_forward as three float32 numbers", () => {
    for (const key of NPC_SHIP_KEYS) {
      const authored = String(
        requireEntry(key).extras["weapon_position_forward"],
      )
        .split(/\s+/)
        .map((part) => Math.fround(Number(part)));
      const position = requireRecord(key).forwardWeaponPosition;
      expect(position).toHaveLength(3);
      expect([...position]).toEqual(authored.map((n) => (n === 0 ? 0 : n)));
      for (const component of position) {
        expect(Math.fround(component)).toBe(component);
        expect(Object.is(component, -0)).toBe(false);
      }
    }
    expect(requireRecord("viper").forwardWeaponPosition).toEqual([
      0,
      Math.fround(-0.15),
      Math.fround(35.0344),
    ]);
  });

  it("takes Oolite's defaults when the keys are absent", () => {
    const bare = withExtras("viper", (extras) => {
      delete extras["max_energy"];
      delete extras["energy_recharge_rate"];
      delete extras["forward_weapon_type"];
      delete extras["weapon_position_forward"];
      return extras;
    });
    const viper = compiled(bare, "viper");
    expect(viper.maxEnergy).toBe(200);
    expect(viper.energyRechargeRate).toBe(1);
    expect(viper.forwardWeapon).toBe("EQ_WEAPON_NONE");
    expect(viper.forwardWeaponPosition).toEqual([0, 0, 0]);
  });

  it("maps the four laser types and WEAPON_NONE to the equipment keys", () => {
    expect(FORWARD_WEAPON_KEYS).toEqual({
      WEAPON_NONE: "EQ_WEAPON_NONE",
      WEAPON_PULSE_LASER: "EQ_WEAPON_PULSE_LASER",
      WEAPON_BEAM_LASER: "EQ_WEAPON_BEAM_LASER",
      WEAPON_MINING_LASER: "EQ_WEAPON_MINING_LASER",
      WEAPON_MILITARY_LASER: "EQ_WEAPON_MILITARY_LASER",
    });
    for (const [type, key] of Object.entries(FORWARD_WEAPON_KEYS)) {
      const swapped = withExtras("viper", (extras) => ({
        ...extras,
        forward_weapon_type: type,
      }));
      expect(compiled(swapped, "viper").forwardWeapon).toBe(key);
    }
  });

  it("fails the build with SCHEMA on an unknown forward_weapon_type", () => {
    for (const type of [
      "WEAPON_THARGOID",
      "EQ_WEAPON_PULSE_LASER",
      "toString",
      7,
    ]) {
      const bad = withExtras("viper", (extras) => ({
        ...extras,
        forward_weapon_type: type,
      }));
      const error = capture(() => compileNpcShips(bad, masses, radii));
      expect(error.code).toBe("SCHEMA");
      expect(error.file).toBe(NPC_SHIPS_PATH);
      expect(error.construct).toBe("viper");
    }
  });

  it("fails the build on a malformed position or a non-numeric energy", () => {
    for (const position of ["1 2", "1 2 3 4", "a b c", 5]) {
      const bad = withExtras("viper", (extras) => ({
        ...extras,
        weapon_position_forward: position,
      }));
      expect(capture(() => compileNpcShips(bad, masses, radii)).code).toBe(
        "SCHEMA",
      );
    }
    for (const field of ["max_energy", "energy_recharge_rate"]) {
      const bad = withExtras("viper", (extras) => ({
        ...extras,
        [field]: "lots",
      }));
      expect(capture(() => compileNpcShips(bad, masses, radii)).code).toBe(
        "SCHEMA",
      );
    }
  });

  it("fails naming the field when an energy value breaks the schema", () => {
    const negative = withExtras("viper", (extras) => ({
      ...extras,
      max_energy: -1,
    }));
    expect(
      capture(() => compileNpcShips(negative, masses, radii)).construct,
    ).toBe("viper.maxEnergy");
  });
});

describe("NPC flight fields (AI-01, minimum of DATA-15)", () => {
  // The authored plist values (shipdata.plist, the nine templates), as plain
  // numbers; the record holds their float32.
  const EXPECTED: Record<string, readonly [number, number, number, number]> = {
    adder: [240, 2.8, 2, 30],
    cobramk1: [260, 2, 1.2, 25],
    gecko: [300, 3, 1.5, 45],
    krait: [300, 2.75, 1.5, 35],
    mamba: [320, 2.1, 1.4, 32],
    moray: [300, 2.5, 1.5, 32],
    shuttle: [80, 2, 0.9, 16],
    sidewinder: [370, 2.8, 1.6, 37],
    viper: [320, 2.8, 1.8, 32],
  };

  it("pins the speed, roll, pitch and thrust of all nine records as float32", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...NPC_SHIP_KEYS]);
    for (const [key, [speed, roll, pitch, thrust]] of Object.entries(
      EXPECTED,
    )) {
      const record = requireRecord(key);
      expect(record.maxFlightSpeed).toBe(Math.fround(speed));
      expect(record.maxFlightRoll).toBe(Math.fround(roll));
      expect(record.maxFlightPitch).toBe(Math.fround(pitch));
      expect(record.thrust).toBe(Math.fround(thrust));
    }
  });

  it("reads each value from the resolved plist entry, not from the table above", () => {
    for (const key of NPC_SHIP_KEYS) {
      const extras = requireEntry(key).extras;
      const record = requireRecord(key);
      expect(record.maxFlightSpeed).toBe(
        Math.fround(Number(extras["max_flight_speed"])),
      );
      expect(record.maxFlightRoll).toBe(
        Math.fround(Number(extras["max_flight_roll"])),
      );
      expect(record.maxFlightPitch).toBe(
        Math.fround(Number(extras["max_flight_pitch"])),
      );
      expect(record.thrust).toBe(Math.fround(Number(extras["thrust"])));
    }
  });

  it("takes Oolite's defaults 160, 2.0, 1.0 and 15.0 when the keys are absent", () => {
    const bare = withExtras("viper", (extras) => {
      delete extras["max_flight_speed"];
      delete extras["max_flight_roll"];
      delete extras["max_flight_pitch"];
      delete extras["thrust"];
      return extras;
    });
    const viper = compiled(bare, "viper");
    expect(viper.maxFlightSpeed).toBe(160);
    expect(viper.maxFlightRoll).toBe(2);
    expect(viper.maxFlightPitch).toBe(1);
    expect(viper.thrust).toBe(15);
  });

  it("fails the build with SCHEMA on a non-finite or non-numeric flight field", () => {
    for (const field of [
      "max_flight_speed",
      "max_flight_roll",
      "max_flight_pitch",
      "thrust",
    ]) {
      for (const value of ["fast", Number.NaN, Number.POSITIVE_INFINITY]) {
        const bad = withExtras("viper", (extras) => ({
          ...extras,
          [field]: value,
        }));
        const error = capture(() => compileNpcShips(bad, masses, radii));
        expect(error.code).toBe("SCHEMA");
        expect(error.file).toBe(NPC_SHIPS_PATH);
        expect(error.construct).toBe("viper");
      }
    }
  });

  it("fails naming the field when a flight value is negative", () => {
    const negative = withExtras("viper", (extras) => ({
      ...extras,
      max_flight_speed: -1,
    }));
    expect(
      capture(() => compileNpcShips(negative, masses, radii)).construct,
    ).toBe("viper.maxFlightSpeed");
  });
});

describe("NPC cargo fields (DATA-14, D-06)", () => {
  // The authored plist values (shipdata.plist, the nine templates); an absent
  // key is Oolite's default 0 (oo_unsignedIntForKey, ShipEntity.m:566, :378).
  const EXPECTED: Record<string, readonly [number, number]> = {
    adder: [2, 5],
    cobramk1: [10, 10],
    gecko: [3, 3],
    krait: [2, 2],
    mamba: [3, 4],
    moray: [5, 7],
    shuttle: [0, 30],
    sidewinder: [0, 0],
    viper: [0, 0],
  };

  it("pins likelyCargo and maxCargo of all nine records", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...NPC_SHIP_KEYS]);
    for (const [key, [likely, max]] of Object.entries(EXPECTED)) {
      const record = requireRecord(key);
      expect(record.likelyCargo).toBe(likely);
      expect(record.maxCargo).toBe(max);
    }
  });

  it("reads each value from the resolved plist entry, not from the table above", () => {
    for (const key of NPC_SHIP_KEYS) {
      const extras = requireEntry(key).extras;
      const record = requireRecord(key);
      expect(record.likelyCargo).toBe(Number(extras["likely_cargo"] ?? 0));
      expect(record.maxCargo).toBe(Number(extras["max_cargo"] ?? 0));
    }
  });

  it("takes the default 0 when the keys are absent", () => {
    const bare = withExtras("adder", (extras) => {
      delete extras["likely_cargo"];
      delete extras["max_cargo"];
      return extras;
    });
    const adder = compiled(bare, "adder");
    expect(adder.likelyCargo).toBe(0);
    expect(adder.maxCargo).toBe(0);
  });

  it("fails the build naming the key and field on a malformed authored value", () => {
    for (const field of ["likely_cargo", "max_cargo"]) {
      for (const value of [-1, 1.5, "3", Number.NaN, 2 ** 53]) {
        const bad = withExtras("adder", (extras) => ({
          ...extras,
          [field]: value,
        }));
        const error = capture(() => compileNpcShips(bad, masses, radii));
        expect(error.code).toBe("SCHEMA");
        expect(error.file).toBe(NPC_SHIPS_PATH);
        expect(error.construct).toBe("adder");
        expect(error.excerpt).toContain(field);
      }
    }
  });
});

describe("NPC weapon facings, fragment chance and explosion type (DATA-14)", () => {
  // [weapon_facings authored (undefined = absent), aft, port, starboard]
  // positions as authored in shipdata.plist; the record holds their float32.
  const POSITIONS: Record<string, readonly [string, string, string]> = {
    adder: ["0.0 0.0 -22.5", "-15.0 0.0 -14.5", "15.0 0.0 -14.5"],
    cobramk1: ["0.0 0.0 -27.5", "-35.0 -1.0 0.5", "35.0 -1.0 0.5"],
    gecko: [
      "0.0 5.54957 -12.1558",
      "-13.75 -2.0625 -1.875",
      "13.75 -2.0625 -1.875",
    ],
    krait: ["0.0 0.0 -34.6", "-45.0 0.0 -13.5", "45.0 0.0 -13.5"],
    mamba: ["0.0 1.5184 -30.3193", "-16.5 -3.0 0.0", "16.5 -3.0 0.0"],
    moray: ["0.0 -2.554795 -27.78225", "-30.0 -2.0 6.25", "30.0 -2.0 6.25"],
    shuttle: ["0.0 0.0 -17.5", "-9.0 0.0 11.5", "9.0 0.0 11.5"],
    sidewinder: ["0.0 -6.5 -17.5", "-24.25 0.0 0.0", "24.25 0.0 0.0"],
    viper: ["0.0 0.0 -27.5", "-12.5 0.0 0.0", "12.5 0.0 0.0"],
  };
  const MASKS: Record<string, number> = {
    adder: 1,
    cobramk1: 3,
    gecko: 1,
    krait: 1,
    mamba: 1,
    moray: 15,
    shuttle: 0,
    sidewinder: 1,
    viper: 1,
  };
  const float32 = (text: string): number[] =>
    text.split(/\s+/).map((part) => {
      const single = Math.fround(Number(part));
      return single === 0 ? 0 : single;
    });

  it("pins the three new positions of all nine records as float32", () => {
    expect(Object.keys(POSITIONS).sort()).toEqual([...NPC_SHIP_KEYS]);
    for (const [key, [aft, port, starboard]] of Object.entries(POSITIONS)) {
      const record = requireRecord(key);
      expect([...record.aftWeaponPosition]).toEqual(float32(aft));
      expect([...record.portWeaponPosition]).toEqual(float32(port));
      expect([...record.starboardWeaponPosition]).toEqual(float32(starboard));
      for (const component of [
        ...record.aftWeaponPosition,
        ...record.portWeaponPosition,
        ...record.starboardWeaponPosition,
      ]) {
        expect(Math.fround(component)).toBe(component);
        expect(Object.is(component, -0)).toBe(false);
      }
    }
  });

  it("reads each position and mask from the resolved plist entry", () => {
    for (const key of NPC_SHIP_KEYS) {
      const extras = requireEntry(key).extras;
      expect(extras["weapon_facings"]).toBe(MASKS[key]);
      for (const [field, text] of [
        ["weapon_position_aft", POSITIONS[key]?.[0]],
        ["weapon_position_port", POSITIONS[key]?.[1]],
        ["weapon_position_starboard", POSITIONS[key]?.[2]],
      ] as const) {
        expect(extras[field]).toBe(text);
      }
    }
  });

  it("compiles every facing of the nine records to the facing default", () => {
    for (const record of records) {
      expect(record.aftWeapon).toBe("EQ_WEAPON_NONE");
      expect(record.portWeapon).toBe("EQ_WEAPON_NONE");
      expect(record.starboardWeapon).toBe("EQ_WEAPON_NONE");
    }
  });

  it("keeps the nine forward weapons unchanged by the facing mask", () => {
    const FORWARD: Record<string, string> = {
      adder: "EQ_WEAPON_PULSE_LASER",
      cobramk1: "EQ_WEAPON_PULSE_LASER",
      gecko: "EQ_WEAPON_BEAM_LASER",
      krait: "EQ_WEAPON_BEAM_LASER",
      mamba: "EQ_WEAPON_PULSE_LASER",
      moray: "EQ_WEAPON_PULSE_LASER",
      shuttle: "EQ_WEAPON_NONE",
      sidewinder: "EQ_WEAPON_PULSE_LASER",
      viper: "EQ_WEAPON_BEAM_LASER",
    };
    for (const [key, weapon] of Object.entries(FORWARD)) {
      expect(requireRecord(key).forwardWeapon).toBe(weapon);
    }
  });

  it("gives the shuttle (mask 0, the one template without bit 1) four EQ_WEAPON_NONE facings", () => {
    expect(requireEntry("shuttle").extras["weapon_facings"]).toBe(0);
    const shuttle = requireRecord("shuttle");
    expect(shuttle.forwardWeapon).toBe("EQ_WEAPON_NONE");
    expect(shuttle.aftWeapon).toBe("EQ_WEAPON_NONE");
    expect(shuttle.portWeapon).toBe("EQ_WEAPON_NONE");
    expect(shuttle.starboardWeapon).toBe("EQ_WEAPON_NONE");
    for (const key of NPC_SHIP_KEYS) {
      if (key === "shuttle") continue;
      expect(Number(requireEntry(key).extras["weapon_facings"]) & 1).toBe(1);
    }
  });

  it("gates the forward weapon by the weapon_facings mask", () => {
    for (const mask of [0, 14]) {
      const gated = withExtras("viper", (extras) => ({
        ...extras,
        weapon_facings: mask,
        forward_weapon_type: "WEAPON_BEAM_LASER",
      }));
      expect(compiled(gated, "viper").forwardWeapon).toBe("EQ_WEAPON_NONE");
    }
    const open = withExtras("viper", (extras) => {
      delete extras["weapon_facings"];
      return { ...extras, forward_weapon_type: "WEAPON_BEAM_LASER" };
    });
    expect(compiled(open, "viper").forwardWeapon).toBe("EQ_WEAPON_BEAM_LASER");
    const masked = withExtras("viper", (extras) => ({
      ...extras,
      weapon_facings: 17,
      forward_weapon_type: "WEAPON_BEAM_LASER",
    }));
    expect(compiled(masked, "viper").forwardWeapon).toBe(
      "EQ_WEAPON_BEAM_LASER",
    );
  });

  it("fails the build naming the key and field on a negative or malformed weapon_facings (the documented narrowing of Oolite's signed read)", () => {
    for (const value of [-1, 1.5, "15"]) {
      const bad = withExtras("viper", (extras) => ({
        ...extras,
        weapon_facings: value,
      }));
      const error = capture(() => compileNpcShips(bad, masses, radii));
      expect(error.code).toBe("SCHEMA");
      expect(error.construct).toBe("viper");
      expect(error.excerpt).toContain("weapon_facings");
    }
  });

  it("maps the aft, port and starboard types through facingWeapon", () => {
    const extras = {
      aft_weapon_type: "WEAPON_BEAM_LASER",
      port_weapon_type: "WEAPON_PULSE_LASER",
      starboard_weapon_type: "WEAPON_MILITARY_LASER",
    };
    expect(facingWeapon("k", extras, 15, 2, "aft_weapon_type")).toBe(
      "EQ_WEAPON_BEAM_LASER",
    );
    expect(facingWeapon("k", extras, 15, 4, "port_weapon_type")).toBe(
      "EQ_WEAPON_PULSE_LASER",
    );
    expect(facingWeapon("k", extras, 15, 8, "starboard_weapon_type")).toBe(
      "EQ_WEAPON_MILITARY_LASER",
    );
    // With only the forward bit set, each of the three reads the default.
    expect(facingWeapon("k", extras, 1, 2, "aft_weapon_type")).toBe(
      "EQ_WEAPON_NONE",
    );
    expect(facingWeapon("k", extras, 1, 4, "port_weapon_type")).toBe(
      "EQ_WEAPON_NONE",
    );
    expect(facingWeapon("k", extras, 1, 8, "starboard_weapon_type")).toBe(
      "EQ_WEAPON_NONE",
    );
    // An absent key with the bit set is the default too.
    expect(facingWeapon("k", {}, 15, 2, "aft_weapon_type")).toBe(
      "EQ_WEAPON_NONE",
    );
    const error = capture(() =>
      facingWeapon(
        "k",
        { aft_weapon_type: "WEAPON_THARGOID_LASER" },
        15,
        2,
        "aft_weapon_type",
      ),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("k");
    expect(error.excerpt).toContain("aft_weapon_type");
  });

  it("takes fragment_chance as float32, 0.9 by default, and refuses a bad value", () => {
    for (const record of records) {
      expect(record.fragmentChance).toBe(Math.fround(0.9));
      expect(requireEntry(record.key).extras).not.toHaveProperty(
        "fragment_chance",
      );
    }
    const half = withExtras("viper", (extras) => ({
      ...extras,
      fragment_chance: 0.5,
    }));
    expect(compiled(half, "viper").fragmentChance).toBe(0.5);
    const tenth = withExtras("viper", (extras) => ({
      ...extras,
      fragment_chance: 0.1,
    }));
    expect(compiled(tenth, "viper").fragmentChance).toBe(Math.fround(0.1));

    const high = withExtras("viper", (extras) => ({
      ...extras,
      fragment_chance: 2,
    }));
    expect(capture(() => compileNpcShips(high, masses, radii)).construct).toBe(
      "viper.fragmentChance",
    );
    for (const value of [true, "0.5"]) {
      const bad = withExtras("viper", (extras) => ({
        ...extras,
        fragment_chance: value,
      }));
      const error = capture(() => compileNpcShips(bad, masses, radii));
      expect(error.code).toBe("SCHEMA");
      expect(error.construct).toBe("viper");
      expect(error.excerpt).toContain("fragment_chance");
    }
  });

  it("takes explosion_type as null when absent, the array when authored, and refuses anything else", () => {
    for (const record of records) {
      expect(record.explosionType).toBeNull();
      expect(requireEntry(record.key).extras).not.toHaveProperty(
        "explosion_type",
      );
    }
    const authored = withExtras("viper", (extras) => ({
      ...extras,
      explosion_type: ["oolite-builtin-slowcloud", "oolite-builtin-flash"],
    }));
    expect(compiled(authored, "viper").explosionType).toEqual([
      "oolite-builtin-slowcloud",
      "oolite-builtin-flash",
    ]);
    // An authored empty array stays an empty array: Oolite treats it as
    // distinct from the nil an absent key gives (ShipEntity.m:491).
    const empty = withExtras("viper", (extras) => ({
      ...extras,
      explosion_type: [],
    }));
    expect(compiled(empty, "viper").explosionType).toEqual([]);
    for (const value of [
      "oolite-builtin-slowcloud",
      [1],
      { a: 1 },
      ["ok", ""],
    ]) {
      const bad = withExtras("viper", (extras) => ({
        ...extras,
        explosion_type: value,
      }));
      const error = capture(() => compileNpcShips(bad, masses, radii));
      expect(error.code).toBe("SCHEMA");
      expect(error.file).toBe(NPC_SHIPS_PATH);
      expect(error.construct.startsWith("viper")).toBe(true);
    }
  });

  it("reads a malformed aft, port or starboard position as a build failure naming the key", () => {
    for (const field of [
      "weapon_position_aft",
      "weapon_position_port",
      "weapon_position_starboard",
    ]) {
      const bad = withExtras("viper", (extras) => ({
        ...extras,
        [field]: "1 2",
      }));
      const error = capture(() => compileNpcShips(bad, masses, radii));
      expect(error.code).toBe("SCHEMA");
      expect(error.construct).toBe("viper");
      expect(error.excerpt).toContain(field);
    }
  });
});

describe("NPC steering assumptions (AI-01, T-14-06)", () => {
  // The Phase 14 steering port relies on Oolite's defaults for these keys
  // (14-RESEARCH, reachability analysis and Assumptions A1 and A2): a pin that
  // authors one for a compiled ship must fail the build, not change silently
  // which attack branches are reachable.
  const REFUSED: readonly (readonly [string, unknown])[] = [
    ["accuracy", 7],
    ["reaction_time", 0.5],
    ["scanner_range", 50000],
    ["aft_weapon_type", "WEAPON_BEAM_LASER"],
    ["port_weapon_type", "WEAPON_PULSE_LASER"],
    ["starboard_weapon_type", "WEAPON_PULSE_LASER"],
  ];

  it("pins the six refused keys", () => {
    expect(REFUSED.map(([key]) => key)).toEqual([
      "accuracy",
      "reaction_time",
      "scanner_range",
      "aft_weapon_type",
      "port_weapon_type",
      "starboard_weapon_type",
    ]);
  });

  it.each(REFUSED.map(([key, value]) => [key, value] as const))(
    "fails the build with SCHEMA when a record authors %s",
    (field, value) => {
      const bad = withExtras("viper", (extras) => ({
        ...extras,
        [field]: value,
      }));
      const error = capture(() => compileNpcShips(bad, masses, radii));
      expect(error.code).toBe("SCHEMA");
      expect(error.file).toBe(NPC_SHIPS_PATH);
      expect(error.construct).toBe("viper");
      expect(error.excerpt).toContain(field);
      expect(error.excerpt).toContain("steering");
    },
  );

  it("refuses the key whatever its value, even one equal to Oolite's default", () => {
    const bad = withExtras("adder", (extras) => ({
      ...extras,
      accuracy: -100,
    }));
    expect(capture(() => compileNpcShips(bad, masses, radii)).construct).toBe(
      "adder",
    );
  });

  it("finds none of the six keys on the nine stock records after like_ship", () => {
    for (const key of NPC_SHIP_KEYS) {
      for (const [field] of REFUSED) {
        expect(requireEntry(key).extras).not.toHaveProperty(field);
      }
    }
  });

  it("leaves has_fuel_injection and missiles uncompiled", () => {
    const source = readFileSync(
      new URL("tools/oolite-ingest/convert/npc-ships.ts", REPO),
      "utf8",
    );
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
      .join("\n");
    expect(code).not.toMatch(/has_fuel_injection|"missiles"/);
    for (const record of records) {
      expect(record).not.toHaveProperty("hasFuelInjection");
      expect(record).not.toHaveProperty("missiles");
    }
  });
});
