// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The debris catalogue compiler (DATA-16, D16-07, D16-16).
 *
 * The records are compiled from the vendored catalogue and meshes, compared
 * with the research container measurements (16-RESEARCH, tolerance 0.01) and
 * with the committed generated file, so a drift in either fails.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import type { PlistValue } from "../openstep/plist-value.js";
import { parseDat } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import {
  DEBRIS_ENTRIES,
  DEBRIS_PATH,
  compileDebris,
  emitDebris,
} from "./debris.js";
import { MODEL_SOURCE_FILES, debrisGlbFile } from "./glb.js";
import { computeShipMasses } from "./ship-mass.js";
import { computeShipRadii } from "./ship-radius.js";
import { compileShips } from "./ships.js";
import type { ShipCatalogue } from "./ships.js";

const REPO = new URL("../../../", import.meta.url);
const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";

function readText(relative: string): string {
  return readFileSync(new URL(relative, REPO), "utf8");
}

function load(relative: string): PlistValue {
  return parseOpenStep(readText(relative), relative);
}

const catalogue: ShipCatalogue = compileShips(load(SHIPDATA), load(OVERRIDES));

function loadMeshes(): Record<string, ParsedMesh> {
  const names = new Set<string>();
  for (const files of Object.values(MODEL_SOURCE_FILES)) {
    for (const file of files) names.add(file);
  }
  const meshes: Record<string, ParsedMesh> = {};
  for (const name of [...names].sort()) {
    const file = `third_party/oolite/Models/${name}`;
    meshes[name] = parseDat(readText(file), file);
  }
  return meshes;
}

const meshes = loadMeshes();
const keys = DEBRIS_ENTRIES.map((entry) => entry.key);
const masses = computeShipMasses(keys, catalogue, meshes);
const radii = computeShipRadii(keys, catalogue, meshes);
const records = compileDebris(catalogue, masses, radii);

/** The research container measurements (16-RESEARCH), mass in kg, radius in m. */
const RESEARCH: Readonly<
  Record<string, { readonly mass: number; readonly radius: number }>
> = {
  barrel: { mass: 993.37, radius: 5.7986 },
  alloy: { mass: 273.44, radius: 5.1492 },
  "wreckage-component": { mass: 3979.17, radius: 17.28 },
  "more-wreckage2": { mass: 5793.83, radius: 18.66 },
  "more-wreckage3": { mass: 2678.52, radius: 19.39 },
  "more-wreckage4": { mass: 4352.72, radius: 21.19 },
  "more-wreckage5": { mass: 6317.55, radius: 22.42 },
};

function caught(run: () => unknown): ContentError {
  try {
    run();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a content error");
}

describe("debrisGlbFile", () => {
  it("maps oolite_<name>.dat and wreck<1-9>.dat to their GLB", () => {
    expect(debrisGlbFile("oolite_barrel.dat")).toBe("barrel.glb");
    expect(debrisGlbFile("oolite_alloy.dat")).toBe("alloy.glb");
    expect(debrisGlbFile("wreck1.dat")).toBe("wreck1.glb");
    expect(debrisGlbFile("wreck3.dat")).toBe("wreck3.glb");
  });

  it.each([
    "barrel.dat",
    "wreck.dat",
    "wreck10.dat",
    "wreck0.dat",
    "../wreck1.dat",
    "Wreck1.dat",
  ])("refuses %s as a SCHEMA content error", (model) => {
    expect(caught(() => debrisGlbFile(model)).code).toBe("SCHEMA");
  });
});

describe("compileDebris", () => {
  it("compiles the barrel as the pod", () => {
    const barrel = records.find((record) => record.key === "barrel");
    expect(barrel).toMatchObject({
      key: "barrel",
      role: "pod",
      model: "oolite_barrel.dat",
      glb: "models/barrel.glb",
      maxFlightRoll: 0.5,
      maxFlightPitch: 0.5,
    });
  });

  it("compiles one pod, one plate and the five wrecks in shipdata order", () => {
    expect(
      records.map((record) => [record.key, record.role, record.model]),
    ).toEqual([
      ["barrel", "pod", "oolite_barrel.dat"],
      ["alloy", "plate", "oolite_alloy.dat"],
      ["wreckage-component", "wreck", "wreck1.dat"],
      ["more-wreckage2", "wreck", "wreck2.dat"],
      ["more-wreckage3", "wreck", "wreck3.dat"],
      ["more-wreckage4", "wreck", "wreck4.dat"],
      ["more-wreckage5", "wreck", "wreck5.dat"],
    ]);
    for (const record of records) {
      const rate = record.role === "wreck" ? Math.fround(0.2) : 0.5;
      expect(record.maxFlightRoll, record.key).toBe(rate);
      expect(record.maxFlightPitch, record.key).toBe(rate);
      expect(record.glb).toBe(`models/${debrisGlbFile(record.model)}`);
    }
  });

  it("compiles no scarred plate (D16-07)", () => {
    expect(records.some((record) => record.key.includes("scarred"))).toBe(
      false,
    );
  });

  it("measures every record against the research table", () => {
    expect(Object.keys(RESEARCH)).toEqual(records.map((record) => record.key));
  });

  it("compiles one record per entry, in DEBRIS_ENTRIES order", () => {
    expect(records.map((record) => [record.key, record.role])).toEqual(
      DEBRIS_ENTRIES.map((entry) => [entry.key, entry.role]),
    );
  });

  it("matches the research measurements within 0.01", () => {
    for (const record of records) {
      const measured = RESEARCH[record.key];
      if (measured === undefined) continue;
      expect(Math.abs(record.mass - measured.mass), record.key).toBeLessThan(
        0.01,
      );
      expect(
        Math.abs(record.radius - measured.radius),
        record.key,
      ).toBeLessThan(0.01);
      expect(Math.fround(record.mass)).toBe(record.mass);
      expect(Math.fround(record.radius)).toBe(record.radius);
    }
  });

  it("fails as a SCHEMA error naming the key for a missing entry", () => {
    const without: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.filter((entry) => entry.key !== "barrel"),
    };
    const error = caught(() => compileDebris(without, masses, radii));
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("barrel");
  });

  it("fails as a SCHEMA error naming the key for a missing model", () => {
    const modelless: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.map((entry) =>
        entry.key === "barrel" ? { ...entry, model: null } : entry,
      ),
    };
    const error = caught(() => compileDebris(modelless, masses, radii));
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("barrel");
  });

  it("fails as a SCHEMA error naming the key and field for a missing mass or radius", () => {
    const massError = caught(() => compileDebris(catalogue, new Map(), radii));
    expect(massError.code).toBe("SCHEMA");
    expect(massError.message).toContain("barrel.mass");
    const radiusError = caught(() =>
      compileDebris(catalogue, masses, new Map()),
    );
    expect(radiusError.message).toContain("barrel.radius");
  });
});

describe("emitDebris", () => {
  it("writes the committed generated file", () => {
    const emitted = emitDebris(catalogue, masses, radii);
    expect(emitted.path).toBe(DEBRIS_PATH);
    expect(Buffer.from(emitted.bytes).toString("utf8")).toBe(
      readText(DEBRIS_PATH),
    );
  });
});
