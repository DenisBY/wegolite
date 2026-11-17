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

import {
  applyViewport,
  aspectOf,
  OOLITE_FOV_DEGREES,
  viewFovYDegrees,
  viewTangents,
} from "../../src/render/viewport.js";

/** The same optics the real system cameras use before the first install. */
function createCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(
    viewFovYDegrees(1, "flight"),
    1,
    0.5,
    2_500_000,
  );
}

const DEG = Math.PI / 180;
/** Oolite's default `fov-value` as its half-angle tangent (`MyOpenGLView.m:1284`). */
const F = Math.tan(28.6 * DEG);

function fovYDegrees(tanY: number): number {
  return (2 * Math.atan(tanY)) / DEG;
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

describe("viewTangents (Oolite's frustum rule, Universe.m:4445-4452)", () => {
  it("spans the default 57.2 degrees across the width of a 16:9 flight view", () => {
    expect(OOLITE_FOV_DEGREES).toBe(57.2);
    const t = viewTangents(16 / 9, "flight");
    expect(Math.abs(t.x - F)).toBeLessThan(1e-12);
    expect(Math.abs(t.y - (F * 9) / 16)).toBeLessThan(1e-12);
    expect(Math.abs((2 * Math.atan(t.x)) / DEG - 57.2)).toBeLessThan(1e-9);
    expect(viewFovYDegrees(16 / 9, "flight")).toBeCloseTo(34.1, 4);
  });

  it("meets at exactly 4:3 in the flight view", () => {
    const at = viewTangents(4 / 3, "flight");
    expect(Math.abs(at.x - F)).toBeLessThan(1e-12);
    expect(Math.abs(at.y - 0.75 * F)).toBeLessThan(1e-12);
    for (const aspect of [4 / 3 - 1e-9, 4 / 3 + 1e-9]) {
      const near = viewTangents(aspect, "flight");
      expect(Math.abs(near.x - F)).toBeLessThan(1e-6);
      expect(Math.abs(near.y - 0.75 * F)).toBeLessThan(1e-6);
    }
    expect(viewFovYDegrees(4 / 3, "flight")).toBeCloseTo(44.4806, 4);
  });

  it("keeps the 4:3 vertical angle in a flight view narrower than 4:3", () => {
    const square = viewTangents(1, "flight");
    expect(Math.abs(square.x - 0.75 * F)).toBeLessThan(1e-12);
    expect(Math.abs(square.y - 0.75 * F)).toBeLessThan(1e-12);
    expect(viewFovYDegrees(1, "flight")).toBeCloseTo(44.4806, 4);

    const portrait = viewTangents(3 / 4, "flight");
    expect(Math.abs(portrait.y - 0.75 * F)).toBeLessThan(1e-12);
    expect(Math.abs(portrait.x - 0.5625 * F)).toBeLessThan(1e-12);
  });

  it("spans the width of an ultrawide flight view", () => {
    const t = viewTangents(2222 / 1000, "flight");
    expect(Math.abs(t.x - F)).toBeLessThan(1e-12);
    expect(Math.abs(t.y - F / 2.222)).toBeLessThan(1e-12);
    expect(viewFovYDegrees(1600 / 1000, "flight")).toBeCloseTo(37.6342, 4);
  });

  it("uses the GUI ratio 0.5 inside a 4:3 box for the gui view", () => {
    const wide = viewTangents(16 / 9, "gui");
    expect(Math.abs(wide.y - 0.375)).toBeLessThan(1e-12);
    expect(Math.abs(wide.x - (0.375 * 16) / 9)).toBeLessThan(1e-12);
    expect(viewFovYDegrees(16 / 9, "gui")).toBeCloseTo(41.1121, 4);

    const fourThree = viewTangents(4 / 3, "gui");
    expect(Math.abs(fourThree.x - 0.5)).toBeLessThan(1e-12);
    expect(Math.abs(fourThree.y - 0.375)).toBeLessThan(1e-12);

    const square = viewTangents(1, "gui");
    expect(Math.abs(square.x - 0.5)).toBeLessThan(1e-12);
    expect(Math.abs(square.y - 0.5)).toBeLessThan(1e-12);
    expect(viewFovYDegrees(1, "gui")).toBeCloseTo(53.1301, 4);

    const portrait = viewTangents(3 / 4, "gui");
    expect(Math.abs(portrait.x - 0.5)).toBeLessThan(1e-12);
    expect(Math.abs(portrait.y - 0.5 / 0.75)).toBeLessThan(1e-12);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "throws a RangeError for an aspect of %s",
    (aspect) => {
      expect(() => viewTangents(aspect, "flight")).toThrow(RangeError);
      expect(() => viewTangents(aspect, "gui")).toThrow(RangeError);
    },
  );
});

describe("applyViewport writes the rule's field of view", () => {
  it("projects 1280x720 with 57.2 degrees across the width", () => {
    const camera = createCamera();
    expect(applyViewport(camera, { width: 1280, height: 720 })).toBe(true);
    expect(camera.fov).toBeCloseTo(fovYDegrees((F * 9) / 16), 9);
    expect(camera.fov).toBeCloseTo(34.1, 4);
    const e = camera.projectionMatrix.elements;
    expect(Math.abs((e[0] ?? Number.NaN) - 1 / F)).toBeLessThan(1e-9);
    expect(Math.abs((e[5] ?? Number.NaN) - 1 / ((F * 9) / 16))).toBeLessThan(
      1e-9,
    );
    expectUniform(camera);

    // The resize path: the same camera at 1000x1000 keeps the 4:3 height.
    expect(applyViewport(camera, { width: 1000, height: 1000 })).toBe(true);
    expect(camera.fov).toBeCloseTo(fovYDegrees(0.75 * F), 9);
    expect(camera.fov).toBeCloseTo(44.4806, 4);
    const square = camera.projectionMatrix.elements;
    expect(Math.abs((square[0] ?? Number.NaN) - 1 / (0.75 * F))).toBeLessThan(
      1e-9,
    );
    expect(Math.abs((square[5] ?? Number.NaN) - 1 / (0.75 * F))).toBeLessThan(
      1e-9,
    );
  });

  it("projects the gui view at 1600x1000 with a vertical 0.375", () => {
    const camera = createCamera();
    expect(applyViewport(camera, { width: 1600, height: 1000 }, "gui")).toBe(
      true,
    );
    const e = camera.projectionMatrix.elements;
    expect(Math.abs((e[5] ?? Number.NaN) - 1 / 0.375)).toBeLessThan(1e-9);
    expectUniform(camera);
  });

  it("leaves the fov unchanged when the size is rejected", () => {
    const camera = createCamera();
    applyViewport(camera, { width: 1280, height: 720 });
    const fovBefore = camera.fov;
    expect(applyViewport(camera, { width: 0, height: 720 }, "gui")).toBe(false);
    expect(camera.fov).toBe(fovBefore);
  });

  it("shows a ship ahead 16/9 times wider at 1280x720 than the old vertical 57.2", () => {
    const width = 1280;
    const height = 720;
    const spanPx = (camera: THREE.PerspectiveCamera): number => {
      camera.updateMatrixWorld(true);
      const left = new THREE.Vector3(-5, 0, -1500).project(camera);
      const right = new THREE.Vector3(5, 0, -1500).project(camera);
      return ((right.x - left.x) / 2) * width;
    };

    const camera = createCamera();
    applyViewport(camera, { width, height });
    const now = spanPx(camera);
    expect(Math.abs(now - (10 / 1500 / F) * (width / 2))).toBeLessThan(1e-9);
    expect(now).toBeCloseTo(7.83, 2);

    const old = new THREE.PerspectiveCamera(
      57.2,
      width / height,
      0.5,
      2_500_000,
    );
    const before = spanPx(old);
    expect(before).toBeCloseTo(4.4, 1);
    expect(Math.abs(now / before / (16 / 9) - 1)).toBeLessThan(1e-9);
  });
});
