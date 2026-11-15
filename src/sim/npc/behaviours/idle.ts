// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_stop_still:` and `behaviour_idle:` (AI-01, plan 14-09;
 * `ShipEntity.m:3700-3722`).
 *
 * Both only set the sticks and call `applySticks`; the attitude step and the
 * thrust ramp follow in `steerShip` (`processBehaviour:`, 2633-2637). Idle is
 * also the recorded fallback of every behaviour id the port does not run.
 */

import type { Entity } from "../../world/entity.js";
import type { SteerContext } from "../dispatch.js";
import { applySticks } from "../flight.js";

/**
 * `behaviour_stop_still:` (3700-3706): both sticks to 0. STATION_KEEPING shares
 * this behaviour (`processBehaviour:` 2493-2496).
 */
export function behaviourStopStill(entity: Entity, ctx: SteerContext): void {
  entity.steer.stickRoll = 0;
  entity.steer.stickPitch = 0;
  applySticks(entity, ctx.dt);
}

/**
 * `behaviour_idle:` (3708-3722). A station keeps its roll and a buoy keeps its
 * roll and pitch, so those two scan classes hold the current rate as their
 * stick; every ship takes both sticks to 0. Neither applies to the nine ship
 * records, but the branches are ported literally.
 */
export function behaviourIdle(entity: Entity, ctx: SteerContext): void {
  const steer = entity.steer;
  if (
    entity.scanClass !== "CLASS_STATION" &&
    entity.scanClass !== "CLASS_BUOY"
  ) {
    steer.stickRoll = 0;
  } else {
    steer.stickRoll = steer.flightRoll;
  }
  if (entity.scanClass !== "CLASS_BUOY") {
    steer.stickPitch = 0;
  } else {
    steer.stickPitch = steer.flightPitch;
  }
  applySticks(entity, ctx.dt);
}
