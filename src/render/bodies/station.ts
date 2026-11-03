// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Coriolis station (WORLD-02, Pitfall 2, Fidelity correction 3).
 *
 * The Phase 2 GLB already separates the four coplanar layers (`hull`,
 * `faceplate`, `tris`, `dock`) and already carries the dock translation at local
 * `-500.2561`; re-adding either would double the offset. This module assembles
 * the clone without touching a node transform:
 *
 * - the hull is pushed back with `polygonOffset` 1/1 and the layers get an
 *   explicit `renderOrder` (hull -> faceplate -> tris -> dock), so the dock
 *   opening does not zipper at 500 m or at 100 km;
 * - every opaque node keeps `depthWrite: true` and the dock keeps
 *   `depthTest: true` (never `depthTest: false` on the one node that must be
 *   visible through the slot);
 * - the baked textures are never modified; presentation tuning is
 *   `emissiveIntensity` only.
 *
 * Orientation: `layout.stationBaseQuat` maps the model's local -Z (the dock)
 * onto `stationToPlanet`, then `update(stationAngle)` rolls about local +Z.
 * `Object3D.lookAt()` is deliberately absent — it aims local +Z at the target
 * and would put the dock on the far side of the station.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { axisAngle, mul } from "../../sim/math.js";
import type { Quat } from "../../sim/math.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import { isMesh, meshMaterials } from "../mesh.js";

/** Render order: hull, then the raised layers, then the dock. */
const NODE_ORDER: Readonly<Record<string, number>> = {
  hull: 0,
  faceplate: 1,
  tris: 2,
  dock: 3,
};

/** The node names the pinned GLB contract guarantees (tests/e2e/models.spec). */
const NODE_NAMES = ["hull", "faceplate", "tris", "dock"] as const;

/** Start value for the baked emissive maps; tuned without touching the PNGs. */
const EMISSIVE_INTENSITY = 0.8;

/** The GPU-facing station: the root, the dock node and the roll step. */
export interface StationBody {
  readonly root: THREE.Group;
  readonly dock: THREE.Object3D;
  update(stationAngle: number): void;
  dispose(): void;
}

/** Clone every material so this scene owns what it disposes. */
export function cloneMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
  });
}

/** Dispose only the cloned materials; geometries and textures stay cached. */
export function disposeClonedMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    for (const material of meshMaterials(object)) material.dispose();
  });
}

function requireNode(model: THREE.Object3D, name: string): THREE.Object3D {
  const node = model.getObjectByName(name);
  if (node === undefined) {
    throw new Error(
      `Wegolite: the Coriolis model is missing its "${name}" node; the dock contract cannot be honoured.`,
    );
  }
  return node;
}

export function createStation(layout: SystemLayout, gltf: GLTF): StationBody {
  const root = new THREE.Group();
  root.name = "station";

  const model = gltf.scene.clone(true);

  // Fail loudly on a silent asset change rather than moving the dock.
  for (const name of NODE_NAMES) requireNode(model, name);
  const dock = requireNode(model, "dock");

  // Clone first: every material tweak below must land on this scene's copy, not
  // on the cached GLB the menu scene still uses.
  cloneMaterials(model);

  model.traverse((object) => {
    if (!isMesh(object)) return;
    const order = NODE_ORDER[object.name];
    if (order !== undefined) object.renderOrder = order;

    for (const material of meshMaterials(object)) {
      material.depthWrite = true;
      if (object.name === "dock") material.depthTest = true;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = EMISSIVE_INTENSITY;
      }
    }
  });

  // Push the hull back a hair; the dock sits only 0.2561 m outside it.
  model.traverse((object) => {
    if (!isMesh(object) || object.name !== "hull") return;
    for (const material of meshMaterials(object)) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    }
  });

  const base: Quat = layout.stationBaseQuat;
  root.quaternion.set(base.x, base.y, base.z, base.w);
  root.add(model);

  return {
    root,
    dock,
    update(stationAngle: number): void {
      const rolled = mul(
        layout.stationBaseQuat,
        axisAngle(0, 0, 1, stationAngle),
      );
      root.quaternion.set(rolled.x, rolled.y, rolled.z, rolled.w);
    },
    dispose(): void {
      disposeClonedMaterials(root);
    },
  };
}
