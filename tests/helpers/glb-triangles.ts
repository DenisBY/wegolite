// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The triangle count of a committed GLB, read from its accessor counts alone
 * (Phase 22 plan 22-12, QUAL-09's census half).
 *
 * No three.js and no DOM: the header, the JSON chunk and the accessor table of
 * the container (`tools/oolite-ingest/convert/glb.ts` writes `header(12) | JSON
 * chunk | BIN chunk`). A primitive in `TRIANGLES` mode (4, the default) counts
 * `indices.count / 3`, or `POSITION.count / 3` when it is unindexed; the strip
 * and fan modes count `n - 2`; points and lines count nothing. The mesh table is
 * summed once per mesh, as the per-hull budget counts a hull's geometry once
 * and the renderer multiplies it by the instances present.
 */

import { readFileSync } from "node:fs";

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

interface GltfAccessor {
  readonly count?: number;
}

interface GltfPrimitive {
  readonly mode?: number;
  readonly indices?: number;
  readonly attributes?: Readonly<Record<string, number>>;
}

interface GltfJson {
  readonly accessors?: readonly GltfAccessor[];
  readonly meshes?: readonly {
    readonly primitives?: readonly GltfPrimitive[];
  }[];
}

/** The JSON chunk of a GLB file; throws on a malformed container. */
function readJsonChunk(bytes: Buffer, label: string): GltfJson {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`${label}: not a GLB container`);
  }
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== CHUNK_JSON || 20 + length > bytes.length) {
    throw new Error(`${label}: the first chunk is not a complete JSON chunk`);
  }
  return JSON.parse(bytes.toString("utf8", 20, 20 + length)) as GltfJson;
}

function countOf(accessors: readonly GltfAccessor[], index: number): number {
  const count = accessors[index]?.count;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error(`accessor ${String(index)} has no valid count`);
  }
  return count;
}

/** Triangles of one primitive: the draw mode decides how its vertices connect. */
function primitiveTriangles(
  primitive: GltfPrimitive,
  accessors: readonly GltfAccessor[],
): number {
  const mode = primitive.mode ?? 4;
  const source =
    primitive.indices ?? primitive.attributes?.["POSITION"] ?? undefined;
  if (source === undefined) return 0;
  const vertices = countOf(accessors, source);
  if (mode === 4) return Math.floor(vertices / 3);
  if (mode === 5 || mode === 6) return Math.max(0, vertices - 2);
  return 0;
}

/** The triangle count of the GLB at `path`: the sum over every mesh primitive. */
export function glbTriangleCount(path: string | URL): number {
  const label = String(path);
  const json = readJsonChunk(readFileSync(path), label);
  const accessors = json.accessors ?? [];
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      triangles += primitiveTriangles(primitive, accessors);
    }
  }
  return triangles;
}

/** What `hullTriangles` needs of a catalogue record. */
export interface HullRecord {
  readonly key: string;
  /** The model path under `public/`, as the catalogue writes it (`models/adder.glb`). */
  readonly glb: string;
}

const PUBLIC_DIR = new URL("../../public/", import.meta.url);

const cache = new Map<string, number>();

/**
 * The GLB triangle count of every record, keyed by record key. Cached by model
 * path, so a census over thousands of worlds reads each file once.
 */
export function hullTriangles(
  records: readonly HullRecord[],
): ReadonlyMap<string, number> {
  const byKey = new Map<string, number>();
  for (const record of records) {
    let triangles = cache.get(record.glb);
    if (triangles === undefined) {
      triangles = glbTriangleCount(new URL(record.glb, PUBLIC_DIR));
      cache.set(record.glb, triangles);
    }
    byKey.set(record.key, triangles);
  }
  return byKey;
}
