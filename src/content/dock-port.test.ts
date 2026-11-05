// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The committed dock-port asset and its loader (DOCK-01, T-04-02, T-04-33,
 * T-04-34).
 *
 * The aperture is measured at build time from `oolite_coriolis_dock.dat`, so
 * these assertions pin the measured result rather than restating a literal that
 * sim code could have invented: 103.4123 x 241.888 x 250, with the halved
 * corridor extents 51.70615 and 120.944 for the committed Cobra. The manifest
 * row is asserted by exact path because a bare filename would emit outside
 * `src/content/generated/` where neither the loader nor `assets:check` can see
 * it. The reject cases prove degenerate geometry cannot enter the record at all:
 * a zero/subnormal aperture is the input that would hang the x1.25 expansion
 * loop if the schema ever let it through.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DockPortSchema } from "./schemas/dock-port.js";
import { loadDockPort } from "./dock-port.js";

/** The aperture/corridor pin tolerance used by every measured assertion. */
const TOLERANCE = 1e-4;

/** Assert a measured value to 1e-4, as the plan's acceptance criteria state. */
function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOLERANCE);
}

interface ManifestRow {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface ManifestFixture {
  readonly files: readonly ManifestRow[];
}

const GENERATED_URL = new URL("./generated/dock-port.json", import.meta.url);

const generatedText = readFileSync(GENERATED_URL, "utf8");
const generated: unknown = JSON.parse(generatedText) as unknown;

const manifest = JSON.parse(
  readFileSync(new URL("./generated/manifest.json", import.meta.url), "utf8"),
) as ManifestFixture;

/** A mutable copy of the committed record, for the reject table. */
function candidateCopy(): Record<string, unknown> {
  return JSON.parse(generatedText) as Record<string, unknown>;
}

function portOf(candidate: Record<string, unknown>): Record<string, unknown> {
  const port = candidate.port;
  if (typeof port !== "object" || port === null) {
    throw new Error("the committed dock-port record has no port object");
  }
  return port as Record<string, unknown>;
}

function corridorOf(
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  const corridor = candidate.corridor;
  if (typeof corridor !== "object" || corridor === null) {
    throw new Error("the committed dock-port record has no corridor object");
  }
  return corridor as Record<string, unknown>;
}

describe("committed dock-port geometry", () => {
  it("pins the measured aperture extents", () => {
    const result = DockPortSchema.safeParse(generated);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.version).toBe(1);
    expect(result.data.source).toBe("third_party/oolite");
    expectClose(result.data.port.width, 103.4123);
    expectClose(result.data.port.height, 241.888);
    expectClose(result.data.port.depth, 250);
    expect(result.data.port.width).toBeGreaterThan(0);
    expect(result.data.port.height).toBeGreaterThan(0);
    expect(result.data.port.depth).toBeGreaterThan(0);
  });

  it("pins the halved corridor half-extents for the committed Cobra", () => {
    const result = DockPortSchema.safeParse(generated);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // The slot is tall (103.4123 < 241.888) and the Cobra is wide
    // (130 > 34.9649), so no expansion step fires and both halves are exact.
    expectClose(result.data.corridor.ww, 51.70615);
    expectClose(result.data.corridor.hh, 120.944);
  });

  it("is recorded in the manifest by its repository-relative path", () => {
    const row = manifest.files.find(
      (file) => file.path === "src/content/generated/dock-port.json",
    );
    expect(row).toBeDefined();
    expect(row?.bytes).toBe(Buffer.byteLength(generatedText));
  });

  it("loads through the typed loader with the same numbers", async () => {
    const loaded = await loadDockPort();
    expectClose(loaded.port.width, 103.4123);
    expectClose(loaded.port.height, 241.888);
    expectClose(loaded.port.depth, 250);
    expectClose(loaded.corridor.ww, 51.70615);
    expectClose(loaded.corridor.hh, 120.944);
  });
});

describe("DockPortSchema rejects non-positive and non-finite dimensions", () => {
  const rejected: readonly (readonly [string, number])[] = [
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["subnormal", Number.MIN_VALUE],
    ["MAX_VALUE", Number.MAX_VALUE],
  ];

  for (const [label, value] of rejected) {
    it(`rejects a ${label} port width`, () => {
      const candidate = candidateCopy();
      portOf(candidate).width = value;
      expect(DockPortSchema.safeParse(candidate).success).toBe(false);
    });
  }

  for (const [label, value] of rejected.slice(0, 5)) {
    it(`rejects a ${label} corridor half-extent`, () => {
      const candidate = candidateCopy();
      corridorOf(candidate).ww = value;
      expect(DockPortSchema.safeParse(candidate).success).toBe(false);
    });
  }

  it("rejects a corridor wider than its port dimension", () => {
    const candidate = candidateCopy();
    corridorOf(candidate).hh = 1_000;
    expect(DockPortSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a missing field", () => {
    const candidate = candidateCopy();
    delete candidate.port;
    expect(DockPortSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects an extra key", () => {
    const candidate = candidateCopy();
    candidate.extra = true;
    expect(DockPortSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a non-literal version", () => {
    const candidate = candidateCopy();
    candidate.version = 2;
    expect(DockPortSchema.safeParse(candidate).success).toBe(false);
  });
});
