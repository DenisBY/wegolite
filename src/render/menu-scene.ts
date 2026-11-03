// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The title/menu scene (D-09, Pattern 3).
 *
 * A starfield and a slowly presented Cobra Mk III, built once and swapped in
 * through the same build -> swap -> dispose path as a system scene. It owns
 * only what it creates: the starfield geometry/material and the cloned Cobra
 * materials. The cached GLB geometries and textures stay with `AssetCache`.
 *
 * This module is deliberately **not** wired here: `src/app/scene-manager.ts` is
 * plan 09's file and `SceneManager.enterMenu()` is this factory's single caller.
 * Building it in plan 03 keeps the scene work together while leaving the swap
 * policy with the lifecycle owner.
 */

import * as THREE from "three";
import type { AssetCache } from "./asset-cache.js";
import { cameraRelative } from "./camera-relative.js";
import { createShip } from "./bodies/ship.js";
import { disposeClonedMaterials } from "./bodies/station.js";
import { createSystemStarfield } from "./bodies/starfield.js";
import { CAMERA_FAR, CAMERA_FOV_DEGREES, CAMERA_NEAR } from "./system-scene.js";

/** Menu stars: far fewer than a system, because there is no scale cue. */
const MENU_STAR_COUNT = 1200;

/** Where the Cobra sits relative to the menu camera, in metres. */
const MENU_SHIP_WORLD = { x: 0, y: 0, z: -250 };

export interface MenuScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  dispose(): void;
}

export function createMenuScene(assets: AssetCache): MenuScene {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    1,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  camera.position.set(0, 0, 0);

  const starfield = createSystemStarfield(MENU_STAR_COUNT, "menu", [1, 1, 1]);

  const ship = createShip(assets.cobra());
  ship.visible = true;
  // The one world -> render conversion; the menu camera is at the origin.
  const relative = cameraRelative(MENU_SHIP_WORLD, { x: 0, y: 0, z: 0 });
  ship.position.set(relative.x, relative.y, relative.z);

  scene.add(new THREE.AmbientLight(0xffffff, 1), starfield, ship);

  return {
    scene,
    camera,
    dispose(): void {
      starfield.geometry.dispose();
      starfield.material.dispose();
      disposeClonedMaterials(ship);
      scene.clear();
    },
  };
}
