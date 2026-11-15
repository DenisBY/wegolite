// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The oracle's reference NPC flight model, transliterated line by line from
 * the pinned Oolite source (commit 7437f22) in Oolite's own frame. Nothing in
 * this file imports Wegolite code; it is the independent reading the port is
 * checked against.
 *
 * - `applySticks`            ShipEntity.m:7018-7065
 * - `applyAttitudeChanges`   ShipEntity.m:5899-5902 (applyRoll:climb:andYaw: 5881-5897)
 * - `applyThrust`            ShipEntity.m:5808-5854
 * - `increase_flight_speed`  ShipEntity.m:7405-7415, `decrease_flight_speed` 7417-7429
 * - `moveForward:`           Entity.m:796-800
 * - behaviour_stop_still / idle / tumble  ShipEntity.m:3700-3727
 * - performStop / performIdle / performTumble  ShipEntityAI.m:466-479, 407-411
 * - processBehaviour order   ShipEntity.m:2485-2638
 *
 * Float handling: Oolite stores flight rates, sticks, speeds, ranges and the
 * orientation as GLfloat. Every such store goes through `mode.r` (`Math.fround`
 * in the `f32` mode, the identity in `f64`). `frustration` and `successFactor`
 * are GLfloat too, and contract item 8 fixes one rule for both modes: every
 * write is `Math.fround` (the `fr` helper below), so an event at a time
 * threshold falls on the same tick in both modes and in the port.
 *
 * The replay loop runs the contract's in-tick order (item 4): (a) bodies move,
 * (b) the escort leader refreshes self's destination, (c) self's native
 * update, (d) the proximity rule. Slots (b) and (d) are explicit here and stay
 * inactive: a fixture that would need them throws, and plan 14-06 fills them.
 */

import type {
  OracleCheck,
  OracleEventName,
  OracleField,
  OracleFixture,
} from "../schema.js";
import {
  F32,
  F64,
  IDENTITY,
  forwardFromQuat,
  quatEqual,
  quatFromBasis,
  quatMultiply,
  quatNormalize,
  quatRotateAboutX,
  quatRotateAboutY,
  quatRotateAboutZ,
  rightFromQuat,
  upFromQuat,
  vec,
  type Mode,
  type Quat,
  type Vec,
} from "./vec.js";

export { F32, F64 };
export type { Mode };

/** `SHIP_THRUST_FACTOR` (`ShipEntity.h:46`). */
export const SHIP_THRUST_FACTOR = 5.0;
/** `COMBAT_AI_TRACKS_CLOSER` (`ShipEntity.h:132`). */
export const COMBAT_AI_TRACKS_CLOSER = 7.5;
/** `MIN_HYPERSPEED_FACTOR` (`PlayerEntity.h:296`). */
export const MIN_HYPERSPEED_FACTOR = 32.0;

/** GLfloat accumulator write (contract item 8): float32 in both modes. */
export const fr = Math.fround;

export interface ShipStats {
  maxFlightSpeed: number;
  maxFlightRoll: number;
  maxFlightPitch: number;
  thrust: number;
  scannerRange: number;
}

export interface Ship {
  readonly stats: ShipStats;
  readonly scanClass: string;
  readonly radius: number;
  position: Vec;
  orientation: Quat;
  lastOrientation: Quat;
  hasRotated: boolean;
  forward: Vec;
  up: Vec;
  right: Vec;
  flightSpeed: number;
  flightRoll: number;
  flightPitch: number;
  flightYaw: number;
  stickRoll: number;
  stickPitch: number;
  stickYaw: number;
  desiredSpeed: number;
  desiredRange: number;
  accuracy: number;
  frustration: number;
  successFactor: number;
  pitchingOver: boolean;
  jink: Vec;
  behaviour: string;
  targetId: number;
  destination: Vec;
  proximityAlert: number;
  ownerId: number;
  escortSlot: number;
}

export interface ReplayBody {
  readonly id: number;
  readonly kind: string;
  readonly scanClass: string;
  readonly radius: number;
  readonly mass: number;
  position: Vec;
  readonly forward: Vec;
  readonly speed: number;
  readonly behaviour: string;
  readonly targetId: number;
}

export interface Ctx {
  readonly mode: Mode;
  readonly dt: number;
  readonly bodies: readonly ReplayBody[];
  readonly events: { tick: number; name: OracleEventName }[];
  readonly counters: Record<string, number>;
  tick: number;
  /** One scripted unit draw: Oolite's `randf()` (contract item 7). */
  draw(): number;
  post(name: OracleEventName): void;
}

export interface BehaviourDef {
  /** A `processBehaviour:` switch arm (`ShipEntity.m:2488-2631`). */
  readonly process: (ship: Ship, ctx: Ctx) => void;
  /** The matching `perform*` entry of `ShipEntityAI.m`, when it has one. */
  readonly perform?: (ship: Ship, ctx: Ctx) => void;
}
export type BehaviourTable = Readonly<Record<string, BehaviourDef>>;

/** `applySticks:` (`ShipEntity.m:7018-7065`). */
export function applySticks(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  const delta = ctx.dt;
  let rate1 = 2.0 * delta; // roll
  let rate2 = 4.0 * delta; // pitch
  let rate3 = 4.0 * delta; // yaw

  if (
    (ship.stickRoll > 0.0 && ship.flightRoll < 0.0) ||
    (ship.stickRoll < 0.0 && ship.flightRoll > 0.0)
  ) {
    rate1 *= 4.0; // much faster correction
  }
  if (
    (ship.stickPitch > 0.0 && ship.flightPitch < 0.0) ||
    (ship.stickPitch < 0.0 && ship.flightPitch > 0.0)
  ) {
    rate2 *= 4.0;
  }
  if (
    (ship.stickYaw > 0.0 && ship.flightYaw < 0.0) ||
    (ship.stickYaw < 0.0 && ship.flightYaw > 0.0)
  ) {
    rate3 *= 4.0;
  }

  if (ship.accuracy >= COMBAT_AI_TRACKS_CLOSER) {
    if (ship.stickRoll === 0.0) rate1 *= 2.0; // faster correction
    if (ship.stickPitch === 0.0) rate2 *= 2.0;
    if (ship.stickYaw === 0.0) rate3 *= 2.0;
  }

  // apply stick movement limits
  if (ship.flightRoll < ship.stickRoll - rate1) {
    ship.flightRoll = r(ship.flightRoll + rate1);
  } else if (ship.flightRoll > ship.stickRoll + rate1) {
    ship.flightRoll = r(ship.flightRoll - rate1);
  } else {
    ship.flightRoll = ship.stickRoll;
  }

  if (ship.flightPitch < ship.stickPitch - rate2) {
    ship.flightPitch = r(ship.flightPitch + rate2);
  } else if (ship.flightPitch > ship.stickPitch + rate2) {
    ship.flightPitch = r(ship.flightPitch - rate2);
  } else {
    ship.flightPitch = ship.stickPitch;
  }

  if (ship.flightYaw < ship.stickYaw - rate3) {
    ship.flightYaw = r(ship.flightYaw + rate3);
  } else if (ship.flightYaw > ship.stickYaw + rate3) {
    ship.flightYaw = r(ship.flightYaw - rate3);
  } else {
    ship.flightYaw = ship.stickYaw;
  }
}

/** `orientationChanged` (`Entity.m:697-701`, `ShipEntity.m:5856-5863`). */
function orientationChanged(ship: Ship, mode: Mode): void {
  ship.orientation = quatNormalize(mode, ship.orientation);
  ship.forward = forwardFromQuat(mode, ship.orientation);
  ship.up = upFromQuat(mode, ship.orientation);
  ship.right = rightFromQuat(mode, ship.orientation);
}

/** `applyRoll:climb:andYaw:` (`ShipEntity.m:5881-5897`). */
function applyRollClimbYaw(
  ship: Ship,
  mode: Mode,
  roll: number,
  climb: number,
  yaw: number,
): void {
  if (roll === 0.0 && climb === 0.0 && yaw === 0.0 && !ship.hasRotated) return;

  let q1: Quat = IDENTITY;
  if (roll !== 0) q1 = quatRotateAboutZ(mode, q1, mode.r(-roll));
  if (climb !== 0) q1 = quatRotateAboutX(mode, q1, mode.r(-climb));
  if (yaw !== 0) q1 = quatRotateAboutY(mode, q1, mode.r(-yaw));

  ship.orientation = quatMultiply(mode, q1, ship.orientation);
  orientationChanged(ship, mode);
}

/** `applyAttitudeChanges:` (`ShipEntity.m:5899-5902`). */
export function applyAttitudeChanges(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  applyRollClimbYaw(
    ship,
    ctx.mode,
    r(ship.flightRoll * ctx.dt),
    r(ship.flightPitch * ctx.dt),
    r(ship.flightYaw * ctx.dt),
  );
}

/** `increase_flight_speed:` (`ShipEntity.m:7405-7415`; no fuel injection). */
function increaseFlightSpeed(ship: Ship, mode: Mode, delta: number): void {
  const factor = 1.0;
  const max = ship.stats.maxFlightSpeed;
  if (ship.flightSpeed < max * factor) {
    ship.flightSpeed = mode.r(ship.flightSpeed + delta * factor);
  } else {
    ship.flightSpeed = mode.r(max * factor);
  }
}

/** `decrease_flight_speed:` (`ShipEntity.m:7417-7429`). */
function decreaseFlightSpeed(ship: Ship, mode: Mode, delta: number): void {
  let factor = 1.0;
  if (ship.flightSpeed > ship.stats.maxFlightSpeed) {
    factor = MIN_HYPERSPEED_FACTOR;
  }
  if (ship.flightSpeed > factor * delta) {
    ship.flightSpeed = mode.r(ship.flightSpeed - factor * delta);
  } else {
    ship.flightSpeed = 0;
  }
}

/** `moveForward:` (`Entity.m:796-800`): double position, float direction. */
function moveForward(ship: Ship, mode: Mode, amount: number): void {
  const direction = forwardFromQuat(mode, ship.orientation);
  ship.position = {
    x: ship.position.x + direction.x * amount,
    y: ship.position.y + direction.y * amount,
    z: ship.position.z + direction.z * amount,
  };
}

/**
 * `applyThrust:` (`ShipEntity.m:5808-5854`) for a ship with no fuel injection
 * (`canBurn` is false) and no Newtonian `velocity` (a recorded scope cut).
 */
export function applyThrust(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  const dtThrust = r(r(SHIP_THRUST_FACTOR * ship.stats.thrust) * ctx.dt);
  const maxAvailableSpeed = ship.stats.maxFlightSpeed;

  if (ship.behaviour === "TUMBLE") return;

  // check for speed
  if (ship.desiredSpeed > maxAvailableSpeed)
    ship.desiredSpeed = maxAvailableSpeed;

  if (ship.flightSpeed > ship.desiredSpeed) {
    decreaseFlightSpeed(ship, ctx.mode, dtThrust);
    if (ship.flightSpeed < ship.desiredSpeed)
      ship.flightSpeed = ship.desiredSpeed;
  }
  if (ship.flightSpeed < ship.desiredSpeed) {
    increaseFlightSpeed(ship, ctx.mode, dtThrust);
    if (ship.flightSpeed > ship.desiredSpeed)
      ship.flightSpeed = ship.desiredSpeed;
  }
  moveForward(ship, ctx.mode, ctx.dt * ship.flightSpeed);
}

/** `behaviour_stop_still:` (`ShipEntity.m:3700-3706`). */
function behaviourStopStill(ship: Ship, ctx: Ctx): void {
  ship.stickRoll = 0.0;
  ship.stickPitch = 0.0;
  ship.stickYaw = 0.0;
  applySticks(ship, ctx);
}

/** `behaviour_idle:` (`ShipEntity.m:3708-3722`). */
function behaviourIdle(ship: Ship, ctx: Ctx): void {
  const isStation = ship.scanClass === "CLASS_STATION";
  const isBuoy = ship.scanClass === "CLASS_BUOY";
  ship.stickYaw = 0.0;
  if (!isStation && !isBuoy) {
    ship.stickRoll = 0.0;
  } else {
    ship.stickRoll = ship.flightRoll;
  }
  if (!isBuoy) {
    ship.stickPitch = 0.0;
  } else {
    ship.stickPitch = ship.flightPitch;
  }
  applySticks(ship, ctx);
}

/** `behaviour_tumble:` (`ShipEntity.m:3724-3727`). */
function behaviourTumble(ship: Ship, ctx: Ctx): void {
  applySticks(ship, ctx);
}

/** `performStop` (`ShipEntityAI.m:466-471`). */
function performStop(ship: Ship): void {
  ship.behaviour = "STOP_STILL";
  ship.desiredSpeed = 0.0;
  ship.frustration = fr(0.0);
}

/** `performIdle` (`ShipEntityAI.m:407-411`). */
function performIdle(ship: Ship): void {
  ship.behaviour = "IDLE";
  ship.frustration = fr(0.0);
}

/** `performTumble` (`ShipEntityAI.m:473-479`): two `randf()` draws, roll first. */
function performTumble(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  ship.stickRoll = r(ship.stats.maxFlightRoll * 2.0 * (ctx.draw() - 0.5));
  ship.stickPitch = r(ship.stats.maxFlightPitch * 2.0 * (ctx.draw() - 0.5));
  ship.behaviour = "TUMBLE";
  ship.frustration = fr(0.0);
}

/** The behaviours of this file: idle, stop still, tumble. */
export const BASE_BEHAVIOURS: BehaviourTable = {
  IDLE: { process: behaviourIdle, perform: performIdle },
  STOP_STILL: { process: behaviourStopStill, perform: performStop },
  STATION_KEEPING: { process: behaviourStopStill },
  TUMBLE: { process: behaviourTumble, perform: performTumble },
};

/** `processBehaviour:` (`ShipEntity.m:2485-2638`) for a non-sub-entity ship. */
export function processBehaviour(
  ship: Ship,
  ctx: Ctx,
  table: BehaviourTable,
): void {
  const def = table[ship.behaviour];
  if (def === undefined) {
    throw new Error(
      `behaviour ${ship.behaviour} is not modelled by this reference`,
    );
  }
  def.process(ship, ctx);
  applyAttitudeChanges(ship, ctx);
  applyThrust(ship, ctx);
}

/** Build the reference ship from a fixture's `self` and `stats`. */
export function shipFromFixture(fixture: OracleFixture, mode: Mode): Ship {
  const r = mode.r;
  const s = fixture.self;
  const basis = quatFromBasis(
    vec(s.right[0], s.right[1], s.right[2]),
    vec(s.up[0], s.up[1], s.up[2]),
    vec(s.forward[0], s.forward[1], s.forward[2]),
  );
  const orientation: Quat = {
    w: r(basis.w),
    x: r(basis.x),
    y: r(basis.y),
    z: r(basis.z),
  };
  return {
    stats: {
      maxFlightSpeed: r(fixture.stats.maxFlightSpeed),
      maxFlightRoll: r(fixture.stats.maxFlightRoll),
      maxFlightPitch: r(fixture.stats.maxFlightPitch),
      thrust: r(fixture.stats.thrust),
      scannerRange: r(fixture.stats.scannerRange),
    },
    scanClass: s.scanClass,
    radius: r(s.radius),
    position: vec(s.position[0], s.position[1], s.position[2]),
    orientation,
    lastOrientation: orientation,
    hasRotated: false,
    forward: forwardFromQuat(mode, orientation),
    up: upFromQuat(mode, orientation),
    right: rightFromQuat(mode, orientation),
    flightSpeed: r(s.speed),
    flightRoll: r(s.flightRoll),
    flightPitch: r(s.flightPitch),
    flightYaw: 0,
    stickRoll: r(s.stickRoll),
    stickPitch: r(s.stickPitch),
    stickYaw: 0,
    desiredSpeed: r(s.desiredSpeed),
    desiredRange: r(s.desiredRange),
    accuracy: r(s.accuracy),
    frustration: fr(s.frustration),
    successFactor: fr(s.successFactor),
    pitchingOver: s.pitchingOver === 1,
    jink: vec(r(s.jink[0]), r(s.jink[1]), r(s.jink[2])),
    behaviour: s.behaviour,
    targetId: s.targetId,
    destination: vec(s.destination[0], s.destination[1], s.destination[2]),
    proximityAlert: 0,
    ownerId: s.ownerId,
    escortSlot: s.escortSlot,
  };
}

/** `rangeToDestination` (`ShipEntity.m:9617-9620`): double distance, GLfloat return. */
export function rangeToDestination(ship: Ship, mode: Mode): number {
  const dx = ship.position.x - ship.destination.x;
  const dy = ship.position.y - ship.destination.y;
  const dz = ship.position.z - ship.destination.z;
  return mode.r(Math.sqrt(dx * dx + dy * dy + dz * dz));
}

/** `rangeToSecondaryTarget:` (`ShipEntity.m:9723-9733`). */
function rangeToTarget(ship: Ship, ctx: Ctx): number {
  const target = ctx.bodies.find((candidate) => candidate.id === ship.targetId);
  if (target === undefined) return 0.0;
  const r = ctx.mode.r;
  const dx = r(target.position.x - ship.position.x);
  const dy = r(target.position.y - ship.position.y);
  const dz = r(target.position.z - ship.position.z);
  let dist = r(Math.sqrt(r(r(r(dx * dx) + r(dy * dy)) + r(dz * dz))));
  dist -= target.radius;
  dist -= ship.radius;
  return dist;
}

function angleBetween(a: Vec, b: Vec): number {
  const la = Math.hypot(a.x, a.y, a.z);
  const lb = Math.hypot(b.x, b.y, b.z);
  if (la === 0 || lb === 0) return 0;
  const cosine = (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb);
  return Math.acos(Math.min(1, Math.max(-1, cosine)));
}

export type Snapshot = Readonly<Record<OracleField, number | string>>;

/** Every contract field of the replay state (contract item 5). */
export function snapshot(ship: Ship, ctx: Ctx): Snapshot {
  const toDestination = vec(
    ship.destination.x - ship.position.x,
    ship.destination.y - ship.position.y,
    ship.destination.z - ship.position.z,
  );
  const target = ctx.bodies.find((candidate) => candidate.id === ship.targetId);
  const toTarget =
    target === undefined
      ? vec(0, 0, 0)
      : vec(
          target.position.x - ship.position.x,
          target.position.y - ship.position.y,
          target.position.z - ship.position.z,
        );
  return {
    flightSpeed: ship.flightSpeed,
    flightRoll: ship.flightRoll,
    flightPitch: ship.flightPitch,
    stickRoll: ship.stickRoll,
    stickPitch: ship.stickPitch,
    desiredSpeed: ship.desiredSpeed,
    desiredRange: ship.desiredRange,
    frustration: ship.frustration,
    successFactor: ship.successFactor,
    pitchingOver: ship.pitchingOver ? 1 : 0,
    accuracy: ship.accuracy,
    behaviour: ship.behaviour,
    targetId: ship.targetId,
    proximityAlert: ship.proximityAlert,
    rangeToDestination: rangeToDestination(ship, ctx.mode),
    rangeToTarget: rangeToTarget(ship, ctx),
    headingErrorDestination: angleBetween(ship.forward, toDestination),
    headingErrorTarget: angleBetween(ship.forward, toTarget),
    positionX: ship.position.x,
    positionY: ship.position.y,
    positionZ: ship.position.z,
    forwardX: ship.forward.x,
    forwardY: ship.forward.y,
    forwardZ: ship.forward.z,
    upX: ship.up.x,
    upY: ship.up.y,
    upZ: ship.up.z,
    jinkX: ship.jink.x,
    jinkY: ship.jink.y,
    jinkZ: ship.jink.z,
    destinationX: ship.destination.x,
    destinationY: ship.destination.y,
    destinationZ: ship.destination.z,
    // The tracking curve belongs to the pursuit oracle (plan 14-02); this
    // reference does not model it, and a check on it fails loudly.
    aimPointX: Number.NaN,
    aimPointY: Number.NaN,
    aimPointZ: Number.NaN,
  };
}

export interface ReplayResult {
  readonly snapshots: ReadonlyMap<number, Snapshot>;
  readonly events: readonly { tick: number; name: OracleEventName }[];
  readonly drawsConsumed: number;
  readonly counters: Readonly<Record<string, number>>;
}

/** Slot (a) of the in-tick order: bodies move by their `motion`. */
function advanceBodies(fixture: OracleFixture, ctx: Ctx): void {
  if (fixture.motion === "static") return;
  for (const body of ctx.bodies) {
    body.position = {
      x: body.position.x + body.forward.x * body.speed * ctx.dt,
      y: body.position.y + body.forward.y * body.speed * ctx.dt,
      z: body.position.z + body.forward.z * body.speed * ctx.dt,
    };
  }
}

/**
 * Slot (b): the escort leader refreshes self's destination. Plan 14-06 fills
 * it; a fixture that names a leader fails here instead of being replayed
 * without the rule.
 */
function refreshLeaderDestination(ship: Ship): void {
  if (ship.ownerId !== 0) {
    throw new Error("slot (b), the leader refresh, is filled by plan 14-06");
  }
}

/** Squared `PROXIMITY_WARN_DISTANCE` (`Universe.h:99-100`, 4 squared). */
const PROXIMITY_WARN_DISTANCE2 = 16;

/**
 * Slot (d): the proximity rule. It clears self's alert (`CollisionRegion.m:271`)
 * and stays inactive: a fixture whose pair trigger would fire fails here
 * instead of being replayed without the rule (plan 14-06 fills it).
 */
function proximityPass(ship: Ship, ctx: Ctx): void {
  ship.proximityAlert = 0;
  for (const body of ctx.bodies) {
    if (body.kind === "planet" || body.kind === "sun") continue;
    const dx = ship.position.x - body.position.x;
    const dy = ship.position.y - body.position.y;
    const dz = ship.position.z - body.position.z;
    const dist2 = dx * dx + dy * dy + dz * dz;
    const r = Math.max(ship.radius, body.radius);
    if (dist2 < PROXIMITY_WARN_DISTANCE2 * r * r) {
      throw new Error("slot (d), the proximity rule, is filled by plan 14-06");
    }
  }
}

/**
 * Replay a fixture in the given mode and record every contract field at the
 * requested ticks (default: the ticks its checks name).
 */
export function replayWith(
  fixture: OracleFixture,
  mode: Mode,
  table: BehaviourTable,
  wanted?: ReadonlySet<number>,
): ReplayResult {
  const ticks =
    wanted ?? new Set<number>(fixture.checks.map((check) => check.tick));
  const ship = shipFromFixture(fixture, mode);
  const bodies: ReplayBody[] = fixture.bodies.map((body) => ({
    id: body.id,
    kind: body.kind,
    scanClass: body.scanClass,
    radius: mode.r(body.radius),
    mass: body.mass,
    position: vec(body.position[0], body.position[1], body.position[2]),
    forward: vec(body.forward[0], body.forward[1], body.forward[2]),
    speed: body.speed,
    behaviour: body.behaviour,
    targetId: body.targetId,
  }));

  let drawIndex = 0;
  const events: { tick: number; name: OracleEventName }[] = [];
  const ctx: Ctx = {
    mode,
    dt: fixture.dt,
    bodies,
    events,
    counters: {},
    tick: 0,
    draw(): number {
      const value = fixture.draws[drawIndex];
      if (value === undefined) {
        throw new Error(
          `fixture ${fixture.id} consumed more draws than it lists`,
        );
      }
      drawIndex += 1;
      return mode.r(value);
    },
    post(name: OracleEventName): void {
      events.push({ tick: ctx.tick, name });
    },
  };

  for (const call of fixture.assign) {
    switch (call.op) {
      case "setTarget":
        ship.targetId = Number(call.value);
        break;
      case "setDestination": {
        const v = call.value as readonly number[];
        ship.destination = vec(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
        break;
      }
      case "setDesiredRange":
        ship.desiredRange = mode.r(Number(call.value));
        break;
      case "setDesiredSpeed":
        ship.desiredSpeed = mode.r(Number(call.value));
        break;
      case "perform": {
        const def = table[String(call.value)];
        if (def?.perform === undefined) {
          throw new Error(`perform ${String(call.value)} is not modelled`);
        }
        def.perform(ship, ctx);
        break;
      }
    }
  }

  const snapshots = new Map<number, Snapshot>();
  if (ticks.has(0)) snapshots.set(0, snapshot(ship, ctx));
  for (let tick = 1; tick <= fixture.horizon; tick += 1) {
    ctx.tick = tick;
    advanceBodies(fixture, ctx); // (a)
    refreshLeaderDestination(ship); // (b)
    processBehaviour(ship, ctx, table); // (c)
    // Entity.m:870-875: the end of `update:` records whether the pose changed.
    ship.hasRotated = !quatEqual(ship.orientation, ship.lastOrientation);
    ship.lastOrientation = ship.orientation;
    proximityPass(ship, ctx); // (d)
    if (ticks.has(tick)) snapshots.set(tick, snapshot(ship, ctx));
  }
  return {
    snapshots,
    events,
    drawsConsumed: drawIndex,
    counters: ctx.counters,
  };
}

/** The replay of the behaviours this file defines (idle, stop still, tumble). */
export function replay(
  fixture: OracleFixture,
  mode: Mode,
  wanted?: ReadonlySet<number>,
): ReplayResult {
  return replayWith(fixture, mode, BASE_BEHAVIOURS, wanted);
}

/** One check's value in a replay. */
export function valueOf(
  result: ReplayResult,
  check: Pick<OracleCheck, "tick" | "field">,
): number | string {
  const shot = result.snapshots.get(check.tick);
  if (shot === undefined) {
    throw new Error(`tick ${check.tick} was not recorded`);
  }
  return shot[check.field];
}

/**
 * The first tick at which a counter written as `Math.fround(f + dt)` from 0
 * exceeds `seconds` (contract item 8). Every fixture derivation of a time
 * threshold uses this, never `ceil(seconds * 120)`.
 */
export function firstTickAbove(seconds: number, dt: number = 1 / 120): number {
  let counter = 0;
  for (let tick = 1; tick < 10_000_000; tick += 1) {
    counter = Math.fround(counter + dt);
    if (counter > seconds) return tick;
  }
  throw new Error(`counter never exceeds ${seconds}`);
}

/** The same sum in plain float64: it only proves the one-tick difference exists. */
export function firstTickAboveFloat64(
  seconds: number,
  dt: number = 1 / 120,
): number {
  let counter = 0;
  for (let tick = 1; tick < 10_000_000; tick += 1) {
    counter += dt;
    if (counter > seconds) return tick;
  }
  throw new Error(`counter never exceeds ${seconds}`);
}
