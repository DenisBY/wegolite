// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Save fixtures for the budget scenes (QUAL-01, T-07-15).
 *
 * Each fixture is the production `encodeSave` over the shared current-version
 * `saveInputs` builder (`tests/helpers/save-builders.ts`), passing only the
 * fields that differ from its defaults. A fixture is written through
 * `writeRaw`, so it passes the same strict boot reader a player's save does, and
 * a version bump changes the builder and not this file. The fixtures never use
 * the in-page test hook, so a session started from one can still save and no
 * taint path is exercised.
 *
 * The fixtures are new-game anchors: epoch 0 and the fresh-world counter.
 */

import { encodeSave } from "../../../src/persistence/save.js";
import type { SaveFlightPose } from "../../../src/persistence/save.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";

import { saveInputs } from "../../helpers/save-builders.js";
import { systemByName } from "./chart.js";

/**
 * The station key the session itself saves (`stationShip(catalogue).key` in
 * src/content/ships.ts). The system record's `station` field holds only the
 * role fragment, so it is not used here.
 */
const STATION_KEY = "coriolis-station";

/** The pose an in-flight fixture starts from. The blob orientation is `[w, x, y, z]`. */
export interface FixturePose {
  readonly position: [number, number, number];
  readonly orientation: [number, number, number, number];
  readonly speed: number;
}

/**
 * What a docked fixture may carry beyond the fresh starting profile (Phase 19,
 * SAVE-09): the installed equipment and the damaged equipment, in damage order.
 * Both go through the production `encodeSave`, so a fixture is never a blob the
 * writer could not have written.
 */
export interface DockedSaveOptions {
  readonly equipment?: readonly string[];
  readonly damagedEquipment?: readonly string[];
}

/**
 * A docked save at the named galaxy-0 system, with a fresh starting profile
 * unless `options` fits or damages equipment.
 */
export function dockedSaveAt(
  systemName: string,
  options: DockedSaveOptions = {},
): string {
  const system = systemByName(systemName);
  return encodeSave(
    saveInputs({
      ...(options.equipment === undefined
        ? {}
        : { equipment: options.equipment }),
      ...(options.damagedEquipment === undefined
        ? {}
        : { damagedEquipment: options.damagedEquipment }),
      marketSeed: marketSeedForSystem(system.id),
      systemId: system.id,
      stationKey: STATION_KEY,
    }),
  );
}

/**
 * What an in-flight fixture may carry beyond the fresh starting profile (Phase
 * 20): the same two lists a docked fixture takes, so a save written in flight
 * can hold an installed and a damaged item. Both go through the production
 * `encodeSave`.
 */
export type InFlightSaveOptions = DockedSaveOptions;

/**
 * An in-flight save at the named galaxy-0 system. The flight has no rotation
 * rates and no torus, and an optional committed hyperspace target. `options`
 * fits or damages equipment the way `dockedSaveAt` does; a caller that passes
 * none gets the same bytes as before the options existed.
 */
export function inFlightSaveAt(
  systemName: string,
  pose: FixturePose,
  targetName?: string,
  options: InFlightSaveOptions = {},
): string {
  const system = systemByName(systemName);
  const flight: SaveFlightPose = {
    position: pose.position,
    orientation: pose.orientation,
    speed: pose.speed,
    pitchRate: 0,
    rollRate: 0,
    torus: false,
  };
  return encodeSave(
    saveInputs({
      ...(options.equipment === undefined
        ? {}
        : { equipment: options.equipment }),
      ...(options.damagedEquipment === undefined
        ? {}
        : { damagedEquipment: options.damagedEquipment }),
      mode: "inFlight",
      ...(targetName === undefined
        ? {}
        : { targetSystem: systemByName(targetName).id }),
      marketSeed: marketSeedForSystem(system.id),
      flight,
      systemId: system.id,
      stationKey: STATION_KEY,
    }),
  );
}

/**
 * The Lave nav buoy's position (`deriveSystemLayout` of the Lave station, which
 * the Node twin asserts against the layout), the one place the ram pose below
 * is computed from.
 */
const LAVE_NAV_BUOY: readonly [number, number, number] = [
  -43460.921469474, 53367.986762848275, -430704.12471183104,
];

/**
 * The run-up of the death route, in metres: at 350 m/s this is about 14 s of
 * sim time, so a real-time session has Continued, read its baselines and held a
 * key long before the contact (no wall-clock race, plan 20-09).
 */
export const DEATH_RAM_RUN_UP_M = 5000;

/**
 * The seed of the death route (Phase 20, D-16): a Lave pose `DEATH_RAM_RUN_UP_M`
 * out on the nav buoy's +Z side, nose on (the identity orientation looks along
 * -Z), at the Cobra's top speed. Restored with full shields and bank, as every
 * save is, the ram kills the player at the tick
 * `tests/app/session/death-twin.test.ts` pins.
 */
export const DEATH_RAM_POSE: FixturePose = {
  position: [
    LAVE_NAV_BUOY[0],
    LAVE_NAV_BUOY[1],
    LAVE_NAV_BUOY[2] + DEATH_RAM_RUN_UP_M,
  ],
  orientation: [1, 0, 0, 0],
  speed: 350,
};

/**
 * The committed hyperspace target of the seed: Diso, in range of a fresh
 * profile's fuel (`tests/e2e/core-loop.spec.ts` jumps there), so a working H
 * would start the countdown whose arrival autosaves.
 */
export const DEATH_TARGET = "Diso";

/**
 * The seed's equipment: an installed cargo bay and a damaged docking computer
 * (both keys the v5 writer accepts, as 19-09's docked fixture uses), so the
 * restored save has a damaged item to keep damaged.
 */
export const DEATH_SEED_ITEMS: InFlightSaveOptions = {
  equipment: ["EQ_CARGO_BAY"],
  damagedEquipment: ["EQ_DOCK_COMP"],
};
