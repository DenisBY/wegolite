// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's drift braking against the independent 18-03 oracle (CBT-18,
 * D-02).
 *
 * Each `braking-player.json` fixture is replayed through `brakePlayerDrift`
 * with the flight step's own per-tick integration: the position moves by the
 * drift first (`applyVelocity:`, `PlayerEntity.m:3376`), then the drift is
 * braked with the thrust factor the flight step picks (the torus factor only
 * while the speed is above `maxSpeed`, 3378-3385). The fixtures pin Oolite's
 * float32 arithmetic, so the long cleanup runs (about 10,000 ticks) only match
 * a port that rounds its GLfloat locals as the C does.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { brakePlayerDrift } from "../../src/sim/flight/drift.js";
import { add, scale, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import {
  BRAKING_PLAYER_FIXTURE_FILE,
  BrakingFileSchema,
  withinTolerance,
} from "../oracles/combat/response/schema.js";
import type { BrakingFixture } from "../oracles/combat/response/schema.js";

const THIS_FILE = "tests/sim/player-braking.oracle.test.ts";

function readFixtures(): readonly BrakingFixture[] {
  return BrakingFileSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../oracles/combat/response/${BRAKING_PLAYER_FIXTURE_FILE}`,
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

/** The flight step's drift handling, tick by tick (`src/sim/flight/step.ts`). */
function replay(fixture: BrakingFixture): Run {
  const { speed, maxSpeed, torusFactor } = fixture;
  if (speed === null || maxSpeed === null || torusFactor === null) {
    throw new Error(`${fixture.id} is not a player fixture`);
  }
  const thrustFactor = speed > maxSpeed ? torusFactor : 1;
  let drift = vec(...fixture.velocity);
  let position = vec(0, 0, 0);
  let stopTick: number | null = null;
  const speeds: number[] = [];
  for (let tick = 1; tick <= fixture.ticks; tick += 1) {
    const moving = drift.x !== 0 || drift.y !== 0 || drift.z !== 0;
    if (moving) {
      position = add(position, scale(drift, fixture.dt));
      drift = brakePlayerDrift(drift, fixture.dt, fixture.thrust, thrustFactor);
    }
    const magnitude = Math.sqrt(
      drift.x * drift.x + drift.y * drift.y + drift.z * drift.z,
    );
    if (moving && stopTick === null && magnitude === 0) stopTick = tick;
    speeds.push(magnitude);
  }
  return { speeds, position, drift, stopTick };
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

const ran: string[] = [];

describe(THIS_FILE, () => {
  for (const fixture of readFixtures()) {
    it(fixture.id, () => {
      ran.push(fixture.id);
      expect(fixture.kind).toBe("player");
      const run = replay(fixture);
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
    });
  }
});

describe("the manifest entry", () => {
  it("runs exactly the fixtures of braking-player.json", () => {
    const expected = readFixtures().map((fixture) => fixture.id);
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual([...expected].sort());
  });
});
