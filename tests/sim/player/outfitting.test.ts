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
import {
  FUEL_CAPACITY,
  MAX_MISSILES,
  MAX_PASSENGER_BERTHS,
  REMOVAL_DESCRIPTIONS,
  VISIBLE_EQUIPMENT_KEYS,
  applyFit,
  checkFit,
  fitPrice,
} from "../../../src/sim/player/outfitting.js";
import type { FitContext } from "../../../src/sim/player/outfitting.js";
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
