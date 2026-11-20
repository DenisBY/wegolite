// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The explosion blast against the independent 18-03 oracle (CBT-18, D-03,
 * PD-02).
 *
 * Every `blast.json` fixture runs twice: through `blastImpulse`, the
 * per-receiver rule (one source, one receiver: in range or not, and the
 * velocity change), and through `blastFrom`, the world pass a kill runs, with
 * each receiver placed as the body it names (the player through the debris
 * context's player body and accumulator, a Shuttle as a ship whose mass the
 * content's hull table gives, a pod or a plate as a cargo piece whose model
 * the content gives) and the fixture's victims exploding in the C's order (a
 * dying buoy's subentity before its hull, `ShipEntity.m:8115-8126`). The
 * fixtures pin Oolite's float32 arithmetic; the port's magnitude is double and
 * passes at the fixtures' relative tolerance, while its in-range test is the
 * C's float compare, which the two boundary fixtures one ulp apart pin.
 *
 * The buoy's blast constants are pinned here too: the subentity's collision
 * radius (the static hull artifact carries none) against the fixture and
 * against OOMesh's rule over the vendored `oolite_buoy_subents.dat`, and the
 * subentity's authored offset (0, 0, 0), which puts its explosion at the
 * buoy's centre.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BUOY_SUBENTITY_MASS,
  NAV_BUOY_HULL_MASS,
} from "../../../src/sim/hyperspace/countdown.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import {
  BUOY_SUBENTITY_RADIUS,
  blastFrom,
  blastImpulse,
} from "../../../src/sim/world/debris.js";
import type {
  BlastPush,
  DebrisContent,
  DebrisContext,
  DebrisHull,
  DebrisModel,
} from "../../../src/sim/world/debris.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { readDat } from "../../oracles/combat/geometry/dat.js";
import {
  BLAST_FIXTURE_FILE,
  BlastFileSchema,
  withinTolerance,
} from "../../oracles/combat/response/schema.js";
import type { BlastFixture } from "../../oracles/combat/response/schema.js";

const THIS_FILE = "tests/sim/world/blast.oracle.test.ts";

/** The dying buoy's fixture: its two sources. */
const BUOY_FIXTURE_ID = "blast-buoy-dying-with-subentity";

function readFixtures(): readonly BlastFixture[] {
  // blast.json, through the schema's file constant.
  return BlastFileSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../oracles/combat/response/${BLAST_FIXTURE_FILE}`,
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown,
  );
}

type Body = BlastFixture["receivers"][number];
type Expected = BlastFixture["expected"]["receivers"][number];

const toVec = (p: readonly number[]): Vec3 =>
  vec(p[0] ?? Number.NaN, p[1] ?? Number.NaN, p[2] ?? Number.NaN);

function expectVec(
  actual: Vec3,
  expected: readonly number[],
  tolerance: number,
  label: string,
): void {
  const a = [actual.x, actual.y, actual.z];
  for (let i = 0; i < 3; i += 1) {
    const want = expected[i] ?? Number.NaN;
    const got = a[i] ?? Number.NaN;
    expect(
      withinTolerance(got, want, tolerance),
      `${label}[${String(i)}]: ${String(got)} vs ${String(want)}`,
    ).toBe(true);
  }
}

/** The receiver kinds the fixtures name, by name. */
type ReceiverKind = "player" | "ship" | "pod" | "plate";

function kindOf(receiver: Body): ReceiverKind {
  if (receiver.name.startsWith("player")) return "player";
  if (receiver.name === "pod") return "pod";
  if (receiver.name === "plate") return "plate";
  if (receiver.name === "Shuttle") return "ship";
  throw new Error(`unknown receiver ${receiver.name}`);
}

/** The debris content that gives each fixture receiver its mass and radius. */
function contentFor(fixture: BlastFixture): DebrisContent {
  const hulls = new Map<string, DebrisHull>();
  let pod: DebrisModel = { key: "barrel", mass: 1, radius: 1 };
  let plate: DebrisModel = { key: "alloy", mass: 1, radius: 1 };
  for (const receiver of fixture.receivers) {
    const kind = kindOf(receiver);
    if (kind === "ship") {
      hulls.set("shuttle", {
        mass: receiver.mass,
        fragmentChance: 0,
        boundingBox: { min: vec(0, 0, 0), max: vec(0, 0, 0) },
      });
    } else if (kind === "pod") {
      pod = { key: "barrel", mass: receiver.mass, radius: receiver.radius };
    } else if (kind === "plate") {
      plate = { key: "alloy", mass: receiver.mass, radius: receiver.radius };
    }
  }
  return { hulls, pod, plate, wrecks: [] };
}

function place(world: World, receiver: Body): Entity {
  const kind = kindOf(receiver);
  const result = spawnEntity(
    world,
    {
      kind: kind === "ship" ? "ship" : "cargo",
      specKey:
        kind === "ship" ? "shuttle" : kind === "pod" ? "barrel" : "alloy",
      scanClass: kind === "ship" ? "CLASS_NEUTRAL" : "CLASS_CARGO",
      position: toVec(receiver.position),
      orientation: identity(),
      radius: receiver.radius,
      speed: 0,
      ai: null,
      maxEnergy: 1,
      energyRechargeRate: 0,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/** The fixture through `blastFrom`: each receiver's velocity change. */
function throughWorld(fixture: BlastFixture): Vec3[] {
  const world = createWorld(1);
  const push: BlastPush = { x: 0, y: 0, z: 0 };
  const entities: (Entity | undefined)[] = [];
  let player: Body | undefined;
  for (const receiver of fixture.receivers) {
    if (kindOf(receiver) === "player") {
      if (player !== undefined) throw new Error("two players");
      player = receiver;
      entities.push(undefined);
    } else {
      entities.push(place(world, receiver));
    }
  }
  const ctx: DebrisContext = {
    tick: 0,
    content: contentFor(fixture),
    ...(player === undefined
      ? {}
      : {
          player: {
            position: toVec(player.position),
            radius: player.radius,
            mass: player.mass,
          },
          playerPush: push,
        }),
  };
  for (const victim of fixture.victims) {
    blastFrom(
      world,
      {
        position: toVec(victim.position),
        mass: victim.mass,
        radius: victim.radius,
      },
      ctx,
    );
  }
  return entities.map((entity) =>
    entity === undefined ? vec(push.x, push.y, push.z) : entity.velocity,
  );
}

const ran = new Set<string>();

describe(THIS_FILE, () => {
  for (const fixture of readFixtures()) {
    describe(fixture.id, () => {
      it("blastImpulse: in range exactly as the C, and each victim's push", () => {
        ran.add(fixture.id);
        fixture.receivers.forEach((receiver, r) => {
          const expected: Expected | undefined = fixture.expected.receivers[r];
          if (expected === undefined) throw new Error("fixture shape");
          fixture.victims.forEach((victim, v) => {
            const contribution = expected.contributions[v];
            if (contribution === undefined) throw new Error("fixture shape");
            const dv = blastImpulse(
              {
                position: toVec(victim.position),
                mass: victim.mass,
                radius: victim.radius,
              },
              toVec(receiver.position),
              receiver.radius,
              receiver.mass,
            );
            expect(
              dv !== undefined,
              `${receiver.name} in range of ${victim.name}`,
            ).toBe(contribution.inRange);
            if (dv !== undefined && contribution.dv !== null) {
              expectVec(
                dv,
                contribution.dv,
                fixture.tolerance,
                `${receiver.name} from ${victim.name}`,
              );
            }
          });
        });
      });

      it("blastFrom: every receiver's velocity change in the world pass", () => {
        const changes = throughWorld(fixture);
        fixture.expected.receivers.forEach((expected, r) => {
          const change = changes[r];
          if (change === undefined) throw new Error("no receiver");
          if (expected.dv === null) {
            expect(change).toEqual(vec(0, 0, 0));
          } else {
            expectVec(
              change,
              expected.dv,
              fixture.tolerance,
              fixture.receivers[r]?.name ?? "receiver",
            );
          }
        });
      });
    });
  }
});

describe("the buoy's blast constants", () => {
  const fixture = readFixtures().find((f) => f.id === BUOY_FIXTURE_ID);

  it("the dying buoy's two sources: the subentity's mass and radius, then the hull-only mass and the layout radius", () => {
    if (fixture === undefined) throw new Error("no buoy fixture");
    const [sub, hull] = fixture.victims;
    if (sub === undefined || hull === undefined) {
      throw new Error("fixture shape");
    }
    expect(sub.mass).toBe(BUOY_SUBENTITY_MASS);
    expect(sub.radius).toBe(BUOY_SUBENTITY_RADIUS);
    expect(hull.mass).toBe(NAV_BUOY_HULL_MASS);
    const { layout } = laveFixture();
    expect(hull.radius).toBe(layout.navBuoy.radius);
    expect(hull.radius).toBe(layout.witchpoint.radius);
  });

  it("BUOY_SUBENTITY_RADIUS is OOMesh's rule over the vendored oolite_buoy_subents.dat (sqrtf of the largest vertex magnitude2, OOMesh.m:1800-1822)", () => {
    const f = Math.fround;
    const mesh = readDat(
      new URL(
        "../../../third_party/oolite/Models/oolite_buoy_subents.dat",
        import.meta.url,
      ),
    );
    let largest = 0;
    for (const [x, y, z] of mesh.vertices) {
      const fx = f(x);
      const fy = f(y);
      const fz = f(z);
      const d2 = f(f(f(fx * fx) + f(fy * fy)) + f(fz * fz));
      if (d2 > largest) largest = d2;
    }
    expect(f(Math.sqrt(largest))).toBe(BUOY_SUBENTITY_RADIUS);
  });

  it("the subentity sits at the buoy's centre: its authored offset is (0, 0, 0), so its explosion's origin is the buoy's position", () => {
    const buoy = fullHullTable().get("buoy");
    const subentities = buoy?.subentities ?? [];
    expect(subentities).toHaveLength(1);
    expect(subentities[0]?.position).toEqual(vec(0, 0, 0));
    expect(subentities[0]?.mass).toBe(BUOY_SUBENTITY_MASS);
  });
});

describe("the manifest entry", () => {
  it("runs exactly the fixtures of blast.json", () => {
    const expected = readFixtures().map((fixture) => fixture.id);
    expect(expected).toHaveLength(11);
    expect(expected).toContain(BUOY_FIXTURE_ID);
    expect([...ran].sort()).toEqual([...expected].sort());
  });
});
