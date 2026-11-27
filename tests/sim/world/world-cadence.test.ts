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
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import {
  applyWitchpointArrival,
  drawWitchpointExit,
} from "../../../src/sim/hyperspace/arrival.js";
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
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { NEW_GAME_FUEL } from "../../../src/sim/player/profile.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import {
  entityHashes,
  hashWorld,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import type { SystemLayout } from "../../../src/sim/world/layout.js";
import {
  createWorld,
  liveEntityCount,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { LAVE_SYSTEM_ID, laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

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
    return {
      hyperspace: {
        fuel: this.fuel,
        origin: {
          id: this.origin.id,
          x: this.origin.chartX,
          y: this.origin.chartY,
        },
        target: { id: leesti.id, x: leesti.chartX, y: leesti.chartY },
        stationMass: this.layout.stationMass,
      },
      npcFlight: realNpcFlightTable(),
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

// ---------------------------------------------------------------------------
// Combat (CBT-06, CBT-07, FOUND-19): the player holds fire on an Adder while a
// firing test pilot shoots the player from behind. The Adder (85 energy) is
// destroyed by the pulse laser partway through the run (supersedes N2) and
// leaves the world on the same tick, so the destruction and removal ticks are in
// the log and must match at every cadence. The hash includes the combat state.
// ---------------------------------------------------------------------------

const COMBAT_FAR = vec(1e7, 0, 0);
/** The tick the world is created and the player starts holding fire. */
const COMBAT_START_TICK = 2;
/**
 * Six simulated seconds of combat: the Adder dies partway, the aft shield falls
 * and the bank starts to drain.
 */
const COMBAT_STEPS = 720;
const COMBAT_SAMPLE_EVERY = 30;

const HULLS = realHullTable();
const NPC_WEAPONS = realNpcWeapons();

interface CombatLog {
  readonly samples: Map<number, string>;
  endTick: number;
  playerShots: number;
  pilotShots: number;
  /** `shipHit` events by what they struck and whether the shield took it all. */
  playerShieldHits: number;
  playerEnergyHits: number;
  adderHits: number;
  /** `shipDestroyed` events carrying the Adder's id, and the tick of each kind of event. */
  adderDestroyed: number;
  adderDestroyedTick: number;
  adderRemovedTick: number;
  refusals: number;
  final: { fwd: number; aft: number; energy: number; cabin: number };
}

class CombatScenario {
  readonly state: FlightState = initFlightState(fixture.layout);
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly log: CombatLog = {
    samples: new Map(),
    endTick: -1,
    playerShots: 0,
    pilotShots: 0,
    playerShieldHits: 0,
    playerEnergyHits: 0,
    adderHits: 0,
    adderDestroyed: 0,
    adderDestroyedTick: -1,
    adderRemovedTick: -1,
    refusals: 0,
    final: { fwd: 0, aft: 0, energy: 0, cabin: 0 },
  };
  done = false;
  private world: World | undefined;
  private adderId = -1;

  private readonly options: StepOptions = {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: NPC_WEAPONS,
    },
    npcFlight: realNpcFlightTable(),
  };

  private spawn(
    specKey: string,
    offsetZ: number,
    maxEnergy: number,
    energyRechargeRate: number,
    ai?: ReturnType<typeof createTestPilotAi>,
  ): number {
    const result = spawnEntity(
      this.world as World,
      {
        kind: "ship",
        specKey,
        scanClass: "CLASS_NEUTRAL",
        position: vec(COMBAT_FAR.x, COMBAT_FAR.y, COMBAT_FAR.z + offsetZ),
        orientation: identity(),
        radius: 40,
        speed: 0,
        maxEnergy,
        energyRechargeRate,
        ...(ai === undefined ? {} : { ai }),
      },
      this.state.tick,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity.id;
  }

  step(): void {
    const { state, combat } = this;
    const tick = state.tick;
    if (tick === COMBAT_START_TICK) {
      state.position = COMBAT_FAR;
      state.orientation = identity();
      state.speed = 0;
      this.world = createWorld(4242);
      this.adderId = this.spawn("adder", -2000, 85, 2);
      // Behind the player, nose toward it, holding at once and firing back.
      this.spawn(
        "viper",
        1500,
        180,
        4,
        createTestPilotAi(tick, {
          scanRange: 1e9,
          holdRange: 5000,
          cruiseSpeed: 150,
          fire: true,
        }),
      );
    }
    const commands: Command[] =
      tick === 0
        ? [{ kind: "launch" }]
        : tick === 1
          ? [{ kind: "skipLaunch" }]
          : [];
    const intent =
      tick >= COMBAT_START_TICK ? { ...ZERO_INTENT, fire: true } : ZERO_INTENT;
    const events = stepSim(
      state,
      this.world,
      fixture.layout,
      config,
      intent,
      commands,
      DT,
      this.options,
      combat,
    );
    for (const event of events) {
      if (event.kind === "laserFired") {
        if (event.shooter === PLAYER_ID) this.log.playerShots += 1;
        else this.log.pilotShots += 1;
      } else if (event.kind === "shipHit") {
        if (event.target === PLAYER_ID) {
          if (event.shield) this.log.playerShieldHits += 1;
          else this.log.playerEnergyHits += 1;
        } else if (event.target === this.adderId) {
          this.log.adderHits += 1;
        }
      } else if (event.kind === "shipDestroyed") {
        if (event.id === this.adderId) {
          this.log.adderDestroyed += 1;
          this.log.adderDestroyedTick = state.tick;
        }
      } else if (event.kind === "entityRemoved") {
        if (event.id === this.adderId) this.log.adderRemovedTick = state.tick;
      } else if (event.kind === "laserRefused") {
        this.log.refusals += 1;
      }
    }
    if (this.world !== undefined && state.tick % COMBAT_SAMPLE_EVERY === 0) {
      this.log.samples.set(state.tick, hashWorld(state, this.world, combat));
    }
    if (state.tick >= COMBAT_START_TICK + COMBAT_STEPS) {
      this.log.endTick = state.tick;
      if (this.world !== undefined) {
        this.log.samples.set(state.tick, hashWorld(state, this.world, combat));
      }
      this.log.final = {
        fwd: combat.fwdShield,
        aft: combat.aftShield,
        energy: combat.energy,
        cabin: combat.cabinTemp,
      };
      this.done = true;
    }
  }
}

/** The frame runner above, driving the combat scenario. */
function replayCombat(hz: number): CombatLog {
  const scenario = new CombatScenario();
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`combat cadence ${String(hz)} never finished`);
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

const combatLogs = new Map<number, CombatLog>(
  CADENCES.map((hz) => [hz, replayCombat(hz)]),
);
const combatReference = combatLogs.get(60) as CombatLog;

describe("combat cross-cadence determinism (CBT-06, CBT-07)", () => {
  it("hashes the world and the combat state identically at 30, 60 and 144 Hz", () => {
    const entries = (log: CombatLog): [number, string][] =>
      [...log.samples.entries()].sort((a, b) => a[0] - b[0]);
    for (const hz of CADENCES) {
      const log = combatLogs.get(hz) as CombatLog;
      expect(entries(log)).toEqual(entries(combatReference));
      expect(log.final).toEqual(combatReference.final);
      expect(log.endTick).toBe(combatReference.endTick);
    }
  });

  it("tallies the same shots, hits and refusals at every cadence", () => {
    for (const hz of CADENCES) {
      const log = combatLogs.get(hz) as CombatLog;
      expect({ ...log, samples: undefined }).toEqual({
        ...combatReference,
        samples: undefined,
      });
    }
  });

  it("is not vacuous: both sides shoot, shields fall and then energy drains", () => {
    expect(combatReference.samples.size).toBeGreaterThan(10);
    expect(combatReference.playerShots).toBeGreaterThan(3);
    expect(combatReference.pilotShots).toBeGreaterThan(10);
    expect(combatReference.adderHits).toBeGreaterThan(3);
    // The Adder (85 energy) dies under the pulse laser partway through the
    // run (FOUND-19): one destruction, removed on the same tick, inside the run.
    expect(combatReference.adderDestroyed).toBe(1);
    expect(combatReference.adderRemovedTick).toBe(
      combatReference.adderDestroyedTick,
    );
    expect(combatReference.adderDestroyedTick).toBeGreaterThan(
      COMBAT_START_TICK,
    );
    expect(combatReference.adderDestroyedTick).toBeLessThan(
      COMBAT_START_TICK + COMBAT_STEPS,
    );
    expect(combatReference.playerShieldHits).toBeGreaterThan(5);
    expect(combatReference.playerEnergyHits).toBeGreaterThan(0);
    expect(combatReference.final.aft).toBeLessThan(2);
    expect(combatReference.final.energy).toBeLessThan(256);
    expect(combatReference.final.cabin).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
// Kills (FOUND-18, FOUND-19, QUAL-11): the player's held pulse laser kills a
// cargo-carrying Adder, and a firing test pilot kills a Sidewinder. The world
// also carries a non-pristine weapon record (Phase 15 writes none in play; the
// value only exercises the hash) and, at the pin tick, a drift velocity that the
// next tick brakes to zero (plan 18-17), so the kill ticks, the world hash and
// the new hashed fields must agree at every cadence.
//
// Geometry: the Adder is on the player's nose; the Sidewinder and the Viper are
// 3,000 m to the side, off the player's line of fire, with the Viper 1,000 m
// behind the Sidewinder, nose on to it, and the Adder far off the Viper's line.
// The Viper is created with a scan range below its distance to every other body,
// so once the Sidewinder dies its seek finds nothing and it never fires at the
// Adder, and it is pre-set to hold.
//
// D-08 (plan 17-05): the Viper's shots now pass the NPC fire gate, and its hold
// think asks on every tick and holds its target as its nav target: it calls
// `setTarget` toward the Sidewinder on its first hold think (the old R2-11b
// "never targeted" property is gone), so it is a `nav.targetId` holder and
// `killShip` posts it `shipTargetLost`. The test pilot has no `onEvent`, so
// nothing handles it; its next hold think sees the target gone and goes back to
// seek. Under `stepSim` the registry is `AI_REGISTRY`, so a delivered event
// cannot be recorded here; the scenario instead records after every tick whether
// the Viper's `nav.targetId` is the Sidewinder's id, and asserts that it holds it
// from its first stepped tick to the Sidewinder's death.
//
// The seeded weapon record `{ temperature: 12.5, lastShotTick: 7, missedShots:
// 2 }` is no longer hash-only: the gate reads it. `lastShotTick` 7 lies after the
// start tick 2, so the timer refuses until tick 20 (7 + 13, the literal beam
// period of D-07 as revised for G-17-1); the temperature
// 12.5 cools by fround(6/120) a tick; `missedShots` 2 enters the aim tolerance
// and moves with each resolved shot.
// ---------------------------------------------------------------------------

const KILL_START_TICK = 2;
const KILL_STEPS = 720;
const KILL_SAMPLE_EVERY = 30;

interface KillRecord {
  readonly tick: number;
  readonly id: number;
  readonly killer: number;
}

interface KillLog {
  readonly samples: Map<number, string>;
  readonly kills: KillRecord[];
  readonly removedTicks: [number, number][];
  /** Event counts by kind. */
  readonly tally: Record<string, number>;
  /** `serializeWorldSection` at the start tick + 30, before the Adder dies. */
  sectionAtPin: string;
  /** The ticks at whose end the Viper's nav target is the Sidewinder (D-08). */
  readonly viperHoldsSidewinderTicks: number[];
  endTick: number;
  ids: { adder: number; sidewinder: number; viper: number };
}

class KillScenario {
  readonly state: FlightState = initFlightState(fixture.layout);
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly log: KillLog = {
    samples: new Map(),
    kills: [],
    removedTicks: [],
    tally: {},
    sectionAtPin: "",
    viperHoldsSidewinderTicks: [],
    endTick: -1,
    ids: { adder: -1, sidewinder: -1, viper: -1 },
  };
  done = false;
  private world: World | undefined;

  private readonly options: StepOptions = {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: NPC_WEAPONS,
    },
    npcFlight: realNpcFlightTable(),
  };

  private spawn(
    specKey: string,
    position: ReturnType<typeof vec>,
    extra: {
      maxEnergy: number;
      energyRechargeRate: number;
      cargo?: number;
      ai?: ReturnType<typeof createTestPilotAi>;
    },
  ): number {
    const result = spawnEntity(
      this.world as World,
      {
        kind: "ship",
        specKey,
        scanClass: "CLASS_NEUTRAL",
        position,
        orientation: identity(),
        radius: 40,
        speed: 0,
        ...extra,
      },
      this.state.tick,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity.id;
  }

  step(): void {
    const { state, combat, log } = this;
    const tick = state.tick;
    if (tick === KILL_START_TICK) {
      state.position = COMBAT_FAR;
      state.orientation = identity();
      state.speed = 0;
      this.world = createWorld(4343);
      const at = (x: number, z: number) =>
        vec(COMBAT_FAR.x + x, COMBAT_FAR.y, COMBAT_FAR.z + z);
      // Zero recharge keeps both kills independent of the cadence-free energy
      // arithmetic: the Adder (30) dies on the player's second pulse, the
      // Sidewinder (20) on the fourth beam hit of the Viper (4 x 6), at the
      // ticks the gate sets (the first shot at tick 20, then 13 ticks apart).
      log.ids.adder = this.spawn("adder", at(0, -2000), {
        maxEnergy: 30,
        energyRechargeRate: 0,
        cargo: 3,
      });
      log.ids.sidewinder = this.spawn("sidewinder", at(3000, -1500), {
        maxEnergy: 20,
        energyRechargeRate: 0,
      });
      const pilot = createTestPilotAi(tick, {
        scanRange: 100,
        holdRange: 5000,
        fire: true,
      });
      pilot.params.phase = "hold";
      pilot.params.targetId = log.ids.sidewinder;
      log.ids.viper = this.spawn("viper", at(3000, -500), {
        maxEnergy: 180,
        energyRechargeRate: 4,
        ai: pilot,
      });
      const viper = this.world.store.get(log.ids.viper);
      if (viper === undefined) throw new Error("the Viper is missing");
      viper.weapon = {
        temperature: 12.5,
        lastShotTick: 7,
        missedShots: 2,
        aftTemperature: 0,
        portTemperature: 0,
        starboardTemperature: 0,
      };
    }
    const commands: Command[] =
      tick === 0
        ? [{ kind: "launch" }]
        : tick === 1
          ? [{ kind: "skipLaunch" }]
          : [];
    const intent =
      tick >= KILL_START_TICK ? { ...ZERO_INTENT, fire: true } : ZERO_INTENT;
    const events = stepSim(
      state,
      this.world,
      fixture.layout,
      config,
      intent,
      commands,
      DT,
      this.options,
      combat,
    );
    let killedNow = false;
    for (const event of events) {
      log.tally[event.kind] = (log.tally[event.kind] ?? 0) + 1;
      if (event.kind === "shipDestroyed") {
        log.kills.push({
          tick: state.tick,
          id: event.id,
          killer: event.killer,
        });
        killedNow = true;
      } else if (event.kind === "entityRemoved") {
        log.removedTicks.push([state.tick, event.id]);
      }
    }
    const world = this.world;
    if (world !== undefined) {
      const viper = world.store.get(log.ids.viper);
      if (viper?.nav.targetId === log.ids.sidewinder) {
        log.viperHoldsSidewinderTicks.push(state.tick);
      }
      const sinceStart = state.tick - KILL_START_TICK;
      if (sinceStart === KILL_SAMPLE_EVERY) {
        // The drift velocity is written after this tick's step, so the pin
        // section and this tick's hash carry it. Since plan 18-17 a ship's
        // drift brakes by 5 x thrust x dt (1.33 m/s per tick for the Viper),
        // so the next tick brakes 1 m/s to zero before it moves: the Viper
        // never moves by it and the kill geometry is unchanged.
        if (viper !== undefined) viper.velocity = vec(1, 0, 0);
        log.sectionAtPin = serializeWorldSection(world);
      }
      if (sinceStart % KILL_SAMPLE_EVERY === 0 || killedNow) {
        log.samples.set(state.tick, hashWorld(state, world, combat));
      }
    }
    if (state.tick >= KILL_START_TICK + KILL_STEPS) {
      log.endTick = state.tick;
      if (world !== undefined) {
        log.samples.set(state.tick, hashWorld(state, world, combat));
      }
      this.done = true;
    }
  }
}

/** The frame runner above, driving the kill scenario. */
function replayKill(hz: number): KillLog {
  const scenario = new KillScenario();
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`kill cadence ${String(hz)} never finished`);
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

const killLogs = new Map<number, KillLog>(
  CADENCES.map((hz) => [hz, replayKill(hz)]),
);
const killReference = killLogs.get(60) as KillLog;

describe("kill cross-cadence determinism (FOUND-18, FOUND-19, QUAL-11)", () => {
  it("hashes kills, cargo, a weapon record and a velocity identically at 30, 60 and 144 Hz", () => {
    const entries = (log: KillLog): [number, string][] =>
      [...log.samples.entries()].sort((a, b) => a[0] - b[0]);
    for (const hz of CADENCES) {
      const log = killLogs.get(hz) as KillLog;
      expect(entries(log)).toEqual(entries(killReference));
      expect(log.endTick).toBe(killReference.endTick);
      expect(log.sectionAtPin).toBe(killReference.sectionAtPin);
    }
  });

  it("lands every kill and removal on the same tick with the same credit at every cadence", () => {
    for (const hz of CADENCES) {
      const log = killLogs.get(hz) as KillLog;
      expect(log.kills).toEqual(killReference.kills);
      expect(log.removedTicks).toEqual(killReference.removedTicks);
      expect(log.tally).toEqual(killReference.tally);
    }
  });

  it("is not vacuous: two kills with their credit, cargo, weapon and velocity in the hashed text", () => {
    const { ids, kills } = killReference;
    expect(killReference.samples.size).toBeGreaterThan(10);
    expect(kills).toHaveLength(2);
    expect(killReference.tally.shipDestroyed).toBe(2);
    expect(killReference.tally.entityRemoved).toBe(2);
    const adder = kills.find((kill) => kill.id === ids.adder);
    const sidewinder = kills.find((kill) => kill.id === ids.sidewinder);
    expect(adder?.killer).toBe(PLAYER_ID);
    expect(sidewinder?.killer).toBe(ids.viper);
    // Each destroyed ship is removed on the tick it dies.
    expect(killReference.removedTicks).toEqual(
      kills.map((kill) => [kill.tick, kill.id]),
    );
    // The Viper's four hits of 6 on the 20-point Sidewinder land on ticks 20,
    // 33, 46 and 59 (every roll passes at 3000 m; the timer opens at 7 + 13 and
    // then every 13): the kill is at tick 59, never earlier than 20 + 3 x 13.
    // The Adder's second pulse is 61 ticks after the first, at tick 64.
    // Measured on the working tree at plan 17-12; the same at every cadence.
    expect(sidewinder?.tick).toBe(20 + 3 * 13);
    expect(adder?.tick).toBe(64);
    // The Adder's second pulse hit comes at least 61 ticks after the first, so
    // it is still alive, cargo and all, in the section captured at start + 30.
    expect(adder?.tick).toBeGreaterThan(KILL_START_TICK + KILL_SAMPLE_EVERY);
    expect(killReference.sectionAtPin).toContain(";cargo:3");
    expect(killReference.sectionAtPin).toContain(";wpn:");
    expect(killReference.sectionAtPin).toContain(";vel:");
    // D-08: the gated Viper holds the Sidewinder as its nav target from its
    // first stepped tick to the Sidewinder's death (the kill posts it
    // `shipTargetLost`, which nothing handles), and the run ended after both
    // kills.
    const held = killReference.viperHoldsSidewinderTicks;
    expect(held[0]).toBe(KILL_START_TICK + 1);
    expect(held.at(-1)).toBe(sidewinder?.tick);
    expect(held).toHaveLength((sidewinder?.tick ?? 0) - KILL_START_TICK);
    expect(killReference.endTick).toBe(KILL_START_TICK + KILL_STEPS);
    expect(Math.max(...kills.map((kill) => kill.tick))).toBeLessThan(
      KILL_START_TICK + KILL_STEPS,
    );
  });
});
