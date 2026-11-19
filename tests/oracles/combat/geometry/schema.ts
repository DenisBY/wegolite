// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The geometry oracle fixture contract (Phase 18, plan 18-02) as strict zod
 * schemas: the dock-mouth and buoy beam fixtures (which part of a station or
 * buoy a laser beam stops on) and the octree-against-octree fixtures.
 *
 * This file imports `zod` and nothing else: the oracle tree never reads
 * Wegolite code (`tests/guards/oracle-independence.test.ts` enforces that
 * mechanically). Oolite is read at the pin `7437f22`; every line number in a
 * fixture is a pin line number.
 *
 * Conventions (this plan sets them):
 *
 * - Oolite model axes: x right, y up, z forward, the dock on +z; metres;
 *   float64 geometry.
 * - Every fixture carries `citations` (`<path>:<a>-<b>`, into the pinned tree
 *   or the vendored `third_party/oolite/Config/shipdata.plist`).
 * - Ids are kebab-case, unique across every oracle tree, prefixed `dock-` or
 *   `octree-`.
 *
 * Dock-mouth tolerance. The octree reports the distance from the beam start
 * to the centre of the first solid node it visits (`Octree.m:347-366`), not
 * the exact surface distance. With `h` the leaf half-width of the struck
 * part's octree and `alpha` the angle between the beam and the struck
 * triangle's plane, a fixture's tolerance is fixed up front at
 * `sqrt(3) h + 2 h / sin(alpha)`, and it is the larger of the winner's and the
 * runner-up's. `h` is the root half-width `0.5 + MaxDimensionFromOrigin`
 * (`OOMeshToOctreeConverter.m:260-286`) halved `depth` times, `depth` by
 * `octreeDepth` (`OOMesh.m:590-623`). The depths these tolerances assume
 * (recorded per part in every fixture, `octreeDepth`):
 *
 * - `oolite_coriolis.dat` depth 6, root 500.5, h 7.8203125;
 * - `oolite_coriolis_faceplate.dat` depth 6, root 534.798, h 8.35621875;
 * - `oolite_coriolis_tris.dat` depth 6, root 500.5, h 7.8203125;
 * - `oolite_coriolis_dock.dat` depth 5, root 250.5, h 7.828125;
 * - `oolite_buoy.dat` depth 5, root 58.22786, h 1.819620625;
 * - `oolite_buoy_subents.dat` depth 5, root 24.3478, h 0.76086875.
 *
 * A consumer that finds a different depth in the emitted octree has a
 * dispute, never a reason to widen a tolerance. A beam under 30 degrees to the
 * struck plane is not used; a part a beam must miss is cleared by one leaf
 * diagonal `2 sqrt(3) h`; the winner beats the runner-up by at least twice the
 * tolerance. `edge: true` marks a beam placed at the two-leaf-width minimum
 * (4 h, h the largest leaf half-width of the model's parts) from a slot or
 * panel edge; a real-engine measurement uses only `edge: false` fixtures.
 */

import { z } from "zod";

/** The dock-mouth fixture file, relative to this directory. */
export const DOCK_MOUTH_FIXTURE_FILE = "fixtures/dock-mouth.json";

/** The octree-against-octree fixture file, relative to this directory. */
export const OCTREE_COLLIDE_FIXTURE_FILE = "fixtures/octree-collide.json";

/** The steepest grazing angle a fixture may use, degrees. */
export const DOCK_MIN_INCIDENCE_DEG = 30;

const DOCK_ID = /^dock-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CITATION =
  /^(?:src\/Core\/[A-Za-z0-9_./-]+|third_party\/oolite\/Config\/[A-Za-z0-9_.-]+):([1-9]\d*)-([1-9]\d*)$/;

/** `<path>:<a>-<b>`, into the pinned Oolite tree or the vendored config. */
const citation = z
  .string()
  .regex(
    CITATION,
    "citation must be src/Core/... or third_party/oolite/Config/... :a-b",
  )
  .refine((value) => {
    const match = CITATION.exec(value);
    if (match === null) return false;
    return Number(match[1]) <= Number(match[2]);
  }, "citation range must have a <= b");

const finite = z.number().refine(Number.isFinite, "must be finite");
const vec3 = z.tuple([finite, finite, finite]);

const unitVec3 = vec3.refine(
  (v) => Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) <= 1e-12,
  "direction must be unit length",
);

export const DOCK_MODELS = ["coriolis", "buoy"] as const;

export const DOCK_MESHES = [
  "oolite_coriolis.dat",
  "oolite_coriolis_faceplate.dat",
  "oolite_coriolis_tris.dat",
  "oolite_coriolis_dock.dat",
  "oolite_buoy.dat",
  "oolite_buoy_subents.dat",
] as const;

/** The parts of each model, hull first, then ship subentities in list order. */
export const DOCK_PART_NAMES = {
  coriolis: ["hull", "faceplate", "tris", "dock"],
  buoy: ["hull", "subentity"],
} as const;

const octreeDepth = z.strictObject({
  depth: z.number().int().min(4).max(7),
  rootHalfWidth: z.number().positive(),
  leafHalfWidth: z.number().positive(),
});

const part = z.strictObject({
  name: z.string().min(1),
  mesh: z.enum(DOCK_MESHES),
  /** Authored position in the parent's model axes; orientation is identity. */
  position: vec3,
  citation,
  octreeDepth,
});

const partName = z.enum([
  "hull",
  "faceplate",
  "tris",
  "dock",
  "subentity",
  "none",
]);

/** One dock-mouth or buoy beam fixture. */
export const DockMouthFixtureSchema = z
  .strictObject({
    id: z
      .string()
      .regex(DOCK_ID, "a dock-mouth id is kebab-case, prefix dock-"),
    title: z.string().min(1),
    citations: z.array(citation).min(1),
    model: z.enum(DOCK_MODELS),
    /** Placed at the two-leaf-width minimum from a slot or panel edge. */
    edge: z.boolean(),
    parts: z.array(part).min(2),
    ray: z.strictObject({ start: vec3, direction: unitVec3 }),
    expected: z.strictObject({
      winner: partName,
      /** Exact distance from the ray start to the winner's surface. */
      distance: z.number().positive().nullable(),
      /** Angle between the ray and the struck plane, degrees. */
      incidenceDeg: z.number().min(DOCK_MIN_INCIDENCE_DEG).max(90).nullable(),
      runnerUp: partName.exclude(["none"]).nullable(),
      runnerUpDistance: z.number().positive().nullable(),
      runnerUpIncidenceDeg: z
        .number()
        .min(DOCK_MIN_INCIDENCE_DEG)
        .max(90)
        .nullable(),
      /** max over winner and runner-up of sqrt(3) h + 2 h / sin(alpha). */
      tolerance: z.number().min(0),
      /** runnerUpDistance - distance; null without a runner-up. */
      margin: z.number().positive().nullable(),
    }),
    /** Every part the ray misses: the line clearance and the leaf diagonal. */
    clearances: z.array(
      z.strictObject({
        part: partName.exclude(["none"]),
        clearance: z.number().min(0),
        required: z.number().positive(),
      }),
    ),
  })
  .superRefine((fixture, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };
    const names = fixture.parts.map((p) => p.name);
    const expectedNames: readonly string[] = DOCK_PART_NAMES[fixture.model];
    if (names.join(",") !== expectedNames.join(",")) {
      issue(
        ["parts"],
        `a ${fixture.model} fixture lists ${expectedNames.join(", ")} in order`,
      );
    }
    const e = fixture.expected;
    const hit = e.winner !== "none";
    if (hit !== (e.distance !== null) || hit !== (e.incidenceDeg !== null)) {
      issue(
        ["expected"],
        "a hit has a distance and an incidence; a miss has neither",
      );
    }
    if (!hit && e.runnerUp !== null)
      issue(["expected", "runnerUp"], "a miss has no runner-up");
    if ((e.runnerUp === null) !== (e.runnerUpDistance === null)) {
      issue(
        ["expected", "runnerUpDistance"],
        "runner-up and its distance go together",
      );
    }
    if ((e.runnerUp === null) !== (e.runnerUpIncidenceDeg === null)) {
      issue(
        ["expected", "runnerUpIncidenceDeg"],
        "runner-up and its incidence go together",
      );
    }
    if ((e.runnerUp === null) !== (e.margin === null)) {
      issue(
        ["expected", "margin"],
        "a margin exists exactly when there is a runner-up",
      );
    }
    if (e.margin !== null && e.margin < 2 * e.tolerance) {
      issue(
        ["expected", "margin"],
        "the winner beats the runner-up by at least twice the tolerance",
      );
    }
    if (hit && !names.includes(e.winner))
      issue(["expected", "winner"], "winner is not a part");
    for (const [index, entry] of fixture.clearances.entries()) {
      if (entry.clearance < entry.required) {
        issue(
          ["clearances", index],
          `${entry.part} is not cleared by one leaf diagonal`,
        );
      }
    }
  });
export type DockMouthFixture = z.infer<typeof DockMouthFixtureSchema>;

function uniqueIds<T extends { readonly id: string }>(
  fixtures: readonly T[],
  ctx: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  fixtures.forEach((fixture, index) => {
    if (ids.has(fixture.id)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "id"],
        message: `duplicate fixture id ${fixture.id}`,
      });
    }
    ids.add(fixture.id);
  });
}

/** The dock-mouth fixture file: fixtures with unique ids. */
export const DockMouthFileSchema = z
  .array(DockMouthFixtureSchema)
  .superRefine(uniqueIds);

// ---------------------------------------------------------------------------
// octree-against-octree fixtures

const OCTREE_ID = /^octree-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The deepest tree a fixture may author (the plan's depth limit). */
export const OCTREE_FIXTURE_MAX_DEPTH = 3;

/** An octree node: `0` empty, `-1` solid, or eight children in `x*4+y*2+z` order. */
export type OctreeNodeJson = 0 | -1 | readonly OctreeNodeJson[];

const octreeNode: z.ZodType<OctreeNodeJson> = z.lazy(() =>
  z.union([z.literal(0), z.literal(-1), z.array(octreeNode).length(8)]),
);

function nodeDepth(node: OctreeNodeJson): number {
  if (typeof node === "number") return 0;
  return 1 + Math.max(...node.map(nodeDepth));
}

const octreeData = z
  .strictObject({ radius: z.number().positive(), root: octreeNode })
  .refine(
    (tree) => nodeDepth(tree.root) <= OCTREE_FIXTURE_MAX_DEPTH,
    `an authored octree is at most ${OCTREE_FIXTURE_MAX_DEPTH} levels deep`,
  );

/** `ijk.v[0..2]`: three axes, orthonormal and right-handed (within 1e-9). */
const ijkSchema = z.tuple([vec3, vec3, vec3]).superRefine((ijk, ctx) => {
  const [i, j, k] = ijk;
  const d = (a: readonly number[], b: readonly number[]): number =>
    (a[0] ?? 0) * (b[0] ?? 0) +
    (a[1] ?? 0) * (b[1] ?? 0) +
    (a[2] ?? 0) * (b[2] ?? 0);
  const checks: [number, number][] = [
    [d(i, i), 1],
    [d(j, j), 1],
    [d(k, k), 1],
    [d(i, j), 0],
    [d(j, k), 0],
    [d(k, i), 0],
  ];
  const det =
    i[0] * (j[1] * k[2] - j[2] * k[1]) -
    i[1] * (j[0] * k[2] - j[2] * k[0]) +
    i[2] * (j[0] * k[1] - j[1] * k[0]);
  checks.push([det, 1]);
  if (checks.some(([value, want]) => Math.abs(value - want) > 1e-9)) {
    ctx.addIssue({
      code: "custom",
      message: "ijk must be orthonormal and right-handed",
    });
  }
});
export type IjkJson = z.infer<typeof ijkSchema>;

/** A 3x3 matrix, row-major. */
const matrix3 = z.tuple([vec3, vec3, vec3]);

const isIdentity = (ijk: IjkJson): boolean =>
  ijk.every((axis, a) => axis.every((value, b) => value === (a === b ? 1 : 0)));

/**
 * The basis in Wegolite axes: `S B S` with `S = diag(1, 1, -1)` (Wegolite
 * maps Oolite's (x, y, z) to (x, y, -z)) and `B` the matrix whose columns
 * are `ijk.v[0..2]`; row-major.
 */
export function wegoliteBasisOf(ijk: IjkJson): number[][] {
  const s = [1, 1, -1];
  return [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => (s[r] ?? 1) * (ijk[c]?.[r] ?? 0) * (s[c] ?? 1)),
  );
}

function basisProblem(
  ijk: IjkJson,
  basis: readonly (readonly number[])[] | undefined,
): string | null {
  if (isIdentity(ijk)) {
    return basis === undefined
      ? null
      : "an identity ijk carries no wegoliteBasis";
  }
  if (basis === undefined) return "a rotated ijk carries its wegoliteBasis";
  const want = wegoliteBasisOf(ijk);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      if (Math.abs((basis[r]?.[c] ?? NaN) - (want[r]?.[c] ?? NaN)) > 1e-12) {
        return "wegoliteBasis must equal S B S";
      }
    }
  }
  return null;
}

const float32Exact = (value: number): boolean => Math.fround(value) === value;

/** `isHitByOctree:withOrigin:andIJK:` on two authored trees. */
export const OctreePairFixtureSchema = z
  .strictObject({
    id: z
      .string()
      .regex(OCTREE_ID, "an octree id is kebab-case, prefix octree-"),
    title: z.string().min(1),
    citations: z.array(citation).min(1),
    kind: z.literal("pair"),
    /** The caller's prime: always the axial tree. */
    prime: octreeData,
    other: octreeData,
    /** The other's centre in the prime's frame. */
    origin: vec3,
    /** The other's axes in the prime's frame (`relative_ijk_of_other`). */
    ijk: ijkSchema,
    wegoliteBasis: matrix3.optional(),
    /** Sits on a compare boundary: every coordinate is float32-exact. */
    boundary: z.boolean(),
    /** The crude prune rejects a contact exact geometry has. */
    prunedCorner: z.boolean(),
    expected: z.strictObject({ hit: z.boolean() }),
    /** Brute force on the geometric placement, for the record. */
    geometry: z.strictObject({
      bruteForceOverlap: z.boolean(),
      /** Deepest separating-axis depth; null when a tree has no solid cell. */
      depth: z.number().nullable(),
    }),
  })
  .superRefine((fixture, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };
    const problem = basisProblem(fixture.ijk, fixture.wegoliteBasis);
    if (problem !== null) issue(["wegoliteBasis"], problem);
    if (fixture.boundary) {
      const values = [
        ...fixture.origin,
        ...fixture.ijk.flat(),
        fixture.prime.radius,
        fixture.other.radius,
      ];
      if (!values.every(float32Exact)) {
        issue(
          ["boundary"],
          "a boundary fixture uses float32-exact coordinates",
        );
      }
    }
    if (
      fixture.prunedCorner &&
      (fixture.expected.hit || !fixture.geometry.bruteForceOverlap)
    ) {
      issue(
        ["prunedCorner"],
        "a pruned corner is a reference miss and a geometric overlap",
      );
    }
  });
export type OctreePairFixture = z.infer<typeof OctreePairFixtureSchema>;

const subentityHull = z.strictObject({ octree: octreeData, offset: vec3 });

const hullPose = z
  .strictObject({
    octree: octreeData,
    position: vec3,
    /** The hull's axes in world (`absoluteIJKForSubentity`). */
    ijk: ijkSchema,
    wegoliteBasis: matrix3.optional(),
    subentities: z.array(subentityHull),
  })
  .superRefine((hull, ctx) => {
    const problem = basisProblem(hull.ijk, hull.wegoliteBasis);
    if (problem !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["wegoliteBasis"],
        message: problem,
      });
    }
  });

/** `doOctreesCollide(prime, other)` on two hulls with subentities. */
export const OctreeComposeFixtureSchema = z.strictObject({
  id: z.string().regex(OCTREE_ID, "an octree id is kebab-case, prefix octree-"),
  title: z.string().min(1),
  citations: z.array(citation).min(1),
  kind: z.literal("compose"),
  prime: hullPose,
  other: hullPose,
  expected: z.strictObject({
    result: z.union([
      z.literal("none"),
      z.literal("other"),
      z.strictObject({ otherSubentity: z.number().int().min(0) }),
    ]),
  }),
});
export type OctreeComposeFixture = z.infer<typeof OctreeComposeFixtureSchema>;

/** One octree-against-octree fixture (strict). */
export const OctreeCollideFixtureSchema = z.discriminatedUnion("kind", [
  OctreePairFixtureSchema,
  OctreeComposeFixtureSchema,
]);
export type OctreeCollideFixture = z.infer<typeof OctreeCollideFixtureSchema>;

/** The octree fixture file: fixtures with unique ids. */
export const OctreeCollideFileSchema = z
  .array(OctreeCollideFixtureSchema)
  .superRefine(uniqueIds);
