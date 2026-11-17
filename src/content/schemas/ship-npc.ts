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
 * weapon and forward weapon position (CBT-07). Phase 14 adds the four flight
 * constants the NPC flight model reads (AI-01): maximum speed, roll and pitch
 * rate, and thrust. Phase 15 adds the rest of DATA-14: the aft, port and
 * starboard weapon types and positions beside the forward pair, `likely_cargo`
 * and `max_cargo`, `fragment_chance` and `explosion_type`. Phase 16 adds the
 * hull's bounding box (D16-23), the box the debris rule samples for pods and
 * plates. No other combat or flight stat is compiled here, and the strict
 * object rejects any extra field.
 *
 * `glb` is a locator, not inert-world data: it is never copied from the plist
 * but derived from the model by the one naming rule, and both it and `model`
 * are pattern-checked because they become fetch paths (T-09-16).
 */

import { z } from "zod";

import { NPC_GLB_PATH_PATTERN } from "../npc-glb-path.js";

/**
 * The domains the sim's `statsFor` accepts (`src/sim/npc/stats.ts`, limits
 * `MAX_STEER_RATE` and `MAX_ENTITY_MAGNITUDE` in `src/sim/world/limits.ts`). Content
 * never imports the sim, so the bounds are restated here and a test pins them
 * equal to the sim's constants. A compiled value above them would be replaced
 * at run time by Oolite's stock defaults with no diagnostic, so the build
 * refuses it instead. `maxFlightSpeed` stays non-negative, not positive: Oolite
 * authors hulls with speed 0 (buoys).
 */
export const MAX_FLIGHT_RATE_BOUND = 1e3;
export const MAX_FLIGHT_MAGNITUDE_BOUND = 1e12;

export { NPC_GLB_PATH_PATTERN };

const WEAPON_KEY = z.enum([
  "EQ_WEAPON_NONE",
  "EQ_WEAPON_PULSE_LASER",
  "EQ_WEAPON_BEAM_LASER",
  "EQ_WEAPON_MINING_LASER",
  "EQ_WEAPON_MILITARY_LASER",
]);

const POSITION = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

export const NpcShipSchema = z.strictObject({
  key: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
  aiType: z.string().min(1),
  scanClass: z.string().regex(/^CLASS_[A-Z_]+$/),
  model: z.string().regex(/^oolite_[a-z0-9_]+\.dat$/),
  glb: z.string().regex(NPC_GLB_PATH_PATTERN),
  // Oolite's float32 mass; `z.number()` already rejects NaN and Infinity, so
  // `positive()` leaves a finite number above zero; the upper bound keeps the
  // alloy count, which grows as the fourth root of the mass, finite and small
  // (T-16-31: a tampered catalogue must not stall a kill).
  mass: z.number().positive().max(MAX_FLIGHT_MAGNITUDE_BOUND),
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
  // plist's WEAPON_* names and fails on any other value. Every facing's type is
  // read only when its `weapon_facings` bit is set (ShipEntity.m:298-306).
  forwardWeapon: WEAPON_KEY,
  // `weapon_position_forward` in Oolite's frame (default 0 0 0,
  // ShipEntity.m:1797-1817), float32 per component: where the NPC's beam starts.
  forwardWeaponPosition: POSITION,
  // The aft, port and starboard types (`aft_weapon_type` and so on, default
  // EQ_WEAPON_NONE, ShipEntity.m:302-306) and positions
  // (`weapon_position_aft`, `_port`, `_starboard`, ShipEntity.m:479-481).
  aftWeapon: WEAPON_KEY,
  aftWeaponPosition: POSITION,
  portWeapon: WEAPON_KEY,
  portWeaponPosition: POSITION,
  starboardWeapon: WEAPON_KEY,
  starboardWeaponPosition: POSITION,
  // The flight constants of the NPC flight model (AI-01, the minimum of
  // DATA-15), float32, in Oolite's units. Finite and non-negative; `z.number()`
  // already rejects NaN and Infinity.
  //
  // `max_flight_speed`, default 160 for a non-station (ShipEntity.m:263-264).
  maxFlightSpeed: z.number().nonnegative().max(MAX_FLIGHT_MAGNITUDE_BOUND),
  // `max_flight_roll`, default 2.0 (ShipEntity.m:265).
  maxFlightRoll: z.number().nonnegative().max(MAX_FLIGHT_RATE_BOUND),
  // `max_flight_pitch`, default 1.0 (ShipEntity.m:266).
  maxFlightPitch: z.number().nonnegative().max(MAX_FLIGHT_RATE_BOUND),
  // `thrust`, default 15.0 (ShipEntity.m:270).
  thrust: z.number().nonnegative().max(MAX_FLIGHT_MAGNITUDE_BOUND),
  // `likely_cargo` (ShipEntity.m:566) and `max_cargo` (ShipEntity.m:378), both
  // read with `oo_unsignedIntForKey`, default 0: the inputs of the cargo capsule
  // count chosen at spawn (Phase 15, D-06) and read again at explosion time.
  likelyCargo: z.number().int().nonnegative(),
  maxCargo: z.number().int().nonnegative(),
  // `fragment_chance` (default 0.9, ShipEntity.m:372): the probability, as a
  // float32 like Oolite's `float` parameter (OOCollectionExtractors.h:152). Oolite
  // rolls it once at ship setup into `canFragment`; the record keeps the
  // probability and Phase 16 decides when to roll.
  fragmentChance: z.number().min(0).max(1),
  // `explosion_type` (ShipEntity.m:491): the authored list of explosion effect
  // names, or null when the key is absent. Oolite's default is nil, which
  // `becomeExplosion` treats differently from an empty array, so null is never
  // folded into [].
  explosionType: z.array(z.string().min(1)).nullable(),
  // The hull's bounding box in Oolite's model axes (D16-23): the float32
  // extremes of the vendored `.dat` vertices, as Oolite's drawable box
  // (OOEntityWithDrawable.m:55). `releaseCargoPodsDebris` and the plate loop
  // place each piece at `min + randf() * (max - min)` per axis
  // (OOVector.m:107-113); the sim converts it with `toWegoliteLocal` (D16-18).
  // Finite, closed, and `min <= max` on every axis (T-16-16).
  boundingBox: z
    .strictObject({ min: POSITION, max: POSITION })
    .refine(
      (box) =>
        box.min[0] <= box.max[0] &&
        box.min[1] <= box.max[1] &&
        box.min[2] <= box.max[2],
      { message: "boundingBox min must not exceed max on any axis" },
    ),
});

export const NpcShipCatalogueSchema = z.array(NpcShipSchema).min(1);

export type NpcShip = z.infer<typeof NpcShipSchema>;
export type NpcShipCatalogue = z.infer<typeof NpcShipCatalogueSchema>;
