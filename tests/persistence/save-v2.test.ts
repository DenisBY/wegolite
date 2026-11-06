// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The v2 save contract (D-13…D-16, SAVE-01, SAVE-04, T-06-05…T-06-07).
 *
 * One table proves the migration is total and lossless; another proves the
 * classification order (`absent`/`unreadable`/`future-version`/`corrupt`) still
 * distinguishes a blob this build wrote from one it merely recognises. The
 * market and pose rules land on the same validator in Task 2.
 */

import { describe, expect, it } from "vitest";

import { CLOCK_START } from "../../src/sim/flight/state.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import {
  SaveV1Schema,
  SaveV2Schema,
  migrateV1ToV2,
  parseSave,
} from "../../src/persistence/save.js";
import type { SaveAllowLists, SaveV1, SaveV2 } from "../../src/persistence/save.js";

/** The 17 commodity keys a market snapshot may carry (Alien Items included). */
export const MARKET_GOODS: readonly string[] = [
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

export const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_CARGO_BAY", "EQ_DOCK_COMP"]),
  systems: new Set(["g0-s7", "g0-s1"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map([
    ["food", "t"],
    ["gold", "kg"],
    ["gem_stones", "g"],
  ]),
  marketGoods: new Set(MARKET_GOODS),
};

export const SEED = 0x12345678;

function raw(value: unknown): string {
  return JSON.stringify(value);
}

export function validV1(overrides: Record<string, unknown> = {}): SaveV1 {
  return {
    version: 1,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    ...overrides,
  };
}

export function validV2(overrides: Record<string, unknown> = {}): SaveV2 {
  return {
    version: 2,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    marketSeed: SEED,
    ...overrides,
  } as SaveV2;
}

describe("v1 → v2 migration", () => {
  it("maps every v1 field to a v2 docked object with no market and no pose", () => {
    const v1 = validV1({
      equipment: ["EQ_DOCK_COMP"],
      cargo: [
        { key: "food", quantity: 2 },
        { key: "gold", quantity: 499 },
      ],
      fuel: 40,
      missiles: 1,
      passengerBerths: 1,
      marketSeed: SEED,
    });
    const v2 = migrateV1ToV2(v1);

    expect(v2.version).toBe(2);
    expect(v2.mode).toBe("docked");
    expect(v2.clockSeconds).toBe(v1.clockSeconds);
    expect(v2.credits).toBe(v1.credits);
    expect(v2.equipment).toEqual(v1.equipment);
    expect(v2.cargo).toEqual(v1.cargo);
    expect(v2.fuel).toBe(v1.fuel);
    expect(v2.missiles).toBe(v1.missiles);
    expect(v2.passengerBerths).toBe(v1.passengerBerths);
    expect(v2.system).toEqual(v1.system);
    expect(v2.station).toEqual(v1.station);
    expect(v2.marketSeed).toBe(SEED);
    expect(v2.market).toBeUndefined();
    expect(v2.flight).toBeUndefined();
  });

  it("derives the seed when the v1 blob carried none", () => {
    const v2 = migrateV1ToV2(validV1());
    expect(v2.marketSeed).toBe(marketSeedForSystem("g0-s7"));
  });

  it("is pure: it neither mutates its input nor performs I/O", () => {
    const v1 = validV1({ marketSeed: SEED });
    const before = JSON.parse(raw(v1)) as unknown;
    const first = migrateV1ToV2(v1);
    const second = migrateV1ToV2(v1);
    expect(v1).toEqual(before);
    expect(second).toEqual(first);
    expect(JSON.parse(raw(v1))).toEqual(before);
  });

  it("the historical schema accepts exactly version 1, and v2 exactly 2", () => {
    expect(SaveV1Schema.safeParse(validV1()).success).toBe(true);
    expect(SaveV1Schema.safeParse(validV2()).success).toBe(false);
    expect(SaveV2Schema.safeParse(validV2()).success).toBe(true);
  });

  it("parseSave returns the migrated v2 object for a v1 blob", () => {
    const v1 = validV1({ marketSeed: SEED });
    const result = parseSave(raw(v1), ALLOW);
    expect(result).toEqual({ ok: true, save: migrateV1ToV2(v1) });
  });
});

describe("v2 accept path", () => {
  it("accepts a minimal docked v2 object carrying one seed", () => {
    const save = validV2();
    expect(parseSave(raw(save), ALLOW)).toEqual({ ok: true, save });
  });

  it("accepts the same object with a v1-style equipment/cargo tuple", () => {
    const save = validV2({
      equipment: ["EQ_DOCK_COMP"],
      cargo: [{ key: "food", quantity: 2 }],
      fuel: 10,
      missiles: 0,
      passengerBerths: 0,
    });
    expect(parseSave(raw(save), ALLOW)).toEqual({ ok: true, save });
  });
});

describe("v2 classification", () => {
  const rows: ReadonlyArray<{
    readonly name: string;
    readonly blob: string;
    readonly reason: "corrupt" | "future-version" | "unreadable";
  }> = [
    {
      name: "a version-3 object is future-version",
      blob: raw(validV2({ version: 3 })),
      reason: "future-version",
    },
    {
      name: "a version-1 object that fails the v1 schema is corrupt",
      blob: raw(validV1({ credits: -1 })),
      reason: "corrupt",
    },
    {
      name: "a v2 object with an unknown top-level key is corrupt",
      blob: raw(validV2({ futureBuild: "leave this alone" })),
      reason: "corrupt",
    },
    {
      name: "a JSON scalar is unreadable",
      blob: '"hello"',
      reason: "unreadable",
    },
    {
      name: "a version-less object is unreadable",
      blob: raw({ mode: "docked" }),
      reason: "unreadable",
    },
    {
      name: "a numeric version 0 is corrupt",
      blob: raw(validV2({ version: 0 })),
      reason: "corrupt",
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(() => parseSave(row.blob, ALLOW)).not.toThrow();
      expect(parseSave(row.blob, ALLOW)).toEqual({
        ok: false,
        reason: row.reason,
      });
    });
  }

  it("never throws on a hostile blob", () => {
    for (const blob of ["{", "null", "[]", "42", '{"version":2']) {
      expect(() => parseSave(blob, ALLOW)).not.toThrow();
    }
  });
});
