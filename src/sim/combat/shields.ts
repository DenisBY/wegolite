// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Shields, energy banks, damage routing and cabin temperature for the player
 * (CBT-06, D-05, D-06).
 *
 * Exact ports of Oolite's `PlayerEntity.m` algorithms, in float64. Ship-wide
 * limits that Oolite reads from the ship (`maxForwardShieldLevel`, `maxEnergy`,
 * `heatInsulation`) are the Cobra's constants from the ledger: no shield
 * boosters, no energy unit, insulation 1 (RESEARCH "Out of scope").
 */

import {
  BASELINE_SHIELD_LEVEL,
  COBRA_ENERGY_RECHARGE_RATE,
  COBRA_MAX_ENERGY,
  ENERGY_DAMAGE_TO_HEAT_FACTOR,
  EXTERNAL_TEMPERATURE,
  PLAYER_HEAT_INSULATION,
  SHIELD_CHARGE_ENERGYBANK_THRESHOLD,
  SHIELD_RECHARGE_RATE,
  SHIP_COOLING_FACTOR,
  SHIP_MAX_CABIN_TEMP,
  SHIP_MIN_CABIN_TEMP,
} from "./constants.js";
import { dot } from "../math.js";
import type { Vec3 } from "../math.js";
import type { PlayerCombatState } from "./state.js";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * One tick of energy and shield recharge (S4-S8, `PlayerEntity.m:2575-2625`).
 *
 * 1. The banks gain `energy_recharge_rate * dt` (not yet clamped).
 * 2. Each shield may gain `SHIELD_RECHARGE_RATE * dt`, capped by its room.
 * 3. Both shields above a quarter keep the banks above
 *    `0.1 + maxEnergy * 0.25`: the spare energy is what is left over. Either
 *    shield at or below a quarter may spend all energy.
 * 4. The lower shield is served first; a tie goes to aft.
 * 5. Shields gain, banks pay, and shields and energy clamp to their maxima.
 */
export function rechargeEnergyAndShields(
  state: PlayerCombatState,
  dt: number,
): void {
  // 1. (Over)charge the banks; the clamp comes last, as in Oolite.
  let energy = state.energy + COBRA_ENERGY_RECHARGE_RATE * dt;

  // 2. Per-shield recharge capped by the room left.
  const fwdMax = BASELINE_SHIELD_LEVEL;
  const aftMax = BASELINE_SHIELD_LEVEL;
  let rechargeFwd = Math.min(
    SHIELD_RECHARGE_RATE * dt,
    fwdMax - state.fwdShield,
  );
  let rechargeAft = Math.min(
    SHIELD_RECHARGE_RATE * dt,
    aftMax - state.aftShield,
  );

  // 3. Energy available to the shields.
  let energyForShields = energy;
  if (state.fwdShield > fwdMax * 0.25 && state.aftShield > aftMax * 0.25) {
    // The - 0.1 keeps the bank from bouncing across the energy-low threshold.
    energyForShields = Math.max(
      0,
      energy - 0.1 - COBRA_MAX_ENERGY * SHIELD_CHARGE_ENERGYBANK_THRESHOLD,
    );
  }

  // 4. The lower shield first; aft first on a tie.
  if (state.fwdShield < state.aftShield) {
    rechargeFwd = Math.min(rechargeFwd, energyForShields);
    rechargeAft = Math.min(rechargeAft, energyForShields - rechargeFwd);
  } else {
    rechargeAft = Math.min(rechargeAft, energyForShields);
    rechargeFwd = Math.min(rechargeFwd, energyForShields - rechargeAft);
  }

  // 5. Recharge the shields, drain the banks, clamp.
  state.fwdShield = Math.min(
    fwdMax,
    Math.max(0, state.fwdShield + rechargeFwd),
  );
  state.aftShield = Math.min(
    aftMax,
    Math.max(0, state.aftShield + rechargeAft),
  );
  energy -= rechargeFwd + rechargeAft;
  state.energy = Math.min(COBRA_MAX_ENERGY, Math.max(0, energy));
}

/** What a hit on the player did. */
export interface DamageResult {
  /** The struck shield took the whole hit: nothing reached the energy banks. */
  readonly shieldAbsorbed: boolean;
  /** The damage that got past the shield, before energy floors at 0. */
  readonly applied: number;
}

const NO_DAMAGE: DamageResult = Object.freeze({
  shieldAbsorbed: false,
  applied: 0,
});

/**
 * The facing-shield drain shared by both damage paths (`PlayerEntity.m:
 * 5646-5662` for a laser, `5726-5742` for a scrape): `offset` (the other
 * entity's position minus the player's) projected on `forward`, `>= 0` being
 * ahead or exactly abeam, drains the forward shield; `< 0` drains the aft
 * shield. Returns what the shield did not absorb. A non-finite side test falls
 * to the forward shield, deterministically. The caller has already rejected a
 * non-positive or non-finite amount.
 */
function drainFacingShield(
  state: PlayerCombatState,
  amount: number,
  offset: Vec3,
  forward: Vec3,
): number {
  const dForward = dot(offset, forward);
  let remaining = amount;
  if (!(dForward < 0)) {
    state.fwdShield -= remaining;
    if (state.fwdShield < 0) {
      remaining = -state.fwdShield;
      state.fwdShield = 0;
    } else {
      remaining = 0;
    }
  } else {
    state.aftShield -= remaining;
    if (state.aftShield < 0) {
      remaining = -state.aftShield;
      state.aftShield = 0;
    } else {
      remaining = 0;
    }
  }
  return remaining;
}

/**
 * Route one hit on the player (S9, C4, `PlayerEntity.m:5635-5680`).
 *
 * The attacker's side decides the shield (`drainFacingShield`). The overflow
 * drains energy, which floors at 0 (the player's death is Phase 20, D-13), and
 * heats the cabin by `ENERGY_DAMAGE_TO_HEAT_FACTOR` per point while it is
 * below `SHIP_MAX_CABIN_TEMP`, never past it (D-05: energy damage is the only
 * heat input).
 *
 * A non-finite, zero or negative amount changes nothing (T-13-09). A
 * non-finite side test falls to the forward shield, deterministically.
 */
export function routeDamage(
  state: PlayerCombatState,
  amount: number,
  attackerOffset: Vec3,
  forward: Vec3,
): DamageResult {
  if (!Number.isFinite(amount) || !(amount > 0)) return NO_DAMAGE;

  const remaining = drainFacingShield(state, amount, attackerOffset, forward);
  if (remaining > 0) {
    state.energy = Math.max(0, state.energy - remaining);
    if (state.cabinTemp < SHIP_MAX_CABIN_TEMP) {
      state.cabinTemp = Math.min(
        SHIP_MAX_CABIN_TEMP,
        state.cabinTemp +
          (remaining * ENERGY_DAMAGE_TO_HEAT_FACTOR) / PLAYER_HEAT_INSULATION,
      );
    }
  }
  return { shieldAbsorbed: remaining === 0, applied: remaining };
}

/**
 * The player's collision damage (CBT-18), `-[PlayerEntity
 * takeScrapeDamage:from:]` (`PlayerEntity.m:5701-5753`).
 *
 * The shield on the other's side absorbs first: Oolite's `d_forward >= 0`
 * (5726) is the same `!(dForward < 0)` test as `routeDamage`'s, through the
 * shared `drainFacingShield`; `otherOffset` is the other's position minus the
 * player's. The remainder lowers energy (`[super takeScrapeDamage:]`,
 * `ShipEntity.m:11651`), which floors at 0 (the player's death is Phase 20).
 * Unlike `routeDamage` (`takeEnergyDamage`, 5599-5700) the scrape never heats
 * the cabin. The internal-damage loop (5746-5752) is the ledger's roll
 * (`./ledger.ts`, `./internal-damage.ts`).
 *
 * Divergence: Oolite turns a negative amount positive (5710-5713); this kernel
 * treats a non-positive or non-finite amount as no damage. No caller can reach
 * the difference, because the collision response never produces a negative
 * damage (review L413@b45e113).
 */
export function routeScrapeDamage(
  state: PlayerCombatState,
  amount: number,
  otherOffset: Vec3,
  forward: Vec3,
): DamageResult {
  if (!Number.isFinite(amount) || !(amount > 0)) return NO_DAMAGE;

  const remaining = drainFacingShield(state, amount, otherOffset, forward);
  if (remaining > 0) {
    state.energy = Math.max(0, state.energy - remaining);
  }
  return { shieldAbsorbed: remaining === 0, applied: remaining };
}

/**
 * One tick of cabin cooling in space (C3, `PlayerEntity.m:2663-2675`).
 *
 * With no external heat (D-05) and no air friction, the only term left is the
 * pull toward `EXTERNAL_TEMPERATURE - heatThreshold`, while the cabin is above
 * the 60 floor. There is no clamp at 60: the step that crosses it can leave a
 * value just under 60, after which cooling stops. Oolite's sun branch
 * (`external_temp > heatThreshold`) cannot fire with an external temperature of
 * 0 and is not ported.
 */
export function coolCabin(state: PlayerCombatState, dt: number): void {
  const heatThreshold = PLAYER_HEAT_INSULATION * 100;
  const deltaInsulation = dt / PLAYER_HEAT_INSULATION;
  if (state.cabinTemp > SHIP_MIN_CABIN_TEMP) {
    state.cabinTemp +=
      (EXTERNAL_TEMPERATURE - heatThreshold - state.cabinTemp) *
      SHIP_COOLING_FACTOR *
      deltaInsulation;
  }
}

/**
 * A shield dial: the shield over its maximum, clamped to `0..1`
 * (`dialForwardShield`, `PlayerEntity.m:4254-4261`; `dialAftShield`,
 * 4263-4270, is the same rule for the aft bank).
 */
export function shieldGauge(value: number): number {
  return clamp01(value / BASELINE_SHIELD_LEVEL);
}

/**
 * The CT gauge: the cabin temperature over `SHIP_MAX_CABIN_TEMP`, clamped to
 * `0..1` (C5, `ShipEntity.m:8399-8403`). A new game reads 60 / 256 = 0.234375.
 */
export function cabinTempGauge(state: PlayerCombatState): number {
  return clamp01(state.cabinTemp / SHIP_MAX_CABIN_TEMP);
}

/** Four energy banks (`maxEnergy / 64`) for the Cobra. */
const ENERGY_BANK_COUNT = COBRA_MAX_ENERGY / 64;

/**
 * The energy gauge's four banks, `[E1, E2, E3, E4]` from the top, each `0..1`
 * (S10, `HeadUpDisplay.m:1977-2041`). The dial is `energy / maxEnergy` clamped,
 * times the bank count; the bottom bank (E4) fills first and the top (E1) last.
 */
export function energyBanks(
  energy: number,
): readonly [number, number, number, number] {
  let remaining = clamp01(energy / COBRA_MAX_ENERGY) * ENERGY_BANK_COUNT;
  // Bank i (0 = bottom) takes what is left, up to 1; the loop fills E4 first.
  const filled: number[] = [];
  for (let bank = 0; bank < ENERGY_BANK_COUNT; bank += 1) {
    filled.push(clamp01(remaining));
    remaining -= 1;
  }
  return [filled[3] ?? 0, filled[2] ?? 0, filled[1] ?? 0, filled[0] ?? 0];
}
