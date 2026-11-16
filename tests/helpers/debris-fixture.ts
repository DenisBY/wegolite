// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The sim tests' debris content (plan 16-02): a hand fixture, not the compiled
 * catalogue.
 *
 * The model facts (key, mass in kg, collision radius in m) are the values the
 * phase research measured in the container from the Oolite models: the pod
 * `barrel`, the plate `alloy` and the five wreckage models. The hulls are read
 * from the committed `ships-npc.json` with `readFileSync` (key, mass,
 * fragmentChance), each with a synthetic bounding box of plus and minus half
 * the record's radius per axis. The compiled box arrives with plan 16-05, and
 * the app tests of plan 16-06 use the real catalogue.
 */

import { readFileSync } from "node:fs";

import type {
  DebrisContent,
  DebrisHull,
  DebrisModel,
} from "../../src/sim/world/debris.js";

interface NpcRecord {
  readonly key: string;
  readonly mass: number;
  readonly radius: number;
  readonly fragmentChance: number;
}

/** The cargo pod (`oolite_template_barrel`). */
export const FIXTURE_POD: DebrisModel = {
  key: "barrel",
  mass: 993.37,
  radius: 5.7986,
};

/** The alloy plate. */
export const FIXTURE_PLATE: DebrisModel = {
  key: "alloy",
  mass: 273.44,
  radius: 5.1492,
};

/** The five wreckage models. */
export const FIXTURE_WRECKS: readonly DebrisModel[] = [
  { key: "wreckage-component", mass: 3979.17, radius: 17.28 },
  { key: "more-wreckage2", mass: 5793.83, radius: 18.66 },
  { key: "more-wreckage3", mass: 2678.52, radius: 19.39 },
  { key: "more-wreckage4", mass: 4352.72, radius: 21.19 },
  { key: "more-wreckage5", mass: 6317.55, radius: 22.42 },
];

/** The NPC hulls as debris hulls, each with a synthetic box of ±radius/2. */
export function fixtureHulls(): Map<string, DebrisHull> {
  const records = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as NpcRecord[];
  const hulls = new Map<string, DebrisHull>();
  for (const record of records) {
    const half = record.radius / 2;
    hulls.set(record.key, {
      mass: record.mass,
      fragmentChance: record.fragmentChance,
      boundingBox: {
        min: { x: -half, y: -half, z: -half },
        max: { x: half, y: half, z: half },
      },
    });
  }
  return hulls;
}

/** The sim tests' `DebrisContent`. */
export function debrisFixture(): DebrisContent {
  return {
    hulls: fixtureHulls(),
    pod: FIXTURE_POD,
    plate: FIXTURE_PLATE,
    wrecks: FIXTURE_WRECKS,
  };
}
