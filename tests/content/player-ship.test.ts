// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player and station catalogue values (FLGT-01, FLGT-03, T-3-26).
 *
 * These are the authored numbers every flight value is derived from. The wrong
 * Cobra entry (`cobra3-trader` 300/30 or `cobra3-alternate` 300/32/35 t) and a
 * missing field are the two realistic ways this drifts, so both are pinned:
 * the values by exact equality, and the failure by a named error that names
 * the field. `deriveFlightConfig` must never default a missing flight value to
 * zero — a ship that cannot turn would look like a physics bug.
 */

import { describe, expect, it } from "vitest";

import type { ShipDef } from "../../src/content/types.js";
import {
  deriveFlightConfig,
  FlightConfigError,
} from "../../src/sim/flight/config.js";
import { deriveSystemLayout, LayoutError } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";

/** Run a call that must throw and return its message for assertion. */
function messageOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the call to throw, but it returned normally");
}

describe("player ship catalogue entry", () => {
  const fixture = laveFixture();

  it("pins the Cobra Mk III player template", () => {
    const player = fixture.playerDef;
    expect(player.maxFlightSpeed).toBe(350);
    expect(player.thrust).toBe(32);
    expect(player.maxFlightPitch).toBe(1);
    expect(player.maxFlightRoll).toBe(2);
    expect(player.maxCargo).toBe(20);
    expect(player.fuel).toBe(70);
  });

  it("pins the Coriolis station roll, rotation and dock subentity", () => {
    const station = fixture.stationDef;
    expect(station.stationRoll).toBe(0.08);
    expect(station.rotating).toBe(true);

    const dock = station.subentities.find(
      (subentity) => subentity.isDock === true,
    );
    if (dock === undefined) {
      throw new Error("the Coriolis catalogue entry has no dock subentity");
    }
    expect(dock.position).toEqual([0, 0, 500.2561]);
  });

  it("derives the Cobra flight config from the catalogue values", () => {
    const config = deriveFlightConfig(fixture.playerDef);
    expect(config.thrustAccel).toBe(160);
    expect(config.pitchAccel).toBe(2);
    expect(config.rollAccel).toBe(4);
    expect(config.maxPitch).toBe(1);
    expect(config.precisionFactor).toBe(0.5);
    expect(config.launchSpeed).toBe(175);
  });

  it("throws a named FlightConfigError naming a missing thrust field", () => {
    const playerWithoutThrust: ShipDef = { ...fixture.playerDef };
    delete (playerWithoutThrust as { thrust?: number }).thrust;

    expect(() => deriveFlightConfig(playerWithoutThrust)).toThrow(
      FlightConfigError,
    );
    expect(messageOf(() => deriveFlightConfig(playerWithoutThrust))).toContain(
      "thrust",
    );
  });

  it("throws a named LayoutError naming the dock when the station has no subentities", () => {
    const stationWithoutDock: ShipDef = {
      ...fixture.stationDef,
      subentities: [],
    };

    expect(() =>
      deriveSystemLayout(fixture.system, stationWithoutDock),
    ).toThrow(LayoutError);
    expect(
      messageOf(() => deriveSystemLayout(fixture.system, stationWithoutDock)),
    ).toContain("dock");
  });
});
