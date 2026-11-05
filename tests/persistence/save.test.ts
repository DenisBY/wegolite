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
  boundCorruptBackup,
  encodeSave,
  parseSave,
} from "../../src/persistence/save.js";
import type { SaveAllowLists, SaveV1 } from "../../src/persistence/save.js";

const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP", "EQ_FUEL"]),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
};

function validSave(overrides: Record<string, unknown> = {}): SaveV1 {
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

function raw(value: unknown): string {
  return JSON.stringify(value);
}

describe("parseSave accept path", () => {
  it("accepts the exact blob this build writes", () => {
    const save = validSave({
      equipment: ["EQ_DOCK_COMP"],
      credits: 5000,
    });
    const result = parseSave(raw(save), ALLOW);
    expect(result).toEqual({ ok: true, save });
  });

  it("reports null as absent rather than corrupt", () => {
    expect(parseSave(null, ALLOW)).toEqual({ ok: false, reason: "absent" });
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
      raw: '{"version":1',
      reason: "unreadable",
    },
    {
      name: "version 0",
      raw: raw(validSave({ version: 0 })),
      reason: "corrupt",
    },
    {
      name: "version 2",
      raw: raw(validSave({ version: 2 })),
      reason: "future-version",
    },
    {
      name: "future version before schema validation",
      raw: raw(validSave({ version: 9, mode: "inFlight", credits: -5 })),
      reason: "future-version",
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
      name: "wrong mode",
      raw: raw(validSave({ mode: "inFlight" })),
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
    const oversized = `${raw(validSave({ version: 2 }))}${" ".repeat(MAX_SAVE_CHARS)}`;
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
    const hidden = `${" ".repeat(MAX_SAVE_CHARS)}${raw(validSave({ version: 2 }))}`;
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
    const encoded = encodeSave({
      clockSeconds: CLOCK_START + 600,
      credits: 5000,
      equipment: ["EQ_DOCK_COMP"],
      systemId: "g0-s7",
      stationKey: "coriolis-station",
    });
    const parsed = JSON.parse(encoded) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual([
      "clockSeconds",
      "credits",
      "equipment",
      "mode",
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
