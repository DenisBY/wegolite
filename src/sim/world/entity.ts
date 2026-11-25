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

/**
 * The merchantman cargo kinds (FOUND-20): the index stored in `Entity.cargoKind`
 * (0 = unset), mapped to Oolite's `OOCargoFlag` (`OOTypes.h:100-108`):
 *
 *  - 1 `plentiful` = `CARGO_FLAG_FULL_PLENTIFUL` 501 (`PLENTIFUL_GOODS`)
 *  - 2 `scarce` = `CARGO_FLAG_FULL_SCARCE` 502 (`SCARCE_GOODS`)
 *  - 3 `medical` = `CARGO_FLAG_FULL_MEDICAL` 503 (`MEDICAL_GOODS`)
 *  - 4 `contraband` = `CARGO_FLAG_FULL_CONTRABAND` 504 (`ILLEGAL_GOODS`)
 *  - 5 `pirate` = `CARGO_FLAG_PIRATE` 505 (`PIRATE_GOODS`)
 *  - 6 `uniform` = `CARGO_FLAG_FULL_UNIFORM` 510
 *
 * `CARGO_FLAG_NONE` (400), `CARGO_FLAG_CANISTERS` (600) and
 * `CARGO_FLAG_FULL_PASSENGERS` (700) have no index: Oolite releases no
 * commodity pod for them and no in-scope `setCargoType` call uses them
 * (`OOJSShip.m:2924-2930` accepts only the five `*_GOODS` names above), so
 * "unset" covers them. Append-only: an index is never renumbered.
 */
export const CARGO_KINDS = Object.freeze([
  "unset",
  "plentiful",
  "scarce",
  "medical",
  "contraband",
  "pirate",
  "uniform",
] as const);

export type CargoKindName = (typeof CARGO_KINDS)[number];

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
   * `energy` means health for kinds "ship" and "cargo" and remaining lifetime
   * for "wreckage" (D-02). A pod or plate (kind "cargo", energy 1, which never
   * expires) is a laser candidate from Phase 18 (D-07, plan 18-15) and dies at
   * 0 like a ship; only wreckage keeps a lifetime here, and a wreck is never a
   * hit candidate. Only ships recharge (`src/sim/combat/step.ts`,
   * `rechargeShips` and the hit-candidate filter). Tumble is render-side
   * (D-03) and no contact-guard field exists (D-17).
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
  /**
   * The ship's bounty (FOUND-20, snapshot v5): an integer 0 to `MAX_BOUNTY`,
   * Oolite's `bounty` (`ShipEntity.h:289`). Set at spawn by Phase 22's
   * populator and read by the police scan in Phase 25. Hashed as the optional
   * `;bty:` segment (zero omitted).
   */
  bounty: number;
  /**
   * The ship's resolved role (FOUND-20): 0 to `MAX_ROLE_LENGTH` characters of
   * `[a-z0-9-]`, "" when unset. Oolite's per-ship role (`primaryRole`); set by
   * Phase 22's populator and read by the AI and the comms tables. Hashed as the
   * optional `;role:` segment ("" omitted).
   */
  role: string;
  /**
   * The founding leader's entity id of the ship's group, 0 for none (FOUND-20).
   * Membership is derived by scanning the live ships for the id; plan 21-06's
   * `World.groups` holds the leader record. A non-zero value is a dynamic id
   * (101 and up). Hashed as the optional `;grp:` segment (0 omitted).
   */
  groupId: EntityId | 0;
  /**
   * Oolite's `cargo_flag` for a merchantman (FOUND-20): an index into
   * `CARGO_KINDS`, 0 = unset. Phase 22 sets it, plan 21-14's release reads it.
   * Hashed as the optional `;ck:` segment (0 omitted).
   */
  cargoKind: number;
  /**
   * A pod's contents (FOUND-20): a commodity key (0 to
   * `MAX_COMMODITY_KEY_LENGTH` characters of `[a-z0-9_]`, "" none) and an
   * integer amount 0 to `MAX_POD_AMOUNT`. Set only on cargo entities, by plan
   * 21-14's release. Hashed as one optional `;pod:` segment, printed whenever
   * either part is not pristine, so pristine-omit never hides a difference.
   */
  podCommodity: string;
  podAmount: number;
  /**
   * The ship's fuel (FOUND-20), an integer 0 to `MAX_SHIP_FUEL`: Oolite's
   * `fuel` (`ShipEntity.m:555`), which serves both witchspace jumps and
   * injectors; the populator sets `fuel = 7` on traders without injectors
   * (`oolite-populator.js:1394`, `:1683`). Hashed as the optional `;fuel:`
   * segment (0 omitted).
   */
  fuel: number;
  /**
   * The galaxy-local system indices the populator sets at spawn
   * (`oolite-populator.js:1391-1400` and others), -1 unset, else an integer 0
   * to `MAX_SYSTEM_INDEX` (FOUND-20). Set by Phase 22's populator while the
   * ships are still inert, read by Phase 23's AI. Hashed as one optional
   * `;sys:` segment, printed whenever either is not -1.
   */
  homeSystem: number;
  destinationSystem: number;
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
  /**
   * The initial drift velocity in m/s (D-01): each component finite with a
   * magnitude at most `MAX_ENTITY_VELOCITY`. Defaults to the zero vector;
   * Phase 16 debris sets it (`./debris.ts`).
   */
  velocity?: Vec3;
  /**
   * The ship's bounty (FOUND-20), an integer 0 to `MAX_BOUNTY`. Defaults to 0;
   * Phase 22's populator sets it.
   */
  bounty?: number;
  /** The resolved role (FOUND-20): `[a-z0-9-]`, at most `MAX_ROLE_LENGTH`. Defaults to "". */
  role?: string;
  /** The group's founding leader id (FOUND-20): 0 or a dynamic id. Defaults to 0. */
  groupId?: EntityId;
  /** An index into `CARGO_KINDS` (FOUND-20). Defaults to 0 (unset). */
  cargoKind?: number;
  /**
   * A pod's commodity key (FOUND-20): `[a-z0-9_]`, at most
   * `MAX_COMMODITY_KEY_LENGTH`. Defaults to "".
   */
  podCommodity?: string;
  /** A pod's amount (FOUND-20), an integer 0 to `MAX_POD_AMOUNT`. Defaults to 0. */
  podAmount?: number;
  /** The ship's fuel (FOUND-20), an integer 0 to `MAX_SHIP_FUEL`. Defaults to 0. */
  fuel?: number;
  /** The home system index (FOUND-20): -1 or 0 to `MAX_SYSTEM_INDEX`. Defaults to -1. */
  homeSystem?: number;
  /** The destination system index (FOUND-20): -1 or 0 to `MAX_SYSTEM_INDEX`. Defaults to -1. */
  destinationSystem?: number;
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
 * The moving and damageable state of one buoy (Phase 18, PD-01, PD-02), part of
 * the owner-approved amendment of the version-4 world snapshot field set.
 *
 *  - `offset`: the buoy's displacement from its layout position in metres
 *    (PD-02, buoys move when rammed). Stored as an offset so that "pristine"
 *    needs no layout; the orientation stays the tumble function of the flight
 *    clock, because Oolite's collision response turns no buoy.
 *  - `velocity`: the buoy's drift in m/s (PD-02), braked by the drift stage.
 *  - `subentityEnergy`: the energy of the buoy's frangible subentity (PD-01),
 *    Oolite's default `max_energy` 200 (`ShipEntity.m:291`); 0 means the
 *    subentity is detached.
 *  - `subentityTakingDamage`: Oolite's sticky `subEntityTakingDamage` routing
 *    (`ShipEntity.m:1234-1257`). Oolite sets it when a laser's winning part is a
 *    subentity (`Universe.m:5634-5636`), keeps it through later hull hits, and
 *    clears it only when the subentity dies or is released
 *    (`ShipEntity.m:1041`, `1245-1247`, `8187-8188`, `8199-8200`); so it is
 *    never true while `subentityEnergy` is 0.
 *
 * A pristine buoy (zero offset and velocity, energy 200, flag false) adds
 * nothing to the hash or the snapshot.
 */
export interface BuoyState {
  offset: Vec3;
  velocity: Vec3;
  subentityEnergy: number;
  subentityTakingDamage: boolean;
}

/** The state of the two buoys, named by their `StaticLayoutKey`. */
export interface BuoyStates {
  witchpoint: BuoyState;
  navBuoy: BuoyState;
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
