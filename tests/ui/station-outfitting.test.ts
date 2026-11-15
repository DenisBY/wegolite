// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F3 outfitting row model (ECON-05, ECON-08, D-10..D-16).
 *
 * Pins the exact D-11 order at Lave, the fuel row's fill cost and visibility,
 * every short refusal reason, the disabled-row detail, the truthful
 * `REMOVAL_DESCRIPTIONS` override (missile full-value re-sale, berth no refund)
 * and D-15's whole-credit removal labels (`Remove Missile — 20 Cr`) versus the
 * decimal confirmation name.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseEquipment } from "../../src/content/equipment.js";
import type { Equipment } from "../../src/content/types.js";
import { newProfile } from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import { buildOutfittingModel } from "../../src/ui/station-model.js";
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

describe("the D-11 row set at Lave", () => {
  it("emits exactly the ordered peaceful set then the lasers, omitting fuel and empty removals", () => {
    expect(build().rows.map((entry) => entry.key)).toEqual([
      "EQ_CARGO_BAY",
      "EQ_DOCK_COMP",
      "EQ_GAL_DRIVE",
      "EQ_ADVANCED_COMPASS",
      "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
      "EQ_MISSILE",
      "EQ_PASSENGER_BERTH",
      "EQ_MISSILE_REMOVAL",
      // The stock fit has a fore pulse laser, so Remove Laser is listed.
      "EQ_WEAPON_NONE",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_BEAM_LASER",
      "EQ_WEAPON_MINING_LASER",
      "EQ_WEAPON_MILITARY_LASER",
    ]);
  });

  it("shows Fuel first when the tank is not full", () => {
    const model = build(makeProfile({ fuel: 34 }));

    expect(model.rows.map((entry) => entry.key)).toEqual([
      "EQ_FUEL",
      "EQ_CARGO_BAY",
      "EQ_DOCK_COMP",
      "EQ_GAL_DRIVE",
      "EQ_ADVANCED_COMPASS",
      "EQ_ADVANCED_NAVIGATIONAL_ARRAY",
      "EQ_MISSILE",
      "EQ_PASSENGER_BERTH",
      "EQ_MISSILE_REMOVAL",
      "EQ_WEAPON_NONE",
      "EQ_WEAPON_PULSE_LASER",
      "EQ_WEAPON_BEAM_LASER",
      "EQ_WEAPON_MINING_LASER",
      "EQ_WEAPON_MILITARY_LASER",
    ]);
    expect(model.fuelVisible).toBe(true);
  });

  it("omits Fuel at a full tank and prices the fill cost, never 2 dc", () => {
    const full = build(makeProfile({ fuel: 70 }));
    expect(full.fuelVisible).toBe(false);
    expect(full.rows.map((entry) => entry.key)).not.toContain("EQ_FUEL");

    const partial = build(makeProfile({ fuel: 34 }));
    const fuel = row(partial, "EQ_FUEL");
    expect(fuel.cost).toBe(72);
    expect(fuel.priceText).toBe("7.2 Cr");
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

describe("short refusal reasons", () => {
  const model = build();

  it("uses the literal catalogue-order reasons", () => {
    expect(row(model, "EQ_CARGO_BAY").reason).toBe("Not enough credits");
    expect(row(model, "EQ_DOCK_COMP").reason).toBe("Requires TL 9");
    expect(row(model, "EQ_GAL_DRIVE").reason).toBe("Requires TL 10");
    expect(row(model, "EQ_ADVANCED_COMPASS").reason).toBe("Requires TL 7");
    expect(row(model, "EQ_ADVANCED_NAVIGATIONAL_ARRAY").reason).toBe(
      "Requires TL 6",
    );
    // A new Cobra carries three missiles on four pylons, as in Oolite.
    expect(row(model, "EQ_MISSILE").reason).toBe("");
    expect(row(build(makeProfile({ missiles: 4 })), "EQ_MISSILE").reason).toBe(
      "Pylons full",
    );
    expect(row(model, "EQ_PASSENGER_BERTH").reason).toBe("Requires TL 5");
    expect(row(model, "EQ_MISSILE_REMOVAL").reason).toBe("");
  });

  it("marks a disabled row dimmed and non-confirmable but still selectable", () => {
    const disabled = row(model, "EQ_DOCK_COMP");
    expect(disabled.enabled).toBe(false);
    expect(disabled.dimmed).toBe(true);
    expect(disabled.confirmable).toBe(false);

    const enabled = row(model, "EQ_MISSILE_REMOVAL");
    expect(enabled.enabled).toBe(true);
    expect(enabled.dimmed).toBe(false);
    expect(enabled.confirmable).toBe(true);
  });

  it("reports Already installed, No cargo space and Maximum reached", () => {
    const rich = { credits: 1_000_000 };
    expect(
      row(
        build(makeProfile({ ...rich, equipment: ["EQ_CARGO_BAY"] }), 11),
        "EQ_CARGO_BAY",
      ).reason,
    ).toBe("Already installed");

    expect(
      row(
        build(makeProfile({ ...rich, cargo: { food: 20 } }), 11),
        "EQ_PASSENGER_BERTH",
      ).reason,
    ).toBe("No cargo space");

    expect(
      row(
        build(makeProfile({ ...rich, passengerBerths: 7 }), 11),
        "EQ_PASSENGER_BERTH",
      ).reason,
    ).toBe("Maximum reached");
  });
});

describe("labels, names and prices", () => {
  it("labels missiles with the pylon count and hides the price suffix from the name", () => {
    const missile = row(build(), "EQ_MISSILE");

    expect(missile.label).toBe("Missile (3/4)");
    expect(row(build(makeProfile({ missiles: 4 })), "EQ_MISSILE").label).toBe(
      "Missile (4/4)",
    );
    expect(missile.name).toBe("Missile");
    expect(missile.multiCount).toBe(3);
    expect(missile.cost).toBe(300);
    expect(missile.priceText).toBe("30.0 Cr");
  });

  it("uses D-15 whole-credit labels for the removal rows", () => {
    const missileRemoval = row(build(), "EQ_MISSILE_REMOVAL");
    expect(missileRemoval.label).toBe("Remove Missile — 20 Cr");
    expect(missileRemoval.name).toBe("Remove Missile");
    expect(missileRemoval.priceText).toBe("20 Cr");
    expect(missileRemoval.cost).toBe(200);

    const berthRemoval = row(
      build(makeProfile({ passengerBerths: 1 })),
      "EQ_PASSENGER_BERTH_REMOVAL",
    );
    expect(berthRemoval.label).toBe("Remove Passenger Berth — 100 Cr");
    expect(berthRemoval.name).toBe("Remove Passenger Berth");
    expect(berthRemoval.priceText).toBe("100 Cr");
  });
});

describe("detail pane", () => {
  it("shows the full catalogue detail for a disabled selected row", () => {
    const model = build(makeProfile(), laveTechLevelRaw, "EQ_DOCK_COMP");

    expect(model.detail).not.toBeNull();
    expect(model.detail?.title).toBe("Docking Computers");
    expect(model.detail?.description).toContain("A simple autopilot");
    expect(model.detail?.priceText).toBe("1500.0 Cr");
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
    const model = build(rich());

    expect(row(model, "EQ_WEAPON_PULSE_LASER").label).toBe("Pulse Laser");
    expect(row(model, "EQ_WEAPON_PULSE_LASER").priceText).toBe("400.0 Cr");
    expect(row(model, "EQ_WEAPON_BEAM_LASER").priceText).toBe("1000.0 Cr");
    expect(row(model, "EQ_WEAPON_MINING_LASER").priceText).toBe("800.0 Cr");
    expect(row(model, "EQ_WEAPON_MILITARY_LASER").priceText).toBe("6000.0 Cr");
    expect(row(model, "EQ_WEAPON_NONE").label).toBe("Remove Laser");
    expect(model.facingFor).toBeNull();
  });

  it("gates each laser on the raw tech level, with the short reason", () => {
    // Lave's raw tech level is 4: Pulse and Beam are fittable, Mining and Military are not.
    const model = build(rich());
    expect(row(model, "EQ_WEAPON_PULSE_LASER").confirmable).toBe(true);
    expect(row(model, "EQ_WEAPON_BEAM_LASER").confirmable).toBe(true);
    expect(row(model, "EQ_WEAPON_MINING_LASER")).toMatchObject({
      confirmable: false,
      dimmed: true,
      reason: "Requires TL 10",
    });
    expect(row(model, "EQ_WEAPON_MILITARY_LASER").reason).toBe(
      "Requires TL 10",
    );

    const high = build(rich(), 10);
    expect(row(high, "EQ_WEAPON_MILITARY_LASER").confirmable).toBe(true);
    const low = build(rich(), 3);
    expect(row(low, "EQ_WEAPON_BEAM_LASER").reason).toBe("Requires TL 4");
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
      priceText: "1000.0 Cr",
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
