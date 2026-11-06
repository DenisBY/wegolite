// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The committed commodity fixture for Node tests (ECON-01).
 *
 * Reads `src/content/generated/commodities.json` with `readFileSync` rather
 * than importing it: `src/sim` may not import generated content, and a Node test
 * must exercise the same bytes the build shipped. The loader's strict schema is
 * the parser, so a fixture that drifted from the emitted shape fails here.
 */

import { readFileSync } from "node:fs";

import { parseCommodities } from "../../src/content/commodities.js";
import type { Commodity, CommodityUnit } from "../../src/content/types.js";

/** Load and validate the committed commodity records. */
export function commoditiesFixture(): readonly Commodity[] {
  const raw = readFileSync(
    new URL("../../src/content/generated/commodities.json", import.meta.url),
    "utf8",
  );
  return parseCommodities(JSON.parse(raw) as unknown);
}

/** The unit map the session builds once from the loaded catalogue. */
export function commodityUnits(
  commodities: readonly Commodity[],
): ReadonlyMap<string, CommodityUnit> {
  return new Map(commodities.map((record) => [record.key, record.unit]));
}
