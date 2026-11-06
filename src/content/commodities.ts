// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The commodity catalogue loader (D-21, ECON-01).
 *
 * `generated/commodities.json` is a shipped static asset, so it is loaded as a
 * `?raw` string and `JSON.parse`d exactly like `equipment.ts`. Every record is
 * validated with the strict `CommoditySchema`: this is the trust boundary
 * between the build artefact and the price/stock coefficients the market
 * generator reads, and a fractional coefficient reaching the formula would be
 * an economy bug.
 *
 * `parseCommodities` is exported so a Node test can exercise the same
 * validation against the committed bytes without `import.meta.glob`.
 */

import { CommoditySchema } from "./schemas/commodity.js";
import type { Commodity } from "./schemas/commodity.js";

const COMMODITIES_PATH = "./generated/commodities.json";

const lazyCommodities = import.meta.glob("./generated/commodities.json", {
  query: "?raw",
  import: "default",
});

/** A missing or invalid generated commodity record. */
export class CommoditiesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommoditiesError";
  }
}

/**
 * Validate an untrusted commodity array.
 *
 * @throws {CommoditiesError} naming the first invalid entry or repeated key.
 */
export function parseCommodities(value: unknown): readonly Commodity[] {
  if (!Array.isArray(value)) {
    throw new CommoditiesError(
      "Wegolite: the commodity catalogue is not an entry array.",
    );
  }

  const seen = new Set<string>();
  const records: Commodity[] = [];
  for (const [index, candidate] of value.entries()) {
    const result = CommoditySchema.safeParse(candidate);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where =
        issue === undefined || issue.path.length === 0
          ? "record"
          : issue.path.join(".");
      throw new CommoditiesError(
        `Wegolite: commodity entry ${String(index)} is invalid at ${where}: ${
          issue === undefined ? "unknown issue" : issue.message
        }.`,
      );
    }
    if (seen.has(result.data.key)) {
      throw new CommoditiesError(
        `Wegolite: the commodity catalogue repeats key "${result.data.key}".`,
      );
    }
    seen.add(result.data.key);
    records.push(result.data);
  }
  return records;
}

let cachedCommodities: Promise<readonly Commodity[]> | undefined;

/** Load and validate the committed commodity catalogue once. */
export function loadCommodities(): Promise<readonly Commodity[]> {
  cachedCommodities ??= (async () => {
    const load = lazyCommodities[COMMODITIES_PATH];
    if (load === undefined) {
      throw new CommoditiesError(
        `Wegolite: expected the commodity catalogue at ${COMMODITIES_PATH}, but it is missing.`,
      );
    }
    const parsed: unknown = JSON.parse(await load()) as unknown;
    return parseCommodities(parsed);
  })();
  return cachedCommodities;
}
