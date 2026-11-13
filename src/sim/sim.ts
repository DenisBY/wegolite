// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The composed simulation step (FOUND-11, D-14).
 *
 * `stepSim` is the one function the session calls per fixed step: it runs the
 * unchanged `stepFlight` first and then `stepWorld`. The world side never
 * mutates the `FlightState`; the world is never passed into `stepFlight`.
 */

import type { Command } from "./commands.js";
import type { SimEvent } from "./events.js";
import type { FlightConfig } from "./flight/config.js";
import type { ControlIntent } from "./flight/controller.js";
import type { FlightState } from "./flight/state.js";
import { stepFlight } from "./flight/step.js";
import type { StepOptions } from "./flight/step.js";
import type { SystemLayout } from "./world/layout.js";
import { stepWorld } from "./world/step.js";
import type { World } from "./world/world.js";

/**
 * One fixed step: `stepFlight`, then, only when a world is passed, the player
 * is launching or in flight after the flight step, and the flight events hold
 * no `hyperspaceJumped`, `stepWorld`. Returns the flight events followed by the
 * world events.
 *
 * Jump-step rule (PROJECT.md Key Decisions row (h)): on the step that emits
 * `hyperspaceJumped` the player has already moved to the destination while
 * `layout` is still the origin's, and the arrival replaces the world right
 * after the step, so the old world is not stepped on that tick. The rule is
 * deterministic and identical at every frame cadence, because it reads only
 * the step's own events.
 */
export function stepSim(
  player: FlightState,
  world: World | undefined,
  layout: SystemLayout,
  config: FlightConfig,
  intent: ControlIntent,
  commands: readonly Command[],
  dt: number,
  options?: StepOptions,
): SimEvent[] {
  const events = stepFlight(
    player,
    layout,
    config,
    intent,
    commands,
    dt,
    options,
  );
  if (
    world !== undefined &&
    (player.mode === "launching" || player.mode === "inFlight") &&
    !events.some((event) => event.kind === "hyperspaceJumped")
  ) {
    events.push(...stepWorld(world, player, layout, dt));
  }
  return events;
}
