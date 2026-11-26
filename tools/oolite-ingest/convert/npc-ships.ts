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
 * default 0), `fragment_chance` and `explosion_type`, and, from Phase 16
 * (D16-23), the hull's bounding box: the float32 extremes of its vendored
 * `.dat` vertices in Oolite's model axes, the box Oolite's
 * `releaseCargoPodsDebris` samples (OOEntityWithDrawable.m:55), and, from quick
 * 261119-i9g, `laser_color` as `laserColor` (the colour of the ship's laser
 * shots, see `laserColorExtra`). Two deliberate narrowings of Oolite's readers:
 * `fragment_chance` must be a number, where Oolite's fuzzy boolean also takes
 * boolean and string spellings (see `DEFAULT_FRAGMENT_CHANCE`), and
 * `laser_color` must be one of OOColor's named colours (see
 * `laserColorExtra`). Nothing else: no other combat or flight stat, no
 * subentity, material or `auto_ai`. No class field is compiled:
 * Oolite's class name equals the name for all nine stock hulls
 * (`ship_class_name` defaults to `name`, ShipEntity.m:391-392), so the ident
 * message needs the name only.
 *
 * The compiled `aiType` is the authored `ai_type`. Oolite replaces it at spawn
 * from `autoAImap.plist` when `auto_ai` is on; that is the populator's concern.
 * `autoAi` (below) records whether the ship takes part in that replacement.
 *
 * DATA-17 (plan 21-05) adds the fields the milestone's roles need: `bounty`,
 * `autoAi`, `autoWeapons`, `hasScoop`, `hasFuelInjection`, `fuel`,
 * `scoopPosition`, `countsAsKill`, `escorts`, `escortRoles`, `missiles` and
 * `maxMissiles`. Fuzzy booleans are stored as float32 probabilities, as
 * `fragmentChance` is, and are rolled per ship at spawn, never at compile time.
 */

import { canonicalJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import {
  MAX_RECORD_BOUNTY,
  NpcShipSchema,
  type NpcShip,
} from "../../../src/content/schemas/ship-npc.js";
import { boundingBox } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import { EMITTED_ENTRIES, MODEL_SOURCE_FILES, npcGlbFile } from "./glb.js";
import type { EmittedShips, ShipCatalogue } from "./ships.js";

/** Where the NPC records are written, repository-relative. */
export const NPC_SHIPS_PATH = "src/content/generated/ships-npc.json";

/**
 * The compiled NPC records (DATA-17, plan 21-08): the 28 records the milestone's
 * in-scope roles resolve to over the `like_ship`-resolved catalogue, plus
 * `shuttle`. The 28 are the non-template records whose role tokens (probability
 * suffixes stripped) name a trader, trader-courier, trader-smuggler, hunter,
 * hunter-medium, hunter-heavy, pirate, pirate fighter or interceptor or freighter
 * role, police, interceptor, wingman, escort, escort-medium or escort-heavy
 * (the roster test in `npc-ships.test.ts` derives them from `ships.json` and
 * fails on any difference); they sit on 18 models. `shuttle`'s only role is
 * `shuttle`, which the roadmap defers, but `INERT_POPULATION` and the `?test=1`
 * flyer hook still need it, so it stays (RESEARCH A1). A record owns one GLB,
 * named after its key (`npcGlbFile`). Code unit sorted, like `CLIENT_SHIP_KEYS`.
 */
export const NPC_SHIP_KEYS: readonly string[] = [
  "adder",
  "anaconda",
  "anaconda-pirate",
  "asp",
  "boa",
  "boa-mk2",
  "boa-mk2-pirate",
  "boa-pirate",
  "cobra3-alternate",
  "cobra3-pirate",
  "cobra3-trader",
  "cobramk1",
  "cobramk1-alt",
  "ferdelance",
  "gecko",
  "krait",
  "mamba",
  "mamba-escort",
  "moray",
  "morayMED",
  "python",
  "python-blackdog",
  "python-trader",
  "shuttle",
  "sidewinder",
  "sidewinder-escort",
  "viper",
  "viper-interceptor",
  "viper-pursuit",
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
 * Oolite's `laser_color` default: nil. `default_laser_color = [OOColor
 * brightColorWithDescription:[shipDict objectForKey:@"laser_color"]]`
 * (ShipEntity.m:421-427) is nil for an absent key, and then
 * `setWeaponDataFromType:` applies the weapon_info colour (ShipEntity.m:6469-6474).
 * An absent key compiles to null, never to a colour, so the weapon colour stays
 * the app's concern.
 */
export const DEFAULT_LASER_COLOR: readonly [number, number, number] | null =
  null;

/** Oolite's `bounty` default (`oo_unsignedIntForKey`, ShipEntity.m:559). */
export const DEFAULT_BOUNTY = 0;

/**
 * The largest compiled bounty: the entity field's limit (`MAX_BOUNTY` in
 * `src/sim/world/limits.ts`, 65535), narrower than Oolite's unsigned int so a
 * compiled record can never be refused at spawn.
 */
export const MAX_BOUNTY = MAX_RECORD_BOUNTY;

/**
 * Oolite's `auto_ai` default: a fuzzy boolean defaulting to yes
 * (`oo_fuzzyBooleanForKey:defaultValue:YES`, ShipEntity.m:6915).
 */
export const DEFAULT_AUTO_AI = 1;

/** Oolite's `auto_weapons` default, a fuzzy boolean defaulting to no (ShipEntity.m:6925). */
export const DEFAULT_AUTO_WEAPONS = 0;

/** Oolite's `has_scoop` default, a fuzzy boolean defaulting to no (ShipEntity.m:338). */
export const DEFAULT_HAS_SCOOP = 0;

/** Oolite's `has_fuel_injection` default, a fuzzy boolean defaulting to no (ShipEntity.m:361). */
export const DEFAULT_HAS_FUEL_INJECTION = 0;

/**
 * Oolite's `fuel` default (`oo_unsignedShortForKey`, ShipEntity.m:555; the
 * source comment there questions the 0, and 0 is what ships get).
 */
export const DEFAULT_FUEL = 0;

/** The largest `fuel` an unsigned short holds. */
export const MAX_FUEL = 65535;

/** Oolite's `counts_as_kill` default (`oo_boolForKey:defaultValue:YES`, ShipEntity.m:1529). */
export const DEFAULT_COUNTS_AS_KILL = true;

/** Oolite's `escorts` default (`oo_unsignedCharForKey:defaultValue:0`, ShipEntity.m:680). */
export const DEFAULT_ESCORTS = 0;

/** Oolite's `MAX_ESCORTS` (ShipEntity.h:76), the cap `escorts` is clamped to (ShipEntity.m:680). */
export const MAX_ESCORTS = 16;

/**
 * Oolite's `escort_roles` default: nil (`oo_arrayForKey:defaultValue:nil`,
 * ShipEntity.m:1543, :1621). Nil is not an empty list, so an absent key
 * compiles to null.
 */
export const DEFAULT_ESCORT_ROLES: readonly EscortRole[] | null = null;

/** Oolite's `missiles` default (`oo_intForKey:defaultValue:0`, ShipEntity.m:313). */
export const DEFAULT_MISSILES = 0;

/**
 * Oolite's `SHIPENTITY_MAX_MISSILES` (ShipEntity.h:79), the cap `max_missiles`
 * is clamped to (ShipEntity.m:326-328).
 */
export const SHIPENTITY_MAX_MISSILES = 32;

/**
 * The bounds of an `escort_roles` entry's `min` and `max`: Oolite reads both
 * with `oo_intForKey` into an `int8_t` (ShipEntity.m:1655-1656), and a negative
 * `min` is meaningful there ("a use to giving a negative value").
 */
export const ESCORT_BOUND_MIN = -128;
export const ESCORT_BOUND_MAX = 127;

/** One authored `escort_roles` entry (ShipEntity.m:1655-1658). */
export interface EscortRole {
  readonly min: number;
  readonly max: number;
  readonly role: string;
}

/**
 * The fifteen named colours of OOColor (OOColor.m:234-307, the `+fooColor`
 * class methods that `colorWithDescription:` reaches for a description with the
 * `Color` suffix, OOColor.m:150-153), each channel as a float32 (`colorWithWhite:`
 * sets all three to the one value). Alpha is left out: a laser shot ignores it
 * (OOLaserShotEntity.m:134-140).
 */
export const OOCOLOR_NAMED_RGB: Readonly<
  Record<string, readonly [number, number, number]>
> = Object.freeze({
  blackColor: [0, 0, 0],
  darkGrayColor: [Math.fround(1 / 3), Math.fround(1 / 3), Math.fround(1 / 3)],
  lightGrayColor: [Math.fround(2 / 3), Math.fround(2 / 3), Math.fround(2 / 3)],
  whiteColor: [1, 1, 1],
  grayColor: [0.5, 0.5, 0.5],
  redColor: [1, 0, 0],
  greenColor: [0, 1, 0],
  blueColor: [0, 0, 1],
  cyanColor: [0, 1, 1],
  yellowColor: [1, 1, 0],
  magentaColor: [1, 0, 1],
  orangeColor: [1, Math.fround(0.5), 0],
  purpleColor: [Math.fround(0.5), 0, Math.fround(0.5)],
  brownColor: [Math.fround(0.6), Math.fround(0.4), Math.fround(0.2)],
  clearColor: [0, 0, 0],
});

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
 * time 1.5 s, scanner range 25600 m and no port or starboard weapon. The port
 * derives which attack sub-behaviours the ships can reach from those defaults,
 * so a pin bump that authors one of these keys must fail the build and needs a
 * new decision, not a silent change in reachability.
 *
 * Plan 21-05 (DATA-17) lifted the refusal of the aft weapon key only: six hulls
 * of the v2.4 roster author it. The per-facing weapon state is snapshot v5
 * (plan 21-03), the fire path's facing shape is plan 21-12, and AI-driven aft
 * fire is CBT-19 in Phase 23. The other five keys stay refused, and the build
 * re-checks them over every record.
 *
 * `has_fuel_injection` (the afterburner) and `missiles`/`max_missiles` are now
 * compiled as data (DATA-17, plan 21-05): the injector is consumed from Phase
 * 22, and no one consumes the missile counts in v2.4 (FIDELITY E-194, the
 * tripwire `tests/guards/npc-missiles-tripwire.test.ts`). `has_escape_pod` and
 * `heat_insulation` are not compiled (FIDELITY E-195 and E-196).
 */
export const STEERING_ASSUMED_ABSENT_KEYS: readonly string[] = [
  "accuracy",
  "reaction_time",
  "scanner_range",
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
 * A fuzzy boolean extra as a float32 probability in 0..1, or the default when
 * the key is absent (Oolite's `oo_fuzzyBooleanForKey:defaultValue:`, which rolls
 * the probability at ship setup; the record keeps the probability and the roll
 * is per ship at spawn, Phase 22). `yes` and `no` arrive as booleans and give 1
 * and 0.
 *
 * Deliberate narrowing, in the style of `fragment_chance`: Oolite also accepts
 * string spellings and treats a number above 1 as certain; the converter reads a
 * boolean or a finite number in 0..1 only, and a present value outside that
 * fails the build rather than taking the default.
 */
function fuzzyExtra(
  key: string,
  extras: Record<string, unknown>,
  field: string,
  fallback: number,
): number {
  const value = extras[field];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    return fail(
      key,
      `${field} is not a boolean or a number in 0..1: ${JSON.stringify(value)}`,
    );
  }
  return Math.fround(value);
}

/**
 * A boolean extra, or the default when the key is absent (Oolite's
 * `oo_boolForKey:defaultValue:`). A present non-boolean value fails the build.
 */
function boolExtra(
  key: string,
  extras: Record<string, unknown>,
  field: string,
  fallback: boolean,
): boolean {
  const value = extras[field];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    return fail(key, `${field} is not a boolean: ${JSON.stringify(value)}`);
  }
  return value;
}

/** An unsigned integer extra that must not exceed `max` (a larger present value fails the build). */
function boundedUintExtra(
  key: string,
  extras: Record<string, unknown>,
  field: string,
  fallback: number,
  max: number,
): number {
  const value = uintExtra(key, extras, field, fallback);
  if (value > max) {
    return fail(key, `${field} ${String(value)} is above the limit ${max}`);
  }
  return value;
}

/**
 * `escort_roles` as a copy of the authored list of `{ min, max, role }`, or
 * null when the key is absent (ShipEntity.m:1543, :1621). Oolite reads `min` and
 * `max` with `oo_intForKey` into an `int8_t` and the role with a default of
 * "escort" (ShipEntity.m:1655-1658); here every authored entry must carry all
 * three, the bounds must be integers inside the `int8_t` range, and the role may
 * be an empty string (the stock Boa authors one, for its spare wandering
 * escorts). Anything else fails the build.
 */
function escortRolesExtra(
  key: string,
  extras: Record<string, unknown>,
): EscortRole[] | null {
  const value = extras["escort_roles"];
  if (value === undefined) return DEFAULT_ESCORT_ROLES as null;
  if (!Array.isArray(value)) {
    return fail(key, `escort_roles is not an array: ${JSON.stringify(value)}`);
  }
  const inRange = (bound: unknown): bound is number =>
    typeof bound === "number" &&
    Number.isInteger(bound) &&
    bound >= ESCORT_BOUND_MIN &&
    bound <= ESCORT_BOUND_MAX;
  return value.map((item: unknown, index: number): EscortRole => {
    const entry =
      typeof item === "object" && item !== null && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : undefined;
    const min = entry?.["min"];
    const max = entry?.["max"];
    const role = entry?.["role"];
    if (!inRange(min) || !inRange(max) || typeof role !== "string") {
      return fail(
        key,
        `escort_roles[${String(index)}] is not { min, max, role } with integer ` +
          `bounds in ${String(ESCORT_BOUND_MIN)}..${String(ESCORT_BOUND_MAX)}: ` +
          JSON.stringify(item),
      );
    }
    return { min, max, role };
  });
}

/**
 * `missiles` and `max_missiles`, as data only: no spawn path reads them in v2.4,
 * every NPC launches with none (FIDELITY E-194, the tripwire
 * `tests/guards/npc-missiles-tripwire.test.ts`, CBT-19 in Phase 23).
 *
 * Oolite's resolution (ShipEntity.m:313-328): `max_missiles` defaults to
 * `missiles`, is clamped to `SHIPENTITY_MAX_MISSILES`, and `missiles` is then
 * clamped to it. The reader applies the same clamps, and fails the build on a
 * negative or non-integer value (Oolite reads a signed int). The
 * `has_energy_bomb` slot adjustment (ShipEntity.m:343-358) is not ported.
 */
function missileCounts(
  key: string,
  extras: Record<string, unknown>,
): { missiles: number; maxMissiles: number } {
  const authored = uintExtra(key, extras, "missiles", DEFAULT_MISSILES);
  const maxMissiles = Math.min(
    uintExtra(key, extras, "max_missiles", authored),
    SHIPENTITY_MAX_MISSILES,
  );
  return { missiles: Math.min(authored, maxMissiles), maxMissiles };
}

/**
 * One facing's weapon equipment key. Oolite reads a facing's type only when its
 * `weapon_facings` bit is set (ShipEntity.m:299-306), so a clear bit gives the
 * facing default whatever the plist authors. With the bit set, an absent key is
 * the default and an authored name maps through `FORWARD_WEAPON_KEYS`; an
 * unknown name fails the build (T-13-29).
 *
 * Exported so the converter test can pin the aft, port and starboard mapping
 * directly. The aft type compiles from plan 21-05 on (DATA-17); the refusal loop
 * in `compileNpcShips` still keeps every catalogue from authoring a port or
 * starboard type.
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
 * `laser_color` as the float32 RGB of the shot colour, or null when the key is
 * absent (ShipEntity.m:421-427, where the weapon_info colour then applies,
 * ShipEntity.m:6469-6474).
 *
 * Oolite reads the key with `brightColorWithDescription:` (OOColor.m:202-209):
 * `colorWithDescription:` accepts a `...Color` name (a class selector, so an
 * unknown name silently gives nil), a string of floats, an array and an RGB or
 * HSB dictionary (OOColor.m:140-199), and the result is returned unchanged when
 * its brightness, the largest of r, g and b (OOColor.m:397-401), is at least
 * 0.5; otherwise it is rebuilt through an HSB round trip at brightness 0.5
 * (OOColor.m:403-428, with a `+ 0.0001f` hue fudge).
 *
 * Deliberate narrowing, in the style of `fragment_chance`: only OOColor's
 * fifteen named colours (`OOCOLOR_NAMED_RGB`) with a brightness of at least 0.5
 * compile. The vendored data authors named colours only, and the stock value
 * (magentaColor, brightness 1) is unaffected by the brightening. Everything
 * else fails the build: an unknown name (Oolite would fall back silently), a
 * numeric string, an array or a dictionary (not ported), and blackColor,
 * darkGrayColor and clearColor (brightness below 0.5, whose HSB rebuild is not
 * ported). A pin bump that authors another form must fail loudly instead of
 * drawing a wrong colour.
 *
 * Exported so the converter test can pin every accepted and refused form
 * directly.
 */
export function laserColorExtra(
  key: string,
  extras: Record<string, unknown>,
): [number, number, number] | null {
  const value = extras["laser_color"];
  if (value === undefined) return DEFAULT_LASER_COLOR as null;
  if (typeof value !== "string" || !Object.hasOwn(OOCOLOR_NAMED_RGB, value)) {
    return fail(
      key,
      `laser_color is not one of OOColor's named colours: ${JSON.stringify(value)}`,
    );
  }
  const rgb = OOCOLOR_NAMED_RGB[value] ?? [0, 0, 0];
  if (Math.max(rgb[0], rgb[1], rgb[2]) < 0.5) {
    return fail(
      key,
      `laser_color ${JSON.stringify(value)} is below brightness 0.5; ` +
        `its HSB rebuild (OOColor.m:403-428) is not ported`,
    );
  }
  return [rgb[0], rgb[1], rgb[2]];
}

/**
 * The hull box of a parsed mesh as `{ min, max }`, each component the float32
 * of the vertex extreme (Oolite stores vertices as `GLfloat` and builds the
 * drawable's box from them, OOMesh.m:1786-1805). Oolite's model axes, no
 * subentity (none of the nine hulls has a solid one, D16-23).
 */
function hullBox(mesh: ParsedMesh): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const box = boundingBox(mesh);
  return {
    min: [
      Math.fround(box.min.x),
      Math.fround(box.min.y),
      Math.fround(box.min.z),
    ],
    max: [
      Math.fround(box.max.x),
      Math.fround(box.max.y),
      Math.fround(box.max.z),
    ],
  };
}

/**
 * Compile the NPC records from the resolved catalogue, in `NPC_SHIP_KEYS`
 * order.
 *
 * `masses` maps each key to its computed float32 mass and `radii` to its
 * computed float32 collision radius; a key without one fails through
 * `NpcShipSchema` as `<key>.mass` or `<key>.radius`. `models` holds the parsed
 * vendored meshes by file name (the same record the masses and radii read);
 * each record's `boundingBox` comes from its own model's mesh.
 *
 * @throws {ContentError} when a key is missing, has no roles or no model, owns
 * a GLB row other than its own, has no parsed mesh for its model, or fails
 * `NpcShipSchema`.
 */
export function compileNpcShips(
  catalogue: ShipCatalogue,
  masses: ReadonlyMap<string, number>,
  radii: ReadonlyMap<string, number>,
  models: Readonly<Record<string, ParsedMesh>>,
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
    const file = npcGlbFile(key);
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
    // The aft refusal was lifted by plan 21-05 (snapshot v5 holds per-facing
    // weapon state); the port and starboard types stay refused.
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

    // `Object.hasOwn`, so a model file named like a prototype key cannot
    // reach a non-mesh value.
    const mesh = Object.hasOwn(models, entry.model)
      ? models[entry.model]
      : undefined;
    if (mesh === undefined) {
      return fail(key, `no parsed mesh for the model ${entry.model}`);
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
      laserColor: laserColorExtra(key, entry.extras),
      boundingBox: hullBox(mesh),
      bounty: boundedUintExtra(
        key,
        entry.extras,
        "bounty",
        DEFAULT_BOUNTY,
        MAX_BOUNTY,
      ),
      autoAi: fuzzyExtra(key, entry.extras, "auto_ai", DEFAULT_AUTO_AI),
      autoWeapons: fuzzyExtra(
        key,
        entry.extras,
        "auto_weapons",
        DEFAULT_AUTO_WEAPONS,
      ),
      hasScoop: fuzzyExtra(key, entry.extras, "has_scoop", DEFAULT_HAS_SCOOP),
      hasFuelInjection: fuzzyExtra(
        key,
        entry.extras,
        "has_fuel_injection",
        DEFAULT_HAS_FUEL_INJECTION,
      ),
      fuel: boundedUintExtra(key, entry.extras, "fuel", DEFAULT_FUEL, MAX_FUEL),
      scoopPosition: positionExtra(key, entry.extras, "scoop_position"),
      countsAsKill: boolExtra(
        key,
        entry.extras,
        "counts_as_kill",
        DEFAULT_COUNTS_AS_KILL,
      ),
      escorts: boundedUintExtra(
        key,
        entry.extras,
        "escorts",
        DEFAULT_ESCORTS,
        MAX_ESCORTS,
      ),
      escortRoles: escortRolesExtra(key, entry.extras),
      ...missileCounts(key, entry.extras),
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

/**
 * Serialise the NPC records as canonical JSON, in `NPC_SHIP_KEYS` order. The
 * arguments are those of `compileNpcShips`: the computed masses and radii and
 * the parsed meshes the bounding boxes are measured from.
 */
export function emitNpcShips(
  catalogue: ShipCatalogue,
  masses: ReadonlyMap<string, number>,
  radii: ReadonlyMap<string, number>,
  models: Readonly<Record<string, ParsedMesh>>,
): EmittedShips {
  const records = compileNpcShips(catalogue, masses, radii, models);
  return {
    path: NPC_SHIPS_PATH,
    bytes: Buffer.from(canonicalJson(records), "utf8"),
  };
}
