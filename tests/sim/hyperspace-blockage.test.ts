// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The witchspace mass blockage (NAV-04, plan 06-16).
 *
 * Oolite refuses a completing jump when 0.1 times the blocker's mass is greater
 * than the squared distance, and the blocker lies inside the scanner range
 * (ShipEntity.m lines 12498-12531). The check runs at countdown completion only
 * (PlayerEntity.m lines 6547 and 6772-6775), so a begin beside the station is
 * never refused. The Coriolis mass is the one the content build computes from
 * the pinned meshes (hull octree plus the faceplate, tris and dock parts,
 * ShipEntity.m lines 417-419 and 2034-2041), pinned equal to the compiled record
 * in src/content/generated/ships-client.json. It replaces the 455,223,200 of the
 * source comment at ShipEntity.m line 12504 (owner decision, plan 10-03, see the
 * PROJECT.md Key Decisions row "Coriolis blockage mass:"); the blockage radius
 * is about 7,179.7 m.
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
  BUOY_SUBENTITY_MASS,
  CORIOLIS_STATION_MASS,
  HYPERSPACE_COUNTDOWN_STEPS,
  isWitchspaceBlocked,
  NAV_BUOY_HULL_MASS,
  NAV_BUOY_MASS,
  witchspaceBlockedAt,
  witchspaceStationMass,
  WITCH_BLOCK_K,
} from "../../src/sim/hyperspace/countdown.js";
import { add, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import type { ShipField } from "../../src/sim/world/ship-field.js";
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
    expect(witchspaceStationMass("coriolis")).toBe(515_483_904);
    expect(witchspaceStationMass("coriolis")).toBe(CORIOLIS_STATION_MASS);
    expect(witchspaceStationMass("dodecahedron")).toBeUndefined();
    expect(witchspaceStationMass("icosahedron")).toBeUndefined();
  });

  it("pins the constant to the compiled Coriolis mass", () => {
    const catalogue = JSON.parse(
      readFileSync(
        new URL(
          "../../src/content/generated/ships-client.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { key: string; mass: number }[];
    const coriolis = catalogue.find(
      (entry) => entry.key === "coriolis-station",
    );
    if (coriolis === undefined) throw new Error("no coriolis-station entry");
    expect(coriolis.mass).toBe(CORIOLIS_STATION_MASS);
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

  it("blocks at 7,100 m and does not block at 7,300 m", () => {
    const inside = add(stationPosition, vec(7_100, 0, 0));
    const outside = add(stationPosition, vec(7_300, 0, 0));
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

  it("does not refuse a begin at 7,100 m for blockage", () => {
    const state = shipAt(7_100);
    const events = step(state, begin, optionsWith(CORIOLIS_STATION_MASS));
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS);
    const kinds = events.map((event) => event.kind);
    expect(kinds).toContain("hyperspaceCountdownStarted");
    expect(kinds).not.toContain("hyperspaceRefused");
  });

  it("refuses a completion at 7,100 m as blocked, with no fuel or jump time spent", () => {
    const state = shipAt(7_100);
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
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "station" },
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
    const state = shipAt(7_100);
    step(state, begin, optionsWith(CORIOLIS_STATION_MASS));
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS - 1; i += 1) {
      step(state, [], optionsWith(CORIOLIS_STATION_MASS));
    }
    state.position = add(stationPosition, vec(7_300, 0, 0));
    const events = step(state, [], optionsWith(CORIOLIS_STATION_MASS));
    const jumped = events.find((event) => event.kind === "hyperspaceJumped");
    expect(jumped).toBeDefined();
    if (jumped?.kind !== "hyperspaceJumped") throw new Error("expected a jump");
    expect(jumped.destinationId).toBe(diso.id);
    expect(jumped.clockDeltaSeconds).toBe(46_656);
  });

  it("keeps the default path unchanged when no station mass is supplied", () => {
    const state = shipAt(7_100);
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

/**
 * The two navigation buoys block a completing jump (Phase 18, D-09, PD-01).
 * Oolite's loop tests every ship, buoys included, by `0.1 x [ship mass] > d^2`
 * and `d^2 < SCANNER_MAX_RANGE2` (ShipEntity.m lines 12498-12531). The buoy's
 * mass is the composite the content build compiles (hull 691,044.375 plus the
 * frangible subentity 7,646.786), so the blockage radius is
 * `sqrt(69,869.11875)`, about 264.33 m.
 */
describe("witchspace buoy blockage (D-09)", () => {
  const lave = byName("Lave");
  const diso = byName("Diso");
  const fixture = laveFixture();
  const { layout, config } = fixture;
  const laveOrigin = { id: lave.id, x: lave.chartX, y: lave.chartY };
  const witchpoint = layout.witchpoint.position;
  const navBuoy = layout.navBuoy.position;

  interface BuoyOptions {
    readonly buoyMass?: number;
    readonly stationMass?: number;
  }

  function optionsWith(facts: BuoyOptions): StepOptions {
    return {
      hyperspace: {
        fuel: 70,
        origin: laveOrigin,
        target: { id: diso.id, x: diso.chartX, y: diso.chartY },
        ...(facts.stationMass === undefined
          ? {}
          : { stationMass: facts.stationMass }),
        ...(facts.buoyMass === undefined ? {} : { buoyMass: facts.buoyMass }),
      },
    };
  }

  function shipNear(centre: Vec3, distance: number): FlightState {
    const state = initFlightState(layout);
    state.mode = "inFlight";
    state.dockArmed = false;
    state.position = add(centre, vec(distance, 0, 0));
    return state;
  }

  /**
   * Begin a countdown at `state`'s pose and run it to completion; return the
   * completion tick's events, the countdown's refusal count and the clock it
   * spent.
   */
  function complete(
    state: FlightState,
    options: StepOptions,
    ships?: ShipField,
  ): { last: SimEvent[]; refused: number; elapsed: number } {
    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "beginHyperspace" }],
      DT,
      options,
      ships,
    );
    const clockBefore = state.clockSeconds;
    let last: SimEvent[] = [];
    let refused = 0;
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
      last = stepFlight(
        state,
        layout,
        config,
        ZERO_INTENT,
        [],
        DT,
        options,
        ships,
      );
      refused += last.filter(
        (event) => event.kind === "hyperspaceRefused",
      ).length;
    }
    return { last, refused, elapsed: state.clockSeconds - clockBefore };
  }

  function readJson<T>(path: string): T {
    return JSON.parse(
      readFileSync(new URL(path, import.meta.url), "utf8"),
    ) as T;
  }

  it("pins the buoy masses to the compiled catalogue and the static artifact", () => {
    const catalogue = readJson<{ key: string; mass: number }[]>(
      "../../src/content/generated/ships-client.json",
    );
    const buoy = catalogue.find((entry) => entry.key === "buoy");
    if (buoy === undefined) throw new Error("no buoy entry");
    expect(buoy.mass).toBe(NAV_BUOY_MASS);
    expect(NAV_BUOY_MASS).toBe(698_691.1875);

    const statics = readJson<{
      hulls: { key: string; subentities?: { mass: number }[] }[];
    }>("../../src/content/generated/ships-static-hulls.json");
    const hull = statics.hulls.find((entry) => entry.key === "buoy");
    expect(hull?.subentities?.[0]?.mass).toBe(BUOY_SUBENTITY_MASS);
    expect(BUOY_SUBENTITY_MASS).toBe(7_646.7861328125);

    // Oolite subtracts the dead subentity from a GLfloat mass (ShipEntity.m
    // line 8194), so the detached buoy holds the float32 of the difference,
    // which equals the compiled hull-only mass of oolite_buoy.dat
    // (tools/oolite-ingest/convert/ship-mass.test.ts line 112).
    expect(NAV_BUOY_HULL_MASS).toBe(
      Math.fround(NAV_BUOY_MASS - BUOY_SUBENTITY_MASS),
    );
    expect(NAV_BUOY_HULL_MASS).toBe(691_044.375);
  });

  it("puts the blockage radius between 263.3 m and 265.3 m", () => {
    const radius = Math.sqrt(WITCH_BLOCK_K * NAV_BUOY_MASS);
    expect(radius).toBeGreaterThan(264.3);
    expect(radius).toBeLessThan(264.4);
  });

  it("refuses a completion 263.3 m from the nav buoy, naming it, with no fuel or jump time spent", () => {
    const state = shipNear(navBuoy, 263.3);
    const result = complete(state, optionsWith({ buoyMass: NAV_BUOY_MASS }));
    expect(result.refused).toBe(1);
    expect(result.last).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "navBuoy" },
    ]);
    expect(state.hyperspaceCountdown).toBe(0);
    expect(state.hyperspaceTarget).toBeNull();
    expect(result.elapsed).toBeCloseTo(DT * HYPERSPACE_COUNTDOWN_STEPS, 1);
  });

  it("commits a completion 265.3 m from the nav buoy", () => {
    const state = shipNear(navBuoy, 265.3);
    const result = complete(state, optionsWith({ buoyMass: NAV_BUOY_MASS }));
    expect(result.refused).toBe(0);
    expect(result.last.map((event) => event.kind)).toContain(
      "hyperspaceJumped",
    );
  });

  it("names the witchpoint beacon when it blocks", () => {
    const inside = complete(
      shipNear(witchpoint, 263.3),
      optionsWith({ buoyMass: NAV_BUOY_MASS }),
    );
    expect(inside.last).toEqual([
      {
        kind: "hyperspaceRefused",
        reason: "blocked",
        blocker: "witchpointBeacon",
      },
    ]);
    const outside = complete(
      shipNear(witchpoint, 265.3),
      optionsWith({ buoyMass: NAV_BUOY_MASS }),
    );
    expect(outside.refused).toBe(0);
  });

  it("blocks nothing without a buoy mass, or with a NaN or negative one (T-18-16)", () => {
    for (const buoyMass of [undefined, Number.NaN, -1, 0]) {
      const facts = buoyMass === undefined ? {} : { buoyMass };
      for (const centre of [navBuoy, witchpoint]) {
        const result = complete(shipNear(centre, 10), optionsWith(facts));
        expect(result.refused).toBe(0);
        expect(result.last.map((event) => event.kind)).toContain(
          "hyperspaceJumped",
        );
      }
    }
  });

  it("checks the station first, then the buoys, then the NPC ships", () => {
    // A synthetic layout puts the nav buoy beside the station, so both block.
    const crowded = {
      ...layout,
      navBuoy: { ...layout.navBuoy, position: layout.station.position },
    };
    const atStation = initFlightState(crowded);
    atStation.mode = "inFlight";
    atStation.dockArmed = false;
    atStation.position = add(layout.station.position, vec(100, 0, 0));
    const both = optionsWith({
      buoyMass: NAV_BUOY_MASS,
      stationMass: CORIOLIS_STATION_MASS,
    });
    stepFlight(
      atStation,
      crowded,
      config,
      ZERO_INTENT,
      [{ kind: "beginHyperspace" }],
      DT,
      both,
    );
    let last: SimEvent[] = [];
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
      last = stepFlight(atStation, crowded, config, ZERO_INTENT, [], DT, both);
    }
    expect(last).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "station" },
    ]);

    // A field whose every ship blocks still loses to the buoy.
    const everyShipBlocks: ShipField = {
      massLocked: () => false,
      blocks: () => true,
      buoy: () => ({
        alive: true,
        offset: vec(0, 0, 0),
        subentityAttached: true,
      }),
    };
    const result = complete(
      shipNear(navBuoy, 10),
      optionsWith({ buoyMass: NAV_BUOY_MASS }),
      everyShipBlocks,
    );
    expect(result.last).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "navBuoy" },
    ]);
  });
});
