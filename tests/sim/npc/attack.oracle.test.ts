// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The attack dispatcher and its in-scope sub-behaviours against the independent
 * pursuit oracle (Phase 14, plan 14-14; ROADMAP criterion 1): ATTACK_TARGET,
 * ATTACK_FLY_TO_TARGET, ATTACK_FLY_FROM_TARGET, ATTACK_FLY_TO_TARGET_SIX and
 * _TWELVE (non-turret), ATTACK_SNIPER, ATTACK_BREAK_OFF_TARGET and
 * ATTACK_SLOW_DOGFIGHT, with performAttack's entry draw.
 *
 * Each fixture goes through the runner's synthetic WorldView and
 * `ShipControl.perform` into `steerShip`; expected values live in
 * `tests/oracles/npc/pursuit/fixtures/attack-*.json` and nothing here copies
 * Wegolite output into them. This file runs exactly its manifest entry
 * (`tests/sim/npc/oracle-groups.ts`) and asserts that the ids it ran equal the
 * ids of that entry.
 *
 * T-14-24: without the opt-in the steering never fires and never spends energy
 * (Phase 17 D-05: only a pilot with `fire: true` gets `ctx.fire`, and no Phase
 * 14 fixture opts in). After every update of every fixture the world's fire
 * queue is empty and the steered ship's energy is what it was after `assign`.
 */

import { describe, expect, it } from "vitest";

import { fixtureFilesFor } from "./oracle-groups.js";
import { emptyHooks, fixturesIn, runFixture } from "./oracle-runner.js";

const THIS_FILE = "tests/sim/npc/attack.oracle.test.ts";
const FILES = fixtureFilesFor(THIS_FILE);

const ran: string[] = [];
let updatesChecked = 0;

/** The fixture hooks plus the no-fire, no-energy-spent guard (T-14-24). */
function guardedHooks() {
  const hooks = emptyHooks();
  let energyAfterAssign = Number.NaN;
  hooks.afterAssign.push(({ self, world }) => {
    energyAfterAssign = self.energy;
    expect(world.fireQueue).toEqual([]);
  });
  hooks.afterUpdate.push(({ self, world }) => {
    updatesChecked += 1;
    expect(world.fireQueue).toEqual([]);
    expect(self.energy).toBe(energyAfterAssign);
  });
  return hooks;
}

for (const file of FILES) {
  describe(file, () => {
    for (const fixture of fixturesIn(file)) {
      it(fixture.id, () => {
        ran.push(fixture.id);
        const result = runFixture(fixture, guardedHooks());
        expect(result.failures).toEqual([]);
        expect(result.checks).toBe(fixture.checks.length);
      });
    }
  });
}

describe("the manifest entry", () => {
  it("runs exactly the fixtures of its files", () => {
    const expected: string[] = [];
    for (const file of FILES) {
      for (const fixture of fixturesIn(file)) expected.push(fixture.id);
    }
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual(expected.sort());
  });

  it("the no-fire guard saw every update of the fixtures it ran (T-14-24)", () => {
    let horizon = 0;
    for (const file of FILES) {
      for (const fixture of fixturesIn(file)) horizon += fixture.horizon;
    }
    expect(updatesChecked).toBe(horizon);
  });
});
