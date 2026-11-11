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
import { createAssetCache } from "../../src/render/asset-cache.js";
import type { AssetCache } from "../../src/render/asset-cache.js";
import { createBuoy } from "../../src/render/bodies/buoy.js";
import type { BuoyBody } from "../../src/render/bodies/buoy.js";
import { createDust } from "../../src/render/bodies/dust.js";
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
import { laveFixture } from "../helpers/lave.js";

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
    loadCoriolis: () => Promise.resolve(coriolis),
    loadBuoy: () => Promise.resolve(buoy),
    cobra: () => cobra,
    coriolis: () => coriolis,
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

    const sceneOwned: Record<string, () => number> = {
      planetGeometry: countDisposals(planet.mesh.geometry),
      planetMaterial: countDisposals(planet.material),
      starfieldGeometry: countDisposals(starfield.geometry),
      dustGeometry: countDisposals(dust.object.geometry),
    };
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
      },
      cached: coriolis,
      cachedBuoy: buoy,
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
    const { parts, cached, cachedBuoy, sun, sceneOwned } = buildParts();
    const cachedMaterialDisposals = countDisposals(cached.material);
    const cachedTextureDisposals = countDisposals(cached.texture);
    const cachedGeometryDisposals = countDisposals(cached.geometry);
    const buoyMaterialDisposals = countDisposals(cachedBuoy.material);
    const buoyTextureDisposals = countDisposals(cachedBuoy.texture);
    const buoyGeometryDisposals = countDisposals(cachedBuoy.geometry);

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

      // Install 1 — the empty pre-load scene, no resize event anywhere.
      expect(manager.active().camera.aspect).toBeCloseTo(1.6, 12);

      manager.enterMenu();
      // Install 2 — the real menu scene.
      expect(manager.active().camera.aspect).toBeCloseTo(1.6, 12);

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

      // A second system install (the `?test=1` swap path) must re-apply it,
      // not inherit the previous camera or fall back to the constructor's 1.
      manager.enterSystem(system, stationDef);
      expect(manager.active().camera.aspect).toBeCloseTo(1.6, 12);

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
