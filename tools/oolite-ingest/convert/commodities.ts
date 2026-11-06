// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `third_party/oolite/Config/trade-goods.plist` → typed commodity records
 * (DATA-06, D-13, T-02-06).
 *
 * One pure function, one job: project the parsed plist into records whose shape
 * is `CommoditySchema`. All file reading and writing stays in `generate.ts`, so
 * this converter is testable without touching the snapshot.
 *
 * Unit mapping is an explicit table (0 = t, 1 = kg, 2 = g). Any other value is a
 * `SCHEMA` failure, never a silent default: a unit mistake is a 1000× economy
 * bug downstream. `priceAverage` is asserted as integer decicredits while the
 * five market ratios are asserted as authored reals — `.int()` on
 * `quantity_average` would quietly turn 13.5 into 13.
 *
 * `alien_items` is emitted, with all three quantity fields zero and
 * `tradeable: false`. It is present because Phase 5 shows it with no stock; it
 * is untradeable because D-13 says so.
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { getEntry } from "../openstep/plist-value.js";
import type { PlistDict, PlistValue } from "../openstep/plist-value.js";
import { CommoditySchema } from "../../../src/content/schemas/commodity.js";
import type {
  Commodity,
  CommodityUnit,
} from "../../../src/content/schemas/commodity.js";

export const COMMODITIES_PATH = "src/content/generated/commodities.json";

const FILE = "third_party/oolite/Config/trade-goods.plist";

const DESCRIPTIONS_FILE = "third_party/oolite/Config/descriptions.plist";

/** `descriptions.plist` keys that name a commodity for display (D-21). */
const COMMODITY_NAME_PREFIX = "commodity-name ";

/** A trade good's authored name is the bracketed localization token. */
const COMMODITY_TOKEN = /^\[commodity-name ([^\]]+)\]$/;

interface UnitDefinition {
  readonly unit: CommodityUnit;
  readonly kilogramsPerUnit: number;
}

/**
 * Oolite's `quantity_unit` codes. The pod conversion is metadata only: an
 * `alien_items` tonne is 1000 kg, but nothing in this pipeline multiplies it.
 */
const UNITS: { readonly [code: number]: UnitDefinition } = {
  0: { unit: "t", kilogramsPerUnit: 1000 },
  1: { unit: "kg", kilogramsPerUnit: 1 },
  2: { unit: "g", kilogramsPerUnit: 0.001 },
};

export interface EmittedCommodities {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function requireDict(
  value: PlistValue,
  construct: string,
  line?: number,
  column?: number,
): PlistDict {
  if (value.kind !== "dict") {
    throw contentError(
      "SCHEMA",
      FILE,
      construct,
      line === undefined || column === undefined
        ? { excerpt: "expected a dictionary" }
        : { line, column, excerpt: "expected a dictionary" },
    );
  }
  return value;
}

function readString(dict: PlistDict, key: string, construct: string): string {
  const entry = getEntry(dict, key);
  if (entry === undefined) {
    throw contentError("SCHEMA", FILE, construct, {
      excerpt: `missing key "${key}"`,
    });
  }
  if (entry.value.kind !== "string") {
    throw contentError("SCHEMA", FILE, construct, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt: `"${key}" must be a quoted string`,
    });
  }
  return entry.value.value;
}

function readNumber(dict: PlistDict, key: string, construct: string): number {
  const entry = getEntry(dict, key);
  if (entry === undefined) {
    throw contentError("SCHEMA", FILE, construct, {
      excerpt: `missing key "${key}"`,
    });
  }
  const value = entry.value;
  if (value.kind !== "integer" && value.kind !== "real") {
    throw contentError("SCHEMA", FILE, construct, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt: `"${key}" must be a number`,
    });
  }
  return value.value;
}

function readInteger(dict: PlistDict, key: string, construct: string): number {
  const entry = getEntry(dict, key);
  if (entry === undefined) {
    throw contentError("SCHEMA", FILE, construct, {
      excerpt: `missing key "${key}"`,
    });
  }
  if (entry.value.kind !== "integer") {
    throw contentError("SCHEMA", FILE, construct, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt: `"${key}" must be a bare integer`,
    });
  }
  return entry.value.value;
}

function readStringArray(
  dict: PlistDict,
  key: string,
  construct: string,
): string[] {
  const entry = getEntry(dict, key);
  if (entry === undefined) {
    throw contentError("SCHEMA", FILE, construct, {
      excerpt: `missing key "${key}"`,
    });
  }
  if (entry.value.kind !== "array") {
    throw contentError("SCHEMA", FILE, construct, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt: `"${key}" must be an array`,
    });
  }
  return entry.value.values.map((item, index) => {
    if (item.kind !== "string") {
      throw contentError("SCHEMA", FILE, `${construct}.${String(index)}`, {
        line: item.line,
        column: item.column,
        excerpt: `"${key}" entries must be strings`,
      });
    }
    return item.value;
  });
}

function project(entryKey: string, dict: PlistDict): Commodity {
  const construct = `commodities.${entryKey}`;
  const unitCode = readInteger(
    dict,
    "quantity_unit",
    `${construct}.quantity_unit`,
  );
  const unit = UNITS[unitCode];
  if (unit === undefined) {
    throw contentError("SCHEMA", FILE, `${construct}.quantity_unit`, {
      excerpt: `unknown quantity_unit ${String(unitCode)} (expected 0, 1 or 2)`,
    });
  }

  const candidate = {
    key: entryKey,
    name: readString(dict, "name", `${construct}.name`),
    classes: readStringArray(dict, "classes", `${construct}.classes`),
    unit: unit.unit,
    podConversion: { kilogramsPerUnit: unit.kilogramsPerUnit },
    priceAverage: readInteger(
      dict,
      "price_average",
      `${construct}.price_average`,
    ),
    priceEconomic: readNumber(
      dict,
      "price_economic",
      `${construct}.price_economic`,
    ),
    priceRandom: readNumber(dict, "price_random", `${construct}.price_random`),
    quantityAverage: readNumber(
      dict,
      "quantity_average",
      `${construct}.quantity_average`,
    ),
    quantityEconomic: readNumber(
      dict,
      "quantity_economic",
      `${construct}.quantity_economic`,
    ),
    quantityRandom: readNumber(
      dict,
      "quantity_random",
      `${construct}.quantity_random`,
    ),
    peakExport: readInteger(dict, "peak_export", `${construct}.peak_export`),
    peakImport: readInteger(dict, "peak_import", `${construct}.peak_import`),
    legalityExport: readInteger(
      dict,
      "legality_export",
      `${construct}.legality_export`,
    ),
    legalityImport: readInteger(
      dict,
      "legality_import",
      `${construct}.legality_import`,
    ),
    trumbleOpinion: readNumber(
      dict,
      "trumble_opinion",
      `${construct}.trumble_opinion`,
    ),
    sortOrder: readInteger(dict, "sort_order", `${construct}.sort_order`),
    tradeable: entryKey !== "alien_items",
  };

  const result = CommoditySchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw contentError(
      "SCHEMA",
      FILE,
      issue === undefined ? construct : `${construct}.${issue.path.join(".")}`,
      {
        excerpt:
          issue === undefined ? "invalid commodity record" : issue.message,
      },
    );
  }
  return result.data;
}

/**
 * Resolve every display name from `descriptions.plist` (D-21).
 *
 * The authored `name` in `trade-goods.plist` is a localization token
 * (`"[commodity-name food]"`). The token must name the same entry it belongs
 * to, and the description must exist: falling back to the token would ship a
 * raw localization key to the market screen.
 */
function commodityNames(descriptions: PlistValue): Map<string, string> {
  const root = requireDict(descriptions, "descriptions");
  const names = new Map<string, string>();
  for (const entry of root.entries) {
    if (!entry.key.startsWith(COMMODITY_NAME_PREFIX)) continue;
    if (entry.value.kind !== "string") {
      throw contentError("SCHEMA", DESCRIPTIONS_FILE, entry.key, {
        line: entry.keyLine,
        column: entry.keyColumn,
        excerpt: `"${entry.key}" must be a quoted string`,
      });
    }
    names.set(entry.key, entry.value.value);
  }
  return names;
}

function resolveName(
  entryKey: string,
  authoredName: string,
  names: ReadonlyMap<string, string>,
): string {
  const match = COMMODITY_TOKEN.exec(authoredName);
  const token = match?.[1];
  if (token === undefined || token !== entryKey) {
    throw contentError("SCHEMA", FILE, `commodities.${entryKey}.name`, {
      excerpt: `expected "[commodity-name ${entryKey}]", found "${authoredName}"`,
    });
  }
  const resolved = names.get(`${COMMODITY_NAME_PREFIX}${token}`);
  if (resolved === undefined) {
    throw contentError(
      "SCHEMA",
      DESCRIPTIONS_FILE,
      `${COMMODITY_NAME_PREFIX}${token}`,
      {
        excerpt: `missing display name for commodity "${entryKey}"`,
      },
    );
  }
  return resolved;
}

/** Project every entry, sorted by ascending `sort_order`. */
export function compileCommodities(
  parsed: PlistValue,
  descriptions: PlistValue,
): Commodity[] {
  const root = requireDict(parsed, "root");
  if (root.entries.length === 0) {
    throw contentError("SCHEMA", FILE, "root", {
      excerpt: "trade-goods.plist parsed to zero commodities",
    });
  }

  const names = commodityNames(descriptions);
  const records = root.entries.map((entry) => {
    const record = project(
      entry.key,
      requireDict(
        entry.value,
        `commodities.${entry.key}`,
        entry.keyLine,
        entry.keyColumn,
      ),
    );
    return {
      ...record,
      name: resolveName(entry.key, record.name, names),
    };
  });

  records.sort((left, right) => left.sortOrder - right.sortOrder);

  const keys = new Set<string>();
  for (const record of records) {
    if (keys.has(record.key)) {
      throw contentError("SCHEMA", FILE, `commodities.${record.key}`, {
        excerpt: `duplicate commodity key "${record.key}"`,
      });
    }
    keys.add(record.key);
  }
  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1];
    const current = records[index];
    if (
      previous !== undefined &&
      current !== undefined &&
      previous.sortOrder === current.sortOrder
    ) {
      throw contentError(
        "SCHEMA",
        FILE,
        `commodities.${current.key}.sort_order`,
        {
          excerpt: `duplicate sort_order ${String(current.sortOrder)}`,
        },
      );
    }
  }

  return records;
}

/** Canonical JSON bytes for the compiled records. */
export function emitCommodities(
  parsed: PlistValue,
  descriptions: PlistValue,
): EmittedCommodities {
  const records = compileCommodities(parsed, descriptions);
  const json: PlistJson = records.map((record) => ({
    key: record.key,
    name: record.name,
    classes: [...record.classes],
    unit: record.unit,
    podConversion: { kilogramsPerUnit: record.podConversion.kilogramsPerUnit },
    priceAverage: record.priceAverage,
    priceEconomic: record.priceEconomic,
    priceRandom: record.priceRandom,
    quantityAverage: record.quantityAverage,
    quantityEconomic: record.quantityEconomic,
    quantityRandom: record.quantityRandom,
    peakExport: record.peakExport,
    peakImport: record.peakImport,
    legalityExport: record.legalityExport,
    legalityImport: record.legalityImport,
    trumbleOpinion: record.trumbleOpinion,
    sortOrder: record.sortOrder,
    tradeable: record.tradeable,
  }));
  return {
    path: COMMODITIES_PATH,
    bytes: Buffer.from(canonicalJson(json), "utf8"),
  };
}
