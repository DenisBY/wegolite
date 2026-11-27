// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The session's traffic content and populate closure (Phase 12, plan 12-08;
 * WORLD-15, D-01).
 *
 * This is the one populate and mass source shared by the live session and the
 * Node tick replay (Pitfall 11): both build their `TrafficContent` through
 * `trafficContent` and their world lifecycle's `populate` through the same
 * closure, so they cannot drift apart. From Phase 22 (plan 22-13, WORLD-08)
 * that closure is `createSystemPopulate`, the system populator; the Node
 * replay uses it from plan 22-13 and the live session from plan 22-14.
 * `createInertPopulate` (the 12-ship inert table of Phase 12) stays for the
 * frozen inert path and its goldens.
 *
 * `createInertPopulate` is total, as rule (ii) of the world lifecycle needs: it
 * never awaits, it does nothing unless traffic is on and both the content and the
 * layout exist, and `populateInertWorld` itself skips refusals, caps its loops
 * and drops a record with an unknown scan class before any draw. It reads both
 * getters at call time, so the lifecycle can exist before the catalogue has
 * finished loading and a later system swap is seen.
 *
 * D-01: with traffic off it spawns nothing, draws nothing and burns no id, so a
 * world with no NPC keeps the starting counter 101 and hashes as the flight hash;
 * with traffic on the post-populate counter is 113.
 *
 * The module must stay importable by the Playwright Node runner: pure, no DOM, no
 * Three, and nothing beyond `src/sim` and `import type` from `src/content/types`.
 *
 * Phase 16 (plan 16-06, WORLD-17, DATA-16): with traffic on the content also
 * carries the compiled debris (`debrisContentFrom`, the one builder of the
 * sim's `DebrisContent`, shared with the Node replay), the debris records for
 * the render and the default explosion setting.
 * `scanClass` is copied as the catalogue's plain string: this module cannot name
 * the id vocabulary, and the populator narrows it.
 */

import type {
  Commodity,
  DebrisRecord,
  ExplosionRecord,
  NpcShip,
  ShipHullCatalogue,
} from "../../content/types.js";
import type { FlyerRecords } from "../../sim/ai/test-spawn.js";
import type { NpcWeapon, NpcWeapons } from "../../sim/combat/aim.js";
import type {
  HullData,
  HullTable,
  SubentityHull,
} from "../../sim/combat/hit.js";
import { NO_LASER } from "../../sim/combat/mounts.js";
import type { HullOctree } from "../../sim/combat/octree.js";
import { vec } from "../../sim/math.js";
import { flightTableFrom } from "../../sim/npc/stats.js";
import type { NpcFlightStats } from "../../sim/npc/stats.js";
import type {
  DebrisContent,
  DebrisHull,
  DebrisModel,
} from "../../sim/world/debris.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import { buildNeighbourhood } from "../../sim/world/neighbourhood.js";
import type { PopulationRecord } from "../../sim/world/population/groups.js";
import { systemFactsFrom } from "../../sim/world/population/plan.js";
import type { SystemFactsSource } from "../../sim/world/population/plan.js";
import { populateSystemWorld } from "../../sim/world/population/spawn.js";
import { populateInertWorld } from "../../sim/world/populate.js";
import type { InertShipRecord } from "../../sim/world/populate.js";
import type { ShipMass } from "../../sim/world/ship-field.js";
import type { World } from "../../sim/world/world.js";

/** The loaded NPC catalogue as the session uses it. Static content, no entity id. */
export interface TrafficContent {
  readonly catalogue: readonly NpcShip[];
  /** The populator's input, in catalogue order. */
  readonly records: readonly InertShipRecord[];
  /**
   * The system populator's input (Phase 22, WORLD-08), in catalogue order: the
   * order the weighted pick walks. Built by `populationRecordsFrom`.
   */
  readonly populationRecords: readonly PopulationRecord[];
  /** The step's jump-blockage masses, in catalogue order. */
  readonly masses: readonly ShipMass[];
  /**
   * The per-kind flight constants the world step steers with (AI-01, plan
   * 14-18), in catalogue order. Built by the one builder `flightTableFrom`, so
   * the live session and the Node tick replay hand every step the same table.
   */
  readonly flight: readonly NpcFlightStats[];
  /**
   * The weapons of each hull per facing by spec key (CBT-07, FOUND-20): static
   * content keyed by the catalogue's own string, never by an entity id.
   */
  readonly weapons: ReadonlyMap<string, NpcWeapons>;
  /**
   * The authored shipdata `laser_color` of each hull that has one, by spec key
   * (quick 261119-i9g): static content keyed by the catalogue's own string,
   * never by an entity id. A hull without an entry fires in its weapon's
   * colour. The router reads it to colour a shot; the sim never does.
   */
  readonly laserColors: ReadonlyMap<string, readonly [number, number, number]>;
  /**
   * The compiled debris content every fixed step passes to the kill path
   * (WORLD-17, `CombatOptions.debris`), built by `debrisContentFrom`. Static
   * content keyed by spec key, no entity id; absent when the session has no
   * debris catalogue (a kill then releases nothing).
   */
  readonly debris?: DebrisContent;
  /**
   * The debris records (pod, plate, wrecks) as loaded, for the render's model
   * paths and sizes (plan 16-08). Static content, no entity id.
   */
  readonly debrisModels?: readonly DebrisRecord[];
  /**
   * The default ship explosion setting, for the render's cloud (plan 16-07,
   * D16-22). Render-only static content; the sim never reads it.
   */
  readonly explosion?: ExplosionRecord;
}

/**
 * The catalogues `trafficContent` adds beside the NPC records (plan 16-06).
 * An absent or undefined catalogue adds nothing.
 */
export interface TrafficExtras {
  readonly debris?: readonly DebrisRecord[] | undefined;
  readonly explosions?: readonly ExplosionRecord[] | undefined;
  /**
   * The commodity catalogue, the goods a released cargo pod can carry (plan
   * 21-14, CBT-11's pod clause; plan 21-15 supplies it). It becomes
   * `DebrisContent.goods`; absent, pods stay anonymous.
   */
  readonly commodities?: readonly Commodity[] | undefined;
}

/**
 * The one setting every compiled hull explodes with (D16-22). The same string
 * as `DEFAULT_EXPLOSION_KEY` in `src/content/schemas/explosion.ts`, restated
 * because this module imports only types from `src/content` (a unit test pins
 * the two equal).
 */
export const DEFAULT_SHIP_EXPLOSION_KEY = "oolite-default-ship-explosion";

function debrisModel(record: DebrisRecord): DebrisModel {
  return Object.freeze({
    key: record.key,
    mass: record.mass,
    radius: record.radius,
  });
}

/**
 * The sim's `DebrisContent` from the NPC records and the debris catalogue: the
 * one builder, shared by the live session (`trafficContent`) and the Node tick
 * replay, so they cannot drift apart. Each NPC record becomes a hull entry
 * (mass, fragment chance, bounding box in Oolite model axes) keyed by its spec
 * key; the pod and plate records become the pod and plate models and the wreck
 * records the wreck list, in catalogue order. With the commodity catalogue the
 * content also carries `goods`, the records in catalogue order (the pod draw of
 * plan 21-14; the per-system `market` is added by `buildStepOptions`); without
 * it there is no `goods` key and pods stay anonymous. Undefined when the
 * catalogue has no pod or no plate (the strict schema already refuses such a
 * file).
 */
export function debrisContentFrom(
  catalogue: readonly NpcShip[],
  debris: readonly DebrisRecord[],
  commodities?: readonly Commodity[],
): DebrisContent | undefined {
  const pod = debris.find((record) => record.role === "pod");
  const plate = debris.find((record) => record.role === "plate");
  if (pod === undefined || plate === undefined) return undefined;
  const hulls = new Map<string, DebrisHull>(
    catalogue.map((ship): [string, DebrisHull] => {
      const { min, max } = ship.boundingBox;
      return [
        ship.key,
        Object.freeze({
          mass: ship.mass,
          fragmentChance: ship.fragmentChance,
          boundingBox: Object.freeze({
            min: vec(min[0], min[1], min[2]),
            max: vec(max[0], max[1], max[2]),
          }),
        }),
      ];
    }),
  );
  return Object.freeze({
    hulls,
    pod: debrisModel(pod),
    plate: debrisModel(plate),
    wrecks: Object.freeze(
      debris.filter((record) => record.role === "wreck").map(debrisModel),
    ),
    ...(commodities === undefined
      ? {}
      : { goods: Object.freeze([...commodities]) }),
  });
}

/**
 * The per-facing weapons of one catalogue hull (FOUND-20): the forward entry
 * is always present (a hull with no forward weapon keeps an
 * `EQ_WEAPON_NONE` entry, so the fire gate still takes its one draw and refuses,
 * as before the shape was per facing); the aft, port and starboard entries are
 * present only when the record arms that facing.
 */
function npcWeaponsOf(ship: NpcShip): NpcWeapons {
  const mount = (
    laser: NpcWeapon["laser"],
    position: readonly number[],
  ): NpcWeapon => ({
    laser,
    offset: vec(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0),
  });
  const aft =
    ship.aftWeapon === NO_LASER
      ? undefined
      : mount(ship.aftWeapon, ship.aftWeaponPosition);
  const port =
    ship.portWeapon === NO_LASER
      ? undefined
      : mount(ship.portWeapon, ship.portWeaponPosition);
  const starboard =
    ship.starboardWeapon === NO_LASER
      ? undefined
      : mount(ship.starboardWeapon, ship.starboardWeaponPosition);
  return Object.freeze({
    fore: mount(ship.forwardWeapon, ship.forwardWeaponPosition),
    ...(aft === undefined ? {} : { aft }),
    ...(port === undefined ? {} : { port }),
    ...(starboard === undefined ? {} : { starboard }),
  });
}

/**
 * The system populator's records from the catalogue (Phase 22, WORLD-08): each
 * compiled record mapped to a {@link PopulationRecord} by named fields, in
 * catalogue order. The mapping never reads a record's `missiles` or
 * `maxMissiles`: every NPC spawns with zero missiles in v2.4 (DATA-17, the
 * missiles tripwire guards this file).
 */
export function populationRecordsFrom(
  catalogue: readonly NpcShip[],
): readonly PopulationRecord[] {
  return Object.freeze(
    catalogue.map((ship): PopulationRecord => ({
      key: ship.key,
      name: ship.name,
      roles: ship.roles,
      scanClass: ship.scanClass,
      radius: ship.radius,
      maxEnergy: ship.maxEnergy,
      energyRechargeRate: ship.energyRechargeRate,
      likelyCargo: ship.likelyCargo,
      maxCargo: ship.maxCargo,
      autoAi: ship.autoAi,
      autoWeapons: ship.autoWeapons,
      hasFuelInjection: ship.hasFuelInjection,
      hyperspaceMotor: ship.hyperspaceMotor,
      escortRoles: ship.escortRoles,
      forwardWeapon: ship.forwardWeapon,
      aftWeapon: ship.aftWeapon,
      fuel: ship.fuel,
      bounty: ship.bounty,
    })),
  );
}

/**
 * Build the populator records, the step masses and the flight table from the
 * catalogue; with the optional extras also the debris content, the debris
 * records and the default explosion setting. Each extra key is set only when
 * its source is present and yields a value (exactOptionalPropertyTypes).
 */
export function trafficContent(
  catalogue: readonly NpcShip[],
  extras: TrafficExtras = {},
): TrafficContent {
  const ships = Object.freeze([...catalogue]);
  const debris =
    extras.debris === undefined
      ? undefined
      : debrisContentFrom(ships, extras.debris, extras.commodities);
  const explosion = extras.explosions?.find(
    (record) => record.key === DEFAULT_SHIP_EXPLOSION_KEY,
  );
  return Object.freeze({
    catalogue: ships,
    records: Object.freeze(
      ships.map((ship): InertShipRecord => ({
        key: ship.key,
        roles: ship.roles,
        scanClass: ship.scanClass,
        radius: ship.radius,
        maxEnergy: ship.maxEnergy,
        energyRechargeRate: ship.energyRechargeRate,
        likelyCargo: ship.likelyCargo,
        maxCargo: ship.maxCargo,
      })),
    ),
    populationRecords: populationRecordsFrom(ships),
    masses: Object.freeze(
      ships.map((ship): ShipMass => ({ specKey: ship.key, mass: ship.mass })),
    ),
    flight: flightTableFrom(ships),
    weapons: new Map(
      ships.map((ship): [string, NpcWeapons] => [ship.key, npcWeaponsOf(ship)]),
    ),
    laserColors: new Map(
      ships.flatMap((ship): [string, readonly [number, number, number]][] =>
        ship.laserColor === null ? [] : [[ship.key, ship.laserColor]],
      ),
    ),
    ...(debris === undefined ? {} : { debris }),
    ...(extras.debris === undefined
      ? {}
      : { debrisModels: Object.freeze([...extras.debris]) }),
    ...(explosion === undefined ? {} : { explosion }),
  });
}

/**
 * The three hulls the `?test=1` flying-NPC hook spawns, by script (plan 14-18):
 * a Shuttle flying to the station, a Viper intercepting the player and an Adder
 * fleeing it. Named once here so the live hook and the Node replay step pick the
 * same records.
 */
export const TEST_FLYER_KEYS = Object.freeze({
  station: "shuttle",
  intercept: "viper",
  flee: "adder",
});

/**
 * The records `spawnTestFlyers` takes, from the loaded content; undefined when
 * the catalogue lacks any of the three hulls (the caller then spawns nothing).
 */
export function testFlyerRecords(
  content: TrafficContent,
): FlyerRecords | undefined {
  const find = (key: string): InertShipRecord | undefined =>
    content.records.find((record) => record.key === key);
  const station = find(TEST_FLYER_KEYS.station);
  const intercept = find(TEST_FLYER_KEYS.intercept);
  const flee = find(TEST_FLYER_KEYS.flee);
  if (station === undefined || intercept === undefined || flee === undefined) {
    return undefined;
  }
  return { station, intercept, flee };
}

/**
 * One record of the static hull artifact (`ships-static-hulls.json`, DATA-15),
 * structurally: this module may import only types from `src/content/types`, and
 * the validated `StaticHull` of the loader satisfies it.
 */
export interface StaticHullRecord {
  readonly key: string;
  readonly collisionRadius: number;
  readonly frangible: boolean;
  readonly octree: HullOctree;
  readonly subentities: readonly {
    readonly key: string;
    /** As authored, in Oolite model axes. */
    readonly position: readonly [number, number, number];
    readonly mass: number;
    readonly octree: HullOctree;
  }[];
}

/**
 * The hull table the hit rule reads (CBT-07): each hull's collision radius and
 * octree keyed by spec key. Static content built from the validated lazy hull
 * chunk; the shared source for the session and the Node tick replay.
 *
 * With traffic on the session also passes the static hulls (plan 18-13,
 * DATA-15): the Coriolis station, the buoy, the barrel and the alloy plate join
 * the same Map after the ten ships, each with its subentities and its
 * frangibility. A subentity position becomes a `Vec3` with no axis conversion
 * (Oolite model axes, as authored). A static key that repeats a ship key is a
 * broken build and throws, so the boot fails visibly instead of silently
 * replacing a ship's hull.
 *
 * A hull entry may carry `aliases` (DATA-18): further ship keys whose records
 * share its model. Each alias is registered with the same `HullData` object as
 * the entry key, so a lookup by any of the keys reaches one octree. A key or
 * alias that repeats one already in the table throws, naming the key, exactly
 * as a static key does; the table keeps the entry keys and aliases in entry
 * order, each entry key followed by its aliases.
 */
export function hullTable(
  catalogue: ShipHullCatalogue,
  statics?: readonly StaticHullRecord[],
): HullTable {
  const table = new Map<string, HullData>();
  for (const hull of catalogue) {
    const data: HullData = {
      collisionRadius: hull.collisionRadius,
      octree: hull.octree,
    };
    for (const key of [hull.key, ...(hull.aliases ?? [])]) {
      if (table.has(key)) {
        throw new Error(
          `Wegolite: the hull key "${key}" repeats a key already in the hull table.`,
        );
      }
      // An alias gets the entry's own HullData object (identity, not a copy):
      // records that share a model share one octree (DATA-18).
      table.set(key, data);
    }
  }
  for (const hull of statics ?? []) {
    if (table.has(hull.key)) {
      throw new Error(
        `Wegolite: the static hull "${hull.key}" repeats a key already in the hull table.`,
      );
    }
    table.set(hull.key, staticHullData(hull));
  }
  return table;
}

/** One static hull record as the hit rule's hull data. */
function staticHullData(hull: StaticHullRecord): HullData {
  return {
    collisionRadius: hull.collisionRadius,
    octree: hull.octree,
    subentities: hull.subentities.map((sub): SubentityHull => ({
      key: sub.key,
      position: vec(sub.position[0], sub.position[1], sub.position[2]),
      mass: sub.mass,
      octree: sub.octree,
    })),
    frangible: hull.frangible,
  };
}

/** Whether two hull data describe the same hull (octrees by identity). */
function sameHullData(a: HullData, b: HullData): boolean {
  if (
    a.collisionRadius !== b.collisionRadius ||
    a.octree !== b.octree ||
    a.frangible !== b.frangible
  ) {
    return false;
  }
  const left = a.subentities ?? [];
  const right = b.subentities ?? [];
  return (
    left.length === right.length &&
    left.every((sub, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        sub.key === other.key &&
        sub.mass === other.mass &&
        sub.octree === other.octree &&
        sub.position.x === other.position.x &&
        sub.position.y === other.position.y &&
        sub.position.z === other.position.z
      );
    })
  );
}

/**
 * The hull table with one station artifact's hulls added (Phase 22.1,
 * WORLD-20): a Dodecahedron or Icosahedron station's octrees live in an
 * artifact of their own and join the session's table once the player is at, or
 * is about to arrive at, that kind of system. Returns a new table; the one it
 * is given is not touched, so a step that already holds the old table is never
 * changed under it.
 *
 * Merging an artifact whose key is already present with the same data is a
 * no-op for that key (two merges of one artifact yield an equal table). A key
 * that is present with different data, a ship key included, is a broken build
 * and throws, naming the key, exactly as `hullTable` does for a repeated static
 * key.
 */
export function mergeStationHulls(
  table: HullTable,
  artifact: { readonly hulls: readonly StaticHullRecord[] },
): HullTable {
  const merged = new Map(table);
  for (const hull of artifact.hulls) {
    const data = staticHullData(hull);
    const present = merged.get(hull.key);
    if (present === undefined) {
      merged.set(hull.key, data);
    } else if (!sameHullData(present, data)) {
      throw new Error(
        `Wegolite: the station hull "${hull.key}" is already in the hull table with different data.`,
      );
    }
  }
  return merged;
}

/**
 * The lifecycle's `Populate` for the inert populator. Structurally the same
 * type as `Populate` in world-lifecycle.ts, which this module does not import.
 * No session code installs it since Phase 22 (`createSystemPopulate` replaced
 * it); it stays for the frozen inert path: the epoch 1-20 pin and the 20-seed
 * acceptance run build their worlds through it.
 */
export function createInertPopulate(
  content: () => TrafficContent | undefined,
  layout: () => SystemLayout | undefined,
): (world: World, options: { readonly traffic: boolean }) => void {
  return (world, { traffic }) => {
    if (!traffic) return;
    const loaded = content();
    const systemLayout = layout();
    if (loaded === undefined || systemLayout === undefined) return;
    populateInertWorld(world, systemLayout, loaded.records);
  };
}

/**
 * The records of `list` that can be neighbours of a system in `galaxy`: a
 * record that names a different galaxy is dropped, so a list of one galaxy
 * never feeds the neighbourhood of an arrival in another (IN-03 of the Phase 22
 * review). The session holds one fixed galaxy list (galaxy 0 today, the galactic
 * drive is not in v2.4) and `buildNeighbourhood` reads the arrival's index
 * against it; without this the populator would silently take the neighbours of
 * the same index in the wrong galaxy. A record with no numeric `galaxy` (a
 * malformed one) is kept: `buildNeighbourhood` drops it by its own rules.
 * Dropping every record gives empty neighbour lists, which the planner already
 * handles, so the call stays total.
 */
function sameGalaxyOnly(
  list: readonly unknown[],
  galaxy: number,
): readonly unknown[] {
  return list.filter((record) => {
    if (typeof record !== "object" || record === null) return true;
    const own = (record as { readonly galaxy?: unknown }).galaxy;
    return typeof own !== "number" || own === galaxy;
  });
}

/**
 * The lifecycle's `Populate` for the system populator (Phase 22, WORLD-08):
 * the initial population of the system the ship arrives in. Structurally the
 * same type as `Populate` in world-lifecycle.ts, which this module does not
 * import.
 *
 * With traffic on it reads all four getters at call time (so the lifecycle can
 * exist before the catalogue has loaded, and a jump's new system and galaxy are
 * seen), builds the system's neighbourhood and facts and calls
 * `populateSystemWorld`, which places every group of the planner's table. With
 * traffic off, or with the content, layout or system missing, it spawns
 * nothing, draws nothing and burns no id (D-01 of Phase 12), so a world with no
 * NPC keeps the starting counter 101 and hashes as the flight hash.
 *
 * Total, as rule (ii) of the world lifecycle needs: it never awaits, and
 * `buildNeighbourhood` drops a malformed galaxy record (an absent or empty list
 * gives empty neighbour lists) while `populateSystemWorld` is total. The
 * `system` is the arrival system's record (`ctx.core.system` in the session);
 * the `galaxy` is its galaxy's system list. A record of another galaxy than the
 * arrival's is ignored (`sameGalaxyOnly`), so a mismatched list yields no
 * neighbours instead of the wrong ones.
 */
export function createSystemPopulate(
  content: () => TrafficContent | undefined,
  layout: () => SystemLayout | undefined,
  system: () => SystemFactsSource | undefined,
  galaxy: () => readonly unknown[] | undefined,
): (world: World, options: { readonly traffic: boolean }) => void {
  return (world, { traffic }) => {
    if (!traffic) return;
    const loaded = content();
    const systemLayout = layout();
    const arrival = system();
    if (
      loaded === undefined ||
      systemLayout === undefined ||
      arrival === undefined
    ) {
      return;
    }
    const neighbourhood = buildNeighbourhood(
      sameGalaxyOnly(galaxy() ?? [], arrival.galaxy),
      arrival.systemIndex,
    );
    populateSystemWorld(
      world,
      systemLayout,
      systemFactsFrom(arrival, neighbourhood, systemLayout),
      loaded.populationRecords,
    );
  };
}
