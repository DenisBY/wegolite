// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_evasive_action:` (AI-01, plan 14-13; `ShipEntity.m:3996-4036`) for
 * both BEHAVIOUR_EVASIVE_ACTION and BEHAVIOUR_FLEE_EVASIVE_ACTION (the switch at
 * 2575-2578 routes both here).
 *
 * Fly at full speed (no afterburner: `canBurn` is false), steer away from any
 * proximity alert (4013-4016, the target not ignored), otherwise roll and pitch
 * at full rate (`evasiveAction:`), and after 0.5 s of that hand over: a
 * FLEE_EVASIVE_ACTION ship gets a new 400 jink and returns to FLEE_TARGET, an
 * EVASIVE_ACTION ship goes to ATTACK_TARGET (4021-4028). The behaviour's own
 * `fireMainWeapon:` call (4035) is not ported: NPCs do not fire in v2.2.
 *
 * `evasiveAction:` returns void, so after `noteLostTargetAndGoIdle` for a gone
 * target this method carries on, as Oolite's does: the frustration is bumped
 * and the (now IDLE) ship takes the `else` branch to ATTACK_TARGET once it
 * passes 0.5.
 */

import type { Entity } from "../../world/entity.js";
import { avoidCollision, proximityAlertBody } from "../avoid.js";
import { EVASIVE_FRUSTRATION_LIMIT, EVASIVE_JINK_Z } from "../constants.js";
import type { SteerContext } from "../dispatch.js";
import { evasiveAction, setEvasiveJink } from "../track.js";

export function behaviourEvasiveAction(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  nav.desiredSpeed = ctx.stats.maxFlightSpeed;

  if (proximityAlertBody(entity, ctx) !== undefined) {
    avoidCollision(entity, ctx);
    return;
  }

  evasiveAction(entity, ctx);

  steer.frustration = Math.fround(steer.frustration + ctx.dt);

  if (steer.frustration > EVASIVE_FRUSTRATION_LIMIT) {
    if (nav.behaviour === "FLEE_EVASIVE_ACTION") {
      setEvasiveJink(entity, ctx, EVASIVE_JINK_Z);
      nav.behaviour = "FLEE_TARGET";
    } else {
      nav.behaviour = "ATTACK_TARGET";
    }
  }
}
