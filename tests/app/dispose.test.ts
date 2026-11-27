// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scene disposal contract (WORLD-04, T-3-22, T-3-24, Pitfall 11).
 *
 * Node only, no WebGL. Three's `dispose()` methods dispatch a `dispose` event
 * without touching a GPU, so recording those events is an honest double: it
 * proves *which* resources were freed, not merely that a call happened.
 *
 * Three claims are proved here:
 *
 * 1. a `SystemScene` frees exactly the resources it created and never a cached
 *    GLB geometry/material/texture (the ownership split);
 * 2. `AssetCache` is the single owner of the shared GLBs and frees each shared
 *    resource once, even though the GLB shares one material across many meshes;
 * 3. dispose is idempotent, and a half-built scene (a body constructor throws)
 *    frees what it built and rethrows the named error.
 *
 * `SceneManager.enterMenu()`/`enterSystem()` are exercised with a recording
 * renderer and a canvas stub, so the menu Cobra's "still textured after a swap"
 * truth fails if any scene frees a cache-owned texture.
 */

import { readFileSync } from "node:fs";

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { createSceneManager } from "../../src/app/scene-manager.js";
import type { SceneManager } from "../../src/app/scene-manager.js";
import { STATION_KINDS, stationRecord } from "../../src/content/stations.js";
import type { StationKind } from "../../src/content/stations.js";
import type { System } from "../../src/content/types.js";
import { createAssetCache } from "../../src/render/asset-cache.js";
import type { AssetCache } from "../../src/render/asset-cache.js";
import { createBuoy } from "../../src/render/bodies/buoy.js";
import type { BuoyBody } from "../../src/render/bodies/buoy.js";
import { createDust } from "../../src/render/bodies/dust.js";
import { createDebrisLayer } from "../../src/render/bodies/debris.js";
import type { DebrisLayer } from "../../src/render/bodies/debris.js";
import { createExplosionLayer } from "../../src/render/bodies/explosions.js";
import type { ExplosionLayer } from "../../src/render/bodies/explosions.js";
import { createLaserShotLayer } from "../../src/render/bodies/laser-shots.js";
import type { LaserShotLayer } from "../../src/render/bodies/laser-shots.js";
import { createNpcLayer } from "../../src/render/bodies/npc-ships.js";
import type { NpcLayer } from "../../src/render/bodies/npc-ships.js";
import { createPlanet } from "../../src/render/bodies/planet.js";
import { createShip } from "../../src/render/bodies/ship.js";
import { createStation } from "../../src/render/bodies/station.js";
import { createSystemStarfield } from "../../src/render/bodies/starfield.js";
import type { SunBody } from "../../src/render/bodies/sun.js";
import {
  ambientIntensityFor,
  DISPLAY_SUN_INTENSITY,
} from "../../src/render/exposure.js";
import { isMesh, materialList, meshMaterials } from "../../src/render/mesh.js";
import { createMenuScene } from "../../src/render/menu-scene.js";
import {
  assembleSystemScene,
  createDisposer,
  createSystemScene,
} from "../../src/render/system-scene.js";
import type {
  Disposable,
  SystemSceneFactories,
  SystemSceneParts,
} from "../../src/render/system-scene.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";
import { stationSpecOf } from "../helpers/stations.js";

const { system, stationDef, layout } = laveFixture();

/** Count the `dispose` events a Three resource emits from now on. */
function countDisposals(resource: Disposable): () => number {
  let count = 0;
  const dispatcher = resource as unknown as {
    addEventListener(type: string, listener: () => void): void;
  };
  dispatcher.addEventListener("dispose", () => {
    count += 1;
  });
  return () => count;
}

/** A model whose one material/texture/geometry is shared across its meshes. */
interface SyntheticModel {
  readonly gltf: GLTF;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  readonly texture: THREE.Texture;
}

function syntheticCoriolis(): SyntheticModel {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const scene = new THREE.Group();
  for (const name of ["hull", "faceplate", "tris", "dock"]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    scene.add(mesh);
  }
  return { gltf: { scene } as unknown as GLTF, geometry, material, texture };
}

function syntheticCobra(): SyntheticModel {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "cobra-hull";
  const scene = new THREE.Group();
  scene.add(mesh);
  return { gltf: { scene } as unknown as GLTF, geometry, material, texture };
}

/**
 * A buoy model with the `hull` and `core` nodes the buoy factory requires, and
 * one valid flasher light per role in the extras the build writes.
 */
function syntheticBuoy(): SyntheticModel {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const scene = new THREE.Group();
  for (const name of ["hull", "core"]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    scene.add(mesh);
  }
  const light = {
    position: [0, 0, 0.5],
    size: 1,
    frequency: 0.5,
    phase: 0,
    brightFraction: 0.5,
    colors: [[1, 1, 1]],
  };
  scene.userData = {
    oolite: {
      flashers: { buoy: [light], "buoy-witchpoint": [light] },
    },
  };
  return { gltf: { scene } as unknown as GLTF, geometry, material, texture };
}

/** Route a fake loader to the fake model for each cache path. */
function loaderFor(
  cobra: GLTF,
  coriolis: GLTF,
  buoy: GLTF,
): (url: string) => Promise<GLTF> {
  return (url) =>
    Promise.resolve(
      url.includes("cobra") ? cobra : url.includes("buoy") ? buoy : coriolis,
    );
}

/**
 * A cache stand-in whose `dispose` throws: if any scene ever calls it, the
 * ownership split is broken and the test fails at the call site.
 */
function guardCache(cobra: GLTF, coriolis: GLTF, buoy: GLTF): AssetCache {
  return {
    loadCobra: () => Promise.resolve(cobra),
    loadStation: () => Promise.resolve(coriolis),
    loadBuoy: () => Promise.resolve(buoy),
    loadNpcModel: () =>
      Promise.reject(
        new Error("a scene must never load NPC models through the guard cache"),
      ),
    cobra: () => cobra,
    station: () => coriolis,
    buoy: () => buoy,
    preload: () => Promise.resolve(),
    loaded: () => true,
    dispose: () => {
      throw new Error("a scene must never dispose the shared asset cache");
    },
  };
}

interface CanvasStub {
  restore(): void;
}

/**
 * `createSun()` draws its corona gradient into a 2D canvas. Node has no DOM, so
 * the test installs the smallest stub that satisfies `CanvasTexture`: no pixels
 * are read and nothing is uploaded.
 */
function installCanvasStub(): CanvasStub {
  const target = globalThis as unknown as { document?: unknown };
  const hadDocument = Object.hasOwn(target, "document");
  const previous = target.document;
  const gradient = { addColorStop: () => undefined };
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    createRadialGradient: () => gradient,
    fillRect: () => undefined,
  };
  target.document = {
    createElement: (tag: string) =>
      tag === "canvas"
        ? { width: 0, height: 0, getContext: () => context }
        : {},
  };
  return {
    restore(): void {
      if (hadDocument) target.document = previous;
      else delete target.document;
    },
  };
}

/**
 * A sun double that owns its own geometry: the scene must call `dispose()` once
 * and must never reach inside to free the disc itself.
 */
function fakeSun(): {
  body: SunBody;
  disposals: () => number;
  discGeometryDisposals: () => number;
} {
  const discGeometry = new THREE.SphereGeometry(1, 4, 2);
  const disc = new THREE.Mesh(discGeometry, new THREE.MeshBasicMaterial());
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial(),
  );
  let disposals = 0;
  const discGeometryDisposals = countDisposals(discGeometry);
  return {
    body: {
      sun: disc,
      corona,
      coronaRadius: 1,
      update: () => undefined,
      dispose: () => {
        disposals += 1;
      },
    },
    disposals: () => disposals,
    discGeometryDisposals,
  };
}

describe("the scene-owned disposable registry", () => {
  it("disposes only what was registered, and only once", () => {
    let firstCalls = 0;
    let secondCalls = 0;
    const disposer = createDisposer([
      {
        dispose: () => {
          firstCalls += 1;
        },
      },
      {
        dispose: () => {
          secondCalls += 1;
        },
      },
    ]);

    expect(disposer.size).toBe(2);
    expect(disposer.disposed).toBe(false);

    disposer.dispose();
    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(1);
    expect(disposer.disposed).toBe(true);
    expect(disposer.size).toBe(0);

    disposer.dispose();
    expect(firstCalls).toBe(1);
    expect(secondCalls).toBe(1);
  });

  it("releases the rest when one disposer throws, then rethrows the first error", () => {
    const calls: string[] = [];
    const disposer = createDisposer([
      {
        dispose: () => {
          calls.push("failing");
          throw new Error("boom");
        },
      },
      {
        dispose: () => {
          calls.push("survivor");
        },
      },
    ]);

    expect(() => {
      disposer.dispose();
    }).toThrow("boom");
    expect(calls).toEqual(["failing", "survivor"]);

    // A second call must not retry the throwing disposer.
    expect(() => {
      disposer.dispose();
    }).not.toThrow();
    expect(calls).toEqual(["failing", "survivor"]);
  });
});

describe("SystemScene owns only what it created", () => {
  interface Built {
    readonly parts: SystemSceneParts;
    readonly cached: SyntheticModel;
    readonly cachedBuoy: SyntheticModel;
    /** The NPC model the layer draws; its resources belong to the cache. */
    readonly cachedNpc: SyntheticModel;
    readonly npcs: NpcLayer;
    /** The debris model the layer draws; its resources belong to the cache. */
    readonly cachedDebris: SyntheticModel;
    readonly debris: DebrisLayer;
    readonly shots: LaserShotLayer;
    readonly sun: ReturnType<typeof fakeSun>;
    /** Scene-owned resources, each expected to be freed exactly once. */
    readonly sceneOwned: Record<string, () => number>;
  }

  function buildParts(): Built {
    const planet = createPlanet(
      system,
      layout.planet.radius,
      layout.sunDir,
      layout.rotationSpeed,
    );
    const starfield = createSystemStarfield(
      system.sky_n_stars,
      system.random_seed,
      [1, 1, 1],
    );
    const coriolis = syntheticCoriolis();
    const station = createStation(layout, coriolis.gltf);
    const cobra = syntheticCobra();
    const ship = createShip(cobra.gltf);
    const dust = createDust(64);
    const buoy = syntheticBuoy();
    const navBuoy = createBuoy(buoy.gltf, "buoy");
    navBuoy.root.name = "navBuoy";
    const witchpoint = createBuoy(buoy.gltf, "buoy-witchpoint");
    witchpoint.root.name = "witchpoint";
    const sun = fakeSun();
    // The NPC layer draws one cached model; only its instance buffers are the
    // scene's (WORLD-15).
    const cachedNpc = syntheticCobra();
    const npcs = createNpcLayer();
    npcs.update(
      [
        {
          position: { x: 10, y: 0, z: 0 },
          orientation: { w: 1, x: 0, y: 0, z: 0 },
          radius: 10,
          specKey: "viper",
          kind: "neutral",
        },
      ],
      { x: 0, y: 0, z: 0 },
      new Map([["viper", cachedNpc.gltf]]),
    );

    // The debris layer draws one cached model too; only its instance buffers
    // are the scene's (WORLD-17).
    const cachedDebris = syntheticCobra();
    const debris = createDebrisLayer();
    debris.update(
      [
        {
          position: { x: 20, y: 0, z: 0 },
          orientation: { w: 1, x: 0, y: 0, z: 0 },
          radius: 5,
          specKey: "barrel",
          velocity: { x: 0, y: 0, z: 0 },
        },
      ],
      { x: 0, y: 0, z: 0 },
      new Map([["barrel", cachedDebris.gltf]]),
      [{ key: "barrel", radius: 5, maxFlightRoll: 0.5, maxFlightPitch: 0.5 }],
      1,
    );

    // The shot layer owns its geometry and material outright (CBT-05).
    const shots = createLaserShotLayer();
    // So does the explosion layer (WORLD-17), with the textures it loaded on
    // its first explosion.
    const explosionTextures: THREE.Texture[] = [];
    const explosions = createExplosionLayer(() => {
      const texture = new THREE.Texture();
      explosionTextures.push(texture);
      return texture;
    }, "/");
    explosions.add(
      { x: 0, y: 0, z: -100 },
      10,
      {
        alpha: 0.85,
        brightness: 1,
        colorOrder: "rgb",
        count: 25,
        duration: 1.5,
        growthRate: 1.5,
        size: 2.5,
        spread: 1,
        texture: "oolite-particle-cloud2.png",
      },
      1,
    );

    const sceneOwned: Record<string, () => number> = {
      shotsGeometry: countDisposals(shots.root.geometry),
      shotsMaterial: countDisposals(shots.root.material),
      planetGeometry: countDisposals(planet.mesh.geometry),
      planetMaterial: countDisposals(planet.material),
      starfieldGeometry: countDisposals(starfield.geometry),
      dustGeometry: countDisposals(dust.object.geometry),
    };
    // The explosion layer: one shared quad, two materials, two textures.
    for (const [index, child] of explosions.root.children.entries()) {
      if (!(child instanceof THREE.Mesh)) continue;
      if (index === 0) {
        sceneOwned.explosionGeometry = countDisposals(
          child.geometry as THREE.BufferGeometry,
        );
      }
      sceneOwned[`explosionMaterial${String(index)}`] = countDisposals(
        child.material as THREE.Material,
      );
    }
    // The first explosion loaded the cloud and the flash texture.
    expect(explosionTextures).toHaveLength(2);
    for (const [index, texture] of explosionTextures.entries()) {
      sceneOwned[`explosionTexture${String(index)}`] = countDisposals(texture);
    }
    for (const [index, child] of npcs.root.children.entries()) {
      sceneOwned[`npcInstancedMesh${String(index)}`] = countDisposals(child);
    }
    for (const [index, child] of debris.root.children.entries()) {
      sceneOwned[`debrisInstancedMesh${String(index)}`] = countDisposals(child);
    }
    for (const [index, material] of materialList(
      dust.object.material,
    ).entries()) {
      sceneOwned[`dustMaterial${String(index)}`] = countDisposals(material);
    }
    for (const [index, material] of materialList(
      starfield.material,
    ).entries()) {
      sceneOwned[`starfieldMaterial${String(index)}`] =
        countDisposals(material);
    }

    /**
     * Count a buoy's own resources: the cloned materials of its model, its
     * flasher sprite materials, and the blob texture its sprites share. The
     * model's geometry and textures are cached and are not counted here.
     */
    const countBuoy = (prefix: string, buoy: BuoyBody): void => {
      let sprites = 0;
      buoy.root.traverse((object) => {
        if (isMesh(object)) {
          for (const [index, material] of meshMaterials(object).entries()) {
            sceneOwned[
              `${prefix}CloneMaterial${String(object.name)}${String(index)}`
            ] = countDisposals(material);
          }
        } else if (object instanceof THREE.Sprite) {
          sceneOwned[`${prefix}SpriteMaterial${String(sprites)}`] =
            countDisposals(object.material);
          const blob = object.material.map;
          if (blob !== null && sprites === 0) {
            sceneOwned[`${prefix}Blob`] = countDisposals(blob);
          }
          sprites += 1;
        }
      });
    };
    countBuoy("navBuoy", navBuoy);
    countBuoy("witchpoint", witchpoint);

    /**
     * Count only the *cloned* materials of a GLB body. Its geometry and its
     * material's textures are cached and must stay at zero.
     */
    const countCloneMaterials = (
      prefix: string,
      root: THREE.Object3D,
    ): void => {
      root.traverse((object) => {
        if (!isMesh(object)) return;
        for (const [index, material] of meshMaterials(object).entries()) {
          sceneOwned[`${prefix}Material${String(index)}`] =
            countDisposals(material);
        }
      });
    };
    countCloneMaterials("stationClone", station.root);
    countCloneMaterials("shipClone", ship);

    return {
      parts: {
        planet,
        sun: sun.body,
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
      },
      cached: coriolis,
      cachedBuoy: buoy,
      cachedNpc,
      npcs,
      cachedDebris,
      debris,
      shots,
      sun,
      sceneOwned,
    };
  }

  it("lights the scene with one calibrated directional and one ambient light", () => {
    const { parts } = buildParts();
    const scene = assembleSystemScene(
      parts,
      layout.sunDir,
      system.ambient_level,
    );

    const directional: THREE.DirectionalLight[] = [];
    const ambient: THREE.AmbientLight[] = [];
    scene.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight) directional.push(object);
      if (object instanceof THREE.AmbientLight) ambient.push(object);
    });

    // One contract, one light of each kind: a second directional would be a
    // second exposure scale for some body in the scene (T-3-33).
    expect(directional).toHaveLength(1);
    expect(ambient).toHaveLength(1);
    expect(directional[0]?.intensity).toBeCloseTo(DISPLAY_SUN_INTENSITY, 12);
    expect(ambient[0]?.intensity).toBeCloseTo(
      ambientIntensityFor(system.ambient_level),
      12,
    );
    expect(ambient[0]?.intensity).toBeCloseTo(Math.PI * 0.1, 12);

    scene.dispose();
  });

  it("frees scene resources once and never a cached GLB resource", () => {
    const {
      parts,
      cached,
      cachedBuoy,
      cachedNpc,
      npcs,
      cachedDebris,
      debris,
      sun,
      sceneOwned,
    } = buildParts();
    expect(npcs.root.children).toHaveLength(1);
    expect(debris.root.children).toHaveLength(1);
    const debrisMaterialDisposals = countDisposals(cachedDebris.material);
    const debrisTextureDisposals = countDisposals(cachedDebris.texture);
    const debrisGeometryDisposals = countDisposals(cachedDebris.geometry);
    const cachedMaterialDisposals = countDisposals(cached.material);
    const cachedTextureDisposals = countDisposals(cached.texture);
    const cachedGeometryDisposals = countDisposals(cached.geometry);
    const buoyMaterialDisposals = countDisposals(cachedBuoy.material);
    const buoyTextureDisposals = countDisposals(cachedBuoy.texture);
    const buoyGeometryDisposals = countDisposals(cachedBuoy.geometry);
    const npcMaterialDisposals = countDisposals(cachedNpc.material);
    const npcTextureDisposals = countDisposals(cachedNpc.texture);
    const npcGeometryDisposals = countDisposals(cachedNpc.geometry);

    const scene = assembleSystemScene(
      parts,
      layout.sunDir,
      system.ambient_level,
    );
    scene.dispose();

    // Scene-owned resources: exactly one disposal each.
    for (const [name, count] of Object.entries(sceneOwned)) {
      expect(count(), name).toBe(1);
    }
    expect(sun.disposals()).toBe(1);
    // The sun owns its own geometry; the scene must not reach inside it.
    expect(sun.discGeometryDisposals()).toBe(0);

    // Cache-owned resources: untouched, even though a clone references them.
    expect(cachedMaterialDisposals()).toBe(0);
    expect(cachedTextureDisposals()).toBe(0);
    expect(cachedGeometryDisposals()).toBe(0);
    expect(buoyMaterialDisposals()).toBe(0);
    expect(buoyTextureDisposals()).toBe(0);
    expect(buoyGeometryDisposals()).toBe(0);
    // The NPC layer drew the cached model and freed only its instance buffers.
    expect(npcMaterialDisposals()).toBe(0);
    expect(npcTextureDisposals()).toBe(0);
    expect(npcGeometryDisposals()).toBe(0);
    expect(npcs.root.children).toHaveLength(0);
    // So did the debris layer (WORLD-17).
    expect(debrisMaterialDisposals()).toBe(0);
    expect(debrisTextureDisposals()).toBe(0);
    expect(debrisGeometryDisposals()).toBe(0);
    expect(debris.root.children).toHaveLength(0);

    expect(scene.scene.children).toHaveLength(0);

    // Idempotent: a second dispose adds nothing.
    scene.dispose();
    for (const [name, count] of Object.entries(sceneOwned)) {
      expect(count(), name).toBe(1);
    }
    expect(sun.disposals()).toBe(1);
    expect(cachedMaterialDisposals()).toBe(0);
    expect(cachedTextureDisposals()).toBe(0);
    expect(cachedGeometryDisposals()).toBe(0);
    expect(buoyMaterialDisposals()).toBe(0);
    expect(buoyTextureDisposals()).toBe(0);
    expect(buoyGeometryDisposals()).toBe(0);
  });

  it("disposes a half-built scene and rethrows the named error", () => {
    const coriolis = syntheticCoriolis();
    const cobra = syntheticCobra();
    const planetGeometry = new THREE.SphereGeometry(1, 4, 2);
    const planetMaterial = new THREE.ShaderMaterial();
    const planet = {
      mesh: new THREE.Mesh(planetGeometry, planetMaterial),
      material: planetMaterial,
      update: () => undefined,
    };
    const planetGeometryDisposals = countDisposals(planetGeometry);
    const planetMaterialDisposals = countDisposals(planetMaterial);
    const cobraMaterialDisposals = countDisposals(cobra.material);
    const coriolisMaterialDisposals = countDisposals(coriolis.material);

    const factories: Partial<SystemSceneFactories> = {
      planet: () => planet,
      sun: () => {
        throw new Error(
          "Wegolite: the sun radius must be positive and finite (received 0).",
        );
      },
    };

    expect(() =>
      createSystemScene(
        layout,
        guardCache(cobra.gltf, coriolis.gltf, syntheticBuoy().gltf),
        system,
        factories,
      ),
    ).toThrow("the sun radius must be positive and finite");

    expect(planetGeometryDisposals()).toBe(1);
    expect(planetMaterialDisposals()).toBe(1);
    // The shared GLBs were never even requested, so nothing cached was freed.
    expect(cobraMaterialDisposals()).toBe(0);
    expect(coriolisMaterialDisposals()).toBe(0);
  });

  it("owns the NPC layer: exposes it, adds its root and disposes it, also when half built (WORLD-15)", () => {
    let disposals = 0;
    const root = new THREE.Group();
    const layer: NpcLayer = {
      root,
      update: () => undefined,
      dispose: () => {
        disposals += 1;
      },
    };
    const common: Partial<SystemSceneFactories> = {
      sun: () => fakeSun().body,
      npcs: () => layer,
    };
    const cache = guardCache(
      syntheticCobra().gltf,
      syntheticCoriolis().gltf,
      syntheticBuoy().gltf,
    );

    const scene = createSystemScene(layout, cache, system, common);
    expect(scene.npcs).toBe(layer);
    expect(scene.scene.children).toContain(root);
    scene.dispose();
    expect(disposals).toBe(1);
    // Idempotent: a second dispose adds nothing.
    scene.dispose();
    expect(disposals).toBe(1);

    // A body built after the layer throws: the layer is still disposed once.
    disposals = 0;
    expect(() =>
      createSystemScene(layout, cache, system, {
        ...common,
        buoy: () => {
          throw new Error("buoy failed");
        },
      }),
    ).toThrow("buoy failed");
    expect(disposals).toBe(1);
  });

  it("owns the debris layer: exposes it, adds its root and disposes it, also when half built (WORLD-17)", () => {
    let disposals = 0;
    const root = new THREE.Group();
    const layer: DebrisLayer = {
      root,
      update: () => undefined,
      dispose: () => {
        disposals += 1;
      },
    };
    const common: Partial<SystemSceneFactories> = {
      sun: () => fakeSun().body,
      debris: () => layer,
    };
    const cache = guardCache(
      syntheticCobra().gltf,
      syntheticCoriolis().gltf,
      syntheticBuoy().gltf,
    );

    const scene = createSystemScene(layout, cache, system, common);
    expect(scene.debris).toBe(layer);
    expect(scene.scene.children).toContain(root);
    scene.dispose();
    expect(disposals).toBe(1);
    scene.dispose();
    expect(disposals).toBe(1);

    // A body built after the layer throws: the layer is still disposed once.
    disposals = 0;
    expect(() =>
      createSystemScene(layout, cache, system, {
        ...common,
        buoy: () => {
          throw new Error("buoy failed");
        },
      }),
    ).toThrow("buoy failed");
    expect(disposals).toBe(1);

    // A body built before the layer throws: the layer is never built.
    disposals = 0;
    let built = 0;
    expect(() =>
      createSystemScene(layout, cache, system, {
        ...common,
        debris: () => {
          built += 1;
          return layer;
        },
        npcs: () => {
          throw new Error("npcs failed");
        },
      }),
    ).toThrow("npcs failed");
    expect(built).toBe(0);
    expect(disposals).toBe(0);
  });

  it("owns the shot layer: exposes it, adds its root and disposes it, also when half built (CBT-05)", () => {
    let disposals = 0;
    const root = createLaserShotLayer().root;
    const layer: LaserShotLayer = {
      root,
      add: () => undefined,
      update: () => undefined,
      dispose: () => {
        disposals += 1;
      },
    };
    const common: Partial<SystemSceneFactories> = {
      sun: () => fakeSun().body,
      shots: () => layer,
    };
    const cache = guardCache(
      syntheticCobra().gltf,
      syntheticCoriolis().gltf,
      syntheticBuoy().gltf,
    );

    const scene = createSystemScene(layout, cache, system, common);
    expect(scene.shots).toBe(layer);
    expect(scene.scene.children).toContain(root);
    scene.dispose();
    expect(disposals).toBe(1);
    scene.dispose();
    expect(disposals).toBe(1);

    disposals = 0;
    expect(() =>
      createSystemScene(layout, cache, system, {
        ...common,
        buoy: () => {
          throw new Error("buoy failed");
        },
      }),
    ).toThrow("buoy failed");
    expect(disposals).toBe(1);
  });
  it("owns the explosion layer: exposes it, adds its root and disposes it, also when half built (WORLD-17)", () => {
    let disposals = 0;
    const real = createExplosionLayer(() => new THREE.Texture(), "/");
    const layer: ExplosionLayer = {
      root: real.root,
      add: () => undefined,
      update: () => undefined,
      dispose: () => {
        disposals += 1;
      },
    };
    const common: Partial<SystemSceneFactories> = {
      sun: () => fakeSun().body,
      explosions: () => layer,
    };
    const cache = guardCache(
      syntheticCobra().gltf,
      syntheticCoriolis().gltf,
      syntheticBuoy().gltf,
    );

    const scene = createSystemScene(layout, cache, system, common);
    expect(scene.explosions).toBe(layer);
    expect(scene.scene.children).toContain(real.root);
    scene.dispose();
    expect(disposals).toBe(1);
    scene.dispose();
    expect(disposals).toBe(1);

    // A body built after the layer throws: the layer is still disposed once.
    disposals = 0;
    expect(() =>
      createSystemScene(layout, cache, system, {
        ...common,
        buoy: () => {
          throw new Error("buoy failed");
        },
      }),
    ).toThrow("buoy failed");
    expect(disposals).toBe(1);
    real.dispose();
  });
});

describe("AssetCache is the single owner of the shared GLBs", () => {
  it("frees each shared geometry, material and texture exactly once", async () => {
    const coriolis = syntheticCoriolis();
    const cobra = syntheticCobra();
    const buoy = syntheticBuoy();
    const cache = createAssetCache(
      "/",
      loaderFor(cobra.gltf, coriolis.gltf, buoy.gltf),
    );

    expect(cache.loaded()).toBe(false);
    await cache.preload();
    expect(cache.loaded()).toBe(true);
    // Repeated calls share one download.
    expect(cache.loadCobra()).toBe(cache.loadCobra());

    const counts: Record<string, () => number> = {
      cobraGeometry: countDisposals(cobra.geometry),
      cobraMaterial: countDisposals(cobra.material),
      cobraTexture: countDisposals(cobra.texture),
      // One material shared by four meshes must still be freed once.
      coriolisGeometry: countDisposals(coriolis.geometry),
      coriolisMaterial: countDisposals(coriolis.material),
      coriolisTexture: countDisposals(coriolis.texture),
      buoyGeometry: countDisposals(buoy.geometry),
      buoyMaterial: countDisposals(buoy.material),
      buoyTexture: countDisposals(buoy.texture),
    };

    cache.dispose();
    for (const [name, count] of Object.entries(counts)) {
      expect(count(), name).toBe(1);
    }

    cache.dispose();
    for (const [name, count] of Object.entries(counts)) {
      expect(count(), name).toBe(1);
    }

    expect(cache.loaded()).toBe(false);
    expect(() => cache.cobra()).toThrow(
      /before AssetCache\.preload\(\) resolved/,
    );
  });

  it("names the failing model path in the rejection", async () => {
    const cache = createAssetCache("/", () => Promise.reject(new Error("404")));
    await expect(cache.preload()).rejects.toThrow(
      /failed to load the model at models\/cobra3\.glb/,
    );
  });
});

describe("the menu Cobra survives a system swap", () => {
  it("stays textured because only the cache owns the shared textures", async () => {
    const stub = installCanvasStub();
    try {
      const coriolis = syntheticCoriolis();
      const cobra = syntheticCobra();
      const buoy = syntheticBuoy();
      const cache = createAssetCache(
        "/",
        loaderFor(cobra.gltf, coriolis.gltf, buoy.gltf),
      );
      await cache.preload();

      const cobraMaterialDisposals = countDisposals(cobra.material);
      const cobraTextureDisposals = countDisposals(cobra.texture);
      const cobraGeometryDisposals = countDisposals(cobra.geometry);

      let renderListDisposals = 0;
      const renderer = {
        renderLists: {
          dispose: () => {
            renderListDisposals += 1;
          },
        },
        // The manager projects every camera it installs from this size; a
        // stub without `getSize` would make the install path look correct by
        // accident (Three would never be asked).
        getSize: (target: THREE.Vector2) => target.set(1600, 1000),
      } as unknown as THREE.WebGLRenderer;

      const manager = createSceneManager(renderer, cache);

      // Oolite's frustum rule (Universe.m:4445-4452) at 1600x1000, computed
      // here from the formulas, not by the function under test: the flight
      // view spans tan(28.6 deg) across the width, the gui view a vertical
      // 0.375 (ratio 0.5 inside a 4:3 box).
      const halfTan = Math.tan((28.6 * Math.PI) / 180);
      const flightFov = (2 * Math.atan(halfTan / 1.6) * 180) / Math.PI;
      const guiFov = (2 * Math.atan(0.375) * 180) / Math.PI;
      expect(flightFov).toBeCloseTo(37.6342, 4);
      expect(guiFov).toBeCloseTo(41.1121, 4);

      // Install 1 — the empty pre-load scene, no resize event anywhere.
      expect(manager.active().camera.aspect).toBeCloseTo(1.6, 12);
      expect(manager.active().camera.fov).toBeCloseTo(flightFov, 9);
      expect(manager.activeView()).toBe("flight");

      manager.enterMenu();
      // Install 2 — the real menu scene, drawn in Oolite's GUI mode
      // (`displayGUI = YES`, Universe.m:2987).
      expect(manager.active().camera.aspect).toBeCloseTo(1.6, 12);
      expect(manager.active().camera.fov).toBeCloseTo(guiFov, 9);
      expect(manager.activeView()).toBe("gui");

      // The menu is the real title scene, not plan 01's empty one.
      const menuMeshes: THREE.Mesh[] = [];
      manager.active().scene.traverse((object) => {
        if (isMesh(object)) menuMeshes.push(object);
      });
      expect(menuMeshes.length).toBeGreaterThan(0);

      manager.enterSystem(system, stationDef);
      expect(renderListDisposals).toBeGreaterThanOrEqual(2);

      // Install 3 — the system scene `start()` installs.
      expect(manager.active().camera.aspect).toBeCloseTo(1.6, 12);
      expect(manager.active().camera.fov).toBeCloseTo(flightFov, 9);
      expect(manager.activeView()).toBe("flight");

      // A second system install (the `?test=1` swap path) must re-apply it,
      // not inherit the previous camera or fall back to the constructor's 1.
      manager.enterSystem(system, stationDef);
      expect(manager.active().camera.aspect).toBeCloseTo(1.6, 12);
      expect(manager.active().camera.fov).toBeCloseTo(flightFov, 9);
      expect(manager.activeView()).toBe("flight");

      // The swap disposed the menu's clone, never the shared cache.
      expect(cobraMaterialDisposals()).toBe(0);
      expect(cobraTextureDisposals()).toBe(0);
      expect(cobraGeometryDisposals()).toBe(0);
      expect(cobra.material.map).toBe(cobra.texture);
      expect(cache.loaded()).toBe(true);

      // A fresh menu scene still resolves the cached clone, textured.
      const fresh = createMenuScene(cache);
      const freshMeshes: THREE.Mesh[] = [];
      fresh.scene.traverse((object) => {
        if (isMesh(object)) freshMeshes.push(object);
      });
      const cloned = freshMeshes[0]?.material as
        THREE.MeshStandardMaterial | undefined;
      expect(cloned?.map).toBe(cobra.texture);
      fresh.dispose();
      expect(cobraTextureDisposals()).toBe(0);

      manager.dispose();
      expect(cache.loaded()).toBe(true);

      // Only the cache frees the shared resources, and only once.
      cache.dispose();
      expect(cobraMaterialDisposals()).toBe(1);
      expect(cobraTextureDisposals()).toBe(1);
      expect(cobraGeometryDisposals()).toBe(1);
      cache.dispose();
      expect(cobraTextureDisposals()).toBe(1);
    } finally {
      stub.restore();
    }
  });
});

/**
 * Test-only observation of scene disposal (W-1). The wrapper calls the real
 * `createSystemScene`, then counts how many times that scene's `dispose` runs.
 * It changes no behaviour and is not a production seam.
 */
const built = vi.hoisted(() => ({
  scenes: [] as { disposals: number }[],
}));

vi.mock("../../src/render/system-scene.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/render/system-scene.js")>();
  return {
    ...original,
    createSystemScene: (
      ...args: Parameters<typeof original.createSystemScene>
    ) => {
      const scene = original.createSystemScene(...args);
      const record = { disposals: 0 };
      const realDispose = scene.dispose.bind(scene);
      scene.dispose = () => {
        record.disposals += 1;
        realDispose();
      };
      built.scenes.push(record);
      return scene;
    },
  };
});

/** The renderer surface the manager reads: the viewport size and render lists. */
interface SwapRenderer {
  getSize: (target: THREE.Vector2) => THREE.Vector2;
  renderLists: { dispose: () => void };
}

/** A manager on a real asset cache, with the Lave system already entered once. */
async function enteredLave(): Promise<{
  manager: SceneManager;
  renderer: SwapRenderer;
}> {
  const coriolis = syntheticCoriolis();
  const cobra = syntheticCobra();
  const buoy = syntheticBuoy();
  const cache = createAssetCache(
    "/",
    loaderFor(cobra.gltf, coriolis.gltf, buoy.gltf),
  );
  await cache.preload();
  const renderer: SwapRenderer = {
    renderLists: { dispose: () => undefined },
    getSize: (target: THREE.Vector2) => target.set(1600, 1000),
  };
  const manager = createSceneManager(
    renderer as unknown as THREE.WebGLRenderer,
    cache,
  );
  manager.enterSystem(system, stationDef);
  return { manager, renderer };
}

describe("the scene swap is a commit point (W-1)", () => {
  it("a throw before the install leaves the origin active (commit point)", async () => {
    const stub = installCanvasStub();
    try {
      const { manager, renderer } = await enteredLave();
      const origin = manager.active();
      const originLayout = manager.layout();

      const realGetSize = renderer.getSize;
      renderer.getSize = (): never => {
        throw new Error("commit point: forced viewport failure");
      };
      try {
        expect(() => manager.enterSystem(system, stationDef)).toThrow(
          "commit point: forced viewport failure",
        );
      } finally {
        renderer.getSize = realGetSize;
      }

      expect(manager.active()).toBe(origin);
      expect(manager.layout()).toBe(originLayout);
    } finally {
      stub.restore();
    }
  });

  it("the destination built for a failed call is disposed (commit point)", async () => {
    const stub = installCanvasStub();
    try {
      const { manager, renderer } = await enteredLave();
      const origin = manager.active();
      const originLayout = manager.layout();
      const builtBefore = built.scenes.length;

      const realGetSize = renderer.getSize;
      renderer.getSize = (): never => {
        throw new Error("commit point: forced viewport failure");
      };
      try {
        expect(() => manager.enterSystem(system, stationDef)).toThrow(
          "commit point: forced viewport failure",
        );
      } finally {
        renderer.getSize = realGetSize;
      }

      expect(built.scenes.length).toBe(builtBefore + 1);
      expect(built.scenes[builtBefore]?.disposals).toBe(1);
      expect(manager.active()).toBe(origin);
      expect(manager.layout()).toBe(originLayout);
    } finally {
      stub.restore();
    }
  });

  it("a retire failure after the commit returns the destination (commit point)", async () => {
    const stub = installCanvasStub();
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const { manager, renderer } = await enteredLave();
      const origin = manager.active();
      const originLayout = manager.layout();

      const realRenderListsDispose = renderer.renderLists.dispose;
      renderer.renderLists.dispose = (): never => {
        throw new Error("commit point: forced retire failure");
      };
      try {
        let returned: unknown;
        expect(() => {
          returned = manager.enterSystem(system, stationDef);
        }).not.toThrow();
        expect(returned).toBeDefined();
      } finally {
        renderer.renderLists.dispose = realRenderListsDispose;
      }

      expect(manager.active()).not.toBe(origin);
      expect(manager.layout()).toBeDefined();
      expect(manager.layout()).not.toBe(originLayout);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(String(consoleSpy.mock.calls[0]?.[0])).toMatch(/^Wegolite:/);
      expect(consoleSpy.mock.calls[0]?.[1]).toBeInstanceOf(Error);
    } finally {
      consoleSpy.mockRestore();
      stub.restore();
    }
  });
});

describe("the ownership rule is visible in the source", () => {
  it("no scene module disposes the asset cache", () => {
    for (const relative of [
      "../../src/render/system-scene.ts",
      "../../src/render/menu-scene.ts",
    ]) {
      const source = readFileSync(new URL(relative, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(source, relative).not.toMatch(/assets\.dispose\s*\(/);
      expect(source, relative).not.toMatch(/cache\.dispose\s*\(/);
    }
  });
});

describe("each system draws its own station model (Phase 22.1, WORLD-20)", () => {
  const galaxy = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/systems/g0.json", import.meta.url),
      "utf8",
    ),
  ) as System[];

  function systemOfKind(kind: StationKind): System {
    const found = galaxy.find((entry) => entry.station === kind);
    if (found === undefined) throw new Error(`no ${kind} system in galaxy 0`);
    return found;
  }

  /** A model with one mesh per node of the kind's record, marked with its kind. */
  function syntheticStationModel(kind: StationKind): SyntheticModel {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const scene = new THREE.Group();
    scene.userData = { kind };
    for (const node of stationRecord(kind).nodes) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = node.name;
      scene.add(mesh);
    }
    return { gltf: { scene } as unknown as GLTF, geometry, material, texture };
  }

  interface Models {
    readonly byKind: Readonly<Record<StationKind, SyntheticModel>>;
    readonly cobra: SyntheticModel;
    readonly buoy: SyntheticModel;
  }

  function modelsOf(): Models {
    return {
      cobra: syntheticCobra(),
      buoy: syntheticBuoy(),
      byKind: {
        coriolis: syntheticStationModel("coriolis"),
        dodecahedron: syntheticStationModel("dodecahedron"),
        icosahedron: syntheticStationModel("icosahedron"),
      },
    };
  }

  /**
   * A loader routing each URL to its model, recording every request. A kind in
   * `held` resolves only when its gate opens.
   */
  function stationLoader(
    models: Models,
    held: ReadonlySet<StationKind> = new Set(),
  ): {
    readonly loader: (url: string) => Promise<GLTF>;
    readonly urls: string[];
    readonly open: (kind: StationKind) => void;
    readonly fail: (kind: StationKind) => void;
  } {
    const urls: string[] = [];
    const gates = new Map<
      StationKind,
      { resolve: () => void; reject: (error: Error) => void }
    >();
    const loader = (url: string): Promise<GLTF> => {
      urls.push(url);
      if (url.includes("cobra")) return Promise.resolve(models.cobra.gltf);
      if (url.includes("buoy")) return Promise.resolve(models.buoy.gltf);
      const kind = STATION_KINDS.find((candidate) =>
        url.endsWith(stationRecord(candidate).glb),
      );
      if (kind === undefined) {
        return Promise.reject(new Error(`unexpected request for ${url}`));
      }
      const gltf = models.byKind[kind].gltf;
      if (!held.has(kind)) return Promise.resolve(gltf);
      return new Promise<GLTF>((resolve, reject) => {
        gates.set(kind, {
          resolve: () => {
            resolve(gltf);
          },
          reject,
        });
      });
    };
    return {
      loader,
      urls,
      open: (kind) => {
        gates.get(kind)?.resolve();
      },
      fail: (kind) => {
        gates.get(kind)?.reject(new Error("network down"));
      },
    };
  }

  function sceneFor(
    cache: AssetCache,
    target: System,
    kind: StationKind,
  ): ReturnType<typeof createSystemScene> {
    return createSystemScene(
      deriveSystemLayout(target, stationSpecOf(kind)),
      cache,
      target,
    );
  }

  it("draws the Coriolis at Lave, the Dodecahedron at Biarge and the Icosahedron at Zaonce, each from its own GLB", async () => {
    const stub = installCanvasStub();
    try {
      const models = modelsOf();
      const { loader } = stationLoader(models);
      const cache = createAssetCache("/", loader);
      await cache.preload();
      await Promise.all(STATION_KINDS.map((kind) => cache.loadStation(kind)));

      const scenes = STATION_KINDS.map((kind) => {
        const target = kind === "coriolis" ? system : systemOfKind(kind);
        return { kind, scene: sceneFor(cache, target, kind) };
      });

      for (const { kind, scene } of scenes) {
        expect(scene.station.modelKind, kind).toBe(kind);
        const drawn = scene.station.root.children[0];
        expect(drawn?.userData.kind, kind).toBe(kind);
        const names: string[] = [];
        scene.station.root.traverse((object) => {
          if (isMesh(object)) names.push(object.name);
        });
        expect(names, kind).toEqual(
          stationRecord(kind).nodes.map((node) => node.name),
        );
      }
      for (const { scene } of scenes) scene.dispose();
      cache.dispose();
    } finally {
      stub.restore();
    }
  });

  it("builds a scene whose model is still loading without throwing, and attaches it when the load resolves", async () => {
    const stub = installCanvasStub();
    try {
      const models = modelsOf();
      const gate = stationLoader(models, new Set<StationKind>(["icosahedron"]));
      const cache = createAssetCache("/", gate.loader);
      await cache.preload();
      const zaonce = systemOfKind("icosahedron");

      let scene: ReturnType<typeof createSystemScene> | undefined;
      expect(() => {
        scene = sceneFor(cache, zaonce, "icosahedron");
      }).not.toThrow();
      if (scene === undefined) throw new Error("no scene was built");

      // Meshless, never another kind's model, with an empty dock node.
      expect(scene.station.modelKind).toBeUndefined();
      expect(scene.station.root.children).toHaveLength(1);
      expect(scene.station.dock.type).toBe("Object3D");
      expect(scene.station.dock.name).toBe("dock");
      expect(
        gate.urls.filter((url) => url.includes("icosahedron")),
      ).toHaveLength(1);

      gate.open("icosahedron");
      await vi.waitFor(() => {
        expect(scene?.station.modelKind).toBe("icosahedron");
      });
      expect(scene.station.root.children[0]?.userData.kind).toBe("icosahedron");
      expect(scene.station.root.children).toHaveLength(1);
      expect(scene.station.dock.type).toBe("Mesh");
      // Only the scene's own request, and no other kind was ever asked for.
      expect(
        gate.urls.filter((url) => url.includes("icosahedron")),
      ).toHaveLength(1);
      expect(gate.urls.some((url) => url.includes("dodecahedron"))).toBe(false);

      scene.dispose();
      cache.dispose();
    } finally {
      stub.restore();
    }
  });

  it("attaches nothing when the scene was disposed before the load resolved, and the cache frees the model once", async () => {
    const stub = installCanvasStub();
    try {
      const models = modelsOf();
      const gate = stationLoader(models, new Set<StationKind>(["icosahedron"]));
      const cache = createAssetCache("/", gate.loader);
      await cache.preload();
      const ico = models.byKind.icosahedron;
      const materialDisposals = countDisposals(ico.material);
      const geometryDisposals = countDisposals(ico.geometry);
      const textureDisposals = countDisposals(ico.texture);

      const scene = sceneFor(cache, systemOfKind("icosahedron"), "icosahedron");
      scene.dispose();
      gate.open("icosahedron");
      await cache.loadStation("icosahedron");
      await Promise.resolve();

      expect(scene.station.modelKind).toBeUndefined();
      // Still just the empty dock node: no model and no mesh was added.
      expect(scene.station.root.children).toEqual([scene.station.dock]);
      expect(scene.station.dock.type).toBe("Object3D");
      // The scene allocated and freed nothing of the model: it never cloned it.
      expect(materialDisposals()).toBe(0);
      expect(geometryDisposals()).toBe(0);
      expect(textureDisposals()).toBe(0);

      // The GLTF lives in the cache, which frees it exactly once.
      cache.dispose();
      cache.dispose();
      expect(materialDisposals()).toBe(1);
      expect(geometryDisposals()).toBe(1);
      expect(textureDisposals()).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it("logs a failed load once, keeps the scene running and leaves the station meshless", async () => {
    const stub = installCanvasStub();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const models = modelsOf();
      const gate = stationLoader(models, new Set<StationKind>(["icosahedron"]));
      const cache = createAssetCache("/", gate.loader);
      await cache.preload();

      const scene = sceneFor(cache, systemOfKind("icosahedron"), "icosahedron");
      gate.fail("icosahedron");
      await vi.waitFor(() => {
        expect(logged).toHaveBeenCalledTimes(1);
      });
      expect(String(logged.mock.calls[0]?.[0])).toMatch(/^Wegolite:/);
      expect(scene.station.modelKind).toBeUndefined();
      expect(scene.station.dock.type).toBe("Object3D");

      scene.dispose();
      cache.dispose();
    } finally {
      logged.mockRestore();
      stub.restore();
    }
  });

  it("frees every loaded station model exactly once with the cache, and no scene frees one", async () => {
    const stub = installCanvasStub();
    try {
      const models = modelsOf();
      const { loader } = stationLoader(models);
      const cache = createAssetCache("/", loader);
      await cache.preload();
      await Promise.all(STATION_KINDS.map((kind) => cache.loadStation(kind)));
      const counts = STATION_KINDS.flatMap((kind) => [
        countDisposals(models.byKind[kind].geometry),
        countDisposals(models.byKind[kind].material),
        countDisposals(models.byKind[kind].texture),
      ]);

      const scenes = STATION_KINDS.map((kind) =>
        sceneFor(
          cache,
          kind === "coriolis" ? system : systemOfKind(kind),
          kind,
        ),
      );
      for (const scene of scenes) scene.dispose();
      // The scenes freed only their cloned materials, never a cached resource.
      for (const count of counts) expect(count()).toBe(0);

      cache.dispose();
      for (const count of counts) expect(count()).toBe(1);
      cache.dispose();
      for (const count of counts) expect(count()).toBe(1);
    } finally {
      stub.restore();
    }
  });
});
