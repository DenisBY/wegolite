// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's drift braking against the independent 18-03 oracle (CBT-18,
 * D-02).
 *
 * Each `braking-player.json` fixture is replayed through `brakePlayerDrift`
 * by `replay()` below, a transcription of the drift block of the flight step
 * (`src/sim/flight/step.ts`, step 4a): the position moves by the drift first
 * (`applyVelocity:`, `PlayerEntity.m:3376`), then the drift is braked with the
 * thrust factor the step picks (the torus factor only while the speed is above
 * `maxSpeed`, 3378-3385). That loop pins the kernel's float32 arithmetic (the
 * long cleanup runs, about 10,000 ticks, only match a port that rounds its
 * GLfloat locals as the C does) but not the real step's order or factor rule.
 *
 * The real step is held by the last block, which drives `stepFlight` itself
 * for the fixtures whose thrust factor is 1 (engine speed <= maxSpeed). The
 * torus rows are not driven through `stepFlight`: there the engine speed also
 * moves the position along the nose and `stepTorus` owns the factor (it may
 * grow above the fixture's fixed 32 or 1024), so a fixture's positionChange
 * and fixed factor are not what the real step produces; `flight-drift.test.ts`
 * covers the torus factor in the real step.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ZERO_INTENT } from "../../src/sim/flight/controller.js";
import { brakePlayerDrift } from "../../src/sim/flight/drift.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import { stepFlight } from "../../src/sim/flight/step.js";
import { add, scale, vec } from "../../src/sim/math.js";
import type { Vec3 } from "../../src/sim/math.js";
import {
  BRAKING_PLAYER_FIXTURE_FILE,
  BrakingFileSchema,
  withinTolerance,
} from "../oracles/combat/response/schema.js";
import type { BrakingFixture } from "../oracles/combat/response/schema.js";
import { laveFixture } from "../helpers/lave.js";

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

/** The fixtures the real step can reproduce: thrust factor 1, no torus. */
const REAL_STEP_IDS = [
  "brake-player-below-max-speed",
  "brake-player-at-max-speed-no-torus",
  "brake-player-cleanup-band",
  "brake-player-above-full-cleanup",
] as const;

describe("the real stepFlight against the fixtures (review IN-08)", () => {
  const { layout, config } = laveFixture();

  for (const id of REAL_STEP_IDS) {
    it(`${id}: stepFlight reproduces every sampled speed, the stop tick and the position change`, () => {
      const fixture = readFixtures().find((candidate) => candidate.id === id);
      if (fixture === undefined) throw new Error(`no fixture ${id}`);
      expect(config.thrust).toBe(fixture.thrust);
      expect(1 / 120).toBe(fixture.dt);

      // At rest (engine speed 0, so the nose adds no motion and the thrust
      // factor is 1 like the fixture's), 50 km clear of the station.
      const state = initFlightState(layout);
      state.mode = "inFlight";
      state.position = add(state.position, vec(0, 50_000, 0));
      expect(state.speed).toBe(0);
      const start = state.position;
      state.drift = vec(...fixture.velocity);

      const speeds: number[] = [];
      let stopTick: number | null = null;
      for (let tick = 1; tick <= fixture.ticks; tick += 1) {
        const moving =
          state.drift.x !== 0 || state.drift.y !== 0 || state.drift.z !== 0;
        stepFlight(state, layout, config, ZERO_INTENT, [], fixture.dt);
        expect(state.speed).toBe(0);
        const d = state.drift;
        const magnitude = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
        if (moving && stopTick === null && magnitude === 0) stopTick = tick;
        speeds.push(magnitude);
      }

      const { expected, tolerance } = fixture;
      expect(stopTick).toBe(expected.stopTick);
      for (const sample of expected.samples) {
        expectClose(
          `speed at tick ${String(sample.tick)}`,
          speeds[sample.tick - 1] ?? Number.NaN,
          sample.speed,
          tolerance,
        );
      }
      const [px, py, pz] = expected.positionChange;
      expectClose("position x", state.position.x - start.x, px, tolerance);
      expectClose("position y", state.position.y - start.y, py, tolerance);
      expectClose("position z", state.position.z - start.z, pz, tolerance);
      expect([state.drift.x, state.drift.y, state.drift.z]).toEqual(
        expected.finalVelocity,
      );
    }, 60_000);
  }
});
