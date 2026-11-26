// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The group bound and the empty-group pruning (D-11, plan 22-03, WORLD-08).
 *
 * `MAX_WORLD_GROUPS` equals the entity cap because every group record has at
 * least one live ship, and `commitWorld` removes the record of a group that no
 * live ship carries. Together they make the bound unreachable, which these
 * tests prove from the outside: the equality, each prune case, the hash
 * returning to the groupless text, and a property over arbitrary operation
 * sequences.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { initFlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import { MAX_ENTITIES } from "../../../src/sim/world/ids.js";
import { MAX_WORLD_GROUPS } from "../../../src/sim/world/limits.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  commitWorld,
  createWorld,
  killEntity,
  liveEntityCount,
  pruneEmptyGroups,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

const SEED = 0x1234abcd;

function shipInit(index: number, extra: Partial<SpawnInit> = {}): SpawnInit {
  return {
    kind: "ship",
    specKey: "viper",
    scanClass: "CLASS_NEUTRAL",
    position: vec(100 * (index + 1), -20 * index, 30),
    orientation: identity(),
    radius: 35,
    speed: 12.5,
    ...extra,
  };
}

function spawnOk(world: World, init: SpawnInit): Entity {
  const result = spawnEntity(world, init, 3);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/**
 * Spawn a leader and `followers` more ships all carrying the leader's id as
 * `groupId`, and write the record. Returns every member, leader first.
 */
function spawnGroup(world: World, followers: number): Entity[] {
  const first = world.store.nextId;
  const leader = spawnOk(world, shipInit(first, { groupId: first }));
  world.groups.push({ id: leader.id, leader: leader.id });
  const members = [leader];
  for (let i = 0; i < followers; i += 1) {
    members.push(spawnOk(world, shipInit(first + i + 1, { groupId: first })));
  }
  return members;
}

describe("MAX_WORLD_GROUPS (D-11)", () => {
  it("is 256 and equals the entity cap, so the bound can never trigger", () => {
    expect(MAX_WORLD_GROUPS).toBe(256);
    expect(MAX_ENTITIES).toBe(256);
    expect(MAX_WORLD_GROUPS).toBe(MAX_ENTITIES);
  });
});

describe("pruneEmptyGroups through commitWorld (D-11)", () => {
  it("removes the record once both members are dead and committed", () => {
    const world = createWorld(SEED);
    const [leader, follower] = spawnGroup(world, 1) as [Entity, Entity];
    expect(world.groups).toEqual([{ id: leader.id, leader: leader.id }]);
    killEntity(world, leader.id);
    killEntity(world, follower.id);
    expect(commitWorld(world)).toEqual([leader.id, follower.id]);
    expect(world.groups).toEqual([]);
  });

  it("keeps the record while only the follower is dead", () => {
    const world = createWorld(SEED);
    const [leader, follower] = spawnGroup(world, 1) as [Entity, Entity];
    killEntity(world, follower.id);
    commitWorld(world);
    expect(world.groups).toEqual([{ id: leader.id, leader: leader.id }]);
  });

  it("keeps the record, with the leader id as written, while only the leader is dead", () => {
    const world = createWorld(SEED);
    const [leader, follower] = spawnGroup(world, 1) as [Entity, Entity];
    killEntity(world, leader.id);
    commitWorld(world);
    expect(world.store.live.map((e) => e.id)).toEqual([follower.id]);
    expect(world.groups).toEqual([{ id: leader.id, leader: leader.id }]);
  });

  it("prunes a record when its members are dead but not yet committed", () => {
    const world = createWorld(SEED);
    const [leader] = spawnGroup(world, 0) as [Entity];
    killEntity(world, leader.id);
    expect(pruneEmptyGroups(world)).toBe(1);
    expect(world.groups).toEqual([]);
  });

  it("returns the hash of the groupless world once the group is gone", () => {
    const grouped = createWorld(SEED);
    const members = spawnGroup(grouped, 2);
    const withRecord = hashWorld(initFlightState(layout), grouped);
    for (const m of members) killEntity(grouped, m.id);
    commitWorld(grouped);

    // The same world with the same spawns and kills, never given a record.
    const plain = createWorld(SEED);
    const first = plain.store.nextId;
    const ids: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push(spawnOk(plain, shipInit(first + i, { groupId: first })).id);
    }
    for (const id of ids) killEntity(plain, id);
    commitWorld(plain);

    expect(hashWorld(initFlightState(layout), grouped)).toBe(
      hashWorld(initFlightState(layout), plain),
    );
    // Guard: the record did move the hash while the group lived.
    expect(withRecord).not.toBe(hashWorld(initFlightState(layout), plain));
  });

  it("keeps the array object when the list is empty", () => {
    const world = createWorld(SEED);
    spawnOk(world, shipInit(0));
    const before = world.groups;
    commitWorld(world);
    expect(world.groups).toBe(before);
    expect(pruneEmptyGroups(world)).toBe(0);
  });

  it("keeps the array object when nothing is removed", () => {
    const world = createWorld(SEED);
    spawnGroup(world, 1);
    const before = world.groups;
    commitWorld(world);
    expect(world.groups).toBe(before);
  });

  it("keeps the survivors strictly ascending after a prune", () => {
    const world = createWorld(SEED);
    const a = spawnGroup(world, 0) as [Entity];
    const b = spawnGroup(world, 1) as [Entity, Entity];
    const c = spawnGroup(world, 0) as [Entity];
    killEntity(world, b[0].id);
    killEntity(world, b[1].id);
    commitWorld(world);
    expect(world.groups.map((g) => g.id)).toEqual([a[0].id, c[0].id]);
  });
});

/** One step of the property: a group spawn, a kill of any live ship or a commit. */
type Operation =
  | { readonly op: "group"; readonly size: number }
  | { readonly op: "kill"; readonly pick: number }
  | { readonly op: "commit" };

const OPERATIONS = fc.array(
  fc.oneof(
    fc.record({
      op: fc.constant("group" as const),
      size: fc.integer({ min: 1, max: 8 }),
    }),
    fc.record({
      op: fc.constant("kill" as const),
      pick: fc.nat({ max: 1_000_000 }),
    }),
    fc.record({ op: fc.constant("commit" as const) }),
  ),
  { minLength: 1, maxLength: 80 },
);

function apply(world: World, step: Operation): void {
  if (step.op === "group") {
    const first = world.store.nextId;
    const leader = spawnEntity(world, shipInit(first, { groupId: first }), 3);
    if (!leader.ok) return;
    world.groups.push({ id: leader.entity.id, leader: leader.entity.id });
    for (let i = 1; i < step.size; i += 1) {
      spawnEntity(world, shipInit(first + i, { groupId: first }), 3);
    }
  } else if (step.op === "kill") {
    const live = world.store.live.filter((e) => !e.dead);
    const target = live[step.pick % Math.max(live.length, 1)];
    if (target !== undefined) killEntity(world, target.id);
  } else {
    commitWorld(world);
  }
}

describe("the pruning invariant (D-11)", () => {
  it("never holds more records than live ships, never a memberless record, always ascending", () => {
    fc.assert(
      fc.property(OPERATIONS, (steps) => {
        const world = createWorld(SEED);
        for (const step of steps) {
          apply(world, step);
          if (step.op !== "commit") continue;
          expect(world.groups.length).toBeLessThanOrEqual(
            liveEntityCount(world),
          );
          expect(world.groups.length).toBeLessThanOrEqual(MAX_WORLD_GROUPS);
          const carried = new Set(
            world.store.live.filter((e) => !e.dead).map((e) => e.groupId),
          );
          for (const g of world.groups) expect(carried.has(g.id)).toBe(true);
          for (let i = 1; i < world.groups.length; i += 1) {
            expect(world.groups[i]!.id).toBeGreaterThan(
              world.groups[i - 1]!.id,
            );
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
