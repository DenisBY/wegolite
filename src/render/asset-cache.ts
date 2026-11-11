// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared GLB cache (Pattern 3, T-3-02, T-3-24).
 *
 * **Ownership rule.** This module is the single owner of the two shared GLB
 * scenes: their geometries, materials and textures. A `SystemScene` or a
 * `MenuScene` clones the model and owns only the clone's *materials*; it must
 * never dispose a cached geometry, material or texture. Disposing a cloned
 * material does not dispose its `map` (Three does not cascade), which is what
 * keeps the menu Cobra textured after a system swap. Only `dispose()` below
 * frees the cached resources, and only on app teardown.
 *
 * `loadCobra()`/`loadCoriolis()` are memoised: repeated calls return the same
 * promise, so a boot-time warm-up and the session's own `preload()` share one
 * download. A failed load rejects with a named error that includes the model
 * path; the caller must not start the render loop on that rejection, because an
 * empty scene over a live canvas is exactly the blank-canvas failure T-3-02
 * forbids.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { isMesh, meshMaterials } from "./mesh.js";

const COBRA_PATH = "models/cobra3.glb";
const CORIOLIS_PATH = "models/coriolis.glb";
const BUOY_PATH = "models/buoy.glb";

/** The one seam the Node disposal test injects; production uses `GLTFLoader`. */
export type ModelLoader = (url: string) => Promise<GLTF>;

export interface AssetCache {
  /** Memoised Cobra load; the promise rejects with a path-named error. */
  loadCobra(): Promise<GLTF>;
  /** Memoised Coriolis load; the promise rejects with a path-named error. */
  loadCoriolis(): Promise<GLTF>;
  /** Memoised buoy load; the promise rejects with a path-named error. */
  loadBuoy(): Promise<GLTF>;
  /** The navigation buoy model; throws when called before the load resolved. */
  buoy(): GLTF;
  /** The Cobra model; throws when called before the load resolved. */
  cobra(): GLTF;
  /** The Coriolis model; throws when called before the load resolved. */
  coriolis(): GLTF;
  /** Load both models; resolves once, and is safe to call repeatedly. */
  preload(): Promise<void>;
  /**
   * True once both GLBs are loaded and `cobra()`/`coriolis()` are safe.
   *
   * The scene manager uses this to decide whether the title scene can be built
   * yet: the menu needs the shared Cobra, and a swap must not throw merely
   * because the cache is still loading.
   */
  loaded(): boolean;
  /** Free the shared GLBs exactly once. Idempotent; never called by a scene. */
  dispose(): void;
}

function defaultLoader(): ModelLoader {
  const loader = new GLTFLoader();
  return (url) => loader.loadAsync(url);
}

/** Collect every texture a material references (map, normalMap, emissiveMap…). */
function collectTextures(
  material: THREE.Material,
  into: Set<THREE.Texture<unknown>>,
): void {
  const record = material as unknown as Record<string, unknown>;
  for (const value of Object.values(record)) {
    if (value instanceof THREE.Texture) {
      // `instanceof` narrows to `Texture<any, any>`; the set is the safe form.
      into.add(value as THREE.Texture<unknown>);
    }
  }
}

export function createAssetCache(
  baseUrl: string = import.meta.env.BASE_URL,
  loadModel: ModelLoader = defaultLoader(),
): AssetCache {
  let cobraModel: GLTF | undefined;
  let coriolisModel: GLTF | undefined;
  let buoyModel: GLTF | undefined;
  let buoyPromise: Promise<GLTF> | undefined;
  let cobraPromise: Promise<GLTF> | undefined;
  let coriolisPromise: Promise<GLTF> | undefined;
  let pending: Promise<void> | undefined;

  const load = (path: string): Promise<GLTF> =>
    loadModel(`${baseUrl}${path}`).catch((cause: unknown) => {
      throw new Error(`Wegolite: failed to load the model at ${path}.`, {
        cause,
      });
    });

  function loadCobra(): Promise<GLTF> {
    cobraPromise ??= load(COBRA_PATH).then((gltf) => {
      cobraModel = gltf;
      return gltf;
    });
    return cobraPromise;
  }

  function loadCoriolis(): Promise<GLTF> {
    coriolisPromise ??= load(CORIOLIS_PATH).then((gltf) => {
      coriolisModel = gltf;
      return gltf;
    });
    return coriolisPromise;
  }

  function loadBuoy(): Promise<GLTF> {
    buoyPromise ??= load(BUOY_PATH).then((gltf) => {
      buoyModel = gltf;
      return gltf;
    });
    return buoyPromise;
  }

  return {
    loadCobra,
    loadCoriolis,
    loadBuoy,
    preload(): Promise<void> {
      pending ??= Promise.all([loadCobra(), loadCoriolis(), loadBuoy()]).then(
        () => undefined,
      );
      return pending;
    },
    buoy(): GLTF {
      if (buoyModel === undefined) {
        throw new Error(
          "Wegolite: the buoy model was requested before AssetCache.preload() resolved.",
        );
      }
      return buoyModel;
    },
    cobra(): GLTF {
      if (cobraModel === undefined) {
        throw new Error(
          "Wegolite: the Cobra model was requested before AssetCache.preload() resolved.",
        );
      }
      return cobraModel;
    },
    coriolis(): GLTF {
      if (coriolisModel === undefined) {
        throw new Error(
          "Wegolite: the Coriolis model was requested before AssetCache.preload() resolved.",
        );
      }
      return coriolisModel;
    },
    loaded(): boolean {
      return (
        cobraModel !== undefined &&
        coriolisModel !== undefined &&
        buoyModel !== undefined
      );
    },
    dispose(): void {
      // Dedupe by identity: the GLBs share one material across many meshes, and
      // a texture can hang off several materials. Disposing a resource twice is
      // not an error in Three, but it is a double-free in the proof.
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture<unknown>>();

      for (const model of [cobraModel, coriolisModel, buoyModel]) {
        if (model === undefined) continue;
        model.scene.traverse((object) => {
          if (!isMesh(object)) return;
          geometries.add(object.geometry);
          for (const material of meshMaterials(object)) {
            materials.add(material);
            collectTextures(material, textures);
          }
        });
      }

      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();

      // Clearing the models is what makes a second call a no-op; a later
      // `preload()` re-loads from scratch.
      cobraModel = undefined;
      coriolisModel = undefined;
      buoyModel = undefined;
      buoyPromise = undefined;
      cobraPromise = undefined;
      coriolisPromise = undefined;
      pending = undefined;
    },
  };
}
