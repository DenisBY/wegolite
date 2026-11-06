// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The autosave contract (DOCK-07, D-13, D-15, T-04-48).
 *
 * These tests use the real Lave layout and the real `stepFlight`, so the launch
 * snapshot is the shipped one: post-`beginLaunch`, clock already +600 s, mode
 * `"docked"` in the blob. The memory store proves revision ordering; Playwright
 * proves the same contract against real IndexedDB.
 */

import { describe, expect, it } from "vitest";

import { MemorySaveStore } from "../../src/persistence/memory-store.js";
import {
  profileFromSave,
  queueAutosave,
  restoreFromSave,
  snapshotForSave,
} from "../../src/persistence/autosave.js";
import { encodeSave, parseSave } from "../../src/persistence/save.js";
import {
  MAX_SAVE_CHARS,
  MAX_SAVE_CLOCK_DELTA,
  MAX_SAVE_CREDITS,
  MAX_SAVE_EQUIPMENT,
} from "../../src/persistence/save.js";
import type {
  SaveAllowLists,
  SaveInputs,
  SaveV1,
} from "../../src/persistence/save.js";
import {
  PlayerController,
  flightView,
} from "../../src/sim/flight/controller.js";
import { initFlightState, CLOCK_START } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { completeLaunch } from "../../src/sim/flight/launch.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import type { Command } from "../../src/sim/commands.js";
import {
  newProfile,
  purchase,
  setCredits,
} from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import { commoditiesFixture } from "../helpers/commodities.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture, scriptedFrame } from "../helpers/lave.js";

const { layout, config } = laveFixture();
const player = new PlayerController();

const COMMODITIES = commoditiesFixture();
const SEED = 0x12345678;

const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map([
    ["food", "t"],
    ["gold", "kg"],
    ["gem_stones", "g"],
  ]),
};

const SYSTEM = { id: "g0-s7" };
const STATION = { key: "coriolis-station" };
const DOCK_COMPUTER = { key: "EQ_DOCK_COMP", price: 15_000, techLevel: 9 };

function launch(state: FlightState): void {
  const intent = player.update(flightView(state), scriptedFrame(0, 0, 0));
  stepFlight(state, layout, config, intent, [{ kind: "launch" }], DT);
}

/** Advance one fixed step with the same scripted, zero-input intent. */
function step(state: FlightState, commands: readonly Command[] = []): void {
  const intent = player.update(flightView(state), scriptedFrame(0, 0, 0));
  stepFlight(state, layout, config, intent, commands, DT);
}

function profileWithCredits(credits: number): PlayerProfile {
  return setCredits(newProfile(), credits);
}

/**
 * The largest equipment tuple the v1 schema allows, built from control
 * characters so every character encodes to six bytes: this is the worst case
 * for the blob length, not merely the in-memory shape.
 */
function maximumEquipment(): string[] {
  return Array.from({ length: MAX_SAVE_EQUIPMENT }, (_, index) => {
    const first = String.fromCharCode(index % 32).repeat(32);
    const second = String.fromCharCode(Math.floor(index / 32) + 1).repeat(32);
    return `${first}${second}`;
  });
}

const MAX_EQUIPMENT = maximumEquipment();

const MAX_ALLOW: SaveAllowLists = {
  equipment: new Set(MAX_EQUIPMENT),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
  commodities: ALLOW.commodities,
};

describe("snapshotForSave", () => {
  it("records the post-launch clock, docked mode and identities", () => {
    const state = initFlightState(layout);
    launch(state);
    const profile = newProfile();

    const inputs = snapshotForSave(
      state,
      profile,
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );
    expect(inputs.clockSeconds).toBe(CLOCK_START + 600);
    expect(inputs.credits).toBe(1000);
    expect(inputs.equipment).toEqual([]);
    expect(inputs.systemId).toBe("g0-s7");
    expect(inputs.stationKey).toBe("coriolis-station");

    const encoded = encodeSave(inputs);
    const parsed = parseSave(encoded, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // The launch save says "resume docked at the post-launch clock".
    expect(parsed.save.mode).toBe("docked");
    expect(parsed.save.clockSeconds).toBe(CLOCK_START + 600);
  });

  it("round-trips a fractional clock after flight, a dock and a relaunch", async () => {
    const state = initFlightState(layout);
    // New game -> launch: the clock is integer and valid.
    launch(state);
    completeLaunch(state);
    // Fly for two simulated seconds; every in-flight tick advances the clock
    // by DT (1/120), so it is fractional when the ship docks.
    for (let stepIndex = 0; stepIndex < 240; stepIndex += 1) {
      step(state);
    }
    state.mode = "docked";
    const liveClock = state.clockSeconds;
    expect(Number.isInteger(liveClock)).toBe(false);

    // Relaunch: +600 s, then the `launched` handler takes this snapshot.
    step(state, [{ kind: "launch" }]);
    expect(state.clockSeconds).toBeGreaterThan(liveClock + 599);

    const store = new MemorySaveStore();
    const inputs = snapshotForSave(
      state,
      newProfile(),
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );
    const result = await queueAutosave(store, 1, inputs, ALLOW);
    expect(result.committed).toBe(true);

    const parsed = parseSave(store.raw, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // The writer floors the fractional live clock, so the blob this build
    // writes is always one its own parser accepts.
    expect(parsed.save.clockSeconds).toBe(Math.floor(liveClock) + 600);
    expect(parsed.save.clockSeconds - state.clockSeconds).toBeLessThan(1);
    expect(parsed.save.clockSeconds - state.clockSeconds).toBeGreaterThan(-1);
  });

  it("writes the reduced balance after a purchase", async () => {
    const purchased = purchase(profileWithCredits(20_000), DOCK_COMPUTER);
    expect(purchased.credits).toBe(5000);

    const store = new MemorySaveStore();
    const inputs = snapshotForSave(
      initFlightState(layout),
      purchased,
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );
    const result = await queueAutosave(store, 1, inputs, ALLOW);
    expect(result.committed).toBe(true);

    const parsed = parseSave(store.raw, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.credits).toBe(5000);
    expect(parsed.save.equipment).toEqual(["EQ_DOCK_COMP"]);
  });
});

describe("canonical snapshot and Phase 4 defaults", () => {
  it("sorts cargo by commodity sortOrder and omits zero entries", () => {
    const profile: PlayerProfile = {
      ...newProfile(),
      cargo: { gem_stones: 1000, food: 2, gold: 100, computers: 0 },
    };
    const inputs = snapshotForSave(
      initFlightState(layout),
      profile,
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );

    const expected = COMMODITIES.filter(
      (commodity) =>
        commodity.key in profile.cargo && profile.cargo[commodity.key]! > 0,
    )
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((commodity) => commodity.key);
    expect(inputs.cargo.map((entry) => entry.key)).toEqual(expected);
    expect(inputs.cargo.every((entry) => entry.quantity > 0)).toBe(true);
    expect(inputs.marketSeed).toBe(SEED);
  });

  it("round-trips credits, cargo, counts and the seed exactly", () => {
    const profile: PlayerProfile = {
      ...newProfile(),
      credits: 4321,
      cargo: { food: 3, gold: 499 },
      fuel: 42,
      missiles: 2,
      passengerBerths: 1,
    };
    const inputs = snapshotForSave(
      initFlightState(layout),
      profile,
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );

    const parsed = parseSave(encodeSave(inputs), ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.credits).toBe(4321);
    expect(parsed.save.cargo).toEqual(inputs.cargo);
    expect(parsed.save.fuel).toBe(42);
    expect(parsed.save.missiles).toBe(2);
    expect(parsed.save.passengerBerths).toBe(1);
    expect(parsed.save.marketSeed).toBe(SEED);

    const restored = profileFromSave(parsed.save);
    expect(restored.credits).toBe(4321);
    expect(restored.cargo).toEqual({ food: 3, gold: 499 });
    expect(restored.fuel).toBe(42);
    expect(restored.missiles).toBe(2);
    expect(restored.passengerBerths).toBe(1);

    const again = snapshotForSave(
      initFlightState(layout),
      restored,
      SYSTEM,
      STATION,
      parsed.save.marketSeed ?? 0,
      COMMODITIES,
    );
    expect(again).toEqual(inputs);
  });

  it("defaults a field-less Phase 4 blob to an empty hold and a fresh ship", () => {
    const save: SaveV1 = {
      version: 1,
      mode: "docked",
      clockSeconds: CLOCK_START + 600,
      credits: 1000,
      equipment: [],
      system: { id: "g0-s7" },
      station: { key: "coriolis-station" },
    };
    const profile = profileFromSave(save);

    expect(profile.credits).toBe(1000);
    expect(profile.cargo).toEqual({});
    expect(Object.getPrototypeOf(profile.cargo)).toBeNull();
    expect(profile.fuel).toBe(70);
    expect(profile.missiles).toBe(3);
    expect(profile.passengerBerths).toBe(0);
    expect(profile.equipment).toEqual([]);
  });

  it("folds one legacy alias into its count and drops it", () => {
    const save: SaveV1 = {
      version: 1,
      mode: "docked",
      clockSeconds: CLOCK_START + 600,
      credits: 1000,
      equipment: ["EQ_DOCK_COMP", "EQ_MISSILE", "EQ_PASSENGER_BERTH"],
      system: { id: "g0-s7" },
      station: { key: "coriolis-station" },
    };
    const profile = profileFromSave(save);

    expect(profile.equipment).toEqual(["EQ_DOCK_COMP"]);
    expect(profile.missiles).toBe(1);
    expect(profile.passengerBerths).toBe(1);
  });

  it("adds the alias to an explicit zero rather than replacing it", () => {
    const save: SaveV1 = {
      version: 1,
      mode: "docked",
      clockSeconds: CLOCK_START + 600,
      credits: 1000,
      equipment: ["EQ_MISSILE", "EQ_PASSENGER_BERTH"],
      missiles: 0,
      passengerBerths: 0,
      system: { id: "g0-s7" },
      station: { key: "coriolis-station" },
    };
    const profile = profileFromSave(save);

    // The same rule the validator measures: never `max(count, 1)`.
    expect(profile.missiles).toBe(1);
    expect(profile.passengerBerths).toBe(1);
  });
});

describe("writer bounds", () => {
  const maximumInputs: SaveInputs = {
    clockSeconds: CLOCK_START + MAX_SAVE_CLOCK_DELTA,
    credits: MAX_SAVE_CREDITS,
    equipment: MAX_EQUIPMENT,
    cargo: [],
    fuel: 70,
    missiles: 3,
    passengerBerths: 0,
    marketSeed: SEED,
    systemId: "g0-s7",
    stationKey: "coriolis-station",
  };

  it("fits the maximum tuple inside MAX_SAVE_CHARS even with worst-case escaping", async () => {
    const store = new MemorySaveStore();
    // Control characters double the pressure: every one encodes as `\u00XX`.
    const result = await queueAutosave(
      store,
      1,
      {
        ...maximumInputs,
        systemId: "\u0000".repeat(16),
        stationKey: "\u0000".repeat(64),
      },
      MAX_ALLOW,
    );

    expect(result.committed).toBe(true);
    expect(store.raw).not.toBeNull();
    expect(store.raw!.length).toBeLessThanOrEqual(MAX_SAVE_CHARS);
  });

  it("round-trips the maximum equipment tuple through the parser", async () => {
    const store = new MemorySaveStore();
    const result = await queueAutosave(store, 1, maximumInputs, MAX_ALLOW);
    expect(result.committed).toBe(true);

    const parsed = parseSave(store.raw, MAX_ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.equipment).toEqual(MAX_EQUIPMENT);
    expect(parsed.save.credits).toBe(MAX_SAVE_CREDITS);
    expect(parsed.save.clockSeconds).toBe(CLOCK_START + MAX_SAVE_CLOCK_DELTA);
  });
});

describe("queueAutosave failure paths", () => {
  it("reports a rejected store without throwing", async () => {
    const store = new MemorySaveStore({ rejectWrites: true });
    const inputs = snapshotForSave(
      initFlightState(layout),
      newProfile(),
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );
    const result = await queueAutosave(store, 1, inputs, ALLOW);
    expect(result.committed).toBe(false);
    expect(result.reason).toContain("rejected");
  });

  it("reports a swallowed write failure without throwing", async () => {
    const store = new MemorySaveStore({ failWrites: true });
    const inputs = snapshotForSave(
      initFlightState(layout),
      newProfile(),
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );
    const result = await queueAutosave(store, 1, inputs, ALLOW);
    expect(result).toMatchObject({ committed: false, revision: 1 });
    expect(result.reason).toBe("write-failed");
  });

  it("refuses to commit a snapshot its own schema rejects", async () => {
    const store = new MemorySaveStore();
    const valid = snapshotForSave(
      initFlightState(layout),
      newProfile(),
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );
    // A negative balance cannot be encoded into a blob `parseSave` accepts.
    const result = await queueAutosave(
      store,
      1,
      { ...valid, credits: -1 },
      ALLOW,
    );

    expect(result).toMatchObject({
      committed: false,
      revision: 1,
      reason: "invalid-save",
    });
    expect(store.writes).toHaveLength(0);
    expect(store.raw).toBeNull();
  });

  it("over-capacity snapshot is refused and leaves the previous bytes", async () => {
    const store = new MemorySaveStore();
    const valid = snapshotForSave(
      initFlightState(layout),
      newProfile(),
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );
    expect((await queueAutosave(store, 1, valid, ALLOW)).committed).toBe(true);
    const previous = store.raw;
    expect(previous).not.toBeNull();

    // 20 t of food already fills every pod; 500 kg of gold needs one more.
    const overCapacity = {
      ...valid,
      cargo: [
        { key: "food", quantity: 20 },
        { key: "gold", quantity: 500 },
      ],
    };
    const rejected = await queueAutosave(store, 2, overCapacity, ALLOW);
    expect(rejected).toMatchObject({
      committed: false,
      revision: 2,
      reason: "invalid-save",
    });
    expect(store.raw).toBe(previous);
    expect(store.writes).toHaveLength(1);

    // The rejected snapshot must not poison the next valid write.
    const nextValid = { ...valid, credits: 900 };
    expect((await queueAutosave(store, 3, nextValid, ALLOW)).committed).toBe(
      true,
    );
    expect(store.writes).toHaveLength(2);
  });
});

describe("revision ordering", () => {
  it("commits revisions in order and ignores a late older write", async () => {
    const store = new MemorySaveStore();
    const first = snapshotForSave(
      initFlightState(layout),
      profileWithCredits(1000),
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );
    const second = snapshotForSave(
      initFlightState(layout),
      profileWithCredits(2000),
      SYSTEM,
      STATION,
      SEED,
      COMMODITIES,
    );

    expect((await queueAutosave(store, 1, first, ALLOW)).committed).toBe(true);
    expect((await queueAutosave(store, 2, second, ALLOW)).committed).toBe(true);
    expect(store.writes).toHaveLength(2);
    expect(store.committedRevision).toBe(2);

    const late = await queueAutosave(store, 1, first, ALLOW);
    expect(late).toMatchObject({ committed: false, revision: 1 });
    expect(late.reason).toBe("stale");

    const parsed = parseSave(store.raw, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.credits).toBe(2000);
  });
});

describe("restoreFromSave", () => {
  it("restores docked mode at the saved clock with the profile", () => {
    const save: SaveV1 = {
      version: 1,
      mode: "docked",
      clockSeconds: CLOCK_START + 660,
      credits: 5000,
      equipment: ["EQ_DOCK_COMP"],
      system: { id: "g0-s7" },
      station: { key: "coriolis-station" },
    };

    const restored = restoreFromSave(save, layout, profileFromSave);

    expect(restored.state.mode).toBe("docked");
    expect(restored.state.clockSeconds).toBe(CLOCK_START + 660);
    expect(restored.state.speed).toBe(0);
    // D-13: the pose is derived from the layout, never stored.
    expect(restored.state.position).toEqual(initFlightState(layout).position);
    expect(restored.profile.credits).toBe(5000);
    expect(restored.profile.equipment).toEqual(["EQ_DOCK_COMP"]);
    // A Phase 4 blob carries no seed; the boot defaults it, not this factory.
    expect(restored.marketSeed).toBeUndefined();
  });

  it("returns the persisted market seed when the blob carries one", () => {
    const save: SaveV1 = {
      version: 1,
      mode: "docked",
      clockSeconds: CLOCK_START + 660,
      credits: 5000,
      equipment: [],
      marketSeed: SEED,
      system: { id: "g0-s7" },
      station: { key: "coriolis-station" },
    };

    expect(restoreFromSave(save, layout, profileFromSave).marketSeed).toBe(
      SEED,
    );
  });
});
