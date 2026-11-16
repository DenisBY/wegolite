// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The entity cap for debris, per piece (D16-05, D16-06, plan 16-02).
 *
 * Expected values come from the rule: a pod spawns only while
 * `liveEntityCount(world) < 0.95 * 256` (243.2), so at most 243 live entities
 * before the spawn and never more than 244 from debris alone; the gate runs
 * after the piece's draws, so the victim's final stream and every spawned pod's
 * values are the same whether or not the cap refuses, and `nextId` grows only
 * by the pods that spawn. The fillers are ordinary inert entities spawned
 * through `spawnEntity`; the victim is spawned first, so its id and stream are
 * the same in every world of one seed (Pitfall 7: no case passes vacuously,
 * each asserts the pods it expects).
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import { createSeededRandom, identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import {
  DEBRIS_ENTITY_LIMIT,
  WRECKAGE_ENTITY_LIMIT,
} from "../../../src/sim/world/debris.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { MAX_ENTITIES, PLAYER_ID } from "../../../src/sim/world/ids.js";
import { killShip } from "../../../src/sim/world/kill.js";
import {
  createWorld,
  liveEntityCount,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";

const CONTENT = debrisFixture();
const FAR = vec(1e7, 0, 0);

function spawnVictim(
  world: World,
  cargo: number,
  position: Vec3 = vec(100, 200, 300),
  maxEnergy = 85,
): Entity {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "adder",
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation: identity(),
      radius: 30,
      maxEnergy,
      cargo,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/** Spawn `count` inert fillers far from everything, kind cargo, no AI. */
function fill(world: World, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const result = spawnEntity(
      world,
      {
        kind: "cargo",
        specKey: "filler",
        scanClass: "CLASS_CARGO",
        position: vec(-1e6, 1000 * (i + 1), 0),
        orientation: identity(),
        radius: 1,
        ai: null,
      },
      0,
    );
    if (!result.ok) throw new Error(`filler refused: ${result.reason}`);
  }
}

function podsOf(world: World): Entity[] {
  return world.store.live.filter(
    (e) => !e.dead && e.kind === "cargo" && e.specKey === "barrel",
  );
}

function kill(world: World, victim: Entity): SimEvent[] {
  const events: SimEvent[] = [];
  expect(
    killShip(world, victim.id, PLAYER_ID, events, {
      tick: 3,
      content: CONTENT,
    }),
  ).toBe(true);
  return events;
}

/** A world seed whose cargo-200 victim releases at least `n` pods uncapped. */
function seedWithPods(n: number): number {
  for (let seed = 1; seed < 1000; seed += 1) {
    const world = createWorld(seed);
    kill(world, spawnVictim(world, 200));
    if (podsOf(world).length >= n) return seed;
  }
  throw new Error("no seed found");
}

describe("the debris cap thresholds (D16-05)", () => {
  it("are 0.95 and 0.5 of the 256 cap: 243.2 and 128", () => {
    expect(MAX_ENTITIES).toBe(256);
    expect(DEBRIS_ENTITY_LIMIT).toBe(243.2);
    expect(WRECKAGE_ENTITY_LIMIT).toBe(128);
    // The integer consequences of the strict `<`.
    expect(243 < DEBRIS_ENTITY_LIMIT).toBe(true);
    expect(244 < DEBRIS_ENTITY_LIMIT).toBe(false);
    expect(127 < WRECKAGE_ENTITY_LIMIT).toBe(true);
    expect(128 < WRECKAGE_ENTITY_LIMIT).toBe(false);
  });

  it("spawns one pod at 243 live and refuses the next; spawns none at 244", () => {
    const seed = seedWithPods(3);
    const at243 = createWorld(seed);
    const victim243 = spawnVictim(at243, 200);
    fill(at243, 243);
    kill(at243, victim243);
    // The victim is dead and no longer counts: 243 live before the first pod.
    expect(podsOf(at243)).toHaveLength(1);
    expect(liveEntityCount(at243)).toBe(244);

    const at244 = createWorld(seed);
    const victim244 = spawnVictim(at244, 200);
    fill(at244, 244);
    kill(at244, victim244);
    expect(podsOf(at244)).toHaveLength(0);
    expect(liveEntityCount(at244)).toBe(244);
  });

  it("takes the same draws with and without the cap", () => {
    const seed = seedWithPods(3);
    const free = createWorld(seed);
    const freeVictim = spawnVictim(free, 200);
    const freeStart = freeVictim.rng.combat;
    const freeNext = free.store.nextId;
    kill(free, freeVictim);
    const freePods = podsOf(free);
    expect(freePods.length).toBeGreaterThanOrEqual(3);
    expect(free.store.nextId).toBe(freeNext + freePods.length);

    for (const fillers of [241, 242, 243, 244, 255]) {
      const capped = createWorld(seed);
      const victim = spawnVictim(capped, 200);
      expect(victim.rng.combat).toBe(freeStart);
      fill(capped, fillers);
      const nextBefore = capped.store.nextId;
      kill(capped, victim);
      expect(victim.rng.combat).toBe(freeVictim.rng.combat);
      const pods = podsOf(capped);
      const admitted = Math.max(0, Math.min(freePods.length, 244 - fillers));
      expect(pods).toHaveLength(admitted);
      expect(capped.store.nextId).toBe(nextBefore + pods.length);
      pods.forEach((pod, i) => {
        const twin = freePods[i];
        if (twin === undefined) throw new Error("missing twin");
        expect(pod.position).toEqual(twin.position);
        expect(pod.velocity).toEqual(twin.velocity);
        expect(pod.orientation).toEqual(twin.orientation);
      });
    }
  });

  it("never lets debris alone take the live count above 244", () => {
    const random = createSeededRandom(1602);
    let refusedSome = false;
    for (let run = 0; run < 60; run += 1) {
      const seed = 1 + Math.floor(random() * 1e6);
      const fillers = 200 + Math.floor(random() * 56); // 200..255
      const free = createWorld(seed);
      kill(free, spawnVictim(free, 200));
      const uncapped = podsOf(free).length;
      const world = createWorld(seed);
      const victim = spawnVictim(world, 200);
      fill(world, fillers);
      const before = fillers; // the victim no longer counts once dead
      kill(world, victim);
      const after = liveEntityCount(world);
      const pods = podsOf(world).length;
      expect(after).toBeLessThanOrEqual(Math.max(before, 244));
      expect(pods).toBe(Math.max(0, Math.min(uncapped, 244 - fillers)));
      expect(pods).toBeLessThanOrEqual(15);
      if (pods < uncapped) refusedSome = true;
    }
    expect(refusedSome).toBe(true);
  });
});

describe("a kill at a full store (D16-05)", () => {
  it("resolves through stepSim with no debris and no throw", () => {
    const { layout, config } = laveFixture();
    const player = initFlightState(layout);
    stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    stepFlight(
      player,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "skipLaunch" }],
      DT,
    );
    player.position = FAR;
    player.orientation = identity();
    player.speed = 0;
    const combat = createPlayerCombatState();
    const world = createWorld(seedWithPods(1));
    const victim = spawnVictim(world, 200, vec(FAR.x, FAR.y, FAR.z - 2000), 10);
    fill(world, MAX_ENTITIES - 1);
    expect(liveEntityCount(world)).toBe(MAX_ENTITIES);
    const nextId = world.store.nextId;

    let events: SimEvent[] = [];
    expect(() => {
      events = stepSim(
        player,
        world,
        layout,
        config,
        { ...ZERO_INTENT, fire: true },
        [],
        DT,
        {
          combat: {
            mounts: DEFAULT_LASER_MOUNTS,
            hulls: realHullTable(),
            debris: CONTENT,
          },
        },
        combat,
      );
    }).not.toThrow();
    const destroyed = events.filter((e) => e.kind === "shipDestroyed");
    expect(destroyed).toHaveLength(1);
    const removed = events.filter((e) => e.kind === "entityRemoved");
    expect(
      removed.map((e) => (e.kind === "entityRemoved" ? e.id : -1)),
    ).toEqual([victim.id]);
    expect(podsOf(world)).toHaveLength(0);
    expect(world.store.nextId).toBe(nextId);
    expect(liveEntityCount(world)).toBe(MAX_ENTITIES - 1);
  });
});
