// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The two-stage laser hit rule (CBT-07, D-01, D-02, ROADMAP criterion 3).
 *
 * Expected values are derived by hand from `Universe.m:5549-5640` and
 * `Octree.m:336-471`, never from running the code under test. Every hull is a
 * synthetic tree built here, in Oolite model coordinates (x right, y up, z
 * toward the nose). Child index is `x * 4 + y * 2 + z` with the plus side of an
 * axis being 1, so a root of half-width 8 has its +x+y+z child (index 7)
 * centred on (4, 4, 4) and covering [0, 8] on each axis.
 *
 * Oolite's descent never tests the line against a solid leaf (`Octree.m:361`
 * returns as soon as the leaf is reached); it tests it only against the cube of
 * the array node that holds the leaf. A solid leaf counts as hit whenever the
 * line touches its parent cell. The synthetic hulls are therefore two levels
 * deep: the parent cell is the region a shot must touch, and the solid leaf
 * inside it is what the returned distance points at.
 */

import { describe, expect, it } from "vitest";

import { firstShipHit } from "../../../src/sim/combat/hit.js";
import type {
  HitTarget,
  HullData,
  HullTable,
  LaserRay,
} from "../../../src/sim/combat/hit.js";
import type { OctreeNode } from "../../../src/sim/combat/octree.js";
import { identity, quat, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";

/** A node of eight children whose only solid child is index `solid`. */
function oneSolidChild(solid: number): OctreeNode {
  const children: OctreeNode[] = [0, 0, 0, 0, 0, 0, 0, 0];
  children[solid] = -1;
  return children;
}

/**
 * Radius 8, depth 2: the only non-empty child is index 7, the cell [0, 8]^3
 * (centre (4, 4, 4), half-width 4), and its only solid leaf is its own index 7,
 * centred (6, 6, 6).
 */
const CORNER_HULL: HullData = {
  collisionRadius: 10,
  octree: {
    radius: 8,
    depth: 2,
    root: [0, 0, 0, 0, 0, 0, 0, oneSolidChild(7)],
  },
};

/**
 * Radius 8, depth 2: the four children with the z bit set (indices 1, 3, 5, 7)
 * each hold one solid leaf, so the shape lives in Oolite model z in [0, 8], the
 * nose half. Children with the z bit clear are empty.
 */
const NOSE_CHILD = oneSolidChild(7);
const NOSE_HULL: HullData = {
  collisionRadius: 10,
  octree: {
    radius: 8,
    depth: 2,
    root: [0, NOSE_CHILD, 0, NOSE_CHILD, 0, NOSE_CHILD, 0, NOSE_CHILD],
  },
};

/** A fully solid cube of half-width 2 (a solid root is hit unconditionally). */
const SOLID_HULL: HullData = {
  collisionRadius: 3,
  octree: { radius: 2, depth: 0, root: -1 },
};

const HULLS: HullTable = new Map<string, HullData>([
  ["corner", CORNER_HULL],
  ["nose", NOSE_HULL],
  ["solid", SOLID_HULL],
]);

/** A forward laser along world -Z from `origin`. */
function foreRay(origin: Vec3, range = 100): LaserRay {
  return {
    origin,
    forward: vec(0, 0, -1),
    right: vec(1, 0, 0),
    up: vec(0, 1, 0),
    range,
  };
}

function target(
  id: number,
  specKey: string,
  position: Vec3,
  orientation: Quat = identity(),
): HitTarget {
  return { id, specKey, position, orientation };
}

describe("firstShipHit: stage A then stage B (D-02, criterion 3)", () => {
  // Target at (0, 0, -50), identity, so Oolite model z = -(world z + 50) and a
  // ray along world -Z from (a, b, 0) with range 100 is the model line
  // (a, b, -50) to (a, b, +50).
  const corner = target(7, "corner", vec(0, 0, -50));

  it("passes through the bounding sphere beside the hull and misses", () => {
    // Origin (-1, -1, 0): v_off = (1, 1, 50) and 1 + 1 < 10^2, so stage A
    // passes. The root cube [-8, 8]^3 is touched but only child 7 is non-empty
    // and the line x = y = -1 is outside its cell [0, 8]^3 (x = -1 is past the
    // face x = 0 for both endpoints), so no leaf is reached.
    expect(firstShipHit(foreRay(vec(-1, -1, 0)), [corner], HULLS)).toBeNull();
  });

  it("aimed at the solid leaf hits, at the leaf-centre distance", () => {
    // Origin (6, 6, 0): model line x = y = 6, z from -50 to +50. Root: it
    // enters through the z = -8 face at (6, 6, -8), octant (x+, y+, z-) = 6,
    // empty; its z-neighbour 7 is the array cell [0, 8]^3. In that cell (line
    // shifted by (-4, -4, -4), half-width 4) the line enters at z = -4, octant
    // 6 is empty, octant 7 is the solid leaf centred (6, 6, 6). Distance from
    // the start (6, 6, -50) to that centre is exactly 56.
    const hit = firstShipHit(foreRay(vec(6, 6, 0)), [corner], HULLS);
    expect(hit).toEqual({ id: 7, distance: 56 });
  });

  it("counts a line through the parent cell away from the leaf (Octree.m:361)", () => {
    // Origin (1, 1, 0): the line x = y = 1 lies in the cell [0, 8]^3 but far
    // from the leaf [4, 8]^3. Oolite never tests a solid leaf against the
    // line, only its parent cell, so this is a hit. Inside the cell the entry
    // is octant 0 (empty); the visiting order reaches 7 last (0, 1, 2, 4, then
    // 6, 5, 3, then 7), which is the solid leaf centred (6, 6, 6). Distance
    // from the start (1, 1, -50): sqrt(5^2 + 5^2 + 56^2).
    const hit = firstShipHit(foreRay(vec(1, 1, 0)), [corner], HULLS);
    expect(hit?.id).toBe(7);
    expect(hit?.distance).toBeCloseTo(Math.sqrt(25 + 25 + 3136), 9);
  });

  it("does not reach stage B for a ray outside the bounding sphere", () => {
    // Origin (20, 0, 0): v_off.x = -20, outside cr = 10. A plain miss.
    expect(firstShipHit(foreRay(vec(20, 0, 0)), [corner], HULLS)).toBeNull();
  });

  it("returns the nearer of two targets on the line", () => {
    // Solid roots at z = -50 and z = -30: the distance is the start to the
    // leaf centre, 50 and 30. Both input orders give id 5. In the first order
    // the far target hits first and the near one then shrinks the beam; in the
    // second the far one is cut by stage A (v_off.z = 50 is not < 30 + 3).
    const far = target(4, "solid", vec(0, 0, -50));
    const near = target(5, "solid", vec(0, 0, -30));
    const ray = foreRay(vec(0, 0, 0));
    expect(firstShipHit(ray, [far, near], HULLS)).toEqual({
      id: 5,
      distance: 30,
    });
    expect(firstShipHit(ray, [near, far], HULLS)).toEqual({
      id: 5,
      distance: 30,
    });
  });

  it("misses a target behind the origin", () => {
    // World z = +40 is behind a ray along -Z: v_off.z = -40, not > 0.
    const behind = target(4, "solid", vec(0, 0, 40));
    expect(firstShipHit(foreRay(vec(0, 0, 0)), [behind], HULLS)).toBeNull();
  });

  it("misses a target beyond the weapon range", () => {
    // v_off.z = 150 is not < range + cr = 103.
    const beyond = target(4, "solid", vec(0, 0, -150));
    expect(firstShipHit(foreRay(vec(0, 0, 0)), [beyond], HULLS)).toBeNull();
  });

  it("does not count a hit that is not closer than the range", () => {
    // Solid root at z = -102: v_off.z = 102 < 103, so stage A passes, and the
    // solid root is reached, but its centre distance is 102, not < 100.
    const edge = target(4, "solid", vec(0, 0, -102));
    expect(firstShipHit(foreRay(vec(0, 0, 0)), [edge], HULLS)).toBeNull();
  });
});

describe("firstShipHit: hull data not loaded (D-01)", () => {
  const solid = target(4, "solid", vec(0, 0, -30));

  it("cannot hit when no hull table is supplied", () => {
    expect(firstShipHit(foreRay(vec(0, 0, 0)), [solid], undefined)).toBeNull();
  });

  it("cannot hit a target whose spec key has no hull entry", () => {
    const others: HullTable = new Map<string, HullData>([
      ["corner", CORNER_HULL],
    ]);
    expect(firstShipHit(foreRay(vec(0, 0, 0)), [solid], others)).toBeNull();
  });

  it("still hits a loaded target in the same call", () => {
    const unloaded = target(3, "viper", vec(0, 0, -20));
    const hit = firstShipHit(foreRay(vec(0, 0, 0)), [unloaded, solid], HULLS);
    expect(hit).toEqual({ id: 4, distance: 30 });
  });
});

describe("firstShipHit: model frame handedness", () => {
  // The nose hull lives in Oolite model z in [0, 8]. Wegolite's nose is local
  // -Z, so with an identity orientation the shape is world z in [-8, 0] (target
  // at the origin). A range of 97 from 100 m away ends 3 m short of the target
  // centre, so only the near half of the hull is on the segment: model z in
  // [3, 100] from the -Z side, model z in [-100, -3] from the +Z side.
  const nose = target(9, "nose", vec(0, 0, 0));

  function fromMinusZ(): LaserRay {
    return {
      origin: vec(0, 0, -100),
      forward: vec(0, 0, 1),
      right: vec(-1, 0, 0),
      up: vec(0, 1, 0),
      range: 97,
    };
  }

  it("hits a ray arriving from the target's local -Z (nose) side", () => {
    // Model line x = y = 0, z from 100 down to 3. The end point is inside the
    // root cube, so lineCubeIntersection returns -1 and the entry octant is 0
    // (empty); octant 1 (x-, y-, z+) is a nose cell. The line there is shifted
    // by (4, 4, -4); that cell's end point is inside too, so its octant 0 is
    // empty, 1, 2, 4, 6, 5, 3 are empty and octant 7 is the solid leaf, shift
    // (-2, -2, -2). Start to leaf centre: (2, 2, 94), the distance
    // sqrt(2^2 + 2^2 + 94^2) = 94.04, below the range 97.
    const hit = firstShipHit(fromMinusZ(), [nose], HULLS);
    expect(hit?.id).toBe(9);
    expect(hit?.distance).toBeCloseTo(Math.sqrt(4 + 4 + 8836), 9);
  });

  it("misses a ray arriving from the target's local +Z (tail) side", () => {
    // Model line from z = -100 to -3: the root cube is touched but every nose
    // cell is z in [0, 8], so no non-empty cell is reached.
    expect(firstShipHit(foreRay(vec(0, 0, 100), 97), [nose], HULLS)).toBeNull();
  });

  it("swaps with a half turn about Y", () => {
    // quat(0, 0, 1, 0) turns the ship round: its nose now points to world +Z.
    const turned = target(9, "nose", vec(0, 0, 0), quat(0, 0, 1, 0));
    expect(firstShipHit(foreRay(vec(0, 0, 100), 97), [turned], HULLS)?.id).toBe(
      9,
    );
    expect(firstShipHit(fromMinusZ(), [turned], HULLS)).toBeNull();
  });
});

describe("firstShipHit: non-finite input never throws (T-13-04)", () => {
  const solid = target(4, "solid", vec(0, 0, -30));

  it("returns null for a NaN origin", () => {
    expect(firstShipHit(foreRay(vec(NaN, 0, 0)), [solid], HULLS)).toBeNull();
  });

  it("returns null for an infinite range or a non-positive range", () => {
    expect(
      firstShipHit(foreRay(vec(0, 0, 0), Infinity), [solid], HULLS),
    ).toBeNull();
    expect(firstShipHit(foreRay(vec(0, 0, 0), 0), [solid], HULLS)).toBeNull();
  });

  it("skips a target with a NaN position and one with a NaN collision radius", () => {
    const bad = target(3, "solid", vec(0, NaN, -30));
    const table = new Map<string, HullData>([
      ["nanradius", { ...SOLID_HULL, collisionRadius: NaN }],
      ["solid", SOLID_HULL],
    ]);
    const nanRadius = target(2, "nanradius", vec(0, 0, -30));
    expect(
      firstShipHit(foreRay(vec(0, 0, 0)), [nanRadius, bad, solid], table),
    ).toEqual({ id: 4, distance: 30 });
  });

  it("returns null for an empty target list", () => {
    expect(firstShipHit(foreRay(vec(0, 0, 0)), [], HULLS)).toBeNull();
  });
});
