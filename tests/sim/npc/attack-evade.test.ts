// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The sniper, break-off and slow-dogfight attack sub-behaviours against
 * Oolite's rules (AI-01, plan 14-14): `ShipEntity.m:4397-4459`, 3886-3942 and
 * 3944-3994. Expected values are derived by hand from the cited lines, never
 * from running the implementation; the independent oracle fixtures run in
 * `attack.oracle.test.ts`. The geometry is in `attack-support.ts`.
 */

import { describe, expect, it } from "vitest";

import { vec } from "../../../src/sim/math.js";
import {
  behaviourAttackBreakOffTarget,
  behaviourAttackSlowDogfight,
  behaviourAttackSniper,
} from "../../../src/sim/npc/behaviours/attack-evade.js";
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

const PULSE = statsWith("EQ_WEAPON_PULSE_LASER"); // 12500
const BEAM = statsWith("EQ_WEAPON_BEAM_LASER"); // 15000
const MILITARY = statsWith("EQ_WEAPON_MILITARY_LASER"); // 30000

/** `3 - 2^-10`, float32-exact: one dt tips it past 3. */
const NEAR_THREE = 3 - 2 ** -10;

describe("behaviour_attack_sniper (ShipEntity.m:4397-4459)", () => {
  function sniper(
    stats: typeof BEAM,
    range: number,
    options: {
      accuracy?: number;
      frustration?: number;
      successFactor?: number;
      position?: ReturnType<typeof vec>;
      values?: readonly number[];
    } = {},
  ) {
    const entity = ship(options.accuracy ?? 2);
    entity.nav.behaviour = "ATTACK_SNIPER";
    entity.nav.desiredSpeed = 77;
    entity.steer.frustration = options.frustration ?? 0;
    entity.steer.successFactor = options.successFactor ?? 0;
    const body =
      options.position === undefined
        ? target(range)
        : target(range, { position: options.position });
    const h = harness(entity, [body], stats, options.values ?? []);
    behaviourAttackSniper(entity, h.ctx);
    return { entity, ...h };
  }

  it("inside 15,000 m it hands back to ATTACK_TARGET and touches nothing else (4414-4415)", () => {
    const { entity } = sniper(BEAM, 14000);
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(entity.nav.desiredSpeed).toBe(77);
  });

  it("beyond the weapon range it closes at maxFlightSpeed (4417-4424)", () => {
    expect(sniper(BEAM, 20000).entity.nav.desiredSpeed).toBe(160);
  });

  it("inside the weapon range and 0.8 x the scanner range (20,480 m) it creeps at a tenth of the maximum (4425-4427)", () => {
    // military laser, range 30,000: 20,000 is inside both
    expect(sniper(MILITARY, 20000).entity.nav.desiredSpeed).toBe(16);
    // beyond 20,480 m it closes at full speed again
    expect(sniper(MILITARY, 21000).entity.nav.desiredSpeed).toBe(160);
  });

  it("tracking well lowers the frustration by dt (4432-4435)", () => {
    const { entity } = sniper(BEAM, 20000, { frustration: 2 });
    expect(entity.steer.successFactor).toBe(1);
    expect(entity.steer.frustration).toBeCloseTo(2 - DT, 6);
  });

  it("not tracking past 3 s reports, sets jink z 1000, returns to ATTACK_TARGET, resets the frustration and goes full speed (4436-4445)", () => {
    const { entity, events, used } = sniper(BEAM, 20000, {
      frustration: NEAR_THREE,
      successFactor: 0.5,
      position: vec(0, 20060, 0), // straight above: the pitch stick moves, success 0
      values: [0.75, 0.25],
    });
    expect(events).toEqual([{ name: "shipAIFrustrated" }]);
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(entity.steer.frustration).toBe(0);
    expect(entity.nav.desiredSpeed).toBe(160);
    expect(entity.steer.jink).toEqual(vec(192, -192, -1000));
    expect(used()).toBe(2);
  });

  it("not tracking but under 3 s only adds dt (4437)", () => {
    const { entity, events } = sniper(BEAM, 20000, {
      successFactor: 0.5,
      position: vec(0, 20060, 0),
    });
    expect(entity.steer.frustration).toBeCloseTo(DT, 6);
    expect(entity.nav.behaviour).toBe("ATTACK_SNIPER");
    expect(events).toEqual([]);
  });

  it("a target with no body, or beyond 1.25 scanner ranges, is lost (4399-4402)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_SNIPER";
    const none = harness(entity, [], BEAM);
    behaviourAttackSniper(entity, none.ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(none.events).toEqual([{ name: "shipTargetLost" }]);

    const far = ship(2);
    far.nav.behaviour = "ATTACK_SNIPER";
    const h = harness(far, [target(33000)], BEAM);
    behaviourAttackSniper(far, h.ctx);
    expect(far.nav.behaviour).toBe("IDLE");
    expect(h.events).toEqual([{ name: "shipTargetLost", a: TARGET_ID }]);
  });
});

describe("behaviour_attack_break_off_target (ShipEntity.m:3886-3942)", () => {
  function breakOff(
    range: number,
    options: {
      accuracy?: number;
      aspect?: number;
      targetsSelf?: boolean;
      frustration?: number;
      jinkX?: number;
      alert?: number;
      bodies?: ReturnType<typeof other>[];
      values?: readonly number[];
    } = {},
  ) {
    const entity = ship(options.accuracy ?? 7);
    entity.nav.behaviour = "ATTACK_BREAK_OFF_TARGET";
    entity.steer.frustration = options.frustration ?? 0;
    entity.steer.jink = vec(options.jinkX ?? 0, 0, 0);
    entity.steer.proximityAlert = options.alert ?? 0;
    const h = harness(
      entity,
      [
        target(range, {
          orientation: facingAspect(options.aspect ?? -1),
          targetId: options.targetsSelf === true ? entity.id : 0,
        }),
        ...(options.bodies ?? []),
      ],
      PULSE,
      options.values ?? [],
    );
    behaviourAttackBreakOffTarget(entity, h.ctx);
    return { entity, ...h };
  }

  it("flies at the maximum speed (3898)", () => {
    expect(breakOff(2000, { values: [0.5, 0.5] }).entity.nav.desiredSpeed).toBe(
      160,
    );
  });

  it("an alert on any body, the target included, avoids it before anything else changes (3911-3914)", () => {
    const onTarget = breakOff(2000, { alert: TARGET_ID, frustration: 1 });
    expect(onTarget.entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(onTarget.entity.steer.frustration).toBe(1);
    const onOther = breakOff(2000, {
      alert: 300,
      bodies: [other(300, vec(500, 0, 0))],
      frustration: 1,
    });
    expect(onOther.entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(onOther.entity.steer.frustration).toBe(1);
  });

  it("beyond 0.5 x the weapon range (6,250 m) it hands back to ATTACK_TARGET (3928-3929)", () => {
    const { entity } = breakOff(7000, { values: [0.5, 0.5] });
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
  });

  it("a target dead ahead of its heading (aspect below -0.75) gives slow dogfight to a pilot of 6.5 or more, not below (3930-3931)", () => {
    expect(
      breakOff(2000, { accuracy: 7, values: [0.5, 0.5] }).entity.nav.behaviour,
    ).toBe("ATTACK_SLOW_DOGFIGHT");
    expect(
      breakOff(2000, { accuracy: 6, values: [0.5, 0.5] }).entity.nav.behaviour,
    ).toBe("ATTACK_BREAK_OFF_TARGET");
  });

  it("past 10 s with aspect under 0.85 it resets the frustration and hands over to slow dogfight (6.5+) or fly-to-target (3932-3938)", () => {
    const smart = breakOff(2000, {
      accuracy: 7,
      aspect: 0,
      frustration: 10.5,
      jinkX: 5,
    });
    expect(smart.entity.nav.behaviour).toBe("ATTACK_SLOW_DOGFIGHT");
    expect(smart.entity.steer.frustration).toBe(0);
    const plain = breakOff(2000, {
      accuracy: 6,
      aspect: 0,
      frustration: 10.5,
      jinkX: 5,
    });
    expect(plain.entity.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
    expect(plain.entity.steer.frustration).toBe(0);
    // an aspect of 0.9 (above 0.85) does not
    const high = breakOff(2000, {
      accuracy: 6,
      aspect: 0.9,
      frustration: 10.5,
      jinkX: 5,
    });
    expect(high.entity.nav.behaviour).toBe("ATTACK_BREAK_OFF_TARGET");
  });

  it("past 15 s a pilot of 6.5 or more halves its speed (3917-3919)", () => {
    expect(
      breakOff(2000, { accuracy: 7, frustration: 15.5, jinkX: 5, aspect: 0 })
        .entity.nav.desiredSpeed,
    ).toBe(80);
    expect(
      breakOff(2000, { accuracy: 6, frustration: 15.5, jinkX: 5, aspect: 0 })
        .entity.nav.desiredSpeed,
    ).toBe(160);
  });

  it("retreats (two jink draws at accuracy 7 with a zero jink) when the target is not aiming at it, and evades (no draw) when it is and the fraction is under the aspect (3921-3926)", () => {
    const retreat = breakOff(2000, { aspect: 1, values: [0.5, 0.5] });
    expect(retreat.used()).toBe(2);
    // the target targets us, aspect 1: the fraction dt is not above min(1.6 / 2, 1) = 0.8
    const evade = breakOff(2000, { aspect: 1, targetsSelf: true });
    expect(evade.used()).toBe(0);
    expect(evade.entity.steer.flightPitch).toBeCloseTo(4 * DT, 9);
  });

  it("retreats beyond 3,000 m even when the target aims at it, and once the frustration fraction passes the aspect (3921)", () => {
    expect(
      breakOff(4000, {
        aspect: 1,
        targetsSelf: true,
        values: [0.5, 0.5],
      }).used(),
    ).toBe(2);
    // aspect 0.1: the fraction after the update is 0.99 + dt - 0 = 0.998 > 0.1
    expect(
      breakOff(2000, {
        aspect: 0.1,
        targetsSelf: true,
        frustration: 0.99,
        values: [0.5, 0.5],
      }).used(),
    ).toBe(2);
    // and with the fraction dt under 0.1 it evades
    expect(breakOff(2000, { aspect: 0.1, targetsSelf: true }).used()).toBe(0);
  });

  it("a lost target goes idle (3888-3891)", () => {
    const entity = ship(7);
    entity.nav.behaviour = "ATTACK_BREAK_OFF_TARGET";
    const h = harness(entity, [], PULSE);
    behaviourAttackBreakOffTarget(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(h.events).toEqual([{ name: "shipTargetLost" }]);
  });
});

describe("behaviour_attack_slow_dogfight (ShipEntity.m:3944-3994)", () => {
  function dogfight(
    range: number,
    options: {
      aspect?: number;
      targetSpeed?: number;
      frustration?: number;
      alert?: number;
      bodies?: ReturnType<typeof other>[];
    } = {},
  ) {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_SLOW_DOGFIGHT";
    entity.nav.desiredSpeed = 77;
    entity.steer.frustration = options.frustration ?? 0;
    entity.steer.proximityAlert = options.alert ?? 0;
    const h = harness(
      entity,
      [
        target(range, {
          orientation: facingAspect(options.aspect ?? -1),
          speed: options.targetSpeed ?? 0,
        }),
        ...(options.bodies ?? []),
      ],
      PULSE,
    );
    behaviourAttackSlowDogfight(entity, h.ctx);
    return { entity, ...h };
  }

  it("mostly behind the target (aspect below -0.5) within 875 m it keeps up: min(0.5 x maximum, 0.5 x target speed) (3966)", () => {
    expect(
      dogfight(500, { aspect: -0.8, targetSpeed: 100 }).entity.nav.desiredSpeed,
    ).toBeCloseTo(50, 9);
    expect(
      dogfight(500, { aspect: -0.8, targetSpeed: 200 }).entity.nav.desiredSpeed,
    ).toBeCloseTo(80, 9);
  });

  it("mostly behind the target beyond 2 x 0.035 x 12,500 = 875 m it returns to ATTACK_TARGET and sets no speed (3962-3963)", () => {
    const { entity } = dogfight(2000, { aspect: -0.8, targetSpeed: 100 });
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(entity.nav.desiredSpeed).toBe(77);
  });

  it("abeam (aspect under 0.3) it slows to a tenth of the maximum (3969)", () => {
    expect(dogfight(500, { aspect: 0 }).entity.nav.desiredSpeed).toBeCloseTo(
      16,
      9,
    );
    expect(dogfight(500, { aspect: 0.2 }).entity.nav.desiredSpeed).toBeCloseTo(
      16,
      9,
    );
  });

  it("in front of the target it accelerates by 2.5 x the aspect of the maximum, at most all of it (3972)", () => {
    expect(dogfight(500, { aspect: 0.32 }).entity.nav.desiredSpeed).toBeCloseTo(
      160 * 0.32 * 2.5,
      6,
    );
    expect(dogfight(500, { aspect: 0.6 }).entity.nav.desiredSpeed).toBeCloseTo(
      160,
      9,
    );
  });

  it("an aspect above 0.85 hands over to break-off (3974-3976)", () => {
    expect(dogfight(500, { aspect: 0.9 }).entity.nav.behaviour).toBe(
      "ATTACK_BREAK_OFF_TARGET",
    );
    expect(dogfight(500, { aspect: 0.8 }).entity.nav.behaviour).toBe(
      "ATTACK_SLOW_DOGFIGHT",
    );
  });

  it("the frustration grows by dt with a positive aspect, shrinks by dt otherwise and is floored at 0 (3977-3985)", () => {
    expect(
      dogfight(500, { aspect: 0.5, frustration: 1 }).entity.steer.frustration,
    ).toBeCloseTo(1 + DT, 6);
    expect(
      dogfight(500, { aspect: 0, frustration: 1 }).entity.steer.frustration,
    ).toBeCloseTo(1 - DT, 6);
    expect(
      dogfight(500, { aspect: 0, frustration: 0 }).entity.steer.frustration,
    ).toBe(0);
  });

  it("past 10 s of frustration the speed is halved (3982-3983)", () => {
    expect(
      dogfight(500, { aspect: 0.6, frustration: 10.5 }).entity.nav.desiredSpeed,
    ).toBeCloseTo(80, 9);
  });

  it("an alert on another body avoids it; an alert on the target only when within 2.5 radii sums and in front (3950-3961)", () => {
    const onOther = dogfight(500, {
      alert: 300,
      bodies: [other(300, vec(500, 0, 0))],
    });
    expect(onOther.entity.nav.behaviour).toBe("AVOID_COLLISION");

    // 2.5 x (10 + 50) = 150: range 100 with the target aspect positive
    const close = dogfight(100, { alert: TARGET_ID, aspect: 1 });
    expect(close.entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(close.entity.steer.saved?.behaviour).toBe("ATTACK_SLOW_DOGFIGHT");
    expect(close.entity.nav.desiredSpeed).toBe(160);

    // beyond 150 m, or with a non-positive aspect, the alert on the target is ignored
    expect(
      dogfight(200, { alert: TARGET_ID, aspect: 1 }).entity.nav.behaviour,
    ).toBe("ATTACK_BREAK_OFF_TARGET");
    expect(
      dogfight(100, { alert: TARGET_ID, aspect: -1 }).entity.nav.behaviour,
    ).toBe("ATTACK_SLOW_DOGFIGHT");
  });

  it("a lost target goes idle (3946-3949)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_SLOW_DOGFIGHT";
    const h = harness(entity, [], PULSE);
    behaviourAttackSlowDogfight(entity, h.ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(h.events).toEqual([{ name: "shipTargetLost" }]);
  });
});
