// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The composed simulation step (FOUND-11, D-14).
 *
 * `stepSim` is the one function the session calls per fixed step: it runs the
 * unchanged `stepFlight` first and then `stepWorld`. The world side never
 * mutates the `FlightState`. The world enters `stepFlight` read-only, as a ship
 * field (WORLD-10): mass lock and jump blockage count the NPC ships, and
 * `stepFlight` never mutates the world.
 */

import { resolveShots, stepPlayerCombat } from "./combat/step.js";
import type { ShotRequest } from "./combat/step.js";
import type { PlayerCombatState } from "./combat/state.js";
import type { Command } from "./commands.js";
import type { SimEvent } from "./events.js";
import type { FlightConfig } from "./flight/config.js";
import type { ControlIntent } from "./flight/controller.js";
import type { FlightState } from "./flight/state.js";
import { stepFlight } from "./flight/step.js";
import type { StepOptions } from "./flight/step.js";
import type { SystemLayout } from "./world/layout.js";
import { createShipField } from "./world/ship-field.js";
import { stepWorld } from "./world/step.js";
import type { World } from "./world/world.js";

/**
 * One fixed step: `stepFlight`, then, only when a combat state is passed,
 * `stepPlayerCombat`, then, only when a world is passed, the player is
 * launching or in flight after the flight step, and the flight events hold no
 * `hyperspaceJumped`, `stepWorld`, then `resolveShots`. Returns the flight
 * events followed by the combat pre-world events, the world events and the
 * resolution events.
 *
 * Jump-step rule (PROJECT.md Key Decisions row (h)): on the step that emits
 * `hyperspaceJumped` the player has already moved to the destination while
 * `layout` is still the origin's, and the arrival replaces the world right
 * after the step, so the old world is not stepped on that tick. The rule is
 * deterministic and identical at every frame cadence, because it reads only
 * the step's own events.
 *
 * Ship field: when a world is passed, one `ShipField` is built from it before
 * the flight step, so the flight step sees the world as it stood at the end of
 * the previous tick (the world is stepped after the flight step). The field is
 * read-only and is built once per tick.
 *
 * Combat (CBT-04 to CBT-07, DOCK-10): the optional trailing `combat` state is
 * the player's views, lasers, shields and energy. A caller that passes none
 * behaves exactly as before, with no combat step and no resolution. Shots are
 * queued before the world step and resolved after it, so a hit lands at one
 * fixed point of the tick and `stepWorld` always sees the energy of the
 * previous tick (RESEARCH A6). The shots are resolved against the world only
 * when the world was stepped this tick.
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
  combat?: PlayerCombatState,
): SimEvent[] {
  const ships =
    world === undefined
      ? undefined
      : createShipField(world, options?.hyperspace?.shipMasses);
  const events = stepFlight(
    player,
    layout,
    config,
    intent,
    commands,
    dt,
    options,
    ships,
  );
  const flightEvents = [...events];

  let shots: ShotRequest[] = [];
  if (combat !== undefined) {
    const stepped = stepPlayerCombat(
      combat,
      player,
      intent,
      commands,
      flightEvents,
      options,
      dt,
    );
    events.push(...stepped.events);
    shots = stepped.shots;
  }

  let worldStepped = false;
  if (
    world !== undefined &&
    (player.mode === "launching" || player.mode === "inFlight") &&
    !flightEvents.some((event) => event.kind === "hyperspaceJumped")
  ) {
    events.push(...stepWorld(world, player, layout, dt));
    worldStepped = true;
  }

  events.push(
    ...resolveShots(world, worldStepped, player, combat, shots, options),
  );
  return events;
}
