// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The session's traffic content and populate closure (Phase 12, plan 12-08;
 * WORLD-15, D-01).
 *
 * This is the one populate and mass source shared by the live session and the
 * Node tick replay (Pitfall 11): both build their `TrafficContent` through
 * `trafficContent` and their world lifecycle's `populate` through
 * `createInertPopulate`, so they cannot drift apart.
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
  DebrisRecord,
  ExplosionRecord,
  NpcShip,
  ShipHullCatalogue,
} from "../../content/types.js";
import type { FlyerRecords } from "../../sim/ai/test-spawn.js";
import type { NpcWeapon } from "../../sim/combat/aim.js";
import type { HullTable } from "../../sim/combat/hit.js";
import { vec } from "../../sim/math.js";
import { flightTableFrom } from "../../sim/npc/stats.js";
import type { NpcFlightStats } from "../../sim/npc/stats.js";
import type {
  DebrisContent,
  DebrisHull,
  DebrisModel,
} from "../../sim/world/debris.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import { populateInertWorld } from "../../sim/world/populate.js";
import type { InertShipRecord } from "../../sim/world/populate.js";
import type { ShipMass } from "../../sim/world/ship-field.js";
import type { World } from "../../sim/world/world.js";

/** The loaded NPC catalogue as the session uses it. Static content, no entity id. */
export interface TrafficContent {
  readonly catalogue: readonly NpcShip[];
  /** The populator's input, in catalogue order. */
  readonly records: readonly InertShipRecord[];
  /** The step's jump-blockage masses, in catalogue order. */
  readonly masses: readonly ShipMass[];
  /**
   * The per-kind flight constants the world step steers with (AI-01, plan
   * 14-18), in catalogue order. Built by the one builder `flightTableFrom`, so
   * the live session and the Node tick replay hand every step the same table.
   */
  readonly flight: readonly NpcFlightStats[];
  /**
   * The forward weapon of each hull by spec key (CBT-07): static content keyed
   * by the catalogue's own string, never by an entity id.
   */
  readonly weapons: ReadonlyMap<string, NpcWeapon>;
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

/** The catalogues `trafficContent` adds beside the NPC records (plan 16-06). */
export interface TrafficExtras {
  readonly debris?: readonly DebrisRecord[];
  readonly explosions?: readonly ExplosionRecord[];
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
 * records the wreck list, in catalogue order. Undefined when the catalogue has
 * no pod or no plate (the strict schema already refuses such a file).
 */
export function debrisContentFrom(
  catalogue: readonly NpcShip[],
  debris: readonly DebrisRecord[],
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
  });
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
      : debrisContentFrom(ships, extras.debris);
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
    masses: Object.freeze(
      ships.map((ship): ShipMass => ({ specKey: ship.key, mass: ship.mass })),
    ),
    flight: flightTableFrom(ships),
    weapons: new Map(
      ships.map((ship): [string, NpcWeapon] => {
        const [x, y, z] = ship.forwardWeaponPosition;
        return [ship.key, { laser: ship.forwardWeapon, offset: vec(x, y, z) }];
      }),
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
 * The hull table the hit rule reads (CBT-07): each hull's collision radius and
 * octree keyed by spec key. Static content built from the validated lazy hull
 * chunk; the shared source for the session and the Node tick replay.
 */
export function hullTable(catalogue: ShipHullCatalogue): HullTable {
  return new Map(
    catalogue.map((hull) => [
      hull.key,
      { collisionRadius: hull.collisionRadius, octree: hull.octree },
    ]),
  );
}

/**
 * The lifecycle's `Populate` for the inert populator. Structurally the same
 * type as `Populate` in world-lifecycle.ts, which this module does not import.
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
