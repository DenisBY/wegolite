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
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import type { EntityId } from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
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
