// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The explosion setting (DATA-16, D16-08, D16-22).
 *
 * One record per `explosions.plist` entry the render draws. Only the default
 * ship explosion is compiled: every compiled hull has `explosion_type` unset,
 * so Oolite's `becomeExplosion` draws the default cloud plus the flash
 * (ShipEntity.m:7956-7963). The fields are the keys
 * `OOExplosionCloudEntity.m` reads (lines 41-49) with its defaults for absent
 * keys (lines 34-38, 70-88): `alpha`, `brightness` (floored at 1),
 * `color_order`, `count`, `duration`, `growth_rate`, `size`, `spread` and
 * `texture`. The flash has no plist entry; its constants live in the render
 * (`OOFlashEffectEntity.m`, plan 16-07).
 *
 * The render sizes pools from `count` and turns `texture` into a fetch path,
 * so every number is finite and bounded, the colour order is a closed set and
 * the texture name is pattern-checked (T-16-15). The strict object rejects any
 * extra field.
 */

import { z } from "zod";

/** The one setting every compiled hull explodes with (D16-22). */
export const DEFAULT_EXPLOSION_KEY = "oolite-default-ship-explosion";

/** The most records a catalogue may hold; the stock set is one. */
export const MAX_EXPLOSION_RECORDS = 16;

/** Oolite's largest cloud particle count (`maxCount` at the extras detail level). */
export const MAX_EXPLOSION_COUNT = 25;

/** The bound on growth rate, spread, brightness, duration and size. */
export const EXPLOSION_MAGNITUDE_BOUND = 1e3;

/** The orders `OOExplosionCloudEntity.m:110-150` distinguishes. */
export const EXPLOSION_COLOR_ORDERS = [
  "rgb",
  "rbg",
  "grb",
  "gbr",
  "brg",
  "bgr",
  "white",
] as const;

/** A particle texture under `public/textures/`, no directory part. */
export const PARTICLE_TEXTURE_PATTERN = /^oolite-particle-[a-z0-9-]+\.png$/;

export const ExplosionRecordSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  // `z.number()` already rejects NaN and Infinity.
  alpha: z.number().min(0).max(1),
  colorOrder: z.enum(EXPLOSION_COLOR_ORDERS),
  count: z.number().int().min(1).max(MAX_EXPLOSION_COUNT),
  duration: z.number().positive().max(EXPLOSION_MAGNITUDE_BOUND),
  growthRate: z.number().nonnegative().max(EXPLOSION_MAGNITUDE_BOUND),
  size: z.number().positive().max(EXPLOSION_MAGNITUDE_BOUND),
  spread: z.number().nonnegative().max(EXPLOSION_MAGNITUDE_BOUND),
  brightness: z.number().min(1).max(EXPLOSION_MAGNITUDE_BOUND),
  texture: z.string().regex(PARTICLE_TEXTURE_PATTERN),
});

export const ExplosionCatalogueSchema = z
  .array(ExplosionRecordSchema)
  .min(1)
  .max(MAX_EXPLOSION_RECORDS)
  .refine(
    (records) =>
      new Set(records.map((record) => record.key)).size === records.length,
    { message: "explosion keys must be unique" },
  )
  .refine(
    (records) => records.some((record) => record.key === DEFAULT_EXPLOSION_KEY),
    { message: `the explosion catalogue needs ${DEFAULT_EXPLOSION_KEY}` },
  );

export type ExplosionRecord = z.infer<typeof ExplosionRecordSchema>;
export type ExplosionCatalogue = z.infer<typeof ExplosionCatalogueSchema>;
