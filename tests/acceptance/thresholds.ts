// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Phase 14 acceptance thresholds and every definition they are measured
 * by (ROADMAP Phase 14, criterion 2: "A 20-seed acceptance run passes against
 * thresholds stated in the phase plan before the run").
 *
 * Committed before the first run; no later plan edits this file. This file has
 * exactly one commit, plan 14-07's, and no option of the escalation below
 * edits it, not even for formatting: a second commit fails plan 14-17's
 * freeze check permanently. It imports nothing from `src/` (behaviour ids are
 * plain strings; the station radius is restated as `STATION_RADIUS_M`), so the
 * numbers of record cannot move with the code they gate.
 *
 * ## The frozen set (one definition, used identically by plans 14-07, 14-17
 * and 14-19 and by 14-VALIDATION.md)
 *
 * `tests/acceptance/thresholds.ts` (this file, one commit, never edited
 * again by any option) and the harness files `FROZEN_HARNESS_FILES`, which are
 * frozen from the harness commit onward (the commit of plan 14-17's Task 1
 * that adds `detectors.ts`; `flight-script.ts` and `test-spawn.ts` are
 * committed earlier, by plan 14-16, and the freeze check counts their commits
 * after the harness commit). A harness file changes afterwards only in a
 * commit whose message carries the trailer line
 * `Detector-change-approved-by-owner: <date> <reason>` (option (c) below).
 * `tests/acceptance/accepted-crossings.ts` lies outside the frozen set and
 * changes only under option (a).
 *
 * ## The pre-declared escalation
 *
 * When the run is not green, plan 14-17 stops at its checkpoint and offers the
 * owner, item by item, exactly:
 *
 * (a) accept: a crossing episode of any class is accepted as a recorded
 *     divergence of the acceptance criterion by an entry in
 *     `accepted-crossings.ts` carrying its epoch, flyer, crossed body, first
 *     tick and class and the owner's reason and date, also listed in plan
 *     14-19's grouped Key Decisions row on the acceptance thresholds.
 * (b) port defect: the simulation port (`src/sim/npc/**` or the steering
 *     wiring of `src/sim/world/step.ts`) is fixed along the cited Oolite lines
 *     with every oracle green, this file and the frozen harness untouched,
 *     and the run repeated.
 * (c) harness defect: the executor shows with a forced case that a harness
 *     file of the frozen set (the detectors, the seed set-up, the run
 *     registration, the flight-script pilot or the spawner) contradicts this
 *     file's definitions; the owner approves a commit whose message carries
 *     the trailer line `Detector-change-approved-by-owner: <date> <reason>`,
 *     the date and reason being those of the owner's answer recorded in the
 *     plan 14-17 summary, which the trailer cites; all 20 epochs are rerun
 *     from epoch 1, the earlier run discarded and both recorded.
 *
 * The options cover every failure route: a crossing episode has (a), (b) and
 * (c); every other breach (a stuck or frozen window, a frustration event, a
 * station-sphere entry, a repair, an AI fault or drop, a `hashWorld` failure,
 * a missed run minimum, a runtime over budget) has (b) and (c), and a runtime
 * over budget may also be accepted as measured. Recommendations, given by the
 * executor with evidence, never chosen by it: (a) for an `own-target` or
 * `other-alert-ignored` episode when the executor shows the Oolite line that
 * lets it happen (for example `ShipEntity.m:4898`, flee skipping avoidance at
 * accuracy below 0); (a) for an `other` episode when the executor shows it
 * matches a faithful case, the head-on closure that plans 14-06 and 14-15
 * assert only for the alert, avoid and resume order, because at the alert
 * distance of 4 x max(r) Oolite's own avoidance may still pass through the
 * hull; (b) for everything else. No option edits this file; a change to a
 * threshold, definition, placement or minimum is outside this phase's options.
 * A non-crossing breach that the executor can trace neither to the port nor to
 * the harness means this file's statement is wrong for a faithful port: it is
 * reported as such, no option of this phase repairs it, the run stays red and
 * the owner decides at plan 14-19's gate (rejecting the report sends it to
 * gap-closure planning).
 *
 * Accepted residual (stated in plan 14-19's report): the run places no flyer
 * on a collision course, so its zero-crossing result is evidence about near
 * passes inside the alert band, attack passes to the nearby range and arrivals
 * at the station's script range, not about head-on closure, which the oracle
 * fixtures of plan 14-06 and the world cases of plan 14-15 cover.
 */

// ---------------------------------------------------------------------------
// Seeds and the script mapping
// ---------------------------------------------------------------------------

/**
 * The 20 acceptance epochs: epochs 1 to 20 of the Lave world
 * (`worldSeedFor(marketSeedForSystem("g0-s7"), epoch)`), each populated with
 * its 12 inert ships (ids 101 to 112), which the run converts to scripted
 * flyers by `SCRIPT_MAPPING`.
 *
 * What the 20 seeds vary: the system layout is epoch-independent
 * (`deriveSystemLayout` reads only the system record,
 * `src/sim/world/layout.ts:126-131`) and the start placement
 * (`FLYER_START_OFFSETS`) overrides every position, so all 20 epochs fly the
 * same geometry in the same frame. An epoch changes which record each slot
 * draws and every per-entity random stream (the accuracy draw, the jink and
 * evasive draws, performAttack's desired range) and nothing else.
 *
 * By the populator's placement order (`src/sim/world/populate.ts:95-104`) the
 * slots are: station 101 (trader) and 107 (pirate); intercept 102 (trader)
 * and 108 (pirate); flee 103 (trader) and 109 (police); attack 104 (hunter)
 * and 110 (police); escort 105 (hunter, leader 101, slot 0) and 111 (shuttle
 * role, leader 107, slot 1); face 106 (pirate) and 112 (scavenger). Only the
 * shuttle role can draw the unarmed Shuttle, so every station, intercept, flee
 * and attack slot draws an armed record whose maximum speed is at least the
 * Adder's 240 m/s (thrust 30). Collision radii the slots can draw (compiled
 * `ships-npc.json`): trader slots (101 to 103) the Adder 29.03, Moray 36.19 or
 * Cobra Mk I 39.26 m; pirate slots (106 to 108) 29.03 to 50.20 m (the Krait);
 * hunter slots 31.91 to 50.20 m; police the Viper 35.06 m (beam laser, maximum
 * speed 320 m/s, thrust 32, pitch 1.8); the scavenger slot (112) the Adder
 * 29.03 or Cobra Mk I 39.26 m, the only two records with the `scavenger` role;
 * the player 72.70 m (`PLAYER_COLLISION_RADIUS_M`, plan 14-11).
 */
export const ACCEPTANCE_EPOCHS: readonly number[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
]);

/** The script a converted ship runs. */
export type FlyerScript =
  "station" | "intercept" | "flee" | "attack" | "escort" | "face";

/** One row of `SCRIPT_MAPPING`. */
export interface ScriptMappingRow {
  /** The ship's index i (ships in ascending id, i from 0 to 11) modulo 6. */
  readonly residue: number;
  readonly script: FlyerScript;
  /**
   * For an escort: the offset from its own index to its leader's index within
   * the same slot group of six (the ship at index i - 4); otherwise null.
   */
  readonly leaderIndexOffset: number | null;
}

/**
 * The frozen script mapping of the 12 ships (ships in ascending id, index i
 * from 0 to 11): i mod 6 = 0 station, 1 intercept the player, 2 flee the
 * player, 3 attack the player, 4 escort the ship at index i - 4 in slot
 * floor(i / 6), 5 face the station.
 */
export const SCRIPT_MAPPING: readonly ScriptMappingRow[] = Object.freeze([
  Object.freeze({ residue: 0, script: "station", leaderIndexOffset: null }),
  Object.freeze({ residue: 1, script: "intercept", leaderIndexOffset: null }),
  Object.freeze({ residue: 2, script: "flee", leaderIndexOffset: null }),
  Object.freeze({ residue: 3, script: "attack", leaderIndexOffset: null }),
  Object.freeze({ residue: 4, script: "escort", leaderIndexOffset: -4 }),
  Object.freeze({ residue: 5, script: "face", leaderIndexOffset: null }),
]);

// ---------------------------------------------------------------------------
// Script ranges, horizon and sampling
// ---------------------------------------------------------------------------

/**
 * The station script's range: the goal is met at a centre distance from the
 * flyer to the station centre at or below 2,500 m. It lies outside the
 * station's proximity trigger of 4 x 500 m = 2,000 m
 * (`CollisionRegion.m:298-314`, the outer prefilter at 299 and the trigger at
 * 309, with `Universe.h:99-100`) by more than the worst stopping distance,
 * the Sidewinder's 370 x 370 / (2 x 5 x 37) = 370 m. The 2,000 m trigger is
 * the rule near the station in Wegolite, which has no prefilter, and in
 * Oolite, whose collision-chain prefilter would alert an isolated
 * station-and-ship pair only within 2 x (500 + r), about 1,070 m per axis, but
 * is a no-op near the station because the planet chains every entity there
 * (see `FLYER_START_OFFSETS`); so 2,500 m is conservative in both. Plan 14-17
 * asserts the three script ranges equal the constants plan 14-16's spawner
 * exports.
 */
export const STATION_SCRIPT_RANGE_M = 2_500;

/**
 * The intercept script's range: the goal is met when `rangeToPrimaryTarget`
 * to the player (centre distance minus both collision radii,
 * `ShipEntity.m:9718-9733`) is below 1,500 m.
 */
export const INTERCEPT_SCRIPT_RANGE_M = 1_500;

/**
 * The flee script's range, the scanner range: the goal is met when the same
 * range to the player is above 25,600 m.
 */
export const FLEE_SCRIPT_RANGE_M = 25_600;

/**
 * The horizon: 18,000 ticks, 150 simulated seconds at DT = 1/120
 * (`src/sim/step.ts:8`), every tick checked. The run calls `stepSim` once per
 * tick and samples the world after each call. Tick t0 is the sample after the
 * first call that follows the conversion and the start placement, so the
 * pilots' first think (which runs in the think phase of that step, after its
 * update phase) has issued its ShipControl calls before the t0 sample; the
 * samples are t0 to t0 + 17,999, and the segment of t0 starts at the placed
 * start. A flyer whose desired speed is still below `FROZEN_MIN_DESIRED_SPEED`
 * at t0 (a script that sets no desired speed, such as attack and face) never
 * has window 0 evaluated by the frozen detector.
 */
export const HORIZON_TICKS = 18_000;

/**
 * The Vitest timeout of one epoch case, in milliseconds (five minutes). It
 * lives here so that the acceptance file's code holds no number.
 */
export const ACCEPTANCE_EPOCH_TIMEOUT_MS = 300_000;

/**
 * The 30-minute budget of the whole 20-epoch run, in milliseconds. Measured
 * and reported by plan 14-17, not asserted; it lives here so that the
 * acceptance file's code holds no number.
 */
export const ACCEPTANCE_RUN_BUDGET_MS = 1_800_000;

// ---------------------------------------------------------------------------
// Goal metrics (one definition each, used identically by the flight-script
// pilot's done check, the flyers scenario and the detectors)
// ---------------------------------------------------------------------------

/**
 * The goal metric of each goal-seeking script, one definition each:
 *
 * - station: the centre distance from the flyer to the station centre; goal
 *   met at or below `STATION_SCRIPT_RANGE_M`;
 * - intercept: `rangeToPrimaryTarget` to the player (centre distance minus
 *   both collision radii, `ShipEntity.m:9718-9733`); goal met below
 *   `INTERCEPT_SCRIPT_RANGE_M`;
 * - flee: the same range to the player; goal met above
 *   `FLEE_SCRIPT_RANGE_M`.
 *
 * An arrival is the goal met at any tick.
 */
export const GOAL_METRICS = Object.freeze({
  station: Object.freeze({
    metric: "centre distance to the station centre",
    goal: "at or below",
    rangeM: STATION_SCRIPT_RANGE_M,
  }),
  intercept: Object.freeze({
    metric: "rangeToPrimaryTarget to the player",
    goal: "below",
    rangeM: INTERCEPT_SCRIPT_RANGE_M,
  }),
  flee: Object.freeze({
    metric: "rangeToPrimaryTarget to the player",
    goal: "above",
    rangeM: FLEE_SCRIPT_RANGE_M,
  }),
});

// ---------------------------------------------------------------------------
// Windows: no stuck ship, no frozen ship
// ---------------------------------------------------------------------------

/**
 * The window length in ticks: fixed, non-overlapping windows of 3,600 ticks
 * (30 simulated seconds at DT = 1/120) aligned to t0. Window k covers ticks
 * t0 + 3,600 k to t0 + 3,600 (k + 1) - 1, five windows per seed. The
 * window-start value is the goal metric (or position) at the window's first
 * tick and the window-end value the value at its last tick.
 */
export const STUCK_WINDOW_TICKS = 3_600;

/**
 * No stuck ship. A window is evaluated for a station, intercept or flee flyer
 * only when its goal is unmet at every tick of the window (a goal met at any
 * tick, including mid-window, removes that window, and every later window of
 * that flyer, from evaluation). Progress is start - end for station and
 * intercept and end - start for flee: the net change of the goal metric, not
 * the path length. A window is stuck when progress is below
 * `STUCK_MIN_PROGRESS_FRACTION` x |start| or below `STUCK_MIN_PROGRESS_M`.
 */
export const STUCK_MIN_PROGRESS_FRACTION = 0.01;

/** The absolute minimum net progress of a stuck-window evaluation, in metres. */
export const STUCK_MIN_PROGRESS_M = 1;

/** Stuck windows allowed over the 20 seeds. */
export const MAX_STUCK_WINDOWS = 0;

/**
 * `shipAIFrustrated` events allowed over the 20 seeds, counted for station,
 * intercept and flee flyers while their goal is unmet.
 */
export const MAX_FRUSTRATION_EVENTS = 0;

/**
 * No frozen ship. A window is evaluated for every flyer whose
 * `nav.desiredSpeed` is at or above this many m/s at every tick of the window.
 * (Orbiting is the stuck detector's job; the frozen detector catches a ship
 * told to move that does not.)
 */
export const FROZEN_MIN_DESIRED_SPEED = 10;

/**
 * A window is frozen when the path length (the sum of the per-tick origin
 * displacements, not the net displacement) over the window is below this many
 * metres.
 */
export const FROZEN_MIN_DISPLACEMENT_M = 100;

/** Frozen windows allowed over the 20 seeds. */
export const MAX_FROZEN_WINDOWS = 0;

// ---------------------------------------------------------------------------
// No tunnelling
// ---------------------------------------------------------------------------

/**
 * The station's collision radius, 500 m, restated from
 * `layout.station.radius`. The layout builds it from the unexported
 * `STATION_RADIUS` (`src/sim/world/layout.ts:71`), which this file cannot
 * import; plan 14-17 asserts the two agree.
 */
export const STATION_RADIUS_M = 500;

/**
 * Ticks allowed with a flyer origin strictly inside the station's collision
 * sphere (radius `STATION_RADIUS_M`).
 */
export const MAX_STATION_SPHERE_ENTRIES = 0;

/**
 * The hull-crossing threshold. It counts every crossing episode, of any class,
 * that is not listed in `ACCEPTED_HULL_CROSSINGS` of
 * `tests/acceptance/accepted-crossings.ts`; no escalation option edits this
 * file, so accepting an episode never needs a second commit of it.
 *
 * Definition. A crossing tick of flyer f with body b is a tick k whose
 * segment, f's origin at the sample of tick k - 1 (the placed start for t0) to
 * its origin at the sample of tick k, hits b's hull at b's tick-k pose by the
 * two-stage rule: first the sphere of b's collision radius (the hull table's
 * `collisionRadius`, Oolite's `collision_radius`, the radius the steering and
 * the proximity pass use; not `octree.radius`, the octree root cube's
 * half-width), then the octree line test (`isHitByLine` through
 * `toOoliteModelSegment`). Every other ship and the player are candidates. A
 * zero-length segment (f did not move during the tick, for example a parked
 * flyer under a moving hull) is tested as the point at f's origin: a hit when
 * that point lies in a solid leaf of b's octree at b's tick-k pose.
 *
 * Episode rule. A crossing episode is a maximal run of consecutive crossing
 * ticks of the same epoch, flyer f and body b with the same class; a change
 * of class starts a new episode, and the episode's first tick names it.
 */
export const MAX_HULL_CROSSINGS = 0;

// ---------------------------------------------------------------------------
// Hull-crossing classes
// ---------------------------------------------------------------------------

/** One class of crossing tick. */
export type HullCrossingClass = "own-target" | "other-alert-ignored" | "other";

/**
 * The three hull-crossing classes, in classification order. A faithful port
 * can cross a hull, so `other` crossings are not blanket port defects and
 * accepting one must not need a second `thresholds.ts` commit. Each crossing
 * tick is classified from the crossing flyer's state at tick k - 1, in this
 * order:
 *
 * 1. `own-target` when its `nav.targetId` is the crossed body. A class by
 *    identity only: five target behaviours ignore an alert naming their own
 *    target through `hasProximityAlertIgnoringTarget:YES` (intercept
 *    `ShipEntity.m:3881`, slow dogfight 3950, which still avoids its own
 *    target within 2.5 times the radius sum at an aspect above 0, 3957-3959,
 *    attack fly-to 4631, attack fly-from 4787 and flee 4898; predicate
 *    9751-9757), while break-off reads `hasProximityAlertIgnoringTarget:NO` at
 *    3911, evasive and flee-evasive act on any alert at 4014, and six and
 *    twelve hand an alert naming their target over to fly-to and run fly-from
 *    at once at 4470-4475. At stock accuracy, drawn below 5, break-off
 *    (accuracy at least 6) is unreachable, evasive and flee-evasive are
 *    reached only through performFlee with accuracy above 0 and an aspect
 *    above 0.9995 (the dispatcher's own evasive branch is unreachable with
 *    weapon temperature 0), and six and twelve are reached by attackers with
 *    accuracy below 0.
 * 2. `other-alert-ignored` when its `steer.proximityAlert` does not name the
 *    crossed body (no alert was raised for it, a stronger one was held, or the
 *    body is below 2,000 kg, `ShipEntity.m:6105`) or its behaviour does not act
 *    on that alert, namely a behaviour outside `ALERT_ACTING_BEHAVIOURS`, or
 *    FLEE_TARGET with `steer.accuracy` below
 *    `FLEE_TARGET_ALERT_MIN_ACCURACY` (skips avoidance, 4898; about half of
 *    the stock draws).
 * 3. `other` otherwise: an alert naming the crossed body was held in a
 *    behaviour that acts on it, and the hull was crossed anyway.
 *
 * Owner-delegated decision (round 3 review, 2026-11-15, taken by the
 * orchestrator on the owner's delegation and recorded in plans 14-07, 14-17
 * and 14-19 and, through plan 14-19, in PROJECT.md): the owner may accept
 * crossings of any class; `MAX_HULL_CROSSINGS` = 0 stays the committed
 * threshold and an entry of `ACCEPTED_HULL_CROSSINGS` is the only way a
 * crossing is excused.
 */
export const HULL_CROSSING_CLASSES: readonly HullCrossingClass[] =
  Object.freeze(["own-target", "other-alert-ignored", "other"] as const);

/**
 * FLEE_TARGET acts on an alert only at an accuracy at or above this value
 * (`ShipEntity.m:4898`, `accuracy >= COMBAT_AI_ISNT_AWFUL`, which is 0,
 * `ShipEntity.h:124`).
 */
export const FLEE_TARGET_ALERT_MIN_ACCURACY = 0;

/**
 * The behaviours that act on a proximity alert, each with its Oolite line
 * (`src/Core/Entities/ShipEntity.m`); only ids the port implements (plan
 * 14-09's in-scope list). FLEE_TARGET acts only at an accuracy at or above
 * `FLEE_TARGET_ALERT_MIN_ACCURACY`.
 *
 * The other in-scope ids have no proximity call site in Oolite: IDLE
 * (3708-3722), STOP_STILL and STATION_KEEPING (both run stop-still,
 * 3700-3706), TUMBLE (3724-3727), the ATTACK_TARGET dispatcher (4038-4185) and
 * ATTACK_SNIPER (4397-4459).
 *
 * The out-of-scope ids run the port's idle fallback (plan 14-09), which has no
 * call site, so a crossing in one of them is classed `other-alert-ignored`;
 * Oolite's own functions for nine of them do act on alerts: TRACK_TARGET
 * (3812), COLLECT_TARGET (through the intercept function, 3881),
 * ATTACK_BROADSIDE_LEFT and ATTACK_BROADSIDE_RIGHT (4263-4267;
 * ATTACK_BROADSIDE itself only picks a side or a range behaviour, 4187-4233),
 * CLOSE_TO_BROADSIDE_RANGE (4341-4346), CLOSE_WITH_TARGET (4372-4377),
 * ATTACK_MINING_TARGET (4589-4593), RUNNING_DEFENSE (4827-4828 and 4835-4836)
 * and LAND_ON_PLANET (4997). None of the out-of-scope ids is reachable in the
 * run: the flight-script pilot performs only FLY_RANGE_FROM_DESTINATION,
 * INTERCEPT_TARGET, FLEE_TARGET, ATTACK_TARGET, FORMATION_FORM_UP,
 * FACE_DESTINATION and IDLE (plan 14-16); TRACK_TARGET, COLLECT_TARGET,
 * LAND_ON_PLANET and ATTACK_MINING_TARGET are set only by AI methods no flight
 * script calls (performHold, `ShipEntityAI.m:403`; performCollect, 361;
 * performLandOnPlanet, 424; performMining, 439); and the broadside, close and
 * running-defence ids are entered only from one another or from the dispatcher
 * with an aft, port or starboard weapon ready (`ShipEntity.m:4131-4136` and
 * 4171-4176), which none of the nine stock records has (plan 14-14). The
 * remaining out-of-scope ids (TRACK_AS_TURRET, FLY_THRU_NAVPOINTS, TRACTORED,
 * SCRIPTED_AI, SCRIPTED_ATTACK_AI, ENERGY_BOMB_COUNTDOWN) have no proximity
 * call site in Oolite either and are entered only by turret subentities, AI
 * methods, tractor capture or an energy bomb (`ShipEntity.m:893`, 10790 and
 * 11217; `ShipEntityAI.m:448`, 454 and 2371), none of which the run has. A
 * crossing episode in an out-of-scope id therefore means the run reached an id
 * it cannot reach; no Oolite line lets it happen, so the recommendation for it
 * is (b) or (c), never (a).
 */
export const ALERT_ACTING_BEHAVIOURS: readonly string[] = Object.freeze([
  // ShipEntity.m:5155-5168 (avoidCollision itself retreats from the alert)
  "AVOID_COLLISION",
  // ShipEntity.m:3881 (hasProximityAlertIgnoringTarget:YES)
  "INTERCEPT_TARGET",
  // ShipEntity.m:3911 (hasProximityAlertIgnoringTarget:NO)
  "ATTACK_BREAK_OFF_TARGET",
  // ShipEntity.m:3950 and 3957-3959 (own target avoided within 2.5 x radius sum)
  "ATTACK_SLOW_DOGFIGHT",
  // ShipEntity.m:4014 (any alert)
  "EVASIVE_ACTION",
  "FLEE_EVASIVE_ACTION",
  // ShipEntity.m:4470-4475 (hand over to fly-to and run fly-from at once)
  "ATTACK_FLY_TO_TARGET_SIX",
  "ATTACK_FLY_TO_TARGET_TWELVE",
  // ShipEntity.m:4630-4634 (hasProximityAlertIgnoringTarget:YES at 4631)
  "ATTACK_FLY_TO_TARGET",
  // ShipEntity.m:4787
  "ATTACK_FLY_FROM_TARGET",
  // ShipEntity.m:4898 (only at accuracy >= FLEE_TARGET_ALERT_MIN_ACCURACY)
  "FLEE_TARGET",
  // ShipEntity.m:4914
  "FLY_RANGE_FROM_DESTINATION",
  // ShipEntity.m:4962
  "FACE_DESTINATION",
  // ShipEntity.m:5044
  "FORMATION_FORM_UP",
  // ShipEntity.m:5131
  "FLY_TO_DESTINATION",
  // ShipEntity.m:5150
  "FLY_FROM_DESTINATION",
  "FORMATION_BREAK",
]);

/** The trailer line that approves a change of a frozen harness file (option (c)). */
export const DETECTOR_CHANGE_TRAILER = "Detector-change-approved-by-owner";

/**
 * The harness files of the frozen set (see the module comment): frozen from
 * the harness commit onward and changed afterwards only in a commit whose
 * message carries `DETECTOR_CHANGE_TRAILER: <date> <reason>`.
 */
export const FROZEN_HARNESS_FILES: readonly string[] = Object.freeze([
  "tests/acceptance/detectors.ts",
  "tests/acceptance/detectors.test.ts",
  "tests/acceptance/npc-flight.acceptance.ts",
  "src/sim/ai/pilots/flight-script.ts",
  "src/sim/ai/test-spawn.ts",
]);

// ---------------------------------------------------------------------------
// Player parking and start placement
// ---------------------------------------------------------------------------

/** One candidate parking axis. */
export interface ParkingAxis {
  readonly label: "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
  readonly vector: readonly [number, number, number];
}

/**
 * The candidate order of the parking axis a, and of the frame axis b: +x, -x,
 * +y, -y, +z, -z of the world frame.
 *
 * The player parking rule (deterministic, fixed before the run): the player is
 * parked at speed 0 with the identity orientation at P =
 * `station.position + PLAYER_PARK_DISTANCE_M x a` for the first axis a of this
 * order such that P and every start of `FLYER_START_OFFSETS` lie at least
 * `PLAYER_PARK_MIN_PLANET_CLEARANCE_M` outside the planet's radius and outside
 * the sun's radius. A seed with no qualifying axis fails; it is never skipped.
 *
 * For Lave with this placement the first candidate always qualifies (the
 * farthest start is 16.2 km from the station, the planet surface 41.1 km from
 * it, the sun much farther), so every epoch parks at a = +x with b = +y and
 * c = +z; the fail clause stays as a guard and is unreachable for Lave. (The
 * former clearance from the ships' lane positions is dropped, because no
 * converted ship stays on its lane.)
 */
export const PLAYER_PARK_AXIS_ORDER: readonly ParkingAxis[] = Object.freeze([
  Object.freeze({ label: "+x", vector: Object.freeze([1, 0, 0] as const) }),
  Object.freeze({ label: "-x", vector: Object.freeze([-1, 0, 0] as const) }),
  Object.freeze({ label: "+y", vector: Object.freeze([0, 1, 0] as const) }),
  Object.freeze({ label: "-y", vector: Object.freeze([0, -1, 0] as const) }),
  Object.freeze({ label: "+z", vector: Object.freeze([0, 0, 1] as const) }),
  Object.freeze({ label: "-z", vector: Object.freeze([0, 0, -1] as const) }),
]);

/**
 * The player's distance from the station centre when parked, 6,000 m (5,500 m
 * outside the station sphere).
 */
export const PLAYER_PARK_DISTANCE_M = 6_000;

/**
 * The clearance the parking point and every start must keep outside the
 * planet's radius and outside the sun's radius, 1,000 m.
 */
export const PLAYER_PARK_MIN_PLANET_CLEARANCE_M = 1_000;

/** What a start offset is measured from. */
export type StartBase = "station" | "player" | "leader";

/** One row of `FLYER_START_OFFSETS`: the start of the ship at `index`. */
export interface FlyerStartOffset {
  /** The ship's index i (ascending id, 0 to 11). */
  readonly index: number;
  /** The point the offset is added to: the station centre S, the parked player P or the leader's start. */
  readonly base: StartBase;
  /** For base `leader`: the leader's index; otherwise null. */
  readonly leaderIndex: number | null;
  /** The offset as coefficients of the frame axes a, b and c, in metres. */
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

/** 8,000 / sqrt(2): the diagonal component of the attack flyers' 8,000 m start. */
const ATTACK_DIAGONAL_M = 8_000 * Math.SQRT1_2;

function offset(
  index: number,
  base: StartBase,
  a: number,
  b: number,
  c: number,
  leaderIndex: number | null = null,
): FlyerStartOffset {
  return Object.freeze({ index, base, leaderIndex, a, b, c });
}

/**
 * The start placement (frozen data): the run keeps each converted ship's id,
 * spec key, record and random streams from the seeded world and moves it,
 * before t0, to a fixed start with speed 0 and the identity orientation, at a
 * position given in the frame (a, b, c).
 *
 * The frame. a is the parking axis of the parking rule (station to player); b
 * is the first axis of the order +x, -x, +y, -y, +z, -z that is perpendicular
 * to a; c = a x b. With S the station centre and P = S + 6,000 a the parked
 * player, in metres (for Lave: a = +x, b = +y, c = +z):
 *
 * - index 0 at S + 12,000 b and index 6 at S - 12,000 b (station: centre
 *   distance 12,000 at t0, goal at or below 2,500);
 * - index 1 at P + 15,000 c and index 7 at P - 15,000 c (intercept:
 *   `rangeToPrimaryTarget` about 14,900 at t0, above the 1,500 goal and inside
 *   the 1.25 x 25,600 = 32,000 m tracking limit, `ShipEntity.m:8705-8708`,
 *   where a target beyond it is lost on the first update, 9044-9046);
 * - index 2 at P + 5,000 a and index 8 at P + 5,000 b (flee: range about 4,900
 *   at t0, inside the 25,600 goal and the tracking limit; a flee flyer beyond
 *   25,600 m would meet its goal at t0);
 * - index 3 at P + 8,000 (c - b) / sqrt(2) and index 9 at P + 8,000 (b - c) /
 *   sqrt(2) (attack: 8,000 m, below the 12,500 m sniper range of
 *   `ShipEntity.m:4160` and above the 525 m nearby range of a beam laser,
 *   0.035 x 15,000, 4128);
 * - index 4 at the start of index 0 + 1,500 c and index 10 at the start of
 *   index 6 + 1,500 c (escorts beside their leaders);
 * - index 5 at S - 4,000 c (face: outside the station's 2,000 m proximity
 *   trigger) and index 11 at P + 8,000 c + 83 a (face, parked beside index 1's
 *   track: the designed near pass below).
 *
 * Checks made before this commit (the cited Oolite ranges are listed per
 * offset above): by construction every two starts are at least 4,000 m apart
 * except an escort and its leader (1,500 m), and no straight path from a
 * station, intercept or flee start to its goal passes within 4,000 m of
 * another start except the designed near pass (index 1's path passes index 11
 * at 83 m), so the placement sets up no crossing. Every start and P lie inside
 * the planet's +-2R interval on every axis (R = 41,160 m; the station is 2R
 * from the planet centre, `Universe.m:1541-1547`, and the tightest margin is
 * about 9.6 km, on b, for the station flyers at S +- 12,000 b), so Oolite's
 * collision-chain prefilter (each entity's +-2r interval must overlap another
 * entity's on every axis, `Universe.m:6713-6760` and 7045-7073,
 * `CollisionRegion.m:243-248`) is a no-op for every pair the placement brings
 * together: the planet collides (`Entity.m:825`, not overridden by
 * `OOPlanetEntity`) with the planet radius as its collision radius
 * (`OOPlanetEntity.m:120`) and chains every entity near the station.
 *
 * ## The designed near pass
 *
 * Without one, no placement raises an alert: attackers turn at range 525 m and
 * never come within the player's 291 m pair trigger, station flyers stop at
 * least 2,430 m from the station and interceptors at least 1,130 m from the
 * player, so a port whose proximity pass or AVOID_COLLISION were dead code
 * would pass all 20 seeds. The pass: index 1 starts at P + 15,000 c at speed 0
 * with the identity orientation, whose nose (local -Z, the world -c) points
 * straight at the parked player, so INTERCEPT_TARGET (`ShipEntity.m:3817-3826`:
 * no retreat, so no jink; the tracking curve of a static target aims at its
 * centre) flies it at zero heading error along the line P + s c with s falling
 * from 15,000 m, at its maximum speed (reached within 2.4 s, at 5 x thrust,
 * `ShipEntity.h:46`). Index 11 (face, slot 112) holds speed 0 at P + 8,000 c +
 * 83 a, because FACE_DESTINATION writes desired speed 0 every tick
 * (`ShipEntity.m:4925`) and the pilot's done state is IDLE with desired speed
 * 0, and no other start or straight path comes within 201 m of it before
 * index 1 arrives about 24 to 30 s after t0 (7,000 m at 240 to 300 m/s after
 * about 2 s of acceleration). No flyer is sent toward the player's six, P +
 * 0.5 x weaponRange x c, because ATTACK_FLY_TO_TARGET_SIX and _TWELVE vector in
 * to ATTACK_FLY_TO_TARGET at once when the target's speed is below 0.2 and
 * `universalID & 14` exceeds 4 (`ShipEntity.m:4523-4527`), evaluated on
 * Wegolite's ids, which holds for the hunter id 104 (104 & 14 = 8).
 *
 * The lateral offset L = 83 m holds for every record pair the two slots can
 * draw (slot 102: the Adder 29.03, Moray 36.19 or Cobra Mk I 39.26 m; slot 112:
 * the Adder 29.03 or Cobra Mk I 39.26 m; so 29.03 <= r1, r11 <= 39.26 m):
 *
 * - L is above the largest radius sum r1 + r11 = 78.52 m (by 4.48 m), so on the
 *   straight track the centre distance never falls to Oolite's contact distance
 *   (`CollisionRegion.m:298`, r1 + r2 at 296; Oolite stays in its no-contact
 *   branch, 314, and never runs the close collision check of 324), no hull
 *   touches the other and neither origin enters the other's collision sphere,
 *   which the hull-crossing detector's first stage uses;
 * - L is below the smallest `setProximityAlert:` zone 2 r1 + r11 = 2 r11 + r1 =
 *   2 x 29.03 + 29.03 = 87.09 m (by 4.09 m; `ShipEntity.m:6119-6131`);
 * - L is below the smallest pair trigger 4 max(r1, r11) = 116.1 m
 *   (`CollisionRegion.m:309`, inside the outer prefilter 4 (r1 + r11) of 299);
 * - both masses exceed 2,000 kg (the Adder, the lighter record of either slot,
 *   is 16,045 kg; `ShipEntity.m:6105`) and both ships are crewed;
 * - at the abreast sample the per-axis offsets are 83 m and at most one tick's
 *   travel (2.5 m at 300 m/s), both below 2 (r1 + r11) >= 116.1 m, so even an
 *   isolated pair is chained.
 *
 * At the first sample after index 1 passes abreast, index 11 lies behind it (no
 * forward stretch) at a centre distance of at most sqrt(83^2 + 2.5^2) = 83.04
 * m, inside both ships' zones and the pair trigger; before that sample the
 * stretched zone (the forward component times 0.25 at full speed) may already
 * hold. Hence in every seed the proximity pass alerts index 1 naming index 11
 * at the latest on that sample's tick, unless an earlier alert has already sent
 * it into AVOID_COLLISION, and on the next tick INTERCEPT_TARGET's call site
 * (`ShipEntity.m:3881`, `hasProximityAlertIgnoringTarget:YES`; the alert does
 * not name its target) enters AVOID_COLLISION, which then retreats from index
 * 11's position (5160-5163); if index 11 is still in FACE_DESTINATION, its own
 * call site (4962) makes it retreat as well. Any crossing the pass still
 * produces is counted and classified like every other. The run therefore
 * exercises a near pass inside the alert band and outside the contact
 * distance, not a head-on closure; head-on avoidance is covered by the oracle
 * fixtures of plan 14-06 and the world cases of plan 14-15, whose
 * parallel-offset case (a) uses the same band (an offset above r1 + r2 and
 * below the zone).
 */
export const FLYER_START_OFFSETS: readonly FlyerStartOffset[] = Object.freeze([
  offset(0, "station", 0, 12_000, 0),
  offset(1, "player", 0, 0, 15_000),
  offset(2, "player", 5_000, 0, 0),
  offset(3, "player", 0, -ATTACK_DIAGONAL_M, ATTACK_DIAGONAL_M),
  offset(4, "leader", 0, 0, 1_500, 0),
  offset(5, "station", 0, 0, -4_000),
  offset(6, "station", 0, -12_000, 0),
  offset(7, "player", 0, 0, -15_000),
  offset(8, "player", 0, 5_000, 0),
  offset(9, "player", 0, ATTACK_DIAGONAL_M, -ATTACK_DIAGONAL_M),
  offset(10, "leader", 0, 0, 1_500, 6),
  offset(11, "player", 83, 0, 8_000),
]);

// ---------------------------------------------------------------------------
// Run minimums
// ---------------------------------------------------------------------------

/**
 * The radius around the player's centre, 1,000 m, within which an attack
 * flyer's samples are counted by `RUN_MINIMUMS.attackTicksNearPlayer`. It is
 * an attack-pass measure, not hull proximity: attackers turn at 437.5 m (pulse)
 * or 525 m (beam) range and never enter the player's 291 m pair trigger, so a
 * near-hull attack count would be vacuous by Oolite's own rules, and the
 * designed near pass carries the hull-proximity floor.
 */
export const NEAR_PLAYER_RADIUS_M = 1_000;

/**
 * The run minimums, summed over the 20 seeds. A run below any minimum fails,
 * whatever its detector counts (without them the run could pass while testing
 * nothing).
 *
 * - `stationArrivals` >= 20 of the 40 station flyers (arrival = goal met at
 *   any tick; each starts 9,500 m outside its goal, which the Adder, the
 *   slowest record these slots draw, covers in about 40 s of the 150 s
 *   horizon);
 * - `interceptArrivals` >= 20 of 40 (about 13,400 m to cover, about 56 s for
 *   an Adder, plus a few seconds for index 1's avoidance);
 * - `fleeArrivals` >= 20 of 40 (about 20,700 m, about 86 s for an Adder);
 * - `avoidCollisionEntries` >= 20: the ticks at which a flyer's
 *   `nav.behaviour` becomes AVOID_COLLISION (AVOID_COLLISION at the sample of
 *   tick k and not at k - 1), summed over every flyer and seed; the designed
 *   near pass gives at least one entry per seed, 20 in the run;
 * - `attackTicksNearPlayer` >= 5,500: the attack-flyer samples whose centre
 *   lies within `NEAR_PLAYER_RADIUS_M` of the player's centre. The police
 *   attacker (index 9, slot 110, always the Viper, beam laser, accuracy in
 *   [0, 5] because the stock draw `randf() x 10 - 5` lies in [-5, 5) and police
 *   negate a negative draw, `ShipEntity.m:665-672`) is dispatched at range
 *   7,892 m to ATTACK_FLY_TO_TARGET (4156-4170: not nearby, forward weapon
 *   ready, range below the 12,500 m sniper range, accuracy at least 0) with
 *   zero jink (4157); inside the back-off range of 5,000 m (4652) its desired
 *   speed is at most 80 m/s: max(1.05 x 0, 0.25 x 320) = 80 m/s below accuracy
 *   5 (4663; `COMBAT_AI_IS_SMART` 5, and never at least `COMBAT_AI_FLEES_BETTER`
 *   6, `ShipEntity.h:126-128`) and 0.1 x 320 = 32 m/s at exactly 5, reached by a
 *   deceleration at 5 x 32 m/s^2 that ends near range 4,700 m; it turns away at
 *   the nearby range 0.035 x 15,000 = 525 m (4630 and 4128), a centre distance
 *   of 525 + 35.06 + 72.70 = 632.76 m; so on its first approach, reached about
 *   65 s after t0, it spends at least (1,000 - 632.76) / 80 = 4.59 s, 550 ticks
 *   at DT = 1/120, inside 1,000 m, and the 20 police approaches alone give at
 *   least 11,000 ticks; the floor is half of that, the hunter slot and every
 *   departure leg add more (the round 3 reviewer estimated about 34,000 in
 *   total);
 * - `stuckWindowsEvaluated` >= 60: window 0 of every intercept and flee flyer,
 *   four per seed, is evaluated because its goal stays unmet through the first
 *   30 s even at the Sidewinder's 370 m/s: 80 in the run;
 * - `frozenWindowsEvaluated` >= 40: the police attacker holds a desired speed
 *   of at least 32 m/s in fly-to (80 m/s below accuracy 5) and at least half its
 *   maximum in fly-from (4771), unchanged through the one-tick dispatcher
 *   visits, through windows 1 to 4: about 80 in the run; window 0 is not
 *   evaluated because its script sets no desired speed before t0.
 *
 * Which floor catches what: the arrival floors, `avoidCollisionEntries` and
 * `attackTicksNearPlayer` fail a run in which nothing flies, and plan 14-17's
 * no-AI control proves it; the two window floors guard detector vacuity (a
 * detector that evaluates nothing), not a port that does nothing, since an
 * unmoved fleet still has 30 stuck windows evaluated per seed (600 in a run),
 * which `MAX_STUCK_WINDOWS` = 0 then fails.
 */
export const RUN_MINIMUMS = Object.freeze({
  stationArrivals: 20,
  interceptArrivals: 20,
  fleeArrivals: 20,
  avoidCollisionEntries: 20,
  attackTicksNearPlayer: 5_500,
  stuckWindowsEvaluated: 60,
  frozenWindowsEvaluated: 40,
});

// ---------------------------------------------------------------------------
// No NaN repair
// ---------------------------------------------------------------------------

/** The sum of `entity.repairs` over the run. `hashWorld` must also never throw. */
export const MAX_REPAIRS = 0;

/** AI faults allowed over the run. */
export const MAX_AI_FAULTED = 0;

/** AI drops allowed over the run. */
export const MAX_AI_DROPPED = 0;
