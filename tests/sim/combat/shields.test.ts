// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Shield and energy recharge, damage routing, cabin cooling and the gauges
 * (CBT-06, D-05, D-06).
 *
 * Expected values are derived by hand from `PlayerEntity.m:2575-2630` (S4-S8),
 * `:2655-2675` (C3), `:5635-5680` (S9, C4) and `:4265-4305` (S10), never from
 * running the code under test. One tick is 1/120 s: the bank recharge is
 * 4/120 = 0.03333 and each shield's recharge is 2/120 = 0.016667.
 */

import { describe, expect, it } from "vitest";

import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import {
  cabinTempGauge,
  coolCabin,
  energyBanks,
  rechargeEnergyAndShields,
  routeDamage,
  shieldGauge,
} from "../../../src/sim/combat/shields.js";
import { vec } from "../../../src/sim/math.js";

const DT = 1 / 120;
const BANK = 4 * DT; // energy_recharge_rate 4 per second
const SHIELD = 2 * DT; // shield recharge 2 per second

/** The player's forward axis in Wegolite's world frame (-Z). */
const FORWARD = vec(0, 0, -1);

function stateWith(patch: Partial<PlayerCombatState>): PlayerCombatState {
  return { ...createPlayerCombatState(), ...patch };
}

describe("rechargeEnergyAndShields", () => {
  it("charges the banks first and leaves full shields alone", () => {
    // Energy 200 + 4/120; both shields full, so nothing is spent on them.
    const state = stateWith({ energy: 200 });
    rechargeEnergyAndShields(state, DT);
    expect(state.energy).toBeCloseTo(200 + BANK, 12);
    expect(state.fwdShield).toBe(128);
    expect(state.aftShield).toBe(128);
  });

  it("clamps energy to 256", () => {
    const state = stateWith({ energy: 255.99 });
    rechargeEnergyAndShields(state, DT);
    expect(state.energy).toBe(256);
  });

  it("charges the lower shield from the banks: fwd 100, aft 128, energy 200", () => {
    // Both shields above a quarter (32), so the spare energy is
    // max(0, 200.0333 - 0.1 - 64) = 135.9333: ample. Forward gains 2/120 and
    // the bank pays 4/120 in, 2/120 out.
    const state = stateWith({ fwdShield: 100, aftShield: 128, energy: 200 });
    rechargeEnergyAndShields(state, DT);
    expect(state.fwdShield).toBeCloseTo(100 + SHIELD, 12);
    expect(state.aftShield).toBe(128);
    expect(state.energy).toBeCloseTo(200 + BANK - SHIELD, 12);
  });

  it("recharges no shield below the 0.25 bank threshold while both are above a quarter", () => {
    // Energy 60 + 0.0333 - 0.1 - 64 < 0, so the spare energy is 0.
    const state = stateWith({ fwdShield: 100, aftShield: 128, energy: 60 });
    rechargeEnergyAndShields(state, DT);
    expect(state.fwdShield).toBe(100);
    expect(state.aftShield).toBe(128);
    expect(state.energy).toBeCloseTo(60 + BANK, 12);
  });

  it("ignores the bank threshold when a shield is at or below a quarter", () => {
    // fwd 32 is not > 128 * 0.25 = 32, so all energy is available.
    const state = stateWith({ fwdShield: 32, aftShield: 128, energy: 60 });
    rechargeEnergyAndShields(state, DT);
    expect(state.fwdShield).toBeCloseTo(32 + SHIELD, 12);
    expect(state.energy).toBeCloseTo(60 + BANK - SHIELD, 12);
  });

  it("serves the lower shield first when the spare energy is short", () => {
    // Spare energy = E - 0.1 - 64 with E = energy + 4/120. Pick energy so the
    // spare is 0.02: it covers one shield's 2/120 = 0.016667 and 0.003333 of
    // the other.
    const energy = 64.12 - BANK;
    const fwdLower = stateWith({ fwdShield: 90, aftShield: 100, energy });
    rechargeEnergyAndShields(fwdLower, DT);
    expect(fwdLower.fwdShield).toBeCloseTo(90 + SHIELD, 12);
    expect(fwdLower.aftShield).toBeCloseTo(100 + (0.02 - SHIELD), 12);

    const aftLower = stateWith({ fwdShield: 100, aftShield: 90, energy });
    rechargeEnergyAndShields(aftLower, DT);
    expect(aftLower.aftShield).toBeCloseTo(90 + SHIELD, 12);
    expect(aftLower.fwdShield).toBeCloseTo(100 + (0.02 - SHIELD), 12);
  });

  it("serves aft first on a tie", () => {
    const energy = 64.12 - BANK;
    const state = stateWith({ fwdShield: 100, aftShield: 100, energy });
    rechargeEnergyAndShields(state, DT);
    expect(state.aftShield).toBeCloseTo(100 + SHIELD, 12);
    expect(state.fwdShield).toBeCloseTo(100 + (0.02 - SHIELD), 12);
  });

  it("never lifts a shield past 128", () => {
    const state = stateWith({
      fwdShield: 127.999,
      aftShield: 128,
      energy: 200,
    });
    rechargeEnergyAndShields(state, DT);
    expect(state.fwdShield).toBeCloseTo(128, 9);
    expect(state.fwdShield).toBeLessThanOrEqual(128);
  });

  it("refills a drained state toward full over time", () => {
    const state = stateWith({ fwdShield: 0, aftShield: 0, energy: 256 });
    // One second: both shields gain 2, paid from the banks (which refill 4).
    for (let i = 0; i < 120; i += 1) rechargeEnergyAndShields(state, DT);
    expect(state.fwdShield).toBeCloseTo(2, 9);
    expect(state.aftShield).toBeCloseTo(2, 9);
    expect(state.energy).toBeCloseTo(256, 9);
  });
});

describe("routeDamage", () => {
  it("drains the forward shield when the attacker is ahead", () => {
    const state = createPlayerCombatState();
    const result = routeDamage(state, 50, vec(0, 0, -10), FORWARD);
    expect(state.fwdShield).toBe(78);
    expect(state.aftShield).toBe(128);
    expect(state.energy).toBe(256);
    expect(state.cabinTemp).toBe(60);
    expect(result).toEqual({ shieldAbsorbed: true, applied: 0 });
  });

  it("drains the forward shield when the attacker is exactly abeam", () => {
    const state = createPlayerCombatState();
    routeDamage(state, 10, vec(5, 3, 0), FORWARD);
    expect(state.fwdShield).toBe(118);
    expect(state.aftShield).toBe(128);
  });

  it("drains the aft shield when the attacker is behind", () => {
    const state = createPlayerCombatState();
    const result = routeDamage(state, 50, vec(0, 0, 10), FORWARD);
    expect(state.aftShield).toBe(78);
    expect(state.fwdShield).toBe(128);
    expect(result.shieldAbsorbed).toBe(true);
  });

  it("treats a shield exactly equal to the damage as absorbing it all", () => {
    const state = stateWith({ fwdShield: 10 });
    const result = routeDamage(state, 10, vec(0, 0, -1), FORWARD);
    expect(state.fwdShield).toBe(0);
    expect(state.energy).toBe(256);
    expect(result).toEqual({ shieldAbsorbed: true, applied: 0 });
  });

  it("spills the overflow into energy and heats the cabin by 0.5 per point", () => {
    // fwd 10, hit 25: shield 0, overflow 15, energy 256 - 15, cabin 60 + 7.5.
    const state = stateWith({ fwdShield: 10 });
    const result = routeDamage(state, 25, vec(0, 0, -1), FORWARD);
    expect(state.fwdShield).toBe(0);
    expect(state.energy).toBe(241);
    expect(state.cabinTemp).toBe(67.5);
    expect(result).toEqual({ shieldAbsorbed: false, applied: 15 });
  });

  it("floors energy at zero and still heats by the full overflow", () => {
    const state = stateWith({ fwdShield: 0, energy: 5 });
    const result = routeDamage(state, 100, vec(0, 0, -1), FORWARD);
    expect(state.energy).toBe(0);
    expect(state.cabinTemp).toBe(110);
    expect(result).toEqual({ shieldAbsorbed: false, applied: 100 });
  });

  it("caps the cabin at 256 and adds no heat once there", () => {
    const hot = stateWith({ fwdShield: 0, cabinTemp: 255 });
    routeDamage(hot, 100, vec(0, 0, -1), FORWARD);
    expect(hot.cabinTemp).toBe(256);

    const full = stateWith({ fwdShield: 0, cabinTemp: 256 });
    routeDamage(full, 100, vec(0, 0, -1), FORWARD);
    expect(full.cabinTemp).toBe(256);
    expect(full.energy).toBe(156);
  });

  it("drains energy only through the aft shield when struck from behind", () => {
    const state = stateWith({ aftShield: 20 });
    const result = routeDamage(state, 30, vec(0, 0, 5), FORWARD);
    expect(state.aftShield).toBe(0);
    expect(state.fwdShield).toBe(128);
    expect(state.energy).toBe(246);
    expect(result.applied).toBe(10);
  });

  it("changes nothing for a non-finite, zero or negative amount", () => {
    for (const amount of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -5,
    ]) {
      const state = createPlayerCombatState();
      const result = routeDamage(state, amount, vec(0, 0, -1), FORWARD);
      expect(state).toEqual(createPlayerCombatState());
      expect(result).toEqual({ shieldAbsorbed: false, applied: 0 });
    }
  });

  it("routes a non-finite attacker offset deterministically to the forward shield", () => {
    const state = createPlayerCombatState();
    routeDamage(state, 10, vec(Number.NaN, 0, 0), FORWARD);
    expect(state.fwdShield).toBe(118);
  });
});

describe("coolCabin", () => {
  it("falls from 256 to below 60 after 960 ticks (8.0 s) and then stops", () => {
    // c(n) = -100 + 356 * (1 - 0.1/120)^n; below 60 first at n = 960 (59.9078).
    const state = stateWith({ cabinTemp: 256 });
    let ticks = 0;
    while (state.cabinTemp >= 60) {
      coolCabin(state, DT);
      ticks += 1;
    }
    expect(ticks).toBe(960);
    expect(state.cabinTemp).toBeCloseTo(59.90777, 4);
    const settled = state.cabinTemp;
    coolCabin(state, DT);
    expect(state.cabinTemp).toBe(settled);
  });

  it("leaves 60 at 60", () => {
    const state = createPlayerCombatState();
    coolCabin(state, DT);
    expect(state.cabinTemp).toBe(60);
  });

  it("pulls a hot cabin toward -100, 0.1 of the gap per second", () => {
    // One tick from 160: 160 + (0 - 100 - 160) * 0.1 / 120 = 160 - 26/120.
    const state = stateWith({ cabinTemp: 160 });
    coolCabin(state, DT);
    expect(state.cabinTemp).toBeCloseTo(160 - 26 / 120, 12);
  });
});

describe("gauges", () => {
  it("shieldGauge is the shield over 128, clamped to 0..1", () => {
    expect(shieldGauge(128)).toBe(1);
    expect(shieldGauge(64)).toBe(0.5);
    expect(shieldGauge(32)).toBe(0.25);
    expect(shieldGauge(-3)).toBe(0);
    expect(shieldGauge(400)).toBe(1);
  });

  it("cabinTempGauge is the cabin over 256, 60 reading 0.234375", () => {
    expect(cabinTempGauge(createPlayerCombatState())).toBe(0.234375);
    expect(cabinTempGauge(stateWith({ cabinTemp: 256 }))).toBe(1);
    expect(cabinTempGauge(stateWith({ cabinTemp: 512 }))).toBe(1);
    expect(cabinTempGauge(stateWith({ cabinTemp: -1 }))).toBe(0);
  });

  it("energyBanks fills the bottom bank first (E1 top .. E4 bottom)", () => {
    expect(energyBanks(256)).toEqual([1, 1, 1, 1]);
    expect(energyBanks(0)).toEqual([0, 0, 0, 0]);
    // 96 / 256 * 4 = 1.5: E4 full, E3 half.
    expect(energyBanks(96)).toEqual([0, 0, 0.5, 1]);
    // 200 / 256 * 4 = 3.125: E4, E3, E2 full, E1 an eighth.
    expect(energyBanks(200)).toEqual([0.125, 1, 1, 1]);
    expect(energyBanks(1000)).toEqual([1, 1, 1, 1]);
    expect(energyBanks(-20)).toEqual([0, 0, 0, 0]);
  });
});
