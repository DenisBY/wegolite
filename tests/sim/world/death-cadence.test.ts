// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence determinism of the kills and of the player's death (QUAL-11,
 * ROADMAP Phase 20 criterion 4, plan 20-03; D-01, D-09; T-20-08, T-20-37).
 *
 * One scenario in one world, replayed with frame deltas of 1/30, 1/60 and
 * 1/144 s through the fixed-step accumulator (the frame runner of
 * `collision-cadence.test.ts`). At every cadence the player, launched and put
 * into flight, is placed 400 m off the nav buoy and flies into it at 350 m/s
 * from full shields and bank (the measured lethal ram of
 * `collision-buoy.test.ts`): on that one contact the buoy is destroyed (the
 * collision kill, a `shipDestroyed` credited to the player through a scrape
 * record) and the player dies (`playerDestroyed`, owner decision 2026-11-16).
 *
 * The log is indexed by STEP, never by frame, and every `SAMPLE_EVERY`th step
 * plus every step that carries a kill is sampled; every step after the death
 * is sampled, because the owner's dead-hash decision says the world stays
 * frozen at the hash of the death tick (D-01): the tick does not advance and
 * `stepSim` returns no events. Because the tick stops at the death, the replay
 * ends by counting steps (`POST_DEATH_STEPS` after the death), never by the
 * state's tick: a tick-based end would run to the frame bound and throw.
 *
 * Equality across the three cadences is not enough on its own (a shift common
 * to all three would pass), so the step of each kill and the death cause are
 * also pinned as literals (`DEATH_STEP`, `DEATH_CAUSE`). Every cross-cadence
 * assertion carries the per-cadence timeline `{ step, kind, victim, cause }`
 * in its message, so a timing difference reads differently from a missing kill
 * or an accumulator defect.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { Command } from "../../../src/sim/commands.js";
import type { PlayerDeathCause, SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { identity, vec } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import { STATION_NAV_BUOY_ID } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const CADENCES = [30, 60, 144] as const;
const NAV_BUOY = layout.navBuoy.position;

/** The tick at which the world is created and the player is placed. */
const START_TICK = 2;
/** The player starts this far off the nav buoy, nose-on, at `RAM_SPEED`. */
const RAM_DISTANCE = 400;
const RAM_SPEED = 350;
/** Steps sampled between kills; every step after the first kill is sampled. */
const SAMPLE_EVERY = 10;
/** The dead window the replay keeps stepping after the death (D-01). */
const POST_DEATH_STEPS = 240;
/** A hard bound: the death must come well before it. */
const STEP_BUDGET = 1_000;

/**
 * Measured (plan 20-03 Task 1, 2026-11-23; the same step at 30, 60 and 144 Hz):
 * the contact step of the 350 m/s ram from 400 m, counted from the first
 * `stepSim` call (step 0 is the launch tick). 20-01 measured contact 105 ticks
 * after the placement tick; the placement is at step `START_TICK`, so the
 * contact, the buoy's destruction and the death are on step 107, and the tick
 * the death leaves in the state is 108.
 */
const DEATH_STEP = 107;
const DEATH_TICK = 108;
/** The death's cause: a scrape record of the nav buoy (D-04). */
const DEATH_CAUSE: PlayerDeathCause = { damage: "scrape", culprit: "buoy" };

const OPTIONS: StepOptions = {
  npcFlight: realNpcFlightTable(),
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: fullHullTable(),
    debris: debrisFixture(),
    collisions: true,
  },
};

/** One kill of the timeline: what died, at which step, and why. */
interface Kill {
  readonly step: number;
  readonly kind: "shipDestroyed" | "playerDestroyed";
  readonly victim: string;
  readonly cause: string;
}

interface CadenceLog {
  readonly world: Map<number, string>;
  readonly flight: Map<number, string>;
  readonly timeline: Kill[];
  /** The step on which `playerDestroyed` was posted; -1 until it is. */
  deathStep: number;
  deathCause: PlayerDeathCause | undefined;
  /** The tick the death left in the state. */
  deathTick: number;
  /** The number of `playerDestroyed` events seen over the whole replay. */
  deaths: number;
  /** The number of steps run. */
  steps: number;
  endTick: number;
  /** Why the replay stopped: the dead window ran out, or the hard budget. */
  endedBy: "postDeathSteps" | "stepBudget" | "running";
}

function describeKill(event: SimEvent, step: number): Kill | undefined {
  if (event.kind === "shipDestroyed") {
    return {
      step,
      kind: "shipDestroyed",
      victim: `${event.specKey}#${String(event.id)}`,
      cause: `killer ${String(event.killer)}`,
    };
  }
  if (event.kind === "playerDestroyed") {
    return {
      step,
      kind: "playerDestroyed",
      victim: "player",
      cause: `${event.cause.damage}/${event.cause.culprit ?? "none"}`,
    };
  }
  return undefined;
}

class DeathScenario {
  readonly state: FlightState = initFlightState(layout);
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly log: CadenceLog = {
    world: new Map(),
    flight: new Map(),
    timeline: [],
    deathStep: -1,
    deathCause: undefined,
    deathTick: -1,
    deaths: 0,
    steps: 0,
    endTick: -1,
    endedBy: "running",
  };
  done = false;
  private world: World | undefined;

  step(): void {
    const { state, combat, log } = this;
    const step = log.steps;
    const tick = state.tick;
    if (tick === START_TICK && this.world === undefined) {
      state.position = vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + RAM_DISTANCE);
      state.orientation = identity();
      state.drift = vec(0, 0, 0);
      state.speed = RAM_SPEED;
      this.world = createWorld(11);
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
    log.steps += 1;
    const world = this.world;
    if (world === undefined) return;
    let killed = false;
    for (const event of events) {
      const kill = describeKill(event, step);
      if (kill === undefined) continue;
      killed = true;
      log.timeline.push(kill);
      if (event.kind === "playerDestroyed") {
        log.deaths += 1;
        if (log.deathStep < 0) {
          log.deathStep = step;
          log.deathCause = event.cause;
          log.deathTick = state.tick;
        }
      }
    }
    const sample =
      killed || log.deathStep >= 0 || (step - START_TICK) % SAMPLE_EVERY === 0;
    if (sample) {
      log.world.set(step, hashWorld(state, world, combat));
      log.flight.set(step, hashFlight(state));
    }
    if (log.deathStep >= 0 && step >= log.deathStep + POST_DEATH_STEPS) {
      log.endedBy = "postDeathSteps";
    } else if (log.steps >= STEP_BUDGET) {
      log.endedBy = "stepBudget";
    }
    if (log.endedBy !== "running") {
      log.endTick = state.tick;
      this.done = true;
    }
  }
}

/**
 * The frame runner of `collision-cadence.test.ts`: clamp the frame delta, run
 * whole fixed steps, cap catch-up at `MAX_STEPS_PER_FRAME` and drop the backlog
 * after a stall. It ends by the scenario's step count, and throws when the
 * frame bound is hit instead.
 */
function replay(hz: number): CadenceLog {
  const scenario = new DeathScenario();
  let accumulator = 0;
  for (let frame = 0; !scenario.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`death cadence ${String(hz)} never finished`);
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

/** The per-cadence timelines, for the message of every cross-cadence assertion. */
function timelines(): string {
  return CADENCES.map(
    (hz) =>
      `${String(hz)} Hz: ${JSON.stringify(logAt(hz).timeline)} death step ${String(
        logAt(hz).deathStep,
      )} tick ${String(logAt(hz).deathTick)} ended by ${logAt(hz).endedBy}`,
  ).join("\n");
}

describe("the player's death and the buoy's destruction across frame rates (QUAL-11, D-01, D-09)", () => {
  it.each(CADENCES)(
    "%i Hz: the ram destroys the buoy and the player once each, on one step",
    (hz) => {
      const log = logAt(hz);
      const message = timelines();
      expect(
        log.timeline.map((kill) => [kill.kind, kill.victim.split("#")[1]]),
        message,
      ).toEqual([
        ["shipDestroyed", String(STATION_NAV_BUOY_ID)],
        ["playerDestroyed", undefined],
      ]);
      expect(log.deaths, message).toBe(1);
      const [buoy, player] = log.timeline;
      expect(buoy?.step, message).toBe(player?.step);
    },
  );

  it.each(CADENCES)(
    "%i Hz: the death step and the cause equal the pinned literals",
    (hz) => {
      const log = logAt(hz);
      const message = timelines();
      expect(log.deathStep, message).toBe(DEATH_STEP);
      expect(log.deathTick, message).toBe(DEATH_TICK);
      expect(log.deathCause, message).toEqual(DEATH_CAUSE);
    },
  );

  it.each(CADENCES.filter((hz) => hz !== 60))(
    "%i Hz: the kills and the death are on the same steps with the same cause as at 60 Hz",
    (hz) => {
      const reference = logAt(60);
      const log = logAt(hz);
      const message = timelines();
      expect(log.timeline, message).toEqual(reference.timeline);
      expect(log.deathStep, message).toBe(reference.deathStep);
      expect(log.deathTick, message).toBe(reference.deathTick);
      expect(log.deathCause, message).toEqual(reference.deathCause);
    },
  );

  it.each(CADENCES.filter((hz) => hz !== 60))(
    "%i Hz: hashWorld and hashFlight equal 60 Hz at every sampled step",
    (hz) => {
      const reference = logAt(60);
      const log = logAt(hz);
      const message = timelines();
      expect(sorted(log.world), message).toEqual(sorted(reference.world));
      expect(sorted(log.flight), message).toEqual(sorted(reference.flight));
      expect(log.world.size, message).toBeGreaterThan(POST_DEATH_STEPS);
    },
  );

  it.each(CADENCES)(
    "%i Hz: for 240 steps after the death every hash equals the death-tick hash and the tick stands still (D-01)",
    (hz) => {
      const log = logAt(hz);
      const message = timelines();
      const deadWorld = log.world.get(log.deathStep);
      const deadFlight = log.flight.get(log.deathStep);
      expect(deadWorld, message).toBeDefined();
      for (
        let step = log.deathStep;
        step <= log.deathStep + POST_DEATH_STEPS;
        step += 1
      ) {
        expect(log.world.get(step), `${message}\nstep ${String(step)}`).toBe(
          deadWorld,
        );
        expect(log.flight.get(step), `${message}\nstep ${String(step)}`).toBe(
          deadFlight,
        );
      }
      expect(log.endTick, message).toBe(log.deathTick);
    },
  );

  it.each(CADENCES)(
    "%i Hz: the replay ended by counting steps, not by the frame bound or the step budget",
    (hz) => {
      const log = logAt(hz);
      const message = timelines();
      expect(log.endedBy, message).toBe("postDeathSteps");
      expect(log.steps, message).toBe(log.deathStep + POST_DEATH_STEPS + 1);
      expect(log.steps, message).toBeLessThan(STEP_BUDGET);
    },
  );
});
