// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence world determinism (FOUND-12, FOUND-07; test map row
 * "world-cadence").
 *
 * The flight-cadence rule extended to the world: one tick-indexed scenario that
 * launches (a world is created with an epoch bump), flies with test pilots and
 * jumps (the world is recreated at the arrival) must hash identically when the
 * frames that drive the accumulator arrive at 30, 60 or 144 Hz. The scenario
 * keeps its own lifecycle state: the session's real lifecycle
 * (`createWorldLifecycle`) arrives only in plan 08-15 (wave 8), so this test
 * necessarily carries its own copy of the same bump-then-derive rule. Plan
 * 08-16's `tests/app/session/tick-parity.test.ts` is the test that checks the
 * real lifecycle against a replay.
 *
 * Per plan 08-11's jump-step rule the old world is not stepped on the step that
 * emits `hyperspaceJumped` (the arrival replaces the world right after the
 * step), so the replacement happens with no extra world tick at any cadence;
 * the scenario asserts that the old world is untouched by that step. The tick
 * log is indexed by TICK, never by frame: a frame-indexed log is chunked
 * differently at each cadence and is the classic false failure. The frame
 * runner is a copy of the one in tests/sim/flight-cadence.test.ts.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { System } from "../../../src/content/types.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import {
  applyWitchpointArrival,
  drawWitchpointExit,
} from "../../../src/sim/hyperspace/arrival.js";
import { witchspaceStationMass } from "../../../src/sim/hyperspace/countdown.js";
import {
  arrivalMarketSeed,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import type { Command } from "../../../src/sim/commands.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { identity, vec } from "../../../src/sim/math.js";
import { NEW_GAME_FUEL } from "../../../src/sim/player/profile.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import { entityHashes, hashWorld } from "../../../src/sim/world/serialize.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import type { SystemLayout } from "../../../src/sim/world/layout.js";
import {
  createWorld,
  liveEntityCount,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { LAVE_SYSTEM_ID, laveFixture } from "../../helpers/lave.js";

const LEESTI_SYSTEM_ID = "g0-s55";
const fixture = laveFixture();
const { config } = fixture;

const systems = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];
const found = systems.find((system) => system.id === LEESTI_SYSTEM_ID);
if (found === undefined) throw new Error("the fixture has no Leesti system");
const leesti: System = found;
const leestiLayout = deriveSystemLayout(leesti, fixture.stationDef);

/** One per-tick intent log, replayed identically at every frame cadence. */
const SCRIPT: readonly ControlIntent[] = [
  { ...ZERO_INTENT, roll: 1, speed: 1 },
  { ...ZERO_INTENT, pitch: 0.5, speed: 1 },
  { ...ZERO_INTENT, pitch: -0.25, roll: -1 },
  { ...ZERO_INTENT, speed: -1 },
];

const intentAtTick = (tick: number): ControlIntent =>
  SCRIPT[tick % SCRIPT.length] as ControlIntent;

/** Steps flown after the arrival before the scenario ends. */
const POST_ARRIVAL_STEPS = 600;
/** Steps flown clear of the station before the jump countdown begins. */
const CRUISE_STEPS = 30;
/** Sample the world hash every this many ticks, besides the event ticks. */
const SAMPLE_EVERY = 60;
const PILOTS = 3;

interface Sample {
  readonly hash: string;
  readonly entities: number;
  readonly epoch: number;
}

/** Everything the scenario records; compared across cadences. */
interface Log {
  readonly samples: Map<number, Sample>;
  launchTick: number;
  arrivalTick: number;
  endTick: number;
  /** The old world's entity hashes were unchanged by the jump step. */
  jumpStepLeftOldWorldAlone: boolean;
}

/**
 * The tick-indexed scenario: launch, fly with test pilots, jump Lave to Leesti,
 * fly on. Its lifecycle state (epoch and world) is its own copy of the rule
 * the session follows: bump the epoch, then derive the world seed.
 */
class Scenario {
  readonly state: FlightState = initFlightState(fixture.layout);
  readonly log: Log = {
    samples: new Map(),
    launchTick: -1,
    arrivalTick: -1,
    endTick: -1,
    jumpStepLeftOldWorldAlone: false,
  };
  done = false;
  private world: World | undefined;
  private epoch = 0;
  private layout: SystemLayout = fixture.layout;
  private fuel = NEW_GAME_FUEL;
  private origin: System = fixture.system;
  private stepsSinceArrival = 0;
  private jumped = false;
  private jumpTick = -1;

  /** The tick the player is at when `beginHyperspace` is issued. */
  private static readonly BEGIN_TICK = 2 + CRUISE_STEPS;

  private options(): StepOptions {
    const stationMass = witchspaceStationMass(this.origin.station);
    return {
      hyperspace: {
        fuel: this.fuel,
        origin: {
          id: this.origin.id,
          x: this.origin.chartX,
          y: this.origin.chartY,
        },
        target: { id: leesti.id, x: leesti.chartX, y: leesti.chartY },
        ...(stationMass === undefined ? {} : { stationMass }),
      },
    };
  }

  /** The commands issued at the player's current tick. */
  private commandsAtTick(tick: number): readonly Command[] {
    if (tick === 0) return [{ kind: "launch" }];
    if (tick === 1) return [{ kind: "skipLaunch" }];
    if (tick === Scenario.BEGIN_TICK) return [{ kind: "beginHyperspace" }];
    return [];
  }

  private spawnPilots(world: World): void {
    for (let i = 0; i < PILOTS; i += 1) {
      const result = spawnEntity(
        world,
        {
          kind: "ship",
          specKey: "test-pilot",
          scanClass: "CLASS_NEUTRAL",
          position: vec(
            this.state.position.x + 400 * (i + 1),
            this.state.position.y + 60 * i,
            this.state.position.z - 200 * i,
          ),
          orientation: identity(),
          radius: 40,
          speed: 0,
          ai: createTestPilotAi(this.state.tick, {
            scanRange: 1e9,
            holdRange: 1,
            cruiseSpeed: 150,
          }),
        },
        this.state.tick,
      );
      if (!result.ok) {
        throw new Error(`pilot spawn refused: ${result.reason}`);
      }
    }
  }

  private sample(): void {
    const { state, world } = this;
    if (world === undefined) return;
    this.log.samples.set(state.tick, {
      hash: hashWorld(state, world),
      entities: liveEntityCount(world),
      epoch: this.epoch,
    });
  }

  /** The launch: bump the epoch, then derive the world seed (D-02). */
  private onLaunched(): void {
    this.epoch += 1;
    this.world = createWorld(
      worldSeedFor(marketSeedForSystem(LAVE_SYSTEM_ID), this.epoch),
    );
    this.spawnPilots(this.world);
    this.log.launchTick = this.state.tick;
    this.sample();
  }

  /** The arrival: the session's pose draw, then a new world at the next epoch. */
  private onJumped(
    event: Extract<SimEvent, { kind: "hyperspaceJumped" }>,
  ): void {
    const exit = drawWitchpointExit(marketSeedForSystem(LAVE_SYSTEM_ID));
    applyWitchpointArrival(this.state, leestiLayout, config, exit);
    this.layout = leestiLayout;
    this.origin = leesti;
    this.fuel = Math.max(0, this.fuel - event.fuelCost);
    this.epoch += 1;
    this.world = createWorld(
      worldSeedFor(
        arrivalMarketSeed(
          LEESTI_SYSTEM_ID,
          marketSeedForSystem(LAVE_SYSTEM_ID),
        ),
        this.epoch,
      ),
    );
    this.spawnPilots(this.world);
    this.log.arrivalTick = this.state.tick;
    this.sample();
  }

  /** One fixed step of the scenario. */
  step(): void {
    const { state } = this;
    const tick = state.tick;
    // The teleport clears the station's mass lock, as the recorded flight does.
    if (tick === 2) state.position = vec(1e7, 0, 0);
    const intent =
      state.mode === "launching" ? ZERO_INTENT : intentAtTick(tick);
    const oldWorld = this.world;
    const before =
      oldWorld === undefined ? "" : JSON.stringify(entityHashes(oldWorld));
    const events = stepSim(
      state,
      oldWorld,
      this.layout,
      config,
      intent,
      this.commandsAtTick(tick),
      DT,
      this.options(),
    );
    for (const event of events) {
      if (event.kind === "launched") this.onLaunched();
      if (event.kind === "hyperspaceJumped") {
        this.log.jumpStepLeftOldWorldAlone =
          oldWorld !== undefined &&
          JSON.stringify(entityHashes(oldWorld)) === before;
        this.jumped = true;
        this.jumpTick = state.tick;
        this.onJumped(event);
      }
    }
    if (state.tick % SAMPLE_EVERY === 0) this.sample();
    if (this.jumped && state.tick > this.jumpTick) this.stepsSinceArrival += 1;
    if (this.stepsSinceArrival >= POST_ARRIVAL_STEPS) {
      this.log.endTick = state.tick;
      this.sample();
      this.done = true;
    }
  }
}

/**
 * The frame runner of tests/sim/flight-cadence.test.ts: clamp the frame delta,
 * run whole 1/120 s steps, cap catch-up at five steps per frame and drop the
 * backlog after a stall. It steps the scenario until the scenario is done.
 */
function replay(hz: number): Log {
  const scenario = new Scenario();
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000)
      throw new Error(`cadence ${String(hz)} never finished`);
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

describe("world cross-cadence determinism", () => {
  it("hashes the world identically at 30, 60 and 144 Hz across a launch and an arrival", () => {
    for (const hz of [30, 60, 144]) {
      const log = logs.get(hz) as Log;
      expect(entriesOf(log)).toEqual(entriesOf(reference));
    }
  });

  it("compares a populated world at every sampled tick, so the equality is not vacuous", () => {
    for (const hz of [30, 60, 144]) {
      const log = logs.get(hz) as Log;
      expect(log.samples.size).toBeGreaterThan(10);
      for (const sample of log.samples.values()) {
        expect(sample.entities).toBe(PILOTS);
      }
    }
  });

  it("launches, bumps the epoch and arrives at the same ticks at every cadence", () => {
    for (const hz of [30, 60, 144]) {
      const log = logs.get(hz) as Log;
      expect(log.launchTick).toBe(reference.launchTick);
      expect(log.arrivalTick).toBe(reference.arrivalTick);
      expect(log.endTick).toBe(reference.endTick);
      expect(log.launchTick).toBeGreaterThan(0);
      expect(log.arrivalTick).toBeGreaterThan(log.launchTick);
      expect(log.endTick).toBe(log.arrivalTick + POST_ARRIVAL_STEPS);
      // The launch is epoch 1 and the arrival epoch 2: two distinct worlds.
      expect(log.samples.get(log.launchTick)?.epoch).toBe(1);
      expect(log.samples.get(log.arrivalTick)?.epoch).toBe(2);
      expect(log.samples.get(log.launchTick)?.hash).not.toBe(
        log.samples.get(log.arrivalTick)?.hash,
      );
    }
  });

  it("does not step the old world on the hyperspaceJumped step at any cadence", () => {
    for (const hz of [30, 60, 144]) {
      expect((logs.get(hz) as Log).jumpStepLeftOldWorldAlone).toBe(true);
    }
  });
});
