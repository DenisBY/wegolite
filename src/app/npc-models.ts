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
 *
 * **Background prefetch (plan 21-11, D-07).** With the 29-record roster most
 * hulls are new, so loading each on first appearance would pop ships in late.
 * `prefetch` is a second entry beside the latch: it downloads a list of keys in
 * the background, `NPC_PREFETCH_CONCURRENCY` at a time, independent of
 * `open()`, so the render driver can start it while the session is docked and
 * the models are ready before launch. It rides the same `states` map and
 * `fetchKey`, so a key already loading or loaded is never fetched twice and a
 * failure is recorded exactly as `request` records it. Nobody awaits it and the
 * simulation never reads it; a ship whose model has not arrived is drawn once
 * it loads. The first-load ceiling is asserted on the transfer excluding this
 * background set (DATA-18), and with traffic off the driver never calls it.
 */

import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { AssetCache } from "../render/asset-cache.js";
import type { TrafficContent } from "./session/traffic.js";

export interface NpcModelLoader {
  /** One-way latch: from now on `request` fetches. Idempotent. */
  open(): void;
  /** Fetch each key not yet requested; a no-op until `open()`. */
  request(keys: Iterable<string>): void;
  /**
   * D-07: queue each key not yet loading, loaded or failed for a background
   * download, at most `NPC_PREFETCH_CONCURRENCY` in flight, whether or not the
   * latch is open. Never awaited; a no-op after `dispose()`.
   */
  prefetch(keys: Iterable<string>): void;
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

/**
 * D-07: how many prefetch downloads run at once. Two keeps the background
 * download from competing with the docked screen for the connection; a measured
 * choice can change it.
 */
export const NPC_PREFETCH_CONCURRENCY = 2;

type KeyState = "loading" | "loaded" | "failed";

export function createNpcModelLoader(
  assets: Pick<AssetCache, "loadNpcModel">,
  glbFor: (key: string) => string | undefined,
): NpcModelLoader {
  const states = new Map<string, KeyState>();
  const models = new Map<string, GLTF>();
  let opened = false;
  let disposed = false;
  /** D-07: the prefetch FIFO and the number of its loads in flight. */
  const queue: string[] = [];
  let prefetching = 0;

  /** Start the next queued keys while a prefetch slot is free. */
  function pump(): void {
    while (!disposed && prefetching < NPC_PREFETCH_CONCURRENCY) {
      const key = queue.shift();
      if (key === undefined) return;
      // `request` may have started it since it was queued.
      if (states.has(key)) continue;
      const glb = glbFor(key);
      if (glb === undefined) continue;
      prefetching += 1;
      fetchKey(key, glb, () => {
        prefetching -= 1;
        pump();
      });
    }
  }

  function fetchKey(key: string, glb: string, done?: () => void): void {
    states.set(key, "loading");
    const settle = (error: unknown): void => {
      void error;
      if (!disposed) states.set(key, "failed");
      done?.();
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
      done?.();
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
    prefetch(keys): void {
      if (disposed) return;
      for (const key of keys) {
        if (!states.has(key) && !queue.includes(key)) queue.push(key);
      }
      pump();
    },
    loaded(): ReadonlyMap<string, GLTF> {
      return models;
    },
    dispose(): void {
      disposed = true;
      queue.length = 0;
      states.clear();
      models.clear();
    },
  };
}
