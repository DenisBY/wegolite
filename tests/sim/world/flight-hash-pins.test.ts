// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pinned flight hashes (FOUND-12, D-08).
 *
 * `tests/golden/world/flight-hash-pins.json` is a deliberate baseline of the
 * current flight stepping, written by `tests/helpers/write-world-goldens.ts` and
 * last regenerated on 2026-11-18 (quick 261118-n7z, owner decision). This test
 * recomputes the three recorded flights and deep-equals the golden, so a change
 * to flight stepping, the arrival draw or the seeded stream that moves a hash
 * fails here. Never regenerate it to make this pass: any change needs an
 * explicit owner-approved regeneration with its cause recorded in
 * `.planning/PROJECT.md`.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { length, sub } from "../../../src/sim/math.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  RECORDED_FLIGHT_NAMES,
  recordFlightHashes,
  replayRecordedFlight,
} from "../../helpers/recorded-flights.js";
import type { RecordedFlightSample } from "../../helpers/recorded-flights.js";

interface Golden {
  readonly formatVersion: number;
  readonly flights: Record<string, { tick: number; hash: string }[]>;
}

const golden = JSON.parse(
  readFileSync(
    new URL("../../golden/world/flight-hash-pins.json", import.meta.url),
    "utf8",
  ),
) as Golden;

function samplesOf(
  name: (typeof RECORDED_FLIGHT_NAMES)[number],
): RecordedFlightSample[] {
  const samples: RecordedFlightSample[] = [];
  replayRecordedFlight(name, (sample) => {
    // The sample's state is live; keep a frozen copy of what the guards read.
    samples.push({
      ...sample,
      state: structuredClone(sample.state),
    });
  });
  return samples;
}

describe("recorded flight hash pins", () => {
  it("reproduces the committed golden exactly", () => {
    expect(recordFlightHashes()).toEqual(golden.flights);
    expect(golden.formatVersion).toBe(1);
  });

  it("is not vacuous: three flights, each densely sampled", () => {
    expect(Object.keys(golden.flights).sort()).toEqual(
      [...RECORDED_FLIGHT_NAMES].sort(),
    );
    for (const name of RECORDED_FLIGHT_NAMES) {
      const rows = golden.flights[name] ?? [];
      expect(rows.length).toBeGreaterThanOrEqual(10);
      for (const row of rows) expect(row.hash).toMatch(/^[0-9a-f]{8}$/);
      const ticks = rows.map((row) => row.tick);
      expect(new Set(ticks).size).toBe(ticks.length);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    }
  });

  it("dock-approach samples a docked state", () => {
    const samples = samplesOf("dock-approach");
    expect(samples.some((sample) => sample.state.mode === "docked")).toBe(true);
    expect(samples.some((sample) => sample.state.mode === "inFlight")).toBe(
      true,
    );
  });

  it("hyperspace-lave-leesti samples the arrival in the Leesti layout", () => {
    const samples = samplesOf("hyperspace-lave-leesti");
    const originLayout = samples[0]?.layout;
    const arrived = samples.filter((sample) => sample.layout !== originLayout);
    expect(arrived.length).toBeGreaterThan(5);
    for (const sample of arrived) {
      expect(
        length(sub(sample.state.position, sample.layout.witchpoint.position)),
      ).toBeLessThan(20_000);
    }
  });

  it("holds when replayed through stepSim with a pristine combat state, hashed with hashWorld", () => {
    // No fire key and no view change: bookkeeping runs but leaves the combat
    // state pristine, so its line never reaches the hash text.
    for (const name of RECORDED_FLIGHT_NAMES) {
      const combat = createPlayerCombatState();
      const hashes: { tick: number; hash: string }[] = [];
      replayRecordedFlight(
        name,
        (sample) => {
          hashes.push({
            tick: sample.tick,
            hash: hashWorld(sample.state, undefined, combat),
          });
        },
        combat,
      );
      expect(hashes).toEqual(golden.flights[name]);
    }
  });
});
