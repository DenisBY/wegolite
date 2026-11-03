// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `third_party/oolite/Config/planetinfo.plist` → eight per-galaxy chunks
 * (DATA-05, D-12, D-14, D-22, D-25, T-02-05, T-02-14).
 *
 * One pure function, one job: project the parsed plist into records whose shape
 * is `SystemSchema`. Every file read and write stays in `generate.ts`.
 *
 * Identity is the `(galaxy, systemIndex)` pair decoded from the authored
 * `"<galaxy> <index>"` key. Nothing here deduplicates, merges, or keys a record
 * by name or coordinates: two systems with equal names remain two records with
 * distinct ids, and the only ordering is numeric `systemIndex`, so equal names
 * cannot reorder output.
 *
 * Raw values stay raw: `radius` becomes `radiusKm` with no ×10 scaling,
 * `techlevel` becomes `techLevelRaw` with no +1 display adjustment, `station`
 * keeps its role fragment, and every string is emitted as the exact authored
 * code points with no Unicode normalisation.
 *
 * `"universal"` and `"interstellar space"` are the only non-system top-level
 * keys in the pinned snapshot. They are skipped explicitly and a third such key
 * is a `SCHEMA` failure rather than a silent drop.
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { getEntry } from "../openstep/plist-value.js";
import type {
  PlistDict,
  PlistEntry,
  PlistValue,
} from "../openstep/plist-value.js";
import { SystemSchema } from "../../../src/content/schemas/system.js";
import type { System } from "../../../src/content/schemas/system.js";

export const SYSTEMS_DIR = "src/content/generated/systems";
export const GALAXY_COUNT = 8;
export const SYSTEMS_PER_GALAXY = 256;

const FILE = "third_party/oolite/Config/planetinfo.plist";

/** The two authored top-level keys that are not systems. */
const NON_SYSTEM_KEYS: ReadonlySet<string> = new Set([
  "universal",
  "interstellar space",
]);

const SYSTEM_KEY = /^([0-7]) (\d+)$/;

/** The eight authored 4-component colour strings. */
const COLOUR_KEYS = [
  "air_color",
  "cloud_color",
  "land_color",
  "polar_cloud_color",
  "polar_land_color",
  "polar_sea_color",
  "sea_color",
  "sun_color",
] as const;

/** The three authored 3-component vector strings. */
const VECTOR_KEYS = [
  "station_vector",
  "sun_vector",
  "terminator_threshold_vector",
] as const;

export interface EmittedSystems {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
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

function requireEntry(
  dict: PlistDict,
  key: string,
  construct: string,
): PlistEntry {
  const entry = getEntry(dict, key);
  if (entry === undefined) {
    throw contentError("SCHEMA", FILE, construct, {
      excerpt: `missing key "${key}"`,
    });
  }
  return entry;
}

function readString(dict: PlistDict, key: string, construct: string): string {
  const entry = requireEntry(dict, key, construct);
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
  const entry = requireEntry(dict, key, construct);
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
  const entry = requireEntry(dict, key, construct);
  if (entry.value.kind !== "integer") {
    throw contentError("SCHEMA", FILE, construct, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt: `"${key}" must be a bare integer`,
    });
  }
  return entry.value.value;
}

/**
 * Split an authored space-separated tuple, requiring an exact component count.
 * A wrong count is a `SCHEMA` failure: a 3-component colour would otherwise
 * become a 4-element `undefined`-padded array.
 */
function readComponents(
  dict: PlistDict,
  key: string,
  components: number,
  construct: string,
): number[] {
  const text = readString(dict, key, construct).trim();
  const parts = text === "" ? [] : text.split(/\s+/);
  if (parts.length !== components) {
    throw contentError("SCHEMA", FILE, construct, {
      excerpt: `"${key}" must have exactly ${String(components)} components, found ${String(parts.length)}`,
    });
  }
  return parts.map((part) => {
    const value = Number(part);
    if (!Number.isFinite(value)) {
      throw contentError("SCHEMA", FILE, construct, {
        excerpt: `"${key}" contains a non-numeric component "${part}"`,
      });
    }
    return value;
  });
}

function readIntegerComponents(
  dict: PlistDict,
  key: string,
  components: number,
  construct: string,
): number[] {
  const values = readComponents(dict, key, components, construct);
  for (const value of values) {
    if (!Number.isInteger(value)) {
      throw contentError("SCHEMA", FILE, construct, {
        excerpt: `"${key}" components must be integers`,
      });
    }
  }
  return values;
}

function presentFields(dict: PlistDict): string[] {
  const keys = new Set<string>();
  for (const entry of dict.entries) keys.add(entry.key);
  return [...keys].sort(compareCodeUnits);
}

function projectSystem(
  galaxy: number,
  systemIndex: number,
  dict: PlistDict,
): System {
  const construct = `systems.g${String(galaxy)}-s${String(systemIndex)}`;
  const coordinates = readIntegerComponents(
    dict,
    "coordinates",
    2,
    `${construct}.coordinates`,
  );
  const chartX = coordinates[0] ?? 0;
  const chartY = coordinates[1] ?? 0;

  const candidate = {
    id: `g${String(galaxy)}-s${String(systemIndex)}`,
    galaxy,
    systemIndex,
    name: readString(dict, "name", `${construct}.name`),
    chartX,
    chartY,
    economy: readInteger(dict, "economy", `${construct}.economy`),
    government: readInteger(dict, "government", `${construct}.government`),
    techLevelRaw: readInteger(dict, "techlevel", `${construct}.techlevel`),
    population: readInteger(dict, "population", `${construct}.population`),
    productivity: readInteger(
      dict,
      "productivity",
      `${construct}.productivity`,
    ),
    radiusKm: readInteger(dict, "radius", `${construct}.radius`),
    planetDistance: readNumber(
      dict,
      "planet_distance",
      `${construct}.planet_distance`,
    ),
    sunDistance: readNumber(dict, "sun_distance", `${construct}.sun_distance`),
    sunRadius: readNumber(dict, "sun_radius", `${construct}.sun_radius`),
    station: readString(dict, "station", `${construct}.station`),
    stationVector: readComponents(
      dict,
      "station_vector",
      3,
      `${construct}.station_vector`,
    ),
    sunVector: readComponents(dict, "sun_vector", 3, `${construct}.sun_vector`),
    terminatorThresholdVector: readComponents(
      dict,
      "terminator_threshold_vector",
      3,
      `${construct}.terminator_threshold_vector`,
    ),
    air_color: readComponents(dict, "air_color", 4, `${construct}.air_color`),
    cloud_color: readComponents(
      dict,
      "cloud_color",
      4,
      `${construct}.cloud_color`,
    ),
    land_color: readComponents(
      dict,
      "land_color",
      4,
      `${construct}.land_color`,
    ),
    polar_cloud_color: readComponents(
      dict,
      "polar_cloud_color",
      4,
      `${construct}.polar_cloud_color`,
    ),
    polar_land_color: readComponents(
      dict,
      "polar_land_color",
      4,
      `${construct}.polar_land_color`,
    ),
    polar_sea_color: readComponents(
      dict,
      "polar_sea_color",
      4,
      `${construct}.polar_sea_color`,
    ),
    sea_color: readComponents(dict, "sea_color", 4, `${construct}.sea_color`),
    sun_color: readComponents(dict, "sun_color", 4, `${construct}.sun_color`),
    description: readString(dict, "description", `${construct}.description`),
    inhabitant: readString(dict, "inhabitant", `${construct}.inhabitant`),
    inhabitants: readString(dict, "inhabitants", `${construct}.inhabitants`),
    random_seed: readString(dict, "random_seed", `${construct}.random_seed`),
    air_color_mix_ratio: readNumber(
      dict,
      "air_color_mix_ratio",
      `${construct}.air_color_mix_ratio`,
    ),
    air_density: readNumber(dict, "air_density", `${construct}.air_density`),
    ambient_level: readNumber(
      dict,
      "ambient_level",
      `${construct}.ambient_level`,
    ),
    cloud_alpha: readNumber(dict, "cloud_alpha", `${construct}.cloud_alpha`),
    cloud_fraction: readNumber(
      dict,
      "cloud_fraction",
      `${construct}.cloud_fraction`,
    ),
    corona_flare: readNumber(dict, "corona_flare", `${construct}.corona_flare`),
    corona_hues: readNumber(dict, "corona_hues", `${construct}.corona_hues`),
    corona_shimmer: readNumber(
      dict,
      "corona_shimmer",
      `${construct}.corona_shimmer`,
    ),
    land_fraction: readNumber(
      dict,
      "land_fraction",
      `${construct}.land_fraction`,
    ),
    layer: readInteger(dict, "layer", `${construct}.layer`),
    rotation_speed: readNumber(
      dict,
      "rotation_speed",
      `${construct}.rotation_speed`,
    ),
    sky_n_blurs: readInteger(dict, "sky_n_blurs", `${construct}.sky_n_blurs`),
    sky_n_stars: readInteger(dict, "sky_n_stars", `${construct}.sky_n_stars`),
    presentFields: presentFields(dict),
  };

  const withPercent =
    getEntry(dict, "percent_cloud") === undefined
      ? candidate
      : {
          ...candidate,
          percentCloud: readInteger(
            dict,
            "percent_cloud",
            `${construct}.percent_cloud`,
          ),
        };

  const result = SystemSchema.safeParse(withPercent);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw contentError(
      "SCHEMA",
      FILE,
      issue === undefined ? construct : `${construct}.${issue.path.join(".")}`,
      {
        excerpt: issue === undefined ? "invalid system record" : issue.message,
      },
    );
  }
  return result.data;
}

/** Project every system into eight galaxy arrays, each in `systemIndex` order. */
export function compileSystems(parsed: PlistValue): System[][] {
  const root = requireDict(parsed, "root");

  // Validate the key namespace first: a third non-system key must fail before
  // any record is projected, so the failure names the key rather than a
  // downstream field.
  for (const entry of root.entries) {
    if (NON_SYSTEM_KEYS.has(entry.key)) continue;
    if (SYSTEM_KEY.exec(entry.key) !== null) continue;
    throw contentError("SCHEMA", FILE, entry.key, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt:
        "unrecognised top-level key: expected a system key or one of the two non-system keys",
    });
  }

  const galaxies: System[][] = Array.from({ length: GALAXY_COUNT }, () => []);
  const ids = new Set<string>();

  for (const entry of root.entries) {
    if (NON_SYSTEM_KEYS.has(entry.key)) continue;
    const match = SYSTEM_KEY.exec(entry.key);
    if (match === null) continue; // already rejected above
    const galaxy = Number(match[1]);
    const systemIndex = Number(match[2]);
    const chunk = galaxies[galaxy];
    if (chunk === undefined) {
      throw contentError("SCHEMA", FILE, entry.key, {
        excerpt: `galaxy ${String(galaxy)} is outside 0-7`,
      });
    }
    const record = projectSystem(
      galaxy,
      systemIndex,
      requireDict(
        entry.value,
        `systems.g${String(galaxy)}-s${String(systemIndex)}`,
        entry.keyLine,
        entry.keyColumn,
      ),
    );
    if (ids.has(record.id)) {
      throw contentError("SCHEMA", FILE, entry.key, {
        excerpt: `duplicate system id "${record.id}"`,
      });
    }
    ids.add(record.id);
    chunk.push(record);
  }

  for (const [galaxy, chunk] of galaxies.entries()) {
    if (chunk.length !== SYSTEMS_PER_GALAXY) {
      throw contentError("SCHEMA", FILE, `systems/g${String(galaxy)}.json`, {
        excerpt: `expected ${String(SYSTEMS_PER_GALAXY)} systems, found ${String(chunk.length)}`,
      });
    }
    chunk.sort((left, right) => left.systemIndex - right.systemIndex);
  }

  return galaxies;
}

function systemJson(system: System): PlistJson {
  const json: { [key: string]: PlistJson } = {
    id: system.id,
    galaxy: system.galaxy,
    systemIndex: system.systemIndex,
    name: system.name,
    chartX: system.chartX,
    chartY: system.chartY,
    economy: system.economy,
    government: system.government,
    techLevelRaw: system.techLevelRaw,
    population: system.population,
    productivity: system.productivity,
    radiusKm: system.radiusKm,
    planetDistance: system.planetDistance,
    sunDistance: system.sunDistance,
    sunRadius: system.sunRadius,
    station: system.station,
    stationVector: [...system.stationVector],
    sunVector: [...system.sunVector],
    terminatorThresholdVector: [...system.terminatorThresholdVector],
    air_color: [...system.air_color],
    cloud_color: [...system.cloud_color],
    land_color: [...system.land_color],
    polar_cloud_color: [...system.polar_cloud_color],
    polar_land_color: [...system.polar_land_color],
    polar_sea_color: [...system.polar_sea_color],
    sea_color: [...system.sea_color],
    sun_color: [...system.sun_color],
    description: system.description,
    inhabitant: system.inhabitant,
    inhabitants: system.inhabitants,
    random_seed: system.random_seed,
    air_color_mix_ratio: system.air_color_mix_ratio,
    air_density: system.air_density,
    ambient_level: system.ambient_level,
    cloud_alpha: system.cloud_alpha,
    cloud_fraction: system.cloud_fraction,
    corona_flare: system.corona_flare,
    corona_hues: system.corona_hues,
    corona_shimmer: system.corona_shimmer,
    land_fraction: system.land_fraction,
    layer: system.layer,
    rotation_speed: system.rotation_speed,
    sky_n_blurs: system.sky_n_blurs,
    sky_n_stars: system.sky_n_stars,
    presentFields: [...system.presentFields],
  };
  if (system.percentCloud !== undefined) {
    json.percentCloud = system.percentCloud;
  }
  return json;
}

/** Canonical JSON bytes for the eight galaxy chunks. */
export function emitSystems(parsed: PlistValue): EmittedSystems[] {
  return compileSystems(parsed).map((records, galaxy) => ({
    path: `${SYSTEMS_DIR}/g${String(galaxy)}.json`,
    bytes: Buffer.from(
      canonicalJson(records.map((record) => systemJson(record))),
      "utf8",
    ),
  }));
}

/** The authored colour and vector key lists, exported for assertions. */
export { COLOUR_KEYS, VECTOR_KEYS, SYSTEM_KEY, NON_SYSTEM_KEYS };
