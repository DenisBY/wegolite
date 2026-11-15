// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The oracle fixture contract (Phase 14, plan 14-01) as executable zod schemas.
 *
 * This file is the only shape every NPC oracle fixture must have. It imports
 * `zod` and nothing else: the oracle tree never reads Wegolite code
 * (`tests/guards/oracle-independence.test.ts` enforces that mechanically).
 *
 * Conventions fixed here so every fixture author and every consumer agrees:
 *
 * - A vector is a three-number array `[x, y, z]` in Oolite's world frame (a
 *   ship's forward is its local +Z; forward, up and right are unit,
 *   orthogonal within 1e-9, and right x up = forward).
 * - An entity id of 0 means "none" (no target, no leader, no proximity alert).
 *   Real ids are the player 100, statics 1 to 5, self 101, other ships 102 and
 *   up.
 * - `escortSlot` is a non-negative integer and only meaningful when `ownerId`
 *   names a leader.
 * - `expected` of a `behaviour` check is a BEHAVIOUR name without its prefix;
 *   every other field is a number.
 * - Discrete fields (`behaviour`, `targetId`, `proximityAlert`,
 *   `pitchingOver`) carry tolerance 0.
 */

import { z } from "zod";

/** The two step sizes of the contract. 1/60 is allowed only for `rate-` ids. */
export const ORACLE_DT = 1 / 120;
export const ORACLE_DT_60 = 1 / 60;

/** The fixture contract's frame tolerance (item 3). */
export const ORACLE_FRAME_TOLERANCE = 1e-9;

/** Closed field list (contract item 5), Oolite variable semantics. */
export const ORACLE_FIELDS = [
  "flightSpeed",
  "flightRoll",
  "flightPitch",
  "stickRoll",
  "stickPitch",
  "desiredSpeed",
  "desiredRange",
  "frustration",
  "successFactor",
  "pitchingOver",
  "accuracy",
  "behaviour",
  "targetId",
  "proximityAlert",
  "rangeToDestination",
  "rangeToTarget",
  "headingErrorDestination",
  "headingErrorTarget",
  "positionX",
  "positionY",
  "positionZ",
  "forwardX",
  "forwardY",
  "forwardZ",
  "upX",
  "upY",
  "upZ",
  "jinkX",
  "jinkY",
  "jinkZ",
  "destinationX",
  "destinationY",
  "destinationZ",
  "aimPointX",
  "aimPointY",
  "aimPointZ",
] as const;
export type OracleField = (typeof ORACLE_FIELDS)[number];

/** Fields compared exactly (tolerance 0). */
export const ORACLE_DISCRETE_FIELDS = [
  "behaviour",
  "targetId",
  "proximityAlert",
  "pitchingOver",
] as const satisfies readonly OracleField[];

/** The closed list of events the steering posts (contract item 2). */
export const ORACLE_EVENT_NAMES = [
  "shipAchievedDesiredRange",
  "shipNowFacingDestination",
  "shipAIFrustrated",
  "shipTargetLost",
] as const;
export type OracleEventName = (typeof ORACLE_EVENT_NAMES)[number];

/** The ShipControl calls `assign` may carry (contract item 2). */
export const ORACLE_ASSIGN_OPS = [
  "setTarget",
  "setDestination",
  "setDesiredRange",
  "setDesiredSpeed",
  "perform",
] as const;

/**
 * Oolite's BEHAVIOUR names without the prefix, in the order of
 * `src/Core/Tables/OOBehaviour.tbl` (39 entries).
 */
export const ORACLE_BEHAVIOURS = [
  "IDLE",
  "TRACK_TARGET",
  "TUMBLE",
  "STOP_STILL",
  "STATION_KEEPING",
  "ATTACK_TARGET",
  "ATTACK_FLY_TO_TARGET",
  "ATTACK_FLY_FROM_TARGET",
  "RUNNING_DEFENSE",
  "FLEE_TARGET",
  "ATTACK_FLY_TO_TARGET_SIX",
  "ATTACK_MINING_TARGET",
  "EVASIVE_ACTION",
  "FLEE_EVASIVE_ACTION",
  "ATTACK_BREAK_OFF_TARGET",
  "ATTACK_SLOW_DOGFIGHT",
  "ATTACK_FLY_TO_TARGET_TWELVE",
  "ATTACK_SNIPER",
  "ATTACK_BROADSIDE",
  "ATTACK_BROADSIDE_LEFT",
  "ATTACK_BROADSIDE_RIGHT",
  "CLOSE_TO_BROADSIDE_RANGE",
  "CLOSE_WITH_TARGET",
  "AVOID_COLLISION",
  "TRACK_AS_TURRET",
  "FLY_RANGE_FROM_DESTINATION",
  "FLY_TO_DESTINATION",
  "FLY_FROM_DESTINATION",
  "FACE_DESTINATION",
  "FLY_THRU_NAVPOINTS",
  "LAND_ON_PLANET",
  "COLLECT_TARGET",
  "INTERCEPT_TARGET",
  "FORMATION_FORM_UP",
  "FORMATION_BREAK",
  "ENERGY_BOMB_COUNTDOWN",
  "TRACTORED",
  "SCRIPTED_AI",
  "SCRIPTED_ATTACK_AI",
] as const;
export type OracleBehaviour = (typeof ORACLE_BEHAVIOURS)[number];

/** Oolite's scan classes (`src/Core/Tables/OOScanClass.tbl`). */
export const ORACLE_SCAN_CLASSES = [
  "CLASS_NOT_SET",
  "CLASS_NO_DRAW",
  "CLASS_NEUTRAL",
  "CLASS_STATION",
  "CLASS_TARGET",
  "CLASS_CARGO",
  "CLASS_MISSILE",
  "CLASS_ROCK",
  "CLASS_MINE",
  "CLASS_THARGOID",
  "CLASS_BUOY",
  "CLASS_VISUAL_EFFECT",
  "CLASS_WORMHOLE",
  "CLASS_PLAYER",
  "CLASS_POLICE",
  "CLASS_MILITARY",
] as const;

export const ORACLE_FORWARD_WEAPONS = [
  "EQ_WEAPON_NONE",
  "EQ_WEAPON_PULSE_LASER",
  "EQ_WEAPON_BEAM_LASER",
  "EQ_WEAPON_MINING_LASER",
  "EQ_WEAPON_MILITARY_LASER",
] as const;

export const ORACLE_BODY_KINDS = [
  "ship",
  "player",
  "station",
  "planet",
  "sun",
  "buoy",
] as const;

/** The id of the one steered ship (contract item 2). */
export const ORACLE_SELF_ID = 101;
/** The id of the player body. */
export const ORACLE_PLAYER_ID = 100;

const FIXTURE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CITATION =
  /^(?:src\/Core|Resources)\/[A-Za-z0-9_./-]+:([1-9]\d*)-([1-9]\d*)$/;

const finite = z.number();
const vec3 = z.tuple([finite, finite, finite]);
const positive = z.number().positive();
const entityId = z.number().int().min(0);

/** A citation `<path>:<a>-<b>` into the pinned Oolite tree (commit 7437f22). */
const citation = z
  .string()
  .regex(CITATION, "citation must be src/Core/... or Resources/... :a-b")
  .refine((value) => {
    const match = CITATION.exec(value);
    if (match === null) return false;
    return Number(match[1]) <= Number(match[2]);
  }, "citation range must have a <= b");

const stats = z.strictObject({
  maxFlightSpeed: positive,
  maxFlightRoll: positive,
  maxFlightPitch: positive,
  thrust: positive,
  mass: positive,
  forwardWeapon: z.enum(ORACLE_FORWARD_WEAPONS),
  scannerRange: positive,
});

const self = z.strictObject({
  id: z.literal(ORACLE_SELF_ID),
  scanClass: z.enum(ORACLE_SCAN_CLASSES),
  radius: positive,
  position: vec3,
  forward: vec3,
  up: vec3,
  right: vec3,
  speed: finite,
  flightRoll: finite,
  flightPitch: finite,
  stickRoll: finite,
  stickPitch: finite,
  accuracy: z.number().min(-5).max(10),
  frustration: finite,
  successFactor: finite,
  pitchingOver: z.union([z.literal(0), z.literal(1)]),
  jink: vec3,
  behaviour: z.enum(ORACLE_BEHAVIOURS),
  targetId: entityId,
  destination: vec3,
  desiredRange: finite,
  desiredSpeed: finite,
  ownerId: entityId,
  escortSlot: z.number().int().min(0),
});

const body = z.strictObject({
  id: z.number().int().min(1),
  kind: z.enum(ORACLE_BODY_KINDS),
  scanClass: z.enum(ORACLE_SCAN_CLASSES),
  radius: positive,
  mass: positive,
  position: vec3,
  forward: vec3,
  up: vec3,
  right: vec3,
  speed: finite,
  behaviour: z.enum(ORACLE_BEHAVIOURS),
  targetId: entityId,
});

const assignment = z.strictObject({
  op: z.enum(ORACLE_ASSIGN_OPS),
  value: z.union([finite, z.string(), vec3]),
});

const check = z.strictObject({
  tick: z.number().int().min(0),
  field: z.enum(ORACLE_FIELDS),
  expected: z.union([finite, z.string()]),
  tolerance: z.number().min(0),
  note: z.string().min(1),
});

const event = z.strictObject({
  tick: z.number().int().min(1),
  name: z.enum(ORACLE_EVENT_NAMES),
});

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
function frameProblems(pose: {
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
    if (Math.abs(Math.sqrt(dot3(axis, axis)) - 1) > ORACLE_FRAME_TOLERANCE) {
      problems.push(`${name} is not a unit vector`);
    }
  }
  const pairs: readonly [string, Vec3, Vec3][] = [
    ["forward.up", pose.forward, pose.up],
    ["forward.right", pose.forward, pose.right],
    ["up.right", pose.up, pose.right],
  ];
  for (const [name, a, b] of pairs) {
    if (Math.abs(dot3(a, b)) > ORACLE_FRAME_TOLERANCE) {
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
      Math.abs(actual - expected) > ORACLE_FRAME_TOLERANCE
    ) {
      problems.push("right x up is not forward");
      break;
    }
  }
  return problems;
}

const DISCRETE = new Set<string>(ORACLE_DISCRETE_FIELDS);
const INTEGER_FIELDS = new Set<string>([
  "targetId",
  "proximityAlert",
  "pitchingOver",
]);
const BEHAVIOUR_SET = new Set<string>(ORACLE_BEHAVIOURS);

/** One fixture (contract item 2), strict, with every cross-field rule. */
export const OracleFixtureSchema = z
  .strictObject({
    id: z.string().regex(FIXTURE_ID, "id must be kebab-case"),
    title: z.string().min(1),
    oolite: z.array(citation).min(1),
    derivation: z.string().min(1),
    dt: z.union([z.literal(ORACLE_DT), z.literal(ORACLE_DT_60)]),
    horizon: z.number().int().min(1).max(36000),
    stats,
    self,
    bodies: z.array(body),
    motion: z.enum(["static", "constant-velocity"]),
    assign: z.array(assignment),
    draws: z.array(z.number().min(0).lt(1)),
    checks: z.array(check).min(1),
    events: z.array(event),
  })
  .superRefine((fixture, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: "custom", path, message });
    };

    if (fixture.dt === ORACLE_DT_60 && !fixture.id.startsWith("rate-")) {
      issue(["dt"], "dt 1/60 is allowed only for ids that start with rate-");
    }

    for (const problem of frameProblems(fixture.self)) {
      issue(["self"], problem);
    }
    const seen = new Set<number>();
    fixture.bodies.forEach((candidate, index) => {
      for (const problem of frameProblems(candidate)) {
        issue(["bodies", index], problem);
      }
      if (seen.has(candidate.id)) issue(["bodies", index, "id"], "duplicate");
      seen.add(candidate.id);
      if (candidate.id === ORACLE_SELF_ID) {
        issue(["bodies", index, "id"], "id 101 is the steered ship");
      }
      if (candidate.kind === "player" && candidate.id !== ORACLE_PLAYER_ID) {
        issue(["bodies", index, "id"], "the player is id 100");
      }
      if (candidate.id === ORACLE_PLAYER_ID && candidate.kind !== "player") {
        issue(["bodies", index, "kind"], "id 100 is the player");
      }
      if (candidate.kind === "ship" && candidate.id < 102) {
        issue(["bodies", index, "id"], "other ships are id 102 and up");
      }
    });

    // Draws are distinct so a swapped call order is visible to the consumer.
    if (new Set(fixture.draws).size !== fixture.draws.length) {
      issue(["draws"], "draw values must be distinct");
    }

    fixture.assign.forEach((call, index) => {
      const value = call.value;
      const path = ["assign", index, "value"];
      switch (call.op) {
        case "setTarget":
          if (
            typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < 0
          ) {
            issue(path, "setTarget takes an entity id");
          }
          break;
        case "setDestination":
          if (!Array.isArray(value))
            issue(path, "setDestination takes a vector");
          break;
        case "setDesiredRange":
        case "setDesiredSpeed":
          if (typeof value !== "number")
            issue(path, `${call.op} takes a number`);
          break;
        case "perform":
          if (typeof value !== "string" || !BEHAVIOUR_SET.has(value)) {
            issue(path, "perform takes a BEHAVIOUR name without its prefix");
          }
          break;
      }
    });

    fixture.checks.forEach((candidate, index) => {
      const path = ["checks", index];
      if (candidate.tick > fixture.horizon) {
        issue([...path, "tick"], "check tick is beyond the horizon");
      }
      if (DISCRETE.has(candidate.field) && candidate.tolerance !== 0) {
        issue([...path, "tolerance"], "a discrete field has tolerance 0");
      }
      if (candidate.field === "behaviour") {
        if (
          typeof candidate.expected !== "string" ||
          !BEHAVIOUR_SET.has(candidate.expected)
        ) {
          issue([...path, "expected"], "behaviour expects a BEHAVIOUR name");
        }
      } else if (typeof candidate.expected !== "number") {
        issue([...path, "expected"], "this field expects a number");
      } else if (
        INTEGER_FIELDS.has(candidate.field) &&
        !Number.isInteger(candidate.expected)
      ) {
        issue([...path, "expected"], "this field expects an integer");
      }
    });

    let previous = 0;
    fixture.events.forEach((candidate, index) => {
      if (candidate.tick > fixture.horizon) {
        issue(["events", index, "tick"], "event tick is beyond the horizon");
      }
      if (candidate.tick < previous) {
        issue(["events", index, "tick"], "events are listed in tick order");
      }
      previous = candidate.tick;
    });
  });
export type OracleFixture = z.infer<typeof OracleFixtureSchema>;
export type OracleCheck = OracleFixture["checks"][number];

/** A fixture file: an array of fixtures with unique ids. */
export const OracleFileSchema = z
  .array(OracleFixtureSchema)
  .min(1)
  .superRefine((fixtures, ctx) => {
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
  });

/** The kinds of delta_t or universe-time site a frame-rate row records. */
export const FRAME_RATE_ROW_KINDS = [
  "rate-times-dt",
  "dt-limiter",
  "accumulator",
  "time-compare",
  "draw",
  "one-shot",
  "out-of-scope",
] as const;

/**
 * The recorded 1/120 s conversion rule (written by plan 14-06): the rule text,
 * the cross-step tolerance stated before any rate fixture is replayed, and one
 * row per delta_t or universe-time site. `confirmedBy` lists fixture ids; it
 * may be empty only for an `out-of-scope` row.
 */
export const FrameRateRuleSchema = z
  .strictObject({
    rule: z.string().min(1),
    crossDtTolerance: z.number().positive(),
    rows: z.array(
      z.strictObject({
        site: z.string().min(1),
        oolite: citation,
        kind: z.enum(FRAME_RATE_ROW_KINDS),
        treatment: z.string().min(1),
        confirmedBy: z.array(z.string().min(1)),
        measuredDifference: z.number().min(0).optional(),
      }),
    ),
  })
  .superRefine((rule, ctx) => {
    rule.rows.forEach((row, index) => {
      if (row.kind !== "out-of-scope" && row.confirmedBy.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "confirmedBy"],
          message: "only an out-of-scope row may have no confirming fixture",
        });
      }
    });
  });
export type FrameRateRule = z.infer<typeof FrameRateRuleSchema>;
