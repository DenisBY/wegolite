// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Octree-against-octree contact against the independent 18-02 geometry oracle
 * (CBT-18, D-01): every fixture of `octree-collide.json` runs through the port.
 *
 * The mapping from a fixture's Oolite axes to the port's arguments:
 *
 * - Direct form (`kind: "pair"`): `isHitByOctree(prime, other, origin, ijk)`
 *   takes the fixture's trees, `origin` and `ijk` as they are; the port and
 *   the C share the frame (the prime's Oolite model axes).
 * - Hull-pose form (`kind: "pair"` again, through `doOctreesCollide`): the
 *   prime sits at the world origin with the identity orientation, so its
 *   model frame is Wegolite local with z negated. The other is placed at the
 *   Wegolite world position `S origin`, `S = diag(1, 1, -1)`, turned by the
 *   quaternion of `wegoliteBasis` (`S B S`, `B` with `ijk` as columns; the
 *   identity when the fixture has none). A hit is `{ kind: "hull" }`, a miss
 *   `null`.
 * - Composition (`kind: "compose"`): each hull's Oolite world position maps to
 *   `S position` and its axes to the quaternion of its `wegoliteBasis`;
 *   subentity offsets stay in Oolite model axes, as `SubentityHull.position`
 *   holds them. `"none"` is `null`, `"other"` is `{ kind: "hull" }` and
 *   `{ otherSubentity: i }` is `{ kind: "subentity", index: i }`.
 *
 * One helper turns a basis into a quaternion, and each use asserts that the
 * quaternion rotates the three unit axes back onto the basis columns within
 * 1e-12, so a wrong reflection map fails here (review L79@b45e113). A failing
 * fixture is a dispute with the C, never a widened tolerance.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { doOctreesCollide } from "../../../src/sim/combat/collide.js";
import type {
  ContactHull,
  ContactPart,
} from "../../../src/sim/combat/collide.js";
import { isHitByOctree } from "../../../src/sim/combat/octree.js";
import type { HullOctree, OctreeNode } from "../../../src/sim/combat/octree.js";
import {
  identity,
  normalize,
  quat,
  rotate,
  vec,
} from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import {
  OCTREE_COLLIDE_FIXTURE_FILE,
  OctreeCollideFileSchema,
} from "../../oracles/combat/geometry/schema.js";
import type {
  OctreeCollideFixture,
  OctreeComposeFixture,
  OctreePairFixture,
} from "../../oracles/combat/geometry/schema.js";

const THIS_FILE = "tests/sim/combat/octree-collide.oracle.test.ts";

function readFixtures(): readonly OctreeCollideFixture[] {
  return OctreeCollideFileSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../oracles/combat/geometry/${OCTREE_COLLIDE_FIXTURE_FILE}`,
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown,
  );
}

type Triple = readonly [number, number, number];
type Matrix = readonly [Triple, Triple, Triple];

function nodeDepth(node: OctreeNode): number {
  if (!Array.isArray(node)) return 0;
  const children: readonly OctreeNode[] = node;
  return 1 + Math.max(...children.map(nodeDepth));
}

function hullOctree(tree: {
  readonly radius: number;
  readonly root: OctreeNode;
}): HullOctree {
  return { radius: tree.radius, depth: nodeDepth(tree.root), root: tree.root };
}

function v3(t: Triple): Vec3 {
  return vec(t[0], t[1], t[2]);
}

/** Oolite axes to Wegolite axes: `S v`, `S = diag(1, 1, -1)`. */
function toWegolite(t: Triple): Vec3 {
  return vec(t[0], t[1], -t[2]);
}

/**
 * The unit quaternion of a rotation matrix (row-major, `v' = M v`), by the
 * largest-diagonal branch (Shepperd).
 */
function quatFromBasis(m: Matrix): Quat {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return normalize(
      quat(s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s),
    );
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return normalize(
      quat((m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s),
    );
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return normalize(
      quat((m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s),
    );
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return normalize(
    quat((m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4),
  );
}

/**
 * The orientation of a fixture basis, asserted to rotate the unit axes back
 * onto the basis columns (`rotate(q, e_c)[r] = M[r][c]`) within 1e-12.
 */
function orientationOf(basis: Matrix | undefined): Quat {
  if (basis === undefined) return identity();
  const q = quatFromBasis(basis);
  const axes = [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)];
  for (let c = 0; c < 3; c += 1) {
    const turned = rotate(q, axes[c] ?? vec(0, 0, 0));
    const column = [turned.x, turned.y, turned.z];
    for (let r = 0; r < 3; r += 1) {
      expect(
        Math.abs((column[r] ?? Number.NaN) - (basis[r]?.[c] ?? Number.NaN)),
      ).toBeLessThanOrEqual(1e-12);
    }
  }
  return q;
}

function expectedPart(
  result: OctreeComposeFixture["expected"]["result"],
): ContactPart | null {
  if (result === "none") return null;
  if (result === "other") return { kind: "hull" };
  return { kind: "subentity", index: result.otherSubentity };
}

function composeHull(hull: OctreeComposeFixture["prime"]): ContactHull {
  return {
    octree: hullOctree(hull.octree),
    subentities: hull.subentities.map((sub, index) => ({
      key: `fixture-sub-${String(index)}`,
      position: v3(sub.offset),
      mass: 1,
      octree: hullOctree(sub.octree),
    })),
  };
}

function runPair(fixture: OctreePairFixture): void {
  const prime = hullOctree(fixture.prime);
  const other = hullOctree(fixture.other);
  const ijk: readonly [Vec3, Vec3, Vec3] = [
    v3(fixture.ijk[0]),
    v3(fixture.ijk[1]),
    v3(fixture.ijk[2]),
  ];
  // Direct form.
  expect(isHitByOctree(prime, other, v3(fixture.origin), ijk)).toBe(
    fixture.expected.hit,
  );
  // Hull-pose form.
  const contact = doOctreesCollide(
    { octree: prime },
    { position: vec(0, 0, 0), orientation: identity() },
    { octree: other },
    {
      position: toWegolite(fixture.origin),
      orientation: orientationOf(fixture.wegoliteBasis),
    },
  );
  expect(contact).toEqual(fixture.expected.hit ? { kind: "hull" } : null);
}

function runCompose(fixture: OctreeComposeFixture): void {
  const contact = doOctreesCollide(
    composeHull(fixture.prime),
    {
      position: toWegolite(fixture.prime.position),
      orientation: orientationOf(fixture.prime.wegoliteBasis),
    },
    composeHull(fixture.other),
    {
      position: toWegolite(fixture.other.position),
      orientation: orientationOf(fixture.other.wegoliteBasis),
    },
  );
  expect(contact).toEqual(expectedPart(fixture.expected.result));
}

const ran: string[] = [];

describe(THIS_FILE, () => {
  for (const fixture of readFixtures()) {
    it(fixture.id, () => {
      ran.push(fixture.id);
      if (fixture.kind === "pair") runPair(fixture);
      else runCompose(fixture);
    });
  }
});

describe("the manifest entry", () => {
  it("runs exactly the fixtures of octree-collide.json", () => {
    const expected = readFixtures().map((fixture) => fixture.id);
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual([...expected].sort());
  });

  it("covers both prime roles, the pruned corner and the transposed placement", () => {
    for (const id of [
      "octree-prime-smaller-axial-prime",
      "octree-prime-larger-axial-prime",
      "octree-pruned-corner",
      "octree-rotated-decomposition-transposed",
      "octree-sub-sub-returns-other",
    ]) {
      expect(ran).toContain(id);
    }
  });
});
