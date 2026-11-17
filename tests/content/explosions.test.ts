// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy explosion settings (DATA-16, D16-22, T-16-15).
 *
 * The loader reads `generated/explosions.json` as a non-eager `?raw` chunk and
 * validates it with the strict schema. The golden
 * `tests/golden/content/explosions.json` was written by hand from the vendored
 * `explosions.plist` entry and the `OOExplosionCloudEntity.m` defaults (alpha
 * as Oolite's float32 0.85f, spread and brightness 1 because the entry omits
 * them). Nothing outside `src/content` imports the loader until plan 16-06.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadExplosionCatalogue } from "../../src/content/explosions.js";
import {
  DEFAULT_EXPLOSION_KEY,
  ExplosionCatalogueSchema,
  ExplosionRecordSchema,
  MAX_EXPLOSION_RECORDS,
} from "../../src/content/schemas/explosion.js";

const REPO_ROOT = process.cwd();
const GENERATED = "src/content/generated/explosions.json";
const GOLDEN = "tests/golden/content/explosions.json";

function readText(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf8");
}

const generated: unknown = JSON.parse(readText(GENERATED));

function firstRecord(): Record<string, unknown> {
  const record = (generated as Record<string, unknown>[])[0];
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

describe("loadExplosionCatalogue", () => {
  it("resolves the parsed generated file", async () => {
    const catalogue = await loadExplosionCatalogue();
    expect(catalogue).toEqual(generated);
  });

  it("returns the same promise on every call", () => {
    expect(loadExplosionCatalogue()).toBe(loadExplosionCatalogue());
  });

  it("is imported outside src/content by the session boot only (plan 16-06)", () => {
    // `sourceFiles` skips src/content itself; `src/sim` never imports it.
    const importers = sourceFiles("src").filter((file) =>
      /content\/explosions/.test(readText(file)),
    );
    expect(importers).toEqual(["src/app/session/start-session.ts"]);
  });
});

describe("the generated explosion settings", () => {
  it("equals the golden", () => {
    expect(generated).toEqual(JSON.parse(readText(GOLDEN)));
  });

  it("holds the one default ship explosion", () => {
    expect(generated).toEqual([
      {
        key: DEFAULT_EXPLOSION_KEY,
        alpha: Math.fround(0.85),
        colorOrder: "rgb",
        count: 25,
        duration: 1.5,
        growthRate: 1.5,
        size: 2.5,
        spread: 1,
        brightness: 1,
        texture: "oolite-particle-cloud2.png",
      },
    ]);
  });
});

describe("ExplosionRecordSchema and ExplosionCatalogueSchema", () => {
  const acceptsRecord = (record: unknown): boolean =>
    ExplosionRecordSchema.safeParse(record).success;
  const accepts = (catalogue: unknown): boolean =>
    ExplosionCatalogueSchema.safeParse(catalogue).success;
  const withField = (field: string, value: unknown): unknown => ({
    ...firstRecord(),
    [field]: value,
  });

  it("accepts the generated file", () => {
    expect(accepts(generated)).toBe(true);
  });

  it("refuses an extra field", () => {
    expect(acceptsRecord(withField("flash", true))).toBe(false);
  });

  it("refuses an alpha outside 0..1", () => {
    for (const value of [-0.01, 1.01, Number.NaN]) {
      expect(acceptsRecord(withField("alpha", value)), String(value)).toBe(
        false,
      );
    }
    expect(acceptsRecord(withField("alpha", 0))).toBe(true);
    expect(acceptsRecord(withField("alpha", 1))).toBe(true);
  });

  it("accepts exactly Oolite's colour orders", () => {
    for (const order of ["rgb", "rbg", "grb", "gbr", "brg", "bgr", "white"]) {
      expect(acceptsRecord(withField("colorOrder", order)), order).toBe(true);
    }
    for (const order of ["RGB", "rgba", "", "grey"]) {
      expect(acceptsRecord(withField("colorOrder", order)), order).toBe(false);
    }
  });

  it("refuses a count that is not an integer in 1..25", () => {
    for (const value of [0, 26, 2.5, -1, Number.POSITIVE_INFINITY]) {
      expect(acceptsRecord(withField("count", value)), String(value)).toBe(
        false,
      );
    }
    expect(acceptsRecord(withField("count", 1))).toBe(true);
  });

  it("refuses a non-finite or non-positive duration or size", () => {
    for (const field of ["duration", "size"]) {
      for (const value of [
        0,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        1e3 + 1,
      ]) {
        expect(
          acceptsRecord(withField(field, value)),
          `${field} ${value}`,
        ).toBe(false);
      }
    }
  });

  it("bounds growth rate, spread and brightness", () => {
    for (const field of ["growthRate", "spread"]) {
      expect(acceptsRecord(withField(field, -0.1)), field).toBe(false);
      expect(acceptsRecord(withField(field, 1e3 + 1)), field).toBe(false);
      expect(acceptsRecord(withField(field, 0)), field).toBe(true);
    }
    expect(acceptsRecord(withField("brightness", 0.99))).toBe(false);
    expect(acceptsRecord(withField("brightness", 1e3 + 1))).toBe(false);
  });

  it("refuses a texture outside oolite-particle-<name>.png", () => {
    for (const texture of [
      "../oolite-particle-cloud2.png",
      "textures/oolite-particle-cloud2.png",
      "oolite-particle-cloud2.webp",
      "oolite_cobra3_diffuse.png",
      "oolite-particle-.png",
      "https://example.com/oolite-particle-cloud2.png",
    ]) {
      expect(acceptsRecord(withField("texture", texture)), texture).toBe(false);
    }
  });

  it("refuses an empty list, too many records, duplicate keys and no default", () => {
    const record = firstRecord();
    expect(accepts([])).toBe(false);
    expect(accepts([record, record])).toBe(false);
    expect(accepts([{ ...record, key: "oolite-other-explosion" }])).toBe(false);
    const many = Array.from({ length: MAX_EXPLOSION_RECORDS + 1 }, (_, i) =>
      i === 0 ? record : { ...record, key: `extra-${i}` },
    );
    expect(accepts(many)).toBe(false);
    expect(accepts(many.slice(0, MAX_EXPLOSION_RECORDS))).toBe(true);
  });
});
