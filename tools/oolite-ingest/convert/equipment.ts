// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `third_party/oolite/Config/equipment.plist` → typed equipment records
 * (DATA-07, D-10, D-25, T-02-07).
 *
 * One pure function, one job: project each six-element positional array
 * `(techLevel, price, name, key, description, conditions)` into a record whose
 * shape is `EquipmentSchema`. All file reading and writing stays in
 * `generate.ts`.
 *
 * `noUncheckedIndexedAccess` makes every `items[i]` a `T | undefined`, so the
 * tuple is destructured through `tuple6()`, which narrows each element and
 * throws `SCHEMA` naming the file and the entry key. A short tuple can never
 * produce an `undefined` price or tech level.
 *
 * Nothing is interpreted: `condition_script`, `requires_*`, `provides` and every
 * other condition key are carried in the open `conditions` record. No entry is
 * filtered out, and two entries sharing a price/TL pair (`thargon` and
 * `EQ_THARGON`) stay two keys because the key is the identity.
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { getEntry, plistToJson } from "../openstep/plist-value.js";
import type {
  PlistArray,
  PlistDict,
  PlistValue,
} from "../openstep/plist-value.js";
import { EquipmentSchema } from "../../../src/content/schemas/equipment.js";
import type { Equipment } from "../../../src/content/schemas/equipment.js";

export const EQUIPMENT_PATH = "src/content/generated/equipment.json";

const FILE = "third_party/oolite/Config/equipment.plist";

export interface EmittedEquipment {
  readonly path: string;
  readonly bytes: Uint8Array;
}

interface EquipmentTuple {
  readonly techLevel: number;
  readonly price: number;
  readonly name: string;
  readonly description: string;
  readonly key: string;
  readonly conditions: PlistDict;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function requireArray(value: PlistValue, construct: string): PlistArray {
  if (value.kind !== "array") {
    throw contentError("SCHEMA", FILE, construct, {
      excerpt: "expected an array",
    });
  }
  return value;
}

function integerAt(
  items: readonly PlistValue[],
  index: number,
  label: string,
): number {
  const item = items[index];
  if (item === undefined || item.kind !== "integer") {
    throw contentError("SCHEMA", FILE, label, {
      excerpt: `element ${String(index)} must be a bare integer`,
    });
  }
  return item.value;
}

function stringAt(
  items: readonly PlistValue[],
  index: number,
  label: string,
): string {
  const item = items[index];
  if (item === undefined || item.kind !== "string") {
    throw contentError("SCHEMA", FILE, label, {
      excerpt: `element ${String(index)} must be a quoted string`,
    });
  }
  return item.value;
}

function dictAt(
  items: readonly PlistValue[],
  index: number,
  label: string,
): PlistDict {
  const item = items[index];
  if (item === undefined || item.kind !== "dict") {
    throw contentError("SCHEMA", FILE, label, {
      excerpt: `element ${String(index)} must be a dictionary`,
    });
  }
  return item;
}

/**
 * Narrow a positional equipment tuple. The entry key is read before the length
 * check so a short tuple still fails with a name a human can find.
 */
function tuple6(value: PlistValue, index: number): EquipmentTuple {
  if (value.kind !== "array") {
    throw contentError("SCHEMA", FILE, `equipment[${String(index)}]`, {
      excerpt: "expected a six-element array",
    });
  }
  const items = value.values;
  const keyCandidate = items[3];
  const label =
    keyCandidate !== undefined && keyCandidate.kind === "string"
      ? keyCandidate.value
      : `equipment[${String(index)}]`;
  if (items.length !== 6) {
    throw contentError("SCHEMA", FILE, label, {
      excerpt: `expected 6 elements, found ${String(items.length)}`,
    });
  }

  return {
    techLevel: integerAt(items, 0, label),
    price: integerAt(items, 1, label),
    name: stringAt(items, 2, label),
    key: stringAt(items, 3, label),
    description: stringAt(items, 4, label),
    conditions: dictAt(items, 5, label),
  };
}

function valueToJson(value: unknown): PlistJson {
  if (value === null) return null;
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw contentError("SCHEMA", FILE, "conditions", {
          excerpt: `non-finite number ${String(value)}`,
        });
      }
      return value;
    case "object":
      break;
    default:
      throw contentError("SCHEMA", FILE, "conditions", {
        excerpt: `unsupported condition value of type ${typeof value}`,
      });
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => valueToJson(item));
  }
  return conditionsToJson(value as Record<string, unknown>);
}

/**
 * Project the open condition record onto canonical JSON values, sorted by key.
 * The dictionary came from `plistToJson`, so this only narrows — it never
 * transforms an authored value.
 */
function conditionsToJson(conditions: Record<string, unknown>): PlistJson {
  const object: { [key: string]: PlistJson } = {};
  for (const key of Object.keys(conditions).sort(compareCodeUnits)) {
    object[key] = valueToJson(conditions[key]);
  }
  return object;
}

function project(tuple: EquipmentTuple): Equipment {
  const conditionsJson = plistToJson(tuple.conditions);
  const sortEntry = getEntry(tuple.conditions, "purchase_sort_order");
  const sortHint =
    sortEntry !== undefined && sortEntry.value.kind === "integer"
      ? sortEntry.value.value
      : undefined;
  const candidate = {
    key: tuple.key,
    name: tuple.name,
    description: tuple.description,
    techLevel: tuple.techLevel,
    price: tuple.price,
    priceUnit: "decicredits" as const,
    conditions: conditionsJson,
    ...(sortHint === undefined ? {} : { sortHint }),
  };

  const result = EquipmentSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw contentError(
      "SCHEMA",
      FILE,
      issue === undefined ? tuple.key : `${tuple.key}.${issue.path.join(".")}`,
      {
        excerpt:
          issue === undefined ? "invalid equipment record" : issue.message,
      },
    );
  }
  return result.data;
}

/** Project every entry, sorted by key in code-unit order. */
export function compileEquipment(parsed: PlistValue): Equipment[] {
  const root = requireArray(parsed, "root");
  if (root.values.length === 0) {
    throw contentError("SCHEMA", FILE, "root", {
      excerpt: "equipment.plist parsed to zero entries",
    });
  }

  const records = root.values.map((value, index) =>
    project(tuple6(value, index)),
  );
  records.sort((left, right) => compareCodeUnits(left.key, right.key));

  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1];
    const current = records[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      previous.key === current.key
    ) {
      throw contentError("SCHEMA", FILE, current.key, {
        excerpt: `duplicate equipment key "${current.key}"`,
      });
    }
  }

  return records;
}

/** Canonical JSON bytes for the compiled catalogue. */
export function emitEquipment(parsed: PlistValue): EmittedEquipment {
  const records = compileEquipment(parsed);
  const json: PlistJson = records.map((record) => {
    const item: { [key: string]: PlistJson } = {
      key: record.key,
      name: record.name,
      description: record.description,
      techLevel: record.techLevel,
      price: record.price,
      priceUnit: record.priceUnit,
      conditions: conditionsToJson(record.conditions),
    };
    if (record.sortHint !== undefined) item.sortHint = record.sortHint;
    return item;
  });
  return {
    path: EQUIPMENT_PATH,
    bytes: Buffer.from(canonicalJson(json), "utf8"),
  };
}
