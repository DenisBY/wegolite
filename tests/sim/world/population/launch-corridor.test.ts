// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch-corridor hits of the initial population (Phase 22 plan 22-12, D-02).
 *
 * Until Phase 23 an inert ship can sit on the dock axis, where a launching player
 * would hit it. `launchCorridorHits` (`tests/helpers/launch-corridor.ts`) counts
 * the ships inside the docking aperture of `src/sim/dock/corridor.ts`, widened by
 * each ship's radius, out along the scripted launch path. The count over every
 * system and epoch is measured once and pinned here as
 * {@link EXPECTED_CORRIDOR_HITS}; the default run recomputes epochs 1 to 4,
 * `POPULATION_CENSUS_FULL=1` all 20.
 *
 * Measured over 2,048 systems and 20 epochs (40,960 worlds): zero hits, at the
 * scripted launch path (350 m) and at reaches of 1, 2 and 5 km; the closest ship
 * clears the widened aperture by 381 m (a Viper in g4-s86 at epoch 3). So no todo
 * and no tripwire case is needed. If a later change to the placement or the
 * catalogue moves the count above zero, this test fails with the world and the
 * ship, and D-02 then asks for a todo for Phase 23 and a tripwire that fails when
 * a populated ship carries an AI.
 */

import { describe, expect, it } from "vitest";

import { beginLaunch, stepLaunch } from "../../../../src/sim/flight/launch.js";
import { initFlightState } from "../../../../src/sim/flight/state.js";
import { dot, identity, sub, vec } from "../../../../src/sim/math.js";
import { portFrame } from "../../../../src/sim/dock/port-frame.js";
import type { SpawnInit } from "../../../../src/sim/world/entity.js";
import { createWorld, spawnEntity } from "../../../../src/sim/world/world.js";
import type { World } from "../../../../src/sim/world/world.js";
import { laveDockGeometry } from "../../../helpers/dock-pose.js";
import { laveFixture } from "../../../helpers/lave.js";
import {
  launchCorridorHits,
  launchCorridorShips,
  launchPathLength,
} from "../../../helpers/launch-corridor.js";
import {
  censusSystems,
  censusWorld,
} from "../../../helpers/population-census.js";

const EPOCHS = process.env["POPULATION_CENSUS_FULL"] === "1" ? 20 : 4;
const TIMEOUT_MS = 300_000;

/**
 * The measured launch-corridor hits: every world of the 2,048 systems at epochs 1
 * to 20 with a ship inside the corridor, and the total. Measured once on
 * 2026-11-26 (plan 22-12); the list is empty because no ship is inside.
 */
const EXPECTED_CORRIDOR_HITS: {
  readonly total: number;
  readonly worlds: readonly {
    readonly system: string;
    readonly epoch: number;
    readonly hits: number;
  }[];
} = { total: 0, worlds: [] };

const { layout, config } = laveFixture();
const dock = laveDockGeometry();
const frame = portFrame(layout, 0);

/** A world holding one ship at `offset` from the dock mouth, on the port axes (i, j, k). */
function worldWithShipAt(
  i: number,
  j: number,
  k: number,
  radius: number,
): World {
  const world = createWorld(7);
  const position = vec(
    frame.origin.x + frame.i.x * i + frame.j.x * j + frame.k.x * k,
    frame.origin.y + frame.i.y * i + frame.j.y * j + frame.k.y * k,
    frame.origin.z + frame.i.z * i + frame.j.z * j + frame.k.z * k,
  );
  const init: SpawnInit = {
    kind: "ship",
    specKey: "viper",
    scanClass: "CLASS_NEUTRAL",
    position,
    orientation: identity(),
    radius,
  };
  const result = spawnEntity(world, init, 0);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return world;
}

describe("the launch path", () => {
  it("is the distance the scripted exit carries the player along the dock axis", () => {
    const state = initFlightState(layout);
    expect(beginLaunch(state, layout, config, dock)).toBe(true);
    const mouth = state.position;
    let done = false;
    for (let step = 0; step < 1_000 && !done; step += 1) {
      done = stepLaunch(state, layout, config, 1 / 120);
    }
    expect(done).toBe(true);
    const travelled = sub(state.position, mouth);
    // along the port's outward axis, not beside it
    expect(dot(travelled, frame.k)).toBeCloseTo(launchPathLength(), 3);
    expect(Math.abs(dot(travelled, frame.i))).toBeLessThan(1e-3);
    expect(Math.abs(dot(travelled, frame.j))).toBeLessThan(1e-3);
  });
});

describe("launchCorridorHits", () => {
  const { ww, hh } = dock.corridor;
  const path = launchPathLength();

  it("counts a ship on the dock axis inside the launch path", () => {
    expect(
      launchCorridorHits(worldWithShipAt(0, 0, path - 50, 20), layout, dock),
    ).toBe(1);
  });

  it("does not count a ship 1 km beside the axis", () => {
    expect(
      launchCorridorHits(worldWithShipAt(1_000, 0, 100, 20), layout, dock),
    ).toBe(0);
    expect(
      launchCorridorHits(worldWithShipAt(0, 1_000, 100, 20), layout, dock),
    ).toBe(0);
  });

  it("does not count a ship 1 km out, past the scripted launch path", () => {
    expect(
      launchCorridorHits(worldWithShipAt(0, 0, 1_000, 20), layout, dock),
    ).toBe(0);
  });

  it("counts that ship when the launch path is lengthened to reach it", () => {
    expect(
      launchCorridorHits(worldWithShipAt(0, 0, 1_000, 20), layout, dock, 2_000),
    ).toBe(1);
  });

  it("does not count a ship behind the port plane, inside the station", () => {
    expect(
      launchCorridorHits(worldWithShipAt(0, 0, -200, 20), layout, dock),
    ).toBe(0);
  });

  it("widens the aperture by the ship's radius on both axes", () => {
    const radius = 100;
    expect(
      launchCorridorHits(
        worldWithShipAt(ww + radius - 1, 0, 100, radius),
        layout,
        dock,
      ),
    ).toBe(1);
    expect(
      launchCorridorHits(
        worldWithShipAt(ww + radius + 1, 0, 100, radius),
        layout,
        dock,
      ),
    ).toBe(0);
    expect(
      launchCorridorHits(
        worldWithShipAt(0, hh + radius - 1, 100, radius),
        layout,
        dock,
      ),
    ).toBe(1);
    expect(
      launchCorridorHits(
        worldWithShipAt(0, hh + radius + 1, 100, radius),
        layout,
        dock,
      ),
    ).toBe(0);
  });

  it("returns the ships it counted", () => {
    const world = worldWithShipAt(0, 0, 100, 20);
    expect(
      launchCorridorShips(world, layout, dock).map((s) => s.specKey),
    ).toEqual(["viper"]);
  });

  it("counts nothing in an empty world", () => {
    expect(launchCorridorHits(createWorld(7), layout, dock)).toBe(0);
  });
});

describe("the measured launch-corridor hits of the initial population (D-02)", () => {
  it(
    `equals the pinned measurement for every system at epochs 1 to ${String(EPOCHS)}`,
    () => {
      const found: { system: string; epoch: number; hits: number }[] = [];
      for (const entry of censusSystems(8)) {
        for (let epoch = 1; epoch <= EPOCHS; epoch += 1) {
          const { world } = censusWorld(entry, epoch);
          const hits = launchCorridorHits(world, entry.layout, dock);
          if (hits > 0) found.push({ system: entry.system.id, epoch, hits });
        }
      }
      const expected = EXPECTED_CORRIDOR_HITS.worlds.filter(
        (world) => world.epoch <= EPOCHS,
      );
      expect(found).toEqual(expected);
      if (EPOCHS === 20) {
        expect(found.reduce((sum, w) => sum + w.hits, 0)).toBe(
          EXPECTED_CORRIDOR_HITS.total,
        );
      }
    },
    TIMEOUT_MS,
  );

  it("builds every system's launch corridor on the Lave station's dock geometry", () => {
    for (const entry of censusSystems(1)) {
      expect(entry.layout.dockOffset).toBe(layout.dockOffset);
    }
  });
});
