// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The malformed-input half of `spawnEntity`'s refusal contract (FOUND-16,
 * review IN-02). Input the type system cannot rule out (deserialised data,
 * future script hooks) is refused as `malformed` before any domain check and
 * never throws. Expected values come from the rule: a refusal never moves
 * `store.nextId`, the live array or `world.rng.s`, and the next valid spawn
 * receives the id the counter showed before the refusal.
 */

import { describe, expect, it } from "vitest";

import type { AiComponent } from "../../../src/sim/ai/types.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { MAX_ENTITIES } from "../../../src/sim/world/ids.js";
import { createEntityStore } from "../../../src/sim/world/store.js";
import {
  SPAWN_REFUSALS,
  createWorld,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";

function init(overrides: Record<string, unknown> = {}): SpawnInit {
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

function aiOf(overrides: Record<string, unknown> = {}): AiComponent {
  return {
    aiKey: "test-pilot",
    params: Object.create(null) as AiComponent["params"],
    wakeTick: 0,
    nextThinkTick: 0,
    ...overrides,
  };
}

type Row = readonly [name: string, init: unknown, tick?: unknown];

/** Wrong JS types and nullish values: each must be refused `malformed`. */
const malformedRows: readonly Row[] = [
  ["init null", null],
  ["init undefined", undefined],
  ["init a number", 5],
  ["init a string", "ship"],
  ["init an array", []],
  ["position null", init({ position: null })],
  ["position undefined", init({ position: undefined })],
  ["position a number", init({ position: 5 })],
  ["position x a string", init({ position: { x: "1", y: 0, z: 0 } })],
  ["position y missing", init({ position: { x: 0, z: 0 } })],
  ["position z null", init({ position: { x: 0, y: 0, z: null } })],
  ["orientation null", init({ orientation: null })],
  ["orientation undefined", init({ orientation: undefined })],
  ["orientation a number", init({ orientation: 1 })],
  ["orientation w missing", init({ orientation: { x: 0, y: 0, z: 0 } })],
  [
    "orientation w a string",
    init({ orientation: { w: "1", x: 0, y: 0, z: 0 } }),
  ],
  ["orientation z undefined", init({ orientation: { w: 1, x: 0, y: 0 } })],
  ["specKey a number", init({ specKey: 5 })],
  ["specKey null", init({ specKey: null })],
  ["specKey undefined", init({ specKey: undefined })],
  ["kind a number", init({ kind: 1 })],
  ["kind null", init({ kind: null })],
  ["scanClass a number", init({ scanClass: 1 })],
  ["scanClass null", init({ scanClass: null })],
  ["radius a string", init({ radius: "50" })],
  ["radius null", init({ radius: null })],
  ["radius undefined", init({ radius: undefined })],
  ["speed a string", init({ speed: "10" })],
  ["speed null", init({ speed: null })],
  ["ownerId a string", init({ ownerId: "101" })],
  ["ownerId null", init({ ownerId: null })],
  ["ai a number", init({ ai: 5 })],
  ["ai a string", init({ ai: "test-pilot" })],
  ["ai an array", init({ ai: [] })],
  ["ai.params null", init({ ai: aiOf({ params: null }) })],
  ["ai.params undefined", init({ ai: aiOf({ params: undefined }) })],
  ["ai.params an array", init({ ai: aiOf({ params: [] }) })],
  ["ai.params a number", init({ ai: aiOf({ params: 1 }) })],
  ["ai.aiKey a number", init({ ai: aiOf({ aiKey: 5 }) })],
  ["ai.aiKey undefined", init({ ai: aiOf({ aiKey: undefined }) })],
  ["ai.wakeTick a string", init({ ai: aiOf({ wakeTick: "0" }) })],
  [
    "ai.nextThinkTick undefined",
    init({ ai: aiOf({ nextThinkTick: undefined }) }),
  ],
  ["tick a string", init(), "0"],
  ["tick null", init(), null],
  ["tick undefined", init(), undefined],
  ["tick an object", init(), {}],
  // Malformed wins over a domain violation in another field.
  ["radius 0 with position null", init({ radius: 0, position: null })],
  ["tick -1 with specKey null", init({ specKey: null }), -1],
  [
    "unknown aiKey with params null",
    init({ ai: aiOf({ aiKey: "x", params: null }) }),
  ],
];

/** The rows with the tick made explicit: absent means tick 0, `undefined` is kept. */
const malformedCases: readonly (readonly [string, unknown, unknown])[] =
  malformedRows.map(([name, value, ...rest]) => [
    name,
    value,
    rest.length > 0 ? rest[0] : 0,
  ]);

/** Right types, outside the shared serialised domain: the old reasons stay. */
const domainRows: readonly [string, unknown, unknown, "outOfDomain" | "ai"][] =
  [
    ["tick -1", init(), -1, "outOfDomain"],
    ["tick 2 ** 32", init(), 2 ** 32, "outOfDomain"],
    ["tick NaN", init(), Number.NaN, "outOfDomain"],
    ["radius 0", init({ radius: 0 }), 0, "outOfDomain"],
    ["radius NaN", init({ radius: Number.NaN }), 0, "outOfDomain"],
    ["specKey empty", init({ specKey: "" }), 0, "outOfDomain"],
    ["kind unknown", init({ kind: "constructor" }), 0, "outOfDomain"],
    ["scanClass unknown", init({ scanClass: "__proto__" }), 0, "outOfDomain"],
    [
      "position NaN",
      init({ position: vec(Number.NaN, 0, 0) }),
      0,
      "outOfDomain",
    ],
    ["speed negative", init({ speed: -1 }), 0, "outOfDomain"],
    ["ownerId 1.5", init({ ownerId: 1.5 }), 0, "outOfDomain"],
    ["unknown aiKey", init({ ai: aiOf({ aiKey: "trader" }) }), 0, "ai"],
    [
      "prototype-named param key",
      init({ ai: aiOf({ params: JSON.parse('{"__proto__": 1}') as object }) }),
      0,
      "ai",
    ],
    ["wakeTick -1", init({ ai: aiOf({ wakeTick: -1 }) }), 0, "ai"],
  ];

function snapshot(world: World) {
  return {
    nextId: world.store.nextId,
    live: world.store.live.length,
    stream: world.rng.s,
  };
}

/** Refuse `init` and prove nothing moved and the next spawn takes the old id. */
function expectRefusal(
  world: World,
  value: unknown,
  tick: unknown,
  reason: string,
): void {
  const before = snapshot(world);
  let result: ReturnType<typeof spawnEntity> | undefined;
  expect(() => {
    result = spawnEntity(world, value as SpawnInit, tick as number);
  }).not.toThrow();
  expect(result).toEqual({ ok: false, reason });
  expect(snapshot(world)).toEqual(before);
  const next = spawnEntity(world, init(), 0);
  expect(next.ok && next.entity.id).toBe(before.nextId);
}

describe("spawnEntity refuses malformed input (FOUND-16)", () => {
  it("lists malformed in the closed refusal vocabulary", () => {
    expect(SPAWN_REFUSALS).toContain("malformed");
  });

  it.each(malformedCases)(
    "%s is malformed: no throw, counter, live array and stream unchanged",
    (_name, value, tick) => {
      expectRefusal(createWorld(1), value, tick, "malformed");
    },
  );

  it.each(domainRows)(
    "right types, %s keeps its domain reason",
    (_name, value, tick, reason) => {
      expectRefusal(createWorld(1), value, tick, reason);
    },
  );

  it("every malformed row in a row leaves a world with live entities untouched", () => {
    const world = createWorld(1);
    for (let i = 0; i < 3; i += 1) spawnEntity(world, init(), 0);
    const before = snapshot(world);
    expect(before.nextId).toBe(104);
    for (const [, value, tick] of malformedCases) {
      expect(spawnEntity(world, value as SpawnInit, tick as number)).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
    expect(snapshot(world)).toEqual(before);
  });

  it("malformed wins over a spent counter and over a full store", () => {
    const full = createWorld(1);
    for (let i = 0; i < MAX_ENTITIES; i += 1) spawnEntity(full, init(), 0);
    const spent: World = {
      ...createWorld(1),
      store: createEntityStore({ nextId: 2 ** 32, entities: [] }),
    };
    for (const world of [full, spent]) {
      const before = snapshot(world);
      expect(spawnEntity(world, init({ position: null }), 0)).toEqual({
        ok: false,
        reason: "malformed",
      });
      expect(snapshot(world)).toEqual(before);
    }
  });

  it("a well-formed init still spawns, with and without an AI", () => {
    const world = createWorld(1);
    const plain = spawnEntity(world, init(), 0);
    const piloted = spawnEntity(world, init({ ai: aiOf() }), 0);
    const nulled = spawnEntity(world, init({ ai: null }), 0);
    expect(plain.ok && plain.entity.id).toBe(101);
    expect(piloted.ok && piloted.entity.ai?.aiKey).toBe("test-pilot");
    expect(nulled.ok && nulled.entity.ai).toBeNull();
  });

  it("the 257th live spawn is still storeFull, not malformed", () => {
    const world = createWorld(1);
    for (let i = 0; i < MAX_ENTITIES; i += 1) spawnEntity(world, init(), 0);
    const before = snapshot(world);
    expect(spawnEntity(world, init(), 0)).toEqual({
      ok: false,
      reason: "storeFull",
    });
    expect(snapshot(world)).toEqual(before);
  });
});
