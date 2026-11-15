// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The avoid-collision entry and exit and their call sites (AI-01, plan 14-13).
 * Expected values are derived by hand from the cited `ShipEntity.m` lines, never
 * from running the implementation; the independent oracle fixtures of the
 * behaviour itself belong to plan 14-15.
 */

import { describe, expect, it } from "vitest";

import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import {
  avoidCollision,
  hasProximityAlertIgnoringTarget,
  proximityAlertBody,
  resumePostProximityAlert,
} from "../../../src/sim/npc/avoid.js";
import { behaviourFaceDestination } from "../../../src/sim/npc/behaviours/face-destination.js";
import {
  behaviourFlyFromDestination,
  behaviourFlyRangeFromDestination,
  behaviourFlyToDestination,
} from "../../../src/sim/npc/behaviours/fly-to-destination.js";
import { behaviourInterceptTarget } from "../../../src/sim/npc/behaviours/intercept.js";
import type { SteerContext } from "../../../src/sim/npc/dispatch.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import type { ScanClass } from "../../../src/sim/world/ids.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import { createSyntheticView } from "./oracle-runner.js";
import type { RunnerBody } from "./oracle-runner.js";

const DT = 1 / 120;
const TARGET_ID = 102;
const OTHER_ID = 103;

const STATS: NpcFlightStats = {
  specKey: "t",
  maxFlightSpeed: 160,
  maxFlightRoll: 2,
  maxFlightPitch: 1,
  thrust: 15,
  mass: 0,
  forwardWeapon: "EQ_WEAPON_NONE",
};

function ship(scanClass: ScanClass = "CLASS_NEUTRAL"): Entity {
  const result = spawnEntity(
    createWorld(1),
    {
      kind: "ship",
      specKey: "t",
      scanClass,
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 10,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  result.entity.steer.accuracy = 2;
  return result.entity;
}

function body(id: number, position: Vec3, radius: number): RunnerBody {
  return {
    id,
    kind: "ship",
    scanClass: "CLASS_NEUTRAL",
    radius,
    mass: 0,
    position,
    orientation: identity(),
    speed: 0,
    behaviour: "IDLE",
    targetId: 0,
  };
}

function contextFor(
  entity: Entity,
  bodies: readonly RunnerBody[],
  tick = 1,
): SteerContext {
  return {
    view: createSyntheticView(bodies, entity, tick),
    stats: STATS,
    dt: DT,
    draw: () => {
      throw new Error("no draw expected");
    },
    emit: () => {},
  };
}

/** A ship in `behaviour` with a known condition, an alert on a radius-30 ship. */
function alerted(behaviour: Entity["nav"]["behaviour"]): {
  entity: Entity;
  ctx: SteerContext;
} {
  const entity = ship();
  entity.nav.behaviour = behaviour;
  entity.nav.targetId = TARGET_ID;
  entity.nav.desiredRange = 55;
  entity.nav.desiredSpeed = 80;
  entity.nav.destination = vec(7, 8, 9);
  entity.steer.proximityAlert = OTHER_ID;
  const ctx = contextFor(entity, [
    body(TARGET_ID, vec(0, 0, -3000), 50),
    body(OTHER_ID, vec(100, 0, 0), 30),
  ]);
  return { entity, ctx };
}

describe("avoidCollision (ShipEntity.m:5904-5936)", () => {
  it("saves the condition, steers for the midpoint with ten of the other's radii and pitches over", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    avoidCollision(entity, ctx);
    // 5918-5923: the saved condition
    expect(entity.steer.saved).toEqual({
      behaviour: "FLY_TO_DESTINATION",
      targetId: TARGET_ID,
      desiredRange: 55,
      desiredSpeed: 80,
      destination: vec(7, 8, 9),
    });
    // 5929: the point between us and them, (0 + 100) / 2
    expect(entity.nav.destination).toEqual(vec(50, 0, 0));
    // 5931: 30 x PROXIMITY_AVOID_DISTANCE_FACTOR (Universe.h:101)
    expect(entity.nav.desiredRange).toBe(300);
    expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(entity.steer.pitchingOver).toBe(true);
    // the alert stays until the exit clears it
    expect(entity.steer.proximityAlert).toBe(OTHER_ID);
  });

  it("the midpoint is a + 0.5 (b - a) on every axis", () => {
    const { entity } = alerted("FLY_TO_DESTINATION");
    entity.position = vec(10, -20, 30);
    const ctx = contextFor(entity, [body(OTHER_ID, vec(30, 40, -50), 5)]);
    avoidCollision(entity, ctx);
    expect(entity.nav.destination).toEqual(vec(20, 10, -10));
    expect(entity.nav.desiredRange).toBe(50);
  });

  it("saves no target when the ship has none (the key is absent, 5921-5924)", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.nav.targetId = 0;
    avoidCollision(entity, ctx);
    expect(entity.steer.saved?.targetId).toBe(0);
  });

  it("a second entry overwrites the saved condition (5915-5917)", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    avoidCollision(entity, ctx);
    avoidCollision(entity, ctx);
    expect(entity.steer.saved?.behaviour).toBe("AVOID_COLLISION");
    expect(entity.steer.saved?.desiredRange).toBe(300);
  });

  it("a missile does not avoid (5909-5910)", () => {
    const entity = ship("CLASS_MISSILE");
    entity.steer.proximityAlert = OTHER_ID;
    entity.nav.behaviour = "INTERCEPT_TARGET";
    const ctx = contextFor(entity, [body(OTHER_ID, vec(100, 0, 0), 30)]);
    avoidCollision(entity, ctx);
    expect(entity.steer.saved).toBeNull();
    expect(entity.nav.behaviour).toBe("INTERCEPT_TARGET");
    expect(entity.steer.pitchingOver).toBe(false);
  });

  it("does nothing without an alert (5913)", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.steer.proximityAlert = 0;
    avoidCollision(entity, ctx);
    expect(entity.steer.saved).toBeNull();
    expect(entity.nav.behaviour).toBe("FLY_TO_DESTINATION");
  });
});

describe("the alert read (proximityAlert, 6089-6096)", () => {
  it("an alert naming a body the view does not return counts as none and is cleared", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.steer.proximityAlert = 999;
    expect(proximityAlertBody(entity, ctx)).toBeUndefined();
    expect(entity.steer.proximityAlert).toBe(0);
    entity.steer.proximityAlert = 999;
    expect(hasProximityAlertIgnoringTarget(entity, ctx, false)).toBe(false);
    avoidCollision(entity, ctx);
    expect(entity.steer.saved).toBeNull();
  });

  it("an alert naming the ship itself counts as none", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.steer.proximityAlert = entity.id;
    expect(proximityAlertBody(entity, ctx)).toBeUndefined();
    expect(entity.steer.proximityAlert).toBe(0);
  });

  it("a live alert is returned and kept", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    expect(proximityAlertBody(entity, ctx)?.id).toBe(OTHER_ID);
    expect(entity.steer.proximityAlert).toBe(OTHER_ID);
  });
});

describe("hasProximityAlertIgnoringTarget (9751-9758)", () => {
  it("is true for an alert that is not the primary target, either way", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    expect(hasProximityAlertIgnoringTarget(entity, ctx, true)).toBe(true);
    expect(hasProximityAlertIgnoringTarget(entity, ctx, false)).toBe(true);
  });

  it("ignores an alert that names the primary target only when asked to", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.steer.proximityAlert = TARGET_ID;
    expect(hasProximityAlertIgnoringTarget(entity, ctx, true)).toBe(false);
    expect(hasProximityAlertIgnoringTarget(entity, ctx, false)).toBe(true);
  });

  it("is false with no alert", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.steer.proximityAlert = 0;
    expect(hasProximityAlertIgnoringTarget(entity, ctx, true)).toBe(false);
    expect(hasProximityAlertIgnoringTarget(entity, ctx, false)).toBe(false);
  });

  it("an alert is not the target when the target is invalid (primaryTarget is nil)", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.nav.targetId = 999; // gone: primaryTarget reads nil
    expect(hasProximityAlertIgnoringTarget(entity, ctx, true)).toBe(true);
  });
});

describe("resumePostProximityAlert (ShipEntity.m:5938-5958)", () => {
  it("restores the saved condition, restarts the curve at the current tick, zeroes frustration and clears the alert", () => {
    const { entity } = alerted("FLY_TO_DESTINATION");
    const entry = contextFor(entity, [
      body(TARGET_ID, vec(0, 0, -3000), 50),
      body(OTHER_ID, vec(100, 0, 0), 30),
    ]);
    avoidCollision(entity, entry);
    entity.steer.frustration = 3;
    entity.steer.trackingCount = 0;
    const exit = contextFor(
      entity,
      [
        body(TARGET_ID, vec(0, 0, -3000), 50),
        body(OTHER_ID, vec(100, 0, 0), 30),
      ],
      500,
    );
    resumePostProximityAlert(entity, exit);
    expect(entity.nav.behaviour).toBe("FLY_TO_DESTINATION");
    expect(entity.nav.targetId).toBe(TARGET_ID);
    expect(entity.nav.desiredRange).toBe(55);
    expect(entity.nav.desiredSpeed).toBe(80);
    expect(entity.nav.destination).toEqual(vec(7, 8, 9));
    // 5946: a valid target gets four fresh samples at tick 500 (60-tick spacing)
    expect(entity.steer.trackingCount).toBe(4);
    expect(entity.steer.trackingTicks).toEqual([500, 440, 380, 320]);
    expect(entity.steer.trackingPositions[0]).toEqual(vec(0, 0, -3000));
    expect(entity.steer.frustration).toBe(0); // 5953
    expect(entity.steer.saved).toBeNull();
    expect(entity.steer.proximityAlert).toBe(0); // 5955
  });

  it("leaves the curve alone when the saved target is gone (startTrackingCurve needs a valid target)", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    avoidCollision(entity, ctx);
    const exit = contextFor(entity, [body(OTHER_ID, vec(100, 0, 0), 30)], 500);
    resumePostProximityAlert(entity, exit);
    expect(entity.nav.targetId).toBe(TARGET_ID); // restored as the weak ref was
    expect(entity.steer.trackingCount).toBe(0);
    expect(entity.steer.saved).toBeNull();
  });

  it("restores 'no target' when none was saved", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.nav.targetId = 0;
    avoidCollision(entity, ctx);
    entity.nav.targetId = TARGET_ID; // a think set one meanwhile
    resumePostProximityAlert(entity, ctx);
    expect(entity.nav.targetId).toBe(0);
  });

  it("does nothing with no saved condition (5940-5941): the alert stays too", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.steer.frustration = 3;
    resumePostProximityAlert(entity, ctx);
    expect(entity.nav.behaviour).toBe("FLY_TO_DESTINATION");
    expect(entity.nav.desiredRange).toBe(55);
    expect(entity.steer.frustration).toBe(3);
    expect(entity.steer.proximityAlert).toBe(OTHER_ID);
  });
});

describe("the proximity call sites", () => {
  const sites: [
    string,
    Entity["nav"]["behaviour"],
    (e: Entity, c: SteerContext) => void,
  ][] = [
    // fly range from, 4914-4915: the chosen behaviour is saved, frustration 0 follows
    [
      "fly range from (4914-4915)",
      "FLY_RANGE_FROM_DESTINATION",
      behaviourFlyRangeFromDestination,
    ],
    ["fly to (5131-5132)", "FLY_TO_DESTINATION", behaviourFlyToDestination],
    [
      "fly from (5150-5151)",
      "FLY_FROM_DESTINATION",
      behaviourFlyFromDestination,
    ],
    [
      "face destination (4962-4963)",
      "FACE_DESTINATION",
      behaviourFaceDestination,
    ],
    ["intercept (3881-3882)", "INTERCEPT_TARGET", behaviourInterceptTarget],
  ];

  it.each(sites)(
    "%s turns away from an alert that is not the target",
    (_name, behaviour, run) => {
      const { entity, ctx } = alerted(behaviour);
      entity.nav.destination = vec(0, 0, -2000);
      entity.nav.desiredRange = 100;
      run(entity, ctx);
      expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
      expect(entity.steer.saved).not.toBeNull();
      expect(entity.nav.destination).toEqual(vec(50, 0, 0));
      expect(entity.nav.desiredRange).toBe(300);
      expect(entity.steer.pitchingOver).toBe(true);
    },
  );

  it.each(sites)(
    "%s ignores an alert that names the primary target",
    (_name, behaviour, run) => {
      const { entity, ctx } = alerted(behaviour);
      entity.nav.destination = vec(0, 0, -2000);
      entity.nav.desiredRange = 100;
      entity.steer.proximityAlert = TARGET_ID;
      run(entity, ctx);
      expect(entity.nav.behaviour).not.toBe("AVOID_COLLISION");
      expect(entity.steer.saved).toBeNull();
    },
  );

  it("fly range from saves the behaviour it chose before the call and zeroes frustration after it (4905-4917)", () => {
    const { entity, ctx } = alerted("FLY_RANGE_FROM_DESTINATION");
    entity.nav.destination = vec(0, 0, -2000);
    entity.nav.desiredRange = 100; // distance 2000 > 100: fly to
    entity.steer.frustration = 5;
    behaviourFlyRangeFromDestination(entity, ctx);
    expect(entity.steer.saved?.behaviour).toBe("FLY_TO_DESTINATION");
    expect(entity.steer.frustration).toBe(0);
  });

  it("fly to saves the condition after the arrival check did not fire (5131)", () => {
    const { entity, ctx } = alerted("FLY_TO_DESTINATION");
    entity.nav.destination = vec(0, 0, -2000);
    entity.nav.desiredRange = 100;
    behaviourFlyToDestination(entity, ctx);
    expect(entity.steer.saved?.behaviour).toBe("FLY_TO_DESTINATION");
    expect(entity.steer.saved?.desiredRange).toBe(100);
  });
});
