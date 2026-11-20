// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The collision stage (CBT-18, D-01, PD-05, plan 18-11): `resolveCollisions`
 * inside `resolveShots`, `colliderRank` and the per-body call order.
 *
 * The response numbers come from `collideWithShip` (`./response.ts`, pinned
 * to the C by plan 18-16); these cases check that the stage feeds it the
 * right bodies in Oolite's order, applies its velocity and position changes
 * at once and queues its damage into the one ledger. The hulls are the
 * committed octrees (`fullHullTable`), the masses the compiled flight table.
 */

import { describe, expect, it } from "vitest";

import { PLAYER_HULL_KEY } from "../../../src/sim/combat/aim.js";
import {
  colliderRank,
  resolveCollisions,
  runContactCalls,
} from "../../../src/sim/combat/collide.js";
import type { ContactPart } from "../../../src/sim/combat/collide.js";
import { PLAYER_MASS_KG } from "../../../src/sim/combat/constants.js";
import type { HullTable } from "../../../src/sim/combat/hit.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { collideWithShip } from "../../../src/sim/combat/response.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { portFrame } from "../../../src/sim/dock/port-frame.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { add, identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { massFor } from "../../../src/sim/npc/stats.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import {
  DEBRIS_MAX_ENERGY,
  debrisMassOf,
} from "../../../src/sim/world/debris.js";
import { NO_ENTITY, PLAYER_ID } from "../../../src/sim/world/ids.js";
import type { EntityId } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import {
  FIXTURE_PLATE,
  FIXTURE_POD,
  debrisFixture,
} from "../../helpers/debris-fixture.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
} from "../../helpers/dock-pose.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const { layout, config } = laveFixture();
const HULLS: HullTable = fullHullTable();
const NPC_FLIGHT = realNpcFlightTable();
const KRAIT_MASS = massFor({ flight: NPC_FLIGHT }, "krait");
const KRAIT_ENERGY = 80;

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

/** The app's options: hulls, the flight table and `collisions` (null: absent). */
function options(collisions: boolean | null = true): StepOptions {
  return {
    npcFlight: NPC_FLIGHT,
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      ...(collisions === null ? {} : { collisions }),
    },
  };
}

/** A player launched, skipped to flight, parked at `FAR`, facing -Z. */
function flyingPlayer(speed = 0): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = speed;
  return state;
}

/** An inert ship of `specKey` at `position`, at rest, facing -Z. */
function spawnShip(
  world: World,
  position: Vec3,
  specKey = "krait",
  maxEnergy = KRAIT_ENERGY,
): EntityId {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation: identity(),
      radius: HULLS.get(specKey)?.collisionRadius ?? 30,
      maxEnergy,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function entityOf(world: World, id: EntityId) {
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error(`no entity ${id}`);
  return entity;
}

function step(
  player: FlightState,
  world: World,
  combat: PlayerCombatState,
  stepOptions: StepOptions,
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

function hits(
  events: readonly SimEvent[],
): Extract<SimEvent, { kind: "shipHit" }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: "shipHit" }> =>
      event.kind === "shipHit",
  );
}

describe("colliderRank (Oolite's update order, Universe.m:6439, 6534)", () => {
  it("puts the player first, then the nearer NPC; an equal distance ranks the lower id first", () => {
    const origin = vec(10, 20, 30);
    const order = colliderRank(
      [
        { id: 105, position: vec(10, 20, 530) },
        { id: 104, position: vec(10, 320, 30) },
        { id: PLAYER_ID, position: origin },
        { id: 103, position: vec(310, 20, 30) },
      ],
      origin,
    );
    expect(order).toEqual([PLAYER_ID, 103, 104, 105]);
  });

  it("ranks a non-finite distance after every finite one, ties by id", () => {
    const origin = vec(0, 0, 0);
    const order = colliderRank(
      [
        { id: 109, position: vec(Number.NaN, 0, 0) },
        { id: 108, position: vec(1e300, 1e300, 0) },
        { id: 107, position: vec(5, 0, 0) },
        { id: 106, position: vec(Number.NaN, 0, 0) },
      ],
      origin,
    );
    expect(order).toEqual([107, 106, 108, 109]);
  });
});

describe("runContactCalls (each body's own list, ShipEntity.m:10991-11017, 11149-11150)", () => {
  const HULL: ContactPart = { kind: "hull" };

  it("a collided call removes self from the other's list: one call per contact", () => {
    const calls: string[] = [];
    runContactCalls(2, [{ self: 0, other: 1, part: HULL }], (s, o) => {
      calls.push(`${s}-${o}`);
      return true;
    });
    expect(calls).toEqual(["0-1"]);
  });

  it("a separating call leaves self in the other's list: the other calls in its own turn", () => {
    const calls: string[] = [];
    runContactCalls(2, [{ self: 0, other: 1, part: HULL }], (s, o) => {
      calls.push(`${s}-${o}`);
      return false;
    });
    expect(calls).toEqual(["0-1", "1-0"]);
  });

  it("runs the bodies in rank order, each list in the other's rank order; the reverse call sees the hull", () => {
    const calls: string[] = [];
    const parts: ContactPart[] = [];
    runContactCalls(
      3,
      [
        { self: 1, other: 2, part: HULL },
        { self: 0, other: 2, part: { kind: "subentity", index: 0 } },
        { self: 0, other: 1, part: HULL },
      ],
      (s, o, part) => {
        calls.push(`${s}-${o}`);
        parts.push(part);
        // Only the player's call against body 2 separates.
        return !(s === 0 && o === 2);
      },
    );
    expect(calls).toEqual(["0-1", "0-2", "1-2", "2-0"]);
    expect(parts[1]).toEqual({ kind: "subentity", index: 0 });
    expect(parts[3]).toEqual({ kind: "hull" });
  });
});

/** The player 60 m behind a Krait at rest, closing at `speed`. */
function ramScene(speed: number): {
  player: FlightState;
  combat: PlayerCombatState;
  world: World;
  krait: EntityId;
} {
  const player = flyingPlayer(speed);
  const combat = createPlayerCombatState();
  const world = createWorld(7);
  const krait = spawnShip(world, vec(FAR.x, FAR.y, FAR.z - 60));
  return { player, combat, world, krait };
}

describe("the player rams a Krait (tracer)", () => {
  it("applies collideWithShip's response at once, the player as self, and queues two scrape records", () => {
    const { player, combat, world, krait } = ramScene(100);
    const kraitEntity = entityOf(world, krait);
    const playerBefore = { ...player.position };
    const kraitBefore = { ...kraitEntity.position };
    const expected = collideWithShip({
      self: {
        position: playerBefore,
        velocity: vec(0, 0, -100),
        mass: PLAYER_MASS_KG,
        energy: combat.energy,
        destroyable: false,
      },
      other: {
        position: kraitBefore,
        velocity: vec(0, 0, 0),
        mass: KRAIT_MASS,
        energy: KRAIT_ENERGY,
        destroyable: true,
      },
    });
    if (expected.kind !== "collided") throw new Error("expected a contact");
    expect(expected.v2b).toBe(100);

    const { records } = resolveCollisions(world, player, combat, options());

    // Both started at rest, so the drift is the change itself (+0 for -0).
    expect(player.drift).toEqual(add(vec(0, 0, 0), expected.dv1));
    expect(kraitEntity.velocity).toEqual(
      add(vec(0, 0, 0), expected.dvOtherBody),
    );
    expect(player.position).toEqual(add(playerBefore, expected.dp1));
    expect(kraitEntity.position).toEqual(add(kraitBefore, expected.dpOther));
    expect(records).toEqual([
      {
        kind: "scrape",
        target: PLAYER_ID,
        source: krait,
        amount: expected.dam1,
        sourcePosition: kraitBefore,
      },
      {
        kind: "scrape",
        target: krait,
        source: PLAYER_ID,
        amount: expected.dam2,
        sourcePosition: playerBefore,
      },
    ]);
    // Oolite's worked values (RESEARCH Pattern 4): 18.658 and 42.948.
    expect(expected.dam1).toBeCloseTo(18.658, 3);
    expect(expected.dam2).toBeCloseTo(42.948, 3);
  });

  it("through stepSim: damages each side once, drains the forward shield without heat, and never again over 600 idle ticks", () => {
    const player = flyingPlayer(100);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const krait = spawnShip(world, vec(FAR.x, FAR.y, FAR.z - 200));
    const shieldBefore = combat.fwdShield;
    const aftBefore = combat.aftShield;
    const cabinBefore = combat.cabinTemp;

    let contactTick = -1;
    let contactHits: Extract<SimEvent, { kind: "shipHit" }>[] = [];
    for (let tick = 0; tick < 240 && contactTick < 0; tick += 1) {
      const found = hits(step(player, world, combat, options()));
      if (found.length > 0) {
        contactTick = tick;
        contactHits = found;
      }
    }
    expect(contactTick).toBeGreaterThan(0);
    expect(contactHits.map((hit) => [hit.target, hit.source])).toEqual([
      [PLAYER_ID, krait],
      [krait, PLAYER_ID],
    ]);
    const [onPlayer, onKrait] = contactHits;
    expect(onPlayer?.amount).toBeCloseTo(18.658, 3);
    expect(onPlayer?.shield).toBe(true);
    expect(onKrait?.amount).toBeCloseTo(42.948, 3);
    expect(entityOf(world, krait).energy).toBeCloseTo(
      KRAIT_ENERGY - (onKrait?.amount ?? 0),
      9,
    );
    expect(combat.fwdShield).toBeCloseTo(
      shieldBefore - (onPlayer?.amount ?? 0),
      9,
    );
    expect(combat.aftShield).toBe(aftBefore);
    expect(combat.cabinTemp).toBe(cabinBefore);
    // Rebound: the player drifts back, the Krait is pushed ahead.
    expect(player.drift.z).toBeGreaterThan(0);
    expect(entityOf(world, krait).velocity.z).toBeLessThan(0);

    player.speed = 0;
    let later = 0;
    for (let tick = 0; tick < 600; tick += 1) {
      later += hits(step(player, world, combat, options())).length;
    }
    expect(later).toBe(0);
  });

  it("without the opt-in nothing happens: the player passes through, and the hashes equal collisions: false", () => {
    const runs = [null, false].map((collisions) => {
      const { player, combat, world } = ramScene(100);
      let hitCount = 0;
      for (let tick = 0; tick < 200; tick += 1) {
        hitCount += hits(
          step(player, world, combat, options(collisions)),
        ).length;
      }
      return {
        hitCount,
        drift: player.drift,
        flight: hashFlight(player),
        world: hashWorld(player, world, combat),
      };
    });
    expect(runs[0]?.hitCount).toBe(0);
    expect(runs[0]?.drift).toEqual(vec(0, 0, 0));
    expect(runs[0]).toEqual(runs[1]);
  });

  it("a tick that never collides changes no hashed state (criterion 5)", () => {
    const runs = [true, false].map((collisions) => {
      const player = flyingPlayer(100);
      const combat = createPlayerCombatState();
      const world = createWorld(7);
      spawnShip(world, vec(FAR.x + 2000, FAR.y, FAR.z));
      spawnShip(world, vec(FAR.x + 2100, FAR.y, FAR.z), "adder", 85);
      const hashes: string[] = [];
      for (let tick = 0; tick < 120; tick += 1) {
        step(player, world, combat, options(collisions));
        hashes.push(hashWorld(player, world, combat));
      }
      return hashes;
    });
    expect(runs[0]).toEqual(runs[1]);
  });

  it("the player is the hull in the table under its own key", () => {
    expect(HULLS.has(PLAYER_HULL_KEY)).toBe(true);
    expect(KRAIT_MASS).toBe(93_291.40625);
  });
});

// --- Task 2: ships, pods and plates, kills, the exclusions ------------------

const DEBRIS = debrisFixture();

/** The app's options with the debris content (pods and plates collide). */
function withDebris(collisions = true): StepOptions {
  const base = options(collisions);
  return {
    ...base,
    combat: { ...base.combat, mounts: DEFAULT_LASER_MOUNTS, debris: DEBRIS },
  };
}

/** A pod (`barrel`) or plate (`alloy`) at `position` with `velocity`. */
function spawnPiece(
  world: World,
  position: Vec3,
  velocity: Vec3 = vec(0, 0, 0),
  specKey: "barrel" | "alloy" = "barrel",
  kind: "cargo" | "wreckage" = "cargo",
): EntityId {
  const model = specKey === "barrel" ? FIXTURE_POD : FIXTURE_PLATE;
  const result = spawnEntity(
    world,
    {
      kind,
      specKey,
      scanClass: "CLASS_CARGO",
      position,
      orientation: identity(),
      radius: model.radius,
      maxEnergy: DEBRIS_MAX_ENERGY,
      velocity,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function destroyed(
  events: readonly SimEvent[],
): Extract<SimEvent, { kind: "shipDestroyed" }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: "shipDestroyed" }> =>
      event.kind === "shipDestroyed",
  );
}

describe("ships, pods and plates (D-01, D-07, PD-05)", () => {
  it("rams a pod above 15.3 m/s and removes it: no scoop (PD-05)", () => {
    const player = flyingPlayer(20);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const pod = spawnPiece(world, vec(FAR.x, FAR.y, FAR.z - 120));
    let removedAt = -1;
    let podHits = 0;
    let playerHits = 0;
    for (let tick = 0; tick < 600 && removedAt < 0; tick += 1) {
      const events = step(player, world, combat, withDebris());
      for (const hit of hits(events)) {
        if (hit.target === pod) podHits += 1;
        if (hit.target === PLAYER_ID) playerHits += 1;
      }
      if (events.some((e) => e.kind === "entityRemoved" && e.id === pod)) {
        removedAt = tick;
      }
    }
    expect(removedAt).toBeGreaterThan(0);
    expect(podHits).toBe(1);
    // 993.37 x 20^2 / 5e7 = 0.008: below the 0.05 scrape floor.
    expect(playerHits).toBe(0);
    expect(world.store.get(pod)).toBeUndefined();
  });

  it("a pod hit at 10 m/s survives with its energy lowered by m1 x v^2 / 5e7", () => {
    const player = flyingPlayer(10);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const pod = spawnPiece(world, vec(FAR.x, FAR.y, FAR.z - 120));
    let podHit: Extract<SimEvent, { kind: "shipHit" }> | undefined;
    for (let tick = 0; tick < 1200 && podHit === undefined; tick += 1) {
      podHit = hits(step(player, world, combat, withDebris())).find(
        (hit) => hit.target === pod,
      );
    }
    expect(podHit?.amount).toBeCloseTo((PLAYER_MASS_KG * 100) / 5e7, 4);
    expect(entityOf(world, pod).energy).toBeCloseTo(
      1 - (podHit?.amount ?? 0),
      9,
    );
  });

  it("a plate rams a pod: both masses from debrisMassOf, the response as collideWithShip gives it", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const at = vec(FAR.x + 3000, FAR.y, FAR.z);
    const pod = spawnPiece(world, at);
    const plate = spawnPiece(
      world,
      vec(at.x - 8, at.y, at.z),
      vec(30, 0, 0),
      "alloy",
    );
    const podEntity = entityOf(world, pod);
    const plateEntity = entityOf(world, plate);
    const podMass = debrisMassOf(podEntity, DEBRIS);
    const plateMass = debrisMassOf(plateEntity, DEBRIS);
    expect(podMass).toBeCloseTo(993.37, 6);
    expect(plateMass).toBeCloseTo(273.44, 6);
    // The plate is nearer the player: it is self.
    const expected = collideWithShip({
      self: {
        position: plateEntity.position,
        velocity: vec(30, 0, 0),
        mass: plateMass ?? 0,
        energy: 1,
        destroyable: true,
      },
      other: {
        position: podEntity.position,
        velocity: vec(0, 0, 0),
        mass: podMass ?? 0,
        energy: 1,
        destroyable: true,
      },
    });
    if (expected.kind !== "collided") throw new Error("expected a contact");
    const { records } = resolveCollisions(world, player, combat, withDebris());
    expect(records.map((r) => [r.target, r.source, r.amount])).toEqual([
      [plate, pod, expected.dam1],
      [pod, plate, expected.dam2],
    ]);
    expect(plateEntity.velocity).toEqual(add(vec(30, 0, 0), expected.dv1));
    expect(podEntity.velocity).toEqual(add(vec(0, 0, 0), expected.dvOtherBody));
  });

  it("two NPCs collide with the one nearer the player as self", () => {
    const orders = [-1, 1].map((side) => {
      const player = flyingPlayer();
      player.position = vec(FAR.x, FAR.y, FAR.z + side * 5000);
      const combat = createPlayerCombatState();
      const world = createWorld(7);
      const a = spawnShip(world, vec(FAR.x, FAR.y, FAR.z - 40));
      const b = spawnShip(world, vec(FAR.x, FAR.y, FAR.z + 40));
      entityOf(world, a).velocity = vec(0, 0, 30);
      const { records } = resolveCollisions(world, player, combat, options());
      return { a, b, first: records[0]?.target };
    });
    // The player behind (-Z side): a is nearer; in front: b is nearer.
    expect(orders[0]?.first).toBe(orders[0]?.a);
    expect(orders[1]?.first).toBe(orders[1]?.b);
  });

  it("a Krait rammed to zero is destroyed through killShip with its debris, credited to the player", () => {
    const player = flyingPlayer(350);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const krait = spawnShip(world, vec(FAR.x, FAR.y, FAR.z - 200));
    let kills: Extract<SimEvent, { kind: "shipDestroyed" }>[] = [];
    let pieces = 0;
    for (let tick = 0; tick < 120 && kills.length === 0; tick += 1) {
      kills = destroyed(step(player, world, combat, withDebris()));
      pieces = world.store.live.filter(
        (e) => e.kind === "cargo" || e.kind === "wreckage",
      ).length;
    }
    expect(kills).toEqual([
      expect.objectContaining({ id: krait, killer: PLAYER_ID }),
    ]);
    expect(world.store.get(krait)).toBeUndefined();
    expect(pieces).toBeGreaterThan(0);
    // The player is never destroyable: 228.6 damage, energy floored, alive.
    expect(combat.energy).toBeGreaterThan(0);
    expect(combat.energy).toBeLessThan(256);
    expect(player.mode).toBe("inFlight");
  });

  it("two Kraits that kill each other in one ram: both die on the same tick, credited by the ledger's same-tick rule (D-10 asymmetry)", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const at = vec(FAR.x + 5000, FAR.y, FAR.z);
    // Already overlapping, closing at 100 m/s (the drift pass brakes each by
    // 175 / 120 m/s before the stage: 18.66 x (97.08 / 100)^2 = 17.6 > 10).
    const a = spawnShip(world, vec(at.x - 20, at.y, at.z), "krait", 10);
    const b = spawnShip(world, vec(at.x + 20, at.y, at.z), "krait", 10);
    entityOf(world, a).velocity = vec(50, 0, 0);
    entityOf(world, b).velocity = vec(-50, 0, 0);
    let kills: Extract<SimEvent, { kind: "shipDestroyed" }>[] = [];
    for (let tick = 0; tick < 240 && kills.length === 0; tick += 1) {
      kills = destroyed(step(player, world, combat, withDebris()));
    }
    // Ascending victim id: the lower id is credited to the other ship, which
    // is dead by the time the higher id is killed, so that one carries nobody.
    expect(kills.map((k) => [k.id, k.killer])).toEqual([
      [a, b],
      [b, NO_ENTITY],
    ]);
    expect(world.store.get(a)).toBeUndefined();
    expect(world.store.get(b)).toBeUndefined();
  });
});

describe("the exclusions", () => {
  it("a launching player overlapping a pod makes no pair (A3)", () => {
    const player = initFlightState(layout);
    stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    expect(player.mode).toBe("launching");
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const pod = spawnPiece(world, player.position, vec(0, 0, 20));
    spawnPiece(world, vec(player.position.x + 1e5, 0, 0));
    const { records } = resolveCollisions(world, player, combat, withDebris());
    expect(records).toEqual([]);
    expect(entityOf(world, pod).velocity).toEqual(vec(0, 0, 20));
    expect(player.drift).toEqual(vec(0, 0, 0));
  });

  it("the station is never a collider: a ship at its centre is untouched", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const krait = spawnShip(world, layout.station.position);
    entityOf(world, krait).velocity = vec(0, 0, 40);
    const { records } = resolveCollisions(world, player, combat, options());
    expect(records).toEqual([]);
    expect(entityOf(world, krait).velocity).toEqual(vec(0, 0, 40));
  });

  it("wreckage never takes part, even on a hull and mass that would collide", () => {
    const player = flyingPlayer(20);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const wreck = spawnPiece(
      world,
      vec(FAR.x, FAR.y, FAR.z - 70),
      vec(0, 0, 0),
      "barrel",
      "wreckage",
    );
    const { records } = resolveCollisions(world, player, combat, withDebris());
    expect(records).toEqual([]);
    expect(entityOf(world, wreck).velocity).toEqual(vec(0, 0, 0));
  });

  it("a pod without debris content and a ship with no mass are skipped", () => {
    const player = flyingPlayer(20);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnPiece(world, vec(FAR.x, FAR.y, FAR.z - 70));
    expect(resolveCollisions(world, player, combat, options()).records).toEqual(
      [],
    );

    const nameless = new Map(HULLS);
    const krait = HULLS.get("krait");
    if (krait === undefined) throw new Error("no krait hull");
    nameless.set("nonesuch", krait);
    const world2 = createWorld(7);
    spawnShip(world2, vec(FAR.x, FAR.y, FAR.z - 60), "nonesuch");
    const noMass: StepOptions = {
      npcFlight: NPC_FLIGHT,
      combat: {
        mounts: DEFAULT_LASER_MOUNTS,
        hulls: nameless,
        collisions: true,
      },
    };
    expect(resolveCollisions(world2, player, combat, noMass).records).toEqual(
      [],
    );
  });

  it("contact at exactly the radius sum is no pair (the strict sphere test)", () => {
    // Solid cubes of half-width 10 whose spheres are drawn at 10: the cubes
    // touch face to face at 20 m, where the sphere test already refuses.
    const cubes = new Map(HULLS);
    cubes.set("cube", {
      collisionRadius: 10,
      octree: { radius: 10, depth: 0, root: -1 },
    });
    const cubeOptions: StepOptions = {
      hyperspace: {
        fuel: 0,
        origin: { id: "test", x: 0, y: 0 },
        shipMasses: [{ specKey: "cube", mass: 1e6 }],
      },
      combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: cubes, collisions: true },
    };
    const counts = [20, 19.999].map((gap) => {
      const player = flyingPlayer();
      const world = createWorld(7);
      const at = vec(FAR.x + 5000, FAR.y, FAR.z);
      const a = spawnShip(world, at, "cube", 100);
      spawnShip(world, vec(at.x + gap, at.y, at.z), "cube", 100);
      entityOf(world, a).velocity = vec(10, 0, 0);
      return resolveCollisions(world, player, undefined, cubeOptions).records
        .length;
    });
    expect(counts).toEqual([0, 2]);
  });
});

describe("docking is unchanged with collisions on (DOCK-09)", () => {
  const geometry = laveDockGeometry();
  const K = portFrame(layout, 0).k;

  /**
   * The integrated manual dock (`tests/sim/dock-integrated.test.ts`) through
   * `stepSim` with a world holding one far Krait and the full hull table,
   * optionally after a drift toward the station hull. Returns the world hash
   * of every tick and the counts at the end.
   */
  function replay(
    collisions: boolean,
    drift: number,
  ): {
    hashes: string[];
    bounces: number;
    docks: number;
    mode: string;
  } {
    const stepOptions: StepOptions = { ...options(collisions), dock: geometry };
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, add(layout.station.position, vec(1e5, 0, 0)));
    const hashes: string[] = [];
    const run = (commands: Parameters<typeof stepSim>[5] = []): void => {
      stepSim(
        player,
        world,
        layout,
        config,
        ZERO_INTENT,
        commands,
        DT,
        stepOptions,
        combat,
      );
      hashes.push(hashWorld(player, world, combat));
    };
    run([{ kind: "launch" }]);
    for (let tick = 0; tick < 400 && player.mode === "launching"; tick += 1) {
      run();
    }
    for (let tick = 0; tick < 240; tick += 1) run();

    if (drift > 0) {
      // In front of the hull beside the slot, drifting into it (18-10's
      // contact branch: one bounce at the face).
      const front = placeShipInPortFrame(layout, geometry, {
        nosePastPlane: -(geometry.contactPort.zMax + 1),
        rollFromMatched: 0,
        lateral: 300,
        stationAngle: player.stationAngle,
      });
      player.position = front.position;
      player.orientation = front.orientation;
      player.speed = 0;
      player.impulse = vec(0, 0, 0);
      player.drift = vec(-K.x * drift, -K.y * drift, -K.z * drift);
      for (let tick = 0; tick < 600; tick += 1) run();
    }

    const retry = placeShipInPortFrame(layout, geometry, {
      nosePastPlane: 90,
      rollFromMatched: 0,
      stationAngle: player.stationAngle,
    });
    player.position = retry.position;
    player.orientation = retry.orientation;
    player.speed = 0;
    player.impulse = vec(0, 0, 0);
    player.drift = vec(0, 0, 0);
    for (let tick = 0; tick < 10 && player.mode === "inFlight"; tick += 1)
      run();
    return {
      hashes,
      bounces: player.bounceCount,
      docks: player.dockCount,
      mode: player.mode,
    };
  }

  it("a manual dock at zero drift is byte-identical with collisions on and off", () => {
    const on = replay(true, 0);
    const off = replay(false, 0);
    expect(on.mode).toBe("docked");
    expect(on.docks).toBe(1);
    expect(on.hashes).toEqual(off.hashes);
  });

  it("a 68 m/s drift into the hull bounces once, then docks, byte-identical on and off (a regression test of 18-10's contact branch)", () => {
    const on = replay(true, 68);
    const off = replay(false, 68);
    expect(on.bounces).toBe(1);
    expect(on.mode).toBe("docked");
    expect(on.hashes).toEqual(off.hashes);
  });
});
