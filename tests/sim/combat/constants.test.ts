// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The combat ledger is pinned to the compiled content (Pitfall 14): the four
 * lasers to `equipment.json` `conditions.weapon_info`, and the Cobra's energy,
 * recharge, weapon and view offsets to `ships-client.json`. A drift in either
 * the ledger or a content rebuild fails here.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  BASELINE_SHIELD_LEVEL,
  COBRA_ENERGY_RECHARGE_RATE,
  COBRA_MAX_ENERGY,
  COBRA_VIEW_OFFSETS,
  COBRA_WEAPON_OFFSETS,
  ENERGY_DAMAGE_TO_HEAT_FACTOR,
  IDENT_ACQUIRE_RANGE,
  INITIAL_SHOT_TIME,
  LASER_SHOT_DURATION,
  LASER_STATS,
  PLAYER_HEAT_INSULATION,
  PLAYER_MAX_WEAPON_TEMP,
  SCANNER_MAX_RANGE,
  SHIELD_CHARGE_ENERGYBANK_THRESHOLD,
  SHIELD_RECHARGE_RATE,
  SHIP_COOLING_FACTOR,
  SHIP_MAX_CABIN_TEMP,
  SHIP_MIN_CABIN_TEMP,
  SHOT_TIMER_SATURATION_TICKS,
  WEAPON_COOLING_CUTOUT,
  WEAPON_COOLING_FACTOR,
  toWegoliteLocal,
} from "../../../src/sim/combat/constants.js";
import { FACINGS, LASER_KEYS } from "../../../src/sim/combat/mounts.js";
import type { Facing, LaserKey } from "../../../src/sim/combat/mounts.js";
import { vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";

interface WeaponInfo {
  readonly color: string;
  readonly damage: number;
  readonly energy: number;
  readonly range: number;
  readonly recharge_rate: number;
  readonly shot_temperature: number;
}

interface EquipmentRecord {
  readonly key: string;
  readonly conditions: { readonly weapon_info?: WeaponInfo };
}

interface ShipRecord {
  readonly key: string;
  readonly extras: Readonly<Record<string, unknown>>;
}

function readJson(relative: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8"),
  );
}

const equipment = readJson(
  "src/content/generated/equipment.json",
) as readonly EquipmentRecord[];
const ships = readJson(
  "src/content/generated/ships-client.json",
) as readonly ShipRecord[];

function cobraExtras(): Readonly<Record<string, unknown>> {
  const cobra = ships.find(
    (record) => record.key === "oolite_template_cobra3-player",
  );
  if (cobra === undefined) throw new Error("Cobra record missing");
  return cobra.extras;
}

function weaponInfo(key: LaserKey): WeaponInfo {
  const record = equipment.find((candidate) => candidate.key === key);
  const info = record?.conditions.weapon_info;
  if (info === undefined) throw new Error(`${key} has no weapon_info`);
  return info;
}

function parseOffset(text: unknown): Vec3 {
  if (typeof text !== "string") throw new Error("offset is not a string");
  const [x, y, z] = text.split(" ").map(Number);
  return vec(x ?? Number.NaN, y ?? Number.NaN, z ?? Number.NaN);
}

describe("LASER_STATS (ledger vs equipment.json weapon_info)", () => {
  for (const key of LASER_KEYS) {
    it(`pins ${key} to its weapon_info`, () => {
      const info = weaponInfo(key);
      const stats = LASER_STATS[key];
      expect(stats.range).toBe(info.range);
      expect(stats.energy).toBe(info.energy);
      expect(stats.damage).toBe(info.damage);
      expect(stats.rechargeRate).toBe(info.recharge_rate);
      expect(stats.shotTemperature).toBe(info.shot_temperature);
      expect(stats.color).toBe(info.color);
    });
  }

  it("derives the integer recharge ticks from the recharge rate", () => {
    // round(rate * 120): 0.5 s -> 60, 0.1 s -> 12, 2.5 s -> 300. The strict
    // gate (shotTicks > ticks) makes the shot periods 61, 13, 301 and 13.
    expect(LASER_STATS.EQ_WEAPON_PULSE_LASER.rechargeTicks).toBe(60);
    expect(LASER_STATS.EQ_WEAPON_BEAM_LASER.rechargeTicks).toBe(12);
    expect(LASER_STATS.EQ_WEAPON_MINING_LASER.rechargeTicks).toBe(300);
    expect(LASER_STATS.EQ_WEAPON_MILITARY_LASER.rechargeTicks).toBe(12);
  });

  it("maps each laser to its event kind", () => {
    expect(LASER_STATS.EQ_WEAPON_PULSE_LASER.laserKind).toBe("pulse");
    expect(LASER_STATS.EQ_WEAPON_BEAM_LASER.laserKind).toBe("beam");
    expect(LASER_STATS.EQ_WEAPON_MINING_LASER.laserKind).toBe("mining");
    expect(LASER_STATS.EQ_WEAPON_MILITARY_LASER.laserKind).toBe("military");
  });

  it("covers exactly the four laser keys, frozen", () => {
    expect(Object.keys(LASER_STATS).sort((a, b) => a.localeCompare(b))).toEqual(
      [...LASER_KEYS].sort((a, b) => a.localeCompare(b)),
    );
    expect(Object.isFrozen(LASER_STATS)).toBe(true);
    expect(Object.isFrozen(LASER_STATS.EQ_WEAPON_PULSE_LASER)).toBe(true);
  });
});

describe("Cobra constants (ledger vs ships-client.json extras)", () => {
  it("pins max_energy and energy_recharge_rate", () => {
    const extras = cobraExtras();
    expect(COBRA_MAX_ENERGY).toBe(256);
    expect(COBRA_MAX_ENERGY).toBe(extras["max_energy"]);
    expect(COBRA_ENERGY_RECHARGE_RATE).toBe(4);
    expect(COBRA_ENERGY_RECHARGE_RATE).toBe(extras["energy_recharge_rate"]);
  });

  const weaponKeys: Readonly<Record<Facing, string>> = {
    fore: "weapon_position_forward",
    aft: "weapon_position_aft",
    port: "weapon_position_port",
    starboard: "weapon_position_starboard",
  };
  const viewKeys: Readonly<Record<Facing, string>> = {
    fore: "view_position_forward",
    aft: "view_position_aft",
    port: "view_position_port",
    starboard: "view_position_starboard",
  };

  it("pins the four weapon offsets (Oolite frame) to the extras strings", () => {
    const extras = cobraExtras();
    for (const facing of FACINGS) {
      expect(COBRA_WEAPON_OFFSETS[facing]).toEqual(
        parseOffset(extras[weaponKeys[facing]]),
      );
    }
  });

  it("pins the four view offsets (Oolite frame) to the extras strings", () => {
    const extras = cobraExtras();
    for (const facing of FACINGS) {
      expect(COBRA_VIEW_OFFSETS[facing]).toEqual(
        parseOffset(extras[viewKeys[facing]]),
      );
    }
  });

  it("holds the eight offset strings as documented", () => {
    const extras = cobraExtras();
    expect(extras["weapon_position_forward"]).toBe("-0.0961 0.9367 43.4655");
    expect(extras["weapon_position_aft"]).toBe("0.0 0.0 -33.5");
    expect(extras["weapon_position_port"]).toBe("-47.4 -2.3 0.0");
    expect(extras["weapon_position_starboard"]).toBe("47.4 -2.3 0.0");
    expect(extras["view_position_forward"]).toBe("0.0 7.25 31.0");
    expect(extras["view_position_aft"]).toBe("0.0 6.0 -35.5");
    expect(extras["view_position_port"]).toBe("-35.5 7.5 0.0");
    expect(extras["view_position_starboard"]).toBe("35.5 7.5 0.0");
  });
});

describe("toWegoliteLocal", () => {
  it("negates z only, without producing -0", () => {
    expect(toWegoliteLocal(vec(1, 2, 3))).toEqual(vec(1, 2, -3));
    expect(toWegoliteLocal(vec(-47.4, -2.3, 0))).toEqual(vec(-47.4, -2.3, 0));
    expect(Object.is(toWegoliteLocal(vec(0, 0, 0)).z, 0)).toBe(true);
  });

  it("maps the forward view offset to the launch camera's cockpit offset", () => {
    // launch-camera.ts COCKPIT_OFFSET = vec(0, 7.25, -31)
    expect(toWegoliteLocal(COBRA_VIEW_OFFSETS.fore)).toEqual(vec(0, 7.25, -31));
  });
});

describe("scalar ledger", () => {
  it("holds the Oolite numbers", () => {
    expect(WEAPON_COOLING_FACTOR).toBe(6);
    expect(PLAYER_MAX_WEAPON_TEMP).toBe(256);
    expect(WEAPON_COOLING_CUTOUT).toBe(0.85);
    expect(INITIAL_SHOT_TIME).toBe(100);
    expect(SHOT_TIMER_SATURATION_TICKS).toBe(12000);
    expect(BASELINE_SHIELD_LEVEL).toBe(128);
    expect(SHIELD_RECHARGE_RATE).toBe(2);
    expect(SHIELD_CHARGE_ENERGYBANK_THRESHOLD).toBe(0.25);
    expect(SHIP_COOLING_FACTOR).toBe(0.1);
    expect(SHIP_MAX_CABIN_TEMP).toBe(256);
    expect(SHIP_MIN_CABIN_TEMP).toBe(60);
    expect(PLAYER_HEAT_INSULATION).toBe(1);
    expect(ENERGY_DAMAGE_TO_HEAT_FACTOR).toBe(0.5);
    expect(SCANNER_MAX_RANGE).toBe(25600);
    expect(IDENT_ACQUIRE_RANGE).toBe(25500);
    expect(LASER_SHOT_DURATION).toBe(0.09);
  });

  it("derives the 0.5 heat factor from the Cobra mass below 400000", () => {
    const cobra = ships.find(
      (record) => record.key === "oolite_template_cobra3-player",
    ) as unknown as { readonly mass: number };
    // SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR = (mass > 400000 ? 200000 / mass : 0.5)
    expect(cobra.mass).toBeCloseTo(214737.6875, 4);
    expect(cobra.mass > 400000 ? 200000 / cobra.mass : 0.5).toBe(
      ENERGY_DAMAGE_TO_HEAT_FACTOR,
    );
  });
});
