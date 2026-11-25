// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The strip-and-rehash proof of FOUND-20 (pitfall C2, plan 21-03): the world
 * snapshot moves from version 4 to version 5 once, and every new per-entity
 * field is hashed pristine-omit, so a world that sets none of them hashes
 * byte-identically to version 4.
 *
 * The proof has three parts, each independent of the code under test:
 *  - the pristine texts below were captured from a world built with no new
 *    field (never from a regenerated golden), and the epoch 1-20 pin
 *    (`inert-isolation.test.ts`) and the flight-hash pins stay untouched;
 *  - setting one field alone prints exactly its one segment, after `cargo:`
 *    in the fixed order of `V5_ORDER`;
 *  - deleting that segment from the text reproduces the pristine text.
 */

import { describe, expect, it } from "vitest";

import { initFlightState } from "../../../src/sim/flight/state.js";
import { fnv1a32 } from "../../../src/sim/hash.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import {
  hashWorld,
  serializeEntity,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";
import { laveInertWorld } from "../../helpers/traffic-fixture.js";

const { layout } = laveFixture();

/** The fixed order of the v5 segments, after `cargo:` (FOUND-20). */
const V5_ORDER = [
  "bty",
  "role",
  "grp",
  "ck",
  "pod",
  "fuel",
  "inj",
  "sys",
  "wpf",
  "wty",
  "fine",
] as const;

type SegmentLabel = (typeof V5_ORDER)[number];

function shipInit(index: number, extra: Partial<SpawnInit> = {}): SpawnInit {
  return {
    kind: "ship",
    specKey: "viper",
    scanClass: "CLASS_NEUTRAL",
    position: vec(100 * (index + 1), -20 * index, 30),
    orientation: identity(),
    radius: 35,
    speed: 12.5,
    ...extra,
  };
}

function spawnOk(world: World, init: SpawnInit): Entity {
  const result = spawnEntity(world, init, 3);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/**
 * A hand-built two-ship world that sets no v5 field: a drifting ship with
 * cargo (so `cargo:` is the last segment before any v5 one) and a plain one.
 */
function twoShipWorld(): World {
  const world = createWorld(0x1234abcd);
  spawnOk(world, shipInit(0, { cargo: 3, velocity: vec(1.5, 0, -2) }));
  spawnOk(world, shipInit(1));
  return world;
}

/**
 * The pristine world section, captured from `twoShipWorld` with no v5 field
 * set (the text ends at `cargo:3` and `steer:...,ep:0`, the v4 shape).
 */
const PRISTINE_SECTION = [
  "worldSeed=305441741",
  "nextId=103",
  "rng=805026686",
  "aiDropped=0",
  'e101=ship;CLASS_NEUTRAL;"viper";owner:0;spawn:3;r:35.000000;speed:12.500000;p:100.000000,0.000000,30.000000;q:1.000000,0.000000,0.000000,0.000000;rng:658377868,53225510;nav:IDLE,0,100.000000,0.000000,30.000000,0.000000,12.500000;ai:none;repairs:0;en:200.000000,200.000000,1.000000;steer:rate:0.000000,0.000000,0.000000,0.000000,acc:-100.000000,fr:0.000000,0.000000,po:0,jk:0.000000,0.000000,0.000000,pa:0,es:0,t0,sv:z,ep:0;vel:1.500000,0.000000,-2.000000;cargo:3',
  'e102=ship;CLASS_NEUTRAL;"viper";owner:0;spawn:3;r:35.000000;speed:12.500000;p:200.000000,-20.000000,30.000000;q:1.000000,0.000000,0.000000,0.000000;rng:2846077771,1691758949;nav:IDLE,0,200.000000,-20.000000,30.000000,0.000000,12.500000;ai:none;repairs:0;en:200.000000,200.000000,1.000000;steer:rate:0.000000,0.000000,0.000000,0.000000,acc:-100.000000,fr:0.000000,0.000000,po:0,jk:0.000000,0.000000,0.000000,pa:0,es:0,t0,sv:z,ep:0',
].join("\n");

/** The segments of one entity line (the steering segment holds no `;`). */
function segmentsOf(line: string): string[] {
  return line.split(";");
}

/** `line` with the segment labelled `label` removed. */
function strip(line: string, label: string): string {
  return segmentsOf(line)
    .filter((segment) => !segment.startsWith(`${label}:`))
    .join(";");
}

interface FieldCase {
  readonly name: string;
  readonly label: SegmentLabel;
  /** Set the field away from pristine. */
  readonly apply: (entity: Entity) => void;
  /** The exact text of the one segment it must print. */
  readonly segment: string;
}

const FIELD_CASES: readonly FieldCase[] = [
  {
    name: "bounty 50",
    label: "bty",
    apply: (e) => {
      e.bounty = 50;
    },
    segment: "bty:50",
  },
];

describe("a v5 world that sets no new field hashes as v4 did (FOUND-20)", () => {
  it("prints the captured pristine section", () => {
    expect(serializeWorldSection(twoShipWorld())).toBe(PRISTINE_SECTION);
  });

  it("keeps the epoch 1 inert Lave world's hashWorld FNV at c5949d60", () => {
    expect(hashWorld(initFlightState(layout), laveInertWorld(1))).toBe(
      "c5949d60",
    );
  });

  it("prints no v5 segment label for a pristine entity", () => {
    const world = twoShipWorld();
    for (const entity of world.store.live) {
      const labels = segmentsOf(serializeEntity(entity)).map((segment) =>
        segment.slice(0, segment.indexOf(":")),
      );
      for (const label of V5_ORDER) expect(labels).not.toContain(label);
    }
  });
});

describe("each v5 field alone prints exactly its segment (strip-and-rehash)", () => {
  it.each(FIELD_CASES.map((c) => [c.name, c] as const))(
    "%s",
    (_name, fieldCase) => {
      const pristine = twoShipWorld();
      const world = twoShipWorld();
      const target = world.store.live[1] as Entity;
      const pristineLine = serializeEntity(pristine.store.live[1] as Entity);
      fieldCase.apply(target);
      const line = serializeEntity(target);
      const printed = segmentsOf(line).filter((segment) =>
        V5_ORDER.some((label) => segment.startsWith(`${label}:`)),
      );
      expect(printed).toEqual([fieldCase.segment]);
      // The segment is the last one: it follows `cargo:` or the v4 segments.
      expect(segmentsOf(line).at(-1)).toBe(fieldCase.segment);
      // Strip and rehash: deleting the segment reproduces the pristine text.
      expect(strip(line, fieldCase.label)).toBe(pristineLine);
      expect(fnv1a32(strip(line, fieldCase.label))).toBe(fnv1a32(pristineLine));
      // The world hash moves, and only because of that one entity.
      expect(hashWorld(initFlightState(layout), world)).not.toBe(
        hashWorld(initFlightState(layout), pristine),
      );
    },
  );

  it("prints a segment after `cargo:` when the ship carries cargo", () => {
    const world = twoShipWorld();
    const first = world.store.live[0] as Entity;
    first.bounty = 7;
    const parts = segmentsOf(serializeEntity(first));
    expect(parts.slice(-2)).toEqual(["cargo:3", "bty:7"]);
  });
});
