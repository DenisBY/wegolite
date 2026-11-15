// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Target sensing, `trackPrimaryTarget` and intercept against Oolite's rules
 * (AI-01, plan 14-12). Expected values are derived by hand from the cited
 * `ShipEntity.m` lines, never from running the implementation; the independent
 * oracle fixtures are run by `pursuit.oracle.test.ts`.
 *
 * Frame: Wegolite's local forward is -Z, right +X, up +Y; the identity
 * orientation has the ship facing -Z.
 */

import { describe, expect, it } from "vitest";

import { identity, quat, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import type { AiEventName } from "../../../src/sim/ai/types.js";
import { behaviourInterceptTarget } from "../../../src/sim/npc/behaviours/intercept.js";
import type { SteerContext } from "../../../src/sim/npc/dispatch.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import {
  approachAspectToPrimaryTarget,
  canStillTrackPrimaryTarget,
  currentAimTolerance,
  noteLostTargetAndGoIdle,
  rangeToPrimaryTarget,
  targetBody,
} from "../../../src/sim/npc/target.js";
import { trackPrimaryTarget } from "../../../src/sim/npc/track.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import type { BodyKind } from "../../../src/sim/world/ids.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
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

function ship(accuracy = 2, radius = 10): Entity {
  const result = spawnEntity(
    createWorld(1),
    {
      kind: "ship",
      specKey: "t",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  result.entity.steer.accuracy = accuracy;
  return result.entity;
}

function body(
  position: Vec3,
  options: {
    id?: number;
    kind?: BodyKind;
    radius?: number;
    orientation?: Quat;
  } = {},
): RunnerBody {
  return {
    id: options.id ?? TARGET_ID,
    kind: options.kind ?? "ship",
    scanClass: "CLASS_NEUTRAL",
    radius: options.radius ?? 50,
    mass: 0,
    position,
    orientation: options.orientation ?? identity(),
    speed: 0,
    behaviour: "IDLE",
    targetId: 0,
  };
}

interface Captured {
  readonly ctx: SteerContext;
  readonly events: { name: AiEventName; a?: number }[];
}

function contextFor(
  entity: Entity,
  bodies: readonly RunnerBody[],
  stats: NpcFlightStats = STATS,
): Captured {
  const events: { name: AiEventName; a?: number }[] = [];
  return {
    events,
    ctx: {
      view: createSyntheticView(bodies, entity, 1),
      stats,
      dt: DT,
      draw: () => {
        throw new Error("no draw expected");
      },
      emit: (event) => {
        events.push(event.a === undefined ? { name: event.name } : event);
      },
    },
  };
}

/** A ship at the origin targeting a body at `position`. */
function pursuit(
  position: Vec3,
  options: Parameters<typeof body>[1] = {},
  accuracy = 2,
): { entity: Entity; bodies: RunnerBody[] } {
  const entity = ship(accuracy);
  const target = body(position, options);
  entity.nav.targetId = target.id;
  return { entity, bodies: [target] };
}

describe("targetBody (isValidTarget, ShipEntity.m:8638-8656; primaryTarget, 8724-8730)", () => {
  it("returns the live body for a ship, a station and the player", () => {
    for (const kind of ["ship", "station", "player", "cargo"] as const) {
      const { entity, bodies } = pursuit(vec(0, 0, -100), { kind });
      expect(
        targetBody(entity, contextFor(entity, bodies).ctx.view)?.kind,
      ).toBe(kind);
    }
  });

  it("is undefined for no target, an unknown id, a planet and the sun", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -100));
    const view = contextFor(entity, bodies).ctx.view;
    entity.nav.targetId = 0;
    expect(targetBody(entity, view)).toBeUndefined();
    entity.nav.targetId = 999;
    expect(targetBody(entity, view)).toBeUndefined();
    for (const kind of ["planet", "sun"] as const) {
      const other = pursuit(vec(0, 0, -100), { kind });
      expect(
        targetBody(
          other.entity,
          contextFor(other.entity, other.bodies).ctx.view,
        ),
      ).toBeUndefined();
    }
  });

  it("is undefined when the id is the ship's own", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -100));
    entity.nav.targetId = entity.id;
    expect(
      targetBody(entity, contextFor(entity, bodies).ctx.view),
    ).toBeUndefined();
  });
});

describe("range and aspect (ShipEntity.m:9718-9749)", () => {
  it("the range is the centre distance minus both radii (9727-9732)", () => {
    // 1000 - target 50 - self 10 = 940.
    const { entity, bodies } = pursuit(vec(0, 0, -1000));
    expect(rangeToPrimaryTarget(entity, contextFor(entity, bodies).ctx)).toBe(
      940,
    );
  });

  it("the range is 0 for no valid target (9727)", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -1000));
    entity.nav.targetId = 0;
    expect(rangeToPrimaryTarget(entity, contextFor(entity, bodies).ctx)).toBe(
      0,
    );
  });

  it("the range goes negative for overlapping radii (no clamp in Oolite)", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -30));
    expect(rangeToPrimaryTarget(entity, contextFor(entity, bodies).ctx)).toBe(
      -30,
    );
  });

  it("the aspect is the cosine between the target's forward and the direction to this ship (9736-9749)", () => {
    // The target at (0, 0, -1000) faces -Z (identity): away from the ship at the
    // origin. delta = ship - target = (0, 0, 1000), normalised (0, 0, 1); the
    // target's forward is (0, 0, -1): -1. Turned half a turn about Y it faces
    // the ship: +1.
    const away = pursuit(vec(0, 0, -1000));
    expect(
      approachAspectToPrimaryTarget(
        away.entity,
        contextFor(away.entity, away.bodies).ctx,
      ),
    ).toBeCloseTo(-1, 12);
    const toward = pursuit(vec(0, 0, -1000), { orientation: quat(0, 0, 1, 0) });
    expect(
      approachAspectToPrimaryTarget(
        toward.entity,
        contextFor(toward.entity, toward.bodies).ctx,
      ),
    ).toBeCloseTo(1, 12);
  });

  it("the aspect is 0 for coincident centres (vector_normal of zero is zero), a planet and no target", () => {
    const same = pursuit(vec(0, 0, 0));
    expect(
      approachAspectToPrimaryTarget(
        same.entity,
        contextFor(same.entity, same.bodies).ctx,
      ),
    ).toBe(0);
    const planet = pursuit(vec(0, 0, -1000), { kind: "planet" });
    expect(
      approachAspectToPrimaryTarget(
        planet.entity,
        contextFor(planet.entity, planet.bodies).ctx,
      ),
    ).toBe(0);
  });
});

describe("canStillTrackPrimaryTarget (ShipEntity.m:8696-8715)", () => {
  it("accepts a target up to 1.25 scanner ranges (32000 m) and refuses beyond", () => {
    const edge = pursuit(vec(0, 0, -32000));
    expect(
      canStillTrackPrimaryTarget(
        edge.entity,
        contextFor(edge.entity, edge.bodies).ctx,
      ),
    ).toBe(true);
    const beyond = pursuit(vec(0, 0, -32001));
    expect(
      canStillTrackPrimaryTarget(
        beyond.entity,
        contextFor(beyond.entity, beyond.bodies).ctx,
      ),
    ).toBe(false);
  });

  it("refuses a gone, planet or self target", () => {
    const gone = pursuit(vec(0, 0, -100));
    gone.entity.nav.targetId = 777;
    expect(
      canStillTrackPrimaryTarget(
        gone.entity,
        contextFor(gone.entity, gone.bodies).ctx,
      ),
    ).toBe(false);
    const planet = pursuit(vec(0, 0, -100), { kind: "planet" });
    expect(
      canStillTrackPrimaryTarget(
        planet.entity,
        contextFor(planet.entity, planet.bodies).ctx,
      ),
    ).toBe(false);
  });
});

describe("currentAimTolerance (ShipEntity.m:9759-9810, setAccuracy 1138)", () => {
  function tolerance(accuracy: number): number {
    return currentAimTolerance(ship(accuracy));
  }

  it("is sqrt(1 - aim^2 / 1e8) with aim = 240 - 18 * accuracy", () => {
    // accuracy 2: aim 204; accuracy -5: aim 330; accuracy 0: aim 240.
    expect(tolerance(2)).toBeCloseTo(Math.sqrt(1 - 41616 / 1e8), 14);
    expect(tolerance(-5)).toBeCloseTo(Math.sqrt(1 - 108900 / 1e8), 14);
    expect(tolerance(0)).toBeCloseTo(Math.sqrt(1 - 57600 / 1e8), 14);
  });

  it("a deadly pilot (accuracy >= 7.5) has the aim circle divided by 5", () => {
    // accuracy 7.5: aim (240 - 135) / 5 = 21; accuracy 10: (240 - 180) / 5 = 12.
    expect(tolerance(7.5)).toBeCloseTo(Math.sqrt(1 - 441 / 1e8), 14);
    expect(tolerance(10)).toBeCloseTo(Math.sqrt(1 - 144 / 1e8), 14);
  });

  it("is capped at the best cosine of the tier (never binds inside the accuracy domain)", () => {
    // Inside -5..10 the largest value is 0.9999928 (accuracy 10), below every
    // cap, so the cap is reached only out of the domain: accuracy 240 / 18 makes
    // the divided aim 0 and the tolerance 1, capped at 0.9999999 (9773).
    expect(tolerance(240 / 18)).toBe(0.9999999);
  });
});

describe("noteLostTargetAndGoIdle (ShipEntity.m:8779-8803)", () => {
  it("goes IDLE with frustration 0, clears the target and posts shipTargetLost carrying the id of a still-valid target", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -40000));
    entity.nav.behaviour = "INTERCEPT_TARGET";
    entity.steer.frustration = 3;
    const captured = contextFor(entity, bodies);
    noteLostTargetAndGoIdle(entity, captured.ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.steer.frustration).toBe(0);
    expect(entity.nav.targetId).toBe(0);
    expect(captured.events).toEqual([{ name: "shipTargetLost", a: TARGET_ID }]);
  });

  it("posts shipTargetLost with no argument for a gone target", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -100));
    entity.nav.targetId = 555;
    const captured = contextFor(entity, bodies);
    noteLostTargetAndGoIdle(entity, captured.ctx);
    expect(captured.events).toEqual([{ name: "shipTargetLost" }]);
    expect(Object.keys(captured.events[0] ?? {})).toEqual(["name"]);
  });

  it("posts it with no argument for a planet", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -100), { kind: "planet" });
    const captured = contextFor(entity, bodies);
    noteLostTargetAndGoIdle(entity, captured.ctx);
    expect(captured.events).toEqual([{ name: "shipTargetLost" }]);
  });
});

describe("trackPrimaryTarget (ShipEntity.m:9034-9244)", () => {
  function track(
    position: Vec3,
    accuracy = 2,
    options: Parameters<typeof body>[1] = {},
    stats: NpcFlightStats = STATS,
    retreat = false,
  ): { entity: Entity; confidence: number; events: Captured["events"] } {
    const { entity, bodies } = pursuit(position, options, accuracy);
    const captured = contextFor(entity, bodies, stats);
    const confidence = trackPrimaryTarget(entity, captured.ctx, retreat);
    return { entity, confidence, events: captured.events };
  }

  it("a target dead ahead is on target: returns the cosine and sets nothing (9149-9151)", () => {
    const { entity, confidence } = track(vec(0, 0, -1000));
    expect(confidence).toBe(1);
    expect(entity.steer.stickRoll).toBe(0);
    expect(entity.steer.stickPitch).toBe(0);
    // applySticks was not called: the rates did not move.
    expect(entity.steer.flightRoll).toBe(0);
    expect(entity.steer.flightPitch).toBe(0);
  });

  it("a target straight above pitches up with the capped factor (9197-9201)", () => {
    // relPos = (0, 0.6, -0.8): d_up 0.6, d_right 0, d_forward 0.8. The roll
    // blocks find factor 0. Pitch: factor = int(sqrt(0.6 / 0.004)) = 12, capped
    // at 8: stick_pitch = -1 * 1 * 0.125 * 8 = -1. No fallback pitch exists in
    // trackPrimaryTarget.
    const { entity, confidence } = track(vec(0, 600, -800));
    expect(entity.steer.stickRoll).toBe(0);
    expect(entity.steer.stickPitch).toBeCloseTo(-1, 12);
    // applySticks: the pitch rate moves one step (4 dt) toward the stick.
    expect(entity.steer.flightPitch).toBeCloseTo(-4 * DT, 12);
    expect(confidence).toBeCloseTo(0.8, 12);
  });

  it("a target exactly abeam gets no turn command, unlike trackDestination (9197-9204)", () => {
    // relPos (1, 0, 0): d_right 1, d_up 0, d_forward 0. d_up is inside +-min_d,
    // so no roll; the pitch factor is int(sqrt(0)) = 0 and there is no 0.01
    // fallback. Both sticks stay 0 and, with the rates at 0, confidence is 1.
    const { entity, confidence } = track(vec(1000, 0, 0));
    expect(entity.steer.stickRoll).toBe(0);
    expect(entity.steer.stickPitch).toBe(0);
    expect(confidence).toBe(1);
  });

  it("rolls first for a target up and to the right and truncates the factor (9178-9183)", () => {
    // relPos = (3, 4, -12) / 13: d_right = 3/13, d_up = 4/13, d_forward 12/13.
    // factor = int(sqrt((3/13) / 0.004)) = int(7.595) = 7 (a rounded factor
    // would be 8): stick_roll = -2 * 0.125 * 7 = -1.75. A nonzero roll skips the
    // pitch block.
    const { entity, confidence } = track(vec(3, 4, -12));
    expect(entity.steer.stickRoll).toBeCloseTo(-1.75, 12);
    expect(entity.steer.stickPitch).toBe(0);
    expect(confidence).toBeCloseTo(12 / 13, 12);
  });

  it("rolls the other way for a target below and to the right (9186-9194)", () => {
    const { entity } = track(vec(3, -4, -12));
    expect(entity.steer.stickRoll).toBeCloseTo(+1.75, 12);
  });

  it("truncates the pitch factor toward zero (9197)", () => {
    // d_up 0.19: sqrt(0.19 / 0.004) = 6.892, factor 6 (rounding gives 7):
    // stick_pitch = -0.75.
    const up = 0.19;
    const { entity } = track(vec(0, up * 1000, -Math.sqrt(1 - up * up) * 1000));
    expect(entity.steer.stickPitch).toBeCloseTo(-0.75, 9);
  });

  it("a target dead astern starts the pitch-over, then the pitch block overwrites the stick (9158-9166, 9173-9174, 9197-9201)", () => {
    // d_forward -1 < -0.5: pitching_over = YES, and with d_up 0 the pitch-over
    // stick is +1; pitching_over stays YES (-1 < 0.707). Then d_forward <
    // -max_cos sets d_up = 2 min_d = 0.008: factor int(sqrt(2)) = 1 and
    // stick_pitch = -1 * 1 * 0.125 * 1 = -0.125, which overwrites the +1.
    const { entity, confidence } = track(vec(0, 0, 1000));
    expect(entity.steer.pitchingOver).toBe(true);
    expect(entity.steer.stickRoll).toBe(0);
    expect(entity.steer.stickPitch).toBeCloseTo(-0.125, 12);
    // d_forward -1 is negative: 0 (9238).
    expect(confidence).toBe(0);
  });

  it("the roll limiter binds only for a fast ship (9208-9210)", () => {
    // maxFlightRoll 8: the first roll step is 0.125 * 8 = 1 rad/s, so
    // |stick| dt = 1/120 = 0.00833 exceeds d_right = 0.006 / n. The target is
    // 0.3 up (off course: cos 0.955 < 0.99979). d_up > min_d: factor =
    // int(sqrt(0.00549 / 0.004)) = 1, stick_roll = -1; then the limiter makes
    // it -(d_right / dt). A nonzero roll skips the pitch block.
    const fast: NpcFlightStats = {
      ...STATS,
      maxFlightRoll: 8,
      maxFlightPitch: 8,
    };
    const { entity } = track(vec(0.006, 0.3, -1), 2, {}, fast);
    const n = Math.sqrt(0.006 * 0.006 + 0.09 + 1);
    expect(entity.steer.stickRoll).toBeCloseTo(-(0.006 / n / DT), 9);
    expect(entity.steer.stickPitch).toBe(0);
  });

  it("the pitch limiter keeps 0.9 of the angle per second (9211-9212)", () => {
    // maxFlightPitch 20, target 0.025 up (off course: cos 0.99969 < 0.99979):
    // factor = int(sqrt(0.024992 / 0.004)) = 2, stick_pitch = -20 * 0.125 * 2 =
    // -5; |d_up| 0.024992 < 5 / 120: stick_pitch = -(d_up / dt) * 0.9.
    const fast: NpcFlightStats = { ...STATS, maxFlightPitch: 20 };
    const { entity } = track(vec(0, 0.025, -1), 2, {}, fast);
    const n = Math.sqrt(0.025 * 0.025 + 1);
    expect(entity.steer.stickPitch).toBeCloseTo(-(0.025 / n / DT) * 0.9, 9);
  });

  it("no limiter below accuracy 0 (9205)", () => {
    const fast: NpcFlightStats = {
      ...STATS,
      maxFlightRoll: 8,
      maxFlightPitch: 8,
    };
    const { entity } = track(vec(0.006, 0.3, -1), -1, {}, fast);
    expect(entity.steer.stickRoll).toBeCloseTo(-1, 12);
  });

  it("a deadly pilot (accuracy 8) uses min_d 0.0004 and the multiplied factor (9126-9133)", () => {
    // maxFlightPitch 2 > 1: max_factor = floor(2 / 0.125) = 16, r_max_factor =
    // 1/16; then x3 and /3: 48 and 1/48. min_d 0.0004. Target (0, 0.6, -0.8):
    // factor = int(sqrt(0.6 / 0.0004)) = int(38.73) = 38 (below 48):
    // stick_pitch = -2 * (1/48) * 38 = -1.58333.
    const stats: NpcFlightStats = { ...STATS, maxFlightPitch: 2 };
    const { entity } = track(vec(0, 600, -800), 8, {}, stats);
    expect(entity.steer.stickPitch).toBeCloseTo(-(2 * 38) / 48, 12);
  });

  it("a deadly pilot with maxFlightPitch 1 keeps max_factor 8 times 3 (9132-9133)", () => {
    // max_factor 24, r_max_factor 0.125 / 3: the same target gives factor
    // min(38, 24) = 24: stick_pitch = -1 * (0.125 / 3) * 24 = -1.
    const { entity } = track(vec(0, 600, -800), 8);
    expect(entity.steer.stickPitch).toBeCloseTo(-1, 12);
  });

  it("a target gone takes noteLostTargetAndGoIdle and returns 0 (9037-9041)", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -100));
    entity.nav.targetId = 888;
    entity.nav.behaviour = "INTERCEPT_TARGET";
    const captured = contextFor(entity, bodies);
    expect(trackPrimaryTarget(entity, captured.ctx, false)).toBe(0);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.nav.targetId).toBe(0);
    expect(captured.events).toEqual([{ name: "shipTargetLost" }]);
  });

  it("a target beyond 1.25 scanner ranges takes the lost-target path with the id (9043-9047)", () => {
    const { entity, confidence, events } = track(vec(0, 0, -33000));
    expect(confidence).toBe(0);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(events).toEqual([{ name: "shipTargetLost", a: TARGET_ID }]);
  });

  it("the ship's own id as the target takes the lost-target path", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -100));
    entity.nav.targetId = entity.id;
    const captured = contextFor(entity, bodies);
    expect(trackPrimaryTarget(entity, captured.ctx, false)).toBe(0);
    expect(captured.events).toEqual([{ name: "shipTargetLost" }]);
  });

  describe("retreat (9062-9106, 9150-9166, 9233-9236)", () => {
    it("flying straight away from the target is on target and returns the raw cosine -1 (9149)", () => {
      // reverse -1 and d_forward -1: -1 * -1 = 1 > max_cos, so the method
      // returns d_forward, which is negative (the squaring at 9233 comes later).
      const { entity, confidence } = track(vec(0, 0, 1000), 2, {}, STATS, true);
      expect(confidence).toBe(-1);
      expect(entity.steer.stickRoll).toBe(0);
    });

    it("the jink offsets the aim point along the target's right and up axes (9103-9104)", () => {
      // Target 5000 ahead, identity orientation (right +X, up +Y). Jink (1000,
      // 1000, 0), accuracy 2 (below 6, so no distance scaling): relPos =
      // (1000, 1000, -5000), |relPos| = sqrt(27e6) = 5196.15: d_right = d_up =
      // 0.19245, d_forward = 0.96225. Retreat reverses: reverse * d_forward =
      // -0.96 < -0.5 starts the pitch-over (reverse * d_up < 0: stick +1). The
      // roll block: d_up > min_d, factor = int(sqrt(0.19245 / 0.004)) = 6,
      // d_right > min_d: stick_roll = -2 * 0.125 * 6 = -1.5. The nonzero roll
      // skips the pitch block, so the pitch-over stick +1 stays.
      const { entity, bodies } = pursuit(vec(0, 0, -5000), { radius: 10 });
      entity.steer.jink = vec(1000, 1000, 0);
      const captured = contextFor(entity, bodies);
      const confidence = trackPrimaryTarget(entity, captured.ctx, true);
      expect(entity.steer.stickRoll).toBeCloseTo(-1.5, 12);
      expect(entity.steer.stickPitch).toBeCloseTo(1, 12);
      expect(entity.steer.pitchingOver).toBe(true);
      // squared cosine: 0.96225^2 = 0.92593
      expect(confidence).toBeCloseTo((5000 / Math.sqrt(27e6)) ** 2, 9);
    });

    it("the offset's z component is unscaled and Oolite's jink.z is minus the stored z (9105)", () => {
      // Accuracy 9: range 5000 > 2000, so x and y scale by 5000 / 2000 * 3 =
      // 7.5. Stored jink (100, 100, -1000), that is Oolite's (100, 100, 1000):
      // x, y offsets 750 each; the z offset is jink.z * v_forward.z = 1000 * -1
      // (the target faces -Z) = -1000, unscaled. relPos = (750, 750, -6000);
      // |relPos| = sqrt(2 * 562500 + 36e6) = 6092.9; d_right = 0.123092;
      // factor = int(sqrt(0.123092 / 0.004)) = int(5.547) = 5:
      // stick_roll = -2 * 0.125 * 5 = -1.25. (A scaled z, 7500, would give
      // 0.0598 and factor 3; a stored z not negated would give z = 0.)
      const { entity, bodies } = pursuit(vec(0, 0, -5000), { radius: 10 }, 9);
      entity.steer.jink = vec(100, 100, -1000);
      const captured = contextFor(entity, bodies);
      trackPrimaryTarget(entity, captured.ctx, true);
      expect(entity.steer.stickRoll).toBeCloseTo(-1.25, 12);
    });

    it("the jink is withheld inside 10 radii when flying toward the target (9078-9085)", () => {
      // Target 50 m ahead (radii 10 and 10): range2 2500 < 10 * 10 * 100 =
      // 10000 and the direction (0, 0, -1) . forward (0, 0, -1) = 1 > -0.1: no
      // jink, so d_right = 0 and no roll. Behind the ship (z +50) the dot is -1
      // and the jink applies: the roll is nonzero.
      const near = pursuit(vec(0, 0, -50), { radius: 10 });
      near.entity.steer.jink = vec(1000, 1000, 0);
      trackPrimaryTarget(
        near.entity,
        contextFor(near.entity, near.bodies).ctx,
        true,
      );
      expect(near.entity.steer.stickRoll).toBe(0);
      const behind = pursuit(vec(0, 0, 50), { radius: 10 });
      behind.entity.steer.jink = vec(1000, 1000, 0);
      trackPrimaryTarget(
        behind.entity,
        contextFor(behind.entity, behind.bodies).ctx,
        true,
      );
      expect(behind.entity.steer.stickRoll).not.toBe(0);
    });

    it("a zero relative position uses the (0, 0, -1) guard on both fallbacks (9081, 9112)", () => {
      // Coincident centres, retreat, jink 0: relPos stays zero, so the direction
      // fallback (0, 0, -1) is not within -0.1 of backward -> avoidCollision =
      // (1 > -0.1) true (range2 0 < 10000), and the aim vector falls back to
      // (0, 0, -1): d_forward = 1; reverse * d_forward = -1 < -0.5 starts the
      // pitch-over.
      const { entity, bodies } = pursuit(vec(0, 0, 0), { radius: 10 });
      trackPrimaryTarget(entity, contextFor(entity, bodies).ctx, true);
      expect(entity.steer.pitchingOver).toBe(true);
    });
  });
});

describe("behaviour_intercept_target (ShipEntity.m:3817-3826)", () => {
  function intercept(
    position: Vec3,
    desiredRange: number,
    options: Parameters<typeof body>[1] = {},
  ): { entity: Entity; events: Captured["events"] } {
    const { entity, bodies } = pursuit(position, options);
    entity.nav.behaviour = "INTERCEPT_TARGET";
    entity.nav.desiredRange = desiredRange;
    const captured = contextFor(entity, bodies);
    behaviourInterceptTarget(entity, captured.ctx);
    return { entity, events: captured.events };
  }

  it("flies at the maximum speed times the confidence (3820, 3825)", () => {
    const { entity, events } = intercept(vec(0, 0, -1000), 100);
    expect(entity.nav.desiredSpeed).toBe(160);
    expect(events).toEqual([]);
  });

  it("scales the speed by the confidence of a target off the nose", () => {
    const { entity } = intercept(vec(0, 600, -800), 100);
    // confidence 0.8, applySticks moved the pitch rate off 0: 160 * 0.8.
    expect(entity.nav.desiredSpeed).toBeCloseTo(128, 9);
  });

  it("posts shipAchievedDesiredRange on every update inside the desired range (3822-3824)", () => {
    // range = 1000 - 50 - 10 = 940 < 1000.
    const first = intercept(vec(0, 0, -1000), 1000);
    expect(first.events).toEqual([{ name: "shipAchievedDesiredRange" }]);
    const second = intercept(vec(0, 0, -1000), 1000);
    expect(second.events).toEqual([{ name: "shipAchievedDesiredRange" }]);
  });

  it("a target that is gone posts shipAchievedDesiredRange, then shipTargetLost, and idles (9727, 9037)", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -1000));
    entity.nav.targetId = 777;
    entity.nav.behaviour = "INTERCEPT_TARGET";
    entity.nav.desiredRange = 100;
    const captured = contextFor(entity, bodies);
    behaviourInterceptTarget(entity, captured.ctx);
    expect(captured.events).toEqual([
      { name: "shipAchievedDesiredRange" },
      { name: "shipTargetLost" },
    ]);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.nav.desiredSpeed).toBe(0);
  });

  it("a gone target with desired range 0 posts only shipTargetLost (0 < 0 is false)", () => {
    const { entity, bodies } = pursuit(vec(0, 0, -1000));
    entity.nav.targetId = 777;
    entity.nav.behaviour = "INTERCEPT_TARGET";
    const captured = contextFor(entity, bodies);
    behaviourInterceptTarget(entity, captured.ctx);
    expect(captured.events).toEqual([{ name: "shipTargetLost" }]);
  });
});

describe("performIntercept through ShipControl (ShipEntityAI.m:413-417)", () => {
  it("sets the behaviour and zeroes frustration, touching nothing else", () => {
    const world = createWorld(1);
    const result = spawnEntity(
      world,
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
    const entity = result.entity;
    entity.steer.frustration = 4;
    entity.nav.targetId = 105;
    createShipControl(world, entity.id, 0).perform(
      entity.id,
      "INTERCEPT_TARGET",
    );
    expect(entity.nav.behaviour).toBe("INTERCEPT_TARGET");
    expect(entity.steer.frustration).toBe(0);
    expect(entity.nav.targetId).toBe(105);
    expect(entity.steer.entryPending).toBe(false);
  });
});
