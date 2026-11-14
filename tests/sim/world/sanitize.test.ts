// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `sanitizeEntity` (FOUND-11, FOUND-12, T-08-21, T-08-44). One table pins, per
 * row, the corrupt input, the repaired output, the return value and the
 * `repairs` delta, and a second call that must return false and change no bit.
 * Expected values come from the rules of plan 08-11 (shared limits, repair
 * versus normalisation), never from running the code under test.
 */

import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import type { AiComponent, AiKey } from "../../../src/sim/ai/types.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import {
  MAX_AI_PARAMS_KEYS,
  MAX_ENTITY_MAGNITUDE,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_UINT32,
  QUAT_UNIT_TOLERANCE,
} from "../../../src/sim/world/limits.js";
import { sanitizeEntity } from "../../../src/sim/world/sanitize.js";
import { serializeEntity } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";

/** A clean entity with a test-pilot AI, from the real spawn path. */
function fresh(): Entity {
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
