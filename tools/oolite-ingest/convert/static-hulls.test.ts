// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The static hull artifact converter (DATA-15).
 *
 * The octree, radius and mass are the existing build-time ports; these cases
 * pin that the converter compiles the four static and debris hulls and the five
 * ident names in order, resolves every solid subentity to its own model, octree
 * and mass at its authored position, refuses what the record cannot carry (a
 * non-identity orientation, a solid subentity with no key), and that the
 * emitted bytes are deterministic, equal the committed file, and keep each
 * octree root on one line.
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
import { buildOctree } from "./octree.js";
import { computeShipMasses } from "./ship-mass.js";
import {
  OWN_FILE_STATION_KEYS,
  STATIC_HULLS_PATH,
  STATIC_HULL_KEYS,
  STATIC_NAME_KEYS,
  compileStaticHulls,
  emitStaticHulls,
  emitStationHulls,
  staticSubentityKeys,
} from "./static-hulls.js";
import { MODELS_DIR, compileShips } from "./ships.js";
import type { ShipCatalogue } from "./ships.js";
import { STATION_MODEL_FILES } from "./stations.js";
import { StaticHullArtifactSchema } from "../../../src/content/schemas/ship-static-hull.js";
import {
  STATION_KINDS,
  STATION_RECORDS,
} from "../../../src/content/stations.js";

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
  const names = new Set<string>(STATION_MODEL_FILES);
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
const masses = computeShipMasses(
  staticSubentityKeys(catalogue),
  catalogue,
  meshes,
);
const artifact = compileStaticHulls(catalogue, meshes, masses);

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected the call to throw");
}

/** The catalogue with the Coriolis's first subentity changed. */
function withFirstCoriolisSubentity(
  change: Record<string, unknown>,
): ShipCatalogue {
  return {
    ...catalogue,
    entries: catalogue.entries.map((entry) => {
      if (entry.key !== "coriolis-station") return entry;
      const [first, ...rest] = entry.shipDef.subentities;
      const changed = { ...first, ...change };
      for (const [key, value] of Object.entries(change)) {
        if (value === undefined)
          delete (changed as Record<string, unknown>)[key];
      }
      return {
        ...entry,
        shipDef: { ...entry.shipDef, subentities: [changed, ...rest] },
      };
    }),
  };
}

describe("compileStaticHulls", () => {
  it("compiles the four hulls in STATIC_HULL_KEYS order", () => {
    expect([...STATIC_HULL_KEYS]).toEqual([
      "coriolis-station",
      "buoy",
      "barrel",
      "alloy",
    ]);
    expect(artifact.hulls.map((hull) => hull.key)).toEqual([
      ...STATIC_HULL_KEYS,
    ]);
  });

  it("compiles the five ident names in STATIC_NAME_KEYS order", () => {
    expect([...STATIC_NAME_KEYS]).toEqual([
      "coriolis-station",
      "buoy",
      "buoy-witchpoint",
      "barrel",
      "alloy",
    ]);
    expect(artifact.names.map((name) => name.key)).toEqual([
      ...STATIC_NAME_KEYS,
    ]);
    expect(
      artifact.names.find((name) => name.key === "buoy-witchpoint")?.name,
    ).toBe("Witchpoint Beacon");
  });

  it("resolves every solid subentity at its authored position, with its own octree and computed mass", () => {
    const subentities = artifact.hulls.flatMap((hull) =>
      hull.subentities.map((subentity) => ({ hull: hull.key, subentity })),
    );
    expect(
      subentities.map(({ hull, subentity }) => [
        hull,
        subentity.key,
        subentity.position,
      ]),
    ).toEqual([
      ["coriolis-station", "oolite_coriolis_faceplate", [0, 0, 0]],
      ["coriolis-station", "oolite_coriolis_tris", [0, 0, 0]],
      ["coriolis-station", "oolite_coriolis_dock", [0, 0, 500.2561]],
      ["buoy", "oolite_buoy_subentity", [0, 0, 0]],
    ]);
    const expectedMasses = computeShipMasses(
      subentities.map(({ subentity }) => subentity.key),
      catalogue,
      meshes,
    );
    for (const { subentity } of subentities) {
      expect(subentity.mass, subentity.key).toBe(
        expectedMasses.get(subentity.key),
      );
      const entry = catalogue.entries.find(
        (candidate) => candidate.key === subentity.key,
      );
      const mesh = meshes[entry?.model ?? ""];
      if (mesh === undefined) throw new Error(`no mesh for ${subentity.key}`);
      const octree = buildOctree(mesh, subentity.key);
      expect(subentity.octree.depth, subentity.key).toBe(octree.depth);
      expect(subentity.octree.radius, subentity.key).toBe(octree.radius);
    }
    expect(
      artifact.hulls.find((hull) => hull.key === "buoy")?.subentities[0]?.mass,
    ).toBe(7_646.7861328125);
  });

  it("refuses a non-identity subentity orientation, naming the key", () => {
    const error = capture(() =>
      compileStaticHulls(
        withFirstCoriolisSubentity({ orientation: [0, 1, 0, 0] }),
        meshes,
        masses,
      ),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("coriolis-station");
    expect(error.message).toContain("orientation");
  });

  it("refuses a non-flasher subentity with no subentity_key, naming the key", () => {
    const error = capture(() =>
      compileStaticHulls(
        withFirstCoriolisSubentity({ subentity_key: undefined }),
        meshes,
        masses,
      ),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.message).toContain("coriolis-station");
    expect(error.message).toContain("subentity_key");
  });
});

describe("emitStaticHulls", () => {
  const emitted = emitStaticHulls(catalogue, meshes, masses);
  const text = Buffer.from(emitted.bytes).toString("utf8");

  it("writes the one repository-relative path", () => {
    expect(emitted.path).toBe(STATIC_HULLS_PATH);
    expect(emitted.path).toBe("src/content/generated/ships-static-hulls.json");
  });

  it("is deterministic and equals the committed generated file", () => {
    expect(
      Buffer.from(emitStaticHulls(catalogue, meshes, masses).bytes),
    ).toEqual(Buffer.from(emitted.bytes));
    expect(text).toBe(readText(STATIC_HULLS_PATH));
  });

  it("parses back to the compiled artifact, ends with one newline and keeps each root on one line", () => {
    expect(JSON.parse(text)).toEqual(artifact);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    const rootLines = text.split("\n").filter((line) => /"root": /.test(line));
    const octrees = artifact.hulls.reduce(
      (count, hull) => count + 1 + hull.subentities.length,
      0,
    );
    expect(rootLines).toHaveLength(octrees);
  });
});

describe("emitStationHulls (Phase 22.1)", () => {
  const emitted = emitStationHulls(catalogue, meshes, masses);

  it("writes one file per own-file kind, in STATION_KINDS order, at its hullsFile", () => {
    expect(emitted.map((file) => file.path)).toEqual([
      "src/content/generated/ships-static-hulls-dodecahedron.json",
      "src/content/generated/ships-static-hulls-icosahedron.json",
    ]);
    expect(emitted.map((file) => file.path)).toEqual(
      STATION_KINDS.filter(
        (kind) => STATION_RECORDS[kind].hullsFile !== "ships-static-hulls.json",
      ).map(
        (kind) => `src/content/generated/${STATION_RECORDS[kind].hullsFile}`,
      ),
    );
    expect([...OWN_FILE_STATION_KEYS]).toEqual([
      "dodecahedron-station",
      "icosahedron-station",
    ]);
  });

  it("is deterministic and equals the committed files", () => {
    const again = emitStationHulls(catalogue, meshes, masses);
    for (const [index, file] of emitted.entries()) {
      expect(Buffer.from(again[index]?.bytes ?? [])).toEqual(
        Buffer.from(file.bytes),
      );
      expect(Buffer.from(file.bytes).toString("utf8")).toBe(
        readText(file.path),
      );
    }
  });

  it("holds exactly one hull and one name per file, validated by the shared schema", () => {
    for (const [index, file] of emitted.entries()) {
      const parsed = StaticHullArtifactSchema.safeParse(
        JSON.parse(Buffer.from(file.bytes).toString("utf8")),
      );
      expect(parsed.success, file.path).toBe(true);
      if (!parsed.success) continue;
      const shipKey = OWN_FILE_STATION_KEYS[index];
      expect(parsed.data.hulls.map((hull) => hull.key)).toEqual([shipKey]);
      expect(parsed.data.names.map((name) => name.key)).toEqual([shipKey]);
    }
  });

  it("includes the station's solid subentities and no flasher", () => {
    const keysOf = (index: number): string[] => {
      const parsed = JSON.parse(
        Buffer.from(emitted[index]?.bytes ?? []).toString("utf8"),
      ) as { hulls: { subentities: { key: string }[] }[] };
      return (parsed.hulls[0]?.subentities ?? []).map(
        (subentity) => subentity.key,
      );
    };
    expect(keysOf(0)).toEqual(["oolite_dodo_faceplate", "oolite_dodo_dock"]);
    expect(keysOf(1)).toEqual(["oolite_ico_mainhull", "oolite_ico_dock"]);
  });

  it("keeps the shared static file's keys and bytes: the new stations are not in it", () => {
    expect(artifact.hulls.map((hull) => hull.key)).not.toContain(
      "dodecahedron-station",
    );
    expect(
      Buffer.from(emitStaticHulls(catalogue, meshes, masses).bytes).toString(
        "utf8",
      ),
    ).toBe(readText(STATIC_HULLS_PATH));
  });

  it("needs the subentity masses of the new stations from staticSubentityKeys", () => {
    const keys = staticSubentityKeys(catalogue);
    for (const key of [
      "oolite_dodo_faceplate",
      "oolite_dodo_dock",
      "oolite_ico_mainhull",
      "oolite_ico_dock",
    ]) {
      expect(keys).toContain(key);
    }
  });
});
