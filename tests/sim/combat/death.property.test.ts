// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lethal predicate and `killPlayer` are total (DEATH-01, QUAL-11, T-20-06).
 *
 * Over arbitrary finite and non-finite amounts, shields, banks and flight
 * modes, `applyLedger` with an `outcome` never throws, sets
 * `outcome.playerDeath` only for a player in flight whose damage past the shield
 * empties a finite bank, and never changes the mode itself; `killPlayer` never
 * throws, posts at most one `playerDestroyed` however often it is called, and
 * never takes a dead state back to a live mode.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { killPlayer } from "../../../src/sim/combat/death.js";
import { applyLedger } from "../../../src/sim/combat/ledger.js";
import type { HitRecord } from "../../../src/sim/combat/ledger.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerDeathCause, SimEvent } from "../../../src/sim/events.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightMode, FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { createWorld } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

const MODES: readonly FlightMode[] = [
  "docked",
  "launching",
  "inFlight",
  "dead",
];

/** Finite values over the range the game uses, plus the hostile ones. */
const numberArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.double({ min: -600, max: 600, noNaN: true }) },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      0,
      -0,
      1,
      6,
      128,
      256,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1e308,
      -1e308,
      Number.MIN_VALUE,
    ),
  },
);

/** Amounts and banks the tallies below can classify. */
const modeArb = fc.constantFrom(...MODES);

const recordArb = fc.record({
  kind: fc.constantFrom("laser" as const, "scrape" as const),
  amount: numberArb,
  // A static (the nav buoy), a missing id and an NPC-range id.
  source: fc.constantFrom(5, 4, 999, 0),
  ahead: fc.boolean(),
});

const planArb = fc.record({
  mode: modeArb,
  bank: numberArb,
  fwd: numberArb,
  aft: numberArb,
  withWorld: fc.boolean(),
  records: fc.array(recordArb, { minLength: 1, maxLength: 4 }),
});

function playerIn(mode: FlightMode): FlightState {
  const state = initFlightState(layout);
  state.mode = mode;
  state.position = vec(1e7, 0, 0);
  state.orientation = identity();
  return state;
}

function recordFrom(plan: {
  kind: "laser" | "scrape";
  amount: number;
  source: number;
  ahead: boolean;
}): HitRecord {
  return {
    kind: plan.kind,
    target: PLAYER_ID,
    source: plan.source,
    amount: plan.amount,
    // Ahead of the nose (the forward shield) or behind it (the aft shield).
    sourcePosition: vec(1e7, 0, plan.ahead ? -2000 : 2000),
  };
}

describe("the lethal predicate is total (QUAL-11, T-20-06)", () => {
  it("applyLedger never throws, never changes the mode, and sets the death only for a player in flight whose bank the record can empty", () => {
    const tallies = { lethal: 0, survived: 0, inFlight: 0 };
    fc.assert(
      fc.property(planArb, (plan) => {
        const player = playerIn(plan.mode);
        const combat = createPlayerCombatState();
        combat.energy = plan.bank;
        combat.fwdShield = plan.fwd;
        combat.aftShield = plan.aft;
        const world = plan.withWorld ? createWorld(1) : undefined;
        const events: SimEvent[] = [];
        const outcome: { playerDeath?: PlayerDeathCause } = {};
        const records = plan.records.map(recordFrom);
        const bankBefore = plan.bank;

        applyLedger(
          world,
          true,
          player,
          combat,
          records,
          events,
          undefined,
          outcome,
        );

        // The ledger decides; it never changes the mode itself.
        expect(player.mode).toBe(plan.mode);
        if (plan.mode === "inFlight") tallies.inFlight += 1;
        if (outcome.playerDeath === undefined) {
          tallies.survived += 1;
          return;
        }
        tallies.lethal += 1;
        // A death needs a player in flight and a finite bank, and the finite
        // positive amounts together must reach the bank (the damage past the
        // shield is at most the amount, and the records of a call apply in
        // turn, so several small ones can empty it). The relative slack is the
        // rounding of a sum against a running subtraction. It leaves the bank
        // at 0.
        expect(plan.mode).toBe("inFlight");
        expect(Number.isFinite(bankBefore)).toBe(true);
        const total = records
          .filter(
            (record) => Number.isFinite(record.amount) && record.amount > 0,
          )
          .reduce((sum, record) => sum + record.amount, 0);
        // A negative shield is a malformed state (`sanitizeCombat` repairs it
        // at the start of every tick, before any record applies) and a negative
        // shield counts as extra damage past it, so the bound holds only for
        // shields at or above 0 (or not a number, which absorbs nothing).
        const negativeShield = plan.fwd < 0 || plan.aft < 0;
        if (!negativeShield) {
          expect(total * (1 + 1e-9) >= bankBefore).toBe(true);
        }
        expect(combat.energy).toBe(0);
        expect(["laser", "scrape"]).toContain(outcome.playerDeath.damage);
      }),
      { seed: 20260002, numRuns: 400 },
    );
    // Not vacuous: under the fixed seed both outcomes occur in flight.
    expect(tallies.lethal).toBeGreaterThanOrEqual(10);
    expect(tallies.survived).toBeGreaterThanOrEqual(10);
    expect(tallies.inFlight).toBeGreaterThanOrEqual(50);
  });

  it("with no shield, a single record kills a player in flight exactly when the amount reaches the bank", () => {
    fc.assert(
      fc.property(
        modeArb,
        fc.double({ min: -50, max: 400, noNaN: true }),
        fc.double({ min: Number.MIN_VALUE, max: 500, noNaN: true }),
        fc.constantFrom("laser" as const, "scrape" as const),
        fc.boolean(),
        (mode, bank, amount, kind, ahead) => {
          const player = playerIn(mode);
          const combat = createPlayerCombatState();
          combat.energy = bank;
          combat.fwdShield = 0;
          combat.aftShield = 0;
          const outcome: { playerDeath?: PlayerDeathCause } = {};

          applyLedger(
            createWorld(1),
            true,
            player,
            combat,
            [recordFrom({ kind, amount, source: 999, ahead })],
            [],
            undefined,
            outcome,
          );

          expect(outcome.playerDeath !== undefined).toBe(
            mode === "inFlight" && bank <= amount,
          );
        },
      ),
      { seed: 20260003, numRuns: 400 },
    );
  });

  it("a shield that absorbs the whole record never kills, whatever the bank", () => {
    fc.assert(
      fc.property(
        numberArb,
        fc.double({ min: 0.001, max: 128, noNaN: true }),
        fc.boolean(),
        (bank, amount, ahead) => {
          const player = playerIn("inFlight");
          const combat = createPlayerCombatState();
          combat.energy = bank;
          // Both shields hold more than the record, so the struck one absorbs it.
          combat.fwdShield = amount + 1;
          combat.aftShield = amount + 1;
          const outcome: { playerDeath?: PlayerDeathCause } = {};

          applyLedger(
            createWorld(1),
            true,
            player,
            combat,
            [recordFrom({ kind: "laser", amount, source: 999, ahead })],
            [],
            undefined,
            outcome,
          );

          expect(outcome.playerDeath).toBeUndefined();
        },
      ),
      { seed: 20260004, numRuns: 200 },
    );
  });
});

describe("killPlayer is total and posts at most one death (DEATH-01)", () => {
  const causeArb: fc.Arbitrary<PlayerDeathCause> = fc.oneof(
    fc.record({ damage: fc.constantFrom("laser" as const, "scrape" as const) }),
    fc.record({
      damage: fc.constantFrom("laser" as const, "scrape" as const),
      culprit: fc.constantFrom("viper", "krait", "buoy", "buoy-witchpoint"),
    }),
  );

  it("never throws, posts one playerDestroyed for a player in flight and none otherwise, and never leaves a dead state", () => {
    const tallies = { killed: 0, untouched: 0 };
    fc.assert(
      fc.property(
        modeArb,
        numberArb,
        fc.array(causeArb, { minLength: 1, maxLength: 4 }),
        (mode, bank, causes) => {
          const player = playerIn(mode);
          const combat: PlayerCombatState = createPlayerCombatState();
          combat.energy = bank;
          const events: SimEvent[] = [];

          for (const cause of causes) killPlayer(player, combat, cause, events);

          const deaths = events.filter(
            (event) => event.kind === "playerDestroyed",
          );
          expect(deaths.length).toBeLessThanOrEqual(1);
          expect(events).toHaveLength(deaths.length);
          if (mode === "inFlight") {
            tallies.killed += 1;
            expect(deaths).toHaveLength(1);
            expect(player.mode).toBe("dead");
            expect(combat.energy).toBe(0);
            // The first cause wins; a later call changes nothing.
            expect(deaths[0]?.cause).toEqual(causes[0]);
          } else {
            tallies.untouched += 1;
            expect(deaths).toEqual([]);
            // A docked, launching or dead state is left as it was, and a dead
            // state never goes back to a live mode.
            expect(player.mode).toBe(mode);
            expect(Object.is(combat.energy, bank)).toBe(true);
          }
        },
      ),
      { seed: 20260005, numRuns: 300 },
    );
    expect(tallies.killed).toBeGreaterThanOrEqual(20);
    expect(tallies.untouched).toBeGreaterThanOrEqual(20);
  });

  it("posts a finite velocity for any drift, speed and orientation of the dying player (D-02)", () => {
    fc.assert(
      fc.property(
        fc.record({ x: numberArb, y: numberArb, z: numberArb }),
        fc.record({ w: numberArb, x: numberArb, y: numberArb, z: numberArb }),
        numberArb,
        (drift, orientation, speed) => {
          const player = playerIn("inFlight");
          player.drift = drift;
          player.orientation = orientation;
          player.speed = speed;
          const events: SimEvent[] = [];
          killPlayer(
            player,
            createPlayerCombatState(),
            { damage: "laser" },
            events,
          );
          const [died] = events;
          if (died?.kind !== "playerDestroyed") throw new Error("no death");
          expect(Number.isFinite(died.velocity.x)).toBe(true);
          expect(Number.isFinite(died.velocity.y)).toBe(true);
          expect(Number.isFinite(died.velocity.z)).toBe(true);
          expect(died.velocity).not.toBe(player.drift);
        },
      ),
      { seed: 21130001, numRuns: 300 },
    );
  });
});
