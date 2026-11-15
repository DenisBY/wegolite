// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The detectors, the seed set-up and the run registration of the Phase 14
 * 20-seed acceptance run (plan 14-17; ROADMAP Phase 14, criterion 2).
 *
 * Every limit, definition, epoch, timeout, script mapping, start placement,
 * run minimum and the parking rule is IMPORTED from `./thresholds.js` and never
 * restated; this file implements the definitions that file documents. It is
 * frozen from the harness commit onward (`FROZEN_HARNESS_FILES`): a later change
 * needs a commit carrying the `Detector-change-approved-by-owner:` trailer.
 *
 * Layout of the file:
 *  1. the two-stage hull test (`segmentHitsHull`), reusing the octree line test
 *     of the combat hit rule, plus a point test for a zero-length segment;
 *  2. the seed set-up (`setUpSeed`): conversion by `SCRIPT_MAPPING`, the move to
 *     `FLYER_START_OFFSETS`, the escort fields and the player parking rule;
 *  3. the per-seed observer (`SeedObserver`), which consumes `Sample`s (one per
 *     tick, plus the placed start) and implements the stuck, frozen,
 *     hull-crossing, station-sphere, frustration, repair, AI fault and drop
 *     detectors and the run-minimum tallies;
 *  4. the seed driver (`runSeed`), the run totals (`checkRunMinimums`) and the
 *     Vitest registration (`registerAcceptanceRun`).
 *
 * Tick numbering. `Sample` index -1 is the placed start (before the first
 * `stepSim` call); the sample after the first call is tick 0 (t0 of the
 * thresholds file). A tick's segment is the flyer's origin at the previous
 * sample to its origin at this one; the segment of t0 starts at the placed
 * start.
 *
 * Test-only: this module imports from `src/` (the simulation, the content
 * readers of `tests/helpers`) and is never part of a bundle.
 */

import type { TestAPI } from "vitest";

import {
  createFlightScriptAi,
  scriptGoalMetric,
} from "../../src/sim/ai/pilots/flight-script.js";
import { FLYER_SCRIPT_RANGES } from "../../src/sim/ai/test-spawn.js";
import {
  isHitByLine,
  toOoliteModelSegment,
} from "../../src/sim/combat/octree.js";
import type { HullOctree, OctreeNode } from "../../src/sim/combat/octree.js";
import type { HullData, HullTable } from "../../src/sim/combat/hit.js";
import { DEFAULT_LASER_MOUNTS } from "../../src/sim/combat/mounts.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import { cross, identity, length, sub, vec } from "../../src/sim/math.js";
import type { Quat, Vec3 } from "../../src/sim/math.js";
import {
  PLAYER_COLLISION_RADIUS_M,
  statsFor,
} from "../../src/sim/npc/stats.js";
import { stepSim } from "../../src/sim/sim.js";
import { DT } from "../../src/sim/time.js";
import { PLAYER_ID } from "../../src/sim/world/ids.js";
import type { EntityId } from "../../src/sim/world/ids.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { hashWorld } from "../../src/sim/world/serialize.js";
import { createWorldView } from "../../src/sim/world/view-impl.js";
import type { World } from "../../src/sim/world/world.js";
import { realHullTable } from "../helpers/hull-table.js";
import { laveFixture, PLAYER_SHIP_KEY } from "../helpers/lave.js";
import { realNpcFlightTable } from "../helpers/npc-flight.js";
import { realNpcWeapons } from "../helpers/npc-weapons.js";
import {
  committedTrafficContent,
  laveInertWorld,
} from "../helpers/traffic-fixture.js";
import type { AcceptedHullCrossing } from "./accepted-crossings.js";
import {
  ACCEPTANCE_EPOCH_TIMEOUT_MS,
  ACCEPTANCE_EPOCHS,
  ALERT_ACTING_BEHAVIOURS,
  FLEE_SCRIPT_RANGE_M,
  FLEE_TARGET_ALERT_MIN_ACCURACY,
  FLYER_START_OFFSETS,
  FROZEN_MIN_DESIRED_SPEED,
  FROZEN_MIN_DISPLACEMENT_M,
  GOAL_METRICS,
  HORIZON_TICKS,
  INTERCEPT_SCRIPT_RANGE_M,
  MAX_AI_DROPPED,
  MAX_AI_FAULTED,
  MAX_FROZEN_WINDOWS,
  MAX_FRUSTRATION_EVENTS,
  MAX_HULL_CROSSINGS,
  MAX_REPAIRS,
  MAX_STATION_SPHERE_ENTRIES,
  MAX_STUCK_WINDOWS,
  NEAR_PLAYER_RADIUS_M,
  PLAYER_PARK_AXIS_ORDER,
  PLAYER_PARK_DISTANCE_M,
  PLAYER_PARK_MIN_PLANET_CLEARANCE_M,
  RUN_MINIMUMS,
  SCRIPT_MAPPING,
  STATION_RADIUS_M,
  STATION_SCRIPT_RANGE_M,
  STUCK_MIN_PROGRESS_FRACTION,
  STUCK_MIN_PROGRESS_M,
  STUCK_WINDOW_TICKS,
} from "./thresholds.js";
import type {
  FlyerScript,
  HullCrossingClass,
  ParkingAxis,
} from "./thresholds.js";

// ---------------------------------------------------------------------------
// 1. The hull test
// ---------------------------------------------------------------------------

/** A body's pose at one tick. */
export interface Pose {
  readonly position: Vec3;
  readonly orientation: Quat;
}

function allFinite(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** The distance from `point` to the segment `from` to `to`. */
function distanceToSegment(point: Vec3, from: Vec3, to: Vec3): number {
  const d = sub(to, from);
  const lengthSquared = d.x * d.x + d.y * d.y + d.z * d.z;
  if (lengthSquared === 0) return distance(point, from);
  const w = sub(point, from);
  const t = Math.min(
    1,
    Math.max(0, (w.x * d.x + w.y * d.y + w.z * d.z) / lengthSquared),
  );
  return distance(
    point,
    vec(from.x + d.x * t, from.y + d.y * t, from.z + d.z * t),
  );
}

/** The deepest tree the octree line test accepts (`MAX_OCTREE_DEPTH`). */
const POINT_TEST_MAX_LEVEL = 7;

/**
 * Whether the model-frame point `p` lies in a solid leaf of `node`, the cube of
 * half-width `half` centred on the origin. The octants are indexed
 * `x * 4 + y * 2 + z`, the plus side of an axis being 1 (the octree's own
 * convention, `src/sim/combat/octree.ts`), and a child cell is centred at
 * +-half / 2 with half-width half / 2.
 */
function pointInSolid(
  node: OctreeNode,
  half: number,
  p: Vec3,
  level: number,
): boolean {
  if (Math.abs(p.x) > half || Math.abs(p.y) > half || Math.abs(p.z) > half) {
    return false;
  }
  if (node === 0) return false;
  if (node === -1) return true;
  if (typeof node === "number" || node.length !== 8) return false;
  if (level >= POINT_TEST_MAX_LEVEL) return false;
  const ix = p.x >= 0 ? 1 : 0;
  const iy = p.y >= 0 ? 1 : 0;
  const iz = p.z >= 0 ? 1 : 0;
  const quarter = half / 2;
  const child = node[ix * 4 + iy * 2 + iz];
  if (child === undefined) return false;
  return pointInSolid(
    child,
    quarter,
    vec(
      p.x - (ix === 1 ? quarter : -quarter),
      p.y - (iy === 1 ? quarter : -quarter),
      p.z - (iz === 1 ? quarter : -quarter),
    ),
    level + 1,
  );
}

/** Whether the model-frame point lies in a solid leaf of the hull's octree. */
export function pointInHullSolid(octree: HullOctree, p: Vec3): boolean {
  if (!allFinite(p) || !Number.isFinite(octree.radius) || octree.radius <= 0) {
    return false;
  }
  return pointInSolid(octree.root, octree.radius, p, 0);
}

/**
 * The two-stage crossing rule of `thresholds.ts` (`MAX_HULL_CROSSINGS`): does
 * the segment `from` to `to` (a flyer's origin at the previous sample and at
 * this tick) hit the hull of a body at `body` (its tick-k pose)? First the
 * sphere of the hull's `collisionRadius` (the radius the steering and the
 * proximity pass use, never `octree.radius`), then the octree line test through
 * `toOoliteModelSegment`. A zero-length segment is tested as the point at
 * `from` against the solid leaves of the octree.
 */
export function segmentHitsHull(
  from: Vec3,
  to: Vec3,
  body: Pose,
  hull: HullData,
): boolean {
  const radius = hull.collisionRadius;
  if (!Number.isFinite(radius) || radius <= 0) return false;
  if (!allFinite(from) || !allFinite(to) || !allFinite(body.position)) {
    return false;
  }
  if (distanceToSegment(body.position, from, to) > radius) return false;
  const { w0, w1 } = toOoliteModelSegment(
    body.position,
    body.orientation,
    from,
    to,
  );
  const zeroLength = from.x === to.x && from.y === to.y && from.z === to.z;
  if (zeroLength) return pointInHullSolid(hull.octree, w0);
  return isHitByLine(hull.octree, w0, w1) > 0;
}

// ---------------------------------------------------------------------------
// 2. The seed set-up
// ---------------------------------------------------------------------------

/** One of the 12 converted ships. */
export interface FlyerInfo {
  readonly id: EntityId;
  /** The ship's index i, ships in ascending id (0 to 11). */
  readonly index: number;
  readonly script: FlyerScript;
}

/** What `setUpSeed` builds. */
export interface SeedSetup {
  readonly epoch: number;
  readonly world: World;
  readonly player: FlightState;
  readonly layout: SystemLayout;
  readonly flyers: readonly FlyerInfo[];
  /** The label of the parking axis a (`+x` for Lave). */
  readonly parkingAxis: ParkingAxis["label"];
  /** The 12 placed starts, by ship index. */
  readonly starts: readonly Vec3[];
}

/** The frame of the parking rule: the axes a, b, c and the player point P. */
interface ParkingFrame {
  readonly axis: ParkingAxis;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
  readonly park: Vec3;
  readonly starts: readonly Vec3[];
}

function axisVector(axis: ParkingAxis): Vec3 {
  return vec(axis.vector[0], axis.vector[1], axis.vector[2]);
}

/** The first axis of the candidate order perpendicular to `a`. */
function perpendicularAxis(a: Vec3): Vec3 {
  for (const candidate of PLAYER_PARK_AXIS_ORDER) {
    const v = axisVector(candidate);
    if (v.x * a.x + v.y * a.y + v.z * a.z === 0) return v;
  }
  throw new Error("no axis of the candidate order is perpendicular to a");
}

function combine(
  base: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  ca: number,
  cb: number,
  cc: number,
): Vec3 {
  return vec(
    base.x + ca * a.x + cb * b.x + cc * c.x,
    base.y + ca * a.y + cb * b.y + cc * c.y,
    base.z + ca * a.z + cb * b.z + cc * c.z,
  );
}

/** The frame, the parked player and the 12 starts for one candidate axis. */
function frameFor(station: Vec3, axis: ParkingAxis): ParkingFrame {
  const a = axisVector(axis);
  const b = perpendicularAxis(a);
  const c = cross(a, b);
  const park = combine(station, a, b, c, PLAYER_PARK_DISTANCE_M, 0, 0);
  const starts: Vec3[] = [];
  for (const row of FLYER_START_OFFSETS) {
    let base: Vec3;
    if (row.base === "station") {
      base = station;
    } else if (row.base === "player") {
      base = park;
    } else {
      const leader =
        row.leaderIndex === null ? undefined : starts[row.leaderIndex];
      if (leader === undefined) {
        throw new Error(`start ${String(row.index)} has no earlier leader`);
      }
      base = leader;
    }
    starts[row.index] = combine(base, a, b, c, row.a, row.b, row.c);
  }
  return { axis, a, b, c, park, starts };
}

/** Whether `point` keeps the parking clearance outside both the planet and the sun. */
function clearOfPlanetAndSun(layout: SystemLayout, point: Vec3): boolean {
  const planet = distance(point, layout.planet.position) - layout.planet.radius;
  const sun = distance(point, layout.sun.position) - layout.sun.radius;
  return (
    planet >= PLAYER_PARK_MIN_PLANET_CLEARANCE_M &&
    sun >= PLAYER_PARK_MIN_PLANET_CLEARANCE_M
  );
}

/**
 * The player parking rule of `PLAYER_PARK_AXIS_ORDER`: the first axis for which
 * P and every start keep the clearance outside the planet and the sun. A seed
 * with no qualifying axis fails (throws); it is never skipped.
 */
export function chooseParkingFrame(layout: SystemLayout): ParkingFrame {
  for (const axis of PLAYER_PARK_AXIS_ORDER) {
    const frame = frameFor(layout.station.position, axis);
    if (
      clearOfPlanetAndSun(layout, frame.park) &&
      frame.starts.every((start) => clearOfPlanetAndSun(layout, start))
    ) {
      return frame;
    }
  }
  throw new Error(
    "no parking axis qualifies: the seed fails, it is not skipped",
  );
}

/** The compiled flight table, read once. */
let flightTable: ReturnType<typeof realNpcFlightTable> | undefined;
function npcFlight(): ReturnType<typeof realNpcFlightTable> {
  return (flightTable ??= realNpcFlightTable());
}

/**
 * Build the seed of `epoch`: the Lave inert world (12 ships, ids 101 to 112),
 * the player parked by the parking rule, each ship moved to its
 * `FLYER_START_OFFSETS` start with speed 0 and the identity orientation, and,
 * with `withAi`, each ship given its flight-script pilot by `SCRIPT_MAPPING`
 * (an escort gets `ownerId` and `steer.escortSlot` written directly). Without
 * `withAi` the ships keep no AI and only the placement applies.
 */
export function setUpSeed(
  epoch: number,
  options: { readonly withAi: boolean },
): SeedSetup {
  const { layout } = laveFixture();
  const world = laveInertWorld(epoch);
  const frame = chooseParkingFrame(layout);

  const player = initFlightState(layout);
  player.mode = "inFlight";
  player.position = frame.park;
  player.orientation = identity();
  player.speed = 0;

  const ships = world.store.live.filter(
    (entity) => entity.kind === "ship" && !entity.dead,
  );
  if (ships.length !== FLYER_START_OFFSETS.length) {
    throw new Error(
      `the world of epoch ${String(epoch)} holds ${String(ships.length)} ships, expected ${String(FLYER_START_OFFSETS.length)}`,
    );
  }
  const flyers: FlyerInfo[] = [];
  ships.forEach((ship, index) => {
    const row = SCRIPT_MAPPING[index % SCRIPT_MAPPING.length];
    const start = frame.starts[index];
    if (row === undefined || start === undefined) {
      throw new Error(`no mapping or start for ship index ${String(index)}`);
    }
    ship.position = { ...start };
    ship.orientation = identity();
    ship.speed = 0;
    flyers.push({ id: ship.id, index, script: row.script });
  });

  if (options.withAi) {
    ships.forEach((ship, index) => {
      const row = SCRIPT_MAPPING[index % SCRIPT_MAPPING.length];
      if (row === undefined) throw new Error("no mapping row");
      const speed = statsFor(npcFlight(), ship.specKey).maxFlightSpeed;
      switch (row.script) {
        case "station":
          ship.ai = createFlightScriptAi(player.tick, {
            script: "station",
            range: STATION_SCRIPT_RANGE_M,
            speed,
          });
          break;
        case "intercept":
          ship.ai = createFlightScriptAi(player.tick, {
            script: "intercept",
            targetId: PLAYER_ID,
            range: INTERCEPT_SCRIPT_RANGE_M,
            speed,
          });
          break;
        case "flee":
          ship.ai = createFlightScriptAi(player.tick, {
            script: "flee",
            targetId: PLAYER_ID,
            range: FLEE_SCRIPT_RANGE_M,
            speed,
          });
          break;
        case "attack":
          ship.ai = createFlightScriptAi(player.tick, {
            script: "attack",
            targetId: PLAYER_ID,
          });
          break;
        case "escort": {
          const leaderIndex = index + (row.leaderIndexOffset ?? 0);
          const leader = ships[leaderIndex];
          if (leader === undefined) {
            throw new Error(`escort ${String(index)} has no leader`);
          }
          ship.ai = createFlightScriptAi(player.tick, { script: "escort" });
          ship.ownerId = leader.id;
          ship.steer.escortSlot = Math.floor(index / SCRIPT_MAPPING.length);
          break;
        }
        case "face":
          ship.ai = createFlightScriptAi(player.tick, { script: "face" });
          break;
      }
    });
  }

  return {
    epoch,
    world,
    player,
    layout,
    flyers,
    parkingAxis: frame.axis.label,
    starts: frame.starts,
  };
}

// ---------------------------------------------------------------------------
// 3. Samples and the per-seed observer
// ---------------------------------------------------------------------------

/** One flyer as the detectors see it at one sample. */
export interface ShipSample {
  readonly id: EntityId;
  readonly specKey: string;
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly behaviour: string;
  readonly targetId: EntityId;
  readonly desiredSpeed: number;
  /** `steer.proximityAlert`. */
  readonly proximityAlert: EntityId;
  /** `steer.accuracy`. */
  readonly accuracy: number;
  /** The flight-script pilot's raw `frustrated` count (0 without a pilot). */
  readonly frustrated: number;
  /** `scriptGoalMetric` of the flyer's script; undefined for a script with none. */
  readonly goalMetric: number | undefined;
}

/** One sample of the world: the 12 flyers (ascending id) and the player. */
export interface Sample {
  readonly ships: readonly ShipSample[];
  readonly player: Pose & { readonly specKey: string };
  /** The sum of `entity.repairs` over every live entity. */
  readonly repairs: number;
  /** `aiFaulted` events of the step that produced this sample. */
  readonly aiFaulted: number;
  /** `world.aiDropped`. */
  readonly aiDropped: number;
  /** `hashWorld` threw on this sample's world. */
  readonly hashFailed: boolean;
}

/** The goal state of a script's metric: met, per `GOAL_METRICS`. */
export function goalMet(script: FlyerScript, metric: number): boolean {
  switch (script) {
    case "station":
      return metric <= GOAL_METRICS.station.rangeM;
    case "intercept":
      return metric < GOAL_METRICS.intercept.rangeM;
    case "flee":
      return metric > GOAL_METRICS.flee.rangeM;
    default:
      return false;
  }
}

/** Whether a script has a goal metric (station, intercept and flee). */
function isGoalScript(script: FlyerScript): boolean {
  return script === "station" || script === "intercept" || script === "flee";
}

function copyVec(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function copyQuat(q: Quat): Quat {
  return { w: q.w, x: q.x, y: q.y, z: q.z };
}

/** Build one `Sample` from the live world. */
export function sampleSeed(
  setup: SeedSetup,
  step: { readonly aiFaulted: number; readonly hashFailed: boolean },
): Sample {
  const { world, player, layout, flyers } = setup;
  const view = createWorldView(
    world,
    player,
    layout,
    PLAYER_COLLISION_RADIUS_M,
  );
  const ships: ShipSample[] = [];
  for (const flyer of flyers) {
    const entity = world.store.get(flyer.id);
    if (entity === undefined || entity.dead) {
      throw new Error(`flyer ${String(flyer.id)} is gone`);
    }
    const frustrated = entity.ai?.params["frustrated"];
    ships.push({
      id: entity.id,
      specKey: entity.specKey,
      position: copyVec(entity.position),
      orientation: copyQuat(entity.orientation),
      behaviour: entity.nav.behaviour,
      targetId: entity.nav.targetId,
      desiredSpeed: entity.nav.desiredSpeed,
      proximityAlert: entity.steer.proximityAlert,
      accuracy: entity.steer.accuracy,
      frustrated: typeof frustrated === "number" ? frustrated : 0,
      goalMetric: isGoalScript(flyer.script)
        ? scriptGoalMetric(
            view,
            entity.id,
            flyer.script,
            flyer.script === "station" ? 0 : PLAYER_ID,
          )
        : undefined,
    });
  }
  let repairs = 0;
  for (const entity of world.store.live) {
    if (!entity.dead) repairs += entity.repairs;
  }
  return {
    ships,
    player: {
      position: copyVec(player.position),
      orientation: copyQuat(player.orientation),
      specKey: PLAYER_SHIP_KEY,
    },
    repairs,
    aiFaulted: step.aiFaulted,
    aiDropped: world.aiDropped,
    hashFailed: step.hashFailed,
  };
}

/** One crossing episode (see the episode rule in `thresholds.ts`). */
export interface CrossingEpisode {
  readonly epoch: number;
  readonly flyerId: EntityId;
  readonly crossedId: EntityId;
  readonly firstTick: number;
  lastTick: number;
  ticks: number;
  readonly crossingClass: HullCrossingClass;
  /** The flyer's state at the tick before the first tick. */
  readonly before: {
    readonly behaviour: string;
    readonly accuracy: number;
    readonly targetId: EntityId;
    readonly proximityAlert: EntityId;
  };
  /** Whether an `ACCEPTED_HULL_CROSSINGS` entry excuses it. */
  accepted: boolean;
}

/** The first offending tick and a count of one detector. */
export interface Counted {
  count: number;
  firstTick: number;
}

/** A stuck or frozen window the detectors flagged. */
export interface WindowFinding {
  readonly flyerId: EntityId;
  readonly script: FlyerScript;
  readonly window: number;
  readonly firstTick: number;
  readonly lastTick: number;
  /** The net progress (stuck) or the path length (frozen), in metres. */
  readonly value: number;
}

/** The tallies the run minimums are checked against (summed over the seeds). */
export interface RunTotals {
  stationArrivals: number;
  interceptArrivals: number;
  fleeArrivals: number;
  avoidCollisionEntries: number;
  attackTicksNearPlayer: number;
  stuckWindowsEvaluated: number;
  frozenWindowsEvaluated: number;
}

/** The result of one seed. */
export interface SeedResult {
  readonly epoch: number;
  readonly ticks: number;
  readonly stuck: Counted;
  readonly frozen: Counted;
  readonly frustration: Counted;
  readonly stationSphere: Counted;
  /** The episodes not excused by an accepted entry. */
  readonly hullCrossings: Counted;
  readonly repairs: Counted;
  readonly aiFaulted: Counted;
  readonly aiDropped: Counted;
  readonly hashFailures: Counted;
  readonly stuckFindings: readonly WindowFinding[];
  readonly frozenFindings: readonly WindowFinding[];
  /** Every crossing episode, accepted or not. */
  readonly episodes: readonly CrossingEpisode[];
  /** Accepted entries of this epoch that matched no episode (informational). */
  readonly staleAccepted: readonly AcceptedHullCrossing[];
  readonly tallies: RunTotals;
  /** Informational: the goal-state tick count of each goal script, over the seed. */
  readonly goalTicks: { station: number; intercept: number; flee: number };
  /** Informational: the minimum station-sphere clearance, metres (centre distance minus the radius). */
  readonly minStationClearance: number;
  /** Informational: the minimum clearance of any flyer origin to another body's collision sphere. */
  readonly minHullClearance: number;
  /** The goal metrics and the attackers' distances to the player at t0. */
  readonly t0: {
    readonly goals: readonly {
      readonly id: EntityId;
      readonly script: FlyerScript;
      readonly metric: number | undefined;
    }[];
    readonly attackerDistances: readonly number[];
  };
}

/** Per-flyer window and goal state. */
interface Track {
  readonly info: FlyerInfo;
  everMet: boolean;
  windowStartMetric: number;
  windowValid: boolean;
  frozenPath: number;
  frozenSpeedOk: boolean;
}

function newCounted(): Counted {
  return { count: 0, firstTick: -1 };
}

function bump(counted: Counted, tick: number, by = 1): void {
  if (by <= 0) return;
  if (counted.count === 0) counted.firstTick = tick;
  counted.count += by;
}

/** `accepted` matches `episode` by epoch, flyer, crossed body, first tick and class. */
export function acceptedMatches(
  entry: AcceptedHullCrossing,
  episode: CrossingEpisode,
): boolean {
  return (
    entry.epoch === episode.epoch &&
    entry.flyerId === episode.flyerId &&
    entry.crossedId === episode.crossedId &&
    entry.firstTick === episode.firstTick &&
    entry.crossingClass === episode.crossingClass
  );
}

/**
 * Classify a crossing tick from the crossing flyer's state at tick k - 1, in the
 * order `thresholds.ts` gives: `own-target` (its target is the crossed body),
 * else `other-alert-ignored` (no alert naming the crossed body, a behaviour
 * outside `ALERT_ACTING_BEHAVIOURS`, or FLEE_TARGET below the accuracy floor),
 * else `other`.
 */
export function classifyCrossing(
  before: Pick<
    ShipSample,
    "behaviour" | "accuracy" | "targetId" | "proximityAlert"
  >,
  crossedId: EntityId,
): HullCrossingClass {
  if (before.targetId === crossedId) return "own-target";
  if (
    before.proximityAlert !== crossedId ||
    !ALERT_ACTING_BEHAVIOURS.includes(before.behaviour) ||
    (before.behaviour === "FLEE_TARGET" &&
      before.accuracy < FLEE_TARGET_ALERT_MIN_ACCURACY)
  ) {
    return "other-alert-ignored";
  }
  return "other";
}

/** The seed-level observer: feed it the placed start, then one sample per tick. */
export class SeedObserver {
  private readonly tracks: Track[];
  private readonly episodes: CrossingEpisode[] = [];
  private readonly open = new Map<string, CrossingEpisode>();
  private readonly stuck = newCounted();
  private readonly frozen = newCounted();
  private readonly frustration = newCounted();
  private readonly stationSphere = newCounted();
  private readonly repairs = newCounted();
  private readonly aiFaulted = newCounted();
  private readonly aiDropped = newCounted();
  private readonly hashFailures = newCounted();
  private readonly stuckFindings: WindowFinding[] = [];
  private readonly frozenFindings: WindowFinding[] = [];
  private readonly tallies: RunTotals = emptyTotals();
  private readonly goalTicks = { station: 0, intercept: 0, flee: 0 };
  private readonly arrived = new Set<EntityId>();
  private readonly t0Goals: {
    id: EntityId;
    script: FlyerScript;
    metric: number | undefined;
  }[] = [];
  private readonly t0AttackerDistances: number[] = [];
  private minStationClearance = Number.POSITIVE_INFINITY;
  private minHullClearance = Number.POSITIVE_INFINITY;
  private previous: Sample | undefined;
  private tick = 0;

  constructor(
    private readonly epoch: number,
    flyers: readonly FlyerInfo[],
    private readonly hulls: HullTable,
    private readonly station: Vec3,
    private readonly accepted: readonly AcceptedHullCrossing[],
  ) {
    this.tracks = flyers.map((info) => ({
      info,
      everMet: false,
      windowStartMetric: 0,
      windowValid: false,
      frozenPath: 0,
      frozenSpeedOk: false,
    }));
  }

  /** Record the placed start (the sample before the first `stepSim` call). */
  start(sample: Sample): void {
    this.previous = sample;
  }

  /** Observe the sample of the next tick (tick 0 is the sample after the first call). */
  observe(sample: Sample): void {
    const previous = this.previous;
    if (previous === undefined) {
      throw new Error("SeedObserver.observe called before start");
    }
    const k = this.tick;
    this.observeGlobals(sample, k);
    this.tracks.forEach((track, index) => {
      const now = sample.ships[index];
      const before = previous.ships[index];
      if (now === undefined || before === undefined) {
        throw new Error("a sample does not hold every flyer");
      }
      this.observeFlyer(track, index, now, before, sample, k);
    });
    this.previous = sample;
    this.tick += 1;
  }

  private observeGlobals(sample: Sample, k: number): void {
    if (sample.repairs > this.repairs.count) {
      if (this.repairs.count === 0) this.repairs.firstTick = k;
      this.repairs.count = sample.repairs;
    }
    bump(this.aiFaulted, k, sample.aiFaulted);
    if (sample.aiDropped > this.aiDropped.count) {
      if (this.aiDropped.count === 0) this.aiDropped.firstTick = k;
      this.aiDropped.count = sample.aiDropped;
    }
    if (sample.hashFailed) bump(this.hashFailures, k);
  }

  private observeFlyer(
    track: Track,
    index: number,
    now: ShipSample,
    before: ShipSample,
    sample: Sample,
    k: number,
  ): void {
    const { info } = track;

    // Station sphere: the origin strictly inside the collision sphere.
    const stationDistance = distance(now.position, this.station);
    this.minStationClearance = Math.min(
      this.minStationClearance,
      stationDistance - STATION_RADIUS_M,
    );
    if (stationDistance < STATION_RADIUS_M) bump(this.stationSphere, k);

    // Hull crossings against every other ship and the player.
    sample.ships.forEach((other, otherIndex) => {
      if (otherIndex === index) return;
      this.crossing(now, before, other, other.id, other.specKey, k);
    });
    this.crossing(
      now,
      before,
      sample.player,
      PLAYER_ID,
      sample.player.specKey,
      k,
    );

    // AVOID_COLLISION entries and the attack passes near the player.
    if (
      now.behaviour === "AVOID_COLLISION" &&
      before.behaviour !== "AVOID_COLLISION"
    ) {
      this.tallies.avoidCollisionEntries += 1;
    }
    const playerDistance = distance(now.position, sample.player.position);
    if (info.script === "attack" && playerDistance <= NEAR_PLAYER_RADIUS_M) {
      this.tallies.attackTicksNearPlayer += 1;
    }
    if (k === 0) {
      if (info.script === "attack")
        this.t0AttackerDistances.push(playerDistance);
      if (isGoalScript(info.script)) {
        this.t0Goals.push({
          id: info.id,
          script: info.script,
          metric: now.goalMetric,
        });
      }
    }

    // Goals, arrivals, frustration and the stuck windows.
    if (isGoalScript(info.script)) this.observeGoal(track, now, before, k);

    // Frozen windows (every flyer).
    this.observeFrozen(track, now, before, k);
  }

  private crossing(
    now: ShipSample,
    before: ShipSample,
    body: Pose,
    bodyId: EntityId,
    bodySpecKey: string,
    k: number,
  ): void {
    const hull = this.hulls.get(bodySpecKey);
    if (hull === undefined) return;
    this.minHullClearance = Math.min(
      this.minHullClearance,
      distance(now.position, body.position) - hull.collisionRadius,
    );
    if (!segmentHitsHull(before.position, now.position, body, hull)) return;
    const crossingClass = classifyCrossing(before, bodyId);
    const key = `${String(now.id)}:${String(bodyId)}`;
    const open = this.open.get(key);
    if (
      open !== undefined &&
      open.lastTick === k - 1 &&
      open.crossingClass === crossingClass
    ) {
      open.lastTick = k;
      open.ticks += 1;
      return;
    }
    const episode: CrossingEpisode = {
      epoch: this.epoch,
      flyerId: now.id,
      crossedId: bodyId,
      firstTick: k,
      lastTick: k,
      ticks: 1,
      crossingClass,
      before: {
        behaviour: before.behaviour,
        accuracy: before.accuracy,
        targetId: before.targetId,
        proximityAlert: before.proximityAlert,
      },
      accepted: false,
    };
    episode.accepted = this.accepted.some((entry) =>
      acceptedMatches(entry, episode),
    );
    this.episodes.push(episode);
    this.open.set(key, episode);
  }

  private observeGoal(
    track: Track,
    now: ShipSample,
    before: ShipSample,
    k: number,
  ): void {
    const { info } = track;
    const script = info.script;
    const metric = now.goalMetric;
    const pos = k % STUCK_WINDOW_TICKS;

    // Frustration events while the goal was unmet at the previous sample.
    const previousMet =
      before.goalMetric !== undefined && goalMet(script, before.goalMetric);
    if (!previousMet) {
      bump(this.frustration, k, now.frustrated - before.frustrated);
    }

    if (pos === 0) {
      track.windowValid = !track.everMet;
      track.windowStartMetric = metric ?? Number.NaN;
    }
    if (metric === undefined) {
      track.windowValid = false;
    } else if (goalMet(script, metric)) {
      track.everMet = true;
      track.windowValid = false;
      if (script === "station" || script === "intercept" || script === "flee") {
        this.goalTicks[script] += 1;
      }
      if (!this.arrived.has(info.id)) {
        this.arrived.add(info.id);
        if (script === "station") this.tallies.stationArrivals += 1;
        else if (script === "intercept") this.tallies.interceptArrivals += 1;
        else this.tallies.fleeArrivals += 1;
      }
    }
    if (pos === STUCK_WINDOW_TICKS - 1 && track.windowValid) {
      if (metric === undefined || Number.isNaN(track.windowStartMetric)) return;
      this.tallies.stuckWindowsEvaluated += 1;
      const start = track.windowStartMetric;
      const progress = script === "flee" ? metric - start : start - metric;
      if (
        progress < STUCK_MIN_PROGRESS_FRACTION * Math.abs(start) ||
        progress < STUCK_MIN_PROGRESS_M
      ) {
        bump(this.stuck, k);
        this.stuckFindings.push({
          flyerId: info.id,
          script,
          window: Math.floor(k / STUCK_WINDOW_TICKS),
          firstTick: k - (STUCK_WINDOW_TICKS - 1),
          lastTick: k,
          value: progress,
        });
      }
    }
  }

  private observeFrozen(
    track: Track,
    now: ShipSample,
    before: ShipSample,
    k: number,
  ): void {
    const pos = k % STUCK_WINDOW_TICKS;
    if (pos === 0) {
      track.frozenPath = 0;
      track.frozenSpeedOk = true;
    } else {
      track.frozenPath += distance(now.position, before.position);
    }
    track.frozenSpeedOk &&= now.desiredSpeed >= FROZEN_MIN_DESIRED_SPEED;
    if (pos === STUCK_WINDOW_TICKS - 1 && track.frozenSpeedOk) {
      this.tallies.frozenWindowsEvaluated += 1;
      if (track.frozenPath < FROZEN_MIN_DISPLACEMENT_M) {
        bump(this.frozen, k);
        this.frozenFindings.push({
          flyerId: track.info.id,
          script: track.info.script,
          window: Math.floor(k / STUCK_WINDOW_TICKS),
          firstTick: k - (STUCK_WINDOW_TICKS - 1),
          lastTick: k,
          value: track.frozenPath,
        });
      }
    }
  }

  /** The seed's result after the observed ticks. */
  result(): SeedResult {
    const unexcused = this.episodes.filter((episode) => !episode.accepted);
    const hullCrossings: Counted = {
      count: unexcused.length,
      firstTick: unexcused[0]?.firstTick ?? -1,
    };
    const stale = this.accepted.filter(
      (entry) =>
        entry.epoch === this.epoch &&
        !this.episodes.some((episode) => acceptedMatches(entry, episode)),
    );
    return {
      epoch: this.epoch,
      ticks: this.tick,
      stuck: { ...this.stuck },
      frozen: { ...this.frozen },
      frustration: { ...this.frustration },
      stationSphere: { ...this.stationSphere },
      hullCrossings,
      repairs: { ...this.repairs },
      aiFaulted: { ...this.aiFaulted },
      aiDropped: { ...this.aiDropped },
      hashFailures: { ...this.hashFailures },
      stuckFindings: [...this.stuckFindings],
      frozenFindings: [...this.frozenFindings],
      episodes: [...this.episodes],
      staleAccepted: stale,
      tallies: { ...this.tallies },
      goalTicks: { ...this.goalTicks },
      minStationClearance: this.minStationClearance,
      minHullClearance: this.minHullClearance,
      t0: {
        goals: [...this.t0Goals],
        attackerDistances: [...this.t0AttackerDistances],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Run minimums, the seed driver and the registration
// ---------------------------------------------------------------------------

/** All-zero run totals. */
export function emptyTotals(): RunTotals {
  return {
    stationArrivals: 0,
    interceptArrivals: 0,
    fleeArrivals: 0,
    avoidCollisionEntries: 0,
    attackTicksNearPlayer: 0,
    stuckWindowsEvaluated: 0,
    frozenWindowsEvaluated: 0,
  };
}

/** Add one seed's tallies to the run totals. */
export function addTotals(totals: RunTotals, seed: RunTotals): void {
  totals.stationArrivals += seed.stationArrivals;
  totals.interceptArrivals += seed.interceptArrivals;
  totals.fleeArrivals += seed.fleeArrivals;
  totals.avoidCollisionEntries += seed.avoidCollisionEntries;
  totals.attackTicksNearPlayer += seed.attackTicksNearPlayer;
  totals.stuckWindowsEvaluated += seed.stuckWindowsEvaluated;
  totals.frozenWindowsEvaluated += seed.frozenWindowsEvaluated;
}

/** One run minimum a run's totals miss. */
export interface MissedMinimum {
  readonly name: keyof typeof RUN_MINIMUMS;
  readonly total: number;
  readonly minimum: number;
}

/** Every floor of `RUN_MINIMUMS` the totals miss, in the file's order. */
export function checkRunMinimums(totals: RunTotals): MissedMinimum[] {
  const missed: MissedMinimum[] = [];
  const names = Object.keys(RUN_MINIMUMS) as (keyof typeof RUN_MINIMUMS)[];
  for (const name of names) {
    const minimum = RUN_MINIMUMS[name];
    if (totals[name] < minimum) {
      missed.push({ name, total: totals[name], minimum });
    }
  }
  return missed;
}

/** Every threshold a seed result breaches, as readable lines (empty when clean). */
export function seedBreaches(result: SeedResult): string[] {
  const out: string[] = [];
  const check = (label: string, counted: Counted, max: number): void => {
    if (counted.count > max) {
      out.push(
        `${label}: ${String(counted.count)} (limit ${String(max)}, first at tick ${String(counted.firstTick)})`,
      );
    }
  };
  check("stuck windows", result.stuck, MAX_STUCK_WINDOWS);
  check("frozen windows", result.frozen, MAX_FROZEN_WINDOWS);
  check("frustration events", result.frustration, MAX_FRUSTRATION_EVENTS);
  check(
    "station-sphere entries",
    result.stationSphere,
    MAX_STATION_SPHERE_ENTRIES,
  );
  check("hull-crossing episodes", result.hullCrossings, MAX_HULL_CROSSINGS);
  check("repairs", result.repairs, MAX_REPAIRS);
  check("aiFaulted", result.aiFaulted, MAX_AI_FAULTED);
  check("aiDropped", result.aiDropped, MAX_AI_DROPPED);
  check("hashWorld failures", result.hashFailures, 0);
  return out;
}

let stepOptionsCache: StepOptions | undefined;

/** The step options of the run: the real flight table, hulls, weapons and masses. */
function runStepOptions(): StepOptions {
  if (stepOptionsCache !== undefined) return stepOptionsCache;
  const { system } = laveFixture();
  const content = committedTrafficContent();
  stepOptionsCache = {
    hyperspace: {
      fuel: 7,
      origin: { id: system.id, x: system.chartX, y: system.chartY },
      shipMasses: content.masses,
    },
    npcFlight: npcFlight(),
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: realHullTable(),
      npcWeapons: realNpcWeapons(),
    },
  };
  return stepOptionsCache;
}

/** What `runSeed` returns besides the result. */
export interface SeedRun {
  readonly result: SeedResult;
  readonly elapsedMs: number;
}

/**
 * A stepper for a set-up seed: each call runs one `stepSim` (the real flight
 * table, hulls, weapons and masses), calls `hashWorld` (a throw is reported on
 * the sample, never propagated) and returns the sample of the new tick.
 */
export function createSeedStepper(setup: SeedSetup): () => Sample {
  const { config } = laveFixture();
  const stepOptions = runStepOptions();
  return (): Sample => {
    const events = stepSim(
      setup.player,
      setup.world,
      setup.layout,
      config,
      ZERO_INTENT,
      [],
      DT,
      stepOptions,
      undefined,
    );
    let hashFailed = false;
    try {
      hashWorld(setup.player, setup.world);
    } catch {
      hashFailed = true;
    }
    let aiFaulted = 0;
    for (const event of events) {
      if (event.kind === "aiFaulted") aiFaulted += 1;
    }
    return sampleSeed(setup, { aiFaulted, hashFailed });
  };
}

/**
 * Run one seed: set it up, step `ticks` ticks (`HORIZON_TICKS` for the
 * acceptance run), sample every tick, call `hashWorld` every tick and feed the
 * observer. `accepted` is the accepted-crossings list.
 */
export function runSeed(
  epoch: number,
  accepted: readonly AcceptedHullCrossing[],
  options: { readonly withAi: boolean; readonly ticks: number },
): SeedRun {
  const started = Date.now();
  const setup = setUpSeed(epoch, { withAi: options.withAi });
  const observer = new SeedObserver(
    epoch,
    setup.flyers,
    realHullTable(),
    setup.layout.station.position,
    accepted,
  );
  const step = createSeedStepper(setup);
  observer.start(sampleSeed(setup, { aiFaulted: 0, hashFailed: false }));
  for (let i = 0; i < options.ticks; i += 1) observer.observe(step());
  return { result: observer.result(), elapsedMs: Date.now() - started };
}

/** A one-line JSON summary of a seed, printed for the record. */
function seedSummary(run: SeedRun): string {
  const { result } = run;
  return JSON.stringify({
    epoch: result.epoch,
    ticks: result.ticks,
    elapsedMs: run.elapsedMs,
    stuck: result.stuck.count,
    frozen: result.frozen.count,
    frustration: result.frustration.count,
    stationSphere: result.stationSphere.count,
    hullCrossingEpisodes: result.episodes.length,
    hullCrossingsUnexcused: result.hullCrossings.count,
    repairs: result.repairs.count,
    aiFaulted: result.aiFaulted.count,
    aiDropped: result.aiDropped.count,
    hashFailures: result.hashFailures.count,
    tallies: result.tallies,
    goalTicks: result.goalTicks,
    minStationClearance: result.minStationClearance,
    minHullClearance: result.minHullClearance,
  });
}

/**
 * Register the acceptance run on `it`: one case `epoch <n>` per
 * `ACCEPTANCE_EPOCHS` entry (top level, timeout `ACCEPTANCE_EPOCH_TIMEOUT_MS`)
 * and then the case `run minimums`, which asserts that the totals of the epochs
 * that ran miss no floor of `RUN_MINIMUMS`. The cases of one file run in order.
 */
export function registerAcceptanceRun(
  it: TestAPI,
  accepted: readonly AcceptedHullCrossing[],
): void {
  const totals = emptyTotals();
  const stale: AcceptedHullCrossing[] = [];
  for (const epoch of ACCEPTANCE_EPOCHS) {
    it(
      `epoch ${String(epoch)}`,
      () => {
        const { layout } = laveFixture();
        if (STATION_RADIUS_M !== layout.station.radius) {
          throw new Error(
            `STATION_RADIUS_M ${String(STATION_RADIUS_M)} differs from layout.station.radius ${String(layout.station.radius)}`,
          );
        }
        if (
          FLYER_SCRIPT_RANGES.station !== STATION_SCRIPT_RANGE_M ||
          FLYER_SCRIPT_RANGES.intercept !== INTERCEPT_SCRIPT_RANGE_M ||
          FLYER_SCRIPT_RANGES.flee !== FLEE_SCRIPT_RANGE_M
        ) {
          throw new Error(
            "the thresholds' script ranges differ from FLYER_SCRIPT_RANGES",
          );
        }
        const run = runSeed(epoch, accepted, {
          withAi: true,
          ticks: HORIZON_TICKS,
        });
        addTotals(totals, run.result.tallies);
        stale.push(...run.result.staleAccepted);
        console.log(`ACCEPTANCE-SEED ${seedSummary(run)}`);
        for (const episode of run.result.episodes) {
          console.log(`ACCEPTANCE-EPISODE ${JSON.stringify(episode)}`);
        }
        const breaches = seedBreaches(run.result);
        if (breaches.length > 0) {
          throw new Error(
            `epoch ${String(epoch)} breaches: ${breaches.join("; ")}`,
          );
        }
      },
      ACCEPTANCE_EPOCH_TIMEOUT_MS,
    );
  }
  it("run minimums", () => {
    console.log(`ACCEPTANCE-TOTALS ${JSON.stringify(totals)}`);
    for (const entry of stale) {
      console.log(`ACCEPTANCE-STALE ${JSON.stringify(entry)}`);
    }
    const missed = checkRunMinimums(totals);
    if (missed.length > 0) {
      throw new Error(
        `run minimums missed: ${missed
          .map(
            (floor) =>
              `${floor.name} ${String(floor.total)} < ${String(floor.minimum)}`,
          )
          .join("; ")}`,
      );
    }
  });
}
