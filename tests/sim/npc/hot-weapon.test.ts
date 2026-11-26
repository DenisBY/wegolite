// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The weapon temperature live in the attack steering (CBT-15; plan 17-07, D-06,
 * D-07). A pilot that opted in fires through the gate, its forward weapon heats
 * and cools by the float32 rules of `ShipEntity.m:9972` and 2214-2218, and the
 * dispatcher and the sub-behaviours read the entity's temperature as it stands at
 * steering time (after the previous tick's cooling, before this tick's shot) at
 * Oolite's thresholds: `forward_weapon_temp < 0.25f * 256` (ready, 4079, 3932),
 * `< 0.85f * 256` (usable, 4087) and `weapon_temp > 0.85f * 256` (4456, 4577,
 * 4713).
 *
 * Every expected value is derived by hand from Oolite's lines and the damage
 * rules, never from a run of the code under test: the mirror below applies the
 * float32 arithmetic of the cited lines with literals, not the port's own
 * `heatWeapon` and `coolWeapon`. The fire-site fixtures of
 * `tests/oracles/npc/fire-sites` are consumed against the port in plan 17-08,
 * not here.
 */

import { describe, expect, it } from "vitest";

import { createFlightScriptAi } from "../../../src/sim/ai/pilots/flight-script.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import { LASER_STATS } from "../../../src/sim/combat/constants.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { SimEvent } from "../../../src/sim/events.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import {
  behaviourAttackFlyToTarget,
  behaviourFlyToTargetSix,
} from "../../../src/sim/npc/behaviours/attack-close.js";
import {
  behaviourAttackBreakOffTarget,
  behaviourAttackSniper,
} from "../../../src/sim/npc/behaviours/attack-evade.js";
import type { NpcStepFacts } from "../../../src/sim/npc/stats.js";
import { DT } from "../../../src/sim/time.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import type { BehaviourId } from "../../../src/sim/world/ids.js";
import { MAX_ENTITY_ENERGY } from "../../../src/sim/world/limits.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";
import {
  facingAspect,
  harness,
  ship,
  statsWith,
  target,
} from "./attack-support.js";

const { layout } = laveFixture();
const HULLS = realHullTable();
const WEAPONS = realNpcWeapons();
const FACTS: NpcStepFacts = { flight: realNpcFlightTable() };

const STEP_OPTIONS: StepOptions = {
  combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: HULLS, npcWeapons: WEAPONS },
};

/** `NPC_MAX_WEAPON_TEMP 256.0f` (`ShipEntity.h:116`). */
const MAX_TEMP = 256;

/** `WEAPON_COOLING_CUTOUT 0.85f` (`ShipEntity.h:117`), a float32 literal. */
const CUTOUT = Math.fround(0.85);

/** `0.25f * 256.0f` and `0.85f * 256.0f` (`ShipEntity.h:119-120`). */
const READY = Math.fround(0.25) * MAX_TEMP;
const USABLE = CUTOUT * MAX_TEMP;

/** The Viper's beam laser heats 3.2 a shot (`equipment.plist`), a float. */
const SHOT_HEAT = Math.fround(LASER_STATS.EQ_WEAPON_BEAM_LASER.shotTemperature);

/** `(float)(6 * delta_t)` (`ShipEntity.m:2214-2218`). */
const COOL = Math.fround(6 * DT);

/** The preset jink of the dispatcher probes; the ordinary chain zeroes it. */
const PRESET_JINK = vec(50, 60, 70);

/** The player, parked a million kilometres away so it never joins a pair. */
function farPlayer(): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.tick = 0;
  state.position = vec(1e9, 1e9, 1e9);
  return state;
}

interface Duel {
  readonly world: World;
  readonly player: FlightState;
  readonly viper: Entity;
  readonly adder: Entity;
}

/**
 * An opted-in Viper steered by the scripted attack pilot and an inert Adder 3,000
 * m ahead. The Adder's bank is the largest the ledger allows (`MAX_ENTITY_ENERGY`,
 * 1e6) and it has no recharge, so it outlives every shot of the heat-up (about
 * 170 hits of 6 are needed to spend 1,000 energy, and the run is far shorter
 * than the 1e6 bank; review Opus L4).
 */
function duel(seed = 7): Duel {
  return duelWith({ seed });
}

interface DuelOptions {
  readonly seed?: number;
  /** The Adder's distance ahead of the Viper (default 3,000 m). */
  readonly adderZ?: number;
  /** A resolved accuracy for the Viper (default: drawn lazily by the world). */
  readonly accuracy?: number;
  /** The Viper's starting forward weapon temperature (default 0). */
  readonly temperature?: number;
}

function duelWith(options: DuelOptions): Duel {
  const world = createWorld(options.seed ?? 7);
  // PD-06: this scenario is not about the witchpoint beacon (owner decision 2026-11-20)
  world.staticHealth.witchpoint = 0;
  const player = farPlayer();
  const adderResult = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "adder",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, -(options.adderZ ?? 3000)),
      orientation: identity(),
      radius: 30,
      maxEnergy: MAX_ENTITY_ENERGY,
      energyRechargeRate: 0,
      ai: null,
    },
    0,
  );
  if (!adderResult.ok) throw new Error(`spawn refused: ${adderResult.reason}`);
  const viperResult = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "viper",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 30,
      maxEnergy: 180,
      ai: createFlightScriptAi(0, {
        script: "attack",
        targetId: adderResult.entity.id,
        fire: true,
      }),
    },
    0,
  );
  if (!viperResult.ok) throw new Error(`spawn refused: ${viperResult.reason}`);
  if (options.accuracy !== undefined) {
    viperResult.entity.steer.accuracy = options.accuracy;
  }
  if (options.temperature !== undefined) {
    viperResult.entity.weapon.temperature = options.temperature;
  }
  return {
    world,
    player,
    viper: viperResult.entity,
    adder: adderResult.entity,
  };
}

/** The world step of one tick (the player's tick counted up first). */
function stepOnly(world: World, player: FlightState): SimEvent[] {
  player.tick += 1;
  return stepWorld(world, player, layout, DT, AI_REGISTRY, FACTS);
}

/** The drain, recharge, cooling and resolution that follow the world step. */
function drain(world: World, player: FlightState): SimEvent[] {
  return resolveShots(
    world,
    true,
    player,
    undefined,
    [],
    STEP_OPTIONS,
    DT,
    layout,
    AI_REGISTRY,
  );
}

/** One tick of the hand loop: the shot (if any) heats, then the update cools. */
function mirrorTick(temperature: number, fired: boolean): number {
  const heated = fired ? Math.fround(temperature + SHOT_HEAT) : temperature;
  return Math.max(Math.fround(heated - COOL), 0);
}

function shotsOf(events: readonly SimEvent[], shooter: number): number {
  return events.filter(
    (event) => event.kind === "laserFired" && event.shooter === shooter,
  ).length;
}

/** The distance the steering reads: centre distance less the two radii. */
function rangeBetween(a: Entity, b: Entity): number {
  return (
    Math.hypot(
      a.position.x - b.position.x,
      a.position.y - b.position.y,
      a.position.z - b.position.z,
    ) -
    a.radius -
    b.radius
  );
}

describe("a firing attacker heats up, cuts out and recovers (tracer, criterion 1, D-06, D-07)", () => {
  it("the temperature follows the float32 hand loop on every tick; the dispatcher, the fly-to tail and the gate react at Oolite's thresholds", () => {
    const { world, player, viper, adder } = duel();
    let mirror = 0;
    let readyAt = -1;
    let cutoutAt = -1;
    let refusedAtHeat = 0;
    let firedAfterRefusal = 0;
    let firedBelowCutout = 0;
    let peak = 0;
    let readyUpdates = 0;
    let heatingUpdates = 0;
    let overheatedUpdates = 0;
    let handBacks = 0;
    const TICKS = 6000;
    for (let tick = 1; tick <= TICKS; tick += 1) {
      const pre = viper.weapon.temperature;
      expect(pre).toBe(mirror);
      if (readyAt < 0 && pre >= READY) readyAt = tick;
      if (cutoutAt < 0 && pre / MAX_TEMP >= CUTOUT) cutoutAt = tick;
      const before = viper.nav.behaviour;
      const range = rangeBetween(viper, adder);

      stepOnly(world, player);
      const asked = world.fireQueue.some((request) => request.id === viper.id);
      const drawnBefore = viper.rng.combat;
      const fired = shotsOf(drain(world, player), viper.id) === 1;
      const after = viper.nav.behaviour;
      const accuracy = viper.steer.accuracy;
      expect(accuracy).toBeGreaterThanOrEqual(0);

      if (
        before === "ATTACK_TARGET" &&
        tick > 1 &&
        range > 600 &&
        range < 7000
      ) {
        // the target flies away (aspect -1), is not aiming at the viper, and the
        // viper is outside 0.035 x 15,000 m and inside 0.5 x 15,000 m
        if (pre < READY) {
          readyUpdates += 1;
          expect(after).toBe("ATTACK_FLY_TO_TARGET"); // 4156-4170
        } else if (pre < USABLE) {
          heatingUpdates += 1;
          expect(after).toBe("ATTACK_FLY_FROM_TARGET"); // 4122-4126
        } else {
          overheatedUpdates += 1;
          expect(after).toBe("ATTACK_FLY_TO_TARGET"); // 4115-4118
        }
      }
      if (
        before === "ATTACK_FLY_TO_TARGET" &&
        pre > USABLE &&
        (240 - 18 * accuracy) * range < 1250000 &&
        range > 600
      ) {
        // 4713-4720: aspect -1 < 0, so the fly-to tail hands back
        handBacks += 1;
        expect(after).toBe("ATTACK_TARGET");
      }
      if (asked && pre / MAX_TEMP >= CUTOUT) {
        // the gate refuses at heat before its draw: no shot, no draw (9935-9936)
        expect(fired).toBe(false);
        expect(viper.rng.combat).toBe(drawnBefore);
        refusedAtHeat += 1;
      }
      if (fired) {
        // a shot is only ever let through below the cutout
        expect(pre / MAX_TEMP).toBeLessThan(CUTOUT);
        firedBelowCutout += 1;
        if (refusedAtHeat > 0) firedAfterRefusal += 1;
      }
      mirror = mirrorTick(mirror, fired);
      expect(viper.weapon.temperature).toBe(mirror);
      peak = Math.max(peak, mirror);
    }
    // The beam cycle nets 3.2 - 13 x 0.05 = 2.55 a 13-tick period (D-07
    // revised, G-17-1), so the temperature reaches READY (64) after about 26
    // shots (64 / 2.55 = 25.1; tick ~25 x 13 + the first shot's tick, ~330) and
    // the cutout (217.6) after about 86 shots (217.6 / 2.55 = 85.3; tick ~85 x
    // 13 + the first shot's tick, ~1110). The superseded 12-tick period reached
    // them at ~300 and ~1000, so these bounds exclude it.
    expect(readyAt).toBeGreaterThan(310);
    expect(readyAt).toBeLessThan(350);
    expect(cutoutAt).toBeGreaterThan(1060);
    expect(cutoutAt).toBeLessThan(1160);
    // Every branch was visited: the ordinary chain below 64, the heating branch
    // from 64, the no-usable-weapon branch past the cutout, the fly-to hand-back
    // at the cutout; the gate refused from the cutout, cooling let it fire again,
    // and it never ran away (a shot is only let through below the cutout, so the
    // temperature stays under the cutout plus one shot).
    expect(readyUpdates).toBeGreaterThan(0);
    expect(heatingUpdates).toBeGreaterThan(0);
    expect(overheatedUpdates).toBeGreaterThan(0);
    expect(handBacks).toBeGreaterThan(0);
    expect(refusedAtHeat).toBeGreaterThan(0);
    expect(firedAfterRefusal).toBeGreaterThan(0);
    expect(firedBelowCutout).toBeGreaterThan(80);
    expect(peak).toBeLessThan(USABLE + SHOT_HEAT);
    // The Adder's bank was never the limit.
    expect(adder.energy).toBeGreaterThan(MAX_ENTITY_ENERGY - 5000);
  });
});

describe("the dispatcher reads the live temperature (ShipEntity.m:4079-4126)", () => {
  /**
   * Run the duel to the first tick whose steering-time temperature satisfies
   * `at`, put the attacker in ATTACK_TARGET with a preset jink, step that one
   * tick and return what the dispatcher did.
   */
  function probeAt(at: (pre: number) => boolean) {
    const { world, player, viper } = duel();
    let mirror = 0;
    for (let tick = 1; tick <= 1400; tick += 1) {
      const pre = viper.weapon.temperature;
      expect(pre).toBe(mirror);
      if (at(pre)) {
        viper.nav.behaviour = "ATTACK_TARGET";
        viper.steer.jink = PRESET_JINK;
        stepOnly(world, player);
        const fired = shotsOf(drain(world, player), viper.id) === 1;
        return { pre, tick, entity: viper, fired };
      }
      stepOnly(world, player);
      const fired = shotsOf(drain(world, player), viper.id) === 1;
      mirror = mirrorTick(mirror, fired);
    }
    throw new Error("the temperature never reached the probe window");
  }

  it("below 64 the ordinary chain runs: fly to target, jink zeroed (4156-4170)", () => {
    const { pre, entity } = probeAt((t) => t >= 60 && t < READY);
    expect(pre).toBeLessThan(READY);
    expect(entity.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
    expect(entity.steer.jink).toEqual(vec(0, 0, 0));
  });

  it("from 64 up to the usable limit the weapon is heating: back off with an evasive jink (4079-4090, 4122-4126)", () => {
    const { pre, entity } = probeAt((t) => t >= READY);
    expect(pre).toBeGreaterThanOrEqual(READY);
    expect(pre).toBeLessThan(USABLE);
    // The target (an inert Adder) is not aiming at the viper and the viper is
    // inside 0.5 x 15,000 m: ATTACK_FLY_FROM_TARGET with a jink of its own.
    expect(entity.nav.behaviour).toBe("ATTACK_FLY_FROM_TARGET");
    const jink = entity.steer.jink;
    expect(jink.x).not.toBe(PRESET_JINK.x);
    expect(jink.y).not.toBe(PRESET_JINK.y);
    expect(jink.x).not.toBe(0);
    expect(jink.y).not.toBe(0);
    expect(jink.z).toBeLessThan(0); // the stored z is negated (range + 500 - ...)
  });

  it("past the usable limit there is no usable weapon: the target flies away at 2,900 m, so fly to target, and the jink is left as it is (4095-4119)", () => {
    const { pre, entity } = probeAt((t) => t >= USABLE);
    expect(pre).toBeGreaterThanOrEqual(USABLE);
    expect(entity.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
    // The ordinary chain would have zeroed the jink; the overheated branch does not.
    expect(entity.steer.jink).toEqual(PRESET_JINK);
  });
});

describe("break-off's hand-over reads the live temperature (ShipEntity.m:3932)", () => {
  /** The 3932 hand-over setup of attack-evade.test.ts: past 10 s, aspect 0. */
  function breakOff(temperature: number) {
    const entity = ship(6);
    entity.nav.behaviour = "ATTACK_BREAK_OFF_TARGET";
    entity.steer.frustration = 10.5;
    entity.steer.jink = vec(5, 0, 0);
    entity.weapon.temperature = temperature;
    const h = harness(
      entity,
      [target(2000, { orientation: facingAspect(0) })],
      statsWith("EQ_WEAPON_PULSE_LASER"),
      [],
    );
    behaviourAttackBreakOffTarget(entity, h.ctx);
    return entity;
  }

  it("hands over to fly-to-target below 64 (forward_weapon_temp < 0.25f x 256) and not at 64 or above", () => {
    const cool = breakOff(63.9);
    expect(cool.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
    expect(cool.steer.frustration).toBe(0);
    for (const temperature of [READY, 100, 217.6, 250]) {
      const hot = breakOff(temperature);
      expect(hot.nav.behaviour).toBe("ATTACK_BREAK_OFF_TARGET");
      expect(hot.steer.frustration).toBeGreaterThan(10);
    }
  });
});

/** The next float32 above `USABLE`: a temperature strictly above the limit. */
const JUST_ABOVE_USABLE = USABLE + 2 ** -16;

const BEAM = statsWith("EQ_WEAPON_BEAM_LASER"); // 15000
const PULSE = statsWith("EQ_WEAPON_PULSE_LASER"); // 12500

describe("the sniper's hot tail (ShipEntity.m:4456)", () => {
  function sniper(accuracy: number, temperature: number) {
    const entity = ship(accuracy);
    entity.nav.behaviour = "ATTACK_SNIPER";
    entity.weapon.temperature = temperature;
    const h = harness(entity, [target(20000)], BEAM);
    behaviourAttackSniper(entity, h.ctx);
    return entity;
  }

  it("a read above 0.85f x 256 hands back to ATTACK_TARGET for accuracy 0 or more, not below 0", () => {
    expect(sniper(2, 0).nav.behaviour).toBe("ATTACK_SNIPER");
    expect(sniper(2, JUST_ABOVE_USABLE).nav.behaviour).toBe("ATTACK_TARGET");
    expect(sniper(2, 250).nav.behaviour).toBe("ATTACK_TARGET");
    // accuracy >= COMBAT_AI_ISNT_AWFUL (0): 0 hands back, -1 does not
    expect(sniper(0, 250).nav.behaviour).toBe("ATTACK_TARGET");
    expect(sniper(-1, 250).nav.behaviour).toBe("ATTACK_SNIPER");
  });

  it("a read exactly at 0.85f x 256 does not (the compare is strict)", () => {
    expect(sniper(2, USABLE).nav.behaviour).toBe("ATTACK_SNIPER");
    expect(sniper(2, USABLE - 2 ** -16).nav.behaviour).toBe("ATTACK_SNIPER");
  });
});

describe("six and twelve's hot tail (ShipEntity.m:4577)", () => {
  function six(
    behaviour: "ATTACK_FLY_TO_TARGET_SIX" | "ATTACK_FLY_TO_TARGET_TWELVE",
    accuracy: number,
    temperature: number,
  ) {
    const entity = ship(accuracy);
    entity.nav.behaviour = behaviour;
    entity.weapon.temperature = temperature;
    const h = harness(entity, [target(5000)], PULSE);
    behaviourFlyToTargetSix(entity, h.ctx);
    return entity;
  }

  it.each(["ATTACK_FLY_TO_TARGET_SIX", "ATTACK_FLY_TO_TARGET_TWELVE"] as const)(
    "%s hands back to ATTACK_TARGET above 0.85f x 256 at any accuracy, and not at the limit",
    (behaviour) => {
      for (const accuracy of [-5, -1, 0, 2, 9]) {
        expect(six(behaviour, accuracy, 0).nav.behaviour).not.toBe(
          "ATTACK_TARGET",
        );
        expect(six(behaviour, accuracy, USABLE).nav.behaviour).not.toBe(
          "ATTACK_TARGET",
        );
        expect(six(behaviour, accuracy, JUST_ABOVE_USABLE).nav.behaviour).toBe(
          "ATTACK_TARGET",
        );
      }
    },
  );
});

describe("fly-to's hot tail (ShipEntity.m:4713-4720)", () => {
  function flyTo(
    accuracy: number,
    range: number,
    options: {
      temperature?: number;
      aspect?: number;
      missedShots?: number;
      frustration?: number;
    } = {},
  ) {
    const entity = ship(accuracy);
    entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
    entity.weapon.temperature = options.temperature ?? 0;
    entity.weapon.missedShots = options.missedShots ?? 0;
    entity.steer.frustration = options.frustration ?? 0;
    const h = harness(
      entity,
      [target(range, { orientation: facingAspect(options.aspect ?? -1) })],
      PULSE,
    );
    behaviourAttackFlyToTarget(entity, h.ctx);
    return entity;
  }

  it("hot, accuracy >= 0, aim_tolerance x range under 1,250,000 and aspect < 0: frustration 0 and ATTACK_TARGET", () => {
    // accuracy 2: aim_tolerance = 240 - 18 x 2 = 204; 204 x 2,000 = 408,000
    const hot = flyTo(2, 2000, {
      temperature: JUST_ABOVE_USABLE,
      frustration: 1.5,
    });
    expect(hot.nav.behaviour).toBe("ATTACK_TARGET");
    expect(hot.steer.frustration).toBe(0);
    // the same pose cool, or exactly at the limit, keeps flying to the target
    for (const temperature of [0, 100, USABLE]) {
      const cool = flyTo(2, 2000, { temperature, frustration: 1.5 });
      expect(cool.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
      expect(cool.steer.frustration).toBeGreaterThan(1);
    }
  });

  it("the confidence test is on the raw aim_tolerance: 204 x 6,000 passes, 204 x 7,000 does not, and a non-zero missedShots changes neither", () => {
    expect(flyTo(2, 6000, { temperature: 250 }).nav.behaviour).toBe(
      "ATTACK_TARGET",
    );
    expect(flyTo(2, 7000, { temperature: 250 }).nav.behaviour).toBe(
      "ATTACK_FLY_TO_TARGET",
    );
    // currentAimTolerance would shrink with missedShots (204 / (1 + 100 / 4));
    // aim_tolerance, the ivar, does not
    expect(
      flyTo(2, 7000, { temperature: 250, missedShots: 100 }).nav.behaviour,
    ).toBe("ATTACK_FLY_TO_TARGET");
    expect(
      flyTo(2, 6000, { temperature: 250, missedShots: 100 }).nav.behaviour,
    ).toBe("ATTACK_TARGET");
  });

  it("accuracy below 0 never takes it; accuracy 0 does", () => {
    expect(flyTo(-1, 2000, { temperature: 250 }).nav.behaviour).toBe(
      "ATTACK_FLY_TO_TARGET",
    );
    expect(flyTo(0, 2000, { temperature: 250 }).nav.behaviour).toBe(
      "ATTACK_TARGET",
    );
  });

  it("a target that is not fleeing (aspect >= 0) leaves everything as it is: no else (4717)", () => {
    for (const aspect of [0, 0.5, 1]) {
      const entity = flyTo(2, 2000, {
        temperature: 250,
        aspect,
        frustration: 1.5,
      });
      expect(entity.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
      expect(entity.steer.frustration).toBeGreaterThan(1);
    }
  });

  it("the accuracy >= 9 dodge (4721-4730) is not ported: a smart pilot in the target's gunsights keeps flying to it (divergence 21)", () => {
    // accuracy 9, the target dead ahead of us and facing us (aspect 1 > 0.99999),
    // the 4713 condition false (cool weapon): Oolite would take EVASIVE_ACTION
    // against a target with a forward weapon; the port never dodges from fly-to.
    for (const temperature of [0, 250]) {
      const entity = flyTo(9, 2000, { temperature, aspect: 1 });
      expect(entity.nav.behaviour).not.toBe("EVASIVE_ACTION");
    }
  });
});

/** One tick of an injected run: what the steering read and what it did. */
interface HotTick {
  readonly pre: number;
  readonly before: BehaviourId;
  readonly after: BehaviourId;
}

/**
 * Step a pre-heated Viper in the real world with `behaviour` put back on it
 * before every tick, so the one behaviour under test is the one that steers; the
 * hand loop supplies the steering-time temperature from the shots the world
 * fired. The Adder sits `adderZ` ahead with the 1e6 bank and no recharge.
 */
function injectedRun(
  behaviour: BehaviourId,
  options: DuelOptions,
  ticks: number,
): HotTick[] {
  const { world, player, viper } = duelWith(options);
  let mirror = options.temperature ?? 0;
  // The pilot's first think (tick 1) sets ATTACK_TARGET: let it pass first.
  stepOnly(world, player);
  mirror = mirrorTick(mirror, shotsOf(drain(world, player), viper.id) === 1);
  const run: HotTick[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    const pre = viper.weapon.temperature;
    expect(pre).toBe(mirror);
    viper.nav.behaviour = behaviour;
    stepOnly(world, player);
    const fired = shotsOf(drain(world, player), viper.id) === 1;
    run.push({ pre, before: behaviour, after: viper.nav.behaviour });
    mirror = mirrorTick(mirror, fired);
  }
  return run;
}

describe("stepped hot tails against the 1e6-energy target (criterion 1, D-06)", () => {
  it("fly-to: a continuously firing attacker hands back on the first update whose read exceeds the limit", () => {
    const { world, player, viper } = duel();
    let mirror = 0;
    let firstHandOver = -1;
    let firstAbove = -1;
    for (let tick = 1; tick <= 1500; tick += 1) {
      const pre = viper.weapon.temperature;
      expect(pre).toBe(mirror);
      const before = viper.nav.behaviour;
      stepOnly(world, player);
      const fired = shotsOf(drain(world, player), viper.id) === 1;
      if (before === "ATTACK_FLY_TO_TARGET") {
        // accuracy resolved >= 0, the target (flying away) at aspect -1 and
        // 204 x range far under 1,250,000 up to 6,000 m: the hand-back is
        // exactly "the read is above the limit"
        expect(viper.steer.accuracy).toBeGreaterThanOrEqual(0);
        expect(viper.nav.behaviour === "ATTACK_TARGET").toBe(pre > USABLE);
        if (pre > USABLE && firstAbove < 0) firstAbove = tick;
        if (viper.nav.behaviour === "ATTACK_TARGET" && firstHandOver < 0) {
          firstHandOver = tick;
        }
      }
      mirror = mirrorTick(mirror, fired);
    }
    expect(firstAbove).toBeGreaterThan(900);
    expect(firstHandOver).toBe(firstAbove);
  });

  it.each([
    ["ATTACK_FLY_TO_TARGET", 2, 3000],
    ["ATTACK_FLY_TO_TARGET_SIX", -1, 3000],
    ["ATTACK_FLY_TO_TARGET_SIX", 2, 3000],
    ["ATTACK_FLY_TO_TARGET_TWELVE", 2, 3000],
    ["ATTACK_SNIPER", 2, 20000],
  ] as const)(
    "%s (accuracy %d, target %d m): the hand-back follows the cooling read tick by tick",
    (behaviour, accuracy, adderZ) => {
      // 217.9 cools by 0.05 a tick through the limit (217.6000061): the read
      // is above it for the first few updates and below it after.
      const run = injectedRun(
        behaviour,
        { accuracy, adderZ, temperature: Math.fround(217.9) },
        40,
      );
      const above = run.filter((tick) => tick.pre > USABLE);
      const below = run.filter((tick) => !(tick.pre > USABLE));
      expect(above.length).toBeGreaterThan(0);
      expect(below.length).toBeGreaterThan(0);
      for (const tick of run) {
        const handedBack = tick.after === "ATTACK_TARGET";
        expect(handedBack).toBe(tick.pre > USABLE);
      }
    },
  );
});
