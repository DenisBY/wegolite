// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC ship record (DATA-10, DATA-11 stage 1, DATA-13).
 *
 * One record per compiled NPC model, taken from `shipdata.plist` with
 * `like_ship` resolved: the roles (every authored token, probability suffixes
 * kept), the AI name, the scan class, the authored model and the URL of the
 * GLB the client fetches on demand. DATA-11 completes in Phase 10: the record
 * also carries the ship's mass, computed at build time from the hull octree as
 * Oolite computes it (see `tools/oolite-ingest/convert/ship-mass.ts`), and its
 * collision radius, the distance of the farthest hull vertex from the model
 * origin (WORLD-15, `tools/oolite-ingest/convert/ship-radius.ts`). No combat
 * or flight stat is compiled here (DATA-15 is deferred), and the strict object
 * rejects any extra field.
 *
 * `glb` is a locator, not inert-world data: it is never copied from the plist
 * but derived from the model by the one naming rule, and both it and `model`
 * are pattern-checked because they become fetch paths (T-09-16).
 */

import { z } from "zod";

import { NPC_GLB_PATH_PATTERN } from "../npc-glb-path.js";

export { NPC_GLB_PATH_PATTERN };

export const NpcShipSchema = z.strictObject({
  key: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
  aiType: z.string().min(1),
  scanClass: z.string().regex(/^CLASS_[A-Z_]+$/),
  model: z.string().regex(/^oolite_[a-z0-9_]+\.dat$/),
  glb: z.string().regex(NPC_GLB_PATH_PATTERN),
  // Oolite's float32 mass; `z.number()` already rejects NaN and Infinity, so
  // `positive()` leaves a finite number above zero.
  mass: z.number().positive(),
  // Oolite's float32 collision radius of the hull, in metres (WORLD-15), computed
  // at build time by `tools/oolite-ingest/convert/ship-radius.ts`; the populator
  // spawns the ship with it.
  radius: z.number().positive(),
});

export const NpcShipCatalogueSchema = z.array(NpcShipSchema).min(1);

export type NpcShip = z.infer<typeof NpcShipSchema>;
export type NpcShipCatalogue = z.infer<typeof NpcShipCatalogueSchema>;
