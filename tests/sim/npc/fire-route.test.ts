// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The steering route of the NPC fire request (CBT-15; plan 17-06, D-05, D-06,
 * D-12). A pilot that opted in (`fire: true` in its AI params) gets
 * `SteerContext.fire` from the world step; the attack behaviours call it at
 * Oolite's `fireMainWeapon:` sites; the call only queues the ship's id through
 * `requestFire`, and the gate at the drain draws, once per request.
 *
 * Every expected value is derived by hand from the plan, Oolite's call sites
 * (`ShipEntity.m` 3996-4037, 4397-4460, 4461-4581, 4611-4732) and the damage
 * rules, never from a run of the code under test. The fire-site fixtures of
 * `tests/oracles/npc/fire-sites` are consumed against the port in plan 17-08,
 * not here.
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import { createFlightScriptAi } from "../../../src/sim/ai/pilots/flight-script.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import type { AiModule } from "../../../src/sim/ai/types.js";
import { LASER_STATS } from "../../../src/sim/combat/constants.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { SimEvent } from "../../../src/sim/events.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { NpcStepFacts } from "../../../src/sim/npc/stats.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { DT } from "../../../src/sim/time.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { MAX_ENTITIES, NO_ENTITY } from "../../../src/sim/world/ids.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import {
  createWorld,
  requestFire,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const { layout } = laveFixture();
const HULLS = realHullTable();
const WEAPONS = realNpcWeapons();
const FACTS: NpcStepFacts = { flight: realNpcFlightTable() };

const STEP_OPTIONS: StepOptions = {
  combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: HULLS, npcWeapons: WEAPONS },
};

/** The Viper's beam laser: damage 6 a hit (`equipment.plist`). */
const BEAM_DAMAGE = LASER_STATS.EQ_WEAPON_BEAM_LASER.damage;

/** The Adder's maximum energy; its recharge rate is 0 in these worlds. */
const ADDER_ENERGY = 85;

/** A bound far beyond the ticks the attacker needs to reach its fly-to site. */
const TICK_BOUND = 1800;

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
 * A Viper steered by the scripted attack pilot, an inert Adder ahead of it. The
 * Adder has no recharge, so its energy moves only by hits (review Opus L4).
 */
function duel(fire: boolean, seed = 7): Duel {
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
      maxEnergy: ADDER_ENERGY,
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
        ...(fire ? { fire: true } : {}),
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
function stepOnly(
  world: World,
  player: FlightState,
  registry: AiRegistry = AI_REGISTRY,
): SimEvent[] {
  player.tick += 1;
  return stepWorld(world, player, layout, DT, registry, FACTS);
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

function ofKind<K extends SimEvent["kind"]>(
  events: readonly SimEvent[],
  kind: K,
): Extract<SimEvent, { kind: K }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: K }> => event.kind === kind,
  );
}

/** The stream state after one draw from state `seed`. */
function advance(seed: number): number {
  const stream = createRngState(seed);
  rngNext(stream);
  return stream.s;
}

/** The fields a lockstep comparison reads: everything the steering writes. */
function pose(entity: Entity): string {
  return JSON.stringify([
    entity.rng.combat,
    entity.position,
    entity.orientation,
    entity.speed,
    entity.nav.behaviour,
    entity.nav.desiredSpeed,
    entity.steer.successFactor,
    entity.steer.frustration,
  ]);
}

describe("an opted-in scripted attacker fires from fly-to through the gate (tracer, D-05, D-06)", () => {
  it("asks on every fly-to update, the gate draws once per request it lets through, and each hit costs the Adder 6", () => {
    const { world, player, viper, adder } = duel(true);
    let requests = 0;
    let flyToUpdates = 0;
    let shots = 0;
    let hits = 0;
    let energy = ADDER_ENERGY;
    let lastShot = 0;
    for (let i = 0; i < TICK_BOUND && hits < 5; i += 1) {
      const before = viper.nav.behaviour;
      stepOnly(world, player);
      const queued = world.fireQueue.includes(viper.id);
      const afterSteering = viper.rng.combat;
      // Only the fly-to site asks in this scenario (ATTACK_TARGET and the
      // dispatcher have no call site), and the Adder is a live ship thousands
      // of metres away, so no fly-to update returns before its tail: the ship
      // asks on every one of them and on no other tick.
      if (before === "ATTACK_FLY_TO_TARGET") flyToUpdates += 1;
      expect(queued).toBe(before === "ATTACK_FLY_TO_TARGET");
      if (queued) requests += 1;

      const resolved = drain(world, player);
      // The gate's one draw comes only when heat, energy and the 12-tick timer
      // let the request through (`npcFireGate`); a refusal before that takes
      // none. Heat and energy never bind in this short run.
      const timerOpen = lastShot === 0 || player.tick - lastShot >= 12;
      const draws = queued && timerOpen;
      expect(viper.rng.combat).toBe(
        draws ? advance(afterSteering) : afterSteering,
      );
      const fired = ofKind(resolved, "laserFired").filter(
        (event) => event.shooter === viper.id,
      );
      expect(fired.length).toBeLessThanOrEqual(1);
      if (fired.length === 1) {
        expect(draws).toBe(true);
        shots += 1;
        lastShot = player.tick;
      }
      for (const hit of ofKind(resolved, "shipHit")) {
        expect(hit.source).toBe(viper.id);
        expect(hit.target).toBe(adder.id);
        expect(hit.amount).toBe(BEAM_DAMAGE);
        hits += 1;
        energy -= BEAM_DAMAGE;
      }
      expect(adder.energy).toBe(energy);
      expect(world.fireQueue).toEqual([]);
    }
    expect(flyToUpdates).toBeGreaterThan(0);
    expect(requests).toBe(flyToUpdates);
    expect(shots).toBeGreaterThan(0);
    expect(hits).toBe(5);
    expect(adder.energy).toBe(ADDER_ENERGY - BEAM_DAMAGE * hits);
    expect(viper.weapon.lastShotTick).toBe(lastShot);
  });
});

describe("without the opt-in nothing changes (criterion 4, T-17-15)", () => {
  it("the request takes no draw at steering time: the lockstep worlds agree through the first request", () => {
    const on = duel(true);
    const off = duel(false);
    let compared = 0;
    let first = -1;
    for (let i = 0; i < TICK_BOUND; i += 1) {
      stepOnly(on.world, on.player);
      stepOnly(off.world, off.player);
      // The two worlds hold the same state up to the first request: the only
      // difference is the param, which changes the context, not the steering.
      expect(pose(on.viper)).toBe(pose(off.viper));
      expect(off.world.fireQueue).toEqual([]);
      if (on.world.fireQueue.length > 0) {
        expect(on.world.fireQueue).toEqual([on.viper.id]);
        first = on.player.tick;
        break;
      }
      compared += 1;
      drain(on.world, on.player);
      drain(off.world, off.player);
    }
    // The first request comes on a tick after the attack was entered, and the
    // stream is equal on that very tick: the request itself drew nothing.
    expect(first).toBeGreaterThan(1);
    expect(compared).toBe(first - 1);
    expect(on.viper.rng.combat).toBe(off.viper.rng.combat);
  });

  it("a ship without the key queues nothing, fires nothing and keeps a cold weapon over a whole approach", () => {
    const { world, player, viper, adder } = duel(false);
    let flyToUpdates = 0;
    for (let i = 0; i < TICK_BOUND; i += 1) {
      if (viper.nav.behaviour === "ATTACK_FLY_TO_TARGET") flyToUpdates += 1;
      stepOnly(world, player);
      expect(world.fireQueue).toEqual([]);
      const afterSteering = viper.rng.combat;
      const resolved = drain(world, player);
      expect(ofKind(resolved, "laserFired")).toEqual([]);
      expect(viper.rng.combat).toBe(afterSteering);
    }
    // The ship did run fly-to: only the missing key kept it silent.
    expect(flyToUpdates).toBeGreaterThan(0);
    expect(viper.weapon.temperature).toBe(0);
    expect(viper.weapon.lastShotTick).toBe(0);
    expect(adder.energy).toBe(ADDER_ENERGY);
  });

  it('only the value true opts in (a forged 1 or the string "true" does not)', () => {
    for (const forged of [1, "true", false, 0, ""]) {
      const { world, player, viper } = duel(false);
      if (viper.ai === null) throw new Error("the attacker has an AI");
      viper.ai.params["fire"] = forged;
      for (let i = 0; i < 60; i += 1) {
        stepOnly(world, player);
        expect(world.fireQueue).toEqual([]);
        drain(world, player);
      }
      expect(viper.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
    }
  });

  it("a ship with no AI is never steered, so it cannot ask", () => {
    const { world, player, viper } = duel(true);
    viper.ai = null;
    for (let i = 0; i < 60; i += 1) {
      stepOnly(world, player);
      expect(world.fireQueue).toEqual([]);
    }
  });
});

describe("the opt-in key (D-05)", () => {
  const HEAD_KEYS = [
    "script",
    "phase",
    "targetId",
    "range",
    "speed",
    "frustrated",
  ];

  it("createFlightScriptAi has exactly the HEAD param keys without the option", () => {
    expect(
      Object.keys(createFlightScriptAi(0, { script: "attack" }).params),
    ).toEqual(HEAD_KEYS);
    expect(
      Object.keys(
        createFlightScriptAi(0, { script: "attack", fire: false }).params,
      ),
    ).toEqual(HEAD_KEYS);
  });

  it("fire: true adds only the key fire, with the value true", () => {
    const plain = createFlightScriptAi(5, { script: "attack", targetId: 120 });
    const opted = createFlightScriptAi(5, {
      script: "attack",
      targetId: 120,
      fire: true,
    });
    expect(Object.keys(opted.params)).toEqual([...HEAD_KEYS, "fire"]);
    expect(opted.params["fire"]).toBe(true);
    const rest = Object.fromEntries(
      Object.entries(opted.params).filter(([key]) => key !== "fire"),
    );
    expect(rest).toEqual(plain.params);
    expect(opted.aiKey).toBe(plain.aiKey);
    expect(opted.wakeTick).toBe(plain.wakeTick);
    expect(opted.nextThinkTick).toBe(plain.nextThinkTick);
  });

  it("the test pilot uses the same key and value", () => {
    expect(createTestPilotAi(0, { fire: true }).params["fire"]).toBe(true);
    expect(Object.keys(createTestPilotAi(0).params)).not.toContain("fire");
  });
});

describe("requestFire, the one bounded de-duplicated push (D-17, T-17-17)", () => {
  it("queues an id once and keeps call order", () => {
    const world = createWorld(1);
    requestFire(world, 102);
    requestFire(world, 101);
    requestFire(world, 102);
    expect(world.fireQueue).toEqual([102, 101]);
  });

  it("refuses a new id once MAX_ENTITIES are queued and still de-duplicates", () => {
    const world = createWorld(1);
    for (let id = 101; id < 101 + MAX_ENTITIES + 5; id += 1) {
      requestFire(world, id);
    }
    expect(world.fireQueue).toHaveLength(MAX_ENTITIES);
    expect(world.fireQueue[0]).toBe(101);
    expect(world.fireQueue.at(-1)).toBe(101 + MAX_ENTITIES - 1);
    requestFire(world, 101);
    expect(world.fireQueue).toHaveLength(MAX_ENTITIES);
  });

  it("ShipControl.fire delegates to it: one entry per actor, none for another's id", () => {
    const { world, viper, adder } = duel(true);
    const control = createShipControl(world, viper.id, 0);
    control.fire(viper.id);
    control.fire(viper.id);
    control.fire(adder.id); // not the actor: ignored
    expect(world.fireQueue).toEqual([viper.id]);
    // The steering's push and the control's push share the entry.
    requestFire(world, viper.id);
    expect(world.fireQueue).toEqual([viper.id]);
  });

  it("never throws, never exceeds MAX_ENTITIES and never queues an id twice, over any id sequence", () => {
    const ids = fc.oneof(
      fc.integer({ min: 101, max: 101 + 2 * MAX_ENTITIES }),
      fc.integer({ min: -5, max: 5 }),
      fc.constantFrom(
        NO_ENTITY,
        Number.NaN,
        -1,
        0.5,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.MAX_SAFE_INTEGER,
        -0,
      ),
      fc.double({ noNaN: false }),
    );
    fc.assert(
      fc.property(
        fc.array(ids, { minLength: 0, maxLength: 3 * MAX_ENTITIES }),
        (sequence) => {
          const world = createWorld(1);
          for (const id of sequence) {
            requestFire(world, id);
            expect(world.fireQueue.length).toBeLessThanOrEqual(MAX_ENTITIES);
          }
          // One entry per id (SameValueZero: NaN once, -0 and 0 together).
          expect(new Set(world.fireQueue).size).toBe(world.fireQueue.length);
          // The first MAX_ENTITIES distinct ids are kept, in order (a Set
          // folds -0 into 0 as the queue's own comparison does).
          const distinct = [...new Set(sequence)].slice(0, MAX_ENTITIES);
          expect(world.fireQueue).toHaveLength(distinct.length);
          world.fireQueue.forEach((id, index) => {
            const expected = distinct[index] as number;
            expect(id === expected || Object.is(id, expected)).toBe(true);
          });
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("a faulted pilot (review Fable M4, T-17-15)", () => {
  /** A registry whose flight-script module throws on its think. */
  const THROWING: AiRegistry = {
    ...AI_REGISTRY,
    "flight-script": {
      think() {
        throw new Error("scripted fault");
      },
    } satisfies AiModule,
  };

  it("loses its AI, builds no ctx.fire again, and the drain refuses the request already queued", () => {
    const { world, player, viper, adder } = duel(true);
    // Run until the attacker asks on a tick (the real pilot, the real gate).
    let guard = 0;
    while (!world.fireQueue.includes(viper.id) && guard < TICK_BOUND) {
      stepOnly(world, player);
      if (!world.fireQueue.includes(viper.id)) drain(world, player);
      guard += 1;
    }
    expect(world.fireQueue).toEqual([viper.id]);
    drain(world, player);
    // The next tick: steering asks (the AI is still attached), then the think
    // due this tick throws and fault containment nulls the AI.
    viper.ai!.nextThinkTick = player.tick + 1;
    stepOnly(world, player, THROWING);
    expect(viper.ai).toBeNull();
    expect(world.fireQueue).toEqual([viper.id]);

    const energy = viper.energy;
    const heat = viper.weapon.temperature;
    const lastShot = viper.weapon.lastShotTick;
    const stream = viper.rng.combat;
    const events = drain(world, player);
    // The drain refuses it: no draw, no shot, no cost, no heat (the weapon only
    // cools, and the energy only recharges), queue cleared.
    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(viper.rng.combat).toBe(stream);
    expect(viper.weapon.lastShotTick).toBe(lastShot);
    expect(viper.weapon.temperature).toBeLessThanOrEqual(heat);
    expect(viper.energy).toBeGreaterThanOrEqual(energy);
    expect(adder.energy).toBeLessThanOrEqual(ADDER_ENERGY);
    expect(world.fireQueue).toEqual([]);

    // From then on its steering is skipped: nothing is queued again, and a
    // request made on its behalf is refused all the same.
    for (let i = 0; i < 40; i += 1) {
      stepOnly(world, player);
      expect(world.fireQueue).toEqual([]);
    }
    requestFire(world, viper.id);
    const before = viper.rng.combat;
    expect(ofKind(drain(world, player), "laserFired")).toEqual([]);
    expect(viper.rng.combat).toBe(before);
  });
});
