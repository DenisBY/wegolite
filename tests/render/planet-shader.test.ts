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
import { linearToSrgb } from "../../src/render/color.js";
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

/**
 * The pre-lighting albedo byte of a palette uniform.
 *
 * This measures the uniform, not a rendered pixel: a lit pixel additionally
 * carries `dayLight + uAmbientTint * uAmbient`, so a fully lit land pixel reads
 * ≈(95,155,32) rather than the authored `(92,150,31)`. Encoding the uniform
 * once is exactly the contract the shader's `<colorspace_fragment>` applies.
 */
function albedoByte(value: THREE.Vector3): [number, number, number] {
  return [
    Math.round(linearToSrgb(value.x) * 255),
    Math.round(linearToSrgb(value.y) * 255),
    Math.round(linearToSrgb(value.z) * 255),
  ];
}

/** Lave's authored `planetinfo` bytes: `255 * colour`, Oolite's texture form. */
const LAVE_PALETTE_BYTES: ReadonlyArray<
  readonly [string, readonly [number, number, number]]
> = [
  ["uLandColor", [92, 150, 31]],
  ["uSeaColor", [150, 100, 146]],
  ["uPolarLandColor", [238, 232, 217]],
  ["uPolarSeaColor", [253, 253, 253]],
  ["uPolarCloudColor", [241, 172, 105]],
  ["uCloudColor", [204, 204, 204]],
  ["uAirColor", [0, 0, 255]],
];

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
  it("decodes Lave's palette to linear light exactly once", () => {
    const material = planet().material;

    for (const [name, authored] of LAVE_PALETTE_BYTES) {
      expect(albedoByte(uniform<THREE.Vector3>(material, name))).toEqual([
        ...authored,
      ]);
    }

    // The uniform itself is linear light, not the authored sRGB triple.
    const land = uniform<THREE.Vector3>(material, "uLandColor");
    expect(land.x).toBeCloseTo(0.106539, 6);
    expect(land.y).toBeCloseTo(0.305653, 6);
    expect(land.z).toBeCloseTo(0.013455, 6);

    // Negative control: the pre-fix value fed the raw triple to the shader and
    // the output encoder made it (162,202,97) instead of (92,150,31).
    expect(land.x).not.toBe(0.36);
    expect(Math.round(land.x * 255)).not.toBe(92);
    expect(albedoByte(land)).not.toEqual([162, 202, 97]);
  });

  it("uses Lave's compiled fractions", () => {
    const material = planet().material;

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
