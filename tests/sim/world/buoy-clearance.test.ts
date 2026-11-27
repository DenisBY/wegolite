// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * No arrival or launch pose starts inside a buoy's hull or blockage radius
 * (Phase 18, D-06, D-09, T-18-17).
 *
 * Since D-09 a live buoy refuses a jump that completes within
 * `sqrt(0.1 x 698,691.1875)`, about 264.33 m, of it. A refused jump that can
 * never complete would be a denial of service, so every place a pose is
 * installed must start clear of both buoys: the witchpoint arrival (at least
 * the safe exit distance, `collisionRadius + MIN_DISTANCE_TO_BUOY` = 809.14 m,
 * from the witchpoint buoy, PlayerEntity.m lines 6913-6928 and Universe.m
 * lines 2843-2851; at most 12,800 m from it) and the launch pose at the dock
 * mouth. The clearance demanded is the blockage radius plus both hull radii
 * (the buoy's 59.14 m and the player's 72.70 m), so a pose is clear of the
 * hull and the blockage at once.
 *
 * The sweep covers all 2,048 layouts of the eight galaxy files, each derived
 * with the station of its own system (`system.station`, the compiled spec of
 * that kind). The buoys may move
 * (PD-02), but only within one world: every arrival, launch and Load creates a
 * new world, and a new world's buoys sit at their layout positions, which the
 * pristine-world clause pins. An immediate re-jump after arrival is therefore
 * never refused by the witchpoint buoy, which matches Oolite.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { System } from "../../../src/content/types.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { dockMouthPosition } from "../../../src/sim/flight/state.js";
import {
  NAV_BUOY_MASS,
  WITCH_BLOCK_K,
  witchspaceBlockedAt,
} from "../../../src/sim/hyperspace/countdown.js";
import { length, sub } from "../../../src/sim/math.js";
import { PLAYER_COLLISION_RADIUS_M } from "../../../src/sim/npc/stats.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import type { SystemLayout } from "../../../src/sim/world/layout.js";
import { createShipField } from "../../../src/sim/world/ship-field.js";
import {
  createWorld,
  isPristineBuoyStates,
} from "../../../src/sim/world/world.js";
import { stationSpecOf } from "../../helpers/stations.js";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}

const systems: readonly System[] = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((galaxy) =>
  readJson<System[]>(`../../../src/content/generated/systems/g${galaxy}.json`),
);

const layouts: readonly { system: System; layout: SystemLayout }[] =
  systems.map((system) => ({
    system,
    layout: deriveSystemLayout(system, stationSpecOf(system.station)),
  }));

/** `MIN_DISTANCE_TO_BUOY` (Universe.h line 162). */
const MIN_DISTANCE_TO_BUOY = 750;
/** The farthest the witchpoint arrival can land: half the scanner range. */
const MAX_ARRIVAL_OFFSET = 12_800;
const BLOCKAGE_RADIUS = Math.sqrt(WITCH_BLOCK_K * NAV_BUOY_MASS);

describe("buoy clearance of the arrival and launch poses (D-06)", () => {
  it("reads all 2,048 systems of the eight galaxies", () => {
    expect(layouts).toHaveLength(2_048);
  });

  it("keeps the whole arrival shell clear of the nav buoy in every layout", () => {
    let minMargin = Number.POSITIVE_INFINITY;
    for (const { system, layout } of layouts) {
      const clearance =
        BLOCKAGE_RADIUS + layout.navBuoy.radius + PLAYER_COLLISION_RADIUS_M;
      const safety = layout.witchpoint.radius + MIN_DISTANCE_TO_BUOY;
      const separation = length(
        sub(layout.navBuoy.position, layout.witchpoint.position),
      );
      // The arrival lies between `safety` and 12,800 m of the witchpoint, so
      // its distance from the nav buoy is at least `separation - 12,800`; the
      // demanded bound subtracts the safety distance as well.
      const margin = separation - (MAX_ARRIVAL_OFFSET + safety) - clearance;
      expect(margin, system.id).toBeGreaterThan(0);
      minMargin = Math.min(minMargin, margin);
    }
    expect(minMargin).toBeGreaterThan(0);
  });

  it("puts the safe exit distance outside the witchpoint buoy's clearance", () => {
    for (const { system, layout } of layouts) {
      const safety = layout.witchpoint.radius + MIN_DISTANCE_TO_BUOY;
      expect(safety, system.id).toBeCloseTo(809.1355, 3);
      expect(safety, system.id).toBeGreaterThan(
        BLOCKAGE_RADIUS + layout.witchpoint.radius + PLAYER_COLLISION_RADIUS_M,
      );
    }
  });

  it("keeps the launch pose clear of both buoys in every layout", () => {
    for (const { system, layout } of layouts) {
      const mouth = dockMouthPosition(layout);
      for (const key of ["witchpoint", "navBuoy"] as const) {
        const buoy = layout[key];
        const clearance =
          BLOCKAGE_RADIUS + buoy.radius + PLAYER_COLLISION_RADIUS_M;
        const distance = length(sub(mouth, buoy.position));
        expect(distance, `${system.id} ${key}`).toBeGreaterThan(clearance);
        expect(
          witchspaceBlockedAt(
            mouth,
            buoy.position,
            NAV_BUOY_MASS,
            layout.scannerRange,
          ),
          `${system.id} ${key}`,
        ).toBe(false);
      }
    }
  });

  it("starts every new world with pristine buoys, alive, unmoved and whole", () => {
    for (const { system } of layouts) {
      const world = createWorld(
        worldSeedFor(marketSeedForSystem(system.id), 1),
      );
      expect(isPristineBuoyStates(world.buoys), system.id).toBe(true);
      const field = createShipField(world, undefined);
      for (const key of ["witchpoint", "navBuoy"] as const) {
        const buoy = field.buoy(key);
        expect(buoy.alive, `${system.id} ${key}`).toBe(true);
        expect(buoy.subentityAttached, `${system.id} ${key}`).toBe(true);
        expect(buoy.offset, `${system.id} ${key}`).toEqual({
          x: 0,
          y: 0,
          z: 0,
        });
      }
    }
  });
});
