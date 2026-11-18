// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The fire-gate oracle fixture contract (Phase 17, plan 17-01) as strict zod
 * schemas: the NPC fire gate (`fireWeapon:direction:range:`), `onTarget:` with
 * `currentAimTolerance`, and the float32 weapon heat trajectories.
 *
 * This file imports `zod` and nothing else: the oracle tree never reads
 * Wegolite code (`tests/guards/oracle-independence.test.ts` enforces that
 * mechanically). Oolite is read at the pin `7437f22`; every line number in the
 * fixtures is a pin line number.
 *
 * Conventions (the plan's fire oracle contract):
 *
 * - Oolite's own frame and units (metres, seconds); `dt` is 1/120 exactly.
 * - Temperatures are float32 values (`Math.fround`; `forward_weapon_temp` is a
 *   `GLfloat`, `ShipEntity.h:304`); every other number is float64. Oolite's
 *   `energy` is a `GLfloat` too (`Entity.h:134`), but the contract keeps it
 *   float64, so an energy compare or a fired-shot energy drop carries the
 *   fixture's `tolerance` and no energy fixture sits within 1e-6 of a refusal
 *   boundary except the equality ones, which are width-independent.
 * - `tolerance` is the absolute tolerance of every non-integer expected value of
 *   a fixture. Booleans, ticks, draw counts and refusal names are exact
 *   whatever the tolerance says.
 * - Ids are kebab-case, unique across every oracle tree, prefixed `gate-`,
 *   `on-target-` or `heat-`.
 * - The scripted unit draws of a gate fixture are `draws`: the gate takes the
 *   first one when it rolls, and `expected.drawsUsed` (0 or 1) says whether it
 *   did. A second, distinct value is always present so a port that draws twice
 *   consumes a different number.
 */

import { z } from "zod";

/** One native update step (1/120 s exactly). */
export const FIRE_ORACLE_DT = 1 / 120;

/** The forward weapons a fixture may name (`equipment.plist` `weapon_info`). */
export const FIRE_WEAPONS = [
  "EQ_WEAPON_PULSE_LASER",
  "EQ_WEAPON_BEAM_LASER",
  "EQ_WEAPON_MINING_LASER",
  "EQ_WEAPON_MILITARY_LASER",
  "EQ_WEAPON_NONE",
] as const;
export type FireWeapon = (typeof FIRE_WEAPONS)[number];

/** The armed lasers (a heat fixture never names the unarmed weapon). */
export const FIRE_ARMED_WEAPONS = [
  "EQ_WEAPON_PULSE_LASER",
  "EQ_WEAPON_BEAM_LASER",
  "EQ_WEAPON_MINING_LASER",
  "EQ_WEAPON_MILITARY_LASER",
] as const;

/**
 * Where the gate refuses, in Oolite's order (`ShipEntity.m:9933-9993`): the
 * first three refuse with no draw; the roll, the range and `onTarget` refuse
 * after exactly one draw; `noWeapon` is "every check passed but
 * `isWeaponNone`" (9958), also after one draw.
 */
export const FIRE_REFUSALS = [
  "heat",
  "energy",
  "timer",
  "roll",
  "range",
  "onTarget",
  "noWeapon",
] as const;
export type FireRefusal = (typeof FIRE_REFUSALS)[number];

/** The refusals that happen before the draw. */
export const FIRE_REFUSALS_BEFORE_DRAW: readonly FireRefusal[] = [
  "heat",
  "energy",
  "timer",
];

const GATE_ID = /^gate-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ON_TARGET_ID = /^on-target-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEAT_ID = /^heat-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

/** The frame tolerance of the oracle contract (unit, orthogonal, handed). */
export const FIRE_FRAME_TOLERANCE = 1e-9;

const finite = z.number();
const nonNegative = z.number().min(0);
const vec3 = z.tuple([finite, finite, finite]);

/** A float32 value: `Math.fround(x) === x`. */
const float32 = z.number().refine((value) => Math.fround(value) === value, {
  message: "a temperature must be a float32 value (Math.fround(x) === x)",
});

const common = {
  oolite: z.array(citation).min(1),
  derivation: z.string().min(1),
  title: z.string().min(1),
  tolerance: nonNegative,
};

/** The scripted unit draws: two distinct values in [0, 1). */
const draws = z
  .array(z.number().min(0).lt(1))
  .length(2)
  .refine((values) => values[0] !== values[1], {
    message: "the two scripted draws must be distinct",
  });

/** One gate fixture (contract item 3). */
export const FireGateFixtureSchema = z
  .strictObject({
    id: z.string().regex(GATE_ID, "a gate id is kebab-case and starts gate-"),
    ...common,
    weapon: z.enum(FIRE_WEAPONS),
    input: z.strictObject({
      temperature: float32.refine((value) => value >= 0, {
        message: "a temperature is not negative",
      }),
      energy: finite,
      /** Whole 1/120 s ticks since the last fired shot; null = never fired. */
      ticksSinceShot: z.number().int().min(0).nullable(),
      accuracy: z.number().min(-5).max(10),
      range: nonNegative,
      onTarget: z.boolean(),
    }),
    draws,
    expected: z.strictObject({
      fired: z.boolean(),
      refusedAt: z.enum(FIRE_REFUSALS).nullable(),
      drawsUsed: z.union([z.literal(0), z.literal(1)]),
      energyAfter: finite,
      temperatureAfter: float32.refine((value) => value >= 0, {
        message: "a temperature is not negative",
      }),
      shotTimerReset: z.boolean(),
    }),
  })
  .superRefine((fixture, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };
    const { fired, refusedAt, drawsUsed, shotTimerReset } = fixture.expected;
    if (fired && refusedAt !== null) {
      issue(["expected", "refusedAt"], "a fired shot has no refusal");
    }
    if (!fired && refusedAt === null) {
      issue(["expected", "refusedAt"], "a shot that did not fire names where");
    }
    if (fired && drawsUsed !== 1) {
      issue(["expected", "drawsUsed"], "a fired shot took exactly one draw");
    }
    if (refusedAt !== null) {
      const before = FIRE_REFUSALS_BEFORE_DRAW.includes(refusedAt);
      if (before && drawsUsed !== 0) {
        issue(
          ["expected", "drawsUsed"],
          "a refusal at heat, energy or timer takes no draw",
        );
      }
      if (!before && drawsUsed !== 1) {
        issue(
          ["expected", "drawsUsed"],
          "a refusal at roll, range, onTarget or noWeapon follows one draw",
        );
      }
    }
    if (shotTimerReset !== fired) {
      issue(["expected", "shotTimerReset"], "the timer resets only on a shot");
    }
  });
export type FireGateFixture = z.infer<typeof FireGateFixtureSchema>;

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

/** A gate fixture file: fixtures with unique ids. */
export const FireGateFileSchema = z
  .array(FireGateFixtureSchema)
  .min(1)
  .superRefine(uniqueIds);

type Vec3 = readonly [number, number, number];

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Frame problems of one pose: unit, orthogonal and right x up = forward. */
export function frameProblems(pose: {
  readonly forward: Vec3;
  readonly up: Vec3;
  readonly right: Vec3;
}): string[] {
  const problems: string[] = [];
  const axes: readonly [string, Vec3][] = [
    ["forward", pose.forward],
    ["up", pose.up],
    ["right", pose.right],
  ];
  for (const [name, axis] of axes) {
    if (Math.abs(Math.sqrt(dot3(axis, axis)) - 1) > FIRE_FRAME_TOLERANCE) {
      problems.push(`${name} is not a unit vector`);
    }
  }
  const pairs: readonly [string, Vec3, Vec3][] = [
    ["forward.up", pose.forward, pose.up],
    ["forward.right", pose.forward, pose.right],
    ["up.right", pose.up, pose.right],
  ];
  for (const [name, a, b] of pairs) {
    if (Math.abs(dot3(a, b)) > FIRE_FRAME_TOLERANCE) {
      problems.push(`${name} are not orthogonal`);
    }
  }
  const handed = cross3(pose.right, pose.up);
  for (let i = 0; i < 3; i += 1) {
    const expected = pose.forward[i];
    const actual = handed[i];
    if (
      expected === undefined ||
      actual === undefined ||
      Math.abs(actual - expected) > FIRE_FRAME_TOLERANCE
    ) {
      problems.push("right x up is not forward");
      break;
    }
  }
  return problems;
}

/** One on-target fixture (contract item 5). */
export const OnTargetFixtureSchema = z
  .strictObject({
    id: z
      .string()
      .regex(ON_TARGET_ID, "an on-target id is kebab-case, prefix on-target-"),
    ...common,
    input: z.strictObject({
      accuracy: z.number().min(-5).max(10),
      /** `_missed_shots` of the shooter (`ShipEntity.m:10468-10487`). */
      missedShots: z.number().int().min(0),
      position: vec3,
      forward: vec3,
      up: vec3,
      right: vec3,
      /** Is `primaryTarget` a live ship? */
      targetPresent: z.boolean(),
      /** `calculateTargetPosition` (`ShipEntity.m:5412-5423`). */
      aimPoint: vec3,
      /** The target's `collision_radius`. */
      targetRadius: z.number().positive(),
    }),
    expected: z.strictObject({
      aimTolerance: z.number().gt(0).lt(1),
      onTarget: z.boolean(),
    }),
  })
  .superRefine((fixture, ctx) => {
    for (const problem of frameProblems(fixture.input)) {
      ctx.addIssue({ code: "custom", path: ["input"], message: problem });
    }
  });
export type OnTargetFixture = z.infer<typeof OnTargetFixtureSchema>;

/** An on-target fixture file: fixtures with unique ids. */
export const OnTargetFileSchema = z
  .array(OnTargetFixtureSchema)
  .min(1)
  .superRefine(uniqueIds);

/** The longest heat run a fixture may replay. */
export const FIRE_HEAT_MAX_HORIZON = 20000;

/** One heat and cooling trajectory (contract item 6). */
export const WeaponHeatFixtureSchema = z
  .strictObject({
    id: z.string().regex(HEAT_ID, "a heat id is kebab-case, prefix heat-"),
    ...common,
    weapon: z.enum(FIRE_ARMED_WEAPONS),
    /** The temperature the gate reads at tick 1 (a float32 value). */
    startTemperature: float32.refine((value) => value >= 0, {
      message: "a temperature is not negative",
    }),
    /** Ticks since the last shot at tick 1; null = never fired. */
    startTicksSinceShot: z.number().int().min(0).nullable(),
    horizon: z.number().int().min(1).max(FIRE_HEAT_MAX_HORIZON),
    expected: z.strictObject({
      /** Every tick at which the gate fires, ascending. */
      shotTicks: z.array(z.number().int().min(1)),
      /** The temperature the gate reads at the listed ticks (after cooling). */
      temperatureChecks: z
        .array(
          z.strictObject({
            tick: z.number().int().min(1),
            temperature: float32.refine((value) => value >= 0, {
              message: "a temperature is not negative",
            }),
          }),
        )
        .min(1),
      /** First tick the cutout refuses; null when it never does. */
      firstHeatRefusalTick: z.number().int().min(1).nullable(),
      /** First tick after that refusal at which the gate fires again. */
      firstResumeTick: z.number().int().min(1).nullable(),
      drawsUsed: z.number().int().min(0),
    }),
  })
  .superRefine((fixture, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };
    const { shotTicks, temperatureChecks, firstHeatRefusalTick } =
      fixture.expected;
    const { firstResumeTick, drawsUsed } = fixture.expected;
    let previous = 0;
    shotTicks.forEach((tick, index) => {
      if (tick > fixture.horizon) {
        issue(["expected", "shotTicks", index], "shot tick beyond the horizon");
      }
      if (tick <= previous) {
        issue(["expected", "shotTicks", index], "shot ticks are ascending");
      }
      previous = tick;
    });
    let previousCheck = 0;
    temperatureChecks.forEach((check, index) => {
      if (check.tick > fixture.horizon) {
        issue(
          ["expected", "temperatureChecks", index, "tick"],
          "check tick beyond the horizon",
        );
      }
      if (check.tick <= previousCheck) {
        issue(
          ["expected", "temperatureChecks", index, "tick"],
          "check ticks are ascending",
        );
      }
      previousCheck = check.tick;
    });
    if (
      firstHeatRefusalTick !== null &&
      firstHeatRefusalTick > fixture.horizon
    ) {
      issue(["expected", "firstHeatRefusalTick"], "refusal beyond the horizon");
    }
    if (firstHeatRefusalTick === null && firstResumeTick !== null) {
      issue(["expected", "firstResumeTick"], "no refusal, so nothing resumes");
    }
    if (
      firstHeatRefusalTick !== null &&
      firstResumeTick !== null &&
      firstResumeTick <= firstHeatRefusalTick
    ) {
      issue(["expected", "firstResumeTick"], "resume follows the refusal");
    }
    if (firstResumeTick !== null && !shotTicks.includes(firstResumeTick)) {
      issue(["expected", "firstResumeTick"], "the resume tick is a shot tick");
    }
    if (drawsUsed !== shotTicks.length) {
      issue(
        ["expected", "drawsUsed"],
        "every tick that passes the three pre-draw checks takes one draw and, " +
          "at range 0 with onTarget true, fires: draws equal shots",
      );
    }
  });
export type WeaponHeatFixture = z.infer<typeof WeaponHeatFixtureSchema>;

/** A heat fixture file: fixtures with unique ids. */
export const WeaponHeatFileSchema = z
  .array(WeaponHeatFixtureSchema)
  .min(1)
  .superRefine(uniqueIds);
