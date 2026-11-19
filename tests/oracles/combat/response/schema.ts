// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The response oracle fixture contract (Phase 18, plan 18-03) as strict zod
 * schemas: `collideWithShip`'s damage and velocity response
 * (`ShipEntity.m:11020-11152`).
 *
 * This file imports `zod` and nothing else: the oracle tree never reads
 * Wegolite code (`tests/guards/oracle-independence.test.ts` enforces that
 * mechanically). Oolite is read at the pin `7437f22`; every line number in a
 * fixture is a pin line number (the checkout's lines for the cited files equal
 * the pin's).
 *
 * Conventions (this plan sets them):
 *
 * - Oolite's own frame and units: metres, seconds, kilograms; one tick is
 *   `dt = 1/120` s exactly.
 * - Every input Oolite holds as a `GLfloat` (velocity components, masses,
 *   energies, radii, shields) is a float32 value in the fixture
 *   (`Math.fround(x) === x`), so the oracle starts from the bits Oolite
 *   starts from. Positions are `HPVector` (double) and free.
 * - Every fixture carries `citations` (`<path>:<a>-<b>` into the pinned tree)
 *   and a `derivation`: the formula with the C line it comes from and the
 *   numbers substituted.
 * - `tolerance` is the absolute tolerance of every non-integer expected value of
 *   a fixture. Booleans, branch names and receivers are exact whatever the
 *   tolerance says.
 * - Ids are kebab-case, unique across every oracle tree, prefixed `collide-`
 *   (this plan's other families: `brake-`, `scrape-`, `blast-`).
 *
 * Velocity changes are reported as the sum of the `adjustVelocity:` arguments
 * Oolite applies to a body (`ShipEntity.m:11173-11176`, `velocity += xVel`),
 * summed exactly: a reversal that adds `-x` after `+x` reports zero. A port
 * that holds velocities in another width compares its own before-and-after
 * difference with that sum within the tolerance.
 */

import { z } from "zod";

/** The collision fixture file, relative to this directory. */
export const COLLIDE_FIXTURE_FILE = "fixtures/collide.json";

const COLLIDE_ID = /^collide-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CITATION =
  /^(?:src\/Core|Resources)\/[A-Za-z0-9_./-]+:([1-9]\d*)-([1-9]\d*)$/;

/** A citation `<path>:<a>-<b>` into the pinned Oolite tree (commit 7437f22). */
const citation = z
  .string()
  .regex(CITATION, "citation must be src/Core/... or Resources/... :a-b")
  .refine((value) => {
    const match = CITATION.exec(value);
    if (match === null) return false;
    return Number(match[1]) <= Number(match[2]);
  }, "citation range must have a <= b");

const finite = z.number();
const nonNegative = z.number().min(0);
const vec3 = z.tuple([finite, finite, finite]);

/** A float32 value: `Math.fround(x) === x`. */
const float32 = z.number().refine((value) => Math.fround(value) === value, {
  message: "a GLfloat input must be a float32 value (Math.fround(x) === x)",
});
const positiveFloat32 = float32.refine((value) => value > 0, {
  message: "must be positive",
});
const float32Vec3 = z.tuple([float32, float32, float32]);

const common = {
  citations: z.array(citation).min(1),
  derivation: z.string().min(1),
  title: z.string().min(1),
  tolerance: nonNegative,
};

/** One party of a collision (`self` or `other`). */
const party = {
  /** World position; for a subentity, its absolute position (11032). */
  position: vec3,
  /** Total velocity, drift plus thrust vector (`ShipEntity.m:11158-11166`). */
  velocity: float32Vec3,
  mass: positiveFloat32,
  energy: float32,
  /**
   * Whether `dam > energy` may set the destroyed flag (11111-11112). True for
   * every NPC; the player fixtures set false (its death is Phase 20's).
   */
  destroyable: z.boolean(),
};

/** One collision fixture. */
export const CollideFixtureSchema = z
  .strictObject({
    id: z.string().regex(COLLIDE_ID, "a collide id starts collide-"),
    ...common,
    /** One tick, seconds: the `[UNIVERSE getTimeDelta]` of the nudge (11138). */
    dt: z.number().positive(),
    self: z.strictObject(party),
    other: z.strictObject({
      ...party,
      /**
       * Null for a whole ship. For a subentity: its parent's total velocity
       * (11057-11070) and whether the parent is frangible (11123-11128). The
       * subentity's own `velocity` is then unused by the C.
       */
      isSubentityOf: z
        .strictObject({
          parentVelocity: float32Vec3,
          frangible: z.boolean(),
        })
        .nullable(),
    }),
    expected: z.strictObject({
      /** `separating` = the `v2b < -1` early return (11080-11081). */
      outcome: z.enum(["separating", "collided"]),
      /** The float line of centres (11032-11033). */
      loc: vec3,
      v2b: finite,
      v1a: finite,
      /** Zero for `separating` (never computed). */
      dam1: nonNegative,
      dam2: nonNegative,
      /** `magnitude2(v) <= 0.1` (11096-11099). */
      antiConjoin: z.boolean(),
      /** `dam1 > 0.05`: self takes scrape damage (11114-11115). */
      applied1: z.boolean(),
      /** `dam2 > 0.05`: the other side takes scrape damage (11123-11128). */
      applied2: z.boolean(),
      /** Who takes dam2: the contacted entity or its parent; null if none. */
      dam2Receiver: z.enum(["other", "otherParent"]).nullable(),
      selfDestroyed: z.boolean(),
      otherDestroyed: z.boolean(),
      /** Net velocity change of self. */
      dv1: vec3,
      /** Net velocity change of the body that moves: the other, or the parent. */
      dvOtherBody: vec3,
      /**
       * Null for a whole-ship other. For a subentity contact, the change Oolite
       * applies to the subentity itself (the selfDestroyed reversal, 11117-
       * 11119); a consumer records it and does not apply it, since an attached
       * subentity has no velocity of its own.
       */
      dvOtherSubentity: vec3.nullable(),
      /** Whether the 10-tick nudge ran (11138-11146). */
      nudged: z.boolean(),
      /** Total displacement of self: the 1 m step (11083) plus the nudge. */
      dp1: vec3,
      /** Displacement of the other whole ship; zero for a subentity contact. */
      dpOther: vec3,
      /**
       * Null for a whole-ship other. For a subentity contact, the nudge Oolite
       * adds to the subentity's own position (11143-11146); the parent does
       * not move.
       */
      dpOtherSubentity: vec3.nullable(),
    }),
  })
  .superRefine((fixture, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };
    const e = fixture.expected;
    const isSub = fixture.other.isSubentityOf !== null;
    if ((e.dvOtherSubentity !== null) !== isSub) {
      issue(
        ["expected", "dvOtherSubentity"],
        "dvOtherSubentity is null exactly for a whole-ship other",
      );
    }
    if ((e.dpOtherSubentity !== null) !== isSub) {
      issue(
        ["expected", "dpOtherSubentity"],
        "dpOtherSubentity is null exactly for a whole-ship other",
      );
    }
    if ((e.dam2Receiver !== null) !== e.applied2) {
      issue(
        ["expected", "dam2Receiver"],
        "dam2 has a receiver exactly when it is applied",
      );
    }
    if (!isSub && e.dam2Receiver === "otherParent") {
      issue(["expected", "dam2Receiver"], "a whole ship has no parent");
    }
    if (e.outcome === "separating") {
      if (e.applied1 || e.applied2 || e.nudged || e.antiConjoin) {
        issue(["expected"], "a separating pair takes no response at all");
      }
      if (e.dam1 !== 0 || e.dam2 !== 0) {
        issue(["expected"], "a separating pair has no damage");
      }
    }
    if (e.nudged && (e.selfDestroyed || e.otherDestroyed)) {
      issue(["expected", "nudged"], "no nudge when either side is destroyed");
    }
    if (!fixture.self.destroyable && e.selfDestroyed) {
      issue(["expected", "selfDestroyed"], "self is not destroyable");
    }
    if (!fixture.other.destroyable && e.otherDestroyed) {
      issue(["expected", "otherDestroyed"], "other is not destroyable");
    }
  });
export type CollideFixture = z.infer<typeof CollideFixtureSchema>;

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

/** A collision fixture file: fixtures with unique ids. */
export const CollideFileSchema = z
  .array(CollideFixtureSchema)
  .min(1)
  .superRefine(uniqueIds);
