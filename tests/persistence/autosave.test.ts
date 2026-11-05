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
  queueAutosave,
  restoreFromSave,
  snapshotForSave,
} from "../../src/persistence/autosave.js";
import { encodeSave, parseSave } from "../../src/persistence/save.js";
import type { SaveAllowLists, SaveV1 } from "../../src/persistence/save.js";
import {
  PlayerController,
  flightView,
} from "../../src/sim/flight/controller.js";
import { initFlightState, CLOCK_START } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import {
  newProfile,
  purchase,
  setCredits,
} from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture, scriptedFrame } from "../helpers/lave.js";

const { layout, config } = laveFixture();
const player = new PlayerController();

const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
};

const SYSTEM = { id: "g0-s7" };
const STATION = { key: "coriolis-station" };
const DOCK_COMPUTER = { key: "EQ_DOCK_COMP", price: 15_000, techLevel: 9 };

function launch(state: FlightState): void {
  const intent = player.update(flightView(state), scriptedFrame(0, 0, 0));
  stepFlight(state, layout, config, intent, [{ kind: "launch" }], DT);
}

function profileWithCredits(credits: number): PlayerProfile {
  return setCredits(newProfile(), credits);
}

describe("snapshotForSave", () => {
  it("records the post-launch clock, docked mode and identities", () => {
    const state = initFlightState(layout);
    launch(state);
    const profile = newProfile();

    const inputs = snapshotForSave(state, profile, SYSTEM, STATION);
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

  it("writes the reduced balance after a purchase", async () => {
    const purchased = purchase(profileWithCredits(20_000), DOCK_COMPUTER);
    expect(purchased.credits).toBe(5000);

    const store = new MemorySaveStore();
    const inputs = snapshotForSave(
      initFlightState(layout),
      purchased,
      SYSTEM,
      STATION,
    );
    const result = await queueAutosave(store, 1, inputs);
    expect(result.committed).toBe(true);

    const parsed = parseSave(store.raw, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.credits).toBe(5000);
    expect(parsed.save.equipment).toEqual(["EQ_DOCK_COMP"]);
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
    );
    const result = await queueAutosave(store, 1, inputs);
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
    );
    const result = await queueAutosave(store, 1, inputs);
    expect(result).toMatchObject({ committed: false, revision: 1 });
    expect(result.reason).toBe("write-failed");
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
    );
    const second = snapshotForSave(
      initFlightState(layout),
      profileWithCredits(2000),
      SYSTEM,
      STATION,
    );

    expect((await queueAutosave(store, 1, first)).committed).toBe(true);
    expect((await queueAutosave(store, 2, second)).committed).toBe(true);
    expect(store.writes).toHaveLength(2);
    expect(store.committedRevision).toBe(2);

    const late = await queueAutosave(store, 1, first);
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

    const restored = restoreFromSave(save, layout, (credits, equipment) => ({
      credits,
      equipment,
    }));

    expect(restored.state.mode).toBe("docked");
    expect(restored.state.clockSeconds).toBe(CLOCK_START + 660);
    expect(restored.state.speed).toBe(0);
    // D-13: the pose is derived from the layout, never stored.
    expect(restored.state.position).toEqual(initFlightState(layout).position);
    expect(restored.profile.credits).toBe(5000);
    expect(restored.profile.equipment).toEqual(["EQ_DOCK_COMP"]);
  });
});
