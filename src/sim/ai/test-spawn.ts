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
 */

import type { FlightState } from "../flight/state.js";
import { add, mul, normalize, quat, rotate, scale, vec } from "../math.js";
import { PLAYER_ID } from "../world/ids.js";
import { isScanClass } from "../world/populate.js";
import type { InertShipRecord } from "../world/populate.js";
import { spawnEntity } from "../world/world.js";
import type { World } from "../world/world.js";
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
 */
export function spawnTestShooter(
  world: World,
  player: Pick<FlightState, "position" | "orientation">,
  record: InertShipRecord,
  tick: number,
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
    },
    tick,
  ).ok;
}
