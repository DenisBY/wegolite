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
 *    quaternion w, x, y, z);
 * 3. the wreckage, only when `canFragment` and `n_alloys > 0` (`ShipEntity.m:
 *    8044`): the `n_wreckage` draw `floor(u x (n_alloys + 2))` when `n_alloys <
 *    3` (else 3 with no draw), then per wreck `i`: 7 octant draws
 *    (`OCTANT_DRAWS_PER_WRECK`, D16-17), the lifetime, the model (uniform over
 *    the wreck list, D16-16), the expected mass, the quaternion (4) and the push.
 *
 * The wreckage, the plate and the blast come after the pods, so no pod value
 * moves (plan 16-04). Every draw of a piece is taken before its spawn is
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
 * A wreck (D16-15) is kind `wreckage`, scan class `CLASS_NO_DRAW`
 * (`shipdata.plist:4243`), no AI, no recharge, with `energy = maxEnergy =
 * lifetime / 2 = 375 u + 125 i + 50` (`ShipEntity.m:8063-8064`, `Universe.m:
 * 5517`; Oolite's `max_energy` 20000 is irrelevant because nothing recharges a
 * wreck). Its position is the victim's position plus a random solid point of
 * the victim's octree (`randomOctreePoint`, the origin when the table does not
 * hold it) rotated by the victim's orientation; its model is rescaled
 * uniformly to `0.1 x victim mass x (0.75 .. 1.25)`, so its radius is
 * `model.radius x cbrt(expected mass / model.mass)`; its velocity is the
 * victim's drift plus `normal(dir) x u x radius`. It burns down in
 * `stepDebris` (`./step.ts`, D16-11) and leaves through `killShip`. Wreckage
 * spawns only while fewer than `WRECKAGE_ENTITY_LIMIT` entities are live.
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
import { MAX_OCTREE_DEPTH, randomOctreePoint } from "../combat/octree.js";
import type { HullOctree } from "../combat/octree.js";
import { identity, normalizeVec, rotate, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import { createRngState, rngNext } from "../rng.js";
import type { RngState } from "../rng.js";
import type { Entity } from "./entity.js";
import { MAX_ENTITIES } from "./ids.js";
import { MAX_ENTITY_CARGO, MAX_ENTITY_VELOCITY } from "./limits.js";
import { randomQuaternion } from "./placement.js";
import { liveEntityCount, spawnEntity } from "./world.js";
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
  /**
   * The hulls by spec key. Must be a `Map` instance: anything else is read as
   * an empty table (every victim uses the defaults), never a throw.
   */
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
 * entities are live (`wreckAdmitted`).
 */
export const WRECKAGE_ENTITY_LIMIT = 0.5 * MAX_ENTITIES;

/** Draws per surviving pod: box 3, jitter 3, velocity 3, quaternion 4. */
export const POD_DRAWS_PER_SURVIVOR = 13;

/**
 * The mass unit of the alloy count: `n_alloys = sqrtf(sqrtf(mass / 6000.0f))`
 * (`ShipEntity.m:7916`). It also decides the wreck count.
 */
export const N_ALLOYS_MASS_UNIT = 6000;

/** The most wrecks one explosion throws out (`ShipEntity.m:8050`, `maxWrecks`). */
export const MAX_WRECKS = 3;

/** A wreck's lifetime, `750 u + 250 i + 100` (`ShipEntity.m:8063`): the random span. */
export const WRECK_LIFETIME_RANDOM = 750;

/** The lifetime added per wreck index (`ShipEntity.m:8063`). */
export const WRECK_LIFETIME_STEP = 250;

/** The lifetime base (`ShipEntity.m:8063`). */
export const WRECK_LIFETIME_BASE = 100;

/**
 * A wreck's mass as a fraction of its victim's: `expected_mass = 0.1f * [ship
 * mass] * (0.75 + 0.5 * randf())` (`Universe.m:5503`).
 */
export const WRECK_MASS_FRACTION = 0.1;

/** The low end of the wreck-mass spread, `0.75` (`Universe.m:5503`). */
const WRECK_MASS_SPREAD_LOW = 0.75;

/** The width of the wreck-mass spread, `0.5` (`Universe.m:5503`). */
const WRECK_MASS_SPREAD = 0.5;

/**
 * The octant draws one wreck takes (D16-17): `MAX_OCTREE_DEPTH` whatever the
 * victim's octree looks like and whether the hull table holds it at all, so the
 * stream position never depends on the lazily loaded table (D-15). Oolite draws
 * one `Ranrot() & 7` per level descended (`Octree.m:701`).
 */
export const OCTANT_DRAWS_PER_WRECK = MAX_OCTREE_DEPTH;

/** A wreck starts at 1000 degrees (`Universe.m:5515`, `setTemperature:1000.0`). */
export const WRECK_START_TEMPERATURE = 1000;

/**
 * A wreck cools by 10 degrees per second: the cooling branch of
 * `ShipEntity.m:2254-2272` with no sun is `(0 - 100 * insulation - T) * dt *
 * SHIP_COOLING_FACTOR / insulation` with `SHIP_COOLING_FACTOR` 0.1
 * (`ShipEntity.h:63`) and the wreck's insulation 1e7 (`Universe.m:5516`), that
 * is `-(10 + 1e-8 T) dt`. The `1e-8 T` term is dropped (below 1e-5 relative).
 */
export const WRECK_COOLING_PER_SECOND = 10;

/**
 * A wreck takes heat damage only while hotter than this: `SHIP_MAX_CABIN_TEMP`
 * 256 (`ShipEntity.h:69`, the test at `ShipEntity.m:2268`).
 */
export const WRECK_MIN_DAMAGE_TEMPERATURE = 256;

/**
 * The energy a wreck loses in one step of `dt` seconds at `ageSeconds` after its
 * spawn (D16-11, LOW confidence: arithmetic from the C, never measured in a
 * running Oolite). Its temperature is a closed function of its age, `1000 - 10
 * x age` (nothing else heats or cools a wreck), and `takeHeatDamage:delta_t *
 * ship_temperature` (`ShipEntity.m:2268-2269`) drains `dt x temperature` while
 * that is above 256, else nothing. A non-finite input drains nothing, so the
 * caller never writes a non-finite energy (T-16-11).
 */
export function wreckHeatDrain(ageSeconds: number, dt: number): number {
  if (!Number.isFinite(ageSeconds) || !Number.isFinite(dt)) return 0;
  const temperature =
    WRECK_START_TEMPERATURE - WRECK_COOLING_PER_SECOND * ageSeconds;
  if (!(temperature > WRECK_MIN_DAMAGE_TEMPERATURE)) return 0;
  const drain = dt * temperature;
  return Number.isFinite(drain) ? drain : 0;
}

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

/** A non-null object: the only shape a content record may have. */
function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** `v` when it is an object, else the zero vector; components are checked later. */
function vecOrZero(v: unknown): Vec3 {
  return isObject(v) ? (v as Vec3) : vec(0, 0, 0);
}

/** The hull entry for `specKey`, or undefined when absent or not an object. */
function hullOf(
  content: DebrisContent,
  specKey: string,
): DebrisHull | undefined {
  const hulls: unknown = content.hulls;
  if (!(hulls instanceof Map)) return undefined;
  const hull: unknown = (hulls as ReadonlyMap<string, unknown>).get(specKey);
  return isObject(hull) ? (hull as DebrisHull) : undefined;
}

/**
 * True when the cap admits one more debris piece: the live count is below
 * `DEBRIS_ENTITY_LIMIT` (D16-05). Reads world state only, so it is identical at
 * every cadence; it runs after the piece's draws, so a refusal moves no draw.
 */
function debrisAdmitted(world: World): boolean {
  return liveEntityCount(world) < DEBRIS_ENTITY_LIMIT;
}

/**
 * True when the cap admits one more wreck: the live count is below
 * `WRECKAGE_ENTITY_LIMIT` (128, which also keeps it below the debris limit).
 */
function wreckAdmitted(world: World): boolean {
  return liveEntityCount(world) < WRECKAGE_ENTITY_LIMIT;
}

/**
 * The alloy count before the wreck loop, `sqrtf(sqrtf(mass / 6000.0f))`
 * (`ShipEntity.m:7916`), for a finite positive hull mass; 0 otherwise, which
 * skips the wreckage and the plates (`ShipEntity.m:8044`).
 */
function alloyCountOf(hullMass: number | undefined): number {
  if (hullMass === undefined) return 0;
  const n = Math.sqrt(Math.sqrt(hullMass / N_ALLOYS_MASS_UNIT));
  return Number.isFinite(n) ? n : 0;
}

/** The finite positive hull mass of `hull`, or undefined. */
function hullMassOf(hull: DebrisHull | undefined): number | undefined {
  if (hull === undefined) return undefined;
  const mass = hull.mass;
  return Number.isFinite(mass) && mass > 0 ? mass : undefined;
}

/** The wreck models as an array (a non-array list reads as empty). */
function wreckModelsOf(content: DebrisContent): readonly unknown[] {
  const wrecks: unknown = content.wrecks;
  return Array.isArray(wrecks) ? (wrecks as readonly unknown[]) : [];
}

/**
 * The victim's octree from the hull table, or undefined when the table is
 * absent (a lazy chunk not loaded yet), not a `Map`, or has no usable entry.
 */
function octreeOf(
  octrees: HullTable | undefined,
  specKey: string,
): HullOctree | undefined {
  const table: unknown = octrees;
  if (!(table instanceof Map)) return undefined;
  const entry: unknown = (table as ReadonlyMap<string, unknown>).get(specKey);
  if (!isObject(entry)) return undefined;
  const octree: unknown = (entry as { readonly octree?: unknown }).octree;
  return isObject(octree) ? (octree as HullOctree) : undefined;
}

/** `v` when every component is finite, else the zero vector. */
function finiteVecOrZero(v: Vec3): Vec3 {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
    ? v
    : vec(0, 0, 0);
}

/**
 * Attempt one wreck's spawn behind the wreckage gate (D16-05). As for a pod,
 * the result is never read: a missing model, a non-finite or non-positive
 * radius or energy, or the cap leaves `nextId` and every later draw untouched.
 */
function spawnWreck(
  world: World,
  model: DebrisModel | undefined,
  init: {
    readonly position: Vec3;
    readonly orientation: Quat;
    readonly radius: number;
    readonly velocity: Vec3;
    readonly energy: number;
  },
  tick: number,
): void {
  if (model === undefined || !wreckAdmitted(world)) return;
  spawnEntity(
    world,
    {
      kind: "wreckage",
      specKey: model.key,
      scanClass: "CLASS_NO_DRAW",
      position: init.position,
      orientation: init.orientation,
      radius: init.radius,
      speed: 0,
      ai: null,
      maxEnergy: init.energy,
      energyRechargeRate: 0,
      velocity: init.velocity,
    },
    tick,
  );
}

/**
 * The box of `hull`, with any missing or non-object corner treated as the zero
 * vector (non-finite components are neutralised per axis in `boxAxis`).
 */
function boxOf(hull: DebrisHull | undefined): DebrisBox {
  if (hull === undefined) return ZERO_BOX;
  const box: unknown = hull.boundingBox;
  if (!isObject(box)) return ZERO_BOX;
  const { min, max } = box as Partial<DebrisBox>;
  return {
    min: isObject(min) ? min : ZERO_BOX.min,
    max: isObject(max) ? max : ZERO_BOX.max,
  };
}

/**
 * Attempt one pod's spawn behind the cap gate (D16-05). The result is never
 * read: a refusal (the gate, a missing pod model or any `spawnEntity` refusal
 * such as a non-finite radius) leaves `nextId`, the live array and every later
 * draw untouched.
 */
function spawnPod(
  world: World,
  pod: DebrisModel | undefined,
  position: Vec3,
  orientation: Quat,
  velocity: Vec3,
  tick: number,
): void {
  if (pod === undefined || !debrisAdmitted(world)) return;
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
    tick,
  );
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
  const hull = hullOf(ctx.content, victim.specKey);
  const fragmentChance =
    hull !== undefined && Number.isFinite(hull.fragmentChance)
      ? hull.fragmentChance
      : DEFAULT_FRAGMENT_CHANCE;
  const box = boxOf(hull);

  // Draw 1: canFragment (D16-13).
  const canFragment = rngNext(stream) < fragmentChance;

  // The pods (ShipEntity.m:7814-7879).
  // A pod model that is not an object still takes every draw and spawns nothing.
  const podModel: unknown = ctx.content.pod;
  const pod = isObject(podModel) ? (podModel as DebrisModel) : undefined;
  const capsules = capsuleCount(victim);
  const origin = vecOrZero(victim.position);
  const drift = vecOrZero(victim.velocity);
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
      // Every draw of this pod is taken: only now is its spawn attempted.
      spawnPod(world, pod, position, orientation, velocity, ctx.tick);
    }
    if (limit <= 0) break;
  }

  // The wreckage (ShipEntity.m:8042-8069, Universe.m:5497-5526).
  const hullMass = hullMassOf(hull);
  const nAlloys = alloyCountOf(hullMass);
  if (canFragment && nAlloys > 0 && hullMass !== undefined) {
    const wreckCount =
      nAlloys < MAX_WRECKS
        ? Math.floor(rngNext(stream) * (nAlloys + 2))
        : MAX_WRECKS;
    const models = wreckModelsOf(ctx.content);
    const octree = octreeOf(ctx.octrees, victim.specKey);
    const facingValue: unknown = victim.orientation;
    const facing = isObject(facingValue) ? (facingValue as Quat) : identity();
    for (let i = 0; i < wreckCount; i += 1) {
      // Every draw of this wreck first, in the C's order (D16-12, D16-17).
      const octants: number[] = [];
      for (let k = 0; k < OCTANT_DRAWS_PER_WRECK; k += 1) {
        octants.push(Math.floor(rngNext(stream) * 8));
      }
      const lifetime =
        WRECK_LIFETIME_RANDOM * rngNext(stream) +
        WRECK_LIFETIME_STEP * i +
        WRECK_LIFETIME_BASE;
      const modelValue: unknown =
        models[Math.floor(rngNext(stream) * models.length)];
      const expectedMass =
        WRECK_MASS_FRACTION *
        hullMass *
        (WRECK_MASS_SPREAD_LOW + WRECK_MASS_SPREAD * rngNext(stream));
      const orientation = randomQuaternion(stream);
      const push = rngNext(stream);

      // The point in the victim's hull (origin without an octree), rotated
      // into the world: `quaternion_rotate_vector([self normalOrientation], r1)`.
      const point =
        octree === undefined
          ? vec(0, 0, 0)
          : randomOctreePoint(octree, octants);
      const dir = finiteVecOrZero(rotate(facing, toWegoliteLocal(point)));
      const model = isObject(modelValue)
        ? (modelValue as DebrisModel)
        : undefined;
      // `powf(expected_mass / wreck_mass, 0.33333333f)`: a uniform rescale.
      const radius =
        model === undefined
          ? Number.NaN
          : model.radius * Math.cbrt(expectedMass / model.mass);
      const position = vec(
        origin.x + dir.x,
        origin.y + dir.y,
        origin.z + dir.z,
      );
      // `vector_normal(dir) * randf() * [wreck collisionRadius]`, none for a
      // zero `dir` (the wreck starts at the victim's centre).
      const normal = normalizeVec(dir);
      const kick = push * radius;
      const velocity = clampDebrisVelocity(
        vec(
          drift.x + normal.x * kick,
          drift.y + normal.y * kick,
          drift.z + normal.z * kick,
        ),
      );
      spawnWreck(
        world,
        model,
        { position, orientation, radius, velocity, energy: lifetime / 2 },
        ctx.tick,
      );
    }
  }

  // Seam for Task 2 of plan 16-04: the alloy-count draw, the plates and the
  // blast are appended here, on the same stream.

  victim.rng.combat = stream.s;
}
