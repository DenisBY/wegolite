// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence determinism of a kill with every debris kind (D16-05, D16-12,
 * QUAL-11 standing gate; plan 16-04).
 *
 * One tick-indexed scenario: the player launches, parks far from the station
 * and holds the fire key until its pulse laser destroys an Adder carrying 20
 * cargo 2,000 m ahead. The Adder releases pods, wrecks and an alloy plate from
 * its own stream (`releaseDebris`), the blast pushes them, they drift, and the
 * wrecks burn down and leave through `killShip`. Replayed with frame deltas of
 * 1/30, 1/60 and 1/144 s through the fixed-step accumulator (the frame runner
 * of `world-cadence.test.ts`), every sampled `hashWorld` and the debris log
 * (ids, kinds, spec keys, positions, velocities, energies and the removal
 * ticks) must be identical. The log is indexed by tick, never by frame.
 *
 * The world seed is the first one whose Adder releases at least one pod, one
 * wreck and one plate (searched by a direct kill of the same first entity, whose
 * stream the scenario does not touch before the kill: the Adder has no AI). The
 * non-vacuity case asserts all three kinds, a wreck removal before the end and
 * a blast kick on the pods (Pitfall 7). The same scenario with the store
 * pre-filled to 240 live entities sheds pieces at the cap identically at every
 * cadence.
 *
 * A second scenario (plan 18-19, D-03, PD-02) kills a Krait whose blast pushes
 * the player, a Shuttle and the nav buoy, and holds the same rule.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import { PLAYER_MASS_KG } from "../../../src/sim/combat/constants.js";
import type { Command } from "../../../src/sim/commands.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import {
  BLAST_MOMENTUM_FACTOR,
  BLAST_RANGE_FACTOR,
  DEBRIS_ENTITY_LIMIT,
} from "../../../src/sim/world/debris.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { killShip } from "../../../src/sim/world/kill.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  createWorld,
  liveEntityCount,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture, FIXTURE_POD } from "../../helpers/debris-fixture.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const fixture = laveFixture();
const { config } = fixture;
const HULLS = realHullTable();
const CONTENT = debrisFixture();
const CADENCES = [30, 60, 144] as const;

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);
const ADDER_AT = vec(FAR.x, FAR.y, FAR.z - 2000);
const ADDER_RADIUS = 40;
const ADDER_CARGO = 20;
const START_TICK = 2;
const STEPS = 240;
const SAMPLE_EVERY = 10;
const CAPPED_FILLERS = 240;

const OPTIONS: StepOptions = {
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: HULLS,
    npcWeapons: realNpcWeapons(),
    debris: CONTENT,
  },
  npcFlight: realNpcFlightTable(),
};

/** The Adder: the first entity of its world, inert, one pulse from death. */
function spawnAdder(world: World, tick: number): Entity {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "adder",
      scanClass: "CLASS_NEUTRAL",
      position: ADDER_AT,
      orientation: identity(),
      radius: ADDER_RADIUS,
      speed: 0,
      maxEnergy: 10,
      energyRechargeRate: 0,
      cargo: ADDER_CARGO,
    },
    tick,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/** `count` inert fillers far from everything (no debris model, never kicked). */
function fill(world: World, count: number, tick: number): void {
  for (let i = 0; i < count; i += 1) {
    const result = spawnEntity(
      world,
      {
        kind: "cargo",
        specKey: "filler",
        scanClass: "CLASS_CARGO",
        position: vec(-1e6, 1000 * (i + 1), 0),
        orientation: identity(),
        radius: 1,
        ai: null,
      },
      tick,
    );
    if (!result.ok) throw new Error(`filler refused: ${result.reason}`);
  }
}

function isDebris(entity: Entity): boolean {
  return (
    !entity.dead &&
    (entity.kind === "cargo" || entity.kind === "wreckage") &&
    entity.specKey !== "filler"
  );
}

/** The first world seed whose Adder releases a pod, a wreck and a plate. */
function findSeed(): number {
  for (let seed = 1; seed < 2000; seed += 1) {
    const world = createWorld(seed);
    const adder = spawnAdder(world, 0);
    killShip(world, adder.id, PLAYER_ID, [], {
      tick: 0,
      content: CONTENT,
      octrees: HULLS,
    });
    const pieces = world.store.live.filter(isDebris);
    const has = (specKey: string): boolean =>
      pieces.some((p) => p.specKey === specKey);
    if (
      has("barrel") &&
      has("alloy") &&
      pieces.some((p) => p.kind === "wreckage")
    ) {
      return seed;
    }
  }
  throw new Error("no seed releases every debris kind");
}

const WORLD_SEED = findSeed();

interface DebrisRecord {
  readonly id: number;
  readonly kind: string;
  readonly specKey: string;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly energy: number;
}

interface DebrisLog {
  readonly hashes: Map<number, string>;
  readonly debris: Map<number, string>;
  /** Every debris piece seen live, by id: [kind, specKey]. */
  readonly seen: Map<number, [string, string]>;
  /** [tick, id] of every entityRemoved. */
  readonly removed: [number, number][];
  /** The debris right after the kill tick. */
  atKill: DebrisRecord[];
  killTick: number;
  shipDestroyed: number;
  endTick: number;
  adderId: number;
}

function debrisRecords(world: World): DebrisRecord[] {
  return world.store.live.filter(isDebris).map((e) => ({
    id: e.id,
    kind: e.kind,
    specKey: e.specKey,
    position: { ...e.position },
    velocity: { ...e.velocity },
    energy: e.energy,
  }));
}

class DebrisScenario {
  readonly state: FlightState = initFlightState(fixture.layout);
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly log: DebrisLog = {
    hashes: new Map(),
    debris: new Map(),
    seen: new Map(),
    removed: [],
    atKill: [],
    killTick: -1,
    shipDestroyed: 0,
    endTick: -1,
    adderId: -1,
  };
  done = false;
  private world: World | undefined;

  constructor(private readonly fillers: number) {}

  step(): void {
    const { state, combat, log } = this;
    const tick = state.tick;
    if (tick === START_TICK) {
      state.position = FAR;
      state.orientation = identity();
      state.speed = 0;
      this.world = createWorld(WORLD_SEED);
      log.adderId = spawnAdder(this.world, tick).id;
      fill(this.world, this.fillers, tick);
    }
    const commands: Command[] =
      tick === 0
        ? [{ kind: "launch" }]
        : tick === 1
          ? [{ kind: "skipLaunch" }]
          : [];
    const fire = tick >= START_TICK && log.killTick < 0;
    const events = stepSim(
      state,
      this.world,
      fixture.layout,
      config,
      fire ? { ...ZERO_INTENT, fire: true } : ZERO_INTENT,
      commands,
      DT,
      OPTIONS,
      combat,
    );
    let killedNow = false;
    for (const event of events) {
      if (event.kind === "shipDestroyed") {
        log.shipDestroyed += 1;
        log.killTick = state.tick;
        killedNow = true;
      } else if (event.kind === "entityRemoved") {
        log.removed.push([state.tick, event.id]);
      }
    }
    const world = this.world;
    if (world === undefined) return;
    for (const piece of world.store.live.filter(isDebris)) {
      log.seen.set(piece.id, [piece.kind, piece.specKey]);
    }
    if (killedNow) log.atKill = debrisRecords(world);
    const since = state.tick - START_TICK;
    const end = since >= STEPS;
    if (since % SAMPLE_EVERY === 0 || killedNow || end) {
      log.hashes.set(state.tick, hashWorld(state, world, combat));
      log.debris.set(state.tick, JSON.stringify(debrisRecords(world)));
    }
    if (end) {
      log.endTick = state.tick;
      this.done = true;
    }
  }
}

/** A tick-indexed scenario the frame runner drives. */
interface Stepper {
  readonly done: boolean;
  step(): void;
}

/** The frame runner of `world-cadence.test.ts`. */
function runFrames(hz: number, scenario: Stepper): void {
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`debris cadence ${String(hz)} never finished`);
    }
    accumulator += clampFrameDelta(1 / hz);
    let stepsThisFrame = 0;
    while (
      accumulator >= DT &&
      stepsThisFrame < MAX_STEPS_PER_FRAME &&
      !scenario.done
    ) {
      scenario.step();
      accumulator -= DT;
      stepsThisFrame += 1;
    }
    if (stepsThisFrame === MAX_STEPS_PER_FRAME) accumulator = 0;
  }
}

/** The debris scenario at `hz`. */
function replay(hz: number, fillers: number): DebrisLog {
  const scenario = new DebrisScenario(fillers);
  runFrames(hz, scenario);
  return scenario.log;
}

const free = new Map<number, DebrisLog>(
  CADENCES.map((hz) => [hz, replay(hz, 0)]),
);
const capped = new Map<number, DebrisLog>(
  CADENCES.map((hz) => [hz, replay(hz, CAPPED_FILLERS)]),
);

function logAt(logs: Map<number, DebrisLog>, hz: number): DebrisLog {
  const log = logs.get(hz);
  if (log === undefined) throw new Error(`no log at ${String(hz)} Hz`);
  return log;
}

function sorted<T>(map: Map<number, T>): [number, T][] {
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

function expectSameLog(a: DebrisLog, b: DebrisLog): void {
  expect(sorted(a.hashes)).toEqual(sorted(b.hashes));
  expect(sorted(a.debris)).toEqual(sorted(b.debris));
  expect(sorted(a.seen)).toEqual(sorted(b.seen));
  expect(a.removed).toEqual(b.removed);
  expect(a.atKill).toEqual(b.atKill);
  expect(a.killTick).toBe(b.killTick);
  expect(a.endTick).toBe(b.endTick);
}

/** Counts of the debris a log saw, by kind. */
function kinds(log: DebrisLog): {
  pods: number;
  plates: number;
  wrecks: number;
} {
  const all = [...log.seen.values()];
  return {
    pods: all.filter(([, key]) => key === "barrel").length,
    plates: all.filter(([, key]) => key === "alloy").length,
    wrecks: all.filter(([kind]) => kind === "wreckage").length,
  };
}

describe("debris cross-cadence determinism (D16-05, D16-12, QUAL-11)", () => {
  const reference = logAt(free, 60);

  it("gives the same hashes and the same debris log at 30, 60 and 144 Hz", () => {
    for (const hz of CADENCES) expectSameLog(logAt(free, hz), reference);
  });

  it("is not vacuous: a pod, a wreck and a plate, a wreck removal and a blast kick", () => {
    expect(reference.shipDestroyed).toBe(1);
    expect(reference.killTick).toBeGreaterThan(START_TICK);
    expect(reference.hashes.size).toBeGreaterThan(20);
    const counts = kinds(reference);
    expect(counts.pods).toBeGreaterThanOrEqual(1);
    expect(counts.wrecks).toBeGreaterThanOrEqual(1);
    expect(counts.plates).toBeGreaterThanOrEqual(1);
    // Every wreck burns out before the end (at most 82 ticks, D16-11) and
    // leaves through killShip: an entityRemoved and no second shipDestroyed.
    const wreckIds = [...reference.seen.entries()]
      .filter(([, [kind]]) => kind === "wreckage")
      .map(([id]) => id);
    const removedIds = new Set(reference.removed.map(([, id]) => id));
    for (const id of wreckIds) expect(removedIds.has(id)).toBe(true);
    const wreckRemovals = reference.removed.filter(([, id]) =>
      wreckIds.includes(id),
    );
    expect(wreckRemovals.length).toBeGreaterThanOrEqual(1);
    for (const [tick] of wreckRemovals) {
      expect(tick).toBeGreaterThan(reference.killTick);
      expect(tick).toBeLessThanOrEqual(reference.killTick + 82);
    }
    // The blast kicked the pods: each pod's velocity minus the ported kick at
    // its position is a release velocity on the 0.1 m/s grid (the Adder has
    // no drift), and at least one kick is not zero.
    const hull = CONTENT.hulls.get("adder");
    if (hull === undefined) throw new Error("no adder hull");
    const amount = BLAST_MOMENTUM_FACTOR * hull.mass;
    const range = ADDER_RADIUS * BLAST_RANGE_FACTOR;
    let kicked = 0;
    const pods = reference.atKill.filter((p) => p.specKey === "barrel");
    expect(pods.length).toBeGreaterThanOrEqual(1);
    for (const pod of pods) {
      const p2 = vec(
        pod.position.x - ADDER_AT.x,
        pod.position.y - ADDER_AT.y,
        pod.position.z - ADDER_AT.z,
      );
      const distanceSq = p2.x * p2.x + p2.y * p2.y + p2.z * p2.z;
      const distance = Math.sqrt(distanceSq);
      const reach = range + FIXTURE_POD.radius;
      const dv =
        distanceSq < reach * reach && distance > 0
          ? (amount * range) /
            Math.max(0.1, distanceSq - FIXTURE_POD.radius ** 2) /
            FIXTURE_POD.mass
          : 0;
      if (dv > 0) kicked += 1;
      for (const axis of ["x", "y", "z"] as const) {
        const release = pod.velocity[axis] - (p2[axis] / distance) * dv;
        expect(Math.abs(release * 10 - Math.round(release * 10))).toBeLessThan(
          1e-6,
        );
      }
    }
    expect(kicked).toBeGreaterThanOrEqual(1);
  });

  it("sheds pieces at the cap identically at every cadence", () => {
    const capRef = logAt(capped, 60);
    for (const hz of CADENCES) expectSameLog(logAt(capped, hz), capRef);
    // 240 fillers: pieces spawn while fewer than 243.2 are live, so at most
    // four, no wreck (wreckage needs fewer than 128) and fewer than uncapped.
    expect(DEBRIS_ENTITY_LIMIT).toBe(243.2);
    const counts = kinds(capRef);
    const total = counts.pods + counts.plates + counts.wrecks;
    expect(counts.wrecks).toBe(0);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(4);
    const uncapped = kinds(reference);
    expect(total).toBeLessThan(
      uncapped.pods + uncapped.plates + uncapped.wrecks,
    );
    expect(capRef.killTick).toBe(reference.killTick);
    // The capped kill spawned exactly the pieces the free kill spawned first.
    const capPods = capRef.atKill.filter((p) => p.specKey === "barrel");
    const freePods = reference.atKill.filter((p) => p.specKey === "barrel");
    capPods.forEach((pod, i) => {
      expect(pod.position).toEqual(freePods[i]?.position);
    });
  });

  it("never lets the capped world hold more than 244 live entities", () => {
    // The capped kill once more, directly: the count after the release.
    const world = createWorld(WORLD_SEED);
    const adder = spawnAdder(world, 0);
    fill(world, CAPPED_FILLERS, 0);
    expect(liveEntityCount(world)).toBe(CAPPED_FILLERS + 1);
    killShip(world, adder.id, PLAYER_ID, [], {
      tick: 0,
      content: CONTENT,
      octrees: HULLS,
    });
    expect(liveEntityCount(world)).toBeLessThanOrEqual(244);
    expect(liveEntityCount(world)).toBeGreaterThan(CAPPED_FILLERS);
  });
});

/**
 * The blast on ships, a buoy and the player (D-03, PD-02): the player parks
 * 60 m behind a Krait (energy 10, cargo 0) beside the nav buoy and fires once.
 * The Krait's blast pushes the player (inside its own radius, so d2 takes the
 * 0.1 floor), a Shuttle 60 m from the Krait and the nav buoy 150 m from it;
 * each then brakes (the player by its thrust, the Shuttle and the buoy by
 * theirs). Tick-indexed, so every sampled hash must match at 30, 60 and
 * 144 Hz.
 */
const KRAIT = { mass: 93291.40625, radius: 50.196590423583984 };
const BUOY = fixture.layout.navBuoy;
const KRAIT_AT = vec(BUOY.position.x + 150, BUOY.position.y, BUOY.position.z);
const BLAST_PLAYER_AT = vec(KRAIT_AT.x, KRAIT_AT.y, KRAIT_AT.z + 60);
const SHUTTLE_AT = vec(KRAIT_AT.x, KRAIT_AT.y + 60, KRAIT_AT.z);

interface BlastLog {
  readonly hashes: Map<number, string>;
  killTick: number;
  /** At the kill tick: the player's drift, the Shuttle's and the buoy's velocity. */
  playerDrift: Vec3;
  shuttle: Vec3;
  buoy: Vec3;
  endTick: number;
}

class BlastScenario {
  readonly state: FlightState = initFlightState(fixture.layout);
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly log: BlastLog = {
    hashes: new Map(),
    killTick: -1,
    playerDrift: vec(0, 0, 0),
    shuttle: vec(0, 0, 0),
    buoy: vec(0, 0, 0),
    endTick: -1,
  };
  done = false;
  private world: World | undefined;
  private shuttle: Entity | undefined;

  step(): void {
    const { state, combat, log } = this;
    const tick = state.tick;
    if (tick === START_TICK) {
      state.position = BLAST_PLAYER_AT;
      state.orientation = identity();
      state.speed = 0;
      const world = createWorld(WORLD_SEED);
      this.world = world;
      const spawn = (specKey: string, position: Vec3, radius: number): Entity => {
        const result = spawnEntity(
          world,
          {
            kind: "ship",
            specKey,
            scanClass: "CLASS_NEUTRAL",
            position,
            orientation: identity(),
            radius,
            speed: 0,
            maxEnergy: 10,
            energyRechargeRate: 0,
            cargo: 0,
          },
          tick,
        );
        if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
        return result.entity;
      };
      spawn("krait", KRAIT_AT, KRAIT.radius);
      this.shuttle = spawn("shuttle", SHUTTLE_AT, 22.7517147064209);
    }
    const commands: Command[] =
      tick === 0
        ? [{ kind: "launch" }]
        : tick === 1
          ? [{ kind: "skipLaunch" }]
          : [];
    const fire = tick >= START_TICK && log.killTick < 0;
    const events = stepSim(
      state,
      this.world,
      fixture.layout,
      config,
      fire ? { ...ZERO_INTENT, fire: true } : ZERO_INTENT,
      commands,
      DT,
      OPTIONS,
      combat,
    );
    const world = this.world;
    if (world === undefined) return;
    const killedNow = events.some((e) => e.kind === "shipDestroyed");
    if (killedNow) {
      log.killTick = state.tick;
      log.playerDrift = { ...state.drift };
      log.shuttle = { ...(this.shuttle?.velocity ?? vec(0, 0, 0)) };
      log.buoy = { ...world.buoys.navBuoy.velocity };
    }
    const since = state.tick - START_TICK;
    const end = since >= STEPS;
    if (since % SAMPLE_EVERY === 0 || killedNow || end) {
      log.hashes.set(state.tick, hashWorld(state, world, combat));
    }
    if (end) {
      log.endTick = state.tick;
      this.done = true;
    }
  }
}

function blastAt(hz: number): BlastLog {
  const scenario = new BlastScenario();
  runFrames(hz, scenario);
  return scenario.log;
}

describe("the blast on ships, a buoy and the player across cadences (D-03, PD-02)", () => {
  const reference = blastAt(60);

  it("pushes the player, the Shuttle and the nav buoy on the kill tick", () => {
    expect(reference.killTick).toBeGreaterThan(START_TICK);
    // The player, inside its own radius: the floor, along +z (away from the Krait).
    const floor =
      (BLAST_MOMENTUM_FACTOR * KRAIT.mass * KRAIT.radius * BLAST_RANGE_FACTOR) /
      0.1 /
      PLAYER_MASS_KG;
    expect(reference.playerDrift.x).toBe(0);
    expect(reference.playerDrift.y).toBe(0);
    expect(reference.playerDrift.z).toBeCloseTo(floor, 9);
    expect(reference.shuttle.y).toBeGreaterThan(0);
    expect(reference.shuttle.x).toBe(0);
    expect(reference.buoy.x).toBeLessThan(0);
    expect(reference.buoy.y).toBe(0);
  });

  it("gives the same hashes and pushes at 30, 60 and 144 Hz", () => {
    expect(reference.hashes.size).toBeGreaterThan(20);
    for (const hz of CADENCES) {
      const log = blastAt(hz);
      expect(sorted(log.hashes)).toEqual(sorted(reference.hashes));
      expect(log.killTick).toBe(reference.killTick);
      expect(log.playerDrift).toEqual(reference.playerDrift);
      expect(log.shuttle).toEqual(reference.shuttle);
      expect(log.buoy).toEqual(reference.buoy);
      expect(log.endTick).toBe(reference.endTick);
    }
  });
});
