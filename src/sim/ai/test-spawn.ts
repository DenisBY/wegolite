// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `?test=1` shooter seam (CBT-07, D-11): put one scripted test pilot in the
 * player's sights so a browser spec can watch shields and energy fall without
 * a combat AI existing yet.
 *
 * This is a world-side helper, not an AI module: it spawns into a world and
 * reads the flight state, so the lint zone for AI code does not apply to it
 * (the one carve-out in `eslint.config.js`). The populator never calls it; only
 * the `?test=1` hook does, and that taints the session first so no autosave can
 * make the spawned ship durable.
 *
 * `spawnTestFlyers` (plan 14-16) is the second seam of the same kind: three
 * flight-script ships for the `?test=1` flying-NPC hook and the acceptance run.
 *
 * `spawnTestAttacker` (plan 17-10, D-02) is the third: one Viper that attacks
 * the player with Phase 14's attack behaviours and fires through the NPC fire
 * gate. Like the others it is reachable only from the `?test=1` hook, which
 * taints the session first, and it is for manual checks and UAT only.
 */

import type { FlightState } from "../flight/state.js";
import {
  add,
  cos as mathCos,
  mul,
  normalize,
  normalizeVec,
  quat,
  quatFromUnitVectors,
  rotate,
  scale,
  sin as mathSin,
  sub,
  vec,
} from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import { statsFor } from "../npc/stats.js";
import type { NpcFlightStats } from "../npc/stats.js";
import { MAX_ENTITIES, PLAYER_ID } from "../world/ids.js";
import type { ScanClass } from "../world/ids.js";
import { isScanClass } from "../world/populate.js";
import type { InertShipRecord } from "../world/populate.js";
import { liveEntityCount, spawnEntity } from "../world/world.js";
import type { World } from "../world/world.js";
import type { FlightScript } from "./pilots/flight-script.js";
import { createFlightScriptAi } from "./pilots/flight-script.js";
import { createTestPilotAi } from "./pilots/test-pilot.js";

/** How far ahead of the player the shooter appears, in metres. */
export const TEST_SHOOTER_DISTANCE = 1_500;

/** The test pilot's hold range for the shooter, in metres (beyond the distance). */
export const TEST_SHOOTER_HOLD_RANGE = 2_000;

/** The player's nose: local -Z. */
const LOCAL_FORWARD = vec(0, 0, -1);

/** A half turn about the up axis: a ship's nose and tail swap. */
const HALF_TURN_ABOUT_UP = quat(0, 0, 1, 0);

/**
 * Spawn one firing test pilot of `record` ahead of the player, facing it.
 *
 * The ship appears `TEST_SHOOTER_DISTANCE` metres along the player's nose, turned
 * half a turn about the player's own up axis so its nose points back at the
 * player. Its AI is a test pilot with `fire: true`, already in its hold phase
 * with the player as its target, so the first think fires and the shot meets the
 * player's hull by the shared hit rule. The target is the player by
 * construction, not by a scan: a station or planet nearer than the player could
 * otherwise win the scan and the shooter would fire at it instead.
 *
 * Returns whether the world accepted the ship. A record whose scan class is not
 * in the closed vocabulary is refused (false), as the populator does.
 *
 * `cargo` (Phase 16, D16-09) is the optional cargo capsule count the ship
 * carries, so a kill releases pods. It is put into the `SpawnInit` only when
 * defined: without it the spawn is bit for bit the Phase 15 one (cargo 0, no
 * cargo segment in the hash). A value outside `spawnEntity`'s domain (an
 * integer 0 to `MAX_ENTITY_CARGO`) is refused there, and nothing spawns.
 */
export function spawnTestShooter(
  world: World,
  player: Pick<FlightState, "position" | "orientation">,
  record: InertShipRecord,
  tick: number,
  cargo?: number,
): boolean {
  if (!isScanClass(record.scanClass)) return false;
  const nose = rotate(player.orientation, LOCAL_FORWARD);
  const ai = createTestPilotAi(tick, {
    fire: true,
    holdRange: TEST_SHOOTER_HOLD_RANGE,
  });
  ai.params.phase = "hold";
  ai.params.targetId = PLAYER_ID;
  return spawnEntity(
    world,
    {
      kind: "ship",
      specKey: record.key,
      scanClass: record.scanClass,
      position: add(player.position, scale(nose, TEST_SHOOTER_DISTANCE)),
      orientation: normalize(mul(player.orientation, HALF_TURN_ABOUT_UP)),
      radius: record.radius,
      speed: 0,
      ai,
      maxEnergy: record.maxEnergy,
      energyRechargeRate: record.energyRechargeRate,
      ...(cargo === undefined ? {} : { cargo }),
    },
    tick,
  ).ok;
}

/**
 * How far ahead of the player the attacker appears, in metres: the flyers'
 * distance, inside the beam laser's 15,000 m range and outside the shooter's
 * 1,500 m, so the attack behaviours have room to close and break off.
 */
export const TEST_ATTACKER_DISTANCE = 3_000;

/**
 * Spawn one attacking NPC of `record` ahead of the player (Phase 17, D-02).
 *
 * The ship appears `TEST_ATTACKER_DISTANCE` metres along the player's nose,
 * turned half a turn about the player's up axis so its nose points back at the
 * player, as the shooter is placed. Its AI is a flight-script pilot whose
 * params are exactly script `attack`, phase `start`, the player as its target
 * (by construction, not by a scan), range 0, speed 0, frustrated 0 and
 * `fire: true`: it flies Oolite's attack behaviours and asks the NPC fire gate
 * at their fire sites, so its hits drain the player's shields and then energy.
 *
 * Returns whether the world accepted the ship. A record whose scan class is not
 * in the closed vocabulary is refused (false), as the populator does. It is the
 * third seam of its kind: world-side, reachable only from the `?test=1` hook
 * (which taints the session before it calls this) and from tests; the populator
 * never calls it.
 */
export function spawnTestAttacker(
  world: World,
  player: Pick<FlightState, "position" | "orientation">,
  record: InertShipRecord,
  tick: number,
): boolean {
  if (!isScanClass(record.scanClass)) return false;
  const nose = rotate(player.orientation, LOCAL_FORWARD);
  return spawnEntity(
    world,
    {
      kind: "ship",
      specKey: record.key,
      scanClass: record.scanClass,
      position: add(player.position, scale(nose, TEST_ATTACKER_DISTANCE)),
      orientation: normalize(mul(player.orientation, HALF_TURN_ABOUT_UP)),
      radius: record.radius,
      speed: 0,
      ai: createFlightScriptAi(tick, {
        script: "attack",
        targetId: PLAYER_ID,
        fire: true,
      }),
      maxEnergy: record.maxEnergy,
      energyRechargeRate: record.energyRechargeRate,
    },
    tick,
  ).ok;
}

/** How far from the player each test flyer appears, in metres. */
export const TEST_FLYER_DISTANCE = 3_000;

/**
 * The flight-script ranges, in metres: the station script stops at this centre
 * distance from the station, the intercept script at this range from the
 * player's hull, and the flee script is done beyond this range (the scanner
 * range). They equal `STATION_SCRIPT_RANGE_M`, `INTERCEPT_SCRIPT_RANGE_M` and
 * `FLEE_SCRIPT_RANGE_M` of `tests/acceptance/thresholds.ts`, which a test pins.
 * `Object.freeze(...)`, because the AI zone's lint refuses an exported object
 * literal (`AI_MODULE_STATE_BANS`).
 */
export const FLYER_SCRIPT_RANGES = Object.freeze({
  station: 3_500,
  intercept: 1_500,
  flee: 25_600,
});

/** The player's nose is local -Z and its left is local -X. */
const LOCAL_LEFT = vec(-1, 0, 0);

/** The interceptor and the fleer appear this far off the player's nose. */
const FLYER_SPREAD_ANGLE = Math.PI / 6;

/** The record's scan class when it is in the closed vocabulary, else undefined. */
function scanClassOf(record: InertShipRecord): ScanClass | undefined {
  return isScanClass(record.scanClass) ? record.scanClass : undefined;
}

/** The three records `spawnTestFlyers` spawns, by script. */
export interface FlyerRecords {
  readonly station: InertShipRecord;
  readonly intercept: InertShipRecord;
  readonly flee: InertShipRecord;
}

/** Everything `spawnEntity` needs of one flyer, besides the record. */
interface FlyerPlan {
  readonly script: FlightScript;
  readonly record: InertShipRecord;
  readonly scanClass: ScanClass;
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly range: number;
}

/**
 * Spawn three flight-script ships `TEST_FLYER_DISTANCE` metres from the player
 * (WORLD-07, the `?test=1` hook, plan 14-16): a station flyer flying to the main
 * station, an interceptor flying at the player and a fleer flying away from it.
 * Each starts at its compiled maximum speed (`flight`, the compiled flight
 * table; Oolite's defaults when absent).
 *
 *  - The station flyer is 90 degrees left of the player's nose, with its own
 *    nose (local -Z) on `station`, the station's centre. Dead ahead of a
 *    just-launched player it would start pointing away from the station and fly
 *    back along the player's track.
 *  - The interceptor is 30 degrees left and the fleer 30 degrees right of the
 *    nose, both facing along it. The fleer's approach aspect to the player is
 *    then cos 30 degrees, below performFlee's 0.9995, so it takes FLEE_TARGET
 *    with no evasive draw.
 *
 * It validates all three records (a scan class in the closed vocabulary) and
 * that the world has room for three more live ships first, and returns false
 * without spawning anything if either fails. It returns true only if all three
 * spawned. If `spawnEntity` still refuses a ship after an earlier one spawned (a
 * case the pre-validation does not foresee, such as an exhausted id counter),
 * the earlier ships stay in the world and the function returns false: that
 * state is tainted. The `?test=1` hook taints the session before it calls this,
 * so no autosave can make such a state durable (T-14-40).
 *
 * Like `spawnTestShooter` it is world-side and used only by the `?test=1` hook
 * and by tests; the populator never calls it.
 */
export function spawnTestFlyers(
  world: World,
  player: Pick<FlightState, "position" | "orientation">,
  records: FlyerRecords,
  flight: readonly NpcFlightStats[] | undefined,
  tick: number,
  station: Vec3,
): boolean {
  const stationClass = scanClassOf(records.station);
  const interceptClass = scanClassOf(records.intercept);
  const fleeClass = scanClassOf(records.flee);
  if (
    stationClass === undefined ||
    interceptClass === undefined ||
    fleeClass === undefined ||
    MAX_ENTITIES - liveEntityCount(world) < 3
  ) {
    return false;
  }
  const nose = rotate(player.orientation, LOCAL_FORWARD);
  const left = rotate(player.orientation, LOCAL_LEFT);
  const around = (side: number, ahead: number): Vec3 =>
    add(
      player.position,
      add(
        scale(nose, TEST_FLYER_DISTANCE * ahead),
        scale(left, TEST_FLYER_DISTANCE * side),
      ),
    );
  const cos = mathCos(FLYER_SPREAD_ANGLE);
  const sin = mathSin(FLYER_SPREAD_ANGLE);
  const stationPosition = around(1, 0);
  const plans: readonly FlyerPlan[] = [
    {
      script: "station",
      record: records.station,
      scanClass: stationClass,
      position: stationPosition,
      orientation: normalize(
        quatFromUnitVectors(
          LOCAL_FORWARD,
          normalizeVec(sub(station, stationPosition)),
        ),
      ),
      range: FLYER_SCRIPT_RANGES.station,
    },
    {
      script: "intercept",
      record: records.intercept,
      scanClass: interceptClass,
      position: around(sin, cos),
      orientation: player.orientation,
      range: FLYER_SCRIPT_RANGES.intercept,
    },
    {
      script: "flee",
      record: records.flee,
      scanClass: fleeClass,
      position: around(-sin, cos),
      orientation: player.orientation,
      range: FLYER_SCRIPT_RANGES.flee,
    },
  ];
  let spawned = 0;
  for (const plan of plans) {
    const speed = statsFor(flight, plan.record.key).maxFlightSpeed;
    const result = spawnEntity(
      world,
      {
        kind: "ship",
        specKey: plan.record.key,
        scanClass: plan.scanClass,
        position: plan.position,
        orientation: plan.orientation,
        radius: plan.record.radius,
        speed,
        ai: createFlightScriptAi(tick, {
          script: plan.script,
          ...(plan.script === "station" ? {} : { targetId: PLAYER_ID }),
          range: plan.range,
          speed,
        }),
        maxEnergy: plan.record.maxEnergy,
        energyRechargeRate: plan.record.energyRechargeRate,
      },
      tick,
    );
    if (!result.ok) return false;
    spawned += 1;
  }
  return spawned === plans.length;
}
