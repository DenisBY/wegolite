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

import { createStation } from "../../src/render/bodies/station.js";
import { isMesh } from "../../src/render/mesh.js";
import { axisAngle, mul } from "../../src/sim/math.js";
import { laveFixture } from "../helpers/lave.js";

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

function syntheticCoriolis(): GLTF {
  const scene = new THREE.Group();
  for (const name of ["hull", "faceplate", "tris", "dock"]) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    mesh.name = name;
    scene.add(mesh);
  }
  return { scene } as unknown as GLTF;
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
    expect(layout.station.radius).toBe(500);
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
