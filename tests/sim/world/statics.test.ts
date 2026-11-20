// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The static laser targets (CBT-17, Phase 18 plan 18-04).
 *
 * The row table is checked against the fixed ids of `ids.ts` (D-06, D-07) and
 * the layout and health keys it names; the station pose is checked against the
 * rule docking and the renderer share (`portQuaternion`, PITFALLS 11), built
 * here by hand from `stationBaseQuat` and a roll about local +Z so the test
 * does not just call the code it checks. Plan 18-05 adds the two buoy rows,
 * the buoy pose (the layout position plus the world offset, PD-02, and the
 * closed-form tumble of `performBuoyTumble`) and `isBuoyDestroyed`.
 */

import { describe, expect, it } from "vitest";

import { axisAngle, mul, rotate, vec } from "../../../src/sim/math.js";
import type { Quat } from "../../../src/sim/math.js";
import {
  MAIN_STATION_ID,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  STATIC_BODY_IDS,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import {
  BUOY_PITCH_RATE,
  BUOY_ROLL_RATE,
  STATIC_TARGETS,
  buoyOrientation,
  buoyPosition,
  isBuoyDestroyed,
  isBuoySubentityAttached,
  stationPose,
  staticPose,
  staticTargetById,
} from "../../../src/sim/world/statics.js";
import type { StaticTarget } from "../../../src/sim/world/statics.js";
import {
  createStaticHealth,
  createWorld,
  isPristineBuoyStates,
} from "../../../src/sim/world/world.js";
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

describe("the buoy rows (CBT-17, plan 18-05)", () => {
  it("lists the witchpoint buoy (4) and the nav buoy (5) after the station, on the buoy hull", () => {
    expect(STATIC_TARGETS.map((row) => row.id)).toEqual([
      MAIN_STATION_ID,
      WITCHPOINT_BUOY_ID,
      STATION_NAV_BUOY_ID,
    ]);
    expect(staticTargetById(WITCHPOINT_BUOY_ID)).toEqual({
      id: WITCHPOINT_BUOY_ID,
      layoutKey: "witchpoint",
      hullKey: "buoy",
      identKey: "buoy-witchpoint",
      healthKey: "witchpoint",
    });
    expect(staticTargetById(STATION_NAV_BUOY_ID)).toEqual({
      id: STATION_NAV_BUOY_ID,
      layoutKey: "navBuoy",
      hullKey: "buoy",
      identKey: "buoy",
      healthKey: "navBuoy",
    });
  });
});

describe("buoyOrientation (performBuoyTumble, ShipEntityAI.m:458-464)", () => {
  it("keeps Oolite's rates: roll 0.10 and pitch 0.15 rad/s", () => {
    expect(BUOY_ROLL_RATE).toBe(0.1);
    expect(BUOY_PITCH_RATE).toBe(0.15);
  });

  it("is the identity at t = 0 and for a non-finite time", () => {
    for (const t of [0, Number.NaN, Infinity, -Infinity]) {
      expect(buoyOrientation(t)).toEqual({ w: 1, x: 0, y: 0, z: 0 });
    }
  });

  it("is roll(+Z, 1.0) x pitch(+X, 1.5) at t = 10", () => {
    const expected = mul(axisAngle(0, 0, 1, 1.0), axisAngle(1, 0, 0, 1.5));
    const q = buoyOrientation(10);
    expect(q.w).toBeCloseTo(expected.w, 12);
    expect(q.x).toBeCloseTo(expected.x, 12);
    expect(q.y).toBeCloseTo(expected.y, 12);
    expect(q.z).toBeCloseTo(expected.z, 12);
  });
});

describe("buoyPosition (PD-02: the layout position plus the world offset)", () => {
  it("is the layout position without a world and for a zero offset, bit for bit", () => {
    const world = createWorld(1);
    for (const key of ["witchpoint", "navBuoy"] as const) {
      expect(buoyPosition(undefined, layout, key)).toBe(layout[key].position);
      expect(buoyPosition(world, layout, key)).toBe(layout[key].position);
      // A negative-zero offset is a zero offset: the layout position itself.
      world.buoys[key].offset = { x: -0, y: 0, z: -0 };
      expect(buoyPosition(world, layout, key)).toBe(layout[key].position);
    }
  });

  it("adds a non-zero offset", () => {
    const world = createWorld(1);
    world.buoys.navBuoy.offset = { x: 50, y: -3, z: 0.5 };
    const base = layout.navBuoy.position;
    expect(buoyPosition(world, layout, "navBuoy")).toEqual({
      x: base.x + 50,
      y: base.y - 3,
      z: base.z + 0.5,
    });
    expect(buoyPosition(world, layout, "witchpoint")).toBe(
      layout.witchpoint.position,
    );
  });
});

describe("staticPose (one pose for hit, docking and draw)", () => {
  function row(id: number): StaticTarget {
    const found = staticTargetById(id);
    if (found === undefined) throw new Error(`no row ${id}`);
    return found;
  }

  it("is stationPose for the station and the buoy pose for a buoy", () => {
    const world = createWorld(1);
    world.buoys.witchpoint.offset = { x: 0, y: 7, z: 0 };
    const clock = { stationAngle: 1.234, flightTime: 10 };
    expect(staticPose(row(MAIN_STATION_ID), layout, clock, world)).toEqual(
      stationPose(layout, 1.234),
    );
    const pose = staticPose(row(WITCHPOINT_BUOY_ID), layout, clock, world);
    expect(pose.position).toEqual({ x: 0, y: 7, z: 0 });
    expect(pose.orientation).toEqual(buoyOrientation(10));
    const nav = staticPose(row(STATION_NAV_BUOY_ID), layout, clock, undefined);
    expect(nav.position).toBe(layout.navBuoy.position);
  });
});

describe("isBuoyDestroyed (D-04, D-05)", () => {
  it("is false for a pristine world and true exactly when the health is 0", () => {
    const world = createWorld(1);
    expect(isBuoyDestroyed(world, "witchpoint")).toBe(false);
    expect(isBuoyDestroyed(world, "navBuoy")).toBe(false);
    world.staticHealth.navBuoy = 1e-9;
    expect(isBuoyDestroyed(world, "navBuoy")).toBe(false);
    world.staticHealth.navBuoy = 0;
    expect(isBuoyDestroyed(world, "navBuoy")).toBe(true);
    expect(isBuoyDestroyed(world, "witchpoint")).toBe(false);
  });
});

/**
 * D-04 (plan 18-08): a destroyed, moved or stripped buoy lasts only as long as
 * its world. The session builds every world through `createWorld`
 * (`src/app/session/world-lifecycle.ts`, `create`): `begin` on every launch
 * (`createWorldLifecycleFlow` in `event-router.ts`, the `launched` event) and
 * every hyperspace arrival (`hyperspace-controller.ts`), and `resume` on a
 * Continue or Load of an in-flight save (`restoreWorldAnchor`). Buoy state is
 * never saved (the save carries the epoch and the anchor, not the world), so a
 * new world restores both buoys whole, at 250 and unmoved. Oolite keeps a
 * destroyed buoy through a dock and relaunch within one visit; that is the
 * world-lifecycle divergence NPCs share (FIDELITY).
 */
describe("a new world restores both buoys (D-04, plan 18-08)", () => {
  it("returns both buoys at 250, unmoved and whole whatever the previous world did to them", () => {
    const old = createWorld(1);
    old.staticHealth.navBuoy = 0;
    old.buoys.witchpoint.offset = vec(300, -40, 12);
    old.buoys.witchpoint.velocity = vec(2, 0, 0);
    old.buoys.witchpoint.subentityEnergy = 0;
    old.buoys.navBuoy.subentityTakingDamage = true;
    expect(isBuoyDestroyed(old, "navBuoy")).toBe(true);
    expect(isBuoySubentityAttached(old, "witchpoint")).toBe(false);

    for (const seed of [0, 1, 2, 0x7fffffff, 0xffffffff]) {
      const world = createWorld(seed);
      for (const key of ["witchpoint", "navBuoy"] as const) {
        expect(world.staticHealth[key]).toBe(250);
        expect(isBuoyDestroyed(world, key)).toBe(false);
        expect(world.buoys[key].offset).toEqual(vec(0, 0, 0));
        expect(world.buoys[key].velocity).toEqual(vec(0, 0, 0));
        expect(world.buoys[key].subentityEnergy).toBe(200);
        expect(world.buoys[key].subentityTakingDamage).toBe(false);
        expect(isBuoySubentityAttached(world, key)).toBe(true);
        expect(buoyPosition(world, layout, key)).toEqual(layout[key].position);
      }
      expect(isPristineBuoyStates(world.buoys)).toBe(true);
      // No state is shared with the old world.
      expect(world.buoys.witchpoint).not.toBe(old.buoys.witchpoint);
      expect(world.staticHealth).not.toBe(old.staticHealth);
    }
    // Building new worlds never touches the old one.
    expect(old.staticHealth.navBuoy).toBe(0);
    expect(old.buoys.witchpoint.offset).toEqual(vec(300, -40, 12));
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
