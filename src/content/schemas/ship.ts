// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shipdata catalogue schemas (DATA-02, DATA-07, D-11, D-16, D-24).
 *
 * `CatalogEntrySchema` is **strict** because it describes our own record. The
 * two raw Oolite sub-dictionaries — `extras` and the material configuration —
 * are open `z.record` values on purpose: the next snapshot bump may add a key,
 * and that key must survive rather than fail the build.
 *
 * `market_definition` is a **tri-state discriminated union**, not an optional
 * array: "the key is absent" (blank market), "the key is an empty array"
 * (system prices), and "the key holds definitions" are three different facts
 * and Phase 5 consumes them differently.
 *
 * `SubentitySchema` preprocesses `isDock`, because the pinned station authors
 * the bare token `is_dock = true`, which the OpenStep parser correctly carries
 * as the string `"true"`. The coercion mirrors Oolite's boolean predicate, so
 * the typed projection exposes a boolean while `extras.subentities` keeps the
 * authored string.
 */

import { z } from "zod";

const BOOLEAN_STRINGS_TRUE = new Set(["yes", "true", "on"]);
const BOOLEAN_STRINGS_FALSE = new Set(["no", "false", "off", ""]);

function coerceBooleanValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (BOOLEAN_STRINGS_TRUE.has(text)) return true;
    if (BOOLEAN_STRINGS_FALSE.has(text)) return false;
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed !== 0 : value;
  }
  return value;
}

const CoercedBooleanSchema = z.preprocess(coerceBooleanValue, z.boolean());

export const MarketDefinitionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("absent") }),
  z.strictObject({ kind: z.literal("empty") }),
  z.strictObject({
    kind: z.literal("explicit"),
    definitions: z.array(z.record(z.string(), z.unknown())),
  }),
]);

export const SubentitySchema = z
  .object({
    subentity_key: z.string().optional(),
    type: z.string().optional(),
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
    isDock: CoercedBooleanSchema.optional(),
  })
  .passthrough();

export const ShipDefSchema = z.object({
  model: z.string().nullable(),
  roles: z.array(z.string()).nullable(),
  maxFlightSpeed: z.number().optional(),
  thrust: z.number().optional(),
  maxFlightPitch: z.number().optional(),
  maxFlightRoll: z.number().optional(),
  maxCargo: z.number().optional(),
  fuel: z.number().optional(),
  energyRecharge: z.number().optional(),
  stationRoll: z.number().optional(),
  rotating: CoercedBooleanSchema.optional(),
  isDock: CoercedBooleanSchema.optional(),
  smooth: CoercedBooleanSchema,
  materials: z.record(z.string(), z.record(z.string(), z.unknown())),
  subentities: z.array(SubentitySchema),
});

export const CatalogEntrySchema = z.strictObject({
  key: z.string(),
  isTemplate: z.boolean(),
  roles: z.array(z.string()).nullable(),
  model: z.string().nullable(),
  modelVendored: z.boolean(),
  usable: z.boolean(),
  marketDefinition: MarketDefinitionSchema,
  shipDef: ShipDefSchema,
  extras: z.record(z.string(), z.unknown()),
});

export const ShipCatalogueSchema = z.array(CatalogEntrySchema);

export type MarketDefinition = z.infer<typeof MarketDefinitionSchema>;
export type Subentity = z.infer<typeof SubentitySchema>;
export type ShipDef = z.infer<typeof ShipDefSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type ShipCatalogue = z.infer<typeof ShipCatalogueSchema>;
