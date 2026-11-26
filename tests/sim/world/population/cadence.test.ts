// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence determinism of a populated world (Phase 22 plan 22-13; WORLD-08
 * success criterion 4, Pitfall 10).
 *
 * The system populator runs once, when the world is made (`begin`), so the
 * frame rate must not move it or anything it placed. Each scenario launches,
 * parks the player far from the station and the planet, makes the world exactly
 * as the lifecycle does (`createWorld(worldSeedFor(marketSeedForSystem(id),
 * epoch))`, then `populateSystemWorld` with the system's own layout and facts,
 * the production path of `createSystemPopulate`) and steps 600 ticks. It is
 * replayed with frame deltas of 1/30, 1/60 and 1/144 s through the fixed-step
 * accumulator (the frame runner of `v5-cadence.test.ts`), and every sampled
 * `hashWorld` must be identical. The log is indexed by tick, never by frame.
 *
 * Two systems: Lave (the New game's) and the largest galaxy-0 anarchy of the
 * census (`specSystems.largestAnarchy`), the worst case for entity count.
 *
 * The non-vacuity cases show the populated entities are in the hash: one
 * populated ship killed at the start hashes differently, and so does the
 * flight hash, while the ships are still all in place at the end (nothing in the
 * step removed them, so the step stepped a populated world and not an empty one).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEFAULT_LASER_MOUNTS } from "../../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../../src/sim/combat/state.js";
import type { Command } from "../../../../src/sim/commands.js";
import { marketSeedForSystem } from "../../../../src/sim/economy/market.js";
import { ZERO_INTENT } from "../../../../src/sim/flight/controller.js";
import {
  hashFlight,
  initFlightState,
} from "../../../../src/sim/flight/state.js";
import type { FlightState } from "../../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../../src/sim/loop.js";
import { identity, vec } from "../../../../src/sim/math.js";
import { worldSeedFor } from "../../../../src/sim/rng.js";
import { stepSim } from "../../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../../src/sim/time.js";
import { deriveSystemLayout } from "../../../../src/sim/world/layout.js";
import type { SystemLayout } from "../../../../src/sim/world/layout.js";
import { buildNeighbourhood } from "../../../../src/sim/world/neighbourhood.js";
import { systemFactsFrom } from "../../../../src/sim/world/population/plan.js";
import type { SystemFacts } from "../../../../src/sim/world/population/plan.js";
import { populateSystemWorld } from "../../../../src/sim/world/population/spawn.js";
import { hashWorld } from "../../../../src/sim/world/serialize.js";
import {
  createWorld,
  killEntity,
  liveEntityCount,
} from "../../../../src/sim/world/world.js";
import type { World } from "../../../../src/sim/world/world.js";
import { debrisFixture } from "../../../helpers/debris-fixture.js";
import { realHullTable } from "../../../helpers/hull-table.js";
import { LAVE_SYSTEM_ID, laveFixture } from "../../../helpers/lave.js";
import { realNpcFlightTable } from "../../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../../helpers/npc-weapons.js";
import {
  committedPopulationRecords,
  galaxySystems,
} from "../../../helpers/population-fixtures.js";

const fixture = laveFixture();
const { config } = fixture;
const CADENCES = [30, 60, 144] as const;

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);
/** The epoch a docked-save launch builds (`DOCKED_LAUNCH_EPOCH` of the census). */
const LAUNCH_EPOCH = 1;
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

/** The census golden's largest galaxy-0 anarchy (plan 22-12, `specSystems`). */
function largestAnarchyId(): string {
  const golden = JSON.parse(
    readFileSync(
      new URL("../../../golden/world/population-census.json", import.meta.url),
      "utf8",
    ),
  ) as { specSystems: { largestAnarchy: { id: string } } };
  return golden.specSystems.largestAnarchy.id;
}

/** One system's populate inputs: the layout and facts the lifecycle's closure builds. */
interface Arrival {
  readonly id: string;
  readonly layout: SystemLayout;
  readonly facts: SystemFacts;
}

function arrivalAt(id: string): Arrival {
  const galaxy = galaxySystems(0);
  const system = galaxy.find((candidate) => candidate.id === id);
  if (system === undefined) throw new Error(`galaxy 0 has no system "${id}"`);
  const layout = deriveSystemLayout(system, fixture.stationDef);
  return {
    id,
    layout,
    facts: systemFactsFrom(
      system,
      buildNeighbourhood(galaxy, system.systemIndex),
      layout,
    ),
  };
}

interface Variant {
  /** Kill the first populated ship as soon as the world exists. */
  readonly dropOne: boolean;
}

interface CadenceLog {
  readonly hashes: Map<number, string>;
  endTick: number;
  /** The ships the populate made, and those alive at the end. */
  populated: number;
  aliveAtEnd: number;
  /** The flight hash at the end, for the flight-versus-world case. */
  flightHash: string;
  combat: PlayerCombatState;
}

class PopulatedScenario {
  readonly state: FlightState;
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly log: CadenceLog;
  done = false;
  private world: World | undefined;

  constructor(
    private readonly arrival: Arrival,
    private readonly variant: Variant,
  ) {
    this.state = initFlightState(arrival.layout);
    this.log = {
      hashes: new Map(),
      endTick: -1,
      populated: 0,
      aliveAtEnd: 0,
      flightHash: "",
      combat: this.combat,
    };
  }

  step(): void {
    const { state, combat, log, variant, arrival } = this;
    const tick = state.tick;
    if (tick === START_TICK) {
      state.position = FAR;
      state.orientation = identity();
      state.speed = 0;
      // The lifecycle's `begin`, with the populate closure's own body.
      const world = createWorld(
        worldSeedFor(marketSeedForSystem(arrival.id), LAUNCH_EPOCH),
      );
      populateSystemWorld(
        world,
        arrival.layout,
        arrival.facts,
        committedPopulationRecords(),
      );
      log.populated = liveEntityCount(world);
      if (variant.dropOne) {
        const first = world.store.live[0];
        if (first === undefined) throw new Error("the populate made no ship");
        if (!killEntity(world, first.id)) throw new Error("the kill refused");
      }
      this.world = world;
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
      arrival.layout,
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
      log.aliveAtEnd = liveEntityCount(world);
      log.flightHash = hashFlight(state);
      this.done = true;
    }
  }
}

/** The frame runner of `v5-cadence.test.ts`. */
function runFrames(hz: number, scenario: PopulatedScenario): void {
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`populated cadence ${String(hz)} never finished`);
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

function replay(hz: number, arrival: Arrival, variant: Variant): CadenceLog {
  const scenario = new PopulatedScenario(arrival, variant);
  runFrames(hz, scenario);
  return scenario.log;
}

function sorted<T>(map: Map<number, T>): [number, T][] {
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

const SYSTEMS: readonly [string, string][] = [
  ["Lave", LAVE_SYSTEM_ID],
  ["the census's largest galaxy-0 anarchy", largestAnarchyId()],
];

describe.each(SYSTEMS)(
  "a populated %s (WORLD-08, success criterion 4)",
  (_label, id) => {
    const arrival = arrivalAt(id);
    const logs = new Map<number, CadenceLog>(
      CADENCES.map((hz) => [hz, replay(hz, arrival, { dropOne: false })]),
    );
    const at = (hz: number): CadenceLog => {
      const log = logs.get(hz);
      if (log === undefined) throw new Error(`no log at ${String(hz)} Hz`);
      return log;
    };
    const reference = at(60);

    it("gives equal hashes at equal ticks, including ticks 120, 300 and 600", () => {
      for (const hz of CADENCES) {
        const log = at(hz);
        expect(sorted(log.hashes)).toEqual(sorted(reference.hashes));
        expect(log.endTick).toBe(reference.endTick);
        expect(log.populated).toBe(reference.populated);
      }
      for (const since of SAMPLE_TICKS) {
        expect(reference.hashes.has(since)).toBe(true);
      }
      expect(reference.hashes.size).toBeGreaterThanOrEqual(10);
    });

    it("is not vacuous: the populated entities are in the hash", () => {
      expect(reference.populated).toBeGreaterThan(10);
      // Every populated ship is still there after 600 ticks of stepping.
      expect(reference.aliveAtEnd).toBe(reference.populated);
      const oneFewer = replay(60, arrival, { dropOne: true });
      for (const since of SAMPLE_TICKS) {
        expect(oneFewer.hashes.get(since)).not.toBe(
          reference.hashes.get(since),
        );
      }
      // A world with no ship hashes as the flight hash (D-01); this one does
      // not: the flight state at the end is the same one, the ships are the
      // difference.
      expect(reference.hashes.get(STEPS)).not.toBe(reference.flightHash);
    });
  },
);
