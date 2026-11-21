// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save parser contract (DOCK-07, T-04-24…T-04-27, T-04-49).
 *
 * The reject table is the phase's hostile-input proof: every row is a blob a
 * player, a corrupt disk or a future build could hand the app. The oversized row
 * additionally asserts that `JSON.parse` is never reached, because a size cap
 * after parsing would still allocate the attacker's string.
 */

import { describe, expect, it, vi } from "vitest";

import { CLOCK_START } from "../../src/sim/flight/state.js";
import {
  CORRUPT_BACKUP_MARKER,
  MAX_SAVE_CHARS,
  SAVE_VERSION,
  boundCorruptBackup,
  encodeSave,
  parseSave,
} from "../../src/persistence/save.js";
import {
  currentSave,
  saveAllowLists,
  saveInputs,
} from "../helpers/save-builders.js";

const ALLOW = saveAllowLists();

/** A current-version blob (the production writer's output) with overrides. */
function validSave(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return currentSave(overrides);
}

function raw(value: unknown): string {
  return JSON.stringify(value);
}

/** What the parser returns for a blob it accepts: the blob itself, parsed. */
function accepted(save: Record<string, unknown>) {
  return { ok: true, save: JSON.parse(raw(save)) as unknown };
}

describe("parseSave accept path", () => {
  it("accepts the exact current blob the writer produces", () => {
    const save = validSave({
      equipment: ["EQ_DOCK_COMP"],
      credits: 5000,
    });
    const result = parseSave(raw(save), ALLOW);
    expect(result).toEqual(accepted(save));
    if (!result.ok) return;
    expect(result.save.version).toBe(SAVE_VERSION);
    expect(result.save.epoch).toBe(0);
    expect(result.save.nextEntityId).toBe(101);
    expect(result.save.mode).toBe("docked");
    expect(result.save.market).toBeUndefined();
    expect(result.save.flight).toBeUndefined();
  });

  it("reports null as absent rather than corrupt", () => {
    expect(parseSave(null, ALLOW)).toEqual({ ok: false, reason: "absent" });
  });

  it("accepts the optional cargo, counts and seed fields", () => {
    const save = validSave({
      equipment: ["EQ_DOCK_COMP"],
      cargo: [
        { key: "food", quantity: 2 },
        { key: "gold", quantity: 499 },
      ],
      fuel: 40,
      missiles: 1,
      passengerBerths: 1,
      marketSeed: 0x12345678,
    });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });
});

describe("parseSave reject table", () => {
  const rows: ReadonlyArray<{
    readonly name: string;
    readonly raw: string;
    readonly reason: "corrupt" | "future-version" | "unreadable";
  }> = [
    {
      name: "truncated JSON",
      raw: `{"version":${String(SAVE_VERSION)}`,
      reason: "unreadable",
    },
    {
      name: "version 0",
      raw: raw(validSave({ version: 0 })),
      reason: "corrupt",
    },
    {
      name: "the next version is a future build",
      raw: raw(validSave({ version: SAVE_VERSION + 1 })),
      reason: "future-version",
    },
    {
      name: "future version before schema validation",
      raw: raw(
        validSave({
          version: SAVE_VERSION + 5,
          mode: "inFlight",
          credits: -5,
        }),
      ),
      reason: "future-version",
    },
    {
      name: "version 1, an older release",
      raw: raw(validSave({ version: 1 })),
      reason: "corrupt",
    },
    {
      name: "version 2, an older release",
      raw: raw(validSave({ version: 2 })),
      reason: "corrupt",
    },
    {
      name: "version 3, the newest retired one, with every current field",
      raw: raw(validSave({ version: 3 })),
      reason: "corrupt",
    },
    {
      name: "a negative version",
      raw: raw(validSave({ version: -1 })),
      reason: "corrupt",
    },
    {
      name: "a fractional version",
      raw: raw(validSave({ version: 1.5 })),
      reason: "corrupt",
    },
    {
      name: "clock 1e308",
      raw: raw(validSave({ clockSeconds: 1e308 })),
      reason: "corrupt",
    },
    {
      name: "clock below CLOCK_START",
      raw: raw(validSave({ clockSeconds: CLOCK_START - 1 })),
      reason: "corrupt",
    },
    {
      name: "clock null (NaN/Infinity through JSON)",
      raw: raw(validSave({ clockSeconds: null })),
      reason: "corrupt",
    },
    {
      name: "negative credits",
      raw: raw(validSave({ credits: -1 })),
      reason: "corrupt",
    },
    {
      name: "fractional credits",
      raw: raw(validSave({ credits: 1000.5 })),
      reason: "corrupt",
    },
    {
      name: "unsafe credits",
      raw: raw(validSave({ credits: Number.MAX_SAFE_INTEGER + 1 })),
      reason: "corrupt",
    },
    {
      name: "unknown equipment key",
      raw: raw(validSave({ equipment: ["EQ_UNKNOWN"] })),
      reason: "corrupt",
    },
    {
      name: "duplicate equipment key",
      raw: raw(validSave({ equipment: ["EQ_DOCK_COMP", "EQ_DOCK_COMP"] })),
      reason: "corrupt",
    },
    {
      name: "unknown system",
      raw: raw(validSave({ system: { id: "g9-s1" } })),
      reason: "corrupt",
    },
    {
      name: "unknown station",
      raw: raw(validSave({ station: { key: "dodecahedron-station" } })),
      reason: "corrupt",
    },
    {
      name: "extra top-level key",
      raw: raw(validSave({ extra: true })),
      reason: "corrupt",
    },
    {
      name: "extra nested system key",
      raw: raw(validSave({ system: { id: "g0-s7", extra: 1 } })),
      reason: "corrupt",
    },
    {
      name: "unknown mode",
      raw: raw(validSave({ mode: "paused" })),
      reason: "corrupt",
    },
    {
      name: "overlong equipment key",
      raw: raw(validSave({ equipment: ["E".repeat(65)] })),
      reason: "corrupt",
    },
    {
      name: "too many equipment keys",
      raw: raw(
        validSave({
          equipment: Array.from({ length: 65 }, (_, index) => `EQ_${index}`),
        }),
      ),
      reason: "corrupt",
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      // A hostile blob may never throw out of the parser: only a reason.
      expect(() => parseSave(row.raw, ALLOW)).not.toThrow();
      expect(parseSave(row.raw, ALLOW)).toEqual({
        ok: false,
        reason: row.reason,
      });
    });
  }

  it("treats an unknown JSON shape as unreadable, not corrupt", () => {
    // Only a JSON object with this family's numeric version can be backed up
    // and cleared; a scalar/array belongs to nobody this build can identify.
    for (const shape of ['"hello"', "42", "null", "[]", "{}", '{"other":1}']) {
      expect(parseSave(shape, ALLOW)).toEqual({
        ok: false,
        reason: "unreadable",
      });
    }
  });

  it("rejects a __proto__ key without polluting Object.prototype", () => {
    const payload = `${raw(validSave()).slice(0, -1)},"__proto__":{"polluted":true}}`;
    expect(parseSave(payload, ALLOW)).toEqual({
      ok: false,
      reason: "corrupt",
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("cargo and hold semantics", () => {
  const rows: ReadonlyArray<{
    name: string;
    save: Record<string, unknown>;
  }> = [
    {
      name: "unknown commodity key",
      save: validSave({ cargo: [{ key: "unobtainium", quantity: 1 }] }),
    },
    {
      name: "duplicate cargo key",
      save: validSave({
        cargo: [
          { key: "food", quantity: 1 },
          { key: "food", quantity: 2 },
        ],
      }),
    },
    {
      name: "zero quantity",
      save: validSave({ cargo: [{ key: "food", quantity: 0 }] }),
    },
    {
      name: "negative quantity",
      save: validSave({ cargo: [{ key: "food", quantity: -1 }] }),
    },
    {
      name: "fractional quantity",
      save: validSave({ cargo: [{ key: "food", quantity: 1.5 }] }),
    },
    {
      name: "overflow quantity",
      save: validSave({ cargo: [{ key: "food", quantity: 36_000_001 }] }),
    },
    {
      name: "eighteen cargo entries",
      save: validSave({
        cargo: Array.from({ length: 18 }, (_, index) => ({
          key: `k${index}`,
          quantity: 1,
        })),
      }),
    },
    {
      name: "over-capacity hold",
      save: validSave({ cargo: [{ key: "food", quantity: 21 }] }),
    },
    {
      name: "seven berths with no cargo bay and an empty hold",
      save: validSave({ passengerBerths: 7 }),
    },
    {
      name: "cargo as a keyed object was already a schema failure",
      save: validSave({ cargo: { food: 1 } }),
    },
    {
      name: "marketSeed above uint32",
      save: validSave({ marketSeed: 0x1_0000_0000 }),
    },
    {
      name: "EQ_FUEL is canonical-only",
      save: validSave({ equipment: ["EQ_FUEL"] }),
    },
    {
      name: "missile removal is canonical-only",
      save: validSave({ equipment: ["EQ_MISSILE_REMOVAL"] }),
    },
    {
      name: "berth removal is canonical-only",
      save: validSave({ equipment: ["EQ_PASSENGER_BERTH_REMOVAL"] }),
    },
    {
      name: "alias plus a non-zero explicit count is ambiguous",
      save: validSave({
        equipment: ["EQ_PASSENGER_BERTH"],
        passengerBerths: 1,
      }),
    },
    {
      name: "20 t plus a lone berth alias exceeds the effective 15 t",
      save: validSave({
        equipment: ["EQ_PASSENGER_BERTH"],
        cargo: [{ key: "food", quantity: 20 }],
      }),
    },
  ];

  for (const row of rows) {
    it(`rejects ${row.name}`, () => {
      expect(() => parseSave(raw(row.save), ALLOW)).not.toThrow();
      expect(parseSave(raw(row.save), ALLOW)).toEqual({
        ok: false,
        reason: "corrupt",
      });
    });
  }

  it("accepts a lone Phase 4 berth alias and folds it in as one berth", () => {
    const save = validSave({ equipment: ["EQ_PASSENGER_BERTH"] });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });

  it("rejects a lone missile alias plus a non-zero missile count", () => {
    const save = validSave({ equipment: ["EQ_MISSILE"], missiles: 2 });
    expect(parseSave(raw(save), ALLOW)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });
});

describe("exact capacity boundaries and the optional seed", () => {
  it("accepts four missiles, the Cobra's pylon count, and rejects five", () => {
    const four = validSave({ missiles: 4 });
    expect(parseSave(raw(four), ALLOW)).toEqual(accepted(four));
    expect(parseSave(raw(validSave({ missiles: 5 })), ALLOW)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("accepts a 20 t hold plus 499 kg of gold", () => {
    const save = validSave({
      cargo: [
        { key: "food", quantity: 20 },
        { key: "gold", quantity: 499 },
      ],
    });
    expect(parseSave(raw(save), ALLOW)).toEqual(accepted(save));
  });

  it("rejects a 20 t hold plus 500 kg of gold", () => {
    const save = validSave({
      cargo: [
        { key: "food", quantity: 20 },
        { key: "gold", quantity: 500 },
      ],
    });
    expect(parseSave(raw(save), ALLOW)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("accepts 25 t of Food with the cargo bay and rejects it without", () => {
    const withBay = validSave({
      equipment: ["EQ_CARGO_BAY"],
      cargo: [{ key: "food", quantity: 25 }],
    });
    expect(parseSave(raw(withBay), ALLOW)).toEqual(accepted(withBay));

    const withoutBay = validSave({ cargo: [{ key: "food", quantity: 25 }] });
    expect(parseSave(raw(withoutBay), ALLOW)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("accepts seven berths only with the cargo bay", () => {
    const withBay = validSave({
      equipment: ["EQ_CARGO_BAY"],
      passengerBerths: 7,
    });
    expect(parseSave(raw(withBay), ALLOW)).toEqual(accepted(withBay));
  });

  it("accepts the uint32 ceiling and rejects one above it", () => {
    const ceiling = validSave({ marketSeed: 0xffffffff });
    expect(parseSave(raw(ceiling), ALLOW)).toEqual(accepted(ceiling));

    const above = validSave({ marketSeed: 0x1_0000_0000 });
    expect(parseSave(raw(above), ALLOW)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });
});

describe("parseSave resource bound", () => {
  it("rejects an oversized non-save blob before JSON.parse runs", () => {
    // Padding is valid JSON whitespace, so the blob is syntactically a save; it
    // is rejected by the length cap without ever allocating a parse.
    const oversized = `${" ".repeat(MAX_SAVE_CHARS + 1)}${raw(validSave())}`;
    expect(oversized.length).toBeGreaterThan(MAX_SAVE_CHARS);

    const parse = vi.spyOn(JSON, "parse");
    const result = parseSave(oversized, ALLOW);
    expect(result).toEqual({ ok: false, reason: "unreadable" });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("recognises an oversized future-version blob without parsing it", () => {
    // CR-02: the version sniff runs on a bounded prefix *before* the blob is
    // classified, so a newer build's oversized save is untouchable, not
    // corrupt.
    const oversized = `${raw(validSave({ version: SAVE_VERSION + 1 }))}${" ".repeat(MAX_SAVE_CHARS)}`;
    expect(oversized.length).toBeGreaterThan(MAX_SAVE_CHARS);

    const parse = vi.spyOn(JSON, "parse");
    expect(parseSave(oversized, ALLOW)).toEqual({
      ok: false,
      reason: "future-version",
    });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("does not let a version marker beyond the sniff window defeat the bound", () => {
    // A hostile oversized blob cannot force a full parse by hiding the marker:
    // without a recognised prefix it is simply unreadable (still untouchable).
    const hidden = `${" ".repeat(MAX_SAVE_CHARS)}${raw(validSave({ version: SAVE_VERSION + 1 }))}`;
    expect(hidden.length).toBeGreaterThan(MAX_SAVE_CHARS);
    const parse = vi.spyOn(JSON, "parse");
    expect(parseSave(hidden, ALLOW)).toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });
});

describe("boundCorruptBackup", () => {
  it("keeps a short blob verbatim", () => {
    expect(boundCorruptBackup("not-json{{{")).toBe("not-json{{{");
  });

  it("truncates an oversized blob and records its original length", () => {
    const oversized = "x".repeat(MAX_SAVE_CHARS * 16);
    const backup = boundCorruptBackup(oversized);

    expect(backup.length).toBeLessThanOrEqual(MAX_SAVE_CHARS);
    expect(
      backup.startsWith(`${CORRUPT_BACKUP_MARKER}:${oversized.length}:`),
    ).toBe(true);
  });
});

describe("encodeSave", () => {
  it("writes exactly the documented key set and no pose or timestamp", () => {
    const encoded = encodeSave(
      saveInputs({
        clockSeconds: CLOCK_START + 600,
        credits: 5000,
        equipment: ["EQ_DOCK_COMP"],
        cargo: [{ key: "food", quantity: 2 }],
        missiles: 3,
        marketSeed: 0x12345678,
      }),
    );
    const parsed = JSON.parse(encoded) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual([
      "cargo",
      "clockSeconds",
      "credits",
      "epoch",
      "equipment",
      "fuel",
      "laserMounts",
      "marketSeed",
      "missiles",
      "mode",
      "nextEntityId",
      "passengerBerths",
      "station",
      "system",
      "version",
    ]);
    expect(Object.keys(parsed["system"] as object)).toEqual(["id"]);
    expect(Object.keys(parsed["station"] as object)).toEqual(["key"]);
    expect(encoded).not.toMatch(
      /position|orientation|quaternion|timestamp|createdAt|host/iu,
    );
  });
});

describe("the shared builders", () => {
  it("currentSave is the parsed output of the production writer and parses ok", () => {
    expect(currentSave()).toEqual(JSON.parse(encodeSave(saveInputs())));
    const result = parseSave(raw(currentSave()), saveAllowLists());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.save.version).toBe(SAVE_VERSION);
  });

  it("an override whose value is undefined removes the key from the blob", () => {
    const blob = JSON.parse(
      raw(currentSave({ marketSeed: undefined })),
    ) as Record<string, unknown>;
    expect("marketSeed" in blob).toBe(false);
  });
});
