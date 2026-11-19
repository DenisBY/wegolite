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

/** The aim circle shrinks by `1 + missedShots / 4` at accuracy `COMBAT_AI_ISNT_AWFUL` and above (`ShipEntity.m:9769`). */
export const AIM_MISSED_SHOT_DIVISOR = 4;

/** The divisor under the square root of `max_cos` (`ShipEntity.m:9804`). */
export const AIM_TOLERANCE_SCALE = 100000000;

/** The dead zone `min_d` of `trackPrimaryTarget:` at accuracy below `COMBAT_AI_TRACKS_CLOSER` (`ShipEntity.m:9121`). */
export const PRIMARY_MIN_D = 0.004;

/** The dead zone `min_d` at accuracy `COMBAT_AI_TRACKS_CLOSER` and above (`ShipEntity.m:9131`). */
export const PRIMARY_MIN_D_PRECISE = 0.0004;

/** `min_d` shrinks by this much per missed shot, at accuracy `COMBAT_AI_ISNT_AWFUL` and above but below `COMBAT_AI_TRACKS_CLOSER` (`ShipEntity.m:9136`). */
export const PRIMARY_MISSED_SHOT_STEP = 0.0001;

/** The floor of the missed-shot `min_d`; reaching it doubles `max_factor` and halves `r_max_factor` (`ShipEntity.m:9137-9139`). */
export const PRIMARY_MIN_D_FLOOR = 0.001;

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

/* ---------------------------------------------------------------------------
 * Attack (plan 14-14): the dispatcher and its in-scope sub-behaviours
 * ------------------------------------------------------------------------- */

/**
 * Wegolite addition, not an Oolite number: an approach aspect smaller than this
 * is exactly 0. A quaternion rotation of an axis-aligned pose leaves a residue of
 * about 2.2e-16 (`2 y^2 - 1` for a quarter turn is never 0 in doubles) where
 * Oolite's exact basis vectors give 0, and the attack code compares the aspect
 * with 0 (`aspect < 0`, `aspect > 0`, `ShipEntity.m:4100, 4164, 3977`).
 */
export const ASPECT_ZERO_SNAP = 1e-12;

/**
 * The range of a ship with no forward weapon, in metres: `isWeaponNone` leaves
 * the weapon type nil and `setWeaponDataFromType:nil` sets `weaponRange =
 * [nil weaponRange]`, which is 0 (`ShipEntity.m:443-466, 13041-13044`). It is
 * NOT the 32000 m a naive default would give: it decides the exit test of
 * fly-from (`ShipEntity.m:4775`) for every unarmed ship such as the Shuttle.
 */
export const NO_WEAPON_RANGE = 0;

/** `COMBAT_IN_RANGE_FACTOR`, a share of the weapon range (`ShipEntity.h:56`). */
export const COMBAT_IN_RANGE_FACTOR = 0.035;

/** `COMBAT_OUT_RANGE_FACTOR` (`ShipEntity.h:58`). */
export const COMBAT_OUT_RANGE_FACTOR = 0.5;

/** `COMBAT_WEAPON_RANGE_FACTOR` (`ShipEntity.h:60`). */
export const COMBAT_WEAPON_RANGE_FACTOR = 1.2;

/** `COMBAT_JINK_OFFSET`, metres (`ShipEntity.h:61`). */
export const COMBAT_JINK_OFFSET = 500;

/** `NPC_MAX_WEAPON_TEMP` (`ShipEntity.h:116`). */
export const NPC_MAX_WEAPON_TEMP = 256;

/**
 * `WEAPON_COOLING_CUTOUT 0.85f` (`ShipEntity.h:117`): the float32 value Oolite
 * compares `weapon_temp / NPC_MAX_WEAPON_TEMP` against (`ShipEntity.m:9935-9936`),
 * the one home of the NPC float32 cutout. The player's double
 * `WEAPON_COOLING_CUTOUT` in `src/sim/combat/constants.ts` is a separate
 * constant and is untouched.
 */
export const NPC_WEAPON_CUTOUT_F32 = Math.fround(0.85);

/** `0.25 * NPC_MAX_WEAPON_TEMP`: below it a weapon is ready (`ShipEntity.h:119`). */
export const NPC_WEAPON_TEMP_READY = 0.25 * NPC_MAX_WEAPON_TEMP;

/**
 * `COMBAT_AI_WEAPON_TEMP_USABLE`, `WEAPON_COOLING_CUTOUT * NPC_MAX_WEAPON_TEMP`
 * (`ShipEntity.h:117, 120`): the C float product `0.85f * 256.0f`. Multiplying
 * by 256 is exact, so this is 217.60000610351562, derived from the one float32
 * cutout above. Oolite compares the float32 weapon temperature with it
 * (`weapon_temp > USABLE`, `forward_weapon_temp < USABLE`), so the behaviours
 * compare the float32 record field with this float32 product.
 */
export const NPC_WEAPON_TEMP_USABLE =
  NPC_WEAPON_CUTOUT_F32 * NPC_MAX_WEAPON_TEMP;

/** `performAttack`'s `desired_range = 1250 * randf() + 750` (`ShipEntityAI.m:354`). */
export const ATTACK_DESIRED_RANGE_SPAN = 1250;

/** See `ATTACK_DESIRED_RANGE_SPAN` (`ShipEntityAI.m:354`). */
export const ATTACK_DESIRED_RANGE_BASE = 750;

/** An armed attacker that is smart picks EVASIVE_ACTION below this draw (`ShipEntity.m:4102`). */
export const ATTACK_SMART_EVASIVE_CHANCE = 0.75;

/** A forward weapon with more range than this may snipe (`ShipEntity.m:4160`). */
export const SNIPER_WEAPON_RANGE = 12500;

/** The target must also be farther than this to snipe (`ShipEntity.m:4160`). */
export const SNIPER_ENTRY_RANGE = 12500;

/** The sniper hands back to ATTACK_TARGET inside this range (`ShipEntity.m:4414-4415`). */
export const SNIPER_BOUNCE_RANGE = 15000;

/** The sniper closes at full speed beyond this share of the scanner range (`ShipEntity.m:4417`). */
export const SNIPER_SCANNER_SHARE = 0.8;

/** The sniper's slow approach is a tenth of the maximum speed (`ShipEntity.m:4426`). */
export const SNIPER_SLOW_DIVISOR = 10;

/** The sniper's frustration limit, seconds (`ShipEntity.m:4438`). */
export const SNIPER_FRUSTRATION_LIMIT = 3;

/** The `setEvasiveJink:` argument after the sniper's or fly-to's frustration (`ShipEntity.m:4441, 4699`). */
export const ATTACK_FRUSTRATION_JINK_Z = 1000;

/** Success above this counts as tracking well (`ShipEntity.m:4432, 4690`). */
export const ATTACK_SUCCESS_GOOD = 0.999;

/** Fly-to's frustration limit, seconds (`ShipEntity.m:4696`). */
export const FLY_TO_TARGET_FRUSTRATION_LIMIT = 3;

/** The back-off range base of fly-to, metres (`ShipEntity.m:4652`). */
export const FLY_TO_TARGET_BACK_OFF_BASE = 10000;

/** The aspect above which the target is treated as aiming at us (`ShipEntity.m:4658-4659`). */
export const FLY_TO_TARGET_AIMED_ASPECT = 0.8;

/** Speed factors of fly-to, each a share of the target's speed or of `maxFlightSpeed` (`ShipEntity.m:4660-4683`). */
export const FLY_TO_TARGET_SPEEDS = Object.freeze({
  /** target speed x 1.25 and `maxFlightSpeed` x 0.8 when aimed at (4660). */
  aimedTarget: 1.25,
  aimedMax: 0.8,
  /** target speed x 1.05 and `maxFlightSpeed` x 0.25 inside the weapon range (4663). */
  matchTarget: 1.05,
  matchMax: 0.25,
  /** the patient approach, x 0.1 of both (4666). */
  patient: 0.1,
  /** target speed x 1.5 beyond the back-off range (4670). */
  farTarget: 1.5,
  /** the slow-down branch: x 0.5 (4673) and x 1.25 (4675) of the target speed, x 0.5 of the maximum. */
  slowTarget: 0.5,
  slowBehindTarget: 1.25,
  slowMax: 0.5,
  /** the approach speed is max(maxFlightSpeed, min(3 x target speed, max)) (4683). */
  approachTarget: 3,
});

/** The aspect below which fly-to slows more, "aspect > -0.25" (`ShipEntity.m:4672`). */
export const FLY_TO_TARGET_SLOW_ASPECT = -0.25;

/** Fly-from's frustration share when the target is not closing, `delta_t / 4` (`ShipEntity.m:4747`). */
export const FLY_FROM_SLOW_FRUSTRATION_DIVISOR = 4;

/** Fly-from's frustration limit, seconds (`ShipEntity.m:4750`). */
export const FLY_FROM_FRUSTRATION_LIMIT = 10;

/** The chance of each of fly-from's three `randf()` tests (`ShipEntity.m:4751, 4753, 4757`). */
export const FLY_FROM_CHANCE = 0.3;

/** Fly-from's speed doubling: twice the flight speed, and the injector test against twice the target's (`ShipEntity.m:4759, 4768`). */
export const FLY_FROM_SPEED_FACTOR = 2;

/** Fly-from halves the z offset and the frustration (`ShipEntity.m:4758, 4763`). */
export const FLY_FROM_HALVING = 2;

/** `desired_speed < maxFlightSpeed * 0.5` resets it (`ShipEntity.m:4771`). */
export const FLY_FROM_MIN_SPEED_SHARE = 0.5;

/** The jink weight of fly-from's exit test: `15 * jink.x` (`ShipEntity.m:4775`). */
export const FLY_FROM_JINK_WEIGHT = 15;

/** The turn-rate divisor of fly-from's speed clause, 2 pi rounded (`ShipEntity.m:4775`). */
export const FLY_FROM_TURN_DIVISOR = 6.28;

/** Fly-from dodges when the target's aspect is beyond these (`ShipEntity.m:4794`). */
export const FLY_FROM_DODGE_FRONT = 0.99999;

/** See `FLY_FROM_DODGE_FRONT` (`ShipEntity.m:4794`). */
export const FLY_FROM_DODGE_BEHIND = -0.999;

/** Six and twelve speed factors (`ShipEntity.m:4505-4526`). */
export const SIX_SPEEDS = Object.freeze({
  /** inside the back-off range with the slow-down on: x 0.9 target, x 0.4 maximum (4505). */
  closeTarget: 0.9,
  closeMax: 0.4,
  /** inside the slow-down range, outside the back-off range: x 1.2 target (4507). */
  slowTarget: 1.2,
  /** outside the slow-down range, inside the back-off range: x 0.9 target, x 0.8 maximum (4515). */
  nearMax: 0.8,
});

/** Six switches to twelve when the range is below this share of the distance (`ShipEntity.m:4511`). */
export const SIX_HEAD_ON_SHARE = 0.5;

/** The distance within which six and twelve vector in, metres (`ShipEntity.m:4523`). */
export const SIX_VECTOR_IN_DISTANCE = 750;

/** A target slower than this is "almost at a standstill" (`ShipEntity.m:4523`). */
export const SIX_STANDSTILL_SPEED = 0.2;

/** The `universalID` mask and bound of the standstill test (`ShipEntity.m:4523`). */
export const SIX_STANDSTILL_ID_MASK = 14;

/** See `SIX_STANDSTILL_ID_MASK` (`ShipEntity.m:4523`). */
export const SIX_STANDSTILL_ID_BOUND = 4;

/** The vector-in speed is `max(target speed, 0.4 * maxFlightSpeed)` (`ShipEntity.m:4526`). */
export const SIX_VECTOR_IN_MAX_SHARE = 0.4;

/** The point six heads for is this share of the weapon range behind the target (`ShipEntity.m:4533`). */
export const SIX_BEHIND_SHARE = 0.5;

/** The point twelve heads for is this many metres above the target (`ShipEntity.m:4552`). */
export const TWELVE_ABOVE = 1250;

/** The confidence below which six and twelve add frustration (`ShipEntity.m:4559`). */
export const SIX_CONFIDENCE_LIMIT = 0.85;

/** The share of dt frustration relaxes by (`ShipEntity.m:4562`). */
export const SIX_FRUSTRATION_RELIEF = 0.75;

/** Frustration above this, or an aspect above `SIX_VECTOR_IN_ASPECT`, vectors in (`ShipEntity.m:4565`). */
export const SIX_FRUSTRATION_LIMIT = 10;

/** See `SIX_FRUSTRATION_LIMIT` (`ShipEntity.m:4565`). */
export const SIX_VECTOR_IN_ASPECT = 0.75;

/** Break-off's frustration thresholds, seconds (`ShipEntity.m:3917, 3932`). */
export const BREAK_OFF_SLOW_FRUSTRATION = 15;

/** See `BREAK_OFF_SLOW_FRUSTRATION` (`ShipEntity.m:3932`). */
export const BREAK_OFF_HAND_OVER_FRUSTRATION = 10;

/** Break-off retreats beyond this range, metres (`ShipEntity.m:3921`). */
export const BREAK_OFF_FAR_RANGE = 3000;

/** The evasive fraction is `fmin(1.6 / max_flight_roll, aspect)` (`ShipEntity.m:3921`). */
export const BREAK_OFF_ROLL_COEFFICIENT = 1.6;

/** Break-off hands to slow dogfight when the aspect is below this (`ShipEntity.m:3930`). */
export const BREAK_OFF_DOGFIGHT_ASPECT = -0.75;

/** Break-off's second hand-over needs an aspect below this (`ShipEntity.m:3932`). */
export const BREAK_OFF_HAND_OVER_ASPECT = 0.85;

/** Slow dogfight's close-in test: `2.5 * (collision radii)` (`ShipEntity.m:3957`). */
export const DOGFIGHT_CLOSE_FACTOR = 2.5;

/** Slow dogfight's aspect bands (`ShipEntity.m:3962-3975`). */
export const DOGFIGHT_BEHIND_ASPECT = -0.5;

/** See `DOGFIGHT_BEHIND_ASPECT` (`ShipEntity.m:3967`). */
export const DOGFIGHT_SIDE_ASPECT = 0.3;

/** The aspect above which slow dogfight hands over to break-off (`ShipEntity.m:3974`). */
export const DOGFIGHT_BREAK_OFF_ASPECT = 0.85;

/** Slow dogfight: x 0.5 while behind (3966), x 0.1 abeam (3969), x 2.5 of the aspect in front (3972). */
export const DOGFIGHT_SPEEDS = Object.freeze({
  behindShare: 0.5,
  sideShare: 0.1,
  frontFactor: 2.5,
});

/** Slow dogfight halves the speed past this frustration, seconds (`ShipEntity.m:3982`). */
export const DOGFIGHT_FRUSTRATION_LIMIT = 10;

/* ---------------------------------------------------------------------------
 * The proximity pass, avoid collision and escort formation (plan 14-15)
 * ------------------------------------------------------------------------- */

/**
 * The pair trigger's squared distance factor: `PROXIMITY_WARN_DISTANCE` is 4
 * (`Universe.h:99-100`), and `CollisionRegion.m:304-312` warns a pair when
 * `dist2 < 16 x r^2` for either collision radius.
 */
export const PROXIMITY_WARN_DISTANCE2 = 16;

/**
 * `setProximityAlert:` ignores a body lighter than this, kg (`ShipEntity.m:6107`:
 * "we are not alerted by small objects. (a cargopod has a mass of about
 * 1000)"). The station and the player count as at or above it.
 */
export const PROXIMITY_MIN_MASS = 2000;

/** The zone is `2 x r_self + r_other` (`ShipEntity.m:6126`). */
export const PROXIMITY_ZONE_SELF_FACTOR = 2;

/** A body ahead stretches the forward component by `0.25 x maxFlightSpeed / flightSpeed` (`ShipEntity.m:6122-6123`, "up to 400%"). */
export const PROXIMITY_FORWARD_STRETCH = 0.25;

/** The ledger of `behaviour_formation_form_up:` (`ShipEntity.m:5002-5047`). */
export const FORMATION_ETA_LIMIT = 5;

/** `desired_speed = leaderSpeed x (1 + eta x 0.05)` (`ShipEntity.m:5011`). */
export const FORMATION_ETA_SLOPE = 0.05;

/** The frustration relief per second of improving range (`ShipEntity.m:5030`). */
export const FORMATION_FRUSTRATION_RELIEF = 0.25;

/** Formation reports frustration after this many seconds without a range gain (`ShipEntity.m:5035`). */
export const FORMATION_FRUSTRATION_LIMIT = 15;

/** A follower farther than this share of the scanner range from its slot pitches over (`ShipEntity.m:5038`). */
export const FORMATION_FAR_SCANNER_SHARE = 0.5;

/** The default escort pattern spacing factor (`oolite-global-prefix.js:174-175`). */
export const ESCORT_SPACING_FACTOR = 3;

/**
 * The default V pattern in Oolite's local frame, x then z (y is 0 for all four;
 * `oolite-global-prefix.js:165-170`). Wegolite's local forward is -Z, so
 * `escortCoordinates` negates each z.
 */
export const ESCORT_PATTERN: readonly (readonly [number, number])[] =
  Object.freeze([
    Object.freeze([-2, -1] as const),
    Object.freeze([2, -1] as const),
    Object.freeze([-3, -3] as const),
    Object.freeze([3, -3] as const),
  ]);
