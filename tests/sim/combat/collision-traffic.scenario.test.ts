// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * A populated, non-frozen world with collisions on (plan 18-21, review
 * L191@2e0bfb3): the world-scale evidence the frozen QUAL-11 run cannot give,
 * because QUAL-11 never enables collisions.
 *
 * Two Lave worlds of epochs outside the acceptance set (101 and 202) are
 * populated as a traffic-on session populates them (`createInertPopulate` over
 * the committed records) and stepped 4,000 ticks each with the options
 * `buildStepOptions` gives a traffic-on session: collisions on, the full hull
 * table (ships and statics), the NPC weapons, flight table, masses and debris
 * content. A traffic-on session's populated ships are inert and sit hundreds
 * of kilometres apart on their lanes (measured: with pilots at their populated
 * positions no contact, kill or buoy alert happens in 4,000 ticks), so each
 * seed gathers them and gives each a flight-script pilot: epoch 101 by the
 * acceptance harness's parking-frame set-up near the station, epoch 202 in a
 * column on the witchpoint beacon's +z side, intercepting the player beyond
 * it.
 *
 * Per seed the run prints the contacts by pair kind, the kills and their
 * causes and the buoy alerts for the SUMMARY. It pins no count; it asserts
 * sanity bounds only: every tick's hash computes, no world or flight value is
 * non-finite, no pair is answered twice in one tick, kills never exceed the
 * ships spawned, and both buoys' offsets stay within `MAX_BUOY_OFFSET`.
 *
 * A collision posts a `shipHit` for each side in its tick; a laser hit posts
 * one, from a shooter that fired that tick. So a source that fired no laser in
 * the tick hits only by contact, and a contact is a pair of opposite records.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildStepOptions } from "../../../src/app/session/step-options.js";
import {
  createInertPopulate,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import type { TrafficContent } from "../../../src/app/session/traffic.js";
import { ExplosionCatalogueSchema } from "../../../src/content/schemas/explosion.js";
import { DebrisCatalogueSchema } from "../../../src/content/schemas/ship-debris.js";
import { NpcShipCatalogueSchema } from "../../../src/content/schemas/ship-npc.js";
import { createFlightScriptAi } from "../../../src/sim/ai/pilots/flight-script.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { statsFor } from "../../../src/sim/npc/stats.js";
import { worldSeedFor } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import {
  MAIN_STATION_ID,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import type { EntityId } from "../../../src/sim/world/ids.js";
import { MAX_BUOY_OFFSET } from "../../../src/sim/world/limits.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveDockGeometry } from "../../helpers/dock-pose.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { LAVE_SYSTEM_ID, laveFixture } from "../../helpers/lave.js";
import { setUpSeed } from "../../acceptance/detectors.js";

const TICKS = 4_000;
/** The intercept goal range of the beacon seed (the player is the target). */
const INTERCEPT_RANGE_M = 200;

const SEEDS = [
  { epoch: 101, build: "parked" },
  { epoch: 202, build: "beacon" },
] as const;

function readJson(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8"),
  );
}

/** The traffic content as the traffic-on boot load builds it (start-session.ts). */
function content(): TrafficContent {
  return trafficContent(
    NpcShipCatalogueSchema.parse(
      readJson("src/content/generated/ships-npc.json"),
    ),
    {
      debris: DebrisCatalogueSchema.parse(
        readJson("src/content/generated/ships-debris.json"),
      ),
      explosions: ExplosionCatalogueSchema.parse(
        readJson("src/content/generated/explosions.json"),
      ),
    },
  );
}

type PairKind =
  | "ship-ship"
  | "ship-buoy"
  | "ship-pod"
  | "ship-station"
  | "player-any"
  | "other";

interface SeedReport {
  readonly epoch: number;
  readonly ships: number;
  readonly contacts: Record<PairKind, number>;
  readonly kills: { laser: number; collision: number; other: number };
  readonly buoyAlertTicks: number;
  readonly shipsAlertedByBuoy: number;
  readonly buoyOffsets: { witchpoint: number; navBuoy: number };
  readonly buoysDestroyed: number;
}

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isBuoyId(id: EntityId): boolean {
  // the buoys (4, 5) and their frangible subentities (6, 7)
  return (
    id === WITCHPOINT_BUOY_ID ||
    id === STATION_NAV_BUOY_ID ||
    id === WITCHPOINT_BUOY_ID + 2 ||
    id === STATION_NAV_BUOY_ID + 2
  );
}

function kindOf(world: World, id: EntityId): string {
  if (id === PLAYER_ID) return "player";
  if (isBuoyId(id)) return "buoy";
  if (id === MAIN_STATION_ID) return "station";
  const entity = world.store.get(id);
  if (entity === undefined) return "gone";
  return entity.kind === "cargo" || entity.kind === "wreckage"
    ? "pod"
    : entity.kind;
}

function pairKind(a: string, b: string): PairKind {
  if (a === "player" || b === "player") return "player-any";
  const pair = [a, b].sort().join("-");
  if (pair === "ship-ship") return "ship-ship";
  if (pair === "buoy-ship") return "ship-buoy";
  if (pair === "pod-ship") return "ship-pod";
  if (pair === "ship-station") return "ship-station";
  return "other";
}

interface SeedWorld {
  readonly world: World;
  readonly player: FlightState;
}

/**
 * Epoch 101: the acceptance harness's set-up (`setUpSeed`, read only): the
 * populated ships moved to the parking-frame starts near the station, each
 * with its flight-script pilot (station, intercept, flee, attack without fire,
 * escort, face), the player parked by the parking rule.
 */
function parkedSeed(epoch: number): SeedWorld {
  const setup = setUpSeed(epoch, { withAi: true });
  return { world: setup.world, player: setup.player };
}

/**
 * Epoch 202: the populated ships in a column on the witchpoint beacon's +z
 * side, ship i 3,000 + 400 i metres out and 100 m off the axis (spread round
 * it), each intercepting the player at its maximum speed, while the player
 * waits at rest 1,500 m beyond the beacon on -z: every course passes within
 * about 100 m of the beacon.
 */
function beaconSeed(epoch: number, traffic: TrafficContent): SeedWorld {
  const { layout } = laveFixture();
  const world = createWorld(
    worldSeedFor(marketSeedForSystem(LAVE_SYSTEM_ID), epoch),
  );
  createInertPopulate(
    () => traffic,
    () => layout,
  )(world, { traffic: true });
  const player: FlightState = initFlightState(layout);
  player.mode = "inFlight";
  player.position = vec(0, 0, -1_500);
  player.orientation = identity();
  player.speed = 0;
  const ships = world.store.live.filter((entity) => entity.kind === "ship");
  ships.forEach((ship, index) => {
    const angle = (2 * Math.PI * index) / ships.length;
    ship.position = vec(
      100 * Math.cos(angle),
      100 * Math.sin(angle),
      3_000 + 400 * index,
    );
    ship.orientation = identity();
    ship.speed = 0;
    ship.ai = createFlightScriptAi(player.tick, {
      script: "intercept",
      targetId: PLAYER_ID,
      range: INTERCEPT_RANGE_M,
      speed: statsFor(traffic.flight, ship.specKey).maxFlightSpeed,
    });
  });
  return { world, player };
}

function runSeed(epoch: number, build: "parked" | "beacon"): SeedReport {
  const { layout, config, system } = laveFixture();
  const traffic = content();
  const { world, player } =
    build === "parked" ? parkedSeed(epoch) : beaconSeed(epoch, traffic);
  const ships = world.store.live.filter((entity) => entity.kind === "ship");

  const options = buildStepOptions({
    fuel: 7,
    system,
    target: undefined,
    equipment: new Set<string>(),
    dock: laveDockGeometry(),
    shipMasses: traffic.masses,
    laserMounts: DEFAULT_LASER_MOUNTS,
    hulls: fullHullTable(),
    npcWeapons: traffic.weapons,
    npcFlight: traffic.flight,
    ...(traffic.debris === undefined ? {} : { debris: traffic.debris }),
  });
  expect(options.combat?.collisions).toBe(true);

  const contacts: Record<PairKind, number> = {
    "ship-ship": 0,
    "ship-buoy": 0,
    "ship-pod": 0,
    "ship-station": 0,
    "player-any": 0,
    other: 0,
  };
  const kills = { laser: 0, collision: 0, other: 0 };
  let buoyAlertTicks = 0;
  const alertedByBuoy = new Set<EntityId>();
  let buoysDestroyed = 0;

  for (let t = 1; t <= TICKS; t += 1) {
    // kinds before the step: a body killed this tick is still classified
    const before = new Map<EntityId, string>();
    for (const entity of world.store.live) {
      before.set(entity.id, kindOf(world, entity.id));
    }
    const kindNow = (id: EntityId): string =>
      before.get(id) ?? kindOf(world, id);

    const events = stepSim(
      player,
      world,
      layout,
      config,
      ZERO_INTENT,
      [],
      DT,
      options,
      undefined,
    );

    // the hash computes on every tick
    expect(() => hashWorld(player, world)).not.toThrow();

    const shooters = new Set<EntityId>();
    for (const event of events) {
      if (event.kind === "laserFired") shooters.add(event.shooter);
    }
    const contactRecords = new Map<string, number>();
    for (const event of events) {
      if (event.kind !== "shipHit") continue;
      if (shooters.has(event.source)) continue;
      const key = `${String(event.target)}<${String(event.source)}`;
      contactRecords.set(key, (contactRecords.get(key) ?? 0) + 1);
    }
    // no pair is answered twice in one tick
    for (const [key, count] of contactRecords) {
      expect(count, `tick ${String(t)} pair ${key}`).toBe(1);
    }
    const counted = new Set<string>();
    for (const key of contactRecords.keys()) {
      const [target, source] = key.split("<").map(Number) as [number, number];
      const unordered =
        target < source
          ? `${String(target)}-${String(source)}`
          : `${String(source)}-${String(target)}`;
      if (counted.has(unordered)) continue;
      counted.add(unordered);
      contacts[pairKind(kindNow(target), kindNow(source))] += 1;
    }
    // a kill's cause: a contact record on the victim this tick, else a laser
    // record from a shooter that fired this tick, else neither
    const laserVictims = new Set<EntityId>();
    for (const event of events) {
      if (event.kind === "shipHit" && shooters.has(event.source)) {
        laserVictims.add(event.target);
      }
    }
    const contactVictims = new Set<EntityId>(
      [...contactRecords.keys()].map((key) => Number(key.split("<")[0])),
    );
    for (const event of events) {
      if (event.kind !== "shipDestroyed") continue;
      if (isBuoyId(event.id)) buoysDestroyed += 1;
      if (contactVictims.has(event.id)) kills.collision += 1;
      else if (laserVictims.has(event.id)) kills.laser += 1;
      else kills.other += 1;
    }

    let buoyAlert = false;
    for (const entity of world.store.live) {
      if (entity.dead) continue;
      // no world value is non-finite
      expect(finiteVec(entity.position), `entity ${String(entity.id)}`).toBe(
        true,
      );
      expect(Number.isFinite(entity.speed)).toBe(true);
      if (
        entity.steer.proximityAlert === WITCHPOINT_BUOY_ID ||
        entity.steer.proximityAlert === STATION_NAV_BUOY_ID
      ) {
        buoyAlert = true;
        alertedByBuoy.add(entity.id);
      }
    }
    if (buoyAlert) buoyAlertTicks += 1;
    expect(finiteVec(player.position)).toBe(true);
    expect(finiteVec(player.drift)).toBe(true);
    expect(Number.isFinite(player.speed)).toBe(true);
    for (const key of ["witchpoint", "navBuoy"] as const) {
      const offset = world.buoys[key].offset;
      expect(finiteVec(offset)).toBe(true);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(MAX_BUOY_OFFSET);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(MAX_BUOY_OFFSET);
      expect(Math.abs(offset.z)).toBeLessThanOrEqual(MAX_BUOY_OFFSET);
    }
  }

  const killed = kills.laser + kills.collision + kills.other - buoysDestroyed;
  expect(killed).toBeLessThanOrEqual(ships.length);
  const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
  return {
    epoch,
    ships: ships.length,
    contacts,
    kills,
    buoyAlertTicks,
    shipsAlertedByBuoy: alertedByBuoy.size,
    buoyOffsets: {
      witchpoint: length(world.buoys.witchpoint.offset),
      navBuoy: length(world.buoys.navBuoy.offset),
    },
    buoysDestroyed,
  };
}

describe("a populated world with collisions on (plan 18-21, review L191@2e0bfb3)", () => {
  for (const { epoch, build } of SEEDS) {
    it(`epoch ${String(epoch)} (${build}): 4,000 ticks under the traffic-on options hold the sanity bounds`, () => {
      const report = runSeed(epoch, build);
      console.log(`COLLISION-TRAFFIC ${JSON.stringify(report)}`);
      expect(report.ships).toBeGreaterThan(0);
    }, 300_000);
  }
});
