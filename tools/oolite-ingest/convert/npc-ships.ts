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
 * forward weapon and forward weapon position. Nothing else: no other combat or
 * flight stat, no subentity, material or `auto_ai`. No class field is compiled:
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

/** Oolite's `forward_weapon_type` default (ShipEntity.m:300). */
export const DEFAULT_FORWARD_WEAPON = "EQ_WEAPON_NONE";

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
 * `weapon_position_forward` as three float32 numbers in Oolite's frame, 0 0 0
 * when absent (`oo_vectorForKey:defaultValue:kZeroVector`, ShipEntity.m:1801;
 * the stock ships author no `weapon_mount_mode` and no `scale_factor`, so the
 * single-mount, unscaled branch applies). Negative zero is normalised to zero.
 */
function positionExtra(
  key: string,
  extras: Record<string, unknown>,
): [number, number, number] {
  const value = extras["weapon_position_forward"];
  if (value === undefined) return [0, 0, 0];
  const parts =
    typeof value === "string" ? value.trim().split(/\s+/).map(Number) : [];
  if (parts.length !== 3 || !parts.every((part) => Number.isFinite(part))) {
    return fail(
      key,
      `weapon_position_forward is not three numbers: ${JSON.stringify(value)}`,
    );
  }
  const [x = 0, y = 0, z = 0] = parts.map((part) => {
    const single = Math.fround(part);
    return single === 0 ? 0 : single;
  });
  return [x, y, z];
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

    const aiType = entry.extras["ai_type"];
    const scanClass = entry.extras["scan_class"];
    const displayName = entry.extras["display_name"];
    const authoredName = entry.extras["name"];
    const weaponType = entry.extras["forward_weapon_type"];
    let forwardWeapon: string | undefined = DEFAULT_FORWARD_WEAPON;
    if (weaponType !== undefined) {
      forwardWeapon =
        typeof weaponType === "string" &&
        Object.hasOwn(FORWARD_WEAPON_KEYS, weaponType)
          ? FORWARD_WEAPON_KEYS[weaponType]
          : fail(
              key,
              `unknown forward_weapon_type ${JSON.stringify(weaponType)}`,
            );
    }
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
      forwardWeapon,
      forwardWeaponPosition: positionExtra(key, entry.extras),
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
