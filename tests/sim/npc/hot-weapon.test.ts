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
import { behaviourAttackBreakOffTarget } from "../../../src/sim/npc/behaviours/attack-evade.js";
import type { NpcStepFacts } from "../../../src/sim/npc/stats.js";
import { DT } from "../../../src/sim/time.js";
import type { Entity } from "../../../src/sim/world/entity.js";
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
  const world = createWorld(seed);
  const player = farPlayer();
  const adderResult = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "adder",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, -3000),
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

describe("a firing attacker heats up, cuts out and recovers (tracer, criterion 1, D-06, D-07)", () => {
  it("the temperature follows the float32 hand loop on every tick; the gate refuses from the cutout and lets cooling fire again", () => {
    const { world, player, viper } = duel();
    let mirror = 0;
    let readyAt = -1;
    let cutoutAt = -1;
    let refusedAtHeat = 0;
    let firedAfterRefusal = 0;
    let firedBelowCutout = 0;
    let peak = 0;
    for (let tick = 1; tick <= 1400; tick += 1) {
      const pre = viper.weapon.temperature;
      expect(pre).toBe(mirror);
      if (readyAt < 0 && pre >= READY) readyAt = tick;
      if (cutoutAt < 0 && pre / MAX_TEMP >= CUTOUT) cutoutAt = tick;

      stepOnly(world, player);
      const asked = world.fireQueue.includes(viper.id);
      const drawnBefore = viper.rng.combat;
      const fired = shotsOf(drain(world, player), viper.id) === 1;

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
    // The beam cycle nets 3.2 - 12 x 0.05 = 2.6 a 12-tick period, so the
    // temperature reaches READY (64) after about 25 shots (tick ~300) and the
    // cutout (217.6) after about 84 shots (tick ~1000).
    expect(readyAt).toBeGreaterThan(250);
    expect(readyAt).toBeLessThan(350);
    expect(cutoutAt).toBeGreaterThan(900);
    expect(cutoutAt).toBeLessThan(1100);
    // It cuts out, cooling lets it fire again, and it never runs away: the next
    // shot is only let through below the cutout, so the peak is under cutout + 3.2.
    expect(refusedAtHeat).toBeGreaterThan(0);
    expect(firedAfterRefusal).toBeGreaterThan(0);
    expect(firedBelowCutout).toBeGreaterThan(80);
    expect(peak).toBeLessThan(USABLE + SHOT_HEAT);
    // The Adder's bank was never the limit.
    expect(world.store.get(viper.nav.targetId)?.energy).toBeGreaterThan(
      MAX_ENTITY_ENERGY - 1000,
    );
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
