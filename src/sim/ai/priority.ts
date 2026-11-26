// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The state shape of the hand-ported priority AI (FOUND-20, AI-02; plan 21-07).
 *
 * Phase 23 ports Oolite's `oolite-priorityai.js` (pin 7437f22) by hand. Its
 * run-time state lives in `AiComponent.params`, which the v5 snapshot already
 * bounds (`MAX_AI_PARAMS_KEYS` 32 keys, arrays of at most
 * `MAX_SNAPSHOT_PARAM_LENGTH` 64 elements, strings of at most
 * `MAX_SNAPSHOT_STRING_LENGTH` 128 code units). This file fixes that shape now,
 * so Phase 23's state needs no second snapshot bump (pitfall C2): the key list
 * below, and a test that round-trips every key at its largest shape.
 *
 * The module is INERT. Nothing spawns a `priority` AI before Phase 23
 * (`tests/guards/priority-ai-unspawned.test.ts`), and `think` does nothing: it
 * reads nothing from `params`, so any params value, however malformed, is safe.
 * It defines no `onEvent`, because `tests/guards/on-event-handlers.test.ts`
 * allows one handler (`flight-script`) and Phase 23 takes that tripwire first.
 *
 * Packing: Oolite writes about 27 distinct `oolite_*` parameters plus the
 * `oolite_intership` record, and stores several related values together. They
 * are packed here into flat arrays of numbers so the list stays at 27 keys, 5
 * under the limit (the unit test allows at most 28, leaving 4 spare). Stored
 * entity ids are re-checked with `view.isValid` at each use (the flight-script
 * precedent); `killShip` never rewrites references. An absent key means "unset"
 * (Oolite's `null` or `undefined`); a packed array uses -1 for an unset slot,
 * as Oolite itself does for `oolite_witchspaceDestination` (:1250).
 *
 * Left out on purpose, with the reason:
 *  - the ECM timer (`oolite_internal_ecmtimer`) and the missile-launch flag
 *    (`oolite_flag_launchAdjustMissile`): ECM and missiles are deferred
 *    (FIDELITY E-194, plan 21-05);
 *  - `oolite_scanResults` and `oolite_scanResultSpecific`: Oolite clears them on
 *    every reconsideration (`__cache`); the port memoises a scan inside one
 *    `think`;
 *  - the `oolite_flag_*` role constants: they are tree-level constants, selected
 *    by `tree`, never state.
 */

import type { AiModule } from "./types.js";

/**
 * The inert priority module: `think` does nothing and reads nothing from
 * `params` (total on any input); no `onEvent`.
 */
export const priorityAi: AiModule = Object.freeze({
  think: (): void => undefined,
});

/**
 * The `params` keys of the priority AI, frozen and in documentation order. At
 * most 28 (4 spare under the 32-key limit); each key's Oolite source is in
 * `PRIORITY_PARAM_SOURCES`.
 */
export const PRIORITY_PARAM_KEYS = Object.freeze([
  "tree",
  "beh",
  "hs",
  "fire",
  "tgt",
  "def",
  "stn",
  "pln",
  "dock",
  "dockPos",
  "wpgen",
  "wp",
  "wpi",
  "wpcur",
  "lead",
  "cd",
  "comm",
  "crp",
  "ws",
  "dist",
  "icpt",
  "ts",
  "lurk",
  "cscd",
  "gp",
  "ff",
  "prole",
] as const);

export type PriorityParamKey = (typeof PRIORITY_PARAM_KEYS)[number];

/** The persisted shape of one key: how a test builds its largest value. */
export type PriorityParamShape =
  /** A closed id string (at most 128 code units). */
  | "id"
  /** A finite number: an entity id, a tick, a count. */
  | "number"
  /** A boolean. */
  | "flag"
  /** A flat array of finite numbers (at most 64). */
  | "numbers"
  /** A flat array of strings (at most 64, each at most 128 code units). */
  | "strings";

/**
 * Each key's shape and the Oolite parameter or controller state it stores
 * (`oolite-priorityai.js` at pin 7437f22, line numbers at the pin). The test
 * `tests/sim/ai/priority-params.test.ts` pins this table against the key list.
 */
export const PRIORITY_PARAM_SOURCES: Readonly<
  Record<
    PriorityParamKey,
    { readonly shape: PriorityParamShape; readonly oolite: string }
  >
> = Object.freeze({
  tree: {
    shape: "id",
    oolite:
      "the priority list a role script gives the controller (code literal :38-593, selected here by id)",
  },
  beh: {
    shape: "id",
    oolite:
      "the current behaviour function (`applyHandlers` follows it; ARCHITECTURE 4.1)",
  },
  hs: {
    shape: "id",
    oolite: "the active handler set built per behaviour (`applyHandlers`)",
  },
  fire: {
    shape: "flag",
    oolite: "whether the hull has a forward weapon (ARCHITECTURE 4.2)",
  },
  tgt: {
    shape: "number",
    oolite: "oolite_rememberedTarget (:2621, :3332)",
  },
  def: {
    shape: "numbers",
    oolite: "ship.defenseTargets (:1229, :1531, :1620), at most 8 ids",
  },
  stn: {
    shape: "number",
    oolite: "oolite_selectedStation (:1884, :4264)",
  },
  pln: {
    shape: "number",
    oolite: "oolite_selectedPlanet (:1872, :4223)",
  },
  dock: {
    shape: "number",
    oolite: "oolite_dockingStation (:2971, :4732)",
  },
  dockPos: {
    shape: "numbers",
    oolite:
      "__ltcache.oolite_dockingclearpos, the random clearance point kept so the ship does not re-roll it (3 numbers)",
  },
  wpgen: {
    shape: "id",
    oolite:
      "the waypoint generator closure (:2789, :5213): stationPatrol, witchpointPatrol or spacelanePatrol",
  },
  wp: {
    shape: "numbers",
    oolite: "oolite_waypoints (:2789, :5213), flat [x,y,z,...]",
  },
  wpi: {
    shape: "number",
    oolite: "the index into oolite_waypoints (ARCHITECTURE 4.2)",
  },
  wpcur: {
    shape: "numbers",
    oolite:
      "oolite_waypoint and oolite_waypointRange (:6482-6483, :6631-6632): [x, y, z, range]",
  },
  lead: {
    shape: "number",
    oolite:
      "the group leader hint, re-validated at use (ship.group.leader, :1178)",
  },
  cd: {
    shape: "numbers",
    oolite:
      "oolite_intership cargo demand and oolite_cargoDropped: [cargodemand (:2138, :3681), cargodemanded (:2042, :3672), cargodemandmet (:2044, :2081), cargodemandpaid (:1519, :3460), oolite_cargoDropped (:5008, :5608)]",
  },
  comm: {
    shape: "numbers",
    oolite:
      "lastCommSent and lastCommHeard (:58-59, :393, :454): [sent, heard] in ticks",
  },
  crp: {
    shape: "strings",
    oolite:
      "commsRole and commsPersonality (:60-61, :480, :558): [role, personality]",
  },
  ws: {
    shape: "numbers",
    oolite:
      "the witchspace plan: [oolite_witchspaceEntry tick (:3105), oolite_witchspaceDestination system id (:1256, :4337, -1 for none), oolite_witchspaceWormhole id (:2661, :5651)]",
  },
  dist: {
    shape: "numbers",
    oolite:
      "the distress trio (:2602-2604, :5055-5057): [oolite_distressSender, oolite_distressAggressor, oolite_distressTimestamp]",
  },
  icpt: {
    shape: "numbers",
    oolite:
      "oolite_interceptTarget and oolite_interceptCoordinates (:5720-5721): [target, x, y, z]",
  },
  ts: {
    shape: "numbers",
    oolite:
      "the last-ship references: [oolite_lastFleeing (:3230), oolite_lastAssist (:5324), oolite_lastPirateVictim (:3690)] as entity ids",
  },
  lurk: {
    shape: "numbers",
    oolite: "oolite_pirateLurk (:4605), the pirate lurk point: [x, y, z]",
  },
  cscd: {
    shape: "numbers",
    oolite:
      "oolite_cascadeDetected (:5017), the cascade weapon position: [x, y, z]; absent when none",
  },
  gp: {
    shape: "number",
    oolite:
      "oolite_groupPower (:1471, :1476), the group's ship count at the last check",
  },
  ff: {
    shape: "flag",
    oolite: "oolite_playerFriendlyFireAlready (:1019)",
  },
  prole: {
    shape: "id",
    oolite:
      "oolite_intership.oolite_player_role (:1182-1201), the player role (an entry of player.roleWeights) this group decided",
  },
});
