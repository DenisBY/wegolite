// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC flight model, idle, stop-still and tumble against the independent
 * oracle (Phase 14, plan 14-09; ROADMAP criterion 1).
 *
 * Each fixture goes through the runner's synthetic WorldView and
 * `ShipControl.perform` into `steerShip`; expected values live in
 * `tests/oracles/npc/fixtures/*.json` and nothing here copies Wegolite output
 * into them. This file runs exactly its manifest entry
 * (`tests/sim/npc/oracle-groups.ts`) and asserts that the ids it ran equal the
 * ids of that entry.
 */

import { describe, expect, it } from "vitest";

import { identity, rotate, vec } from "../../../src/sim/math.js";
import { steerShip } from "../../../src/sim/npc/dispatch.js";
import { OOLITE_DEFAULT_FLIGHT_STATS } from "../../../src/sim/npc/stats.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import { fixtureFilesFor } from "./oracle-groups.js";
import {
  createSyntheticView,
  emptyHooks,
  fixturesIn,
  loadOracleFiles,
  runFixture,
} from "./oracle-runner.js";

const THIS_FILE = "tests/sim/npc/flight.oracle.test.ts";
const FILES = fixtureFilesFor(THIS_FILE);

const ran: string[] = [];

describe("every oracle fixture file parses with the schema", () => {
  it("loads both fixture trees", () => {
    const files = loadOracleFiles();
    expect(files.size).toBeGreaterThanOrEqual(13);
    for (const file of FILES) expect(files.has(file)).toBe(true);
  });
});

for (const file of FILES) {
  describe(file, () => {
    for (const fixture of fixturesIn(file)) {
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
      for (const fixture of fixturesIn(file)) expected.push(fixture.id);
    }
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual(expected.sort());
  });
});

/* ---------------------------------------------------------------------------
 * One physical turn-direction case that does not depend on the runner's
 * orientation mapping (PITFALLS 1): a mirrored composition fails here even if a
 * distance-only check would pass.
 * ------------------------------------------------------------------------- */

function fixtureExpected(
  fixtureId: string,
  tick: number,
  field: string,
): number {
  for (const file of FILES) {
    for (const fixture of fixturesIn(file)) {
      if (fixture.id !== fixtureId) continue;
      for (const check of fixture.checks) {
        if (check.tick === tick && check.field === field) {
          if (typeof check.expected !== "number") break;
          return check.expected;
        }
      }
    }
  }
  throw new Error(`no check ${field} at tick ${String(tick)} in ${fixtureId}`);
}

function tumbler(roll: number, pitch: number): Entity {
  const result = spawnEntity(
    createWorld(1),
    {
      kind: "ship",
      specKey: "turn",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: 10,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  const entity = result.entity;
  entity.nav.behaviour = "TUMBLE";
  entity.steer.accuracy = 2;
  entity.steer.stickRoll = roll;
  entity.steer.flightRoll = roll;
  entity.steer.stickPitch = pitch;
  entity.steer.flightPitch = pitch;
  return entity;
}

function turnFor120Ticks(entity: Entity): void {
  const ctx = {
    view: createSyntheticView([], entity, 0),
    stats: OOLITE_DEFAULT_FLIGHT_STATS,
    dt: 1 / 120,
    draw: (): number => {
      throw new Error("no draw expected");
    },
    emit: (): void => {
      throw new Error("no event expected");
    },
  };
  for (let tick = 1; tick <= 120; tick += 1) steerShip(entity, ctx);
}

describe("the turn direction in Wegolite's frame (local -Z forward, +Y up)", () => {
  it("one second of positive flightPitch tips the nose toward the side the oracle states", () => {
    // Oolite's up is +y and the mirror leaves y alone, so the sign of the
    // forward.y component is the same in both frames.
    const stated = fixtureExpected("attitude-step-pitch-only", 120, "forwardY");
    expect(stated).not.toBe(0);
    const entity = tumbler(0, 0.5);
    turnFor120Ticks(entity);
    const forward = rotate(entity.orientation, vec(0, 0, -1));
    expect(Math.sign(forward.y)).toBe(Math.sign(stated));
    expect(forward.y).toBeCloseTo(stated, 5);
    // Nothing else moved the ship: a tumbling ship does not translate.
    expect(entity.position).toEqual(vec(0, 0, 0));
  });

  it("one second of positive flightRoll leans the up axis toward the side the oracle states", () => {
    // The mirror leaves x alone, so the sign of the up.x component is the same.
    const stated = fixtureExpected("attitude-step-roll-only", 120, "upX");
    expect(stated).not.toBe(0);
    const entity = tumbler(1, 0);
    turnFor120Ticks(entity);
    const up = rotate(entity.orientation, vec(0, 1, 0));
    expect(Math.sign(up.x)).toBe(Math.sign(stated));
    expect(up.x).toBeCloseTo(stated, 5);
    const forward = rotate(entity.orientation, vec(0, 0, -1));
    expect(forward.x).toBeCloseTo(0, 9);
    expect(forward.y).toBeCloseTo(0, 9);
    expect(forward.z).toBeCloseTo(-1, 9);
  });
});
