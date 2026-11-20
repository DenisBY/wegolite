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

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { applyBuoyState } from "../../src/render/sync.js";
import type { BuoyViewState, BuoyViewStates } from "../../src/render/sync.js";
import type { SystemScene } from "../../src/render/system-scene.js";
import { add, sub, vec } from "../../src/sim/math.js";
import { laveFixture } from "../helpers/lave.js";

const { layout } = laveFixture();

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

/** A buoy body double: its root and the subentity visibility it was given. */
function bodyDouble(root: THREE.Group) {
  const calls: boolean[] = [];
  return {
    root,
    calls,
    setSubentityVisible(visible: boolean): void {
      calls.push(visible);
    },
  };
}

/** The part of a scene `applyBuoyState` touches. */
function buoyScene() {
  const navBuoy = new THREE.Group();
  const witchpoint = new THREE.Group();
  // The scene lists the nav buoy first; the lookup must not rely on the order.
  const witchpointBody = bodyDouble(witchpoint);
  const navBody = bodyDouble(navBuoy);
  const scene = {
    navBuoy,
    witchpoint,
    buoys: [witchpointBody, navBody],
  } as unknown as SystemScene;
  return { scene, navBuoy, witchpoint, navBody, witchpointBody };
}

function buoyStates(
  overrides: Partial<Record<"witchpoint" | "navBuoy", Partial<BuoyViewState>>>,
): BuoyViewStates {
  const base = (key: "witchpoint" | "navBuoy"): BuoyViewState => ({
    position: layout[key].position,
    destroyed: false,
    subentityAttached: true,
    ...overrides[key],
  });
  return { witchpoint: base("witchpoint"), navBuoy: base("navBuoy") };
}

describe("applyBuoyState (plan 18-08, D-05, PD-01, PD-02)", () => {
  const cameraWorld = vec(1_000, -2_000, 3_000);

  it("draws live, unmoved, whole buoys at their layout positions, camera-relative", () => {
    const { scene, navBuoy, witchpoint, navBody, witchpointBody } =
      buoyScene();
    applyBuoyState(scene, buoyStates({}), cameraWorld);
    for (const [group, key] of [
      [navBuoy, "navBuoy"],
      [witchpoint, "witchpoint"],
    ] as const) {
      const expected = sub(layout[key].position, cameraWorld);
      expect(group.visible).toBe(true);
      expect(group.position.toArray()).toEqual([
        expected.x,
        expected.y,
        expected.z,
      ]);
    }
    expect(navBody.calls).toEqual([true]);
    expect(witchpointBody.calls).toEqual([true]);
  });

  it("hides a destroyed buoy and shows it again when the state says it is alive", () => {
    const { scene, navBuoy, witchpoint } = buoyScene();
    applyBuoyState(
      scene,
      buoyStates({ navBuoy: { destroyed: true } }),
      cameraWorld,
    );
    expect(navBuoy.visible).toBe(false);
    expect(witchpoint.visible).toBe(true);

    applyBuoyState(scene, buoyStates({}), cameraWorld);
    expect(navBuoy.visible).toBe(true);
  });

  it("places a buoy moved 50 m exactly 50 m further", () => {
    const { scene, witchpoint, navBuoy } = buoyScene();
    applyBuoyState(scene, buoyStates({}), cameraWorld);
    const before = witchpoint.position.clone();
    const navBefore = navBuoy.position.clone();
    const moved = add(layout.witchpoint.position, vec(50, 0, 0));
    applyBuoyState(
      scene,
      buoyStates({ witchpoint: { position: moved } }),
      cameraWorld,
    );
    expect(witchpoint.position.x - before.x).toBeCloseTo(50, 9);
    expect(witchpoint.position.y).toBe(before.y);
    expect(witchpoint.position.z).toBe(before.z);
    expect(navBuoy.position.toArray()).toEqual(navBefore.toArray());
  });

  it("hides a detached subentity on that buoy only", () => {
    const { scene, navBody, witchpointBody } = buoyScene();
    applyBuoyState(
      scene,
      buoyStates({ witchpoint: { subentityAttached: false } }),
      cameraWorld,
    );
    expect(witchpointBody.calls).toEqual([false]);
    expect(navBody.calls).toEqual([true]);
  });
});
