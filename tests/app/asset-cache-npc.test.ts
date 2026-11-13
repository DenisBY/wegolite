// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Lazy NPC model loading in the shared asset cache (DATA-13, D-07, T-09-21,
 * T-09-24).
 *
 * Node only, no WebGL: the loader is injected and the models are synthetic
 * GLTFs whose geometry, material and texture each record their `dispose`
 * events. The tests prove that `loadNpcModel` fetches only when called, is
 * memoised per path, refuses any path outside `models/<name>.glb` before the
 * loader runs, forgets a failed load, frees every cached NPC resource exactly
 * once on `dispose()`, and does not cache a load that settles after `dispose()`.
 */

import { readFileSync } from "node:fs";

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { createAssetCache } from "../../src/render/asset-cache.js";
import type { ModelLoader } from "../../src/render/asset-cache.js";

const records = JSON.parse(
  readFileSync("src/content/generated/ships-npc.json", "utf8"),
) as readonly { readonly key: string; readonly glb: string }[];
const glbs = records.map((record) => record.glb);

/** Count the `dispose` events a Three resource emits from now on. */
function countDisposals(resource: { dispose(): void }): () => number {
  let count = 0;
  const dispatcher = resource as unknown as {
    addEventListener(type: string, listener: () => void): void;
  };
  dispatcher.addEventListener("dispose", () => {
    count += 1;
  });
  return () => count;
}

interface SyntheticModel {
  readonly gltf: GLTF;
  readonly counts: readonly (() => number)[];
}

/** A one-mesh model with its own geometry, material and texture. */
function syntheticNpc(): SyntheticModel {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, material));
  return {
    gltf: { scene } as unknown as GLTF,
    counts: [
      countDisposals(geometry),
      countDisposals(material),
      countDisposals(texture),
    ],
  };
}

/** A loader that records every URL and resolves a fresh synthetic model. */
function recordingLoader(): {
  readonly loader: ModelLoader;
  readonly urls: string[];
  readonly models: SyntheticModel[];
} {
  const urls: string[] = [];
  const models: SyntheticModel[] = [];
  const loader: ModelLoader = (url) => {
    urls.push(url);
    const model = syntheticNpc();
    models.push(model);
    return Promise.resolve(model.gltf);
  };
  return { loader, urls, models };
}

function viperGlb(): string {
  const viper = records.find((record) => record.key === "viper");
  if (viper === undefined) throw new Error("the viper record is missing");
  return viper.glb;
}

describe("AssetCache.loadNpcModel", () => {
  it("has nine compiled records to load (vacuity guard)", () => {
    expect(glbs).toHaveLength(9);
    expect(new Set(glbs).size).toBe(9);
  });

  it("preload() requests exactly the three first-load models and no NPC path", async () => {
    const { loader, urls } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    await cache.preload();
    expect([...urls].sort()).toEqual([
      "/base/models/buoy.glb",
      "/base/models/cobra3.glb",
      "/base/models/coriolis.glb",
    ]);
  });

  it("fetches lazily, memoises one promise per path and loads nine distinct models", async () => {
    const { loader, urls } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    expect(urls).toEqual([]);

    const first = cache.loadNpcModel(viperGlb());
    const second = cache.loadNpcModel(viperGlb());
    expect(second).toBe(first);
    await first;
    expect(urls).toEqual(["/base/models/viper.glb"]);

    await Promise.all(glbs.map((glb) => cache.loadNpcModel(glb)));
    expect(urls).toHaveLength(9);
    expect(new Set(urls).size).toBe(9);
  });

  it.each([
    "../models/viper.glb",
    "models/../index.html",
    "/models/viper.glb",
    "https://example.invalid/models/viper.glb",
    "models/viper.GLB",
    "models/viper.glb?x=1",
    "",
  ])("refuses %j without calling the loader", async (path) => {
    const { loader, urls } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    await expect(cache.loadNpcModel(path)).rejects.toThrow(
      /refused to load the NPC model/,
    );
    expect(urls).toHaveLength(0);
  });

  it("names the path in a failed load and forgets it so a later call fetches again", async () => {
    const cause = new Error("network down");
    let calls = 0;
    const loader: ModelLoader = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(cause)
        : Promise.resolve(syntheticNpc().gltf);
    };
    const cache = createAssetCache("/base/", loader);

    const failure = await cache.loadNpcModel(viperGlb()).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toMatch(
      /failed to load the model at models\/viper\.glb/,
    );
    expect(failure?.cause).toBe(cause);
    expect(calls).toBe(1);

    await cache.loadNpcModel(viperGlb());
    expect(calls).toBe(2);
  });

  it("frees every cached NPC resource exactly once on dispose and reloads afterwards", async () => {
    const { loader, urls, models } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    await cache.loadNpcModel(glbs[0] as string);
    await cache.loadNpcModel(glbs[1] as string);
    expect(models).toHaveLength(2);

    cache.dispose();
    for (const model of models) {
      expect(model.counts.map((count) => count())).toEqual([1, 1, 1]);
    }
    cache.dispose();
    for (const model of models) {
      expect(model.counts.map((count) => count())).toEqual([1, 1, 1]);
    }

    await cache.loadNpcModel(glbs[0] as string);
    expect(urls).toHaveLength(3);
  });

  it("does not cache a load that settles after dispose", async () => {
    const model = syntheticNpc();
    let resolveLoad: (gltf: GLTF) => void = () => undefined;
    const loader: ModelLoader = () =>
      new Promise<GLTF>((resolve) => {
        resolveLoad = resolve;
      });
    const cache = createAssetCache("/base/", loader);

    const pending = cache.loadNpcModel(viperGlb());
    cache.dispose();
    resolveLoad(model.gltf);
    await expect(pending).resolves.toBe(model.gltf);

    cache.dispose();
    expect(model.counts.map((count) => count())).toEqual([0, 0, 0]);
  });
});
