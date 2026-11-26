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
import {
  callBound,
  catalogueHullTriangles,
  censusSystems,
  censusWorld,
  digestToken,
  tokenAt,
  triangleTotal,
} from "../../../helpers/population-census.js";
import type { CensusRow } from "../../../helpers/population-census.js";

/** Epochs the default run recomputes. */
const DEFAULT_EPOCHS = 4;
/** One galaxy's worlds take a few seconds; the default run takes tens. */
const GALAXY_TIMEOUT_MS = 300_000;

const FULL = process.env["POPULATION_CENSUS_FULL"] === "1";

interface Golden {
  readonly galaxies: number;
  readonly epochs: number;
  readonly skippedGroups: number;
  readonly fallbacks: number;
  readonly digest: Readonly<Record<string, string>>;
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
