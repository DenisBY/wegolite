// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The reaction-time tracking curve (AI-01, plan 14-12; `ShipEntity.m:5412-5489`):
 * a ship does not aim at where its target is, it aims at where a quadratic fit
 * through the target's last three samples, taken a third of the reaction time
 * apart, says it will be.
 *
 * The state is the steering record's `trackingCount`, `trackingTicks` and
 * `trackingPositions` (plan 14-08). The clock is the integer tick (oracle
 * contract item 8): the reaction time of 1.5 s is `3 * TRACKING_SAMPLE_TICKS`
 * = 180 ticks, and a time difference in seconds is a tick difference over
 * `TICKS_PER_SECOND`.
 *
 *  - `startTrackingCurve` (5425-5442) writes four copies of the target's
 *    position with the ticks now, now - 60, now - 120 and now - 180. The ticks
 *    are SIGNED (a start before tick 180 stores negative ticks) and strictly
 *    decreasing, so the spacings `t1` and `t2` below are never 0 and never
 *    equal: `calculateTrackingCurve` cannot divide by zero (T-14-38).
 *  - Oolite starts the curve inside `addTarget:` (8659-8665). Wegolite's AI
 *    writes targets through `ShipControl.setTarget`, which sets
 *    `trackingCount` to 0 ("start pending"); `startPendingTrackingCurves` runs
 *    the literal start after the think phase's final drain, at the think tick,
 *    with the positions `addTarget:` would have sampled (nothing moves during
 *    the think phase). `steerShip` also starts a pending curve before its
 *    sample step when it finds one (a defensive guard for hand-set states, not
 *    an Oolite line).
 *  - `updateTrackingCurve` (5444-5470) keeps Oolite's gate `ticks[0] + 60 >
 *    now: return` and shifts the samples. The cloaked-target branch (5455-5459)
 *    is out of scope (no cloaking). The frame-rate rule records the one-tick
 *    difference between Oolite's double clock and this whole-tick compare.
 *  - The coefficients (5471-5487) are recomputed from the stored samples in
 *    seconds, which is exactly what Oolite caches at the last sample.
 */

import { TICKS_PER_SECOND } from "../ai/time.js";
import { add, scale, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import type { Entity } from "../world/entity.js";
import type { WorldView } from "../world/view.js";
import type { World } from "../world/world.js";
import { TRACKING_SAMPLE_TICKS } from "./constants.js";
import { targetBody } from "./target.js";

/** The samples of a started curve (`ShipEntity.m:5436-5439`). */
const SAMPLES = 4;

function copy(v: Vec3): Vec3 {
  return vec(v.x, v.y, v.z);
}

/**
 * `startTrackingCurve` (`ShipEntity.m:5425-5442`): four copies of the target's
 * position, ticks `now`, `now - 60`, `now - 120`, `now - 180`. Does nothing
 * for a ship with no valid target.
 */
export function startTrackingCurve(
  entity: Entity,
  view: WorldView,
  now: number,
): void {
  const target = targetBody(entity, view);
  if (target === undefined) return;
  const steer = entity.steer;
  steer.trackingPositions = [
    copy(target.position),
    copy(target.position),
    copy(target.position),
    copy(target.position),
  ];
  steer.trackingTicks = [
    now,
    now - TRACKING_SAMPLE_TICKS,
    now - 2 * TRACKING_SAMPLE_TICKS,
    now - 3 * TRACKING_SAMPLE_TICKS,
  ];
  steer.trackingCount = SAMPLES;
}

/**
 * Start every curve that `setTarget` left pending (count 0 with a target set)
 * for the steered ships (those with an AI), in ascending id order, at `tick`.
 * `getView` is called only when some ship has a pending start, so a world with
 * none builds no view.
 */
export function startPendingTrackingCurves(
  world: World,
  getView: () => WorldView,
  tick: number,
): void {
  const live = world.store.live;
  for (let i = 0; i < live.length; i += 1) {
    const entity = live[i];
    if (entity === undefined || entity.dead || entity.ai === null) continue;
    if (entity.steer.trackingCount !== 0 || entity.nav.targetId === 0) continue;
    startTrackingCurve(entity, getView(), tick);
  }
}

/**
 * `updateTrackingCurve` (`ShipEntity.m:5444-5470`): take a new sample when
 * `ticks[0] + 60 <= now`, shifting the older ones. Does nothing without a valid
 * target or a started curve.
 */
export function updateTrackingCurve(
  entity: Entity,
  view: WorldView,
  now: number,
): void {
  const steer = entity.steer;
  if (steer.trackingCount !== SAMPLES) return;
  const target = targetBody(entity, view);
  if (target === undefined) return;
  if (steer.trackingTicks[0] + TRACKING_SAMPLE_TICKS > now) return;
  const p = steer.trackingPositions;
  const t = steer.trackingTicks;
  steer.trackingPositions = [copy(target.position), p[0], p[1], p[2]];
  steer.trackingTicks = [now, t[0], t[1], t[2]];
}

/**
 * `calculateTargetPosition` (`ShipEntity.m:5412-5423`): the zero vector for no
 * valid target; otherwise the quadratic through the samples 1 to 3, evaluated
 * `now - ticks[1]` after the sample 1. `calculateTrackingCurve` (5471-5487)
 * gives the coefficients; `t1` and `t2` are the stored spacings in seconds,
 * never 0 and never equal for a started curve.
 *
 * A ship whose curve has not been started (count 0) aims at the target's
 * position; `steerShip` starts a pending curve before it gets here, so this is
 * only a guard for a caller that asks first.
 */
export function calculateTargetPosition(
  entity: Entity,
  view: WorldView,
  now: number,
): Vec3 {
  const target = targetBody(entity, view);
  if (target === undefined) return vec(0, 0, 0);
  const steer = entity.steer;
  if (steer.trackingCount !== SAMPLES) return copy(target.position);
  const ticks = steer.trackingTicks;
  const p1 = steer.trackingPositions[1];
  const p2 = steer.trackingPositions[2];
  const p3 = steer.trackingPositions[3];
  const t1 = (ticks[2] - ticks[1]) / TICKS_PER_SECOND;
  const t2 = (ticks[3] - ticks[1]) / TICKS_PER_SECOND;
  const c1 = add(
    add(scale(p1, -(t1 + t2) / (t1 * t2)), scale(p2, -t2 / (t1 * (t1 - t2)))),
    scale(p3, t1 / (t2 * (t1 - t2))),
  );
  const c2 = add(
    add(scale(p1, 1 / (t1 * t2)), scale(p2, 1 / (t1 * (t1 - t2)))),
    scale(p3, -1 / (t2 * (t1 - t2))),
  );
  const t = (now - ticks[1]) / TICKS_PER_SECOND;
  return add(add(p1, scale(c1, t)), scale(c2, t * t));
}
