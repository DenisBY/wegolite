// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Laser gating, cost, heat and cooling (CBT-05).
 *
 * The worked examples are derived by hand from `PlayerEntity.m:5460-5494`,
 * `:2481-2491` and `PlayerEntityControls.m:1187`, then confirmed by simulation
 * in the Oolite tick order (fire gate and shot, then cooling and timers).
 *
 * Pulse laser: 0.5 s recharge is 60 ticks, the strict gate needs 61, so a shot
 * every 61 ticks. Cooling is 6 per second, 0.05 per tick, so between shots the
 * facing loses 61 * 0.05 = 3.05 against the +7 of the shot: net +3.95 per
 * shot. The temperature seen at the gate before shot k is 3.95 * (k - 1); the
 * cut-out is 0.85 * 256 = 217.6, first reached at k - 1 = 56 (3.95 * 56 =
 * 221.2, while 3.95 * 55 = 217.25 is still below), so 56 shots fire and the
 * 57th attempt is refused with "overheat". RESEARCH predicted the attempt after
 * shot 56.
 */

import { describe, expect, it } from "vitest";

import {
  LASER_STATS,
  SHOT_TIMER_SATURATION_TICKS,
} from "../../../src/sim/combat/constants.js";
import { NO_LASER } from "../../../src/sim/combat/mounts.js";
import type {
  Facing,
  LaserKey,
  LaserMounts,
} from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import {
  applyShot,
  coolWeapons,
  fireGate,
  laserTempGauge,
} from "../../../src/sim/combat/weapons.js";
import type { FireGate } from "../../../src/sim/combat/weapons.js";

const DT = 1 / 120;

const PULSE: LaserKey = "EQ_WEAPON_PULSE_LASER";
const BEAM: LaserKey = "EQ_WEAPON_BEAM_LASER";

function mountsWith(
  facing: Facing,
  laser: LaserKey | typeof NO_LASER,
): LaserMounts {
  return {
    fore: NO_LASER,
    aft: NO_LASER,
    port: NO_LASER,
    starboard: NO_LASER,
    [facing]: laser,
  };
}

/**
 * One player tick in Oolite's order: the fire gate and shot first, then weapon
 * cooling and shot timers. Held fire. Returns the gate result.
 */
function tick(state: PlayerCombatState, mounts: LaserMounts): FireGate {
  const gate = fireGate(state, mounts);
  if (gate.kind === "fire") applyShot(state, gate.facing, gate.laser);
  coolWeapons(state, DT);
  return gate;
}

describe("fireGate", () => {
  it("fires the first shot of a pristine state (timers start saturated)", () => {
    const state = createPlayerCombatState();
    expect(fireGate(state, mountsWith("fore", PULSE))).toEqual({
      kind: "fire",
      facing: "fore",
      laser: PULSE,
    });
  });

  it("is idle with no laser on the current facing", () => {
    const state = createPlayerCombatState();
    expect(fireGate(state, mountsWith("aft", PULSE))).toEqual({ kind: "idle" });
    for (let i = 0; i < 300; i += 1) {
      expect(tick(state, mountsWith("aft", PULSE))).toEqual({ kind: "idle" });
    }
    // Nothing was spent while idle.
    expect(state.energy).toBe(256);
    expect(state.laserTemp.fore).toBe(0);
  });

  it("fires from the facing the view selects", () => {
    const state = createPlayerCombatState();
    state.view = "aft";
    expect(fireGate(state, mountsWith("aft", BEAM))).toEqual({
      kind: "fire",
      facing: "aft",
      laser: BEAM,
    });
  });

  it("checks recharge before heat: a hot facing mid-recharge is idle, not refused", () => {
    const state = createPlayerCombatState();
    state.laserTemp.fore = 250;
    state.shotTicks.fore = 10;
    expect(fireGate(state, mountsWith("fore", PULSE))).toEqual({
      kind: "idle",
    });
  });

  it("refuses overheat at exactly the cut-out and fires just below it", () => {
    const state = createPlayerCombatState();
    const mounts = mountsWith("fore", PULSE);
    // 0.85 * 256 = 217.6: at or above refuses, below fires.
    state.laserTemp.fore = 217.6;
    expect(fireGate(state, mounts)).toEqual({
      kind: "refused",
      reason: "overheat",
    });
    state.laserTemp.fore = 217.59;
    expect(fireGate(state, mounts).kind).toBe("fire");
  });

  it("applies the strict energy gate at exactly the shot cost", () => {
    const state = createPlayerCombatState();
    const mounts = mountsWith("fore", PULSE);
    // Pulse costs 0.8: energy <= 0.8 refuses (strict, PlayerEntity.m:5478).
    state.energy = 0.8;
    expect(fireGate(state, mounts)).toEqual({
      kind: "refused",
      reason: "noEnergy",
    });
    state.energy = 0.8000001;
    expect(fireGate(state, mounts).kind).toBe("fire");
  });

  it("checks heat before energy", () => {
    const state = createPlayerCombatState();
    state.laserTemp.fore = 255;
    state.energy = 0;
    expect(fireGate(state, mountsWith("fore", PULSE))).toEqual({
      kind: "refused",
      reason: "overheat",
    });
  });

  it("is idle on a non-finite shot timer (sanitizeCombat repairs it before this point)", () => {
    const state = createPlayerCombatState();
    state.shotTicks.fore = Number.NaN;
    expect(fireGate(state, mountsWith("fore", PULSE))).toEqual({
      kind: "idle",
    });
  });
});

describe("applyShot", () => {
  it("costs energy and heat on the facing and restarts that facing's timer", () => {
    const state = createPlayerCombatState();
    applyShot(state, "port", PULSE);
    expect(state.energy).toBeCloseTo(256 - 0.8, 12);
    expect(state.laserTemp.port).toBe(7);
    expect(state.shotTicks.port).toBe(0);
    expect(state.laserTemp.fore).toBe(0);
    expect(state.shotTicks.fore).toBe(SHOT_TIMER_SATURATION_TICKS);
  });

  it("uses the laser's own numbers", () => {
    const state = createPlayerCombatState();
    applyShot(state, "fore", BEAM);
    expect(state.energy).toBeCloseTo(256 - LASER_STATS[BEAM].energy, 12);
    expect(state.laserTemp.fore).toBeCloseTo(3.2, 12);
  });
});

describe("coolWeapons", () => {
  it("cools every facing by 6 per second, 1 s taking 7 to 1", () => {
    const state = createPlayerCombatState();
    state.laserTemp = { fore: 7, aft: 7, port: 7, starboard: 7 };
    for (let i = 0; i < 120; i += 1) coolWeapons(state, DT);
    expect(state.laserTemp.fore).toBeCloseTo(1, 9);
    expect(state.laserTemp.aft).toBeCloseTo(1, 9);
    expect(state.laserTemp.port).toBeCloseTo(1, 9);
    expect(state.laserTemp.starboard).toBeCloseTo(1, 9);
  });

  it("floors at zero and never goes negative", () => {
    const state = createPlayerCombatState();
    state.laserTemp.fore = 0.01;
    coolWeapons(state, DT);
    expect(state.laserTemp.fore).toBe(0);
    coolWeapons(state, DT);
    expect(state.laserTemp.fore).toBe(0);
  });

  it("advances every shot timer one tick and saturates at the start value", () => {
    const state = createPlayerCombatState();
    state.shotTicks = {
      fore: 0,
      aft: 5,
      port: SHOT_TIMER_SATURATION_TICKS - 1,
      starboard: SHOT_TIMER_SATURATION_TICKS,
    };
    coolWeapons(state, DT);
    expect(state.shotTicks).toEqual({
      fore: 1,
      aft: 6,
      port: SHOT_TIMER_SATURATION_TICKS,
      starboard: SHOT_TIMER_SATURATION_TICKS,
    });
  });
});

describe("held fire, worked examples", () => {
  it("fires a pulse laser every 61 ticks", () => {
    const state = createPlayerCombatState();
    const mounts = mountsWith("fore", PULSE);
    const shotTicks: number[] = [];
    for (let t = 0; t < 61 * 4 + 1; t += 1) {
      if (tick(state, mounts).kind === "fire") shotTicks.push(t);
    }
    expect(shotTicks).toEqual([0, 61, 122, 183, 244]);
  });

  it("fires a beam laser every 13 ticks", () => {
    const state = createPlayerCombatState();
    const mounts = mountsWith("fore", BEAM);
    const shotTicks: number[] = [];
    for (let t = 0; t < 13 * 4 + 1; t += 1) {
      if (tick(state, mounts).kind === "fire") shotTicks.push(t);
    }
    expect(shotTicks).toEqual([0, 13, 26, 39, 52]);
  });

  it("fires a military laser every 13 ticks and a mining laser every 301", () => {
    const military = createPlayerCombatState();
    const mounts = mountsWith("fore", "EQ_WEAPON_MILITARY_LASER");
    const militaryShots: number[] = [];
    for (let t = 0; t < 27; t += 1) {
      if (tick(military, mounts).kind === "fire") militaryShots.push(t);
    }
    expect(militaryShots).toEqual([0, 13, 26]);

    const mining = createPlayerCombatState();
    const miningMounts = mountsWith("fore", "EQ_WEAPON_MINING_LASER");
    const miningShots: number[] = [];
    for (let t = 0; t < 603; t += 1) {
      if (tick(mining, miningMounts).kind === "fire") miningShots.push(t);
    }
    expect(miningShots).toEqual([0, 301, 602]);
  });

  it("first refuses with overheat on the attempt after shot 56", () => {
    const state = createPlayerCombatState();
    const mounts = mountsWith("fore", PULSE);
    let shots = 0;
    let refusedAt = -1;
    for (let t = 0; t < 61 * 70 && refusedAt < 0; t += 1) {
      const gate = tick(state, mounts);
      if (gate.kind === "fire") shots += 1;
      if (gate.kind === "refused") {
        expect(gate.reason).toBe("overheat");
        refusedAt = t;
      }
    }
    // 56 shots fired (the last at tick 55 * 61), the 57th attempt refused at
    // the first tick it is eligible, 56 * 61 = 3416.
    expect(shots).toBe(56);
    expect(refusedAt).toBe(56 * 61);
  });

  it("keeps refusing while hot and fires again once the facing has cooled", () => {
    const state = createPlayerCombatState();
    const mounts = mountsWith("fore", PULSE);
    let refusals = 0;
    let t = 0;
    for (; t < 61 * 70; t += 1) {
      if (tick(state, mounts).kind === "refused") {
        refusals += 1;
        break;
      }
    }
    expect(refusals).toBe(1);
    let resumed = -1;
    for (let more = 0; more < 2000 && resumed < 0; more += 1) {
      const gate = tick(state, mounts);
      if (gate.kind === "fire") resumed = more;
      else expect(gate).toEqual({ kind: "refused", reason: "overheat" });
    }
    // The temperature was at or above 217.6 and falls 0.05 per tick, so it
    // takes more than one tick but far fewer than 2000 to drop below.
    expect(resumed).toBeGreaterThan(0);
    expect(state.laserTemp.fore).toBeLessThan(217.6 + 7);
  });

  it("pays energy for every shot", () => {
    const state = createPlayerCombatState();
    const mounts = mountsWith("fore", PULSE);
    for (let t = 0; t < 61 * 3 + 1; t += 1) tick(state, mounts);
    // Four shots (ticks 0, 61, 122, 183) at 0.8 each, no recharge in Task 1.
    expect(state.energy).toBeCloseTo(256 - 4 * 0.8, 9);
  });
});

describe("laserTempGauge", () => {
  it("reads the current facing's temperature over 256, clamped to 0..1", () => {
    const state = createPlayerCombatState();
    state.laserTemp = { fore: 128, aft: 64, port: 512, starboard: -5 };
    expect(laserTempGauge(state)).toBe(0.5);
    state.view = "aft";
    expect(laserTempGauge(state)).toBe(0.25);
    state.view = "port";
    expect(laserTempGauge(state)).toBe(1);
    state.view = "starboard";
    expect(laserTempGauge(state)).toBe(0);
  });
});
