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
import { createSyntheticView } from "./oracle-runner.js";

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

/** The behaviours the property sweeps. Later plans add their ids. */
const SWEPT_BEHAVIOURS: readonly BehaviourId[] = [
  ...IDLE_FAMILY,
  ...OUT_OF_SCOPE,
];

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
  return entity;
}

function contextFor(
  entity: Entity,
  s: Scenario,
  tick: number,
  draw: () => number,
): SteerContext {
  return {
    view: createSyntheticView([], entity, tick),
    stats: s.stats,
    dt: DT,
    draw,
    emit: () => {
      // the idle family posts no event
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
        for (let tick = 1; tick <= s.ticks; tick += 1) {
          steerShip(entity, contextFor(entity, s, tick, draw));
          assertTotal(entity, s.stats);
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
