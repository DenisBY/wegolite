// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted flight pilot (AI-01, WORLD-07; plan 14-16). A TEST-ONLY AI key:
 * the populator never spawns it, and only `spawnTestFlyers` and the acceptance
 * run attach it to a ship. In normal play NPC ships stay inert (Phase 12 D-02).
 *
 * It assigns the native behaviours of Oolite's flight AI through `ShipControl`
 * alone (`setTarget`, `setDestination`, `setDesiredRange`, `setDesiredSpeed`,
 * `perform`) and reads the world through `WorldView` alone. It keeps all its
 * state as plain strings and numbers in its own `AiComponent`, so it survives a
 * snapshot, and it draws no random numbers: the script is a scenario parameter,
 * not an Oolite AI decision, so nothing here is a port of Oolite code.
 *
 * Scripts (`params.script`):
 *  - `station`: fly to the main station until `range` metres from its centre
 *    (FLY_RANGE_FROM_DESTINATION);
 *  - `intercept`: fly at `targetId` until within `range` metres of its hull
 *    (INTERCEPT_TARGET);
 *  - `flee`: fly away from `targetId` until more than `range` metres from its
 *    hull (FLEE_TARGET);
 *  - `attack`: attack `targetId` (ATTACK_TARGET);
 *  - `escort`: hold the formation behind the ship's owner (FORMATION_FORM_UP;
 *    the owner and slot are spawn fields, not pilot params);
 *  - `face`: turn to face the main station (FACE_DESTINATION).
 * An unknown script name makes the pilot go done at once (T-14-27).
 *
 * Fire (Phase 17, D-05): the option `fire: true` puts the param `fire: true` on
 * the component, which makes the world step give the ship's steering a
 * `ctx.fire`; the attack behaviours then ask the NPC fire gate at Oolite's own
 * call sites. This module never calls `ctl.fire` itself, so the two routes stay
 * exclusive: one ship makes at most one request per tick and the gate draws once
 * per Oolite call (a test pins both).
 *
 * Phases (`params.phase`): `start` (the first think issues the script's calls,
 * once), `flying`, `done` (IDLE at desired speed 0). `params.frustrated` counts
 * every `shipAIFrustrated` the ship's steering posted, in every phase; the
 * 20-seed run reads it.
 *
 * Goal metrics (`scriptGoalMetric`): one definition each, the one
 * `tests/acceptance/thresholds.ts` states and the scenario and the detectors
 * use too. The station metric is the centre distance to the station centre; the
 * intercept and flee metrics are Oolite's `rangeToPrimaryTarget`
 * (`ShipEntity.m:9718-9733`), the centre distance minus both collision radii,
 * read through `BodyView.radius`.
 */

import { sub } from "../../math.js";
import { NO_ENTITY } from "../../world/ids.js";
import type { EntityId } from "../../world/ids.js";
import type { WorldView } from "../../world/view.js";
import { THINK_INTERVAL_TICKS } from "../time.js";
import type { AiComponent, AiContext, AiEvent, AiModule } from "../types.js";

/** The scripts a flight-script pilot can run. */
export type FlightScript =
  "station" | "intercept" | "flee" | "attack" | "escort" | "face";

/** What `createFlightScriptAi` takes. */
export interface FlightScriptOptions {
  readonly script: FlightScript;
  /** The target (the player, for intercept, flee and attack); 0 for none. */
  readonly targetId?: EntityId;
  /** The desired range in metres (the script's goal range, or the formation's). */
  readonly range?: number;
  /** The desired speed in m/s (station and intercept). */
  readonly speed?: number;
  /**
   * Opt in to weapon fire (Phase 17, D-05): the steering of an attack behaviour
   * may then ask the NPC fire gate at Oolite's `fireMainWeapon:` sites. Absent
   * unless true, so a pilot that never fires keeps its params and its hash.
   */
  readonly fire?: boolean;
}

const PHASE_START = "start";
const PHASE_FLYING = "flying";
const PHASE_DONE = "done";

/** A fresh flight-script AI state whose first think is due at `tick`. */
export function createFlightScriptAi(
  tick: number,
  options: FlightScriptOptions,
): AiComponent {
  return {
    aiKey: "flight-script",
    params: {
      script: options.script,
      phase: PHASE_START,
      targetId: options.targetId ?? NO_ENTITY,
      range: options.range ?? 0,
      speed: options.speed ?? 0,
      frustrated: 0,
      // Present only when asked for, as on the test pilot: the key is the
      // opt-in `steerEntity` reads, and a pilot without it keeps the param set
      // (and the hash) it had before Phase 17.
      ...(options.fire === true ? { fire: true } : {}),
    },
    wakeTick: 0,
    nextThinkTick: tick,
  };
}

/** A numeric param, or `fallback` when it is absent or not a number. */
function numberParam(ai: AiComponent, key: string, fallback: number): number {
  const value = ai.params[key];
  return typeof value === "number" ? value : fallback;
}

/** A string param, or `fallback` when it is absent or not a string. */
function stringParam(ai: AiComponent, key: string, fallback: string): string {
  const value = ai.params[key];
  return typeof value === "string" ? value : fallback;
}

function distanceBetween(
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number },
): number {
  const d = sub(a, b);
  return Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
}

/**
 * The goal metric of `script` for ship `self`, in metres, or undefined for a
 * script with no goal metric or a body the view does not hold.
 *
 *  - `station`: centre distance from `self` to the main station's centre;
 *  - `intercept` and `flee`: the centre distance to `targetId` minus both
 *    collision radii (`rangeToPrimaryTarget`, `ShipEntity.m:9718-9733`).
 *
 * The goal is met at or below the station range, below the intercept range and
 * above the flee range (`tests/acceptance/thresholds.ts`, `GOAL_METRICS`).
 */
export function scriptGoalMetric(
  view: WorldView,
  self: EntityId,
  script: string,
  targetId: EntityId,
): number | undefined {
  const own = view.body(self);
  if (own === undefined) return undefined;
  switch (script) {
    case "station": {
      const station = view.body(view.mainStation());
      return station === undefined
        ? undefined
        : distanceBetween(station.position, own.position);
    }
    case "intercept":
    case "flee": {
      const target = view.body(targetId);
      return target === undefined
        ? undefined
        : distanceBetween(target.position, own.position) -
            target.radius -
            own.radius;
    }
    default:
      return undefined;
  }
}

/** The behaviours a ship leaves a flee in when EVASIVE_ACTION hands over to attack. */
function isAttackFamily(behaviour: string): boolean {
  switch (behaviour) {
    case "ATTACK_TARGET":
    case "ATTACK_FLY_TO_TARGET":
    case "ATTACK_FLY_FROM_TARGET":
    case "RUNNING_DEFENSE":
    case "ATTACK_FLY_TO_TARGET_SIX":
    case "ATTACK_MINING_TARGET":
    case "ATTACK_BREAK_OFF_TARGET":
    case "ATTACK_SLOW_DOGFIGHT":
    case "ATTACK_FLY_TO_TARGET_TWELVE":
    case "ATTACK_SNIPER":
    case "ATTACK_BROADSIDE":
    case "ATTACK_BROADSIDE_LEFT":
    case "ATTACK_BROADSIDE_RIGHT":
    case "CLOSE_TO_BROADSIDE_RANGE":
    case "CLOSE_WITH_TARGET":
      return true;
    default:
      return false;
  }
}

/** The goal is reached: IDLE at desired speed 0, and the pilot is done. */
function finish(ctx: AiContext): void {
  const { self, ctl, ai } = ctx;
  ai.params.phase = PHASE_DONE;
  ctl.setDesiredSpeed(self, 0);
  ctl.perform(self, "IDLE");
}

/** The ShipControl calls of the script, issued once. */
function start(ctx: AiContext): void {
  const { self, view, ctl, ai } = ctx;
  const targetId = numberParam(ai, "targetId", NO_ENTITY);
  const range = numberParam(ai, "range", 0);
  const speed = numberParam(ai, "speed", 0);
  switch (stringParam(ai, "script", "")) {
    case "station": {
      const station = view.body(view.mainStation());
      if (station === undefined) {
        finish(ctx);
        return;
      }
      ctl.setDestination(self, station.position);
      ctl.setDesiredRange(self, range);
      ctl.setDesiredSpeed(self, speed);
      ctl.perform(self, "FLY_RANGE_FROM_DESTINATION");
      break;
    }
    case "intercept":
      ctl.setTarget(self, targetId);
      ctl.setDesiredRange(self, range);
      ctl.setDesiredSpeed(self, speed);
      ctl.perform(self, "INTERCEPT_TARGET");
      break;
    case "flee":
      ctl.setTarget(self, targetId);
      ctl.setDesiredRange(self, range);
      ctl.perform(self, "FLEE_TARGET");
      break;
    case "attack":
      ctl.setTarget(self, targetId);
      ctl.perform(self, "ATTACK_TARGET");
      break;
    case "escort":
      ctl.setDesiredRange(self, range);
      ctl.perform(self, "FORMATION_FORM_UP");
      break;
    case "face": {
      const station = view.body(view.mainStation());
      if (station === undefined) {
        finish(ctx);
        return;
      }
      ctl.setDestination(self, station.position);
      ctl.setDesiredRange(self, range);
      ctl.perform(self, "FACE_DESTINATION");
      break;
    }
    default:
      // An unknown script (a forged param) does nothing and goes idle.
      finish(ctx);
      return;
  }
  ai.params.phase = PHASE_FLYING;
}

/** The checks of a flying pilot: the flee goal, and the flee re-issue. */
function fly(ctx: AiContext): void {
  const { self, view, ctl, ai } = ctx;
  if (stringParam(ai, "script", "") !== "flee") return;
  const metric = scriptGoalMetric(
    view,
    self,
    "flee",
    numberParam(ai, "targetId", NO_ENTITY),
  );
  if (metric !== undefined && metric > numberParam(ai, "range", 0)) {
    finish(ctx);
    return;
  }
  // EVASIVE_ACTION hands over to ATTACK_TARGET after 0.5 s
  // (`ShipEntity.m:4021-4028`); Oolite's priority AI would choose flee again,
  // and the scripted counterpart is to perform it again.
  const ship = view.ship(self);
  if (ship !== undefined && isAttackFamily(ship.behaviour)) {
    ctl.perform(self, "FLEE_TARGET");
  }
}

function think(ctx: AiContext): void {
  const { view, ai } = ctx;
  ai.nextThinkTick = view.tick + THINK_INTERVAL_TICKS;
  const phase = stringParam(ai, "phase", PHASE_DONE);
  if (phase === PHASE_START) {
    start(ctx);
  } else if (phase === PHASE_FLYING) {
    fly(ctx);
  }
}

function onEvent(ctx: AiContext, event: AiEvent): void {
  const { ai } = ctx;
  switch (event.name) {
    case "shipAIFrustrated":
      ai.params.frustrated = numberParam(ai, "frustrated", 0) + 1;
      break;
    case "shipAchievedDesiredRange":
    case "shipNowFacingDestination":
    case "shipTargetLost":
      if (stringParam(ai, "phase", PHASE_DONE) !== PHASE_DONE) finish(ctx);
      break;
    default:
      break;
  }
}

export const FLIGHT_SCRIPT: AiModule = Object.freeze({ think, onEvent });
