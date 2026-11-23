// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's death path (DEATH-01, D-01, D-04, D-10, D-11).
 *
 * One lethal ledger record kills a player in flight on that tick through
 * `killPlayer`; the tick posts one `playerDestroyed` naming the cause and the
 * culprit; the world then freezes. The fixtures are the few helpers of
 * `npc-fire.test.ts` (a Viper's beam against a player parked far from
 * everything, with the forward shield and the bank set by hand).
 */

import { describe, expect, it } from "vitest";

import { npcLaserRay } from "../../../src/sim/combat/aim.js";
import type { NpcWeapon } from "../../../src/sim/combat/aim.js";
import { killPlayer } from "../../../src/sim/combat/death.js";
import {
  DEFAULT_LASER_MOUNTS,
  NO_LASER,
} from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { ShotRequest } from "../../../src/sim/combat/step.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { NO_ENTITY, PLAYER_ID } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
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

/** The Viper's forward weapon as `ships-npc.json` carries it. */
const VIPER_BEAM: NpcWeapon = {
  laser: "EQ_WEAPON_BEAM_LASER",
  offset: vec(0, -0.15000000596046448, 35.034400939941406),
};

function options(): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: new Map<string, NpcWeapon>([["viper", VIPER_BEAM]]),
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
      maxEnergy: 180,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

/** `distance` metres ahead of the player's nose. */
function aheadOf(distance: number): Vec3 {
  return vec(FAR.x, FAR.y, FAR.z - distance);
}

/** A Viper 1,500 m ahead, nose toward the player. */
function viperAhead(world: World, distance = 1500): number {
  return spawnShip(world, "viper", aheadOf(distance), FACING_PLUS_Z);
}

function shotOf(world: World, id: number): ShotRequest {
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error(`no entity ${String(id)}`);
  const ray = npcLaserRay(entity, VIPER_BEAM);
  if (ray === null || VIPER_BEAM.laser === NO_LASER) {
    throw new Error("the weapon has no ray");
  }
  return { shooter: id, ray, laser: VIPER_BEAM.laser };
}

function resolve(
  player: FlightState,
  world: World,
  combat: PlayerCombatState,
  shots: readonly ShotRequest[],
): SimEvent[] {
  return resolveShots(
    world,
    true,
    player,
    combat,
    shots,
    options(),
    DT,
    layout,
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

/** A player with no forward shield and 3 energy: one beam hit (6) kills it. */
function frailCombat(): PlayerCombatState {
  const combat = createPlayerCombatState();
  combat.fwdShield = 0;
  combat.energy = 3;
  return combat;
}

describe("a lethal laser hit kills the player in flight (DEATH-01, D-04)", () => {
  it("sets the dead mode, empties the bank and posts one playerDestroyed with a copy of the position and the cause", () => {
    const player = flyingPlayer();
    const combat = frailCombat();
    const world = createWorld(7);
    const viper = viperAhead(world);

    const events = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(player.mode).toBe("dead");
    expect(combat.energy).toBe(0);
    const died = ofKind(events, "playerDestroyed");
    expect(died).toHaveLength(1);
    expect(died[0]?.position).toEqual(player.position);
    expect(died[0]?.position).not.toBe(player.position);
    expect(died[0]?.cause).toEqual({ damage: "laser", culprit: "viper" });
    // The culprit is a key, never an entity id.
    expect(JSON.stringify(died[0]?.cause)).not.toContain(String(viper));
  });

  it("does not kill a player whose forward shield takes the whole hit", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.energy = 3;
    const world = createWorld(7);
    const viper = viperAhead(world);

    const events = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(player.mode).toBe("inFlight");
    expect(ofKind(events, "playerDestroyed")).toEqual([]);
    expect(combat.energy).toBe(3);
  });

  it("emits no playerDestroyed on a tick with no lethal player record", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);

    const events = resolve(player, world, combat, []);

    expect(player.mode).toBe("inFlight");
    expect(ofKind(events, "playerDestroyed")).toEqual([]);
  });

  it("a second lethal record in the same call is skipped: one hit event, one death", () => {
    const player = flyingPlayer();
    const combat = frailCombat();
    const world = createWorld(7);
    const first = viperAhead(world, 1500);
    const second = viperAhead(world, 2500);

    const events = resolve(player, world, combat, [
      shotOf(world, first),
      shotOf(world, second),
    ]);

    expect(ofKind(events, "playerDestroyed")).toHaveLength(1);
    const playerHits = ofKind(events, "shipHit").filter(
      (event) => event.target === PLAYER_ID,
    );
    expect(playerHits).toHaveLength(1);
    expect(player.mode).toBe("dead");
  });

  it("posts playerDestroyed after every shipDestroyed and before any aiFaulted, entityRemoved or ident event", () => {
    const player = flyingPlayer();
    const combat = frailCombat();
    const world = createWorld(7);
    const killer = viperAhead(world, 1500);
    // A second Viper far behind the first fires along the same line: its beam
    // meets a third ship first, which dies of the hit on the same tick.
    const shooter = spawnShip(world, "viper", aheadOf(6000), FACING_PLUS_Z);
    const doomed = spawnShip(world, "viper", aheadOf(4000), FACING_PLUS_Z);
    const doomedEntity = world.store.get(doomed);
    if (doomedEntity === undefined) throw new Error("no doomed ship");
    doomedEntity.energy = 1;

    const events = resolve(player, world, combat, [
      shotOf(world, killer),
      shotOf(world, shooter),
    ]);

    const kinds = events.map((event) => event.kind);
    const diedAt = kinds.indexOf("playerDestroyed");
    expect(diedAt).toBeGreaterThanOrEqual(0);
    // Non-vacuity: a ship really died and was removed on the lethal tick.
    expect(kinds).toContain("shipDestroyed");
    expect(kinds).toContain("entityRemoved");
    for (const [index, kind] of kinds.entries()) {
      if (kind === "shipDestroyed") expect(index).toBeLessThan(diedAt);
      if (
        kind === "aiFaulted" ||
        kind === "entityRemoved" ||
        kind === "identLocked" ||
        kind === "identLost"
      ) {
        expect(index).toBeGreaterThan(diedAt);
      }
    }
  });
});

describe("killPlayer is a no-op unless the player is in flight (D-10)", () => {
  it("leaves a docked, a launching and an already dead state untouched", () => {
    for (const make of [
      (): FlightState => initFlightState(layout),
      (): FlightState => {
        const state = initFlightState(layout);
        stepFlight(
          state,
          layout,
          config,
          ZERO_INTENT,
          [{ kind: "launch" }],
          DT,
        );
        return state;
      },
      (): FlightState => {
        const state = flyingPlayer();
        killPlayer(state, createPlayerCombatState(), { damage: "laser" }, []);
        return state;
      },
    ]) {
      const state = make();
      const mode = state.mode;
      const combat = createPlayerCombatState();
      const before = hashWorld(state, undefined, combat);
      const events: SimEvent[] = [];
      killPlayer(state, combat, { damage: "scrape" }, events);
      expect(events).toEqual([]);
      expect(state.mode).toBe(mode);
      expect(hashWorld(state, undefined, combat)).toBe(before);
    }
  });

  it("clears the hyperspace attempt and the ident lock without a cancelled event", () => {
    const state = flyingPlayer();
    state.hyperspaceCountdown = 600;
    state.hyperspaceTarget = { id: "g0-s9", dist: 12, fuelCost: 12 };
    const combat = createPlayerCombatState();
    combat.identEngaged = true;
    combat.identTarget = 123;
    const events: SimEvent[] = [];

    killPlayer(state, combat, { damage: "scrape", culprit: "buoy" }, events);

    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();
    expect(combat.identEngaged).toBe(false);
    expect(combat.identTarget).toBe(NO_ENTITY);
    expect(events.map((event) => event.kind)).toEqual(["playerDestroyed"]);
  });
});

describe("the world is frozen once the player is dead (D-01)", () => {
  it("resolveShots on a dead state returns nothing and changes no hash or tick", () => {
    const player = flyingPlayer();
    const combat = frailCombat();
    const world = createWorld(7);
    const viper = viperAhead(world);
    resolve(player, world, combat, [shotOf(world, viper)]);
    expect(player.mode).toBe("dead");
    const flightHash = hashFlight(player);
    const worldHash = hashWorld(player, world, combat);
    const tick = player.tick;

    const events = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(events).toEqual([]);
    expect(hashFlight(player)).toBe(flightHash);
    expect(hashWorld(player, world, combat)).toBe(worldHash);
    expect(player.tick).toBe(tick);
  });

  it("stepSim returns [] for a dead state and moves no hash, tick or clock", () => {
    const player = flyingPlayer();
    const combat = frailCombat();
    const world = createWorld(7);
    const viper = viperAhead(world);
    resolve(player, world, combat, [shotOf(world, viper)]);
    expect(player.mode).toBe("dead");
    const flightHash = hashFlight(player);
    const worldHash = hashWorld(player, world, combat);
    const tick = player.tick;
    const clock = player.clockSeconds;

    for (let count = 0; count < 10; count += 1) {
      const events = stepSim(
        player,
        world,
        layout,
        config,
        ZERO_INTENT,
        [{ kind: "launch" }],
        DT,
        options(),
        combat,
      );
      expect(events).toEqual([]);
    }

    expect(hashFlight(player)).toBe(flightHash);
    expect(hashWorld(player, world, combat)).toBe(worldHash);
    expect(player.tick).toBe(tick);
    expect(player.clockSeconds).toBe(clock);
  });
});
