// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The inert world is isolated from catalogue growth (FOUND-20, pitfall C1,
 * plan 21-01).
 *
 * `tests/golden/world/inert-lave-epochs-1-20.json` is the epoch 1-20 pin: the
 * Lave inert world built through the production path (`trafficContent` plus
 * `createInertPopulate`) for every epoch from 1 to 20, with the FNV of its world
 * section and of `hashWorld(initFlightState(layout), world)`. It was measured on
 * the commit before `populate.ts` changed and holds after every later commit of
 * the phase. Never regenerate it: it is owner-reserved under D-04, and a moved
 * value is a finding that stops the plan, not a re-pin.
 *
 * The rest of the file proves why it holds: `planInertPopulation` reduces its
 * records to `INERT_RECORD_KEYS` before any draw, so appended, interleaved,
 * reordered or duplicated records never move the world; and the eight fields the
 * inert path reads from the nine records are pinned in
 * `tests/golden/world/inert-records-nine.json`, so a converter change that alters
 * one of them fails here instead of moving the world.
 */

import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { fnv1a32 } from "../../../src/sim/hash.js";
import { createRngState, worldSeedFor } from "../../../src/sim/rng.js";
import {
  INERT_RECORD_KEYS,
  inertRecords,
  planInertPopulation,
} from "../../../src/sim/world/populate.js";
import type { InertShipRecord } from "../../../src/sim/world/populate.js";
import {
  hashWorld,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import {
  buildInertWorld,
  laveInertRecords,
} from "../../helpers/inert-world.js";
import { LAVE_SYSTEM_ID, laveFixture } from "../../helpers/lave.js";
import { laveInertWorld } from "../../helpers/traffic-fixture.js";

interface EpochRow {
  readonly epoch: number;
  readonly worldSeed: number;
  readonly count: number;
  readonly sectionFnv: string;
  readonly hashWorldFnv: string;
}

function readGolden<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  ) as T;
}

const GOLDEN = readGolden<{ name: string; epochs: EpochRow[] }>(
  "../../golden/world/inert-lave-epochs-1-20.json",
);
const { layout } = laveFixture();

describe("the inert Lave world, epochs 1 to 20 (FOUND-20 pin)", () => {
  it("holds exactly 20 rows, epochs 1 to 20 ascending, with distinct seeds", () => {
    expect(GOLDEN.epochs.map((row) => row.epoch)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(new Set(GOLDEN.epochs.map((row) => row.worldSeed)).size).toBe(20);
  });

  it("reproduces the committed single-epoch golden at epoch 1", () => {
    const single = readGolden<{
      worldSeed: number;
      count: number;
      fnv: string;
    }>("../../golden/world/inert-lave-epoch1.json");
    const first = GOLDEN.epochs[0];
    expect(first?.worldSeed).toBe(single.worldSeed);
    expect(first?.count).toBe(single.count);
    expect(first?.sectionFnv).toBe(single.fnv);
    expect(first?.hashWorldFnv).toBe("c5949d60");
  });

  it.each(GOLDEN.epochs.map((row) => [row.epoch, row] as const))(
    "epoch %i rebuilds to the pinned section and hashWorld",
    (epoch, row) => {
      const world = laveInertWorld(epoch);
      expect(world.worldSeed).toBe(row.worldSeed);
      expect(world.store.live).toHaveLength(row.count);
      expect(fnv1a32(serializeWorldSection(world))).toBe(row.sectionFnv);
      expect(hashWorld(initFlightState(layout), world)).toBe(row.hashWorldFnv);
    },
  );
});

const committed = laveInertRecords();

/** A synthetic record: a copy of a committed one with a new key, roles, class. */
function synthetic(
  key: string,
  roles: readonly string[],
  scanClass: string,
): InertShipRecord {
  const base = committed[0];
  if (base === undefined) throw new Error("no committed record");
  return { ...base, key, roles, scanClass };
}

/** Catalogue growth as Phase 21 will do it: new keys in every populator role. */
const GROWTH: readonly InertShipRecord[] = [
  synthetic("zz-trader", ["trader", "trader-courier"], "CLASS_NEUTRAL"),
  synthetic(
    "aa-pirate",
    ["pirate", "pirate-heavy-fighter(2)"],
    "CLASS_NEUTRAL",
  ),
  synthetic("mm-hunter", ["hunter", "hunter-heavy"], "CLASS_NEUTRAL"),
  synthetic("pp-police", ["police", "interceptor"], "CLASS_POLICE"),
  synthetic(
    "qq-all",
    ["trader", "pirate", "hunter", "police"],
    "CLASS_NEUTRAL",
  ),
];

/** The committed records with one synthetic record between each pair. */
function interleaved(): InertShipRecord[] {
  const out: InertShipRecord[] = [];
  committed.forEach((record, index) => {
    const extra = GROWTH[index % GROWTH.length];
    if (extra !== undefined) out.push(extra);
    out.push(record);
  });
  return out;
}

describe("catalogue growth cannot move the inert world (FOUND-20)", () => {
  it("INERT_RECORD_KEYS is the nine keys in catalogue order, frozen", () => {
    expect(INERT_RECORD_KEYS).toEqual([
      "adder",
      "cobramk1",
      "gecko",
      "krait",
      "mamba",
      "moray",
      "shuttle",
      "sidewinder",
      "viper",
    ]);
    expect(Object.isFrozen(INERT_RECORD_KEYS)).toBe(true);
    expect(committed.map((record) => record.key)).toEqual([
      ...INERT_RECORD_KEYS,
    ]);
  });

  const lists: readonly [string, () => InertShipRecord[]][] = [
    ["appended", () => [...committed, ...GROWTH]],
    ["prepended", () => [...GROWTH, ...committed]],
    ["interleaved", interleaved],
    ["reversed catalogue order", () => [...committed].reverse()],
    [
      "growth reversed over the nine",
      () => [...GROWTH, ...[...committed].reverse()],
    ],
  ];

  it.each(lists)(
    "%s: the plan equals the plan of the nine alone",
    (_name, build) => {
      for (const row of GOLDEN.epochs) {
        const grown = planInertPopulation(
          createRngState(row.worldSeed),
          layout,
          build(),
        );
        const nine = planInertPopulation(
          createRngState(row.worldSeed),
          layout,
          committed,
        );
        expect(grown).toEqual(nine);
      }
    },
  );

  it.each(lists)(
    "%s: all 20 epochs keep the pinned section and hashWorld",
    (_name, build) => {
      for (const row of GOLDEN.epochs) {
        const { world, count } = buildInertWorld(
          worldSeedFor(marketSeedForSystem(LAVE_SYSTEM_ID), row.epoch),
          layout,
          build(),
        );
        expect(count).toBe(row.count);
        expect(fnv1a32(serializeWorldSection(world))).toBe(row.sectionFnv);
        expect(hashWorld(initFlightState(layout), world)).toBe(
          row.hashWorldFnv,
        );
      }
    },
  );

  it("plans zero ships from records holding none of the nine keys", () => {
    const plan = planInertPopulation(createRngState(7), layout, [...GROWTH]);
    expect(plan.ships).toEqual([]);
    expect(plan.fallbacks).toBe(0);
    expect(
      planInertPopulation(createRngState(7), layout, []).ships,
    ).toHaveLength(0);
  });

  it("plans only the roles of a single inert key", () => {
    const viper = committed.filter((record) => record.key === "viper");
    const plan = planInertPopulation(createRngState(7), layout, [
      ...GROWTH,
      ...viper,
    ]);
    expect(plan.ships.length).toBeGreaterThan(0);
    for (const ship of plan.ships) {
      expect(ship.key).toBe("viper");
      expect(ship.role).toBe("police");
    }
  });

  it("keeps INERT_RECORD_KEYS order whatever order the catalogue lists", () => {
    const shuffled = [committed[4], committed[0], committed[8], ...committed];
    const reduced = inertRecords(
      shuffled.filter(
        (record): record is InertShipRecord => record !== undefined,
      ),
    );
    expect(reduced.map((record) => record.key)).toEqual([...INERT_RECORD_KEYS]);
  });

  it("keeps the first record of a duplicated key", () => {
    const impostor = synthetic("viper", ["trader"], "CLASS_NEUTRAL");
    const reduced = inertRecords([...GROWTH, impostor, ...committed]);
    expect(reduced.find((record) => record.key === "viper")).toBe(impostor);
  });
});

describe("the inert path's view of the nine records (FOUND-20 field pin)", () => {
  it("equals tests/golden/world/inert-records-nine.json", () => {
    const golden = readGolden<{
      name: string;
      records: readonly InertShipRecord[];
    }>("../../golden/world/inert-records-nine.json");
    expect(golden.records.map((record) => record.key)).toEqual([
      ...INERT_RECORD_KEYS,
    ]);
    const nine = committed.filter((record) =>
      golden.records.some((pinned) => pinned.key === record.key),
    );
    expect(nine).toEqual(golden.records);
  });
});

const KNOWN_KEYS = [
  ...INERT_RECORD_KEYS,
  "__proto__",
  "constructor",
  "",
  "toString",
  "hasOwnProperty",
];

const keyArb = fc.oneof(
  fc.constantFrom(...KNOWN_KEYS),
  fc.string({ maxLength: 12 }),
);
const roleTokenArb = fc.oneof(
  fc.constantFrom(
    "trader",
    "pirate",
    "hunter",
    "police",
    "shuttle",
    "scavenger",
    "trader(0.5)",
    "pirate(2)",
    "hunter(0)",
    "[viper]",
    "(1)",
    "constructor",
  ),
  fc.string({ maxLength: 10 }),
);
const syntheticArb: fc.Arbitrary<InertShipRecord> = fc.record({
  key: keyArb,
  roles: fc.array(roleTokenArb, { maxLength: 6 }),
  scanClass: fc.oneof(
    fc.constantFrom("CLASS_NEUTRAL", "CLASS_POLICE", "constructor", ""),
    fc.string({ maxLength: 12 }),
  ),
  radius: fc.double({ min: 1, max: 500, noNaN: true }),
  maxEnergy: fc.integer({ min: 1, max: 1000 }),
  energyRechargeRate: fc.integer({ min: 0, max: 10 }),
  likelyCargo: fc.integer({ min: 0, max: 20 }),
  maxCargo: fc.integer({ min: 0, max: 40 }),
});
const committedArb = fc.constantFrom(...committed);
const malformedArb = fc.constantFrom<unknown>(
  null,
  undefined,
  0,
  "adder",
  {},
  { key: 7 },
) as fc.Arbitrary<InertShipRecord>;
const recordsArb: fc.Arbitrary<InertShipRecord[]> = fc.oneof(
  fc.array(
    fc.oneof(
      { weight: 3, arbitrary: syntheticArb },
      { weight: 3, arbitrary: committedArb },
      { weight: 1, arbitrary: malformedArb },
    ),
    { maxLength: 30 },
  ),
  fc
    .tuple(
      fc.shuffledSubarray(committed),
      fc.array(syntheticArb, { maxLength: 8 }),
      fc.boolean(),
    )
    .map(([some, extra, extraFirst]) =>
      extraFirst ? [...extra, ...some] : [...some, ...extra],
    ),
);

function isKeyed(entry: unknown): entry is InertShipRecord {
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { key?: unknown }).key === "string"
  );
}

describe("inertRecords is total on malformed input (milestone rule)", () => {
  it("never throws, keeps INERT_RECORD_KEYS order, first record per key, plan unchanged", () => {
    fc.assert(
      fc.property(
        recordsArb,
        fc.integer({ min: 0, max: 0xffffffff }),
        (input, seed) => {
          const reduced = inertRecords(input);

          const order = reduced.map((record) =>
            INERT_RECORD_KEYS.indexOf(record.key),
          );
          expect(order.every((index) => index >= 0)).toBe(true);
          expect(order).toEqual([...order].sort((a, b) => a - b));
          expect(new Set(order).size).toBe(order.length);

          for (const record of reduced) {
            expect(record).toBe(
              input.find((entry) => isKeyed(entry) && entry.key === record.key),
            );
          }
          for (const key of INERT_RECORD_KEYS) {
            const present = input.some(
              (entry) => isKeyed(entry) && entry.key === key,
            );
            expect(reduced.some((record) => record.key === key)).toBe(present);
          }

          expect(
            planInertPopulation(createRngState(seed), layout, input),
          ).toEqual(planInertPopulation(createRngState(seed), layout, reduced));
        },
      ),
      { numRuns: 300 },
    );
  });
});
