// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `steerShip`: one native update of one ship (AI-01, plan 14-09), the port of
 * Oolite's `processBehaviour:` (`ShipEntity.m:2485-2638`).
 *
 * The steering contract every behaviour of the phase plugs into:
 *
 *  - `steerShip(entity, ctx)` takes ONE `SteerContext { view, stats, dt, draw,
 *    emit }` and passes it unchanged to every behaviour and helper, so a helper
 *    that posts an event or draws never needs a new parameter. Behaviours and
 *    helpers take `(entity, ctx)` plus their own Oolite arguments.
 *  - It reads other bodies only through `ctx.view` and writes only the steered
 *    entity (`entity.nav`, `entity.steer`, `entity.speed`, `entity.orientation`,
 *    `entity.position`). World-level writes such as the escort leader refresh
 *    happen in the world step.
 *  - Order inside one call: (1) resolve the accuracy once when it is still the
 *    sentinel; (2) complete the pending `perform` entry for the current
 *    behaviour and clear the flag; (3) the reaction-time tracking-curve sample
 *    (plan 14-12, `ShipEntity.m:2131`); (4) the behaviour from the
 *    switch below; (5) `applyAttitude` then `applyThrust` when Oolite's flag
 *    for that behaviour is set.
 *  - Randomness: `ctx.draw()` returns the next unit draw of the actor's own
 *    `combat` stream; one unit draw per `randf()`, `floor(u * N)` for
 *    `ranrot_rand() % N`.
 *  - `frustration` and `successFactor` are GLfloat in Oolite
 *    (`ShipEntity.h:337`), so EVERY write to `steer.frustration` and
 *    `steer.successFactor` in any behaviour or helper is `Math.fround(value)`.
 *    That makes every threshold event fire on the oracle's tick (0.5 s at tick
 *    61, 15 s at tick 1801).
 *  - A zero-length vector normalises to the zero vector, as Oolite's
 *    `vector_normal` does (`OOVector.h:270-273`), never to NaN: use
 *    `normalizeVec` from `../math.js`.
 *  - Frame: Wegolite's local forward is -Z. Every literal Oolite fallback vector
 *    built from `kBasisZVector` or `z = 1.0`, and every escort pattern vector,
 *    has its z negated.
 *  - There is no try/catch: steering must be total (fault containment is for AI
 *    modules only), asserted by `tests/sim/npc/steering.property.test.ts`.
 *
 * The behaviours not ported yet and every id outside the scope of the phase run
 * Oolite's `behaviour_idle:` and the thrust ramp (the recorded fallback; it
 * never throws). Two differences from Oolite, for plan 14-19's list: Oolite
 * turns the attitude step and the thrust off for TRACK_AS_TURRET and
 * ENERGY_BOMB_COUNTDOWN (`applyThrust = NO`, 2614 and 2628), and moves TRACTORED
 * ships by its own rule (2505-2507); this fallback reproduces neither.
 */

import type { AiEventName } from "../ai/types.js";
import type { Entity } from "../world/entity.js";
import type { EntityId } from "../world/ids.js";
import type { WorldView } from "../world/view.js";
import { behaviourAttackTarget } from "./behaviours/attack.js";
import {
  behaviourAttackFlyFromTarget,
  behaviourAttackFlyToTarget,
} from "./behaviours/attack-close.js";
import { behaviourEvasiveAction } from "./behaviours/evasive.js";
import { behaviourFaceDestination } from "./behaviours/face-destination.js";
import { behaviourFleeTarget } from "./behaviours/flee.js";
import {
  behaviourFlyFromDestination,
  behaviourFlyRangeFromDestination,
  behaviourFlyToDestination,
} from "./behaviours/fly-to-destination.js";
import { behaviourIdle, behaviourStopStill } from "./behaviours/idle.js";
import { behaviourInterceptTarget } from "./behaviours/intercept.js";
import { behaviourTumble } from "./behaviours/tumble.js";
import { completeEntry, resolveAccuracy } from "./enter.js";
import { applyAttitude, applyThrust } from "./flight.js";
import type { NpcFlightStats } from "./stats.js";
import { startTrackingCurve, updateTrackingCurve } from "./tracking-curve.js";

/** One event the steering posts: a name and, for some, an entity id. */
export interface SteerEvent {
  readonly name: AiEventName;
  readonly a?: EntityId;
}

/** Everything one native update may use. */
export interface SteerContext {
  /** The read side; `view.tick` is the current tick. */
  readonly view: WorldView;
  /** The steered ship's flight stats. */
  readonly stats: NpcFlightStats;
  /** The step in seconds. */
  readonly dt: number;
  /** The next unit draw of the actor's own `combat` stream. */
  readonly draw: () => number;
  /** Post an event to the actor's own AI. */
  readonly emit: (event: SteerEvent) => void;
}

/**
 * One native update of `entity` (`processBehaviour:`, `ShipEntity.m:2485-2638`).
 * Never throws for a domain-valid entity.
 */
export function steerShip(entity: Entity, ctx: SteerContext): void {
  // (1) the lazy accuracy draw
  resolveAccuracy(entity, ctx);
  // (2) the deferred part of a pending perform entry
  if (entity.steer.entryPending) completeEntry(entity, ctx);
  // (3) the reaction-time tracking curve (`ShipEntity.m:2131`): a pending start
  // first (a defensive guard; the world step normally started it after the
  // think), then the sample. Both do nothing without a valid target.
  if (entity.steer.trackingCount === 0) {
    startTrackingCurve(entity, ctx.view, ctx.view.tick);
  }
  updateTrackingCurve(entity, ctx.view, ctx.view.tick);

  // (4) the behaviour
  switch (entity.nav.behaviour) {
    case "TUMBLE":
      behaviourTumble(entity, ctx);
      break;
    case "STOP_STILL":
    case "STATION_KEEPING":
      behaviourStopStill(entity, ctx);
      break;
    case "IDLE":
      behaviourIdle(entity, ctx);
      break;
    case "FLY_RANGE_FROM_DESTINATION":
      behaviourFlyRangeFromDestination(entity, ctx);
      break;
    case "FLY_TO_DESTINATION":
      behaviourFlyToDestination(entity, ctx);
      break;
    case "FLY_FROM_DESTINATION":
    case "FORMATION_BREAK": // shares fly-from (ShipEntity.m:2604-2607)
      behaviourFlyFromDestination(entity, ctx);
      break;
    case "FACE_DESTINATION":
      behaviourFaceDestination(entity, ctx);
      break;
    case "INTERCEPT_TARGET":
      behaviourInterceptTarget(entity, ctx);
      break;
    case "FLEE_TARGET":
      behaviourFleeTarget(entity, ctx);
      break;
    case "EVASIVE_ACTION":
    case "FLEE_EVASIVE_ACTION": // both run behaviour_evasive_action (2575-2578)
      behaviourEvasiveAction(entity, ctx);
      break;
    case "ATTACK_TARGET":
      behaviourAttackTarget(entity, ctx);
      break;
    case "ATTACK_FLY_TO_TARGET":
      behaviourAttackFlyToTarget(entity, ctx);
      break;
    case "ATTACK_FLY_FROM_TARGET":
      behaviourAttackFlyFromTarget(entity, ctx);
      break;
    default:
      // The recorded fallback for every id not ported yet or out of scope.
      behaviourIdle(entity, ctx);
      break;
  }

  // (5) the attitude step and the thrust ramp (the `applyThrust = YES` default)
  applyAttitude(entity, ctx.dt);
  applyThrust(entity, ctx.stats, ctx.dt);
}
