// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The snapshot-resume equality (FOUND-12, success criterion 3): a world that
 * went through `snapshotWorld`, JSON, `parseWorldSnapshot` and `restoreWorld`
 * and the live world it came from stay equal while both are stepped for 1,000
 * ticks. Expected values come from the rules (equal state in, equal state out),
 * never from running the code under test. Equality is checked three ways at
 * every checkpoint because `hashWorld` rounds to 1e-6 through `canon`: the
 * hash, the exact snapshot JSON (JSON round-trips a finite double exactly) and
 * the players with `toStrictEqual` (which compares numbers with `Object.is`).
 */

import { describe, expect, it } from "vitest";

import type { AiComponent } from "../../../src/sim/ai/types.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import {
  hashFlight,
  initFlightState,
  serializeFlight,
} from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { STATIC_BODY_IDS } from "../../../src/sim/world/ids.js";
import { entityHashes, hashWorld } from "../../../src/sim/world/serialize.js";
import {
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import type { WorldSnapshot } from "../../../src/sim/world/snapshot.js";
import {
  STATIC_ENTITIES,
  commitWorld,
  createWorld,
  killEntity,
  liveEntityCount,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();

const WARMUP_TICKS = 300;
const COMPARE_TICKS = 1_000;
const CHECK_EVERY = 50;

function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  return state;
}

function step(player: FlightState, world: World): void {
  stepSim(player, world, layout, config, ZERO_INTENT, [], DT);
}

function shipAt(
  player: FlightState,
  index: number,
  ai: AiComponent | null,
): SpawnInit {
  return {
    kind: "ship",
    specKey: "test-ship",
    scanClass: "CLASS_NEUTRAL",
    position: vec(
      player.position.x + 300 * (index + 1),
      player.position.y + 40 * index,
      player.position.z - 150 * index,
    ),
    orientation: identity(),
    radius: 40,
    speed: 0,
    ai,
  };
}

function spawnOk(world: World, init: SpawnInit, tick: number) {
  const entity = spawnEntity(world, init, tick);
  if (entity === undefined) throw new Error("spawn refused");
  return entity;
}

/**
 * Six entities (ids 101 to 106), four of them test pilots (101, 103, 104,
 * 105), then 102 and the highest id 106 killed and committed, so the ids have
 * gaps and `nextId` (107) exceeds the live count (4).
 */
function scenario(): { player: FlightState; world: World } {
  const player = flyingPlayer();
  const world = createWorld(0x5eed1e55);
  const pilot = (): AiComponent =>
    createTestPilotAi(player.tick, {
      scanRange: 1e9,
      holdRange: 1,
      cruiseSpeed: 120,
    });
  for (let i = 0; i < 6; i += 1) {
    const ai = i === 1 || i === 5 ? null : pilot();
    spawnOk(world, shipAt(player, i, ai), player.tick);
  }
  killEntity(world, 102);
  killEntity(world, 106);
  commitWorld(world);
  for (let i = 0; i < WARMUP_TICKS; i += 1) step(player, world);
  return { player, world };
}

/** Snapshot to JSON text to a restored world, the way the save path will. */
function roundTrip(world: World): World {
  const text = JSON.stringify(snapshotWorld(world));
  return restoreWorld(parseWorldSnapshot(JSON.parse(text) as unknown));
}

/** An empty string when the pairs agree, else the first divergence. */
function divergence(
  tick: number,
  livePlayer: FlightState,
  liveWorld: World,
  restoredPlayer: FlightState,
  restoredWorld: World,
): string {
  if (hashFlight(livePlayer) !== hashFlight(restoredPlayer)) {
    const live = serializeFlight(livePlayer).split("\n");
    const restored = serializeFlight(restoredPlayer).split("\n");
    const index = live.findIndex((line, i) => line !== restored[i]);
    return `player diverged at tick ${String(tick)}: ${String(live[index])} vs ${String(restored[index])}`;
  }
  const liveHashes = entityHashes(liveWorld);
  const restoredHashes = entityHashes(restoredWorld);
  for (
    let i = 0;
    i < Math.max(liveHashes.length, restoredHashes.length);
    i += 1
  ) {
    const a = liveHashes[i];
    const b = restoredHashes[i];
    if (a === undefined || b === undefined || a[0] !== b[0] || a[1] !== b[1]) {
      return `entity ${String(a?.[0] ?? b?.[0])} diverged at tick ${String(tick)}`;
    }
  }
  if (
    hashWorld(livePlayer, liveWorld) !==
    hashWorld(restoredPlayer, restoredWorld)
  ) {
    return `world section diverged at tick ${String(tick)}`;
  }
  if (
    JSON.stringify(snapshotWorld(liveWorld)) !==
    JSON.stringify(snapshotWorld(restoredWorld))
  ) {
    return `snapshot JSON diverged at tick ${String(tick)} (below the hash precision)`;
  }
  return "";
}

/** Step both pairs and compare at every checkpoint and at the end. */
function runBoth(
  livePlayer: FlightState,
  liveWorld: World,
  restoredPlayer: FlightState,
  restoredWorld: World,
  ticks: number,
): void {
  for (let i = 1; i <= ticks; i += 1) {
    step(livePlayer, liveWorld);
    step(restoredPlayer, restoredWorld);
    expect(restoredPlayer.tick).toBe(livePlayer.tick);
    if (i % CHECK_EVERY === 0 || i === ticks) {
      expect(
        divergence(i, livePlayer, liveWorld, restoredPlayer, restoredWorld),
      ).toBe("");
      expect(hashWorld(restoredPlayer, restoredWorld)).toBe(
        hashWorld(livePlayer, liveWorld),
      );
      expect(JSON.stringify(snapshotWorld(restoredWorld))).toBe(
        JSON.stringify(snapshotWorld(liveWorld)),
      );
      expect(restoredPlayer).toStrictEqual(livePlayer);
    }
  }
}

describe("snapshot resume equality (FOUND-12)", () => {
  it("keeps the restored world equal to the live world for 1,000 ticks", () => {
    const { player, world } = scenario();
    // The scenario is non-vacuous: gaps in the ids, a counter above the live
    // count and pilots with state to lose.
    expect(world.store.live.map((e) => e.id)).toEqual([101, 103, 104, 105]);
    expect(world.store.nextId).toBe(107);
    expect(liveEntityCount(world)).toBe(4);
    expect(world.store.live.filter((e) => e.ai !== null)).toHaveLength(4);

    const restored = roundTrip(world);
    const restoredPlayer = structuredClone(player);
    expect(hashWorld(restoredPlayer, restored)).toBe(hashWorld(player, world));
    expect(restored).not.toBe(world);
    expect(restored.store).not.toBe(world.store);
    const hashAtSnapshot = hashWorld(player, world);

    runBoth(player, world, restoredPlayer, restored, COMPARE_TICKS);

    expect(player.tick).toBe(restoredPlayer.tick);
    // The final tick was compared, and the worlds really moved.
    expect(hashWorld(player, world)).not.toBe(hashAtSnapshot);
    expect(world.store.live.some((e) => e.speed > 0)).toBe(true);
  });

  it("recreates the statics instead of snapshotting them", () => {
    const { world } = scenario();
    const snapshot = snapshotWorld(world);
    const restored = restoreWorld(snapshot);
    expect(restored.statics).toEqual(world.statics);
    expect(restored.statics).toBe(STATIC_ENTITIES);
    const ids = snapshot.entities.map((e) => e.id);
    for (const staticId of STATIC_BODY_IDS) {
      expect(ids).not.toContain(staticId);
    }
    expect(JSON.stringify(snapshot)).not.toContain("layoutKey");
  });

  it("resumes at tick k + 1 with no repeated and no skipped tick", () => {
    const { player, world } = scenario();
    const k = player.tick;
    const restored = roundTrip(world);
    const restoredPlayer = structuredClone(player);
    const thinkTicks = (w: World): number[] =>
      w.store.live.map((e) => e.ai?.nextThinkTick ?? -1);
    expect(thinkTicks(restored)).toEqual(thinkTicks(world));
    for (let i = 1; i <= 5; i += 1) {
      step(player, world);
      step(restoredPlayer, restored);
      expect(player.tick).toBe(k + i);
      expect(restoredPlayer.tick).toBe(k + i);
      expect(thinkTicks(restored)).toEqual(thinkTicks(world));
    }
  });

  it("issues the same next id in both worlds and never a killed id", () => {
    const { player, world } = scenario();
    const restored = roundTrip(world);
    const restoredPlayer = structuredClone(player);
    runBoth(player, world, restoredPlayer, restored, 100);
    expect(restored.store.nextId).toBe(world.store.nextId);
    const liveNext = spawnOk(world, shipAt(player, 7, null), player.tick);
    const restoredNext = spawnOk(
      restored,
      shipAt(restoredPlayer, 7, null),
      restoredPlayer.tick,
    );
    expect(restoredNext.id).toBe(liveNext.id);
    expect(liveNext.id).toBe(107);
    // The highest id (106) was killed before the snapshot and is never reused.
    expect(liveNext.id).not.toBe(106);
    expect(liveNext.id).not.toBe(102);
  });

  it("does not let a -0 coordinate split the live and restored runs", () => {
    const { player, world } = scenario();
    const entity = world.store.live[0];
    if (entity === undefined) throw new Error("no entity");
    entity.position = { x: -0, y: entity.position.y, z: -0 };
    entity.nav.destination = { x: -0, y: -0, z: entity.nav.destination.z };
    const restored = roundTrip(world);
    const restoredPlayer = structuredClone(player);
    expect(hashWorld(restoredPlayer, restored)).toBe(hashWorld(player, world));
    runBoth(player, world, restoredPlayer, restored, 200);
  });

  it("snapshots a never-spawned world as an empty list at 101 that round-trips", () => {
    const player = initFlightState(layout);
    const world = createWorld(7);
    const snapshot: WorldSnapshot = snapshotWorld(world);
    expect(snapshot.entities).toEqual([]);
    expect(snapshot.nextId).toBe(101);
    const restored = roundTrip(world);
    expect(hashWorld(player, restored)).toBe(hashFlight(player));
  });
});
