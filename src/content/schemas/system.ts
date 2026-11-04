// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The system record schema (D-12, D-15, D-16, D-22, D-25).
 *
 * This is the single source of truth for the emitted shape: `System` is
 * `z.infer`red from it, so the record and its type cannot drift.
 *
 * The record is **open** (`z.looseObject`, the zod 4 spelling of
 * `.passthrough()`): it models all 40 keys every pinned system carries, but a
 * bump that adds an authored key must not be silently rejected. Only our own
 * wrapper fields (`id`, `galaxy`, …) are guaranteed.
 *
 * Two tuple shapes exist and they are not interchangeable: Oolite's authored
 * colours are four components, its vectors three. `sun_color` is a colour, not
 * a vector — grouping it with the vectors would reject all 2,048 systems.
 *
 * Raw values are stored as authored: `radiusKm` is the plist `radius` (km, no
 * ×10 game-unit scaling), `techLevelRaw` is the plist `techlevel` (no +1
 * display adjustment), and `station` keeps the role fragment (`coriolis`)
 * rather than being resolved to a ship key.
 */

import { z } from "zod";

export const SystemVectorSchema = z.tuple([z.number(), z.number(), z.number()]);

export const SystemColorSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export const SystemSchema = z.looseObject({
  id: z.string(),
  galaxy: z.number().int().min(0).max(7),
  systemIndex: z.number().int().min(0).max(255),
  name: z.string(),
  chartX: z.number().int(),
  chartY: z.number().int(),
  economy: z.number().int(),
  government: z.number().int(),
  techLevelRaw: z.number().int(),
  population: z.number().int(),
  productivity: z.number().int(),
  radiusKm: z.number().int(),
  planetDistance: z.number(),
  sunDistance: z.number(),
  sunRadius: z.number(),
  station: z.string(),
  stationVector: SystemVectorSchema,
  sunVector: SystemVectorSchema,
  terminatorThresholdVector: SystemVectorSchema,
  air_color: SystemColorSchema,
  cloud_color: SystemColorSchema,
  land_color: SystemColorSchema,
  polar_cloud_color: SystemColorSchema,
  polar_land_color: SystemColorSchema,
  polar_sea_color: SystemColorSchema,
  sea_color: SystemColorSchema,
  sun_color: SystemColorSchema,
  description: z.string(),
  inhabitant: z.string(),
  inhabitants: z.string(),
  // Kept as the authored six-component string ("56 173 156 20 29 21"); the
  // projection never reinterprets it.
  random_seed: z.string(),
  air_color_mix_ratio: z.number(),
  air_density: z.number(),
  ambient_level: z.number(),
  cloud_alpha: z.number(),
  cloud_fraction: z.number(),
  corona_flare: z.number(),
  corona_hues: z.number(),
  corona_shimmer: z.number(),
  land_fraction: z.number(),
  layer: z.number().int(),
  rotation_speed: z.number(),
  sky_n_blurs: z.number().int(),
  sky_n_stars: z.number().int(),
  // Authored on Lave only in the pinned snapshot.
  percentCloud: z.number().int().optional(),
  // Oolite's authored ice key: `OOPlanetEntity.m:133-134` maps
  // `percent_ice` (default 5) to `polar_fraction = percent_ice / 100`. The
  // compiler does not project the key for the pinned snapshot, so every system
  // currently falls back to the engine default; this is a type addition, not a
  // generated-content change.
  percent_ice: z.number().int().min(0).max(100).optional(),
  // The authored key list, sorted in code-unit order: the present-vs-absent
  // record D-22 needs without ever storing `undefined`.
  presentFields: z.array(z.string()),
});

export type System = z.infer<typeof SystemSchema>;
export type SystemChunk = System[];
