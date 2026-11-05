// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Credits, the equipment catalogue and the TL purchase gate (DOCK-05, D-10).
 *
 * Oolite compares the **raw** system tech level with the equipment tech level
 * (`PlayerEntity.m:8226-8295`, `techlevel < minTechLevel`). Lave's raw value is
 * 4, so a faithful TL 9 gate refuses `EQ_DOCK_COMP` there; a synthetic TL 9
 * record proves the gate opens. The price is integer decicredits and always
 * comes from the validated catalogue — never from a command or panel text.
 *
 * The boundary cases (14999 / 15000 / owned) and the invalid-price cases are
 * security assertions: a zero, negative, fractional or non-finite price must
 * never mint credits, and a purchase must never drive credits negative.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  EquipmentError,
  findEquipment,
  parseEquipment,
} from "../../src/content/equipment.js";
import type { Equipment } from "../../src/content/types.js";
import {
  MAX_EQUIPMENT_KEYS,
  MAX_EQUIPMENT_KEY_LENGTH,
  NEW_GAME_CREDITS,
  canPurchase,
  formatCredits,
  grantCredits,
  newProfile,
  purchase,
  setCredits,
} from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import { laveFixture } from "../helpers/lave.js";

const fixture = laveFixture();

const dockComputer: Equipment = {
  key: "EQ_DOCK_COMP",
  name: "Docking Computers",
  description: "A simple autopilot.",
  techLevel: 9,
  price: 15000,
  priceUnit: "decicredits",
  conditions: {},
};

function equipmentFile(): unknown {
  return JSON.parse(
    readFileSync(
      new URL("../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

describe("newProfile", () => {
  it("starts a new game with 1000 decicredits and no equipment", () => {
    const profile = newProfile();

    expect(profile).toEqual({ credits: 1000, equipment: [] });
    expect(NEW_GAME_CREDITS).toBe(1000);
    // A fresh array each call: a shared default would leak purchases between
    // games.
    expect(newProfile().equipment).not.toBe(profile.equipment);
  });
});

describe("formatCredits", () => {
  it("formats decicredits with exactly one decimal place", () => {
    expect(formatCredits(15000)).toBe("1500.0 Cr");
    expect(formatCredits(1000)).toBe("100.0 Cr");
    expect(formatCredits(0)).toBe("0.0 Cr");
    expect(formatCredits(1505)).toBe("150.5 Cr");
  });
});

describe("canPurchase", () => {
  it("refuses a TL 9 item at Lave (raw techLevel 4) even with enough credits", () => {
    const profile: PlayerProfile = { credits: 15000, equipment: [] };

    expect(fixture.system.techLevelRaw).toBe(4);
    expect(
      canPurchase(profile, dockComputer, fixture.system.techLevelRaw),
    ).toEqual({ ok: false, reason: "techLevel" });
  });

  it("accepts a TL 9 item on a synthetic TL 9 system", () => {
    const profile: PlayerProfile = { credits: 15000, equipment: [] };

    expect(canPurchase(profile, dockComputer, 9)).toEqual({ ok: true });
    expect(canPurchase(profile, dockComputer, 10)).toEqual({ ok: true });
  });

  it("refuses an already owned item before checking credits", () => {
    const profile: PlayerProfile = {
      credits: 0,
      equipment: ["EQ_DOCK_COMP"],
    };

    expect(canPurchase(profile, dockComputer, 9)).toEqual({
      ok: false,
      reason: "owned",
    });
  });

  it("accredits exactly 15000 and refuses 14999", () => {
    expect(
      canPurchase({ credits: 15000, equipment: [] }, dockComputer, 9),
    ).toEqual({ ok: true });
    expect(
      canPurchase({ credits: 14999, equipment: [] }, dockComputer, 9),
    ).toEqual({ ok: false, reason: "insufficientCredits" });
  });

  it("refuses every invalid price shape", () => {
    const invalidPrices = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (const price of invalidPrices) {
      const item = { ...dockComputer, price };
      expect(canPurchase({ credits: 15000, equipment: [] }, item, 9)).toEqual({
        ok: false,
        reason: "invalidPrice",
      });
    }
  });
});

describe("purchase", () => {
  it("deducts exactly the catalogue price and appends the key once", () => {
    const before: PlayerProfile = { credits: 15000, equipment: [] };

    const after = purchase(before, dockComputer);

    expect(after).toEqual({ credits: 0, equipment: ["EQ_DOCK_COMP"] });
    // The input profile is never mutated.
    expect(before).toEqual({ credits: 15000, equipment: [] });
  });

  it("refuses at 14999, on a double purchase and on an invalid price", () => {
    const poor: PlayerProfile = { credits: 14999, equipment: [] };
    expect(purchase(poor, dockComputer)).toBe(poor);

    const owned: PlayerProfile = {
      credits: 15000,
      equipment: ["EQ_DOCK_COMP"],
    };
    expect(purchase(owned, dockComputer)).toBe(owned);

    const forged = { ...dockComputer, price: 0 };
    const flush: PlayerProfile = { credits: 15000, equipment: [] };
    expect(purchase(flush, forged)).toBe(flush);
  });

  it("never lets credits go negative or exceed a safe integer", () => {
    const negative: PlayerProfile = { credits: -1, equipment: [] };
    expect(purchase(negative, dockComputer)).toBe(negative);

    const unsafe: PlayerProfile = {
      credits: Number.MAX_SAFE_INTEGER + 1,
      equipment: [],
    };
    expect(purchase(unsafe, dockComputer)).toBe(unsafe);
  });

  it("refuses an invalid key and a sixty-fifth equipment key", () => {
    const emptyKey: PlayerProfile = { credits: 15000, equipment: [] };
    expect(purchase(emptyKey, { ...dockComputer, key: "" })).toBe(emptyKey);

    const tooLong = "K".repeat(MAX_EQUIPMENT_KEY_LENGTH + 1);
    expect(purchase(emptyKey, { ...dockComputer, key: tooLong })).toBe(
      emptyKey,
    );

    const full: PlayerProfile = {
      credits: 15000,
      equipment: Array.from(
        { length: MAX_EQUIPMENT_KEYS },
        (_, index) => `K${String(index)}`,
      ),
    };
    expect(purchase(full, dockComputer)).toBe(full);
  });
});

describe("credits grants", () => {
  it("rejects negative, fractional, non-finite and overflowing values", () => {
    const profile = newProfile();

    expect(setCredits(profile, -1)).toBe(profile);
    expect(setCredits(profile, 1.5)).toBe(profile);
    expect(setCredits(profile, Number.NaN)).toBe(profile);
    expect(setCredits(profile, Number.POSITIVE_INFINITY)).toBe(profile);

    expect(grantCredits(profile, -1)).toBe(profile);
    expect(grantCredits(profile, 0.5)).toBe(profile);

    const nearlyFull: PlayerProfile = {
      credits: Number.MAX_SAFE_INTEGER - 1,
      equipment: [],
    };
    expect(grantCredits(nearlyFull, 10)).toBe(nearlyFull);
  });

  it("sets a valid credit balance and grants a valid amount", () => {
    const profile = newProfile();

    expect(setCredits(profile, 15000)).toEqual({
      credits: 15000,
      equipment: [],
    });
    expect(grantCredits(profile, 14000)).toEqual({
      credits: 15000,
      equipment: [],
    });
  });
});

describe("equipment catalogue", () => {
  it("validates the committed equipment file and finds EQ_DOCK_COMP", () => {
    const catalogue = parseEquipment(equipmentFile());
    const found = findEquipment(catalogue, "EQ_DOCK_COMP");

    expect(found.name).toBe("Docking Computers");
    expect(found.price).toBe(15000);
    expect(found.techLevel).toBe(9);
    expect(found.priceUnit).toBe("decicredits");
  });

  it("uses the same 15000 decicredit price the purchase gate reads", () => {
    const found = findEquipment(
      parseEquipment(equipmentFile()),
      "EQ_DOCK_COMP",
    );
    expect(canPurchase({ credits: 15000, equipment: [] }, found, 9)).toEqual({
      ok: true,
    });
    expect(purchase({ credits: 15000, equipment: [] }, found)).toEqual({
      credits: 0,
      equipment: ["EQ_DOCK_COMP"],
    });
  });

  it("rejects a malformed record and a duplicate key with a named error", () => {
    const raw = equipmentFile() as Equipment[];
    const malformed = [{ ...raw[0], price: 1.5 }];

    expect(() => parseEquipment(malformed)).toThrow(EquipmentError);
    expect(() => parseEquipment([raw[0], raw[0]])).toThrow(EquipmentError);
    expect(() => parseEquipment({})).toThrow(EquipmentError);
  });

  it("throws a named error when the key is absent", () => {
    const catalogue = parseEquipment(equipmentFile());

    expect(() => findEquipment(catalogue, "EQ_NOT_A_KEY")).toThrow(
      EquipmentError,
    );
  });
});
