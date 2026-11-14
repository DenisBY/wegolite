// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save schema v3 contract (Phase 11, SAVE-07, CONTEXT D-01 to D-08).
 *
 * Plan 11-01 pins the D-07 cross-check vector here before any v3 save exists:
 * once the epoch is persisted, the mix32 world-seed derivation is one-way, so
 * its drift has to be caught from literals that are independent of the code.
 * Plans 11-02 and 11-03 add the round trip, the bounds and the worst case.
 * Expected values come from the decisions and the PROJECT.md Key Decisions row,
 * never from running the code twice.
 */

import { describe, expect, it } from "vitest";

import { createWorldLifecycle } from "../../src/app/session/world-lifecycle.js";
import type { Populate } from "../../src/app/session/world-lifecycle.js";
import { snapshotForSave } from "../../src/persistence/autosave.js";
import type { SaveWorldCounters } from "../../src/persistence/autosave.js";
import {
  FRESH_WORLD_NEXT_ENTITY_ID,
  MAX_SAVE_EPOCH,
  MAX_SAVE_NEXT_ENTITY_ID,
  SAVE_VERSION,
  encodeSave,
  isEncodedSaveValid,
  migrateV1ToV2,
  migrateV2ToV3,
  parseSave,
} from "../../src/persistence/save.js";
import type {
  SaveAllowLists,
  SaveV1,
  SaveV2,
} from "../../src/persistence/save.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../src/sim/economy/market.js";
import { identity, vec } from "../../src/sim/math.js";
import { newProfile } from "../../src/sim/player/profile.js";
import { initFlightState, CLOCK_START } from "../../src/sim/flight/state.js";
import { worldSeedFor } from "../../src/sim/rng.js";
import { FIRST_DYNAMIC_ID } from "../../src/sim/world/ids.js";
import { spawnEntity } from "../../src/sim/world/world.js";
import { commoditiesFixture } from "../helpers/commodities.js";
import { laveFixture } from "../helpers/lave.js";

describe("world-seed cross-check vector (D-07), pinned before the first v3 write", () => {
  it("marketSeedForSystem(g0-s7) is 3545325333", () => {
    expect(marketSeedForSystem("g0-s7")).toBe(3545325333);
  });

  it("worldSeedFor(3545325333, 1) is 0x2b4e037c", () => {
    expect(worldSeedFor(3545325333, 1)).toBe(0x2b4e037c);
    expect(worldSeedFor(marketSeedForSystem("g0-s7"), 1)).toBe(0x2b4e037c);
  });

  it("the session's first launch from Lave builds the world with seed 0x2b4e037c", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(marketSeedForSystem("g0-s7"));
    expect(lifecycle.epoch).toBe(1);
    expect(lifecycle.world?.worldSeed).toBe(0x2b4e037c);
    expect(lifecycle.anchorNextEntityId).toBe(101);
  });
});

const lave = laveFixture();
const catalogue = commoditiesFixture();
const LAVE_SEED = marketSeedForSystem("g0-s7");
const laveMarket = generateMarket(lave.system, catalogue, LAVE_SEED);

const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set(["g0-s7", "g0-s1"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map(
    catalogue
      .filter((commodity) => commodity.tradeable)
      .map((commodity) => [commodity.key, commodity.unit]),
  ),
  marketGoods: new Set(catalogue.map((commodity) => commodity.key)),
};

/** A populator that spawns three ships: the leg anchor counter is 104. */
const populateThree: Populate = (world) => {
  for (let index = 0; index < 3; index += 1) {
    spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(index * 10, 0, 0),
        orientation: identity(),
        radius: 1,
      },
      0,
    );
  }
};

function flightState(mode: "docked" | "inFlight") {
  const state = initFlightState(lave.layout);
  state.mode = mode;
  if (mode === "inFlight") {
    state.position = { x: 1200.5, y: -40.25, z: 8000.75 };
    state.speed = 123.5;
  }
  return state;
}

function snapshot(mode: "docked" | "inFlight", counters: SaveWorldCounters) {
  return snapshotForSave(
    flightState(mode),
    { ...newProfile(), credits: 987 },
    lave.system,
    { key: "coriolis-station" },
    laveMarket,
    catalogue,
    counters,
    "g0-s1",
  );
}

describe("v3 save end to end (tracer)", () => {
  it("an in-flight save after the first launch from Lave records epoch 1 and the anchor counter 101", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(LAVE_SEED);

    const inputs = snapshot("inFlight", lifecycle);
    expect(inputs.epoch).toBe(1);
    expect(inputs.nextEntityId).toBe(101);

    const encoded = encodeSave(inputs);
    expect(encoded.startsWith('{"version":3,')).toBe(true);
    expect(encoded).toContain('"epoch":1');
    expect(encoded).toContain('"nextEntityId":101');
    expect(isEncodedSaveValid(encoded, ALLOW)).toBe(true);

    const parsed = parseSave(encoded, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.version).toBe(3);
    expect(parsed.save.epoch).toBe(1);
    expect(parsed.save.nextEntityId).toBe(101);

    // D-07: the world seed follows from the saved market seed and the epoch.
    const marketSeed = parsed.save.market?.seed;
    expect(marketSeed).toBe(LAVE_SEED);
    if (marketSeed === undefined) return;
    expect(worldSeedFor(marketSeed, parsed.save.epoch)).toBe(0x2b4e037c);

    const restored = createWorldLifecycle({ traffic: false });
    expect(restored.resetForRestore(parsed.save.epoch)).toBe(true);
    restored.resume(marketSeed);
    expect(restored.world?.worldSeed).toBe(0x2b4e037c);
    expect(restored.anchorNextEntityId).toBe(parsed.save.nextEntityId);
  });

  it("a docked save writes 101 and the lifecycle epoch, with the world alive and after it ends", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    lifecycle.begin(LAVE_SEED);
    expect(lifecycle.anchorNextEntityId).toBe(104);

    const withWorld = snapshot("docked", lifecycle);
    expect(withWorld.nextEntityId).toBe(101);
    expect(withWorld.epoch).toBe(1);

    lifecycle.end();
    const withoutWorld = snapshot("docked", lifecycle);
    expect(withoutWorld).toEqual(withWorld);
    expect(encodeSave(withoutWorld)).toBe(encodeSave(withWorld));
  });

  it("an in-flight save mid-leg records the anchor counter, not the live one", () => {
    const lifecycle = createWorldLifecycle({
      traffic: false,
      populate: populateThree,
    });
    lifecycle.begin(LAVE_SEED);
    const world = lifecycle.world;
    expect(world).toBeDefined();
    if (world === undefined) return;
    spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_POLICE",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 1,
      },
      3,
    );
    expect(world.store.nextId).toBe(105);

    const inputs = snapshot("inFlight", lifecycle);
    expect(inputs.nextEntityId).toBe(104);
    expect(inputs.epoch).toBe(1);
  });

  it("counters without a world in flight give the fresh-world counter", () => {
    const inputs = snapshot("inFlight", {
      epoch: 0,
      anchorNextEntityId: undefined,
    });
    expect(inputs.epoch).toBe(0);
    expect(inputs.nextEntityId).toBe(101);
  });
});

describe("migration to v3 (D-02, D-03)", () => {
  const v2: SaveV2 = {
    version: 2,
    mode: "docked",
    clockSeconds: CLOCK_START + 10,
    credits: 100,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    marketSeed: 1234,
  };
  const v1: SaveV1 = {
    version: 1,
    mode: "docked",
    clockSeconds: CLOCK_START + 10,
    credits: 100,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
  };

  it("a v2 seed-only docked blob parses to the v2 object at version 3, epoch 0 and counter 101", () => {
    const parsed = parseSave(JSON.stringify(v2), ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save).toStrictEqual({
      ...v2,
      version: 3,
      epoch: 0,
      nextEntityId: 101,
    });
  });

  it("a v1 blob parses through v2 into v3 with the derived market seed", () => {
    const parsed = parseSave(JSON.stringify(v1), ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save).toStrictEqual({
      ...v1,
      version: 3,
      mode: "docked",
      marketSeed: marketSeedForSystem("g0-s7"),
      epoch: 0,
      nextEntityId: 101,
    });
    expect(parsed.save).toStrictEqual(migrateV2ToV3(migrateV1ToV2(v1)));
  });

  it("migrateV2ToV3 never mutates its input and is deterministic", () => {
    const frozen: SaveV2 = JSON.parse(JSON.stringify(v2)) as SaveV2;
    const first = migrateV2ToV3(frozen);
    const second = migrateV2ToV3(frozen);
    expect(frozen).toStrictEqual(v2);
    expect(first).toStrictEqual(second);
    expect(first).not.toBe(second);
  });
});

describe("v3 constants", () => {
  it("pins the version, the counter equality and the bounds", () => {
    expect(SAVE_VERSION).toBe(3);
    expect(FRESH_WORLD_NEXT_ENTITY_ID).toBe(FIRST_DYNAMIC_ID);
    expect(MAX_SAVE_EPOCH).toBe(0xfffffffe);
    expect(MAX_SAVE_NEXT_ENTITY_ID).toBe(2 ** 32);
  });
});
