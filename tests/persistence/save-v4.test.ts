// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save schema v4 contract (Phase 13, CBT-05; plan 13-06) and the historical
 * classification (Phase 19, D-11).
 *
 * v4 adds exactly one required field to v3: `laserMounts`, the laser fitted to
 * each of the four facings. Since Phase 19 there is no migration: every
 * checked-in historical save older than `SAVE_VERSION` is `corrupt`, and the
 * goldens in `tests/golden/save/` are the real saves that prove it. Expected
 * values come from the Cobra's stock fit (`forward_weapon_type =
 * WEAPON_PULSE_LASER`, no other facing) and from the decisions, never from
 * running the code twice.
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
  SaveV3Schema,
  SaveV4Schema,
  encodeSave,
  isEncodedSaveValid,
  migrateV3ToV4,
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
import { newProfile } from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import { commoditiesFixture } from "../helpers/commodities.js";
import { laveFixture } from "../helpers/lave.js";

const lave = laveFixture();
const catalogue = commoditiesFixture();
const LAVE_SEED = marketSeedForSystem("g0-s7");
const laveMarket = generateMarket(lave.system, catalogue, LAVE_SEED);

const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
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

describe("laser mounts through a v4 save (tracer)", () => {
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

  it("the version this build writes is 4", () => {
    expect(SAVE_VERSION).toBe(4);
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
    expect(encoded.startsWith('{"version":4,')).toBe(true);
    expect(isEncodedSaveValid(encoded, ALLOW)).toBe(true);

    const parsed = parseSave(encoded, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.version).toBe(4);
    expect(parsed.save.laserMounts).toEqual(mounts);

    const restored = profileFromSave(parsed.save);
    expect(restored.laserMounts).toEqual(mounts);
    // The restored profile owns a copy, not the parsed save's object.
    expect(restored.laserMounts).not.toBe(parsed.save.laserMounts);
    // A second snapshot of the restored profile is the same bytes.
    expect(encodeSave(snapshot(restored))).toBe(encoded);
  });
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

describe("the v3 to v4 step (defaults, no value gained or lost)", () => {
  it("a migrated v3 save carries the same mounts a new game starts with", () => {
    const v3 = SaveV3Schema.parse(
      JSON.parse(readGolden("v3-from-v1-phase5.json")),
    );
    const migrated = migrateV3ToV4(v3);
    expect(migrated.laserMounts).toStrictEqual(newProfile().laserMounts);
    expect(migrated.laserMounts).toStrictEqual(STOCK_MOUNTS);
    // Credits and every other field are unchanged.
    expect(migrated.credits).toBe(v3.credits);
    expect(migrated.equipment).toStrictEqual(v3.equipment);
  });

  it("migrateV3ToV4 never mutates its input, is deterministic and writes fresh mounts", () => {
    const frozen = SaveV3Schema.parse(
      JSON.parse(readGolden("v3-from-v1-phase4.json")),
    );
    const before = JSON.stringify(frozen);
    const first = migrateV3ToV4(frozen);
    const second = migrateV3ToV4(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(first).toStrictEqual(second);
    expect(first).not.toBe(second);
    expect(first.laserMounts).not.toBe(second.laserMounts);
    expect(first.laserMounts).not.toBe(DEFAULT_LASER_MOUNTS);
    // The shared default is never handed out: mutating a copy cannot leak.
    expect(Object.isFrozen(DEFAULT_LASER_MOUNTS)).toBe(true);
  });

  it("v3 stays frozen as version literal 3 and v4 is its own strict schema", () => {
    const v3 = JSON.parse(readGolden("v3-from-v1-phase4.json")) as unknown;
    const v4 = JSON.parse(readGolden("v4-from-v1-phase4.json")) as unknown;
    expect(SaveV3Schema.safeParse(v3).success).toBe(true);
    expect(SaveV3Schema.safeParse(v4).success).toBe(false);
    expect(SaveV4Schema.safeParse(v4).success).toBe(true);
    expect(SaveV4Schema.safeParse(v3).success).toBe(false);
  });
});

/** A valid docked v4 blob as a plain record, for the edge tables. */
function validV4(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 4,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
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

describe("v4 refusals (T-13-10, T-13-11): a forged mount is corrupt", () => {
  it("the control blob is accepted", () => {
    const result = parseOf(validV4());
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
      validV4({
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
    expect(parseOf(validV4({ laserMounts }))).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("a v4 blob without laserMounts is corrupt", () => {
    const blob = validV4();
    delete blob.laserMounts;
    expect(parseOf(blob)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("a blob that carries every current field under version 3 is corrupt (no silent re-labelling)", () => {
    expect(parseOf(validV4({ version: 3 }))).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("the boundary: version 3 is corrupt, SAVE_VERSION parses, SAVE_VERSION + 1 is future-version", () => {
    expect(parseOf(validV4({ version: 3 }))).toEqual({
      ok: false,
      reason: "corrupt",
    });
    expect(parseOf(validV4({ version: SAVE_VERSION })).ok).toBe(true);
    expect(parseOf(validV4({ version: SAVE_VERSION + 1 }))).toEqual({
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
      const blob = validV4({ equipment: [key] });
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
  it("version 5 is future-version and is never classified as corrupt", () => {
    expect(parseOf(validV4({ version: 5 }))).toEqual({
      ok: false,
      reason: "future-version",
    });
  });

  it("an oversized version 5 blob is future-version and JSON.parse never runs", () => {
    const oversized = `${JSON.stringify(validV4({ version: 5 }))}${" ".repeat(MAX_SAVE_CHARS)}`;
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

  it("a v4 blob with a forged mount is corrupt, the one reason that is backed up", () => {
    expect(
      parseOf(validV4({ laserMounts: { ...STOCK_MOUNTS, aft: "x" } })),
    ).toEqual({ ok: false, reason: "corrupt" });
  });
});

/**
 * The worst-case v4 save: every field at its bound, every string made only of
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

describe("worst-case v4 save", () => {
  it(`encodes under MAX_SAVE_CHARS (measured ${String(WORST_CASE_ENCODED.length)} characters), is schema-valid, and is not vacuous`, () => {
    expect(WORST_CASE_ENCODED.length).toBeLessThan(MAX_SAVE_CHARS);
    expect(WORST_CASE_ENCODED.length).toBeGreaterThanOrEqual(38_000);
    expect(SaveV4Schema.safeParse(JSON.parse(WORST_CASE_ENCODED)).success).toBe(
      true,
    );
    // The four mount keys are part of what was measured.
    expect(
      (WORST_CASE_ENCODED.match(/EQ_WEAPON_MILITARY_LASER/gu) ?? []).length,
    ).toBe(4);
  });
});

/**
 * The two future-version checks of the v3 build's parser, transcribed verbatim
 * from the pre-Phase-13 `src/persistence/save.ts` with SAVE_VERSION 3: the
 * bounded 256-character sniff for an oversized blob and the post-parse
 * `typeof version === "number" && version > 3` check. The Phase 11 test applied
 * the same transcription to the v2 build; only the constant differs.
 */
function olderBuildIsFuture(raw: string): boolean {
  const SAVE_VERSION_V3 = 3;
  const MAX_VERSION_SNIFF_CHARS = 256;
  const VERSION_SNIFF = /"version"\s*:\s*(\d{1,16})/;
  if (raw.length > 65_536) {
    const match = VERSION_SNIFF.exec(raw.slice(0, MAX_VERSION_SNIFF_CHARS));
    if (match === null) return false;
    const value = Number(match[1]);
    const version = Number.isSafeInteger(value) ? value : null;
    return version !== null && version > SAVE_VERSION_V3;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const version = (parsed as Record<string, unknown>)["version"];
    return typeof version === "number" && version > SAVE_VERSION_V3;
  }
  return false;
}

describe("older builds keep a v4 save inert", () => {
  const docked = encodeSave(baseInputs());
  const inFlight = encodeSave(WORST_CASE_INPUTS);
  const paddedWorst = `${WORST_CASE_ENCODED}${" ".repeat(MAX_SAVE_CHARS)}`;

  it.each([
    ["docked", docked],
    ["worst-case in flight", inFlight],
    ["worst case padded beyond MAX_SAVE_CHARS", paddedWorst],
  ])("the v3 build classifies a %s blob as future-version", (_name, raw) => {
    expect(raw.startsWith('{"version":4,')).toBe(true);
    expect(olderBuildIsFuture(raw)).toBe(true);
  });

  it("the frozen classifier does not call a v3 blob future (it is not vacuous)", () => {
    expect(
      olderBuildIsFuture(JSON.stringify({ ...validV4(), version: 3 })),
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
