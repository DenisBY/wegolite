// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * One system's scene (WORLD-02, WORLD-04, Pattern 3).
 *
 * **Disposal contract.** The factory owns every resource it creates (planet
 * geometry/material, sun and corona, starfield, dust, the beacon markers) and
 * the *cloned* materials of the station and ship. It does **not** own the
 * cached GLB geometries, materials or textures — those belong to `AssetCache`
 * and must survive a scene swap. A blind `traverse(dispose)` over a cloned GLB
 * is therefore forbidden: it would destroy the shared cache and turn the next
 * system (and the menu Cobra) black.
 *
 * The registry is an explicit `Disposable[]`, not a traversal. `dispose()` is
 * idempotent and safe on a half-built scene: if a body constructor throws, the
 * catch disposes what was already built and rethrows the named error.
 *
 * The camera is created at the origin with orientation only: `sync.ts` writes
 * every body's `position` through `cameraRelative()`, and the camera itself
 * never translates. The vertical FOV is Oolite's `fov-value` default of 57.2
 * degrees (research Open Question 4, adopted by this plan).
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { System } from "../content/types.js";
import type { Vec3 } from "../sim/math.js";
import type { SystemLayout } from "../sim/world/layout.js";
import type { AssetCache } from "./asset-cache.js";
import { createBeacon } from "./bodies/beacon.js";
import { createDust } from "./bodies/dust.js";
import type { Dust } from "./bodies/dust.js";
import { createPlanet } from "./bodies/planet.js";
import type { PlanetBody } from "./bodies/planet.js";
import { createShip } from "./bodies/ship.js";
import { createStation, disposeClonedMaterials } from "./bodies/station.js";
import type { StationBody } from "./bodies/station.js";
import { createSystemStarfield } from "./bodies/starfield.js";
import { createSun } from "./bodies/sun.js";
import type { SunBody } from "./bodies/sun.js";
import { isMesh, isPoints, materialList, meshMaterials } from "./mesh.js";

/** Oolite's default vertical field of view (Universe.m). */
export const CAMERA_FOV_DEGREES = 57.2;
export const CAMERA_NEAR = 0.5;
export const CAMERA_FAR = 2_500_000;

/** A GPU resource the scene created and must release. */
export interface Disposable {
  dispose(): void;
}

/**
 * An idempotent, explicit disposal registry.
 *
 * `dispose()` detaches the list before iterating, so a re-entrant call cannot
 * double-free and a throwing disposer cannot strand the rest. The first error
 * is rethrown after every registered resource has been released.
 */
export interface Disposer {
  readonly disposed: boolean;
  readonly size: number;
  add(...items: Disposable[]): void;
  dispose(): void;
}

export function createDisposer(initial: readonly Disposable[] = []): Disposer {
  const items = [...initial];
  let disposed = false;

  return {
    get disposed(): boolean {
      return disposed;
    },
    get size(): number {
      return items.length;
    },
    add(...next: Disposable[]): void {
      // A disposed registry must not accept a resource it can never free; the
      // half-built path adds only before the catch runs.
      if (disposed) return;
      items.push(...next);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const pending = items.splice(0, items.length);
      let firstError: unknown;
      for (const item of pending) {
        try {
          item.dispose();
        } catch (error) {
          firstError ??= error;
        }
      }
      if (firstError !== undefined) {
        // Preserve the original error when it is one; a thrown primitive still
        // reaches the caller as an Error rather than an opaque value.
        throw firstError instanceof Error
          ? firstError
          : new Error("Wegolite: a scene disposer threw a non-Error value.");
      }
    },
  };
}

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
  /** D-04: camera-local speed dust; `sync.ts`/the session feed it the camera delta. */
  dust: Dust;
  dispose(): void;
}

/** The already-built bodies that make up one system scene. */
export interface SystemSceneParts {
  planet: PlanetBody;
  sun: SunBody;
  starfield: THREE.Points;
  station: StationBody;
  ship: THREE.Group;
  navBuoy: THREE.Group;
  witchpoint: THREE.Group;
  dust: Dust;
}

/**
 * The body factories, injectable so the Node disposal test can prove the
 * half-built path (a throwing constructor) without a WebGL context.
 */
export interface SystemSceneFactories {
  planet(
    system: System,
    radius: number,
    sunDir: Vec3,
    rotationSpeed: number,
  ): PlanetBody;
  sun(
    system: System,
    radius: number,
    color: readonly [number, number, number, number],
  ): SunBody;
  starfield(
    count: number,
    seed: string,
    tint: readonly [number, number, number],
  ): THREE.Points;
  station(layout: SystemLayout, gltf: GLTF): StationBody;
  ship(gltf: GLTF): THREE.Group;
  beacon(radius: number): THREE.Group;
  dust(): Dust;
}

const REAL_FACTORIES: SystemSceneFactories = {
  planet: createPlanet,
  sun: createSun,
  starfield: createSystemStarfield,
  station: createStation,
  ship: createShip,
  beacon: createBeacon,
  dust: () => createDust(),
};

/** Dispose a beacon's own geometry and materials (never a shared asset). */
function disposeBeaconResources(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (isMesh(object)) {
      object.geometry.dispose();
      for (const material of meshMaterials(object)) material.dispose();
      return;
    }
    if (isPoints(object)) {
      object.geometry.dispose();
      for (const material of materialList(object.material)) material.dispose();
    }
  });
}

function disposePlanet(planet: PlanetBody): Disposable {
  return {
    dispose(): void {
      planet.mesh.geometry.dispose();
      planet.material.dispose();
    },
  };
}

function disposeStarfield(starfield: THREE.Points): Disposable {
  return {
    dispose(): void {
      starfield.geometry.dispose();
      for (const material of materialList(starfield.material)) {
        material.dispose();
      }
    },
  };
}

/** Only the clone's materials; the cached geometry and textures stay alive. */
function disposeShipClone(ship: THREE.Group): Disposable {
  return {
    dispose(): void {
      disposeClonedMaterials(ship);
    },
  };
}

function disposeBeacon(root: THREE.Object3D): Disposable {
  return {
    dispose(): void {
      disposeBeaconResources(root);
    },
  };
}

function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    1,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
  camera.position.set(0, 0, 0);
  return camera;
}

/**
 * Wire already-built bodies into a scene with an explicit disposal registry.
 *
 * Assembly is separate from construction so the registry can be tested with
 * recording doubles and so the half-built path in `createSystemScene` can share
 * the exact same disposers.
 */
export function assembleSystemScene(
  parts: SystemSceneParts,
  sunDir: Vec3,
  scene: THREE.Scene = new THREE.Scene(),
  camera: THREE.PerspectiveCamera = createCamera(),
): SystemScene {
  // One key light from the planet toward the sun, plus the authored ambient
  // floor. No shadows and no post-processing. Lights hold no GPU resources, so
  // `scene.clear()` is all they need.
  const light = new THREE.DirectionalLight(0xffffff, 2.5);
  light.position.set(sunDir.x * 1_000, sunDir.y * 1_000, sunDir.z * 1_000);
  const ambient = new THREE.AmbientLight(0xffffff, 0.1);

  scene.add(
    light,
    ambient,
    parts.planet.mesh,
    parts.sun.sun,
    parts.sun.corona,
    parts.starfield,
    parts.station.root,
    parts.ship,
    parts.navBuoy,
    parts.witchpoint,
    parts.dust.object,
  );

  const disposer = createDisposer([
    disposePlanet(parts.planet),
    parts.sun,
    disposeStarfield(parts.starfield),
    parts.station,
    disposeShipClone(parts.ship),
    disposeBeacon(parts.navBuoy),
    disposeBeacon(parts.witchpoint),
    parts.dust,
  ]);

  return {
    scene,
    camera,
    planet: parts.planet,
    sun: parts.sun,
    starfield: parts.starfield,
    station: parts.station,
    navBuoy: parts.navBuoy,
    witchpoint: parts.witchpoint,
    ship: parts.ship,
    dust: parts.dust,
    dispose(): void {
      disposer.dispose();
      scene.clear();
    },
  };
}

/**
 * Build one system's scene.
 *
 * @param factories Partial overrides for tests; production uses the real body
 * factories. A throwing override exercises the half-built cleanup path.
 */
export function createSystemScene(
  layout: SystemLayout,
  assets: AssetCache,
  system: System,
  factories: Partial<SystemSceneFactories> = {},
): SystemScene {
  const f: SystemSceneFactories = { ...REAL_FACTORIES, ...factories };
  const scene = new THREE.Scene();
  const camera = createCamera();

  // Register each body as it is built, so a constructor that throws halfway
  // still releases everything created before it.
  const built = createDisposer();

  try {
    const planet = f.planet(
      system,
      layout.planet.radius,
      layout.sunDir,
      layout.rotationSpeed,
    );
    built.add(disposePlanet(planet));

    const sun = f.sun(system, layout.sun.radius, system.sun_color);
    built.add(sun);

    // The starfield is sized and tinted from the same record: the exact authored
    // `sky_n_stars`, seeded by `random_seed`, tinted by `sun_color`.
    const starfield = f.starfield(system.sky_n_stars, system.random_seed, [
      system.sun_color[0],
      system.sun_color[1],
      system.sun_color[2],
    ]);
    built.add(disposeStarfield(starfield));

    const station = f.station(layout, assets.coriolis());
    built.add(station);
    const ship = f.ship(assets.cobra());
    built.add(disposeShipClone(ship));
    const dust = f.dust();
    built.add(dust);

    // D-04: a nav buoy in front of the dock and the witchpoint beacon at the
    // arrival point. Procedural markers, no new asset.
    const navBuoy = f.beacon(layout.navBuoy.radius);
    navBuoy.name = "navBuoy";
    built.add(disposeBeacon(navBuoy));
    const witchpoint = f.beacon(layout.witchpoint.radius);
    witchpoint.name = "witchpoint";
    built.add(disposeBeacon(witchpoint));

    return assembleSystemScene(
      { planet, sun, starfield, station, ship, navBuoy, witchpoint, dust },
      layout.sunDir,
      scene,
      camera,
    );
  } catch (error) {
    built.dispose();
    scene.clear();
    throw error;
  }
}
