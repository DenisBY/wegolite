// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Golden save migration proof (QUAL-04, T-07-10).
 *
 * Two checked-in v1 blobs (a Phase 4 shape and a Phase 5 shape that uses every
 * optional v1 field) travel through the production reader, `parseSave`, with the
 * boot allow-lists, and must reproduce a checked-in v2 golden byte for byte in
 * canonical JSON. The v2 files are REGRESSION snapshots: they were produced once
 * from `migrateV1ToV2` and then reviewed by hand against that function's rules
 * (seed kept, no market snapshot, cargo carried, version 2). They are never
 * regenerated blindly. If one changes, reconcile the migration first.
 *
 * The validator is not loosened for these fixtures. A golden that cannot pass
 * `parseSave` with the production allow-lists is a wrong golden.
 *
 * The canonical v2 in-flight golden (`v2-phase10-inflight.json`) is the v2
 * writer's own output, captured before plan 11-02 replaces that writer, and is
 * migration input from then on.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SaveV1Schema,
  encodeSave,
  migrateV1ToV2,
  parseSave,
} from "../../src/persistence/save.js";
import type { SaveAllowLists, SaveInputs } from "../../src/persistence/save.js";
import { CLOCK_START } from "../../src/sim/flight/state.js";

/** The 17 commodity keys a market snapshot may carry (Alien Items included). */
const MARKET_GOODS: readonly string[] = [
  "food",
  "textiles",
  "radioactives",
  "slaves",
  "liquor_wines",
  "luxuries",
  "narcotics",
  "computers",
  "machinery",
  "alloys",
  "firearms",
  "furs",
  "minerals",
  "gold",
  "platinum",
  "gem_stones",
  "alien_items",
];

const ALLOW: SaveAllowLists = {
  equipment: new Set([
    "EQ_CARGO_BAY",
    "EQ_DOCK_COMP",
    "EQ_FUEL",
    "EQ_MISSILE",
    "EQ_MISSILE_REMOVAL",
    "EQ_PASSENGER_BERTH",
    "EQ_PASSENGER_BERTH_REMOVAL",
  ]),
  systems: new Set(["g0-s7", "g0-s1"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map([
    ["food", "t"],
    ["gold", "kg"],
    ["gem_stones", "g"],
  ]),
  marketGoods: new Set(MARKET_GOODS),
};

const GOLDEN_DIR = new URL("../golden/save/", import.meta.url);

function readGolden(name: string): string {
  return readFileSync(new URL(name, GOLDEN_DIR), "utf8");
}

/** Canonical bytes: Prettier whitespace in a golden cannot change the result. */
function canonical(value: unknown): string {
  return JSON.stringify(value);
}

const PAIRS = [
  {
    label: "Phase 4 v1 blob",
    v1: "v1-phase4.json",
    v2: "v2-from-v1-phase4.json",
  },
  {
    label: "Phase 5 v1 blob with every optional field",
    v1: "v1-phase5.json",
    v2: "v2-from-v1-phase5.json",
  },
] as const;

describe("golden v1 save migration through the production reader", () => {
  for (const pair of PAIRS) {
    describe(pair.label, () => {
      it("parses through parseSave with the allow-lists to a version 2 save", () => {
        const result = parseSave(readGolden(pair.v1), ALLOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.save.version).toBe(2);
      });

      it("matches the checked-in v2 golden in canonical JSON", () => {
        const result = parseSave(readGolden(pair.v1), ALLOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(canonical(result.save)).toBe(
          canonical(JSON.parse(readGolden(pair.v2))),
        );
      });

      it("migrates the same v1 blob twice to identical bytes", () => {
        const v1 = SaveV1Schema.parse(JSON.parse(readGolden(pair.v1)));
        expect(canonical(migrateV1ToV2(v1))).toBe(canonical(migrateV1ToV2(v1)));
      });

      it("re-parses the migrated v2 to an equal object (round trip)", () => {
        const result = parseSave(readGolden(pair.v1), ALLOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const reparsed = parseSave(canonical(result.save), ALLOW);
        expect(reparsed).toEqual({ ok: true, save: result.save });
      });
    });
  }
});

/**
 * The inputs of the captured v2 in-flight golden: a market snapshot, a flight
 * pose, a committed hyperspace target and cargo, so every optional v2 field the
 * writer emits for an in-flight save is present.
 */
const V2_INFLIGHT_INPUTS: SaveInputs = {
  clockSeconds: CLOCK_START + 1234,
  credits: 98765,
  equipment: ["EQ_DOCK_COMP"],
  cargo: [
    { key: "food", quantity: 3 },
    { key: "gold", quantity: 499 },
    { key: "gem_stones", quantity: 250 },
  ],
  fuel: 42,
  missiles: 2,
  passengerBerths: 0,
  mode: "inFlight",
  targetSystem: "g0-s1",
  market: {
    systemId: "g0-s7",
    seed: 3545325333,
    goods: MARKET_GOODS.map((key, index) => ({
      key,
      price: 100 + index,
      stock: 3 * index,
    })),
  },
  flight: {
    position: [1200.5, -40.25, 8000.75],
    orientation: [1, 0, 0, 0],
    speed: 123.5,
    pitchRate: 0.25,
    rollRate: -0.5,
    torus: true,
  },
  systemId: "g0-s7",
  stationKey: "coriolis-station",
};

describe("canonical v2 writer golden (captured in plan 11-01, before the v3 bump)", () => {
  it("the v2 encodeSave output equals the checked-in golden in canonical JSON", () => {
    expect(canonical(JSON.parse(encodeSave(V2_INFLIGHT_INPUTS)))).toBe(
      canonical(JSON.parse(readGolden("v2-phase10-inflight.json"))),
    );
  });

  it("the golden parses through parseSave with the allow-lists to a version 2 in-flight save", () => {
    const result = parseSave(readGolden("v2-phase10-inflight.json"), ALLOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.version).toBe(2);
    expect(result.save.mode).toBe("inFlight");
  });
});
