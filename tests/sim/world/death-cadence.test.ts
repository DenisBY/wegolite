// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence determinism of the kills and of the player's death (QUAL-11,
 * ROADMAP Phase 20 criterion 4, plan 20-03; D-01, D-09; T-20-08, T-20-37).
 *
 * One scenario in one world (criterion 4's wording, kept whole: this is not
 * the per-kind fallback), replayed with frame deltas of 1/30, 1/60 and 1/144 s
 * through the fixed-step accumulator (the frame runner of
 * `collision-cadence.test.ts`). Three kills of three kinds, in a fixed order:
 * first an NPC kills an NPC (a Viper test pilot's beam empties an Adder, far
 * from the player's path), then the player's ram destroys the buoy and kills
 * the player on one contact. At every cadence the player, launched and put
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
 * also pinned as literals (`KILL_STEPS`, `DEATH_STEP`, `DEATH_CAUSE`). Every cross-cadence
 * assertion carries the per-cadence timeline `{ step, kind, victim, cause }`
 * in its message, so a timing difference reads differently from a missing kill
 * or an accumulator defect.
 */

import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
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
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import { PLAYER_ID, STATION_NAV_BUOY_ID } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

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
 * The NPC fight, parked far from the player's path (as `npc-vs-npc.scenario`
 * parks its fight): a Viper test pilot holds an Adder 1,000 m ahead of it and
 * fires on every ask. The Adder is inert with 13 energy and no recharge, and
 * the beam does 6 a hit, so the hits take it to 7, 1 and -5: the third kills it.
 */
const FAR = vec(1e7, 0, 0);
const VICTIM_ENERGY = 13;
const SHOOTER_ENERGY = 180;

/**
 * Measured (plan 20-03 Task 2, 2026-11-23; the same steps at 30, 60 and
 * 144 Hz): the step of the NPC-against-NPC kill, counted from the first
 * `stepSim` call. The beam's period is 13 ticks (17-09), so the three hits land
 * on the steps `START_TICK` + 1, + 14 and + 27 and the kill is on step
 * `NPC_KILL_STEP`; a scratch run of the fight alone (Task 1) gave the same
 * step. The collision kill and the death share `DEATH_STEP`.
 */
const NPC_KILL_STEP = 28;

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
/**
 * The steps of the three kills in their fixed order: the NPC's kill of the
 * Adder, the buoy's destruction by the ram and the player's death (the last two
 * on one contact, D-09).
 */
const KILL_STEPS = [NPC_KILL_STEP, DEATH_STEP, DEATH_STEP] as const;

const OPTIONS: StepOptions = {
  npcFlight: realNpcFlightTable(),
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: fullHullTable(),
    debris: debrisFixture(),
    npcWeapons: realNpcWeapons(),
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
  /** The NPC fight's ships and the steps of the shooter's hits on the victim. */
  shooter: number;
  victim: number;
  readonly npcHitSteps: number[];
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
    shooter: -1,
    victim: -1,
    npcHitSteps: [],
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

  /** The NPC-against-NPC fight, in the same world, at the far region. */
  private spawnFight(world: World, tick: number): void {
    const spawn = (
      specKey: string,
      position: Vec3,
      extra: Record<string, unknown>,
    ): number => {
      const result = spawnEntity(
        world,
        {
          kind: "ship",
          specKey,
          scanClass: "CLASS_NEUTRAL",
          position,
          orientation: identity(),
          radius: 30,
          speed: 0,
          maxEnergy: 85,
          energyRechargeRate: 0,
          ...extra,
        },
        tick,
      );
      if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
      return result.entity.id;
    };
    const victim = spawn("adder", vec(FAR.x, FAR.y, FAR.z - 1_000), {
      maxEnergy: VICTIM_ENERGY,
      cargo: 40,
    });
    const pilot = createTestPilotAi(tick, { fire: true, holdRange: 5_000 });
    pilot.params["phase"] = "hold";
    pilot.params["targetId"] = victim;
    this.log.victim = victim;
    this.log.shooter = spawn("viper", FAR, {
      maxEnergy: SHOOTER_ENERGY,
      ai: pilot,
    });
  }

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
      this.spawnFight(this.world, tick);
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
      if (
        event.kind === "shipHit" &&
        event.source === log.shooter &&
        event.target === log.victim
      ) {
        log.npcHitSteps.push(step);
      }
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
    "%i Hz: all three kills happen, once each, in the fixed order (non-vacuity)",
    (hz) => {
      const log = logAt(hz);
      const message = timelines();
      // The NPC's kill: the Adder, killed by the Viper's beam (an NPC, not the
      // player), after exactly three hits of the Viper on the Adder.
      const [npc, buoy, player] = log.timeline;
      expect(log.timeline.length, message).toBe(3);
      expect(npc?.kind, message).toBe("shipDestroyed");
      expect(npc?.victim, message).toBe(`adder#${String(log.victim)}`);
      expect(npc?.cause, message).toBe(`killer ${String(log.shooter)}`);
      expect(log.shooter, message).not.toBe(PLAYER_ID);
      expect(log.npcHitSteps.length, message).toBe(3);
      expect(log.npcHitSteps.at(-1), message).toBe(npc?.step);
      // The collision kill: the nav buoy, credited to the player's scrape.
      expect(buoy?.kind, message).toBe("shipDestroyed");
      expect(buoy?.victim.split("#")[1], message).toBe(
        String(STATION_NAV_BUOY_ID),
      );
      expect(buoy?.cause, message).toBe(`killer ${String(PLAYER_ID)}`);
      // The player's death, once, on the buoy's step.
      expect(player?.kind, message).toBe("playerDestroyed");
      expect(log.deaths, message).toBe(1);
      expect(player?.step, message).toBe(buoy?.step);
    },
  );

  it.each(CADENCES)(
    "%i Hz: the kill steps, the death tick and the cause equal the pinned literals",
    (hz) => {
      const log = logAt(hz);
      const message = timelines();
      expect(
        log.timeline.map((kill) => kill.step),
        message,
      ).toEqual([...KILL_STEPS]);
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
