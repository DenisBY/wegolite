// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The commodity record schema (D-13, D-15, D-16).
 *
 * This is the single source of truth for the emitted shape: `Commodity` is
 * `z.infer`red from it, so the record and its type cannot drift. The schema is
 * **strict** because this describes our own output, never a raw Oolite
 * dictionary; a leaked field is a bug, not tomorrow's data.
 *
 * Money is integer decicredits (`priceAverage`); the five market ratios are
 * authored reals and must never be `.int()`-coerced. `podConversion` is carried
 * metadata for Phase 5 and is never applied here. `name` is the resolved
 * human-readable display string compiled from `descriptions.plist`; `key` stays
 * the identity (D-21). `peakExport`/`peakImport` are Oolite's authored
 * economy peaks (0..7) and feed only the market bias formula.
 */

import { z } from "zod";

export const CommodityUnitSchema = z.enum(["t", "kg", "g"]);

export const PodConversionSchema = z.strictObject({
  kilogramsPerUnit: z.number(),
});

export const CommoditySchema = z.strictObject({
  key: z.string(),
  name: z.string(),
  classes: z.array(z.string()),
  unit: CommodityUnitSchema,
  podConversion: PodConversionSchema,
  priceAverage: z.number().int(),
  priceEconomic: z.number(),
  priceRandom: z.number(),
  quantityAverage: z.number(),
  quantityEconomic: z.number(),
  quantityRandom: z.number(),
  peakExport: z.number().int().min(0).max(7),
  peakImport: z.number().int().min(0).max(7),
  legalityExport: z.number().int(),
  legalityImport: z.number().int(),
  trumbleOpinion: z.number(),
  sortOrder: z.number().int(),
  tradeable: z.boolean(),
});

export type Commodity = z.infer<typeof CommoditySchema>;
export type CommodityUnit = z.infer<typeof CommodityUnitSchema>;
