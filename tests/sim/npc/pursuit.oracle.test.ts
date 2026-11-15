// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Intercept against the independent pursuit oracle (Phase 14, plan 14-12;
 * ROADMAP criterion 1).
 *
 * Each fixture goes through the runner's synthetic WorldView and
 * `ShipControl.perform` into `steerShip`; expected values live in
 * `tests/oracles/npc/pursuit/fixtures/*.json` and nothing here copies Wegolite
 * output into them. This file runs exactly its manifest entry
 * (`tests/sim/npc/oracle-groups.ts`) and asserts that the ids it ran equal the
 * ids of that entry. Plans 14-14 and 14-15 add the attack fixture files to the
 * manifest row of this file (plan 14-13 added flee).
 *
 * Plan 14-13: two plain cases beside the fixtures pin performFlee's guard and
 * the retreat branch's own jink (ShipEntity.m:9096-9098).
 */

import { describe, expect, it } from "vitest";

import { identity, vec } from "../../../src/sim/math.js";
import { steerShip } from "../../../src/sim/npc/dispatch.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import { fixtureFilesFor } from "./oracle-groups.js";
import {
  createSyntheticView,
  emptyHooks,
  fixturesIn,
  runFixture,
} from "./oracle-runner.js";

const THIS_FILE = "tests/sim/npc/pursuit.oracle.test.ts";
const FILES = fixtureFilesFor(THIS_FILE);

/**
 * Flee fixtures that branch into an evasive behaviour: the evasive behaviours
 * arrive with this plan's Task 3, which empties this set.
 */
const DEFERRED: ReadonlySet<string> = new Set([
  "flee-accuracy-2-aspect-above-0-9995-takes-evasive-action",
  "flee-accuracy-2-aspect-above-0-9995-takes-flee-evasive-action",
]);

const ran: string[] = [];

for (const file of FILES) {
  describe(file, () => {
    for (const fixture of fixturesIn(file)) {
      if (DEFERRED.has(fixture.id)) continue;
      it(fixture.id, () => {
        ran.push(fixture.id);
        const result = runFixture(fixture, emptyHooks());
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
      for (const fixture of fixturesIn(file)) {
        if (!DEFERRED.has(fixture.id)) expected.push(fixture.id);
      }
    }
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual(expected.sort());
  });
});

/* ---------------------------------------------------------------------------
 * Two plain cases (plan 14-13), expected values from the cited Oolite lines
 * ------------------------------------------------------------------------- */

const STATS: NpcFlightStats = {
  specKey: "t",
  maxFlightSpeed: 160,
  maxFlightRoll: 2,
  maxFlightPitch: 1,
  thrust: 15,
  mass: 0,
  forwardWeapon: "EQ_WEAPON_NONE",
};

function spawnFleer(accuracy: number) {
  const world = createWorld(1);
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "t",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 10,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  result.entity.steer.accuracy = accuracy;
  return { world, entity: result.entity };
}

describe("plan 14-13 plain cases", () => {
  it("perform FLEE_TARGET while FLEE_EVASIVE_ACTION changes nothing and leaves entryPending false (ShipEntityAI.m:381)", () => {
    const { world, entity } = spawnFleer(2);
    entity.nav.behaviour = "FLEE_EVASIVE_ACTION";
    entity.steer.frustration = Math.fround(0.25);
    entity.steer.entryPending = true; // an earlier perform of the same think
    createShipControl(world, entity.id, 0).perform(entity.id, "FLEE_TARGET");
    expect(entity.nav.behaviour).toBe("FLEE_EVASIVE_ACTION");
    expect(entity.steer.frustration).toBe(Math.fround(0.25));
    expect(entity.steer.entryPending).toBe(false);
  });

  it("a ship already in FLEE_TARGET with accuracy 7 and a zero jink draws two units inside trackPrimaryTarget and ends with a jink whose z is 400 (ShipEntity.m:9096-9098)", () => {
    const { entity } = spawnFleer(7);
    entity.nav.behaviour = "FLEE_TARGET";
    entity.nav.targetId = 102;
    entity.nav.desiredRange = 1000;
    entity.steer.jink = vec(0, 0, 0);
    expect(entity.steer.entryPending).toBe(false);
    const scripted = [0.5, 0]; // x = 0 -> +128, y = -128 -> -256
    let used = 0;
    const view = createSyntheticView(
      [
        {
          id: 102,
          kind: "ship",
          scanClass: "CLASS_NEUTRAL",
          radius: 50,
          mass: 0,
          position: vec(0, 0, -1000),
          orientation: identity(),
          speed: 0,
          behaviour: "IDLE",
          targetId: 0,
        },
      ],
      entity,
      1,
    );
    steerShip(entity, {
      view,
      stats: STATS,
      dt: 1 / 120,
      draw: () => {
        const value = scripted[used];
        if (value === undefined) throw new Error("an unscripted draw");
        used += 1;
        return value;
      },
      emit: () => {},
    });
    expect(used).toBe(2);
    // Oolite's jink (128, -256, 400); Wegolite stores z negated
    expect(entity.steer.jink).toEqual(vec(128, -256, -400));
  });
});
