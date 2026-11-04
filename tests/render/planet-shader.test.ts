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

import { createPlanet, seedToUniform } from "../../src/render/bodies/planet.js";
import { linearToSrgb } from "../../src/render/color.js";
import {
  calibrateClouds,
  calibrateSurface,
} from "../../src/render/planet-noise.js";
import {
  PLANET_FRAGMENT_SHADER,
  PLANET_VERTEX_SHADER,
} from "../../src/render/shaders/planet.glsl.js";
import { fnv1a32 } from "../../src/sim/hash.js";
import {
  axisAngle,
  dot,
  rotate,
  rotateInverse,
  vec,
} from "../../src/sim/math.js";
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

/** GLSL `smoothstep` for a scalar edge pair; the shader uses the vec3 form. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The shader's per-channel day factor, mirrored in TypeScript.
 *
 * The thresholds are cosines, so each channel saturates at its own NdotL:
 * red first (0.105), then green (0.18), then blue (0.28). At NdotL = 0 all
 * three are 0 — the geometric terminator is 0% lit, not the 55% the deleted
 * ambient floor produced.
 */
function dayLightAt(ndotl: number): [number, number, number] {
  const threshold = uniform<THREE.Vector3>(
    planet().material,
    "uTerminatorThreshold",
  );
  return [
    smoothstep(0, threshold.x, ndotl),
    smoothstep(0, threshold.y, ndotl),
    smoothstep(0, threshold.z, ndotl),
  ];
}

/** A `uniform`/`varying` declaration is a type statement, not a use. */
const DECLARATION_LINE = /^\s*(uniform|varying)\b/;

/**
 * Reject a fragment shader that pairs a world-space normal with the
 * object-space sun, or lets the world-space normal escape the rim.
 *
 * `normalW` is derived from `vNormalW` (already rotated by the model matrix)
 * while `uSunDir` is inverse-rotated by the planet spin into object space, so
 * `dot(normalW, uSunDir)` computes a terminator that sweeps at twice the
 * planet's spin (WR-01). The numeric sun-uniform test alone cannot catch that:
 * it is vector algebra and never reads this source.
 *
 * Declaration lines (`uniform vec3 uSunDir;`, `varying vec3 vNormalW;`) are
 * exempt: without the exemption the required varying declaration would itself
 * violate rule (c) and the unmodified source could never pass.
 */
export function vectorSpaceViolations(fragmentSource: string): string[] {
  const violations: string[] = [];
  const objectNormal = "vec3 n = normalize(vLocal);";
  const ndotl = "float ndotl = dot(n, normalize(uSunDir));";

  if (!fragmentSource.includes(objectNormal)) {
    violations.push(`missing the object-space normal: ${objectNormal}`);
  }
  if (!fragmentSource.includes(ndotl)) {
    violations.push(`missing object-space NdotL: ${ndotl}`);
  }

  for (const line of fragmentSource.split("\n")) {
    if (line.includes(ndotl) && line.includes("normalW")) {
      violations.push(
        `the NdotL line also names a world-space normal: ${line.trim()}`,
      );
    }

    if (
      line.includes("uSunDir") &&
      (line.includes("vNormalW") || line.includes("normalW"))
    ) {
      violations.push(
        `uSunDir is paired with a world-space normal: ${line.trim()}`,
      );
    }

    if (DECLARATION_LINE.test(line)) continue;
    if (!line.includes("normalW") && !line.includes("vNormalW")) continue;
    if (line.trim() === "vec3 normalW = normalize(vNormalW);") continue;
    if (!line.includes("rim") && !line.includes("vViewDirW")) {
      violations.push(
        `the world-space normal is used outside the rim: ${line.trim()}`,
      );
    }
  }

  return violations;
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

  it("ports the PlanetMix bands, relief shade and polar cap", () => {
    expect(PLANET_FRAGMENT_SHADER).toContain("void planetMix(");
    expect(PLANET_FRAGMENT_SHADER).toContain(
      "#define COASTLINE_PORTION 0.00625",
    );
    expect(PLANET_FRAGMENT_SHADER).toContain("#define SHALLOWS 0.0125");
    expect(PLANET_FRAGMENT_SHADER).toContain("#define DEEPS 0.25");

    // Deep sea is 0.15x the sea colour (Blend(0.85, sea, black)).
    expect(PLANET_FRAGMENT_SHADER).toContain("mix(uSeaColor, vec3(0.0), 0.85)");
    // Snowline and the polar cap both come from the calibrated field.
    expect(PLANET_FRAGMENT_SHADER).toContain("q > uMixHi");
    expect(PLANET_FRAGMENT_SHADER).toContain("2.0 * uPolarCap - nearPole");
    expect(PLANET_FRAGMENT_SHADER).toContain("uPolarLandColor");
    expect(PLANET_FRAGMENT_SHADER).toContain("uPolarSeaColor");

    // Lambert relief, flattened over water.
    expect(PLANET_FRAGMENT_SHADER).toContain("uReliefScale");
    expect(PLANET_FRAGMENT_SHADER).toContain(
      "shade = mix(relief.z, 1.0, seaishness)",
    );

    // The latitude-only polar wash and the midpoint threshold are gone.
    expect(PLANET_FRAGMENT_SHADER).not.toContain(
      "smoothstep(0.6, 0.95, abs(n.y))",
    );
    expect(PLANET_FRAGMENT_SHADER).not.toContain("uLandThreshold");
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

  it("calibrates the surface from the compiled record, never a constant", () => {
    const material = planet().material;
    const seed = seedToUniform(system.random_seed);
    const calibration = calibrateSurface(seed, system.land_fraction, 0.05);
    const clouds = calibrateClouds(seed, system.cloud_fraction);

    expect(uniform<number>(material, "uNoiseLo")).toBe(calibration.noiseLo);
    expect(uniform<number>(material, "uNoiseScale")).toBe(
      calibration.noiseScale,
    );
    expect(uniform<number>(material, "uSeaBias")).toBe(calibration.seaBias);
    expect(uniform<number>(material, "uPoleValue")).toBeCloseTo(0.325, 6);
    expect(uniform<number>(material, "uPolarCap")).toBeCloseTo(0.4142, 4);
    expect(uniform<number>(material, "uMixHi")).toBe(calibration.mixHi);
    expect(uniform<number>(material, "uCloudNoiseLo")).toBe(clouds.noiseLo);
    expect(uniform<number>(material, "uCloudNoiseScale")).toBe(
      clouds.noiseScale,
    );
    expect(uniform<number>(material, "uCloudThreshold")).toBe(clouds.threshold);

    // Oolite's snowline rule applied to the calibrated field's top
    // (1 + seaBias). The literal 0.66667 * 0.65 = 0.43334 is above the field's
    // reachable maximum (0.42871) and would leave the band empty.
    expect(uniform<number>(material, "uMixHi")).toBeCloseTo(0.2858, 2);
    expect(uniform<number>(material, "uMixHi")).toBeLessThan(0.42871);
    expect(uniform<number>(material, "uMixHi")).not.toBeCloseTo(
      0.66667 * system.land_fraction,
      2,
    );

    // A declared relief uniform must be wired, or shade collapses to 1.
    expect(uniform<number>(material, "uReliefScale")).toBeGreaterThan(0);

    // The old midpoint threshold and its derivation are gone.
    expect(material.uniforms.uLandThreshold).toBeUndefined();
    expect(planetSource).not.toContain("landThresholdFor");
    expect(planetSource).toContain("calibrateSurface");
    expect(planetSource).toContain("calibrateClouds");
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

describe("planet terminator", () => {
  it("uploads the authored per-channel thresholds", () => {
    const threshold = uniform<THREE.Vector3>(
      planet().material,
      "uTerminatorThreshold",
    );

    expect([threshold.x, threshold.y, threshold.z]).toEqual([
      0.105, 0.18, 0.28,
    ]);
    expect([threshold.x, threshold.y, threshold.z]).toEqual([
      ...system.terminatorThresholdVector,
    ]);

    expect(planetSource).toContain("uTerminatorThreshold");
    expect(planetSource).not.toContain("terminatorSoftness");
  });

  it("evaluates NdotL in one vector space under spin", () => {
    // Documentation of the identity, not evidence about the shader: rotating
    // the normal by the spin is the same dot product as inverse-rotating the
    // sun. The shader-source guard below is what rejects the mixed pairing.
    const body = planet();
    body.update(100);

    const spin = axisAngle(0, 1, 0, 0.4504);
    const objectNormal = vec(0.6, -0.48, 0.64);
    const objectSun = rotateInverse(spin, layout.sunDir);
    const uploaded = uniform<THREE.Vector3>(body.material, "uSunDir");

    expect(uploaded.x).toBeCloseTo(objectSun.x, 12);
    expect(uploaded.y).toBeCloseTo(objectSun.y, 12);
    expect(uploaded.z).toBeCloseTo(objectSun.z, 12);
    expect(dot(objectNormal, objectSun)).toBeCloseTo(
      dot(rotate(spin, objectNormal), layout.sunDir),
      12,
    );
  });

  it("keeps the world-space normal out of the sun comparison", () => {
    expect(vectorSpaceViolations(PLANET_FRAGMENT_SHADER)).toEqual([]);

    // Positive controls: the guard must reject both mixed-space shapes.
    const mixed = PLANET_FRAGMENT_SHADER.replace(
      "dot(n, normalize(uSunDir))",
      "dot(normalW, normalize(uSunDir))",
    );
    expect(vectorSpaceViolations(mixed).length).toBeGreaterThan(0);

    const extra = PLANET_FRAGMENT_SHADER.replace(
      "gl_FragColor = vec4(color, 1.0);",
      "float t = dot(vNormalW, normalize(uSunDir));\n  gl_FragColor = vec4(color, 1.0);",
    );
    expect(vectorSpaceViolations(extra).length).toBeGreaterThan(0);
  });

  it("is 0% lit at the geometric terminator and saturates red first", () => {
    const night = dayLightAt(0);
    expect(night).toEqual([0, 0, 0]);

    const first = dayLightAt(0.105);
    expect(first[0]).toBe(1);
    expect(first[1]).toBeCloseTo(0.623843, 3);
    expect(first[2]).toBeCloseTo(0.316406, 3);
    expect(first[1]).toBeLessThan(1);
    expect(first[2]).toBeLessThan(1);

    expect(dayLightAt(0.28)).toEqual([1, 1, 1]);

    expect(PLANET_FRAGMENT_SHADER).toContain(
      "smoothstep(vec3(0.0), uTerminatorThreshold, vec3(ndotl))",
    );
    expect(PLANET_FRAGMENT_SHADER).toContain(
      "float ndotl = dot(n, normalize(uSunDir));",
    );
    expect(PLANET_FRAGMENT_SHADER).not.toContain("uTerminatorSoftness");
    expect(PLANET_FRAGMENT_SHADER).not.toContain("uAmbient + (1.0 - uAmbient)");
    expect(PLANET_FRAGMENT_SHADER).toContain(
      "color *= dayLight + uAmbientTint * uAmbient;",
    );
  });
});
