// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The compass and a destroyed witchpoint beacon (plan 18-08, D-05, A7).
 *
 * Oolite's `validateCompassTarget` (PlayerEntity.m:4655-4659 at 7437f22) sets
 * the compass mode to PLANET and the target to the planet when the selected
 * target is gone, so a compass left on the destroyed witchpoint beacon turns
 * to the planet and stays there. Its `setNextCompassMode` (4761-4808) walks
 * live beacons only, so the manual cycle skips a destroyed one; Wegolite keeps
 * its own cycle model (FIDELITY 'Compass cycle model') and skips the destroyed
 * witchpoint, `station -> auto`.
 *
 * Every case runs through `stepFlight`, the only writer of the compass mode,
 * with the field the session builds from the live world (`createShipField`) or
 * a fake one where the case needs a buoy to come back to life.
 */

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { hashFlight, initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { ADVANCED_COMPASS_KEY, stepFlight } from "../../src/sim/flight/step.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import { vec } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { createShipField } from "../../src/sim/world/ship-field.js";
import type { ShipField } from "../../src/sim/world/ship-field.js";
import type { BuoyKey } from "../../src/sim/world/statics.js";
import { createWorld } from "../../src/sim/world/world.js";
import type { Command } from "../../src/sim/commands.js";
import { laveFixture } from "../helpers/lave.js";

const { layout, config } = laveFixture();
const WITH_ASC: StepOptions = { equipment: new Set([ADVANCED_COMPASS_KEY]) };

/** A ship launched and handed over, in flight beside the station. */
function launched(ships?: ShipField): FlightState {
  const state = initFlightState(layout);
  for (const kind of ["launch", "skipLaunch"] as const) {
    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      [{ kind }],
      DT,
      WITH_ASC,
      ships,
    );
  }
  expect(state.mode).toBe("inFlight");
  return state;
}

/** A field whose witchpoint buoy is `alive`; nothing mass-locks or blocks. */
function fakeField(witchpointAlive: () => boolean): ShipField {
  return {
    massLocked: () => false,
    blocks: () => false,
    buoy: (key: BuoyKey) => ({
      alive: key === "witchpoint" ? witchpointAlive() : true,
      offset: vec(0, 0, 0),
      subentityAttached: true,
    }),
  };
}

function step(
  state: FlightState,
  ships: ShipField | undefined,
  commands: readonly Command[] = [],
): void {
  stepFlight(state, layout, config, ZERO_INTENT, commands, DT, WITH_ASC, ships);
}

describe("the compass leaves a destroyed witchpoint beacon (PlayerEntity.m:4655-4659)", () => {
  it("turns a witchpoint compass to the planet, mode and target", () => {
    const state = launched();
    state.compassMode = "witchpoint";
    step(
      state,
      fakeField(() => false),
    );
    expect(state.compassMode).toBe("planet");
    expect(state.compassTarget).toBe("planet");
  });

  it("keeps the planet on later steps even if a field reports the buoy alive again", () => {
    let alive = false;
    const ships = fakeField(() => alive);
    const state = launched();
    state.compassMode = "witchpoint";
    step(state, ships);
    alive = true;
    for (let tick = 0; tick < 5; tick += 1) step(state, ships);
    expect(state.compassMode).toBe("planet");
    expect(state.compassTarget).toBe("planet");
  });

  it("falls back on the first stepped tick after the buoy is destroyed while selected", () => {
    const world = createWorld(1);
    const state = launched(createShipField(world, undefined));
    state.compassMode = "witchpoint";
    step(state, createShipField(world, undefined));
    expect(state.compassMode).toBe("witchpoint");
    expect(state.compassTarget).toBe("witchpoint");

    world.staticHealth.witchpoint = 0;
    step(state, createShipField(world, undefined));
    expect(state.compassMode).toBe("planet");
    expect(state.compassTarget).toBe("planet");
  });

  it("leaves the planet, station and auto modes alone with the buoy destroyed", () => {
    for (const mode of ["auto", "planet", "station"] as const) {
      const state = launched();
      state.compassMode = mode;
      step(
        state,
        fakeField(() => false),
      );
      expect(state.compassMode).toBe(mode);
    }
  });

  it("changes nothing with no field or with a live witchpoint buoy", () => {
    const bare = launched();
    const live = launched();
    bare.compassMode = "witchpoint";
    live.compassMode = "witchpoint";
    step(bare, undefined);
    step(
      live,
      fakeField(() => true),
    );
    for (const state of [bare, live]) {
      expect(state.compassMode).toBe("witchpoint");
      expect(state.compassTarget).toBe("witchpoint");
    }
    expect(hashFlight(live)).toBe(hashFlight(bare));
  });

  it("does not fall back while docked: the compass is not resolved there", () => {
    const state = initFlightState(layout);
    state.compassMode = "witchpoint";
    step(
      state,
      fakeField(() => false),
    );
    expect(state.mode).toBe("docked");
    expect(state.compassMode).toBe("witchpoint");
  });
});

describe("the manual cycle skips a destroyed witchpoint beacon (PlayerEntity.m:4761-4808)", () => {
  it("cycles station -> auto with the buoy destroyed", () => {
    const state = launched();
    state.compassMode = "station";
    step(
      state,
      fakeField(() => false),
      [{ kind: "cycleCompass" }],
    );
    expect(state.compassMode).toBe("auto");
  });

  it("cycles station -> witchpoint with the buoy alive or no field", () => {
    for (const ships of [undefined, fakeField(() => true)]) {
      const state = launched();
      state.compassMode = "station";
      step(state, ships, [{ kind: "cycleCompass" }]);
      expect(state.compassMode).toBe("witchpoint");
      expect(state.compassTarget).toBe("witchpoint");
    }
  });

  it("never lands on the witchpoint over a full cycle with the buoy destroyed", () => {
    const state = launched();
    const seen: string[] = [];
    for (let press = 0; press < 6; press += 1) {
      step(
        state,
        fakeField(() => false),
        [{ kind: "cycleCompass" }],
      );
      seen.push(state.compassMode);
    }
    expect(seen).toEqual([
      "planet",
      "station",
      "auto",
      "planet",
      "station",
      "auto",
    ]);
  });
});
