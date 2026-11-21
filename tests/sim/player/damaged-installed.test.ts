// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * A damaged item does not count as installed (Phase 19, SC2, D-06).
 *
 * The step options the session builds read `profile.equipment`, so removing a
 * damaged key from that list is the whole effect. Both cases here run through
 * `stepFlight` with `options.equipment` built from a damaged profile:
 *
 * - the docking computer: Shift+C inside the aegis is `dockDenied
 *   { reason: "notInstalled" }` with no dock and no clock jump;
 * - the Advanced Space Compass: a non-basic compass mode falls back to `auto`
 *   on the next step (Oolite `PlayerEntity.m:10256-10260`).
 *
 * The autopilot, galactic-jump and ANA clauses have no in-use state in
 * Wegolite and are recorded, with a tripwire, by plan 19-15.
 */

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import type { Command } from "../../../src/sim/commands.js";
import { applyEquipmentDamaged } from "../../../src/sim/player/damage.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";
import { DT } from "../../../src/sim/time.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();

/** The step options the session derives from a profile's installed list. */
function optionsFor(profile: PlayerProfile): StepOptions {
  return { equipment: new Set(profile.equipment) };
}

function owner(...equipment: string[]): PlayerProfile {
  return { ...newProfile(), equipment };
}

function inFlight(): FlightState {
  const state = initFlightState(layout);
  // The dock-mouth pose starts `inFlight` and inside the aegis.
  state.mode = "inFlight";
  return state;
}

function step(
  state: FlightState,
  commands: readonly Command[],
  options: StepOptions,
): ReturnType<typeof stepFlight> {
  return stepFlight(state, layout, config, ZERO_INTENT, commands, DT, options);
}

describe("a damaged docking computer behaves as not installed", () => {
  it("docks while the computer is installed (the control)", () => {
    const state = inFlight();

    const events = step(
      state,
      [{ kind: "dockingComputer" }],
      optionsFor(owner("EQ_DOCK_COMP")),
    );

    expect(state.mode).toBe("docked");
    expect(events.map((event) => event.kind)).toContain("docked");
  });

  it("refuses Shift+C with dockDenied notInstalled once the computer is damaged", () => {
    const damaged = applyEquipmentDamaged(
      owner("EQ_DOCK_COMP"),
      "EQ_DOCK_COMP",
    );
    expect(damaged.damagedEquipment).toEqual(["EQ_DOCK_COMP"]);
    const state = inFlight();
    const before = state.clockSeconds;

    const events = step(
      state,
      [{ kind: "dockingComputer" }],
      optionsFor(damaged),
    );

    expect(state.mode).toBe("inFlight");
    expect(state.clockSeconds - before).toBeLessThan(1);
    expect(events).toContainEqual({
      kind: "dockDenied",
      reason: "notInstalled",
    });
    expect(events.map((event) => event.kind)).not.toContain("docked");
  });
});

describe("a damaged Advanced Space Compass behaves as not installed", () => {
  it("keeps a non-basic mode while the compass is installed (the control)", () => {
    const state = inFlight();
    state.compassMode = "station";

    step(state, [], optionsFor(owner("EQ_ADVANCED_COMPASS")));

    expect(state.compassMode).toBe("station");
  });

  it("falls back to auto on the next step once the compass is damaged", () => {
    const damaged = applyEquipmentDamaged(
      owner("EQ_ADVANCED_COMPASS"),
      "EQ_ADVANCED_COMPASS",
    );
    for (const mode of ["planet", "station", "witchpoint"] as const) {
      const state = inFlight();
      state.compassMode = mode;

      step(state, [], optionsFor(damaged));

      expect(state.compassMode, mode).toBe("auto");
    }
  });
});
