// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Small render-side mesh helpers.
 *
 * `instanceof THREE.Mesh` narrows a *generic* class to `Mesh<any, any, any>`,
 * which the type-aware lint rules correctly treat as unsafe. A user-defined type
 * predicate names the default instantiation once, so every caller gets a
 * properly typed mesh instead of repeating a cast or silencing a rule.
 */

import * as THREE from "three";

/** True when the object is a mesh, narrowing to the default instantiation. */
export function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh;
}

/**
 * True when the object is a point cloud, narrowing to the default
 * instantiation. Same reason as `isMesh`: `instanceof` alone narrows to
 * `Points<any, any>`, which the type-aware rules reject.
 */
export function isPoints(object: THREE.Object3D): object is THREE.Points {
  return object instanceof THREE.Points;
}

/** A mesh's material as an array, whether the GLB authored one or several. */
export function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}
