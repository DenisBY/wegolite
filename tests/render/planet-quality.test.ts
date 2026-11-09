// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The High graphics quality (PROJECT.md Key Decisions).
 *
 * Standard must stay the original render path: the same fragment source, the
 * same calibration and no atmosphere shell. High may only change the relief and
 * cloud octave `#define`s and add the shell; the surface field (the continents)
 * is shared by both levels.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  ATMOSPHERE_NAME,
  ATMOSPHERE_SHELL_SCALE,
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
  PLANET_FRAGMENT_SHADER,
  planetFragmentShaderWithOctaves,
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

  it("changes only the relief and cloud octave defines", () => {
    expect(define(high, "SURFACE_OCTAVES")).toBe(SURFACE_OCTAVES);
    expect(define(high, "RELIEF_OCTAVES")).toBe(HIGH_RELIEF_OCTAVES);
    expect(define(high, "CLOUD_OCTAVES")).toBe(HIGH_CLOUD_OCTAVES);

    const standardLines = PLANET_FRAGMENT_SHADER.split("\n");
    const highLines = high.split("\n");
    expect(highLines).toHaveLength(standardLines.length);
    const changed = highLines.filter(
      (line, index) => line !== standardLines[index],
    );
    expect(changed).toEqual([
      `#define RELIEF_OCTAVES ${String(HIGH_RELIEF_OCTAVES)}`,
      `#define CLOUD_OCTAVES ${String(HIGH_CLOUD_OCTAVES)}`,
    ]);
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
    expect(() =>
      planetFragmentShaderWithOctaves({ relief: 7, cloud: 1 }),
    ).toThrow(RangeError);
    expect(() =>
      planetFragmentShaderWithOctaves({ relief: 1, cloud: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      planetFragmentShaderWithOctaves({ relief: 1.5, cloud: 1 }),
    ).toThrow(RangeError);
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

  it("recalibrates the cloud threshold so coverage matches cloud_fraction", () => {
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
  it("is a child of the planet mesh, named and slightly larger", () => {
    const body = planet("high");
    const shell = body.atmosphere;
    expect(shell).toBeDefined();
    if (shell === undefined) return;
    expect(shell.name).toBe(ATMOSPHERE_NAME);
    expect(shell.parent).toBe(body.mesh);
    expect(shell.geometry.parameters.radius).toBeCloseTo(
      layout.planet.radius * ATMOSPHERE_SHELL_SCALE,
      6,
    );
    expect(ATMOSPHERE_SHELL_SCALE).toBeGreaterThan(1);
    // The station orbits at two planet radii; the shell must stay well inside.
    expect(ATMOSPHERE_SHELL_SCALE).toBeLessThan(1.5);
  });

  it("is additive, depth-tested and never writes depth", () => {
    const material = createAtmosphere(
      system,
      layout.planet.radius,
      layout.sunDir,
    ).material;
    expect(material.transparent).toBe(true);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(THREE.FrontSide);
  });

  it("carries the planet radius, the shell radius and the world sun direction", () => {
    const material = createAtmosphere(
      system,
      layout.planet.radius,
      layout.sunDir,
    ).material;
    expect(uniformNumber(material, "uPlanetRadius")).toBe(layout.planet.radius);
    expect(uniformNumber(material, "uShellRadius")).toBeCloseTo(
      layout.planet.radius * ATMOSPHERE_SHELL_SCALE,
      6,
    );
    const sun = material.uniforms["uSunDir"]?.value as THREE.Vector3;
    expect([sun.x, sun.y, sun.z]).toEqual([
      layout.sunDir.x,
      layout.sunDir.y,
      layout.sunDir.z,
    ]);
    expect(uniformNumber(material, "uStrength")).toBeGreaterThan(0);
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
    // The halo is analytic and evaluates no noise.
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
