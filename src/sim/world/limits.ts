// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared serialised-domain limits (FOUND-11, Round 4 consensus 4).
 *
 * This module is the single definition site of the limits that every writer of
 * an entity enforces: `spawnEntity` (plan 08-05), the ShipControl command
 * (plan 08-07), `sanitizeEntity` (plan 08-11) and `snapshotWorld` and
 * `parseWorldSnapshot` (plan 08-13). It has no imports. Every other module
 * imports these names from here and never declares or re-exports a constant
 * with the same value or meaning, so no second name (a sanitize- or
 * snapshot-prefixed alias, say) can drift from the one that spawn enforces.
 *
 * Changing any value changes what a world snapshot may hold, so it is a
 * snapshot-format change (a `WORLD_SNAPSHOT_VERSION` bump in plan 08-13).
 */

/**
 * The world-local cap on coordinates, radii, speeds, ranges and numeric AI
 * params. Deliberately wider than `MAX_SAVE_POSITION_MAGNITUDE` (1e9), which
 * bounds only the player's saved position.
 */
export const MAX_ENTITY_MAGNITUDE = 1e12;

/** The longest `specKey`, param key, string param or string array element. */
export const MAX_SNAPSHOT_STRING_LENGTH = 128;

/** The longest param array. */
export const MAX_SNAPSHOT_PARAM_LENGTH = 64;

/** The most own keys an AI params object may hold. */
export const MAX_AI_PARAMS_KEYS = 32;

/** The largest unsigned 32-bit integer: ids, ticks, counters, timers, seeds. */
export const MAX_UINT32 = 0xffffffff;

/**
 * The bound on `Math.abs(normSq - 1)` for a unit orientation at spawn, after
 * sanitize and in the snapshot parser.
 */
export const QUAT_UNIT_TOLERANCE = 1e-9;

/**
 * Below this squared norm sanitize treats an orientation as degenerate:
 * `normalize` of a subnormal norm does not land inside `QUAT_UNIT_TOLERANCE`
 * (`{ w: 1e-160, x: 0, y: 0, z: 0 }` renormalises to a squared norm of about
 * 1.0000111).
 */
export const MIN_QUAT_NORM_SQ = 1e-12;

/**
 * The energy a ship spawns with when its record or its caller names none
 * (Oolite `ShipEntity.m:291`, `max_energy` default 200.0).
 */
export const NPC_DEFAULT_MAX_ENERGY = 200;

/**
 * The energy recharge rate (energy per second) a ship spawns with when its
 * record or its caller names none (Oolite `ShipEntity.m:292`,
 * `energy_recharge_rate` default 1.0).
 */
export const NPC_DEFAULT_ENERGY_RECHARGE_RATE = 1;

/**
 * The largest `maxEnergy` (and so `energy`) a world entity may hold. Far above
 * every compiled NPC record (the largest is 250) and every Oolite ship; it only
 * keeps a corrupt value out of the hash. Changing it is a snapshot-format
 * change (a `WORLD_SNAPSHOT_VERSION` bump).
 */
export const MAX_ENTITY_ENERGY = 1e6;

/**
 * The largest `energyRechargeRate` a world entity may hold. Far above every
 * compiled NPC record (the largest is 4). Changing it is a snapshot-format
 * change (a `WORLD_SNAPSHOT_VERSION` bump).
 */
export const MAX_ENERGY_RECHARGE_RATE = 1e3;

/**
 * The largest magnitude of a steering rate or stick (`flightRoll`,
 * `flightPitch`, `stickRoll`, `stickPitch`, rad/s). Far above every Oolite
 * ship (the largest `max_flight_roll` and `max_flight_pitch` are below 5); it
 * only keeps a corrupt value out of the hash. Changing it is a snapshot-format
 * change (a `WORLD_SNAPSHOT_VERSION` bump).
 */
export const MAX_STEER_RATE = 1e3;

/**
 * The smallest resolved `accuracy` (`ShipEntity.m:1126-1143` clamps
 * `setAccuracy:` into this range). The unresolved sentinel (-100,
 * `ACCURACY_UNRESOLVED` in `../npc/state.ts`) is the only legal value below it.
 * Changing it is a snapshot-format change.
 */
export const MIN_ACCURACY = -5;

/** The largest resolved `accuracy`. Changing it is a snapshot-format change. */
export const MAX_ACCURACY = 10;

/**
 * The largest `frustration`. Oolite resets it at 10 to 15 seconds
 * (`ShipEntity.m:3874-3933`); this only keeps a corrupt value out of the hash.
 * Changing it is a snapshot-format change.
 */
export const MAX_FRUSTRATION = 1e6;

/**
 * The largest `escortSlot`: Oolite's `MAX_ESCORTS` is 16, so slots run 0 to 15.
 * Changing it is a snapshot-format change.
 */
export const MAX_ESCORT_SLOT = 15;

/**
 * The tracking curve keeps exactly this many samples when it exists
 * (`startTrackingCurve` and `updateTrackingCurve`, `ShipEntity.m:5412-5489`);
 * `trackingCount` is 0 or this value. Changing it is a snapshot-format change.
 */
export const TRACKING_SAMPLES = 4;

/**
 * The largest magnitude of one component of `Entity.velocity` (m/s). Far above
 * the fastest compiled `max_flight_speed` (1000); it only keeps a corrupt value
 * out of the hash. Changing it is a snapshot-format change (a
 * `WORLD_SNAPSHOT_VERSION` bump).
 */
export const MAX_ENTITY_VELOCITY = 1e4;

/**
 * The largest `weapon.temperature`. Oolite's `NPC_MAX_WEAPON_TEMP` is 256
 * (`ShipEntity.h:116`); this only keeps a corrupt value out of the hash.
 * Changing it is a snapshot-format change (a `WORLD_SNAPSHOT_VERSION` bump).
 */
export const MAX_WEAPON_TEMPERATURE = 1e3;

/**
 * The most cargo capsules an entity may hold: Oolite caps a spawned hold at 200
 * (`ShipEntity.m:7337`). Changing it is a snapshot-format change (a
 * `WORLD_SNAPSHOT_VERSION` bump).
 */
export const MAX_ENTITY_CARGO = 200;

/**
 * The most energy the main station holds (`shipdata.plist:1732`, `max_energy`
 * 25000). The station only absorbs hits (Phase 18). A format bound: changing it
 * is a snapshot-format change (a `WORLD_SNAPSHOT_VERSION` bump).
 */
export const STATION_MAX_ENERGY = 25000;

/**
 * The most energy a navigation or witchpoint buoy holds (the buoy template,
 * `shipdata.plist:1021`, `max_energy` 250). A format bound: changing it is a
 * snapshot-format change (a `WORLD_SNAPSHOT_VERSION` bump).
 */
export const BUOY_MAX_ENERGY = 250;

/**
 * The energy a navigation or witchpoint buoy regains per second (the buoy
 * template, `shipdata.plist:1018`, `energy_recharge_rate` 2), up to
 * `BUOY_MAX_ENERGY` and only while the buoy is alive (Phase 18, CBT-17).
 */
export const BUOY_ENERGY_RECHARGE_RATE = 2;

/**
 * The most energy a buoy's frangible subentity holds (Phase 18, PD-01): Oolite's
 * default `max_energy` (`ShipEntity.m:291`), because the subentity's shipdata
 * record sets none. A format bound: changing it is a snapshot-format change.
 */
export const BUOY_SUBENTITY_MAX_ENERGY = 200;

/**
 * A buoy subentity's recharge, energy per second (Phase 18, PD-01): Oolite's
 * default `energy_recharge_rate` (`ShipEntity.m:292`), because the
 * subentity's shipdata record sets none. It recharges only while attached
 * (above 0) and while its buoy is alive.
 */
export const BUOY_SUBENTITY_RECHARGE_RATE = 1;

/**
 * The largest magnitude of one component of a buoy's offset from its layout
 * position (m, Phase 18, PD-02). A buoy pushed at `MAX_ENTITY_VELOCITY` brakes
 * at 500 m/s^2, so it travels at most 1e8 / 1000 = 1e5 m; this is ten times
 * that, and only keeps a corrupt value out of the hash. A format bound:
 * changing it is a snapshot-format change.
 */
export const MAX_BUOY_OFFSET = 1e6;

// ---------------------------------------------------------------------------
// The v5 entity field set (FOUND-20, pitfall C2): one snapshot bump, 4 to 5.
// Every bound is a format bound that only keeps a corrupt value out of the hash;
// changing one after Phase 21 is an owner amendment, never a quiet second bump.

/**
 * The largest `Entity.bounty`: an integer 0 to 65535. Oolite keeps a ship's
 * bounty as an `OOCreditsQuantity` (`ShipEntity.h:289`) set from the record's
 * `bounty` key or by the populator (`oolite-populator.js:1413-1445`,
 * `:1541-1544`, `:1569`), whose in-scope values stay in the hundreds at most;
 * the cap only keeps a corrupt value out of the hash. Changing it is a
 * snapshot-format change.
 */
export const MAX_BOUNTY = 65535;
