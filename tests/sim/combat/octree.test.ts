// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hull octree line test (CBT-07, D-02), a port of `Octree.m:336-471`.
 *
 * Child index is `x * 4 + y * 2 + z` with the plus side of an axis being 1
 * (`Octree.m:158-161`, `offsetForOctant`), so in a root of half-width 8 child 0
 * is centred (-4, -4, -4), child 1 (-4, -4, +4), child 3 (-4, +4, +4), child 5
 * (+4, -4, +4), child 6 (+4, +4, -4) and child 7 (+4, +4, +4).
 *
 * Two facts of the C code shape every fixture, and the port must keep both
 * (RESEARCH F8, Pitfall 4):
 *
 * 1. The returned distance is the length of the start point shifted by the
 *    accumulated cell offsets at the first solid leaf reached, that is the
 *    distance from the line start to the CENTRE of that leaf.
 * 2. A solid leaf is not tested against the line (`Octree.m:361-366` returns as
 *    soon as it is reached); only the cube of the array node that holds it is.
 *    The first solid leaf in the visiting order wins, wherever it lies.
 *
 * Visiting order of one array node, with `e` the entry octant (0 when an
 * endpoint is inside the cube): e, e^1, e^2, e^4, then e^1^7, e^2^7, e^4^7,
 * then e^7 (`Octree.m:413-452`).
 *
 * No executable Oolite oracle exists (RESEARCH, Environment Availability), so
 * the DISTANCE is checked only by the hand fixtures below; the property test
 * checks hit and miss only, against a brute-force cell oracle.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_OCTREE_DEPTH,
  isHitByLine,
  toOoliteModelSegment,
} from "../../../src/sim/combat/octree.js";
import type { HullOctree, OctreeNode } from "../../../src/sim/combat/octree.js";
import { axisAngle, identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";

/** Eight children, all empty except those listed. */
function withSolid(...solid: readonly number[]): OctreeNode {
  const children: OctreeNode[] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const index of solid) children[index] = -1;
  return children;
}

function tree(radius: number, root: OctreeNode, depth = 1): HullOctree {
  return { radius, depth, root };
}

describe("isHitByLine: hand fixtures", () => {
  it("a solid root of half-width 1 returns the distance to its centre", () => {
    // The segment (0, 0, -10) to (0, 0, 10) starts 10 from the centre.
    expect(
      isHitByLine(tree(1, -1, 0), vec(0, 0, -10), vec(0, 0, 10)),
    ).toBeCloseTo(10, 12);
  });

  it("returns the distance to the centre of the one solid child", () => {
    // Root half-width 8, solid child 5 (x+, y-, z+) centred (4, -4, 4). The
    // line from (4, -4, -20) to (4, -4, 20) enters through the z = -8 face; the
    // order reaches 5 and reports start-to-centre: (0, 0, 24) -> 24.
    const hull = tree(8, withSolid(5));
    expect(isHitByLine(hull, vec(4, -4, -20), vec(4, -4, 20))).toBeCloseTo(
      24,
      12,
    );
    // From (0, 0, -20) the same child is reached: (4, -4, 24), sqrt(608).
    expect(isHitByLine(hull, vec(0, 0, -20), vec(0, 0, 20))).toBeCloseTo(
      Math.sqrt(16 + 16 + 576),
      12,
    );
  });

  it("returns the first leaf in Oolite's visiting order, not the nearest", () => {
    // Solid children 7 (centred (4, 4, 4)) and 3 (centred (-4, 4, 4)). The
    // line starts at (4, 4, 3), INSIDE the root cube, so there is no entry
    // face: the entry octant is 0 and the order is 0, 1, 2, 4, then 6, 5, 3,
    // then 7. Child 3 comes before child 7 although the start is 1 from the
    // centre of child 7 and 8.06 from the centre of child 3. Child 3's shift is
    // (4, -4, -4), so the start becomes (8, 0, -1): sqrt(65).
    const hull = tree(8, withSolid(3, 7));
    const distance = isHitByLine(hull, vec(4, 4, 3), vec(4, 4, 20));
    expect(distance).toBeCloseTo(Math.sqrt(65), 12);
    expect(distance).not.toBeCloseTo(1, 1);
  });

  it("starting outside, the entry octant and its neighbours go first", () => {
    // Solid children 6 (x+, y+, z-, centred (4, 4, -4)) and 5 (x+, y-, z+,
    // centred (4, -4, 4)); child 7 is empty. The line from (6, 6, 20) to
    // (6, 6, -20) enters through the z = +8 face at (6, 6, 8), octant 7 (empty),
    // so the order is 7, 6, 5, ...: child 6 wins, although child 5 is nearer to
    // the start (sqrt(360) = 18.97 against sqrt(584) = 24.17).
    // Child 6's shift is (-4, -4, +4): the start becomes (2, 2, 24).
    const hull = tree(8, withSolid(5, 6));
    expect(isHitByLine(hull, vec(6, 6, 20), vec(6, 6, -20))).toBeCloseTo(
      Math.sqrt(4 + 4 + 576),
      12,
    );
  });

  it("descends into nested cells, summing the shifts", () => {
    // Root half-width 8; child 7 is a cell [0, 8]^3 holding one solid leaf, its
    // own child 7. From (6, 6, -50) to (6, 6, 50): root octant 6 is empty and 7
    // is the array; there (shift (-4, -4, -4), half-width 4) the line enters at
    // z = -4 in octant 6 (empty), then 7 is the leaf with shift (-2, -2, -2),
    // total shift (-6, -6, -6): the start becomes (0, 0, -56).
    const hull = tree(8, [0, 0, 0, 0, 0, 0, 0, withSolid(7)], 2);
    expect(isHitByLine(hull, vec(6, 6, -50), vec(6, 6, 50))).toBeCloseTo(
      56,
      12,
    );
  });

  it("returns 0 for an all-empty tree", () => {
    expect(isHitByLine(tree(8, 0), vec(0, 0, -20), vec(0, 0, 20))).toBe(0);
    expect(
      isHitByLine(tree(8, withSolid()), vec(0, 0, -20), vec(0, 0, 20)),
    ).toBe(0);
  });

  it("returns 0 for a segment that passes outside the root cube", () => {
    const hull = tree(8, withSolid(5));
    // x = 20 is beyond the +x face for both endpoints.
    expect(isHitByLine(hull, vec(20, 0, -20), vec(20, 0, 20))).toBe(0);
    // Both endpoints are beyond the same face although the segment is long.
    expect(isHitByLine(hull, vec(-9, -50, 0), vec(-9, 50, 0))).toBe(0);
    // A segment that stops short of the cube.
    expect(isHitByLine(hull, vec(0, 0, -50), vec(0, 0, -20))).toBe(0);
  });

  it("hits through a face crossing, with both endpoints outside the cube", () => {
    // Root half-width 8 with every child solid, so any touch of the root cube
    // is a hit. Both endpoints are outside, with no face plane in common, so
    // the segment is resolved by the bevel, corner and face-crossing tests.
    const hull = tree(8, withSolid(0, 1, 2, 3, 4, 5, 6, 7));
    // A diagonal through the cube.
    expect(
      isHitByLine(hull, vec(-30, -10, -12), vec(30, 10, 12)),
    ).toBeGreaterThan(0);
    // (20, 0, 0) is beyond +x only and (0, 12, 0) beyond +y only. The segment
    // crosses the +x face at (8, 7.2, 0), inside the face: a hit.
    expect(isHitByLine(hull, vec(20, 0, 0), vec(0, 12, 0))).toBeGreaterThan(0);
    // (20, 0, 0) to (0, 20, 0) passes outside the cube's x = y = 8 edge: both
    // endpoints satisfy x + y > 16, the edge plane, so it is a miss.
    expect(isHitByLine(hull, vec(20, 0, 0), vec(0, 20, 0))).toBe(0);
  });
});

describe("isHitByLine: guards (T-13-04, T-13-05)", () => {
  const hull = tree(8, withSolid(7));

  it("returns 0 for non-finite endpoints and radius, and never throws", () => {
    const ok = vec(0, 0, 20);
    for (const bad of [
      vec(NaN, 0, 0),
      vec(0, Infinity, 0),
      vec(0, 0, -Infinity),
    ]) {
      expect(isHitByLine(hull, bad, ok)).toBe(0);
      expect(isHitByLine(hull, ok, bad)).toBe(0);
    }
    expect(isHitByLine(tree(NaN, withSolid(7)), vec(0, 0, -20), ok)).toBe(0);
    expect(isHitByLine(tree(Infinity, withSolid(7)), vec(0, 0, -20), ok)).toBe(
      0,
    );
  });

  /** `n` nested arrays whose child 0 leads to a solid leaf. */
  function chain(n: number): OctreeNode {
    let node: OctreeNode = -1;
    for (let i = 0; i < n; i++) node = [node, 0, 0, 0, 0, 0, 0, 0];
    return node;
  }

  // A line along z hugging the (-, -) edge, inside every cell of the chain:
  // with radius 128 the cell of depth d spans [-128, -128 + 256 / 2^d].
  const along: readonly [Vec3, Vec3] = [
    vec(-127.75, -127.75, -300),
    vec(-127.75, -127.75, 300),
  ];

  it("accepts a tree nested exactly MAX_OCTREE_DEPTH levels deep", () => {
    expect(MAX_OCTREE_DEPTH).toBe(7);
    expect(
      isHitByLine(tree(128, chain(MAX_OCTREE_DEPTH), 7), along[0], along[1]),
    ).toBeGreaterThan(0);
  });

  it("misses a tree nested deeper than MAX_OCTREE_DEPTH, without throwing", () => {
    expect(
      isHitByLine(
        tree(128, chain(MAX_OCTREE_DEPTH + 1), 8),
        along[0],
        along[1],
      ),
    ).toBe(0);
    // Deep enough to blow the stack if the guard were missing.
    expect(isHitByLine(tree(128, chain(20_000), 7), along[0], along[1])).toBe(
      0,
    );
  });

  it("misses a malformed node (wrong child count, stray number) without throwing", () => {
    const wrongLength = [-1, -1, -1] as unknown as OctreeNode;
    const stray = [5, 0, 0, 0, 0, 0, 0, 0] as unknown as OctreeNode;
    for (const root of [wrongLength, stray, 3 as unknown as OctreeNode]) {
      expect(isHitByLine(tree(8, root), vec(0, 0, -20), vec(0, 0, 20))).toBe(0);
    }
  });
});

describe("toOoliteModelSegment", () => {
  it("is the identity up to negating z for an identity orientation", () => {
    const { w0, w1 } = toOoliteModelSegment(
      vec(1, 2, 3),
      identity(),
      vec(4, 6, 8),
      vec(0, 0, 0),
    );
    // p0 - position = (3, 4, 5), p1 - position = (-1, -2, -3).
    expect(w0).toEqual(vec(3, 4, -5));
    expect(w1).toEqual(vec(-1, -2, 3));
  });

  it("follows a ship pitched about its right axis", () => {
    // 90 degrees about +X turns the nose, local -Z, to world +Y. A point one
    // unit along world +Y is one unit ahead of the nose: Oolite model z = +1.
    const q = axisAngle(1, 0, 0, Math.PI / 2);
    const { w0 } = toOoliteModelSegment(
      vec(0, 0, 0),
      q,
      vec(0, 1, 0),
      vec(0, 0, 0),
    );
    expect(w0.x).toBeCloseTo(0, 12);
    expect(w0.y).toBeCloseTo(0, 12);
    expect(w0.z).toBeCloseTo(1, 12);
  });
});

/* ------------------------------------------------------------------------- *
 * Property: hit/miss against a brute-force cell oracle
 * ------------------------------------------------------------------------- */

/** A cube a segment can touch: the cell of an array node with a solid child. */
interface Cell {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly half: number;
}

/**
 * Every array node that has at least one solid child, as its cell. This is the
 * set the descent can stop in (fact 2 in the header): a solid leaf is reached
 * exactly when the line touches the cell of the node that holds it.
 */
function solidParentCells(
  node: OctreeNode,
  cx: number,
  cy: number,
  cz: number,
  half: number,
  out: Cell[],
): void {
  if (typeof node === "number") return;
  if (node.some((child) => child === -1)) out.push({ cx, cy, cz, half });
  const quarter = half / 2;
  node.forEach((child, index) => {
    solidParentCells(
      child,
      cx + ((index >> 2) & 1 ? quarter : -quarter),
      cy + ((index >> 1) & 1 ? quarter : -quarter),
      cz + (index & 1 ? quarter : -quarter),
      quarter,
      out,
    );
  });
}

/** Slab test of the segment `a -> b` against an axis-aligned cube. */
function segmentTouches(a: Vec3, b: Vec3, cell: Cell, margin: number): boolean {
  const half = cell.half + margin;
  let tMin = 0;
  let tMax = 1;
  const axes: readonly (readonly [number, number, number])[] = [
    [a.x - cell.cx, b.x - a.x, half],
    [a.y - cell.cy, b.y - a.y, half],
    [a.z - cell.cz, b.z - a.z, half],
  ];
  for (const [start, delta, h] of axes) {
    if (delta === 0) {
      if (Math.abs(start) > h) return false;
      continue;
    }
    const t1 = (-h - start) / delta;
    const t2 = (h - start) / delta;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return false;
  }
  return true;
}

const RADIUS = 16;

/** A random node of at most `depth` levels of children. */
function nodeArb(depth: number): fc.Arbitrary<OctreeNode> {
  const empty = fc.constant<OctreeNode>(0);
  const solid = fc.constant<OctreeNode>(-1);
  if (depth === 0) return fc.oneof(empty, solid);
  return fc.oneof(
    { weight: 3, arbitrary: empty },
    { weight: 1, arbitrary: solid },
    {
      weight: 3,
      arbitrary: fc
        .array(nodeArb(depth - 1), { minLength: 8, maxLength: 8 })
        .map((children): OctreeNode => children),
    },
  );
}

/**
 * The root is an array whose children are mostly empty cells or sub-trees, with
 * a solid direct child only now and then: a solid direct child makes the whole
 * root cube the region that counts, which would leave too few misses.
 */
const rootArb: fc.Arbitrary<OctreeNode> = fc
  .array(
    fc.oneof(
      { weight: 4, arbitrary: fc.constant<OctreeNode>(0) },
      { weight: 1, arbitrary: fc.constant<OctreeNode>(-1) },
      { weight: 5, arbitrary: nodeArb(2) },
    ),
    { minLength: 8, maxLength: 8 },
  )
  .map((children): OctreeNode => children);

const coordArb = fc.double({ min: -24, max: 24, noNaN: true });
const spanArb = fc.double({ min: -14, max: 14, noNaN: true });

/** A segment of bounded length, so that many segments stay clear of the cube. */
const segmentArb: fc.Arbitrary<readonly [Vec3, Vec3]> = fc
  .tuple(coordArb, coordArb, coordArb, spanArb, spanArb, spanArb)
  .map(([x, y, z, dx, dy, dz]): readonly [Vec3, Vec3] => [
    vec(x, y, z),
    vec(x + dx, y + dy, z + dz),
  ]);

describe("isHitByLine: property against a brute-force cell oracle (A2)", () => {
  it("reports a hit exactly when the segment touches a cell holding a solid leaf", () => {
    // Rays within 1e-6 of the root half-width of any cell face, edge or corner
    // are skipped: the port is float64 here against Oolite's float32 (A2), and
    // a boundary ray may legitimately differ. A case is skipped when growing
    // and shrinking every cell by that margin disagrees about it.
    const margin = RADIUS * 1e-6;
    let hits = 0;
    let misses = 0;
    let skipped = 0;
    fc.assert(
      fc.property(rootArb, segmentArb, (root, [a, b]) => {
        const cells: Cell[] = [];
        solidParentCells(root, 0, 0, 0, RADIUS, cells);
        const grown = cells.some((cell) => segmentTouches(a, b, cell, margin));
        const shrunk = cells.some((cell) =>
          segmentTouches(a, b, cell, -margin),
        );
        if (grown !== shrunk) {
          skipped++;
          return true;
        }
        const distance = isHitByLine(tree(RADIUS, root, 3), a, b);
        if (grown) hits++;
        else misses++;
        return distance > 0 === grown;
      }),
      { seed: 20261114, numRuns: 1000 },
    );
    // The property is not vacuous: both outcomes occur in volume.
    expect(hits).toBeGreaterThan(100);
    expect(misses).toBeGreaterThan(100);
    // fast-check favours round numbers, which sit on cell faces; those are the
    // skipped boundary rays, a minority of the runs.
    expect(skipped).toBeLessThan(300);
  });
});
