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
 * An in-flight save at the named galaxy-0 system. The flight has no rotation
 * rates and no torus, and an optional committed hyperspace target.
 */
export function inFlightSaveAt(
  systemName: string,
  pose: FixturePose,
  targetName?: string,
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
