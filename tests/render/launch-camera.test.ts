// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch/cockpit camera contract (D-10, research step 8, Pitfall 6).
 *
 * The camera pose is decided here, in Node, not by a playtest: an offset camera
 * left at the origin, a mirrored `stationRight`, a dropped forward term or a
 * cockpit offset with the wrong sign all fail a numeric assertion. The browser
 * spec only checks mode/timer/Cobra visibility because a pixel-free browser
 * check cannot tell an offset camera from one at the origin.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  COCKPIT_OFFSET,
  computeCockpitCamera,
  computeLaunchCamera,
  LAUNCH_FORWARD_OFFSET,
  LAUNCH_RIGHT_OFFSET,
  LAUNCH_UP_OFFSET,
  launchCameraBasis,
} from "../../src/render/launch-camera.js";
import {
  add,
  axisAngle,
  cross,
  dot,
  identity,
  length,
  normalizeVec,
  quatFromUnitVectors,
  rotate,
  scale,
  sub,
  vec,
} from "../../src/sim/math.js";
import type { Quat, Vec3 } from "../../src/sim/math.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";

const { layout: laveLayout } = laveFixture();

/** The Lave offset length: sqrt(220^2 + 110^2 + 60^2). */
const LAUNCH_OFFSET_LENGTH = Math.sqrt(64_100);

/**
 * A full layout with an axis-aligned station so the offset components can be
 * asserted directly. `stationToPlanet` is -Z and `dockOffset` is Lave's.
 */
function axisAlignedLayout(
  overrides: Partial<SystemLayout> = {},
): SystemLayout {
  return {
    planet: { position: vec(0, 0, -1_000), radius: 100 },
    sun: { position: vec(0, 0, -5_000), radius: 200 },
    station: { position: vec(0, 0, 0), radius: 500 },
    navBuoy: { position: vec(0, 0, 10_000), radius: 10 },
    witchpoint: { position: vec(0, 0, 0), radius: 10 },
    stationToPlanet: vec(0, 0, -1),
    stationBaseQuat: quatFromUnitVectors(vec(0, 0, -1), vec(0, 0, -1)),
    stationRollRadPerSec: 0.125,
    dockOffset: 500.2561,
    scannerRange: 25_600,
    stationAegisRange: 51_200,
    planetAegisRange: 300,
    sunDir: vec(0, 0, -1),
    rotationSpeed: 0.001,
    ...overrides,
  };
}

function dockMouth(layout: SystemLayout): Vec3 {
  return add(
    layout.station.position,
    scale(layout.stationToPlanet, layout.dockOffset),
  );
}

function expectVecClose(actual: Vec3, expected: Vec3, digits: number): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function quatLength(q: Quat): number {
  return Math.hypot(q.w, q.x, q.y, q.z);
}

const launchCameraSource = readFileSync(
  new URL("../../src/render/launch-camera.ts", import.meta.url),
  "utf8",
);

describe("launch camera", () => {
  it("sits (110, 60, -220) from the dock mouth in an axis-aligned basis", () => {
    const layout = axisAlignedLayout();
    const dockPos = dockMouth(layout);
    const shipPos = add(dockPos, scale(layout.stationToPlanet, -80));
    const pose = computeLaunchCamera(layout, shipPos);

    expectVecClose(
      sub(pose.position, dockPos),
      vec(LAUNCH_RIGHT_OFFSET, LAUNCH_UP_OFFSET, -LAUNCH_FORWARD_OFFSET),
      9,
    );
    // A mirrored stationRight (stationLeft) would negate the x component.
    expect(pose.position.x - dockPos.x).toBeCloseTo(110, 9);
  });

  it("looks at the ship with local -Z and a unit quaternion", () => {
    const layout = axisAlignedLayout();
    const dockPos = dockMouth(layout);
    const shipPos = add(dockPos, scale(layout.stationToPlanet, -80));
    const pose = computeLaunchCamera(layout, shipPos);

    const look = normalizeVec(sub(shipPos, pose.position));
    expectVecClose(rotate(pose.quaternion, vec(0, 0, -1)), look, 9);
    expect(quatLength(pose.quaternion)).toBeCloseTo(1, 12);
  });

  it("keeps the Lave offset length at sqrt(64100)", () => {
    const dockPos = dockMouth(laveLayout);
    const pose = computeLaunchCamera(laveLayout, dockPos);

    expect(length(sub(pose.position, dockPos))).toBeCloseTo(
      LAUNCH_OFFSET_LENGTH,
      9,
    );
  });

  it("holds the same identities for the real Lave layout", () => {
    const dockPos = dockMouth(laveLayout);
    const shipPos = add(dockPos, scale(laveLayout.stationToPlanet, -80));
    const pose = computeLaunchCamera(laveLayout, shipPos);

    for (const value of [
      pose.position.x,
      pose.position.y,
      pose.position.z,
      pose.quaternion.w,
      pose.quaternion.x,
      pose.quaternion.y,
      pose.quaternion.z,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(length(sub(pose.position, dockPos))).toBeCloseTo(
      LAUNCH_OFFSET_LENGTH,
      6,
    );
    expectVecClose(
      rotate(pose.quaternion, vec(0, 0, -1)),
      normalizeVec(sub(shipPos, pose.position)),
      9,
    );
    expect(quatLength(pose.quaternion)).toBeCloseTo(1, 12);
  });

  it("falls back to a finite orthonormal basis when stationToPlanet is world up", () => {
    const layout = axisAlignedLayout({ stationToPlanet: vec(0, 1, 0) });
    const dockPos = dockMouth(layout);
    const shipPos = add(dockPos, vec(0, 120, 0));
    const pose = computeLaunchCamera(layout, shipPos);
    const basis = launchCameraBasis(layout);

    expect(length(basis.right)).toBeCloseTo(1, 12);
    expect(dot(basis.right, layout.stationToPlanet)).toBeCloseTo(0, 12);
    expect(length(basis.up)).toBeCloseTo(1, 12);
    expect(dot(basis.up, layout.stationToPlanet)).toBeCloseTo(0, 12);
    expect(Number.isFinite(pose.position.x)).toBe(true);
    expect(Number.isFinite(pose.position.y)).toBe(true);
    expect(Number.isFinite(pose.position.z)).toBe(true);
    expect(quatLength(pose.quaternion)).toBeCloseTo(1, 12);
  });
});

describe("cockpit camera", () => {
  it("adds the Oolite view offset and keeps the ship orientation", () => {
    const position = vec(1, 2, 3);
    const pose = computeCockpitCamera(position, identity());

    expectVecClose(pose.position, add(position, COCKPIT_OFFSET), 12);
    expect(pose.position.y - position.y).toBeCloseTo(7.25, 12);
    expect(pose.position.z - position.z).toBeCloseTo(-31, 12);
    expect(pose.quaternion).toEqual(identity());
  });

  it("rotates the offset with a 90 degree yaw", () => {
    const position = vec(10, 20, 30);
    const orientation = axisAngle(0, 1, 0, Math.PI / 2);
    const pose = computeCockpitCamera(position, orientation);

    expectVecClose(
      pose.position,
      add(position, rotate(orientation, COCKPIT_OFFSET)),
      12,
    );
    expect(pose.quaternion).toEqual(orientation);
    // The offset must rotate, not stay in world axes.
    expect(pose.position.x - position.x).not.toBeCloseTo(0, 6);
  });
});

describe("determinism", () => {
  it("contains no wall clock and no unseeded randomness", () => {
    expect(launchCameraSource.length).toBeGreaterThan(1_000);
    expect(launchCameraSource).not.toMatch(/Math\.random/);
    expect(launchCameraSource).not.toMatch(/\bperformance\b/);
    expect(launchCameraSource).not.toMatch(/\bDate\.now\b|\bnew Date\b/);
  });

  it("keeps the station basis orthogonal to the dock direction", () => {
    const basis = launchCameraBasis(laveLayout);
    expect(dot(basis.right, laveLayout.stationToPlanet)).toBeCloseTo(0, 12);
    expect(dot(basis.up, laveLayout.stationToPlanet)).toBeCloseTo(0, 12);
    // right = cross(toPlanet, worldUp), never the mirrored stationLeft.
    expectVecClose(
      basis.right,
      normalizeVec(cross(laveLayout.stationToPlanet, vec(0, 1, 0))),
      12,
    );
  });
});
