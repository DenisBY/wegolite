// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy hull-octree artifact (CBT-07, D-01).
 *
 * The generated file is compiled at build time from the vendored `.dat` models
 * with the existing octree and radius ports; these cases pin that it parses
 * under the strict schema and holds exactly the ten hulls a laser can hit.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ShipHullCatalogueSchema } from "../../src/content/schemas/ship-hull.js";
import {
  HULL_SHIP_KEYS,
  PLAYER_HULL_KEY,
} from "../../tools/oolite-ingest/convert/ship-hulls.js";

const GENERATED = "src/content/generated/ships-hulls.json";

const generated: unknown = JSON.parse(
  readFileSync(join(process.cwd(), GENERATED), "utf8"),
);

describe("the generated hull file", () => {
  it("parses under the strict hull catalogue schema", () => {
    expect(ShipHullCatalogueSchema.safeParse(generated).success).toBe(true);
  });

  it("holds exactly the ten keys in HULL_SHIP_KEYS order", () => {
    const parsed = ShipHullCatalogueSchema.parse(generated);
    expect(parsed.map((hull) => hull.key)).toEqual([...HULL_SHIP_KEYS]);
    expect(parsed).toHaveLength(10);
  });

  it("includes the Cobra player key, so a firing NPC can hit the player", () => {
    const parsed = ShipHullCatalogueSchema.parse(generated);
    expect(parsed[0]?.key).toBe(PLAYER_HULL_KEY);
    expect(PLAYER_HULL_KEY).toBe("oolite_template_cobra3-player");
  });
});
