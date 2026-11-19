// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC fire sites and the hot-weapon branches against the independent
 * fire-site oracles (Phase 17, plan 17-08; ROADMAP criterion 4, D-06): the
 * `fire-sites.json` and `hot-branches.json` fixtures of plan 17-02, written from
 * the pinned Oolite source before the port existed, by an agent with no access
 * to `src/sim/npc`.
 *
 * Each fixture goes through the oracle runner with its weapon block as hooks
 * (the stated float32 temperature and `missedShots` at assign, one `coolWeapon`
 * per update) and a recorder in the `SteerContext` that collects the update
 * numbers at which `ctx.fire` was called. The checks, events and draw counts
 * are the runner's own comparison (within the fixture's tolerances) and
 * `fireRequestTicks` is compared exactly. A failing fixture is diagnosed
 * against the pinned Oolite lines: a port bug is fixed in the port, a fixture
 * error is an oracle dispute to record; a tolerance is never widened. This file
 * runs exactly its manifest entry (`oracle-groups.ts`, `FIRE_ORACLE_GROUPS`) and
 * asserts that the ids it ran equal the ids of that entry.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SCANNER_MAX_RANGE } from "../../../src/sim/npc/constants.js";
import { FireSiteFileSchema } from "../../oracles/npc/fire-sites/schema.js";
import type { FireSiteFixture } from "../../oracles/npc/fire-sites/schema.js";
import { fireFixtureFilesFor } from "./oracle-groups.js";
import { runFixture, weaponHooks } from "./oracle-runner.js";

const THIS_FILE = "tests/sim/npc/fire-sites.oracle.test.ts";
const FILES = fireFixtureFilesFor(THIS_FILE);

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function readFixtures(file: string): readonly FireSiteFixture[] {
  return FireSiteFileSchema.parse(
    JSON.parse(readFileSync(`${REPO_ROOT}${file}`, "utf8")) as unknown,
  );
}

const ran: string[] = [];

/**
 * Open oracle disputes (plan 17-08): a fixture whose expected value disagrees
 * with the pinned Oolite behaviour. The fixture file is NOT edited and no
 * tolerance is widened. Each entry pins the exact failure the port produces, so
 * every other check, the events, the draw count and `fireRequestTicks` of the
 * fixture still hold, and the entry fails as soon as the fixture is corrected
 * (the pinned failure no longer occurs), which forces its removal.
 *
 * None open. The one raised in plan 17-08 (fire-site-flee-evasive-hand-over-
 * still-requests, tick 2 successFactor: the fixture held the start pose, while
 * Oolite's update 1 thrusts and moves the ship 0.011111 m) was re-derived by an
 * independent oracle author and corrected in the fixture (commit 89ee9ee).
 */
const OPEN_DISPUTES: ReadonlyMap<string, readonly string[]> = new Map();

for (const file of FILES) {
  describe(file, () => {
    for (const entry of readFixtures(file)) {
      const { fixture } = entry;
      it(fixture.id, () => {
        ran.push(fixture.id);
        if (fixture.stats.scannerRange !== SCANNER_MAX_RANGE) {
          throw new Error(
            `oracle dispute: ${fixture.id} has scannerRange ${String(fixture.stats.scannerRange)}`,
          );
        }
        const fireCalls: number[] = [];
        const result = runFixture(fixture, weaponHooks(entry.weapon), {
          fireCalls,
        });
        expect(result.failures).toEqual(OPEN_DISPUTES.get(fixture.id) ?? []);
        expect(result.checks).toBe(fixture.checks.length);
        // The update numbers at which the behaviour reached a fire call, exactly.
        expect(fireCalls).toEqual(entry.fireRequestTicks);
      });
    }
  });
}

describe("the manifest entry", () => {
  it("pins only disputes that belong to a fixture of its files", () => {
    const ids = new Set<string>();
    for (const file of FILES) {
      for (const entry of readFixtures(file)) ids.add(entry.fixture.id);
    }
    for (const id of OPEN_DISPUTES.keys()) expect(ids.has(id), id).toBe(true);
  });

  it("runs exactly the fixtures of its files", () => {
    const expected: string[] = [];
    for (const file of FILES) {
      expected.push(...readFixtures(file).map((entry) => entry.fixture.id));
    }
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual(expected.sort());
  });
});
