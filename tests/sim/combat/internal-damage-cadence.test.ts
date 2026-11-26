// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's internal damage is frame-rate independent (CBT-08, D-01, plan
 * 19-04): the same fight damages the same item, and destroys the same pod, on
 * the same tick whether the frames arrive at 30, 60 or 144 Hz.
 *
 * The stream is keyed by the world seed and the tick (`internalDamageSeed`),
 * never by a frame or the time, so a cadence that groups the fixed steps
 * differently cannot move a draw. The route is the shooter route: a hook-spawned
 * Viper fires through the NPC gate at a parked player and the whole `stepSim`
 * runs (the pattern of `flight-cadence.test.ts`, which indexes its log by tick
 * and drives an accumulator per cadence). Between steps the test applies each
 * emitted event to its local facts as the app will, so later rolls see the
 * damage.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { spawnTestShooter } from "../../../src/sim/ai/test-spawn.js";
import type { NpcWeapon } from "../../../src/sim/combat/aim.js";
import type {
  InternalDamageFacts,
  InternalDamageItem,
  InternalDamagePod,
} from "../../../src/sim/combat/internal-damage.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import { createWorld } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

/** The run length in fixed steps (10 s at 1/120 s). */
const TARGET_STEPS = 1200;

/** The Viper's forward weapon as `ships-npc.json` carries it. */
const VIPER_BEAM: NpcWeapon = {
  laser: "EQ_WEAPON_BEAM_LASER",
  offset: vec(0, -0.15000000596046448, 35.034400939941406),
};

interface NpcJson {
  readonly key: string;
  readonly roles: readonly string[];
  readonly scanClass: string;
  readonly radius: number;
  readonly maxEnergy: number;
  readonly energyRechargeRate: number;
}

const VIPER_JSON = (
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as NpcJson[]
).find((record) => record.key === "viper") as NpcJson;

/** The four F3 keys at probability 1, a 20 t hold and three 1 t pods. */
function initialFacts(): {
  items: InternalDamageItem[];
  pods: InternalDamagePod[];
} {
  return {
    items: ["k_ecm", "k_scoop", "k_pod", "k_unit"].map((key) => ({
      key,
      damageProbability: 1,
    })),
    pods: [
      { commodity: "food", amount: 1 },
      { commodity: "food", amount: 1 },
      { commodity: "food", amount: 1 },
    ],
  };
}

/** A player launched, skipped to flight, parked at `FAR` and facing -Z. */
function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = 0;
  return state;
}

/** One damage event of the log, indexed by the tick it was posted on. */
type LogEntry = readonly [tick: number, kind: string, what: string];

/**
 * Drive `TARGET_STEPS` fixed steps through the frame accumulator of
 * `flight-cadence.test.ts` (clamped frame delta, whole 1/120 s steps, catch-up
 * capped at five steps) with frames of `frameDt` seconds, and log every damage
 * event by tick.
 */
function runAtCadence(frameDt: number): LogEntry[] {
  const player = flyingPlayer();
  const combat = createPlayerCombatState();
  const world = createWorld(7);
  const spawned = spawnTestShooter(
    world,
    player,
    {
      key: VIPER_JSON.key,
      roles: VIPER_JSON.roles,
      scanClass: VIPER_JSON.scanClass,
      radius: VIPER_JSON.radius,
      maxEnergy: VIPER_JSON.maxEnergy,
      energyRechargeRate: VIPER_JSON.energyRechargeRate,
    },
    player.tick,
  );
  expect(spawned).toBe(true);

  const local = initialFacts();
  const log: LogEntry[] = [];

  const stepOnce = (): void => {
    const facts: InternalDamageFacts = {
      items: local.items,
      capacityPods: 20,
      pods: local.pods,
    };
    const options: StepOptions = {
      combat: {
        mounts: DEFAULT_LASER_MOUNTS,
        hulls: HULLS,
        npcWeapons: new Map([["viper", { fore: VIPER_BEAM }]]),
        internalDamage: facts,
      },
    };
    const events = stepSim(
      player,
      world,
      layout,
      config,
      ZERO_INTENT,
      [],
      DT,
      options,
      combat,
    );
    for (const event of events) {
      if (event.kind === "equipmentDamaged") {
        log.push([player.tick, event.kind, event.key]);
        local.items = local.items.filter((item) => item.key !== event.key);
      } else if (event.kind === "cargoDestroyed") {
        log.push([player.tick, event.kind, event.commodity]);
        const index = local.pods.findIndex(
          (pod) =>
            pod.commodity === event.commodity && pod.amount === event.amount,
        );
        if (index >= 0) local.pods.splice(index, 1);
      }
    }
  };

  let accumulator = 0;
  let steps = 0;
  while (steps < TARGET_STEPS) {
    accumulator += clampFrameDelta(frameDt);
    let stepsThisFrame = 0;
    while (
      accumulator >= DT &&
      stepsThisFrame < MAX_STEPS_PER_FRAME &&
      steps < TARGET_STEPS
    ) {
      stepOnce();
      accumulator -= DT;
      steps += 1;
      stepsThisFrame += 1;
    }
    if (stepsThisFrame === MAX_STEPS_PER_FRAME) accumulator = 0;
  }
  return log;
}

describe("internal damage cadence (CBT-08, D-01)", () => {
  it("damages the same things on the same ticks at 30, 60 and 144 Hz", () => {
    const at30 = runAtCadence(1 / 30);
    const at60 = runAtCadence(1 / 60);
    const at144 = runAtCadence(1 / 144);
    // Vacuity guard: a fight that never damages anything proves nothing.
    expect(at60.length).toBeGreaterThan(0);
    expect(at30).toEqual(at60);
    expect(at144).toEqual(at60);
  });
});
