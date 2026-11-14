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

import { describe, expect, it } from "vitest";

import { initFlightState, hashFlight } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { length, lengthSquared, sub, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { createRngState, worldSeedFor } from "../../../src/sim/rng.js";
import { fnv1a32 } from "../../../src/sim/hash.js";
import type { System } from "../../../src/content/types.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { DT } from "../../../src/sim/time.js";
import { FIRST_DYNAMIC_ID } from "../../../src/sim/world/ids.js";
import {
  INERT_POPULATION,
  POPULATOR_ROLES,
  isScanClass,
  parseRoleToken,
  pickRecord,
  planInertPopulation,
  populateInertWorld,
} from "../../../src/sim/world/populate.js";
import type { InertShipRecord } from "../../../src/sim/world/populate.js";
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

const { layout } = laveFixture();
const records = laveInertRecords();
const ORIGIN = vec(0, 0, 0);

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
      },
      {
        key: "bad",
        roles: ["trader(abc)"],
        scanClass: "CLASS_NEUTRAL",
        radius: 1,
      },
      { key: "one", roles: ["trader"], scanClass: "CLASS_NEUTRAL", radius: 1 },
      {
        key: "three",
        roles: ["trader(3)"],
        scanClass: "CLASS_NEUTRAL",
        radius: 1,
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
    }
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
      },
    ];
    expect(populateInertWorld(world, layout, useless)).toBe(0);
    expect(world.rng.s).toBe(before);
    expect(isNeverSpawned(world)).toBe(true);
  });

  it("skips a spawn refusal and still returns the count of ships that spawned", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    const refused: InertShipRecord[] = [
      { key: "flat", roles: ["police"], scanClass: "CLASS_POLICE", radius: -1 },
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
  const { stationDef } = laveFixture();

  it("spawns 12 ships per system at epoch 1 and takes no capped last candidate", () => {
    expect(systems).toHaveLength(256);
    for (const system of systems) {
      const systemLayout = deriveSystemLayout(system, stationDef);
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
    const tightLayout = deriveSystemLayout(tight as System, stationDef);
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
