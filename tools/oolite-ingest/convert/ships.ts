// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `third_party/oolite/Config/shipdata.plist` → the typed ship catalogue
 * (DATA-02, DATA-07, D-07, D-11, D-24, T-02-16, T-02-17).
 *
 * One pure function, one job: apply `shipdata-overrides.plist` to the raw
 * entries, resolve `like_ship`, then project each resolved entry onto
 * `CatalogEntrySchema`. All file reading and writing stays in `generate.ts`.
 *
 * The catalogue records Oolite's facts; it does not repeat its prune. Oolite
 * deletes any entry whose `.dat` is missing, which would delete 95 of the 102
 * usable entries because only five models are vendored. Instead every entry is
 * kept, `usable` mirrors Oolite's predicate without pruning, and
 * `modelVendored` makes the difference explicit (DATA-07).
 *
 * `extras` carries every resolved key that the typed projection does not
 * consume, verbatim. Nothing is evaluated: a value that looks like a condition
 * script stays a string in `extras` (T-02-17).
 */

import { resolve, sep } from "node:path";

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { resolveAll } from "../like-ship.js";
import type { ShipFields } from "../like-ship.js";
import { plistToJson } from "../openstep/plist-value.js";
import type { PlistValue } from "../openstep/plist-value.js";
import { getEntry } from "../openstep/plist-value.js";
import {
  CatalogEntrySchema,
  ShipDefSchema,
  SubentitySchema,
} from "../../../src/content/schemas/ship.js";
import type {
  CatalogEntry,
  MarketDefinition,
  ShipDef,
  Subentity,
} from "../../../src/content/schemas/ship.js";

export const SHIPS_PATH = "src/content/generated/ships.json";
export const SHIPDATA_FILE = "third_party/oolite/Config/shipdata.plist";
export const MODELS_DIR = "third_party/oolite/Models";

/** The five model files vendored by plan 04. */
export const VENDORED_MODEL_FILES = [
  "oolite_cobra3.dat",
  "oolite_coriolis.dat",
  "oolite_coriolis_dock.dat",
  "oolite_coriolis_faceplate.dat",
  "oolite_coriolis_tris.dat",
] as const;

/**
 * Resolved keys that are consumed by the typed top-level record or by
 * `shipDef.materials`, so they are not repeated in `extras`. Every other key is
 * carried verbatim — stats, `roles`, `custom_views`, the raw `subentities`
 * array (whose authored `is_dock` string must survive) and unknown future keys
 * included.
 */
const PROJECTED_KEYS: ReadonlySet<string> = new Set([
  "is_template",
  "model",
  "market_definition",
  "materials",
]);

export interface CompileShipsOptions {
  /** Override the vendored-model set; defaults to the five pinned files. */
  readonly modelFiles?: readonly string[];
}

export interface ShipCatalogue {
  readonly entries: CatalogEntry[];
  /** Longest `like_ship` chain in hops; the pinned catalogue reaches 3. */
  readonly maxChainDepth: number;
}

export interface EmittedShips {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const BOOLEAN_STRINGS_TRUE = new Set(["yes", "true", "on"]);
const BOOLEAN_STRINGS_FALSE = new Set(["no", "false", "off", ""]);

/**
 * Oolite's boolean predicate (`OOBooleanFromObject`): yes/true/on and non-zero
 * numbers are true; no/false/off/zero-string and zero are false; anything else
 * falls back to `defaultValue`.
 */
export function coerceBoolean(
  value: PlistValue | undefined,
  defaultValue = false,
): boolean {
  if (value === undefined) return defaultValue;
  switch (value.kind) {
    case "bool":
      return value.value;
    case "integer":
    case "real":
      return value.value !== 0;
    case "string": {
      const text = value.value.trim().toLowerCase();
      if (BOOLEAN_STRINGS_TRUE.has(text)) return true;
      if (BOOLEAN_STRINGS_FALSE.has(text)) return false;
      const parsed = Number.parseFloat(text);
      return Number.isFinite(parsed) ? parsed !== 0 : defaultValue;
    }
    default:
      return defaultValue;
  }
}

function coerceNumber(value: PlistValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  switch (value.kind) {
    case "integer":
    case "real":
      return value.value;
    case "string": {
      const parsed = Number.parseFloat(value.value.trim());
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case "bool":
      return value.value ? 1 : 0;
    default:
      return undefined;
  }
}

/**
 * Oolite's vector predicate (`OOVectorFromObject`): a string of 3–4 numbers, an
 * array of at least three components, or a dictionary with `x`/`y`/`z` (missing
 * components default to zero). The fourth component of a string is ignored
 * here; quaternions are not a vector.
 */
export function coerceVector(
  value: PlistValue | undefined,
): readonly [number, number, number] | undefined {
  if (value === undefined) return undefined;

  const fromComponent = (component: PlistValue | undefined): number =>
    coerceNumber(component) ?? 0;

  switch (value.kind) {
    case "string": {
      const parts = value.value.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 3) return undefined;
      const numbers = parts.slice(0, 3).map((part) => Number.parseFloat(part));
      if (!numbers.every((item) => Number.isFinite(item))) return undefined;
      return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
    }
    case "array": {
      if (value.values.length < 3) return undefined;
      const numbers = value.values
        .slice(0, 3)
        .map((item) => coerceNumber(item));
      if (!numbers.every((item) => item !== undefined)) return undefined;
      return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
    }
    case "dict": {
      return [
        fromComponent(getEntry(value, "x")?.value),
        fromComponent(getEntry(value, "y")?.value),
        fromComponent(getEntry(value, "z")?.value),
      ];
    }
    default:
      return undefined;
  }
}

function fail(construct: string, detail: string): never {
  throw contentError("SCHEMA", SHIPDATA_FILE, construct, { excerpt: detail });
}

function requireArray(
  value: PlistValue | undefined,
  construct: string,
): PlistValue[] {
  if (value === undefined || value.kind !== "array") {
    return fail(construct, "expected an array");
  }
  return value.values;
}

/** A raw value projected onto canonical JSON, never transformed. */
function jsonValue(value: unknown): PlistJson {
  if (value === null) return null;
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        return fail("extras", `non-finite number ${String(value)}`);
      }
      return value;
    case "object":
      break;
    default:
      return fail("extras", `unsupported value of type ${typeof value}`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => jsonValue(item));
  }
  const object: { [key: string]: PlistJson } = {};
  for (const [key, item] of Object.entries(value))
    object[key] = jsonValue(item);
  return object;
}

function recordToJson(value: Record<string, unknown>): {
  [key: string]: PlistJson;
} {
  const object: { [key: string]: PlistJson } = {};
  for (const [key, item] of Object.entries(value))
    object[key] = jsonValue(item);
  return object;
}

/** Split Oolite's whitespace-separated role list; an empty list is `null`. */
function projectRoles(value: PlistValue | undefined): string[] | null {
  if (value === undefined) return null;
  if (value.kind !== "string") return fail("roles", "roles must be a string");
  const roles = value.value.trim().split(/\s+/).filter(Boolean);
  return roles.length === 0 ? null : roles;
}

function projectModel(value: PlistValue | undefined): string | null {
  if (value === undefined) return null;
  if (value.kind !== "string") return fail("model", "model must be a string");
  return value.value;
}

/**
 * Refuse a model value that escapes the vendored Models directory. The pinned
 * values are bare filenames; `..` and absolute paths are an attack, not data
 * (T-02-16).
 */
function assertModelInsideModels(key: string, model: string): void {
  const base = resolve(MODELS_DIR);
  const target = resolve(base, model);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw contentError("DAT_MESH", SHIPDATA_FILE, key, {
      excerpt: `model path "${model}" escapes ${MODELS_DIR} (resolved ${target})`,
    });
  }
}

function projectMarketDefinition(fields: ShipFields): MarketDefinition {
  const value = fields.get("market_definition");
  if (value === undefined) return { kind: "absent" };
  if (value.kind !== "array") {
    return fail("market_definition", "expected an array when present");
  }
  if (value.values.length === 0) return { kind: "empty" };
  const definitions = value.values.map((item) => {
    if (item.kind !== "dict") {
      return fail("market_definition", "each definition must be a dictionary");
    }
    const json = plistToJson(item);
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      return fail("market_definition", "each definition must be a dictionary");
    }
    return json;
  });
  return { kind: "explicit", definitions };
}

function projectSubentity(value: PlistValue, index: number): Subentity {
  if (value.kind !== "dict") {
    return fail(`subentities[${String(index)}]`, "expected a dictionary");
  }
  const raw = plistToJson(value);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return fail(`subentities[${String(index)}]`, "expected a dictionary");
  }
  const object: Record<string, unknown> = { ...raw };

  // The authored bare token arrives as the string "true"; the typed projection
  // exposes Oolite's boolean while extras keeps the string.
  const isDock = value.entries.find((item) => item.key === "is_dock")?.value;
  delete object.is_dock;
  if (isDock !== undefined) object.isDock = coerceBoolean(isDock);

  const position = value.entries.find((item) => item.key === "position")?.value;
  const vector = coerceVector(position);
  if (vector !== undefined) object.position = [...vector];
  else delete object.position;

  const parsed = SubentitySchema.safeParse(object);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      `subentities[${String(index)}]`,
      issue === undefined ? "invalid subentity" : issue.message,
    );
  }
  return parsed.data;
}

function projectMaterials(
  value: PlistValue | undefined,
): Record<string, Record<string, unknown>> {
  if (value === undefined) return {};
  if (value.kind !== "dict") return fail("materials", "expected a dictionary");

  const json = plistToJson(value);
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return fail("materials", "expected a dictionary");
  }

  const materials: Record<string, Record<string, unknown>> = {};
  for (const [name, config] of Object.entries(json)) {
    if (
      config === null ||
      typeof config !== "object" ||
      Array.isArray(config)
    ) {
      return fail(`materials.${name}`, "expected a dictionary");
    }
    materials[name] = config;
  }
  return materials;
}

function projectShipDef(
  fields: ShipFields,
  model: string | null,
  roles: string[] | null,
): ShipDef {
  const subentitiesValue = fields.get("subentities");
  const subentities =
    subentitiesValue === undefined
      ? []
      : requireArray(subentitiesValue, "subentities").map((item, index) =>
          projectSubentity(item, index),
        );

  const candidate: Record<string, unknown> = {
    model,
    roles,
    smooth: coerceBoolean(fields.get("smooth"), false),
    materials: projectMaterials(fields.get("materials")),
    subentities,
  };

  const numbers: readonly [string, string][] = [
    ["max_flight_speed", "maxFlightSpeed"],
    ["thrust", "thrust"],
    ["max_flight_pitch", "maxFlightPitch"],
    ["max_flight_roll", "maxFlightRoll"],
    ["max_cargo", "maxCargo"],
    ["fuel", "fuel"],
    ["energy_recharge_rate", "energyRecharge"],
    ["station_roll", "stationRoll"],
  ];
  for (const [authored, projected] of numbers) {
    const value = coerceNumber(fields.get(authored));
    if (value !== undefined) candidate[projected] = value;
  }

  const rotating = fields.get("rotating");
  if (rotating !== undefined) candidate.rotating = coerceBoolean(rotating);
  const isDock = fields.get("is_dock");
  if (isDock !== undefined) candidate.isDock = coerceBoolean(isDock);

  const parsed = ShipDefSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      issue === undefined ? "shipDef" : `shipDef.${issue.path.join(".")}`,
      issue === undefined ? "invalid ship definition" : issue.message,
    );
  }
  return parsed.data;
}

function projectEntry(
  key: string,
  fields: ShipFields,
  modelFiles: ReadonlySet<string>,
): CatalogEntry {
  const isTemplate = coerceBoolean(fields.get("is_template"), false);
  const roles = projectRoles(fields.get("roles"));
  const model = projectModel(fields.get("model"));
  if (model !== null) assertModelInsideModels(key, model);

  const extras: Record<string, unknown> = {};
  for (const [field, value] of fields) {
    if (PROJECTED_KEYS.has(field)) continue;
    extras[field] = plistToJson(value);
  }

  const candidate: Record<string, unknown> = {
    key,
    isTemplate,
    roles,
    model,
    modelVendored: model !== null && modelFiles.has(model),
    usable: !isTemplate && roles !== null && model !== null,
    marketDefinition: projectMarketDefinition(fields),
    shipDef: projectShipDef(fields, model, roles),
    extras,
  };

  const parsed = CatalogEntrySchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      issue === undefined ? key : `${key}.${issue.path.join(".")}`,
      issue === undefined ? "invalid catalogue entry" : issue.message,
    );
  }
  return parsed.data;
}

/** Compile the whole catalogue, sorted by key in code-unit order. */
export function compileShips(
  parsedShipdata: PlistValue,
  parsedOverrides: PlistValue,
  options: CompileShipsOptions = {},
): ShipCatalogue {
  if (parsedShipdata.kind !== "dict") {
    return fail("root", "shipdata.plist must be a dictionary");
  }
  if (parsedOverrides.kind !== "dict") {
    return fail("overrides", "shipdata-overrides.plist must be a dictionary");
  }

  const resolved = resolveAll(parsedShipdata, {
    file: SHIPDATA_FILE,
    overrides: parsedOverrides,
  });
  const modelFiles = new Set(options.modelFiles ?? VENDORED_MODEL_FILES);

  const keys = [...resolved.entries.keys()].sort(compareCodeUnits);
  const entries = keys.map((key) => {
    const fields = resolved.entries.get(key);
    if (fields === undefined) throw new Error(`missing resolved entry ${key}`);
    return projectEntry(key, fields, modelFiles);
  });

  return { entries, maxChainDepth: resolved.maxChainDepth };
}

function shipDefToJson(shipDef: ShipDef): PlistJson {
  const object: { [key: string]: PlistJson } = {
    model: shipDef.model,
    roles: shipDef.roles,
    smooth: shipDef.smooth,
    materials: recordToJson(shipDef.materials),
    subentities: shipDef.subentities.map((subentity) =>
      recordToJson(subentity as Record<string, unknown>),
    ),
  };
  const optionalNumbers: readonly [keyof ShipDef, string][] = [
    ["maxFlightSpeed", "maxFlightSpeed"],
    ["thrust", "thrust"],
    ["maxFlightPitch", "maxFlightPitch"],
    ["maxFlightRoll", "maxFlightRoll"],
    ["maxCargo", "maxCargo"],
    ["fuel", "fuel"],
    ["energyRecharge", "energyRecharge"],
    ["stationRoll", "stationRoll"],
  ];
  for (const [field, output] of optionalNumbers) {
    const value = shipDef[field];
    if (typeof value === "number") object[output] = value;
  }
  if (shipDef.rotating !== undefined) object.rotating = shipDef.rotating;
  if (shipDef.isDock !== undefined) object.isDock = shipDef.isDock;
  return object;
}

function marketDefinitionToJson(definition: MarketDefinition): PlistJson {
  if (definition.kind === "explicit") {
    return {
      kind: definition.kind,
      definitions: definition.definitions.map((item) => jsonValue(item)),
    };
  }
  return { kind: definition.kind };
}

function entryToJson(entry: CatalogEntry): PlistJson {
  return {
    key: entry.key,
    isTemplate: entry.isTemplate,
    roles: entry.roles,
    model: entry.model,
    modelVendored: entry.modelVendored,
    usable: entry.usable,
    marketDefinition: marketDefinitionToJson(entry.marketDefinition),
    shipDef: shipDefToJson(entry.shipDef),
    extras: recordToJson(entry.extras),
  };
}

/** Canonical JSON bytes for the compiled catalogue. */
export function emitShips(
  parsedShipdata: PlistValue,
  parsedOverrides: PlistValue,
  options: CompileShipsOptions = {},
): EmittedShips {
  const catalogue = compileShips(parsedShipdata, parsedOverrides, options);
  return {
    path: SHIPS_PATH,
    bytes: Buffer.from(
      canonicalJson(catalogue.entries.map((entry) => entryToJson(entry))),
      "utf8",
    ),
  };
}
