// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The fire-site oracle fixture contract (Phase 17, plan 17-02) as zod schemas.
 *
 * Two fixture kinds, both wrapping an unchanged Phase 14 `OracleFixtureSchema`
 * object (frames, in-tick order, scripted draws, checks, events, horizon and
 * tolerances are exactly those of every Phase 14 fixture):
 *
 * - a fire-site fixture, `{ fixture, weapon, fireRequestTicks }`, states the
 *   forward weapon temperature the behaviour reads at update 1 and the
 *   `missedShots` count, and lists every update (1-based) at which the
 *   behaviour reaches a `fireMainWeapon:` call, whatever the gate would decide.
 *   No shot fires during a fixture: the gate is another oracle's subject.
 * - an aim-feedback fixture, `{ fixture, weapon }`, carries only `missedShots`
 *   (temperature 0) and checks the tracking and aim-tolerance terms it feeds.
 *
 * `forwardWeaponTemp` is `forward_weapon_temp` as the behaviour reads it at
 * update 1, that is after Oolite's cooling at the top of that update
 * (`ShipEntity.m:2214-2218`). At update k the behaviour reads the value cooled
 * k - 1 more times in float32.
 *
 * This file imports `zod` and the Phase 14 contract only: the oracle tree never
 * reads Wegolite code (`tests/guards/oracle-independence.test.ts`).
 */

import { z } from "zod";

import { ORACLE_BEHAVIOURS, OracleFixtureSchema } from "../schema.js";

/**
 * The behaviours a fire-site or aim-feedback fixture may start in: the
 * Phase 14 attack IN list plus flee (whose turret-only call is unreachable and
 * is covered as a "requests nothing" site).
 */
export const FIRE_SITE_START_BEHAVIOURS = [
  "ATTACK_TARGET",
  "ATTACK_FLY_TO_TARGET",
  "ATTACK_FLY_FROM_TARGET",
  "ATTACK_FLY_TO_TARGET_SIX",
  "ATTACK_FLY_TO_TARGET_TWELVE",
  "ATTACK_SNIPER",
  "ATTACK_BREAK_OFF_TARGET",
  "ATTACK_SLOW_DOGFIGHT",
  "EVASIVE_ACTION",
  "FLEE_EVASIVE_ACTION",
  "FLEE_TARGET",
] as const satisfies readonly (typeof ORACLE_BEHAVIOURS)[number][];

const START_BEHAVIOURS: ReadonlySet<string> = new Set(
  FIRE_SITE_START_BEHAVIOURS,
);

/** The id prefixes of the three fixture families (contract item 1). */
export const FIRE_SITE_ID_PREFIXES = ["fire-site-", "hot-"] as const;
export const AIM_FEEDBACK_ID_PREFIX = "aim-feedback-";

const float32Temperature = z
  .number()
  .min(0)
  .refine(
    (value) => Math.fround(value) === value,
    "forwardWeaponTemp is a float32 value",
  );

const missedShots = z.number().int().min(0);

/** One fire-site fixture (contract items 1 to 4). */
export const FireSiteFixtureSchema = z
  .strictObject({
    fixture: OracleFixtureSchema,
    weapon: z.strictObject({
      forwardWeaponTemp: float32Temperature,
      missedShots,
    }),
    fireRequestTicks: z.array(z.number().int().min(1)),
  })
  .superRefine((entry, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };
    const { id, horizon, self } = entry.fixture;
    if (!FIRE_SITE_ID_PREFIXES.some((prefix) => id.startsWith(prefix))) {
      issue(["fixture", "id"], "a fire-site id starts with fire-site- or hot-");
    }
    if (!START_BEHAVIOURS.has(self.behaviour)) {
      issue(["fixture", "self", "behaviour"], "not a fire-site behaviour");
    }
    let previous = 0;
    entry.fireRequestTicks.forEach((tick, index) => {
      if (tick > horizon) {
        issue(
          ["fireRequestTicks", index],
          "a request tick is beyond the horizon",
        );
      }
      if (tick <= previous) {
        issue(["fireRequestTicks", index], "request ticks strictly ascend");
      }
      previous = tick;
    });
  });
export type FireSiteFixture = z.infer<typeof FireSiteFixtureSchema>;

/** One aim-feedback fixture (contract items 1 and 3): temperature 0, only `missedShots`. */
export const AimFeedbackFixtureSchema = z
  .strictObject({
    fixture: OracleFixtureSchema,
    weapon: z.strictObject({ missedShots }),
  })
  .superRefine((entry, ctx) => {
    const { id, self } = entry.fixture;
    if (!id.startsWith(AIM_FEEDBACK_ID_PREFIX)) {
      ctx.addIssue({
        code: "custom",
        path: ["fixture", "id"],
        message: "an aim-feedback id starts with aim-feedback-",
      });
    }
    if (!START_BEHAVIOURS.has(self.behaviour)) {
      ctx.addIssue({
        code: "custom",
        path: ["fixture", "self", "behaviour"],
        message: "not a fire-site behaviour",
      });
    }
  });
export type AimFeedbackFixture = z.infer<typeof AimFeedbackFixtureSchema>;

function uniqueByFixtureId(
  entries: readonly { fixture: { id: string } }[],
  ctx: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    if (ids.has(entry.fixture.id)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "fixture", "id"],
        message: `duplicate fixture id ${entry.fixture.id}`,
      });
    }
    ids.add(entry.fixture.id);
  });
}

/** A fire-site fixture file: ids unique by the embedded fixture id. */
export const FireSiteFileSchema = z
  .array(FireSiteFixtureSchema)
  .min(1)
  .superRefine(uniqueByFixtureId);

/** An aim-feedback fixture file: ids unique by the embedded fixture id. */
export const AimFeedbackFileSchema = z
  .array(AimFeedbackFixtureSchema)
  .min(1)
  .superRefine(uniqueByFixtureId);
