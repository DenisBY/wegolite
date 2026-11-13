// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Entity ids and the closed vocabularies of the world model (FOUND-11, D-06,
 * D-07). This module has no imports, so AI code may import it freely.
 *
 * Per-world id scope (CONTEXT D-06 as amended 2026-11-12, PROJECT.md Key
 * Decisions row "Entity id uniqueness is per world"): a dynamic id is unique
 * only within the world that issued it. `nextId` restarts at
 * `FIRST_DYNAMIC_ID` (101) in every new world (each launch, each arrival, each
 * in-flight Continue or Load), an id is never reused within one world, and no
 * code outside that world (saves, HUD, logs, mission state, targeting across a
 * jump) may store or transport an id. That keeps a world a pure function of its
 * seed. Nothing outside `src/sim` may import this module: the source scan
 * `tests/guards/entity-id-scope.test.ts` fails if it does.
 *
 * `store.get` and `store.live` of `./store.ts` are simulation-internal;
 * `src/app/**` never imports the store module (it reads `liveEntityCount` from
 * `./world.ts` instead).
 *
 * Oolite follows a different scheme: `OOUniversalID` is a uint16 in 100..2149
 * (OOTypes.h:165-171) allocated by a wrapping scan that reuses freed slots
 * (Universe.m:5014-5029), and the player is UID 100 (Universe.m:4841-4846).
 * Wegolite keeps 100 for the player and replaces the wrapping scan with a
 * monotonic counter.
 */

/**
 * An entity id. Unique only within the world that issued it (see the module
 * comment): never persist it, log it across a boundary or carry it into
 * another world.
 */
export type EntityId = number;

/** "No entity": Oolite's NO_TARGET (OOTypes.h:168). */
export const NO_ENTITY = 0;
export const PLANET_ID = 1;
export const SUN_ID = 2;
export const MAIN_STATION_ID = 3;
export const WITCHPOINT_BUOY_ID = 4;
export const STATION_NAV_BUOY_ID = 5;
/** Ids 6 to 99 are reserved. */
export const LAST_RESERVED_STATIC_ID = 99;
/** The player (Oolite's MIN_ENTITY_UID, Universe.m:4841-4846). */
export const PLAYER_ID = 100;
/** The first dynamic id of every new world. */
export const FIRST_DYNAMIC_ID = 101;
/**
 * The cap on non-dead dynamic entities. The five static entities live in
 * `world.statics` and do not count.
 */
export const MAX_ENTITIES = 256;

/** The five static entity ids in ascending order. */
export const STATIC_BODY_IDS = [
  PLANET_ID,
  SUN_ID,
  MAIN_STATION_ID,
  WITCHPOINT_BUOY_ID,
  STATION_NAV_BUOY_ID,
] as const;

/**
 * The behaviour ids, the ENTRY names of Oolite's `src/Core/Tables/OOBehaviour.tbl`
 * without the `BEHAVIOUR_` prefix, in table order.
 */
export const BEHAVIOUR_IDS = [
  "IDLE",
  "TRACK_TARGET",
  "TUMBLE",
  "STOP_STILL",
  "STATION_KEEPING",
  "ATTACK_TARGET",
  "ATTACK_FLY_TO_TARGET",
  "ATTACK_FLY_FROM_TARGET",
  "RUNNING_DEFENSE",
  "FLEE_TARGET",
  "ATTACK_FLY_TO_TARGET_SIX",
  "ATTACK_MINING_TARGET",
  "EVASIVE_ACTION",
  "FLEE_EVASIVE_ACTION",
  "ATTACK_BREAK_OFF_TARGET",
  "ATTACK_SLOW_DOGFIGHT",
  "ATTACK_FLY_TO_TARGET_TWELVE",
  "ATTACK_SNIPER",
  "ATTACK_BROADSIDE",
  "ATTACK_BROADSIDE_LEFT",
  "ATTACK_BROADSIDE_RIGHT",
  "CLOSE_TO_BROADSIDE_RANGE",
  "CLOSE_WITH_TARGET",
  "AVOID_COLLISION",
  "TRACK_AS_TURRET",
  "FLY_RANGE_FROM_DESTINATION",
  "FLY_TO_DESTINATION",
  "FLY_FROM_DESTINATION",
  "FACE_DESTINATION",
  "FLY_THRU_NAVPOINTS",
  "LAND_ON_PLANET",
  "COLLECT_TARGET",
  "INTERCEPT_TARGET",
  "FORMATION_FORM_UP",
  "FORMATION_BREAK",
  "ENERGY_BOMB_COUNTDOWN",
  "TRACTORED",
  "SCRIPTED_AI",
  "SCRIPTED_ATTACK_AI",
] as const;
export type BehaviourId = (typeof BEHAVIOUR_IDS)[number];

/**
 * The scan classes, the ENTRY names of Oolite's
 * `src/Core/Tables/OOScanClass.tbl` verbatim, in table order.
 */
export const SCAN_CLASSES = [
  "CLASS_NOT_SET",
  "CLASS_NO_DRAW",
  "CLASS_NEUTRAL",
  "CLASS_STATION",
  "CLASS_TARGET",
  "CLASS_CARGO",
  "CLASS_MISSILE",
  "CLASS_ROCK",
  "CLASS_MINE",
  "CLASS_THARGOID",
  "CLASS_BUOY",
  "CLASS_VISUAL_EFFECT",
  "CLASS_WORMHOLE",
  "CLASS_PLAYER",
  "CLASS_POLICE",
  "CLASS_MILITARY",
] as const;
export type ScanClass = (typeof SCAN_CLASSES)[number];

/** The kinds a stored dynamic entity can have. */
export const ENTITY_KINDS = [
  "ship",
  "station",
  "cargo",
  "missile",
  "wreckage",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** The kinds a view reports: the static bodies, the player and the dynamic kinds. */
export const BODY_KINDS = [
  "planet",
  "sun",
  "station",
  "buoy",
  "player",
  "ship",
  "cargo",
  "missile",
  "wreckage",
] as const;
export type BodyKind = (typeof BODY_KINDS)[number];
