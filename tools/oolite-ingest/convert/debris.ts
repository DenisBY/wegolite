// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `shipdata.plist` (resolved catalogue) and the vendored `.dat` models → the
 * debris catalogue (DATA-16, D16-07, D16-16).
 *
 * One record per debris model the kill path releases: the cargo barrel (the
 * `pod` role, Oolite's anonymous `cargopod`), the alloy plate (the `plate`
 * role; Oolite's second, scar-textured plate entry is not compiled, D16-07)
 * and the five wrecks (the `wreck` role, in shipdata order, D16-16). Each
 * record carries the authored model, the GLB the client fetches, the Oolite
 * mass and collision radius computed at build time from the vendored `.dat` (`ship-mass.ts` and
 * `ship-radius.ts`, handed in), and the tumble rates `max_flight_roll` and
 * `max_flight_pitch` as float32 with Oolite's defaults 2.0 and 1.0
 * (ShipEntity.m:265-266). Nothing else: the sim's debris record needs no other
 * authored field.
 */

import { canonicalJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import {
  DebrisRecordSchema,
  type DebrisRecord,
} from "../../../src/content/schemas/ship-debris.js";
import { EMITTED_ENTRIES, MODEL_SOURCE_FILES, debrisGlbFile } from "./glb.js";
// Oolite's defaults 2.0 and 1.0 (ShipEntity.m:265-266), shared with the NPC records.
import {
  DEFAULT_MAX_FLIGHT_PITCH,
  DEFAULT_MAX_FLIGHT_ROLL,
} from "./npc-ships.js";
import type { EmittedShips, ShipCatalogue } from "./ships.js";

/** Where the debris catalogue is written, repository-relative. */
export const DEBRIS_PATH = "src/content/generated/ships-debris.json";

export type DebrisRole = "pod" | "plate" | "wreck";

/** The compiled debris entries, in catalogue order. */
export const DEBRIS_ENTRIES: readonly {
  readonly key: string;
  readonly role: DebrisRole;
}[] = [
  { key: "barrel", role: "pod" },
  { key: "alloy", role: "plate" },
  { key: "wreckage-component", role: "wreck" },
  { key: "more-wreckage2", role: "wreck" },
  { key: "more-wreckage3", role: "wreck" },
  { key: "more-wreckage4", role: "wreck" },
  { key: "more-wreckage5", role: "wreck" },
];

function fail(key: string, detail: string): never {
  throw contentError("SCHEMA", DEBRIS_PATH, key, { excerpt: detail });
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
 * Compile the debris records from the resolved catalogue, in `DEBRIS_ENTRIES`
 * order.
 *
 * @throws {ContentError} SCHEMA naming the key when an entry is missing, has no
 * model, owns a GLB row other than its own, or fails `DebrisRecordSchema` (a
 * missing mass or radius fails as `<key>.mass` or `<key>.radius`).
 */
export function compileDebris(
  catalogue: ShipCatalogue,
  masses: ReadonlyMap<string, number>,
  radii: ReadonlyMap<string, number>,
): DebrisRecord[] {
  return DEBRIS_ENTRIES.map(({ key, role }) => {
    const entry = catalogue.entries.find((candidate) => candidate.key === key);
    if (entry === undefined) {
      return fail(key, `the compiled ship catalogue has no "${key}" entry`);
    }
    if (entry.model === null) {
      return fail(key, "the entry has no model");
    }

    // The GLB is built from this record's own model and owned by this key alone.
    const file = debrisGlbFile(entry.model);
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

    const candidate = {
      key,
      role,
      model: entry.model,
      glb: `models/${file}`,
      mass: masses.get(key),
      radius: radii.get(key),
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
    };

    const parsed = DebrisRecordSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(
        issue === undefined ? key : `${key}.${issue.path.join(".")}`,
        issue === undefined ? "invalid debris record" : issue.message,
      );
    }
    return parsed.data;
  });
}

/** Serialise the debris records as canonical JSON, in `DEBRIS_ENTRIES` order. */
export function emitDebris(
  catalogue: ShipCatalogue,
  masses: ReadonlyMap<string, number>,
  radii: ReadonlyMap<string, number>,
): EmittedShips {
  const records = compileDebris(catalogue, masses, radii);
  return {
    path: DEBRIS_PATH,
    bytes: Buffer.from(canonicalJson(records), "utf8"),
  };
}
