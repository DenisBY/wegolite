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
