// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Golden save migration proof (QUAL-04, T-07-10; Phase 11 SAVE-07, T-11-10).
 *
 * Three golden families (v1/v2/v3 inputs; the v4 goldens are pinned in
 * tests/persistence/save-v4.test.ts), each through the production reader, `parseSave`, with
 * the boot allow-lists:
 *
 * - the v1 -> v2 step: two checked-in v1 blobs (a Phase 4 shape and a Phase 5
 *   shape that uses every optional v1 field) migrate to a checked-in v2 golden
 *   in canonical JSON;
 * - the v2 -> v3 step and the v1 -> v3 chain: each v2 golden migrates to a
 *   checked-in v3 golden, and `parseSave` of the v1 blob lands on the same v3
 *   golden (the chain never skips a step, D-03);
 * - the v2 writer blob (`v2-phase10-inflight.json`), captured from the real v2
 *   `encodeSave` in plan 11-01 before the v3 bump, which migrates to
 *   `v3-from-v2-phase10-inflight.json`.
 *
 * The v2 and v3 files are REGRESSION snapshots: produced once and reviewed by
 * hand against the migration rules (v1 -> v2: seed kept, no market snapshot,
 * cargo carried, version 2; v2 -> v3, D-02: version 3, epoch 0, nextEntityId 101,
 * nothing else changed). They are never regenerated blindly. If one changes,
 * reconcile the migration first.
 *
 * The validator is not loosened for these fixtures. A golden that cannot pass
 * `parseSave` with the production allow-lists is a wrong golden.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SaveV1Schema,
  SaveV2Schema,
  SaveV3Schema,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4,
  parseSave,
} from "../../src/persistence/save.js";
import type { SaveAllowLists } from "../../src/persistence/save.js";

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
    v3: "v3-from-v1-phase4.json",
  },
  {
    label: "Phase 5 v1 blob with every optional field",
    v1: "v1-phase5.json",
    v2: "v2-from-v1-phase5.json",
    v3: "v3-from-v1-phase5.json",
  },
] as const;

describe("golden v1 save migration through the production reader", () => {
  for (const pair of PAIRS) {
    describe(pair.label, () => {
      it("step v1 -> v2: matches the checked-in v2 golden in canonical JSON", () => {
        const v1 = SaveV1Schema.parse(JSON.parse(readGolden(pair.v1)));
        expect(canonical(migrateV1ToV2(v1))).toBe(
          canonical(JSON.parse(readGolden(pair.v2))),
        );
      });

      it("step v2 -> v3: the v2 golden migrates to the checked-in v3 golden", () => {
        const v2 = SaveV2Schema.parse(JSON.parse(readGolden(pair.v2)));
        expect(migrateV2ToV3(v2)).toStrictEqual(
          JSON.parse(readGolden(pair.v3)),
        );
      });

      it("chain v1 -> v4: parseSave of the v1 blob is the v3 golden stepped to v4", () => {
        const result = parseSave(readGolden(pair.v1), ALLOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.save.version).toBe(4);
        expect(result.save).toStrictEqual(
          migrateV3ToV4(SaveV3Schema.parse(JSON.parse(readGolden(pair.v3)))),
        );
      });

      it("a v2 save loads: parseSave of the v2 golden is the v3 golden stepped to v4", () => {
        const result = parseSave(readGolden(pair.v2), ALLOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.save).toStrictEqual(
          migrateV3ToV4(SaveV3Schema.parse(JSON.parse(readGolden(pair.v3)))),
        );
      });

      it("migrates the same v1 blob twice to identical bytes", () => {
        const v1 = SaveV1Schema.parse(JSON.parse(readGolden(pair.v1)));
        expect(canonical(migrateV2ToV3(migrateV1ToV2(v1)))).toBe(
          canonical(migrateV2ToV3(migrateV1ToV2(v1))),
        );
      });

      it("re-parses the migrated v4 to an equal object (round trip)", () => {
        const result = parseSave(readGolden(pair.v1), ALLOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const reparsed = parseSave(canonical(result.save), ALLOW);
        expect(reparsed).toEqual({ ok: true, save: result.save });
      });
    });
  }
});

describe("captured v2 writer golden (plan 11-01, before the v3 bump)", () => {
  const v2Name = "v2-phase10-inflight.json";
  const v3Name = "v3-from-v2-phase10-inflight.json";

  it("step v2 -> v3: the captured v2 blob migrates to the checked-in v3 golden", () => {
    const v2 = SaveV2Schema.parse(JSON.parse(readGolden(v2Name)));
    expect(migrateV2ToV3(v2)).toStrictEqual(JSON.parse(readGolden(v3Name)));
  });

  it("a v2 in-flight save loads: parseSave of the captured blob is the v3 golden stepped to v4", () => {
    const result = parseSave(readGolden(v2Name), ALLOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.version).toBe(4);
    expect(result.save.mode).toBe("inFlight");
    expect(result.save.epoch).toBe(0);
    expect(result.save.nextEntityId).toBe(101);
    expect(result.save).toStrictEqual(
      migrateV3ToV4(SaveV3Schema.parse(JSON.parse(readGolden(v3Name)))),
    );
  });

  it("the v3 golden itself loads as a v3 save stepped to v4", () => {
    const result = parseSave(readGolden(v3Name), ALLOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save).toStrictEqual(
      migrateV3ToV4(SaveV3Schema.parse(JSON.parse(readGolden(v3Name)))),
    );
  });
});
