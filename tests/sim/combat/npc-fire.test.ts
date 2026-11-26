// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * An NPC firing through the fire gate (CBT-07, CBT-15, CBT-16; Pitfall 16, 19).
 *
 * Every NPC shot passes `npcFireGate` at the one drain site of `resolveShots`
 * (D-08). The expected numbers are derived by hand from the rules the plan cites:
 * the Viper's beam laser (damage 6, energy 0.5, shot heat 3.2, `equipment.plist`),
 * the Cobra's 128 shield, the facing shield chosen by the side the attacker is on
 * (`PlayerEntity.m:5635`), the cabin heat factor 0.5 per point of energy damage
 * (`ShipEntity.h:67`) and the same two-stage hit rule and damage function the
 * player's shots use. The gate's counts and temperatures come from hand loops over
 * the same inputs, never from a run. The hull data is the committed
 * `ships-hulls.json`.
 *
 * Two routes are used. The hit-rule cases hand `resolveShots` an explicit
 * `ShotRequest` (an inert ship can no longer fire through `ctl.fire`: its accuracy
 * is unresolved and it has no AI). The gate cases queue `ctl.fire` for a ship made
 * "steered" by hand (an AI component, a resolved accuracy, the player as its nav
 * target) and call `resolveShots` once per tick, which is the drain, the recharge
 * and the cooling without the world step; the tracer and the pilot cases run the
 * whole `stepSim`.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import { spawnTestShooter } from "../../../src/sim/ai/test-spawn.js";
import type { AiComponent, AiModule } from "../../../src/sim/ai/types.js";
import { npcLaserRay, PLAYER_HULL_KEY } from "../../../src/sim/combat/aim.js";
import type { NpcWeapon, NpcWeapons } from "../../../src/sim/combat/aim.js";
import {
  ENERGY_DAMAGE_TO_HEAT_FACTOR,
  LASER_STATS,
  PLAYER_HEAT_INSULATION,
} from "../../../src/sim/combat/constants.js";
import {
  DEFAULT_LASER_MOUNTS,
  NO_LASER,
} from "../../../src/sim/combat/mounts.js";
import {
  rechargeEnergyAndShields,
  routeDamage,
} from "../../../src/sim/combat/shields.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { ShotRequest } from "../../../src/sim/combat/step.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { axisAngle, identity, sub, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import {
  NPC_MAX_WEAPON_TEMP,
  NPC_WEAPON_CUTOUT_F32,
} from "../../../src/sim/npc/constants.js";
import { ACCURACY_UNRESOLVED } from "../../../src/sim/npc/state.js";
import { PLAYER_COLLISION_RADIUS_M } from "../../../src/sim/npc/stats.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import { NO_ENTITY, PLAYER_ID } from "../../../src/sim/world/ids.js";
import { MAX_WEAPON_TEMPERATURE } from "../../../src/sim/world/limits.js";
import { entityHashes, hashWorld } from "../../../src/sim/world/serialize.js";
import { snapshotWorld } from "../../../src/sim/world/snapshot.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

/** Turned half a turn about up: the ship's nose points at +Z. */
const FACING_PLUS_Z: Quat = { w: 0, x: 0, y: 1, z: 0 };

const BEAM = LASER_STATS.EQ_WEAPON_BEAM_LASER;
const BEAM_DAMAGE = BEAM.damage;

/**
 * The beam's period under D-07 as revised by the owner 2026-11-19 (G-17-1):
 * Oolite's literal frame count at 120 Hz, 13 (12 double additions of 1/120 sum
 * to 0.09999999999999999, below fround(0.1); 13 reach 0.10833333333333332).
 * The superseded round(0.1 s x 120) was 12.
 */
const BEAM_PERIOD = 13;

/**
 * Bound on the tick of a freshly spawned shooter's first shot, counted from the
 * spawn. A new ship has lastShotTick 0 and the NPC gate skips the shot timer
 * for 0 (src/sim/npc/fire.ts), so the first shot comes on the first tick whose
 * range roll passes: this is a roll bound, and the beam period plays no part.
 */
const FIRST_SHOT_BOUND_TICKS = 13;

/** The float32 cooling step of one stepped tick: fround(6 x dt). */
const COOL_STEP = Math.fround(6 * DT);

/** A resolved accuracy for the hand-steered shooters (the draw is -5 to 5). */
const ACCURACY = 2;

/** The Viper's forward weapon as `ships-npc.json` carries it. */
const VIPER_BEAM: NpcWeapon = {
  laser: "EQ_WEAPON_BEAM_LASER",
  offset: vec(0, -0.15000000596046448, 35.034400939941406),
};

/** The Adder's pulse laser and the Shuttle's empty mount. */
const WEAPONS = new Map<string, NpcWeapons>([
  ["viper", { fore: VIPER_BEAM }],
  [
    "adder",
    {
      fore: {
        laser: "EQ_WEAPON_PULSE_LASER",
        offset: vec(0, -1.676900029182434, 28.8523006439209),
      },
    },
  ],
  ["shuttle", { fore: { laser: "EQ_WEAPON_NONE", offset: vec(0, 0, 0) } }],
]);

/** The committed Viper record, as the hook's seam reads it. */
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

function options(): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: WEAPONS,
    },
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

function spawnShip(
  world: World,
  specKey: string,
  position: Vec3,
  orientation: Quat,
  extra: Partial<SpawnInit> = {},
): number {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation,
      radius: 30,
      maxEnergy: specKey === "adder" ? 85 : 180,
      ...extra,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function entityOf(world: World, id: number): Entity {
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error(`no entity ${id}`);
  return entity;
}

/**
 * A ship the gate may serve: an AI component (the drain refuses an AI-less
 * ship), a resolved accuracy and the player as its nav target. Nothing steps it
 * unless the test steps the world.
 */
function armed(
  world: World,
  specKey: string,
  position: Vec3,
  orientation: Quat,
  extra: Partial<SpawnInit> = {},
): number {
  const id = spawnShip(world, specKey, position, orientation, {
    ai: createTestPilotAi(0),
    ...extra,
  });
  const entity = entityOf(world, id);
  entity.steer.accuracy = ACCURACY;
  entity.nav.targetId = PLAYER_ID;
  return id;
}

/** Ask `id` to fire through its own control, as an AI module would. */
function fireFrom(world: World, id: number): void {
  createShipControl(world, id, 0).fire(id);
}

/** The explicit request of a shot `id` would take with `weapon` (no gate). */
function shotOf(
  world: World,
  id: number,
  weapon: NpcWeapon = VIPER_BEAM,
): ShotRequest {
  const ray = npcLaserRay(entityOf(world, id), weapon);
  if (ray === null || weapon.laser === NO_LASER) {
    throw new Error("the weapon has no ray");
  }
  return { shooter: id, ray, laser: weapon.laser };
}

/** The drain, recharge, cooling and resolution of one stepped tick. */
function resolve(
  player: FlightState,
  world: World,
  combat: PlayerCombatState | undefined,
  shots: readonly ShotRequest[] = [],
  stepOptions: StepOptions | undefined = options(),
  worldStepped = true,
  registry: AiRegistry = AI_REGISTRY,
): SimEvent[] {
  return resolveShots(
    world,
    worldStepped,
    player,
    combat,
    shots,
    stepOptions,
    DT,
    layout,
    registry,
  );
}

function step(
  player: FlightState,
  world: World,
  combat: PlayerCombatState | undefined,
  stepOptions: StepOptions | undefined = options(),
): SimEvent[] {
  return stepSim(
    player,
    world,
    layout,
    config,
    ZERO_INTENT,
    [],
    DT,
    stepOptions,
    combat,
  );
}

function ofKind<K extends SimEvent["kind"]>(
  events: readonly SimEvent[],
  kind: K,
): Extract<SimEvent, { kind: K }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: K }> => event.kind === kind,
  );
}

function energyOf(world: World, id: number): number {
  return entityOf(world, id).energy;
}

/** What a refusal must leave alone: the combat stream, energy and weapon record. */
function untouched(world: World, id: number): string {
  const entity = entityOf(world, id);
  return JSON.stringify([entity.rng.combat, entity.energy, entity.weapon]);
}

/** The first draw of a combat stream at state `seed`. */
function firstDraw(seed: number): number {
  return rngNext(createRngState(seed));
}

/** The stream state after one draw. */
function advance(seed: number): number {
  const stream = createRngState(seed);
  rngNext(stream);
  return stream.s;
}

/** The range the gate reads for a player straight ahead at `distance`. */
function rangeAt(distance: number): number {
  return distance - PLAYER_COLLISION_RADIUS_M - 30;
}

/** `distance` metres ahead of the player's nose, nose back at the player. */
function aheadOf(distance: number): Vec3 {
  return vec(FAR.x, FAR.y, FAR.z - distance);
}

describe("a hook-spawned shooter fires through the gate (tracer, CBT-15, D-09)", () => {
  it("fires within the first-shot roll bound, never closer than the beam's 13 ticks, and drains the shield then energy", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const spawnTick = player.tick;
    expect(
      spawnTestShooter(
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
        spawnTick,
      ),
    ).toBe(true);
    const shooter = [...world.store.live][0] as Entity;
    // HEAD's spawn sets only the param: the shooter holds no nav target yet.
    expect(shooter.nav.targetId).toBe(NO_ENTITY);

    // The model of the player's bank: the recharge of the tick, then the hits.
    const model = createPlayerCombatState();
    let energy = shooter.energy;
    let temperature = 0;
    let lastShot = 0;
    const shotTicks: number[] = [];
    let lowestShield = model.fwdShield;
    let hitCount = 0;

    for (let i = 0; i < 360; i += 1) {
      const events = step(player, world, combat);
      if (i === 0) expect(shooter.nav.targetId).toBe(PLAYER_ID);
      const fired = ofKind(events, "laserFired").filter(
        (event) => event.shooter === shooter.id,
      );
      expect(fired.length).toBeLessThanOrEqual(1);
      if (fired.length === 1) shotTicks.push(player.tick);

      // The player's side: recharge first, then each hit by the shared rule.
      rechargeEnergyAndShields(model, DT);
      for (const hit of ofKind(events, "shipHit")) {
        expect(hit.target).toBe(PLAYER_ID);
        expect(hit.source).toBe(shooter.id);
        expect(hit.amount).toBe(BEAM_DAMAGE);
        routeDamage(
          model,
          hit.amount,
          sub(shooter.position, player.position),
          vec(0, 0, -1),
        );
        hitCount += 1;
      }
      expect(combat.fwdShield).toBeCloseTo(model.fwdShield, 9);
      expect(combat.energy).toBeCloseTo(model.energy, 9);
      expect(combat.aftShield).toBe(128);
      lowestShield = Math.min(lowestShield, combat.fwdShield);

      // The shooter's side: cost and heat only on a shot, then recharge, cooling.
      if (fired.length === 1) {
        energy -= BEAM.energy;
        temperature = Math.fround(temperature + Math.fround(3.2));
        lastShot = player.tick;
      }
      energy = Math.min(
        VIPER_JSON.maxEnergy,
        energy + VIPER_JSON.energyRechargeRate * DT,
      );
      if (temperature !== 0) {
        temperature = Math.max(Math.fround(temperature - COOL_STEP), 0);
      }
      expect(shooter.energy).toBeCloseTo(energy, 9);
      expect(shooter.weapon.temperature).toBe(temperature);
      expect(shooter.weapon.lastShotTick).toBe(lastShot);
    }

    // The first shot is within the roll bound of the spawn (the timer is
    // skipped for a ship that never fired); no two are closer than the period.
    expect(shotTicks.length).toBeGreaterThan(10);
    expect((shotTicks[0] as number) - spawnTick).toBeLessThanOrEqual(
      FIRST_SHOT_BOUND_TICKS,
    );
    for (let i = 1; i < shotTicks.length; i += 1) {
      expect(
        (shotTicks[i] as number) - (shotTicks[i - 1] as number),
      ).toBeGreaterThanOrEqual(BEAM_PERIOD);
    }
    // At about 9 shots a second (120 / 13) the 6-point hits empty the shield (2 points a second
    // refill) and the overflow reaches the energy bank.
    expect(hitCount).toBeGreaterThan(0);
    expect(lowestShield).toBe(0);
    expect(combat.energy).toBeLessThan(256);
    expect(shooter.nav.targetId).toBe(PLAYER_ID);
    expect(shooter.weapon.lastShotTick).toBe(shotTicks.at(-1));
    // T-17-12: the per-tick ask never drops an AI event.
    expect(world.aiDropped).toBe(0);
    expect(world.fireQueue).toEqual([]);
  });
});

describe("the gate takes one draw per request that passes the cheap checks", () => {
  it("draws only when heat, energy and the timer allow, and fires at the 13-tick period", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const id = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const shooter = entityOf(world, id);
    const seed = shooter.rng.combat;

    // The hand loop: the timer decides who draws; the roll decides who fires.
    const stream = createRngState(seed);
    const range = rangeAt(1500);
    const expectedShots: number[] = [];
    let draws = 0;
    let last = 0;
    for (let tick = player.tick + 1; tick <= player.tick + 60; tick += 1) {
      if (last === 0 || tick - last >= BEAM_PERIOD) {
        const u = rngNext(stream);
        draws += 1;
        if (range <= u * BEAM.range * (ACCURACY + 7.5)) {
          expectedShots.push(tick);
          last = tick;
        }
      }
    }

    const combat = createPlayerCombatState();
    const shotTicks: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      player.tick += 1;
      fireFrom(world, id);
      const events = resolve(player, world, combat);
      if (ofKind(events, "laserFired").length === 1)
        shotTicks.push(player.tick);
    }

    expect(shotTicks).toEqual(expectedShots);
    expect(draws).toBeGreaterThanOrEqual(5);
    expect(shooter.rng.combat).toBe(stream.s);
    // Every shot paid 0.5 energy and was heated by 3.2 (float32); none else did.
    // Every tick: the shot's cost first, then the record's recharge (capped).
    let energy = 180;
    for (let tick = player.tick - 59; tick <= player.tick; tick += 1) {
      if (expectedShots.includes(tick)) energy -= BEAM.energy;
      energy = Math.min(180, energy + shooter.energyRechargeRate * DT);
    }
    expect(shooter.energy).toBeCloseTo(energy, 9);
    expect(shooter.weapon.lastShotTick).toBe(expectedShots.at(-1));
    expect(shotTicks.length).toBeGreaterThanOrEqual(4);
  });

  it("a roll that fails refuses after its one draw and writes nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const id = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const shooter = entityOf(world, id);
    const seed = shooter.rng.combat;
    const u = firstDraw(seed);
    // A range just above what this draw can reach: range > u x 15000 x 9.5.
    const reach = u * BEAM.range * (ACCURACY + 7.5);
    shooter.position = vec(FAR.x, FAR.y, FAR.z - (reach * 1.5 + 200));
    const energyBefore = shooter.energy;
    player.tick += 1;
    fireFrom(world, id);

    const events = resolve(player, world, createPlayerCombatState());

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(shooter.rng.combat).toBe(advance(seed));
    expect(shooter.energy).toBe(energyBefore);
    expect(shooter.weapon).toEqual({
      temperature: 0,
      lastShotTick: 0,
      missedShots: 0,
      aftTemperature: 0,
      portTemperature: 0,
      starboardTemperature: 0,
    });
  });
});

describe("the heat cutout (ShipEntity.m:9935)", () => {
  it("refuses with no draw until the weapon cools below the cutout, then fires on the first allowed tick", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const id = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const shooter = entityOf(world, id);
    const seed = shooter.rng.combat;
    // The cutout is fround(0.85) x 256, about 217.6: start a little over it and
    // let the ship cool (about 8 ticks at 0.05 a tick).
    const start = Math.fround(218);
    shooter.weapon.temperature = start;

    // The hand loop: the gate reads the temperature the previous tick left.
    let temperature = start;
    let firstAllowed = -1;
    for (let i = 1; i <= 100; i += 1) {
      if (temperature / NPC_MAX_WEAPON_TEMP < NPC_WEAPON_CUTOUT_F32) {
        firstAllowed = i;
        break;
      }
      temperature = Math.max(Math.fround(temperature - COOL_STEP), 0);
    }
    expect(firstAllowed).toBeGreaterThan(1);

    const combat = createPlayerCombatState();
    let firedAt = -1;
    for (let i = 1; i <= firstAllowed; i += 1) {
      player.tick += 1;
      fireFrom(world, id);
      if (i < firstAllowed) {
        // No draw while the weapon is over the cutout.
        const events = resolve(player, world, combat);
        expect(ofKind(events, "laserFired")).toEqual([]);
        expect(shooter.rng.combat).toBe(seed);
      } else {
        const events = resolve(player, world, combat);
        if (ofKind(events, "laserFired").length === 1) firedAt = i;
      }
    }

    // The first allowed tick took its draw; the roll passes at 1,500 m for any
    // draw above range / (15000 x 9.5).
    expect(shooter.rng.combat).toBe(advance(seed));
    expect(firstDraw(seed)).toBeGreaterThan(rangeAt(1500) / (BEAM.range * 9.5));
    expect(firedAt).toBe(firstAllowed);
    expect(shooter.weapon.lastShotTick).toBe(player.tick);
  });
});

describe("weapon cooling (ShipEntity.m:2214-2218, D-07)", () => {
  it("a ship whose target is gone keeps cooling by fround(6/120) a tick to exactly 0, and is then never written", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const id = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const shooter = entityOf(world, id);
    shooter.nav.targetId = NO_ENTITY;
    shooter.weapon.temperature = Math.fround(0.12);
    const combat = createPlayerCombatState();

    let expected = Math.fround(0.12);
    for (let i = 0; i < 6; i += 1) {
      resolve(player, world, combat);
      expected = Math.max(Math.fround(expected - COOL_STEP), 0);
      expect(shooter.weapon.temperature).toBe(expected);
    }
    expect(shooter.weapon.temperature).toBe(0);
    expect(Object.is(shooter.weapon.temperature, -0)).toBe(false);
    // At 0 the record is never written: the same object, deeply equal.
    const record = shooter.weapon;
    resolve(player, world, combat);
    expect(shooter.weapon).toBe(record);
    expect(shooter.weapon).toEqual({
      temperature: 0,
      lastShotTick: 0,
      missedShots: 0,
      aftTemperature: 0,
      portTemperature: 0,
      starboardTemperature: 0,
    });
  });

  it("a world of inert ships ends every tick with every weapon record pristine", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const ids = [
      spawnShip(world, "viper", vec(FAR.x + 50_000, 0, 0), identity()),
      spawnShip(world, "adder", vec(FAR.x + 60_000, 0, 0), identity()),
    ];
    for (let i = 0; i < 10; i += 1) {
      step(player, world, createPlayerCombatState());
      for (const id of ids) {
        expect(entityOf(world, id).weapon).toEqual({
          temperature: 0,
          lastShotTick: 0,
          missedShots: 0,
          aftTemperature: 0,
          portTemperature: 0,
          starboardTemperature: 0,
        });
      }
    }
  });

  it("cools every live ship on a stepped tick with no shot, by max(fround(t - fround(6/120)), 0), and never a dead ship", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const temperatures = [
      0,
      0.01,
      COOL_STEP,
      100,
      217.6,
      256,
      MAX_WEAPON_TEMPERATURE,
    ];
    const ids = temperatures.map((temperature, index) => {
      const id = spawnShip(
        world,
        "viper",
        vec(FAR.x + 50_000, 1000 * (index + 1), 0),
        identity(),
      );
      entityOf(world, id).weapon.temperature = temperature;
      return id;
    });
    const dead = spawnShip(
      world,
      "viper",
      vec(FAR.x + 70_000, 0, 0),
      identity(),
    );
    const deadShip = entityOf(world, dead);
    deadShip.weapon.temperature = 50;
    deadShip.dead = true;
    const pristine = entityOf(world, ids[0] as number).weapon;

    // One stepped tick, no request and no shot: the empty-shot return of
    // `resolveShotHits` must not skip the cooling.
    const events = resolve(player, world, createPlayerCombatState());
    expect(ofKind(events, "laserFired")).toEqual([]);

    temperatures.forEach((temperature, index) => {
      const entity = entityOf(world, ids[index] as number);
      const expected = Math.max(Math.fround(temperature - COOL_STEP), 0);
      expect(entity.weapon.temperature).toBe(expected);
      expect(Number.isFinite(entity.weapon.temperature)).toBe(true);
      expect(entity.weapon.temperature).toBeGreaterThanOrEqual(0);
      expect(entity.weapon.temperature).toBeLessThanOrEqual(
        MAX_WEAPON_TEMPERATURE,
      );
    });
    // The ship at 0 kept its record: same object, deeply equal, no write.
    expect(entityOf(world, ids[0] as number).weapon).toBe(pristine);
    expect(pristine).toEqual({
      temperature: 0,
      lastShotTick: 0,
      missedShots: 0,
      aftTemperature: 0,
      portTemperature: 0,
      starboardTemperature: 0,
    });
    // The second commit removed it; its record is as it was.
    expect(deadShip.weapon.temperature).toBe(50);
  });
});

describe("missedShots moves at resolution (ShipEntity.m:10396, 10425, D-15)", () => {
  it("a hit subtracts 1 (floored at 0) and a miss adds 1", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const combat = createPlayerCombatState();
    const viper = spawnShip(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const shooter = entityOf(world, viper);
    shooter.weapon.missedShots = 2;

    resolve(player, world, combat, [shotOf(world, viper)]);
    expect(shooter.weapon.missedShots).toBe(1);
    resolve(player, world, combat, [shotOf(world, viper)]);
    expect(shooter.weapon.missedShots).toBe(0);
    // Never below 0.
    resolve(player, world, combat, [shotOf(world, viper)]);
    expect(shooter.weapon.missedShots).toBe(0);

    // A shot the player is not in: a miss adds 1, each time.
    shooter.position = vec(FAR.x + 200, FAR.y, FAR.z - 1500);
    resolve(player, world, combat, [shotOf(world, viper)]);
    expect(shooter.weapon.missedShots).toBe(1);
    resolve(player, world, combat, [shotOf(world, viper)]);
    expect(shooter.weapon.missedShots).toBe(2);
  });

  it("moves the shooter's counter only, never the player's or the target's", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x + 50_000, 0, 0),
      identity(),
    );
    const adder = spawnShip(
      world,
      "adder",
      vec(FAR.x + 50_000, 0, -1500),
      identity(),
    );
    resolve(player, world, createPlayerCombatState(), [shotOf(world, viper)]);
    expect(entityOf(world, viper).weapon.missedShots).toBe(0);
    expect(entityOf(world, adder).weapon.missedShots).toBe(0);
    entityOf(world, viper).orientation = FACING_PLUS_Z;
    resolve(player, world, createPlayerCombatState(), [shotOf(world, viper)]);
    expect(entityOf(world, viper).weapon.missedShots).toBe(1);
    expect(entityOf(world, adder).weapon.missedShots).toBe(0);
  });
});

describe("an NPC hit on the player, by the shared rule (CBT-16, D-16)", () => {
  it("a Viper 1,500 m ahead facing the player drains the forward shield by 6", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const viper = spawnShip(world, "viper", aheadOf(1500), FACING_PLUS_Z);

    const events = resolve(player, world, combat, [shotOf(world, viper)]);

    const fired = ofKind(events, "laserFired");
    expect(fired).toHaveLength(1);
    expect(fired[0]?.shooter).toBe(viper);
    expect(fired[0]?.laserKind).toBe("beam");
    // The shooter's hull key rides on the event; the app maps it to a colour
    // (quick 261119-i9g). The sim carries no colour.
    expect(fired[0]?.specKey).toBe("viper");
    expect(fired[0]).not.toHaveProperty("laserColor");
    expect(ofKind(events, "shipHit")).toEqual([
      {
        kind: "shipHit",
        target: PLAYER_ID,
        source: viper,
        amount: BEAM_DAMAGE,
        shield: true,
      },
    ]);
    expect(combat.fwdShield).toBe(128 - BEAM_DAMAGE);
    expect(combat.aftShield).toBe(128);
    expect(combat.energy).toBe(256);
    expect(world.fireQueue).toEqual([]);
  });

  it("the shot starts at the record's mount offset, not at the ship's centre", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = spawnShip(world, "viper", aheadOf(1500), FACING_PLUS_Z);

    const events = resolve(player, world, createPlayerCombatState(), [
      shotOf(world, viper),
    ]);

    const fired = ofKind(events, "laserFired")[0];
    // Oolite z 35.0344 is local -35.0344 here; the half turn flips it to +Z.
    expect(fired?.from.x).toBeCloseTo(FAR.x, 6);
    expect(fired?.from.y).toBeCloseTo(-0.15000000596046448, 6);
    expect(fired?.from.z).toBeCloseTo(FAR.z - 1500 + 35.034400939941406, 6);
  });

  it("a hit equal to the remaining forward shield leaves it at 0 and the energy untouched", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.fwdShield = BEAM_DAMAGE;
    const cabin = combat.cabinTemp;
    const world = createWorld(7);
    const viper = spawnShip(world, "viper", aheadOf(1500), FACING_PLUS_Z);

    const events = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(ofKind(events, "shipHit")[0]?.shield).toBe(true);
    expect(combat.fwdShield).toBe(0);
    expect(combat.energy).toBe(256);
    expect(combat.cabinTemp).toBe(cabin);
  });

  it("a larger hit spills the rest into energy, heats the cabin, floors the energy at 0 and kills the player", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.fwdShield = 2;
    const cabin = combat.cabinTemp;
    const world = createWorld(7);
    const viper = spawnShip(world, "viper", aheadOf(1500), FACING_PLUS_Z);

    const events = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(ofKind(events, "shipHit")[0]?.shield).toBe(false);
    expect(combat.fwdShield).toBe(0);
    expect(combat.energy).toBe(256 - (BEAM_DAMAGE - 2));
    expect(combat.cabinTemp).toBeCloseTo(
      cabin +
        ((BEAM_DAMAGE - 2) * ENERGY_DAMAGE_TO_HEAT_FACTOR) /
          PLAYER_HEAT_INSULATION,
      12,
    );

    // The floor and the death: 3 energy left, the whole 6 taken, the bank stops
    // at 0 and the player in flight dies on that tick (DEATH-01, D-04).
    combat.fwdShield = 0;
    combat.energy = 3;
    const lethal = resolve(player, world, combat, [shotOf(world, viper)]);
    expect(combat.energy).toBe(0);
    expect(player.mode).toBe("dead");
    expect(ofKind(lethal, "playerDestroyed")).toHaveLength(1);
    // A dead player takes no further hit: no event, and no shield, energy or
    // cabin value moves on the second shot (`PlayerEntity.m:5607`).
    const afterDeath = JSON.stringify(combat);
    const second = resolve(player, world, combat, [shotOf(world, viper)]);
    expect(second).toEqual([]);
    expect(JSON.stringify(combat)).toBe(afterDeath);
    expect(combat.energy).toBe(0);
    expect(Number.isFinite(combat.cabinTemp)).toBe(true);
  });

  it("an attacker exactly abeam drains the forward shield, one behind the aft", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    // Abeam: 1,500 m along +X, nose toward -X. d_forward is 0 and >= 0.
    const abeam = spawnShip(
      world,
      "viper",
      vec(FAR.x + 1500, FAR.y, FAR.z),
      axisAngle(0, 1, 0, Math.PI / 2),
    );
    const events = resolve(player, world, combat, [shotOf(world, abeam)]);
    expect(ofKind(events, "shipHit")).toHaveLength(1);
    expect(combat.fwdShield).toBe(128 - BEAM_DAMAGE);
    expect(combat.aftShield).toBe(128);

    // Behind the player (+Z), nose toward it (-Z): identity orientation.
    const behind = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z + 1500),
      identity(),
    );
    const eventsBehind = resolve(player, world, combat, [
      shotOf(world, behind),
    ]);
    expect(ofKind(eventsBehind, "shipHit")[0]?.shield).toBe(true);
    expect(combat.aftShield).toBe(128 - BEAM_DAMAGE);
    expect(combat.fwdShield).toBe(128 - BEAM_DAMAGE);
  });

  it("a player behind the shooter, or off the beam, is not hit", () => {
    for (const [at, facing] of [
      // The shooter faces away from the player.
      [aheadOf(1500), identity()],
      // The shooter faces the player but 200 m to the side.
      [vec(FAR.x + 200, FAR.y, FAR.z - 1500), FACING_PLUS_Z],
    ] as const) {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const world = createWorld(7);
      const viper = spawnShip(world, "viper", at, facing);

      const events = resolve(player, world, combat, [shotOf(world, viper)]);

      expect(ofKind(events, "laserFired")).toHaveLength(1);
      expect(ofKind(events, "shipHit")).toEqual([]);
      expect(combat.fwdShield).toBe(128);
      expect(combat.aftShield).toBe(128);
    }
  });

  it("a beam inside the Cobra's bounding sphere but over the hull misses", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    // 60 m above the centre: inside the 72.7 m sphere, above the hull.
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y + 60, FAR.z - 1500),
      FACING_PLUS_Z,
    );

    const events = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(combat.fwdShield).toBe(128);
  });

  it("the same Viper shot at another NPC drains its energy by the same 6", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    // Out in the +X direction, clear of the player; the Adder is dead ahead of
    // the Viper's nose (-Z).
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x + 50_000, 0, 0),
      identity(),
    );
    const adder = spawnShip(
      world,
      "adder",
      vec(FAR.x + 50_000, 0, -1500),
      identity(),
    );

    const events = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(ofKind(events, "shipHit")).toEqual([
      {
        kind: "shipHit",
        target: adder,
        source: viper,
        amount: BEAM_DAMAGE,
        shield: false,
      },
    ]);
    expect(energyOf(world, adder)).toBe(85 - 6);
    expect(energyOf(world, viper)).toBe(180);
    // The player was never a candidate for this beam.
    expect(combat.fwdShield).toBe(128);
  });
});

describe("who may fire (the drain's refusals, T-17-11, T-17-26)", () => {
  it("an inert ship queued through ctl.fire fires nothing: no AI, so no draw and no write", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = spawnShip(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    entityOf(world, viper).steer.accuracy = ACCURACY;
    entityOf(world, viper).nav.targetId = PLAYER_ID;
    const before = untouched(world, viper);
    fireFrom(world, viper);
    expect(world.fireQueue).toEqual([viper]);

    const events = resolve(player, world, createPlayerCombatState());

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(untouched(world, viper)).toBe(before);
    expect(world.fireQueue).toEqual([]);
  });

  it("a ship whose think threw is AI-less: it fires nothing that tick, takes no draw and the queue is empty", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const ship = entityOf(world, viper);
    // A pilot that asks to fire and then throws: fault containment nulls its AI
    // but leaves the steering state, and so the accuracy, resolved.
    const thrower: AiModule = {
      think(ctx) {
        ctx.ctl.fire(ctx.self);
        throw new Error("a faulted think");
      },
    };
    const registry: AiRegistry = { "test-pilot": thrower };
    ship.steer.accuracy = ACCURACY_UNRESOLVED;
    player.tick += 1;

    const stepped = stepWorld(world, player, layout, DT, registry);

    expect(stepped.some((event) => event.kind === "aiFaulted")).toBe(true);
    expect(ship.ai).toBeNull();
    expect(ship.steer.accuracy).not.toBe(ACCURACY_UNRESOLVED);
    expect(world.fireQueue).toEqual([viper]);
    const before = untouched(world, viper);

    const events = resolve(
      player,
      world,
      combat,
      [],
      options(),
      true,
      registry,
    );

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(untouched(world, viper)).toBe(before);
    expect(world.fireQueue).toEqual([]);
  });

  it("a steered ship whose nav target is its own id fires nothing, takes no draw and writes nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    entityOf(world, viper).nav.targetId = viper;
    const before = untouched(world, viper);
    fireFrom(world, viper);

    const events = resolve(player, world, createPlayerCombatState());

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(untouched(world, viper)).toBe(before);
    expect(world.fireQueue).toEqual([]);
  });

  it("a ship whose accuracy is still the unresolved sentinel is refused by the gate with no draw", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    entityOf(world, viper).steer.accuracy = ACCURACY_UNRESOLVED;
    const before = untouched(world, viper);
    fireFrom(world, viper);

    const events = resolve(player, world, createPlayerCombatState());

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(untouched(world, viper)).toBe(before);
  });

  it("an unarmed row takes its one draw and refuses, writing no cost, heat or timer", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const shuttle = armed(world, "shuttle", aheadOf(1500), FACING_PLUS_Z);
    const ship = entityOf(world, shuttle);
    const seed = ship.rng.combat;
    fireFrom(world, shuttle);

    const events = resolve(player, world, createPlayerCombatState());

    expect(ofKind(events, "laserFired")).toEqual([]);
    // Exactly one draw (the shuttle has no recharge here), nothing else written.
    expect(ship.rng.combat).toBe(advance(seed));
    expect(ship.energy).toBe(180);
    expect(ship.weapon).toEqual({
      temperature: 0,
      lastShotTick: 0,
      missedShots: 0,
      aftTemperature: 0,
      portTemperature: 0,
      starboardTemperature: 0,
    });
  });

  it("a spec key with no weapon row, or a row whose laser is not a mount key, fires nothing and draws nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const unknown = armed(world, "krait", aheadOf(1500), FACING_PLUS_Z);
    const bogus = armed(world, "bogus", aheadOf(1600), FACING_PLUS_Z);
    const before = [untouched(world, unknown), untouched(world, bogus)];
    fireFrom(world, unknown);
    fireFrom(world, bogus);
    // A malformed table: the laser is a string the type refuses, built past it.
    const table = new Map<string, NpcWeapons>(WEAPONS);
    table.set("bogus", {
      fore: {
        laser: "EQ_WEAPON_BOGUS" as unknown as NpcWeapon["laser"],
        offset: vec(0, 0, 0),
      },
    });

    const events = resolve(player, world, createPlayerCombatState(), [], {
      combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: HULLS, npcWeapons: table },
    });

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect([untouched(world, unknown), untouched(world, bogus)]).toEqual(
      before,
    );
    expect(world.fireQueue).toEqual([]);
  });

  it("a dead shooter and a non-ship fire nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const barrel = spawnShip(world, "barrel", aheadOf(1600), FACING_PLUS_Z, {
      kind: "cargo",
      scanClass: "CLASS_CARGO",
      ai: null,
    });
    const dead = entityOf(world, viper);
    const cargo = entityOf(world, barrel);
    cargo.ai = createTestPilotAi(0);
    cargo.nav.targetId = PLAYER_ID;
    cargo.steer.accuracy = ACCURACY;
    dead.dead = true;
    const snapshot = (entity: Entity): string =>
      JSON.stringify([entity.rng.combat, entity.energy, entity.weapon]);
    const before = [snapshot(dead), snapshot(cargo)];
    fireFrom(world, viper);
    fireFrom(world, barrel);
    // Both have a weapon row, so only the dead and kind checks refuse them.
    const table = new Map<string, NpcWeapons>(WEAPONS);
    table.set("barrel", { fore: VIPER_BEAM });

    const events = resolve(player, world, createPlayerCombatState(), [], {
      combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: HULLS, npcWeapons: table },
    });

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect([snapshot(dead), snapshot(cargo)]).toEqual(before);
    expect(world.fireQueue).toEqual([]);
  });

  it("with no npcWeapons option nothing fires, nothing is drawn, and the queue is still drained", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const before = untouched(world, viper);
    fireFrom(world, viper);

    const events = resolve(player, world, createPlayerCombatState(), [], {
      combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: HULLS },
    });

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(untouched(world, viper)).toBe(before);
    expect(world.fireQueue).toEqual([]);
  });

  it("a tick on which the world did not step fires nothing, draws nothing and drains the queue", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    entityOf(world, viper).weapon.temperature = 5;
    const before = untouched(world, viper);
    fireFrom(world, viper);

    const events = resolve(
      player,
      world,
      createPlayerCombatState(),
      [],
      options(),
      false,
    );

    expect(ofKind(events, "laserFired")).toEqual([]);
    // Not even the cooling: nothing in a world that did not step.
    expect(untouched(world, viper)).toBe(before);
    expect(world.fireQueue).toEqual([]);
  });

  it("drains the queue even when no combat state is passed, and the player is not hit", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    expect(firstDraw(entityOf(world, viper).rng.combat)).toBeGreaterThan(
      rangeAt(1500) / (BEAM.range * (ACCURACY + 7.5)),
    );
    fireFrom(world, viper);

    const events = resolve(player, world, undefined);

    // The beam is drawn but the player is not a candidate without a combat state.
    expect(ofKind(events, "laserFired")).toHaveLength(1);
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(world.fireQueue).toEqual([]);
  });

  it("the player is not a candidate while docked", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const before = untouched(world, viper);
    fireFrom(world, viper);

    const events = step(player, world, combat);

    // A docked player does not step the world, so nothing fires at all.
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(combat.fwdShield).toBe(128);
    expect(untouched(world, viper)).toBe(before);
    expect(world.fireQueue).toEqual([]);
  });
});

describe("resolution order", () => {
  it("resolves shooters in ascending id whatever order they asked in", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const first = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    const second = armed(world, "viper", aheadOf(2500), FACING_PLUS_Z);
    // Both draws must clear the roll at their own range, so both shots fire.
    for (const [id, distance] of [
      [first, 1500],
      [second, 2500],
    ] as const) {
      expect(firstDraw(entityOf(world, id).rng.combat)).toBeGreaterThan(
        rangeAt(distance) / (BEAM.range * (ACCURACY + 7.5)),
      );
    }
    fireFrom(world, second);
    fireFrom(world, first);
    expect(world.fireQueue).toEqual([second, first]);

    const events = resolve(player, world, combat);

    expect(ofKind(events, "laserFired").map((e) => e.shooter)).toEqual([
      first,
      second,
    ]);
    // The nearer Viper stands in the farther one's beam, so the farther shot
    // hits it (energy 180 to 174, less its own 0.5 shot cost) and never reaches
    // the player.
    expect(ofKind(events, "shipHit").map((e) => e.target)).toEqual([
      PLAYER_ID,
      first,
    ]);
    // Cost, then recharge (capped at the bank), then the hit.
    const rate = entityOf(world, second).energyRechargeRate;
    expect(energyOf(world, first)).toBeCloseTo(
      Math.min(180, 180 - 0.5 + rate * DT) - 6,
      12,
    );
    expect(energyOf(world, second)).toBeCloseTo(
      Math.min(180, 180 - 0.5 + rate * DT),
      12,
    );
    expect(combat.fwdShield).toBe(128 - 6);
  });

  it("two runs of the same scenario give identical events and hashes", () => {
    const run = (): { events: SimEvent[]; hash: string } => {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const world = createWorld(7);
      armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
      const events: SimEvent[] = [];
      for (let i = 0; i < 40; i += 1) {
        for (const entity of world.store.live) fireFrom(world, entity.id);
        events.push(...step(player, world, combat));
      }
      return { events, hash: hashWorld(player, world, combat) };
    };
    expect(run()).toEqual(run());
  });

  it("the player's hull key is the Cobra of the hull table", () => {
    expect(HULLS.has(PLAYER_HULL_KEY)).toBe(true);
  });
});

describe("the fire queue never reaches a snapshot or a hash", () => {
  it("is empty after every stepped tick", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = armed(world, "viper", aheadOf(1500), FACING_PLUS_Z);
    for (let i = 0; i < 5; i += 1) {
      fireFrom(world, viper);
      step(player, world, createPlayerCombatState());
      expect(world.fireQueue).toEqual([]);
    }
    expect(() => snapshotWorld(world)).not.toThrow();
  });
});

describe("a scripted test pilot is a gated shooter (CBT-07, D-09)", () => {
  function pilotShooter(world: World, fire: boolean): number {
    const ai: AiComponent = createTestPilotAi(0, { fire, holdRange: 5000 });
    ai.params.phase = "hold";
    ai.params.targetId = PLAYER_ID;
    return spawnShip(world, "viper", aheadOf(1500), FACING_PLUS_Z, { ai });
  }

  it("asks every tick, holds the player as its nav target after the first stepped tick, and its shots come out of the gate", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const viper = pilotShooter(world, true);
    const ship = entityOf(world, viper);
    expect(ship.nav.targetId).toBe(NO_ENTITY);
    const shots: number[] = [];

    for (let i = 0; i < 40; i += 1) {
      const events = step(player, world, combat);
      for (const fired of ofKind(events, "laserFired")) {
        expect(fired.shooter).toBe(viper);
        shots.push(player.tick);
      }
      expect(world.fireQueue).toEqual([]);
    }

    expect(ship.nav.targetId).toBe(PLAYER_ID);
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(shots.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < shots.length; i += 1) {
      expect(
        (shots[i] as number) - (shots[i - 1] as number),
      ).toBeGreaterThanOrEqual(BEAM_PERIOD);
    }
    expect(ship.weapon.lastShotTick).toBe(shots.at(-1));
    expect(combat.fwdShield).toBeLessThan(128);
    expect(world.aiDropped).toBe(0);
  });

  it("a pilot without the fire option never shoots", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const viper = pilotShooter(world, false);

    for (let i = 0; i < 20; i += 1) {
      const events = step(player, world, combat);
      expect(ofKind(events, "laserFired")).toEqual([]);
    }

    expect(combat.fwdShield).toBe(128);
    expect(entityOf(world, viper).weapon.lastShotTick).toBe(0);
  });
});

describe("NPC energy recharge (N1, ShipEntity.m:2414-2422)", () => {
  /** An Adder at 70 of 85 energy with the record's rate 2, far from everything. */
  function hurtAdder(world: World): number {
    const id = spawnShip(
      world,
      "adder",
      vec(FAR.x + 50_000, 0, 0),
      identity(),
      { energyRechargeRate: 2 },
    );
    const entity = entityOf(world, id);
    entity.energy = 70;
    return id;
  }

  it("is back to 85 after 7.5 simulated seconds and never exceeds it", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const adder = hurtAdder(world);

    for (let i = 0; i < 900; i += 1) step(player, world, combat);
    // 900 ticks of 2 / 120 is 15 points, up to float accumulation.
    expect(energyOf(world, adder)).toBeGreaterThan(85 - 1e-6);
    expect(energyOf(world, adder)).toBeLessThanOrEqual(85);

    for (let i = 0; i < 60; i += 1) {
      step(player, world, combat);
      expect(energyOf(world, adder)).toBeLessThanOrEqual(85);
    }
    expect(energyOf(world, adder)).toBe(85);
  });

  it("gains rate times dt on each stepped tick", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const adder = hurtAdder(world);
    step(player, world, createPlayerCombatState());
    expect(energyOf(world, adder)).toBeCloseTo(70 + 2 * DT, 12);
  });

  it("recharges before this tick's hit lands", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x + 50_000, 0, 0),
      identity(),
    );
    const adder = spawnShip(
      world,
      "adder",
      vec(FAR.x + 50_000, 0, -1500),
      identity(),
      { energyRechargeRate: 2 },
    );
    entityOf(world, adder).energy = 70;

    resolve(player, world, createPlayerCombatState(), [shotOf(world, viper)]);

    expect(energyOf(world, adder)).toBeCloseTo(70 + 2 * DT - BEAM_DAMAGE, 12);
  });

  it("does not recharge in a tick where the world was not stepped", () => {
    const docked = initFlightState(layout);
    const world = createWorld(7);
    const adder = hurtAdder(world);
    for (let i = 0; i < 10; i += 1) step(docked, world, undefined);
    expect(energyOf(world, adder)).toBe(70);
  });

  it("leaves a full bank exactly as it was", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const adder = spawnShip(
      world,
      "adder",
      vec(FAR.x + 50_000, 0, 0),
      identity(),
    );
    const before = JSON.stringify(entityHashes(world));
    for (let i = 0; i < 20; i += 1) step(player, world, undefined);
    expect(energyOf(world, adder)).toBe(85);
    expect(JSON.stringify(entityHashes(world))).toBe(before);
  });
});
