// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save schema v5 contract (Phase 19, D-11, SAVE-09; plans 19-06 to 19-08)
 * and the historical classification.
 *
 * The file began as the v4 suite (Phase 13, CBT-05; plan 13-06: `laserMounts`,
 * the laser fitted to each of the four facings) and moved here with the bump.
 * v5 adds exactly one required field to v4: `damagedEquipment`, the damaged
 * items in damage order. Since Phase 19 there is no migration: every checked-in
 * historical save older than `SAVE_VERSION` is `corrupt`, and the goldens in
 * `tests/golden/save/` are the real saves that prove it. Expected values come
 * from the Cobra's stock fit (`forward_weapon_type = WEAPON_PULSE_LASER`, no
 * other facing) and from the decisions, never from running the code twice.
 */

import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  profileFromSave,
  snapshotForSave,
} from "../../src/persistence/autosave.js";
import {
  MAX_SAVE_BERTHS,
  MAX_SAVE_CARGO_ENTRIES,
  MAX_SAVE_CARGO_QUANTITY,
  MAX_SAVE_CHARS,
  MAX_SAVE_CLOCK_DELTA,
  MAX_SAVE_CREDITS,
  MAX_SAVE_DAMAGED_EQUIPMENT,
  MAX_SAVE_EPOCH,
  MAX_SAVE_EQUIPMENT,
  MAX_SAVE_EQUIPMENT_KEY_CHARS,
  MAX_SAVE_FUEL,
  MAX_SAVE_MARKET_GOODS,
  MAX_SAVE_MISSILES,
  MAX_SAVE_NEXT_ENTITY_ID,
  MAX_SAVE_STATION_KEY_CHARS,
  MAX_SAVE_SYSTEM_ID_CHARS,
  SAVE_VERSION,
  SaveV5Schema,
  encodeSave,
  equipmentAllowLists,
  isEncodedSaveValid,
  parseSave,
} from "../../src/persistence/save.js";
import type { SaveAllowLists, SaveInputs } from "../../src/persistence/save.js";
import { DEFAULT_LASER_MOUNTS, NO_LASER } from "../../src/sim/combat/mounts.js";
import type { LaserMounts } from "../../src/sim/combat/mounts.js";
import {
  MARKET_LIMIT,
  generateMarket,
  marketSeedForSystem,
} from "../../src/sim/economy/market.js";
import { CLOCK_START, initFlightState } from "../../src/sim/flight/state.js";
import { DAMAGEABLE_EQUIPMENT_KEYS } from "../../src/sim/player/outfitting.js";
import { newProfile } from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import { loadEquipment } from "../../src/content/equipment.js";
import { commoditiesFixture } from "../helpers/commodities.js";
import { laveFixture } from "../helpers/lave.js";

const lave = laveFixture();
const catalogue = commoditiesFixture();
const LAVE_SEED = marketSeedForSystem("g0-s7");
const laveMarket = generateMarket(lave.system, catalogue, LAVE_SEED);

const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
  damageableEquipment: new Set(["EQ_DOCK_COMP", "EQ_ADVANCED_COMPASS"]),
  systems: new Set(["g0-s7", "g0-s1"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map(
    catalogue
      .filter((commodity) => commodity.tradeable)
      .map((commodity) => [commodity.key, commodity.unit]),
  ),
  marketGoods: new Set(catalogue.map((commodity) => commodity.key)),
};

function snapshot(profile: PlayerProfile) {
  return snapshotForSave(
    initFlightState(lave.layout),
    profile,
    lave.system,
    { key: "coriolis-station" },
    laveMarket,
    catalogue,
    { epoch: 0, anchorNextEntityId: undefined },
  );
}

describe("laser mounts and damaged equipment through a v5 save (tracer)", () => {
  it("a new game carries the Cobra's stock fit: a pulse laser fore, nothing elsewhere", () => {
    const mounts = newProfile().laserMounts;
    expect(mounts).toEqual(DEFAULT_LASER_MOUNTS);
    expect(mounts).toEqual({
      fore: "EQ_WEAPON_PULSE_LASER",
      aft: NO_LASER,
      port: NO_LASER,
      starboard: NO_LASER,
    });
    // Every profile owns its copy: no two share a mounts object.
    expect(mounts).not.toBe(DEFAULT_LASER_MOUNTS);
    expect(newProfile().laserMounts).not.toBe(mounts);
  });

  it("the version this build writes is 5", () => {
    expect(SAVE_VERSION).toBe(5);
  });

  it("a beam laser on aft survives encodeSave, parseSave and profileFromSave", () => {
    const mounts: LaserMounts = {
      fore: "EQ_WEAPON_PULSE_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
      port: NO_LASER,
      starboard: NO_LASER,
    };
    const profile: PlayerProfile = { ...newProfile(), laserMounts: mounts };
    const inputs = snapshot(profile);
    expect(inputs.laserMounts).toEqual(mounts);

    const encoded = encodeSave(inputs);
    expect(encoded.startsWith(`{"version":${String(SAVE_VERSION)},`)).toBe(
      true,
    );
    expect(isEncodedSaveValid(encoded, ALLOW)).toBe(true);

    const parsed = parseSave(encoded, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.version).toBe(SAVE_VERSION);
    expect(parsed.save.laserMounts).toEqual(mounts);

    const restored = profileFromSave(parsed.save);
    expect(restored.laserMounts).toEqual(mounts);
    // The restored profile owns a copy, not the parsed save's object.
    expect(restored.laserMounts).not.toBe(parsed.save.laserMounts);
    // A second snapshot of the restored profile is the same bytes.
    expect(encodeSave(snapshot(restored))).toBe(encoded);
  });

  it("one damaged docking computer survives snapshot, encode, parse and restore", () => {
    const profile: PlayerProfile = {
      ...newProfile(),
      equipment: ["EQ_CARGO_BAY"],
      damagedEquipment: ["EQ_DOCK_COMP"],
    };
    const allow: SaveAllowLists = {
      ...ALLOW,
      equipment: new Set([...ALLOW.equipment, "EQ_CARGO_BAY"]),
    };
    const inputs = snapshot(profile);
    expect(inputs.damagedEquipment).toEqual(["EQ_DOCK_COMP"]);

    const encoded = encodeSave(inputs);
    expect(encoded.startsWith(`{"version":${String(SAVE_VERSION)},`)).toBe(
      true,
    );
    expect(encoded).toContain('"damagedEquipment":["EQ_DOCK_COMP"]');

    const parsed = parseSave(encoded, allow);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = profileFromSave(parsed.save);
    expect(restored.equipment).toEqual(["EQ_CARGO_BAY"]);
    expect(restored.damagedEquipment).toEqual(["EQ_DOCK_COMP"]);
    // The restored profile owns a copy, and a second snapshot is the same bytes.
    expect(restored.damagedEquipment).not.toBe(parsed.save.damagedEquipment);
    expect(encodeSave(snapshot(restored))).toBe(encoded);
  });
});

describe("the equipment allow-lists of the boot (D-03)", () => {
  it("over the compiled catalogue: damageable is the one damageable set, equipment is the F3 keys and the two aliases", async () => {
    const catalogue = await loadEquipment();
    const lists = equipmentAllowLists(catalogue);
    expect([...lists.damageableEquipment].sort()).toEqual(
      [...DAMAGEABLE_EQUIPMENT_KEYS].sort(),
    );
    expect([...lists.equipment].sort()).toEqual(
      [
        "EQ_ADVANCED_COMPASS",
        "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
        "EQ_CARGO_BAY",
        "EQ_DOCK_COMP",
        "EQ_GAL_DRIVE",
        "EQ_MISSILE",
        "EQ_PASSENGER_BERTH",
      ].sort(),
    );
  });

  it("every installable key the roll could damage is in the damageable set (non-vacuous)", async () => {
    const catalogue = await loadEquipment();
    const lists = equipmentAllowLists(catalogue);
    const damaging = catalogue.filter(
      (item) => lists.equipment.has(item.key) && item.damageProbability > 0,
    );
    expect(damaging.map((item) => item.key)).toContain("EQ_DOCK_COMP");
    for (const item of damaging) {
      expect(lists.damageableEquipment.has(item.key)).toBe(true);
    }
  });

  it("a catalogue without an item leaves it out of both lists", () => {
    const lists = equipmentAllowLists([{ key: "EQ_CARGO_BAY" }]);
    expect([...lists.equipment]).toEqual(["EQ_CARGO_BAY"]);
    expect([...lists.damageableEquipment]).toEqual([]);
  });

  it.each(["EQ_ECM", "EQ_WEAPON_PULSE_LASER", "EQ_FUEL"])(
    "under the production lists a blob with %s in equipment, or in damagedEquipment, is corrupt",
    async (key) => {
      const catalogue = await loadEquipment();
      const allow: SaveAllowLists = {
        ...ALLOW,
        ...equipmentAllowLists(catalogue),
      };
      expect(parseSave(JSON.stringify(validV5()), allow).ok).toBe(true);
      expect(
        parseSave(JSON.stringify(validV5({ equipment: [key] })), allow),
      ).toEqual({ ok: false, reason: "corrupt" });
      expect(
        parseSave(JSON.stringify(validV5({ damagedEquipment: [key] })), allow),
      ).toEqual({ ok: false, reason: "corrupt" });
    },
  );
});

/** Read a checked-in golden from tests/golden/save. */
function readGolden(name: string): string {
  return readFileSync(
    new URL(`../golden/save/${name}`, import.meta.url),
    "utf8",
  );
}

/**
 * The commodity keys the golden market snapshots carry (Alien Items included),
 * and the equipment the golden blobs mention: the golden files are validated
 * with the same reader the app uses, not a loosened one.
 */
const GOLDEN_ALLOW: SaveAllowLists = {
  damageableEquipment: new Set(DAMAGEABLE_EQUIPMENT_KEYS),
  equipment: new Set([
    "EQ_CARGO_BAY",
    "EQ_DOCK_COMP",
    "EQ_FUEL",
    "EQ_MISSILE",
    "EQ_MISSILE_REMOVAL",
    "EQ_PASSENGER_BERTH",
    "EQ_PASSENGER_BERTH_REMOVAL",
  ]),
  systems: new Set(["g0-s7", "g0-s1"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map([
    ["food", "t"],
    ["gold", "kg"],
    ["gem_stones", "g"],
  ]),
  marketGoods: new Set([
    "food",
    "textiles",
    "radioactives",
    "slaves",
    "liquor_wines",
    "luxuries",
    "narcotics",
    "computers",
    "machinery",
    "alloys",
    "firearms",
    "furs",
    "minerals",
    "gold",
    "platinum",
    "gem_stones",
    "alien_items",
  ]),
};

const STOCK_MOUNTS = {
  fore: "EQ_WEAPON_PULSE_LASER",
  aft: "EQ_WEAPON_NONE",
  port: "EQ_WEAPON_NONE",
  starboard: "EQ_WEAPON_NONE",
} as const;

/** The directory of the checked-in historical saves, read and never edited. */
const GOLDEN_DIR = new URL("../golden/save/", import.meta.url);

/** Every checked-in golden with the `version` it carries. */
function goldens(): ReadonlyArray<{
  readonly name: string;
  readonly version: number;
}> {
  return readdirSync(GOLDEN_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const parsed = JSON.parse(readGolden(name)) as Record<string, unknown>;
      const version = parsed["version"];
      if (typeof version !== "number") {
        throw new Error(`golden ${name} has no numeric version`);
      }
      return { name, version };
    });
}

// The eleven goldens are REGRESSION snapshots of real saves (the v1 shapes of
// Phases 4 and 5, the captured v2 writer blob, and the v2 to v4 steps generated
// once while the chain existed). They are read, never regenerated: with the
// chain gone they are the rejection fixtures, and each blob stays byte for byte
// what an older release wrote.
describe("every historical save older than SAVE_VERSION is corrupt (D-11)", () => {
  const all = goldens();

  it("reads every golden, none is newer than the current version, and at least one is older (not vacuous)", () => {
    expect(all.length).toBe(11);
    expect(all.every((golden) => golden.version <= SAVE_VERSION)).toBe(true);
    expect(
      all.filter((golden) => golden.version < SAVE_VERSION).length,
    ).toBeGreaterThanOrEqual(1);
  });

  for (const golden of all) {
    const older = golden.version < SAVE_VERSION;
    it(`${golden.name} (version ${String(golden.version)}) is ${older ? "corrupt, never unreadable" : "accepted"}`, () => {
      const result = parseSave(readGolden(golden.name), GOLDEN_ALLOW);
      if (older) {
        expect(result).toEqual({ ok: false, reason: "corrupt" });
      } else {
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.save).toStrictEqual(JSON.parse(readGolden(golden.name)));
      }
    });
  }
});

/** A valid docked v5 blob as a plain record, for the edge tables. */
function validV5(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: SAVE_VERSION,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    damagedEquipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    marketSeed: 3545325333,
    epoch: 0,
    nextEntityId: 101,
    laserMounts: { ...STOCK_MOUNTS },
    ...overrides,
  };
}

function parseOf(value: Record<string, unknown>) {
  return parseSave(JSON.stringify(value), ALLOW);
}

describe("v5 refusals (T-13-10, T-13-11): a forged mount is corrupt", () => {
  it("the control blob is accepted", () => {
    const result = parseOf(validV5());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save.laserMounts).toStrictEqual(STOCK_MOUNTS);
  });

  it.each([
    "EQ_WEAPON_PULSE_LASER",
    "EQ_WEAPON_BEAM_LASER",
    "EQ_WEAPON_MINING_LASER",
    "EQ_WEAPON_MILITARY_LASER",
    "EQ_WEAPON_NONE",
  ])("%s is a valid mount on every facing", (key) => {
    const result = parseOf(
      validV5({
        laserMounts: { fore: key, aft: key, port: key, starboard: key },
      }),
    );
    expect(result.ok).toBe(true);
  });

  const corruptMounts: ReadonlyArray<readonly [string, unknown]> = [
    ["an unknown mount string", { ...STOCK_MOUNTS, aft: "EQ_WEAPON_PLASMA" }],
    [
      "the Thargoid laser, which no player mount may hold",
      { ...STOCK_MOUNTS, port: "EQ_WEAPON_THARGOID_LASER" },
    ],
    ["a lowercase mount", { ...STOCK_MOUNTS, fore: "eq_weapon_pulse_laser" }],
    ["a number as a mount", { ...STOCK_MOUNTS, fore: 1 }],
    ["a null mount", { ...STOCK_MOUNTS, starboard: null }],
    ["an empty string mount", { ...STOCK_MOUNTS, fore: "" }],
    [
      "a missing facing",
      {
        fore: STOCK_MOUNTS.fore,
        aft: "EQ_WEAPON_NONE",
        port: "EQ_WEAPON_NONE",
      },
    ],
    ["an extra facing key", { ...STOCK_MOUNTS, top: "EQ_WEAPON_NONE" }],
    ["an array", ["EQ_WEAPON_PULSE_LASER"]],
    ["a string", "EQ_WEAPON_PULSE_LASER"],
    ["null", null],
    ["an empty object", {}],
  ];

  it.each(corruptMounts)("%s is corrupt", (_name, laserMounts) => {
    expect(parseOf(validV5({ laserMounts }))).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("a v5 blob without laserMounts is corrupt", () => {
    const blob = validV5();
    delete blob.laserMounts;
    expect(parseOf(blob)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("a blob that carries every current field under an older version is corrupt (no silent re-labelling)", () => {
    for (const version of [3, SAVE_VERSION - 1]) {
      expect(parseOf(validV5({ version }))).toEqual({
        ok: false,
        reason: "corrupt",
      });
    }
  });

  it("the boundary: the previous version is corrupt, SAVE_VERSION parses, SAVE_VERSION + 1 is future-version", () => {
    expect(parseOf(validV5({ version: SAVE_VERSION - 1 }))).toEqual({
      ok: false,
      reason: "corrupt",
    });
    expect(parseOf(validV5({ version: SAVE_VERSION })).ok).toBe(true);
    expect(parseOf(validV5({ version: SAVE_VERSION + 1 }))).toEqual({
      ok: false,
      reason: "future-version",
    });
  });

  it.each([
    "EQ_WEAPON_PULSE_LASER",
    "EQ_WEAPON_BEAM_LASER",
    "EQ_WEAPON_MINING_LASER",
    "EQ_WEAPON_MILITARY_LASER",
    "EQ_WEAPON_NONE",
    "EQ_WEAPON_THARGOID_LASER",
  ])(
    "%s inside equipment is double encoding: corrupt on read, refused on write, even when allow-listed",
    (key) => {
      // The key is on the allow-list on purpose: only FORBIDDEN_EQUIPMENT
      // refuses it, so a catalogue that listed a laser would still be safe.
      const allow: SaveAllowLists = {
        ...ALLOW,
        equipment: new Set([...ALLOW.equipment, key]),
      };
      const blob = validV5({ equipment: [key] });
      expect(parseSave(JSON.stringify(blob), allow)).toEqual({
        ok: false,
        reason: "corrupt",
      });
      expect(isEncodedSaveValid(JSON.stringify(blob), allow)).toBe(false);
    },
  );

  it("the writer gate refuses a mount the schema forbids, whatever the caller passed", () => {
    const forged = {
      ...baseInputs(),
      laserMounts: {
        ...STOCK_MOUNTS,
        aft: "EQ_WEAPON_PLASMA",
      } as unknown as LaserMounts,
    };
    expect(isEncodedSaveValid(encodeSave(forged), ALLOW)).toBe(false);
  });
});

function baseInputs(overrides: Partial<SaveInputs> = {}): SaveInputs {
  return {
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    damagedEquipment: [],
    cargo: [],
    fuel: 70,
    missiles: 3,
    passengerBerths: 0,
    mode: "docked",
    marketSeed: LAVE_SEED,
    systemId: "g0-s7",
    stationKey: "coriolis-station",
    epoch: 0,
    nextEntityId: 101,
    laserMounts: DEFAULT_LASER_MOUNTS,
    ...overrides,
  };
}

describe("classification: future versions stay inert", () => {
  it("the next version is future-version and is never classified as corrupt", () => {
    expect(parseOf(validV5({ version: SAVE_VERSION + 1 }))).toEqual({
      ok: false,
      reason: "future-version",
    });
  });

  it("an oversized next-version blob is future-version and JSON.parse never runs", () => {
    const oversized = `${JSON.stringify(validV5({ version: SAVE_VERSION + 1 }))}${" ".repeat(MAX_SAVE_CHARS)}`;
    expect(oversized.length).toBeGreaterThan(MAX_SAVE_CHARS);
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(parseSave(oversized, ALLOW)).toEqual({
        ok: false,
        reason: "future-version",
      });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("a v5 blob with a forged mount is corrupt, the one reason that is backed up", () => {
    expect(
      parseOf(validV5({ laserMounts: { ...STOCK_MOUNTS, aft: "x" } })),
    ).toEqual({ ok: false, reason: "corrupt" });
  });
});

/**
 * The worst-case v5 save: every field at its bound, every string made only of
 * code units that JSON.stringify escapes to six characters (U+0000 to U+0007,
 * U+000B, U+000E to U+001F; U+0008, U+0009, U+000A, U+000C and U+000D escape to
 * two and are excluded), and four military lasers, the longest mount key.
 */
const SIX_CHAR_UNITS: readonly string[] = [
  ...Array.from({ length: 8 }, (_, index) => String.fromCharCode(index)),
  String.fromCharCode(0x0b),
  ...Array.from({ length: 18 }, (_, index) =>
    String.fromCharCode(0x0e + index),
  ),
];

function worstKey(index: number, length: number): string {
  let key = "";
  for (let at = 0; at < length; at += 1) {
    key += SIX_CHAR_UNITS[(index + at) % SIX_CHAR_UNITS.length] ?? "";
  }
  return key;
}

const WORST_CASE_INPUTS: SaveInputs = {
  clockSeconds: CLOCK_START + MAX_SAVE_CLOCK_DELTA,
  credits: MAX_SAVE_CREDITS,
  equipment: Array.from({ length: MAX_SAVE_EQUIPMENT }, (_, index) =>
    worstKey(index, MAX_SAVE_EQUIPMENT_KEY_CHARS),
  ),
  damagedEquipment: Array.from(
    { length: MAX_SAVE_DAMAGED_EQUIPMENT },
    (_, index) => worstKey(index + 1, MAX_SAVE_EQUIPMENT_KEY_CHARS),
  ),
  cargo: Array.from({ length: MAX_SAVE_CARGO_ENTRIES }, (_, index) => ({
    key: worstKey(index + 3, MAX_SAVE_EQUIPMENT_KEY_CHARS),
    quantity: MAX_SAVE_CARGO_QUANTITY,
  })),
  fuel: MAX_SAVE_FUEL,
  missiles: MAX_SAVE_MISSILES,
  passengerBerths: MAX_SAVE_BERTHS,
  mode: "inFlight",
  targetSystem: worstKey(5, MAX_SAVE_SYSTEM_ID_CHARS),
  market: {
    systemId: worstKey(7, MAX_SAVE_SYSTEM_ID_CHARS),
    seed: 0xffffffff,
    goods: Array.from({ length: MAX_SAVE_MARKET_GOODS }, (_, index) => ({
      key: worstKey(index + 9, MAX_SAVE_EQUIPMENT_KEY_CHARS),
      price: MAX_SAVE_CREDITS,
      stock: MARKET_LIMIT,
    })),
  },
  flight: {
    position: [-999999999.9999999, -999999999.9999999, -999999999.9999999],
    orientation: [
      -0.4999999999999999, -0.4999999999999999, -0.4999999999999999,
      -0.4999999999999999,
    ],
    speed: 999999.9999999999,
    pitchRate: -9.999999999999998,
    rollRate: -9.999999999999998,
    torus: false,
  },
  systemId: worstKey(11, MAX_SAVE_SYSTEM_ID_CHARS),
  stationKey: worstKey(13, MAX_SAVE_STATION_KEY_CHARS),
  epoch: MAX_SAVE_EPOCH,
  nextEntityId: MAX_SAVE_NEXT_ENTITY_ID,
  laserMounts: {
    fore: "EQ_WEAPON_MILITARY_LASER",
    aft: "EQ_WEAPON_MILITARY_LASER",
    port: "EQ_WEAPON_MILITARY_LASER",
    starboard: "EQ_WEAPON_MILITARY_LASER",
  },
};

const WORST_CASE_ENCODED = encodeSave(WORST_CASE_INPUTS);

describe("worst-case v5 save", () => {
  it(`the schema bound (not a save that parses: the combined 64-key rule rejects 64 plus 16 keys) encodes under MAX_SAVE_CHARS (measured ${String(WORST_CASE_ENCODED.length)} characters), is schema-valid, and is not vacuous`, () => {
    expect(WORST_CASE_ENCODED.length).toBeLessThan(MAX_SAVE_CHARS);
    expect(WORST_CASE_ENCODED.length).toBeGreaterThanOrEqual(46_000);
    expect(SaveV5Schema.safeParse(JSON.parse(WORST_CASE_ENCODED)).success).toBe(
      true,
    );
    const parsed = JSON.parse(WORST_CASE_ENCODED) as Record<string, unknown>;
    expect((parsed["equipment"] as unknown[]).length).toBe(MAX_SAVE_EQUIPMENT);
    expect((parsed["damagedEquipment"] as unknown[]).length).toBe(
      MAX_SAVE_DAMAGED_EQUIPMENT,
    );
    // The four mount keys are part of what was measured.
    expect(
      (WORST_CASE_ENCODED.match(/EQ_WEAPON_MILITARY_LASER/gu) ?? []).length,
    ).toBe(4);
  });

  it("the combined 64-key rule rejects the schema bound: 64 plus 16 keys is not a save", () => {
    const allow: SaveAllowLists = {
      ...ALLOW,
      equipment: new Set(WORST_CASE_INPUTS.equipment),
      damageableEquipment: new Set(WORST_CASE_INPUTS.damagedEquipment),
    };
    expect(isEncodedSaveValid(WORST_CASE_ENCODED, allow)).toBe(false);
  });

  it("one key more than the damaged bound is refused by the schema", () => {
    const over = encodeSave({
      ...WORST_CASE_INPUTS,
      damagedEquipment: [
        ...WORST_CASE_INPUTS.damagedEquipment,
        worstKey(40, MAX_SAVE_EQUIPMENT_KEY_CHARS),
      ],
    });
    expect(SaveV5Schema.safeParse(JSON.parse(over)).success).toBe(false);
  });
});

/**
 * The two future-version checks of the v4 build's parser, transcribed verbatim
 * from the pre-Phase-19 `src/persistence/save.ts` with SAVE_VERSION 4: the
 * bounded 256-character sniff for an oversized blob and the post-parse
 * `typeof version === "number" && version > 4` check. The earlier suites applied
 * the same transcription to the v2 and v3 builds; only the constant differs.
 */
function olderBuildIsFuture(raw: string): boolean {
  const SAVE_VERSION_V4 = 4;
  const MAX_VERSION_SNIFF_CHARS = 256;
  const VERSION_SNIFF = /"version"\s*:\s*(\d{1,16})/;
  if (raw.length > 65_536) {
    const match = VERSION_SNIFF.exec(raw.slice(0, MAX_VERSION_SNIFF_CHARS));
    if (match === null) return false;
    const value = Number(match[1]);
    const version = Number.isSafeInteger(value) ? value : null;
    return version !== null && version > SAVE_VERSION_V4;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const version = (parsed as Record<string, unknown>)["version"];
    return typeof version === "number" && version > SAVE_VERSION_V4;
  }
  return false;
}

describe("older builds keep a v5 save inert", () => {
  const docked = encodeSave(baseInputs());
  const inFlight = encodeSave(WORST_CASE_INPUTS);
  const paddedWorst = `${WORST_CASE_ENCODED}${" ".repeat(MAX_SAVE_CHARS)}`;

  it.each([
    ["docked", docked],
    ["worst-case in flight", inFlight],
    ["worst case padded beyond MAX_SAVE_CHARS", paddedWorst],
  ])("the v4 build classifies a %s blob as future-version", (_name, raw) => {
    expect(raw.startsWith(`{"version":${String(SAVE_VERSION)},`)).toBe(true);
    expect(olderBuildIsFuture(raw)).toBe(true);
  });

  it("the frozen classifier does not call a v4 blob future (it is not vacuous)", () => {
    expect(
      olderBuildIsFuture(
        JSON.stringify({ ...validV5(), version: SAVE_VERSION - 1 }),
      ),
    ).toBe(false);
    expect(olderBuildIsFuture("not json")).toBe(false);
  });

  it("this build reads the padded worst case as unreadable, never corrupt", () => {
    expect(parseSave(paddedWorst, ALLOW)).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});

describe("the damaged-equipment list (SAVE-09)", () => {
  const allow: SaveAllowLists = {
    ...ALLOW,
    equipment: new Set([...ALLOW.equipment, "EQ_CARGO_BAY", "EQ_ECM"]),
    damageableEquipment: new Set([
      ...ALLOW.damageableEquipment,
      "EQ_CARGO_BAY",
    ]),
  };
  const parseWith = (value: Record<string, unknown>) =>
    parseSave(JSON.stringify(value), allow);

  it("a v5 blob without damagedEquipment is corrupt", () => {
    const blob = validV5();
    delete blob.damagedEquipment;
    expect(parseWith(blob)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("the empty list (a new game) and a single damaged key round-trip", () => {
    for (const damagedEquipment of [[], ["EQ_DOCK_COMP"]]) {
      const encoded = encodeSave({ ...baseInputs(), damagedEquipment });
      const parsed = parseSave(encoded, allow);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.save.damagedEquipment).toEqual(damagedEquipment);
      expect(profileFromSave(parsed.save).damagedEquipment).toEqual(
        damagedEquipment,
      );
    }
  });

  it("the damage order survives encode, parse and restore (never re-sorted)", () => {
    const damagedEquipment = ["EQ_DOCK_COMP", "EQ_ADVANCED_COMPASS"];
    const encoded = encodeSave({ ...baseInputs(), damagedEquipment });
    expect(encoded).toContain(
      '"damagedEquipment":["EQ_DOCK_COMP","EQ_ADVANCED_COMPASS"]',
    );
    const parsed = parseSave(encoded, allow);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(profileFromSave(parsed.save).damagedEquipment).toEqual(
      damagedEquipment,
    );
    const reversed = encodeSave({
      ...baseInputs(),
      damagedEquipment: [...damagedEquipment].reverse(),
    });
    expect(reversed).not.toBe(encoded);
  });

  const refusals: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["an unknown key", { damagedEquipment: ["EQ_UNKNOWN"] }],
    ["a _DAMAGED key", { damagedEquipment: ["EQ_DOCK_COMP_DAMAGED"] }],
    [
      "a key outside the damageable set (EQ_ECM)",
      { damagedEquipment: ["EQ_ECM"] },
    ],
    ["a laser key", { damagedEquipment: ["EQ_WEAPON_PULSE_LASER"] }],
    ["a duplicate", { damagedEquipment: ["EQ_DOCK_COMP", "EQ_DOCK_COMP"] }],
    [
      "a key that is also installed",
      { equipment: ["EQ_DOCK_COMP"], damagedEquipment: ["EQ_DOCK_COMP"] },
    ],
    ["an empty string", { damagedEquipment: [""] }],
    ["a key over 64 characters", { damagedEquipment: ["E".repeat(65)] }],
    ["a non-array", { damagedEquipment: "EQ_DOCK_COMP" }],
    ["a non-string entry", { damagedEquipment: [1] }],
    [
      "more than 16 keys",
      {
        damagedEquipment: Array.from(
          { length: MAX_SAVE_DAMAGED_EQUIPMENT + 1 },
          (_, index) => `EQ_${String(index)}`,
        ),
      },
    ],
  ];

  it.each(refusals)("%s is corrupt", (_name, overrides) => {
    expect(parseWith(validV5(overrides))).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("a forbidden key in the damaged list is corrupt even when allow-listed as damageable", () => {
    const forged: SaveAllowLists = {
      ...allow,
      damageableEquipment: new Set([...allow.damageableEquipment, "EQ_FUEL"]),
    };
    expect(
      parseSave(
        JSON.stringify(validV5({ damagedEquipment: ["EQ_FUEL"] })),
        forged,
      ),
    ).toEqual({ ok: false, reason: "corrupt" });
  });

  it("the combined bound: 64 keys in total pass, 65 are corrupt (reader and writer)", () => {
    const keys = Array.from(
      { length: 65 },
      (_, index) => `EQ_K${String(index)}`,
    );
    const wide: SaveAllowLists = {
      ...allow,
      equipment: new Set(keys),
      damageableEquipment: new Set(keys),
    };
    const at = (total: number): Record<string, unknown> =>
      validV5({
        equipment: keys.slice(0, total - 4),
        damagedEquipment: keys.slice(total - 4, total),
      });
    expect(parseSave(JSON.stringify(at(MAX_SAVE_EQUIPMENT)), wide).ok).toBe(
      true,
    );
    expect(parseSave(JSON.stringify(at(MAX_SAVE_EQUIPMENT + 1)), wide)).toEqual(
      { ok: false, reason: "corrupt" },
    );
    expect(
      isEncodedSaveValid(JSON.stringify(at(MAX_SAVE_EQUIPMENT)), wide),
    ).toBe(true);
    expect(
      isEncodedSaveValid(JSON.stringify(at(MAX_SAVE_EQUIPMENT + 1)), wide),
    ).toBe(false);
  });

  it("the writer gate refuses a damaged key the reader would refuse", () => {
    for (const key of ["EQ_ECM", "EQ_UNKNOWN"]) {
      expect(
        isEncodedSaveValid(
          encodeSave({ ...baseInputs(), damagedEquipment: [key] }),
          allow,
        ),
      ).toBe(false);
    }
    expect(
      isEncodedSaveValid(
        encodeSave({ ...baseInputs(), damagedEquipment: ["EQ_DOCK_COMP"] }),
        allow,
      ),
    ).toBe(true);
  });
});
