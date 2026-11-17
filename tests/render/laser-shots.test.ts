// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drawn laser shots (CBT-05, criterion 3, quick 261117-han), decided in
 * Node against the ribbon layer's buffers, index, draw range and material.
 * Building a `Mesh` with a `ShaderMaterial` needs no WebGL context, so the
 * lifetime, colour, the fixed pool, the camera-relative write, the
 * camera-facing side vector, the Oolite profile constants and the shader's
 * attribute contract are all plain assertions. The browser proof that the
 * shader compiles is `tests/e2e/laser-shots.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  LASER_CORE_HALF_WIDTH,
  LASER_CORE_PEAK,
  LASER_FLARE_HALF_WIDTH,
  LASER_FLARE_PEAK,
  LASER_HALO_HALF_WIDTH,
  LASER_HALO_PEAK,
  LASER_MIN_HALF_EXTENT_PX,
  LASER_SHOT_COLORS,
  LASER_SHOT_POOL,
  LASER_TIME_WRAP,
  createLaserShotLayer,
  laserShotFade,
} from "../../src/render/bodies/laser-shots.js";
import {
  LASER_SHOT_DURATION,
  LASER_STATS,
} from "../../src/sim/combat/constants.js";
import type { LaserKind } from "../../src/sim/events.js";
import { vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";

const ORIGIN = vec(0, 0, 0);

type Layer = ReturnType<typeof createLaserShotLayer>;

function attr(layer: Layer, name: string): Float32Array {
  return layer.root.geometry.getAttribute(name).array as Float32Array;
}

function positions(layer: Layer): Float32Array {
  return attr(layer, "position");
}

function sides(layer: Layer): Float32Array {
  return attr(layer, "aSide");
}

function colours(layer: Layer): Float32Array {
  return attr(layer, "aColor");
}

function shapes(layer: Layer): Float32Array {
  return attr(layer, "aShape");
}

function drawn(layer: Layer): number {
  return layer.root.geometry.drawRange.count;
}

function uniform(layer: Layer, name: string): unknown {
  return layer.root.material.uniforms[name]?.value;
}

/** The side vector of quad `slot`, read from its first vertex. */
function sideOf(layer: Layer, slot = 0): Vec3 {
  const s = sides(layer);
  const base = slot * 12;
  return vec(s[base] ?? 0, s[base + 1] ?? 0, s[base + 2] ?? 0);
}

function lengthOf(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function dotOf(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function unit(v: Vec3): Vec3 {
  const l = lengthOf(v);
  return vec(v.x / l, v.y / l, v.z / l);
}

function expectAllFinite(layer: Layer): void {
  for (const name of ["position", "aSide", "aColor", "aShape"]) {
    for (const value of attr(layer, name)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  }
}

/** The side vector is the same on the 4 vertices of quad 0. */
function expectSideShared(layer: Layer): void {
  const s = sides(layer);
  for (let v = 1; v < 4; v += 1) {
    expect(s[v * 3]).toBe(s[0]);
    expect(s[v * 3 + 1]).toBe(s[1]);
    expect(s[v * 3 + 2]).toBe(s[2]);
  }
}

function stubRenderer(width: number, height: number): THREE.WebGLRenderer {
  const stub = {
    getDrawingBufferSize(target: THREE.Vector2): THREE.Vector2 {
      return target.set(width, height);
    },
  };
  return stub as unknown as THREE.WebGLRenderer;
}

function callBeforeRender(layer: Layer, renderer: THREE.WebGLRenderer): void {
  layer.root.onBeforeRender(
    renderer,
    new THREE.Scene(),
    new THREE.Camera(),
    layer.root.geometry,
    layer.root.material,
    new THREE.Group(),
  );
}

describe("createLaserShotLayer: lifetime and visibility", () => {
  it("is invisible, with an empty draw range, before any shot", () => {
    const layer = createLaserShotLayer();
    layer.update(ORIGIN, 1);
    expect(layer.root.visible).toBe(false);
    expect(drawn(layer)).toBe(0);
  });

  it("shows a shot from the time it is added for 0.09 s of flight time", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -100), "pulse", 10);
    layer.update(ORIGIN, 10);
    expect(layer.root.visible).toBe(true);
    expect(drawn(layer)).toBe(6);
    layer.update(ORIGIN, 10 + LASER_SHOT_DURATION / 2);
    expect(layer.root.visible).toBe(true);
    layer.update(ORIGIN, 10 + LASER_SHOT_DURATION + 1e-9);
    expect(layer.root.visible).toBe(false);
    expect(drawn(layer)).toBe(0);
  });

  it("uses the Oolite duration of 0.09 s", () => {
    expect(LASER_SHOT_DURATION).toBe(0.09);
  });

  it("does not bring an expired shot back when the clock is read again", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -100), "beam", 5);
    layer.update(ORIGIN, 6);
    layer.update(ORIGIN, 5.01);
    expect(layer.root.visible).toBe(false);
  });

  it("drops a shot whose start lies in the future (a Load rewound the clock)", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -100), "pulse", 500);
    layer.update(ORIGIN, 3);
    expect(layer.root.visible).toBe(false);
    layer.update(ORIGIN, 500);
    expect(layer.root.visible).toBe(false);
  });

  it("keeps two shots with different ages independent and compacts the survivor", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -10), "pulse", 1);
    layer.add(vec(0, 0, 0), vec(0, 0, -20), "beam", 1.05);
    layer.update(ORIGIN, 1.07);
    expect(drawn(layer)).toBe(12);
    layer.update(ORIGIN, 1.1);
    expect(drawn(layer)).toBe(6);
    // The survivor is the second (beam) shot, now in slots 0-3: its to end
    // (z = -20) is vertex 2.
    expect(positions(layer)[2 * 3 + 2]).toBeCloseTo(-20, 5);
    expect(positions(layer)[3 * 3 + 2]).toBeCloseTo(-20, 5);
    expect(positions(layer)[2]).toBeCloseTo(0, 5);
    layer.update(ORIGIN, 1.2);
    expect(drawn(layer)).toBe(0);
  });
});

describe("createLaserShotLayer: colour by laser kind", () => {
  const expected: Readonly<
    Record<LaserKind, readonly [number, number, number]>
  > = {
    pulse: [1, 0, 0],
    beam: [1, 1, 0],
    mining: [0, 0, 1],
    military: [1, 0, 1],
    thargoid: [0, 1, 0],
  };

  it("matches the colour table: pulse red, beam yellow, mining blue, military magenta", () => {
    expect(LASER_SHOT_COLORS).toEqual(expected);
  });

  it("agrees with the weapon_info colour name of each player laser", () => {
    const byName = {
      redColor: [1, 0, 0],
      yellowColor: [1, 1, 0],
      blueColor: [0, 0, 1],
      magentaColor: [1, 0, 1],
    } as const;
    for (const stats of Object.values(LASER_STATS)) {
      expect(LASER_SHOT_COLORS[stats.laserKind]).toEqual(byName[stats.color]);
    }
  });

  for (const kind of Object.keys(expected) as LaserKind[]) {
    it(`writes the ${kind} colour to all four vertices of the quad`, () => {
      const layer = createLaserShotLayer();
      layer.add(vec(0, 0, 0), vec(0, 0, -50), kind, 1);
      layer.update(ORIGIN, 1);
      const [r, g, b] = expected[kind];
      expect([...colours(layer).slice(0, 12)]).toEqual([
        r,
        g,
        b,
        r,
        g,
        b,
        r,
        g,
        b,
        r,
        g,
        b,
      ]);
    });
  }
});

describe("createLaserShotLayer: the fixed pool", () => {
  it("has 32 slots of 4 vertices and 6 indices", () => {
    expect(LASER_SHOT_POOL).toBe(32);
    const layer = createLaserShotLayer();
    expect(positions(layer)).toHaveLength(32 * 4 * 3);
    expect(sides(layer)).toHaveLength(32 * 4 * 3);
    expect(colours(layer)).toHaveLength(32 * 4 * 3);
    expect(shapes(layer)).toHaveLength(32 * 4 * 4);
    const index = layer.root.geometry.getIndex();
    expect(index).not.toBeNull();
    expect(index?.count).toBe(32 * 6);
    const indices = [...(index?.array ?? [])];
    for (let j = 0; j < 32; j += 1) {
      expect(indices.slice(j * 6, j * 6 + 6)).toEqual([
        4 * j,
        4 * j + 1,
        4 * j + 2,
        4 * j,
        4 * j + 2,
        4 * j + 3,
      ]);
    }
  });

  it("draws 32 simultaneous shots and overwrites the oldest beyond that", () => {
    const layer = createLaserShotLayer();
    const geometry = layer.root.geometry;
    const positionBuffer = geometry.getAttribute("position");
    const colourBuffer = geometry.getAttribute("aColor");
    // 33 shots in one instant: the first (z = -1) is the one overwritten.
    for (let i = 1; i <= 33; i += 1) {
      layer.add(vec(0, 0, 0), vec(0, 0, -i), "pulse", 1);
    }
    layer.update(ORIGIN, 1);
    expect(drawn(layer)).toBe(32 * 6);
    const farEnds = new Set<number>();
    const buffer = positions(layer);
    // Vertex 2 of each quad is its to end.
    for (let slot = 0; slot < 32; slot += 1)
      farEnds.add(buffer[slot * 12 + 2 * 3 + 2] ?? 0);
    expect(farEnds.has(-1)).toBe(false);
    for (let i = 2; i <= 33; i += 1) expect(farEnds.has(-i)).toBe(true);
    // Nothing was reallocated: the same buffers, the same geometry.
    expect(geometry.getAttribute("position")).toBe(positionBuffer);
    expect(geometry.getAttribute("aColor")).toBe(colourBuffer);
  });

  it("never reallocates its attributes, arrays or index while shots come and go", () => {
    const layer = createLaserShotLayer();
    const geometry = layer.root.geometry;
    const names = ["position", "aSide", "aColor", "aShape"];
    const attributes = names.map((name) => geometry.getAttribute(name));
    const arrays = attributes.map((a) => a.array);
    const index = geometry.getIndex();
    const indexArray = index?.array;
    for (let i = 0; i < 200; i += 1) {
      layer.add(vec(0, 0, 0), vec(0, 0, -i), "beam", i * 0.01);
      layer.update(ORIGIN, i * 0.01);
    }
    names.forEach((name, i) => {
      expect(geometry.getAttribute(name)).toBe(attributes[i]);
      expect(geometry.getAttribute(name).array).toBe(arrays[i]);
    });
    expect(geometry.getIndex()).toBe(index);
    expect(geometry.getIndex()?.array).toBe(indexArray);
  });
});

describe("createLaserShotLayer: camera-relative ends", () => {
  it("writes both ends minus the camera, subtracted in float64", () => {
    const layer = createLaserShotLayer();
    const camera = vec(1e9, -2e9, 3e9);
    layer.add(
      vec(1e9 + 1, -2e9 + 2, 3e9 + 3),
      vec(1e9 + 4, -2e9 + 5, 3e9 + 6),
      "pulse",
      1,
    );
    layer.update(camera, 1);
    expect([...positions(layer).slice(0, 12)]).toEqual([
      1, 2, 3, 1, 2, 3, 4, 5, 6, 4, 5, 6,
    ]);
  });

  it("follows the camera between frames without re-adding the shot", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(10, 0, 0), vec(10, 0, -5), "pulse", 1);
    layer.update(vec(0, 0, 0), 1.01);
    const before = [...positions(layer).slice(0, 12)];
    expect(before[0]).toBe(10);
    layer.update(vec(4, 0, 0), 1.02);
    const after = [...positions(layer).slice(0, 12)];
    for (let i = 0; i < 12; i += 1) {
      const shift = i % 3 === 0 ? -4 : 0;
      expect(after[i]).toBeCloseTo((before[i] ?? 0) + shift, 6);
    }
  });
});

describe("createLaserShotLayer: the camera-facing side vector (OD-1)", () => {
  it("spreads the cockpit fore shot sideways, perpendicular to beam and view", () => {
    const layer = createLaserShotLayer();
    // The Oolite fore weapon mount minus the cockpit eye, z flipped.
    const a = vec(-0.0961, -6.3133, -12.4655);
    const b = vec(a.x, a.y, a.z - 12500);
    layer.add(a, b, "pulse", 1);
    layer.update(ORIGIN, 1);
    expectSideShared(layer);
    const s = sideOf(layer);
    expect(Math.abs(lengthOf(s) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(dotOf(s, vec(0, 0, -1)))).toBeLessThan(1e-6);
    expect(Math.abs(dotOf(s, unit(a)))).toBeLessThan(1e-6);
    expect(Math.abs(dotOf(s, unit(b)))).toBeLessThan(1e-6);
    expect(Math.abs(s.x)).toBeGreaterThan(0.99);
  });

  it("faces a crossing beam seen from the origin: the side is vertical", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(-100, 0, -50), vec(100, 0, -50), "beam", 1);
    layer.update(ORIGIN, 1);
    const s = sideOf(layer);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(s.y) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(s.z)).toBeLessThan(1e-6);
  });

  it("turns toward the camera when the camera moves, without re-adding", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(-100, 0, -50), vec(100, 0, -50), "beam", 1);
    layer.update(ORIGIN, 1);
    layer.update(vec(0, 50, -50), 1.01);
    const s = sideOf(layer);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
    expect(Math.abs(s.y)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(s.z) - 1)).toBeLessThan(1e-6);
  });

  it("stays finite and unit length when the camera is on the beam's line", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(-100, 0, -50), vec(100, 0, -50), "beam", 1);
    layer.update(vec(0, 0, -50), 1);
    expectAllFinite(layer);
    expectSideShared(layer);
    const s = sideOf(layer);
    expect(Math.abs(lengthOf(s) - 1)).toBeLessThan(1e-6);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
  });

  it("stays finite and unit length for a zero-length shot", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(5, 5, -5), vec(5, 5, -5), "pulse", 1);
    layer.update(ORIGIN, 1);
    expect(layer.root.visible).toBe(true);
    expectAllFinite(layer);
    const s = sideOf(layer);
    expect(Math.abs(lengthOf(s) - 1)).toBeLessThan(1e-6);
  });
});

describe("createLaserShotLayer: the shape attribute and fade (OD-8)", () => {
  it("writes (across, along, length, fade) per vertex", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -100), "pulse", 1);
    layer.update(ORIGIN, 1);
    expect([...shapes(layer).slice(0, 16)]).toEqual([
      -1, 0, 100, 1, 1, 0, 100, 1, 1, 100, 100, 1, -1, 100, 100, 1,
    ]);
  });

  it("fades as 1 - (age / 0.09)^2", () => {
    expect(laserShotFade(0)).toBe(1);
    expect(laserShotFade(0.045)).toBeCloseTo(0.75, 12);
    expect(laserShotFade(0.09)).toBe(0);
    expect(laserShotFade(Number.NaN)).toBe(0);
    let previous = laserShotFade(0);
    for (let i = 1; i <= 90; i += 1) {
      const value = laserShotFade(i * 0.001);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it("writes the fade of the shot's age", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -100), "pulse", 1);
    layer.update(ORIGIN, 1);
    expect(shapes(layer)[3]).toBe(1);
    layer.update(ORIGIN, 1.06);
    const fade = shapes(layer)[3] ?? Number.NaN;
    expect(fade).toBeGreaterThan(0);
    expect(fade).toBeLessThan(1);
    for (let v = 1; v < 4; v += 1) expect(shapes(layer)[v * 4 + 3]).toBe(fade);
  });
});

describe("createLaserShotLayer: Oolite's profile (OD-3, OD-6, OD-11)", () => {
  it("exports the Oolite half-widths in metres and the peaks", () => {
    expect(LASER_HALO_HALF_WIDTH).toBeCloseTo(3.6, 12);
    expect(LASER_FLARE_HALF_WIDTH).toBeCloseTo(1.8, 12);
    expect(LASER_CORE_HALF_WIDTH).toBeCloseTo(0.4, 12);
    expect(LASER_HALO_PEAK).toBeCloseTo(0.15, 12);
    expect(LASER_FLARE_PEAK).toBeCloseTo(1.5, 12);
    expect(LASER_CORE_PEAK).toBeCloseTo(4.5, 12);
    expect(LASER_MIN_HALF_EXTENT_PX).toBe(2);
  });

  it("carries the profile in the material uniforms", () => {
    const layer = createLaserShotLayer();
    expect(uniform(layer, "uHaloHalfWidth")).toBeCloseTo(3.6, 12);
    expect(uniform(layer, "uFlareHalfWidth")).toBeCloseTo(1.8, 12);
    expect(uniform(layer, "uCoreHalfWidth")).toBeCloseTo(0.4, 12);
    expect(uniform(layer, "uHaloPeak")).toBeCloseTo(0.15, 12);
    expect(uniform(layer, "uFlarePeak")).toBeCloseTo(1.5, 12);
    expect(uniform(layer, "uCorePeak")).toBeCloseTo(4.5, 12);
    expect(uniform(layer, "uMinHalfExtentPx")).toBe(2);
  });
});

describe("createLaserShotLayer: the material (OD-2, OD-5)", () => {
  it("is one Mesh that culling cannot hide", () => {
    const layer = createLaserShotLayer();
    const object: THREE.Mesh = layer.root;
    expect(object.type).toBe("Mesh");
    expect(object.frustumCulled).toBe(false);
    expect(object.name).toBe("laserShots");
  });

  it("is an additive, untextured ShaderMaterial with no tone mapping or fog", () => {
    const material = createLaserShotLayer().root.material;
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.toneMapped).toBe(false);
    expect(material.fog).toBe(false);
  });

  it("writes display values and keeps the logarithmic depth chunks", () => {
    const material = createLaserShotLayer().root.material;
    expect(material.fragmentShader).toContain("logdepthbuf_fragment");
    expect(material.fragmentShader).not.toContain("colorspace_fragment");
    expect(material.fragmentShader).not.toContain("tonemapping_fragment");
    expect(material.vertexShader).toContain("logdepthbuf_vertex");
  });

  it("declares the attributes the geometry carries", () => {
    const layer = createLaserShotLayer();
    const shader = layer.root.material.vertexShader;
    expect(shader).toContain("attribute vec3 aSide");
    expect(shader).toContain("attribute vec3 aColor");
    expect(shader).toContain("attribute vec4 aShape");
    const geometry = layer.root.geometry;
    expect(geometry.getAttribute("aSide").itemSize).toBe(3);
    expect(geometry.getAttribute("aColor").itemSize).toBe(3);
    expect(geometry.getAttribute("aShape").itemSize).toBe(4);
  });
});

describe("createLaserShotLayer: time and viewport uniforms (OD-7, OD-11)", () => {
  it("sets the shimmer time to the flight time modulo the wrap", () => {
    expect(LASER_TIME_WRAP).toBe(100);
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -100), "pulse", 123.25);
    layer.update(ORIGIN, 123.25);
    expect(uniform(layer, "uTime")).toBeCloseTo(23.25, 9);
  });

  it("reads the viewport height before each render, ignoring a zero height", () => {
    const layer = createLaserShotLayer();
    callBeforeRender(layer, stubRenderer(1920, 1080));
    expect(uniform(layer, "uViewportHeight")).toBe(1080);
    callBeforeRender(layer, stubRenderer(1920, 0));
    expect(uniform(layer, "uViewportHeight")).toBe(1080);
  });
});

describe("createLaserShotLayer: anchoring (WR side-mount fan-out)", () => {
  it("keeps an anchored shot on the ship while the ship flies on", () => {
    const layer = createLaserShotLayer();
    const identity = { w: 1, x: 0, y: 0, z: 0 };
    // Fired from a side mount 47 m to the right of a ship at the origin.
    layer.add(vec(47, 0, 0), vec(547, 0, 0), "military", 1, {
      position: vec(0, 0, 0),
      orientation: identity,
    });
    // 0.05 s later the ship is 200 m further on; the camera is on the ship.
    const ship = { position: vec(0, 0, -200), orientation: identity };
    layer.update(ship.position, 1.05, ship);
    const out = positions(layer);
    expect(out[0]).toBeCloseTo(47, 5);
    expect(out[2]).toBeCloseTo(0, 5);
    expect(out[3]).toBeCloseTo(47, 5);
    expect(out[6]).toBeCloseTo(547, 5);
    expect(out[9]).toBeCloseTo(547, 5);
  });

  it("turns an anchored shot with the ship", () => {
    const layer = createLaserShotLayer();
    const identity = { w: 1, x: 0, y: 0, z: 0 };
    layer.add(vec(0, 0, -10), vec(0, 0, -110), "pulse", 1, {
      position: vec(0, 0, 0),
      orientation: identity,
    });
    const half = Math.SQRT1_2;
    // A quarter turn about the vertical axis.
    const turned = {
      position: vec(0, 0, 0),
      orientation: { w: half, x: 0, y: half, z: 0 },
    };
    layer.update(ORIGIN, 1.01, turned);
    const out = positions(layer);
    expect(Math.abs(out[0] ?? 1)).toBeCloseTo(10, 5);
    expect(out[2]).toBeCloseTo(0, 5);
    expect(Math.abs(out[6] ?? 1)).toBeCloseTo(110, 4);
  });

  it("does not draw an anchored shot when no player pose is known", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(1, 0, 0), vec(2, 0, 0), "beam", 1, {
      position: vec(0, 0, 0),
      orientation: { w: 1, x: 0, y: 0, z: 0 },
    });
    layer.update(ORIGIN, 1.01);
    expect(layer.root.visible).toBe(false);
  });
});

describe("createLaserShotLayer: robustness (T-13-26, T-han-02)", () => {
  it("skips a non-finite segment", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(Number.NaN, 0, 0), vec(0, 0, -1), "pulse", 1);
    layer.add(vec(0, 0, 0), vec(0, Number.POSITIVE_INFINITY, -1), "pulse", 1);
    layer.update(ORIGIN, 1);
    expect(layer.root.visible).toBe(false);
    expect(drawn(layer)).toBe(0);
    expectAllFinite(layer);
  });

  it("skips a shot at a non-finite time and tolerates a non-finite clock", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -1), "pulse", Number.NaN);
    layer.update(ORIGIN, 1);
    expect(drawn(layer)).toBe(0);
    layer.add(vec(0, 0, 0), vec(0, 0, -1), "pulse", 1);
    layer.update(ORIGIN, Number.NaN);
    expect(layer.root.visible).toBe(false);
    expect(Number.isFinite(uniform(layer, "uTime"))).toBe(true);
    expectAllFinite(layer);
  });

  it("skips a non-finite camera frame without writing NaN", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -1), "pulse", 1);
    layer.update(vec(Number.NaN, 0, 0), 1);
    expect(layer.root.visible).toBe(false);
    expectAllFinite(layer);
  });
});

describe("createLaserShotLayer: dispose", () => {
  it("frees its own geometry and material exactly once", () => {
    const layer = createLaserShotLayer();
    let geometryDisposed = 0;
    let materialDisposed = 0;
    layer.root.geometry.addEventListener("dispose", () => {
      geometryDisposed += 1;
    });
    layer.root.material.addEventListener("dispose", () => {
      materialDisposed += 1;
    });
    layer.dispose();
    layer.dispose();
    expect(geometryDisposed).toBe(1);
    expect(materialDisposed).toBe(1);
  });

  it("ignores add and update after dispose", () => {
    const layer = createLaserShotLayer();
    layer.dispose();
    layer.add(vec(0, 0, 0), vec(0, 0, -1), "pulse", 1);
    layer.update(ORIGIN, 1);
    expect(layer.root.visible).toBe(false);
    expect(drawn(layer)).toBe(0);
  });
});
