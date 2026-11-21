// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared current-version save builders (Phase 19, D-11, research Pitfall 9).
 *
 * Every persistence suite that needs a save blob builds it here, so a change to
 * the required fields of the schema (a version bump adds one) is a change to
 * this file and not to hundreds of literals. The helper imports no test
 * framework, so a Vitest suite and the Playwright runner can both load it.
 *
 * `currentSave` is the parsed output of `encodeSave(saveInputs(...))`: a test
 * blob is always one the production writer can write, never a hand-built shape
 * that drifted from it.
 */

import { encodeSave } from "../../src/persistence/save.js";
import type { SaveAllowLists, SaveInputs } from "../../src/persistence/save.js";
import { DEFAULT_LASER_MOUNTS } from "../../src/sim/combat/mounts.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { CLOCK_START } from "../../src/sim/flight/state.js";
import { DAMAGEABLE_EQUIPMENT_KEYS } from "../../src/sim/player/outfitting.js";

/** The 17 commodity keys a market snapshot may carry (Alien Items included). */
export const MARKET_GOODS: readonly string[] = [
  "food",
  "textiles",
  "radioactives",
  "slaves",
  "liquor_wines",
  "luxuries",
  "narcotics",
  "computers",
  "machinery",
  "alloys",
  "firearms",
  "furs",
  "minerals",
  "gold",
  "platinum",
  "gem_stones",
  "alien_items",
];

/**
 * The counter of a world in which nothing has spawned yet: the sim's first
 * dynamic id, which a docked save writes (D-05). `save.ts` exports the same
 * value as `FRESH_WORLD_NEXT_ENTITY_ID`; a literal here keeps the builder's
 * default independent of the constant a test may be checking.
 */
const FRESH_COUNTER = 101;

/**
 * The boot allow-lists a small test catalogue gives: the seven Phase 4
 * equipment keys, Lave and its Coriolis station, three tradeable commodities and
 * the 17 market goods. A suite that needs more (a second system, another
 * equipment key) overrides the one field.
 */
export function saveAllowLists(
  overrides: Partial<SaveAllowLists> = {},
): SaveAllowLists {
  return {
    equipment: new Set([
      "EQ_CARGO_BAY",
      "EQ_DOCK_COMP",
      "EQ_FUEL",
      "EQ_MISSILE",
      "EQ_MISSILE_REMOVAL",
      "EQ_PASSENGER_BERTH",
      "EQ_PASSENGER_BERTH_REMOVAL",
    ]),
    damageableEquipment: new Set(DAMAGEABLE_EQUIPMENT_KEYS),
    systems: new Set(["g0-s7"]),
    stations: new Set(["coriolis-station"]),
    commodities: new Map([
      ["food", "t"],
      ["gold", "kg"],
      ["gem_stones", "g"],
    ]),
    marketGoods: new Set(MARKET_GOODS),
    ...overrides,
  };
}

/**
 * Encoder inputs for a fresh docked Lave save: the opening clock, 1000 credits,
 * no equipment, cargo, missiles or berths, a full tank, epoch 0, the fresh-world
 * counter and the stock laser mounts.
 *
 * The semantic validator requires exactly one seed encoding, so the default
 * carries the system's derived `marketSeed` (what a fresh game derives); an
 * override that supplies `market` makes the encoder drop it.
 */
export function saveInputs(overrides: Partial<SaveInputs> = {}): SaveInputs {
  return {
    clockSeconds: CLOCK_START,
    credits: 1000,
    equipment: [],
    damagedEquipment: [],
    cargo: [],
    fuel: 70,
    missiles: 0,
    passengerBerths: 0,
    mode: "docked",
    marketSeed: marketSeedForSystem("g0-s7"),
    systemId: "g0-s7",
    stationKey: "coriolis-station",
    epoch: 0,
    nextEntityId: FRESH_COUNTER,
    laserMounts: DEFAULT_LASER_MOUNTS,
    ...overrides,
  };
}

/**
 * A current-version save as a plain record, for refusal tables and edge cases:
 * `{ ...JSON.parse(encodeSave(saveInputs())), ...overrides }`. An override whose
 * value is `undefined` removes the key once the record is stringified.
 */
export function currentSave(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...(JSON.parse(encodeSave(saveInputs())) as Record<string, unknown>),
    ...overrides,
  };
}
