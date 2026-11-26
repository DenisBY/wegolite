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
 *    the wreck list, D16-16), the expected mass, the quaternion (4) and the
 *    push; then `n_alloys = u x n_alloys` (`ShipEntity.m:8068`);
 * 4. the plates, `floor(n_alloys)` of them (0 or 1 for the nine inert hulls, up
 *    to 2 for the heavier roster hulls of plan 21-08, 0 when the victim cannot
 *    fragment): 13 draws each, as a pod, with no role
 *    draw (D16-07);
 * 5. the blast, which draws nothing: every movable body near the victim is
 *    pushed once, in ascending id (D-03, see `blastFrom`).
 *
 * The wreckage, the plate and the blast come after the pods, so no pod draw
 * moves (plan 16-04); the blast changes the pods' velocities afterwards. Every draw of a piece is taken before its spawn is
 * attempted and no draw depends on a spawn's result, so a refused spawn (the cap
 * gate below, or any `spawnEntity` refusal) never changes a later value or
 * `nextId` (Pitfall 1).
 *
 * Draws for features not modelled are not taken (D16-24): Oolite's 50 % pod
 * role roll (`Universe.m:3863-3878`) and `randomEjectaTemperature`
 * (`ShipEntity.m:7562-7582`). Every pod is one `barrel` cargopod (D16-01,
 * OC-1). Its commodity and amount (plan 21-14, CBT-11's pod clause, staged) come
 * from the stateless `pod` fork of the victim, never from the combat stream, so
 * no draw above moves: see `drawPodContents`. They are drawn only when the
 * content carries `goods` and a `market`; without either the pod stays
 * anonymous, bit for bit as before.
 *
 * Records (D16-15): a pod or a plate is kind `cargo`, scan class `CLASS_CARGO`, max energy
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
import {
  BUOY_SUBENTITY_MASS,
  NAV_BUOY_HULL_MASS,
  NAV_BUOY_MASS,
} from "../hyperspace/countdown.js";
import type { HullTable } from "../combat/hit.js";
import { MAX_OCTREE_DEPTH, randomOctreePoint } from "../combat/octree.js";
import type { HullOctree } from "../combat/octree.js";
import {
  cbrt,
  identity,
  lengthSquared,
  normalizeVec,
  rotate,
  vec,
} from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import { createRngState, forkSeed, rngNext } from "../rng.js";
import type { RngState } from "../rng.js";
import type { Commodity } from "../../content/types.js";
import { CARGO_KINDS } from "./entity.js";
import type { Entity } from "./entity.js";
import { MAX_ENTITIES } from "./ids.js";
import type { SystemLayout } from "./layout.js";
import {
  COMMODITY_KEY_PATTERN,
  MAX_COMMODITY_KEY_LENGTH,
  MAX_ENTITY_CARGO,
  MAX_ENTITY_VELOCITY,
  MAX_POD_AMOUNT,
  MAX_UINT32,
} from "./limits.js";
import { randomQuaternion } from "./placement.js";
import {
  buoyPosition,
  isBuoyDestroyed,
  isBuoySubentityAttached,
} from "./statics.js";
import type { BuoyKey } from "./statics.js";
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
  /**
   * The compiled commodity records (plan 21-14): the goods a pod can carry, in
   * the order Oolite's `commodityMarket` lists them. With `market` it makes a
   * released pod carry a commodity and an amount; absent, pods stay anonymous.
   */
  readonly goods?: readonly Commodity[];
  /**
   * The current system's first-generation market quantities (plan 21-14),
   * set per system by the one step-options builder (plan 21-15): never the
   * player-modified live market (RESEARCH A6), so the draw does not depend on
   * what the player bought or sold. A good absent from it has quantity 0.
   * Absent means anonymous pods.
   */
  readonly market?: readonly PodMarketEntry[];
}

/** One good's stock in `DebrisContent.market`: a commodity key and its quantity. */
export interface PodMarketEntry {
  readonly key: string;
  readonly quantity: number;
}

/**
 * A caller-owned accumulator of the blast's push on the player (D-03): the
 * blast adds to it and the caller adds the sum to `FlightState.drift` once,
 * after the tick's kills (`../combat/step.ts`).
 */
export interface BlastPush {
  x: number;
  y: number;
  z: number;
}

/** A blast receiver outside the store (the player): its centre, collision radius and mass. */
export interface BlastBody {
  readonly position: Vec3;
  readonly radius: number;
  readonly mass: number;
}

/** One exploding body: its centre, mass in kg and collision radius in m. */
export interface BlastSource {
  readonly position: Vec3;
  readonly mass: number;
  readonly radius: number;
}

/** The per-kill context `killShip` receives (`../combat/step.ts` builds it). */
export interface DebrisContext {
  /** The tick the debris spawns on (`spawnTick`). */
  readonly tick: number;
  readonly content: DebrisContent;
  /** The hull octrees, read by plan 16-04 for wreckage placement. */
  readonly octrees?: HullTable;
  /**
   * The player as a blast receiver (D-03), present only while the player is
   * in flight; its push goes to `playerPush`, never to the flight state.
   */
  readonly player?: BlastBody;
  /** The accumulator of the player's push; the player is pushed only with both. */
  readonly playerPush?: BlastPush;
  /**
   * The system layout: with it the live buoys are blast receivers (PD-02),
   * placed by `buoyPosition`; without it no buoy is.
   */
  readonly layout?: SystemLayout;
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
 * The blast momentum per kg of victim mass: `dealMomentumWithinDesiredRange:
 * 0.125f * mass` (`ShipEntity.m:8125`).
 */
export const BLAST_MOMENTUM_FACTOR = 0.125;

/** The blast range in victim radii: `desired_range = collision_radius * 2.5f` (`ShipEntity.m:8124`). */
export const BLAST_RANGE_FACTOR = 2.5;

/** The floor of the blast's `d2` (`ShipEntity.m:7690-7692`, "sensible levels"). */
export const BLAST_MIN_DISTANCE_SQUARED = 0.1;

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

/** What a released pod carries (plan 21-14): a commodity key and a unit count. */
export interface PodContents {
  readonly commodity: string;
  readonly amount: number;
}

/** The `CARGO_KINDS` index of `name`, resolved once from the frozen tuple. */
const kindIndex = (name: (typeof CARGO_KINDS)[number]): number =>
  CARGO_KINDS.indexOf(name);

const KIND_PLENTIFUL = kindIndex("plentiful");
const KIND_SCARCE = kindIndex("scarce");
const KIND_MEDICAL = kindIndex("medical");
const KIND_CONTRABAND = kindIndex("contraband");
const KIND_PIRATE = kindIndex("pirate");

/** The commodity `CARGO_FLAG_FULL_MEDICAL` fills with (`ShipEntity.m:7355`). */
const MEDICAL_COMMODITY = "narcotics";

/** A role is in `family` when it is the family name or `<family>-...`. */
function inRoleFamily(role: string, family: string): boolean {
  return role === family || role.startsWith(`${family}-`);
}

/**
 * The cargo kind a destroyed ship's pods are drawn with, resolved AT RELEASE
 * (orchestrator decision 3, plan 21-14): never stored on an inert ship at spawn,
 * because a stored kind would print a `ck:` segment and move the epoch 1-20
 * pin.
 *
 * An explicit `cargoKind` (an index 1 to 6 into `CARGO_KINDS`) wins. Otherwise
 * the role decides: the trader and shuttle families give `plentiful` (Oolite's
 * legacy trader and the station shuttle, `Universe.m` and `StationEntity.m`
 * `setCargoFlag:CARGO_FLAG_FULL_PLENTIFUL`), the pirate family gives `pirate`
 * (scarce goods, illegal allowed, `ShipEntity.m:7364-7365`), and any other or
 * unknown role (the inert ships' pristine "" included) falls back to `scarce`
 * legal goods. An invalid stored kind (NaN, negative, fractional, out of range)
 * falls back by role. The families are matched by `===` and a prefix check
 * over the closed names, never an object lookup. Total: any input returns a
 * valid index from 1 to `CARGO_KINDS.length - 1`. The fallback is for the
 * frozen inert path and the test hooks only; a live populator sets the kind
 * itself (`tests/guards/pod-kind-fallback.test.ts`).
 */
export function resolvePodCargoKind(
  victim: Pick<Entity, "cargoKind" | "role">,
): number {
  const stored: unknown = victim.cargoKind;
  if (
    typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= 1 &&
    stored <= CARGO_KINDS.length - 1
  ) {
    return stored;
  }
  const role: unknown = victim.role;
  if (typeof role !== "string") return KIND_SCARCE;
  if (inRoleFamily(role, "trader") || inRoleFamily(role, "shuttle")) {
    return KIND_PLENTIFUL;
  }
  if (inRoleFamily(role, "pirate")) return KIND_PIRATE;
  return KIND_SCARCE;
}

/** The most market stock read for one good: Oolite's quantity limit, with headroom. */
const POD_QUANTITY_CAP = 0xffff;

/** `getContainersOfGoods` weights quantities against this (`Universe.m:3913-3924`). */
const POD_QUANTITY_FULL = 64;

/** A good the draw can pick: a legal key with its unit and export legality. */
interface PodGood {
  readonly key: string;
  readonly unit: unknown;
  readonly illegal: boolean;
}

/** The goods the draw can name: object records whose `key` is a legal commodity key. */
function podGoodsOf(goods: unknown): PodGood[] {
  if (!Array.isArray(goods)) return [];
  const found: PodGood[] = [];
  for (const entry of goods as unknown[]) {
    if (!isObject(entry)) continue;
    const { key, unit, legalityExport } = entry as Partial<Commodity>;
    if (
      typeof key !== "string" ||
      key.length === 0 ||
      key.length > MAX_COMMODITY_KEY_LENGTH ||
      !COMMODITY_KEY_PATTERN.test(key)
    ) {
      continue;
    }
    found.push({
      key,
      unit,
      illegal: typeof legalityExport === "number" && legalityExport > 0,
    });
  }
  return found;
}

/** The market stock by key: the first entry of a key wins; bad quantities are 0. */
function podStockOf(market: unknown): Map<string, number> {
  const stock = new Map<string, number>();
  if (!Array.isArray(market)) return stock;
  for (const entry of market as unknown[]) {
    if (!isObject(entry)) continue;
    const { key, quantity } = entry as Partial<PodMarketEntry>;
    if (typeof key !== "string" || stock.has(key)) continue;
    stock.set(
      key,
      typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
        ? Math.min(Math.floor(quantity), POD_QUANTITY_CAP)
        : 0,
    );
  }
  return stock;
}

/**
 * One capsule weight per good, `getContainersOfGoods` (`Universe.m:3894-3924`)
 * in integer arithmetic: `q` is the market quantity; for scarce goods
 * `q < 64 ? 64 - q : 0` (3908-3912); when only legal goods are wanted an
 * export-illegal good keeps `q & 1`, "a very small chance, sometimes"
 * (3915-3918); then `q = min(q, 64)`, `q = q * 100 / 64` truncated (3919-3923).
 */
function podWeightsOf(
  goods: readonly PodGood[],
  stock: ReadonlyMap<string, number>,
  scarce: boolean,
  legal: boolean,
): number[] {
  return goods.map((good) => {
    let q = stock.get(good.key) ?? 0;
    if (scarce) q = q < POD_QUANTITY_FULL ? POD_QUANTITY_FULL - q : 0;
    if (legal && good.illegal) q &= 1;
    if (q > POD_QUANTITY_FULL) q = POD_QUANTITY_FULL;
    return Math.floor((q * 100) / POD_QUANTITY_FULL);
  });
}

/** `Ranrot() % n` over the stream: `floor(u * n)`. */
const modulo = (rng: RngState, n: number): number =>
  Math.floor(rngNext(rng) * n);

/**
 * The amount of one pod of `good`, `getRandomAmountOfCommodity`
 * (`Universe.m:3977-3996`): tonnes 1, kilograms `1 + r%6 + r%6 + r%6`, grams
 * `4 + r%16 + r%11 + r%6`, an unknown unit 1; drawn left to right, clamped
 * into `MAX_POD_AMOUNT`.
 */
function podAmountOf(rng: RngState, unit: unknown): number {
  let amount = 1;
  if (unit === "kg") {
    amount = 1 + modulo(rng, 6) + modulo(rng, 6) + modulo(rng, 6);
  } else if (unit === "g") {
    amount = 4 + modulo(rng, 16) + modulo(rng, 11) + modulo(rng, 6);
  }
  return Math.min(amount, MAX_POD_AMOUNT);
}

/**
 * The contents of `count` pods of a ship of cargo kind `kind` (plan 21-14,
 * CBT-11's pod clause): one commodity and amount per pod, drawn from `rng`, the
 * stateless `pod` fork of the victim, never from the combat stream.
 *
 * Order: every pod's commodity first, in capsule index order
 * (`getContainersOfGoods`, `Universe.m:3894-3955`, run once by `setCargoFlag:`,
 * `ShipEntity.m:7340-7366`), then every pod's amount (`cargoPodFromTemplate`,
 * `ShipEntity.m:7810-7812` to `Universe.m:3977-3996`), as the real pods are
 * made at release. Per capsule, with `total` the sum of the weights
 * (`podWeightsOf`): no draw when `total` is 0, then the first good (the
 * `co_type = 0` initial, `Universe.m:3930-3945`, ported as written); otherwise
 * `qr = 1 + (r % total)` and the first good whose running weight reaches `qr`.
 *
 * The kind picks the rule (`ShipEntity.m:7343-7366`): `plentiful` is
 * `scarce:NO legal:YES`, `scarce` is `scarce:YES legal:YES`, `contraband` and
 * `pirate` are `scarce:YES legal:NO` (the pirate's pod count, `r % (1 + num /
 * 2)`, belongs to the caller, which counts survivors), `medical` is Narcotics
 * and takes no commodity draw. `uniform` needs the hull's `cargo_carried`, which
 * no per-ship value holds, and an invalid kind has no rule: both take the
 * `scarce` legal rule, as an unknown role does. Medical with no Narcotics good
 * in `goods` does the same.
 *
 * Total: `goods` entries that are not objects or whose key is not a legal
 * commodity key are skipped, a market quantity that is not a finite positive
 * number is 0, a good the market does not list has quantity 0, and `count` is
 * floored and bounded to `0..MAX_ENTITY_CARGO` (a non-finite count is 0). With
 * no usable good it returns no contents. Every amount is an integer within its
 * unit's range and `MAX_POD_AMOUNT`. A pure function of its arguments and the
 * state of `rng`, which it advances.
 */
export function drawPodContents(
  kind: number,
  rng: RngState,
  goods: readonly Commodity[],
  market: readonly PodMarketEntry[],
  count: number,
): PodContents[] {
  const pods =
    typeof count === "number" && Number.isFinite(count)
      ? Math.min(Math.max(0, Math.floor(count)), MAX_ENTITY_CARGO)
      : 0;
  const usable = podGoodsOf(goods);
  if (pods === 0 || usable.length === 0) return [];

  // The commodity of every pod.
  const chosen: PodGood[] = [];
  const narcotics =
    kind === KIND_MEDICAL
      ? usable.find((good) => good.key === MEDICAL_COMMODITY)
      : undefined;
  if (narcotics !== undefined) {
    for (let i = 0; i < pods; i += 1) chosen.push(narcotics);
  } else {
    const scarce = kind !== KIND_PLENTIFUL;
    const legal = kind !== KIND_CONTRABAND && kind !== KIND_PIRATE;
    const weights = podWeightsOf(usable, podStockOf(market), scarce, legal);
    let total = 0;
    for (const weight of weights) total += weight;
    for (let i = 0; i < pods; i += 1) {
      let at = 0;
      if (total > 0) {
        let qr = 1 + modulo(rng, total);
        for (at = 0; at < weights.length - 1; at += 1) {
          qr -= weights[at] as number;
          if (qr <= 0) break;
        }
      }
      chosen.push(usable[at] as PodGood);
    }
  }

  // The amount of every pod.
  return chosen.map((good) => ({
    commodity: good.key,
    amount: podAmountOf(rng, good.unit),
  }));
}

/** One pod's or plate's drawn placement (13 draws). */
interface Scatter {
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly velocity: Vec3;
}

/**
 * The 13 draws of one pod or plate, in the C's order (`ShipEntity.m:7847-7870`
 * for a pod, `8088-8101` for a plate): a random point of the victim's bounding
 * box (x, y, z), a -3..3 m jitter (x, y, z), a kick (x, y, z), then a random
 * quaternion (4). The box offset is added unrotated along the world axes
 * (D16-18) and the velocity is the kick plus the victim's drift, clamped into
 * the sanitiser's domain.
 */
function scatter(
  stream: RngState,
  box: DebrisBox,
  origin: Vec3,
  drift: Vec3,
): Scatter {
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
  const offset = toWegoliteLocal(sample);
  const position = vec(
    origin.x + offset.x + jx,
    origin.y + offset.y + jy,
    origin.z + offset.z + jz,
  );
  const velocity = clampDebrisVelocity(
    vec(kx + drift.x, ky + drift.y, kz + drift.z),
  );
  return { position, orientation, velocity };
}

/**
 * Attempt one pod's or plate's spawn behind the cap gate (D16-05): kind
 * `cargo`, `CLASS_CARGO`, energy 1 of 1, no recharge, no AI, speed 0 (D16-15),
 * carrying `contents` when given (plan 21-14).
 * The result is never read: a refusal (the gate, a missing model or any
 * `spawnEntity` refusal such as a non-finite radius) leaves `nextId`, the live
 * array and every later draw untouched.
 */
function spawnCargoPiece(
  world: World,
  model: DebrisModel | undefined,
  piece: Scatter,
  tick: number,
  contents?: PodContents,
): void {
  if (model === undefined || !debrisAdmitted(world)) return;
  spawnEntity(
    world,
    {
      kind: "cargo",
      specKey: model.key,
      scanClass: "CLASS_CARGO",
      position: piece.position,
      orientation: piece.orientation,
      radius: model.radius,
      speed: 0,
      ai: null,
      maxEnergy: DEBRIS_MAX_ENERGY,
      energyRechargeRate: 0,
      velocity: piece.velocity,
      ...(contents === undefined
        ? {}
        : { podCommodity: contents.commodity, podAmount: contents.amount }),
    },
    tick,
  );
}

/** The model of a content slot when it is an object, else undefined. */
function modelOf(value: unknown): DebrisModel | undefined {
  return isObject(value) ? (value as DebrisModel) : undefined;
}

/**
 * The mass in kg of a debris entity: the model among the pod, the plate and
 * the wrecks whose key is the entity's spec key, scaled by the cube of the
 * entity's radius over the model's (`rescaleBy:` scales the mass by the cube
 * of the factor, `Universe.m:5505`). A pod or plate keeps its model mass; a
 * wreck's equals its expected mass because its scale is uniform (D16-04).
 * Undefined for an unknown key or a non-finite or non-positive result.
 */
export function debrisMassOf(
  entity: Entity,
  content: DebrisContent,
): number | undefined {
  const candidates: unknown[] = [content.pod, content.plate];
  for (const wreck of wreckModelsOf(content)) candidates.push(wreck);
  for (const candidate of candidates) {
    const model = modelOf(candidate);
    if (model === undefined || model.key !== entity.specKey) continue;
    const mass = model.mass * (entity.radius / model.radius) ** 3;
    return Number.isFinite(mass) && mass > 0 ? mass : undefined;
  }
  return undefined;
}

const f = Math.fround;

/**
 * The velocity change one exploding body gives one receiver
 * (`dealMomentumWithinDesiredRange:`, `ShipEntity.m:7680-7698`, with
 * `addImpactMoment:fraction:`, `11178-11181`), or undefined when the receiver
 * is out of range or an input is unusable.
 *
 * - `amount = 0.125 x source mass` and `desired_range = 2.5 x source radius`
 *   (`ShipEntity.m:8123-8126`).
 * - In range: `|p|^2 < (desired_range + r)^2`, strict, with `r` the
 *   RECEIVER's collision radius (`Universe.m:5862-5868`). The test follows the
 *   C's float `EntityInRange` (`cr` is a float), so a body on the boundary is
 *   in or out exactly as in Oolite; `|p|^2` is the double `HPdistance2`.
 * - `d2 = |p|^2 - r^2` with the same receiver radius, floored at 0.1
 *   (`ShipEntity.m:7686-7690`); `moment = amount x desired_range / d2`.
 * - `dv = normal(p) x moment / receiver mass`, `p` from the source to the
 *   receiver; a receiver at the source's centre gets the zero vector
 *   (`vector_normal` of a zero vector).
 *
 * The magnitude is computed in double, as Phase 16 ported it, which is within
 * about 1e-7 of the C's float arithmetic: every 18-03 blast fixture passes at
 * its 1e-6 relative tolerance (`tests/sim/world/blast.oracle.test.ts`).
 */
export function blastImpulse(
  source: BlastSource,
  position: Vec3,
  radius: number,
  mass: number,
): Vec3 | undefined {
  if (
    !Number.isFinite(source.mass) ||
    !(source.mass > 0) ||
    !Number.isFinite(source.radius) ||
    !(source.radius > 0) ||
    !Number.isFinite(radius) ||
    !(radius >= 0) ||
    !Number.isFinite(mass) ||
    !(mass > 0)
  ) {
    return undefined;
  }
  const origin: unknown = source.position;
  const at: unknown = position;
  if (!isObject(origin) || !isObject(at)) return undefined;
  const p2 = vec(
    position.x - source.position.x,
    position.y - source.position.y,
    position.z - source.position.z,
  );
  const distanceSq = lengthSquared(p2);
  const cr = f(f(f(source.radius) * f(BLAST_RANGE_FACTOR)) + f(radius));
  if (!(distanceSq < f(cr * cr))) return undefined;
  if (!(distanceSq > 0)) return vec(0, 0, 0);
  const amount = BLAST_MOMENTUM_FACTOR * source.mass;
  const range = source.radius * BLAST_RANGE_FACTOR;
  const d2 = Math.max(BLAST_MIN_DISTANCE_SQUARED, distanceSq - radius * radius);
  const dv = (amount * range) / d2 / mass;
  const normal = normalizeVec(p2);
  return vec(normal.x * dv, normal.y * dv, normal.z * dv);
}

/** `dv` is the zero vector (no write, so a pristine velocity stays pristine). */
function isZeroVec(dv: Vec3): boolean {
  return dv.x === 0 && dv.y === 0 && dv.z === 0;
}

/**
 * The blast of one exploding body (`ShipEntity.m:8123-8126` calling
 * `dealMomentumWithinDesiredRange:`, `7680-7698`, and `addImpactMoment:
 * fraction:`, `11178-11181`; D-03, PD-02): every receiver in range gets one
 * `blastImpulse`, in ascending id. Receivers:
 *
 * - the two buoys (ids 4 and 5), when the context carries the layout and the
 *   buoy is not destroyed: `NAV_BUOY_MASS` while its subentity is attached,
 *   `NAV_BUOY_HULL_MASS` once it is detached, its layout radius, its live
 *   position (`buoyPosition`); the push goes to `World.buoys.<key>.velocity`;
 * - the player (id 100), when the context carries its body and the
 *   accumulator: the push is added to `playerPush`, and the caller adds the
 *   sum to its drift after the tick's kills (only in flight: a docked or
 *   launching player is never pushed, the launching case a recorded
 *   divergence because Oolite's `isInSpace` lists `STATUS_LAUNCHING`,
 *   `Entity.m:1038`);
 * - every live ship whose spec key has a finite positive mass in the
 *   content's hull table (a ship without one is not pushed), and every live
 *   pod, plate and wreck with its `debrisMassOf` mass.
 *
 * The station is never a receiver. In Oolite it is one (`isInSpace` lists
 * `STATUS_IN_FLIGHT`, `Entity.m:1033-1046`, and `addImpactMoment` is not
 * overridden, `StationEntity.m:1159-1163`), but its push of at most a few
 * hundredths of a m/s is braked to rest by its thrust before it moves in the
 * same frame (`ShipEntity.m:5808-5823`, then 2633-2637), so the observable
 * result is the same; Wegolite's station has no velocity state to brake (a
 * divergence in mechanism, recorded in FIDELITY). A dead entity (the victim
 * among them, marked dead before its blast) and a destroyed buoy are never
 * pushed. Each velocity component is clamped at `MAX_ENTITY_VELOCITY` at the
 * write (T-16-13, T-18-31: a body at the 0.1 floor, such as a pod beside a
 * dying buoy, would otherwise exceed it), and a zero push writes nothing, so
 * a kill with nothing movable in range hashes as before.
 */
export function blastFrom(
  world: World,
  source: BlastSource,
  ctx: DebrisContext,
): void {
  const layout = ctx.layout;
  if (layout !== undefined) {
    for (const key of BUOY_KEYS) {
      if (isBuoyDestroyed(world, key)) continue;
      const mass = isBuoySubentityAttached(world, key)
        ? NAV_BUOY_MASS
        : NAV_BUOY_HULL_MASS;
      const dv = blastImpulse(
        source,
        buoyPosition(world, layout, key),
        layout[key].radius,
        mass,
      );
      if (dv === undefined || isZeroVec(dv)) continue;
      const buoy = world.buoys[key];
      const v = buoy.velocity;
      buoy.velocity = clampDebrisVelocity(
        vec(v.x + dv.x, v.y + dv.y, v.z + dv.z),
      );
    }
  }
  const player = ctx.player;
  const push = ctx.playerPush;
  if (player !== undefined && push !== undefined) {
    const dv = blastImpulse(
      source,
      player.position,
      player.radius,
      player.mass,
    );
    if (dv !== undefined && !isZeroVec(dv)) {
      push.x += dv.x;
      push.y += dv.y;
      push.z += dv.z;
    }
  }
  for (const body of world.store.live) {
    if (body.dead) continue;
    const mass =
      body.kind === "ship"
        ? hullMassOf(hullOf(ctx.content, body.specKey))
        : body.kind === "cargo" || body.kind === "wreckage"
          ? debrisMassOf(body, ctx.content)
          : undefined;
    if (mass === undefined) continue;
    const position: unknown = body.position;
    const velocity: unknown = body.velocity;
    if (!isObject(position) || !isObject(velocity)) continue;
    const dv = blastImpulse(source, body.position, body.radius, mass);
    if (dv === undefined || isZeroVec(dv)) continue;
    const v = body.velocity;
    body.velocity = clampDebrisVelocity(
      vec(v.x + dv.x, v.y + dv.y, v.z + dv.z),
    );
  }
}

/** The two buoys in ascending static id (4, then 5). */
const BUOY_KEYS = ["witchpoint", "navBuoy"] as const;

/**
 * A buoy subentity's collision radius in metres: OOMesh's rule (`sqrtf` of
 * the largest vertex `magnitude2`, `OOMesh.m:1800-1822`) over
 * `oolite_buoy_subents.dat`, as plan 18-03 derived it for its blast fixtures.
 * The static hull artifact carries no subentity radius, so it is a literal
 * here; `tests/sim/world/blast.oracle.test.ts` pins it to the fixture and to
 * the rule over the vendored mesh.
 */
export const BUOY_SUBENTITY_RADIUS = 25.8226470947265625;

/**
 * The explosion of the buoy `key`'s frangible subentity (`becomeExplosion`
 * with a parent, `ShipEntity.m:7895-7904`): one blast from its absolute
 * position with `BUOY_SUBENTITY_MASS` and `BUOY_SUBENTITY_RADIUS`. Its
 * authored offset is (0, 0, 0) (the static hull artifact, pinned by a test),
 * so its absolute position is the buoy's live centre. The buoy itself, while
 * not destroyed, is a receiver of this blast in Oolite as here, but the push
 * direction from the subentity to it is the zero vector (`vector_normal` of a
 * zero vector), so it gets no push. The caller runs it on the tick the
 * subentity reaches 0 (`../combat/step.ts`), or first when a buoy dies with
 * its subentity attached (`blastBuoy`).
 */
export function blastBuoySubentity(
  world: World,
  layout: SystemLayout,
  key: BuoyKey,
  ctx: DebrisContext,
): void {
  blastFrom(
    world,
    {
      position: buoyPosition(world, layout, key),
      mass: BUOY_SUBENTITY_MASS,
      radius: BUOY_SUBENTITY_RADIUS,
    },
    ctx,
  );
}

/**
 * The explosion of the destroyed buoy `key` (`becomeExplosion`,
 * `ShipEntity.m:8115-8126`): the subentity, while attached, explodes first
 * (`blastBuoySubentity`); `subEntityDied` then lowers the parent's mass
 * (`ShipEntity.m:8185-8194`), so the hull blasts with `NAV_BUOY_HULL_MASS`
 * (also its mass when the subentity was already detached) and its layout
 * radius, from its live centre. A dying buoy releases no debris (a recorded
 * divergence, `./kill.ts`).
 */
export function blastBuoy(
  world: World,
  layout: SystemLayout,
  key: BuoyKey,
  ctx: DebrisContext,
): void {
  if (isBuoySubentityAttached(world, key)) {
    blastBuoySubentity(world, layout, key, ctx);
  }
  blastFrom(
    world,
    {
      position: buoyPosition(world, layout, key),
      mass: NAV_BUOY_HULL_MASS,
      radius: layout[key].radius,
    },
    ctx,
  );
}

/**
 * The explosion of a destroyed pod or plate (`becomeExplosion`,
 * `ShipEntity.m:8123-8126`, which deals momentum for every exploding ship):
 * one blast from its centre with its `debrisMassOf` mass and its radius,
 * after `killShip` marked it dead. Nothing for an unknown spec key.
 */
export function blastDebrisPiece(
  world: World,
  piece: Entity,
  ctx: DebrisContext,
): void {
  const mass = debrisMassOf(piece, ctx.content);
  if (mass === undefined) return;
  const position: unknown = piece.position;
  if (!isObject(position)) return;
  blastFrom(
    world,
    { position: piece.position, mass, radius: piece.radius },
    ctx,
  );
}

/**
 * The contents of the `count` pods `victim` releases (plan 21-14): drawn from
 * the stateless `pod` fork `forkSeed(worldSeed, victim.id, "pod")`, so the
 * victim's `combat` stream, and with it every placement, survival, wreck and
 * plate draw, is the same with and without contents. None (anonymous pods) when
 * the content has no `goods` or no `market`, when no pod survived (no draw at
 * all) or when the victim's id is outside the fork's domain.
 */
function podContentsOf(
  world: World,
  victim: Entity,
  content: DebrisContent,
  count: number,
): readonly PodContents[] {
  const goods: unknown = content.goods;
  const market: unknown = content.market;
  if (count === 0 || !Array.isArray(goods) || !Array.isArray(market)) {
    return [];
  }
  const id = victim.id;
  if (!Number.isSafeInteger(id) || id < 0 || id > MAX_UINT32) return [];
  const rng = createRngState(forkSeed(world.worldSeed, id, "pod"));
  return drawPodContents(
    resolvePodCargoKind(victim),
    rng,
    goods as readonly Commodity[],
    market as readonly PodMarketEntry[],
    count,
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
  const pod = modelOf(ctx.content.pod);
  const capsules = capsuleCount(victim);
  const origin = vecOrZero(victim.position);
  const drift = vecOrZero(victim.velocity);
  let chance = POD_CARGO_CHANCE_START;
  let limit = POD_LIMIT;
  // Every survivor's 13 draws are taken in order here; the spawns follow, so
  // the contents (from the pod fork, below) can be drawn for all survivors at
  // once. No draw depends on a spawn, so the order of draws is unchanged.
  const survivors: Scatter[] = [];
  for (let i = 0; i < capsules; i += 1) {
    if (Math.floor(rngNext(stream) * 100) < chance) {
      if (chance > POD_CARGO_CHANCE_FLOOR) chance -= POD_CARGO_CHANCE_STEP;
      limit -= 1;
      survivors.push(scatter(stream, box, origin, drift));
    }
    if (limit <= 0) break;
  }
  const contents = podContentsOf(world, victim, ctx.content, survivors.length);
  for (let i = 0; i < survivors.length; i += 1) {
    // A refused spawn (the cap gate, a missing model) still had its draws.
    spawnCargoPiece(world, pod, survivors[i] as Scatter, ctx.tick, contents[i]);
  }

  // The wreckage (ShipEntity.m:8042-8069, Universe.m:5497-5526).
  const hullMass = hullMassOf(hull);
  let nAlloys = alloyCountOf(hullMass);
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
          : model.radius * cbrt(expectedMass / model.mass);
      const position = vec(
        origin.x + dir.x,
        origin.y + dir.y,
        origin.z + dir.z,
      );
      // `vector_normal(dir) * randf() * [wreck collisionRadius]`, none for a
      // zero `dir` (the wreck starts at the victim's centre).
      const normal = normalizeVec(dir);
      const pushSpeed = push * radius;
      const velocity = clampDebrisVelocity(
        vec(
          drift.x + normal.x * pushSpeed,
          drift.y + normal.y * pushSpeed,
          drift.z + normal.z * pushSpeed,
        ),
      );
      spawnWreck(
        world,
        model,
        { position, orientation, radius, velocity, energy: lifetime / 2 },
        ctx.tick,
      );
    }
    // `n_alloys = randf() * n_alloys` (ShipEntity.m:8068).
    nAlloys = rngNext(stream) * nAlloys;
  }

  // The alloy plates (ShipEntity.m:8072-8111): `floorf(n_alloys)`, 0 or 1 for
  // the nine inert hulls and up to 2 for the heavier roster hulls (plan 21-08),
  // none when the victim cannot fragment. Oolite's
  // `!add_debris` clamp (8077-8080) is not ported: the draws are taken as if
  // `add_debris` held and the cap gates each spawn (D16-05). One plate look
  // and no role draw (D16-07, D16-24).
  const plateCount = canFragment ? Math.floor(nAlloys) : 0;
  const plate = modelOf(ctx.content.plate);
  for (let i = 0; i < plateCount; i += 1) {
    spawnCargoPiece(
      world,
      plate,
      scatter(stream, box, origin, drift),
      ctx.tick,
    );
  }

  // The blast, last, over every body now live (ShipEntity.m:8123-8126).
  if (hullMass !== undefined) {
    blastFrom(
      world,
      { position: origin, mass: hullMass, radius: victim.radius },
      ctx,
    );
  }

  victim.rng.combat = stream.s;
}
