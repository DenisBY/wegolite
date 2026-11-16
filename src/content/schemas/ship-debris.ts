// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The debris record (DATA-16, D16-07, D16-16).
 *
 * One record per debris model the kill path releases: the cargo barrel
 * (`pod`), the alloy plate (`plate`) and the five wrecks (`wreck`). Each
 * carries the authored model, the GLB the client fetches on demand, the Oolite
 * float32 mass and collision radius computed at build time from the vendored
 * `.dat` (`tools/oolite-ingest/convert/ship-mass.ts` and `ship-radius.ts`), and
 * the tumble rates `max_flight_roll` and `max_flight_pitch` (defaults 2.0 and
 * 1.0, ShipEntity.m:265-266). The strict object rejects any extra field.
 *
 * `glb` and `model` become fetch paths, so both are pattern-checked (T-16-08);
 * the numbers are finite and bounded by the sim's domains, restated in
 * `./ship-npc.ts`.
 */

import { z } from "zod";

import {
  MAX_FLIGHT_MAGNITUDE_BOUND,
  MAX_FLIGHT_RATE_BOUND,
  NPC_GLB_PATH_PATTERN,
} from "./ship-npc.js";

/** The most records a catalogue may hold; the stock set is seven. */
export const MAX_DEBRIS_RECORDS = 16;

export const DebrisRecordSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  role: z.enum(["pod", "plate", "wreck"]),
  model: z.string().regex(/^(oolite_[a-z0-9_]+|wreck[1-9])\.dat$/),
  glb: z.string().regex(NPC_GLB_PATH_PATTERN),
  // `z.number()` already rejects NaN and Infinity.
  mass: z.number().positive().max(MAX_FLIGHT_MAGNITUDE_BOUND),
  radius: z.number().positive().max(MAX_FLIGHT_MAGNITUDE_BOUND),
  maxFlightRoll: z.number().nonnegative().max(MAX_FLIGHT_RATE_BOUND),
  maxFlightPitch: z.number().nonnegative().max(MAX_FLIGHT_RATE_BOUND),
});

export const DebrisCatalogueSchema = z
  .array(DebrisRecordSchema)
  .min(1)
  .max(MAX_DEBRIS_RECORDS)
  .refine(
    (records) =>
      new Set(records.map((record) => record.key)).size === records.length,
    { message: "debris keys must be unique" },
  );

export type DebrisRecord = z.infer<typeof DebrisRecordSchema>;
export type DebrisCatalogue = z.infer<typeof DebrisCatalogueSchema>;
