// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The equipment catalogue loader (DOCK-05, D-10, T-04-43).
 *
 * `generated/equipment.json` is a shipped static asset, so it is loaded as a
 * `?raw` string and `JSON.parse`d like `ships.ts` and `dock-port.ts`. Unlike
 * the legacy ship loader, every record is validated with the strict
 * `EquipmentSchema`: this is the trust boundary between a build artefact and
 * the price/tech-level numbers `canPurchase` reads, and a fractional price
 * reaching the profile would be a money bug.
 *
 * `parseEquipment` is exported so a Node test can exercise the same validation
 * against the committed bytes without `import.meta.glob`.
 */

import { EquipmentSchema } from "./schemas/equipment.js";
import type { Equipment } from "./schemas/equipment.js";

const EQUIPMENT_PATH = "./generated/equipment.json";

const lazyEquipment = import.meta.glob("./generated/equipment.json", {
  query: "?raw",
  import: "default",
});

/** A missing or invalid generated equipment record. */
export class EquipmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EquipmentError";
  }
}

/**
 * Validate an untrusted equipment array.
 *
 * @throws {EquipmentError} naming the first invalid entry or repeated key.
 */
export function parseEquipment(value: unknown): readonly Equipment[] {
  if (!Array.isArray(value)) {
    throw new EquipmentError(
      "Wegolite: the equipment catalogue is not an entry array.",
    );
  }

  const seen = new Set<string>();
  const records: Equipment[] = [];
  for (const [index, candidate] of value.entries()) {
    const result = EquipmentSchema.safeParse(candidate);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where =
        issue === undefined || issue.path.length === 0
          ? "record"
          : issue.path.join(".");
      throw new EquipmentError(
        `Wegolite: equipment entry ${String(index)} is invalid at ${where}: ${
          issue === undefined ? "unknown issue" : issue.message
        }.`,
      );
    }
    if (seen.has(result.data.key)) {
      throw new EquipmentError(
        `Wegolite: the equipment catalogue repeats key "${result.data.key}".`,
      );
    }
    seen.add(result.data.key);
    records.push(result.data);
  }
  return records;
}

let cachedEquipment: Promise<readonly Equipment[]> | undefined;

/** Load and validate the committed equipment catalogue once. */
export function loadEquipment(): Promise<readonly Equipment[]> {
  cachedEquipment ??= (async () => {
    const load = lazyEquipment[EQUIPMENT_PATH];
    if (load === undefined) {
      throw new EquipmentError(
        `Wegolite: expected the equipment catalogue at ${EQUIPMENT_PATH}, but it is missing.`,
      );
    }
    const parsed: unknown = JSON.parse(await load()) as unknown;
    return parseEquipment(parsed);
  })();
  return cachedEquipment;
}

/**
 * Find one record by key.
 *
 * @throws {EquipmentError} naming the key; a silent `undefined` would become a
 * purchase made at no price.
 */
export function findEquipment(
  catalogue: readonly Equipment[],
  key: string,
): Equipment {
  const entry = catalogue.find((candidate) => candidate.key === key);
  if (entry === undefined) {
    throw new EquipmentError(
      `Wegolite: the equipment catalogue has no entry with key "${key}".`,
    );
  }
  return entry;
}
