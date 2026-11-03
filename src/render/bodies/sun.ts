// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The sun disc and its corona (WORLD-03, D-03, Fidelity correction 4).
 *
 * The `corona_*` names are misleading and are read exactly as Oolite reads
 * them:
 *
 * - `corona_flare` sets the **outer radius**: `R * (1 + 8 * flare)`, which is
 *   1.2282R for Lave — a thin rim, not a 3-4R halo;
 * - `corona_hues` is `corona_blending`, a 0-1 blend between two inner corona
 *   layers, not a hue;
 * - `corona_shimmer` is an animation **speed**, not an intensity.
 *
 * The disc is an unlit `MeshBasicMaterial` sphere (`toneMapped: false`). The
 * corona is a camera-facing plane with a deterministically generated
 * `CanvasTexture` radial gradient, additive and depth-write-off but
 * depth-test-on, so it glows around the disc without punching through it. Both
 * use built-in materials, which keeps the logarithmic-depth contract for free.
 */

import * as THREE from "three";
import type { System } from "../../content/types.js";
import { clamp } from "../../sim/math.js";
import { LayoutError } from "../../sim/world/layout.js";

/** The GPU-facing sun: the disc, the corona plane and the shimmer step. */
export interface SunBody {
  readonly sun: THREE.Mesh;
  readonly corona: THREE.Mesh;
  /** The corona's outer radius in metres (`R * (1 + 8 * corona_flare)`). */
  readonly coronaRadius: number;
  update(elapsedSeconds: number, camera: THREE.Camera): void;
  dispose(): void;
}

/** Texture resolution; the gradient is smooth, so 256 px is plenty. */
const CORONA_TEXTURE_SIZE = 256;

function rgba(color: readonly [number, number, number], alpha: number): string {
  const r = Math.round(clamp(color[0], 0, 1) * 255);
  const g = Math.round(clamp(color[1], 0, 1) * 255);
  const b = Math.round(clamp(color[2], 0, 1) * 255);
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/**
 * Draw one radial layer of the corona.
 *
 * The disc occupies `R / coronaRadius` of the plane's half-extent (0.814 for
 * Lave); the layer is solid enough to read at the limb and fades to nothing at
 * the authored outer radius.
 */
function drawCoronaLayer(
  context: CanvasRenderingContext2D,
  centre: number,
  color: readonly [number, number, number],
  innerAlpha: number,
  innerRadius: number,
): void {
  const gradient = context.createRadialGradient(
    centre,
    centre,
    0,
    centre,
    centre,
    centre,
  );
  gradient.addColorStop(0, rgba(color, innerAlpha));
  gradient.addColorStop(innerRadius, rgba(color, innerAlpha * 0.6));
  gradient.addColorStop(0.94, rgba(color, innerAlpha * 0.18));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, centre * 2, centre * 2);
}

/**
 * The two-layer corona gradient, blended by `corona_hues`.
 *
 * Layer A is the sun's own colour (white for Lave); layer B is a warmer amber
 * drawn a little wider. The blend is the authored `corona_blending` value, so
 * `corona_hues` changes the inner corona's look rather than its brightness.
 */
function createCoronaTexture(
  system: System,
  sunColor: readonly [number, number, number, number],
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CORONA_TEXTURE_SIZE;
  canvas.height = CORONA_TEXTURE_SIZE;

  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error(
      "Wegolite: the sun corona needs a 2D canvas context, but the browser refused one.",
    );
  }

  const centre = CORONA_TEXTURE_SIZE / 2;
  const blend = clamp(system.corona_hues, 0, 1);
  const discRadius = 1 / (1 + 8 * system.corona_flare);

  context.globalCompositeOperation = "lighter";
  context.globalAlpha = 1 - blend;
  drawCoronaLayer(
    context,
    centre,
    [sunColor[0], sunColor[1], sunColor[2]],
    0.5,
    discRadius,
  );

  context.globalAlpha = blend;
  drawCoronaLayer(context, centre, [1, 0.72, 0.38], 0.42, discRadius * 0.94);
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Build the sun body.
 *
 * @throws {LayoutError} when `sunRadius` is not a positive finite number.
 */
export function createSun(
  system: System,
  sunRadius: number,
  sunColor: readonly [number, number, number, number],
): SunBody {
  if (!Number.isFinite(sunRadius) || sunRadius <= 0) {
    throw new LayoutError(
      `Wegolite: the sun radius must be positive and finite (received ${String(sunRadius)}).`,
    );
  }

  const color = new THREE.Color(sunColor[0], sunColor[1], sunColor[2]);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(sunRadius, 64, 32),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  sun.name = "sun";

  const coronaRadius = sunRadius * (1 + 8 * system.corona_flare);
  const texture = createCoronaTexture(system, sunColor);
  const coronaMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const corona = new THREE.Mesh(
    new THREE.PlaneGeometry(coronaRadius * 2, coronaRadius * 2),
    coronaMaterial,
  );
  corona.name = "sun-corona";

  const shimmer = system.corona_shimmer;

  return {
    sun,
    corona,
    coronaRadius,
    update(elapsedSeconds: number, camera: THREE.Camera): void {
      // The corona always faces the viewer; `camera` is at the origin and only
      // rotates, so its world quaternion is the orientation to copy.
      corona.quaternion.copy(camera.quaternion);

      // `corona_shimmer` is a speed: it changes how fast the glow breathes,
      // never how bright the tuned gradient is.
      const phase = elapsedSeconds * shimmer * Math.PI * 2;
      corona.scale.setScalar(1 + 0.01 * Math.sin(phase));
      coronaMaterial.opacity = 0.9 + 0.1 * Math.sin(phase * 0.5);
    },
    dispose(): void {
      sun.geometry.dispose();
      sun.material.dispose();
      corona.geometry.dispose();
      coronaMaterial.dispose();
      texture.dispose();
    },
  };
}
