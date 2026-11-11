// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F5 status/manifest view model (ECON-06, D-04).
 *
 * Page 1 is every Oolite status field with the Lave values pinned exactly;
 * page 2 is the 16-row tradeable manifest with each commodity's own unit, so
 * gold, platinum and gem-stones can never be described as tonnes. The page
 * indicator is `Page N/2` and the page clamps to 1..2. It also pins the single
 * exact `formatDecicredits` re-exported from the profile module.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseEquipment } from "../../src/content/equipment.js";
import type { Equipment, System } from "../../src/content/types.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../src/sim/economy/market.js";
import { formatDecicredits, newProfile } from "../../src/sim/player/profile.js";
import {
  buildHomeModel,
  buildStatusModel,
  formatDecicredits as stationFormatDecicredits,
} from "../../src/ui/station-model.js";
import { commoditiesFixture } from "../helpers/commodities.js";
import { labelsFixture } from "../helpers/labels.js";
import { laveFixture } from "../helpers/lave.js";

const catalogue: readonly Equipment[] = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);

const labels = labelsFixture();
const system = laveFixture().system;
const commodities = commoditiesFixture();

function value(model: ReturnType<typeof buildStatusModel>, label: string) {
  return model.fields.find((field) => field.label === label)?.value;
}

describe("buildStatusModel page 1", () => {
  it("renders every pinned Lave status field", () => {
    const model = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      1,
    );

    expect(model.page).toBe(1);
    expect(model.pageText).toBe("Page 1/2");
    expect(value(model, "Commander")).toBe("Jameson");
    expect(value(model, "Ship")).toBe("Cobra Mk III");
    expect(value(model, "Present System")).toBe("Lave");
    expect(value(model, "Hyperspace System")).toBe("(Unknown)");
    expect(value(model, "Condition")).toBe("Docked");
    expect(value(model, "Fuel")).toBe("7.0 Light Years");
    expect(value(model, "Cash")).toBe("100.0 Cr");
    expect(value(model, "Legal Status")).toBe("Clean");
    expect(value(model, "Rating")).toBe("Harmless");
  });

  it("lists a new game's three missiles even with no equipment keys", () => {
    const model = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      1,
    );

    expect(model.equipment).toEqual(["Missile ×3"]);
  });

  it("lists owned equipment names and berth counts", () => {
    const profile = {
      ...newProfile(),
      equipment: ["EQ_CARGO_BAY", "EQ_DOCK_COMP"],
      missiles: 0,
      passengerBerths: 2,
    };
    const model = buildStatusModel(
      profile,
      system,
      labels,
      catalogue,
      commodities,
      1,
    );

    expect(model.equipment).toEqual([
      "Large Cargo Bay",
      "Docking Computers",
      "Passenger Berth ×2",
    ]);
  });

  it("omits the equipment list only when equipment, missiles and berths are all zero", () => {
    const profile = {
      ...newProfile(),
      equipment: [],
      missiles: 0,
      passengerBerths: 0,
    };
    const model = buildStatusModel(
      profile,
      system,
      labels,
      catalogue,
      commodities,
      1,
    );

    expect(model.equipment).toEqual([]);
  });

  it("has no population line", () => {
    const model = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      1,
    );

    expect(model.fields.map((field) => field.label)).not.toContain(
      "Population",
    );
  });
});

describe("buildStatusModel hyperspace target", () => {
  it("shows the committed target name and falls back to (Unknown) only when none", () => {
    const withTarget = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      1,
      "Diso",
    );
    expect(value(withTarget, "Hyperspace System")).toBe("Diso");

    const withoutTarget = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      1,
    );
    expect(value(withoutTarget, "Hyperspace System")).toBe("(Unknown)");

    const explicitlyUndefined = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      1,
      undefined,
    );
    expect(value(explicitlyUndefined, "Hyperspace System")).toBe("(Unknown)");
  });
});

describe("buildStatusModel page 2 manifest", () => {
  it("lists exactly the 16 tradeable commodities and never Alien Items", () => {
    const model = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      2,
    );

    expect(model.page).toBe(2);
    expect(model.pageText).toBe("Page 2/2");
    expect(model.manifest).toHaveLength(16);
    expect(model.manifest.map((row) => row.key)).not.toContain("alien_items");
  });

  it("uses each commodity's own unit and `—` for an empty hold", () => {
    const model = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      2,
    );

    const unit = (key: string) =>
      model.manifest.find((row) => row.key === key)?.unit;
    expect(unit("food")).toBe("t");
    expect(unit("gold")).toBe("kg");
    expect(unit("platinum")).toBe("kg");
    expect(unit("gem_stones")).toBe("g");
    expect(model.manifest.every((row) => row.heldText === "—")).toBe(true);
    expect(model.loadText).toBe("Load 0 of 20 t");
  });

  it("shows held amounts and the cargo-bay / berth capacity", () => {
    const profile = {
      ...newProfile(),
      cargo: { food: 2, gold: 900 },
      equipment: ["EQ_CARGO_BAY"],
      passengerBerths: 1,
    };
    const model = buildStatusModel(
      profile,
      system,
      labels,
      catalogue,
      commodities,
      2,
    );

    const food = model.manifest.find((row) => row.key === "food");
    const gold = model.manifest.find((row) => row.key === "gold");
    expect(food?.heldText).toBe("2");
    expect(gold?.heldText).toBe("900");
    // 20 base + 15 cargo bay - 5 berth = 30 t, with gold riding in one pod.
    expect(model.loadText).toBe("Load 3 of 30 t");
  });
});

describe("page clamping", () => {
  it("clamps a page outside 1..2", () => {
    expect(
      buildStatusModel(newProfile(), system, labels, catalogue, commodities, 0)
        .pageText,
    ).toBe("Page 1/2");
    expect(
      buildStatusModel(newProfile(), system, labels, catalogue, commodities, 3)
        .pageText,
    ).toBe("Page 2/2");
  });
});

describe("formatDecicredits", () => {
  it("is the one exact formatter re-exported from the profile module", () => {
    expect(stationFormatDecicredits).toBe(formatDecicredits);
  });

  it("formats zero, single decicredits and whole credits", () => {
    expect(formatDecicredits(0)).toBe("0.0 Cr");
    expect(formatDecicredits(1)).toBe("0.1 Cr");
    expect(formatDecicredits(9)).toBe("0.9 Cr");
    expect(formatDecicredits(10)).toBe("1.0 Cr");
    expect(formatDecicredits(38)).toBe("3.8 Cr");
    expect(formatDecicredits(123_456_789)).toBe("12345678.9 Cr");
  });

  it("stays exact at the safe-integer boundary", () => {
    expect(formatDecicredits(Number.MAX_SAFE_INTEGER)).toBe(
      "900719925474099.1 Cr",
    );
    expect(formatDecicredits(Number.MAX_SAFE_INTEGER - 2)).toBe(
      "900719925474098.9 Cr",
    );
  });
});

describe("buildHomeModel", () => {
  const market = generateMarket(
    system,
    commodities,
    marketSeedForSystem(system.id),
  );
  const diso: System = {
    ...system,
    id: "g0-s147",
    name: "Diso",
    chartX: 11,
    chartY: 174,
  };
  const farSystem: System = {
    ...system,
    id: "g0-s99",
    name: "Reorte",
    chartX: 200,
    chartY: 200,
  };

  it("renders full fuel state and Lave system arrival report", () => {
    const model = buildHomeModel({
      profile: newProfile(),
      system,
      targetSystem: undefined,
      labels,
      equipment: catalogue,
      commodities,
      market,
    });

    expect(model.systemName).toBe("Lave");
    expect(model.economy).toBe("Rich Agricultural");
    expect(model.government).toBe("Dictatorship");
    expect(model.techLevel).toBe("5");
    expect(model.fuelFull).toBe(true);
    expect(model.canRefuel).toBe(false);
    expect(model.refuelButtonText).toBe("✓ Quirium Fuel Tank Full (7.0 LY)");
    expect(model.refuelCostText).toBe("FULL");
    expect(model.jumpStatusKind).toBe("none");
    expect(model.marketHighlights.length).toBeGreaterThan(0);
  });

  it("computes refuel label/cost, jump readiness, and cargo price diff vs Galactic Average", () => {
    const foodAvg = commodities.find((c) => c.key === "food")!.priceAverage;
    const computersAvg = commodities.find(
      (c) => c.key === "computers",
    )!.priceAverage;
    const textilesAvg = commodities.find(
      (c) => c.key === "textiles",
    )!.priceAverage;

    const customMarket = {
      ...market,
      goods: market.goods.map((good) => {
        if (good.key === "food") {
          return { ...good, price: foodAvg - 54 };
        }
        if (good.key === "computers") {
          return { ...good, price: computersAvg + 82 };
        }
        if (good.key === "textiles") {
          return { ...good, price: textilesAvg };
        }
        return good;
      }),
    };

    const model = buildHomeModel({
      profile: {
        ...newProfile(),
        fuel: 56,
        cargo: { food: 3, computers: 2, textiles: 1 },
      },
      system,
      targetSystem: diso,
      labels,
      equipment: catalogue,
      commodities,
      market: customMarket,
    });

    expect(model.fuelFull).toBe(false);
    expect(model.canRefuel).toBe(true);
    expect(model.refuelButtonText).toBe("⚡ Refuel to 7.0 LY (+1.4 LY)");
    expect(model.refuelCostText).toBe("2.8 Cr");
    expect(model.jumpTargetName).toBe("Diso");
    expect(model.jumpStatusKind).toBe("ready");
    expect(model.cargoSummaryText).toBe("6 / 20 TC");
    expect(model.cargoItems).toEqual([
      {
        name: "Food",
        quantityText: "3 t",
        diffText: "-5.4 Cr vs avg",
        diffKind: "neg",
      },
      {
        name: "Textiles",
        quantityText: "1 t",
        diffText: "±0.0 Cr vs avg",
        diffKind: "neutral",
      },
      {
        name: "Computers",
        quantityText: "2 t",
        diffText: "+8.2 Cr vs avg",
        diffKind: "pos",
      },
    ]);

    const lowFuelModel = buildHomeModel({
      profile: { ...newProfile(), fuel: 10 },
      system,
      targetSystem: diso,
      labels,
      equipment: catalogue,
      commodities,
      market,
    });
    expect(lowFuelModel.jumpStatusText).toBe("LOW FUEL");
    expect(lowFuelModel.jumpStatusKind).toBe("warn");

    const outOfRangeModel = buildHomeModel({
      profile: newProfile(),
      system,
      targetSystem: farSystem,
      labels,
      equipment: catalogue,
      commodities,
      market,
    });
    expect(outOfRangeModel.jumpStatusText).toBe("OUT OF RANGE");
    expect(outOfRangeModel.jumpStatusKind).toBe("warn");
  });
});
