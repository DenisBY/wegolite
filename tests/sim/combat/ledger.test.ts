// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The damage ledger (FOUND-19, D-12, D-13): `applyLedger` unit cases.
 *
 * The ledger lowers energy and reports the victims that reached 0, credited to
 * the first lethal record's source; it never marks anything dead (`killShip`
 * does, `tests/sim/world/kill.test.ts`) and never lets the player die.
 */

import { describe, expect, it } from "vitest";

import {
  internalDamageSeed,
  internalDamageWork,
  rollInternalDamage,
} from "../../../src/sim/combat/internal-damage.js";
import type { InternalDamageFacts } from "../../../src/sim/combat/internal-damage.js";
import { applyLedger } from "../../../src/sim/combat/ledger.js";
import type { HitRecord } from "../../../src/sim/combat/ledger.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import {
  MAIN_STATION_ID,
  NO_ENTITY,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

function player(): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.position = vec(1e7, 0, 0);
  state.orientation = identity();
  return state;
}

function ship(
  world: World,
  energy: number,
  kind: "ship" | "cargo" | "wreckage" = "ship",
): number {
  const result = spawnEntity(
    world,
    {
      kind,
      specKey:
        kind === "ship" ? "adder" : kind === "cargo" ? "barrel" : "alloy",
      scanClass: "CLASS_NEUTRAL",
      position: vec(1e7, 0, -2000),
      orientation: identity(),
      radius: 30,
      maxEnergy: energy,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function record(
  target: number,
  source: number,
  amount: number,
  kind: HitRecord["kind"] = "laser",
): HitRecord {
  return { kind, target, source, amount, sourcePosition: vec(1e7, 0, -2000) };
}

function energyOf(world: World, id: number): number {
  const entity = world.store.get(id);
  if (entity === undefined) throw new Error(`no entity ${id}`);
  return entity.energy;
}

function run(
  world: World | undefined,
  records: readonly HitRecord[],
  options: { stepped?: boolean; combat?: boolean } = {},
): { lethal: ReturnType<typeof applyLedger>; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const combat =
    options.combat === false ? undefined : createPlayerCombatState();
  const lethal = applyLedger(
    world,
    options.stepped ?? true,
    player(),
    combat,
    records,
    events,
  );
  return { lethal, events };
}

describe("applyLedger", () => {
  it("reports a lethal NPC record and writes the energy floored at 0", () => {
    const world = createWorld(1);
    const id = ship(world, 10);
    const { lethal, events } = run(world, [record(id, PLAYER_ID, 15)]);
    expect(lethal).toEqual([{ victim: id, killer: PLAYER_ID }]);
    expect(energyOf(world, id)).toBe(0);
    expect(events).toEqual([
      {
        kind: "shipHit",
        target: id,
        source: PLAYER_ID,
        amount: 15,
        shield: false,
      },
    ]);
  });

  it("marks nothing dead", () => {
    const world = createWorld(1);
    const id = ship(world, 10);
    run(world, [record(id, PLAYER_ID, 15)]);
    expect(world.store.get(id)?.dead).toBe(false);
  });

  it("gives two shipHit and one LethalHit for two records on one victim, credited to the first lethal source", () => {
    const world = createWorld(1);
    const a = ship(world, 100);
    const b = ship(world, 100);
    const victim = ship(world, 10);
    const { lethal, events } = run(world, [
      record(victim, a, 15),
      record(victim, b, 15),
    ]);
    expect(events.filter((e) => e.kind === "shipHit")).toHaveLength(2);
    expect(lethal).toEqual([{ victim, killer: a }]);
    expect(energyOf(world, victim)).toBe(0);
  });

  it("credits the second source when the first record is not lethal", () => {
    const world = createWorld(1);
    const a = ship(world, 100);
    const b = ship(world, 100);
    const victim = ship(world, 20);
    const { lethal } = run(world, [
      record(victim, a, 6),
      record(victim, b, 15),
    ]);
    expect(lethal).toEqual([{ victim, killer: b }]);
    expect(energyOf(world, victim)).toBe(0);
  });

  it("gives a mutual A to B and B to A two LethalHits, each crediting the other", () => {
    const world = createWorld(1);
    const a = ship(world, 5);
    const b = ship(world, 5);
    const { lethal } = run(world, [record(b, a, 6), record(a, b, 6)]);
    expect(lethal).toEqual([
      { victim: a, killer: b },
      { victim: b, killer: a },
    ]);
    expect(world.store.get(a)?.dead).toBe(false);
    expect(world.store.get(b)?.dead).toBe(false);
  });

  it("sums the damage of queued records in order", () => {
    const world = createWorld(1);
    const victim = ship(world, 100);
    const { lethal, events } = run(world, [
      record(victim, PLAYER_ID, 15),
      record(victim, PLAYER_ID, 15),
      record(victim, PLAYER_ID, 6),
    ]);
    expect(lethal).toEqual([]);
    expect(energyOf(world, victim)).toBe(64);
    expect(events).toHaveLength(3);
  });

  it("returns the lethal hits sorted by victim id", () => {
    const world = createWorld(1);
    const first = ship(world, 5);
    const second = ship(world, 5);
    const { lethal } = run(world, [
      record(second, PLAYER_ID, 15),
      record(first, PLAYER_ID, 15),
    ]);
    expect(lethal.map((hit) => hit.victim)).toEqual([first, second]);
  });

  it("routes a player record through the shields, floors energy at 0 and is never lethal", () => {
    const world = createWorld(1);
    const combat = createPlayerCombatState();
    combat.fwdShield = 0;
    combat.energy = 5;
    const events: SimEvent[] = [];
    const lethal = applyLedger(
      world,
      true,
      player(),
      combat,
      [record(PLAYER_ID, 999, 100)],
      events,
    );
    expect(lethal).toEqual([]);
    expect(combat.energy).toBe(0);
    expect(events).toEqual([
      {
        kind: "shipHit",
        target: PLAYER_ID,
        source: 999,
        amount: 100,
        shield: false,
      },
    ]);
  });

  it("lets the shield take a player hit and reports shield true", () => {
    const world = createWorld(1);
    const combat = createPlayerCombatState();
    const events: SimEvent[] = [];
    applyLedger(
      world,
      true,
      player(),
      combat,
      [record(PLAYER_ID, 999, 6)],
      events,
    );
    expect(events).toMatchObject([{ kind: "shipHit", shield: true }]);
    expect(combat.energy).toBe(256);
  });

  it("routes a scrape on the player through the shield on the source's side, with no cabin heat, never lethal (CBT-18)", () => {
    const world = createWorld(1);
    // The source is 2,000 m ahead: the forward shield takes it first.
    const combat = createPlayerCombatState();
    const events: SimEvent[] = [];
    const lethal = applyLedger(
      world,
      true,
      player(),
      combat,
      [record(PLAYER_ID, 999, 20, "scrape")],
      events,
    );
    expect(lethal).toEqual([]);
    expect(combat.fwdShield).toBe(108);
    expect(combat.aftShield).toBe(128);
    expect(combat.energy).toBe(256);
    expect(combat.cabinTemp).toBe(60);
    expect(events).toEqual([
      {
        kind: "shipHit",
        target: PLAYER_ID,
        source: 999,
        amount: 20,
        shield: true,
      },
    ]);

    // A scrape far above shield and energy floors the energy at 0, unheated.
    const lethal2 = applyLedger(
      world,
      true,
      player(),
      combat,
      [record(PLAYER_ID, 999, 1000, "scrape")],
      events,
    );
    expect(lethal2).toEqual([]);
    expect(combat.energy).toBe(0);
    expect(combat.cabinTemp).toBe(60);
  });

  it("a laser on the player still heats the cabin (routeDamage)", () => {
    const world = createWorld(1);
    const combat = createPlayerCombatState();
    applyLedger(
      world,
      true,
      player(),
      combat,
      [record(PLAYER_ID, 999, 300, "laser")],
      [],
    );
    expect(combat.cabinTemp).toBeGreaterThan(60);
  });

  it("a scrape on a ship lowers its energy as a laser record does", () => {
    const world = createWorld(1);
    const id = ship(world, 10);
    const { lethal, events } = run(world, [
      record(id, PLAYER_ID, 15, "scrape"),
    ]);
    expect(lethal).toEqual([{ victim: id, killer: PLAYER_ID }]);
    expect(energyOf(world, id)).toBe(0);
    expect(events).toMatchObject([
      { kind: "shipHit", target: id, shield: false },
    ]);
  });

  it("skips a player record when there is no combat state", () => {
    const world = createWorld(1);
    const { lethal, events } = run(world, [record(PLAYER_ID, 101, 6)], {
      combat: false,
    });
    expect(lethal).toEqual([]);
    expect(events).toEqual([]);
  });

  it("skips a missing, dead or wreckage target; the station only absorbs, a buoy holds the damage, cargo takes it", () => {
    const world = createWorld(1);
    const dead = ship(world, 10);
    world.store.kill(dead);
    const cargo = ship(world, 10, "cargo");
    const wreck = ship(world, 10, "wreckage");
    const { lethal, events } = run(world, [
      record(9999, PLAYER_ID, 15),
      record(dead, PLAYER_ID, 15),
      record(MAIN_STATION_ID, PLAYER_ID, 15),
      record(WITCHPOINT_BUOY_ID, PLAYER_ID, 15),
      record(STATION_NAV_BUOY_ID, PLAYER_ID, 15),
      record(cargo, PLAYER_ID, 15),
      record(wreck, PLAYER_ID, 15),
    ]);
    // Plan 18-15 (D-07): a pod or plate takes the ship energy path.
    expect(lethal).toEqual([{ victim: cargo, killer: PLAYER_ID }]);
    // Plan 18-04: the station is a static target (A6): one shipHit, no write.
    // Plan 18-05: each buoy takes the hit into its static health.
    expect(events).toEqual(
      [MAIN_STATION_ID, WITCHPOINT_BUOY_ID, STATION_NAV_BUOY_ID, cargo].map(
        (target) => ({
          kind: "shipHit",
          target,
          source: PLAYER_ID,
          amount: 15,
          shield: false,
        }),
      ),
    );
    expect(world.staticHealth).toEqual({
      station: 25000,
      witchpoint: 235,
      navBuoy: 235,
    });
    expect(energyOf(world, cargo)).toBe(0);
    // A wreck is never a target (ShipEntity.m:1858-1868): its lifetime stays.
    expect(energyOf(world, wreck)).toBe(10);
  });

  it("a pod or plate at energy 1 is collected by one pulse, credited to an NPC shooter", () => {
    const world = createWorld(1);
    const npc = ship(world, 85);
    const pod = ship(world, 1, "cargo");
    const { lethal, events } = run(world, [record(pod, npc, 15)]);
    expect(lethal).toEqual([{ victim: pod, killer: npc }]);
    expect(events).toEqual([
      { kind: "shipHit", target: pod, source: npc, amount: 15, shield: false },
    ]);
    expect(Object.is(energyOf(world, pod), 0)).toBe(true);
    // The ledger marks nothing dead.
    expect(world.store.get(pod)?.dead).toBe(false);
  });

  it("skips amounts that are NaN, Infinity, 0 and -1", () => {
    const world = createWorld(1);
    const victim = ship(world, 10);
    const { lethal, events } = run(
      world,
      [Number.NaN, Number.POSITIVE_INFINITY, 0, -1].map((amount) =>
        record(victim, PLAYER_ID, amount),
      ),
    );
    expect(lethal).toEqual([]);
    expect(events).toEqual([]);
    expect(energyOf(world, victim)).toBe(10);
  });

  it("skips NPC targets when the world was not stepped or is missing", () => {
    const world = createWorld(1);
    const victim = ship(world, 10);
    const records = [record(victim, PLAYER_ID, 15)];
    expect(run(world, records, { stepped: false })).toEqual({
      lethal: [],
      events: [],
    });
    expect(energyOf(world, victim)).toBe(10);
    expect(run(undefined, records)).toEqual({ lethal: [], events: [] });
  });

  it("credits NO_ENTITY for a missing source and for a source equal to the victim", () => {
    const world = createWorld(1);
    const orphan = ship(world, 5);
    const selfHit = ship(world, 5);
    const { lethal } = run(world, [
      record(orphan, 9999, 15),
      record(selfHit, selfHit, 15),
    ]);
    expect(lethal).toEqual([
      { victim: orphan, killer: NO_ENTITY },
      { victim: selfHit, killer: NO_ENTITY },
    ]);
  });

  it("treats a non-finite stored energy as 0 and still floors at 0", () => {
    const world = createWorld(1);
    const victim = ship(world, 10);
    (world.store.get(victim) as { energy: number }).energy = Number.NaN;
    const { lethal } = run(world, [record(victim, PLAYER_ID, 6)]);
    expect(lethal).toEqual([{ victim, killer: PLAYER_ID }]);
    expect(energyOf(world, victim)).toBe(0);
  });
});

/**
 * Internal damage on the player's records (CBT-08, D-01, plan 19-04): the
 * ledger's roll against an oracle that calls the 19-02 module directly on ONE
 * stream (`() => rngNext(rng)` over one `RngState`, never a state per call).
 */
describe("applyLedger internal damage", () => {
  const KEYS = ["k_ecm", "k_scoop", "k_pod", "k_unit"] as const;
  const FACTS: InternalDamageFacts = {
    items: KEYS.map((key) => ({ key, damageProbability: 1 })),
    capacityPods: 20,
    pods: [],
  };
  const FACTS_WITH_PODS: InternalDamageFacts = {
    ...FACTS,
    pods: [
      { commodity: "food", amount: 1 },
      { commodity: "food", amount: 1 },
      { commodity: "food", amount: 1 },
    ],
  };

  function bareCombat(shield = 0) {
    const combat = createPlayerCombatState();
    combat.fwdShield = shield;
    combat.aftShield = shield;
    return combat;
  }

  function runDamage(
    records: readonly HitRecord[],
    tick: number,
    facts: InternalDamageFacts | undefined,
    options: { world?: World | undefined; shield?: number } = {},
  ): SimEvent[] {
    const events: SimEvent[] = [];
    const flight = player();
    flight.tick = tick;
    const world = "world" in options ? options.world : createWorld(1);
    applyLedger(
      world,
      true,
      flight,
      bareCombat(options.shield ?? 0),
      records,
      events,
      facts,
    );
    return events;
  }

  function hit(amount: number): SimEvent {
    return {
      kind: "shipHit",
      target: PLAYER_ID,
      source: 9,
      amount,
      shield: false,
    };
  }

  /** The events of the ledger, built by hand: one stream, one work copy. */
  function oracle(
    tick: number,
    facts: InternalDamageFacts,
    applied: readonly number[],
  ): SimEvent[][] {
    const rng = createRngState(
      internalDamageSeed(createWorld(1).worldSeed, tick),
    );
    const work = internalDamageWork(facts);
    return applied.map((amount) => {
      const out: SimEvent[] = [];
      rollInternalDamage(amount, work, () => rngNext(rng), out);
      return out;
    });
  }

  function firstTick(
    predicate: (tick: number) => boolean,
    limit: number,
  ): number {
    for (let tick = 0; tick < limit; tick += 1) {
      if (predicate(tick)) return tick;
    }
    throw new Error("vacuity guard: no tick found");
  }

  it("rolls after a laser hit that leaves energy: shipHit, then the oracle's events", () => {
    const tick = firstTick(
      (t) =>
        oracle(t, FACTS, [96])[0]?.some(
          (e) => e.kind === "equipmentDamaged",
        ) === true,
      200,
    );
    const expected = oracle(tick, FACTS, [96])[0] ?? [];
    const events = runDamage([record(PLAYER_ID, 9, 96)], tick, FACTS);
    expect(events).toEqual([hit(96), ...expected]);
    expect(events[1]?.kind).toBe("equipmentDamaged");
    expect(KEYS).toContain((events[1] as { key: string }).key);
  });

  it("draws nothing for a laser hit that empties the bank (energy <= 0)", () => {
    // The same tick would roll for a scrape of the same size (below).
    const tick = firstTick(
      (t) => (oracle(t, FACTS, [320])[0]?.length ?? 0) > 0,
      200,
    );
    expect(runDamage([record(PLAYER_ID, 9, 320)], tick, FACTS)).toEqual([
      hit(320),
    ]);
  });

  it("still rolls for a scrape that brings the energy to 0", () => {
    const tick = firstTick(
      (t) => (oracle(t, FACTS, [320])[0]?.length ?? 0) > 0,
      200,
    );
    const expected = oracle(tick, FACTS, [320])[0] ?? [];
    const events = runDamage(
      [record(PLAYER_ID, 9, 320, "scrape")],
      tick,
      FACTS,
    );
    expect(events).toEqual([hit(320), ...expected]);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("draws nothing for a hit the shield absorbed entirely", () => {
    for (let tick = 0; tick < 50; tick += 1) {
      expect(
        runDamage([record(PLAYER_ID, 9, 96)], tick, FACTS, { shield: 256 }),
      ).toEqual([{ ...hit(96), shield: true }]);
    }
  });

  it("is the pre-change output without facts or without a world", () => {
    for (let tick = 0; tick < 50; tick += 1) {
      expect(runDamage([record(PLAYER_ID, 9, 96)], tick, undefined)).toEqual([
        hit(96),
      ]);
      expect(
        runDamage([record(PLAYER_ID, 9, 96)], tick, FACTS, {
          world: undefined,
        }),
      ).toEqual([hit(96)]);
    }
  });

  it("shares one stream and one work copy between the records of a call", () => {
    const one: InternalDamageFacts = {
      items: [{ key: "k_ecm", damageProbability: 1 }],
      capacityPods: 20,
      pods: [],
    };
    let damagedTicks = 0;
    let naiveDoubles = 0;
    for (let tick = 0; tick < 4000; tick += 1) {
      const [first, second] = oracle(tick, one, [96, 96]);
      const events = runDamage(
        [record(PLAYER_ID, 9, 96), record(PLAYER_ID, 9, 96)],
        tick,
        one,
      );
      expect(events).toEqual([
        hit(96),
        ...(first ?? []),
        hit(96),
        ...(second ?? []),
      ]);
      const damaged = events.filter((e) => e.kind === "equipmentDamaged");
      expect(damaged.length).toBeLessThanOrEqual(1);
      if (damaged.length === 1) damagedTicks += 1;
      // A fresh work copy per record would damage the one item twice.
      const rng = createRngState(
        internalDamageSeed(createWorld(1).worldSeed, tick),
      );
      let count = 0;
      for (let i = 0; i < 2; i += 1) {
        const out: SimEvent[] = [];
        rollInternalDamage(
          96,
          internalDamageWork(one),
          () => rngNext(rng),
          out,
        );
        count += out.filter((e) => e.kind === "equipmentDamaged").length;
      }
      if (count === 2) naiveDoubles += 1;
    }
    expect(damagedTicks).toBeGreaterThan(0);
    expect(naiveDoubles).toBeGreaterThan(0);
  });

  it("reads the stream from where a capped first record stopped (E-167)", () => {
    const records = [
      record(PLAYER_ID, 9, 8224, "scrape"),
      record(PLAYER_ID, 9, 64, "scrape"),
    ];
    for (let tick = 0; tick < 20; tick += 1) {
      const [first, second] = oracle(tick, FACTS_WITH_PODS, [8224, 64]);
      const events = runDamage(records, tick, FACTS_WITH_PODS);
      expect(events).toEqual([
        hit(8224),
        ...(first ?? []),
        hit(64),
        ...(second ?? []),
      ]);
      // The capped first record uses up the damageable things.
      expect((first ?? []).length).toBeGreaterThan(0);
    }
  });
});
