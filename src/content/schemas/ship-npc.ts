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
 * origin (WORLD-15, `tools/oolite-ingest/convert/ship-radius.ts`). Phase 13
 * adds the minimum of DATA-15 that a hit target, a firing NPC and the ident
 * message consume: the display name, max energy, energy recharge rate, forward
 * weapon and forward weapon position (CBT-07). No other combat or flight stat
 * is compiled here, and the strict object rejects any extra field.
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
  // Oolite's `displayName` for the ship: the authored `display_name`, else the
  // `name` (ShipEntity.m:391-395). The ident lock message names the ship with
  // it ("Ident system locked onto [target].", descriptions.plist:527).
  name: z.string().min(1),
  // Oolite's `maxEnergy` (`max_energy`, default 200, ShipEntity.m:285-290) and
  // `energy_recharge_rate` (default 1.0): a hit drains the target's energy
  // (CBT-07). Finite and non-negative; `z.number()` already rejects NaN and
  // Infinity.
  maxEnergy: z.number().nonnegative(),
  energyRechargeRate: z.number().nonnegative(),
  // The forward weapon's equipment key (`forward_weapon_type`, default
  // EQ_WEAPON_NONE, ShipEntity.m:300). Closed: a build-time converter maps the
  // plist's WEAPON_* names and fails on any other value.
  forwardWeapon: z.enum([
    "EQ_WEAPON_NONE",
    "EQ_WEAPON_PULSE_LASER",
    "EQ_WEAPON_BEAM_LASER",
    "EQ_WEAPON_MINING_LASER",
    "EQ_WEAPON_MILITARY_LASER",
  ]),
  // `weapon_position_forward` in Oolite's frame (default 0 0 0,
  // ShipEntity.m:1797-1817), float32 per component: where the NPC's beam starts.
  forwardWeaponPosition: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]),
});

export const NpcShipCatalogueSchema = z.array(NpcShipSchema).min(1);

export type NpcShip = z.infer<typeof NpcShipSchema>;
export type NpcShipCatalogue = z.infer<typeof NpcShipCatalogueSchema>;
