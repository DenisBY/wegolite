// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `evasiveAction:` and `behaviour_evasive_action:` against Oolite's rules
 * (AI-01, plan 14-13). Expected values are derived by hand from the cited
 * `ShipEntity.m` lines, never from running the implementation; the independent
 * oracle fixtures run in `pursuit.oracle.test.ts`.
 *
 * Frame: Wegolite's local forward is -Z, right +X, up +Y; the identity
 * orientation has the ship facing -Z. `steer.jink` is Oolite's jink with z
 * negated (plan 14-12).
 */

import { describe, expect, it } from "vitest";

import { identity, quat, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import type { AiEventName } from "../../../src/sim/ai/types.js";
import { behaviourEvasiveAction } from "../../../src/sim/npc/behaviours/evasive.js";
import { steerShip } from "../../../src/sim/npc/dispatch.js";
import type { SteerContext } from "../../../src/sim/npc/dispatch.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import { evasiveAction } from "../../../src/sim/npc/track.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import { createSyntheticView } from "./oracle-runner.js";
import type { RunnerBody } from "./oracle-runner.js";

const DT = 1 / 120;
const TARGET_ID = 102;

const STATS: NpcFlightStats = {
  specKey: "t",
  maxFlightSpeed: 160,
  maxFlightRoll: 2,
  maxFlightPitch: 1,
  thrust: 15,
  mass: 0,
  forwardWeapon: "EQ_WEAPON_NONE",
};

/** A quarter turn about Y: the target's right vector is (0, 0, -1). */
const QUARTER_TURN: Quat = quat(Math.SQRT1_2, 0, Math.SQRT1_2, 0);

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

describe("evasiveAction (ShipEntity.m:9003-9032)", () => {
  function evading(
    targetOrientation: Quat,
    flightRoll: number,
    flightPitch: number,
  ): { entity: Entity; bodies: RunnerBody[] } {
    const entity = ship(2);
    entity.nav.targetId = TARGET_ID;
    entity.steer.flightRoll = flightRoll;
    entity.steer.flightPitch = flightPitch;
    return {
      entity,
      bodies: [body(TARGET_ID, vec(0, 0, -1000), 50, targetOrientation)],
    };
  }

  it("rolls at the full rate in the direction it already rolls unless the right vectors are nearly orthogonal, and pitches at the full rate in the same way", () => {
    // identical orientations: agreement 1, outside (-0.3, 0.3)
    const a = evading(identity(), 0.3, -0.2);
    evasiveAction(a.entity, contextFor(a.entity, a.bodies).ctx);
    expect(a.entity.steer.stickRoll).toBe(2);
    expect(a.entity.steer.stickPitch).toBe(-1);

    const b = evading(identity(), -0.1, 0.2);
    evasiveAction(b.entity, contextFor(b.entity, b.bodies).ctx);
    expect(b.entity.steer.stickRoll).toBe(-2);
    expect(b.entity.steer.stickPitch).toBe(1);

    // a rate of exactly 0 counts as non-negative
    const c = evading(identity(), 0, 0);
    evasiveAction(c.entity, contextFor(c.entity, c.bodies).ctx);
    expect(c.entity.steer.stickRoll).toBe(2);
    expect(c.entity.steer.stickPitch).toBe(1);
  });

  it("does not roll while the right vectors agree within (-0.3, 0.3)", () => {
    // a quarter turn about Y puts the target's right on (0, 0, -1): agreement 0
    const a = evading(QUARTER_TURN, 0.3, 0.2);
    evasiveAction(a.entity, contextFor(a.entity, a.bodies).ctx);
    expect(a.entity.steer.stickRoll).toBe(0);
    expect(a.entity.steer.stickPitch).toBe(1);
  });

  it("applies the sticks: the roll rate moves toward the stick by 2 dt (7021)", () => {
    const a = evading(identity(), 0, 0);
    evasiveAction(a.entity, contextFor(a.entity, a.bodies).ctx);
    expect(a.entity.steer.flightRoll).toBeCloseTo(2 * DT, 12);
    expect(a.entity.steer.flightPitch).toBeCloseTo(4 * DT, 12);
  });

  it("a gone target posts shipTargetLost and goes idle, leaving the sticks at the rates (9010-9013)", () => {
    const a = evading(identity(), 0.3, -0.2);
    const c = contextFor(a.entity, []);
    evasiveAction(a.entity, c.ctx);
    expect(c.events).toEqual([{ name: "shipTargetLost" }]);
    expect(a.entity.nav.behaviour).toBe("IDLE");
    expect(a.entity.steer.stickRoll).toBe(0.3);
    expect(a.entity.steer.stickPitch).toBe(-0.2);
  });
});

describe("behaviour_evasive_action (ShipEntity.m:3996-4036)", () => {
  function evasive(behaviour: "EVASIVE_ACTION" | "FLEE_EVASIVE_ACTION"): {
    entity: Entity;
    bodies: RunnerBody[];
  } {
    const entity = ship(2);
    entity.nav.behaviour = behaviour;
    entity.nav.targetId = TARGET_ID;
    entity.nav.desiredSpeed = 3;
    return {
      entity,
      bodies: [body(TARGET_ID, vec(0, 0, -1000), 50)],
    };
  }

  it("runs at maxFlightSpeed and adds dt to the frustration (3999-4020)", () => {
    const { entity, bodies } = evasive("EVASIVE_ACTION");
    behaviourEvasiveAction(entity, contextFor(entity, bodies).ctx);
    expect(entity.nav.desiredSpeed).toBe(160);
    expect(entity.steer.frustration).toBe(Math.fround(DT));
    expect(entity.nav.behaviour).toBe("EVASIVE_ACTION");
  });

  it("after 0.5 s EVASIVE_ACTION goes to ATTACK_TARGET (4021-4028)", () => {
    const { entity, bodies } = evasive("EVASIVE_ACTION");
    entity.steer.frustration = Math.fround(0.5);
    const c = contextFor(entity, bodies);
    behaviourEvasiveAction(entity, c.ctx);
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(c.draws()).toBe(0);
  });

  it("after 0.5 s FLEE_EVASIVE_ACTION draws a new 400 jink and returns to FLEE_TARGET (4023-4026)", () => {
    const { entity, bodies } = evasive("FLEE_EVASIVE_ACTION");
    entity.steer.frustration = Math.fround(0.5);
    const c = contextFor(entity, bodies, [0.5, 0]);
    behaviourEvasiveAction(entity, c.ctx);
    expect(entity.nav.behaviour).toBe("FLEE_TARGET");
    expect(entity.steer.jink).toEqual(vec(128, -256, -400));
    expect(c.draws()).toBe(2);
  });

  it("stays put while the frustration is not above 0.5", () => {
    const { entity, bodies } = evasive("FLEE_EVASIVE_ACTION");
    entity.steer.frustration = Math.fround(0.4);
    behaviourEvasiveAction(entity, contextFor(entity, bodies).ctx);
    expect(entity.nav.behaviour).toBe("FLEE_EVASIVE_ACTION");
  });

  it("with an alert (the target not ignored) avoids the collision and returns before evasiveAction (4013-4016)", () => {
    const { entity, bodies } = evasive("EVASIVE_ACTION");
    entity.steer.proximityAlert = TARGET_ID; // even the primary target counts
    entity.steer.frustration = Math.fround(0.25);
    entity.steer.stickRoll = 0.7;
    behaviourEvasiveAction(entity, contextFor(entity, bodies).ctx);
    expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(entity.steer.saved?.behaviour).toBe("EVASIVE_ACTION");
    expect(entity.steer.frustration).toBe(Math.fround(0.25)); // not bumped
    expect(entity.steer.stickRoll).toBe(0.7); // evasiveAction did not run
    expect(entity.nav.desiredSpeed).toBe(160);
  });

  it("a gone target posts shipTargetLost and goes idle (the frustration restarts at dt)", () => {
    const { entity } = evasive("EVASIVE_ACTION");
    entity.steer.frustration = Math.fround(0.3);
    const c = contextFor(entity, []);
    behaviourEvasiveAction(entity, c.ctx);
    expect(c.events).toEqual([{ name: "shipTargetLost" }]);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.steer.frustration).toBe(Math.fround(DT));
  });
});

describe("the 0.5 s hand-over through steerShip (ShipEntity.m:4021-4028)", () => {
  // The float32 frustration crosses 0.5 on update 61 (steering contract: 0.5 s
  // at tick 61), so a ship that starts at 0 keeps its evasive behaviour for 60
  // updates and hands over on the 61st.
  function runUpdates(
    behaviour: "EVASIVE_ACTION" | "FLEE_EVASIVE_ACTION",
    updates: number,
  ): { entity: Entity; used: () => number } {
    const entity = ship(2);
    entity.nav.behaviour = behaviour;
    entity.nav.targetId = TARGET_ID;
    const bodies = [body(TARGET_ID, vec(0, 0, -1000), 50)];
    const scripted = [0.5, 0];
    let used = 0;
    for (let tick = 1; tick <= updates; tick += 1) {
      steerShip(entity, {
        view: createSyntheticView(bodies, entity, tick),
        stats: STATS,
        dt: DT,
        draw: () => {
          const value = scripted[used];
          if (value === undefined) throw new Error("an unscripted draw");
          used += 1;
          return value;
        },
        emit: () => {},
      });
    }
    return { entity, used: () => used };
  }

  it("FLEE_EVASIVE_ACTION returns to FLEE_TARGET on update 61 with a new 400 jink", () => {
    const before = runUpdates("FLEE_EVASIVE_ACTION", 60);
    expect(before.entity.nav.behaviour).toBe("FLEE_EVASIVE_ACTION");
    expect(before.used()).toBe(0);
    const after = runUpdates("FLEE_EVASIVE_ACTION", 61);
    expect(after.entity.nav.behaviour).toBe("FLEE_TARGET");
    expect(after.used()).toBe(2);
    expect(after.entity.steer.jink).toEqual(vec(128, -256, -400));
  });

  it("EVASIVE_ACTION goes to ATTACK_TARGET on update 61 and draws nothing", () => {
    expect(runUpdates("EVASIVE_ACTION", 60).entity.nav.behaviour).toBe(
      "EVASIVE_ACTION",
    );
    const after = runUpdates("EVASIVE_ACTION", 61);
    expect(after.entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(after.used()).toBe(0);
  });
});
