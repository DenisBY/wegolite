// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * One system's scene (WORLD-02, WORLD-04, Pattern 3).
 *
 * **Disposal contract.** The factory owns every resource it creates (planet
 * geometry/material, sun and corona, starfield, dust, the beacon markers, the
 * NPC layer's instance buffers, the shot and explosion layers) and
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
 * never translates. The projection follows Oolite's frustum rule in
 * `src/render/viewport.ts` (quick task 261117-o8q replaced the Phase 3 vertical
 * field of view).
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { System } from "../content/types.js";
import type { GraphicsQuality } from "../settings/schema.js";
import type { Vec3 } from "../sim/math.js";
import type { SystemLayout } from "../sim/world/layout.js";
import type { AssetCache } from "./asset-cache.js";
import { createBuoy } from "./bodies/buoy.js";
import type { BuoyBody, BuoyRole } from "./bodies/buoy.js";
import { createDust } from "./bodies/dust.js";
import { createDebrisLayer } from "./bodies/debris.js";
import type { DebrisLayer } from "./bodies/debris.js";
import { createExplosionLayer } from "./bodies/explosions.js";
import type { ExplosionLayer } from "./bodies/explosions.js";
import { createNebulae } from "./bodies/nebulae.js";
import type { NebulaBody } from "./bodies/nebulae.js";
import { createLaserShotLayer } from "./bodies/laser-shots.js";
import type { LaserShotLayer } from "./bodies/laser-shots.js";
import { createNpcLayer } from "./bodies/npc-ships.js";
import type { NpcLayer } from "./bodies/npc-ships.js";
import type { Dust } from "./bodies/dust.js";
import { createPlanet } from "./bodies/planet.js";
import type { PlanetBody } from "./bodies/planet.js";
import { createShip } from "./bodies/ship.js";
import { createStation, disposeClonedMaterials } from "./bodies/station.js";
import type { StationBody } from "./bodies/station.js";
import { createSystemStarfield } from "./bodies/starfield.js";
import { createSun } from "./bodies/sun.js";
import type { SunBody } from "./bodies/sun.js";
import { ambientIntensityFor, DISPLAY_SUN_INTENSITY } from "./exposure.js";
import { materialList } from "./mesh.js";
import { viewFovYDegrees } from "./viewport.js";

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
  /**
   * Attach the model of this system's own station kind to a body that was built
   * meshless because the model was still loading. Adds it exactly once and does
   * nothing after `dispose()`.
   */
  attachStationModel(gltf: GLTF): void;
  navBuoy: THREE.Group;
  witchpoint: THREE.Group;
  /** Both buoys, for the per-frame tumble and flasher update. */
  buoys: readonly BuoyBody[];
  ship: THREE.Group;
  /** D-04: camera-local speed dust; `sync.ts`/the session feed it the camera delta. */
  dust: Dust;
  /**
   * The inert NPC ships (WORLD-15): an instanced layer the render driver feeds
   * id-free contacts each frame. Owned and disposed by this scene, so a jump
   * clears it by construction.
   */
  npcs: NpcLayer;
  /**
   * The drawn debris (WORLD-17): pods, plates and wrecks as an instanced layer
   * the render driver feeds id-free debris contacts each frame. Owned and
   * disposed by this scene, like `npcs`, so a jump or a Load clears it.
   */
  debris: DebrisLayer;
  /**
   * The drawn laser shots (CBT-05): one camera-facing ribbon mesh over a fixed
   * pool, fed by `laserFired` events and updated each frame. Owned and
   * disposed by this scene, like `npcs`.
   */
  shots: LaserShotLayer;
  /**
   * The drawn ship explosions (WORLD-17): two instanced objects over a fixed
   * pool, fed by `shipDestroyed` events and updated each frame. Owned and
   * disposed by this scene, like `shots`, so a jump or a Load clears it.
   */
  explosions: ExplosionLayer;
  /** The sky nebulae, present only at `high` quality. */
  nebulae?: NebulaBody;
  dispose(): void;
}

/** The already-built bodies that make up one system scene. */
export interface SystemSceneParts {
  planet: PlanetBody;
  sun: SunBody;
  starfield: THREE.Points;
  station: StationBody;
  ship: THREE.Group;
  navBuoy: BuoyBody;
  witchpoint: BuoyBody;
  dust: Dust;
  npcs: NpcLayer;
  debris: DebrisLayer;
  shots: LaserShotLayer;
  explosions: ExplosionLayer;
  nebulae?: NebulaBody;
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
    quality: GraphicsQuality,
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
  station(layout: SystemLayout, gltf: GLTF | undefined): StationBody;
  ship(gltf: GLTF): THREE.Group;
  buoy(gltf: GLTF, role: BuoyRole): BuoyBody;
  dust(): Dust;
  npcs(): NpcLayer;
  debris(): DebrisLayer;
  shots(): LaserShotLayer;
  explosions(): ExplosionLayer;
  nebulae(count: number, seed: string): NebulaBody;
}

const REAL_FACTORIES: SystemSceneFactories = {
  planet: createPlanet,
  sun: createSun,
  starfield: createSystemStarfield,
  station: createStation,
  ship: createShip,
  buoy: createBuoy,
  dust: () => createDust(),
  npcs: () => createNpcLayer(),
  debris: () => createDebrisLayer(),
  shots: () => createLaserShotLayer(),
  explosions: () => createExplosionLayer(),
  nebulae: (count, seed) => createNebulae(count, seed),
};

function disposePlanet(planet: PlanetBody): Disposable {
  return {
    dispose(): void {
      planet.mesh.geometry.dispose();
      planet.material.dispose();
      // The High-quality shell is a child of the planet mesh.
      planet.atmosphere?.geometry.dispose();
      planet.atmosphere?.material.dispose();
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

function createCamera(): THREE.PerspectiveCamera {
  // `applyViewport` overwrites the aspect and field of view before the first
  // frame; the constructor uses the same rule at its aspect of 1.
  const camera = new THREE.PerspectiveCamera(
    viewFovYDegrees(1, "flight"),
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
  ambientLevel: number,
  scene: THREE.Scene = new THREE.Scene(),
  camera: THREE.PerspectiveCamera = createCamera(),
): SystemScene {
  // The pair below is the scene's *only* light, calibrated in
  // `src/render/exposure.ts`: one derived sun intensity so a mean lit Coriolis
  // face displays Oolite's 190/255, and `pi * ambient_level` so the additive
  // ambient term is `albedo * ambient_level` exactly. No shadows and no
  // post-processing. The planet deliberately ignores both lights — its own
  // shader owns the terminator and the authored ambient tint.
  const light = new THREE.DirectionalLight(0xffffff, DISPLAY_SUN_INTENSITY);
  light.position.set(sunDir.x * 1_000, sunDir.y * 1_000, sunDir.z * 1_000);
  const ambient = new THREE.AmbientLight(
    0xffffff,
    ambientIntensityFor(ambientLevel),
  );

  scene.add(
    light,
    ambient,
    parts.planet.mesh,
    parts.sun.sun,
    parts.sun.corona,
    parts.starfield,
    parts.station.root,
    parts.ship,
    parts.navBuoy.root,
    parts.witchpoint.root,
    parts.dust.object,
    parts.npcs.root,
    parts.debris.root,
    parts.shots.root,
    parts.explosions.root,
  );
  if (parts.nebulae !== undefined) scene.add(parts.nebulae.object);

  const disposer = createDisposer([
    disposePlanet(parts.planet),
    parts.sun,
    disposeStarfield(parts.starfield),
    parts.station,
    disposeShipClone(parts.ship),
    parts.navBuoy,
    parts.witchpoint,
    parts.dust,
    // Only the instance buffers: the cached NPC geometry and materials stay.
    parts.npcs,
    // Only the instance buffers: the cached debris geometry and materials stay.
    parts.debris,
    // The shot layer owns its geometry and material outright.
    parts.shots,
    // The explosion layer owns its geometry, materials and loaded textures.
    parts.explosions,
    ...(parts.nebulae === undefined ? [] : [parts.nebulae]),
  ]);

  return {
    scene,
    camera,
    planet: parts.planet,
    sun: parts.sun,
    starfield: parts.starfield,
    station: parts.station,
    attachStationModel(gltf: GLTF): void {
      parts.station.attachModel(gltf);
    },
    navBuoy: parts.navBuoy.root,
    witchpoint: parts.witchpoint.root,
    buoys: [parts.navBuoy, parts.witchpoint],
    ship: parts.ship,
    dust: parts.dust,
    npcs: parts.npcs,
    debris: parts.debris,
    shots: parts.shots,
    explosions: parts.explosions,
    ...(parts.nebulae === undefined ? {} : { nebulae: parts.nebulae }),
    dispose(): void {
      disposer.dispose();
      scene.clear();
    },
  };
}

/**
 * Build one system's scene.
 *
 * The station model has two failure policies, by when it is available (review
 * IN-06). Already cached: the body is assembled inside this call, so a GLB that
 * lacks a node of the kind's record throws here, after the half-built scene is
 * disposed, and the caller (a boot, a Load or a hyperspace arrival) reports the
 * failure on its own surface. Still loading: the body is built meshless, and a
 * failed load or a bad GLB is logged once by the late attach and leaves the
 * station undrawn while the session keeps running (T-22.1-25). The difference
 * is deliberate and neither path falls back to another kind's model: a station
 * is drawn from its own record or not at all, and a content defect fails by
 * name.
 *
 * @param factories Partial overrides for tests; production uses the real body
 * factories. A throwing override exercises the half-built cleanup path.
 */
export function createSystemScene(
  layout: SystemLayout,
  assets: AssetCache,
  system: System,
  factories: Partial<SystemSceneFactories> = {},
  quality: GraphicsQuality = "standard",
): SystemScene {
  const f: SystemSceneFactories = { ...REAL_FACTORIES, ...factories };
  const scene = new THREE.Scene();
  const camera = createCamera();

  // Register each body as it is built, so a constructor that throws halfway
  // still releases everything created before it.
  const built = createDisposer();
  let stationModel: GLTF | undefined;

  try {
    const planet = f.planet(
      system,
      layout.planet.radius,
      layout.sunDir,
      layout.rotationSpeed,
      quality,
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

    // This system's own station model (Phase 22.1): the cache holds it, or the
    // body is built meshless and the model attaches when its load resolves.
    stationModel = assets.station(system.station);
    const station = f.station(layout, stationModel);
    built.add(station);
    const ship = f.ship(assets.cobra());
    built.add(disposeShipClone(ship));
    const dust = f.dust();
    built.add(dust);
    const npcs = f.npcs();
    built.add(npcs);
    const debris = f.debris();
    built.add(debris);
    const shots = f.shots();
    built.add(shots);
    const explosions = f.explosions();
    built.add(explosions);

    // A navigation buoy in front of the dock and one at the witchpoint, as in
    // Oolite: one shared model, two sets of flasher lights.
    const navBuoy = f.buoy(assets.buoy(), "buoy");
    navBuoy.root.name = "navBuoy";
    built.add(navBuoy);
    const witchpoint = f.buoy(assets.buoy(), "buoy-witchpoint");
    witchpoint.root.name = "witchpoint";
    built.add(witchpoint);

    // High only: `sky_n_blurs` nebula quads behind everything else.
    const nebulae =
      quality === "high"
        ? f.nebulae(system.sky_n_blurs, system.random_seed)
        : undefined;
    if (nebulae !== undefined) built.add(nebulae);

    const assembled = assembleSystemScene(
      {
        planet,
        sun,
        starfield,
        station,
        ship,
        navBuoy,
        witchpoint,
        dust,
        npcs,
        debris,
        shots,
        explosions,
        ...(nebulae === undefined ? {} : { nebulae }),
      },
      layout.sunDir,
      system.ambient_level,
      scene,
      camera,
    );
    if (stationModel === undefined) {
      // The cache owns the loaded GLB; the scene only attaches a clone, and
      // only while it is alive (`attachStationModel` is a no-op after dispose).
      // A rejection (a failed load, or a GLB missing a node of the kind's
      // record) is logged once and leaves the station undrawn; the session
      // keeps running (T-22.1-25).
      assets
        .loadStation(system.station)
        .then((gltf) => {
          assembled.attachStationModel(gltf);
        })
        .catch((error: unknown) => {
          console.error(
            `Wegolite: the ${system.station} station model could not be drawn; the station stays undrawn`,
            error,
          );
        });
    }
    return assembled;
  } catch (error) {
    built.dispose();
    scene.clear();
    throw error;
  }
}
