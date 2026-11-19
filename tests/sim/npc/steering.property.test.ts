// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Steering is total (AI-01, plan 14-09, T-14-14, Pitfall 4): for every
 * domain-valid record and pose, `steerShip` returns without throwing, every
 * output is finite, the orientation stays unit, the speed stays in
 * `[0, maxFlightSpeed]`, `frustration` and `successFactor` stay float32 values
 * and `sanitizeEntity` repairs nothing afterwards. Steering has no try/catch,
 * so the property is what keeps a bad pose from taking the fixed step down.
 *
 * The generator builds only states the sanitiser accepts unchanged (accuracy in
 * [-5, 10] or the sentinel, trackingCount 0 or 4 with strictly decreasing signed
 * ticks, float32 accumulators, every other field inside the bounds of
 * `limits.ts`). Later plans that extend this file keep the same generator and
 * add their behaviour ids to `SWEPT_BEHAVIOURS`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { identity, normalizeVec, quat, vec } from "../../../src/sim/math.js";
import type { Quat } from "../../../src/sim/math.js";
import { AI_EVENT_NAMES } from "../../../src/sim/ai/types.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { MIN_HYPERSPEED_FACTOR } from "../../../src/sim/npc/constants.js";
import { steerShip } from "../../../src/sim/npc/dispatch.js";
import type { SteerContext } from "../../../src/sim/npc/dispatch.js";
import { ACCURACY_UNRESOLVED } from "../../../src/sim/npc/state.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { BEHAVIOUR_IDS } from "../../../src/sim/world/ids.js";
import type { BehaviourId } from "../../../src/sim/world/ids.js";
import {
  MAX_ACCURACY,
  MAX_ENTITY_MAGNITUDE,
  MAX_ESCORT_SLOT,
  MAX_FRUSTRATION,
  MAX_STEER_RATE,
  MAX_UINT32,
  MIN_ACCURACY,
  QUAT_UNIT_TOLERANCE,
} from "../../../src/sim/world/limits.js";
import { sanitizeEntity } from "../../../src/sim/world/sanitize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import { calculateTargetPosition } from "../../../src/sim/npc/tracking-curve.js";
import type { BodyKind } from "../../../src/sim/world/ids.js";
import { createSyntheticView } from "./oracle-runner.js";
import type { RunnerBody } from "./oracle-runner.js";

const DT = 1 / 120;

/** The ids the sim ports natively as idle-family behaviours. */
const IDLE_FAMILY: readonly BehaviourId[] = [
  "IDLE",
  "STOP_STILL",
  "STATION_KEEPING",
  "TUMBLE",
];

/**
 * Every id outside the scope of the phase: Oolite's idle behaviour and the
 * thrust ramp run for each of them (the recorded fallback of plan 14-09).
 */
const OUT_OF_SCOPE: readonly BehaviourId[] = [
  "TRACK_TARGET",
  "RUNNING_DEFENSE",
  "ATTACK_BROADSIDE",
  "ATTACK_BROADSIDE_LEFT",
  "ATTACK_BROADSIDE_RIGHT",
  "CLOSE_TO_BROADSIDE_RANGE",
  "CLOSE_WITH_TARGET",
  "ATTACK_MINING_TARGET",
  "TRACK_AS_TURRET",
  "FLY_THRU_NAVPOINTS",
  "LAND_ON_PLANET",
  "COLLECT_TARGET",
  "ENERGY_BOMB_COUNTDOWN",
  "TRACTORED",
  "SCRIPTED_AI",
  "SCRIPTED_ATTACK_AI",
];

/**
 * The navigation behaviours of plan 14-10 (FORMATION_BREAK shares fly-from,
 * ShipEntity.m:2604-2607).
 */
const NAVIGATION: readonly BehaviourId[] = [
  "FLY_RANGE_FROM_DESTINATION",
  "FLY_TO_DESTINATION",
  "FLY_FROM_DESTINATION",
  "FACE_DESTINATION",
  "FORMATION_BREAK",
];

/**
 * The target behaviours of plan 14-12 (COLLECT_TARGET stays in OUT_OF_SCOPE:
 * the collect half is AI-12). Plans 14-14 and 14-15 add attack.
 */
const PURSUIT: readonly BehaviourId[] = ["INTERCEPT_TARGET"];

/** Flee and the two evasive behaviours it can switch into (plan 14-13). */
const FLIGHT: readonly BehaviourId[] = [
  "FLEE_TARGET",
  "EVASIVE_ACTION",
  "FLEE_EVASIVE_ACTION",
];

/**
 * The attack dispatcher and its in-scope sub-behaviours (plan 14-14). The OUT
 * ids (RUNNING_DEFENSE, ATTACK_BROADSIDE and its sides, CLOSE_TO_BROADSIDE_RANGE,
 * CLOSE_WITH_TARGET, ATTACK_MINING_TARGET) stay in `OUT_OF_SCOPE` and run the
 * idle fallback.
 */
const ATTACK: readonly BehaviourId[] = [
  "ATTACK_TARGET",
  "ATTACK_FLY_TO_TARGET",
  "ATTACK_FLY_FROM_TARGET",
  "ATTACK_FLY_TO_TARGET_SIX",
  "ATTACK_FLY_TO_TARGET_TWELVE",
  "ATTACK_SNIPER",
  "ATTACK_BREAK_OFF_TARGET",
  "ATTACK_SLOW_DOGFIGHT",
];

/** Escort formation and collision avoidance (plan 14-15). */
const FORMATION: readonly BehaviourId[] = [
  "FORMATION_FORM_UP",
  "AVOID_COLLISION",
];

/** The behaviours the property sweeps. Later plans add their ids. */
const SWEPT_BEHAVIOURS: readonly BehaviourId[] = [
  ...IDLE_FAMILY,
  ...NAVIGATION,
  ...PURSUIT,
  ...FLIGHT,
  ...ATTACK,
  ...FORMATION,
  ...OUT_OF_SCOPE,
];

/**
 * The degenerate geometries the navigation behaviours must survive: a
 * destination at the ship's position (the zero relative position guard), a
 * destination closer than the smallest float square root can see, a desired
 * range larger than the range, and a ship at rest.
 */
const GEOMETRIES = [
  "free",
  "atShip",
  "nearShip",
  "insideRange",
  "stopped",
] as const;
type Geometry = (typeof GEOMETRIES)[number];

/* ---------------------------------------------------------------------------
 * Generators of domain-valid records
 * ------------------------------------------------------------------------- */

const noNegativeZero = (value: number): number => (value === 0 ? 0 : value);

function num(min: number, max: number): fc.Arbitrary<number> {
  return fc
    .double({ min, max, noNaN: true, noDefaultInfinity: true })
    .map(noNegativeZero);
}

const float32 = (min: number, max: number): fc.Arbitrary<number> =>
  num(min, max).map((value) => noNegativeZero(Math.fround(value)));

const position = fc.record({
  x: num(-1e6, 1e6),
  y: num(-1e6, 1e6),
  z: num(-1e6, 1e6),
});

const orientation: fc.Arbitrary<Quat> = fc
  .record({ w: num(-1, 1), x: num(-1, 1), y: num(-1, 1), z: num(-1, 1) })
  .filter((q) => q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z > 1e-3)
  .map((q) => {
    const length = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
    return quat(q.w / length, q.x / length, q.y / length, q.z / length);
  });

const stats: fc.Arbitrary<NpcFlightStats> = fc.record({
  specKey: fc.constant("sweep"),
  maxFlightSpeed: num(0, 700),
  maxFlightRoll: num(0.1, 6),
  maxFlightPitch: num(0.1, 6),
  thrust: num(0, 60),
  mass: num(0, 1e7),
  forwardWeapon: fc.constantFrom(
    "EQ_WEAPON_NONE" as const,
    "EQ_WEAPON_PULSE_LASER" as const,
    "EQ_WEAPON_BEAM_LASER" as const,
    "EQ_WEAPON_MINING_LASER" as const,
    "EQ_WEAPON_MILITARY_LASER" as const,
  ),
});

const trackingTicks = fc
  .uniqueArray(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
    minLength: 4,
    maxLength: 4,
  })
  .map((ticks) => ticks.sort((a, b) => b - a));

const record = fc.record({
  flightRoll: num(-MAX_STEER_RATE, MAX_STEER_RATE),
  flightPitch: num(-MAX_STEER_RATE, MAX_STEER_RATE),
  stickRoll: num(-MAX_STEER_RATE, MAX_STEER_RATE),
  stickPitch: num(-MAX_STEER_RATE, MAX_STEER_RATE),
  accuracy: fc.oneof(
    fc.constant(ACCURACY_UNRESOLVED),
    num(MIN_ACCURACY, MAX_ACCURACY),
  ),
  frustration: float32(0, MAX_FRUSTRATION),
  successFactor: float32(-9e11, 9e11),
  pitchingOver: fc.boolean(),
  jink: fc.record({
    x: num(-1e6, 1e6),
    y: num(-1e6, 1e6),
    z: num(-1e6, 1e6),
  }),
  proximityAlert: fc.integer({ min: 0, max: MAX_UINT32 }),
  escortSlot: fc.integer({ min: 0, max: MAX_ESCORT_SLOT }),
  tracking: fc.oneof(
    fc.constant(undefined),
    fc.record({
      ticks: trackingTicks,
      positions: fc.array(position, { minLength: 4, maxLength: 4 }),
    }),
  ),
  entryPending: fc.boolean(),
});

const nav = fc.record({
  behaviour: fc.constantFrom(...SWEPT_BEHAVIOURS),
  targetId: fc.integer({ min: 0, max: MAX_UINT32 }),
  destination: position,
  desiredRange: num(0, MAX_ENTITY_MAGNITUDE),
  desiredSpeed: num(0, MAX_ENTITY_MAGNITUDE),
});

const scanClass = fc.constantFrom(
  "CLASS_NEUTRAL" as const,
  "CLASS_POLICE" as const,
  "CLASS_MILITARY" as const,
  "CLASS_THARGOID" as const,
  "CLASS_STATION" as const,
  "CLASS_BUOY" as const,
);

const scenario = fc.record({
  stats,
  startFraction: num(0, 1),
  position,
  orientation,
  scanClass,
  record,
  nav,
  geometry: fc.constantFrom<Geometry>(...GEOMETRIES),
  seed: fc.integer({ min: 0, max: MAX_UINT32 }),
  ticks: fc.integer({ min: 1, max: 240 }),
});

type Scenario = typeof scenario extends fc.Arbitrary<infer T> ? T : never;

/* ---------------------------------------------------------------------------
 * The harness
 * ------------------------------------------------------------------------- */

function buildEntity(s: Scenario): Entity {
  const result = spawnEntity(
    createWorld(7),
    {
      kind: "ship",
      specKey: "sweep",
      scanClass: s.scanClass,
      position: s.position,
      orientation: s.orientation,
      radius: 50,
      speed: Math.min(
        s.stats.maxFlightSpeed,
        s.startFraction * s.stats.maxFlightSpeed,
      ),
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  const entity = result.entity;
  const steer = entity.steer;
  const r = s.record;
  steer.flightRoll = r.flightRoll;
  steer.flightPitch = r.flightPitch;
  steer.stickRoll = r.stickRoll;
  steer.stickPitch = r.stickPitch;
  steer.accuracy = r.accuracy;
  steer.frustration = r.frustration;
  steer.successFactor = r.successFactor;
  steer.pitchingOver = r.pitchingOver;
  steer.jink = r.jink;
  steer.proximityAlert = r.proximityAlert;
  steer.escortSlot = r.escortSlot;
  steer.entryPending = r.entryPending;
  if (r.tracking !== undefined) {
    const [t0, t1, t2, t3] = r.tracking.ticks;
    const [p0, p1, p2, p3] = r.tracking.positions;
    if (
      t0 === undefined ||
      t1 === undefined ||
      t2 === undefined ||
      t3 === undefined ||
      p0 === undefined ||
      p1 === undefined ||
      p2 === undefined ||
      p3 === undefined
    ) {
      throw new Error("a started curve holds four samples");
    }
    steer.trackingCount = 4;
    steer.trackingTicks = [t0, t1, t2, t3];
    steer.trackingPositions = [p0, p1, p2, p3];
  }
  entity.nav.behaviour = s.nav.behaviour;
  entity.nav.targetId = s.nav.targetId;
  entity.nav.destination = s.nav.destination;
  entity.nav.desiredRange = s.nav.desiredRange;
  entity.nav.desiredSpeed = s.nav.desiredSpeed;
  switch (s.geometry) {
    case "free":
      break;
    case "atShip":
      entity.nav.destination = entity.position;
      break;
    case "nearShip":
      entity.nav.destination = vec(
        entity.position.x + 1e-170,
        entity.position.y,
        entity.position.z,
      );
      break;
    case "insideRange": {
      const dx = entity.nav.destination.x - entity.position.x;
      const dy = entity.nav.destination.y - entity.position.y;
      const dz = entity.nav.destination.z - entity.position.z;
      entity.nav.desiredRange = Math.min(
        MAX_ENTITY_MAGNITUDE,
        2 * Math.sqrt(dx * dx + dy * dy + dz * dz) + 1,
      );
      break;
    }
    case "stopped":
      entity.speed = 0;
      entity.nav.desiredSpeed = 0;
      break;
  }
  return entity;
}

function contextFor(
  entity: Entity,
  s: Scenario,
  tick: number,
  draw: () => number,
  events: string[] = [],
): SteerContext {
  return {
    view: createSyntheticView([], entity, tick),
    stats: s.stats,
    dt: DT,
    draw,
    emit: (event) => {
      events.push(event.name);
    },
  };
}

function assertTotal(entity: Entity, stats: NpcFlightStats): void {
  const q = entity.orientation;
  const numbers = [
    entity.position.x,
    entity.position.y,
    entity.position.z,
    q.w,
    q.x,
    q.y,
    q.z,
    entity.speed,
    entity.nav.desiredSpeed,
    entity.steer.flightRoll,
    entity.steer.flightPitch,
    entity.steer.stickRoll,
    entity.steer.stickPitch,
    entity.steer.accuracy,
    entity.steer.frustration,
    entity.steer.successFactor,
  ];
  for (const value of numbers) expect(Number.isFinite(value)).toBe(true);
  expect(
    Math.abs(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z - 1),
  ).toBeLessThanOrEqual(QUAT_UNIT_TOLERANCE);
  expect(entity.speed).toBeGreaterThanOrEqual(0);
  expect(entity.speed).toBeLessThanOrEqual(stats.maxFlightSpeed);
  expect(
    Object.is(Math.fround(entity.steer.frustration), entity.steer.frustration),
  ).toBe(true);
  expect(
    Object.is(
      Math.fround(entity.steer.successFactor),
      entity.steer.successFactor,
    ),
  ).toBe(true);
}

describe("steering is total over domain-valid records (T-14-14)", () => {
  it("never throws, stays finite, unit and in range, and leaves the sanitiser nothing to repair", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const entity = buildEntity(s);
        const stream = createRngState(s.seed);
        const draw = (): number => rngNext(stream);
        const events: string[] = [];
        for (let tick = 1; tick <= s.ticks; tick += 1) {
          steerShip(entity, contextFor(entity, s, tick, draw, events));
          assertTotal(entity, s.stats);
          // every event posted is in the closed vocabulary the queue accepts
          for (const name of events) {
            expect(AI_EVENT_NAMES as readonly string[]).toContain(name);
          }
          expect(sanitizeEntity(entity)).toBe(false);
          expect(entity.repairs).toBe(0);
        }
      }),
      { numRuns: 150 },
    );
  }, 120_000);

  it("an accuracy still unresolved is drawn once and lands in range", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        // flee and evasive action draw for their jink (plan 14-13), and the
        // attack ids for theirs, the desired range and their frustration rolls
        // (plan 14-14); each is counted in its own tests
        fc.pre(
          !FLIGHT.includes(s.nav.behaviour) &&
            !ATTACK.includes(s.nav.behaviour),
        );
        const entity = buildEntity({
          ...s,
          record: { ...s.record, accuracy: ACCURACY_UNRESOLVED },
        });
        const stream = createRngState(s.seed);
        let draws = 0;
        const draw = (): number => {
          draws += 1;
          return rngNext(stream);
        };
        steerShip(entity, contextFor(entity, s, 1, draw));
        const expected =
          s.record.entryPending && s.nav.behaviour === "TUMBLE" ? 3 : 1;
        expect(draws).toBe(expected);
        expect(entity.steer.accuracy).toBeGreaterThanOrEqual(MIN_ACCURACY);
        expect(entity.steer.accuracy).toBeLessThanOrEqual(MAX_ACCURACY);
        // A police or military pilot is never worse than average (669-671).
        if (
          s.scanClass === "CLASS_POLICE" ||
          s.scanClass === "CLASS_MILITARY"
        ) {
          expect(entity.steer.accuracy).toBeGreaterThanOrEqual(0);
        }
        steerShip(entity, contextFor(entity, s, 2, draw));
        // The accuracy is drawn once and the pending entry completes once.
        expect(draws).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

/* ---------------------------------------------------------------------------
 * Steering with a recording fire (plan 17-09, D-17, Pitfall 16)
 * ------------------------------------------------------------------------- */

/** The id of the one target body of a firing scenario. */
const TARGET_BODY_ID = 4242;

/** The behaviours that reach a fire site: the attack family and the flee pair. */
const FIRING_BEHAVIOURS: readonly BehaviourId[] = [...ATTACK, ...FLIGHT];

const direction = fc
  .record({ x: num(-1, 1), y: num(-1, 1), z: num(-1, 1) })
  .map((v) => {
    const length = Math.hypot(v.x, v.y, v.z);
    return length > 1e-6
      ? vec(v.x / length, v.y / length, v.z / length)
      : vec(0, 0, -1);
  });

/** A scenario whose target is a real body, so the attack behaviours reach their sites. */
const firingScenario = fc.record({
  base: scenario,
  behaviour: fc.constantFrom(...FIRING_BEHAVIOURS),
  bearing: direction,
  distance: num(50, 30_000),
  targetRadius: num(10, 400),
  targetOrientation: orientation,
  targetSpeed: num(0, 300),
  targetTargetsUs: fc.boolean(),
});

describe("steering with a recording fire is total and asks at most once per update (D-17)", () => {
  it("never throws, requests at most once per steerShip call, stays finite and leaves the sanitiser nothing to repair", () => {
    let updates = 0;
    let requested = 0;
    let runsWithRequest = 0;
    fc.assert(
      fc.property(firingScenario, (f) => {
        const s: Scenario = {
          ...f.base,
          nav: {
            ...f.base.nav,
            behaviour: f.behaviour,
            targetId: TARGET_BODY_ID,
          },
        };
        const entity = buildEntity(s);
        const target: RunnerBody = {
          id: TARGET_BODY_ID,
          kind: "ship",
          scanClass: "CLASS_NEUTRAL",
          radius: f.targetRadius,
          mass: 1e5,
          position: vec(
            entity.position.x + f.bearing.x * f.distance,
            entity.position.y + f.bearing.y * f.distance,
            entity.position.z + f.bearing.z * f.distance,
          ),
          orientation: f.targetOrientation,
          speed: f.targetSpeed,
          behaviour: "IDLE",
          targetId: f.targetTargetsUs ? entity.id : 0,
        };
        const stream = createRngState(s.seed);
        const draw = (): number => rngNext(stream);
        let inRun = 0;
        for (let tick = 1; tick <= s.ticks; tick += 1) {
          let requests = 0;
          const events: string[] = [];
          steerShip(entity, {
            view: createSyntheticView([target], entity, tick),
            stats: s.stats,
            dt: DT,
            draw,
            emit: (event) => {
              events.push(event.name);
            },
            fire: () => {
              requests += 1;
            },
          });
          updates += 1;
          // One ship asks at most once an update: the gate draws once per
          // Oolite call, and Oolite's call sites are exclusive (Pitfall 16).
          expect(requests).toBeLessThanOrEqual(1);
          inRun += requests;
          assertTotal(entity, s.stats);
          for (const name of events) {
            expect(AI_EVENT_NAMES as readonly string[]).toContain(name);
          }
          expect(sanitizeEntity(entity)).toBe(false);
          expect(entity.repairs).toBe(0);
        }
        requested += inRun;
        if (inRun > 0) runsWithRequest += 1;
      }),
      { numRuns: 150 },
    );
    // Not vacuous: the generator reaches the fire sites often. Measured on one
    // run: 16,350 updates, 6,113 requests, 103 of 150 runs with at least one;
    // the floors leave a wide margin because the run is not seeded.
    expect(updates).toBeGreaterThan(1000);
    expect(requested).toBeGreaterThanOrEqual(500);
    expect(runsWithRequest).toBeGreaterThanOrEqual(30);
  }, 120_000);
});

/* ---------------------------------------------------------------------------
 * The out-of-scope fallback
 * ------------------------------------------------------------------------- */

const STOCK: NpcFlightStats = {
  specKey: "stock",
  maxFlightSpeed: 160,
  maxFlightRoll: 2,
  maxFlightPitch: 1,
  thrust: 15,
  mass: 0,
  forwardWeapon: "EQ_WEAPON_NONE",
};

function stockScenario(overrides: Partial<Scenario> = {}): Scenario {
  const base: Scenario = {
    stats: STOCK,
    startFraction: 0,
    position: vec(0, 0, 0),
    orientation: identity(),
    scanClass: "CLASS_NEUTRAL",
    record: {
      flightRoll: 0.5,
      flightPitch: -0.5,
      stickRoll: 1,
      stickPitch: 1,
      accuracy: 2,
      frustration: 0,
      successFactor: 0,
      pitchingOver: false,
      jink: vec(0, 0, 0),
      proximityAlert: 0,
      escortSlot: 0,
      tracking: undefined,
      entryPending: false,
    },
    nav: {
      behaviour: "IDLE",
      targetId: 0,
      destination: vec(0, 0, 0),
      desiredRange: 0,
      desiredSpeed: 100,
    },
    geometry: "free",
    seed: 1,
    ticks: 1,
  };
  return { ...base, ...overrides };
}

describe("every id outside the scope runs behaviour_idle and the thrust ramp", () => {
  // Oolite turns the attitude step and the thrust off for TRACK_AS_TURRET and
  // ENERGY_BOMB_COUNTDOWN (ShipEntity.m:2614 and 2628) and moves TRACTORED
  // ships by its own rule; this fallback reproduces none of that (a recorded
  // divergence for plan 14-19, pinned here as the current behaviour).
  it.each(OUT_OF_SCOPE)("%s", (behaviour) => {
    const s = stockScenario({
      nav: { ...stockScenario().nav, behaviour },
    });
    const entity = buildEntity(s);
    const draw = (): number => {
      throw new Error("the fallback draws nothing");
    };
    steerShip(entity, contextFor(entity, s, 1, draw));
    // behaviour_idle: both sticks 0 (3710-3721), applySticks one step: roll
    // 0.5 - 2 dt, pitch -0.5 + 4 dt (rates oppose nothing: the stick is 0).
    expect(entity.steer.stickRoll).toBe(0);
    expect(entity.steer.stickPitch).toBe(0);
    expect(entity.steer.flightRoll).toBeCloseTo(0.5 - 2 * DT, 12);
    expect(entity.steer.flightPitch).toBeCloseTo(-0.5 + 4 * DT, 12);
    // The thrust ramp: 5 * 15 * dt toward the desired speed 100.
    expect(entity.speed).toBeCloseTo(5 * 15 * DT, 12);
    // It ramps on to the desired speed and holds it.
    for (let tick = 2; tick <= 200; tick += 1) {
      steerShip(entity, contextFor(entity, s, tick, draw));
    }
    expect(entity.speed).toBe(100);
    expect(entity.steer.flightRoll).toBe(0);
    expect(entity.steer.flightPitch).toBe(0);
    expect(entity.nav.behaviour).toBe(behaviour);
  });

  it("covers every behaviour id outside the idle family that this plan lists", () => {
    // The list in the plan's must_haves, so a typo cannot silently drop an id.
    for (const id of OUT_OF_SCOPE) expect(BEHAVIOUR_IDS).toContain(id);
    expect(new Set(OUT_OF_SCOPE).size).toBe(OUT_OF_SCOPE.length);
  });
});

describe("the navigation behaviours (plan 14-10)", () => {
  it("covers every navigation id this plan lists, each a known behaviour id", () => {
    for (const id of NAVIGATION) expect(BEHAVIOUR_IDS).toContain(id);
    expect(new Set(NAVIGATION).size).toBe(NAVIGATION.length);
    for (const id of NAVIGATION) expect(SWEPT_BEHAVIOURS).toContain(id);
  });

  it("the zero relative position steers toward world (0, 0, -1) (ShipEntity.m:9496)", () => {
    // With the destination at the ship's position the sticks must equal those
    // for a destination straight along world -Z inside a range that keeps
    // max_cos at MAX_COS in both cases.
    fc.assert(
      fc.property(orientation, (q) => {
        const sticks = (destination: (origin: Entity) => void): number[] => {
          const s = stockScenario({
            orientation: q,
            nav: {
              ...stockScenario().nav,
              behaviour: "FACE_DESTINATION",
              desiredRange: 1e6,
              desiredSpeed: 0,
            },
          });
          const entity = buildEntity(s);
          destination(entity);
          steerShip(
            entity,
            contextFor(entity, s, 1, () => {
              throw new Error("no draw");
            }),
          );
          return [entity.steer.stickRoll, entity.steer.stickPitch];
        };
        const atShip = sticks((e) => {
          e.nav.destination = e.position;
        });
        const alongMinusZ = sticks((e) => {
          e.nav.destination = vec(
            e.position.x,
            e.position.y,
            e.position.z - 1000,
          );
        });
        expect(atShip).toEqual(alongMinusZ);
      }),
      { numRuns: 100 },
    );
  });

  it("a frustration report floors the counter at 0, the domain the sanitiser keeps (a Wegolite addition)", () => {
    // thrust 15 at 160 m/s: slowdownTime 10.67 s, so 5 x slowdownTime exceeds
    // the 15 s that fired the report and Oolite's counter would go negative.
    const s = stockScenario({
      nav: {
        ...stockScenario().nav,
        behaviour: "FLY_TO_DESTINATION",
        destination: vec(0, 0, -1e6),
        desiredRange: 0,
        desiredSpeed: 0,
      },
    });
    const entity = buildEntity(s);
    entity.speed = 160;
    entity.steer.successFactor = 1; // never an improvement
    entity.steer.frustration = Math.fround(15);
    const events: string[] = [];
    steerShip(
      entity,
      contextFor(entity, s, 1, () => 0.5, events),
    );
    expect(events).toEqual(["shipAIFrustrated"]);
    expect(entity.steer.frustration).toBe(0);
    expect(sanitizeEntity(entity)).toBe(false);
  });
});

describe("a start speed above maxFlightSpeed (ShipEntity.m:7417-7429)", () => {
  it("decays by MIN_HYPERSPEED_FACTOR x 5 x thrust x dt per tick until it reaches the maximum", () => {
    const s = stockScenario({
      nav: { ...stockScenario().nav, desiredSpeed: 160 },
    });
    const entity = buildEntity(s);
    entity.speed = 400;
    const draw = (): number => {
      throw new Error("no draw");
    };
    const step = MIN_HYPERSPEED_FACTOR * 5 * 15 * DT; // 20 m/s per tick
    const seen: number[] = [];
    for (let tick = 1; tick <= 14; tick += 1) {
      steerShip(entity, contextFor(entity, s, tick, draw));
      seen.push(entity.speed);
    }
    // 400 - 20 n while above 160: 380, 360, ..., 180, then 160 and held.
    for (let n = 1; n <= 12; n += 1) {
      expect(seen[n - 1]).toBeCloseTo(400 - n * step, 9);
    }
    expect(seen[12]).toBe(160);
    expect(seen[13]).toBe(160);
  });
});

describe("the zero-safe normalising helper", () => {
  it("returns the zero vector for a zero input, as vector_normal does (OOVector.h:270-273)", () => {
    expect(normalizeVec(vec(0, 0, 0))).toEqual(vec(0, 0, 0));
    expect(normalizeVec(vec(-0, 0, -0))).toEqual(vec(0, 0, 0));
  });

  it("returns a unit vector otherwise", () => {
    const unit = normalizeVec(vec(3, 0, 4));
    expect(unit.x).toBeCloseTo(0.6, 12);
    expect(unit.y).toBe(0);
    expect(unit.z).toBeCloseTo(0.8, 12);
  });
});

/* ---------------------------------------------------------------------------
 * INTERCEPT_TARGET with degenerate target poses (plan 14-12, T-14-38, T-14-46)
 * ------------------------------------------------------------------------- */

const TARGET_ID = 102;

const TARGET_KINDS: readonly BodyKind[] = [
  "ship",
  "station",
  "player",
  "cargo",
  "wreckage",
  "missile",
  "buoy",
  "planet",
  "sun",
];

/** Where the target sits relative to the steered ship. */
const TARGET_POSES = [
  "free",
  "coincident",
  "overlapping",
  "far",
  "behind",
] as const;

/** What happens to the target id. */
const TARGET_MODES = [
  "present",
  "removedMidRun",
  "self",
  "unknown",
  "none",
] as const;

const targetPlan = fc.record({
  kind: fc.constantFrom(...TARGET_KINDS),
  position,
  orientation,
  radius: num(0, 1e5),
  speed: num(0, 700),
  pose: fc.constantFrom(...TARGET_POSES),
  mode: fc.constantFrom(...TARGET_MODES),
  removeAt: fc.integer({ min: 1, max: 240 }),
});

/**
 * Run `behaviours` against a target of `plan` for `s.ticks` updates and assert
 * totality: no throw, finite aim points, events in the closed vocabulary and
 * nothing for the sanitiser to repair.
 */
function targetTotality(
  behaviours: readonly BehaviourId[],
  extra: (entity: Entity, bodies: RunnerBody[]) => void = () => {},
): void {
  fc.assert(
    fc.property(
      scenario,
      targetPlan,
      fc.constantFrom(...behaviours),
      (base, plan, behaviour) => {
        const s: Scenario = {
          ...base,
          nav: { ...base.nav, behaviour },
        };
        const entity = buildEntity(s);
        const here = entity.position;
        const place = {
          free: plan.position,
          coincident: here,
          overlapping: vec(here.x + 1e-3, here.y, here.z),
          far: vec(here.x, here.y, here.z + 40000),
          behind: vec(here.x, here.y, here.z + 1),
        }[plan.pose];
        const bodies: RunnerBody[] = [
          {
            id: TARGET_ID,
            kind: plan.kind,
            scanClass: "CLASS_NEUTRAL",
            radius: plan.radius,
            mass: 0,
            position: place,
            orientation: plan.orientation,
            speed: plan.speed,
            behaviour: "IDLE",
            targetId: 0,
          },
        ];
        entity.nav.targetId = {
          present: TARGET_ID,
          removedMidRun: TARGET_ID,
          self: entity.id,
          unknown: TARGET_ID + 1000,
          none: 0,
        }[plan.mode];
        extra(entity, bodies);
        const stream = createRngState(s.seed);
        const draw = (): number => rngNext(stream);
        const events: string[] = [];
        for (let tick = 1; tick <= s.ticks; tick += 1) {
          if (plan.mode === "removedMidRun" && tick >= plan.removeAt) {
            bodies.splice(
              0,
              bodies.length,
              ...bodies.filter((b) => b.id !== TARGET_ID),
            );
          }
          const ctx: SteerContext = {
            view: createSyntheticView(bodies, entity, tick),
            stats: s.stats,
            dt: DT,
            draw,
            emit: (event) => {
              events.push(event.name);
            },
          };
          steerShip(entity, ctx);
          assertTotal(entity, s.stats);
          const aim = calculateTargetPosition(entity, ctx.view, tick);
          expect(Number.isFinite(aim.x)).toBe(true);
          expect(Number.isFinite(aim.y)).toBe(true);
          expect(Number.isFinite(aim.z)).toBe(true);
          for (const name of events) {
            expect(AI_EVENT_NAMES as readonly string[]).toContain(name);
          }
          expect(sanitizeEntity(entity)).toBe(false);
          expect(entity.repairs).toBe(0);
        }
      },
    ),
    { numRuns: 200 },
  );
}

describe("INTERCEPT_TARGET is total with degenerate target poses (plan 14-12)", () => {
  it("covers the pursuit ids this plan lists, each a known behaviour id", () => {
    for (const id of PURSUIT) {
      expect(BEHAVIOUR_IDS).toContain(id);
      expect(SWEPT_BEHAVIOURS).toContain(id);
    }
  });

  it("never throws, keeps the aim point finite and leaves the sanitiser nothing to repair", () => {
    targetTotality(PURSUIT);
  }, 120_000);
});

describe("flee and evasive action are total with degenerate target poses (plan 14-13)", () => {
  it("covers the three ids, each a known behaviour id", () => {
    for (const id of FLIGHT) {
      expect(BEHAVIOUR_IDS).toContain(id);
      expect(SWEPT_BEHAVIOURS).toContain(id);
    }
  });

  it("never throws, keeps the aim point finite and leaves the sanitiser nothing to repair", () => {
    targetTotality(FLIGHT);
  }, 120_000);

  it("a range of exactly 0 counts as safety and a negative range does not (ShipEntity.m:4855)", () => {
    // Radii 100 + 50, the target 150 m ahead: range exactly 0 (touching); at
    // 100 m the radii overlap and the range is -50.
    const run = (distance: number): number => {
      const result = spawnEntity(
        createWorld(3),
        {
          kind: "ship",
          specKey: "sweep",
          scanClass: "CLASS_NEUTRAL",
          position: vec(0, 0, 0),
          orientation: identity(),
          radius: 100,
        },
        0,
      );
      if (!result.ok) throw new Error("spawn refused");
      const entity = result.entity;
      entity.steer.accuracy = 2;
      entity.nav.behaviour = "FLEE_TARGET";
      entity.nav.targetId = TARGET_ID;
      entity.nav.desiredRange = 100;
      entity.nav.desiredSpeed = 7;
      const bodies: RunnerBody[] = [
        {
          id: TARGET_ID,
          kind: "ship",
          scanClass: "CLASS_NEUTRAL",
          radius: 50,
          mass: 0,
          position: vec(0, 0, -distance),
          orientation: identity(),
          speed: 0,
          behaviour: "IDLE",
          targetId: 0,
        },
      ];
      const stream = createRngState(5);
      steerShip(entity, {
        view: createSyntheticView(bodies, entity, 1),
        stats: STOCK,
        dt: DT,
        draw: () => rngNext(stream),
        emit: () => {},
      });
      expect(entity.repairs).toBe(0);
      return entity.nav.desiredSpeed;
    };
    expect(run(150)).toBe(7); // range 0: safety, the desired speed is left alone
    expect(run(100)).toBe(160); // range -50 <= desired range 100: run at full speed
  });
});

describe("a forced proximity alert keeps steering total (plan 14-13)", () => {
  const ALERT_ID = 103;
  const ALERTED: readonly BehaviourId[] = [
    ...NAVIGATION,
    ...PURSUIT,
    ...FLIGHT,
    ...ATTACK,
    ...FORMATION,
  ];

  it("covers every navigation id, intercept, flee, attack, formation and avoid id, each swept", () => {
    for (const id of ALERTED) expect(SWEPT_BEHAVIOURS).toContain(id);
  });

  it("an alert on a live body of any pose never throws and repairs nothing", () => {
    targetTotality(ALERTED, (entity, bodies) => {
      const here = entity.position;
      bodies.push({
        id: ALERT_ID,
        kind: "ship",
        scanClass: "CLASS_NEUTRAL",
        radius: 1e5,
        mass: 0,
        position: vec(here.x + 1e-3, here.y, here.z),
        orientation: identity(),
        speed: 0,
        behaviour: "IDLE",
        targetId: 0,
      });
      entity.steer.proximityAlert = ALERT_ID;
    });
  }, 120_000);

  it("an alert on the target, on nothing and on the ship itself never throws", () => {
    for (const alertOf of [
      (): number => TARGET_ID,
      (): number => 9999,
      (e: Entity): number => e.id,
    ]) {
      targetTotality(ALERTED, (entity) => {
        entity.steer.proximityAlert = alertOf(entity);
      });
    }
  }, 120_000);
});

describe("the attack ids are total with degenerate target poses (plan 14-14)", () => {
  it("covers the eight ids, each a known behaviour id", () => {
    for (const id of ATTACK) {
      expect(BEHAVIOUR_IDS).toContain(id);
      expect(SWEPT_BEHAVIOURS).toContain(id);
    }
    expect(new Set(ATTACK).size).toBe(ATTACK.length);
    // the OUT ids are not ported: they stay with the idle fallback
    for (const id of ATTACK) expect(OUT_OF_SCOPE).not.toContain(id);
  });

  it("never throws, keeps the aim point finite and leaves the sanitiser nothing to repair, a target at zero range and one exactly behind included", () => {
    targetTotality(ATTACK);
  }, 120_000);

  it("the same with a target that aims at the ship (the targetTargetsSelf reads)", () => {
    targetTotality(ATTACK, (entity, bodies) => {
      bodies.splice(
        0,
        bodies.length,
        ...bodies.map((body) => ({ ...body, targetId: entity.id })),
      );
    });
  }, 120_000);

  it("the same with a target 40 m ahead that aims at the ship (the nearby branch and the relative-speed jink)", () => {
    targetTotality(ATTACK, (entity, bodies) => {
      bodies.splice(
        0,
        bodies.length,
        ...bodies.map((body) => ({
          ...body,
          targetId: entity.id,
          position: vec(
            entity.position.x,
            entity.position.y,
            entity.position.z - 40,
          ),
        })),
      );
    });
  }, 120_000);
});

describe("formation and avoid collision are total (plan 14-15)", () => {
  it("covers the two ids, each a known behaviour id and none out of scope", () => {
    for (const id of FORMATION) {
      expect(BEHAVIOUR_IDS).toContain(id);
      expect(SWEPT_BEHAVIOURS).toContain(id);
      expect(OUT_OF_SCOPE).not.toContain(id);
    }
  });

  it("with a leader that dies mid-run, one that is not a ship, none, itself and an unknown id", () => {
    // the owner is the body of the target plan: it is removed mid-run in one
    // mode, and the plan's own kinds make it a ship, a station, the player ...
    targetTotality(FORMATION, (entity) => {
      entity.ownerId = TARGET_ID;
    });
    for (const ownerOf of [
      (): number => 0,
      (e: Entity): number => e.id,
      (): number => 9999,
    ]) {
      targetTotality(FORMATION, (entity) => {
        entity.ownerId = ownerOf(entity);
      });
    }
  }, 240_000);

  it("with an alert that names a ship removed mid-run, and a saved condition to resume", () => {
    targetTotality(FORMATION, (entity) => {
      entity.steer.proximityAlert = TARGET_ID;
      entity.steer.saved = {
        behaviour: "FLY_TO_DESTINATION",
        targetId: TARGET_ID,
        desiredRange: 100,
        desiredSpeed: 50,
        destination: vec(10, 20, 30),
      };
    });
  }, 120_000);

  it("a formation follower far from its slot with a leader pitches over and stays total", () => {
    targetTotality(["FORMATION_FORM_UP"], (entity) => {
      entity.ownerId = TARGET_ID;
      entity.steer.frustration = 14.999;
      entity.steer.successFactor = -1;
    });
  }, 120_000);
});
