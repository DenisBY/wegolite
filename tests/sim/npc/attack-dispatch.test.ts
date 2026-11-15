// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The attack dispatcher, `behaviour_attack_target:` (`ShipEntity.m:4038-4185`),
 * as a table (AI-01, plan 14-14). Every row's expected behaviour is written from
 * the cited Oolite line, never from running the implementation. The table
 * covers the branches stock data cannot reach: accuracy 6 and 9, a forced weapon
 * temperature (the ready, usable and overheated tiers), and each weapon type of
 * the Phase 13 laser stats, so the `src/sim/**` branch floor holds. The OUT
 * sub-behaviours (RUNNING_DEFENSE, ATTACK_BROADSIDE and its sides,
 * CLOSE_TO_BROADSIDE_RANGE, CLOSE_WITH_TARGET, ATTACK_MINING_TARGET) are never
 * selected and run the idle fallback when a forced state reaches them. The
 * geometry is in `attack-support.ts`.
 */

import { describe, expect, it } from "vitest";

import { LASER_STATS } from "../../../src/sim/combat/constants.js";
import { LASER_KEYS } from "../../../src/sim/combat/mounts.js";
import { rotate, vec } from "../../../src/sim/math.js";
import {
  behaviourAttackTarget,
  targetTargetsSelf,
  weaponRangeOf,
} from "../../../src/sim/npc/behaviours/attack.js";
import { NO_WEAPON_RANGE } from "../../../src/sim/npc/constants.js";
import { steerShip } from "../../../src/sim/npc/dispatch.js";
import { completeEntry, enterBehaviour } from "../../../src/sim/npc/enter.js";
import { approachAspectToPrimaryTarget } from "../../../src/sim/npc/target.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { BehaviourId } from "../../../src/sim/world/ids.js";
import {
  facingAspect,
  harness,
  ship,
  statsWith,
  target,
  worldOf,
} from "./attack-support.js";
import type { Weapon } from "./attack-support.js";
import { createSyntheticView } from "./oracle-runner.js";

interface Row {
  readonly line: string;
  readonly weapon: Weapon;
  readonly accuracy: number;
  readonly range: number;
  /** The target's approach aspect (facing away from us is -1). */
  readonly aspect?: number;
  readonly temp?: number;
  readonly targetsSelf?: boolean;
  readonly noTarget?: boolean;
  readonly pitchingOver?: boolean;
  readonly selfSpeed?: number;
  readonly targetSpeed?: number;
  readonly stats?: Parameters<typeof statsWith>[1];
  readonly values?: readonly number[];
  readonly expect: BehaviourId;
  /** The number of draws the row consumes. */
  readonly draws?: number;
  /** Oolite's jink after the call (the stored z is negated). */
  readonly jink?: readonly [number, number, number];
}

const PRESET_JINK = vec(50, 60, 70);

function pick(row: Row) {
  const entity = ship(row.accuracy);
  entity.nav.behaviour = "ATTACK_TARGET";
  entity.steer.frustration = 5;
  entity.steer.jink = PRESET_JINK;
  entity.steer.pitchingOver = row.pitchingOver === true;
  entity.speed = row.selfSpeed ?? 0;
  const bodies =
    row.noTarget === true
      ? []
      : [
          target(row.range, {
            orientation: facingAspect(row.aspect ?? -1),
            speed: row.targetSpeed ?? 0,
            targetId: row.targetsSelf === true ? entity.id : 0,
          }),
        ];
  const h = harness(
    entity,
    bodies,
    statsWith(row.weapon, row.stats),
    row.values ?? [],
  );
  const energyBefore = entity.energy;
  behaviourAttackTarget(entity, h.ctx, row.temp);
  // T-14-24: the steering never fires and never spends energy
  expect(worldOf(entity).fireQueue).toEqual([]);
  expect(entity.energy).toBe(energyBefore);
  return { entity, used: h.used() };
}

const TABLE: readonly Row[] = [
  // --- armed, the weapon ready (temperature 0): 4156-4170 ---------------------
  {
    line: "4169 pulse at 5,000 m, accuracy 2: fly to target, jink zeroed",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    expect: "ATTACK_FLY_TO_TARGET",
    jink: [0, 0, 0],
  },
  {
    line: "4160-4161 beam (15,000 m) beyond 12,500 m: sniper",
    weapon: "EQ_WEAPON_BEAM_LASER",
    accuracy: 2,
    range: 20000,
    expect: "ATTACK_SNIPER",
  },
  {
    line: "4160 beam at 13,000 m (above 12,500): sniper",
    weapon: "EQ_WEAPON_BEAM_LASER",
    accuracy: 2,
    range: 13000,
    expect: "ATTACK_SNIPER",
  },
  {
    line: "4160 beam at 12,000 m (not above 12,500): fly to target",
    weapon: "EQ_WEAPON_BEAM_LASER",
    accuracy: 2,
    range: 12000,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  {
    line: "4160 pulse (12,500 m is not above 12,500): never snipes",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 20000,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  {
    line: "4160 mining (12,500 m): never snipes",
    weapon: "EQ_WEAPON_MINING_LASER",
    accuracy: 2,
    range: 20000,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  {
    line: "4160 military (30,000 m) at 20,000 m: sniper",
    weapon: "EQ_WEAPON_MILITARY_LASER",
    accuracy: 2,
    range: 20000,
    expect: "ATTACK_SNIPER",
  },
  {
    line: "4164-4165 awful pilot (accuracy -1), target running away (aspect -1): six",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: -1,
    range: 5000,
    aspect: -1,
    expect: "ATTACK_FLY_TO_TARGET_SIX",
  },
  {
    line: "4166-4167 awful pilot, target coming at us (aspect 1): twelve",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: -1,
    range: 5000,
    aspect: 1,
    expect: "ATTACK_FLY_TO_TARGET_TWELVE",
  },
  {
    line: "4164 an aspect of exactly 0 is not below 0: awful pilot takes twelve",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: -1,
    range: 5000,
    aspect: 0,
    expect: "ATTACK_FLY_TO_TARGET_TWELVE",
  },
  {
    line: "4166 accuracy 0 is not below COMBAT_AI_ISNT_AWFUL: fly to target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 0,
    range: 5000,
    aspect: 1,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  // --- nearby (range under 0.035 x the weapon range): 4137-4155 ----------------
  {
    line: "4154 nearby, accuracy 2: fly from target, jink z 400 + 500 - 0 (two draws)",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 400,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [192, -192, 900],
  },
  {
    line: "4152 nearby, accuracy 6: break off target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 6,
    range: 400,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_BREAK_OFF_TARGET",
  },
  {
    line: "4151-4152 nearby, accuracy 9: break off target",
    weapon: "EQ_WEAPON_BEAM_LASER",
    accuracy: 9,
    range: 400,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_BREAK_OFF_TARGET",
  },
  {
    line: "4151 nearby, accuracy 5.9: still fly from target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 5.9,
    range: 400,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  {
    line: "4138 nearby while pitching over: the jink is left alone and no draw is made",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 400,
    pitchingOver: true,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [50, 60, -70],
  },
  {
    line: "4148 + 8980-8984 nearby with accuracy -2: setEvasiveJink zeroes the jink with no draw",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: -2,
    range: 400,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [0, 0, 0],
  },
  {
    line: "4147-4148 the relative speed is |own - target velocity| / max_flight_pitch: 50 m/s own, pitch 2 gives 25",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 400,
    selfSpeed: 50,
    stats: { maxFlightPitch: 2 },
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [192, -192, 875],
  },
  {
    line: "4147-4148 a target flying the same way at the same speed adds no relative speed",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 400,
    selfSpeed: 50,
    targetSpeed: 50,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [192, -192, 900],
  },
  {
    line: "4147-4148 a target coming head-on at 50 m/s doubles it (own forward and target forward are opposite)",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 400,
    aspect: 1,
    selfSpeed: 50,
    targetSpeed: 50,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [192, -192, 800],
  },
  {
    line: "T-14-16 a ship that cannot pitch has no quotient (no division by zero)",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 400,
    selfSpeed: 50,
    stats: { maxFlightPitch: 0 },
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [192, -192, 900],
  },
  // --- no weapon: 4097-4099 ------------------------------------------------------
  {
    line: "4098-4099 unarmed at 5,000 m: fly from target, jink untouched, no draw",
    weapon: "EQ_WEAPON_NONE",
    accuracy: 2,
    range: 5000,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [50, 60, -70],
  },
  {
    line: "4098-4099 unarmed with accuracy 9 and the target aiming at us: still fly from",
    weapon: "EQ_WEAPON_NONE",
    accuracy: 9,
    range: 400,
    aspect: 1,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  {
    line: "4098-4099 unarmed with accuracy -5 and no target: fly from",
    weapon: "EQ_WEAPON_NONE",
    accuracy: -5,
    range: 0,
    noTarget: true,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  // --- weapons heating (forced temperature): 4083-4090, 4122-4126 ---------------
  {
    line: "4122-4126 usable but not ready (temperature 100), target not aiming at us, range 5,000 under 6,250: back off with jink z 5,500",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    temp: 100,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [192, -192, 5500],
  },
  {
    line: "4122 the same pose with the target aiming at us ([target primaryTarget] == self): the ordinary chain, fly to target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    temp: 100,
    targetsSelf: true,
    draws: 0,
    expect: "ATTACK_FLY_TO_TARGET",
    jink: [0, 0, 0],
  },
  {
    line: "4122 range 7,000 is not under 6,250: the ordinary chain",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 7000,
    temp: 100,
    draws: 0,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  {
    line: "4122 accuracy -1 is not above ISNT_AWFUL: the ordinary chain (six)",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: -1,
    range: 5000,
    temp: 100,
    aspect: -1,
    draws: 0,
    expect: "ATTACK_FLY_TO_TARGET_SIX",
  },
  {
    line: "4122 no target ([nil isShip] is NO): the ordinary chain, where range 0 counts as nearby (4137-4154)",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 0,
    temp: 100,
    noTarget: true,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [192, -192, 500],
  },
  {
    line: "4124 a target moving the same way as us adds nothing: z = 5,000 + 500 - 0",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    temp: 100,
    selfSpeed: 80,
    targetSpeed: 80,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
    jink: [192, -192, 5500],
  },
  {
    line: "4079 temperature 63.9 is under 0.25 x 256 = 64: ready, the ordinary chain",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    temp: 63.9,
    draws: 0,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  {
    line: "4079 temperature 64 is not under 64: heating (the 4122 branch)",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    temp: 64,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  // --- overheated (temperature at or above 0.85 x 256 = 217.6): 4095-4119 --------
  {
    line: "4101-4105 overheated, target aiming at us (aspect 1), in good range, accuracy 2: fly from target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    aspect: 1,
    temp: 250,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  {
    line: "4102-4103 accuracy 6 and a draw of 0.5 (under 0.75): evasive action",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 6,
    range: 5000,
    aspect: 1,
    temp: 250,
    values: [0.5],
    draws: 1,
    expect: "EVASIVE_ACTION",
  },
  {
    line: "4104-4105 accuracy 9 and a draw of 0.9: fly from target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 9,
    range: 5000,
    aspect: 1,
    temp: 250,
    values: [0.9],
    draws: 1,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  {
    line: "4102 accuracy 4.9 is under IS_SMART: no draw",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 4.9,
    range: 5000,
    aspect: 1,
    temp: 250,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  {
    line: "4107-4110 overheated, target aiming at us, outside good range (accuracy 2, 7,000 m: 204 x 7000 over 1,250,000): fly to target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 7000,
    aspect: 1,
    temp: 250,
    draws: 0,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  {
    line: "4114-4115 overheated, target running away, range 400 under 437.5: fly from target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 400,
    aspect: -1,
    temp: 250,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  {
    line: "4116-4117 overheated, target running away, range 5,000: stay on target",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    aspect: -1,
    temp: 250,
    draws: 0,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  {
    line: "4100 an aspect of exactly 0 is not above 0: the running-away branch (range 400 under 437.5)",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 400,
    aspect: 0,
    temp: 250,
    draws: 0,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
  {
    line: "4087 temperature 217.6 is not under 217.6: not usable, the overheated branch",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    aspect: -1,
    temp: 217.6,
    draws: 0,
    expect: "ATTACK_FLY_TO_TARGET",
  },
  {
    line: "4087 temperature 217.5 is usable: heating branch back-off",
    weapon: "EQ_WEAPON_PULSE_LASER",
    accuracy: 2,
    range: 5000,
    aspect: -1,
    temp: 217.5,
    values: [0.75, 0.25],
    draws: 2,
    expect: "ATTACK_FLY_FROM_TARGET",
  },
];

describe("behaviour_attack_target: the dispatcher table (ShipEntity.m:4038-4185)", () => {
  it.each(TABLE.map((row) => [row.line, row] as const))("%s", (_line, row) => {
    const { entity, used } = pick(row);
    expect(entity.nav.behaviour).toBe(row.expect);
    expect(used).toBe(row.draws ?? 0);
    // 4184: the frustration is reset on every path
    expect(entity.steer.frustration).toBe(0);
    if (row.jink !== undefined) {
      // Wegolite stores Oolite's jink with z negated
      expect(entity.steer.jink.x).toBeCloseTo(row.jink[0], 9);
      expect(entity.steer.jink.y).toBeCloseTo(row.jink[1], 9);
      expect(entity.steer.jink.z).toBeCloseTo(0 - row.jink[2], 9);
    }
  });

  it("an unarmed attacker with zero jink alternates ATTACK_TARGET and ATTACK_FLY_FROM_TARGET every tick (4098-4099, 4775)", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_TARGET";
    entity.steer.jink = vec(0, 0, 0);
    const stats = statsWith("EQ_WEAPON_NONE");
    const view = createSyntheticView([target(1000)], entity, 1);
    const seen: BehaviourId[] = [];
    for (let tick = 0; tick < 6; tick += 1) {
      steerShip(entity, {
        view,
        stats,
        dt: 1 / 120,
        draw: () => 0.5,
        emit: () => {},
      });
      seen.push(entity.nav.behaviour);
    }
    expect(seen).toEqual([
      "ATTACK_FLY_FROM_TARGET",
      "ATTACK_TARGET",
      "ATTACK_FLY_FROM_TARGET",
      "ATTACK_TARGET",
      "ATTACK_FLY_FROM_TARGET",
      "ATTACK_TARGET",
    ]);
  });

  it("with jink.x = 200 an unarmed attacker at 1,000 m stays in ATTACK_FLY_FROM_TARGET, with jink.x = -200 it returns at once (4775)", () => {
    const stays = ship(2);
    stays.nav.behaviour = "ATTACK_FLY_FROM_TARGET";
    stays.steer.jink = vec(200, 0, 0);
    const none = statsWith("EQ_WEAPON_NONE");
    const view = createSyntheticView([target(1000)], stays, 1);
    for (let tick = 0; tick < 4; tick += 1) {
      steerShip(stays, {
        view,
        stats: none,
        dt: 1 / 120,
        draw: () => 0.5,
        emit: () => {},
      });
    }
    expect(stays.nav.behaviour).toBe("ATTACK_FLY_FROM_TARGET");

    const returns = ship(2);
    returns.nav.behaviour = "ATTACK_FLY_FROM_TARGET";
    returns.steer.jink = vec(-200, 0, 0);
    steerShip(returns, {
      view: createSyntheticView([target(1000)], returns, 1),
      stats: none,
      dt: 1 / 120,
      draw: () => 0.5,
      emit: () => {},
    });
    expect(returns.nav.behaviour).toBe("ATTACK_TARGET");
  });
});

describe("the weapon range (ShipEntity.m:443-466, 13041-13044)", () => {
  it("no forward weapon has range 0, not 32,000 (NO_WEAPON_RANGE)", () => {
    expect(NO_WEAPON_RANGE).toBe(0);
    expect(weaponRangeOf(statsWith("EQ_WEAPON_NONE"))).toBe(0);
  });

  it.each(LASER_KEYS)("%s is the Phase 13 laser range", (key) => {
    expect(weaponRangeOf(statsWith(key))).toBe(LASER_STATS[key].range);
  });
});

describe("the approach aspect at exactly abeam (ASPECT_ZERO_SNAP)", () => {
  it("a quarter-turned target has the aspect 0, not the 2.2e-16 residue the quaternion rotation leaves", () => {
    const entity = ship(2);
    const body = target(1000, { orientation: facingAspect(0) });
    const raw = rotate(body.orientation, vec(0, 0, -1));
    // the rotation of a quarter turn is never exact in doubles
    expect(Math.abs(raw.z)).toBeGreaterThan(0);
    const h = harness(entity, [body], statsWith("EQ_WEAPON_NONE"));
    expect(approachAspectToPrimaryTarget(entity, h.ctx)).toBe(0);
  });

  it("a real aspect near it is kept", () => {
    const entity = ship(2);
    const body = target(1000, { orientation: facingAspect(0.01) });
    const h = harness(entity, [body], statsWith("EQ_WEAPON_NONE"));
    expect(approachAspectToPrimaryTarget(entity, h.ctx)).toBeCloseTo(0.01, 9);
  });
});

describe("targetTargetsSelf (ShipEntity.m:3921, 4122, 4658, 4669, 8718-8733)", () => {
  const SELF = 101;
  const view = createSyntheticView(
    [
      target(1000, { targetId: SELF }),
      target(1000, { id: 201, targetId: 300 }),
      target(1000, { id: 202, targetId: 0 }),
      target(1000, { id: 203, kind: "planet", targetId: SELF }),
      target(1000, { id: 100, kind: "player", targetId: SELF }),
    ],
    undefined,
    1,
  );

  it("is true for an NPC ship whose target is self", () => {
    expect(targetTargetsSelf(view, 200, SELF)).toBe(true);
  });

  it("is false for an NPC ship that targets another ship or nothing", () => {
    expect(targetTargetsSelf(view, 201, SELF)).toBe(false);
    expect(targetTargetsSelf(view, 202, SELF)).toBe(false);
  });

  it("is false for the player, who never targets an NPC (recorded scope cut), a planet and an unknown id", () => {
    expect(targetTargetsSelf(view, 100, SELF)).toBe(false);
    expect(targetTargetsSelf(view, 203, SELF)).toBe(false);
    expect(targetTargetsSelf(view, 999, SELF)).toBe(false);
  });
});

describe("performAttack (ShipEntityAI.m:350-357)", () => {
  it("sets ATTACK_TARGET and the frustration at once and draws 1250 u + 750 at the next update", () => {
    const entity = ship(2);
    entity.nav.behaviour = "IDLE";
    entity.steer.frustration = 3;
    enterBehaviour(entity, "ATTACK_TARGET");
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(entity.steer.frustration).toBe(0);
    expect(entity.steer.entryPending).toBe(true);

    for (const [u, expected] of [
      [0, 750],
      [0.5, 1375],
      [0.8, 1750],
    ] as const) {
      entity.nav.desiredRange = 0;
      entity.steer.entryPending = true;
      const h = harness(entity, [], statsWith("EQ_WEAPON_NONE"), [u]);
      completeEntry(entity, h.ctx);
      expect(entity.nav.desiredRange).toBeCloseTo(expected, 9);
      expect(entity.steer.entryPending).toBe(false);
      expect(h.used()).toBe(1);
    }
  });

  it("keeps EVASIVE_ACTION when it is current: nothing changes and a pending entry of the same think is cancelled", () => {
    const entity = ship(2);
    entity.nav.behaviour = "EVASIVE_ACTION";
    entity.nav.desiredRange = 123;
    entity.steer.frustration = Math.fround(0.25);
    entity.steer.entryPending = true;
    enterBehaviour(entity, "ATTACK_TARGET");
    expect(entity.nav.behaviour).toBe("EVASIVE_ACTION");
    expect(entity.nav.desiredRange).toBe(123);
    expect(entity.steer.frustration).toBe(Math.fround(0.25));
    expect(entity.steer.entryPending).toBe(false);
  });

  it("FLEE_EVASIVE_ACTION is not guarded: performAttack replaces it", () => {
    const entity = ship(2);
    entity.nav.behaviour = "FLEE_EVASIVE_ACTION";
    enterBehaviour(entity, "ATTACK_TARGET");
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
  });

  it("through ShipControl.perform, the desired range is drawn in the next steerShip update before the dispatcher runs", () => {
    const entity = ship(2);
    const world = worldOf(entity);
    createShipControl(world, entity.id, 0).perform(entity.id, "ATTACK_TARGET");
    expect(entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(entity.steer.entryPending).toBe(true);
    const draws: number[] = [];
    steerShip(entity, {
      view: createSyntheticView([target(5000)], entity, 1),
      stats: statsWith("EQ_WEAPON_NONE"),
      dt: 1 / 120,
      draw: () => {
        draws.push(0.5);
        return 0.5;
      },
      emit: () => {},
    });
    expect(draws).toHaveLength(1);
    expect(entity.nav.desiredRange).toBeCloseTo(1375, 9);
    // the unarmed dispatcher then picked fly from target
    expect(entity.nav.behaviour).toBe("ATTACK_FLY_FROM_TARGET");
  });
});

describe("the grid: no stock record reaches an OUT sub-behaviour", () => {
  const OUT: readonly BehaviourId[] = [
    "RUNNING_DEFENSE",
    "ATTACK_BROADSIDE",
    "ATTACK_BROADSIDE_LEFT",
    "ATTACK_BROADSIDE_RIGHT",
    "CLOSE_TO_BROADSIDE_RANGE",
    "CLOSE_WITH_TARGET",
    "ATTACK_MINING_TARGET",
    "TRACK_AS_TURRET",
  ];
  const WEAPONS: readonly Weapon[] = [
    "EQ_WEAPON_NONE",
    "EQ_WEAPON_PULSE_LASER",
    "EQ_WEAPON_BEAM_LASER",
    "EQ_WEAPON_MINING_LASER",
    "EQ_WEAPON_MILITARY_LASER",
  ];

  it("picks only in-scope sub-behaviours for every weapon, accuracy, range, aspect, temperature and pitching state", () => {
    const picked = new Set<BehaviourId>();
    for (const weapon of WEAPONS) {
      for (let accuracy = -5; accuracy <= 10; accuracy += 1.5) {
        for (const range of [
          -30, 0, 100, 437, 438, 6000, 13000, 20000, 31000,
        ]) {
          for (const aspect of [-1, -0.2, 0, 0.2, 1]) {
            for (const temp of [0, 100, 250]) {
              for (const pitchingOver of [false, true]) {
                const { entity } = pick({
                  line: "grid",
                  weapon,
                  accuracy,
                  range,
                  aspect,
                  temp,
                  pitchingOver,
                  values: [0.1, 0.9, 0.3, 0.7],
                  expect: "ATTACK_TARGET",
                });
                picked.add(entity.nav.behaviour);
                expect(OUT).not.toContain(entity.nav.behaviour);
              }
            }
          }
        }
      }
    }
    expect([...picked].sort()).toEqual(
      [
        "ATTACK_BREAK_OFF_TARGET",
        "ATTACK_FLY_FROM_TARGET",
        "ATTACK_FLY_TO_TARGET",
        "ATTACK_FLY_TO_TARGET_SIX",
        "ATTACK_FLY_TO_TARGET_TWELVE",
        "ATTACK_SNIPER",
        "EVASIVE_ACTION",
      ].sort(),
    );
  });
});

describe("a forced OUT id runs the idle fallback (plan 14-09)", () => {
  const OUT: readonly BehaviourId[] = [
    "RUNNING_DEFENSE",
    "ATTACK_BROADSIDE",
    "ATTACK_BROADSIDE_LEFT",
    "ATTACK_BROADSIDE_RIGHT",
    "CLOSE_TO_BROADSIDE_RANGE",
    "CLOSE_WITH_TARGET",
    "ATTACK_MINING_TARGET",
  ];

  it.each(OUT)("%s does not throw, posts nothing and draws nothing", (id) => {
    const entity = ship(7);
    entity.nav.behaviour = id;
    const events: string[] = [];
    const view = createSyntheticView([target(3000)], entity, 1);
    expect(() =>
      steerShip(entity, {
        view,
        stats: statsWith("EQ_WEAPON_PULSE_LASER"),
        dt: 1 / 120,
        draw: () => {
          throw new Error("an unscripted draw");
        },
        emit: (event) => events.push(event.name),
      }),
    ).not.toThrow();
    expect(events).toEqual([]);
    expect(Number.isFinite(entity.speed)).toBe(true);
  });
});
