// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Scene lifecycle (Pattern 3, WORLD-04 groundwork).
 *
 * `AssetCache` owns the shared GLBs; a `SystemScene` owns only what it creates.
 * A swap builds the new scene, installs it, then disposes the old one and clears
 * the renderer's list cache, so no GPU resource is orphaned and no cached model
 * is disposed.
 *
 * `enterMenu()` installs an empty scene for now: the title screen is DOM, and
 * plan 03 creates `src/render/menu-scene.ts`. Plan 09 wires that scene in here —
 * the empty scene is a hand-off, not the finished state.
 */

import * as THREE from "three";
import type { ShipDef, System } from "../content/types.js";
import { deriveSystemLayout } from "../sim/world/layout.js";
import type { SystemLayout } from "../sim/world/layout.js";
import type { AssetCache } from "../render/asset-cache.js";
import { createSystemScene } from "../render/system-scene.js";
import type { SystemScene } from "../render/system-scene.js";

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
  dispose(): void;
}

export function createSceneManager(
  renderer: THREE.WebGLRenderer,
  assets: AssetCache,
): SceneManager {
  const menu: ActiveScene = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(57.2, 1, 0.5, 2_500_000),
  };

  let current: SystemScene | undefined;
  let currentLayout: SystemLayout | undefined;

  return {
    enterMenu(): void {
      // Plan 03 installs the title scene here; until then the title is DOM only.
      current?.dispose();
      current = undefined;
      currentLayout = undefined;
      renderer.renderLists.dispose();
    },
    enterSystem(system, stationDef): SystemScene {
      const layout = deriveSystemLayout(system, stationDef);
      const next = createSystemScene(layout, assets);
      const previous = current;
      current = next;
      currentLayout = layout;
      previous?.dispose();
      renderer.renderLists.dispose();
      return next;
    },
    active(): ActiveScene {
      return current ?? menu;
    },
    layout(): SystemLayout | undefined {
      return currentLayout;
    },
    dispose(): void {
      current?.dispose();
      current = undefined;
      currentLayout = undefined;
      renderer.renderLists.dispose();
    },
  };
}
