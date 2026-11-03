// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { canon, fnv1a32 } from "./hash.js";
import { identity, vec } from "./math.js";
import type { Quat, Vec3 } from "./math.js";

/**
 * The whole simulated world for the Phase 1 probe. Plain data: no methods, no
 * clock, no DOM. `step()` mutates it in place and `serialize()` reads it.
 */
export interface SimState {
  tick: number;
  position: Vec3;
  velocity: Vec3;
  orientation: Quat;
}

/**
 * The replay contract: one frame of device input, all components dimensionless
 * in [-1, 1]. No flight constants live here — Phase 3 owns those (D-09).
 *
 * This is the **only** input-frame shape in the app (FLGT-07, FLGT-08). The
 * keyboard source imports it, the controller consumes it, and `src/input/**`
 * never declares a second one — a duplicate would be a second seam between
 * devices and the deterministic step.
 *
 * `thrust` is the Phase 1 kinematic-probe axis. It stays optional so the probe's
 * recorded input log (and its golden hash) keeps replaying unchanged while the
 * flight model reads `pitch`/`roll`/`speed`.
 */
export interface InputFrame {
  pitch: number;
  roll: number;
  speed: number;
  precision: boolean;
  thrust?: number;
}

export function initState(): SimState {
  return {
    tick: 0,
    position: vec(0, 0, 0),
    velocity: vec(0, 0, 0),
    orientation: identity(),
  };
}

/**
 * Canonical labelled text: fixed key order, one record per line, every number
 * through `canon`. Never `JSON.stringify` — property order and float formatting
 * would drift and silently weaken the golden fixtures (D-11).
 */
export function serialize(state: SimState): string {
  return [
    `tick=${canon(state.tick, 0)}`,
    `p=${canon(state.position.x)},${canon(state.position.y)},${canon(state.position.z)}`,
    `v=${canon(state.velocity.x)},${canon(state.velocity.y)},${canon(state.velocity.z)}`,
    `q=${canon(state.orientation.w)},${canon(state.orientation.x)},${canon(state.orientation.y)},${canon(state.orientation.z)}`,
  ].join("\n");
}

export function hashState(state: SimState): string {
  return fnv1a32(serialize(state));
}
