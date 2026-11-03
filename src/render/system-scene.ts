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
import { createBeacon } from "./bodies/beacon.js";
import { createPlanet } from "./bodies/planet.js";
import type { PlanetBody } from "./bodies/planet.js";
import { createShip } from "./bodies/ship.js";
import { createStation, disposeClonedMaterials } from "./bodies/station.js";
import type { StationBody } from "./bodies/station.js";
import { createSystemStarfield } from "./bodies/starfield.js";
import { createSun } from "./bodies/sun.js";
import type { SunBody } from "./bodies/sun.js";
import { isMesh, isPoints, meshMaterials } from "./mesh.js";

/** Oolite's default vertical field of view (Universe.m). */
export const CAMERA_FOV_DEGREES = 57.2;
export const CAMERA_NEAR = 0.5;
export const CAMERA_FAR = 2_500_000;

export interface SystemScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  planet: PlanetBody;
  sun: SunBody;
  starfield: THREE.Points;
  station: StationBody;
  navBuoy: THREE.Group;
  witchpoint: THREE.Group;
  ship: THREE.Group;
  dispose(): void;
}

/** Dispose a beacon's own geometry and materials (never a shared asset). */
function disposeBeacon(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (isMesh(object)) {
      object.geometry.dispose();
      for (const material of meshMaterials(object)) material.dispose();
      return;
    }
    if (isPoints(object)) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    }
  });
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
  const sun = createSun(system, layout.sun.radius, system.sun_color);
  // The starfield is sized and tinted from the same record: the exact authored
  // `sky_n_stars`, seeded by `random_seed`, tinted by `sun_color`.
  const starfield = createSystemStarfield(
    system.sky_n_stars,
    system.random_seed,
    [system.sun_color[0], system.sun_color[1], system.sun_color[2]],
  );
  const station = createStation(layout, assets.coriolis());
  const ship = createShip(assets.cobra());

  // D-04: a nav buoy in front of the dock and the witchpoint beacon at the
  // arrival point. Procedural markers, no new asset.
  const navBuoy = createBeacon(layout.navBuoy.radius);
  navBuoy.name = "navBuoy";
  const witchpoint = createBeacon(layout.witchpoint.radius);
  witchpoint.name = "witchpoint";

  // One key light from the planet toward the sun, plus the authored ambient
  // floor. No shadows and no post-processing.
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(
    layout.sunDir.x * 1_000,
    layout.sunDir.y * 1_000,
    layout.sunDir.z * 1_000,
  );
  const ambient = new THREE.AmbientLight(0xffffff, 0.1);

  scene.add(
    light,
    ambient,
    planet.mesh,
    sun.sun,
    sun.corona,
    starfield,
    station.root,
    ship,
    navBuoy,
    witchpoint,
  );

  return {
    scene,
    camera,
    planet,
    sun,
    starfield,
    station,
    navBuoy,
    witchpoint,
    ship,
    dispose(): void {
      disposeGeometryAndMaterials(planet.mesh);
      sun.dispose();
      disposeGeometryAndMaterials(starfield);
      station.dispose();
      disposeClonedMaterials(ship);
      disposeBeacon(navBuoy);
      disposeBeacon(witchpoint);
      scene.clear();
    },
  };
}
