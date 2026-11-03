// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The procedural planet contract (WORLD-03, D-01, D-02, Pitfall 3, Pitfall 13).
 *
 * The shader source is asserted directly, so a missing log-depth or colour-space
 * chunk fails here rather than as a black planet or a wrong depth order in the
 * browser. The uniform values are pinned against Lave's compiled record, and
 * the rotation pin discriminates a static planet (identity at every time) and a
 * wrong spin axis from the researched `0.004504 rad/s` about local +Y.
 *
 * A length guard precedes the chunk assertions: a truncated or emptied shader
 * file must not satisfy `includes("")`-style checks vacuously.
 */

import { readFileSync } from "node:fs";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  createPlanet,
  landThresholdFor,
  seedToUniform,
} from "../../src/render/bodies/planet.js";
import {
  PLANET_FRAGMENT_SHADER,
  PLANET_VERTEX_SHADER,
} from "../../src/render/shaders/planet.glsl.js";
import { fnv1a32 } from "../../src/sim/hash.js";
import { axisAngle, rotateInverse } from "../../src/sim/math.js";
import { LayoutError } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";

const source = readFileSync(
  new URL("../../src/render/shaders/planet.glsl.ts", import.meta.url),
  "utf8",
);

const planetSource = readFileSync(
  new URL("../../src/render/bodies/planet.ts", import.meta.url),
  "utf8",
);

const { system, layout } = laveFixture();

function planet() {
  return createPlanet(
    system,
    layout.planet.radius,
    layout.sunDir,
    layout.rotationSpeed,
  );
}

function uniform<T>(material: THREE.ShaderMaterial, name: string): T {
  const entry = material.uniforms[name];
  if (entry === undefined) {
    throw new Error(`the planet material has no uniform "${name}"`);
  }
  return entry.value as T;
}

function color(value: THREE.Vector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

describe("planet shader source", () => {
  it("is long enough for the chunk assertions to mean something", () => {
    expect(source.length).toBeGreaterThan(1_000);
    expect(PLANET_VERTEX_SHADER.length).toBeGreaterThan(100);
    expect(PLANET_FRAGMENT_SHADER.length).toBeGreaterThan(500);
  });

  it("carries the log-depth chunks in the vertex shader", () => {
    expect(PLANET_VERTEX_SHADER).toContain("#include <common>");
    expect(PLANET_VERTEX_SHADER).toContain(
      "#include <logdepthbuf_pars_vertex>",
    );
    expect(PLANET_VERTEX_SHADER).toContain("#include <logdepthbuf_vertex>");
    expect(PLANET_VERTEX_SHADER).not.toContain(
      "#include <logdepthbuf_pars_fragment>",
    );
  });

  it("carries the fragment chunks in the order Three requires", () => {
    const common = PLANET_FRAGMENT_SHADER.indexOf("#include <common>");
    const pars = PLANET_FRAGMENT_SHADER.indexOf(
      "#include <logdepthbuf_pars_fragment>",
    );
    const tonemapping = PLANET_FRAGMENT_SHADER.indexOf(
      "#include <tonemapping_fragment>",
    );
    const colorspace = PLANET_FRAGMENT_SHADER.indexOf(
      "#include <colorspace_fragment>",
    );
    const logdepth = PLANET_FRAGMENT_SHADER.indexOf(
      "#include <logdepthbuf_fragment>",
    );

    expect(common).toBeGreaterThanOrEqual(0);
    expect(pars).toBeGreaterThan(common);
    expect(tonemapping).toBeGreaterThan(pars);
    expect(colorspace).toBeGreaterThan(tonemapping);
    expect(logdepth).toBeGreaterThan(colorspace);
  });

  it("never samples a texture or a world position", () => {
    expect(PLANET_FRAGMENT_SHADER).not.toContain("texture2D(");
    expect(PLANET_FRAGMENT_SHADER).not.toContain("sampler2D");
    expect(PLANET_FRAGMENT_SHADER).not.toContain("modelMatrix[3]");
    expect(PLANET_VERTEX_SHADER).not.toContain("modelMatrix[3]");
  });
});

describe("planet uniforms", () => {
  it("uses Lave's compiled palette and fractions", () => {
    const material = planet().material;

    expect(color(uniform<THREE.Vector3>(material, "uLandColor"))).toEqual([
      0.36, 0.58882, 0.120234,
    ]);
    expect(color(uniform<THREE.Vector3>(material, "uSeaColor"))).toEqual([
      0.589844, 0.393997, 0.573013,
    ]);
    expect(color(uniform<THREE.Vector3>(material, "uPolarLandColor"))).toEqual([
      0.934, 0.908817, 0.849174,
    ]);
    expect(color(uniform<THREE.Vector3>(material, "uPolarSeaColor"))).toEqual([
      0.9941016, 0.9932904, 0.9934303,
    ]);
    expect(color(uniform<THREE.Vector3>(material, "uPolarCloudColor"))).toEqual(
      [0.946484, 0.675422, 0.4127],
    );
    expect(color(uniform<THREE.Vector3>(material, "uCloudColor"))).toEqual([
      0.8, 0.8, 0.8,
    ]);
    expect(color(uniform<THREE.Vector3>(material, "uAirColor"))).toEqual([
      0, 0, 1,
    ]);

    expect(uniform<number>(material, "uLandFraction")).toBe(0.65);
    expect(uniform<number>(material, "uCloudFraction")).toBe(0.26);
    expect(uniform<number>(material, "uCloudAlpha")).toBe(0.75);
    expect(uniform<number>(material, "uAirDensity")).toBe(0.75);
    expect(uniform<number>(material, "uAmbient")).toBe(0.1);
  });

  it("seeds the noise from the authored random_seed with fnv1a32", () => {
    const material = planet().material;
    const seed = uniform<number>(material, "uSeed");
    const expected =
      ((Number.parseInt(fnv1a32("56 173 156 20 29 21"), 16) >>> 0) /
        0x1_0000_0000) *
      64;

    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(64);
    expect(seed).toBe(expected);
    expect(seed).not.toBe(seedToUniform("1 2 3 4 5 6"));
    // The record's authored six-byte string is the seed input, not a number.
    expect(planetSource).toContain("seedToUniform(system.random_seed)");
  });

  it("calibrates the land threshold from land_fraction, never 0.5", () => {
    const material = planet().material;
    const threshold = uniform<number>(material, "uLandThreshold");

    expect(threshold).toBeGreaterThan(0.33);
    expect(threshold).toBeLessThan(0.37);
    expect(threshold).not.toBe(0.5);

    // More land must mean a lower threshold; a hardcoded midpoint cannot do it.
    expect(landThresholdFor(0.8, 1)).toBeLessThan(landThresholdFor(0.2, 1));
    expect(landThresholdFor(0.65, 0)).toBeCloseTo(0.34, 6);
  });

  it("builds exactly one sphere with one ShaderMaterial and no shells", () => {
    const body = planet();

    expect(body.mesh.name).toBe("planet");
    expect(body.mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(body.mesh.children).toHaveLength(0);
    expect((body.mesh.geometry as THREE.SphereGeometry).type).toBe(
      "SphereGeometry",
    );
  });
});

describe("planet spin", () => {
  it("spins 0.4504 rad after 100 s and is the identity at 0 s", () => {
    const body = planet();

    body.update(100);
    const expected = axisAngle(0, 1, 0, 0.4504);
    expect(Math.abs(body.mesh.quaternion.w - expected.w)).toBeLessThan(1e-12);
    expect(Math.abs(body.mesh.quaternion.x - expected.x)).toBeLessThan(1e-12);
    expect(Math.abs(body.mesh.quaternion.y - expected.y)).toBeLessThan(1e-12);
    expect(Math.abs(body.mesh.quaternion.z - expected.z)).toBeLessThan(1e-12);

    body.update(0);
    expect(body.mesh.quaternion.w).toBe(1);
    expect(body.mesh.quaternion.x).toBe(0);
    expect(body.mesh.quaternion.y).toBe(0);
    expect(body.mesh.quaternion.z).toBe(0);
  });

  it("keeps the terminator fixed by inverse-rotating the sun direction", () => {
    const body = planet();
    body.update(100);

    const spin = axisAngle(0, 1, 0, 0.4504);
    const expected = rotateInverse(spin, layout.sunDir);
    const actual = uniform<THREE.Vector3>(body.material, "uSunDir");

    expect(actual.x).toBeCloseTo(expected.x, 12);
    expect(actual.y).toBeCloseTo(expected.y, 12);
    expect(actual.z).toBeCloseTo(expected.z, 12);
  });

  it("rejects a zero or negative planet radius with a named error", () => {
    expect(() =>
      createPlanet(system, 0, layout.sunDir, layout.rotationSpeed),
    ).toThrow(LayoutError);
    expect(() =>
      createPlanet(system, -1, layout.sunDir, layout.rotationSpeed),
    ).toThrow(LayoutError);
  });
});
