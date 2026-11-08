// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Save fixtures for the budget scenes (QUAL-01, T-07-15).
 *
 * Each fixture is encoded by the production `encodeSave` and written through
 * `writeRaw`, so it passes the same strict boot reader a player's save does. The
 * fixtures never use the in-page test hook, so a session started from one can
 * still save and no taint path is exercised.
 */

import { encodeSave } from "../../../src/persistence/save.js";
import type { SaveFlightPose } from "../../../src/persistence/save.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { CLOCK_START } from "../../../src/sim/flight/state.js";

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

/** A docked save at the named galaxy-0 system, with a fresh starting profile. */
export function dockedSaveAt(systemName: string): string {
  const system = systemByName(systemName);
  return encodeSave({
    clockSeconds: CLOCK_START,
    credits: 1000,
    equipment: [],
    cargo: [],
    fuel: 70,
    missiles: 0,
    passengerBerths: 0,
    mode: "docked",
    marketSeed: marketSeedForSystem(system.id),
    systemId: system.id,
    stationKey: STATION_KEY,
  });
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
  return encodeSave({
    clockSeconds: CLOCK_START,
    credits: 1000,
    equipment: [],
    cargo: [],
    fuel: 70,
    missiles: 0,
    passengerBerths: 0,
    mode: "inFlight",
    ...(targetName === undefined
      ? {}
      : { targetSystem: systemByName(targetName).id }),
    marketSeed: marketSeedForSystem(system.id),
    flight,
    systemId: system.id,
    stationKey: STATION_KEY,
  });
}
