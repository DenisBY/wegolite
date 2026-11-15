// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The real NPC flight table for sim tests (AI-01).
 *
 * `src/sim` receives the per-kind flight constants only as a caller-supplied
 * table (`StepOptions.npcFlight`) and may not import the generated file. A test
 * reads the committed `ships-npc.json` with `readFileSync` and builds the table
 * with `flightTableFrom`, the one builder the app calls too.
 */

import { readFileSync } from "node:fs";

import { flightTableFrom } from "../../src/sim/npc/stats.js";
import type { FlightRecord, NpcFlightStats } from "../../src/sim/npc/stats.js";

/** The nine generated NPC hulls' flight stats, keyed by spec key. */
export function realNpcFlightTable(): readonly NpcFlightStats[] {
  const records = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as FlightRecord[];
  return flightTableFrom(records);
}
