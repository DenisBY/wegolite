// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Per-facing NPC fire (FOUND-20; ROADMAP implied work of Phase 21, plan 21-12).
 *
 * The fire queue holds `FireRequest { id, facing }`; the drain picks the
 * facing's weapon, temperature, ray and on-target sign, and writes the heat to
 * that facing's temperature (`ShipEntity.m:9851-9993`). Aft firing by an AI is
 * Phase 23 (CBT-19): every request here is queued by a test through
 * `ShipControl.fire(id, facing)`.
 *
 * The expected numbers are derived by hand from the rules the plan cites (the
 * anaconda's compiled aft pulse laser, the gate's draws and rolls, the float32
 * cooling step), never from a run. The gate cases call `resolveShots` once per
 * tick, which is the drain, the recharge and the cooling without the world
 * step, as `tests/sim/combat/npc-fire.test.ts` does.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { AI_REGISTRY } from "../../../src/sim/ai/registry.js";
import {
  LASER_STATS,
  toWegoliteLocal,
} from "../../../src/sim/combat/constants.js";
import type { NpcWeapons } from "../../../src/sim/combat/aim.js";
import {
  FACINGS,
  DEFAULT_LASER_MOUNTS,
} from "../../../src/sim/combat/mounts.js";
import type { Facing } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import {
  compareFireRequests,
  resolveShots,
} from "../../../src/sim/combat/step.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { add, identity, rotate, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { coolWeapon, onTargetCone } from "../../../src/sim/npc/fire.js";
import {
  PLAYER_COLLISION_RADIUS_M,
  flightTableFrom,
  statsFor,
} from "../../../src/sim/npc/stats.js";
import type {
  FlightRecord,
  NpcFlightStats,
} from "../../../src/sim/npc/stats.js";
import { INERT_RECORD_KEYS } from "../../../src/sim/world/populate.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import { DT } from "../../../src/sim/time.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { MAX_WEAPON_TEMPERATURE } from "../../../src/sim/world/limits.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  MAX_FIRE_REQUESTS,
  createWorld,
  requestFire,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { FireRequest, World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();
const WEAPONS = realNpcWeapons();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

/** Turned half a turn about up: the ship's nose points at +Z (at the player). */
const FACING_PLUS_Z: Quat = { w: 0, x: 0, y: 1, z: 0 };

const PULSE = LASER_STATS.EQ_WEAPON_PULSE_LASER;
const SHIP_RADIUS = 30;
const ACCURACY = 2;
/** A hit bound: the gate's roll passes within a few ticks at this range. */
const TICK_BOUND = 400;

function options(): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      npcWeapons: WEAPONS,
    },
  };
}

function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = 0;
  return state;
}

/** `distance` metres from the player along -Z: the player is at the ship's tail. */
function behind(distance: number): Vec3 {
  return vec(FAR.x, FAR.y, FAR.z - distance);
}

/**
 * A ship the gate may serve: an AI component, a resolved accuracy and the
 * player as its nav target. `facingPlayer` turns its nose at the player;
 * otherwise (identity) the player is dead astern.
 */
function armed(
  world: World,
  specKey: string,
  distance: number,
  facingPlayer: boolean,
  extra: Partial<SpawnInit> = {},
): Entity {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass: "CLASS_NEUTRAL",
      position: behind(distance),
      orientation: facingPlayer ? FACING_PLUS_Z : identity(),
      radius: SHIP_RADIUS,
      maxEnergy: 700,
      ai: createTestPilotAi(0),
      ...extra,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  result.entity.steer.accuracy = ACCURACY;
  result.entity.nav.targetId = PLAYER_ID;
  return result.entity;
}

/** The gate's range reading for a player `distance` metres away. */
function rangeAt(distance: number): number {
  return distance - PLAYER_COLLISION_RADIUS_M - SHIP_RADIUS;
}

function resolve(
  world: World,
  player: FlightState,
  combat = createPlayerCombatState(),
): SimEvent[] {
  return resolveShots(
    world,
    true,
    player,
    combat,
    [],
    options(),
    DT,
    layout,
    AI_REGISTRY,
  );
}

function ofKind<K extends SimEvent["kind"]>(
  events: readonly SimEvent[],
  kind: K,
): Extract<SimEvent, { kind: K }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: K }> => event.kind === kind,
  );
}

/**
 * Ask for `facings` each tick until a `laserFired` of `ship` shows or the bound
 * runs out; returns that tick's events (empty list when nothing fired).
 */
function fireUntilShot(
  world: World,
  player: FlightState,
  ship: Entity,
  facings: readonly Facing[],
): SimEvent[] {
  const control = createShipControl(world, ship.id, 0);
  for (let i = 0; i < TICK_BOUND; i += 1) {
    player.tick += 1;
    for (const facing of facings) control.fire(ship.id, facing);
    const events = resolve(world, player);
    if (ofKind(events, "laserFired").some((e) => e.shooter === ship.id)) {
      return events;
    }
  }
  return [];
}

describe("one aft shot end to end (tracer, FOUND-20)", () => {
  it("fires the anaconda's aft pulse laser at a target dead astern, heating the aft temperature only", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const ship = armed(world, "anaconda", 3000, false);
    const record = WEAPONS.get("anaconda") as NpcWeapons;
    expect(record.aft?.laser).toBe("EQ_WEAPON_PULSE_LASER");

    const events = fireUntilShot(world, player, ship, ["aft"]);
    const fired = ofKind(events, "laserFired");
    expect(fired).toHaveLength(1);
    const shot = fired[0];
    // The ray starts at the aft mount (Oolite z negated into Wegolite's frame,
    // rotated by the identity) and runs toward the tail: +Z.
    const origin = add(
      ship.position,
      rotate(ship.orientation, toWegoliteLocal(record.aft?.offset as Vec3)),
    );
    expect(shot?.from).toEqual(origin);
    expect((shot?.to.z as number) > origin.z).toBe(true);
    expect(shot?.laserKind).toBe(PULSE.laserKind);
    // A hit record reached the player.
    const hits = ofKind(events, "shipHit");
    expect(
      hits.some((h) => h.target === PLAYER_ID && h.source === ship.id),
    ).toBe(true);
    // The aft temperature rose by the pulse laser's heat; the forward one did not.
    expect(ship.weapon.aftTemperature).toBe(
      Math.fround(Math.fround(PULSE.shotTemperature) - Math.fround(6 * DT)),
    );
    expect(ship.weapon.temperature).toBe(0);
    expect(ship.weapon.portTemperature).toBe(0);
    expect(ship.weapon.starboardTemperature).toBe(0);
    expect(ship.weapon.lastShotTick).toBe(player.tick);
  });

  it("fire(id) with no facing is the forward shot: same ray origin, heat on the forward temperature", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const ship = armed(world, "anaconda", 3000, true);
    const record = WEAPONS.get("anaconda") as NpcWeapons;
    const control = createShipControl(world, ship.id, 0);
    let events: SimEvent[] = [];
    for (let i = 0; i < TICK_BOUND; i += 1) {
      player.tick += 1;
      control.fire(ship.id);
      events = resolve(world, player);
      if (ofKind(events, "laserFired").length > 0) break;
    }
    const shot = ofKind(events, "laserFired")[0];
    expect(shot?.from).toEqual(
      add(
        ship.position,
        rotate(ship.orientation, toWegoliteLocal(record.fore?.offset as Vec3)),
      ),
    );
    expect(ship.weapon.temperature).toBeGreaterThan(0);
    expect(ship.weapon.aftTemperature).toBe(0);
  });
});

describe("the aft on-target sign (ShipEntity.m:9874-9892)", () => {
  it("an aft request fires at a target astern and never at one ahead; a fore request the reverse", () => {
    for (const [facingPlayer, facing, fires] of [
      [false, "aft", true],
      [true, "aft", false],
      [true, "fore", true],
      [false, "fore", false],
    ] as const) {
      const player = flyingPlayer();
      const world = createWorld(5);
      const ship = armed(world, "anaconda", 3000, facingPlayer);
      const events = fireUntilShot(world, player, ship, [facing]);
      expect(ofKind(events, "laserFired").length > 0, `${facing}`).toBe(fires);
    }
  });
});

describe("onTargetCone by facing (ShipEntity.m:9874-9892)", () => {
  const at = (x: number, y: number, z: number): Vec3 => vec(x, y, z);
  const origin = vec(0, 0, 0);
  // Wegolite's frame: forward -Z, right +X.
  const cases: readonly [string, Vec3, Facing, boolean][] = [
    ["ahead, fore", at(0, 0, -1000), "fore", true],
    ["ahead, aft", at(0, 0, -1000), "aft", false],
    ["astern, aft", at(0, 0, 1000), "aft", true],
    ["astern, fore", at(0, 0, 1000), "fore", false],
    ["to starboard, starboard", at(1000, 0, 0), "starboard", true],
    ["to starboard, port", at(1000, 0, 0), "port", false],
    ["to port, port", at(-1000, 0, 0), "port", true],
    ["to port, starboard", at(-1000, 0, 0), "starboard", false],
  ];
  it.each(cases)("%s", (_name, aim, facing, expected) => {
    expect(onTargetCone(origin, identity(), aim, 10, 0.99, facing)).toBe(
      expected,
    );
  });

  it("is total on a malformed facing: the forward axis answers", () => {
    expect(
      onTargetCone(
        origin,
        identity(),
        at(0, 0, -1000),
        10,
        0.99,
        "up" as never,
      ),
    ).toBe(true);
  });
});

describe("NpcFlightStats.aftWeapon (plan 21-12)", () => {
  it("is the compiled aft type: pulse laser for the anaconda, none for the nine legacy keys", () => {
    const records = JSON.parse(
      readFileSync("src/content/generated/ships-npc.json", "utf8"),
    ) as (FlightRecord & { aftWeapon: string })[];
    const table = flightTableFrom(records);
    const byKey = new Map(table.map((row) => [row.specKey, row]));
    expect(byKey.get("anaconda")?.aftWeapon).toBe("EQ_WEAPON_PULSE_LASER");
    expect(INERT_RECORD_KEYS).toHaveLength(9);
    for (const key of INERT_RECORD_KEYS) {
      expect(byKey.get(key)?.aftWeapon, key).toBe("EQ_WEAPON_NONE");
    }
  });

  it("is none for a hand-built record without the field and for an unknown key", () => {
    const base = {
      maxFlightSpeed: 1,
      maxFlightRoll: 1,
      maxFlightPitch: 1,
      thrust: 1,
      mass: 1,
      forwardWeapon: "EQ_WEAPON_NONE",
    };
    const [legacy, bogus] = flightTableFrom([
      { key: "x", ...base },
      { key: "y", ...base, aftWeapon: "EQ_WEAPON_BOGUS" },
    ]);
    expect(legacy?.aftWeapon).toBe("EQ_WEAPON_NONE");
    expect(bogus?.aftWeapon).toBe("EQ_WEAPON_NONE");
  });

  it("a legacy-shape row without the field stays usable, and a row with a bad aft key falls back to the defaults", () => {
    const row: NpcFlightStats = {
      specKey: "x",
      maxFlightSpeed: 100,
      maxFlightRoll: 1,
      maxFlightPitch: 1,
      thrust: 10,
      mass: 5,
      forwardWeapon: "EQ_WEAPON_NONE",
    };
    expect(statsFor([row], "x")).toBe(row);
    const bad = {
      ...row,
      aftWeapon: "EQ_WEAPON_BOGUS",
    } as unknown as NpcFlightStats;
    expect(statsFor([bad], "x")).not.toBe(bad);
  });
});

describe("the drain order and the draws", () => {
  it("resolves fore before aft whatever the queueing order: the first draw goes to fore", () => {
    const wr = PULSE.range;
    const distance = wr / 2 + PLAYER_COLLISION_RADIUS_M + SHIP_RADIUS;
    const gateRange = rangeAt(distance);
    // A seed whose first draw fails the roll for this range and whose second
    // passes it: aft fires only when it takes the second draw.
    const limit = (u: number): number => Math.fround(u * wr) * (ACCURACY + 7.5);
    let seed = 0;
    for (let s = 1; s < 20000 && seed === 0; s += 1) {
      const stream = createRngState(s);
      const u1 = rngNext(stream);
      const u2 = rngNext(stream);
      if (gateRange > limit(u1) && gateRange <= limit(u2)) seed = s;
    }
    expect(seed).not.toBe(0);

    for (const order of [
      ["aft", "fore"],
      ["fore", "aft"],
    ] as const) {
      const player = flyingPlayer();
      player.tick = 10;
      const world = createWorld(5);
      const ship = armed(world, "anaconda", distance, false);
      ship.rng.combat = createRngState(seed).s;
      const control = createShipControl(world, ship.id, 0);
      for (const facing of order) control.fire(ship.id, facing);
      const events = resolve(world, player);
      const fired = ofKind(events, "laserFired");
      expect(fired, order.join()).toHaveLength(1);
      expect(ship.weapon.aftTemperature).toBeGreaterThan(0);
      expect(ship.weapon.temperature).toBe(0);
    }
  });

  it("orders requests by ascending id, then fore, aft, port, starboard, over any insertion order", () => {
    const facing = fc.constantFrom<Facing>(...FACINGS);
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(fc.integer({ min: 101, max: 140 }), facing), {
          selector: ([id, f]) => `${String(id)}/${f}`,
          maxLength: 60,
        }),
        fc.infiniteStream(fc.nat()),
        (pairs, rolls) => {
          const requests: FireRequest[] = pairs.map(([id, f]) => ({
            id,
            facing: f,
          }));
          const expected = [...requests].sort(
            (a, b) =>
              a.id - b.id ||
              FACINGS.indexOf(a.facing) - FACINGS.indexOf(b.facing),
          );
          const shuffled = [...requests];
          const iterator = rolls[Symbol.iterator]();
          for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = (iterator.next().value as number) % (i + 1);
            const held = shuffled[i] as FireRequest;
            shuffled[i] = shuffled[j] as FireRequest;
            shuffled[j] = held;
          }
          expect(shuffled.sort(compareFireRequests)).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("requestFire with a facing is total (milestone rule, property)", () => {
  it("never throws, keeps at most one request per (id, facing), caps the queue and keeps only integer ids and real facings", () => {
    const ids = fc.oneof(
      fc.integer({ min: 95, max: 140 }),
      fc.constantFrom(
        Number.NaN,
        0.5,
        -1,
        -0,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER + 2,
      ),
      fc.double({ noNaN: false }),
    );
    const facings = fc.oneof(
      fc.constantFrom<unknown>(...FACINGS),
      fc.constantFrom<unknown>("up", "", "FORE", 0, 1, null, undefined, {}),
    );
    fc.assert(
      fc.property(
        fc.array(fc.tuple(ids, facings), { maxLength: 300 }),
        (calls) => {
          const world = createWorld(1);
          for (const [id, facing] of calls) {
            expect(() => {
              requestFire(world, id, facing as Facing);
            }).not.toThrow();
            expect(world.fireQueue.length).toBeLessThanOrEqual(
              MAX_FIRE_REQUESTS,
            );
          }
          const keys = world.fireQueue.map(
            (r) => `${String(r.id)}/${r.facing}`,
          );
          expect(new Set(keys).size).toBe(keys.length);
          for (const request of world.fireQueue) {
            expect(Number.isSafeInteger(request.id)).toBe(true);
            expect(FACINGS).toContain(request.facing);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("the drain takes any queue content without throwing and always empties the queue", () => {
    const junk = fc.array(
      fc.record({
        id: fc.oneof(
          fc.integer({ min: 95, max: 110 }),
          fc.constantFrom(Number.NaN, 0.5, -3),
        ),
        facing: fc.oneof(
          fc.constantFrom<unknown>(...FACINGS),
          fc.constantFrom<unknown>("up", 7, undefined),
        ),
      }),
      { maxLength: 40 },
    );
    fc.assert(
      fc.property(junk, (entries) => {
        const player = flyingPlayer();
        const world = createWorld(5);
        armed(world, "anaconda", 3000, false);
        armed(world, "adder", 3000, true);
        for (const entry of entries) {
          world.fireQueue.push(entry as unknown as FireRequest);
        }
        expect(() => resolve(world, player)).not.toThrow();
        expect(world.fireQueue).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

describe("a facing the ship cannot fire changes nothing", () => {
  it("an aft request for a ship with no aft weapon fires nothing, draws nothing and changes no field", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const adder = armed(world, "adder", 3000, false);
    expect(WEAPONS.get("adder")?.aft).toBeUndefined();
    const stream = adder.rng.combat;
    const events = fireUntilShot(world, player, adder, ["aft"]);
    expect(events).toEqual([]);
    // The recharge and cooling still run, but the shot fields do not move.
    expect(adder.rng.combat).toBe(stream);
    expect(adder.weapon.aftTemperature).toBe(0);
    expect(adder.weapon.temperature).toBe(0);
    expect(adder.weapon.lastShotTick).toBe(0);
  });

  it("an aft request at the heat cutout fires nothing and draws nothing", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const ship = armed(world, "anaconda", 3000, false);
    ship.weapon.aftTemperature = MAX_WEAPON_TEMPERATURE;
    const stream = ship.rng.combat;
    const control = createShipControl(world, ship.id, 0);
    player.tick += 1;
    control.fire(ship.id, "aft");
    const events = resolve(world, player);
    expect(ofKind(events, "laserFired")).toEqual([]);
    expect(ship.rng.combat).toBe(stream);
    expect(ship.weapon.lastShotTick).toBe(0);
    // Cooled by one step, the only change.
    expect(ship.weapon.aftTemperature).toBe(
      coolWeapon(MAX_WEAPON_TEMPERATURE, DT),
    );
  });
});

describe("per-entity weapon type overrides", () => {
  it("EQ_WEAPON_NONE on the aft facing disables the record's aft weapon: no shot, no draw", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const ship = armed(world, "anaconda", 3000, false, {
      weaponTypes: {
        fore: null,
        aft: "EQ_WEAPON_NONE",
        port: null,
        starboard: null,
      },
    });
    const stream = ship.rng.combat;
    const events = fireUntilShot(world, player, ship, ["aft"]);
    expect(events).toEqual([]);
    expect(ship.rng.combat).toBe(stream);
    expect(ship.weapon.aftTemperature).toBe(0);
  });

  it("EQ_WEAPON_NONE on the fore facing draws and refuses exactly as an authored EQ_WEAPON_NONE nose does (SIM-WR-01)", () => {
    // The shuttle authors an unarmed nose; the adder authors a pulse laser
    // that the override strips. Oolite holds one forward_weapon_type either
    // way, and fireMainWeapon: draws randf() before isWeaponNone stops the
    // shot (ShipEntity.m:10009-10021, :9949, :9958).
    expect(WEAPONS.get("shuttle")?.fore?.laser).toBe("EQ_WEAPON_NONE");
    expect(WEAPONS.get("adder")?.fore?.laser).toBe("EQ_WEAPON_PULSE_LASER");
    const seed = createRngState(0x5eed).s;
    const authoredPlayer = flyingPlayer();
    const authoredWorld = createWorld(5);
    const authored = armed(authoredWorld, "shuttle", 3000, true);
    authored.rng.combat = seed;
    const overridePlayer = flyingPlayer();
    const overrideWorld = createWorld(5);
    const override = armed(overrideWorld, "adder", 3000, true, {
      weaponTypes: {
        fore: "EQ_WEAPON_NONE",
        aft: null,
        port: null,
        starboard: null,
      },
    });
    override.rng.combat = seed;
    const authoredControl = createShipControl(authoredWorld, authored.id, 0);
    const overrideControl = createShipControl(overrideWorld, override.id, 0);
    const streams = new Set<number>([seed]);
    for (let i = 0; i < 50; i += 1) {
      authoredPlayer.tick += 1;
      overridePlayer.tick += 1;
      authoredControl.fire(authored.id, "fore");
      overrideControl.fire(override.id, "fore");
      const authoredEvents = resolve(authoredWorld, authoredPlayer);
      const overrideEvents = resolve(overrideWorld, overridePlayer);
      expect(ofKind(authoredEvents, "laserFired")).toEqual([]);
      expect(ofKind(overrideEvents, "laserFired")).toEqual([]);
      expect(override.rng.combat, `tick ${String(i)}`).toBe(
        authored.rng.combat,
      );
      streams.add(override.rng.combat);
    }
    // One gate draw per tick on both paths, never a skipped one.
    expect(streams.size).toBe(51);
    expect(override.weapon.temperature).toBe(0);
    expect(override.weapon.lastShotTick).toBe(0);
  });

  it("a beam laser on the adder's aft facing fires from the model origin (the record authors no aft mount), heating the aft temperature", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const ship = armed(world, "adder", 3000, false, {
      weaponTypes: {
        fore: null,
        aft: "EQ_WEAPON_BEAM_LASER",
        port: null,
        starboard: null,
      },
    });
    const events = fireUntilShot(world, player, ship, ["aft"]);
    const shot = ofKind(events, "laserFired")[0];
    expect(shot?.from).toEqual(ship.position);
    expect(shot?.laserKind).toBe(LASER_STATS.EQ_WEAPON_BEAM_LASER.laserKind);
    expect(ship.weapon.aftTemperature).toBeGreaterThan(0);
    expect(ship.weapon.temperature).toBe(0);
  });

  it("an unknown override key fires nothing; null keeps the record's type", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const ship = armed(world, "anaconda", 3000, false, {
      weaponTypes: {
        fore: null,
        aft: "EQ_WEAPON_BOGUS",
        port: null,
        starboard: null,
      },
    });
    expect(fireUntilShot(world, player, ship, ["aft"])).toEqual([]);
    ship.weaponTypes.aft = null;
    const events = fireUntilShot(world, player, ship, ["aft"]);
    expect(ofKind(events, "laserFired").length).toBe(1);
  });
});

describe("cooling covers all four facings", () => {
  it("cools each non-zero temperature by the one float32 rule and leaves zeros at zero", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    const ship = armed(world, "anaconda", 3000, false);
    ship.weapon.temperature = 50;
    ship.weapon.aftTemperature = 100;
    ship.weapon.portTemperature = 20;
    ship.weapon.starboardTemperature = 0;
    resolve(world, player);
    expect(ship.weapon.temperature).toBe(coolWeapon(50, DT));
    expect(ship.weapon.aftTemperature).toBe(coolWeapon(100, DT));
    expect(ship.weapon.portTemperature).toBe(coolWeapon(20, DT));
    expect(ship.weapon.starboardTemperature).toBe(0);
  });

  it("leaves the hash text of a forward-only ship unchanged by cooling", () => {
    const player = flyingPlayer();
    const world = createWorld(5);
    armed(world, "adder", 3000, false);
    const before = hashWorld(player, world);
    resolve(world, player);
    expect(hashWorld(player, world)).toBe(before);
  });
});
