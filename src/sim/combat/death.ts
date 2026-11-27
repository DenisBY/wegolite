// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's death (DEATH-01, D-04, D-11): the one function that makes the
 * player dead and the one place that posts `playerDestroyed`.
 *
 * Oolite ends the player's flight in `getDestroyedBy:` (`PlayerEntity.m:6187-6221`
 * at the pin 7437f22): a laser hit that takes the energy to 0 or below goes
 * there from `takeEnergyDamage` (`:5683-5689`), a collision's scrape from
 * `takeScrapeDamage` (`:5744`), and a dead player ignores any later damage
 * (`:5607`, `:5707`). Wegolite decides the lethal record in the damage ledger
 * (`./ledger.ts`), at the moment the damage is applied, and `resolveShots`
 * (`./step.ts`) calls `killPlayer` once after the tick's kills and the player's
 * blast push.
 *
 * The cause names the lethal record's source by a key the app can look up: the
 * spec key of an NPC ship or the ident key of a static. It never carries an
 * entity id (an id is valid only in the world that issued it), and it reads no
 * credit of the kill path (D-04).
 */

import type { PlayerDeathCause, SimEvent } from "../events.js";
import { clearHyperspaceAttempt } from "../flight/state.js";
import type { FlightState } from "../flight/state.js";
import { playerVelocity } from "../world/drift.js";
import { NO_ENTITY } from "../world/ids.js";
import { staticTargetById } from "../world/statics.js";
import type { World } from "../world/world.js";
import type { HitRecord } from "./ledger.js";
import type { PlayerCombatState } from "./state.js";

/**
 * The cause of the death the lethal `record` brings (D-04): its damage kind and
 * the culprit key of its source, the spec key of a live or just-killed NPC in
 * the store, else the ident key of a buoy, else none.
 *
 * The main station never names a culprit: its row has no key of its own (the
 * layout names it, Phase 22.1), and it can never be the source of a lethal
 * record, because the station neither shoots nor collides (`collide.ts` skips
 * its row, FIDELITY E-135). If E-135 is taken up and the station can kill the
 * player, this function needs the layout threaded in to name it (the E-135
 * todo lists this file for that).
 */
export function playerDeathCause(
  world: World | undefined,
  record: HitRecord,
): PlayerDeathCause {
  const staticRow = staticTargetById(record.source);
  const culprit =
    world?.store.get(record.source)?.specKey ??
    (staticRow !== undefined && staticRow.layoutKey !== "station"
      ? staticRow.identKey
      : undefined);
  return culprit === undefined
    ? { damage: record.kind }
    : { damage: record.kind, culprit };
}

/**
 * Kill the player: mode `"dead"`, the energy bank at 0, the hyperspace attempt
 * cleared (without a cancelled event, whose HUD message would print after the
 * queue is cleared), the ident lock dropped, and one `playerDestroyed` posted
 * with a copy of the position and `cause`. A no-op unless the player is in
 * flight, so a docked or launching ship is never killed and one death posts
 * one event.
 */
export function killPlayer(
  player: FlightState,
  combat: PlayerCombatState,
  cause: PlayerDeathCause,
  events: SimEvent[],
): void {
  if (player.mode !== "inFlight") return;
  player.mode = "dead";
  clearHyperspaceAttempt(player);
  combat.energy = 0;
  combat.identEngaged = false;
  combat.identTarget = NO_ENTITY;
  events.push({
    kind: "playerDestroyed",
    position: { ...player.position },
    cause,
    velocity: playerVelocity(player),
  });
}
