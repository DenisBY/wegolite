// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The kill path's boundary invariants (FOUND-19, D-12, ROADMAP Phase 15 success
 * criterion 2).
 *
 * At every tick boundary the world holds no dead entity, no queued AI event and
 * no queued shot, and it snapshots: `snapshotWorld`, JSON, `parseWorldSnapshot`
 * and `restoreWorld` give a world that hashes and re-snapshots equal to the live
 * one (`boundaryHolds`). The directed cases are the three the roadmap names (a
 * kill on the tick a ship spawns, two ships that kill each other on one tick, a
 * repeated kill request); the properties below drive random fights through
 * `stepSim` and the totality of the new sim functions.
 *
 * Extension point (Phase 16 and later): a new kill or spawn source joins this
 * file as one more generator branch of the fight runner, and calls
 * `boundaryHolds` after every step. Phase 16's debris is spawned inside
 * `killShip`, after `stepWorld`'s sanitise pass and before the second commit; its
 * spawn goes into the "spawn now" branch (it is the only in-step spawn source).
 */

import { describe, expect, it } from "vitest";

import { createShipControl } from "../../../src/sim/world/control-impl.js";
import { killShip } from "../../../src/sim/world/kill.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { NO_ENTITY, PLAYER_ID } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();
const NPC_WEAPONS = realNpcWeapons();
const NPC_FLIGHT = realNpcFlightTable();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

/** Turned half a turn about up: the ship's nose points at +Z. */
const FACING_PLUS_Z: Quat = { w: 0, x: 0, y: 1, z: 0 };

const FIRE: ControlIntent = { ...ZERO_INTENT, fire: true };

/** The step options of every run: real hulls, real NPC weapons and flight table. */
function stepOptions(): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: NPC_WEAPONS,
    },
    npcFlight: NPC_FLIGHT,
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

/**
 * Spawn a ship between steps. `tick` is the tick number the next step runs, so
 * pass `player.tick + 1`: spawn and first step then share one tick number.
 */
function spawnShip(
  world: World,
  specKey: string,
  position: Vec3,
  orientation: Quat,
  tick: number,
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
      speed: 0,
      maxEnergy: 85,
      ...extra,
    },
    tick,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

/** One composed step with the fire key `fire` and the shared options. */
function stepOnce(
  player: FlightState,
  world: World,
  combat: PlayerCombatState,
  fire: boolean,
): SimEvent[] {
  return stepSim(
    player,
    world,
    layout,
    config,
    fire ? FIRE : ZERO_INTENT,
    [],
    DT,
    stepOptions(),
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

/** Queue a shot of `id` through its own control, as an AI module would (D-14). */
function fireFrom(world: World, id: number, tick: number): void {
  createShipControl(world, id, tick).fire(id);
}

/**
 * The tick-boundary invariant (FOUND-19, D-12): no dead entity in the live list,
 * an empty AI queue and an empty fire queue, and a snapshot that survives JSON,
 * `parseWorldSnapshot` and `restoreWorld` with an equal hash and an equal second
 * snapshot. Throws a message naming the first violation, so a property run
 * reports it as the counterexample.
 */
function boundaryHolds(
  player: FlightState,
  world: World,
  combat: PlayerCombatState | undefined,
): void {
  for (const entity of world.store.live) {
    if (entity.dead) throw new Error(`dead entity ${String(entity.id)} left`);
  }
  if (world.aiQueue.length !== 0) throw new Error("the AI queue is not empty");
  if (world.fireQueue.length !== 0)
    throw new Error("the fire queue is not empty");
  const text = JSON.stringify(snapshotWorld(world));
  const restored = restoreWorld(
    parseWorldSnapshot(JSON.parse(text) as unknown),
  );
  if (
    hashWorld(player, restored, combat) !== hashWorld(player, world, combat)
  ) {
    throw new Error("the restored world hashes differently");
  }
  if (JSON.stringify(snapshotWorld(restored)) !== text) {
    throw new Error("the restored world snapshots differently");
  }
}

describe("a kill on the tick a ship spawns (tracer, FOUND-19, D-12)", () => {
  it("destroys and removes a ship on the tick number it was spawned at", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    // The flight step advances `player.tick` before `stepWorld`, so spawning with
    // `player.tick + 1` makes spawn and kill share one tick number. Phase 15 has
    // no in-step spawn source (`ShipControl` cannot spawn), so this is the
    // strongest kill-on-spawn case reachable now; Phase 16 extends it with a
    // spawn inside the kill.
    const spawnTick = player.tick + 1;
    const adder = spawnShip(
      world,
      "adder",
      vec(FAR.x, FAR.y, FAR.z - 2000),
      identity(),
      spawnTick,
      { maxEnergy: 1 },
    );
    expect(world.store.get(adder)?.spawnTick).toBe(spawnTick);

    const events = stepOnce(player, world, combat, true);

    expect(player.tick).toBe(spawnTick);
    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]?.id).toBe(adder);
    expect(destroyed[0]?.killer).toBe(PLAYER_ID);
    const removed = ofKind(events, "entityRemoved");
    expect(removed).toEqual([{ kind: "entityRemoved", id: adder }]);
    expect(
      events.findIndex((event) => event.kind === "shipDestroyed"),
    ).toBeLessThan(events.findIndex((event) => event.kind === "entityRemoved"));
    expect(world.store.get(adder)).toBeUndefined();
    boundaryHolds(player, world, combat);

    // The killed id is never reissued.
    const next = spawnShip(
      world,
      "adder",
      vec(FAR.x + 500, FAR.y, FAR.z - 2000),
      identity(),
      player.tick + 1,
    );
    expect(next).toBeGreaterThan(adder);
  });
});

describe("two ships that kill each other on one tick (D-04)", () => {
  /**
   * Two one-energy Vipers nose to nose in the far region, 1,000 m apart, behind
   * the player's back so the player is nobody's target line. `lowFacesMinusZ`
   * decides which of the two takes the lower id (spawn order), the mirror case.
   */
  function duel(lowFacesMinusZ: boolean) {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const tick = player.tick + 1;
    const minus = (z: number): Vec3 => vec(FAR.x, FAR.y, FAR.z + z);
    const spawnMinus = () =>
      spawnShip(world, "viper", minus(-3000), identity(), tick, {
        maxEnergy: 1,
      });
    const spawnPlus = () =>
      spawnShip(world, "viper", minus(-4000), FACING_PLUS_Z, tick, {
        maxEnergy: 1,
      });
    const ids = lowFacesMinusZ
      ? { minus: spawnMinus(), plus: spawnPlus() }
      : { plus: spawnPlus(), minus: spawnMinus() };
    fireFrom(world, ids.minus, tick);
    fireFrom(world, ids.plus, tick);
    const events = stepOnce(player, world, combat, false);
    return { player, combat, world, ids, events };
  }

  it.each([true, false])(
    "credits the lower id to the other ship and the higher id to nobody (lowFacesMinusZ %s)",
    (lowFacesMinusZ) => {
      const { player, combat, world, ids, events } = duel(lowFacesMinusZ);
      const low = Math.min(ids.minus, ids.plus);
      const high = Math.max(ids.minus, ids.plus);

      const destroyed = ofKind(events, "shipDestroyed");
      expect(destroyed.map((event) => event.id)).toEqual([low, high]);
      // D-04: a killer dead at kill time is NO_ENTITY, never "each other".
      expect(destroyed.map((event) => event.killer)).toEqual([high, NO_ENTITY]);
      const removed = ofKind(events, "entityRemoved");
      expect(removed.map((event) => event.id)).toEqual([low, high]);
      expect(ofKind(events, "shipHit")).toHaveLength(2);
      const lastDestroyed = events
        .map((e) => e.kind)
        .lastIndexOf("shipDestroyed");
      const firstRemoved = events.findIndex(
        (event) => event.kind === "entityRemoved",
      );
      expect(lastDestroyed).toBeLessThan(firstRemoved);
      expect(world.store.live).toHaveLength(0);
      boundaryHolds(player, world, combat);
    },
  );
});

describe("a repeated kill request (FOUND-19)", () => {
  it("destroys an Adder hit by two lethal shots once, and refuses a later kill", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const tick = player.tick + 1;
    const adder = spawnShip(
      world,
      "adder",
      vec(FAR.x, FAR.y, FAR.z - 2000),
      identity(),
      tick,
      { maxEnergy: 1 },
    );
    // A test shooter behind the Adder, nose toward the player's side.
    const shooter = spawnShip(
      world,
      "viper",
      vec(FAR.x, FAR.y, FAR.z - 4000),
      FACING_PLUS_Z,
      tick,
    );
    fireFrom(world, shooter, tick);

    const events = stepOnce(player, world, combat, true);

    const hits = ofKind(events, "shipHit").filter(
      (event) => event.target === adder,
    );
    expect(hits.map((event) => event.source).sort((a, b) => a - b)).toEqual([
      PLAYER_ID,
      shooter,
    ]);
    expect(ofKind(events, "shipDestroyed")).toHaveLength(1);
    expect(ofKind(events, "shipDestroyed")[0]?.id).toBe(adder);
    expect(ofKind(events, "entityRemoved")).toEqual([
      { kind: "entityRemoved", id: adder },
    ]);
    boundaryHolds(player, world, combat);

    const before = hashWorld(player, world, combat);
    const later: SimEvent[] = [];
    expect(killShip(world, adder, PLAYER_ID, later)).toBe(false);
    expect(later).toEqual([]);
    expect(hashWorld(player, world, combat)).toBe(before);
  });

  it("answers a second killShip on a ship already marked dead with false and no event", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const victim = spawnShip(
      world,
      "adder",
      vec(FAR.x, FAR.y, FAR.z - 2000),
      identity(),
      player.tick + 1,
    );
    const events: SimEvent[] = [];
    expect(killShip(world, victim, PLAYER_ID, events)).toBe(true);
    const marked = hashWorld(player, world, combat);
    expect(killShip(world, victim, PLAYER_ID, events)).toBe(false);
    expect(ofKind(events, "shipDestroyed")).toHaveLength(1);
    expect(hashWorld(player, world, combat)).toBe(marked);
  });
});
