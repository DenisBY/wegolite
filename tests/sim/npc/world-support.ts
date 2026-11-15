// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Shared scaffolding of the live-world tests of plan 14-15 (the proximity
 * scenarios and the escort refresh): a player parked far away, a steered ship
 * whose AI never thinks, and a stepping loop that counts the player's tick up
 * like the flight step. Nothing here computes an expected value.
 */

import { readFileSync } from "node:fs";

import type { AiComponent } from "../../../src/sim/ai/types.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, quat, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import type { NpcStepFacts } from "../../../src/sim/npc/stats.js";
import { DT } from "../../../src/sim/time.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { stepWorld } from "../../../src/sim/world/step.js";
import { spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

export const { layout } = laveFixture();

/** A tick past every horizon of the live-world tests, so a think is never due. */
const FAR_TICK = 1_000_000_000;

/** The player, parked a million kilometres away so it never joins a proximity pair. */
export function playerAt(tick = 0): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.tick = tick;
  state.position = vec(1e9, 1e9, 1e9);
  return state;
}

/** An AI that never thinks: the ship is steered by the world step but never decides anything. */
export function aiNever(): AiComponent {
  return {
    aiKey: "test-pilot",
    params: Object.create(null) as AiComponent["params"],
    wakeTick: 0,
    nextThinkTick: FAR_TICK,
  };
}

/** The compiled collision radius of a hull, from the generated hull table. */
export function hullRadius(key: string): number {
  const hulls = JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/ships-hulls.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { key: string; collisionRadius: number }[];
  const row = hulls.find((hull) => hull.key === key);
  if (row === undefined) throw new Error(`no hull ${key}`);
  return row.collisionRadius;
}

/** A half turn about +Y: the ship faces +Z. */
export const FACING_PLUS_Z: Quat = quat(0, 0, 1, 0);

export interface ShipSpec {
  readonly specKey: string;
  readonly position: Vec3;
  readonly orientation?: Quat;
  readonly radius: number;
  readonly speed?: number;
  /** A steered ship (true) or an inert one (false, the default). */
  readonly steered?: boolean;
  readonly ownerId?: number;
  readonly escortSlot?: number;
}

export function spawnShip(world: World, spec: ShipSpec): Entity {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: spec.specKey,
      scanClass: "CLASS_NEUTRAL",
      position: spec.position,
      orientation: spec.orientation ?? identity(),
      radius: spec.radius,
      speed: spec.speed ?? 0,
      ai: spec.steered === true ? aiNever() : null,
      ...(spec.ownerId === undefined ? {} : { ownerId: spec.ownerId }),
      ...(spec.escortSlot === undefined ? {} : { escortSlot: spec.escortSlot }),
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

/** One world step, the player's tick counted up first like the flight step. */
export function stepOnce(
  world: World,
  player: FlightState,
  facts?: NpcStepFacts,
): void {
  player.tick += 1;
  stepWorld(world, player, layout, DT, undefined, facts);
}

/** Send `ship` to `destination` in FLY_TO_DESTINATION at `speed`, `range` metres of desired range. */
export function flyTo(
  ship: Entity,
  destination: Vec3,
  speed: number,
  range = 100,
): void {
  ship.nav.behaviour = "FLY_TO_DESTINATION";
  ship.nav.destination = destination;
  ship.nav.desiredRange = range;
  ship.nav.desiredSpeed = speed;
}
