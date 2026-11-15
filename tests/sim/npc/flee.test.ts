// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `setEvasiveJink`, performFlee's entry and `behaviour_flee_target` against
 * Oolite's rules (AI-01, plan 14-13; the evasive behaviours are in
 * `evasive.test.ts`).
 * Expected values are derived by hand from the cited `ShipEntity.m` and
 * `ShipEntityAI.m` lines, never from running the implementation; the
 * independent oracle fixtures run in `pursuit.oracle.test.ts`.
 *
 * Frame: Wegolite's local forward is -Z, right +X, up +Y; the identity
 * orientation has the ship facing -Z. `steer.jink` is Oolite's jink with z
 * negated (plan 14-12).
 */

import { describe, expect, it } from "vitest";

import { identity, quat, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import type { AiEventName } from "../../../src/sim/ai/types.js";
import { behaviourFleeTarget } from "../../../src/sim/npc/behaviours/flee.js";
import type { SteerContext } from "../../../src/sim/npc/dispatch.js";
import { completeEntry, enterBehaviour } from "../../../src/sim/npc/enter.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import { setEvasiveJink } from "../../../src/sim/npc/track.js";
import type { Entity } from "../../../src/sim/world/entity.js";
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

/** A half turn about Y: the target's forward (-Z) points along +Z, at a ship at the origin. */
const FACING_ORIGIN: Quat = quat(0, 0, 1, 0);

function ship(accuracy = 2): Entity {
  const result = spawnEntity(
    createWorld(1),
    {
      kind: "ship",
      specKey: "t",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 10,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  result.entity.steer.accuracy = accuracy;
  return result.entity;
}

function body(
  id: number,
  position: Vec3,
  radius: number,
  orientation: Quat = identity(),
): RunnerBody {
  return {
    id,
    kind: "ship",
    scanClass: "CLASS_NEUTRAL",
    radius,
    mass: 0,
    position,
    orientation,
    speed: 0,
    behaviour: "IDLE",
    targetId: 0,
  };
}

interface Captured {
  readonly ctx: SteerContext;
  readonly events: { name: AiEventName; a?: number }[];
  readonly draws: () => number;
}

/** A context whose draws are `values` in order; a draw past the end throws. */
function contextFor(
  entity: Entity,
  bodies: readonly RunnerBody[],
  values: readonly number[] = [],
): Captured {
  const events: { name: AiEventName; a?: number }[] = [];
  let used = 0;
  return {
    events,
    draws: () => used,
    ctx: {
      view: createSyntheticView(bodies, entity, 1),
      stats: STATS,
      dt: DT,
      draw: () => {
        const value = values[used];
        if (value === undefined) throw new Error("an unscripted draw");
        used += 1;
        return value;
      },
      emit: (event) => {
        events.push(event.a === undefined ? { name: event.name } : event);
      },
    },
  };
}

describe("setEvasiveJink (ShipEntity.m:8980-9001)", () => {
  it("is the zero jink below COMBAT_AI_ISNT_AWFUL and draws nothing", () => {
    const entity = ship(-0.5);
    entity.steer.jink = vec(5, 6, 7);
    const c = contextFor(entity, []);
    setEvasiveJink(entity, c.ctx, 400);
    expect(entity.steer.jink).toEqual(vec(0, 0, 0));
    expect(c.draws()).toBe(0);
  });

  it("draws x then y in [-128, 128), pushes each 128 away from zero and stores z negated", () => {
    // u = 0.5 -> floor(128) = 128 -> x = 0 -> not below 0 -> +128 = 128
    // u = 0   -> floor(0)   = 0   -> y = -128 -> below 0 -> -128 = -256
    const entity = ship(0);
    const c = contextFor(entity, [], [0.5, 0]);
    setEvasiveJink(entity, c.ctx, 400);
    expect(entity.steer.jink).toEqual(vec(128, -256, -400));
    expect(c.draws()).toBe(2);
  });

  it("takes the first draw for x and the second for y", () => {
    // 0.75 -> 192 -> 64 -> 192; 0.25 -> 64 -> -64 -> -192
    const entity = ship(3);
    setEvasiveJink(entity, contextFor(entity, [], [0.75, 0.25]).ctx, 1000);
    expect(entity.steer.jink).toEqual(vec(192, -192, -1000));
  });

  it("a draw just below 0.5 gives a negative x, at 0.5 a positive one", () => {
    // 127/256 = 0.49609375 -> 127 -> -1 -> -129; 128/256 -> 0 -> 128
    const below = ship(0);
    setEvasiveJink(
      below,
      contextFor(below, [], [127 / 256, 128 / 256]).ctx,
      400,
    );
    expect(below.steer.jink).toEqual(vec(-129, 128, -400));
  });
});

describe("performFlee's entry (ShipEntityAI.m:379-392)", () => {
  it("sets FLEE_TARGET, frustration 0 and a pending entry at once", () => {
    const entity = ship();
    entity.nav.behaviour = "IDLE";
    entity.steer.frustration = Math.fround(4);
    enterBehaviour(entity, "FLEE_TARGET");
    expect(entity.nav.behaviour).toBe("FLEE_TARGET");
    expect(entity.steer.frustration).toBe(0);
    expect(entity.steer.entryPending).toBe(true);
  });

  it("while FLEE_EVASIVE_ACTION changes nothing and clears an earlier pending entry (the guard, 381)", () => {
    const entity = ship();
    entity.nav.behaviour = "FLEE_EVASIVE_ACTION";
    entity.steer.frustration = Math.fround(0.25);
    entity.steer.entryPending = true; // left by an earlier perform of the same think
    enterBehaviour(entity, "FLEE_TARGET");
    expect(entity.nav.behaviour).toBe("FLEE_EVASIVE_ACTION");
    expect(entity.steer.frustration).toBe(Math.fround(0.25));
    expect(entity.steer.entryPending).toBe(false);
  });

  it("completes with the jink alone when the target is not aiming at the ship", () => {
    const entity = ship(2);
    entity.nav.targetId = TARGET_ID;
    // identity orientation: the target faces -Z, away from the ship at the origin
    const bodies = [body(TARGET_ID, vec(0, 0, -1000), 50)];
    enterBehaviour(entity, "FLEE_TARGET");
    const c = contextFor(entity, bodies, [0.5, 0]);
    completeEntry(entity, c.ctx);
    expect(entity.nav.behaviour).toBe("FLEE_TARGET");
    expect(entity.steer.jink).toEqual(vec(128, -256, -400));
    expect(c.draws()).toBe(2);
    expect(entity.steer.entryPending).toBe(false);
  });

  it("with the target aiming straight at the ship, one more draw below 0.15 picks EVASIVE_ACTION", () => {
    const entity = ship(2);
    entity.nav.targetId = TARGET_ID;
    const bodies = [body(TARGET_ID, vec(0, 0, -1000), 50, FACING_ORIGIN)];
    enterBehaviour(entity, "FLEE_TARGET");
    const c = contextFor(entity, bodies, [0.5, 0, 0.1499]);
    completeEntry(entity, c.ctx);
    expect(c.draws()).toBe(3);
    expect(entity.nav.behaviour).toBe("EVASIVE_ACTION");
  });

  it("and a draw of 0.15 or more picks FLEE_EVASIVE_ACTION", () => {
    const entity = ship(2);
    entity.nav.targetId = TARGET_ID;
    const bodies = [body(TARGET_ID, vec(0, 0, -1000), 50, FACING_ORIGIN)];
    enterBehaviour(entity, "FLEE_TARGET");
    const c = contextFor(entity, bodies, [0.5, 0, 0.15]);
    completeEntry(entity, c.ctx);
    expect(c.draws()).toBe(3);
    expect(entity.nav.behaviour).toBe("FLEE_EVASIVE_ACTION");
  });

  it("accuracy exactly 0 still takes the jink but not the evasive draw (`accuracy > 0`, 385)", () => {
    const entity = ship(0);
    entity.nav.targetId = TARGET_ID;
    const bodies = [body(TARGET_ID, vec(0, 0, -1000), 50, FACING_ORIGIN)];
    enterBehaviour(entity, "FLEE_TARGET");
    const c = contextFor(entity, bodies, [0.5, 0]);
    completeEntry(entity, c.ctx);
    expect(c.draws()).toBe(2);
    expect(entity.nav.behaviour).toBe("FLEE_TARGET");
  });

  it("accuracy below 0 draws nothing and keeps the zero jink", () => {
    const entity = ship(-1);
    entity.nav.targetId = TARGET_ID;
    const bodies = [body(TARGET_ID, vec(0, 0, -1000), 50, FACING_ORIGIN)];
    enterBehaviour(entity, "FLEE_TARGET");
    const c = contextFor(entity, bodies);
    completeEntry(entity, c.ctx);
    expect(c.draws()).toBe(0);
    expect(entity.steer.jink).toEqual(vec(0, 0, 0));
    expect(entity.nav.behaviour).toBe("FLEE_TARGET");
  });

  it("an aspect of exactly 0.9995 does not choose (`> 0.9995`, 387)", () => {
    // The target 1000 m away faces +Z, at the origin; the cosine between its
    // axis and the direction to the ship is 1000 / hypot(1000, offset).
    const entity = ship(2);
    entity.position = vec(40, 0, 0); // sin = 0.04 -> cos 0.99920 < 0.9995
    entity.nav.targetId = TARGET_ID;
    const bodies = [body(TARGET_ID, vec(0, 0, -1000), 50, FACING_ORIGIN)];
    enterBehaviour(entity, "FLEE_TARGET");
    const outside = contextFor(entity, bodies, [0.5, 0]);
    completeEntry(entity, outside.ctx);
    expect(outside.draws()).toBe(2);
    expect(entity.nav.behaviour).toBe("FLEE_TARGET");

    const inside = ship(2);
    inside.position = vec(10, 0, 0); // sin ~ 0.01 -> cos 0.99995 > 0.9995
    inside.nav.targetId = TARGET_ID;
    enterBehaviour(inside, "FLEE_TARGET");
    const c = contextFor(inside, bodies, [0.5, 0, 0.9]);
    completeEntry(inside, c.ctx);
    expect(c.draws()).toBe(3);
    expect(inside.nav.behaviour).toBe("FLEE_EVASIVE_ACTION");
  });
});

describe("behaviour_flee_target (ShipEntity.m:4840-4901)", () => {
  function fleeing(
    distance: number,
    desiredRange: number,
  ): {
    entity: Entity;
    bodies: RunnerBody[];
  } {
    const entity = ship(2);
    entity.nav.behaviour = "FLEE_TARGET";
    entity.nav.targetId = TARGET_ID;
    entity.nav.desiredRange = desiredRange;
    entity.nav.desiredSpeed = 7;
    entity.steer.jink = vec(128, 128, -400); // a jink already set: no draw
    return {
      entity,
      bodies: [body(TARGET_ID, vec(0, 0, -distance), 50)],
    };
  }

  it("runs at maxFlightSpeed while the range is inside the desired range (4857)", () => {
    // range = 1000 - 50 - 10 = 940 <= 1000
    const { entity, bodies } = fleeing(1000, 1000);
    behaviourFleeTarget(entity, contextFor(entity, bodies).ctx);
    expect(entity.nav.desiredSpeed).toBe(160);
  });

  it("leaves the desired speed alone beyond the desired range (REACHED_SAFETY, 4855)", () => {
    const { entity, bodies } = fleeing(1000, 900); // range 940 > 900
    const c = contextFor(entity, bodies);
    behaviourFleeTarget(entity, c.ctx);
    expect(entity.nav.desiredSpeed).toBe(7);
    expect(c.events).toEqual([]); // REACHED_SAFETY is plist-only and not posted
  });

  it("counts a range of exactly 0 as safety and a negative range as not (4855)", () => {
    const touching = fleeing(60, 1000); // 60 - 50 - 10 = 0
    behaviourFleeTarget(
      touching.entity,
      contextFor(touching.entity, touching.bodies).ctx,
    );
    expect(touching.entity.nav.desiredSpeed).toBe(7);

    const overlapping = fleeing(50, 1000); // 50 - 50 - 10 = -10
    behaviourFleeTarget(
      overlapping.entity,
      contextFor(overlapping.entity, overlapping.bodies).ctx,
    );
    expect(overlapping.entity.nav.desiredSpeed).toBe(160);
  });

  it("stores the range as the next last range, as a float32 (4851-4852)", () => {
    const { entity, bodies } = fleeing(1000.3, 1000);
    behaviourFleeTarget(entity, contextFor(entity, bodies).ctx);
    expect(entity.steer.successFactor).toBe(Math.fround(940.3));
  });

  it("relieves frustration by 0.25 dt while the range grows, never below 0 (4860-4864)", () => {
    const { entity, bodies } = fleeing(1000, 1000);
    entity.steer.successFactor = Math.fround(900); // 940 > 900: improvement
    entity.steer.frustration = Math.fround(2);
    behaviourFleeTarget(entity, contextFor(entity, bodies).ctx);
    expect(entity.steer.frustration).toBe(Math.fround(2 - 0.25 * DT));

    entity.steer.successFactor = Math.fround(900);
    entity.steer.frustration = Math.fround(0.001);
    behaviourFleeTarget(entity, contextFor(entity, bodies).ctx);
    expect(entity.steer.frustration).toBe(0);
  });

  it("adds dt while the range does not grow, and past 15 s posts shipAIFrustrated and resets (4865-4871)", () => {
    const { entity, bodies } = fleeing(1000, 1000);
    entity.steer.successFactor = Math.fround(5000); // 940 <= 5000
    entity.steer.frustration = Math.fround(3);
    const c = contextFor(entity, bodies);
    behaviourFleeTarget(entity, c.ctx);
    expect(entity.steer.frustration).toBe(Math.fround(3 + DT));
    expect(c.events).toEqual([]);

    entity.steer.successFactor = Math.fround(5000);
    entity.steer.frustration = Math.fround(15);
    const d = contextFor(entity, bodies);
    behaviourFleeTarget(entity, d.ctx);
    expect(d.events).toEqual([{ name: "shipAIFrustrated" }]);
    expect(entity.steer.frustration).toBe(0);
  });

  it("a gone target goes idle with shipTargetLost and does not steer (4844-4847)", () => {
    const { entity } = fleeing(1000, 1000);
    const c = contextFor(entity, []);
    behaviourFleeTarget(entity, c.ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.nav.targetId).toBe(0);
    expect(c.events).toEqual([{ name: "shipTargetLost" }]);
    expect(entity.nav.desiredSpeed).toBe(7);
  });

  it("steers through trackPrimaryTarget with the retreat jink: a target dead ahead is fled by pitching over", () => {
    // Zero jink and accuracy 2 (below COMBAT_AI_FLEES_BETTER): relPos is the
    // direction to the target, d_forward = 1, so reverse * d_forward = -1 <
    // -0.5 starts the pitch-over (9158).
    const { entity, bodies } = fleeing(1000, 1000);
    entity.steer.jink = vec(0, 0, 0);
    behaviourFleeTarget(entity, contextFor(entity, bodies).ctx);
    expect(entity.steer.pitchingOver).toBe(true);
  });

  it("an accuracy of 6 with a zero jink draws the 400 jink inside the update (9096-9098)", () => {
    const { entity, bodies } = fleeing(1000, 1000);
    entity.steer.accuracy = 6;
    entity.steer.jink = vec(0, 0, 0);
    const c = contextFor(entity, bodies, [0.5, 0]);
    behaviourFleeTarget(entity, c.ctx);
    expect(c.draws()).toBe(2);
    expect(entity.steer.jink).toEqual(vec(128, -256, -400));
  });

  it("an accuracy of 6 with a nonzero jink draws nothing", () => {
    const { entity, bodies } = fleeing(1000, 1000);
    entity.steer.accuracy = 6;
    const c = contextFor(entity, bodies);
    behaviourFleeTarget(entity, c.ctx);
    expect(c.draws()).toBe(0);
  });

  it("accuracy below 6 never draws a jink inside the update", () => {
    const { entity, bodies } = fleeing(1000, 1000);
    entity.steer.accuracy = 5.9;
    entity.steer.jink = vec(0, 0, 0);
    const c = contextFor(entity, bodies);
    behaviourFleeTarget(entity, c.ctx);
    expect(c.draws()).toBe(0);
    expect(entity.steer.jink).toEqual(vec(0, 0, 0));
  });

  it("RUNNING_DEFENSE never takes the zero-jink correction (9096)", () => {
    const { entity, bodies } = fleeing(1000, 1000);
    entity.nav.behaviour = "RUNNING_DEFENSE";
    entity.steer.accuracy = 6;
    entity.steer.jink = vec(0, 0, 0);
    const c = contextFor(entity, bodies);
    // not reachable through the dispatcher; the flee behaviour is called
    // directly with RUNNING_DEFENSE to pin the condition
    behaviourFleeTarget(entity, c.ctx);
    expect(c.draws()).toBe(0);
  });

  it("turns away from an alert that is not the target, from accuracy 0 up (4898-4899)", () => {
    const { entity, bodies } = fleeing(1000, 1000);
    entity.steer.proximityAlert = OTHER_ID;
    const all = [...bodies, body(OTHER_ID, vec(100, 0, 0), 30)];
    behaviourFleeTarget(entity, contextFor(entity, all).ctx);
    expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(entity.steer.saved?.behaviour).toBe("FLEE_TARGET");

    const awful = fleeing(1000, 1000);
    awful.entity.steer.accuracy = -0.5;
    awful.entity.steer.proximityAlert = OTHER_ID;
    behaviourFleeTarget(
      awful.entity,
      contextFor(awful.entity, [
        ...awful.bodies,
        body(OTHER_ID, vec(100, 0, 0), 30),
      ]).ctx,
    );
    expect(awful.entity.nav.behaviour).toBe("FLEE_TARGET");

    const ignoring = fleeing(1000, 1000);
    ignoring.entity.steer.proximityAlert = TARGET_ID;
    behaviourFleeTarget(
      ignoring.entity,
      contextFor(ignoring.entity, ignoring.bodies).ctx,
    );
    expect(ignoring.entity.nav.behaviour).toBe("FLEE_TARGET");
  });
});
