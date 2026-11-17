// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy debris catalogue (DATA-16, T-16-08).
 *
 * The loader reads `generated/ships-debris.json` as a non-eager `?raw` chunk
 * and validates it with the strict schema. The golden
 * `tests/golden/content/ships-debris.json` was written from the generated file
 * after each mass and radius was checked against the research container
 * measurements (16-RESEARCH, tolerance 0.01), which this file also pins.
 * Nothing outside `src/content` imports the loader until plan 16-06.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadDebrisCatalogue } from "../../src/content/ships-debris.js";
import {
  DebrisCatalogueSchema,
  DebrisRecordSchema,
  MAX_DEBRIS_RECORDS,
} from "../../src/content/schemas/ship-debris.js";
import {
  MAX_FLIGHT_MAGNITUDE_BOUND,
  MAX_FLIGHT_RATE_BOUND,
} from "../../src/content/schemas/ship-npc.js";

const REPO_ROOT = process.cwd();
const GENERATED = "src/content/generated/ships-debris.json";
const GOLDEN = "tests/golden/content/ships-debris.json";

function readText(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf8");
}

const generated: unknown = JSON.parse(readText(GENERATED));

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

function records(): Record<string, unknown>[] {
  return generated as Record<string, unknown>[];
}

function firstRecord(): Record<string, unknown> {
  const record = records()[0];
  if (record === undefined) throw new Error("generated file has no record");
  return record;
}

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, directory), {
    withFileTypes: true,
  })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (relative === "src/content") continue;
      sourceFiles(relative, found);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

describe("loadDebrisCatalogue", () => {
  it("resolves the parsed generated file", async () => {
    const catalogue = await loadDebrisCatalogue();
    expect(catalogue).toEqual(generated);
  });

  it("returns the same promise on every call", () => {
    expect(loadDebrisCatalogue()).toBe(loadDebrisCatalogue());
  });

  it("is imported outside src/content by the session boot only (plan 16-06)", () => {
    // `sourceFiles` skips src/content itself; `src/sim` never imports it.
    const importers = sourceFiles("src").filter((file) =>
      /content\/ships-debris/.test(readText(file)),
    );
    expect(importers).toEqual(["src/app/session/start-session.ts"]);
  });
});

describe("the generated debris catalogue", () => {
  it("equals the golden", () => {
    expect(generated).toEqual(JSON.parse(readText(GOLDEN)));
  });

  it("holds the barrel as the pod", () => {
    expect(records().find((record) => record["key"] === "barrel")).toEqual({
      key: "barrel",
      role: "pod",
      model: "oolite_barrel.dat",
      glb: "models/barrel.glb",
      mass: expect.any(Number) as number,
      radius: expect.any(Number) as number,
      maxFlightRoll: 0.5,
      maxFlightPitch: 0.5,
    });
  });

  it("matches the research measurements within 0.01", () => {
    for (const [key, measured] of Object.entries(RESEARCH)) {
      const record = records().find((candidate) => candidate["key"] === key);
      expect(record, key).toBeDefined();
      expect(
        Math.abs((record?.["mass"] as number) - measured.mass),
        key,
      ).toBeLessThan(0.01);
      expect(
        Math.abs((record?.["radius"] as number) - measured.radius),
        key,
      ).toBeLessThan(0.01);
    }
  });
});

describe("DebrisRecordSchema and DebrisCatalogueSchema", () => {
  const acceptsRecord = (record: unknown): boolean =>
    DebrisRecordSchema.safeParse(record).success;
  const accepts = (catalogue: unknown): boolean =>
    DebrisCatalogueSchema.safeParse(catalogue).success;
  const withField = (field: string, value: unknown): unknown => ({
    ...firstRecord(),
    [field]: value,
  });

  it("accepts the generated file", () => {
    expect(accepts(generated)).toBe(true);
  });

  it("refuses an extra field", () => {
    expect(acceptsRecord(withField("scanClass", "CLASS_CARGO"))).toBe(false);
  });

  it("refuses a non-finite, non-positive or unbounded mass or radius", () => {
    for (const field of ["mass", "radius"]) {
      for (const value of [
        0,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        MAX_FLIGHT_MAGNITUDE_BOUND * 2,
        "993",
      ]) {
        expect(
          acceptsRecord(withField(field, value)),
          `${field}=${String(value)}`,
        ).toBe(false);
      }
    }
  });

  it("refuses a negative or unbounded tumble rate", () => {
    for (const field of ["maxFlightRoll", "maxFlightPitch"]) {
      expect(acceptsRecord(withField(field, -0.1))).toBe(false);
      expect(acceptsRecord(withField(field, MAX_FLIGHT_RATE_BOUND + 1))).toBe(
        false,
      );
      expect(acceptsRecord(withField(field, 0))).toBe(true);
    }
  });

  it("refuses a GLB path outside models/<name>.glb", () => {
    for (const glb of [
      "models/../barrel.glb",
      "/models/barrel.glb",
      "https://example.com/models/barrel.glb",
      "models/barrel.gltf",
      "textures/barrel.glb",
    ]) {
      expect(acceptsRecord(withField("glb", glb)), glb).toBe(false);
    }
  });

  it("refuses a model outside oolite_<name>.dat or wreck<n>.dat", () => {
    for (const model of [
      "barrel.dat",
      "wreck.dat",
      "wreck10.dat",
      "../oolite_barrel.dat",
      "oolite_barrel.obj",
    ]) {
      expect(acceptsRecord(withField("model", model)), model).toBe(false);
    }
    expect(acceptsRecord(withField("model", "wreck5.dat"))).toBe(true);
  });

  it("refuses a role outside pod, plate and wreck", () => {
    for (const role of ["cargopod", "alloy", "", 1]) {
      expect(acceptsRecord(withField("role", role))).toBe(false);
    }
  });

  /** A catalogue that differs from the generated one by its wreck count. */
  function withWrecks(count: number): Record<string, unknown>[] {
    const [pod, plate, wreck] = records();
    return [
      { ...pod },
      { ...plate },
      ...Array.from({ length: count }, (_, index) => ({
        ...wreck,
        key: `wreck-${String(index)}`,
      })),
    ];
  }

  it("refuses an empty list, too many records and a duplicate key", () => {
    expect(accepts([])).toBe(false);
    expect(accepts(withWrecks(MAX_DEBRIS_RECORDS - 2))).toBe(true);
    expect(accepts(withWrecks(MAX_DEBRIS_RECORDS - 1))).toBe(false);
    const [pod, plate, wreck] = records();
    expect(accepts([pod, plate, wreck, wreck])).toBe(false);
  });

  it("refuses a catalogue without exactly one pod, one plate and a wreck", () => {
    const [pod, plate, wreck] = records();
    expect(accepts([pod, plate, wreck])).toBe(true);
    // No pod, two pods.
    expect(accepts([plate, wreck])).toBe(false);
    expect(accepts([pod, { ...pod, key: "pod-2" }, plate, wreck])).toBe(false);
    // No plate, two plates.
    expect(accepts([pod, wreck])).toBe(false);
    expect(accepts([pod, plate, { ...plate, key: "plate-2" }, wreck])).toBe(
      false,
    );
    // No wreck.
    expect(accepts([pod, plate])).toBe(false);
  });
});
