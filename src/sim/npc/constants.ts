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
 * Target sensing and `trackPrimaryTarget:retreat:` (plan 14-12)
 * ------------------------------------------------------------------------- */

/** A target is lost beyond this many scanner ranges, squared (`1.25 * 1.25`, `ShipEntity.m:8706`). */
export const CAN_TRACK_RANGE2_FACTOR = 1.5625;

/** The weapon-facing-independent starting `aim_tolerance` is `240 - 18 * accuracy` (`ShipEntity.m:1138`). */
export const AIM_TOLERANCE_BASE = 240;

/** See `AIM_TOLERANCE_BASE` (`ShipEntity.m:1138`). */
export const AIM_TOLERANCE_ACCURACY_FACTOR = 18;

/** The best aim cosine of a pilot who is awful (`ShipEntity.m:9764`). */
export const AIM_BEST_COS_AWFUL = 0.99999;

/** The best aim cosine at accuracy `COMBAT_AI_ISNT_AWFUL` and above (`ShipEntity.m:9767`). */
export const AIM_BEST_COS_BETTER = 0.999999;

/** The best aim cosine at accuracy `COMBAT_AI_TRACKS_CLOSER` and above (`ShipEntity.m:9773`). */
export const AIM_BEST_COS_DEADLY = 0.9999999;

/** A deadly pilot starts with an aim circle this many times smaller (`ShipEntity.m:9775`). */
export const AIM_DEADLY_DIVISOR = 5;

/** The divisor under the square root of `max_cos` (`ShipEntity.m:9804`). */
export const AIM_TOLERANCE_SCALE = 100000000;

/** The dead zone `min_d` of `trackPrimaryTarget:` at accuracy below `COMBAT_AI_TRACKS_CLOSER` (`ShipEntity.m:9121`). */
export const PRIMARY_MIN_D = 0.004;

/** The dead zone `min_d` at accuracy `COMBAT_AI_TRACKS_CLOSER` and above (`ShipEntity.m:9131`). */
export const PRIMARY_MIN_D_PRECISE = 0.0004;

/** The default cap on the integer `factor` (`ShipEntity.m:9122`). */
export const PRIMARY_MAX_FACTOR = 8;

/** The default share of the maximum rate per unit of `factor` (`ShipEntity.m:9123`). */
export const PRIMARY_R_MAX_FACTOR = 0.125;

/** The pitch divisor of the precise `max_factor` (`ShipEntity.m:9128`). */
export const PRIMARY_PITCH_DIVISOR = 0.125;

/** The precise tier multiplies `max_factor` and divides `r_max_factor` by this (`ShipEntity.m:9132-9133`). */
export const PRIMARY_PRECISE_MULTIPLIER = 3;

/** The cosine below which a ship starts pitching over, times `reverse` (`ShipEntity.m:9158`). */
export const PRIMARY_PITCH_OVER_START_COS = -0.5;

/** The cosine below which a pitching-over ship keeps pitching, times `reverse` (`ShipEntity.m:9166`). */
export const PRIMARY_PITCH_OVER_END_COS = 0.707;

/** The share of the pitch stick the overshoot limiter keeps (`ShipEntity.m:9212`). */
export const PRIMARY_PITCH_LIMIT_SHARE = 0.9;

/** The jink is withheld within `radius * radius * 100` squared metres (`ShipEntity.m:9079`). */
export const PRIMARY_AVOID_RANGE_FACTOR = 100;

/** The jink is withheld while the target direction is more forward than this (`ShipEntity.m:9084`). */
export const PRIMARY_AVOID_DOT = -0.1;

/** The jink grows with the range beyond this many metres (`ShipEntity.m:9090-9091`). */
export const PRIMARY_JINK_RANGE = 2000;

/** The jink growth at accuracy `COMBAT_AI_FLEES_BETTER_2` and above (`ShipEntity.m:9093`). */
export const PRIMARY_JINK_BOOST = 3;

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

/* ---------------------------------------------------------------------------
 * Avoid collision, flee and evasive action (plan 14-13)
 * ------------------------------------------------------------------------- */

/**
 * `desired_range` of the avoid-collision entry is the other ship's collision
 * radius times this (`Universe.h:101`; used at `ShipEntity.m:5931`).
 */
export const PROXIMITY_AVOID_DISTANCE_FACTOR = 10;

/** The fraction of the way to the other ship the avoid-collision destination sits (`ShipEntity.m:5929`). */
export const AVOID_MIDPOINT = 0.5;

/** The frustration relief per second of improving range in flee (`ShipEntity.m:4862`). */
export const FLEE_FRUSTRATION_RELIEF = 0.25;

/** Flee reports frustration after this many seconds without a range gain (`ShipEntity.m:4867`). */
export const FLEE_FRUSTRATION_LIMIT = 15;

/** The z component `setEvasiveJink:` receives from flee and `performFlee` (`ShipEntity.m:9098`, `ShipEntityAI.m:383`). */
export const EVASIVE_JINK_Z = 400;

/** `setEvasiveJink:` draws each of x and y in `[-128, 128)` (`ranrot_rand() % 256 - 128`, `ShipEntity.m:8985-8986`). */
export const EVASIVE_JINK_SPAN = 256;

/** `setEvasiveJink:` keeps each of x and y at least this far from zero (`ShipEntity.m:8989-8999`). */
export const EVASIVE_JINK_OFFSET = 128;

/** `performFlee` switches to an evasive behaviour when the target aims closer than this cosine (`ShipEntityAI.m:387`). */
export const FLEE_EVASIVE_ASPECT = 0.9995;

/** `performFlee` picks EVASIVE_ACTION below this draw and FLEE_EVASIVE_ACTION otherwise (`ShipEntityAI.m:388`). */
export const FLEE_EVASIVE_CHANCE = 0.15;

/** `evasiveAction:` does not roll while the two right vectors agree within this (`ShipEntity.m:9016`). */
export const EVASIVE_ROLL_AGREEMENT = 0.3;

/** An evasive behaviour hands over after this many seconds (`ShipEntity.m:4021`). */
export const EVASIVE_FRUSTRATION_LIMIT = 0.5;
