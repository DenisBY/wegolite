// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hull octrees of the static and debris bodies (DATA-15, Phase 18 first
 * plan; the data halves of D-07 and PD-01).
 *
 * The station, the navigation buoys, the cargo barrel and the alloy plate are
 * hit and collided with through Oolite's octrees, so their octrees reach the
 * client the way the ten ship hulls do (`ship-hulls.ts`): built here, at build
 * time, from the vendored `.dat` models with the same `buildOctree`, the same
 * `collisionRadius` that `ships-client.json` carries (solid subentities
 * included, `ShipEntity.m:2028-2044`) and the same `computeShipMasses`.
 *
 * A static hull also carries its solid subentities, each resolved through its
 * `subentity_key` to its own catalogue entry, model, octree and mass, with the
 * position as authored (Oolite model axes). Flashers are `OOFlasherEntity`, not
 * ships, and are skipped (`ShipEntity.m:1219-1222`). Every stock subentity
 * orientation is the identity, so none is carried: a non-identity orientation
 * fails the build rather than being dropped silently. The subentities are not
 * merged into one octree (owner decision 2026-11-16).
 *
 * The Coriolis octrees exceed the ten-hull caps (`MAX_HULL_NODES`,
 * `MAX_HULL_ARTIFACT_BYTES`), so these hulls ship in their own lazily loaded
 * file under their own schema (`src/content/schemas/ship-static-hull.ts`); the
 * ten-hull file and its caps are untouched.
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import {
  StaticHullArtifactSchema,
  type StaticHullArtifact,
} from "../../../src/content/schemas/ship-static-hull.js";
import type { HullNode } from "../../../src/content/schemas/ship-hull.js";
import type { ParsedMesh } from "./dat.js";
import { buildOctree } from "./octree.js";
import { collisionRadius } from "./ship-radius.js";
import { MODELS_DIR, SHIPDATA_FILE } from "./ships.js";
import type { EmittedShips, ShipCatalogue } from "./ships.js";

type CatalogEntry = ShipCatalogue["entries"][number];

/** Where the static hull artifact is written, repository-relative. */
export const STATIC_HULLS_PATH =
  "src/content/generated/ships-static-hulls.json";

/**
 * The static and debris hulls, in artifact order: the Coriolis station, the
 * navigation buoy (both buoys share its model and subentity), the cargo barrel
 * and the alloy plate (D-07; wrecks get no hull).
 */
export const STATIC_HULL_KEYS: readonly string[] = [
  "coriolis-station",
  "buoy",
  "barrel",
  "alloy",
];

/**
 * The ident targets whose display names the artifact carries, in order, so no
 * display name is typed into app code (plan 18-06).
 */
export const STATIC_NAME_KEYS: readonly string[] = [
  "coriolis-station",
  "buoy",
  "buoy-witchpoint",
  "barrel",
  "alloy",
];

function fail(key: string, file: string, detail: string): never {
  throw contentError("SCHEMA", file, key, { excerpt: detail });
}

function entryOf(catalogue: ShipCatalogue, key: string): CatalogEntry {
  const entry = catalogue.entries.find((candidate) => candidate.key === key);
  if (entry === undefined) {
    return fail(
      key,
      SHIPDATA_FILE,
      `the compiled ship catalogue has no "${key}" entry`,
    );
  }
  return entry;
}

/** The octree of one entry's own model, as the record shape. */
function octreeOf(
  key: string,
  entry: CatalogEntry,
  models: Readonly<Record<string, ParsedMesh>>,
): { radius: number; depth: number; root: HullNode } {
  if (entry.model === null) {
    return fail(key, SHIPDATA_FILE, "the entry has no model, so no hull");
  }
  const file = `${MODELS_DIR}/${entry.model}`;
  const mesh = models[entry.model];
  if (mesh === undefined) {
    return fail(
      key,
      file,
      `the model set has no parsed mesh for "${entry.model}"`,
    );
  }
  const octree = buildOctree(mesh, file);
  return { radius: octree.radius, depth: octree.depth, root: octree.root };
}

/** One quaternion component as a number, or undefined. */
function componentOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Whether an authored subentity orientation is the identity quaternion
 * `(1, 0, 0, 0)` (w, x, y, z). An absent orientation is the identity, Oolite's
 * default (`oo_quaternionForKey`, `ShipEntity.m:884`).
 */
function isIdentityOrientation(value: unknown): boolean {
  if (value === undefined) return true;
  const parts =
    typeof value === "string"
      ? value.trim().split(/\s+/).filter(Boolean)
      : Array.isArray(value)
        ? (value as unknown[])
        : undefined;
  if (parts?.length !== 4) return false;
  const numbers = parts.map(componentOf);
  return (
    numbers[0] === 1 && numbers[1] === 0 && numbers[2] === 0 && numbers[3] === 0
  );
}

/** Oolite's `OOBooleanFromObject` over a compiled JSON extra. */
function booleanOf(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "yes" || text === "true" || text === "on") return true;
    if (text === "no" || text === "false" || text === "off" || text === "")
      return false;
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed !== 0 : defaultValue;
  }
  return defaultValue;
}

/**
 * The display name of one compiled entry, `like_ship` already resolved:
 * `display_name` when authored, else `name` (`ShipEntity.m:391-395`), as
 * `npc-ships.ts` reads it.
 */
function displayNameOf(key: string, entry: CatalogEntry): string {
  const displayName = entry.extras["display_name"];
  const name =
    typeof displayName === "string" ? displayName : entry.extras["name"];
  if (typeof name !== "string") {
    return fail(key, SHIPDATA_FILE, "the entry has no display_name or name");
  }
  return name;
}

/**
 * The solid subentity keys of the static hulls, in hull and `shipdata` order,
 * de-duplicated: the keys whose masses `compileStaticHulls` needs.
 */
export function staticSubentityKeys(catalogue: ShipCatalogue): string[] {
  const keys: string[] = [];
  for (const key of STATIC_HULL_KEYS) {
    for (const subentity of entryOf(catalogue, key).shipDef.subentities) {
      if (subentity.type === "flasher") continue;
      const subentityKey = subentity.subentity_key;
      if (typeof subentityKey === "string" && !keys.includes(subentityKey)) {
        keys.push(subentityKey);
      }
    }
  }
  return keys;
}

/**
 * Compile the static hull artifact: one hull per {@link STATIC_HULL_KEYS}
 * entry, in that order, each with its solid subentities, and one display name
 * per {@link STATIC_NAME_KEYS} entry.
 *
 * @throws {ContentError} when a key, model, mesh, subentity mass or name is
 * missing,
 * a non-flasher subentity has no `subentity_key` or `position`, a subentity
 * orientation is not the identity, or the artifact fails
 * `StaticHullArtifactSchema` (`SCHEMA`).
 */
export function compileStaticHulls(
  catalogue: ShipCatalogue,
  models: Readonly<Record<string, ParsedMesh>>,
  masses: ReadonlyMap<string, number>,
): StaticHullArtifact {
  const hulls = STATIC_HULL_KEYS.map((key) => {
    const entry = entryOf(catalogue, key);
    const subentities = entry.shipDef.subentities
      .filter((subentity) => subentity.type !== "flasher")
      .map((subentity) => {
        const subentityKey = subentity.subentity_key;
        if (typeof subentityKey !== "string") {
          return fail(
            key,
            SHIPDATA_FILE,
            "a non-flasher subentity has no subentity_key, so it has no hull",
          );
        }
        const position = subentity.position;
        if (position === undefined) {
          return fail(
            key,
            SHIPDATA_FILE,
            `the solid subentity "${subentityKey}" has no position`,
          );
        }
        if (!isIdentityOrientation(subentity["orientation"])) {
          return fail(
            key,
            SHIPDATA_FILE,
            `the solid subentity "${subentityKey}" has a non-identity orientation, which the static hull record cannot carry`,
          );
        }
        const mass = masses.get(subentityKey);
        if (mass === undefined) {
          return fail(
            subentityKey,
            SHIPDATA_FILE,
            `no computed mass for the subentity "${subentityKey}" of "${key}"`,
          );
        }
        return {
          key: subentityKey,
          position: [position[0], position[1], position[2]] as [
            number,
            number,
            number,
          ],
          mass,
          octree: octreeOf(
            subentityKey,
            entryOf(catalogue, subentityKey),
            models,
          ),
        };
      });
    return {
      key,
      collisionRadius: collisionRadius(key, catalogue, models),
      // ShipEntity.m:376: frangible defaults to YES.
      frangible: booleanOf(entry.extras["frangible"], true),
      octree: octreeOf(key, entry, models),
      subentities,
    };
  });

  const names = STATIC_NAME_KEYS.map((key) => ({
    key,
    name: displayNameOf(key, entryOf(catalogue, key)),
  }));

  const parsed = StaticHullArtifactSchema.safeParse({ hulls, names });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      issue === undefined ? "statics" : `statics.${issue.path.join(".")}`,
      STATIC_HULLS_PATH,
      issue === undefined ? "invalid static hull artifact" : issue.message,
    );
  }
  return parsed.data;
}

/** A placeholder no compiled string can contain, swapped for a compact root. */
function rootMarker(index: number): string {
  return `\u0000root:${String(index)}\u0000`;
}

/**
 * Serialise the static hull artifact in the canonical layout (keys in
 * code-unit order, two-space indent, `\n` endings, one final newline) with one
 * exception, as in `emitShipHulls`: each octree `root` is one compact line, so
 * the file stays a few hundred kilobytes instead of several megabytes. The
 * bytes remain a pure function of the vendored pin.
 */
export function emitStaticHulls(
  catalogue: ShipCatalogue,
  models: Readonly<Record<string, ParsedMesh>>,
  masses: ReadonlyMap<string, number>,
): EmittedShips {
  const artifact = compileStaticHulls(catalogue, models, masses);
  const roots: HullNode[] = [];
  const octreeJson = (octree: {
    radius: number;
    depth: number;
    root: HullNode;
  }): PlistJson => {
    roots.push(octree.root);
    return {
      depth: octree.depth,
      radius: octree.radius,
      root: rootMarker(roots.length - 1),
    };
  };
  const json: PlistJson = {
    hulls: artifact.hulls.map((hull) => ({
      collisionRadius: hull.collisionRadius,
      frangible: hull.frangible,
      key: hull.key,
      octree: octreeJson(hull.octree),
      subentities: hull.subentities.map((subentity) => ({
        key: subentity.key,
        mass: subentity.mass,
        octree: octreeJson(subentity.octree),
        position: [...subentity.position],
      })),
    })),
    names: artifact.names.map((name) => ({ key: name.key, name: name.name })),
  };
  let text = canonicalJson(json);
  roots.forEach((root, index) => {
    text = text.replace(
      JSON.stringify(rootMarker(index)),
      JSON.stringify(root),
    );
  });
  return { path: STATIC_HULLS_PATH, bytes: Buffer.from(text, "utf8") };
}
