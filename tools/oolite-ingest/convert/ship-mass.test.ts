// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's ship mass pinned against the vendored snapshot (DATA-11, D-01, D-02,
 * T-10-03, T-10-04).
 *
 * What "reproduce Oolite's mass" (roadmap success criterion 2) means in this
 * project: no Oolite runtime exists on this machine, so the masses cannot be read
 * back from a running game. They are Oolite's algorithm run on the pinned
 * meshes, with three layers of evidence:
 *
 * 1. golden values, bit-exact float32, one per mesh and per composite ship;
 * 2. the Cobra Mk III, Viper and Coriolis worked examples re-derived
 *    independently in float64 from the terminal-node counts and the mesh radius,
 *    within a relative 1e-6 (the measured float32 versus float64 gap is at most
 *    2.03e-7);
 * 3. the community VariableMasslock table
 *    (https://wiki.alioth.net/index.php/VariableMasslock), nine hull masses to
 *    the whole tonne.
 *
 * The Coriolis and navigation-buoy composites are code-derived: the only external
 * cross-check is the nine-ship table. The two constants in the Oolite source
 * comments, 455,223,200 (`ShipEntity.m:12504`) and 185,580
 * (`PlayerEntity.m:191-192`), predate the current meshes and are not reproduced.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { CatalogEntry } from "../../../src/content/schemas/ship.js";
import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import type { PlistValue } from "../openstep/plist-value.js";
import { parseDat } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import { MODEL_SOURCE_FILES } from "./glb.js";
import { NPC_SHIP_KEYS } from "./npc-ships.js";
import { STATION_BUILDS, STATION_MODEL_FILES } from "./stations.js";
import { buildOctree, octreeDepthFor } from "./octree.js";
import type { OctreeNode } from "./octree.js";
import { computeShipMasses, hullMass, shipMass } from "./ship-mass.js";
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

/** Every vendored model, parsed once: the union of `MODEL_SOURCE_FILES`. */
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

/**
 * The station meshes vendored for mass and collision radius only (Phase 22.1):
 * kept apart from `meshes` so the 32-mesh table below keeps pinning the GLB
 * sources.
 */
function loadStationMeshes(): Record<string, ParsedMesh> {
  const loaded: Record<string, ParsedMesh> = {};
  for (const name of STATION_MODEL_FILES) {
    const file = `${MODELS_DIR}/${name}`;
    loaded[name] = parseDat(readText(file), file);
  }
  return loaded;
}

const stationMeshes = { ...meshes, ...loadStationMeshes() };

function mesh(name: string): ParsedMesh {
  const found = meshes[name];
  if (found === undefined) throw new Error(`mesh "${name}" is not loaded`);
  return found;
}

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a ContentError, but no error was thrown");
}

/** A copy of the catalogue with one entry replaced; the shared one is never mutated. */
function withEntry(
  key: string,
  patch: (entry: CatalogEntry) => CatalogEntry,
): ShipCatalogue {
  return {
    ...catalogue,
    entries: catalogue.entries.map((entry) =>
      entry.key === key ? patch(entry) : entry,
    ),
  };
}

/** The hull masses of the 32 vendored meshes, density 1, float32. */
const HULL_MASSES: Readonly<Record<string, number>> = {
  "oolite_adder.dat": 16045.4931640625,
  "oolite_alloy.dat": 273.4375,
  "oolite_anaconda.dat": 437686.875,
  "oolite_asp.dat": 75881.5625,
  "oolite_barrel.dat": 993.3700561523438,
  "oolite_boa-mk2.dat": 215810.5,
  "oolite_boa.dat": 181788.90625,
  "oolite_buoy.dat": 691044.375,
  "oolite_buoy_subents.dat": 7646.7861328125,
  "oolite_cobra3.dat": 214737.6875,
  "oolite_cobramk1.dat": 52291.8359375,
  "oolite_coriolis.dat": 228650880,
  "oolite_coriolis_dock.dat": 7579321,
  "oolite_coriolis_faceplate.dat": 58255096,
  "oolite_coriolis_tris.dat": 220998576,
  "oolite_ferdelance.dat": 53256.72265625,
  "oolite_gecko.dat": 24669.99609375,
  "oolite_krait.dat": 93291.40625,
  "oolite_mamba.dat": 35806.9921875,
  "oolite_moray.dat": 51203.4375,
  "oolite_python.dat": 266518.46875,
  "oolite_python_trader.dat": 259688.28125,
  "oolite_shuttle.dat": 11317.5634765625,
  "oolite_sidewinder.dat": 25087.62109375,
  "oolite_sidewinder_escort.dat": 24966.326171875,
  "oolite_viper.dat": 34040.6796875,
  "oolite_viper_interceptor.dat": 35218.2734375,
  "wreck1.dat": 3979.17236328125,
  "wreck2.dat": 5793.83251953125,
  "wreck3.dat": 2678.518310546875,
  "wreck4.dat": 4352.720703125,
  "wreck5.dat": 6317.5546875,
};

const DEPTH_SIX = new Set([
  "oolite_coriolis.dat",
  "oolite_coriolis_faceplate.dat",
  "oolite_coriolis_tris.dat",
]);

/** The small debris hulls, whose span puts them one level shallower. */
const DEPTH_FOUR = new Set(["oolite_alloy.dat", "oolite_barrel.dat"]);

const COBRA_PLAYER = "oolite_template_cobra3-player";

describe("the 32 vendored meshes", () => {
  it("are exactly the meshes the table pins", () => {
    expect(Object.keys(meshes).sort()).toEqual(Object.keys(HULL_MASSES).sort());
  });

  it.each(Object.entries(HULL_MASSES))(
    "%s has the float32 hull mass %s",
    (name, expected) => {
      expect(hullMass(mesh(name), 1, `${MODELS_DIR}/${name}`)).toBe(expected);
    },
  );

  it.each(Object.keys(HULL_MASSES))("%s has the adaptive depth", (name) => {
    expect(octreeDepthFor(mesh(name))).toBe(
      DEPTH_SIX.has(name) ? 6 : DEPTH_FOUR.has(name) ? 4 : 5,
    );
  });
});

describe("the station masses (Phase 22.1, ShipEntity.m:417-419, 2034-2041)", () => {
  const FIXTURE = JSON.parse(
    readText("tests/fixtures/oolite-reference/stations.json"),
  ) as { stations: Record<string, { mass: string }> };
  const hull = (name: string): number => {
    const found = stationMeshes[name];
    if (found === undefined) throw new Error(`mesh "${name}" is not loaded`);
    return hullMass(found, 1, `${MODELS_DIR}/${name}`);
  };

  it.each(STATION_BUILDS.map((build) => [build.shipKey, build] as const))(
    "%s is the hull plus every solid subentity and the dock, flashers excluded",
    (key, build) => {
      const mass = shipMass(key, catalogue, stationMeshes);
      // Hull first, then every solid subentity and the dock. A float32 running
      // sum is order sensitive in its last bits, so the exact value is the
      // measured one and the independent sum is compared to 1e-6.
      let expected = hull(build.mainModel);
      for (const name of [...build.solidModels, build.dockModel]) {
        expected = Math.fround(expected + hull(name));
      }
      expect(mass).toBeGreaterThan(hull(build.mainModel));
      expect(String(mass)).toBe(FIXTURE.stations[key]?.mass);
      expect(Math.abs(mass - expected) / mass).toBeLessThan(1e-6);
    },
  );
});

describe("shipMass composition (ShipEntity.m:417-419, 2034-2041)", () => {
  it("adds the three solid subentities to the Coriolis hull", () => {
    // Hull + faceplate + tris + dock as a float32 running sum; the fourteen
    // flashers add nothing.
    expect(shipMass("coriolis-station", catalogue, meshes)).toBe(515483904);
  });

  it("adds the core subentity to each navigation buoy", () => {
    expect(shipMass("buoy", catalogue, meshes)).toBe(698691.1875);
    expect(shipMass("buoy-witchpoint", catalogue, meshes)).toBe(698691.1875);
  });

  it("equals the hull row for the player Cobra Mk III", () => {
    expect(shipMass(COBRA_PLAYER, catalogue, meshes)).toBe(214737.6875);
  });

  it.each([...NPC_SHIP_KEYS])(
    "equals the hull row of its model for %s",
    (key) => {
      const entry = catalogue.entries.find(
        (candidate) => candidate.key === key,
      );
      if (entry?.model == null) throw new Error(`"${key}" has no model`);
      expect(shipMass(key, catalogue, meshes)).toBe(HULL_MASSES[entry.model]);
    },
  );

  it("returns a map of exactly the requested keys", () => {
    const keys = ["coriolis-station", "buoy", COBRA_PLAYER, "viper"];
    const masses = computeShipMasses(keys, catalogue, meshes);
    expect([...masses.keys()]).toEqual(keys);
    for (const key of keys) {
      expect(masses.get(key)).toBe(shipMass(key, catalogue, meshes));
    }
    // A repeated key is computed once and keeps its place.
    const repeated = computeShipMasses(["viper", "viper"], catalogue, meshes);
    expect([...repeated.keys()]).toEqual(["viper"]);
  });
});

/**
 * Worked examples, independent of `octreeVolume`: count the nodes the
 * five-level volume treats as full (`Octree.m:634-681`: a solid node at any
 * level up to five, or any non-empty node at level five) and sum their cubes in
 * float64. Level L has half-width radius / 2^L.
 */
function terminalCounts(root: OctreeNode): Map<number, number> {
  const counts = new Map<number, number>();
  const walk = (node: OctreeNode, level: number): void => {
    if (node === 0) return;
    if (node === -1 || level === 5) {
      counts.set(level, (counts.get(level) ?? 0) + 1);
      return;
    }
    for (const child of node) walk(child, level + 1);
  };
  walk(root, 0);
  return counts;
}

/**
 * The root half-width in float64: `0.5f + MaxDimensionFromOrigin`
 * (`OOMeshToOctreeConverter.m:263, 272-287`) over the vertices of the
 * non-degenerate faces, each vertex held as float32 (`OOMesh.m:1225`).
 */
function float64Radius(source: ParsedMesh): number {
  let largest = 0;
  for (const face of source.faces) {
    const corners = face.vertices.map((index) => {
      const vertex = source.vertices[index];
      if (vertex === undefined) throw new Error("face names a missing vertex");
      return [
        Math.fround(vertex.x),
        Math.fround(vertex.y),
        Math.fround(vertex.z),
      ] as const;
    });
    const same = (a: number, b: number): boolean =>
      corners[a]?.[0] === corners[b]?.[0] &&
      corners[a]?.[1] === corners[b]?.[1] &&
      corners[a]?.[2] === corners[b]?.[2];
    if (same(0, 1) || same(1, 2) || same(2, 0)) continue;
    for (const corner of corners) {
      for (const value of corner) largest = Math.max(largest, Math.abs(value));
    }
  }
  return 0.5 + largest;
}

/** 20 x the sum of count x (radius / 2^level)^3, in float64, cubes as products. */
function float64Mass(
  counts: ReadonlyMap<number, number>,
  radius: number,
): number {
  let volume = 0;
  for (const [level, count] of counts) {
    const half = radius / 2 ** level;
    volume += count * (half * half * half);
  }
  return 20 * volume;
}

function relativeDifference(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

interface WorkedExample {
  readonly name: string;
  readonly counts: Readonly<Record<number, number>>;
  readonly radius: number;
}

const WORKED_EXAMPLES: readonly WorkedExample[] = [
  { name: "oolite_cobra3.dat", counts: { 4: 6, 5: 1204 }, radius: 65.5 },
  {
    name: "oolite_viper.dat",
    counts: { 4: 9, 5: 1171 },
    radius: 35.534400939941406,
  },
  { name: "oolite_coriolis.dat", counts: { 5: 2988 }, radius: 500.5 },
  {
    name: "oolite_coriolis_faceplate.dat",
    counts: { 5: 624 },
    radius: 534.7979736328125,
  },
  { name: "oolite_coriolis_tris.dat", counts: { 5: 2888 }, radius: 500.5 },
  { name: "oolite_coriolis_dock.dat", counts: { 5: 790 }, radius: 250.5 },
];

describe("worked examples, re-derived in float64 (relative 1e-6)", () => {
  function derive(name: string): number {
    const file = `${MODELS_DIR}/${name}`;
    const octree = buildOctree(mesh(name), file);
    return float64Mass(terminalCounts(octree.root), float64Radius(mesh(name)));
  }

  it.each(WORKED_EXAMPLES)(
    "$name has the pinned terminal-node counts and radius",
    ({ name, counts, radius }) => {
      const octree = buildOctree(mesh(name), `${MODELS_DIR}/${name}`);
      expect(Object.fromEntries(terminalCounts(octree.root))).toEqual(counts);
      expect(float64Radius(mesh(name))).toBe(radius);
      expect(octree.radius).toBe(radius);
    },
  );

  it.each(WORKED_EXAMPLES)(
    "$name float64 mass is within 1e-6 of the float32 hull mass",
    ({ name }) => {
      const expected = HULL_MASSES[name];
      if (expected === undefined) throw new Error(`no hull row for ${name}`);
      expect(relativeDifference(derive(name), expected)).toBeLessThan(1e-6);
    },
  );

  it("derives the Cobra Mk III by hand: 6 x (65.5 / 16)^3 + 1204 x (65.5 / 32)^3", () => {
    // Octree.m:634-667 with the counts above, then ShipEntity.m:417-419.
    const small = 65.5 / 16;
    const big = 65.5 / 32;
    const volume = 6 * (small * small * small) + 1204 * (big * big * big);
    expect(relativeDifference(volume, 10736.884765625)).toBeLessThan(1e-6);
    expect(
      relativeDifference(
        20 * volume,
        shipMass(COBRA_PLAYER, catalogue, meshes),
      ),
    ).toBeLessThan(1e-6);
  });

  it("derives the Coriolis as the float64 sum of its four parts", () => {
    const parts = [
      "oolite_coriolis.dat",
      "oolite_coriolis_faceplate.dat",
      "oolite_coriolis_tris.dat",
      "oolite_coriolis_dock.dat",
    ];
    const total = parts.reduce((sum, name) => sum + derive(name), 0);
    expect(relativeDifference(total, 515483904)).toBeLessThan(1e-6);
    expect(
      relativeDifference(
        total,
        shipMass("coriolis-station", catalogue, meshes),
      ),
    ).toBeLessThan(1e-6);
  });
});

describe("community cross-check (wiki.alioth.net VariableMasslock, whole tonnes)", () => {
  it.each([
    ["adder", 16],
    ["gecko", 25],
    ["sidewinder", 25],
    ["viper", 34],
    ["mamba", 36],
    ["moray", 51],
    ["cobramk1", 52],
    ["krait", 93],
    [COBRA_PLAYER, 215],
  ] as const)("%s weighs %s tonnes", (key, tonnes) => {
    expect(Math.round(shipMass(key, catalogue, meshes) / 1000)).toBe(tonnes);
  });
});

describe("the historical source constants are not reproduced", () => {
  it("does not give the Coriolis 455,223,200 (ShipEntity.m:12504)", () => {
    expect(shipMass("coriolis-station", catalogue, meshes)).not.toBe(455223200);
  });

  it("does not give the Cobra Mk III 185,580 (PlayerEntity.m:191-192)", () => {
    expect(shipMass(COBRA_PLAYER, catalogue, meshes)).not.toBe(185580);
  });
});

describe("density", () => {
  function viperWith(density: unknown): ShipCatalogue {
    return withEntry("viper", (entry) => ({
      ...entry,
      extras: { ...entry.extras, density },
    }));
  }

  it("scales the whole hull mass", () => {
    expect(shipMass("viper", viperWith(2), meshes)).toBe(68081.359375);
  });

  it.each([0, -1, "heavy", Number.NaN, Number.POSITIVE_INFINITY, null])(
    "rejects a density of %s as SCHEMA",
    (density) => {
      const error = capture(() =>
        shipMass("viper", viperWith(density), meshes),
      );
      expect(error.code).toBe("SCHEMA");
      expect(error.construct).toBe("viper");
    },
  );
});

describe("guards", () => {
  it("rejects a key the catalogue lacks", () => {
    const error = capture(() => shipMass("no-such-ship", catalogue, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("no-such-ship");
  });

  it("rejects an entry whose model is null", () => {
    const patched = withEntry("viper", (entry) => ({ ...entry, model: null }));
    const error = capture(() => shipMass("viper", patched, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("viper");
  });

  it("rejects a model the mesh set lacks", () => {
    const error = capture(() => shipMass("viper", catalogue, {}));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("viper");
    expect(error.file.startsWith("third_party/oolite/Models/")).toBe(true);
  });

  it("rejects an authored model_scale_factor", () => {
    const patched = withEntry("viper", (entry) => ({
      ...entry,
      extras: { ...entry.extras, model_scale_factor: 1 },
    }));
    const error = capture(() => shipMass("viper", patched, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("viper");
    expect(error.excerpt).toContain("model_scale_factor");
  });

  it("rejects a non-flasher subentity without a subentity_key", () => {
    const patched = withEntry("viper", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [...entry.shipDef.subentities, { position: [0, 0, 0] }],
      },
    }));
    const error = capture(() => shipMass("viper", patched, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("viper");
  });

  it("rejects a subentity cycle and names the chain", () => {
    const patched = withEntry("oolite_coriolis_tris", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [{ subentity_key: "coriolis-station" }],
      },
    }));
    const error = capture(() => shipMass("coriolis-station", patched, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.excerpt).toContain(
      "coriolis-station -> oolite_coriolis_tris -> coriolis-station",
    );
  });

  it("rejects a subentity key the catalogue lacks", () => {
    const patched = withEntry("viper", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [{ subentity_key: "no-such-subentity" }],
      },
    }));
    const error = capture(() => shipMass("viper", patched, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("no-such-subentity");
  });
});
