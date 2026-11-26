// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The priority-AI state shape (FOUND-20, plan 21-07): the `"priority"` key is
 * registered inert, its `params` key list is pinned under the snapshot limits,
 * and the largest shape of every key round-trips through the v5 snapshot, so
 * Phase 23's state needs no second bump (pitfall C2).
 *
 * The test imports both sides: `src/sim/ai` may not import `world/limits` (the
 * AI lint zone), so the cross-check between `PRIORITY_PARAM_KEYS` and the
 * limits lives here. Expected values come from the rules in `limits.ts`, never
 * from running the code under test.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  PRIORITY_PARAM_KEYS,
  PRIORITY_PARAM_SOURCES,
  priorityAi,
} from "../../../src/sim/ai/priority.js";
import type { PriorityParamKey } from "../../../src/sim/ai/priority.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import { AI_EVENT_NAMES, AI_KEYS } from "../../../src/sim/ai/types.js";
import type {
  AiComponent,
  AiContext,
  ParamValue,
} from "../../../src/sim/ai/types.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import {
  MAX_AI_PARAMS_KEYS,
  MAX_ENTITY_MAGNITUDE,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
} from "../../../src/sim/world/limits.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import {
  commitWorld,
  createWorld,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

/** The budget the plan sets: 4 keys spare under the limit of 32. */
const MAX_PRIORITY_PARAM_KEYS = MAX_AI_PARAMS_KEYS - 4;

// ---------------------------------------------------------------------------
// The key list

describe("PRIORITY_PARAM_KEYS", () => {
  it("is frozen and holds no duplicate", () => {
    expect(Object.isFrozen(PRIORITY_PARAM_KEYS)).toBe(true);
    expect(new Set(PRIORITY_PARAM_KEYS).size).toBe(PRIORITY_PARAM_KEYS.length);
  });

  it("holds at most 28 keys, 4 spare under MAX_AI_PARAMS_KEYS", () => {
    expect(MAX_PRIORITY_PARAM_KEYS).toBe(28);
    expect(PRIORITY_PARAM_KEYS.length).toBeLessThanOrEqual(
      MAX_PRIORITY_PARAM_KEYS,
    );
    expect(PRIORITY_PARAM_KEYS.length).toBeLessThanOrEqual(MAX_AI_PARAMS_KEYS);
  });

  it("is not vacuous: it covers the state Phase 23 needs", () => {
    // The Oolite cargo-demand values (the `oolite_intership` record the
    // priority AI writes at run time) have a home (hand-off from plan 21-03).
    for (const key of ["tree", "beh", "hs", "cd", "dist", "ws"]) {
      expect(PRIORITY_PARAM_KEYS as readonly string[]).toContain(key);
    }
    expect(PRIORITY_PARAM_KEYS.length).toBeGreaterThanOrEqual(20);
  });

  it("documents every key with its Oolite source, and nothing else", () => {
    const documented = Object.keys(PRIORITY_PARAM_SOURCES).sort();
    expect(documented).toEqual([...PRIORITY_PARAM_KEYS].sort());
    for (const key of PRIORITY_PARAM_KEYS) {
      const entry = PRIORITY_PARAM_SOURCES[key];
      expect(entry.oolite.trim().length, key).toBeGreaterThanOrEqual(10);
    }
  });

  it("keeps every key a legal params key (non-empty, within the string limit)", () => {
    for (const key of PRIORITY_PARAM_KEYS) {
      expect(key.length).toBeGreaterThan(0);
      expect(key.length).toBeLessThanOrEqual(MAX_SNAPSHOT_STRING_LENGTH);
      expect(["__proto__", "constructor", "prototype"]).not.toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// The registered module

describe("the priority AI module", () => {
  it("is a registered AI key with an inert module and no onEvent", () => {
    expect(AI_KEYS).toEqual(["test-pilot", "flight-script", "priority"]);
    expect(AI_REGISTRY.priority).toBe(priorityAi);
    expect(typeof AI_REGISTRY.priority.think).toBe("function");
    expect(AI_REGISTRY.priority.onEvent).toBeUndefined();
    expect(Object.isFrozen(AI_REGISTRY.priority)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The event vocabulary

/** The 23 names before plan 21-07, in their order: never renamed or reordered. */
const PREVIOUS_EVENT_NAMES = [
  "shipAttacked",
  "shipAttackedOther",
  "shipAttackedWithMissile",
  "shipBeingAttackedUnsuccessfully",
  "shipTargetLost",
  "shipTargetDestroyed",
  "shipKilledOther",
  "shipFiredMissile",
  "cascadeWeaponDetected",
  "shipAchievedDesiredRange",
  "shipCloseContact",
  "shipLaunchedEscapePod",
  "shipScoopedOther",
  "shipWasScooped",
  "shipDockedWithStation",
  "shipLaunchedFromStation",
  "shipEnteredPlanetaryVicinity",
  "shipEnteredStationAegis",
  "offenceCommittedNearby",
  "distressMessageReceived",
  "helpRequestReceived",
  "shipNowFacingDestination",
  "shipAIFrustrated",
];

/** The 13 names plan 21-07 appends (the priority AI's handler names). */
const APPENDED_EVENT_NAMES = [
  "approachingPlanetSurface",
  "cargoDumpedNearby",
  "commsMessageReceived",
  "escortAccepted",
  "shipAcceptedEscort",
  "shipAttackerDistracted",
  "shipWillEnterWormhole",
  "wormholeSuggested",
  "playerWillEnterWitchspace",
  "shipWitchspaceBlocked",
  "stationWithdrewDockingClearance",
  "escortDock",
  "shipScoopedFuel",
];

describe("AI_EVENT_NAMES", () => {
  it("holds the 23 previous names in their order, then the 13 appended names", () => {
    expect(PREVIOUS_EVENT_NAMES).toHaveLength(23);
    expect(APPENDED_EVENT_NAMES).toHaveLength(13);
    expect([...AI_EVENT_NAMES]).toEqual([
      ...PREVIOUS_EVENT_NAMES,
      ...APPENDED_EVENT_NAMES,
    ]);
    expect(new Set(AI_EVENT_NAMES).size).toBe(AI_EVENT_NAMES.length);
  });
});

// ---------------------------------------------------------------------------
// The largest shape round-trips (the tracer)

/** The largest legal value of one key: the full length, the full string. */
function largestValue(key: PriorityParamKey, salt: number): ParamValue {
  const { shape } = PRIORITY_PARAM_SOURCES[key];
  switch (shape) {
    case "id":
      return "x".repeat(MAX_SNAPSHOT_STRING_LENGTH - 1) + String(salt % 10);
    case "number":
      return MAX_ENTITY_MAGNITUDE - 0.5 - salt;
    case "flag":
      return salt % 2 === 0;
    case "numbers":
      return Array.from(
        { length: MAX_SNAPSHOT_PARAM_LENGTH },
        (_, i) => -MAX_ENTITY_MAGNITUDE + 0.25 + i * 1e9 + salt,
      );
    case "strings":
      return Array.from(
        { length: MAX_SNAPSHOT_PARAM_LENGTH },
        (_, i) =>
          String(i % 10).repeat(MAX_SNAPSHOT_STRING_LENGTH - 1) +
          String(salt % 10),
      );
  }
}

/** Every key of the list at its largest shape. */
function largestParams(): Record<string, ParamValue> {
  const params: Record<string, ParamValue> = {};
  PRIORITY_PARAM_KEYS.forEach((key, index) => {
    params[key] = largestValue(key, index);
  });
  return params;
}

function worldWithPriorityShip(params: Record<string, ParamValue>): World {
  const world = createWorld(0x2107);
  const ai: AiComponent = {
    aiKey: "priority",
    params,
    wakeTick: 5,
    nextThinkTick: 9,
  };
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "viper",
      scanClass: "CLASS_NEUTRAL",
      position: vec(100, -20, 30),
      orientation: identity(),
      radius: 35,
      speed: 12.5,
      ai,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  commitWorld(world);
  return world;
}

describe("a v5 snapshot holding a priority AI at its largest shape", () => {
  it("builds the largest shape at the limits", () => {
    const params = largestParams();
    expect(Object.keys(params).length).toBe(PRIORITY_PARAM_KEYS.length);
    const lengths = Object.values(params).filter(Array.isArray);
    expect(lengths.length).toBeGreaterThan(0);
    for (const list of lengths) {
      expect(list.length).toBe(MAX_SNAPSHOT_PARAM_LENGTH);
    }
    const strings = Object.values(params).filter(
      (value) => typeof value === "string",
    );
    expect(strings.length).toBeGreaterThan(0);
    for (const text of strings) {
      expect(text.length).toBe(MAX_SNAPSHOT_STRING_LENGTH);
    }
  });

  it("spawns, snapshots, parses, restores and hashes identically", () => {
    const world = worldWithPriorityShip(largestParams());
    const snapshot = snapshotWorld(world);
    const text = JSON.stringify(snapshot);
    const parsed = parseWorldSnapshot(JSON.parse(text) as unknown);
    expect(parsed).toEqual(snapshot);

    const restored = restoreWorld(parsed);
    const player = initFlightState(layout);
    expect(hashWorld(player, restored)).toBe(hashWorld(player, world));
    const ai = restored.store.live[0]?.ai;
    expect(ai?.aiKey).toBe("priority");
    expect(ai?.params).toEqual(largestParams());
    // A second pass is stable too: the snapshot is a fixed point.
    expect(JSON.stringify(snapshotWorld(restored))).toBe(text);
  });

  it("refuses one key more than the limit, so the cap is the real one", () => {
    const params = largestParams();
    for (let extra = 0; Object.keys(params).length <= MAX_AI_PARAMS_KEYS;) {
      params[`extra${String(extra)}`] = 0;
      extra += 1;
    }
    const world = createWorld(1);
    const result = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_NEUTRAL",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 35,
        speed: 0,
        ai: { aiKey: "priority", params, wakeTick: 0, nextThinkTick: 0 },
      },
      0,
    );
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Totality of the inert think (milestone rule)

/** A context whose `ctl`, `view` and `random` fail the test when touched. */
function strictContext(
  params: Record<string, ParamValue>,
  touched: string[],
): AiContext {
  const watch = (label: string): object =>
    new Proxy(
      {},
      {
        get(_target, member): unknown {
          touched.push(`${label}.${String(member)}`);
          return () => {
            touched.push(`${label}.${String(member)}()`);
          };
        },
      },
    );
  return {
    self: 101,
    view: watch("view") as AiContext["view"],
    ctl: watch("ctl") as AiContext["ctl"],
    ai: { aiKey: "priority", params, wakeTick: 0, nextThinkTick: 0 },
    random: () => {
      touched.push("random()");
      return 0.5;
    },
  };
}

/** A param value of any shape: malformed leaves, oversized arrays and strings. */
const anyParam = fc.oneof(
  fc.anything(),
  fc.double({ noNaN: false }),
  fc.constantFrom(Number.NaN, Infinity, -Infinity, undefined),
  fc.string({ minLength: MAX_SNAPSHOT_STRING_LENGTH + 1, maxLength: 400 }),
  fc.array(fc.oneof(fc.double(), fc.string(), fc.anything()), {
    minLength: MAX_SNAPSHOT_PARAM_LENGTH + 1,
    maxLength: 150,
  }),
);

const anyParams = fc.oneof(
  fc.dictionary(fc.string(), anyParam),
  fc.dictionary(fc.constantFrom(...PRIORITY_PARAM_KEYS), anyParam),
  fc.dictionary(
    fc.string({ minLength: MAX_SNAPSHOT_STRING_LENGTH + 1, maxLength: 300 }),
    anyParam,
    { minKeys: MAX_AI_PARAMS_KEYS + 1, maxKeys: MAX_AI_PARAMS_KEYS + 20 },
  ),
);

describe("priorityAi.think is total on malformed input", () => {
  it("never throws and touches no ShipControl, WorldView or random draw, for any params", () => {
    fc.assert(
      fc.property(anyParams, (params) => {
        const touched: string[] = [];
        const ctx = strictContext(
          params as unknown as Record<string, ParamValue>,
          touched,
        );
        expect(() => priorityAi.think(ctx)).not.toThrow();
        expect(touched).toEqual([]);
        // The params object is left exactly as it came.
        expect(ctx.ai.params).toBe(params);
      }),
    );
  });

  it("also holds through the registry entry, with the largest shape", () => {
    const touched: string[] = [];
    const params = largestParams();
    const before = JSON.stringify(params);
    AI_REGISTRY.priority.think(strictContext(params, touched));
    expect(touched).toEqual([]);
    expect(JSON.stringify(params)).toBe(before);
  });
});
