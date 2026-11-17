// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's alert condition (FLGT-05, quick task 261117-pij).
 *
 * Expected values are derived by hand from Oolite at the pin 7437f22: the
 * flags (`PlayerEntity.h:223-229`), the condition (`PlayerEntity.m:5122-5144`:
 * any flag is yellow, a flag above 0x03f is red), the flag thresholds
 * (`PlayerEntity.m:2976-2993`: energy below 64 and below 0.8 of maximum, heat
 * above 0.9, altitude dial below 0.1), the dial (`PlayerEntity.m:4330-4347`,
 * 40,000 m) and the hostiles scan (`PlayerEntity.m:2935-2950`,
 * `ShipEntity.m:6398-6444`, scanner range 25,600 m).
 */

import { describe, expect, it } from "vitest";

import {
  ALERT_FLAG_ALT,
  ALERT_FLAG_ENERGY,
  ALERT_FLAG_HOSTILES,
  ALERT_FLAG_MASS_LOCK,
  ALERT_FLAG_TEMP,
  PLAYER_DIAL_MAX_ALTITUDE,
  alertFlags,
  dialAltitude,
  flightAlertCondition,
  hostilesNearPlayer,
  isBehaviourHostile,
} from "../../../src/sim/combat/alert.js";
import type { AlertInputs } from "../../../src/sim/combat/alert.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import type { BehaviourId } from "../../../src/sim/world/ids.js";
import type { SystemLayout } from "../../../src/sim/world/layout.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";

const CALM: AlertInputs = {
  massLocked: false,
  energy: 256,
  maxEnergy: 256,
  heatLevel: 0.2,
  altitudeDial: 1,
  hostiles: false,
};

function condition(inputs: Partial<AlertInputs>) {
  return flightAlertCondition(alertFlags({ ...CALM, ...inputs }));
}

describe("flightAlertCondition from the flags", () => {
  it("is green with no flag, yellow for mass lock alone, red for any other flag", () => {
    expect(flightAlertCondition(0)).toBe("green");
    expect(flightAlertCondition(ALERT_FLAG_MASS_LOCK)).toBe("yellow");
    for (const flag of [
      ALERT_FLAG_TEMP,
      ALERT_FLAG_ALT,
      ALERT_FLAG_ENERGY,
      ALERT_FLAG_HOSTILES,
    ]) {
      expect(flightAlertCondition(flag)).toBe("red");
      expect(flightAlertCondition(flag | ALERT_FLAG_MASS_LOCK)).toBe("red");
    }
  });

  it("derives each flag from its input", () => {
    expect(condition({})).toBe("green");
    expect(condition({ massLocked: true })).toBe("yellow");
    expect(condition({ hostiles: true })).toBe("red");
    expect(condition({ energy: 10 })).toBe("red");
    expect(condition({ heatLevel: 0.95 })).toBe("red");
    expect(condition({ altitudeDial: 0.05 })).toBe("red");
    expect(condition({ massLocked: true, energy: 10 })).toBe("red");
  });

  it("pins the thresholds", () => {
    expect(alertFlags({ ...CALM, energy: 63 }) & ALERT_FLAG_ENERGY).toBe(
      ALERT_FLAG_ENERGY,
    );
    expect(alertFlags({ ...CALM, energy: 64 }) & ALERT_FLAG_ENERGY).toBe(0);
    // Below 64 but not below 0.8 of a small maximum: no flag.
    expect(
      alertFlags({ ...CALM, energy: 60, maxEnergy: 70 }) & ALERT_FLAG_ENERGY,
    ).toBe(0);
    expect(alertFlags({ ...CALM, heatLevel: 0.9 }) & ALERT_FLAG_TEMP).toBe(0);
    expect(alertFlags({ ...CALM, heatLevel: 0.9001 }) & ALERT_FLAG_TEMP).toBe(
      ALERT_FLAG_TEMP,
    );
    expect(alertFlags({ ...CALM, altitudeDial: 0.0999 }) & ALERT_FLAG_ALT).toBe(
      ALERT_FLAG_ALT,
    );
    expect(alertFlags({ ...CALM, altitudeDial: 0.1 }) & ALERT_FLAG_ALT).toBe(0);
  });

  it("never sets a flag from a non-finite number", () => {
    expect(
      alertFlags({
        ...CALM,
        energy: Number.NaN,
        heatLevel: Number.NaN,
        altitudeDial: Number.NaN,
      }),
    ).toBe(0);
  });
});

function body(position: Vec3, radius: number) {
  return { position, radius };
}

function layoutWith(
  planet: { position: Vec3; radius: number },
  sun: { position: Vec3; radius: number },
): SystemLayout {
  return { planet, sun } as unknown as SystemLayout;
}

describe("dialAltitude", () => {
  const planet = body(vec(0, 0, 0), 5000);
  const sun = body(vec(1e9, 0, 0), 700_000);

  it("is the planet's surface distance over 40,000 m", () => {
    const layout = layoutWith(planet, sun);
    expect(PLAYER_DIAL_MAX_ALTITUDE).toBe(40_000);
    expect(dialAltitude(vec(0, 0, 5000 + 4000), layout)).toBeCloseTo(0.1, 12);
    expect(dialAltitude(vec(0, 0, 5000 + 20_000), layout)).toBeCloseTo(0.5, 12);
    expect(dialAltitude(vec(0, 0, 5000 + 100_000), layout)).toBe(1);
  });

  it("is 0 inside a body", () => {
    expect(dialAltitude(vec(0, 0, 100), layoutWith(planet, sun))).toBe(0);
  });

  it("picks the sun when its surface is nearer", () => {
    const nearSun = body(vec(0, 0, 0), 700_000);
    const farPlanet = body(vec(0, 0, 1e8), 5000);
    const layout = layoutWith(farPlanet, nearSun);
    expect(dialAltitude(vec(0, 0, -(700_000 + 8000)), layout)).toBeCloseTo(
      0.2,
      12,
    );
  });
});

const PLAYER = vec(0, 0, 0);

function spawn(world: World, extra: Partial<SpawnInit> = {}): Entity {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "adder",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, -5000),
      orientation: identity(),
      radius: 30,
      ...extra,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

function attacker(
  world: World,
  behaviour: BehaviourId,
  extra: Partial<SpawnInit> = {},
): Entity {
  const ship = spawn(world, extra);
  ship.nav.behaviour = behaviour;
  ship.nav.targetId = PLAYER_ID;
  return ship;
}

describe("hostilesNearPlayer", () => {
  it("is true for a ship attacking the player within scanner range", () => {
    for (const behaviour of [
      "ATTACK_TARGET",
      "ATTACK_FLY_TO_TARGET_SIX",
      "FLEE_TARGET",
      "CLOSE_WITH_TARGET",
    ] as const) {
      const world = createWorld(7);
      attacker(world, behaviour, { position: vec(0, 0, -25_000) });
      expect(hostilesNearPlayer(world, PLAYER)).toBe(true);
    }
  });

  it("is false beyond the range, for another target and for mining", () => {
    const far = createWorld(7);
    attacker(far, "ATTACK_TARGET", { position: vec(0, 0, -25_601) });
    expect(hostilesNearPlayer(far, PLAYER)).toBe(false);

    const other = createWorld(7);
    const ship = attacker(other, "ATTACK_TARGET");
    ship.nav.targetId = PLAYER_ID + 1;
    expect(hostilesNearPlayer(other, PLAYER)).toBe(false);

    const mining = createWorld(7);
    attacker(mining, "ATTACK_MINING_TARGET");
    expect(isBehaviourHostile("ATTACK_MINING_TARGET")).toBe(false);
    expect(hostilesNearPlayer(mining, PLAYER)).toBe(false);
  });

  it("skips a dead entity and an undefined world", () => {
    const world = createWorld(7);
    const ship = attacker(world, "ATTACK_TARGET");
    ship.dead = true;
    expect(hostilesNearPlayer(world, PLAYER)).toBe(false);
    expect(hostilesNearPlayer(undefined, PLAYER)).toBe(false);
  });

  it("reads the saved behaviour of a ship avoiding a collision", () => {
    const world = createWorld(7);
    const ship = attacker(world, "AVOID_COLLISION");
    expect(hostilesNearPlayer(world, PLAYER)).toBe(false);
    ship.steer.saved = {
      behaviour: "ATTACK_TARGET",
      targetId: PLAYER_ID,
      destination: vec(0, 0, 0),
      desiredRange: 0,
      desiredSpeed: 0,
    };
    expect(hostilesNearPlayer(world, PLAYER)).toBe(true);
  });

  it("is true for a Thargoid in range whatever it does", () => {
    const world = createWorld(7);
    spawn(world, { scanClass: "CLASS_THARGOID" });
    expect(hostilesNearPlayer(world, PLAYER)).toBe(true);
  });

  it("is false for a calm ship", () => {
    const world = createWorld(7);
    spawn(world);
    expect(hostilesNearPlayer(world, PLAYER)).toBe(false);
  });
});
