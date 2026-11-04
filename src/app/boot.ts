// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The boot sequence, extracted from `main.ts` (T-3-19, T-3-21, Pitfall 14).
 *
 * The order is load-bearing and deliberately not a single `try`:
 *
 * 1. `assertContentManifest` is the **first statement of `bootApp`, outside the
 *    renderer `try`/`catch`**. A `ContentBoundaryError` must propagate as a
 *    named error before a renderer exists, so a content bug is never converted
 *    into "Wegolite needs WebGL2" and never leaves a blank canvas.
 * 2. The renderer is created and verified to really be WebGL2 inside one
 *    `try`/`catch`; every failure there becomes `{ ok: false, reason }`.
 *
 * `reason` is a short app-owned message, never a stack trace or a host path:
 * the fallback surface writes it with `textContent`.
 */

import * as THREE from "three";
import { assertContentManifest } from "../content/index.js";
import { applyOutputContract } from "../render/exposure.js";

/** Create a renderer from the canvas. Injectable so the manifest proof is Node-only. */
export type RendererFactory = (
  canvas: HTMLCanvasElement,
) => THREE.WebGLRenderer;

export interface BootOptions {
  /** The imported manifest; validated first and outside the renderer catch. */
  readonly manifest: unknown;
  readonly canvas: HTMLCanvasElement;
  /** Defaults to `new THREE.WebGLRenderer(...)`. */
  readonly rendererFactory?: RendererFactory;
}

export type BootResult =
  | { readonly ok: true; readonly renderer: THREE.WebGLRenderer }
  | { readonly ok: false; readonly reason: string };

const RENDERER_CREATION_REASON =
  "WebGL2 is required to run Wegolite: the browser could not create a WebGL2 context.";
const CONTEXT_REASON =
  "WebGL2 is required to run Wegolite: this browser does not expose a WebGL2 context.";

function defaultRendererFactory(
  canvas: HTMLCanvasElement,
): THREE.WebGLRenderer {
  try {
    return new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      stencil: false,
      powerPreference: "high-performance",
      // Never combine with reversedDepthBuffer: r187 silently disables log depth.
      logarithmicDepthBuffer: true,
    });
  } catch (cause) {
    // V7: the fallback surface explains this; never rethrow a raw WebGL error.
    throw new Error(RENDERER_CREATION_REASON, { cause });
  }
}

/**
 * Build and verify the renderer. Throws on any failure; `bootApp` converts that
 * into the `{ ok: false, reason }` shape. The DPR cap is byte-equivalent to the
 * pre-extraction `main.ts`; the output contract (sRGB once, no tone map,
 * exposure 1) lives in `src/render/exposure.ts` so no caller can set a second
 * one here.
 */
export function buildRenderer(
  canvas: HTMLCanvasElement,
  factory: RendererFactory = defaultRendererFactory,
): THREE.WebGLRenderer {
  const renderer = factory(canvas);

  const gl = renderer.getContext();
  if (
    typeof WebGL2RenderingContext === "undefined" ||
    !(gl instanceof WebGL2RenderingContext)
  ) {
    throw new Error(CONTEXT_REASON);
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  applyOutputContract(renderer);
  return renderer;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validate the content manifest, then build the renderer.
 *
 * @throws {ContentBoundaryError} synchronously when the manifest is invalid.
 * This throw is **not** caught here, and it is not converted into a rejected
 * promise either: the caller sees the same module-level throw the pre-extraction
 * `main.ts` produced.
 */
export function bootApp(options: BootOptions): Promise<BootResult> {
  // T-3-21: first statement, outside the renderer `try`. Do not move it in.
  const content = assertContentManifest(options.manifest);
  console.info(
    `Wegolite: content compiled from Oolite ${content.oolite.release} (${content.oolite.commit}).`,
  );

  try {
    return Promise.resolve({
      ok: true,
      renderer: buildRenderer(options.canvas, options.rendererFactory),
    });
  } catch (error) {
    return Promise.resolve({ ok: false, reason: reasonOf(error) });
  }
}
