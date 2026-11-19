// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The snapshot codec as a boundary (FOUND-12, T-08-24, T-08-25, T-08-55,
 * T-08-56): the parser's rejection table, the acceptance rows, the three
 * `snapshotWorld` refusals, the anti-alias checks, the field coverage table
 * that keeps the hash and the codec in agreement, and a property that keeps the
 * sanitizer and the parser in agreement. Expected reasons and values come from
 * the rules in `limits.ts` and `snapshot.ts`, never from running the code
 * under test.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { AiComponent, ParamValue } from "../../../src/sim/ai/types.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { hashFlight, initFlightState } from "../../../src/sim/flight/state.js";
import { identity, normalize, quat, vec } from "../../../src/sim/math.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import {
  BEHAVIOUR_IDS,
  ENTITY_KINDS,
  MAX_ENTITIES,
  SCAN_CLASSES,
} from "../../../src/sim/world/ids.js";
import {
  MAX_ENERGY_RECHARGE_RATE,
  MAX_AI_PARAMS_KEYS,
  MAX_ENTITY_CARGO,
  MAX_ENTITY_ENERGY,
  MAX_ENTITY_MAGNITUDE,
  MAX_ENTITY_VELOCITY,
  MAX_ESCORT_SLOT,
  MAX_FRUSTRATION,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_STEER_RATE,
  MAX_UINT32,
  BUOY_MAX_ENERGY,
  MAX_WEAPON_TEMPERATURE,
  STATION_MAX_ENERGY,
  BUOY_SUBENTITY_MAX_ENERGY,
  MAX_BUOY_OFFSET,
} from "../../../src/sim/world/limits.js";
import { sanitizeEntity } from "../../../src/sim/world/sanitize.js";
import {
  entityHashes,
  hashWorld,
  serializeWorldSection,
} from "../../../src/sim/world/serialize.js";
import {
  SnapshotError,
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import type {
  EntitySnapshot,
  SnapshotErrorReason,
  WorldSnapshot,
} from "../../../src/sim/world/snapshot.js";
import {
  commitWorld,
  createBuoyStates,
  createWorld,
  isNeverSpawned,
  isPristineBuoyStates,
  killEntity,
  postAiEvent,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

type Plain = Record<string, unknown>;

/** Loose write access to a field the types protect (the corrupt-input tests). */
const loose = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Fixtures

function shipInit(index: number, ai: AiComponent | null): SpawnInit {
  return {
    kind: "ship",
    specKey: "viper",
    scanClass: "CLASS_NEUTRAL",
    position: vec(100 * (index + 1), -20 * index, 30),
    orientation: identity(),
    radius: 35,
    speed: 12.5,
    ai,
  };
}

function spawnOk(world: World, init: SpawnInit, tick = 0): Entity {
  const result = spawnEntity(world, init, tick);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  const entity = result.entity;
  return entity;
}

function aiOf(entity: Entity): AiComponent {
  if (entity.ai === null) throw new Error("entity has no AI");
  return entity.ai;
}

/**
 * Three entities (ids 101 to 103) with every kind of field set to a non-default
 * value, and a spawned-then-removed fourth (id 104), so `nextId` is 105.
 */
function richWorld(): World {
  const world = createWorld(0x1234abcd);
  const rich: AiComponent = {
    aiKey: "test-pilot",
    params: {
      flag: true,
      flagOff: false,
      nothing: null,
      label: "patrol",
      gain: 3.5,
      one: 1,
      list: [1, "a", 2.5],
    },
    wakeTick: 3,
    nextThinkTick: 9,
  };
  const a = spawnOk(world, shipInit(0, rich), 7);
  const b = spawnOk(world, shipInit(1, null), 8);
  const c = spawnOk(world, shipInit(2, createTestPilotAi(9)), 9);
  a.nav.behaviour = "FLY_TO_DESTINATION";
  a.nav.targetId = b.id;
  a.nav.destination = vec(5, 6, 7);
  a.nav.desiredRange = 500;
  a.nav.desiredSpeed = 75.25;
  a.repairs = 2;
  a.maxEnergy = 85;
  a.energy = 60.5;
  a.energyRechargeRate = 2.25;
  b.maxEnergy = 250;
  b.energy = 250;
  b.energyRechargeRate = 4;
  a.ownerId = 3;
  a.speed = 80.125;
  // Every group of the steering record away from its default (plan 14-08).
  a.steer.flightRoll = 0.75;
  a.steer.flightPitch = -0.5;
  a.steer.stickRoll = 1.25;
  a.steer.stickPitch = -1.5;
  a.steer.accuracy = 3.5;
  a.steer.frustration = 2.25;
  a.steer.successFactor = -0.125;
  a.steer.pitchingOver = true;
  a.steer.jink = vec(0.5, -0.25, 0);
  a.steer.proximityAlert = b.id;
  a.steer.escortSlot = 3;
  // A curve started early in a world: negative ticks inside the signed domain.
  a.steer.trackingCount = 4;
  a.steer.trackingTicks = [10, -50, -110, -170];
  a.steer.trackingPositions = [
    vec(1, 2, 3),
    vec(-4, 5.5, 6),
    vec(7, 8, -9.25),
    vec(0, 0, 1e6),
  ];
  a.steer.saved = {
    behaviour: "FLY_TO_DESTINATION",
    targetId: c.id,
    desiredRange: 250.5,
    desiredSpeed: 40,
    destination: vec(10, -20, 30),
  };
  a.steer.entryPending = true;
  b.steer.accuracy = -2;
  b.steer.escortSlot = 15;
  b.orientation = quat(0.5, 0.5, 0.5, 0.5);
  c.position = vec(-42.5, 0.25, 1e6);
  // The v4 fields (Phase 15, FOUND-18) away from their pristine values.
  a.velocity = vec(1.5, -2.25, 0);
  a.weapon = { temperature: 12.5, lastShotTick: 6, missedShots: 2 };
  a.cargo = 7;
  const gone = spawnOk(world, shipInit(3, null), 10);
  killEntity(world, gone.id);
  commitWorld(world);
  return world;
}

/** The JSON text of a snapshot, parsed back: what the save path will see. */
function jsonOf(world: World): Plain {
  return JSON.parse(JSON.stringify(snapshotWorld(world))) as Plain;
}

function reasonOf(input: unknown): SnapshotErrorReason | "accepted" {
  try {
    parseWorldSnapshot(input);
    return "accepted";
  } catch (error) {
    if (error instanceof SnapshotError) return error.reason;
    throw error;
  }
}

function getAt(root: unknown, path: string): unknown {
  let node = root;
  if (path === "") return node;
  for (const key of path.split(".")) node = (node as Plain)[key];
  return node;
}

function setAt(root: unknown, path: string, value: unknown): void {
  const keys = path.split(".");
  const last = keys[keys.length - 1] as string;
  (getAt(root, keys.slice(0, -1).join(".")) as Plain)[last] = value;
}

/** An own `key` made by JSON.parse, the way a hostile save would carry it. */
function withOwnKey(target: unknown, key: string): void {
  const source = JSON.parse(`{"${key}": 1}`) as Plain;
  Object.defineProperty(
    target as object,
    key,
    Object.getOwnPropertyDescriptor(source, key) as PropertyDescriptor,
  );
}

function hashOf(world: World, id: number): string | undefined {
  return entityHashes(world).find(([entityId]) => entityId === id)?.[1];
}

type Mutator = (snapshot: Plain) => void;

const set =
  (path: string, value: unknown): Mutator =>
  (snapshot) => {
    setAt(snapshot, path, value);
  };

// ---------------------------------------------------------------------------
// The parser's rejection table

const E0 = "entities.0";
const NAV = `${E0}.nav`;
const AI = `${E0}.ai`;
const STEER = `${E0}.steer`;
const VEL = `${E0}.velocity`;
const WPN = `${E0}.weapon`;
const PARAMS = `${AI}.params`;

function manyEntities(count: number): Mutator {
  return (snapshot) => {
    const first = JSON.stringify(getAt(snapshot, E0));
    snapshot.entities = Array.from({ length: count }, (_, i) => {
      const entity = JSON.parse(first) as Plain;
      entity.id = 101 + i;
      return entity;
    });
    snapshot.nextId = 101 + count;
  };
}

const REJECTIONS: readonly (readonly [string, Mutator, SnapshotErrorReason])[] =
  [
    // The root and the format.
    ["a wrong format tag", set("format", "other"), "format"],
    // Version 1 lacks the energy bank (Phase 13, CBT-07): its shape is refused.
    ["version 1", set("version", 1), "version"],
    // Version 2 lacks the steering record (Phase 14, AI-01): its shape is refused.
    ["version 2", set("version", 2), "version"],
    // Version 3 lacks velocity, weapon, cargo and staticHealth (Phase 15, FOUND-18).
    ["version 3", set("version", 3), "version"],
    ["version 5", set("version", 5), "version"],
    ["worldSeed 1.5", set("worldSeed", 1.5), "world-seed"],
    ["worldSeed -1", set("worldSeed", -1), "world-seed"],
    ["worldSeed 2 ** 32", set("worldSeed", 2 ** 32), "world-seed"],
    ["worldSeed null (a NaN after JSON)", set("worldSeed", null), "world-seed"],
    ["nextId 2 ** 32 + 1", set("nextId", 2 ** 32 + 1), "next-id"],
    ["nextId 101.5", set("nextId", 101.5), "next-id"],
    ["nextId 2 ** 53 + 3", set("nextId", 2 ** 53 + 3), "next-id"],
    ["nextId 100", set("nextId", 100), "next-id"],
    ["nextId equal to the highest id", set("nextId", 103), "next-id"],
    ["entities missing", (s) => void delete s.entities, "entities"],
    ["entities not an array", set("entities", {}), "entities"],
    [
      "more than MAX_ENTITIES entities",
      manyEntities(MAX_ENTITIES + 1),
      "too-many-entities",
    ],
    ["world rng 2 ** 32", set("rng", 2 ** 32), "stream"],
    ["world rng -1", set("rng", -1), "stream"],
    ["aiDropped 2 ** 32", set("aiDropped", 2 ** 32), "counter"],
    ["aiDropped 1.5", set("aiDropped", 1.5), "counter"],
    ["an unknown root key", set("extra", 1), "unknown-key"],
    // The static health (Phase 15, FOUND-18, D-08). `asObject` refuses the
    // absent root key as not-object, and the parser does not check presence first.
    ["staticHealth missing", (s) => void delete s.staticHealth, "not-object"],
    ["staticHealth null", set("staticHealth", null), "not-object"],
    [
      "an unknown staticHealth key",
      set("staticHealth.extra", 1),
      "unknown-key",
    ],
    [
      "staticHealth.station over STATION_MAX_ENERGY",
      set("staticHealth.station", STATION_MAX_ENERGY + 1),
      "magnitude",
    ],
    [
      "staticHealth.witchpoint over BUOY_MAX_ENERGY",
      set("staticHealth.witchpoint", BUOY_MAX_ENERGY + 1),
      "magnitude",
    ],
    ["staticHealth.navBuoy -1", set("staticHealth.navBuoy", -1), "range"],
    [
      "staticHealth.witchpoint NaN",
      set("staticHealth.witchpoint", Number.NaN),
      "non-finite",
    ],
    [
      "staticHealth.station null (a NaN after JSON)",
      set("staticHealth.station", null),
      "non-finite",
    ],
    [
      "staticHealth.navBuoy as a string",
      set("staticHealth.navBuoy", "250"),
      "type",
    ],
    [
      "staticHealth.station missing",
      (s) => void delete (getAt(s, "staticHealth") as Plain).station,
      "type",
    ],
    // Entity ids.
    [
      "ids 102 then 101",
      (s) => {
        setAt(s, `${E0}.id`, 102);
        setAt(s, "entities.1.id", 101);
      },
      "entity-order",
    ],
    ["id 101 twice", set("entities.1.id", 101), "entity-order"],
    ["id 100", set(`${E0}.id`, 100), "entity-id"],
    ["id 101.5", set(`${E0}.id`, 101.5), "entity-id"],
    ["id 2 ** 53", set(`${E0}.id`, 2 ** 53), "entity-id"],
    ["id 2 ** 32", set(`${E0}.id`, 2 ** 32), "entity-id"],
    // Number slots.
    [
      "position.x null (a NaN after JSON)",
      set(`${E0}.position.x`, null),
      "non-finite",
    ],
    ["position.x NaN", set(`${E0}.position.x`, Number.NaN), "non-finite"],
    [
      "position.y Infinity",
      set(`${E0}.position.y`, Number.POSITIVE_INFINITY),
      "non-finite",
    ],
    ["position.x as a string", set(`${E0}.position.x`, "1"), "type"],
    ["position.x 1e308", set(`${E0}.position.x`, 1e308), "magnitude"],
    ["position.z -1e13", set(`${E0}.position.z`, -1e13), "magnitude"],
    ["radius null", set(`${E0}.radius`, null), "non-finite"],
    ["radius 1e308", set(`${E0}.radius`, 1e308), "magnitude"],
    ["radius 0", set(`${E0}.radius`, 0), "range"],
    ["radius -1", set(`${E0}.radius`, -1), "range"],
    ["speed -1", set(`${E0}.speed`, -1), "range"],
    ["nav.desiredSpeed -1", set(`${NAV}.desiredSpeed`, -1), "range"],
    ["nav.desiredRange -1", set(`${NAV}.desiredRange`, -1), "range"],
    ["nav.desiredRange 1e13", set(`${NAV}.desiredRange`, 1e13), "magnitude"],
    ["nav.destination.y null", set(`${NAV}.destination.y`, null), "non-finite"],
    ["nav.destination.x 1e13", set(`${NAV}.destination.x`, 1e13), "magnitude"],
    // Orientation.
    [
      "a zero quaternion",
      set(`${E0}.orientation`, { w: 0, x: 0, y: 0, z: 0 }),
      "quaternion",
    ],
    [
      "an underflowed quaternion",
      set(`${E0}.orientation`, { w: 1e-200, x: 1e-200, y: 1e-200, z: 1e-200 }),
      "quaternion",
    ],
    [
      "a subnormal quaternion w 1e-160",
      set(`${E0}.orientation`, { w: 1e-160, x: 0, y: 0, z: 0 }),
      "quaternion",
    ],
    [
      "a subnormal quaternion w 3e-161",
      set(`${E0}.orientation`, { w: 3e-161, x: 0, y: 0, z: 0 }),
      "quaternion",
    ],
    [
      "a non-unit quaternion",
      set(`${E0}.orientation`, { w: 2, x: 0, y: 0, z: 0 }),
      "quaternion",
    ],
    [
      "an overflowing quaternion",
      set(`${E0}.orientation`, { w: 1e200, x: 1e200, y: 0, z: 0 }),
      "quaternion",
    ],
    [
      "a quaternion component null",
      set(`${E0}.orientation.w`, null),
      "non-finite",
    ],
    // Counters, timers and streams.
    ["wakeTick -1", set(`${AI}.wakeTick`, -1), "counter"],
    ["wakeTick 1.5", set(`${AI}.wakeTick`, 1.5), "counter"],
    ["wakeTick 2 ** 32", set(`${AI}.wakeTick`, 2 ** 32), "counter"],
    ["nextThinkTick 2 ** 32", set(`${AI}.nextThinkTick`, 2 ** 32), "counter"],
    ["repairs 1e13", set(`${E0}.repairs`, 1e13), "counter"],
    ["repairs 2 ** 32", set(`${E0}.repairs`, 2 ** 32), "counter"],
    // The energy bank (CBT-07): strict keys, bounded limits.
    [
      "energy missing",
      (s) => void delete (getAt(s, E0) as Plain).energy,
      "type",
    ],
    [
      "maxEnergy missing",
      (s) => void delete (getAt(s, E0) as Plain).maxEnergy,
      "type",
    ],
    [
      "energyRechargeRate missing",
      (s) => void delete (getAt(s, E0) as Plain).energyRechargeRate,
      "type",
    ],
    ["energy null (a NaN after JSON)", set(`${E0}.energy`, null), "non-finite"],
    ["energy NaN", set(`${E0}.energy`, Number.NaN), "non-finite"],
    ["energy as a string", set(`${E0}.energy`, "60"), "type"],
    ["energy -1", set(`${E0}.energy`, -1), "range"],
    ["energy above its own maxEnergy", set(`${E0}.energy`, 85.5), "magnitude"],
    [
      "maxEnergy Infinity",
      set(`${E0}.maxEnergy`, Number.POSITIVE_INFINITY),
      "non-finite",
    ],
    ["maxEnergy -1", set(`${E0}.maxEnergy`, -1), "range"],
    [
      "maxEnergy over MAX_ENTITY_ENERGY",
      set(`${E0}.maxEnergy`, MAX_ENTITY_ENERGY + 1),
      "magnitude",
    ],
    [
      "energyRechargeRate null",
      set(`${E0}.energyRechargeRate`, null),
      "non-finite",
    ],
    ["energyRechargeRate -1", set(`${E0}.energyRechargeRate`, -1), "range"],
    [
      "energyRechargeRate over MAX_ENERGY_RECHARGE_RATE",
      set(`${E0}.energyRechargeRate`, MAX_ENERGY_RECHARGE_RATE + 1),
      "magnitude",
    ],
    // The steering record (AI-01, plan 14-08): strict keys, bounded limits, the
    // tracking curve's count and order.
    [
      "steer missing",
      (s) => void delete (getAt(s, E0) as Plain).steer,
      "not-object",
    ],
    ["steer null", set(STEER, null), "not-object"],
    ["an unknown steer key", set(`${STEER}.extra`, 1), "unknown-key"],
    [
      "flightRoll missing",
      (s) => void delete (getAt(s, STEER) as Plain).flightRoll,
      "type",
    ],
    [
      "flightRoll null (a NaN after JSON)",
      set(`${STEER}.flightRoll`, null),
      "non-finite",
    ],
    ["flightPitch NaN", set(`${STEER}.flightPitch`, Number.NaN), "non-finite"],
    ["stickRoll as a string", set(`${STEER}.stickRoll`, "1"), "type"],
    [
      "stickPitch over MAX_STEER_RATE",
      set(`${STEER}.stickPitch`, MAX_STEER_RATE + 1),
      "magnitude",
    ],
    [
      "flightRoll under -MAX_STEER_RATE",
      set(`${STEER}.flightRoll`, -MAX_STEER_RATE - 1),
      "magnitude",
    ],
    ["accuracy 11", set(`${STEER}.accuracy`, 11), "range"],
    ["accuracy -6", set(`${STEER}.accuracy`, -6), "range"],
    ["accuracy -99", set(`${STEER}.accuracy`, -99), "range"],
    ["accuracy null", set(`${STEER}.accuracy`, null), "non-finite"],
    ["frustration -1", set(`${STEER}.frustration`, -1), "range"],
    [
      "frustration over MAX_FRUSTRATION",
      set(`${STEER}.frustration`, MAX_FRUSTRATION + 1),
      "magnitude",
    ],
    [
      "successFactor over the magnitude cap",
      set(`${STEER}.successFactor`, MAX_ENTITY_MAGNITUDE * 10),
      "magnitude",
    ],
    ["pitchingOver 1", set(`${STEER}.pitchingOver`, 1), "type"],
    ["entryPending null", set(`${STEER}.entryPending`, null), "type"],
    ["jink.x null", set(`${STEER}.jink.x`, null), "non-finite"],
    ["an unknown jink key", set(`${STEER}.jink.extra`, 1), "unknown-key"],
    [
      "proximityAlert 2 ** 32",
      set(`${STEER}.proximityAlert`, 2 ** 32),
      "counter",
    ],
    ["proximityAlert -1", set(`${STEER}.proximityAlert`, -1), "counter"],
    ["escortSlot 16", set(`${STEER}.escortSlot`, MAX_ESCORT_SLOT + 1), "range"],
    ["escortSlot -1", set(`${STEER}.escortSlot`, -1), "range"],
    ["escortSlot 1.5", set(`${STEER}.escortSlot`, 1.5), "range"],
    ["escortSlot as a string", set(`${STEER}.escortSlot`, "3"), "type"],
    ["trackingCount 1", set(`${STEER}.trackingCount`, 1), "range"],
    ["trackingCount 2", set(`${STEER}.trackingCount`, 2), "range"],
    ["trackingCount 3", set(`${STEER}.trackingCount`, 3), "range"],
    ["trackingCount 5", set(`${STEER}.trackingCount`, 5), "range"],
    ["trackingCount -1", set(`${STEER}.trackingCount`, -1), "range"],
    ["trackingCount 4.5", set(`${STEER}.trackingCount`, 4.5), "range"],
    [
      "a tracking tick beyond the signed domain",
      set(`${STEER}.trackingTicks`, [10, -50, -110, -MAX_UINT32 - 1]),
      "magnitude",
    ],
    [
      "a tracking tick above the signed domain",
      set(`${STEER}.trackingTicks`, [MAX_UINT32 + 1, -50, -110, -170]),
      "magnitude",
    ],
    [
      "a non-integer tracking tick",
      set(`${STEER}.trackingTicks`, [10, -50.5, -110, -170]),
      "counter",
    ],
    [
      "a null tracking tick (a NaN after JSON)",
      set(`${STEER}.trackingTicks`, [10, null, -110, -170]),
      "non-finite",
    ],
    [
      "tracking ticks with only three samples",
      set(`${STEER}.trackingTicks`, [10, -50, -110]),
      "type",
    ],
    [
      "tracking ticks with five samples",
      set(`${STEER}.trackingTicks`, [10, -50, -110, -170, -230]),
      "type",
    ],
    ["tracking ticks not an array", set(`${STEER}.trackingTicks`, {}), "type"],
    [
      "a count of 4 with two equal ticks",
      set(`${STEER}.trackingTicks`, [10, -50, -50, -170]),
      "range",
    ],
    [
      "a count of 4 with increasing ticks",
      set(`${STEER}.trackingTicks`, [-170, -110, -50, 10]),
      "range",
    ],
    [
      "a count of 4 with all ticks equal",
      set(`${STEER}.trackingTicks`, [5, 5, 5, 5]),
      "range",
    ],
    [
      "a count of 0 with a stale tick",
      (s) => {
        setAt(s, `${STEER}.trackingCount`, 0);
      },
      "range",
    ],
    [
      "tracking positions with three samples",
      set(`${STEER}.trackingPositions`, [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ]),
      "type",
    ],
    [
      "a tracking position component over the magnitude cap",
      set(`${STEER}.trackingPositions.2.z`, 1e13),
      "magnitude",
    ],
    [
      "an unknown tracking position key",
      set(`${STEER}.trackingPositions.0.extra`, 1),
      "unknown-key",
    ],
    ["saved not an object", set(`${STEER}.saved`, 5), "not-object"],
    ["an unknown saved key", set(`${STEER}.saved.extra`, 1), "unknown-key"],
    [
      "saved behaviour WARP",
      set(`${STEER}.saved.behaviour`, "WARP"),
      "vocabulary",
    ],
    [
      "saved behaviour constructor",
      set(`${STEER}.saved.behaviour`, "constructor"),
      "vocabulary",
    ],
    [
      "saved targetId 2 ** 32",
      set(`${STEER}.saved.targetId`, 2 ** 32),
      "counter",
    ],
    ["saved desiredRange -1", set(`${STEER}.saved.desiredRange`, -1), "range"],
    [
      "saved desiredSpeed over the magnitude cap",
      set(`${STEER}.saved.desiredSpeed`, 1e13),
      "magnitude",
    ],
    [
      "saved destination.y null",
      set(`${STEER}.saved.destination.y`, null),
      "non-finite",
    ],
    [
      "saved missing a field",
      (s) => void delete (getAt(s, `${STEER}.saved`) as Plain).destination,
      "not-object",
    ],
    // The v4 entity fields (Phase 15, FOUND-18).
    ["velocity null", set(VEL, null), "not-object"],
    [
      "velocity missing",
      (s) => void delete (getAt(s, E0) as Plain).velocity,
      "not-object",
    ],
    ["an unknown velocity key", set(`${VEL}.extra`, 1), "unknown-key"],
    [
      "velocity.x over MAX_ENTITY_VELOCITY",
      set(`${VEL}.x`, MAX_ENTITY_VELOCITY + 1),
      "magnitude",
    ],
    [
      "velocity.z under -MAX_ENTITY_VELOCITY",
      set(`${VEL}.z`, -MAX_ENTITY_VELOCITY - 1),
      "magnitude",
    ],
    ["velocity.y null (a NaN after JSON)", set(`${VEL}.y`, null), "non-finite"],
    ["velocity.x NaN", set(`${VEL}.x`, Number.NaN), "non-finite"],
    ["velocity.x as a string", set(`${VEL}.x`, "1"), "type"],
    ["weapon null", set(WPN, null), "not-object"],
    [
      "weapon missing",
      (s) => void delete (getAt(s, E0) as Plain).weapon,
      "not-object",
    ],
    ["an unknown weapon key", set(`${WPN}.extra`, 1), "unknown-key"],
    [
      "weapon.temperature over MAX_WEAPON_TEMPERATURE",
      set(`${WPN}.temperature`, MAX_WEAPON_TEMPERATURE + 1),
      "magnitude",
    ],
    ["weapon.temperature -1", set(`${WPN}.temperature`, -1), "range"],
    [
      "weapon.temperature NaN",
      set(`${WPN}.temperature`, Number.NaN),
      "non-finite",
    ],
    ["weapon.lastShotTick 1.5", set(`${WPN}.lastShotTick`, 1.5), "counter"],
    ["weapon.lastShotTick -1", set(`${WPN}.lastShotTick`, -1), "counter"],
    ["weapon.missedShots -1", set(`${WPN}.missedShots`, -1), "counter"],
    ["weapon.missedShots 1.5", set(`${WPN}.missedShots`, 1.5), "counter"],
    [
      "weapon.missedShots 2 ** 32",
      set(`${WPN}.missedShots`, 2 ** 32),
      "counter",
    ],
    [
      "cargo over MAX_ENTITY_CARGO",
      set(`${E0}.cargo`, MAX_ENTITY_CARGO + 1),
      "magnitude",
    ],
    ["cargo 1.5", set(`${E0}.cargo`, 1.5), "counter"],
    ["cargo -1", set(`${E0}.cargo`, -1), "counter"],
    [
      "cargo missing",
      (s) => void delete (getAt(s, E0) as Plain).cargo,
      "counter",
    ],
    ["spawnTick 2 ** 32", set(`${E0}.spawnTick`, 2 ** 32), "counter"],
    ["ownerId 2 ** 32", set(`${E0}.ownerId`, 2 ** 32), "counter"],
    ["nav.targetId 2 ** 32", set(`${NAV}.targetId`, 2 ** 32), "counter"],
    ["rng.ai -1", set(`${E0}.rng.ai`, -1), "stream"],
    ["rng.ai 2 ** 32", set(`${E0}.rng.ai`, 2 ** 32), "stream"],
    ["rng.combat 2 ** 32", set(`${E0}.rng.combat`, 2 ** 32), "stream"],
    // Closed vocabularies.
    ["kind planet", set(`${E0}.kind`, "planet"), "vocabulary"],
    ["kind constructor", set(`${E0}.kind`, "constructor"), "vocabulary"],
    ["scanClass CLASS_FOO", set(`${E0}.scanClass`, "CLASS_FOO"), "vocabulary"],
    ["behaviour WARP", set(`${NAV}.behaviour`, "WARP"), "vocabulary"],
    ["aiKey trader", set(`${AI}.aiKey`, "trader"), "vocabulary"],
    // Strings and params.
    ["an empty specKey", set(`${E0}.specKey`, ""), "string"],
    [
      "a specKey over the string cap",
      set(`${E0}.specKey`, "k".repeat(MAX_SNAPSHOT_STRING_LENGTH + 1)),
      "string",
    ],
    [
      "a param string over the string cap",
      set(`${PARAMS}.label`, "k".repeat(MAX_SNAPSHOT_STRING_LENGTH + 1)),
      "string",
    ],
    [
      "a param key over the string cap",
      set(`${PARAMS}.${"k".repeat(MAX_SNAPSHOT_STRING_LENGTH + 1)}`, 1),
      "string",
    ],
    ["an empty param key", set(`${PARAMS}.`, 1), "string"],
    [
      "a param array over the length cap",
      set(
        `${PARAMS}.list`,
        Array.from({ length: MAX_SNAPSHOT_PARAM_LENGTH + 1 }, () => 1),
      ),
      "param",
    ],
    [
      "a param array element string over the cap",
      set(`${PARAMS}.list`, ["k".repeat(MAX_SNAPSHOT_STRING_LENGTH + 1)]),
      "string",
    ],
    [
      "more than MAX_AI_PARAMS_KEYS keys",
      (s) => {
        const params: Plain = {};
        for (let i = 0; i < MAX_AI_PARAMS_KEYS + 1; i += 1)
          params[`k${String(i)}`] = i;
        setAt(s, PARAMS, params);
      },
      "param",
    ],
    ["a nested object param", set(`${PARAMS}.nested`, { a: 1 }), "param"],
    ["a nested array param", set(`${PARAMS}.nested`, [[1]]), "param"],
    [
      "an object inside a param array",
      set(`${PARAMS}.list`, [{ a: 1 }]),
      "param",
    ],
    ["an array inside a param array", set(`${PARAMS}.list`, [[1]]), "param"],
    [
      "a null element in a param array",
      set(`${PARAMS}.list`, [1, null]),
      "param",
    ],
    [
      "a true element in a param array",
      set(`${PARAMS}.list`, [1, true]),
      "param",
    ],
    [
      "a false element in a param array",
      set(`${PARAMS}.list`, [false]),
      "param",
    ],
    [
      "a NaN element in a param array",
      set(`${PARAMS}.list`, [Number.NaN]),
      "non-finite",
    ],
    [
      "a param number over the magnitude cap",
      set(`${PARAMS}.gain`, 1e13),
      "magnitude",
    ],
    [
      "a NaN scalar param (in process)",
      set(`${PARAMS}.gain`, Number.NaN),
      "non-finite",
    ],
    // Unknown keys at every object level.
    ["an unknown entity key", set(`${E0}.extra`, 1), "unknown-key"],
    ["an unknown position key", set(`${E0}.position.extra`, 1), "unknown-key"],
    [
      "an unknown orientation key",
      set(`${E0}.orientation.extra`, 1),
      "unknown-key",
    ],
    ["an unknown rng key", set(`${E0}.rng.extra`, 1), "unknown-key"],
    ["an unknown nav key", set(`${NAV}.extra`, 1), "unknown-key"],
    [
      "an unknown nav.destination key",
      set(`${NAV}.destination.extra`, 1),
      "unknown-key",
    ],
    ["an unknown ai key", set(`${AI}.extra`, 1), "unknown-key"],
    // Missing objects.
    [
      "position missing",
      (s) => void delete (getAt(s, E0) as Plain).position,
      "not-object",
    ],
    ["nav not an object", set(NAV, []), "not-object"],
    ["ai as a number", set(AI, 5), "not-object"],
    ["params as an array", set(PARAMS, []), "not-object"],
  ];

const FORBIDDEN_LEVELS = [
  "",
  "staticHealth",
  E0,
  `${E0}.position`,
  `${E0}.orientation`,
  `${E0}.rng`,
  NAV,
  `${NAV}.destination`,
  AI,
  PARAMS,
  STEER,
  VEL,
  WPN,
  `${STEER}.jink`,
  `${STEER}.saved`,
  `${STEER}.saved.destination`,
  `${STEER}.trackingPositions.0`,
] as const;

describe("parseWorldSnapshot rejections", () => {
  it("accepts the unmodified rich snapshot", () => {
    expect(reasonOf(jsonOf(richWorld()))).toBe("accepted");
  });

  it("has at least twenty rows", () => {
    expect(REJECTIONS.length).toBeGreaterThanOrEqual(20);
  });

  it.each(REJECTIONS.map((row) => [...row]))(
    "rejects %s with its own reason",
    (_name, mutate, reason) => {
      const snapshot = jsonOf(richWorld());
      mutate(snapshot);
      expect(reasonOf(snapshot)).toBe(reason);
      // restoreWorld validates through the parser, so it refuses the same input.
      expect(() => restoreWorld(snapshot as unknown as WorldSnapshot)).toThrow(
        SnapshotError,
      );
    },
  );

  it.each([null, 42, "text", true, []])(
    "rejects the non-object input %j as not-object",
    (input) => {
      expect(reasonOf(input)).toBe("not-object");
    },
  );

  const forbiddenRows = FORBIDDEN_LEVELS.flatMap((level) =>
    ["__proto__", "constructor", "prototype"].map(
      (key) => [level === "" ? "root" : level, key] as const,
    ),
  );
  it.each(forbiddenRows.map((row) => [...row]))(
    "rejects an own %s key named %s as forbidden-key",
    (level, key) => {
      const snapshot = jsonOf(richWorld());
      withOwnKey(getAt(snapshot, level === "root" ? "" : level), key);
      expect(reasonOf(snapshot)).toBe("forbidden-key");
    },
  );

  it("rejects an own __proto__ key in a whole JSON text", () => {
    const text = JSON.stringify(jsonOf(richWorld())).replace(
      '"format"',
      '"__proto__":{"polluted":true},"format"',
    );
    const input = JSON.parse(text) as unknown;
    expect(reasonOf(input)).toBe("forbidden-key");
    expect(({} as Plain).polluted).toBeUndefined();
  });

  it("rejects a tampered snapshot passed straight to restoreWorld", () => {
    for (const mutate of [set(`${E0}.id`, 101.5), set(`${E0}.radius`, -1)]) {
      const snapshot = jsonOf(richWorld());
      mutate(snapshot);
      expect(() => restoreWorld(snapshot as unknown as WorldSnapshot)).toThrow(
        SnapshotError,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Acceptance rows

describe("parseWorldSnapshot acceptance", () => {
  it("accepts a quaternion within QUAT_UNIT_TOLERANCE and keeps it exactly", () => {
    const snapshot = jsonOf(richWorld());
    const orientation = { w: 1 + 2.5e-10, x: 0, y: 0, z: 0 };
    setAt(snapshot, `${E0}.orientation`, orientation);
    expect(reasonOf(snapshot)).toBe("accepted");
    const restored = restoreWorld(snapshot as unknown as WorldSnapshot);
    expect(restored.store.live[0]?.orientation).toEqual(orientation);
  });

  it("accepts scalar params null, true and false and a mixed array", () => {
    const snapshot = jsonOf(richWorld());
    const params = getAt(snapshot, PARAMS) as Plain;
    params.a = null;
    params.b = true;
    params.c = false;
    params.mixed = [1, "x"];
    const restored = restoreWorld(
      parseWorldSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown),
    );
    const restoredParams = aiOf(restored.store.live[0] as Entity).params;
    expect(restoredParams.a).toBeNull();
    expect(restoredParams.b).toBe(true);
    expect(restoredParams.c).toBe(false);
    expect(restoredParams.mixed).toEqual([1, "x"]);
  });

  it("accepts a JSON text whose scalar param is null and restores that null", () => {
    const snapshot = jsonOf(richWorld());
    expect(getAt(snapshot, `${PARAMS}.nothing`)).toBeNull();
    const text = JSON.stringify(snapshot);
    expect(text).toContain('"nothing":null');
    const restored = restoreWorld(
      parseWorldSnapshot(JSON.parse(text) as unknown),
    );
    expect(aiOf(restored.store.live[0] as Entity).params.nothing).toBeNull();
  });

  it("accepts nextId 2 ** 32 with an entity of id 0xffffffff, the state allocate reaches", () => {
    const snapshot = jsonOf(richWorld());
    snapshot.entities = [{ ...(getAt(snapshot, E0) as Plain), id: MAX_UINT32 }];
    snapshot.nextId = 2 ** 32;
    expect(reasonOf(snapshot)).toBe("accepted");
    const restored = restoreWorld(snapshot as unknown as WorldSnapshot);
    expect(restored.store.nextId).toBe(2 ** 32);
    // The counter cannot issue another id: allocation is refused.
    expect(spawnEntity(restored, shipInit(0, null), 0)).toEqual({
      ok: false,
      reason: "idExhausted",
    });
  });

  it.each([0, MAX_UINT32])("accepts worldSeed %i", (worldSeed) => {
    const snapshot = jsonOf(richWorld());
    snapshot.worldSeed = worldSeed;
    expect(reasonOf(snapshot)).toBe("accepted");
    expect(restoreWorld(snapshot as unknown as WorldSnapshot).worldSeed).toBe(
      worldSeed,
    );
  });

  it("parses its own output again (the null-prototype params are accepted)", () => {
    const text = JSON.stringify(snapshotWorld(richWorld()));
    const once = parseWorldSnapshot(JSON.parse(text) as unknown);
    const twice = parseWorldSnapshot(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(twice).toEqual(once);
    expect(
      Object.getPrototypeOf(
        aiOf(restoreWorld(twice).store.live[0] as Entity).params,
      ),
    ).toBeNull();
  });

  it("reads each input property exactly once and copies what it read", () => {
    const input = parseWorldSnapshot(jsonOf(richWorld()));
    const entity = input.entities[0] as EntitySnapshot;
    let reads = 0;
    Object.defineProperty(entity, "radius", {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        // A getter that changes its answer cannot pass one value and supply another.
        return reads === 1 ? 25 : -1;
      },
    });
    const parsed = parseWorldSnapshot(input);
    expect(reads).toBe(1);
    expect(parsed.entities[0]?.radius).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// The steering record under version 4 (AI-01, plan 14-08; version 4 is FOUND-18)

describe("the steering record in the snapshot", () => {
  const aSteer = (world: World): Entity["steer"] =>
    (world.store.live[0] as Entity).steer;

  it("writes version 4 and the record of every entity", () => {
    const snapshot = snapshotWorld(richWorld());
    expect(snapshot.version).toBe(4);
    const [a, b, c] = snapshot.entities;
    expect(a?.steer).toEqual({
      flightRoll: 0.75,
      flightPitch: -0.5,
      stickRoll: 1.25,
      stickPitch: -1.5,
      accuracy: 3.5,
      frustration: 2.25,
      successFactor: -0.125,
      pitchingOver: true,
      jink: { x: 0.5, y: -0.25, z: 0 },
      proximityAlert: 102,
      escortSlot: 3,
      trackingCount: 4,
      trackingTicks: [10, -50, -110, -170],
      trackingPositions: [
        { x: 1, y: 2, z: 3 },
        { x: -4, y: 5.5, z: 6 },
        { x: 7, y: 8, z: -9.25 },
        { x: 0, y: 0, z: 1e6 },
      ],
      saved: {
        behaviour: "FLY_TO_DESTINATION",
        targetId: 103,
        desiredRange: 250.5,
        desiredSpeed: 40,
        destination: { x: 10, y: -20, z: 30 },
      },
      entryPending: true,
    });
    expect([b?.steer.accuracy, b?.steer.escortSlot]).toEqual([-2, 15]);
    expect(c?.steer.accuracy).toBe(-100);
    expect(c?.steer.saved).toBeNull();
    expect(c?.steer.trackingCount).toBe(0);
  });

  it("restores the record so the restored world hashes like the source", () => {
    const player = initFlightState(layout);
    const world = richWorld();
    const restored = restoreWorld(parseWorldSnapshot(jsonOf(world)));
    expect(aSteer(restored)).toEqual(aSteer(world));
    expect(entityHashes(restored)).toEqual(entityHashes(world));
    expect(hashWorld(player, restored)).toBe(hashWorld(player, world));
  });

  it("restores fresh objects: the restored record aliases neither the source nor the snapshot", () => {
    const world = richWorld();
    const parsed = parseWorldSnapshot(jsonOf(world));
    const restored = restoreWorld(parsed);
    const before = serializeWorldSection(restored);
    const source = aSteer(world);
    const copy = aSteer(restored);
    expect(copy).not.toBe(source);
    expect(copy.jink).not.toBe(source.jink);
    expect(copy.trackingTicks).not.toBe(source.trackingTicks);
    expect(copy.trackingPositions[1]).not.toBe(source.trackingPositions[1]);
    expect(copy.saved).not.toBe(source.saved);
    // Mutating the source or the parsed snapshot afterwards changes nothing.
    source.jink = vec(9, 9, 9);
    source.trackingTicks[0] = 99;
    (parsed.entities[0] as EntitySnapshot).steer.trackingPositions[0].x = 77;
    expect(serializeWorldSection(restored)).toBe(before);
  });

  it("writes a curve that does not exist in its canonical form: zero ticks and positions", () => {
    const world = richWorld();
    const steer = aSteer(world);
    steer.trackingCount = 0;
    const entry = snapshotWorld(world).entities[0] as EntitySnapshot;
    expect(entry.steer.trackingTicks).toEqual([0, 0, 0, 0]);
    expect(entry.steer.trackingPositions).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ]);
    // The stale samples change neither the hash nor the round trip.
    const restored = restoreWorld(parseWorldSnapshot(jsonOf(world)));
    expect(entityHashes(restored)).toEqual(entityHashes(world));
  });

  it("accepts a negative tick inside the signed domain in a strictly decreasing set", () => {
    const snapshot = jsonOf(richWorld());
    setAt(snapshot, `${STEER}.trackingTicks`, [0, -1, -2, -MAX_UINT32]);
    expect(reasonOf(snapshot)).toBe("accepted");
    const restored = restoreWorld(snapshot as unknown as WorldSnapshot);
    expect((restored.store.live[0] as Entity).steer.trackingTicks).toEqual([
      0,
      -1,
      -2,
      -MAX_UINT32,
    ]);
  });

  it("accepts the unresolved accuracy sentinel, the resolved bounds and the largest slot", () => {
    for (const accuracy of [-100, -5, 10]) {
      const snapshot = jsonOf(richWorld());
      setAt(snapshot, `${STEER}.accuracy`, accuracy);
      expect(reasonOf(snapshot)).toBe("accepted");
    }
    const snapshot = jsonOf(richWorld());
    setAt(snapshot, `${STEER}.escortSlot`, MAX_ESCORT_SLOT);
    expect(reasonOf(snapshot)).toBe("accepted");
  });

  it("accepts a saved condition of null and of an object", () => {
    const snapshot = jsonOf(richWorld());
    setAt(snapshot, `${STEER}.saved`, null);
    expect(reasonOf(snapshot)).toBe("accepted");
    expect(
      aSteer(restoreWorld(snapshot as unknown as WorldSnapshot)).saved,
    ).toBeNull();
  });

  it("normalises -0 in the record and refuses a non-finite value", () => {
    const world = richWorld();
    const steer = aSteer(world);
    steer.flightRoll = -0;
    steer.jink = vec(-0, 0, -0);
    steer.successFactor = -0;
    steer.trackingTicks = [10, -50, -110, -170];
    const entry = snapshotWorld(world).entities[0] as EntitySnapshot;
    expect(Object.is(entry.steer.flightRoll, 0)).toBe(true);
    expect(Object.is(entry.steer.jink.x, 0)).toBe(true);
    expect(Object.is(entry.steer.successFactor, 0)).toBe(true);
    steer.frustration = Number.NaN;
    expect(() => snapshotWorld(world)).toThrow(SnapshotError);
  });

  it("refuses a hand-built version-2 snapshot of the previous shape", () => {
    const snapshot = jsonOf(richWorld());
    snapshot.version = 2;
    for (const entity of snapshot.entities as Plain[]) delete entity.steer;
    expect(reasonOf(snapshot)).toBe("version");
    expect(() => restoreWorld(snapshot as unknown as WorldSnapshot)).toThrow(
      SnapshotError,
    );
  });

  it("refuses a hand-built version-3 snapshot of the previous shape", () => {
    const snapshot = jsonOf(richWorld());
    snapshot.version = 3;
    delete snapshot.staticHealth;
    for (const entity of snapshot.entities as Plain[]) {
      delete entity.velocity;
      delete entity.weapon;
      delete entity.cargo;
    }
    expect(reasonOf(snapshot)).toBe("version");
    expect(() => restoreWorld(snapshot as unknown as WorldSnapshot)).toThrow(
      SnapshotError,
    );
  });
});

describe("the v4 entity fields in the snapshot (FOUND-18)", () => {
  it("writes velocity, weapon and cargo and round-trips them through JSON", () => {
    const world = richWorld();
    const [a, b] = snapshotWorld(world).entities;
    expect(a?.velocity).toEqual({ x: 1.5, y: -2.25, z: 0 });
    expect(a?.weapon).toEqual({
      temperature: 12.5,
      lastShotTick: 6,
      missedShots: 2,
    });
    expect(a?.cargo).toBe(7);
    expect(b?.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(b?.weapon).toEqual({
      temperature: 0,
      lastShotTick: 0,
      missedShots: 0,
    });
    expect(b?.cargo).toBe(0);
    const text = JSON.stringify(snapshotWorld(world));
    const restored = restoreWorld(
      parseWorldSnapshot(JSON.parse(text) as unknown),
    );
    expect(entityHashes(restored)).toEqual(entityHashes(world));
    expect(JSON.stringify(snapshotWorld(restored))).toBe(text);
    const source = world.store.live[0] as Entity;
    const copy = restored.store.live[0] as Entity;
    expect(copy.velocity).toEqual(source.velocity);
    expect(copy.velocity).not.toBe(source.velocity);
    expect(copy.weapon).toEqual(source.weapon);
    expect(copy.weapon).not.toBe(source.weapon);
    expect(copy.cargo).toBe(7);
  });

  it("accepts the bounds themselves", () => {
    const snapshot = jsonOf(richWorld());
    setAt(snapshot, `${VEL}.x`, MAX_ENTITY_VELOCITY);
    setAt(snapshot, `${VEL}.y`, -MAX_ENTITY_VELOCITY);
    setAt(snapshot, `${WPN}.temperature`, MAX_WEAPON_TEMPERATURE);
    setAt(snapshot, `${WPN}.lastShotTick`, MAX_UINT32);
    setAt(snapshot, `${WPN}.missedShots`, MAX_UINT32);
    setAt(snapshot, `${E0}.cargo`, MAX_ENTITY_CARGO);
    expect(reasonOf(snapshot)).toBe("accepted");
  });

  it("normalises -0 in the v4 fields and refuses a non-finite value", () => {
    const world = richWorld();
    const entity = world.store.live[0] as Entity;
    entity.velocity = vec(-0, 0, -0);
    entity.weapon.temperature = -0;
    const entry = snapshotWorld(world).entities[0] as EntitySnapshot;
    expect(Object.is(entry.velocity.x, 0)).toBe(true);
    expect(Object.is(entry.velocity.z, 0)).toBe(true);
    expect(Object.is(entry.weapon.temperature, 0)).toBe(true);
    for (const poison of [
      (e: Entity) => (e.velocity = vec(0, Number.NaN, 0)),
      (e: Entity) => (e.weapon.temperature = Number.POSITIVE_INFINITY),
      (e: Entity) => (e.cargo = Number.NaN),
    ]) {
      const bad = richWorld();
      poison(bad.store.live[0] as Entity);
      expect(() => snapshotWorld(bad)).toThrow(SnapshotError);
    }
  });
});

describe("the static health in the snapshot (FOUND-18, D-08)", () => {
  it("writes the pristine maxima and round-trips a damaged buoy", () => {
    const player = initFlightState(layout);
    const world = richWorld();
    expect(snapshotWorld(world).staticHealth).toEqual({
      station: 25000,
      witchpoint: 250,
      navBuoy: 250,
    });
    world.staticHealth.witchpoint = 100;
    world.staticHealth.station = 24000.5;
    const text = JSON.stringify(snapshotWorld(world));
    const restored = restoreWorld(
      parseWorldSnapshot(JSON.parse(text) as unknown),
    );
    expect(restored.staticHealth).toEqual({
      station: 24000.5,
      witchpoint: 100,
      navBuoy: 250,
    });
    expect(restored.staticHealth).not.toBe(world.staticHealth);
    expect(hashWorld(player, restored)).toBe(hashWorld(player, world));
    expect(JSON.stringify(snapshotWorld(restored))).toBe(text);
  });

  it("writes -0 as 0 and refuses a non-finite value", () => {
    const world = richWorld();
    world.staticHealth.navBuoy = -0;
    world.staticHealth.station = 0;
    const entry = snapshotWorld(world);
    expect(Object.is(entry.staticHealth.navBuoy, 0)).toBe(true);
    expect(Object.is(entry.staticHealth.station, 0)).toBe(true);
    world.staticHealth.witchpoint = Number.NaN;
    expect(() => snapshotWorld(world)).toThrow(SnapshotError);
  });

  it("accepts the bounds themselves and zero", () => {
    const snapshot = jsonOf(richWorld());
    setAt(snapshot, "staticHealth.station", 0);
    setAt(snapshot, "staticHealth.witchpoint", 0);
    expect(reasonOf(snapshot)).toBe("accepted");
    setAt(snapshot, "staticHealth.station", STATION_MAX_ENERGY);
    setAt(snapshot, "staticHealth.navBuoy", BUOY_MAX_ENERGY);
    expect(reasonOf(snapshot)).toBe("accepted");
  });
});

/** A world whose buoys are moved, drifting, damaged and routing. */
function movedBuoys(): World {
  const world = richWorld();
  world.buoys.navBuoy.offset = vec(3, -2.5, 1e5);
  world.buoys.navBuoy.velocity = vec(0.5, 0, -12);
  world.buoys.witchpoint.subentityEnergy = 120;
  world.buoys.witchpoint.subentityTakingDamage = true;
  return world;
}

/** The buoy rows (T-18-39, T-18-51): a path, a mutation and the reason. */
const BUOY_REJECTIONS: readonly (readonly [
  string,
  Mutator,
  SnapshotErrorReason,
])[] = [
  [
    "buoys.navBuoy.offset.x",
    set("buoys.navBuoy.offset.x", Number.NaN),
    "non-finite",
  ],
  [
    "buoys.witchpoint.velocity.z",
    set("buoys.witchpoint.velocity.z", Number.POSITIVE_INFINITY),
    "non-finite",
  ],
  [
    "buoys.navBuoy.subentityEnergy",
    set("buoys.navBuoy.subentityEnergy", null),
    "non-finite",
  ],
  [
    "buoys.navBuoy.offset.y",
    set("buoys.navBuoy.offset.y", MAX_BUOY_OFFSET + 1),
    "magnitude",
  ],
  [
    "buoys.witchpoint.offset.z",
    set("buoys.witchpoint.offset.z", -(MAX_BUOY_OFFSET + 1)),
    "magnitude",
  ],
  [
    "buoys.navBuoy.velocity.x",
    set("buoys.navBuoy.velocity.x", MAX_ENTITY_VELOCITY + 1),
    "magnitude",
  ],
  [
    "buoys.witchpoint.subentityEnergy",
    set("buoys.witchpoint.subentityEnergy", -1),
    "range",
  ],
  [
    "buoys.witchpoint.subentityEnergy",
    set("buoys.witchpoint.subentityEnergy", BUOY_SUBENTITY_MAX_ENERGY + 0.5),
    "magnitude",
  ],
  [
    "buoys.navBuoy.subentityTakingDamage",
    set("buoys.navBuoy.subentityTakingDamage", 1),
    "type",
  ],
  [
    "buoys.navBuoy.subentityTakingDamage",
    set("buoys.navBuoy.subentityTakingDamage", "yes"),
    "type",
  ],
  [
    "buoys.witchpoint.subentityTakingDamage",
    set("buoys.witchpoint.subentityEnergy", 0),
    "range",
  ],
  [
    "buoys.navBuoy",
    (s) => void delete (getAt(s, "buoys") as Plain).navBuoy,
    "not-object",
  ],
  ["buoys", set("buoys", null), "not-object"],
  ["buoys", set("buoys.extra", 1), "unknown-key"],
  ["buoys.witchpoint", set("buoys.witchpoint.extra", 1), "unknown-key"],
  ["buoys.navBuoy.offset", set("buoys.navBuoy.offset.w", 1), "unknown-key"],
  ["buoys.navBuoy.velocity", set("buoys.navBuoy.velocity.w", 1), "unknown-key"],
];

describe("buoy bounds at the snapshot boundary (T-18-39, T-18-51)", () => {
  it("accepts the moved-buoys snapshot", () => {
    expect(reasonOf(jsonOf(movedBuoys()))).toBe("accepted");
  });

  it.each(
    BUOY_REJECTIONS.map(
      ([path, mutate, reason]) => [path, reason, mutate] as const,
    ),
  )("rejects a bad %s as %s, naming the path", (path, reason, mutate) => {
    const snapshot = jsonOf(movedBuoys());
    mutate(snapshot);
    expect(reasonOf(snapshot)).toBe(reason);
    expect(() => parseWorldSnapshot(snapshot)).toThrow(`snapshot.${path}`);
    expect(() => restoreWorld(snapshot as unknown as WorldSnapshot)).toThrow(
      SnapshotError,
    );
  });

  it("rejects an own __proto__ key in the buoy record", () => {
    const snapshot = jsonOf(movedBuoys());
    withOwnKey(getAt(snapshot, "buoys.navBuoy"), "__proto__");
    expect(reasonOf(snapshot)).toBe("forbidden-key");
  });

  it("accepts the bounds themselves", () => {
    const snapshot = jsonOf(movedBuoys());
    setAt(snapshot, "buoys.navBuoy.offset.x", MAX_BUOY_OFFSET);
    setAt(snapshot, "buoys.navBuoy.offset.y", -MAX_BUOY_OFFSET);
    setAt(snapshot, "buoys.navBuoy.velocity.z", -MAX_ENTITY_VELOCITY);
    setAt(snapshot, "buoys.navBuoy.subentityEnergy", 0);
    setAt(snapshot, "buoys.witchpoint.subentityEnergy", 0.5);
    expect(reasonOf(snapshot)).toBe("accepted");
    setAt(snapshot, "buoys.navBuoy.subentityEnergy", BUOY_SUBENTITY_MAX_ENERGY);
    setAt(snapshot, "buoys.navBuoy.subentityTakingDamage", true);
    expect(reasonOf(snapshot)).toBe("accepted");
  });
});

describe("the buoy states in the snapshot (PD-01, PD-02)", () => {
  it("writes no buoys key for pristine buoys", () => {
    const snapshot = snapshotWorld(richWorld());
    expect(Object.hasOwn(snapshot, "buoys")).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("buoys");
  });

  it("round-trips moved buoys to an equal hash and an equal text", () => {
    const player = initFlightState(layout);
    const world = movedBuoys();
    const text = JSON.stringify(snapshotWorld(world));
    const restored = restoreWorld(
      parseWorldSnapshot(JSON.parse(text) as unknown),
    );
    expect(restored.buoys).toEqual(world.buoys);
    expect(restored.buoys).not.toBe(world.buoys);
    expect(restored.buoys.navBuoy.offset).not.toBe(world.buoys.navBuoy.offset);
    expect(hashWorld(player, restored)).toBe(hashWorld(player, world));
    expect(JSON.stringify(snapshotWorld(restored))).toBe(text);
  });

  it("restores pristine buoys from a snapshot without the key", () => {
    const player = initFlightState(layout);
    const snapshot = jsonOf(movedBuoys());
    delete snapshot.buoys;
    const restored = restoreWorld(snapshot as unknown as WorldSnapshot);
    expect(isPristineBuoyStates(restored.buoys)).toBe(true);
    expect(restored.buoys).toEqual(createBuoyStates());
    expect(hashWorld(player, restored)).toBe(hashWorld(player, richWorld()));
  });

  it("writes -0 as 0 and refuses a non-finite value", () => {
    const world = richWorld();
    world.buoys.witchpoint.offset = vec(-0, 4, 0);
    const entry = snapshotWorld(world);
    expect(Object.is(entry.buoys?.witchpoint.offset.x, 0)).toBe(true);
    world.buoys.navBuoy.velocity = vec(0, Number.NaN, 0);
    expect(() => snapshotWorld(world)).toThrow(SnapshotError);
  });
});

// ---------------------------------------------------------------------------
// The edges

describe("snapshot edges", () => {
  it("restores a snapshot whose keys were written in reverse order to the same hashes", () => {
    const world = richWorld();
    const reverse = (value: unknown): unknown => {
      if (Array.isArray(value)) return (value as unknown[]).map(reverse);
      if (typeof value === "object" && value !== null) {
        const out: Plain = {};
        for (const key of Object.keys(value).reverse()) {
          out[key] = reverse((value as Plain)[key]);
        }
        return out;
      }
      return value;
    };
    const reversed = reverse(jsonOf(world));
    const restored = restoreWorld(parseWorldSnapshot(reversed));
    expect(entityHashes(restored)).toEqual(entityHashes(world));
    expect(JSON.stringify(snapshotWorld(restored))).toBe(
      JSON.stringify(snapshotWorld(world)),
    );
  });

  it("round-trips a never-spawned world and hashes it exactly as hashFlight", () => {
    const player = initFlightState(layout);
    const world = createWorld(99);
    const restored = restoreWorld(parseWorldSnapshot(jsonOf(world)));
    expect(isNeverSpawned(restored)).toBe(true);
    expect(hashWorld(player, restored)).toBe(hashFlight(player));
  });

  it("restores an empty world with aiDropped 5 as not never-spawned and hashes it differently", () => {
    const player = initFlightState(layout);
    const world = createWorld(99);
    world.aiDropped = 5;
    const snapshot = parseWorldSnapshot(jsonOf(world));
    expect(snapshot.entities).toEqual([]);
    expect(snapshot.nextId).toBe(101);
    const restored = restoreWorld(snapshot);
    expect(restored.aiDropped).toBe(5);
    expect(isNeverSpawned(restored)).toBe(false);
    expect(hashWorld(player, restored)).not.toBe(hashFlight(player));
    expect(hashWorld(player, restored)).toBe(hashWorld(player, world));
  });

  it("gives the same next id after killing the highest id, never the killed id", () => {
    const world = createWorld(5);
    for (let i = 0; i < 3; i += 1) spawnOk(world, shipInit(i, null));
    killEntity(world, 103);
    commitWorld(world);
    const restored = restoreWorld(parseWorldSnapshot(jsonOf(world)));
    expect(restored.store.nextId).toBe(world.store.nextId);
    const live = spawnOk(world, shipInit(4, null));
    const again = spawnOk(restored, shipInit(4, null));
    expect(again.id).toBe(live.id);
    expect(live.id).toBe(104);
    expect(live.id).not.toBe(103);
  });

  it("restores per-world restore scope: the stored counter, a fresh world at 101, no shared store", () => {
    const original = createWorld(77);
    for (let i = 0; i < 5; i += 1) spawnOk(original, shipInit(i, null));
    killEntity(original, 105);
    commitWorld(original);
    const snapshot = snapshotWorld(original);
    expect(snapshot.nextId).toBe(106);
    const restored = restoreWorld(snapshot);
    expect(restored).not.toBe(original);
    expect(restored.store).not.toBe(original.store);
    expect(spawnOk(restored, shipInit(7, null)).id).toBe(106);
    // The restart belongs to new worlds: the same seed issues 101 first.
    expect(spawnOk(createWorld(77), shipInit(7, null)).id).toBe(101);
    // Spawning in the restored world never touched the original.
    expect(original.store.nextId).toBe(106);
    expect(original.store.live.map((e) => e.id)).toEqual([101, 102, 103, 104]);
  });
});

// ---------------------------------------------------------------------------
// The energy bank (CBT-07)

describe("the energy bank in the snapshot", () => {
  it("writes the three fields of every entity", () => {
    const snapshot = snapshotWorld(richWorld());
    const [a, b] = snapshot.entities;
    expect([a?.energy, a?.maxEnergy, a?.energyRechargeRate]).toEqual([
      60.5, 85, 2.25,
    ]);
    expect([b?.energy, b?.maxEnergy, b?.energyRechargeRate]).toEqual([
      250, 250, 4,
    ]);
  });

  it("restores a drained bank so the restored world hashes like the source", () => {
    const player = initFlightState(layout);
    const world = richWorld();
    const restored = restoreWorld(parseWorldSnapshot(jsonOf(world)));
    const a = restored.store.live[0] as Entity;
    expect([a.energy, a.maxEnergy, a.energyRechargeRate]).toEqual([
      60.5, 85, 2.25,
    ]);
    expect(hashWorld(player, restored)).toBe(hashWorld(player, world));
  });

  it("keeps a bank of exactly zero energy and normalises a -0 energy", () => {
    const world = richWorld();
    (world.store.live[0] as Entity).energy = -0;
    const snapshot = snapshotWorld(world);
    expect(Object.is(snapshot.entities[0]?.energy, 0)).toBe(true);
    expect(reasonOf(JSON.parse(JSON.stringify(snapshot)))).toBe("accepted");
  });
});

// ---------------------------------------------------------------------------
// snapshotWorld refusals

describe("snapshotWorld refusals", () => {
  function reasonOfSnapshot(world: World): SnapshotErrorReason | "ok" {
    try {
      snapshotWorld(world);
      return "ok";
    } catch (error) {
      if (error instanceof SnapshotError) return error.reason;
      throw error;
    }
  }

  it("refuses an uncommitted dead entity", () => {
    const world = richWorld();
    killEntity(world, 102);
    expect(reasonOfSnapshot(world)).toBe("uncommitted");
    commitWorld(world);
    expect(reasonOfSnapshot(world)).toBe("ok");
  });

  it("refuses an undrained AI event", () => {
    const world = richWorld();
    postAiEvent(world, { to: 101, name: "shipAttacked" });
    expect(reasonOfSnapshot(world)).toBe("queue-not-empty");
    world.aiQueue.length = 0;
    expect(reasonOfSnapshot(world)).toBe("ok");
  });

  it("refuses an unresolved fire request", () => {
    const world = richWorld();
    world.fireQueue.push(101);
    expect(reasonOfSnapshot(world)).toBe("queue-not-empty");
    world.fireQueue.length = 0;
    expect(reasonOfSnapshot(world)).toBe("ok");
  });

  const POISON: readonly (readonly [string, (world: World) => void])[] = [
    [
      "position.x NaN",
      (w) => {
        (w.store.live[0] as Entity).position = vec(Number.NaN, 0, 0);
      },
    ],
    [
      "radius Infinity",
      (w) => {
        (w.store.live[1] as Entity).radius = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "a scalar param NaN",
      (w) => {
        aiOf(w.store.live[0] as Entity).params.gain = Number.NaN;
      },
    ],
    [
      "an array param element -Infinity",
      (w) => {
        aiOf(w.store.live[0] as Entity).params.list = [
          1,
          Number.NEGATIVE_INFINITY,
        ];
      },
    ],
    [
      "nav.destination.z NaN",
      (w) => {
        (w.store.live[0] as Entity).nav.destination = vec(0, 0, Number.NaN);
      },
    ],
    [
      "orientation.w NaN",
      (w) => {
        (w.store.live[2] as Entity).orientation = quat(Number.NaN, 0, 0, 0);
      },
    ],
    [
      "rng.combat NaN",
      (w) => {
        (w.store.live[0] as Entity).rng.combat = Number.NaN;
      },
    ],
    [
      "energy NaN",
      (w) => {
        (w.store.live[0] as Entity).energy = Number.NaN;
      },
    ],
    [
      "maxEnergy Infinity",
      (w) => {
        (w.store.live[1] as Entity).maxEnergy = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "energyRechargeRate NaN",
      (w) => {
        (w.store.live[0] as Entity).energyRechargeRate = Number.NaN;
      },
    ],
    [
      "steer.flightRoll NaN",
      (w) => {
        (w.store.live[0] as Entity).steer.flightRoll = Number.NaN;
      },
    ],
    [
      "steer.jink.y Infinity",
      (w) => {
        (w.store.live[1] as Entity).steer.jink = vec(
          0,
          Number.POSITIVE_INFINITY,
          0,
        );
      },
    ],
    [
      "a steer tracking tick NaN",
      (w) => {
        (w.store.live[0] as Entity).steer.trackingTicks[1] = Number.NaN;
      },
    ],
    [
      "a steer tracking position -Infinity",
      (w) => {
        (w.store.live[0] as Entity).steer.trackingPositions[2] = vec(
          0,
          0,
          Number.NEGATIVE_INFINITY,
        );
      },
    ],
    [
      "steer.saved.desiredRange NaN",
      (w) => {
        const saved = (w.store.live[0] as Entity).steer.saved;
        if (saved === null) throw new Error("no saved condition");
        saved.desiredRange = Number.NaN;
      },
    ],
    [
      "wakeTick Infinity",
      (w) => {
        aiOf(w.store.live[0] as Entity).wakeTick = Number.POSITIVE_INFINITY;
      },
    ],
    [
      "world rng NaN",
      (w) => {
        w.rng.s = Number.NaN;
      },
    ],
    [
      "aiDropped NaN",
      (w) => {
        w.aiDropped = Number.NaN;
      },
    ],
  ];

  it.each(POISON.map((row) => [...row]))(
    "refuses %s with the non-finite reason and returns nothing",
    (_name, poison) => {
      const world = richWorld();
      poison(world);
      let returned: unknown = "never ran";
      expect(() => {
        returned = snapshotWorld(world);
      }).toThrow(SnapshotError);
      expect(returned).toBe("never ran");
      expect(reasonOfSnapshot(world)).toBe("non-finite");
    },
  );

  it("refuses a valid-then-poisoned entity rather than emitting a null", () => {
    const world = createWorld(3);
    const entity = spawnOk(world, shipInit(0, createTestPilotAi(0)));
    entity.position = vec(Number.NaN, 0, 0);
    expect(() => JSON.stringify(snapshotWorld(world))).toThrow(SnapshotError);
  });

  it("refuses an unsanitised NaN while the JSON text of a hand-built null is refused by the parser", () => {
    const snapshot = jsonOf(richWorld());
    setAt(snapshot, `${E0}.position.x`, null);
    expect(reasonOf(snapshot)).toBe("non-finite");
    const params = jsonOf(richWorld());
    setAt(params, `${PARAMS}.list`, [1, null]);
    expect(reasonOf(params)).toBe("param");
  });
});

// ---------------------------------------------------------------------------
// No aliasing

describe("snapshotWorld, parseWorldSnapshot and restoreWorld share no references", () => {
  it("leaves the live world unchanged when the returned snapshot is mutated", () => {
    const world = richWorld();
    const before = entityHashes(world);
    const sectionBefore = serializeWorldSection(world);
    const snapshot = snapshotWorld(world);
    const first = snapshot.entities[0] as EntitySnapshot;
    first.position.x = 999_999;
    first.orientation.w = 0;
    first.nav.destination.y = 999_999;
    first.rng.ai = 1;
    const ai = first.ai as AiComponent;
    ai.params.gain = 123;
    (ai.params.list as (number | string)[])[0] = 999;
    ai.params.added = 1;
    snapshot.entities.length = 0;
    expect(entityHashes(world)).toEqual(before);
    expect(serializeWorldSection(world)).toBe(sectionBefore);
    expect(aiOf(world.store.live[0] as Entity).params.gain).toBe(3.5);
    expect(aiOf(world.store.live[0] as Entity).params.list).toEqual([
      1,
      "a",
      2.5,
    ]);
  });

  it("leaves the parsed output untouched by later mutation of the raw input", () => {
    const raw = jsonOf(richWorld());
    const parsed = parseWorldSnapshot(raw);
    const text = JSON.stringify(parsed);
    setAt(raw, `${E0}.position.x`, 5);
    setAt(raw, `${PARAMS}.list`, [9]);
    (getAt(raw, `${E0}.orientation`) as Plain).w = 0;
    expect(JSON.stringify(parsed)).toBe(text);
  });

  it("leaves the restored world unchanged when the snapshot is mutated afterwards", () => {
    const parsed = parseWorldSnapshot(jsonOf(richWorld()));
    const restored = restoreWorld(parsed);
    const before = entityHashes(restored);
    const sectionBefore = serializeWorldSection(restored);
    const first = parsed.entities[0] as EntitySnapshot;
    first.position.x = 999_999;
    first.orientation.w = 0;
    first.nav.destination.y = 999_999;
    const ai = first.ai as AiComponent;
    ai.params.gain = 123;
    ai.params.added = 1;
    (ai.params.list as (number | string)[])[0] = 999;
    parsed.entities.length = 0;
    expect(entityHashes(restored)).toEqual(before);
    expect(serializeWorldSection(restored)).toBe(sectionBefore);
  });
});

// ---------------------------------------------------------------------------
// The hash and the codec cover the same fields

interface Mutation {
  readonly name: string;
  readonly apply: (entity: Entity) => void;
}

/**
 * One row per `Entity` field: adding a field to `Entity` fails typecheck here
 * until a row exists. `id` is the identity and `dead` is never snapshotted (an
 * uncommitted dead entity is refused), so both have no mutation. Every numeric
 * mutation changes its value by at least 1, far above `canon`'s 1e-6
 * resolution, and the orientation stays a unit quaternion.
 */
const ENTITY_FIELDS: Record<keyof Entity, readonly Mutation[]> = {
  id: [],
  dead: [],
  kind: [
    {
      name: "ship to cargo",
      apply: (e) => {
        (e as { kind: string }).kind = "cargo";
      },
    },
  ],
  position: [
    {
      name: "x + 1",
      apply: (e) => {
        e.position = vec(e.position.x + 1, e.position.y, e.position.z);
      },
    },
  ],
  orientation: [
    {
      name: "another unit quaternion",
      apply: (e) => {
        e.orientation = quat(0, 1, 0, 0);
      },
    },
  ],
  radius: [
    {
      name: "+ 1",
      apply: (e) => {
        e.radius += 1;
      },
    },
  ],
  speed: [
    {
      name: "+ 1",
      apply: (e) => {
        e.speed += 1;
      },
    },
  ],
  scanClass: [
    {
      name: "neutral to cargo",
      apply: (e) => {
        e.scanClass = "CLASS_CARGO";
      },
    },
  ],
  specKey: [
    {
      name: "append x",
      apply: (e) => {
        e.specKey += "x";
      },
    },
  ],
  ownerId: [
    {
      name: "+ 1",
      apply: (e) => {
        e.ownerId += 1;
      },
    },
  ],
  spawnTick: [
    {
      name: "+ 1",
      apply: (e) => {
        e.spawnTick += 1;
      },
    },
  ],
  rng: [
    {
      name: "rng.ai",
      apply: (e) => {
        e.rng.ai = (e.rng.ai + 1) >>> 0;
      },
    },
    {
      name: "rng.combat",
      apply: (e) => {
        e.rng.combat = (e.rng.combat + 1) >>> 0;
      },
    },
  ],
  nav: [
    {
      name: "behaviour",
      apply: (e) => {
        e.nav.behaviour = "STOP_STILL";
      },
    },
    {
      name: "targetId",
      apply: (e) => {
        e.nav.targetId += 1;
      },
    },
    {
      name: "destination.x",
      apply: (e) => {
        e.nav.destination = vec(
          e.nav.destination.x + 1,
          e.nav.destination.y,
          e.nav.destination.z,
        );
      },
    },
    {
      name: "desiredRange",
      apply: (e) => {
        e.nav.desiredRange += 1;
      },
    },
    {
      name: "desiredSpeed",
      apply: (e) => {
        e.nav.desiredSpeed += 1;
      },
    },
  ],
  ai: [
    {
      name: "a number param",
      apply: (e) => {
        aiOf(e).params.gain = 4.5;
      },
    },
    {
      name: 'the number 1 replaced by the string "1" (same digits, other type)',
      apply: (e) => {
        aiOf(e).params.one = "1";
      },
    },
    {
      name: "null replaced by false",
      apply: (e) => {
        aiOf(e).params.nothing = false;
      },
    },
    {
      name: "an array element",
      apply: (e) => {
        aiOf(e).params.list = [1, "b", 2.5];
      },
    },
    {
      name: "an added param key",
      apply: (e) => {
        aiOf(e).params.extra = 7;
      },
    },
    {
      name: "wakeTick",
      apply: (e) => {
        aiOf(e).wakeTick += 1;
      },
    },
    {
      name: "nextThinkTick",
      apply: (e) => {
        aiOf(e).nextThinkTick += 1;
      },
    },
    {
      name: "the component removed",
      apply: (e) => {
        e.ai = null;
      },
    },
  ],
  repairs: [
    {
      name: "+ 1",
      apply: (e) => {
        e.repairs += 1;
      },
    },
  ],
  energy: [
    {
      name: "- 1",
      apply: (e) => {
        e.energy -= 1;
      },
    },
  ],
  maxEnergy: [
    {
      name: "+ 1",
      apply: (e) => {
        e.maxEnergy += 1;
      },
    },
  ],
  energyRechargeRate: [
    {
      name: "+ 1",
      apply: (e) => {
        e.energyRechargeRate += 1;
      },
    },
  ],
  // The v4 fields (Phase 15, FOUND-18): every leaf changes the entity hash.
  velocity: [
    {
      name: "x + 1",
      apply: (e) => {
        e.velocity = vec(e.velocity.x + 1, e.velocity.y, e.velocity.z);
      },
    },
    {
      name: "removed (pristine)",
      apply: (e) => {
        e.velocity = vec(0, 0, 0);
      },
    },
  ],
  weapon: [
    {
      name: "temperature + 1",
      apply: (e) => {
        e.weapon.temperature += 1;
      },
    },
    {
      name: "lastShotTick + 1",
      apply: (e) => {
        e.weapon.lastShotTick += 1;
      },
    },
    {
      name: "missedShots + 1",
      apply: (e) => {
        e.weapon.missedShots += 1;
      },
    },
  ],
  cargo: [
    {
      name: "+ 1",
      apply: (e) => {
        e.cargo += 1;
      },
    },
  ],
  // The steering record (plan 14-08): one mutation per field group, each far
  // above `canon`'s resolution.
  steer: [
    ...(
      [
        "flightRoll",
        "flightPitch",
        "stickRoll",
        "stickPitch",
        "successFactor",
      ] as const
    ).map((field): Mutation => ({
      name: field,
      apply: (e) => {
        e.steer[field] += 1;
      },
    })),
    {
      name: "accuracy",
      apply: (e) => {
        e.steer.accuracy = e.steer.accuracy === 7 ? 6 : 7;
      },
    },
    {
      name: "frustration",
      apply: (e) => {
        e.steer.frustration += 1;
      },
    },
    {
      name: "pitchingOver",
      apply: (e) => {
        e.steer.pitchingOver = !e.steer.pitchingOver;
      },
    },
    {
      name: "jink",
      apply: (e) => {
        e.steer.jink = vec(e.steer.jink.x, e.steer.jink.y + 1, e.steer.jink.z);
      },
    },
    {
      name: "proximityAlert",
      apply: (e) => {
        e.steer.proximityAlert += 1;
      },
    },
    {
      name: "escortSlot",
      apply: (e) => {
        e.steer.escortSlot = (e.steer.escortSlot + 1) % (MAX_ESCORT_SLOT + 1);
      },
    },
    {
      name: "a tracking tick",
      apply: (e) => {
        e.steer.trackingTicks[3] -= 1;
      },
    },
    {
      name: "a tracking position",
      apply: (e) => {
        const p = e.steer.trackingPositions[1];
        e.steer.trackingPositions[1] = vec(p.x + 1, p.y, p.z);
      },
    },
    {
      name: "the curve removed (count 0)",
      apply: (e) => {
        e.steer.trackingCount = 0;
      },
    },
    {
      name: "saved removed",
      apply: (e) => {
        e.steer.saved = null;
      },
    },
    {
      name: "saved behaviour",
      apply: (e) => {
        if (e.steer.saved !== null) e.steer.saved.behaviour = "IDLE";
      },
    },
    {
      name: "saved targetId",
      apply: (e) => {
        if (e.steer.saved !== null) e.steer.saved.targetId += 1;
      },
    },
    {
      name: "saved desiredRange",
      apply: (e) => {
        if (e.steer.saved !== null) e.steer.saved.desiredRange += 1;
      },
    },
    {
      name: "saved desiredSpeed",
      apply: (e) => {
        if (e.steer.saved !== null) e.steer.saved.desiredSpeed += 1;
      },
    },
    {
      name: "saved destination",
      apply: (e) => {
        if (e.steer.saved !== null) {
          const d = e.steer.saved.destination;
          e.steer.saved.destination = vec(d.x, d.y, d.z + 1);
        }
      },
    },
    {
      name: "entryPending",
      apply: (e) => {
        e.steer.entryPending = !e.steer.entryPending;
      },
    },
  ],
};

const ENTITY_FIELD_CASES = Object.keys(ENTITY_FIELDS)
  .sort()
  .flatMap((field) =>
    ENTITY_FIELDS[field as keyof Entity].map(
      (mutation) => [`${field}: ${mutation.name}`, mutation] as const,
    ),
  );

describe("the serializer and the codec cover the same entity fields", () => {
  it("has a mutation for every field except the identity and the dead flag", () => {
    const empty = Object.keys(ENTITY_FIELDS)
      .filter((field) => ENTITY_FIELDS[field as keyof Entity].length === 0)
      .sort();
    expect(empty).toEqual(["dead", "id"]);
  });

  it.each(ENTITY_FIELD_CASES.map((row) => [...row]))(
    "%s changes only that entity's hash and survives the round trip",
    (_name, mutation) => {
      const world = richWorld();
      const target = world.store.live[0] as Entity;
      const others = world.store.live
        .slice(1)
        .map((entity) => [entity.id, hashOf(world, entity.id)]);
      const before = hashOf(world, target.id);
      mutation.apply(target);
      expect(hashOf(world, target.id)).not.toBe(before);
      expect(others).toEqual(
        world.store.live
          .slice(1)
          .map((entity) => [entity.id, hashOf(world, entity.id)]),
      );
      const text = JSON.stringify(snapshotWorld(world));
      const restored = restoreWorld(
        parseWorldSnapshot(JSON.parse(text) as unknown),
      );
      expect(entityHashes(restored)).toEqual(entityHashes(world));
      expect(JSON.stringify(snapshotWorld(restored))).toBe(text);
    },
  );
});

describe("the serializer and the codec cover the same world-level fields", () => {
  const WORLD_FIELDS: Record<
    "worldSeed" | "nextId" | "rng" | "aiDropped",
    (world: World) => void
  > = {
    worldSeed: (w) => {
      (w as { worldSeed: number }).worldSeed = w.worldSeed + 1;
    },
    nextId: (w) => {
      const extra = spawnOk(w, shipInit(9, null));
      killEntity(w, extra.id);
      commitWorld(w);
    },
    rng: (w) => {
      w.rng.s = (w.rng.s + 1) >>> 0;
    },
    aiDropped: (w) => {
      w.aiDropped += 1;
    },
  };

  it.each(Object.keys(WORLD_FIELDS))(
    "%s changes the world section and survives the round trip",
    (field) => {
      const world = richWorld();
      const before = serializeWorldSection(world);
      WORLD_FIELDS[field as keyof typeof WORLD_FIELDS](world);
      expect(serializeWorldSection(world)).not.toBe(before);
      const snapshot = snapshotWorld(world);
      expect(typeof snapshot.rng).toBe("number");
      expect(snapshot.rng).toBe(world.rng.s);
      expect(snapshot.worldSeed).toBe(world.worldSeed);
      expect(snapshot.nextId).toBe(world.store.nextId);
      expect(snapshot.aiDropped).toBe(world.aiDropped);
      const restored = restoreWorld(
        parseWorldSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown),
      );
      expect(serializeWorldSection(restored)).toBe(
        serializeWorldSection(world),
      );
    },
  );
});

// ---------------------------------------------------------------------------
// The sanitizer and the parser agree

const EDGE_NUMBERS = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  -0,
  0,
  1e200,
  -1e200,
  1e13,
  1e12,
  -1,
  1.5,
  2 ** 32,
  2 ** 32 - 1,
  Number.MAX_SAFE_INTEGER,
  1e-200,
];

const num = fc.oneof(
  fc.double(),
  fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  fc.constantFrom(...EDGE_NUMBERS),
  fc.integer({ min: -1000, max: 1000 }),
);

const vecArb = fc.record({ x: num, y: num, z: num });

const QUAT_CASES = [
  { w: 1, x: 0, y: 0, z: 0 },
  { w: 0, x: 1, y: 0, z: 0 },
  { w: 1e-160, x: 0, y: 0, z: 0 },
  { w: 3e-161, x: 0, y: 0, z: 0 },
  { w: 1 + 2.5e-10, x: 0, y: 0, z: 0 },
  { w: 1e-200, x: 1e-200, y: 1e-200, z: 1e-200 },
  { w: 2, x: 0, y: 0, z: 0 },
  { w: 0, x: 0, y: 0, z: 0 },
];

const unitQuat = fc
  .tuple(
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }),
  )
  .map(([w, x, y, z]) => normalize(quat(w, x, y, z)));

const quatArb = fc.oneof(
  fc.constantFrom(...QUAT_CASES),
  fc.record({ w: num, x: num, y: num, z: num }),
  unitQuat,
);

const enumLeaf = (valid: readonly string[]) =>
  fc.oneof(
    fc.constantFrom(...valid),
    fc.string({ maxLength: 12 }),
    fc.constantFrom("constructor", "__proto__", "toString", ""),
  );

const paramKey = fc.oneof(
  fc.string({ maxLength: 6 }),
  fc.constantFrom(
    "",
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "k".repeat(MAX_SNAPSHOT_STRING_LENGTH + 1),
  ),
);

const paramScalar = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  num,
  fc.string({ maxLength: MAX_SNAPSHOT_STRING_LENGTH + 40 }),
);

const paramArray = fc.array(
  fc.oneof(num, fc.string({ maxLength: 160 }), fc.constant(null), fc.boolean()),
  { maxLength: MAX_SNAPSHOT_PARAM_LENGTH + 16 },
);

const paramsArb = fc
  .oneof(
    fc.array(fc.tuple(paramKey, fc.oneof(paramScalar, paramArray)), {
      maxLength: MAX_AI_PARAMS_KEYS + 8,
    }),
    fc.constant(
      Array.from(
        { length: MAX_AI_PARAMS_KEYS + 8 },
        (_, i) => [`key${String(i)}`, i] as const,
      ),
    ),
  )
  .map((pairs) => {
    const params = Object.create(null) as Record<string, ParamValue>;
    for (const [key, value] of pairs) params[key] = value as ParamValue;
    return params;
  });

/** Four strictly decreasing signed ticks: a legitimate started curve. */
const decreasingTicks = fc
  .uniqueArray(fc.integer({ min: -1000, max: 1000 }), {
    minLength: 4,
    maxLength: 4,
  })
  .map((ticks) => ticks.sort((a, b) => b - a));

const tickList = fc.oneof(
  decreasingTicks,
  fc.array(num, { minLength: 4, maxLength: 4 }),
  fc.array(num, { maxLength: 6 }),
);

const positionList = fc.oneof(
  fc.array(vecArb, { minLength: 4, maxLength: 4 }),
  fc.array(vecArb, { maxLength: 6 }),
);

const savedArb = fc.oneof(
  fc.constant(null),
  fc.record({
    behaviour: enumLeaf(BEHAVIOUR_IDS),
    targetId: num,
    desiredRange: num,
    desiredSpeed: num,
    destination: vecArb,
  }),
);

const fieldsArb = fc.record(
  {
    kind: enumLeaf(ENTITY_KINDS),
    scanClass: enumLeaf(SCAN_CLASSES),
    behaviour: enumLeaf(BEHAVIOUR_IDS),
    aiKey: enumLeaf(["test-pilot"]),
    position: vecArb,
    destination: vecArb,
    orientation: quatArb,
    radius: num,
    speed: num,
    desiredSpeed: num,
    desiredRange: num,
    specKey: fc.oneof(
      fc.string({ maxLength: 200 }),
      fc.constantFrom("", "k".repeat(MAX_SNAPSHOT_STRING_LENGTH + 1), "ship"),
    ),
    ownerId: num,
    spawnTick: num,
    targetId: num,
    rngAi: num,
    rngCombat: num,
    repairs: num,
    energy: num,
    maxEnergy: num,
    energyRechargeRate: num,
    wakeTick: num,
    nextThinkTick: num,
    params: paramsArb,
    flightRoll: num,
    flightPitch: num,
    stickRoll: num,
    stickPitch: num,
    accuracy: fc.oneof(num, fc.constantFrom(-100, -5, 10, 11, -6)),
    frustration: num,
    successFactor: num,
    pitchingOver: fc.oneof(fc.boolean(), fc.constant(1)),
    entryPending: fc.oneof(fc.boolean(), fc.constant("yes")),
    jink: vecArb,
    proximityAlert: num,
    escortSlot: fc.oneof(num, fc.integer({ min: 0, max: 15 })),
    trackingCount: fc.oneof(fc.constantFrom(0, 4), fc.constantFrom(0, 4), num),
    trackingTicks: tickList,
    trackingPositions: positionList,
    saved: savedArb,
    // The v4 fields (Phase 15, FOUND-18): in-domain and out-of-domain leaves.
    velocity: fc.oneof(
      vecArb,
      fc.record({
        x: fc.integer({ min: -10001, max: 10001 }),
        y: fc.integer({ min: -10001, max: 10001 }),
        z: fc.integer({ min: -10001, max: 10001 }),
      }),
    ),
    weaponTemperature: fc.oneof(
      num,
      fc.double({ min: 0, max: 1001, noNaN: true }),
    ),
    weaponLastShotTick: fc.oneof(num, fc.integer({ min: 0, max: 5000 })),
    weaponMissedShots: fc.oneof(num, fc.integer({ min: 0, max: 50 })),
    cargo: fc.oneof(num, fc.integer({ min: -2, max: 202 })),
  },
  { requiredKeys: [] },
);

type Fields = typeof fieldsArb extends fc.Arbitrary<infer T> ? T : never;

/** Write the generated values straight onto the live entity, bypassing spawn. */
function applyFields(entity: Entity, f: Fields): void {
  if (f.kind !== undefined) (entity as { kind: string }).kind = f.kind;
  if (f.scanClass !== undefined) {
    (entity as { scanClass: string }).scanClass = f.scanClass;
  }
  if (f.behaviour !== undefined) {
    (entity.nav as { behaviour: string }).behaviour = f.behaviour;
  }
  if (f.position !== undefined) entity.position = f.position;
  if (f.destination !== undefined) entity.nav.destination = f.destination;
  if (f.orientation !== undefined) entity.orientation = f.orientation;
  if (f.radius !== undefined) entity.radius = f.radius;
  if (f.speed !== undefined) entity.speed = f.speed;
  if (f.desiredSpeed !== undefined) entity.nav.desiredSpeed = f.desiredSpeed;
  if (f.desiredRange !== undefined) entity.nav.desiredRange = f.desiredRange;
  if (f.specKey !== undefined) entity.specKey = f.specKey;
  if (f.ownerId !== undefined) entity.ownerId = f.ownerId;
  if (f.spawnTick !== undefined) entity.spawnTick = f.spawnTick;
  if (f.targetId !== undefined) entity.nav.targetId = f.targetId;
  if (f.rngAi !== undefined) entity.rng.ai = f.rngAi;
  if (f.rngCombat !== undefined) entity.rng.combat = f.rngCombat;
  if (f.repairs !== undefined) entity.repairs = f.repairs;
  if (f.energy !== undefined) entity.energy = f.energy;
  if (f.maxEnergy !== undefined) entity.maxEnergy = f.maxEnergy;
  if (f.energyRechargeRate !== undefined) {
    entity.energyRechargeRate = f.energyRechargeRate;
  }
  const steer = loose(entity.steer);
  if (f.flightRoll !== undefined) steer.flightRoll = f.flightRoll;
  if (f.flightPitch !== undefined) steer.flightPitch = f.flightPitch;
  if (f.stickRoll !== undefined) steer.stickRoll = f.stickRoll;
  if (f.stickPitch !== undefined) steer.stickPitch = f.stickPitch;
  if (f.accuracy !== undefined) steer.accuracy = f.accuracy;
  if (f.frustration !== undefined) steer.frustration = f.frustration;
  if (f.successFactor !== undefined) steer.successFactor = f.successFactor;
  if (f.pitchingOver !== undefined) steer.pitchingOver = f.pitchingOver;
  if (f.entryPending !== undefined) steer.entryPending = f.entryPending;
  if (f.jink !== undefined) steer.jink = f.jink;
  if (f.proximityAlert !== undefined) steer.proximityAlert = f.proximityAlert;
  if (f.escortSlot !== undefined) steer.escortSlot = f.escortSlot;
  if (f.trackingCount !== undefined) steer.trackingCount = f.trackingCount;
  if (f.trackingTicks !== undefined) steer.trackingTicks = f.trackingTicks;
  if (f.trackingPositions !== undefined) {
    steer.trackingPositions = f.trackingPositions;
  }
  if (f.saved !== undefined) steer.saved = f.saved;
  if (f.velocity !== undefined) entity.velocity = f.velocity;
  if (f.weaponTemperature !== undefined) {
    entity.weapon.temperature = f.weaponTemperature;
  }
  if (f.weaponLastShotTick !== undefined) {
    entity.weapon.lastShotTick = f.weaponLastShotTick;
  }
  if (f.weaponMissedShots !== undefined) {
    entity.weapon.missedShots = f.weaponMissedShots;
  }
  if (f.cargo !== undefined) entity.cargo = f.cargo;
  if (entity.ai !== null) {
    const ai = entity.ai;
    if (f.aiKey !== undefined) (ai as { aiKey: string }).aiKey = f.aiKey;
    if (f.wakeTick !== undefined) ai.wakeTick = f.wakeTick;
    if (f.nextThinkTick !== undefined) ai.nextThinkTick = f.nextThinkTick;
    if (f.params !== undefined) ai.params = f.params;
  }
}

describe("sanitizer and parser agree across every entity leaf", () => {
  it("snapshots, parses and restores every sanitized world, and sanitizing twice changes nothing", () => {
    const player = initFlightState(layout);
    let survivors = 0;
    let withAi = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_UINT32 }),
        fc.array(fc.tuple(fc.boolean(), fieldsArb), {
          minLength: 1,
          maxLength: 4,
        }),
        (seed, specs) => {
          const world = createWorld(seed);
          specs.forEach(([ai], index) => {
            spawnOk(world, shipInit(index, ai ? createTestPilotAi(0) : null));
          });
          expect(world.store.live.length).toBe(specs.length);
          world.store.live.forEach((entity, index) => {
            applyFields(entity, (specs[index] as (typeof specs)[number])[1]);
          });
          for (const entity of world.store.live) sanitizeEntity(entity);
          // An unknown kind makes sanitize kill the entity; commit removes it.
          commitWorld(world);
          survivors += world.store.live.length;
          withAi += world.store.live.filter((e) => e.ai !== null).length;

          expect(() => hashWorld(player, world)).not.toThrow();
          const text = JSON.stringify(snapshotWorld(world));
          const parsed = parseWorldSnapshot(JSON.parse(text) as unknown);
          const restored = restoreWorld(parsed);
          expect(entityHashes(restored)).toEqual(entityHashes(world));
          expect(JSON.stringify(snapshotWorld(restored))).toBe(text);

          // Sanitize is idempotent: a second call repairs nothing.
          for (const entity of world.store.live) {
            expect(sanitizeEntity(entity)).toBe(false);
          }
          expect(JSON.stringify(snapshotWorld(world))).toBe(text);
        },
      ),
      { numRuns: 300 },
    );
    // The property was not vacuous: entities and AI components survived.
    expect(survivors).toBeGreaterThan(0);
    expect(withAi).toBeGreaterThan(0);
  });
});
