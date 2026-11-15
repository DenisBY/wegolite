// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save schema v4 contract (Phase 13, CBT-05; plan 13-06).
 *
 * v4 adds exactly one required field to v3: `laserMounts`, the laser fitted to
 * each of the four facings. The v3 to v4 bump is one ordered step in the chain
 * v1 -> v2 -> v3 -> v4. Expected values come from the Cobra's stock fit
 * (`forward_weapon_type = WEAPON_PULSE_LASER`, no other facing) and from the
 * decisions, never from running the code twice.
 */

import { describe, expect, it } from "vitest";

import {
  profileFromSave,
  snapshotForSave,
} from "../../src/persistence/autosave.js";
import {
  SAVE_VERSION,
  encodeSave,
  isEncodedSaveValid,
  parseSave,
} from "../../src/persistence/save.js";
import type { SaveAllowLists } from "../../src/persistence/save.js";
import { DEFAULT_LASER_MOUNTS, NO_LASER } from "../../src/sim/combat/mounts.js";
import type { LaserMounts } from "../../src/sim/combat/mounts.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../src/sim/economy/market.js";
import { initFlightState } from "../../src/sim/flight/state.js";
import { newProfile } from "../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../src/sim/player/profile.js";
import { commoditiesFixture } from "../helpers/commodities.js";
import { laveFixture } from "../helpers/lave.js";

const lave = laveFixture();
const catalogue = commoditiesFixture();
const LAVE_SEED = marketSeedForSystem("g0-s7");
const laveMarket = generateMarket(lave.system, catalogue, LAVE_SEED);

const ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set(["g0-s7", "g0-s1"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map(
    catalogue
      .filter((commodity) => commodity.tradeable)
      .map((commodity) => [commodity.key, commodity.unit]),
  ),
  marketGoods: new Set(catalogue.map((commodity) => commodity.key)),
};

function snapshot(profile: PlayerProfile) {
  return snapshotForSave(
    initFlightState(lave.layout),
    profile,
    lave.system,
    { key: "coriolis-station" },
    laveMarket,
    catalogue,
    { epoch: 0, anchorNextEntityId: undefined },
  );
}

describe("laser mounts through a v4 save (tracer)", () => {
  it("a new game carries the Cobra's stock fit: a pulse laser fore, nothing elsewhere", () => {
    const mounts = newProfile().laserMounts;
    expect(mounts).toEqual(DEFAULT_LASER_MOUNTS);
    expect(mounts).toEqual({
      fore: "EQ_WEAPON_PULSE_LASER",
      aft: NO_LASER,
      port: NO_LASER,
      starboard: NO_LASER,
    });
    // Every profile owns its copy: no two share a mounts object.
    expect(mounts).not.toBe(DEFAULT_LASER_MOUNTS);
    expect(newProfile().laserMounts).not.toBe(mounts);
  });

  it("the version this build writes is 4", () => {
    expect(SAVE_VERSION).toBe(4);
  });

  it("a beam laser on aft survives encodeSave, parseSave and profileFromSave", () => {
    const mounts: LaserMounts = {
      fore: "EQ_WEAPON_PULSE_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
      port: NO_LASER,
      starboard: NO_LASER,
    };
    const profile: PlayerProfile = { ...newProfile(), laserMounts: mounts };
    const inputs = snapshot(profile);
    expect(inputs.laserMounts).toEqual(mounts);

    const encoded = encodeSave(inputs);
    expect(encoded.startsWith('{"version":4,')).toBe(true);
    expect(isEncodedSaveValid(encoded, ALLOW)).toBe(true);

    const parsed = parseSave(encoded, ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.version).toBe(4);
    expect(parsed.save.laserMounts).toEqual(mounts);

    const restored = profileFromSave(parsed.save);
    expect(restored.laserMounts).toEqual(mounts);
    // The restored profile owns a copy, not the parsed save's object.
    expect(restored.laserMounts).not.toBe(parsed.save.laserMounts);
    // A second snapshot of the restored profile is the same bytes.
    expect(encodeSave(snapshot(restored))).toBe(encoded);
  });
});
