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

import {
  npcLaserRay,
  PLAYER_HULL_KEY,
  playerLaserRay,
} from "../../../src/sim/combat/aim.js";
import type { NpcWeapon, NpcWeapons } from "../../../src/sim/combat/aim.js";
import { resolveCollisions } from "../../../src/sim/combat/collide.js";
import {
  LASER_STATS,
  PLAYER_MASS_KG,
} from "../../../src/sim/combat/constants.js";
import { killPlayer } from "../../../src/sim/combat/death.js";
import type { HullTable } from "../../../src/sim/combat/hit.js";
import {
  DEFAULT_LASER_MOUNTS,
  NO_LASER,
} from "../../../src/sim/combat/mounts.js";
import { collideWithShip } from "../../../src/sim/combat/response.js";
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
import { add, identity, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { massFor } from "../../../src/sim/npc/stats.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import {
  NAV_BUOY_SUBENTITY_ID,
  NO_ENTITY,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
} from "../../helpers/dock-pose.js";
import { fullHullTable, realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

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
      npcWeapons: new Map<string, NpcWeapons>([
        ["viper", { fore: VIPER_BEAM }],
      ]),
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

// --- Edge ticks and the mutual kill (D-04, D-09, D-10) -----------------------

const FULL_HULLS = fullHullTable();
const NPC_WEAPONS = realNpcWeapons();
const NPC_FLIGHT = realNpcFlightTable();
const DEBRIS = debrisFixture();

/** Unturned: the ship's nose points at -Z, toward where the player faces from behind. */
const FACING_MINUS_Z: Quat = identity();

/** A ship of `specKey` at rest with `energy` (default: 250, the Krait's). */
function spawnKind(
  world: World,
  specKey: string,
  position: Vec3,
  orientation: Quat,
  energy = 250,
): number {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation,
      radius: FULL_HULLS.get(specKey)?.collisionRadius ?? 30,
      maxEnergy: energy,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function entityOf(world: World, id: number) {
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error(`no entity ${String(id)}`);
  return entity;
}

/** `distance` metres behind the player (+Z), where an unturned nose looks away. */
function behind(distance: number): Vec3 {
  return vec(FAR.x, FAR.y, FAR.z + distance);
}

/** The app's options for the cases below: real hulls, weapons and flight table. */
function sceneOptions(extra: {
  debris?: boolean;
  collisions?: boolean;
  hulls?: HullTable;
  hyperspace?: StepOptions["hyperspace"];
  dock?: StepOptions["dock"];
}): StepOptions {
  return {
    npcFlight: NPC_FLIGHT,
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: extra.hulls ?? FULL_HULLS,
      npcWeapons: NPC_WEAPONS,
      ...(extra.debris === true ? { debris: DEBRIS } : {}),
      ...(extra.collisions === true ? { collisions: true } : {}),
    },
    ...(extra.hyperspace === undefined ? {} : { hyperspace: extra.hyperspace }),
    ...(extra.dock === undefined ? {} : { dock: extra.dock }),
  };
}

/** The explicit request of the shot NPC `id` takes with its real weapon. */
function npcShot(world: World, id: number): ShotRequest {
  const entity = entityOf(world, id);
  const weapon = NPC_WEAPONS.get(entity.specKey)?.fore;
  if (weapon === undefined) throw new Error("no weapon");
  const ray = npcLaserRay(entity, weapon);
  if (ray === null || weapon.laser === NO_LASER) {
    throw new Error("the weapon has no ray");
  }
  return { shooter: id, ray, laser: weapon.laser };
}

/** The player's own pulse request from its pose, as `stepPlayerCombat` queues it. */
function playerShot(player: FlightState): ShotRequest {
  return {
    shooter: PLAYER_ID,
    ray: playerLaserRay(
      player.position,
      player.orientation,
      "fore",
      "EQ_WEAPON_PULSE_LASER",
    ),
    laser: "EQ_WEAPON_PULSE_LASER",
  };
}

/** Resolve exactly `shots` against a stepped world with `stepOptions`. */
function resolveWith(
  player: FlightState,
  world: World,
  combat: PlayerCombatState,
  shots: readonly ShotRequest[],
  stepOptions: StepOptions,
): SimEvent[] {
  return resolveShots(
    world,
    true,
    player,
    combat,
    shots,
    stepOptions,
    DT,
    layout,
  );
}

/** No shield on either side, so the bank takes every hit. */
function bareCombat(energy: number): PlayerCombatState {
  const combat = createPlayerCombatState();
  combat.fwdShield = 0;
  combat.aftShield = 0;
  combat.energy = energy;
  return combat;
}

function stepOnce(
  player: FlightState,
  world: World | undefined,
  combat: PlayerCombatState,
  stepOptions: StepOptions,
  commands: Parameters<typeof stepSim>[5] = [],
  intent = ZERO_INTENT,
): SimEvent[] {
  return stepSim(
    player,
    world,
    layout,
    config,
    intent,
    commands,
    DT,
    stepOptions,
    combat,
  );
}

/** The length of a velocity. */
function speedOf(velocity: Vec3): number {
  return Math.hypot(velocity.x, velocity.y, velocity.z);
}

/** The state a frozen dead world must not move. */
function frozenKey(
  player: FlightState,
  world: World,
  combat: PlayerCombatState,
): string {
  return [
    hashFlight(player),
    hashWorld(player, world, combat),
    String(player.tick),
    String(player.clockSeconds),
  ].join("|");
}

/** The player at `speed`, a Krait of `kraitEnergy` resting 200 m ahead of it. */
function ramScene(speed: number, bank: number, kraitEnergy: number) {
  const player = flyingPlayer();
  player.speed = speed;
  const combat = bareCombat(bank);
  const world = createWorld(7);
  const krait = spawnKind(
    world,
    "krait",
    aheadOf(200),
    identity(),
    kraitEnergy,
  );
  return { player, combat, world, krait };
}

/** Step until `playerDestroyed` (at most `limit` ticks); the lethal tick's events. */
function stepToDeath(
  player: FlightState,
  world: World,
  combat: PlayerCombatState,
  stepOptions: StepOptions,
  firstCommands: Parameters<typeof stepSim>[5] = [],
  limit = 400,
): { events: SimEvent[]; all: SimEvent[]; ticks: number } {
  const all: SimEvent[] = [];
  for (let tick = 0; tick < limit; tick += 1) {
    const events = stepOnce(
      player,
      world,
      combat,
      stepOptions,
      tick === 0 ? firstCommands : [],
    );
    all.push(...events);
    if (events.some((event) => event.kind === "playerDestroyed")) {
      return { events, all, ticks: tick + 1 };
    }
  }
  throw new Error("the player never died");
}

describe("the dock tick (D-10)", () => {
  it("a player that docks with a low bank is docked after the tick with the bank full and no playerDestroyed", () => {
    const geometry = laveDockGeometry();
    const stepOptions = sceneOptions({ collisions: true, dock: geometry });
    const player = flyingPlayer();
    const combat = bareCombat(1);
    const world = createWorld(7);
    const pose = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: 90,
      rollFromMatched: 0,
      stationAngle: player.stationAngle,
    });
    player.position = pose.position;
    player.orientation = pose.orientation;
    player.speed = 0;
    // The latch is armed, as it is once a departure is clear of the slot.
    player.dockArmed = true;
    // A Krait overlapping the player: any step of the world with the player in
    // flight would ram it at once (the bank is 1). The dock tick does not step
    // the world, so nothing lands on that tick.
    spawnKind(world, "krait", add(player.position, vec(0, 0, -20)), identity());
    player.speed = 20;

    let dockedOn = -1;
    const deaths: SimEvent[] = [];
    for (let tick = 0; tick < 10 && dockedOn < 0; tick += 1) {
      const events = stepOnce(player, world, combat, stepOptions);
      deaths.push(...ofKind(events, "playerDestroyed"));
      if (events.some((event) => event.kind === "docked")) dockedOn = tick;
    }

    // The very first tick docks, so no earlier tick could have rammed.
    expect(dockedOn).toBe(0);
    expect(player.mode).toBe("docked");
    expect(combat.energy).toBe(createPlayerCombatState().energy);
    expect(combat.fwdShield).toBe(createPlayerCombatState().fwdShield);
    expect(deaths).toEqual([]);
  });
});

describe("the hyperspaceJumped tick (D-10)", () => {
  const TARGET = { id: "g0-s9", x: 28, y: 60 };
  const hyperspace: StepOptions["hyperspace"] = {
    fuel: 70,
    origin: { id: "g0-s7", x: 20, y: 173 },
    target: TARGET,
  };

  /**
   * A player at bank 0 closing on a Krait that overlaps it, with the collision
   * stage on. The bank 0 of an in-flight player is a CONSTRUCTED state: after
   * this phase an in-flight player at bank 0 cannot arise naturally (a bank at
   * 0 is a death), so the fixture builds it to prove the jump tick takes no
   * damage.
   */
  function jumpScene(countdown: number) {
    const player = flyingPlayer();
    player.speed = 100;
    player.hyperspaceCountdown = countdown;
    player.hyperspaceTarget =
      countdown > 0 ? { id: TARGET.id, dist: 9, fuelCost: 36 } : null;
    const combat = bareCombat(0);
    const world = createWorld(7);
    spawnKind(world, "krait", add(player.position, vec(0, 0, -20)), identity());
    return { player, combat, world };
  }

  it("a player at bank 0 on the jump tick takes no damage and is in flight after it", () => {
    const { player, combat, world } = jumpScene(1);
    const events = stepOnce(
      player,
      world,
      combat,
      sceneOptions({ collisions: true, hyperspace }),
    );

    expect(events.map((event) => event.kind)).toContain("hyperspaceJumped");
    expect(ofKind(events, "shipHit")).toEqual([]);
    expect(ofKind(events, "playerDestroyed")).toEqual([]);
    expect(player.mode).toBe("inFlight");
    expect(combat.energy).toBe(0);
  });

  it("non-vacuity: the same scene without a jump on that tick kills the player", () => {
    const { player, combat, world } = jumpScene(0);
    const events = stepOnce(
      player,
      world,
      combat,
      sceneOptions({ collisions: true, hyperspace }),
    );

    expect(ofKind(events, "hyperspaceJumped")).toEqual([]);
    expect(ofKind(events, "shipHit").map((event) => event.target)).toContain(
      PLAYER_ID,
    );
    expect(player.mode).toBe("dead");
  });
});

describe("a launching player (D-10)", () => {
  /** A launching player parked at `FAR`, nose toward -Z. */
  function launchingPlayer(): FlightState {
    const state = initFlightState(layout);
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    expect(state.mode).toBe("launching");
    state.position = FAR;
    state.orientation = identity();
    return state;
  }

  it("a hit that floors the bank of a launching player emits no death; the first lethal record after launchComplete kills it", () => {
    const player = launchingPlayer();
    const combat = frailCombat();
    const world = createWorld(7);
    const viper = viperAhead(world);

    const during = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(ofKind(during, "shipHit").map((event) => event.target)).toEqual([
      PLAYER_ID,
    ]);
    expect(combat.energy).toBe(0);
    expect(ofKind(during, "playerDestroyed")).toEqual([]);
    expect(player.mode).toBe("launching");

    // The launch completes (the skip key cuts the cinematic short).
    const finish = stepFlight(
      player,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "skipLaunch" }],
      DT,
    );
    expect(finish.map((event) => event.kind)).toContain("launchComplete");
    expect(player.mode).toBe("inFlight");
    expect(combat.energy).toBe(0);

    const after = resolve(player, world, combat, [shotOf(world, viper)]);

    expect(ofKind(after, "playerDestroyed")).toHaveLength(1);
    expect(player.mode).toBe("dead");
  });
});

describe("the countdown and the ident lock die with the ship (D-10)", () => {
  const TARGET = { id: "g0-s9", x: 28, y: 60 };
  const hyperspace: StepOptions["hyperspace"] = {
    fuel: 70,
    origin: { id: "g0-s7", x: 20, y: 173 },
    target: TARGET,
  };

  /** A ram that kills the player: bank 10 at 350 m/s into a Krait that survives. */
  function lethalRam() {
    const scene = ramScene(350, 10, 5000);
    scene.player.hyperspaceCountdown = 1800;
    scene.player.hyperspaceTarget = { id: TARGET.id, dist: 9, fuelCost: 36 };
    return scene;
  }

  it("a death during a countdown clears the countdown and the target in the same tick, with no hyperspaceCountdownCancelled", () => {
    const { player, combat, world } = lethalRam();
    const stepOptions = sceneOptions({ collisions: true, hyperspace });

    const { events, all } = stepToDeath(player, world, combat, stepOptions);

    // Non-vacuity: the countdown ran until the lethal tick.
    expect(ofKind(events, "playerDestroyed")).toHaveLength(1);
    expect(player.mode).toBe("dead");
    expect(player.hyperspaceCountdown).toBe(0);
    expect(player.hyperspaceTarget).toBeNull();
    expect(all.map((event) => event.kind)).not.toContain(
      "hyperspaceCountdownCancelled",
    );
  });

  it("an ident lock held at death is cleared and no ident event follows playerDestroyed", () => {
    const { player, combat, world, krait } = lethalRam();
    const stepOptions = sceneOptions({ collisions: true, hyperspace });

    const { events, all } = stepToDeath(player, world, combat, stepOptions, [
      { kind: "ident" },
    ]);

    // Non-vacuity: the lock was taken on the Krait before the ram.
    expect(ofKind(all, "identLocked")).toEqual([
      { kind: "identLocked", specKey: "krait" },
    ]);
    expect(entityOf(world, krait).specKey).toBe("krait");
    expect(combat.identEngaged).toBe(false);
    expect(combat.identTarget).toBe(NO_ENTITY);
    const kinds = events.map((event) => event.kind);
    const diedAt = kinds.indexOf("playerDestroyed");
    expect(diedAt).toBeGreaterThanOrEqual(0);
    expect(
      kinds.slice(diedAt + 1).filter((kind) => kind.startsWith("ident")),
    ).toEqual([]);
  });

  it("pause, held keys, the ident key and repeated commands on the dead state change nothing", () => {
    const { player, combat, world } = lethalRam();
    const stepOptions = sceneOptions({ collisions: true, hyperspace });
    stepToDeath(player, world, combat, stepOptions, [{ kind: "ident" }]);
    const before = frozenKey(player, world, combat);

    const held = {
      ...ZERO_INTENT,
      fire: true,
      pitch: 1,
      roll: 1,
      accelerate: true,
    };
    for (let count = 0; count < 20; count += 1) {
      const events = stepOnce(
        player,
        world,
        combat,
        stepOptions,
        [
          { kind: "setPaused", paused: false },
          { kind: "ident" },
          { kind: "beginHyperspace" },
          { kind: "launch" },
          { kind: "dockingComputer" },
          { kind: "skipLaunch" },
        ],
        held,
      );
      expect(events).toEqual([]);
    }

    expect(player.mode).toBe("dead");
    expect(frozenKey(player, world, combat)).toBe(before);
    expect(combat.identEngaged).toBe(false);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });
});

describe("the mutual kill (D-09)", () => {
  /**
   * The player (bank 3, no shield) and a Krait of 1 energy facing each other
   * `distance` metres apart, each shot resolved on one tick. `bystanderFirst`
   * spawns a far Viper before the Krait, so every NPC id moves up by one and
   * the Krait's id changes: the outcome must not depend on it.
   */
  function mutualLasers(
    bystanderFirst: boolean,
    distance: number,
    withDebris: boolean,
    survives = false,
  ) {
    const player = flyingPlayer();
    const combat = survives ? createPlayerCombatState() : bareCombat(3);
    const world = createWorld(7);
    const bystander = (): number =>
      spawnKind(
        world,
        "viper",
        vec(FAR.x + 6000, FAR.y, FAR.z - 6000),
        FACING_PLUS_Z,
        180,
      );
    if (bystanderFirst) bystander();
    const krait = spawnKind(
      world,
      "krait",
      aheadOf(distance),
      FACING_PLUS_Z,
      250,
    );
    entityOf(world, krait).energy = 1;
    if (!bystanderFirst) bystander();
    const events = resolveWith(
      player,
      world,
      combat,
      [playerShot(player), npcShot(world, krait)],
      sceneOptions({ debris: withDebris }),
    );
    return { player, combat, world, krait, events };
  }

  it("a player and an NPC that kill each other with lasers both die: one shipDestroyed through the kill path, one playerDestroyed naming the NPC", () => {
    const { player, world, krait, events } = mutualLasers(false, 1500, true);

    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]?.id).toBe(krait);
    expect(world.store.get(krait)).toBeUndefined();
    // The ordinary kill path released the debris.
    expect(
      world.store.live.filter(
        (entity) => entity.kind === "cargo" || entity.kind === "wreckage",
      ).length,
    ).toBeGreaterThan(0);
    const died = ofKind(events, "playerDestroyed");
    expect(died).toHaveLength(1);
    // D-04: the culprit died on the same tick and is still named, because the
    // key is read before `killShip` runs.
    expect(died[0]?.cause).toEqual({ damage: "laser", culprit: "krait" });
    expect(player.mode).toBe("dead");
    const kinds = events.map((event) => event.kind);
    expect(kinds.indexOf("shipDestroyed")).toBeLessThan(
      kinds.indexOf("playerDestroyed"),
    );
  });

  it("swapping the spawn order, so the entity ids swap, gives the same kinds, culprit and death", () => {
    const first = mutualLasers(false, 1500, true);
    const second = mutualLasers(true, 1500, true);

    expect(second.krait).not.toBe(first.krait);
    expect(second.events.map((event) => event.kind)).toEqual(
      first.events.map((event) => event.kind),
    );
    expect(ofKind(second.events, "playerDestroyed")[0]?.cause).toEqual(
      ofKind(first.events, "playerDestroyed")[0]?.cause,
    );
    expect(second.player.mode).toBe("dead");
    expect(second.combat.energy).toBe(0);
  });

  describe("the blast push lands before the death", () => {
    /** The drift the dead player carries is the blast's push, not zero. */
    it("the dead player's drift after a close mutual kill equals the push a surviving player gets on the same tick", () => {
      const dead = mutualLasers(false, 150, true);
      const alive = mutualLasers(false, 150, true, true);

      // The control: nothing kills the survivor, so its drift is the blast alone.
      expect(alive.player.mode).toBe("inFlight");
      expect(ofKind(alive.events, "playerDestroyed")).toEqual([]);
      expect(alive.player.drift).not.toEqual(vec(0, 0, 0));
      expect(dead.player.mode).toBe("dead");
      expect(dead.player.drift).not.toEqual(vec(0, 0, 0));
      expect(dead.player.drift).toEqual(alive.player.drift);
    });
  });

  it("a player and an NPC that kill each other in one ram both die on the contact tick", () => {
    const { player, combat, world, krait } = ramScene(350, 10, 10);

    const { events } = stepToDeath(
      player,
      world,
      combat,
      sceneOptions({ collisions: true, debris: true }),
    );

    const destroyed = ofKind(events, "shipDestroyed");
    expect(destroyed.map((event) => event.id)).toEqual([krait]);
    expect(world.store.get(krait)).toBeUndefined();
    expect(ofKind(events, "playerDestroyed")).toHaveLength(1);
    expect(ofKind(events, "playerDestroyed")[0]?.cause).toEqual({
      damage: "scrape",
      culprit: "krait",
    });
    expect(player.mode).toBe("dead");
  });
});

describe("two lethal records on one tick", () => {
  /**
   * A Krait ahead facing the player and a Viper behind it, both shots lethal
   * (bank 3, no shield on either side). `kraitFirst` is the spawn order, which
   * decides the ids: the culprit follows the lower id, not the kind.
   */
  function twoShooters(kraitFirst: boolean) {
    const player = flyingPlayer();
    const combat = bareCombat(3);
    const world = createWorld(7);
    const spawnKrait = (): number =>
      spawnKind(world, "krait", aheadOf(1500), FACING_PLUS_Z, 250);
    const spawnViper = (): number =>
      spawnKind(world, "viper", behind(1500), FACING_MINUS_Z, 180);
    let krait: number;
    let viper: number;
    if (kraitFirst) {
      krait = spawnKrait();
      viper = spawnViper();
    } else {
      viper = spawnViper();
      krait = spawnKrait();
    }
    const events = resolveWith(
      player,
      world,
      combat,
      [npcShot(world, krait), npcShot(world, viper)],
      sceneOptions({}),
    );
    return { player, krait, viper, events };
  }

  it("the culprit is the first record in ledger order, the lower shooter id's key, and only one player hit event follows", () => {
    const { krait, viper, events } = twoShooters(true);

    expect(krait).toBeLessThan(viper);
    const died = ofKind(events, "playerDestroyed");
    expect(died).toHaveLength(1);
    expect(died[0]?.cause).toEqual({ damage: "laser", culprit: "krait" });
    const playerHits = ofKind(events, "shipHit").filter(
      (event) => event.target === PLAYER_ID,
    );
    expect(playerHits.map((event) => event.source)).toEqual([krait]);
  });

  it("with the spawn order swapped the culprit is again the lower id's key, now the other kind", () => {
    const { krait, viper, events } = twoShooters(false);

    expect(viper).toBeLessThan(krait);
    const died = ofKind(events, "playerDestroyed");
    expect(died).toHaveLength(1);
    expect(died[0]?.cause).toEqual({ damage: "laser", culprit: "viper" });
    const playerHits = ofKind(events, "shipHit").filter(
      (event) => event.target === PLAYER_ID,
    );
    expect(playerHits.map((event) => event.source)).toEqual([viper]);
  });
});

describe("the steps after the lethal one in the same frame", () => {
  it("up to four more stepSim calls change no hash, tick or clock and return nothing", () => {
    const { player, combat, world } = ramScene(350, 10, 5000);
    const stepOptions = sceneOptions({ collisions: true });
    stepToDeath(player, world, combat, stepOptions);
    const lethalKey = frozenKey(player, world, combat);

    for (let extra = 0; extra < MAX_STEPS_PER_FRAME - 1; extra += 1) {
      expect(
        stepOnce(player, world, combat, stepOptions, [{ kind: "launch" }]),
      ).toEqual([]);
      expect(frozenKey(player, world, combat)).toBe(lethalKey);
    }
    expect(player.mode).toBe("dead");
  });
});

describe("the lethal ram (D-11)", () => {
  const KRAIT_MASS = massFor({ flight: NPC_FLIGHT }, "krait");
  const NAV_BUOY = layout.navBuoy.position;
  const WITCHPOINT = layout.witchpoint.position;

  /** The player hit event of a tick. */
  function playerHit(events: readonly SimEvent[]) {
    return ofKind(events, "shipHit").find(
      (event) => event.target === PLAYER_ID,
    );
  }

  it("the response for a player destroyed by the ram is the inelastic branch, with no nudge, and the Krait is not pushed (ShipEntity.m:11111-11121)", () => {
    // 60 m behind a resting Krait, closing at 350 m/s with a bank of 10: the
    // ram's damage exceeds the bank, so `selfDestroyed` holds for the player.
    const player = flyingPlayer();
    player.speed = 350;
    const combat = bareCombat(10);
    const world = createWorld(7);
    const krait = spawnKind(world, "krait", aheadOf(60), identity(), 5000);
    const kraitEntity = entityOf(world, krait);
    const playerBefore = { ...player.position };
    const expected = collideWithShip({
      self: {
        position: playerBefore,
        velocity: vec(0, 0, -350),
        mass: PLAYER_MASS_KG,
        energy: combat.energy,
        destroyable: true,
      },
      other: {
        position: kraitEntity.position,
        velocity: vec(0, 0, 0),
        mass: KRAIT_MASS,
        energy: 5000,
        destroyable: true,
      },
    });
    if (expected.kind !== "collided") throw new Error("expected a contact");
    expect(expected.selfDestroyed).toBe(true);
    expect(expected.otherDestroyed).toBe(false);
    expect(expected.nudged).toBe(false);

    resolveCollisions(
      world,
      player,
      combat,
      sceneOptions({ collisions: true }),
      layout,
    );

    // The kernel's destroyed-self rule, applied by the stage: the player takes
    // its own velocity change and no nudge, and the reversal on the Krait
    // cancels the push it would have had (vel2a - vel2a).
    expect(player.drift).toEqual(add(vec(0, 0, 0), expected.dv1));
    expect(player.position).toEqual(add(playerBefore, expected.dp1));
    expect(kraitEntity.velocity).toEqual(
      add(vec(0, 0, 0), expected.dvOtherBody),
    );
    expect(speedOf(kraitEntity.velocity)).toBe(0);
  });

  it("a player with no shields and a low bank ramming a resting Krait at 350 m/s dies on the contact tick with cause scrape and the Krait", () => {
    const { player, combat, world } = ramScene(350, 10, 5000);

    const { events } = stepToDeath(
      player,
      world,
      combat,
      sceneOptions({ collisions: true }),
    );

    // Measured (plan 20-02): dam1 228.564 on the player at 350 m/s; the bank
    // of 10 is far below it, so `selfDestroyed` holds and the ledger kills.
    expect(playerHit(events)?.amount).toBeCloseTo(228.564, 3);
    expect(ofKind(events, "playerDestroyed")).toHaveLength(1);
    expect(ofKind(events, "playerDestroyed")[0]?.cause).toEqual({
      damage: "scrape",
      culprit: "krait",
    });
    expect(player.mode).toBe("dead");
    expect(combat.energy).toBe(0);
  });

  /** The player 400 m on +Z from `target`, nose toward it, with bank 10 and no shield. */
  function buoyRam(target: Vec3, speed: number) {
    const player = flyingPlayer();
    player.position = vec(target.x, target.y, target.z + 400);
    player.speed = speed;
    const combat = bareCombat(10);
    const world = createWorld(7);
    return { player, combat, world };
  }

  it.each([
    ["the nav buoy", NAV_BUOY, "buoy"],
    ["the witchpoint buoy", WITCHPOINT, "buoy-witchpoint"],
  ] as const)(
    "a ram into %s kills the player and names it %s",
    (_name, target, culprit) => {
      const { player, combat, world } = buoyRam(target, 250);

      const { events } = stepToDeath(
        player,
        world,
        combat,
        sceneOptions({ collisions: true }),
      );

      // Measured (plan 20-02): dam1 873.364 on the player at 250 m/s, the same
      // for both buoys (one hull, one mass), against a bank of 10.
      expect(playerHit(events)?.amount).toBeCloseTo(873.364, 3);
      expect(ofKind(events, "playerDestroyed")[0]?.cause).toEqual({
        damage: "scrape",
        culprit,
      });
      expect(player.mode).toBe("dead");
    },
  );

  it("a contact on the nav buoy's attached subentity still names the buoy: the collider id is the buoy's, not the subentity's", () => {
    // The player's hull is replaced by the pod barrel's, with a collision
    // radius above the buoy's, so the player is Oolite's prime and its octree,
    // placed in the buoy's cavity, touches the subentity only (the geometry of
    // `collision-buoy.test.ts`, whose pod does the same).
    const barrel = FULL_HULLS.get("barrel");
    const buoy = FULL_HULLS.get("buoy");
    if (barrel === undefined || buoy === undefined) throw new Error("hulls");
    const hulls = new Map(FULL_HULLS);
    hulls.set(PLAYER_HULL_KEY, {
      ...barrel,
      collisionRadius: buoy.collisionRadius + 1,
    });
    const cavity = vec(-27.5, -5, 0);
    const toCentre = Math.hypot(cavity.x, cavity.y);
    const player = flyingPlayer();
    player.position = vec(
      NAV_BUOY.x + cavity.x,
      NAV_BUOY.y + cavity.y,
      NAV_BUOY.z + cavity.z,
    );
    player.flightTime = 0;
    player.speed = 0;
    player.drift = vec(
      (-cavity.x / toCentre) * 200,
      (-cavity.y / toCentre) * 200,
      0,
    );
    const combat = bareCombat(1);
    const world = createWorld(7);

    const events = resolveShots(
      world,
      true,
      player,
      combat,
      [],
      sceneOptions({ collisions: true, hulls }),
      DT,
      layout,
    );

    // The contact is on the subentity: its own target id (7) took the damage
    // (measured, plan 20-02: dam2 171.790 on id 7, dam1 6.117 on the player,
    // which the bank of 1 cannot take), and the player's hit names the buoy.
    const hits = ofKind(events, "shipHit");
    expect(hits.map((event) => [event.target, event.source])).toEqual([
      [PLAYER_ID, STATION_NAV_BUOY_ID],
      [NAV_BUOY_SUBENTITY_ID, PLAYER_ID],
    ]);
    expect(ofKind(events, "playerDestroyed")[0]?.cause).toEqual({
      damage: "scrape",
      culprit: "buoy",
    });
    expect(player.mode).toBe("dead");
  });

  it("a ram whose damage exceeds the bank but not the shield plus the bank reverses the player and leaves it alive (bank only, ShipEntity.m:11111)", () => {
    // Bank 100 and the forward shield 128: the facing shield absorbs 128 of the
    // ram, so the damage past it is below the bank, while `selfDestroyed`
    // compares the whole damage with the bank alone.
    const player = flyingPlayer();
    player.speed = 300;
    const combat = createPlayerCombatState();
    combat.energy = 100;
    const world = createWorld(7);
    const krait = spawnKind(world, "krait", aheadOf(200), identity(), 5000);
    const stepOptions = sceneOptions({ collisions: true });

    let hit: ReturnType<typeof playerHit>;
    let events: SimEvent[] = [];
    let bankBefore = combat.energy;
    for (let tick = 0; tick < 400 && hit === undefined; tick += 1) {
      bankBefore = combat.energy;
      events = stepOnce(player, world, combat, stepOptions);
      hit = playerHit(events);
    }

    // Measured (plan 20-02): dam1 167.925 at 300 m/s, between the bank (100)
    // and the shield plus the bank (228).
    const dam1 = hit?.amount ?? NaN;
    expect(dam1).toBeCloseTo(167.925, 3);
    expect(dam1).toBeGreaterThan(100);
    expect(dam1).toBeLessThan(100 + 128);
    // The player took the reversal (`selfDestroyed`): the Krait is not pushed.
    expect(speedOf(entityOf(world, krait).velocity)).toBe(0);
    // Alive after the shield absorbed its share: the damage past the full
    // forward shield (128) comes off the bank of the contact tick (the bank
    // recharged a little on the way in, a tick's worth on the last tick).
    expect(player.mode).toBe("inFlight");
    expect(combat.energy).toBeGreaterThan(0);
    expect(combat.energy).toBeCloseTo(bankBefore - (dam1 - 128), 1);
    expect(ofKind(events, "playerDestroyed")).toEqual([]);
  });
});

describe("the lethal boundary through the step (QUAL-11)", () => {
  const BEAM_DAMAGE = LASER_STATS.EQ_WEAPON_BEAM_LASER.damage;

  /** One Viper beam against a player with `shield` forward and `bank`. */
  function oneBeam(shield: number, bank: number) {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.fwdShield = shield;
    combat.energy = bank;
    const world = createWorld(7);
    const viper = viperAhead(world);
    const events = resolve(player, world, combat, [shotOf(world, viper)]);
    return { player, combat, events };
  }

  it("damage past the shield exactly equal to the bank kills", () => {
    const { player, combat, events } = oneBeam(4, BEAM_DAMAGE - 4);
    expect(ofKind(events, "playerDestroyed")).toHaveLength(1);
    expect(player.mode).toBe("dead");
    expect(combat.energy).toBe(0);
  });

  it("damage past the shield one short of the bank does not kill", () => {
    const { player, combat, events } = oneBeam(4, BEAM_DAMAGE - 3);
    expect(ofKind(events, "playerDestroyed")).toEqual([]);
    expect(player.mode).toBe("inFlight");
    expect(combat.energy).toBe(1);
  });

  it("damage the shield absorbs entirely never kills, also at bank 0", () => {
    const { player, combat, events } = oneBeam(BEAM_DAMAGE, 0);
    expect(ofKind(events, "playerDestroyed")).toEqual([]);
    expect(player.mode).toBe("inFlight");
    expect(combat.fwdShield).toBe(0);
    expect(combat.energy).toBe(0);
  });
});
