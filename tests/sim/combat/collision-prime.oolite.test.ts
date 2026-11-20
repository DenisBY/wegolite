// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The collision stage against real Oolite's first contact between the player
 * and the nav buoy (owner decision 2026-11-20, todo
 * `2026-11-20-buoy-contact-onset-mismatch`).
 *
 * Oolite's octree test is not symmetric: the prime's octree is tested
 * against the other's, and at one pose the onset can move by about 24 m
 * between the two primes. Oolite's prime is `e1` of the collision chain, the
 * body with the lower `z - collision_radius` (`Entity.m:247`,
 * `Universe.m:7044-7073`, `CollisionRegion.m:287`). The fixture
 * (`./fixtures/buoy-contact-remeasure-2026-11-20.json`, provenance inside) holds
 * the 11 re-measure sessions on Oolite 1.93.1-255: for each, the last frame
 * without contact and the first-contact frame, both poses in Oolite axes. This
 * test sets both poses on the stage (`resolveCollisions`, with the buoy's
 * tumble replaced by the logged orientation) and asks for Oolite's answer at
 * each frame. With the player as the prime in every pair, the 5 sessions
 * marked `playerPrimeMismatch` fail on their no-contact frame.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { PLAYER_HULL_KEY } from "../../../src/sim/combat/aim.js";
import { resolveCollisions } from "../../../src/sim/combat/collide.js";
import type { HullTable } from "../../../src/sim/combat/hit.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { normalize, quat, rotate, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { DT } from "../../../src/sim/time.js";
import { buoyOrientation } from "../../../src/sim/world/statics.js";
import { createWorld } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

// The buoys' tumble is a function of the flight clock; the fixture's buoy
// orientation is Oolite's logged one, so the stage reads it from here.
const tumble = vi.hoisted(() => ({
  orientation: undefined as Quat | undefined,
}));
vi.mock("../../../src/sim/world/statics.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/sim/world/statics.js")>();
  return {
    ...actual,
    buoyOrientation: (flightTime: number) =>
      tumble.orientation ?? actual.buoyOrientation(flightTime),
  };
});

type V3 = [number, number, number];
interface Pose {
  readonly position: V3;
  readonly right: V3;
  readonly up: V3;
  readonly forward: V3;
}
interface Frame {
  readonly n: number;
  readonly touch: boolean;
  readonly d: number;
  readonly player: Pose;
  readonly buoy: Pose;
}
interface Run {
  readonly id: string;
  readonly session: string;
  readonly oolitePrime: "player" | "buoy";
  readonly playerPrimeMismatch: boolean;
  readonly frames: readonly Frame[];
}
interface Fixture {
  readonly provenance: { readonly radii: { player: number; buoy: number } };
  readonly runs: readonly Run[];
}

const FIXTURE = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/buoy-contact-remeasure-2026-11-20.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Fixture;

const { layout, config } = laveFixture();
const HULLS: HullTable = fullHullTable();
const NAV_BUOY = layout.navBuoy.position;

function options(): StepOptions {
  return {
    npcFlight: realNpcFlightTable(),
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      debris: debrisFixture(),
      collisions: true,
    },
  };
}

/** Oolite world (x, y, z) to Wegolite world (x, y, -z). */
const toWegolite = (v: V3): Vec3 => vec(v[0], v[1], -v[2]);

/** The Wegolite quaternion whose +X, +Y and -Z are Oolite's right, up, forward. */
function quatFromBasis(pose: Pose): Quat {
  const c0 = toWegolite(pose.right);
  const c1 = toWegolite(pose.up);
  const fw = toWegolite(pose.forward);
  const m00 = c0.x;
  const m10 = c0.y;
  const m20 = c0.z;
  const m01 = c1.x;
  const m11 = c1.y;
  const m21 = c1.z;
  const m02 = -fw.x;
  const m12 = -fw.y;
  const m22 = -fw.z;
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = quat(0.25 * s, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s);
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = quat((m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s);
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = quat((m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s);
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = quat((m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s);
  }
  return normalize(q);
}

/** The largest distance between a basis vector of `q` and the logged one. */
function basisError(q: Quat, pose: Pose): number {
  const err = (a: Vec3, b: Vec3): number =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  return Math.max(
    err(rotate(q, vec(1, 0, 0)), toWegolite(pose.right)),
    err(rotate(q, vec(0, 1, 0)), toWegolite(pose.up)),
    err(rotate(q, vec(0, 0, -1)), toWegolite(pose.forward)),
  );
}

/**
 * The number of contacts the stage finds with the buoy at the nav buoy's
 * layout position and the player at the logged offset from it (a pure
 * translation, so the pair's z order is Oolite's).
 */
function stageContacts(frame: Frame): number {
  const player = initFlightState(layout);
  stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(player, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  const offset = toWegolite([
    frame.player.position[0] - frame.buoy.position[0],
    frame.player.position[1] - frame.buoy.position[1],
    frame.player.position[2] - frame.buoy.position[2],
  ]);
  player.position = vec(
    NAV_BUOY.x + offset.x,
    NAV_BUOY.y + offset.y,
    NAV_BUOY.z + offset.z,
  );
  player.orientation = quatFromBasis(frame.player);
  player.speed = 0;
  tumble.orientation = quatFromBasis(frame.buoy);
  try {
    const { stats } = resolveCollisions(
      createWorld(7),
      player,
      createPlayerCombatState(),
      options(),
      layout,
    );
    return stats.contacts;
  } finally {
    tumble.orientation = undefined;
  }
}

describe("the stage's first contact with the nav buoy against real Oolite (owner decision 2026-11-20)", () => {
  it("holds the 11 sessions, 5 of them a MISMATCH with the player as the prime", () => {
    expect(FIXTURE.runs).toHaveLength(11);
    expect(FIXTURE.runs.filter((run) => run.playerPrimeMismatch)).toHaveLength(
      5,
    );
    // The fixture's radii are the stage's hull collision radii.
    expect(HULLS.get(PLAYER_HULL_KEY)?.collisionRadius).toBeCloseTo(
      FIXTURE.provenance.radii.player,
      4,
    );
    expect(HULLS.get("buoy")?.collisionRadius).toBeCloseTo(
      FIXTURE.provenance.radii.buoy,
      4,
    );
    // The stage's module reads the fixture's orientation while one is set.
    const logged = quat(0, 1, 0, 0);
    tumble.orientation = logged;
    try {
      expect(buoyOrientation(0)).toBe(logged);
    } finally {
      tumble.orientation = undefined;
    }
    expect(buoyOrientation(0)).not.toBe(logged);
  });

  for (const run of FIXTURE.runs) {
    const tag = run.playerPrimeMismatch ? " (was a MISMATCH)" : "";
    it(`${run.id} (session ${run.session}, Oolite's prime the ${run.oolitePrime})${tag}: no contact on the frame before, contact on the first-contact frame`, () => {
      expect(run.frames.map((frame) => frame.touch)).toEqual([false, true]);
      for (const frame of run.frames) {
        expect(
          basisError(quatFromBasis(frame.player), frame.player),
        ).toBeLessThan(1e-5);
        expect(basisError(quatFromBasis(frame.buoy), frame.buoy)).toBeLessThan(
          1e-5,
        );
        expect({ n: frame.n, contacts: stageContacts(frame) }).toEqual({
          n: frame.n,
          contacts: frame.touch ? 1 : 0,
        });
      }
    });
  }
});
