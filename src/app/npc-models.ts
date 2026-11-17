// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-session NPC model loader (Phase 12, plan 12-11; WORLD-15, DATA-13).
 *
 * **Per key, on first appearance (Open Question 5, the planner's adoption of
 * the research recommendation).** The render driver hands the loader the ship
 * keys of every frame's contact list. A key is fetched once, through
 * `AssetCache.loadNpcModel`, the first time it is requested while the loader is
 * open; only loaded keys are drawn, a failed key is marked failed and is never
 * retried (no retry storm, no console output per frame), and the scanner shows
 * the ship whether or not its model ever loads, because the scanner is fed by
 * simulation data, not by models.
 *
 * **Closed until the first in-flight frame (owner decision 2026-11-14, option
 * A; DATA-13 and ROADMAP Phase 9 criterion 3 unchanged).** With traffic on the
 * inert ships are populated at launch start, so a driver that requested models
 * on first appearance would fetch GLBs during the launch frames, before the
 * first in-flight frame. The loader therefore starts closed: `request` does
 * nothing and remembers nothing until `open()`, a one-way latch that only the
 * render driver calls, right after it has drawn a frame whose state is
 * `inFlight`. A cold start thus requests no NPC model and, because textures are
 * fetched only by the GLB loads, no NPC texture either, before that frame.
 * Once open the latch never closes, so a later dock, launch, Load or jump in the
 * same page requests at once.
 *
 * The GLB path comes only from the validated catalogue (`glbFor`, read at call
 * time) and `loadNpcModel` re-checks the path pattern (T-12-24); a key with no
 * path is ignored and not remembered, so it loads once the catalogue is there.
 * Nothing here holds an entity id: the loader is keyed by ship key.
 */

import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { AssetCache } from "../render/asset-cache.js";
import type { TrafficContent } from "./session/traffic.js";

export interface NpcModelLoader {
  /** One-way latch: from now on `request` fetches. Idempotent. */
  open(): void;
  /** Fetch each key not yet requested; a no-op until `open()`. */
  request(keys: Iterable<string>): void;
  /** The loaded models by ship key; the same map object for the loader's life. */
  loaded(): ReadonlyMap<string, GLTF>;
  /** Drop late resolutions and stop fetching. Idempotent. */
  dispose(): void;
}

/**
 * The GLB path of a model key in the session's traffic content: an NPC ship's
 * from the ship catalogue, else a debris piece's from the debris catalogue
 * (WORLD-17, plan 16-08: pods, plates and wrecks ride this loader and its
 * latch). Undefined with no traffic content or for an unknown key, so the
 * loader ignores the request until the catalogue is there.
 */
export function trafficModelGlb(
  traffic: Pick<TrafficContent, "catalogue" | "debrisModels"> | undefined,
  key: string,
): string | undefined {
  if (traffic === undefined) return undefined;
  return (
    traffic.catalogue.find((ship) => ship.key === key)?.glb ??
    traffic.debrisModels?.find((record) => record.key === key)?.glb
  );
}

type KeyState = "loading" | "loaded" | "failed";

export function createNpcModelLoader(
  assets: Pick<AssetCache, "loadNpcModel">,
  glbFor: (key: string) => string | undefined,
): NpcModelLoader {
  const states = new Map<string, KeyState>();
  const models = new Map<string, GLTF>();
  let opened = false;
  let disposed = false;

  function fetchKey(key: string, glb: string): void {
    states.set(key, "loading");
    const settle = (error: unknown): void => {
      void error;
      if (!disposed) states.set(key, "failed");
    };
    let promise: Promise<GLTF>;
    try {
      promise = assets.loadNpcModel(glb);
    } catch (error: unknown) {
      settle(error);
      return;
    }
    promise.then((gltf) => {
      // A resolution after dispose() is dropped: the cache no longer owns it.
      if (disposed) return;
      models.set(key, gltf);
      states.set(key, "loaded");
    }, settle);
  }

  return {
    // The interface types the return; the latch is one-way and idempotent.
    open() {
      opened = true;
    },
    request(keys): void {
      if (!opened || disposed) return;
      for (const key of keys) {
        if (states.has(key)) continue;
        const glb = glbFor(key);
        if (glb === undefined) continue;
        fetchKey(key, glb);
      }
    },
    loaded(): ReadonlyMap<string, GLTF> {
      return models;
    },
    dispose(): void {
      disposed = true;
      states.clear();
      models.clear();
    },
  };
}
