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
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fnv1a32 } from "../../../src/sim/hash.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import {
  hashWorld,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import { laveFixture } from "../../helpers/lave.js";
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
