// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scanner's NPC contacts (Phase 12, plan 12-10, WORLD-15 scanner half).
 *
 * A contact is an id-free snapshot rebuilt from the live world: the oracles are
 * the id-scope rule (no field carries an entity id), the copy rule (mutating a
 * contact never changes an entity) and Oolite's scanner colour classes (police
 * apart from every other ship).
 */

import { describe, expect, it } from "vitest";

import {
  debrisContacts,
  npcContacts,
} from "../../../src/sim/world/contacts.js";
import type { ScanClass } from "../../../src/sim/world/ids.js";
import { killEntity, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { createWorld } from "../../../src/sim/world/world.js";
import { LAVE_EPOCH1_WORLD_SEED } from "../../helpers/inert-world.js";

const IDENTITY = { w: 1, x: 0, y: 0, z: 0 };

function spawnShip(
  world: World,
  specKey: string,
  scanClass: ScanClass,
  x: number,
): void {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass,
      position: { x, y: 2 * x, z: 3 * x },
      orientation: IDENTITY,
      radius: 40,
    },
    0,
  );
  expect(result.ok).toBe(true);
}

describe("npcContacts", () => {
  it("is empty without a world", () => {
    expect(npcContacts(undefined)).toEqual([]);
  });

  it("is empty for a world with no entity", () => {
    expect(npcContacts(createWorld(LAVE_EPOCH1_WORLD_SEED))).toEqual([]);
  });

  it("lists live ships in ascending id order and skips a dead one", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnShip(world, "adder", "CLASS_NEUTRAL", 100);
    spawnShip(world, "viper", "CLASS_POLICE", 200);
    spawnShip(world, "sidewinder", "CLASS_NEUTRAL", 300);
    // The first ship dies this tick: it is still in the store until the commit.
    expect(killEntity(world, 101)).toBe(true);

    const contacts = npcContacts(world);
    expect(contacts.map((contact) => contact.specKey)).toEqual([
      "viper",
      "sidewinder",
    ]);
    expect(contacts.map((contact) => contact.kind)).toEqual([
      "police",
      "neutral",
    ]);
    expect(contacts[0]?.position).toEqual({ x: 200, y: 400, z: 600 });
    expect(contacts[0]?.orientation).toEqual(IDENTITY);
    expect(contacts[0]?.radius).toBe(40);
  });

  it("maps CLASS_POLICE to police and every other scan class to neutral", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnShip(world, "a", "CLASS_POLICE", 1);
    spawnShip(world, "b", "CLASS_MILITARY", 2);
    spawnShip(world, "c", "CLASS_NEUTRAL", 3);
    spawnShip(world, "d", "CLASS_THARGOID", 4);
    expect(npcContacts(world).map((contact) => contact.kind)).toEqual([
      "police",
      "neutral",
      "neutral",
      "neutral",
    ]);
  });

  it("skips an entity that is not a ship", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    const cargo = spawnEntity(
      world,
      {
        kind: "cargo",
        specKey: "canister",
        scanClass: "CLASS_CARGO",
        position: { x: 5, y: 5, z: 5 },
        orientation: IDENTITY,
        radius: 4,
      },
      0,
    );
    expect(cargo.ok).toBe(true);
    spawnShip(world, "adder", "CLASS_NEUTRAL", 10);
    expect(npcContacts(world)).toHaveLength(1);
  });

  it("carries no entity id and exactly the five snapshot fields", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnShip(world, "adder", "CLASS_NEUTRAL", 100);
    const contact = npcContacts(world)[0];
    expect(Object.keys(contact ?? {}).sort()).toEqual([
      "kind",
      "orientation",
      "position",
      "radius",
      "specKey",
    ]);
    expect(JSON.stringify(contact)).not.toMatch(/"(id|ownerId|targetId)"/);
  });

  it("returns copies: mutating a contact never changes an entity", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnShip(world, "adder", "CLASS_NEUTRAL", 100);
    const contact = npcContacts(world)[0];
    expect(contact).toBeDefined();
    const position = contact?.position as { x: number; y: number; z: number };
    const orientation = contact?.orientation as {
      w: number;
      x: number;
      y: number;
      z: number;
    };
    position.x = -1;
    orientation.w = 0;

    const entity = world.store.live[0];
    expect(entity?.position).toEqual({ x: 100, y: 200, z: 300 });
    expect(entity?.orientation).toEqual(IDENTITY);
    expect(npcContacts(world)[0]?.position).toEqual({ x: 100, y: 200, z: 300 });
  });
});

function spawnDebris(
  world: World,
  kind: "cargo" | "wreckage",
  specKey: string,
  x: number,
  radius: number,
  velocity?: { x: number; y: number; z: number },
): void {
  const result = spawnEntity(
    world,
    {
      kind,
      specKey,
      scanClass: "CLASS_CARGO",
      position: { x, y: -x, z: 0.5 * x },
      orientation: { w: 0.5, x: 0.5, y: 0.5, z: 0.5 },
      radius,
      ...(velocity === undefined ? {} : { velocity }),
    },
    0,
  );
  expect(result.ok).toBe(true);
}

describe("debrisContacts (WORLD-17, D16-26)", () => {
  it("is empty without a world and for a world with no entity", () => {
    expect(debrisContacts(undefined)).toEqual([]);
    expect(debrisContacts(createWorld(LAVE_EPOCH1_WORLD_SEED))).toEqual([]);
  });

  it("lists live cargo and wreckage in ascending id order, skipping ships and the dead", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnDebris(world, "cargo", "barrel", 10, 4);
    spawnShip(world, "adder", "CLASS_NEUTRAL", 20);
    spawnDebris(world, "wreckage", "wreck1", 30, 60);
    spawnDebris(world, "wreckage", "alloy", 40, 3);
    spawnDebris(world, "cargo", "barrel", 50, 4);
    // The plate dies this tick: it is still in the store until the commit.
    const plate = world.store.live.find((entity) => entity.specKey === "alloy");
    if (plate === undefined) throw new Error("no plate");
    expect(killEntity(world, plate.id)).toBe(true);

    const contacts = debrisContacts(world);
    expect(contacts.map((contact) => contact.specKey)).toEqual([
      "barrel",
      "wreck1",
      "barrel",
    ]);
    expect(contacts[1]?.position).toEqual({ x: 30, y: -30, z: 15 });
    expect(contacts[1]?.orientation).toEqual({
      w: 0.5,
      x: 0.5,
      y: 0.5,
      z: 0.5,
    });
    expect(contacts[1]?.radius).toBe(60);
    // npcContacts is unchanged: ships only.
    expect(npcContacts(world).map((contact) => contact.specKey)).toEqual([
      "adder",
    ]);
  });

  it("carries no entity id and exactly the five snapshot fields", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnDebris(world, "cargo", "barrel", 10, 4);
    const contact = debrisContacts(world)[0];
    expect(Object.keys(contact ?? {}).sort()).toEqual([
      "orientation",
      "position",
      "radius",
      "specKey",
      "velocity",
    ]);
    expect(JSON.stringify(contact)).not.toMatch(/"(id|ownerId|targetId)"/);
  });

  it("copies the piece's velocity for the dead view's drift (D-01c), a rest piece's as zero", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnDebris(world, "cargo", "barrel", 10, 4, { x: 12, y: -3, z: 40 });
    spawnDebris(world, "wreckage", "wreck1", 20, 20);
    const contacts = debrisContacts(world);
    expect(contacts[0]?.velocity).toEqual({ x: 12, y: -3, z: 40 });
    expect(contacts[1]?.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("returns copies: mutating a contact's velocity never changes the entity's", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnDebris(world, "cargo", "barrel", 10, 4, { x: 12, y: -3, z: 40 });
    const velocity = debrisContacts(world)[0]?.velocity as {
      x: number;
      y: number;
      z: number;
    };
    velocity.x = -1;
    velocity.z = 0;
    expect(world.store.live[0]?.velocity).toEqual({ x: 12, y: -3, z: 40 });
  });

  it("returns copies: mutating a contact never changes an entity", () => {
    const world = createWorld(LAVE_EPOCH1_WORLD_SEED);
    spawnDebris(world, "wreckage", "wreck2", 10, 50);
    const contact = debrisContacts(world)[0];
    const position = contact?.position as { x: number; y: number; z: number };
    const orientation = contact?.orientation as {
      w: number;
      x: number;
      y: number;
      z: number;
    };
    position.x = -1;
    orientation.w = 0;
    const entity = world.store.live[0];
    expect(entity?.position).toEqual({ x: 10, y: -10, z: 5 });
    expect(entity?.orientation).toEqual({ w: 0.5, x: 0.5, y: 0.5, z: 0.5 });
  });
});
