// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted flyers in a live Lave world (WORLD-07, plan 14-16): the three
 * flight-script ships `spawnTestFlyers` spawns fly to the station, intercept the
 * player and flee it, through the AI seam only.
 *
 * Setup. The Lave world of epoch 1 with traffic (12 inert ships, ids 101 to
 * 112). The player is parked in flight at speed 0, 4,000 m from the station
 * centre with its nose pointing directly away from it (the pose a launch
 * leaves), so the station flyer, 3,000 m off the player's left, starts
 * sqrt(4,000^2 + 3,000^2) = 5,000 m from the station centre and has to cover
 * 2,500 m before its goal. The records are the committed `shuttle` (station),
 * `viper` (intercept) and `adder` (flee), the same three plan 14-18's hook uses.
 *
 * Nothing here computes an expected trajectory from the port: every bound is the
 * script's own goal (`FLYER_SCRIPT_RANGES`), a closed-form geometry, or "the
 * metric moved the right way", and the goal metric is `scriptGoalMetric`, the
 * one definition the pilot and the acceptance detectors use.
 */

import { describe, expect, it } from "vitest";

import { scriptGoalMetric } from "../../../src/sim/ai/pilots/flight-script.js";
import {
  FLYER_SCRIPT_RANGES,
  spawnTestFlyers,
  TEST_FLYER_DISTANCE,
} from "../../../src/sim/ai/test-spawn.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import {
  add,
  length,
  normalizeVec,
  quatFromUnitVectors,
  scale,
  sub,
  vec,
} from "../../../src/sim/math.js";
import { PLAYER_COLLISION_RADIUS_M } from "../../../src/sim/npc/stats.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { npcContacts } from "../../../src/sim/world/contacts.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { MAIN_STATION_ID, PLAYER_ID } from "../../../src/sim/world/ids.js";
import { createWorldView } from "../../../src/sim/world/view-impl.js";
import type { World } from "../../../src/sim/world/world.js";
import { flyerRecords } from "../../helpers/flyer-records.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { laveInertWorld } from "../../helpers/traffic-fixture.js";

const { layout, config } = laveFixture();
const FLIGHT = realNpcFlightTable();

/** The player's distance from the station centre, in metres. */
const PLAYER_STATION_DISTANCE = 4_000;
/** 60 simulated seconds. */
const TICKS = 7_200;
/** Combat-stream state: the accuracy a "better pilot" fleer is given (see the setup). */
const FLEER_ACCURACY = 3;

const OPTIONS: StepOptions = {
  npcFlight: FLIGHT,
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: realHullTable(),
    npcWeapons: realNpcWeapons(),
  },
};

/** Per-tick records of one flyer. */
interface FlyerLog {
  readonly id: number;
  readonly start: number;
  metric: number;
  doneTick: number;
  doneMetric: number;
  minStationDistance: number;
  alertOnStation: boolean;
}

/** The scenario's world after `TICKS` steps, with what the steps observed. */
interface Run {
  readonly world: World;
  readonly player: FlightState;
  readonly initialContacts: ReturnType<typeof npcContacts>;
  readonly spawnContacts: ReturnType<typeof npcContacts>;
  readonly ids: { station: number; intercept: number; flee: number };
  readonly logs: { station: FlyerLog; intercept: FlyerLog; flee: FlyerLog };
  readonly start: { station: number; intercept: number; flee: number };
  /** The fleer at the end of the first and of the second step after the spawn. */
  readonly fleerAfterStep1: {
    behaviour: string;
    entryPending: boolean;
    jinkZero: boolean;
  };
  readonly fleerAfterStep2: {
    behaviour: string;
    entryPending: boolean;
    jinkZero: boolean;
    combatDraws: number;
  };
  readonly fleerMax: number;
  readonly playerMoved: number;
}

function entityOf(world: World, id: number): Entity {
  const found = world.store.get(id);
  if (found === undefined) throw new Error(`no entity ${String(id)}`);
  return found;
}

function run(): Run {
  const world = laveInertWorld(1);
  const station = layout.station.position;
  // The player: in flight at speed 0, its nose pointing away from the station.
  const away = normalizeVec(vec(1, 0.3, -0.2));
  const player = initFlightState(layout);
  player.mode = "inFlight";
  player.position = add(station, scale(away, PLAYER_STATION_DISTANCE));
  player.orientation = quatFromUnitVectors(vec(0, 0, -1), away);
  player.speed = 0;
  const parked = { ...player.position };
  const initialContacts = npcContacts(world);

  const spawned = spawnTestFlyers(
    world,
    player,
    flyerRecords(),
    FLIGHT,
    player.tick,
    station,
  );
  if (!spawned) throw new Error("spawnTestFlyers refused");
  const spawnContacts = npcContacts(world);
  const live = world.store.live;
  const ids = {
    station: (live[12] as Entity).id,
    intercept: (live[13] as Entity).id,
    flee: (live[14] as Entity).id,
  };
  // A fleer with a resolved, better-than-awful accuracy: with accuracy at or
  // below 0 performFlee draws no jink and never reads the approach aspect, so the
  // "no evasive draw at aspect cos 30" assertion would be vacuous. The stock
  // draw (-5 to 5) is negative for half the seeds; the 20-seed run of plan 14-17
  // covers the natural draws.
  entityOf(world, ids.flee).steer.accuracy = FLEER_ACCURACY;

  const view = (): ReturnType<typeof createWorldView> =>
    createWorldView(world, player, layout, PLAYER_COLLISION_RADIUS_M);
  const metricOf = (
    script: "station" | "intercept" | "flee",
    id: number,
  ): number => {
    const metric = scriptGoalMetric(
      view(),
      id,
      script,
      script === "station" ? 0 : PLAYER_ID,
    );
    if (metric === undefined) throw new Error(`no metric for ${script}`);
    return metric;
  };
  const start = {
    station: metricOf("station", ids.station),
    intercept: metricOf("intercept", ids.intercept),
    flee: metricOf("flee", ids.flee),
  };
  const log = (
    script: "station" | "intercept" | "flee",
    id: number,
  ): FlyerLog => ({
    id,
    start: start[script],
    metric: start[script],
    doneTick: -1,
    doneMetric: Number.NaN,
    minStationDistance: Number.POSITIVE_INFINITY,
    alertOnStation: false,
  });
  const logs = {
    station: log("station", ids.station),
    intercept: log("intercept", ids.intercept),
    flee: log("flee", ids.flee),
  };
  const scripts = ["station", "intercept", "flee"] as const;
  const combatBefore = entityOf(world, ids.flee).rng.combat;

  let fleerAfterStep1: Run["fleerAfterStep1"] | undefined;
  let fleerAfterStep2: Run["fleerAfterStep2"] | undefined;
  let fleerMax = start.flee;
  for (let i = 0; i < TICKS; i += 1) {
    stepSim(
      player,
      world,
      layout,
      config,
      ZERO_INTENT,
      [],
      DT,
      OPTIONS,
      undefined,
    );
    for (const script of scripts) {
      const flyer = logs[script];
      const entity = entityOf(world, flyer.id);
      flyer.metric = metricOf(script, flyer.id);
      if (flyer.doneTick < 0 && entity.ai?.params["phase"] === "done") {
        flyer.doneTick = player.tick;
        flyer.doneMetric = flyer.metric;
      }
      flyer.minStationDistance = Math.min(
        flyer.minStationDistance,
        length(sub(entity.position, station)),
      );
      if (entity.steer.proximityAlert === MAIN_STATION_ID) {
        flyer.alertOnStation = true;
      }
    }
    fleerMax = Math.max(fleerMax, logs.flee.metric);
    const fleer = entityOf(world, ids.flee);
    if (i === 0) {
      fleerAfterStep1 = {
        behaviour: fleer.nav.behaviour,
        entryPending: fleer.steer.entryPending,
        jinkZero:
          fleer.steer.jink.x === 0 &&
          fleer.steer.jink.y === 0 &&
          fleer.steer.jink.z === 0,
      };
    }
    if (i === 1) {
      // The combat draws the fleer made in the first two steps: count how many
      // draws of its own stream lead from the state before the spawn to now.
      const stream = createRngState(combatBefore);
      let draws = 0;
      while (stream.s !== fleer.rng.combat && draws < 16) {
        rngNext(stream);
        draws += 1;
      }
      fleerAfterStep2 = {
        behaviour: fleer.nav.behaviour,
        entryPending: fleer.steer.entryPending,
        jinkZero:
          fleer.steer.jink.x === 0 &&
          fleer.steer.jink.y === 0 &&
          fleer.steer.jink.z === 0,
        combatDraws: draws,
      };
    }
  }
  if (fleerAfterStep1 === undefined || fleerAfterStep2 === undefined) {
    throw new Error("the scenario ran no steps");
  }
  return {
    world,
    player,
    initialContacts,
    spawnContacts,
    ids,
    logs,
    start,
    fleerAfterStep1,
    fleerAfterStep2,
    fleerMax,
    playerMoved: length(sub(player.position, parked)),
  };
}

const result = run();

describe("the scripted flyers in a Lave world (WORLD-07)", () => {
  it("starts the three flyers where the plan places them", () => {
    // 5,000 m from the station for the station flyer; 3,000 m off the player,
    // less both radii, for the other two.
    expect(result.start.station).toBeCloseTo(
      Math.hypot(PLAYER_STATION_DISTANCE, TEST_FLYER_DISTANCE),
      6,
    );
    for (const id of [result.ids.intercept, result.ids.flee]) {
      const contact = entityOf(result.world, id);
      expect(contact.nav.targetId).toBe(PLAYER_ID);
    }
    expect(result.start.intercept).toBeGreaterThan(2_800);
    expect(result.start.intercept).toBeLessThan(TEST_FLYER_DISTANCE);
    expect(result.start.flee).toBeGreaterThan(2_800);
    expect(result.start.flee).toBeLessThan(TEST_FLYER_DISTANCE);
    expect(result.playerMoved).toBeLessThan(1e-6);
  });

  it("takes FLEE_TARGET at the first step after the spawn, with no evasive draw", () => {
    // The update phase runs before the think phase, so the pilot's first think
    // (in the first step) performs FLEE_TARGET and its immediate part holds at
    // the end of that step; the deferred part is still pending.
    expect(result.fleerAfterStep1.behaviour).toBe("FLEE_TARGET");
    expect(result.fleerAfterStep1.entryPending).toBe(true);
    expect(result.fleerAfterStep1.jinkZero).toBe(true);
    // The second step's update completes the entry: the jink is set (two draws)
    // and the behaviour is still FLEE_TARGET, so there was no third, evasive
    // draw at the approach aspect cos 30 degrees.
    expect(result.fleerAfterStep2.entryPending).toBe(false);
    expect(result.fleerAfterStep2.jinkZero).toBe(false);
    expect(result.fleerAfterStep2.combatDraws).toBe(2);
    expect(result.fleerAfterStep2.behaviour).toBe("FLEE_TARGET");
  });

  it("flies the station flyer to its goal without entering the station sphere or drawing an alert from it", () => {
    const flyer = result.logs.station;
    expect(flyer.doneTick).toBeGreaterThan(0);
    expect(flyer.doneMetric).toBeLessThanOrEqual(FLYER_SCRIPT_RANGES.station);
    // Not vacuous: it reached the goal from 5,000 m, so the checks below cover
    // the whole approach.
    expect(flyer.start).toBeGreaterThan(4_999);
    expect(flyer.minStationDistance).toBeGreaterThan(500);
    expect(flyer.alertOnStation).toBe(false);
  });

  it("closes the interceptor on the player", () => {
    const flyer = result.logs.intercept;
    expect(flyer.metric).toBeLessThan(flyer.start);
    expect(flyer.doneTick).toBeGreaterThan(0);
    expect(flyer.doneMetric).toBeLessThan(FLYER_SCRIPT_RANGES.intercept);
  });

  it("opens the range of the fleer", () => {
    const flyer = result.logs.flee;
    expect(flyer.metric).toBeGreaterThan(flyer.start);
    expect(result.fleerMax).toBeGreaterThan(flyer.start + 10_000);
    expect(result.fleerMax).toBeLessThan(FLYER_SCRIPT_RANGES.flee);
  });

  it("moves the three scanner contacts and leaves the 12 inert ships where they were", () => {
    const after = npcContacts(result.world);
    expect(after).toHaveLength(15);
    expect(result.initialContacts).toHaveLength(12);
    for (let i = 0; i < 12; i += 1) {
      expect(after[i]?.position).toEqual(result.initialContacts[i]?.position);
      expect(after[i]?.orientation).toEqual(
        result.initialContacts[i]?.orientation,
      );
    }
    // The three moved: each is far from where it was spawned.
    for (let i = 12; i < 15; i += 1) {
      const from = result.spawnContacts[i]?.position;
      const to = after[i]?.position;
      if (from === undefined || to === undefined) throw new Error("no contact");
      expect(length(sub(to, from))).toBeGreaterThan(500);
    }
  });

  it("repairs no entity", () => {
    let repairs = 0;
    for (const entity of result.world.store.live) repairs += entity.repairs;
    expect(repairs).toBe(0);
  });
});
