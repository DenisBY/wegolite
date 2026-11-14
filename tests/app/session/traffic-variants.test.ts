// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The traffic-on variants of launch, manual docking, the docking computer and
 * the torus (Phase 12, plan 12-09; WORLD-16, the Vitest half).
 *
 * With traffic on, the player must fly exactly as in v1. Every row here steps
 * `stepSim` twice over the same Lave setup, once with the populated Lave world
 * (the real inert populator over the committed NPC records, and the compiled
 * masses in the step options exactly as the session builds them) and once with
 * no world and no masses (traffic off), and compares the events and the final
 * flight state. The one difference the requirement allows is Oolite's own: a
 * ship inside the scanner range locks the torus (PlayerEntity.m lines 2936 and
 * 3044-3061), so the torus is refused next to a placed ship.
 *
 * The scenario setups are the minimal copies of tests/sim/dock-capture.test.ts
 * (an aligned approach on the weighted-plane tick), tests/sim/dock-computer.test.ts
 * (Shift+C from the dock mouth) and tests/sim/torus.test.ts (a teleport to a
 * lock-free point, then `toggleTorus`). Expected values come from those
 * sources and from Oolite, never from running the code under test twice.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildStepOptions } from "../../../src/app/session/step-options.js";
import {
  createInertPopulate,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import type { TrafficContent } from "../../../src/app/session/traffic.js";
import type { NpcShip } from "../../../src/content/types.js";
import type { Command } from "../../../src/sim/commands.js";
import { DOCK_COMPUTER_KEY } from "../../../src/sim/dock/computer.js";
import type { SimEvent } from "../../../src/sim/events.js";
import {
  PlayerController,
  ScriptedLaunchController,
  ZERO_INTENT,
  flightView,
} from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import {
  hashFlight,
  initFlightState,
  serializeFlight,
} from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { massLocked } from "../../../src/sim/flight/torus.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { add, scale, sub, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { createShipField } from "../../../src/sim/world/ship-field.js";
import { createWorld, liveEntityCount } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import {
  laveDockGeometry,
  placeShipInPortFrame,
} from "../../helpers/dock-pose.js";
import { laveFixture } from "../../helpers/lave.js";

const lave = laveFixture();
const geometry = laveDockGeometry();
const SCANNER_RANGE = lave.layout.scannerRange;

const content: TrafficContent = trafficContent(
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/ships-npc.json", import.meta.url),
      "utf8",
    ),
  ) as NpcShip[],
);

/** The Lave world a traffic-on launch from Lave builds at epoch 1, populated. */
function populatedWorld(): World {
  const world = createWorld(
    worldSeedFor(marketSeedForSystem(lave.system.id), 1),
  );
  createInertPopulate(
    () => content,
    () => lave.layout,
  )(world, { traffic: true });
  return world;
}

/** One variant of a scenario: the world it steps and the options it passes. */
interface Variant {
  readonly name: "traffic on" | "traffic off";
  readonly world: World | undefined;
  readonly equipment: ReadonlySet<string>;
  readonly withMasses: boolean;
}

/** The two variants of a scenario, as the session configures them. */
function variants(equipment: ReadonlySet<string> = new Set()): Variant[] {
  return [
    {
      name: "traffic on",
      world: populatedWorld(),
      equipment,
      withMasses: true,
    },
    { name: "traffic off", world: undefined, equipment, withMasses: false },
  ];
}

/** The step options of a variant, built by the session's own builder. */
function optionsOf(variant: Variant) {
  return buildStepOptions({
    fuel: 70,
    system: lave.system,
    target: undefined,
    equipment: variant.equipment,
    dock: geometry,
    ...(variant.withMasses ? { shipMasses: content.masses } : {}),
  });
}

function stepVariant(
  variant: Variant,
  state: FlightState,
  intent: ControlIntent,
  commands: readonly Command[],
): SimEvent[] {
  return stepSim(
    state,
    variant.world,
    lave.layout,
    lave.config,
    intent,
    commands,
    DT,
    optionsOf(variant),
  );
}

/** A flight state in `inFlight` at `position`, ready for a torus or dock step. */
function flyingAt(position: Vec3): FlightState {
  const state = initFlightState(lave.layout);
  state.mode = "inFlight";
  state.dockArmed = false;
  state.position = position;
  return state;
}

describe("the populated variant is not vacuous", () => {
  it("holds 12 inert ships that the step options give masses to", () => {
    const world = populatedWorld();
    expect(liveEntityCount(world)).toBe(12);
    expect(world.store.nextId).toBe(113);
    expect(content.masses.length).toBeGreaterThan(0);
  });
});

describe("launch with traffic on (WORLD-16)", () => {
  it("gives the same flight hash and the same events on every tick of a launch and flight", () => {
    const [on, off] = variants();
    if (on === undefined || off === undefined) throw new Error("no variants");
    const stateOn = initFlightState(lave.layout);
    const stateOff = initFlightState(lave.layout);
    const playerOn = new PlayerController();
    const playerOff = new PlayerController();
    const scriptedOn = new ScriptedLaunchController();
    const scriptedOff = new ScriptedLaunchController();
    const idle = { pitch: 0, roll: 0, speed: 0, precision: false };

    const launched: string[] = [];
    for (let tick = 0; tick < 601; tick += 1) {
      const commands: readonly Command[] =
        tick === 0 ? [{ kind: "launch" }] : [];
      const intentOn = (
        stateOn.mode === "launching" ? scriptedOn : playerOn
      ).update(flightView(stateOn), idle);
      const intentOff = (
        stateOff.mode === "launching" ? scriptedOff : playerOff
      ).update(flightView(stateOff), idle);
      const eventsOn = stepVariant(on, stateOn, intentOn, commands);
      const eventsOff = stepVariant(off, stateOff, intentOff, commands);
      expect(eventsOn, `events at tick ${String(tick)}`).toEqual(eventsOff);
      expect(hashFlight(stateOn), `hash at tick ${String(tick)}`).toBe(
        hashFlight(stateOff),
      );
      for (const event of eventsOn) launched.push(event.kind);
    }
    expect(stateOn.mode).toBe("inFlight");
    expect(stateOff.mode).toBe("inFlight");
    expect(launched).toContain("launched");
    expect(launched).toContain("launchComplete");
    // The populated world was stepped all along and is still the 12 ships.
    expect(on.world && liveEntityCount(on.world)).toBe(12);
  });
});

describe("manual docking with traffic on (WORLD-16)", () => {
  /** An aligned, centred approach `nosePastPlane` metres inside the mouth plane. */
  function approach(nosePastPlane: number): FlightState {
    const pose = placeShipInPortFrame(lave.layout, geometry, {
      nosePastPlane,
      rollFromMatched: 0,
      lateral: 0,
      forwardSpeed: 0,
    });
    const state = initFlightState(lave.layout);
    state.mode = "inFlight";
    state.position = pose.position;
    state.orientation = pose.orientation;
    state.speed = pose.speed;
    return state;
  }

  it("docks an aligned approach on the weighted-plane tick exactly as with traffic off", () => {
    const results = variants().map((variant) => {
      const state = approach(90);
      const events = stepVariant(variant, state, ZERO_INTENT, []);
      return { state, events };
    });
    const [on, off] = results;
    if (on === undefined || off === undefined) throw new Error("no results");
    expect(off.state.mode).toBe("docked");
    expect(off.events).toContainEqual({
      kind: "docked",
      via: "manual",
      clockDelta: 0,
    });
    expect(on.state.mode).toBe("docked");
    expect(on.events).toEqual(off.events);
    expect(serializeFlight(on.state)).toBe(serializeFlight(off.state));
  });

  it("does not dock one tick early, and scrapes nothing, as with traffic off", () => {
    const results = variants().map((variant) => {
      const state = approach(45);
      const events = stepVariant(variant, state, ZERO_INTENT, []);
      return { state, events };
    });
    const [on, off] = results;
    if (on === undefined || off === undefined) throw new Error("no results");
    expect(off.state.mode).toBe("inFlight");
    expect(off.events.map((event) => event.kind)).not.toContain("docked");
    expect(on.events).toEqual(off.events);
    expect(serializeFlight(on.state)).toBe(serializeFlight(off.state));
  });
});

describe("the docking computer with traffic on (WORLD-16)", () => {
  it("docks with exactly 1,200 s and leaves the same flight state as with traffic off", () => {
    const results = variants(new Set([DOCK_COMPUTER_KEY])).map((variant) => {
      // The dock-mouth pose starts `inFlight`, inside the aegis.
      const state = initFlightState(lave.layout);
      state.mode = "inFlight";
      state.speed = 120;
      const events = stepVariant(variant, state, ZERO_INTENT, [
        { kind: "dockingComputer" },
      ]);
      return { state, events };
    });
    const [on, off] = results;
    if (on === undefined || off === undefined) throw new Error("no results");
    expect(off.state.mode).toBe("docked");
    expect(off.events).toContainEqual({
      kind: "docked",
      via: "computer",
      clockDelta: 1200,
    });
    expect(on.state.mode).toBe("docked");
    expect(on.events).toEqual(off.events);
    expect(serializeFlight(on.state)).toBe(serializeFlight(off.state));
  });
});

describe("the torus with traffic on (WORLD-16)", () => {
  const toggle: readonly Command[] = [{ kind: "toggleTorus" }];

  /** Teleport to `position` at the speed cap and toggle the drive, for one variant. */
  function engage(variant: Variant, position: Vec3) {
    const state = flyingAt(position);
    state.speed = lave.config.maxSpeed;
    const events = stepVariant(variant, state, ZERO_INTENT, toggle);
    return { state, events };
  }

  /**
   * A point with no locking body and no ship within the scanner range, found
   * from the populated world. Candidates are 120 km out from the station in
   * the directions the layout offers, as tests/sim/torus.test.ts does for its
   * lock-free point.
   */
  function freePoint(world: World): Vec3 {
    const field = createShipField(world, content.masses);
    const station = lave.layout.station.position;
    const candidates: Vec3[] = [
      sub(station, scale(lave.layout.stationToPlanet, 120_000)),
      add(station, vec(0, 120_000, 0)),
      add(station, vec(0, -120_000, 0)),
      add(station, vec(0, 0, 400_000)),
      add(station, vec(0, 0, -400_000)),
    ];
    const found = candidates.find(
      (point) =>
        !massLocked(point, lave.layout) &&
        !field.massLocked(point, SCANNER_RANGE),
    );
    if (found === undefined) throw new Error("no lock-free point");
    return found;
  }

  it("engages where no ship is within 25,600 m, exactly as with traffic off", () => {
    const [on, off] = variants();
    if (on === undefined || off === undefined || on.world === undefined) {
      throw new Error("no variants");
    }
    const point = freePoint(on.world);
    // Asserted through the ship field: no placed ship is inside the range.
    expect(
      createShipField(on.world, content.masses).massLocked(
        point,
        SCANNER_RANGE,
      ),
    ).toBe(false);

    const withShips = engage(on, point);
    const withoutShips = engage(off, point);
    expect(withoutShips.state.torus.engaged).toBe(true);
    expect(withShips.state.torus.engaged).toBe(true);
    expect(withShips.events).toEqual(withoutShips.events);
    expect(withShips.events.map((event) => event.kind)).not.toContain(
      "torusRefused",
    );
    expect(serializeFlight(withShips.state)).toBe(
      serializeFlight(withoutShips.state),
    );
  });

  it("is refused next to a placed ship (torusRefused) while traffic off engages there (Oolite's mass lock)", () => {
    const [on, off] = variants();
    if (on === undefined || off === undefined || on.world === undefined) {
      throw new Error("no variants");
    }
    // A point 1,000 m from a placed ship that no body locks: the only lock is
    // the ship's, so the expected difference is Oolite's ship mass lock alone.
    let point: Vec3 | undefined;
    for (const ship of on.world.store.live) {
      const candidate = add(ship.position, vec(1_000, 0, 0));
      if (!massLocked(candidate, lave.layout)) {
        point = candidate;
        break;
      }
    }
    if (point === undefined) throw new Error("no ship clear of every body");
    expect(
      createShipField(on.world, content.masses).massLocked(
        point,
        SCANNER_RANGE,
      ),
    ).toBe(true);

    const withShips = engage(on, point);
    const withoutShips = engage(off, point);
    expect(withoutShips.state.torus.engaged).toBe(true);
    expect(withoutShips.events.map((event) => event.kind)).not.toContain(
      "torusRefused",
    );
    expect(withShips.state.torus.engaged).toBe(false);
    expect(withShips.events).toContainEqual({
      kind: "torusRefused",
      reason: "massLock",
    });
  });
});
