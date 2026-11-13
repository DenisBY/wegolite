// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Write the pinned pre-phase flight hashes (FOUND-12, D-08).
 *
 * `tests/golden/world/flight-hash-pins.json` is captured once, from the
 * unmodified Phase 8 baseline, and then only asserted by
 * `tests/sim/world/flight-hash-pins.test.ts`. It is additive: no existing golden
 * is touched. Do not rerun this writer after the session split to make a test
 * pass; a hash that moved is the finding.
 *
 * Run in the container:
 *
 *   docker compose run --rm test npx tsx tests/helpers/write-world-goldens.ts
 *   docker compose run --rm test npx prettier --write tests/golden/world
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { recordFlightHashes } from "./recorded-flights.js";

const OUTPUT = new URL(
  "../golden/world/flight-hash-pins.json",
  import.meta.url,
);

mkdirSync(new URL("../golden/world/", import.meta.url), { recursive: true });
writeFileSync(
  OUTPUT,
  `${JSON.stringify({ formatVersion: 1, flights: recordFlightHashes() }, null, 2)}\n`,
);
