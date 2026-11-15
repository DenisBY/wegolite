// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The write side of the AI seam (FOUND-13; plan 08-07; T-08-12, T-08-51).
 * Expected values come from the rules of the plan and the shared limits, never
 * from running the implementation.
 */

import { describe, expect, it } from "vitest";

import { identity, vec } from "../../../src/sim/math.js";
import type { ShipControl } from "../../../src/sim/world/control.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import {
  MAIN_STATION_ID,
  NO_ENTITY,
  PLAYER_ID,
} from "../../../src/sim/world/ids.js";
import type { BehaviourId } from "../../../src/sim/world/ids.js";
import {
  MAX_ENTITY_MAGNITUDE,
  MAX_UINT32,
} from "../../../src/sim/world/limits.js";
import {
  commitWorld,
  createWorld,
  killEntity,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";

/** The exhaustive member set of ShipControl: adding or removing one fails typecheck. */
const CONTROL_MEMBERS: Record<keyof ShipControl, true> = {
  setTarget: true,
  setDestination: true,
  setDesiredRange: true,
  setDesiredSpeed: true,
  perform: true,
  scheduleWake: true,
  fire: true,
};

function shipInit(overrides: Partial<SpawnInit> = {}): SpawnInit {
  return {
    kind: "ship",
    specKey: "test-ship",
    scanClass: "CLASS_NEUTRAL",
    position: vec(100, 200, 300),
    orientation: identity(),
    radius: 50,
    speed: 7,
    ai: { aiKey: "test-pilot", params: {}, wakeTick: 0, nextThinkTick: 0 },
    ...overrides,
  };
}

function spawnOk(world: World, overrides: Partial<SpawnInit> = {}) {
  const result = spawnEntity(world, shipInit(overrides), 0);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  const entity = result.entity;
  return entity;
}

describe("ShipControl member set", () => {
  it("equals the pinned CONTROL_MEMBERS exactly (Pitfall 19)", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    expect(Object.keys(control).sort()).toEqual(
      Object.keys(CONTROL_MEMBERS).sort(),
    );
  });
});

describe("actor-only writes (T-08-12)", () => {
  it("writes to the actor land in the actor's nav fields only", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    const before = structuredClone(actor);

    control.setTarget(actor.id, 105);
    control.setDestination(actor.id, vec(1, 2, 3));
    control.setDesiredRange(actor.id, 400);
    control.setDesiredSpeed(actor.id, 250);
    control.perform(actor.id, "FLY_TO_DESTINATION");

    expect(actor.nav).toEqual({
      behaviour: "FLY_TO_DESTINATION",
      targetId: 105,
      destination: vec(1, 2, 3),
      desiredRange: 400,
      desiredSpeed: 250,
    });
    // Nothing outside nav changed.
    expect({ ...actor, nav: before.nav }).toEqual(before);
  });

  it("a write whose id is not the actor changes nothing", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const other = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    const otherBefore = structuredClone(other);
    const actorBefore = structuredClone(actor);

    for (const id of [other.id, PLAYER_ID, MAIN_STATION_ID, NO_ENTITY, 9999]) {
      control.setTarget(id, 105);
      control.setDestination(id, vec(1, 2, 3));
      control.setDesiredRange(id, 400);
      control.setDesiredSpeed(id, 250);
      control.perform(id, "FLY_TO_DESTINATION");
      control.scheduleWake(id, 30);
      control.fire(id);
    }

    expect(other).toEqual(otherBefore);
    expect(actor).toEqual(actorBefore);
    expect(world.fireQueue).toEqual([]);
  });

  it("a control for a killed, committed or never-spawned actor writes nothing", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    const ghost = createShipControl(world, 777, 0);
    killEntity(world, actor.id);
    const before = structuredClone(actor);

    control.setDesiredSpeed(actor.id, 99);
    control.scheduleWake(actor.id, 5);
    ghost.setDesiredSpeed(777, 99);
    expect(actor).toEqual(before);

    commitWorld(world);
    control.setTarget(actor.id, 3);
    expect(world.store.get(actor.id)).toBeUndefined();
  });

  it("a control over the player id or a static id writes nothing", () => {
    const world = createWorld(1);
    const bystander = spawnOk(world);
    const before = structuredClone(bystander);
    for (const id of [PLAYER_ID, MAIN_STATION_ID]) {
      const control = createShipControl(world, id, 0);
      control.setDesiredSpeed(id, 5);
      control.perform(id, "FLY_TO_DESTINATION");
      control.scheduleWake(id, 5);
    }
    expect(bystander).toEqual(before);
  });
});

describe("fire (CBT-07, Pitfall 19, T-13-20, T-13-21)", () => {
  it("queues the actor once per tick and nothing else", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    const before = structuredClone(actor);

    control.fire(actor.id);
    control.fire(actor.id);
    expect(world.fireQueue).toEqual([actor.id]);
    // The shot is queued, never resolved here: the entity is untouched.
    expect(actor).toEqual(before);
  });

  it("ignores a call addressed to another entity, the player, a static or a ghost, without throwing", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const other = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);

    for (const id of [other.id, PLAYER_ID, MAIN_STATION_ID, NO_ENTITY, 9999]) {
      expect(() => control.fire(id)).not.toThrow();
    }
    expect(world.fireQueue).toEqual([]);
  });

  it("ignores a killed or committed actor", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    killEntity(world, actor.id);
    commitWorld(world);
    control.fire(actor.id);
    expect(world.fireQueue).toEqual([]);
  });

  it("never holds more than one entry per actor, so the queue stays bounded by the store", () => {
    const world = createWorld(1);
    const ids: number[] = [];
    for (let i = 0; i < 12; i += 1) ids.push(spawnOk(world).id);
    for (const id of ids) {
      const control = createShipControl(world, id, 0);
      control.fire(id);
      control.fire(id);
    }
    expect(world.fireQueue).toEqual(ids);
  });
});

describe("argument validation: ignore, never throw, never clamp", () => {
  it("setDestination stores a copy", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    const target = { x: 1, y: 2, z: 3 };
    control.setDestination(actor.id, target);
    target.x = 99;
    expect(actor.nav.destination).toEqual(vec(1, 2, 3));
    expect(actor.nav.destination).not.toBe(target);
  });

  it("NaN, Infinity and negative speeds and ranges are ignored", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    control.setDesiredSpeed(actor.id, 50);
    control.setDesiredRange(actor.id, 60);

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, -0.001]) {
      control.setDesiredSpeed(actor.id, bad);
      control.setDesiredRange(actor.id, bad);
      expect(actor.nav.desiredSpeed, `speed ${String(bad)}`).toBe(50);
      expect(actor.nav.desiredRange, `range ${String(bad)}`).toBe(60);
    }
    control.setDesiredSpeed(actor.id, 0);
    control.setDesiredRange(actor.id, 0);
    expect(actor.nav.desiredSpeed).toBe(0);
    expect(actor.nav.desiredRange).toBe(0);
  });

  it("perform with an unknown behaviour is ignored", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    control.perform(actor.id, "NOT_A_BEHAVIOUR" as BehaviourId);
    control.perform(actor.id, "idle" as BehaviourId);
    control.perform(actor.id, "" as BehaviourId);
    expect(actor.nav.behaviour).toBe("IDLE");
    control.perform(actor.id, "TUMBLE");
    expect(actor.nav.behaviour).toBe("TUMBLE");
  });

  it("scheduleWake sets, keeps the earlier of, and never delays a wake", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 100);
    expect(actor.ai?.wakeTick).toBe(0);

    control.scheduleWake(actor.id, 30);
    expect(actor.ai?.wakeTick).toBe(130);
    control.scheduleWake(actor.id, 60);
    expect(actor.ai?.wakeTick).toBe(130);
    control.scheduleWake(actor.id, 10);
    expect(actor.ai?.wakeTick).toBe(110);
  });

  it("scheduleWake ignores 0, fractions, NaN, negatives and infinity", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 100);
    for (const bad of [0, 1.5, Number.NaN, -3, Number.POSITIVE_INFINITY]) {
      control.scheduleWake(actor.id, bad);
      expect(actor.ai?.wakeTick, `ticks ${String(bad)}`).toBe(0);
    }
    control.scheduleWake(actor.id, 1);
    expect(actor.ai?.wakeTick).toBe(101);
  });

  it("scheduleWake on an actor without an AI component changes nothing", () => {
    const world = createWorld(1);
    const actor = spawnOk(world, { ai: null });
    const control = createShipControl(world, actor.id, 100);
    const before = structuredClone(actor);
    control.scheduleWake(actor.id, 30);
    expect(actor).toEqual(before);
    expect(actor.ai).toBeNull();
  });
});

describe("the shared serialised domain (Round 4 consensus 12, T-08-51)", () => {
  it("setDesiredSpeed and setDesiredRange accept 1e12 and ignore 1e13", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);

    control.setDesiredSpeed(actor.id, 1e13);
    control.setDesiredRange(actor.id, 1e13);
    expect(actor.nav.desiredSpeed).toBe(7);
    expect(actor.nav.desiredRange).toBe(0);

    control.setDesiredSpeed(actor.id, MAX_ENTITY_MAGNITUDE);
    control.setDesiredRange(actor.id, MAX_ENTITY_MAGNITUDE);
    expect(actor.nav.desiredSpeed).toBe(1e12);
    expect(actor.nav.desiredRange).toBe(1e12);
  });

  it("setTarget accepts 0 and 0xffffffff and ignores 2 ** 32, -1, 1.5 and NaN", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);

    control.setTarget(actor.id, 200);
    for (const bad of [2 ** 32, -1, 1.5, Number.NaN, 2 ** 53]) {
      control.setTarget(actor.id, bad);
      expect(actor.nav.targetId, `target ${String(bad)}`).toBe(200);
    }
    control.setTarget(actor.id, 0xffffffff);
    expect(actor.nav.targetId).toBe(MAX_UINT32);
    control.setTarget(actor.id, 0);
    expect(actor.nav.targetId).toBe(0);
  });

  it("setDestination ignores a component beyond 1e12, NaN or Infinity; accepts the bound", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    const start = structuredClone(actor.nav.destination);

    for (const bad of [1e13, -1e13, Number.NaN, Number.POSITIVE_INFINITY]) {
      control.setDestination(actor.id, vec(bad, 0, 0));
      control.setDestination(actor.id, vec(0, bad, 0));
      control.setDestination(actor.id, vec(0, 0, bad));
      expect(actor.nav.destination, `component ${String(bad)}`).toEqual(start);
    }
    control.setDestination(actor.id, vec(1e12, -1e12, 0));
    expect(actor.nav.destination).toEqual(vec(1e12, -1e12, 0));
  });

  it('perform ignores "constructor", "toString" and "__proto__"', () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const control = createShipControl(world, actor.id, 0);
    for (const name of [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
    ]) {
      control.perform(actor.id, name as BehaviourId);
      expect(actor.nav.behaviour, name).toBe("IDLE");
    }
  });

  it("scheduleWake ignores a wake past 0xffffffff and accepts exactly 0xffffffff", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    const late = createShipControl(world, actor.id, 0xffffffff - 5);

    late.scheduleWake(actor.id, 10);
    expect(actor.ai?.wakeTick).toBe(0);
    late.scheduleWake(actor.id, 2 ** 40);
    expect(actor.ai?.wakeTick).toBe(0);
    late.scheduleWake(actor.id, 5);
    expect(actor.ai?.wakeTick).toBe(0xffffffff);
  });

  it("scheduleWake ignores a control whose tick is not a uint32", () => {
    const world = createWorld(1);
    const actor = spawnOk(world);
    for (const tick of [Number.NaN, -1, 2 ** 32]) {
      createShipControl(world, actor.id, tick).scheduleWake(actor.id, 1);
      expect(actor.ai?.wakeTick, `tick ${String(tick)}`).toBe(0);
    }
  });
});
