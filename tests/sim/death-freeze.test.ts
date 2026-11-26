// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The freeze table (DEATH-01, D-01, T-20-05): every sim entry point called with
 * a dead state leaves `hashFlight`, `hashWorld`, the tick and the mode as they
 * were, and never sets a live mode again.
 *
 * Each row builds a fresh dead state through a real lethal record and
 * `killPlayer` (never by assigning the mode), calls one entry point and
 * compares the state before and after. `applyWitchpointArrival` and
 * `completeLaunch` are exported writers that set `"inFlight"`; a dead state
 * must refuse both (a dead player is never revived, the death phase's
 * fail-closed rule).
 */

import { describe, expect, it } from "vitest";

import { npcLaserRay } from "../../src/sim/combat/aim.js";
import type { NpcWeapon, NpcWeapons } from "../../src/sim/combat/aim.js";
import { DEFAULT_LASER_MOUNTS, NO_LASER } from "../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../src/sim/combat/state.js";
import { resolveShots } from "../../src/sim/combat/step.js";
import type { ShotRequest } from "../../src/sim/combat/step.js";
import { dockWithComputer } from "../../src/sim/dock/computer.js";
import { stepDocking } from "../../src/sim/dock/step.js";
import type { SimEvent } from "../../src/sim/events.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { beginLaunch, completeLaunch } from "../../src/sim/flight/launch.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import { applyWitchpointArrival } from "../../src/sim/hyperspace/arrival.js";
import type { WitchpointExitDraw } from "../../src/sim/hyperspace/arrival.js";
import { identity, vec } from "../../src/sim/math.js";
import type { Quat } from "../../src/sim/math.js";
import { stepSim } from "../../src/sim/sim.js";
import { DT } from "../../src/sim/time.js";
import { hashWorld } from "../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../src/sim/world/world.js";
import type { World } from "../../src/sim/world/world.js";
import { laveDockGeometry } from "../helpers/dock-pose.js";
import { realHullTable } from "../helpers/hull-table.js";
import { laveFixture } from "../helpers/lave.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();
const GEOMETRY = laveDockGeometry();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

/** Turned half a turn about up: the ship's nose points at +Z. */
const FACING_PLUS_Z: Quat = { w: 0, x: 0, y: 1, z: 0 };

/** The Viper's forward weapon as `ships-npc.json` carries it. */
const VIPER_BEAM: NpcWeapon = {
  laser: "EQ_WEAPON_BEAM_LASER",
  offset: vec(0, -0.15000000596046448, 35.034400939941406),
};

const STEP_OPTIONS: StepOptions = {
  dock: GEOMETRY,
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: HULLS,
    npcWeapons: new Map<string, NpcWeapons>([["viper", { fore: VIPER_BEAM }]]),
  },
};

/** A fixed arrival draw: 128/256 - 0.5 = 0, so the safety distance applies. */
const DRAW: WitchpointExitDraw = {
  radial: 0.25,
  direction: [0, 0, 1],
  tilt: [0, 0, 0],
};

interface DeadScene {
  readonly player: FlightState;
  readonly combat: PlayerCombatState;
  readonly world: World;
  /** The lethal NPC shot that killed the player, ready to be queued again. */
  readonly shot: ShotRequest;
}

/**
 * A dead player: launched, parked at `FAR`, bank 3 with no forward shield, and
 * killed by a Viper's beam through the real `resolveShots` and `killPlayer`.
 */
function deadScene(): DeadScene {
  const player = initFlightState(layout);
  stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  player.position = FAR;
  player.orientation = identity();
  player.speed = 0;
  const combat = createPlayerCombatState();
  combat.fwdShield = 0;
  combat.energy = 3;
  const world = createWorld(7);
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "viper",
      scanClass: "CLASS_NEUTRAL",
      position: vec(FAR.x, FAR.y, FAR.z - 1500),
      orientation: FACING_PLUS_Z,
      radius: 30,
      maxEnergy: 180,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  const viper = result.entity;
  const ray = npcLaserRay(viper, VIPER_BEAM);
  if (ray === null || VIPER_BEAM.laser === NO_LASER) {
    throw new Error("the weapon has no ray");
  }
  const shot: ShotRequest = {
    shooter: viper.id,
    ray,
    laser: VIPER_BEAM.laser,
  };
  const events = resolveShots(
    world,
    true,
    player,
    combat,
    [shot],
    STEP_OPTIONS,
    DT,
    layout,
  );
  expect(events.map((event) => event.kind)).toContain("playerDestroyed");
  expect(player.mode).toBe("dead");
  return { player, combat, world, shot };
}

interface Row {
  readonly name: string;
  /** Calls the entry point; returns its events where it returns any. */
  readonly call: (scene: DeadScene) => readonly SimEvent[] | undefined;
}

const ROWS: readonly Row[] = [
  {
    name: "stepSim, with a launch command and held fire",
    call: ({ player, combat, world }) =>
      stepSim(
        player,
        world,
        layout,
        config,
        { ...ZERO_INTENT, fire: true },
        [{ kind: "launch" }, { kind: "skipLaunch" }],
        DT,
        STEP_OPTIONS,
        combat,
      ),
  },
  {
    name: "stepFlight, with the launch, skip, dock and jump commands",
    call: ({ player }) =>
      stepFlight(
        player,
        layout,
        config,
        ZERO_INTENT,
        [
          { kind: "launch" },
          { kind: "skipLaunch" },
          { kind: "dockingComputer" },
          { kind: "beginHyperspace" },
        ],
        DT,
        STEP_OPTIONS,
      ),
  },
  {
    // The dead state, its world and a queued lethal NPC shot: the list is empty
    // through `resolveShots`' first-statement dead return, so no `laserFired`,
    // no fire drain, no recharge and no collision, and no hash moves.
    name: "resolveShots, given the dead state, its world and a queued lethal NPC shot",
    call: ({ player, combat, world, shot }) =>
      resolveShots(
        world,
        true,
        player,
        combat,
        [shot],
        STEP_OPTIONS,
        DT,
        layout,
      ),
  },
  {
    name: "beginLaunch",
    call: ({ player }) => {
      expect(beginLaunch(player, layout, config, GEOMETRY)).toBe(false);
      return undefined;
    },
  },
  {
    name: "completeLaunch",
    call: ({ player }) => {
      completeLaunch(player);
      return undefined;
    },
  },
  {
    name: "stepDocking",
    call: ({ player }) => stepDocking(player, layout, GEOMETRY, DT),
  },
  {
    name: "dockWithComputer, fitted",
    call: ({ player }) => dockWithComputer(player, layout, true),
  },
  {
    name: "applyWitchpointArrival",
    call: ({ player }) => {
      applyWitchpointArrival(player, layout, config, DRAW);
      return undefined;
    },
  },
];

describe("every sim entry point fails closed on a dead state (DEATH-01, D-01)", () => {
  it.each(ROWS)(
    "$name leaves the hashes, the tick and the mode as they were",
    (row) => {
      const scene = deadScene();
      const { player, combat, world } = scene;
      const flightBefore = hashFlight(player);
      const worldBefore = hashWorld(player, world, combat);
      const tick = player.tick;
      const clock = player.clockSeconds;

      const events = row.call(scene);

      if (events !== undefined) expect(events).toEqual([]);
      expect(player.mode).toBe("dead");
      expect(hashFlight(player)).toBe(flightBefore);
      expect(hashWorld(player, world, combat)).toBe(worldBefore);
      expect(player.tick).toBe(tick);
      expect(player.clockSeconds).toBe(clock);
    },
  );

  it("the table covers every entry point of the plan", () => {
    expect(ROWS.map((row) => row.name.split(",")[0])).toEqual([
      "stepSim",
      "stepFlight",
      "resolveShots",
      "beginLaunch",
      "completeLaunch",
      "stepDocking",
      "dockWithComputer",
      "applyWitchpointArrival",
    ]);
  });

  it("completeLaunch on a docked state still hands the ship over (the direct test callers keep working)", () => {
    const state = initFlightState(layout);
    expect(state.mode).toBe("docked");
    completeLaunch(state);
    expect(state.mode).toBe("inFlight");
  });
});
