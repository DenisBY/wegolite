// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The frozen table of the initial populator's entries (Phase 22, WORLD-08).
 *
 * Oolite's `oolite-populator.js` registers its population with
 * `system.setPopulator(name, ...)`, 36 calls in a fixed order
 * (`:111-986`). This table lists every one of them, kept and cut, in
 * registration order: the ordinal is the registration index, it is part of the
 * stream contract (`populationDraws(worldSeed, ordinal, ...)`) and it is never
 * renumbered. The table is append-only. `tests/sim/world/population/
 * plan.oracle.test.ts` pins it to the entry list of every recorded fixture, so
 * a dropped or reordered entry fails a test instead of silently disappearing.
 *
 * The engine runs the entries in a stable sort by priority, equal priorities
 * in insertion order (`Universe.m:9990-10001`); {@link entriesInEngineOrder}
 * is that order (assumption A5, a FIDELITY divergence: the engine's own sort is
 * not guaranteed stable).
 *
 * Every kept entry is placed on a lane, at the witchpoint or in the station's
 * aegis (D-01: the callback receives a plain vector, the arriving branch of the
 * script); no station launch and no planet orbit is planned (D-03).
 * {@link POPULATOR_CUTS} records every cut, with the reason.
 */

/** The location codes the script registers (`oolite-populator.js:111-986`). */
export type PopulatorLocation =
  | "COORDINATES"
  | "LANE_WP"
  | "LANE_WS"
  | "LANE_PS"
  | "LANE_WPS"
  | "STATION_AEGIS"
  | "WITCHPOINT"
  | "PLANET_ORBIT_HIGH";

/**
 * The closed set of kept builders. A builder is the port of one of the script's
 * `_add*` callbacks; plans 22-07 to 22-09 write them. A pirate pack builder is
 * split by size and by origin (local or remote), as the script's callbacks are.
 */
export type PopulatorBuilderId =
  | "freighter"
  | "courierShort"
  | "courierLong"
  | "smuggler"
  | "lightHunter"
  | "independentPirate"
  | "lightPirateLocal"
  | "lightPirateRemote"
  | "mediumPirateLocal"
  | "mediumPirateRemote"
  | "heavyPirateLocal"
  | "heavyPirateRemote"
  | "policePatrol"
  | "stationPatrol"
  | "interceptors";

export type PopulatorStatus = "kept" | "cut";

export interface PopulatorEntry {
  /** Registration index in the script; the stream key; never renumbered. */
  readonly ordinal: number;
  /** The `setPopulator` name. */
  readonly name: string;
  readonly priority: number;
  readonly location: PopulatorLocation;
  /** Whether `groupCount` comes from `randomise` (three `count` draws). */
  readonly counted: boolean;
  /** The kept builder, or null for a cut entry. */
  readonly builder: PopulatorBuilderId | null;
  readonly status: PopulatorStatus;
  /** Why the entry is cut, or null for a kept entry. */
  readonly cutReason: string | null;
}

const WORLD_08B =
  "WORLD-08b: medium and heavy hunters and assassins are a later milestone";
const D09_THARGOID =
  "D-09 (A1): Thargoids are not in the initial population of this milestone";
const D09_BUOY =
  "D-09 (A2): the buoys are cut; the station's own nav buoy is a static of the layout";
const D09_ASTEROID = "D-09 (A2): asteroids are cut from the initial population";
const D09_HERMIT =
  "D-09 and D-03: the off-lane hermit orbits the planet; no planet location is in scope";

function kept(
  ordinal: number,
  name: string,
  location: PopulatorLocation,
  builder: PopulatorBuilderId,
  counted = true,
): PopulatorEntry {
  return Object.freeze({
    ordinal,
    name,
    priority: 40,
    location,
    counted,
    builder,
    status: "kept",
    cutReason: null,
  });
}

function cut(
  ordinal: number,
  name: string,
  priority: number,
  location: PopulatorLocation,
  counted: boolean,
  cutReason: string,
): PopulatorEntry {
  return Object.freeze({
    ordinal,
    name,
    priority,
    location,
    counted,
    builder: null,
    status: "cut",
    cutReason,
  });
}

/**
 * Every `setPopulator` name the script registers, in registration order
 * (`oolite-populator.js:111-986`), each with its priority, location, builder
 * and status. Frozen and append-only: the ordinals are stream keys.
 */
export const POPULATOR_ENTRIES: readonly PopulatorEntry[] = Object.freeze([
  cut(0, "oolite-nav-buoy", 5, "COORDINATES", false, D09_BUOY),
  cut(1, "oolite-witch-buoy", 10, "COORDINATES", false, D09_BUOY),
  cut(2, "oolite-route1-asteroids", 20, "LANE_WP", false, D09_ASTEROID),
  cut(3, "oolite-route2-asteroids", 20, "LANE_PS", false, D09_ASTEROID),
  cut(4, "oolite-offlane-hermit", 99, "PLANET_ORBIT_HIGH", false, D09_HERMIT),
  kept(5, "oolite-freighters", "LANE_WP", "freighter"),
  kept(6, "oolite-freighters-docking", "STATION_AEGIS", "freighter"),
  kept(7, "oolite-couriers-route1", "LANE_WP", "courierShort"),
  kept(8, "oolite-couriers-route3", "LANE_WS", "courierLong"),
  kept(9, "oolite-smugglers", "LANE_WP", "smuggler"),
  kept(10, "oolite-hunters-triangle", "LANE_WPS", "lightHunter"),
  kept(11, "oolite-hunters-route1", "LANE_WP", "lightHunter"),
  cut(12, "oolite-hunters-medium-route1", 40, "LANE_WP", true, WORLD_08B),
  cut(13, "oolite-hunters-medium-route3", 40, "LANE_WS", true, WORLD_08B),
  cut(14, "oolite-hunters-heavy-route1", 40, "LANE_WP", true, WORLD_08B),
  cut(15, "oolite-hunters-heavy-route3", 40, "LANE_WS", true, WORLD_08B),
  kept(16, "oolite-pirate-independent-route1", "LANE_WP", "independentPirate"),
  kept(17, "oolite-pirate-independent-route2", "LANE_PS", "independentPirate"),
  kept(18, "oolite-pirate-independent-route3", "LANE_WS", "independentPirate"),
  kept(19, "oolite-pirate-light-route1", "LANE_WP", "lightPirateLocal"),
  kept(20, "oolite-pirate-light-triangle", "LANE_WPS", "lightPirateLocal"),
  kept(21, "oolite-pirate-light-remote", "LANE_WP", "lightPirateRemote"),
  kept(22, "oolite-pirate-medium-route1", "LANE_WP", "mediumPirateLocal"),
  kept(23, "oolite-pirate-medium-triangle", "LANE_WPS", "mediumPirateLocal"),
  kept(24, "oolite-pirate-medium-remote", "LANE_WP", "mediumPirateRemote"),
  kept(25, "oolite-pirate-heavy-route1", "LANE_WP", "heavyPirateLocal"),
  kept(26, "oolite-pirate-heavy-triangle", "LANE_WPS", "heavyPirateLocal"),
  kept(27, "oolite-pirate-heavy-remote", "LANE_WP", "heavyPirateRemote"),
  cut(28, "oolite-assassins", 40, "WITCHPOINT", true, WORLD_08B),
  kept(29, "oolite-police-route1", "LANE_WP", "policePatrol"),
  kept(30, "oolite-police-triangle", "LANE_WPS", "policePatrol"),
  kept(
    31,
    "oolite-police-stationpatrol",
    "STATION_AEGIS",
    "stationPatrol",
    false,
  ),
  kept(32, "oolite-interceptors-route1", "LANE_WP", "interceptors"),
  kept(33, "oolite-interceptors-witchpoint", "WITCHPOINT", "interceptors"),
  cut(34, "oolite-thargoid-scouts", 40, "LANE_WPS", true, D09_THARGOID),
  cut(35, "oolite-thargoid-strike", 40, "LANE_WPS", true, D09_THARGOID),
]);

/** What a cut record describes. */
export type PopulatorCutKind =
  "entry" | "write" | "rate" | "not-an-initial-entry";

export interface PopulatorCut {
  readonly kind: PopulatorCutKind;
  /** The entry name, the cut script write or the cut rate. */
  readonly name: string;
  readonly reason: string;
}

function cutRecord(
  kind: PopulatorCutKind,
  name: string,
  reason: string,
): PopulatorCut {
  return Object.freeze({ kind, name, reason });
}

/**
 * Every cut, with the reason: the entries the table marks cut, the script
 * writes the port does not model (they appear in the recorded fixtures as
 * `cut: true` writes), the one rate that feeds no entry, and the ship classes
 * that are not initial-population entries at all.
 */
export const POPULATOR_CUTS: readonly PopulatorCut[] = Object.freeze([
  ...POPULATOR_ENTRIES.flatMap((entry) =>
    entry.cutReason === null
      ? []
      : [cutRecord("entry", entry.name, entry.cutReason)],
  ),
  cutRecord(
    "write",
    "switchAI",
    "D-10: the opportunist's switchAI write is cut; its data effects (the cargo kind and the bounty) stay",
  ),
  cutRecord(
    "write",
    "_setMissiles",
    "todo 2026-11-25-missiles-and-ecm: missiles are not modelled",
  ),
  cutRecord(
    "write",
    "EQ_ECM",
    "todo 2026-11-25-missiles-and-ecm: the ECM award is not modelled",
  ),
  cutRecord("write", "EQ_SHIELD_BOOSTER", "no equipment model for it"),
  cutRecord("write", "heatInsulation", "no entity field"),
  cutRecord("write", "maxEscorts", "no entity field"),
  cutRecord(
    "rate",
    "pirateAegisRaiders",
    "D-09: a repopulator rate (:333-340), not an initial-population entry",
  ),
  cutRecord(
    "not-an-initial-entry",
    "scavengers",
    "not an initial-population entry: the station launches them (Phase 26)",
  ),
  cutRecord(
    "not-an-initial-entry",
    "shuttles",
    "not an initial-population entry: the station launches them (Phase 26)",
  ),
]);

/**
 * The entries in the order the engine runs them: a stable sort by priority,
 * equal priorities in insertion (ordinal) order (`Universe.m:9990-10001`,
 * assumption A5). The comparator is total over distinct ordinals, so no sort
 * stability is relied on.
 */
export function entriesInEngineOrder(
  entries: readonly PopulatorEntry[],
): readonly PopulatorEntry[] {
  return [...entries].sort(
    (a, b) => a.priority - b.priority || a.ordinal - b.ordinal,
  );
}
