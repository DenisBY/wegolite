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

/**
 * The registered AI keys. The AI registry (plan 08-09) keys on the same list.
 * `"priority"` (plan 21-07, FOUND-20) is the state shape of the hand-ported
 * priority AI of Phase 23: registered inert, spawned by nothing before then.
 */
export const AI_KEYS = ["test-pilot", "flight-script", "priority"] as const;
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
  // Plan 21-07 (FOUND-20): the priority AI's handler names, appended, never
  // renamed. Oolite's `shipBeingAttacked` is the existing `shipAttacked`. Each
  // comment names the `oolite-priorityai.js` response (pin 7437f22) the name
  // stands for; the events have no producer until Phase 23.
  /** responseComponent_standard_approachingPlanetSurface (:4890, :4981). */
  "approachingPlanetSurface",
  /** responseComponent_standard_cargoDumpedNearby (:4891, :4998). */
  "cargoDumpedNearby",
  /** responseComponent_standard / station / missile _commsMessageReceived (:4893, :5024). */
  "commsMessageReceived",
  /** responseComponent_standard_escortAccepted, to the mother ship (:4895, :5062). */
  "escortAccepted",
  /** responseComponent_standard_shipAcceptedEscort, to the escort (:4898, :5194). */
  "shipAcceptedEscort",
  /** responseComponent_standard_shipAttackerDistracted (:4901, :5294). */
  "shipAttackerDistracted",
  /** responseComponent_standard_shipWillEnterWormhole (:4908, :5619). */
  "shipWillEnterWormhole",
  /** responseComponent_standard_wormholeSuggested (:4909, :5645). */
  "wormholeSuggested",
  /** responseComponent_standard / trackPlayer _playerWillEnterWitchspace (:4915, :5179, :6181). */
  "playerWillEnterWitchspace",
  /** responseComponent_standard_shipWitchspaceBlocked (:3055, :5626). */
  "shipWitchspaceBlocked",
  /** responseComponent_docking_stationWithdrewDockingClearance (:4929, :6074). */
  "stationWithdrewDockingClearance",
  /** responseComponent_escort_escortDock (:4938, :6081). */
  "escortDock",
  /** responseComponent_scooping_shipScoopedFuel (:4945, :6172). */
  "shipScoopedFuel",
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
