// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The initial-population census (Phase 22 plan 22-12; WORLD-08 criterion 3, D-06,
 * D-11, QUAL-09's census half).
 *
 * Every system of the censused galaxies is populated through the production path
 * (`populateSystemWorld` over `createWorld(worldSeedFor(marketSeedForSystem(id),
 * epoch))`, see `tests/helpers/population-census.ts`) and checked against the
 * recorded golden `tests/golden/world/population-census.json`. The default run
 * recomputes epochs 1 to {@link DEFAULT_EPOCHS}; `POPULATION_CENSUS_FULL=1`
 * recomputes every recorded epoch and every statistic.
 *
 * What each world must do (the expectations are Oolite-independent bounds, not
 * the port's own arithmetic): no group skipped and no placement fallback (D-06,
 * the cap rule never triggers), the ship count strictly below
 * `POPULATION_ENTITY_LIMIT`, the group records strictly below `MAX_WORLD_GROUPS`
 * (D-11), and the scene's triangles plus the NPC triangles plus the fight delta
 * within `TRIANGLE_BUDGET` with the analytic call bound within `DRAW_CALL_BUDGET`
 * (QUAL-09, the one source of both is `tests/e2e/helpers/budgets.ts`).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  MAX_WORLD_GROUPS,
  POPULATION_ENTITY_LIMIT,
} from "../../../../src/sim/world/limits.js";
import {
  DRAW_CALL_BUDGET,
  TRIANGLE_BUDGET,
  withinBudget,
} from "../../../e2e/helpers/budgets.js";
import { glbTriangleCount } from "../../../helpers/glb-triangles.js";
import { galaxySystems } from "../../../helpers/population-fixtures.js";
import {
  DOCKED_LAUNCH_EPOCH,
  SCENE_CALLS,
  SCENE_TRIANGLES_TRAFFIC_ON,
  callBound,
  catalogueHullTriangles,
  censusSystems,
  censusWorld,
  digestMap,
  digestToken,
  rowsFromDigest,
  summarise,
  tokenAt,
  triangleTotal,
} from "../../../helpers/population-census.js";
import type {
  CensusRow,
  CensusStats,
  SpecSystems,
} from "../../../helpers/population-census.js";

/** Epochs the default run recomputes. */
const DEFAULT_EPOCHS = 4;
/** One galaxy's worlds take a few seconds; the default run takes tens. */
const GALAXY_TIMEOUT_MS = 300_000;

const FULL = process.env["POPULATION_CENSUS_FULL"] === "1";

interface Golden extends CensusStats {
  readonly name: string;
  readonly galaxies: number;
  readonly specSystems: SpecSystems;
  readonly digest: Readonly<Record<string, string>>;
}

/** The recorded statistics: the golden without its name, scope, spec systems and digest. */
function recordedStats(): CensusStats {
  const notStatistics = new Set(["name", "galaxies", "specSystems", "digest"]);
  return Object.fromEntries(
    Object.entries(golden).filter(([key]) => !notStatistics.has(key)),
  ) as unknown as CensusStats;
}

const golden = JSON.parse(
  readFileSync(
    new URL("../../../golden/world/population-census.json", import.meta.url),
    "utf8",
  ),
) as Golden;

/** One world's violations of the per-world rules, empty when it is sound. */
function violations(row: CensusRow): string[] {
  const out: string[] = [];
  const where = `${row.id} epoch ${String(row.epoch)}`;
  if (row.skippedGroups !== 0) {
    out.push(`${where}: ${String(row.skippedGroups)} skipped groups`);
  }
  if (row.fallbacks !== 0) {
    out.push(`${where}: ${String(row.fallbacks)} placement fallbacks`);
  }
  if (row.ships >= POPULATION_ENTITY_LIMIT) {
    out.push(`${where}: ${String(row.ships)} ships reach the entity limit`);
  }
  if (row.groups >= MAX_WORLD_GROUPS) {
    out.push(`${where}: ${String(row.groups)} group records reach the bound`);
  }
  if (!withinBudget(triangleTotal(row), TRIANGLE_BUDGET)) {
    out.push(`${where}: ${String(triangleTotal(row))} triangles over budget`);
  }
  if (!withinBudget(callBound(row), DRAW_CALL_BUDGET)) {
    out.push(`${where}: ${String(callBound(row))} draw calls over budget`);
  }
  return out;
}

describe("glbTriangleCount", () => {
  it("counts the committed hulls to within 1 % of the 27,019 triangles measured from the accessors", () => {
    let sum = 0;
    for (const triangles of catalogueHullTriangles().values()) sum += triangles;
    expect(Math.abs(sum - 27_019) / 27_019).toBeLessThan(0.01);
  });

  it("counts every committed hull above zero", () => {
    for (const [key, triangles] of catalogueHullTriangles()) {
      expect([key, triangles > 0]).toEqual([key, true]);
    }
  });

  it("refuses a file that is not a GLB container", () => {
    expect(() =>
      glbTriangleCount(new URL("../../../../package.json", import.meta.url)),
    ).toThrow(/not a GLB container/);
  });
});

describe("the initial-population census over the production path", () => {
  const epochs = Math.min(golden.epochs, FULL ? golden.epochs : DEFAULT_EPOCHS);
  const systems = censusSystems(golden.galaxies);

  for (let galaxy = 0; galaxy < golden.galaxies; galaxy += 1) {
    it(
      `galaxy ${String(galaxy)}: every system at epochs 1 to ${String(epochs)} skips no group, takes no fallback, stays inside the cap, the group bound and both budgets, and equals the golden digest`,
      () => {
        const problems: string[] = [];
        for (const entry of systems) {
          if (entry.system.galaxy !== galaxy) continue;
          const recorded = golden.digest[entry.system.id];
          if (recorded === undefined) {
            problems.push(`${entry.system.id}: not in the golden`);
            continue;
          }
          for (let epoch = 1; epoch <= epochs; epoch += 1) {
            const { row } = censusWorld(entry, epoch);
            problems.push(...violations(row));
            const expected = tokenAt(recorded, epoch);
            if (digestToken(row) !== expected) {
              problems.push(
                `${row.id} epoch ${String(epoch)}: ${digestToken(row)} differs from the golden ${String(expected)}`,
              );
            }
          }
        }
        expect(problems).toEqual([]);
      },
      GALAXY_TIMEOUT_MS,
    );
  }

  it("records no skipped group and no fallback in the golden", () => {
    expect(golden.skippedGroups).toBe(0);
    expect(golden.fallbacks).toBe(0);
  });
});

/** Every recorded world, decoded from the golden's digest. */
function goldenRows(): CensusRow[] {
  const rows: CensusRow[] = [];
  for (let galaxy = 0; galaxy < golden.galaxies; galaxy += 1) {
    for (const system of galaxySystems(galaxy)) {
      const digest = golden.digest[system.id];
      if (digest === undefined) throw new Error(`${system.id} is not recorded`);
      rows.push(
        ...rowsFromDigest(
          system.id,
          system.galaxy,
          system.systemIndex,
          system.government,
          digest,
        ),
      );
    }
  }
  return rows;
}

describe("the recorded census is consistent", () => {
  const rows = goldenRows();

  it("covers every system of the censused galaxies at every recorded epoch", () => {
    expect(golden.systems).toBe(golden.galaxies * 256);
    expect(Object.keys(golden.digest)).toHaveLength(golden.systems);
    expect(rows).toHaveLength(golden.systems * golden.epochs);
    expect(golden.worlds).toBe(rows.length);
  });

  it("gives the mean, the percentiles, the median and the peak the digest implies", () => {
    const ships = rows.map((row) => row.ships).sort((a, b) => a - b);
    const total = ships.reduce((sum, value) => sum + value, 0);
    expect(golden.mean).toBeCloseTo(total / ships.length, 5);
    // nearest rank: the smallest value with at least p of the worlds at or below it
    expect(golden.p95).toBe(ships[Math.ceil(0.95 * ships.length) - 1]);
    expect(golden.p99).toBe(ships[Math.ceil(0.99 * ships.length) - 1]);
    const half = ships.length / 2;
    expect(golden.median).toBe(
      Number.isInteger(half)
        ? ((ships[half - 1] as number) + (ships[half] as number)) / 2
        : ships[Math.floor(half)],
    );
    const peak = Math.max(...ships);
    expect(golden.peak.ships).toBe(peak);
    const named = rows.find(
      (row) => row.id === golden.peak.system && row.epoch === golden.peak.epoch,
    );
    expect(named?.ships).toBe(peak);
  });

  it("holds the ten largest government-0 worlds in descending order", () => {
    const tail = golden.anarchyTail;
    expect(tail).toHaveLength(10);
    const anarchies = rows.filter((row) => row.government === 0);
    const named = new Set(tail.map((t) => `${t.system}@${String(t.epoch)}`));
    expect(named.size).toBe(10);
    for (const entry of tail) {
      const row = anarchies.find(
        (candidate) =>
          candidate.id === entry.system && candidate.epoch === entry.epoch,
      );
      expect([entry.system, row?.ships]).toEqual([entry.system, entry.ships]);
    }
    for (let i = 1; i < tail.length; i += 1) {
      expect((tail[i - 1] as { ships: number }).ships).toBeGreaterThanOrEqual(
        (tail[i] as { ships: number }).ships,
      );
    }
    const cutoff = (tail[9] as { ships: number }).ships;
    for (const row of anarchies) {
      if (!named.has(`${row.id}@${String(row.epoch)}`)) {
        expect(row.ships).toBeLessThanOrEqual(cutoff);
      }
    }
  });

  it("gives the per-government mean and peak the digest implies", () => {
    for (const [government, stats] of Object.entries(golden.byGovernment)) {
      const group = rows.filter((row) => row.government === Number(government));
      expect(stats.worlds).toBe(group.length);
      expect(stats.peak).toBe(Math.max(...group.map((row) => row.ships)));
      expect(stats.mean).toBeCloseTo(
        group.reduce((sum, row) => sum + row.ships, 0) / group.length,
        5,
      );
    }
  });

  it("equals the statistics computed from its own digest", () => {
    expect(summarise(rows)).toEqual(recordedStats());
  });

  it("holds the group peak under the bound, the largest world under the cap with room left, and every world within both budgets", () => {
    expect(golden.peakGroups.groups).toBeLessThan(MAX_WORLD_GROUPS);
    expect(golden.peakHeadroom).toEqual({
      limit: POPULATION_ENTITY_LIMIT,
      ships: golden.peak.ships,
      headroom: POPULATION_ENTITY_LIMIT - golden.peak.ships,
    });
    expect(golden.peakHeadroom.headroom).toBeGreaterThan(0);
    expect(golden.peakNpcTriangles.total).toBeLessThanOrEqual(TRIANGLE_BUDGET);
    expect(golden.peakCalls.calls).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
    expect(rows.flatMap(violations)).toEqual([]);
  });
});

describe("the budget peaks rest on Coriolis worlds (owner decision D-A)", () => {
  it("names only Coriolis systems for every peak, because the scene constants are measured on the Lave (Coriolis) scene", () => {
    const stationOf = new Map<string, string>();
    for (let galaxy = 0; galaxy < golden.galaxies; galaxy += 1) {
      for (const system of galaxySystems(galaxy)) {
        stationOf.set(system.id, system.station);
      }
    }
    const peaks = {
      peak: golden.peak.system,
      peakGroups: golden.peakGroups.system,
      peakNpcTriangles: golden.peakNpcTriangles.system,
      peakCalls: golden.peakCalls.system,
      peakKeys: golden.peakKeys.system,
    };
    const offenders = Object.entries(peaks)
      .filter(([, id]) => stationOf.get(id) !== "coriolis")
      .map(([name, id]) => `${name}: ${id} (${String(stationOf.get(id))})`);
    expect(
      offenders,
      `a census peak moved to a system of another station kind; SCENE_TRIANGLES_TRAFFIC_ON (${String(SCENE_TRIANGLES_TRAFFIC_ON)}) and SCENE_CALLS (${String(SCENE_CALLS)}) are measured on the Lave (Coriolis) scene and must become per-kind before such a peak is accepted`,
    ).toEqual([]);
  });
});

describe("the edge worlds", () => {
  it("holds exactly the station patrol in g7-s162 (Oresrati) at every epoch", () => {
    const entry = censusSystems(8).find((e) => e.system.id === "g7-s162");
    if (entry === undefined) throw new Error("g7-s162 is not in the census");
    const recorded = (golden.digest["g7-s162"] as string).split(" ");
    expect(recorded).toHaveLength(golden.epochs);
    for (let epoch = 1; epoch <= golden.epochs; epoch += 1) {
      const { row, world } = censusWorld(entry, epoch);
      expect([epoch, row.ships]).toEqual([epoch, 1]);
      expect(recorded[epoch - 1]?.startsWith("1/")).toBe(true);
      expect(world.store.live.map((ship) => ship.role)).toEqual([
        "police-station-patrol",
      ]);
    }
  });
});

describe("the systems the QUAL-09 browser spec boots", () => {
  const rows = goldenRows();
  const galaxy0 = galaxySystems(0);
  const anarchies = rows.filter(
    (row) =>
      row.galaxy === 0 &&
      row.government === 0 &&
      row.epoch === DOCKED_LAUNCH_EPOCH,
  );

  it("names the epoch a docked-save launch builds", () => {
    expect(golden.specSystems.dockedLaunchEpoch).toBe(DOCKED_LAUNCH_EPOCH);
    expect(DOCKED_LAUNCH_EPOCH).toBe(1);
  });

  it("picks the galaxy-0 anarchy with the most ships and the one with the most hull keys", () => {
    const { largestAnarchy, mostKeysAnarchy } = golden.specSystems;
    expect(largestAnarchy.ships).toBe(
      Math.max(...anarchies.map((row) => row.ships)),
    );
    expect(mostKeysAnarchy.keys).toBe(
      Math.max(...anarchies.map((row) => row.keys)),
    );
    for (const spec of [largestAnarchy, mostKeysAnarchy]) {
      const system = galaxy0.find((candidate) => candidate.id === spec.id);
      expect(system?.government).toBe(0);
      // dockedSaveAt takes the name, and the first system of that name must be this one
      expect(system?.name).toBe(spec.name);
      expect(
        galaxy0.find((candidate) => candidate.name === spec.name)?.id,
      ).toBe(spec.id);
      expect(spec.epoch).toBe(DOCKED_LAUNCH_EPOCH);
      expect(
        `${String(spec.ships)}/${String(spec.groups)}/${String(spec.keys)}/${String(spec.triangles)}`,
      ).toBe(tokenAt(golden.digest[spec.id] as string, spec.epoch));
    }
  });

  it("realises the named worlds as the recorded numbers say", () => {
    const entries = censusSystems(1);
    for (const spec of [
      golden.specSystems.largestAnarchy,
      golden.specSystems.mostKeysAnarchy,
    ]) {
      const entry = entries.find((e) => e.system.id === spec.id);
      if (entry === undefined) throw new Error(`${spec.id} is not in galaxy 0`);
      const { row } = censusWorld(entry, spec.epoch);
      expect([row.ships, row.keys, row.triangles, row.groups]).toEqual([
        spec.ships,
        spec.keys,
        spec.triangles,
        spec.groups,
      ]);
    }
  });
});

describe.skipIf(!FULL)("the full census (POPULATION_CENSUS_FULL=1)", () => {
  it("recomputes every system at every recorded epoch: no skipped group, no fallback, every statistic and the whole digest equal the golden", () => {
    const rows: CensusRow[] = [];
    for (const entry of censusSystems(golden.galaxies)) {
      for (let epoch = 1; epoch <= golden.epochs; epoch += 1) {
        rows.push(censusWorld(entry, epoch).row);
      }
    }
    expect(rows.flatMap(violations)).toEqual([]);
    expect(digestMap(rows)).toEqual(golden.digest);
    expect(summarise(rows)).toEqual(recordedStats());
  }, 600_000);
});
