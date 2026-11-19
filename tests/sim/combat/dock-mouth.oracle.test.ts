// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The laser hit rule against the independent dock-mouth oracle (Phase 18, plan
 * 18-04; ROADMAP criterion 2, CBT-17): the `dock-mouth.json` fixtures of plan
 * 18-02, derived from the vendored meshes and Oolite's `doesHitLine` subentity
 * rule (`ShipEntity.m:1323-1357`) by an author with no access to the port, and
 * the `edge: false` ones confirmed on real Oolite by plan 18-20.
 *
 * Each fixture places its model (the Coriolis station or the buoy) at the
 * origin with identity orientation, converts the ray from Oolite model axes to
 * Wegolite's (x, y, -z), and calls `firstShipHit` with the merged hull table
 * (`fullHullTable()`, the ten ships plus the static hulls, as the traffic-on
 * session builds it). The port must name the same part and report a distance
 * within the fixture's tolerance of the exact surface distance. The tolerance
 * was fixed up front in 18-02 from the leaf size and the incidence; a failing
 * fixture is a dispute to record, never a reason to widen it.
 *
 * The buoy becomes a laser candidate only in plan 18-05, so its `HitTarget` is
 * built here by hand, exactly as the station's: this file tests the hit rule,
 * not candidacy (review L378@2e0bfb3).
 *
 * Before any ray, the octree depth and root half-width each fixture's tolerance
 * assumes (`parts[].octreeDepth`) are checked against the emitted octrees, and
 * each subentity's authored position against the table's (review L356@b45e113).
 * This file runs exactly the fixtures of `dock-mouth.json`.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { firstShipHit } from "../../../src/sim/combat/hit.js";
import type {
  HitPart,
  HitTarget,
  HullData,
  LaserRay,
} from "../../../src/sim/combat/hit.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import {
  DOCK_PART_NAMES,
  DockMouthFileSchema,
} from "../../oracles/combat/geometry/schema.js";
import type { DockMouthFixture } from "../../oracles/combat/geometry/schema.js";
import { fullHullTable } from "../../helpers/hull-table.js";

const THIS_FILE = "tests/sim/combat/dock-mouth.oracle.test.ts";

/** The fixture file this test consumes, under `tests/oracles/combat/geometry`. */
const FIXTURE_FILE = "fixtures/dock-mouth.json";

/** The laser range the fixtures assume: every start is within 3,000 m. */
const RANGE = 20_000;

/** The hull table key of each oracle model. */
const HULL_KEY = { coriolis: "coriolis-station", buoy: "buoy" } as const;

/** Any id: the fixture has one target. */
const TARGET_ID = 3;

const HULLS = fullHullTable();

function readFixtures(): readonly DockMouthFixture[] {
  return DockMouthFileSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../oracles/combat/geometry/${FIXTURE_FILE}`,
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown,
  );
}

/** Oolite model axes to Wegolite's, for a target at the origin, identity. */
function toWegolite(v: readonly [number, number, number]): Vec3 {
  return vec(v[0], v[1], -v[2]);
}

/** Two unit vectors orthogonal to `forward` and to each other. */
function frame(forward: Vec3): { right: Vec3; up: Vec3 } {
  // Any axis not parallel to the beam seeds the frame.
  const seed = Math.abs(forward.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0);
  const rx = seed.y * forward.z - seed.z * forward.y;
  const ry = seed.z * forward.x - seed.x * forward.z;
  const rz = seed.x * forward.y - seed.y * forward.x;
  const rl = Math.hypot(rx, ry, rz);
  const right = vec(rx / rl, ry / rl, rz / rl);
  const up = vec(
    forward.y * right.z - forward.z * right.y,
    forward.z * right.x - forward.x * right.z,
    forward.x * right.y - forward.y * right.x,
  );
  return { right, up };
}

/** The `HitPart` an oracle part name maps to, through the model's part order. */
function partOf(fixture: DockMouthFixture, name: string): HitPart {
  const names: readonly string[] = DOCK_PART_NAMES[fixture.model];
  const index = names.indexOf(name);
  if (index < 0) throw new Error(`${fixture.id}: no part ${name}`);
  return index === 0
    ? { kind: "hull" }
    : { kind: "subentity", index: index - 1 };
}

function hullOf(fixture: DockMouthFixture): HullData {
  const hull = HULLS.get(HULL_KEY[fixture.model]);
  if (hull === undefined) throw new Error(`no hull for ${fixture.model}`);
  return hull;
}

const ran: string[] = [];

describe(THIS_FILE, () => {
  for (const fixture of readFixtures()) {
    it(fixture.id, () => {
      ran.push(fixture.id);
      const hull = hullOf(fixture);
      const subentities = hull.subentities ?? [];

      // The depths and root half-widths the tolerance assumes, against the
      // emitted octrees; each subentity's authored position against the table.
      expect(subentities).toHaveLength(fixture.parts.length - 1);
      fixture.parts.forEach((part, index) => {
        const octree =
          index === 0 ? hull.octree : subentities[index - 1]?.octree;
        expect(octree?.depth, `${part.name} depth`).toBe(
          part.octreeDepth.depth,
        );
        expect(octree?.radius, `${part.name} root half-width`).toBeCloseTo(
          part.octreeDepth.rootHalfWidth,
          4,
        );
        if (index > 0) {
          const position = subentities[index - 1]?.position;
          expect(position?.x).toBeCloseTo(part.position[0], 4);
          expect(position?.y).toBeCloseTo(part.position[1], 4);
          expect(position?.z).toBeCloseTo(part.position[2], 4);
        }
      });

      const forward = toWegolite(fixture.ray.direction);
      const { right, up } = frame(forward);
      const ray: LaserRay = {
        origin: toWegolite(fixture.ray.start),
        forward,
        right,
        up,
        range: RANGE,
      };
      const target: HitTarget = {
        id: TARGET_ID,
        specKey: HULL_KEY[fixture.model],
        position: vec(0, 0, 0),
        orientation: identity(),
      };

      const hit = firstShipHit(ray, [target], HULLS);
      const { winner, distance, tolerance } = fixture.expected;
      if (winner === "none" || distance === null) {
        expect(hit).toBeNull();
        return;
      }
      expect(hit?.id).toBe(TARGET_ID);
      expect(hit?.part).toEqual(partOf(fixture, winner));
      const error = Math.abs((hit?.distance ?? Number.NaN) - distance);
      expect(
        error <= tolerance,
        `distance ${String(hit?.distance)} vs ${String(distance)} +/- ${String(tolerance)}`,
      ).toBe(true);
    });
  }
});

describe("the fixture file", () => {
  it(`runs exactly the fixtures of ${FIXTURE_FILE}`, () => {
    const expected = readFixtures().map((fixture) => fixture.id);
    expect(expected.length).toBeGreaterThan(0);
    expect([...ran].sort()).toEqual([...expected].sort());
  });
});
