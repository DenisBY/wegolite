// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

// src/sim/world/entity.ts (plan 08-05) imports AiComponent from this file, so
// types.ts must stay free of every import outside the AI allow-list (AI
// siblings, sim math, world/ids, world/view, world/control); the AI lint zone
// (plan 08-09) enforces it, and a cycle through the world core is impossible.
import type { ShipControl } from "../world/control.js";
import type { EntityId } from "../world/ids.js";
import type { WorldView } from "../world/view.js";

/**
 * The AI component's data shape (FOUND-11) and the AI contract (D-11): types
 * plus two closed vocabularies; the AI zone grows around these records in later
 * plans.
 */

/** The registered AI keys. The AI registry (plan 08-09) keys on the same list. */
export const AI_KEYS = ["test-pilot"] as const;
export type AiKey = (typeof AI_KEYS)[number];

/**
 * One AI param value. This is the domain the three validators share
 * (`spawnEntity`, `sanitizeEntity` and the snapshot parser):
 *
 * - `null` and `boolean` are legal scalars and survive a JSON round trip
 *   unchanged;
 * - a `number` is legal only when finite with magnitude at most
 *   `MAX_ENTITY_MAGNITUDE`, so a non-finite number is never a legal param:
 *   `spawnEntity` refuses it, `sanitizeEntity` repairs it to 0, and
 *   `snapshotWorld` refuses to emit it, because JSON would turn it into a
 *   legal `null`;
 * - a `string` is at most `MAX_SNAPSHOT_STRING_LENGTH` code units;
 * - an array holds finite numbers (same bound) or strings only, never `null`,
 *   a boolean, an array or an object, and at most `MAX_SNAPSHOT_PARAM_LENGTH`
 *   elements.
 *
 * A nested plain object is never legal.
 */
export type ParamValue =
  null | boolean | number | string | readonly (number | string)[];

/** The AI state of one entity. Integer ticks; `wakeTick` 0 means none. */
export interface AiComponent {
  aiKey: AiKey;
  params: Record<string, ParamValue>;
  wakeTick: number;
  nextThinkTick: number;
}

/**
 * The AI event names, ported from Oolite's `AI_` message set (ARCHITECTURE
 * section 7.4). A closed list: an event is data, never a free string.
 */
export const AI_EVENT_NAMES = [
  "shipAttacked",
  "shipAttackedOther",
  "shipAttackedWithMissile",
  "shipBeingAttackedUnsuccessfully",
  "shipTargetLost",
  "shipTargetDestroyed",
  "shipKilledOther",
  "shipFiredMissile",
  "cascadeWeaponDetected",
  "shipAchievedDesiredRange",
  "shipCloseContact",
  "shipLaunchedEscapePod",
  "shipScoopedOther",
  "shipWasScooped",
  "shipDockedWithStation",
  "shipLaunchedFromStation",
  "shipEnteredPlanetaryVicinity",
  "shipEnteredStationAegis",
  "offenceCommittedNearby",
  "distressMessageReceived",
  "helpRequestReceived",
  "shipNowFacingDestination",
  "shipAIFrustrated",
] as const;
export type AiEventName = (typeof AI_EVENT_NAMES)[number];

/** One event addressed to an entity's AI. Plain data. */
export interface AiEvent {
  readonly to: EntityId;
  readonly name: AiEventName;
  readonly a?: EntityId;
  readonly b?: EntityId;
  readonly n?: number;
}

/**
 * Everything one AI decision may touch. `view` is the read side of the seam,
 * `ctl` the write side; `ai` is the actor's own mutable AI state and `random`
 * draws from the actor's own "ai" stream.
 */
export interface AiContext {
  readonly self: EntityId;
  readonly view: WorldView;
  readonly ctl: ShipControl;
  readonly ai: AiComponent;
  readonly random: () => number;
}

/** A registered AI: a pure decision function over its context. */
export interface AiModule {
  readonly think: (ctx: AiContext) => void;
  readonly onEvent?: (ctx: AiContext, event: AiEvent) => void;
}
