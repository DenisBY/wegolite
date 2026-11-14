// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The instanced NPC layer (Phase 12, plan 12-11; WORLD-15, drawing half).
 *
 * Node only, no WebGL context: a model is a Group with Mesh children, and an
 * InstancedMesh is an Object3D whose matrices Three computes on the CPU. The
 * rows prove what the browser spec of plan 12-12 relies on: one InstancedMesh
 * per (model, primitive) that shares the cached geometry and material, matrices
 * that are camera-relative in float64 before the float32 write, a fixed
 * capacity, and a dispose that frees only the instance buffers.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { cameraRelative } from "../../src/render/camera-relative.js";
import {
  createNpcLayer,
  NPC_INSTANCE_CAPACITY,
} from "../../src/render/bodies/npc-ships.js";
import type { NpcContact } from "../../src/sim/world/contacts.js";
import { MAX_ENTITIES } from "../../src/sim/world/ids.js";

interface Synthetic {
  readonly gltf: GLTF;
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly materials: readonly THREE.Material[];
}

/** One Group with two Mesh children; the second is offset inside the model. */
function syntheticModel(): Synthetic {
  const scene = new THREE.Group();
  const geometries = [
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.BoxGeometry(2, 2, 2),
  ];
  const materials = [
    new THREE.MeshStandardMaterial(),
    new THREE.MeshStandardMaterial(),
  ];
  const first = new THREE.Mesh(geometries[0], materials[0]);
  const second = new THREE.Mesh(geometries[1], materials[1]);
  second.position.set(0, 3, 0);
  scene.add(first, second);
  return { gltf: { scene } as unknown as GLTF, geometries, materials };
}

function contact(
  x: number,
  specKey = "viper",
  orientation = { w: 1, x: 0, y: 0, z: 0 },
): NpcContact {
  return {
    position: { x, y: 0, z: 0 },
    orientation,
    radius: 10,
    specKey,
    kind: "neutral",
  };
}

function instancedMeshes(root: THREE.Object3D): THREE.InstancedMesh[] {
  return root.children.filter(
    (child): child is THREE.InstancedMesh =>
      child instanceof THREE.InstancedMesh,
  );
}

/** The translation part of instance `index` of `mesh`. */
function translationOf(
  mesh: THREE.InstancedMesh,
  index: number,
): THREE.Vector3 {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

const ORIGIN = { x: 0, y: 0, z: 0 };

describe("NPC_INSTANCE_CAPACITY", () => {
  it("equals the sim's entity cap (the render layer may not import the id module)", () => {
    expect(NPC_INSTANCE_CAPACITY).toBe(MAX_ENTITIES);
    expect(NPC_INSTANCE_CAPACITY).toBe(256);
  });
});

describe("createNpcLayer", () => {
  it("starts with a root group and no meshes", () => {
    const layer = createNpcLayer();
    expect(layer.root).toBeInstanceOf(THREE.Group);
    expect(layer.root.children).toHaveLength(0);
  });

  it("builds one InstancedMesh per primitive that shares the cached geometry and material", () => {
    const model = syntheticModel();
    const layer = createNpcLayer();
    layer.update(
      [contact(100), contact(200), contact(300)],
      ORIGIN,
      new Map([["viper", model.gltf]]),
    );

    const meshes = instancedMeshes(layer.root);
    expect(meshes).toHaveLength(2);
    expect(meshes[0]?.geometry).toBe(model.geometries[0]);
    expect(meshes[0]?.material).toBe(model.materials[0]);
    expect(meshes[1]?.geometry).toBe(model.geometries[1]);
    expect(meshes[1]?.material).toBe(model.materials[1]);
    for (const mesh of meshes) {
      expect(mesh.count).toBe(3);
      expect(mesh.visible).toBe(true);
      expect(mesh.frustumCulled).toBe(false);
      expect(mesh.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
      expect(mesh.instanceMatrix.count).toBe(NPC_INSTANCE_CAPACITY);
    }
  });

  it("writes camera-relative translations composed with the primitive's local matrix", () => {
    const model = syntheticModel();
    const layer = createNpcLayer();
    const camera = { x: 1_000_000.25, y: -40, z: 7 };
    const contacts = [
      {
        ...contact(1_000_100.5),
        position: { x: 1_000_100.5, y: 12, z: -3 },
      },
    ];
    layer.update(contacts, camera, new Map([["viper", model.gltf]]));

    const [first, second] = instancedMeshes(layer.root);
    if (first === undefined || second === undefined) throw new Error("no mesh");
    const delta = cameraRelative(contacts[0]?.position ?? ORIGIN, camera);
    const base = translationOf(first, 0);
    expect(base.x).toBeCloseTo(delta.x, 4);
    expect(base.y).toBeCloseTo(delta.y, 4);
    expect(base.z).toBeCloseTo(delta.z, 4);
    // The second primitive sits 3 m above the model origin in its own frame.
    const offset = translationOf(second, 0);
    expect(offset.x).toBeCloseTo(delta.x, 4);
    expect(offset.y).toBeCloseTo(delta.y + 3, 4);
    expect(offset.z).toBeCloseTo(delta.z, 4);
  });

  it("applies the contact's orientation to the primitive offset", () => {
    const model = syntheticModel();
    const layer = createNpcLayer();
    // A quarter turn about +Z takes the +Y offset to -X.
    const half = Math.SQRT1_2;
    layer.update(
      [contact(0, "viper", { w: half, x: 0, y: 0, z: half })],
      ORIGIN,
      new Map([["viper", model.gltf]]),
    );
    const second = instancedMeshes(layer.root)[1];
    if (second === undefined) throw new Error("no mesh");
    const offset = translationOf(second, 0);
    expect(offset.x).toBeCloseTo(-3, 6);
    expect(offset.y).toBeCloseTo(0, 6);
  });

  it("creates nothing for a key whose model is not loaded", () => {
    const layer = createNpcLayer();
    layer.update([contact(10, "viper")], ORIGIN, new Map());
    expect(layer.root.children).toHaveLength(0);
  });

  it("groups contacts by key, in input order, and hides a key that left the list", () => {
    const viper = syntheticModel();
    const adder = syntheticModel();
    const layer = createNpcLayer();
    const models = new Map([
      ["viper", viper.gltf],
      ["adder", adder.gltf],
    ]);
    layer.update(
      [contact(10, "viper"), contact(20, "adder"), contact(30, "viper")],
      ORIGIN,
      models,
    );
    const meshes = instancedMeshes(layer.root);
    expect(meshes).toHaveLength(4);
    const viperMeshes = meshes.filter(
      (m) => m.geometry === viper.geometries[0],
    );
    expect(viperMeshes).toHaveLength(1);
    expect(viperMeshes[0]?.count).toBe(2);
    expect(translationOf(viperMeshes[0] as THREE.InstancedMesh, 0).x).toBe(10);
    expect(translationOf(viperMeshes[0] as THREE.InstancedMesh, 1).x).toBe(30);

    layer.update([contact(20, "adder")], ORIGIN, models);
    for (const mesh of meshes) {
      const isViper =
        mesh.geometry === viper.geometries[0] ||
        mesh.geometry === viper.geometries[1];
      expect(mesh.count).toBe(isViper ? 0 : 1);
      expect(mesh.visible).toBe(!isViper);
    }
  });

  it("draws only the first NPC_INSTANCE_CAPACITY contacts of a key and never throws", () => {
    const model = syntheticModel();
    const layer = createNpcLayer();
    const many = Array.from({ length: NPC_INSTANCE_CAPACITY + 5 }, (_, index) =>
      contact(index),
    );
    expect(() => {
      layer.update(many, ORIGIN, new Map([["viper", model.gltf]]));
    }).not.toThrow();
    for (const mesh of instancedMeshes(layer.root)) {
      expect(mesh.count).toBe(NPC_INSTANCE_CAPACITY);
    }
    const first = instancedMeshes(layer.root)[0] as THREE.InstancedMesh;
    expect(translationOf(first, NPC_INSTANCE_CAPACITY - 1).x).toBe(
      NPC_INSTANCE_CAPACITY - 1,
    );
  });

  it("disposes its instance buffers and never the shared geometry or material", () => {
    const model = syntheticModel();
    const layer = createNpcLayer();
    layer.update([contact(1)], ORIGIN, new Map([["viper", model.gltf]]));
    const meshes = instancedMeshes(layer.root);
    const meshSpies = meshes.map((mesh) => vi.spyOn(mesh, "dispose"));
    const sharedSpies = [
      ...model.geometries.map((geometry) => vi.spyOn(geometry, "dispose")),
      ...model.materials.map((material) => vi.spyOn(material, "dispose")),
    ];

    layer.dispose();

    for (const spy of meshSpies) expect(spy).toHaveBeenCalledTimes(1);
    for (const spy of sharedSpies) expect(spy).not.toHaveBeenCalled();
    expect(layer.root.children).toHaveLength(0);
    // Idempotent.
    expect(() => {
      layer.dispose();
    }).not.toThrow();
    for (const spy of meshSpies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
