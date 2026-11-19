// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Octree-against-octree contact (CBT-18, D-01, PD-01): hand cases for
 * `isHitByOctree` (`Octree.m:473-595`) and `doOctreesCollide`
 * (`ShipEntity.m:1878-1942`).
 *
 * Child index is `x * 4 + y * 2 + z`, the plus side of an axis being 1
 * (`Octree.m:158-161`). Offsets and the octree frame are Oolite model axes
 * (x right, y up, z toward the nose); a Wegolite local point maps to them by
 * negating z. With identity orientations every crude prune is an exact cube
 * test, so contact is exactly "two solid leaf cubes overlap, faces included".
 *
 * The real-hull cases run on `fullHullTable()`: the player's Cobra
 * (`oolite_template_cobra3-player`) and the nav buoy (`buoy`, with its one
 * solid subentity at the hull origin).
 */

import { describe, expect, it } from "vitest";

import { doOctreesCollide } from "../../../src/sim/combat/collide.js";
import type { HullPose } from "../../../src/sim/combat/collide.js";
import type { HullData } from "../../../src/sim/combat/hit.js";
import { isHitByOctree } from "../../../src/sim/combat/octree.js";
import type { HullOctree, OctreeNode } from "../../../src/sim/combat/octree.js";
import { axisAngle, identity, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { fullHullTable } from "../../helpers/hull-table.js";

const IJK_IDENTITY: readonly [Vec3, Vec3, Vec3] = [
  vec(1, 0, 0),
  vec(0, 1, 0),
  vec(0, 0, 1),
];

function tree(radius: number, root: OctreeNode, depth = 1): HullOctree {
  return { radius, depth, root };
}

/** Eight children, all empty except those listed. */
function withSolid(...solid: readonly number[]): OctreeNode {
  const children: OctreeNode[] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const index of solid) children[index] = -1;
  return children;
}

function pose(position: Vec3, orientation: Quat = identity()): HullPose {
  return { position, orientation };
}

/** A solid cube of half-width 1 as a hull, with optional subentities. */
function cubeHull(subentityOffsets: readonly Vec3[] = []): HullData {
  return {
    collisionRadius: Math.sqrt(3),
    octree: tree(1, -1, 0),
    subentities: subentityOffsets.map((position, index) => ({
      key: `cube-sub-${index}`,
      position,
      mass: 1,
      octree: tree(1, -1, 0),
    })),
  };
}

/** The solid-leaf bounds of a tree in its own Oolite model axes. */
function solidBounds(octree: HullOctree): {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly leaf: number;
} {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let leaf = Infinity;
  const walk = (node: OctreeNode, centre: readonly number[], r: number) => {
    if (node === 0) return;
    if (node === -1) {
      leaf = Math.min(leaf, r);
      for (let a = 0; a < 3; a += 1) {
        min[a] = Math.min(min[a] ?? Infinity, (centre[a] ?? 0) - r);
        max[a] = Math.max(max[a] ?? -Infinity, (centre[a] ?? 0) + r);
      }
      return;
    }
    for (let oct = 0; oct < 8; oct += 1) {
      const bits = [(oct >> 2) & 1, (oct >> 1) & 1, oct & 1];
      const child = node[oct];
      if (child === undefined) continue;
      walk(
        child,
        centre.map((c, a) => c + ((bits[a] ?? 0) - 0.5) * r),
        r / 2,
      );
    }
  };
  walk(octree.root, [0, 0, 0], octree.radius);
  return {
    min: vec(min[0] ?? 0, min[1] ?? 0, min[2] ?? 0),
    max: vec(max[0] ?? 0, max[1] ?? 0, max[2] ?? 0),
    leaf,
  };
}

describe("isHitByOctree: hand cases", () => {
  it("two solid roots touching on a face hit; 0.01 apart they miss", () => {
    const a = tree(1, -1, 0);
    const b = tree(1, -1, 0);
    // The other's centre at x = 2: the cubes share the x = 1 face (strict
    // compares at Octree.m:497-512 keep a touch a hit).
    expect(isHitByOctree(a, b, vec(2, 0, 0), IJK_IDENTITY)).toBe(true);
    expect(isHitByOctree(a, b, vec(2.01, 0, 0), IJK_IDENTITY)).toBe(false);
  });

  it("an empty root on either side is no hit (Octree.m:479-491)", () => {
    const solid = tree(1, -1, 0);
    const empty = tree(1, 0, 0);
    expect(isHitByOctree(empty, solid, vec(0, 0, 0), IJK_IDENTITY)).toBe(false);
    expect(isHitByOctree(solid, empty, vec(0, 0, 0), IJK_IDENTITY)).toBe(false);
  });

  it("descends to the solid children: a corner cell decides", () => {
    // Prime half-width 8 with only child 7 solid: the cell [0, 8]^3. A unit
    // cube centred at (-2, -2, -2) sits inside the prime's root cube but
    // clear of that cell; at (1, 1, 1) it overlaps it.
    const prime = tree(8, withSolid(7));
    const unit = tree(1, -1, 0);
    expect(isHitByOctree(prime, unit, vec(-2, -2, -2), IJK_IDENTITY)).toBe(
      false,
    );
    expect(isHitByOctree(prime, unit, vec(1, 1, 1), IJK_IDENTITY)).toBe(true);
    // The other decomposed against a solid prime (Octree.m:526-560): a solid
    // unit prime against the half-width-8 tree placed so that only its empty
    // child 0 covers the prime.
    expect(isHitByOctree(unit, prime, vec(6, 6, 6), IJK_IDENTITY)).toBe(false);
    expect(isHitByOctree(unit, prime, vec(-1, -1, -1), IJK_IDENTITY)).toBe(
      true,
    );
  });

  it("a non-finite origin or basis is no hit, never a throw", () => {
    const a = tree(1, -1, 0);
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(isHitByOctree(a, a, vec(bad, 0, 0), IJK_IDENTITY)).toBe(false);
      expect(
        isHitByOctree(a, a, vec(0, 0, 0), [
          vec(bad, 0, 0),
          vec(0, 1, 0),
          vec(0, 0, 1),
        ]),
      ).toBe(false);
    }
  });
});

describe("doOctreesCollide: the player's Cobra against the nav buoy", () => {
  const table = fullHullTable();
  const player = table.get("oolite_template_cobra3-player");
  const buoy = table.get("buoy");
  if (player === undefined || buoy === undefined) {
    throw new Error("the full hull table lacks the player or the buoy");
  }
  const buoyPose = pose(vec(0, 0, 0));
  const buoySub = buoy.subentities?.[0];
  if (buoySub === undefined) throw new Error("the buoy has no subentity");

  const playerBounds = solidBounds(player.octree);
  const buoyBounds = solidBounds(buoy.octree);
  const subBounds = solidBounds(buoySub.octree);
  // The buoy's solid reach on +X (hull or subentity, the subentity sits at
  // the hull origin).
  const buoyReach = Math.max(
    buoyBounds.max.x,
    buoySub.position.x + subBounds.max.x,
  );

  const STEP = 0.25;

  function contactAt(x: number, orientation: Quat) {
    return doOctreesCollide(
      player!,
      pose(vec(x, 0, 0), orientation),
      buoy!,
      buoyPose,
    );
  }

  /** Moving inward from 200 m: the first distance that reports a contact. */
  function firstInward(orientation: Quat): number {
    for (let x = 200; x > 0; x -= STEP) {
      if (contactAt(x, orientation) !== null) return x;
    }
    return 0;
  }

  /** Moving outward from 0 m: the last distance before contact ends. */
  function lastOutward(orientation: Quat): number {
    let last = 0;
    for (let x = 0; x <= 200; x += STEP) {
      if (contactAt(x, orientation) === null) return last;
      last = x;
    }
    return last;
  }

  it("spheres apart at 200 m: no contact", () => {
    expect(contactAt(200, identity())).toBeNull();
  });

  it("finds the contact inward and outward, within the solid cells' reach", () => {
    // Identity poses: a player cell at local x reaches world x + local x, so
    // no solid pair overlaps beyond buoyReach - playerMinX.
    const bound = buoyReach - playerBounds.min.x;
    const inward = firstInward(identity());
    const outward = lastOutward(identity());
    expect(inward).toBeGreaterThan(0);
    expect(inward).toBeLessThanOrEqual(bound);
    expect(outward).toBeGreaterThan(0);
    expect(outward).toBeLessThanOrEqual(inward);
    // The hull is reached at the hull (the buoy's own octree overlaps first).
    expect(contactAt(inward, identity())).toEqual({ kind: "hull" });
  });

  it("1 m clear of every solid cell reports none, although the spheres overlap", () => {
    const clear = buoyReach - playerBounds.min.x + 1;
    // The bounding spheres still overlap (research Pitfall 3): no sphere-only
    // contact.
    expect(clear).toBeLessThan(player.collisionRadius + buoy.collisionRadius);
    expect(contactAt(clear, identity())).toBeNull();
  });

  it("a player turned 90 degrees about Y meets the buoy at its nose's reach", () => {
    // Turned +90 degrees about Y, local -Z (Oolite +z, the nose) points to
    // world -X, toward the buoy: the reach is the nose extent, not the wing.
    const turned = axisAngle(0, 1, 0, Math.PI / 2);
    const bound = buoyReach + playerBounds.max.z;
    const inward = firstInward(turned);
    expect(inward).toBeGreaterThan(0);
    expect(inward).toBeLessThanOrEqual(bound);
    expect(contactAt(bound + 1, turned)).toBeNull();
    // The Cobra is wider than it is long forward of its origin (65.5 m wing
    // reach against 45.0 m nose reach), so turning it brings the contact in.
    const sideOn = firstInward(identity());
    expect(inward).toBeLessThan(sideOn);
  });
});

describe("doOctreesCollide: the composition over subentities (ShipEntity.m:1878-1942)", () => {
  it("an other with an empty hull and one touching subentity returns that subentity", () => {
    const prime = cubeHull();
    // The other's hull octree is empty; its one subentity sits at Oolite
    // offset (-10, 0, 0), so with the other at world x = 12 the subentity is
    // centred at x = 2: face contact with the prime's unit cube.
    const other: HullData = {
      collisionRadius: 12,
      octree: tree(1, 0, 0),
      subentities: [
        {
          key: "s0",
          position: vec(-10, 0, 0),
          mass: 1,
          octree: tree(1, -1, 0),
        },
      ],
    };
    const primePose = pose(vec(0, 0, 0));
    const otherPose = pose(vec(12, 0, 0));
    expect(doOctreesCollide(prime, primePose, other, otherPose)).toEqual({
      kind: "subentity",
      index: 0,
    });
    // PD-01: a detached subentity takes no part.
    expect(
      doOctreesCollide(prime, primePose, other, otherPose, new Set([0])),
    ).toBeNull();
  });

  it("a prime subentity touching only the other's subentity returns the other's hull", () => {
    // Prime hull at x = 0, its subentity at Oolite offset (10, 0, 0). Other
    // hull at x = 20, its subentity at offset (-8, 0, 0), centred at x = 12:
    // only the two subentities (x = 10 and x = 12) touch. Stage 2
    // (ShipEntity.m:1899-1906) recurses with the prime's subentity and the
    // whole other, whose own stage 3 finds the other's subentity, so the
    // outer call returns the other (18-02 octree-sub-sub-returns-other).
    const prime = cubeHull([vec(10, 0, 0)]);
    const other = cubeHull([vec(-8, 0, 0)]);
    const primePose = pose(vec(0, 0, 0));
    const otherPose = pose(vec(20, 0, 0));
    expect(doOctreesCollide(prime, primePose, other, otherPose)).toEqual({
      kind: "hull",
    });
    // The prime's subentity detached: nothing else touches.
    expect(
      doOctreesCollide(
        prime,
        primePose,
        other,
        otherPose,
        undefined,
        new Set([0]),
      ),
    ).toBeNull();
    // The other's subentity detached: the recursion skips it too.
    expect(
      doOctreesCollide(prime, primePose, other, otherPose, new Set([0])),
    ).toBeNull();
  });

  it("places a subentity by its parent's rotation, the offset taken from Oolite axes", () => {
    // The prime's subentity at Oolite offset (0, 0, 10): the nose side,
    // Wegolite local -Z. With the prime at the origin and identity, the
    // subentity is centred at world z = -10; an other unit cube at z = -12
    // touches it, one at z = +12 does not.
    const prime = cubeHull([vec(0, 0, 10)]);
    const other = cubeHull();
    expect(
      doOctreesCollide(prime, pose(vec(0, 0, 0)), other, pose(vec(0, 0, -12))),
    ).toEqual({ kind: "hull" });
    expect(
      doOctreesCollide(prime, pose(vec(0, 0, 0)), other, pose(vec(0, 0, 12))),
    ).toBeNull();
    // Turned 90 degrees about Y, the nose (local -Z) points to world -X: the
    // subentity is centred at world x = -10. The other overlaps it by half a
    // metre, so the rounding of the turned basis cannot decide the case.
    const turned = axisAngle(0, 1, 0, Math.PI / 2);
    expect(
      doOctreesCollide(
        prime,
        pose(vec(0, 0, 0), turned),
        other,
        pose(vec(-11.5, 0, 0)),
      ),
    ).toEqual({ kind: "hull" });
    expect(
      doOctreesCollide(
        prime,
        pose(vec(0, 0, 0), turned),
        other,
        pose(vec(0, 0, -12)),
      ),
    ).toBeNull();
  });

  it("hull against hull wins before any subentity is tried", () => {
    const prime = cubeHull([vec(3, 0, 0)]);
    const other = cubeHull([vec(-3, 0, 0)]);
    expect(
      doOctreesCollide(prime, pose(vec(0, 0, 0)), other, pose(vec(1, 0, 0))),
    ).toEqual({ kind: "hull" });
  });

  it("a non-finite or non-unit pose is no contact, never a throw", () => {
    const hull = cubeHull();
    const at = pose(vec(0, 0, 0));
    for (const bad of [Number.NaN, Infinity, -Infinity, 1e308]) {
      expect(doOctreesCollide(hull, pose(vec(bad, 0, 0)), hull, at)).toBeNull();
      expect(
        doOctreesCollide(
          hull,
          at,
          hull,
          pose(vec(0, 0, 0), { w: bad, x: 0, y: 0, z: 0 }),
        ),
      ).toBeNull();
    }
  });
});
