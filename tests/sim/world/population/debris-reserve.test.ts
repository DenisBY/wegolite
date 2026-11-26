// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The debris reserve of the initial populator (Phase 22 plan 22-10, D-06).
 *
 * Oolite has no entity cap at population time; Wegolite's store holds 256. The
 * populator therefore stops short of the cap, so a fight in the populated
 * system still has room for its debris. This file measures that room instead of
 * guessing it: `W` is the most debris entities one kill releases, found by
 * killing every catalogue record at its largest cargo through the production
 * kill path (`killShip`, which calls `releaseDebris`) over a sweep of world
 * seeds in an otherwise empty world (so no cap gate cuts a piece). The reserve
 * is then the rule of `limits.ts`:
 *
 *   the smallest multiple of 8 at or above
 *   (MAX_ENTITIES - floor(DEBRIS_ENTITY_LIMIT)) + POPULATION_RESERVE_KILLS * W
 *
 * and the entity limit is `MAX_ENTITIES` minus it.
 */

import { describe, expect, it } from "vitest";

import {
  DEBRIS_ENTITY_LIMIT,
  POD_LIMIT,
} from "../../../../src/sim/world/debris.js";
import type { SimEvent } from "../../../../src/sim/events.js";
import { MAX_WRECKS } from "../../../../src/sim/world/debris.js";
import { MAX_ENTITIES } from "../../../../src/sim/world/ids.js";
import { killShip } from "../../../../src/sim/world/kill.js";
import {
  MAX_ENTITY_CARGO,
  POPULATION_DEBRIS_RESERVE,
  POPULATION_ENTITY_LIMIT,
  POPULATION_RESERVE_KILLS,
} from "../../../../src/sim/world/limits.js";
import { identity, vec } from "../../../../src/sim/math.js";
import {
  createWorld,
  liveEntityCount,
  spawnEntity,
} from "../../../../src/sim/world/world.js";
import { debrisFixture } from "../../../helpers/debris-fixture.js";
import { committedPopulationRecords } from "../../../helpers/population-fixtures.js";

const CONTENT = debrisFixture();
const RECORDS = committedPopulationRecords();

/** Seeds swept per record; fixed, so W is reproducible. */
const SEEDS = 400;

/** `sqrtf(sqrtf(mass / 6000))` of `ShipEntity.m:7916`, the alloy count. */
function alloyCount(mass: number): number {
  return Math.sqrt(Math.sqrt(mass / 6000));
}

/** The most debris one kill of a hull of `mass` can release, from the rules alone. */
function analyticCeiling(mass: number): number {
  const n0 = alloyCount(mass);
  // `ShipEntity.m:8050-8060`: three wrecks from n0 >= 3, else floor(u * (n0 + 2)).
  const wrecks = n0 < MAX_WRECKS ? Math.ceil(n0 + 2) - 1 : MAX_WRECKS;
  // `n_alloys = randf() * n0`, `floorf` plates: at most ceil(n0) - 1.
  const plates = Math.ceil(n0) - 1;
  return POD_LIMIT + wrecks + plates;
}

/** Debris entities released by one kill of `key` carrying `cargo`, in an empty world. */
function debrisOfOneKill(key: string, cargo: number, seed: number): number {
  const world = createWorld(seed);
  const spawned = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: key,
      scanClass: "CLASS_NEUTRAL",
      position: vec(1000, 2000, 3000),
      orientation: identity(),
      radius: 100,
      speed: 0,
      ai: null,
      cargo,
      cargoKind: 2,
    },
    0,
  );
  if (!spawned.ok) throw new Error("the victim did not spawn");
  const events: SimEvent[] = [];
  expect(
    killShip(world, spawned.entity.id, 0, events, {
      tick: 0,
      content: CONTENT,
    }),
  ).toBe(true);
  // The victim is dead; every live entity is a piece of its debris.
  return liveEntityCount(world);
}

interface Measurement {
  readonly worst: number;
  readonly record: string;
  readonly ceiling: number;
}

function measure(): Measurement {
  let worst = 0;
  let record = "";
  let ceiling = 0;
  for (const entry of RECORDS) {
    const cargo = Math.min(entry.maxCargo, MAX_ENTITY_CARGO);
    const hullCeiling = analyticCeiling(
      CONTENT.hulls.get(entry.key)?.mass ?? 0,
    );
    ceiling = Math.max(ceiling, hullCeiling);
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const released = debrisOfOneKill(entry.key, cargo, seed);
      expect(released, `${entry.key} seed ${String(seed)}`).toBeLessThanOrEqual(
        hullCeiling,
      );
      if (released > worst) {
        worst = released;
        record = entry.key;
      }
    }
  }
  return { worst, record, ceiling };
}

/** The D-06 rule: the smallest multiple of 8 at or above the raw reserve. */
function reserveFor(w: number): number {
  const raw =
    MAX_ENTITIES -
    Math.floor(DEBRIS_ENTITY_LIMIT) +
    POPULATION_RESERVE_KILLS * w;
  return Math.ceil(raw / 8) * 8;
}

describe("the population debris reserve (D-06)", () => {
  const measured = measure();

  it("sweeps all 29 catalogue records", () => {
    expect(RECORDS.length).toBe(29);
    expect(measured.worst).toBeGreaterThan(0);
  });

  it("W stays within the analytic ceiling of the pod, wreck and plate rules", () => {
    expect(measured.worst).toBeLessThanOrEqual(measured.ceiling);
  });

  it("sets POPULATION_DEBRIS_RESERVE to the rule's value for the measured W", () => {
    expect(POPULATION_RESERVE_KILLS).toBe(4);
    expect(POPULATION_DEBRIS_RESERVE).toBe(reserveFor(measured.worst));
    expect(POPULATION_DEBRIS_RESERVE % 8).toBe(0);
  });

  it("keeps the reserve above one kill and the whole fight inside the store", () => {
    expect(POPULATION_DEBRIS_RESERVE).toBeGreaterThanOrEqual(
      MAX_ENTITIES - Math.floor(DEBRIS_ENTITY_LIMIT) + measured.worst,
    );
    expect(POPULATION_ENTITY_LIMIT).toBeGreaterThan(0);
  });

  it("is MAX_ENTITIES minus the reserve", () => {
    expect(POPULATION_ENTITY_LIMIT).toBe(
      MAX_ENTITIES - POPULATION_DEBRIS_RESERVE,
    );
  });

  it("records the measurement (W and the record that gives it) for the SUMMARY", () => {
    // Printed so the SUMMARY quotes the run, not a memory of it.
    console.info(
      `DEBRIS-RESERVE W=${String(measured.worst)} record=${measured.record} ceiling=${String(measured.ceiling)} reserve=${String(POPULATION_DEBRIS_RESERVE)} limit=${String(POPULATION_ENTITY_LIMIT)}`,
    );
    expect(measured.record).not.toBe("");
  });
});
