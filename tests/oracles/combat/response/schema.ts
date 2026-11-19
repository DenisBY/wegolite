// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The response oracle fixture contract (Phase 18, plan 18-03) as strict zod
 * schemas: `collideWithShip`'s damage and velocity response
 * (`ShipEntity.m:11020-11152`), the drift braking of the player
 * (`PlayerEntity.m:3372-3405`) and of ships (`ShipEntity.m:5808-5823`), the
 * player's scrape through the shields (`PlayerEntity.m:5701-5753`) and the
 * explosion blast (`ShipEntity.m:7680-7698, 8114-8126`).
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
 * - `tolerance` is the relative tolerance of every non-integer expected value
 *   of a fixture: a value `a` matches the expected `b` when
 *   `|a - b| <= tolerance x |b| + ABSOLUTE_FLOOR` (1e-9, so an exact zero
 *   needs no relative slack). Every fixture here uses 1e-6: wide enough for
 *   a port that rounds differently by a few float ulps, far too narrow for a
 *   wrong formula, branch or factor. Booleans, ticks, branch names and
 *   receivers are exact whatever the tolerance says.
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
/** The player braking fixture file, relative to this directory. */
export const BRAKING_PLAYER_FIXTURE_FILE = "fixtures/braking-player.json";
/** The ship and buoy braking fixture file, relative to this directory. */
export const BRAKING_NPC_FIXTURE_FILE = "fixtures/braking-npc.json";
/** The scrape fixture file, relative to this directory. */
export const SCRAPE_FIXTURE_FILE = "fixtures/scrape.json";
/** The blast fixture file, relative to this directory. */
export const BLAST_FIXTURE_FILE = "fixtures/blast.json";

const COLLIDE_ID = /^collide-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BRAKE_ID = /^brake-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRAPE_ID = /^scrape-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLAST_ID = /^blast-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

/** The absolute slack added to every relative compare (see `tolerance`). */
export const ABSOLUTE_FLOOR = 1e-9;

/** `|actual - expected| <= tolerance x |expected| + ABSOLUTE_FLOOR`. */
export function withinTolerance(
  actual: number,
  expected: number,
  tolerance: number,
): boolean {
  return (
    Math.abs(actual - expected) <=
    tolerance * Math.abs(expected) + ABSOLUTE_FLOOR
  );
}

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

// ---------------------------------------------------------------------------
// braking (D-02)

/** One sample of a braking run: the drift speed after a tick's update. */
const brakeSample = z.strictObject({
  tick: z.number().int().min(1),
  /** |velocity| after the tick, the double magnitude of the float vector. */
  speed: nonNegative,
});

/**
 * One braking fixture: `kind: "player"` follows `PlayerEntity.m:3372-3405`
 * (applyVelocity first, then braking by raw `thrust` x the thrust factor and
 * the cleanup term); `kind: "ship"` follows `ShipEntity.m:5808-5823` (braking
 * by `SHIP_THRUST_FACTOR x thrust` only when thrust is non-zero) and then
 * `applyVelocity` (`Entity.m:878-881`).
 */
export const BrakingFixtureSchema = z
  .strictObject({
    id: z.string().regex(BRAKE_ID, "a braking id starts brake-"),
    ...common,
    kind: z.enum(["player", "ship"]),
    dt: z.number().positive(),
    /** The initial drift (the `velocity` ivar, not the thrust vector). */
    velocity: float32Vec3,
    /** Player only: `flightSpeed` (the forward speed), else null. */
    speed: float32.nullable(),
    /** Player only: `maxFlightSpeed`, else null. */
    maxSpeed: float32.nullable(),
    /** Player only: the variable torus factor, 32..1024 (`PlayerEntity.h:294-300`). */
    torusFactor: float32
      .refine((value) => value >= 32 && value <= 1024, {
        message: "the torus factor is 32..1024",
      })
      .nullable(),
    /** The shipdata `thrust` (raw, before any factor). */
    thrust: float32.refine((value) => value >= 0, { message: "thrust >= 0" }),
    /** Ticks simulated. */
    ticks: z.number().int().min(1),
    expected: z.strictObject({
      /**
       * The thrust term per tick: the player's f(f(f(dt) x thrust) x factor),
       * a ship's dt_thrust = f(f(5 x thrust) x dt).
       */
      perTickLoss: nonNegative,
      /** The speed lost on tick 1, cleanup term included. */
      firstTickLoss: nonNegative,
      samples: z.array(brakeSample).min(1),
      /** Position change over all `ticks`. */
      positionChange: vec3,
      /** The drift after the last tick. */
      finalVelocity: vec3,
      /** The first tick that leaves the drift at zero; null if none. */
      stopTick: z.number().int().min(1).nullable(),
    }),
  })
  .superRefine((fixture, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };
    const playerOnly = [
      fixture.speed,
      fixture.maxSpeed,
      fixture.torusFactor,
    ].every((value) => value !== null);
    const noneSet = [
      fixture.speed,
      fixture.maxSpeed,
      fixture.torusFactor,
    ].every((value) => value === null);
    if (fixture.kind === "player" && !playerOnly) {
      issue(["kind"], "a player fixture sets speed, maxSpeed and torusFactor");
    }
    if (fixture.kind === "ship" && !noneSet) {
      issue(["kind"], "a ship fixture leaves the player-only fields null");
    }
    for (const sample of fixture.expected.samples) {
      if (sample.tick > fixture.ticks) {
        issue(["expected", "samples"], "a sample lies beyond the run");
      }
    }
    const stop = fixture.expected.stopTick;
    if (stop !== null && stop > fixture.ticks) {
      issue(["expected", "stopTick"], "the stop tick lies beyond the run");
    }
  });
export type BrakingFixture = z.infer<typeof BrakingFixtureSchema>;

/** A braking fixture file: fixtures with unique ids. */
export const BrakingFileSchema = z
  .array(BrakingFixtureSchema)
  .min(1)
  .superRefine(uniqueIds);

// ---------------------------------------------------------------------------
// the player's scrape (PlayerEntity.m:5701-5753)

/**
 * One scrape fixture: the player takes `amount` of scrape damage from an
 * entity at `otherOffset` (the other's position minus the player's). The
 * shield on the other's side absorbs first, the remainder lowers energy
 * (`ShipEntity.m:11641-11653`); no cabin heat. The internal-damage loop
 * (5746-5752) is Phase 19's and is not modelled; no fixture reaches a death.
 */
export const ScrapeFixtureSchema = z
  .strictObject({
    id: z.string().regex(SCRAPE_ID, "a scrape id starts scrape-"),
    ...common,
    /** The `double` amount passed to takeScrapeDamage:from:. */
    amount: finite,
    otherOffset: vec3,
    /** The player's `v_forward`, a unit float vector. */
    forward: float32Vec3,
    shields: z.strictObject({ forward: float32, aft: float32 }),
    energy: float32,
    expected: z.strictObject({
      /** dot_product(HPVectorToVector(rel_pos), v_forward), float. */
      dForward: finite,
      shieldHit: z.enum(["forward", "aft"]),
      shields: z.strictObject({ forward: nonNegative, aft: nonNegative }),
      /** What the shield did not absorb, handed to energy. */
      remainder: nonNegative,
      energy: z.number().positive(),
      heatChange: z.literal(0),
    }),
  })
  .superRefine((fixture, ctx) => {
    const e = fixture.expected;
    if ((e.shieldHit === "forward") !== e.dForward >= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["expected", "shieldHit"],
        message: "d_forward >= 0 hits the forward shield, else the aft",
      });
    }
  });
export type ScrapeFixture = z.infer<typeof ScrapeFixtureSchema>;

/** A scrape fixture file: fixtures with unique ids. */
export const ScrapeFileSchema = z
  .array(ScrapeFixtureSchema)
  .min(1)
  .superRefine(uniqueIds);

// ---------------------------------------------------------------------------
// the explosion blast (D-03)

const blastBody = z.strictObject({
  name: z.string().min(1),
  /** World position (double). */
  position: vec3,
  mass: positiveFloat32,
  /** Collision radius. */
  radius: positiveFloat32,
});

/** One victim's push on one receiver. */
const blastContribution = z.strictObject({
  /** `HPdistance2 < (range + r_receiver)^2` (`Universe.m:5862-5868`). */
  inRange: z.boolean(),
  /** |p|^2 - r_receiver^2, floored at 0.1; null out of range. */
  d2: z.number().min(0.1).nullable(),
  /** Whether d2 took the 0.1 floor (7688-7690). */
  floored: z.boolean(),
  /** amount x desired_range / d2 (7691); null out of range. */
  moment: nonNegative.nullable(),
  /** The velocity change (11178-11181); null out of range. */
  dv: vec3.nullable(),
});

/**
 * One blast fixture: the exploding bodies (`victims`, in the C's order: a
 * subentity explodes before its parent, 8114-8126) and the receivers, every
 * one with its mass and collision radius.
 */
export const BlastFixtureSchema = z
  .strictObject({
    id: z.string().regex(BLAST_ID, "a blast id starts blast-"),
    ...common,
    victims: z.array(blastBody).min(1),
    receivers: z.array(blastBody).min(1),
    expected: z.strictObject({
      victims: z.array(
        z.strictObject({
          /** f(collision_radius x 2.5f) (8124). */
          desiredRange: z.number().positive(),
          /** f(0.125f x mass) (8125). */
          amount: z.number().positive(),
        }),
      ),
      receivers: z.array(
        z.strictObject({
          /** The sum over victims; null if no victim reached the receiver. */
          dv: vec3.nullable(),
          contributions: z.array(blastContribution),
        }),
      ),
    }),
  })
  .superRefine((fixture, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };
    const e = fixture.expected;
    if (e.victims.length !== fixture.victims.length) {
      issue(["expected", "victims"], "one entry per victim");
    }
    if (e.receivers.length !== fixture.receivers.length) {
      issue(["expected", "receivers"], "one entry per receiver");
    }
    e.receivers.forEach((receiver, i) => {
      if (receiver.contributions.length !== fixture.victims.length) {
        issue(["expected", "receivers", i], "one contribution per victim");
      }
      const reached = receiver.contributions.some((c) => c.inRange);
      if (reached !== (receiver.dv !== null)) {
        issue(
          ["expected", "receivers", i, "dv"],
          "dv is null exactly when no victim reached",
        );
      }
      receiver.contributions.forEach((c, j) => {
        const nulls = [c.d2, c.moment, c.dv].every((value) => value === null);
        const set = [c.d2, c.moment, c.dv].every((value) => value !== null);
        if (c.inRange ? !set : !nulls || c.floored) {
          issue(
            ["expected", "receivers", i, "contributions", j],
            "an out-of-range contribution is all null, an in-range one all set",
          );
        }
      });
    });
  });
export type BlastFixture = z.infer<typeof BlastFixtureSchema>;

/** A blast fixture file: fixtures with unique ids. */
export const BlastFileSchema = z
  .array(BlastFixtureSchema)
  .min(1)
  .superRefine(uniqueIds);
