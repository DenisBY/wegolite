// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The numeric camera-relative proof at Lave's full extent (WORLD-02, T-3-09).
 *
 * This is a Node proof, independent of `src/render/sync.ts`: it derives the
 * launch cockpit camera world pose from the same flight state the renderer
 * reads and applies the one `cameraRelative()` subtraction. The structural
 * assertion (one `cameraRelative()` call site per body, camera at the origin)
 * belongs to plan 07's `tests/render/sync.test.ts`, because plan 03 rewrites
 * `sync.ts` in this same wave.
 *
 * Numbers pinned here:
 * - at the sun distance `1,140,077.01069702 m` the float32 ULP is `0.125 m`;
 * - the sun's relative coordinate stays finite and below `2.5e6`;
 * - the `500.2561 m` dock offset survives the subtraction to sub-millimetre
 *   float32 resolution at 500 m;
 * - the maximum relative magnitude over the body set at launch is below
 *   `2.5e6` — the same quantity the probe publishes as
 *   `world.maxRelativeMagnitude`.
 */

import { describe, expect, it } from "vitest";

import {
  cameraRelative,
  f32Error,
  f32Ulp,
} from "../../src/render/camera-relative.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { add, length, rotate, vec } from "../../src/sim/math.js";
import type { Quat, Vec3 } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();
const { layout, config } = fixture;

/** The researched witchpoint -> sun distance (RESEARCH § Data & Constants). */
const SUN_DISTANCE_M = 1_140_077.010_697_02;

/** Oolite's `view_position_forward = "0.0 7.25 31.0"` in the -Z basis. */
const VIEW_OFFSET = vec(0, 7.25, -31);

/** The ship pose after the launch step: dock mouth, facing the planet. */
function launchPose(): { position: Vec3; orientation: Quat } {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  return { position: state.position, orientation: state.orientation };
}

function magnitude(point: { x: number; y: number; z: number }): number {
  return Math.hypot(point.x, point.y, point.z);
}

describe("float32 resolution at Lave scale", () => {
  it("has a 0.125 m ULP at the sun distance, below the 0.25 m bound", () => {
    expect(f32Ulp(SUN_DISTANCE_M)).toBe(0.125);
    expect(f32Ulp(SUN_DISTANCE_M)).toBeLessThan(0.25);
  });

  it("has sub-millimetre resolution at the 500 m dock", () => {
    expect(f32Ulp(layout.dockOffset)).toBeLessThan(1e-3);
  });
});

describe("camera-relative placement at launch", () => {
  const pose = launchPose();
  const cameraWorld = add(pose.position, rotate(pose.orientation, VIEW_OFFSET));

  it("keeps the sun's relative coordinate finite and below 2.5e6", () => {
    const relative = cameraRelative(layout.sun.position, cameraWorld);
    expect(Number.isFinite(relative.x)).toBe(true);
    expect(Number.isFinite(relative.y)).toBe(true);
    expect(Number.isFinite(relative.z)).toBe(true);

    const distance = magnitude(relative);
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeLessThan(2.5e6);
    // The dock is on the planet-facing side of the station, ~898.2 km from the
    // sun; the 1,140,077.01 m figure is the witchpoint distance and is used
    // only for the ULP bound above.
    expect(distance).toBeCloseTo(898_213.930_2, 3);
  });

  it("preserves the 500.2561 m dock offset through the subtraction", () => {
    const stationRelative = cameraRelative(
      layout.station.position,
      cameraWorld,
    );
    const shipRelative = cameraRelative(pose.position, cameraWorld);

    const difference = {
      x: stationRelative.x - shipRelative.x,
      y: stationRelative.y - shipRelative.y,
      z: stationRelative.z - shipRelative.z,
    };
    expect(magnitude(difference)).toBeCloseTo(layout.dockOffset, 6);

    // Sub-millimetre float32 resolution at 500 m: every relative component
    // rounds by far less than the dock offset itself.
    expect(f32Error(stationRelative.x)).toBeLessThan(1e-3);
    expect(f32Error(stationRelative.y)).toBeLessThan(1e-3);
    expect(f32Error(stationRelative.z)).toBeLessThan(1e-3);
  });

  it("uses the same pose for the camera and the player hull", () => {
    const shipRelative = cameraRelative(pose.position, cameraWorld);
    // The hull sits exactly at the camera origin minus the rotated view
    // offset: the camera and the hull share one interpolated pose, so there is
    // no mixing.
    const offset = rotate(pose.orientation, VIEW_OFFSET);
    expect(magnitude(shipRelative)).toBeCloseTo(magnitude(VIEW_OFFSET), 9);
    expect(shipRelative.x).toBeCloseTo(-offset.x, 9);
    expect(shipRelative.y).toBeCloseTo(-offset.y, 9);
    expect(shipRelative.z).toBeCloseTo(-offset.z, 9);
  });

  it("keeps the maximum relative magnitude over the body set below 2.5e6", () => {
    const bodies = [
      layout.planet.position,
      layout.sun.position,
      layout.station.position,
      layout.navBuoy.position,
      layout.witchpoint.position,
      pose.position,
    ];

    let maximum = 0;
    for (const body of bodies) {
      const relative = cameraRelative(body, cameraWorld);
      expect(Number.isFinite(relative.x)).toBe(true);
      expect(Number.isFinite(relative.y)).toBe(true);
      expect(Number.isFinite(relative.z)).toBe(true);
      maximum = Math.max(maximum, magnitude(relative));
    }

    expect(Number.isFinite(maximum)).toBe(true);
    expect(maximum).toBeGreaterThan(8e5);
    expect(maximum).toBeLessThan(2.5e6);
  });

  it("never writes a relative value back into the sim pose", () => {
    const before = {
      position: { ...pose.position },
      orientation: { ...pose.orientation },
    };
    cameraRelative(layout.sun.position, cameraWorld);
    cameraRelative(layout.station.position, cameraWorld);

    expect(pose.position).toEqual(before.position);
    expect(pose.orientation).toEqual(before.orientation);
    expect(length(pose.position)).toBeGreaterThan(1e5);
  });
});
