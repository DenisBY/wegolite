// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The read side of the AI seam (FOUND-13, D-06, D-07; ARCHITECTURE section 7.3).
 *
 * Types only: AI code reads the world through `WorldView` and nothing else, so
 * the AI lint zone (plan 08-09) can allow this module and `./ids.js` without
 * allowing the world, the store or the flight state. Every object a view
 * returns is a fresh plain copy, so a caller cannot mutate the world, the
 * layout or the player through it. The interface is deliberately narrow
 * (Pitfall 19): a method is added only when a later phase needs it, and the
 * member set is pinned by an exhaustive `Record<keyof WorldView, true>` in
 * `tests/sim/world/view.test.ts`.
 *
 * Per-world id scope (CONTEXT D-06 as amended 2026-11-12): every id the view
 * takes or returns belongs to the view's own world. `isValid`, `body` and
 * `ship` answer for that world only, and an id returned by `scan` means
 * something only in the world that issued it. An AI keeps an id only inside its
 * own `AiComponent`, never across worlds.
 */

import type { Quat, Vec3 } from "../math.js";
import type { BehaviourId, BodyKind, EntityId, ScanClass } from "./ids.js";

/** What any entity looks like from outside: a pose and its classification. */
export interface BodyView {
  readonly id: EntityId;
  readonly kind: BodyKind;
  readonly scanClass: ScanClass;
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly speed: number;
  /**
   * The body's collision radius in metres (Oolite's `collision_radius`). For
   * the player it is the hull collision radius the caller passes to
   * `createWorldView`, else 0.
   */
  readonly radius: number;
}

/** A dynamic entity: a body plus its navigation state. */
export interface ShipView extends BodyView {
  readonly behaviour: BehaviourId;
  readonly targetId: EntityId;
  readonly destination: Vec3;
  readonly desiredRange: number;
  readonly desiredSpeed: number;
  /**
   * The read side of the roster state (Phase 21, FOUND-20); every member is
   * read from the entity at call time and written only by its owner.
   *
   * `bounty`: `Entity.bounty`, Oolite's `bounty`; the police scan reads it
   * (Phase 25).
   */
  readonly bounty: number;
  /** `Entity.role`: the resolved role, "" when unset; the AI and comms read it (Phases 22, 23). */
  readonly role: string;
  /** `Entity.groupId`: the group's founding leader id, 0 for none; `groupLeader` resolves it (Phase 23). */
  readonly groupId: EntityId;
  /** `Entity.energy`: the ship's current energy (the hit-reaction stage reports it too). */
  readonly energy: number;
  /** `Entity.maxEnergy`: the ship's energy ceiling; the AI's flee thresholds read it (Phase 23). */
  readonly maxEnergy: number;
  /** `Entity.cargo`: the cargo capsule count; the pirate's pick of prey reads it (Phase 23). */
  readonly cargo: number;
  /** `Entity.steer.accuracy`: the resolved laser accuracy (-5 to 5), or the unresolved sentinel. */
  readonly accuracy: number;
  /** `Entity.steer.escortSlot`: the formation slot, an integer from 0. */
  readonly escortSlot: number;
  /** `Entity.ownerId`: the owning ship (an escort's leader, a pod's source), `NO_ENTITY` for none. */
  readonly ownerId: EntityId;
}

/**
 * The player's legal standing as the view reports it: a copy, so a caller
 * cannot write the combat state through it. Structurally the `PlayerStanding`
 * of `../combat/state.ts`, declared here so this module stays types-only.
 */
export interface StandingView {
  readonly legalStatus: number;
  readonly kills: number;
}

/** Optional narrowing for `scan`. */
export interface ScanFilter {
  /** Keep only bodies of these kinds. Absent keeps every kind. */
  readonly kinds?: readonly BodyKind[];
}

export interface WorldView {
  /** The simulation tick the view was created at. */
  readonly tick: number;
  readonly playerId: EntityId;
  /** True exactly when `body(id)` is defined. */
  isValid(id: EntityId): boolean;
  /** Statics 1-5, the player 100 and live dynamic entities; else undefined. */
  body(id: EntityId): BodyView | undefined;
  /** Live dynamic entities only; else undefined. */
  ship(id: EntityId): ShipView | undefined;
  /**
   * Every body other than `self` within `range` metres of it (inclusive),
   * ordered by distance and then ascending id. Empty for an invalid `self` or a
   * non-finite or negative `range`.
   */
  scan(self: EntityId, range: number, filter?: ScanFilter): readonly EntityId[];
  mainStation(): EntityId;
  mainPlanet(): EntityId;
  sun(): EntityId;
  /**
   * The player's legal standing (`PlayerCombatState.standing`) as given to
   * `createWorldView`, a fresh copy on every call; pristine
   * (`{ legalStatus: 0, kills: 0 }`) when the view was made without one. The
   * police scan and the offence rules read it (Phase 25).
   */
  playerStanding(): StandingView;
  /**
   * The leader of the `World.groups` record with this id, `NO_ENTITY` for an
   * unknown or malformed id (Phase 23's group AI events).
   */
  groupLeader(groupId: EntityId): EntityId;
}
