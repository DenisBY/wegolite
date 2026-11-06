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
import type { Commodity } from "../content/types.js";
import { emptyCargo } from "../sim/economy/cargo.js";
import { NEW_GAME_FUEL, NEW_GAME_MISSILES } from "../sim/player/profile.js";
import type { PlayerProfile } from "../sim/player/profile.js";
import type { SystemLayout } from "../sim/world/layout.js";
import { encodeSave, isEncodedSaveValid } from "./save.js";
import { LEGACY_BERTH_ALIAS, LEGACY_MISSILE_ALIAS } from "./save.js";
import type {
  SaveAllowLists,
  SaveCargoEntry,
  SaveInputs,
  SaveV1,
} from "./save.js";
import type { SaveStore, WriteResult } from "./store.js";

/** The stable identity a save records instead of world coordinates. */
export interface SaveIdentity {
  readonly systemId: string;
  readonly stationKey: string;
}

export interface RestoredGame {
  readonly state: FlightState;
  readonly profile: PlayerProfile;
  /**
   * The persisted market seed, when the blob carried one. A Phase 4 blob has
   * none; the boot substitutes `marketSeedForSystem(system.id)`, never a clock
   * or random value.
   */
  readonly marketSeed?: number;
}

/** Build the schema inputs from the live state, profile and identities. */
export function snapshotForSave(
  state: FlightState,
  profile: PlayerProfile,
  system: { readonly id: string },
  station: { readonly key: string },
  marketSeed: number,
  commodities: readonly Commodity[],
): SaveInputs {
  const order = new Map(
    commodities.map((commodity) => [commodity.key, commodity.sortOrder]),
  );
  const cargo: SaveCargoEntry[] = Object.entries(profile.cargo)
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => {
      const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder === rightOrder
        ? left.localeCompare(right)
        : leftOrder - rightOrder;
    })
    .map(([key, quantity]) => ({ key, quantity }));

  return {
    // `SaveV1Schema.clockSeconds` is an integer; flight advances the clock by
    // `DT` (1/120), so a snapshot taken after any flight is fractional. Floor
    // it at the writer boundary: the save contract must never depend on how
    // long the player flew.
    clockSeconds: Math.floor(state.clockSeconds),
    credits: profile.credits,
    equipment: [...profile.equipment],
    cargo,
    fuel: profile.fuel,
    missiles: profile.missiles,
    passengerBerths: profile.passengerBerths,
    marketSeed,
    systemId: system.id,
    stationKey: station.key,
  };
}

/**
 * Encode and write one snapshot.
 *
 * The returned promise always resolves. A store that rejects is reported as a
 * non-committed result, so no caller can accidentally create an unhandled
 * rejection by firing an autosave at the frame loop. The same semantic
 * validator the parser uses runs first, so a schema-valid but over-capacity
 * snapshot leaves the previous bytes untouched (T-05-19).
 */
export async function queueAutosave(
  store: SaveStore,
  revision: number,
  inputs: SaveInputs,
  allow: SaveAllowLists,
): Promise<WriteResult> {
  try {
    const encoded = encodeSave(inputs);
    // Fail closed: a snapshot this build's own parser would reject must never
    // replace the last good blob. Reporting `invalid-save` leaves the store
    // untouched and the previous save intact.
    if (!isEncodedSaveValid(encoded, allow)) {
      return { committed: false, revision, reason: "invalid-save" };
    }
    return await store.write(encoded, revision);
  } catch (error) {
    return {
      committed: false,
      revision,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The Phase 4 alias count rule: explicit plus at most one alias. */
function effectiveCount(
  explicit: number | undefined,
  hasAlias: boolean,
  fallback: number,
): number {
  if (explicit !== undefined) return explicit + (hasAlias ? 1 : 0);
  return hasAlias ? 1 : fallback;
}

/**
 * Build a profile from a validated save.
 *
 * A field-less Phase 4 blob defaults to an empty hold, a full tank, three
 * missiles and no berths. The Phase 4 equipment aliases are folded into their
 * counts and removed from the equipment list; the dump is canonical from then
 * on.
 */
export function profileFromSave(save: SaveV1): PlayerProfile {
  const equipment: string[] = [];
  let hasBerthAlias = false;
  let hasMissileAlias = false;
  for (const key of save.equipment) {
    if (key === LEGACY_BERTH_ALIAS) {
      hasBerthAlias = true;
      continue;
    }
    if (key === LEGACY_MISSILE_ALIAS) {
      hasMissileAlias = true;
      continue;
    }
    equipment.push(key);
  }

  const cargo = emptyCargo() as Record<string, number>;
  for (const entry of save.cargo ?? []) {
    cargo[entry.key] = entry.quantity;
  }

  return {
    credits: save.credits,
    equipment,
    cargo,
    fuel: save.fuel ?? NEW_GAME_FUEL,
    missiles: effectiveCount(save.missiles, hasMissileAlias, NEW_GAME_MISSILES),
    passengerBerths: effectiveCount(save.passengerBerths, hasBerthAlias, 0),
  };
}

/**
 * Restore a validated save: a fresh docked state at the saved clock, plus the
 * profile built by `profileFromSave`.
 */
export function restoreFromSave(
  save: SaveV1,
  layout: SystemLayout,
  profileFactory: (save: SaveV1) => PlayerProfile,
): RestoredGame {
  const state = initFlightState(layout);
  state.mode = "docked";
  state.clockSeconds = save.clockSeconds;
  return {
    state,
    profile: profileFactory(save),
    ...(save.marketSeed === undefined ? {} : { marketSeed: save.marketSeed }),
  };
}
