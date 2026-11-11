// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The navigation buoys (PROJECT.md Key Decisions, revising Phase 3 D-04).
 *
 * The flasher formula is checked against hand-worked values of Oolite's
 * `OOFlasherEntity.m`, the committed `buoy.glb` is checked for the lights the
 * build resolved from `shipdata.plist`, and the body is checked for what it
 * owns and disposes.
 */

import { readFileSync } from "node:fs";

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import {
  BUOY_PITCH_RATE,
  BUOY_ROLL_RATE,
  createBuoy,
  flasherBrightness,
  flasherColourIndex,
  readFlashers,
} from "../../src/render/bodies/buoy.js";
import type { FlasherLight } from "../../src/render/bodies/buoy.js";

const LIGHT: FlasherLight = {
  position: [1, 2, 3],
  size: 30,
  frequency: 0.15,
  phase: 0,
  brightFraction: 0.5,
  colors: [[0.25, 0.3, 1]],
};

/** A stand-in for the loaded GLB: two named meshes and the scene extras. */
function fakeGltf(flashers: unknown): GLTF {
  const scene = new THREE.Group();
  for (const name of ["hull", "core"]) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    mesh.name = name;
    scene.add(mesh);
  }
  scene.userData = { oolite: { flashers } };
  return { scene } as unknown as GLTF;
}

const VALID = { buoy: [LIGHT], "buoy-witchpoint": [LIGHT, LIGHT] };

/** The JSON chunk of the committed model. */
function committedBuoyJson(): {
  scenes: {
    extras?: { oolite?: { flashers?: Record<string, FlasherLight[]> } };
  }[];
  nodes: { name: string }[];
} {
  const bytes = readFileSync("public/models/buoy.glb");
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as ReturnType<typeof committedBuoyJson>;
}

describe("flasherBrightness", () => {
  it("rests at the bright fraction when the wave is at its threshold", () => {
    // With a bright fraction of 0.5 the threshold is cos(pi/2) = 0, which the
    // wave crosses at time 0.
    expect(flasherBrightness(LIGHT, 0)).toBeCloseTo(0.5, 12);
  });

  it("reaches 1 at the top of the wave and 0 at the bottom", () => {
    // The wave is sin(2 * 0.15 * pi * t): its period is 1 / 0.15 seconds.
    const period = 1 / LIGHT.frequency;
    expect(flasherBrightness(LIGHT, period / 4)).toBeCloseTo(1, 12);
    expect(flasherBrightness(LIGHT, (3 * period) / 4)).toBeCloseTo(0, 12);
  });

  it("follows Oolite's two-slope mapping for an uneven bright fraction", () => {
    const light = { frequency: 0.25, phase: 0, brightFraction: 0.25 };
    const threshold = Math.cos(0.25 * Math.PI);
    // Top of the wave: 0.25 + (0.75 / (1 - threshold)) * (1 - threshold) = 1.
    expect(flasherBrightness(light, 1)).toBeCloseTo(1, 12);
    // Bottom: 0.25 + (0.25 / (threshold + 1)) * (-1 - threshold) = 0.
    expect(flasherBrightness(light, 3)).toBeCloseTo(0, 12);
    // Wave 0 is below the threshold: the lower slope applies.
    expect(flasherBrightness(light, 0)).toBeCloseTo(
      0.25 + (0.25 / (threshold + 1)) * (0 - threshold),
      12,
    );
  });

  it("shifts with the phase, which is added to the time", () => {
    const shifted = { ...LIGHT, phase: 1 };
    expect(flasherBrightness(shifted, 2)).toBeCloseTo(
      flasherBrightness(LIGHT, 3),
      12,
    );
  });

  it("is a steady full light at zero frequency", () => {
    expect(flasherBrightness({ ...LIGHT, frequency: 0 }, 123.4)).toBe(1);
  });

  it("stays inside 0..1 over many periods", () => {
    for (let step = 0; step < 2000; step += 1) {
      const value = flasherBrightness(LIGHT, step * 0.037 - 20);
      expect(value).toBeGreaterThanOrEqual(-1e-12);
      expect(value).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});

describe("flasherColourIndex", () => {
  const light = { frequency: 0.5, phase: 0 };

  it("is always 0 for a single colour", () => {
    expect(flasherColourIndex(light, 17.3, 1)).toBe(0);
  });

  it("steps once per period, at the bottom of the wave", () => {
    // frequency 0.5: the wave is sin(pi * t), period 2 s, minimum at t = 1.5.
    expect(flasherColourIndex(light, 0, 3)).toBe(0);
    expect(flasherColourIndex(light, 1.49, 3)).toBe(0);
    expect(flasherColourIndex(light, 1.51, 3)).toBe(1);
    expect(flasherColourIndex(light, 3.49, 3)).toBe(1);
    expect(flasherColourIndex(light, 3.51, 3)).toBe(2);
    expect(flasherColourIndex(light, 5.51, 3)).toBe(0);
  });

  it("stays in range before time zero", () => {
    for (let step = 0; step < 200; step += 1) {
      const index = flasherColourIndex(light, -step * 0.31, 3);
      expect([0, 1, 2]).toContain(index);
    }
  });
});

describe("readFlashers", () => {
  it("returns the list filed under the role", () => {
    expect(readFlashers(fakeGltf(VALID), "buoy")).toHaveLength(1);
    expect(readFlashers(fakeGltf(VALID), "buoy-witchpoint")).toHaveLength(2);
  });

  it.each([
    ["no extras", undefined],
    ["an empty list", { buoy: [] }],
    ["a non-finite size", { buoy: [{ ...LIGHT, size: Number.NaN }] }],
    ["a zero size", { buoy: [{ ...LIGHT, size: 0 }] }],
    ["a two-component position", { buoy: [{ ...LIGHT, position: [1, 2] }] }],
    ["no colours", { buoy: [{ ...LIGHT, colors: [] }] }],
    ["a malformed colour", { buoy: [{ ...LIGHT, colors: [[1, 2]] }] }],
    ["a bright fraction of 1", { buoy: [{ ...LIGHT, brightFraction: 1 }] }],
  ])("throws for %s", (_label, flashers) => {
    expect(() => readFlashers(fakeGltf(flashers), "buoy")).toThrow(
      /buoy model/,
    );
  });
});

describe("the committed buoy model", () => {
  const json = committedBuoyJson();
  const flashers = json.scenes[0]?.extras?.oolite?.flashers;

  it("has the hull and the core node", () => {
    expect(json.nodes.map((node) => node.name)).toEqual(["hull", "core"]);
  });

  it("carries the station buoy's four blue lights from shipdata.plist", () => {
    const lights = flashers?.["buoy"] ?? [];
    expect(lights).toHaveLength(4);
    for (const light of lights) {
      expect(light.size).toBe(30);
      expect(light.frequency).toBe(0.15);
      expect(light.brightFraction).toBe(0.5);
      expect(light.colors).toHaveLength(1);
      // Hue 236 at Oolite's 0.75 flasher saturation: blue dominant.
      const [red, green, blue] = light.colors[0] ?? [0, 0, 0];
      expect(blue).toBe(1);
      expect(red).toBeCloseTo(0.25, 6);
      expect(green).toBeGreaterThan(red);
      expect(green).toBeLessThan(0.35);
    }
    expect(lights.map((light) => light.phase)).toEqual([-1, 1, -3, 3]);
    // Oolite's (-0.75, 23.85, 0.92), with Z negated for glTF.
    expect(lights[0]?.position).toEqual([-0.75, 23.85, -0.92]);
  });

  it("carries the witchpoint beacon's lights, two of them three-coloured", () => {
    const lights = flashers?.["buoy-witchpoint"] ?? [];
    expect(lights).toHaveLength(4);
    expect(lights.map((light) => light.size)).toEqual([150, 150, 25, 25]);
    expect(lights.map((light) => light.colors.length)).toEqual([3, 3, 1, 1]);
    expect(lights.map((light) => light.position[2])).toEqual([
      -60, 60, -60, 60,
    ]);
    // `{ hue = 30; saturation = 0; brightness = 0.85; }` is a plain grey.
    expect(lights[0]?.colors[2]).toEqual([0.85, 0.85, 0.85]);
  });
});

describe("createBuoy", () => {
  it("builds the model clone and one additive sprite per light", () => {
    const buoy = createBuoy(fakeGltf(VALID), "buoy-witchpoint");
    expect(buoy.lightCount).toBe(2);
    const sprites: THREE.Sprite[] = [];
    buoy.root.traverse((object) => {
      if (object.name.startsWith("buoy-light-")) {
        sprites.push(object as THREE.Sprite);
      }
    });
    expect(sprites).toHaveLength(2);
    for (const sprite of sprites) {
      expect(sprite.material.blending).toBe(THREE.AdditiveBlending);
      expect(sprite.material.depthWrite).toBe(false);
      expect(sprite.material.depthTest).toBe(true);
      // Oolite's quad spans -size..+size.
      expect(sprite.scale.x).toBe(60);
      expect(sprite.position.toArray()).toEqual([1, 2, 3]);
    }
    expect(buoy.root.getObjectByName("hull")).toBeDefined();
    expect(buoy.root.getObjectByName("core")).toBeDefined();
  });

  it("owns clones of the materials, never the cached ones", () => {
    const gltf = fakeGltf(VALID);
    const cached = (gltf.scene.getObjectByName("hull") as THREE.Mesh).material;
    const buoy = createBuoy(gltf, "buoy");
    const own = (buoy.root.getObjectByName("hull") as THREE.Mesh).material;
    expect(own).not.toBe(cached);
    // The geometry stays shared with the cache.
    expect((buoy.root.getObjectByName("hull") as THREE.Mesh).geometry).toBe(
      (gltf.scene.getObjectByName("hull") as THREE.Mesh).geometry,
    );
  });

  it("drives the light colour from the brightness", () => {
    const buoy = createBuoy(fakeGltf(VALID), "buoy");
    const sprite = buoy.root.getObjectByName("buoy-light-0") as THREE.Sprite;
    const period = 1 / LIGHT.frequency;

    buoy.update((3 * period) / 4);
    expect(sprite.material.color.b).toBeCloseTo(0, 6);

    buoy.update(period / 4);
    // Full brightness: the authored blue of 1 survives the colour-space step.
    expect(sprite.material.color.b).toBeCloseTo(1, 6);
    expect(sprite.material.color.r).toBeGreaterThan(0);
    expect(sprite.material.color.r).toBeLessThan(sprite.material.color.b);
  });

  it("tumbles at Oolite's rates and is a function of the time alone", () => {
    const buoy = createBuoy(fakeGltf(VALID), "buoy");
    const body = buoy.root.getObjectByName("buoy-body");
    if (body === undefined) throw new Error("expected the tumbling body");

    buoy.update(0);
    expect(body.quaternion.toArray()).toEqual([0, 0, 0, 1]);

    buoy.update(10);
    const expected = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 0, 1), 10 * BUOY_ROLL_RATE)
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          10 * BUOY_PITCH_RATE,
        ),
      );
    expect(body.quaternion.angleTo(expected)).toBeCloseTo(0, 9);

    // Going away and coming back gives the same pose: no hidden state.
    buoy.update(500);
    buoy.update(10);
    expect(body.quaternion.angleTo(expected)).toBeCloseTo(0, 9);
  });

  it("treats a non-finite time as zero instead of poisoning the pose", () => {
    const buoy = createBuoy(fakeGltf(VALID), "buoy");
    buoy.update(Number.NaN);
    const body = buoy.root.getObjectByName("buoy-body");
    expect(body?.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });

  it("disposes its own materials and blob texture, and nothing cached", () => {
    const gltf = fakeGltf(VALID);
    const cachedGeometry = (gltf.scene.getObjectByName("hull") as THREE.Mesh)
      .geometry;
    let cachedDisposed = 0;
    cachedGeometry.addEventListener("dispose", () => {
      cachedDisposed += 1;
    });

    const buoy = createBuoy(gltf, "buoy");
    const sprite = buoy.root.getObjectByName("buoy-light-0") as THREE.Sprite;
    const hull = buoy.root.getObjectByName("hull") as THREE.Mesh;
    let disposed = 0;
    const count = (): void => {
      disposed += 1;
    };
    sprite.material.addEventListener("dispose", count);
    sprite.material.map?.addEventListener("dispose", count);
    (hull.material as THREE.Material).addEventListener("dispose", count);

    buoy.dispose();

    expect(disposed).toBe(3);
    expect(cachedDisposed).toBe(0);
    expect(buoy.root.children).toHaveLength(0);
  });

  it("fails loudly when the model lost a node", () => {
    const gltf = fakeGltf(VALID);
    const core = gltf.scene.getObjectByName("core");
    if (core !== undefined) gltf.scene.remove(core);
    expect(() => createBuoy(gltf, "buoy")).toThrow(/"core" node/);
  });
});
