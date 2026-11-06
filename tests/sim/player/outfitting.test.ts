// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * F3 outfitting availability (ECON-05, ECON-08, D-10..D-16).
 *
 * The visible set is a money-path boundary, not a UI filter: every out-of-set
 * key is `notOffered`. The tech gate uses the **raw** level (equality allowed),
 * conditions fail closed, and fuel prices are the fill cost `(70 - fuel) * 2`,
 * never the 2 dc unit price.
 *
 * Boundary cases are exact: TL equal vs one below, credits equal vs one short,
 * missile 2/3 vs 3/3, berth 6/7 vs 7/7, a 20 t fifth berth (4 free pods) vs a
 * 35 t seventh berth (5 free pods), and 72/140 dc fuel fills.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseEquipment } from "../../../src/content/equipment.js";
import type { Equipment } from "../../../src/content/types.js";
import {
  FUEL_CAPACITY,
  MAX_MISSILES,
  MAX_PASSENGER_BERTHS,
  REMOVAL_DESCRIPTIONS,
  VISIBLE_EQUIPMENT_KEYS,
  checkFit,
  fitPrice,
} from "../../../src/sim/player/outfitting.js";
import type { FitContext } from "../../../src/sim/player/outfitting.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";

const catalogue = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/equipment.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as unknown,
);

function item(key: string): Equipment {
  const record = catalogue.find((candidate) => candidate.key === key);
  if (record === undefined) throw new Error(`no equipment "${key}"`);
  return record;
}

function makeContext(overrides: Partial<FitContext> = {}): FitContext {
  return {
    techLevelRaw: 11,
    fuelCapacity: FUEL_CAPACITY,
    missileCapacity: MAX_MISSILES,
    availablePods: 20,
    missilePrice: item("EQ_MISSILE").price,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...newProfile(), ...overrides };
}

const fuel = item("EQ_FUEL");
const cargoBay = item("EQ_CARGO_BAY");
const dockComputer = item("EQ_DOCK_COMP");
const galDrive = item("EQ_GAL_DRIVE");
const compass = item("EQ_ADVANCED_COMPASS");
const array = item("EQ_ADVANCED_NAVIGATIONAL_ARRAY");
const missile = item("EQ_MISSILE");
const berth = item("EQ_PASSENGER_BERTH");
const berthRemoval = item("EQ_PASSENGER_BERTH_REMOVAL");
const missileRemoval = item("EQ_MISSILE_REMOVAL");

describe("the D-11 visible set", () => {
  it("is exactly the ordered peaceful set", () => {
    expect(VISIBLE_EQUIPMENT_KEYS).toEqual([
      "EQ_FUEL",
      "EQ_CARGO_BAY",
      "EQ_DOCK_COMP",
      "EQ_GAL_DRIVE",
      "EQ_ADVANCED_COMPASS",
      "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
      "EQ_MISSILE",
      "EQ_PASSENGER_BERTH",
      "EQ_PASSENGER_BERTH_REMOVAL",
      "EQ_MISSILE_REMOVAL",
    ]);
  });

  it("carries Oolite-truthful removal copy", () => {
    expect(REMOVAL_DESCRIPTIONS.get("EQ_MISSILE_REMOVAL")).toContain(
      "full catalogue value",
    );
    expect(REMOVAL_DESCRIPTIONS.get("EQ_MISSILE_REMOVAL")).not.toContain(
      "No refund",
    );
    expect(REMOVAL_DESCRIPTIONS.get("EQ_PASSENGER_BERTH_REMOVAL")).toContain(
      "No refund is paid",
    );
  });
});

describe("notOffered", () => {
  it("refuses combat and defensive catalogue records", () => {
    const profile = makeProfile({ credits: 1_000_000 });

    for (const key of [
      "EQ_ECM",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_SHIELD_BOOSTER",
      "EQ_ESCAPE_POD",
      "EQ_FUEL_INJECTION",
    ]) {
      expect(checkFit(profile, item(key), makeContext())).toEqual({
        ok: false,
        reason: "notOffered",
      });
    }
  });

  it("refuses before looking at price or conditions", () => {
    const forged = { ...item("EQ_ECM"), price: 0, conditions: {} };
    expect(checkFit(makeProfile(), forged, makeContext())).toEqual({
      ok: false,
      reason: "notOffered",
    });
  });
});

describe("tech level uses the raw value", () => {
  it("allows an item whose TL equals the raw system TL", () => {
    expect(compass.techLevel).toBe(7);
    expect(
      checkFit(
        makeProfile({ credits: 6500 }),
        compass,
        makeContext({ techLevelRaw: 7 }),
      ),
    ).toEqual({ ok: true });
  });

  it("refuses one raw level below", () => {
    expect(
      checkFit(
        makeProfile({ credits: 6500 }),
        compass,
        makeContext({ techLevelRaw: 6 }),
      ),
    ).toEqual({ ok: false, reason: "techLevel" });
  });

  it("refuses a TL 9 docking computer at Lave's raw level 4", () => {
    expect(
      checkFit(
        makeProfile({ credits: 15000 }),
        dockComputer,
        makeContext({ techLevelRaw: 4 }),
      ),
    ).toEqual({ ok: false, reason: "techLevel" });
  });
});

describe("single-instance ownership and credit boundaries", () => {
  it("refuses an owned key before credits", () => {
    expect(
      checkFit(
        makeProfile({ credits: 0, equipment: ["EQ_CARGO_BAY"] }),
        cargoBay,
        makeContext({ techLevelRaw: 4 }),
      ),
    ).toEqual({ ok: false, reason: "owned" });
  });

  it("accepts credits exactly equal to the price and refuses one short", () => {
    expect(
      checkFit(
        makeProfile({ credits: 4000 }),
        cargoBay,
        makeContext({ techLevelRaw: 4 }),
      ),
    ).toEqual({ ok: true });
    expect(
      checkFit(
        makeProfile({ credits: 3999 }),
        cargoBay,
        makeContext({ techLevelRaw: 4 }),
      ),
    ).toEqual({ ok: false, reason: "insufficientCredits" });
  });

  it("covers every single-instance catalogue key", () => {
    for (const [record, price] of [
      [cargoBay, 4000],
      [dockComputer, 15000],
      [galDrive, 50000],
      [compass, 6500],
      [array, 22500],
    ] as const) {
      expect(
        checkFit(makeProfile({ credits: price }), record, makeContext()),
      ).toEqual({ ok: true });
      expect(
        checkFit(makeProfile({ credits: price - 1 }), record, makeContext()),
      ).toEqual({ ok: false, reason: "insufficientCredits" });
    }
  });
});

describe("fuel", () => {
  it("refuses a full tank as fullFuel, never invalidPrice", () => {
    expect(
      checkFit(makeProfile({ fuel: 70 }), fuel, makeContext()),
    ).toEqual({ ok: false, reason: "fullFuel" });
  });

  it("prices the fill at (70 - fuel) * 2 decicredits", () => {
    expect(fitPrice(makeProfile({ fuel: 34 }), fuel, makeContext())).toBe(72);
    expect(fitPrice(makeProfile({ fuel: 0 }), fuel, makeContext())).toBe(140);
    expect(
      checkFit(makeProfile({ fuel: 34, credits: 72 }), fuel, makeContext()),
    ).toEqual({ ok: true });
    expect(
      checkFit(makeProfile({ fuel: 34, credits: 71 }), fuel, makeContext()),
    ).toEqual({ ok: false, reason: "insufficientCredits" });
    expect(
      checkFit(makeProfile({ fuel: 0, credits: 140 }), fuel, makeContext()),
    ).toEqual({ ok: true });
  });

  it("refuses fractional, negative and over-capacity fuel as invalidPrice", () => {
    for (const value of [69.5, -1, 71, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        checkFit(makeProfile({ fuel: value }), fuel, makeContext()),
      ).toEqual({ ok: false, reason: "invalidPrice" });
    }
  });

  it("refuses an invalid capacity or a fuel above it", () => {
    expect(
      checkFit(makeProfile({ fuel: 10 }), fuel, makeContext({ fuelCapacity: 70.5 })),
    ).toEqual({ ok: false, reason: "invalidPrice" });
    expect(
      checkFit(makeProfile({ fuel: 60 }), fuel, makeContext({ fuelCapacity: 50 })),
    ).toEqual({ ok: false, reason: "invalidPrice" });
  });
});

describe("multi-instance counts", () => {
  it("refuses a fourth missile at 3/3 and allows 2/3", () => {
    expect(
      checkFit(makeProfile({ missiles: 3, credits: 300 }), missile, makeContext()),
    ).toEqual({ ok: false, reason: "pylonsFull" });
    expect(
      checkFit(makeProfile({ missiles: 2, credits: 300 }), missile, makeContext()),
    ).toEqual({ ok: true });
    expect(
      checkFit(makeProfile({ missiles: 2, credits: 299 }), missile, makeContext()),
    ).toEqual({ ok: false, reason: "insufficientCredits" });
  });

  it("refuses an eighth berth at 7 and allows the seventh on a 35 t hold", () => {
    expect(
      checkFit(
        makeProfile({ passengerBerths: MAX_PASSENGER_BERTHS, credits: 8250 }),
        berth,
        makeContext(),
      ),
    ).toEqual({ ok: false, reason: "maxInstances" });
    expect(
      checkFit(
        makeProfile({ passengerBerths: 6, credits: 8250 }),
        berth,
        makeContext({ availablePods: 5 }),
      ),
    ).toEqual({ ok: true });
  });

  it("refuses a fifth berth on a 20 t hull (4 free pods)", () => {
    expect(
      checkFit(
        makeProfile({ passengerBerths: 4, credits: 8250 }),
        berth,
        makeContext({ availablePods: 4 }),
      ),
    ).toEqual({ ok: false, reason: "cargoSpace" });
  });

  it("allows a berth with exactly five free pods", () => {
    expect(
      checkFit(
        makeProfile({ passengerBerths: 0, credits: 8250 }),
        berth,
        makeContext({ availablePods: 5 }),
      ),
    ).toEqual({ ok: true });
  });
});

describe("removal rows", () => {
  it("refuses Remove Missile with no mounted missiles", () => {
    expect(
      checkFit(
        makeProfile({ missiles: 0, credits: 200 }),
        missileRemoval,
        makeContext(),
      ),
    ).toEqual({ ok: false, reason: "nothingToRemove" });
  });

  it("offers Remove Missile at one missile and charges the 200 dc fee", () => {
    expect(
      checkFit(
        makeProfile({ missiles: 1, credits: 200 }),
        missileRemoval,
        makeContext(),
      ),
    ).toEqual({ ok: true });
    expect(
      checkFit(
        makeProfile({ missiles: 1, credits: 199 }),
        missileRemoval,
        makeContext(),
      ),
    ).toEqual({ ok: false, reason: "insufficientCredits" });
  });

  it("refuses a forged trade-in price instead of applying silently", () => {
    for (const missilePrice of [1.5, Number.NaN, -1, 1e10]) {
      expect(
        checkFit(
          makeProfile({ missiles: 1, credits: 200 }),
          missileRemoval,
          makeContext({ missilePrice }),
        ),
      ).toEqual({ ok: false, reason: "invalidPrice" });
    }
  });

  it("refuses Remove Passenger Berth with no berths", () => {
    expect(
      checkFit(
        makeProfile({ passengerBerths: 0, credits: 1000 }),
        berthRemoval,
        makeContext(),
      ),
    ).toEqual({ ok: false, reason: "nothingToRemove" });
  });

  it("offers Remove Passenger Berth at one berth and charges 1000 dc", () => {
    expect(
      checkFit(
        makeProfile({ passengerBerths: 1, credits: 1000 }),
        berthRemoval,
        makeContext(),
      ),
    ).toEqual({ ok: true });
    expect(
      checkFit(
        makeProfile({ passengerBerths: 1, credits: 999 }),
        berthRemoval,
        makeContext(),
      ),
    ).toEqual({ ok: false, reason: "insufficientCredits" });
  });
});

describe("conditions fail closed", () => {
  it("refuses a non-integer or out-of-range requires_cargo_space", () => {
    for (const value of ["5", Number.NaN, -1, 1.5, 36, null]) {
      const forged: Equipment = {
        ...berth,
        conditions: { ...berth.conditions, requires_cargo_space: value },
      };
      expect(
        checkFit(makeProfile({ credits: 8250 }), forged, makeContext()),
      ).toEqual({ ok: false, reason: "invalidCondition" });
    }
  });

  it("refuses a non-boolean flag", () => {
    for (const value of [1, "yes", false, "false", null]) {
      const forged: Equipment = {
        ...missile,
        conditions: { ...missile.conditions, requires_empty_pylon: value },
      };
      expect(
        checkFit(makeProfile({ missiles: 1, credits: 300 }), forged, makeContext()),
      ).toEqual({ ok: false, reason: "invalidCondition" });
    }
  });
});

describe("invalid catalogue prices", () => {
  it("refuses every non-positive, fractional, non-finite or too-large price", () => {
    for (const price of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
    ]) {
      expect(
        checkFit(
          makeProfile({ credits: 1_000_000 }),
          { ...cargoBay, price },
          makeContext({ techLevelRaw: 4 }),
        ),
      ).toEqual({ ok: false, reason: "invalidPrice" });
    }
  });
});

describe("empty and full states", () => {
  it("accepts an empty equipment list and hides unavailable removal rows", () => {
    const profile = makeProfile({ missiles: 0 });

    expect(profile.equipment).toHaveLength(0);
    expect(
      checkFit(
        profile,
        cargoBay,
        makeContext({ techLevelRaw: 4 }),
      ),
    ).toEqual({ ok: false, reason: "insufficientCredits" });
    expect(
      checkFit(
        { ...profile, credits: 4000 },
        cargoBay,
        makeContext({ techLevelRaw: 4 }),
      ),
    ).toEqual({ ok: true });
    expect(checkFit(profile, missileRemoval, makeContext())).toEqual({
      ok: false,
      reason: "nothingToRemove",
    });
    expect(checkFit(profile, berthRemoval, makeContext())).toEqual({
      ok: false,
      reason: "nothingToRemove",
    });
    expect(checkFit(profile, fuel, makeContext())).toEqual({
      ok: false,
      reason: "fullFuel",
    });
  });
});

describe("fitPrice", () => {
  it("returns the catalogue price for a non-fuel row", () => {
    expect(fitPrice(newProfile(), cargoBay, makeContext())).toBe(4000);
    expect(fitPrice(newProfile(), berth, makeContext())).toBe(8250);
    expect(fitPrice(newProfile(), missile, makeContext())).toBe(300);
  });

  it("returns 0 for a full tank or an invalid cost", () => {
    expect(fitPrice(makeProfile({ fuel: 70 }), fuel, makeContext())).toBe(0);
    expect(fitPrice(makeProfile({ fuel: 69.5 }), fuel, makeContext())).toBe(0);
    expect(
      fitPrice(makeProfile({ fuel: 10 }), { ...fuel, price: 0 }, makeContext()),
    ).toBe(0);
  });
});
