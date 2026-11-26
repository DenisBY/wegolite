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

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { initFlightState } from "../../../src/sim/flight/state.js";
import { fnv1a32 } from "../../../src/sim/hash.js";
import { identity, vec } from "../../../src/sim/math.js";
import { CARGO_KINDS } from "../../../src/sim/world/entity.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import { sanitizeEntity } from "../../../src/sim/world/sanitize.js";
import {
  entityHashes,
  hashWorld,
  serializeEntity,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import {
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
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
  {
    name: "role trader",
    label: "role",
    apply: (e) => {
      e.role = "trader";
    },
    segment: 'role:"trader"',
  },
  {
    name: "groupId 101",
    label: "grp",
    apply: (e) => {
      e.groupId = 101;
    },
    segment: "grp:101",
  },
  {
    name: "cargoKind 4",
    label: "ck",
    apply: (e) => {
      e.cargoKind = 4;
    },
    segment: "ck:4",
  },
  {
    name: "pod food 3",
    label: "pod",
    apply: (e) => {
      e.podCommodity = "food";
      e.podAmount = 3;
    },
    segment: 'pod:"food",3',
  },
  {
    name: "pod with an empty commodity and amount 3 still prints",
    label: "pod",
    apply: (e) => {
      e.podAmount = 3;
    },
    segment: 'pod:"",3',
  },
  {
    name: "pod with a commodity and amount 0 still prints",
    label: "pod",
    apply: (e) => {
      e.podCommodity = "food";
    },
    segment: 'pod:"food",0',
  },
  {
    name: "fuel 7",
    label: "fuel",
    apply: (e) => {
      e.fuel = 7;
    },
    segment: "fuel:7",
  },
  {
    name: "homeSystem 7 with destinationSystem unset",
    label: "sys",
    apply: (e) => {
      e.homeSystem = 7;
    },
    segment: "sys:7,-1",
  },
  {
    name: "destinationSystem 0 with homeSystem unset",
    label: "sys",
    apply: (e) => {
      e.destinationSystem = 0;
    },
    segment: "sys:-1,0",
  },
  {
    name: "injector with a full accumulator",
    label: "inj",
    apply: (e) => {
      e.injector = { accumulator: 1 };
    },
    segment: "inj:1.000000",
  },
  {
    name: "injector with an empty accumulator still prints",
    label: "inj",
    apply: (e) => {
      e.injector = { accumulator: 0 };
    },
    segment: "inj:0.000000",
  },
  {
    name: "aftTemperature 12.5",
    label: "wpf",
    apply: (e) => {
      e.weapon.aftTemperature = 12.5;
    },
    segment: "wpf:12.500000,0.000000,0.000000",
  },
  {
    name: "starboardTemperature 3",
    label: "wpf",
    apply: (e) => {
      e.weapon.starboardTemperature = 3;
    },
    segment: "wpf:0.000000,0.000000,3.000000",
  },
  {
    name: "weaponTypes.aft a beam laser",
    label: "wty",
    apply: (e) => {
      e.weaponTypes.aft = "EQ_WEAPON_BEAM_LASER";
    },
    segment: 'wty:z,"EQ_WEAPON_BEAM_LASER",z,z',
  },
  {
    name: "weaponTypes.aft explicitly none is not null",
    label: "wty",
    apply: (e) => {
      e.weaponTypes.aft = "EQ_WEAPON_NONE";
    },
    segment: 'wty:z,"EQ_WEAPON_NONE",z,z',
  },
  {
    name: "markedForFines",
    label: "fine",
    apply: (e) => {
      e.markedForFines = true;
    },
    segment: "fine:1",
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

describe("two or more fields print in the fixed order, whatever the assignment order", () => {
  it("prints the labels in V5_ORDER after cargo:", () => {
    // One case per label (the cases of one label overwrite each other).
    const cases = V5_ORDER.flatMap((label) => {
      const first = FIELD_CASES.find((c) => c.label === label);
      return first === undefined ? [] : [first];
    });
    const present = cases.map((c) => c.label);
    // Assign in reverse table order, then in table order: the text is equal.
    const reversed = twoShipWorld();
    const forward = twoShipWorld();
    const a = reversed.store.live[1] as Entity;
    const b = forward.store.live[1] as Entity;
    for (const c of [...cases].reverse()) c.apply(a);
    for (const c of cases) c.apply(b);
    expect(serializeEntity(a)).toBe(serializeEntity(b));
    const printed = segmentsOf(serializeEntity(a))
      .map((segment) => segment.slice(0, segment.indexOf(":")))
      .filter((label) => (V5_ORDER as readonly string[]).includes(label));
    expect(present).toHaveLength(V5_ORDER.length);
    expect(printed).toEqual([...V5_ORDER]);
    // The first printed v5 segment follows the last v4 one.
    const parts = segmentsOf(serializeEntity(a));
    const first = parts.findIndex((segment) => segment.startsWith("bty:"));
    expect(parts[first - 1]).toMatch(/^steer:/);
  });

  it("strips every v5 segment back to the pristine line", () => {
    const pristine = twoShipWorld();
    const world = twoShipWorld();
    const target = world.store.live[1] as Entity;
    for (const c of FIELD_CASES) c.apply(target);
    // Every label printed at once, then every label stripped.
    let line = serializeEntity(target);
    for (const label of V5_ORDER) line = strip(line, label);
    expect(line).toBe(serializeEntity(pristine.store.live[1] as Entity));
  });
});

describe("the weapon segments (FOUND-20)", () => {
  it("leaves the existing wpn: segment alone for a forward-only ship", () => {
    const world = twoShipWorld();
    const target = world.store.live[1] as Entity;
    target.weapon.temperature = 2.5;
    target.weapon.lastShotTick = 9;
    const parts = segmentsOf(serializeEntity(target));
    expect(parts.at(-1)).toBe("wpn:2.500000,9,0");
    expect(parts.some((segment) => segment.startsWith("wpf:"))).toBe(false);
  });

  it("prints a per-facing temperature in wpf: and never in wpn:", () => {
    const world = twoShipWorld();
    const target = world.store.live[1] as Entity;
    target.weapon.portTemperature = 7;
    const parts = segmentsOf(serializeEntity(target));
    expect(parts.some((segment) => segment.startsWith("wpn:"))).toBe(false);
    expect(parts.at(-1)).toBe("wpf:0.000000,7.000000,0.000000");
  });

  it("orders wpn: before the v5 segments and wpf: before wty:", () => {
    const world = twoShipWorld();
    const target = world.store.live[1] as Entity;
    target.weaponTypes.fore = "EQ_WEAPON_PULSE_LASER";
    target.weapon.aftTemperature = 1;
    target.weapon.temperature = 1;
    target.markedForFines = true;
    const labels = segmentsOf(serializeEntity(target)).map((segment) =>
      segment.slice(0, segment.indexOf(":")),
    );
    expect(labels.slice(-4)).toEqual(["wpn", "wpf", "wty", "fine"]);
  });

  it("keeps null and EQ_WEAPON_NONE apart in the hash", () => {
    const a = twoShipWorld();
    const b = twoShipWorld();
    (a.store.live[1] as Entity).weaponTypes.aft = null;
    (b.store.live[1] as Entity).weaponTypes.aft = "EQ_WEAPON_NONE";
    expect(hashWorld(initFlightState(layout), a)).not.toBe(
      hashWorld(initFlightState(layout), b),
    );
  });
});

describe("CARGO_KINDS (FOUND-20)", () => {
  it("is the frozen, append-only index of Oolite's cargo flags", () => {
    expect([...CARGO_KINDS]).toEqual([
      "unset",
      "plentiful",
      "scarce",
      "medical",
      "contraband",
      "pirate",
      "uniform",
    ]);
    expect(Object.isFrozen(CARGO_KINDS)).toBe(true);
  });

  it("maps the setCargoType names of OOJSShip.m:2924-2930 to indices 1 to 5", () => {
    const byName: Readonly<Record<string, number>> = {
      PLENTIFUL_GOODS: CARGO_KINDS.indexOf("plentiful"),
      SCARCE_GOODS: CARGO_KINDS.indexOf("scarce"),
      MEDICAL_GOODS: CARGO_KINDS.indexOf("medical"),
      ILLEGAL_GOODS: CARGO_KINDS.indexOf("contraband"),
      PIRATE_GOODS: CARGO_KINDS.indexOf("pirate"),
    };
    expect(byName).toEqual({
      PLENTIFUL_GOODS: 1,
      SCARCE_GOODS: 2,
      MEDICAL_GOODS: 3,
      ILLEGAL_GOODS: 4,
      PIRATE_GOODS: 5,
    });
    // OOCargoFlag 510 (FULL_UNIFORM) has no setCargoType name and is index 6.
    expect(CARGO_KINDS.indexOf("uniform")).toBe(6);
  });
});

describe("a fast-check property over random v5 entities", () => {
  const roleArb = fc.stringMatching(/^[a-z0-9-]{0,32}$/);
  const keyArb = fc.stringMatching(/^[a-z0-9_]{0,64}$/);
  const weaponTypeArb = fc.oneof(
    fc.constant(null),
    fc.stringMatching(/^EQ_WEAPON_[A-Z0-9_]{1,22}$/),
  );
  const entityArb = fc.record({
    bounty: fc.integer({ min: 0, max: 65535 }),
    role: roleArb,
    groupId: fc.oneof(
      fc.constant(0),
      fc.integer({ min: 101, max: 0xffffffff }),
    ),
    cargoKind: fc.integer({ min: 0, max: 6 }),
    podCommodity: keyArb,
    podAmount: fc.integer({ min: 0, max: 255 }),
    fuel: fc.integer({ min: 0, max: 65535 }),
    homeSystem: fc.integer({ min: -1, max: 255 }),
    destinationSystem: fc.integer({ min: -1, max: 255 }),
    injector: fc.oneof(
      fc.constant(null),
      fc.record({ accumulator: fc.double({ min: 0, max: 1, noNaN: true }) }),
    ),
    weaponTypes: fc.record({
      fore: weaponTypeArb,
      aft: weaponTypeArb,
      port: weaponTypeArb,
      starboard: weaponTypeArb,
    }),
    markedForFines: fc.boolean(),
  });

  it("round-trips through snapshot and parse, and sanitize repairs nothing", () => {
    fc.assert(
      fc.property(
        fc.array(entityArb, { minLength: 1, maxLength: 4 }),
        (specs) => {
          const world = createWorld(7);
          specs.forEach((spec, index) => {
            const result = spawnEntity(world, shipInit(index, spec), 0);
            if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
          });
          const text = JSON.stringify(snapshotWorld(world));
          const restored = restoreWorld(
            parseWorldSnapshot(JSON.parse(text) as unknown),
          );
          expect(entityHashes(restored)).toEqual(entityHashes(world));
          expect(JSON.stringify(snapshotWorld(restored))).toBe(text);
          for (const entity of world.store.live) {
            expect(sanitizeEntity(entity)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("makes sanitize idempotent over corrupt v5 values: a second call repairs nothing", () => {
    const junkNumber = fc.oneof(
      fc.constant(Number.NaN),
      fc.constant(Number.POSITIVE_INFINITY),
      fc.constant(-0),
      fc.integer({ min: -3, max: 70000 }),
      fc.double({ noNaN: false }),
    );
    const junkText = fc.oneof(fc.string({ maxLength: 80 }), fc.constant(""));
    fc.assert(
      fc.property(
        fc.record({
          bounty: junkNumber,
          role: junkText,
          groupId: junkNumber,
          cargoKind: junkNumber,
          podCommodity: junkText,
          podAmount: junkNumber,
          fuel: junkNumber,
          homeSystem: junkNumber,
          destinationSystem: junkNumber,
          injector: fc.oneof(
            fc.constant(null),
            fc.record({ accumulator: junkNumber }),
            fc.constant(5),
          ),
          weaponTypes: fc.oneof(
            fc.record({
              fore: fc.oneof(fc.constant(null), junkText),
              aft: fc.oneof(fc.constant(null), junkText),
              port: fc.oneof(fc.constant(null), junkText),
              starboard: fc.oneof(fc.constant(null), junkText),
            }),
            fc.constant(null),
          ),
          markedForFines: fc.oneof(fc.boolean(), fc.constant(1)),
        }),
        (junk) => {
          const world = createWorld(7);
          const result = spawnEntity(world, shipInit(0), 0);
          if (!result.ok) throw new Error("spawn refused");
          Object.assign(result.entity, junk);
          const w = result.entity.weapon;
          w.aftTemperature = junk.destinationSystem;
          w.portTemperature = junk.fuel;
          w.starboardTemperature = junk.podAmount;
          sanitizeEntity(result.entity);
          expect(sanitizeEntity(result.entity)).toBe(false);
          // The repaired entity hashes (canon never throws) and snapshots.
          expect(() => serializeEntity(result.entity)).not.toThrow();
          expect(() => snapshotWorld(world)).not.toThrow();
        },
      ),
      { numRuns: 300 },
    );
  });
});
