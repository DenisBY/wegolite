// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The real hull tables for sim tests (CBT-07, D-01, DATA-15).
 *
 * `src/sim` receives hull data only as a caller-supplied table, and may not
 * import the generated file. A test reads the committed `ships-hulls.json`
 * with `readFileSync` (as `lave.ts` reads the other generated content) and
 * builds the table the app would build from the lazy loader, so a combat
 * scenario runs against the same octrees the build shipped.
 *
 * `realHullTable()` is the ten ship hulls only: the frozen acceptance worlds
 * and the older scenarios run on it. `fullHullTable()` adds the static hulls of
 * `ships-static-hulls.json` (the Coriolis station, the buoy, the barrel and the
 * alloy plate) exactly as the session merges them with traffic on
 * (`hullTable(hulls, statics)` in `src/app/session/traffic.ts`, plan 18-13);
 * the app twins run on it. It is built here independently of `hullTable`, so
 * the equality case in `traffic.test.ts` pins the two together.
 */

import { readFileSync } from "node:fs";

import type {
  HullData,
  HullTable,
  SubentityHull,
} from "../../src/sim/combat/hit.js";
import type { HullOctree } from "../../src/sim/combat/octree.js";

interface HullRecord {
  readonly key: string;
  /** Further ship keys that share this entry's octree (plan 21-04, DATA-18). */
  readonly aliases?: readonly string[];
  readonly collisionRadius: number;
  readonly octree: HullOctree;
}

interface StaticSubentityRecord {
  readonly key: string;
  readonly position: readonly [number, number, number];
  readonly mass: number;
  readonly octree: HullOctree;
}

interface StaticHullRecord extends HullRecord {
  readonly frangible: boolean;
  readonly subentities: readonly StaticSubentityRecord[];
}

function readGenerated(file: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../src/content/generated/${file}`, import.meta.url),
      "utf8",
    ),
  );
}

/** The ten generated hulls as a `HullTable` keyed by spec key. */
export function realHullTable(): HullTable {
  const records = readGenerated("ships-hulls.json") as HullRecord[];
  const table = new Map<string, HullData>();
  for (const record of records) {
    const data: HullData = {
      collisionRadius: record.collisionRadius,
      octree: record.octree,
    };
    for (const key of [record.key, ...(record.aliases ?? [])]) {
      table.set(key, data);
    }
  }
  return table;
}

/**
 * The ten generated hulls plus the four static hulls, as the traffic-on
 * session's table: each static entry carries its subentities (position as
 * authored, in Oolite model axes) and its frangibility. Throws if a static key
 * repeats a ship key, as the session's merge does.
 */
export function fullHullTable(): HullTable {
  const table = new Map<string, HullData>(realHullTable());
  const artifact = readGenerated("ships-static-hulls.json") as {
    readonly hulls: readonly StaticHullRecord[];
  };
  for (const record of artifact.hulls) {
    if (table.has(record.key)) {
      throw new Error(`fullHullTable: duplicate hull key "${record.key}"`);
    }
    const subentities: SubentityHull[] = record.subentities.map((sub) => ({
      key: sub.key,
      position: { x: sub.position[0], y: sub.position[1], z: sub.position[2] },
      mass: sub.mass,
      octree: sub.octree,
    }));
    table.set(record.key, {
      collisionRadius: record.collisionRadius,
      octree: record.octree,
      subentities,
      frangible: record.frangible,
    });
  }
  return table;
}
