// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The proximity pair trigger, `setProximityAlert:` and `behaviour_avoid_collision:`
 * (AI-01, plan 14-15). Every expected number below is derived by hand from the
 * cited Oolite lines (`CollisionRegion.m:269-312`, `ShipEntity.m:5155-5171`,
 * `6098-6146`), never from running the implementation. The independent oracle
 * fixtures for the same rules run in `avoid-escort.oracle.test.ts`. The second
 * half of this file runs the proximity pass in a real world (cases a to g of
 * plan 14-15), where the expected alert tick and the entry values come from the
 * closed form of a straight-line approach.
 */

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { identity, quat, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { behaviourAvoidCollision } from "../../../src/sim/npc/behaviours/avoid-collision.js";
import {
  SHIPS_ARE_CREWED,
  pairTriggers,
  proximityAlertFor,
} from "../../../src/sim/npc/proximity.js";
import type { ProximityBody } from "../../../src/sim/npc/proximity.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { MAIN_STATION_ID } from "../../../src/sim/world/ids.js";
import { createSteerComponent } from "../../../src/sim/npc/state.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { laveFixture } from "../../helpers/lave.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { harness, other, ship, statsWith } from "./attack-support.js";
import {
  FACING_PLUS_Z,
  flyTo,
  hullRadius,
  layout,
  playerAt,
  spawnShip,
  stepOnce,
} from "./world-support.js";

const NONE = (): undefined => undefined;

describe("the pair trigger (CollisionRegion.m:304-312)", () => {
  it("holds strictly inside four radii of equal ships, 4 x 40 = 160 m", () => {
    // dist2 < 16 x 40^2 = 25,600
    expect(pairTriggers(159.9 * 159.9, 40, 40)).toBe(true);
    expect(pairTriggers(160 * 160, 40, 40)).toBe(false);
    expect(pairTriggers(0, 40, 40)).toBe(true);
  });

  it("tests the larger radius: 4 x 40 = 160 m for radii 40 and 10", () => {
    // either 16 r1^2 = 25,600 or 16 r2^2 = 1,600 holds below 25,600; the outer
    // test 16 (r1 + r2)^2 = 40,000 is looser and implied
    expect(pairTriggers(159 * 159, 40, 10)).toBe(true);
    expect(pairTriggers(161 * 161, 40, 10)).toBe(false);
    expect(pairTriggers(159 * 159, 10, 40)).toBe(true);
  });

  it("is false for a pair that fails the outer test and the inner ones", () => {
    expect(pairTriggers(1e12, 40, 40)).toBe(false);
  });
});

/** A steered ship at the origin facing -Z, radius 10 (`SELF_RADIUS`), speed `speed`. */
function pilot(speed = 0) {
  const entity = ship(2);
  entity.speed = speed;
  return entity;
}

function body(id: number, position: Vec3, radius: number): ProximityBody {
  return { id, position, radius };
}

describe("setProximityAlert: the zone (ShipEntity.m:6119-6131)", () => {
  // radius 10 and an other of radius 20: zone = 2 x 10 + 20 = 40 m
  it.each([
    ["ahead, at rest", vec(0, 0, -40), 0, true],
    ["ahead, at rest, just outside", vec(0, 0, -41), 0, false],
    ["behind, at rest", vec(0, 0, 40), 0, true],
    ["abeam right", vec(40, 0, 0), 0, true],
    ["abeam left, just outside", vec(-41, 0, 0), 0, false],
    ["above", vec(0, 40, 0), 0, true],
    ["below, just outside", vec(0, -41, 0), 0, false],
  ])("%s", (_name, position, speed, expected) => {
    const self = pilot(speed);
    proximityAlertFor(self, 160, body(7, position, 20), 5000, NONE);
    expect(self.steer.proximityAlert).toBe(expected ? 7 : 0);
  });

  it("stretches the forward component by 0.25 x maxFlightSpeed / speed for a body ahead", () => {
    // at the maximum speed the factor is 0.25: 160 m ahead counts as 40 m
    const fast = pilot(160);
    proximityAlertFor(fast, 160, body(7, vec(0, 0, -160), 20), 5000, NONE);
    expect(fast.steer.proximityAlert).toBe(7);
    const outside = pilot(160);
    proximityAlertFor(outside, 160, body(7, vec(0, 0, -161), 20), 5000, NONE);
    expect(outside.steer.proximityAlert).toBe(0);
    // at half speed the factor is 0.5: 80 m counts as 40 m
    const half = pilot(80);
    proximityAlertFor(half, 160, body(7, vec(0, 0, -80), 20), 5000, NONE);
    expect(half.steer.proximityAlert).toBe(7);
    const halfOutside = pilot(80);
    proximityAlertFor(
      halfOutside,
      160,
      body(7, vec(0, 0, -81), 20),
      5000,
      NONE,
    );
    expect(halfOutside.steer.proximityAlert).toBe(0);
  });

  it("does not stretch a body behind the ship, nor any body when the ship is at rest", () => {
    const fast = pilot(160);
    proximityAlertFor(fast, 160, body(7, vec(0, 0, 41), 20), 5000, NONE);
    expect(fast.steer.proximityAlert).toBe(0);
    const rest = pilot(0);
    proximityAlertFor(rest, 160, body(7, vec(0, 0, -41), 20), 5000, NONE);
    expect(rest.steer.proximityAlert).toBe(0);
  });

  it("uses the ship's own frame: a ship turned a quarter about Y has -X ahead and +X behind", () => {
    // A rotation by +90 degrees about Y takes the forward (0, 0, -1) to (-1, 0, 0).
    const turned = (position: Vec3): number => {
      const self = pilot(160);
      self.orientation = quat(Math.SQRT1_2, 0, Math.SQRT1_2, 0);
      proximityAlertFor(self, 160, body(7, position, 20), 5000, NONE);
      return self.steer.proximityAlert;
    };
    // (the poses sit 1 m inside or outside a boundary, because a quarter turn
    // leaves the forward a rounding error short of exactly -X)
    expect(turned(vec(-159, 0, 0))).toBe(7); // ahead: 159 x 0.25 = 39.75 < 40
    expect(turned(vec(-161, 0, 0))).toBe(0);
    expect(turned(vec(39, 0, 0))).toBe(7); // behind: no stretch
    expect(turned(vec(41, 0, 0))).toBe(0);
  });
});

describe("setProximityAlert: who alerts (ShipEntity.m:6098-6117)", () => {
  it("ignores a body lighter than 2,000 kg, and takes one of exactly 2,000 kg", () => {
    const light = pilot();
    proximityAlertFor(light, 160, body(7, vec(0, 0, -20), 20), 1999.99, NONE);
    expect(light.steer.proximityAlert).toBe(0);
    const exact = pilot();
    proximityAlertFor(exact, 160, body(7, vec(0, 0, -20), 20), 2000, NONE);
    expect(exact.steer.proximityAlert).toBe(7);
  });

  it("a station is not alerted by anything", () => {
    const result = spawnEntity(
      createWorld(1),
      {
        kind: "station",
        specKey: "s",
        scanClass: "CLASS_STATION",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 500,
      },
      0,
    );
    if (!result.ok) throw new Error("spawn refused");
    proximityAlertFor(
      result.entity,
      160,
      body(7, vec(0, 0, -20), 20),
      5000,
      NONE,
    );
    expect(result.entity.steer.proximityAlert).toBe(0);
  });

  it("names the crew assumption: every listed ship is crewed", () => {
    expect(SHIPS_ARE_CREWED).toBe(true);
  });

  it("an alert already held is replaced by a later one that passes the zone", () => {
    const self = pilot();
    proximityAlertFor(self, 160, body(7, vec(0, 0, -30), 20), 5000, NONE);
    proximityAlertFor(self, 160, body(8, vec(20, 0, 0), 20), 5000, NONE);
    expect(self.steer.proximityAlert).toBe(8);
  });
});

describe("setProximityAlert: already avoiding (ShipEntity.m:6133-6144)", () => {
  /** The ship in AVOID_COLLISION holding an alert on `alertBody`, then offered `candidate`. */
  function offered(alertBody: ProximityBody, candidate: ProximityBody): number {
    const self = pilot();
    self.nav.behaviour = "AVOID_COLLISION";
    self.steer.proximityAlert = alertBody.id;
    proximityAlertFor(self, 160, candidate, 5000, (id) =>
      id === alertBody.id ? alertBody : undefined,
    );
    return self.steer.proximityAlert;
  }

  it("keeps the alert when it subtends the smaller angle (sa_prox < sa_other returns), as written", () => {
    // prox: radius 10 at 50 m: sa = 100 / 2500 = 0.04; other: radius 20 at
    // 30 m: sa = 400 / 900 = 0.4444. 0.04 < 0.4444, so the alert stays.
    expect(
      offered(body(7, vec(0, 0, -50), 10), body(8, vec(0, 0, -30), 20)),
    ).toBe(7);
  });

  it("takes the new body when the held alert subtends the larger angle", () => {
    // prox: radius 20 at 30 m: 0.4444; other: radius 20 at 40 m: 400 / 1600 = 0.25.
    expect(
      offered(body(7, vec(0, 0, -30), 20), body(8, vec(0, 0, -40), 20)),
    ).toBe(8);
  });

  it("takes the new body when the held alert names a body that is gone", () => {
    const self = pilot();
    self.nav.behaviour = "AVOID_COLLISION";
    self.steer.proximityAlert = 7;
    proximityAlertFor(self, 160, body(8, vec(0, 0, -30), 20), 5000, NONE);
    expect(self.steer.proximityAlert).toBe(8);
  });

  it("the comparison is skipped when the held alert is the offered body, and when not avoiding", () => {
    expect(
      offered(body(7, vec(0, 0, -30), 20), body(7, vec(0, 0, -30), 20)),
    ).toBe(7);
    const self = pilot();
    self.nav.behaviour = "FLY_TO_DESTINATION";
    self.steer.proximityAlert = 7;
    proximityAlertFor(self, 160, body(8, vec(0, 0, -40), 20), 5000, (id) =>
      id === 7 ? body(7, vec(0, 0, -50), 10) : undefined,
    );
    expect(self.steer.proximityAlert).toBe(8);
  });
});

describe("behaviour_avoid_collision (ShipEntity.m:5155-5171)", () => {
  const STATS = statsWith("EQ_WEAPON_NONE"); // 160 m/s, roll 2, pitch 1

  /** A ship avoiding the body `OTHER` of radius 20 at `position`, with a condition to resume. */
  function avoiding(position: Vec3, desiredRange = 500) {
    const entity = ship(2);
    entity.nav.behaviour = "AVOID_COLLISION";
    entity.nav.desiredRange = desiredRange;
    entity.nav.destination = vec(0, 0, -40);
    entity.steer.proximityAlert = 150;
    entity.steer.saved = {
      behaviour: "FLY_TO_DESTINATION",
      targetId: 0,
      desiredRange: 77,
      desiredSpeed: 55,
      destination: vec(1, 2, 3),
    };
    const h = harness(entity, [other(150, position, 20)], STATS);
    return { entity, h };
  }

  it("while the alert names a body: ten of its radii, its position, and a speed between half and full", () => {
    const { entity, h } = avoiding(vec(100, 0, 0));
    behaviourAvoidCollision(entity, h.ctx);
    // 5160-5163: desired range 20 x 10, destination the body's position
    expect(entity.nav.desiredRange).toBe(200);
    expect(entity.nav.destination).toEqual(vec(100, 0, 0));
    // the body is exactly abeam: dForward = 0, so dq = 0 and the speed is
    // 160 x (0.5 x 0 + 0.5) = 80 (5164-5167)
    expect(entity.nav.desiredSpeed).toBe(80);
    // the ship stays in AVOID_COLLISION, the condition saved
    expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(entity.steer.saved).not.toBeNull();
  });

  it("flies at full speed when the other is dead ahead or dead behind (dq = dForward^2 = 1)", () => {
    for (const z of [-100, 100]) {
      const { entity, h } = avoiding(vec(0, 0, z));
      behaviourAvoidCollision(entity, h.ctx);
      expect(entity.nav.desiredSpeed).toBe(160);
    }
  });

  it("retreats: the sticks turn it away from the other", () => {
    const { entity, h } = avoiding(vec(100, 0, 0));
    behaviourAvoidCollision(entity, h.ctx);
    // the other is on the right (+X); retreating wants the nose to the left,
    // a pitch fallback of 0.01 (`trackDestination` retreat, dUp = 0)
    expect(entity.steer.stickPitch).toBe(0.01);
  });

  it("resumes the saved condition when the range exceeds the desired range", () => {
    const { entity, h } = avoiding(vec(0, 0, 0), 30);
    // the destination is 40 m away and the desired range 30: resume (5157-5158)
    behaviourAvoidCollision(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("FLY_TO_DESTINATION");
    expect(entity.nav.desiredRange).toBe(77);
    expect(entity.nav.desiredSpeed).toBe(55);
    expect(entity.nav.destination).toEqual(vec(1, 2, 3));
    expect(entity.steer.saved).toBeNull();
    expect(entity.steer.proximityAlert).toBe(0);
    expect(entity.steer.frustration).toBe(0);
  });

  it("with the alert gone, keeps the last destination and desired range and keeps retreating", () => {
    const { entity, h } = avoiding(vec(100, 0, 0));
    entity.steer.proximityAlert = 0; // the pass cleared it and nothing renewed it
    entity.nav.destination = vec(0, 0, -40);
    entity.nav.desiredRange = 500;
    behaviourAvoidCollision(entity, h.ctx);
    expect(entity.nav.destination).toEqual(vec(0, 0, -40));
    expect(entity.nav.desiredRange).toBe(500);
    // dead ahead: dq = 1
    expect(entity.nav.desiredSpeed).toBe(160);
    expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
  });

  it("an alert naming a body that no longer exists counts as none and is cleared", () => {
    const { entity, h } = avoiding(vec(100, 0, 0));
    entity.steer.proximityAlert = 999;
    behaviourAvoidCollision(entity, h.ctx);
    expect(entity.steer.proximityAlert).toBe(0);
    expect(entity.nav.destination).toEqual(vec(0, 0, -40));
    expect(entity.nav.desiredRange).toBe(500);
  });
});

/* ---------------------------------------------------------------------------
 * The pass in a live world (cases a to g)
 * ------------------------------------------------------------------------- */

const VIPER = hullRadius("viper"); // 35.057655334472656 m
const FACTS = { flight: realNpcFlightTable() };
const VIPER_SPEED = 320; // maxFlightSpeed of the compiled Viper
const PER_TICK = VIPER_SPEED * DT; // metres one ship flies in one tick
const START = 1000; // each ship starts 1,000 m from the crossing point

interface Frame {
  readonly behaviour: Entity["nav"]["behaviour"];
  readonly alert: number;
  readonly destination: { x: number; y: number; z: number };
  readonly desiredRange: number;
  readonly position: { x: number; y: number; z: number };
  readonly saved: boolean;
}

function frameOf(entity: Entity): Frame {
  return {
    behaviour: entity.nav.behaviour,
    alert: entity.steer.proximityAlert,
    destination: { ...entity.nav.destination },
    desiredRange: entity.nav.desiredRange,
    position: { ...entity.position },
    saved: entity.steer.saved !== null,
  };
}

/**
 * Two steered Vipers on antiparallel tracks, `lateral` metres apart, each
 * flying to a point 30 km down its own track at full speed with its nose on the
 * track (so every stick stays 0 and the approach is a straight line). The lower
 * id starts at z = +1,000 flying -Z; the higher at z = -1,000 flying +Z.
 */
function nearPass(
  lateral: number,
  ticks: number,
  facts: typeof FACTS | undefined = FACTS,
): { world: World; a: Entity; b: Entity; fa: Frame[]; fb: Frame[] } {
  const world = createWorld(1);
  const player = playerAt();
  const a = spawnShip(world, {
    specKey: "viper",
    position: vec(0, 0, START),
    radius: VIPER,
    speed: VIPER_SPEED,
    steered: true,
  });
  flyTo(a, vec(0, 0, -30000), VIPER_SPEED);
  const b = spawnShip(world, {
    specKey: "viper",
    position: vec(lateral, 0, -START),
    orientation: FACING_PLUS_Z,
    radius: VIPER,
    speed: VIPER_SPEED,
    steered: true,
  });
  flyTo(b, vec(lateral, 0, 30000), VIPER_SPEED);
  const fa = [frameOf(a)];
  const fb = [frameOf(b)];
  for (let t = 1; t <= ticks; t += 1) {
    stepOnce(world, player, facts);
    fa.push(frameOf(a));
    fb.push(frameOf(b));
  }
  return { world, a, b, fa, fb };
}

/** The along-track separation after `t` ticks of the straight approach. */
function separation(t: number): number {
  return 2 * START - 2 * PER_TICK * t;
}

/**
 * The first tick at whose end the pair is alerted by the closed form: the pair
 * trigger (centre distance below 4 r) and each ship's stretched zone hold
 * (`ShipEntity.m:6119-6131`: the forward component of a body ahead is stretched
 * by 0.25 x maxFlightSpeed / speed, here 0.25).
 */
function predictedAlertTick(lateral: number, r: number): number | undefined {
  for (let t = 1; t < (2 * START) / PER_TICK; t += 1) {
    const s = separation(t);
    const trigger = s * s + lateral * lateral < 16 * r * r;
    const forward = s > 0 ? 0.25 * s : s;
    const zone = forward * forward + lateral * lateral <= 3 * r * (3 * r);
    if (trigger && zone) return t;
  }
  return undefined;
}

function minimumDistance(fa: readonly Frame[], fb: readonly Frame[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let t = 0; t < fa.length; t += 1) {
    const a = fa[t]?.position;
    const b = fb[t]?.position;
    if (a === undefined || b === undefined) continue;
    best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  }
  return best;
}

describe("case (a): a parallel-offset pass of two steered Vipers", () => {
  const lateral = 1.25 * (VIPER + VIPER);
  const tAlert = predictedAlertTick(lateral, VIPER) ?? -1;
  const run = nearPass(lateral, tAlert + 600);
  const a = run.fa;
  const b = run.fb;

  it("sits in the band the plan names, asserted before stepping", () => {
    // r1 + r2 is Oolite's contact distance (CollisionRegion.m:298); the zone is
    // 2 min(r) + max(r); the pair trigger is 4 max(r) (strict, :309)
    expect(VIPER + VIPER).toBeLessThan(lateral);
    expect(lateral).toBeLessThan(2 * VIPER + VIPER);
    expect(3 * VIPER).toBeLessThan(4 * VIPER);
    expect(VIPER).toBeCloseTo(35.0577, 3);
    expect(lateral).toBeCloseTo(87.644, 2);
    // the tick of the closed form is far from both neighbours' thresholds
    expect(tAlert).toBeGreaterThan(300);
  });

  it("raises the alert on both ships at the tick the closed form predicts, and not before", () => {
    for (let t = 0; t < tAlert; t += 1) {
      expect(a[t]?.alert, `A at ${String(t)}`).toBe(0);
      expect(b[t]?.alert, `B at ${String(t)}`).toBe(0);
    }
    expect(a[tAlert]?.alert).toBe(102);
    expect(b[tAlert]?.alert).toBe(101);
    // still flying to the destination at that tick: the alert is read next tick
    expect(a[tAlert]?.behaviour).toBe("FLY_TO_DESTINATION");
    expect(b[tAlert]?.behaviour).toBe("FLY_TO_DESTINATION");
  });

  it("starts AVOID_COLLISION the next tick with the midpoint and ten of the other's radii", () => {
    const t = tAlert + 1;
    expect(a[t]?.behaviour).toBe("AVOID_COLLISION");
    expect(b[t]?.behaviour).toBe("AVOID_COLLISION");
    expect(a[t]?.desiredRange).toBeCloseTo(10 * VIPER, 9);
    expect(b[t]?.desiredRange).toBeCloseTo(10 * VIPER, 9);
    // The step updates in ascending id. A (the lower id) reads B before B moves
    // this tick: the midpoint of the end-of-tick positions of tick tAlert. B
    // reads A after A moved this tick, and starts from its own old position.
    const zA = (n: number): number => START - PER_TICK * n;
    const zB = (n: number): number => -START + PER_TICK * n;
    expect(a[t]?.destination.x).toBeCloseTo(lateral / 2, 6);
    expect(a[t]?.destination.z).toBeCloseTo((zA(tAlert) + zB(tAlert)) / 2, 6);
    expect(b[t]?.destination.x).toBeCloseTo(lateral / 2, 6);
    expect(b[t]?.destination.z).toBeCloseTo(
      zB(tAlert) + 0.5 * (zA(tAlert + 1) - zB(tAlert)),
      6,
    );
    expect(a[t]?.saved).toBe(true);
  });

  it("steers for the other ship's position every tick while the alert holds (ShipEntity.m:5160-5163)", () => {
    let checked = 0;
    for (let t = tAlert + 2; t < a.length; t += 1) {
      const prev = a[t - 1];
      const now = a[t];
      if (
        prev?.behaviour !== "AVOID_COLLISION" ||
        now?.behaviour !== "AVOID_COLLISION" ||
        prev.alert !== 102 ||
        b[t]?.behaviour !== "AVOID_COLLISION" ||
        b[t - 1]?.alert !== 101
      ) {
        continue;
      }
      // A is updated first: it reads B's position at the end of the last tick
      expect(now.destination.x).toBeCloseTo(b[t - 1]?.position.x ?? NaN, 9);
      expect(now.destination.z).toBeCloseTo(b[t - 1]?.position.z ?? NaN, 9);
      // B is updated second: it reads A's position at the end of this tick
      expect(b[t]?.destination.x).toBeCloseTo(now.position.x, 9);
      expect(b[t]?.destination.z).toBeCloseTo(now.position.z, 9);
      expect(now.desiredRange).toBeCloseTo(10 * VIPER, 9);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("restores FLY_TO_DESTINATION within 360 ticks of the alert", () => {
    // The bound, derived before the first run. The alert holds while the pair
    // trigger and the zone hold. With a lateral offset L = 87.6 m and r = 35.06 m
    // the trigger 4 r = 140.2 m first holds at an along-track separation of
    // sqrt(140.2^2 - 87.6^2) = 109.5 m ahead, and once the other ship is
    // behind (no stretch) the zone 3 r = 105.2 m fails at sqrt(105.2^2 -
    // 87.6^2) = 58.1 m behind, so the alert spans about 168 m of relative
    // travel. Each ship enters at 320 m/s and, while it faces away from its
    // retreat direction, its desired speed maxFlightSpeed x (0.5 dq + 0.5) may
    // fall far below that; it decelerates at 5 x 32 = 160 m/s^2 for at most the
    // 0.31 s the alert lasts and keeps at least 270 m/s, a closing speed of at
    // least 540 m/s: about 37 ticks. When the alert clears, the other ship's
    // last known position is about 105 m away, about 58 m behind and at least
    // 87.6 m abeam, so the direction away from it lies within 60 degrees of the
    // heading; the retreat's desired speed is at least 0.5 x 320 = 160 m/s, and
    // turning at up to 1.8 rad/s it opens the remaining 351 - 105 = 246 m to
    // the desired range 10 r at an opening rate of at least 160 cos 60 = 80
    // m/s while it aligns (under 0.6 s) and 160 m/s after, in at most about
    // 1.8 s, 220 ticks. About 260 ticks in all; 360 ticks (3 s) leaves about
    // 40 % in margin.
    for (const frames of [a, b]) {
      let resumed = -1;
      for (let t = tAlert + 2; t < frames.length; t += 1) {
        if (frames[t]?.behaviour === "FLY_TO_DESTINATION") {
          resumed = t;
          break;
        }
      }
      expect(resumed).toBeGreaterThan(tAlert + 1);
      expect(resumed - tAlert).toBeLessThanOrEqual(360);
      const at = frames[resumed];
      expect(at?.saved).toBe(false);
      expect(at?.alert).toBe(0);
      // the saved destination, 30 km down its own track, came back
      expect(Math.abs(at?.destination.z ?? 0)).toBe(30000);
    }
  });

  it("records the observed clearance as finite, with no promise beyond it", () => {
    const min = minimumDistance(a, b);
    expect(Number.isFinite(min)).toBe(true);
    expect(min).toBeGreaterThan(0);
  });
});

describe("case (f): the same pass at 2 x (r1 + r2) never alerts", () => {
  const lateral = 2 * (VIPER + VIPER);
  const run = nearPass(lateral, 420);

  it("raises no alert on either ship and both stay in FLY_TO_DESTINATION", () => {
    // the closest approach is the lateral offset itself, 4 r: the pair trigger
    // is strict, so it never holds, and the zone 3 r is below it as well
    expect(predictedAlertTick(lateral, VIPER)).toBeUndefined();
    for (let t = 0; t < run.fa.length; t += 1) {
      expect(run.fa[t]?.alert).toBe(0);
      expect(run.fb[t]?.alert).toBe(0);
      expect(run.fa[t]?.behaviour).toBe("FLY_TO_DESTINATION");
      expect(run.fb[t]?.behaviour).toBe("FLY_TO_DESTINATION");
    }
    // the ships really did pass each other
    expect(run.a.position.z).toBeLessThan(0);
    expect(run.b.position.z).toBeGreaterThan(0);
  });
});

describe("case (b): a head-on pair, the order of alert, avoid and resume only", () => {
  // At the alert distance of 4 x max(r) a faithful port may still pass through
  // (RESEARCH Pitfall 6: tunnelling is detected, not prevented), so nothing is
  // asserted about the clearance.
  it("alerts, then avoids, then resumes", () => {
    const run = nearPass(0, 1500);
    for (const frames of [run.fa, run.fb]) {
      const alerted = frames.findIndex((f) => f.alert !== 0);
      expect(alerted).toBeGreaterThan(0);
      const avoiding = frames.findIndex(
        (f) => f.behaviour === "AVOID_COLLISION",
      );
      expect(avoiding).toBe(alerted + 1);
      const resumed = frames.findIndex(
        (f, i) => i > avoiding && f.behaviour === "FLY_TO_DESTINATION",
      );
      expect(resumed).toBeGreaterThan(avoiding);
    }
  });
});

describe("case (c): the main station dead ahead", () => {
  it("alerts at the first tick whose centre distance is below 2,000 m, and avoids with ten radii", () => {
    // In Oolite a pair trigger alone is not the whole rule: the collision-chain
    // prefilter (Universe.m:6713-6760, 7045-7073) would alert an isolated
    // station-and-ship pair only within 2 x (500 + r) = about 1,070 m per axis.
    // Near the station the planet chains every entity: in the Lave world the
    // station sits about (-49.5, 60.8, 25.1) km from the planet centre, inside
    // the planet's +-2R = +-82.3 km interval on every axis (Universe.m:1541-1547;
    // the planet collides, Entity.m:825, with its radius as collision radius,
    // OOPlanetEntity.m:120), so a ship within 3,000 m of the station lies inside
    // it with at least 18 km to spare and the planet chains the pair. 2,000 m
    // (4 x the station radius) is therefore Oolite's rule here.
    const station = layout.station;
    expect(station.radius).toBe(500);
    const start = 2900;
    const world = createWorld(1);
    const player = playerAt();
    const ship = spawnShip(world, {
      specKey: "viper",
      position: vec(
        station.position.x,
        station.position.y,
        station.position.z + start,
      ),
      radius: VIPER,
      speed: VIPER_SPEED,
      steered: true,
    });
    flyTo(
      ship,
      vec(station.position.x, station.position.y, station.position.z - 30000),
      VIPER_SPEED,
    );
    // the closed form: centre distance after t ticks of the straight approach
    let expected = -1;
    for (let t = 1; t < 2000; t += 1) {
      if (start - PER_TICK * t < 2000) {
        expected = t;
        break;
      }
    }
    expect(expected).toBeGreaterThan(300);
    const alerts: number[] = [];
    const behaviours: string[] = [];
    for (let t = 1; t <= expected + 1; t += 1) {
      stepOnce(world, player, FACTS);
      alerts.push(ship.steer.proximityAlert);
      behaviours.push(ship.nav.behaviour);
    }
    expect(alerts.slice(0, expected - 1).every((id) => id === 0)).toBe(true);
    expect(alerts[expected - 1]).toBe(MAIN_STATION_ID);
    expect(behaviours[expected - 1]).toBe("FLY_TO_DESTINATION");
    expect(behaviours[expected]).toBe("AVOID_COLLISION");
    expect(ship.nav.desiredRange).toBeCloseTo(10 * station.radius, 9);
  });
});

describe("case (d): a light ship never alerts", () => {
  function pass(otherMass: number): number[] {
    const world = createWorld(1);
    const player = playerAt();
    const a = spawnShip(world, {
      specKey: "viper",
      position: vec(0, 0, START),
      radius: VIPER,
      speed: VIPER_SPEED,
      steered: true,
    });
    flyTo(a, vec(0, 0, -30000), VIPER_SPEED);
    // an inert body at the same lateral offset as case (a), half way along A's
    // track (A reaches it after 1,000 m, 375 ticks), mass from a shipMasses row
    spawnShip(world, {
      specKey: "pod",
      position: vec(1.25 * (VIPER + VIPER), 0, 0),
      radius: VIPER,
    });
    const alerts: number[] = [];
    for (let t = 1; t <= 400; t += 1) {
      stepOnce(world, player, {
        ...FACTS,
        masses: [{ specKey: "pod", mass: otherMass }],
      });
      alerts.push(a.steer.proximityAlert);
    }
    return alerts;
  }

  it("is not alerted by a body of 1,000 kg, as setProximityAlert: ignores light objects (ShipEntity.m:6107)", () => {
    expect(pass(1000).every((id) => id === 0)).toBe(true);
  });

  it("is alerted by the same body at 5,000 kg, so the pass really did reach it", () => {
    expect(pass(5000).some((id) => id === 102)).toBe(true);
  });
});

describe("case (e): an inert ship keeps its default record and its hash", () => {
  it("is never written, though a steered ship is alerted by it", () => {
    const world = createWorld(1);
    const player = playerAt();
    const a = spawnShip(world, {
      specKey: "viper",
      position: vec(0, 0, START),
      radius: VIPER,
      speed: VIPER_SPEED,
      steered: true,
    });
    flyTo(a, vec(0, 0, -30000), VIPER_SPEED);
    // half way along A's track: A reaches it after 1,000 m, 375 ticks
    const inert = spawnShip(world, {
      specKey: "viper",
      position: vec(1.25 * (VIPER + VIPER), 0, 0),
      radius: VIPER,
    });
    const before = structuredClone(inert);
    let alerted = false;
    for (let t = 1; t <= 400; t += 1) {
      stepOnce(world, player, FACTS);
      if (a.steer.proximityAlert === inert.id) alerted = true;
      expect(inert.steer).toEqual(createSteerComponent(0));
    }
    expect(alerted).toBe(true);
    expect(inert).toEqual(before);
  });
});

describe("case (g): the player's radius is the compiled constant, not the hull table", () => {
  it("gives the same tick-indexed hashes with and without the hull table in the combat options", () => {
    const { config } = laveFixture();
    function hashes(withHulls: boolean): string[] {
      const world = createWorld(5);
      const player = playerAt();
      player.position = vec(0, 0, -1000);
      const a = spawnShip(world, {
        specKey: "viper",
        position: vec(0, 0, 0),
        radius: VIPER,
        speed: VIPER_SPEED,
        steered: true,
      });
      a.nav.behaviour = "INTERCEPT_TARGET";
      a.nav.targetId = 100;
      a.nav.desiredRange = 200;
      a.nav.desiredSpeed = VIPER_SPEED;
      const options = {
        npcFlight: realNpcFlightTable(),
        combat: {
          mounts: DEFAULT_LASER_MOUNTS,
          ...(withHulls ? { hulls: realHullTable() } : {}),
        },
      };
      const out: string[] = [];
      for (let t = 0; t < 300; t += 1) {
        stepSim(player, world, layout, config, ZERO_INTENT, [], DT, options);
        out.push(hashWorld(player, world));
      }
      return out;
    }
    const without = hashes(false);
    const withTable = hashes(true);
    expect(withTable).toEqual(without);
    // the run really moved the ship, so the hashes are not all one value
    expect(new Set(without).size).toBeGreaterThan(100);
  });
});
