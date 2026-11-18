// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F3 outfitting row model (ECON-05, ECON-08, D-10..D-16).
 *
 * Pins Oolite's listing rule (`equipmentAllowed`, `PlayerEntity.m:8293-8302`):
 * only rows that can be fitted here appear, in D-11 order, and only an
 * unaffordable row is listed disabled ("Not enough credits"). Also pins the
 * fuel row's fill cost and visibility, the credits-independent row set, the
 * empty state, the unaffordable-row detail, the truthful
 * `REMOVAL_DESCRIPTIONS` override (missile full-value re-sale, berth no refund)
 * and D-15's whole-credit removal labels (`Remove Missile — 20 ₢`) versus the
 * decimal confirmation name.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseEquipment } from "../../src/content/equipment.js";
import type { Equipment } from "../../src/content/types.js";
import { formatDecicredits, newProfile } from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import {
  OUTFITTING_EMPTY_TEXT,
  buildOutfittingModel,
} from "../../src/ui/station-model.js";
import { commodityUnits, commoditiesFixture } from "../helpers/commodities.js";
import { laveFixture } from "../helpers/lave.js";

const catalogue: readonly Equipment[] = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);

const units = commodityUnits(commoditiesFixture());
const laveTechLevelRaw = laveFixture().system.techLevelRaw;

function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...newProfile(), ...overrides };
}

function build(
  profile: PlayerProfile = makeProfile(),
  techLevelRaw = laveTechLevelRaw,
  selectedKey = "EQ_CARGO_BAY",
) {
  return buildOutfittingModel(
    catalogue,
    profile,
    techLevelRaw,
    selectedKey,
    units,
  );
}

type Model = ReturnType<typeof buildOutfittingModel>;

function row(model: Model, key: string) {
  const found = model.rows.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`no row "${key}"`);
  return found;
}

describe("the listed row set (Oolite equipmentAllowed)", () => {
  it("lists only what can be fitted at Lave, in D-11 order then the lasers", () => {
    const model = build();
    expect(model.rows.map((entry) => entry.key)).toEqual([
      "EQ_CARGO_BAY",
      "EQ_MISSILE",
      "EQ_MISSILE_REMOVAL",
      // The stock fit has a fore pulse laser, so Remove Laser is listed.
      "EQ_WEAPON_NONE",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_BEAM_LASER",
    ]);
    expect(model.emptyText).toBe("");
  });

  it("shows Fuel first when the tank is not full", () => {
    const model = build(makeProfile({ fuel: 34 }));

    expect(model.rows.map((entry) => entry.key)).toEqual([
      "EQ_FUEL",
      "EQ_CARGO_BAY",
      "EQ_MISSILE",
      "EQ_MISSILE_REMOVAL",
      "EQ_WEAPON_NONE",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_BEAM_LASER",
    ]);
    expect(model.fuelVisible).toBe(true);
  });

  it("keeps the full D-11 order when every row is listed", () => {
    const model = build(
      makeProfile({ credits: 10_000_000, fuel: 34, passengerBerths: 1 }),
      10,
    );
    expect(model.rows.map((entry) => entry.key)).toEqual([
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
      "EQ_WEAPON_NONE",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_BEAM_LASER",
      "EQ_WEAPON_MINING_LASER",
      "EQ_WEAPON_MILITARY_LASER",
    ]);
    expect(model.rows.every((entry) => entry.confirmable)).toBe(true);
  });

  it("omits Fuel at a full tank and prices the fill cost, never 2 dc", () => {
    const full = build(makeProfile({ fuel: 70 }));
    expect(full.fuelVisible).toBe(false);
    expect(full.rows.map((entry) => entry.key)).not.toContain("EQ_FUEL");

    const partial = build(makeProfile({ fuel: 34 }));
    const fuel = row(partial, "EQ_FUEL");
    expect(fuel.cost).toBe(72);
    expect(fuel.priceText).toBe("7.2 ₢");
    expect(fuel.label).toBe("Fuel");
    expect(fuel.name).toBe("Fuel");
  });

  it("omits each removal row at a zero count", () => {
    expect(build().rows.map((entry) => entry.key)).not.toContain(
      "EQ_PASSENGER_BERTH_REMOVAL",
    );
    expect(
      build(makeProfile({ missiles: 0 })).rows.map((e) => e.key),
    ).not.toContain("EQ_MISSILE_REMOVAL");
  });
});

describe("listed and hidden rows", () => {
  const model = build();
  const rich = { credits: 1_000_000 };
  const keys = (built: Model) => built.rows.map((entry) => entry.key);

  it("hides every item above Lave's raw tech level", () => {
    for (const key of [
      "EQ_DOCK_COMP",
      "EQ_GAL_DRIVE",
      "EQ_ADVANCED_COMPASS",
      "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
      "EQ_PASSENGER_BERTH",
    ]) {
      expect(keys(model)).not.toContain(key);
      expect(keys(build(makeProfile(rich)))).not.toContain(key);
    }
  });

  it("hides a full pylon set, an owned item, a hold with no room and the berth bound", () => {
    // A new Cobra carries three missiles on four pylons, as in Oolite.
    expect(row(model, "EQ_MISSILE").reason).toBe("");
    expect(keys(build(makeProfile({ ...rich, missiles: 4 })))).not.toContain(
      "EQ_MISSILE",
    );
    expect(
      keys(build(makeProfile({ ...rich, equipment: ["EQ_CARGO_BAY"] }), 11)),
    ).not.toContain("EQ_CARGO_BAY");
    expect(
      keys(build(makeProfile({ ...rich, cargo: { food: 20 } }), 11)),
    ).not.toContain("EQ_PASSENGER_BERTH");
    expect(
      keys(build(makeProfile({ ...rich, passengerBerths: 7 }), 11)),
    ).not.toContain("EQ_PASSENGER_BERTH");
  });

  it("keeps an unaffordable item listed, dimmed and non-confirmable", () => {
    const unaffordable = row(model, "EQ_CARGO_BAY");
    expect(unaffordable).toMatchObject({
      enabled: false,
      dimmed: true,
      confirmable: false,
      reason: "Not enough credits",
    });

    const enabled = row(model, "EQ_MISSILE_REMOVAL");
    expect(enabled.enabled).toBe(true);
    expect(enabled.dimmed).toBe(false);
    expect(enabled.confirmable).toBe(true);
    expect(enabled.reason).toBe("");
  });

  it("never lets credits change which rows are listed", () => {
    const bare = {
      fore: "EQ_WEAPON_NONE",
      aft: "EQ_WEAPON_NONE",
      port: "EQ_WEAPON_NONE",
      starboard: "EQ_WEAPON_NONE",
    } as const;
    const profiles: readonly Partial<PlayerProfile>[] = [
      {},
      { fuel: 34 },
      { missiles: 4 },
      { passengerBerths: 1 },
      { passengerBerths: 7 },
      { cargo: { food: 20 } },
      { laserMounts: bare },
    ];
    for (const techLevelRaw of [0, 3, 4, 10]) {
      for (const overrides of profiles) {
        const broke = keys(
          build(makeProfile({ ...overrides, credits: 0 }), techLevelRaw),
        );
        const wealthy = keys(
          build(
            makeProfile({ ...overrides, credits: 10_000_000 }),
            techLevelRaw,
          ),
        );
        expect(broke).toEqual(wealthy);
      }
    }
  });
});

describe("the empty list", () => {
  it("reads Oolite's empty line with no detail at raw TL 0 and a full tank", () => {
    const model = build(makeProfile(), 0);
    expect(model.rows).toEqual([]);
    expect(model.emptyText).toBe("No equipment available for purchase.");
    expect(model.emptyText).toBe(OUTFITTING_EMPTY_TEXT);
    expect(model.detail).toBeNull();
  });

  it("pins the empty line to the vendored descriptions.plist verbatim", () => {
    const plist = readFileSync(
      join(process.cwd(), "third_party/oolite/Config/descriptions.plist"),
      "utf8",
    );
    let value: string | undefined;
    for (const line of plist.split("\n")) {
      const match = /^\s*"([^"]+)"\s*=\s*"(.*)";\s*$/.exec(line);
      if (match?.[1] === "equip-no-equipment-available-for-purchase") {
        value = match[2];
      }
    }
    expect(value).toBe(OUTFITTING_EMPTY_TEXT);
  });
});

describe("labels, names and prices", () => {
  it("labels missiles with the pylon count and hides the price suffix from the name", () => {
    const missile = row(build(), "EQ_MISSILE");

    expect(missile.label).toBe("Missile (3/4)");
    // At 4/4 the row is hidden (pylons full), so pin the empty count instead.
    expect(row(build(makeProfile({ missiles: 0 })), "EQ_MISSILE").label).toBe(
      "Missile (0/4)",
    );
    expect(missile.name).toBe("Missile");
    expect(missile.multiCount).toBe(3);
    expect(missile.cost).toBe(300);
    expect(missile.priceText).toBe("30.0 ₢");
  });

  it("uses D-15 whole-credit labels for the removal rows", () => {
    const missileRemoval = row(build(), "EQ_MISSILE_REMOVAL");
    expect(missileRemoval.label).toBe("Remove Missile — 20 ₢");
    expect(missileRemoval.name).toBe("Remove Missile");
    expect(missileRemoval.priceText).toBe("20 ₢");
    expect(missileRemoval.cost).toBe(200);

    const berthRemoval = row(
      build(makeProfile({ passengerBerths: 1 })),
      "EQ_PASSENGER_BERTH_REMOVAL",
    );
    expect(berthRemoval.label).toBe("Remove Passenger Berth — 100 ₢");
    expect(berthRemoval.name).toBe("Remove Passenger Berth");
    expect(berthRemoval.priceText).toBe("100 ₢");
  });
});

describe("detail pane", () => {
  it("shows the full catalogue detail for an unaffordable selected row", () => {
    const cargoBay = catalogue.find((entry) => entry.key === "EQ_CARGO_BAY");
    if (cargoBay === undefined) throw new Error("no EQ_CARGO_BAY");
    const model = build(makeProfile(), laveTechLevelRaw, "EQ_CARGO_BAY");

    expect(model.detail).not.toBeNull();
    expect(model.detail?.title).toBe(cargoBay.name);
    expect(model.detail?.description).toBe(cargoBay.description);
    expect(model.detail?.priceText).toBe(formatDecicredits(cargoBay.price));
    expect(model.detail?.priceText).toBe("400.0 ₢");
  });

  it("states the full catalogue-value re-sale for missile removal", () => {
    const model = build(makeProfile(), laveTechLevelRaw, "EQ_MISSILE_REMOVAL");

    expect(model.detail?.description).toContain("full catalogue value");
    expect(model.detail?.description).not.toContain("No refund is paid");
  });

  it("states No refund is paid for berth removal", () => {
    const model = build(
      makeProfile({ passengerBerths: 1 }),
      laveTechLevelRaw,
      "EQ_PASSENGER_BERTH_REMOVAL",
    );

    expect(model.detail?.description).toContain("No refund is paid");
  });

  it("is null when the selected key has no visible row", () => {
    expect(
      build(makeProfile(), laveTechLevelRaw, "EQ_PASSENGER_BERTH_REMOVAL")
        .detail,
    ).toBeNull();
  });
});

describe("laser rows and the facing selection (CBT-05)", () => {
  const rich = (overrides: Partial<PlayerProfile> = {}) =>
    makeProfile({ credits: 1_000_000, ...overrides });

  it("lists the lasers after the visible rows with Oolite's names and prices", () => {
    // Raw TL 10, so the TL 10 mining and military lasers are listed too.
    const model = build(rich(), 10);

    expect(row(model, "EQ_WEAPON_PULSE_LASER").label).toBe("Pulse Laser");
    expect(row(model, "EQ_WEAPON_PULSE_LASER").priceText).toBe("400.0 ₢");
    expect(row(model, "EQ_WEAPON_BEAM_LASER").priceText).toBe("1000.0 ₢");
    expect(row(model, "EQ_WEAPON_MINING_LASER").priceText).toBe("800.0 ₢");
    expect(row(model, "EQ_WEAPON_MILITARY_LASER").priceText).toBe("6000.0 ₢");
    expect(row(model, "EQ_WEAPON_NONE").label).toBe("Remove Laser");
    expect(model.facingFor).toBeNull();
  });

  it("hides each laser above the raw tech level", () => {
    // Lave's raw tech level is 4: Pulse and Beam are fittable, Mining and Military are hidden.
    const model = build(rich());
    const keys = model.rows.map((entry) => entry.key);
    expect(row(model, "EQ_WEAPON_PULSE_LASER").confirmable).toBe(true);
    expect(row(model, "EQ_WEAPON_BEAM_LASER").confirmable).toBe(true);
    expect(keys).not.toContain("EQ_WEAPON_MINING_LASER");
    expect(keys).not.toContain("EQ_WEAPON_MILITARY_LASER");

    const high = build(rich(), 10);
    expect(row(high, "EQ_WEAPON_MILITARY_LASER").confirmable).toBe(true);
    const low = build(rich(), 3);
    expect(low.rows.map((entry) => entry.key)).not.toContain(
      "EQ_WEAPON_BEAM_LASER",
    );
  });

  it("a laser row is dimmed with 'Not enough credits' when no facing can afford it", () => {
    const model = build(makeProfile({ credits: 3_999 }));
    expect(row(model, "EQ_WEAPON_PULSE_LASER")).toMatchObject({
      confirmable: false,
      reason: "Not enough credits",
    });
  });

  it("lists Remove Laser only while some facing has a laser", () => {
    const bare = rich({
      laserMounts: {
        fore: "EQ_WEAPON_NONE",
        aft: "EQ_WEAPON_NONE",
        port: "EQ_WEAPON_NONE",
        starboard: "EQ_WEAPON_NONE",
      },
    });
    const keys = build(bare).rows.map((entry) => entry.key);
    expect(keys).not.toContain("EQ_WEAPON_NONE");
    expect(keys).toContain("EQ_WEAPON_PULSE_LASER");
    expect(build(rich()).rows.map((entry) => entry.key)).toContain(
      "EQ_WEAPON_NONE",
    );
  });

  it("opens the four facings keyed by the composite key, showing what is fitted", () => {
    const profile = rich({
      laserMounts: {
        fore: "EQ_WEAPON_PULSE_LASER",
        aft: "EQ_WEAPON_NONE",
        port: "EQ_WEAPON_MINING_LASER",
        starboard: "EQ_WEAPON_NONE",
      },
    });
    const model = buildOutfittingModel(
      catalogue,
      profile,
      laveTechLevelRaw,
      "EQ_WEAPON_BEAM_LASER@aft",
      units,
      "EQ_WEAPON_BEAM_LASER",
    );

    expect(model.facingFor).toBe("EQ_WEAPON_BEAM_LASER");
    expect(model.rows.map((entry) => entry.key)).toEqual([
      "EQ_WEAPON_BEAM_LASER@fore",
      "EQ_WEAPON_BEAM_LASER@aft",
      "EQ_WEAPON_BEAM_LASER@port",
      "EQ_WEAPON_BEAM_LASER@starboard",
    ]);
    expect(model.rows.map((entry) => entry.label)).toEqual([
      "Forward (Pulse Laser)",
      "Aft (None)",
      "Port (Mining Laser)",
      "Starboard (None)",
    ]);
    expect(model.rows.every((entry) => entry.confirmable)).toBe(true);
    expect(model.rows[1]?.name).toBe("Beam Laser (Aft)");
    expect(model.rows[1]?.cost).toBe(10_000);
    expect(model.detail).toEqual({
      title: "Beam Laser",
      description: "Beam Laser\nPlease select where to install this weapon.",
      priceText: "1000.0 ₢",
    });
  });

  it("disables Remove Laser on an empty facing with 'No laser fitted'", () => {
    const model = buildOutfittingModel(
      catalogue,
      rich(),
      laveTechLevelRaw,
      "EQ_WEAPON_NONE@fore",
      units,
      "EQ_WEAPON_NONE",
    );
    expect(model.rows[0]).toMatchObject({
      key: "EQ_WEAPON_NONE@fore",
      confirmable: true,
      cost: 0,
    });
    for (const entry of model.rows.slice(1)) {
      expect(entry).toMatchObject({
        confirmable: false,
        reason: "No laser fitted",
      });
    }
  });

  it("disables only the facings that cannot afford the laser", () => {
    // 4,000 dc: the military laser (60,000) is refused everywhere, the pulse is fine.
    const model = buildOutfittingModel(
      catalogue,
      makeProfile({ credits: 4_000 }),
      10,
      "EQ_WEAPON_PULSE_LASER@fore",
      units,
      "EQ_WEAPON_PULSE_LASER",
    );
    expect(model.rows.every((entry) => entry.confirmable)).toBe(true);

    const military = buildOutfittingModel(
      catalogue,
      makeProfile({ credits: 4_000 }),
      10,
      "EQ_WEAPON_MILITARY_LASER@fore",
      units,
      "EQ_WEAPON_MILITARY_LASER",
    );
    expect(military.rows.every((entry) => !entry.confirmable)).toBe(true);
    expect(military.rows[0]?.reason).toBe("Not enough credits");
  });

  it("falls back to the main list for a facing selection outside the allow-list", () => {
    for (const forged of ["EQ_ECM", "EQ_WEAPON_THARGOID_LASER", "", "nope"]) {
      const model = buildOutfittingModel(
        catalogue,
        rich(),
        laveTechLevelRaw,
        "EQ_CARGO_BAY",
        units,
        forged,
      );
      expect(model.facingFor).toBeNull();
      expect(model.rows.map((entry) => entry.key)).toContain("EQ_CARGO_BAY");
    }
  });
});
