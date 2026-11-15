// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The laser frame and ray (CBT-04, CBT-05; `Universe.m:5584-5611`).
 *
 * Expected values are derived by hand: the facing rotation is a turn about the
 * ship's up axis (aft by pi, port by +pi/2, starboard by -pi/2), so on
 * Wegolite's axes (forward -Z, right +X, up +Y) fore looks along F, aft along
 * -F, port along -R and starboard along +R, and up never changes. The mount
 * offsets are the Cobra's `weapon_position_*` with Oolite's z flipped.
 */

import { describe, expect, it } from "vitest";

import { laserFrame, playerLaserRay } from "../../../src/sim/combat/aim.js";
import { FACINGS } from "../../../src/sim/combat/mounts.js";
import {
  axisAngle,
  cross,
  dot,
  identity,
  length,
  mul,
  rotate,
  vec,
} from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

/** A tilted, turned orientation so no axis is accidentally aligned. */
const TILTED = mul(axisAngle(0, 1, 0, 0.7), axisAngle(1, 0, 0, -0.4));

describe("laserFrame", () => {
  const F = vec(0, 0, -1);
  const R = vec(1, 0, 0);
  const U = vec(0, 1, 0);

  it("fore looks along the ship's forward axis", () => {
    const frame = laserFrame(identity(), "fore");
    expectVec(frame.forward, F);
    expectVec(frame.right, R);
    expectVec(frame.up, U);
  });

  it("aft forward is minus the ship forward", () => {
    const frame = laserFrame(identity(), "aft");
    expectVec(frame.forward, vec(0, 0, 1));
    expectVec(frame.right, vec(-1, 0, 0));
    expectVec(frame.up, U);
  });

  it("port forward is minus the ship right axis (A1)", () => {
    const frame = laserFrame(identity(), "port");
    expectVec(frame.forward, vec(-1, 0, 0));
    expectVec(frame.right, F);
    expectVec(frame.up, U);
  });

  it("starboard forward is the ship right axis (A1)", () => {
    const frame = laserFrame(identity(), "starboard");
    expectVec(frame.forward, R);
    expectVec(frame.right, vec(0, 0, 1));
    expectVec(frame.up, U);
  });

  it("follows the ship's orientation and leaves up unchanged for every facing", () => {
    const shipForward = rotate(TILTED, F);
    const shipRight = rotate(TILTED, R);
    const shipUp = rotate(TILTED, U);
    expectVec(laserFrame(TILTED, "fore").forward, shipForward);
    expectVec(
      laserFrame(TILTED, "aft").forward,
      vec(-shipForward.x, -shipForward.y, -shipForward.z),
    );
    expectVec(
      laserFrame(TILTED, "port").forward,
      vec(-shipRight.x, -shipRight.y, -shipRight.z),
    );
    expectVec(laserFrame(TILTED, "starboard").forward, shipRight);
    for (const facing of FACINGS) {
      expectVec(laserFrame(TILTED, facing).up, shipUp);
    }
  });

  it("is an orthonormal right-handed frame for every facing", () => {
    for (const facing of FACINGS) {
      const { forward, right, up } = laserFrame(TILTED, facing);
      expect(length(forward)).toBeCloseTo(1, 9);
      expect(length(right)).toBeCloseTo(1, 9);
      expect(dot(forward, right)).toBeCloseTo(0, 9);
      expect(dot(forward, up)).toBeCloseTo(0, 9);
      expect(dot(right, up)).toBeCloseTo(0, 9);
      // right x forward = up on every facing: a pure turn about up.
      expectVec(cross(right, forward), up);
    }
  });
});

describe("playerLaserRay", () => {
  it("starts the fore beam at the Cobra's nose mount, not at its centre", () => {
    const position = vec(1000, 2000, 3000);
    const ray = playerLaserRay(
      position,
      identity(),
      "fore",
      "EQ_WEAPON_PULSE_LASER",
    );
    // weapon_position_forward is (-0.0961, 0.9367, 43.4655) in Oolite's frame;
    // Wegolite's forward is -Z, so the nose is at z - 43.4655.
    expectVec(ray.origin, vec(1000 - 0.0961, 2000 + 0.9367, 3000 - 43.4655));
    expectVec(ray.forward, vec(0, 0, -1));
  });

  it("starts the port beam at the port wing, pointing left", () => {
    const ray = playerLaserRay(
      vec(0, 0, 0),
      identity(),
      "port",
      "EQ_WEAPON_BEAM_LASER",
    );
    expectVec(ray.origin, vec(-47.4, -2.3, 0));
    expectVec(ray.forward, vec(-1, 0, 0));
  });

  it("starts the aft beam at the tail, pointing back", () => {
    const ray = playerLaserRay(
      vec(0, 0, 0),
      identity(),
      "aft",
      "EQ_WEAPON_BEAM_LASER",
    );
    // weapon_position_aft is (0, 0, -33.5): the tail is at +Z in Wegolite.
    expectVec(ray.origin, vec(0, 0, 33.5));
    expectVec(ray.forward, vec(0, 0, 1));
  });

  it("rotates the mount offset with the ship", () => {
    // A quarter turn about +Y sends local -Z (nose) to -X, so the nose mount at
    // local (-0.0961, 0.9367, -43.4655) lands at (-43.4655, 0.9367, 0.0961).
    const q = axisAngle(0, 1, 0, Math.PI / 2);
    const ray = playerLaserRay(
      vec(10, 0, 0),
      q,
      "fore",
      "EQ_WEAPON_PULSE_LASER",
    );
    expectVec(ray.origin, vec(10 - 43.4655, 0.9367, 0.0961));
    expectVec(ray.forward, vec(-1, 0, 0));
  });

  it("carries the laser's range", () => {
    expect(
      playerLaserRay(vec(0, 0, 0), identity(), "fore", "EQ_WEAPON_PULSE_LASER")
        .range,
    ).toBe(12500);
    expect(
      playerLaserRay(vec(0, 0, 0), identity(), "fore", "EQ_WEAPON_BEAM_LASER")
        .range,
    ).toBe(15000);
    expect(
      playerLaserRay(
        vec(0, 0, 0),
        identity(),
        "fore",
        "EQ_WEAPON_MILITARY_LASER",
      ).range,
    ).toBe(30000);
  });
});
