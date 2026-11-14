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

import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  createInertPopulate,
  trafficContent,
} from "../../src/app/session/traffic.js";
import {
  createWorldLifecycle,
  restoreWorldAnchor,
} from "../../src/app/session/world-lifecycle.js";
import type {
  Populate,
  WorldLifecycle,
} from "../../src/app/session/world-lifecycle.js";
import type { NpcShip } from "../../src/content/types.js";
import {
  queueAutosave,
  snapshotForSave,
} from "../../src/persistence/autosave.js";
import type { SaveWorldCounters } from "../../src/persistence/autosave.js";
import { MemorySaveStore } from "../../src/persistence/memory-store.js";
import {
  FRESH_WORLD_NEXT_ENTITY_ID,
  MAX_SAVE_BERTHS,
  MAX_SAVE_CARGO_ENTRIES,
  MAX_SAVE_CARGO_QUANTITY,
  MAX_SAVE_CHARS,
  MAX_SAVE_CLOCK_DELTA,
  MAX_SAVE_CREDITS,
  MAX_SAVE_EPOCH,
  MAX_SAVE_EQUIPMENT,
  MAX_SAVE_EQUIPMENT_KEY_CHARS,
  MAX_SAVE_FUEL,
  MAX_SAVE_MARKET_GOODS,
  MAX_SAVE_MISSILES,
  MAX_SAVE_NEXT_ENTITY_ID,
  MAX_SAVE_STATION_KEY_CHARS,
  MAX_SAVE_SYSTEM_ID_CHARS,
  SAVE_VERSION,
  SaveV3Schema,
  encodeSave,
  isEncodedSaveValid,
  migrateV1ToV2,
  migrateV2ToV3,
  parseSave,
} from "../../src/persistence/save.js";
import type {
  SaveAllowLists,
  SaveInputs,
  SaveV1,
  SaveV2,
} from "../../src/persistence/save.js";
import {
  MARKET_LIMIT,
  generateMarket,
  marketSeedForSystem,
} from "../../src/sim/economy/market.js";
import { identity, vec } from "../../src/sim/math.js";
import { newProfile } from "../../src/sim/player/profile.js";
import { initFlightState, CLOCK_START } from "../../src/sim/flight/state.js";
import { worldSeedFor } from "../../src/sim/rng.js";
import { FIRST_DYNAMIC_ID } from "../../src/sim/world/ids.js";
import { serializeWorldSection } from "../../src/sim/world/serialize.js";
import { liveEntityCount, spawnEntity } from "../../src/sim/world/world.js";
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

describe("regenerated inert world (SAVE-08, Phase 12)", () => {
  const npcTraffic = trafficContent(
    JSON.parse(
      readFileSync(
        new URL("../../src/content/generated/ships-npc.json", import.meta.url),
        "utf8",
      ),
    ) as NpcShip[],
  );

  /** A lifecycle over the real inert populate with the Lave layout, traffic as given. */
  function lifecycleWith(traffic: boolean): WorldLifecycle {
    return createWorldLifecycle({
      traffic,
      populate: createInertPopulate(
        () => npcTraffic,
        () => lave.layout,
      ),
    });
  }

  /** The cold Continue or warm Load of an in-flight blob, as the session does it. */
  function restoreInFlight(
    raw: string,
    traffic: boolean,
  ): { readonly restored: WorldLifecycle; readonly savedCounter: number } {
    const parsed = parseSave(raw, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("the save did not parse");
    const restored = lifecycleWith(traffic);
    restoreWorldAnchor(restored, parsed.save.epoch, LAVE_SEED, true);
    return { restored, savedCounter: parsed.save.nextEntityId };
  }

  it("an in-flight save written with traffic on carries 113, and the reload regenerates the fresh arrival's world with the same counter", () => {
    const arrival = lifecycleWith(true);
    arrival.begin(LAVE_SEED);
    expect(arrival.anchorNextEntityId).toBe(113);
    const inputs = snapshot("inFlight", arrival);
    expect(inputs.epoch).toBe(1);
    expect(inputs.nextEntityId).toBe(113);
    const raw = encodeSave(inputs);
    expect(raw).toContain('"nextEntityId":113');
    expect(isEncodedSaveValid(raw, ALLOW)).toBe(true);

    const { restored, savedCounter } = restoreInFlight(raw, true);
    expect(savedCounter).toBe(113);
    expect(restored.epoch).toBe(1);
    expect(restored.anchorNextEntityId).toBe(savedCounter);
    const world = restored.world;
    const fresh = arrival.world;
    if (world === undefined || fresh === undefined) {
      throw new Error("expected regenerated and fresh worlds");
    }
    expect(world).not.toBe(fresh);
    expect(liveEntityCount(world)).toBe(12);
    expect(serializeWorldSection(world)).toBe(serializeWorldSection(fresh));
  });

  it("a docked save writes 101 and keeps no world, and the reload restores the epoch only", () => {
    const lifecycle = lifecycleWith(true);
    lifecycle.begin(LAVE_SEED);
    expect(lifecycle.anchorNextEntityId).toBe(113);
    // No world while docked (PROJECT.md row 236): the counter is the fresh 101.
    const inputs = snapshot("docked", lifecycle);
    expect(inputs.nextEntityId).toBe(101);
    expect(inputs.epoch).toBe(1);
    const parsed = parseSave(encodeSave(inputs), ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.nextEntityId).toBe(101);

    const restored = lifecycleWith(true);
    restoreWorldAnchor(restored, parsed.save.epoch, LAVE_SEED, false);
    expect(restored.epoch).toBe(1);
    expect(restored.world).toBeUndefined();
    expect(restored.anchorNextEntityId).toBeUndefined();
    // The inert world is regenerated at the next launch, which bumps the epoch.
    restored.begin(LAVE_SEED);
    expect(restored.epoch).toBe(2);
    expect(restored.world?.store.nextId).toBe(113);
  });

  it("a counter that differs never blocks a load: a save written with traffic off restores 12 ships with traffic on", () => {
    const writer = lifecycleWith(false);
    writer.begin(LAVE_SEED);
    expect(writer.anchorNextEntityId).toBe(101);
    const raw = encodeSave(snapshot("inFlight", writer));
    expect(raw).toContain('"nextEntityId":101');

    const { restored, savedCounter } = restoreInFlight(raw, true);
    expect(savedCounter).toBe(101);
    expect(restored.epoch).toBe(1);
    expect(restored.world).toBeDefined();
    if (restored.world === undefined) return;
    expect(liveEntityCount(restored.world)).toBe(12);
    // The regenerated counter wins; the saved one is never copied over it.
    expect(restored.anchorNextEntityId).toBe(113);
    expect(restored.anchorNextEntityId).not.toBe(savedCounter);
  });

  it("a save written with traffic on restores an empty world with traffic off, and a tampered counter changes nothing", () => {
    const writer = lifecycleWith(true);
    writer.begin(LAVE_SEED);
    const raw = encodeSave(snapshot("inFlight", writer));

    const off = restoreInFlight(raw, false);
    expect(off.savedCounter).toBe(113);
    expect(off.restored.world).toBeDefined();
    if (off.restored.world === undefined) return;
    expect(liveEntityCount(off.restored.world)).toBe(0);
    expect(off.restored.anchorNextEntityId).toBe(101);

    // T-12-22: a counter inside the schema bound but wrong is parsed, not used.
    const tampered = JSON.stringify({
      ...(JSON.parse(raw) as Record<string, unknown>),
      nextEntityId: 5000,
    });
    const on = restoreInFlight(tampered, true);
    expect(on.savedCounter).toBe(5000);
    expect(on.restored.anchorNextEntityId).toBe(113);
    expect(on.restored.world?.store.nextId).toBe(113);
    expect(on.restored.world).toBeDefined();
    if (on.restored.world === undefined || writer.world === undefined) return;
    expect(serializeWorldSection(on.restored.world)).toBe(
      serializeWorldSection(writer.world),
    );
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

/** A valid docked v3 blob as a plain record, for the edge tables. */
function validV3(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 3,
    mode: "docked",
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    system: { id: "g0-s7" },
    station: { key: "coriolis-station" },
    marketSeed: 3545325333,
    epoch: 0,
    nextEntityId: 101,
    ...overrides,
  };
}

function parseOf(value: Record<string, unknown>) {
  return parseSave(JSON.stringify(value), ALLOW);
}

describe("v3 bounds and required fields (D-03, D-04)", () => {
  it("the control blob is accepted", () => {
    expect(parseOf(validV3()).ok).toBe(true);
  });

  it.each([
    ["0", 0, true],
    ["0xfffffffe", 0xfffffffe, true],
    ["0xffffffff", 0xffffffff, false],
    ["-1", -1, false],
    ["1.5", 1.5, false],
    ["2^32", 0x100000000, false],
    ['the string "1"', "1", false],
    ["null", null, false],
  ])("epoch %s", (_name, epoch, ok) => {
    const result = parseOf(validV3({ epoch }));
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.reason).toBe("corrupt");
    if (result.ok) expect(result.save.epoch).toBe(epoch);
  });

  it("an absent epoch is corrupt", () => {
    const blob = validV3();
    delete blob.epoch;
    expect(parseOf(blob)).toEqual({ ok: false, reason: "corrupt" });
  });

  it.each([
    ["101", 101, true],
    ["2^32", 0x100000000, true],
    ["100", 100, false],
    ["0", 0, false],
    ["2^32 + 1", 0x100000001, false],
    ["101.5", 101.5, false],
  ])("nextEntityId %s", (_name, nextEntityId, ok) => {
    const result = parseOf(validV3({ nextEntityId }));
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.reason).toBe("corrupt");
    if (result.ok) expect(result.save.nextEntityId).toBe(nextEntityId);
  });

  it("an absent nextEntityId is corrupt", () => {
    const blob = validV3();
    delete blob.nextEntityId;
    expect(parseOf(blob)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("a v2 or v1 blob carrying epoch is corrupt", () => {
    expect(parseOf(validV3({ version: 2, nextEntityId: undefined }))).toEqual({
      ok: false,
      reason: "corrupt",
    });
    const v1 = validV3({ version: 1, nextEntityId: undefined });
    delete v1.marketSeed;
    expect(parseOf(v1)).toEqual({ ok: false, reason: "corrupt" });
  });

  it.each([
    ["worldSeed", 1],
    ["entities", []],
    ["legalStatus", 0],
    ["kills", 0],
    ["cargoCostBasis", {}],
  ])(
    "a v3 blob carrying %s is corrupt (a save never carries world state)",
    (key, value) => {
      expect(parseOf(validV3({ [key]: value }))).toEqual({
        ok: false,
        reason: "corrupt",
      });
    },
  );

  it("the schema bound is exactly the domain resetForRestore accepts", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    expect(lifecycle.resetForRestore(MAX_SAVE_EPOCH)).toBe(true);
    expect(lifecycle.resetForRestore(MAX_SAVE_EPOCH + 1)).toBe(false);
    expect(
      SaveV3Schema.safeParse(validV3({ epoch: MAX_SAVE_EPOCH })).success,
    ).toBe(true);
    expect(
      SaveV3Schema.safeParse(validV3({ epoch: MAX_SAVE_EPOCH + 1 })).success,
    ).toBe(false);
  });
});

describe("the writer gate refuses an out-of-range epoch", () => {
  const inputs = (epoch: number): SaveInputs => ({
    clockSeconds: CLOCK_START + 600,
    credits: 1000,
    equipment: [],
    cargo: [],
    fuel: 70,
    missiles: 3,
    passengerBerths: 0,
    mode: "docked",
    marketSeed: LAVE_SEED,
    systemId: "g0-s7",
    stationKey: "coriolis-station",
    epoch,
    nextEntityId: 101,
  });

  it("epoch 0xffffffff is invalid-save and the stored bytes are untouched", async () => {
    const committed = encodeSave(inputs(7));
    const store = new MemorySaveStore({ raw: committed });

    const result = await queueAutosave(store, 2, inputs(0xffffffff), ALLOW);

    expect(result).toEqual({
      committed: false,
      revision: 2,
      reason: "invalid-save",
    });
    expect(store.raw).toBe(committed);
    expect(store.writes).toEqual([]);
  });

  it("the same inputs at epoch 0xfffffffe commit (the gate is the bound, not the call)", async () => {
    const store = new MemorySaveStore();
    const result = await queueAutosave(store, 1, inputs(MAX_SAVE_EPOCH), ALLOW);
    expect(result.committed).toBe(true);
    expect(store.raw).toContain('"epoch":4294967294');
  });
});

describe("classification: future, corrupt and the backup path", () => {
  // src/main.ts lines 216-229: reason "corrupt" is the only path to
  // backupCorrupt (the autosave.corrupt copy), and nothing reads the backup key
  // back. Phase 11 leaves that unchanged, so the classification is the part
  // this phase must prove.
  it("version 4 is future-version", () => {
    expect(parseOf(validV3({ version: 4 }))).toEqual({
      ok: false,
      reason: "future-version",
    });
  });

  it("an oversized version 4 blob is future-version and JSON.parse never runs", () => {
    const oversized = `${JSON.stringify(validV3({ version: 4 }))}${" ".repeat(MAX_SAVE_CHARS)}`;
    expect(oversized.length).toBeGreaterThan(MAX_SAVE_CHARS);
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(parseSave(oversized, ALLOW)).toEqual({
        ok: false,
        reason: "future-version",
      });
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });

  it("a v3 blob with epoch 0xffffffff is corrupt, the one reason that is backed up", () => {
    expect(parseOf(validV3({ epoch: 0xffffffff }))).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });
});

/**
 * The worst-case v3 save (D-08): every field at its bound, every string made
 * only of code units that JSON.stringify escapes to six characters (U+0000 to
 * U+0007, U+000B, U+000E to U+001F; U+0008, U+0009, U+000A, U+000C and U+000D
 * escape to two and are excluded).
 */
const SIX_CHAR_UNITS: readonly string[] = [
  ...Array.from({ length: 8 }, (_, index) => String.fromCharCode(index)),
  String.fromCharCode(0x0b),
  ...Array.from({ length: 18 }, (_, index) =>
    String.fromCharCode(0x0e + index),
  ),
];

function worstKey(index: number, length: number): string {
  let key = "";
  for (let at = 0; at < length; at += 1) {
    key += SIX_CHAR_UNITS[(index + at) % SIX_CHAR_UNITS.length] ?? "";
  }
  return key;
}

const WORST_CASE_INPUTS: SaveInputs = {
  clockSeconds: CLOCK_START + MAX_SAVE_CLOCK_DELTA,
  credits: MAX_SAVE_CREDITS,
  equipment: Array.from({ length: MAX_SAVE_EQUIPMENT }, (_, index) =>
    worstKey(index, MAX_SAVE_EQUIPMENT_KEY_CHARS),
  ),
  cargo: Array.from({ length: MAX_SAVE_CARGO_ENTRIES }, (_, index) => ({
    key: worstKey(index + 3, MAX_SAVE_EQUIPMENT_KEY_CHARS),
    quantity: MAX_SAVE_CARGO_QUANTITY,
  })),
  fuel: MAX_SAVE_FUEL,
  missiles: MAX_SAVE_MISSILES,
  passengerBerths: MAX_SAVE_BERTHS,
  mode: "inFlight",
  targetSystem: worstKey(5, MAX_SAVE_SYSTEM_ID_CHARS),
  market: {
    systemId: worstKey(7, MAX_SAVE_SYSTEM_ID_CHARS),
    seed: 0xffffffff,
    goods: Array.from({ length: MAX_SAVE_MARKET_GOODS }, (_, index) => ({
      key: worstKey(index + 9, MAX_SAVE_EQUIPMENT_KEY_CHARS),
      price: MAX_SAVE_CREDITS,
      stock: MARKET_LIMIT,
    })),
  },
  flight: {
    position: [-999999999.9999999, -999999999.9999999, -999999999.9999999],
    orientation: [
      -0.4999999999999999, -0.4999999999999999, -0.4999999999999999,
      -0.4999999999999999,
    ],
    speed: 999999.9999999999,
    pitchRate: -9.999999999999998,
    rollRate: -9.999999999999998,
    torus: false,
  },
  systemId: worstKey(11, MAX_SAVE_SYSTEM_ID_CHARS),
  stationKey: worstKey(13, MAX_SAVE_STATION_KEY_CHARS),
  epoch: MAX_SAVE_EPOCH,
  nextEntityId: MAX_SAVE_NEXT_ENTITY_ID,
};

const WORST_CASE_ENCODED = encodeSave(WORST_CASE_INPUTS);

/**
 * The two future-version checks of the v2 build's parser, transcribed
 * verbatim from `git show 41aaf0e:src/persistence/save.ts` with SAVE_VERSION 2:
 * the bounded 256-character sniff for an oversized blob (lines 346-356 and
 * 400-406) and the post-parse `typeof version === "number" && version > 2`
 * check (lines 417-422). The e2e specs of Phases 4-10 proved the same
 * behaviour in the browser by writing a version-3 blob against the v2 build.
 */
function olderBuildIsFuture(raw: string): boolean {
  const SAVE_VERSION_V2 = 2;
  const MAX_VERSION_SNIFF_CHARS = 256;
  const VERSION_SNIFF = /"version"\s*:\s*(\d{1,16})/;
  if (raw.length > 65_536) {
    const match = VERSION_SNIFF.exec(raw.slice(0, MAX_VERSION_SNIFF_CHARS));
    if (match === null) return false;
    const value = Number(match[1]);
    const version = Number.isSafeInteger(value) ? value : null;
    return version !== null && version > SAVE_VERSION_V2;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return false;
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const version = (parsed as Record<string, unknown>)["version"];
    return typeof version === "number" && version > SAVE_VERSION_V2;
  }
  return false;
}

describe("older builds keep a v3 save inert (criterion 2)", () => {
  const docked = encodeSave(
    snapshot("docked", { epoch: 3, anchorNextEntityId: undefined }),
  );
  const inFlight = encodeSave(
    snapshot("inFlight", { epoch: 5, anchorNextEntityId: 102 }),
  );
  const paddedWorst = `${WORST_CASE_ENCODED}${" ".repeat(MAX_SAVE_CHARS)}`;

  it.each([
    ["docked", docked],
    ["in flight", inFlight],
    ["worst case", WORST_CASE_ENCODED],
    ["worst case padded beyond MAX_SAVE_CHARS", paddedWorst],
  ])("the v2 build classifies a %s blob as future-version", (_name, raw) => {
    expect(raw.startsWith('{"version":3,')).toBe(true);
    expect(olderBuildIsFuture(raw)).toBe(true);
  });

  it("the frozen classifier does not call a v2 blob future (it is not vacuous)", () => {
    expect(
      olderBuildIsFuture(JSON.stringify({ ...validV3(), version: 2 })),
    ).toBe(false);
    expect(olderBuildIsFuture("not json")).toBe(false);
  });

  it("this build reads the padded worst case as unreadable, never corrupt", () => {
    expect(parseSave(paddedWorst, ALLOW)).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});

describe("worst-case v3 save (D-08)", () => {
  it(`encodes under MAX_SAVE_CHARS (measured ${String(WORST_CASE_ENCODED.length)} characters), is schema-valid, and is not vacuous`, () => {
    expect(WORST_CASE_ENCODED.length).toBeLessThan(MAX_SAVE_CHARS);
    expect(WORST_CASE_ENCODED.length).toBeGreaterThanOrEqual(38_000);
    expect(SaveV3Schema.safeParse(JSON.parse(WORST_CASE_ENCODED)).success).toBe(
      true,
    );
  });
});
