// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The witchspace mass blockage (NAV-04, plan 06-16).
 *
 * Oolite refuses a completing jump when 0.1 times the blocker's mass is greater
 * than the squared distance, and the blocker lies inside the scanner range
 * (ShipEntity.m lines 12498-12531). The check runs at countdown completion only
 * (PlayerEntity.m lines 6547 and 6772-6775), so a begin beside the station is
 * never refused. The fixtures are Oolite's: the Coriolis mass comes from the
 * source comment at ShipEntity.m line 12504.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { SimEvent } from "../../src/sim/events.js";
import type { Command } from "../../src/sim/commands.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import {
  CORIOLIS_STATION_MASS,
  HYPERSPACE_COUNTDOWN_STEPS,
  isWitchspaceBlocked,
  witchspaceBlockedAt,
  witchspaceStationMass,
  WITCH_BLOCK_K,
} from "../../src/sim/hyperspace/countdown.js";
import { add, vec } from "../../src/sim/math.js";
import { DT } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

interface ChartSystem {
  readonly id: string;
  readonly name: string;
  readonly chartX: number;
  readonly chartY: number;
}

const systems = JSON.parse(
  readFileSync(
    new URL("../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as ChartSystem[];

function byName(name: string): ChartSystem {
  const found = systems.find((system) => system.name === name);
  if (found === undefined) throw new Error(`galaxy 0 has no system "${name}"`);
  return found;
}

describe("witchspace mass blockage (NAV-04)", () => {
  const lave = byName("Lave");
  const diso = byName("Diso");
  const fixture = laveFixture();
  const { layout, config } = fixture;
  const laveOrigin = { id: lave.id, x: lave.chartX, y: lave.chartY };
  const scannerRange = layout.scannerRange;
  const stationPosition = layout.station.position;

  /** A ship in flight at `distance` metres along +X from the station. */
  function shipAt(distance: number): FlightState {
    const state = initFlightState(layout);
    state.mode = "inFlight";
    state.dockArmed = false;
    state.position = add(stationPosition, vec(distance, 0, 0));
    return state;
  }

  function optionsWith(stationMass?: number): StepOptions {
    return {
      hyperspace: {
        fuel: 70,
        origin: laveOrigin,
        target: { id: diso.id, x: diso.chartX, y: diso.chartY },
        ...(stationMass === undefined ? {} : { stationMass }),
      },
    };
  }

  function step(
    state: FlightState,
    commands: readonly Command[],
    options: StepOptions,
  ): SimEvent[] {
    return stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      commands,
      DT,
      options,
    );
  }

  const begin: readonly Command[] = [{ kind: "beginHyperspace" }];

  it("maps the Coriolis station kind to its recorded mass and no other kind", () => {
    expect(witchspaceStationMass("coriolis")).toBe(455_223_200);
    expect(witchspaceStationMass("coriolis")).toBe(CORIOLIS_STATION_MASS);
    expect(witchspaceStationMass("dodecahedron")).toBeUndefined();
    expect(witchspaceStationMass("icosahedron")).toBeUndefined();
  });

  it("pins the strict mass threshold on both sides", () => {
    const threshold = WITCH_BLOCK_K * CORIOLIS_STATION_MASS;
    expect(
      isWitchspaceBlocked(threshold - 1, CORIOLIS_STATION_MASS, scannerRange),
    ).toBe(true);
    expect(
      isWitchspaceBlocked(threshold + 1, CORIOLIS_STATION_MASS, scannerRange),
    ).toBe(false);
    // Exactly at the threshold is not strictly greater, so it does not block.
    expect(
      isWitchspaceBlocked(threshold, CORIOLIS_STATION_MASS, scannerRange),
    ).toBe(false);
  });

  it("pins the exact scanner-range boundary with a synthetic mass", () => {
    const mass = 1e10;
    const range = 25_600;
    expect(isWitchspaceBlocked(range * range - 1, mass, range)).toBe(true);
    expect(isWitchspaceBlocked(range * range, mass, range)).toBe(false);
  });

  it("blocks at 6,700 m and does not block at 6,800 m", () => {
    const inside = add(stationPosition, vec(6_700, 0, 0));
    const outside = add(stationPosition, vec(6_800, 0, 0));
    expect(
      witchspaceBlockedAt(
        inside,
        stationPosition,
        CORIOLIS_STATION_MASS,
        scannerRange,
      ),
    ).toBe(true);
    expect(
      witchspaceBlockedAt(
        outside,
        stationPosition,
        CORIOLIS_STATION_MASS,
        scannerRange,
      ),
    ).toBe(false);
  });

  it("keeps a docked ship's begin inert: no countdown is started", () => {
    const state = initFlightState(layout);
    expect(state.mode).toBe("docked");
    const events = step(state, begin, optionsWith(CORIOLIS_STATION_MASS));
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();
    expect(
      events.some((event) => event.kind === "hyperspaceCountdownStarted"),
    ).toBe(false);
    expect(events.some((event) => event.kind === "hyperspaceRefused")).toBe(
      false,
    );
  });

  it("does not refuse a begin at 6,700 m for blockage", () => {
    const state = shipAt(6_700);
    const events = step(state, begin, optionsWith(CORIOLIS_STATION_MASS));
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS);
    const kinds = events.map((event) => event.kind);
    expect(kinds).toContain("hyperspaceCountdownStarted");
    expect(kinds).not.toContain("hyperspaceRefused");
  });

  it("refuses a completion at 6,700 m as blocked, with no fuel or jump time spent", () => {
    const state = shipAt(6_700);
    step(state, begin, optionsWith(CORIOLIS_STATION_MASS));
    const clockBefore = state.clockSeconds;
    let lastEvents: SimEvent[] = [];
    let jumpedCount = 0;
    let refusedCount = 0;
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
      const events = step(state, [], optionsWith(CORIOLIS_STATION_MASS));
      jumpedCount += events.filter(
        (event) => event.kind === "hyperspaceJumped",
      ).length;
      refusedCount += events.filter(
        (event) => event.kind === "hyperspaceRefused",
      ).length;
      lastEvents = events;
    }
    expect(jumpedCount).toBe(0);
    expect(refusedCount).toBe(1);
    expect(lastEvents).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked" },
    ]);
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();
    // The ordinary per-step time advances over the 1,800 steps (about 15 s), and
    // no jump time (46,656 s to Diso) is added.
    const elapsed = state.clockSeconds - clockBefore;
    expect(elapsed).toBeCloseTo(DT * HYPERSPACE_COUNTDOWN_STEPS, 1);
    expect(elapsed).toBeLessThan(100);
  });

  it("commits the jump when the ship has left the radius before completion", () => {
    const state = shipAt(6_700);
    step(state, begin, optionsWith(CORIOLIS_STATION_MASS));
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS - 1; i += 1) {
      step(state, [], optionsWith(CORIOLIS_STATION_MASS));
    }
    state.position = add(stationPosition, vec(6_800, 0, 0));
    const events = step(state, [], optionsWith(CORIOLIS_STATION_MASS));
    const jumped = events.find((event) => event.kind === "hyperspaceJumped");
    expect(jumped).toBeDefined();
    if (jumped?.kind !== "hyperspaceJumped") throw new Error("expected a jump");
    expect(jumped.destinationId).toBe(diso.id);
    expect(jumped.clockDeltaSeconds).toBe(46_656);
  });

  it("keeps the default path unchanged when no station mass is supplied", () => {
    const state = shipAt(6_700);
    step(state, begin, optionsWith());
    let jumped = false;
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
      const events = step(state, [], optionsWith());
      if (events.some((event) => event.kind === "hyperspaceJumped"))
        jumped = true;
    }
    expect(jumped).toBe(true);
  });
});
