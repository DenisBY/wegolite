// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The single world -> render path (WORLD-02, T-3-03).
 *
 * This structural assertion lives here, not in plan 04, because plan 07 is the
 * wave-3 writer of `sync.ts`: plan 03 rewrites the file in the same wave, so a
 * source read there could see a half-written module. The numeric precision
 * proof is `tests/sim/precision.test.ts`; this file pins the shape that makes it
 * true — one `cameraRelative()` call site, a camera fixed at the origin, the
 * exported maximum-magnitude probe, and no second transform helper.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const syncSource = readFileSync(
  new URL("../../src/render/sync.ts", import.meta.url),
  "utf8",
);

/** Drop comment-only lines so documentation cannot satisfy an assertion. */
const code = syncSource
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join("\n");

describe("sync.ts structure", () => {
  it("is the real module, not a vacuous read", () => {
    expect(syncSource.length).toBeGreaterThan(1_000);
    expect(code).toMatch(/export function applyFrame\(/);
  });

  it("has exactly one cameraRelative() call site", () => {
    const sites = code.match(/cameraRelative\(/g) ?? [];
    expect(sites).toHaveLength(1);
    expect(code).toMatch(
      /const relative = cameraRelative\(world, cameraWorld\);/,
    );
  });

  it("has exactly one placement helper and no second transform", () => {
    const helpers = code.match(/function placeRelative\(/g) ?? [];
    expect(helpers).toHaveLength(1);
    // Every body placement goes through the one helper.
    const calls = code.match(/placeRelative\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(8); // 1 definition + 7 bodies
    // Only one function definition may contain the world->render subtraction.
    const definitions = code.split(/\n(?=(?:export )?function )/);
    const transformDefinitions = definitions.filter((block) =>
      block.includes("cameraRelative("),
    );
    expect(transformDefinitions).toHaveLength(1);
    expect(transformDefinitions[0]).toMatch(/function placeRelative\(/);
    expect(code).not.toMatch(/cameraWorld\s*=\s*new THREE\./);
  });

  it("keeps the camera object at the origin", () => {
    expect(code).toMatch(/scene\.camera\.position\.set\(0, 0, 0\)/);
    // A non-zero camera position would be a second, absolute placement path.
    expect(code).not.toMatch(/camera\.position\.set\((?!0, 0, 0\))/);
    expect(code).not.toMatch(/camera\.position\.copy\(/);
    expect(code).not.toMatch(/camera\.position\.add\(/);
  });

  it("takes the cinematic/cockpit world pose as an optional camera", () => {
    expect(code).toMatch(/camera: CameraPose \| null = null/);
    expect(code).toMatch(/camera === null/);
  });

  it("exports the maximum camera-relative magnitude for the probe", () => {
    expect(code).toMatch(/export function maxRelativeMagnitude\(/);
  });
});
