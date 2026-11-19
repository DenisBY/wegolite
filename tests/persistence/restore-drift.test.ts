// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * A Load never carries the player's drift (CBT-18, D-02, D-04 save half).
 *
 * Saves are unchanged by the drift: `snapshotForSave` writes no drift, and
 * `restoreFromSave` starts from `initFlightState`, whose drift is zero. A
 * player saved while drifting therefore restores at rest in the drift, with
 * no `drift=` line in the flight hash. The save and restore run through the
 * game's own writer and parser, as in `autosave.test.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  profileFromSave,
  queueAutosave,
  restoreFromSave,
  snapshotForSave,
} from "../../src/persistence/autosave.js";
import type { SaveWorldCounters } from "../../src/persistence/autosave.js";
import { MemorySaveStore } from "../../src/persistence/memory-store.js";
import { parseSave } from "../../src/persistence/save.js";
import type { SaveAllowLists } from "../../src/persistence/save.js";
import { generateMarket } from "../../src/sim/economy/market.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { completeLaunch } from "../../src/sim/flight/launch.js";
import {
  initFlightState,
  serializeFlight,
} from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { vec } from "../../src/sim/math.js";
import { newProfile } from "../../src/sim/player/profile.js";
import { DT } from "../../src/sim/time.js";
import { commoditiesFixture } from "../helpers/commodities.js";
import { laveFixture } from "../helpers/lave.js";

const lave = laveFixture();
const { layout, config } = lave;
const COMMODITIES = commoditiesFixture();
const MARKET = generateMarket(lave.system, COMMODITIES, 0x12345678);

const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map([["food", "t"]]),
  marketGoods: new Set(COMMODITIES.map((commodity) => commodity.key)),
};

const NO_WORLD: SaveWorldCounters = {
  epoch: 0,
  anchorNextEntityId: undefined,
};

describe("restoreFromSave and the drift", () => {
  it("restores an in-flight save taken while drifting with zero drift", async () => {
    const state = initFlightState(layout);
    stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    completeLaunch(state);
    state.drift = vec(68, -12, 5);
    for (let tick = 0; tick < 12; tick += 1) {
      stepFlight(state, layout, config, ZERO_INTENT, [], DT);
    }
    expect(state.mode).toBe("inFlight");
    expect(serializeFlight(state)).toContain("drift=");

    const store = new MemorySaveStore();
    const inputs = snapshotForSave(
      state,
      newProfile(),
      { id: "g0-s7" },
      { key: "coriolis-station" },
      MARKET,
      COMMODITIES,
      NO_WORLD,
    );
    expect(inputs.mode).toBe("inFlight");
    expect(JSON.stringify(inputs)).not.toContain("drift");
    const written = await queueAutosave(store, 1, inputs, ALLOW);
    expect(written.committed).toBe(true);

    const parsed = parseSave(store.raw, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = restoreFromSave(parsed.save, layout, profileFromSave);

    expect(restored.state.mode).toBe("inFlight");
    expect(restored.state.drift).toEqual(vec(0, 0, 0));
    expect(serializeFlight(restored.state)).not.toContain("drift");
  });

  it("restores a docked save with zero drift", async () => {
    const state = initFlightState(layout);
    state.drift = vec(1, 2, 3);

    const store = new MemorySaveStore();
    const inputs = snapshotForSave(
      state,
      newProfile(),
      { id: "g0-s7" },
      { key: "coriolis-station" },
      MARKET,
      COMMODITIES,
      NO_WORLD,
    );
    const written = await queueAutosave(store, 1, inputs, ALLOW);
    expect(written.committed).toBe(true);
    const parsed = parseSave(store.raw, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const restored = restoreFromSave(parsed.save, layout, profileFromSave);
    expect(restored.state.mode).toBe("docked");
    expect(restored.state.drift).toEqual(vec(0, 0, 0));
  });
});
