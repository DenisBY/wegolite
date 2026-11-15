// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drawn laser shots (CBT-05, criterion 3, A4), decided in Node against the
 * layer's buffers and visibility: no WebGL context is needed to build a
 * `LineSegments`, so lifetime, colour, the fixed pool and the camera-relative
 * write are all numeric assertions.
 */

import { describe, expect, it } from "vitest";
import type * as THREE from "three";

import {
  LASER_SHOT_COLORS,
  LASER_SHOT_POOL,
  createLaserShotLayer,
} from "../../src/render/bodies/laser-shots.js";
import {
  LASER_SHOT_DURATION,
  LASER_STATS,
} from "../../src/sim/combat/constants.js";
import type { LaserKind } from "../../src/sim/events.js";
import { vec } from "../../src/sim/math.js";

const ORIGIN = vec(0, 0, 0);

function positions(
  layer: ReturnType<typeof createLaserShotLayer>,
): Float32Array {
  const attribute = layer.root.geometry.getAttribute("position");
  return attribute.array as Float32Array;
}

function colours(layer: ReturnType<typeof createLaserShotLayer>): Float32Array {
  const attribute = layer.root.geometry.getAttribute("color");
  return attribute.array as Float32Array;
}

function drawn(layer: ReturnType<typeof createLaserShotLayer>): number {
  return layer.root.geometry.drawRange.count;
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
    expect(drawn(layer)).toBe(2);
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

  it("keeps two shots with different ages independent", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -10), "pulse", 1);
    layer.add(vec(0, 0, 0), vec(0, 0, -20), "beam", 1.05);
    layer.update(ORIGIN, 1.07);
    expect(drawn(layer)).toBe(4);
    layer.update(ORIGIN, 1.1);
    expect(drawn(layer)).toBe(2);
    // The survivor is the second (beam) shot: its far end is at z = -20.
    expect(positions(layer)[5]).toBeCloseTo(-20, 5);
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
    it(`writes the ${kind} colour to both ends of the segment`, () => {
      const layer = createLaserShotLayer();
      layer.add(vec(0, 0, 0), vec(0, 0, -50), kind, 1);
      layer.update(ORIGIN, 1);
      const [r, g, b] = expected[kind];
      expect([...colours(layer).slice(0, 6)]).toEqual([r, g, b, r, g, b]);
    });
  }
});

describe("createLaserShotLayer: the fixed pool", () => {
  it("has 32 slots", () => {
    expect(LASER_SHOT_POOL).toBe(32);
    const layer = createLaserShotLayer();
    expect(positions(layer)).toHaveLength(32 * 2 * 3);
    expect(colours(layer)).toHaveLength(32 * 2 * 3);
  });

  it("draws 32 simultaneous shots and overwrites the oldest beyond that", () => {
    const layer = createLaserShotLayer();
    const geometry = layer.root.geometry;
    const positionBuffer = geometry.getAttribute("position");
    const colourBuffer = geometry.getAttribute("color");
    // 33 shots in one instant: the first (z = -1) is the one overwritten.
    for (let i = 1; i <= 33; i += 1) {
      layer.add(vec(0, 0, 0), vec(0, 0, -i), "pulse", 1);
    }
    layer.update(ORIGIN, 1);
    expect(drawn(layer)).toBe(64);
    const farEnds = new Set<number>();
    const buffer = positions(layer);
    for (let slot = 0; slot < 32; slot += 1)
      farEnds.add(buffer[slot * 6 + 5] ?? 0);
    expect(farEnds.has(-1)).toBe(false);
    for (let i = 2; i <= 33; i += 1) expect(farEnds.has(-i)).toBe(true);
    // Nothing was reallocated: the same buffers, the same geometry.
    expect(geometry.getAttribute("position")).toBe(positionBuffer);
    expect(geometry.getAttribute("color")).toBe(colourBuffer);
  });

  it("never reallocates its buffers while shots come and go", () => {
    const layer = createLaserShotLayer();
    const before = positions(layer);
    for (let i = 0; i < 200; i += 1) {
      layer.add(vec(0, 0, 0), vec(0, 0, -i), "beam", i * 0.01);
      layer.update(ORIGIN, i * 0.01);
    }
    expect(positions(layer)).toBe(before);
  });
});

describe("createLaserShotLayer: camera-relative segments", () => {
  it("writes both endpoints minus the camera, subtracted in float64", () => {
    const layer = createLaserShotLayer();
    const camera = vec(1e9, -2e9, 3e9);
    layer.add(
      vec(1e9 + 1, -2e9 + 2, 3e9 + 3),
      vec(1e9 + 4, -2e9 + 5, 3e9 + 6),
      "pulse",
      1,
    );
    layer.update(camera, 1);
    expect([...positions(layer).slice(0, 6)]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("follows the camera between frames without re-adding the shot", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(10, 0, 0), vec(10, 0, -5), "pulse", 1);
    layer.update(vec(0, 0, 0), 1.01);
    expect(positions(layer)[0]).toBe(10);
    layer.update(vec(4, 0, 0), 1.02);
    expect(positions(layer)[0]).toBe(6);
  });
});

describe("createLaserShotLayer: robustness (T-13-26)", () => {
  it("skips a non-finite segment", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(Number.NaN, 0, 0), vec(0, 0, -1), "pulse", 1);
    layer.add(vec(0, 0, 0), vec(0, Number.POSITIVE_INFINITY, -1), "pulse", 1);
    layer.update(ORIGIN, 1);
    expect(layer.root.visible).toBe(false);
    expect(drawn(layer)).toBe(0);
  });

  it("skips a shot at a non-finite time and tolerates a non-finite clock", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -1), "pulse", Number.NaN);
    layer.update(ORIGIN, 1);
    expect(drawn(layer)).toBe(0);
    layer.add(vec(0, 0, 0), vec(0, 0, -1), "pulse", 1);
    layer.update(ORIGIN, Number.NaN);
    expect(layer.root.visible).toBe(false);
  });

  it("skips a non-finite camera frame without writing NaN", () => {
    const layer = createLaserShotLayer();
    layer.add(vec(0, 0, 0), vec(0, 0, -1), "pulse", 1);
    layer.update(vec(Number.NaN, 0, 0), 1);
    expect(layer.root.visible).toBe(false);
    for (const value of positions(layer))
      expect(Number.isFinite(value)).toBe(true);
  });

  it("ignores add and update after dispose", () => {
    const layer = createLaserShotLayer();
    layer.dispose();
    layer.dispose();
    layer.add(vec(0, 0, 0), vec(0, 0, -1), "pulse", 1);
    layer.update(ORIGIN, 1);
    expect(layer.root.visible).toBe(false);
  });
});

describe("createLaserShotLayer: one draw call, none when idle", () => {
  it("is a single LineSegments object that culling cannot hide", () => {
    const layer = createLaserShotLayer();
    const object: THREE.LineSegments = layer.root;
    expect(object.type).toBe("LineSegments");
    expect(object.frustumCulled).toBe(false);
  });

  it("frees only its own geometry and material on dispose", () => {
    const layer = createLaserShotLayer();
    let geometryDisposed = 0;
    let materialDisposed = 0;
    layer.root.geometry.addEventListener("dispose", () => {
      geometryDisposed += 1;
    });
    const material = layer.root.material as THREE.Material;
    material.addEventListener("dispose", () => {
      materialDisposed += 1;
    });
    layer.dispose();
    expect(geometryDisposed).toBe(1);
    expect(materialDisposed).toBe(1);
  });

  it("keeps an anchored shot on the ship while the ship flies on (WR side-mount fan-out)", () => {
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
    expect(out[3]).toBeCloseTo(547, 5);
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
