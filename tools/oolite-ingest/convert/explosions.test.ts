// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The explosion settings compiler (DATA-16, D16-22).
 *
 * The default ship explosion is compiled from the vendored plist, with
 * Oolite's defaults for absent keys (`OOExplosionCloudEntity.m:34-38, 70-88`)
 * checked on hand-written entries, and compared with the committed generated
 * file so a drift in either fails.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import {
  EXPLOSIONS_PATH,
  EXPLOSIONS_SOURCE_FILE,
  EXPLOSION_KEYS,
  compileExplosions,
  emitExplosions,
} from "./explosions.js";
import { PARTICLE_TEXTURES } from "./textures.js";

const REPO = new URL("../../../", import.meta.url);

function readText(relative: string): string {
  return readFileSync(new URL(relative, REPO), "utf8");
}

const vendored = parseOpenStep(
  readText(EXPLOSIONS_SOURCE_FILE),
  EXPLOSIONS_SOURCE_FILE,
);

/** A plist holding only the default key with the given body. */
function withDefault(body: string): ReturnType<typeof parseOpenStep> {
  return parseOpenStep(
    `{ "oolite-default-ship-explosion" = { ${body} }; }`,
    "test.plist",
  );
}

function caught(run: () => unknown): ContentError {
  try {
    run();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a content error");
}

describe("compileExplosions", () => {
  it("compiles exactly the default ship explosion from the vendored plist", () => {
    expect(EXPLOSION_KEYS).toEqual(["oolite-default-ship-explosion"]);
    expect(compileExplosions(vendored)).toEqual([
      {
        key: "oolite-default-ship-explosion",
        alpha: Math.fround(0.85),
        colorOrder: "rgb",
        count: 25,
        duration: 1.5,
        growthRate: 1.5,
        size: 2.5,
        // Absent from the entry: OOExplosionCloudEntity.m:81-86 defaults.
        spread: 1,
        brightness: 1,
        texture: "oolite-particle-cloud2.png",
      },
    ]);
  });

  it("takes Oolite's default for every absent key", () => {
    expect(compileExplosions(withDefault(""))).toEqual([
      {
        key: "oolite-default-ship-explosion",
        alpha: Math.fround(0.85),
        colorOrder: "rgb",
        count: 25,
        // kExplosionCloudDuration, read with oo_doubleForKey.
        duration: 0.9,
        growthRate: 1.5,
        size: 2.5,
        spread: 1,
        brightness: 1,
        texture: "oolite-particle-cloud2.png",
      },
    ]);
  });

  it("stores the float keys as float32 and keeps the authored duration", () => {
    const [record] = compileExplosions(
      withDefault(
        "alpha = 0.3; growth_rate = 0.6; size = 1.1; spread = 0.3; brightness = 2.2; duration = 0.1;",
      ),
    );
    expect(record).toMatchObject({
      alpha: Math.fround(0.3),
      growthRate: Math.fround(0.6),
      size: Math.fround(1.1),
      spread: Math.fround(0.3),
      brightness: Math.fround(2.2),
      duration: 0.1,
    });
  });

  it("raises a brightness below 1 to 1 (OOExplosionCloudEntity.m:82-83)", () => {
    const [record] = compileExplosions(withDefault("brightness = 0.25;"));
    expect(record?.brightness).toBe(1);
  });

  it("only ever names a shipped particle texture", () => {
    for (const record of compileExplosions(vendored)) {
      expect(PARTICLE_TEXTURES).toContain(record.texture);
    }
    const error = caught(() =>
      compileExplosions(withDefault('texture = "oolite-particle-flash2.png";')),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("oolite-default-ship-explosion.texture");
  });

  it("fails as a SCHEMA error naming a missing entry", () => {
    const error = caught(() =>
      compileExplosions(parseOpenStep("{ }", "empty.plist")),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("oolite-default-ship-explosion");
  });

  it.each([
    ["alpha = 1.5;", "alpha"],
    ['color_order = "rgba";', "color_order"],
    ["count = 26;", "count"],
    ["count = 0;", "count"],
    ["count = 2.5;", "count"],
    ["duration = 0;", "duration"],
    ["size = -1;", "size"],
    ['texture = "../oolite-particle-cloud2.png";', "texture"],
    ['alpha = "high";', "alpha"],
    ["texture = 3;", "texture"],
  ])("fails %s as a SCHEMA error naming the key and field", (body, field) => {
    const error = caught(() => compileExplosions(withDefault(body)));
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain(`oolite-default-ship-explosion.${field}`);
  });

  it("fails when an entry is not a dictionary", () => {
    const error = caught(() =>
      compileExplosions(
        parseOpenStep(
          '{ "oolite-default-ship-explosion" = "cloud"; }',
          "test.plist",
        ),
      ),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("oolite-default-ship-explosion");
  });
});

describe("emitExplosions", () => {
  it("writes the committed generated file", () => {
    const emitted = emitExplosions(vendored);
    expect(emitted.path).toBe(EXPLOSIONS_PATH);
    expect(Buffer.from(emitted.bytes).toString("utf8")).toBe(
      readText(EXPLOSIONS_PATH),
    );
  });

  it("compiles none of the entries nothing draws (D16-22)", () => {
    const text = readText(EXPLOSIONS_PATH);
    expect(text).not.toMatch(/oolite-wreckage-|oolite-fragment-|hull-spark/);
  });
});
