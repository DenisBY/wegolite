// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Scene lifecycle (Pattern 3, WORLD-04).
 *
 * `AssetCache` owns the shared GLBs; a `SystemScene` owns only what it creates.
 * A swap builds the new scene first, installs it, then disposes the old one and
 * clears the renderer's list cache, so no GPU resource is orphaned and no
 * cached model is disposed. The build happens *before* the swap on purpose: a
 * factory that throws leaves the previous scene live rather than half-gone.
 *
 * `enterMenu()` is the single caller of plan 03's `src/render/menu-scene.ts`.
 * The menu needs the shared Cobra, which only exists once `AssetCache.preload()`
 * has resolved, so `enterMenu()` installs the real title scene when the cache is
 * loaded and plan 01's empty scene before that. `main.ts` re-enters the menu
 * once the background preload resolves, so every load ends up with a real title
 * scene (or a reported failure).
 */

import * as THREE from "three";
import type { ShipDef, System } from "../content/types.js";
import { deriveSystemLayout } from "../sim/world/layout.js";
import type { SystemLayout } from "../sim/world/layout.js";
import type { AssetCache } from "../render/asset-cache.js";
import { createMenuScene } from "../render/menu-scene.js";
import type { MenuScene } from "../render/menu-scene.js";
import {
  CAMERA_FAR,
  CAMERA_FOV_DEGREES,
  CAMERA_NEAR,
} from "../render/system-scene.js";
import { createSystemScene } from "../render/system-scene.js";
import type { SystemScene } from "../render/system-scene.js";
import { applyViewport } from "../render/viewport.js";

export interface ActiveScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
}

export interface SceneManager {
  enterMenu(): void;
  enterSystem(system: System, stationDef: ShipDef): SystemScene;
  active(): ActiveScene;
  /** The layout of the active system scene, or undefined while in the menu. */
  layout(): SystemLayout | undefined;
  /** Dispose only the active system scene; the menu and the cache survive. */
  disposeSystem(): void;
  dispose(): void;
}

function createCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(
    CAMERA_FOV_DEGREES,
    1,
    CAMERA_NEAR,
    CAMERA_FAR,
  );
}

/**
 * One scratch vector for every `getSize` call. Three's `getSize` reports CSS
 * pixels, so the device-pixel-ratio factor cancels when it becomes an aspect.
 */
const viewportScratch = new THREE.Vector2();

function rendererSize(renderer: THREE.WebGLRenderer): {
  readonly width: number;
  readonly height: number;
} {
  const size = renderer.getSize(viewportScratch);
  return { width: size.x, height: size.y };
}

export function createSceneManager(
  renderer: THREE.WebGLRenderer,
  assets: AssetCache,
): SceneManager {
  // The pre-load fallback: a real (empty) scene so `active()` never returns
  // undefined and the boot resize has something to render.
  const empty: ActiveScene = {
    scene: new THREE.Scene(),
    camera: createCamera(),
  };
  // The manager, not the pure render modules, owns the aspect: every camera it
  // installs — including this one — is projected from the renderer's current
  // size. No `window` access here (WORLD-02).
  applyViewport(empty.camera, rendererSize(renderer));

  let current: SystemScene | undefined;
  let currentLayout: SystemLayout | undefined;
  let menu: MenuScene | undefined;

  /** Dispose a swapped-out scene and clear the renderer's list cache. */
  function retire(
    previousSystem: SystemScene | undefined,
    previousMenu: MenuScene | undefined,
  ): void {
    try {
      previousSystem?.dispose();
    } finally {
      // Even if a scene's own disposal throws, the render lists must not keep
      // pointing at objects that are gone.
      previousMenu?.dispose();
      renderer.renderLists.dispose();
    }
  }

  /**
   * The commit point. `enterSystem` calls this once the destination, its layout
   * and the cleared menu are assigned. The install is the commit point, so the
   * call must return normally here: a failure while retiring the origin is
   * logged, not thrown, because the destination is already active. A thrown
   * error would tell the session the swap failed while the manager shows the
   * destination (W-1).
   */
  function retireCommitted(
    previousSystem: SystemScene | undefined,
    previousMenu: MenuScene | undefined,
  ): void {
    try {
      retire(previousSystem, previousMenu);
    } catch (error) {
      console.error("Wegolite: retiring the previous scene failed", error);
    }
  }

  /**
   * Dispose a destination built for a call that failed before its install. The
   * caller rethrows the original error; a disposal failure is logged here so it
   * cannot replace that error.
   */
  function disposeUninstalled(next: SystemScene): void {
    try {
      next.dispose();
    } catch (error) {
      console.error(
        "Wegolite: disposing an uninstalled system scene failed",
        error,
      );
    }
  }

  return {
    enterMenu(): void {
      // Build first: a throwing menu factory must not leave the manager with no
      // active scene at all.
      const next = assets.loaded() ? createMenuScene(assets) : undefined;
      // Apply before the retire so the replacement scene never renders a frame
      // at the constructor's 1:1 aspect. The `undefined` fallback is the empty
      // camera, which `active()` then returns.
      applyViewport(next?.camera ?? empty.camera, rendererSize(renderer));
      const previousSystem = current;
      const previousMenu = menu;
      current = undefined;
      currentLayout = undefined;
      menu = next;
      retire(previousSystem, previousMenu);
    },
    enterSystem(system, stationDef): SystemScene {
      const layout = deriveSystemLayout(system, stationDef);
      const next = createSystemScene(layout, assets, system);
      // `start()` and the `?test=1` swap both arrive here; applying the
      // viewport before the install is what makes the swap path safe too.
      // Pre-install: nothing is installed yet. A failed viewport step disposes
      // the destination built for this call and rethrows, so the origin scene,
      // its layout and the menu stay active.
      try {
        applyViewport(next.camera, rendererSize(renderer));
      } catch (error) {
        disposeUninstalled(next);
        throw error;
      }
      const previousSystem = current;
      const previousMenu = menu;
      current = next;
      currentLayout = layout;
      menu = undefined;
      retireCommitted(previousSystem, previousMenu);
      return next;
    },
    active(): ActiveScene {
      return current ?? menu ?? empty;
    },
    layout(): SystemLayout | undefined {
      return currentLayout;
    },
    disposeSystem(): void {
      const previousSystem = current;
      current = undefined;
      currentLayout = undefined;
      retire(previousSystem, undefined);
    },
    dispose(): void {
      const previousSystem = current;
      const previousMenu = menu;
      current = undefined;
      currentLayout = undefined;
      menu = undefined;
      retire(previousSystem, previousMenu);
    },
  };
}
