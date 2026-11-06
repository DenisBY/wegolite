// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Regenerate the **REGRESSION** market snapshots (D-20, T-05-18).
 *
 * This is a committed helper, not a test: it calls the real `generateMarket`
 * with each system's persisted seed and writes the committed bytes under
 * `tests/golden/market/`. Because the writer and `tests/sim/economy/market.test.ts`
 * both call the implementation, these files are **not correctness proof** —
 * they detect drift only. The correctness oracle is the independently authored
 * `tests/sim/economy/reference-vectors.test.ts`, which is never regenerated from
 * this code.
 *
 * Never hand-edit a fixture to match a wrong implementation. If a snapshot
 * changes unexpectedly, reconcile the float32 grouping and draw order first,
 * then regenerate.
 *
 * Run in the container:
 *
 *   docker compose run --rm test npx tsx tests/helpers/write-market-goldens.ts
 *   docker compose run --rm test npx prettier --write tests/golden/market
 */

import { readFileSync, writeFileSync } from "node:fs";

import { CommoditySchema } from "../../src/content/schemas/commodity.js";
import type { Commodity, System } from "../../src/content/types.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../src/sim/economy/market.js";

interface SnapshotTarget {
  readonly systemId: string;
  readonly file: string;
}

/** Lave agricultural, Zaonce industrial, Leesti as the third characteristic system. */
const TARGETS: readonly SnapshotTarget[] = [
  { systemId: "g0-s7", file: "lave.json" },
  { systemId: "g0-s129", file: "zaonce.json" },
  { systemId: "g0-s55", file: "leesti.json" },
];

const REPO_ROOT = new URL("../../", import.meta.url);

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(new URL(relativePath, REPO_ROOT), "utf8"),
  ) as T;
}

/**
 * Validate the committed catalogue with the same schema the loader uses.
 *
 * `src/content/commodities.ts` cannot be imported here: its module scope calls
 * `import.meta.glob`, which only Vite/Vitest provide. The writer is a one-shot
 * tsx tool, so it validates through the schema directly and still refuses a
 * fractional coefficient or a repeated key.
 */
function readCommodities(): readonly Commodity[] {
  const raw = readJson<unknown>("src/content/generated/commodities.json");
  if (!Array.isArray(raw)) {
    throw new Error("Wegolite: the commodity catalogue is not an array.");
  }
  const seen = new Set<string>();
  return raw.map((candidate, index) => {
    const result = CommoditySchema.safeParse(candidate);
    if (!result.success) {
      throw new Error(
        `Wegolite: commodity entry ${String(index)} is invalid: ${
          result.error.issues[0]?.message ?? "unknown issue"
        }.`,
      );
    }
    if (seen.has(result.data.key)) {
      throw new Error(
        `Wegolite: the commodity catalogue repeats key "${result.data.key}".`,
      );
    }
    seen.add(result.data.key);
    return result.data;
  });
}

const commodities = readCommodities();
const systems = readJson<System[]>("src/content/generated/systems/g0.json");

for (const target of TARGETS) {
  const system = systems.find((candidate) => candidate.id === target.systemId);
  if (system === undefined) {
    throw new Error(`the system catalogue has no "${target.systemId}"`);
  }
  const marketSeed = marketSeedForSystem(system.id);
  const market = generateMarket(system, commodities, marketSeed);
  const snapshot = {
    version: 1,
    systemId: system.id,
    marketSeed,
    goods: market.goods.map((good) => ({
      key: good.key,
      price: good.price,
      stock: good.stock,
    })),
  };
  writeFileSync(
    new URL(`tests/golden/market/${target.file}`, REPO_ROOT),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
  console.log(`wrote tests/golden/market/${target.file}`);
}
