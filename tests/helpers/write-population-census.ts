// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Write the initial-population census golden (WORLD-08 criterion 3, plan 22-12).
 *
 * `tests/golden/world/population-census.json` records, for every system of the
 * censused galaxies and every epoch, the population the production path builds
 * (`populateSystemWorld` over `createWorld(worldSeedFor(marketSeedForSystem(id),
 * epoch))`, the system's layout, facts and the committed catalogue): the ship
 * count, the group records, the distinct hull keys and the realised NPC
 * triangles, plus the statistics over them (mean, median, p95, p99, the peak, the
 * per-government figures, the anarchy tail, the peaks of groups, triangles and
 * calls) and the systems the QUAL-09 browser spec boots.
 *
 * Run once in the container, over the whole scope, then only asserted. Never
 * rerun it to make a test pass: a moved number is a finding with a cause.
 *
 *   docker compose run --rm test npx tsx tests/helpers/write-population-census.ts
 *   docker compose run --rm test npx prettier --write tests/golden/world/population-census.json
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { galaxySystems } from "./population-fixtures.js";
import {
  censusSystems,
  censusWorld,
  chooseSpecSystems,
  digestMap,
  summarise,
} from "./population-census.js";
import type { CensusRow } from "./population-census.js";

/** Galaxies censused: `0..GALAXIES-1`. */
const GALAXIES = 1;
/** Epochs censused: `1..EPOCHS`. */
const EPOCHS = 1;

const OUTPUT = new URL(
  "../golden/world/population-census.json",
  import.meta.url,
);

const started = Date.now();
const rows: CensusRow[] = [];
for (const entry of censusSystems(GALAXIES)) {
  for (let epoch = 1; epoch <= EPOCHS; epoch += 1) {
    const { row } = censusWorld(entry, epoch);
    if (row.skippedGroups !== 0 || row.fallbacks !== 0) {
      throw new Error(
        `${row.id} epoch ${String(epoch)}: ${String(row.skippedGroups)} skipped groups, ${String(row.fallbacks)} fallbacks; this is a finding, not a golden`,
      );
    }
    rows.push(row);
  }
}

const galaxy0 = galaxySystems(0);
const nameOf = (id: string): string => {
  const system = galaxy0.find((candidate) => candidate.id === id);
  if (system === undefined) throw new Error(`no galaxy-0 system "${id}"`);
  return system.name;
};

const golden = {
  name: "population-census",
  galaxies: GALAXIES,
  ...summarise(rows),
  specSystems: chooseSpecSystems(rows, nameOf),
  digest: digestMap(rows),
};

mkdirSync(new URL("../golden/world/", import.meta.url), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(golden, null, 2)}\n`);
console.log(
  `census: ${String(rows.length)} worlds in ${String(Date.now() - started)} ms`,
);
