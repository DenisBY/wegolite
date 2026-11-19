// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * NPC fights NPC (CBT-15, CBT-16; plan 17-09, D-03, D-10, D-12, D-16).
 *
 * Owner decision D-03 puts the NPC-versus-NPC half of the phase in Vitest and
 * nowhere else (no hook variant, no browser spec): an NPC's shot lands on
 * another NPC ship by the octree hull rule, the ledger resolves the tick's hits
 * in ascending shooter id, and an NPC shot to zero energy by another NPC leaves
 * the world through Phase 15's one kill path (`killShip`), with the live shooter
 * credited and told (`shipTargetDestroyed`, `shipKilledOther`), every holder of
 * the victim told (`shipTargetLost`) and, with the content, the debris released
 * on the kill tick. No new `onEvent` handler is involved: the pilots here are the
 * two shipped test modules, wrapped only to record what they are delivered.
 *
 * Both fire routes are covered: the test pilot's per-tick ask and the steering
 * route of an attack behaviour (`createFlightScriptAi(..., { fire: true })`).
 * Inert ships cannot fire (no AI, no resolved accuracy), so every shooter here
 * opts in. The player is parked a million kilometres away and no combat state is
 * passed, so it is never a candidate of any ray.
 *
 * The expected numbers come from the rules, not from a run: the Viper's beam
 * does 6 a hit (`equipment.plist`), so a ship with energy `e` and no recharge
 * dies on the hit that takes it to 0 or below; the ledger applies one tick's
 * records in ascending shooter id (D-16); `killShip` normalises a killer that an
 * earlier kill of the same pass removed to `NO_ENTITY` (D-10).
 *
 * Every wait is bounded and the loop is asserted to have ended on its event, not
 * on its bound (a vacuity guard). The mutual-kill seeds are fixed in the test
 * and were chosen with a scratch run (see `MUTUAL_SEEDS`).
 */

import { describe, expect, it } from "vitest";

import { createFlightScriptAi } from "../../../src/sim/ai/pilots/flight-script.js";
import { FLIGHT_SCRIPT } from "../../../src/sim/ai/pilots/flight-script.js";
import {
  TEST_PILOT,
  createTestPilotAi,
} from "../../../src/sim/ai/pilots/test-pilot.js";
import type { AiComponent, AiModule } from "../../../src/sim/ai/types.js";
import { LASER_STATS } from "../../../src/sim/combat/constants.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import type { NpcStepFacts } from "../../../src/sim/npc/stats.js";
import { DT } from "../../../src/sim/time.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { NO_ENTITY } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import {
  createWorld,
  postAiEvent,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const { layout } = laveFixture();
const HULLS = realHullTable();
const WEAPONS = realNpcWeapons();
const FACTS: NpcStepFacts = { flight: realNpcFlightTable() };
const DEBRIS = debrisFixture();

/** The Viper's beam laser: 6 a hit, 0.5 energy a shot (`equipment.plist`). */
const BEAM_DAMAGE = LASER_STATS.EQ_WEAPON_BEAM_LASER.damage;

/** Far from the station, the planet and the sun, so nothing steers around them. */
const FAR = vec(1e7, 0, 0);

/** Turned half a turn about up: the ship's nose points at +Z. */
const FACING_PLUS_Z: Quat = { w: 0, x: 0, y: 1, z: 0 };

/** `z` metres along the far region's axis (negative z is where an unturned nose points). */
function at(x: number, y: number, z: number): Vec3 {
  return vec(FAR.x + x, FAR.y + y, FAR.z + z);
}

/** One delivered AI event, as the recording modules saw it. */
interface Delivery {
  readonly tick: number;
  readonly to: number;
  readonly name: string;
  readonly a: number | undefined;
}

/**
 * The two shipped AI modules, each wrapped so that every delivered event is
 * recorded before the module's own handler (the test pilot has none). The think
 * functions are the real ones.
 */
function recordingRegistry(log: Delivery[]): AiRegistry {
  const wrap = (module: AiModule): AiModule => ({
    think: module.think,
    onEvent: (ctx, event) => {
      log.push({
        tick: ctx.view.tick,
        to: ctx.self,
        name: event.name,
        a: event.a,
      });
      module.onEvent?.(ctx, event);
    },
  });
  return {
    "test-pilot": wrap(TEST_PILOT),
    "flight-script": wrap(FLIGHT_SCRIPT),
  };
}

/** A test pilot already holding `targetId`, asking to fire on every tick. */
function holdingPilot(targetId: number): AiComponent {
  const ai = createTestPilotAi(0, { fire: true, holdRange: 5000 });
  ai.params["phase"] = "hold";
  ai.params["targetId"] = targetId;
  return ai;
}

/** The names of the events of one kind, in order. */
function ofKind<K extends SimEvent["kind"]>(
  events: readonly SimEvent[],
  kind: K,
): Extract<SimEvent, { kind: K }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: K }> => event.kind === kind,
  );
}

/** A far-away player: launched state, never within any ray or scan. */
function farPlayer(): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.tick = 0;
  state.position = vec(1e9, 1e9, 1e9);
  return state;
}

/**
 * One world, stepped by hand: the world step, then the drain, the ledger and the
 * kills (`resolveShots`), exactly the composition of `stepSim` without the
 * player's own flight. The AI registry is the recording one, so every event a
 * module is delivered (during the step or at the kill) is logged.
 */
class Arena {
  readonly world: World;
  readonly player: FlightState = farPlayer();
  readonly deliveries: Delivery[] = [];
  readonly ticks: SimEvent[][] = [];
  readonly hashes: string[] = [];
  private readonly registry: AiRegistry = recordingRegistry(this.deliveries);
  private readonly options: StepOptions;

  constructor(seed: number, debris = false) {
    this.world = createWorld(seed);
    this.options = {
      combat: {
        mounts: DEFAULT_LASER_MOUNTS,
        hulls: HULLS,
        npcWeapons: WEAPONS,
        ...(debris ? { debris: DEBRIS } : {}),
      },
    };
  }

  /** The id the next spawned ship will take. */
  get nextId(): number {
    return this.world.store.nextId;
  }

  spawn(
    specKey: string,
    position: Vec3,
    orientation: Quat,
    extra: Partial<SpawnInit> = {},
  ): number {
    const result = spawnEntity(
      this.world,
      {
        kind: "ship",
        specKey,
        scanClass: "CLASS_NEUTRAL",
        position,
        orientation,
        radius: 30,
        speed: 0,
        maxEnergy: 85,
        energyRechargeRate: 0,
        ...extra,
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity.id;
  }

  /** One tick; the boundary invariants are checked after it. */
  step(): SimEvent[] {
    const { world, player } = this;
    player.tick += 1;
    const events = stepWorld(world, player, layout, DT, this.registry, FACTS);
    events.push(
      ...resolveShots(
        world,
        true,
        player,
        undefined,
        [],
        this.options,
        DT,
        layout,
        this.registry,
      ),
    );
    this.ticks.push(events);
    this.hashes.push(hashWorld(player, world));
    boundaryHolds(player, world);
    return events;
  }

  /** The deliveries to `to` named `name`, in order. */
  told(to: number, name: string): Delivery[] {
    return this.deliveries.filter((d) => d.to === to && d.name === name);
  }
}

/**
 * The tick-boundary invariant (FOUND-19, D-12): no dead entity in the live list,
 * no queued AI event or shot, and a snapshot that survives JSON with an equal
 * hash.
 */
function boundaryHolds(player: FlightState, world: World): void {
  for (const entity of world.store.live) {
    if (entity.dead) throw new Error(`dead entity ${String(entity.id)} left`);
  }
  if (world.aiQueue.length !== 0) throw new Error("the AI queue is not empty");
  if (world.fireQueue.length !== 0) {
    throw new Error("the fire queue is not empty");
  }
  const text = JSON.stringify(snapshotWorld(world));
  const restored = restoreWorld(
    parseWorldSnapshot(JSON.parse(text) as unknown),
  );
  if (hashWorld(player, restored) !== hashWorld(player, world)) {
    throw new Error("the restored world hashes differently");
  }
}

/** Step until `done` holds for a tick's events or `bound` ticks pass; returns the ticks run. */
function runUntil(
  arena: Arena,
  bound: number,
  done: (events: readonly SimEvent[]) => boolean,
): { ticks: number; ended: boolean } {
  for (let i = 1; i <= bound; i += 1) {
    if (done(arena.step())) return { ticks: i, ended: true };
  }
  return { ticks: bound, ended: false };
}

const hasKind =
  (kind: SimEvent["kind"]) =>
  (events: readonly SimEvent[]): boolean =>
    events.some((event) => event.kind === kind);

describe("a test pilot shoots an NPC to zero energy through the gate and the kill path (tracer, D-03, D-12)", () => {
  /**
   * A Viper pilot already holding an Adder 1,000 m ahead on its nose. The Adder
   * is inert with 13 energy and no recharge: the beam's hits take it to 7, 1 and
   * then -5, so the third hit kills it.
   */
  function pilotKill(debris: boolean) {
    const arena = new Arena(7, debris);
    const adder = arena.spawn("adder", at(0, 0, -1000), identity(), {
      maxEnergy: 13,
      cargo: 40,
    });
    const viper = arena.spawn("viper", at(0, 0, 0), identity(), {
      maxEnergy: 180,
      ai: holdingPilot(adder),
    });
    const ended = runUntil(arena, 1500, hasKind("shipDestroyed"));
    return { arena, adder, viper, ...ended };
  }

  it("destroys the Adder on the third hit, crediting the live Viper, and removes it on the same tick", () => {
    const { arena, adder, viper, ticks, ended } = pilotKill(false);
    // Vacuity guard: the loop ended on the kill, not on its bound.
    expect(ended).toBe(true);
    expect(ticks).toBeLessThan(1500);
    const events = arena.ticks[ticks - 1] as SimEvent[];

    const hits = ofKind(events, "shipHit");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      source: viper,
      target: adder,
      amount: BEAM_DAMAGE,
    });
    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({ id: adder, killer: viper });
    expect(ofKind(events, "entityRemoved")).toEqual([
      { kind: "entityRemoved", id: adder },
    ]);
    // The tick's order: the beam, the hit, the destruction, the removal.
    const order = events.map((event) => event.kind);
    expect(order.indexOf("laserFired")).toBeLessThan(order.indexOf("shipHit"));
    expect(order.indexOf("shipHit")).toBeLessThan(
      order.indexOf("shipDestroyed"),
    );
    expect(order.indexOf("shipDestroyed")).toBeLessThan(
      order.indexOf("entityRemoved"),
    );
    expect(arena.world.store.get(adder)).toBeUndefined();

    // Three hits took 13 energy to 7, 1 and -5; the first two were not lethal.
    const allHits = arena.ticks.flatMap((tick) => ofKind(tick, "shipHit"));
    expect(allHits).toHaveLength(3);
    for (const hit of allHits) expect(hit.target).toBe(adder);
    // No `shipDestroyed` before the third hit.
    expect(
      arena.ticks
        .slice(0, ticks - 1)
        .flatMap((tick) => ofKind(tick, "shipDestroyed")),
    ).toEqual([]);
  });

  it("tells the Viper's AI shipTargetDestroyed and shipKilledOther on the kill tick, and its hold returns to seek", () => {
    const { arena, adder, viper, ticks } = pilotKill(false);
    const destroyedTo = arena.told(viper, "shipTargetDestroyed");
    const killedOther = arena.told(viper, "shipKilledOther");
    expect(destroyedTo).toEqual([
      { tick: ticks, to: viper, name: "shipTargetDestroyed", a: adder },
    ]);
    expect(killedOther).toEqual([
      { tick: ticks, to: viper, name: "shipKilledOther", a: adder },
    ]);
    // The Viper also held the Adder as its nav target, so it is told it was
    // lost, once, at kill time.
    expect(
      arena.told(viper, "shipTargetLost").filter((d) => d.tick === ticks),
    ).toEqual([
      { tick: ticks, to: viper, name: "shipTargetLost", a: undefined },
    ]);

    // The hold sees the target gone and drops to seek within one think.
    const viperEntity = arena.world.store.get(viper);
    expect(viperEntity?.ai?.params["phase"]).toBe("hold");
    let back = -1;
    for (let i = 1; i <= 60 && back < 0; i += 1) {
      arena.step();
      if (viperEntity?.ai?.params["phase"] === "seek") back = i;
    }
    expect(back).toBeGreaterThan(0);
    expect(viperEntity?.ai?.params["targetId"]).toBe(NO_ENTITY);
    expect(viperEntity?.nav.targetId).toBe(NO_ENTITY);
    // Nothing else of the AI faulted or was dropped.
    expect(arena.world.aiDropped).toBe(0);
    for (const tick of arena.ticks)
      expect(ofKind(tick, "aiFaulted")).toEqual([]);
  });

  it("releases the Adder's debris on the kill tick when the content is present, and none without it", () => {
    const withContent = pilotKill(true);
    const without = pilotKill(false);
    const debrisOf = (world: World): number =>
      [...world.store.live].filter(
        (entity) => entity.kind === "cargo" || entity.kind === "wreckage",
      ).length;
    expect(withContent.ticks).toBe(without.ticks);
    expect(debrisOf(without.arena.world)).toBe(0);
    const pieces = [...withContent.arena.world.store.live].filter(
      (entity) => entity.kind === "cargo" || entity.kind === "wreckage",
    );
    expect(pieces.length).toBeGreaterThan(0);
    // The pieces are spawned inside the kill, so they carry the kill tick.
    for (const piece of pieces) {
      expect(piece.spawnTick).toBe(withContent.ticks);
    }
  });

  it("gives the same events and the same hash on every tick in two runs", () => {
    const first = pilotKill(true);
    const second = pilotKill(true);
    expect(second.ticks).toBe(first.ticks);
    expect(second.arena.ticks).toEqual(first.arena.ticks);
    expect(second.arena.hashes).toEqual(first.arena.hashes);
    expect(second.arena.deliveries).toEqual(first.arena.deliveries);
  });
});

/**
 * Two Vipers 1,500 m apart, each running the scripted attack on the other with
 * `fire: true`, so every request comes from an attack behaviour's own fire
 * site. A third and a fourth ship, 100 km away (outside every scan), hold one
 * fighter each as their nav target and are test pilots that never fire.
 */
function attackerFight(seed: number, energyA: number, energyB: number) {
  const arena = new Arena(seed);
  const a = arena.nextId;
  const b = a + 1;
  arena.spawn("viper", at(0, 0, 0), identity(), {
    maxEnergy: energyA,
    ai: createFlightScriptAi(0, {
      script: "attack",
      targetId: b,
      fire: true,
    }),
  });
  arena.spawn("viper", at(0, 0, -1500), FACING_PLUS_Z, {
    maxEnergy: energyB,
    ai: createFlightScriptAi(0, {
      script: "attack",
      targetId: a,
      fire: true,
    }),
  });
  const holdsA = arena.spawn("adder", at(100_000, 0, 0), identity(), {
    ai: createTestPilotAi(0),
  });
  const holdsB = arena.spawn("adder", at(100_000, 0, -50_000), identity(), {
    ai: createTestPilotAi(0),
  });
  const entity = (id: number) => {
    const found = arena.world.store.get(id);
    if (found === undefined) throw new Error(`no entity ${String(id)}`);
    return found;
  };
  entity(holdsA).nav.targetId = a;
  entity(holdsB).nav.targetId = b;
  return { arena, a, b, holdsA, holdsB };
}

describe("two opted-in attackers fight each other through the steering route (D-05, D-12, D-16)", () => {
  it("kills the weaker fighter through the kill path with the other credited, and tells exactly the holder of the victim", () => {
    // B has 10 energy and A 40: every beam hit costs 6, and a ship also pays
    // 0.5 a shot with no recharge, so B is dead by its second hit and A is
    // never close to dying.
    const { arena, a, b, holdsA, holdsB } = attackerFight(7, 40, 10);
    const { ticks, ended } = runUntil(arena, 6000, hasKind("shipDestroyed"));
    expect(ended).toBe(true);
    expect(ticks).toBeLessThan(6000);
    const events = arena.ticks[ticks - 1] as SimEvent[];
    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({ id: b, killer: a });
    expect(ofKind(events, "entityRemoved")).toEqual([
      { kind: "entityRemoved", id: b },
    ]);
    const hitsOnB = arena.ticks
      .flatMap((tick) => ofKind(tick, "shipHit"))
      .filter((hit) => hit.target === b);
    expect(hitsOnB.length).toBeGreaterThanOrEqual(2);
    for (const hit of hitsOnB) {
      expect(hit.source).toBe(a);
      expect(hit.amount).toBe(BEAM_DAMAGE);
    }
    // The killer is told twice over, and each holder of the victim once.
    expect(arena.told(a, "shipTargetDestroyed")).toEqual([
      { tick: ticks, to: a, name: "shipTargetDestroyed", a: b },
    ]);
    expect(arena.told(a, "shipKilledOther")).toEqual([
      { tick: ticks, to: a, name: "shipKilledOther", a: b },
    ]);
    const lost = arena.deliveries.filter(
      (d) => d.name === "shipTargetLost" && d.tick === ticks,
    );
    expect(lost.map((d) => d.to)).toEqual([a, holdsB]);
    expect(arena.told(holdsA, "shipTargetLost")).toEqual([]);
    expect(arena.world.store.get(a)).toBeDefined();
  });

  it("leaves the survivor's flight script finished, and a second shipTargetLost changes nothing (the handler is idempotent)", () => {
    const { arena, a, b } = attackerFight(7, 40, 10);
    expect(runUntil(arena, 6000, hasKind("shipDestroyed")).ended).toBe(true);
    const survivor = arena.world.store.get(a);
    expect(survivor?.ai?.params["phase"]).toBe("done");
    expect(survivor?.nav.behaviour).toBe("IDLE");
    // The kill told it once; it finished and stopped asking.
    expect(arena.told(a, "shipTargetLost")).toHaveLength(1);
    for (let i = 0; i < 100; i += 1) arena.step();
    const before = JSON.stringify(survivor?.ai?.params);
    // The same event again (a holder whose own steering notices the loss too).
    postAiEvent(arena.world, { to: a, name: "shipTargetLost" });
    const events = arena.step();
    expect(arena.told(a, "shipTargetLost")).toHaveLength(2);
    expect(JSON.stringify(survivor?.ai?.params)).toBe(before);
    expect(survivor?.nav.behaviour).toBe("IDLE");
    expect(ofKind(events, "aiFaulted")).toEqual([]);
    expect(arena.world.aiDropped).toBe(0);
    // Nothing else was destroyed, and nothing fired at the dead id.
    const dead = arena.ticks.flatMap((tick) => ofKind(tick, "shipDestroyed"));
    expect(dead.map((event) => event.id)).toEqual([b]);
    const lateShots = arena.ticks
      .slice(-100)
      .flatMap((tick) => ofKind(tick, "laserFired"))
      .filter((shot) => shot.shooter === a);
    expect(lateShots).toEqual([]);
  });
});

describe("the steering-route fight replays exactly (QUAL-11)", () => {
  it("gives the same events, deliveries and per-tick hashes in two runs", () => {
    const run = () => {
      const { arena } = attackerFight(7, 40, 10);
      const { ticks, ended } = runUntil(arena, 6000, hasKind("shipDestroyed"));
      expect(ended).toBe(true);
      for (let i = 0; i < 200; i += 1) arena.step();
      return { arena, ticks };
    };
    const first = run();
    const second = run();
    expect(second.ticks).toBe(first.ticks);
    expect(second.arena.ticks).toEqual(first.arena.ticks);
    expect(second.arena.hashes).toEqual(first.arena.hashes);
    expect(second.arena.deliveries).toEqual(first.arena.deliveries);
  });
});

describe("two ships hit a third on one tick: the ledger runs in ascending shooter id (D-16)", () => {
  /**
   * An Adder 1,000 m ahead, two Viper pilots 16 m apart side by side, both
   * holding it. At 940 m of range the gate's roll passes for every accuracy
   * but the worst, and the two ships' own streams decide the rest, so the first
   * tick on which a beam fires is found by a bounded loop (it is the spawn
   * tick under seed 7), and the test asserts both ships fired there.
   */
  function volley(adderEnergy: number) {
    const arena = new Arena(7);
    const adder = arena.spawn("adder", at(0, 0, -1000), identity(), {
      maxEnergy: adderEnergy,
    });
    const low = arena.spawn("viper", at(-8, 0, 0), identity(), {
      maxEnergy: 180,
      ai: holdingPilot(adder),
    });
    const high = arena.spawn("viper", at(8, 0, 0), identity(), {
      maxEnergy: 180,
      ai: holdingPilot(adder),
    });
    const { ticks, ended } = runUntil(arena, 200, hasKind("laserFired"));
    const events = arena.ticks[ticks - 1] as SimEvent[];
    return { arena, adder, low, high, ticks, ended, events };
  }

  it("applies the lower id's hit first, so the higher id lands the lethal one and is the killer", () => {
    // 7 energy: the first 6-point hit leaves 1, the second takes it to -5.
    const { adder, low, high, ticks, ended, events } = volley(7);
    expect(ended).toBe(true);
    expect(ticks).toBeLessThan(200);
    expect(ofKind(events, "laserFired").map((shot) => shot.shooter)).toEqual([
      low,
      high,
    ]);
    const hits = ofKind(events, "shipHit");
    expect(hits.map((hit) => [hit.source, hit.target, hit.amount])).toEqual([
      [low, adder, BEAM_DAMAGE],
      [high, adder, BEAM_DAMAGE],
    ]);
    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({ id: adder, killer: high });
  });

  it("credits the lower id when its own hit is the lethal one, and destroys the Adder once", () => {
    // 1 energy: the first record in the ledger, the lower id's, is lethal.
    const { adder, low, high, ticks, ended, events } = volley(1);
    expect(ended).toBe(true);
    expect(ticks).toBeLessThan(200);
    expect(ofKind(events, "laserFired").map((shot) => shot.shooter)).toEqual([
      low,
      high,
    ]);
    const hits = ofKind(events, "shipHit");
    expect(hits.map((hit) => hit.source)).toEqual([low, high]);
    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({ id: adder, killer: low });
    expect(ofKind(events, "entityRemoved")).toHaveLength(1);
  });
});

/**
 * The mutual-kill cases (D-10) and the seeds they run under. The range roll draws
 * from each ship's own stream and the accuracy is not pinned (D-04), so a seed is
 * not interchangeable: each was chosen with a scratch run over seeds 1 to 40
 * (a fixed list of both spawn orders per seed) as one where, on the first tick
 * a beam fires, both ships fire. Seed 22 is the counter-example: there only the
 * higher id fires on the first firing tick (it kills the other before it can
 * answer), and a seed like it is never accepted by loosening an assertion.
 */
const MUTUAL_SEEDS = { lowFacesMinusZ: 7, lowFacesPlusZ: 13 } as const;

describe("a same-tick mutual kill between NPCs: credit stays asymmetric by ascending id (D-10)", () => {
  /**
   * Two one-energy Viper pilots nose to nose 1,000 m apart, each the other's
   * target. `lowFacesMinusZ` decides which of the two takes the lower id (spawn
   * order), the mirror case.
   */
  function duel(seed: number, lowFacesMinusZ: boolean) {
    const arena = new Arena(seed);
    const first = arena.nextId;
    const second = first + 1;
    const facingMinus = () =>
      arena.spawn("viper", at(0, 0, 0), identity(), {
        maxEnergy: 1,
        ai: holdingPilot(lowFacesMinusZ ? second : first),
      });
    const facingPlus = () =>
      arena.spawn("viper", at(0, 0, -1000), FACING_PLUS_Z, {
        maxEnergy: 1,
        ai: holdingPilot(lowFacesMinusZ ? first : second),
      });
    if (lowFacesMinusZ) {
      facingMinus();
      facingPlus();
    } else {
      facingPlus();
      facingMinus();
    }
    const { ticks, ended } = runUntil(arena, 200, hasKind("laserFired"));
    return { arena, low: first, high: second, ticks, ended };
  }

  it.each([
    [true, MUTUAL_SEEDS.lowFacesMinusZ],
    [false, MUTUAL_SEEDS.lowFacesPlusZ],
  ])(
    "lets the lower id die credited to the higher and the higher die credited to nobody (lowFacesMinusZ %s, seed %i)",
    (lowFacesMinusZ, seed) => {
      const { arena, low, high, ticks, ended } = duel(seed, lowFacesMinusZ);
      // The first firing tick, found by a bounded loop: it ended on the event.
      expect(ended).toBe(true);
      expect(ticks).toBeLessThan(200);
      const events = arena.ticks[ticks - 1] as SimEvent[];
      // Both ships fired on that tick (the seed was chosen for this).
      expect(
        ofKind(events, "laserFired")
          .map((shot) => shot.shooter)
          .sort((x, y) => x - y),
      ).toEqual([low, high]);
      // Each shot hit the other ship, and one hit kills a ship with 1 energy.
      const hits = ofKind(events, "shipHit");
      expect(hits.map((hit) => [hit.source, hit.target])).toEqual([
        [low, high],
        [high, low],
      ]);
      // Victims die in ascending id; a killer that an earlier kill of the same
      // pass removed is NO_ENTITY (`normaliseKiller`).
      const destroyed = ofKind(events, "shipDestroyed");
      expect(destroyed.map((event) => event.id)).toEqual([low, high]);
      expect(destroyed.map((event) => event.killer)).toEqual([high, NO_ENTITY]);
      expect(ofKind(events, "entityRemoved").map((event) => event.id)).toEqual([
        low,
        high,
      ]);
      expect(arena.world.store.live).toHaveLength(0);
    },
  );

  it("replays the same events and hashes under the same seed", () => {
    const first = duel(MUTUAL_SEEDS.lowFacesMinusZ, true);
    const second = duel(MUTUAL_SEEDS.lowFacesMinusZ, true);
    expect(second.arena.ticks).toEqual(first.arena.ticks);
    expect(second.arena.hashes).toEqual(first.arena.hashes);
    // Both ships are dead when the tick's AI events are delivered, so the credited
    // ship is told nothing either (no live module receives a kill notice).
    expect(first.arena.deliveries).toEqual([]);
  });

  it("is the same through the steering route: two opted-in attackers with 10 energy kill each other on one tick", () => {
    const { arena, a, b } = attackerFight(7, 10, 10);
    const { ticks, ended } = runUntil(arena, 6000, hasKind("shipDestroyed"));
    expect(ended).toBe(true);
    const events = arena.ticks[ticks - 1] as SimEvent[];
    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed.map((event) => event.id)).toEqual([a, b]);
    expect(destroyed.map((event) => event.killer)).toEqual([b, NO_ENTITY]);
    expect(arena.world.store.get(a)).toBeUndefined();
    expect(arena.world.store.get(b)).toBeUndefined();
  });
});
