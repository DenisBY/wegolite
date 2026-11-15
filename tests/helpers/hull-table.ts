// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The real hull table for sim tests (CBT-07, D-01).
 *
 * `src/sim` receives hull data only as a caller-supplied table, and may not
 * import the generated file. A test reads the committed `ships-hulls.json`
 * with `readFileSync` (as `lave.ts` reads the other generated content) and
 * builds the table the app would build from the lazy loader, so a combat
 * scenario runs against the same octrees the build shipped.
 */

import { readFileSync } from "node:fs";

import type { HullData, HullTable } from "../../src/sim/combat/hit.js";
import type { HullOctree } from "../../src/sim/combat/octree.js";

interface HullRecord {
  readonly key: string;
  readonly collisionRadius: number;
  readonly octree: HullOctree;
}

/** The ten generated hulls as a `HullTable` keyed by spec key. */
export function realHullTable(): HullTable {
  const records = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/ships-hulls.json", import.meta.url),
      "utf8",
    ),
  ) as HullRecord[];
  const table = new Map<string, HullData>();
  for (const record of records) {
    table.set(record.key, {
      collisionRadius: record.collisionRadius,
      octree: record.octree,
    });
  }
  return table;
}
