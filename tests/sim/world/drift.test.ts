// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drift of NPC ships and buoys (CBT-18, D-02, PD-02).
 *
 * Oolite's NPC carries a Newtonian `velocity` beside its scalar `flightSpeed`.
 * `applyThrust:` brakes it by `SHIP_THRUST_FACTOR x thrust x dt` when the
 * ship's thrust is non-zero (`ShipEntity.m:5808-5823`, factor 5.0f at
 * `ShipEntity.h:46`), and `Entity` update then moves the position by it
 * (`applyVelocity:`, `Entity.m:878-881`). A buoy is a ship with thrust 100, so a
 * pushed buoy brakes at 500 m/s^2. These hand cases are written from the C;
 * `ship-braking.oracle.test.ts` holds the port to the 18-03 fixtures.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { add, identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { statsFor } from "../../../src/sim/npc/stats.js";
import type {
  NpcFlightStats,
  NpcStepFacts,
} from "../../../src/sim/npc/stats.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import {
  BUOY_THRUST,
  brakeShipDrift,
  SHIP_DRIFT_THRUST_FACTOR,
  stepBuoyDrift,
  stepShipDrift,
} from "../../../src/sim/world/drift.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import {
  MAX_BUOY_OFFSET,
  MAX_ENTITY_VELOCITY,
} from "../../../src/sim/world/limits.js";
import {
  hashWorld,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const fixture = laveFixture();
const { layout, config } = fixture;
const FLIGHT = realNpcFlightTable();
const NPC: NpcStepFacts = { flight: FLIGHT };
const KRAIT_THRUST = statsFor(FLIGHT, "krait").thrust;
/** Far from the station, the planet and the buoys. */
const FAR = vec(1e7, 0, 0);

/** A player in flight, at rest, well clear of the station. */
function restingPlayer(): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.position = add(state.position, vec(0, 50_000, 0));
  return state;
}

function shipInit(overrides: Partial<SpawnInit> = {}): SpawnInit {
  return {
    kind: "ship",
    specKey: "krait",
    scanClass: "CLASS_NEUTRAL",
    position: FAR,
    orientation: identity(),
    radius: 50,
    speed: 0,
    ai: null,
    ...overrides,
  };
}

function spawnOk(world: World, init: SpawnInit, tick = 0): Entity {
  const result = spawnEntity(world, init, tick);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

const isZero = (v: Vec3): boolean => v.x === 0 && v.y === 0 && v.z === 0;

/** Step the world alone `ticks` times; returns the tick the velocity first read zero, or -1. */
function stepUntilStopped(
  world: World,
  player: FlightState,
  ticks: number,
  stopped: () => boolean,
  npc: NpcStepFacts = NPC,
): number {
  let stopTick = -1;
  for (let tick = 1; tick <= ticks; tick += 1) {
    player.tick += 1;
    stepWorld(world, player, layout, DT, undefined, npc);
    if (stopTick < 0 && stopped()) stopTick = tick;
  }
  return stopTick;
}

describe("the constants (ShipEntity.h:46, shipdata.plist buoy)", () => {
  it("brakes NPCs by 5 x thrust and the buoy with thrust 100", () => {
    expect(SHIP_DRIFT_THRUST_FACTOR).toBe(5);
    expect(BUOY_THRUST).toBe(100);
    expect(KRAIT_THRUST).toBe(35);
  });

  it("BUOY_THRUST equals the compiled buoy record's thrust", () => {
    const records = JSON.parse(
      readFileSync(
        new URL(
          "../../../src/content/generated/ships-client.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { key: string; extras?: { thrust?: unknown } }[];
    const buoys = records.filter((record) => record.key === "buoy");
    expect(buoys).toHaveLength(1);
    expect(buoys[0]?.extras?.thrust).toBe(BUOY_THRUST);
  });
});

describe("brakeShipDrift (ShipEntity.m:5816-5823)", () => {
  it("removes 5 x thrust x dt from the magnitude, keeping the direction", () => {
    const out = brakeShipDrift(vec(30, 0, -40), KRAIT_THRUST, DT);
    const expected = (50 - (5 * KRAIT_THRUST) / 120) / 50;
    expect(out.x).toBeCloseTo(30 * expected, 4);
    expect(out.y).toBe(0);
    expect(out.z).toBeCloseTo(-40 * expected, 4);
  });

  it("returns float32 components", () => {
    const out = brakeShipDrift(vec(50.1, -3.3, 7.7), KRAIT_THRUST, DT);
    for (const c of [out.x, out.y, out.z]) expect(Math.fround(c)).toBe(c);
  });

  it("becomes exactly zero once the brake exceeds the magnitude, never -0", () => {
    const out = brakeShipDrift(vec(-1, -0.5, 0), KRAIT_THRUST, DT);
    expect(Object.is(out.x, 0)).toBe(true);
    expect(Object.is(out.y, 0)).toBe(true);
    expect(Object.is(out.z, 0)).toBe(true);
  });

  it("never brakes with thrust 0 (`if (thrust)`)", () => {
    const v = vec(12, -7, 3);
    expect(brakeShipDrift(v, 0, DT)).toEqual(v);
  });

  it("returns zero for a non-finite input, never NaN", () => {
    for (const v of [
      vec(Number.NaN, 0, 0),
      vec(0, Number.POSITIVE_INFINITY, 0),
      vec(0, 0, Number.NEGATIVE_INFINITY),
    ]) {
      expect(brakeShipDrift(v, KRAIT_THRUST, DT)).toEqual(vec(0, 0, 0));
      expect(brakeShipDrift(v, 0, DT)).toEqual(vec(0, 0, 0));
    }
  });

  it("brakes a velocity below the float32 range to zero (review L258)", () => {
    expect(brakeShipDrift(vec(1e-50, 0, 0), KRAIT_THRUST, DT)).toEqual(
      vec(0, 0, 0),
    );
  });
});

describe("a pushed Krait drifts and comes to rest (D-02)", () => {
  it("brakes then moves by the braked velocity on the first tick", () => {
    const world = createWorld(7);
    const krait = spawnOk(world, shipInit({ velocity: vec(50, 0, 0) }));
    const player = restingPlayer();
    player.tick += 1;
    stepWorld(world, player, layout, DT, undefined, NPC);
    const braked = 50 - (5 * KRAIT_THRUST) / 120;
    expect(krait.velocity.x).toBeCloseTo(braked, 4);
    expect(krait.velocity.y).toBe(0);
    expect(krait.position.x - FAR.x).toBeCloseTo(krait.velocity.x * DT, 9);
    expect(krait.position.y).toBe(0);
    expect(krait.position.z).toBe(0);
  });

  it("stops at tick 35, about 6.94 m out, and stays stopped", () => {
    const world = createWorld(7);
    const krait = spawnOk(world, shipInit({ velocity: vec(50, 0, 0) }));
    const player = restingPlayer();
    const stopTick = stepUntilStopped(world, player, 120, () =>
      isZero(krait.velocity),
    );
    // Exact arithmetic: a x dt = 175/120 per tick, 50 - 35 x 1.4583 < 0.
    expect(stopTick).toBe(35);
    // dt x sum_{k=1..34} (50 - k x 175/120) = (1700 - 867.7083) / 120.
    expect(krait.position.x - FAR.x).toBeCloseTo((1700 - 867.708333) / 120, 3);
    expect(krait.velocity).toEqual(vec(0, 0, 0));
    const before = krait.position;
    stepUntilStopped(world, player, 10, () => true);
    expect(krait.position).toBe(before);
  });

  it("an inert ship (ai null) is integrated, so a rebound never freezes it", () => {
    const world = createWorld(7);
    const krait = spawnOk(world, shipInit({ velocity: vec(0, 0, -20) }));
    expect(krait.ai).toBeNull();
    const player = restingPlayer();
    player.tick += 1;
    stepWorld(world, player, layout, DT, undefined, NPC);
    expect(krait.position.z).toBeLessThan(0);
    expect(krait.velocity.z).toBeGreaterThan(-20);
  });

  it("a kind with thrust 0 never brakes but moves", () => {
    const row: NpcFlightStats = {
      ...statsFor(FLIGHT, "krait"),
      specKey: "hulk",
      thrust: 0,
    };
    const npc: NpcStepFacts = { flight: [...FLIGHT, row] };
    const world = createWorld(7);
    const hulk = spawnOk(
      world,
      shipInit({ specKey: "hulk", velocity: vec(10, 0, 0) }),
    );
    const player = restingPlayer();
    stepUntilStopped(world, player, 12, () => false, npc);
    expect(hulk.velocity).toEqual(vec(10, 0, 0));
    // 1e7 m carries an ulp of about 2e-9 m, so 12 additions round.
    expect(hulk.position.x - FAR.x).toBeCloseTo(1, 6);
  });

  it("a kind with no flight row brakes with Oolite's default thrust", () => {
    const world = createWorld(7);
    const ship = spawnOk(
      world,
      shipInit({ specKey: "no-such-kind", velocity: vec(10, 0, 0) }),
    );
    const player = restingPlayer();
    player.tick += 1;
    stepWorld(world, player, layout, DT, undefined, NPC);
    const thrust = statsFor(FLIGHT, "no-such-kind").thrust;
    expect(thrust).toBe(15);
    expect(ship.velocity.x).toBeCloseTo(10 - (5 * thrust) / 120, 4);
  });

  it("a steered ship moves by its steering, then by its drift", () => {
    function run(velocity: Vec3): Entity {
      const world = createWorld(11);
      const ship = spawnOk(
        world,
        shipInit({
          speed: 120,
          velocity,
          ai: createTestPilotAi(0, { scanRange: 1e9, cruiseSpeed: 150 }),
        }),
      );
      const player = restingPlayer();
      player.tick += 1;
      stepWorld(world, player, layout, DT, undefined, NPC);
      return ship;
    }
    const twin = run(vec(0, 0, 0));
    const pushed = run(vec(0, 40, 0));
    expect(pushed.velocity.y).toBeCloseTo(40 - (5 * KRAIT_THRUST) / 120, 4);
    expect(pushed.position.x).toBeCloseTo(twin.position.x, 9);
    expect(pushed.position.y).toBeCloseTo(
      twin.position.y + pushed.velocity.y * DT,
      9,
    );
    expect(pushed.position.z).toBeCloseTo(twin.position.z, 9);
  });

  it("a dead ship is not moved", () => {
    const world = createWorld(7);
    const krait = spawnOk(world, shipInit({ velocity: vec(50, 0, 0) }));
    krait.dead = true;
    stepShipDrift(world, DT, NPC);
    expect(krait.velocity).toEqual(vec(50, 0, 0));
    expect(krait.position).toEqual(FAR);
  });

  it("cargo is left to the debris drift (pods have thrust 0)", () => {
    const world = createWorld(7);
    const pod = spawnOk(
      world,
      shipInit({
        kind: "cargo",
        specKey: "barrel",
        scanClass: "CLASS_CARGO",
        velocity: vec(6, 0, 0),
      }),
    );
    stepShipDrift(world, DT, NPC);
    expect(pod.velocity).toEqual(vec(6, 0, 0));
    expect(pod.position).toEqual(FAR);
  });
});

describe("a pushed buoy drifts and comes to rest (PD-02)", () => {
  it("brakes by 500/120 per tick and stops about 9.58 m out", () => {
    const world = createWorld(7);
    world.buoys.navBuoy.velocity = vec(100, 0, 0);
    const player = restingPlayer();
    player.tick += 1;
    stepWorld(world, player, layout, DT, undefined, NPC);
    expect(world.buoys.navBuoy.velocity.x).toBeCloseTo(100 - 500 / 120, 4);
    expect(world.buoys.navBuoy.offset.x).toBeCloseTo(
      world.buoys.navBuoy.velocity.x * DT,
      9,
    );
    const stopTick = stepUntilStopped(world, player, 60, () =>
      isZero(world.buoys.navBuoy.velocity),
    );
    // Exact arithmetic stops at tick 24; float32 may leave one more tick.
    expect(stopTick + 1).toBeGreaterThanOrEqual(24);
    expect(stopTick + 1).toBeLessThanOrEqual(25);
    // dt x sum_{k=1..23} (100 - k x 500/120) = 1150 / 120 = 9.583 m.
    expect(world.buoys.navBuoy.offset.x).toBeCloseTo(1150 / 120, 2);
    expect(world.buoys.navBuoy.offset.y).toBe(0);
    expect(world.buoys.witchpoint.offset).toEqual(vec(0, 0, 0));
  });

  it("moves the witchpoint buoy too", () => {
    const world = createWorld(7);
    world.buoys.witchpoint.velocity = vec(0, 0, -30);
    stepBuoyDrift(world, DT);
    expect(world.buoys.witchpoint.velocity.z).toBeCloseTo(-30 + 500 / 120, 4);
    expect(world.buoys.witchpoint.offset.z).toBeLessThan(0);
  });

  it("never moves a destroyed buoy", () => {
    const world = createWorld(7);
    world.staticHealth.navBuoy = 0;
    world.buoys.navBuoy.velocity = vec(100, 0, 0);
    const player = restingPlayer();
    stepUntilStopped(world, player, 5, () => false);
    expect(world.buoys.navBuoy.velocity).toEqual(vec(100, 0, 0));
    expect(world.buoys.navBuoy.offset).toEqual(vec(0, 0, 0));
  });
});

describe("a world at rest writes nothing (criterion 5)", () => {
  it("neither pass writes a velocity, a position or an offset", () => {
    const world = createWorld(7);
    const ships = [
      spawnOk(world, shipInit()),
      spawnOk(world, shipInit({ position: vec(1e6, 5, 5), speed: 80 })),
      spawnOk(world, shipInit({ specKey: "adder", ai: createTestPilotAi(0) })),
    ];
    const player = restingPlayer();
    const before = hashWorld(player, world);
    const refs = ships.map((s) => [s.position, s.velocity] as const);
    const buoys = [world.buoys.navBuoy, world.buoys.witchpoint].map(
      (b) => [b.offset, b.velocity] as const,
    );
    stepShipDrift(world, DT, NPC);
    stepBuoyDrift(world, DT);
    expect(hashWorld(player, world)).toBe(before);
    ships.forEach((s, i) => {
      expect(s.position).toBe(refs[i]?.[0]);
      expect(s.velocity).toBe(refs[i]?.[1]);
    });
    [world.buoys.navBuoy, world.buoys.witchpoint].forEach((b, i) => {
      expect(b.offset).toBe(buoys[i]?.[0]);
      expect(b.velocity).toBe(buoys[i]?.[1]);
    });
  });
});

describe("clamps and repair (T-18-24, T-18-35)", () => {
  it("clamps a velocity component at MAX_ENTITY_VELOCITY", () => {
    const world = createWorld(7);
    const ship = spawnOk(world, shipInit());
    ship.velocity = vec(3 * MAX_ENTITY_VELOCITY, 0, 0);
    stepShipDrift(world, DT, NPC);
    expect(ship.velocity.x).toBe(MAX_ENTITY_VELOCITY);
    expect(ship.position.x - FAR.x).toBeCloseTo(MAX_ENTITY_VELOCITY * DT, 6);
  });

  it("clamps a buoy offset at MAX_BUOY_OFFSET", () => {
    const world = createWorld(7);
    world.buoys.navBuoy.offset = vec(MAX_BUOY_OFFSET - 1, 0, -MAX_BUOY_OFFSET);
    world.buoys.navBuoy.velocity = vec(MAX_ENTITY_VELOCITY, 0, -500);
    stepBuoyDrift(world, DT);
    expect(world.buoys.navBuoy.offset.x).toBe(MAX_BUOY_OFFSET);
    expect(world.buoys.navBuoy.offset.z).toBe(-MAX_BUOY_OFFSET);
  });

  it("a NaN velocity writes nothing non-finite", () => {
    const world = createWorld(7);
    const ship = spawnOk(world, shipInit());
    ship.velocity = vec(Number.NaN, 1, 0);
    world.buoys.navBuoy.velocity = vec(0, Number.NaN, 0);
    stepShipDrift(world, DT, NPC);
    stepBuoyDrift(world, DT);
    for (const v of [
      ship.velocity,
      ship.position,
      world.buoys.navBuoy.velocity,
      world.buoys.navBuoy.offset,
    ]) {
      expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
    }
    expect(ship.position).toEqual(FAR);
    expect(world.buoys.navBuoy.offset).toEqual(vec(0, 0, 0));
  });

  it("a velocity of 1e-50 becomes zero on the first braked tick", () => {
    const world = createWorld(7);
    const ship = spawnOk(world, shipInit());
    ship.velocity = vec(1e-50, 0, 0);
    stepShipDrift(world, DT, NPC);
    expect(ship.velocity).toEqual(vec(0, 0, 0));
    expect(serializeWorldSection(world)).not.toContain("1e-50");
  });
});

describe("cadence (criterion 5)", () => {
  it("a drifting Krait and a drifting buoy hash equal at 30, 60 and 144 Hz", () => {
    const TARGET = 240;
    const options: StepOptions = { npcFlight: FLIGHT };
    function replay(hz: number): string {
      const state = restingPlayer();
      const world = createWorld(5);
      spawnOk(world, shipInit({ velocity: vec(120, -35, 60) }));
      spawnOk(
        world,
        shipInit({
          specKey: "adder",
          position: vec(FAR.x, 3000, 0),
          speed: 100,
          velocity: vec(0, 0, -80),
          ai: createTestPilotAi(0, { scanRange: 1e9, cruiseSpeed: 150 }),
        }),
      );
      world.buoys.navBuoy.velocity = vec(80, 0, -40);
      world.buoys.witchpoint.velocity = vec(0, 300, 0);
      let accumulator = 0;
      let steps = 0;
      const mid: string[] = [];
      while (steps < TARGET) {
        accumulator += clampFrameDelta(1 / hz);
        let stepsThisFrame = 0;
        while (
          accumulator >= DT &&
          stepsThisFrame < MAX_STEPS_PER_FRAME &&
          steps < TARGET
        ) {
          stepSim(state, world, layout, config, ZERO_INTENT, [], DT, options);
          accumulator -= DT;
          steps += 1;
          stepsThisFrame += 1;
          if (steps === 10) mid.push(hashWorld(state, world));
        }
        if (stepsThisFrame === MAX_STEPS_PER_FRAME) accumulator = 0;
      }
      // Non-vacuity: the buoys moved, and the Krait was still drifting at tick 10.
      expect(world.buoys.witchpoint.offset.y).toBeGreaterThan(0);
      expect(world.buoys.navBuoy.offset.x).toBeGreaterThan(0);
      return [...mid, hashWorld(state, world)].join("\n");
    }
    expect(new Set([30, 60, 144].map(replay)).size).toBe(1);
  });
});
