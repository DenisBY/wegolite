// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The static laser targets (CBT-17, Phase 18 plan 18-04).
 *
 * The row table is checked against the fixed ids of `ids.ts` (D-06, D-07) and
 * the layout and health keys it names; the station pose is checked against the
 * rule docking and the renderer share (`portQuaternion`, PITFALLS 11), built
 * here by hand from `stationBaseQuat` and a roll about local +Z so the test
 * does not just call the code it checks.
 */

import { describe, expect, it } from "vitest";

import { axisAngle, mul, rotate, vec } from "../../../src/sim/math.js";
import type { Quat } from "../../../src/sim/math.js";
import {
  MAIN_STATION_ID,
  PLAYER_ID,
  STATIC_BODY_IDS,
} from "../../../src/sim/world/ids.js";
import {
  STATIC_TARGETS,
  stationPose,
  staticTargetById,
} from "../../../src/sim/world/statics.js";
import { createStaticHealth } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

/** The renderer's station orientation, composed by hand. */
function handStationQuat(angle: number): Quat {
  return mul(layout.stationBaseQuat, axisAngle(0, 0, 1, angle));
}

describe("STATIC_TARGETS (the static laser targets, CBT-17)", () => {
  it("lists the station first, ascending and unique, with ids among the static bodies", () => {
    const ids = STATIC_TARGETS.map((row) => row.id);
    expect(ids[0]).toBe(MAIN_STATION_ID);
    for (let i = 1; i < ids.length; i += 1) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1] ?? Infinity);
    }
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(STATIC_BODY_IDS as readonly number[]).toContain(id);
      // Below the player, so the static candidates come first in ascending id.
      expect(id).toBeLessThan(PLAYER_ID);
    }
  });

  it("names the Coriolis hull, the station layout body and the station health", () => {
    const station = STATIC_TARGETS.find((row) => row.id === MAIN_STATION_ID);
    expect(station).toEqual({
      id: MAIN_STATION_ID,
      layoutKey: "station",
      hullKey: "coriolis-station",
      identKey: "coriolis-station",
      healthKey: "station",
    });
    const health = createStaticHealth();
    for (const row of STATIC_TARGETS) {
      expect(layout[row.layoutKey].position).toBeDefined();
      expect(health[row.healthKey]).toBeGreaterThan(0);
    }
  });
});

describe("staticTargetById", () => {
  it("is total: the station row for 3, undefined for 0, -1, NaN, 100 and the reserved range", () => {
    expect(staticTargetById(MAIN_STATION_ID)?.hullKey).toBe("coriolis-station");
    for (const id of [0, -1, Number.NaN, PLAYER_ID, 99, 1.5, Infinity]) {
      expect(staticTargetById(id)).toBeUndefined();
    }
  });
});

describe("stationPose (PITFALLS 11: the docking and renderer pose)", () => {
  it("is the station centre and the port quaternion at three angles", () => {
    for (const angle of [0, 1.234, -2.5]) {
      const pose = stationPose(layout, angle);
      expect(pose.position).toEqual(layout.station.position);
      const expected = handStationQuat(angle);
      expect(pose.orientation.w).toBeCloseTo(expected.w, 12);
      expect(pose.orientation.x).toBeCloseTo(expected.x, 12);
      expect(pose.orientation.y).toBeCloseTo(expected.y, 12);
      expect(pose.orientation.z).toBeCloseTo(expected.z, 12);
      // The dock axis (Oolite model +z, Wegolite local -Z) is the port's
      // outward axis, toward the planet, at every angle.
      const out = rotate(pose.orientation, vec(0, 0, -1));
      const base = rotate(layout.stationBaseQuat, vec(0, 0, -1));
      expect(out.x).toBeCloseTo(base.x, 12);
      expect(out.y).toBeCloseTo(base.y, 12);
      expect(out.z).toBeCloseTo(base.z, 12);
    }
  });
});
