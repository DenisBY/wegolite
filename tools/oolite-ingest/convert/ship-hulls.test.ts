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
import { NPC_SHIP_KEYS } from "./npc-ships.js";
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

/** The distinct models among the hull keys, as the catalogue resolves them. */
function distinctModels(): Set<string> {
  const models = new Set<string>();
  for (const key of HULL_SHIP_KEYS) {
    const model = catalogue.entries.find((entry) => entry.key === key)?.model;
    if (model === undefined || model === null) {
      throw new Error(`${key} has no model`);
    }
    models.add(model);
  }
  return models;
}

/**
 * A synthetic catalogue over the real Cobra mesh: each `[key, model]` is a copy
 * of the player entry under that key and model, and every model name maps to the
 * Cobra mesh, so the grouping is the only thing the cases vary.
 */
function synthetic(rows: readonly (readonly [string, string])[]): {
  catalogue: ShipCatalogue;
  meshes: Record<string, ParsedMesh>;
} {
  const player = catalogue.entries.find(
    (entry) => entry.key === PLAYER_HULL_KEY,
  );
  const mesh = meshes["oolite_cobra3.dat"];
  if (player === undefined || mesh === undefined) {
    throw new Error("the Cobra player entry or mesh is missing");
  }
  const models: Record<string, ParsedMesh> = {};
  for (const [, model] of rows) models[model] = mesh;
  return {
    catalogue: {
      ...catalogue,
      entries: rows.map(([key, model]) => ({ ...player, key, model })),
    },
    meshes: models,
  };
}

describe("compileShipHulls", () => {
  it("compiles one entry per model in HULL_SHIP_KEYS order, the Cobra player first", () => {
    const aliased = new Set(hulls.flatMap((hull) => hull.aliases ?? []));
    expect(hulls.map((hull) => hull.key)).toEqual(
      HULL_SHIP_KEYS.filter((key) => !aliased.has(key)),
    );
    expect(HULL_SHIP_KEYS[0]).toBe(PLAYER_HULL_KEY);
  });

  it("shares each octree per model: 19 entries for the 30 keys, the Cobra family on the player's entry (DATA-18)", () => {
    expect(HULL_SHIP_KEYS).toHaveLength(30);
    expect(hulls).toHaveLength(19);
    expect(distinctModels().size).toBe(19);
    expect(hulls[0]?.key).toBe(PLAYER_HULL_KEY);
    expect(hulls[0]?.aliases).toEqual([
      "cobra3-alternate",
      "cobra3-pirate",
      "cobra3-trader",
    ]);
    // The other multi-key groups, by model.
    const groups = Object.fromEntries(
      hulls
        .filter((hull) => hull.aliases !== undefined)
        .map((hull) => [hull.key, hull.aliases]),
    );
    expect(groups).toEqual({
      [PLAYER_HULL_KEY]: ["cobra3-alternate", "cobra3-pirate", "cobra3-trader"],
      anaconda: ["anaconda-pirate"],
      boa: ["boa-pirate"],
      "boa-mk2": ["boa-mk2-pirate"],
      cobramk1: ["cobramk1-alt"],
      mamba: ["mamba-escort"],
      moray: ["morayMED"],
      python: ["python-blackdog"],
      viper: ["viper-pursuit"],
    });
  });

  it("derives the key count and the entry count from the catalogue (ten of each today)", () => {
    // Plan 21-04: the roster grows in plan 21-08 without editing these counts.
    expect(HULL_SHIP_KEYS).toHaveLength(1 + NPC_SHIP_KEYS.length);
    expect(hulls).toHaveLength(distinctModels().size);
    expect(HULL_SHIP_KEYS.length).toBeGreaterThan(0);
  });

  it("writes no aliases key on a group of one, and covers every key through entries plus aliases", () => {
    // An aliases key never holds an empty list: it is absent for a group of one.
    for (const hull of hulls) {
      if ("aliases" in hull) expect(hull.aliases?.length).toBeGreaterThan(0);
    }
    const covered = hulls.flatMap((hull) => [
      hull.key,
      ...(hull.aliases ?? []),
    ]);
    expect(new Set(covered)).toEqual(new Set(HULL_SHIP_KEYS));
    expect(covered).toHaveLength(HULL_SHIP_KEYS.length);
  });

  it("groups keys that share a model into one entry with sorted aliases", () => {
    const { catalogue: fake, meshes: fakeMeshes } = synthetic([
      ["a-two", "oolite_a.dat"],
      ["b", "oolite_b.dat"],
      ["a-one", "oolite_a.dat"],
    ]);
    const grouped = compileShipHulls(fake, fakeMeshes, ["a-two", "b", "a-one"]);
    // The group's entry key is its first key in code-unit order, at the
    // position of that key in the key list.
    expect(grouped.map((hull) => hull.key)).toEqual(["b", "a-one"]);
    const [b, aOne] = grouped;
    expect(aOne?.aliases).toEqual(["a-two"]);
    expect(b !== undefined && "aliases" in b).toBe(false);
    expect(aOne?.octree).toEqual(b?.octree);
  });

  it("keeps the player key as the entry key when another key shares the Cobra model", () => {
    const { catalogue: fake, meshes: fakeMeshes } = synthetic([
      ["a-cobra", "oolite_cobra3.dat"],
      [PLAYER_HULL_KEY, "oolite_cobra3.dat"],
      ["zz-cobra", "oolite_cobra3.dat"],
    ]);
    const grouped = compileShipHulls(fake, fakeMeshes, [
      PLAYER_HULL_KEY,
      "a-cobra",
      "zz-cobra",
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.key).toBe(PLAYER_HULL_KEY);
    expect(grouped[0]?.aliases).toEqual(["a-cobra", "zz-cobra"]);
  });

  it("fails with a SCHEMA error when a key repeats in the list, so it would repeat as an alias", () => {
    const { catalogue: fake, meshes: fakeMeshes } = synthetic([
      ["a-one", "oolite_a.dat"],
    ]);
    const error = capture(() =>
      compileShipHulls(fake, fakeMeshes, ["a-one", "a-one"]),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("a-one");
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
    expect(rootLines).toHaveLength(hulls.length);
  });

  it("writes an aliases array only for an entry that has aliases, ahead of its other keys", () => {
    expect(text.includes('"aliases"')).toBe(
      hulls.some((hull) => hull.aliases !== undefined),
    );
    const { catalogue: fake, meshes: fakeMeshes } = synthetic([
      ["a-one", "oolite_a.dat"],
      ["a-two", "oolite_a.dat"],
    ]);
    const shared = Buffer.from(
      emitShipHulls(fake, fakeMeshes, ["a-one", "a-two"]).bytes,
    ).toString("utf8");
    expect(shared).toContain('    "aliases": [\n      "a-two"\n    ],\n');
    expect(JSON.parse(shared)).toEqual(
      compileShipHulls(fake, fakeMeshes, ["a-one", "a-two"]),
    );
  });
});
