// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `shipdata.plist` (resolved catalogue) → the NPC ship records
 * (DATA-10, DATA-11 stage 1, DATA-13, D-02, D-06, T-09-16, T-09-19).
 *
 * Phase 12's populator picks ships by role and needs, per ship, its roles, AI
 * name, scan class and model, plus the URL of the model it fetches on demand.
 * This module compiles exactly those six fields and nothing else: no combat or
 * flight stat (DATA-15 is deferred), no subentity, material, weapon or
 * `auto_ai`. Phase 10 adds the mass to the same record.
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

function fail(key: string, detail: string): never {
  throw contentError("SCHEMA", NPC_SHIPS_PATH, key, { excerpt: detail });
}

/**
 * Compile the NPC records from the resolved catalogue, in `NPC_SHIP_KEYS`
 * order.
 *
 * @throws {ContentError} when a key is missing, has no roles or no model, owns
 * a GLB row other than its own, or fails `NpcShipSchema`.
 */
export function compileNpcShips(catalogue: ShipCatalogue): NpcShip[] {
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
    const candidate = {
      key,
      roles: [...entry.roles],
      aiType: typeof aiType === "string" ? aiType : DEFAULT_AI_TYPE,
      scanClass: typeof scanClass === "string" ? scanClass : DEFAULT_SCAN_CLASS,
      model: entry.model,
      glb: `models/${file}`,
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
export function emitNpcShips(catalogue: ShipCatalogue): EmittedShips {
  const records = compileNpcShips(catalogue);
  return {
    path: NPC_SHIPS_PATH,
    bytes: Buffer.from(canonicalJson(records), "utf8"),
  };
}
