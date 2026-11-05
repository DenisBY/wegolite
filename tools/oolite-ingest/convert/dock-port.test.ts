// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The dock-port emitter pinned against the vendored snapshot (DOCK-01,
 * T-04-02, T-04-33, T-04-34).
 *
 * The numbers are measured, not authored: the aperture is the dock subentity's
 * bbox (`DockEntity.m:1044-1045`) and the corridor is the halved x1.25
 * expansion (`:636-654`). The degenerate cases prove the emitter fails as a
 * named `SCHEMA` error instead of looping: a zero-width aperture would make
 * `value * 1.25` never exceed `value`, and the loop additionally refuses a
 * subnormal start that cannot make progress.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { ParsedMesh, Vec3 } from "./dat.js";
import { parseDat } from "./dat.js";
import { MODEL_SOURCE_FILES } from "./glb.js";
import {
  DOCK_PORT_PATH,
  corridorHalfExtents,
  emitDockPort,
} from "./dock-port.js";
import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { DockPortSchema } from "../../../src/content/schemas/dock-port.js";

const DOCK_MODEL = "oolite_coriolis_dock.dat";
const HULL_MODEL = "oolite_coriolis.dat";
const SHIP_MODEL = "oolite_cobra3.dat";

/** Every pinned model, parsed once from the vendored snapshot. */
function loadMeshes(): Record<string, ParsedMesh> {
  const names = new Set<string>();
  for (const files of Object.values(MODEL_SOURCE_FILES)) {
    for (const file of files) names.add(file);
  }
  const meshes: Record<string, ParsedMesh> = {};
  for (const name of [...names].sort()) {
    const file = `third_party/oolite/Models/${name}`;
    const source = readFileSync(
      new URL(`../../../${file}`, import.meta.url),
      "utf8",
    );
    meshes[name] = parseDat(source, file);
  }
  return meshes;
}

function meshOf(vertices: readonly Vec3[]): ParsedMesh {
  return {
    nverts: vertices.length,
    nfaces: 0,
    vertices: [...vertices],
    faces: [],
    materials: [],
    normals: null,
    names: null,
    caseSensitiveNames: false,
    warnings: [],
  };
}

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a ContentError, but no error was thrown");
}

interface BoxJson {
  readonly halfX: number;
  readonly halfY: number;
  readonly zMin: number;
  readonly zMax: number;
}

interface EmittedDockPortJson {
  readonly version: number;
  readonly source: string;
  readonly port: { width: number; height: number; depth: number };
  readonly corridor: { ww: number; hh: number };
  readonly hull: BoxJson;
  readonly contact: BoxJson;
  readonly ship: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

const meshes = loadMeshes();

const GOLDEN_PATH = "../../../tests/golden/content/dock-port.json";
const GENERATED_PATH = "../../../src/content/generated/dock-port.json";

function emittedJson(): EmittedDockPortJson {
  return JSON.parse(
    Buffer.from(emitDockPort(meshes).bytes).toString("utf8"),
  ) as EmittedDockPortJson;
}

function candidateCopy(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(emittedJson())) as Record<string, unknown>;
}

function objectAt(
  candidate: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = candidate[key];
  if (typeof value !== "object" || value === null) {
    throw new Error(`the emitted record has no ${key} object`);
  }
  return value as Record<string, unknown>;
}

describe("emitDockPort", () => {
  it("emits at the repository-relative generated path", () => {
    const emitted = emitDockPort(meshes);
    expect(emitted.path).toBe(DOCK_PORT_PATH);
    expect(emitted.path).toBe("src/content/generated/dock-port.json");
  });

  it("measures the aperture from the dock subentity, not the hull", () => {
    const emitted = emitDockPort(meshes);
    const record = JSON.parse(
      Buffer.from(emitted.bytes).toString("utf8"),
    ) as EmittedDockPortJson;

    expect(record.version).toBe(1);
    expect(record.source).toBe("third_party/oolite");
    expect(record.port.width).toBeCloseTo(103.4123, 4);
    expect(record.port.height).toBeCloseTo(241.888, 4);
    expect(record.port.depth).toBeCloseTo(250, 4);
    // The hull is 1000 x 1000 x 995.918; a hull-derived aperture would not be
    // the visible slot at all.
    expect(record.port.width).not.toBeCloseTo(1_000, 1);
  });

  it("halves the corridor extents for the committed Cobra", () => {
    const emitted = emitDockPort(meshes);
    const record = JSON.parse(
      Buffer.from(emitted.bytes).toString("utf8"),
    ) as EmittedDockPortJson;

    expect(record.corridor.ww).toBeCloseTo(51.70615, 4);
    expect(record.corridor.hh).toBeCloseTo(120.944, 4);
  });

  it("is byte-identical across two runs", () => {
    const first = emitDockPort(meshes);
    const second = emitDockPort(meshes);
    expect(second.bytes).toEqual(first.bytes);
    expect(second.path).toBe(first.path);
  });

  it("rejects a zero-width dock bounding box as SCHEMA", () => {
    const synthetic: Record<string, ParsedMesh> = {
      ...meshes,
      [DOCK_MODEL]: meshOf([
        { x: 0, y: -120.944, z: -250 },
        { x: 0, y: 120.944, z: 0 },
      ]),
    };
    const error = capture(() => emitDockPort(synthetic));
    expect(error.code).toBe("SCHEMA");
    // The expansion loop refuses a zero aperture before the schema sees it:
    // `0 * 1.25` can never exceed `0`, so this is the T-04-02 hang turned into
    // a named failure.
    expect(error.construct).toMatch(/corridor|port/);
    expect(error.excerpt).toContain("no progress");
  });

  it("rejects a missing model as SCHEMA", () => {
    const synthetic: Record<string, ParsedMesh> = { ...meshes };
    delete synthetic[SHIP_MODEL];
    const error = capture(() => emitDockPort(synthetic));
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain(SHIP_MODEL);
  });
});

describe("dock-port golden and collision boxes", () => {
  it("equals the committed golden and generated bytes exactly", () => {
    const emitted = emitDockPort(meshes);
    const golden = readFileSync(new URL(GOLDEN_PATH, import.meta.url));
    const generated = readFileSync(new URL(GENERATED_PATH, import.meta.url));
    // The golden is a copy of the emitter's canonical output, not a rounded
    // transcription, so this is byte equality — not a tolerance compare.
    expect(emitted.bytes).toEqual(golden);
    expect(emitted.bytes).toEqual(generated);
  });

  it("emits hull, contact proxy and Cobra boxes in the station-local frame", () => {
    const record = emittedJson();

    expect(record.hull.halfX).toBeCloseTo(500, 6);
    expect(record.hull.halfY).toBeCloseTo(500, 6);
    expect(record.hull.zMin).toBeCloseTo(-495.918, 4);
    expect(record.hull.zMax).toBeCloseTo(500, 4);

    // T-04-35: the faceplate protrudes to station-local z -534.298, so a
    // hull-only proxy would leave visible contact outside the collision surface.
    expect(record.contact.zMin).toBeLessThanOrEqual(-534.2979);
    expect(record.contact.zMin).toBeLessThanOrEqual(record.hull.zMin);
    expect(record.contact.zMax).toBeCloseTo(500, 4);
    expect(record.contact.halfX).toBeCloseTo(500, 6);
    expect(record.contact.halfY).toBeCloseTo(500, 6);

    // The Cobra bbox is the `converted` block of ship-bounds.json: nose at -Z.
    expect(record.ship.min[0]).toBeCloseTo(-65, 4);
    expect(record.ship.max[0]).toBeCloseTo(65, 4);
    expect(record.ship.min[2]).toBeCloseTo(-43.4655, 4);
    expect(record.ship.max[2]).toBeCloseTo(37.9071, 4);
  });

  it("keeps the contact box station-local (no port-frame literal)", () => {
    const text = readFileSync(new URL(GENERATED_PATH, import.meta.url), "utf8");
    expect(text).not.toContain("1000.25");
    expect(text).not.toContain("34.04");
  });

  it("rejects an empty hull mesh as SCHEMA", () => {
    const synthetic: Record<string, ParsedMesh> = {
      ...meshes,
      [HULL_MODEL]: meshOf([]),
    };
    const error = capture(() => emitDockPort(synthetic));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toContain("hull");
  });

  it("rejects a reversed ship box", () => {
    const candidate = candidateCopy();
    objectAt(candidate, "ship").min = [65, -13.9688, -43.4655];
    objectAt(candidate, "ship").max = [-65, 20.9961, 37.9071];
    expect(DockPortSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a degenerate box with zero span on y", () => {
    const candidate = candidateCopy();
    objectAt(candidate, "contact").halfY = 0;
    expect(DockPortSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a contact proxy that does not grow past the hull", () => {
    const candidate = candidateCopy();
    objectAt(candidate, "contact").zMin = -400;
    expect(DockPortSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("corridorHalfExtents", () => {
  it("expands the paired axis until the ship fits within 90 %", () => {
    // Port is tall (10 x 100) and the ship is wide (50 x 10): rotations
    // disagree, so the ship's 10 y extent pairs with the 10 x aperture (one
    // expansion step to 12.5, halved to 6.25) and the 50 x extent pairs with
    // the 100 y aperture (no expansion, halved to 50).
    expect(corridorHalfExtents(10, 100, 50, 10)).toEqual({
      ww: 6.25,
      hh: 50,
    });
  });

  it("applies no expansion when both extents already fit", () => {
    expect(corridorHalfExtents(103.4123, 241.888, 130, 34.9649)).toEqual({
      ww: 51.70615,
      hh: 120.944,
    });
  });

  it("refuses a subnormal aperture that cannot make progress", () => {
    const error = capture(() => corridorHalfExtents(Number.MIN_VALUE, 1, 1, 1));
    expect(error.code).toBe("SCHEMA");
    expect(error.excerpt).toContain("no progress");
  });
});
