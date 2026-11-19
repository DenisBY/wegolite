// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Octree-against-octree contact: agreement with the independent
 * transliteration and totality (CBT-18, D-01, T-18-20).
 *
 * Agreement: on random trees of depth up to 2, random radii, origins and
 * rotations, `isHitByOctree` returns exactly what the 18-02 oracle's
 * `isHitByOctreeReference` returns for the same inputs. The composition
 * agrees with `doOctreesCollideReference` on random hulls with subentities
 * under the symmetric poses (identity and the three half turns, whose
 * quaternions rotate without rounding, so both sides see the same numbers).
 * The comparison lives here, outside the oracle tree, which imports no
 * Wegolite code.
 *
 * Totality: NaN, the infinities and +/-1e308 in any origin, basis, position
 * or quaternion component, a node array of length 7 and a tree nested deeper
 * than `MAX_OCTREE_DEPTH` never throw and are no hit (`false`, `null`).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { doOctreesCollide } from "../../../src/sim/combat/collide.js";
import type {
  ContactHull,
  ContactPart,
  HullPose,
} from "../../../src/sim/combat/collide.js";
import {
  MAX_OCTREE_DEPTH,
  isHitByOctree,
} from "../../../src/sim/combat/octree.js";
import type { HullOctree, OctreeNode } from "../../../src/sim/combat/octree.js";
import { normalize, quat, rotate, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import {
  doOctreesCollideReference,
  isHitByOctreeReference,
} from "../../oracles/combat/geometry/octree-collide.js";
import type {
  CollideResult,
  HullPose as ReferenceHull,
  Ijk,
  OctNode,
} from "../../oracles/combat/geometry/octree-collide.js";

type Triple = [number, number, number];

const leaf = fc.constantFrom<OctreeNode>(0, -1);
const level1 = fc.array(leaf, { minLength: 8, maxLength: 8 });
const level2 = fc.array(
  fc.oneof({ arbitrary: leaf, weight: 2 }, { arbitrary: level1, weight: 3 }),
  { minLength: 8, maxLength: 8 },
);
/** A depth-2 root with mostly empty cells, so a small prime often misses. */
const sparseLeaf = fc.oneof(
  { arbitrary: fc.constant<OctreeNode>(0), weight: 3 },
  { arbitrary: fc.constant<OctreeNode>(-1), weight: 1 },
);
const sparseLevel2 = fc.array(
  fc.oneof(
    { arbitrary: sparseLeaf, weight: 1 },
    {
      arbitrary: fc.array(sparseLeaf, { minLength: 8, maxLength: 8 }),
      weight: 3,
    },
  ),
  { minLength: 8, maxLength: 8 },
);
/** A root of depth 0, 1 or 2. */
const anyRoot: fc.Arbitrary<OctreeNode> = fc.oneof(
  { arbitrary: leaf, weight: 1 },
  { arbitrary: level1, weight: 2 },
  { arbitrary: level2, weight: 4 },
);

const radius = fc.double({ min: 0.5, max: 8, noNaN: true });
const coordinate = fc.double({ min: -14, max: 14, noNaN: true });

/**
 * A value spread evenly over `[min, max]` (micro steps). `fc.double` draws
 * evenly over the double representations, so most of its draws in a range
 * around 0 are tiny, and its bias adds 0 and the bounds: rotations would then
 * be mostly identity and half turns, where the transposed placement of
 * `Octree.m:552` equals the geometric one and a port that "corrects" it
 * would pass unseen.
 */
function even(min: number, max: number): fc.Arbitrary<number> {
  return fc
    .noBias(fc.integer({ min: 0, max: 1_000_000 }))
    .map((step) => min + ((max - min) * step) / 1_000_000);
}

const spread = even(-10, 10);

/** A unit quaternion from four even components (the zero vector falls back). */
const anyRotation: fc.Arbitrary<Quat> = fc
  .tuple(even(-1, 1), even(-1, 1), even(-1, 1), even(-1, 1))
  .map(([w, x, y, z]) =>
    w * w + x * x + y * y + z * z < 1e-6
      ? quat(1, 0, 0, 0)
      : normalize(quat(w, x, y, z)),
  );

/** Identity and the half turns about x, y and z: exact rotations. */
const symmetricRotation = fc.constantFrom(
  quat(1, 0, 0, 0),
  quat(0, 1, 0, 0),
  quat(0, 0, 1, 0),
  quat(0, 0, 0, 1),
);

const badValue = fc.constantFrom(
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  1e308,
  -1e308,
);

function tree(r: number, root: OctreeNode): HullOctree {
  return { radius: r, depth: 2, root };
}

function triple(v: Vec3): Triple {
  return [v.x, v.y, v.z];
}

/** The rotation's columns, the other's axes in the prime's frame. */
function ijkOf(q: Quat): readonly [Vec3, Vec3, Vec3] {
  return [
    rotate(q, vec(1, 0, 0)),
    rotate(q, vec(0, 1, 0)),
    rotate(q, vec(0, 0, 1)),
  ];
}

function referenceIjk(ijk: readonly [Vec3, Vec3, Vec3]): Ijk {
  return [triple(ijk[0]), triple(ijk[1]), triple(ijk[2])];
}

/** The port's node type and the oracle's are the same shape. */
function asReferenceNode(node: OctreeNode): OctNode {
  return node;
}

function partOf(result: CollideResult): ContactPart | null {
  if (result === "none") return null;
  if (result === "other") return { kind: "hull" };
  return { kind: "subentity", index: result.otherSubentity };
}

/** Oolite axes to Wegolite axes and back: `S = diag(1, 1, -1)`. */
function flipZ(v: Vec3): Vec3 {
  return vec(v.x, v.y, -v.z);
}

describe("isHitByOctree agrees with isHitByOctreeReference", () => {
  it("on 300 random depth-2 tree pairs, origins and rotations", () => {
    let hits = 0;
    let misses = 0;
    fc.assert(
      fc.property(
        radius,
        anyRoot,
        radius,
        anyRoot,
        fc.tuple(spread, spread, spread),
        anyRotation,
        (pr, proot, or, oroot, [x, y, z], q) => {
          const ijk = ijkOf(q);
          const origin = vec(x, y, z);
          const port = isHitByOctree(
            tree(pr, proot),
            tree(or, oroot),
            origin,
            ijk,
          );
          const reference = isHitByOctreeReference(
            { radius: pr, root: asReferenceNode(proot) },
            { radius: or, root: asReferenceNode(oroot) },
            [x, y, z],
            referenceIjk(ijk),
          );
          expect(port).toBe(reference);
          if (port) hits += 1;
          else misses += 1;
        },
      ),
      { numRuns: 300, seed: 1809 },
    );
    // Not vacuous: both answers occur often.
    expect(hits).toBeGreaterThanOrEqual(30);
    expect(misses).toBeGreaterThanOrEqual(30);
  });

  it("on 300 small solid primes inside a turned depth-2 other (the other decomposed)", () => {
    // Every case runs `Octree.m:526-560`, the decomposition of a rotated
    // other with the transposed basis of `:552`, so a port that "corrects"
    // the transpose disagrees here.
    let hits = 0;
    let misses = 0;
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 1.5, noNaN: true }),
        fc.double({ min: 6, max: 8, noNaN: true }),
        sparseLevel2,
        fc.tuple(even(-7, 7), even(-7, 7), even(-7, 7)),
        anyRotation,
        (pr, or, oroot, [x, y, z], q) => {
          const ijk = ijkOf(q);
          const port = isHitByOctree(
            tree(pr, -1),
            tree(or, oroot),
            vec(x, y, z),
            ijk,
          );
          const reference = isHitByOctreeReference(
            { radius: pr, root: -1 },
            { radius: or, root: asReferenceNode(oroot) },
            [x, y, z],
            referenceIjk(ijk),
          );
          expect(port).toBe(reference);
          if (port) hits += 1;
          else misses += 1;
        },
      ),
      { numRuns: 300, seed: 18095 },
    );
    expect(hits).toBeGreaterThanOrEqual(30);
    expect(misses).toBeGreaterThanOrEqual(30);
  });
});

describe("doOctreesCollide agrees with doOctreesCollideReference", () => {
  const subentity = fc.record({
    r: radius,
    root: anyRoot,
    offset: fc.tuple(coordinate, coordinate, coordinate),
  });
  const hull = fc.record({
    r: radius,
    root: anyRoot,
    subs: fc.array(subentity, { maxLength: 2 }),
  });
  type HullDraw = {
    readonly r: number;
    readonly root: OctreeNode;
    readonly subs: readonly {
      readonly r: number;
      readonly root: OctreeNode;
      readonly offset: Triple;
    }[];
  };

  function portHull(draw: HullDraw): ContactHull {
    return {
      octree: tree(draw.r, draw.root),
      subentities: draw.subs.map((sub, index) => ({
        key: `sub-${String(index)}`,
        position: vec(...sub.offset),
        mass: 1,
        octree: tree(sub.r, sub.root),
      })),
    };
  }

  /** The Oolite-world hull of the reference: `S position`, axes `S R S e_a`. */
  function referenceHull(draw: HullDraw, pose: HullPose): ReferenceHull {
    const q = pose.orientation;
    const axis = (e: Vec3): Triple => triple(flipZ(rotate(q, flipZ(e))));
    return {
      octree: { radius: draw.r, root: asReferenceNode(draw.root) },
      position: triple(flipZ(pose.position)),
      ijk: [axis(vec(1, 0, 0)), axis(vec(0, 1, 0)), axis(vec(0, 0, 1))],
      subentities: draw.subs.map((sub) => ({
        octree: { radius: sub.r, root: asReferenceNode(sub.root) },
        offset: sub.offset,
      })),
    };
  }

  it("on 300 random hulls with subentities under symmetric poses", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(
        hull,
        hull,
        fc.tuple(coordinate, coordinate, coordinate),
        symmetricRotation,
        fc.tuple(coordinate, coordinate, coordinate),
        symmetricRotation,
        (prime, other, pp, pq, op, oq) => {
          const primePose: HullPose = { position: vec(...pp), orientation: pq };
          const otherPose: HullPose = { position: vec(...op), orientation: oq };
          const port = doOctreesCollide(
            portHull(prime),
            primePose,
            portHull(other),
            otherPose,
          );
          const reference = partOf(
            doOctreesCollideReference(
              referenceHull(prime, primePose),
              referenceHull(other, otherPose),
            ),
          );
          expect(port).toEqual(reference);
          seen.add(port === null ? "none" : port.kind);
        },
      ),
      { numRuns: 300, seed: 18092 },
    );
    expect([...seen].sort()).toEqual(["hull", "none", "subentity"]);
  });
});

describe("totality", () => {
  const solid = tree(4, -1);

  it("isHitByOctree: a bad origin or basis component is no hit, never a throw", () => {
    fc.assert(
      fc.property(
        anyRoot,
        anyRoot,
        fc.tuple(coordinate, coordinate, coordinate),
        anyRotation,
        fc.integer({ min: 0, max: 11 }),
        badValue,
        (proot, oroot, [x, y, z], q, slot, bad) => {
          const origin: Triple = [x, y, z];
          const rows = ijkOf(q).map(triple);
          if (slot < 3) origin[slot] = bad;
          else {
            const row = rows[Math.floor((slot - 3) / 3)];
            if (row !== undefined) row[(slot - 3) % 3] = bad;
          }
          const [r0, r1, r2] = rows;
          if (r0 === undefined || r1 === undefined || r2 === undefined) {
            throw new Error("three rows");
          }
          expect(
            isHitByOctree(tree(6, proot), tree(6, oroot), vec(...origin), [
              vec(...r0),
              vec(...r1),
              vec(...r2),
            ]),
          ).toBe(false);
        },
      ),
      { numRuns: 300, seed: 18093 },
    );
  });

  it("doOctreesCollide: a bad position or quaternion component is no contact, never a throw", () => {
    const hullArb = fc.record({
      r: radius,
      root: anyRoot,
      offset: fc.tuple(coordinate, coordinate, coordinate),
    });
    fc.assert(
      fc.property(
        hullArb,
        hullArb,
        fc.tuple(coordinate, coordinate, coordinate),
        anyRotation,
        fc.tuple(coordinate, coordinate, coordinate),
        anyRotation,
        fc.integer({ min: 0, max: 13 }),
        badValue,
        (a, b, pp, pq, op, oq, slot, bad) => {
          const hullOf = (d: typeof a): ContactHull => ({
            octree: tree(d.r, d.root),
            subentities: [
              {
                key: "s",
                position: vec(...d.offset),
                mass: 1,
                octree: tree(d.r, d.root),
              },
            ],
          });
          const values = [
            ...pp,
            pq.w,
            pq.x,
            pq.y,
            pq.z,
            ...op,
            oq.w,
            oq.x,
            oq.y,
            oq.z,
          ];
          values[slot] = bad;
          const at = (i: number): number => values[i] ?? Number.NaN;
          const primePose: HullPose = {
            position: vec(at(0), at(1), at(2)),
            orientation: quat(at(3), at(4), at(5), at(6)),
          };
          const otherPose: HullPose = {
            position: vec(at(7), at(8), at(9)),
            orientation: quat(at(10), at(11), at(12), at(13)),
          };
          expect(
            doOctreesCollide(hullOf(a), primePose, hullOf(b), otherPose),
          ).toBeNull();
        },
      ),
      { numRuns: 300, seed: 18094 },
    );
  });

  it("a node array of length 7 is no hit on either side", () => {
    const seven = [-1, -1, -1, -1, -1, -1, -1] as unknown as OctreeNode;
    const ijk = ijkOf(quat(1, 0, 0, 0));
    expect(isHitByOctree(tree(4, seven), solid, vec(0, 0, 0), ijk)).toBe(false);
    expect(isHitByOctree(solid, tree(4, seven), vec(0, 0, 0), ijk)).toBe(false);
    const pose: HullPose = {
      position: vec(0, 0, 0),
      orientation: quat(1, 0, 0, 0),
    };
    expect(
      doOctreesCollide(
        { octree: tree(4, seven) },
        pose,
        { octree: solid },
        pose,
      ),
    ).toBeNull();
    expect(
      doOctreesCollide(
        { octree: solid },
        pose,
        { octree: tree(4, seven) },
        pose,
      ),
    ).toBeNull();
  });

  it("a tree nested deeper than MAX_OCTREE_DEPTH is no hit; at the cap it hits", () => {
    /** `levels` nested arrays down child 0, a solid leaf at the bottom. */
    function chain(levels: number): OctreeNode {
      let node: OctreeNode = -1;
      for (let i = 0; i < levels; i += 1) {
        node = [node, 0, 0, 0, 0, 0, 0, 0];
      }
      return node;
    }
    // Child 0 is the (-x, -y, -z) corner, so the chain's leaf sits at the
    // corner of the root cube; a solid other of the same half-width centred
    // on the root covers it.
    const ijk = ijkOf(quat(1, 0, 0, 0));
    const atCap = tree(64, chain(MAX_OCTREE_DEPTH));
    const tooDeep = tree(64, chain(MAX_OCTREE_DEPTH + 1));
    const cover = tree(64, -1);
    expect(isHitByOctree(atCap, cover, vec(0, 0, 0), ijk)).toBe(true);
    expect(isHitByOctree(cover, atCap, vec(0, 0, 0), ijk)).toBe(true);
    expect(isHitByOctree(tooDeep, cover, vec(0, 0, 0), ijk)).toBe(false);
    expect(isHitByOctree(cover, tooDeep, vec(0, 0, 0), ijk)).toBe(false);
    const pose: HullPose = {
      position: vec(0, 0, 0),
      orientation: quat(1, 0, 0, 0),
    };
    expect(
      doOctreesCollide({ octree: tooDeep }, pose, { octree: cover }, pose),
    ).toBeNull();
    expect(
      doOctreesCollide({ octree: cover }, pose, { octree: tooDeep }, pose),
    ).toBeNull();
  });
});
