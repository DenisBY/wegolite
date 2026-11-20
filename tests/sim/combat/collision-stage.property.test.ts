// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Totality of the collision stage with buoys (CBT-18, probe edge cases, plan
 * 18-18; T-18-44).
 *
 * Generated worlds of up to 12 colliders around the nav buoy (the player,
 * ships, pods and both buoys) with NaN, plus or minus Infinity and plus or
 * minus 1e308 in positions, velocities and buoy offsets, coincident centres,
 * a zero mass, destroyed buoys and detached subentities: `resolveCollisions`
 * never throws, every value it writes is finite and inside its bound
 * (`MAX_ENTITY_VELOCITY`, `MAX_ENTITY_MAGNITUDE`, `MAX_BUOY_OFFSET`), every
 * record carries a finite positive amount, and a destroyed buoy never moves.
 * Directed cases: three bodies touching in one tick resolve in rank order and
 * identically on a replay; contact at exactly the radius sum is no pair.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PLAYER_HULL_KEY } from "../../../src/sim/combat/aim.js";
import { resolveCollisions } from "../../../src/sim/combat/collide.js";
import type { HullTable } from "../../../src/sim/combat/hit.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import { DT } from "../../../src/sim/time.js";
import { DEBRIS_MAX_ENERGY } from "../../../src/sim/world/debris.js";
import {
  NAV_BUOY_SUBENTITY_ID,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
  WITCHPOINT_BUOY_SUBENTITY_ID,
} from "../../../src/sim/world/ids.js";
import {
  MAX_BUOY_OFFSET,
  MAX_ENTITY_MAGNITUDE,
  MAX_ENTITY_VELOCITY,
} from "../../../src/sim/world/limits.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture, FIXTURE_POD } from "../../helpers/debris-fixture.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const { layout, config } = laveFixture();
const HULLS: HullTable = fullHullTable();
const NAV_BUOY = layout.navBuoy.position;
const FLIGHT = realNpcFlightTable();
/** The flight table with the Krait's mass zeroed: a Krait is no collider. */
const FLIGHT_ZERO_KRAIT: readonly NpcFlightStats[] = FLIGHT.map((row) =>
  row.specKey === "krait" ? { ...row, mass: 0 } : row,
);
const KINDS = ["krait", "adder", "sidewinder", "barrel"] as const;
const SPECIAL = [Number.NaN, Infinity, -Infinity, 1e308, -1e308] as const;

function options(flight: readonly NpcFlightStats[]): StepOptions {
  return {
    npcFlight: flight,
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      debris: debrisFixture(),
      collisions: true,
    },
  };
}

function flyingPlayer(position: Vec3, speed: number): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = position;
  state.orientation = identity();
  state.speed = speed;
  return state;
}

/** A component: usually a finite value in `[-range, range]`, sometimes poison. */
function componentArb(range: number): fc.Arbitrary<number> {
  return fc.oneof(
    {
      weight: 8,
      arbitrary: fc.double({ min: -range, max: range, noNaN: true }),
    },
    { weight: 1, arbitrary: fc.constantFrom(...SPECIAL) },
  );
}

function vecArb(range: number): fc.Arbitrary<Vec3> {
  return fc
    .tuple(componentArb(range), componentArb(range), componentArb(range))
    .map(([x, y, z]) => vec(x, y, z));
}

const bodyArb = fc.record({
  kind: fc.constantFrom(...KINDS),
  /** "near": NB + offset; "coincident": the nav buoy's centre or body 0's. */
  where: fc.constantFrom("near", "near", "near", "atBuoy", "atFirst"),
  offset: vecArb(150),
  velocity: vecArb(400),
});

const buoyArb = fc.record({
  offset: fc.oneof(
    { weight: 6, arbitrary: fc.constant(vec(0, 0, 0)) },
    { weight: 3, arbitrary: vecArb(60) },
  ),
  velocity: vecArb(300),
  health: fc.constantFrom(250, 250, 1, 0),
  subentityEnergy: fc.constantFrom(200, 200, 0),
});

const worldArb = fc.record({
  bodies: fc.array(bodyArb, { maxLength: 9 }),
  navBuoy: buoyArb,
  witchpoint: buoyArb,
  player: fc.record({ offset: vecArb(200), speed: componentArb(400) }),
  zeroKrait: fc.boolean(),
});

type WorldCase = typeof worldArb extends fc.Arbitrary<infer T> ? T : never;

function build(c: WorldCase): { world: World; player: FlightState } {
  const world = createWorld(5);
  let first: Vec3 | undefined;
  for (const body of c.bodies) {
    const position =
      body.where === "atBuoy"
        ? NAV_BUOY
        : body.where === "atFirst" && first !== undefined
          ? first
          : vec(
              NAV_BUOY.x + body.offset.x,
              NAV_BUOY.y + body.offset.y,
              NAV_BUOY.z + body.offset.z,
            );
    first ??= position;
    const pod = body.kind === "barrel";
    const result = spawnEntity(
      world,
      {
        kind: pod ? "cargo" : "ship",
        specKey: body.kind,
        scanClass: pod ? "CLASS_CARGO" : "CLASS_NEUTRAL",
        position: NAV_BUOY,
        orientation: identity(),
        radius: pod ? FIXTURE_POD.radius : 30,
        maxEnergy: pod ? DEBRIS_MAX_ENERGY : 50,
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    // Poison goes in after the spawn, which would refuse it.
    result.entity.position = position;
    result.entity.velocity = body.velocity;
  }
  for (const key of ["navBuoy", "witchpoint"] as const) {
    const b = c[key];
    world.buoys[key].offset = b.offset;
    world.buoys[key].velocity = b.velocity;
    world.buoys[key].subentityEnergy = b.subentityEnergy;
    world.staticHealth[key] = b.health;
  }
  const player = flyingPlayer(
    vec(
      NAV_BUOY.x + c.player.offset.x,
      NAV_BUOY.y + c.player.offset.y,
      NAV_BUOY.z + c.player.offset.z,
    ),
    0,
  );
  player.speed = c.player.speed;
  return { world, player };
}

function finiteWithin(v: Vec3, limit: number): boolean {
  return [v.x, v.y, v.z].every(
    (n) => Number.isFinite(n) && Math.abs(n) <= limit,
  );
}

function sameVec(a: Vec3, b: Vec3): boolean {
  return Object.is(a.x, b.x) && Object.is(a.y, b.y) && Object.is(a.z, b.z);
}

const KNOWN_TARGETS = new Set([
  PLAYER_ID,
  WITCHPOINT_BUOY_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_SUBENTITY_ID,
  NAV_BUOY_SUBENTITY_ID,
]);

describe("the collision stage is total with buoys (T-18-44)", () => {
  it("never throws; every written value is finite and bounded; records are finite; a destroyed buoy never moves", () => {
    fc.assert(
      fc.property(worldArb, (c) => {
        const { world, player } = build(c);
        const before = {
          entities: world.store.live.map((e) => ({
            id: e.id,
            position: { ...e.position },
            velocity: { ...e.velocity },
          })),
          buoys: {
            navBuoy: {
              offset: { ...world.buoys.navBuoy.offset },
              velocity: { ...world.buoys.navBuoy.velocity },
            },
            witchpoint: {
              offset: { ...world.buoys.witchpoint.offset },
              velocity: { ...world.buoys.witchpoint.velocity },
            },
          },
          drift: { ...player.drift },
          position: { ...player.position },
        };
        const { records, stats } = resolveCollisions(
          world,
          player,
          createPlayerCombatState(),
          options(c.zeroKrait ? FLIGHT_ZERO_KRAIT : FLIGHT),
          layout,
        );
        expect(stats.contacts).toBeLessThanOrEqual(stats.narrowTests);
        expect(stats.narrowTests).toBeLessThanOrEqual(stats.sweptPairs);
        for (const record of records) {
          expect(Number.isFinite(record.amount) && record.amount > 0).toBe(
            true,
          );
          expect(
            KNOWN_TARGETS.has(record.target) ||
              world.store.get(record.target) !== undefined,
          ).toBe(true);
        }
        for (const old of before.entities) {
          const entity = world.store.get(old.id);
          if (entity === undefined) continue;
          if (!sameVec(entity.position, old.position)) {
            expect(finiteWithin(entity.position, MAX_ENTITY_MAGNITUDE)).toBe(
              true,
            );
          }
          if (!sameVec(entity.velocity, old.velocity)) {
            expect(finiteWithin(entity.velocity, MAX_ENTITY_VELOCITY)).toBe(
              true,
            );
          }
        }
        for (const key of ["navBuoy", "witchpoint"] as const) {
          const now = world.buoys[key];
          const old = before.buoys[key];
          if (!(c[key].health > 0)) {
            // A destroyed buoy is no collider: nothing writes it.
            expect(sameVec(now.offset, old.offset)).toBe(true);
            expect(sameVec(now.velocity, old.velocity)).toBe(true);
          }
          if (!sameVec(now.offset, old.offset)) {
            expect(finiteWithin(now.offset, MAX_BUOY_OFFSET)).toBe(true);
          }
          if (!sameVec(now.velocity, old.velocity)) {
            expect(finiteWithin(now.velocity, MAX_ENTITY_VELOCITY)).toBe(true);
          }
        }
        if (!sameVec(player.drift, before.drift)) {
          expect(finiteWithin(player.drift, MAX_ENTITY_VELOCITY)).toBe(true);
        }
        if (!sameVec(player.position, before.position)) {
          expect(finiteWithin(player.position, Number.MAX_VALUE)).toBe(true);
        }
      }),
      { numRuns: 300, seed: 1818 },
    );
  });
});

describe("directed edge cases", () => {
  it("three bodies touching in one tick resolve in rank order, the same on a replay", () => {
    const run = () => {
      const world = createWorld(5);
      // The player 90 m off the nav buoy on +Z, a Krait 60 m behind it.
      const player = flyingPlayer(
        vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + 90),
        50,
      );
      player.flightTime = 0;
      const result = spawnEntity(
        world,
        {
          kind: "ship",
          specKey: "krait",
          scanClass: "CLASS_NEUTRAL",
          position: vec(NAV_BUOY.x, NAV_BUOY.y, NAV_BUOY.z + 150),
          orientation: identity(),
          radius: 50,
          maxEnergy: 80,
          velocity: vec(0, 0, -150),
        },
        0,
      );
      if (!result.ok) throw new Error("spawn refused");
      const out = resolveCollisions(
        world,
        player,
        createPlayerCombatState(),
        options(FLIGHT),
        layout,
      );
      return {
        records: out.records,
        stats: out.stats,
        krait: result.entity.id,
        buoy: { ...world.buoys.navBuoy },
        drift: { ...player.drift },
      };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.stats.contacts).toBe(2);
    // The player is rank 0: its two calls come first, nearest other first
    // (the Krait at 60 m, then the buoy at 90 m), each self's record first.
    expect(a.records.map((r) => [r.target, r.source])).toEqual([
      [PLAYER_ID, a.krait],
      [a.krait, PLAYER_ID],
      [PLAYER_ID, STATION_NAV_BUOY_ID],
      [STATION_NAV_BUOY_ID, PLAYER_ID],
    ]);
  });

  it("contact at exactly the radius sum is no pair; a hair nearer is", () => {
    const buoyRadius = HULLS.get("buoy")?.collisionRadius ?? NaN;
    const podRadius = HULLS.get("barrel")?.collisionRadius ?? NaN;
    const sum = buoyRadius + podRadius;
    const at = (x: number) => {
      const world = createWorld(5);
      // The witchpoint buoy sits at the origin; the player is far away.
      const player = flyingPlayer(vec(1e5, 0, 0), 0);
      const result = spawnEntity(
        world,
        {
          kind: "cargo",
          specKey: "barrel",
          scanClass: "CLASS_CARGO",
          position: vec(x, 0, 0),
          orientation: identity(),
          radius: FIXTURE_POD.radius,
          maxEnergy: DEBRIS_MAX_ENERGY,
        },
        0,
      );
      if (!result.ok) throw new Error("spawn refused");
      return resolveCollisions(
        world,
        player,
        createPlayerCombatState(),
        options(FLIGHT),
        layout,
      ).stats.narrowTests;
    };
    expect(layout.witchpoint.position).toEqual(vec(0, 0, 0));
    expect(HULLS.has(PLAYER_HULL_KEY)).toBe(true);
    expect(at(sum)).toBe(0);
    expect(at(sum - 1e-9)).toBe(1);
  });
});
