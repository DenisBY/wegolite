// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's ship collision radius (WORLD-15, owner decision 2026-11-14, T-12-13).
 *
 * The radius is the float32 square root of the largest float32 squared vertex
 * distance from the model origin (`OOMesh.m:1795-1822`). The Viper's value is
 * recomputed here by a loop that shares no code with `ship-radius.ts` (a
 * `Float32Array` does the float32 rounding), and the expected nine values live in
 * `tests/golden/content/ships-npc.json`. The client entries' radii, which add
 * the solid subentity term (`ShipEntity.m:2028-2044`), are pinned to the values
 * measured in a running Oolite (quick task 261117-jji).
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
import {
  collisionRadius,
  computeCollisionRadii,
  computeShipRadii,
  hullRadius,
} from "./ship-radius.js";
import { MODELS_DIR, SHIPDATA_FILE, compileShips } from "./ships.js";
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

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a ContentError, but no error was thrown");
}

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

function syntheticMesh(
  vertices: readonly { x: number; y: number; z: number }[],
): ParsedMesh {
  return {
    nverts: vertices.length,
    nfaces: 0,
    vertices: [...vertices],
    faces: [],
    materials: [],
    normals: null,
    names: null,
    caseSensitiveNames: false,
    warnings: [],
  };
}

/** The Viper's radius by an independent float32 loop over its parsed `.dat`. */
function independentRadius(name: string): number {
  const mesh = meshes[name];
  if (mesh === undefined) throw new Error(`mesh "${name}" is not loaded`);
  const f32 = new Float32Array(1);
  const round = (value: number): number => {
    f32[0] = value;
    return f32[0] ?? Number.NaN;
  };
  let result = 0;
  for (const vertex of mesh.vertices) {
    const [x, y, z] = [round(vertex.x), round(vertex.y), round(vertex.z)];
    const squared = round(round(round(x * x) + round(y * y)) + round(z * z));
    if (squared > result) result = squared;
  }
  return round(Math.sqrt(result));
}

describe("hullRadius", () => {
  it("is the farthest vertex distance: (3, 4, 0) beats (1, 1, 1) at 5", () => {
    const mesh = syntheticMesh([
      { x: 3, y: 4, z: 0 },
      { x: 1, y: 1, z: 1 },
    ]);
    expect(hullRadius("test", "oolite_test.dat", mesh)).toBe(5);
  });

  it("rounds to float32 at every step", () => {
    const mesh = syntheticMesh([{ x: 0.1, y: 0.2, z: 0.3 }]);
    const radius = hullRadius("test", "oolite_test.dat", mesh);
    expect(radius).toBe(Math.fround(radius));
  });

  it("fails naming the key and the model for a mesh with no vertices", () => {
    const error = capture(() =>
      hullRadius("test", "oolite_test.dat", syntheticMesh([])),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe("oolite_test.dat");
    expect(error.construct).toBe("test");
  });

  it("fails for a radius that is zero or not finite", () => {
    const origin = syntheticMesh([{ x: 0, y: 0, z: 0 }]);
    expect(
      capture(() => hullRadius("test", "oolite_test.dat", origin)).construct,
    ).toBe("test");
    const huge = syntheticMesh([{ x: 1e30, y: 0, z: 0 }]);
    expect(
      capture(() => hullRadius("test", "oolite_test.dat", huge)).construct,
    ).toBe("test");
    const nan = syntheticMesh([{ x: Number.NaN, y: 0, z: 0 }]);
    expect(
      capture(() => hullRadius("test", "oolite_test.dat", nan)).construct,
    ).toBe("test");
  });
});

describe("computeShipRadii", () => {
  const radii = computeShipRadii(NPC_SHIP_KEYS, catalogue, meshes);

  it("returns nine positive finite radii in key order", () => {
    expect([...radii.keys()]).toEqual([...NPC_SHIP_KEYS]);
    expect(radii.size).toBe(9);
    for (const radius of radii.values()) {
      expect(Number.isFinite(radius)).toBe(true);
      expect(radius).toBeGreaterThan(0);
      expect(radius).toBe(Math.fround(radius));
    }
  });

  it("gives the Viper the radius of an independent loop over oolite_viper.dat", () => {
    expect(radii.get("viper")).toBe(independentRadius("oolite_viper.dat"));
  });

  it("matches the independent loop for every NPC model", () => {
    for (const key of NPC_SHIP_KEYS) {
      const entry = catalogue.entries.find((item) => item.key === key);
      expect(radii.get(key)).toBe(independentRadius(entry?.model ?? ""));
    }
  });

  it("de-duplicates a repeated key", () => {
    const repeated = computeShipRadii(["viper", "viper"], catalogue, meshes);
    expect(repeated.size).toBe(1);
  });

  it("fails naming an unknown key", () => {
    const error = capture(() =>
      computeShipRadii(["nosuch"], catalogue, meshes),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(SHIPDATA_FILE);
    expect(error.construct).toBe("nosuch");
  });

  it("fails for an entry without a model", () => {
    const without = withEntry("viper", (entry) => ({ ...entry, model: null }));
    expect(
      capture(() => computeShipRadii(["viper"], without, meshes)).construct,
    ).toBe("viper");
  });

  it("fails naming the model when the mesh set lacks it", () => {
    const error = capture(() => computeShipRadii(["viper"], catalogue, {}));
    expect(error.file).toBe(`${MODELS_DIR}/oolite_viper.dat`);
    expect(error.construct).toBe("viper");
  });

  it("fails when the entry has a solid subentity, saying the term is not ported", () => {
    const solid = withEntry("viper", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [
          ...entry.shipDef.subentities,
          { type: "ship", subentity_key: "viper" },
        ],
      },
    }));
    const error = capture(() => computeShipRadii(["viper"], solid, meshes));
    expect(error.construct).toBe("viper");
    expect(error.excerpt).toMatch(/not implement the subentity radius term/);
  });

  it("ignores a flasher subentity", () => {
    const flasher = withEntry("viper", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [...entry.shipDef.subentities, { type: "flasher" }],
      },
    }));
    expect(computeShipRadii(["viper"], flasher, meshes).get("viper")).toBe(
      radii.get("viper"),
    );
  });
});

describe("collisionRadius (quick task 261117-k1l)", () => {
  const radii = computeCollisionRadii(
    ["buoy", "coriolis-station", "oolite_template_cobra3-player"],
    catalogue,
    meshes,
  );

  it("equals the float32 radii measured in a running Oolite (quick task 261117-jji)", () => {
    expect(radii.get("coriolis-station")).toBe(779.3702392578125);
    expect(radii.get("buoy")).toBe(59.13554763793945);
    expect(radii.get("oolite_template_cobra3-player")).toBe(72.69734954833984);
  });

  it("gives both buoys the same radius: the core subentity lies inside the hull", () => {
    expect(collisionRadius("buoy-witchpoint", catalogue, meshes)).toBe(
      59.13554763793945,
    );
    expect(radii.get("buoy")).toBe(independentRadius("oolite_buoy.dat"));
  });

  it("grows the Coriolis beyond its hull through the dock subentity", () => {
    expect(independentRadius("oolite_coriolis.dat")).toBe(702.1246337890625);
    expect(radii.get("coriolis-station")).toBeGreaterThan(702.1246337890625);
  });

  it("takes each subentity radius from its own hull, as the measured SUB values", () => {
    expect(independentRadius("oolite_coriolis_dock.dat")).toBe(
      279.1141662597656,
    );
    expect(independentRadius("oolite_coriolis_faceplate.dat")).toBe(
      702.1246337890625,
    );
    expect(independentRadius("oolite_coriolis_tris.dat")).toBe(
      702.1246337890625,
    );
    expect(independentRadius("oolite_buoy_subents.dat")).toBe(
      25.8226470947265625,
    );
  });

  it("matches an independent recomputation of the Coriolis dock term", () => {
    const station = catalogue.entries.find(
      (entry) => entry.key === "coriolis-station",
    );
    const dock = station?.shipDef.subentities.find(
      (subentity) => subentity.isDock === true,
    );
    const position = dock?.position;
    if (position === undefined) throw new Error("no dock position");
    const f32 = new Float32Array([
      Math.sqrt(position.reduce((sum, value) => sum + value * value, 0)) +
        independentRadius("oolite_coriolis_dock.dat"),
    ]);
    expect(f32[0]).toBe(779.3702392578125);
    expect(radii.get("coriolis-station")).toBe(f32[0]);
  });

  it("ignores a flasher placed far out", () => {
    const far = withEntry("buoy", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [
          ...entry.shipDef.subentities,
          { type: "flasher", position: [0, 0, 10_000] },
        ],
      },
    }));
    expect(collisionRadius("buoy", far, meshes)).toBe(59.13554763793945);
  });

  it("counts a solid subentity placed far out", () => {
    const far = withEntry("buoy", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [
          ...entry.shipDef.subentities,
          {
            type: "standard",
            subentity_key: "oolite_buoy_subentity",
            position: [0, 0, 1_000],
          },
        ],
      },
    }));
    expect(collisionRadius("buoy", far, meshes)).toBe(
      Math.fround(1_000 + 25.8226470947265625),
    );
  });

  it("fails naming the key for a solid subentity without a subentity_key", () => {
    const keyless = withEntry("buoy", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [{ type: "standard", position: [0, 0, 0] }],
      },
    }));
    const error = capture(() => collisionRadius("buoy", keyless, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("buoy");
    expect(error.excerpt).toMatch(/no subentity_key/);
  });

  it("fails naming the key for a solid subentity without a position", () => {
    const placeless = withEntry("buoy", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [{ subentity_key: "oolite_buoy_subentity" }],
      },
    }));
    const error = capture(() => collisionRadius("buoy", placeless, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("buoy");
    expect(error.excerpt).toMatch(/no position/);
  });

  it("fails naming the key for a nested solid subentity", () => {
    const nested = withEntry("oolite_buoy_subentity", (entry) => ({
      ...entry,
      shipDef: {
        ...entry.shipDef,
        subentities: [
          { subentity_key: "oolite_buoy_subentity", position: [0, 0, 0] },
        ],
      },
    }));
    const error = capture(() => collisionRadius("buoy", nested, meshes));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("buoy");
    expect(error.excerpt).toMatch(/nested radius term is not ported/);
  });
});
