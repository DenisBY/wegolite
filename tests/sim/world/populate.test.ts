// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The first populator (WORLD-15, WORLD-14, D-01, D-02). The correctness
 * oracles are the Oolite rules: each ship lies in its location's region, the
 * pick is weighted by the role token, a zero weight is never chosen, no draw is
 * spent without eligible records, and a nullAI ship does not move. The golden
 * in the last block is a regression snapshot, not an oracle.
 */

import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { initFlightState, hashFlight } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { length, lengthSquared, sub, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import {
  createRngState,
  forkSeed,
  rngNext,
  worldSeedFor,
} from "../../../src/sim/rng.js";
import { fnv1a32 } from "../../../src/sim/hash.js";
import type { System } from "../../../src/content/types.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { DT } from "../../../src/sim/time.js";
import { FIRST_DYNAMIC_ID } from "../../../src/sim/world/ids.js";
import { MAX_ENTITY_CARGO } from "../../../src/sim/world/limits.js";
import {
  INERT_POPULATION,
  INERT_RECORD_KEYS,
  POPULATOR_ROLES,
  cargoCountAtSpawn,
  isScanClass,
  parseRoleToken,
  pickRecord,
  planInertPopulation,
  populateInertWorld,
} from "../../../src/sim/world/populate.js";
import type {
  InertShipRecord,
  PopulatorRole,
} from "../../../src/sim/world/populate.js";
import {
  LANE_WIDTH,
  locationByCode,
  type LocationCode,
} from "../../../src/sim/world/placement.js";
import {
  hashWorld,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import { createWorld, isNeverSpawned } from "../../../src/sim/world/world.js";
import {
  LAVE_EPOCH1_WORLD_SEED,
  buildInertWorld,
  laveInertRecords,
} from "../../helpers/inert-world.js";
import { laveFixture } from "../../helpers/lave.js";
import { stationSpecOf } from "../../helpers/stations.js";

const { layout } = laveFixture();
const records = laveInertRecords();
const ORIGIN = vec(0, 0, 0);
/** Oolite's default bank (ShipEntity.m:291-292) for the synthetic records. */
const DEFAULT_BANK = { maxEnergy: 200, energyRechargeRate: 1 } as const;

function dist(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const t = Math.min(
    1,
    Math.max(0, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared(ab)),
  );
  return dist(p, vec(a.x + ab.x * t, a.y + ab.y * t, a.z + ab.z * t));
}

describe("isScanClass", () => {
  it("accepts a member of the closed vocabulary and nothing else", () => {
    expect(isScanClass("CLASS_POLICE")).toBe(true);
    expect(isScanClass("CLASS_NEUTRAL")).toBe(true);
    expect(isScanClass("CLASS_BOGUS")).toBe(false);
    expect(isScanClass("")).toBe(false);
    expect(isScanClass("constructor")).toBe(false);
    expect(isScanClass("__proto__")).toBe(false);
  });
});

describe("parseRoleToken", () => {
  it("reads name and name(p)", () => {
    expect(parseRoleToken("trader(0.25)")).toEqual({
      role: "trader",
      weight: 0.25,
    });
    expect(parseRoleToken("police")).toEqual({ role: "police", weight: 1 });
    expect(parseRoleToken("trader(0.5")).toEqual({
      role: "trader",
      weight: 0.5,
    });
  });

  it("gives weight 0 to a weight that is not a finite non-negative number", () => {
    for (const token of [
      "trader(abc)",
      "trader(-1)",
      "trader(Infinity)",
      "trader(NaN)",
      "trader()",
      "trader(0)",
    ]) {
      expect(parseRoleToken(token)).toEqual({ role: "trader", weight: 0 });
    }
  });

  it("returns undefined for a malformed token", () => {
    expect(parseRoleToken("")).toBeUndefined();
    expect(parseRoleToken("(0.5)")).toBeUndefined();
    expect(parseRoleToken("[shipKey]")).toBeUndefined();
  });
});

describe("pickRecord", () => {
  it("always returns the viper for police", () => {
    const rng = createRngState(3);
    for (let i = 0; i < 50; i++) {
      expect(pickRecord(rng, records, "police")?.key).toBe("viper");
    }
  });

  it("never returns a record without a token of the role", () => {
    const rng = createRngState(4);
    for (const role of POPULATOR_ROLES) {
      for (let i = 0; i < 100; i++) {
        const record = pickRecord(rng, records, role);
        expect(
          record?.roles.some((token) => parseRoleToken(token)?.role === role),
        ).toBe(true);
      }
    }
  });

  it("never returns a zero-weight record and weights by the token suffix", () => {
    const pool: InertShipRecord[] = [
      {
        key: "zero",
        roles: ["trader(0)"],
        scanClass: "CLASS_NEUTRAL",
        radius: 1,
        ...DEFAULT_BANK,
      },
      {
        key: "bad",
        roles: ["trader(abc)"],
        scanClass: "CLASS_NEUTRAL",
        radius: 1,
        ...DEFAULT_BANK,
      },
      {
        key: "one",
        roles: ["trader"],
        scanClass: "CLASS_NEUTRAL",
        radius: 1,
        ...DEFAULT_BANK,
      },
      {
        key: "three",
        roles: ["trader(3)"],
        scanClass: "CLASS_NEUTRAL",
        radius: 1,
        ...DEFAULT_BANK,
      },
    ];
    const rng = createRngState(5);
    const counts: Record<string, number> = { one: 0, three: 0 };
    for (let i = 0; i < 4000; i++) {
      const key = pickRecord(rng, pool, "trader")?.key ?? "none";
      expect(key === "one" || key === "three").toBe(true);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    expect((counts["three"] ?? 0) / 4000).toBeGreaterThan(0.7);
    expect((counts["three"] ?? 0) / 4000).toBeLessThan(0.8);
  });

  it("returns undefined without a draw when no record has a positive weight", () => {
    const rng = createRngState(6);
    const before = rng.s;
    expect(pickRecord(rng, records, "assassin")).toBeUndefined();
    expect(pickRecord(rng, [], "trader")).toBeUndefined();
    expect(
      pickRecord(
        rng,
        [{ roles: ["trader(0)"] }, { roles: ["constructor"] }],
        "trader",
      ),
    ).toBeUndefined();
    expect(rng.s).toBe(before);
  });

  it("matches role names by equality only", () => {
    const pool = [{ roles: ["constructor", "__proto__", "toString"] }];
    expect(pickRecord(createRngState(1), pool, "trader")).toBeUndefined();
    expect(pickRecord(createRngState(1), pool, "constructor")).toBe(pool[0]);
  });
});

describe("INERT_POPULATION", () => {
  it("is the 12-ship table of the six roles", () => {
    const perRole: Record<string, number> = {};
    for (const entry of INERT_POPULATION) {
      perRole[entry.role] = (perRole[entry.role] ?? 0) + entry.count;
    }
    expect(perRole).toEqual({
      trader: 3,
      pirate: 3,
      hunter: 2,
      police: 2,
      shuttle: 1,
      scavenger: 1,
    });
    expect(Object.isFrozen(INERT_POPULATION)).toBe(true);
  });
});

describe("planInertPopulation over the Lave layout", () => {
  const lanes: Record<string, (p: Vec3) => boolean> = {
    LANE_WP: (p) =>
      dist(p, ORIGIN) >= layout.scannerRange &&
      dist(p, layout.planet.position) >= layout.planet.radius * 3 &&
      distanceToSegment(p, ORIGIN, layout.planet.position) <= LANE_WIDTH + 1e-6,
    LANE_WS: (p) =>
      dist(p, ORIGIN) >= layout.scannerRange &&
      dist(p, layout.sun.position) >= layout.sun.radius * 3 &&
      distanceToSegment(p, ORIGIN, layout.sun.position) <= LANE_WIDTH + 1e-6,
    LANE_PS: (p) =>
      dist(p, layout.planet.position) >= layout.planet.radius * 3 &&
      dist(p, layout.sun.position) >= layout.sun.radius * 3 &&
      distanceToSegment(p, layout.planet.position, layout.sun.position) <=
        LANE_WIDTH + 1e-6,
    STATION_AEGIS: (p) =>
      dist(p, layout.station.position) >= layout.station.radius * 1.2 &&
      dist(p, layout.station.position) <= layout.scannerRange * 2 + 1e-6 &&
      lengthSquared(sub(p, layout.planet.position)) >=
        layout.planet.radius * layout.planet.radius * 1.5,
  };

  function inRegion(code: LocationCode, p: Vec3): boolean {
    if (code === "LANE_WPS") {
      return (
        (lanes["LANE_WP"]?.(p) ?? false) ||
        (lanes["LANE_PS"]?.(p) ?? false) ||
        (lanes["LANE_WS"]?.(p) ?? false)
      );
    }
    return lanes[code]?.(p) ?? false;
  }

  it("returns one planned ship per table slot with its region predicate satisfied", () => {
    const plan = planInertPopulation(
      createRngState(LAVE_EPOCH1_WORLD_SEED),
      layout,
      records,
    );
    expect(plan.ships).toHaveLength(12);
    expect(plan.fallbacks).toBe(0);
    const expectedRoles = INERT_POPULATION.flatMap((entry) =>
      Array.from({ length: entry.count }, () => entry.role),
    );
    expect(plan.ships.map((ship) => ship.role)).toEqual(expectedRoles);
    for (const ship of plan.ships) {
      expect(inRegion(ship.location, ship.position)).toBe(true);
      const record = records.find((candidate) => candidate.key === ship.key);
      expect(record).toBeDefined();
      expect(record?.scanClass).toBe(ship.scanClass);
      expect(record?.radius).toBe(ship.radius);
      expect(
        record?.roles.some(
          (token) => parseRoleToken(token)?.role === ship.role,
        ),
      ).toBe(true);
      const q = ship.orientation;
      expect(
        Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1),
      ).toBeLessThan(1e-9);
    }
    for (const ship of plan.ships.filter((s) => s.role === "police")) {
      expect(ship.key).toBe("viper");
    }
  });

  it("is a pure function of the stream state", () => {
    const a = planInertPopulation(createRngState(99), layout, records);
    const b = planInertPopulation(createRngState(99), layout, records);
    expect(a).toEqual(b);
  });

  it("plans the same ships from the full committed list and from the INERT_RECORD_KEYS records only (FOUND-20)", () => {
    const nineOnly = records.filter((record) =>
      INERT_RECORD_KEYS.includes(record.key),
    );
    expect(planInertPopulation(createRngState(99), layout, records)).toEqual(
      planInertPopulation(createRngState(99), layout, nineOnly),
    );
  });
});

describe("cargo at spawn (D-06)", () => {
  /** A stream at a fixed seed, plus the first two draws it will give. */
  function stream(seed = 0x1234abcd): {
    rng: ReturnType<typeof createRngState>;
    r1: number;
    r2: number;
  } {
    const probe = createRngState(seed);
    return {
      rng: createRngState(seed),
      r1: rngNext(probe),
      r2: rngNext(probe),
    };
  }

  it("traders draw likelyCargo * (0.5 + r) truncated, capped at maxCargo", () => {
    const a = stream();
    expect(cargoCountAtSpawn("trader", 5, 7, a.rng)).toBe(
      Math.min(Math.floor(5 * (0.5 + a.r1)), 7),
    );
    const b = stream();
    const ten = cargoCountAtSpawn("trader", 10, 10, b.rng);
    expect(ten).toBe(Math.min(Math.floor(10 * (0.5 + b.r1)), 10));
    expect(ten).toBeGreaterThanOrEqual(5);
    expect(ten).toBeLessThanOrEqual(10);
    // One draw only: the stream is advanced exactly once.
    const after = createRngState(0x1234abcd);
    rngNext(after);
    expect(b.rng.s).toBe(after.s);
  });

  it("a shuttle with no likelyCargo takes the whole capacity without a draw", () => {
    const { rng } = stream();
    const before = rng.s;
    expect(cargoCountAtSpawn("shuttle", 0, 30, rng)).toBe(30);
    expect(rng.s).toBe(before);
  });

  it("zero likely and zero capacity give 0; a huge capacity caps at 200", () => {
    const { rng } = stream();
    const before = rng.s;
    expect(cargoCountAtSpawn("trader", 0, 0, rng)).toBe(0);
    expect(cargoCountAtSpawn("trader", 0, 500, rng)).toBe(200);
    expect(cargoCountAtSpawn("shuttle", 0, 500, rng)).toBe(MAX_ENTITY_CARGO);
    expect(rng.s).toBe(before);
  });

  it("a pirate draws num, then a Ranrot fraction of it: 0 or 1 for num 2", () => {
    const { rng, r1, r2 } = stream();
    // likely 2, max 2: num = floor(2 * (0.5 + r1)) capped at 2, then
    // floor(r2 * (1 + floor(num / 2))).
    const num = Math.min(Math.floor(2 * (0.5 + r1)), 2);
    const expected = num === 0 ? 0 : Math.floor(r2 * (1 + Math.floor(num / 2)));
    const count = cargoCountAtSpawn("pirate", 2, 2, rng);
    expect(count).toBe(expected);
    expect([0, 1]).toContain(count);
  });

  it("a pirate whose num is 0 gives 0 and draws at most once", () => {
    const { rng } = stream();
    const before = rng.s;
    expect(cargoCountAtSpawn("pirate", 0, 0, rng)).toBe(0);
    expect(rng.s).toBe(before);
    // likely 1, max 0: the capacity caps num at 0 after one draw, no second.
    const one = stream();
    expect(cargoCountAtSpawn("pirate", 1, 0, one.rng)).toBe(0);
    const after = createRngState(0x1234abcd);
    rngNext(after);
    expect(one.rng.s).toBe(after.s);
  });

  it("hunter, police and scavenger carry nothing and leave the stream alone", () => {
    for (const role of ["hunter", "police", "scavenger"] as const) {
      const { rng } = stream();
      const before = rng.s;
      expect(cargoCountAtSpawn(role, 10, 10, rng)).toBe(0);
      expect(rng.s).toBe(before);
    }
  });

  it("counts an input that is not a safe integer >= 0 as 0", () => {
    for (const bad of [Number.NaN, -1, 1.5, Infinity, -Infinity]) {
      const likelyBad = stream();
      // A bad likelyCargo is 0, so the capacity is taken whole.
      expect(cargoCountAtSpawn("trader", bad, 30, likelyBad.rng)).toBe(30);
      const maxBad = stream();
      expect(cargoCountAtSpawn("trader", 5, bad, maxBad.rng)).toBe(0);
      expect(cargoCountAtSpawn("shuttle", bad, bad, stream().rng)).toBe(0);
    }
  });

  it("is a safe integer in 0..200 for any role and any numbers, without throwing", () => {
    const weird = fc.oneof(
      fc.integer({ min: -5, max: 500 }),
      fc.double({ noNaN: false }),
      fc.constantFrom(
        Number.NaN,
        Infinity,
        -Infinity,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_VALUE,
      ),
    );
    fc.assert(
      fc.property(
        fc.constantFrom<PopulatorRole>(...POPULATOR_ROLES),
        weird,
        weird,
        fc.integer({ min: 0, max: 0xffffffff }),
        (role, likely, max, seed) => {
          const count = cargoCountAtSpawn(
            role,
            likely,
            max,
            createRngState(seed),
          );
          expect(Number.isSafeInteger(count)).toBe(true);
          expect(count).toBeGreaterThanOrEqual(0);
          expect(count).toBeLessThanOrEqual(MAX_ENTITY_CARGO);
        },
      ),
      { numRuns: 500 },
    );
  });

  describe("the stateless stream leaves every hashed stream alone", () => {
    const catalogue = JSON.parse(
      readFileSync(
        new URL(
          "../../../src/content/generated/ships-npc.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { key: string; likelyCargo: number; maxCargo: number }[];
    const withCargo: InertShipRecord[] = records.map((record) => {
      const source = catalogue.find((ship) => ship.key === record.key);
      return {
        ...record,
        likelyCargo: source?.likelyCargo ?? 0,
        maxCargo: source?.maxCargo ?? 0,
      };
    });
    const withoutCargo: InertShipRecord[] = records.map((record) => ({
      key: record.key,
      roles: record.roles,
      scanClass: record.scanClass,
      radius: record.radius,
      maxEnergy: record.maxEnergy,
      energyRechargeRate: record.energyRechargeRate,
    }));

    it("gives the same world.rng, id counter and entity placements and streams, differing only in cargo", () => {
      const a = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, withCargo);
      const b = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, withoutCargo);
      expect(a.count).toBe(12);
      expect(b.count).toBe(12);
      expect(a.world.rng.s).toBe(b.world.rng.s);
      expect(a.world.store.nextId).toBe(b.world.store.nextId);
      a.world.store.live.forEach((entity, index) => {
        const other = b.world.store.live[index];
        expect(entity.id).toBe(other?.id);
        expect(entity.specKey).toBe(other?.specKey);
        expect(entity.position).toEqual(other?.position);
        expect(entity.orientation).toEqual(other?.orientation);
        expect(entity.rng).toEqual(other?.rng);
        expect(other?.cargo).toBe(0);
      });
      const cargoEntities = a.world.store.live.filter(
        (entity) => entity.cargo > 0,
      );
      expect(cargoEntities.length).toBeGreaterThanOrEqual(4);
    });

    it("the world section minus the v4 segments equals the section without cargo (the strip proof's premise)", () => {
      const a = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, withCargo);
      const b = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, withoutCargo);
      const stripped = serializeWorldSection(a.world).replace(
        /;(?:vel|wpn|cargo):[^;\n]*/g,
        "",
      );
      expect(stripped).toBe(serializeWorldSection(b.world));
      expect(serializeWorldSection(a.world)).not.toBe(
        serializeWorldSection(b.world),
      );
    });

    it("draws each count from forkSeed(worldSeed, id, 'cargo'), in spawn order", () => {
      const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
      const plan = planInertPopulation(
        createRngState(world.rng.s),
        layout,
        withCargo,
      );
      populateInertWorld(world, layout, withCargo);
      expect(world.store.live).toHaveLength(plan.ships.length);
      plan.ships.forEach((ship, index) => {
        const id = FIRST_DYNAMIC_ID + index;
        const entity = world.store.live[index];
        expect(entity?.id).toBe(id);
        expect(entity?.cargo).toBe(
          cargoCountAtSpawn(
            ship.role,
            ship.likelyCargo,
            ship.maxCargo,
            createRngState(forkSeed(LAVE_EPOCH1_WORLD_SEED, id, "cargo")),
          ),
        );
      });
    });
  });
});

describe("populateInertWorld", () => {
  it("spawns the 12-ship table: ids 101 to 112, inert, at tick 0, with the record's data", () => {
    const { world, count } = buildInertWorld(
      LAVE_EPOCH1_WORLD_SEED,
      layout,
      records,
    );
    expect(count).toBe(12);
    expect(world.store.live.map((entity) => entity.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => FIRST_DYNAMIC_ID + i),
    );
    expect(world.store.nextId).toBe(FIRST_DYNAMIC_ID + 12);
    for (const entity of world.store.live) {
      const record = records.find(
        (candidate) => candidate.key === entity.specKey,
      );
      expect(record).toBeDefined();
      expect(entity.ai).toBeNull();
      expect(entity.speed).toBe(0);
      expect(entity.kind).toBe("ship");
      expect(entity.spawnTick).toBe(0);
      expect(entity.radius).toBe(record?.radius);
      expect(entity.scanClass).toBe(record?.scanClass);
      // CBT-07: the energy bank of the record, full at spawn.
      expect(entity.maxEnergy).toBe(record?.maxEnergy);
      expect(entity.energy).toBe(record?.maxEnergy);
      expect(entity.energyRechargeRate).toBe(record?.energyRechargeRate);
    }
  });

  it("spawns the Lave ships with the energy the NPC records name", () => {
    // From the vendored shipdata (plan 13-16): adder 85 / 2, viper 180 / 4,
    // sidewinder 240 / 2, cobramk1 150 / 2.5, krait 250 / 2.5, moray 240 / 3.
    const expected: Record<string, readonly [number, number]> = {
      adder: [85, 2],
      viper: [180, 4],
      sidewinder: [240, 2],
      cobramk1: [150, 2.5],
      krait: [250, 2.5],
      moray: [240, 3],
    };
    const { world } = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, records);
    const seen = new Set<string>();
    for (const entity of world.store.live) {
      const want = expected[entity.specKey];
      expect(want, entity.specKey).toBeDefined();
      expect([
        entity.energy,
        entity.maxEnergy,
        entity.energyRechargeRate,
      ]).toEqual([want?.[0], want?.[0], want?.[1]]);
      seen.add(entity.specKey);
    }
    expect([...seen].sort()).toEqual(Object.keys(expected).sort());
  });

  it("gives the same world section for the same inputs and another for another seed", () => {
    const a = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, records).world;
    const b = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, records).world;
    const c = buildInertWorld(
      LAVE_EPOCH1_WORLD_SEED + 1,
      layout,
      records,
    ).world;
    expect(serializeWorldSection(a)).toBe(serializeWorldSection(b));
    expect(serializeWorldSection(a)).not.toBe(serializeWorldSection(c));
    expect(a.rng.s).toBe(b.rng.s);
  });

  it("draws nothing without records (D-01): the world stays never-spawned and hashes as the flight", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    const before = world.rng.s;
    expect(populateInertWorld(world, layout, [])).toBe(0);
    expect(world.rng.s).toBe(before);
    expect(isNeverSpawned(world)).toBe(true);
    const state = initFlightState(layout);
    expect(hashWorld(state, world)).toBe(hashFlight(state));
  });

  it("draws nothing when no record has a positive weight for any role", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    const before = world.rng.s;
    const useless: InertShipRecord[] = [
      {
        key: "x",
        roles: ["escort", "trader(0)"],
        scanClass: "CLASS_NEUTRAL",
        radius: 10,
        ...DEFAULT_BANK,
      },
    ];
    expect(populateInertWorld(world, layout, useless)).toBe(0);
    expect(world.rng.s).toBe(before);
    expect(isNeverSpawned(world)).toBe(true);
  });

  it("skips a spawn refusal and still returns the count of ships that spawned", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    const refused: InertShipRecord[] = [
      {
        key: "flat",
        roles: ["police"],
        scanClass: "CLASS_POLICE",
        radius: -1,
        ...DEFAULT_BANK,
      },
    ];
    expect(populateInertWorld(world, layout, refused)).toBe(0);
    expect(world.store.live).toHaveLength(0);
  });

  describe("a record with a scan class outside SCAN_CLASSES", () => {
    const bogus: InertShipRecord = {
      key: "bogus",
      roles: ["police", "trader"],
      scanClass: "CLASS_BOGUS",
      radius: 10,
      ...DEFAULT_BANK,
    };

    it("is dropped before planning: same section, same stream, same count, no throw", () => {
      const plain = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, records);
      const withBogus = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, [
        ...records,
        bogus,
      ]);
      expect(withBogus.count).toBe(12);
      expect(withBogus.count).toBe(plain.count);
      expect(serializeWorldSection(withBogus.world)).toBe(
        serializeWorldSection(plain.world),
      );
      expect(withBogus.world.rng.s).toBe(plain.world.rng.s);
      expect(
        withBogus.world.store.live.some((entity) => entity.specKey === "bogus"),
      ).toBe(false);
    });

    it("alone spawns nothing and spends no draw", () => {
      const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
      const before = world.rng.s;
      expect(populateInertWorld(world, layout, [bogus])).toBe(0);
      expect(world.rng.s).toBe(before);
      expect(isNeverSpawned(world)).toBe(true);
    });
  });

  it("keeps the world section identical over 600 ticks (nullAI ships stay inert, D-02)", () => {
    const { world } = buildInertWorld(LAVE_EPOCH1_WORLD_SEED, layout, records);
    const { layout: flightLayout, config } = laveFixture();
    const player = initFlightState(flightLayout);
    stepFlight(
      player,
      flightLayout,
      config,
      ZERO_INTENT,
      [{ kind: "launch" }],
      DT,
    );
    stepFlight(
      player,
      flightLayout,
      config,
      ZERO_INTENT,
      [{ kind: "skipLaunch" }],
      DT,
    );
    const before = serializeWorldSection(world);
    for (let i = 0; i < 600; i++) {
      stepFlight(player, flightLayout, config, ZERO_INTENT, [], DT);
      stepWorld(world, player, flightLayout, DT);
    }
    expect(serializeWorldSection(world)).toBe(before);
  });
});

interface InertGolden {
  readonly name: string;
  readonly worldSeed: number;
  readonly count: number;
  readonly fnv: string;
  readonly section: string;
}

describe("the Lave launch world golden (regression snapshot)", () => {
  const golden = JSON.parse(
    readFileSync(
      new URL("../../golden/world/inert-lave-epoch1.json", import.meta.url),
      "utf8",
    ),
  ) as InertGolden;

  it("rebuilds the committed world: seed, count, section text and hash", () => {
    expect(golden.name).toBe("inert-lave-epoch1");
    expect(golden.worldSeed).toBe(726_532_988);
    expect(golden.worldSeed).toBe(
      worldSeedFor(marketSeedForSystem("g0-s7"), 1),
    );
    const { world, count } = buildInertWorld(golden.worldSeed, layout, records);
    const section = serializeWorldSection(world);
    expect(count).toBe(golden.count);
    expect(count).toBe(12);
    expect(section).toBe(golden.section);
    expect(fnv1a32(section)).toBe(golden.fnv);
  });

  /** Remove the v4 segments (velocity, weapon, cargo) as plan 15-03 added them. */
  const stripV4 = (section: string): string =>
    section.replace(/;(?:vel|wpn|cargo):[^;\n]*/g, "");

  it("is the pre-v4 world plus one ;cargo: segment per loaded ship (FOUND-18, D-09)", () => {
    // The golden moved a third time in plan 15-03 (owner-chosen regeneration,
    // snapshot v4 with pristine-omit hashing, ROADMAP Phase 15): the populator
    // now gives traders, the shuttle and some pirates a cargo count. The
    // population draws did not move: with every v4 segment removed the section
    // is byte-identical to the golden before the phase (FNV-1a c1068643), so
    // keys, positions, orientations and streams are unchanged.
    expect(fnv1a32(stripV4(golden.section))).toBe("c1068643");
    const { world } = buildInertWorld(golden.worldSeed, layout, records);
    const loaded = world.store.live.filter((entity) => entity.cargo > 0);
    expect(golden.section.match(/;cargo:/g)).toHaveLength(loaded.length);
    expect(loaded.length).toBeGreaterThanOrEqual(4);
    expect(loaded.map((entity) => entity.id)).toEqual(
      expect.arrayContaining([101, 102, 103, 111]),
    );
    expect(golden.section).not.toMatch(/;vel:/);
    expect(golden.section).not.toMatch(/;wpn:/);
  });

  it("is the pre-steering world plus one steer: segment per ship: same ships at the same places (AI-01)", () => {
    // The golden moved a second time when the steering record joined the entity
    // line (plan 14-08, owner decision option-append, 2026-11-15) and a third
    // time in plan 15-03 (the cargo segments). The population draws did not
    // move: with every v4 segment and then every `;steer:` segment removed the
    // section is byte-identical to the previous golden (FNV-1a ab72eedf,
    // recorded before the record existed).
    const withoutSteer = stripV4(golden.section).replace(/;steer:[^;\n]*/g, "");
    expect(golden.section.match(/;steer:/g)).toHaveLength(golden.count);
    expect(fnv1a32(withoutSteer)).toBe("ab72eedf");
  });

  it("is the pre-energy world plus one en: segment per ship: same ships at the same places (CBT-07)", () => {
    // The golden moved once when the energy bank joined the entity line (and
    // again in plans 14-08 and 15-03). The population draws did not move: with
    // every v4 segment, every `;steer:` and every `en:` segment removed the
    // section is byte-identical to the golden recorded before the bank existed
    // (FNV-1a b23d11d8), so keys, positions, orientations and streams are
    // unchanged.
    const withoutEnergy = stripV4(golden.section)
      .replace(/;steer:[^;\n]*/g, "")
      .replace(/;en:[0-9.,]+/g, "");
    expect(golden.section.match(/;en:/g)).toHaveLength(golden.count);
    expect(fnv1a32(withoutEnergy)).toBe("b23d11d8");
  });

  it("gives the twelve Lave ships these cargo counts (D-06)", () => {
    // Read once from the rebuilt world and written here by hand, so a change to
    // cargoCountAtSpawn fails on a readable diff and not only on an FNV value.
    const { world } = buildInertWorld(golden.worldSeed, layout, records);
    const plan = planInertPopulation(
      createRngState(createWorld(golden.worldSeed).rng.s),
      layout,
      records,
    );
    const rebuilt = world.store.live.map((entity, index) => ({
      id: entity.id,
      role: plan.ships[index]?.role,
      key: entity.specKey,
      cargo: entity.cargo,
    }));
    expect(rebuilt).toEqual([
      { id: 101, role: "trader", key: "moray", cargo: 5 },
      { id: 102, role: "trader", key: "cobramk1", cargo: 10 },
      { id: 103, role: "trader", key: "adder", cargo: 2 },
      { id: 104, role: "hunter", key: "sidewinder", cargo: 0 },
      { id: 105, role: "hunter", key: "sidewinder", cargo: 0 },
      { id: 106, role: "pirate", key: "krait", cargo: 0 },
      { id: 107, role: "pirate", key: "sidewinder", cargo: 0 },
      { id: 108, role: "pirate", key: "moray", cargo: 1 },
      { id: 109, role: "police", key: "viper", cargo: 0 },
      { id: 110, role: "police", key: "viper", cargo: 0 },
      { id: 111, role: "shuttle", key: "adder", cargo: 2 },
      { id: 112, role: "scavenger", key: "cobramk1", cargo: 0 },
    ]);
  });

  it("gives every inert ship the default steering record: slot 0, unresolved accuracy, no curve", () => {
    const { world } = buildInertWorld(golden.worldSeed, layout, records);
    expect(world.store.live).toHaveLength(golden.count);
    for (const entity of world.store.live) {
      expect(entity.steer).toEqual({
        flightRoll: 0,
        flightPitch: 0,
        stickRoll: 0,
        stickPitch: 0,
        accuracy: -100,
        frustration: 0,
        successFactor: 0,
        pitchingOver: false,
        jink: vec(0, 0, 0),
        proximityAlert: 0,
        escortSlot: 0,
        trackingCount: 0,
        trackingTicks: [0, 0, 0, 0],
        trackingPositions: [
          vec(0, 0, 0),
          vec(0, 0, 0),
          vec(0, 0, 0),
          vec(0, 0, 0),
        ],
        saved: null,
        entryPending: false,
      });
    }
  });
});

describe("every galaxy-0 system populates without a fallback (T-12-16)", () => {
  const systems = JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/systems/g0.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as System[];

  it("spawns 12 ships per system at epoch 1 and takes no capped last candidate", () => {
    expect(systems).toHaveLength(256);
    for (const system of systems) {
      // Each system's own station: `deriveSystemLayout` refuses another kind's
      // spec (Phase 22.1, Pitfall P2).
      const systemLayout = deriveSystemLayout(
        system,
        stationSpecOf(system.station),
      );
      const seed = worldSeedFor(marketSeedForSystem(system.id), 1);
      const probe = createWorld(seed);
      const plan = planInertPopulation(
        createRngState(probe.rng.s),
        systemLayout,
        records,
      );
      expect([system.id, plan.fallbacks]).toEqual([system.id, 0]);
      const { count } = buildInertWorld(seed, systemLayout, records);
      expect([system.id, count]).toEqual([system.id, 12]);
    }
  });

  it("samples the tightest lane (planet to sun in g1-s45) without a fallback at epochs 1 to 32", () => {
    const galaxy1 = JSON.parse(
      readFileSync(
        new URL(
          "../../../src/content/generated/systems/g1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as System[];
    const tight = galaxy1.find((system) => system.id === "g1-s45");
    expect(tight).toBeDefined();
    const tightLayout = deriveSystemLayout(
      tight as System,
      stationSpecOf((tight as System).station),
    );
    for (let epoch = 1; epoch <= 32; epoch++) {
      const rng = createWorld(
        worldSeedFor(marketSeedForSystem("g1-s45"), epoch),
      ).rng;
      expect([
        epoch,
        locationByCode(rng, "LANE_PS", tightLayout).fallback,
      ]).toEqual([epoch, false]);
    }
  });
});
