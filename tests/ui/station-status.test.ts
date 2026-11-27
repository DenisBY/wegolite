// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F5 status/manifest view model (ECON-06, D-04).
 *
 * Page 1 is every Oolite status field with the Lave values pinned exactly;
 * page 2 is Oolite's manifest: the cargo and cabin lines, then only the goods
 * carried, each with its own unit, so gold, platinum and gem-stones can never
 * be described as tonnes. The page
 * indicator is `Page N/2` and the page clamps to 1..2. It also pins the single
 * exact `formatDecicredits` re-exported from the profile module.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseEquipment } from "../../src/content/equipment.js";
import type { Equipment, System } from "../../src/content/types.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../src/sim/economy/market.js";
import {
  formatCredits,
  formatDecicredits,
  newProfile,
} from "../../src/sim/player/profile.js";
import {
  DAMAGED_STATUS_SUFFIX,
  buildHomeModel,
  buildStatusModel,
  formatRating,
  formatWholeCredits,
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
    expect(value(model, "Ship")).toBe("Cobra Mark III");
    expect(value(model, "Present System")).toBe("Lave");
    expect(value(model, "Hyperspace System")).toBe("(Unknown)");
    expect(value(model, "Condition")).toBe("Docked");
    expect(value(model, "Fuel")).toBe("7.0 Light Years");
    expect(value(model, "Cash")).toBe("100.0 ₢");
    expect(value(model, "Legal Status")).toBe("Clean");
    // OOConstToString.m:401: the rating, three spaces, the kill count.
    expect(value(model, "Rating")).toBe("Harmless   (0)");
  });

  it("lists a new game's three missiles and its forward pulse laser even with no equipment keys", () => {
    const model = buildStatusModel(
      newProfile(),
      system,
      labels,
      catalogue,
      commodities,
      1,
    );

    expect(model.equipment).toEqual(["Missile ×3", "Forward Pulse Laser"]);
  });

  it("lists each fitted laser as Oolite does, forward, aft, port, starboard, after the other equipment", () => {
    const profile = {
      ...newProfile(),
      equipment: ["EQ_CARGO_BAY"],
      missiles: 1,
      passengerBerths: 1,
      laserMounts: {
        fore: "EQ_WEAPON_MILITARY_LASER",
        aft: "EQ_WEAPON_BEAM_LASER",
        port: "EQ_WEAPON_NONE",
        starboard: "EQ_WEAPON_MINING_LASER",
      },
    } as const;
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
      "Missile ×1",
      "Passenger Berth ×1",
      "Forward Military Laser",
      "Aft Beam Laser",
      "Starboard Mining Laser",
    ]);
  });

  it("lists a pulse laser on every facing in Oolite's order", () => {
    const profile = {
      ...newProfile(),
      missiles: 0,
      laserMounts: {
        fore: "EQ_WEAPON_PULSE_LASER",
        aft: "EQ_WEAPON_PULSE_LASER",
        port: "EQ_WEAPON_PULSE_LASER",
        starboard: "EQ_WEAPON_PULSE_LASER",
      },
    } as const;
    const model = buildStatusModel(
      profile,
      system,
      labels,
      catalogue,
      commodities,
      1,
    );

    expect(model.equipment).toEqual([
      "Forward Pulse Laser",
      "Aft Pulse Laser",
      "Port Pulse Laser",
      "Starboard Pulse Laser",
    ]);
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
      "Forward Pulse Laser",
    ]);
  });

  it("lists damaged equipment first, marked (damaged), in damage order", () => {
    const profile = {
      ...newProfile(),
      equipment: ["EQ_CARGO_BAY"],
      damagedEquipment: ["EQ_ADVANCED_COMPASS", "EQ_DOCK_COMP"],
      passengerBerths: 1,
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
      "Advanced Space Compass (damaged)",
      "Docking Computers (damaged)",
      "Large Cargo Bay",
      "Missile ×3",
      "Passenger Berth ×1",
      "Forward Pulse Laser",
    ]);
    // The damage order is the profile's, not a catalogue order either way.
    const reversed = buildStatusModel(
      { ...profile, damagedEquipment: ["EQ_DOCK_COMP", "EQ_ADVANCED_COMPASS"] },
      system,
      labels,
      catalogue,
      commodities,
      1,
    );
    expect(reversed.equipment.slice(0, 2)).toEqual([
      "Docking Computers (damaged)",
      "Advanced Space Compass (damaged)",
    ]);
  });

  it("falls back to the key for a damaged item the catalogue does not know", () => {
    const model = buildStatusModel(
      { ...newProfile(), damagedEquipment: ["EQ_NOT_IN_CATALOGUE"] },
      system,
      labels,
      catalogue,
      commodities,
      1,
    );
    expect(model.equipment[0]).toBe("EQ_NOT_IN_CATALOGUE (damaged)");
  });

  it("writes (damaged) where Oolite writes (N/A): the recorded F5 divergence", () => {
    expect(DAMAGED_STATUS_SUFFIX).toBe(" (damaged)");
    const plist = readFileSync(
      join(process.cwd(), "third_party/oolite/Config/descriptions.plist"),
      "utf8",
    );
    let oolite: string | undefined;
    for (const line of plist.split("\n")) {
      const match = /^\s*"([^"]+)"\s*=\s*"(.*)";/.exec(line);
      if (match?.[1] === "equipment-@-not-available") oolite = match[2];
    }
    // Oolite's template, pinned so a vendored change surfaces here.
    expect(oolite).toBe("%@ (N/A)");
    const model = buildStatusModel(
      { ...newProfile(), damagedEquipment: ["EQ_DOCK_COMP"] },
      system,
      labels,
      catalogue,
      commodities,
      1,
    );
    const first = model.equipment[0] ?? "";
    // The F5 text differs from Oolite's rendering of the same item, and never
    // reads "(N/A)" (it reads as "not for sale", owner decision, D-12).
    expect(first).not.toBe((oolite ?? "").replace("%@", "Docking Computers"));
    expect(first).not.toContain("(N/A)");
    expect(first).toBe("Docking Computers (damaged)");
  });

  it("omits the equipment list only when equipment, missiles, berths and lasers are all absent", () => {
    const profile = {
      ...newProfile(),
      equipment: [],
      missiles: 0,
      passengerBerths: 0,
      laserMounts: {
        fore: "EQ_WEAPON_NONE",
        aft: "EQ_WEAPON_NONE",
        port: "EQ_WEAPON_NONE",
        starboard: "EQ_WEAPON_NONE",
      },
    } as const;
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

/**
 * Oolite's manifest lines (quick task 261118-cyo): the header row
 * "Cargo [current] t ([max] t)" and "Passenger Cabins [current] / [max]"
 * (`descriptions.plist:1918-1919`), then one "[quantity] [units] ×
 * [commodityName]" line per good carried (`:1587`) or "No cargo carried."
 * (`:1916`), as `PlayerEntityContracts.m:1058-1082` lays them out.
 */
describe("buildStatusModel page 2 manifest", () => {
  const page2 = (profile = newProfile()) =>
    buildStatusModel(profile, system, labels, catalogue, commodities, 2);

  it("prints Oolite's cargo, cabins and empty lines for a new commander", () => {
    const model = page2();

    expect(model.page).toBe(2);
    expect(model.pageText).toBe("Page 2/2");
    expect(model.cargoText).toBe("Cargo 0 t (20 t)");
    expect(model.cabinsText).toBe("Passenger Cabins 0 / 0");
    expect(model.manifest).toEqual([]);
    expect(model.emptyText).toBe("No cargo carried.");
  });

  it("lists only the goods carried, in market order, with their own units", () => {
    const model = page2({ ...newProfile(), cargo: { gold: 8, food: 3 } });

    expect(model.manifest).toEqual([
      { key: "food", text: "3 t × Food" },
      { key: "gold", text: "8 kg × Gold" },
    ]);
    expect(model.emptyText).toBe("");
    // 3 t of Food; 8 kg of Gold rides in the safe and takes no pod, as the
    // hold counts it (src/sim/economy/cargo.ts podsFor).
    expect(model.cargoText).toBe("Cargo 3 t (20 t)");
  });

  it("lists t, kg and g goods with their own units and never the untradeable Alien Items", () => {
    const model = page2({
      ...newProfile(),
      cargo: { food: 2, gold: 5, gem_stones: 7, alien_items: 1 },
    });

    // Alien Items is `tradeable: false` in the catalogue, so it has no row.
    expect(model.manifest).toEqual([
      { key: "food", text: "2 t × Food" },
      { key: "gold", text: "5 kg × Gold" },
      { key: "gem_stones", text: "7 g × Gem-Stones" },
    ]);
    expect(model.emptyText).toBe("");
  });

  it("counts the berths as cabins and takes 5 t of hold for each", () => {
    const model = page2({ ...newProfile(), passengerBerths: 2 });

    expect(model.cabinsText).toBe("Passenger Cabins 0 / 2");
    expect(model.cargoText).toBe("Cargo 0 t (10 t)");
  });

  it("shows held amounts and the cargo-bay / berth capacity", () => {
    const model = page2({
      ...newProfile(),
      cargo: { food: 2, gold: 900 },
      equipment: ["EQ_CARGO_BAY"],
      passengerBerths: 1,
    });

    expect(model.manifest.map((row) => row.text)).toEqual([
      "2 t × Food",
      "900 kg × Gold",
    ]);
    // 20 base + 15 cargo bay - 5 berth = 30 t, with gold riding in one pod.
    expect(model.cargoText).toBe("Cargo 3 t (30 t)");
    expect(model.cabinsText).toBe("Passenger Cabins 0 / 1");
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
    expect(formatDecicredits(0)).toBe("0.0 ₢");
    expect(formatDecicredits(1)).toBe("0.1 ₢");
    expect(formatDecicredits(9)).toBe("0.9 ₢");
    expect(formatDecicredits(10)).toBe("1.0 ₢");
    expect(formatDecicredits(38)).toBe("3.8 ₢");
    expect(formatDecicredits(99_999)).toBe("9999.9 ₢");
    // Oolite groups 5 or more integer digits in threes with U+00A0
    // (oolite-locale-functions.js:60-92, descriptions.plist:80-83).
    expect(formatDecicredits(100_000)).toBe("10\u00a0000.0 ₢");
    expect(formatDecicredits(123_456_789)).toBe("12\u00a0345\u00a0678.9 ₢");
    expect(formatDecicredits(-100_000)).toBe("-10\u00a0000.0 ₢");
    expect(formatCredits(100_000)).toBe("10\u00a0000.0 ₢");
    expect(formatWholeCredits(99_990)).toBe("9999 ₢");
    expect(formatWholeCredits(100_000)).toBe("10\u00a0000 ₢");
  });

  it("stays exact at the safe-integer boundary", () => {
    expect(formatDecicredits(Number.MAX_SAFE_INTEGER)).toBe(
      "900\u00a0719\u00a0925\u00a0474\u00a0099.1 ₢",
    );
    expect(formatDecicredits(Number.MAX_SAFE_INTEGER - 2)).toBe(
      "900\u00a0719\u00a0925\u00a0474\u00a0098.9 ₢",
    );
  });
});

describe("formatRating", () => {
  it("is Oolite's KillCountToRatingAndKillString format (OOConstToString.m:401)", () => {
    expect(formatRating("Harmless", 0)).toBe("Harmless   (0)");
    expect(formatRating("Competent", 1234)).toBe("Competent   (1234)");
    expect(formatRating("Harmless", Number.NaN)).toBe("Harmless   (0)");
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
      stationName: "Coriolis Station",
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
    expect(model.stationSubtitle).toBe("Coriolis Station · Docked");
  });

  it.each(["Dodecahedron Station", "Icosahedron Station"])(
    "names the system's own station on the docked line: %s",
    (stationName) => {
      const model = buildHomeModel({
        profile: newProfile(),
        system,
        targetSystem: undefined,
        labels,
        stationName,
        equipment: catalogue,
        commodities,
        market,
      });

      expect(model.stationSubtitle).toBe(`${stationName} · Docked`);
    },
  );

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
      stationName: "Coriolis Station",
      equipment: catalogue,
      commodities,
      market: customMarket,
    });

    expect(model.fuelFull).toBe(false);
    expect(model.canRefuel).toBe(true);
    expect(model.refuelButtonText).toBe("⚡ Refuel to 7.0 LY (+1.4 LY)");
    expect(model.refuelCostText).toBe("2.8 ₢");
    expect(model.jumpTargetName).toBe("Diso");
    expect(model.jumpStatusKind).toBe("ready");
    expect(model.cargoSummaryText).toBe("6 / 20 TC");
    expect(model.cargoItems).toEqual([
      {
        name: "Food",
        quantityText: "3 t",
        diffText: "-5.4 ₢ vs avg",
        diffKind: "neg",
      },
      {
        name: "Textiles",
        quantityText: "1 t",
        diffText: "±0.0 ₢ vs avg",
        diffKind: "neutral",
      },
      {
        name: "Computers",
        quantityText: "2 t",
        diffText: "+8.2 ₢ vs avg",
        diffKind: "pos",
      },
    ]);

    const lowFuelModel = buildHomeModel({
      profile: { ...newProfile(), fuel: 10 },
      system,
      targetSystem: diso,
      labels,
      stationName: "Coriolis Station",
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
      stationName: "Coriolis Station",
      equipment: catalogue,
      commodities,
      market,
    });
    expect(outOfRangeModel.jumpStatusText).toBe("OUT OF RANGE");
    expect(outOfRangeModel.jumpStatusKind).toBe("warn");
  });
});
