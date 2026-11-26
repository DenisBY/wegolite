// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The spawn half of the initial populator (Phase 22 plan 22-10, WORLD-08): the
 * planned groups of a system become inert ships in a world.
 *
 * The expectations come from Oolite's rules and from the plan the planner
 * returns for the same draws, never from re-running the spawn code: the region
 * of a location code, the spread of an `addShips` call, the formation of an
 * escort (`ShipEntity.m:1690-1705`) and the group-record rule are written out
 * here with plain arithmetic.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { System } from "../../../../src/content/types.js";
import { marketSeedForSystem } from "../../../../src/sim/economy/market.js";
import { initFlightState } from "../../../../src/sim/flight/state.js";
import {
  identity,
  length,
  lengthSquared,
  sub,
  vec,
} from "../../../../src/sim/math.js";
import type { Vec3 } from "../../../../src/sim/math.js";
import { escortCoordinates } from "../../../../src/sim/npc/escort.js";
import { ACCURACY_UNRESOLVED } from "../../../../src/sim/npc/state.js";
import {
  createRngState,
  rngNext,
  worldSeedFor,
} from "../../../../src/sim/rng.js";
import { CARGO_KINDS } from "../../../../src/sim/world/entity.js";
import type { Entity } from "../../../../src/sim/world/entity.js";
import {
  deriveSystemLayout,
  type SystemLayout,
} from "../../../../src/sim/world/layout.js";
import { MAX_ENTITIES } from "../../../../src/sim/world/ids.js";
import {
  MAX_UINT32,
  MAX_WORLD_GROUPS,
  POPULATION_ENTITY_LIMIT,
} from "../../../../src/sim/world/limits.js";
import { createEntityStore } from "../../../../src/sim/world/store.js";
import { LANE_WIDTH } from "../../../../src/sim/world/placement.js";
import { planSystemGroups } from "../../../../src/sim/world/population/groups.js";
import type {
  GroupPlan,
  PlannedPopShip,
  PopulationRecord,
} from "../../../../src/sim/world/population/groups.js";
import { remotePackZ } from "../../../../src/sim/world/population/pirates.js";
import type { SystemFacts } from "../../../../src/sim/world/population/plan.js";
import {
  cargoCountForKind,
  populateSystemWorld,
  spawnPlannedGroups,
} from "../../../../src/sim/world/population/spawn.js";
import {
  countDrawSource,
  populationDraws,
  populationStream,
} from "../../../../src/sim/world/population/streams.js";
import { POPULATOR_ENTRIES } from "../../../../src/sim/world/population/table.js";
import { locationByCode } from "../../../../src/sim/world/placement.js";
import { hashWorld } from "../../../../src/sim/world/serialize.js";
import {
  createWorld,
  liveEntityCount,
  spawnEntity,
} from "../../../../src/sim/world/world.js";
import type { World } from "../../../../src/sim/world/world.js";
import {
  committedPopulationRecords,
  factsFromFixture,
  galaxySystems,
  loadPopulationFixture,
  loadPopulationFixtures,
} from "../../../helpers/population-fixtures.js";
import { laveFixture } from "../../../helpers/lave.js";

const { layout, stationDef } = laveFixture();
const records = committedPopulationRecords();
const laveFacts = factsFromFixture(loadPopulationFixture("g0-s7-seed1"));

/** The plan the production draws give a world seed. */
function planFor(
  worldSeed: number,
  facts: SystemFacts,
  recs: readonly PopulationRecord[] = records,
): readonly GroupPlan[] {
  return planSystemGroups(facts, recs, {
    counts: countDrawSource(worldSeed),
    group: (ordinal, groupIndex) =>
      populationDraws(worldSeed, ordinal, groupIndex),
  });
}

function dynamicEntities(world: World): readonly Entity[] {
  return world.store.live;
}

function planShips(plans: readonly GroupPlan[]): PlannedPopShip[] {
  return plans.flatMap((plan) => [...plan.ships]);
}

/** The Oolite `addShips` / `addGroup` spread of a builder's ship (metres). */
function ooliteSpread(plan: GroupPlan, index: number): number {
  switch (POPULATOR_ENTRIES[plan.ordinal]?.builder) {
    case "lightHunter":
      return 2_000; // oolite-populator.js:1580
    case "independentPirate":
      return 2_500; // :1706
    case "policePatrol":
      return 2_000; // :2059
    case "interceptors":
      return 2_000; // :2105
    case "lightPirateLocal":
    case "lightPirateRemote":
    case "mediumPirateLocal":
    case "mediumPirateRemote":
    case "heavyPirateLocal":
    case "heavyPirateRemote":
      return index === 0 ? 0 : 4_000; // :1800 leader, :1741 assistants
    default:
      return 0; // single traders :1385-1537 and the station patrol :2086
  }
}

/** Group keys by the Oolite `ShipGroup` rule, written out independently. */
function expectedGroupKey(ships: readonly PlannedPopShip[], i: number): number {
  const ship = ships[i] as PlannedPopShip;
  if (!ship.groupRecord) return -1;
  if (ship.leaderIndex !== null) return ship.leaderIndex;
  return ships.findIndex((s) => s.groupRecord && s.leaderIndex === null);
}

function inLane(
  p: Vec3,
  a: Vec3,
  exclusionA: number,
  b: Vec3,
  exclusionB: number,
): boolean {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const t = Math.min(
    1,
    Math.max(0, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared(ab)),
  );
  const nearest = vec(a.x + ab.x * t, a.y + ab.y * t, a.z + ab.z * t);
  return (
    length(sub(p, a)) >= exclusionA &&
    length(sub(p, b)) >= exclusionB &&
    length(sub(p, nearest)) <= LANE_WIDTH + 1e-6
  );
}

/** Whether `p` lies in the region of a location code (Universe.m:1783-1815). */
function inRegion(
  code: string,
  p: Vec3,
  where: SystemLayout,
  origin: Vec3,
): boolean {
  const { planet, sun, station } = where;
  switch (code) {
    case "LANE_WP":
      return inLane(
        p,
        origin,
        where.scannerRange,
        planet.position,
        planet.radius * 3,
      );
    case "LANE_WS":
      return inLane(
        p,
        origin,
        where.scannerRange,
        sun.position,
        sun.radius * 3,
      );
    case "LANE_PS":
      return inLane(
        p,
        planet.position,
        planet.radius * 3,
        sun.position,
        sun.radius * 3,
      );
    case "STATION_AEGIS": {
      const d = length(sub(p, station.position));
      return (
        d >= station.radius * 1.2 &&
        d <= where.scannerRange * 2 + 1e-6 &&
        lengthSquared(sub(p, planet.position)) >=
          planet.radius * planet.radius * 1.5
      );
    }
    case "LANE_WPS":
      return ["LANE_WP", "LANE_WS", "LANE_PS"].some((lane) =>
        inRegion(lane, p, where, origin),
      );
    case "WITCHPOINT":
      return length(sub(p, origin)) <= where.scannerRange + 1e-6;
    default:
      return false;
  }
}

describe("populateSystemWorld: Lave end to end (tracer)", () => {
  it("builds the planned ships with every kit field, inert", () => {
    let spawnedGroups = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const world = createWorld(seed);
      const result = populateSystemWorld(world, layout, laveFacts, records);
      const plans = planFor(seed, laveFacts);
      const ships = planShips(plans);
      const entities = dynamicEntities(world);

      expect(result.skippedGroups).toBe(0);
      expect(result.spawnedGroups).toBe(plans.length);
      expect(result.entities).toBe(ships.length);
      expect(entities.length).toBe(ships.length);
      spawnedGroups += result.spawnedGroups;

      entities.forEach((entity, i) => {
        const planned = ships[i] as PlannedPopShip;
        expect(entity.kind).toBe("ship");
        expect(entity.ai).toBeNull();
        expect(entity.specKey).toBe(planned.recordKey);
        expect(entity.role).toBe(planned.primaryRole);
        expect(entity.bounty).toBe(planned.bounty);
        expect(CARGO_KINDS[entity.cargoKind]).toBe(planned.cargoKind);
        expect(entity.fuel).toBe(planned.fuel);
        expect(entity.homeSystem).toBe(planned.homeSystem);
        expect(entity.destinationSystem).toBe(planned.destinationSystem);
        expect(entity.injector !== null).toBe(planned.injector);
        expect(entity.weaponTypes).toEqual(planned.weaponTypes);
        expect(entity.steer.accuracy).toBe(planned.accuracy);
        expect(entity.steer.accuracy).not.toBe(ACCURACY_UNRESOLVED);
      });
    }
    expect(spawnedGroups).toBeGreaterThan(0);
  });

  it("builds the same world from the same seed and another from another seed", () => {
    const flight = initFlightState(layout);
    const a = createWorld(77);
    const b = createWorld(77);
    const c = createWorld(78);
    populateSystemWorld(a, layout, laveFacts, records);
    populateSystemWorld(b, layout, laveFacts, records);
    populateSystemWorld(c, layout, laveFacts, records);
    expect(hashWorld(flight, a)).toBe(hashWorld(flight, b));
    expect(hashWorld(flight, a)).not.toBe(hashWorld(flight, c));
  });

  it("takes no draw from the world stream and leaves the entity ids dense from 101", () => {
    const world = createWorld(5);
    const before = world.rng.s;
    populateSystemWorld(world, layout, laveFacts, records);
    expect(world.rng.s).toBe(before);
    const ids = dynamicEntities(world).map((e) => e.id);
    ids.forEach((id, i) => expect(id).toBe(101 + i));
  });

  it("gives every ship with cargo a cargo kind (the pod-kind rule)", () => {
    let withCargo = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const world = createWorld(seed);
      populateSystemWorld(world, layout, laveFacts, records);
      for (const entity of dynamicEntities(world)) {
        if (entity.cargo > 0) {
          withCargo += 1;
          expect(entity.cargoKind).toBeGreaterThan(0);
        }
        if (entity.cargoKind === 0) expect(entity.cargo).toBe(0);
      }
    }
    expect(withCargo).toBeGreaterThan(0);
  });

  it("puts escorts in formation with their mother's id, slot and group", () => {
    let escortsSeen = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const world = createWorld(seed);
      populateSystemWorld(world, layout, laveFacts, records);
      const plans = planFor(seed, laveFacts);
      const ships = planShips(plans);
      const entities = dynamicEntities(world);
      let base = 0;
      for (const plan of plans) {
        plan.ships.forEach((ship, i) => {
          if (ship.escortSlot === null || ship.ownerIndex === null) return;
          escortsSeen += 1;
          const escort = entities[base + i] as Entity;
          const mother = entities[base + ship.ownerIndex] as Entity;
          expect(escort.ownerId).toBe(mother.id);
          expect(escort.steer.escortSlot).toBe(ship.escortSlot);
          expect(escort.groupId).toBe(mother.id);
          const formation = escortCoordinates(
            { position: mother.position, orientation: mother.orientation },
            mother.radius,
            ship.escortSlot,
          );
          // `ShipEntity.m:1690-1705`: per axis radius * 6 * (u - 0.5).
          const half = escort.radius * 3 + 1e-6;
          expect(Math.abs(escort.position.x - formation.x)).toBeLessThanOrEqual(
            half,
          );
          expect(Math.abs(escort.position.y - formation.y)).toBeLessThanOrEqual(
            half,
          );
          expect(Math.abs(escort.position.z - formation.z)).toBeLessThanOrEqual(
            half,
          );
        });
        base += plan.ships.length;
      }
      expect(ships.length).toBe(entities.length);
    }
    expect(escortsSeen).toBeGreaterThan(0);
  });

  it("records groups by the ShipGroup rule, ascending, leader first", () => {
    let recordsSeen = 0;
    let stationPatrols = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const world = createWorld(seed);
      const result = populateSystemWorld(world, layout, laveFacts, records);
      const plans = planFor(seed, laveFacts);
      const entities = dynamicEntities(world);
      const expectedRecords: number[] = [];
      let base = 0;
      for (const plan of plans) {
        plan.ships.forEach((ship, i) => {
          const entity = entities[base + i] as Entity;
          const key = expectedGroupKey(plan.ships, i);
          if (key < 0) {
            expect(entity.groupId).toBe(0);
          } else {
            const leader = entities[base + key] as Entity;
            expect(entity.groupId).toBe(leader.id);
            if (key === i) expectedRecords.push(entity.id);
          }
          if (ship.primaryRole === "police-station-patrol") {
            stationPatrols += 1;
            expect(entity.groupId).toBe(0);
          }
        });
        base += plan.ships.length;
      }
      expect(world.groups.map((g) => g.id)).toEqual(expectedRecords);
      for (const group of world.groups) expect(group.leader).toBe(group.id);
      for (let i = 1; i < world.groups.length; i += 1) {
        expect((world.groups[i] as { id: number }).id).toBeGreaterThan(
          (world.groups[i - 1] as { id: number }).id,
        );
      }
      expect(result.groupRecords).toBe(world.groups.length);
      expect(world.groups.length).toBeLessThanOrEqual(MAX_WORLD_GROUPS);
      recordsSeen += world.groups.length;
    }
    expect(recordsSeen).toBeGreaterThan(0);
    expect(stationPatrols).toBeGreaterThan(0);
  });
});

describe("placement regions (D-01, WORLD-08 adjacency)", () => {
  it("every group's centre is in its location's region and every ship within its spread, no fallback", () => {
    const origin = vec(0, 0, 0);
    let checked = 0;
    for (const loaded of loadPopulationFixtures()) {
      const { header } = loaded.fixture;
      const content: readonly System[] = galaxySystems(header.galaxy);
      const system = content.find((s) => s.systemIndex === header.systemIndex);
      if (system === undefined) throw new Error(`no system ${header.system}`);
      const where = deriveSystemLayout(system, stationDef);
      const facts = factsFromFixture(loaded.fixture);
      for (let epoch = 1; epoch <= 3; epoch += 1) {
        const seed = worldSeedFor(marketSeedForSystem(header.system), epoch);
        const world = createWorld(seed);
        const result = populateSystemWorld(world, where, facts, records);
        const plans = planFor(seed, facts);
        expect(
          result.fallbacks,
          `${header.system} epoch ${String(epoch)}`,
        ).toBe(0);
        expect(result.skippedGroups).toBe(0);
        const entities = dynamicEntities(world);
        let base = 0;
        for (const plan of plans) {
          const centreRaw = locationByCode(
            populationStream(seed, plan.ordinal, plan.groupIndex, "location"),
            plan.location as Parameters<typeof locationByCode>[1],
            where,
          );
          const centre = plan.remotePack
            ? vec(
                centreRaw.position.x,
                centreRaw.position.y,
                remotePackZ(centreRaw.position.z),
              )
            : centreRaw.position;
          // A remote pack's centre is shifted along z by the script, so it is
          // checked as the unshifted sample (the region) and the shift (equal z).
          expect(
            inRegion(plan.location, centreRaw.position, where, origin),
          ).toBe(true);
          plan.ships.forEach((ship, i) => {
            checked += 1;
            if (ship.escortSlot !== null && ship.ownerIndex !== null) return;
            const entity = entities[base + i] as Entity;
            const spread = ooliteSpread(plan, i);
            // randomSpatial(spread) lies within `spread` of the centre.
            expect(length(sub(entity.position, centre))).toBeLessThanOrEqual(
              spread + 1e-6,
            );
          });
          base += plan.ships.length;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("cargoCountForKind (ShipEntity.m:7323-7375)", () => {
  const record = { likelyCargo: 10, maxCargo: 20 };

  it("is 0 with no draw for an unset kind", () => {
    const rng = createRngState(3);
    expect(cargoCountForKind("unset", record, rng)).toBe(0);
    expect(rng.s).toBe(createRngState(3).s);
  });

  it("is likelyCargo * (0.5 + u) truncated and capped at the capacity for a full kind", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const u = rngNext(createRngState(seed));
      const expected = Math.min(Math.floor(10 * (0.5 + u)), 20);
      const rng = createRngState(seed);
      expect(cargoCountForKind("scarce", record, rng)).toBe(expected);
      // One draw only: the stream moved by exactly one step.
      const stepped = createRngState(seed);
      rngNext(stepped);
      expect(rng.s).toBe(stepped.s);
    }
  });

  it("uses the capacity when likelyCargo is 0 and caps at 200", () => {
    expect(
      cargoCountForKind(
        "plentiful",
        { likelyCargo: 0, maxCargo: 7 },
        createRngState(1),
      ),
    ).toBe(7);
    expect(
      cargoCountForKind(
        "plentiful",
        { likelyCargo: 0, maxCargo: 5000 },
        createRngState(1),
      ),
    ).toBe(200);
  });

  it("takes a Ranrot fraction of the count for the pirate kind and nothing for a zero count", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const full = cargoCountForKind("scarce", record, createRngState(seed));
      const pirate = cargoCountForKind("pirate", record, createRngState(seed));
      expect(pirate).toBeGreaterThanOrEqual(0);
      expect(pirate).toBeLessThanOrEqual(Math.floor(full / 2));
    }
    expect(
      cargoCountForKind(
        "pirate",
        { likelyCargo: 0, maxCargo: 0 },
        createRngState(1),
      ),
    ).toBe(0);
  });

  it("counts a malformed capacity as 0", () => {
    expect(
      cargoCountForKind(
        "scarce",
        { likelyCargo: Number.NaN, maxCargo: Number.NaN },
        createRngState(1),
      ),
    ).toBe(0);
    expect(
      cargoCountForKind(
        "scarce",
        { likelyCargo: -1, maxCargo: -4 },
        createRngState(1),
      ),
    ).toBe(0);
  });
});

describe("spawnPlannedGroups", () => {
  it("spawns nothing for an empty plan and leaves the world untouched", () => {
    const world = createWorld(9);
    const result = spawnPlannedGroups(world, layout, [], records);
    expect(result).toEqual({
      spawnedGroups: 0,
      skippedGroups: 0,
      entities: 0,
      groupRecords: 0,
      fallbacks: 0,
    });
    expect(liveEntityCount(world)).toBe(0);
  });
});

// --- Task 2: the cap rule, independence, atomicity and totality ---------------

/** The fields of a ship that must not depend on the other groups. */
function projectShips(entities: readonly Entity[]): readonly unknown[] {
  const first = entities[0]?.id ?? 0;
  return entities.map((e) => ({
    specKey: e.specKey,
    position: e.position,
    orientation: e.orientation,
    radius: e.radius,
    role: e.role,
    bounty: e.bounty,
    cargo: e.cargo,
    cargoKind: e.cargoKind,
    fuel: e.fuel,
    homeSystem: e.homeSystem,
    destinationSystem: e.destinationSystem,
    injector: e.injector,
    weaponTypes: e.weaponTypes,
    accuracy: e.steer.accuracy,
    escortSlot: e.steer.escortSlot,
    owner: e.ownerId === 0 ? null : e.ownerId - first,
    group: e.groupId === 0 ? null : e.groupId - first,
  }));
}

/** The groups' projections of the plans flagged in `spawned`, in plan order. */
function projectGroups(
  world: World,
  plans: readonly GroupPlan[],
  spawned: readonly boolean[],
): readonly unknown[] {
  const entities = dynamicEntities(world);
  const out: unknown[] = [];
  let at = 0;
  plans.forEach((plan, i) => {
    if (spawned[i] !== true) return;
    out.push(projectShips(entities.slice(at, at + plan.ships.length)));
    at += plan.ships.length;
  });
  expect(at).toBe(entities.length);
  return out;
}

/** A seed whose Lave plan satisfies `accept`, searched from 1. */
function findSeed(accept: (plans: readonly GroupPlan[]) => boolean): number {
  for (let seed = 1; seed <= 400; seed += 1) {
    if (accept(planFor(seed, laveFacts))) return seed;
  }
  throw new Error("no Lave seed with the plan shape the case needs");
}

function filler(world: World): boolean {
  return spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "filler",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 10,
    },
    0,
  ).ok;
}

describe("the entity limit (D-05, D-06)", () => {
  it("skips a group that does not fit whole, continues, and moves no other group", () => {
    const seed = findSeed((plans) => {
      const sizes = plans.map((p) => p.ships.length);
      const third = sizes[2];
      return (
        third !== undefined &&
        third >= 2 &&
        sizes.slice(3).some((size) => size < third)
      );
    });
    const plans = planFor(seed, laveFacts);
    const sizes = plans.map((p) => p.ships.length);
    const limit = (sizes[0] ?? 0) + (sizes[1] ?? 0) + (sizes[2] ?? 0) - 1;

    // The rule, simulated: a group spawns whole when it fits what is left.
    const expected: boolean[] = [];
    let used = 0;
    for (const size of sizes) {
      const fits = size <= limit - used;
      expected.push(fits);
      if (fits) used += size;
    }
    expect(expected[2]).toBe(false);
    expect(expected.slice(3).some(Boolean)).toBe(true);

    const full = createWorld(seed);
    populateSystemWorld(full, layout, laveFacts, records, {
      entityLimit: 1000,
    });
    const capped = createWorld(seed);
    const result = populateSystemWorld(capped, layout, laveFacts, records, {
      entityLimit: limit,
    });

    expect(result.spawnedGroups).toBe(expected.filter(Boolean).length);
    expect(result.skippedGroups).toBe(expected.filter((f) => !f).length);
    expect(liveEntityCount(capped)).toBe(used);
    expect(liveEntityCount(capped)).toBeLessThanOrEqual(limit);

    const unlimited = projectGroups(
      full,
      plans,
      plans.map(() => true),
    );
    const limited = projectGroups(capped, plans, expected);
    expect(limited).toEqual(unlimited.filter((_, i) => expected[i] === true));
  });

  it("defaults to POPULATION_ENTITY_LIMIT and skips a group that would cross it", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const world = createWorld(seed);
      populateSystemWorld(world, layout, laveFacts, records);
      expect(liveEntityCount(world)).toBeLessThanOrEqual(
        POPULATION_ENTITY_LIMIT,
      );
    }
    const crowded = createWorld(1);
    for (let i = 0; i < POPULATION_ENTITY_LIMIT - 1; i += 1) {
      expect(filler(crowded)).toBe(true);
    }
    const plans = planFor(1, laveFacts);
    const result = spawnPlannedGroups(crowded, layout, plans, records);
    expect(liveEntityCount(crowded)).toBeLessThanOrEqual(
      POPULATION_ENTITY_LIMIT,
    );
    expect(result.skippedGroups).toBeGreaterThan(0);
    expect(result.skippedGroups + result.spawnedGroups).toBe(plans.length);
  });

  it("populates nothing at limit 0: no ship, no record, the world stream and id counter untouched", () => {
    const flight = initFlightState(layout);
    const world = createWorld(31);
    const rngBefore = world.rng.s;
    const plans = planFor(31, laveFacts);
    const result = populateSystemWorld(world, layout, laveFacts, records, {
      entityLimit: 0,
    });
    expect(plans.length).toBeGreaterThan(0);
    expect(result).toEqual({
      spawnedGroups: 0,
      skippedGroups: plans.length,
      entities: 0,
      groupRecords: 0,
      fallbacks: 0,
    });
    expect(liveEntityCount(world)).toBe(0);
    expect(world.groups).toEqual([]);
    expect(world.rng.s).toBe(rngBefore);
    expect(world.store.nextId).toBe(101);
    expect(hashWorld(flight, world)).toBe(hashWorld(flight, undefined));
  });

  it("plans and spawns nothing from empty records", () => {
    const world = createWorld(12);
    const result = populateSystemWorld(world, layout, laveFacts, []);
    expect(result.entities).toBe(0);
    expect(result.groupRecords).toBe(0);
    expect(liveEntityCount(world)).toBe(0);
    expect(world.store.nextId).toBe(101);
  });
});

describe("the group bound (D-05, D-11)", () => {
  it("skips a group that would take the record count past MAX_WORLD_GROUPS and still spawns record-less groups", () => {
    const seed = findSeed((plans) => {
      const holders = plans.filter((p) => p.ships.some((s) => s.groupRecord));
      const loose = plans.filter((p) => p.ships.every((s) => !s.groupRecord));
      return holders.length >= 3 && loose.length >= 1;
    });
    const world = createWorld(seed);
    for (let i = 0; i < MAX_WORLD_GROUPS - 1; i += 1) {
      world.groups.push({ id: 1_000_000 + i, leader: 1_000_000 + i });
    }
    const plans = planFor(seed, laveFacts);
    const result = populateSystemWorld(world, layout, laveFacts, records);
    const holders = plans.filter((p) => p.ships.some((s) => s.groupRecord));
    expect(result.groupRecords).toBe(1);
    expect(world.groups.length).toBe(MAX_WORLD_GROUPS);
    expect(result.skippedGroups).toBe(holders.length - 1);
    const loose = plans.filter((p) => p.ships.every((s) => !s.groupRecord));
    const looseShips = loose.reduce((n, p) => n + p.ships.length, 0);
    expect(liveEntityCount(world)).toBeGreaterThanOrEqual(looseShips);
    for (let i = 1; i < world.groups.length; i += 1) {
      expect((world.groups[i] as { id: number }).id).toBeGreaterThan(
        (world.groups[i - 1] as { id: number }).id,
      );
    }
  });

  it("keeps the records ascending when a prefilled record has a higher id than the new ships", () => {
    const world = createWorld(5);
    world.groups.push({ id: 200, leader: 200 });
    world.groups.push({ id: 9_000_000, leader: 9_000_000 });
    populateSystemWorld(world, layout, laveFacts, records);
    const ids = world.groups.map((g) => g.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("independence of the groups (pitfall C4)", () => {
  const seed = findSeed((plans) => plans.length >= 4);
  const plans = planFor(seed, laveFacts);
  const all = plans.map(() => true);

  function build(list: readonly GroupPlan[]): World {
    const world = createWorld(seed);
    spawnPlannedGroups(world, layout, list, records, { entityLimit: 1000 });
    return world;
  }

  it("inserting a group moves no other group's ships", () => {
    const extra: GroupPlan = { ...(plans[1] as GroupPlan), groupIndex: 77 };
    const inserted = [
      ...plans.slice(0, 2),
      extra,
      ...plans.slice(2),
    ] as readonly GroupPlan[];
    const base = projectGroups(build(plans), plans, all);
    const grown = projectGroups(
      build(inserted),
      inserted,
      inserted.map(() => true),
    );
    // The extra group is a plan of its own: another stream, other positions,
    // while every other group is unchanged.
    expect(grown.filter((_, i) => i !== 2)).toEqual(base);
    expect(grown[2]).not.toEqual(base[1]);
  });

  it("removing a group moves no other group's ships", () => {
    const removed = plans.filter((_, i) => i !== 1);
    const base = projectGroups(build(plans), plans, all);
    const shrunk = projectGroups(
      build(removed),
      removed,
      removed.map(() => true),
    );
    expect(shrunk).toEqual(base.filter((_, i) => i !== 1));
  });

  it("places each group from its own location stream", () => {
    const world = build(plans);
    const entities = dynamicEntities(world);
    let at = 0;
    for (const plan of plans) {
      const first = entities[at] as Entity;
      const centre = locationByCode(
        populationStream(seed, plan.ordinal, plan.groupIndex, "location"),
        plan.location as Parameters<typeof locationByCode>[1],
        layout,
      ).position;
      const centreFor = plan.remotePack
        ? vec(centre.x, centre.y, remotePackZ(centre.z))
        : centre;
      expect(length(sub(first.position, centreFor))).toBeLessThanOrEqual(
        ooliteSpread(plan, 0) + 1e-6,
      );
      expect((plan.ships[0] as PlannedPopShip).recordKey).toBe(first.specKey);
      at += plan.ships.length;
    }
  });
});

describe("a system with a station patrol only (Oresrati)", () => {
  it("spawns exactly its station patrol", () => {
    const loaded = loadPopulationFixtures().find(
      (candidate) => candidate.id === "g7-s162-seed1",
    );
    if (loaded === undefined) throw new Error("no g7-s162-seed1 fixture");
    const { header } = loaded.fixture;
    const system = galaxySystems(header.galaxy).find(
      (s) => s.systemIndex === header.systemIndex,
    ) as System;
    const where = deriveSystemLayout(system, stationDef);
    const facts = factsFromFixture(loaded.fixture);
    for (let seed = 1; seed <= 20; seed += 1) {
      const world = createWorld(seed);
      const result = populateSystemWorld(world, where, facts, records);
      const entities = dynamicEntities(world);
      expect(entities.length, `seed ${String(seed)}`).toBe(1);
      expect(entities[0]?.role).toBe("police-station-patrol");
      expect(result.groupRecords).toBe(0);
      expect(world.groups).toEqual([]);
    }
  });
});

describe("populateSystemWorld totality (fast-check)", () => {
  const number = fc.oneof(
    fc.double(),
    fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      1e300,
      7,
      14,
    ),
  );
  const lane = fc.oneof(
    { weight: 8, arbitrary: fc.double({ min: 0, max: 3e6, noNaN: true }) },
    { weight: 1, arbitrary: number },
  );
  const word = fc.oneof(
    fc.constantFrom(
      "hunter",
      "pirate",
      "police",
      "interceptor",
      "trader",
      "escort",
      "constructor",
      "__proto__",
      "",
    ),
    fc.string(),
  );
  const arbitraryRecord = fc.record({
    key: word,
    name: word,
    roles: fc.array(word, { maxLength: 6 }),
    scanClass: fc.constantFrom("CLASS_NEUTRAL", "CLASS_POLICE", "CLASS_X", ""),
    radius: number,
    maxEnergy: number,
    energyRechargeRate: number,
    likelyCargo: number,
    maxCargo: number,
    autoAi: number,
    autoWeapons: number,
    hasFuelInjection: number,
    hyperspaceMotor: fc.boolean(),
    escortRoles: fc.oneof(
      fc.constant(null),
      fc.array(fc.record({ min: number, max: number, role: word }), {
        maxLength: 8,
      }),
    ),
    forwardWeapon: word,
    aftWeapon: word,
    fuel: number,
    bounty: number,
  });
  const arbitraryFacts = fc.record({
    government: number,
    economy: number,
    techlevel: number,
    systemIndex: fc.oneof(fc.integer({ min: 0, max: 255 }), number),
    l1: lane,
    l2: lane,
    l3: lane,
    bottleneck: fc.boolean(),
  });
  const arbitraryWorld = fc.record({
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    fillers: fc.integer({ min: 0, max: MAX_ENTITIES }),
    records: fc.integer({ min: 0, max: MAX_WORLD_GROUPS }),
    nearTheEnd: fc.option(fc.integer({ min: 0, max: 12 }), { nil: undefined }),
    limit: fc.option(
      fc.oneof(
        fc.integer({ min: -5, max: 400 }),
        fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY),
      ),
      { nil: undefined },
    ),
  });

  /** Whether `added` is exactly `groups` whole plans, taken in plan order. */
  function addedAreWholePlans(
    plans: readonly GroupPlan[],
    added: readonly string[],
    groups: number,
  ): boolean {
    const memo = new Map<string, boolean>();
    const solve = (planAt: number, at: number, left: number): boolean => {
      if (left === 0) return at === added.length;
      if (planAt >= plans.length) return false;
      const key = `${String(planAt)}:${String(at)}:${String(left)}`;
      const known = memo.get(key);
      if (known !== undefined) return known;
      const plan = plans[planAt] as GroupPlan;
      const fits = plan.ships.every(
        (ship, i) => added[at + i] === ship.recordKey,
      );
      const result =
        (fits && plan.ships.length > 0
          ? solve(planAt + 1, at + plan.ships.length, left - 1)
          : false) || solve(planAt + 1, at, left);
      memo.set(key, result);
      return result;
    };
    return solve(0, 0, groups);
  }

  it("never throws, never leaves a partial group and never exceeds a limit", () => {
    fc.assert(
      fc.property(
        arbitraryFacts,
        fc.array(arbitraryRecord, { maxLength: 4 }),
        fc.boolean(),
        arbitraryWorld,
        (generated, extra, withCatalogue, shape) => {
          const facts: SystemFacts = {
            ...laveFacts,
            government: generated.government,
            economy: generated.economy,
            techlevel: generated.techlevel,
            systemIndex: generated.systemIndex,
            laneLengths: {
              l1: generated.l1,
              l2: generated.l2,
              l3: generated.l3,
            },
            neighbourhood: {
              ...laveFacts.neighbourhood,
              bottleneck: generated.bottleneck,
            },
          };
          const recs = withCatalogue ? [...records, ...extra] : extra;
          const base = createWorld(shape.seed);
          const target: World =
            shape.nearTheEnd === undefined
              ? base
              : {
                  ...base,
                  store: createEntityStore({
                    nextId: MAX_UINT32 - shape.nearTheEnd,
                    entities: [],
                  }),
                };
          for (let i = 0; i < shape.fillers; i += 1) {
            if (!filler(target)) break;
          }
          for (let i = 0; i < shape.records; i += 1) {
            target.groups.push({ id: 1_000 + i, leader: 1_000 + i });
          }
          const before = new Set(target.store.live.map((e) => e.id));
          const groupsBefore = target.groups.length;
          const plans = planFor(target.worldSeed, facts, recs);
          const options =
            shape.limit === undefined ? {} : { entityLimit: shape.limit };

          const result = populateSystemWorld(
            target,
            layout,
            facts,
            recs,
            options,
          );

          const limit = Math.min(
            shape.limit ?? POPULATION_ENTITY_LIMIT,
            MAX_ENTITIES,
          );
          const added = target.store.live.filter((e) => !before.has(e.id));
          expect(added.length).toBe(result.entities);
          expect(result.spawnedGroups + result.skippedGroups).toBe(
            plans.length,
          );
          if (result.entities > 0) {
            expect(liveEntityCount(target)).toBeLessThanOrEqual(limit);
          }
          expect(target.groups.length).toBeLessThanOrEqual(MAX_WORLD_GROUPS);
          expect(target.groups.length - groupsBefore).toBe(result.groupRecords);
          const ids = target.groups.map((g) => g.id);
          for (let i = 1; i < ids.length; i += 1) {
            expect(ids[i] as number).toBeGreaterThan(ids[i - 1] as number);
          }
          // No dangling link: every group id an added ship carries is a record
          // and every added escort's mother is live and earlier.
          const live = new Set(target.store.live.map((e) => e.id));
          for (const e of added) {
            if (e.groupId !== 0) {
              expect(ids.includes(e.groupId)).toBe(true);
              expect(live.has(e.groupId)).toBe(true);
            }
            if (e.ownerId !== 0) {
              expect(live.has(e.ownerId)).toBe(true);
              expect(e.ownerId).toBeLessThan(e.id);
            }
          }
          if (plans.length <= 60) {
            expect(
              addedAreWholePlans(
                plans,
                added.map((e) => e.specKey),
                result.spawnedGroups,
              ),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("atomic groups (T-22-15, T-22-16)", () => {
  it("skips a group the world would refuse in part, whole, and consumes no id for it", () => {
    const seed = findSeed((plans) =>
      plans.some((plan) => {
        const lead = plan.ships[0]?.recordKey;
        return plan.ships.some((ship) => ship.recordKey !== lead);
      }),
    );
    const plans = planFor(seed, laveFacts);
    const victim = plans
      .flatMap((plan) => [...plan.ships])
      .find((ship) => ship.recordKey !== plans[0]?.ships[0]?.recordKey);
    if (victim === undefined) throw new Error("no second record in the plan");
    // Every record of that key has a radius the world refuses.
    const broken = records.map((record) =>
      record.key === victim.recordKey
        ? { ...record, radius: Number.NaN }
        : record,
    );
    const expected = plans.map((plan) =>
      plan.ships.every((ship) => ship.recordKey !== victim.recordKey),
    );
    expect(expected.some((ok) => !ok)).toBe(true);
    expect(expected.some((ok) => ok)).toBe(true);

    const world = createWorld(seed);
    const result = spawnPlannedGroups(world, layout, plans, broken, {
      entityLimit: 1000,
    });
    expect(result.spawnedGroups).toBe(expected.filter(Boolean).length);
    expect(result.skippedGroups).toBe(expected.filter((ok) => !ok).length);
    const spawnedShips = plans
      .filter((_, i) => expected[i])
      .reduce((n, plan) => n + plan.ships.length, 0);
    const entities = dynamicEntities(world);
    expect(entities.length).toBe(spawnedShips);
    // No id was spent on a refused group: ids are dense from 101.
    entities.forEach((entity, i) => expect(entity.id).toBe(101 + i));
    expect(
      entities.every((entity) => entity.specKey !== victim.recordKey),
    ).toBe(true);
  });

  it("spawns no group the id counter cannot number whole", () => {
    const plans = planFor(1, laveFacts);
    const world: World = {
      ...createWorld(1),
      store: createEntityStore({ nextId: MAX_UINT32 - 1, entities: [] }),
    };
    const result = spawnPlannedGroups(world, layout, plans, records, {
      entityLimit: 1000,
    });
    // Two ids are left: only groups of at most two ships fit, whole.
    expect(result.entities).toBeLessThanOrEqual(2);
    expect(result.spawnedGroups + result.skippedGroups).toBe(plans.length);
    for (const entity of dynamicEntities(world)) {
      expect(entity.id).toBeLessThanOrEqual(MAX_UINT32);
    }
  });

  it("skips a group at a location the port never places", () => {
    const plans = planFor(2, laveFacts);
    const first = plans[0] as GroupPlan;
    const unplaced = [
      { ...first, location: "PLANET_ORBIT_HIGH" } as GroupPlan,
      ...plans.slice(1),
    ];
    const world = createWorld(2);
    const result = spawnPlannedGroups(world, layout, unplaced, records, {
      entityLimit: 1000,
    });
    expect(result.skippedGroups).toBe(1);
    expect(result.spawnedGroups).toBe(plans.length - 1);
  });
});
