// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The write side of the AI seam (FOUND-13, D-06; ARCHITECTURE section 7.3).
 *
 * Types only. A `ShipControl` is created for one actor in one world
 * (`createShipControl` in `./control-impl.ts`); every method is addressed by id
 * as the architecture specifies, but a call whose id is not the actor, or whose
 * argument lies outside the shared serialised domain of `./limits.ts`, is
 * ignored. The member set is pinned by an exhaustive
 * `Record<keyof ShipControl, true>` in `tests/sim/world/control.test.ts`
 * (Pitfall 19).
 *
 * Per-world id scope (CONTEXT D-06 as amended 2026-11-12): both the actor id and
 * a `setTarget` target are ids of the control's own world. The control writes
 * only to its own world, and an id means something only in the world that
 * issued it.
 */

import type { Facing } from "../combat/mounts.js";
import type { Vec3 } from "../math.js";
import type { BehaviourId, EntityId } from "./ids.js";

export interface ShipControl {
  /** Set the actor's target entity id (0 clears it). */
  setTarget(id: EntityId, target: EntityId): void;
  setDestination(id: EntityId, destination: Vec3): void;
  setDesiredRange(id: EntityId, range: number): void;
  setDesiredSpeed(id: EntityId, speed: number): void;
  perform(id: EntityId, behaviour: BehaviourId): void;
  /** Ask to be woken `ticks` ticks from now; the earlier wake wins. */
  scheduleWake(id: EntityId, ticks: number): void;
  /**
   * Queue one shot of the actor's `facing` weapon (CBT-07, Pitfall 19; fore when
   * omitted). The shot is not resolved here: the world fire queue is drained
   * once per tick after the world step, at the one fixed point where every shot
   * of the tick is resolved by the same hit rule and the same damage function
   * the player's shots use. A call for any entity but the actor, a facing that
   * is not one of the four, and a second call by the same actor for the same
   * facing in the same tick, are ignored; a fore and an aft call in one tick
   * queue two requests. An AI asking for aft, port or starboard fire is
   * Phase 23 (CBT-19): nothing in Phase 21 does.
   */
  fire(id: EntityId, facing?: Facing): void;
}
