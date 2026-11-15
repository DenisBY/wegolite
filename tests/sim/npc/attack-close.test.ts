// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The close-range attack sub-behaviours against Oolite's rules (AI-01, plan
 * 14-14): fly to target (`ShipEntity.m:4611-4731`), fly from target (4733-4799)
 * and six and twelve (4461-4580). Expected values are derived by hand from the
 * cited lines, never from running the implementation; the independent oracle
 * fixtures run in `attack.oracle.test.ts`. The geometry is in
 * `attack-support.ts`.
 */

import { describe, expect, it } from "vitest";

import { vec } from "../../../src/sim/math.js";
import {
  behaviourAttackFlyFromTarget,
  behaviourAttackFlyToTarget,
} from "../../../src/sim/npc/behaviours/attack-close.js";
import {
  DT,
  TARGET_ID,
  facingAspect,
  harness,
  other,
  ship,
  statsWith,
  target,
} from "./attack-support.js";

const PULSE = statsWith("EQ_WEAPON_PULSE_LASER"); // range 12500 (equipment.plist:132)
const NONE = statsWith("EQ_WEAPON_NONE"); // range 0 (ShipEntity.m:443-466)

/** `2.9990234375` is `3 - 2^-10`, float32-exact: one dt tips it past 3. */
const NEAR_THREE = 3 - 2 ** -10;

describe("behaviour_attack_fly_to_target: the speed bands (ShipEntity.m:4644-4685)", () => {
  function desiredSpeed(
    accuracy: number,
    range: number,
    targetSpeed: number,
    aspect: number,
    targetsSelf = false,
  ): number {
    const entity = ship(accuracy);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    const body = target(range, {
      speed: targetSpeed,
      orientation: facingAspect(aspect),
      targetId: targetsSelf ? entity.id : 0,
    });
    const h = harness(entity, [body], PULSE);
    behaviourAttackFlyToTarget(entity, h.ctx);
    return entity.nav.desiredSpeed;
  }

  it("beyond 1.2 x the weapon range (15,000 m) it approaches at maxFlightSpeed, 3 x the target's speed capped by it (4683)", () => {
    expect(desiredSpeed(2, 20000, 0, -1)).toBe(160);
    expect(desiredSpeed(2, 20000, 200, -1)).toBe(160);
  });

  it("a pilot below COMBAT_AI_IS_SMART flies 1.5 x the target's speed, at least maxFlightSpeed, between 5,000 and 15,000 m (4670)", () => {
    expect(desiredSpeed(2, 10000, 200, -1)).toBe(300);
    expect(desiredSpeed(2, 10000, 0, -1)).toBe(160);
  });

  it("a smart pilot beyond half the weapon range does the same (4669)", () => {
    expect(desiredSpeed(7, 10000, 200, -1)).toBe(300);
  });

  it("a smart pilot inside 6,250 m not being shot at slows: 1.25 x target speed with the target running away, 0.5 x with it coming (4672-4676)", () => {
    // aspect -1 (not above -0.25): max(1.25 * 200, 0.5 * 160) = 250
    expect(desiredSpeed(7, 5500, 200, -1)).toBe(250);
    // aspect +1: max(0.5 * 200, 80) = 100
    expect(desiredSpeed(7, 5500, 200, 1)).toBe(100);
  });

  it("a smart pilot the target is shooting at keeps 1.5 x target speed (4669)", () => {
    expect(desiredSpeed(7, 5500, 200, 1, true)).toBe(300);
  });

  it("inside 5,000 m a pilot below IS_SMART matches speed: 1.05 x the target's, at least a quarter of the maximum (4663)", () => {
    expect(desiredSpeed(2, 3000, 200, -1)).toBe(210);
    expect(desiredSpeed(2, 3000, 0, -1)).toBe(40);
  });

  it("inside 5,000 m a smart pilot not shot at slows to a tenth: max(0.1 x target speed, 16) (4666)", () => {
    expect(desiredSpeed(7, 3000, 200, -1)).toBe(20);
    expect(desiredSpeed(7, 3000, 100, -1)).toBe(16);
    // the aspect clause needs the target to target us: aspect 1 alone is not enough
    expect(desiredSpeed(7, 3000, 200, 1)).toBe(20);
  });

  it("a pilot of accuracy 6 or more shot at head-on keeps 1.25 x the target's speed, at least 0.8 x maximum (4659-4661)", () => {
    expect(desiredSpeed(7, 3000, 200, 1, true)).toBe(250);
    expect(desiredSpeed(7, 3000, 0, 1, true)).toBe(128);
    // below accuracy 6 the same pose matches speed instead
    expect(desiredSpeed(5, 3000, 200, 1, true)).toBe(210);
  });
});

describe("behaviour_attack_fly_to_target: frustration, entry and proximity (ShipEntity.m:4630-4704)", () => {
  function flyTo(
    accuracy: number,
    values: readonly number[] = [],
  ): ReturnType<typeof harness> & {
    entity: ReturnType<typeof ship>;
  } {
    const entity = ship(accuracy);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    const h = harness(entity, [], PULSE, values);
    return { ...h, entity };
  }

  it("tracking well (target dead ahead, success above 0.999) lowers the frustration by dt (4690-4693)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    entity.steer.frustration = Math.fround(2);
    const h = harness(entity, [target(10000)], PULSE);
    behaviourAttackFlyToTarget(entity, h.ctx);
    expect(entity.steer.successFactor).toBe(1);
    expect(entity.steer.frustration).toBeCloseTo(2 - DT, 6);
    expect(h.events).toEqual([]);
  });

  it("not tracking (target straight above) adds dt and, past 3 s, reports, sets jink z 1000, returns to ATTACK_TARGET, resets and goes full speed (4694-4703)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    entity.steer.frustration = NEAR_THREE;
    entity.steer.successFactor = 0.5;
    const abeam = target(10000, { position: vec(0, 10060, 0) });
    const h = harness(entity, [abeam], PULSE, [0.75, 0.25]);
    behaviourAttackFlyToTarget(entity, h.ctx);
    expect(entity.steer.successFactor).toBe(0); // target straight above: the pitch stick moves, confidence 0
    expect(h.events).toEqual([{ name: "shipAIFrustrated" }]);
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(entity.steer.frustration).toBe(0);
    expect(entity.nav.desiredSpeed).toBe(160);
    // x = floor(0.75 * 256) - 128 = 64 -> +128 = 192; y = 64 - 128 -> -64 -> -192
    // Wegolite stores jink z negated: Oolite's 1000
    expect(entity.steer.jink).toEqual(vec(192, -192, -1000));
    expect(h.used()).toBe(2);
  });

  it("below the 3 s limit it only adds dt", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    entity.steer.successFactor = 0.5;
    const h = harness(
      entity,
      [target(10000, { position: vec(0, 10060, 0) })],
      PULSE,
    );
    behaviourAttackFlyToTarget(entity, h.ctx);
    expect(entity.steer.frustration).toBeCloseTo(DT, 6);
    expect(entity.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
    expect(h.events).toEqual([]);
  });

  it("a target with no body goes idle with shipTargetLost (4618-4621)", () => {
    const { entity, ctx, events } = flyTo(2);
    behaviourAttackFlyToTarget(entity, ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(entity.nav.targetId).toBe(0);
    expect(events).toEqual([{ name: "shipTargetLost" }]);
  });

  it("a target beyond 1.25 scanner ranges (32,000 m) outside the close range is lost (4638-4641)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    const h = harness(entity, [target(33000)], PULSE);
    behaviourAttackFlyToTarget(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(h.events).toEqual([{ name: "shipTargetLost", a: TARGET_ID }]);
  });

  it("inside 0.035 x the weapon range (437.5 m) it returns to ATTACK_TARGET, and the rest of the call still runs (4630-4633)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    const h = harness(entity, [target(300, { speed: 100 })], PULSE);
    behaviourAttackFlyToTarget(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    // the speed branch ran: inside 5,000 m, accuracy 2: max(1.05 * 100, 40)
    expect(entity.nav.desiredSpeed).toBeCloseTo(105, 9);
  });

  it("an alert on the target is ignored: it also returns to ATTACK_TARGET (4630-4633, 9751-9758)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    entity.steer.proximityAlert = TARGET_ID;
    const h = harness(entity, [target(10000)], PULSE);
    behaviourAttackFlyToTarget(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
  });

  it("an alert on another body outside the close range avoids it at once and returns (4634-4635)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    entity.nav.desiredSpeed = 77;
    entity.steer.proximityAlert = 300;
    const h = harness(
      entity,
      [target(10000), other(300, vec(500, 0, 0))],
      PULSE,
    );
    behaviourAttackFlyToTarget(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(entity.steer.saved?.behaviour).toBe("ATTACK_FLY_TO_TARGET");
    expect(entity.nav.desiredSpeed).toBe(77); // returned before the speed logic
  });
});

describe("behaviour_attack_fly_from_target (ShipEntity.m:4733-4799)", () => {
  function flyFrom(
    stats: typeof PULSE,
    range: number,
    options: {
      jink?: ReturnType<typeof vec>;
      accuracy?: number;
      frustration?: number;
      successFactor?: number;
      speed?: number;
      desiredSpeed?: number;
      aspect?: number;
      targetSpeed?: number;
      values?: readonly number[];
    } = {},
  ) {
    const entity = ship(options.accuracy ?? 2);
    entity.nav.behaviour = "ATTACK_FLY_FROM_TARGET";
    entity.steer.jink = options.jink ?? vec(0, 0, 0);
    entity.steer.frustration = options.frustration ?? 0;
    entity.steer.successFactor = options.successFactor ?? 0;
    entity.speed = options.speed ?? 0;
    entity.nav.desiredSpeed = options.desiredSpeed ?? 160;
    const h = harness(
      entity,
      [
        target(range, {
          orientation: facingAspect(options.aspect ?? -1),
          speed: options.targetSpeed ?? 0,
        }),
      ],
      stats,
      options.values ?? [],
    );
    behaviourAttackFlyFromTarget(entity, h.ctx);
    return { entity, ...h };
  }

  it("an unarmed ship (range 0) with zero jink leaves at once: the exit test is range > 0 + 15 x 0 (4775)", () => {
    const { entity } = flyFrom(NONE, 1000);
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(entity.steer.frustration).toBe(0);
    expect(entity.steer.jink).toEqual(vec(0, 0, 0));
  });

  it("with jink.x = 200 an unarmed ship stays until the range passes 15 x 200 = 3,000 m (4775)", () => {
    const stays = flyFrom(NONE, 1000, { jink: vec(200, 0, 0) });
    expect(stays.entity.nav.behaviour).toBe("ATTACK_FLY_FROM_TARGET");
    expect(stays.entity.steer.jink.x).toBe(200);
    const leaves = flyFrom(NONE, 3100, { jink: vec(200, 0, 0) });
    expect(leaves.entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(leaves.entity.steer.jink).toEqual(vec(0, 0, 0));
  });

  it("with jink.x = -200 the threshold is -3,000 and it leaves at once (4775)", () => {
    const { entity } = flyFrom(NONE, 1000, { jink: vec(-200, 0, 0) });
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
  });

  it("an armed ship leaves beyond 0.5 x 12,500 = 6,250 m and stays inside it (4775)", () => {
    expect(flyFrom(PULSE, 6000).entity.nav.behaviour).toBe(
      "ATTACK_FLY_FROM_TARGET",
    );
    expect(flyFrom(PULSE, 6300).entity.nav.behaviour).toBe("ATTACK_TARGET");
  });

  it("the speed clause leaves too: flightSpeed above (25600 - range) x pitch / 6.28 (4775)", () => {
    // (25600 - 1000) * 1 / 6.28 = 3917.2
    expect(flyFrom(PULSE, 1000, { speed: 3900 }).entity.nav.behaviour).toBe(
      "ATTACK_FLY_FROM_TARGET",
    );
    expect(flyFrom(PULSE, 1000, { speed: 3920 }).entity.nav.behaviour).toBe(
      "ATTACK_TARGET",
    );
  });

  it("the success factor is the range, and a closing target adds dt where a steady one adds dt / 4 (4736-4748)", () => {
    const closing = flyFrom(PULSE, 1000, { successFactor: 2000 });
    expect(closing.entity.steer.successFactor).toBe(1000);
    expect(closing.entity.steer.frustration).toBeCloseTo(DT, 6);
    const steady = flyFrom(PULSE, 1000, { successFactor: 500 });
    expect(steady.entity.steer.frustration).toBeCloseTo(DT / 4, 6);
  });

  it("a target with no body goes idle after the success factor is stored (4739-4741)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_FROM_TARGET";
    const h = harness(entity, [], PULSE);
    behaviourAttackFlyFromTarget(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(h.events).toEqual([{ name: "shipTargetLost" }]);
  });

  it("past 10 s the first draw below 0.3 sets full speed, the third rerolls the jink, and the frustration halves (4750-4763)", () => {
    // frustration 10 + dt / 4 = 10.00208 > 10; draws: 0.1 (speed), 0.5 (no halving), jink x, y
    const { entity, used } = flyFrom(PULSE, 1000, {
      frustration: 10,
      successFactor: 500,
      desiredSpeed: 100,
      jink: vec(0, 0, -100),
      values: [0.1, 0.5, 0.75, 0.25],
    });
    expect(used()).toBe(4);
    expect(entity.nav.desiredSpeed).toBe(160);
    expect(entity.steer.frustration).toBeCloseTo((10 + DT / 4) / 2, 5);
    // z stays Oolite's 100 (stored -100): x = 64 + 128, y = -64 - 128
    expect(entity.steer.jink).toEqual(vec(192, -192, -100));
  });

  it("past 10 s with the first draw 0.3 or more and the range beyond 437.5 m, a second draw below 0.3 returns to ATTACK_TARGET (4753-4755)", () => {
    const { entity, used } = flyFrom(PULSE, 1000, {
      frustration: 10,
      successFactor: 500,
      values: [0.5, 0.1, 0.5, 0.75, 0.25],
    });
    expect(used()).toBe(5);
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
  });

  it("inside 437.5 m the second draw is not made (4753)", () => {
    const { entity, used } = flyFrom(PULSE, 300, {
      frustration: 10,
      successFactor: 500,
      values: [0.5, 0.5, 0.75, 0.25],
    });
    expect(used()).toBe(4);
    expect(entity.nav.behaviour).toBe("ATTACK_FLY_FROM_TARGET");
  });

  it("a third draw below 0.3 halves jink z and sets the desired speed to twice the flight speed (4757-4761)", () => {
    const { entity } = flyFrom(PULSE, 1000, {
      frustration: 10,
      successFactor: 500,
      speed: 50,
      desiredSpeed: 100,
      jink: vec(0, 0, -100),
      values: [0.5, 0.5, 0.1, 0.75, 0.25],
    });
    expect(entity.steer.jink.z).toBe(-50);
    // 2 x flight speed = 100: neither above the maximum nor below half of it
    expect(entity.nav.desiredSpeed).toBe(100);
  });

  it("a desired speed above the maximum is cut back unless the target is fast; one below half of it is reset (4765-4773)", () => {
    expect(
      flyFrom(PULSE, 1000, { desiredSpeed: 300, targetSpeed: 100 }).entity.nav
        .desiredSpeed,
    ).toBe(160);
    expect(
      flyFrom(PULSE, 1000, { desiredSpeed: 300, targetSpeed: 200 }).entity.nav
        .desiredSpeed,
    ).toBe(300);
    expect(
      flyFrom(PULSE, 1000, { desiredSpeed: 50 }).entity.nav.desiredSpeed,
    ).toBe(160);
    expect(
      flyFrom(PULSE, 1000, { desiredSpeed: 100 }).entity.nav.desiredSpeed,
    ).toBe(100);
  });

  it("an alert on another body takes avoidCollision after the track (4787-4788)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_FLY_FROM_TARGET";
    entity.steer.proximityAlert = 300;
    const h = harness(
      entity,
      [target(1000), other(300, vec(500, 0, 0))],
      PULSE,
    );
    behaviourAttackFlyFromTarget(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("AVOID_COLLISION");
  });

  it("accuracy 9 dodges a target aiming straight at it (aspect above 0.99999) or dead behind (below -0.999) (4790-4797)", () => {
    // the retreat jink draws two units (accuracy 9 >= 6, jink.x 0, 9096-9098)
    const front = flyFrom(PULSE, 1000, {
      accuracy: 9,
      aspect: 1,
      values: [0.5, 0.5],
    });
    expect(front.entity.nav.behaviour).toBe("EVASIVE_ACTION");
    expect(front.entity.steer.frustration).toBe(0);
    const behind = flyFrom(PULSE, 1000, {
      accuracy: 9,
      aspect: -1,
      values: [0.5, 0.5],
    });
    expect(behind.entity.nav.behaviour).toBe("EVASIVE_ACTION");
    // abeam: no dodge
    const abeam = flyFrom(PULSE, 1000, {
      accuracy: 9,
      aspect: 0,
      values: [0.5, 0.5],
    });
    expect(abeam.entity.nav.behaviour).toBe("ATTACK_FLY_FROM_TARGET");
    // below accuracy 9 there is no dodge
    const eight = flyFrom(PULSE, 1000, {
      accuracy: 8,
      aspect: 1,
      values: [0.5, 0.5],
    });
    expect(eight.entity.nav.behaviour).toBe("ATTACK_FLY_FROM_TARGET");
  });
});
