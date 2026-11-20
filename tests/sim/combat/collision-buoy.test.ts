// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The buoys in the collision stage (CBT-18, PD-01, PD-02, plan 18-18).
 *
 * A buoy is a mover (PD-02): a ram's velocity change goes to
 * `World.buoys.<key>.velocity`, its nudge to the offset, and the buoy then
 * brakes by its own thrust (plan 18-17). Its frangible subentity (PD-01)
 * answers a contact the hull does not make: the subentity's mass, its energy,
 * the damage on its own target id (6 or 7), the buoy moved and the subentity
 * left at its authored offset. Detached, it takes no part, and the buoy's
 * collision mass drops to `NAV_BUOY_HULL_MASS`.
 *
 * The response numbers are the 18-03 fixtures `collide-player-buoy-100`
 * (`tests/oracles/combat/response/fixtures/collide.json`) and the buoy row of
 * `braking-npc.json` (`brake-ship-buoy-thrust-100-from-100`): a 100 m/s ram
 * carries the nav buoy the 8.333 m nudge plus 9.583 m of braked drift.
 */

import { describe, expect, it } from "vitest";

import { PLAYER_HULL_KEY } from "../../../src/sim/combat/aim.js";
import {
  doOctreesCollide,
  resolveCollisions,
} from "../../../src/sim/combat/collide.js";
import { PLAYER_MASS_KG } from "../../../src/sim/combat/constants.js";
import type { HullTable } from "../../../src/sim/combat/hit.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { collideWithShip } from "../../../src/sim/combat/response.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import {
  BUOY_SUBENTITY_MASS,
  NAV_BUOY_HULL_MASS,
  NAV_BUOY_MASS,
} from "../../../src/sim/hyperspace/countdown.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import {
  DEBRIS_MAX_ENERGY,
  debrisMassOf,
} from "../../../src/sim/world/debris.js";
import {
  NAV_BUOY_SUBENTITY_ID,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import type { EntityId } from "../../../src/sim/world/ids.js";
import {
  hashWorld,
  serializeBuoyStates,
  serializeStaticHealth,
} from "../../../src/sim/world/serialize.js";
import { buoyOrientation } from "../../../src/sim/world/statics.js";
import {
  createWorld,
  isPristineBuoyStates,
  isPristineStaticHealth,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture, FIXTURE_POD } from "../../helpers/debris-fixture.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const { layout, config } = laveFixture();
const HULLS: HullTable = fullHullTable();
const DEBRIS = debrisFixture();
const NAV_BUOY = layout.navBuoy.position;

/** `collide-player-buoy-100` (18-03): the C's numbers for a 100 m/s ram. */
const FIXTURE_100 = {
  dam1: 139.7382354736328,
  dam2: 42.94753646850586,
  v1a: 180.3800506591797,
  nudgeOther: 8.333333969116211,
  nudgeSelf: 15.031671524047852,
};
/** `brake-ship-buoy-thrust-100-from-100` (18-03): the braked drift. */
const BUOY_BRAKE_FROM_100 = 9.583335928122201;

/** The app's options: hulls with the statics, the flight table, debris. */
function options(hulls: HullTable = HULLS): StepOptions {
  return {
    npcFlight: realNpcFlightTable(),
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls,
      debris: DEBRIS,
      collisions: true,
    },
  };
}

/** A player launched, skipped to flight, at `position` facing -Z. */
function playerAt(position: Vec3, speed: number): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = position;
  state.orientation = identity();
  state.speed = speed;
  return state;
}

function step(
  player: FlightState,
  world: World,
  combat: PlayerCombatState,
): SimEvent[] {
  return stepSim(
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
}

function hits(
  events: readonly SimEvent[],
): Extract<SimEvent, { kind: "shipHit" }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: "shipHit" }> =>
      event.kind === "shipHit",
  );
}

/**
 * The largest distance on +Z from the nav buoy, in 0.01 m steps, at which
 * the player's Cobra (facing -Z) first touches the buoy at its tumble of
 * `flightTime`.
 */
function firstContactOnZ(flightTime: number): number {
  const cobra = HULLS.get(PLAYER_HULL_KEY);
  const buoy = HULLS.get("buoy");
  if (cobra === undefined || buoy === undefined) throw new Error("no hulls");
  const buoyPose = {
    position: NAV_BUOY,
    orientation: buoyOrientation(flightTime),
  };
  for (let d = 200; d > 0; d -= 0.01) {
    const contact = doOctreesCollide(
      cobra,
      {
        position: vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + d),
        orientation: identity(),
      },
      buoy,
      buoyPose,
    );
    if (contact !== null) return d;
  }
  throw new Error("no contact on +Z");
}

/** A pod (`barrel`) at `position` with `velocity`. */
function spawnPod(world: World, position: Vec3, velocity: Vec3): EntityId {
  const result = spawnEntity(
    world,
    {
      kind: "cargo",
      specKey: "barrel",
      scanClass: "CLASS_CARGO",
      position,
      orientation: identity(),
      radius: FIXTURE_POD.radius,
      maxEnergy: DEBRIS_MAX_ENERGY,
      velocity,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

/**
 * A point inside the buoy hull's cavity, buoy at the identity pose, where a
 * pod's octree touches the subentity and not the hull (found by a 2.5 m grid
 * scan of `doOctreesCollide` with `fullHullTable()`).
 */
const CAVITY_OFFSET = vec(-27.5, -5, 0);

describe("the player rams the nav buoy (tracer, PD-02)", () => {
  it("applies collideWithShip's response at once: the buoy's velocity and offset in World.buoys, the damage queued", () => {
    const d = firstContactOnZ(0);
    const player = playerAt(vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + d), 100);
    player.flightTime = 0;
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const playerBefore = { ...player.position };

    const { records } = resolveCollisions(
      world,
      player,
      combat,
      options(),
      layout,
    );

    expect(records.map((r) => [r.kind, r.target, r.source])).toEqual([
      ["scrape", PLAYER_ID, STATION_NAV_BUOY_ID],
      ["scrape", STATION_NAV_BUOY_ID, PLAYER_ID],
    ]);
    expect(records[0]?.amount).toBe(FIXTURE_100.dam1);
    expect(records[1]?.amount).toBe(FIXTURE_100.dam2);
    expect(records[0]?.sourcePosition).toEqual(NAV_BUOY);
    expect(records[1]?.sourcePosition).toEqual(playerBefore);
    const buoy = world.buoys.navBuoy;
    expect(buoy.velocity.z).toBe(-100);
    expect(buoy.velocity.x + 0).toBe(0);
    expect(buoy.velocity.y + 0).toBe(0);
    expect(buoy.offset.z).toBe(-FIXTURE_100.nudgeOther);
    expect(player.drift.z).toBe(FIXTURE_100.v1a);
    expect(player.position.z).toBeCloseTo(
      playerBefore.z - FIXTURE_100.nudgeSelf,
      9,
    );
    // The witchpoint buoy is untouched.
    expect(world.buoys.witchpoint.offset).toEqual(vec(0, 0, 0));
  });

  it("through stepSim: damages both once, carries the buoy 8.333 m plus 9.583 m of braking, and the hash carries both lines", () => {
    const player = playerAt(vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + 300), 100);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const energyBefore = combat.energy + combat.fwdShield + combat.aftShield;
    const cabinBefore = combat.cabinTemp;

    let contact: Extract<SimEvent, { kind: "shipHit" }>[] = [];
    for (let tick = 0; tick < 600 && contact.length === 0; tick += 1) {
      contact = hits(step(player, world, combat));
    }
    expect(contact.map((hit) => [hit.target, hit.source])).toEqual([
      [PLAYER_ID, STATION_NAV_BUOY_ID],
      [STATION_NAV_BUOY_ID, PLAYER_ID],
    ]);
    expect(contact[0]?.amount).toBe(FIXTURE_100.dam1);
    expect(contact[1]?.amount).toBe(FIXTURE_100.dam2);
    expect(world.staticHealth.navBuoy).toBeCloseTo(250 - FIXTURE_100.dam2, 9);
    expect(combat.energy + combat.fwdShield + combat.aftShield).toBeCloseTo(
      energyBefore - FIXTURE_100.dam1,
      9,
    );
    expect(combat.cabinTemp).toBe(cabinBefore);
    // Both lines enter the hash: neither state is pristine any more.
    expect(isPristineStaticHealth(world.staticHealth)).toBe(false);
    expect(isPristineBuoyStates(world.buoys)).toBe(false);
    expect(serializeStaticHealth(world.staticHealth)).toBe(
      `staticHealth:25000.000000,250.000000,${(250 - FIXTURE_100.dam2).toFixed(6)}`,
    );
    expect(serializeBuoyStates(world.buoys)).toMatch(/^buoys:.*\|offset /);
    const pristine = createWorld(7);
    expect(hashWorld(player, world, combat)).not.toBe(
      hashWorld(player, pristine, combat),
    );

    player.speed = 0;
    let later = 0;
    for (let tick = 0; tick < 240; tick += 1) {
      later += hits(step(player, world, combat)).length;
    }
    expect(later).toBe(0);
    const buoy = world.buoys.navBuoy;
    expect(buoy.velocity).toEqual(vec(0, 0, 0));
    expect(buoy.offset.z).toBeCloseTo(
      -(FIXTURE_100.nudgeOther + BUOY_BRAKE_FROM_100),
      6,
    );
    expect(buoy.offset.x + 0).toBe(0);
    expect(buoy.offset.y + 0).toBe(0);
  });

  it("at 250 m/s the buoy is destroyed, credited to the player; a destroyed buoy is no collider and never moves", () => {
    const player = playerAt(vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + 400), 250);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    let events: SimEvent[] = [];
    for (let tick = 0; tick < 600 && hits(events).length === 0; tick += 1) {
      events = step(player, world, combat);
    }
    const destroyed = events.filter((e) => e.kind === "shipDestroyed");
    expect(destroyed).toEqual([
      expect.objectContaining({
        id: STATION_NAV_BUOY_ID,
        killer: PLAYER_ID,
      }),
    ]);
    expect(world.staticHealth.navBuoy).toBe(0);
    // dam2 = 214,737.6875 x 250^2 / 5e7 = 268.4 > 250: no nudge.
    const offset = { ...world.buoys.navBuoy.offset };
    expect(offset).toEqual(vec(0, 0, 0));
    let later = 0;
    for (let tick = 0; tick < 240; tick += 1) {
      later += hits(step(player, world, combat)).length;
    }
    expect(later).toBe(0);
    expect(world.buoys.navBuoy.offset).toEqual(offset);
    // The player flew through where the buoy was.
    expect(player.position.z).toBeLessThan(NAV_BUOY.z - 200);
  });
});

describe("the buoy's frangible subentity (PD-01)", () => {
  /**
   * The hulls with the barrel's collision radius raised above the buoy's, so
   * that a pod at the buoy's z is Oolite's prime (`compareZOrder`: z minus
   * the collision radius) and its octree, touching the subentity only, names
   * the subentity. With the real barrel the buoy is the prime at that z and
   * the contact is the buoy's body (owner decision 2026-11-20, the last test
   * below). In a scratch scan (2026-11-20) no hull of the test table reached
   * the subentity first as the prime, nose first from 400 directions with
   * the buoy unturned.
   * The response does not read the radius.
   */
  const PRIME_BARREL_HULLS: HullTable = (() => {
    const barrel = HULLS.get("barrel");
    const buoy = HULLS.get("buoy");
    if (barrel === undefined || buoy === undefined) throw new Error("hulls");
    const hulls = new Map(HULLS);
    hulls.set("barrel", {
      ...barrel,
      collisionRadius: buoy.collisionRadius + 1,
    });
    return hulls;
  })();

  /** A pod in the buoy's cavity closing on its centre at `speed`. */
  function cavityScene(speed: number): {
    player: FlightState;
    combat: PlayerCombatState;
    world: World;
    pod: EntityId;
    podAt: Vec3;
    podVelocity: Vec3;
  } {
    // The player far out on the pod's side, so the pod ranks before the buoy.
    const player = playerAt(vec(NAV_BUOY.x - 5000, NAV_BUOY.y, NAV_BUOY.z), 0);
    player.flightTime = 0;
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const podAt = vec(
      NAV_BUOY.x + CAVITY_OFFSET.x,
      NAV_BUOY.y + CAVITY_OFFSET.y,
      NAV_BUOY.z + CAVITY_OFFSET.z,
    );
    const toCentre = Math.hypot(CAVITY_OFFSET.x, CAVITY_OFFSET.y);
    const podVelocity = vec(
      (-CAVITY_OFFSET.x / toCentre) * speed,
      (-CAVITY_OFFSET.y / toCentre) * speed,
      0,
    );
    const pod = spawnPod(world, podAt, podVelocity);
    return { player, combat, world, pod, podAt, podVelocity };
  }

  it("the geometry touches the subentity only", () => {
    const barrel = HULLS.get("barrel");
    const buoy = HULLS.get("buoy");
    if (barrel === undefined || buoy === undefined) throw new Error("hulls");
    const contact = doOctreesCollide(
      barrel,
      { position: CAVITY_OFFSET, orientation: identity() },
      buoy,
      { position: vec(0, 0, 0), orientation: identity() },
    );
    expect(contact).toEqual({ kind: "subentity", index: 0 });
  });

  it("a contact on the subentity: its mass and energy, the damage on id 7, the buoy moved, the subentity at its authored offset", () => {
    const { player, combat, world, pod, podAt, podVelocity } = cavityScene(60);
    const podEntity = world.store.get(pod);
    if (podEntity === undefined) throw new Error("no pod");
    const podMass = debrisMassOf(podEntity, DEBRIS) ?? 0;
    const expected = collideWithShip({
      self: {
        position: podAt,
        velocity: podVelocity,
        mass: podMass,
        energy: DEBRIS_MAX_ENERGY,
        destroyable: true,
      },
      other: {
        position: NAV_BUOY,
        velocity: vec(0, 0, 0),
        mass: BUOY_SUBENTITY_MASS,
        energy: 200,
        destroyable: true,
        parentVelocity: vec(0, 0, 0),
        parentFrangible: true,
      },
    });
    if (expected.kind !== "collided") throw new Error("expected a contact");
    expect(expected.applied2).toBe(true);
    expect(expected.nudged).toBe(true);

    const { records } = resolveCollisions(
      world,
      player,
      combat,
      options(PRIME_BARREL_HULLS),
      layout,
    );

    expect(records.map((r) => [r.kind, r.target, r.source, r.amount])).toEqual([
      ["scrape", pod, STATION_NAV_BUOY_ID, expected.dam1],
      ["scrape", NAV_BUOY_SUBENTITY_ID, pod, expected.dam2],
    ]);
    const buoy = world.buoys.navBuoy;
    // The buoy takes dvOtherBody; the subentity's own nudge is not applied.
    expect(buoy.velocity.x).toBe(expected.dvOtherBody.x);
    expect(buoy.velocity.y).toBe(expected.dvOtherBody.y);
    expect(buoy.offset).toEqual(vec(0, 0, 0));
    expect(expected.dpOtherSubentity).not.toEqual(vec(0, 0, 0));
    // No 1 % bleed-through on the buoy: a ram routes all of dam2.
    expect(records.some((r) => r.target === STATION_NAV_BUOY_ID)).toBe(false);
  });

  it("a rammer destroyed by the subentity: the buoy keeps +vel2a, the subentity's reversal is not applied", () => {
    const { player, combat, world } = cavityScene(100);
    resolveCollisions(
      world,
      player,
      combat,
      options(PRIME_BARREL_HULLS),
      layout,
    );
    const buoy = world.buoys.navBuoy;
    const toCentre = Math.hypot(CAVITY_OFFSET.x, CAVITY_OFFSET.y);
    // vel2a = loc x v2b, loc from the pod to the subentity's centre.
    expect(buoy.velocity.x).toBeCloseTo((-CAVITY_OFFSET.x / toCentre) * 100, 4);
    expect(buoy.velocity.y).toBeCloseTo((-CAVITY_OFFSET.y / toCentre) * 100, 4);
    expect(buoy.offset).toEqual(vec(0, 0, 0));
  });

  it("detached, the same geometry is no contact", () => {
    const { player, combat, world, pod } = cavityScene(60);
    world.buoys.navBuoy.subentityEnergy = 0;
    const podBefore = { ...world.store.get(pod)?.velocity };
    const { records } = resolveCollisions(
      world,
      player,
      combat,
      options(),
      layout,
    );
    expect(records).toEqual([]);
    expect(world.buoys.navBuoy.velocity).toEqual(vec(0, 0, 0));
    expect(world.store.get(pod)?.velocity).toEqual(podBefore);
  });

  it("detached, a hull ram uses the buoy's mass less the subentity's: NAV_BUOY_HULL_MASS", () => {
    expect(NAV_BUOY_HULL_MASS).toBe(
      Math.fround(NAV_BUOY_MASS - BUOY_SUBENTITY_MASS),
    );
    const d = firstContactOnZ(0);
    const player = playerAt(vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + d), 100);
    player.flightTime = 0;
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    world.buoys.navBuoy.subentityEnergy = 0;
    const expected = collideWithShip({
      self: {
        position: player.position,
        velocity: vec(0, 0, -100),
        mass: PLAYER_MASS_KG,
        energy: combat.energy,
        destroyable: false,
      },
      other: {
        position: NAV_BUOY,
        velocity: vec(0, 0, 0),
        mass: NAV_BUOY_HULL_MASS,
        energy: 250,
        destroyable: true,
      },
    });
    if (expected.kind !== "collided") throw new Error("expected a contact");
    const { records } = resolveCollisions(
      world,
      player,
      combat,
      options(),
      layout,
    );
    expect(records.map((r) => [r.target, r.amount])).toEqual([
      [PLAYER_ID, expected.dam1],
      [STATION_NAV_BUOY_ID, expected.dam2],
    ]);
    expect(expected.dam1).not.toBe(FIXTURE_100.dam1);
  });

  it("the real barrel in the cavity: Oolite's prime is the buoy, so the contact is the buoy's body (owner decision 2026-11-20)", () => {
    // Re-pinned: with the lower rank as the prime (before 2026-11-20) the pod
    // named the subentity (mass BUOY_SUBENTITY_MASS, dam2 on id 7). Cause:
    // Oolite prime order (owner decision 2026-11-20). The buoy, first in
    // Oolite's z list at the same z (larger radius), tests its octree first:
    // its subentity touches the pod's hull, so the contact names the pod's
    // hull, and the pod, ranked first, calls with the buoy's body
    // (`CollisionRegion.m:345-358`).
    const { player, combat, world, pod, podAt, podVelocity } = cavityScene(60);
    const podEntity = world.store.get(pod);
    if (podEntity === undefined) throw new Error("no pod");
    const expected = collideWithShip({
      self: {
        position: podAt,
        velocity: podVelocity,
        mass: debrisMassOf(podEntity, DEBRIS) ?? 0,
        energy: DEBRIS_MAX_ENERGY,
        destroyable: true,
      },
      other: {
        position: NAV_BUOY,
        velocity: vec(0, 0, 0),
        mass: NAV_BUOY_MASS,
        energy: 250,
        destroyable: true,
      },
    });
    if (expected.kind !== "collided") throw new Error("expected a contact");

    const { records, stats } = resolveCollisions(
      world,
      player,
      combat,
      options(),
      layout,
    );

    expect(stats.contacts).toBe(1);
    expect(records.map((r) => [r.kind, r.target, r.source, r.amount])).toEqual([
      ["scrape", pod, STATION_NAV_BUOY_ID, expected.dam1],
      ["scrape", STATION_NAV_BUOY_ID, pod, expected.dam2],
    ]);
    expect(records.some((r) => r.target === NAV_BUOY_SUBENTITY_ID)).toBe(false);
    const buoy = world.buoys.navBuoy;
    expect(buoy.velocity.x).toBe(expected.dvOtherBody.x);
    expect(buoy.velocity.y).toBe(expected.dvOtherBody.y);
    expect(buoy.offset.x).toBe(expected.dpOther.x);
    expect(buoy.offset.y).toBe(expected.dpOther.y);
  });
});
