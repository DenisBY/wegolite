// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * NPC and buoy drift braking against the independent 18-03 oracle (CBT-18,
 * D-02, PD-02).
 *
 * Each `braking-npc.json` fixture is replayed tick by tick in the order of
 * `stepShipDrift`: the drift is braked first, only when the thrust is non-zero
 * (`applyThrust:`, `ShipEntity.m:5808-5823`, run from `processBehaviour` at
 * 2415), then the position moves by the braked drift (`applyVelocity:` from
 * `[super update:]` at 2462, `Entity.m:878-881`). Every fixture is replayed
 * twice: through `brakeShipDrift` alone, and through the world passes
 * (`stepShipDrift` with a flight row of the fixture's thrust, and
 * `stepBuoyDrift` for the buoy fixture, whose thrust is `BUOY_THRUST`). The
 * fixtures pin Oolite's float32 arithmetic.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { add, identity, scale, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { OOLITE_DEFAULT_FLIGHT_STATS } from "../../../src/sim/npc/stats.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import {
  BUOY_THRUST,
  brakeShipDrift,
  stepBuoyDrift,
  stepShipDrift,
} from "../../../src/sim/world/drift.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import {
  BRAKING_NPC_FIXTURE_FILE,
  BrakingFileSchema,
  withinTolerance,
} from "../../oracles/combat/response/schema.js";
import type { BrakingFixture } from "../../oracles/combat/response/schema.js";

const THIS_FILE = "tests/sim/world/ship-braking.oracle.test.ts";

/** The buoy fixture: the one `stepBuoyDrift` replays too. */
const BUOY_FIXTURE_ID = "brake-ship-buoy-thrust-100-from-100";

function readFixtures(): readonly BrakingFixture[] {
  // braking-npc.json, through the schema's file constant.
  return BrakingFileSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../oracles/combat/response/${BRAKING_NPC_FIXTURE_FILE}`,
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown,
  );
}

interface Run {
  readonly speeds: readonly number[];
  readonly position: Vec3;
  readonly drift: Vec3;
  readonly stopTick: number | null;
}

const magnitude = (v: Vec3): number =>
  Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const isZero = (v: Vec3): boolean => v.x === 0 && v.y === 0 && v.z === 0;

/**
 * Run `ticks` ticks of `tick`, which advances the body one tick and returns its
 * position and drift; records the speeds and the first tick the drift is zero.
 */
function record(
  fixture: BrakingFixture,
  start: { readonly position: Vec3; readonly drift: Vec3 },
  tick: () => { readonly position: Vec3; readonly drift: Vec3 },
): Run {
  let position = start.position;
  let drift = start.drift;
  let stopTick: number | null = null;
  const speeds: number[] = [];
  for (let t = 1; t <= fixture.ticks; t += 1) {
    const moving = !isZero(drift);
    ({ position, drift } = tick());
    if (moving && stopTick === null && isZero(drift)) stopTick = t;
    speeds.push(magnitude(drift));
  }
  return {
    speeds,
    position: vec(
      position.x - start.position.x,
      position.y - start.position.y,
      position.z - start.position.z,
    ),
    drift,
    stopTick,
  };
}

/** `brakeShipDrift` alone, in `stepShipDrift`'s order. */
function replayKernel(fixture: BrakingFixture): Run {
  let drift = vec(...fixture.velocity);
  let position = vec(0, 0, 0);
  return record(fixture, { position, drift }, () => {
    if (!isZero(drift)) {
      drift = brakeShipDrift(drift, fixture.thrust, fixture.dt);
      if (!isZero(drift)) position = add(position, scale(drift, fixture.dt));
    }
    return { position, drift };
  });
}

/** A ship with a flight row of the fixture's thrust, through `stepShipDrift`. */
function replayShipPass(fixture: BrakingFixture): Run {
  const row: NpcFlightStats = {
    ...OOLITE_DEFAULT_FLIGHT_STATS,
    specKey: "fixture-kind",
    thrust: fixture.thrust,
  };
  const world = createWorld(1);
  const spawned = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "fixture-kind",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 10,
      ai: null,
      velocity: vec(...fixture.velocity),
    },
    0,
  );
  if (!spawned.ok) throw new Error(`spawn refused: ${spawned.reason}`);
  const ship = spawned.entity;
  return record(
    fixture,
    { position: ship.position, drift: ship.velocity },
    () => {
      stepShipDrift(world, fixture.dt, { flight: [row] });
      return { position: ship.position, drift: ship.velocity };
    },
  );
}

/** The nav buoy, through `stepBuoyDrift`. */
function replayBuoyPass(fixture: BrakingFixture): Run {
  const world = createWorld(1);
  const buoy = world.buoys.navBuoy;
  buoy.velocity = vec(...fixture.velocity);
  return record(
    fixture,
    { position: buoy.offset, drift: buoy.velocity },
    () => {
      stepBuoyDrift(world, fixture.dt);
      return { position: buoy.offset, drift: buoy.velocity };
    },
  );
}

function expectClose(
  label: string,
  actual: number,
  expected: number,
  tolerance: number,
): void {
  expect(
    withinTolerance(actual, expected, tolerance),
    `${label}: ${String(actual)} vs ${String(expected)}`,
  ).toBe(true);
}

function expectRun(run: Run, fixture: BrakingFixture): void {
  const { expected, tolerance } = fixture;
  expect(run.stopTick).toBe(expected.stopTick);
  for (const sample of expected.samples) {
    expectClose(
      `speed at tick ${String(sample.tick)}`,
      run.speeds[sample.tick - 1] ?? Number.NaN,
      sample.speed,
      tolerance,
    );
  }
  const [px, py, pz] = expected.positionChange;
  expectClose("position x", run.position.x, px, tolerance);
  expectClose("position y", run.position.y, py, tolerance);
  expectClose("position z", run.position.z, pz, tolerance);
  const [vx, vy, vz] = expected.finalVelocity;
  expectClose("final drift x", run.drift.x, vx, tolerance);
  expectClose("final drift y", run.drift.y, vy, tolerance);
  expectClose("final drift z", run.drift.z, vz, tolerance);
}

const ran: string[] = [];

describe(THIS_FILE, () => {
  for (const fixture of readFixtures()) {
    describe(fixture.id, () => {
      it("brakeShipDrift, tick by tick", () => {
        ran.push(fixture.id);
        expect(fixture.kind).toBe("ship");
        expectRun(replayKernel(fixture), fixture);
      });

      it("the ship drift pass", () => {
        expectRun(replayShipPass(fixture), fixture);
      });

      if (fixture.id === BUOY_FIXTURE_ID) {
        it("the buoy drift pass (PD-02)", () => {
          expect(fixture.thrust).toBe(BUOY_THRUST);
          expectRun(replayBuoyPass(fixture), fixture);
        });
      }
    });
  }
});

describe("the manifest entry", () => {
  it("runs exactly the fixtures of braking-npc.json, the buoy among them", () => {
    const expected = readFixtures().map((fixture) => fixture.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected).toContain(BUOY_FIXTURE_ID);
    expect([...ran].sort()).toEqual([...expected].sort());
  });
});
