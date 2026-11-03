// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared GLB cache (Pattern 3, T-3-02).
 *
 * The Cobra and Coriolis models are loaded once and cloned per scene, so a
 * scene swap never re-downloads or re-parses them. The cache owns the shared
 * geometries, materials and textures; a `SystemScene` owns only the clones and
 * disposable resources it creates itself.
 *
 * A failed load rejects with a named error that includes the model path. The
 * caller must not start the render loop on that rejection: an empty scene over
 * a live canvas is exactly the blank-canvas failure T-3-02 forbids.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { isMesh, meshMaterials } from "./mesh.js";

const COBRA_PATH = "models/cobra3.glb";
const CORIOLIS_PATH = "models/coriolis.glb";

export interface AssetCache {
  /** Load both models; resolves once, and is safe to call repeatedly. */
  preload(): Promise<void>;
  /** The Cobra model; throws when called before `preload()` resolved. */
  cobra(): GLTF;
  /** The Coriolis model; throws when called before `preload()` resolved. */
  coriolis(): GLTF;
  dispose(): void;
}

function disposeMaterial(material: THREE.Material): void {
  const record = material as unknown as Record<string, unknown>;
  for (const value of Object.values(record)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

function disposeModel(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    object.geometry.dispose();
    for (const material of meshMaterials(object)) disposeMaterial(material);
  });
}

export function createAssetCache(
  baseUrl: string = import.meta.env.BASE_URL,
): AssetCache {
  const loader = new GLTFLoader();
  let cobraModel: GLTF | undefined;
  let coriolisModel: GLTF | undefined;
  let pending: Promise<void> | undefined;

  const load = async (path: string): Promise<GLTF> => {
    try {
      return await loader.loadAsync(`${baseUrl}${path}`);
    } catch (cause) {
      throw new Error(`Wegolite: failed to load the model at ${path}.`, {
        cause,
      });
    }
  };

  return {
    preload(): Promise<void> {
      pending ??= (async () => {
        const [cobra, coriolis] = await Promise.all([
          load(COBRA_PATH),
          load(CORIOLIS_PATH),
        ]);
        cobraModel = cobra;
        coriolisModel = coriolis;
      })();
      return pending;
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
    dispose(): void {
      if (cobraModel !== undefined) disposeModel(cobraModel.scene);
      if (coriolisModel !== undefined) disposeModel(coriolisModel.scene);
      cobraModel = undefined;
      coriolisModel = undefined;
      pending = undefined;
    },
  };
}
