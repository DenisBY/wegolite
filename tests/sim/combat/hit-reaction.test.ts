// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ledger's hit-reaction stage (Phase 21, pitfall C6): one `HitReaction` per
 * applied laser record, in ledger order, the lethal record included and
 * flagged. Scrape (collision) records produce none. The stage reads the applied
 * record, posts nothing and changes no state, so every existing hash and event
 * list stays as it was.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { npcLaserRay } from "../../../src/sim/combat/aim.js";
import type { NpcWeapon } from "../../../src/sim/combat/aim.js";
import { applyLedger } from "../../../src/sim/combat/ledger.js";
import type { HitReaction, HitRecord } from "../../../src/sim/combat/ledger.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import type { ShotRequest } from "../../../src/sim/combat/step.js";
import type { PlayerDeathCause, SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Quat } from "../../../src/sim/math.js";
import { DT } from "../../../src/sim/time.js";
import {
  MAIN_STATION_ID,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();

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

function apply(
  world: World | undefined,
  records: readonly HitRecord[],
  options: { combat?: boolean } = {},
): {
  reactions: HitReaction[];
  events: SimEvent[];
  lethal: ReturnType<typeof applyLedger>;
} {
  const reactions: HitReaction[] = [];
  const events: SimEvent[] = [];
  const combat =
    options.combat === false ? undefined : createPlayerCombatState();
  const lethal = applyLedger(
    world,
    true,
    player(),
    combat,
    records,
    events,
    undefined,
    undefined,
    reactions,
  );
  return { reactions, events, lethal };
}

describe("the hit-reaction stage", () => {
  it("records one laser hit on a surviving ship with its aggressor and remaining energy", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);
    const victim = ship(world, 40);

    const { reactions } = apply(world, [record(victim, attacker, 15)]);

    expect(reactions).toEqual([
      {
        victim,
        aggressor: attacker,
        kind: "laser",
        lethal: false,
        energyRemaining: 25,
      },
    ]);
  });

  it("records both laser hits that kill a clean ship, the second flagged lethal, with one lethal hit reported", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);
    const victim = ship(world, 10);

    const { reactions, events, lethal } = apply(world, [
      record(victim, attacker, 6),
      record(victim, attacker, 6),
    ]);

    expect(reactions).toEqual([
      {
        victim,
        aggressor: attacker,
        kind: "laser",
        lethal: false,
        energyRemaining: 4,
      },
      {
        victim,
        aggressor: attacker,
        kind: "laser",
        lethal: true,
        energyRemaining: 0,
      },
    ]);
    expect(lethal).toEqual([{ victim, killer: attacker }]);
    expect(events.filter((event) => event.kind === "shipHit")).toHaveLength(2);
  });

  it("flags the lethal record once per victim: a hit on the doomed ship is still recorded, unflagged", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);
    const victim = ship(world, 5);

    const { reactions } = apply(world, [
      record(victim, attacker, 9),
      record(victim, attacker, 9),
      record(victim, attacker, 9),
    ]);

    expect(reactions.map((reaction) => reaction.lethal)).toEqual([
      true,
      false,
      false,
    ]);
    expect(reactions.map((reaction) => reaction.energyRemaining)).toEqual([
      0, 0, 0,
    ]);
  });

  it("keeps ledger order across victims", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);
    const first = ship(world, 100);
    const second = ship(world, 100);

    const { reactions } = apply(world, [
      record(second, attacker, 1),
      record(first, attacker, 2),
      record(second, PLAYER_ID, 3),
    ]);

    expect(reactions.map((r) => [r.victim, r.aggressor])).toEqual([
      [second, attacker],
      [first, attacker],
      [second, PLAYER_ID],
    ]);
  });

  it("records a pod as a victim too", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);
    const pod = ship(world, 10, "cargo");

    const { reactions } = apply(world, [record(pod, attacker, 4)]);

    expect(reactions).toHaveLength(1);
    expect(reactions[0]?.victim).toBe(pod);
    expect(reactions[0]?.energyRemaining).toBe(6);
  });

  it("produces no reaction for a scrape record, which still applies", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);
    const victim = ship(world, 40);

    const { reactions, events } = apply(world, [
      record(victim, attacker, 15, "scrape"),
    ]);

    expect(reactions).toEqual([]);
    expect(world.store.get(victim)?.energy).toBe(25);
    expect(events).toHaveLength(1);
  });

  it("flags a laser hit that is lethal after a scrape took the first share", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);
    const victim = ship(world, 10);

    const { reactions } = apply(world, [
      record(victim, attacker, 6, "scrape"),
      record(victim, attacker, 6),
    ]);

    expect(reactions).toEqual([
      {
        victim,
        aggressor: attacker,
        kind: "laser",
        lethal: true,
        energyRemaining: 0,
      },
    ]);
  });

  it("records a laser hit on the player, lethal when it empties the bank", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);
    const survive = createPlayerCombatState();
    survive.fwdShield = 0;
    survive.energy = 50;
    const doomed = createPlayerCombatState();
    doomed.fwdShield = 0;
    doomed.energy = 5;
    const run = (combat: typeof survive): HitReaction[] => {
      const reactions: HitReaction[] = [];
      const outcome: { playerDeath?: PlayerDeathCause } = {};
      applyLedger(
        world,
        true,
        player(),
        combat,
        [record(PLAYER_ID, attacker, 20)],
        [],
        undefined,
        outcome,
        reactions,
      );
      return reactions;
    };

    expect(run(survive)).toEqual([
      {
        victim: PLAYER_ID,
        aggressor: attacker,
        kind: "laser",
        lethal: false,
        energyRemaining: 30,
      },
    ]);
    expect(run(doomed)).toEqual([
      {
        victim: PLAYER_ID,
        aggressor: attacker,
        kind: "laser",
        lethal: true,
        energyRemaining: 0,
      },
    ]);
  });

  it("records laser hits on the station and on a buoy (Phase 25 needs the station's offence)", () => {
    const world = createWorld(1);
    const attacker = ship(world, 50);

    const { reactions } = apply(world, [
      record(MAIN_STATION_ID, attacker, 15),
      record(WITCHPOINT_BUOY_ID, PLAYER_ID, 15),
    ]);

    expect(reactions.map((r) => [r.victim, r.aggressor, r.lethal])).toEqual([
      [MAIN_STATION_ID, attacker, false],
      [WITCHPOINT_BUOY_ID, PLAYER_ID, false],
    ]);
    expect(reactions[0]?.energyRemaining).toBe(world.staticHealth.station);
    expect(reactions[1]?.energyRemaining).toBe(world.staticHealth.witchpoint);
  });

  it("records nothing for unapplied records and for an empty ledger", () => {
    const world = createWorld(1);
    const victim = ship(world, 10);
    const wreck = ship(world, 10, "wreckage");

    expect(apply(world, []).reactions).toEqual([]);
    expect(apply(undefined, [record(victim, 1, 5)]).reactions).toEqual([]);
    expect(
      apply(world, [
        record(victim, 1, Number.NaN),
        record(victim, 1, 0),
        record(victim, 1, -3),
        record(9999, 1, 5),
        record(wreck, 1, 5),
        record(PLAYER_ID, 1, 5),
      ], { combat: false }).reactions,
    ).toEqual([]);
  });

  it("changes no event, lethal list or state when a sink is passed", () => {
    const records = (a: number, b: number): HitRecord[] => [
      record(b, a, 6),
      record(b, a, 6),
      record(a, PLAYER_ID, 3, "scrape"),
      record(MAIN_STATION_ID, a, 15),
      record(PLAYER_ID, a, 20),
    ];
    const build = (): { world: World; a: number; b: number } => {
      const world = createWorld(5);
      const a = ship(world, 50);
      const b = ship(world, 10);
      return { world, a, b };
    };
    const withSink = build();
    const without = build();
    const combatWith = createPlayerCombatState();
    const combatWithout = createPlayerCombatState();
    const eventsWith: SimEvent[] = [];
    const eventsWithout: SimEvent[] = [];
    const outcomeWith: { playerDeath?: PlayerDeathCause } = {};
    const outcomeWithout: { playerDeath?: PlayerDeathCause } = {};

    const lethalWith = applyLedger(
      withSink.world,
      true,
      player(),
      combatWith,
      records(withSink.a, withSink.b),
      eventsWith,
      undefined,
      outcomeWith,
      [],
    );
    const lethalWithout = applyLedger(
      without.world,
      true,
      player(),
      combatWithout,
      records(without.a, without.b),
      eventsWithout,
      undefined,
      outcomeWithout,
    );

    expect(eventsWith).toEqual(eventsWithout);
    expect(lethalWith).toEqual(lethalWithout);
    expect(outcomeWith).toEqual(outcomeWithout);
    expect(combatWith).toEqual(combatWithout);
    expect(hashWorld(initFlightState(layout), withSink.world)).toBe(
      hashWorld(initFlightState(layout), without.world),
    );
  });
});

describe("the reaction sink of resolveShots", () => {
  const VIPER_BEAM: NpcWeapon = {
    laser: "EQ_WEAPON_BEAM_LASER",
    offset: vec(0, -0.15000000596046448, 35.034400939941406),
  };
  const FACING_PLUS_Z: Quat = { w: 0, x: 0, y: 1, z: 0 };
  const OPTIONS: StepOptions = {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: realHullTable(),
      npcWeapons: new Map([["viper", VIPER_BEAM]]),
    },
  };

  function spawnShipAt(
    world: World,
    specKey: string,
    position: ReturnType<typeof vec>,
    orientation: Quat,
  ): number {
    const result = spawnEntity(
      world,
      {
        kind: "ship",
        specKey,
        scanClass: "CLASS_NEUTRAL",
        position,
        orientation,
        radius: 30,
        maxEnergy: specKey === "adder" ? 85 : 180,
        ai: createTestPilotAi(1_000_000),
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity.id;
  }

  function lethalWorld(): {
    world: World;
    flight: FlightState;
    victim: number;
    killer: number;
    shots: ShotRequest[];
  } {
    const flight = initFlightState(layout);
    stepFlight(flight, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
    stepFlight(
      flight,
      layout,
      config,
      ZERO_INTENT,
      [{ kind: "skipLaunch" }],
      DT,
    );
    flight.position = vec(1e7, 0, 0);
    flight.orientation = identity();
    flight.speed = 0;
    const world = createWorld(7);
    const victim = spawnShipAt(world, "adder", vec(1e7, 0, -800), identity());
    const killer = spawnShipAt(
      world,
      "viper",
      vec(1e7, 0, -1500),
      FACING_PLUS_Z,
    );
    const victimEntity = world.store.get(victim);
    const killerEntity = world.store.get(killer);
    if (victimEntity === undefined || killerEntity === undefined) {
      throw new Error("spawn failed");
    }
    victimEntity.energy = 1;
    const ray = npcLaserRay(killerEntity, VIPER_BEAM);
    if (ray === null) throw new Error("no ray");
    return {
      world,
      flight,
      victim,
      killer,
      shots: [{ shooter: killer, ray, laser: "EQ_WEAPON_BEAM_LASER" }],
    };
  }

  it("passes the sink through: the lethal beam hit is recorded and flagged, and the events are those of a run without a sink", () => {
    const withSink = lethalWorld();
    const without = lethalWorld();
    const reactions: HitReaction[] = [];

    const eventsWith = resolveShots(
      withSink.world,
      true,
      withSink.flight,
      undefined,
      withSink.shots,
      OPTIONS,
      DT,
      layout,
      undefined,
      reactions,
    );
    const eventsWithout = resolveShots(
      without.world,
      true,
      without.flight,
      undefined,
      without.shots,
      OPTIONS,
      DT,
      layout,
    );

    expect(reactions).toEqual([
      {
        victim: withSink.victim,
        aggressor: withSink.killer,
        kind: "laser",
        lethal: true,
        energyRemaining: 0,
      },
    ]);
    expect(eventsWith).toEqual(eventsWithout);
    expect(
      eventsWith.filter((event) => event.kind === "shipDestroyed"),
    ).toHaveLength(1);
    expect(hashWorld(withSink.flight, withSink.world)).toBe(
      hashWorld(without.flight, without.world),
    );
  });
});

describe("the reaction sink is total on malformed ledgers", () => {
  const TARGET_CHOICES = 9;
  const AMOUNTS = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -4,
    0,
    1,
    7,
    40,
    1e9,
  ] as const;

  function buildWorld(energies: readonly number[]): {
    world: World;
    ids: number[];
  } {
    const world = createWorld(3);
    const ids = energies.map((energy) => ship(world, energy));
    ids.push(ship(world, 20, "cargo"), ship(world, 20, "wreckage"));
    return { world, ids };
  }

  function targetOf(ids: readonly number[], choice: number): number {
    const table = [
      PLAYER_ID,
      MAIN_STATION_ID,
      WITCHPOINT_BUOY_ID,
      STATION_NAV_BUOY_ID,
      9999,
      Number.NaN,
      ...ids,
    ];
    return table[choice % table.length] ?? PLAYER_ID;
  }

  it("never throws, pushes one reaction per applied laser record and changes nothing else", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 120 }), {
          minLength: 1,
          maxLength: 4,
        }),
        fc.array(
          fc.record({
            kind: fc.constantFrom<HitRecord["kind"]>("laser", "scrape"),
            target: fc.integer({ min: 0, max: TARGET_CHOICES + 4 }),
            source: fc.integer({ min: 0, max: TARGET_CHOICES + 4 }),
            amount: fc.nat(AMOUNTS.length - 1),
          }),
          { maxLength: 16 },
        ),
        fc.integer({ min: 0, max: 256 }),
        (energies, specs, bank) => {
          const a = buildWorld(energies);
          const b = buildWorld(energies);
          const ledger = (ids: readonly number[]): HitRecord[] =>
            specs.map((spec, index) => {
              const base = AMOUNTS[spec.amount] as number;
              // A unique amount per valid record, so the events align.
              const amount =
                Number.isFinite(base) && base > 0 ? base + index * 1e-3 : base;
              return record(
                targetOf(ids, spec.target),
                targetOf(ids, spec.source),
                amount,
                spec.kind,
              );
            });
          const combatA = createPlayerCombatState();
          const combatB = createPlayerCombatState();
          combatA.energy = bank;
          combatB.energy = bank;
          const outcomeA: { playerDeath?: PlayerDeathCause } = {};
          const outcomeB: { playerDeath?: PlayerDeathCause } = {};
          const eventsA: SimEvent[] = [];
          const eventsB: SimEvent[] = [];
          const reactions: HitReaction[] = [];
          const recordsA = ledger(a.ids);

          const lethalA = applyLedger(
            a.world,
            true,
            player(),
            combatA,
            recordsA,
            eventsA,
            undefined,
            outcomeA,
            reactions,
          );
          const lethalB = applyLedger(
            b.world,
            true,
            player(),
            combatB,
            ledger(b.ids),
            eventsB,
            undefined,
            outcomeB,
          );

          // The sink changes nothing.
          expect(eventsA).toEqual(eventsB);
          expect(lethalA).toEqual(lethalB);
          expect(outcomeA).toEqual(outcomeB);
          expect(combatA).toEqual(combatB);
          expect(hashWorld(initFlightState(layout), a.world)).toBe(
            hashWorld(initFlightState(layout), b.world),
          );

          // One shipHit per applied record, in ledger order: pair them up.
          const expected: [number, number][] = [];
          let cursor = 0;
          for (const event of eventsA) {
            if (event.kind !== "shipHit") continue;
            while (cursor < recordsA.length) {
              const candidate = recordsA[cursor] as HitRecord;
              cursor += 1;
              if (
                Object.is(candidate.target, event.target) &&
                Object.is(candidate.source, event.source) &&
                Object.is(candidate.amount, event.amount)
              ) {
                if (candidate.kind === "laser") {
                  expected.push([candidate.target, candidate.source]);
                }
                break;
              }
            }
          }
          expect(reactions.map((r) => [r.victim, r.aggressor])).toEqual(
            expected,
          );

          // The lethal flag is set at most once per victim.
          const flagged = reactions.filter((r) => r.lethal).map((r) => r.victim);
          expect(new Set(flagged).size).toBe(flagged.length);
        },
      ),
      { numRuns: 300 },
    );
  });
});
