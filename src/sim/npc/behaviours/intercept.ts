// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_intercept_target:` (AI-01, plan 14-12; `ShipEntity.m:3817-3826`):
 * fly at full speed toward the primary target, scaled by how well the ship is
 * tracking it.
 *
 * Only the INTERCEPT half is ported; BEHAVIOUR_COLLECT_TARGET (3827-3880) is
 * AI-12. Oolite posts `shipAchievedDesiredRange` on EVERY update while the range
 * to the target is below the desired range (3822-3825), and
 * `trackPrimaryTarget:` may then post `shipTargetLost`: for a target that is
 * gone, `rangeToPrimaryTarget` is 0 (9727), so one tick posts
 * `shipAchievedDesiredRange` and then `shipTargetLost`, in that order. The
 * plist message `DESIRED_RANGE_ACHIEVED` has no consumer and is not posted, and
 * `addTarget:`'s `shipTargetAcquired` (8667-8669) is not in `AI_EVENT_NAMES` and
 * is not posted (a recorded divergence). The proximity call site (3881-3882,
 * `hasProximityAlertIgnoringTarget:YES` then `avoidCollision`) is plan 14-13's
 * (`../avoid.js`).
 */

import type { Entity } from "../../world/entity.js";
import { avoidCollision, hasProximityAlertIgnoringTarget } from "../avoid.js";
import type { SteerContext } from "../dispatch.js";
import { rangeToPrimaryTarget } from "../target.js";
import { trackPrimaryTarget } from "../track.js";

export function behaviourInterceptTarget(
  entity: Entity,
  ctx: SteerContext,
): void {
  const range = rangeToPrimaryTarget(entity, ctx);
  entity.nav.desiredSpeed = ctx.stats.maxFlightSpeed;
  if (range < entity.nav.desiredRange) {
    ctx.emit({ name: "shipAchievedDesiredRange" });
  }
  entity.nav.desiredSpeed =
    ctx.stats.maxFlightSpeed * trackPrimaryTarget(entity, ctx, false);
  if (hasProximityAlertIgnoringTarget(entity, ctx, true)) {
    avoidCollision(entity, ctx); // 3881-3882
  }
}
