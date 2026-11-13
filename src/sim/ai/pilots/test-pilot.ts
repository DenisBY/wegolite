// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted test pilot (D-11, FOUND-13). It reads the world only through
 * `WorldView`, acts only through `ShipControl`, keeps its state as plain data in
 * its own `AiComponent`, and draws randomness only from the stream passed in its
 * context. The populator never spawns it: it is reachable only through
 * `AI_REGISTRY` and test code. Phase 13 reuses it as the shooter for the shared
 * hit rule.
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
import { THINK_INTERVAL_TICKS, ticks } from "../time.js";
import type { AiComponent, AiContext, AiModule } from "../types.js";

/** The Oolite scanner range in metres. */
const DEFAULT_SCAN_RANGE = 25_600;
const DEFAULT_HOLD_RANGE = 1_000;
const DEFAULT_CRUISE_SPEED = 100;

const PHASE_SEEK = "seek";
const PHASE_HOLD = "hold";

/** A fresh test-pilot AI state whose first think is due at `tick`. */
export function createTestPilotAi(
  tick: number,
  options: {
    scanRange?: number;
    holdRange?: number;
    cruiseSpeed?: number;
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
