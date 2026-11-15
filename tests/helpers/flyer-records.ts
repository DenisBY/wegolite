// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The three committed NPC records the test flyers use (plan 14-16): a Shuttle
 * flying to the station, a Viper intercepting the player and an Adder fleeing
 * it. They are the same three plan 14-18's `?test=1` hook spawns, read from the
 * committed `ships-npc.json` the way `traffic-fixture.ts` reads it.
 */

import { readFileSync } from "node:fs";

import type { FlyerRecords } from "../../src/sim/ai/test-spawn.js";
import type { InertShipRecord } from "../../src/sim/world/populate.js";

interface NpcJson {
  readonly key: string;
  readonly roles: readonly string[];
  readonly scanClass: string;
  readonly radius: number;
  readonly maxEnergy: number;
  readonly energyRechargeRate: number;
}

/** One committed record by spec key; throws when the catalogue lacks it. */
export function npcRecord(key: string): InertShipRecord {
  const records = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as NpcJson[];
  const found = records.find((record) => record.key === key);
  if (found === undefined) throw new Error(`no NPC record ${key}`);
  return {
    key: found.key,
    roles: found.roles,
    scanClass: found.scanClass,
    radius: found.radius,
    maxEnergy: found.maxEnergy,
    energyRechargeRate: found.energyRechargeRate,
  };
}

/** The Shuttle (station), the Viper (intercept) and the Adder (flee). */
export function flyerRecords(): FlyerRecords {
  return {
    station: npcRecord("shuttle"),
    intercept: npcRecord("viper"),
    flee: npcRecord("adder"),
  };
}
