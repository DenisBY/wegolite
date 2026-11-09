// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The High graphics quality (PROJECT.md Key Decisions).
 *
 * Standard must stay the original render path: the same fragment source, the
 * same calibration and no atmosphere shell. High may only change the relief and
 * cloud octave `#define`s and the cloud cut, and add the shell; the surface
 * field (the continents) is shared by both levels.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ATMOSPHERE_DEPTH,
  ATMOSPHERE_NAME,
  atmosphereCosThreshold,
  createAtmosphere,
} from "../../src/render/bodies/atmosphere.js";
import { createPlanet } from "../../src/render/bodies/planet.js";
import type { AssetCache } from "../../src/render/asset-cache.js";
import {
  CLOUD_OCTAVES,
  HIGH_CLOUD_OCTAVES,
  HIGH_NOISE_EVAL_BUDGET,
  HIGH_RELIEF_OCTAVES,
  NOISE_EVAL_BUDGET,
  RELIEF_OCTAVES,
  SURFACE_OCTAVES,
  calibrateClouds,
  fibonacciDirections,
  sampleCloud,
} from "../../src/render/planet-noise.js";
import {
  ATMOSPHERE_FRAGMENT_SHADER,
  ATMOSPHERE_VERTEX_SHADER,
} from "../../src/render/shaders/atmosphere.glsl.js";
import {
  HIGH_CLOUD_RAMP,
  PLANET_FRAGMENT_SHADER,
  highPlanetFragmentShader,
} from "../../src/render/shaders/planet.glsl.js";
import { createSystemScene } from "../../src/render/system-scene.js";
import { LayoutError } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";

const { system, layout } = laveFixture();

function planet(quality?: "standard" | "high") {
  return createPlanet(
    system,
    layout.planet.radius,
    layout.sunDir,
    layout.rotationSpeed,
    quality,
  );
}

function define(source: string, name: string): number {
  const matches = [
    ...source.matchAll(new RegExp(`^#define ${name} (\\d+)$`, "gm")),
  ];
  expect(matches).toHaveLength(1);
  return Number(matches[0]?.[1]);
}

function uniformNumber(material: THREE.ShaderMaterial, name: string): number {
  const value: unknown = material.uniforms[name]?.value;
  if (typeof value !== "number") {
    throw new Error(`the material has no numeric uniform "${name}"`);
  }
  return value;
}

function countDisposals(resource: {
  addEventListener(type: "dispose", listener: () => void): void;
}): () => number {
  let count = 0;
  resource.addEventListener("dispose", () => {
    count += 1;
  });
  return () => count;
}

describe("Standard quality is the original planet", () => {
  it("uses the unmodified fragment source by default and when named", () => {
    expect(planet().material.fragmentShader).toBe(PLANET_FRAGMENT_SHADER);
    expect(planet("standard").material.fragmentShader).toBe(
      PLANET_FRAGMENT_SHADER,
    );
  });

  it("builds no atmosphere shell", () => {
    const body = planet("standard");
    expect(body.atmosphere).toBeUndefined();
    expect(body.mesh.children).toHaveLength(0);
  });

  it("keeps the Standard cloud calibration when no octave count is given", () => {
    const seed = uniformNumber(planet().material, "uSeed");
    expect(calibrateClouds(seed, system.cloud_fraction)).toEqual(
      calibrateClouds(seed, system.cloud_fraction, CLOUD_OCTAVES),
    );
  });
});

describe("the High planet shader variant", () => {
  const high = planet("high").material.fragmentShader;

  it("changes only the octave defines and the cloud cut", () => {
    expect(define(high, "SURFACE_OCTAVES")).toBe(SURFACE_OCTAVES);
    expect(define(high, "RELIEF_OCTAVES")).toBe(HIGH_RELIEF_OCTAVES);
    expect(define(high, "CLOUD_OCTAVES")).toBe(HIGH_CLOUD_OCTAVES);

    // Everything Standard has, High has too, except the two define lines and
    // the five lines of the narrow smoothstep cloud cut.
    const highLines = new Set(high.split("\n"));
    const dropped = PLANET_FRAGMENT_SHADER.split("\n").filter(
      (line) => !highLines.has(line),
    );
    expect(dropped).toEqual([
      "#define RELIEF_OCTAVES 1",
      "#define CLOUD_OCTAVES 1",
      "  float cloud = smoothstep(",
      "    uCloudThreshold - 0.02,",
      "    uCloudThreshold + 0.02,",
      "    cloudField",
      "  ) * uCloudAlpha;",
    ]);
    expect(high).toContain(
      `#define HIGH_CLOUD_RAMP ${HIGH_CLOUD_RAMP.toFixed(4)}`,
    );
    // Oolite's CloudMix: AIR_ALPHA 0.05 to CLOUD_ALPHA 2.0, clamped to 1.
    expect(high).toContain("min(mix(0.05, 2.0, cloudRamp), 1.0) * uCloudAlpha");
    // The surface and relief code is untouched: the same noise call sites.
    const calls = (source: string): number =>
      (source.match(/\b(?:fbm|fbmSurface)\s*\(/g) ?? []).length;
    expect(calls(high)).toBe(calls(PLANET_FRAGMENT_SHADER));
  });

  it("has more detail than Standard and a derived evaluation count", () => {
    expect(HIGH_RELIEF_OCTAVES).toBeGreaterThan(RELIEF_OCTAVES);
    expect(HIGH_CLOUD_OCTAVES).toBeGreaterThan(CLOUD_OCTAVES);
    expect(HIGH_NOISE_EVAL_BUDGET).toBe(
      define(high, "SURFACE_OCTAVES") +
        2 * define(high, "RELIEF_OCTAVES") +
        define(high, "CLOUD_OCTAVES"),
    );
    expect(HIGH_NOISE_EVAL_BUDGET).toBeGreaterThan(NOISE_EVAL_BUDGET);
  });

  it("rejects an octave count the fbm loop bound would truncate", () => {
    expect(() => highPlanetFragmentShader({ relief: 7, cloud: 1 })).toThrow(
      RangeError,
    );
    expect(() => highPlanetFragmentShader({ relief: 1, cloud: 0 })).toThrow(
      RangeError,
    );
    expect(() => highPlanetFragmentShader({ relief: 1.5, cloud: 1 })).toThrow(
      RangeError,
    );
  });

  it("keeps the surface calibration, so the continents do not move", () => {
    const standard = planet("standard").material;
    const material = planet("high").material;
    for (const name of [
      "uSeed",
      "uNoiseLo",
      "uNoiseScale",
      "uSeaBias",
      "uPoleValue",
      "uPolarCap",
      "uMixHi",
      "uReliefScale",
    ]) {
      expect(uniformNumber(material, name)).toBe(uniformNumber(standard, name));
    }
  });

  it("recalibrates the cloud threshold so the opaque share matches cloud_fraction", () => {
    const material = planet("high").material;
    const seed = uniformNumber(material, "uSeed");
    const lo = uniformNumber(material, "uCloudNoiseLo");
    const scale = uniformNumber(material, "uCloudNoiseScale");
    const threshold = uniformNumber(material, "uCloudThreshold");

    expect({ noiseLo: lo, noiseScale: scale, threshold }).toEqual(
      calibrateClouds(seed, system.cloud_fraction, HIGH_CLOUD_OCTAVES),
    );

    const directions = fibonacciDirections();
    let covered = 0;
    for (const direction of directions) {
      const raw = sampleCloud(direction, seed, HIGH_CLOUD_OCTAVES);
      const field = Math.min(Math.max((raw - lo) * scale, 0), 1);
      if (field > threshold) covered += 1;
    }
    expect(covered / directions.length).toBeCloseTo(system.cloud_fraction, 2);
  });
});

describe("the High atmosphere shell", () => {
  it("is a child of the planet mesh, named and just above the surface", () => {
    const body = planet("high");
    const shell = body.atmosphere;
    expect(shell).toBeDefined();
    if (shell === undefined) return;
    expect(shell.name).toBe(ATMOSPHERE_NAME);
    expect(shell.parent).toBe(body.mesh);
    // Oolite's ATMOSPHERE_DEPTH.
    expect(ATMOSPHERE_DEPTH).toBe(500);
    expect(shell.geometry.parameters.radius).toBe(
      layout.planet.radius + ATMOSPHERE_DEPTH,
    );
    // The faceted shell must clear the planet sphere everywhere: its lowest
    // point is a face centre, one half segment angle off a vertex.
    const { widthSegments, heightSegments } = shell.geometry.parameters;
    const lowest =
      (layout.planet.radius + ATMOSPHERE_DEPTH) *
      Math.cos(Math.PI / widthSegments) *
      Math.cos(Math.PI / (2 * heightSegments));
    expect(lowest).toBeGreaterThan(layout.planet.radius);
  });

  it("is alpha-blended, depth-tested and never writes depth", () => {
    const material = createAtmosphere(
      system,
      layout.planet.radius,
      layout.sunDir,
    ).material;
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(THREE.FrontSide);
  });

  it("carries the authored air values and the world sun direction", () => {
    const material = createAtmosphere(
      system,
      layout.planet.radius,
      layout.sunDir,
    ).material;
    const shellRadius = layout.planet.radius + ATMOSPHERE_DEPTH;
    expect(uniformNumber(material, "uShellRadius")).toBe(shellRadius);
    expect(uniformNumber(material, "uAirDensity")).toBe(system.air_density);
    expect(uniformNumber(material, "uAirColorMixRatio")).toBe(
      system.air_color_mix_ratio,
    );
    expect(uniformNumber(material, "uAmbient")).toBe(system.ambient_level);
    expect(uniformNumber(material, "uCosThreshold")).toBe(
      atmosphereCosThreshold(shellRadius),
    );
    // Oolite: exponent 3 above a 40 km radius, 5 below.
    expect(uniformNumber(material, "uRimExponent")).toBe(3);
    const sun = material.uniforms["uSunDir"]?.value as THREE.Vector3;
    expect([sun.x, sun.y, sun.z]).toEqual([
      layout.sunDir.x,
      layout.sunDir.y,
      layout.sunDir.z,
    ]);
  });

  it("derives Oolite's rim threshold and keeps it away from zero", () => {
    // -1.333333e-6 * radius + 0.21333333: 0.17 at 32.5 km, 0.13 at 62.5 km.
    expect(atmosphereCosThreshold(32_500)).toBeCloseTo(0.17, 3);
    expect(atmosphereCosThreshold(62_500)).toBeCloseTo(0.13, 3);
    expect(atmosphereCosThreshold(1e9)).toBe(0.05);
    expect(atmosphereCosThreshold(0)).toBeCloseTo(0.2133, 3);
  });

  it("writes logarithmic depth and the output colour contract", () => {
    for (const chunk of [
      "#include <logdepthbuf_pars_vertex>",
      "#include <logdepthbuf_vertex>",
    ]) {
      expect(ATMOSPHERE_VERTEX_SHADER).toContain(chunk);
    }
    for (const chunk of [
      "#include <logdepthbuf_pars_fragment>",
      "#include <logdepthbuf_fragment>",
      "#include <tonemapping_fragment>",
      "#include <colorspace_fragment>",
    ]) {
      expect(ATMOSPHERE_FRAGMENT_SHADER).toContain(chunk);
    }
    // The haze is analytic and evaluates no noise.
    expect(ATMOSPHERE_FRAGMENT_SHADER).not.toContain("valueNoise");
  });

  it("rejects a non-positive planet radius", () => {
    expect(() => createAtmosphere(system, 0, layout.sunDir)).toThrow(
      LayoutError,
    );
    expect(() => createAtmosphere(system, Number.NaN, layout.sunDir)).toThrow(
      LayoutError,
    );
  });

  it("is disposed with the planet when a scene build is torn down", () => {
    const body = planet("high");
    const shell = body.atmosphere;
    expect(shell).toBeDefined();
    if (shell === undefined) return;
    const geometryDisposals = countDisposals(shell.geometry);
    const materialDisposals = countDisposals(shell.material);

    // The sun factory fails after the planet is built, so the scene disposes
    // what it already owns; the asset cache is never reached.
    const unusedAssets = {} as AssetCache;
    expect(() =>
      createSystemScene(
        layout,
        unusedAssets,
        system,
        {
          planet: () => body,
          sun: () => {
            throw new Error("sun build failed");
          },
        },
        "high",
      ),
    ).toThrow("sun build failed");

    expect(geometryDisposals()).toBe(1);
    expect(materialDisposals()).toBe(1);
  });
});
