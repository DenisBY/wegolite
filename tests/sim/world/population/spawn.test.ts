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

import { describe, expect, it } from "vitest";

import type { System } from "../../../../src/content/types.js";
import { marketSeedForSystem } from "../../../../src/sim/economy/market.js";
import { initFlightState } from "../../../../src/sim/flight/state.js";
import { length, lengthSquared, sub, vec } from "../../../../src/sim/math.js";
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
import { MAX_WORLD_GROUPS } from "../../../../src/sim/world/limits.js";
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
