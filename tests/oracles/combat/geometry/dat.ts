// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * A minimal reader of Oolite's `.dat` mesh format for the geometry oracle
 * (Phase 18, plan 18-02).
 *
 * Independence: this module reads the vendored meshes under
 * `third_party/oolite/Models/` and nothing else; it imports only `node:fs`.
 *
 * The format (as written by Obj2DatTex.py and read by `OOMesh.m`): `//`
 * comment lines, `NVERTS n`, `NFACES m`, a `VERTEX` section of `n` lines
 * `x, y, z`, and a `FACES` section of `m` lines
 * `r,g,b,<tab>nx,ny,nz,<tab>k,<tab>v0,v1,...` where `k` is the vertex count of
 * the polygon. Later sections (`TEXTURES`, `NAMES`, `NORMALS`, ...) are
 * skipped. Polygons with more than three vertices are triangulated as a fan
 * from their first vertex; every face of the six station and buoy models is
 * already a triangle, so the fan never fires on them.
 *
 * Degenerate triangles (two equal vertices) are dropped, as the octree
 * converter drops them (`OOMeshToOctreeConverter.m:253-258`,
 * `OOTriangleIsDegenerate`, `OOTriangle.h:66-69`); `faceCount` still reports
 * the declared `NFACES`.
 *
 * The reader is bounded by the declared counts (threat T-18-05): it reads at
 * most `NVERTS` vertex lines and `NFACES` face lines and fails loudly on any
 * mismatch, a missing section, a non-finite number or an out-of-range index.
 */

import { readFileSync } from "node:fs";

export type Vec3 = readonly [number, number, number];
export type Triangle = readonly [Vec3, Vec3, Vec3];

export interface DatMesh {
  /** The vertices in Oolite model axes (x right, y up, z forward), metres. */
  readonly vertices: readonly Vec3[];
  /** The triangles, fan-triangulated, degenerate ones dropped. */
  readonly triangles: readonly Triangle[];
  /** The declared `NFACES`. */
  readonly faceCount: number;
  /** Triangles the fan produced from the declared faces (before dropping). */
  readonly fanTriangleCount: number;
}

function fail(source: string, message: string): never {
  throw new Error(`readDat(${source}): ${message}`);
}

function parseCount(
  lines: readonly string[],
  key: string,
  source: string,
): number {
  const pattern = new RegExp(`^${key}\\s+(\\d+)\\s*$`);
  for (const line of lines) {
    const match = pattern.exec(line.trim());
    if (match !== null) return Number(match[1]);
  }
  return fail(source, `missing ${key}`);
}

function sectionStart(
  lines: readonly string[],
  key: string,
  source: string,
): number {
  const index = lines.findIndex((line) => line.trim() === key);
  if (index < 0) fail(source, `missing ${key} section`);
  return index + 1;
}

function numbers(line: string, source: string, where: string): number[] {
  const tokens = line
    .trim()
    .split(/[\s,]+/)
    .filter((token) => token.length > 0);
  const values = tokens.map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    fail(source, `${where}: non-numeric token in "${line.trim()}"`);
  }
  return values;
}

/** Parses `.dat` text; `source` names it in error messages. */
export function parseDat(text: string, source: string): DatMesh {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"));
  const vertexCount = parseCount(lines, "NVERTS", source);
  const faceCount = parseCount(lines, "NFACES", source);
  if (vertexCount < 3) fail(source, `NVERTS ${vertexCount} is below 3`);
  if (faceCount < 1) fail(source, `NFACES ${faceCount} is below 1`);

  const vertexStart = sectionStart(lines, "VERTEX", source);
  const vertices: Vec3[] = [];
  let cursor = vertexStart;
  while (vertices.length < vertexCount) {
    const line = lines[cursor];
    if (line === undefined) {
      fail(source, `VERTEX ends after ${vertices.length} of ${vertexCount}`);
    }
    cursor += 1;
    if (line.trim().length === 0) continue;
    const values = numbers(line, source, `vertex ${vertices.length}`);
    if (values.length !== 3) {
      fail(source, `vertex ${vertices.length} has ${values.length} values`);
    }
    vertices.push([values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]);
  }

  const faceStart = sectionStart(lines, "FACES", source);
  const triangles: Triangle[] = [];
  let fanTriangleCount = 0;
  let faces = 0;
  cursor = faceStart;
  while (faces < faceCount) {
    const line = lines[cursor];
    if (line === undefined || /^[A-Z]+/.test(line.trim())) {
      fail(source, `FACES ends after ${faces} of ${faceCount}`);
    }
    cursor += 1;
    if (line.trim().length === 0) continue;
    const values = numbers(line, source, `face ${faces}`);
    // r, g, b, nx, ny, nz, k, then k vertex indices.
    const k = values[6];
    if (k === undefined || !Number.isInteger(k) || k < 3) {
      fail(source, `face ${faces} has an invalid vertex count`);
    }
    if (values.length !== 7 + k) {
      fail(
        source,
        `face ${faces} declares ${k} vertices, has ${values.length - 7}`,
      );
    }
    const indices = values.slice(7);
    const corners = indices.map((index) => {
      const vertex = Number.isInteger(index) ? vertices[index] : undefined;
      if (vertex === undefined) {
        return fail(
          source,
          `face ${faces} names vertex ${index} of ${vertexCount}`,
        );
      }
      return vertex;
    });
    const first = corners[0] as Vec3;
    for (let i = 1; i + 1 < corners.length; i += 1) {
      fanTriangleCount += 1;
      const triangle: Triangle = [
        first,
        corners[i] as Vec3,
        corners[i + 1] as Vec3,
      ];
      if (!isDegenerate(triangle)) triangles.push(triangle);
    }
    faces += 1;
  }
  return { vertices, triangles, faceCount, fanTriangleCount };
}

function equal(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** `OOTriangleIsDegenerate` (`OOTriangle.h:66-69`): two equal vertices. */
function isDegenerate(triangle: Triangle): boolean {
  return (
    equal(triangle[0], triangle[1]) ||
    equal(triangle[1], triangle[2]) ||
    equal(triangle[2], triangle[0])
  );
}

/** Reads and parses one `.dat` file. */
export function readDat(path: string | URL): DatMesh {
  return parseDat(readFileSync(path, "utf8"), String(path));
}
