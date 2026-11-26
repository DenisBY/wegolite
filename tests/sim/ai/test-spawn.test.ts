// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `?test=1` shooter seam (plan 13-14, CBT-07, D-11).
 *
 * The numbers are derived by hand from the rules the plan cites: the Viper's
 * beam laser (damage 6), the Cobra's 128 shield, the NPC fire gate's beam period
 * of 13 ticks (D-07 revised, G-17-1: Oolite's literal frame count at 120 Hz;
 * D-08: the pilot asks every tick, the gate sets the rate),
 * and the shield refill of 2 points per second. The Viper
 * record and the hull table are the committed generated content, read the way
 * `tests/helpers/lave.ts` reads it.
 */

import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { TEST_PILOT } from "../../../src/sim/ai/pilots/test-pilot.js";
import {
  ANARCHY_RING_AHEAD_M,
  ANARCHY_RING_RADIUS_M,
  FLYER_SCRIPT_RANGES,
  spawnTestAnarchy,
  spawnTestAttacker,
  spawnTestFlyers,
  spawnTestShooter,
  TEST_ATTACKER_DISTANCE,
  TEST_FLYER_DISTANCE,
  TEST_SHOOTER_CARGO_KIND,
  TEST_SHOOTER_DISTANCE,
  TEST_SHOOTER_HOLD_RANGE,
} from "../../../src/sim/ai/test-spawn.js";
import type { NpcWeapon, NpcWeapons } from "../../../src/sim/combat/aim.js";
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
  scale,
  sub,
  vec,
} from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { CARGO_KINDS } from "../../../src/sim/world/entity.js";
import { MAX_ENTITIES, PLAYER_ID } from "../../../src/sim/world/ids.js";
import { isScanClass } from "../../../src/sim/world/populate.js";
import type { InertShipRecord } from "../../../src/sim/world/populate.js";
import { MAX_ENTITY_CARGO, MAX_UINT32 } from "../../../src/sim/world/limits.js";
import { createEntityStore } from "../../../src/sim/world/store.js";
import {
  hashWorld,
  serializeEntity,
} from "../../../src/sim/world/serialize.js";
import { snapshotWorld } from "../../../src/sim/world/snapshot.js";
import {
  createWorld,
  liveEntityCount,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import {
  FLEE_SCRIPT_RANGE_M,
  INTERCEPT_SCRIPT_RANGE_M,
  STATION_SCRIPT_RANGE_M,
} from "../../acceptance/thresholds.js";
import { flyerRecords } from "../../helpers/flyer-records.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();

/**
 * Bound on the tick of a freshly spawned shooter's first shot, counted from the
 * spawn. A new ship has lastShotTick 0 and the NPC gate skips the shot timer
 * for 0 (src/sim/npc/fire.ts), so the first shot comes on the first tick whose
 * range roll passes: this is a roll bound, and the beam period plays no part.
 */
const FIRST_SHOT_BOUND_TICKS = 13;

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

const NPC_JSON = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/ships-npc.json", import.meta.url),
    "utf8",
  ),
) as NpcJson[];

const VIPER_JSON = NPC_JSON.find((record) => record.key === "viper") as NpcJson;

/** Every committed catalogue record as the populator's input (29 today). */
const ALL_RECORDS: readonly InertShipRecord[] = NPC_JSON.map((record) => ({
  key: record.key,
  roles: record.roles,
  scanClass: record.scanClass,
  radius: record.radius,
  maxEnergy: record.maxEnergy,
  energyRechargeRate: record.energyRechargeRate,
}));

const VIPER: InertShipRecord = {
  key: VIPER_JSON.key,
  roles: VIPER_JSON.roles,
  scanClass: VIPER_JSON.scanClass,
  radius: VIPER_JSON.radius,
  maxEnergy: VIPER_JSON.maxEnergy,
  energyRechargeRate: VIPER_JSON.energyRechargeRate,
};

const [WX, WY, WZ] = VIPER_JSON.forwardWeaponPosition;
const WEAPONS = new Map<string, NpcWeapons>([
  [
    VIPER.key,
    { fore: { laser: VIPER_JSON.forwardWeapon, offset: vec(WX, WY, WZ) } },
  ],
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

/**
 * The step options of the attacker run: the shooter's plus the NPC flight
 * table the attack behaviours steer with.
 */
function attackOptions(): StepOptions {
  return { ...options(), npcFlight: realNpcFlightTable() };
}

/** How long the attacker run is stepped: 30 s at 120 Hz. */
const ATTACK_RUN_TICKS = 3_600;

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

  it("spawns with the given cargo capsule count (plan 16-06, D16-09)", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    expect(spawnTestShooter(world, player, VIPER, player.tick, 20)).toBe(true);
    expect(theShooter(world).cargo).toBe(20);
    expect(serializeEntity(theShooter(world))).toContain(";cargo:20");
    const edge = createWorld(7);
    expect(
      spawnTestShooter(edge, player, VIPER, player.tick, MAX_ENTITY_CARGO),
    ).toBe(true);
    expect(theShooter(edge).cargo).toBe(MAX_ENTITY_CARGO);
    // A ship with cargo hashes a `;cargo:` segment.
    expect(hashWorld(player, world)).not.toBe(
      hashWorld(player, createWorld(7)),
    );
  });

  it("names the plentiful cargo kind whenever it spawns with cargo (plan 21-14)", () => {
    expect(TEST_SHOOTER_CARGO_KIND).toBe(CARGO_KINDS.indexOf("plentiful"));
    expect(TEST_SHOOTER_CARGO_KIND).toBeGreaterThan(0);
    const player = flyingPlayer();
    for (const cargo of [1, 20, MAX_ENTITY_CARGO]) {
      const world = createWorld(7);
      expect(spawnTestShooter(world, player, VIPER, player.tick, cargo)).toBe(
        true,
      );
      expect(theShooter(world).cargoKind).toBe(TEST_SHOOTER_CARGO_KIND);
      expect(serializeEntity(theShooter(world))).toContain(
        `;ck:${TEST_SHOOTER_CARGO_KIND}`,
      );
    }
    // Without cargo, or with an explicit 0, no kind is stored.
    for (const cargo of [undefined, 0]) {
      const world = createWorld(7);
      expect(spawnTestShooter(world, player, VIPER, player.tick, cargo)).toBe(
        true,
      );
      expect(theShooter(world).cargoKind).toBe(0);
      expect(serializeEntity(theShooter(world))).not.toContain("ck:");
    }
  });

  it("without the argument spawns bit for bit as in Phase 15: cargo 0, no cargo segment", () => {
    const player = flyingPlayer();
    const plain = createWorld(7);
    const zero = createWorld(7);
    expect(spawnTestShooter(plain, player, VIPER, player.tick)).toBe(true);
    expect(spawnTestShooter(zero, player, VIPER, player.tick, 0)).toBe(true);
    expect(theShooter(plain).cargo).toBe(0);
    expect(serializeEntity(theShooter(plain))).not.toContain("cargo:");
    // An explicit 0 is the default, so both worlds are the same entity.
    expect(snapshotWorld(plain)).toEqual(snapshotWorld(zero));
    expect(hashWorld(player, plain)).toBe(hashWorld(player, zero));
    const withCargo = createWorld(7);
    spawnTestShooter(withCargo, player, VIPER, player.tick, 1);
    expect(hashWorld(player, plain)).not.toBe(hashWorld(player, withCargo));
  });

  it.each([
    -1,
    1.5,
    MAX_ENTITY_CARGO + 1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("refuses an out-of-domain cargo %s and touches nothing", (cargo) => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const nextId = world.store.nextId;
    expect(spawnTestShooter(world, player, VIPER, player.tick, cargo)).toBe(
      false,
    );
    expect(world.store.nextId).toBe(nextId);
    expect([...world.store.live]).toHaveLength(0);
  });

  it("drains the player's forward shield by 6 on its first shot, within 13 ticks of the spawn, and no other bank", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnTestShooter(world, player, VIPER, player.tick);

    // D-08: the shot is the gate's, so it comes on the first tick whose range
    // roll passes (FIRST_SHOT_BOUND_TICKS); the shield refill of 2 a second is
    // at most 0.22 points over 13 ticks, below the 6 of the hit.
    let hitTick = -1;
    for (let i = 1; i <= FIRST_SHOT_BOUND_TICKS && hitTick < 0; i += 1) {
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
      if (combat.fwdShield < 128) hitTick = i;
    }

    expect(hitTick).toBeGreaterThan(0);
    expect(combat.fwdShield).toBeCloseTo(128 - BEAM_DAMAGE, 9);
    expect(combat.aftShield).toBe(128);
    expect(combat.energy).toBe(256);
  });

  it("asks on every tick and fires at the gate's rate, so 360 ticks take the forward shield well below its start", () => {
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

    // D-08, D-09: 360 ticks hold at most 28 beam shots of 13 ticks (the first
    // within 13 ticks of the spawn: floor(359 / 13) + 1 = 28) of 6 against a refill of 2 points a second,
    // so the shield is gone and the overflow reaches the energy banks. The rate is
    // the gate's, not the pilot's think interval.
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

// ---------------------------------------------------------------------------
// spawnTestAttacker (plan 17-10, D-02)
// ---------------------------------------------------------------------------

/** The attacker's AI params, exactly (D-02): the opt-in is `fire: true`. */
const ATTACKER_PARAMS = {
  script: "attack",
  phase: "start",
  targetId: PLAYER_ID,
  range: 0,
  speed: 0,
  frustrated: 0,
  fire: true,
};

/** The beam period of the NPC fire gate, in ticks (D-07). */
const NPC_BEAM_PERIOD_TICKS = 13;

describe("spawnTestAttacker", () => {
  it("puts one Viper 3,000 m along the player's nose, facing the player, at rest", () => {
    const player = flyingPlayer();
    const world = createWorld(7);

    expect(spawnTestAttacker(world, player, VIPER, player.tick)).toBe(true);

    const attacker = theShooter(world);
    expect(attacker.specKey).toBe("viper");
    expect(attacker.kind).toBe("ship");
    expect(TEST_ATTACKER_DISTANCE).toBe(3_000);
    expect(attacker.position.x).toBeCloseTo(FAR.x, 9);
    expect(attacker.position.y).toBeCloseTo(0, 9);
    expect(attacker.position.z).toBeCloseTo(FAR.z - TEST_ATTACKER_DISTANCE, 9);
    const nose = rotate(attacker.orientation, vec(0, 0, -1));
    expect(nose.z).toBeCloseTo(1, 9);
    expect(attacker.energy).toBe(VIPER.maxEnergy);
    expect(attacker.speed).toBe(0);
    expect(attacker.radius).toBe(VIPER.radius);
  });

  it("faces the player whatever the player's own orientation is", () => {
    const player = flyingPlayer();
    player.orientation = normalize(axisAngle(1, 2, 3, 1.1));
    const world = createWorld(7);

    expect(spawnTestAttacker(world, player, VIPER, player.tick)).toBe(true);

    const attacker = theShooter(world);
    const offset = sub(attacker.position, player.position);
    expect(length(offset)).toBeCloseTo(TEST_ATTACKER_DISTANCE, 6);
    const playerNose = rotate(player.orientation, vec(0, 0, -1));
    expect(dot(offset, playerNose) / length(offset)).toBeCloseTo(1, 9);
    const attackerNose = rotate(attacker.orientation, vec(0, 0, -1));
    expect(dot(attackerNose, playerNose)).toBeCloseTo(-1, 9);
  });

  it("carries a flight-script attack AI at the player with exactly the fire opt-in, scan-free", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    spawnTestAttacker(world, player, VIPER, player.tick + 5);

    const ai = theShooter(world).ai;
    expect(ai?.aiKey).toBe("flight-script");
    expect(ai?.params).toEqual(ATTACKER_PARAMS);
    expect(ai?.nextThinkTick).toBe(player.tick + 5);
  });

  it("refuses a record whose scan class is not in the vocabulary and touches nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const nextId = world.store.nextId;

    expect(
      spawnTestAttacker(
        world,
        player,
        { ...VIPER, scanClass: "CLASS_NOPE" },
        player.tick,
      ),
    ).toBe(false);
    expect(world.store.nextId).toBe(nextId);
    expect([...world.store.live]).toHaveLength(0);
  });

  it("refuses a spawn the world's domain rules refuse", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const nextId = world.store.nextId;

    expect(
      spawnTestAttacker(
        world,
        player,
        { ...VIPER, maxEnergy: Number.NaN },
        player.tick,
      ),
    ).toBe(false);
    expect(world.store.nextId).toBe(nextId);
  });

  it("attacks the player: it enters an ATTACK behaviour, fires only on gate-allowed ticks and drains the shields then the energy", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnTestAttacker(world, player, VIPER, player.tick);
    const attacker = theShooter(world);

    const behaviours = new Set<string>();
    const shotTicks: number[] = [];
    let shieldFell = false;
    let energyFell = false;
    for (let i = 0; i < ATTACK_RUN_TICKS; i += 1) {
      const events = stepSim(
        player,
        world,
        layout,
        config,
        ZERO_INTENT,
        [],
        DT,
        attackOptions(),
        combat,
      );
      behaviours.add(attacker.nav.behaviour);
      for (const event of events) {
        if (event.kind === "laserFired" && event.shooter === attacker.id) {
          shotTicks.push(player.tick);
        }
      }
      if (combat.fwdShield < 128 || combat.aftShield < 128) shieldFell = true;
      if (combat.energy < 256) energyFell = true;
    }

    expect([...behaviours].some((name) => name.startsWith("ATTACK_"))).toBe(
      true,
    );
    expect(shotTicks.length).toBeGreaterThan(1);
    // The gate's beam period: never two shots closer than 13 ticks.
    for (let i = 1; i < shotTicks.length; i += 1) {
      expect(
        (shotTicks[i] as number) - (shotTicks[i - 1] as number),
      ).toBeGreaterThanOrEqual(NPC_BEAM_PERIOD_TICKS);
    }
    expect(shieldFell).toBe(true);
    expect(energyFell).toBe(true);
  });

  it("leaves a world that snapshots", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    spawnTestAttacker(world, player, VIPER, player.tick);

    expect(() => snapshotWorld(world)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// spawnTestFlyers (plan 14-16)
// ---------------------------------------------------------------------------

const FLIGHT = realNpcFlightTable();
const STATION_AT = vec(2_000_000, 500_000, -300_000);
const COS_30 = Math.cos(Math.PI / 6);
const SIN_30 = Math.sin(Math.PI / 6);

function maxSpeedOf(key: string): number {
  const row = FLIGHT.find((candidate) => candidate.specKey === key);
  if (row === undefined) throw new Error(`no flight row ${key}`);
  return row.maxFlightSpeed;
}

/** A spawned world whose three flyers are the last three live entities. */
function flyersWorld(player: FlightState): World {
  const world = createWorld(7);
  expect(
    spawnTestFlyers(
      world,
      player,
      flyerRecords(),
      FLIGHT,
      player.tick,
      STATION_AT,
    ),
  ).toBe(true);
  return world;
}

function fillWorld(world: World, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const result = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "filler",
        scanClass: "CLASS_NEUTRAL",
        position: vec(1e8 + i, 0, 0),
        orientation: identity(),
        radius: 10,
        speed: 0,
      },
      0,
    );
    if (!result.ok) throw new Error(`filler refused: ${result.reason}`);
  }
}

describe("spawnTestFlyers", () => {
  it("spawns the Shuttle, the Viper and the Adder with their scripts, targets, ranges and maximum speeds", () => {
    const player = flyingPlayer();
    const world = flyersWorld(player);

    const [station, intercept, flee] = [...world.store.live];
    expect(world.store.live).toHaveLength(3);
    expect(station?.specKey).toBe("shuttle");
    expect(intercept?.specKey).toBe("viper");
    expect(flee?.specKey).toBe("adder");
    expect(station?.ai?.aiKey).toBe("flight-script");
    expect(station?.ai?.params).toEqual({
      script: "station",
      phase: "start",
      targetId: 0,
      range: 3_500,
      speed: 80,
      frustrated: 0,
    });
    expect(intercept?.ai?.params).toEqual({
      script: "intercept",
      phase: "start",
      targetId: PLAYER_ID,
      range: 1_500,
      speed: 320,
      frustrated: 0,
    });
    expect(flee?.ai?.params).toEqual({
      script: "flee",
      phase: "start",
      targetId: PLAYER_ID,
      range: 25_600,
      speed: 240,
      frustrated: 0,
    });
    for (const entity of [station, intercept, flee]) {
      expect(entity?.ai?.nextThinkTick).toBe(player.tick);
      expect(entity?.speed).toBe(maxSpeedOf(entity?.specKey ?? ""));
      expect(entity?.kind).toBe("ship");
    }
    expect(station?.speed).toBe(80);
    expect(intercept?.speed).toBe(320);
    expect(flee?.speed).toBe(240);
  });

  it("places them 3,000 m from the player: 90 degrees left, 30 degrees left and 30 degrees right of the nose", () => {
    const player = flyingPlayer();
    player.orientation = normalize(axisAngle(1, 2, 3, 1.1));
    const world = flyersWorld(player);
    const nose = rotate(player.orientation, vec(0, 0, -1));
    const left = rotate(player.orientation, vec(-1, 0, 0));

    const [station, intercept, flee] = [...world.store.live];
    const offsetOf = (entity: typeof station) =>
      sub((entity as NonNullable<typeof entity>).position, player.position);
    for (const entity of [station, intercept, flee]) {
      expect(length(offsetOf(entity))).toBeCloseTo(TEST_FLYER_DISTANCE, 6);
    }
    // The station flyer: along the player's left, square to the nose.
    expect(dot(offsetOf(station), nose)).toBeCloseTo(0, 6);
    expect(dot(offsetOf(station), left) / TEST_FLYER_DISTANCE).toBeCloseTo(
      1,
      9,
    );
    // The interceptor: 30 degrees left of the nose.
    expect(dot(offsetOf(intercept), nose) / TEST_FLYER_DISTANCE).toBeCloseTo(
      COS_30,
      9,
    );
    expect(dot(offsetOf(intercept), left) / TEST_FLYER_DISTANCE).toBeCloseTo(
      SIN_30,
      9,
    );
    // The fleer: 30 degrees right of the nose.
    expect(dot(offsetOf(flee), nose) / TEST_FLYER_DISTANCE).toBeCloseTo(
      COS_30,
      9,
    );
    expect(dot(offsetOf(flee), left) / TEST_FLYER_DISTANCE).toBeCloseTo(
      -SIN_30,
      9,
    );
  });

  it("points the station flyer's nose at the station centre and the other two along the player's nose", () => {
    for (const orientation of [
      identity(),
      normalize(axisAngle(0, 1, 0, 2.2)),
      normalize(axisAngle(1, 2, 3, 1.1)),
    ]) {
      const player = flyingPlayer();
      player.orientation = orientation;
      const world = flyersWorld(player);
      const [station, intercept, flee] = [...world.store.live];

      const own = station as NonNullable<typeof station>;
      const toStation = sub(STATION_AT, own.position);
      const stationNose = rotate(own.orientation, vec(0, 0, -1));
      const cosine = dot(stationNose, toStation) / length(toStation);
      expect(Math.abs(cosine - 1)).toBeLessThan(1e-9);
      const q = own.orientation;
      expect(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z).toBeCloseTo(1, 12);

      for (const entity of [intercept, flee]) {
        expect(entity?.orientation).toEqual(orientation);
      }
    }
  });

  it("gives the fleer an approach aspect to a nose-first player of cos 30 degrees, below performFlee's 0.9995", () => {
    const player = flyingPlayer();
    const world = flyersWorld(player);
    const flee = [...world.store.live][2] as NonNullable<
      ReturnType<typeof theShooter>
    >;
    const nose = rotate(player.orientation, vec(0, 0, -1));
    const fromPlayer = sub(flee.position, player.position);
    const aspect = dot(fromPlayer, nose) / length(fromPlayer);
    expect(aspect).toBeCloseTo(COS_30, 9);
    expect(aspect).toBeLessThan(0.9995);
  });

  it("returns false and spawns nothing for a bad scan class, whichever record carries it", () => {
    for (const which of ["station", "intercept", "flee"] as const) {
      const player = flyingPlayer();
      const world = createWorld(7);
      const nextId = world.store.nextId;
      const records = flyerRecords();
      const bad = { ...records[which], scanClass: "CLASS_NOPE" };

      expect(
        spawnTestFlyers(
          world,
          player,
          { ...records, [which]: bad },
          FLIGHT,
          player.tick,
          STATION_AT,
        ),
      ).toBe(false);
      expect(world.store.nextId).toBe(nextId);
      expect([...world.store.live]).toHaveLength(0);
    }
  });

  it("returns false and spawns nothing in a world without room for three more ships, and true with exactly three", () => {
    const player = flyingPlayer();
    for (const free of [0, 1, 2]) {
      const world = createWorld(7);
      fillWorld(world, MAX_ENTITIES - free);
      const nextId = world.store.nextId;
      expect(
        spawnTestFlyers(
          world,
          player,
          flyerRecords(),
          FLIGHT,
          player.tick,
          STATION_AT,
        ),
      ).toBe(false);
      expect(world.store.nextId).toBe(nextId);
      expect(liveEntityCount(world)).toBe(MAX_ENTITIES - free);
    }
    const exact = createWorld(7);
    fillWorld(exact, MAX_ENTITIES - 3);
    expect(
      spawnTestFlyers(
        exact,
        player,
        flyerRecords(),
        FLIGHT,
        player.tick,
        STATION_AT,
      ),
    ).toBe(true);
    expect(liveEntityCount(exact)).toBe(MAX_ENTITIES);
  });

  it("leaves the earlier ships in the world when a later spawn is refused (the tainted case), and returns false", () => {
    // The pre-validation checks the scan classes and the free capacity only. A
    // record whose energy is outside the serialised domain passes it and is
    // refused by `spawnEntity` after the station flyer spawned: a case the
    // pre-validation does not foresee.
    const player = flyingPlayer();
    const world = createWorld(7);
    const records = flyerRecords();

    expect(
      spawnTestFlyers(
        world,
        player,
        {
          ...records,
          intercept: { ...records.intercept, maxEnergy: Number.NaN },
        },
        FLIGHT,
        player.tick,
        STATION_AT,
      ),
    ).toBe(false);
    expect(liveEntityCount(world)).toBe(1);
  });

  it("falls back to Oolite's default speed when no flight table is given", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    expect(
      spawnTestFlyers(
        world,
        player,
        flyerRecords(),
        undefined,
        player.tick,
        STATION_AT,
      ),
    ).toBe(true);
    const speeds = [...world.store.live].map((entity) => entity.speed);
    expect(new Set(speeds).size).toBe(1);
    expect(speeds[0]).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// spawnTestAnarchy (plan 21-16, QUAL-09 staged)
// ---------------------------------------------------------------------------

describe("spawnTestAnarchy", () => {
  it("pins the ring constants and the 29-record catalogue the spike draws", () => {
    expect(ANARCHY_RING_RADIUS_M).toBe(1_200);
    expect(ANARCHY_RING_AHEAD_M).toBe(2_500);
    expect(ALL_RECORDS).toHaveLength(29);
    expect(new Set(ALL_RECORDS.map((record) => record.key)).size).toBe(29);
  });

  it("spawns one inert ship of every record, in catalogue order, with its radius and energy", () => {
    const player = flyingPlayer();
    const world = createWorld(7);

    expect(spawnTestAnarchy(world, player, ALL_RECORDS, player.tick)).toBe(
      true,
    );

    const ships = [...world.store.live];
    expect(ships.map((ship) => ship.specKey)).toEqual(
      ALL_RECORDS.map((record) => record.key),
    );
    ships.forEach((ship, index) => {
      const record = ALL_RECORDS[index] as InertShipRecord;
      expect(ship.kind, record.key).toBe("ship");
      expect(ship.scanClass, record.key).toBe(record.scanClass);
      expect(ship.radius, record.key).toBe(record.radius);
      expect(ship.maxEnergy, record.key).toBe(record.maxEnergy);
      expect(ship.energy, record.key).toBe(record.maxEnergy);
      expect(ship.speed, record.key).toBe(0);
      // Inert: no AI, so no fire decision and no attacking AI on an aft hull.
      expect(ship.ai, record.key).toBeNull();
      expect(ship.orientation, record.key).toEqual(player.orientation);
    });
  });

  it("puts the ships on a ring square to the player's nose, centred ahead of it, evenly spaced", () => {
    const player = flyingPlayer();
    player.orientation = normalize(axisAngle(1, 2, 3, 1.1));
    const world = createWorld(7);
    spawnTestAnarchy(world, player, ALL_RECORDS, player.tick);
    const nose = rotate(player.orientation, vec(0, 0, -1));
    const centre = add(player.position, scale(nose, ANARCHY_RING_AHEAD_M));

    const ships = [...world.store.live];
    for (const ship of ships) {
      const offset = sub(ship.position, centre);
      expect(dot(offset, nose), ship.specKey).toBeCloseTo(0, 6);
      expect(length(offset), ship.specKey).toBeCloseTo(
        ANARCHY_RING_RADIUS_M,
        6,
      );
    }
    // Neighbours are the same chord apart: 2 R sin(pi / n).
    const chord = 2 * ANARCHY_RING_RADIUS_M * Math.sin(Math.PI / ships.length);
    for (let i = 0; i < ships.length; i += 1) {
      const next = ships[(i + 1) % ships.length] as (typeof ships)[number];
      const here = ships[i] as (typeof ships)[number];
      expect(length(sub(next.position, here.position))).toBeCloseTo(chord, 6);
    }
    // The nose axis is free: the shooter and the player's lasers use it.
    expect(chord).toBeGreaterThan(2 * 86.4);
  });

  it("is deterministic: two spawns into equal worlds are the same world", () => {
    const player = flyingPlayer();
    const a = createWorld(7);
    const b = createWorld(7);
    spawnTestAnarchy(a, player, ALL_RECORDS, player.tick);
    spawnTestAnarchy(b, player, ALL_RECORDS, player.tick);
    expect(snapshotWorld(a)).toEqual(snapshotWorld(b));
    expect(hashWorld(player, a)).toBe(hashWorld(player, b));
  });

  it("leaves the cargo shooter's line free: the shooter and the anarchy coexist and the world snapshots", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    expect(spawnTestAnarchy(world, player, ALL_RECORDS, player.tick)).toBe(
      true,
    );
    expect(spawnTestShooter(world, player, VIPER, player.tick, 20)).toBe(true);
    expect(liveEntityCount(world)).toBe(30);
    expect(() => snapshotWorld(world)).not.toThrow();
    // No ring ship is within 1,000 m of the nose axis, the shooter's line.
    const nose = rotate(player.orientation, vec(0, 0, -1));
    for (const ship of [...world.store.live].slice(0, 29)) {
      const offset = sub(ship.position, player.position);
      const along = dot(offset, nose);
      const across = length(sub(offset, scale(nose, along)));
      expect(across, ship.specKey).toBeGreaterThan(1_000);
    }
  });

  it("returns false and changes nothing for an empty list and for a list of only refused records", () => {
    const player = flyingPlayer();
    const bad = ALL_RECORDS.map((record) => ({
      ...record,
      scanClass: "CLASS_NOPE",
    }));
    for (const records of [[], bad]) {
      const world = createWorld(7);
      const before = snapshotWorld(world);
      expect(spawnTestAnarchy(world, player, records, player.tick)).toBe(false);
      expect(snapshotWorld(world)).toEqual(before);
      expect(world.store.nextId).toBe(createWorld(7).store.nextId);
    }
  });

  it("returns false and changes nothing for a player pose that is not finite", () => {
    const world = createWorld(7);
    const before = snapshotWorld(world);
    const player = flyingPlayer();
    player.position = vec(Number.NaN, 0, 0);
    expect(spawnTestAnarchy(world, player, ALL_RECORDS, player.tick)).toBe(
      false,
    );
    expect(snapshotWorld(world)).toEqual(before);
  });

  it("skips a refused record without moving the others: every valid record keeps its slot", () => {
    const player = flyingPlayer();
    const full = createWorld(7);
    spawnTestAnarchy(full, player, ALL_RECORDS, player.tick);
    const refused = new Set([3, 11, 28]);
    const records = ALL_RECORDS.map((record, index) =>
      refused.has(index)
        ? { ...record, scanClass: "CLASS_NOPE" }
        : index === 5
          ? { ...record, maxEnergy: Number.NaN }
          : record,
    );
    refused.add(5);
    const partial = createWorld(7);

    expect(spawnTestAnarchy(partial, player, records, player.tick)).toBe(true);

    const fullShips = [...full.store.live];
    const kept = ALL_RECORDS.map((_, index) => index).filter(
      (index) => !refused.has(index),
    );
    const partialShips = [...partial.store.live];
    expect(partialShips).toHaveLength(kept.length);
    partialShips.forEach((ship, slot) => {
      const original = fullShips[kept[slot] as number];
      expect(ship.specKey).toBe(original?.specKey);
      expect(ship.position).toEqual(original?.position);
    });
  });

  it("spawns one ship per record for duplicate keys", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const records = [VIPER, VIPER, VIPER];
    expect(spawnTestAnarchy(world, player, records, player.tick)).toBe(true);
    expect([...world.store.live].map((ship) => ship.specKey)).toEqual([
      "viper",
      "viper",
      "viper",
    ]);
  });

  it("returns false and spawns nothing when the world lacks room for the whole roster, true with exactly enough", () => {
    const player = flyingPlayer();
    const count = ALL_RECORDS.length;
    for (const free of [0, 1, count - 1]) {
      const world = createWorld(7);
      fillWorld(world, MAX_ENTITIES - free);
      const before = snapshotWorld(world);
      expect(spawnTestAnarchy(world, player, ALL_RECORDS, player.tick)).toBe(
        false,
      );
      expect(snapshotWorld(world)).toEqual(before);
      expect(liveEntityCount(world)).toBe(MAX_ENTITIES - free);
    }
    const exact = createWorld(7);
    fillWorld(exact, MAX_ENTITIES - count);
    expect(spawnTestAnarchy(exact, player, ALL_RECORDS, player.tick)).toBe(
      true,
    );
    expect(liveEntityCount(exact)).toBe(MAX_ENTITIES);
  });

  it("returns false and spawns nothing when the id counter could not number every ship, true with exactly enough", () => {
    const player = flyingPlayer();
    const count = ALL_RECORDS.length;
    const short = {
      ...createWorld(7),
      store: createEntityStore({
        nextId: MAX_UINT32 - (count - 2),
        entities: [],
      }),
    };
    const before = snapshotWorld(short);
    expect(spawnTestAnarchy(short, player, ALL_RECORDS, player.tick)).toBe(
      false,
    );
    expect(snapshotWorld(short)).toEqual(before);
    const exact = {
      ...createWorld(7),
      store: createEntityStore({
        nextId: MAX_UINT32 - (count - 1),
        entities: [],
      }),
    };
    expect(spawnTestAnarchy(exact, player, ALL_RECORDS, player.tick)).toBe(
      true,
    );
    expect(liveEntityCount(exact)).toBe(count);
  });

  it("refuses a tick outside the domain and changes nothing", () => {
    const player = flyingPlayer();
    for (const tick of [-1, 1.5, Number.NaN, 2 ** 32]) {
      const world = createWorld(7);
      expect(spawnTestAnarchy(world, player, ALL_RECORDS, tick)).toBe(false);
      expect([...world.store.live]).toHaveLength(0);
    }
  });

  it("hands no aft-armed hull an AI: every anarchy ship is inert, the six aft hulls included", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    spawnTestAnarchy(world, player, ALL_RECORDS, player.tick);
    const aft = new Set([
      "anaconda",
      "anaconda-pirate",
      "boa",
      "boa-pirate",
      "boa-mk2",
      "boa-mk2-pirate",
    ]);
    const ships = [...world.store.live];
    expect(ships.filter((ship) => aft.has(ship.specKey))).toHaveLength(6);
    for (const ship of ships) expect(ship.ai, ship.specKey).toBeNull();
  });

  /** A finite pose, so only the record decides what is valid. */
  const anyPose = fc.record({
    x: fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
    y: fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
    z: fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
  });
  const anyNumber = fc.oneof(
    fc.double(),
    fc.constantFrom(
      0,
      -0,
      1,
      -1,
      30,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      1e300,
      -1e300,
    ),
  );
  /** A record the world accepts, so lists mix valid and refused records. */
  const goodRecord: fc.Arbitrary<InertShipRecord> = fc.record({
    key: fc.constantFrom("viper", "adder", "boa-mk2"),
    roles: fc.constant([] as readonly string[]),
    scanClass: fc.constantFrom("CLASS_NEUTRAL", "CLASS_POLICE"),
    radius: fc.double({ min: 1, max: 200, noNaN: true }),
    maxEnergy: fc.integer({ min: 1, max: 512 }),
    energyRechargeRate: fc.integer({ min: 0, max: 20 }),
  });
  const wildRecord: fc.Arbitrary<InertShipRecord> = fc.record({
    key: fc.oneof(
      fc.constantFrom("viper", "adder", "", "constructor", "boa-mk2"),
      fc.string(),
    ),
    roles: fc.constant([] as readonly string[]),
    scanClass: fc.oneof(
      fc.constantFrom(
        "CLASS_NEUTRAL",
        "CLASS_POLICE",
        "CLASS_NOPE",
        "",
        "constructor",
        "toString",
      ),
      fc.string(),
    ),
    radius: anyNumber,
    maxEnergy: anyNumber,
    energyRechargeRate: anyNumber,
  });
  const anyRecord: fc.Arbitrary<InertShipRecord> = fc.oneof(
    { weight: 2, arbitrary: goodRecord },
    { weight: 1, arbitrary: wildRecord },
  );

  /** The valid records by `spawnEntity`'s own rules: one fresh world per record. */
  function validKeys(records: readonly InertShipRecord[]): string[] {
    return records
      .filter(
        (record) =>
          spawnEntity(
            createWorld(0),
            {
              kind: "ship",
              specKey: record.key,
              scanClass: record.scanClass as "CLASS_NEUTRAL",
              position: vec(0, 0, 0),
              orientation: identity(),
              radius: record.radius,
              speed: 0,
              maxEnergy: record.maxEnergy,
              energyRechargeRate: record.energyRechargeRate,
            },
            0,
          ).ok && isScanClass(record.scanClass),
      )
      .map((record) => record.key);
  }

  it("is total and all or nothing over arbitrary record lists and near-full worlds (property)", () => {
    // Vacuity guards: the runs must reach both the spawn and the room refusal.
    let spawnedRuns = 0;
    let noRoomRuns = 0;
    fc.assert(
      fc.property(
        fc.array(anyRecord, { maxLength: 40 }),
        fc.oneof(
          fc.integer({ min: 0, max: 8 }),
          fc.integer({ min: 0, max: MAX_ENTITIES }),
        ),
        anyPose,
        (records, free, pose) => {
          const player = flyingPlayer();
          player.position = vec(pose.x, pose.y, pose.z);
          const world = createWorld(7);
          fillWorld(world, MAX_ENTITIES - free);
          const before = snapshotWorld(world);
          const liveBefore = liveEntityCount(world);
          const expected = validKeys(records);

          let result: boolean | undefined;
          expect(() => {
            result = spawnTestAnarchy(world, player, records, player.tick);
          }).not.toThrow();

          if (result === true) {
            spawnedRuns += 1;
            expect(expected.length).toBeGreaterThan(0);
            expect(expected.length).toBeLessThanOrEqual(free);
            expect(liveEntityCount(world)).toBe(liveBefore + expected.length);
            expect(
              [...world.store.live].slice(liveBefore).map((s) => s.specKey),
            ).toEqual(expected);
            expect(() => snapshotWorld(world)).not.toThrow();
          } else {
            // Nothing spawned: no valid record, or no room for all of them.
            expect(expected.length === 0 || expected.length > free).toBe(true);
            expect(snapshotWorld(world)).toEqual(before);
            if (expected.length > free) noRoomRuns += 1;
          }
        },
      ),
      { numRuns: 150 },
    );
    expect(spawnedRuns, "runs that spawned (vacuity guard)").toBeGreaterThan(0);
    expect(noRoomRuns, "runs refused for room (vacuity guard)").toBeGreaterThan(
      0,
    );
    // Each run fills a world to its cap and snapshots it twice; a loaded
    // machine needs more than the 5 s default (about 1.5 s alone).
  }, 60_000);

  it("is total and all or nothing for a pose that is not finite (property)", () => {
    const badNumber = fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    fc.assert(
      fc.property(
        fc.array(anyRecord, { maxLength: 10 }),
        badNumber,
        (records, bad) => {
          const player = flyingPlayer();
          player.position = vec(bad, 0, 0);
          const world = createWorld(7);
          const before = snapshotWorld(world);
          expect(spawnTestAnarchy(world, player, records, player.tick)).toBe(
            false,
          );
          expect(snapshotWorld(world)).toEqual(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("FLYER_SCRIPT_RANGES", () => {
  it("is frozen and equals the three ranges plan 14-07 committed, the station range revised in quick task 261117-k1l", () => {
    expect(Object.isFrozen(FLYER_SCRIPT_RANGES)).toBe(true);
    expect(FLYER_SCRIPT_RANGES).toEqual({
      station: 3_500,
      intercept: 1_500,
      flee: 25_600,
    });
    expect(FLYER_SCRIPT_RANGES.station).toBe(STATION_SCRIPT_RANGE_M);
    expect(FLYER_SCRIPT_RANGES.intercept).toBe(INTERCEPT_SCRIPT_RANGE_M);
    expect(FLYER_SCRIPT_RANGES.flee).toBe(FLEE_SCRIPT_RANGE_M);
  });
});
