// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `?test=1` shooter seam (plan 13-14, CBT-07, D-11).
 *
 * The numbers are derived by hand from the rules the plan cites: the Viper's
 * beam laser (damage 6), the Cobra's 128 shield, the test pilot's think
 * interval of 15 ticks, and the shield refill of 2 points per second. The Viper
 * record and the hull table are the committed generated content, read the way
 * `tests/helpers/lave.ts` reads it.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TEST_PILOT } from "../../../src/sim/ai/pilots/test-pilot.js";
import {
  spawnTestShooter,
  TEST_SHOOTER_DISTANCE,
  TEST_SHOOTER_HOLD_RANGE,
} from "../../../src/sim/ai/test-spawn.js";
import { THINK_INTERVAL_TICKS } from "../../../src/sim/ai/time.js";
import type { NpcWeapon } from "../../../src/sim/combat/aim.js";
import { LASER_STATS } from "../../../src/sim/combat/constants.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import {
  add,
  axisAngle,
  dot,
  identity,
  length,
  normalize,
  rotate,
  sub,
  vec,
} from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import type { InertShipRecord } from "../../../src/sim/world/populate.js";
import { snapshotWorld } from "../../../src/sim/world/snapshot.js";
import { createWorld } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

const BEAM_DAMAGE = LASER_STATS.EQ_WEAPON_BEAM_LASER.damage;

/** The committed NPC record fields the seam and the step read. */
interface NpcJson {
  readonly key: string;
  readonly roles: readonly string[];
  readonly scanClass: string;
  readonly radius: number;
  readonly maxEnergy: number;
  readonly energyRechargeRate: number;
  readonly forwardWeapon: NpcWeapon["laser"];
  readonly forwardWeaponPosition: readonly [number, number, number];
}

const VIPER_JSON = (
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as NpcJson[]
).find((record) => record.key === "viper") as NpcJson;

const VIPER: InertShipRecord = {
  key: VIPER_JSON.key,
  roles: VIPER_JSON.roles,
  scanClass: VIPER_JSON.scanClass,
  radius: VIPER_JSON.radius,
  maxEnergy: VIPER_JSON.maxEnergy,
  energyRechargeRate: VIPER_JSON.energyRechargeRate,
};

const [WX, WY, WZ] = VIPER_JSON.forwardWeaponPosition;
const WEAPONS = new Map<string, NpcWeapon>([
  [VIPER.key, { laser: VIPER_JSON.forwardWeapon, offset: vec(WX, WY, WZ) }],
]);

function options(): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: WEAPONS,
    },
  };
}

/** A player launched, skipped to flight and parked at `FAR`, facing -Z. */
function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = 0;
  return state;
}

/** The only dynamic entity of a world holding one spawned ship. */
function theShooter(world: World) {
  const live = [...world.store.live];
  expect(live).toHaveLength(1);
  return live[0] as NonNullable<(typeof live)[number]>;
}

describe("spawnTestShooter", () => {
  it("puts one Viper 1,500 m along the player's nose, facing the player", () => {
    const player = flyingPlayer();
    const world = createWorld(7);

    expect(spawnTestShooter(world, player, VIPER, player.tick)).toBe(true);

    const shooter = theShooter(world);
    expect(shooter.specKey).toBe("viper");
    expect(shooter.kind).toBe("ship");
    expect(shooter.position.x).toBeCloseTo(FAR.x, 9);
    expect(shooter.position.y).toBeCloseTo(0, 9);
    expect(shooter.position.z).toBeCloseTo(FAR.z - TEST_SHOOTER_DISTANCE, 9);
    // Its nose (local -Z) points back along the player's tail.
    const nose = rotate(shooter.orientation, vec(0, 0, -1));
    expect(nose.x).toBeCloseTo(0, 9);
    expect(nose.y).toBeCloseTo(0, 9);
    expect(nose.z).toBeCloseTo(1, 9);
    expect(shooter.energy).toBe(VIPER.maxEnergy);
    expect(shooter.speed).toBe(0);
  });

  it("faces the player whatever the player's own orientation is", () => {
    const player = flyingPlayer();
    player.orientation = normalize(axisAngle(1, 2, 3, 1.1));
    const world = createWorld(7);

    expect(spawnTestShooter(world, player, VIPER, player.tick)).toBe(true);

    const shooter = theShooter(world);
    const offset = sub(shooter.position, player.position);
    expect(length(offset)).toBeCloseTo(TEST_SHOOTER_DISTANCE, 6);
    // Ahead of the player: along its nose.
    const playerNose = rotate(player.orientation, vec(0, 0, -1));
    expect(dot(offset, playerNose) / length(offset)).toBeCloseTo(1, 9);
    // Facing the player: the shooter's nose is the player's tail.
    const shooterNose = rotate(shooter.orientation, vec(0, 0, -1));
    expect(dot(shooterNose, playerNose)).toBeCloseTo(-1, 9);
    // The spawn-time orientation is a unit quaternion (spawnEntity refuses less).
    const q = shooter.orientation;
    expect(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z).toBeCloseTo(1, 12);
  });

  it("holds the test pilot's fire mode with the player as its target, scan-free", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    spawnTestShooter(world, player, VIPER, player.tick);

    const ai = theShooter(world).ai;
    expect(ai?.aiKey).toBe("test-pilot");
    expect(ai?.params["fire"]).toBe(true);
    expect(ai?.params["phase"]).toBe("hold");
    expect(ai?.params["targetId"]).toBe(PLAYER_ID);
    expect(ai?.params["holdRange"]).toBe(TEST_SHOOTER_HOLD_RANGE);
    expect(ai?.nextThinkTick).toBe(player.tick);
    expect(typeof TEST_PILOT.think).toBe("function");
  });

  it("refuses a record whose scan class is not in the vocabulary and touches nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const nextId = world.store.nextId;

    const refused = spawnTestShooter(
      world,
      player,
      { ...VIPER, scanClass: "CLASS_NOPE" },
      player.tick,
    );

    expect(refused).toBe(false);
    expect(world.store.nextId).toBe(nextId);
    expect([...world.store.live]).toHaveLength(0);
  });

  it("refuses a spawn the world's domain rules refuse", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const nextId = world.store.nextId;

    expect(
      spawnTestShooter(
        world,
        player,
        { ...VIPER, maxEnergy: Number.NaN },
        player.tick,
      ),
    ).toBe(false);
    expect(world.store.nextId).toBe(nextId);
  });

  it("drains the player's forward shield by 6 on the first step and no other bank", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnTestShooter(world, player, VIPER, player.tick);

    stepSim(
      player,
      world,
      layout,
      config,
      ZERO_INTENT,
      [],
      DT,
      options(),
      combat,
    );

    expect(combat.fwdShield).toBe(128 - BEAM_DAMAGE);
    expect(combat.aftShield).toBe(128);
    expect(combat.energy).toBe(256);
  });

  it("keeps firing on every think, so 360 ticks take the forward shield well below its start", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnTestShooter(world, player, VIPER, player.tick);

    const lows: number[] = [];
    for (let i = 0; i < 360; i += 1) {
      stepSim(
        player,
        world,
        layout,
        config,
        ZERO_INTENT,
        [],
        DT,
        options(),
        combat,
      );
      lows.push(combat.fwdShield);
    }

    // 360 ticks hold 24 thinks of 15 ticks (the first at tick 0): 24 shots of 6
    // against a refill of 2 points per second, so the shield is gone and the
    // overflow reaches the energy banks.
    expect(THINK_INTERVAL_TICKS).toBe(15);
    expect(combat.fwdShield).toBeLessThan(128);
    expect(Math.min(...lows)).toBe(0);
    expect(combat.energy).toBeLessThan(256);
    expect(combat.aftShield).toBe(128);
  });

  it("leaves a world that snapshots and keeps the player's own pose untouched", () => {
    const player = flyingPlayer();
    const before = {
      position: player.position,
      orientation: player.orientation,
    };
    const world = createWorld(7);
    spawnTestShooter(world, player, VIPER, player.tick);

    expect(() => snapshotWorld(world)).not.toThrow();
    expect(player.position).toEqual(before.position);
    expect(player.orientation).toEqual(before.orientation);
    expect(add(player.position, vec(0, 0, 0))).toEqual(FAR);
  });
});
