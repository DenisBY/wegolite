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
 * missile 3/4 vs 4/4, berth 6/7 vs 7/7, a 20 t fifth berth (4 free pods) vs a
 * 35 t seventh berth (5 free pods), and 72/140 dc fuel fills.
 */

import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseEquipment } from "../../../src/content/equipment.js";
import type { Equipment } from "../../../src/content/types.js";
import {
  PASSENGER_BERTH_PODS,
  capacityPodsFor,
} from "../../../src/sim/economy/cargo.js";
import { FACINGS, NO_LASER } from "../../../src/sim/combat/mounts.js";
import type { LaserMounts } from "../../../src/sim/combat/mounts.js";
import {
  FUEL_CAPACITY,
  LASER_FIT_KEYS,
  MAX_MISSILES,
  MAX_PASSENGER_BERTHS,
  REMOVAL_DESCRIPTIONS,
  VISIBLE_EQUIPMENT_KEYS,
  applyFit,
  applyLaserFit,
  applyRepair,
  checkFit,
  checkLaserFit,
  checkRepair,
  fitPrice,
  isListedForPurchase,
  laserFitKey,
  laserPriceMap,
  parseLaserFitKey,
  parseRepairFitKey,
  repairFitKey,
  repairPrice,
  repairTechLevel,
} from "../../../src/sim/player/outfitting.js";
import type {
  FitContext,
  FitRefusal,
  LaserFitContext,
} from "../../../src/sim/player/outfitting.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";

const catalogue = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/equipment.json", import.meta.url),
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
    expect(checkFit(makeProfile({ fuel: 70 }), fuel, makeContext())).toEqual({
      ok: false,
      reason: "fullFuel",
    });
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
      checkFit(
        makeProfile({ fuel: 10 }),
        fuel,
        makeContext({ fuelCapacity: 70.5 }),
      ),
    ).toEqual({ ok: false, reason: "invalidPrice" });
    expect(
      checkFit(
        makeProfile({ fuel: 60 }),
        fuel,
        makeContext({ fuelCapacity: 50 }),
      ),
    ).toEqual({ ok: false, reason: "invalidPrice" });
  });
});

describe("multi-instance counts", () => {
  it("refuses a fifth missile at 4/4 and allows the fourth at 3/4", () => {
    expect(
      checkFit(
        makeProfile({ missiles: 4, credits: 300 }),
        missile,
        makeContext(),
      ),
    ).toEqual({ ok: false, reason: "pylonsFull" });
    expect(
      checkFit(
        makeProfile({ missiles: 3, credits: 300 }),
        missile,
        makeContext(),
      ),
    ).toEqual({ ok: true });
    expect(
      checkFit(
        makeProfile({ missiles: 2, credits: 299 }),
        missile,
        makeContext(),
      ),
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
        checkFit(
          makeProfile({ missiles: 1, credits: 300 }),
          forged,
          makeContext(),
        ),
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
      checkFit(profile, cargoBay, makeContext({ techLevelRaw: 4 })),
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

describe("applyFit: single-instance equipment", () => {
  it("charges the cargo bay once and raises capacity 20 -> 35", () => {
    const before = makeProfile({ credits: 4000 });
    const after = applyFit(before, cargoBay, makeContext({ techLevelRaw: 4 }));

    expect(after).not.toBe(before);
    expect(after.credits).toBe(0);
    expect(after.equipment).toEqual(["EQ_CARGO_BAY"]);
    expect(capacityPodsFor(before.equipment, before.passengerBerths)).toBe(20);
    expect(capacityPodsFor(after.equipment, after.passengerBerths)).toBe(35);
    expect(before.credits).toBe(4000);
  });

  it("preserves cargo, fuel, missiles and berths while buying", () => {
    const before = makeProfile({
      credits: 4000,
      cargo: { food: 2 },
      fuel: 63,
      missiles: 1,
      passengerBerths: 1,
    });
    const after = applyFit(before, cargoBay, makeContext({ techLevelRaw: 4 }));

    expect(after.cargo).toEqual({ food: 2 });
    expect(after.fuel).toBe(63);
    expect(after.missiles).toBe(1);
    expect(after.passengerBerths).toBe(1);
    expect(after.equipment).toEqual(["EQ_CARGO_BAY"]);
    expect(after.credits).toBe(0);
    expect(capacityPodsFor(before.equipment, before.passengerBerths)).toBe(15);
    expect(capacityPodsFor(after.equipment, after.passengerBerths)).toBe(30);
  });

  it("installs a docking computer once on a synthetic raw TL 9 system", () => {
    const before = makeProfile({ credits: 15000 });
    const after = applyFit(
      before,
      dockComputer,
      makeContext({ techLevelRaw: 9 }),
    );

    expect(after.credits).toBe(0);
    expect(after.equipment).toEqual(["EQ_DOCK_COMP"]);
    expect(
      applyFit(after, dockComputer, makeContext({ techLevelRaw: 9 })),
    ).toBe(after);
  });

  it("returns the same object for an owned key", () => {
    const owned = makeProfile({
      credits: 4000,
      equipment: ["EQ_CARGO_BAY"],
    });
    expect(applyFit(owned, cargoBay, makeContext({ techLevelRaw: 4 }))).toBe(
      owned,
    );
  });
});

describe("applyFit: fuel", () => {
  it("fills the tank and charges exactly the fill cost", () => {
    const before = makeProfile({ fuel: 34, credits: 140 });
    const after = applyFit(before, fuel, makeContext());

    expect(after.fuel).toBe(70);
    expect(after.credits).toBe(68);
    expect(after.equipment).toEqual([]);
    expect(before.fuel).toBe(34);
  });

  it("fills an empty tank for exactly 140 dc", () => {
    const after = applyFit(
      makeProfile({ fuel: 0, credits: 140 }),
      fuel,
      makeContext(),
    );
    expect(after.fuel).toBe(70);
    expect(after.credits).toBe(0);
  });

  it("refuses a short balance and a fractional tank without marking anything", () => {
    const poor = makeProfile({ fuel: 34, credits: 71 });
    expect(applyFit(poor, fuel, makeContext())).toBe(poor);

    const fractional = makeProfile({ fuel: 69.5, credits: 140 });
    expect(applyFit(fractional, fuel, makeContext())).toBe(fractional);

    const full = makeProfile({ fuel: 70, credits: 140 });
    expect(applyFit(full, fuel, makeContext())).toBe(full);
  });
});

describe("applyFit: missiles and berths", () => {
  it("adds one missile for 300 dc up to 4", () => {
    const before = makeProfile({ missiles: 3, credits: 300 });
    const after = applyFit(before, missile, makeContext());

    expect(after.missiles).toBe(MAX_MISSILES);
    expect(after.credits).toBe(0);
    expect(after.equipment).toEqual([]);
  });

  it("refuses a fifth missile, a short balance and a full pylon set", () => {
    const fullPylons = makeProfile({ missiles: MAX_MISSILES, credits: 300 });
    expect(applyFit(fullPylons, missile, makeContext())).toBe(fullPylons);

    const poor = makeProfile({ missiles: 2, credits: 299 });
    expect(applyFit(poor, missile, makeContext())).toBe(poor);
  });

  it("charges exactly 8250 dc for a berth and frees 5 t", () => {
    const before = makeProfile({
      credits: 8250,
      equipment: ["EQ_CARGO_BAY"],
    });
    const after = applyFit(before, berth, makeContext({ availablePods: 35 }));

    expect(after.passengerBerths).toBe(1);
    expect(after.credits).toBe(0);
    expect(after.equipment).toEqual(["EQ_CARGO_BAY"]);
    expect(capacityPodsFor(before.equipment, before.passengerBerths)).toBe(35);
    expect(capacityPodsFor(after.equipment, after.passengerBerths)).toBe(30);
    expect(PASSENGER_BERTH_PODS).toBe(5);
  });

  it("allows the seventh berth on a 35 t hull and refuses the eighth", () => {
    const sixth = makeProfile({
      credits: 8250,
      passengerBerths: 6,
      equipment: ["EQ_CARGO_BAY"],
    });
    const seventh = applyFit(sixth, berth, makeContext({ availablePods: 5 }));
    expect(seventh.passengerBerths).toBe(MAX_PASSENGER_BERTHS);
    expect(seventh.credits).toBe(0);
    expect(capacityPodsFor(seventh.equipment, seventh.passengerBerths)).toBe(0);

    const eighth = { ...seventh, credits: 8250 };
    const refused = applyFit(eighth, berth, makeContext({ availablePods: 0 }));
    expect(refused).toBe(eighth);
    expect(refused.passengerBerths).toBe(MAX_PASSENGER_BERTHS);
    expect(checkFit(eighth, berth, makeContext())).toEqual({
      ok: false,
      reason: "maxInstances",
    });
  });

  it("refuses the fifth berth on a 20 t hull with four free pods", () => {
    const before = makeProfile({ credits: 8250, passengerBerths: 4 });
    const after = applyFit(before, berth, makeContext({ availablePods: 4 }));

    expect(after).toBe(before);
    expect(after.passengerBerths).toBe(4);
  });
});

describe("applyFit: Oolite removal economics", () => {
  it("charges 200 dc then refunds 3 x 300 dc, netting +700 dc", () => {
    const before = makeProfile({ missiles: 3, credits: 1000 });
    const after = applyFit(before, missileRemoval, makeContext());

    expect(after.credits).toBe(1700);
    expect(after.missiles).toBe(0);
    expect(after.credits - before.credits).toBe(700);
  });

  it("refunds all four at a full pylon set, netting +1000 dc", () => {
    const before = makeProfile({ missiles: 4, credits: 1000 });
    const after = applyFit(before, missileRemoval, makeContext());

    expect(after.credits).toBe(2000);
    expect(after.missiles).toBe(0);
  });

  it("nets +100 dc at one missile", () => {
    const before = makeProfile({ missiles: 1, credits: 1000 });
    const after = applyFit(before, missileRemoval, makeContext());

    expect(after.credits).toBe(1100);
    expect(after.missiles).toBe(0);
  });

  it("refuses with no missiles even though the net would be positive", () => {
    const before = makeProfile({ missiles: 0, credits: 1000 });
    expect(applyFit(before, missileRemoval, makeContext())).toBe(before);
  });

  it("applies the 200 dc affordability gate before the refund", () => {
    const before = makeProfile({ missiles: 1, credits: 199 });
    expect(applyFit(before, missileRemoval, makeContext())).toBe(before);
    expect(before.credits).toBe(199);
    expect(before.missiles).toBe(1);
  });

  it("refuses a forged trade-in price instead of applying silently", () => {
    const before = makeProfile({ missiles: 1, credits: 1000 });
    expect(
      applyFit(before, missileRemoval, makeContext({ missilePrice: 1.5 })),
    ).toBe(before);
  });

  it("charges exactly 1000 dc for a berth removal and never refunds", () => {
    const before = makeProfile({ passengerBerths: 1, credits: 1000 });
    const after = applyFit(before, berthRemoval, makeContext());

    expect(after.passengerBerths).toBe(0);
    expect(after.credits).toBe(0);
    expect(after.credits - before.credits).toBe(-1000);
  });

  it("charges the berth removal fee and leaves the remaining balance", () => {
    const before = makeProfile({ passengerBerths: 1, credits: 1200 });
    const after = applyFit(before, berthRemoval, makeContext());

    expect(after.credits).toBe(200);
    expect(after.passengerBerths).toBe(0);
  });

  it("refuses a berth removal with no berths and a short balance", () => {
    const noBerths = makeProfile({ passengerBerths: 0, credits: 1000 });
    expect(applyFit(noBerths, berthRemoval, makeContext())).toBe(noBerths);

    const poor = makeProfile({ passengerBerths: 1, credits: 999 });
    expect(applyFit(poor, berthRemoval, makeContext())).toBe(poor);
  });
});

describe("applyFit: refusal boundaries", () => {
  it("returns the same object for an out-of-set key and moves no money", () => {
    const before = makeProfile({ credits: 1_000_000 });
    expect(applyFit(before, item("EQ_ECM"), makeContext())).toBe(before);
    expect(applyFit(before, item("EQ_WEAPON_PULSE_LASER"), makeContext())).toBe(
      before,
    );
    expect(before.credits).toBe(1_000_000);
  });

  it("does not compute a price before checkFit approves", () => {
    const before = makeProfile({ credits: 10_000 });
    for (const forged of [
      { ...berth, price: Number.NaN },
      { ...berth, price: 0 },
      { ...cargoBay, price: Number.POSITIVE_INFINITY },
    ]) {
      expect(applyFit(before, forged, makeContext())).toBe(before);
    }
    expect(before.credits).toBe(10_000);
  });

  it("does not apply a fractional fuel purchase", () => {
    const before = makeProfile({ fuel: 34.5, credits: 1000 });
    expect(applyFit(before, fuel, makeContext())).toBe(before);
    expect(before.fuel).toBe(34.5);
  });
});

describe("applyFit: property over random valid profiles", () => {
  const records = VISIBLE_EQUIPMENT_KEYS.map((key) => item(key));
  const singleInstanceKeys = [
    "EQ_CARGO_BAY",
    "EQ_DOCK_COMP",
    "EQ_GAL_DRIVE",
    "EQ_ADVANCED_COMPASS",
    "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
  ] as const;

  it("never leaves any field outside its save-schema bounds", () => {
    const arbFields = fc.record({
      credits: fc.integer({ min: 0, max: 1_000_000 }),
      fuel: fc.integer({ min: 0, max: FUEL_CAPACITY }),
      missiles: fc.integer({ min: 0, max: MAX_MISSILES }),
      passengerBerths: fc.integer({ min: 0, max: MAX_PASSENGER_BERTHS }),
      equipment: fc.uniqueArray(fc.constantFrom(...singleInstanceKeys), {
        maxLength: singleInstanceKeys.length,
      }),
    });
    const arbRecord = fc.constantFrom(...records);
    const arbContext = fc.record({
      techLevelRaw: fc.integer({ min: 0, max: 15 }),
      fuelCapacity: fc.integer({ min: 0, max: FUEL_CAPACITY }),
      missileCapacity: fc.integer({ min: 0, max: MAX_MISSILES }),
      availablePods: fc.integer({ min: 0, max: 35 }),
      missilePrice: fc.integer({ min: 0, max: 1000 }),
    });

    fc.assert(
      fc.property(arbFields, arbRecord, arbContext, (fields, record, ctx) => {
        const before = makeProfile(fields);
        const after = applyFit(before, record, ctx);

        expect(Number.isSafeInteger(after.credits)).toBe(true);
        expect(after.credits).toBeGreaterThanOrEqual(0);
        expect(Number.isSafeInteger(after.fuel)).toBe(true);
        expect(after.fuel).toBeGreaterThanOrEqual(0);
        expect(after.fuel).toBeLessThanOrEqual(FUEL_CAPACITY);
        expect(after.missiles).toBeGreaterThanOrEqual(0);
        expect(after.missiles).toBeLessThanOrEqual(MAX_MISSILES);
        expect(after.passengerBerths).toBeGreaterThanOrEqual(0);
        expect(after.passengerBerths).toBeLessThanOrEqual(MAX_PASSENGER_BERTHS);
        expect(new Set(after.equipment).size).toBe(after.equipment.length);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Lasers (CBT-05, plan 13-09). Expected values come from Oolite
// (`PlayerEntity.m:9139-9217`, `doTradeIn` `:9431-9438`) and from the catalogue
// prices read in the plan: pulse 4,000, beam 10,000, mining 8,000, military
// 60,000 decicredits; tech levels 3, 4, 10, 10.
// ---------------------------------------------------------------------------

function laserContext(
  overrides: Partial<LaserFitContext> = {},
): LaserFitContext {
  return {
    ...makeContext(),
    laserPrices: laserPriceMap(catalogue),
    ...overrides,
  };
}

function mounts(overrides: Partial<LaserMounts> = {}): LaserMounts {
  return { ...newProfile().laserMounts, ...overrides };
}

describe("LASER_FIT_KEYS and the composite row key", () => {
  it("lists Remove Laser then the four lasers in equipment.plist order", () => {
    expect([...LASER_FIT_KEYS]).toEqual([
      "EQ_WEAPON_NONE",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_BEAM_LASER",
      "EQ_WEAPON_MINING_LASER",
      "EQ_WEAPON_MILITARY_LASER",
    ]);
  });

  it("round-trips every allow-listed key on every facing", () => {
    for (const key of LASER_FIT_KEYS) {
      for (const facing of FACINGS) {
        const composite = laserFitKey(key, facing);
        expect(composite).toBe(`${key}@${facing}`);
        expect(parseLaserFitKey(composite)).toEqual({ key, facing });
      }
    }
  });

  it("refuses a forged composite key (T-13-18)", () => {
    for (const forged of [
      "EQ_ECM@fore",
      "EQ_WEAPON_PULSE_LASER@up",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_THARGOID_LASER@fore",
      "EQ_WEAPON_PULSE_LASER@fore@aft",
      "EQ_WEAPON_PULSE_LASER@",
      "@fore",
      "",
      "EQ_WEAPON_PULSE_LASER@FORE",
      "EQ_WEAPON_PULSE_LASER@__proto__",
    ]) {
      expect(parseLaserFitKey(forged)).toBeNull();
    }
  });
});

describe("checkLaserFit and applyLaserFit: purchase and trade-in", () => {
  it("charges the price and fits a laser on an empty facing with no refund", () => {
    const before = makeProfile({ credits: 10_000 });
    const after = applyLaserFit(
      before,
      item("EQ_WEAPON_BEAM_LASER"),
      "aft",
      laserContext({ techLevelRaw: 4 }),
    );

    expect(after.credits).toBe(0);
    expect(after.laserMounts).toEqual(mounts({ aft: "EQ_WEAPON_BEAM_LASER" }));
    expect(before.laserMounts).toEqual(mounts());
    expect(after).not.toBe(before);
  });

  it("a pulse over the fore pulse pays 4,000 and is refunded 4,000, mount unchanged", () => {
    const before = makeProfile({ credits: 4_000 });
    const after = applyLaserFit(
      before,
      item("EQ_WEAPON_PULSE_LASER"),
      "fore",
      laserContext(),
    );

    expect(after.credits).toBe(4_000);
    expect(after.laserMounts).toEqual(mounts());
    // A success is a new object even at a zero net, so identity still means refused.
    expect(after).not.toBe(before);
  });

  it("a military laser over the fore pulse needs 60,000 and the refund does not count", () => {
    const military = item("EQ_WEAPON_MILITARY_LASER");

    const poor = makeProfile({ credits: 59_999 });
    expect(checkLaserFit(poor, military, "fore", laserContext())).toEqual({
      ok: false,
      reason: "insufficientCredits",
    });
    expect(applyLaserFit(poor, military, "fore", laserContext())).toBe(poor);
    expect(poor.credits).toBe(59_999);
    expect(poor.laserMounts).toEqual(mounts());

    const enough = makeProfile({ credits: 60_000 });
    const after = applyLaserFit(enough, military, "fore", laserContext());
    expect(after.credits).toBe(4_000);
    expect(after.laserMounts.fore).toBe("EQ_WEAPON_MILITARY_LASER");
  });

  it("refunds the laser it replaces at that laser's own catalogue price", () => {
    const before = makeProfile({
      credits: 10_000,
      laserMounts: mounts({ aft: "EQ_WEAPON_MINING_LASER" }),
    });
    const after = applyLaserFit(
      before,
      item("EQ_WEAPON_BEAM_LASER"),
      "aft",
      laserContext(),
    );

    // 10,000 paid, 8,000 refunded for the mining laser.
    expect(after.credits).toBe(8_000);
    expect(after.laserMounts.aft).toBe("EQ_WEAPON_BEAM_LASER");
  });

  it("Remove Laser costs 0, refunds the removed laser and empties the facing", () => {
    const before = makeProfile({ credits: 0 });
    expect(
      checkLaserFit(before, item("EQ_WEAPON_NONE"), "fore", laserContext()),
    ).toEqual({ ok: true });
    const after = applyLaserFit(
      before,
      item("EQ_WEAPON_NONE"),
      "fore",
      laserContext(),
    );

    expect(after.credits).toBe(4_000);
    expect(after.laserMounts.fore).toBe(NO_LASER);
  });

  it("Remove Laser on an empty facing is noLaser and changes nothing", () => {
    const before = makeProfile({ credits: 5_000 });
    expect(
      checkLaserFit(before, item("EQ_WEAPON_NONE"), "aft", laserContext()),
    ).toEqual({ ok: false, reason: "noLaser" });
    expect(
      applyLaserFit(before, item("EQ_WEAPON_NONE"), "aft", laserContext()),
    ).toBe(before);
  });

  it("each facing is independent", () => {
    let profile = makeProfile({ credits: 100_000 });
    for (const facing of ["aft", "port", "starboard"] as const) {
      profile = applyLaserFit(
        profile,
        item("EQ_WEAPON_PULSE_LASER"),
        facing,
        laserContext(),
      );
    }
    expect(profile.laserMounts).toEqual({
      fore: "EQ_WEAPON_PULSE_LASER",
      aft: "EQ_WEAPON_PULSE_LASER",
      port: "EQ_WEAPON_PULSE_LASER",
      starboard: "EQ_WEAPON_PULSE_LASER",
    });
    expect(profile.credits).toBe(100_000 - 3 * 4_000);
  });
});

describe("checkLaserFit: the raw tech-level rule", () => {
  const rich = makeProfile({ credits: 1_000_000 });

  it("at raw TL 3 only Pulse and Remove Laser are fittable", () => {
    const ctx = laserContext({ techLevelRaw: 3 });
    const verdict = (key: string) =>
      checkLaserFit(rich, item(key), "fore", ctx).ok;

    expect(verdict("EQ_WEAPON_PULSE_LASER")).toBe(true);
    expect(verdict("EQ_WEAPON_NONE")).toBe(true);
    expect(verdict("EQ_WEAPON_BEAM_LASER")).toBe(false);
    expect(verdict("EQ_WEAPON_MINING_LASER")).toBe(false);
    expect(verdict("EQ_WEAPON_MILITARY_LASER")).toBe(false);
  });

  it("Beam needs TL 4 and Mining and Military need TL 10, equality allowed", () => {
    const at = (key: string, techLevelRaw: number) =>
      checkLaserFit(rich, item(key), "fore", laserContext({ techLevelRaw }));

    expect(at("EQ_WEAPON_BEAM_LASER", 3)).toEqual({
      ok: false,
      reason: "techLevel",
    });
    expect(at("EQ_WEAPON_BEAM_LASER", 4)).toEqual({ ok: true });
    for (const key of ["EQ_WEAPON_MINING_LASER", "EQ_WEAPON_MILITARY_LASER"]) {
      expect(at(key, 9)).toEqual({ ok: false, reason: "techLevel" });
      expect(at(key, 10)).toEqual({ ok: true });
    }
  });

  it("refuses a non-integer tech level fail-closed", () => {
    expect(
      checkLaserFit(
        rich,
        item("EQ_WEAPON_PULSE_LASER"),
        "fore",
        laserContext({ techLevelRaw: Number.NaN }),
      ),
    ).toEqual({ ok: false, reason: "techLevel" });
  });
});

describe("the money-path boundary (T-13-18, T-13-19)", () => {
  const rich = makeProfile({ credits: 1_000_000 });

  it("checkFit and applyFit still refuse every laser record and EQ_ECM as notOffered", () => {
    for (const key of [
      "EQ_ECM",
      "EQ_WEAPON_NONE",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_BEAM_LASER",
      "EQ_WEAPON_MINING_LASER",
      "EQ_WEAPON_MILITARY_LASER",
      "EQ_WEAPON_THARGOID_LASER",
    ]) {
      expect(checkFit(rich, item(key), makeContext())).toEqual({
        ok: false,
        reason: "notOffered",
      });
      expect(applyFit(rich, item(key), makeContext())).toBe(rich);
    }
  });

  it("the laser path refuses every record outside the laser allow-list", () => {
    for (const key of [
      "EQ_ECM",
      "EQ_WEAPON_THARGOID_LASER",
      "EQ_SHIELD_BOOSTER",
      "EQ_ESCAPE_POD",
      "EQ_MISSILE",
      "EQ_CARGO_BAY",
    ]) {
      for (const facing of FACINGS) {
        expect(checkLaserFit(rich, item(key), facing, laserContext())).toEqual({
          ok: false,
          reason: "notOffered",
        });
        expect(applyLaserFit(rich, item(key), facing, laserContext())).toBe(
          rich,
        );
      }
    }
  });

  it("refuses a facing outside the allow-list", () => {
    const forgedFacing = "up" as unknown as (typeof FACINGS)[number];
    expect(
      checkLaserFit(
        rich,
        item("EQ_WEAPON_PULSE_LASER"),
        forgedFacing,
        laserContext(),
      ),
    ).toEqual({ ok: false, reason: "notOffered" });
  });

  it("refuses forged prices before any arithmetic", () => {
    const pulse = item("EQ_WEAPON_PULSE_LASER");
    for (const price of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2e9,
    ]) {
      const forged = { ...pulse, price };
      expect(checkLaserFit(rich, forged, "aft", laserContext())).toEqual({
        ok: false,
        reason: "invalidPrice",
      });
      expect(applyLaserFit(rich, forged, "aft", laserContext())).toBe(rich);
    }
  });

  it("Remove Laser costs 0 whatever the record claims", () => {
    const forged = { ...item("EQ_WEAPON_NONE"), price: 99_999 };
    const after = applyLaserFit(
      makeProfile({ credits: 0 }),
      forged,
      "fore",
      laserContext(),
    );
    expect(after.credits).toBe(4_000);
  });

  it("refuses when the refund price of the laser being replaced is untrusted", () => {
    const before = makeProfile({ credits: 100_000 });
    const noPrices = laserContext({ laserPrices: new Map() });
    expect(
      checkLaserFit(before, item("EQ_WEAPON_BEAM_LASER"), "fore", noPrices),
    ).toEqual({ ok: false, reason: "invalidPrice" });
    expect(
      applyLaserFit(before, item("EQ_WEAPON_BEAM_LASER"), "fore", noPrices),
    ).toBe(before);

    // An empty facing has nothing to refund, so no price is needed.
    expect(
      checkLaserFit(before, item("EQ_WEAPON_BEAM_LASER"), "aft", noPrices),
    ).toEqual({ ok: true });
  });

  it("refuses a tampered mount occupant", () => {
    const tampered = {
      ...makeProfile({ credits: 100_000 }),
      laserMounts: { ...mounts(), aft: "EQ_ECM" },
    } as unknown as PlayerProfile;
    expect(
      checkLaserFit(
        tampered,
        item("EQ_WEAPON_PULSE_LASER"),
        "aft",
        laserContext(),
      ),
    ).toEqual({ ok: false, reason: "invalidCondition" });
  });

  it("refuses unsafe credits and never writes negative or fractional credits", () => {
    for (const credits of [Number.NaN, -1, 0.5, Number.MAX_SAFE_INTEGER + 2]) {
      const bad = makeProfile({ credits });
      expect(
        checkLaserFit(
          bad,
          item("EQ_WEAPON_PULSE_LASER"),
          "aft",
          laserContext(),
        ),
      ).toEqual({ ok: false, reason: "insufficientCredits" });
    }
  });

  it("laserPriceMap keeps only the allow-listed, validated laser prices", () => {
    const prices = laserPriceMap([
      ...catalogue,
      {
        ...item("EQ_WEAPON_BEAM_LASER"),
        key: "EQ_WEAPON_BEAM_LASER",
        price: -5,
      },
    ]);
    // A later bad row for the same key cannot poison the map with a bad value.
    expect(prices.get("EQ_WEAPON_PULSE_LASER")).toBe(4_000);
    expect(prices.get("EQ_WEAPON_BEAM_LASER")).toBe(10_000);
    expect(prices.get("EQ_WEAPON_NONE")).toBe(0);
    expect(prices.has("EQ_ECM")).toBe(false);
    expect(prices.has("EQ_WEAPON_THARGOID_LASER")).toBe(false);
  });

  it("never lets credits go negative across any sequence of purchases", () => {
    const keys = LASER_FIT_KEYS;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200_000 }),
        fc.array(
          fc.tuple(fc.constantFrom(...keys), fc.constantFrom(...FACINGS)),
          { maxLength: 12 },
        ),
        (credits, steps) => {
          let profile = makeProfile({ credits });
          for (const [key, facing] of steps) {
            const next = applyLaserFit(
              profile,
              item(key),
              facing,
              laserContext(),
            );
            expect(Number.isSafeInteger(next.credits)).toBe(true);
            expect(next.credits).toBeGreaterThanOrEqual(0);
            profile = next;
          }
        },
      ),
    );
  });
});

describe("isListedForPurchase (Oolite equipmentAllowed)", () => {
  // A literal list, not derived from the table: a new FitRefusal fails the
  // type check below until this list (and the table) classify it.
  const ALL_REFUSALS: readonly FitRefusal[] = [
    "notOffered",
    "techLevel",
    "owned",
    "maxInstances",
    "cargoSpace",
    "pylonsFull",
    "nothingToRemove",
    "noLaser",
    "insufficientCredits",
    "fullFuel",
    "invalidPrice",
    "invalidCondition",
  ];

  it("classifies every refusal: only insufficientCredits stays listed", () => {
    expect(ALL_REFUSALS).toHaveLength(12);
    expect(isListedForPurchase({ ok: true })).toBe(true);
    for (const reason of ALL_REFUSALS) {
      expect(isListedForPurchase({ ok: false, reason })).toBe(
        reason === "insufficientCredits",
      );
    }
  });

  it("reports every non-credit refusal before affordability at 0 credits", () => {
    const broke = (overrides: Partial<PlayerProfile> = {}) =>
      makeProfile({ credits: 0, ...overrides });
    const results = [
      checkFit(broke(), dockComputer, makeContext({ techLevelRaw: 4 })),
      checkFit(broke({ equipment: ["EQ_CARGO_BAY"] }), cargoBay, makeContext()),
      checkFit(broke({ missiles: MAX_MISSILES }), missile, makeContext()),
      checkFit(broke(), berth, makeContext({ availablePods: 0 })),
      checkFit(
        broke({ passengerBerths: MAX_PASSENGER_BERTHS }),
        berth,
        makeContext(),
      ),
      checkFit(broke({ fuel: FUEL_CAPACITY }), fuel, makeContext()),
      checkFit(broke({ missiles: 0 }), missileRemoval, makeContext()),
      checkLaserFit(
        broke(),
        item("EQ_WEAPON_MINING_LASER"),
        "fore",
        laserContext({ techLevelRaw: 4 }),
      ),
      checkLaserFit(
        broke({ laserMounts: mounts({ aft: NO_LASER }) }),
        item(NO_LASER),
        "aft",
        laserContext(),
      ),
    ];
    expect(results).toEqual([
      { ok: false, reason: "techLevel" },
      { ok: false, reason: "owned" },
      { ok: false, reason: "pylonsFull" },
      { ok: false, reason: "cargoSpace" },
      { ok: false, reason: "maxInstances" },
      { ok: false, reason: "fullFuel" },
      { ok: false, reason: "nothingToRemove" },
      { ok: false, reason: "techLevel" },
      { ok: false, reason: "noLaser" },
    ]);
    for (const result of results)
      expect(isListedForPurchase(result)).toBe(false);
  });

  it("keeps an item that passes every rule but the price listed", () => {
    const short = checkFit(
      makeProfile({ credits: 0 }),
      cargoBay,
      makeContext(),
    );
    expect(short).toEqual({ ok: false, reason: "insufficientCredits" });
    expect(isListedForPurchase(short)).toBe(true);
    const laser = checkLaserFit(
      makeProfile({ credits: 3_999 }),
      item("EQ_WEAPON_PULSE_LASER"),
      "aft",
      laserContext({ techLevelRaw: 4 }),
    );
    expect(laser).toEqual({ ok: false, reason: "insufficientCredits" });
    expect(isListedForPurchase(laser)).toBe(true);
  });
});

describe("the repair door (tracer, D-08 to D-10)", () => {
  const damagedProfile = (overrides: Partial<PlayerProfile> = {}) =>
    makeProfile({
      credits: 10_000,
      equipment: [],
      damagedEquipment: ["EQ_DOCK_COMP"],
      ...overrides,
    });

  it("repairs a damaged docking computer at raw tech level 8 for 7500", () => {
    expect(parseRepairFitKey("EQ_DOCK_COMP@repair")).toBe("EQ_DOCK_COMP");
    const profile = damagedProfile({ equipment: ["EQ_CARGO_BAY"] });
    const ctx = makeContext({ techLevelRaw: 8 });
    expect(checkRepair(profile, dockComputer, ctx)).toEqual({ ok: true });

    const repaired = applyRepair(profile, dockComputer, ctx);
    expect(repaired).not.toBe(profile);
    expect(repaired.credits).toBe(2_500);
    expect(repaired.equipment).toEqual(["EQ_CARGO_BAY", "EQ_DOCK_COMP"]);
    expect(repaired.damagedEquipment).toEqual([]);
    // The input is untouched.
    expect(profile.damagedEquipment).toEqual(["EQ_DOCK_COMP"]);
  });

  it("refuses raw tech level 7 with the same object back", () => {
    const profile = damagedProfile();
    const ctx = makeContext({ techLevelRaw: 7 });
    expect(checkRepair(profile, dockComputer, ctx)).toEqual({
      ok: false,
      reason: "techLevel",
    });
    expect(applyRepair(profile, dockComputer, ctx)).toBe(profile);
  });

  it("refuses a forged profile that holds the key in both lists", () => {
    const profile = damagedProfile({ equipment: ["EQ_DOCK_COMP"] });
    const ctx = makeContext({ techLevelRaw: 8 });
    expect(checkRepair(profile, dockComputer, ctx)).toEqual({
      ok: false,
      reason: "owned",
    });
    expect(applyRepair(profile, dockComputer, ctx)).toBe(profile);
  });

  it("builds the row key and prices through the module helpers", () => {
    expect(repairFitKey("EQ_DOCK_COMP")).toBe("EQ_DOCK_COMP@repair");
    expect(repairPrice(dockComputer)).toBe(7_500);
    expect(repairTechLevel(9)).toBe(8);
  });
});
