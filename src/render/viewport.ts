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
 * and is the **only** writer of `camera.aspect` in the codebase. A second writer
 * is exactly how the constructor-time `aspect: 1` survived into the flight
 * camera; do not add one.
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
 * Write the viewport's aspect onto `camera` and rebuild its projection matrix.
 *
 * Returns `false` and leaves the camera untouched when the size is unusable
 * (see `aspectOf`), so callers can treat a degenerate viewport as a no-op.
 * Returns `true` when the aspect was applied.
 */
export function applyViewport(
  camera: THREE.PerspectiveCamera,
  size: ViewportSize,
): boolean {
  const aspect = aspectOf(size);
  if (aspect === undefined) return false;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  return true;
}
