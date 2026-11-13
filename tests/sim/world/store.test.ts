// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Store, spawn and stream invariants of the world core (FOUND-11, D-04, D-06,
 * D-07). Expected values come from the rules (monotonic never-reused ids,
 * strictly ascending live array, the MAX_ENTITIES cap on non-dead entities,
 * streams forked from (worldSeed, id, purpose)), never from running the code
 * under test.
 */

import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { AiComponent, ParamValue } from "../../../src/sim/ai/types.js";
import { identity, vec } from "../../../src/sim/math.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import {
  FIRST_DYNAMIC_ID,
  MAX_ENTITIES,
  NO_ENTITY,
  PLAYER_ID,
} from "../../../src/sim/world/ids.js";
import {
  MAX_AI_PARAMS_KEYS,
  MAX_ENTITY_MAGNITUDE,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_UINT32,
  MIN_QUAT_NORM_SQ,
  QUAT_UNIT_TOLERANCE,
} from "../../../src/sim/world/limits.js";
import {
  entityHashes,
  hashWorld,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import { createEntityStore } from "../../../src/sim/world/store.js";
import {
  STATIC_ENTITIES,
  commitWorld,
  createWorld,
  isNeverSpawned,
  killEntity,
  liveEntityCount,
  spawnEntity,
  staticEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { laveFixture } from "../../helpers/lave.js";

function init(overrides: Partial<SpawnInit> = {}): SpawnInit {
  return {
    kind: "ship",
    specKey: "viper",
    scanClass: "CLASS_POLICE",
    position: vec(100, 200, 300),
    orientation: identity(),
    radius: 50,
    speed: 10,
    ...overrides,
  };
}

function aiWith(
  params: Record<string, ParamValue>,
  extra: Partial<AiComponent> = {},
): AiComponent {
  return {
    aiKey: "test-pilot",
    params,
    wakeTick: 0,
    nextThinkTick: 0,
    ...extra,
  };
}

function spawnOk(world: World, overrides: Partial<SpawnInit> = {}, tick = 0) {
  const entity = spawnEntity(world, init(overrides), tick);
  if (entity === undefined) throw new Error("spawn refused");
  return entity;
}

describe("ids, order, kill and commit", () => {
  it("issues 101, 102, 103 in order and keeps live strictly ascending", () => {
    const world = createWorld(1);
    const ids = Array.from({ length: 3 }, () => spawnOk(world).id);
    expect(ids).toEqual([101, 102, 103]);
    expect(world.store.live.map((e) => e.id)).toEqual([101, 102, 103]);
  });

  it("kill then commit removes the entity; its id is never issued again", () => {
    const world = createWorld(1);
    for (let i = 0; i < 3; i += 1) spawnOk(world);
    expect(killEntity(world, 102)).toBe(true);
    expect(world.store.get(102)).toBeUndefined();
    expect(commitWorld(world)).toEqual([102]);
    expect(world.store.get(102)).toBeUndefined();
    expect(spawnOk(world).id).toBe(104);
    expect(world.store.live.map((e) => e.id)).toEqual([101, 103, 104]);
  });

  it("killing the highest id and committing still never reuses it", () => {
    const world = createWorld(1);
    for (let i = 0; i < 3; i += 1) spawnOk(world);
    killEntity(world, 103);
    commitWorld(world);
    expect(world.store.nextId).toBe(104);
    expect(spawnOk(world).id).toBe(104);
  });

  it("an entity spawned this tick is in live immediately and get finds it", () => {
    const world = createWorld(1);
    const entity = spawnOk(world, {}, 5);
    expect(world.store.live).toContain(entity);
    expect(world.store.get(entity.id)).toBe(entity);
    expect(entity.spawnTick).toBe(5);
  });

  it("commit reports removed ids ascending and kill of a missing or dead id is false", () => {
    const world = createWorld(1);
    for (let i = 0; i < 5; i += 1) spawnOk(world);
    expect(killEntity(world, 104)).toBe(true);
    expect(killEntity(world, 101)).toBe(true);
    expect(killEntity(world, 104)).toBe(false);
    expect(killEntity(world, 999)).toBe(false);
    expect(killEntity(world, NO_ENTITY)).toBe(false);
    expect(commitWorld(world)).toEqual([101, 104]);
    expect(commitWorld(world)).toEqual([]);
  });

  it("the store holds dynamic entities only", () => {
    const world = createWorld(1);
    spawnOk(world);
    for (const id of [NO_ENTITY, 1, 2, 3, 4, 5, 6, 99, PLAYER_ID, 99999]) {
      expect(world.store.get(id)).toBeUndefined();
    }
    expect(world.store.get(101)).toBeDefined();
  });
});

describe("the MAX_ENTITIES cap and the uint32 id ceiling", () => {
  it("refuses the 257th non-dead spawn and leaves nextId unchanged", () => {
    const world = createWorld(1);
    for (let i = 0; i < MAX_ENTITIES; i += 1) spawnOk(world);
    const before = world.store.nextId;
    expect(before).toBe(FIRST_DYNAMIC_ID + MAX_ENTITIES);
    expect(spawnEntity(world, init(), 0)).toBeUndefined();
    expect(world.store.nextId).toBe(before);
  });

  it("killing before commit frees non-dead slots at once", () => {
    const world = createWorld(1);
    for (let i = 0; i < MAX_ENTITIES; i += 1) spawnOk(world);
    for (const id of [101, 150, 200]) killEntity(world, id);
    expect(liveEntityCount(world)).toBe(MAX_ENTITIES - 3);
    for (let i = 0; i < 3; i += 1) expect(spawnOk(world)).toBeDefined();
    expect(world.store.live).toHaveLength(MAX_ENTITIES + 3);
    expect(liveEntityCount(world)).toBe(MAX_ENTITIES);
    const before = world.store.nextId;
    expect(spawnEntity(world, init(), 0)).toBeUndefined();
    expect(world.store.nextId).toBe(before);
  });

  it("allocate refuses at nextId 2 ** 32 and leaves it unchanged", () => {
    const store = createEntityStore({ nextId: 2 ** 32, entities: [] });
    const made = store.allocate(() => {
      throw new Error("make must not be called");
    });
    expect(made).toBeUndefined();
    expect(store.nextId).toBe(2 ** 32);
  });

  it("allocate issues 0xffffffff, then refuses", () => {
    const store = createEntityStore({ nextId: MAX_UINT32, entities: [] });
    const proto = spawnOk(createWorld(1));
    const entity = store.allocate((id) => ({ ...proto, id }));
    expect(entity?.id).toBe(MAX_UINT32);
    expect(store.nextId).toBe(2 ** 32);
    expect(store.allocate((id) => ({ ...proto, id }))).toBeUndefined();
  });

  it("allocate refuses a counter that is not a safe integer", () => {
    const store = createEntityStore({ nextId: Number.NaN, entities: [] });
    expect(store.allocate(() => spawnOk(createWorld(1)))).toBeUndefined();
  });

  it("a restored store must be strictly ascending and below nextId", () => {
    const a = spawnOk(createWorld(1));
    const world = createWorld(1);
    spawnOk(world);
    const b = spawnOk(world);
    expect(() => createEntityStore({ nextId: 105, entities: [b, a] })).toThrow(
      RangeError,
    );
    expect(() => createEntityStore({ nextId: 102, entities: [a, b] })).toThrow(
      RangeError,
    );
    const ok = createEntityStore({ nextId: 103, entities: [a, b] });
    expect(ok.get(102)).toBe(b);
    expect(ok.nextId).toBe(103);
  });
});

describe("spawn validation (shared serialised domain)", () => {
  const refused: [string, Partial<SpawnInit>, number][] = [
    ["radius 0", { radius: 0 }, 0],
    ["radius negative", { radius: -1 }, 0],
    ["radius NaN", { radius: Number.NaN }, 0],
    ["radius Infinity", { radius: Number.POSITIVE_INFINITY }, 0],
    ["radius 1e13", { radius: 1e13 }, 0],
    ["tick -1", {}, -1],
    ["tick 1.5", {}, 1.5],
    ["tick 2 ** 32", {}, 2 ** 32],
    ["ownerId -1", { ownerId: -1 }, 0],
    ["ownerId 1.5", { ownerId: 1.5 }, 0],
    ["ownerId 2 ** 32", { ownerId: 2 ** 32 }, 0],
    ["specKey empty", { specKey: "" }, 0],
    ["specKey 129 chars", { specKey: "x".repeat(129) }, 0],
    ["speed negative", { speed: -1 }, 0],
    ["speed NaN", { speed: Number.NaN }, 0],
    ["speed 1e13", { speed: 1e13 }, 0],
    ["position NaN", { position: vec(Number.NaN, 0, 0) }, 0],
    ["position 1e13", { position: vec(0, 1e13, 0) }, 0],
    ["position -Infinity", { position: vec(0, 0, -Infinity) }, 0],
    [
      "orientation NaN",
      { orientation: { w: 1, x: Number.NaN, y: 0, z: 0 } },
      0,
    ],
    ["orientation zero", { orientation: { w: 0, x: 0, y: 0, z: 0 } }, 0],
    [
      "orientation w 2 (non-unit)",
      { orientation: { w: 2, x: 0, y: 0, z: 0 } },
      0,
    ],
    [
      "orientation subnormal norm 1e-160",
      { orientation: { w: 1e-160, x: 0, y: 0, z: 0 } },
      0,
    ],
    [
      "orientation squared norm overflows",
      { orientation: { w: 1e200, x: 1e200, y: 0, z: 0 } },
      0,
    ],
    ["kind planet", { kind: "planet" as SpawnInit["kind"] }, 0],
    ["kind bogus", { kind: "bogus" as SpawnInit["kind"] }, 0],
    ["kind constructor", { kind: "constructor" as SpawnInit["kind"] }, 0],
    [
      "scanClass CLASS_FOO",
      { scanClass: "CLASS_FOO" as SpawnInit["scanClass"] },
      0,
    ],
    [
      "scanClass toString",
      { scanClass: "toString" as SpawnInit["scanClass"] },
      0,
    ],
    [
      "aiKey trader",
      { ai: aiWith({}, { aiKey: "trader" as AiComponent["aiKey"] }) },
      0,
    ],
    [
      'aiKey "constructor"',
      { ai: aiWith({}, { aiKey: "constructor" as AiComponent["aiKey"] }) },
      0,
    ],
    [
      'aiKey "toString"',
      { ai: aiWith({}, { aiKey: "toString" as AiComponent["aiKey"] }) },
      0,
    ],
    ["wakeTick 2 ** 32", { ai: aiWith({}, { wakeTick: 2 ** 32 }) }, 0],
    ["wakeTick 1.5", { ai: aiWith({}, { wakeTick: 1.5 }) }, 0],
    ["nextThinkTick -1", { ai: aiWith({}, { nextThinkTick: -1 }) }, 0],
    [
      "33 param keys",
      {
        ai: aiWith(
          Object.fromEntries(
            Array.from({ length: MAX_AI_PARAMS_KEYS + 1 }, (_, i) => [
              `k${i}`,
              i,
            ]),
          ),
        ),
      },
      0,
    ],
    [
      "65-element param array",
      {
        ai: aiWith({
          a: Array.from({ length: MAX_SNAPSHOT_PARAM_LENGTH + 1 }, () => 1),
        }),
      },
      0,
    ],
    ["param array holding null", { ai: aiWith({ a: [1, null as never] }) }, 0],
    ["param array holding true", { ai: aiWith({ a: [true as never] }) }, 0],
    [
      "param array holding a nested array",
      { ai: aiWith({ a: [[1] as never] }) },
      0,
    ],
    ["param array holding NaN", { ai: aiWith({ a: [Number.NaN] }) }, 0],
    [
      "param array holding a 129-char string",
      { ai: aiWith({ a: ["x".repeat(129)] }) },
      0,
    ],
    ["param NaN", { ai: aiWith({ a: Number.NaN }) }, 0],
    ["param Infinity", { ai: aiWith({ a: Number.POSITIVE_INFINITY }) }, 0],
    ["param 1e13", { ai: aiWith({ a: 1e13 }) }, 0],
    ["param string of 129 chars", { ai: aiWith({ a: "x".repeat(129) }) }, 0],
    ["param nested object", { ai: aiWith({ a: {} as never }) }, 0],
    ["param undefined", { ai: aiWith({ a: undefined as never }) }, 0],
    ["empty param key", { ai: aiWith({ "": 1 }) }, 0],
    ["129-char param key", { ai: aiWith({ ["k".repeat(129)]: 1 }) }, 0],
    ['param key "constructor"', { ai: aiWith({ constructor: 1 }) }, 0],
    ['param key "prototype"', { ai: aiWith({ prototype: 1 }) }, 0],
    [
      'param key "__proto__" as an own key',
      {
        ai: aiWith(
          JSON.parse('{"__proto__": 1}') as Record<string, ParamValue>,
        ),
      },
      0,
    ],
  ];

  it.each(refused)(
    "refuses %s and leaves nextId unchanged",
    (_, over, tick) => {
      const world = createWorld(1);
      expect(spawnEntity(world, init(over), tick)).toBeUndefined();
      expect(world.store.nextId).toBe(FIRST_DYNAMIC_ID);
      expect(world.store.live).toHaveLength(0);
      expect(isNeverSpawned(world)).toBe(true);
    },
  );

  it("accepts every boundary value", () => {
    const world = createWorld(1);
    const params: Record<string, ParamValue> = {};
    for (let i = 0; i < MAX_AI_PARAMS_KEYS; i += 1) params[`k${i}`] = i;
    params.k0 = Array.from({ length: MAX_SNAPSHOT_PARAM_LENGTH }, () => 1);
    params.k1 = "x".repeat(MAX_SNAPSHOT_STRING_LENGTH);
    params.k2 = MAX_ENTITY_MAGNITUDE;
    const entity = spawnEntity(
      world,
      init({
        specKey: "s".repeat(MAX_SNAPSHOT_STRING_LENGTH),
        radius: MAX_ENTITY_MAGNITUDE,
        speed: MAX_ENTITY_MAGNITUDE,
        ownerId: MAX_UINT32,
        position: vec(
          MAX_ENTITY_MAGNITUDE,
          -MAX_ENTITY_MAGNITUDE,
          MAX_ENTITY_MAGNITUDE,
        ),
        ai: aiWith(params, { wakeTick: MAX_UINT32, nextThinkTick: MAX_UINT32 }),
      }),
      MAX_UINT32,
    );
    expect(entity?.id).toBe(FIRST_DYNAMIC_ID);
    expect(Object.keys(entity?.ai?.params ?? {})).toHaveLength(
      MAX_AI_PARAMS_KEYS,
    );
  });

  it("accepts a near-unit orientation and null, boolean and mixed array params", () => {
    const world = createWorld(1);
    const orientation = { w: 1 + 2.5e-10, x: 0, y: 0, z: 0 };
    const params = {
      a: null,
      b: true,
      c: false,
      d: 1,
      e: "s",
      f: [1, "x"],
    } satisfies Record<string, ParamValue>;
    const entity = spawnOk(world, { orientation, ai: aiWith(params) });
    expect(entity.orientation).toEqual(orientation);
    expect({ ...entity.ai?.params }).toEqual(params);
  });

  it("copies params and vectors, so the caller cannot alias entity state", () => {
    const world = createWorld(1);
    const array = [1, 2];
    const position = vec(1, 2, 3);
    const spec = init({ position, ai: aiWith({ f: array }) });
    const entity = spawnEntity(world, spec, 0);
    array.push(3);
    expect(entity?.ai?.params.f).toEqual([1, 2]);
    expect(entity?.position).toEqual(position);
    expect(entity?.position).not.toBe(position);
    expect(entity?.nav.destination).toEqual(position);
    expect(entity?.nav.destination).not.toBe(entity?.position);
    expect(Object.getPrototypeOf(entity?.ai?.params)).toBeNull();
  });

  it("defaults speed, ownerId, ai and nav", () => {
    const world = createWorld(1);
    const entity = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(100, 200, 300),
        orientation: identity(),
        radius: 50,
      },
      0,
    );
    if (entity === undefined) throw new Error("spawn refused");
    expect(entity.speed).toBe(0);
    expect(entity.ownerId).toBe(NO_ENTITY);
    expect(entity.ai).toBeNull();
    expect(entity.dead).toBe(false);
    expect(entity.repairs).toBe(0);
    expect(entity.nav).toEqual({
      behaviour: "IDLE",
      targetId: NO_ENTITY,
      destination: entity.position,
      desiredRange: 0,
      desiredSpeed: 0,
    });
    const fast = spawnOk(world, { speed: 7, ownerId: 100, ai: null });
    expect(fast.nav.desiredSpeed).toBe(7);
    expect(fast.ownerId).toBe(100);
  });
});

describe("createWorld seed and the shared limits", () => {
  it.each([1.5, -1, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY])(
    "createWorld(%s) throws a RangeError naming worldSeed",
    (seed) => {
      expect(() => createWorld(seed)).toThrow(RangeError);
      expect(() => createWorld(seed)).toThrow(/worldSeed/);
    },
  );

  it("accepts the ends of the uint32 range", () => {
    expect(createWorld(0).worldSeed).toBe(0);
    expect(createWorld(0xffffffff).worldSeed).toBe(0xffffffff);
  });

  it("holds the limit values (a change is a snapshot-format change)", () => {
    expect(MAX_ENTITY_MAGNITUDE).toBe(1e12);
    expect(MAX_SNAPSHOT_STRING_LENGTH).toBe(128);
    expect(MAX_SNAPSHOT_PARAM_LENGTH).toBe(64);
    expect(MAX_AI_PARAMS_KEYS).toBe(32);
    expect(MAX_UINT32).toBe(0xffffffff);
    expect(QUAT_UNIT_TOLERANCE).toBe(1e-9);
    expect(MIN_QUAT_NORM_SQ).toBe(1e-12);
  });

  it("drawing from world.rng flips the predicate and emits the world lines", () => {
    const world = createWorld(21);
    expect(isNeverSpawned(world)).toBe(true);
    expect(serializeWorldSection(world)).toBe("");
    rngNext(world.rng);
    expect(isNeverSpawned(world)).toBe(false);
    expect(serializeWorldSection(world)).toBe(
      `worldSeed=21\nnextId=101\nrng=${world.rng.s}\naiDropped=0`,
    );
  });
});

describe("static entities (D-07)", () => {
  it("STATIC_ENTITIES and every record are frozen", () => {
    expect(Object.isFrozen(STATIC_ENTITIES)).toBe(true);
    expect(STATIC_ENTITIES.every((s) => Object.isFrozen(s))).toBe(true);
  });

  it("staticEntity resolves ids 1-5 only", () => {
    const world = createWorld(1);
    expect(staticEntity(world, 4)?.layoutKey).toBe("witchpoint");
    expect(staticEntity(world, 5)?.layoutKey).toBe("navBuoy");
    expect(staticEntity(world, 1)?.kind).toBe("planet");
    for (const id of [0, 6, 99, 100, 101, -1, 1.5, Number.NaN]) {
      expect(staticEntity(world, id)).toBeUndefined();
    }
  });

  it("spawn, kill and commit never change world.statics", () => {
    const world = createWorld(1);
    const before = [...world.statics];
    spawnOk(world);
    killEntity(world, 101);
    commitWorld(world);
    expect(world.statics).toBe(STATIC_ENTITIES);
    expect([...world.statics]).toEqual(before);
  });
});

describe("per-stream fork isolation (D-04)", () => {
  const draws = (state: number): number[] => {
    const stream = createRngState(state);
    return Array.from({ length: 10 }, () => rngNext(stream));
  };

  it("an entity's streams do not depend on other entities coming and going", () => {
    const solo = createWorld(77);
    const a1 = spawnOk(solo);

    const busy = createWorld(77);
    const a2 = spawnOk(busy);
    const b = spawnOk(busy, { specKey: "b" });
    killEntity(busy, b.id);
    commitWorld(busy);

    expect(a2.id).toBe(a1.id);
    expect(a2.rng).toEqual(a1.rng);
    expect(draws(a2.rng.ai)).toEqual(draws(a1.rng.ai));
    expect(draws(a2.rng.combat)).toEqual(draws(a1.rng.combat));
    expect(a1.rng.ai).not.toBe(a1.rng.combat);
    expect(draws(a1.rng.ai)).not.toEqual(draws(a1.rng.combat));
    expect(Number.isInteger(a1.rng.ai) && a1.rng.ai >= 0).toBe(true);
    expect(b.rng).not.toEqual(a2.rng);
  });
});

describe("property: ids over spawn, kill and commit", () => {
  const command = fc.oneof(
    { weight: 4, arbitrary: fc.constant({ type: "spawn" as const }) },
    {
      weight: 2,
      arbitrary: fc.record({
        type: fc.constant("kill" as const),
        pick: fc.nat(400),
        byIndex: fc.boolean(),
      }),
    },
    { weight: 1, arbitrary: fc.constant({ type: "commit" as const }) },
  );

  it("never reuses an id, keeps live ascending and respects the cap", () => {
    fc.assert(
      fc.property(fc.array(command, { maxLength: 700 }), (commands) => {
        const world = createWorld(5);
        const issued = new Set<number>();
        const violations: string[] = [];
        let highest = 0;
        for (const c of commands) {
          if (c.type === "spawn") {
            const entity = spawnEntity(world, init(), 0);
            if (entity !== undefined) {
              if (issued.has(entity.id)) violations.push(`reused ${entity.id}`);
              if (entity.id <= highest) violations.push(`not above ${highest}`);
              if (world.store.nextId <= entity.id) violations.push("nextId");
              issued.add(entity.id);
              highest = entity.id;
            }
          } else if (c.type === "kill") {
            const live = world.store.live;
            const id =
              c.byIndex && live.length > 0
                ? (live[c.pick % live.length]?.id ?? NO_ENTITY)
                : c.pick;
            killEntity(world, id);
          } else {
            commitWorld(world);
          }
          const ids = world.store.live.map((e) => e.id);
          if (ids.some((id, i) => i > 0 && id <= (ids[i - 1] as number))) {
            violations.push("live not strictly ascending");
          }
          if (liveEntityCount(world) > MAX_ENTITIES) violations.push("cap");
        }
        expect(violations).toEqual([]);
        expect(world.store.nextId).toBeLessThanOrEqual(
          FIRST_DYNAMIC_ID + commands.length,
        );
        expect(world.store.nextId).toBeLessThanOrEqual(MAX_UINT32);
        expect(world.store.nextId).toBe(FIRST_DYNAMIC_ID + issued.size);
      }),
      { numRuns: 200 },
    );
  });
});

describe("per-world id scope (CONTEXT D-06 as amended 2026-11-12)", () => {
  it("a fresh world restarts dynamic ids at 101, even after another world spawned", () => {
    const first = createWorld(1);
    for (let i = 0; i < 50; i += 1) spawnOk(first);
    expect(first.store.nextId).toBe(151);
    const second = createWorld(2);
    expect(second.store.nextId).toBe(FIRST_DYNAMIC_ID);
    expect(spawnOk(second).id).toBe(101);
    const third = createWorld(1);
    expect(spawnOk(third).id).toBe(101);
    expect(first.store.nextId).toBe(151);
  });

  it("two worlds of one seed issue the same id sequence", () => {
    const a = createWorld(9);
    const b = createWorld(9);
    const idsOf = (w: World): number[] => [1, 2, 3].map(() => spawnOk(w).id);
    expect(idsOf(a)).toEqual([101, 102, 103]);
    expect(idsOf(b)).toEqual([101, 102, 103]);
  });

  it("spawning, killing and committing in one world leaves the other alone", () => {
    const a = createWorld(1);
    const b = createWorld(1);
    spawnOk(b);
    spawnOk(a);
    spawnOk(a);
    killEntity(a, 101);
    commitWorld(a);
    expect(b.store.nextId).toBe(102);
    expect(b.store.live.map((e) => e.id)).toEqual([101]);
  });

  it("store.ts, world.ts and serialize.ts hold no module-level mutable binding", () => {
    for (const file of ["store.ts", "world.ts", "serialize.ts"]) {
      const source = readFileSync(
        new URL(`../../../src/sim/world/${file}`, import.meta.url),
        "utf8",
      );
      expect(source).not.toMatch(/^(export )?(let|var) /m);
    }
  });
});

describe("per-world hash identity (RESEARCH Pattern 5)", () => {
  const player = initFlightState(laveFixture().layout);

  it("two worlds of different seeds that both hold id 101 hash differently", () => {
    const a = createWorld(1);
    const b = createWorld(2);
    const ea = spawnOk(a, {}, 4);
    const eb = spawnOk(b, {}, 4);
    expect(ea.id).toBe(101);
    expect(eb.id).toBe(101);
    expect(hashWorld(player, a)).not.toBe(hashWorld(player, b));
    const lineOf = (w: World): string | undefined =>
      serializeWorldSection(w)
        .split("\n")
        .find((line) => line.startsWith("worldSeed="));
    expect(lineOf(a)).toBe("worldSeed=1");
    expect(lineOf(b)).toBe("worldSeed=2");
    expect(ea.rng.ai).not.toBe(eb.rng.ai);
  });

  it("the same seed and the same spawns hash identically (D-02)", () => {
    const a = createWorld(3);
    const b = createWorld(3);
    spawnOk(a, {}, 4);
    spawnOk(b, {}, 4);
    expect(hashWorld(player, a)).toBe(hashWorld(player, b));
  });
});

describe("entityHashes", () => {
  it("lists ascending ids and changes only for the entity whose field changed", () => {
    const world = createWorld(4);
    for (let i = 0; i < 3; i += 1) spawnOk(world);
    const before = entityHashes(world);
    expect(before.map(([id]) => id)).toEqual([101, 102, 103]);
    const second = world.store.get(102);
    if (second === undefined) throw new Error("missing");
    second.speed += 1;
    const after = entityHashes(world);
    expect(after.map(([id]) => id)).toEqual([101, 102, 103]);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]?.[1]).not.toBe(before[1]?.[1]);
    expect(after[2]).toEqual(before[2]);
  });

  it("omits an entity killed before commit", () => {
    const world = createWorld(4);
    spawnOk(world);
    spawnOk(world);
    killEntity(world, 101);
    expect(entityHashes(world).map(([id]) => id)).toEqual([102]);
    expect(serializeWorldSection(world)).not.toMatch(/^e101=/m);
  });
});
