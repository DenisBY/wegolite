// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The composed world hash (FOUND-11, FOUND-12, D-08).
 *
 * `hashWorld(player, world)` is `fnv1a32(serializeFlight(player) + section)`.
 * While the world has never spawned anything (`isNeverSpawned`, the single
 * predicate of `./world.ts`) the section is empty and the text is exactly the
 * v1 flight text, so the pinned flight hashes hold. Once anything has spawned,
 * or `world.rng` has been drawn, the section is appended. `serializeFlight`
 * is never edited. The five static entities are never serialised: they are
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
import { serializeFlight } from "../flight/state.js";
import type { FlightState } from "../flight/state.js";
import type { ParamValue } from "../ai/types.js";
import type { Entity } from "./entity.js";
import type { EntityId } from "./ids.js";
import { isNeverSpawned } from "./world.js";
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

/** One labelled line, `e<id>=` then every field in a fixed order. */
export function serializeEntity(entity: Entity): string {
  const { position: p, orientation: q, nav, ai } = entity;
  const aiText =
    ai === null
      ? "none"
      : `${ai.aiKey},${int(ai.wakeTick)},${int(ai.nextThinkTick)},${encodeParams(ai.params)}`;
  return [
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
  ].join(";");
}

/**
 * The world's contribution to the hash text: "" while the world has never
 * spawned anything, otherwise `worldSeed=`, `nextId=` and `rng=` lines followed
 * by one entity line per live non-dead entity in ascending id order.
 */
export function serializeWorldSection(world: World): string {
  if (isNeverSpawned(world)) return "";
  const lines = [
    `worldSeed=${int(world.worldSeed)}`,
    `nextId=${int(world.store.nextId)}`,
    `rng=${int(world.rng.s)}`,
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

/** The flight hash with the world section appended once anything spawned. */
export function hashWorld(
  player: FlightState,
  world: World | undefined,
): string {
  const section = world === undefined ? "" : serializeWorldSection(world);
  return fnv1a32(
    serializeFlight(player) + (section === "" ? "" : `\n${section}`),
  );
}
