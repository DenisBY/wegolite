// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * NPC ships in mass lock and jump blockage (WORLD-10, simulation half).
 *
 * Expected values come from the rules, not from running the code under test:
 * a ship of a locking scan class locks strictly inside 25,600 m (Oolite
 * PlayerEntity.m line 2936, class switch lines 3044-3061), and a ship blocks a
 * completing jump when `0.1 x mass > d^2` and `d^2 < 25,600^2`
 * (ShipEntity.m lines 12498-12531). The squared-distance arithmetic in the
 * blockage rows is written out in each comment.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { torusFactor } from "../../../src/sim/flight/torus.js";
import {
  CORIOLIS_STATION_MASS,
  HYPERSPACE_COUNTDOWN_STEPS,
  NAV_BUOY_HULL_MASS,
  NAV_BUOY_MASS,
} from "../../../src/sim/hyperspace/countdown.js";
import type { Command } from "../../../src/sim/commands.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { add, identity, scale, sub, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { SCAN_CLASSES } from "../../../src/sim/world/ids.js";
import type { ScanClass } from "../../../src/sim/world/ids.js";
import {
  NON_LOCKING_SCAN_CLASSES,
  createShipField,
} from "../../../src/sim/world/ship-field.js";
import type { ShipMass } from "../../../src/sim/world/ship-field.js";
import {
  createWorld,
  killEntity,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();
const RANGE = layout.scannerRange;

/** The Phase 10 compiled masses (ships-npc.json), used as fixtures. */
const VIPER_MASS = 34_040.6796875;
const KRAIT_MASS = 93_291.40625;
const MASSES: readonly ShipMass[] = [
  { specKey: "viper", mass: VIPER_MASS },
  { specKey: "krait", mass: KRAIT_MASS },
];

/** Spawn one inert ship (no AI) and return it. */
function addShip(
  world: World,
  position: Vec3,
  scanClass: ScanClass = "CLASS_NEUTRAL",
  specKey = "viper",
) {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass,
      position,
      orientation: identity(),
      radius: 50,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/** A world holding one ship `distance` metres along +X from the origin. */
function worldWithShipAt(
  distance: number,
  scanClass: ScanClass = "CLASS_NEUTRAL",
  specKey = "viper",
): World {
  const world = createWorld(1);
  addShip(world, vec(distance, 0, 0), scanClass, specKey);
  return world;
}

const ORIGIN = vec(0, 0, 0);

describe("ship field: mass lock (WORLD-10)", () => {
  it("locks for a neutral ship strictly inside 25,600 m and not at the boundary", () => {
    // Strict, Oolite PlayerEntity.m line 2936: `zero_distance < SCANNER_MAX_RANGE2`.
    expect(
      createShipField(worldWithShipAt(25_599), undefined).massLocked(
        ORIGIN,
        RANGE,
      ),
    ).toBe(true);
    expect(
      createShipField(worldWithShipAt(25_600), undefined).massLocked(
        ORIGIN,
        RANGE,
      ),
    ).toBe(false);
    expect(
      createShipField(worldWithShipAt(25_601), undefined).massLocked(
        ORIGIN,
        RANGE,
      ),
    ).toBe(false);
  });

  it("measures centre to centre in three dimensions", () => {
    const world = createWorld(1);
    // 15,000 / 15,000 / 15,000 has d^2 = 6.75e8 > 25,600^2 = 6.5536e8: outside.
    addShip(world, vec(15_000, 15_000, 15_000));
    expect(createShipField(world, undefined).massLocked(ORIGIN, RANGE)).toBe(
      false,
    );
    // 14,000 on each axis has d^2 = 5.88e8 < 6.5536e8: inside.
    const inside = createWorld(1);
    addShip(inside, vec(14_000, 14_000, 14_000));
    expect(createShipField(inside, undefined).massLocked(ORIGIN, RANGE)).toBe(
      true,
    );
  });

  it("locks for the police class and for the other locking classes", () => {
    expect(
      createShipField(
        worldWithShipAt(100, "CLASS_POLICE"),
        undefined,
      ).massLocked(ORIGIN, RANGE),
    ).toBe(true);
    const locking = SCAN_CLASSES.filter(
      (scanClass) => !NON_LOCKING_SCAN_CLASSES.includes(scanClass),
    );
    // Oolite's `default:` branch locks every class not listed as exempt.
    expect(locking).toContain("CLASS_NEUTRAL");
    expect(locking).toContain("CLASS_POLICE");
    expect(locking).toContain("CLASS_MILITARY");
    for (const scanClass of locking) {
      expect(
        createShipField(worldWithShipAt(100, scanClass), undefined).massLocked(
          ORIGIN,
          RANGE,
        ),
        scanClass,
      ).toBe(true);
    }
  });

  it("names exactly the seven non-locking classes of PlayerEntity.m lines 3044-3061", () => {
    expect([...NON_LOCKING_SCAN_CLASSES].sort()).toEqual(
      [
        "CLASS_NO_DRAW",
        "CLASS_PLAYER",
        "CLASS_BUOY",
        "CLASS_ROCK",
        "CLASS_CARGO",
        "CLASS_MINE",
        "CLASS_VISUAL_EFFECT",
      ].sort(),
    );
    for (const scanClass of NON_LOCKING_SCAN_CLASSES) {
      expect(
        createShipField(worldWithShipAt(100, scanClass), undefined).massLocked(
          ORIGIN,
          RANGE,
        ),
        scanClass,
      ).toBe(false);
    }
  });

  it("ignores a dead ship and an empty world", () => {
    const world = createWorld(1);
    const ship = addShip(world, vec(100, 0, 0));
    expect(createShipField(world, undefined).massLocked(ORIGIN, RANGE)).toBe(
      true,
    );
    killEntity(world, ship.id);
    expect(createShipField(world, undefined).massLocked(ORIGIN, RANGE)).toBe(
      false,
    );
    expect(
      createShipField(createWorld(1), undefined).massLocked(ORIGIN, RANGE),
    ).toBe(false);
  });

  it("skips a dead ship but still sees a live one behind it", () => {
    const world = createWorld(1);
    const dead = addShip(world, vec(100, 0, 0));
    addShip(world, vec(200, 0, 0));
    killEntity(world, dead.id);
    expect(createShipField(world, undefined).massLocked(ORIGIN, RANGE)).toBe(
      true,
    );
  });
});

/** 120 km from the station, away from the planet: outside every body's lock. */
const OPEN_SPACE: Vec3 = sub(
  layout.station.position,
  scale(layout.stationToPlanet, 120_000),
);

function flightStep(
  state: FlightState,
  intent: ControlIntent = ZERO_INTENT,
  commands: readonly Command[] = [],
): SimEvent[] {
  return stepFlight(state, layout, config, intent, commands, DT);
}

/** Launch, skip the cinematic, and teleport to open space in `inFlight`. */
function flyingInOpenSpace(): FlightState {
  const state = initFlightState(layout);
  flightStep(state, ZERO_INTENT, [{ kind: "launch" }]);
  flightStep(state, ZERO_INTENT, [{ kind: "skipLaunch" }]);
  state.position = OPEN_SPACE;
  state.speed = config.maxSpeed;
  return state;
}

function simStep(
  state: FlightState,
  world: World | undefined,
  commands: readonly Command[] = [],
  options?: StepOptions,
): SimEvent[] {
  return stepSim(
    state,
    world,
    layout,
    config,
    ZERO_INTENT,
    commands,
    DT,
    options,
  );
}

const toggle: readonly Command[] = [{ kind: "toggleTorus" }];

describe("ship field: the torus through stepSim (WORLD-10)", () => {
  it("refuses to engage with a locking ship 10 km away", () => {
    const state = flyingInOpenSpace();
    const world = createWorld(3);
    addShip(world, add(OPEN_SPACE, vec(10_000, 0, 0)));

    const events = simStep(state, world, toggle);

    expect(state.torus.engaged).toBe(false);
    expect(state.torus.massLocked).toBe(true);
    // The same refused-request event as a body-caused lock (todo 2026-11-10).
    expect(events).toContainEqual({ kind: "torusRefused", reason: "massLock" });
    expect(events.some((e) => e.kind === "torusDisengaged")).toBe(false);
  });

  it("engages when the same ship is 30 km away", () => {
    const state = flyingInOpenSpace();
    const world = createWorld(3);
    addShip(world, add(OPEN_SPACE, vec(30_000, 0, 0)));

    simStep(state, world, toggle);

    expect(state.torus.engaged).toBe(true);
    expect(state.torus.massLocked).toBe(false);
  });

  it("does not lock for a non-locking class 10 km away", () => {
    const state = flyingInOpenSpace();
    const world = createWorld(3);
    addShip(world, add(OPEN_SPACE, vec(10_000, 0, 0)), "CLASS_CARGO");

    simStep(state, world, toggle);

    expect(state.torus.engaged).toBe(true);
  });

  it("disengages a running torus when a ship comes inside the range", () => {
    const state = flyingInOpenSpace();
    const world = createWorld(3);
    const ship = addShip(world, add(OPEN_SPACE, vec(40_000, 0, 0)));
    simStep(state, world, toggle);
    expect(state.torus.engaged).toBe(true);
    const factor = state.torus.factor;
    expect(factor).toBeGreaterThan(torusFactor(0));

    // The ship drifts in between ticks.
    ship.position = add(state.position, vec(10_000, 0, 0));
    const events = simStep(state, world);

    expect(state.torus.engaged).toBe(false);
    expect(state.torus.massLocked).toBe(true);
    expect(events).toContainEqual({ kind: "massLockChanged", locked: true });
    expect(events).toContainEqual({
      kind: "torusDisengaged",
      reason: "massLock",
    });
  });

  it("flies identically with no world, an empty world and an undefined ship-mass list", () => {
    const run = (world: World | undefined): string => {
      const state = flyingInOpenSpace();
      const log: string[] = [];
      for (let i = 0; i < 30; i += 1) {
        const events = simStep(state, world, i === 0 ? toggle : []);
        log.push(
          JSON.stringify([state.position, state.speed, state.torus, events]),
        );
      }
      return log.join("\n");
    };
    const bare = run(undefined);
    expect(run(createWorld(9))).toBe(bare);
  });
});

describe("ship field: jump blockage radius (WORLD-10)", () => {
  it("blocks a viper at 58.0 m and not at 58.5 m", () => {
    // 0.1 x 34,040.6796875 = 3,404.07 m^2. 58.0^2 = 3,364 is inside it;
    // 58.5^2 = 3,422.25 is outside it.
    expect(
      createShipField(worldWithShipAt(58), MASSES).blocks(ORIGIN, RANGE),
    ).toBe(true);
    expect(
      createShipField(worldWithShipAt(58.5), MASSES).blocks(ORIGIN, RANGE),
    ).toBe(false);
  });

  it("uses the mass of the ship's own specKey", () => {
    // A krait's 0.1 x 93,291.40625 = 9,329.14 m^2 gives a radius of 96.59 m: it
    // blocks at 96 m where the viper's 58.34 m radius would not.
    const krait = (distance: number) =>
      createShipField(
        worldWithShipAt(distance, "CLASS_NEUTRAL", "krait"),
        MASSES,
      );
    expect(krait(96).blocks(ORIGIN, RANGE)).toBe(true);
    expect(krait(97).blocks(ORIGIN, RANGE)).toBe(false);
    expect(
      createShipField(worldWithShipAt(96), MASSES).blocks(ORIGIN, RANGE),
    ).toBe(false);
  });

  it("counts a ship of any scan class, as Oolite's loop does", () => {
    // checkShipsInVicinityForWitchJumpExit tests every ship, not only the
    // locking classes: a cargo pod with a mass blocks too.
    expect(
      createShipField(worldWithShipAt(50, "CLASS_CARGO"), MASSES).blocks(
        ORIGIN,
        RANGE,
      ),
    ).toBe(true);
  });

  it("never blocks for a missing, non-finite or non-positive mass", () => {
    const at = (masses: readonly ShipMass[] | undefined): boolean =>
      createShipField(worldWithShipAt(1), masses).blocks(ORIGIN, RANGE);
    expect(at(undefined)).toBe(false);
    expect(at([])).toBe(false);
    expect(at([{ specKey: "krait", mass: KRAIT_MASS }])).toBe(false);
    expect(at([{ specKey: "viper", mass: Number.NaN }])).toBe(false);
    expect(at([{ specKey: "viper", mass: Number.POSITIVE_INFINITY }])).toBe(
      false,
    );
    expect(at([{ specKey: "viper", mass: 0 }])).toBe(false);
    expect(at([{ specKey: "viper", mass: -5 }])).toBe(false);
    // The control: the same ship with a sane mass does block.
    expect(at([{ specKey: "viper", mass: VIPER_MASS }])).toBe(true);
  });

  it("never blocks for a dead ship", () => {
    const world = createWorld(1);
    const ship = addShip(world, vec(10, 0, 0));
    expect(createShipField(world, MASSES).blocks(ORIGIN, RANGE)).toBe(true);
    killEntity(world, ship.id);
    expect(createShipField(world, MASSES).blocks(ORIGIN, RANGE)).toBe(false);
  });

  it("never blocks beyond the scanner range, even with a huge mass", () => {
    const huge: readonly ShipMass[] = [{ specKey: "viper", mass: 1e15 }];
    // 0.1 x 1e15 = 1e14 > d^2 at both distances; only the range clause differs.
    expect(
      createShipField(worldWithShipAt(25_599), huge).blocks(ORIGIN, RANGE),
    ).toBe(true);
    expect(
      createShipField(worldWithShipAt(25_600), huge).blocks(ORIGIN, RANGE),
    ).toBe(false);
    expect(
      createShipField(worldWithShipAt(30_000), huge).blocks(ORIGIN, RANGE),
    ).toBe(false);
  });
});

interface ChartSystem {
  readonly id: string;
  readonly name: string;
  readonly chartX: number;
  readonly chartY: number;
}

const chart = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as ChartSystem[];

function chartSystem(name: string): ChartSystem {
  const found = chart.find((system) => system.name === name);
  if (found === undefined) throw new Error(`galaxy 0 has no system "${name}"`);
  return found;
}

const lave = chartSystem("Lave");
const diso = chartSystem("Diso");

function jumpOptions(withStation: boolean): StepOptions {
  return {
    hyperspace: {
      fuel: 70,
      origin: { id: lave.id, x: lave.chartX, y: lave.chartY },
      target: { id: diso.id, x: diso.chartX, y: diso.chartY },
      shipMasses: MASSES,
      ...(withStation ? { stationMass: CORIOLIS_STATION_MASS } : {}),
    },
  };
}

/** A stationary ship in flight at `position` (speed 0, no input). */
function hoveringAt(position: Vec3): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.dockArmed = false;
  state.position = position;
  return state;
}

const begin: readonly Command[] = [{ kind: "beginHyperspace" }];

/** Begin a jump and run the countdown out; returns the last step's events. */
function runCountdown(
  state: FlightState,
  world: World,
  options: StepOptions,
): SimEvent[] {
  simStep(state, world, begin, options);
  let last: SimEvent[] = [];
  for (let i = 0; i < HYPERSPACE_COUNTDOWN_STEPS; i += 1) {
    last = simStep(state, world, [], options);
  }
  return last;
}

describe("ship field: jump blockage through stepSim (WORLD-10)", () => {
  it("refuses a countdown that completes with a viper 50 m away, naming the ship", () => {
    const state = hoveringAt(OPEN_SPACE);
    const world = createWorld(5);
    addShip(world, add(OPEN_SPACE, vec(50, 0, 0)));
    const clockBefore = state.clockSeconds;

    const events = runCountdown(state, world, jumpOptions(true));

    expect(events).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "ship" },
    ]);
    expect(state.hyperspaceTarget).toBeNull();
    expect(state.hyperspaceCountdown).toBe(0);
    // Only the ordinary per-step time advanced; no jump time was spent.
    const elapsed = state.clockSeconds - clockBefore;
    expect(elapsed).toBeCloseTo(DT * (HYPERSPACE_COUNTDOWN_STEPS + 1), 1);
    expect(elapsed).toBeLessThan(100);
  });

  it("commits the jump with the viper 70 m away", () => {
    const state = hoveringAt(OPEN_SPACE);
    const world = createWorld(5);
    // 70^2 = 4,900 m^2 > 0.1 x 34,040.68 = 3,404.07 m^2: outside the radius.
    addShip(world, add(OPEN_SPACE, vec(70, 0, 0)));

    const events = runCountdown(state, world, jumpOptions(true));

    expect(events.map((event) => event.kind)).toContain("hyperspaceJumped");
    expect(events.map((event) => event.kind)).not.toContain(
      "hyperspaceRefused",
    );
  });

  it("does not consult ships when no masses are supplied", () => {
    const state = hoveringAt(OPEN_SPACE);
    const world = createWorld(5);
    addShip(world, add(OPEN_SPACE, vec(5, 0, 0)));
    const options: StepOptions = {
      hyperspace: {
        fuel: 70,
        origin: { id: lave.id, x: lave.chartX, y: lave.chartY },
        target: { id: diso.id, x: diso.chartX, y: diso.chartY },
      },
    };

    const events = runCountdown(state, world, options);

    expect(events.map((event) => event.kind)).toContain("hyperspaceJumped");
  });

  it("names the station first when the station and a ship both block", () => {
    // 7,100 m from the station centre is inside its 7,179.7 m radius.
    const position = add(layout.station.position, vec(7_100, 0, 0));
    const state = hoveringAt(position);
    const world = createWorld(5);
    addShip(world, add(position, vec(50, 0, 0)));

    const events = runCountdown(state, world, jumpOptions(true));

    expect(events).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "station" },
    ]);
  });

  it("names the ship when the station mass is absent and the ship blocks", () => {
    const position = add(layout.station.position, vec(7_100, 0, 0));
    const state = hoveringAt(position);
    const world = createWorld(5);
    addShip(world, add(position, vec(50, 0, 0)));

    const events = runCountdown(state, world, jumpOptions(false));

    expect(events).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "ship" },
    ]);
  });

  it("never consults the ships at the H press", () => {
    const state = hoveringAt(OPEN_SPACE);
    const world = createWorld(5);
    addShip(world, add(OPEN_SPACE, vec(10, 0, 0)));

    const events = simStep(state, world, begin, jumpOptions(true));

    expect(events.map((event) => event.kind)).toContain(
      "hyperspaceCountdownStarted",
    );
    expect(events.map((event) => event.kind)).not.toContain(
      "hyperspaceRefused",
    );
    expect(state.hyperspaceCountdown).toBe(HYPERSPACE_COUNTDOWN_STEPS);
  });
});

/**
 * The buoy query of the field and the D-08 pins (Phase 18, D-05, D-08, D-09,
 * PD-01, PD-02). A buoy blocks from where it is (layout plus offset) with the
 * mass it has (the whole 698,691.1875, or the float32 691,044.375 once its
 * subentity is detached, ShipEntity.m line 8194), and a destroyed buoy never
 * blocks. Expected radii: sqrt(0.1 x 698,691.1875) = 264.328 m and
 * sqrt(0.1 x 691,044.375) = 262.877 m.
 */
describe("ship field: the buoys (D-05, D-08, D-09)", () => {
  const npcMasses: readonly ShipMass[] = (
    JSON.parse(
      readFileSync(
        new URL(
          "../../../src/content/generated/ships-npc.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { key: string; mass: number }[]
  ).map((ship) => ({ specKey: ship.key, mass: ship.mass }));

  function buoyOptions(): StepOptions {
    return {
      hyperspace: {
        fuel: 70,
        origin: { id: lave.id, x: lave.chartX, y: lave.chartY },
        target: { id: diso.id, x: diso.chartX, y: diso.chartY },
        stationMass: CORIOLIS_STATION_MASS,
        buoyMass: NAV_BUOY_MASS,
        shipMasses: npcMasses,
      },
    };
  }

  const navBuoy = layout.navBuoy.position;

  it("pins the field's members: massLocked, blocks and buoy", () => {
    const field = createShipField(createWorld(1), undefined);
    expect(Object.keys(field).sort()).toEqual(["blocks", "buoy", "massLocked"]);
  });

  it("reports a fresh world's buoys alive, unmoved and whole", () => {
    const field = createShipField(createWorld(1), undefined);
    for (const key of ["witchpoint", "navBuoy"] as const) {
      expect(field.buoy(key)).toEqual({
        alive: true,
        offset: vec(0, 0, 0),
        subentityAttached: true,
      });
    }
  });

  it("mirrors the world's liveness, offset and subentity per buoy", () => {
    const world = createWorld(1);
    world.staticHealth.navBuoy = 0;
    world.buoys.navBuoy.offset = vec(300, 0, 0);
    world.buoys.witchpoint.subentityEnergy = 0;
    const field = createShipField(world, undefined);
    expect(field.buoy("navBuoy")).toEqual({
      alive: false,
      offset: vec(300, 0, 0),
      subentityAttached: true,
    });
    expect(field.buoy("witchpoint")).toEqual({
      alive: true,
      offset: vec(0, 0, 0),
      subentityAttached: false,
    });
  });

  it("refuses beside a live nav buoy and commits once it is destroyed", () => {
    const live = runCountdown(
      hoveringAt(add(navBuoy, vec(10, 0, 0))),
      createWorld(5),
      buoyOptions(),
    );
    expect(live).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "navBuoy" },
    ]);

    const world = createWorld(5);
    world.staticHealth.navBuoy = 0;
    const dead = runCountdown(
      hoveringAt(add(navBuoy, vec(10, 0, 0))),
      world,
      buoyOptions(),
    );
    expect(dead.map((event) => event.kind)).toContain("hyperspaceJumped");
  });

  it("blocks from the buoy's live position: a buoy moved 300 m away no longer blocks where it was", () => {
    const moved = (): World => {
      const world = createWorld(5);
      world.buoys.navBuoy.offset = vec(300, 0, 0);
      return world;
    };
    const atLayout = runCountdown(hoveringAt(navBuoy), moved(), buoyOptions());
    expect(atLayout.map((event) => event.kind)).toContain("hyperspaceJumped");

    const atMoved = runCountdown(
      hoveringAt(add(navBuoy, vec(300, 0, 0))),
      moved(),
      buoyOptions(),
    );
    expect(atMoved).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "navBuoy" },
    ]);
  });

  it("blocks with the live mass: a detached subentity shrinks the radius from 264.33 m to 262.88 m", () => {
    expect(Math.sqrt(0.1 * NAV_BUOY_MASS)).toBeCloseTo(264.328, 3);
    expect(Math.sqrt(0.1 * NAV_BUOY_HULL_MASS)).toBeCloseTo(262.877, 3);
    const at = add(navBuoy, vec(263.5, 0, 0));

    const whole = runCountdown(hoveringAt(at), createWorld(5), buoyOptions());
    expect(whole).toEqual([
      { kind: "hyperspaceRefused", reason: "blocked", blocker: "navBuoy" },
    ]);

    const world = createWorld(5);
    world.buoys.navBuoy.subentityEnergy = 0;
    const detached = runCountdown(hoveringAt(at), world, buoyOptions());
    expect(detached.map((event) => event.kind)).toContain("hyperspaceJumped");
  });

  it("names the witchpoint beacon from the world's view of it too", () => {
    const witchpoint = layout.witchpoint.position;
    const events = runCountdown(
      hoveringAt(add(witchpoint, vec(0, 200, 0))),
      createWorld(5),
      buoyOptions(),
    );
    expect(events).toEqual([
      {
        kind: "hyperspaceRefused",
        reason: "blocked",
        blocker: "witchpointBeacon",
      },
    ]);
    const world = createWorld(5);
    world.staticHealth.witchpoint = 0;
    const dead = runCountdown(
      hoveringAt(add(witchpoint, vec(0, 200, 0))),
      world,
      buoyOptions(),
    );
    expect(dead.map((event) => event.kind)).toContain("hyperspaceJumped");
  });

  it("lets a pod 5 m and a plate 3 m away neither block nor mass-lock (D-08)", () => {
    const world = createWorld(5);
    const pod = spawnEntity(
      world,
      {
        kind: "cargo",
        specKey: "barrel",
        scanClass: "CLASS_CARGO",
        position: add(OPEN_SPACE, vec(5, 0, 0)),
        orientation: identity(),
        radius: 5.798625946044922,
      },
      0,
    );
    const plate = spawnEntity(
      world,
      {
        kind: "cargo",
        specKey: "alloy",
        scanClass: "CLASS_CARGO",
        position: add(OPEN_SPACE, vec(0, 3, 0)),
        orientation: identity(),
        radius: 5.149232387542725,
      },
      0,
    );
    if (!pod.ok || !plate.ok) throw new Error("debris spawn refused");

    const field = createShipField(world, npcMasses);
    expect(field.blocks(OPEN_SPACE, RANGE)).toBe(false);
    expect(field.massLocked(OPEN_SPACE, RANGE)).toBe(false);

    const events = runCountdown(hoveringAt(OPEN_SPACE), world, buoyOptions());
    expect(events.map((event) => event.kind)).toContain("hyperspaceJumped");
  });

  it("never mass-locks for a buoy, live, moved, detached or destroyed (D-08)", () => {
    // 10 m from the witchpoint buoy: no station, planet or sun lock reaches it.
    const position = add(layout.witchpoint.position, vec(10, 0, 0));
    const world = createWorld(5);
    expect(createShipField(world, npcMasses).massLocked(position, RANGE)).toBe(
      false,
    );
    world.buoys.witchpoint.offset = vec(10, 0, 0);
    world.buoys.witchpoint.subentityEnergy = 0;
    expect(createShipField(world, npcMasses).massLocked(position, RANGE)).toBe(
      false,
    );
    world.staticHealth.witchpoint = 0;
    expect(createShipField(world, npcMasses).massLocked(position, RANGE)).toBe(
      false,
    );
    const state = hoveringAt(position);
    simStep(state, world, toggle, buoyOptions());
    expect(state.torus.massLocked).toBe(false);
    expect(state.torus.engaged).toBe(true);
  });
});
