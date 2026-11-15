// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `trackDestination` and the fly-to behaviours against Oolite's rules (AI-01,
 * plan 14-10). Expected values are derived by hand from the cited
 * `ShipEntity.m` lines, never from running the implementation; the independent
 * oracle fixtures are run by `navigation.oracle.test.ts`.
 *
 * Frame: Wegolite's local forward is -Z, right +X, up +Y; the identity
 * orientation has the ship facing -Z.
 */

import { describe, expect, it } from "vitest";

import { identity, quat, rotate, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import type { AiEventName } from "../../../src/sim/ai/types.js";
import { behaviourFaceDestination } from "../../../src/sim/npc/behaviours/face-destination.js";
import {
  behaviourFlyFromDestination,
  behaviourFlyRangeFromDestination,
  behaviourFlyToDestination,
} from "../../../src/sim/npc/behaviours/fly-to-destination.js";
import type { SteerContext } from "../../../src/sim/npc/dispatch.js";
import { steerShip } from "../../../src/sim/npc/dispatch.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import { trackDestination } from "../../../src/sim/npc/track.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import { createSyntheticView } from "./oracle-runner.js";

const DT = 1 / 120;

const STATS: NpcFlightStats = {
  specKey: "t",
  maxFlightSpeed: 160,
  maxFlightRoll: 2,
  maxFlightPitch: 1,
  thrust: 15,
  mass: 0,
  forwardWeapon: "EQ_WEAPON_NONE",
};

function ship(orientation: Quat = identity()): Entity {
  const result = spawnEntity(
    createWorld(1),
    {
      kind: "ship",
      specKey: "t",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation,
      radius: 10,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  result.entity.steer.accuracy = 2; // below the doubling tier
  return result.entity;
}

function toward(entity: Entity, destination: Vec3, desiredRange = 0): Entity {
  entity.nav.destination = destination;
  entity.nav.desiredRange = desiredRange;
  return entity;
}

interface Captured {
  readonly ctx: SteerContext;
  readonly events: AiEventName[];
}

function contextFor(entity: Entity, stats: NpcFlightStats = STATS): Captured {
  const events: AiEventName[] = [];
  return {
    events,
    ctx: {
      view: createSyntheticView([], entity, 1),
      stats,
      dt: DT,
      draw: () => {
        throw new Error("no draw expected");
      },
      emit: (event) => {
        events.push(event.name);
      },
    },
  };
}

function track(entity: Entity, retreat = false): number {
  return trackDestination(entity, contextFor(entity).ctx, retreat);
}

describe("trackDestination (ShipEntity.m:9450-9591)", () => {
  it("returns 1 for a destination dead ahead and leaves the sticks at 0 (9517)", () => {
    const entity = toward(ship(), vec(0, 0, -1000));
    expect(track(entity)).toBe(1);
    expect(entity.steer.stickRoll).toBe(0);
    expect(entity.steer.stickPitch).toBe(0);
  });

  it("turns slightly with the 0.01 pitch fallback for a destination abeam (9561-9565)", () => {
    // relPos = (0.7071, 0, -0.7071): d_right 0.7071, d_up 0, d_forward 0.7071.
    // d_up is inside +-min_d, so neither roll branch fires, the pitch block
    // finds factor 0 and no stick, and the fallback sets the pitch to 0.01.
    const entity = toward(ship(), vec(1000, 0, -1000));
    const confidence = track(entity);
    expect(entity.steer.stickRoll).toBe(0);
    expect(entity.steer.stickPitch).toBe(0.01);
    // applySticks: 0.01 is inside one pitch step (4 dt), so the rate lands on it.
    expect(entity.steer.flightPitch).toBe(0.01);
    expect(confidence).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("rolls first for a destination up and to the right, and truncates the factor (9525-9535)", () => {
    // relPos = (3, 4, -12) / 13: d_right = 3/13, d_up = 4/13, d_forward = 12/13.
    // factor = int(sqrt((3/13) / 0.004)) = int(7.595) = 7 (a rounded factor
    // would be 8). d_right > min_d: stick_roll = -2 * 0.125 * 7 = -1.75.
    const entity = toward(ship(), vec(3, 4, -12));
    const confidence = track(entity);
    expect(entity.steer.stickRoll).toBeCloseTo(-1.75, 12);
    // stick_roll != 0 skips the pitch block, so the fallback pitch applies.
    expect(entity.steer.stickPitch).toBe(0.01);
    // applySticks moves the roll rate one step (2 dt) toward the stick.
    expect(entity.steer.flightRoll).toBeCloseTo(-2 * DT, 12);
    expect(confidence).toBeCloseTo(12 / 13, 12);
  });

  it("rolls the other way for a destination below and to the right (9537-9547)", () => {
    const entity = toward(ship(), vec(3, -4, -12));
    track(entity);
    expect(entity.steer.stickRoll).toBeCloseTo(+1.75, 12);
    expect(entity.steer.flightRoll).toBeCloseTo(2 * DT, 12);
  });

  it("pitches by the capped factor for a destination straight above (9549-9559)", () => {
    // relPos = (0, 0.6, -0.8): d_up 0.6, d_right 0. factor = int(sqrt(150)) = 12
    // capped at 8: stick_pitch = -1 * 1 * 0.125 * 8 = -1.
    const entity = toward(ship(), vec(0, 3, -4));
    track(entity);
    expect(entity.steer.stickRoll).toBe(0);
    expect(entity.steer.stickPitch).toBeCloseTo(-1, 12);
  });

  it("truncates the pitch factor toward zero, never rounds it (9550)", () => {
    // d_up = 0.19: sqrt(0.19 / 0.004) = 6.892, so factor 6 (rounding gives 7).
    // stick_pitch = -1 * 0.125 * 6 = -0.75.
    const up = 0.19;
    const entity = toward(ship(), vec(0, up, -Math.sqrt(1 - up * up)));
    track(entity);
    expect(entity.steer.stickPitch).toBeCloseTo(-0.75, 9);
  });

  it("does not overshoot the heading when the angle is smaller than one step (9533-9534)", () => {
    // The limiter needs |d| < |stick| dt, so use a fast-pitching ship.
    const stats: NpcFlightStats = { ...STATS, maxFlightPitch: 100 };
    const up = 0.005; // above min_d, and off course: cos 0.9999875 < max_cos 0.99999
    const entity = toward(ship(), vec(0, up, -Math.sqrt(1 - up * up)));
    trackDestination(entity, contextFor(entity, stats).ctx, false);
    // factor = int(sqrt(0.005 / 0.004)) = 1; stick_pitch = -100 * 0.125 = -12.5;
    // |d_up| 0.005 < 12.5 / 120 = 0.1042: stick_pitch = -(0.005 / dt) = -0.6.
    expect(entity.steer.stickPitch).toBeCloseTo(-(up / DT), 9);
  });

  it("uses (0, 0, -1) for a destination at the ship's position (9493-9496)", () => {
    // Oolite sets relPos.z = 1.0, a world vector; in this frame it is -Z, the
    // ship's own forward for the identity orientation, so the ship is on course.
    const entity = toward(ship(), vec(0, 0, 0));
    expect(track(entity)).toBe(1);
    expect(entity.steer.stickPitch).toBe(0);
    expect(entity.steer.stickRoll).toBe(0);
  });

  it("treats a destination at the ship's position as straight astern for a ship facing +Z", () => {
    // 180 degrees about Y: forward is +Z, so the guard vector (0, 0, -1) is
    // d_forward -1 <= -max_cos: d_up = 2 min_d, factor int(sqrt(0.008/0.004)) = 1,
    // stick_pitch = -0.125, and a negative confidence is 0.
    const entity = toward(ship(quat(0, 0, 1, 0)), vec(0, 0, 0));
    expect(track(entity)).toBe(0);
    expect(entity.steer.stickPitch).toBeCloseTo(-0.125, 12);
  });

  it("returns 0 for a destination astern (9584)", () => {
    expect(track(toward(ship(), vec(0, 0, 1000)))).toBe(0);
  });

  it("aims inside the range sphere with max_cos below 1 (9486-9491)", () => {
    // Destination 1000 ahead, range 500: max_cos = sqrt(1 - 0.9025 * 0.25) =
    // 0.8800 < 1, so d_forward 1 is on course; with the range 0 it is capped at
    // 0.99999. A destination at 20 degrees off axis is on course for range 500
    // (cos 0.9397 >= 0.8800) but not for range 0.
    const angle = (20 * Math.PI) / 180;
    const destination = vec(1000 * Math.sin(angle), 0, -1000 * Math.cos(angle));
    const far = toward(ship(), destination, 500);
    track(far);
    expect(far.steer.stickRoll).toBe(0);
    expect(far.steer.stickPitch).toBe(0);
    const near = toward(ship(), destination, 0);
    track(near);
    expect(near.steer.stickPitch).not.toBe(0);
  });

  it("in retreat a destination dead ahead starts a pitch away and returns the squared cosine (9520-9523, 9581)", () => {
    // d_forward 1 >= max_cos: d_up = 0.008, factor int(sqrt(2)) = 1, retreat
    // reverses the pitch sign: stick_pitch = -1 * (-1) * 0.125 * 1 = +0.125.
    const entity = toward(ship(), vec(0, 0, -1000));
    const confidence = track(entity, true);
    expect(entity.steer.stickPitch).toBeCloseTo(0.125, 12);
    // applySticks moved the pitch rate, so the squared cosine (1) is returned.
    expect(entity.steer.flightPitch).toBeCloseTo(4 * DT, 12);
    expect(confidence).toBe(1);
  });

  it("in retreat a destination astern returns the squared cosine, positive (9581)", () => {
    // d_forward -1: squared 1; d_forward <= -max_cos makes d_up positive.
    const entity = toward(ship(), vec(0, 0, 1000));
    expect(track(entity, true)).toBe(1);
  });

  it("pitching_over holds the pitch until the heading is within 45 degrees (9508-9514)", () => {
    // Destination astern and above: d_up 0.6 > 0, d_forward -0.8.
    const behind = toward(ship(), vec(0, 3, 4));
    behind.steer.pitchingOver = true;
    track(behind);
    expect(behind.steer.pitchingOver).toBe(true); // -0.8 < 0.707
    // Destination ahead and above: d_forward 0.8 >= 0.707 clears the flag.
    const ahead = toward(ship(), vec(0, 3, -4));
    ahead.steer.pitchingOver = true;
    track(ahead);
    expect(ahead.steer.pitchingOver).toBe(false);
  });

  it("clamps d_forward into [-1, 1] before any compare (a Wegolite addition, T-14-16)", () => {
    // A quaternion a hair off unit length scales the rotated axes, so the
    // unclamped dot product would be above 1; the squared confidence of a
    // retreat is returned as is, so the clamp shows in the result.
    const q = quat(1.001, 0, 0.001, 0);
    const forward = rotate(q, vec(0, 0, -1));
    const entity = toward(ship(), vec(forward.x * 1000, 0, forward.z * 1000));
    entity.orientation = q; // not unit: the spawn refuses it
    const confidence = track(entity, true);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it("never returns NaN or a value outside [0, 1] for degenerate geometry (T-14-16)", () => {
    for (const destination of [
      vec(0, 0, 0),
      vec(1e-300, 0, 0),
      vec(0, 1e6, 0),
      vec(-1e6, -1e6, -1e6),
    ]) {
      for (const retreat of [false, true]) {
        const confidence = track(toward(ship(), destination, 1e6), retreat);
        expect(Number.isFinite(confidence)).toBe(true);
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("behaviour_fly_range_from_destination (ShipEntity.m:4903-4918)", () => {
  it("flies from a destination closer than the desired range, at least at maximum speed", () => {
    const entity = toward(ship(), vec(0, 0, -100), 500);
    entity.nav.desiredSpeed = 40;
    entity.steer.frustration = 3;
    behaviourFlyRangeFromDestination(entity, contextFor(entity).ctx);
    expect(entity.nav.behaviour).toBe("FLY_FROM_DESTINATION");
    expect(entity.nav.desiredSpeed).toBe(160);
    expect(entity.steer.frustration).toBe(0);
  });

  it("keeps a desired speed already above maximum when flying from", () => {
    const entity = toward(ship(), vec(0, 0, -100), 500);
    entity.nav.desiredSpeed = 300;
    behaviourFlyRangeFromDestination(entity, contextFor(entity).ctx);
    expect(entity.nav.behaviour).toBe("FLY_FROM_DESTINATION");
    expect(entity.nav.desiredSpeed).toBe(300);
  });

  it("flies to a destination at or beyond the desired range", () => {
    const entity = toward(ship(), vec(0, 0, -500), 500);
    behaviourFlyRangeFromDestination(entity, contextFor(entity).ctx);
    expect(entity.nav.behaviour).toBe("FLY_TO_DESTINATION");
  });
});

describe("behaviour_fly_to_destination (ShipEntity.m:5049-5134)", () => {
  it("posts shipAchievedDesiredRange once and idles at speed 0 inside the range", () => {
    const entity = toward(ship(), vec(0, 0, -100), 500);
    entity.nav.behaviour = "FLY_TO_DESTINATION";
    entity.nav.desiredSpeed = 80;
    entity.steer.frustration = 2;
    const { ctx, events } = contextFor(entity);
    steerShip(entity, ctx);
    expect(events).toEqual(["shipAchievedDesiredRange"]);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.nav.desiredSpeed).toBe(0);
    expect(entity.steer.frustration).toBe(0);
    // IDLE runs from the next update: no second event.
    steerShip(entity, ctx);
    expect(events).toEqual(["shipAchievedDesiredRange"]);
  });

  it("remembers the distance in successFactor as a float32 value", () => {
    const entity = toward(ship(), vec(0, 0, -1000.3), 0);
    entity.nav.behaviour = "FLY_TO_DESTINATION";
    behaviourFlyToDestination(entity, contextFor(entity).ctx);
    expect(entity.steer.successFactor).toBe(Math.fround(1000.3));
  });

  it("counts frustration up by dt when the distance did not improve, as a float32 value", () => {
    const entity = toward(ship(), vec(0, 0, -1000), 0);
    entity.nav.behaviour = "FLY_TO_DESTINATION";
    entity.steer.successFactor = 500; // last distance smaller: no improvement
    behaviourFlyToDestination(entity, contextFor(entity).ctx);
    expect(entity.steer.frustration).toBe(Math.fround(DT));
  });

  it("counts frustration down by 0.25 dt on an improvement and never below 0", () => {
    const entity = toward(ship(), vec(0, 0, -1000), 0);
    entity.nav.behaviour = "FLY_TO_DESTINATION";
    entity.steer.successFactor = 2000; // last distance larger: improvement
    entity.steer.frustration = 1;
    behaviourFlyToDestination(entity, contextFor(entity).ctx);
    expect(entity.steer.frustration).toBe(Math.fround(1 - 0.25 * DT));
    entity.steer.successFactor = 2000;
    entity.steer.frustration = 0.001;
    behaviourFlyToDestination(entity, contextFor(entity).ctx);
    expect(entity.steer.frustration).toBe(0);
  });

  it("posts shipAIFrustrated after 15 s of frustration and relieves it by slowdownTime x 5 (5124-5128)", () => {
    // thrust 15, flightSpeed 0: slowdownTime 0, so only the 15 s rule applies.
    const entity = toward(ship(), vec(0, 0, -1000), 0);
    entity.nav.behaviour = "FLY_TO_DESTINATION";
    entity.steer.successFactor = 500;
    entity.steer.frustration = Math.fround(15);
    const { ctx, events } = contextFor(entity);
    behaviourFlyToDestination(entity, ctx);
    expect(events).toEqual(["shipAIFrustrated"]);
    // frustration 15 + dt, then - 0 (slowdownTime 0).
    expect(entity.steer.frustration).toBe(Math.fround(15 + DT));
  });

  it("cuts the desired speed by half when the ETA is inside the slowdown time (5095-5097)", () => {
    // Moving at 100 toward a destination 300 away that is dead ahead:
    // confidence 1, eta = (301 - 0) / (0.51 * 100) = 5.9, slowdownTime = 100 / 15
    // = 6.67, minTurnSpeedFactor = 0.05 * 1 * 2 = 0.1, 100 > 160 * 0.1.
    const entity = toward(ship(), vec(0, 0, -300), 0);
    entity.nav.behaviour = "FLY_TO_DESTINATION";
    entity.speed = 100;
    entity.nav.desiredSpeed = 160;
    behaviourFlyToDestination(entity, contextFor(entity).ctx);
    expect(entity.nav.desiredSpeed).toBe(50);
  });

  it("keeps the desired speed far from the destination (5095)", () => {
    const entity = toward(ship(), vec(0, 0, -30000), 0);
    entity.nav.behaviour = "FLY_TO_DESTINATION";
    entity.speed = 100;
    entity.nav.desiredSpeed = 160;
    behaviourFlyToDestination(entity, contextFor(entity).ctx);
    expect(entity.nav.desiredSpeed).toBe(160);
  });
});

describe("behaviour_fly_from_destination (ShipEntity.m:5136-5153)", () => {
  it("retreats while inside the desired range and keeps its behaviour", () => {
    const entity = toward(ship(), vec(0, 0, -100), 500);
    entity.nav.behaviour = "FLY_FROM_DESTINATION";
    const { ctx, events } = contextFor(entity);
    behaviourFlyFromDestination(entity, ctx);
    expect(events).toEqual([]);
    expect(entity.nav.behaviour).toBe("FLY_FROM_DESTINATION");
    // retreat: d_up becomes 2 min_d, pitch -1 * -1 * 0.125.
    expect(entity.steer.stickPitch).toBeCloseTo(0.125, 12);
  });

  it("posts shipAchievedDesiredRange once beyond the range and idles at speed 0", () => {
    const entity = toward(ship(), vec(0, 0, -1000), 500);
    entity.nav.behaviour = "FLY_FROM_DESTINATION";
    entity.nav.desiredSpeed = 120;
    entity.steer.frustration = 4;
    const { ctx, events } = contextFor(entity);
    steerShip(entity, ctx);
    expect(events).toEqual(["shipAchievedDesiredRange"]);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.nav.desiredSpeed).toBe(0);
    expect(entity.steer.frustration).toBe(0);
  });

  it("FORMATION_BREAK shares fly-from (2604-2607)", () => {
    const entity = toward(ship(), vec(0, 0, -1000), 500);
    entity.nav.behaviour = "FORMATION_BREAK";
    const { ctx, events } = contextFor(entity);
    steerShip(entity, ctx);
    expect(events).toEqual(["shipAchievedDesiredRange"]);
    expect(entity.nav.behaviour).toBe("IDLE");
  });
});

describe("behaviour_face_destination (ShipEntity.m:4920-4965)", () => {
  function facer(destination: Vec3, desiredRange = 0): Entity {
    const entity = toward(ship(), destination, desiredRange);
    entity.nav.behaviour = "FACE_DESTINATION";
    return entity;
  }

  it("posts shipNowFacingDestination, idles and then adds dt to frustration at speed 0 (4930-4944)", () => {
    const entity = facer(vec(0, 0, -1000));
    entity.nav.desiredSpeed = 50;
    entity.steer.frustration = 3;
    const { ctx, events } = contextFor(entity);
    behaviourFaceDestination(entity, ctx);
    expect(events).toEqual(["shipNowFacingDestination"]);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.nav.desiredSpeed).toBe(0);
    // frustration is zeroed in the facing block, then dt is added at speed 0.
    expect(entity.steer.frustration).toBe(Math.fround(DT));
  });

  it("waits for the pitch rate to reach exactly 0 before it posts (4930)", () => {
    const entity = facer(vec(0, 0, -1000));
    entity.steer.flightPitch = 0.1;
    const { ctx, events } = contextFor(entity);
    behaviourFaceDestination(entity, ctx);
    // One step of 4 dt = 0.0333 leaves 0.0667: still turning.
    expect(entity.steer.flightPitch).toBeCloseTo(0.1 - 4 * DT, 12);
    expect(events).toEqual([]);
    expect(entity.nav.behaviour).toBe("FACE_DESTINATION");
    for (let step = 0; step < 5 && events.length === 0; step += 1) {
      behaviourFaceDestination(entity, ctx);
    }
    expect(events).toEqual(["shipNowFacingDestination"]);
    expect(entity.steer.flightPitch).toBe(0);
  });

  it("aims inside the range sphere when the desired range exceeds 1 m (4926-4928)", () => {
    // Range 500 at distance 1000: max_cos = sqrt(1 - 0.90 * 0.25) = 0.8803, and
    // trackDestination's own max_cos is sqrt(1 - 0.9025 * 0.25) = 0.8800, so a
    // heading 20 degrees off (cos 0.9397) counts as facing at once.
    const angle = (20 * Math.PI) / 180;
    const far = facer(
      vec(1000 * Math.sin(angle), 0, -1000 * Math.cos(angle)),
      500,
    );
    const { ctx, events } = contextFor(far);
    behaviourFaceDestination(far, ctx);
    expect(events).toEqual(["shipNowFacingDestination"]);
    // With no desired range the same heading is not facing.
    const near = facer(
      vec(1000 * Math.sin(angle), 0, -1000 * Math.cos(angle)),
      0,
    );
    const second = contextFor(near);
    behaviourFaceDestination(near, second.ctx);
    expect(second.events).toEqual([]);
  });

  it("posts shipAIFrustrated after 15 / max_flight_pitch s at speed 0 and escapes a stuck pitch (4943-4951)", () => {
    // Destination astern: stick_pitch -0.125 (d_up 2 min_d, factor 1). The pitch
    // rate already sits on the stick, so applySticks leaves it unchanged and the
    // escape sets it to 0.5 * max_flight_pitch.
    const entity = facer(vec(0, 0, 1000));
    entity.steer.flightPitch = -0.125;
    entity.steer.frustration = Math.fround(15);
    const { ctx, events } = contextFor(entity);
    behaviourFaceDestination(entity, ctx);
    expect(events).toEqual(["shipAIFrustrated"]);
    expect(entity.steer.frustration).toBe(0);
    expect(entity.steer.flightPitch).toBe(0.5);
  });

  it("scales the frustration limit with max_flight_pitch (4945)", () => {
    // max_flight_pitch 2: the limit is 7.5 s, so 7.5 + dt fires and 7 does not.
    const stats: NpcFlightStats = { ...STATS, maxFlightPitch: 2 };
    const fires = facer(vec(0, 0, 1000));
    fires.steer.frustration = Math.fround(7.5);
    const first = contextFor(fires, stats);
    behaviourFaceDestination(fires, first.ctx);
    expect(first.events).toEqual(["shipAIFrustrated"]);
    const quiet = facer(vec(0, 0, 1000));
    quiet.steer.frustration = Math.fround(7);
    const second = contextFor(quiet, stats);
    behaviourFaceDestination(quiet, second.ctx);
    expect(second.events).toEqual([]);
  });

  it("does not add frustration while moving (4943-4944)", () => {
    const entity = facer(vec(0, 0, 1000));
    entity.speed = 10;
    entity.steer.frustration = 2;
    behaviourFaceDestination(entity, contextFor(entity).ctx);
    expect(entity.steer.frustration).toBe(2);
  });

  it("damps a pitch sign flip at speed 0 with frustration above 5 and confidence above 0.5 (4958-4959)", () => {
    // Destination below and ahead: stick_pitch +1, d_forward 0.8. An old pitch of
    // -0.1 opposes the stick, so the rate step is 4 x 4 dt = 0.1333 and the
    // pitch flips to 0.0333; the damping adds 0.5 x (-0.1) = -0.05.
    const entity = facer(vec(0, -3, -4));
    entity.steer.flightPitch = -0.1;
    entity.steer.frustration = Math.fround(6);
    behaviourFaceDestination(entity, contextFor(entity).ctx);
    expect(entity.steer.flightPitch).toBeCloseTo(-0.1 + 16 * DT - 0.05, 12);
  });

  it("does not damp while moving, below frustration 5, or without a sign flip", () => {
    const expectedUndamped = -0.1 + 16 * DT;
    const moving = facer(vec(0, -3, -4));
    moving.speed = 10;
    moving.steer.flightPitch = -0.1;
    moving.steer.frustration = Math.fround(6);
    behaviourFaceDestination(moving, contextFor(moving).ctx);
    expect(moving.steer.flightPitch).toBeCloseTo(expectedUndamped, 12);

    const calm = facer(vec(0, -3, -4));
    calm.steer.flightPitch = -0.1;
    calm.steer.frustration = Math.fround(2);
    behaviourFaceDestination(calm, contextFor(calm).ctx);
    expect(calm.steer.flightPitch).toBeCloseTo(expectedUndamped, 12);

    // Same-sign pitch: no flip.
    const same = facer(vec(0, -3, -4));
    same.steer.flightPitch = 0.1;
    same.steer.frustration = Math.fround(6);
    behaviourFaceDestination(same, contextFor(same).ctx);
    expect(same.steer.flightPitch).toBeCloseTo(0.1 + 4 * DT, 12);
  });
});
