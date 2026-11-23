// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The instanced debris layer (Phase 16, plan 16-08; WORLD-17, debris half of
 * success criterion 3).
 *
 * Node only, no WebGL context: a model is a Group with Mesh children, and an
 * InstancedMesh is an Object3D whose matrices Three computes on the CPU. The
 * rows prove what the browser proof of plan 16-09 relies on: one InstancedMesh
 * per (model, primitive) however many pieces exist, the cached geometry and
 * material shared, camera-relative matrices with the wreck scale, a fixed
 * capacity equal to the entity cap, and a dispose that frees only the instance
 * buffers.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { cameraRelative } from "../../src/render/camera-relative.js";
import {
  createDebrisLayer,
  DEBRIS_INSTANCE_CAPACITY,
  tumbleOrientation,
} from "../../src/render/bodies/debris.js";
import type { DebrisModelInfo } from "../../src/render/bodies/debris.js";
import { axisAngle, mul, normalize } from "../../src/sim/math.js";
import type { Quat } from "../../src/sim/math.js";
import type { DebrisContact } from "../../src/sim/world/contacts.js";
import { MAX_ENTITIES } from "../../src/sim/world/ids.js";

interface Synthetic {
  readonly gltf: GLTF;
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly materials: readonly THREE.Material[];
}

/** A Group with `primitives` Mesh children; the second sits 3 m up. */
function syntheticModel(primitives = 1): Synthetic {
  const scene = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  for (let index = 0; index < primitives; index += 1) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 3 * index, 0);
    scene.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  }
  return { gltf: { scene } as unknown as GLTF, geometries, materials };
}

const IDENTITY: Quat = { w: 1, x: 0, y: 0, z: 0 };

/** The stock catalogue's shape: a pod, a plate and two wrecks. */
const INFO: readonly DebrisModelInfo[] = [
  { key: "barrel", radius: 4, maxFlightRoll: 0, maxFlightPitch: 0 },
  { key: "alloy", radius: 3, maxFlightRoll: 0, maxFlightPitch: 0 },
  { key: "wreck1", radius: 20, maxFlightRoll: 0, maxFlightPitch: 0 },
  { key: "wreck2", radius: 25, maxFlightRoll: 0, maxFlightPitch: 0 },
];

function piece(
  x: number,
  specKey = "barrel",
  radius = 4,
  orientation: Quat = IDENTITY,
): DebrisContact {
  return {
    position: { x, y: 0, z: 0 },
    orientation,
    radius,
    specKey,
    velocity: { x: 0, y: 0, z: 0 },
  };
}

function instancedMeshes(root: THREE.Object3D): THREE.InstancedMesh[] {
  return root.children.filter(
    (child): child is THREE.InstancedMesh =>
      child instanceof THREE.InstancedMesh,
  );
}

function matrixOf(mesh: THREE.InstancedMesh, index: number): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}

function translationOf(
  mesh: THREE.InstancedMesh,
  index: number,
): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixPosition(matrixOf(mesh, index));
}

function scaleOf(mesh: THREE.InstancedMesh, index: number): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixScale(matrixOf(mesh, index));
}

const ORIGIN = { x: 0, y: 0, z: 0 };

describe("DEBRIS_INSTANCE_CAPACITY", () => {
  it("equals the sim's entity cap (the render layer may not import the id module)", () => {
    expect(DEBRIS_INSTANCE_CAPACITY).toBe(MAX_ENTITIES);
    expect(DEBRIS_INSTANCE_CAPACITY).toBe(256);
  });
});

describe("createDebrisLayer", () => {
  it("starts with a root group and no meshes", () => {
    const layer = createDebrisLayer();
    expect(layer.root).toBeInstanceOf(THREE.Group);
    expect(layer.root.name).toBe("debris");
    expect(layer.root.children).toHaveLength(0);
  });

  it("builds one InstancedMesh per primitive that shares the cached geometry and material", () => {
    const model = syntheticModel(2);
    const layer = createDebrisLayer();
    layer.update(
      [piece(10), piece(20), piece(30)],
      ORIGIN,
      new Map([["barrel", model.gltf]]),
      INFO,
      0,
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
      expect(mesh.instanceMatrix.count).toBe(DEBRIS_INSTANCE_CAPACITY);
    }
  });

  it("draws 200 pods and 3 wrecks of two keys with one visible mesh per (model, primitive)", () => {
    const barrel = syntheticModel();
    const wreck1 = syntheticModel();
    const wreck2 = syntheticModel();
    const models = new Map([
      ["barrel", barrel.gltf],
      ["wreck1", wreck1.gltf],
      ["wreck2", wreck2.gltf],
    ]);
    const contacts = [
      ...Array.from({ length: 200 }, (_, index) => piece(index)),
      piece(1000, "wreck1", 40),
      piece(2000, "wreck2", 50),
      piece(3000, "wreck1", 30),
    ];
    const layer = createDebrisLayer();
    layer.update(contacts, ORIGIN, models, INFO, 0);
    const visible = instancedMeshes(layer.root).filter((mesh) => mesh.visible);
    // One primitive each: three draw objects, never one per piece.
    expect(visible).toHaveLength(3);
    const counts = visible.map((mesh) => mesh.count).sort((a, b) => a - b);
    expect(counts).toEqual([1, 2, 200]);
  });

  it("writes camera-relative translations composed with the primitive's local matrix", () => {
    const model = syntheticModel(2);
    const layer = createDebrisLayer();
    const camera = { x: 1_000_000.25, y: -40, z: 7 };
    const contacts = [
      { ...piece(0), position: { x: 1_000_100.5, y: 12, z: -3 } },
    ];
    layer.update(contacts, camera, new Map([["barrel", model.gltf]]), INFO, 0);
    const [first, second] = instancedMeshes(layer.root);
    if (first === undefined || second === undefined) throw new Error("no mesh");
    const delta = cameraRelative(contacts[0]?.position ?? ORIGIN, camera);
    const base = translationOf(first, 0);
    expect(base.x).toBeCloseTo(delta.x, 4);
    expect(base.y).toBeCloseTo(delta.y, 4);
    expect(base.z).toBeCloseTo(delta.z, 4);
    const offset = translationOf(second, 0);
    expect(offset.y).toBeCloseTo(delta.y + 3, 4);
  });

  it("scales each piece by its radius over its model's radius (a wreck's scale)", () => {
    const barrel = syntheticModel(2);
    const wreck = syntheticModel();
    const layer = createDebrisLayer();
    layer.update(
      [piece(0, "barrel", 4), piece(100, "wreck1", 50)],
      ORIGIN,
      new Map([
        ["barrel", barrel.gltf],
        ["wreck1", wreck.gltf],
      ]),
      INFO,
      0,
    );
    const meshes = instancedMeshes(layer.root);
    const [pod, podUpper] = meshes.filter(
      (mesh) =>
        mesh.geometry === barrel.geometries[0] ||
        mesh.geometry === barrel.geometries[1],
    );
    const wreckMesh = meshes.find(
      (mesh) => mesh.geometry === wreck.geometries[0],
    );
    if (
      pod === undefined ||
      podUpper === undefined ||
      wreckMesh === undefined
    ) {
      throw new Error("no mesh");
    }
    expect(scaleOf(pod, 0).x).toBeCloseTo(1, 6);
    expect(scaleOf(wreckMesh, 0).x).toBeCloseTo(2.5, 6);
    expect(scaleOf(wreckMesh, 0).y).toBeCloseTo(2.5, 6);
    expect(scaleOf(wreckMesh, 0).z).toBeCloseTo(2.5, 6);
    // The model-local offset is scaled with the piece.
    expect(translationOf(podUpper, 0).y).toBeCloseTo(3, 6);
  });

  it("skips a piece whose scale ratio is not finite and positive", () => {
    const model = syntheticModel();
    const layer = createDebrisLayer();
    layer.update(
      [piece(1, "barrel", 0), piece(2, "barrel", Number.NaN), piece(3)],
      ORIGIN,
      new Map([["barrel", model.gltf]]),
      INFO,
      0,
    );
    const [mesh] = instancedMeshes(layer.root);
    expect(mesh?.count).toBe(1);
    expect(translationOf(mesh as THREE.InstancedMesh, 0).x).toBe(3);
  });

  it("applies the contact's orientation to the primitive offset", () => {
    const model = syntheticModel(2);
    const layer = createDebrisLayer();
    const half = Math.SQRT1_2;
    layer.update(
      [piece(0, "barrel", 4, { w: half, x: 0, y: 0, z: half })],
      ORIGIN,
      new Map([["barrel", model.gltf]]),
      INFO,
      0,
    );
    const second = instancedMeshes(layer.root)[1];
    if (second === undefined) throw new Error("no mesh");
    const offset = translationOf(second, 0);
    expect(offset.x).toBeCloseTo(-3, 6);
    expect(offset.y).toBeCloseTo(0, 6);
  });

  it("draws nothing for a key whose model is not loaded or has no model info", () => {
    const model = syntheticModel();
    const layer = createDebrisLayer();
    layer.update([piece(1, "barrel")], ORIGIN, new Map(), INFO, 0);
    expect(layer.root.children).toHaveLength(0);
    layer.update(
      [piece(1, "mystery")],
      ORIGIN,
      new Map([["mystery", model.gltf]]),
      INFO,
      0,
    );
    expect(layer.root.children).toHaveLength(0);
  });

  it("hides a key that left the list", () => {
    const barrel = syntheticModel();
    const wreck = syntheticModel();
    const models = new Map([
      ["barrel", barrel.gltf],
      ["wreck1", wreck.gltf],
    ]);
    const layer = createDebrisLayer();
    layer.update([piece(1), piece(2, "wreck1", 20)], ORIGIN, models, INFO, 0);
    layer.update([piece(2, "wreck1", 20)], ORIGIN, models, INFO, 0);
    for (const mesh of instancedMeshes(layer.root)) {
      const isBarrel = mesh.geometry === barrel.geometries[0];
      expect(mesh.count).toBe(isBarrel ? 0 : 1);
      expect(mesh.visible).toBe(!isBarrel);
    }
  });

  it("draws only the first DEBRIS_INSTANCE_CAPACITY pieces of a key and never throws", () => {
    const model = syntheticModel();
    const layer = createDebrisLayer();
    const many = Array.from(
      { length: DEBRIS_INSTANCE_CAPACITY + 5 },
      (_, index) => piece(index),
    );
    expect(() => {
      layer.update(many, ORIGIN, new Map([["barrel", model.gltf]]), INFO, 0);
    }).not.toThrow();
    const [mesh] = instancedMeshes(layer.root);
    expect(mesh?.count).toBe(DEBRIS_INSTANCE_CAPACITY);
    expect(
      translationOf(mesh as THREE.InstancedMesh, DEBRIS_INSTANCE_CAPACITY - 1)
        .x,
    ).toBe(DEBRIS_INSTANCE_CAPACITY - 1);
  });

  it("disposes its instance buffers and never the shared geometry or material", () => {
    const model = syntheticModel(2);
    const layer = createDebrisLayer();
    layer.update(
      [piece(1)],
      ORIGIN,
      new Map([["barrel", model.gltf]]),
      INFO,
      0,
    );
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
    expect(() => {
      layer.dispose();
    }).not.toThrow();
    for (const spy of meshSpies) expect(spy).toHaveBeenCalledTimes(1);
    // An update after dispose does nothing.
    layer.update(
      [piece(1)],
      ORIGIN,
      new Map([["barrel", model.gltf]]),
      INFO,
      0,
    );
    expect(layer.root.children).toHaveLength(0);
  });
});

/** Synthetic rates, unequal so roll and pitch are told apart. */
const TUMBLING: DebrisModelInfo = {
  key: "barrel",
  radius: 4,
  maxFlightRoll: 2,
  maxFlightPitch: 1,
};

function expectQuatClose(actual: Quat, expected: Quat, digits = 10): void {
  expect(actual.w).toBeCloseTo(expected.w, digits);
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function norm(q: Quat): number {
  return Math.hypot(q.w, q.x, q.y, q.z);
}

const SKEW: Quat = normalize({ w: 0.7, x: 0.3, y: -0.5, z: 0.4 });

describe("tumbleOrientation (D-03, D16-10, OC-2)", () => {
  it("is the orientation itself at flight time 0", () => {
    expect(tumbleOrientation(SKEW, TUMBLING, 0)).toEqual(SKEW);
  });

  it("is a unit quaternion at any flight time", () => {
    for (const t of [0.01, 1, 17.3, 1_000, 123_456.789]) {
      expect(norm(tumbleOrientation(SKEW, TUMBLING, t))).toBeCloseTo(1, 12);
    }
  });

  it("does not turn with both rates zero", () => {
    const still = { ...TUMBLING, maxFlightRoll: 0, maxFlightPitch: 0 };
    for (const t of [0, 1, 50]) {
      expect(tumbleOrientation(SKEW, still, t)).toEqual(SKEW);
    }
  });

  it("returns the orientation for a non-finite time or rate", () => {
    expect(tumbleOrientation(SKEW, TUMBLING, Number.NaN)).toEqual(SKEW);
    expect(tumbleOrientation(SKEW, TUMBLING, Infinity)).toEqual(SKEW);
    expect(
      tumbleOrientation(SKEW, { ...TUMBLING, maxFlightRoll: Infinity }, 1),
    ).toEqual(SKEW);
  });

  it("rolls about the local z axis at max_flight_roll rad/s when q.x is 1", () => {
    const q: Quat = { w: 0, x: 1, y: 0, z: 0 };
    for (const t of [0.25, 1, 3]) {
      expectQuatClose(
        tumbleOrientation(q, TUMBLING, t),
        mul(q, axisAngle(0, 0, 1, TUMBLING.maxFlightRoll * t)),
      );
    }
  });

  it("pitches about the local x axis at max_flight_pitch rad/s when q.y is 1", () => {
    const q: Quat = { w: 0, x: 0, y: 1, z: 0 };
    expectQuatClose(
      tumbleOrientation(q, TUMBLING, 2),
      mul(q, axisAngle(1, 0, 0, TUMBLING.maxFlightPitch * 2)),
    );
  });

  it("turns at the constant body rate (pitch q.y, 0, roll q.x) in the body frame", () => {
    const wx = TUMBLING.maxFlightPitch * SKEW.y;
    const wz = TUMBLING.maxFlightRoll * SKEW.x;
    const rate = Math.hypot(wx, wz);
    const t = 4.5;
    expectQuatClose(
      tumbleOrientation(SKEW, TUMBLING, t),
      normalize(mul(SKEW, axisAngle(wx / rate, 0, wz / rate, rate * t))),
    );
  });

  it("tumbles two different orientations differently and the same one the same way", () => {
    const other: Quat = normalize({ w: 0.2, x: -0.6, y: 0.1, z: 0.77 });
    const a = tumbleOrientation(SKEW, TUMBLING, 3);
    const b = tumbleOrientation(other, TUMBLING, 3);
    // Relative rotation from the start differs between the two pieces.
    const turnA = mul({ w: SKEW.w, x: -SKEW.x, y: -SKEW.y, z: -SKEW.z }, a);
    const turnB = mul({ w: other.w, x: -other.x, y: -other.y, z: -other.z }, b);
    expect(
      Math.abs(turnA.w - turnB.w) + Math.abs(turnA.z - turnB.z),
    ).toBeGreaterThan(1e-3);
    expect(tumbleOrientation(SKEW, TUMBLING, 3)).toEqual(a);
  });
});

describe("createDebrisLayer tumble", () => {
  it("writes each instance's rotation as tumbleOrientation(orientation, info, flightTime)", () => {
    const model = syntheticModel();
    const layer = createDebrisLayer();
    const t = 2.75;
    layer.update(
      [piece(0, "barrel", 4, SKEW)],
      ORIGIN,
      new Map([["barrel", model.gltf]]),
      [TUMBLING],
      t,
    );
    const [mesh] = instancedMeshes(layer.root);
    if (mesh === undefined) throw new Error("no mesh");
    const rotation = new THREE.Quaternion();
    matrixOf(mesh, 0).decompose(
      new THREE.Vector3(),
      rotation,
      new THREE.Vector3(),
    );
    const expected = tumbleOrientation(SKEW, TUMBLING, t);
    // q and -q are the same rotation.
    const sign = Math.sign(rotation.w * expected.w || 1);
    expect(sign * rotation.w).toBeCloseTo(expected.w, 5);
    expect(sign * rotation.x).toBeCloseTo(expected.x, 5);
    expect(sign * rotation.y).toBeCloseTo(expected.y, 5);
    expect(sign * rotation.z).toBeCloseTo(expected.z, 5);
  });

  it("moves a piece's rotation with the flight time and returns to it for the same time", () => {
    const model = syntheticModel();
    const layer = createDebrisLayer();
    const models = new Map([["barrel", model.gltf]]);
    const at = (t: number): THREE.Matrix4 => {
      layer.update(
        [piece(0, "barrel", 4, SKEW)],
        ORIGIN,
        models,
        [TUMBLING],
        t,
      );
      const [mesh] = instancedMeshes(layer.root);
      if (mesh === undefined) throw new Error("no mesh");
      return matrixOf(mesh, 0);
    };
    const first = at(1);
    const later = at(2);
    expect(first.equals(later)).toBe(false);
    expect(at(1).equals(first)).toBe(true);
  });
});
