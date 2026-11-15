// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC steering constants ledger (AI-01, plan 14-09, PITFALLS 6).
 *
 * Every number the native steering uses lives here, with the Oolite file and
 * line it comes from. A number that plays badly is a finding for the owner,
 * not a tweak: change it only after re-reading the Oolite source it cites.
 * `tests/sim/npc/constants.test.ts` pins each value to its Oolite literal.
 *
 * Plan 14-09 defines every `COMBAT_AI_*` tier of `ShipEntity.h:123-137` here,
 * once; later plans import them and add only their own rows.
 *
 * The module is pure data. It imports only the tick rate. Oolite line numbers
 * refer to the pinned commit `7437f22`; the files cited here are identical in
 * the checkout.
 */

import { TICKS_PER_SECOND } from "../ai/time.js";

/* ---------------------------------------------------------------------------
 * The flight model
 * ------------------------------------------------------------------------- */

/** Thrust scale of the speed ramp (`SHIP_THRUST_FACTOR`, `ShipEntity.h:46`). */
export const SHIP_THRUST_FACTOR = 5;

/** Roll stick rate per second of `applySticks` (`ShipEntity.m:7021`). */
export const STICK_ROLL_RATE = 2;

/** Pitch stick rate per second of `applySticks` (`ShipEntity.m:7022`). */
export const STICK_PITCH_RATE = 4;

/**
 * The factor on a stick rate while the stick opposes the current rate, "much
 * faster correction" (`ShipEntity.m:7025-7028`).
 */
export const STICK_REVERSAL_FACTOR = 4;

/**
 * The extra factor on a stick rate while the stick is exactly 0 and the
 * accuracy is at least `COMBAT_AI_TRACKS_CLOSER`, "faster correction"
 * (`ShipEntity.m:7032-7039`).
 */
export const STICK_ZERO_FACTOR = 2;

/**
 * The factor on the thrust step of `decrease_flight_speed:` while the ship is
 * faster than its `maxFlightSpeed` (`MIN_HYPERSPEED_FACTOR`, `PlayerEntity.h:296`,
 * used at `ShipEntity.m:7420-7422`).
 */
export const MIN_HYPERSPEED_FACTOR = 32;

/* ---------------------------------------------------------------------------
 * The stock flight stats a ship record does not author
 * ------------------------------------------------------------------------- */

/** `max_flight_speed` of a non-station without one (`ShipEntity.m:263-264`). */
export const DEFAULT_MAX_FLIGHT_SPEED = 160;

/** `max_flight_roll` without one (`ShipEntity.m:265`). */
export const DEFAULT_MAX_FLIGHT_ROLL = 2;

/** `max_flight_pitch` without one (`ShipEntity.m:266`). */
export const DEFAULT_MAX_FLIGHT_PITCH = 1;

/** `thrust` without one (`ShipEntity.m:270`). */
export const DEFAULT_THRUST = 15;

/**
 * The scanner range every ship uses, in metres (`SCANNER_MAX_RANGE`,
 * `Entity.h:49`; a ship's own range is that value, `ShipEntity.m:553`). The
 * compiled records author no `scanner_range` (plan 14-03 refuses one).
 */
export const SCANNER_MAX_RANGE = 25600;

/* ---------------------------------------------------------------------------
 * Navigation
 * ------------------------------------------------------------------------- */

/** `cos(5 degrees)`, "close enough in most cases for navigation" (`ShipEntity.h:142`). */
export const MAX_COS = 0.995;

/** `MAX_COS * MAX_COS` (`ShipEntity.h:143`). */
export const MAX_COS2 = MAX_COS * MAX_COS;

/** `min_d`, the dead zone of every stick decision of `trackDestination:` (`ShipEntity.m:9464`). */
export const TRACK_MIN_D = 0.004;

/** `precision` of `trackDestination:` while not docking (`ShipEntity.m:9466`). */
export const TRACK_PRECISION = 0.9025;

/** The ceiling of the aim cosine when far from the range sphere (`ShipEntity.m:9488-9490`). */
export const TRACK_MAX_COS_CEILING = 0.99999;

/** The stick is `0.125 * factor` of the maximum rate (`ShipEntity.m:9530-9556`). */
export const TRACK_STICK_STEP = 0.125;

/** The cap on the integer `factor` (`ShipEntity.m:9527, 9539, 9551`). */
export const TRACK_FACTOR_CAP = 8;

/** The pitch used when the ship is off course but within `min_d` (`ShipEntity.m:9564`). */
export const TRACK_PITCH_FALLBACK = 0.01;

/** The cosine below which a pitching-over ship keeps pitching (`ShipEntity.m:9513`). */
export const PITCHING_OVER_COS = 0.707;

/** The floor of fly-to's confidence factor (`ShipEntity.m:5071-5072`). */
export const FLY_TO_MIN_CONFIDENCE = 0.2;

/** The ETA assumes half the current speed plus a 2% margin (`ShipEntity.m:5085`). */
export const FLY_TO_ETA_SPEED_FACTOR = 0.51;

/** The slowdown time of a ship with no thrust (`ShipEntity.m:5086`). */
export const FLY_TO_NO_THRUST_SLOWDOWN = 4;

/** `minTurnSpeedFactor = 0.05 * pitch * roll` (`ShipEntity.m:5087`). */
export const FLY_TO_TURN_SPEED_COEFFICIENT = 0.05;

/** The orbit-speed limit factor, `max_flight_pitch * 5 * ...` (`ShipEntity.m:5095`). */
export const FLY_TO_ORBIT_FACTOR = 5;

/** Fly-to cuts its speed to this fraction when it would overshoot (`ShipEntity.m:5096`). */
export const FLY_TO_SPEED_CUT = 0.5;

/** Frustration shrinks by this much per second of progress (`ShipEntity.m:5119`). */
export const FLY_TO_FRUSTRATION_RELIEF = 0.25;

/** Fly-to reports frustration after this many seconds regardless of speed (`ShipEntity.m:5124`). */
export const FLY_TO_FRUSTRATION_LIMIT = 15;

/** Frustration limit in units of `slowdownTime` (`ShipEntity.m:5124`). */
export const FLY_TO_SLOWDOWN_LIMIT_FACTOR = 10;

/** Frustration drops by this many slowdown times after a report (`ShipEntity.m:5127`). */
export const FLY_TO_SLOWDOWN_RESET_FACTOR = 5;

/** The share of the desired range face-destination aims inside (`ShipEntity.m:4927`). */
export const FACE_PRECISION = 0.9;

/** The smallest desired range for which face-destination aims inside it (`ShipEntity.m:4926`). */
export const FACE_MIN_RANGE = 1;

/** Face-destination's frustration limit is this over `max_flight_pitch` (`ShipEntity.m:4945`). */
export const FACE_FRUSTRATION_LIMIT = 15;

/** The escape pitch is this share of `max_flight_pitch` (`ShipEntity.m:4950`). */
export const FACE_ESCAPE_PITCH = 0.5;

/** The frustration above which the sign-flip damping may run (`ShipEntity.m:4958`). */
export const FACE_DAMPING_FRUSTRATION = 5;

/** The confidence above which the sign-flip damping may run (`ShipEntity.m:4958`). */
export const FACE_DAMPING_CONFIDENCE = 0.5;

/** The share of the old pitch added by the damping (`ShipEntity.m:4959`). */
export const FACE_DAMPING_SHARE = 0.5;

/* ---------------------------------------------------------------------------
 * Combat AI tiers (`ShipEntity.h:123-137`)
 * ------------------------------------------------------------------------- */

/** How close the AI has to be to be confident in aim (`ShipEntity.h:123`). */
export const COMBAT_AI_CONFIDENCE_FACTOR = 1250000;

/** Accuracy above which a pilot is not awful (`ShipEntity.h:124`). */
export const COMBAT_AI_ISNT_AWFUL = 0;

/** Removes the SIX and TWELVE attack behaviours (`ShipEntity.h:125-126`). */
export const COMBAT_AI_IS_SMART = 5;

/** Adds the (FLEE_)EVASIVE_ACTION behaviours (`ShipEntity.h:127-128`). */
export const COMBAT_AI_FLEES_BETTER = 6;

/** Adds ATTACK_BREAK_OFF_TARGET (`ShipEntity.h:129-130`). */
export const COMBAT_AI_DOGFIGHTER = 6.5;

/** Adds ATTACK_SLOW_DOGFIGHT and doubles the stick rate at rest (`ShipEntity.h:131-132`). */
export const COMBAT_AI_TRACKS_CLOSER = 7.5;

/** The tier before the sniper (`ShipEntity.h:133`). */
export const COMBAT_AI_USES_SNIPING = 8.5;

/** Adds ATTACK_SNIPER (`ShipEntity.h:134-135`). */
export const COMBAT_AI_FLEES_BETTER_2 = 9;

/**
 * The AI's reaction time in seconds (`COMBAT_AI_STANDARD_REACTION_TIME`,
 * `ShipEntity.h:136-137`). Every ship uses it: `reaction_time` is read at
 * `ShipEntity.m:717` and the compiled records author none.
 */
export const COMBAT_AI_STANDARD_REACTION_TIME = 1.5;

/**
 * Ticks between two tracking-curve samples: a third of the reaction time
 * (`ShipEntity.m:5444-5449`, the gate `trackingCurveTimes[0] + reactionTime /
 * 3.0 > now`) at the fixed step, `round(1.5 / 3 * 120)` = 60. A whole-tick
 * compare; the frame-rate rule records its one-tick difference from Oolite's
 * double clock.
 */
export const TRACKING_SAMPLE_TICKS = Math.round(
  (COMBAT_AI_STANDARD_REACTION_TIME / 3) * TICKS_PER_SECOND,
);

/* ---------------------------------------------------------------------------
 * The accuracy draw
 * ------------------------------------------------------------------------- */

/**
 * The accuracy draw is `randf() * ACCURACY_DRAW_SPAN + ACCURACY_DRAW_OFFSET`,
 * that is `randf() * 10 - 5` (`ShipEntity.m:667`).
 */
export const ACCURACY_DRAW_SPAN = 10;

/** See `ACCURACY_DRAW_SPAN` (`ShipEntity.m:667`). */
export const ACCURACY_DRAW_OFFSET = -5;
