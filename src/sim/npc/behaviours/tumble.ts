// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_tumble:` (AI-01, plan 14-09; `ShipEntity.m:3724-3727`).
 *
 * A tumbling ship keeps the sticks `performTumble` drew (`ShipEntityAI.m:473-479`,
 * completed by `completeEntry` in `../enter.ts`) and only slews its rates toward
 * them. `applyThrust` returns for TUMBLE before it ramps or moves
 * (`ShipEntity.m:5826-5827`), so a tumbling ship turns in place.
 */

import type { Entity } from "../../world/entity.js";
import type { SteerContext } from "../dispatch.js";
import { applySticks } from "../flight.js";

export function behaviourTumble(entity: Entity, ctx: SteerContext): void {
  applySticks(entity, ctx.dt);
}
