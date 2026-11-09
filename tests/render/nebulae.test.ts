// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The High-quality sky nebulae (PROJECT.md Key Decisions): a deterministic
 * port of Oolite's nebula quads, drawn only at `high`.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { AssetCache } from "../../src/render/asset-cache.js";
import {
  NEBULA_ALPHA,
  NEBULA_DISPLAY_GAIN,
  NEBULA_MAX_QUADS,
  NEBULA_SHELL_RADIUS,
  NEBULA_TEXTURES,
  createNebulae,
  generateNebulaQuads,
  nebulaColor,
} from "../../src/render/bodies/nebulae.js";
import { STARFIELD_SHELL_RADIUS } from "../../src/render/bodies/starfield.js";
import {
  CAMERA_FAR,
  createSystemScene,
} from "../../src/render/system-scene.js";
import { SKY_TEXTURES } from "../../tools/oolite-ingest/convert/textures.js";
import { laveFixture } from "../helpers/lave.js";

const { system, layout } = laveFixture();

function fakeLoader(): {
  load: (url: string) => THREE.Texture;
  urls: string[];
  textures: THREE.Texture[];
} {
  const urls: string[] = [];
  const textures: THREE.Texture[] = [];
  return {
    urls,
    textures,
    load(url) {
      urls.push(url);
      const texture = new THREE.Texture();
      textures.push(texture);
      return texture;
    },
  };
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

describe("generateNebulaQuads", () => {
  const quads = generateNebulaQuads(system.sky_n_blurs, system.random_seed);

  it("is deterministic for a seed and differs between seeds", () => {
    expect(generateNebulaQuads(system.sky_n_blurs, system.random_seed)).toEqual(
      quads,
    );
    expect(
      generateNebulaQuads(system.sky_n_blurs, `${system.random_seed}x`),
    ).not.toEqual(quads);
  });

  it("draws fewer quads than sky_n_blurs, as Oolite's loop does", () => {
    expect(quads.length).toBeGreaterThan(0);
    expect(quads.length).toBeLessThan(system.sky_n_blurs);
    // With a 0.8 cluster chance about four in five loop steps make a quad.
    expect(quads.length).toBeGreaterThan(system.sky_n_blurs * 0.6);
  });

  it("clamps the count and tolerates a tampered value", () => {
    expect(generateNebulaQuads(0, "seed")).toEqual([]);
    expect(generateNebulaQuads(-5, "seed")).toEqual([]);
    expect(generateNebulaQuads(Number.NaN, "seed")).toEqual([]);
    expect(generateNebulaQuads(1e9, "seed").length).toBeLessThanOrEqual(
      NEBULA_MAX_QUADS,
    );
  });

  it("makes square quads of 0.02 to 0.32 rad near the unit sphere", () => {
    for (const quad of quads) {
      const [c0, c1, c2, c3] = quad.corners;
      const side = (a: typeof c0, b: typeof c0): number =>
        Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const first = side(c0, c1);
      expect(first).toBeGreaterThanOrEqual(0.02 - 1e-9);
      expect(first).toBeLessThanOrEqual(0.32 + 1e-9);
      expect(side(c1, c2)).toBeCloseTo(first, 9);
      expect(side(c0, c3)).toBeCloseTo(first, 9);
      for (const corner of quad.corners) {
        const distance = Math.hypot(corner.x, corner.y, corner.z);
        // A corner is at most 2.12 quad sides from the cluster direction
        // (the pivot offset plus the diagonal), so sqrt(1 + 0.68^2) = 1.21.
        expect(distance).toBeGreaterThan(0.95);
        expect(distance).toBeLessThan(1.22);
      }
    }
  });

  it("keeps every quad faint: at most the nebula alpha per channel", () => {
    for (const quad of quads) {
      expect(quad.texture).toBeGreaterThanOrEqual(0);
      expect(quad.texture).toBeLessThan(NEBULA_TEXTURES.length);
      for (const channel of quad.color) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(NEBULA_ALPHA + 1e-9);
      }
    }
  });
});

describe("nebulaColor", () => {
  it("returns a saturated colour in range for any blend fraction", () => {
    for (const fraction of [0, 0.25, 0.5, 0.75, 1, -1, 2]) {
      const color = nebulaColor(fraction);
      const max = Math.max(...color);
      const min = Math.min(...color);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(1);
      // Saturation is moved halfway to full, so it is never below 0.5.
      expect(1 - min / max).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });
});

describe("createNebulae", () => {
  it("builds one additive, depth-tested mesh per used texture", () => {
    const loader = fakeLoader();
    const body = createNebulae(
      system.sky_n_blurs,
      system.random_seed,
      "/base/",
      loader.load,
    );
    expect(body.object.name).toBe("nebulae");
    expect(body.object.children.length).toBeGreaterThan(0);
    expect(body.object.children.length).toBeLessThanOrEqual(
      NEBULA_TEXTURES.length,
    );
    expect(loader.urls.length).toBe(body.object.children.length);
    for (const url of loader.urls) {
      expect(url).toMatch(/^\/base\/textures\/oolite-nebula-[1-4]\.png$/);
    }

    let quadTotal = 0;
    for (const child of body.object.children) {
      const mesh = child as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.ShaderMaterial
      >;
      const material = mesh.material;
      expect(material.blending).toBe(THREE.AdditiveBlending);
      expect(material.transparent).toBe(true);
      expect(material.depthTest).toBe(true);
      expect(material.depthWrite).toBe(false);
      // Display-space blending: a raw map and no colour-space conversion.
      const map = material.uniforms["uMap"]?.value as THREE.Texture;
      expect(map.colorSpace).toBe(THREE.NoColorSpace);
      expect(material.fragmentShader).not.toContain("colorspace_fragment");
      expect(material.fragmentShader).toContain("logdepthbuf_fragment");
      expect(material.uniforms["uGain"]?.value).toBe(NEBULA_DISPLAY_GAIN);
      expect(mesh.geometry.getAttribute("tint").count).toBe(
        mesh.geometry.getAttribute("position").count,
      );
      quadTotal += mesh.geometry.getAttribute("position").count / 4;
    }
    expect(quadTotal).toBe(body.quadCount);
  });

  it("sits inside the starfield shell and the far plane", () => {
    const body = createNebulae(
      system.sky_n_blurs,
      system.random_seed,
      "/",
      fakeLoader().load,
    );
    expect(NEBULA_SHELL_RADIUS).toBeLessThan(STARFIELD_SHELL_RADIUS);
    for (const child of body.object.children) {
      const positions = (child as THREE.Mesh).geometry.getAttribute("position");
      for (let index = 0; index < positions.count; index += 1) {
        const distance = Math.hypot(
          positions.getX(index),
          positions.getY(index),
          positions.getZ(index),
        );
        expect(distance).toBeLessThan(CAMERA_FAR);
      }
    }
  });

  it("frees its geometry, materials and textures exactly once", () => {
    const loader = fakeLoader();
    const body = createNebulae(
      system.sky_n_blurs,
      system.random_seed,
      "/",
      loader.load,
    );
    const counters = [
      ...loader.textures.map((texture) => countDisposals(texture)),
      ...body.object.children.flatMap((child) => {
        const mesh = child as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.ShaderMaterial
        >;
        return [countDisposals(mesh.geometry), countDisposals(mesh.material)];
      }),
    ];
    body.dispose();
    for (const counter of counters) expect(counter()).toBe(1);
    expect(body.object.children).toHaveLength(0);
  });

  it("uses exactly the sky textures the content build ships", () => {
    expect(NEBULA_TEXTURES.map((texture) => texture.file)).toEqual([
      ...SKY_TEXTURES,
    ]);
  });
});

describe("the scene builds nebulae only at High", () => {
  // The sun factory fails after the planet, so nothing later is built; the
  // nebula factory must not have been reached at Standard either way.
  it("never calls the nebula factory at Standard", () => {
    let calls = 0;
    expect(() =>
      createSystemScene(
        layout,
        {} as AssetCache,
        system,
        {
          nebulae: () => {
            calls += 1;
            throw new Error("nebulae built at Standard");
          },
          sun: () => {
            throw new Error("sun build failed");
          },
        },
        "standard",
      ),
    ).toThrow("sun build failed");
    expect(calls).toBe(0);
  });
});
