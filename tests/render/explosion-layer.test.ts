// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drawn ship explosion (WORLD-17, D16-08, D16-22), decided in Node against
 * the layer's instance buffers and visibility: an `InstancedMesh` needs no
 * WebGL context to build, so the pool, the Oolite cloud formulas, the
 * camera-relative write and the lazy texture load are numeric assertions.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  EXPLOSION_MAX_PARTICLES,
  EXPLOSION_POOL,
  FLASH_ALPHA,
  FLASH_DURATION,
  FLASH_GROWTH_FACTOR,
  FLASH_MIN_GROWTH,
  createExplosionLayer,
} from "../../src/render/bodies/explosions.js";
import type {
  ExplosionAddOptions,
  ExplosionLayer,
  ExplosionSettings,
} from "../../src/render/bodies/explosions.js";
import { linearToSrgb } from "../../src/render/color.js";
import { vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";

/** The compiled `oolite-default-ship-explosion` (explosions.json). */
const DEFAULT: ExplosionSettings = {
  alpha: 0.8500000238418579,
  brightness: 1,
  colorOrder: "rgb",
  count: 25,
  duration: 1.5,
  growthRate: 1.5,
  size: 2.5,
  spread: 1,
  texture: "oolite-particle-cloud2.png",
};

const ORIGIN = vec(0, 0, 0);
const FACING = new THREE.Quaternion();

interface Recorded {
  readonly layer: ExplosionLayer;
  readonly urls: string[];
  readonly textures: THREE.Texture[];
}

function recorded(): Recorded {
  const urls: string[] = [];
  const textures: THREE.Texture[] = [];
  const layer = createExplosionLayer((url) => {
    urls.push(url);
    const texture = new THREE.Texture();
    textures.push(texture);
    return texture;
  }, "/base/");
  return { layer, urls, textures };
}

function meshNamed(layer: ExplosionLayer, name: string): THREE.InstancedMesh {
  const mesh = layer.root.getObjectByName(name);
  if (!(mesh instanceof THREE.InstancedMesh)) {
    throw new Error(`no ${name} mesh`);
  }
  return mesh as THREE.InstancedMesh;
}

function cloudOf(layer: ExplosionLayer): THREE.InstancedMesh {
  return meshNamed(layer, "explosionCloud");
}

function flashOf(layer: ExplosionLayer): THREE.InstancedMesh {
  return meshNamed(layer, "explosionFlash");
}

/** The visible draw objects under the layer's root. */
function drawObjects(layer: ExplosionLayer): number {
  let visible = 0;
  layer.root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) visible += 1;
  });
  return visible;
}

/** The flash instance `index`: half its quad edge and its display alpha. */
function flashAt(
  layer: ExplosionLayer,
  index: number,
): { readonly size: number; readonly alpha: number; readonly position: Vec3 } {
  const mesh = flashOf(layer);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  matrix.decompose(position, new THREE.Quaternion(), scale);
  const colours = mesh.instanceColor?.array ?? new Float32Array();
  return {
    size: scale.x / 2,
    alpha: linearToSrgb(colours[index * 3] ?? 0),
    position: vec(position.x, position.y, position.z),
  };
}

interface Particle {
  readonly position: Vec3;
  /** Half the quad's edge: Oolite's particle size. */
  readonly size: number;
  readonly rotation: THREE.Quaternion;
  /** The display colour (sRGB-encoded instance colour). */
  readonly display: readonly [number, number, number];
}

function particles(layer: ExplosionLayer): Particle[] {
  const cloud = cloudOf(layer);
  const out: Particle[] = [];
  const matrix = new THREE.Matrix4();
  const colours = cloud.instanceColor?.array ?? new Float32Array();
  for (let i = 0; i < cloud.count; i += 1) {
    cloud.getMatrixAt(i, matrix);
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, rotation, scale);
    out.push({
      position: vec(position.x, position.y, position.z),
      size: scale.x / 2,
      rotation,
      display: [
        linearToSrgb(colours[i * 3] ?? 0),
        linearToSrgb(colours[i * 3 + 1] ?? 0),
        linearToSrgb(colours[i * 3 + 2] ?? 0),
      ],
    });
  }
  return out;
}

function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

describe("createExplosionLayer: constants", () => {
  it("pools 16 explosions of at most 10 cloud particles (D16-08, D-09)", () => {
    expect(EXPLOSION_POOL).toBe(16);
    expect(EXPLOSION_MAX_PARTICLES).toBe(10);
    const { layer } = recorded();
    const cloud = cloudOf(layer);
    expect(cloud.instanceMatrix.count).toBe(160);
    expect(cloud.instanceColor?.count).toBe(160);
    expect(cloud.frustumCulled).toBe(false);
    expect(cloud.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
  });

  it("blends additively without depth writes, tone mapping or fog", () => {
    const { layer } = recorded();
    const material = cloudOf(layer).material as THREE.MeshBasicMaterial;
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(material.fog).toBe(false);
  });
});

describe("createExplosionLayer: the cloud", () => {
  it("is invisible before any explosion", () => {
    const { layer } = recorded();
    layer.update(ORIGIN, FACING, 1);
    expect(cloudOf(layer).visible).toBe(false);
    expect(cloudOf(layer).count).toBe(0);
  });

  it("caps the authored 25 particles at 10 and keeps a smaller count", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 1);
    layer.update(ORIGIN, FACING, 1);
    expect(cloudOf(layer).count).toBe(10);
    expect(cloudOf(layer).visible).toBe(true);

    const small = recorded();
    small.layer.add(vec(0, 0, 0), 10, { ...DEFAULT, count: 3 }, 1);
    small.layer.update(ORIGIN, FACING, 1);
    expect(cloudOf(small.layer).count).toBe(3);
  });

  it("starts every particle at the event position, camera-relative in float64", () => {
    const { layer } = recorded();
    const camera = vec(1e9, -2e9, 3e9);
    layer.add(vec(1e9 + 1, -2e9 + 2, 3e9 + 3), 10, DEFAULT, 4);
    layer.update(camera, FACING, 4);
    for (const particle of particles(layer)) {
      expect(particle.position).toEqual(vec(1, 2, 3));
    }
  });

  it("draws speeds between size * 0.8 * spread and size * 1.2 * spread, the size starting at the speed", () => {
    const radius = 12;
    const spread = 1.5;
    const settings = { ...DEFAULT, spread };
    const size = radius * settings.size;
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), radius, settings, 2);
    // At t = 0 the size is the speed; one second later the distance is.
    layer.update(ORIGIN, FACING, 2);
    const atStart = particles(layer).map((p) => p.size);
    layer.update(ORIGIN, FACING, 3);
    const later = particles(layer);
    for (const [i, particle] of later.entries()) {
      const speed = atStart[i] ?? 0;
      expect(speed).toBeGreaterThanOrEqual(size * 0.8 * spread - 1e-3);
      expect(speed).toBeLessThanOrEqual(size * 1.2 * spread + 1e-3);
      expect(length(particle.position)).toBeCloseTo(speed, 2);
      // The size grows by growth_rate * size per second.
      expect(particle.size - speed).toBeCloseTo(settings.growthRate * size, 2);
    }
  });

  it("flies along unit directions spread over the sphere", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 0);
    layer.update(ORIGIN, FACING, 0.5);
    const signs = new Set<string>();
    for (const particle of particles(layer)) {
      signs.add(
        `${String(Math.sign(particle.position.x))}${String(Math.sign(particle.position.z))}`,
      );
    }
    // Ten random directions do not all share one quadrant.
    expect(signs.size).toBeGreaterThan(1);
  });

  it("faces the camera", () => {
    const { layer } = recorded();
    const facing = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.3, -1.1, 0.7),
    );
    layer.add(vec(0, 0, -100), 10, DEFAULT, 0);
    layer.update(ORIGIN, facing, 0.2);
    for (const particle of particles(layer)) {
      expect(Math.abs(particle.rotation.dot(facing))).toBeCloseTo(1, 5);
    }
  });

  it("orders the colour draws c1 >= c2 >= c3 by color_order, white one grey draw", () => {
    const cases: readonly [string, readonly [number, number, number]][] = [
      ["rgb", [0, 1, 2]],
      ["rbg", [0, 2, 1]],
      ["grb", [1, 0, 2]],
      ["gbr", [1, 2, 0]],
      ["brg", [2, 0, 1]],
      ["bgr", [2, 1, 0]],
    ];
    for (const [colorOrder, [first, second, third]] of cases) {
      const { layer } = recorded();
      layer.add(vec(0, 0, 0), 10, { ...DEFAULT, colorOrder }, 0);
      layer.update(ORIGIN, FACING, 0);
      for (const { display } of particles(layer)) {
        const [a, b, c] = [display[first], display[second], display[third]];
        expect(a).toBeGreaterThanOrEqual((b ?? 0) - 1e-6);
        expect(b).toBeGreaterThanOrEqual((c ?? 0) - 1e-6);
      }
    }
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, { ...DEFAULT, colorOrder: "white" }, 0);
    layer.update(ORIGIN, FACING, 0);
    for (const { display } of particles(layer)) {
      expect(display[0]).toBe(display[1]);
      expect(display[1]).toBe(display[2]);
    }
  });

  it("folds alpha * (1 - t / duration) into the colour", () => {
    const { layer } = recorded();
    // White has no channel fade, so the ratio is the alpha's alone.
    const settings = { ...DEFAULT, colorOrder: "white" };
    layer.add(vec(0, 0, 0), 10, settings, 0);
    layer.update(ORIGIN, FACING, 0);
    const start = particles(layer).map((p) => p.display[0]);
    layer.update(ORIGIN, FACING, 0.9);
    const later = particles(layer).map((p) => p.display[0]);
    for (const [i, value] of later.entries()) {
      const grey = (start[i] ?? 0) / settings.alpha;
      expect(value).toBeCloseTo(grey * settings.alpha * (1 - 0.9 / 1.5), 4);
    }
  });

  it("fades the tertiary channel at half the fade rate first, the primary untouched", () => {
    // count 10 after the cap, brightness 1: fadeRate = 10 / 25 = 0.4.
    const rate = 0.4;
    const t = 0.1;
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 0);
    layer.update(ORIGIN, FACING, 0);
    const alpha0 = DEFAULT.alpha;
    const start = particles(layer).map((p) => p.display);
    layer.update(ORIGIN, FACING, t);
    const alphaT = DEFAULT.alpha * (1 - t / DEFAULT.duration);
    for (const [i, { display }] of particles(layer).entries()) {
      const before = start[i] ?? [0, 0, 0];
      const c3 = before[2] / alpha0;
      if (c3 <= 0.5 * rate * t + 0.01) continue;
      expect(display[2] / alphaT).toBeCloseTo(c3 - 0.5 * rate * t, 3);
      expect(display[1] / alphaT).toBeCloseTo(before[1] / alpha0, 3);
      expect(display[0] / alphaT).toBeCloseTo(before[0] / alpha0, 3);
    }
  });

  it("fades the secondary channel at the full rate once the tertiary is gone", () => {
    const rate = 0.4;
    // Find an event whose particle has a small tertiary channel (seeded, so
    // the search is deterministic).
    for (let x = 0; x < 200; x += 1) {
      const { layer } = recorded();
      layer.add(vec(x, 0, 0), 10, DEFAULT, 0);
      layer.update(vec(x, 0, 0), FACING, 0);
      const start = particles(layer).map((p) => p.display);
      const index = start.findIndex(
        (d) => d[2] / DEFAULT.alpha < 0.05 && d[1] / DEFAULT.alpha > 0.1,
      );
      if (index < 0) continue;
      const before = start[index] ?? [0, 0, 0];
      const c3 = before[2] / DEFAULT.alpha;
      const c2 = before[1] / DEFAULT.alpha;
      const t = c3 / (0.5 * rate) + 0.05;
      layer.update(vec(x, 0, 0), FACING, t);
      const alphaT = DEFAULT.alpha * (1 - t / DEFAULT.duration);
      const after = particles(layer)[index]?.display ?? [0, 0, 0];
      expect(after[2]).toBe(0);
      expect(after[1] / alphaT).toBeCloseTo(Math.max(c2 - rate * 0.05, 0), 3);
      expect(after[0] / alphaT).toBeCloseTo(before[0] / DEFAULT.alpha, 3);
      return;
    }
    throw new Error("no particle with a small tertiary channel in 200 events");
  });

  it("is visible while t < duration and hidden after", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 10);
    layer.update(ORIGIN, FACING, 10 + 1.49);
    expect(cloudOf(layer).visible).toBe(true);
    layer.update(ORIGIN, FACING, 10 + 1.5);
    expect(cloudOf(layer).visible).toBe(false);
    expect(cloudOf(layer).count).toBe(0);
    // An expired explosion does not come back when the clock is read again.
    layer.update(ORIGIN, FACING, 10.5);
    expect(cloudOf(layer).visible).toBe(false);
  });
});

describe("createExplosionLayer: render-only randomness", () => {
  function snapshot(position: Vec3, radius: number): number[] {
    const { layer } = recorded();
    layer.add(position, radius, DEFAULT, 0);
    // The camera at the event: the particles are origin-relative.
    layer.update(position, FACING, 0.3);
    const cloud = cloudOf(layer);
    return [
      ...cloud.instanceMatrix.array.slice(0, cloud.count * 16),
      ...(cloud.instanceColor?.array.slice(0, cloud.count * 3) ?? []),
    ];
  }

  it("gives identical particles for the same position and radius", () => {
    expect(snapshot(vec(5, 6, 7), 20)).toEqual(snapshot(vec(5, 6, 7), 20));
  });

  it("gives different particles for a different position or radius", () => {
    expect(snapshot(vec(5, 6, 7), 20)).not.toEqual(snapshot(vec(5, 6, 8), 20));
    expect(snapshot(vec(5, 6, 7), 20)).not.toEqual(snapshot(vec(5, 6, 7), 21));
  });
});

describe("createExplosionLayer: the seed variant (D-01)", () => {
  function snapshotWith(options?: ExplosionAddOptions): number[] {
    const { layer } = recorded();
    layer.add(vec(5, 6, 7), 20, DEFAULT, 0, options);
    layer.update(vec(5, 6, 7), FACING, 0.3);
    const cloud = cloudOf(layer);
    return [
      ...cloud.instanceMatrix.array.slice(0, cloud.count * 16),
      ...(cloud.instanceColor?.array.slice(0, cloud.count * 3) ?? []),
    ];
  }

  it("keeps today's particles for no options and for variant 0", () => {
    const today = snapshotWith();
    expect(today.length).toBeGreaterThan(0);
    expect(snapshotWith({ variant: 0 })).toEqual(today);
    expect(snapshotWith({})).toEqual(today);
  });

  it("gives different particles for variants 1 and 2 at one position and radius", () => {
    const today = snapshotWith();
    const one = snapshotWith({ variant: 1 });
    const two = snapshotWith({ variant: 2 });
    expect(one.length).toBeGreaterThan(0);
    expect(one).not.toEqual(today);
    expect(two).not.toEqual(today);
    expect(one).not.toEqual(two);
    // The same variant is the same explosion again.
    expect(snapshotWith({ variant: 1 })).toEqual(one);
  });

  it("skips a non-integer or negative variant before taking a slot", () => {
    for (const variant of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { layer } = recorded();
      layer.add(vec(1, 0, 0), 10, DEFAULT, 1, { variant });
      layer.update(ORIGIN, FACING, 1);
      expect(cloudOf(layer).visible, String(variant)).toBe(false);
      expect(cloudOf(layer).count, String(variant)).toBe(0);
      expect(flashOf(layer).count, String(variant)).toBe(0);
    }
    // A skipped add takes no slot: sixteen valid adds around it all survive.
    const { layer } = recorded();
    layer.add(vec(1, 0, 0), 10, DEFAULT, 1);
    layer.add(vec(99, 0, 0), 10, DEFAULT, 1, { variant: 1.5 });
    for (let i = 2; i <= 16; i += 1) layer.add(vec(i, 0, 0), 10, DEFAULT, 1);
    layer.update(ORIGIN, FACING, 1);
    expect(cloudOf(layer).count).toBe(160);
    const xs = new Set(particles(layer).map((p) => p.position.x));
    expect(xs.has(1)).toBe(true);
    expect(xs.has(99)).toBe(false);
  });
});

describe("createExplosionLayer: the per-add flash flag (D-01b)", () => {
  it("draws a cloud and never a flash for an add with flash: false", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 0, { flash: false });
    for (const t of [0, 0.1, 0.2, 0.39, 0.4, 0.5, 1.2, 1.49]) {
      layer.update(ORIGIN, FACING, t);
      expect(cloudOf(layer).visible, `t = ${String(t)}`).toBe(true);
      expect(cloudOf(layer).count, `t = ${String(t)}`).toBe(10);
      expect(flashOf(layer).count, `t = ${String(t)}`).toBe(0);
      expect(flashOf(layer).visible, `t = ${String(t)}`).toBe(false);
    }
    layer.update(ORIGIN, FACING, 1.5);
    expect(cloudOf(layer).visible).toBe(false);
  });

  it("draws the flash of an add that names a variant and no flash option", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 0, { variant: 3 });
    layer.update(ORIGIN, FACING, 0.1);
    expect(flashOf(layer).count).toBe(1);
    expect(flashOf(layer).visible).toBe(true);
    const explicit = recorded();
    explicit.layer.add(vec(0, 0, 0), 10, DEFAULT, 0, { flash: true });
    explicit.layer.update(ORIGIN, FACING, 0.1);
    expect(flashOf(explicit.layer).count).toBe(1);
  });

  it("keeps a flash-less add beside a flashing one: one flash instance", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 0, { flash: true });
    layer.add(vec(100, 0, 0), 10, DEFAULT, 0, { flash: false });
    layer.update(ORIGIN, FACING, 0.1);
    expect(cloudOf(layer).count).toBe(20);
    expect(flashOf(layer).count).toBe(1);
    expect(flashAt(layer, 0).position).toEqual(vec(0, 0, 0));
  });
});

describe("createExplosionLayer: the fixed pool", () => {
  it("overwrites the oldest of seventeen simultaneous explosions", () => {
    const { layer } = recorded();
    for (let i = 1; i <= 17; i += 1) layer.add(vec(i, 0, 0), 10, DEFAULT, 1);
    layer.update(ORIGIN, FACING, 1);
    expect(cloudOf(layer).count).toBe(160);
    const xs = new Set(particles(layer).map((p) => p.position.x));
    expect(xs.has(1)).toBe(false);
    for (let i = 2; i <= 17; i += 1) expect(xs.has(i)).toBe(true);
  });

  it("frees a slot whose start lies in the future (a Load rewound the clock)", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 500);
    layer.update(ORIGIN, FACING, 3);
    expect(cloudOf(layer).visible).toBe(false);
    layer.update(ORIGIN, FACING, 500);
    expect(cloudOf(layer).visible).toBe(false);
  });

  it("never reallocates its buffers or geometry while explosions come and go", () => {
    const { layer } = recorded();
    const cloud = cloudOf(layer);
    const matrixAttribute = cloud.instanceMatrix;
    const matrixArray = cloud.instanceMatrix.array;
    const colourAttribute = cloud.instanceColor;
    const colourArray = cloud.instanceColor?.array;
    const geometry = cloud.geometry;
    for (let i = 0; i < 200; i += 1) {
      layer.add(vec(i, 0, 0), 10, DEFAULT, i * 0.1);
      layer.update(ORIGIN, FACING, i * 0.1);
    }
    expect(cloud.instanceMatrix).toBe(matrixAttribute);
    expect(cloud.instanceMatrix.array).toBe(matrixArray);
    expect(cloud.instanceColor).toBe(colourAttribute);
    expect(cloud.instanceColor?.array).toBe(colourArray);
    expect(cloud.geometry).toBe(geometry);
  });
});

describe("createExplosionLayer: input checks", () => {
  it("skips non-finite input", () => {
    const { layer, urls } = recorded();
    layer.add(vec(Number.NaN, 0, 0), 10, DEFAULT, 1);
    layer.add(vec(0, 0, 0), Number.POSITIVE_INFINITY, DEFAULT, 1);
    layer.add(vec(0, 0, 0), 10, DEFAULT, Number.NaN);
    layer.add(vec(0, 0, 0), 10, { ...DEFAULT, duration: Number.NaN }, 1);
    layer.update(ORIGIN, FACING, 1);
    expect(cloudOf(layer).visible).toBe(false);
    expect(urls).toEqual([]);
  });

  it("skips a texture name outside oolite-particle-<name>.png, building no URL", () => {
    const { layer, urls } = recorded();
    for (const texture of [
      "../secret.png",
      "oolite-particle-cloud2.png?x=1",
      "https://example.com/oolite-particle-cloud2.png",
      "oolite-particle-CLOUD.png",
    ]) {
      layer.add(vec(0, 0, 0), 10, { ...DEFAULT, texture }, 1);
    }
    layer.update(ORIGIN, FACING, 1);
    expect(cloudOf(layer).visible).toBe(false);
    expect(urls).toEqual([]);
  });

  it("loads the cloud texture under <baseUrl>textures/ on the first add only", () => {
    const { layer, urls } = recorded();
    layer.update(ORIGIN, FACING, 1);
    expect(urls).not.toContain("/base/textures/oolite-particle-cloud2.png");
    layer.add(vec(0, 0, 0), 10, DEFAULT, 1);
    layer.add(vec(1, 0, 0), 10, DEFAULT, 1);
    expect(
      urls.filter((url) => url === "/base/textures/oolite-particle-cloud2.png"),
    ).toHaveLength(1);
  });
});

describe("createExplosionLayer: the flash (OOFlashEffectEntity.m)", () => {
  it("uses Oolite's flash constants", () => {
    expect(FLASH_DURATION).toBe(0.4);
    expect(FLASH_ALPHA).toBe(0.5);
    expect(FLASH_GROWTH_FACTOR).toBe(150);
    expect(FLASH_MIN_GROWTH).toBe(600);
    const { layer } = recorded();
    expect(flashOf(layer).instanceMatrix.count).toBe(EXPLOSION_POOL);
    const material = flashOf(layer).material as THREE.MeshBasicMaterial;
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(flashOf(layer).geometry).toBe(cloudOf(layer).geometry);
  });

  it("starts at the radius and grows by max(150 * radius, 600) per second", () => {
    for (const radius of [2, 10, 40]) {
      const { layer } = recorded();
      const camera = vec(5e8, 0, -5e8);
      layer.add(vec(5e8 + 7, 0, -5e8), radius, DEFAULT, 3);
      layer.update(camera, FACING, 3);
      expect(flashAt(layer, 0).size).toBeCloseTo(radius, 3);
      expect(flashAt(layer, 0).position).toEqual(vec(7, 0, 0));
      layer.update(camera, FACING, 3.2);
      const growth = Math.max(150 * radius, 600);
      expect(flashAt(layer, 0).size).toBeCloseTo(radius + growth * 0.2, 2);
    }
  });

  it("fades in to 0.5 over 0.667 of its life and out to 0 at 0.4 s", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 0);
    const tf = 0.667 * FLASH_DURATION;
    const expected = (t: number): number =>
      FLASH_ALPHA *
      (t < tf ? t / tf : (FLASH_DURATION - t) / (FLASH_DURATION - tf));
    for (const t of [0, 0.05, 0.2, tf - 1e-3, tf + 1e-3, 0.3, 0.39]) {
      layer.update(ORIGIN, FACING, t);
      expect(flashOf(layer).visible).toBe(true);
      expect(flashAt(layer, 0).alpha, `t = ${String(t)}`).toBeCloseTo(
        expected(t),
        4,
      );
    }
    layer.update(ORIGIN, FACING, FLASH_DURATION + 1e-6);
    expect(flashOf(layer).visible).toBe(false);
    expect(flashOf(layer).count).toBe(0);
    // The cloud lives on for its own 1.5 s.
    expect(cloudOf(layer).visible).toBe(true);
  });

  it("keeps a flash when the cloud setting is shorter than the flash", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, { ...DEFAULT, duration: 0.1 }, 0);
    layer.update(ORIGIN, FACING, 0.2);
    expect(cloudOf(layer).visible).toBe(false);
    expect(flashOf(layer).visible).toBe(true);
    layer.update(ORIGIN, FACING, 0.5);
    expect(flashOf(layer).visible).toBe(false);
  });
});

describe("createExplosionLayer: a fixed number of draw objects", () => {
  it("has exactly two draw objects, both hidden with nothing live", () => {
    const { layer } = recorded();
    let meshes = 0;
    layer.root.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes += 1;
    });
    expect(meshes).toBe(2);
    layer.update(ORIGIN, FACING, 1);
    expect(drawObjects(layer)).toBe(0);
  });

  it("shows two while an explosion is live, one after the flash, none after the cloud", () => {
    const { layer } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 0);
    layer.update(ORIGIN, FACING, 0.1);
    expect(drawObjects(layer)).toBe(2);
    layer.update(ORIGIN, FACING, 1);
    expect(drawObjects(layer)).toBe(1);
    layer.update(ORIGIN, FACING, 1.6);
    expect(drawObjects(layer)).toBe(0);
  });

  for (const count of [16, 50]) {
    it(`never makes a third draw object for ${String(count)} explosions in one frame`, () => {
      const { layer } = recorded();
      const children = [...layer.root.children];
      for (let i = 0; i < count; i += 1) {
        layer.add(vec(i * 100, 0, 0), 10, DEFAULT, 2);
      }
      layer.update(ORIGIN, FACING, 2.1);
      expect(drawObjects(layer)).toBe(2);
      expect(layer.root.children).toEqual(children);
      expect(cloudOf(layer).count).toBe(
        EXPLOSION_POOL * EXPLOSION_MAX_PARTICLES,
      );
      expect(flashOf(layer).count).toBe(EXPLOSION_POOL);
    });
  }
});

describe("createExplosionLayer: lazy textures and disposal", () => {
  it("loads nothing when built or updated with nothing added", () => {
    const { layer, urls } = recorded();
    layer.update(ORIGIN, FACING, 1);
    layer.update(vec(1, 2, 3), FACING, 2);
    expect(urls).toEqual([]);
  });

  it("loads the cloud and the flash texture once each on the first add, nothing after", () => {
    const { layer, urls, textures } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 1);
    expect(urls).toEqual([
      "/base/textures/oolite-particle-cloud2.png",
      "/base/textures/oolite-particle-flash.png",
    ]);
    layer.add(vec(1, 0, 0), 10, DEFAULT, 1);
    layer.add(
      vec(2, 0, 0),
      10,
      { ...DEFAULT, texture: "oolite-particle-other.png" },
      1,
    );
    layer.update(ORIGIN, FACING, 1.1);
    expect(urls).toHaveLength(2);
    const cloudMaterial = cloudOf(layer).material as THREE.MeshBasicMaterial;
    const flashMaterial = flashOf(layer).material as THREE.MeshBasicMaterial;
    expect(cloudMaterial.alphaMap).toBe(textures[0]);
    expect(flashMaterial.alphaMap).toBe(textures[1]);
    for (const texture of textures) {
      expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    }
  });

  it("frees both instanced meshes, the geometry, both materials and every loaded texture once", () => {
    const { layer, textures } = recorded();
    layer.add(vec(0, 0, 0), 10, DEFAULT, 1);
    const counted = new Map<string, number>();
    const count = (name: string, resource: { dispose(): void }): void => {
      counted.set(name, 0);
      const target = resource as unknown as {
        addEventListener(type: string, listener: () => void): void;
      };
      target.addEventListener("dispose", () => {
        counted.set(name, (counted.get(name) ?? 0) + 1);
      });
    };
    // The instance buffers belong to the meshes: only a mesh dispose frees them.
    count("cloudMesh", cloudOf(layer));
    count("flashMesh", flashOf(layer));
    count("geometry", cloudOf(layer).geometry);
    count("cloudMaterial", cloudOf(layer).material as THREE.Material);
    count("flashMaterial", flashOf(layer).material as THREE.Material);
    for (const [index, texture] of textures.entries()) {
      count(`texture${String(index)}`, texture);
    }
    expect(counted.size).toBe(7);
    layer.dispose();
    layer.dispose();
    for (const [name, disposals] of counted) {
      expect(disposals, name).toBe(1);
    }
  });

  it("is a no-op after dispose", () => {
    const { layer, urls } = recorded();
    layer.dispose();
    expect(() => {
      layer.add(vec(0, 0, 0), 10, DEFAULT, 1);
      layer.update(ORIGIN, FACING, 1);
    }).not.toThrow();
    expect(urls).toEqual([]);
    expect(drawObjects(layer)).toBe(0);
  });
});
