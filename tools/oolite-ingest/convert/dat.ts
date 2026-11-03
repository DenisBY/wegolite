// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `.dat` mesh text → typed, validated in-memory geometry (DATA-03, DATA-04,
 * D-09, T-02-03, T-02-15).
 *
 * This module mirrors Oolite's own loader (`src/Core/OOMesh.m` at `7437f22`)
 * rather than inventing a dialect:
 *
 * - The separator rule is Oolite's: strip everything after `//` on each line,
 *   replace **every** `,` with a space, then split on whitespace. The Cobra uses
 *   tabs; the four Coriolis parts use commas. Both arrive as the same tokens.
 * - Sections appear in the order `NVERTS`, `NFACES`, `VERTEX`, `FACES`,
 *   `TEXTURES`, then optionally `NAMES`, `NORMALS` and `TANGENTS`, then `END`.
 * - A `FACES` line is `<smoothGroup r> <g> <b> <nx> <ny> <nz> <n_verts>
 *   <v0> <v1> <v2>`; a `TEXTURES` line is one line per face:
 *   `<materialKey> <max_x> <max_y> <s0> <t0> <s1> <t1> <s2> <t2>`.
 * - `n_verts > 3` warns and uses the first three (Oolite logs and sets `n_v = 3`);
 *   `n_verts < 3` is a hard failure. Real data is triangles only, so the
 *   truncation path is exercised by a fixture.
 * - Every stored normal is normalised at parse time, exactly as Oolite does.
 * - Declared counts above 200,000 are refused before a buffer is sized. The cap
 *   is a defensive bound, not an Oolite constant.
 *
 * Normal selection refines D-09's wording without changing its intent:
 * `explicit` (a `NORMALS` block exists) → `smooth` (`smooth = yes` from
 * shipdata) → `per-face` (the default). The Cobra carries a 1,548-line
 * `NORMALS` block and all-zero face normals, so treating it as per-face would
 * be markedly more faceted than Oolite.
 *
 * Winding repair runs for both legacy modes (`per-face` and `smooth`) and never
 * for `explicit`, mirroring `IsLegacyNormalMode` (`OOMesh.m:180-190`). It must
 * run before any axis conversion and before the smooth average. The sign test
 * is per component, as in Oolite — the source carries a `FIXME` acknowledging
 * it is not a dot product, and matching it is what keeps a future model
 * identical.
 */

import { contentError } from "../content-error.js";
import type { ContentError, ContentErrorOptions } from "../content-error.js";

/** A point or vector in Oolite's authored, +Z-forward frame. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One texture coordinate pair, normalised by the authored `max_x`/`max_y`. */
export type Vec2 = readonly [number, number];

/**
 * One triangle. `vertices` and `uv` are mutable because `repairWinding` swaps
 * the first and last corner of a face in place, exactly as Oolite does.
 */
export interface Face {
  smoothGroup: number;
  normal: Vec3;
  vertices: [number, number, number];
  uv: [Vec2, Vec2, Vec2];
  materialIndex: number;
}

/** One material slot in first-appearance order of the `TEXTURES` keys. */
export interface MeshMaterial {
  readonly index: number;
  readonly key: string;
  readonly name: string;
}

/** The parsed mesh: authored order preserved, nothing deduplicated. */
export interface ParsedMesh {
  readonly nverts: number;
  readonly nfaces: number;
  readonly vertices: Vec3[];
  readonly faces: Face[];
  readonly materials: MeshMaterial[];
  /** The `NORMALS` block, one per vertex, or `null` when absent. */
  readonly normals: Vec3[] | null;
  /** The `NAMES` lines, or `null` when absent. */
  readonly names: string[] | null;
  /**
   * Whether material names came from an authored `NAMES` block (matched
   * case-sensitively) rather than from `TEXTURES` filenames.
   */
  readonly caseSensitiveNames: boolean;
  /** Non-fatal findings: a four-vertex face truncated to three. */
  readonly warnings: string[];
}

/** The three normal modes, in Oolite's precedence order. */
export type NormalMode = "explicit" | "smooth" | "per-face";

export interface SelectNormalModeOptions {
  /** The `smooth` flag from the shipdata entry; plan 05 owns its coercion. */
  readonly smooth: boolean;
}

export interface MeshBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Defensive bound on a declared count; not an Oolite constant. */
export const MAX_MESH_COUNT = 200_000;

/** Relative tolerance when comparing a measured extent to the recorded one. */
const BOUNDS_TOLERANCE = 1e-3;

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const PLUS_Z: Vec3 = { x: 0, y: 0, z: 1 };

/**
 * Measured axis-aligned extents (span, not max) of the five pinned models, keyed
 * by filename. Every value is the authored geometry, before the axis conversion.
 */
export const MODEL_BOUNDS: Readonly<Record<string, Vec3>> = {
  "oolite_cobra3.dat": { x: 130, y: 34.9649, z: 81.3726 },
  "oolite_coriolis.dat": { x: 1000, y: 1000, z: 995.918 },
  "oolite_coriolis_dock.dat": { x: 103.4123, y: 241.888, z: 250 },
  "oolite_coriolis_faceplate.dat": { x: 1000, y: 1000, z: 41.369 },
  "oolite_coriolis_tris.dat": { x: 1000, y: 1000, z: 995.918 },
};

interface Token {
  readonly text: string;
  readonly line: number;
}

function datFailure(
  file: string,
  construct: string,
  line: number | undefined,
  excerpt: string,
): ContentError {
  const options: ContentErrorOptions =
    line === undefined ? { excerpt } : { line, excerpt };
  return contentError("DAT_MESH", file, construct, options);
}

/**
 * Oolite's preprocess: `//` comments removed, every comma replaced by a space,
 * then whitespace tokenisation. Tokens keep their 1-based source line so every
 * failure can name its position.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? "";
    const comment = raw.indexOf("//");
    const withoutComment = comment === -1 ? raw : raw.slice(0, comment);
    const spaced = withoutComment.split(",").join(" ");
    for (const text of spaced.split(/\s+/)) {
      if (text.length > 0) tokens.push({ text, line: index + 1 });
    }
  }
  return tokens;
}

class Scanner {
  private cursor = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly file: string,
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.cursor];
  }

  next(construct: string): Token {
    const token = this.tokens[this.cursor];
    if (token === undefined) {
      throw datFailure(
        this.file,
        construct,
        undefined,
        `unexpected end of file while reading ${construct}`,
      );
    }
    this.cursor += 1;
    return token;
  }

  expectKeyword(keyword: string): void {
    const token = this.next(keyword);
    if (token.text !== keyword) {
      throw datFailure(
        this.file,
        keyword,
        token.line,
        `expected "${keyword}", found "${token.text}"`,
      );
    }
  }

  peekKeyword(keyword: string): boolean {
    return this.peek()?.text === keyword;
  }

  integer(construct: string): {
    readonly value: number;
    readonly line: number;
  } {
    const token = this.next(construct);
    const value = Number(token.text);
    if (!Number.isSafeInteger(value)) {
      throw datFailure(
        this.file,
        construct,
        token.line,
        `expected an integer, found "${token.text}"`,
      );
    }
    return { value, line: token.line };
  }

  number(construct: string): number {
    const token = this.next(construct);
    const value = Number(token.text);
    if (!Number.isFinite(value)) {
      throw datFailure(
        this.file,
        construct,
        token.line,
        `value is not finite: "${token.text}"`,
      );
    }
    return value;
  }

  /** The remaining tokens on the current line, joined by single spaces. */
  lineText(construct: string): string {
    const first = this.next(construct);
    const parts = [first.text];
    let token = this.peek();
    while (token !== undefined && token.line === first.line) {
      parts.push(token.text);
      this.cursor += 1;
      token = this.peek();
    }
    return parts.join(" ");
  }
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normaliseOr(vector: Vec3, fallback: Vec3): Vec3 {
  // `Math.sqrt`, never `Math.hypot`: the former is a plain IEEE operation and
  // reproduces byte-for-byte across architectures.
  const length = Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z,
  );
  if (length === 0) return fallback;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function isZeroVector(vector: Vec3): boolean {
  return vector.x === 0 && vector.y === 0 && vector.z === 0;
}

/**
 * `normal_to_surface(v2, v1, v0)`, normalised: `-normalize(cross(v1-v0,
 * v2-v0))`. Oolite uses the unnormalised cross product, but only ever reads its
 * sign (and stores its negation as a face normal), so the normalised form is
 * both equivalent for the test and a valid unit normal for the result.
 */
function calculatedNormal(v0: Vec3, v1: Vec3, v2: Vec3): Vec3 {
  const surface = cross(subtract(v1, v0), subtract(v2, v0));
  return normaliseOr({ x: -surface.x, y: -surface.y, z: -surface.z }, ZERO);
}

function flip(vector: Vec3): Vec3 {
  return { x: -vector.x, y: -vector.y, z: -vector.z };
}

function vertexAt(mesh: ParsedMesh, index: number, faceIndex: number): Vec3 {
  const vertex = mesh.vertices[index];
  if (vertex === undefined) {
    throw datFailure(
      "mesh",
      `FACES face ${String(faceIndex)}`,
      undefined,
      `vertex index ${String(index)} is out of range`,
    );
  }
  return vertex;
}

/** Twice the triangle area; Oolite uses the unhalved magnitude as the weight. */
function triangleArea(v0: Vec3, v1: Vec3, v2: Vec3): number {
  const area = cross(subtract(v1, v0), subtract(v2, v0));
  return Math.sqrt(area.x * area.x + area.y * area.y + area.z * area.z);
}

/**
 * Parse one `.dat` file. `file` is the repository-relative label used by every
 * `DAT_MESH` error.
 */
export function parseDat(source: string, file: string): ParsedMesh {
  const scanner = new Scanner(tokenize(source), file);
  const warnings: string[] = [];

  scanner.expectKeyword("NVERTS");
  const nverts = scanner.integer("NVERTS").value;
  if (nverts < 0 || nverts > MAX_MESH_COUNT) {
    throw datFailure(
      file,
      "NVERTS",
      undefined,
      `declared ${String(nverts)} vertices, outside 0..${String(MAX_MESH_COUNT)}`,
    );
  }

  scanner.expectKeyword("NFACES");
  const nfaces = scanner.integer("NFACES").value;
  if (nfaces < 0 || nfaces > MAX_MESH_COUNT) {
    throw datFailure(
      file,
      "NFACES",
      undefined,
      `declared ${String(nfaces)} faces, outside 0..${String(MAX_MESH_COUNT)}`,
    );
  }

  scanner.expectKeyword("VERTEX");
  const vertices: Vec3[] = [];
  for (let index = 0; index < nverts; index++) {
    const construct = `VERTEX vertex ${String(index)}`;
    vertices.push({
      x: scanner.number(construct),
      y: scanner.number(construct),
      z: scanner.number(construct),
    });
  }

  scanner.expectKeyword("FACES");
  const faces: Face[] = [];
  const declaredCounts: number[] = [];
  for (let index = 0; index < nfaces; index++) {
    const construct = `FACES face ${String(index)}`;
    const smoothGroup = scanner.integer(construct).value;
    // Colour components g/b are read and discarded; only r (the smooth group)
    // is semantically load-bearing.
    scanner.number(construct);
    scanner.number(construct);
    const normal = normaliseOr(
      {
        x: scanner.number(construct),
        y: scanner.number(construct),
        z: scanner.number(construct),
      },
      ZERO,
    );
    const declared = scanner.integer(construct).value;
    if (declared < 3) {
      throw datFailure(
        file,
        construct,
        undefined,
        `face ${String(index)} has fewer than three vertices (${String(declared)})`,
      );
    }
    if (declared > 3) {
      warnings.push(
        `${construct}: ${String(declared)} vertices declared; only the first three will be used`,
      );
    }
    const corners: [number, number, number] = [0, 0, 0];
    for (let corner = 0; corner < declared; corner++) {
      const vertex = scanner.integer(
        `${construct} index ${String(corner)}`,
      ).value;
      if (vertex < 0 || vertex >= nverts) {
        throw datFailure(
          file,
          construct,
          undefined,
          `vertex index ${String(vertex)} is outside 0..${String(nverts - 1)}`,
        );
      }
      if (corner < 3) corners[corner] = vertex;
    }
    declaredCounts.push(declared);
    faces.push({
      smoothGroup,
      normal,
      vertices: corners,
      uv: [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      materialIndex: 0,
    });
  }

  scanner.expectKeyword("TEXTURES");
  const materialKeys: string[] = [];
  const materialIndexes = new Map<string, number>();
  for (let index = 0; index < nfaces; index++) {
    const construct = `TEXTURES face ${String(index)}`;
    const key = scanner.next(construct).text;
    const maxX = scanner.number(construct);
    const maxY = scanner.number(construct);
    if (maxX === 0 || maxY === 0) {
      throw datFailure(
        file,
        construct,
        undefined,
        `texture size ${String(maxX)} x ${String(maxY)} would divide by zero`,
      );
    }
    const declared = declaredCounts[index] ?? 3;
    // Real files are triangles with exactly three pairs. A wider authored face
    // carries one pair per declared corner; the extras are consumed (and
    // ignored) so the END section is still found.
    const pairs = Math.max(3, declared);
    const face = faces[index];
    if (face === undefined) {
      throw datFailure(file, construct, undefined, "face is missing");
    }
    const uv: [Vec2, Vec2, Vec2] = [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    for (let corner = 0; corner < pairs; corner++) {
      const s = scanner.number(construct);
      const t = scanner.number(construct);
      if (corner < 3) uv[corner] = [s / maxX, t / maxY];
    }
    face.uv = uv;

    const existing = materialIndexes.get(key);
    if (existing === undefined) {
      const assigned = materialKeys.length;
      materialIndexes.set(key, assigned);
      materialKeys.push(key);
      face.materialIndex = assigned;
    } else {
      face.materialIndex = existing;
    }
  }

  let names: string[] | null = null;
  if (scanner.peekKeyword("NAMES")) {
    scanner.expectKeyword("NAMES");
    const count = scanner.integer("NAMES").value;
    const parsed: string[] = [];
    for (let index = 0; index < count; index++) {
      parsed.push(scanner.lineText(`NAMES name ${String(index)}`));
    }
    names = parsed;
  }

  let normals: Vec3[] | null = null;
  if (scanner.peekKeyword("NORMALS")) {
    scanner.expectKeyword("NORMALS");
    const parsed: Vec3[] = [];
    for (let index = 0; index < nverts; index++) {
      const construct = `NORMALS vertex ${String(index)}`;
      parsed.push(
        normaliseOr(
          {
            x: scanner.number(construct),
            y: scanner.number(construct),
            z: scanner.number(construct),
          },
          ZERO,
        ),
      );
    }
    normals = parsed;
  }

  // TANGENTS is accepted and ignored: none of the five pinned models has one,
  // but the grammar allows it after NORMALS.
  if (scanner.peekKeyword("TANGENTS")) {
    scanner.expectKeyword("TANGENTS");
    for (let index = 0; index < nverts * 3; index++) {
      scanner.number(`TANGENTS vertex ${String(index)}`);
    }
  }

  scanner.expectKeyword("END");
  const trailing = scanner.peek();
  if (trailing !== undefined) {
    throw datFailure(
      file,
      "END",
      trailing.line,
      `unexpected data after END: "${trailing.text}"`,
    );
  }

  const materials: MeshMaterial[] = materialKeys.map((key, index) => ({
    index,
    key,
    name: names?.[index] ?? key,
  }));

  return {
    nverts,
    nfaces,
    vertices,
    faces,
    materials,
    normals,
    names,
    caseSensitiveNames: names !== null,
    warnings,
  };
}

/** The material slot of a face. */
export function materialName(mesh: ParsedMesh, face: Face): string {
  const material = mesh.materials[face.materialIndex];
  if (material === undefined) {
    throw datFailure(
      "mesh",
      "TEXTURES",
      undefined,
      `face references material ${String(face.materialIndex)}`,
    );
  }
  return material.name;
}

/** `explicit` when a NORMALS block exists, else `smooth`/`per-face` by flag. */
export function selectNormalMode(
  mesh: ParsedMesh,
  options: SelectNormalModeOptions,
): NormalMode {
  if (mesh.normals !== null) return "explicit";
  return options.smooth ? "smooth" : "per-face";
}

/**
 * Oolite's winding repair, run for both legacy modes only.
 *
 * Per face: `calc = normal_to_surface(v2, v1, v0)`. A zero stored normal is
 * replaced by `vector_flip(calc)` *before* the sign test (`OOMesh.m:1504-1508`),
 * so a zero-normal face also gets its winding reversed. When any component of
 * the stored normal disagrees in sign with `calc`, the first and last corner —
 * **and their UV pairs together** — are swapped (`OOMesh.m:1514-1528`).
 *
 * Returns the number of faces whose winding was swapped.
 */
export function repairWinding(mesh: ParsedMesh, mode: NormalMode): number {
  if (mode === "explicit") return 0;

  let swaps = 0;
  for (let index = 0; index < mesh.faces.length; index++) {
    const face = mesh.faces[index];
    if (face === undefined) continue;

    const first = face.vertices[0];
    const second = face.vertices[1];
    const third = face.vertices[2];
    const v0 = vertexAt(mesh, first, index);
    const v1 = vertexAt(mesh, second, index);
    const v2 = vertexAt(mesh, third, index);
    const calculated = calculatedNormal(v0, v1, v2);

    if (isZeroVector(face.normal)) {
      face.normal = flip(calculated);
    }
    const stored = face.normal;

    // Per-component sign test, not a dot product: Oolite carries a FIXME saying
    // it should become one, and a future model must behave identically.
    if (
      stored.x * calculated.x < 0 ||
      stored.y * calculated.y < 0 ||
      stored.z * calculated.z < 0
    ) {
      const swapped: [number, number, number] = [third, second, first];
      const swappedUv: [Vec2, Vec2, Vec2] = [
        face.uv[2],
        face.uv[1],
        face.uv[0],
      ];
      face.vertices = swapped;
      face.uv = swappedUv;
      swaps += 1;
    }
  }
  return swaps;
}

/** Area-weighted mean of a vertex's faces, optionally restricted to a group. */
function areaWeightedNormal(
  mesh: ParsedMesh,
  vertexIndex: number,
  smoothGroup: number | null,
): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const face of mesh.faces) {
    if (smoothGroup !== null && face.smoothGroup !== smoothGroup) continue;
    if (!face.vertices.includes(vertexIndex)) continue;
    const v0 = mesh.vertices[face.vertices[0]];
    const v1 = mesh.vertices[face.vertices[1]];
    const v2 = mesh.vertices[face.vertices[2]];
    if (v0 === undefined || v1 === undefined || v2 === undefined) continue;
    const area = triangleArea(v0, v1, v2);
    x += face.normal.x * area;
    y += face.normal.y * area;
    z += face.normal.z * area;
  }
  return normaliseOr({ x, y, z }, PLUS_Z);
}

/** Per-vertex smooth normals, weighted by twice the triangle area. */
function smoothVertexNormals(mesh: ParsedMesh): Vec3[] {
  const sums: { x: number; y: number; z: number }[] = mesh.vertices.map(() => ({
    x: 0,
    y: 0,
    z: 0,
  }));
  for (const face of mesh.faces) {
    const v0 = mesh.vertices[face.vertices[0]];
    const v1 = mesh.vertices[face.vertices[1]];
    const v2 = mesh.vertices[face.vertices[2]];
    if (v0 === undefined || v1 === undefined || v2 === undefined) continue;
    const area = triangleArea(v0, v1, v2);
    for (const vertexIndex of face.vertices) {
      const sum = sums[vertexIndex];
      if (sum === undefined) continue;
      sum.x += face.normal.x * area;
      sum.y += face.normal.y * area;
      sum.z += face.normal.z * area;
    }
  }
  return sums.map((sum) => normaliseOr(sum, PLUS_Z));
}

/** Vertices touched by faces of more than one smooth group. */
function edgeVertices(mesh: ParsedMesh): boolean[] {
  const group: number[] = mesh.vertices.map(() => -1);
  const edge: boolean[] = mesh.vertices.map(() => false);
  for (const face of mesh.faces) {
    for (const vertexIndex of face.vertices) {
      const assigned = group[vertexIndex];
      if (assigned === undefined) continue;
      if (assigned < 0) {
        group[vertexIndex] = face.smoothGroup;
      } else if (assigned !== face.smoothGroup) {
        edge[vertexIndex] = true;
      }
    }
  }
  return edge;
}

/**
 * One normal per face corner, in the selected mode.
 *
 * `explicit` reads the authored per-vertex block; `smooth` uses the
 * area-weighted mean over all faces containing the vertex; `per-face` uses the
 * repaired face normal. Both per-vertex modes take Oolite's edge-vertex
 * override: a vertex touched by faces of different smooth groups is averaged
 * only over faces in the corner's own group.
 */
export function resolveCornerNormals(
  mesh: ParsedMesh,
  mode: NormalMode,
): Vec3[][] {
  if (mode === "per-face") {
    return mesh.faces.map((face) => [face.normal, face.normal, face.normal]);
  }

  const edge = edgeVertices(mesh);
  const smooth = mode === "smooth" ? smoothVertexNormals(mesh) : [];

  return mesh.faces.map((face) => {
    const corners: Vec3[] = [];
    for (const vertexIndex of face.vertices) {
      let normal: Vec3;
      if (edge[vertexIndex] === true) {
        normal = areaWeightedNormal(mesh, vertexIndex, face.smoothGroup);
      } else if (mode === "smooth") {
        normal = smooth[vertexIndex] ?? PLUS_Z;
      } else {
        normal = mesh.normals?.[vertexIndex] ?? ZERO;
      }
      corners.push(normal);
    }
    return corners;
  });
}

/** Axis-aligned bounds in the authored frame. */
export function boundingBox(mesh: ParsedMesh): MeshBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const vertex of mesh.vertices) {
    if (vertex.x < minX) minX = vertex.x;
    if (vertex.y < minY) minY = vertex.y;
    if (vertex.z < minZ) minZ = vertex.z;
    if (vertex.x > maxX) maxX = vertex.x;
    if (vertex.y > maxY) maxY = vertex.y;
    if (vertex.z > maxZ) maxZ = vertex.z;
  }
  if (!Number.isFinite(minX)) {
    return { min: ZERO, max: ZERO };
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

/**
 * Assert the measured extents equal `expected` within `1e-3` relative per axis.
 * A mismatch is `MESH_BOUNDS` naming the file and the offending axis.
 */
export function assertBounds(
  mesh: ParsedMesh,
  expected: Vec3,
  file: string,
): void {
  const bounds = boundingBox(mesh);
  const measured: Vec3 = {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
  const axes = [
    ["x", measured.x, expected.x],
    ["y", measured.y, expected.y],
    ["z", measured.z, expected.z],
  ] as const;
  for (const [axis, actual, want] of axes) {
    const allowed = BOUNDS_TOLERANCE * Math.max(1, Math.abs(want));
    if (Math.abs(actual - want) > allowed) {
      throw contentError("MESH_BOUNDS", file, `bounding box ${axis}`, {
        excerpt: `expected ${String(want)}, measured ${String(actual)}`,
      });
    }
  }
}

/** The recorded extents for a snapshot filename, or a named failure. */
export function modelBounds(filename: string): Vec3 {
  const expected = MODEL_BOUNDS[filename];
  if (expected === undefined) {
    throw datFailure(
      "Models",
      filename,
      undefined,
      `no recorded bounding box for "${filename}"`,
    );
  }
  return expected;
}
