// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted test pilot (D-11, FOUND-13). It reads the world only through
 * `WorldView`, acts only through `ShipControl`, keeps its state as plain data in
 * its own `AiComponent`, and draws randomness only from the stream passed in its
 * context. The populator never spawns it: it is reachable only through
 * `AI_REGISTRY` and test code. Phase 13 reuses it as the shooter for the shared
 * hit rule: a pilot created with `fire: true` asks `ShipControl.fire` on every
 * tick of the hold phase while its target is valid (Phase 17, D-09: it
 * schedules a wake one tick ahead each think), holding its target as its nav
 * target. It never decides the rate: the NPC fire gate does (heat, energy, the
 * whole-tick shot timer, the range roll and `onTarget`).
 *
 * `scanRange`, `holdRange` and `cruiseSpeed` are test-pilot parameters, not
 * Oolite ship data.
 *
 * `params.targetId` is an id of the pilot's own world (per-world id scope,
 * CONTEXT D-06 as amended 2026-11-12): it lives in the `AiComponent` inside that
 * world's store and snapshot, is valid only while `view.isValid` says so, is
 * re-checked before every use in phase "hold", and is never copied out of the
 * `AiComponent`. A target the view does not hold sends the pilot back to "seek".
 */

import { lengthSquared, sub } from "../../math.js";
import { NO_ENTITY } from "../../world/ids.js";
import type { BodyKind } from "../../world/ids.js";
import { THINK_INTERVAL_TICKS, ticks } from "../time.js";
import type { AiComponent, AiContext, AiModule } from "../types.js";

/** The Oolite scanner range in metres. */
const DEFAULT_SCAN_RANGE = 25_600;
const DEFAULT_HOLD_RANGE = 1_000;
const DEFAULT_CRUISE_SPEED = 100;

/**
 * The kinds a test pilot's scan reports: every `BodyKind` except `cargo` and
 * `wreckage` (D16-03, Pitfall 2), so debris never becomes a target and a pilot
 * in a field of pods still picks a ship or a body. Oolite's own ship scan
 * skips `CLASS_CARGO` the same way (`checkScannerIgnoringUnpowered`,
 * `ShipEntity.m:8493`). Hash-neutral for every world without debris.
 */
export const TEST_PILOT_SCAN_KINDS: readonly BodyKind[] = Object.freeze([
  "planet",
  "sun",
  "station",
  "buoy",
  "player",
  "ship",
  "missile",
]);

const PHASE_SEEK = "seek";
const PHASE_HOLD = "hold";

/** A fresh test-pilot AI state whose first think is due at `tick`. */
export function createTestPilotAi(
  tick: number,
  options: {
    scanRange?: number;
    holdRange?: number;
    cruiseSpeed?: number;
    /** Ask to fire the forward weapon on every tick of the hold phase (CBT-07). */
    fire?: boolean;
  } = {},
): AiComponent {
  return {
    aiKey: "test-pilot",
    params: {
      phase: PHASE_SEEK,
      targetId: NO_ENTITY,
      scanRange: options.scanRange ?? DEFAULT_SCAN_RANGE,
      holdRange: options.holdRange ?? DEFAULT_HOLD_RANGE,
      cruiseSpeed: options.cruiseSpeed ?? DEFAULT_CRUISE_SPEED,
      // Present only when asked for, so a pilot that never fires keeps the
      // param set (and the hash) it had before Phase 13.
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

function seek(ctx: AiContext): void {
  const { self, view, ctl, ai } = ctx;
  const holdRange = numberParam(ai, "holdRange", DEFAULT_HOLD_RANGE);
  const hits = view.scan(
    self,
    numberParam(ai, "scanRange", DEFAULT_SCAN_RANGE),
    { kinds: TEST_PILOT_SCAN_KINDS },
  );
  const targetId = hits[0];
  const own = view.ship(self);
  const target = targetId === undefined ? undefined : view.body(targetId);
  if (targetId === undefined || own === undefined || target === undefined) {
    ctl.setDesiredSpeed(self, 0);
    ctl.perform(self, "IDLE");
    return;
  }
  ctl.setTarget(self, targetId);
  ctl.setDestination(self, target.position);
  ctl.setDesiredRange(self, holdRange);
  ctl.setDesiredSpeed(
    self,
    numberParam(ai, "cruiseSpeed", DEFAULT_CRUISE_SPEED),
  );
  ctl.perform(self, "FLY_TO_DESTINATION");
  ai.params.targetId = targetId;
  if (
    lengthSquared(sub(target.position, own.position)) <=
    holdRange * holdRange
  ) {
    ai.params.phase = PHASE_HOLD;
    ctl.setDesiredSpeed(self, 0);
    ctl.perform(self, "STOP_STILL");
  }
}

function hold(ctx: AiContext): void {
  const { self, view, ctl, ai } = ctx;
  const targetId = numberParam(ai, "targetId", NO_ENTITY);
  if (!view.isValid(targetId)) {
    // Target lost: forget it and look again on the next think.
    ai.params.phase = PHASE_SEEK;
    ai.params.targetId = NO_ENTITY;
    ctl.setTarget(self, NO_ENTITY);
    return;
  }
  ctl.setDesiredSpeed(self, 0);
  if (ai.params.fire !== true) return;
  // The pilot's nav target is the gate's target (Phase 17): the spawn sets only
  // the param, so the target is set once here, never again while it holds
  // (`setTarget` restarts the tracking curve, Pitfall G).
  if (view.ship(self)?.targetId !== targetId) ctl.setTarget(self, targetId);
  // D-09: ask on every tick. The wake is one tick away (the think's own random
  // wake later never moves it back, the never-later rule) and the request is the
  // command the player's fire key becomes; the NPC fire gate at the drain sets
  // the rate, not the think cadence (CBT-07, CBT-15).
  ctl.scheduleWake(self, 1);
  ctl.fire(self);
}

function think(ctx: AiContext): void {
  const { self, view, ctl, ai, random } = ctx;
  ai.nextThinkTick = view.tick + THINK_INTERVAL_TICKS;
  if (ai.params.phase === PHASE_HOLD) {
    hold(ctx);
  } else {
    seek(ctx);
  }
  // Oolite's reconsiderNow spans 0.1 to 1.6 s (oolite-priorityai.js).
  ctl.scheduleWake(self, ticks(0.1 + random() * 1.5));
}

export const TEST_PILOT: AiModule = Object.freeze({ think });
