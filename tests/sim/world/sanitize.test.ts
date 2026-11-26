// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `sanitizeEntity` (FOUND-11, FOUND-12, T-08-21, T-08-44). One table pins, per
 * row, the corrupt input, the repaired output, the return value and the
 * `repairs` delta, and a second call that must return false and change no bit.
 * Expected values come from the rules of plan 08-11 (shared limits, repair
 * versus normalisation), never from running the code under test.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import type { AiComponent, AiKey } from "../../../src/sim/ai/types.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import {
  ACCURACY_UNRESOLVED,
  createSteerComponent,
} from "../../../src/sim/npc/state.js";
import {
  MAX_AI_PARAMS_KEYS,
  MAX_BOUNTY,
  MAX_ENERGY_RECHARGE_RATE,
  MAX_ENTITY_CARGO,
  MAX_ENTITY_ENERGY,
  MAX_ENTITY_MAGNITUDE,
  MAX_ENTITY_VELOCITY,
  MAX_ESCORT_SLOT,
  MAX_FRUSTRATION,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_STEER_RATE,
  MAX_UINT32,
  MAX_WEAPON_TEMPERATURE,
  NPC_DEFAULT_ENERGY_RECHARGE_RATE,
  NPC_DEFAULT_MAX_ENERGY,
  QUAT_UNIT_TOLERANCE,
  BUOY_MAX_ENERGY,
  BUOY_SUBENTITY_MAX_ENERGY,
  MAX_BUOY_OFFSET,
  MAX_STATION_LAUNCHED,
  MAX_STATION_MARKS,
  MAX_WORLD_GROUPS,
  STATION_ALERT_GREEN,
  STATION_MAX_ENERGY,
} from "../../../src/sim/world/limits.js";
import {
  sanitizeBuoyStates,
  sanitizeEntity,
  sanitizeGroups,
  sanitizePopulator,
  sanitizeStaticHealth,
  sanitizeStation,
} from "../../../src/sim/world/sanitize.js";
import {
  hashWorld,
  serializeEntity,
} from "../../../src/sim/world/serialize.js";
import {
  parseWorldSnapshot,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import {
  createBuoyStates,
  createWorld,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { laveFixture } from "../../helpers/lave.js";
import { V5_SCALARS } from "../../helpers/v5-fields.js";

/** A clean entity with a test-pilot AI, from the real spawn path. */
function fresh(extra: Partial<SpawnInit> = {}): Entity {
  const world = createWorld(5);
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "viper",
      scanClass: "CLASS_POLICE",
      position: vec(1, 2, 3),
      orientation: identity(),
      radius: 40,
      speed: 10,
      ai: createTestPilotAi(0),
      ...extra,
    },
    7,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/** Loose write access to corrupt a field the types protect. */
const loose = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

/** Every leaf of `value` as text, with `-0` and the key order made visible. */
function leaves(value: unknown, path = "$"): string[] {
  if (typeof value === "number") {
    return [`${path}=n:${Object.is(value, -0) ? "-0" : String(value)}`];
  }
  if (value === null || typeof value !== "object") {
    return [`${path}=${typeof value}:${String(value)}`];
  }
  return Object.keys(value)
    .sort()
    .flatMap((key) =>
      leaves((value as Record<string, unknown>)[key], `${path}.${key}`),
    );
}

const params = (entity: Entity): Record<string, unknown> =>
  (entity.ai as AiComponent).params;

interface Row {
  name: string;
  corrupt: (e: Entity) => void;
  /** The repaired state, asserted after the first call. */
  expected: (e: Entity) => void;
  /** The `repairs` delta; 0 means a normalisation or a clean value. */
  delta: 0 | 1;
}

const longKey = "k".repeat(MAX_SNAPSHOT_STRING_LENGTH + 1);
const forbiddenParams = (): Record<string, unknown> =>
  JSON.parse('{"__proto__":1,"constructor":2,"prototype":3,"ok":4}') as Record<
    string,
    unknown
  >;

const BAD_COORDINATES: readonly number[] = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  MAX_ENTITY_MAGNITUDE * 2,
  -MAX_ENTITY_MAGNITUDE * 2,
];

const ROWS: Row[] = [];

for (const bad of BAD_COORDINATES) {
  ROWS.push(
    {
      name: `position.x ${bad} becomes 0`,
      corrupt: (e) => (loose(e.position).x = bad),
      expected: (e) => expect(e.position.x).toBe(0),
      delta: 1,
    },
    {
      name: `nav.destination.z ${bad} becomes 0`,
      corrupt: (e) => (loose(e.nav.destination).z = bad),
      expected: (e) => expect(e.nav.destination.z).toBe(0),
      delta: 1,
    },
    {
      name: `speed ${bad} becomes 0`,
      corrupt: (e) => (e.speed = bad),
      expected: (e) => expect(e.speed).toBe(0),
      delta: 1,
    },
    {
      name: `nav.desiredSpeed ${bad} becomes 0`,
      corrupt: (e) => (e.nav.desiredSpeed = bad),
      expected: (e) => expect(e.nav.desiredSpeed).toBe(0),
      delta: 1,
    },
    {
      name: `nav.desiredRange ${bad} becomes 0`,
      corrupt: (e) => (e.nav.desiredRange = bad),
      expected: (e) => expect(e.nav.desiredRange).toBe(0),
      delta: 1,
    },
  );
}

ROWS.push(
  {
    name: "a position at exactly MAX_ENTITY_MAGNITUDE is clean",
    corrupt: (e) => (loose(e.position).y = MAX_ENTITY_MAGNITUDE),
    expected: (e) => expect(e.position.y).toBe(MAX_ENTITY_MAGNITUDE),
    delta: 0,
  },
  {
    name: "position -0 is normalised without a repair",
    corrupt: (e) => (loose(e.position).x = -0),
    expected: (e) => expect(Object.is(e.position.x, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "speed -0 is normalised without a repair",
    corrupt: (e) => (e.speed = -0),
    expected: (e) => expect(Object.is(e.speed, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "a negative speed becomes 0",
    corrupt: (e) => (e.speed = -5),
    expected: (e) => expect(e.speed).toBe(0),
    delta: 1,
  },
  {
    name: "a negative desired range becomes 0",
    corrupt: (e) => (e.nav.desiredRange = -1),
    expected: (e) => expect(e.nav.desiredRange).toBe(0),
    delta: 1,
  },
  // Orientation.
  {
    name: "orientation w 1e-160 (subnormal norm) becomes identity",
    corrupt: (e) => (e.orientation = { w: 1e-160, x: 0, y: 0, z: 0 }),
    expected: (e) => expect(e.orientation).toEqual(identity()),
    delta: 1,
  },
  {
    name: "orientation w 3e-161 becomes identity",
    corrupt: (e) => (e.orientation = { w: 3e-161, x: 0, y: 0, z: 0 }),
    expected: (e) => expect(e.orientation).toEqual(identity()),
    delta: 1,
  },
  {
    name: "orientation w 7e-158 becomes identity",
    corrupt: (e) => (e.orientation = { w: 7e-158, x: 0, y: 0, z: 0 }),
    expected: (e) => expect(e.orientation).toEqual(identity()),
    delta: 1,
  },
  {
    name: "orientation w 2 is renormalised without a repair",
    corrupt: (e) => (e.orientation = { w: 2, x: 0, y: 0, z: 0 }),
    expected: (e) => expect(e.orientation).toEqual({ w: 1, x: 0, y: 0, z: 0 }),
    delta: 0,
  },
  {
    name: "orientation w 1e-5 (above MIN_QUAT_NORM_SQ) is renormalised without a repair",
    corrupt: (e) => (e.orientation = { w: 1e-5, x: 0, y: 0, z: 0 }),
    expected: (e) => {
      const q = e.orientation;
      const normSq = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;
      expect(Math.abs(normSq - 1)).toBeLessThanOrEqual(QUAT_UNIT_TOLERANCE);
    },
    delta: 0,
  },
  {
    name: "orientation w 1e200 (norm overflow) becomes identity",
    corrupt: (e) => (e.orientation = { w: 1e200, x: 0, y: 0, z: 0 }),
    expected: (e) => expect(e.orientation).toEqual(identity()),
    delta: 1,
  },
  {
    name: "an all-zero orientation becomes identity",
    corrupt: (e) => (e.orientation = { w: 0, x: 0, y: 0, z: 0 }),
    expected: (e) => expect(e.orientation).toEqual(identity()),
    delta: 1,
  },
  {
    name: "a NaN orientation component becomes identity",
    corrupt: (e) => (e.orientation = { w: 1, x: Number.NaN, y: 0, z: 0 }),
    expected: (e) => expect(e.orientation).toEqual(identity()),
    delta: 1,
  },
  {
    name: "an infinite orientation component becomes identity",
    corrupt: (e) =>
      (e.orientation = { w: 1, x: 0, y: Number.POSITIVE_INFINITY, z: 0 }),
    expected: (e) => expect(e.orientation).toEqual(identity()),
    delta: 1,
  },
  {
    name: "orientation -0 components are normalised without a repair",
    corrupt: (e) => (e.orientation = { w: 1, x: -0, y: -0, z: -0 }),
    expected: (e) => {
      expect(Object.is(e.orientation.x, 0)).toBe(true);
      expect(Object.is(e.orientation.y, 0)).toBe(true);
      expect(Object.is(e.orientation.z, 0)).toBe(true);
    },
    delta: 0,
  },
  // radius and specKey.
  ...[0, -3, Number.NaN, MAX_ENTITY_MAGNITUDE * 2].map((bad): Row => ({
    name: `radius ${bad} becomes 1`,
    corrupt: (e) => (e.radius = bad),
    expected: (e) => expect(e.radius).toBe(1),
    delta: 1,
  })),
  {
    name: "an empty specKey becomes unknown",
    corrupt: (e) => (e.specKey = ""),
    expected: (e) => expect(e.specKey).toBe("unknown"),
    delta: 1,
  },
  {
    name: "a non-string specKey becomes unknown",
    corrupt: (e) => (loose(e).specKey = 5),
    expected: (e) => expect(e.specKey).toBe("unknown"),
    delta: 1,
  },
  {
    name: "a 129-character specKey is truncated to 128",
    corrupt: (e) => (e.specKey = "s".repeat(129)),
    expected: (e) => expect(e.specKey).toBe("s".repeat(128)),
    delta: 1,
  },
  {
    name: "a 128-character specKey is clean",
    corrupt: (e) => (e.specKey = "s".repeat(128)),
    expected: (e) => expect(e.specKey).toBe("s".repeat(128)),
    delta: 0,
  },
);

// The uint32 fields share one list of corrupt values.
const BAD_UINT32: readonly number[] = [
  -1,
  1.5,
  2 ** 32,
  Number.NaN,
  Number.POSITIVE_INFINITY,
];
for (const bad of BAD_UINT32) {
  ROWS.push(
    {
      name: `ownerId ${bad} becomes 0`,
      corrupt: (e) => (e.ownerId = bad),
      expected: (e) => expect(e.ownerId).toBe(0),
      delta: 1,
    },
    {
      name: `spawnTick ${bad} becomes 0`,
      corrupt: (e) => (e.spawnTick = bad),
      expected: (e) => expect(e.spawnTick).toBe(0),
      delta: 1,
    },
    {
      name: `nav.targetId ${bad} becomes 0`,
      corrupt: (e) => (e.nav.targetId = bad),
      expected: (e) => expect(e.nav.targetId).toBe(0),
      delta: 1,
    },
    {
      name: `rng.ai ${bad} becomes 0`,
      corrupt: (e) => (e.rng.ai = bad),
      expected: (e) => expect(e.rng.ai).toBe(0),
      delta: 1,
    },
    {
      name: `rng.combat ${bad} becomes 0`,
      corrupt: (e) => (e.rng.combat = bad),
      expected: (e) => expect(e.rng.combat).toBe(0),
      delta: 1,
    },
    {
      name: `ai.wakeTick ${bad} becomes 0`,
      corrupt: (e) => ((e.ai as AiComponent).wakeTick = bad),
      expected: (e) => expect(e.ai?.wakeTick).toBe(0),
      delta: 1,
    },
    {
      name: `ai.nextThinkTick ${bad} becomes 0`,
      corrupt: (e) => ((e.ai as AiComponent).nextThinkTick = bad),
      expected: (e) => expect(e.ai?.nextThinkTick).toBe(0),
      delta: 1,
    },
  );
}

ROWS.push(
  {
    name: "ownerId -0 is normalised without a repair",
    corrupt: (e) => (e.ownerId = -0),
    expected: (e) => expect(Object.is(e.ownerId, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "rng.ai -0 is normalised without a repair",
    corrupt: (e) => (e.rng.ai = -0),
    expected: (e) => expect(Object.is(e.rng.ai, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "ai.wakeTick -0 is normalised without a repair",
    corrupt: (e) => ((e.ai as AiComponent).wakeTick = -0),
    expected: (e) => expect(Object.is(e.ai?.wakeTick, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "a uint32 maximum is clean",
    corrupt: (e) => (e.ownerId = MAX_UINT32),
    expected: (e) => expect(e.ownerId).toBe(MAX_UINT32),
    delta: 0,
  },
  // ai.params.
  {
    name: "forbidden and empty and over-long param keys are stripped",
    corrupt: (e) => {
      const next = Object.assign(forbiddenParams(), {
        "": 1,
        [longKey]: 2,
      });
      (e.ai as AiComponent).params = next;
    },
    expected: (e) => {
      expect(Object.keys(params(e))).toEqual(["ok"]);
      expect(params(e).ok).toBe(4);
    },
    delta: 1,
  },
  {
    name: "a nested object param value is stripped",
    corrupt: (e) => (params(e).nested = { a: 1 }),
    expected: (e) => expect("nested" in params(e)).toBe(false),
    delta: 1,
  },
  {
    name: "an undefined param value is stripped",
    corrupt: (e) => (params(e).gone = undefined),
    expected: (e) => expect("gone" in params(e)).toBe(false),
    delta: 1,
  },
  {
    name: "more than MAX_AI_PARAMS_KEYS keys keep the first 32 in code-unit order",
    corrupt: (e) => {
      const next = Object.create(null) as Record<string, number>;
      for (let i = MAX_AI_PARAMS_KEYS + 8; i > 0; i -= 1) {
        next[`k${String(i).padStart(2, "0")}`] = i;
      }
      (e.ai as AiComponent).params = next;
    },
    expected: (e) => {
      const keys = Object.keys(params(e)).sort();
      expect(keys).toHaveLength(MAX_AI_PARAMS_KEYS);
      expect(keys[0]).toBe("k01");
      expect(keys[MAX_AI_PARAMS_KEYS - 1]).toBe("k32");
    },
    delta: 1,
  },
  ...[Number.NaN, 1e13, Number.NEGATIVE_INFINITY].map((bad): Row => ({
    name: `a numeric param ${bad} becomes 0`,
    corrupt: (e) => (params(e).scanRange = bad),
    expected: (e) => expect(params(e).scanRange).toBe(0),
    delta: 1,
  })),
  {
    name: "a numeric param -0 is normalised without a repair",
    corrupt: (e) => (params(e).scanRange = -0),
    expected: (e) => expect(Object.is(params(e).scanRange, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "a 129-character string param is truncated",
    corrupt: (e) => (params(e).phase = "p".repeat(129)),
    expected: (e) => expect(params(e).phase).toBe("p".repeat(128)),
    delta: 1,
  },
  {
    name: "null and boolean params are clean",
    corrupt: (e) => {
      params(e).flag = true;
      params(e).none = null;
    },
    expected: (e) => {
      expect(params(e).flag).toBe(true);
      expect(params(e).none).toBeNull();
    },
    delta: 0,
  },
  {
    name: "a 65-element param array is cut to 64",
    corrupt: (e) => (params(e).list = Array.from({ length: 65 }, (_, i) => i)),
    expected: (e) =>
      expect((params(e).list as number[]).length).toBe(
        MAX_SNAPSHOT_PARAM_LENGTH,
      ),
    delta: 1,
  },
  {
    name: "array elements: NaN becomes 0, a long string is truncated, nested values are dropped",
    corrupt: (e) =>
      (params(e).list = [Number.NaN, "x".repeat(129), [1], { a: 1 }, 2]),
    expected: (e) => expect(params(e).list).toEqual([0, "x".repeat(128), 2]),
    delta: 1,
  },
  {
    name: "an array element -0 is normalised without a repair",
    corrupt: (e) => (params(e).list = [-0, 1]),
    expected: (e) => {
      const list = params(e).list as number[];
      expect(Object.is(list[0], 0)).toBe(true);
      expect(list[1]).toBe(1);
    },
    delta: 0,
  },
  {
    name: "a clean array is left as is",
    corrupt: (e) => (params(e).list = [1, "two"]),
    expected: (e) => expect(params(e).list).toEqual([1, "two"]),
    delta: 0,
  },
  {
    name: "a non-object params record is replaced by an empty one",
    corrupt: (e) => (loose(e.ai).params = null),
    expected: (e) => expect(Object.keys(params(e))).toEqual([]),
    delta: 1,
  },
  // repairs itself.
  ...[-1, 1.5, 1e13, 2 ** 32].map((bad): Row => ({
    name: `repairs ${bad} resets to 0 and counts once`,
    corrupt: (e) => (e.repairs = bad),
    expected: (e) => expect(e.repairs).toBe(1),
    delta: 1,
  })),
  {
    name: "repairs -0 is normalised without a repair",
    corrupt: (e) => (e.repairs = -0),
    expected: (e) => expect(Object.is(e.repairs, 0)).toBe(true),
    delta: 0,
  },
  // Closed vocabularies.
  ...["planet", "constructor"].map((bad): Row => ({
    name: `kind ${bad} marks the entity dead`,
    corrupt: (e) => (loose(e).kind = bad),
    expected: (e) => {
      expect(e.dead).toBe(true);
      expect(e.kind).toBe(bad);
    },
    delta: 1,
  })),
  ...["CLASS_FOO", "constructor"].map((bad): Row => ({
    name: `scanClass ${bad} becomes CLASS_NOT_SET`,
    corrupt: (e) => (loose(e).scanClass = bad),
    expected: (e) => expect(e.scanClass).toBe("CLASS_NOT_SET"),
    delta: 1,
  })),
  ...["WARP", "toString"].map((bad): Row => ({
    name: `nav.behaviour ${bad} becomes IDLE`,
    corrupt: (e) => (loose(e.nav).behaviour = bad),
    expected: (e) => expect(e.nav.behaviour).toBe("IDLE"),
    delta: 1,
  })),
  ...["trader", "__proto__"].map((bad): Row => ({
    name: `ai.aiKey ${bad} sets ai to null`,
    corrupt: (e) => ((e.ai as AiComponent).aiKey = bad as AiKey),
    expected: (e) => expect(e.ai).toBeNull(),
    delta: 1,
  })),
);

// The energy bank (CBT-07): a bad bound falls back to Oolite's default and
// energy is held inside 0..maxEnergy.
for (const bad of [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  -1,
  MAX_ENTITY_ENERGY * 2,
]) {
  ROWS.push(
    {
      name: `maxEnergy ${bad} becomes the default`,
      corrupt: (e) => (e.maxEnergy = bad),
      expected: (e) => {
        expect(e.maxEnergy).toBe(NPC_DEFAULT_MAX_ENERGY);
        // A fresh spawn holds the default 200, so the bank stays full.
        expect(e.energy).toBe(NPC_DEFAULT_MAX_ENERGY);
      },
      delta: 1,
    },
    {
      name: `energyRechargeRate ${bad} becomes the default`,
      corrupt: (e) => (e.energyRechargeRate = bad),
      expected: (e) =>
        expect(e.energyRechargeRate).toBe(NPC_DEFAULT_ENERGY_RECHARGE_RATE),
      delta: 1,
    },
  );
}

ROWS.push(
  {
    name: "energy NaN becomes a full bank",
    corrupt: (e) => (e.energy = Number.NaN),
    expected: (e) => expect(e.energy).toBe(e.maxEnergy),
    delta: 1,
  },
  {
    name: "energy Infinity becomes a full bank",
    corrupt: (e) => (e.energy = Number.POSITIVE_INFINITY),
    expected: (e) => expect(e.energy).toBe(e.maxEnergy),
    delta: 1,
  },
  {
    name: "a negative energy is clamped to 0",
    corrupt: (e) => (e.energy = -5),
    expected: (e) => expect(e.energy).toBe(0),
    delta: 1,
  },
  {
    name: "an energy above maxEnergy is clamped to maxEnergy",
    corrupt: (e) => (e.energy = e.maxEnergy + 1),
    expected: (e) => expect(e.energy).toBe(e.maxEnergy),
    delta: 1,
  },
  {
    name: "a drained energy inside the bank is clean",
    corrupt: (e) => (e.energy = 12.5),
    expected: (e) => expect(e.energy).toBe(12.5),
    delta: 0,
  },
  {
    name: "energy -0 is normalised without a repair",
    corrupt: (e) => (e.energy = -0),
    expected: (e) => expect(Object.is(e.energy, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "a lowered maxEnergy clamps energy down with one repair",
    corrupt: (e) => {
      e.energy = 150;
      e.maxEnergy = 100;
    },
    expected: (e) => {
      expect(e.maxEnergy).toBe(100);
      expect(e.energy).toBe(100);
    },
    delta: 1,
  },
  {
    name: "an energyRechargeRate at exactly the bound is clean",
    corrupt: (e) => (e.energyRechargeRate = MAX_ENERGY_RECHARGE_RATE),
    expected: (e) =>
      expect(e.energyRechargeRate).toBe(MAX_ENERGY_RECHARGE_RATE),
    delta: 0,
  },
);

// The steering record (AI-01, plan 14-08): every field is repaired before a
// hash, one repair per call, and the signed tracking domain keeps a legitimate
// early start clean.
const STEER_RATES = [
  "flightRoll",
  "flightPitch",
  "stickRoll",
  "stickPitch",
] as const;

/** A started curve whose ticks strictly decrease (never negative here). */
function startCurve(e: Entity, ticks: number[] = [300, 240, 180, 120]): void {
  e.steer.trackingCount = 4;
  e.steer.trackingTicks = ticks as [number, number, number, number];
  e.steer.trackingPositions = [
    vec(1, 2, 3),
    vec(2, 3, 4),
    vec(3, 4, 5),
    vec(4, 5, 6),
  ];
}

/** The empty curve: count 0 with every tick and position zero. */
function expectNoCurve(e: Entity): void {
  expect(e.steer.trackingCount).toBe(0);
  expect(e.steer.trackingTicks).toEqual([0, 0, 0, 0]);
  expect(e.steer.trackingPositions).toEqual([
    vec(0, 0, 0),
    vec(0, 0, 0),
    vec(0, 0, 0),
    vec(0, 0, 0),
  ]);
}

for (const field of STEER_RATES) {
  for (const bad of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_STEER_RATE * 2,
    -MAX_STEER_RATE * 2,
  ]) {
    ROWS.push({
      name: `steer.${field} ${bad} becomes 0`,
      corrupt: (e) => (e.steer[field] = bad),
      expected: (e) => expect(e.steer[field]).toBe(0),
      delta: 1,
    });
  }
  ROWS.push(
    {
      name: `steer.${field} at exactly -MAX_STEER_RATE is clean`,
      corrupt: (e) => (e.steer[field] = -MAX_STEER_RATE),
      expected: (e) => expect(e.steer[field]).toBe(-MAX_STEER_RATE),
      delta: 0,
    },
    {
      name: `steer.${field} -0 is normalised without a repair`,
      corrupt: (e) => (e.steer[field] = -0),
      expected: (e) => expect(Object.is(e.steer[field], 0)).toBe(true),
      delta: 0,
    },
  );
}

ROWS.push(
  {
    name: "a default spawn's steering record is clean",
    corrupt: () => undefined,
    expected: (e) => expect(e.steer).toEqual(createSteerComponent(0)),
    delta: 0,
  },
  {
    name: "a NaN jink component becomes 0",
    corrupt: (e) => (e.steer.jink = vec(1, Number.NaN, 3)),
    expected: (e) => expect(e.steer.jink).toEqual(vec(1, 0, 3)),
    delta: 1,
  },
  {
    name: "a jink that is not a vector becomes the zero vector",
    corrupt: (e) => (loose(e.steer).jink = null),
    expected: (e) => expect(e.steer.jink).toEqual(vec(0, 0, 0)),
    delta: 1,
  },
  ...[11, -6, Number.NaN, Number.POSITIVE_INFINITY, -99].map((bad): Row => ({
    name: `steer.accuracy ${bad} becomes the unresolved sentinel`,
    corrupt: (e) => (e.steer.accuracy = bad),
    expected: (e) => expect(e.steer.accuracy).toBe(ACCURACY_UNRESOLVED),
    delta: 1,
  })),
  ...[-100, -5, 0, 2.5, 10].map((good): Row => ({
    name: `steer.accuracy ${good} is clean`,
    corrupt: (e) => (e.steer.accuracy = good),
    expected: (e) => expect(e.steer.accuracy).toBe(good),
    delta: 0,
  })),
  ...[-1, Number.NaN, MAX_FRUSTRATION + 1].map((bad): Row => ({
    name: `steer.frustration ${bad} becomes 0`,
    corrupt: (e) => (e.steer.frustration = bad),
    expected: (e) => expect(e.steer.frustration).toBe(0),
    delta: 1,
  })),
  {
    name: "steer.frustration 7.5 and the bound itself are clean",
    corrupt: (e) => (e.steer.frustration = MAX_FRUSTRATION),
    expected: (e) => expect(e.steer.frustration).toBe(MAX_FRUSTRATION),
    delta: 0,
  },
  ...[Number.NaN, MAX_ENTITY_MAGNITUDE * 2].map((bad): Row => ({
    name: `steer.successFactor ${bad} becomes 0`,
    corrupt: (e) => (e.steer.successFactor = bad),
    expected: (e) => expect(e.steer.successFactor).toBe(0),
    delta: 1,
  })),
  {
    name: "a negative steer.successFactor inside the bound is clean",
    corrupt: (e) => (e.steer.successFactor = -0.75),
    expected: (e) => expect(e.steer.successFactor).toBe(-0.75),
    delta: 0,
  },
  {
    name: "a non-boolean steer.pitchingOver becomes false",
    corrupt: (e) => (loose(e.steer).pitchingOver = 1),
    expected: (e) => expect(e.steer.pitchingOver).toBe(false),
    delta: 1,
  },
  {
    name: "a non-boolean steer.entryPending becomes false",
    corrupt: (e) => (loose(e.steer).entryPending = "yes"),
    expected: (e) => expect(e.steer.entryPending).toBe(false),
    delta: 1,
  },
  {
    name: "true flags are clean",
    corrupt: (e) => {
      e.steer.pitchingOver = true;
      e.steer.entryPending = true;
    },
    expected: (e) => {
      expect(e.steer.pitchingOver).toBe(true);
      expect(e.steer.entryPending).toBe(true);
    },
    delta: 0,
  },
  ...BAD_UINT32.map((bad): Row => ({
    name: `steer.proximityAlert ${bad} becomes 0`,
    corrupt: (e) => (e.steer.proximityAlert = bad),
    expected: (e) => expect(e.steer.proximityAlert).toBe(0),
    delta: 1,
  })),
  {
    name: "a proximityAlert naming no live ship is clean (liveness is the steering's check)",
    corrupt: (e) => (e.steer.proximityAlert = 4_000_000),
    expected: (e) => expect(e.steer.proximityAlert).toBe(4_000_000),
    delta: 0,
  },
  ...[MAX_ESCORT_SLOT + 1, -1, 1.5, Number.NaN].map((bad): Row => ({
    name: `steer.escortSlot ${bad} becomes 0`,
    corrupt: (e) => (e.steer.escortSlot = bad),
    expected: (e) => expect(e.steer.escortSlot).toBe(0),
    delta: 1,
  })),
  {
    name: "steer.escortSlot 15 is clean",
    corrupt: (e) => (e.steer.escortSlot = MAX_ESCORT_SLOT),
    expected: (e) => expect(e.steer.escortSlot).toBe(MAX_ESCORT_SLOT),
    delta: 0,
  },
  // The tracking curve.
  {
    name: "a started curve with strictly decreasing ticks is clean",
    corrupt: (e) => startCurve(e),
    expected: (e) => {
      expect(e.steer.trackingCount).toBe(4);
      expect(e.steer.trackingTicks).toEqual([300, 240, 180, 120]);
      expect(e.steer.trackingPositions[3]).toEqual(vec(4, 5, 6));
    },
    delta: 0,
  },
  {
    name: "a legitimate early start (negative ticks, strictly decreasing) is not a repair",
    corrupt: (e) => startCurve(e, [10, -50, -110, -170]),
    expected: (e) => {
      expect(e.steer.trackingCount).toBe(4);
      expect(e.steer.trackingTicks).toEqual([10, -50, -110, -170]);
    },
    delta: 0,
  },
  {
    name: "a tick at exactly -MAX_UINT32 is inside the signed domain",
    corrupt: (e) => startCurve(e, [0, -1, -2, -MAX_UINT32]),
    expected: (e) => expect(e.steer.trackingTicks[3]).toBe(-MAX_UINT32),
    delta: 0,
  },
  {
    name: "a tick one past the signed domain becomes the empty curve",
    corrupt: (e) => startCurve(e, [10, 5, 0, -MAX_UINT32 - 1]),
    expected: expectNoCurve,
    delta: 1,
  },
  {
    name: "a non-integer tracking tick becomes the empty curve",
    corrupt: (e) => startCurve(e, [300, 240.5, 180, 120]),
    expected: expectNoCurve,
    delta: 1,
  },
  {
    name: "a NaN tracking tick becomes the empty curve",
    corrupt: (e) => startCurve(e, [300, Number.NaN, 180, 120]),
    expected: expectNoCurve,
    delta: 1,
  },
  {
    name: "a count of 4 with two equal ticks becomes the empty curve (calculateTrackingCurve would divide by zero)",
    corrupt: (e) => startCurve(e, [300, 240, 240, 120]),
    expected: expectNoCurve,
    delta: 1,
  },
  {
    name: "a count of 4 with increasing ticks becomes the empty curve",
    corrupt: (e) => startCurve(e, [120, 180, 240, 300]),
    expected: expectNoCurve,
    delta: 1,
  },
  {
    name: "a count of 2 becomes the empty curve",
    corrupt: (e) => {
      startCurve(e);
      e.steer.trackingCount = 2;
    },
    expected: expectNoCurve,
    delta: 1,
  },
  {
    name: "a count of 4 with a non-finite sample position becomes the empty curve",
    corrupt: (e) => {
      startCurve(e);
      e.steer.trackingPositions[2] = vec(1, Number.NaN, 3);
    },
    expected: expectNoCurve,
    delta: 1,
  },
  {
    name: "tracking ticks that are not an array of four become the empty curve",
    corrupt: (e) => {
      startCurve(e);
      loose(e.steer).trackingTicks = [300, 240, 180];
    },
    expected: expectNoCurve,
    delta: 1,
  },
  {
    name: "a stale in-domain curve at count 0 is zeroed without a repair",
    corrupt: (e) => {
      startCurve(e);
      e.steer.trackingCount = 0;
    },
    expected: expectNoCurve,
    delta: 0,
  },
  {
    name: "a stale NaN tick at count 0 is a repair",
    corrupt: (e) => (e.steer.trackingTicks = [Number.NaN, 0, 0, 0]),
    expected: expectNoCurve,
    delta: 1,
  },
  // The saved pre-avoidance condition.
  {
    name: "a valid saved condition is clean",
    corrupt: (e) =>
      (e.steer.saved = {
        behaviour: "FLY_TO_DESTINATION",
        targetId: 105,
        desiredRange: 500,
        desiredSpeed: 80,
        destination: vec(1, 2, 3),
      }),
    expected: (e) =>
      expect(e.steer.saved).toEqual({
        behaviour: "FLY_TO_DESTINATION",
        targetId: 105,
        desiredRange: 500,
        desiredSpeed: 80,
        destination: vec(1, 2, 3),
      }),
    delta: 0,
  },
  {
    name: "a saved condition that is not an object becomes null",
    corrupt: (e) => (loose(e.steer).saved = 5),
    expected: (e) => expect(e.steer.saved).toBeNull(),
    delta: 1,
  },
  {
    name: "a saved condition with an unknown behaviour becomes null",
    corrupt: (e) =>
      (loose(e.steer).saved = {
        behaviour: "WARP",
        targetId: 0,
        desiredRange: 0,
        desiredSpeed: 0,
        destination: vec(0, 0, 0),
      }),
    expected: (e) => expect(e.steer.saved).toBeNull(),
    delta: 1,
  },
  {
    name: "a saved condition with a NaN range becomes null",
    corrupt: (e) =>
      (e.steer.saved = {
        behaviour: "IDLE",
        targetId: 0,
        desiredRange: Number.NaN,
        desiredSpeed: 0,
        destination: vec(0, 0, 0),
      }),
    expected: (e) => expect(e.steer.saved).toBeNull(),
    delta: 1,
  },
  {
    name: "a saved condition with a non-finite destination becomes null",
    corrupt: (e) =>
      (e.steer.saved = {
        behaviour: "IDLE",
        targetId: 0,
        desiredRange: 0,
        desiredSpeed: 0,
        destination: vec(0, Number.POSITIVE_INFINITY, 0),
      }),
    expected: (e) => expect(e.steer.saved).toBeNull(),
    delta: 1,
  },
  {
    name: "a saved targetId outside uint32 becomes 0 and keeps the condition",
    corrupt: (e) =>
      (e.steer.saved = {
        behaviour: "ATTACK_TARGET",
        targetId: -3,
        desiredRange: 100,
        desiredSpeed: 50,
        destination: vec(7, 8, 9),
      }),
    expected: (e) =>
      expect(e.steer.saved).toEqual({
        behaviour: "ATTACK_TARGET",
        targetId: 0,
        desiredRange: 100,
        desiredSpeed: 50,
        destination: vec(7, 8, 9),
      }),
    delta: 1,
  },
  {
    name: "a steering record that is not an object becomes the default record",
    corrupt: (e) => (loose(e).steer = null),
    expected: (e) => expect(e.steer).toEqual(createSteerComponent(0)),
    delta: 1,
  },
);

// The v4 fields (Phase 15, FOUND-18): velocity, weapon and cargo. Every bad
// value is repaired without throwing and counts one repair; a pristine or an
// in-domain value counts none.
const BAD_VELOCITY: readonly number[] = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  MAX_ENTITY_VELOCITY + 1,
  -MAX_ENTITY_VELOCITY - 1,
];

for (const bad of BAD_VELOCITY) {
  for (const axis of ["x", "y", "z"] as const) {
    ROWS.push({
      name: `velocity.${axis} ${bad} becomes 0 and its neighbours stay`,
      corrupt: (e) => {
        e.velocity = vec(3, 4, 5);
        loose(e.velocity)[axis] = bad;
      },
      expected: (e) => {
        const want = { x: 3, y: 4, z: 5, [axis]: 0 };
        expect(e.velocity).toEqual(want);
      },
      delta: 1,
    });
  }
}

ROWS.push(
  {
    name: "a velocity at exactly the bound is clean",
    corrupt: (e) =>
      (e.velocity = vec(MAX_ENTITY_VELOCITY, -MAX_ENTITY_VELOCITY, 0)),
    expected: (e) =>
      expect(e.velocity).toEqual(
        vec(MAX_ENTITY_VELOCITY, -MAX_ENTITY_VELOCITY, 0),
      ),
    delta: 0,
  },
  {
    name: "a drifting velocity inside the bound is clean and bit-identical",
    corrupt: (e) => (e.velocity = vec(1.5, -2.25, 0.125)),
    expected: (e) => expect(e.velocity).toEqual(vec(1.5, -2.25, 0.125)),
    delta: 0,
  },
  {
    name: "velocity -0 is normalised without a repair",
    corrupt: (e) => (e.velocity = vec(-0, -0, -0)),
    expected: (e) => {
      expect(Object.is(e.velocity.x, 0)).toBe(true);
      expect(Object.is(e.velocity.y, 0)).toBe(true);
      expect(Object.is(e.velocity.z, 0)).toBe(true);
    },
    delta: 0,
  },
  {
    name: "a velocity that is not an object becomes a fresh zero vector",
    corrupt: (e) => (loose(e).velocity = null),
    expected: (e) => expect(e.velocity).toEqual(vec(0, 0, 0)),
    delta: 1,
  },
  {
    name: "a weapon record that is not an object becomes a fresh zero record",
    corrupt: (e) => (loose(e).weapon = 7),
    expected: (e) =>
      expect(e.weapon).toEqual({
        temperature: 0,
        lastShotTick: 0,
        missedShots: 0,
        aftTemperature: 0,
        portTemperature: 0,
        starboardTemperature: 0,
      }),
    delta: 1,
  },
  {
    name: "a weapon temperature at exactly the bound is clean",
    corrupt: (e) => (e.weapon.temperature = MAX_WEAPON_TEMPERATURE),
    expected: (e) => expect(e.weapon.temperature).toBe(MAX_WEAPON_TEMPERATURE),
    delta: 0,
  },
  {
    name: "an in-domain non-pristine weapon record is clean",
    corrupt: (e) =>
      (e.weapon = {
        temperature: 12.5,
        lastShotTick: 6,
        missedShots: 2,
        aftTemperature: 0,
        portTemperature: 0,
        starboardTemperature: 0,
      }),
    expected: (e) =>
      expect(e.weapon).toEqual({
        temperature: 12.5,
        lastShotTick: 6,
        missedShots: 2,
        aftTemperature: 0,
        portTemperature: 0,
        starboardTemperature: 0,
      }),
    delta: 0,
  },
  {
    name: "weapon.temperature -0 is normalised without a repair",
    corrupt: (e) => (e.weapon.temperature = -0),
    expected: (e) => expect(Object.is(e.weapon.temperature, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "cargo at 0 and at the bound is clean",
    corrupt: (e) => (e.cargo = MAX_ENTITY_CARGO),
    expected: (e) => expect(e.cargo).toBe(MAX_ENTITY_CARGO),
    delta: 0,
  },
  {
    name: "cargo -0 is normalised without a repair",
    corrupt: (e) => (e.cargo = -0),
    expected: (e) => expect(Object.is(e.cargo, 0)).toBe(true),
    delta: 0,
  },
);

for (const bad of [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  -1,
  MAX_WEAPON_TEMPERATURE + 1,
]) {
  ROWS.push({
    name: `weapon.temperature ${bad} becomes 0`,
    corrupt: (e) => {
      e.weapon.lastShotTick = 4;
      e.weapon.temperature = bad;
    },
    expected: (e) => {
      expect(e.weapon.temperature).toBe(0);
      expect(e.weapon.lastShotTick).toBe(4);
    },
    delta: 1,
  });
}

for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 2 ** 32]) {
  ROWS.push(
    {
      name: `weapon.lastShotTick ${bad} becomes 0`,
      corrupt: (e) => (e.weapon.lastShotTick = bad),
      expected: (e) => expect(e.weapon.lastShotTick).toBe(0),
      delta: 1,
    },
    {
      name: `weapon.missedShots ${bad} becomes 0`,
      corrupt: (e) => (e.weapon.missedShots = bad),
      expected: (e) => expect(e.weapon.missedShots).toBe(0),
      delta: 1,
    },
  );
}

for (const bad of [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  1.5,
  MAX_ENTITY_CARGO + 1,
  2 ** 32,
]) {
  ROWS.push({
    name: `cargo ${bad} becomes 0`,
    corrupt: (e) => (e.cargo = bad),
    expected: (e) => expect(e.cargo).toBe(0),
    delta: 1,
  });
}

// The v5 fields (Phase 21, FOUND-20). Every bad value is repaired without
// throwing and counts one repair; a pristine or an in-bound value counts none
// and one bad leaf never resets its neighbour.
for (const bad of [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -1,
  1.5,
  MAX_BOUNTY + 1,
  2 ** 32,
]) {
  ROWS.push({
    name: `bounty ${bad} becomes 0`,
    corrupt: (e) => (e.bounty = bad),
    expected: (e) => expect(e.bounty).toBe(0),
    delta: 1,
  });
}
ROWS.push(
  {
    name: "bounty 70000 becomes a bounded value and leaves cargo alone",
    corrupt: (e) => {
      e.cargo = 9;
      e.bounty = 70000;
    },
    expected: (e) => {
      expect(e.bounty).toBeLessThanOrEqual(MAX_BOUNTY);
      expect(e.cargo).toBe(9);
    },
    delta: 1,
  },
  {
    name: "a bounty at 0 and at the bound is clean",
    corrupt: (e) => (e.bounty = MAX_BOUNTY),
    expected: (e) => expect(e.bounty).toBe(MAX_BOUNTY),
    delta: 0,
  },
  {
    name: "bounty -0 is normalised without a repair",
    corrupt: (e) => (e.bounty = -0),
    expected: (e) => expect(Object.is(e.bounty, 0)).toBe(true),
    delta: 0,
  },
  {
    name: "a bounty that is not a number becomes 0",
    corrupt: (e) => (loose(e).bounty = "50"),
    expected: (e) => expect(e.bounty).toBe(0),
    delta: 1,
  },
);

// The v5 scalar fields, table-driven from the shared boundary table: a value
// one step outside its bound, or of the wrong type, becomes the pristine value
// with one repair and leaves every neighbour alone; a value at a bound is clean.
for (const field of V5_SCALARS) {
  const key = field.key;
  for (const bad of [...field.outOfBound, ...field.wrongType]) {
    ROWS.push({
      name: `${key} ${typeof bad === "string" ? JSON.stringify(bad) : String(bad)} becomes pristine and leaves the neighbours alone`,
      corrupt: (e) => {
        e.bounty = key === "bounty" ? e.bounty : 11;
        e.fuel = key === "fuel" ? e.fuel : 12;
        loose(e)[key] = bad;
      },
      expected: (e) => {
        expect(loose(e)[key]).toBe(field.pristine);
        if (key !== "bounty") expect(e.bounty).toBe(11);
        if (key !== "fuel") expect(e.fuel).toBe(12);
      },
      delta: 1,
    });
  }
  for (const good of field.accepted) {
    ROWS.push({
      name: `${key} ${typeof good === "string" ? JSON.stringify(good) : String(good)} is clean`,
      corrupt: (e) => (loose(e)[key] = good),
      expected: (e) => expect(loose(e)[key]).toBe(good),
      delta: 0,
    });
  }
}

// The v5 object fields (FOUND-20): the injector, the per-facing temperatures
// and the per-facing weapon types, repaired leaf by leaf.
for (const facing of ["aft", "port", "starboard"] as const) {
  const key = `${facing}Temperature` as const;
  for (const bad of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    MAX_WEAPON_TEMPERATURE + 1,
  ]) {
    ROWS.push({
      name: `weapon.${key} ${bad} becomes 0 and leaves its neighbours alone`,
      corrupt: (e) => {
        e.weapon.temperature = 4;
        e.weapon[key] = bad;
      },
      expected: (e) => {
        expect(e.weapon[key]).toBe(0);
        expect(e.weapon.temperature).toBe(4);
      },
      delta: 1,
    });
  }
  ROWS.push({
    name: `weapon.${key} at the bound is clean`,
    corrupt: (e) => (e.weapon[key] = MAX_WEAPON_TEMPERATURE),
    expected: (e) => expect(e.weapon[key]).toBe(MAX_WEAPON_TEMPERATURE),
    delta: 0,
  });
}

for (const bad of [Number.NaN, -0.000001, 1.000001, 2, Infinity]) {
  ROWS.push({
    name: `injector.accumulator ${bad} becomes Oolite's initial 1`,
    corrupt: (e) => (e.injector = { accumulator: bad }),
    expected: (e) => expect(e.injector).toEqual({ accumulator: 1 }),
    delta: 1,
  });
}
ROWS.push(
  {
    name: "a null injector is clean",
    corrupt: (e) => (e.injector = null),
    expected: (e) => expect(e.injector).toBeNull(),
    delta: 0,
  },
  {
    name: "an injector accumulator at 0, 0.5 and 1 is clean",
    corrupt: (e) => (e.injector = { accumulator: 0 }),
    expected: (e) => expect(e.injector).toEqual({ accumulator: 0 }),
    delta: 0,
  },
  {
    name: "an injector that is not an object becomes null",
    corrupt: (e) => (loose(e).injector = 5),
    expected: (e) => expect(e.injector).toBeNull(),
    delta: 1,
  },
  {
    name: "an undefined injector becomes null",
    corrupt: (e) => (loose(e).injector = undefined),
    expected: (e) => expect(e.injector).toBeNull(),
    delta: 1,
  },
  {
    name: "weaponTypes that is not an object becomes all null",
    corrupt: (e) => (loose(e).weaponTypes = null),
    expected: (e) =>
      expect(e.weaponTypes).toEqual({
        fore: null,
        aft: null,
        port: null,
        starboard: null,
      }),
    delta: 1,
  },
  {
    name: "a lower-case weapon type becomes null and its neighbour stays",
    corrupt: (e) => {
      e.weaponTypes.aft = "EQ_WEAPON_BEAM_LASER";
      e.weaponTypes.port = "eq_weapon_beam";
    },
    expected: (e) => {
      expect(e.weaponTypes.port).toBeNull();
      expect(e.weaponTypes.aft).toBe("EQ_WEAPON_BEAM_LASER");
    },
    delta: 1,
  },
  {
    name: "a 33-character weapon type becomes null",
    corrupt: (e) => (e.weaponTypes.fore = `EQ_WEAPON_${"A".repeat(23)}`),
    expected: (e) => expect(e.weaponTypes.fore).toBeNull(),
    delta: 1,
  },
  {
    name: "a 32-character weapon type is clean",
    corrupt: (e) => (e.weaponTypes.fore = `EQ_WEAPON_${"A".repeat(22)}`),
    expected: (e) =>
      expect(e.weaponTypes.fore).toBe(`EQ_WEAPON_${"A".repeat(22)}`),
    delta: 0,
  },
  {
    name: "a weapon type that is a number becomes null",
    corrupt: (e) => (loose(e.weaponTypes).starboard = 5),
    expected: (e) => expect(e.weaponTypes.starboard).toBeNull(),
    delta: 1,
  },
  {
    name: "EQ_WEAPON_NONE stays distinct from null and is clean",
    corrupt: (e) => (e.weaponTypes.aft = "EQ_WEAPON_NONE"),
    expected: (e) => expect(e.weaponTypes.aft).toBe("EQ_WEAPON_NONE"),
    delta: 0,
  },
);

describe("sanitizeEntity table", () => {
  for (const row of ROWS) {
    it(row.name, () => {
      const entity = fresh();
      row.corrupt(entity);
      const repairsBefore = entity.repairs;
      const returned = sanitizeEntity(entity);
      row.expected(entity);
      expect(returned).toBe(row.delta === 1);
      // The rows that corrupt `repairs` itself pin the absolute value instead.
      if (!row.name.startsWith("repairs")) {
        expect(entity.repairs).toBe(repairsBefore + row.delta);
      }
      // The repaired entity hashes without throwing.
      expect(() => serializeEntity(entity)).not.toThrow();
      // Idempotent: the second call is a no-op down to the bit.
      const snapshot = leaves(entity);
      expect(sanitizeEntity(entity)).toBe(false);
      expect(leaves(entity)).toEqual(snapshot);
    });
  }
});

describe("sanitizeEntity counting", () => {
  it("leaves a clean entity bit-identical and returns false", () => {
    const entity = fresh();
    const before = leaves(entity);
    expect(sanitizeEntity(entity)).toBe(false);
    expect(leaves(entity)).toEqual(before);
    expect(entity.repairs).toBe(0);
  });

  it("counts one repair per call however many fields it repaired", () => {
    const entity = fresh();
    loose(entity.position).x = Number.NaN;
    entity.speed = -1;
    entity.radius = 0;
    entity.specKey = "";
    expect(sanitizeEntity(entity)).toBe(true);
    expect(entity.repairs).toBe(1);
    entity.speed = -1;
    expect(sanitizeEntity(entity)).toBe(true);
    expect(entity.repairs).toBe(2);
  });

  it("saturates repairs at 0xffffffff when another field is repaired", () => {
    const entity = fresh();
    entity.repairs = MAX_UINT32;
    entity.speed = Number.NaN;
    expect(sanitizeEntity(entity)).toBe(true);
    expect(entity.repairs).toBe(MAX_UINT32);
  });

  it("does not count a successful renormalisation or a -0 normalisation", () => {
    const entity = fresh();
    entity.orientation = { w: 0, x: 0, y: 0, z: 3 };
    loose(entity.position).x = -0;
    expect(sanitizeEntity(entity)).toBe(false);
    expect(entity.repairs).toBe(0);
    expect(entity.orientation).toEqual({ w: 0, x: 0, y: 0, z: 1 });
  });

  it("an already-dead entity of an unknown kind is left alone", () => {
    const entity = fresh();
    loose(entity).kind = "constructor";
    entity.dead = true;
    expect(sanitizeEntity(entity)).toBe(false);
    expect(entity.repairs).toBe(0);
  });

  it("an entity without an AI component is repaired like any other", () => {
    const entity = fresh();
    entity.ai = null;
    entity.speed = Number.NaN;
    expect(sanitizeEntity(entity)).toBe(true);
    expect(entity.ai).toBeNull();
  });
});

describe("the steering record at spawn and in the hash (AI-01)", () => {
  const spawnSlot = (escortSlot: unknown): ReturnType<typeof spawnEntity> =>
    spawnEntity(
      createWorld(5),
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 40,
        escortSlot,
      } as unknown as SpawnInit,
      0,
    );

  it("a default spawn carries the default record with slot 0 and the unresolved accuracy", () => {
    const entity = fresh();
    expect(entity.steer).toEqual(createSteerComponent(0));
    expect(entity.steer.accuracy).toBe(-100);
    expect(entity.steer.escortSlot).toBe(0);
  });

  it("a spawn names its escort slot, 0 to 15", () => {
    expect(fresh({ escortSlot: 0 }).steer.escortSlot).toBe(0);
    expect(fresh({ escortSlot: 7 }).steer.escortSlot).toBe(7);
    expect(fresh({ escortSlot: 15 }).steer.escortSlot).toBe(15);
  });

  it.each([16, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32])(
    "refuses escort slot %s as outOfDomain, never throwing",
    (slot) => {
      expect(spawnSlot(slot)).toEqual({ ok: false, reason: "outOfDomain" });
    },
  );

  it.each(["3", null, {}])(
    "refuses a non-number escort slot %j as malformed",
    (slot) => {
      expect(spawnSlot(slot)).toEqual({ ok: false, reason: "malformed" });
    },
  );

  it("two spawns share no steering object, array or vector", () => {
    const a = fresh();
    const b = fresh();
    expect(a.steer).not.toBe(b.steer);
    expect(a.steer.jink).not.toBe(b.steer.jink);
    expect(a.steer.trackingTicks).not.toBe(b.steer.trackingTicks);
    expect(a.steer.trackingPositions).not.toBe(b.steer.trackingPositions);
    expect(a.steer.trackingPositions[0]).not.toBe(b.steer.trackingPositions[0]);
  });

  it("the steering segment is the last, uniquely labelled segment of the entity line of a pristine entity", () => {
    const text = serializeEntity(fresh());
    const segments = text.split(";");
    expect(
      segments.filter((segment) => segment.startsWith("steer:")),
    ).toHaveLength(1);
    expect(segments[segments.length - 1]?.startsWith("steer:")).toBe(true);
    expect(text.indexOf(";en:")).toBeLessThan(text.indexOf(";steer:"));
  });

  it("the segments after steer: of a non-pristine entity are vel, wpn, cargo in that order", () => {
    const entity = fresh();
    entity.velocity = vec(1, 0, 0);
    entity.weapon = {
      temperature: 0,
      lastShotTick: 3,
      missedShots: 0,
      aftTemperature: 0,
      portTemperature: 0,
      starboardTemperature: 0,
    };
    entity.cargo = 2;
    const segments = serializeEntity(entity).split(";");
    const at = segments.findIndex((segment) => segment.startsWith("steer:"));
    expect(
      segments.slice(at + 1).map((segment) => segment.split(":")[0]),
    ).toEqual(["vel", "wpn", "cargo"]);
  });

  // One mutation per field of the record: every field is hashed, and the escort
  // slot is not an omitted pristine detail.
  const HASHED: readonly (readonly [string, (e: Entity) => void])[] = [
    ["flightRoll", (e) => (e.steer.flightRoll = 0.5)],
    ["flightPitch", (e) => (e.steer.flightPitch = 0.5)],
    ["stickRoll", (e) => (e.steer.stickRoll = 0.5)],
    ["stickPitch", (e) => (e.steer.stickPitch = 0.5)],
    ["accuracy", (e) => (e.steer.accuracy = 3)],
    ["frustration", (e) => (e.steer.frustration = 2)],
    ["successFactor", (e) => (e.steer.successFactor = 0.25)],
    ["pitchingOver", (e) => (e.steer.pitchingOver = true)],
    ["jink", (e) => (e.steer.jink = vec(0, 1, 0))],
    ["proximityAlert", (e) => (e.steer.proximityAlert = 105)],
    ["escortSlot", (e) => (e.steer.escortSlot = 1)],
    ["trackingCount and samples", (e) => startCurve(e)],
    [
      "saved",
      (e) =>
        (e.steer.saved = {
          behaviour: "IDLE",
          targetId: 0,
          desiredRange: 0,
          desiredSpeed: 0,
          destination: vec(0, 0, 0),
        }),
    ],
    ["entryPending", (e) => (e.steer.entryPending = true)],
  ];

  it.each(HASHED.map((row) => [...row]))("hashes %s", (_name, mutate) => {
    const entity = fresh();
    const before = serializeEntity(entity);
    mutate(entity);
    expect(serializeEntity(entity)).not.toBe(before);
  });

  it("every field of the record is covered by a row above", () => {
    expect(Object.keys(createSteerComponent(0)).sort()).toEqual(
      [
        "flightRoll",
        "flightPitch",
        "stickRoll",
        "stickPitch",
        "accuracy",
        "frustration",
        "successFactor",
        "pitchingOver",
        "jink",
        "proximityAlert",
        "escortSlot",
        "trackingCount",
        "trackingTicks",
        "trackingPositions",
        "saved",
        "entryPending",
      ].sort(),
    );
  });

  it("a spawn in slot 1 and a spawn in slot 0 hash differently (no escortSlot collision)", () => {
    expect(serializeEntity(fresh({ escortSlot: 1 }))).not.toBe(
      serializeEntity(fresh({ escortSlot: 0 })),
    );
  });

  it("a saved condition and no saved condition never print alike", () => {
    const a = fresh();
    const b = fresh();
    b.steer.saved = {
      behaviour: "IDLE",
      targetId: 0,
      desiredRange: 0,
      desiredSpeed: 0,
      destination: vec(0, 0, 0),
    };
    expect(serializeEntity(a)).toContain(",sv:z,");
    expect(serializeEntity(a)).not.toBe(serializeEntity(b));
  });

  it("a curve of count 0 and a curve of count 4 never print alike", () => {
    const a = fresh();
    const b = fresh();
    startCurve(b, [0, -60, -120, -180]);
    expect(serializeEntity(a)).toContain(",t0,");
    expect(serializeEntity(b)).toContain(",t4:");
    expect(serializeEntity(a)).not.toBe(serializeEntity(b));
  });

  it("states that differ only in stale samples at count 0 hash equally once sanitized", () => {
    const clean = fresh();
    const stale = fresh();
    startCurve(stale);
    stale.steer.trackingCount = 0;
    expect(sanitizeEntity(stale)).toBe(false);
    expect(stale.repairs).toBe(0);
    expect(serializeEntity(stale)).toBe(serializeEntity(clean));
  });

  it("repairs a NaN rate and a bad curve before the entity is hashed, once", () => {
    const entity = fresh();
    entity.steer.flightPitch = Number.NaN;
    startCurve(entity, [300, 300, 200, 100]);
    expect(() => serializeEntity(entity)).toThrow();
    expect(sanitizeEntity(entity)).toBe(true);
    expect(entity.repairs).toBe(1);
    expect(() => serializeEntity(entity)).not.toThrow();
    expect(sanitizeEntity(entity)).toBe(false);
  });
});

describe("the energy bank at spawn and in the hash (CBT-07)", () => {
  it("a default spawn has 200 energy, 200 max energy and rate 1", () => {
    const entity = fresh();
    expect(entity.energy).toBe(200);
    expect(entity.maxEnergy).toBe(200);
    expect(entity.energyRechargeRate).toBe(1);
  });

  it("a spawn names its bank and starts at full energy", () => {
    const entity = fresh({ maxEnergy: 85, energyRechargeRate: 2 });
    expect(entity.energy).toBe(85);
    expect(entity.maxEnergy).toBe(85);
    expect(entity.energyRechargeRate).toBe(2);
  });

  it("the bank is hashed: 85 and 86 hash differently, and so does the rate", () => {
    const a = serializeEntity(fresh({ maxEnergy: 85, energyRechargeRate: 2 }));
    const b = serializeEntity(fresh({ maxEnergy: 86, energyRechargeRate: 2 }));
    const c = serializeEntity(fresh({ maxEnergy: 85, energyRechargeRate: 3 }));
    expect(a).toContain(";en:85.000000,85.000000,2.000000");
    expect(b).not.toBe(a);
    expect(c).not.toBe(a);
  });

  it("a drained energy changes the hash text", () => {
    const entity = fresh({ maxEnergy: 85, energyRechargeRate: 2 });
    const before = serializeEntity(entity);
    entity.energy = 60;
    expect(serializeEntity(entity)).not.toBe(before);
  });

  it("repairs a NaN energy and a non-finite rate before the entity is hashed", () => {
    const entity = fresh({ maxEnergy: 85, energyRechargeRate: 2 });
    entity.energy = Number.NaN;
    entity.energyRechargeRate = Number.NaN;
    expect(() => serializeEntity(entity)).toThrow();
    expect(sanitizeEntity(entity)).toBe(true);
    expect(entity.repairs).toBe(1);
    expect(entity.energy).toBe(85);
    expect(entity.energyRechargeRate).toBe(NPC_DEFAULT_ENERGY_RECHARGE_RATE);
    expect(() => serializeEntity(entity)).not.toThrow();
  });

  const world = (): ReturnType<typeof createWorld> => createWorld(5);
  const spawn = (extra: Partial<SpawnInit>): ReturnType<typeof spawnEntity> =>
    spawnEntity(
      world(),
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 40,
        ...extra,
      },
      0,
    );

  it.each([
    [
      "an over-bound rate",
      { energyRechargeRate: MAX_ENERGY_RECHARGE_RATE + 1 },
    ],
    ["a negative rate", { energyRechargeRate: -1 }],
    ["a NaN rate", { energyRechargeRate: Number.NaN }],
    ["an over-bound max energy", { maxEnergy: MAX_ENTITY_ENERGY + 1 }],
    ["a negative max energy", { maxEnergy: -1 }],
    ["an infinite max energy", { maxEnergy: Number.POSITIVE_INFINITY }],
  ] as [string, Partial<SpawnInit>][])(
    "refuses %s as outOfDomain",
    (_n, extra) => {
      expect(spawn(extra)).toEqual({ ok: false, reason: "outOfDomain" });
    },
  );

  it.each([
    ["a string max energy", { maxEnergy: "85" }],
    ["a null rate", { energyRechargeRate: null }],
  ])("refuses %s as malformed", (_n, extra) => {
    expect(spawn(extra as unknown as Partial<SpawnInit>)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("a refused spawn leaves the id counter and the world untouched", () => {
    const w = world();
    const before = w.store.nextId;
    const refused = spawnEntity(
      w,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 40,
        energyRechargeRate: MAX_ENERGY_RECHARGE_RATE * 2,
      },
      0,
    );
    expect(refused.ok).toBe(false);
    expect(w.store.nextId).toBe(before);
    expect(w.store.live).toHaveLength(0);
  });
});

describe("sanitizeStaticHealth (FOUND-18, D-08)", () => {
  const healthOf = (world: ReturnType<typeof createWorld>) => ({
    ...world.staticHealth,
  });

  it("leaves a pristine world bit-identical and reports no repair", () => {
    const world = createWorld(5);
    const before = world.staticHealth;
    expect(sanitizeStaticHealth(world)).toBe(false);
    expect(world.staticHealth).toBe(before);
    expect(healthOf(world)).toEqual({
      station: STATION_MAX_ENERGY,
      witchpoint: BUOY_MAX_ENERGY,
      navBuoy: BUOY_MAX_ENERGY,
    });
  });

  it("leaves an in-domain damaged record untouched", () => {
    const world = createWorld(5);
    world.staticHealth = { station: 0, witchpoint: 100.5, navBuoy: 1 };
    expect(sanitizeStaticHealth(world)).toBe(false);
    expect(healthOf(world)).toEqual({
      station: 0,
      witchpoint: 100.5,
      navBuoy: 1,
    });
  });

  it.each([
    ["NaN", Number.NaN, 250],
    ["Infinity", Number.POSITIVE_INFINITY, 250],
    ["-Infinity", Number.NEGATIVE_INFINITY, 250],
    ["negative", -5, 0],
    ["above the maximum", 251, 250],
  ])(
    "a witchpoint of %s is held at %s and counts as a repair",
    (_n, bad, want) => {
      const world = createWorld(5);
      world.staticHealth.witchpoint = bad;
      expect(sanitizeStaticHealth(world)).toBe(true);
      expect(world.staticHealth.witchpoint).toBe(want);
      expect(world.staticHealth.station).toBe(STATION_MAX_ENERGY);
      expect(sanitizeStaticHealth(world)).toBe(false);
    },
  );

  it("holds the station at its own maximum, not the buoy one", () => {
    const world = createWorld(5);
    world.staticHealth.station = STATION_MAX_ENERGY + 1;
    expect(sanitizeStaticHealth(world)).toBe(true);
    expect(world.staticHealth.station).toBe(STATION_MAX_ENERGY);
    world.staticHealth.station = 20000;
    expect(sanitizeStaticHealth(world)).toBe(false);
  });

  it("-0 becomes 0 without a repair", () => {
    const world = createWorld(5);
    world.staticHealth.navBuoy = -0;
    expect(sanitizeStaticHealth(world)).toBe(false);
    expect(Object.is(world.staticHealth.navBuoy, 0)).toBe(true);
  });

  it.each([null, undefined, 7, "x"])(
    "a record of %j is replaced by the pristine one",
    (bad) => {
      const world = createWorld(5);
      loose(world).staticHealth = bad;
      expect(sanitizeStaticHealth(world)).toBe(true);
      expect(healthOf(world)).toEqual({
        station: STATION_MAX_ENERGY,
        witchpoint: BUOY_MAX_ENERGY,
        navBuoy: BUOY_MAX_ENERGY,
      });
    },
  );

  it("never throws and leaves a value the parser accepts, for any input", () => {
    const leaf = fc.oneof(
      fc.double(),
      fc.constantFrom(
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        -0,
        0,
        250,
        251,
        25000,
        25001,
        1e300,
      ),
      fc.constantFrom(null, undefined, "5", true, {}, []),
    );
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({ station: leaf, witchpoint: leaf, navBuoy: leaf }),
          fc.constantFrom(null, undefined, 3, "x"),
        ),
        (input) => {
          const world = createWorld(5);
          loose(world).staticHealth = input;
          expect(() => sanitizeStaticHealth(world)).not.toThrow();
          const text = JSON.stringify(snapshotWorld(world));
          expect(() =>
            parseWorldSnapshot(JSON.parse(text) as unknown),
          ).not.toThrow();
          // The repair is idempotent.
          expect(sanitizeStaticHealth(world)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("sanitizeBuoyStates (PD-01, PD-02, T-18-39, T-18-51)", () => {
  const ZERO = { x: 0, y: 0, z: 0 };

  it("leaves pristine and valid moved buoys untouched and reports no repair", () => {
    const world = createWorld(5);
    const before = world.buoys;
    expect(sanitizeBuoyStates(world)).toBe(false);
    expect(world.buoys).toBe(before);
    expect(world.buoys).toEqual(createBuoyStates());
    world.buoys.navBuoy.offset = vec(MAX_BUOY_OFFSET, -3, 0.5);
    world.buoys.navBuoy.velocity = vec(-MAX_ENTITY_VELOCITY, 0, 2);
    world.buoys.navBuoy.subentityEnergy = 0;
    world.buoys.witchpoint.subentityEnergy = 0.5;
    world.buoys.witchpoint.subentityTakingDamage = true;
    const offset = world.buoys.navBuoy.offset;
    expect(sanitizeBuoyStates(world)).toBe(false);
    expect(world.buoys.navBuoy.offset).toBe(offset);
    expect(world.buoys.navBuoy.velocity).toEqual({
      x: -MAX_ENTITY_VELOCITY,
      y: 0,
      z: 2,
    });
    expect(world.buoys.witchpoint.subentityTakingDamage).toBe(true);
  });

  it("heals a non-finite offset and velocity to rest at the layout position", () => {
    const world = createWorld(5);
    world.buoys.navBuoy.offset = vec(Number.NaN, 7, 0);
    world.buoys.witchpoint.velocity = vec(1, 2, Number.POSITIVE_INFINITY);
    expect(sanitizeBuoyStates(world)).toBe(true);
    expect(world.buoys.navBuoy.offset).toEqual(ZERO);
    expect(world.buoys.witchpoint.velocity).toEqual(ZERO);
    expect(sanitizeBuoyStates(world)).toBe(false);
  });

  it("heals a non-finite subentity energy to its maximum, as static health heals", () => {
    const world = createWorld(5);
    world.buoys.witchpoint.subentityEnergy = Number.NaN;
    expect(sanitizeBuoyStates(world)).toBe(true);
    expect(world.buoys.witchpoint.subentityEnergy).toBe(
      BUOY_SUBENTITY_MAX_ENERGY,
    );
  });

  it.each([
    ["offset", 2e6, MAX_BUOY_OFFSET],
    ["offset", -2e6, -MAX_BUOY_OFFSET],
    ["velocity", 2e4, MAX_ENTITY_VELOCITY],
    ["velocity", -2e4, -MAX_ENTITY_VELOCITY],
  ] as const)("clamps a %s component of %s to %s", (field, bad, want) => {
    const world = createWorld(5);
    world.buoys.navBuoy[field] = vec(1, bad, -1);
    expect(sanitizeBuoyStates(world)).toBe(true);
    expect(world.buoys.navBuoy[field]).toEqual({ x: 1, y: want, z: -1 });
    expect(sanitizeBuoyStates(world)).toBe(false);
  });

  it.each([
    [-3, 0],
    [300, BUOY_SUBENTITY_MAX_ENERGY],
  ])("clamps a subentity energy of %s to %s", (bad, want) => {
    const world = createWorld(5);
    world.buoys.navBuoy.subentityEnergy = bad;
    expect(sanitizeBuoyStates(world)).toBe(true);
    expect(world.buoys.navBuoy.subentityEnergy).toBe(want);
  });

  it.each([1, "yes", null, undefined])("clears a routing flag of %j", (bad) => {
    const world = createWorld(5);
    loose(world.buoys.witchpoint).subentityTakingDamage = bad;
    expect(sanitizeBuoyStates(world)).toBe(true);
    expect(world.buoys.witchpoint.subentityTakingDamage).toBe(false);
  });

  it("clears the routing flag of a detached subentity (ShipEntity.m:8187-8188)", () => {
    const world = createWorld(5);
    world.buoys.navBuoy.subentityEnergy = 0;
    world.buoys.navBuoy.subentityTakingDamage = true;
    expect(sanitizeBuoyStates(world)).toBe(true);
    expect(world.buoys.navBuoy.subentityTakingDamage).toBe(false);
    // A negative energy clamps to 0 (detached) and clears the flag too.
    world.buoys.witchpoint.subentityEnergy = -1;
    world.buoys.witchpoint.subentityTakingDamage = true;
    expect(sanitizeBuoyStates(world)).toBe(true);
    expect(world.buoys.witchpoint.subentityTakingDamage).toBe(false);
  });

  it("-0 becomes 0 without a repair", () => {
    const world = createWorld(5);
    world.buoys.navBuoy.offset = vec(-0, 1, 0);
    world.buoys.navBuoy.subentityEnergy = -0;
    expect(sanitizeBuoyStates(world)).toBe(false);
    expect(Object.is(world.buoys.navBuoy.offset.x, 0)).toBe(true);
    expect(Object.is(world.buoys.navBuoy.subentityEnergy, 0)).toBe(true);
  });

  it.each([null, undefined, 7, "x"])(
    "a record or a buoy of %j is replaced by the pristine one",
    (bad) => {
      const world = createWorld(5);
      loose(world.buoys).navBuoy = bad;
      expect(sanitizeBuoyStates(world)).toBe(true);
      expect(world.buoys).toEqual(createBuoyStates());
      loose(world.buoys.witchpoint).offset = bad;
      expect(sanitizeBuoyStates(world)).toBe(true);
      expect(world.buoys).toEqual(createBuoyStates());
      loose(world).buoys = bad;
      expect(sanitizeBuoyStates(world)).toBe(true);
      expect(world.buoys).toEqual(createBuoyStates());
    },
  );

  it("runs before every world step (repairWorldFields)", () => {
    const { layout } = laveFixture();
    const world = createWorld(5);
    world.buoys.navBuoy.offset = vec(Number.NaN, 0, 0);
    world.buoys.witchpoint.subentityEnergy = 300;
    stepWorld(world, initFlightState(layout), layout, 1 / 60);
    expect(world.buoys.navBuoy.offset).toEqual(ZERO);
    expect(world.buoys.witchpoint.subentityEnergy).toBe(
      BUOY_SUBENTITY_MAX_ENERGY,
    );
  });

  it("never throws and leaves a value the parser accepts, for any input", () => {
    const leaf = fc.oneof(
      fc.double(),
      fc.constantFrom(
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        -0,
        0,
        200,
        200.5,
        1e4 + 1,
        1e6 + 1,
        1e300,
      ),
      fc.constantFrom(null, undefined, "5", true, {}, []),
    );
    const vector = fc.oneof(
      fc.record({ x: leaf, y: leaf, z: leaf }),
      fc.constantFrom(null, undefined, 3),
    );
    const buoy = fc.oneof(
      fc.record({
        offset: vector,
        velocity: vector,
        subentityEnergy: leaf,
        subentityTakingDamage: fc.oneof(fc.boolean(), leaf),
      }),
      fc.constantFrom(null, undefined, "x"),
    );
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({ witchpoint: buoy, navBuoy: buoy }),
          fc.constantFrom(null, undefined, 3, "x"),
        ),
        (input) => {
          const world = createWorld(5);
          loose(world).buoys = input;
          expect(() => sanitizeBuoyStates(world)).not.toThrow();
          const text = JSON.stringify(snapshotWorld(world));
          expect(() =>
            parseWorldSnapshot(JSON.parse(text) as unknown),
          ).not.toThrow();
          // The repair is idempotent.
          expect(sanitizeBuoyStates(world)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// The v5 world records (FOUND-20, plan 21-06): station, groups, populator.
// Each sanitizer is total on any input, repairs in place, returns the repaired
// field count and is idempotent. Expected values come from the bounds in
// `limits.ts` and the plan, never from running the code under test.

describe("sanitizeStation (FOUND-20, plan 21-06)", () => {
  const worldWith = (station: unknown): ReturnType<typeof createWorld> => {
    const world = createWorld(5);
    loose(world).station = station;
    return world;
  };

  it("leaves a valid record alone and counts nothing", () => {
    const world = worldWith({ alert: 3, launched: 255, marks: [100, 205] });
    const marks = world.station.marks;
    expect(sanitizeStation(world)).toBe(0);
    expect(world.station).toEqual({
      alert: 3,
      launched: 255,
      marks: [100, 205],
    });
    expect(world.station.marks).toBe(marks);
  });

  it("accepts the alert bounds 0 and 3 and repairs 4, -1 and a fraction to green", () => {
    for (const ok of [0, 1, 2, 3]) {
      const world = worldWith({ alert: ok, launched: 0, marks: [] });
      expect(sanitizeStation(world)).toBe(0);
      expect(world.station.alert).toBe(ok);
    }
    for (const bad of [4, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
      const world = worldWith({ alert: bad, launched: 0, marks: [] });
      expect(sanitizeStation(world)).toBe(1);
      expect(world.station.alert).toBe(STATION_ALERT_GREEN);
    }
  });

  it("repairs a non-integer, negative or over-range launched to 0", () => {
    for (const bad of [0.5, -1, 256, Number.NaN, null, "3"]) {
      const world = worldWith({ alert: 1, launched: bad, marks: [] });
      expect(sanitizeStation(world)).toBe(1);
      expect(world.station.launched).toBe(0);
    }
    const world = worldWith({ alert: 1, launched: 255, marks: [] });
    expect(sanitizeStation(world)).toBe(0);
    expect(world.station.launched).toBe(MAX_STATION_LAUNCHED);
  });

  it("drops invalid marks and keeps the valid neighbours", () => {
    const world = worldWith({
      alert: 1,
      launched: 0,
      marks: [101, 1.5, "x", -4, Number.NaN, 99, 205, null],
    });
    expect(sanitizeStation(world)).toBe(1);
    expect(world.station.marks).toEqual([101, 205]);
  });

  it("collapses a repeated mark to one and sorts an unsorted list", () => {
    const world = worldWith({
      alert: 1,
      launched: 0,
      marks: [205, 101, 205, 100, 101],
    });
    expect(sanitizeStation(world)).toBe(1);
    expect(world.station.marks).toEqual([100, 101, 205]);
  });

  it("keeps the lowest 32 marks of an oversized list", () => {
    const world = worldWith({
      alert: 1,
      launched: 0,
      marks: Array.from({ length: 40 }, (_, i) => 100 + i),
    });
    expect(sanitizeStation(world)).toBe(1);
    expect(world.station.marks).toHaveLength(MAX_STATION_MARKS);
    expect(world.station.marks[0]).toBe(100);
    expect(world.station.marks.at(-1)).toBe(131);
    // 32 marks are accepted as they stand.
    expect(sanitizeStation(world)).toBe(0);
  });

  it("repairs a marks value that is not an array to empty", () => {
    for (const bad of [null, undefined, 5, "101", {}]) {
      const world = worldWith({ alert: 1, launched: 0, marks: bad });
      expect(sanitizeStation(world)).toBe(1);
      expect(world.station.marks).toEqual([]);
    }
  });

  it("replaces a record that is not an object with the pristine one", () => {
    for (const bad of [null, undefined, 5, "x"]) {
      const world = worldWith(bad);
      expect(sanitizeStation(world)).toBe(1);
      expect(world.station).toEqual({ alert: 1, launched: 0, marks: [] });
    }
  });

  it("counts one repair per repaired field", () => {
    const world = worldWith({ alert: 9, launched: -2, marks: [7] });
    expect(sanitizeStation(world)).toBe(3);
    expect(world.station).toEqual({ alert: 1, launched: 0, marks: [] });
    expect(sanitizeStation(world)).toBe(0);
  });

  it("turns -0 into 0 without a repair", () => {
    const world = worldWith({ alert: -0, launched: -0, marks: [] });
    expect(sanitizeStation(world)).toBe(0);
    expect(Object.is(world.station.alert, 0)).toBe(true);
    expect(Object.is(world.station.launched, 0)).toBe(true);
  });
});

describe("sanitizeGroups (FOUND-20, plan 21-06)", () => {
  const worldWith = (groups: unknown): ReturnType<typeof createWorld> => {
    const world = createWorld(5);
    loose(world).groups = groups;
    return world;
  };

  it("leaves a valid list alone and counts nothing", () => {
    const world = worldWith([
      { id: 101, leader: 101 },
      { id: 105, leader: 103 },
    ]);
    const list = world.groups;
    expect(sanitizeGroups(world)).toBe(0);
    expect(world.groups).toBe(list);
  });

  it("accepts a group whose leader is its own id (the founding leader)", () => {
    const world = worldWith([{ id: 150, leader: 150 }]);
    expect(sanitizeGroups(world)).toBe(0);
    expect(world.groups).toEqual([{ id: 150, leader: 150 }]);
  });

  it("sorts ascending and keeps the first of two groups with one id", () => {
    const world = worldWith([
      { id: 105, leader: 105 },
      { id: 101, leader: 101 },
      { id: 105, leader: 999 },
    ]);
    expect(sanitizeGroups(world)).toBe(1);
    expect(world.groups).toEqual([
      { id: 101, leader: 101 },
      { id: 105, leader: 105 },
    ]);
  });

  it("drops a group with a non-id or non-dynamic id or leader, keeping its neighbours", () => {
    const world = worldWith([
      { id: 101, leader: 101 },
      { id: 102, leader: 100 },
      { id: 100, leader: 101 },
      { id: 103, leader: 1.5 },
      { id: "104", leader: 104 },
      { id: 105, leader: Number.NaN },
      null,
      7,
      { id: 106 },
      { id: 107, leader: 107 },
    ]);
    expect(sanitizeGroups(world)).toBe(1);
    expect(world.groups).toEqual([
      { id: 101, leader: 101 },
      { id: 107, leader: 107 },
    ]);
  });

  it("removes an extra key from a record", () => {
    const world = worldWith([{ id: 101, leader: 101, extra: 1 }]);
    expect(sanitizeGroups(world)).toBe(1);
    expect(world.groups).toEqual([{ id: 101, leader: 101 }]);
    expect(Object.keys(world.groups[0] as object)).toEqual(["id", "leader"]);
  });

  it("accepts 128 groups and keeps the lowest 128 of 129", () => {
    const make = (count: number): { id: number; leader: number }[] =>
      Array.from({ length: count }, (_, i) => ({ id: 101 + i, leader: 101 }));
    const full = worldWith(make(MAX_WORLD_GROUPS));
    expect(sanitizeGroups(full)).toBe(0);
    const over = worldWith(make(MAX_WORLD_GROUPS + 1));
    expect(sanitizeGroups(over)).toBe(1);
    expect(over.groups).toHaveLength(MAX_WORLD_GROUPS);
    expect(over.groups.at(-1)?.id).toBe(101 + MAX_WORLD_GROUPS - 1);
  });

  it("replaces a value that is not an array with an empty list", () => {
    for (const bad of [null, undefined, 5, "x", {}]) {
      const world = worldWith(bad);
      expect(sanitizeGroups(world)).toBe(1);
      expect(world.groups).toEqual([]);
    }
  });
});

describe("sanitizePopulator (FOUND-20, plan 21-06)", () => {
  const worldWith = (populator: unknown): ReturnType<typeof createWorld> => {
    const world = createWorld(5);
    loose(world).populator = populator;
    return world;
  };

  it("leaves a valid clock alone, including the uint32 bounds", () => {
    const world = worldWith({ nextTick: MAX_UINT32, rolls: 0 });
    expect(sanitizePopulator(world)).toBe(0);
    expect(world.populator).toEqual({ nextTick: MAX_UINT32, rolls: 0 });
  });

  it("repairs each leaf on its own and counts it", () => {
    for (const bad of [-1, 1.5, Number.NaN, MAX_UINT32 + 1, "3", null]) {
      const world = worldWith({ nextTick: bad, rolls: 7 });
      expect(sanitizePopulator(world)).toBe(1);
      expect(world.populator).toEqual({ nextTick: 0, rolls: 7 });
    }
    const both = worldWith({ nextTick: -1, rolls: 1.5 });
    expect(sanitizePopulator(both)).toBe(2);
    expect(both.populator).toEqual({ nextTick: 0, rolls: 0 });
  });

  it("replaces a record that is not an object", () => {
    for (const bad of [null, undefined, 5, "x"]) {
      const world = worldWith(bad);
      expect(sanitizePopulator(world)).toBe(1);
      expect(world.populator).toEqual({ nextTick: 0, rolls: 0 });
    }
  });
});

describe("the world records are total on malformed input (FOUND-20, milestone rule)", () => {
  const leaf = fc.oneof(
    fc.integer(),
    fc.double(),
    fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      0,
      3,
      4,
      99,
      100,
      101,
      255,
      256,
      MAX_UINT32,
      MAX_UINT32 + 1,
      Number.MAX_SAFE_INTEGER,
    ),
    fc.constantFrom(null, undefined, "5", true, {}, []),
  );
  const idLeaf = fc.oneof(
    fc.integer({ min: 95, max: 140 }),
    fc.integer({ min: 0, max: MAX_UINT32 }),
    leaf,
  );
  /** A list of malformed ids: unsorted, repeated, oversized, junk elements. */
  const idList = fc.oneof(
    fc.array(idLeaf, { maxLength: 80 }),
    fc.array(fc.integer({ min: 100, max: 140 }), { maxLength: 80 }),
    fc.constantFrom(null, undefined, 3, "x", {}),
  );
  const groupRecord = fc.oneof(
    fc.record({ id: idLeaf, leader: idLeaf }),
    fc.record({ id: fc.integer({ min: 101, max: 140 }), leader: idLeaf }),
    fc.record({ id: idLeaf, leader: idLeaf, extra: leaf }),
    fc.constantFrom(null, undefined, 3, "x"),
  );
  const groupList = fc.oneof(
    fc.array(groupRecord, { maxLength: 150 }),
    fc.constantFrom(null, undefined, 3, "x", {}),
  );
  const stationArb = fc.oneof(
    fc.record({ alert: leaf, launched: leaf, marks: idList }),
    fc.constantFrom(null, undefined, 3, "x", []),
  );
  const populatorArb = fc.oneof(
    fc.record({ nextTick: leaf, rolls: leaf }),
    fc.constantFrom(null, undefined, 3, "x", []),
  );

  it("never throws, leaves a value the parser accepts, is idempotent and hashes, for any input", () => {
    const player = initFlightState(laveFixture().layout);
    fc.assert(
      fc.property(
        stationArb,
        groupList,
        populatorArb,
        (station, groups, pop) => {
          const world = createWorld(5);
          loose(world).station = station;
          loose(world).groups = groups;
          loose(world).populator = pop;
          expect(() => sanitizeStation(world)).not.toThrow();
          expect(() => sanitizeGroups(world)).not.toThrow();
          expect(() => sanitizePopulator(world)).not.toThrow();
          // The snapshot writer and the strict parser take what is left.
          const text = JSON.stringify(snapshotWorld(world));
          expect(() =>
            parseWorldSnapshot(JSON.parse(text) as unknown),
          ).not.toThrow();
          // A second pass repairs nothing and changes no bit.
          expect(sanitizeStation(world)).toBe(0);
          expect(sanitizeGroups(world)).toBe(0);
          expect(sanitizePopulator(world)).toBe(0);
          expect(JSON.stringify(snapshotWorld(world))).toBe(text);
          // The hash, which repairs on its own, never throws and agrees.
          const hash = hashWorld(player, world);
          expect(hashWorld(player, world)).toBe(hash);
          // A hash of the unrepaired value equals the hash of the repaired one.
          const raw = createWorld(5);
          loose(raw).station = station;
          loose(raw).groups = groups;
          loose(raw).populator = pop;
          expect(() => hashWorld(player, raw)).not.toThrow();
          expect(hashWorld(player, raw)).toBe(hash);
        },
      ),
      { numRuns: 400 },
    );
  });
});
