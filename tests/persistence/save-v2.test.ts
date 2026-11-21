// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The market snapshot, flight pose, encode projections and writer gate of the
 * save contract (D-13…D-16, SAVE-01, SAVE-04, T-06-05…T-06-07).
 *
 * Every case here runs on a current-version blob from the shared builders
 * (`tests/helpers/save-builders.ts`): the rules were introduced with the second
 * save format, but they are the rules of the format this build reads, and an
 * older blob is `corrupt` before any of them runs (D-11; the historical
 * classification is pinned in `save-v4.test.ts`).
 *
 * One table proves the classification order
 * (`absent`/`unreadable`/`future-version`/`corrupt`) still distinguishes a blob
 * this build wrote from one it merely recognises.
 */

import { describe, expect, it, vi } from "vitest";

import { CLOCK_START } from "../../src/sim/flight/state.js";
import {
  MAX_SAVE_CHARS,
  MAX_SAVE_POSITION_MAGNITUDE,
  SAVE_VERSION,
  SaveV1Schema,
  SaveV2Schema,
  SaveV3Schema,
  encodeSave,
  isEncodedSaveValid,
  migrateV1ToV2,
  migrateV2ToV3,
  parseSave,
} from "../../src/persistence/save.js";
import type {
  SaveAllowLists,
  SaveFlightPose,
  SaveV1,
  SaveV2,
} from "../../src/persistence/save.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import {
  MARKET_GOODS,
  currentSave,
  saveAllowLists,
  saveInputs,
} from "../helpers/save-builders.js";

/** Lave and its neighbour: the committed-target and market-mismatch rows. */
const ALLOW: SaveAllowLists = saveAllowLists({
  systems: new Set(["g0-s7", "g0-s1"]),
});

const SEED = 0x12345678;

function raw(value: unknown): string {
  return JSON.stringify(value);
}

/** What the parser returns for a blob it accepts: the blob itself, parsed. */
function accepted(save: Record<string, unknown>) {
  return { ok: true, save: JSON.parse(raw(save)) as unknown };
}

function validV1(overrides: Record<string, unknown> = {}): SaveV1 {
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

function validV2(overrides: Record<string, unknown> = {}): SaveV2 {
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
    // v3 is its own strict schema: neither historical schema accepts it, and it
    // accepts neither historical object.
    const v3 = migrateV2ToV3(validV2());
    expect(SaveV3Schema.safeParse(v3).success).toBe(true);
    expect(SaveV3Schema.safeParse(validV2()).success).toBe(false);
    expect(SaveV2Schema.safeParse(v3).success).toBe(false);
  });
});

describe("the accept path", () => {
  it("accepts a minimal docked object carrying one seed", () => {
    const save = currentSave({ marketSeed: SEED });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });

  it("accepts the same object with an equipment/cargo tuple", () => {
    const save = currentSave({
      equipment: ["EQ_DOCK_COMP"],
      cargo: [{ key: "food", quantity: 2 }],
      fuel: 10,
      missiles: 0,
      passengerBerths: 0,
    });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });
});

describe("classification", () => {
  const rows: ReadonlyArray<{
    readonly name: string;
    readonly blob: string;
    readonly reason: "corrupt" | "future-version" | "unreadable";
  }> = [
    {
      name: "the next version is future-version",
      blob: raw(currentSave({ version: SAVE_VERSION + 1 })),
      reason: "future-version",
    },
    {
      name: "an object with an unknown top-level key is corrupt",
      blob: raw(currentSave({ futureBuild: "leave this alone" })),
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
      blob: raw(currentSave({ version: 0 })),
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
    for (const blob of [
      "{",
      "null",
      "[]",
      "42",
      `{"version":${String(SAVE_VERSION)}`,
    ]) {
      expect(() => parseSave(blob, ALLOW)).not.toThrow();
    }
  });
});

describe("the market snapshot", () => {
  it("accepts a docked save whose market matches the saved system", () => {
    const save = currentSave({
      market: marketSnapshot(),
      marketSeed: undefined,
    });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });

  it("accepts an in-flight save with a pose and a market", () => {
    const save = currentSave({
      mode: "inFlight",
      market: marketSnapshot(),
      marketSeed: undefined,
      flight: flightPose(),
    });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });

  it("accepts an allow-listed committed target", () => {
    const save = currentSave({ targetSystem: "g0-s1" });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });

  const corruptRows: ReadonlyArray<{
    readonly name: string;
    readonly save: Record<string, unknown>;
  }> = [
    {
      name: "market system id disagrees with the saved system",
      save: currentSave({
        market: marketSnapshot({ systemId: "g0-s1" }),
        marketSeed: undefined,
      }),
    },
    {
      name: "an unknown market goods key",
      save: currentSave({
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
      save: currentSave({
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
      save: currentSave({
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
      save: currentSave({
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
      save: currentSave({
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
      save: currentSave({
        market: marketSnapshot({ goods: goods().slice(0, 16) }),
        marketSeed: undefined,
      }),
    },
    {
      name: "more than 17 goods",
      save: currentSave({
        market: marketSnapshot({
          goods: [...goods(), { key: "food", price: 1, stock: 1 }],
        }),
        marketSeed: undefined,
      }),
    },
    {
      name: "both market and marketSeed",
      save: currentSave({ market: marketSnapshot() }),
    },
    {
      name: "neither market nor marketSeed",
      save: currentSave({ marketSeed: undefined }),
    },
    {
      name: "a target system outside the allow-list",
      save: currentSave({ targetSystem: "g9-s1" }),
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
    readonly save: Record<string, unknown>;
  }> = [
    {
      name: "a docked save carrying a pose",
      save: currentSave({ flight: flightPose() }),
    },
    {
      name: "an in-flight save without a pose",
      save: currentSave({ mode: "inFlight" }),
    },
    {
      name: "a position magnitude past 1e9 m",
      save: currentSave({
        mode: "inFlight",
        flight: flightPose({ position: [1e30, 0, 0] }),
      }),
    },
    {
      name: "a non-unit-able zero orientation",
      save: currentSave({
        mode: "inFlight",
        flight: flightPose({ orientation: [0, 0, 0, 0] }),
      }),
    },
    {
      name: "a speed past the torus cap",
      save: currentSave({
        mode: "inFlight",
        flight: flightPose({ speed: 1_000_001 }),
      }),
    },
    {
      name: "a pitch rate past the bound",
      save: currentSave({
        mode: "inFlight",
        flight: flightPose({ pitchRate: 10.5 }),
      }),
    },
    {
      name: "a non-boolean torus flag",
      save: currentSave({
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
    const save = currentSave({
      mode: "inFlight",
      flight: flightPose({
        position: [MAX_SAVE_POSITION_MAGNITUDE, 0, 0],
      }),
    });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });
});

describe("encodeSave projections", () => {
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
    const parsed = JSON.parse(
      encodeSave(saveInputs({ marketSeed: SEED })),
    ) as Record<string, unknown>;
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

describe("the size bound", () => {
  it("rejects a 65,537-character blob before JSON.parse runs", () => {
    const oversized = `${raw(currentSave({ targetSystem: "g0-s1" }))}${" ".repeat(
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

  it("recognises an oversized next-version prefix as future-version", () => {
    const future = `${raw(currentSave({ version: SAVE_VERSION + 1 }))}${" ".repeat(MAX_SAVE_CHARS)}`;
    expect(parseSave(future, ALLOW)).toEqual({
      ok: false,
      reason: "future-version",
    });
  });
});

describe("the writer gate (isEncodedSaveValid)", () => {
  it("accepts a canonical blob under the full allow-list, as the reader does", () => {
    const encoded = encodeSave(saveInputs());
    expect(isEncodedSaveValid(encoded, ALLOW)).toBe(true);
    expect(parseSave(encoded, ALLOW).ok).toBe(true);
  });

  it("rejects a saved system the allow-list omits, as the reader does", () => {
    const encoded = encodeSave(saveInputs());
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
    const encoded = encodeSave(saveInputs());
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
    const encoded = encodeSave(saveInputs({ market: marketSnapshot() }));
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
