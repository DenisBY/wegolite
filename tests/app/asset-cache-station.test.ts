// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Per-kind station models in the shared asset cache (Phase 22.1, WORLD-20, O3,
 * T-22.1-24).
 *
 * Node only, no WebGL: the loader is injected and the models are synthetic GLTFs
 * whose geometry, material and texture record their `dispose` events. The tests
 * prove that `loadStation` fetches the record's path once per kind, refuses a
 * record path outside `models/<name>.glb` before the loader runs, forgets a
 * failed load, leaves `preload()` and `loaded()` at the Cobra, the buoy and the
 * default kind, frees every loaded station exactly once on `dispose()`, and
 * does not cache a load that settles after `dispose()`.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STATION_KIND,
  STATION_KINDS,
  stationRecord,
} from "../../src/content/stations.js";
import type { StationKind } from "../../src/content/stations.js";
import { createAssetCache } from "../../src/render/asset-cache.js";
import type { ModelLoader } from "../../src/render/asset-cache.js";

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
function syntheticModel(): SyntheticModel {
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
  readonly models: Map<string, SyntheticModel>;
} {
  const urls: string[] = [];
  const models = new Map<string, SyntheticModel>();
  const loader: ModelLoader = (url) => {
    urls.push(url);
    const model = syntheticModel();
    models.set(url, model);
    return Promise.resolve(model.gltf);
  };
  return { loader, urls, models };
}

const NON_DEFAULT_KINDS: readonly StationKind[] = STATION_KINDS.filter(
  (kind) => kind !== DEFAULT_STATION_KIND,
);

describe("AssetCache.loadStation", () => {
  it("has two kinds besides the default to load (vacuity guard)", () => {
    expect(NON_DEFAULT_KINDS).toHaveLength(2);
  });

  it.each(STATION_KINDS)(
    "fetches the %s model from its record's path once, and returns it from station()",
    async (kind) => {
      const { loader, urls } = recordingLoader();
      const cache = createAssetCache("/base/", loader);
      expect(cache.station(kind)).toBeUndefined();
      expect(urls).toEqual([]);

      const first = cache.loadStation(kind);
      expect(cache.loadStation(kind)).toBe(first);
      const gltf = await first;

      expect(urls).toEqual([`/base/${stationRecord(kind).glb}`]);
      expect(cache.station(kind)).toBe(gltf);
    },
  );

  it("keeps the kinds apart: one model each, none returned for another kind", async () => {
    const { loader, urls } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    const [first, second] = NON_DEFAULT_KINDS;
    if (first === undefined || second === undefined) {
      throw new Error("expected two non-default kinds");
    }
    const loaded = await cache.loadStation(first);
    expect(cache.station(second)).toBeUndefined();
    expect(cache.station(first)).toBe(loaded);
    expect(urls).toHaveLength(1);
  });

  it("refuses a record path outside models/<name>.glb without calling the loader", async () => {
    const { loader, urls } = recordingLoader();
    const cache = createAssetCache("/base/", loader, {
      coriolis: { glb: "models/coriolis.glb" },
      dodecahedron: { glb: "../models/dodecahedron.glb" },
      icosahedron: { glb: "https://example.invalid/models/icosahedron.glb" },
    });
    await expect(cache.loadStation("dodecahedron")).rejects.toThrow(
      /refused to load the dodecahedron station model/,
    );
    await expect(cache.loadStation("icosahedron")).rejects.toThrow(
      /refused to load the icosahedron station model/,
    );
    expect(urls).toHaveLength(0);
    // The safe kind still loads.
    await cache.loadStation("coriolis");
    expect(urls).toEqual(["/base/models/coriolis.glb"]);
  });

  it("names the path in a failed load and forgets it so a later call fetches again", async () => {
    const cause = new Error("network down");
    let failures = 1;
    const urls: string[] = [];
    const loader: ModelLoader = (url) => {
      urls.push(url);
      if (failures > 0) {
        failures -= 1;
        return Promise.reject(cause);
      }
      return Promise.resolve(syntheticModel().gltf);
    };
    const cache = createAssetCache("/base/", loader);
    const kind = NON_DEFAULT_KINDS[0];
    if (kind === undefined) throw new Error("expected a non-default kind");

    const failed = cache.loadStation(kind);
    await expect(failed).rejects.toThrow(
      new RegExp(`failed to load the model at ${stationRecord(kind).glb}`),
    );
    await failed.catch((error: unknown) => {
      expect((error as Error).cause).toBe(cause);
    });
    expect(cache.station(kind)).toBeUndefined();

    const retried = await cache.loadStation(kind);
    expect(urls).toHaveLength(2);
    expect(cache.station(kind)).toBe(retried);
  });
});

describe("AssetCache.preload and loaded() with station kinds", () => {
  it("preload() requests the Cobra, the buoy and the default kind, no other station", async () => {
    const { loader, urls } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    await cache.preload();
    expect([...urls].sort()).toEqual(
      [
        "/base/models/buoy.glb",
        "/base/models/cobra3.glb",
        `/base/${stationRecord(DEFAULT_STATION_KIND).glb}`,
      ].sort(),
    );
    for (const kind of NON_DEFAULT_KINDS) {
      expect(urls).not.toContain(`/base/${stationRecord(kind).glb}`);
    }
  });

  it("loaded() means the preload set only: another kind neither delays nor satisfies it", async () => {
    const { loader } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    const kind = NON_DEFAULT_KINDS[0];
    if (kind === undefined) throw new Error("expected a non-default kind");
    await cache.loadStation(kind);
    expect(cache.loaded()).toBe(false);
    await cache.preload();
    expect(cache.loaded()).toBe(true);
  });

  it("loaded() is true after the preload set although no other kind was loaded", async () => {
    const { loader } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    await cache.preload();
    for (const kind of NON_DEFAULT_KINDS) {
      expect(cache.station(kind)).toBeUndefined();
    }
    expect(cache.loaded()).toBe(true);
  });
});

describe("AssetCache.dispose with station models", () => {
  it("frees every loaded station exactly once and forgets them", async () => {
    const { loader, models } = recordingLoader();
    const cache = createAssetCache("/base/", loader);
    await Promise.all(STATION_KINDS.map((kind) => cache.loadStation(kind)));
    const counts = STATION_KINDS.flatMap((kind) => {
      const model = models.get(`/base/${stationRecord(kind).glb}`);
      if (model === undefined) throw new Error(`no ${kind} model was loaded`);
      return model.counts;
    });
    expect(counts).toHaveLength(STATION_KINDS.length * 3);

    cache.dispose();
    for (const count of counts) expect(count()).toBe(1);
    cache.dispose();
    for (const count of counts) expect(count()).toBe(1);
    for (const kind of STATION_KINDS) {
      expect(cache.station(kind)).toBeUndefined();
    }
  });

  it("does not cache a load that settles after dispose()", async () => {
    let settle: ((gltf: GLTF) => void) | undefined;
    const loader: ModelLoader = () =>
      new Promise<GLTF>((resolve) => {
        settle = resolve;
      });
    const cache = createAssetCache("/base/", loader);
    const kind = NON_DEFAULT_KINDS[0];
    if (kind === undefined) throw new Error("expected a non-default kind");

    const pending = cache.loadStation(kind);
    cache.dispose();
    const late = syntheticModel();
    settle?.(late.gltf);
    // The caller still receives the model it asked for ...
    await expect(pending).resolves.toBe(late.gltf);
    // ... but the cache does not own it, so it is never freed by the cache.
    expect(cache.station(kind)).toBeUndefined();
    cache.dispose();
    for (const count of late.counts) expect(count()).toBe(0);
  });
});
