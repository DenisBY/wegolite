// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The inert Lave world (plan 12-07): the committed NPC records read the way the
 * content tests read them, and the launch world built over them. Shared by
 * tests/sim/world/populate.test.ts and the golden writer, so the golden and the
 * test build the world one way.
 */

import { readFileSync } from "node:fs";

import type { SystemLayout } from "../../src/sim/world/layout.js";
import {
  INERT_RECORD_KEYS,
  populateInertWorld,
} from "../../src/sim/world/populate.js";
import type { InertShipRecord } from "../../src/sim/world/populate.js";
import { createWorld } from "../../src/sim/world/world.js";
import type { World } from "../../src/sim/world/world.js";

/** `worldSeedFor(marketSeedForSystem("g0-s7"), 1)`, pinned in Phase 11. */
export const LAVE_EPOCH1_WORLD_SEED = 0x2b4e037c;

interface NpcRecord {
  readonly key: string;
  readonly roles: readonly string[];
  readonly scanClass: string;
  readonly radius: number;
  readonly maxEnergy: number;
  readonly energyRechargeRate: number;
  readonly likelyCargo: number;
  readonly maxCargo: number;
}

/**
 * The nine committed NPC records as the populator takes them: selected by
 * explicit key, in `INERT_RECORD_KEYS` order, so the answer is the same whatever
 * the catalogue grows to (FOUND-20). A missing key throws.
 */
export function laveInertRecords(): InertShipRecord[] {
  const raw = readFileSync(
    new URL("../../src/content/generated/ships-npc.json", import.meta.url),
    "utf8",
  );
  const catalogue = JSON.parse(raw) as NpcRecord[];
  return INERT_RECORD_KEYS.map((key) => {
    const record = catalogue.find((candidate) => candidate.key === key);
    if (record === undefined) {
      throw new Error(`the committed catalogue has no NPC record "${key}"`);
    }
    return {
      key: record.key,
      roles: record.roles,
      scanClass: record.scanClass,
      radius: record.radius,
      maxEnergy: record.maxEnergy,
      energyRechargeRate: record.energyRechargeRate,
      likelyCargo: record.likelyCargo,
      maxCargo: record.maxCargo,
    };
  });
}

/** A fresh world of `seed`, populated; returns the world and the spawn count. */
export function buildInertWorld(
  seed: number,
  layout: SystemLayout,
  records: readonly InertShipRecord[],
): { readonly world: World; readonly count: number } {
  const world = createWorld(seed);
  const count = populateInertWorld(world, layout, records);
  return { world, count };
}
