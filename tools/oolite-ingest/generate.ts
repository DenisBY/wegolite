// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The content generator: vendored plist bytes in, canonical JSON bytes out
 * (D-04, D-05, T-02-10).
 *
 * Two path rules hold for every emitter that will ever be added here:
 *
 * - every input resolves under `<inputRoot>/third_party/oolite/`; anything that
 *   escapes that directory throws and names the attempted path;
 * - every output is written under `<outRoot>` at a caller-independent
 *   repository-relative path, and `--check` gives it a throwaway `mkdtemp`.
 *
 * A parsed value never chooses a path. Every directory listing that can affect
 * output is sorted first. Each plan wires its emitters beside `commodities`
 * without changing these rules.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { contentError } from "./content-error.js";
import { emitAutoAiMap } from "./convert/auto-ai-map.js";
import { emitCommodities } from "./convert/commodities.js";
import { emitComms } from "./convert/comms.js";
import { DEBRIS_ENTRIES, emitDebris } from "./convert/debris.js";
import { assertBounds, modelBounds, parseDat } from "./convert/dat.js";
import type { ParsedMesh } from "./convert/dat.js";
import { emitDockPort } from "./convert/dock-port.js";
import {
  BUOY_STATION_ROLE,
  BUOY_WITCHPOINT_ROLE,
  MODEL_SOURCE_FILES,
  emitModels,
} from "./convert/glb.js";
import type { ShipEntry } from "./convert/glb.js";
import { emitEquipment } from "./convert/equipment.js";
import { emitExplosions } from "./convert/explosions.js";
import { emitLabels } from "./convert/labels.js";
import { NPC_SHIP_KEYS, emitNpcShips } from "./convert/npc-ships.js";
import { emitRoleCategories } from "./convert/role-categories.js";
import { computeShipMasses } from "./convert/ship-mass.js";
import { emitShipHulls } from "./convert/ship-hulls.js";
import {
  emitStaticHulls,
  staticSubentityKeys,
} from "./convert/static-hulls.js";
import {
  computeCollisionRadii,
  computeShipRadii,
} from "./convert/ship-radius.js";
import {
  CLIENT_SHIP_KEYS,
  compileShips,
  emitClientShips,
  emitShipsFromCatalogue,
} from "./convert/ships.js";
import { emitSystems } from "./convert/systems.js";
import {
  copyParticleTextures,
  copySkyTextures,
  emitTextures,
} from "./convert/textures.js";
import { encodeTextures } from "./convert/texture-encode.js";
import { parseOpenStep } from "./openstep/parser.js";
import type { PlistValue } from "./openstep/plist-value.js";

export const SNAPSHOT_DIR = "third_party/oolite";
export const GENERATED_DIR = "src/content/generated";

const TRADE_GOODS_RELATIVE = "Config/trade-goods.plist";
const TRADE_GOODS_FILE = `${SNAPSHOT_DIR}/${TRADE_GOODS_RELATIVE}`;
const PLANETINFO_RELATIVE = "Config/planetinfo.plist";
const PLANETINFO_FILE = `${SNAPSHOT_DIR}/${PLANETINFO_RELATIVE}`;
const EQUIPMENT_RELATIVE = "Config/equipment.plist";
const EQUIPMENT_FILE = `${SNAPSHOT_DIR}/${EQUIPMENT_RELATIVE}`;
const DESCRIPTIONS_RELATIVE = "Config/descriptions.plist";
const DESCRIPTIONS_FILE = `${SNAPSHOT_DIR}/${DESCRIPTIONS_RELATIVE}`;
const SHIPDATA_RELATIVE = "Config/shipdata.plist";
const SHIPDATA_FILE = `${SNAPSHOT_DIR}/${SHIPDATA_RELATIVE}`;
const SHIPDATA_OVERRIDES_RELATIVE = "Config/shipdata-overrides.plist";
const SHIPDATA_OVERRIDES_FILE = `${SNAPSHOT_DIR}/${SHIPDATA_OVERRIDES_RELATIVE}`;
const EXPLOSIONS_RELATIVE = "Config/explosions.plist";
const EXPLOSIONS_FILE = `${SNAPSHOT_DIR}/${EXPLOSIONS_RELATIVE}`;
const AUTO_AI_MAP_RELATIVE = "Config/autoAImap.plist";
const AUTO_AI_MAP_FILE = `${SNAPSHOT_DIR}/${AUTO_AI_MAP_RELATIVE}`;
const ROLE_CATEGORIES_RELATIVE = "Config/role-categories.plist";
const ROLE_CATEGORIES_FILE = `${SNAPSHOT_DIR}/${ROLE_CATEGORIES_RELATIVE}`;

/**
 * The ships whose Oolite mass is computed at build time (DATA-11): the nine
 * role ships, the client's Cobra Mk III and Coriolis, and the two navigation
 * buoys of D-02 (their mass is computed here; plan 10-04 stores it once the
 * owner picks its home). De-duplicated and code-unit sorted.
 */
const MASS_SHIP_KEYS: readonly string[] = [
  ...new Set([
    ...NPC_SHIP_KEYS,
    ...CLIENT_SHIP_KEYS,
    BUOY_STATION_ROLE,
    BUOY_WITCHPOINT_ROLE,
  ]),
].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

export interface EmittedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface GenerateOptions {
  readonly inputRoot: string;
  readonly outRoot: string;
  /**
   * The tree whose committed encoded textures may be re-used when their source
   * and encoder arguments are unchanged (see `convert/texture-encode.ts`).
   * Omit it to encode every texture again.
   */
  readonly reuseRoot?: string;
}

/** Resolve a vendored input path, refusing anything outside the snapshot. */
export function resolveSnapshotFile(
  inputRoot: string,
  relativePath: string,
): string {
  const base = resolve(inputRoot, SNAPSHOT_DIR);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw contentError(
      "SCHEMA",
      `${SNAPSHOT_DIR}/${relativePath}`,
      "input path",
      {
        excerpt: `input path escapes ${SNAPSHOT_DIR}`,
      },
    );
  }
  return target;
}

/** Resolve an output path, refusing anything outside the output root. */
function resolveOutputFile(outRoot: string, relativePath: string): string {
  const base = resolve(outRoot);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw contentError("SCHEMA", relativePath, "output path", {
      excerpt: "output path escapes the output root",
    });
  }
  return target;
}

async function readConfig(
  inputRoot: string,
  relativePath: string,
  file: string,
): Promise<PlistValue> {
  return parseOpenStep(
    await readFile(resolveSnapshotFile(inputRoot, relativePath), "utf8"),
    file,
  );
}

/** Full generation run: writes every emitted file under `outRoot`. */
export async function generateContent({
  inputRoot,
  outRoot,
  reuseRoot,
}: GenerateOptions): Promise<EmittedFile[]> {
  const [
    commodities,
    systems,
    equipment,
    descriptions,
    shipdata,
    shipOverrides,
    explosions,
    autoAiMap,
    roleCategories,
  ] = await Promise.all([
    readConfig(inputRoot, TRADE_GOODS_RELATIVE, TRADE_GOODS_FILE),
    readConfig(inputRoot, PLANETINFO_RELATIVE, PLANETINFO_FILE),
    readConfig(inputRoot, EQUIPMENT_RELATIVE, EQUIPMENT_FILE),
    readConfig(inputRoot, DESCRIPTIONS_RELATIVE, DESCRIPTIONS_FILE),
    readConfig(inputRoot, SHIPDATA_RELATIVE, SHIPDATA_FILE),
    readConfig(inputRoot, SHIPDATA_OVERRIDES_RELATIVE, SHIPDATA_OVERRIDES_FILE),
    readConfig(inputRoot, EXPLOSIONS_RELATIVE, EXPLOSIONS_FILE),
    readConfig(inputRoot, AUTO_AI_MAP_RELATIVE, AUTO_AI_MAP_FILE),
    readConfig(inputRoot, ROLE_CATEGORIES_RELATIVE, ROLE_CATEGORIES_FILE),
  ]);

  const catalogue = compileShips(shipdata, shipOverrides);
  const entries: Record<string, ShipEntry> = {};
  for (const entry of catalogue.entries) {
    entries[entry.key] = { key: entry.key, shipDef: entry.shipDef };
  }

  // One model read feeds both emitters: the GLB writer and the dock-port
  // measurement must see the same parsed geometry, and parsing the snapshot
  // twice would double the build cost for no benefit.
  const models = await readModels(inputRoot);

  // The masses read the meshes here, before emitModels runs repairWinding, and
  // never mutate them; one computation feeds every emitter that writes a mass.
  const masses = computeShipMasses(MASS_SHIP_KEYS, catalogue, models);

  // The NPC collision radii read the same parsed meshes, for the same reason.
  const radii = computeShipRadii(NPC_SHIP_KEYS, catalogue, models);

  // The client entries' collision radii include the solid subentity term
  // (ShipEntity.m:2028-2044); the station's dock subentity sets its radius.
  const clientRadii = computeCollisionRadii(
    CLIENT_SHIP_KEYS,
    catalogue,
    models,
  );

  // The debris models (DATA-16) are read because MODEL_SOURCE_FILES lists
  // them; their masses and radii come from the same parsed meshes.
  const debrisKeys = DEBRIS_ENTRIES.map((entry) => entry.key);
  const debrisMasses = computeShipMasses(debrisKeys, catalogue, models);
  const debrisRadii = computeShipRadii(debrisKeys, catalogue, models);

  // The static hulls' solid subentities (DATA-15) carry their own masses,
  // computed once from the same parsed meshes.
  const staticMasses = computeShipMasses(
    staticSubentityKeys(catalogue),
    catalogue,
    models,
  );

  const emitted: EmittedFile[] = [
    emitCommodities(commodities, descriptions),
    ...emitSystems(systems),
    emitEquipment(equipment),
    emitLabels(descriptions),
    emitShipsFromCatalogue(catalogue),
    emitClientShips(catalogue, masses, clientRadii),
    emitNpcShips(catalogue, masses, radii, models),
    emitDebris(catalogue, debrisMasses, debrisRadii),
    emitExplosions(explosions),
    emitAutoAiMap(autoAiMap),
    emitRoleCategories(roleCategories),
    emitComms(descriptions),
    emitShipHulls(catalogue, models),
    emitStaticHulls(catalogue, models, staticMasses),
    emitDockPort(models),
    ...emitModels(models, entries),
  ];

  for (const file of emitted) {
    const target = resolveOutputFile(outRoot, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }

  // The ship and station textures are re-encoded to WebP; the closure is
  // asserted before a byte is read, and the record of how each file was
  // produced is emitted beside them (D-21; D-20 as revised).
  const textures = await encodeTextures({
    inputRoot,
    outRoot,
    catalogue: catalogue.entries,
    ...(reuseRoot === undefined ? {} : { reuseRoot }),
  });
  const emissives = await emitTextures({
    inputRoot,
    outRoot,
    catalogue: catalogue.entries,
  });

  // The nebula textures for the High graphics quality: listed in
  // nebulatextures.plist, not referenced by a ship material.
  const skyTextures = await copySkyTextures({ inputRoot, outRoot });

  // The explosion cloud and flash textures the render draws (D16-08): not
  // referenced by a ship material either, copied the same way.
  const particleTextures = await copyParticleTextures({ inputRoot, outRoot });

  return [
    ...emitted,
    ...textures,
    ...emissives,
    ...skyTextures,
    ...particleTextures,
  ];
}

/**
 * Read and validate every mesh a GLB is built from. The authored extents are
 * asserted against the recorded ones before any conversion, so a snapshot bump
 * that changes geometry fails as `MESH_BOUNDS` instead of silently re-baselining
 * the committed binaries.
 */
async function readModels(
  inputRoot: string,
): Promise<Record<string, ParsedMesh>> {
  const wanted = new Set<string>();
  for (const files of Object.values(MODEL_SOURCE_FILES)) {
    for (const file of files) wanted.add(file);
  }
  const names = [...wanted].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

  const models: Record<string, ParsedMesh> = {};
  for (const name of names) {
    const relative = `Models/${name}`;
    const file = `${SNAPSHOT_DIR}/${relative}`;
    const mesh = parseDat(
      await readFile(resolveSnapshotFile(inputRoot, relative), "utf8"),
      file,
    );
    assertBounds(mesh, modelBounds(name), file);
    models[name] = mesh;
  }
  return models;
}
