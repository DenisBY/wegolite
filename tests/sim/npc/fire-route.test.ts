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

import { readFileSync } from "node:fs";

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
import {
  behaviourAttackFlyToTarget,
  behaviourFlyToTargetSix,
} from "../../../src/sim/npc/behaviours/attack-close.js";
import { behaviourAttackSniper } from "../../../src/sim/npc/behaviours/attack-evade.js";
import { behaviourEvasiveAction } from "../../../src/sim/npc/behaviours/evasive.js";
import { BEHAVIOUR_ROUTES } from "../../../src/sim/npc/dispatch.js";
import type { SteerContext } from "../../../src/sim/npc/dispatch.js";
import type { NpcStepFacts } from "../../../src/sim/npc/stats.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { DT } from "../../../src/sim/time.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { MAX_ENTITIES, NO_ENTITY } from "../../../src/sim/world/ids.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import {
  MAX_FIRE_REQUESTS,
  createWorld,
  requestFire,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";
import {
  TARGET_ID,
  facingAspect,
  harness,
  other,
  ship,
  statsWith,
  target,
} from "./attack-support.js";
import type { Harness } from "./attack-support.js";

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
  // PD-06: this scenario is not about the witchpoint beacon (owner decision 2026-11-20)
  world.staticHealth.witchpoint = 0;
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
      const queued = world.fireQueue.some((r) => r.id === viper.id);
      const afterSteering = viper.rng.combat;
      // Only the fly-to site asks in this scenario (ATTACK_TARGET and the
      // dispatcher have no call site), and the Adder is a live ship thousands
      // of metres away, so no fly-to update returns before its tail: the ship
      // asks on every one of them and on no other tick.
      if (before === "ATTACK_FLY_TO_TARGET") flyToUpdates += 1;
      expect(queued).toBe(before === "ATTACK_FLY_TO_TARGET");
      if (queued) requests += 1;

      const resolved = drain(world, player);
      // The gate's one draw comes only when heat, energy and the 13-tick timer
      // let the request through (`npcFireGate`); a refusal before that takes
      // none. Heat and energy never bind in this short run.
      const timerOpen = lastShot === 0 || player.tick - lastShot >= 13;
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
        expect(on.world.fireQueue).toEqual([
          { id: on.viper.id, facing: "fore" },
        ]);
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
    expect(world.fireQueue).toEqual([
      { id: 102, facing: "fore" },
      { id: 101, facing: "fore" },
    ]);
  });

  it("refuses a new request once MAX_FIRE_REQUESTS are queued and still de-duplicates", () => {
    const world = createWorld(1);
    for (let id = 101; id < 101 + MAX_FIRE_REQUESTS + 5; id += 1) {
      requestFire(world, id);
    }
    expect(world.fireQueue).toHaveLength(MAX_FIRE_REQUESTS);
    expect(world.fireQueue[0]).toEqual({ id: 101, facing: "fore" });
    expect(world.fireQueue.at(-1)).toEqual({
      id: 101 + MAX_FIRE_REQUESTS - 1,
      facing: "fore",
    });
    requestFire(world, 101);
    expect(world.fireQueue).toHaveLength(MAX_FIRE_REQUESTS);
  });

  it("ShipControl.fire delegates to it: one entry per actor, none for another's id", () => {
    const { world, viper, adder } = duel(true);
    const control = createShipControl(world, viper.id, 0);
    control.fire(viper.id);
    control.fire(viper.id);
    control.fire(adder.id); // not the actor: ignored
    expect(world.fireQueue).toEqual([{ id: viper.id, facing: "fore" }]);
    // The steering's push and the control's push share the entry.
    requestFire(world, viper.id);
    expect(world.fireQueue).toEqual([{ id: viper.id, facing: "fore" }]);
  });

  it("never throws, never exceeds MAX_FIRE_REQUESTS and never queues an id twice, over any id sequence (a non-integer id is ignored)", () => {
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
            expect(world.fireQueue.length).toBeLessThanOrEqual(
              MAX_FIRE_REQUESTS,
            );
          }
          // One entry per id (a Set folds -0 into 0 as the queue's own
          // comparison does), and only integer ids are queued.
          const queuedIds = world.fireQueue.map((request) => request.id);
          expect(new Set(queuedIds).size).toBe(queuedIds.length);
          // The distinct integer ids are kept, in order.
          const distinct = [
            ...new Set(sequence.filter((id) => Number.isSafeInteger(id))),
          ].slice(0, MAX_FIRE_REQUESTS);
          expect(queuedIds).toHaveLength(distinct.length);
          queuedIds.forEach((id, index) => {
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
    const asked = (): boolean => world.fireQueue.some((r) => r.id === viper.id);
    while (!asked() && guard < TICK_BOUND) {
      stepOnly(world, player);
      if (!asked()) drain(world, player);
      guard += 1;
    }
    expect(world.fireQueue).toEqual([{ id: viper.id, facing: "fore" }]);
    drain(world, player);
    // The next tick: steering asks (the AI is still attached), then the think
    // due this tick throws and fault containment nulls the AI.
    viper.ai!.nextThinkTick = player.tick + 1;
    stepOnly(world, player, THROWING);
    expect(viper.ai).toBeNull();
    expect(world.fireQueue).toEqual([{ id: viper.id, facing: "fore" }]);

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

// ---------------------------------------------------------------------------
// The fire sites (D-06, D-12): one ctx.fire call at each of Oolite's
// fireMainWeapon: sites of the attack IN list, as the last statement of every
// path that reaches it. Geometry and weapon ranges are those of attack-support.
// ---------------------------------------------------------------------------

const PULSE = statsWith("EQ_WEAPON_PULSE_LASER"); // range 12,500
const BEAM = statsWith("EQ_WEAPON_BEAM_LASER"); // range 15,000

/** A context that counts its fire calls. */
function counted(h: Harness): { ctx: SteerContext; calls: () => number } {
  let calls = 0;
  return {
    ctx: {
      ...h.ctx,
      fire: () => {
        calls += 1;
      },
    },
    calls: () => calls,
  };
}

/**
 * Run `scenario` twice, once with a counting `ctx.fire` and once without one,
 * and return the fire count of the first run. Without the opt-in the update must
 * leave exactly the state, the events and the draws the update leaves with it:
 * the call is a pure request.
 */
function viaSite(
  scenario: (withFire: boolean) => {
    entity: ReturnType<typeof ship>;
    h: Harness;
    calls: () => number;
  },
): number {
  const on = scenario(true);
  const off = scenario(false);
  expect(JSON.stringify([off.entity.nav, off.entity.steer])).toBe(
    JSON.stringify([on.entity.nav, on.entity.steer]),
  );
  expect(off.h.events).toEqual(on.h.events);
  expect(off.h.used()).toBe(on.h.used());
  expect(off.calls()).toBe(0);
  return on.calls();
}

describe("evasive and flee-evasive ask once, after the hand-over (ShipEntity.m:4035)", () => {
  function evasive(
    behaviour: "EVASIVE_ACTION" | "FLEE_EVASIVE_ACTION",
    options: {
      frustration?: number;
      alert?: number;
      targetPresent?: boolean;
      bodies?: ReturnType<typeof other>[];
    } = {},
  ) {
    return (withFire: boolean) => {
      const entity = ship(2);
      entity.nav.behaviour = behaviour;
      entity.nav.desiredSpeed = 3;
      entity.steer.frustration = options.frustration ?? 0;
      entity.steer.proximityAlert = options.alert ?? 0;
      const h = harness(
        entity,
        [
          ...(options.targetPresent === false ? [] : [target(1000)]),
          ...(options.bodies ?? []),
        ],
        PULSE,
        [0.5, 0.5, 0.5, 0.5],
      );
      const c = counted(h);
      behaviourEvasiveAction(entity, withFire ? c.ctx : h.ctx);
      return { entity, h, calls: c.calls };
    };
  }

  it("asks once per update in both behaviours, whatever the frustration", () => {
    for (const behaviour of [
      "EVASIVE_ACTION",
      "FLEE_EVASIVE_ACTION",
    ] as const) {
      expect(viaSite(evasive(behaviour))).toBe(1);
    }
  });

  it("asks after the hand-over, so the request follows the new behaviour", () => {
    // 0.5 s of frustration: one more dt tips it past 0.5 (4021-4028)
    const flee = evasive("FLEE_EVASIVE_ACTION", { frustration: 0.5 })(true);
    expect(flee.entity.nav.behaviour).toBe("FLEE_TARGET");
    expect(flee.calls()).toBe(1);
    const attack = evasive("EVASIVE_ACTION", { frustration: 0.5 })(true);
    expect(attack.entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(attack.calls()).toBe(1);
  });

  it("does not ask on the proximity-alert return, even when the alert is the target", () => {
    const onOther = evasive("EVASIVE_ACTION", {
      alert: 300,
      bodies: [other(300, vec(500, 0, 0))],
    })(true);
    expect(onOther.entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(onOther.calls()).toBe(0);
    const onTarget = evasive("FLEE_EVASIVE_ACTION", { alert: TARGET_ID })(true);
    expect(onTarget.entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(onTarget.calls()).toBe(0);
  });

  it("asks with a target lost during evasiveAction: no target guard, the gate refuses later (D-12)", () => {
    const lost = evasive("EVASIVE_ACTION", { targetPresent: false })(true);
    expect(lost.h.events).toEqual([{ name: "shipTargetLost" }]);
    expect(lost.calls()).toBe(1);
  });
});

describe("the sniper asks on both sides of 15,000 m, after the if/else (ShipEntity.m:4414-4454)", () => {
  function sniper(
    range: number,
    options: {
      frustration?: number;
      successFactor?: number;
      position?: ReturnType<typeof vec>;
      values?: readonly number[];
    } = {},
  ) {
    return (withFire: boolean) => {
      const entity = ship(2);
      entity.nav.behaviour = "ATTACK_SNIPER";
      entity.nav.desiredSpeed = 77;
      entity.steer.frustration = options.frustration ?? 0;
      entity.steer.successFactor = options.successFactor ?? 0;
      const body =
        options.position === undefined
          ? target(range)
          : target(range, { position: options.position });
      const h = harness(entity, [body], BEAM, options.values ?? []);
      const c = counted(h);
      behaviourAttackSniper(entity, withFire ? c.ctx : h.ctx);
      return { entity, h, calls: c.calls };
    };
  }

  it("above 15,000 m it asks after the speed and tracking", () => {
    expect(viaSite(sniper(20000))).toBe(1);
    expect(sniper(20000)(true).entity.nav.behaviour).toBe("ATTACK_SNIPER");
  });

  it("below 15,000 m it hands back to ATTACK_TARGET and asks in the same update (Oolite's fall-through)", () => {
    const inside = sniper(14000)(true);
    expect(inside.entity.nav.behaviour).toBe("ATTACK_TARGET");
    // nothing else of the update ran: the speed stays and no draw was taken
    expect(inside.entity.nav.desiredSpeed).toBe(77);
    expect(inside.h.used()).toBe(0);
    expect(viaSite(sniper(14000))).toBe(1);
  });

  it("asks when the frustration limit hands the update back to ATTACK_TARGET", () => {
    const limit = 3 - 2 ** -10; // one dt tips it past 3 s (4436-4445)
    const run = sniper(20000, {
      frustration: limit,
      successFactor: 0.5,
      position: vec(0, 20060, 0),
      values: [0.75, 0.25],
    })(true);
    expect(run.entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(run.calls()).toBe(1);
  });

  it("a lost target returns before the request", () => {
    const entity = ship(2);
    entity.nav.behaviour = "ATTACK_SNIPER";
    const none = harness(entity, [], BEAM);
    const c = counted(none);
    behaviourAttackSniper(entity, c.ctx);
    expect(entity.nav.behaviour).toBe("IDLE");
    expect(c.calls()).toBe(0);

    const far = ship(2);
    far.nav.behaviour = "ATTACK_SNIPER";
    const h = harness(far, [target(33000)], BEAM);
    const cf = counted(h);
    behaviourAttackSniper(far, cf.ctx);
    expect(far.nav.behaviour).toBe("IDLE");
    expect(cf.calls()).toBe(0);
  });
});

describe("six and twelve ask on every update that reaches 4575", () => {
  function six(
    behaviour: "ATTACK_FLY_TO_TARGET_SIX" | "ATTACK_FLY_TO_TARGET_TWELVE",
    range: number,
    options: {
      alert?: number;
      targetPresent?: boolean;
      aspect?: number;
      bodies?: ReturnType<typeof other>[];
    } = {},
  ) {
    return (withFire: boolean) => {
      const entity = ship(2);
      entity.nav.behaviour = behaviour;
      entity.nav.destination = vec(0, 0, -(range + 60));
      entity.steer.proximityAlert = options.alert ?? 0;
      const h = harness(
        entity,
        [
          ...(options.targetPresent === false
            ? []
            : [
                target(range, {
                  orientation: facingAspect(options.aspect ?? -1),
                }),
              ]),
          ...(options.bodies ?? []),
        ],
        PULSE,
      );
      const c = counted(h);
      behaviourFlyToTargetSix(entity, withFire ? c.ctx : h.ctx);
      return { entity, h, calls: c.calls };
    };
  }

  it("asks once per update, six and twelve, far and near", () => {
    for (const behaviour of [
      "ATTACK_FLY_TO_TARGET_SIX",
      "ATTACK_FLY_TO_TARGET_TWELVE",
    ] as const) {
      expect(viaSite(six(behaviour, 20000))).toBe(1);
      // inside the vector-in distance the behaviour hands over, and still asks
      const near = six(behaviour, 400)(true);
      expect(near.entity.nav.behaviour).toBe("ATTACK_FLY_TO_TARGET");
      expect(near.calls()).toBe(1);
    }
  });

  it("does not ask when an alert returns first, on the target or on another body, or when the target is lost", () => {
    const onTarget = six("ATTACK_FLY_TO_TARGET_SIX", 5000, {
      alert: TARGET_ID,
    })(true);
    expect(onTarget.calls()).toBe(0);
    const onOther = six("ATTACK_FLY_TO_TARGET_TWELVE", 5000, {
      alert: 300,
      bodies: [other(300, vec(500, 0, 0))],
    })(true);
    expect(onOther.entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(onOther.calls()).toBe(0);
    const lost = six("ATTACK_FLY_TO_TARGET_SIX", 5000, {
      targetPresent: false,
    })(true);
    expect(lost.entity.nav.behaviour).toBe("IDLE");
    expect(lost.calls()).toBe(0);
  });
});

describe("fly-to asks as its last statement (ShipEntity.m:4711)", () => {
  function flyTo(
    range: number,
    options: {
      alert?: number;
      targetPresent?: boolean;
      targetSpeed?: number;
      bodies?: ReturnType<typeof other>[];
    } = {},
  ) {
    return (withFire: boolean) => {
      const entity = ship(2);
      entity.nav.behaviour = "ATTACK_FLY_TO_TARGET";
      entity.steer.proximityAlert = options.alert ?? 0;
      const h = harness(
        entity,
        [
          ...(options.targetPresent === false
            ? []
            : [target(range, { speed: options.targetSpeed ?? 0 })]),
          ...(options.bodies ?? []),
        ],
        PULSE,
      );
      const c = counted(h);
      behaviourAttackFlyToTarget(entity, withFire ? c.ctx : h.ctx);
      return { entity, h, calls: c.calls };
    };
  }

  it("asks once per update that reaches the end, far, near and after the hand-back to ATTACK_TARGET", () => {
    expect(viaSite(flyTo(10000))).toBe(1);
    expect(viaSite(flyTo(300, { targetSpeed: 100 }))).toBe(1);
    const handBack = flyTo(300, { targetSpeed: 100 })(true);
    expect(handBack.entity.nav.behaviour).toBe("ATTACK_TARGET");
    expect(handBack.calls()).toBe(1);
  });

  it("an alert on the target is ignored and the update still reaches the call", () => {
    expect(flyTo(10000, { alert: TARGET_ID })(true).calls()).toBe(1);
  });

  it("does not ask when it returns earlier: a lost target, a target too far to track, an alert on another body", () => {
    expect(flyTo(10000, { targetPresent: false })(true).calls()).toBe(0);
    expect(flyTo(33000)(true).calls()).toBe(0);
    const avoid = flyTo(10000, {
      alert: 300,
      bodies: [other(300, vec(500, 0, 0))],
    })(true);
    expect(avoid.entity.nav.behaviour).toBe("AVOID_COLLISION");
    expect(avoid.calls()).toBe(0);
  });
});

describe("the routes stay exclusive (advisor warning, T-17-17)", () => {
  /** The code of a source file with its comments removed. */
  function code(path: string): string {
    return readFileSync(new URL(path, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  /** The behaviour ids whose step asks to fire, found by running every route. */
  function firingBehaviours(): string[] {
    const found: string[] = [];
    for (const [id, step] of BEHAVIOUR_ROUTES) {
      let calls = 0;
      const entity = ship(2);
      entity.nav.behaviour = id;
      entity.nav.destination = vec(0, 0, -5060);
      const h = harness(entity, [target(5000)], PULSE, Array(64).fill(0.5));
      step(entity, {
        ...h.ctx,
        fire: () => {
          calls += 1;
        },
      });
      if (calls > 0) found.push(id);
    }
    return found.sort();
  }

  it("the sites are exactly Oolite's: evasive, flee-evasive, sniper, six, twelve and fly-to", () => {
    expect(firingBehaviours()).toEqual([
      "ATTACK_FLY_TO_TARGET",
      "ATTACK_FLY_TO_TARGET_SIX",
      "ATTACK_FLY_TO_TARGET_TWELVE",
      "ATTACK_SNIPER",
      "EVASIVE_ACTION",
      "FLEE_EVASIVE_ACTION",
    ]);
  });

  it("the flight-script pilot never calls ctl.fire", () => {
    expect(code("../../../src/sim/ai/pilots/flight-script.ts")).not.toMatch(
      /\bctl\s*\.\s*fire\b|\.fire\s*\(/,
    );
  });

  it("every behaviour the test pilot performs is outside the set of fire sites", () => {
    const source = code("../../../src/sim/ai/pilots/test-pilot.ts");
    const performed = [
      ...source.matchAll(/ctl\.perform\(\s*self,\s*"([A-Z_]+)"/g),
    ].map((match) => match[1] as string);
    expect(performed.sort()).toEqual([
      "FLY_TO_DESTINATION",
      "IDLE",
      "STOP_STILL",
    ]);
    const sites = new Set(firingBehaviours());
    for (const id of performed) expect(sites.has(id)).toBe(false);
  });

  it("an opted-in test pilot and an opted-in attacker in one world: one entry per id per tick, and the pilot only holds or flies", () => {
    const { world, player, viper, adder } = duel(true);
    const pilotResult = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_NEUTRAL",
        position: vec(500, 0, -3000),
        orientation: identity(),
        radius: 30,
        maxEnergy: 180,
        ai: createTestPilotAi(0, { fire: true }),
      },
      0,
    );
    if (!pilotResult.ok) throw new Error("spawn refused");
    const pilot = pilotResult.entity;
    const allowed = new Set(["IDLE", "FLY_TO_DESTINATION", "STOP_STILL"]);
    let pilotAsked = 0;
    let viperAsked = 0;
    for (let i = 0; i < 240; i += 1) {
      const attackerBefore = viper.nav.behaviour;
      expect(allowed.has(pilot.nav.behaviour)).toBe(true);
      stepOnly(world, player);
      const counts = new Map<number, number>();
      for (const { id } of world.fireQueue) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      for (const count of counts.values()) expect(count).toBe(1);
      // the attacker asks on fly-to updates only; the pilot only through ctl.fire
      expect(counts.has(viper.id)).toBe(
        attackerBefore === "ATTACK_FLY_TO_TARGET",
      );
      if (counts.has(viper.id)) viperAsked += 1;
      if (counts.has(pilot.id)) pilotAsked += 1;
      expect(counts.has(adder.id)).toBe(false);
      drain(world, player);
    }
    expect(viperAsked).toBeGreaterThan(0);
    expect(pilotAsked).toBeGreaterThan(0);
  });
});
