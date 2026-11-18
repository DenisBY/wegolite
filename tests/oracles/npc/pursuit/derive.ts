// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Closed forms and one-tick transliterations behind the pursuit oracle
 * (Phase 14, plan 14-02): intercept, flee, the attack dispatcher and its
 * in-scope sub-behaviours, and the perform entry effects that draw randomness.
 *
 * Independence: this module imports nothing from `src/` and nothing from plan
 * 14-01's files (`../schema.ts`, `../reference/**`); the two oracle plans run
 * side by side. Its only input is the pinned Oolite source (commit `7437f22`),
 * cited line by line below. The fixtures' expected values come from here and
 * from hand closed forms; the self-test re-derives every one of them.
 *
 * Scope of the transliteration. `stepTick` replays ONE native update of the
 * steered ship's behaviour code (`processBehaviour:`, `ShipEntity.m:2485-2638`)
 * from a given state, followed by the speed clamp of `applyThrust:`
 * (`ShipEntity.m:5808-5854`). It does not move or rotate the ship
 * (`applyAttitudeChanges:` and `moveForward:` are plan 14-01's reference), so a
 * repeated call is a replay with the ship's pose frozen. A fixture may ask for
 * a later-tick value only where that is exact: a static pose (speed 0 and
 * desired speed 0), a decision that cannot flip inside the horizon (the
 * self-test bounds the ship's displacement), or a closed form of the target's
 * motion.
 *
 * Float widths. Oolite stores most state in `GLfloat`. `frustration` and
 * `success_factor` are rounded with `Math.fround` on every write (contract item
 * 8); every other quantity is computed here in float64, and a fixture's
 * tolerance states the float32 slack. A pose near a decision threshold is
 * avoided, never covered by a wider tolerance (contract item 6).
 *
 * Weapon state (Phase 17, plan 17-02). A fixture may state the forward weapon
 * temperature the behaviour reads at its FIRST update (after Oolite's cooling
 * at the top of that update, `ShipEntity.m:2214-2218`) and the `missedShots`
 * count. `stepTick` cools the temperature once per later update in float32
 * and records, per update, whether the behaviour reaches a `fireMainWeapon:`
 * call (`World.fireRequests`); whether the gate then lets a shot out is not
 * modelled here. With temperature 0 and `missedShots` 0 (the defaults) every
 * Phase 14 derivation is unchanged.
 */

// ---------------------------------------------------------------------------
// vectors

export type V3 = readonly [number, number, number];

export const DT = 1 / 120;

export const ZERO: V3 = [0, 0, 0];

export function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: V3, b: V3): V3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function mag(a: V3): number {
  return Math.sqrt(dot(a, a));
}
export function norm(a: V3): V3 {
  const m = mag(a);
  return m === 0 ? a : scale(a, 1 / m);
}

/**
 * An orthonormal right-handed frame for a forward that is perpendicular to the
 * world up (0, 1, 0): `right = up x forward`, so `right x up = forward`
 * (contract item 3).
 */
export function frameFromForward(forward: V3): {
  forward: V3;
  up: V3;
  right: V3;
} {
  const f = norm(forward);
  const up: V3 = [0, 1, 0];
  if (Math.abs(dot(f, up)) > 1e-12) {
    throw new Error("frameFromForward needs a forward perpendicular to up");
  }
  return { forward: f, up, right: cross(up, f) };
}

/** A unit forward whose dot with `towards` is exactly `aspect` (in the xz plane). */
export function forwardWithAspect(aspect: number, towards: V3): V3 {
  // towards is a unit vector in the xz plane; rotate it by the angle whose cosine is aspect.
  const sin = Math.sqrt(Math.max(0, 1 - aspect * aspect));
  const perp: V3 = [-towards[2], 0, towards[0]];
  return add(scale(towards, aspect), scale(perp, sin));
}

// ---------------------------------------------------------------------------
// accumulators (contract item 8)

/**
 * The value of a counter after `steps` writes of `Math.fround(f + step)` from
 * `start` (GLfloat accumulation, `ShipEntity.m:4866`, `4021`, ...).
 */
export function accumulate(start: number, step: number, steps: number): number {
  let f = Math.fround(start);
  for (let i = 0; i < steps; i += 1) f = Math.fround(f + step);
  return f;
}

/**
 * The first number of steps after which a counter written as
 * `Math.fround(f + step)` from `start` exceeds `threshold`. Every
 * frustration tick of this subtree comes from here, never from
 * `ceil(seconds * 120)`: 0.5 s is 61 (not 60), 15 s is 1801 (not 1800).
 */
export function firstTickAbove(
  threshold: number,
  step: number = DT,
  start = 0,
): number {
  let f = Math.fround(start);
  for (let tick = 1; tick <= 1_000_000; tick += 1) {
    f = Math.fround(f + step);
    if (f > threshold) return tick;
  }
  throw new Error("threshold not reached");
}

// ---------------------------------------------------------------------------
// constants (ShipEntity.h:46-137, equipment.plist weapon_info.range)

export const COMBAT_IN_RANGE_FACTOR = 0.035;
export const COMBAT_OUT_RANGE_FACTOR = 0.5;
export const COMBAT_WEAPON_RANGE_FACTOR = 1.2;
export const COMBAT_JINK_OFFSET = 500;
export const COMBAT_AI_CONFIDENCE_FACTOR = 1_250_000;
export const COMBAT_AI_ISNT_AWFUL = 0;
export const COMBAT_AI_IS_SMART = 5;
export const COMBAT_AI_FLEES_BETTER = 6;
export const COMBAT_AI_DOGFIGHTER = 6.5;
export const COMBAT_AI_TRACKS_CLOSER = 7.5;
export const COMBAT_AI_FLEES_BETTER_2 = 9;
export const COMBAT_REACTION_TIME = 1.5;
export const SELF_ID = 101;

/** `ShipEntity.h:115-120`: the weapon temperature constants, as float32 values. */
export const WEAPON_COOLING_FACTOR = 6;
export const NPC_MAX_WEAPON_TEMP = 256;
export const WEAPON_COOLING_CUTOUT = Math.fround(0.85);
/** `COMBAT_AI_WEAPON_TEMP_READY`: `0.25f * NPC_MAX_WEAPON_TEMP` = 64. */
export const WEAPON_TEMP_READY = Math.fround(Math.fround(0.25) * 256);
/** `COMBAT_AI_WEAPON_TEMP_USABLE`: `fround(0.85) * 256` as a float32 product (217.60000610351562). */
export const WEAPON_TEMP_USABLE = Math.fround(WEAPON_COOLING_CUTOUT * 256);

/**
 * One cooling step (`ShipEntity.m:2214-2218`): `fmaxf(T - (float)(6.0f * dt), 0.0f)`,
 * the subtraction rounded to float32.
 */
export function coolOnce(temperature: number, dt: number = DT): number {
  const step = Math.fround(WEAPON_COOLING_FACTOR * dt);
  return Math.fround(Math.max(Math.fround(temperature - step), 0));
}

/**
 * The temperature the behaviour reads at update `update` (1-based), given the
 * value it reads at update 1: cooled `update - 1` more times.
 */
export function temperatureAtUpdate(
  readAtUpdateOne: number,
  update: number,
  dt: number = DT,
): number {
  let temperature = Math.fround(readAtUpdateOne);
  for (let k = 1; k < update; k += 1) temperature = coolOnce(temperature, dt);
  return temperature;
}

/** The weapon state a fixture may state (contract item 1 of the fire-site oracle). */
export interface WeaponState {
  /** `forward_weapon_temp` as the behaviour reads it at update 1 (a float32 value). */
  forwardWeaponTemp: number;
  /** `missedShots`, constant over a fixture (it changes only when a shot resolves). */
  missedShots: number;
}

export type ForwardWeapon =
  | "EQ_WEAPON_NONE"
  | "EQ_WEAPON_PULSE_LASER"
  | "EQ_WEAPON_BEAM_LASER"
  | "EQ_WEAPON_MINING_LASER"
  | "EQ_WEAPON_MILITARY_LASER";

/**
 * `getWeaponRangeFromType` (`ShipEntity.m:13041-13044`): the `range` of the
 * `weapon_info` of `Resources/Config/equipment.plist` (pulse 12500 at line 132,
 * beam 15000 at 150, mining 12500 at 170, military 30000 at 191; the vendored
 * `third_party/oolite/Config/equipment.plist` is identical). A ship with no forward
 * weapon has a nil weapon type (`ShipEntity.m:443-466`) and messaging nil
 * returns 0, so its weapon range is 0, not a laser range.
 */
export function weaponRange(weapon: ForwardWeapon): number {
  switch (weapon) {
    case "EQ_WEAPON_NONE":
      return 0;
    case "EQ_WEAPON_PULSE_LASER":
      return 12500;
    case "EQ_WEAPON_BEAM_LASER":
      return 15000;
    case "EQ_WEAPON_MINING_LASER":
      return 12500;
    case "EQ_WEAPON_MILITARY_LASER":
      return 30000;
  }
}

// ---------------------------------------------------------------------------
// the world a step reads

export type EventName =
  | "shipAchievedDesiredRange"
  | "shipNowFacingDestination"
  | "shipAIFrustrated"
  | "shipTargetLost";

export interface Stats {
  maxFlightSpeed: number;
  maxFlightRoll: number;
  maxFlightPitch: number;
  thrust: number;
  mass: number;
  forwardWeapon: ForwardWeapon;
  scannerRange: number;
}

export interface SelfState {
  id: number;
  scanClass: string;
  radius: number;
  position: V3;
  forward: V3;
  up: V3;
  right: V3;
  speed: number;
  flightRoll: number;
  flightPitch: number;
  stickRoll: number;
  stickPitch: number;
  accuracy: number;
  frustration: number;
  successFactor: number;
  pitchingOver: 0 | 1;
  jink: V3;
  behaviour: string;
  targetId: number;
  destination: V3;
  desiredRange: number;
  desiredSpeed: number;
  ownerId: number;
  escortSlot: number;
}

export interface Body {
  id: number;
  kind: "ship" | "player" | "station" | "planet" | "sun" | "buoy";
  scanClass: string;
  radius: number;
  mass: number;
  position: V3;
  forward: V3;
  up: V3;
  right: V3;
  speed: number;
  behaviour: string;
  targetId: number;
}

export interface Assignment {
  op:
    | "setTarget"
    | "setDestination"
    | "setDesiredRange"
    | "setDesiredSpeed"
    | "perform";
  value: number | string | V3;
}

export interface Check {
  tick: number;
  field: string;
  expected: number | string;
  tolerance: number;
  note: string;
}

/** The part of a fixture the derivations read (the contract's keys). */
export interface FixtureLike {
  id: string;
  dt: number;
  horizon: number;
  stats: Stats;
  self: SelfState;
  bodies: Body[];
  motion: "static" | "constant-velocity";
  assign: Assignment[];
  draws: number[];
  checks: Check[];
  events: { tick: number; name: string }[];
  /** Weapon state; absent means temperature 0 and `missedShots` 0. */
  weapon?: Partial<WeaponState>;
}

/** Unit draws in Oolite's call order (contract item 7). */
export class Draws {
  private index = 0;
  constructor(private readonly values: readonly number[]) {}
  /** `randf()`: one unit draw. */
  unit(): number {
    const u = this.values[this.index];
    if (u === undefined)
      throw new Error("the fixture ran out of scripted draws");
    this.index += 1;
    return u;
  }
  /** `ranrot_rand() % n`: one draw, `floor(u * n)`. */
  ranrot(n: number): number {
    return Math.floor(this.unit() * n);
  }
  get consumed(): number {
    return this.index;
  }
}

export interface World {
  stats: Stats;
  self: SelfState;
  bodies: Body[];
  motion: "static" | "constant-velocity";
  /** The number of native updates applied so far (the tick of the state). */
  tick: number;
  draws: Draws;
  events: { tick: number; name: EventName }[];
  /** The tracking curve's constant position before its first sample (tick 60). */
  aimBase: V3 | null;
  /** The forward weapon temperature (as read at the current update) and `missedShots`. */
  weapon: WeaponState;
  /** The updates (1-based) at which the behaviour reached a `fireMainWeapon:` call. */
  fireRequests: number[];
}

function cloneSelf(s: SelfState): SelfState {
  return structuredClone(s);
}

export function buildWorld(fixture: FixtureLike): World {
  return {
    stats: fixture.stats,
    self: cloneSelf(fixture.self),
    bodies: structuredClone(fixture.bodies),
    motion: fixture.motion,
    tick: 0,
    draws: new Draws(fixture.draws),
    events: [],
    aimBase: null,
    weapon: {
      forwardWeaponTemp: Math.fround(fixture.weapon?.forwardWeaponTemp ?? 0),
      missedShots: fixture.weapon?.missedShots ?? 0,
    },
    fireRequests: [],
  };
}

/** A `fireMainWeapon:` call is reached at the current update (whatever the gate then decides). */
function requestFire(world: World): void {
  world.fireRequests.push(world.tick);
}

/** The position of a body at tick `k` under the fixture's `motion` (contract item 4 (a)). */
export function bodyPosition(world: World, body: Body, tick = world.tick): V3 {
  if (world.motion === "static") return body.position;
  return add(body.position, scale(body.forward, body.speed * DT * tick));
}

function emit(world: World, name: EventName): void {
  world.events.push({ tick: world.tick, name });
}

/** `isShip` kinds: ships, the player, stations and buoys are ShipEntity subclasses. */
const SHIP_KINDS = new Set(["ship", "player", "station", "buoy"]);

/** `primaryTarget` (`ShipEntity.m:8718-8733`) with `isValidTarget:` (8638-8656). */
export function primaryTarget(world: World): Body | null {
  const id = world.self.targetId;
  if (id === 0) return null;
  const body = world.bodies.find((b) => b.id === id);
  if (body === undefined) {
    world.self.targetId = 0;
    return null;
  }
  if (!SHIP_KINDS.has(body.kind)) {
    // A planet or sun is neither a ship nor a wormhole: not a valid target.
    world.self.targetId = 0;
    return null;
  }
  return body;
}

// ---------------------------------------------------------------------------
// range, aspect, aim tolerance (ShipEntity.m:9718-9810, 1126-1143)

function targetPose(world: World, target: Body): V3 {
  return bodyPosition(world, target);
}

/** `rangeToPrimaryTarget`: centre distance minus both collision radii; 0 for a nil target (9723-9734). */
export function rangeToPrimaryTarget(world: World): number {
  const target = primaryTarget(world);
  if (target === null) return 0;
  const delta = sub(targetPose(world, target), world.self.position);
  return mag(delta) - target.radius - world.self.radius;
}

/** Closed form of `rangeToPrimaryTarget` from two poses (centre distance minus both radii). */
export function rangeBetween(
  selfPosition: V3,
  selfRadius: number,
  targetPosition: V3,
  targetRadius: number,
): number {
  return mag(sub(targetPosition, selfPosition)) - targetRadius - selfRadius;
}

/** `approachAspectToPrimaryTarget` (9736-9749): the target's forward against the direction from it to self. */
export function approachAspectToPrimaryTarget(world: World): number {
  const target = primaryTarget(world);
  if (target === null) return 0;
  const delta = sub(world.self.position, targetPose(world, target));
  return dot(norm(delta), target.forward);
}

/** Closed form of the approach aspect from two poses. */
export function approachAspect(
  selfPosition: V3,
  targetPosition: V3,
  targetForward: V3,
): number {
  return dot(norm(sub(selfPosition, targetPosition)), targetForward);
}

/**
 * `currentAimTolerance` (9761-9810) under the scope cut that no ship is sunlit
 * and the weapon faces forward. `aim_tolerance = 240 - 18 * accuracy` (1138).
 * For accuracy at least 0 the basic aim shrinks with misses, `basic_aim /= 1 +
 * missedShots / 4` (9769), before the `/ 5` of accuracy at least 7.5 (9775).
 */
export function currentAimTolerance(accuracy: number, missedShots = 0): number {
  let basicAim = 240 - 18 * accuracy;
  let bestCos = 0.99999;
  if (accuracy >= COMBAT_AI_ISNT_AWFUL) {
    bestCos = 0.999999;
    basicAim /= 1 + missedShots / 4;
  }
  if (accuracy >= COMBAT_AI_TRACKS_CLOSER) {
    bestCos = 0.9999999;
    basicAim /= 5;
  }
  const maxCos = Math.sqrt(1 - (basicAim * basicAim) / 100000000);
  return maxCos < bestCos ? maxCos : bestCos;
}

export function aimTolerance(accuracy: number): number {
  return 240 - 18 * accuracy;
}

// ---------------------------------------------------------------------------
// the tracking curve (ShipEntity.m:5412-5489)

export interface CurveSample {
  position: V3;
  time: number;
}

/**
 * `calculateTrackingCurve` (5469-5489): the quadratic through samples 1 to 3,
 * as coefficients `[c0, c1, c2]` about `times[1]`.
 */
export function trackingCurveCoefficients(
  positions: readonly [V3, V3, V3, V3],
  times: readonly [number, number, number, number],
): [V3, V3, V3] {
  const t1 = times[2] - times[1];
  const t2 = times[3] - times[1];
  const c0 = positions[1];
  const c1 = add(
    add(
      scale(positions[1], -(t1 + t2) / (t1 * t2)),
      scale(positions[2], -t2 / (t1 * (t1 - t2))),
    ),
    scale(positions[3], t1 / (t2 * (t1 - t2))),
  );
  const c2 = add(
    add(
      scale(positions[1], 1 / (t1 * t2)),
      scale(positions[2], 1 / (t1 * (t1 - t2))),
    ),
    scale(positions[3], -1 / (t2 * (t1 - t2))),
  );
  return [c0, c1, c2];
}

/**
 * `calculateTargetPosition` (5412-5423) for a target moving on a straight line
 * at constant velocity, with the curve started at tick 0 by `setTarget`
 * (`startTrackingCurve`, 5425-5442) and updated every 60 ticks while
 * `ticks[0] + 60 <= now` (5448; the integer clock of contract item 8): four
 * samples of the tick-0 position at ticks 0, -60, -120, -180, then a new
 * sample of the target's position at ticks 60, 120, 180, ... shifted in as
 * `positions[0]` (5450-5465). Times are in seconds (`tick * dt`).
 *
 * `position(k)` is the target's position at tick `k`.
 */
export function trackingAimPoint(
  position: (tick: number) => V3,
  tick: number,
  dt: number = DT,
): V3 {
  const sampleEvery = Math.round(COMBAT_REACTION_TIME / 3 / dt); // 60 at 1/120
  const p0 = position(0);
  let positions: [V3, V3, V3, V3] = [p0, p0, p0, p0];
  let ticks: [number, number, number, number] = [
    0,
    -sampleEvery,
    -2 * sampleEvery,
    -3 * sampleEvery,
  ];
  for (let k = 1; k <= tick; k += 1) {
    if (ticks[0] + sampleEvery > k) continue;
    positions = [position(k), positions[0], positions[1], positions[2]];
    ticks = [k, ticks[0], ticks[1], ticks[2]];
  }
  const seconds = ticks.map((t) => t * dt) as [number, number, number, number];
  const [c0, c1, c2] = trackingCurveCoefficients(positions, seconds);
  const t = tick * dt - seconds[1];
  return add(add(c0, scale(c1, t)), scale(c2, t * t));
}

/** The aim point of a fixture's primary target at `tick` (closed form, tick 0 onward). */
export function aimPointOf(world: World, tick: number): V3 {
  const target = primaryTarget(world);
  if (target === null) return ZERO;
  return trackingAimPoint((k) => bodyPosition(world, target, k), tick);
}

// ---------------------------------------------------------------------------
// the shared flight helpers a behaviour calls

/** `setEvasiveJink:` (ShipEntity.m:8980-9001): two `ranrot_rand() % 256` draws when accuracy is at least 0. */
export function setEvasiveJink(world: World, z: number): void {
  const s = world.self;
  if (s.accuracy < COMBAT_AI_ISNT_AWFUL) {
    s.jink = ZERO;
    return;
  }
  let x = world.draws.ranrot(256) - 128;
  let y = world.draws.ranrot(256) - 128;
  x = x < 0 ? x - 128 : x + 128;
  y = y < 0 ? y - 128 : y + 128;
  s.jink = [x, y, z];
}

/** `applySticks:` (ShipEntity.m:7018-7065) for roll and pitch (yaw stays 0). */
export function applySticks(world: World, dt: number): void {
  const s = world.self;
  let rate1 = 2 * dt;
  let rate2 = 4 * dt;
  if (
    (s.stickRoll > 0 && s.flightRoll < 0) ||
    (s.stickRoll < 0 && s.flightRoll > 0)
  )
    rate1 *= 4;
  if (
    (s.stickPitch > 0 && s.flightPitch < 0) ||
    (s.stickPitch < 0 && s.flightPitch > 0)
  )
    rate2 *= 4;
  if (s.accuracy >= COMBAT_AI_TRACKS_CLOSER) {
    if (s.stickRoll === 0) rate1 *= 2;
    if (s.stickPitch === 0) rate2 *= 2;
  }
  if (s.flightRoll < s.stickRoll - rate1) s.flightRoll += rate1;
  else if (s.flightRoll > s.stickRoll + rate1) s.flightRoll -= rate1;
  else s.flightRoll = s.stickRoll;
  if (s.flightPitch < s.stickPitch - rate2) s.flightPitch += rate2;
  else if (s.flightPitch > s.stickPitch + rate2) s.flightPitch -= rate2;
  else s.flightPitch = s.stickPitch;
}

/** `noteLostTarget` (ShipEntity.m:8774-8797): posts shipTargetLost and drops the target. */
function noteLostTarget(world: World): void {
  world.self.targetId = 0;
  emit(world, "shipTargetLost");
}

/** `noteLostTargetAndGoIdle` (8799-8804): IDLE, frustration 0, then the lost-target event. */
function noteLostTargetAndGoIdle(world: World): void {
  world.self.behaviour = "IDLE";
  world.self.frustration = 0;
  noteLostTarget(world);
}

/** `canStillTrackPrimaryTarget` (8696-8716): the target is valid and within 1.25 x scanner range. */
function canStillTrackPrimaryTarget(world: World): boolean {
  const target = primaryTarget(world);
  if (target === null) return false;
  const range2 = mag(sub(targetPose(world, target), world.self.position)) ** 2;
  return !(
    range2 >
    world.stats.scannerRange * world.stats.scannerRange * 1.5625
  );
}

/**
 * The stick-scaling terms of `trackPrimaryTarget:retreat:NO` (9121-9143): the
 * dead zone `min_d`, the factor cap and the per-factor fraction. Accuracy at
 * least 7.5 gets the precise set whatever the misses; accuracy in [0, 7.5)
 * loses `0.0001` of `min_d` per missed shot and, once `min_d` would fall below
 * 0.001, floors it there while doubling the cap and halving the fraction
 * (9134-9141); below 0 the base set stays.
 */
export function trackingFactors(
  accuracy: number,
  missedShots: number,
  maxFlightPitch: number,
): { minD: number; maxFactor: number; rMaxFactor: number } {
  let minD = 0.004;
  let maxFactor = 8;
  let rMaxFactor = 0.125;
  if (accuracy >= COMBAT_AI_TRACKS_CLOSER) {
    if (maxFlightPitch > 1) {
      maxFactor = Math.floor(maxFlightPitch / 0.125);
      rMaxFactor = 1 / maxFactor;
    }
    minD = 0.0004;
    maxFactor *= 3;
    rMaxFactor /= 3;
  } else if (accuracy >= COMBAT_AI_ISNT_AWFUL) {
    minD -= 0.0001 * missedShots;
    if (minD < 0.001) {
      minD = 0.001;
      maxFactor *= 2;
      rMaxFactor /= 2;
    }
  }
  return { minD, maxFactor, rMaxFactor };
}

/** `trackPrimaryTarget:retreat:` (ShipEntity.m:9034-9244), non-missile. */
export function trackPrimaryTarget(
  world: World,
  retreat: boolean,
  dt = DT,
): number {
  const s = world.self;
  const target = primaryTarget(world);
  if (target === null) {
    noteLostTargetAndGoIdle(world);
    return 0;
  }
  if (!canStillTrackPrimaryTarget(world)) {
    noteLostTargetAndGoIdle(world);
    return 0;
  }
  if (world.aimBase === null) {
    throw new Error("no tracking curve: assign setTarget before tracking");
  }
  // calculateTargetPosition at the update's own tick (5412-5423)
  let relPos = sub(aimPointOf(world, world.tick), s.position);
  const range2 = mag(sub(targetPose(world, target), s.position)) ** 2;

  if (retreat) {
    const vx = target.right;
    const vy = target.up;
    const vz = target.forward;
    let avoidCollision = false;
    if (range2 < s.radius * target.radius * 100) {
      const direction: V3 =
        relPos[0] === 0 && relPos[1] === 0 && relPos[2] === 0
          ? [0, 0, 1]
          : norm(relPos);
      avoidCollision = dot(direction, s.forward) > -0.1;
    }
    let distAdjust = 1;
    if (s.accuracy >= COMBAT_AI_FLEES_BETTER) {
      const r = mag(relPos);
      if (r > 2000) {
        distAdjust = r / 2000;
        if (s.accuracy >= COMBAT_AI_FLEES_BETTER_2) distAdjust *= 3;
      }
      if (s.jink[0] === 0 && s.behaviour !== "RUNNING_DEFENSE")
        setEvasiveJink(world, 400);
    }
    if (!avoidCollision) {
      const j = s.jink;
      relPos = [
        relPos[0] + (j[0] * vx[0] + j[1] * vy[0] + j[2] * vz[0]) * distAdjust,
        relPos[1] + (j[0] * vx[1] + j[1] * vy[1] + j[2] * vz[1]) * distAdjust,
        // the z component takes no distance factor (9105)
        relPos[2] + (j[0] * vx[2] + j[1] * vy[2] + j[2] * vz[2]),
      ];
    }
  }

  relPos =
    relPos[0] === 0 && relPos[1] === 0 && relPos[2] === 0
      ? [0, 0, 1]
      : norm(relPos);

  const maxCos = currentAimTolerance(s.accuracy, world.weapon.missedShots);
  s.stickRoll = 0;
  s.stickPitch = 0;
  const reverse = retreat ? -1 : 1;

  let minD = 0.004;
  let maxFactor = 8;
  let rMaxFactor = 0.125;
  if (!retreat) {
    ({ minD, maxFactor, rMaxFactor } = trackingFactors(
      s.accuracy,
      world.weapon.missedShots,
      world.stats.maxFlightPitch,
    ));
  }

  const dRight = dot(relPos, s.right);
  let dUp = dot(relPos, s.up);
  let dForward = dot(relPos, s.forward);

  if (dForward * reverse > maxCos) return dForward; // on target (9149)

  s.stickPitch = 0;
  s.stickRoll = 0;
  if (reverse * dForward < -0.5 && s.pitchingOver === 0) s.pitchingOver = 1;
  if (s.pitchingOver === 1) {
    s.stickPitch =
      reverse * dUp > 0
        ? -world.stats.maxFlightPitch
        : world.stats.maxFlightPitch;
    s.pitchingOver = reverse * dForward < 0.707 ? 1 : 0;
  }

  const { maxFlightRoll, maxFlightPitch } = world.stats;
  if (dForward < maxCos || retreat) {
    if (dForward < -maxCos) dUp = minD * 2;
    if (dUp > minD) {
      const factor = Math.min(
        maxFactor,
        Math.trunc(Math.sqrt(Math.abs(dRight) / Math.abs(minD))),
      );
      if (dRight > minD) s.stickRoll = -maxFlightRoll * rMaxFactor * factor;
      if (dRight < -minD) s.stickRoll = maxFlightRoll * rMaxFactor * factor;
    }
    if (dUp < -minD) {
      const factor = Math.min(
        maxFactor,
        Math.trunc(Math.sqrt(Math.abs(dRight) / Math.abs(minD))),
      );
      if (dRight > minD) s.stickRoll = maxFlightRoll * rMaxFactor * factor;
      if (dRight < -minD) s.stickRoll = -maxFlightRoll * rMaxFactor * factor;
    }
    if (s.stickRoll === 0) {
      const factor = Math.min(
        maxFactor,
        Math.trunc(Math.sqrt(Math.abs(dUp) / Math.abs(minD))),
      );
      if (dUp > minD)
        s.stickPitch = -maxFlightPitch * reverse * rMaxFactor * factor;
      if (dUp < -minD)
        s.stickPitch = maxFlightPitch * reverse * rMaxFactor * factor;
    }
    if (s.accuracy >= COMBAT_AI_ISNT_AWFUL) {
      if (Math.abs(dRight) < Math.abs(s.stickRoll) * dt) {
        s.stickRoll = (Math.abs(dRight) / dt) * (s.stickRoll < 0 ? -1 : 1);
      }
      if (Math.abs(dUp) < Math.abs(s.stickPitch) * dt) {
        s.stickPitch = (Math.abs(dUp) / dt) * (s.stickPitch < 0 ? -0.9 : 0.9);
      }
    }
  }

  applySticks(world, dt);
  if (retreat) dForward *= dForward;
  if (dForward < 0) return 0;
  if (s.flightRoll === 0 && s.flightPitch === 0) return 1;
  return dForward;
}

/** `evasiveAction:` (9003-9032): full stick to the sign of the current rate; roll only when the right axes disagree. */
export function evasiveAction(world: World, dt = DT): void {
  const s = world.self;
  s.stickRoll = s.flightRoll;
  s.stickPitch = s.flightPitch;
  const target = primaryTarget(world);
  if (target === null) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  const agreement = dot(s.right, target.right);
  if (agreement > -0.3 && agreement < 0.3) {
    s.stickRoll = 0;
  } else {
    s.stickRoll =
      s.stickRoll >= 0 ? world.stats.maxFlightRoll : -world.stats.maxFlightRoll;
  }
  s.stickPitch =
    s.stickPitch >= 0
      ? world.stats.maxFlightPitch
      : -world.stats.maxFlightPitch;
  applySticks(world, dt);
}

/** The speed clamp of `applyThrust:` (5808-5854): no afterburner, so `desired_speed` never exceeds the maximum. */
function clampDesiredSpeed(world: World): void {
  if (world.self.desiredSpeed > world.stats.maxFlightSpeed) {
    world.self.desiredSpeed = world.stats.maxFlightSpeed;
  }
}

function writeFrustration(world: World, value: number): void {
  world.self.frustration = Math.fround(value);
}
function writeSuccessFactor(world: World, value: number): void {
  world.self.successFactor = Math.fround(value);
}

// ---------------------------------------------------------------------------
// the attack dispatcher (ShipEntity.m:4038-4185), a pure decision

export interface DispatchInput {
  forwardWeapon: ForwardWeapon;
  range: number;
  accuracy: number;
  pitchingOver: boolean;
  aspect: number;
  /** |self.velocity - target.velocity|, velocity = forward x flightSpeed (11159-11166). */
  relativeSpeed: number;
  maxFlightPitch: number;
  /**
   * `forward_weapon_temp` (4053), a float32 value; absent means 0 (every armed
   * forward weapon ready, the Phase 14 cut).
   */
  forwardWeaponTemp?: number;
  /** `[target isShip]` (4122); needed once the temperature reaches READY. */
  targetIsShip?: boolean;
  /** `[target primaryTarget] == self` (4122); needed once the temperature reaches READY. */
  targetTargetsSelf?: boolean;
  /** `randf()`, taken at 4102 only for accuracy >= IS_SMART in the overheated branch. */
  unit?: () => number;
}

export interface DispatchResult {
  behaviour: string;
  /** What happens to the jink: `keep` leaves it, `zero` clears it, `set` draws two ranrot values for `jinkZ`. */
  jink: "keep" | "zero" | "set";
  jinkZ: number;
  /** The Oolite line that selected the branch. */
  line: string;
}

/**
 * The dispatcher over one forward weapon (4038-4185). The forward weapon is
 * READY below `WEAPON_TEMP_READY` (4079); with none ready the dispatcher is
 * "less picky" and accepts a temperature below USABLE (4084-4090, the heating
 * case); a forward weapon that is not even usable is the overheated case
 * (4095-4120). Aft, port and starboard weapons are none on every compiled
 * record, so RUNNING_DEFENSE and ATTACK_BROADSIDE (4131-4136, 4171-4176) are
 * unreachable, and so is the turret-laser branch (4073-4074).
 */
export function dispatchAttack(input: DispatchInput): DispatchResult {
  const wRange = weaponRange(input.forwardWeapon);
  const armed = input.forwardWeapon !== "EQ_WEAPON_NONE";
  const temperature = input.forwardWeaponTemp ?? 0;
  const inGoodRange =
    aimTolerance(input.accuracy) * input.range < COMBAT_AI_CONFIDENCE_FACTOR;
  let forwardReady = armed && temperature < WEAPON_TEMP_READY;
  let weaponsHeating = false;
  if (!forwardReady) {
    weaponsHeating = true;
    forwardReady = armed && temperature < WEAPON_TEMP_USABLE;
  }
  if (!forwardReady) {
    // no usable weapons: not fitted or overheated (4095-4120)
    if (!armed) {
      return {
        behaviour: "ATTACK_FLY_FROM_TARGET",
        jink: "keep",
        jinkZ: 0,
        line: "ShipEntity.m:4098-4099",
      };
    }
    if (input.aspect > 0) {
      if (inGoodRange) {
        if (input.accuracy >= COMBAT_AI_IS_SMART) {
          if (input.unit === undefined) {
            throw new Error("the overheated branch draws randf() at 4102");
          }
          if (input.unit() < 0.75) {
            return {
              behaviour: "EVASIVE_ACTION",
              jink: "keep",
              jinkZ: 0,
              line: "ShipEntity.m:4102-4103",
            };
          }
        }
        return {
          behaviour: "ATTACK_FLY_FROM_TARGET",
          jink: "keep",
          jinkZ: 0,
          line: "ShipEntity.m:4104-4106",
        };
      }
      return {
        behaviour: "ATTACK_FLY_TO_TARGET",
        jink: "keep",
        jinkZ: 0,
        line: "ShipEntity.m:4107-4110",
      };
    }
    return {
      behaviour:
        input.range < COMBAT_IN_RANGE_FACTOR * wRange
          ? "ATTACK_FLY_FROM_TARGET"
          : "ATTACK_FLY_TO_TARGET",
      jink: "keep",
      jinkZ: 0,
      line: "ShipEntity.m:4111-4118",
    };
  }
  if (weaponsHeating) {
    // 4122: a usable but hot forward weapon, a competent pilot, a target that
    // is not shooting back and fairly close: back off to let it cool
    if (
      input.targetIsShip === undefined ||
      input.targetTargetsSelf === undefined
    ) {
      throw new Error("a hot weapon reads [target isShip] and primaryTarget");
    }
    if (
      input.accuracy >= COMBAT_AI_ISNT_AWFUL &&
      input.targetIsShip &&
      !input.targetTargetsSelf &&
      input.range < COMBAT_OUT_RANGE_FACTOR * wRange
    ) {
      return {
        behaviour: "ATTACK_FLY_FROM_TARGET",
        jink: "set",
        jinkZ:
          input.range +
          COMBAT_JINK_OFFSET -
          input.relativeSpeed / input.maxFlightPitch,
        line: "ShipEntity.m:4122-4126",
      };
    }
  }
  const nearby = input.range < COMBAT_IN_RANGE_FACTOR * wRange;
  if (nearby) {
    const jinkZ =
      input.range +
      COMBAT_JINK_OFFSET -
      input.relativeSpeed / input.maxFlightPitch;
    const behaviour =
      input.accuracy >= COMBAT_AI_FLEES_BETTER
        ? "ATTACK_BREAK_OFF_TARGET"
        : "ATTACK_FLY_FROM_TARGET";
    return {
      behaviour,
      jink: input.pitchingOver ? "keep" : "set",
      jinkZ,
      line:
        input.accuracy >= COMBAT_AI_FLEES_BETTER
          ? "ShipEntity.m:4137-4152"
          : "ShipEntity.m:4137-4154",
    };
  }
  if (wRange > 12500 && input.range > 12500) {
    return {
      behaviour: "ATTACK_SNIPER",
      jink: "zero",
      jinkZ: 0,
      line: "ShipEntity.m:4156-4161",
    };
  }
  if (input.accuracy < COMBAT_AI_ISNT_AWFUL && input.aspect < 0) {
    return {
      behaviour: "ATTACK_FLY_TO_TARGET_SIX",
      jink: "zero",
      jinkZ: 0,
      line: "ShipEntity.m:4164-4165",
    };
  }
  if (input.accuracy < COMBAT_AI_ISNT_AWFUL) {
    return {
      behaviour: "ATTACK_FLY_TO_TARGET_TWELVE",
      jink: "zero",
      jinkZ: 0,
      line: "ShipEntity.m:4166-4167",
    };
  }
  return {
    behaviour: "ATTACK_FLY_TO_TARGET",
    jink: "zero",
    jinkZ: 0,
    line: "ShipEntity.m:4168-4170",
  };
}

/** The sub-behaviours kept IN scope, and those that are OUT (no consumer, not reachable from stock data). */
export const ATTACK_IN: readonly string[] = [
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
];
export const ATTACK_OUT: readonly string[] = [
  "RUNNING_DEFENSE",
  "ATTACK_BROADSIDE",
  "ATTACK_BROADSIDE_LEFT",
  "ATTACK_BROADSIDE_RIGHT",
  "CLOSE_TO_BROADSIDE_RANGE",
  "CLOSE_WITH_TARGET",
  "ATTACK_MINING_TARGET",
  "TRACK_AS_TURRET",
];

/**
 * The `universalID & 14` test of fly-to-six / twelve (4523): with a target
 * that is almost at a standstill, 5 of every 8 ids vector in at once
 * (62.5 percent). The steered ship's id is always 101 in a fixture (101 & 14
 * is 4, not above 4), so the fixtures only exercise the false branch; the port
 * evaluates the test on Wegolite's own ids.
 */
export function vectorsInAtStandstill(universalId: number): boolean {
  return (universalId & 14) > 4;
}

// ---------------------------------------------------------------------------
// behaviours: one update each

function weaponRangeOf(world: World): number {
  return weaponRange(world.stats.forwardWeapon);
}

function targetSpeed(target: Body): number {
  return target.speed;
}

/** `behaviour_intercept_target:` (3817-3826), the INTERCEPT half. */
function behaviourIntercept(world: World): void {
  const s = world.self;
  const range = rangeToPrimaryTarget(world);
  s.desiredSpeed = world.stats.maxFlightSpeed;
  if (range < s.desiredRange) emit(world, "shipAchievedDesiredRange");
  s.desiredSpeed =
    world.stats.maxFlightSpeed * trackPrimaryTarget(world, false);
}

/**
 * `behaviour_flee_target:` (4840-4901) without missiles, mines, turrets and
 * cloaking. Its one `fireMainWeapon:` call (4890-4892) needs a turret laser as
 * the forward weapon, which no compiled record has, so flee requests nothing.
 */
function behaviourFlee(world: World): void {
  const s = world.self;
  const range = rangeToPrimaryTarget(world);
  if (primaryTarget(world) === null) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  const lastRange = s.successFactor;
  writeSuccessFactor(world, range);
  if (range > s.desiredRange || range === 0) {
    // REACHED_SAFETY is an AI message, not a script event
  } else {
    s.desiredSpeed = world.stats.maxFlightSpeed;
  }
  if (range > lastRange) {
    writeFrustration(world, s.frustration - 0.25 * DT);
    if (s.frustration < 0) s.frustration = 0;
  } else {
    writeFrustration(world, s.frustration + DT);
    if (s.frustration > 15) {
      emit(world, "shipAIFrustrated");
      s.frustration = 0;
    }
  }
  trackPrimaryTarget(world, true);
}

/** `behaviour_attack_target:` (4038-4185): dispatch, then reset frustration. */
function behaviourAttackTarget(world: World): void {
  const s = world.self;
  const range = rangeToPrimaryTarget(world);
  const target = primaryTarget(world);
  const aspect = approachAspectToPrimaryTarget(world);
  let relativeSpeed = 0;
  if (target !== null) {
    const selfVelocity = scale(s.forward, s.speed);
    const targetVelocity = scale(target.forward, target.speed);
    relativeSpeed = mag(sub(selfVelocity, targetVelocity));
  }
  const decision = dispatchAttack({
    forwardWeapon: world.stats.forwardWeapon,
    range,
    accuracy: s.accuracy,
    pitchingOver: s.pitchingOver === 1,
    aspect,
    relativeSpeed,
    maxFlightPitch: world.stats.maxFlightPitch,
    forwardWeaponTemp: world.weapon.forwardWeaponTemp,
    targetIsShip: target !== null,
    targetTargetsSelf: target !== null && target.targetId === s.id,
    unit: () => world.draws.unit(),
  });
  if (decision.jink === "zero") s.jink = ZERO;
  else if (decision.jink === "set") setEvasiveJink(world, decision.jinkZ);
  s.behaviour = decision.behaviour;
  s.frustration = 0; // 4184: behaviour changed, so reset frustration
}

/** `behaviour_attack_fly_to_target:` (4611-4731), no afterburner. */
function behaviourFlyToTarget(world: World): void {
  const s = world.self;
  const { maxFlightSpeed } = world.stats;
  const wRange = weaponRangeOf(world);
  const range = rangeToPrimaryTarget(world);
  const target = primaryTarget(world);
  if (target === null) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  if (range < COMBAT_IN_RANGE_FACTOR * wRange) {
    // no proximity alert in any fixture (the self-test asserts it)
    s.behaviour = "ATTACK_TARGET";
  } else if (!canStillTrackPrimaryTarget(world)) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  const slowDownRange = wRange * COMBAT_WEAPON_RANGE_FACTOR;
  const backOffRange = 10000 * COMBAT_OUT_RANGE_FACTOR;
  const tSpeed = targetSpeed(target);
  const aspect = approachAspectToPrimaryTarget(world);
  const targetTargetsSelf = target.targetId === s.id;
  if (range <= slowDownRange) {
    if (range < backOffRange) {
      if (
        s.accuracy < COMBAT_AI_IS_SMART ||
        (targetTargetsSelf && aspect > 0.8) ||
        aimTolerance(s.accuracy) * range > COMBAT_AI_CONFIDENCE_FACTOR
      ) {
        if (s.accuracy >= COMBAT_AI_FLEES_BETTER && aspect > 0.8) {
          s.desiredSpeed = Math.max(tSpeed * 1.25, 0.8 * maxFlightSpeed);
        } else {
          s.desiredSpeed = Math.max(tSpeed * 1.05, 0.25 * maxFlightSpeed);
        }
      } else {
        s.desiredSpeed = Math.max(0.1 * tSpeed, 0.1 * maxFlightSpeed);
      }
    } else if (
      s.accuracy < COMBAT_AI_IS_SMART ||
      targetTargetsSelf ||
      range > wRange / 2
    ) {
      s.desiredSpeed = Math.max(tSpeed * 1.5, maxFlightSpeed);
    } else if (aspect > -0.25) {
      s.desiredSpeed = Math.max(0.5 * tSpeed, 0.5 * maxFlightSpeed);
    } else {
      s.desiredSpeed = Math.max(1.25 * tSpeed, 0.5 * maxFlightSpeed);
    }
  } else {
    s.desiredSpeed = Math.max(
      maxFlightSpeed,
      Math.min(3 * tSpeed, maxFlightSpeed),
    );
  }
  const lastSuccessFactor = s.successFactor;
  writeSuccessFactor(world, trackPrimaryTarget(world, false));
  if (s.successFactor > 0.999 || s.successFactor > lastSuccessFactor) {
    writeFrustration(world, s.frustration - DT);
    if (s.frustration < 0) s.frustration = 0;
  } else {
    writeFrustration(world, s.frustration + DT);
    if (s.frustration > 3) {
      emit(world, "shipAIFrustrated");
      setEvasiveJink(world, 1000);
      s.behaviour = "ATTACK_TARGET";
      s.frustration = 0;
      s.desiredSpeed = maxFlightSpeed;
    }
  }
  // 4711: fireMainWeapon:range, reached on every path that did not return above
  requestFire(world);
  // 4713-4720: weapon_temp (= forward_weapon_temp, refreshed by fireWeapon: at
  // 9914-9921) above USABLE, accuracy at least 0 and in good aim range. Inside
  // it `aspect < 0` has no else; aft, port and starboard weapons are none, so
  // the other three terms of 4717 are false.
  if (
    world.weapon.forwardWeaponTemp > WEAPON_TEMP_USABLE &&
    s.accuracy >= COMBAT_AI_ISNT_AWFUL &&
    aimTolerance(s.accuracy) * range < COMBAT_AI_CONFIDENCE_FACTOR
  ) {
    if (aspect < 0) {
      s.frustration = 0;
      s.behaviour = "ATTACK_TARGET";
    }
  } else if (s.accuracy >= COMBAT_AI_FLEES_BETTER_2) {
    // 4721-4730 (Phase 14 divergence 21) needs the target's forward weapon
    // type, which a fixture body does not carry
    throw new Error(
      "ShipEntity.m:4721-4729 needs the target's weapon type: not modelled",
    );
  }
}

/** `behaviour_attack_fly_from_target:` (4733-4799), no afterburner. */
function behaviourFlyFromTarget(world: World): void {
  const s = world.self;
  const { maxFlightSpeed, scannerRange, maxFlightPitch } = world.stats;
  const wRange = weaponRangeOf(world);
  const range = rangeToPrimaryTarget(world);
  const lastSuccessFactor = s.successFactor;
  writeSuccessFactor(world, range);
  if (primaryTarget(world) === null) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  if (lastSuccessFactor > s.successFactor)
    writeFrustration(world, s.frustration + DT);
  else writeFrustration(world, s.frustration + DT / 4);
  if (s.frustration > 10) {
    if (world.draws.unit() < 0.3) {
      s.desiredSpeed = maxFlightSpeed;
    } else if (range > COMBAT_IN_RANGE_FACTOR * wRange) {
      // the second draw is taken only when the range test passes (4753)
      if (world.draws.unit() < 0.3) s.behaviour = "ATTACK_TARGET";
    }
    let z = s.jink[2];
    if (world.draws.unit() < 0.3) {
      z /= 2;
      s.desiredSpeed = s.speed * 2;
    }
    setEvasiveJink(world, z);
    writeFrustration(world, s.frustration / 2);
  }
  if (s.desiredSpeed > maxFlightSpeed) {
    const target = primaryTarget(world);
    if (target !== null && s.desiredSpeed > targetSpeed(target) * 2)
      s.desiredSpeed = maxFlightSpeed;
  } else if (s.desiredSpeed < maxFlightSpeed * 0.5) {
    s.desiredSpeed = maxFlightSpeed;
  }
  if (
    range > COMBAT_OUT_RANGE_FACTOR * wRange + 15 * s.jink[0] ||
    s.speed > ((scannerRange - range) * maxFlightPitch) / 6.28
  ) {
    s.jink = ZERO;
    s.behaviour = "ATTACK_TARGET";
    s.frustration = 0;
  }
  trackPrimaryTarget(world, true);
  if (s.accuracy >= COMBAT_AI_FLEES_BETTER_2) {
    const aspect = approachAspectToPrimaryTarget(world);
    if (aspect > 0.99999 || aspect < -0.999) {
      s.frustration = 0;
      s.behaviour = "EVASIVE_ACTION";
    }
  }
}

/** `distance_six:` (8849-8856): the point `dist` behind the target along its forward. */
export function distanceSix(
  target: { position: V3; forward: V3 },
  dist: number,
): V3 {
  return sub(target.position, scale(target.forward, dist));
}

/** `distance_twelve:withOffset:` (8858-8868): the point `dist` above the target along its up, plus `offset` along its right. */
export function distanceTwelve(
  target: { position: V3; up: V3; right: V3 },
  dist: number,
  offset: number,
): V3 {
  return add(
    add(target.position, scale(target.up, dist)),
    scale(target.right, offset),
  );
}

/**
 * `behaviour_fly_to_target_six:` (4461-4580), non-turret branch. The final
 * `trackDestination` is not transliterated (plan 14-01's reference covers it);
 * a fixture row for this behaviour must make `success_factor` grow so that the
 * `||` at 4559 does not need `confidenceFactor`, and checks no stick.
 */
function behaviourFlyToTargetSixTwelve(world: World): void {
  const s = world.self;
  const { maxFlightSpeed } = world.stats;
  const wRange = weaponRangeOf(world);
  const range = rangeToPrimaryTarget(world);
  const target = primaryTarget(world);
  if (target === null) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  if (!canStillTrackPrimaryTarget(world)) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  const slowDownRange = wRange * COMBAT_WEAPON_RANGE_FACTOR;
  const backOffRange = wRange * COMBAT_OUT_RANGE_FACTOR;
  const tSpeed = targetSpeed(target);
  const lastSuccessFactor = s.successFactor;
  const distance = mag(sub(s.destination, s.position));
  writeSuccessFactor(world, distance);

  if (range < slowDownRange && s.behaviour === "ATTACK_FLY_TO_TARGET_SIX") {
    if (range < backOffRange) {
      s.desiredSpeed = Math.max(0.9 * tSpeed, 0.4 * maxFlightSpeed);
    } else {
      s.desiredSpeed = Math.max(tSpeed * 1.2, maxFlightSpeed);
    }
    if (range < 0.5 * distance && s.behaviour === "ATTACK_FLY_TO_TARGET_SIX") {
      s.behaviour = "ATTACK_FLY_TO_TARGET_TWELVE";
    }
  } else if (range < backOffRange) {
    s.desiredSpeed = Math.max(0.9 * tSpeed, 0.8 * maxFlightSpeed);
  } else {
    s.desiredSpeed = maxFlightSpeed;
  }

  if (distance < 750 || (tSpeed < 0.2 && vectorsInAtStandstill(s.id))) {
    s.behaviour = "ATTACK_FLY_TO_TARGET";
    s.frustration = 0;
    s.desiredSpeed = Math.max(tSpeed, 0.4 * maxFlightSpeed);
  }
  const tp = targetPose(world, target);
  if (s.behaviour === "ATTACK_FLY_TO_TARGET_SIX") {
    s.destination = distanceSix(
      { position: tp, forward: target.forward },
      0.5 * wRange,
    );
  }
  if (s.behaviour === "ATTACK_FLY_TO_TARGET_TWELVE") {
    s.destination = distanceTwelve(
      { position: tp, up: target.up, right: target.right },
      1250,
      0,
    );
  }
  s.pitchingOver = 0; // 4556

  if (!(s.successFactor > lastSuccessFactor)) {
    // the || at 4559 would read trackDestination's confidence factor
    throw new Error(
      "fly-to-six row must make success_factor grow (trackDestination is not modelled)",
    );
  }
  writeFrustration(world, s.frustration + DT);
  const aspect = approachAspectToPrimaryTarget(world);
  if (s.frustration > 10 || aspect > 0.75) s.behaviour = "ATTACK_FLY_TO_TARGET";
  // 4575: fireMainWeapon:range, reached on every path that did not return above
  requestFire(world);
  // 4577: unconditional, whatever the accuracy (weapon_temp = forward_weapon_temp, 9917)
  if (world.weapon.forwardWeaponTemp > WEAPON_TEMP_USABLE) {
    s.behaviour = "ATTACK_TARGET";
  }
}

/** `behaviour_attack_sniper:` (4397-4459), no afterburner, no missiles. */
function behaviourSniper(world: World): void {
  const s = world.self;
  const { maxFlightSpeed, scannerRange } = world.stats;
  const wRange = weaponRangeOf(world);
  if (!canStillTrackPrimaryTarget(world)) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  const range = rangeToPrimaryTarget(world);
  if (range < 15000) {
    s.behaviour = "ATTACK_TARGET";
  } else {
    if (range > wRange || range > scannerRange * 0.8)
      s.desiredSpeed = maxFlightSpeed;
    else s.desiredSpeed = maxFlightSpeed / 10;
    const lastSuccessFactor = s.successFactor;
    writeSuccessFactor(world, trackPrimaryTarget(world, false));
    if (s.successFactor > 0.999 || s.successFactor > lastSuccessFactor) {
      writeFrustration(world, s.frustration - DT);
      if (s.frustration < 0) s.frustration = 0;
    } else {
      writeFrustration(world, s.frustration + DT);
      if (s.frustration > 3) {
        emit(world, "shipAIFrustrated");
        setEvasiveJink(world, 1000);
        s.behaviour = "ATTACK_TARGET";
        s.frustration = 0;
        s.desiredSpeed = maxFlightSpeed;
      }
    }
  }
  // 4454: fireMainWeapon:range. Oolite's if/else (4414-4447) falls through to
  // here: the below-15,000 m hand-over still reaches the call in the same update.
  requestFire(world);
  // 4456: weapon_temp (= forward_weapon_temp, 9917) strictly above USABLE
  if (
    world.weapon.forwardWeaponTemp > WEAPON_TEMP_USABLE &&
    s.accuracy >= COMBAT_AI_ISNT_AWFUL
  ) {
    s.behaviour = "ATTACK_TARGET";
  }
}

/** `behaviour_attack_break_off_target:` (3886-3942), no afterburner. */
function behaviourBreakOff(world: World): void {
  const s = world.self;
  const { maxFlightSpeed, maxFlightRoll } = world.stats;
  const wRange = weaponRangeOf(world);
  if (!canStillTrackPrimaryTarget(world)) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  const range = rangeToPrimaryTarget(world);
  s.desiredSpeed = maxFlightSpeed;
  const target = primaryTarget(world);
  if (target === null) return;
  writeFrustration(world, s.frustration + DT);
  if (s.frustration > 15 && s.accuracy >= COMBAT_AI_DOGFIGHTER)
    s.desiredSpeed = maxFlightSpeed / 2;
  const aspect = approachAspectToPrimaryTarget(world);
  const fraction = s.frustration - Math.floor(s.frustration);
  if (
    range > 3000 ||
    target.targetId !== s.id ||
    fraction > Math.min(1.6 / maxFlightRoll, aspect)
  ) {
    trackPrimaryTarget(world, true);
  } else {
    evasiveAction(world);
  }
  if (range > COMBAT_OUT_RANGE_FACTOR * wRange) {
    s.behaviour = "ATTACK_TARGET";
  } else if (aspect < -0.75 && s.accuracy >= COMBAT_AI_DOGFIGHTER) {
    s.behaviour = "ATTACK_SLOW_DOGFIGHT";
  } else if (
    s.frustration > 10 &&
    approachAspectToPrimaryTarget(world) < 0.85 &&
    world.weapon.forwardWeaponTemp < WEAPON_TEMP_READY
  ) {
    s.frustration = 0;
    s.behaviour =
      s.accuracy >= COMBAT_AI_DOGFIGHTER
        ? "ATTACK_SLOW_DOGFIGHT"
        : "ATTACK_FLY_TO_TARGET";
  }
}

/** `behaviour_attack_slow_dogfight:` (3944-3994), no missiles, no cloak. */
function behaviourSlowDogfight(world: World): void {
  const s = world.self;
  const { maxFlightSpeed } = world.stats;
  const wRange = weaponRangeOf(world);
  if (!canStillTrackPrimaryTarget(world)) {
    noteLostTargetAndGoIdle(world);
    return;
  }
  const range = rangeToPrimaryTarget(world);
  const target = primaryTarget(world);
  if (target === null) return;
  const aspect = approachAspectToPrimaryTarget(world);
  // the head-on guard at 3957 needs proximityAlert == target: no alert exists in a fixture
  if (aspect < -0.5 && range > COMBAT_IN_RANGE_FACTOR * wRange * 2) {
    s.behaviour = "ATTACK_TARGET";
  } else if (aspect < -0.5) {
    s.desiredSpeed = Math.min(maxFlightSpeed * 0.5, targetSpeed(target) * 0.5);
  } else if (aspect < 0.3) {
    s.desiredSpeed = maxFlightSpeed * 0.1;
  } else {
    s.desiredSpeed = maxFlightSpeed * Math.min(aspect * 2.5, 1);
  }
  if (aspect > 0.85) s.behaviour = "ATTACK_BREAK_OFF_TARGET";
  if (aspect > 0) writeFrustration(world, s.frustration + DT);
  else writeFrustration(world, s.frustration - DT);
  if (s.frustration > 10) s.desiredSpeed /= 2;
  else if (s.frustration < 0) s.frustration = 0;
  trackPrimaryTarget(world, false);
}

/** `behaviour_evasive_action:` (3996-4036), no afterburner, no cloak. */
function behaviourEvasiveAction(world: World): void {
  const s = world.self;
  s.desiredSpeed = world.stats.maxFlightSpeed;
  // no proximity alert exists in a fixture (the self-test asserts it)
  evasiveAction(world);
  writeFrustration(world, s.frustration + DT);
  if (s.frustration > 0.5) {
    if (s.behaviour === "FLEE_EVASIVE_ACTION") {
      setEvasiveJink(world, 400);
      s.behaviour = "FLEE_TARGET";
    } else {
      s.behaviour = "ATTACK_TARGET";
    }
  }
  // 4035: fireMainWeapon: after the follow-on; no target guard precedes it, so a
  // target lost inside evasiveAction (4009-4013) still reaches the call
  requestFire(world);
}

/** One native update of the steered ship (pose frozen), then the `applyThrust:` speed clamp. */
export function stepTick(world: World): void {
  world.tick += 1;
  // cooling at the top of the update (2214-2218); update 1 reads the stated value
  if (world.tick > 1) {
    world.weapon.forwardWeaponTemp = coolOnce(world.weapon.forwardWeaponTemp);
  }
  const s = world.self;
  switch (s.behaviour) {
    case "INTERCEPT_TARGET":
      behaviourIntercept(world);
      break;
    case "FLEE_TARGET":
      behaviourFlee(world);
      break;
    case "ATTACK_TARGET":
      behaviourAttackTarget(world);
      break;
    case "ATTACK_FLY_TO_TARGET":
      behaviourFlyToTarget(world);
      break;
    case "ATTACK_FLY_FROM_TARGET":
      behaviourFlyFromTarget(world);
      break;
    case "ATTACK_FLY_TO_TARGET_SIX":
    case "ATTACK_FLY_TO_TARGET_TWELVE":
      behaviourFlyToTargetSixTwelve(world);
      break;
    case "ATTACK_SNIPER":
      behaviourSniper(world);
      break;
    case "ATTACK_BREAK_OFF_TARGET":
      behaviourBreakOff(world);
      break;
    case "ATTACK_SLOW_DOGFIGHT":
      behaviourSlowDogfight(world);
      break;
    case "EVASIVE_ACTION":
    case "FLEE_EVASIVE_ACTION":
      behaviourEvasiveAction(world);
      break;
    case "IDLE":
      s.stickRoll = 0;
      s.stickPitch = 0;
      applySticks(world, DT);
      break;
    default:
      throw new Error(`derive.ts does not model behaviour ${s.behaviour}`);
  }
  clampDesiredSpeed(world);
}

// ---------------------------------------------------------------------------
// the perform entry effects (ShipEntityAI.m:350-417) and the tick-0 state

/** `performAttack` (ShipEntityAI.m:350-357): desired range `1250 * u + 750`, one draw; EVASIVE_ACTION is kept. */
export function performAttack(world: World): void {
  const s = world.self;
  if (s.behaviour !== "EVASIVE_ACTION") {
    s.behaviour = "ATTACK_TARGET";
    s.desiredRange = 1250 * world.draws.unit() + 750;
    s.frustration = 0;
  }
}

/**
 * `performFlee` (ShipEntityAI.m:379-392): an evasive jink with two draws when
 * accuracy is at least 0 (none below 0), frustration 0, and, above accuracy 0
 * with an approach aspect above 0.9995, one more draw choosing EVASIVE_ACTION
 * (below 0.15) or FLEE_EVASIVE_ACTION.
 */
export function performFlee(world: World): void {
  const s = world.self;
  if (s.behaviour === "FLEE_EVASIVE_ACTION") return;
  s.behaviour = "FLEE_TARGET";
  setEvasiveJink(world, 400);
  s.frustration = 0;
  if (s.accuracy > COMBAT_AI_ISNT_AWFUL) {
    if (approachAspectToPrimaryTarget(world) > 0.9995) {
      s.behaviour =
        world.draws.unit() < 0.15 ? "EVASIVE_ACTION" : "FLEE_EVASIVE_ACTION";
    }
  }
}

/** `performIntercept` (ShipEntityAI.m:413-417). */
export function performIntercept(world: World): void {
  world.self.behaviour = "INTERCEPT_TARGET";
  world.self.frustration = 0;
}

/** The state after `assign` and before the first update (tick 0). */
export function tickZeroWorld(fixture: FixtureLike): World {
  const world = buildWorld(fixture);
  const s = world.self;
  for (const call of fixture.assign) {
    switch (call.op) {
      case "setTarget": {
        const id = call.value as number;
        if (id === s.id) break;
        s.targetId = id;
        const target = primaryTarget(world);
        // addTarget: starts the tracking curve only for a valid target (8658-8666)
        world.aimBase = target === null ? null : bodyPosition(world, target, 0);
        break;
      }
      case "setDestination":
        s.destination = call.value as V3;
        break;
      case "setDesiredRange":
        s.desiredRange = call.value as number;
        break;
      case "setDesiredSpeed":
        s.desiredSpeed = call.value as number;
        break;
      case "perform":
        switch (call.value) {
          case "INTERCEPT_TARGET":
            performIntercept(world);
            break;
          case "ATTACK_TARGET":
            performAttack(world);
            break;
          case "FLEE_TARGET":
            performFlee(world);
            break;
          default:
            throw new Error(
              `derive.ts does not model perform ${String(call.value)}`,
            );
        }
        break;
    }
  }
  return world;
}

/** The world after `ticks` native updates. */
export function worldAtTick(fixture: FixtureLike, ticks: number): World {
  const world = tickZeroWorld(fixture);
  for (let k = 0; k < ticks; k += 1) stepTick(world);
  return world;
}

// ---------------------------------------------------------------------------
// reading a field of a world (contract item 5)

/** The value of an oracle field in a world, for the fields pursuit fixtures check. */
export function readField(world: World, field: string): number | string {
  const s = world.self;
  const axis = (v: V3, suffix: string): number =>
    v[suffix === "X" ? 0 : suffix === "Y" ? 1 : 2];
  switch (field) {
    case "behaviour":
      return s.behaviour;
    case "frustration":
      return s.frustration;
    case "successFactor":
      return s.successFactor;
    case "desiredRange":
      return s.desiredRange;
    case "desiredSpeed":
      return s.desiredSpeed;
    case "stickRoll":
      return s.stickRoll;
    case "stickPitch":
      return s.stickPitch;
    case "pitchingOver":
      return s.pitchingOver;
    case "accuracy":
      return s.accuracy;
    case "targetId":
      return s.targetId;
    case "rangeToTarget":
      return rangeToPrimaryTarget(world);
    case "jinkX":
    case "jinkY":
    case "jinkZ":
      return axis(s.jink, field.slice(-1));
    case "destinationX":
    case "destinationY":
    case "destinationZ":
      return axis(s.destination, field.slice(-1));
    case "positionX":
    case "positionY":
    case "positionZ":
      return axis(s.position, field.slice(-1));
    case "aimPointX":
    case "aimPointY":
    case "aimPointZ":
      return axis(aimPointOf(world, world.tick), field.slice(-1));
    default:
      throw new Error(`derive.ts does not derive field ${field}`);
  }
}

/**
 * The expected value of one check, re-derived from the fixture's initial state
 * and the transliteration above. A check at tick 0 reads the state after
 * `assign`; a check at tick k replays k updates with the pose frozen (see the
 * module comment); an `aimPoint` check evaluates the tracking-curve closed form
 * at its tick. Events are derived the same way.
 */
export function deriveCheck(
  fixture: FixtureLike,
  check: Check,
): number | string {
  if (check.field.startsWith("aimPoint")) {
    // the curve closed form needs no steering replay
    const world = tickZeroWorld(fixture);
    world.tick = check.tick;
    return readField(world, check.field);
  }
  const world = worldAtTick(fixture, check.tick);
  return readField(world, check.field);
}

/** The events a fixture's first `horizon` updates post, re-derived. */
export function deriveEvents(
  fixture: FixtureLike,
): { tick: number; name: string }[] {
  const world = worldAtTick(fixture, 0);
  for (let k = 0; k < fixture.horizon; k += 1) stepTick(world);
  return world.events;
}

/** The updates at which the behaviour reached a `fireMainWeapon:` call over the horizon. */
export function deriveFireRequests(fixture: FixtureLike): number[] {
  const world = worldAtTick(fixture, 0);
  for (let k = 0; k < fixture.horizon; k += 1) stepTick(world);
  return world.fireRequests;
}

/** The scripted draws a fixture consumes over its horizon (the consumer fails on any other count). */
export function deriveDrawCount(fixture: FixtureLike): number {
  const world = worldAtTick(fixture, 0);
  for (let k = 0; k < fixture.horizon; k += 1) stepTick(world);
  return world.draws.consumed;
}
