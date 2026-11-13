// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world step (FOUND-11, FOUND-13, D-04, D-14; ARCHITECTURE section 5.3).
 *
 * `stepWorld` runs after the flight step (see `src/sim/sim.ts`) and never
 * touches the `FlightState`: the player comes in read-only through the
 * `WorldView`. Phases, in order: update, think, commit.
 *
 * Every pass over the entities walks ascending ids by index over a length
 * snapshot taken at the start of the pass. An entity spawned during a tick is
 * therefore first updated and first thinks on the next tick, and an entity
 * killed earlier in the tick is skipped (Oolite still updates it,
 * Universe.m:6540; PROJECT.md Key Decisions row (c)). Id order, not Oolite's
 * distance order (Universe.m sortedEntities), is a determinism device (row (a)).
 *
 * Every think draws only from the thinking entity's own "ai" stream, so
 * spawning or killing another entity never changes its draws (D-04).
 */

import { AI_REGISTRY } from "../ai/registry.js";
import type { AiModule } from "../ai/types.js";
import type { SimEvent } from "../events.js";
import type { FlightState } from "../flight/state.js";
import { add, rotate, scale, vec } from "../math.js";
import { createRngState, rngNext } from "../rng.js";
import { createShipControl } from "./control-impl.js";
import type { Entity } from "./entity.js";
import type { SystemLayout } from "./layout.js";
import { createWorldView } from "./view-impl.js";
import type { WorldView } from "./view.js";
import { commitWorld } from "./world.js";
import type { World } from "./world.js";

/** Local forward (-Z) in ship space. */
const FORWARD = vec(0, 0, -1);

/** A registry of AI modules keyed by `AiKey`; injectable for tests. */
export type AiRegistry = Readonly<Record<string, AiModule>>;

/**
 * The module registered under `key`, or undefined. Looked up with
 * `Object.hasOwn`, never by plain indexing: a key such as "constructor"
 * resolves through `Object.prototype` and would throw a TypeError inside the
 * fixed step (T-08-53).
 */
function aiModuleFor(registry: AiRegistry, key: string): AiModule | undefined {
  return Object.hasOwn(registry, key) ? registry[key] : undefined;
}

/**
 * Advance the world one fixed step. `tick` is `player.tick`, which the flight
 * step already advanced this step. Returns the events of this tick.
 */
export function stepWorld(
  world: World,
  player: FlightState,
  layout: SystemLayout,
  dt: number,
  registry: AiRegistry = AI_REGISTRY,
): SimEvent[] {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new RangeError(
      `Wegolite: stepWorld requires a positive finite dt, received ${String(dt)}.`,
    );
  }
  const tick = player.tick;
  const events: SimEvent[] = [];
  // The length snapshot: spawns made during the tick land at indices >= n.
  const n = world.store.live.length;

  // Update. The Phase 8 constant-speed integrator: the entity moves at its
  // desired speed along its facing (local -Z). `Math.max(0, desiredSpeed)` is
  // the non-negative floor for finite speeds; spawnEntity, ShipControl,
  // parseWorldSnapshot and sanitizeEntity provide the NaN and range defence.
  // Phase 12/13 replaces this with Oolite's applyThrust and
  // applyAttitudeChanges (ShipEntity.m:5808 and 5899).
  for (let i = 0; i < n; i += 1) {
    const entity = world.store.live[i];
    if (entity === undefined || entity.dead) continue;
    entity.speed = Math.max(0, entity.nav.desiredSpeed);
    const forward = rotate(entity.orientation, FORWARD);
    entity.position = add(entity.position, scale(forward, entity.speed * dt));
  }

  // Think. The view is built lazily, only when a module is about to run, so a
  // world with no due AI allocates no closures per tick.
  let view: WorldView | undefined;
  for (let i = 0; i < n; i += 1) {
    const entity = world.store.live[i];
    if (entity === undefined || entity.dead || entity.ai === null) continue;
    const ai = entity.ai;
    const wakeDue = ai.wakeTick > 0 && tick >= ai.wakeTick;
    const thinkDue = tick >= ai.nextThinkTick;
    if (!wakeDue && !thinkDue) continue;
    if (wakeDue) ai.wakeTick = 0;
    const module = aiModuleFor(registry, ai.aiKey);
    if (module === undefined) continue;
    view ??= createWorldView(world, player, layout);
    runThink(world, entity, module, view, tick);
  }

  // Commit.
  commitWorld(world);
  return events;
}

/** Run one think for `entity` with its own control and its own stream. */
function runThink(
  world: World,
  entity: Entity,
  module: AiModule,
  view: WorldView,
  tick: number,
): void {
  if (entity.ai === null) return;
  const stream = createRngState(entity.rng.ai);
  module.think({
    self: entity.id,
    view,
    ctl: createShipControl(world, entity.id, tick),
    ai: entity.ai,
    random: () => rngNext(stream),
  });
  entity.rng.ai = stream.s;
}
