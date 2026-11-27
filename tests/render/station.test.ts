// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Coriolis assembly contract (WORLD-02, Pitfall 2, T-3-06).
 *
 * Two independent readers:
 *
 * - the committed GLB's own JSON chunk, read in Node, proves the asset still
 *   carries the four node names, the dock translation at local `-500.2561` and
 *   the 500 m x/y half-extent. The z extent (which includes the dock tunnel) is
 *   deliberately **not** the collision radius;
 * - a synthetic four-node graph proves the factory's assembly rules — the dock
 *   transform is untouched, the hull carries polygonOffset 1/1, renderOrder is
 *   hull -> faceplate -> tris -> dock, and every node keeps depth writes.
 *
 * The source scan pins the two rules that a behaviour test cannot see on a
 * clone: `polygonOffset` must be present and `lookAt(` must be absent (it aims
 * local +Z at the target and would put the dock on the far side).
 */

import { readFileSync } from "node:fs";

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { STATION_KINDS, stationRecord } from "../../src/content/stations.js";
import type { StationKind } from "../../src/content/stations.js";
import type { System } from "../../src/content/types.js";
import { createStation } from "../../src/render/bodies/station.js";
import type { StationBody } from "../../src/render/bodies/station.js";
import { isMesh } from "../../src/render/mesh.js";
import { axisAngle, mul } from "../../src/sim/math.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";
import { stationSpecOf } from "../helpers/stations.js";

const { layout } = laveFixture();

const stationSource = readFileSync(
  new URL("../../src/render/bodies/station.ts", import.meta.url),
  "utf8",
);

interface GlbAccessor {
  readonly count: number;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

interface GlbPrimitive {
  readonly attributes: { readonly POSITION?: number };
  readonly material?: number;
}

interface GlbMaterialExtras {
  readonly oolite?: {
    readonly emissionModulateColorNormalized?: readonly number[];
  };
}

interface GlbMaterial {
  readonly name?: string;
  readonly extras?: GlbMaterialExtras;
}

interface GlbMesh {
  readonly primitives: readonly GlbPrimitive[];
}

interface GlbNode {
  readonly name?: string;
  readonly mesh?: number;
  readonly translation?: readonly number[];
}

interface GlbJson {
  readonly nodes: readonly GlbNode[];
  readonly meshes: readonly GlbMesh[];
  readonly accessors: readonly GlbAccessor[];
  readonly materials?: readonly GlbMaterial[];
}

function readGlbJson(): GlbJson {
  const bytes = readFileSync(
    new URL("../../public/models/coriolis.glb", import.meta.url),
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  return JSON.parse(text.replace(/ +$/, "")) as GlbJson;
}

function positionAccessor(
  json: GlbJson,
  meshIndex: number,
): GlbAccessor | undefined {
  const primitive = json.meshes[meshIndex]?.primitives[0];
  const accessorIndex = primitive?.attributes.POSITION;
  if (accessorIndex === undefined) return undefined;
  return json.accessors[accessorIndex];
}

function syntheticCoriolis(
  emissive: ReadonlyMap<string, readonly number[]> = new Map(),
): GLTF {
  const scene = new THREE.Group();
  for (const name of ["hull", "faceplate", "tris", "dock"]) {
    const material = new THREE.MeshStandardMaterial();
    const triple = emissive.get(name);
    if (triple !== undefined) {
      // Production's path: GLTFLoader copies the GLB `extras` object straight
      // onto `material.userData`, and `Material.clone()` deep-copies it, so
      // setting it on the bare material is exactly what `cloneMaterials` reads.
      material.userData.oolite = {
        emissionModulateColorNormalized: [...triple],
      };
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = name;
    scene.add(mesh);
  }
  return { scene } as unknown as GLTF;
}

/** The assembled station's materials, keyed by node name. */
function assembledMaterials(
  station: ReturnType<typeof createStation>,
): Map<string, THREE.MeshStandardMaterial> {
  const byName = new Map<string, THREE.MeshStandardMaterial>();
  station.root.traverse((object) => {
    if (!isMesh(object)) return;
    byName.set(object.name, object.material as THREE.MeshStandardMaterial);
  });
  return byName;
}

/**
 * Resolve a node-name -> authored emissive triple map from the committed GLB by
 * following `node.name -> node.mesh -> mesh.primitives[0].material ->
 * material.extras`, the same chain GLTFLoader walks.
 */
function authoredEmissiveByNode(
  json: GlbJson,
): Map<string, readonly [number, number, number]> {
  const triples = new Map<string, readonly [number, number, number]>();

  for (const node of json.nodes) {
    if (node.name === undefined || node.mesh === undefined) continue;
    const materialIndex = json.meshes[node.mesh]?.primitives[0]?.material;
    if (materialIndex === undefined) continue;
    const triple =
      json.materials?.[materialIndex]?.extras?.oolite
        ?.emissionModulateColorNormalized;
    if (triple === undefined) continue;
    const [red, green, blue] = triple;
    if (red === undefined || green === undefined || blue === undefined)
      continue;
    triples.set(node.name, [red, green, blue]);
  }

  return triples;
}

describe("the committed Coriolis GLB", () => {
  it("keeps the four pinned node names and the dock translation", () => {
    const json = readGlbJson();

    expect(json.nodes.map((node) => node.name)).toEqual([
      "hull",
      "faceplate",
      "tris",
      "dock",
    ]);
    expect(json.nodes[3]?.translation).toEqual([0, 0, -500.2561]);
  });

  it("has a 500 m x/y half-extent", () => {
    const json = readGlbJson();
    const hull = positionAccessor(json, 0);
    if (hull?.min === undefined || hull.max === undefined) {
      throw new Error("the Coriolis hull has no POSITION bounds");
    }

    const halfX = ((hull.max[0] ?? 0) - (hull.min[0] ?? 0)) / 2;
    const halfY = ((hull.max[1] ?? 0) - (hull.min[1] ?? 0)) / 2;

    expect(halfX).toBeCloseTo(500, 2);
    expect(halfY).toBeCloseTo(500, 2);
    // The collision radius is Oolite's (it includes the dock subentity), not
    // the hull half-extent (quick task 261117-k1l).
    expect(layout.station.radius).toBe(779.3702392578125);
  });

  it("has a z extent that includes the dock tunnel and is not the radius", () => {
    const json = readGlbJson();
    const zValues: number[] = [];

    for (const index of json.meshes.keys()) {
      const accessor = positionAccessor(json, index);
      if (accessor?.min === undefined || accessor.max === undefined) continue;
      const node = json.nodes.find((candidate) => candidate.mesh === index);
      const translationZ = node?.translation?.[2] ?? 0;
      zValues.push(
        (accessor.min[2] ?? 0) + translationZ,
        (accessor.max[2] ?? 0) + translationZ,
      );
    }

    const halfZ = (Math.max(...zValues) - Math.min(...zValues)) / 2;
    expect(halfZ).toBeGreaterThan(500.01);
    expect(halfZ).toBeCloseTo(517.15, 2);
  });
});

describe("the authored Coriolis emissive", () => {
  const BLOCK = [26.474321568627452, 26.59201176470588, 12.866205490196078];
  const DOCK = [0.952, 0.963, 0.8824];

  it("reads the per-material emission modulate triple from the GLB extras", () => {
    const triples = authoredEmissiveByNode(readGlbJson());

    expect(triples.size).toBe(4);
    for (const name of ["hull", "faceplate", "tris"]) {
      const triple = triples.get(name);
      expect(triple, name).toBeDefined();
      for (const [index, expected] of BLOCK.entries()) {
        expect(triple?.[index], `${name}[${String(index)}]`).toBeCloseTo(
          expected ?? 0,
          12,
        );
      }
    }
    const dock = triples.get("dock");
    expect(dock).toBeDefined();
    for (const [index, expected] of DOCK.entries()) {
      expect(dock?.[index], `dock[${String(index)}]`).toBeCloseTo(
        expected ?? 0,
        12,
      );
    }
  });

  it("applies the authored triple per channel on the assembled materials", () => {
    const triples = authoredEmissiveByNode(readGlbJson());
    const materials = assembledMaterials(
      createStation(layout, syntheticCoriolis(triples)),
    );

    for (const name of ["hull", "faceplate", "tris", "dock"]) {
      const authored = triples.get(name);
      const material = materials.get(name);
      expect(authored, name).toBeDefined();
      expect(material, name).toBeDefined();
      if (authored === undefined || material === undefined) continue;

      const products = [
        material.emissive.r * material.emissiveIntensity,
        material.emissive.g * material.emissiveIntensity,
        material.emissive.b * material.emissiveIntensity,
      ];
      for (const [index, product] of products.entries()) {
        expect(product, `${name}[${String(index)}]`).toBeCloseTo(
          authored[index] ?? 0,
          6,
        );
      }
    }

    // The dock's authored gain is below 1, so it must not bloom; the hull
    // layers carry the ~26x bloom the shipdata authoring intends.
    expect(materials.get("dock")?.emissiveIntensity).toBeCloseTo(0.963, 12);
    expect(materials.get("hull")?.emissiveIntensity).toBeCloseTo(
      BLOCK[1] ?? 0,
      9,
    );
    expect(materials.get("faceplate")?.emissiveIntensity).toBeCloseTo(
      BLOCK[1] ?? 0,
      9,
    );
    expect(materials.get("tris")?.emissiveIntensity).toBeCloseTo(
      BLOCK[1] ?? 0,
      9,
    );
  });

  it("proves the fixture's extras actually reach the material", () => {
    // A fabricated triple the asset does not author: if the fixture's extras
    // were dropped, this would read the neutral fallback instead.
    const fabricated = new Map<string, readonly number[]>([
      ["hull", [3, 4, 5]],
    ]);
    const materials = assembledMaterials(
      createStation(layout, syntheticCoriolis(fabricated)),
    );
    const hull = materials.get("hull");

    expect(hull?.emissiveIntensity).toBeCloseTo(5, 12);
    expect(
      (hull?.emissive.r ?? 0) * (hull?.emissiveIntensity ?? 0),
    ).toBeCloseTo(3, 12);
    expect(
      (hull?.emissive.g ?? 0) * (hull?.emissiveIntensity ?? 0),
    ).toBeCloseTo(4, 12);
    expect(
      (hull?.emissive.b ?? 0) * (hull?.emissiveIntensity ?? 0),
    ).toBeCloseTo(5, 12);
  });

  it("falls back to a neutral emissive when extras are missing", () => {
    const materials = assembledMaterials(
      createStation(layout, syntheticCoriolis()),
    );

    expect(materials.size).toBe(4);
    for (const [name, material] of materials) {
      expect(material.emissiveIntensity, name).toBe(1);
      expect(Number.isFinite(material.emissive.r), name).toBe(true);
      expect(Number.isFinite(material.emissive.g), name).toBe(true);
      expect(Number.isFinite(material.emissive.b), name).toBe(true);
    }
  });

  it("falls back instead of emitting NaN when a component is not finite", () => {
    const malformed = new Map<string, readonly number[]>([
      ["hull", [Number.NaN, 1, 1]],
      ["dock", [0, 0, 0]],
    ]);
    const materials = assembledMaterials(
      createStation(layout, syntheticCoriolis(malformed)),
    );

    for (const name of ["hull", "dock"]) {
      const material = materials.get(name);
      expect(material?.emissiveIntensity, name).toBe(1);
      expect(Number.isFinite(material?.emissive.r), name).toBe(true);
      expect(Number.isFinite(material?.emissive.g), name).toBe(true);
      expect(Number.isFinite(material?.emissive.b), name).toBe(true);
      expect(Number.isFinite(material?.emissiveIntensity), name).toBe(true);
    }
  });
});

describe("createStation", () => {
  it("leaves the dock transform alone and orders the coplanar layers", () => {
    const station = createStation(layout, syntheticCoriolis());
    const byName = new Map<string, THREE.Mesh>();
    station.root.traverse((object) => {
      if (isMesh(object)) byName.set(object.name, object);
    });

    expect(byName.get("hull")?.renderOrder).toBe(0);
    expect(byName.get("faceplate")?.renderOrder).toBe(1);
    expect(byName.get("tris")?.renderOrder).toBe(2);
    expect(byName.get("dock")?.renderOrder).toBe(3);
    expect(station.dock.name).toBe("dock");
    expect(station.dock.position.toArray()).toEqual([0, 0, 0]);

    for (const mesh of byName.values()) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      expect(material.depthWrite).toBe(true);
    }

    const dockMaterial = byName.get("dock")?.material as THREE.Material;
    expect(dockMaterial.depthTest).toBe(true);

    const hullMaterial = byName.get("hull")?.material as THREE.Material;
    expect(hullMaterial.polygonOffset).toBe(true);
    expect(hullMaterial.polygonOffsetFactor).toBe(1);
    expect(hullMaterial.polygonOffsetUnits).toBe(1);
  });

  it("rolls about local +Z on top of the base orientation", () => {
    const station = createStation(layout, syntheticCoriolis());

    const base = layout.stationBaseQuat;
    expect(station.root.quaternion.w).toBeCloseTo(base.w, 12);

    station.update(0.5);
    const expected = mul(layout.stationBaseQuat, axisAngle(0, 0, 1, 0.5));
    expect(station.root.quaternion.x).toBeCloseTo(expected.x, 12);
    expect(station.root.quaternion.y).toBeCloseTo(expected.y, 12);
    expect(station.root.quaternion.z).toBeCloseTo(expected.z, 12);
    expect(station.root.quaternion.w).toBeCloseTo(expected.w, 12);
  });

  it("throws a named error when the dock node is missing", () => {
    const scene = new THREE.Group();
    for (const name of ["hull", "faceplate", "tris"]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
      );
      mesh.name = name;
      scene.add(mesh);
    }

    expect(() => createStation(layout, { scene } as unknown as GLTF)).toThrow(
      /missing its "dock" node/,
    );
  });

  it("never uses lookAt and always applies polygonOffset", () => {
    // The module doc explains why lookAt is absent, so only executable source
    // may be scanned for the call.
    const code = stationSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).toContain("polygonOffset");
    expect(code).toContain("renderOrder");
    expect(code).not.toContain("lookAt(");
  });
});

const galaxy = JSON.parse(
  readFileSync(
    new URL("../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];

/** The layout of the first galaxy-0 system whose own station is this kind. */
function layoutOf(kind: StationKind): SystemLayout {
  const system = galaxy.find((entry) => entry.station === kind);
  if (system === undefined) throw new Error(`no ${kind} system in galaxy 0`);
  return deriveSystemLayout(system, stationSpecOf(kind));
}

/**
 * A synthetic model with one mesh per node of the kind's record, in the
 * record's order, optionally leaving one node out.
 */
function syntheticStation(kind: StationKind, omit?: string): GLTF {
  const scene = new THREE.Group();
  for (const node of stationRecord(kind).nodes) {
    if (node.name === omit) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    mesh.name = node.name;
    scene.add(mesh);
  }
  return { scene } as unknown as GLTF;
}

interface NodeExpectation {
  readonly renderOrder: number;
  readonly polygonOffset: boolean;
}

/**
 * The render settings each kind's nodes must carry, written from the plan (a
 * body node first with the offset, the detail nodes next, the dock last), not
 * read from the record under test.
 */
const EXPECTED_NODES: Readonly<
  Record<StationKind, Readonly<Record<string, NodeExpectation>>>
> = {
  coriolis: {
    hull: { renderOrder: 0, polygonOffset: true },
    faceplate: { renderOrder: 1, polygonOffset: false },
    tris: { renderOrder: 2, polygonOffset: false },
    dock: { renderOrder: 3, polygonOffset: false },
  },
  dodecahedron: {
    hull: { renderOrder: 0, polygonOffset: true },
    faceplate: { renderOrder: 1, polygonOffset: false },
    dock: { renderOrder: 2, polygonOffset: false },
  },
  icosahedron: {
    mainhull: { renderOrder: 0, polygonOffset: true },
    hull: { renderOrder: 1, polygonOffset: false },
    dock: { renderOrder: 2, polygonOffset: false },
  },
};

function meshesByName(station: StationBody): Map<string, THREE.Mesh> {
  const byName = new Map<string, THREE.Mesh>();
  station.root.traverse((object) => {
    if (isMesh(object)) byName.set(object.name, object);
  });
  return byName;
}

describe.each(STATION_KINDS)("createStation for the %s kind", (kind) => {
  const kindLayout = layoutOf(kind);
  const expected = EXPECTED_NODES[kind];

  it("builds from exactly that kind's nodes and draws each with its layer's settings", () => {
    const station = createStation(kindLayout, syntheticStation(kind));
    const byName = meshesByName(station);

    expect([...byName.keys()].sort()).toEqual(Object.keys(expected).sort());
    for (const [name, want] of Object.entries(expected)) {
      const mesh = byName.get(name);
      const material = mesh?.material as THREE.MeshStandardMaterial | undefined;
      expect(mesh?.renderOrder, `${name} renderOrder`).toBe(want.renderOrder);
      expect(material?.depthWrite, `${name} depthWrite`).toBe(true);
      expect(material?.polygonOffset, `${name} polygonOffset`).toBe(
        want.polygonOffset,
      );
      if (want.polygonOffset) {
        expect(material?.polygonOffsetFactor).toBe(1);
        expect(material?.polygonOffsetUnits).toBe(1);
      }
    }
    expect(
      (byName.get("dock")?.material as THREE.Material | undefined)?.depthTest,
    ).toBe(true);
  });

  it("publishes the attached model's kind and finds its dock node", () => {
    const station = createStation(kindLayout, syntheticStation(kind));
    expect(station.modelKind).toBe(kind);
    expect(station.dock.name).toBe("dock");
    expect(station.root.getObjectByName("dock")).toBe(station.dock);
  });

  it.each(stationRecord(kind).nodes.map((node) => node.name))(
    "throws an error naming the kind and the node when the %s node is missing",
    (name) => {
      expect(() =>
        createStation(kindLayout, syntheticStation(kind, name)),
      ).toThrow(
        new RegExp(`the ${kind} station model is missing its "${name}" node`),
      );
    },
  );

  it("draws no flasher (deferred, owner decision D-C; todo 2026-11-27-station-flashers)", () => {
    // Tripwire: when flashers are implemented this must change together with
    // the todo `2026-11-27-station-flashers` and its FIDELITY.md row.
    const station = createStation(kindLayout, syntheticStation(kind));
    const names: string[] = [];
    let drawn = 0;
    station.root.traverse((object) => {
      names.push(object.name);
      if (
        isMesh(object) ||
        object.type === "Sprite" ||
        object.type === "Points"
      )
        drawn += 1;
    });
    expect(names.filter((name) => /flasher/i.test(name))).toEqual([]);
    expect(drawn).toBe(stationRecord(kind).nodes.length);
  });
});

describe("createStation without a model", () => {
  it("builds the pose, the roll and an empty dock node, with no mesh and no model kind", () => {
    const kindLayout = layoutOf("icosahedron");
    const station = createStation(kindLayout);

    expect(station.modelKind).toBeUndefined();
    expect(meshesByName(station).size).toBe(0);
    expect(station.dock.name).toBe("dock");
    expect(station.dock.type).toBe("Object3D");
    expect(station.dock.position.toArray()).toEqual([
      0,
      0,
      -kindLayout.dockOffset,
    ]);
    expect(station.root.quaternion.w).toBeCloseTo(
      kindLayout.stationBaseQuat.w,
      12,
    );
    station.update(0.5);
    const rolled = mul(kindLayout.stationBaseQuat, axisAngle(0, 0, 1, 0.5));
    expect(station.root.quaternion.x).toBeCloseTo(rolled.x, 12);
    expect(station.root.quaternion.w).toBeCloseTo(rolled.w, 12);
  });

  it("attaches its own kind's model exactly once and then reports that kind", () => {
    const kindLayout = layoutOf("dodecahedron");
    const station = createStation(kindLayout);
    const gltf = syntheticStation("dodecahedron");
    station.attachModel(gltf);

    expect(station.modelKind).toBe("dodecahedron");
    expect(meshesByName(station).size).toBe(3);
    expect(station.dock.name).toBe("dock");
    expect(station.dock.type).toBe("Mesh");
    // The placeholder is gone: exactly one dock node under the root.
    const docks: THREE.Object3D[] = [];
    station.root.traverse((object) => {
      if (object.name === "dock") docks.push(object);
    });
    expect(docks).toHaveLength(1);

    // A second attach adds nothing.
    station.attachModel(syntheticStation("dodecahedron"));
    expect(meshesByName(station).size).toBe(3);
    expect(station.root.children).toHaveLength(1);
  });

  it("clones nothing and allocates no material when attached after dispose()", () => {
    const station = createStation(layoutOf("icosahedron"));
    station.dispose();
    station.attachModel(syntheticStation("icosahedron"));

    expect(station.modelKind).toBeUndefined();
    expect(meshesByName(station).size).toBe(0);
  });

  it("refuses a model that lacks a node of its kind and stays meshless", () => {
    const station = createStation(layoutOf("icosahedron"));
    expect(() => {
      station.attachModel(syntheticStation("icosahedron", "mainhull"));
    }).toThrow(/icosahedron station model is missing its "mainhull" node/);
    expect(station.modelKind).toBeUndefined();
    expect(station.dock.type).toBe("Object3D");
  });
});
