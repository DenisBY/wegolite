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
 * snapshot-format change (a `WORLD_SNAPSHOT_VERSION` bump in plan 08-13). The
 * one recorded exception is D-11 (Phase 22): `MAX_WORLD_GROUPS` is a bound that
 * only widens and is not part of the hash, so it moved inside version 5.
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

/**
 * The longest `Entity.role`, a resolved Oolite role such as `trader` or
 * `police-witchpoint-patrol` (24 characters, the longest in-scope role).
 * Roles are lower-case letters, digits and hyphens (`ROLE_PATTERN`).
 */
export const MAX_ROLE_LENGTH = 32;

/** What a role string may hold: lower-case letters, digits and hyphens. */
export const ROLE_PATTERN = /^[a-z0-9-]*$/;

/**
 * The longest commodity key in `Entity.podCommodity`: the generated commodity
 * keys (`src/content/generated/commodities.json`) are lower-case letters,
 * digits and underscores (`COMMODITY_KEY_PATTERN`), far shorter than this.
 */
export const MAX_COMMODITY_KEY_LENGTH = 64;

/**
 * What a commodity key may hold: lower-case letters, digits and underscores,
 * never the prototype name `__proto__`. That is the one such name the character
 * class admits, so a later lookup keyed by the value cannot reach
 * `Object.prototype` (phase 21 security audit note 2).
 */
export const COMMODITY_KEY_PATTERN = /^(?!__proto__$)[a-z0-9_]*$/;

/**
 * The most units in one pod (`Entity.podAmount`). Oolite's largest drawn
 * amount is 34 (`Universe.m:3990-3994`); this keeps a corrupt value out of the
 * hash.
 */
export const MAX_POD_AMOUNT = 255;

/**
 * The most fuel a ship may hold (`Entity.fuel`, tenths of a light year):
 * Oolite reads it with `oo_unsignedShortForKey:@"fuel"` (`ShipEntity.m:555`),
 * an unsigned 16-bit value.
 */
export const MAX_SHIP_FUEL = 65535;

/**
 * The largest galaxy-local system index (`Entity.homeSystem` and
 * `Entity.destinationSystem`; -1 means unset). A galaxy holds 256 systems.
 */
export const MAX_SYSTEM_INDEX = 255;

/** The "unset" value of `Entity.homeSystem` and `Entity.destinationSystem`. */
export const NO_SYSTEM_INDEX = -1;

/**
 * The longest per-facing weapon type key in `Entity.weaponTypes`: an
 * `EQ_WEAPON_*` equipment key (`WEAPON_TYPE_PATTERN`); the longest in the
 * catalogue, `EQ_WEAPON_MILITARY_LASER`, is 24 characters.
 */
export const MAX_WEAPON_TYPE_LENGTH = 32;

/** What a weapon type key may be: `EQ_WEAPON_` then upper-case letters, digits, underscores. */
export const WEAPON_TYPE_PATTERN = /^EQ_WEAPON_[A-Z0-9_]+$/;

/**
 * The largest `Entity.injector.accumulator`. Oolite's `fuel_accumulator` starts
 * at 1.0 (`ShipEntity.m:557`) and wraps from below 0 by adding 1.0 while the
 * afterburner runs (`:5845-5852`), so it stays in 0 to 1.
 */
export const MAX_INJECTOR_ACCUMULATOR = 1;

// ---------------------------------------------------------------------------
// The v5 world-level records and the player's standing (FOUND-20, plan 21-06).
// They land inside snapshot version 5 as optional keys omitted when pristine,
// never as a second bump; every bound only keeps a corrupt value out of the hash.

/**
 * Oolite's `ALERT_CONDITION_*` values (`ShipEntity.h:169-172`; "numerical values
 * are available to scripts and shaders"): docked 0, green 1, yellow 2, red 3.
 * `World.station.alert` holds one of them; a fresh station is green.
 */
export const STATION_ALERT_DOCKED = 0;
/** The pristine `World.station.alert` (`ALERT_CONDITION_GREEN`). */
export const STATION_ALERT_GREEN = 1;
export const STATION_ALERT_YELLOW = 2;
export const STATION_ALERT_RED = 3;

/**
 * The most ships the main station records as launched (`World.station.launched`,
 * an integer 0 to 255; Oolite's `STATION_MAX_POLICE` is 8, `StationEntity.h:41`,
 * the police cap, and launches are counted per station visit). A format bound.
 */
export const MAX_STATION_LAUNCHED = 255;

/**
 * The most offender marks (`World.station.marks`, entity ids) the station holds.
 * Oolite's `STATION_MAX_POLICE` is 8 (`StationEntity.h:41`, the police cap); the
 * marks bound is a format bound for offenders seen nearby, four times that.
 */
export const MAX_STATION_MARKS = 32;

/**
 * The most groups `World.groups` holds: 256, equal to `MAX_ENTITIES`
 * (`ids.ts`). Oolite's `ShipGroup` is a set of ships with a leader, and a group
 * record always has at least one live ship, because `pruneEmptyGroups`
 * (`world.ts`, run by `commitWorld`) removes the record once its group has no
 * live member. The count of records can therefore never exceed the live dynamic
 * entities, whose cap is `MAX_ENTITIES`, so this bound equals the cap and never
 * triggers, for Phase 22's populator and for the later phases that create
 * groups (23 launches, 25 police, 26 repopulation). It is a literal because
 * this file takes no imports; `tests/sim/world/groups-prune.test.ts` pins the
 * equality. D-11 (owner, 2026-11-26) raised it from 128 as an amendment inside
 * snapshot version 5.
 */
export const MAX_WORLD_GROUPS = 256;

/**
 * The largest `PlayerCombatState.standing.kills`: Oolite keeps the kill tally
 * as an unsigned 32-bit count (`PlayerEntity` `ship_kills`).
 */
export const MAX_KILL_TALLY = MAX_UINT32;
