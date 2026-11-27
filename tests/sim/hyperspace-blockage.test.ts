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
 *
 * Since Phase 22.1 (WORLD-20, plan 22.1-05) every station kind blocks with its
 * own compiled mass, read from the system's layout: the Dodecahedron (about
 * 9,551.7 m) and the Icosahedron (about 9,090.2 m) too. Their masses are pinned
 * to the measured Oolite fixture, tests/fixtures/oolite-reference/stations.json.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildStepOptions } from "../../src/app/session/step-options.js";
import type { System } from "../../src/content/types.js";
import type { StationKind } from "../../src/content/stations.js";
import { DEFAULT_LASER_MOUNTS } from "../../src/sim/combat/mounts.js";
import type { SimEvent } from "../../src/sim/events.js";
import type { Command } from "../../src/sim/commands.js";
import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import type { FlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import type { StepOptions } from "../../src/sim/flight/step.js";
import {
  BUOY_SUBENTITY_MASS,
  HYPERSPACE_COUNTDOWN_STEPS,
  isWitchspaceBlocked,
  NAV_BUOY_HULL_MASS,
  NAV_BUOY_MASS,
  witchspaceBlockedAt,
  WITCH_BLOCK_K,
} from "../../src/sim/hyperspace/countdown.js";
import { chartDistance } from "../../src/sim/hyperspace/jump.js";
import { add, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import type { ShipField } from "../../src/sim/world/ship-field.js";
import { DT } from "../../src/sim/time.js";
import { deriveSystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "../helpers/lave.js";
import { clientCatalogue, stationSpecOf } from "../helpers/stations.js";

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

  it("carries the compiled Coriolis mass on the layout", () => {
    const coriolis = clientCatalogue().find(
      (entry) => entry.key === "coriolis-station",
    );
    if (coriolis === undefined) throw new Error("no coriolis-station entry");
    expect(layout.stationMass).toBe(coriolis.mass);
    expect(layout.stationMass).toBe(515_483_904);
  });

  it("pins the strict mass threshold on both sides", () => {
    const threshold = WITCH_BLOCK_K * layout.stationMass;
    expect(
      isWitchspaceBlocked(threshold - 1, layout.stationMass, scannerRange),
    ).toBe(true);
    expect(
      isWitchspaceBlocked(threshold + 1, layout.stationMass, scannerRange),
    ).toBe(false);
    // Exactly at the threshold is not strictly greater, so it does not block.
    expect(
      isWitchspaceBlocked(threshold, layout.stationMass, scannerRange),
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
        layout.stationMass,
        scannerRange,
      ),
    ).toBe(true);
    expect(
      witchspaceBlockedAt(
        outside,
        stationPosition,
        layout.stationMass,
        scannerRange,
      ),
    ).toBe(false);
  });

  it("keeps a docked ship's begin inert: no countdown is started", () => {
    const state = initFlightState(layout);
    expect(state.mode).toBe("docked");
    const events = step(state, begin, optionsWith(layout.stationMass));
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
    const events = step(state, begin, optionsWith(layout.stationMass));
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS);
    const kinds = events.map((event) => event.kind);
    expect(kinds).toContain("hyperspaceCountdownStarted");
    expect(kinds).not.toContain("hyperspaceRefused");
  });

  it("refuses a completion at 7,100 m as blocked, with no fuel or jump time spent", () => {
    const state = shipAt(7_100);
    step(state, begin, optionsWith(layout.stationMass));
    const clockBefore = state.clockSeconds;
    let lastEvents: SimEvent[] = [];
    let jumpedCount = 0;
    let refusedCount = 0;
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
      const events = step(state, [], optionsWith(layout.stationMass));
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
    step(state, begin, optionsWith(layout.stationMass));
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS - 1; i += 1) {
      step(state, [], optionsWith(layout.stationMass));
    }
    state.position = add(stationPosition, vec(7_300, 0, 0));
    const events = step(state, [], optionsWith(layout.stationMass));
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
      stationMass: layout.stationMass,
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

/**
 * The per-kind blockage (Phase 22.1, WORLD-20, Success Criterion 2). Every
 * main-station kind blocks a completing jump inside `sqrt(0.1 x mass)` of its
 * own centre, with the mass the system's layout carries (the compiled record,
 * pinned to the measured Oolite fixture). The 2026-11-07 decision that left the
 * Dodecahedron and Icosahedron non-blocking for lack of a mass is superseded.
 * Each case builds its layout directly from the kind's spec and a real system of
 * that kind (the interim rule of plan 22.1-04: no app-level arrival).
 */
describe("witchspace station blockage per station kind (WORLD-20)", () => {
  interface MeasuredBlockage {
    readonly radius: string;
    readonly inner: string;
    readonly outer: string;
    readonly blockedInner: boolean;
    readonly blockedOuter: boolean;
  }
  interface MeasuredStation {
    readonly mass: string;
    readonly blockage: MeasuredBlockage;
  }

  const measured = (
    JSON.parse(
      readFileSync(
        new URL("../fixtures/oolite-reference/stations.json", import.meta.url),
        "utf8",
      ),
    ) as { stations: Record<string, MeasuredStation> }
  ).stations;

  const galaxy = JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/systems/g0.json", import.meta.url),
      "utf8",
    ),
  ) as System[];

  /** The kind's measured blockage radius to one decimal (Oolite 1.93.1-255). */
  const CASES: readonly {
    readonly kind: StationKind;
    readonly systemName: string;
    readonly radiusToOneDecimal: string;
  }[] = [
    { kind: "coriolis", systemName: "Lave", radiusToOneDecimal: "7179.7" },
    {
      kind: "dodecahedron",
      systemName: "Biarge",
      radiusToOneDecimal: "9551.7",
    },
    { kind: "icosahedron", systemName: "Zaonce", radiusToOneDecimal: "9090.2" },
  ];

  const { config } = laveFixture();

  function origin(name: string, kind: StationKind): System {
    const found = galaxy.find((system) => system.name === name);
    if (found === undefined)
      throw new Error(`galaxy 0 has no system "${name}"`);
    // Named explicitly: a case never picks its system by "not a Coriolis".
    expect(found.station).toBe(kind);
    return found;
  }

  /** The nearest other system, so the fuel (7.0 light years) always covers it. */
  function nearestTo(from: System): System {
    let best: System | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of galaxy) {
      if (candidate.id === from.id) continue;
      const distance = chartDistance(
        { x: from.chartX, y: from.chartY },
        { x: candidate.chartX, y: candidate.chartY },
      );
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (best === undefined || bestDistance > 17) {
      throw new Error(`no jump target within reach of ${from.name}`);
    }
    return best;
  }

  /** A countdown run to completion `distance` metres from the station. */
  function completeAt(kind: StationKind, systemName: string, distance: number) {
    const system = origin(systemName, kind);
    const target = nearestTo(system);
    const layout = deriveSystemLayout(system, stationSpecOf(kind));
    const options: StepOptions = {
      hyperspace: {
        fuel: 70,
        origin: { id: system.id, x: system.chartX, y: system.chartY },
        target: { id: target.id, x: target.chartX, y: target.chartY },
        stationMass: layout.stationMass,
      },
    };
    const state = initFlightState(layout);
    state.mode = "inFlight";
    state.dockArmed = false;
    state.position = add(layout.station.position, vec(distance, 0, 0));
    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "beginHyperspace" }],
      DT,
      options,
    );
    let last: SimEvent[] = [];
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
      last = stepFlight(state, layout, config, ZERO_INTENT, [], DT, options);
    }
    return last;
  }

  for (const { kind, systemName, radiusToOneDecimal } of CASES) {
    describe(`${kind} (${systemName})`, () => {
      const system = origin(systemName, kind);
      const layout = deriveSystemLayout(system, stationSpecOf(kind));
      const radius = Math.sqrt(WITCH_BLOCK_K * layout.stationMass);
      const fixtureStation = measured[layout.stationKey];

      it("carries the compiled mass and the measured Oolite mass and radius", () => {
        if (fixtureStation === undefined) {
          throw new Error(`the fixture has no station "${layout.stationKey}"`);
        }
        expect(String(layout.stationMass)).toBe(fixtureStation.mass);
        expect(radius.toFixed(1)).toBe(radiusToOneDecimal);
        expect(radius).toBeCloseTo(Number(fixtureStation.blockage.radius), 6);
      });

      it("matches the measured blocked and clear trials one metre inside and outside", () => {
        if (fixtureStation === undefined) {
          throw new Error(`the fixture has no station "${layout.stationKey}"`);
        }
        const { blockage } = fixtureStation;
        const inner = Number(blockage.inner);
        const outer = Number(blockage.outer);
        expect(
          isWitchspaceBlocked(
            inner * inner,
            layout.stationMass,
            layout.scannerRange,
          ),
        ).toBe(blockage.blockedInner);
        expect(
          isWitchspaceBlocked(
            outer * outer,
            layout.stationMass,
            layout.scannerRange,
          ),
        ).toBe(blockage.blockedOuter);
      });

      it("is strict at a squared distance of exactly 0.1 x mass", () => {
        const threshold = WITCH_BLOCK_K * layout.stationMass;
        expect(
          isWitchspaceBlocked(
            threshold,
            layout.stationMass,
            layout.scannerRange,
          ),
        ).toBe(false);
        expect(
          isWitchspaceBlocked(
            (radius - 1) * (radius - 1),
            layout.stationMass,
            layout.scannerRange,
          ),
        ).toBe(true);
        expect(
          isWitchspaceBlocked(
            (radius + 1) * (radius + 1),
            layout.stationMass,
            layout.scannerRange,
          ),
        ).toBe(false);
      });

      it("refuses a completing jump one metre inside the radius, naming the station", () => {
        expect(completeAt(kind, systemName, radius - 1)).toEqual([
          { kind: "hyperspaceRefused", reason: "blocked", blocker: "station" },
        ]);
      });

      it("completes the jump one metre outside the radius", () => {
        const last = completeAt(kind, systemName, radius + 1);
        expect(last.map((event) => event.kind)).toContain("hyperspaceJumped");
        expect(last.map((event) => event.kind)).not.toContain(
          "hyperspaceRefused",
        );
      });
    });
  }

  it("still blocks a completing jump at a nav buoy with the buoy's own mass, through the app's step options", () => {
    const system = origin("Biarge", "dodecahedron");
    const target = nearestTo(system);
    const layout = deriveSystemLayout(system, stationSpecOf("dodecahedron"));
    const options = buildStepOptions({
      fuel: 70,
      system,
      target,
      stationMass: layout.stationMass,
      equipment: new Set<string>(),
      dock: undefined,
      laserMounts: DEFAULT_LASER_MOUNTS,
    });
    expect(options.hyperspace?.buoyMass).toBe(NAV_BUOY_MASS);
    const state = initFlightState(layout);
    state.mode = "inFlight";
    state.dockArmed = false;
    state.position = add(layout.navBuoy.position, vec(263.3, 0, 0));
    stepFlight(
      state,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "beginHyperspace" }],
      DT,
      options,
    );
    let last: SimEvent[] = [];
    for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
      last = stepFlight(state, layout, config, ZERO_INTENT, [], DT, options);
    }
    expect(last).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "navBuoy" },
    ]);
  });
});
