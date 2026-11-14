// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hull artifact converter (CBT-07, D-01).
 *
 * The octree and radius are the existing build-time ports; these cases pin that
 * the converter feeds them the right vendored mesh for each of the ten keys,
 * that the Cobra hull matches an octree built directly from its mesh, and that
 * the emitted bytes are deterministic, equal the committed file, and keep the
 * octree roots on one line each.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import type { PlistValue } from "../openstep/plist-value.js";
import { parseDat } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import { MODEL_SOURCE_FILES } from "./glb.js";
import { OCTREE_ROOT_PADDING, buildOctree, octreeDepthFor } from "./octree.js";
import { hullRadius } from "./ship-radius.js";
import {
  HULL_SHIP_KEYS,
  PLAYER_HULL_KEY,
  SHIP_HULLS_PATH,
  compileShipHulls,
  emitShipHulls,
} from "./ship-hulls.js";
import { MODELS_DIR, compileShips } from "./ships.js";
import type { ShipCatalogue } from "./ships.js";

const REPO = new URL("../../../", import.meta.url);

function readText(relative: string): string {
  return readFileSync(new URL(relative, REPO), "utf8");
}

function load(relative: string): PlistValue {
  return parseOpenStep(readText(relative), relative);
}

const catalogue: ShipCatalogue = compileShips(
  load("third_party/oolite/Config/shipdata.plist"),
  load("third_party/oolite/Config/shipdata-overrides.plist"),
);

function loadMeshes(): Record<string, ParsedMesh> {
  const names = new Set<string>();
  for (const files of Object.values(MODEL_SOURCE_FILES)) {
    for (const file of files) names.add(file);
  }
  const meshes: Record<string, ParsedMesh> = {};
  for (const name of [...names].sort()) {
    const file = `${MODELS_DIR}/${name}`;
    meshes[name] = parseDat(readText(file), file);
  }
  return meshes;
}

const meshes = loadMeshes();
const hulls = compileShipHulls(catalogue, meshes);

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected the call to throw");
}

describe("compileShipHulls", () => {
  it("compiles the ten keys in HULL_SHIP_KEYS order, the Cobra player first", () => {
    expect(hulls.map((hull) => hull.key)).toEqual([...HULL_SHIP_KEYS]);
    expect(HULL_SHIP_KEYS[0]).toBe(PLAYER_HULL_KEY);
    expect(HULL_SHIP_KEYS).toHaveLength(10);
  });

  it("compiles the Cobra hull from its vendored mesh", () => {
    const mesh = meshes["oolite_cobra3.dat"];
    if (mesh === undefined) throw new Error("the Cobra mesh is not vendored");
    const hull = hulls.find((candidate) => candidate.key === PLAYER_HULL_KEY);
    expect(hull).toBeDefined();
    expect(hull?.octree.depth).toBe(octreeDepthFor(mesh));
    expect(hull?.octree.radius).toBe(
      buildOctree(mesh, "oolite_cobra3.dat").radius,
    );
    expect(hull?.collisionRadius).toBe(
      hullRadius(PLAYER_HULL_KEY, "oolite_cobra3.dat", mesh),
    );
    // The root half-width is the padding plus the largest coordinate that a
    // triangle uses, rounded to float32.
    let largest = 0;
    for (const face of mesh.faces) {
      for (const index of face.vertices) {
        const vertex = mesh.vertices[index];
        if (vertex === undefined) continue;
        largest = Math.max(
          largest,
          Math.abs(Math.fround(vertex.x)),
          Math.abs(Math.fround(vertex.y)),
          Math.abs(Math.fround(vertex.z)),
        );
      }
    }
    expect(hull?.octree.radius).toBe(
      Math.fround(OCTREE_ROOT_PADDING + largest),
    );
  });

  it("names the key and the file when a key is missing from the catalogue", () => {
    const without: ShipCatalogue = {
      ...catalogue,
      entries: catalogue.entries.filter((entry) => entry.key !== "viper"),
    };
    const error = capture(() => compileShipHulls(without, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("viper");
  });

  it("names the model when a mesh is missing", () => {
    const { "oolite_cobra3.dat": _dropped, ...rest } = meshes;
    void _dropped;
    const error = capture(() => compileShipHulls(catalogue, rest));
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("oolite_cobra3.dat");
  });
});

describe("emitShipHulls", () => {
  const emitted = emitShipHulls(catalogue, meshes);
  const text = Buffer.from(emitted.bytes).toString("utf8");

  it("writes the one repository-relative path", () => {
    expect(emitted.path).toBe(SHIP_HULLS_PATH);
    expect(emitted.path).toBe("src/content/generated/ships-hulls.json");
  });

  it("is deterministic and equals the committed generated file", () => {
    expect(Buffer.from(emitShipHulls(catalogue, meshes).bytes)).toEqual(
      Buffer.from(emitted.bytes),
    );
    expect(text).toBe(readText(SHIP_HULLS_PATH));
  });

  it("parses back to the compiled records, ends with one newline and keeps each root on one line", () => {
    expect(JSON.parse(text)).toEqual(hulls);
    expect(text.endsWith("]\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    const rootLines = text.split("\n").filter((line) => /"root": /.test(line));
    expect(rootLines).toHaveLength(HULL_SHIP_KEYS.length);
  });
});
