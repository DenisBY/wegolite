// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Write the Lave launch world golden (WORLD-15, plan 12-07).
 *
 * `tests/golden/world/inert-lave-epoch1.json` pins the world section text and
 * its FNV-1a hash for `createWorld(0x2b4e037c)` populated over the Lave layout
 * and the committed NPC records. It is a regression snapshot: tests/sim/world/
 * populate.test.ts rebuilds the world and compares every field. Run once in the
 * container, then only asserted; never rerun it to make a test pass, a moved
 * hash is the finding (and changing the population table re-pins it on
 * purpose, with a Key Decisions edit).
 *
 *   docker compose run --rm test npx tsx tests/helpers/write-inert-world-golden.ts
 *   docker compose run --rm test npx prettier --write tests/golden/world
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { fnv1a32 } from "../../src/sim/hash.js";
import { serializeWorldSection } from "../../src/sim/world/serialize.js";
import {
  LAVE_EPOCH1_WORLD_SEED,
  buildInertWorld,
  laveInertRecords,
} from "./inert-world.js";
import { laveFixture } from "./lave.js";

const OUTPUT = new URL(
  "../golden/world/inert-lave-epoch1.json",
  import.meta.url,
);

const { layout } = laveFixture();
const { world, count } = buildInertWorld(
  LAVE_EPOCH1_WORLD_SEED,
  layout,
  laveInertRecords(),
);
const section = serializeWorldSection(world);

mkdirSync(new URL("../golden/world/", import.meta.url), { recursive: true });
writeFileSync(
  OUTPUT,
  `${JSON.stringify(
    {
      name: "inert-lave-epoch1",
      worldSeed: LAVE_EPOCH1_WORLD_SEED,
      count,
      fnv: fnv1a32(section),
      section,
    },
    null,
    2,
  )}\n`,
);
