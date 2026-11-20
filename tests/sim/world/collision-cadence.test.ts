// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence determinism of the collision stage (CBT-18, criterion 5, plan
 * 18-18; T-18-45).
 *
 * One tick-indexed scenario with the app's opt-in (`collisions: true`) and the
 * full hull table: the player launches and rams a Krait at rest 1 km off the
 * nav buoy, a pod drifts at 100 m/s into a resting Adder nearby, and at tick
 * `BUOY_RUN_TICK` the player is put 300 m off the nav buoy and flies into it
 * at 100 m/s. Replayed with frame deltas of 1/30, 1/60 and 1/144 s through the
 * fixed-step accumulator (the frame runner of `world-cadence.test.ts`), every
 * sampled `hashWorld` and `hashFlight` must be identical: they are indexed by
 * tick, never by frame. The non-vacuity case asserts that all three contacts
 * happened (each victim took damage, the nav buoy moved).
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { Command } from "../../../src/sim/commands.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import { DEBRIS_MAX_ENERGY } from "../../../src/sim/world/debris.js";
import type { EntityId } from "../../../src/sim/world/ids.js";
import { STATION_NAV_BUOY_ID } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture, FIXTURE_POD } from "../../helpers/debris-fixture.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const HULLS = fullHullTable();
const CADENCES = [30, 60, 144] as const;
const NAV_BUOY = layout.navBuoy.position;

const START_TICK = 2;
const BUOY_RUN_TICK = 400;
const END_TICK = 900;
const SAMPLE_EVERY = 10;

/** 1 km off the nav buoy on +X: the Krait and the pod scene. */
const SCENE = vec(NAV_BUOY.x + 1000, NAV_BUOY.y, NAV_BUOY.z);

const OPTIONS: StepOptions = {
  npcFlight: realNpcFlightTable(),
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: HULLS,
    debris: debrisFixture(),
    collisions: true,
  },
};

function spawn(
  world: World,
  specKey: string,
  position: Vec3,
  velocity: Vec3,
  tick: number,
): EntityId {
  const pod = specKey === "barrel";
  const result = spawnEntity(
    world,
    {
      kind: pod ? "cargo" : "ship",
      specKey,
      scanClass: pod ? "CLASS_CARGO" : "CLASS_NEUTRAL",
      position,
      orientation: identity(),
      radius: pod
        ? FIXTURE_POD.radius
        : (HULLS.get(specKey)?.collisionRadius ?? 30),
      maxEnergy: pod ? DEBRIS_MAX_ENERGY : 80,
      velocity,
    },
    tick,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

interface CadenceLog {
  readonly world: Map<number, string>;
  readonly flight: Map<number, string>;
  krait: EntityId;
  adder: EntityId;
  pod: EntityId;
  kraitEnergy: number;
  adderEnergy: number;
  podGone: boolean;
  buoyHealth: number;
  buoyOffset: Vec3;
  buoyHitTick: number;
}

class CollisionScenario {
  readonly state: FlightState = initFlightState(layout);
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly log: CadenceLog = {
    world: new Map(),
    flight: new Map(),
    krait: -1,
    adder: -1,
    pod: -1,
    kraitEnergy: NaN,
    adderEnergy: NaN,
    podGone: false,
    buoyHealth: NaN,
    buoyOffset: vec(0, 0, 0),
    buoyHitTick: -1,
  };
  done = false;
  private world: World | undefined;

  step(): void {
    const { state, combat, log } = this;
    const tick = state.tick;
    if (tick === START_TICK) {
      // The player 200 m behind a Krait at rest, closing at 100 m/s.
      state.position = vec(SCENE.x, SCENE.y, SCENE.z + 200);
      state.orientation = identity();
      state.speed = 100;
      this.world = createWorld(11);
      log.krait = spawn(this.world, "krait", SCENE, vec(0, 0, 0), tick);
      // A pod drifting at 100 m/s into an Adder 120 m away on +Y.
      log.adder = spawn(
        this.world,
        "adder",
        vec(SCENE.x, SCENE.y + 400, SCENE.z),
        vec(0, 0, 0),
        tick,
      );
      log.pod = spawn(
        this.world,
        "barrel",
        vec(SCENE.x, SCENE.y + 280, SCENE.z),
        vec(0, 100, 0),
        tick,
      );
    }
    if (tick === BUOY_RUN_TICK) {
      // Put the player 300 m off the nav buoy, at 100 m/s into it.
      state.position = vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + 300);
      state.orientation = identity();
      state.drift = vec(0, 0, 0);
      state.speed = 100;
    }
    const commands: Command[] =
      tick === 0
        ? [{ kind: "launch" }]
        : tick === 1
          ? [{ kind: "skipLaunch" }]
          : [];
    const events = stepSim(
      state,
      this.world,
      layout,
      config,
      ZERO_INTENT,
      commands,
      DT,
      OPTIONS,
      combat,
    );
    const world = this.world;
    if (world === undefined) return;
    if (
      log.buoyHitTick < 0 &&
      events.some(
        (event) =>
          event.kind === "shipHit" && event.target === STATION_NAV_BUOY_ID,
      )
    ) {
      log.buoyHitTick = state.tick;
      // Stop the engine after the touch so the player does not ram again.
      state.speed = 0;
    }
    const since = state.tick - START_TICK;
    if (since % SAMPLE_EVERY === 0 || state.tick >= END_TICK) {
      log.world.set(state.tick, hashWorld(state, world, combat));
      log.flight.set(state.tick, hashFlight(state));
    }
    if (state.tick >= END_TICK) {
      log.kraitEnergy = world.store.get(log.krait)?.energy ?? NaN;
      log.adderEnergy = world.store.get(log.adder)?.energy ?? NaN;
      log.podGone = world.store.get(log.pod) === undefined;
      log.buoyHealth = world.staticHealth.navBuoy;
      log.buoyOffset = { ...world.buoys.navBuoy.offset };
      this.done = true;
    }
  }
}

/** The frame runner of `world-cadence.test.ts`. */
function replay(hz: number): CadenceLog {
  const scenario = new CollisionScenario();
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`collision cadence ${String(hz)} never finished`);
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

const logs = new Map<number, CadenceLog>(
  CADENCES.map((hz) => [hz, replay(hz)]),
);

function logAt(hz: number): CadenceLog {
  const log = logs.get(hz);
  if (log === undefined) throw new Error(`no log at ${String(hz)} Hz`);
  return log;
}

function sorted(map: Map<number, string>): [number, string][] {
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

describe("collisions across frame rates (criterion 5)", () => {
  it("every contact happened: the Krait, the Adder or the pod, and the nav buoy took their share", () => {
    const log = logAt(60);
    expect(log.kraitEnergy).toBeLessThan(80);
    // The pod either survived its scrape or was removed by it; the Adder
    // took the pod's share unless it fell below the 0.05 floor.
    expect(log.podGone || log.adderEnergy < 80).toBe(true);
    expect(log.buoyHitTick).toBeGreaterThan(BUOY_RUN_TICK);
    expect(log.buoyHealth).toBeLessThan(250);
    expect(log.buoyOffset.z).toBeLessThan(-10);
  });

  it.each(CADENCES.filter((hz) => hz !== 60))(
    "%i Hz hashes the world and the flight equal to 60 Hz at every sampled tick",
    (hz) => {
      const reference = logAt(60);
      const log = logAt(hz);
      expect(sorted(log.world)).toEqual(sorted(reference.world));
      expect(sorted(log.flight)).toEqual(sorted(reference.flight));
      expect(log.buoyHitTick).toBe(reference.buoyHitTick);
      expect(log.world.size).toBeGreaterThan(80);
    },
  );
});
