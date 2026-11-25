// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Write the Lave inert world epoch 1-20 golden (FOUND-20, plan 21-01).
 *
 * `tests/golden/world/inert-lave-epochs-1-20.json` pins, for each epoch 1 to 20,
 * the world seed, the ship count, the FNV of `serializeWorldSection` and the
 * `hashWorld(initFlightState(layout), world)` FNV of the Lave inert world built
 * through the production path (`trafficContent` plus `createInertPopulate`
 * over the committed `ships-npc.json`). It is the proof that catalogue growth
 * never moves the inert world (pitfall C1): tests/sim/world/inert-isolation.test.ts
 * rebuilds every epoch and compares.
 *
 * Run once in the container, on the commit that precedes any change to
 * `src/sim/world/populate.ts`, then only asserted. Never rerun it to make a
 * test pass: a moved hash is a finding, and this golden is owner-reserved under
 * D-04 (no executor re-pins it).
 *
 *   docker compose run --rm test npx tsx tests/helpers/write-inert-epochs-golden.ts
 *   docker compose run --rm test npx prettier --write tests/golden/world
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { fnv1a32 } from "../../src/sim/hash.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import {
  hashWorld,
  serializeWorldSection,
} from "../../src/sim/world/serialize.js";
import { laveFixture } from "./lave.js";
import { laveInertWorld } from "./traffic-fixture.js";

const OUTPUT = new URL(
  "../golden/world/inert-lave-epochs-1-20.json",
  import.meta.url,
);

const { layout } = laveFixture();
const epochs = [];
for (let epoch = 1; epoch <= 20; epoch += 1) {
  const world = laveInertWorld(epoch);
  epochs.push({
    epoch,
    worldSeed: world.worldSeed,
    count: world.store.live.length,
    sectionFnv: fnv1a32(serializeWorldSection(world)),
    hashWorldFnv: hashWorld(initFlightState(layout), world),
  });
}

mkdirSync(new URL("../golden/world/", import.meta.url), { recursive: true });
writeFileSync(
  OUTPUT,
  `${JSON.stringify({ name: "inert-lave-epochs-1-20", epochs }, null, 2)}\n`,
);
