// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/// <reference types="vite/client" />

import * as THREE from "three";
import manifest from "./content/generated/manifest.json";
import { assertContentManifest } from "./content/index.js";
import { LAZY_GALAXY_COUNT, galaxy0 } from "./content/systems.js";
import {
  cameraRelative,
  f32Ulp,
  type Point3,
} from "./render/camera-relative.js";
import {
  createPrecisionScene,
  FAR_M,
  FAR_WORLD,
  NEAR_WORLD,
} from "./render/precision-scene.js";

export interface WegoliteProbe {
  ready: boolean;
  calls: number;
  triangles: number;
  logDepth: boolean;
  depthBits: number;
  webgl2: boolean;
  nearRelZ: number;
  farRelZ: number;
  farUlp: number;
  renders: number;
  homeSystems: number;
  codeSplitGalaxies: number;
}

declare global {
  interface Window {
    __wegolite?: WegoliteProbe;
  }
}

export type CameraWorld = Point3;

/** The camera never leaves the origin; it carries orientation only. */
export const CAMERA_WORLD: CameraWorld = { x: 0, y: 0, z: 0 };

/** Only the camera-relative subtraction is allowed to touch Object3D.position. */
function place(obj: THREE.Object3D, world: Point3): void {
  const relative = cameraRelative(world, CAMERA_WORLD);
  obj.position.set(relative.x, relative.y, relative.z);
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      `Wegolite: expected an element with id "${id}", but it is missing.`,
    );
  }
  return element;
}

function requireCanvas(): HTMLCanvasElement {
  const element = document.getElementById("view");
  if (!(element instanceof HTMLCanvasElement)) {
    throw new Error(
      'Wegolite: expected a <canvas id="view"> in the document, but it is missing or is not a canvas element.',
    );
  }
  return element;
}

function buildRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      stencil: false,
      powerPreference: "high-performance",
      // Never combine with reversedDepthBuffer: r187 silently disables log depth.
      logarithmicDepthBuffer: true,
    });
  } catch (cause) {
    // V7: never leave a blank canvas silently.
    throw new Error(
      "WebGL2 is required to run Wegolite: the browser could not create a WebGL2 context.",
      { cause },
    );
  }

  const gl = renderer.getContext();
  if (
    typeof WebGL2RenderingContext === "undefined" ||
    !(gl instanceof WebGL2RenderingContext)
  ) {
    throw new Error(
      "WebGL2 is required to run Wegolite: this browser does not expose a WebGL2 context.",
    );
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

// D-15: the manifest is the only content this app validates at runtime; every
// record was already validated at build time. The assertion runs before the
// renderer exists, so a mismatched manifest throws a named error instead of
// booting into a plausible-looking blank game (T-02-23).
const content = assertContentManifest(manifest);
console.info(
  `Wegolite: content compiled from Oolite ${content.oolite.release} (${content.oolite.commit}).`,
);

const canvas = requireCanvas();
const renderer = buildRenderer(canvas);
const gl = renderer.getContext();
const depthBits = gl.getParameter(gl.DEPTH_BITS) as number;

const statusElement = requireElement("status");
const statsElement = requireElement("stats");

const { scene, nearBox, farMarker, starfield } = createPrecisionScene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2_500_000);
camera.position.set(0, 0, 0);
camera.lookAt(0, 0, -1);

// Every body goes through the one transform. The starfield sits at the camera
// so it never drifts out of the frustum.
place(nearBox, NEAR_WORLD);
place(farMarker, FAR_WORLD);
place(starfield, CAMERA_WORLD);

function renderFrame(): void {
  renderer.render(scene, camera);
  // The probe is published after the boot render, so the guard keeps that
  // first call safe while still refreshing from three's own counters.
  if (window.__wegolite) {
    window.__wegolite.calls = renderer.info.render.calls;
    window.__wegolite.triangles = renderer.info.render.triangles;
    window.__wegolite.renders = renderer.info.render.frame;
  }
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  // A minimised or hidden window reports a zero dimension; resizing to it
  // would compute an Infinity aspect and an empty drawing buffer.
  if (width === 0 || height === 0) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderFrame();
}

window.addEventListener("resize", resize);
resize();

// D-05: a static status line, always visible, written with textContent (S-7).
statusElement.textContent =
  "Wegolite — foundation build · near box at 1e5 m · far marker at 1.4e6 m";

// D-05: the renderer stats line exists only in development.
if (import.meta.env.DEV) {
  statsElement.textContent = [
    `draw calls: ${renderer.info.render.calls}`,
    `triangles: ${renderer.info.render.triangles}`,
    `depth bits: ${depthBits}`,
    `log depth: ${String(renderer.capabilities.logarithmicDepthBuffer)}`,
  ].join(" · ");
} else {
  statsElement.hidden = true;
}

// Published after the first render so `ready` implies the probe's numbers are real.
window.__wegolite = {
  ready: true,
  calls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  logDepth: renderer.capabilities.logarithmicDepthBuffer,
  depthBits,
  webgl2: gl instanceof WebGL2RenderingContext,
  nearRelZ: nearBox.position.z,
  farRelZ: farMarker.position.z,
  farUlp: f32Ulp(FAR_M),
  renders: renderer.info.render.frame,
  // D-14: galaxy 0 is eager, so it is in this bundle; g1-g7 are code-split.
  homeSystems: galaxy0().length,
  codeSplitGalaxies: LAZY_GALAXY_COUNT,
};
