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

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { torusFactor } from "../../../src/sim/flight/torus.js";
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
import {
  createWorld,
  killEntity,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();
const RANGE = layout.scannerRange;

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

    simStep(state, world, toggle);

    expect(state.torus.engaged).toBe(false);
    expect(state.torus.massLocked).toBe(true);
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
