// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The debris a destroyed ship releases (WORLD-17, CBT-08 destruction clauses,
 * staged): Oolite's `releaseCargoPodsDebris` (`ShipEntity.m:7814-7879`), called
 * from `becomeExplosion` (`ShipEntity.m:7891-8143`), ported onto the one kill
 * path (`./kill.ts`, D-02).
 *
 * Port conventions (`./placement.ts` precedent): Oolite's `Ranrot() % N` and
 * `ranrot_rand() % N` are `Math.floor(u * N)` and `randf()` is `u`, with
 * `u = rngNext(stream)`.
 *
 * Draw order (D16-12). Every value comes from one local copy of the victim's
 * own `combat` stream, written back at the end, in one fixed order:
 *
 * 1. the `canFragment` roll, `u < fragmentChance` (D16-13: rolled here as the
 *    first draw, not at ship setup as Oolite does at `ShipEntity.m:372`, so no
 *    new hashed field is needed);
 * 2. the pods, in capsule index order: one survival draw per capsule examined,
 *    then 13 draws per survivor (box x, y, z; jitter x, y, z; velocity x, y, z;
 *    quaternion w, x, y, z).
 *
 * Plan 16-04 appends the wreckage, the alloy plate and the blast after the pods,
 * so no pod value moves. Every draw of a piece is taken before its spawn is
 * attempted and no draw depends on a spawn's result, so a refused spawn (the cap
 * gate below, or any `spawnEntity` refusal) never changes a later value or
 * `nextId` (Pitfall 1).
 *
 * Draws for features not modelled are not taken (D16-24): Oolite's commodity,
 * amount and 50 % pod role roll (`Universe.m:3863-3878`, `3977-3996`) and
 * `randomEjectaTemperature` (`ShipEntity.m:7562-7582`). Every pod is one
 * anonymous `barrel` cargopod (D16-01, OC-1).
 *
 * Records (D16-15): a pod is kind `cargo`, scan class `CLASS_CARGO`, max energy
 * 1, no recharge, no AI, speed 0, the pod model's radius. Its position is the
 * victim position plus a random point of the victim's bounding box (Oolite model
 * axes, converted by `toWegoliteLocal`) added unrotated, as Oolite does (D16-18),
 * plus a -3..3 m jitter per world axis. Its velocity is the drawn kick plus the
 * victim's drift `velocity`, never its flight `speed` (D-01). Pods drift in
 * `stepDebris` (`./step.ts`, D16-19) and never expire (D16-06).
 *
 * Debris is no laser, ident, scanner, mass-lock or jump-blockage candidate in
 * this phase (D16-03, OC-3): the existing `kind === "ship"` and
 * `NON_LOCKING_SCAN_CLASSES` filters already exclude it.
 *
 * Total (D-15): missing content, an unknown spec key, a non-integer cargo count
 * or degenerate numbers never throw and never put an out-of-domain value into
 * the hash; a bad value either takes its draws and lets `spawnEntity` refuse, or
 * is replaced by a neutral one before the write. No try/catch.
 */

import { toWegoliteLocal } from "../combat/constants.js";
import type { HullTable } from "../combat/hit.js";
import { vec } from "../math.js";
import type { Vec3 } from "../math.js";
import { createRngState, rngNext } from "../rng.js";
import type { RngState } from "../rng.js";
import type { Entity } from "./entity.js";
import { MAX_ENTITIES } from "./ids.js";
import { MAX_ENTITY_CARGO, MAX_ENTITY_VELOCITY } from "./limits.js";
import { randomQuaternion } from "./placement.js";
import { spawnEntity } from "./world.js";
import type { World } from "./world.js";

/** One debris model: its shipdata key, mass in kg and collision radius in m. */
export interface DebrisModel {
  readonly key: string;
  readonly mass: number;
  readonly radius: number;
}

/** An axis-aligned bounding box in Oolite's model axes (metres). */
export interface DebrisBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** What the release reads of a dying ship's hull, keyed by its spec key. */
export interface DebrisHull {
  /** The hull mass in kg (plan 16-04: alloy count and wreck mass). */
  readonly mass: number;
  /** `fragment_chance` (default 0.9, `ShipEntity.m:372`). */
  readonly fragmentChance: number;
  /** The model's bounding box in Oolite's model axes. */
  readonly boundingBox: DebrisBox;
}

/** The compiled debris content the app supplies (absent with traffic off). */
export interface DebrisContent {
  readonly hulls: ReadonlyMap<string, DebrisHull>;
  /** The cargo pod (`barrel`). */
  readonly pod: DebrisModel;
  /** The alloy plate (`alloy`, plan 16-04). */
  readonly plate: DebrisModel;
  /** The wreckage models (plan 16-04). */
  readonly wrecks: readonly DebrisModel[];
}

/** The per-kill context `killShip` receives (`../combat/step.ts` builds it). */
export interface DebrisContext {
  /** The tick the debris spawns on (`spawnTick`). */
  readonly tick: number;
  readonly content: DebrisContent;
  /** The hull octrees, read by plan 16-04 for wreckage placement. */
  readonly octrees?: HullTable;
}

/** The first pod's survival chance in percent (`ShipEntity.m:7823`). */
export const POD_CARGO_CHANCE_START = 70;

/** The chance lost per survivor for an NPC (`ShipEntity.m:7838`). */
export const POD_CARGO_CHANCE_STEP = 30;

/** The chance is reduced only while above this (`ShipEntity.m:7834`). */
export const POD_CARGO_CHANCE_FLOOR = 10;

/** The most pods one explosion releases (`ShipEntity.m:7826`, `7875`). */
export const POD_LIMIT = 15;

/** Oolite's `speed_low` (`ShipEntity.m:7820`): the kick spans 0..199 - 100. */
export const DEBRIS_SPEED_LOW = 200;

/** The kick scale in m/s per unit (`ShipEntity.m:7856-7858`). */
export const DEBRIS_SPEED_SCALE = 0.1;

/** The jitter draw range per axis (`ShipEntity.m:7852-7854`), offset by 3. */
export const DEBRIS_JITTER_RANGE = 7;

/** A pod's and a plate's `max_energy` (`shipdata.plist:625` and `:197`). */
export const DEBRIS_MAX_ENERGY = 1;

/**
 * The `fragment_chance` default (`ShipEntity.m:372`), as the float the compiled
 * records carry.
 */
export const DEFAULT_FRAGMENT_CHANCE = Math.fround(0.9);

/**
 * The live-entity limit below which a pod or plate spawns: Oolite's
 * `n_entities < 0.95 * UNIVERSE_MAX_ENTITIES` (`ShipEntity.m:7939`) scaled to
 * the cap of 256 (owner decision "243 and 128"), 243.2. With the strict `<`,
 * a piece spawns while at most 243 entities are live, so debris alone never
 * takes the live count above 244 (D16-05).
 *
 * Divergences, recorded: the gate is tested before each piece, after its draws,
 * where Oolite tests once per explosion (and still adds one plate above the
 * limit, `ShipEntity.m:8077-8080`); Oolite's frame-time term
 * `[UNIVERSE getTimeDelta] < 0.125` and its `isVisible` or scanner-range test
 * are dropped (the gate reads world state only, so it is identical at every
 * cadence; research A9). Only live dynamic entities count: the victim is
 * already dead, statics and the player are not in the store and render effects
 * are not entities. There is no eviction (D16-06): pods and plates never expire,
 * a full world only sheds new debris and a launch or jump replaces the world.
 */
export const DEBRIS_ENTITY_LIMIT = 0.95 * MAX_ENTITIES;

/**
 * The live-entity limit below which a wreck spawns (`ShipEntity.m:8047`,
 * `0.5 * UNIVERSE_MAX_ENTITIES`), 128: wreckage spawns while at most 127
 * entities are live. Used by plan 16-04.
 */
export const WRECKAGE_ENTITY_LIMIT = 0.5 * MAX_ENTITIES;

/** Draws per surviving pod: box 3, jitter 3, velocity 3, quaternion 4. */
export const POD_DRAWS_PER_SURVIVOR = 13;

/** A component inside the velocity domain: finite, clamped, never -0. */
function clampComponent(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v > MAX_ENTITY_VELOCITY) return MAX_ENTITY_VELOCITY;
  if (v < -MAX_ENTITY_VELOCITY) return -MAX_ENTITY_VELOCITY;
  return v === 0 ? 0 : v;
}

/**
 * `v` inside the sanitiser's velocity domain: per component a non-finite value
 * becomes 0, a magnitude beyond `MAX_ENTITY_VELOCITY` is clamped to
 * `±MAX_ENTITY_VELOCITY` and -0 becomes 0, so a released piece needs no repair.
 */
export function clampDebrisVelocity(v: Vec3): Vec3 {
  return vec(clampComponent(v.x), clampComponent(v.y), clampComponent(v.z));
}

/** A finite number, or `fallback`. */
function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

/** A box sample on one axis: `min + u * (max - min)` (`OOVector.m:107-113`). */
function boxAxis(min: number, max: number, u: number): number {
  const lo = finiteOr(min, 0);
  const hi = finiteOr(max, 0);
  const sample = lo + u * (hi - lo);
  return Number.isFinite(sample) ? sample : 0;
}

/** A jitter of -3..3 m: `(ranrot_rand() % 7) - 3`. */
function jitter(stream: RngState): number {
  return Math.floor(rngNext(stream) * DEBRIS_JITTER_RANGE) - 3;
}

/** A kick component: `0.1 * ((ranrot_rand() % 200) - 100)`. */
function kick(stream: RngState): number {
  return (
    DEBRIS_SPEED_SCALE *
    (Math.floor(rngNext(stream) * DEBRIS_SPEED_LOW) - DEBRIS_SPEED_LOW / 2)
  );
}

/** The zero box used for a hull with no content entry. */
const ZERO_BOX: DebrisBox = { min: vec(0, 0, 0), max: vec(0, 0, 0) };

/** The capsule count to examine: `victim.cargo` when it is in the domain, else 0. */
function capsuleCount(victim: Entity): number {
  const cargo = victim.cargo;
  return Number.isSafeInteger(cargo) && cargo >= 0 && cargo <= MAX_ENTITY_CARGO
    ? cargo
    : 0;
}

/**
 * The box of `hull`, with any missing or non-object corner treated as the zero
 * vector (non-finite components are neutralised per axis in `boxAxis`).
 */
function boxOf(hull: DebrisHull | undefined): DebrisBox {
  if (hull === undefined) return ZERO_BOX;
  const box: unknown = hull.boundingBox;
  if (typeof box !== "object" || box === null) return ZERO_BOX;
  const { min, max } = box as Partial<DebrisBox>;
  return {
    min: typeof min === "object" && min !== null ? min : ZERO_BOX.min,
    max: typeof max === "object" && max !== null ? max : ZERO_BOX.max,
  };
}

/**
 * Release the debris of the ship `victim`, already marked dead by `killShip`,
 * into `world` on tick `ctx.tick`. Total; see the module doc for the rule, the
 * draw order and the cap.
 */
export function releaseDebris(
  world: World,
  victim: Entity,
  ctx: DebrisContext,
): void {
  const stream = createRngState(victim.rng.combat);
  const hull = ctx.content.hulls.get(victim.specKey);
  const fragmentChance =
    hull !== undefined && Number.isFinite(hull.fragmentChance)
      ? hull.fragmentChance
      : DEFAULT_FRAGMENT_CHANCE;
  const box = boxOf(hull);

  // Draw 1: canFragment (D16-13). Plan 16-04 consumes it for the wreckage.
  const canFragment = rngNext(stream) < fragmentChance;
  void canFragment;

  // The pods (ShipEntity.m:7814-7879).
  const pod = ctx.content.pod;
  const capsules = capsuleCount(victim);
  const origin = victim.position;
  const drift = victim.velocity;
  let chance = POD_CARGO_CHANCE_START;
  let limit = POD_LIMIT;
  for (let i = 0; i < capsules; i += 1) {
    if (Math.floor(rngNext(stream) * 100) < chance) {
      if (chance > POD_CARGO_CHANCE_FLOOR) chance -= POD_CARGO_CHANCE_STEP;
      limit -= 1;
      const sample = vec(
        boxAxis(box.min.x, box.max.x, rngNext(stream)),
        boxAxis(box.min.y, box.max.y, rngNext(stream)),
        boxAxis(box.min.z, box.max.z, rngNext(stream)),
      );
      const jx = jitter(stream);
      const jy = jitter(stream);
      const jz = jitter(stream);
      const kx = kick(stream);
      const ky = kick(stream);
      const kz = kick(stream);
      const orientation = randomQuaternion(stream);
      // Unrotated (D16-18): the box offset is added along the world axes.
      const offset = toWegoliteLocal(sample);
      const position = vec(
        origin.x + offset.x + jx,
        origin.y + offset.y + jy,
        origin.z + offset.z + jz,
      );
      const velocity = clampDebrisVelocity(
        vec(kx + drift.x, ky + drift.y, kz + drift.z),
      );
      // The spawn's result never feeds a draw decision.
      spawnEntity(
        world,
        {
          kind: "cargo",
          specKey: pod.key,
          scanClass: "CLASS_CARGO",
          position,
          orientation,
          radius: pod.radius,
          speed: 0,
          ai: null,
          maxEnergy: DEBRIS_MAX_ENERGY,
          energyRechargeRate: 0,
          velocity,
        },
        ctx.tick,
      );
    }
    if (limit <= 0) break;
  }

  // Seam for plan 16-04: the wreckage, the alloy plate and the blast are
  // appended here, after the pods, on the same stream.

  victim.rng.combat = stream.s;
}
