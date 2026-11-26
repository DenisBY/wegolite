// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `retireShip`, the non-lethal removal path (Phase 21, pitfall C11): a departing
 * ship leaves the world without a `shipDestroyed`, debris, cargo or credit, and
 * its holders hear `shipTargetLost`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { identity, vec } from "../../../src/sim/math.js";
import {
  MAIN_STATION_ID,
  NO_ENTITY,
  PLAYER_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import { killShip } from "../../../src/sim/world/kill.js";
import { retireShip } from "../../../src/sim/world/retire.js";
import type { RetireReason } from "../../../src/sim/world/retire.js";
import {
  commitWorld,
  createWorld,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";

const REASONS: readonly RetireReason[] = [
  "docked",
  "jumped",
  "landed",
  "expired",
];

function spawn(
  world: World,
  kind: "ship" | "cargo" | "wreckage" = "ship",
): number {
  const result = spawnEntity(
    world,
    {
      kind,
      specKey: kind === "ship" ? "adder" : "debris",
      scanClass: "CLASS_NEUTRAL",
      position: vec(100, 200, 300),
      orientation: identity(),
      radius: 30,
      maxEnergy: 85,
      ...(kind === "ship" ? { ai: createTestPilotAi(1_000_000) } : {}),
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function target(world: World, holder: number, victim: number): void {
  const entity = world.store.get(holder);
  if (entity === undefined) throw new Error(`no ship ${String(holder)}`);
  entity.nav.targetId = victim;
}

describe("retireShip", () => {
  it("removes a targeted ship without dying: one shipTargetLost, no debris, no credit, nextId unchanged", () => {
    const world = createWorld(1);
    const holder = spawn(world);
    const departing = spawn(world);
    const bystander = spawn(world);
    target(world, holder, departing);
    target(world, bystander, holder);
    const nextId = world.nextId;

    expect(retireShip(world, departing, "docked")).toBe(true);

    expect(world.aiQueue).toEqual([{ to: holder, name: "shipTargetLost" }]);
    expect(world.store.get(departing)).toBeUndefined();
    // The commit reports the removal (the caller emits entityRemoved).
    expect(commitWorld(world)).toEqual([departing]);
    expect(world.nextId).toBe(nextId);
    const kinds = [...world.store.live].map((entity) => entity.kind);
    expect(kinds).toEqual(["ship", "ship"]);
    expect(world.store.get(holder)).toBeDefined();
    expect(world.store.get(bystander)).toBeDefined();
  });

  it("posts no AI event for a ship nobody targets, and the credit pair never", () => {
    const world = createWorld(1);
    const departing = spawn(world);
    const other = spawn(world);

    expect(retireShip(world, departing, "jumped")).toBe(true);
    expect(world.aiQueue).toEqual([]);
    expect(world.store.get(other)).toBeDefined();
  });

  it("returns true once and false on the second call", () => {
    const world = createWorld(1);
    const departing = spawn(world);
    const holder = spawn(world);
    target(world, holder, departing);

    expect(retireShip(world, departing, "landed")).toBe(true);
    const queue = world.aiQueue.length;
    expect(retireShip(world, departing, "landed")).toBe(false);
    expect(world.aiQueue).toHaveLength(queue);
    commitWorld(world);
    expect(retireShip(world, departing, "expired")).toBe(false);
  });

  it.each([
    ["a missing id", 9999],
    ["NaN", Number.NaN],
    ["1.5", 1.5],
    ["a negative id", -3],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["NO_ENTITY", NO_ENTITY],
    ["the player", PLAYER_ID],
    ["the station", MAIN_STATION_ID],
    ["the witchpoint buoy", WITCHPOINT_BUOY_ID],
  ])("changes nothing for %s", (_name, id) => {
    const world = createWorld(1);
    spawn(world);
    expect(retireShip(world, id, "docked")).toBe(false);
    expect(world.aiQueue).toEqual([]);
    expect(commitWorld(world)).toEqual([]);
  });

  it("refuses a dead ship and a cargo or wreckage entity", () => {
    const world = createWorld(1);
    const dead = spawn(world);
    const cargo = spawn(world, "cargo");
    const wreck = spawn(world, "wreckage");
    const events: SimEvent[] = [];
    killShip(world, dead, PLAYER_ID, events);
    const queue = world.aiQueue.length;

    expect(retireShip(world, dead, "docked")).toBe(false);
    expect(retireShip(world, cargo, "docked")).toBe(false);
    expect(retireShip(world, wreck, "docked")).toBe(false);
    expect(world.aiQueue).toHaveLength(queue);
    expect(world.store.get(cargo)).toBeDefined();
    expect(world.store.get(wreck)).toBeDefined();
  });

  it("is a no-op on an empty world", () => {
    const world = createWorld(1);
    for (const reason of REASONS) {
      expect(retireShip(world, 1, reason)).toBe(false);
    }
    expect(world.aiQueue).toEqual([]);
  });

  it("is total over random worlds and id sequences and leaves survivors and streams alone", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.array(fc.integer({ min: 0, max: 8 }), { maxLength: 6 }),
        fc.array(
          fc.oneof(
            fc.integer({ min: -2, max: 12 }),
            fc.constantFrom(
              Number.NaN,
              Number.POSITIVE_INFINITY,
              0.5,
              2 ** 40,
              Number.MAX_SAFE_INTEGER,
            ),
          ),
          { maxLength: 14 },
        ),
        fc.constantFrom(...REASONS),
        (shipCount, targets, ids, reason) => {
          const world = createWorld(7);
          const shipIds: number[] = [];
          for (let index = 0; index < shipCount; index += 1) {
            shipIds.push(spawn(world));
          }
          shipIds.forEach((holder, index) => {
            const victim = targets[index];
            if (victim !== undefined) target(world, holder, victim);
          });
          const before = new Map<number, string>();
          for (const entity of world.store.live) {
            before.set(entity.id, JSON.stringify(entity));
          }
          const nextId = world.nextId;
          const retired = new Set<number>();

          for (const id of ids) {
            const result = retireShip(world, id, reason);
            if (result) {
              expect(retired.has(id)).toBe(false);
              retired.add(id);
            }
          }

          expect(world.nextId).toBe(nextId);
          for (const event of world.aiQueue) {
            expect(event.name).toBe("shipTargetLost");
          }
          for (const entity of world.store.live) {
            if (retired.has(entity.id)) continue;
            expect(JSON.stringify(entity)).toBe(before.get(entity.id));
          }
          expect(commitWorld(world).sort((a, b) => a - b)).toEqual(
            [...retired].sort((a, b) => a - b),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
