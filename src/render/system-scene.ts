// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * One system's scene (WORLD-02, Pattern 3).
 *
 * The factory owns every resource it creates (planet geometry/material, sun,
 * starfield, the cloned station and ship materials) and disposes exactly those.
 * The shared GLB geometries and textures belong to `AssetCache` and must
 * survive a scene swap.
 *
 * The camera is created at the origin with orientation only: `sync.ts` writes
 * every body's `position` through `cameraRelative()`, and the camera itself
 * never translates. The vertical FOV is Oolite's `fov-value` default of 57.2
 * degrees (research Open Question 4, adopted by this plan).
 */

import * as THREE from "three";
import type { System } from "../content/types.js";
import type { SystemLayout } from "../sim/world/layout.js";
import type { AssetCache } from "./asset-cache.js";
import { createPlanet } from "./bodies/planet.js";
import type { PlanetBody } from "./bodies/planet.js";
import { createShip } from "./bodies/ship.js";
import { createStation, disposeClonedMaterials } from "./bodies/station.js";
import { createSun } from "./bodies/sun.js";
import { createStarfield } from "./precision-scene.js";

/** Oolite's default vertical field of view (Universe.m). */
export const CAMERA_FOV_DEGREES = 57.2;
export const CAMERA_NEAR = 0.5;
export const CAMERA_FAR = 2_500_000;

export interface SystemScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  planet: PlanetBody;
  sun: THREE.Mesh;
  starfield: THREE.Points;
  station: THREE.Group;
  ship: THREE.Group;
  dispose(): void;
}

function disposeGeometryAndMaterials(object: THREE.Mesh | THREE.Points): void {
  object.geometry.dispose();
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  for (const material of materials) material.dispose();
}

export function createSystemScene(
  layout: SystemLayout,
  assets: AssetCache,
  system: System,
): SystemScene {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    1,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  camera.position.set(0, 0, 0);

  const planet = createPlanet(
    system,
    layout.planet.radius,
    layout.sunDir,
    layout.rotationSpeed,
  );
  const sun = createSun(layout);
  // The interim starfield is borrowed from the Phase 1 precision scene; plan 03
  // replaces it with `createSystemStarfield` and deletes that module.
  const starfield = createStarfield();
  const station = createStation(layout, assets.coriolis());
  const ship = createShip(assets.cobra());

  // One key light from the planet toward the sun, plus the authored ambient
  // floor. No shadows and no post-processing.
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(
    layout.sunDir.x * 1_000,
    layout.sunDir.y * 1_000,
    layout.sunDir.z * 1_000,
  );
  const ambient = new THREE.AmbientLight(0xffffff, 0.1);

  scene.add(light, ambient, planet.mesh, sun, starfield, station, ship);

  return {
    scene,
    camera,
    planet,
    sun,
    starfield,
    station,
    ship,
    dispose(): void {
      disposeGeometryAndMaterials(planet.mesh);
      disposeGeometryAndMaterials(sun);
      disposeGeometryAndMaterials(starfield);
      disposeClonedMaterials(station);
      disposeClonedMaterials(ship);
      scene.clear();
    },
  };
}
