// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's Cobra Mk III (Pattern 3, A1).
 *
 * The GLB's nose is local -Z after the Phase 2 conversion, matching the ship
 * basis, so the root only needs the state's orientation. The mesh is hidden in
 * first-person flight (the camera sits ~12.5 m behind the nose, inside the
 * hull); the launch cinematic that shows it is plan 07's.
 *
 * Materials are cloned for the same ownership reason as the station.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { cloneMaterials } from "./station.js";

export function createShip(gltf: GLTF): THREE.Group {
  const root = new THREE.Group();
  root.name = "ship";

  const model = gltf.scene.clone(true);
  cloneMaterials(model);
  root.add(model);

  // First-person by default; the session shows it for the scripted exit.
  root.visible = false;
  return root;
}
