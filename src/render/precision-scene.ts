// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import * as THREE from "three";

/** Roughly 100 km: the near proof object. */
export const NEAR_M = 1e5;

/** 1.4e6 m: beyond the comfortable float32 range, the far proof object. */
export const FAR_M = 1.4e6;

export interface PrecisionScene {
  scene: THREE.Scene;
  nearBox: THREE.Mesh;
  /** In this task the near box stands in; the distinct far body arrives with task 3. */
  farMarker: THREE.Mesh;
}

/**
 * Placeholder geometry only (D-07). Positions are WORLD positions; `src/main.ts`
 * converts them through `cameraRelative` — this module never writes
 * `Object3D.position`.
 *
 * No ShaderMaterial: a custom shader would have to include the logarithmic
 * depth chunks by hand.
 */
export function createPrecisionScene(): PrecisionScene {
  const scene = new THREE.Scene();

  const nearBox = new THREE.Mesh(
    new THREE.BoxGeometry(500, 500, 500),
    new THREE.MeshStandardMaterial({ color: 0x22ff88 }),
  );
  nearBox.name = "near-box";
  scene.add(nearBox);

  // The far marker beyond the sub-pixel limit arrives with task 3; until then
  // the near box stands in so the probe shape is already stable.
  return { scene, nearBox, farMarker: nearBox };
}
