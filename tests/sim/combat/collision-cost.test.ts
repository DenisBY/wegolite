// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The collision stage's cost at the entity cap (CBT-18, PITFALLS 17, plan
 * 18-18): a deterministic counter guard, not a timing gate.
 *
 * 256 live entities (ships and pods at fixed-seed positions in a 3 km cube
 * around the nav buoy), the player and both buoys: the sorted sweep on x must
 * hand the narrow phase exactly the pairs whose bounding spheres overlap
 * (`CollisionStats.narrowTests`, checked against a brute-force count over every
 * pair), and the sweep itself must look at far fewer pairs than the 33,411 of
 * an all-pairs loop over the 259 colliders (`CollisionStats.sweptPairs`). Both
 * counts are pinned, so a change that widens the sweep or loosens the sphere
 * test fails here. The stage's wall time at this load is recorded in
 * `docs/PERFORMANCE.md` as information only.
 */

import { describe, expect, it } from "vitest";

import { PLAYER_HULL_KEY } from "../../../src/sim/combat/aim.js";
import { resolveCollisions } from "../../../src/sim/combat/collide.js";
import type { HullTable } from "../../../src/sim/combat/hit.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { DT } from "../../../src/sim/time.js";
import { DEBRIS_MAX_ENERGY } from "../../../src/sim/world/debris.js";
import { MAX_ENTITIES } from "../../../src/sim/world/ids.js";
import { buoyPosition } from "../../../src/sim/world/statics.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture, FIXTURE_POD } from "../../helpers/debris-fixture.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const { layout, config } = laveFixture();
const HULLS: HullTable = fullHullTable();
const NAV_BUOY = layout.navBuoy.position;
const CUBE = 3000;
const SHIP_KINDS = ["adder", "krait", "mamba", "sidewinder", "viper"];

const OPTIONS: StepOptions = {
  npcFlight: realNpcFlightTable(),
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: HULLS,
    debris: debrisFixture(),
    collisions: true,
  },
};

/** A fixed-seed generator (mulberry32): test data only, never in `src/sim`. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 256 ships and pods in the cube, at rest, ids ascending. */
function crowdedWorld(): { world: World; player: FlightState } {
  // 1894: the first seed from 1800 whose cube holds five sphere-overlapping
  // pairs, so the narrow-phase count is not vacuous.
  const random = mulberry32(1894);
  const world = createWorld(7);
  const inCube = (): Vec3 =>
    vec(
      NAV_BUOY.x + (random() - 0.5) * CUBE,
      NAV_BUOY.y + (random() - 0.5) * CUBE,
      NAV_BUOY.z + (random() - 0.5) * CUBE,
    );
  for (let i = 0; i < MAX_ENTITIES; i += 1) {
    const pod = i % 4 === 3;
    const specKey = pod
      ? "barrel"
      : (SHIP_KINDS[i % SHIP_KINDS.length] ?? "adder");
    const result = spawnEntity(
      world,
      {
        kind: pod ? "cargo" : "ship",
        specKey,
        scanClass: pod ? "CLASS_CARGO" : "CLASS_NEUTRAL",
        position: inCube(),
        orientation: identity(),
        radius: pod
          ? FIXTURE_POD.radius
          : (HULLS.get(specKey)?.collisionRadius ?? 30),
        ...(pod ? { maxEnergy: DEBRIS_MAX_ENERGY } : {}),
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  }
  const player = initFlightState(layout);
  stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  player.position = inCube();
  player.orientation = identity();
  player.speed = 0;
  return { world, player };
}

/** Every collider's centre and radius, as the stage gathers them. */
function bodies(
  world: World,
  player: FlightState,
): { position: Vec3; radius: number }[] {
  const list = [
    {
      position: player.position,
      radius: HULLS.get(PLAYER_HULL_KEY)?.collisionRadius ?? NaN,
    },
  ];
  for (const key of ["witchpoint", "navBuoy"] as const) {
    list.push({
      position: buoyPosition(world, layout, key),
      radius: HULLS.get("buoy")?.collisionRadius ?? NaN,
    });
  }
  for (const entity of world.store.live) {
    list.push({
      position: entity.position,
      radius: HULLS.get(entity.specKey)?.collisionRadius ?? NaN,
    });
  }
  return list;
}

/** The pairs whose spheres overlap, `d^2 < (r1 + r2)^2`, by brute force. */
function overlappingPairs(list: { position: Vec3; radius: number }[]): number {
  let count = 0;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (a === undefined || b === undefined) continue;
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dz = b.position.z - a.position.z;
      const reach = a.radius + b.radius;
      if (dx * dx + dy * dy + dz * dz < reach * reach) count += 1;
    }
  }
  return count;
}

describe("the collision stage at the entity cap (PITFALLS 17)", () => {
  it("narrow-tests exactly the sphere-overlapping pairs and sweeps far fewer than all pairs", () => {
    const { world, player } = crowdedWorld();
    expect(world.store.live.length).toBe(MAX_ENTITIES);
    const list = bodies(world, player);
    const expectedNarrow = overlappingPairs(list);
    const allPairs = (list.length * (list.length - 1)) / 2;

    const { stats } = resolveCollisions(
      world,
      player,
      createPlayerCombatState(),
      OPTIONS,
      layout,
    );

    expect(stats.colliders).toBe(MAX_ENTITIES + 3);
    expect(allPairs).toBe(33_411);
    expect(stats.narrowTests).toBe(expectedNarrow);
    expect(stats.sweptPairs).toBeLessThan(allPairs / 10);
    expect(stats.contacts).toBeLessThanOrEqual(stats.narrowTests);
    // Pinned for this seed: a wider sweep or a looser sphere test moves them.
    // The five overlapping pairs are all sphere-only (no octree contact).
    expect([stats.sweptPairs, stats.narrowTests, stats.contacts]).toEqual([
      1373, 5, 0,
    ]);
  });

  it("counts nothing without a hull table, and only the colliders below two", () => {
    const { world, player } = crowdedWorld();
    const combat = createPlayerCombatState();
    const none = resolveCollisions(world, player, combat, {}, layout);
    expect(none.stats).toEqual({
      colliders: 0,
      sweptPairs: 0,
      narrowTests: 0,
      contacts: 0,
    });
    const lone = resolveCollisions(createWorld(7), player, combat, OPTIONS);
    expect(lone.stats).toEqual({
      colliders: 1,
      sweptPairs: 0,
      narrowTests: 0,
      contacts: 0,
    });
  });
});
