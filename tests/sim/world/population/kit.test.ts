// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ship kit of the initial populator (Phase 22, plan 22-07, WORLD-08): the
 * script helpers `_setWeapons`, `_setSkill`, `_setFuel` and the engine's
 * initial accuracy, at their boundaries. The recorded replay of whole groups is
 * `traders.oracle.test.ts`; these cases pin the arithmetic the replay does not
 * reach on its own.
 */

import { describe, expect, it } from "vitest";

import {
  clampAccuracy,
  fuelTenths,
  initialAccuracy,
  setFuel,
  setReturnFuel,
  setSkill,
  setWeapons,
  type WeaponMounts,
} from "../../../../src/sim/world/population/kit.js";

/** A draw source that must not be called. */
const NO_DRAW = (): number => {
  throw new Error("no draw expected");
};

/** A draw source that returns `values` in turn and counts its calls. */
function draws(...values: number[]): {
  next: () => number;
  taken: () => number;
} {
  let at = 0;
  return {
    next: () => {
      const value = values[at];
      if (value === undefined) {
        throw new Error(`draw #${String(at)} is used up`);
      }
      at += 1;
      return value;
    },
    taken: () => at,
  };
}

function mounts(): WeaponMounts {
  return { fore: null, aft: null };
}

describe("setWeapons (_setWeapons, oolite-populator.js:2217-2273)", () => {
  it("keeps choice 2 at level 2.5 when the draw equals the fraction (strict >)", () => {
    const ship = mounts();
    expect(setWeapons(ship, 2.5, true, () => 0.5)).toBe(true);
    expect(ship).toEqual({
      fore: "EQ_WEAPON_BEAM_LASER",
      aft: "EQ_WEAPON_NONE",
    });
  });

  it("rounds level 2.5 up to choice 3 for a draw below the fraction", () => {
    const ship = mounts();
    setWeapons(ship, 2.5, true, () => 0.49);
    expect(ship).toEqual({
      fore: "EQ_WEAPON_BEAM_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
    });
  });

  it("takes one draw even for an integer level", () => {
    const source = draws(0.99);
    const ship = mounts();
    setWeapons(ship, 3, true, source.next);
    expect(source.taken()).toBe(1);
    expect(ship.fore).toBe("EQ_WEAPON_BEAM_LASER");
  });

  it("writes the table of levels 1 to 5", () => {
    const at = (level: number): WeaponMounts => {
      const ship = mounts();
      setWeapons(ship, level, true, () => 0);
      return ship;
    };
    expect(at(1)).toEqual({
      fore: "EQ_WEAPON_PULSE_LASER",
      aft: "EQ_WEAPON_NONE",
    });
    expect(at(2)).toEqual({
      fore: "EQ_WEAPON_BEAM_LASER",
      aft: "EQ_WEAPON_NONE",
    });
    expect(at(3)).toEqual({
      fore: "EQ_WEAPON_BEAM_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
    });
    expect(at(4)).toEqual({
      fore: "EQ_WEAPON_MILITARY_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
    });
    expect(at(5)).toEqual({
      fore: "EQ_WEAPON_MILITARY_LASER",
      aft: "EQ_WEAPON_MILITARY_LASER",
    });
    expect(at(0.2)).toEqual(at(1));
  });

  it("takes no draw and changes nothing without auto_weapons", () => {
    const ship: WeaponMounts = { fore: "EQ_WEAPON_BEAM_LASER", aft: null };
    expect(setWeapons(ship, 2.5, false, NO_DRAW)).toBe(false);
    expect(ship).toEqual({ fore: "EQ_WEAPON_BEAM_LASER", aft: null });
  });
});

describe("setSkill (_setSkill, oolite-populator.js:2276-2294)", () => {
  it("takes no draw at accuracy 5 or above, bias 0 or without auto_weapons", () => {
    expect(setSkill(5, 2, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(5);
    expect(setSkill(9.5, 2, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(9.5);
    expect(setSkill(1, 0, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(1);
    expect(setSkill(1, 2, false, "CLASS_NEUTRAL", NO_DRAW)).toBe(1);
  });

  it("moves toward 4.99 |bias| times by the draw's fraction of the distance", () => {
    const source = draws(0.5, 0.5);
    const result = setSkill(0, 2, true, "CLASS_NEUTRAL", source.next);
    expect(source.taken()).toBe(2);
    // 0 + (4.99 - 0) * 0.5 = 2.495, then 2.495 + (4.99 - 2.495) * 0.5.
    expect(result).toBe(Math.fround(2.495 + (4.99 - 2.495) * 0.5));
  });

  it("moves toward -5 for a negative bias", () => {
    const source = draws(0.5);
    expect(setSkill(1, -1, true, "CLASS_NEUTRAL", source.next)).toBe(
      Math.fround(1 + (-5 - 1) * 0.5),
    );
  });

  it("writes a float32 value inside the accuracy range", () => {
    const result = setSkill(-4.9, 64, true, "CLASS_NEUTRAL", () => 0.999);
    expect(result).toBe(Math.fround(result));
    expect(result).toBeGreaterThanOrEqual(-5);
    expect(result).toBeLessThanOrEqual(10);
  });

  it("ignores a non-finite bias instead of looping", () => {
    expect(setSkill(0, Infinity, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(0);
    expect(setSkill(0, Number.NaN, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(0);
  });
});

describe("fuel (_setFuel, OOJSShip.m:1315-1320)", () => {
  it("is 2 tenths for a home 17 chart units away and 0 for 18", () => {
    expect(setFuel(5, 1, () => 0.4 * 17)).toBe(2);
    expect(setFuel(5, 1, () => 0.4 * 18)).toBe(0);
  });

  it("is 70 for a ship at home", () => {
    expect(
      setFuel(1, 1, () => {
        throw new Error("no distance needed at home");
      }),
    ).toBe(70);
  });

  it("holds nothing for an unknown or non-finite distance", () => {
    expect(setFuel(5, 1, () => undefined)).toBe(0);
    expect(fuelTenths(Number.NaN)).toBe(0);
    expect(fuelTenths(-3)).toBe(70 - 70);
    expect(fuelTenths(100)).toBe(70);
  });

  it("applies the same rule to the destination (_setReturnFuel)", () => {
    expect(setReturnFuel(5, 1, () => 0.4 * 17)).toBe(2);
    expect(setReturnFuel(1, 1, () => 0)).toBe(70);
  });
});

describe("initial accuracy (ShipEntity.m:658-676)", () => {
  it("is randf * 10 - 5 as a float32", () => {
    expect(initialAccuracy(0.25, "CLASS_NEUTRAL")).toBe(Math.fround(-2.5));
    expect(initialAccuracy(0.123456789, "CLASS_NEUTRAL")).toBe(
      Math.fround(0.123456789 * 10 - 5),
    );
  });

  it("is never negative for police and military pilots", () => {
    for (const draw of [0, 0.1, 0.25, 0.49999, 0.5, 0.9]) {
      expect(initialAccuracy(draw, "CLASS_POLICE")).toBeGreaterThanOrEqual(0);
      expect(initialAccuracy(draw, "CLASS_MILITARY")).toBeGreaterThanOrEqual(0);
    }
    expect(initialAccuracy(0, "CLASS_POLICE")).toBe(5);
  });

  it("clamps through setAccuracy (a missile never goes below 0)", () => {
    expect(clampAccuracy(-7, "CLASS_NEUTRAL")).toBe(-5);
    expect(clampAccuracy(12, "CLASS_NEUTRAL")).toBe(10);
    expect(clampAccuracy(-1, "CLASS_MISSILE")).toBe(0);
  });
});
