// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence determinism of the whole v5 field set (FOUND-20, QUAL-12
 * groundwork; plan 21-06).
 *
 * One tick-indexed scenario: the player launches and parks far from the
 * station; two ships are spawned with every per-entity v5 field set (plan
 * 21-03: bounty, role, group, cargo kind, pod, fuel, injector, systems,
 * per-facing temperatures and weapon types, the fine mark) and a drift
 * velocity; every world record is set (`World.station`, `World.groups`,
 * `World.populator`) and the player carries a non-pristine standing. The
 * scenario is replayed with frame deltas of 1/30, 1/60 and 1/144 s through the
 * fixed-step accumulator (the frame runner of `debris-cadence.test.ts`), and
 * every sampled `hashWorld` must be identical. The log is indexed by tick,
 * never by frame.
 *
 * The non-vacuity cases show that the hash covers what the scenario sets: the
 * same scenario with the world records and the standing at rest hashes
 * differently, and so does the one with the entity fields at rest, while the
 * records and the fields are still in place at the end (nothing in the step
 * rewrote them).
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { Command } from "../../../src/sim/commands.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { identity, vec } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const fixture = laveFixture();
const { config } = fixture;
const CADENCES = [30, 60, 144] as const;

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);
const WORLD_SEED = 0x21060006;
const START_TICK = 2;
const STEPS = 600;
/** The sampled ticks since the start, as the plan names them. */
const SAMPLE_TICKS = [120, 300, 600] as const;
const SAMPLE_EVERY = 60;

const OPTIONS: StepOptions = {
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: realHullTable(),
    npcWeapons: realNpcWeapons(),
    debris: debrisFixture(),
  },
  npcFlight: realNpcFlightTable(),
};

/** The per-entity v5 fields of the first ship, all away from pristine. */
const FULL_FIELDS: Partial<SpawnInit> = {
  bounty: 50,
  role: "trader",
  groupId: 101,
  cargoKind: 1,
  podCommodity: "food",
  podAmount: 3,
  fuel: 7,
  homeSystem: 12,
  destinationSystem: 200,
  injector: { accumulator: 0.25 },
  weaponTypes: {
    fore: "EQ_WEAPON_PULSE_LASER",
    aft: "EQ_WEAPON_BEAM_LASER",
    port: null,
    starboard: "EQ_WEAPON_NONE",
  },
  markedForFines: true,
};

/** The second ship carries a different, smaller subset. */
const SOME_FIELDS: Partial<SpawnInit> = {
  bounty: 7,
  role: "pirate",
  groupId: 101,
  cargoKind: 5,
  fuel: 3,
  markedForFines: false,
};

function spawnShip(
  world: World,
  index: number,
  fields: Partial<SpawnInit>,
  tick: number,
): Entity {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: index === 0 ? "adder" : "viper",
      scanClass: "CLASS_NEUTRAL",
      position: vec(FAR.x + 3000 * (index + 1), FAR.y - 400 * index, FAR.z),
      orientation: identity(),
      radius: 40,
      speed: 0,
      velocity: vec(2.5 - 5 * index, 0.75, -1.25),
      cargo: 3,
      ai: null,
      ...fields,
    },
    tick,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

interface Variant {
  /** Set the entity v5 fields (false leaves them pristine). */
  readonly fields: boolean;
  /** Set the world records and the standing (false leaves them pristine). */
  readonly records: boolean;
}

interface CadenceLog {
  readonly hashes: Map<number, string>;
  endTick: number;
  /** The world at the end, to show nothing rewrote what was set. */
  world: World | undefined;
  combat: PlayerCombatState;
}

class V5Scenario {
  readonly state: FlightState = initFlightState(fixture.layout);
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly log: CadenceLog = {
    hashes: new Map(),
    endTick: -1,
    world: undefined,
    combat: this.combat,
  };
  done = false;
  private world: World | undefined;

  constructor(private readonly variant: Variant) {}

  step(): void {
    const { state, combat, log, variant } = this;
    const tick = state.tick;
    if (tick === START_TICK) {
      state.position = FAR;
      state.orientation = identity();
      state.speed = 0;
      const world = createWorld(WORLD_SEED);
      const first = spawnShip(
        world,
        0,
        variant.fields ? FULL_FIELDS : {},
        tick,
      );
      spawnShip(world, 1, variant.fields ? SOME_FIELDS : {}, tick);
      if (variant.fields) {
        // The per-facing temperatures have no spawn parameter.
        first.weapon.aftTemperature = 3.5;
        first.weapon.portTemperature = 4.25;
        first.weapon.starboardTemperature = 5.125;
      }
      if (variant.records) {
        world.station = { alert: 3, launched: 4, marks: [100, 101, 102] };
        // One record, whose group has live members only when the entity
        // fields are set: `commitWorld` prunes a record with no live member
        // (D-11), so a second record would not survive the first step.
        world.groups = [{ id: 101, leader: 101 }];
        world.populator = { nextTick: 2400, rolls: 3 };
        combat.standing = { legalStatus: 64, kills: 3 };
      }
      this.world = world;
      log.world = world;
    }
    const commands: Command[] =
      tick === 0
        ? [{ kind: "launch" }]
        : tick === 1
          ? [{ kind: "skipLaunch" }]
          : [];
    stepSim(
      state,
      this.world,
      fixture.layout,
      config,
      ZERO_INTENT,
      commands,
      DT,
      OPTIONS,
      combat,
    );
    const world = this.world;
    if (world === undefined) return;
    const since = state.tick - START_TICK;
    const end = since >= STEPS;
    if (since % SAMPLE_EVERY === 0 || end) {
      log.hashes.set(since, hashWorld(state, world, combat));
    }
    if (end) {
      log.endTick = state.tick;
      this.done = true;
    }
  }
}

/** The frame runner of `debris-cadence.test.ts`. */
function runFrames(hz: number, scenario: V5Scenario): void {
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`v5 cadence ${String(hz)} never finished`);
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

function replay(hz: number, variant: Variant): CadenceLog {
  const scenario = new V5Scenario(variant);
  runFrames(hz, scenario);
  return scenario.log;
}

const FULL: Variant = { fields: true, records: true };
const full = new Map<number, CadenceLog>(
  CADENCES.map((hz) => [hz, replay(hz, FULL)]),
);

function logAt(logs: Map<number, CadenceLog>, hz: number): CadenceLog {
  const log = logs.get(hz);
  if (log === undefined) throw new Error(`no log at ${String(hz)} Hz`);
  return log;
}

function sorted<T>(map: Map<number, T>): [number, T][] {
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

describe("the whole v5 field set replays equally at 30, 60 and 144 Hz (FOUND-20, QUAL-12)", () => {
  const reference = logAt(full, 60);

  it("gives equal hashes at equal ticks, including ticks 120, 300 and 600", () => {
    for (const hz of CADENCES) {
      const log = logAt(full, hz);
      expect(sorted(log.hashes)).toEqual(sorted(reference.hashes));
      expect(log.endTick).toBe(reference.endTick);
    }
    for (const since of SAMPLE_TICKS) {
      expect(reference.hashes.has(since)).toBe(true);
    }
    expect(reference.hashes.size).toBeGreaterThanOrEqual(10);
  });

  it("is not vacuous: the records and the entity fields are in the hash", () => {
    const recordsAtRest = replay(60, { fields: true, records: false });
    const fieldsAtRest = replay(60, { fields: false, records: true });
    for (const since of SAMPLE_TICKS) {
      const hash = reference.hashes.get(since);
      expect(recordsAtRest.hashes.get(since)).not.toBe(hash);
      expect(fieldsAtRest.hashes.get(since)).not.toBe(hash);
    }
  });

  it("leaves every record, the standing and the entity fields as they were set", () => {
    const world = reference.world;
    if (world === undefined) throw new Error("the scenario made no world");
    expect(world.station).toEqual({
      alert: 3,
      launched: 4,
      marks: [100, 101, 102],
    });
    expect(world.groups).toEqual([{ id: 101, leader: 101 }]);
    expect(world.populator).toEqual({ nextTick: 2400, rolls: 3 });
    expect(reference.combat.standing).toEqual({ legalStatus: 64, kills: 3 });
    const first = world.store.live[0];
    if (first === undefined) throw new Error("the first ship is gone");
    expect(first).toMatchObject({
      bounty: 50,
      role: "trader",
      groupId: 101,
      cargoKind: 1,
      podCommodity: "food",
      podAmount: 3,
      fuel: 7,
      homeSystem: 12,
      destinationSystem: 200,
      injector: { accumulator: 0.25 },
      markedForFines: true,
    });
    expect(first.weaponTypes).toEqual({
      fore: "EQ_WEAPON_PULSE_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
      port: null,
      starboard: "EQ_WEAPON_NONE",
    });
    // The ships drifted: the scenario exercised the step, not a frozen world.
    expect(first.position.x).not.toBe(FAR.x + 3000);
  });
});
