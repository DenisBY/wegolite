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
}

/** A dynamic entity: a body plus its navigation state. */
export interface ShipView extends BodyView {
  readonly behaviour: BehaviourId;
  readonly targetId: EntityId;
  readonly destination: Vec3;
  readonly desiredRange: number;
  readonly desiredSpeed: number;
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
}
