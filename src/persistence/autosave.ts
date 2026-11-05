// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The autosave and restore glue (D-13, D-14, D-15, T-04-48).
 *
 * The snapshot is taken from the state *after* `beginLaunch`, so the saved
 * clock already carries the +600 s launch adjustment and the blob declares
 * `mode: "docked"` ("resume docked at this clock"). The docked pose is never
 * written: `initFlightState` derives it from the layout, which is what keeps the
 * save free of float positions, quaternions and timestamps.
 *
 * `queueAutosave` never throws. A rejected transaction is the store's problem,
 * not the frame's: the game must keep running when IndexedDB is full, blocked or
 * unavailable.
 */

import { initFlightState } from "../sim/flight/state.js";
import type { FlightState } from "../sim/flight/state.js";
import type { PlayerProfile } from "../sim/player/profile.js";
import type { SystemLayout } from "../sim/world/layout.js";
import { encodeSave } from "./save.js";
import type { SaveInputs, SaveV1 } from "./save.js";
import type { SaveStore, WriteResult } from "./store.js";

/** The stable identity a save records instead of world coordinates. */
export interface SaveIdentity {
  readonly systemId: string;
  readonly stationKey: string;
}

export interface RestoredGame {
  readonly state: FlightState;
  readonly profile: PlayerProfile;
}

/** Build the schema inputs from the live state, profile and identities. */
export function snapshotForSave(
  state: FlightState,
  profile: PlayerProfile,
  system: { readonly id: string },
  station: { readonly key: string },
): SaveInputs {
  return {
    clockSeconds: state.clockSeconds,
    credits: profile.credits,
    equipment: [...profile.equipment],
    systemId: system.id,
    stationKey: station.key,
  };
}

/**
 * Encode and write one snapshot.
 *
 * The returned promise always resolves. A store that rejects is reported as a
 * non-committed result, so no caller can accidentally create an unhandled
 * rejection by firing an autosave at the frame loop.
 */
export async function queueAutosave(
  store: SaveStore,
  revision: number,
  inputs: SaveInputs,
): Promise<WriteResult> {
  try {
    return await store.write(encodeSave(inputs), revision);
  } catch (error) {
    return {
      committed: false,
      revision,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Restore a validated save: a fresh docked state at the saved clock, plus the
 * profile built by the caller from the trusted credits and equipment.
 */
export function restoreFromSave(
  save: SaveV1,
  layout: SystemLayout,
  profileFactory: (
    credits: number,
    equipment: readonly string[],
  ) => PlayerProfile,
): RestoredGame {
  const state = initFlightState(layout);
  state.mode = "docked";
  state.clockSeconds = save.clockSeconds;
  return {
    state,
    profile: profileFactory(save.credits, [...save.equipment]),
  };
}
