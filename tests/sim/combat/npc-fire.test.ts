// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * An NPC firing through `ShipControl.fire` (CBT-07, CBT-06; Pitfall 19).
 *
 * The expected numbers are derived by hand from the rules the plan cites: the
 * Viper's beam laser (damage 6, `equipment.plist`), the Cobra's 128 shield, the
 * facing shield chosen by the side the attacker is on (`PlayerEntity.m:5635`),
 * the cabin heat factor 0.5 per point of energy damage (`ShipEntity.h:67`) and
 * the same two-stage hit rule and damage function the player's shots use. The
 * hull data is the committed `ships-hulls.json`.
 */

import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import type { NpcWeapon } from "../../../src/sim/combat/aim.js";
import { PLAYER_HULL_KEY } from "../../../src/sim/combat/aim.js";
import { LASER_STATS } from "../../../src/sim/combat/constants.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { entityHashes, hashWorld } from "../../../src/sim/world/serialize.js";
import { snapshotWorld } from "../../../src/sim/world/snapshot.js";
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

const BEAM_DAMAGE = LASER_STATS.EQ_WEAPON_BEAM_LASER.damage;

/** The Viper's forward weapon as `ships-npc.json` carries it. */
const VIPER_BEAM: NpcWeapon = {
  laser: "EQ_WEAPON_BEAM_LASER",
  offset: vec(0, -0.15000000596046448, 35.034400939941406),
};

/** The Adder's pulse laser and the Shuttle's empty mount. */
const WEAPONS = new Map<string, NpcWeapon>([
  ["viper", VIPER_BEAM],
  [
    "adder",
    {
      laser: "EQ_WEAPON_PULSE_LASER",
      offset: vec(0, -1.676900029182434, 28.8523006439209),
    },
  ],
  ["shuttle", { laser: "EQ_WEAPON_NONE", offset: vec(0, 0, 0) }],
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

/** Ask `id` to fire through its own control, as an AI module would. */
function fireFrom(world: World, id: number): void {
  createShipControl(world, id, 0).fire(id);
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
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error(`no entity ${id}`);
  return entity.energy;
}

describe("an NPC fires at the player through ShipControl (tracer, CBT-07)", () => {
  it("a Viper 1,500 m ahead facing the player drains the forward shield by 6", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    fireFrom(world, viper);

    const events = step(player, world, combat);

    const fired = ofKind(events, "laserFired");
    expect(fired).toHaveLength(1);
    expect(fired[0]?.shooter).toBe(viper);
    expect(fired[0]?.laserKind).toBe("beam");
    const hits = ofKind(events, "shipHit");
    expect(hits).toEqual([
      {
        kind: "shipHit",
        target: PLAYER_ID,
        source: viper,
        amount: BEAM_DAMAGE,
        shield: true,
      },
    ]);
    expect(combat.fwdShield).toBe(128 - 6);
    expect(combat.aftShield).toBe(128);
    expect(combat.energy).toBe(256);
    // The queue is empty again at the tick boundary.
    expect(world.fireQueue).toEqual([]);
  });

  it("the shot starts at the record's mount offset, not at the ship's centre", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    fireFrom(world, viper);
    const events = step(player, world, createPlayerCombatState());
    const fired = ofKind(events, "laserFired")[0];
    // Oolite z 35.0344 is local -35.0344 here; the half turn flips it to +Z.
    expect(fired?.from.x).toBeCloseTo(FAR.x, 6);
    expect(fired?.from.y).toBeCloseTo(-0.15000000596046448, 6);
    expect(fired?.from.z).toBeCloseTo(FAR.z - 1500 + 35.034400939941406, 6);
  });

  it("a hit from behind drains the aft shield", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    // Behind the player (+Z), nose toward it (-Z): identity orientation.
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z + 1500),
      identity(),
    );
    fireFrom(world, viper);

    const events = step(player, world, combat);

    expect(ofKind(events, "shipHit")[0]?.shield).toBe(true);
    expect(combat.aftShield).toBe(128 - 6);
    expect(combat.fwdShield).toBe(128);
  });

  it("with the shield down the overflow drains energy and heats the cabin", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.fwdShield = 0;
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    fireFrom(world, viper);

    const events = step(player, world, combat);

    // The player's own bookkeeping ran first: a shield at 0 may gain 2 / 120 of
    // a point this tick, so the hit takes the shield to 0 and the overflow is
    // 6 minus what the shield held.
    const hit = ofKind(events, "shipHit")[0];
    expect(hit?.shield).toBe(false);
    expect(combat.fwdShield).toBe(0);
    expect(combat.energy).toBeLessThan(256);
    expect(combat.energy).toBeGreaterThan(256 - BEAM_DAMAGE - 1e-9);
    expect(combat.cabinTemp).toBeGreaterThan(60);
    expect(combat.cabinTemp).toBeLessThanOrEqual(60 + BEAM_DAMAGE * 0.5);
  });

  it("a player behind the shooter, or off the beam, is not hit", () => {
    for (const [at, facing] of [
      // The shooter faces away from the player.
      [vec(FAR.x, FAR.y, FAR.z - 1500), identity()],
      // The shooter faces the player but 200 m to the side.
      [vec(FAR.x + 200, FAR.y, FAR.z - 1500), FACING_PLUS_Z],
    ] as const) {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const world = createWorld(7);
      const viper = spawnShip(world, "viper", at, facing);
      fireFrom(world, viper);

      const events = step(player, world, combat);

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
    fireFrom(world, viper);

    const events = step(player, world, combat);

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
    fireFrom(world, viper);

    const events = step(player, world, combat);

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

describe("who may fire", () => {
  it("a shooter whose spec key has no weapon entry, or an empty mount, fires nothing", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const at = vec(FAR.x, FAR.y, FAR.z - 1500);
    const unknown = spawnShip(world, "krait", at, FACING_PLUS_Z);
    const shuttle = spawnShip(world, "shuttle", at, FACING_PLUS_Z);
    fireFrom(world, unknown);
    fireFrom(world, shuttle);

    const events = step(player, world, combat);

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(world.fireQueue).toEqual([]);
  });

  it("with no npcWeapons option nothing fires, and the queue is still drained", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    fireFrom(world, viper);

    const events = step(player, world, createPlayerCombatState(), {
      combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: HULLS },
    });

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(world.fireQueue).toEqual([]);
  });

  it("drains the queue even when no combat state is passed, and the player is not hit", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    fireFrom(world, viper);

    const events = step(player, world, undefined);

    // The beam is drawn but the player is not a candidate without a combat state.
    expect(ofKind(events, "laserFired")).toHaveLength(1);
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(world.fireQueue).toEqual([]);
  });

  it("a shooter that died before the resolution fires nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    fireFrom(world, viper);
    const entity = world.store.get(viper);
    if (entity === undefined) throw new Error("no viper");
    entity.dead = true;

    const events = step(player, world, createPlayerCombatState());

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(world.fireQueue).toEqual([]);
  });

  it("the player is not a candidate while docked", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    fireFrom(world, viper);

    const events = step(player, world, combat);

    // A docked player does not step the world, so nothing fires at all.
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(combat.fwdShield).toBe(128);
    expect(world.fireQueue).toEqual([]);
  });
});

describe("resolution order", () => {
  it("resolves shooters in ascending id whatever order they asked in", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const first = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    const second = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 2500),
      FACING_PLUS_Z,
    );
    fireFrom(world, second);
    fireFrom(world, first);
    expect(world.fireQueue).toEqual([second, first]);

    const events = step(player, world, combat);

    expect(ofKind(events, "laserFired").map((e) => e.shooter)).toEqual([
      first,
      second,
    ]);
    // The nearer Viper stands in the farther one's beam, so the farther shot
    // hits it (energy 180 to 174) and never reaches the player.
    expect(ofKind(events, "shipHit").map((e) => e.target)).toEqual([
      PLAYER_ID,
      first,
    ]);
    expect(energyOf(world, first)).toBe(180 - 6);
    expect(combat.fwdShield).toBe(128 - 6);
  });

  it("two runs of the same scenario give identical events and hashes", () => {
    const run = (): { events: SimEvent[]; hash: string } => {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const world = createWorld(7);
      const viper = spawnShip(
        world,
        "viper",
        vec(FAR.x, FAR.y, FAR.z - 1500),
        FACING_PLUS_Z,
      );
      const events: SimEvent[] = [];
      for (let i = 0; i < 40; i += 1) {
        fireFrom(world, viper);
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
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
    );
    for (let i = 0; i < 5; i += 1) {
      fireFrom(world, viper);
      step(player, world, createPlayerCombatState());
      expect(world.fireQueue).toEqual([]);
    }
    expect(() => snapshotWorld(world)).not.toThrow();
  });
});

describe("a scripted test pilot is a working shooter (CBT-07)", () => {
  it("fires through its own think and hits the player by the shared rule", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const ai = createTestPilotAi(0, { fire: true, holdRange: 5000 });
    ai.params.phase = "hold";
    ai.params.targetId = PLAYER_ID;
    const viper = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 1500),
      FACING_PLUS_Z,
      { ai },
    );

    const events = step(player, world, combat);

    expect(ofKind(events, "laserFired").map((e) => e.shooter)).toEqual([viper]);
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
    expect(world.fireQueue).toEqual([]);
  });

  it("a pilot without the fire option never shoots", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const ai = createTestPilotAi(0, { holdRange: 5000 });
    ai.params.phase = "hold";
    ai.params.targetId = PLAYER_ID;
    spawnShip(world, "viper", vec(FAR.x, FAR.y, FAR.z - 1500), FACING_PLUS_Z, {
      ai,
    });

    const events = step(player, world, combat);

    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(combat.fwdShield).toBe(128);
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
    const entity = world.store.get(id);
    if (entity === undefined) throw new Error("no adder");
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
    const entity = world.store.get(adder);
    if (entity === undefined) throw new Error("no adder");
    entity.energy = 70;
    fireFrom(world, viper);

    step(player, world, createPlayerCombatState());

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
