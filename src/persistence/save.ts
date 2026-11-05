// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The versioned save blob (D-13, D-14, D-15, T-04-24…T-04-27).
 *
 * A save is a plain JSON string in IndexedDB, exactly like the settings blob is
 * a plain JSON string in `localStorage`: one `JSON.parse` and one strict schema,
 * no structured-clone object and no object merge. `version` is a literal, so a
 * blob from a future build is recognised *before* the schema runs and is then
 * left untouched — the same rule `src/settings/store.ts` applies to newer
 * settings versions.
 *
 * Three separate resource bounds run in this order, and the order is the
 * contract (T-04-27/T-04-49):
 *
 * 1. `MAX_SAVE_CHARS` is checked before `JSON.parse`, so boot never parses an
 *    unbounded string;
 * 2. the strict schema caps every field;
 * 3. the allow-lists reject an equipment key, system id or station key this
 *    build does not know, so a forged value can never reach `findShip` or the
 *    equipment catalogue.
 *
 * The save carries no docked pose, no timestamp and no host data: the pose is
 * derived from the layout on restore (D-13).
 */

import { z } from "zod";

import { CLOCK_START } from "../sim/flight/state.js";

/** The schema version this build writes and accepts. */
export const SAVE_VERSION = 1;

/** The largest raw blob the parser will even attempt to parse. */
export const MAX_SAVE_CHARS = 4096;

/** The most equipment keys one profile may carry. */
export const MAX_SAVE_EQUIPMENT = 64;

/** The longest equipment key accepted. */
export const MAX_SAVE_EQUIPMENT_KEY_CHARS = 64;

/** The longest system id accepted (`g0-s7` is the real shape). */
export const MAX_SAVE_SYSTEM_ID_CHARS = 16;

/** The longest station key accepted (`coriolis-station` is the real shape). */
export const MAX_SAVE_STATION_KEY_CHARS = 64;

/** A clock more than this far ahead of `CLOCK_START` is not credible. */
export const MAX_SAVE_CLOCK_DELTA = 1_000_000_000_000;

/** The largest credit balance in decicredits the schema accepts. */
export const MAX_SAVE_CREDITS = 1_000_000_000_000;

export const SaveV1Schema = z.strictObject({
  version: z.literal(SAVE_VERSION),
  mode: z.literal("docked"),
  clockSeconds: z
    .number()
    .int()
    .min(CLOCK_START)
    .max(CLOCK_START + MAX_SAVE_CLOCK_DELTA),
  credits: z.number().int().min(0).max(MAX_SAVE_CREDITS),
  equipment: z
    .array(z.string().min(1).max(MAX_SAVE_EQUIPMENT_KEY_CHARS))
    .max(MAX_SAVE_EQUIPMENT),
  system: z.strictObject({
    id: z.string().min(1).max(MAX_SAVE_SYSTEM_ID_CHARS),
  }),
  station: z.strictObject({
    key: z.string().min(1).max(MAX_SAVE_STATION_KEY_CHARS),
  }),
});

export type SaveV1 = z.infer<typeof SaveV1Schema>;

/** The catalogue facts a boot must supply before a blob can be trusted. */
export interface SaveAllowLists {
  readonly equipment: ReadonlySet<string>;
  readonly systems: ReadonlySet<string>;
  readonly stations: ReadonlySet<string>;
}

export type SaveParseFailure = "corrupt" | "future-version" | "absent";

export type SaveParseResult =
  | { readonly ok: true; readonly save: SaveV1 }
  | { readonly ok: false; readonly reason: SaveParseFailure };

/** The trusted values `encodeSave` projects into a `SaveV1`. */
export interface SaveInputs {
  readonly clockSeconds: number;
  readonly credits: number;
  readonly equipment: readonly string[];
  readonly systemId: string;
  readonly stationKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate an untrusted blob against the schema and the boot allow-lists.
 *
 * The order is load-bearing: absent, size cap, parse, future version, strict
 * schema, allow-lists. A `null` raw value is the only input that produces
 * `absent`; a store read failure is converted to `null` by the caller.
 */
export function parseSave(
  raw: string | null,
  allow: SaveAllowLists,
): SaveParseResult {
  if (raw === null) return { ok: false, reason: "absent" };
  // T-04-27/T-04-49: reject an oversized blob *before* JSON.parse. A cap that
  // ran after parsing would still allocate the attacker's string.
  if (raw.length > MAX_SAVE_CHARS) return { ok: false, reason: "corrupt" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "corrupt" };
  }

  // A version newer than this build is not a save this build understands. It is
  // reported separately and the caller must never clear or overwrite it.
  if (isRecord(parsed)) {
    const version = parsed["version"];
    if (typeof version === "number" && version > SAVE_VERSION) {
      return { ok: false, reason: "future-version" };
    }
  }

  const result = SaveV1Schema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: "corrupt" };
  const save = result.data;

  // The schema proves the shape; the allow-lists prove the referents exist. A
  // duplicate key is corrupt because it would restore an ambiguous profile.
  const seen = new Set<string>();
  for (const key of save.equipment) {
    if (seen.has(key) || !allow.equipment.has(key)) {
      return { ok: false, reason: "corrupt" };
    }
    seen.add(key);
  }
  if (!allow.systems.has(save.system.id)) {
    return { ok: false, reason: "corrupt" };
  }
  if (!allow.stations.has(save.station.key)) {
    return { ok: false, reason: "corrupt" };
  }

  return { ok: true, save };
}

/**
 * Validate an encoded blob against the writer's own contract.
 *
 * `queueAutosave` runs this before `store.write`: a snapshot that would encode
 * to a blob this build rejects must never replace the last good save. The
 * allow-lists are not consulted here — they depend on boot content — only the
 * size cap and the strict schema the parser applies first.
 */
export function isEncodedSaveValid(raw: string): boolean {
  if (raw.length > MAX_SAVE_CHARS) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  return SaveV1Schema.safeParse(parsed).success;
}

/**
 * Project trusted values into the canonical blob.
 *
 * `mode` is always `"docked"`: a save written at launch records "resume docked
 * at this clock", which is the post-`beginLaunch` clock (+600 s already
 * applied). The docked pose is not written — it is derived from the layout.
 */
export function encodeSave(inputs: SaveInputs): string {
  const save: SaveV1 = {
    version: SAVE_VERSION,
    mode: "docked",
    clockSeconds: inputs.clockSeconds,
    credits: inputs.credits,
    equipment: [...inputs.equipment],
    system: { id: inputs.systemId },
    station: { key: inputs.stationKey },
  };
  return JSON.stringify(save);
}
