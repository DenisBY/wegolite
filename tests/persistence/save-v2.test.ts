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

import { describe, expect, it, vi } from "vitest";

import { CLOCK_START } from "../../src/sim/flight/state.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import {
  MAX_SAVE_CHARS,
  MAX_SAVE_POSITION_MAGNITUDE,
  SaveV1Schema,
  SaveV2Schema,
  encodeSave,
  isEncodedSaveValid,
  migrateV1ToV2,
  parseSave,
} from "../../src/persistence/save.js";
import type {
  SaveAllowLists,
  SaveFlightPose,
  SaveInputs,
  SaveV1,
  SaveV2,
} from "../../src/persistence/save.js";

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
  };
}

/** The 17 market goods in sortOrder shape, with safe prices and stock. */
function goods() {
  return MARKET_GOODS.map((key, index) => ({
    key,
    price: 10 + index,
    stock: index % 128,
  }));
}

function marketSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    systemId: "g0-s7",
    seed: SEED,
    goods: goods(),
    ...overrides,
  };
}

function flightPose(overrides: Record<string, unknown> = {}): SaveFlightPose {
  return {
    position: [1000, 2000, 3000],
    orientation: [1, 0, 0, 0],
    speed: 50,
    pitchRate: 0,
    rollRate: 0,
    torus: false,
    ...overrides,
  };
}

/** A canonical encoder input; each test overrides the field under test. */
function saveInputs(overrides: Partial<SaveInputs> = {}): SaveInputs {
  return {
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    cargo: [],
    fuel: 70,
    missiles: 3,
    passengerBerths: 0,
    mode: "docked",
    marketSeed: SEED,
    systemId: "g0-s7",
    stationKey: "coriolis-station",
    ...overrides,
  };
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

describe("the market snapshot", () => {
  it("accepts a docked save whose market matches the saved system", () => {
    const save = validV2({ market: marketSnapshot(), marketSeed: undefined });
    expect(parseSave(raw(save), ALLOW)).toEqual({
      ok: true,
      save: validV2({ market: marketSnapshot(), marketSeed: undefined }),
    });
  });

  it("accepts an in-flight save with a pose and a market", () => {
    const save = validV2({
      mode: "inFlight",
      market: marketSnapshot(),
      marketSeed: undefined,
      flight: flightPose(),
    });
    expect(parseSave(raw(save), ALLOW)).toEqual({ ok: true, save });
  });

  it("accepts an allow-listed committed target", () => {
    const save = validV2({ targetSystem: "g0-s1" });
    expect(parseSave(raw(save), ALLOW)).toEqual({ ok: true, save });
  });

  const corruptRows: ReadonlyArray<{
    readonly name: string;
    readonly save: SaveV2;
  }> = [
    {
      name: "market system id disagrees with the saved system",
      save: validV2({
        market: marketSnapshot({ systemId: "g0-s1" }),
        marketSeed: undefined,
      }),
    },
    {
      name: "an unknown market goods key",
      save: validV2({
        market: marketSnapshot({
          goods: [
            ...goods().slice(1),
            { key: "unobtainium", price: 1, stock: 1 },
          ],
        }),
        marketSeed: undefined,
      }),
    },
    {
      name: "a duplicate market goods key",
      save: validV2({
        market: marketSnapshot({
          goods: goods().map((good, index) =>
            index === 1 ? { ...good, key: "food" } : good,
          ),
        }),
        marketSeed: undefined,
      }),
    },
    {
      name: "stock 128",
      save: validV2({
        market: marketSnapshot({
          goods: goods().map((good, index) =>
            index === 0 ? { ...good, stock: 128 } : good,
          ),
        }),
        marketSeed: undefined,
      }),
    },
    {
      name: "a negative price",
      save: validV2({
        market: marketSnapshot({
          goods: goods().map((good, index) =>
            index === 0 ? { ...good, price: -1 } : good,
          ),
        }),
        marketSeed: undefined,
      }),
    },
    {
      name: "a fractional price",
      save: validV2({
        market: marketSnapshot({
          goods: goods().map((good, index) =>
            index === 0 ? { ...good, price: 1.5 } : good,
          ),
        }),
        marketSeed: undefined,
      }),
    },
    {
      name: "fewer than 17 goods",
      save: validV2({
        market: marketSnapshot({ goods: goods().slice(0, 16) }),
        marketSeed: undefined,
      }),
    },
    {
      name: "more than 17 goods",
      save: validV2({
        market: marketSnapshot({
          goods: [...goods(), { key: "food", price: 1, stock: 1 }],
        }),
        marketSeed: undefined,
      }),
    },
    {
      name: "both market and marketSeed",
      save: validV2({ market: marketSnapshot() }),
    },
    {
      name: "neither market nor marketSeed",
      save: validV2({ marketSeed: undefined }),
    },
    {
      name: "a target system outside the allow-list",
      save: validV2({ targetSystem: "g9-s1" }),
    },
  ];

  for (const row of corruptRows) {
    it(`rejects ${row.name}`, () => {
      expect(parseSave(raw(row.save), ALLOW)).toEqual({
        ok: false,
        reason: "corrupt",
      });
    });
  }
});

describe("the flight pose", () => {
  const corruptRows: ReadonlyArray<{
    readonly name: string;
    readonly save: SaveV2;
  }> = [
    {
      name: "a docked save carrying a pose",
      save: validV2({ flight: flightPose() }),
    },
    {
      name: "an in-flight save without a pose",
      save: validV2({ mode: "inFlight" }),
    },
    {
      name: "a position magnitude past 1e9 m",
      save: validV2({
        mode: "inFlight",
        flight: flightPose({ position: [1e30, 0, 0] }),
      }),
    },
    {
      name: "a non-unit-able zero orientation",
      save: validV2({
        mode: "inFlight",
        flight: flightPose({ orientation: [0, 0, 0, 0] }),
      }),
    },
    {
      name: "a speed past the torus cap",
      save: validV2({
        mode: "inFlight",
        flight: flightPose({ speed: 1_000_001 }),
      }),
    },
    {
      name: "a pitch rate past the bound",
      save: validV2({
        mode: "inFlight",
        flight: flightPose({ pitchRate: 10.5 }),
      }),
    },
    {
      name: "a non-boolean torus flag",
      save: validV2({
        mode: "inFlight",
        flight: flightPose({ torus: "yes" }),
      }),
    },
  ];

  for (const row of corruptRows) {
    it(`rejects ${row.name}`, () => {
      expect(parseSave(raw(row.save), ALLOW)).toEqual({
        ok: false,
        reason: "corrupt",
      });
    });
  }

  it("accepts a finite position at the magnitude bound", () => {
    const save = validV2({
      mode: "inFlight",
      flight: flightPose({
        position: [MAX_SAVE_POSITION_MAGNITUDE, 0, 0],
      }),
    });
    expect(parseSave(raw(save), ALLOW)).toEqual({ ok: true, save });
  });
});

describe("encodeSave v2 projections", () => {
  it("emits the market and omits marketSeed when a snapshot is supplied", () => {
    const encoded = encodeSave(
      saveInputs({
        market: marketSnapshot(),
      }),
    );
    const parsed = JSON.parse(encoded) as Record<string, unknown>;
    expect(parsed["market"]).toEqual(marketSnapshot());
    expect(parsed["marketSeed"]).toBeUndefined();
    expect(parsed["mode"]).toBe("docked");
    expect(parsed["flight"]).toBeUndefined();
  });

  it("emits marketSeed and omits market when only a seed is supplied", () => {
    const parsed = JSON.parse(encodeSave(saveInputs())) as Record<
      string,
      unknown
    >;
    expect(parsed["marketSeed"]).toBe(SEED);
    expect(parsed["market"]).toBeUndefined();
  });

  it("prefers the market snapshot when both are supplied (never two seeds)", () => {
    const parsed = JSON.parse(
      encodeSave(saveInputs({ market: marketSnapshot(), marketSeed: SEED })),
    ) as Record<string, unknown>;
    expect(parsed["market"]).toBeDefined();
    expect(parsed["marketSeed"]).toBeUndefined();
  });

  it("emits targetSystem only when present", () => {
    const withTarget = JSON.parse(
      encodeSave(saveInputs({ targetSystem: "g0-s1" })),
    ) as Record<string, unknown>;
    expect(withTarget["targetSystem"]).toBe("g0-s1");

    const withoutTarget = JSON.parse(encodeSave(saveInputs())) as Record<
      string,
      unknown
    >;
    expect(withoutTarget["targetSystem"]).toBeUndefined();
  });

  it("emits the pose only for mode inFlight and never for docked", () => {
    const docked = JSON.parse(encodeSave(saveInputs())) as Record<
      string,
      unknown
    >;
    expect(docked["flight"]).toBeUndefined();

    const inFlight = JSON.parse(
      encodeSave(
        saveInputs({
          mode: "inFlight",
          flight: flightPose(),
          market: marketSnapshot(),
        }),
      ),
    ) as Record<string, unknown>;
    expect(inFlight["mode"]).toBe("inFlight");
    expect(inFlight["flight"]).toEqual(flightPose());
  });
});

describe("the v2 size bound", () => {
  it("rejects a 65,537-character blob before JSON.parse runs", () => {
    const oversized = `${raw(validV2({ targetSystem: "g0-s1" }))}${" ".repeat(
      MAX_SAVE_CHARS,
    )}`;
    expect(oversized.length).toBeGreaterThan(MAX_SAVE_CHARS);
    const parse = vi.spyOn(JSON, "parse");
    expect(parseSave(oversized, ALLOW)).toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("recognises an oversized version-3 prefix as future-version", () => {
    const future = `${raw(validV2({ version: 3 }))}${" ".repeat(MAX_SAVE_CHARS)}`;
    expect(parseSave(future, ALLOW)).toEqual({
      ok: false,
      reason: "future-version",
    });
  });
});

describe("the writer gate (isEncodedSaveValid)", () => {
  it("accepts a canonical blob under the full allow-list, as the reader does", () => {
    const encoded = raw(validV2());
    expect(isEncodedSaveValid(encoded, ALLOW)).toBe(true);
    expect(parseSave(encoded, ALLOW).ok).toBe(true);
  });

  it("rejects a saved system the allow-list omits, as the reader does", () => {
    const encoded = raw(validV2());
    const systemsWithoutSaved: SaveAllowLists = {
      ...ALLOW,
      systems: new Set(["g0-s1"]),
    };
    expect(isEncodedSaveValid(encoded, systemsWithoutSaved)).toBe(false);
    expect(parseSave(encoded, systemsWithoutSaved)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("rejects a station key the allow-list omits, as the reader does", () => {
    const encoded = raw(validV2());
    const stationsWithoutSaved: SaveAllowLists = {
      ...ALLOW,
      stations: new Set(["other-station"]),
    };
    expect(isEncodedSaveValid(encoded, stationsWithoutSaved)).toBe(false);
    expect(parseSave(encoded, stationsWithoutSaved)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("rejects a market good the allow-list does not know, as the reader does", () => {
    const encoded = raw(
      validV2({ market: marketSnapshot(), marketSeed: undefined }),
    );
    const withoutFood: SaveAllowLists = {
      ...ALLOW,
      marketGoods: new Set(MARKET_GOODS.filter((key) => key !== "food")),
    };
    expect(isEncodedSaveValid(encoded, withoutFood)).toBe(false);
    expect(parseSave(encoded, withoutFood)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });
});
