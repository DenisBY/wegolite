// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Coriolis station (WORLD-02, Pitfall 2).
 *
 * The Phase 2 GLB already separates the four coplanar layers (`hull`,
 * `faceplate`, `tris`, `dock`) and already carries the dock translation at local
 * `-500.2561`; re-adding either would double the offset. The hull is pushed back
 * with `polygonOffset` and the layers get an explicit `renderOrder` so the dock
 * opening does not zipper at long range.
 *
 * The root's orientation is the station base quaternion (local -Z aimed at the
 * planet) composed with the roll about local +Z; `sync.ts` owns the per-frame
 * update. Materials are cloned so a scene can dispose its own copies while the
 * cached GLB stays alive.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import { isMesh, meshMaterials } from "../mesh.js";

/** Render order: hull, then the raised layers, then the dock. */
const NODE_ORDER: Readonly<Record<string, number>> = {
  hull: 0,
  faceplate: 1,
  tris: 2,
  dock: 3,
};

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

export function createStation(layout: SystemLayout, gltf: GLTF): THREE.Group {
  const root = new THREE.Group();
  root.name = "station";

  const model = gltf.scene.clone(true);
  model.traverse((object) => {
    if (!isMesh(object)) return;
    const order = NODE_ORDER[object.name];
    if (order !== undefined) object.renderOrder = order;
  });
  cloneMaterials(model);

  // Push the hull back a hair; the dock sits only 0.2561 m outside it.
  model.traverse((object) => {
    if (!isMesh(object) || object.name !== "hull") return;
    for (const material of meshMaterials(object)) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = 1;
      material.polygonOffsetUnits = 1;
    }
  });

  const base = layout.stationBaseQuat;
  root.quaternion.set(base.x, base.y, base.z, base.w);
  root.add(model);
  return root;
}
