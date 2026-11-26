// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The initial-population census of Phase 22 plan 22-12 (WORLD-08 criterion 3,
 * D-06, D-11, QUAL-09's census half): one function computes the population of a
 * system at an epoch through the production path, and one function turns the
 * rows into the statistics the golden records. The writer
 * (`write-population-census.ts`) and the test (`census.test.ts`) both import it,
 * so the golden and its check cannot compute two different things.
 *
 * The production path: `createWorld(worldSeedFor(marketSeedForSystem(id),
 * epoch))`, `deriveSystemLayout`, `buildNeighbourhood`, `systemFactsFrom` and
 * `populateSystemWorld` over the committed catalogue `ships-npc.json`.
 */

import { readFileSync } from "node:fs";

import type { System } from "../../src/content/types.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { worldSeedFor } from "../../src/sim/rng.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { buildNeighbourhood } from "../../src/sim/world/neighbourhood.js";
import { systemFactsFrom } from "../../src/sim/world/population/plan.js";
import type { SystemFacts } from "../../src/sim/world/population/plan.js";
import { populateSystemWorld } from "../../src/sim/world/population/spawn.js";
import type { PopulateSystemResult } from "../../src/sim/world/population/spawn.js";
import { createWorld } from "../../src/sim/world/world.js";
import type { World } from "../../src/sim/world/world.js";
import { laveFixture } from "./lave.js";
import { hullTriangles } from "./glb-triangles.js";
import type { HullRecord } from "./glb-triangles.js";
import {
  committedPopulationRecords,
  galaxySystems,
} from "./population-fixtures.js";

/** Triangles of the traffic-on scene with its models held (`docs/PERFORMANCE.md`). */
export const SCENE_TRIANGLES_TRAFFIC_ON = 39_192;
/** The 21-19 kill's triangle delta (78,598 after a kill minus 77,934 before). */
export const FIGHT_TRIANGLE_DELTA = 664;
/** Draw calls of the scene without ships (the `Lave in flight` row). */
export const SCENE_CALLS = 10;
/** One laser-shot layer call, the two explosion layers and up to seven debris models. */
export const FIGHT_LAYER_CALLS = 1 + 2 + 7;

/** The epoch a docked-save launch builds: the fixture's epoch 0, bumped once by `begin`. */
export const DOCKED_LAUNCH_EPOCH = 1;

/** One system of the census with everything its worlds need. */
export interface CensusSystem {
  readonly system: System;
  readonly layout: SystemLayout;
  readonly facts: SystemFacts;
  /** Position in the flat 2,048-system list: `galaxy * 256 + systemIndex`. */
  readonly ordinal: number;
}

/** One populated world, reduced to what the census records. */
export interface CensusRow {
  readonly id: string;
  readonly galaxy: number;
  readonly systemIndex: number;
  readonly government: number;
  readonly epoch: number;
  /** Ships in the world (the station patrol included). */
  readonly ships: number;
  /** `World.groups` length after the populate call. */
  readonly groups: number;
  /** Distinct hull keys among the ships. */
  readonly keys: number;
  /** The realised NPC triangles: the GLB triangle count of each ship's hull, summed. */
  readonly triangles: number;
  readonly skippedGroups: number;
  readonly fallbacks: number;
}

interface CommittedHull extends HullRecord {
  readonly key: string;
}

let hulls: ReadonlyMap<string, number> | undefined;

/** The GLB triangle count per catalogue key. */
export function catalogueHullTriangles(): ReadonlyMap<string, number> {
  hulls ??= hullTriangles(
    (
      JSON.parse(
        readFileSync(
          new URL(
            "../../src/content/generated/ships-npc.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ) as readonly CommittedHull[]
    ).map((record) => ({ key: record.key, glb: record.glb })),
  );
  return hulls;
}

/** The galaxies the census covers, `0..galaxies-1`, with every system's facts. */
export function censusSystems(galaxies: number): readonly CensusSystem[] {
  const { stationDef } = laveFixture();
  const out: CensusSystem[] = [];
  for (let galaxy = 0; galaxy < galaxies; galaxy += 1) {
    const content = galaxySystems(galaxy);
    for (const system of content) {
      const layout = deriveSystemLayout(system, stationDef);
      const facts = systemFactsFrom(
        system,
        buildNeighbourhood(content, system.systemIndex),
        layout,
      );
      out.push({
        system,
        layout,
        facts,
        ordinal: system.galaxy * 256 + system.systemIndex,
      });
    }
  }
  return out;
}

/** One populated world of the census, with the world itself for further checks. */
export interface CensusWorld {
  readonly row: CensusRow;
  readonly world: World;
  readonly result: PopulateSystemResult;
}

/** Populate `entry` at `epoch` through the production path. */
export function censusWorld(entry: CensusSystem, epoch: number): CensusWorld {
  const { system, layout, facts } = entry;
  const world = createWorld(
    worldSeedFor(marketSeedForSystem(system.id), epoch),
  );
  const result = populateSystemWorld(
    world,
    layout,
    facts,
    committedPopulationRecords(),
  );
  const triangleOf = catalogueHullTriangles();
  const keys = new Set<string>();
  let triangles = 0;
  for (const ship of world.store.live) {
    keys.add(ship.specKey);
    const hull = triangleOf.get(ship.specKey);
    if (hull === undefined) {
      throw new Error(`no hull triangles for catalogue key "${ship.specKey}"`);
    }
    triangles += hull;
  }
  return {
    world,
    result,
    row: {
      id: system.id,
      galaxy: system.galaxy,
      systemIndex: system.systemIndex,
      government: system.government,
      epoch,
      ships: world.store.live.length,
      groups: world.groups.length,
      keys: keys.size,
      triangles,
      skippedGroups: result.skippedGroups,
      fallbacks: result.fallbacks,
    },
  };
}

/** The budgets arithmetic of one row (QUAL-09): scene plus NPC plus the fight delta. */
export function triangleTotal(row: Pick<CensusRow, "triangles">): number {
  return SCENE_TRIANGLES_TRAFFIC_ON + row.triangles + FIGHT_TRIANGLE_DELTA;
}

/** The analytic call bound: the scene, one call per hull key present, the fight layers. */
export function callBound(row: Pick<CensusRow, "keys">): number {
  return SCENE_CALLS + row.keys + FIGHT_LAYER_CALLS;
}

// --- Statistics -------------------------------------------------------------

/** The nearest-rank percentile `p` (0..1) of an ascending list. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(
    sorted.length,
    Math.max(1, Math.ceil(p * sorted.length)),
  );
  return sorted[rank - 1] as number;
}

/** The median: the mean of the two middle values of an even list. */
export function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** Round to six decimals so a golden mean is the same text on every machine. */
export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** A world named by its system and epoch. */
export interface WorldRef {
  readonly system: string;
  readonly epoch: number;
}

export interface GovernmentStats {
  readonly worlds: number;
  readonly mean: number;
  readonly peak: number;
}

export interface CensusStats {
  readonly systems: number;
  readonly epochs: number;
  readonly worlds: number;
  readonly mean: number;
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly peak: WorldRef & { readonly ships: number };
  readonly byGovernment: Readonly<Record<string, GovernmentStats>>;
  /** The ten largest government-0 worlds, by ships descending, then system order, then epoch. */
  readonly anarchyTail: readonly (WorldRef & { readonly ships: number })[];
  readonly peakGroups: WorldRef & { readonly groups: number };
  readonly skippedGroups: number;
  readonly fallbacks: number;
  readonly peakNpcTriangles: WorldRef & {
    readonly triangles: number;
    readonly total: number;
  };
  readonly peakCalls: WorldRef & { readonly calls: number };
  readonly peakKeys: WorldRef & { readonly keys: number };
}

/** Rows ordered by system order (galaxy, then index) and epoch: the census order. */
export function sortRows(rows: readonly CensusRow[]): CensusRow[] {
  return [...rows].sort(
    (a, b) =>
      a.galaxy - b.galaxy || a.systemIndex - b.systemIndex || a.epoch - b.epoch,
  );
}

/** The row maximising `value`; the first in census order wins a tie. */
function peakOf(
  rows: readonly CensusRow[],
  value: (row: CensusRow) => number,
): CensusRow {
  let best = rows[0] as CensusRow;
  for (const row of rows) {
    if (value(row) > value(best)) best = row;
  }
  return best;
}

/** The statistics of a set of rows; deterministic, a function of the rows alone. */
export function summarise(input: readonly CensusRow[]): CensusStats {
  const rows = sortRows(input);
  if (rows.length === 0) throw new RangeError("the census has no rows");
  const ships = rows.map((row) => row.ships).sort((a, b) => a - b);
  const sum = ships.reduce((total, value) => total + value, 0);
  const peak = peakOf(rows, (row) => row.ships);
  const peakGroups = peakOf(rows, (row) => row.groups);
  const peakTriangles = peakOf(rows, (row) => row.triangles);
  const peakCalls = peakOf(rows, (row) => callBound(row));
  const peakKeys = peakOf(rows, (row) => row.keys);

  const byGovernment: Record<string, GovernmentStats> = {};
  for (let government = 0; government < 8; government += 1) {
    const group = rows.filter((row) => row.government === government);
    if (group.length === 0) continue;
    byGovernment[String(government)] = {
      worlds: group.length,
      mean: round6(
        group.reduce((total, row) => total + row.ships, 0) / group.length,
      ),
      peak: Math.max(...group.map((row) => row.ships)),
    };
  }

  const anarchyTail = rows
    .filter((row) => row.government === 0)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.ships - a.row.ships || a.index - b.index)
    .slice(0, 10)
    .map(({ row }) => ({ system: row.id, epoch: row.epoch, ships: row.ships }));

  return {
    systems: new Set(rows.map((row) => row.id)).size,
    epochs: new Set(rows.map((row) => row.epoch)).size,
    worlds: rows.length,
    mean: round6(sum / rows.length),
    median: median(ships),
    p95: percentile(ships, 0.95),
    p99: percentile(ships, 0.99),
    peak: { system: peak.id, epoch: peak.epoch, ships: peak.ships },
    byGovernment,
    anarchyTail,
    peakGroups: {
      system: peakGroups.id,
      epoch: peakGroups.epoch,
      groups: peakGroups.groups,
    },
    skippedGroups: rows.reduce((total, row) => total + row.skippedGroups, 0),
    fallbacks: rows.reduce((total, row) => total + row.fallbacks, 0),
    peakNpcTriangles: {
      system: peakTriangles.id,
      epoch: peakTriangles.epoch,
      triangles: peakTriangles.triangles,
      total: triangleTotal(peakTriangles),
    },
    peakCalls: {
      system: peakCalls.id,
      epoch: peakCalls.epoch,
      calls: callBound(peakCalls),
    },
    peakKeys: {
      system: peakKeys.id,
      epoch: peakKeys.epoch,
      keys: peakKeys.keys,
    },
  };
}

/** One system the QUAL-09 browser spec boots, with its census at the docked-launch epoch. */
export interface SpecSystem {
  readonly id: string;
  /** The name `dockedSaveAt` takes. */
  readonly name: string;
  readonly epoch: number;
  readonly ships: number;
  readonly keys: number;
  readonly triangles: number;
  readonly groups: number;
}

export interface SpecSystems {
  readonly dockedLaunchEpoch: number;
  /** The galaxy-0 anarchy with the most ships. */
  readonly largestAnarchy: SpecSystem;
  /** The galaxy-0 anarchy with the most distinct hull keys (ties: most ships). */
  readonly mostKeysAnarchy: SpecSystem;
}

function specSystem(row: CensusRow, name: string): SpecSystem {
  return {
    id: row.id,
    name,
    epoch: row.epoch,
    ships: row.ships,
    keys: row.keys,
    triangles: row.triangles,
    groups: row.groups,
  };
}

/**
 * The galaxy-0 anarchies the browser spec boots, from the rows of the docked-launch
 * epoch: the most ships, and the most distinct keys (ties: more ships, then the
 * lower system index). `nameOf` gives a system's display name.
 */
export function chooseSpecSystems(
  rows: readonly CensusRow[],
  nameOf: (id: string) => string,
): SpecSystems {
  const anarchies = sortRows(rows).filter(
    (row) =>
      row.galaxy === 0 &&
      row.government === 0 &&
      row.epoch === DOCKED_LAUNCH_EPOCH,
  );
  if (anarchies.length === 0) {
    throw new RangeError("no galaxy-0 anarchy at the docked-launch epoch");
  }
  const largest = peakOf(anarchies, (row) => row.ships);
  let mostKeys = anarchies[0] as CensusRow;
  for (const row of anarchies) {
    if (
      row.keys > mostKeys.keys ||
      (row.keys === mostKeys.keys && row.ships > mostKeys.ships)
    ) {
      mostKeys = row;
    }
  }
  return {
    dockedLaunchEpoch: DOCKED_LAUNCH_EPOCH,
    largestAnarchy: specSystem(largest, nameOf(largest.id)),
    mostKeysAnarchy: specSystem(mostKeys, nameOf(mostKeys.id)),
  };
}

// --- The golden's digest ----------------------------------------------------

/** One world as a digest token: `ships/groups/keys/triangles`. */
export function digestToken(row: CensusRow): string {
  return `${String(row.ships)}/${String(row.groups)}/${String(row.keys)}/${String(row.triangles)}`;
}

/** A system's digest: its epochs' tokens, ascending by epoch, space separated. */
export function digestOf(rows: readonly CensusRow[]): string {
  return [...rows]
    .sort((a, b) => a.epoch - b.epoch)
    .map(digestToken)
    .join(" ");
}

/** The token of `epoch` (1-based) in a system's digest, or undefined. */
export function tokenAt(digest: string, epoch: number): string | undefined {
  return digest.split(" ")[epoch - 1];
}

/** The `digest` map of the golden: system id to digest, in census order. */
export function digestMap(rows: readonly CensusRow[]): Record<string, string> {
  const byId = new Map<string, CensusRow[]>();
  for (const row of sortRows(rows)) {
    const list = byId.get(row.id);
    if (list === undefined) byId.set(row.id, [row]);
    else list.push(row);
  }
  const out: Record<string, string> = {};
  for (const [id, list] of byId) out[id] = digestOf(list);
  return out;
}

/** Decode a digest back into rows (the government and the skip counts come from the caller). */
export function rowsFromDigest(
  id: string,
  galaxy: number,
  systemIndex: number,
  government: number,
  digest: string,
): CensusRow[] {
  return digest.split(" ").map((token, index) => {
    const [ships, groups, keys, triangles] = token.split("/").map(Number);
    return {
      id,
      galaxy,
      systemIndex,
      government,
      epoch: index + 1,
      ships: ships as number,
      groups: groups as number,
      keys: keys as number,
      triangles: triangles as number,
      skippedGroups: 0,
      fallbacks: 0,
    };
  });
}
