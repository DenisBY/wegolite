// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_flee_target:` (AI-01, plan 14-13; `ShipEntity.m:4840-4901`): fly
 * away from the primary target at full speed while it is within the desired
 * range, steering by `trackPrimaryTarget:retreat:YES` with the jink offset.
 *
 * Scope cuts, each recorded for plan 14-19:
 *  - no afterburner: `canBurn` is false for every ship (no fuel injection is
 *    modelled), so `max_available_speed` is `maxFlightSpeed`;
 *  - no missile, cascade-mine or turret-fire branches (4883-4896; no NPC fire
 *    and no cascade mines in v2.2);
 *  - `REACHED_SAFETY` (4855) is a plist-only AI message with no consumer and is
 *    not posted: a scripted pilot reads the range through the view instead.
 *
 * `range == 0` counts as safety exactly, as in Oolite (a ship with no target
 * has range 0, and so does one whose radii exactly touch); a negative range
 * (overlapping radii) is not safety, so the ship still flees.
 *
 * `frustration` and `successFactor` are GLfloat in Oolite: every write is
 * `Math.fround`, so the 15 s report fires on the oracle's tick (1801).
 */

import type { Entity } from "../../world/entity.js";
import { avoidCollision, hasProximityAlertIgnoringTarget } from "../avoid.js";
import {
  COMBAT_AI_ISNT_AWFUL,
  FLEE_FRUSTRATION_LIMIT,
  FLEE_FRUSTRATION_RELIEF,
} from "../constants.js";
import type { SteerContext } from "../dispatch.js";
import {
  noteLostTargetAndGoIdle,
  rangeToPrimaryTarget,
  targetBody,
} from "../target.js";
import { noteFrustration, trackPrimaryTarget } from "../track.js";

export function behaviourFleeTarget(entity: Entity, ctx: SteerContext): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const range = rangeToPrimaryTarget(entity, ctx);
  if (targetBody(entity, ctx.view) === undefined) {
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }

  const lastRange = steer.successFactor;
  steer.successFactor = Math.fround(range);

  // `range > desired_range || range == 0` posts REACHED_SAFETY (plist-only, not
  // posted); otherwise the ship runs at full speed.
  if (!(range > nav.desiredRange || range === 0)) {
    nav.desiredSpeed = ctx.stats.maxFlightSpeed;
  }

  if (range > lastRange) {
    // improvement
    steer.frustration = Math.fround(
      steer.frustration - FLEE_FRUSTRATION_RELIEF * ctx.dt,
    );
    if (steer.frustration < 0) steer.frustration = 0;
  } else {
    steer.frustration = Math.fround(steer.frustration + ctx.dt);
    if (steer.frustration > FLEE_FRUSTRATION_LIMIT) {
      // 15 s of frustration
      noteFrustration(ctx);
      steer.frustration = 0;
    }
  }

  trackPrimaryTarget(entity, ctx, true);

  // remember to look where you're going?
  if (
    steer.accuracy >= COMBAT_AI_ISNT_AWFUL &&
    hasProximityAlertIgnoringTarget(entity, ctx, true)
  ) {
    avoidCollision(entity, ctx); // 4898-4899
  }
}
