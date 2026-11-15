// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence replay with flying NPCs (WORLD-07, ROADMAP Phase 14 criterion
 * 3: "Their motion replays hash-identically at 30, 60 and 144 Hz"; plan 14-16).
 *
 * One tick-indexed scenario: the player launches into the Lave world of epoch 1
 * (traffic on, 12 inert ships), flies a fixed intent script, and at a fixed tick
 * after the launch the three scripted flyers of `spawnTestFlyers` (a Shuttle
 * flying to the station, a Viper intercepting the player and an Adder fleeing
 * it) are spawned through the AI seam's spawner. The scenario then runs at least
 * 2,400 further ticks. The tick-indexed `hashWorld` log must be identical when
 * the frames that drive the accumulator arrive at 30, 60 or 144 Hz.
 *
 * The log is indexed by TICK, never by frame: a frame-indexed log is chunked
 * differently at each cadence and is the classic false failure. The frame runner
 * is a copy of the one in tests/sim/world/world-cadence.test.ts (itself a copy
 * of tests/sim/flight-cadence.test.ts): the runner is a few lines of
 * accumulator arithmetic that must not be shared with the code under test, so
 * each cadence test carries its own.
 *
 * The cadence changes only how many whole 1/120 s steps run per frame; the
 * flyers' thinks, the steering and the proximity pass are functions of the tick,
 * so equality here proves nothing in them reads a frame time. The check is
 * deliberately close to the world-cadence one: what it adds is that the native
 * steering, the flight-script pilot and a spawn at a fixed tick all run inside
 * the replayed path.
 */

import { describe, expect, it } from "vitest";

import { spawnTestFlyers } from "../../../src/sim/ai/test-spawn.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import type { Command } from "../../../src/sim/commands.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { liveEntityCount } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { flyerRecords } from "../../helpers/flyer-records.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";
import { laveInertWorld } from "../../helpers/traffic-fixture.js";

const { layout, config } = laveFixture();
const FLIGHT = realNpcFlightTable();

const OPTIONS: StepOptions = {
  npcFlight: FLIGHT,
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: realHullTable(),
    npcWeapons: realNpcWeapons(),
  },
};

/** One per-tick intent log, replayed identically at every frame cadence. */
const SCRIPT: readonly ControlIntent[] = [
  { ...ZERO_INTENT, roll: 1, speed: 1 },
  { ...ZERO_INTENT, pitch: 0.5, speed: 1 },
  { ...ZERO_INTENT, pitch: -0.25, roll: -1 },
  { ...ZERO_INTENT, speed: -1 },
];

const intentAtTick = (tick: number): ControlIntent =>
  SCRIPT[tick % SCRIPT.length] as ControlIntent;

/** The flyers spawn this many ticks after the launch event. */
const SPAWN_AFTER_LAUNCH = 90;
/** Ticks the scenario runs after the spawn: 20 simulated seconds. */
const FLY_TICKS = 2_400;
/** Sample the world hash every this many ticks, besides the event ticks. */
const SAMPLE_EVERY = 60;
const FLYERS = 3;

interface Sample {
  readonly hash: string;
  readonly entities: number;
}

/** Everything the scenario records; compared across cadences. */
interface Log {
  readonly samples: Map<number, Sample>;
  launchTick: number;
  spawnTick: number;
  endTick: number;
  spawned: boolean;
  /** The three flyers' positions at the spawn and at the end. */
  spawnPositions: Vec3[];
  endPositions: Vec3[];
  /** Each flyer's script phase at the end. */
  endPhases: string[];
}

/** The tick-indexed scenario: launch, spawn the flyers, fly on. */
class Scenario {
  readonly state: FlightState = initFlightState(layout);
  readonly log: Log = {
    samples: new Map(),
    launchTick: -1,
    spawnTick: -1,
    endTick: -1,
    spawned: false,
    spawnPositions: [],
    endPositions: [],
    endPhases: [],
  };
  done = false;
  private world: World | undefined;

  /** The commands issued at the player's current tick. */
  private commandsAtTick(tick: number): readonly Command[] {
    if (tick === 0) return [{ kind: "launch" }];
    if (tick === 1) return [{ kind: "skipLaunch" }];
    return [];
  }

  private sample(): void {
    const { state, world } = this;
    if (world === undefined) return;
    this.log.samples.set(state.tick, {
      hash: hashWorld(state, world),
      entities: liveEntityCount(world),
    });
  }

  private flyers(world: World) {
    return world.store.live.slice(world.store.live.length - FLYERS);
  }

  /** The launch: the epoch is 1 and the world is the Lave world with traffic. */
  private onLaunched(): void {
    this.world = laveInertWorld(1);
    this.log.launchTick = this.state.tick;
    this.sample();
  }

  private spawnFlyers(world: World): void {
    const spawned = spawnTestFlyers(
      world,
      this.state,
      flyerRecords(),
      FLIGHT,
      this.state.tick,
      layout.station.position,
    );
    if (!spawned) throw new Error("spawnTestFlyers refused");
    this.log.spawned = true;
    this.log.spawnTick = this.state.tick;
    this.log.spawnPositions = this.flyers(world).map((entity) => ({
      ...entity.position,
    }));
    this.sample();
  }

  /** One fixed step of the scenario. */
  step(): void {
    const { state } = this;
    const tick = state.tick;
    const intent =
      state.mode === "launching" ? ZERO_INTENT : intentAtTick(tick);
    const events = stepSim(
      state,
      this.world,
      layout,
      config,
      intent,
      this.commandsAtTick(tick),
      DT,
      OPTIONS,
    );
    for (const event of events) {
      if (event.kind === "launched") this.onLaunched();
    }
    const world = this.world;
    if (world === undefined) return;
    if (
      !this.log.spawned &&
      this.log.launchTick >= 0 &&
      state.tick >= this.log.launchTick + SPAWN_AFTER_LAUNCH
    ) {
      this.spawnFlyers(world);
    }
    if (state.tick % SAMPLE_EVERY === 0) this.sample();
    if (this.log.spawned && state.tick >= this.log.spawnTick + FLY_TICKS) {
      this.log.endTick = state.tick;
      this.sample();
      const flyers = this.flyers(world);
      this.log.endPositions = flyers.map((entity) => ({ ...entity.position }));
      this.log.endPhases = flyers.map((entity) =>
        String(entity.ai?.params["phase"]),
      );
      this.done = true;
    }
  }
}

/**
 * The frame runner of tests/sim/world/world-cadence.test.ts: clamp the frame
 * delta, run whole 1/120 s steps, cap catch-up at five steps per frame and drop
 * the backlog after a stall. It steps the scenario until the scenario is done.
 */
function replay(hz: number): Log {
  const scenario = new Scenario();
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`cadence ${String(hz)} never finished`);
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
  return scenario.log;
}

const CADENCES = [30, 60, 144] as const;
const logs = new Map<number, Log>(CADENCES.map((hz) => [hz, replay(hz)]));
const reference = logs.get(60) as Log;

const entriesOf = (log: Log): [number, Sample][] =>
  [...log.samples.entries()].sort((a, b) => a[0] - b[0]);

describe("NPC cross-cadence determinism (WORLD-07)", () => {
  it("hashes the world with the three flyers identically at 30, 60 and 144 Hz", () => {
    for (const hz of CADENCES) {
      const log = logs.get(hz) as Log;
      expect(entriesOf(log)).toEqual(entriesOf(reference));
    }
  });

  it("indexes the log by tick: launch, spawn and end fall on the same ticks at every cadence", () => {
    for (const hz of CADENCES) {
      const log = logs.get(hz) as Log;
      expect(log.launchTick).toBe(reference.launchTick);
      expect(log.spawnTick).toBe(reference.spawnTick);
      expect(log.endTick).toBe(reference.endTick);
      expect(log.launchTick).toBeGreaterThan(0);
      expect(log.spawnTick).toBe(log.launchTick + SPAWN_AFTER_LAUNCH);
      expect(log.endTick).toBe(log.spawnTick + FLY_TICKS);
      expect(log.endPhases).toEqual(reference.endPhases);
      expect(log.endPositions).toEqual(reference.endPositions);
    }
  });

  it("compares a populated world with the flyers at every sample after the spawn, so the equality is not vacuous", () => {
    for (const hz of CADENCES) {
      const log = logs.get(hz) as Log;
      const after = entriesOf(log).filter(([tick]) => tick >= log.spawnTick);
      expect(after.length).toBeGreaterThan(30);
      for (const [, sample] of after) expect(sample.entities).toBe(12 + FLYERS);
      // Before the spawn the world holds the 12 inert ships only.
      const before = entriesOf(log).filter(([tick]) => tick < log.spawnTick);
      expect(before.length).toBeGreaterThan(0);
      for (const [, sample] of before) expect(sample.entities).toBe(12);
    }
  });

  it("moves every flyer: each is far from where it was spawned at the end", () => {
    expect(reference.spawnPositions).toHaveLength(FLYERS);
    for (let i = 0; i < FLYERS; i += 1) {
      const from = reference.spawnPositions[i] as Vec3;
      const to = reference.endPositions[i] as Vec3;
      const moved = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      expect(moved).toBeGreaterThan(100);
    }
  });
});
