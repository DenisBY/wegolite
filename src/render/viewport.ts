// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The viewport -> projection bridge (WORLD-02, G-03-2).
 *
 * `camera-relative.ts` is the closest analogue: a small, typed render-layer
 * helper with one responsibility, no DOM access and no Three import beyond
 * types, so a Node test can import it directly.
 *
 * Every `PerspectiveCamera` in the render layer is constructed with `aspect = 1`
 * (the pure render modules must not read `window`). This module corrects that
 * projection from a size the caller already holds — the renderer's CSS size —
 * and is the **only** writer of `camera.aspect` and `camera.fov` in the
 * codebase. A second writer is exactly how the constructor-time `aspect: 1`
 * survived into the flight camera; do not add one.
 *
 * The field of view follows Oolite's frustum rule (`Universe.m:4445-4452`,
 * `viewTangents` below; quick task 261117-o8q replaced the Phase 3 vertical
 * 57.2 degrees). The HUD reads the same rule: the scanner's forward-view lines
 * take `viewTangents(aspect, "flight").x`, and the ident frame projects through
 * the live camera's `fov` and `aspect` that this module wrote.
 *
 * A zero, negative or non-finite dimension must leave the projection untouched:
 * `width / height` with `height === 0` is `Infinity`, which makes every later
 * frame unprojectable (a hidden or minimised window reports zero).
 */

import type * as THREE from "three";

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The aspect a camera should use, or `undefined` when the size is unusable.
 *
 * Both dimensions must be finite and strictly positive; anything else is
 * rejected rather than coerced, so a degenerate window never yields Infinity.
 */
export function aspectOf(size: ViewportSize): number | undefined {
  const { width, height } = size;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return width / height;
}

/**
 * Oolite's default `fov-value` in degrees (`Universe.m:755`), stored as the
 * tangent of the half angle (`MyOpenGLView.m:1282-1290`). The flight view spans
 * this angle across the width when the window is at least 4:3 wide.
 */
export const OOLITE_FOV_DEGREES = 57.2;

/** Oolite's GUI field-of-view ratio (`Universe.m:4445`). */
const GUI_RATIO = 0.5;

/** The flight view's half-angle tangent, Oolite's `[gameView fov:YES]`. */
const FLIGHT_RATIO = Math.tan((OOLITE_FOV_DEGREES / 2) * (Math.PI / 180));

/**
 * Which branch of Oolite's frustum rule a camera follows: `flight` for the
 * space view (`displayGUI = NO`), `gui` for screens Oolite draws with
 * `displayGUI = YES`, such as the intro Cobra (`Universe.m:2987`).
 */
export type ViewKind = "flight" | "gui";

/** Half-angle tangents of a view: `x` horizontal, `y` vertical. */
export interface ViewTangents {
  readonly x: number;
  readonly y: number;
}

/**
 * Oolite's frustum rule (`Universe.m:4445-4452`) for a Three.js aspect
 * `width / height`.
 *
 * Oolite's own `aspect` is `height / width` (`Universe.m:4385`), so its test
 * `4 * aspect <= 3` is `aspect >= 4 / 3` here. The near plane's
 * `distanceFactor` divides both the ratio and the near distance, so it cancels
 * and only `ratio` (the flight tangent, or 0.5 for a GUI) shapes the angles:
 *
 * - flight, at least 4:3 wide: `x = ratio`, `y = ratio / aspect` (the angle
 *   spans the width);
 * - flight, narrower than 4:3: `y = 0.75 * ratio`, `x = y * aspect` (the
 *   vertical angle it has at 4:3);
 * - gui, at most 4:3 wide: `x = 0.5`, `y = 0.5 / aspect`;
 * - gui, wider than 4:3: `y = 0.375`, `x = 0.375 * aspect`.
 *
 * Both branches meet at exactly 4:3 in both views. A non-finite or
 * non-positive aspect throws a `RangeError`: every caller guards first, so a
 * throw means a real bug rather than a degenerate window.
 */
export function viewTangents(aspect: number, view: ViewKind): ViewTangents {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    throw new RangeError(`viewTangents: unusable aspect ${String(aspect)}`);
  }
  const ratio = view === "gui" ? GUI_RATIO : FLIGHT_RATIO;
  const spansWidth = view === "gui" ? aspect <= 4 / 3 : aspect >= 4 / 3;
  if (spansWidth) return { x: ratio, y: ratio / aspect };
  const y = 0.75 * ratio;
  return { x: y * aspect, y };
}

/** The vertical field of view in degrees (`PerspectiveCamera.fov`) of a view. */
export function viewFovYDegrees(aspect: number, view: ViewKind): number {
  return 2 * Math.atan(viewTangents(aspect, view).y) * (180 / Math.PI);
}

/**
 * Write the viewport's aspect and the rule's vertical field of view onto
 * `camera` and rebuild its projection matrix.
 *
 * Returns `false` and leaves the camera untouched when the size is unusable
 * (see `aspectOf`), so callers can treat a degenerate viewport as a no-op.
 * Returns `true` when the aspect and field of view were applied.
 */
export function applyViewport(
  camera: THREE.PerspectiveCamera,
  size: ViewportSize,
  view: ViewKind = "flight",
): boolean {
  const aspect = aspectOf(size);
  if (aspect === undefined) return false;
  camera.aspect = aspect;
  camera.fov = viewFovYDegrees(aspect, view);
  camera.updateProjectionMatrix();
  return true;
}
