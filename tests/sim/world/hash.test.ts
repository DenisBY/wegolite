// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The composed world hash (FOUND-11, FOUND-12, D-06, D-07, D-08).
 *
 * The tracer proof of plan 08-05: a world that has never spawned anything
 * hashes exactly like the v1 flight hash on every sample of the three recorded
 * flights and the pinned goldens; a populated world appends its section; the
 * five static entities are layout references that never reach the hash; the
 * entity line is injective over the fields it prints.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AiComponent, ParamValue } from "../../../src/sim/ai/types.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { hashFlight } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { rngNext, worldSeedFor } from "../../../src/sim/rng.js";
import {
  BEHAVIOUR_IDS,
  BODY_KINDS,
  ENTITY_KINDS,
  FIRST_DYNAMIC_ID,
  LAST_RESERVED_STATIC_ID,
  MAIN_STATION_ID,
  MAX_ENTITIES,
  NO_ENTITY,
  PLANET_ID,
  PLAYER_ID,
  SCAN_CLASSES,
  STATION_NAV_BUOY_ID,
  STATIC_BODY_IDS,
  SUN_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import {
  entityHashes,
  hashWorld,
  serializeEntity,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import {
  commitWorld,
  createWorld,
  isNeverSpawned,
  killEntity,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import {
  RECORDED_FLIGHT_NAMES,
  replayRecordedFlight,
} from "../../helpers/recorded-flights.js";
import { LAVE_SYSTEM_ID, laveFixture } from "../../helpers/lave.js";

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

const OOLITE_SRC = process.env.OOLITE_SRC ?? "";

function init(overrides: Partial<SpawnInit> = {}): SpawnInit {
  return {
    kind: "ship",
    specKey: "viper",
    scanClass: "CLASS_POLICE",
    position: vec(100, 200, 300),
    orientation: identity(),
    radius: 50,
    speed: 10,
    ...overrides,
  };
}

/** A copy of the first sample of the launch-and-fly recorded flight. */
function firstFlightState(): FlightState {
  const holder: { state?: FlightState } = {};
  replayRecordedFlight("launch-and-fly", (sample) => {
    holder.state ??= structuredClone(sample.state);
  });
  if (holder.state === undefined) throw new Error("no sample");
  return holder.state;
}

function aiWith(params: Record<string, ParamValue>): AiComponent {
  return { aiKey: "test-pilot", params, wakeTick: 0, nextThinkTick: 0 };
}

/** The text of one entity spawned alone into a fresh world of seed 7. */
function textOf(overrides: Partial<SpawnInit>): string {
  const world = createWorld(7);
  const result = spawnEntity(world, init(overrides), 0);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return serializeEntity(result.entity);
}

function hashOf(overrides: Partial<SpawnInit>): string {
  const world = createWorld(7);
  const result = spawnEntity(world, init(overrides), 0);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return entityHashes(world)[0]?.[1] ?? "";
}

describe("empty-world hash identity (D-08)", () => {
  it("equals hashFlight and the pinned golden on every recorded sample", () => {
    const marketSeed = marketSeedForSystem(LAVE_SYSTEM_ID);
    const worlds = [
      createWorld(1234),
      createWorld(worldSeedFor(marketSeed, 0)),
      createWorld(worldSeedFor(marketSeed, 1)),
      createWorld(worldSeedFor(marketSeed, 2)),
    ];
    for (const world of worlds) expect(isNeverSpawned(world)).toBe(true);

    let compared = 0;
    for (const name of RECORDED_FLIGHT_NAMES) {
      const rows = golden.flights[name] ?? [];
      let index = 0;
      replayRecordedFlight(name, (sample) => {
        const row = rows[index];
        index += 1;
        const flightHash = hashFlight(sample.state);
        expect(row?.tick).toBe(sample.tick);
        expect(row?.hash).toBe(flightHash);
        expect(hashWorld(sample.state, undefined)).toBe(flightHash);
        for (const world of worlds) {
          expect(hashWorld(sample.state, world)).toBe(flightHash);
        }
        compared += 1;
      });
      expect(index).toBe(rows.length);
    }
    expect(compared).toBeGreaterThan(50);
  });

  it("a world with one spawned entity hashes differently and lists no static id", () => {
    const world = createWorld(1234);
    const result = spawnEntity(world, init(), 3);
    expect(result.ok && result.entity.id).toBe(FIRST_DYNAMIC_ID);
    const state = firstFlightState();
    expect(hashWorld(state, world)).not.toBe(hashFlight(state));
    const section = serializeWorldSection(world);
    expect(section.startsWith("worldSeed=1234\nnextId=102\nrng=")).toBe(true);
    for (const id of STATIC_BODY_IDS) {
      expect(section).not.toMatch(new RegExp(`^e${id}=`, "m"));
    }
    expect(section).toMatch(/^e101=/m);
  });

  it("a world that spawned, killed and committed is no longer never-spawned", () => {
    const world = createWorld(1234);
    const result = spawnEntity(world, init(), 0);
    expect(killEntity(world, result.ok ? result.entity.id : NO_ENTITY)).toBe(
      true,
    );
    expect(commitWorld(world)).toEqual([FIRST_DYNAMIC_ID]);
    expect(world.store.live).toHaveLength(0);
    expect(isNeverSpawned(world)).toBe(false);
    const state = firstFlightState();
    expect(hashWorld(state, world)).not.toBe(hashFlight(state));
    expect(serializeWorldSection(world)).toBe(
      `worldSeed=1234\nnextId=102\nrng=${world.rng.s}\naiDropped=0`,
    );
  });

  it("a drawn world.rng also flips the predicate", () => {
    const world = createWorld(55);
    expect(isNeverSpawned(world)).toBe(true);
    rngNext(world.rng);
    expect(isNeverSpawned(world)).toBe(false);
  });

  it("entityHashes lists no id below FIRST_DYNAMIC_ID", () => {
    const world = createWorld(9);
    expect(spawnEntity(world, init(), 0).ok).toBe(true);
    expect(spawnEntity(world, init({ specKey: "other" }), 0).ok).toBe(true);
    const ids = entityHashes(world).map(([id]) => id);
    expect(ids).toEqual([101, 102]);
    expect(ids.every((id) => id >= FIRST_DYNAMIC_ID)).toBe(true);
  });

  it("serializeEntity throws on a non-finite field (canon's contract)", () => {
    const world = createWorld(9);
    const result = spawnEntity(world, init(), 0);
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    const entity = result.entity;
    entity.position = { x: Number.NaN, y: 0, z: 0 };
    expect(() => serializeEntity(entity)).toThrow(/non-finite/);
  });
});

describe("pristine-omit of the v4 entity fields (FOUND-18, D-09)", () => {
  /** A fresh spawn, mutated by `change`; its line and the pristine line. */
  function lines(change: (entity: Entity) => void): {
    pristine: string;
    changed: string;
  } {
    const world = createWorld(7);
    const result = spawnEntity(world, init(), 0);
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    const pristine = serializeEntity(result.entity);
    change(result.entity);
    return { pristine, changed: serializeEntity(result.entity) };
  }

  it("a fresh spawn's line ends with its steer segment and holds no v4 segment", () => {
    const { pristine } = lines(() => undefined);
    expect(pristine).toMatch(/;steer:[^;\n]*$/);
    for (const label of [";vel:", ";wpn:", ";cargo:"]) {
      expect(pristine).not.toContain(label);
    }
  });

  it("each field alone appends exactly its one segment after the steer segment", () => {
    const vel = lines((e) => {
      e.velocity = vec(1.5, 0, -2);
    });
    expect(vel.changed).toBe(`${vel.pristine};vel:1.500000,0.000000,-2.000000`);
    const wpn = lines((e) => {
      e.weapon = { temperature: 2.5, lastShotTick: 9, missedShots: 3 };
    });
    expect(wpn.changed).toBe(`${wpn.pristine};wpn:2.500000,9,3`);
    const cargo = lines((e) => {
      e.cargo = 4;
    });
    expect(cargo.changed).toBe(`${cargo.pristine};cargo:4`);
  });

  it("all three together append in the order vel, wpn, cargo", () => {
    const { pristine, changed } = lines((e) => {
      e.velocity = vec(0, 1, 0);
      e.weapon = { temperature: 1, lastShotTick: 2, missedShots: 3 };
      e.cargo = 5;
    });
    expect(changed).toBe(
      `${pristine};vel:0.000000,1.000000,0.000000;wpn:1.000000,2,3;cargo:5`,
    );
    expect(changed.replace(/;(?:vel|wpn|cargo):[^;\n]*/g, "")).toBe(pristine);
  });

  it.each([
    [
      "temperature alone",
      { temperature: 0.5, lastShotTick: 0, missedShots: 0 },
    ],
    ["lastShotTick alone", { temperature: 0, lastShotTick: 1, missedShots: 0 }],
    ["missedShots alone", { temperature: 0, lastShotTick: 0, missedShots: 1 }],
  ])("a weapon record with %s still prints ;wpn:", (_name, weapon) => {
    const { pristine, changed } = lines((e) => {
      e.weapon = { ...weapon };
    });
    expect(changed).toContain(";wpn:");
    expect(changed).not.toBe(pristine);
    expect(changed.replace(/;wpn:[^;\n]*/g, "")).toBe(pristine);
  });

  it("a single non-zero velocity component or a single cargo capsule prints its segment", () => {
    for (const velocity of [vec(1, 0, 0), vec(0, 1, 0), vec(0, 0, 1)]) {
      const { pristine, changed } = lines((e) => {
        e.velocity = velocity;
      });
      expect(changed).not.toBe(pristine);
      expect(changed).toContain(";vel:");
    }
    expect(
      lines((e) => {
        e.cargo = 1;
      }).changed,
    ).toContain(";cargo:1");
  });
});

describe("fixed ids and static entities (D-06, D-07)", () => {
  it("pins the id table", () => {
    expect([
      NO_ENTITY,
      PLANET_ID,
      SUN_ID,
      MAIN_STATION_ID,
      WITCHPOINT_BUOY_ID,
      STATION_NAV_BUOY_ID,
      LAST_RESERVED_STATIC_ID,
      PLAYER_ID,
      FIRST_DYNAMIC_ID,
      MAX_ENTITIES,
    ]).toEqual([0, 1, 2, 3, 4, 5, 99, 100, 101, 256]);
    expect([...STATIC_BODY_IDS]).toEqual([1, 2, 3, 4, 5]);
    expect(BODY_KINDS).toContain("player");
    expect(ENTITY_KINDS).toEqual([
      "ship",
      "station",
      "cargo",
      "missile",
      "wreckage",
    ]);
  });

  it("createWorld holds five layout references and no copied geometry", () => {
    const { layout } = laveFixture();
    const { statics } = createWorld(1);
    expect(statics.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(statics.map((s) => s.kind)).toEqual([
      "planet",
      "sun",
      "station",
      "buoy",
      "buoy",
    ]);
    expect(statics.map((s) => s.layoutKey)).toEqual([
      "planet",
      "sun",
      "station",
      "witchpoint",
      "navBuoy",
    ]);
    for (const record of statics) {
      expect(Object.keys(record).sort()).toEqual([
        "id",
        "kind",
        "layoutKey",
        "scanClass",
      ]);
    }
    const layoutBodies = {
      planet: layout.planet,
      sun: layout.sun,
      station: layout.station,
      witchpoint: layout.witchpoint,
      navBuoy: layout.navBuoy,
    };
    for (const record of statics) {
      expect(layout[record.layoutKey]).toBe(layoutBodies[record.layoutKey]);
      expect(typeof layout[record.layoutKey].radius).toBe("number");
    }
  });
});

describe("closed vocabularies", () => {
  it("pins length and the first and last entries", () => {
    expect(BEHAVIOUR_IDS).toHaveLength(39);
    expect(new Set(BEHAVIOUR_IDS).size).toBe(39);
    expect(BEHAVIOUR_IDS[0]).toBe("IDLE");
    expect(BEHAVIOUR_IDS[BEHAVIOUR_IDS.length - 1]).toBe("SCRIPTED_ATTACK_AI");
    expect(SCAN_CLASSES).toHaveLength(16);
    expect(new Set(SCAN_CLASSES).size).toBe(16);
    expect(SCAN_CLASSES[0]).toBe("CLASS_NOT_SET");
    expect(SCAN_CLASSES[SCAN_CLASSES.length - 1]).toBe("CLASS_MILITARY");
  });

  it.skipIf(OOLITE_SRC === "")(
    "equals the ENTRY names of the Oolite tables in table order (OOLITE_SRC)",
    () => {
      const entries = (file: string): string[] =>
        [
          ...readFileSync(
            join(OOLITE_SRC, "src/Core/Tables", file),
            "utf8",
          ).matchAll(/^ENTRY\(\s*(\w+)\s*,/gm),
        ].map((match) => match[1] as string);
      expect(
        entries("OOBehaviour.tbl").map((name) =>
          name.replace(/^BEHAVIOUR_/, ""),
        ),
      ).toEqual([...BEHAVIOUR_IDS]);
      expect(entries("OOScanClass.tbl")).toEqual([...SCAN_CLASSES]);
    },
  );
});

describe("entity hash line injectivity", () => {
  it('separates the number 1, the string "1" and the boolean true', () => {
    const one = textOf({ ai: aiWith({ k: 1 }) });
    const stringOne = textOf({ ai: aiWith({ k: "1" }) });
    const yes = textOf({ ai: aiWith({ k: true }) });
    const yesString = textOf({ ai: aiWith({ k: "true" }) });
    const nothing = textOf({ ai: aiWith({ k: null }) });
    const nothingString = textOf({ ai: aiWith({ k: "null" }) });
    const texts = [one, stringOne, yes, yesString, nothing, nothingString];
    expect(new Set(texts).size).toBe(texts.length);
    const hashes = [
      hashOf({ ai: aiWith({ k: 1 }) }),
      hashOf({ ai: aiWith({ k: "1" }) }),
      hashOf({ ai: aiWith({ k: true }) }),
      hashOf({ ai: aiWith({ k: "true" }) }),
      hashOf({ ai: aiWith({ k: null }) }),
      hashOf({ ai: aiWith({ k: "null" }) }),
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("tags array elements and orders params by code unit", () => {
    expect(textOf({ ai: aiWith({ k: [1, "1"] }) })).toContain(
      '"k":a[n:1.000000,s:"1"]',
    );
    const ab = textOf({ ai: aiWith({ a: 1, b: 2 }) });
    const ba = textOf({ ai: aiWith({ b: 2, a: 1 }) });
    expect(ab).toBe(ba);
    expect(ab.indexOf('"a"')).toBeLessThan(ab.indexOf('"b"'));
  });

  it("serialises a specKey holding a newline, = and a forged line as one line", () => {
    const text = textOf({ specKey: "x\ne101=ship\n=" });
    expect(text.includes("\n")).toBe(false);
    expect(text.startsWith("e101=ship;")).toBe(true);
    expect(text).toContain('"x\\ne101=ship\\n="');
  });

  it("is ASCII and separates specKeys that share a low byte", () => {
    const a = textOf({ specKey: "A" });
    const ell = textOf({ specKey: "Ł" });
    expect(ell).toContain('"\\u0141"');
    // eslint-disable-next-line no-control-regex
    expect(ell).toMatch(/^[\x00-\x7e]*$/);
    expect(hashOf({ specKey: "A" })).not.toBe(hashOf({ specKey: "Ł" }));
    expect(a).not.toBe(ell);
  });
});
