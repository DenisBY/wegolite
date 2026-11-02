// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import * as THREE from "three";
import { cameraRelative, f32Ulp } from "./render/camera-relative.js";
import { createPrecisionScene, FAR_M, NEAR_M } from "./render/precision-scene.js";

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
}

declare global {
  interface Window {
    __wegolite?: WegoliteProbe;
  }
}

interface CameraWorld {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The camera never leaves the origin; it carries orientation only. */
export const CAMERA_WORLD: CameraWorld = { x: 0, y: 0, z: 0 };

/** Only the camera-relative subtraction is allowed to touch Object3D.position. */
function place(obj: THREE.Object3D, world: CameraWorld): void {
  const relative = cameraRelative(world, CAMERA_WORLD);
  obj.position.set(relative.x, relative.y, relative.z);
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

const canvas = requireCanvas();
const renderer = buildRenderer(canvas);
const gl = renderer.getContext();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2_500_000);
camera.position.set(0, 0, 0);
camera.lookAt(0, 0, -1);

const { scene: precisionScene, nearBox, farMarker } = createPrecisionScene();
scene.add(precisionScene);

place(nearBox, { x: 0, y: 0, z: -NEAR_M });
// The distinct far body at (0, 0, -FAR_M) arrives with task 3's starfield.

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

renderer.render(scene, camera);

// Published after the first render so `ready` implies the probe's numbers are real.
window.__wegolite = {
  ready: true,
  calls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  logDepth: renderer.capabilities.logarithmicDepthBuffer,
  depthBits: gl.getParameter(gl.DEPTH_BITS) as number,
  webgl2: gl instanceof WebGL2RenderingContext,
  nearRelZ: nearBox.position.z,
  farRelZ: farMarker.position.z,
  farUlp: f32Ulp(FAR_M),
};
