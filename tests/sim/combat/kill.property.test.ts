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
 * `boundaryHolds` after every step. Phase 16's debris is that branch (plan
 * 16-04): `debrisFightArb` gives a share of the runs the debris content
 * (`options.combat.debris`) and every ship a random cargo, so pods, wrecks and
 * plates are spawned inside `killShip`, after `stepWorld`'s sanitise pass and
 * before the second commit (the only in-step spawn source), and wrecks expire
 * through `killShip` in `stepWorld`. Its counters prove the branch ran; the
 * `releaseDebris` totality property sits with the other totality properties.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createFlightScriptAi } from "../../../src/sim/ai/pilots/flight-script.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { AI_EVENT_NAMES } from "../../../src/sim/ai/types.js";
import type { AiComponent } from "../../../src/sim/ai/types.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type {
  DebrisContent,
  DebrisContext,
} from "../../../src/sim/world/debris.js";
import { killShip } from "../../../src/sim/world/kill.js";
import { sanitizeEntity } from "../../../src/sim/world/sanitize.js";
import {
  LASER_STATS,
  PLAYER_MAX_WEAPON_TEMP,
  WEAPON_COOLING_CUTOUT,
} from "../../../src/sim/combat/constants.js";
import { applyLedger } from "../../../src/sim/combat/ledger.js";
import type { HitRecord } from "../../../src/sim/combat/ledger.js";
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
import {
  identity,
  normalize,
  normalizeVec,
  quatFromUnitVectors,
  sub,
  vec,
} from "../../../src/sim/math.js";
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
import { drainAiEventsNow } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import {
  commitWorld,
  createWorld,
  postAiEvent,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();
const NPC_WEAPONS = realNpcWeapons();
const NPC_FLIGHT = realNpcFlightTable();
const DEBRIS = debrisFixture();

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

// ---------------------------------------------------------------------------
// Random fights (D-12). Named top-level generators and runners, so a later
// phase adds its kill or spawn source as one more branch of `roleArb` or of the
// fight runner.
// ---------------------------------------------------------------------------

/** The nine NPC records the world can hold. */
const SHIP_KEYS = [
  "adder",
  "cobramk1",
  "gecko",
  "krait",
  "mamba",
  "moray",
  "shuttle",
  "sidewinder",
  "viper",
] as const;

/** A target index meaning the player, and the one meaning the weakest other ship. */
const PLAYER_TARGET = -1;
const WEAKEST_TARGET = -2;

/** A ship's nose is local -Z. */
const LOCAL_FORWARD = vec(0, 0, -1);

type Role =
  | { readonly kind: "inert" }
  | { readonly kind: "pilot"; readonly target: number; readonly delay: number }
  | {
      readonly kind: "script";
      readonly script: "attack" | "intercept";
      readonly target: number;
    }
  | { readonly kind: "escort"; readonly owner: number; readonly slot: number };

interface ShipPlan {
  readonly key: (typeof SHIP_KEYS)[number];
  readonly maxEnergy: number;
  readonly recharge: number;
  /** Metres ahead of the player along its nose. */
  readonly along: number;
  readonly lateralX: number;
  readonly lateralY: number;
  readonly role: Role;
}

interface FightPlan {
  readonly worldSeed: number;
  readonly ships: readonly ShipPlan[];
  /** Two one-energy Vipers nose to nose, firing at each other. */
  readonly duel: boolean;
  readonly duelDelay: number;
  /** The step a one-energy ship is spawned on the player's nose, or -1. */
  readonly spawnNowAt: number;
  /** The player's fire key per step. */
  readonly script: readonly boolean[];
  /** The step after which the run is forked into a restored world. */
  readonly snapshotAt: number;
}

const targetArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(PLAYER_TARGET) },
  { weight: 4, arbitrary: fc.constant(WEAKEST_TARGET) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 5 }) },
);

const roleArb: fc.Arbitrary<Role> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<Role>({ kind: "inert" }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("pilot" as const),
      target: targetArb,
      delay: fc.integer({ min: 1, max: 30 }),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("script" as const),
      script: fc.constantFrom("attack" as const, "intercept" as const),
      target: targetArb,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("escort" as const),
      owner: fc.integer({ min: 0, max: 5 }),
      slot: fc.integer({ min: 1, max: 4 }),
    }),
  },
);

const lateralArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.integer({ min: -60, max: 60 }),
);

const shipPlanArb: fc.Arbitrary<ShipPlan> = fc.record({
  key: fc.constantFrom(...SHIP_KEYS),
  maxEnergy: fc.oneof(
    { weight: 3, arbitrary: fc.constant(1) },
    { weight: 2, arbitrary: fc.integer({ min: 1, max: 60 }) },
  ),
  recharge: fc.constantFrom(0, 1, 2),
  along: fc.integer({ min: 500, max: 3000 }),
  lateralX: lateralArb,
  lateralY: lateralArb,
  role: roleArb,
});

const fightPlanArb: fc.Arbitrary<FightPlan> = fc.record({
  worldSeed: fc.integer({ min: 1, max: 2_147_483_647 }),
  ships: fc.array(shipPlanArb, { minLength: 1, maxLength: 6 }),
  duel: fc.boolean(),
  duelDelay: fc.integer({ min: 0, max: 20 }),
  spawnNowAt: fc.option(fc.integer({ min: 0, max: 4 }), { nil: -1 }),
  script: fc.array(fc.boolean(), { minLength: 20, maxLength: 60 }),
  snapshotAt: fc.integer({ min: 0, max: 59 }),
});

function positionOf(ship: ShipPlan): Vec3 {
  return vec(FAR.x + ship.lateralX, FAR.y + ship.lateralY, FAR.z - ship.along);
}

/** The orientation that points a ship's nose from `from` at `to`. */
function noseOn(from: Vec3, to: Vec3): Quat {
  const direction = sub(to, from);
  if (!(Math.hypot(direction.x, direction.y, direction.z) > 0)) {
    return identity();
  }
  return normalize(quatFromUnitVectors(LOCAL_FORWARD, normalizeVec(direction)));
}

function shipPlanAt(ships: readonly ShipPlan[], index: number): ShipPlan {
  const ship = ships[index];
  if (ship === undefined) throw new Error(`no generated ship ${String(index)}`);
  return ship;
}

/**
 * The index of the generated ship that `target` names from ship `self`, or
 * `PLAYER_TARGET`: the weakest other ship, a ship by index (never itself), or
 * the player when there is no other ship.
 */
function targetIndex(
  ships: readonly ShipPlan[],
  self: number,
  target: number,
): number {
  if (target === PLAYER_TARGET) return PLAYER_TARGET;
  if (target === WEAKEST_TARGET) {
    let best = PLAYER_TARGET;
    for (let i = 0; i < ships.length; i += 1) {
      if (i === self) continue;
      if (
        best === PLAYER_TARGET ||
        shipPlanAt(ships, i).maxEnergy < shipPlanAt(ships, best).maxEnergy
      ) {
        best = i;
      }
    }
    return best;
  }
  const index = target % ships.length;
  if (index !== self) return index;
  const next = (self + 1) % ships.length;
  return next === self ? PLAYER_TARGET : next;
}

/** A test pilot already in its hold phase, firing at `targetId` on every think. */
function holdingPilot(
  firstThink: number,
  targetId: number,
): ReturnType<typeof createTestPilotAi> {
  const ai = createTestPilotAi(firstThink, { fire: true, holdRange: 5000 });
  ai.params.phase = "hold";
  ai.params.targetId = targetId;
  return ai;
}

/**
 * Spawn a plan's ships (and its duel) between steps, every one with spawn tick
 * `tick` (the tick number the next step runs), and return their ids. The ids are
 * predicted from `nextId`: a pilot or script names its target by id, and the
 * target may be spawned after it.
 */
function spawnFight(
  world: World,
  plan: FightPlan,
  tick: number,
  spawnTicks: Map<number, number>,
  cargo: readonly number[] = [],
): number[] {
  const first = world.store.nextId;
  const ids = plan.ships.map((_, i) => first + i);
  const idOf = (index: number): number => ids[index] ?? NO_ENTITY;
  const spawned: number[] = [];
  const remember = (id: number): void => {
    spawned.push(id);
    spawnTicks.set(id, tick);
  };
  plan.ships.forEach((ship, i) => {
    const position = positionOf(ship);
    const role = ship.role;
    let orientation = identity();
    let ai: AiComponent | null = null;
    const extra: Partial<SpawnInit> = {};
    if (role.kind === "pilot") {
      const t = targetIndex(plan.ships, i, role.target);
      const toward =
        t === PLAYER_TARGET ? FAR : positionOf(shipPlanAt(plan.ships, t));
      orientation = noseOn(position, toward);
      ai = holdingPilot(
        tick + role.delay,
        t === PLAYER_TARGET ? PLAYER_ID : idOf(t),
      );
    } else if (role.kind === "script") {
      const t = targetIndex(plan.ships, i, role.target);
      ai = createFlightScriptAi(tick, {
        script: role.script,
        targetId: t === PLAYER_TARGET ? PLAYER_ID : idOf(t),
        range: role.script === "intercept" ? 300 : 1000,
        speed: 100,
      });
    } else if (role.kind === "escort") {
      const owner = targetIndex(plan.ships, i, role.owner);
      if (owner !== PLAYER_TARGET) {
        ai = createFlightScriptAi(tick, { script: "escort", range: 300 });
        extra.ownerId = idOf(owner);
        extra.escortSlot = role.slot;
      }
    }
    const shipCargo = cargo[i];
    const id = spawnShip(world, ship.key, position, orientation, tick, {
      maxEnergy: ship.maxEnergy,
      energyRechargeRate: ship.recharge,
      ...(ai === null ? {} : { ai }),
      ...(shipCargo === undefined ? {} : { cargo: shipCargo }),
      ...extra,
    });
    if (id !== idOf(i)) throw new Error("the predicted ship id was wrong");
    remember(id);
  });
  if (plan.duel) {
    const a = world.store.nextId;
    const b = a + 1;
    const base = vec(FAR.x + 6000, FAR.y, FAR.z - 1500);
    remember(
      spawnShip(world, "viper", base, identity(), tick, {
        maxEnergy: 1,
        ai: holdingPilot(tick + plan.duelDelay, b),
      }),
    );
    remember(
      spawnShip(
        world,
        "viper",
        vec(base.x, base.y, base.z - 1000),
        FACING_PLUS_Z,
        tick,
        { maxEnergy: 1, ai: holdingPilot(tick + plan.duelDelay, a) },
      ),
    );
  }
  return spawned;
}

/** The "spawn now" ship: inert, one energy, on the player's nose at 300 m. */
function spawnNowShip(world: World, tick: number): number {
  return spawnShip(
    world,
    "adder",
    vec(FAR.x, FAR.y, FAR.z - 300),
    identity(),
    tick,
    { maxEnergy: 1 },
  );
}

/** Whether the player's fore pulse laser fires on the next step if the key is held. */
function laserReady(combat: PlayerCombatState): boolean {
  const stats = LASER_STATS.EQ_WEAPON_PULSE_LASER;
  return (
    combat.shotTicks.fore > stats.rechargeTicks &&
    combat.laserTemp.fore / PLAYER_MAX_WEAPON_TEMP < WEAPON_COOLING_CUTOUT &&
    combat.energy > stats.energy
  );
}

/** Live flight-script ships that hold a live ship as their target and are not done. */
function holdersBefore(world: World): { holder: number; target: number }[] {
  const holders: { holder: number; target: number }[] = [];
  for (const entity of world.store.live) {
    if (entity.dead || entity.kind !== "ship" || entity.ai === null) continue;
    if (entity.ai.aiKey !== "flight-script") continue;
    if (entity.ai.params.phase === "done") continue;
    const target = entity.nav.targetId;
    if (target !== NO_ENTITY && world.store.get(target)?.kind === "ship") {
      holders.push({ holder: entity.id, target });
    }
  }
  return holders;
}

/** What a run recorded over its events, per ship id. */
interface FightLog {
  readonly destroyed: Set<number>;
  readonly removed: Set<number>;
  /** Debris pieces seen live at a boundary, and those removed since. */
  readonly debris: Map<number, "pod" | "plate" | "wreck">;
  readonly debrisRemoved: Set<number>;
}

/**
 * Fold one step's events into the log and check the per-id rules: at most one
 * `shipDestroyed` per id and for a ship id only, exactly one `entityRemoved`
 * after it, no `aiFaulted`, and a killer that is nobody, the player, or a ship
 * still alive when its victim was killed (D-04).
 */
function recordEvents(
  log: FightLog,
  events: readonly SimEvent[],
  shipIds: ReadonlySet<number>,
): void {
  for (const event of events) {
    if (event.kind === "aiFaulted") {
      throw new Error(`ship ${String(event.id)} faulted at ${event.site}`);
    }
    if (event.kind === "shipDestroyed") {
      if (!shipIds.has(event.id))
        throw new Error("shipDestroyed for a non-ship");
      if (log.destroyed.has(event.id)) {
        throw new Error(`ship ${String(event.id)} destroyed twice`);
      }
      const killer = event.killer;
      if (
        killer !== NO_ENTITY &&
        killer !== PLAYER_ID &&
        (killer === event.id ||
          !shipIds.has(killer) ||
          log.destroyed.has(killer))
      ) {
        throw new Error(`ship ${String(event.id)} credited to a dead killer`);
      }
      log.destroyed.add(event.id);
    } else if (event.kind === "entityRemoved") {
      if (log.debris.has(event.id)) {
        // A debris piece leaves through killShip with no shipDestroyed: only
        // a wreck burns out (D16-11); a pod or plate never expires (D16-06).
        if (log.debris.get(event.id) !== "wreck") {
          throw new Error(`debris ${String(event.id)} removed but not a wreck`);
        }
        if (log.debrisRemoved.has(event.id)) {
          throw new Error(`debris ${String(event.id)} removed twice`);
        }
        log.debrisRemoved.add(event.id);
        continue;
      }
      if (!log.destroyed.has(event.id)) {
        throw new Error(`entity ${String(event.id)} removed before destroyed`);
      }
      if (log.removed.has(event.id)) {
        throw new Error(`entity ${String(event.id)} removed twice`);
      }
      log.removed.add(event.id);
    }
  }
}

/**
 * The mutual kills of one step: ships A below B destroyed on this step where
 * A's killer is B and every `shipHit` on B has A as its source, so no third
 * ship's record can be B's credited killer. D-04 then makes B's killer nobody,
 * which is asserted here.
 */
function mutualKillsOf(events: readonly SimEvent[]): number {
  const destroyed = ofKind(events, "shipDestroyed");
  const hits = ofKind(events, "shipHit");
  let count = 0;
  for (const a of destroyed) {
    for (const b of destroyed) {
      if (a.id >= b.id || a.killer !== b.id) continue;
      const onB = hits.filter((hit) => hit.target === b.id);
      if (onB.length === 0 || onB.some((hit) => hit.source !== a.id)) continue;
      if (b.killer !== NO_ENTITY) {
        throw new Error(`mutual kill of ${String(b.id)} credited a dead ship`);
      }
      count += 1;
    }
  }
  return count;
}

/** The non-vacuity counters, per run, kept outside the property. */
interface Tallies {
  runs: number;
  withKill: number;
  mutual: number;
  spawnTick: number;
  spawnNow: number;
  holderTarget: number;
  /** Debris (plan 16-04): runs with content, pieces by kind, expiries. */
  withDebrisContent: number;
  pods: number;
  plates: number;
  wrecks: number;
  wrecksExpired: number;
  /** Runs whose fork was taken while debris was live (and replayed equal). */
  forkWithDebris: number;
}

function newTallies(): Tallies {
  return {
    runs: 0,
    withKill: 0,
    mutual: 0,
    spawnTick: 0,
    spawnNow: 0,
    holderTarget: 0,
    withDebrisContent: 0,
    pods: 0,
    plates: 0,
    wrecks: 0,
    wrecksExpired: 0,
    forkWithDebris: 0,
  };
}

/** The debris branch of a fight: content on or off, and each ship's cargo. */
interface DebrisPlan {
  readonly content: boolean;
  readonly cargo: readonly number[];
}

const debrisPlanArb: fc.Arbitrary<DebrisPlan> = fc.record({
  content: fc.oneof(
    { weight: 3, arbitrary: fc.constant(true) },
    { weight: 1, arbitrary: fc.constant(false) },
  ),
  cargo: fc.array(
    fc.oneof(
      { weight: 1, arbitrary: fc.constant(0) },
      { weight: 3, arbitrary: fc.integer({ min: 0, max: 200 }) },
    ),
    { minLength: 6, maxLength: 6 },
  ),
});

/** The step options of a debris run: the shared ones plus the fixture content. */
function debrisStepOptions(): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: NPC_WEAPONS,
      debris: DEBRIS,
    },
    npcFlight: NPC_FLIGHT,
  };
}

/** Record the debris live at a boundary in the log and the tallies. */
function noteDebris(world: World, log: FightLog, tallies: Tallies): number {
  let live = 0;
  for (const entity of world.store.live) {
    if (entity.dead) continue;
    const kind =
      entity.kind === "wreckage"
        ? "wreck"
        : entity.kind === "cargo"
          ? entity.specKey === "alloy"
            ? "plate"
            : "pod"
          : undefined;
    if (kind === undefined) continue;
    live += 1;
    if (log.debris.has(entity.id)) continue;
    log.debris.set(entity.id, kind);
    if (kind === "pod") tallies.pods += 1;
    else if (kind === "plate") tallies.plates += 1;
    else tallies.wrecks += 1;
  }
  return live;
}

/** What the live run decided on one step, replayed on the restored world. */
interface Action {
  readonly fire: boolean;
  readonly spawn: boolean;
}

interface Fork {
  readonly world: World;
  readonly player: FlightState;
  readonly combat: PlayerCombatState;
}

/** A copy of the run through the snapshot, JSON and the parser (the save path). */
function forkRun(
  world: World,
  player: FlightState,
  combat: PlayerCombatState,
): Fork {
  const text = JSON.stringify(snapshotWorld(world));
  return {
    world: restoreWorld(parseWorldSnapshot(JSON.parse(text) as unknown)),
    player: structuredClone(player),
    combat: structuredClone(combat),
  };
}

/**
 * Run one fight and check it (D-12). After every tick: the boundary holds and a
 * flight-script holder of a ship killed this tick has finished its script. Over
 * the run: the per-id event rules. A fork taken at a random tick is replayed with
 * the same actions and ends with the same hash and the same events. The counters
 * go to `tallies`.
 */
function runFight(
  plan: FightPlan,
  tallies: Tallies,
  debris?: DebrisPlan,
): void {
  const player = flyingPlayer();
  const combat = createPlayerCombatState();
  const world = createWorld(plan.worldSeed);
  const withDebris = debris?.content === true;
  const options = withDebris ? debrisStepOptions() : stepOptions();
  const spawnTicks = new Map<number, number>();
  const spawnNowIds = new Set<number>();
  const shipIds = new Set<number>(
    spawnFight(world, plan, player.tick + 1, spawnTicks, debris?.cargo),
  );
  const log: FightLog = {
    destroyed: new Set(),
    removed: new Set(),
    debris: new Map(),
    debrisRemoved: new Set(),
  };
  let forkWithDebris = false;
  const actions: Action[] = [];
  const stepEvents: SimEvent[][] = [];
  const steps = plan.script.length;
  const snapAt = Math.min(plan.snapshotAt, steps - 2);
  let pending = plan.spawnNowAt >= 0;
  let fork: Fork | undefined;
  let mutual = false;
  let spawnTickKill = false;
  let spawnNowKill = false;
  let holderTargetKill = false;

  for (let s = 0; s < steps; s += 1) {
    let fire = plan.script[s] === true;
    let spawn = false;
    if (pending && s >= plan.spawnNowAt && laserReady(combat)) {
      pending = false;
      spawn = true;
      fire = true;
      const tick = player.tick + 1;
      const id = spawnNowShip(world, tick);
      shipIds.add(id);
      spawnTicks.set(id, tick);
      spawnNowIds.add(id);
    }
    actions.push({ fire, spawn });
    const holders = holdersBefore(world);
    const events = stepSim(
      player,
      world,
      layout,
      config,
      fire ? FIRE : ZERO_INTENT,
      [],
      DT,
      options,
      combat,
    );
    stepEvents.push(events);
    recordEvents(log, events, shipIds);
    boundaryHolds(player, world, combat);
    const liveDebris = noteDebris(world, log, tallies);

    const destroyedNow = new Set<number>();
    for (const event of ofKind(events, "shipDestroyed")) {
      destroyedNow.add(event.id);
      if (spawnTicks.get(event.id) === player.tick) {
        spawnTickKill = true;
        if (spawnNowIds.has(event.id)) spawnNowKill = true;
      }
    }
    if (mutualKillsOf(events) > 0) mutual = true;
    for (const { holder, target } of holders) {
      if (!destroyedNow.has(target)) continue;
      const survivor = world.store.get(holder);
      if (survivor === undefined) continue;
      if (survivor.ai?.params.phase !== "done") {
        throw new Error(
          `holder ${String(holder)} of destroyed ${String(target)} was not told`,
        );
      }
      holderTargetKill = true;
    }
    if (s === snapAt) {
      fork = forkRun(world, player, combat);
      forkWithDebris = liveDebris > 0;
    }
  }

  expect(log.removed).toEqual(log.destroyed);
  if (!withDebris) expect(log.debris.size).toBe(0);
  for (const id of log.debrisRemoved) {
    if (world.store.get(id) !== undefined) {
      throw new Error(`removed debris ${String(id)} is still live`);
    }
  }

  if (fork !== undefined) {
    const replayed: SimEvent[][] = [];
    for (let s = snapAt + 1; s < steps; s += 1) {
      const action = actions[s];
      if (action === undefined) throw new Error("missing action");
      if (action.spawn) spawnNowShip(fork.world, fork.player.tick + 1);
      replayed.push(
        stepSim(
          fork.player,
          fork.world,
          layout,
          config,
          action.fire ? FIRE : ZERO_INTENT,
          [],
          DT,
          options,
          fork.combat,
        ),
      );
    }
    expect(hashWorld(fork.player, fork.world, fork.combat)).toBe(
      hashWorld(player, world, combat),
    );
    expect(JSON.stringify(replayed)).toBe(
      JSON.stringify(stepEvents.slice(snapAt + 1)),
    );
  }

  tallies.runs += 1;
  if (withDebris) tallies.withDebrisContent += 1;
  tallies.wrecksExpired += log.debrisRemoved.size;
  if (fork !== undefined && forkWithDebris) tallies.forkWithDebris += 1;
  if (log.destroyed.size > 0) tallies.withKill += 1;
  if (mutual) tallies.mutual += 1;
  if (spawnTickKill) tallies.spawnTick += 1;
  if (spawnNowKill) tallies.spawnNow += 1;
  if (holderTargetKill) tallies.holderTarget += 1;
}

describe("random fights (FOUND-19, D-12)", () => {
  it("hold the boundary invariants, report each kill once and tell every holder", () => {
    const tallies = newTallies();
    fc.assert(
      fc.property(fightPlanArb, (plan) => {
        runFight(plan, tallies);
      }),
      { seed: 20261116, numRuns: 50 },
    );
    // Not vacuous (T-15-22): under the fixed seed the runs contain the named
    // cases. A missed floor means the generator weights need tuning.
    expect(tallies.runs).toBe(50);
    expect(tallies.withKill).toBeGreaterThanOrEqual(25);
    expect(tallies.mutual).toBeGreaterThanOrEqual(1);
    expect(tallies.spawnTick).toBeGreaterThanOrEqual(1);
    expect(tallies.spawnNow).toBeGreaterThanOrEqual(1);
    expect(tallies.holderTarget).toBeGreaterThanOrEqual(1);
    // This property has no debris branch: its runs keep their Phase 15 shape.
    expect(tallies.withDebrisContent).toBe(0);
    expect(tallies.pods + tallies.plates + tallies.wrecks).toBe(0);
  }, 240_000);

  it("with debris: keep the boundary after every step, expire wrecks and replay a fork equal (plan 16-04)", () => {
    const tallies = newTallies();
    fc.assert(
      fc.property(fightPlanArb, debrisPlanArb, (plan, debris) => {
        runFight(plan, tallies, debris);
      }),
      { seed: 20261604, numRuns: 50 },
    );
    // Not vacuous (Pitfall 7): under the fixed seed the debris branch ran,
    // spawned every kind, expired a wreck and forked a world holding debris.
    expect(tallies.runs).toBe(50);
    expect(tallies.withDebrisContent).toBeGreaterThanOrEqual(20);
    expect(tallies.withKill).toBeGreaterThanOrEqual(20);
    expect(tallies.pods).toBeGreaterThanOrEqual(1);
    expect(tallies.wrecks).toBeGreaterThanOrEqual(1);
    expect(tallies.plates).toBeGreaterThanOrEqual(1);
    expect(tallies.wrecksExpired).toBeGreaterThanOrEqual(1);
    expect(tallies.forkWithDebris).toBeGreaterThanOrEqual(1);
  }, 240_000);
});

// ---------------------------------------------------------------------------
// Totality (D-15)
// ---------------------------------------------------------------------------

/** Ids a caller could hand over: existing, absent, static, malformed. */
const ID_POOL = [
  0,
  1,
  2,
  3,
  4,
  5,
  100,
  101,
  102,
  103,
  104,
  105,
  -1,
  1.5,
  Number.NaN,
  4_294_967_295,
  4_294_967_296,
  2 ** 53,
];
const idArb: fc.Arbitrary<number> = fc.constantFrom(...ID_POOL);

const amountArb: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(Number.NaN, Infinity, -Infinity, -1, 0),
  fc.double({ min: 0.001, max: 200, noNaN: true }),
);

const coordArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(Number.NaN),
  fc.double({ min: -1e4, max: 1e4, noNaN: true }),
);

const recordArb: fc.Arbitrary<HitRecord> = fc.record({
  target: idArb,
  source: idArb,
  amount: amountArb,
  sourcePosition: fc.record({ x: coordArb, y: coordArb, z: coordArb }),
});

const energiesArb = fc.array(fc.integer({ min: 1, max: 100 }), {
  maxLength: 4,
});

/** A world holding one inert ship per energy, ids 101 upward. */
function worldOfShips(energies: readonly number[]): World {
  const world = createWorld(1);
  energies.forEach((maxEnergy, i) => {
    spawnShip(
      world,
      "adder",
      vec(FAR.x + 100 * i, FAR.y, FAR.z - 1000),
      identity(),
      0,
      { maxEnergy },
    );
  });
  return world;
}

describe("the new sim functions are total (D-15)", () => {
  it("applyLedger never throws and returns only live ships, sorted and unique", () => {
    fc.assert(
      fc.property(
        energiesArb,
        fc.array(recordArb, { maxLength: 12 }),
        fc.boolean(),
        fc.boolean(),
        (energies, records, stepped, withCombat) => {
          const world = worldOfShips(energies);
          const player = flyingPlayer();
          const combat = withCombat ? createPlayerCombatState() : undefined;
          const events: SimEvent[] = [];
          const lethal = applyLedger(
            world,
            stepped,
            player,
            combat,
            records,
            events,
          );
          if (!stepped) expect(lethal).toEqual([]);
          for (let i = 0; i < lethal.length; i += 1) {
            const hit = lethal[i];
            if (hit === undefined) throw new Error("missing hit");
            expect(world.store.get(hit.victim)?.kind).toBe("ship");
            expect(hit.victim).not.toBe(PLAYER_ID);
            if (i > 0) {
              expect(hit.victim).toBeGreaterThan(lethal[i - 1]?.victim ?? -1);
            }
          }
          for (const entity of world.store.live) {
            expect(Number.isFinite(entity.energy)).toBe(true);
            expect(entity.energy).toBeGreaterThanOrEqual(0);
          }
          for (const hit of lethal) {
            killShip(world, hit.victim, hit.killer, events);
          }
          drainAiEventsNow(world, player, layout, player.tick, events);
          commitWorld(world);
          boundaryHolds(player, world, undefined);
        },
      ),
      { seed: 20261117, numRuns: 100 },
    );
  });

  it("killShip never throws, and a refused call changes nothing", () => {
    fc.assert(
      fc.property(
        energiesArb,
        fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 4 }),
        fc.array(fc.record({ id: idArb, killer: idArb }), { maxLength: 8 }),
        (energies, holds, calls) => {
          const world = worldOfShips(energies);
          const player = flyingPlayer();
          holds.forEach((target, i) => {
            const holder = world.store.get(101 + i);
            if (holder !== undefined) holder.nav.targetId = 101 + target;
          });
          const events: SimEvent[] = [];
          for (const { id, killer } of calls) {
            const hashBefore = hashWorld(player, world);
            const eventsBefore = events.length;
            const queuedBefore = world.aiQueue.length;
            const killed = killShip(world, id, killer, events);
            if (!killed) {
              expect(hashWorld(player, world)).toBe(hashBefore);
              expect(events).toHaveLength(eventsBefore);
              expect(world.aiQueue).toHaveLength(queuedBefore);
            } else {
              expect(events.length - eventsBefore).toBeLessThanOrEqual(1);
            }
          }
          drainAiEventsNow(world, player, layout, player.tick, events);
          commitWorld(world);
          boundaryHolds(player, world, undefined);
        },
      ),
      { seed: 20261118, numRuns: 100 },
    );
  });

  it("drainAiEventsNow survives a handler that throws, fires or writes out-of-domain values", () => {
    const modeArb = fc.constantFrom(
      "throw",
      "record",
      "fire",
      "nan",
      "inf",
      "huge",
    );
    const eventArb = fc.record({
      to: fc.constantFrom(101, 102, 103, 104, 105, 0, 100, -1),
      name: fc.constantFrom(...AI_EVENT_NAMES),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        modeArb,
        fc.array(eventArb, { maxLength: 10 }),
        fc.integer({ min: 0, max: 3 }),
        (count, mode, queued, fireEntries) => {
          const world = createWorld(1);
          const player = flyingPlayer();
          for (let i = 0; i < count; i += 1) {
            spawnShip(
              world,
              "adder",
              vec(FAR.x + 100 * i, FAR.y, FAR.z - 1000),
              identity(),
              0,
              { ai: createTestPilotAi(0) },
            );
          }
          for (const event of queued) postAiEvent(world, event);
          for (let i = 0; i < fireEntries; i += 1)
            world.fireQueue.push(101 + i);
          const entryLength = world.fireQueue.length;
          const seen: string[] = [];
          const module = {
            think: () => undefined,
            onEvent: (
              ctx: Parameters<NonNullable<AiRegistry[string]["onEvent"]>>[0],
            ) => {
              seen.push(mode);
              if (mode === "throw") throw new Error("handler fault");
              if (mode === "fire") ctx.ctl.fire(ctx.self);
              if (mode === "nan") ctx.ai.params.x = Number.NaN;
              if (mode === "inf") ctx.ai.params.x = Infinity;
              if (mode === "huge") ctx.ai.params.x = 1e300;
            },
          };
          const registry: AiRegistry = {
            "test-pilot": module,
            "flight-script": module,
          };
          const events: SimEvent[] = [];
          drainAiEventsNow(
            world,
            player,
            layout,
            player.tick,
            events,
            registry,
          );

          expect(world.aiQueue).toHaveLength(0);
          expect(world.fireQueue).toHaveLength(entryLength);
          for (const event of ofKind(events, "aiFaulted")) {
            expect(event.site).toBe("event");
          }
          world.fireQueue.length = 0;
          commitWorld(world);
          boundaryHolds(player, world, undefined);
        },
      ),
      { seed: 20261119, numRuns: 100 },
    );
  });

  it("releaseDebris never throws, never needs a repair and never takes the count above 244", () => {
    // Mostly valid numbers, so the release also runs to the end; the rest are
    // the degenerate values the release must survive.
    const numArb = fc.oneof(
      {
        weight: 1,
        arbitrary: fc.constantFrom(Number.NaN, Infinity, -Infinity, -1, 0, -0),
      },
      { weight: 3, arbitrary: fc.double({ min: 0.01, max: 1e5, noNaN: true }) },
    );
    const vecArb = fc.record({ x: numArb, y: numArb, z: numArb });
    const modelArb = fc.oneof(
      { weight: 1, arbitrary: fc.constant(null) },
      {
        weight: 6,
        arbitrary: fc.record({
          key: fc.constantFrom(
            "barrel",
            "alloy",
            "wreckage-component",
            "more-wreckage2",
            "",
          ),
          mass: numArb,
          radius: numArb,
        }),
      },
    );
    const hullArb = fc.oneof(
      { weight: 1, arbitrary: fc.constant(undefined) },
      { weight: 1, arbitrary: fc.constant(null) },
      {
        weight: 6,
        arbitrary: fc.record({
          mass: fc.oneof(
            numArb,
            fc.double({ min: 1e3, max: 1e6, noNaN: true }),
          ),
          fragmentChance: fc.oneof(numArb, fc.double({ min: 0, max: 1 })),
          boundingBox: fc.oneof(
            fc.constant(null),
            fc.record({ min: vecArb, max: vecArb }),
          ),
        }),
      },
    );
    const octreesArb = fc.constantFrom(
      "none",
      "real",
      "malformed",
      "nanRadius",
      "notAMap",
    );
    const seen = { pod: 0, wreck: 0, plate: 0, kicked: 0 };
    const victimArb = fc.record({
      specKey: fc.constantFrom("adder", "krait", "viper", "nonesuch"),
      position: fc.oneof(
        { weight: 1, arbitrary: vecArb },
        { weight: 3, arbitrary: fc.constant(vec(FAR.x, FAR.y, FAR.z)) },
        { weight: 1, arbitrary: fc.constant(vec(1e12, -1e12, 1e12)) },
      ),
      orientation: fc.oneof(
        fc.constant(identity()),
        fc.record({ w: numArb, x: numArb, y: numArb, z: numArb }),
      ),
      velocity: fc.oneof(vecArb, fc.constant(vec(1e4, -1e4, 9999))),
      radius: numArb,
      cargo: fc.oneof(
        fc.integer({ min: 0, max: 200 }),
        fc.constantFrom(-1, 1.5, Number.NaN, 1e9),
      ),
    });
    fc.assert(
      fc.property(
        fc.oneof(
          { weight: 2, arbitrary: fc.integer({ min: 0, max: 60 }) },
          { weight: 1, arbitrary: fc.integer({ min: 0, max: 255 }) },
        ),
        fc.integer({ min: 0, max: 30 }),
        victimArb,
        hullArb,
        modelArb,
        modelArb,
        fc.array(modelArb, { maxLength: 5 }),
        fc.boolean(),
        octreesArb,
        fc.integer({ min: 1, max: 2_147_483_647 }),
        (
          fillers,
          nearPods,
          victimPlan,
          hull,
          pod,
          plate,
          wrecks,
          wrecksMissing,
          octrees,
          seed,
        ) => {
          const world = createWorld(seed);
          const base = vec(FAR.x, FAR.y, FAR.z - 1000);
          const victimId = spawnShip(
            world,
            victimPlan.specKey,
            base,
            identity(),
            0,
          );
          // Fillers: some old pods around the victim (the blast may kick them),
          // the rest inert entities far away.
          for (let i = 0; i < fillers; i += 1) {
            const near = i < nearPods;
            const result = spawnEntity(
              world,
              {
                kind: "cargo",
                specKey: near ? "barrel" : "filler",
                scanClass: "CLASS_CARGO",
                position: near
                  ? vec(base.x + 3 * (i % 7) - 9, base.y + (i % 5), base.z - i)
                  : vec(-1e6, 1000 * (i + 1), 0),
                orientation: identity(),
                radius: near ? 5.7986 : 1,
                ai: null,
              },
              0,
            );
            if (!result.ok) throw new Error(`filler refused: ${result.reason}`);
          }
          const victim = world.store.get(victimId);
          if (victim === undefined) throw new Error("no victim");
          victim.position = victimPlan.position;
          victim.orientation = victimPlan.orientation;
          victim.velocity = victimPlan.velocity;
          victim.radius = victimPlan.radius;
          victim.cargo = victimPlan.cargo;
          const hulls = new Map<string, unknown>();
          if (hull !== undefined) hulls.set(victimPlan.specKey, hull);
          const content = {
            hulls,
            pod,
            plate,
            wrecks: wrecksMissing ? null : wrecks,
          } as unknown as DebrisContent;
          const table =
            octrees === "real"
              ? HULLS
              : octrees === "malformed"
                ? new Map([
                    [
                      victimPlan.specKey,
                      {
                        collisionRadius: 1,
                        octree: { radius: 8, depth: 1, root: [1, 2] },
                      },
                    ],
                  ])
                : octrees === "nanRadius"
                  ? new Map([
                      [
                        victimPlan.specKey,
                        {
                          collisionRadius: 1,
                          octree: {
                            radius: Number.NaN,
                            depth: 1,
                            root: [-1, 0, 0, 0, 0, 0, 0, 0],
                          },
                        },
                      ],
                    ])
                  : octrees === "notAMap"
                    ? { get: () => undefined }
                    : undefined;
          const ctx = {
            tick: 1,
            content,
            ...(table === undefined ? {} : { octrees: table }),
          } as unknown as DebrisContext;

          let killed = false;
          expect(() => {
            killed = killShip(world, victimId, PLAYER_ID, [], ctx);
          }).not.toThrow();
          expect(killed).toBe(true);
          const live = world.store.live.filter((e) => !e.dead);
          expect(live.length).toBeLessThanOrEqual(Math.max(fillers, 244));
          const fresh = live.filter((e) => e.spawnTick === 1);
          if (fresh.some((e) => e.kind === "wreckage")) seen.wreck += 1;
          if (fresh.some((e) => e.kind === "cargo" && e.specKey === "alloy")) {
            seen.plate += 1;
          }
          if (fresh.some((e) => e.kind === "cargo" && e.specKey === "barrel")) {
            seen.pod += 1;
          }
          if (live.some((e) => e.specKey === "barrel" && e.spawnTick === 0)) {
            if (live.some((e) => e.spawnTick === 0 && e.velocity.x !== 0)) {
              seen.kicked += 1;
            }
          }

          for (const entity of live) {
            expect(sanitizeEntity(entity)).toBe(false);
          }
          commitWorld(world);
          boundaryHolds(flyingPlayer(), world, undefined);
        },
      ),
      { seed: 20261605, numRuns: 200 },
    );
    // Not vacuous: valid contents spawned every kind and the blast kicked an
    // old pod in some runs.
    expect(seen.pod).toBeGreaterThanOrEqual(1);
    expect(seen.wreck).toBeGreaterThanOrEqual(1);
    expect(seen.plate).toBeGreaterThanOrEqual(1);
    expect(seen.kicked).toBeGreaterThanOrEqual(1);
  });
});
