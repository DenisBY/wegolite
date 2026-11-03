// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * RED stub for the deterministic GLB writer (DATA-04, DATA-07, D-05, D-07,
 * D-08, D-09, D-20).
 *
 * Every entry point throws: this file exists only so the failing tests can run
 * and fail on their own assertions rather than on a missing module.
 */

import type { NormalMode, ParsedMesh } from "./dat.js";
import type { ShipDef } from "../../../src/content/schemas/ship.js";

export type Coordinates = "oolite" | "gltf";

export const GLB_GENERATOR = "wegolite-oolite-ingest/1";

export const EMITTED_MODELS_DIR = "public/models";

export const SHIPDATA_SOURCE_FILE = "third_party/oolite/Config/shipdata.plist";

/** Which shipdata entry owns each emitted mesh (DATA-07, D-11). */
export const EMITTED_ENTRIES: Readonly<Record<string, readonly string[]>> = {
  "cobra3.glb": ["cobra3-player"],
  "coriolis.glb": [
    "coriolis-station",
    "oolite_coriolis_faceplate",
    "oolite_coriolis_tris",
    "oolite_coriolis_dock",
  ],
};

export interface GlbBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface GlbPrimitive extends GlbBounds {
  readonly materialName: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

export interface GlbMesh {
  readonly name: string;
  readonly primitives: readonly GlbPrimitive[];
}

export interface GlbNode {
  readonly name: string;
  readonly translation?: readonly [number, number, number];
  readonly mesh: GlbMesh;
}

export type EmissionModulateColor =
  | readonly number[]
  | Readonly<Record<string, number>>
  | null;

export interface OoliteExtras {
  readonly sourceFile: string;
  readonly shipKey: string;
  readonly materialKey: string;
  readonly gloss: number;
  readonly shininess: number | null;
  readonly specular_color: readonly number[] | null;
  readonly emission_modulate_color: EmissionModulateColor;
  readonly emissionModulateColorNormalized: readonly [number, number, number];
  readonly emission_extract_channel: string | null;
  readonly diffuse_map: string | null;
  readonly normal_map: string | null;
  readonly specular_map: string | null;
  readonly emission_map: string | null;
}

export interface GlbMaterial {
  readonly name: string;
  readonly baseColorTexture: string | null;
  readonly normalTexture: string | null;
  readonly specularTexture: string | null;
  readonly emissiveTexture: string | null;
  readonly roughnessFactor: number;
  readonly extrasOolite: OoliteExtras | null;
}

export interface GlbScene {
  readonly nodes: readonly GlbNode[];
  readonly materials: readonly GlbMaterial[];
}

export interface ShipEntry {
  readonly key: string;
  readonly shipDef: ShipDef;
}

export interface CoriolisMeshes {
  readonly hull: ParsedMesh;
  readonly faceplate: ParsedMesh;
  readonly tris: ParsedMesh;
  readonly dock: ParsedMesh;
}

export interface CoriolisEntries {
  readonly hull: ShipEntry;
  readonly faceplate: ShipEntry;
  readonly tris: ShipEntry;
  readonly dock: ShipEntry;
}

export interface EmittedModel {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function notImplemented(name: string): never {
  throw new Error(`${name} is not implemented yet`);
}

export function writeGlb(_scene: GlbScene): Uint8Array {
  return notImplemented("writeGlb");
}

export function convertMesh(
  _mesh: ParsedMesh,
  _mode: NormalMode,
  _coordinates: Coordinates,
): GlbPrimitive[] {
  return notImplemented("convertMesh");
}

export function materialFor(
  _materialKey: string,
  _shipDef: ShipDef,
  _shipKey: string,
): GlbMaterial {
  return notImplemented("materialFor");
}

export function buildCobraGlb(
  _mesh: ParsedMesh,
  _entry: ShipEntry,
): Uint8Array {
  return notImplemented("buildCobraGlb");
}

export function buildCoriolisGlb(
  _meshes: CoriolisMeshes,
  _entries: CoriolisEntries,
): Uint8Array {
  return notImplemented("buildCoriolisGlb");
}

export function emitModels(
  _meshes: Readonly<Record<string, ParsedMesh>>,
  _entries: Readonly<Record<string, ShipEntry>>,
): EmittedModel[] {
  return notImplemented("emitModels");
}
