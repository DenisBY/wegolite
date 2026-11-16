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
import type { SteerComponent } from "../npc/state.js";
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

/**
 * The weapon record of one entity (FOUND-18, D-07, D-16). Phase 17 writes all
 * three leaves from world ticks, never from frame time.
 *
 * `temperature` is Oolite's `forward_weapon_temp` (`ShipEntity.h:303-304`).
 * Oolite keeps one temperature per facing and cools each of them
 * (`ShipEntity.m:2213-2218`); this record holds only the forward one, the only
 * facing any compiled NPC can mount, because the converter's
 * `STEERING_ASSUMED_ABSENT_KEYS` refusal (plan 15-01) keeps aft, port and
 * starboard weapon types out of the catalogue. Lifting that refusal needs
 * per-facing temperatures and is a snapshot-format change.
 *
 * `lastShotTick` is the integer world tick of the last shot. 0 means "never
 * fired" (the first world tick is 1), and the fire gate must read 0 as ready
 * to fire (Oolite starts `shot_time` at a long-ago value), never as `tick - 0`
 * elapsed. `missedShots` is Oolite's `_missed_shots`.
 */
export interface WeaponComponent {
  temperature: number;
  lastShotTick: number;
  missedShots: number;
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
  /**
   * The energy bank (CBT-07, Oolite's `energy`, `maxEnergy` and
   * `energy_recharge_rate`): a hit drains `energy`, it never exceeds
   * `maxEnergy` and a spawned ship starts at full. Hashed, snapshotted and
   * repaired like every other field.
   *
   * D-02: debris keeps its remaining lifetime here, so `energy` means health
   * for kind "ship" and remaining lifetime for "cargo" and "wreckage". The two
   * meanings are exclusive per kind: only ships are hit candidates and only
   * ships recharge (`src/sim/combat/step.ts`, `rechargeShips` and the
   * hit-candidate filter). Tumble is render-side (D-03) and no contact-guard
   * field exists (D-17).
   */
  energy: number;
  maxEnergy: number;
  energyRechargeRate: number;
  /**
   * The native steering state (AI-01, plan 14-08): rates, sticks, accuracy,
   * frustration and the rest of the record in `../npc/state.ts`. Hashed as the
   * last segment of the entity line, snapshotted under version 3 and repaired by
   * `sanitizeEntity` like every other field.
   */
  steer: SteerComponent;
  /**
   * The drift velocity in m/s (FOUND-18, D-01), independent of `orientation`.
   * Zero for every entity that has none. Written by any phase that applies
   * drift: Phase 16 debris and the blast pushing neighbours, Phase 18 rebounds.
   * Hashed as the optional `;vel:` segment (zero omitted, D-09).
   */
  velocity: Vec3;
  /** The weapon record (D-07, D-16); hashed as the optional `;wpn:` segment. */
  weapon: WeaponComponent;
  /**
   * The cargo capsule count (D-06): an integer 0 to `MAX_ENTITY_CARGO`, chosen
   * at spawn. Hashed as the optional `;cargo:` segment (zero omitted).
   */
  cargo: number;
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
  /** Defaults to `NPC_DEFAULT_MAX_ENERGY`; the entity starts at this energy. */
  maxEnergy?: number;
  /** Defaults to `NPC_DEFAULT_ENERGY_RECHARGE_RATE`. */
  energyRechargeRate?: number;
  /**
   * The escort's slot in its mother's formation, an integer 0 to
   * `MAX_ESCORT_SLOT` (Oolite `MAX_ESCORTS` 16). Defaults to 0.
   */
  escortSlot?: number;
  /**
   * The cargo capsule count (D-06), an integer 0 to `MAX_ENTITY_CARGO`.
   * Defaults to 0; the populator sets it (plan 15-03).
   */
  cargo?: number;
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
 * The energy of the damageable statics (FOUND-18, D-08): one value per static,
 * named by its `StaticLayoutKey`. A pristine world holds the maxima
 * (`STATION_MAX_ENERGY`, `BUOY_MAX_ENERGY`) and hashes it as nothing; a damaged
 * static adds one `staticHealth:` line (D-09). Statics never enter the entity
 * store, so the kill path can never remove the station or a buoy (D-13).
 *
 * Three limits of the design:
 *  - it holds energy only, and a buoy recharges (`energy_recharge_rate` 2,
 *    `shipdata.plist:1018`), so a damaged buoy that recharges to its maximum is
 *    pristine again and its `staticHealth:` line disappears, which is correct
 *    (Phase 18 consumes it);
 *  - a repair by `sanitizeStaticHealth` is not counted in any hashed counter
 *    (`Entity.repairs` counts entity repairs only, so the acceptance run's
 *    `repairs 0` does not cover static health);
 *  - a non-finite value is healed to the maximum, a deliberate choice that
 *    keeps the world hashable.
 */
export interface StaticHealth {
  station: number;
  witchpoint: number;
  navBuoy: number;
}

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
