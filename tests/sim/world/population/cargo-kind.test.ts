// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The runtime check of the folded todo `2026-11-25-pod-kind-live-populator`
 * (Phase 22 plan 22-11, WORLD-08): no ship the live populator places carries
 * `cargo` above 0 with `cargoKind` 0, and each ship's kind is the one its
 * builder sets.
 *
 * Why a runtime check beside the source-text tripwire
 * (`tests/guards/pod-kind-fallback.test.ts`): the tripwire only sees a spawn init
 * that names `cargo` without `cargoKind`; it cannot see a kind assembled out of
 * its sight. A destroyed ship's pods use the stored kind, and fall back to the
 * role family only for the frozen inert path, so a live ship whose kind were
 * lost would silently release the wrong goods. This test populates real worlds
 * through `populateSystemWorld` and reads the kind off the spawned entities.
 *
 * The expected kind per builder is Oolite's own `setCargoType` call
 * (`oolite-populator.js`, the pin `7437f22`), written out here as a table, not
 * read from the port:
 *
 *   - `_addFreighter` (`:1385-1448`, `setCargoType(goods)` at `:1448`): arriving
 *     freighters carry `SCARCE_GOODS`; a medical hull (name matches "medical")
 *     `MEDICAL_GOODS`; an offender trader switched to the opportunist AI
 *     `PIRATE_GOODS`.
 *   - `_addCourierShort` and `_addCourierLong` (`:1492`, `:1499`, `:1514`,
 *     `:1522`): `SCARCE_GOODS` arriving (`PLENTIFUL_GOODS` leaving a station).
 *   - `_addSmuggler` (`:1557`): `ILLEGAL_GOODS`.
 *   - `_addIndependentPirate` (`:1713`): `PIRATE_GOODS` on every ship.
 *   - `_addPiratePack` (`:1864`): `PIRATE_GOODS` on the pack leader only; its
 *     escorts and assistants are never given a type.
 *   - every other ship (hunters, police, the station patrol, interceptors, and
 *     every engine escort): no `setCargoType`, so no cargo.
 */

import { describe, expect, it } from "vitest";

import type { System } from "../../../../src/content/types.js";
import { marketSeedForSystem } from "../../../../src/sim/economy/market.js";
import { worldSeedFor } from "../../../../src/sim/rng.js";
import { CARGO_KINDS } from "../../../../src/sim/world/entity.js";
import type {
  CargoKindName,
  Entity,
} from "../../../../src/sim/world/entity.js";
import { deriveSystemLayout } from "../../../../src/sim/world/layout.js";
import type { SystemLayout } from "../../../../src/sim/world/layout.js";
import { planSystemGroups } from "../../../../src/sim/world/population/groups.js";
import type {
  GroupPlan,
  PlannedPopShip,
  PopulationRecord,
} from "../../../../src/sim/world/population/groups.js";
import type { SystemFacts } from "../../../../src/sim/world/population/plan.js";
import { populateSystemWorld } from "../../../../src/sim/world/population/spawn.js";
import {
  countDrawSource,
  populationDraws,
} from "../../../../src/sim/world/population/streams.js";
import { POPULATOR_ENTRIES } from "../../../../src/sim/world/population/table.js";
import { createWorld } from "../../../../src/sim/world/world.js";
import {
  committedPopulationRecords,
  factsFromFixture,
  galaxySystems,
  loadPopulationFixtures,
} from "../../../helpers/population-fixtures.js";
import { laveFixture } from "../../../helpers/lave.js";

const { stationDef } = laveFixture();
const RECORDS = committedPopulationRecords();

/** A sample system: its fixture id, system id, facts and layout. */
interface SampleSystem {
  readonly fixtureId: string;
  readonly systemId: string;
  readonly government: number;
  readonly facts: SystemFacts;
  readonly layout: SystemLayout;
}

/** One sample system per fixture system (the seed1 and seed2 fixtures share a system). */
function sampleSystems(): readonly SampleSystem[] {
  const bySystem = new Map<string, SampleSystem>();
  for (const loaded of loadPopulationFixtures()) {
    const { header, inputs } = loaded.fixture;
    if (bySystem.has(header.system)) continue;
    const system = galaxySystems(header.galaxy).find(
      (candidate: System) => candidate.systemIndex === header.systemIndex,
    );
    if (system === undefined) throw new Error(`no system ${header.system}`);
    bySystem.set(header.system, {
      fixtureId: loaded.id,
      systemId: header.system,
      government: inputs.government,
      facts: factsFromFixture(loaded.fixture),
      layout: deriveSystemLayout(system, stationDef),
    });
  }
  return [...bySystem.values()];
}

const EPOCHS = [1, 2, 3] as const;

/** The plan the production draws give a world seed (as `populateSystemWorld` plans it). */
function planFor(
  worldSeed: number,
  facts: SystemFacts,
  records: readonly PopulationRecord[],
): readonly GroupPlan[] {
  return planSystemGroups(facts, records, {
    counts: countDrawSource(worldSeed),
    group: (ordinal, groupIndex) =>
      populationDraws(worldSeed, ordinal, groupIndex),
  });
}

/** What kind a ship of the plan must carry: one exact kind, or a set it may take. */
function allowedKinds(
  plan: GroupPlan,
  index: number,
  records: readonly PopulationRecord[],
): readonly CargoKindName[] {
  const ship = plan.ships[index] as PlannedPopShip;
  // An engine escort is never given a cargo type (`setUpEscorts` is not `setCargoType`).
  if (ship.ownerIndex !== null) return ["unset"];
  const builder = POPULATOR_ENTRIES[plan.ordinal]?.builder ?? null;
  switch (builder) {
    case "freighter": {
      const record = records.find((r) => r.key === ship.recordKey);
      if (record !== undefined && /medical/i.test(record.name)) {
        return ["medical"];
      }
      // `scarce` arriving; `pirate` only when the offender branch switched the
      // trader to the opportunist AI, which needs a bounty and `auto_ai`.
      const opportunist =
        ship.bounty > 0 && record !== undefined && record.autoAi > 0;
      return opportunist ? ["scarce", "pirate"] : ["scarce"];
    }
    case "courierShort":
    case "courierLong":
      return ["scarce"];
    case "smuggler":
      return ["contraband"];
    case "independentPirate":
      return ["pirate"];
    case "lightPirateLocal":
    case "lightPirateRemote":
    case "mediumPirateLocal":
    case "mediumPirateRemote":
    case "heavyPirateLocal":
    case "heavyPirateRemote":
      return index === 0 ? ["pirate"] : ["unset"];
    case "lightHunter":
    case "policePatrol":
    case "stationPatrol":
    case "interceptors":
    case null:
      return ["unset"];
  }
}

/** Per-kind counts of the ships checked, for the non-vacuity assertions. */
type KindCounts = Record<CargoKindName, number>;

function emptyCounts(): KindCounts {
  return Object.fromEntries(CARGO_KINDS.map((kind) => [kind, 0])) as KindCounts;
}

interface Checked {
  readonly worlds: number;
  readonly ships: number;
  readonly withCargo: number;
  readonly kinds: KindCounts;
}

/**
 * Populate `sample` at `epochs` and check every placed ship. Returns what it
 * covered. Fails the test through `expect` on a ship with cargo and no kind, or a
 * kind outside the builder's set.
 */
function checkSystem(
  sample: SampleSystem,
  records: readonly PopulationRecord[],
  epochs: readonly number[],
): Checked {
  let worlds = 0;
  let ships = 0;
  let withCargo = 0;
  const kinds = emptyCounts();
  for (const epoch of epochs) {
    const seed = worldSeedFor(marketSeedForSystem(sample.systemId), epoch);
    const world = createWorld(seed);
    const result = populateSystemWorld(
      world,
      sample.layout,
      sample.facts,
      records,
    );
    const label = `${sample.systemId} epoch ${String(epoch)}`;
    const plans = planFor(seed, sample.facts, records);
    // Every planned ship entered the world, so the plan aligns with the store:
    // the only groups left out are the ones with no ships (a role the catalogue lacks).
    expect(result.skippedGroups, label).toBe(
      plans.filter((plan) => plan.ships.length === 0).length,
    );
    const entities: readonly Entity[] = world.store.live;
    expect(entities.length, label).toBe(
      plans.reduce((sum, plan) => sum + plan.ships.length, 0),
    );
    let base = 0;
    for (const plan of plans) {
      plan.ships.forEach((_ship, i) => {
        const entity = entities[base + i] as Entity;
        const where = `${label} group ${String(plan.ordinal)}/${String(plan.groupIndex)} ship ${String(i)} (${entity.specKey})`;
        const kind = CARGO_KINDS[entity.cargoKind] as CargoKindName;
        // The todo's rule: cargo above 0 never travels with kind 0.
        if (entity.cargo > 0) {
          expect(
            entity.cargoKind,
            `${where}: cargo with kind 0`,
          ).toBeGreaterThan(0);
          withCargo += 1;
        }
        // And the kind is the builder's `setCargoType`, per role.
        expect(allowedKinds(plan, i, records), where).toContain(kind);
        kinds[kind] += 1;
        ships += 1;
      });
      base += plan.ships.length;
    }
    worlds += 1;
  }
  return { worlds, ships, withCargo, kinds };
}

function merge(all: readonly Checked[]): Checked {
  const kinds = emptyCounts();
  for (const checked of all) {
    for (const kind of CARGO_KINDS) kinds[kind] += checked.kinds[kind];
  }
  return {
    worlds: all.reduce((sum, c) => sum + c.worlds, 0),
    ships: all.reduce((sum, c) => sum + c.ships, 0),
    withCargo: all.reduce((sum, c) => sum + c.withCargo, 0),
    kinds,
  };
}

const SAMPLES = sampleSystems();

describe("the pod-kind runtime check (folded todo 2026-11-25-pod-kind-live-populator)", () => {
  it("Lave (tracer): every placed ship's cargo and kind match its builder, over 20 seeds", () => {
    const lave = SAMPLES.find((sample) => sample.systemId === "g0-s7");
    if (lave === undefined) throw new Error("no Lave fixture");
    const checked = checkSystem(
      lave,
      RECORDS,
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(checked.worlds).toBe(20);
    expect(checked.ships).toBeGreaterThan(0);
    // Not vacuous: Lave places traders, pirates and escorts with and without cargo.
    expect(checked.withCargo).toBeGreaterThan(0);
    expect(checked.kinds.scarce).toBeGreaterThan(0);
    expect(checked.kinds.unset).toBeGreaterThan(0);
  });

  it("the largest anarchy of the fixtures, populated at epochs 1 to 3", () => {
    const anarchies = SAMPLES.filter((sample) => sample.government === 0);
    expect(anarchies.length).toBeGreaterThan(0);
    const sized = anarchies.map((sample) => ({
      sample,
      size: Math.max(
        ...EPOCHS.map((epoch) =>
          planFor(
            worldSeedFor(marketSeedForSystem(sample.systemId), epoch),
            sample.facts,
            RECORDS,
          ).reduce((sum, plan) => sum + plan.ships.length, 0),
        ),
      ),
    }));
    const largest = sized.reduce((best, next) =>
      next.size > best.size ? next : best,
    );
    expect(largest.size).toBeGreaterThan(0);
    const checked = checkSystem(largest.sample, RECORDS, EPOCHS);
    expect(checked.worlds).toBe(EPOCHS.length);
    // An anarchy is the pirate-heavy case: pirate cargo must be present.
    expect(checked.kinds.pirate).toBeGreaterThan(0);
  });

  it("Oresrati (station patrol only): no ship carries cargo", () => {
    const oresrati = SAMPLES.find((sample) => sample.systemId === "g7-s162");
    if (oresrati === undefined) throw new Error("no Oresrati fixture");
    const checked = checkSystem(oresrati, RECORDS, EPOCHS);
    expect(checked.ships).toBe(EPOCHS.length);
    expect(checked.withCargo).toBe(0);
    expect(checked.kinds.unset).toBe(EPOCHS.length);
  });

  it("every fixture system at epochs 1 to 3, with each kind seen on some ship", () => {
    expect(SAMPLES.length).toBeGreaterThanOrEqual(30);
    const checked = merge(
      SAMPLES.map((sample) => checkSystem(sample, RECORDS, EPOCHS)),
    );
    expect(checked.worlds).toBe(SAMPLES.length * EPOCHS.length);
    expect(checked.withCargo).toBeGreaterThan(0);
    // Not vacuous: the sweep reaches every builder kind the arriving populator sets.
    expect(checked.kinds.scarce).toBeGreaterThan(0);
    expect(checked.kinds.pirate).toBeGreaterThan(0);
    expect(checked.kinds.contraband).toBeGreaterThan(0);
    expect(checked.kinds.unset).toBeGreaterThan(0);
  });

  it("a medical hull's freighter carries medical goods (the one kind the catalogue sweep may miss)", () => {
    // The committed catalogue has one medical trader, the Moray Medical Boat; a
    // catalogue made of it alone makes every freighter group a medical one, and
    // the couriers and the smuggler (which fall back to the `trader` role)
    // still carry the kind their own builder sets.
    const medical = RECORDS.filter((record) => /medical/i.test(record.name));
    expect(medical.length).toBeGreaterThan(0);
    const lave = SAMPLES.find((sample) => sample.systemId === "g0-s7");
    if (lave === undefined) throw new Error("no Lave fixture");
    const checked = checkSystem(
      lave,
      medical,
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(checked.kinds.medical).toBeGreaterThan(0);
    expect(checked.kinds.scarce + checked.kinds.contraband).toBeGreaterThan(0);
  });
});
