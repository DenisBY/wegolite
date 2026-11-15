// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The oracle runner (Phase 14, plan 14-09): replays one oracle fixture through
 * the real port, tick by tick, and compares every check.
 *
 * A fixture's synthetic world goes through `ShipControl.perform` and
 * `steerShip` into the flight model. Only the steered ship (id 101) is a real
 * world entity; every other body of the fixture is a plain record behind a
 * synthetic `WorldView`, so the port reads other bodies exactly as it does in
 * the world (through the view) and the oracle fixtures stay the only source of
 * expected values. Nothing here reads `tests/oracles/npc/reference`.
 *
 * Frame: a fixture is in Oolite's world frame (forward +Z); Wegolite's world is
 * Oolite's with every z component negated, and a ship's forward is its local
 * -Z. The runner applies exactly that mapping when it loads a pose and when it
 * reads a field back.
 *
 * In-tick order (oracle contract item 4), tick k being the state after k
 * updates of the steered ship:
 *   (a) every body advances by the fixture's `motion`;
 *   (b) the `beforeUpdate` hooks (plan 14-15: the escort leader refresh);
 *   (c) `steerShip` runs once, with `view.tick` = k (during update k the
 *       clock reads k, as the contract's item 8 states);
 *   (d) the `afterUpdate` hooks (plan 14-15: the proximity rule);
 * then every check at tick k is evaluated. Tick 0 is "after `assign` and the
 * `afterAssign` hooks, before the first update" (plan 14-12 starts the
 * tracking curve there).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { SCANNER_MAX_RANGE } from "../../../src/sim/npc/constants.js";
import { steerShip } from "../../../src/sim/npc/dispatch.js";
import type { SteerEvent } from "../../../src/sim/npc/dispatch.js";
import {
  pairTriggers,
  proximityAlertFor,
} from "../../../src/sim/npc/proximity.js";
import type { ProximityBody } from "../../../src/sim/npc/proximity.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import {
  calculateTargetPosition,
  startTrackingCurve,
} from "../../../src/sim/npc/tracking-curve.js";
import { quat, rotate, sub, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import type {
  BehaviourId,
  BodyKind,
  EntityId,
  ScanClass,
} from "../../../src/sim/world/ids.js";
import type {
  BodyView,
  ScanFilter,
  ShipView,
  WorldView,
} from "../../../src/sim/world/view.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { OracleFileSchema } from "../../oracles/npc/schema.js";
import type { OracleFixture } from "../../oracles/npc/schema.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The two fixture trees of the oracle (plans 14-01, 14-02 and 14-06). */
export const ORACLE_FIXTURE_DIRS = [
  "tests/oracles/npc/fixtures",
  "tests/oracles/npc/pursuit/fixtures",
] as const;

/** The id of the steered ship in every fixture (contract item 2). */
const SELF_ID = 101;
/** The id of the player body. */
const PLAYER_ID = 100;

const LOCAL_FORWARD = vec(0, 0, -1);
const LOCAL_UP = vec(0, 1, 0);

/* ---------------------------------------------------------------------------
 * Loading
 * ------------------------------------------------------------------------- */

let loaded: ReadonlyMap<string, readonly OracleFixture[]> | undefined;

/**
 * Every fixture file of both oracle trees, parsed with `OracleFileSchema`
 * before any is run. Keys are repository-relative paths with forward slashes.
 * A file that fails the schema, or a fixture whose `stats.scannerRange` differs
 * from `SCANNER_MAX_RANGE` (the port has no per-ship scanner range), throws: an
 * oracle dispute for the orchestrator, never something to work around.
 */
export function loadOracleFiles(): ReadonlyMap<
  string,
  readonly OracleFixture[]
> {
  if (loaded !== undefined) return loaded;
  const files = new Map<string, readonly OracleFixture[]>();
  for (const dir of ORACLE_FIXTURE_DIRS) {
    const absolute = join(REPO_ROOT, dir);
    for (const name of readdirSync(absolute).sort()) {
      if (!name.endsWith(".json")) continue;
      const path = relative(REPO_ROOT, join(absolute, name))
        .split("\\")
        .join("/");
      const parsed = OracleFileSchema.safeParse(
        JSON.parse(readFileSync(join(absolute, name), "utf8")) as unknown,
      );
      if (!parsed.success) {
        throw new Error(
          `oracle dispute: ${path} does not parse with OracleFileSchema: ${parsed.error.message}`,
        );
      }
      for (const fixture of parsed.data) {
        if (fixture.stats.scannerRange !== SCANNER_MAX_RANGE) {
          throw new Error(
            `oracle dispute: ${path} fixture ${fixture.id} has scannerRange ${String(fixture.stats.scannerRange)}, the port uses ${String(SCANNER_MAX_RANGE)} for every ship`,
          );
        }
      }
      files.set(path, parsed.data);
    }
  }
  loaded = files;
  return files;
}

/** The fixtures of one fixture file (repository-relative path). */
export function fixturesIn(path: string): readonly OracleFixture[] {
  const fixtures = loadOracleFiles().get(path);
  if (fixtures === undefined) throw new Error(`no oracle fixture file ${path}`);
  return fixtures;
}

/* ---------------------------------------------------------------------------
 * Frame mapping
 * ------------------------------------------------------------------------- */

type Triple = readonly [number, number, number];

/** An Oolite world vector as a Wegolite vector (z negated). */
export function fromOolite(v: Triple): Vec3 {
  return vec(v[0], v[1], -v[2]);
}

/** A Wegolite vector as an Oolite triple (z negated). */
export function toOolite(v: Vec3): [number, number, number] {
  return [v.x, v.y, -v.z];
}

/**
 * The Wegolite orientation of an Oolite frame: local +X maps to the fixture's
 * right, local +Y to its up and local -Z to its forward (all with z negated).
 */
export function orientationFromFrame(
  forward: Triple,
  up: Triple,
  right: Triple,
): Quat {
  const r = fromOolite(right);
  const u = fromOolite(up);
  const f = fromOolite(forward);
  // Columns of the rotation matrix: local X, local Y, local Z (= -forward).
  const m00 = r.x;
  const m10 = r.y;
  const m20 = r.z;
  const m01 = u.x;
  const m11 = u.y;
  const m21 = u.z;
  const m02 = -f.x;
  const m12 = -f.y;
  const m22 = -f.z;
  const trace = m00 + m11 + m22;
  let w: number;
  let x: number;
  let y: number;
  let z: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  const norm = Math.sqrt(w * w + x * x + y * y + z * z);
  return quat(w / norm, x / norm, y / norm, z / norm);
}

/* ---------------------------------------------------------------------------
 * The synthetic world view
 * ------------------------------------------------------------------------- */

/** A body of a fixture, behind the synthetic view. */
export interface RunnerBody {
  readonly id: EntityId;
  readonly kind: BodyKind;
  readonly scanClass: ScanClass;
  readonly radius: number;
  readonly mass: number;
  position: Vec3;
  readonly orientation: Quat;
  readonly speed: number;
  readonly behaviour: BehaviourId;
  readonly targetId: EntityId;
}

function bodyView(body: RunnerBody): BodyView {
  return {
    id: body.id,
    kind: body.kind,
    scanClass: body.scanClass,
    position: body.position,
    orientation: body.orientation,
    speed: body.speed,
    radius: body.radius,
  };
}

function shipView(body: RunnerBody): ShipView {
  return {
    ...bodyView(body),
    behaviour: body.behaviour,
    targetId: body.targetId,
    destination: body.position,
    desiredRange: 0,
    desiredSpeed: body.speed,
  };
}

function entityBody(entity: Entity): BodyView {
  return {
    id: entity.id,
    kind: entity.kind,
    scanClass: entity.scanClass,
    position: entity.position,
    orientation: entity.orientation,
    speed: entity.speed,
    radius: entity.radius,
  };
}

function entityShip(entity: Entity): ShipView {
  return {
    ...entityBody(entity),
    behaviour: entity.nav.behaviour,
    targetId: entity.nav.targetId,
    destination: entity.nav.destination,
    desiredRange: entity.nav.desiredRange,
    desiredSpeed: entity.nav.desiredSpeed,
  };
}

/**
 * A `WorldView` over `bodies` and, when given, the steered `self` entity, at
 * `tick`. Every returned object is a fresh copy, as the real view's are. Also
 * used by the property test with no bodies.
 */
export function createSyntheticView(
  bodies: readonly RunnerBody[],
  self: Entity | undefined,
  tick: number,
): WorldView {
  function bodyOf(id: EntityId): BodyView | undefined {
    if (self !== undefined && id === self.id && !self.dead) {
      return structuredClone(entityBody(self));
    }
    const found = bodies.find((candidate) => candidate.id === id);
    return found === undefined ? undefined : structuredClone(bodyView(found));
  }
  function kindId(kind: BodyKind): EntityId {
    return bodies.find((candidate) => candidate.kind === kind)?.id ?? 0;
  }
  return {
    tick,
    playerId: PLAYER_ID,
    isValid: (id) => bodyOf(id) !== undefined,
    body: bodyOf,
    ship(id) {
      if (self !== undefined && id === self.id && !self.dead) {
        return structuredClone(entityShip(self));
      }
      const found = bodies.find(
        (candidate) => candidate.id === id && candidate.kind === "ship",
      );
      return found === undefined ? undefined : structuredClone(shipView(found));
    },
    scan(selfId: EntityId, range: number, filter?: ScanFilter) {
      const origin = bodyOf(selfId);
      if (origin === undefined || !Number.isFinite(range) || range < 0) {
        return [];
      }
      const candidates: BodyView[] = [];
      for (const body of bodies) candidates.push(bodyView(body));
      if (self !== undefined && !self.dead) candidates.push(entityBody(self));
      const found: { id: EntityId; distance: number }[] = [];
      for (const candidate of candidates) {
        if (candidate.id === selfId) continue;
        if (
          filter?.kinds !== undefined &&
          !filter.kinds.includes(candidate.kind)
        ) {
          continue;
        }
        const delta = sub(candidate.position, origin.position);
        const distance = Math.sqrt(
          delta.x * delta.x + delta.y * delta.y + delta.z * delta.z,
        );
        if (distance <= range) found.push({ id: candidate.id, distance });
      }
      found.sort((a, b) => a.distance - b.distance || a.id - b.id);
      return found.map((entry) => entry.id);
    },
    mainStation: () => kindId("station"),
    mainPlanet: () => kindId("planet"),
    sun: () => kindId("sun"),
  };
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------- */

/** What a hook sees of the running fixture. */
export interface RunnerArgs {
  readonly fixture: OracleFixture;
  readonly world: World;
  readonly self: Entity;
  /** 0 after `assign`; the number of the update about to run or just run. */
  readonly tick: number;
  readonly bodies: readonly RunnerBody[];
  readonly view: WorldView;
}

export type RunnerHook = (args: RunnerArgs) => void;

/**
 * The hook slots: `afterAssign` runs once after the `assign` calls at tick 0,
 * `beforeUpdate` runs at (b) of every tick (the escort leader refresh) and
 * `afterUpdate` at (d) (the proximity rule). `emptyHooks()` fills `afterAssign`
 * with the pending tracking-curve start (plan 14-12) and `afterUpdate` with
 * `proximityHook` (plan 14-15), the rule the contract's in-tick order gives
 * every fixture; `beforeUpdate` takes the escort leader refresh (plan 14-15).
 */
export interface RunnerHooks {
  readonly afterAssign: RunnerHook[];
  readonly beforeUpdate: RunnerHook[];
  readonly afterUpdate: RunnerHook[];
}

/**
 * The hook that starts the steered ship's pending tracking curve at tick 0, as
 * `stepWorld` does after the think phase's final drain (oracle contract item 4;
 * plan 14-12): the same `startTrackingCurve`, for the steered ship, at the
 * fixture's view.
 */
export const startPendingCurveHook: RunnerHook = ({ self, view }) => {
  if (self.steer.trackingCount === 0) {
    startTrackingCurve(self, view, view.tick);
  }
};

/**
 * The proximity rule of contract item 4 (d), plan 14-15: after the update,
 * `self`'s alert is cleared (`CollisionRegion.m:269-272`) and the pair trigger
 * plus `setProximityAlert:` are applied between `self` and every body that is
 * not a planet or a sun, through the same `pairTriggers` and
 * `proximityAlertFor` as the world's pass. The fixture's bodies carry their
 * mass; every one is crewed.
 */
export const proximityHook: RunnerHook = ({ self, bodies, fixture }) => {
  self.steer.proximityAlert = 0;
  const lookup = (id: EntityId): ProximityBody | undefined =>
    bodies.find((candidate) => candidate.id === id);
  for (const body of bodies) {
    if (body.kind === "planet" || body.kind === "sun") continue;
    const dx = body.position.x - self.position.x;
    const dy = body.position.y - self.position.y;
    const dz = body.position.z - self.position.z;
    if (!pairTriggers(dx * dx + dy * dy + dz * dz, self.radius, body.radius)) {
      continue;
    }
    proximityAlertFor(
      self,
      fixture.stats.maxFlightSpeed,
      body,
      body.mass,
      lookup,
    );
  }
};

export function emptyHooks(): RunnerHooks {
  return {
    afterAssign: [startPendingCurveHook],
    beforeUpdate: [],
    afterUpdate: [proximityHook],
  };
}

/* ---------------------------------------------------------------------------
 * Reading a field back
 * ------------------------------------------------------------------------- */

function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** The angle between two vectors, `atan2(|a x b|, a . b)` (accurate near 0). */
function angleBetween(a: Vec3, b: Vec3): number {
  const cx = a.y * b.z - a.z * b.y;
  const cy = a.z * b.x - a.x * b.z;
  const cz = a.x * b.y - a.y * b.x;
  return Math.atan2(
    Math.sqrt(cx * cx + cy * cy + cz * cz),
    a.x * b.x + a.y * b.y + a.z * b.z,
  );
}

function readField(
  field: string,
  self: Entity,
  view: WorldView,
): number | string {
  const steer = self.steer;
  const [px, py, pz] = toOolite(self.position);
  const forward = toOolite(rotate(self.orientation, LOCAL_FORWARD));
  const up = toOolite(rotate(self.orientation, LOCAL_UP));
  const jink = toOolite(steer.jink);
  const destination = toOolite(self.nav.destination);
  switch (field) {
    case "flightSpeed":
      return self.speed;
    case "flightRoll":
      return steer.flightRoll;
    case "flightPitch":
      return steer.flightPitch;
    case "stickRoll":
      return steer.stickRoll;
    case "stickPitch":
      return steer.stickPitch;
    case "desiredSpeed":
      return self.nav.desiredSpeed;
    case "desiredRange":
      return self.nav.desiredRange;
    case "frustration":
      return steer.frustration;
    case "successFactor":
      return steer.successFactor;
    case "pitchingOver":
      return steer.pitchingOver ? 1 : 0;
    case "accuracy":
      return steer.accuracy;
    case "behaviour":
      return self.nav.behaviour;
    case "targetId":
      return self.nav.targetId;
    case "proximityAlert":
      return steer.proximityAlert;
    case "rangeToDestination":
      return magnitude(sub(self.nav.destination, self.position));
    case "rangeToTarget": {
      // rangeToSecondaryTarget: centre distance minus both collision radii
      // (ShipEntity.m:9718-9733); 0 for no target.
      const target = view.body(self.nav.targetId);
      if (target === undefined) return 0;
      return (
        magnitude(sub(target.position, self.position)) -
        target.radius -
        self.radius
      );
    }
    case "headingErrorDestination": {
      const toDestination = sub(self.nav.destination, self.position);
      if (magnitude(toDestination) === 0) return 0;
      return angleBetween(
        rotate(self.orientation, LOCAL_FORWARD),
        toDestination,
      );
    }
    case "headingErrorTarget": {
      const target = view.body(self.nav.targetId);
      if (target === undefined) return 0;
      const toTarget = sub(target.position, self.position);
      if (magnitude(toTarget) === 0) return 0;
      return angleBetween(rotate(self.orientation, LOCAL_FORWARD), toTarget);
    }
    case "positionX":
      return px;
    case "positionY":
      return py;
    case "positionZ":
      return pz;
    case "forwardX":
      return forward[0];
    case "forwardY":
      return forward[1];
    case "forwardZ":
      return forward[2];
    case "upX":
      return up[0];
    case "upY":
      return up[1];
    case "upZ":
      return up[2];
    case "jinkX":
      return jink[0];
    case "jinkY":
      return jink[1];
    case "jinkZ":
      return jink[2];
    case "destinationX":
      return destination[0];
    case "destinationY":
      return destination[1];
    case "destinationZ":
      return destination[2];
    case "aimPointX":
      return toOolite(calculateTargetPosition(self, view, view.tick))[0];
    case "aimPointY":
      return toOolite(calculateTargetPosition(self, view, view.tick))[1];
    case "aimPointZ":
      return toOolite(calculateTargetPosition(self, view, view.tick))[2];
    default:
      throw new Error(`the runner cannot read field ${field}`);
  }
}

/* ---------------------------------------------------------------------------
 * Running one fixture
 * ------------------------------------------------------------------------- */

export interface FixtureResult {
  readonly id: string;
  /** One line per failed check, event or draw-count mismatch. */
  readonly failures: readonly string[];
  /** The number of unit draws the port consumed. */
  readonly drawsUsed: number;
  readonly checks: number;
}

function flightStatsOf(fixture: OracleFixture): NpcFlightStats {
  return {
    specKey: fixture.id,
    maxFlightSpeed: fixture.stats.maxFlightSpeed,
    maxFlightRoll: fixture.stats.maxFlightRoll,
    maxFlightPitch: fixture.stats.maxFlightPitch,
    thrust: fixture.stats.thrust,
    mass: fixture.stats.mass,
    forwardWeapon: fixture.stats.forwardWeapon,
  };
}

function buildBodies(fixture: OracleFixture): RunnerBody[] {
  return fixture.bodies.map((body) => ({
    id: body.id,
    kind: body.kind,
    scanClass: body.scanClass,
    radius: body.radius,
    mass: body.mass,
    position: fromOolite(body.position),
    orientation: orientationFromFrame(body.forward, body.up, body.right),
    speed: body.speed,
    behaviour: body.behaviour,
    targetId: body.targetId,
  }));
}

/** Replay one fixture through the port and report every mismatch. */
export function runFixture(
  fixture: OracleFixture,
  hooks: RunnerHooks = emptyHooks(),
): FixtureResult {
  const failures: string[] = [];
  const world = createWorld(1);
  const pose = fixture.self;
  const spawned = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: fixture.id,
      scanClass: pose.scanClass,
      position: fromOolite(pose.position),
      orientation: orientationFromFrame(pose.forward, pose.up, pose.right),
      radius: pose.radius,
      speed: pose.speed,
      ownerId: pose.ownerId,
      escortSlot: pose.escortSlot,
    },
    0,
  );
  if (!spawned.ok) {
    throw new Error(`fixture ${fixture.id}: spawn refused (${spawned.reason})`);
  }
  const self = spawned.entity;
  if (self.id !== SELF_ID) {
    throw new Error(
      `fixture ${fixture.id}: the steered ship got id ${self.id}`,
    );
  }

  // The recorded state, written verbatim (a fixture may hold a value the
  // ShipControl domain would refuse, such as a negative desired range).
  self.steer.flightRoll = pose.flightRoll;
  self.steer.flightPitch = pose.flightPitch;
  self.steer.stickRoll = pose.stickRoll;
  self.steer.stickPitch = pose.stickPitch;
  self.steer.accuracy = pose.accuracy;
  self.steer.frustration = pose.frustration;
  self.steer.successFactor = pose.successFactor;
  self.steer.pitchingOver = pose.pitchingOver === 1;
  self.steer.jink = fromOolite(pose.jink);
  self.nav.behaviour = pose.behaviour;
  self.nav.targetId = pose.targetId;
  self.nav.destination = fromOolite(pose.destination);
  self.nav.desiredRange = pose.desiredRange;
  self.nav.desiredSpeed = pose.desiredSpeed;

  const bodies = buildBodies(fixture);
  const stats = flightStatsOf(fixture);

  // `assign`, through the ShipControl at tick 0.
  const control = createShipControl(world, SELF_ID, 0);
  for (const call of fixture.assign) {
    switch (call.op) {
      case "setTarget":
        control.setTarget(SELF_ID, call.value as number);
        break;
      case "setDestination":
        control.setDestination(
          SELF_ID,
          fromOolite(call.value as [number, number, number]),
        );
        break;
      case "setDesiredRange":
        control.setDesiredRange(SELF_ID, call.value as number);
        break;
      case "setDesiredSpeed":
        control.setDesiredSpeed(SELF_ID, call.value as number);
        break;
      case "perform":
        control.perform(SELF_ID, call.value as BehaviourId);
        break;
    }
  }

  let used = 0;
  const draw = (): number => {
    const value = fixture.draws[used];
    if (value === undefined) {
      throw new Error(
        `fixture ${fixture.id}: the port drew more than the ${String(fixture.draws.length)} scripted draws`,
      );
    }
    used += 1;
    return value;
  };
  const events: { tick: number; name: string }[] = [];
  let tick = 0;

  const argsAt = (view: WorldView): RunnerArgs => ({
    fixture,
    world,
    self,
    tick,
    bodies,
    view,
  });
  const runHooks = (list: readonly RunnerHook[], view: WorldView): void => {
    for (const hook of list) hook(argsAt(view));
  };

  const checksByTick = new Map<number, OracleFixture["checks"]>();
  for (const check of fixture.checks) {
    const list = checksByTick.get(check.tick) ?? [];
    checksByTick.set(check.tick, [...list, check]);
  }
  let checkCount = 0;
  const evaluate = (view: WorldView): void => {
    for (const check of checksByTick.get(tick) ?? []) {
      checkCount += 1;
      const actual = readField(check.field, self, view);
      const where = `${fixture.id} tick ${String(tick)} ${check.field}`;
      if (typeof check.expected === "string") {
        if (actual !== check.expected) {
          failures.push(
            `${where}: expected ${check.expected}, got ${String(actual)}`,
          );
        }
      } else if (
        typeof actual !== "number" ||
        !(Math.abs(actual - check.expected) <= check.tolerance)
      ) {
        failures.push(
          `${where}: expected ${String(check.expected)} +-${String(check.tolerance)}, got ${String(actual)}`,
        );
      }
    }
  };

  const viewAt = (): WorldView => createSyntheticView(bodies, self, tick);

  // Tick 0: after assign, before the first update.
  runHooks(hooks.afterAssign, viewAt());
  evaluate(viewAt());

  for (tick = 1; tick <= fixture.horizon; tick += 1) {
    // (a) the bodies advance along their own forward
    if (fixture.motion === "constant-velocity") {
      for (const body of bodies) {
        const forward = rotate(body.orientation, LOCAL_FORWARD);
        body.position = vec(
          body.position.x + forward.x * body.speed * fixture.dt,
          body.position.y + forward.y * body.speed * fixture.dt,
          body.position.z + forward.z * body.speed * fixture.dt,
        );
      }
    }
    const view = viewAt();
    // (b)
    runHooks(hooks.beforeUpdate, view);
    // (c) the native update
    const tickNow = tick;
    steerShip(self, {
      view,
      stats,
      dt: fixture.dt,
      draw,
      emit: (event: SteerEvent) => {
        events.push({ tick: tickNow, name: event.name });
      },
    });
    // (d)
    runHooks(hooks.afterUpdate, view);
    evaluate(viewAt());
  }

  if (used !== fixture.draws.length) {
    failures.push(
      `${fixture.id}: the port consumed ${String(used)} draws, the fixture scripts ${String(fixture.draws.length)}`,
    );
  }
  const expectedEvents = fixture.events.map((event) => ({
    tick: event.tick,
    name: event.name,
  }));
  if (JSON.stringify(events) !== JSON.stringify(expectedEvents)) {
    failures.push(
      `${fixture.id}: events ${JSON.stringify(events)}, expected ${JSON.stringify(expectedEvents)}`,
    );
  }
  return { id: fixture.id, failures, drawsUsed: used, checks: checkCount };
}

/** Run every fixture of one fixture file. */
export function runOracleGroup(
  path: string,
  hooks: RunnerHooks = emptyHooks(),
): readonly FixtureResult[] {
  return fixturesIn(path).map((fixture) => runFixture(fixture, hooks));
}
