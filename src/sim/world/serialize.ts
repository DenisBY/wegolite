// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The composed world hash (FOUND-11, FOUND-12, D-08).
 *
 * `hashWorld(player, world, combat?)` is
 * `fnv1a32(serializeFlight(player) + section + staticHealthLine + combatLine)`.
 * While the world has never spawned anything (`isNeverSpawned`, the single
 * predicate of `./world.ts`) the section is empty and the text is exactly the
 * v1 flight text, so the pinned flight hashes hold. Once anything has spawned,
 * or `world.rng` has been drawn, the section is appended. `serializeFlight`
 * is never edited. The combat line follows the same rule (see `hashWorld`):
 * empty while the player's combat state is pristine. The five static entities are never serialised: they are
 * derived from the layout and must not move the hash.
 *
 * The entity line is injective over the fields it prints. Every string leaf
 * goes through `encodeHashString`, which writes JSON string text with every
 * code unit above 0x7e as a lower-case `\u` escape, so the hash text is ASCII
 * (`fnv1a32` hashes only the low byte of each code unit) and no string can
 * forge a field or a line. Every param value carries a type tag, so the number
 * 1, the string "1" and the boolean true never print alike.
 *
 * `canon` throws on a non-finite number. A non-finite field never reaches a
 * hash: plan 08-11's per-tick `sanitizeEntity` runs before any hash.
 */

import { canon, fnv1a32 } from "../hash.js";
import {
  isPristineCombat,
  sanitizeCombat,
  serializeCombat,
} from "../combat/state.js";
import type { PlayerCombatState } from "../combat/state.js";
import { serializeFlight } from "../flight/state.js";
import type { FlightState } from "../flight/state.js";
import type { ParamValue } from "../ai/types.js";
import type { Vec3 } from "../math.js";
import type { SteerComponent } from "../npc/state.js";
import type { BuoyState, BuoyStates, Entity, StaticHealth } from "./entity.js";
import type { EntityId } from "./ids.js";
import { sanitizeBuoyStates, sanitizeStaticHealth } from "./sanitize.js";
import {
  isNeverSpawned,
  isPristineBuoyStates,
  isPristineStaticHealth,
} from "./world.js";
import type { World } from "./world.js";

/**
 * JSON string text with every code unit above 0x7e written as a backslash, the
 * letter u and four lower-case hex digits: ASCII, no raw newline.
 */
function encodeHashString(s: string): string {
  const json = JSON.stringify(s);
  let out = "";
  for (let i = 0; i < json.length; i += 1) {
    const unit = json.charCodeAt(i);
    out += unit > 0x7e ? `\\u${unit.toString(16).padStart(4, "0")}` : json[i];
  }
  return out;
}

/** A tagged scalar: n:<canon> for a number, s:<encoded> for a string. */
function encodeScalar(value: number | string): string {
  return typeof value === "number"
    ? `n:${canon(value)}`
    : `s:${encodeHashString(value)}`;
}

/** A type-tagged param value: z, b:true, b:false, n:, s: or a[...]. */
function encodeParam(value: ParamValue): string {
  if (value === null) return "z";
  if (typeof value === "boolean") return `b:${String(value)}`;
  if (typeof value === "number" || typeof value === "string") {
    return encodeScalar(value);
  }
  return `a[${value.map(encodeScalar).join(",")}]`;
}

const compareCodeUnits = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** The params text: keys in code-unit order, never `Object.keys` order. */
function encodeParams(params: Record<string, ParamValue>): string {
  const keys = Object.keys(params).sort(compareCodeUnits);
  const parts = keys.map(
    (key) =>
      `${encodeHashString(key)}:${encodeParam(params[key] as ParamValue)}`,
  );
  return `{${parts.join(",")}}`;
}

const int = (n: number): string => canon(n, 0);

const vecText = (v: Vec3): string =>
  `${canon(v.x)},${canon(v.y)},${canon(v.z)}`;

/**
 * The steering segment (AI-01, plan 14-08): the last always-present segment of
 * the entity line, introduced by the unique label `;steer:` so a reader can
 * strip it and re-hash to the text before the record existed. The three
 * optional v4 segments (`;vel:`, `;wpn:`, `;cargo:`, D-09 pristine-omit) follow
 * it, in that order, and only when their field is not pristine. Every field of
 * the record prints, `escortSlot` included, in a fixed order; the two optional
 * parts carry explicit tags: `t0` or `t4:` (the tracking curve, whose ticks and
 * positions print only when the curve exists, so a stale sample at count 0
 * cannot make equal states hash apart) and `sv:z` or `sv:` (the saved
 * condition). The text holds no `;`, so the segment ends at the next line.
 */
function serializeSteer(steer: SteerComponent): string {
  const tracking =
    steer.trackingCount === 0
      ? "t0"
      : `t${int(steer.trackingCount)}:${steer.trackingTicks.map(int).join(",")},${steer.trackingPositions.map(vecText).join(",")}`;
  const saved =
    steer.saved === null
      ? "sv:z"
      : `sv:${steer.saved.behaviour},${int(steer.saved.targetId)},${canon(steer.saved.desiredRange)},${canon(steer.saved.desiredSpeed)},${vecText(steer.saved.destination)}`;
  return [
    `rate:${canon(steer.flightRoll)},${canon(steer.flightPitch)},${canon(steer.stickRoll)},${canon(steer.stickPitch)}`,
    `acc:${canon(steer.accuracy)}`,
    `fr:${canon(steer.frustration)},${canon(steer.successFactor)}`,
    `po:${steer.pitchingOver ? 1 : 0}`,
    `jk:${vecText(steer.jink)}`,
    `pa:${int(steer.proximityAlert)}`,
    `es:${int(steer.escortSlot)}`,
    tracking,
    saved,
    `ep:${steer.entryPending ? 1 : 0}`,
  ].join(",");
}

/** One labelled line, `e<id>=` then every field in a fixed order. */
export function serializeEntity(entity: Entity): string {
  const { position: p, orientation: q, nav, ai, velocity, weapon } = entity;
  const aiText =
    ai === null
      ? "none"
      : `${ai.aiKey},${int(ai.wakeTick)},${int(ai.nextThinkTick)},${encodeParams(ai.params)}`;
  const segments = [
    `e${int(entity.id)}=${entity.kind}`,
    entity.scanClass,
    encodeHashString(entity.specKey),
    `owner:${int(entity.ownerId)}`,
    `spawn:${int(entity.spawnTick)}`,
    `r:${canon(entity.radius)}`,
    `speed:${canon(entity.speed)}`,
    `p:${canon(p.x)},${canon(p.y)},${canon(p.z)}`,
    `q:${canon(q.w)},${canon(q.x)},${canon(q.y)},${canon(q.z)}`,
    `rng:${int(entity.rng.ai)},${int(entity.rng.combat)}`,
    `nav:${nav.behaviour},${int(nav.targetId)},${canon(nav.destination.x)},${canon(nav.destination.y)},${canon(nav.destination.z)},${canon(nav.desiredRange)},${canon(nav.desiredSpeed)}`,
    `ai:${aiText}`,
    `repairs:${int(entity.repairs)}`,
    `en:${canon(entity.energy)},${canon(entity.maxEnergy)},${canon(entity.energyRechargeRate)}`,
    `steer:${serializeSteer(entity.steer)}`,
  ];
  // The optional v4 segments (FOUND-18, D-09): each prints whenever any of its
  // components is non-zero, so pristine-omit never hides a real difference, and
  // is absent for a pristine value, so a pristine entity hashes as before.
  if (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0) {
    segments.push(`vel:${vecText(velocity)}`);
  }
  if (
    weapon.temperature !== 0 ||
    weapon.lastShotTick !== 0 ||
    weapon.missedShots !== 0
  ) {
    segments.push(
      `wpn:${canon(weapon.temperature)},${int(weapon.lastShotTick)},${int(weapon.missedShots)}`,
    );
  }
  if (entity.cargo !== 0) segments.push(`cargo:${int(entity.cargo)}`);
  return segments.join(";");
}

/**
 * The static-health line (FOUND-18, D-08, D-09): the label `staticHealth:`
 * (deliberately not `statics:`, which would read like the unrelated
 * `World.statics` table) then the station, witchpoint and navBuoy energy,
 * comma-joined. `hashWorld` prints it only when the health is not pristine.
 */
export function serializeStaticHealth(health: StaticHealth): string {
  return `staticHealth:${canon(health.station)},${canon(health.witchpoint)},${canon(health.navBuoy)}`;
}

/** One buoy's segment of the `buoys:` line. */
function serializeBuoyState(buoy: BuoyState): string {
  const { offset, velocity } = buoy;
  return (
    `offset ${canon(offset.x)},${canon(offset.y)},${canon(offset.z)}` +
    `;velocity ${canon(velocity.x)},${canon(velocity.y)},${canon(velocity.z)}` +
    `;sub ${canon(buoy.subentityEnergy)}` +
    `;taking ${buoy.subentityTakingDamage ? "1" : "0"}`
  );
}

/**
 * The buoys line (Phase 18, PD-01, PD-02): the label `buoys:` then the
 * witchpoint's segment and the nav buoy's, joined by `|`, each
 * `offset x,y,z;velocity x,y,z;sub e;taking 0|1` (the offset from the layout
 * position, the drift, the subentity energy and the sticky routing flag).
 * `hashWorld` prints it only when the buoys are not pristine.
 */
export function serializeBuoyStates(buoys: BuoyStates): string {
  return `buoys:${serializeBuoyState(buoys.witchpoint)}|${serializeBuoyState(buoys.navBuoy)}`;
}

/**
 * The world's contribution to the hash text: "" while the world has never
 * spawned anything, otherwise `worldSeed=`, `nextId=`, `rng=` and `aiDropped=`
 * lines followed by one entity line per live non-dead entity in ascending id
 * order. The AI queue is never printed: it is empty at every tick boundary.
 */
export function serializeWorldSection(world: World): string {
  if (isNeverSpawned(world)) return "";
  const lines = [
    `worldSeed=${int(world.worldSeed)}`,
    `nextId=${int(world.store.nextId)}`,
    `rng=${int(world.rng.s)}`,
    `aiDropped=${int(world.aiDropped)}`,
  ];
  for (const entity of world.store.live) {
    if (!entity.dead) lines.push(serializeEntity(entity));
  }
  return lines.join("\n");
}

/** `[id, hash]` of every live non-dead dynamic entity, ascending by id. */
export function entityHashes(world: World): [EntityId, string][] {
  const pairs: [EntityId, string][] = [];
  for (const entity of world.store.live) {
    if (!entity.dead) pairs.push([entity.id, fnv1a32(serializeEntity(entity))]);
  }
  return pairs;
}

/**
 * The flight hash with the world section appended once anything spawned, and
 * the player's combat line appended once the combat state is not pristine.
 *
 * The combat rule is the same device as `isNeverSpawned` (Pattern 3): a run
 * that never fights, never changes view and never docks damaged leaves the
 * combat state field-for-field equal to `createPlayerCombatState()`
 * (`isPristineCombat`), prints nothing, and hashes exactly as it did before
 * combat existed, so the pinned flight hashes and the traffic-off hashes hold.
 * An absent state prints nothing either. The combat line follows the world
 * section, or the flight text when that section is empty. The state is repaired
 * first (`sanitizeCombat`, idempotent and a no-op on a state `stepPlayerCombat`
 * produced), so a poisoned value can neither read as pristine nor reach `canon`
 * (T-13-15).
 *
 * The static-health line (D-08, D-09) follows the world section and precedes the
 * combat line, and prints only when `world.staticHealth` is not pristine; this
 * holds for a never-spawned world too (its section is empty, the line still
 * prints). The buoys line (PD-01, PD-02) follows the static-health line and
 * precedes the combat line under the same rule, printed only when
 * `world.buoys` is not pristine. A hash call can mutate the world:
 * `sanitizeStaticHealth` repairs `world.staticHealth` and `sanitizeBuoyStates`
 * repairs `world.buoys` in place before printing (so a poisoned buoy can
 * neither reach `canon`, which throws on a non-finite number, nor read as
 * pristine), as the existing `sanitizeCombat(combat)` call already repairs the
 * combat state. That reaches callers that read like pure reads: the `?test=1`
 * probe's `worldHash` (`src/app/session/probe-publisher.ts:171-179`) and the
 * acceptance detectors (`tests/acceptance/detectors.ts`). The mutation is harmless there because it
 * changes a value only when the state is already corrupt.
 */
export function hashWorld(
  player: FlightState,
  world: World | undefined,
  combat?: PlayerCombatState,
): string {
  const section = world === undefined ? "" : serializeWorldSection(world);
  let text = serializeFlight(player) + (section === "" ? "" : `\n${section}`);
  if (world !== undefined) {
    // Repair first so a poisoned value cannot reach `canon` or read as pristine.
    sanitizeStaticHealth(world);
    sanitizeBuoyStates(world);
    if (!isPristineStaticHealth(world.staticHealth)) {
      text += `\n${serializeStaticHealth(world.staticHealth)}`;
    }
    if (!isPristineBuoyStates(world.buoys)) {
      text += `\n${serializeBuoyStates(world.buoys)}`;
    }
  }
  if (combat !== undefined) {
    // Repair first so a poisoned value cannot read as pristine or reach `canon`.
    sanitizeCombat(combat);
    if (!isPristineCombat(combat)) text += `\n${serializeCombat(combat)}`;
  }
  return fnv1a32(text);
}
