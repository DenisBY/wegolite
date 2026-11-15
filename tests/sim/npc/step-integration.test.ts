// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world step flies AI ships with the native steering (AI-01, plan 14-11).
 *
 * Expected values come from the flight model's rules, never from running the
 * code under test: the speed ramp adds `SHIP_THRUST_FACTOR * thrust * dt` per
 * tick (`ShipEntity.m:5808-5854`), `applyThrust` writes the clamped desired
 * speed back (`ShipEntity.m:5830-5831`), and an entity with no AI holds its
 * placement and speed (Phase 12 D-02).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { AiComponent, AiEvent } from "../../../src/sim/ai/types.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { SHIP_THRUST_FACTOR } from "../../../src/sim/npc/constants.js";
import {
  OOLITE_DEFAULT_FLIGHT_STATS,
  PLAYER_COLLISION_RADIUS_M,
  flightTableFrom,
  massFor,
} from "../../../src/sim/npc/stats.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import { DT } from "../../../src/sim/time.js";
import type { Entity, SpawnInit } from "../../../src/sim/world/entity.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import type { AiRegistry } from "../../../src/sim/world/step.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";

const { layout } = laveFixture();

/** A tick past every horizon of this file, so a think is never due. */
const FAR_TICK = 1_000_000_000;

function playerAt(tick: number): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.tick = tick;
  state.position = vec(1e9, 1e9, 1e9);
  return state;
}

function aiNever(): AiComponent {
  return {
    aiKey: "test-pilot",
    params: Object.create(null) as AiComponent["params"],
    wakeTick: 0,
    nextThinkTick: FAR_TICK,
  };
}

function shipInit(
  specKey: string,
  ai: AiComponent | null,
  position = vec(0, 0, 0),
): SpawnInit {
  return {
    kind: "ship",
    specKey,
    scanClass: "CLASS_NEUTRAL",
    position,
    orientation: identity(),
    radius: 50,
    speed: 0,
    ai,
  };
}

function spawnOk(world: World, init: SpawnInit): Entity {
  const result = spawnEntity(world, init, 0);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/** Advance `ticks` world steps, counting the player's tick up like the flight step. */
function run(
  world: World,
  player: FlightState,
  ticks: number,
  registry?: AiRegistry,
  facts?: Parameters<typeof stepWorld>[5],
): void {
  for (let i = 0; i < ticks; i += 1) {
    player.tick += 1;
    stepWorld(world, player, layout, DT, registry, facts);
  }
}

function tableRow(specKey: string): NpcFlightStats {
  const row = realNpcFlightTable().find((r) => r.specKey === specKey);
  if (row === undefined) throw new Error(`no row for ${specKey}`);
  return row;
}

describe("the speed ramp of a steered ship (ShipEntity.m:5808-5854)", () => {
  const cases: readonly {
    readonly label: string;
    readonly specKey: string;
    readonly table: readonly NpcFlightStats[] | undefined;
    readonly stats: NpcFlightStats;
  }[] = [
    {
      label: "default stats (160 m/s, thrust 15)",
      specKey: "test-ship",
      table: undefined,
      stats: OOLITE_DEFAULT_FLIGHT_STATS,
    },
    {
      label: "Viper stats from the compiled table",
      specKey: "viper",
      table: realNpcFlightTable(),
      stats: tableRow("viper"),
    },
  ];
  for (const c of cases) {
    // One desired speed below the maximum and one above it. Above the maximum
    // the clamp is written back into nav.desiredSpeed (5830-5831).
    for (const above of [false, true]) {
      it(`${c.label}: IDLE with desired speed ${above ? "above" : "below"} the maximum ramps at 5 * thrust per second`, () => {
        const desired = above
          ? c.stats.maxFlightSpeed + 90
          : c.stats.maxFlightSpeed / 2;
        const world = createWorld(11);
        const player = playerAt(0);
        const ship = spawnOk(world, shipInit(c.specKey, aiNever()));
        ship.nav.behaviour = "IDLE";
        ship.nav.desiredSpeed = desired;
        const facts = c.table === undefined ? undefined : { flight: c.table };

        const perTick = SHIP_THRUST_FACTOR * c.stats.thrust * DT;
        for (const n of [1, 2, 10, 60, 200, 600]) {
          const w = createWorld(11);
          const p = playerAt(0);
          const s = spawnOk(w, shipInit(c.specKey, aiNever()));
          s.nav.behaviour = "IDLE";
          s.nav.desiredSpeed = desired;
          run(w, p, n, undefined, facts);
          const expected = Math.min(
            desired,
            c.stats.maxFlightSpeed,
            n * perTick,
          );
          expect(s.speed).toBeCloseTo(expected, 9);
        }
        run(world, player, 600, undefined, facts);
        expect(ship.nav.desiredSpeed).toBe(
          Math.min(desired, c.stats.maxFlightSpeed),
        );
      });
    }
  }

  it("a steered ship moves along its facing at the ramped speed", () => {
    const world = createWorld(11);
    const player = playerAt(0);
    const ship = spawnOk(world, shipInit("test-ship", aiNever()));
    ship.nav.desiredSpeed = 60;
    // Ramp 0.625 m/s per tick; position is the sum of speed * dt on -Z.
    run(world, player, 3, undefined, undefined);
    const perTick = SHIP_THRUST_FACTOR * 15 * DT;
    const expectedZ = -DT * (perTick + 2 * perTick + 3 * perTick);
    expect(ship.position.z).toBeCloseTo(expectedZ, 12);
    expect(ship.position.x).toBeCloseTo(0, 12);
  });
});

describe("an inert ship stays inert (Phase 12 D-02)", () => {
  it("holds its pose and speed over 600 ticks", () => {
    const world = createWorld(5);
    const player = playerAt(0);
    const ship = spawnOk(world, shipInit("viper", null, vec(100, 200, -300)));
    ship.speed = 40;
    ship.nav.desiredSpeed = 250;
    run(world, player, 600, undefined, { flight: realNpcFlightTable() });
    expect(ship.position).toEqual(vec(100, 200, -300));
    expect(ship.orientation).toEqual(identity());
    expect(ship.speed).toBe(40);
  });
});

describe("the combat stream of a steered ship (D-04)", () => {
  it("is unchanged by another ship's spawn", () => {
    const solo = createWorld(9);
    const soloPlayer = playerAt(0);
    const a1 = spawnOk(solo, shipInit("test-ship", aiNever()));
    const seed = a1.rng.combat;
    a1.nav.desiredSpeed = 50;
    run(solo, soloPlayer, 30);

    const pair = createWorld(9);
    const pairPlayer = playerAt(0);
    const a2 = spawnOk(pair, shipInit("test-ship", aiNever()));
    a2.nav.desiredSpeed = 50;
    const b = spawnOk(pair, shipInit("test-ship", aiNever()));
    b.nav.desiredSpeed = 70;
    run(pair, pairPlayer, 30);

    // The lazy accuracy draw consumed one draw, so the stream moved.
    expect(a1.rng.combat).not.toBe(seed);
    expect(a2.rng.combat).toBe(a1.rng.combat);
    expect(a2.speed).toBe(a1.speed);
  });
});

describe("steering events reach the ship's own AI", () => {
  it("delivers shipAchievedDesiredRange without an `a` key", () => {
    const received: AiEvent[] = [];
    const registry: AiRegistry = {
      "test-pilot": {
        think: () => undefined,
        onEvent: (_ctx, event) => {
          received.push(event);
        },
      },
    };
    const world = createWorld(3);
    const player = playerAt(0);
    const ship = spawnOk(world, shipInit("test-ship", aiNever()));
    // 5 m ahead of the ship with a 100 m desired range: already arrived.
    ship.nav.behaviour = "FLY_RANGE_FROM_DESTINATION";
    ship.nav.destination = vec(0, 0, -5);
    ship.nav.desiredRange = 100;
    // Tick 1 picks FLY_FROM or FLY_TO from the range; FLY_TO arrives at once.
    run(world, player, 1, registry);
    expect(received).toEqual([]);
    ship.nav.behaviour = "FLY_TO_DESTINATION";
    run(world, player, 1, registry);

    expect(received).toHaveLength(1);
    const event = received[0];
    if (event === undefined) throw new Error("no event");
    expect(event.name).toBe("shipAchievedDesiredRange");
    expect(event.to).toBe(ship.id);
    expect(Object.hasOwn(event, "a")).toBe(false);
    expect(ship.nav.behaviour).toBe("IDLE");
    expect(world.aiQueue).toHaveLength(0);
  });
});

describe("flightTableFrom and massFor", () => {
  const records = [
    {
      key: "k1",
      maxFlightSpeed: 200,
      maxFlightRoll: 2,
      maxFlightPitch: 1,
      thrust: 20,
      mass: 5000,
      forwardWeapon: "EQ_WEAPON_PULSE_LASER",
    },
    {
      key: "k2",
      maxFlightSpeed: 100,
      maxFlightRoll: 1,
      maxFlightPitch: 1,
      thrust: 10,
      mass: 0,
      forwardWeapon: "not-a-weapon",
    },
  ];

  it("maps compiled records to a frozen table; an unknown weapon is no weapon", () => {
    const table = flightTableFrom(records);
    expect(Object.isFrozen(table)).toBe(true);
    expect(table).toHaveLength(2);
    expect(table[0]).toEqual({
      specKey: "k1",
      maxFlightSpeed: 200,
      maxFlightRoll: 2,
      maxFlightPitch: 1,
      thrust: 20,
      mass: 5000,
      forwardWeapon: "EQ_WEAPON_PULSE_LASER",
    });
    expect(table[1]?.forwardWeapon).toBe("EQ_WEAPON_NONE");
  });

  it("the real table has the nine committed kinds", () => {
    const table = realNpcFlightTable();
    expect(table.map((row) => row.specKey)).toEqual([
      "adder",
      "cobramk1",
      "gecko",
      "krait",
      "mamba",
      "moray",
      "shuttle",
      "sidewinder",
      "viper",
    ]);
  });

  it("massFor takes the flight row's mass first", () => {
    const flight = flightTableFrom(records);
    expect(
      massFor({ flight, masses: [{ specKey: "k1", mass: 7 }] }, "k1"),
    ).toBe(5000);
  });

  it("with no flight table, massFor falls back to the shipMasses row", () => {
    expect(massFor({ masses: [{ specKey: "k1", mass: 7000 }] }, "k1")).toBe(
      7000,
    );
    // A kind with no flight row also falls back.
    const flight = flightTableFrom(records);
    expect(
      massFor({ flight, masses: [{ specKey: "z", mass: 123 }] }, "z"),
    ).toBe(123);
  });

  it("massFor applies massOf's finite-positive guard and 0 otherwise", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(massFor({ masses: [{ specKey: "k", mass: bad }] }, "k")).toBe(0);
    }
    expect(massFor({ masses: [{ specKey: "a", mass: 9 }] }, "k")).toBe(0);
    expect(massFor({}, "k")).toBe(0);
    expect(massFor(undefined, "k")).toBe(0);
  });
});

describe("PLAYER_COLLISION_RADIUS_M", () => {
  it("equals the collisionRadius of the compiled Cobra Mk III player hull", () => {
    const hulls = JSON.parse(
      readFileSync(
        new URL(
          "../../../src/content/generated/ships-hulls.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { key: string; collisionRadius: number }[];
    const row = hulls.find((h) => h.key === "oolite_template_cobra3-player");
    expect(row).toBeDefined();
    expect(PLAYER_COLLISION_RADIUS_M).toBe(row?.collisionRadius);
  });
});

describe("determinism", () => {
  it("two identical runs hash identically", () => {
    const hashOf = (): string => {
      const world = createWorld(21);
      const player = playerAt(0);
      const a = spawnOk(world, shipInit("viper", aiNever()));
      a.nav.desiredSpeed = 200;
      const b = spawnOk(world, shipInit("adder", aiNever(), vec(50, 0, 0)));
      b.nav.behaviour = "FLY_TO_DESTINATION";
      b.nav.destination = vec(0, 3000, -4000);
      b.nav.desiredRange = 100;
      b.nav.desiredSpeed = 200;
      run(world, player, 400, undefined, { flight: realNpcFlightTable() });
      return hashWorld(player, world);
    };
    expect(hashOf()).toBe(hashOf());
  });
});
