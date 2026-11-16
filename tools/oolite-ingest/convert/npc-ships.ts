// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `shipdata.plist` (resolved catalogue) → the NPC ship records
 * (DATA-10, DATA-11 stage 1, DATA-13, D-02, D-06, T-09-16, T-09-19).
 *
 * Phase 12's populator picks ships by role and needs, per ship, its roles, AI
 * name, scan class and model, plus the URL of the model it fetches on demand.
 * This module compiles exactly those six fields plus the ship's mass (DATA-11,
 * computed by `ship-mass.ts` and handed in) and its collision radius (WORLD-15,
 * computed by `ship-radius.ts` and handed in), and, from Phase 13 (CBT-07, the
 * minimum of DATA-15), the display name, max energy, energy recharge rate,
 * forward weapon and forward weapon position, from Phase 14 (AI-01), the four
 * flight constants the NPC flight model reads (max flight speed, roll and
 * pitch, and thrust), and, from Phase 15 (DATA-14), the aft, port and
 * starboard weapon types and positions (every facing type gated by Oolite's
 * `weapon_facings` mask), `likely_cargo`, `max_cargo` (unsigned integers,
 * default 0), `fragment_chance` and `explosion_type`. The one deliberate
 * narrowing of Oolite's readers: `fragment_chance` must be a number, where
 * Oolite's fuzzy boolean also takes boolean and string spellings (see
 * `DEFAULT_FRAGMENT_CHANCE`). Nothing else: no other combat or flight stat, no
 * subentity, material or `auto_ai`. No class field is compiled:
 * Oolite's class name equals the name for all nine stock hulls
 * (`ship_class_name` defaults to `name`, ShipEntity.m:391-392), so the ident
 * message needs the name only.
 *
 * The compiled `aiType` is the authored `ai_type`. Oolite replaces it at spawn
 * from `autoAImap.plist` when `auto_ai` is on; that is Phase 12's concern and
 * is not compiled.
 */

import { canonicalJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import {
  NpcShipSchema,
  type NpcShip,
} from "../../../src/content/schemas/ship-npc.js";
import { EMITTED_ENTRIES, MODEL_SOURCE_FILES, shipGlbFile } from "./glb.js";
import type { EmittedShips, ShipCatalogue } from "./ships.js";

/** Where the NPC records are written, repository-relative. */
export const NPC_SHIPS_PATH = "src/content/generated/ships-npc.json";

/**
 * One canonical record per compiled NPC model (D-02): the non-template record
 * of each model, together covering the police, trader, pirate, hunter, shuttle
 * and scavenger roles. Every other record that uses one of these models (player
 * variants, `cobramk1-alt`, `morayMED`, `cobramk1-miner`, `mamba-escort`,
 * `viper-pursuit`, the tutorial krait records and the `oolite_template_*`
 * parents) is left out; the reasons are in plan 09-04's objective table. Code
 * unit sorted, like `CLIENT_SHIP_KEYS`.
 */
export const NPC_SHIP_KEYS: readonly string[] = [
  "adder",
  "cobramk1",
  "gecko",
  "krait",
  "mamba",
  "moray",
  "shuttle",
  "sidewinder",
  "viper",
];

/**
 * Oolite's AI default for a ship that authors no `ai_type`
 * (ShipEntity.m:564, `defaultValue:@"nullAI.plist"`).
 */
export const DEFAULT_AI_TYPE = "nullAI.plist";

/**
 * Oolite's scan class for a non-sub-entity ship that authors none: a ship
 * whose `scanClass` is `CLASS_NOT_SET` is forced to `CLASS_NEUTRAL`
 * (ShipEntity.m:520 reads the key with `CLASS_NOT_SET` as the default,
 * ShipEntity.m:2126-2127 forces the fallback). Universe.m's role-based spawn
 * sets `CLASS_POLICE` for the `police` role at spawn time; that is Phase 12
 * behaviour and is not compiled.
 */
export const DEFAULT_SCAN_CLASS = "CLASS_NEUTRAL";

/**
 * Oolite's `max_energy` default (ShipEntity.m:285-290, `oo_floatForKey:
 * defaultValue:200.0f`).
 */
export const DEFAULT_MAX_ENERGY = 200;

/** Oolite's `energy_recharge_rate` default (ShipEntity.m:290, 1.0). */
export const DEFAULT_ENERGY_RECHARGE_RATE = 1;

/**
 * Oolite's `max_flight_speed` default for a ship that is not a station
 * (ShipEntity.m:263-264, `defaultValue:defaultSpeed`, 160; a station's 0 does
 * not apply to these nine ships).
 */
export const DEFAULT_MAX_FLIGHT_SPEED = 160;

/** Oolite's `max_flight_roll` default (ShipEntity.m:265, 2.0). */
export const DEFAULT_MAX_FLIGHT_ROLL = 2;

/** Oolite's `max_flight_pitch` default (ShipEntity.m:266, 1.0). */
export const DEFAULT_MAX_FLIGHT_PITCH = 1;

/** Oolite's `thrust` default (ShipEntity.m:270, 15.0). */
export const DEFAULT_THRUST = 15;

/** Oolite's `likely_cargo` default (`oo_unsignedIntForKey`, ShipEntity.m:566). */
export const DEFAULT_LIKELY_CARGO = 0;

/** Oolite's `max_cargo` default (`oo_unsignedIntForKey`, ShipEntity.m:378). */
export const DEFAULT_MAX_CARGO = 0;

/** Oolite's `forward_weapon_type` default (ShipEntity.m:300). */
export const DEFAULT_FORWARD_WEAPON = "EQ_WEAPON_NONE";

/**
 * Oolite's `weapon_facings` default, `VALID_WEAPON_FACINGS` (OOTypes.h:196-206:
 * forward 1, aft 2, port 4, starboard 8). ShipEntity.m:298 reads the mask with
 * `oo_intForKey` and masks it with 15, and then reads each facing's weapon type
 * only when its bit is set (ShipEntity.m:299-306).
 *
 * Deliberate narrowing (review round 2, R2-12b): Oolite reads the mask as a
 * signed int, so a negative authored value such as -1 means every facing there.
 * The converter reads it through `uintExtra` and fails the build on a negative
 * or non-integer value; none of the nine ships authors a negative mask (the
 * shuttle authors 0, the others 1, 3, 15 or nothing). A value above 15 is
 * masked exactly as Oolite masks it.
 */
export const DEFAULT_WEAPON_FACINGS = 15;

/** The `weapon_facings` bits (OOTypes.h:196-206). */
const WEAPON_FACING_FORWARD = 1;
const WEAPON_FACING_AFT = 2;
const WEAPON_FACING_PORT = 4;
const WEAPON_FACING_STARBOARD = 8;

/**
 * Oolite's aft, port and starboard weapon type default
 * (`defaultValue:@"EQ_WEAPON_NONE"`, ShipEntity.m:302-306), and the value of a
 * facing whose `weapon_facings` bit is clear.
 */
export const DEFAULT_FACING_WEAPON = "EQ_WEAPON_NONE";

/**
 * Oolite's `fragment_chance` default, 0.9 (`oo_fuzzyBooleanForKey:
 * defaultValue:0.9`, ShipEntity.m:372). The default parameter of that method is
 * a `float` (OOCollectionExtractors.h:152), so the default and an authored value
 * are both float32 and agree: `Math.fround(0.9)` is 0.8999999761581421.
 *
 * Deliberate narrowing: Oolite's fuzzy boolean also accepts boolean and string
 * spellings and rolls the chance once at ship setup into `canFragment`
 * (ShipEntity.m:372). The converter reads a number only (a boolean or string
 * value fails the build; none of the nine authors the key), and the record
 * keeps the probability, so rolling it needs no hashed `canFragment` field. When
 * the roll happens is Phase 16's decision.
 */
export const DEFAULT_FRAGMENT_CHANCE = Math.fround(0.9);

/**
 * Oolite's `explosion_type` default: nil (`oo_arrayForKey:defaultValue:nil`,
 * ShipEntity.m:491). Nil is not an empty array, so an absent key compiles to
 * null and the record never carries `[]` for it.
 */
export const DEFAULT_EXPLOSION_TYPE: readonly string[] | null = null;

/**
 * The plist's `forward_weapon_type` names mapped to the equipment keys. Oolite
 * reads them with `OOWeaponTypeFromString` (ShipEntity.m:300), which accepts the
 * legacy WEAPON_* names shipdata.plist authors and the EQ_WEAPON_* identifiers
 * (OOConstToString.m:252-290). Any other value fails the build (T-13-29).
 */
export const FORWARD_WEAPON_KEYS: Readonly<Record<string, string>> =
  Object.freeze({
    WEAPON_NONE: "EQ_WEAPON_NONE",
    WEAPON_PULSE_LASER: "EQ_WEAPON_PULSE_LASER",
    WEAPON_BEAM_LASER: "EQ_WEAPON_BEAM_LASER",
    WEAPON_MINING_LASER: "EQ_WEAPON_MINING_LASER",
    WEAPON_MILITARY_LASER: "EQ_WEAPON_MILITARY_LASER",
  });

/**
 * The resolved-record keys the Phase 14 steering port assumes are absent for
 * every compiled NPC ship (14-RESEARCH reachability analysis, Assumptions A1
 * and A2). With none authored, Oolite's defaults apply: accuracy 0, reaction
 * time 1.5 s, scanner range 25600 m and no aft, port or starboard weapon. The
 * port derives which attack sub-behaviours the nine ships can reach from those
 * defaults, so a pin bump that authors one of these keys must fail the build and
 * needs a new decision, not a silent change in reachability.
 *
 * `has_fuel_injection` (the afterburner) and `missiles` are deliberately not
 * compiled and not refused: afterburner and missiles are recorded scope cuts
 * with no consumer in v2.2.
 */
export const STEERING_ASSUMED_ABSENT_KEYS: readonly string[] = [
  "accuracy",
  "reaction_time",
  "scanner_range",
  "aft_weapon_type",
  "port_weapon_type",
  "starboard_weapon_type",
];

function fail(key: string, detail: string): never {
  throw contentError("SCHEMA", NPC_SHIPS_PATH, key, { excerpt: detail });
}

/**
 * A numeric extra as a float32, or the default when the key is absent (Oolite's
 * `oo_floatForKey:defaultValue:`). A present value that is not a finite number
 * fails the build rather than silently taking the default.
 */
function floatExtra(
  key: string,
  extras: Record<string, unknown>,
  field: string,
  fallback: number,
): number {
  const value = extras[field];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(
      key,
      `${field} is not a finite number: ${JSON.stringify(value)}`,
    );
  }
  return Math.fround(value);
}

/**
 * An unsigned integer extra, or the fallback when the key is absent (Oolite's
 * `oo_unsignedIntForKey:`, default 0). A present value that is not a finite,
 * non-negative safe integer fails the build rather than silently taking the
 * default.
 */
function uintExtra(
  key: string,
  extras: Record<string, unknown>,
  field: string,
  fallback: number,
): number {
  const value = extras[field];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return fail(
      key,
      `${field} is not a non-negative integer: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * A weapon position (`weapon_position_forward`, `_aft`, `_port` or
 * `_starboard`) as three float32 numbers in Oolite's frame, 0 0 0 when absent
 * (`oo_vectorForKey:defaultValue:kZeroVector`, ShipEntity.m:1801 and
 * ShipEntity.m:479-481; the stock ships author no `weapon_mount_mode` and no
 * `scale_factor`, so the single-mount, unscaled branch applies). Negative zero
 * is normalised to zero. Oolite reads every position whatever the
 * `weapon_facings` mask says, so the mask does not gate a position.
 */
function positionExtra(
  key: string,
  extras: Record<string, unknown>,
  field: string,
): [number, number, number] {
  const value = extras[field];
  if (value === undefined) return [0, 0, 0];
  const parts =
    typeof value === "string" ? value.trim().split(/\s+/).map(Number) : [];
  if (parts.length !== 3 || !parts.every((part) => Number.isFinite(part))) {
    return fail(key, `${field} is not three numbers: ${JSON.stringify(value)}`);
  }
  const [x = 0, y = 0, z = 0] = parts.map((part) => {
    const single = Math.fround(part);
    return single === 0 ? 0 : single;
  });
  return [x, y, z];
}

/**
 * One facing's weapon equipment key. Oolite reads a facing's type only when its
 * `weapon_facings` bit is set (ShipEntity.m:299-306), so a clear bit gives the
 * facing default whatever the plist authors. With the bit set, an absent key is
 * the default and an authored name maps through `FORWARD_WEAPON_KEYS`; an
 * unknown name fails the build (T-13-29).
 *
 * Exported so the converter test can pin the aft, port and starboard mapping
 * directly: the refusal loop in `compileNpcShips` keeps the stock catalogue from
 * authoring those types.
 */
export function facingWeapon(
  key: string,
  extras: Record<string, unknown>,
  facings: number,
  bit: number,
  field: string,
): string {
  if ((facings & bit) === 0) return DEFAULT_FACING_WEAPON;
  const value = extras[field];
  if (value === undefined) return DEFAULT_FACING_WEAPON;
  if (typeof value === "string" && Object.hasOwn(FORWARD_WEAPON_KEYS, value)) {
    return FORWARD_WEAPON_KEYS[value] ?? DEFAULT_FACING_WEAPON;
  }
  return fail(key, `unknown ${field} ${JSON.stringify(value)}`);
}

/**
 * `explosion_type` as a copy of the authored array of strings, or null when the
 * key is absent (ShipEntity.m:491). Anything else fails the build.
 */
function explosionTypeExtra(
  key: string,
  extras: Record<string, unknown>,
): string[] | null {
  const value = extras["explosion_type"];
  if (value === undefined) return DEFAULT_EXPLOSION_TYPE as null;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    return fail(
      key,
      `explosion_type is not an array of strings: ${JSON.stringify(value)}`,
    );
  }
  return [...value];
}

/**
 * Compile the NPC records from the resolved catalogue, in `NPC_SHIP_KEYS`
 * order.
 *
 * `masses` maps each key to its computed float32 mass and `radii` to its
 * computed float32 collision radius; a key without one fails through
 * `NpcShipSchema` as `<key>.mass` or `<key>.radius`.
 *
 * @throws {ContentError} when a key is missing, has no roles or no model, owns
 * a GLB row other than its own, or fails `NpcShipSchema`.
 */
export function compileNpcShips(
  catalogue: ShipCatalogue,
  masses: ReadonlyMap<string, number>,
  radii: ReadonlyMap<string, number>,
): NpcShip[] {
  return NPC_SHIP_KEYS.map((key) => {
    const entry = catalogue.entries.find((candidate) => candidate.key === key);
    if (entry === undefined) {
      return fail(key, `the compiled ship catalogue has no "${key}" entry`);
    }
    if (entry.roles === null || entry.model === null) {
      return fail(key, "the entry has no roles or no model");
    }

    // The record set must equal the emitted model set: the GLB is built from
    // this record's own model and is owned by this record's key alone.
    const file = shipGlbFile(entry.model);
    const owners = EMITTED_ENTRIES[file];
    const sources = MODEL_SOURCE_FILES[file];
    if (
      owners === undefined ||
      owners.length !== 1 ||
      owners[0] !== key ||
      sources === undefined ||
      sources.length !== 1 ||
      sources[0] !== entry.model
    ) {
      return fail(
        key,
        `${file} is not emitted from ${entry.model} alone for "${key}" ` +
          `(owners ${JSON.stringify(owners)}, sources ${JSON.stringify(sources)})`,
      );
    }

    // The steering port relies on Oolite's default for these keys (T-14-06).
    // The v4 weapon record (Phase 15, plan 15-02) holds a single temperature,
    // Oolite's `forward_weapon_temp` (ShipEntity.h:303-304), so lifting this
    // refusal for an aft, port or starboard weapon type also needs per-facing
    // temperatures, which is a snapshot-format change.
    for (const assumed of STEERING_ASSUMED_ABSENT_KEYS) {
      if (Object.hasOwn(entry.extras, assumed)) {
        return fail(
          key,
          `${assumed} is authored, but the Phase 14 steering port relies on ` +
            `Oolite's default for it (14-RESEARCH reachability); a pin bump ` +
            `that adds it needs a new decision`,
        );
      }
    }

    const aiType = entry.extras["ai_type"];
    const scanClass = entry.extras["scan_class"];
    const displayName = entry.extras["display_name"];
    const authoredName = entry.extras["name"];
    const facings =
      uintExtra(key, entry.extras, "weapon_facings", DEFAULT_WEAPON_FACINGS) &
      DEFAULT_WEAPON_FACINGS;
    const candidate = {
      key,
      roles: [...entry.roles],
      aiType: typeof aiType === "string" ? aiType : DEFAULT_AI_TYPE,
      scanClass: typeof scanClass === "string" ? scanClass : DEFAULT_SCAN_CLASS,
      model: entry.model,
      glb: `models/${file}`,
      mass: masses.get(key),
      radius: radii.get(key),
      // display_name when authored, else name (ShipEntity.m:391-395).
      name: typeof displayName === "string" ? displayName : authoredName,
      maxEnergy: floatExtra(
        key,
        entry.extras,
        "max_energy",
        DEFAULT_MAX_ENERGY,
      ),
      energyRechargeRate: floatExtra(
        key,
        entry.extras,
        "energy_recharge_rate",
        DEFAULT_ENERGY_RECHARGE_RATE,
      ),
      forwardWeapon: facingWeapon(
        key,
        entry.extras,
        facings,
        WEAPON_FACING_FORWARD,
        "forward_weapon_type",
      ),
      forwardWeaponPosition: positionExtra(
        key,
        entry.extras,
        "weapon_position_forward",
      ),
      aftWeapon: facingWeapon(
        key,
        entry.extras,
        facings,
        WEAPON_FACING_AFT,
        "aft_weapon_type",
      ),
      aftWeaponPosition: positionExtra(
        key,
        entry.extras,
        "weapon_position_aft",
      ),
      portWeapon: facingWeapon(
        key,
        entry.extras,
        facings,
        WEAPON_FACING_PORT,
        "port_weapon_type",
      ),
      portWeaponPosition: positionExtra(
        key,
        entry.extras,
        "weapon_position_port",
      ),
      starboardWeapon: facingWeapon(
        key,
        entry.extras,
        facings,
        WEAPON_FACING_STARBOARD,
        "starboard_weapon_type",
      ),
      starboardWeaponPosition: positionExtra(
        key,
        entry.extras,
        "weapon_position_starboard",
      ),
      maxFlightSpeed: floatExtra(
        key,
        entry.extras,
        "max_flight_speed",
        DEFAULT_MAX_FLIGHT_SPEED,
      ),
      maxFlightRoll: floatExtra(
        key,
        entry.extras,
        "max_flight_roll",
        DEFAULT_MAX_FLIGHT_ROLL,
      ),
      maxFlightPitch: floatExtra(
        key,
        entry.extras,
        "max_flight_pitch",
        DEFAULT_MAX_FLIGHT_PITCH,
      ),
      thrust: floatExtra(key, entry.extras, "thrust", DEFAULT_THRUST),
      likelyCargo: uintExtra(
        key,
        entry.extras,
        "likely_cargo",
        DEFAULT_LIKELY_CARGO,
      ),
      maxCargo: uintExtra(key, entry.extras, "max_cargo", DEFAULT_MAX_CARGO),
      fragmentChance: floatExtra(
        key,
        entry.extras,
        "fragment_chance",
        DEFAULT_FRAGMENT_CHANCE,
      ),
      explosionType: explosionTypeExtra(key, entry.extras),
    };

    const parsed = NpcShipSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(
        issue === undefined ? key : `${key}.${issue.path.join(".")}`,
        issue === undefined ? "invalid NPC ship record" : issue.message,
      );
    }
    return parsed.data;
  });
}

/** Serialise the NPC records as canonical JSON, in `NPC_SHIP_KEYS` order. */
export function emitNpcShips(
  catalogue: ShipCatalogue,
  masses: ReadonlyMap<string, number>,
  radii: ReadonlyMap<string, number>,
): EmittedShips {
  const records = compileNpcShips(catalogue, masses, radii);
  return {
    path: NPC_SHIPS_PATH,
    bytes: Buffer.from(canonicalJson(records), "utf8"),
  };
}
