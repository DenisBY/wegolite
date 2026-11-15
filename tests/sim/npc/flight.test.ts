// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC flight model against Oolite's rules (AI-01, plan 14-09). Expected
 * values are derived by hand from the cited `ShipEntity.m` lines, never from
 * running the implementation; the independent oracle fixtures are run by
 * `flight.oracle.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { identity, vec } from "../../../src/sim/math.js";
import {
  applyAttitude,
  applySticks,
  applyThrust,
  decreaseFlightSpeed,
  increaseFlightSpeed,
} from "../../../src/sim/npc/flight.js";
import {
  OOLITE_DEFAULT_FLIGHT_STATS,
  statsFor,
} from "../../../src/sim/npc/stats.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";

const DT = 1 / 120;

function ship(): Entity {
  const result = spawnEntity(
    createWorld(1),
    {
      kind: "ship",
      specKey: "t",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 10,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  return result.entity;
}

const STATS: NpcFlightStats = {
  specKey: "t",
  maxFlightSpeed: 160,
  maxFlightRoll: 2,
  maxFlightPitch: 1,
  thrust: 15,
  mass: 0,
  forwardWeapon: "EQ_WEAPON_NONE",
};

describe("applySticks (ShipEntity.m:7018-7065)", () => {
  it("ramps the roll rate by 2 * dt and the pitch rate by 4 * dt", () => {
    const entity = ship();
    entity.steer.accuracy = 0;
    entity.steer.stickRoll = 1;
    entity.steer.stickPitch = 1;
    applySticks(entity, DT);
    expect(entity.steer.flightRoll).toBeCloseTo(2 * DT, 12);
    expect(entity.steer.flightPitch).toBeCloseTo(4 * DT, 12);
  });

  it("multiplies the rate by 4 when the stick opposes the rate", () => {
    const entity = ship();
    entity.steer.accuracy = 0;
    entity.steer.flightRoll = -0.5;
    entity.steer.stickRoll = 0.5;
    entity.steer.flightPitch = 0.5;
    entity.steer.stickPitch = -0.5;
    applySticks(entity, DT);
    expect(entity.steer.flightRoll).toBeCloseTo(-0.5 + 4 * 2 * DT, 12);
    expect(entity.steer.flightPitch).toBeCloseTo(0.5 - 4 * 4 * DT, 12);
  });

  it("doubles the rate at rest once the accuracy is COMBAT_AI_TRACKS_CLOSER (7.5)", () => {
    const sharp = ship();
    sharp.steer.accuracy = 7.5;
    sharp.steer.flightRoll = 1;
    sharp.steer.flightPitch = 1;
    applySticks(sharp, DT);
    expect(sharp.steer.flightRoll).toBeCloseTo(1 - 2 * 2 * DT, 12);
    expect(sharp.steer.flightPitch).toBeCloseTo(1 - 2 * 4 * DT, 12);

    const dull = ship();
    dull.steer.accuracy = 7.4999;
    dull.steer.flightRoll = 1;
    dull.steer.flightPitch = 1;
    applySticks(dull, DT);
    expect(dull.steer.flightRoll).toBeCloseTo(1 - 2 * DT, 12);
    expect(dull.steer.flightPitch).toBeCloseTo(1 - 4 * DT, 12);
  });

  it("snaps to the stick within one step", () => {
    const entity = ship();
    entity.steer.accuracy = 0;
    entity.steer.flightRoll = 0.9999;
    entity.steer.stickRoll = 1;
    entity.steer.flightPitch = -0.0001;
    entity.steer.stickPitch = 0;
    applySticks(entity, DT);
    expect(entity.steer.flightRoll).toBe(1);
    expect(entity.steer.flightPitch).toBe(0);
  });
});

describe("applyThrust (ShipEntity.m:5808-5854)", () => {
  it("ramps by 5 * thrust * dt per tick, never overshoots, and moves along the nose (-Z)", () => {
    const entity = ship();
    entity.nav.desiredSpeed = 1;
    const step = 5 * 15 * DT; // 0.625
    applyThrust(entity, STATS, DT);
    expect(entity.speed).toBeCloseTo(step, 12);
    expect(entity.position.z).toBeCloseTo(-step * DT, 12);
    applyThrust(entity, STATS, DT);
    // 2 * 0.625 = 1.25 exceeds the desired 1, so it holds at 1.
    expect(entity.speed).toBe(1);
  });

  it("clamps desiredSpeed to maxFlightSpeed and writes the clamp back", () => {
    const entity = ship();
    entity.nav.desiredSpeed = 500;
    applyThrust(entity, STATS, DT);
    expect(entity.nav.desiredSpeed).toBe(160);
  });

  it("a tumbling ship neither ramps nor moves nor clamps", () => {
    const entity = ship();
    entity.nav.behaviour = "TUMBLE";
    entity.nav.desiredSpeed = 500;
    entity.speed = 10;
    applyThrust(entity, STATS, DT);
    expect(entity.speed).toBe(10);
    expect(entity.position).toEqual(vec(0, 0, 0));
    expect(entity.nav.desiredSpeed).toBe(500);
  });

  it("slows by 5 * thrust * dt down to the desired speed, never below it", () => {
    const entity = ship();
    entity.speed = 100;
    entity.nav.desiredSpeed = 99.5;
    applyThrust(entity, STATS, DT);
    expect(entity.speed).toBe(99.5);
  });

  it("slows a ship above maxFlightSpeed by MIN_HYPERSPEED_FACTOR (32) times the step", () => {
    const entity = ship();
    entity.speed = 300;
    entity.nav.desiredSpeed = 160;
    const step = 32 * 5 * 15 * DT; // 20
    const seen: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      applyThrust(entity, STATS, DT);
      seen.push(entity.speed);
    }
    // 300 - 20 n while above 160 (the step is 32 times the thrust step), so
    // 280, 260, 240, 220, 200, 180, then 160 (within float noise), then held.
    for (let n = 1; n <= 7; n += 1) {
      expect(seen[n - 1]).toBeCloseTo(300 - n * step, 9);
    }
    expect(seen[7]).toBe(160);
  });

  it("the literal ramps: increase stops at the maximum, decrease floors at 0", () => {
    const entity = ship();
    entity.speed = 159.9;
    increaseFlightSpeed(entity, STATS, 5);
    expect(entity.speed).toBeCloseTo(164.9, 9);
    increaseFlightSpeed(entity, STATS, 5);
    expect(entity.speed).toBe(160);
    entity.speed = 3;
    decreaseFlightSpeed(entity, STATS, 3);
    expect(entity.speed).toBe(0);
  });
});

describe("applyAttitude (ShipEntity.m:5881-5902)", () => {
  it("does nothing for two zero rates and keeps the quaternion unit otherwise", () => {
    const entity = ship();
    applyAttitude(entity, DT);
    expect(entity.orientation).toEqual(identity());
    entity.steer.flightRoll = 1.3;
    entity.steer.flightPitch = -0.7;
    for (let i = 0; i < 500; i += 1) applyAttitude(entity, DT);
    const q = entity.orientation;
    expect(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z).toBeCloseTo(1, 12);
  });
});

describe("statsFor", () => {
  const row = (overrides: Partial<NpcFlightStats>): NpcFlightStats => ({
    ...STATS,
    specKey: "viper",
    maxFlightSpeed: 320,
    ...overrides,
  });

  it("returns the matching usable row", () => {
    const table = [row({ specKey: "other" }), row({})];
    expect(statsFor(table, "viper")).toBe(table[1]);
  });

  it("falls back to Oolite's defaults for a missing table, row or bad value", () => {
    expect(statsFor(undefined, "viper")).toBe(OOLITE_DEFAULT_FLIGHT_STATS);
    expect(statsFor([], "viper")).toBe(OOLITE_DEFAULT_FLIGHT_STATS);
    expect(statsFor([row({})], "other")).toBe(OOLITE_DEFAULT_FLIGHT_STATS);
    for (const bad of [Number.NaN, Infinity, -1]) {
      expect(statsFor([row({ maxFlightSpeed: bad })], "viper")).toBe(
        OOLITE_DEFAULT_FLIGHT_STATS,
      );
      expect(statsFor([row({ thrust: bad })], "viper")).toBe(
        OOLITE_DEFAULT_FLIGHT_STATS,
      );
      expect(statsFor([row({ maxFlightRoll: bad })], "viper")).toBe(
        OOLITE_DEFAULT_FLIGHT_STATS,
      );
      expect(statsFor([row({ maxFlightPitch: bad })], "viper")).toBe(
        OOLITE_DEFAULT_FLIGHT_STATS,
      );
      expect(statsFor([row({ mass: bad })], "viper")).toBe(
        OOLITE_DEFAULT_FLIGHT_STATS,
      );
    }
    expect(statsFor([row({ maxFlightRoll: 1e4 })], "viper")).toBe(
      OOLITE_DEFAULT_FLIGHT_STATS,
    );
  });

  it("the defaults are Oolite's 160, 2.0, 1.0, 15.0 (ShipEntity.m:263-270)", () => {
    expect(OOLITE_DEFAULT_FLIGHT_STATS).toMatchObject({
      maxFlightSpeed: 160,
      maxFlightRoll: 2,
      maxFlightPitch: 1,
      thrust: 15,
      mass: 0,
      forwardWeapon: "EQ_WEAPON_NONE",
    });
  });
});
