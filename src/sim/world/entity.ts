// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The entity records of the world model (FOUND-11, D-04, D-06, D-07).
 *
 * A dynamic `Entity` is plain data: no class instance, no closure, no `Map`,
 * so a world holding entities can be hashed and snapshotted. The static bodies
 * (planet, sun, main station, both buoys) are `StaticEntity` records that
 * reference `SystemLayout` by key and copy no geometry (PITFALLS 17).
 */

import type { AiComponent } from "../ai/types.js";
import type { Quat, Vec3 } from "../math.js";
import type { BehaviourId, EntityId, EntityKind, ScanClass } from "./ids.js";
import type { Body, SystemLayout } from "./layout.js";

/** Navigation state: what the entity is doing and where it is heading. */
export interface NavComponent {
  behaviour: BehaviourId;
  targetId: EntityId;
  destination: Vec3;
  desiredRange: number;
  desiredSpeed: number;
}

/** One uint32 stream state per `ENTITY_RNG_PURPOSES` entry (D-04). */
export interface EntityStreams {
  ai: number;
  combat: number;
}

/** A dynamic entity. `id` never changes; everything else is simulation state. */
export interface Entity {
  readonly id: EntityId;
  readonly kind: EntityKind;
  dead: boolean;
  position: Vec3;
  orientation: Quat;
  radius: number;
  speed: number;
  scanClass: ScanClass;
  specKey: string;
  ownerId: EntityId;
  spawnTick: number;
  rng: EntityStreams;
  nav: NavComponent;
  ai: AiComponent | null;
  repairs: number;
}

/** What a caller supplies to spawn an entity. */
export interface SpawnInit {
  kind: EntityKind;
  specKey: string;
  scanClass: ScanClass;
  position: Vec3;
  orientation: Quat;
  radius: number;
  speed?: number;
  ownerId?: EntityId;
  ai?: AiComponent | null;
}

/**
 * The keys of `SystemLayout` whose value is a `Body`: exactly "planet", "sun",
 * "station", "navBuoy" and "witchpoint". Derived, so a renamed layout field
 * fails typecheck here.
 */
export type StaticLayoutKey = {
  [K in keyof SystemLayout]: SystemLayout[K] extends Body ? K : never;
}[keyof SystemLayout];

/**
 * A static body as a world entity (D-06, D-07): a fixed id plus a reference
 * into the layout. Deliberately no position, radius or orientation field:
 * `SystemLayout` stays the single authority.
 */
export interface StaticEntity {
  readonly id: EntityId;
  readonly kind: "planet" | "sun" | "station" | "buoy";
  readonly scanClass: ScanClass;
  readonly layoutKey: StaticLayoutKey;
}
