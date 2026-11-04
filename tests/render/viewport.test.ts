// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The viewport -> projection contract (WORLD-02, G-03-2).
 *
 * Node only, no WebGL. A `PerspectiveCamera` computes its projection matrix in
 * the constructor and on `updateProjectionMatrix()`, so the numbers here are
 * the ones the GPU receives.
 *
 * The proof is the uniform-projection invariant: for a perspective camera,
 * `projectionMatrix.elements[0] * aspect === projectionMatrix.elements[5]`.
 * When it holds, one world unit spans the same number of pixels horizontally
 * and vertically, so a sphere stays a sphere. When a 2.222:1 viewport is
 * projected with `aspect = 1`, `elements[0]` is 2.222x too large and every
 * circle becomes an ellipse — the defect this plan removes.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { applyViewport, aspectOf } from "../../src/render/viewport.js";

/** The same optics the real system/menu cameras use. */
function createCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(57.2, 1, 0.5, 2_500_000);
}

function projection(camera: THREE.PerspectiveCamera): number[] {
  return [...camera.projectionMatrix.elements];
}

/** One world unit spans the same pixels on both axes. */
function expectUniform(camera: THREE.PerspectiveCamera): void {
  const elements = camera.projectionMatrix.elements;
  const horizontal = elements[0] ?? Number.NaN;
  const vertical = elements[5] ?? Number.NaN;
  expect(horizontal * camera.aspect).toBeCloseTo(vertical, 12);
  // toBeCloseTo's 12 digits is stricter than 1e-9 on this magnitude; assert the
  // plan's stated tolerance explicitly as well.
  expect(Math.abs(horizontal * camera.aspect - vertical)).toBeLessThan(1e-9);
}

describe("applyViewport", () => {
  it("sets a 2222x1000 viewport to 2.222 and stays uniform", () => {
    const camera = createCamera();

    expect(applyViewport(camera, { width: 2222, height: 1000 })).toBe(true);
    expect(camera.aspect).toBeCloseTo(2.222, 12);
    expectUniform(camera);
  });

  it("leaves a 1:1 viewport with equal horizontal and vertical scale", () => {
    const camera = createCamera();

    expect(applyViewport(camera, { width: 1000, height: 1000 })).toBe(true);
    expect(camera.aspect).toBe(1);
    const elements = camera.projectionMatrix.elements;
    expect(elements[0] ?? Number.NaN).toBe(elements[5] ?? Number.NaN);
    expectUniform(camera);
  });

  it("stays uniform at 16:9, so the fix is not ultrawide-specific", () => {
    const camera = createCamera();

    expect(applyViewport(camera, { width: 1920, height: 1080 })).toBe(true);
    expect(camera.aspect).toBeCloseTo(16 / 9, 12);
    expectUniform(camera);
  });

  it.each([
    ["zero width", { width: 0, height: 1000 }],
    ["zero height", { width: 1600, height: 0 }],
    ["NaN width", { width: Number.NaN, height: 900 }],
    ["negative width", { width: -8, height: 8 }],
    ["infinite height", { width: 800, height: Number.POSITIVE_INFINITY }],
  ])("rejects a %s viewport without touching the projection", (_name, size) => {
    const camera = createCamera();
    // Start from a known-good 2.222 projection so "unchanged" is meaningful.
    applyViewport(camera, { width: 2222, height: 1000 });
    const aspectBefore = camera.aspect;
    const projectionBefore = projection(camera);

    expect(applyViewport(camera, size)).toBe(false);
    expect(camera.aspect).toBe(aspectBefore);
    expect(projection(camera)).toEqual(projectionBefore);
  });
});

describe("aspectOf", () => {
  it("returns the ratio for a usable size", () => {
    expect(aspectOf({ width: 1600, height: 1000 })).toBeCloseTo(1.6, 12);
  });

  it("returns undefined for anything that would divide by zero", () => {
    expect(aspectOf({ width: 0, height: 1000 })).toBeUndefined();
    expect(aspectOf({ width: 1600, height: 0 })).toBeUndefined();
    expect(aspectOf({ width: Number.NaN, height: 900 })).toBeUndefined();
    expect(aspectOf({ width: -8, height: 8 })).toBeUndefined();
  });
});
